-- 0129_notebook_note_coalesce.sql
--
-- AUTOSAVE STOPS MINTING A REVISION PER KEYSTROKE BURST. The composer's
-- autosave (a0d43ba, code only) writes through the ordinary note RPCs, and
-- every one of those APPENDS -- so a student writing for ten minutes turned in
-- an entry whose version list was dozens long. 0119's entry history, which is
-- assembled from those same rows, became a wall of "Edited a note" lines saying
-- nothing, and notebook_delete_note walked a chain far longer than the note it
-- was deleting. That was named as deferred work in the autosave bundle's own
-- history entry; this is it.
--
-- WHAT A REVISION MEANS NOW. One revision per DELIBERATE save, plus one live
-- head that the autosave keeps replacing until somebody makes a deliberate one.
--
--   autosave    true on a revision an autosave wrote that nothing has sealed
--               yet: the next autosave by the same author REPLACES it in place.
--               False is a BOUNDARY -- the next autosave starts a new revision
--               rather than writing across it.
--   updated_at  when a head last absorbed an autosave, or null if it never has.
--               created_at is untouched by a replacement, so a revision still
--               says when it was STARTED and not only when typing stopped.
--
-- THE FLAG MEANS "REPLACEABLE", NOT "WRITTEN BY AN AUTOSAVE", and the
-- difference is what makes one column enough. Sealing clears it; provenance
-- would have to survive sealing, and then the predicate would need a second
-- column to ask the question it actually asks.
--
-- WHAT STAMPS A BOUNDARY, and there are three of them, deliberately:
--
--   * An explicit Save draft or Turn in, through notebook_seal_notes below.
--   * notebook_edit_note called WITHOUT p_autosave -- the entry card's own
--     note editor, which is `autosave: false` and mints a revision an
--     instructor may already have read. It appends, exactly as it always has.
--   * notebook_submit_entry itself, which seals before it stamps submitted_at.
--     That one is the load-bearing case: from the moment an entry is turned in
--     its notes are content somebody else can read, and a replacement in place
--     would rewrite what they read. The client's own seal is a nicety; this is
--     the rule.
--
-- AND THE PREDICATE REFUSES A SUBMITTED ENTRY ANYWAY (_notebook_note_coalescable).
-- That is redundant with the seal above and stays redundant on purpose: two
-- layers, so opening either one alone still refuses. Do not remove one because
-- a test did not notice.
--
-- THE APPEND-ONLY RULE IS NARROWED, NOT ABANDONED, AND THIS IS THE ONE
-- EXCEPTION. `notebook_entry_notes` still has NO update grant and NO update
-- policy: no client can write to `content`, `autosave` or `updated_at` by any
-- door. The replacement happens inside a SECURITY DEFINER function, on a row
-- that is (a) the head of its chain, (b) written by the caller themselves,
-- (c) not deleted, and (d) on an entry NOBODY ELSE CAN READ -- 0118 makes a
-- draft invisible to staff, which is the whole reason the composer is allowed
-- to autosave at all. So the record that append-only exists to protect --
-- what a reader saw -- is never what gets overwritten.
--
-- THE CHAIN RULE FROM 0119 IS UNTOUCHED AND MUST STAY THAT WAY. Deleting a
-- note marks EVERY row sharing `note_id`, never just the head. Coalescing
-- writes no new row and moves no row between chains -- it only ever makes a
-- chain SHORTER -- so there is nothing here a `where note_id = $1` can miss.
-- The backfill takes the same care: it never deletes a chain's revision 1 (the
-- row every other row's `note_id` points at), and it merges two revisions only
-- when their `deleted_at` / `deleted_by` already agree.
--
-- NO EVENT LOG, STILL. The history is assembled from stamps already on the
-- rows (0119), and this adds exactly one more stamp to that set rather than a
-- table to record what happened to a revision.
--
-- Apply manually in the Supabase SQL editor, after 0128.

-- ---------------------------------------------------------------------------
-- 1. The columns, and THE BACKFILL -- both inside one guard on whether the
-- flag column already exists, because the backfill DELETES ROWS AND CANNOT BE
-- UNDONE. Re-pasting a migration is ordinary here; this block must run on the
-- apply that adds the column and never again.
--
-- WHAT THE BACKFILL HAS TO WORK WITH, said plainly: nothing in the table says
-- which of the already-written revisions came from an autosave, because the
-- column that says so is the one this file adds. So it uses the only signal
-- the rows carry, which is TIME, and it bounds itself twice:
--
--   * NOTHING BEFORE THE AUTOSAVE SHIPPED. a0d43ba is dated 2026-08-22
--     11:26:10Z; before that commit existed nothing could write a revision
--     except a person pressing a button, so every earlier revision is
--     deliberate by construction and is left alone.
--   * A RUN IS CONSECUTIVE REVISIONS OF ONE NOTE, BY ONE AUTHOR, EACH WITHIN
--     30 SECONDS OF THE ONE BEFORE IT. The composer's debounce is 800ms and
--     its whole backoff curve tops out at 12.8s, so 30s covers a typing burst
--     including a fully-backed-off retry. A deliberate revision costs opening
--     the entry, opening its note editor, typing and pressing Save changes; it
--     does not land 30 seconds after the previous one, and where it does,
--     collapsing the two is the same granularity decision this file makes for
--     everything written from here on.
--
-- IT KEEPS THE RUN'S FIRST ROW AND GIVES IT THE RUN'S LAST CONTENT, which is
-- exactly what coalescing would have produced had it existed: the surviving
-- revision keeps the id and the created_at it was started with, and takes
-- updated_at from the last write in the run. Keeping the first row rather than
-- the last is also what makes the whole thing safe -- revision 1 is the row
-- `note_id` points at with `on delete cascade`, so deleting it would take the
-- entire chain with it.
--
-- EVERYTHING IT LEAVES BEHIND IS SEALED (`autosave` false, the column
-- default). Nothing written before this migration becomes replaceable
-- retroactively: a student who comes back to an old draft and types gets a new
-- revision, and coalescing starts from there.
-- ---------------------------------------------------------------------------

do $$
declare
	v_existed boolean;
	v_cutoff constant timestamptz := timestamptz '2026-08-22 11:26:10+00';
	v_window constant interval := interval '30 seconds';
	v_rows_before bigint;
	v_rows_after bigint;
	v_runs bigint;
	v_chains bigint;
	v_doomed bigint;
	v_min_revision integer;
	v_bad bigint;
begin
	select exists (
		select 1 from information_schema.columns
		where table_schema = 'public'
			and table_name = 'notebook_entry_notes'
			and column_name = 'autosave'
	) into v_existed;

	if v_existed then
		raise notice '0129: autosave already exists -- columns and BACKFILL both SKIPPED. The backfill deletes rows and is not reversible; it runs on the apply that adds the column and never again.';
		return;
	end if;

	alter table public.notebook_entry_notes add column autosave boolean not null default false;
	alter table public.notebook_entry_notes add column updated_at timestamptz;

	select count(*) into v_rows_before from public.notebook_entry_notes;

	-- THE RUNS, resolved once into a temporary table so every step below acts
	-- on the SAME set of rows. `on commit drop`, so a re-paste in the same
	-- session cannot find a stale one.
	create temporary table _nb_note_runs on commit drop as
	with candidate as (
		select n.id, n.note_id, n.revision, n.author_id, n.created_at,
			n.deleted_at, n.deleted_by, n.content
		from public.notebook_entry_notes n
		where n.created_at >= v_cutoff
	),
	marked as (
		select c.*,
			case when coalesce(
					lag(c.author_id) over w is not distinct from c.author_id
					and lag(c.revision) over w = c.revision - 1
					and c.created_at - lag(c.created_at) over w <= v_window
					-- A DELETED row and a live one are never merged. Deletion
					-- marks a whole chain (0119), so these already agree on every
					-- chain in the table -- and if one ever did not, this refuses
					-- to be the thing that hid it.
					and lag(c.deleted_at) over w is not distinct from c.deleted_at
					and lag(c.deleted_by) over w is not distinct from c.deleted_by,
					false)
				then 0 else 1
			end as run_start
		from candidate c
		window w as (partition by c.note_id order by c.revision)
	),
	grouped as (
		select m.*,
			sum(m.run_start) over (
				partition by m.note_id order by m.revision rows unbounded preceding
			) as run_no
		from marked m
	)
	select g.note_id,
		g.run_no,
		count(*) as revisions,
		min(g.revision) as first_revision,
		max(g.revision) as last_revision,
		(array_agg(g.id order by g.revision))[1] as keep_id,
		(array_agg(g.id order by g.revision desc))[1] as last_id,
		(array_agg(g.content order by g.revision desc))[1] as last_content,
		max(g.created_at) as last_created_at
	from grouped g
	group by g.note_id, g.run_no
	having count(*) > 1;

	select count(*), count(distinct note_id) into v_runs, v_chains from _nb_note_runs;

	if v_runs = 0 then
		raise notice '0129: added autosave and updated_at. Backfill found 0 runs to collapse across % existing revisions -- nothing was deleted.', v_rows_before;
		return;
	end if;

	-- The rows the collapse removes: everything in a run above its first
	-- revision. Named once, as a table, so the assertion below and the delete
	-- itself cannot be looking at different sets.
	create temporary table _nb_note_doomed on commit drop as
	select n.id, n.revision
	from public.notebook_entry_notes n
	join _nb_note_runs r on r.note_id = n.note_id
	where n.revision > r.first_revision and n.revision <= r.last_revision;

	select count(*), min(revision) into v_doomed, v_min_revision from _nb_note_doomed;

	-- A MIGRATION REFUSES RATHER THAN DESTROYS. `note_id` references revision
	-- 1 with `on delete cascade`, so deleting one would silently take its whole
	-- chain -- every revision, live and deleted alike -- with it. Keeping each
	-- run's FIRST row makes that unreachable; this is the assertion that says so
	-- rather than the comment that claims it.
	if v_min_revision is not null and v_min_revision < 2 then
		raise exception
			'0129 backfill would delete a revision 1 (lowest revision in the delete set: %). That row is what every other revision in its chain points at with on delete cascade, so deleting it would destroy the whole note. Migration aborted; nothing was committed.',
			v_min_revision;
	end if;

	select count(*) into v_bad
	from _nb_note_doomed d
	where exists (select 1 from public.notebook_entry_notes n where n.note_id = d.id);
	if v_bad > 0 then
		raise exception
			'0129 backfill would delete % row(s) that another revision names as its note_id. Migration aborted; nothing was committed.',
			v_bad;
	end if;

	-- (a) The keeper adopts the run's LAST content, and stamps when that
	-- content actually arrived. Its own created_at is untouched: the revision
	-- was started when it was started.
	update public.notebook_entry_notes n
	set content = r.last_content, updated_at = r.last_created_at
	from _nb_note_runs r
	where n.id = r.keep_id;

	-- (b) SEVER, THEN RE-POINT, THEN DELETE -- and the order is forced by two
	-- constraints pulling opposite ways. `supersedes_id` cascades, so deleting
	-- any row of a run would take every later revision of that note with it,
	-- including the ones outside the run; and it is UNIQUE, so the revision
	-- that FOLLOWED the run cannot be re-pointed at the keeper while the run's
	-- second row still holds that slot.
	--
	-- So the pointers inside the delete set are nulled first, which is what
	-- frees the slot and what stops the cascade -- and nulling them means
	-- `notebook_entry_notes_chain` (revision 1 or a predecessor) is false for
	-- exactly as long as this block runs. It is dropped and re-added here, in
	-- one transaction: if anything below raises, the drop rolls back with it.
	alter table public.notebook_entry_notes drop constraint notebook_entry_notes_chain;

	update public.notebook_entry_notes n
	set supersedes_id = null
	where n.id in (select d.id from _nb_note_doomed d);

	update public.notebook_entry_notes n
	set supersedes_id = r.keep_id
	from _nb_note_runs r
	where n.supersedes_id = r.last_id;

	delete from public.notebook_entry_notes n
	where n.id in (select d.id from _nb_note_doomed d);

	-- (c) RENUMBER, so `revision` keeps meaning "the Nth version of this note"
	-- -- which is what every revision written from here on will mean, since an
	-- append is always head + 1. Two passes, because the unique index is
	-- checked per row: the offset moves every non-root revision into an empty
	-- range first, so no assignment can land on a number still in use. Revision
	-- 1 is left where it is (it has no predecessor, and the chain CHECK is
	-- about to come back).
	update public.notebook_entry_notes n
	set revision = n.revision + 1000000
	where n.note_id in (select r.note_id from _nb_note_runs r)
		and n.revision > 1;

	update public.notebook_entry_notes n
	set revision = ranked.rn
	from (
		select m.id, row_number() over (partition by m.note_id order by m.revision) as rn
		from public.notebook_entry_notes m
		where m.note_id in (select r.note_id from _nb_note_runs r)
	) ranked
	where n.id = ranked.id and n.revision <> ranked.rn;

	alter table public.notebook_entry_notes
		add constraint notebook_entry_notes_chain
		check (revision = 1 or supersedes_id is not null);

	-- (d) The collapsed chains are contiguous, rooted, and linked. Asserted
	-- rather than assumed: this block rewrote three columns across every chain
	-- it touched, and a chain left half-linked would read as an older draft of
	-- the note in every surface that takes a max().
	select count(*) into v_bad
	from (
		select n.note_id
		from public.notebook_entry_notes n
		where n.note_id in (select r.note_id from _nb_note_runs r)
		group by n.note_id
		having count(*) <> max(n.revision)
			or min(n.revision) <> 1
			or count(*) filter (where n.revision = 1 and n.id = n.note_id and n.supersedes_id is null) <> 1
			or count(*) filter (where n.revision > 1 and n.supersedes_id is null) > 0
	) broken;
	if v_bad > 0 then
		raise exception
			'0129 backfill left % note chain(s) that are not contiguous, rooted and linked. Migration aborted; nothing was committed.',
			v_bad;
	end if;

	select count(*) into v_rows_after from public.notebook_entry_notes;

	raise notice
		'0129: added autosave and updated_at, and collapsed % autosave run(s) across % note chain(s): % revision rows deleted (% -> %). This is NOT reversible.',
		v_runs, v_chains, v_rows_before - v_rows_after, v_rows_before, v_rows_after;
end;
$$;

comment on column public.notebook_entry_notes.autosave is
	'True when this revision may be REPLACED IN PLACE by the next autosave from its own author (0129). False is a boundary: an explicit save, a turn-in, or any edit that was not an autosave. Never client-writable -- there is no update grant or policy on this table.';
comment on column public.notebook_entry_notes.updated_at is
	'When this revision last absorbed an autosave, or null if it never has (0129). created_at still says when the revision was STARTED; a replacement never moves it.';

-- ---------------------------------------------------------------------------
-- 2. THE PREDICATE, in ONE place.
--
-- Four conditions, and each is a different failure if it is dropped:
--
--   autosave              a boundary is never written across.
--   author_id = caller    a replacement rewrites somebody's stored words, so
--                         it is only ever your own. Every note on an entry is
--                         written by that entry's student today, and this is
--                         what keeps the rule true if that stops being so.
--   deleted_at is null    a deleted chain is marked on every row (0119);
--                         replacing content inside one would edit a note that
--                         was removed, which notebook_edit_note refuses
--                         outright one level up.
--   entry not submitted   REDUNDANT with the seal in notebook_submit_entry,
--                         and kept. From the moment an entry is turned in its
--                         notes are readable by staff, and in-place replacement
--                         would rewrite what they read.
--
-- Internal: no grants at all, the `_notebook_*` convention. It is only ever
-- called from the SECURITY DEFINER function below, which runs as the owner.
-- ---------------------------------------------------------------------------

create or replace function public._notebook_note_coalescable(p_head_id uuid, p_uid uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
	select n.autosave
		and n.author_id = p_uid
		and n.deleted_at is null
		and e.submitted_at is null
	from public.notebook_entry_notes n
	join public.notebook_entries e on e.id = n.entry_id
	where n.id = p_head_id;
$$;

revoke all on function public._notebook_note_coalescable(uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- 3. notebook_edit_note learns to replace instead of append.
--
-- THE SIGNATURE TRAP: this gains a parameter, so the two-argument version is
-- DROPPED first. `create or replace` keys on the parameter list, so merely
-- adding one would leave the old arity callable as a second overload -- and
-- two overloads differing only by a defaulted trailing parameter leave
-- PostgREST unable to resolve the call AT ALL, which breaks every note save
-- rather than quietly serving the old one.
--
-- DEPLOY ORDER: apply this file BEFORE the client that names p_autosave. The
-- client names it only when the notes select carrying `updated_at` came back
-- (the `coalescing` rung of $lib/notebook-selects), so a deployment sitting
-- between the two autosaves exactly as it did yesterday.
--
-- 0119's body, extracted and diffed, with the branch added and nothing else
-- changed. p_autosave DEFAULTS FALSE, so the entry card's note editor -- which
-- is `autosave: false` and mints a revision an instructor may already have
-- read -- keeps appending without naming anything.
-- ---------------------------------------------------------------------------

drop function if exists public.notebook_edit_note(uuid, jsonb);

create or replace function public.notebook_edit_note(
	p_note_id uuid,
	p_content jsonb,
	p_autosave boolean default false
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
	v_submitted timestamptz;
	v_new_id uuid := gen_random_uuid();
	v_created timestamptz;
	v_updated timestamptz;
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

	select e.student_id, e.submitted_at into v_student, v_submitted
	from public.notebook_entries e
	where e.id = v_latest.entry_id
	for update;

	-- Ownership first, so someone else's note answers the same way a note that
	-- does not exist would rather than reporting anything about it.
	if v_student is distinct from v_uid then
		raise exception 'That note is not yours.';
	end if;

	-- AFTER the ownership check, never before it: the state of somebody else's
	-- note is not something this function reports on.
	if v_latest.deleted_at is not null then
		raise exception 'That note has been deleted. Restore it before editing it.';
	end if;

	-- THE COALESCING BRANCH (0129). The head is replaced in place, which mints
	-- no row and moves nothing between chains -- so the whole-chain delete in
	-- 0119 has strictly less to walk and nothing new to miss.
	--
	-- `coalesce(..., false)` on both halves: the predicate answers NULL for a
	-- row that is not there, and a NULL in a gate does not stop where it was
	-- written -- it falls through whatever was being guarded. Here the
	-- fall-through is the APPEND below, which is the safe direction, and it is
	-- spelled out rather than relied on.
	if coalesce(p_autosave, false)
		and coalesce(public._notebook_note_coalescable(v_latest.id, v_uid), false)
	then
		update public.notebook_entry_notes n
		set content = p_content, updated_at = now()
		where n.id = v_latest.id
		returning n.created_at, n.updated_at into v_created, v_updated;

		return jsonb_build_object(
			'entry_id', v_latest.entry_id,
			'note_id', p_note_id,
			'revision', v_latest.revision,
			'created_at', v_created,
			'updated_at', v_updated,
			'coalesced', true
		);
	end if;

	insert into public.notebook_entry_notes
		(id, entry_id, note_id, revision, supersedes_id, content, author_id, autosave)
	values (
		v_new_id, v_latest.entry_id, p_note_id, v_latest.revision + 1, v_latest.id, p_content, v_uid,
		coalesce(p_autosave, false) and v_submitted is null
	)
	returning created_at into v_created;

	return jsonb_build_object(
		'entry_id', v_latest.entry_id,
		'note_id', p_note_id,
		'revision', v_latest.revision + 1,
		'created_at', v_created,
		'coalesced', false
	);
end;
$$;

revoke all on function public.notebook_edit_note(uuid, jsonb, boolean) from public;
grant execute on function public.notebook_edit_note(uuid, jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. notebook_add_note marks the chain it STARTS.
--
-- Same signature trap, same drop. A note's first revision is written by
-- whichever door made it, and if that door was an autosave then revision 1 is
-- the live head an autosave may replace -- otherwise a draft written entirely
-- by autosave would still carry two revisions, one of them a snapshot of
-- whatever had been typed 800ms in.
--
-- 0078's body, extracted and diffed. The `perform 1 ... for update` becomes a
-- `select ... into` for one reason: the row's submitted_at decides whether the
-- new revision is replaceable at all.
-- ---------------------------------------------------------------------------

drop function if exists public.notebook_add_note(uuid, jsonb);

create or replace function public.notebook_add_note(
	p_entry_id uuid,
	p_content jsonb,
	p_autosave boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_note_id uuid := gen_random_uuid();
	v_submitted timestamptz;
	v_created timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not public._notebook_note_content_ok(p_content) then
		raise exception 'That note could not be saved: its content is not a valid note.';
	end if;

	select e.submitted_at into v_submitted
	from public.notebook_entries e
	where e.id = p_entry_id and e.student_id = v_uid
	for update;
	if not found then
		raise exception 'That entry does not exist or is not yours.';
	end if;

	insert into public.notebook_entry_notes
		(id, entry_id, note_id, revision, supersedes_id, content, author_id, autosave)
	values (
		v_note_id, p_entry_id, v_note_id, 1, null, p_content, v_uid,
		coalesce(p_autosave, false) and v_submitted is null
	)
	returning created_at into v_created;

	return jsonb_build_object(
		'entry_id', p_entry_id,
		'note_id', v_note_id,
		'revision', 1,
		'created_at', v_created
	);
end;
$$;

revoke all on function public.notebook_add_note(uuid, jsonb, boolean) from public;
grant execute on function public.notebook_add_note(uuid, jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. notebook_create_note_entry marks the revision it creates WITH the entry.
--
-- The composer's very first autosave is a CREATE -- there is no draft yet --
-- so without this the one revision that matters most would be a boundary and
-- every ten-minute writing session would end with two revisions instead of one.
--
-- 0118's body, extracted and diffed, with the flag on the note insert and
-- nothing else changed. The six-argument version is dropped first (the
-- signature trap again); this is the fourth time this function has gained a
-- parameter and the drop has been there every time.
-- ---------------------------------------------------------------------------

drop function if exists public.notebook_create_note_entry(jsonb, text, uuid, uuid, uuid, boolean);

create or replace function public.notebook_create_note_entry(
	p_content jsonb,
	p_custom_label text default null,
	p_section_id uuid default null,
	p_folder_id uuid default null,
	p_session_id uuid default null,
	p_submitted boolean default true,
	p_autosave boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_label text := nullif(btrim(coalesce(p_custom_label, '')), '');
	v_section uuid;
	v_entry_id uuid;
	v_note_id uuid := gen_random_uuid();
	v_uploaded timestamptz;
	v_submitted timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not public._notebook_note_content_ok(p_content) then
		raise exception 'That note could not be saved: its content is not a valid note.';
	end if;
	if p_folder_id is not null and not exists (
		select 1 from public.notebook_folders f
		where f.id = p_folder_id and f.student_id = v_uid
	) then
		raise exception 'That folder does not exist or is not yours.';
	end if;

	if p_session_id is not null then
		-- EXACTLY the resolution notebook_create_entry uses, called rather than
		-- restated: one canonical check-in runs in N sections since 0098, and the
		-- composite FK on notebook_entries only accepts a real (session, section)
		-- posting pair.
		v_section := public._notebook_resolve_session_section(p_session_id, p_section_id, v_uid);
	else
		v_section := p_section_id;
		-- 0094's rule, unchanged and deliberately NOT an enrollment check.
		if v_section is not null and not exists (
			select 1 from public.classroom_sections s where s.id = v_section
		) then
			raise exception 'That section does not exist.';
		end if;
	end if;

	if coalesce(p_submitted, true) then
		v_submitted := now();
	end if;

	insert into public.notebook_entries
		(student_id, section_id, session_id, custom_label, folder_id, submitted_at)
	values (v_uid, v_section, p_session_id, v_label, p_folder_id, v_submitted)
	returning id, upload_timestamp into v_entry_id, v_uploaded;

	insert into public.notebook_entry_notes
		(id, entry_id, note_id, revision, supersedes_id, content, author_id, autosave)
	values (
		v_note_id, v_entry_id, v_note_id, 1, null, p_content, v_uid,
		coalesce(p_autosave, false) and v_submitted is null
	);

	return jsonb_build_object(
		'entry_id', v_entry_id,
		'note_id', v_note_id,
		'session_id', p_session_id,
		'section_id', v_section,
		'folder_id', p_folder_id,
		'status', 'compliant',
		'submitted_at', v_submitted,
		'upload_timestamp', v_uploaded
	);
end;
$$;

revoke all on function public.notebook_create_note_entry(jsonb, text, uuid, uuid, uuid, boolean, boolean) from public;
grant execute on function public.notebook_create_note_entry(jsonb, text, uuid, uuid, uuid, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. STAMPING A BOUNDARY, as its own act.
--
-- WHY THIS IS A FUNCTION RATHER THAN A SIDE EFFECT OF WRITING. An explicit
-- Save draft usually has nothing to write -- the autosave already sent those
-- exact words, and the composer compares against what the server holds before
-- it sends anything. So the click that a student means as "keep this version"
-- would otherwise leave the head replaceable and the next keystroke would
-- write straight across it. This is the one thing such a click has to do.
--
-- IT IS AN ENTRY-WIDE STAMP, not a per-note one: an entry can hold several
-- notes and a save is a save of the entry. It clears the flag on every row of
-- the entry rather than only on the heads -- the flag means REPLACEABLE and
-- only a head is ever consulted, so there is nothing a non-head row's flag can
-- mean afterwards.
-- ---------------------------------------------------------------------------

create or replace function public.notebook_seal_notes(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_entry public.notebook_entries%rowtype;
	v_sealed bigint;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_entry_id is null then
		raise exception 'Which entry?';
	end if;

	select e.* into v_entry
	from public.notebook_entries e
	where e.id = p_entry_id and e.student_id = v_uid
	for update;
	if not found then
		raise exception 'That entry does not exist or is not yours.';
	end if;

	update public.notebook_entry_notes n
	set autosave = false
	where n.entry_id = p_entry_id and n.autosave;
	get diagnostics v_sealed = row_count;

	return jsonb_build_object(
		'ok', true,
		'entry_id', p_entry_id,
		'sealed', v_sealed
	);
end;
$$;

revoke all on function public.notebook_seal_notes(uuid) from public;
grant execute on function public.notebook_seal_notes(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. TURNING IN SEALS, and this is the boundary that actually matters.
--
-- 0119's body, extracted and diffed, with one `perform` added before the
-- stamp. A nested SECURITY DEFINER call is the reuse mechanism here -- it reads
-- the same session's claims, so it is authorized as the same caller and
-- re-checks ownership itself -- rather than a second copy of the update.
--
-- BEFORE the stamp, not after: submitted_at is what the predicate in section 2
-- reads, so sealing first means the two layers agree at every instant rather
-- than only at the end of the transaction.
-- ---------------------------------------------------------------------------

create or replace function public.notebook_submit_entry(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_entry public.notebook_entries%rowtype;
	v_photos bigint;
	v_notes bigint;
	v_submitted_at timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_entry_id is null then
		raise exception 'Which entry?';
	end if;

	select e.* into v_entry
	from public.notebook_entries e
	where e.id = p_entry_id and e.student_id = v_uid
	for update;
	if not found then
		raise exception 'That entry does not exist or is not yours.';
	end if;

	if v_entry.submitted_at is not null then
		raise exception 'That entry has already been turned in.';
	end if;

	select count(*) into v_photos
	from public.notebook_entry_photos p
	where p.entry_id = p_entry_id and p.removed_at is null;

	select count(*) into v_notes
	from public.notebook_entry_notes n
	where n.entry_id = p_entry_id and n.deleted_at is null;

	if v_photos = 0 and v_notes = 0 then
		raise exception 'This entry has nothing in it to turn in. Add a photo or write a note first.';
	end if;

	-- 0129: every note on this entry becomes a boundary. From the next line on
	-- it is readable by staff, and nothing may replace in place what they read.
	perform public.notebook_seal_notes(p_entry_id);

	update public.notebook_entries e
	set submitted_at = now()
	where e.id = p_entry_id
	returning e.submitted_at into v_submitted_at;

	return jsonb_build_object(
		'ok', true,
		'entry_id', p_entry_id,
		'submitted_at', v_submitted_at
	);
end;
$$;

revoke all on function public.notebook_submit_entry(uuid) from public;
grant execute on function public.notebook_submit_entry(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. "Last worked on" learns about a replacement.
--
-- 0119's definition with one expression widened. `last_activity_at` means when
-- an entry was last worked on, and a coalesced head carries that in
-- updated_at -- so without this a draft being written into for ten minutes
-- would report the moment its first autosave landed and then sit still while
-- somebody typed.
--
-- Still `security_invoker`, so it adds no reach; the grant is re-issued because
-- dropping the view drops it.
-- ---------------------------------------------------------------------------

drop view if exists public.notebook_entry_activity;
create view public.notebook_entry_activity
with (security_invoker = true) as
select
	e.id,
	e.student_id,
	greatest(
		e.upload_timestamp,
		(select max(coalesce(n.updated_at, n.created_at))
			from public.notebook_entry_notes n
			where n.entry_id = e.id and n.deleted_at is null),
		(select max(p.created_at)
			from public.notebook_entry_photos p
			where p.entry_id = e.id and p.removed_at is null)
	) as last_activity_at
from public.notebook_entries e
where e.deleted_at is null;

grant select on public.notebook_entry_activity to authenticated;

-- ---------------------------------------------------------------------------
-- 9. What this file did NOT widen, recorded so the next reader does not have
-- to re-derive it.
--
-- `_notebook_student_payload` (0119) still projects a note's created_at and
-- not its updated_at. That payload feeds the two STAFF surfaces, which only
-- ever read entries that are turned in -- and a turned-in entry's notes are all
-- sealed, so updated_at there can only describe writing that happened before
-- anybody could see it. Widening a payload is a disclosure decision, and this
-- one buys nothing.
--
-- The review console's own select ($lib/notebook-selects) is unchanged for the
-- same reason.
--
-- `notebook_unsubmit_entry` does NOT unseal. Pulling an entry back to draft
-- makes it editable again; it does not make the version an instructor may
-- already have read replaceable again.
-- ---------------------------------------------------------------------------
