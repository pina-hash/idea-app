-- 0078: notebook entries carry real WRITTEN NOTES, added over time, revised
-- without ever overwriting what they said before.
--
-- WHAT THIS REPLACES. 0075 opened up a "just write a note" tier, but it had
-- nowhere to put the writing: the note went into notebook_entries.custom_label,
-- a 200-character column that exists to TITLE an entry. That conflated two
-- different things, capped a student's thinking at a tweet, and gave one entry
-- exactly one note forever. From here:
--
--   * custom_label goes back to being a short title, and nothing else. Its
--     200-character CHECK and every existing use of it are untouched -- the
--     narrowing is in what the app puts there, not in the column.
--   * A note is a notebook_entry_notes row. An entry can hold many, written
--     days apart, and each one can be revised.
--
-- ONE ROW PER REVISION, NEVER AN UPDATE. Editing a note INSERTS a new row that
-- supersedes the old one; the old text stays exactly as it was written. That is
-- the append-only discipline this schema already runs on -- coin_transactions
-- has no mutable balance, tournament_match_events is insert-only,
-- notebook_entry_photos only ever gains rows -- applied to the one kind of
-- content a student can change after an instructor has read it. There is no
-- UPDATE or DELETE grant or policy on this table at all.
--
-- THE CHAIN, and why it is shaped this way. Two columns carry it:
--
--   note_id   the LOGICAL note's stable identity: the id of its own first
--             revision (a self-reference; revision 1 inserts note_id = id).
--             This is what "a note" means to every caller -- notebook_edit_note
--             takes it, and the UI groups on it -- so a note's identity never
--             changes when it is edited.
--   revision  1, 2, 3 ... within that note. `unique (note_id, revision)` is the
--             same shape notebook_entry_photos already uses for
--             `unique (entry_id, sequence_order)`, and it makes "the current
--             text" a plain max() rather than a flag anyone has to maintain.
--
-- supersedes_id points at the exact row a revision replaced, and is UNIQUE, so
-- a chain can never fork into two "current" versions. It is redundant with
-- (note_id, revision) by design: the pointer is the readable statement of what
-- happened, the pair is the constraint that enforces it, and two CHECKs keep
-- them agreeing (revision 1 <=> no predecessor <=> note_id = id).
--
-- WHICH VERSION IS CURRENT IS DERIVED, NEVER STORED. There is no `is_current`
-- column and no view for it: the highest revision in a chain is the one that
-- counts, and every surface reads the whole chain anyway because it also shows
-- the history. Same reasoning as coin_balances summing its ledger and
-- coin_contract_status computing open/full/complete.
--
-- CONTENT IS A TYPED DOCUMENT, NOT HTML. content is jsonb holding the closed
-- shape in src/lib/notebook-notes.ts: an array of blocks (paragraph, bulleted
-- list, numbered list) whose leaves are text runs carrying at most bold, italic
-- and an http/https/mailto link. The editor's output is normalized into that
-- shape server-side (src/lib/server/notebook-notes.ts) before it is sent here,
-- and it is rendered by walking it into real elements -- there is no `{@html}`
-- anywhere in the note path.
--
-- _notebook_note_content_ok below is the THIRD gate, and it exists because the
-- first one is not a boundary on its own: these RPCs are granted to
-- `authenticated` like every other student write, so a student can reach them
-- through PostgREST without going near the route that sanitizes. So the
-- database validates the SHAPE itself -- unknown block types, unknown keys,
-- non-text runs and non-http links are all rejected here -- and a caller who
-- skips the route can at worst store text that renders as text.
--
-- EDITING IS REFUSED OUTRIGHT ON A SESSION-LINKED ENTRY, in the RPC. A
-- scheduled check-in exists because an instructor asked for it and reviews what
-- arrives; letting a student rewrite that after the fact would change what was
-- reviewed. A free-form entry is a personal record and stays editable (with its
-- history kept regardless). This lives in notebook_edit_note, not in the UI --
-- the platform rule that nothing gradeable is gated client-side only.
--
-- Apply manually in the Supabase SQL editor, after 0077.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

create table if not exists public.notebook_entry_notes (
	id uuid primary key default gen_random_uuid(),
	entry_id uuid not null references public.notebook_entries (id) on delete cascade,
	-- The logical note: the id of revision 1. Self-referencing, so revision 1
	-- inserts note_id = id (the row exists by the time the FK is checked).
	note_id uuid not null references public.notebook_entry_notes (id) on delete cascade,
	revision integer not null check (revision >= 1),
	-- The exact row this one replaced. Unique, so a chain never forks; null
	-- only on revision 1 (nulls are distinct to a unique index, so every note's
	-- first revision is fine).
	supersedes_id uuid unique references public.notebook_entry_notes (id) on delete cascade,
	content jsonb not null,
	author_id uuid not null references auth.users (id) on delete cascade,
	-- Server-set, exactly like notebook_entries.upload_timestamp: no RPC takes
	-- it as a parameter, so it is never client-writable.
	created_at timestamptz not null default now(),
	unique (note_id, revision),
	-- Revision 1 is the root of its own chain and replaced nothing...
	constraint notebook_entry_notes_root check (
		revision > 1 or (note_id = id and supersedes_id is null)
	),
	-- ...and every later revision replaced something.
	constraint notebook_entry_notes_chain check (
		revision = 1 or supersedes_id is not null
	)
);

create index if not exists notebook_entry_notes_entry_idx
	on public.notebook_entry_notes (entry_id, created_at);
create index if not exists notebook_entry_notes_note_idx
	on public.notebook_entry_notes (note_id, revision desc);

-- ---------------------------------------------------------------------------
-- 2. Content shape validation.
--
-- A whitelist, expressed as a rejection: anything this does not explicitly
-- allow makes it false. Both helpers are internal (no grants at all, the
-- _notebook_log convention) and are only ever reached from the SECURITY
-- DEFINER RPCs below, which run as the owner.
-- ---------------------------------------------------------------------------

-- One inline run: { text, bold?, italic?, href? }. Returns its character
-- count, or -1 for anything that is not a valid run.
create or replace function public._notebook_note_run_len(p_run jsonb)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_text text;
begin
	if p_run is null or jsonb_typeof(p_run) <> 'object' then
		return -1;
	end if;
	if exists (
		select 1 from jsonb_object_keys(p_run) k
		where k not in ('text', 'bold', 'italic', 'href')
	) then
		return -1;
	end if;
	if jsonb_typeof(p_run -> 'text') <> 'string' then
		return -1;
	end if;
	-- The flags are present-and-true or absent; nothing else.
	if p_run ? 'bold' and p_run -> 'bold' <> 'true'::jsonb then
		return -1;
	end if;
	if p_run ? 'italic' and p_run -> 'italic' <> 'true'::jsonb then
		return -1;
	end if;
	if p_run ? 'href' then
		if jsonb_typeof(p_run -> 'href') <> 'string' then
			return -1;
		end if;
		-- http/https/mailto only, and no whitespace or control characters
		-- (which is how a scheme gets smuggled past a prefix check).
		if p_run ->> 'href' !~ '^(https?://|mailto:)[^[:space:][:cntrl:]]+$' then
			return -1;
		end if;
	end if;

	v_text := p_run ->> 'text';
	return char_length(v_text);
end;
$$;

revoke all on function public._notebook_note_run_len(jsonb) from public;

-- A whole note document. See src/lib/notebook-notes.ts for the shape; this is
-- the same contract stated as a gate.
create or replace function public._notebook_note_content_ok(p_content jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_block jsonb;
	v_item jsonb;
	v_run jsonb;
	v_type text;
	v_len integer;
	v_total integer := 0;
begin
	if p_content is null or jsonb_typeof(p_content) <> 'array' then
		return false;
	end if;
	if jsonb_array_length(p_content) = 0 or jsonb_array_length(p_content) > 2000 then
		return false;
	end if;

	for v_block in select value from jsonb_array_elements(p_content) loop
		if jsonb_typeof(v_block) <> 'object' then
			return false;
		end if;
		v_type := v_block ->> 'type';

		if v_type = 'p' then
			if exists (
				select 1 from jsonb_object_keys(v_block) k where k not in ('type', 'runs')
			) then
				return false;
			end if;
			if jsonb_typeof(v_block -> 'runs') <> 'array' then
				return false;
			end if;
			for v_run in select value from jsonb_array_elements(v_block -> 'runs') loop
				v_len := public._notebook_note_run_len(v_run);
				if v_len < 0 then
					return false;
				end if;
				v_total := v_total + v_len;
			end loop;

		elsif v_type in ('ul', 'ol') then
			if exists (
				select 1 from jsonb_object_keys(v_block) k where k not in ('type', 'items')
			) then
				return false;
			end if;
			if jsonb_typeof(v_block -> 'items') <> 'array' then
				return false;
			end if;
			for v_item in select value from jsonb_array_elements(v_block -> 'items') loop
				if jsonb_typeof(v_item) <> 'array' then
					return false;
				end if;
				for v_run in select value from jsonb_array_elements(v_item) loop
					v_len := public._notebook_note_run_len(v_run);
					if v_len < 0 then
						return false;
					end if;
					v_total := v_total + v_len;
				end loop;
			end loop;

		else
			-- An unknown block type is the whole point of this function.
			return false;
		end if;
	end loop;

	-- Matches NOTE_MAX_CHARS in src/lib/notebook-notes.ts. A note with no text
	-- at all is a mistake, not a note.
	return v_total > 0 and v_total <= 20000;
end;
$$;

revoke all on function public._notebook_note_content_ok(jsonb) from public;

-- ---------------------------------------------------------------------------
-- 3. Privileges + RLS. SELECT only, and it delegates to the SAME
-- notebook_can_read_entry (0069) the photos do, so a note can never be visible
-- to someone who cannot see the entry it belongs to.
-- ---------------------------------------------------------------------------

revoke all on public.notebook_entry_notes from anon, authenticated;
grant select on public.notebook_entry_notes to authenticated;
alter table public.notebook_entry_notes enable row level security;

drop policy if exists "notebook notes follow entry visibility" on public.notebook_entry_notes;
create policy "notebook notes follow entry visibility"
	on public.notebook_entry_notes
	for select
	to authenticated
	using (public.notebook_can_read_entry(entry_id));

-- ---------------------------------------------------------------------------
-- 4. Write RPCs. Owner-only, checked inside the function against auth.uid().
-- ---------------------------------------------------------------------------

-- Creates a free-form entry whose content IS a written note: no photo, no
-- session, an optional short title.
--
-- WHY THIS IS ITS OWN RPC rather than notebook_create_entry followed by
-- notebook_add_note. 0075's rule is that a free-form entry needs a photo or a
-- label; a titleless note satisfies neither, so the sequence would either be
-- refused or force this migration to relax a rule it has no quarrel with. As
-- one function the entry and its first note are one transaction, so a failed
-- note cannot leave an empty entry stranded in the student's feed.
create or replace function public.notebook_create_note_entry(
	p_content jsonb,
	p_custom_label text default null,
	p_section_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_label text := nullif(btrim(coalesce(p_custom_label, '')), '');
	v_entry_id uuid;
	v_note_id uuid := gen_random_uuid();
	v_uploaded timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not public._notebook_note_content_ok(p_content) then
		raise exception 'That note could not be saved: its content is not a valid note.';
	end if;
	if p_section_id is not null and not exists (
		select 1 from public.notebook_sections s where s.id = p_section_id
	) then
		raise exception 'That section does not exist.';
	end if;

	insert into public.notebook_entries (student_id, section_id, session_id, custom_label)
	values (v_uid, p_section_id, null, v_label)
	returning id, upload_timestamp into v_entry_id, v_uploaded;

	insert into public.notebook_entry_notes
		(id, entry_id, note_id, revision, supersedes_id, content, author_id)
	values (v_note_id, v_entry_id, v_note_id, 1, null, p_content, v_uid);

	return jsonb_build_object(
		'entry_id', v_entry_id,
		'note_id', v_note_id,
		'status', 'compliant',
		'upload_timestamp', v_uploaded
	);
end;
$$;

revoke all on function public.notebook_create_note_entry(jsonb, text, uuid) from public;
grant execute on function public.notebook_create_note_entry(jsonb, text, uuid) to authenticated;

-- Adds ANOTHER note to an existing entry. Entry owner only.
--
-- This is what makes an entry something you keep adding to rather than
-- something you file once: notes written days apart all belong to the one
-- entry, exactly as extra photos already do.
--
-- It deliberately does NOT touch the entry's status, unlike notebook_add_photo,
-- which flips a flagged entry to 'pending_review'. A flag asks for a PAGE --
-- "not dated", "hard to read" -- and a note is not a page, so writing one is
-- not a resubmission. Adding the photo still is.
create or replace function public.notebook_add_note(
	p_entry_id uuid,
	p_content jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_note_id uuid := gen_random_uuid();
	v_created timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not public._notebook_note_content_ok(p_content) then
		raise exception 'That note could not be saved: its content is not a valid note.';
	end if;

	perform 1
	from public.notebook_entries e
	where e.id = p_entry_id and e.student_id = v_uid
	for update;
	if not found then
		raise exception 'That entry does not exist or is not yours.';
	end if;

	insert into public.notebook_entry_notes
		(id, entry_id, note_id, revision, supersedes_id, content, author_id)
	values (v_note_id, p_entry_id, v_note_id, 1, null, p_content, v_uid)
	returning created_at into v_created;

	return jsonb_build_object(
		'entry_id', p_entry_id,
		'note_id', v_note_id,
		'revision', 1,
		'created_at', v_created
	);
end;
$$;

revoke all on function public.notebook_add_note(uuid, jsonb) from public;
grant execute on function public.notebook_add_note(uuid, jsonb) to authenticated;

-- Revises a note: a NEW row superseding the current one. Nothing is
-- overwritten and nothing is deleted, so every earlier version stays readable.
--
-- p_note_id is the LOGICAL note (notebook_entry_notes.note_id), not a
-- particular revision, so a caller never has to know which revision is current
-- -- and an edit racing another edit collides on `unique (note_id, revision)`
-- rather than silently losing one of them.
--
-- REFUSES OUTRIGHT on a session-linked entry. See the header: a check-in is
-- reviewed work, and this is the rule's only home.
create or replace function public.notebook_edit_note(
	p_note_id uuid,
	p_content jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_latest public.notebook_entry_notes%rowtype;
	v_student uuid;
	v_session uuid;
	v_new_id uuid := gen_random_uuid();
	v_created timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not public._notebook_note_content_ok(p_content) then
		raise exception 'That note could not be saved: its content is not a valid note.';
	end if;

	select n.* into v_latest
	from public.notebook_entry_notes n
	where n.note_id = p_note_id
	order by n.revision desc
	limit 1
	for update;
	if not found then
		raise exception 'That note does not exist.';
	end if;

	select e.student_id, e.session_id into v_student, v_session
	from public.notebook_entries e
	where e.id = v_latest.entry_id
	for update;

	-- Ownership first, so someone else's note answers the same way a note that
	-- does not exist would rather than reporting anything about it.
	if v_student is distinct from v_uid then
		raise exception 'That note is not yours.';
	end if;
	if v_session is not null then
		raise exception 'A note on a scheduled check-in cannot be edited. Add another note to this entry instead.';
	end if;

	insert into public.notebook_entry_notes
		(id, entry_id, note_id, revision, supersedes_id, content, author_id)
	values (v_new_id, v_latest.entry_id, p_note_id, v_latest.revision + 1, v_latest.id, p_content, v_uid)
	returning created_at into v_created;

	return jsonb_build_object(
		'entry_id', v_latest.entry_id,
		'note_id', p_note_id,
		'revision', v_latest.revision + 1,
		'created_at', v_created
	);
end;
$$;

revoke all on function public.notebook_edit_note(uuid, jsonb) from public;
grant execute on function public.notebook_edit_note(uuid, jsonb) to authenticated;
