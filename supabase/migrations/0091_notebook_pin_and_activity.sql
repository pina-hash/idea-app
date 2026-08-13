-- 0091: notebook PINNING, plus a derived RECENT-ACTIVITY timestamp the feed
-- can sort by.
--
-- WHY. 0088 gave the notebook folders and a collapsed feed, which answers
-- "where is that entry" for a student who remembers how they filed it. Two
-- things it does not answer:
--
--   * "the one I keep coming back to". A working entry -- the current build
--     log, the page an instructor flagged -- sinks under newer ones within a
--     week, and no amount of filing raises it, because a folder is a place,
--     not a priority. PINNING is that priority, and it is deliberately
--     ORTHOGONAL to filing: a pin is a property of the ENTRY, so a pinned
--     entry floats to the top of All, of Unfiled, and of its own folder
--     alike. Pinning per-folder would mean an entry could be pinned in one
--     view and buried in another, which is exactly the kind of state nobody
--     can keep in their head.
--   * "the one I was just working on". The feed's only order is the entry's
--     own upload_timestamp, so an entry created in September that was added
--     to yesterday sits below an untouched entry from last week. Real
--     notebook work is REVISITED -- 0078 made notes editable and photos have
--     only ever been added, never replaced -- so an entry's own creation
--     stamp stopped being the whole story the moment those landed.
--
-- pinned_at IS A TIMESTAMP, NOT A BOOLEAN, so several pinned entries have a
-- stable order among themselves (most recently pinned first) rather than
-- falling back on whatever the secondary sort happens to be. It costs the
-- same column and answers a question a boolean cannot.
--
-- ACTIVITY IS A VIEW, NOT A STORED COLUMN. Every other "current state" in
-- this schema is derived rather than maintained -- which note revision is
-- current (0078), a coin balance (0070), whether an eating pass is held --
-- and for the same reason: a stored last_activity_at needs a trigger on two
-- tables, and the failure mode of a trigger that stops firing is a feed that
-- sorts subtly wrong forever with nothing to catch it. The view cannot drift,
-- because there is nothing for it to drift from.
--
-- It is security_invoker, so the caller's own RLS decides which entries and
-- which notes/photos it can see: the view adds NO reach. A student sees their
-- own entries; section staff see, through notebook_can_read_entry, exactly
-- the entries they could already read.
--
-- ZERO CLIENT WRITE GRANTS, as everywhere else in the notebook: the view is
-- select-only and the one write is a SECURITY DEFINER RPC that resolves the
-- caller from auth.uid() and takes NO student id, so "you can only pin your
-- own entries" is a property of the signature rather than a check that could
-- be got wrong.
--
-- IDEMPOTENT, and the test suite runs this exact file twice to prove it.
-- 0088 shipped a drop-then-add on a constraint another object depended on and
-- failed on its second run in the live SQL editor; migrations here are pasted
-- in by hand, so a re-run is an ordinary thing that happens and a file that
-- only works once fails at exactly that moment.
--
-- Apply manually in the Supabase SQL editor, after 0090.

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------

alter table public.notebook_entries
	add column if not exists pinned_at timestamptz;

-- Partial: only pinned rows are ever looked up this way, and a student has a
-- handful of them against a term's worth of entries.
create index if not exists notebook_entries_pinned_idx
	on public.notebook_entries (student_id, pinned_at desc)
	where pinned_at is not null;

-- ---------------------------------------------------------------------------
-- 2. Pin / unpin
-- ---------------------------------------------------------------------------

-- One function for both directions (the notebook_upsert_folder convention).
--
-- Pinning an ALREADY-pinned entry keeps its existing stamp rather than
-- refreshing it: the pin order is "when you decided this mattered", and a
-- repeated call -- a double click, a retry after a dropped response -- should
-- not silently reshuffle the top of the feed. Unpinning clears it outright,
-- so re-pinning later is a genuinely new decision and sorts as one.
create or replace function public.notebook_set_entry_pinned(
	p_entry_id uuid,
	p_pinned boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_pinned_at timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_entry_id is null then
		raise exception 'Which entry?';
	end if;

	-- The WHERE clause is the authorization: an entry that is not the
	-- caller's simply is not matched, and is then reported as not found. No
	-- separate ownership read, and nothing to get out of step with it.
	update public.notebook_entries e
	set pinned_at = case
		when coalesce(p_pinned, false) then coalesce(e.pinned_at, now())
		else null
	end
	where e.id = p_entry_id and e.student_id = v_uid
	returning e.pinned_at into v_pinned_at;

	-- FOUND, not a null check on v_pinned_at: unpinning legitimately returns
	-- null, so the value cannot tell "no such row" from "cleared it".
	if not found then
		raise exception 'That entry does not exist or is not yours.';
	end if;

	return jsonb_build_object(
		'ok', true,
		'entry_id', p_entry_id,
		'pinned_at', v_pinned_at
	);
end;
$$;

revoke all on function public.notebook_set_entry_pinned(uuid, boolean) from public;
grant execute on function public.notebook_set_entry_pinned(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Recent activity
-- ---------------------------------------------------------------------------

-- The most recent of: the entry's own creation, its newest note revision, and
-- its newest photo. 0078 notes are append-only (an edit INSERTS a revision),
-- so max(created_at) over the note rows is genuinely "last written", not
-- "last created and never touched since"; photos have only ever been added.
--
-- Dropped and recreated rather than `create or replace view`, which refuses a
-- changed column list -- so a later revision of this file re-applies cleanly
-- over an older shape instead of erroring on it.
--
-- GREATEST ignores nulls in Postgres, so an entry with no notes and no photos
-- falls back to its own upload_timestamp, which is not null.
drop view if exists public.notebook_entry_activity;
create view public.notebook_entry_activity
with (security_invoker = true) as
select
	e.id,
	e.student_id,
	greatest(
		e.upload_timestamp,
		(select max(n.created_at) from public.notebook_entry_notes n where n.entry_id = e.id),
		(select max(p.created_at) from public.notebook_entry_photos p where p.entry_id = e.id)
	) as last_activity_at
from public.notebook_entries e;

grant select on public.notebook_entry_activity to authenticated;
