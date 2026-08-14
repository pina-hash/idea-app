-- 0098_notebook_session_postings.sql
-- Notebook check-ins become multi-section, exactly the way Classroom items
-- already are.
--
-- THE PROBLEM. 0069 gave notebook_sessions a single `section_id`, so one
-- scheduled check-in belonged to exactly one class. IDEA209H runs three
-- sections on identical pacing, which made a five-check-in unit fifteen manual
-- creations -- with three chances per check-in to mistype a date and
-- desynchronize sections that are required to stay identical. There was no way
-- to say "this is the same check-in" at all.
--
-- THE SHAPE, borrowed rather than invented. This is 0085's canonical-record /
-- posting split applied a second time, and it is deliberately the SAME idea
-- with the same names: public.notebook_sessions is the CANONICAL record
-- carrying every authored field (unit number, date, label), and a POSTING
-- (public.notebook_session_postings) is nothing but "this check-in runs in this
-- class". Editing edits the canonical record, so every section it is posted to
-- sees the change in the same statement -- one date, one label, three grids.
-- A posting carries no state of its own ON PURPOSE, for the reason 0085 states:
-- the moment a posting could hold its own date, the copies could drift again
-- and this whole migration would be undone.
--
-- The RPCs mirror their Classroom counterparts one for one, so the two read as
-- one idea:
--
--   classroom_create_item / classroom_update_item -> notebook_admin_upsert_session
--   classroom_add_postings                        -> notebook_add_session_postings
--   classroom_remove_posting                      -> notebook_remove_session_posting
--   _classroom_check_publish_targets              -> _notebook_check_session_targets
--   _classroom_manages_item                       -> _notebook_manages_session
--
-- WHAT THIS DOES TO EXISTING ROWS, and it is deliberately the least it can do.
-- Live data exists -- at least one real check-in was created in the deployed
-- app -- so nothing is dropped and recreated:
--
--   * Every existing notebook_sessions row SURVIVES, keeping its id, unit
--     number, date, label, author and creation stamp. Only the `section_id`
--     COLUMN leaves it.
--   * Before that column is dropped, each session gets exactly ONE posting row,
--     to the section it already belonged to. A single-section check-in is
--     therefore a canonical check-in posted to one class -- the trivial
--     instance of the new model, not a special case beside it.
--   * Every notebook_entries.session_id link is preserved UNTOUCHED. No entry
--     row is written by this migration at all: an entry already satisfied
--     (session_id, section_id) = (session.id, session.section_id), which is
--     exactly the posting row seeded for it, so the repointed composite key is
--     satisfied by construction rather than by repair.
--   * Excusals, photos, notes and folder links are not touched.
--
-- The counts are reported by `raise notice` at apply time (the 0096 backfill
-- convention) so what happened to real data is visible, not inferred.
--
-- THE COMPOSITE KEY IS PRESERVED AND STRENGTHENED, not lost. 0069's
-- notebook_entries (session_id, section_id) -> notebook_sessions (id,
-- section_id) made "an entry whose section disagrees with its own session's
-- section" unrepresentable. A canonical session has no single section to point
-- at, so the key repoints to the POSTINGS table's own unique constraint:
-- notebook_entries (session_id, section_id) -> notebook_session_postings
-- (session_id, section_id). That is the exact idiom 0097 already uses for
-- notebook_unit_items -> classroom_postings (item_id, section_id), and it is
-- STRICTLY STRONGER than what it replaces: an entry filed against a check-in in
-- a class that check-in does not run in is now unrepresentable too.
--
-- It also carries NO on-delete action, which is what makes the unpost guarantee
-- structural: removing a posting that still has entries attached is refused by
-- the key itself, so the RPC has to detach them first (session_id nulled,
-- custom_label backfilled from the check-in's own label -- 0069's
-- delete-session behaviour, scoped to one section) rather than destroying them.
-- The same is true of deleting the whole check-in.
--
-- SIGNATURE TRAP. notebook_admin_upsert_session's first parameter changes from
-- `uuid` to `uuid[]`, which is a genuinely different signature -- so the old
-- arity is DROPPED first rather than left callable beside the new one. Deploy
-- ordering follows from that, and is the 0096 rule: APPLY THIS MIGRATION BY
-- HAND BEFORE DEPLOYING ANY CLIENT THAT NAMES p_section_ids.
--
-- Apply manually in the Supabase SQL editor, after 0097. Re-applying is a
-- no-op: every step is `if not exists` or catalog-guarded (the 0088 lesson,
-- learned when a drop-then-add on a depended-upon constraint died with 2BP01
-- on its second run).

-- ---------------------------------------------------------------------------
-- 1. The posting.
--
-- Mirrors public.classroom_postings column for column, including the surrogate
-- id it does not strictly need: the two tables are the same idea and should
-- read as it.
-- ---------------------------------------------------------------------------

create table if not exists public.notebook_session_postings (
	id uuid primary key default gen_random_uuid(),
	session_id uuid not null references public.notebook_sessions (id) on delete cascade,
	section_id uuid not null references public.classroom_sections (id) on delete cascade,
	created_at timestamptz not null default now(),
	unique (session_id, section_id)
);

create index if not exists notebook_session_postings_section_idx
	on public.notebook_session_postings (section_id);
create index if not exists notebook_session_postings_session_idx
	on public.notebook_session_postings (session_id);

-- ---------------------------------------------------------------------------
-- 2. The data migration.
--
-- One posting per existing check-in, to the section it already belonged to.
-- Guarded on the column still existing, so a re-run reports and returns instead
-- of failing to plan a statement naming a column that is gone.
-- ---------------------------------------------------------------------------

do $$
declare
	v_sessions integer := 0;
	v_seeded integer := 0;
	v_entries integer := 0;
begin
	if not exists (
		select 1 from information_schema.columns
		where table_schema = 'public'
			and table_name = 'notebook_sessions'
			and column_name = 'section_id'
	) then
		raise notice '0098: notebook_sessions.section_id is already gone -- postings were seeded by an earlier run of this file. Nothing to migrate.';
		return;
	end if;

	select count(*) into v_sessions from public.notebook_sessions;
	select count(*) into v_entries from public.notebook_entries where session_id is not null;

	-- EXECUTE rather than a plain statement: plpgsql plans a bare SQL statement
	-- the first time it runs, and while the guard above means it never would on
	-- a re-run, naming a dropped column in the body at all is the kind of thing
	-- that fails on a future refactor rather than here.
	execute 'insert into public.notebook_session_postings (session_id, section_id)
		select ss.id, ss.section_id from public.notebook_sessions ss
		on conflict (session_id, section_id) do nothing';
	get diagnostics v_seeded = row_count;

	raise notice '0098: % existing check-in(s) preserved; % posting row(s) created (one per check-in, to the section it already belonged to); % entry link(s) carried over untouched.',
		v_sessions, v_seeded, v_entries;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Repoint the composite key, then drop the column.
--
-- Order matters: the postings above must exist before the key that references
-- them is added, or every already-linked entry would fail validation.
-- ---------------------------------------------------------------------------

alter table public.notebook_entries
	drop constraint if exists notebook_entries_session_section_fkey;

do $$
begin
	if not exists (
		select 1 from pg_constraint
		where conname = 'notebook_entries_session_posting_fkey'
			and conrelid = 'public.notebook_entries'::regclass
	) then
		alter table public.notebook_entries
			add constraint notebook_entries_session_posting_fkey
			foreign key (session_id, section_id)
			references public.notebook_session_postings (session_id, section_id);
	end if;
end
$$;

-- Only reachable once nothing references it: the key above replaced its one
-- dependant, and the column it covers is about to go.
alter table public.notebook_sessions
	drop constraint if exists notebook_sessions_id_section_key;

drop index if exists public.notebook_sessions_section_idx;

-- AN RLS POLICY RECORDS A REAL DEPENDENCY ON EVERY COLUMN ITS EXPRESSION NAMES
-- (the ordering trap 0085 hit), and 0094's excusal policy reads
-- notebook_sessions.section_id -- so the column cannot be dropped while it
-- stands. Dropped here, recreated against the postings in section 7.
drop policy if exists "notebook excusals visible to subject and staff"
	on public.notebook_session_excusals;

alter table public.notebook_sessions
	drop column if exists section_id;

create index if not exists notebook_sessions_unit_idx
	on public.notebook_sessions (unit_number, session_date);

-- ---------------------------------------------------------------------------
-- 4. Privileges + RLS.
--
-- Readable by any signed-in user, exactly like notebook_sessions itself (0069):
-- a posting is a check-in id beside a class id and carries nothing private. The
-- student page reads it to find its own check-ins. ZERO write grants, as
-- everywhere else in this module.
-- ---------------------------------------------------------------------------

revoke all on public.notebook_session_postings from anon, authenticated;
grant select on public.notebook_session_postings to authenticated;
alter table public.notebook_session_postings enable row level security;

drop policy if exists "notebook session postings readable" on public.notebook_session_postings;
create policy "notebook session postings readable"
	on public.notebook_session_postings
	for select
	to authenticated
	using (true);

-- ---------------------------------------------------------------------------
-- 5. Helpers.
-- ---------------------------------------------------------------------------

-- The sections a check-in runs in, as an array. One place that question is
-- asked, so the RPCs' return payloads and the log details cannot disagree.
create or replace function public._notebook_session_sections(p_session_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(array_agg(pg.section_id order by pg.created_at, pg.section_id), '{}'::uuid[])
	from public.notebook_session_postings pg
	where pg.session_id = p_session_id;
$$;

revoke all on function public._notebook_session_sections(uuid) from public;

-- Does the caller manage EVERY section this check-in runs in? That is the bar
-- for editing or deleting it, for _classroom_manages_item's reason: an edit
-- changes what every one of those classes sees, so a teacher who manages only
-- some of them would otherwise be rewriting another teacher's schedule.
-- Unposting a single section is the deliberately weaker action -- see
-- notebook_remove_session_posting.
create or replace function public._notebook_manages_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
			select 1 from public.notebook_session_postings where session_id = p_session_id
		)
		and not exists (
			select 1 from public.notebook_session_postings pg
			where pg.session_id = p_session_id
				and not public.classroom_manages_section(pg.section_id)
		);
$$;

revoke all on function public._notebook_manages_session(uuid) from public;

-- All-or-nothing authorization of a target list, _classroom_check_publish_targets
-- restated for check-ins. Posting to three sections requires managing all
-- three; a teacher who manages one cannot post a check-in into another.
create or replace function public._notebook_check_session_targets(p_section_ids uuid[])
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_sections uuid[];
	v_section uuid;
begin
	select array_agg(distinct s) into v_sections
	from unnest(coalesce(p_section_ids, '{}'::uuid[])) as s
	where s is not null;

	if v_sections is null or array_length(v_sections, 1) = 0 then
		raise exception 'Select at least one section for this check-in.';
	end if;
	if array_length(v_sections, 1) > 50 then
		raise exception 'At most 50 sections per check-in.';
	end if;

	foreach v_section in array v_sections loop
		if not exists (select 1 from public.classroom_sections s where s.id = v_section) then
			raise exception 'One of the selected sections does not exist.';
		end if;
		if not public.classroom_manages_section(v_section) then
			raise exception 'You are not the teacher of record for one of the selected sections.';
		end if;
	end loop;

	return v_sections;
end;
$$;

revoke all on function public._notebook_check_session_targets(uuid[]) from public;

-- 0069's detach-rather-than-destroy rule, extracted so the three paths that
-- need it (delete the check-in, unpost one section, reconcile a section away on
-- edit) share ONE implementation. `p_section_id` null = every section.
--
-- An entry keeps its photos, its notes, its folder and its student; it simply
-- becomes a free entry, labelled with the check-in's own name so it is still
-- recognisable (the has-a-target CHECK would reject a bare detach).
create or replace function public._notebook_detach_session_entries(
	p_session_id uuid,
	p_section_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_fallback text;
	v_detached integer;
begin
	select left(coalesce(
		nullif(btrim(ss.session_label), ''),
		'Unit ' || ss.unit_number || ' session (deleted)'
	), 200)
	into v_fallback
	from public.notebook_sessions ss
	where ss.id = p_session_id;

	update public.notebook_entries e
	set session_id = null,
		custom_label = coalesce(nullif(btrim(e.custom_label), ''), v_fallback)
	where e.session_id = p_session_id
		and (p_section_id is null or e.section_id = p_section_id);
	get diagnostics v_detached = row_count;

	return coalesce(v_detached, 0);
end;
$$;

revoke all on function public._notebook_detach_session_entries(uuid, uuid) from public;

-- Which section an entry filed against a check-in belongs to. With one posting
-- this is the question 0069 answered by reading session.section_id; with
-- several it has to be resolved:
--
--   1. An explicitly named section wins, and must be one the check-in runs in.
--   2. Otherwise, the section the student is actively enrolled in, when exactly
--      one of the check-in's sections qualifies. This is DISAMBIGUATION, not
--      authorization -- 0069/0094 deliberately do not require enrollment to
--      file an entry, and this does not start.
--   3. Otherwise, the only posting, if there is only one. This is what keeps
--      every single-section check-in behaving exactly as it did.
--   4. Otherwise it is genuinely ambiguous, and saying so beats guessing.
create or replace function public._notebook_resolve_session_section(
	p_session_id uuid,
	p_section_id uuid,
	p_student_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_count integer;
	v_section uuid;
	v_email text;
	v_candidates uuid[];
begin
	if not exists (select 1 from public.notebook_sessions ss where ss.id = p_session_id) then
		raise exception 'That session does not exist.';
	end if;

	if p_section_id is not null then
		if not exists (
			select 1 from public.notebook_session_postings pg
			where pg.session_id = p_session_id and pg.section_id = p_section_id
		) then
			raise exception 'That session does not run in that section.';
		end if;
		return p_section_id;
	end if;

	select count(*) into v_count
	from public.notebook_session_postings pg
	where pg.session_id = p_session_id;

	if v_count = 0 then
		raise exception 'That session is not scheduled in any section.';
	end if;

	if p_student_id is not null then
		v_email := public._notebook_email_for_user(p_student_id);
		if v_email is not null then
			-- The whole candidate set, not the first row: EXACTLY ONE enrolled
			-- section is an answer, two is still ambiguous and falls through.
			select array_agg(pg.section_id) into v_candidates
			from public.notebook_session_postings pg
			join public.classroom_enrollments ce
				on ce.section_id = pg.section_id
				and ce.student_email = lower(btrim(v_email))
				and ce.active
			where pg.session_id = p_session_id;

			if v_candidates is not null and array_length(v_candidates, 1) = 1 then
				return v_candidates[1];
			end if;
		end if;
	end if;

	if v_count = 1 then
		select pg.section_id into v_section
		from public.notebook_session_postings pg
		where pg.session_id = p_session_id;
		return v_section;
	end if;

	raise exception 'That check-in runs in more than one class; name the section this entry is for.';
end;
$$;

revoke all on function public._notebook_resolve_session_section(uuid, uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- 6. The check-in write path.
-- ---------------------------------------------------------------------------

-- The first parameter changes type, so the old arity is dropped rather than
-- left callable beside the new one (see the header).
drop function if exists public.notebook_admin_upsert_session(uuid, integer, date, text, uuid);

-- Create a check-in across N sections, or edit the canonical record and
-- reconcile which sections it runs in. `p_id` null creates -- 0069's convention,
-- unchanged.
--
-- An edit updates ONE record, so the date and label change in every section at
-- once: the whole point of the migration. Reconciling to a shorter list unposts
-- the missing sections, which DETACHES their entries rather than destroying
-- them (the same guarantee delete and unpost carry).
create or replace function public.notebook_admin_upsert_session(
	p_section_ids uuid[],
	p_unit_number integer,
	p_session_date date,
	p_session_label text,
	p_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_label text := btrim(coalesce(p_session_label, ''));
	v_id uuid := p_id;
	v_sections uuid[];
	v_drop uuid[];
	v_section uuid;
	v_added integer := 0;
	v_removed integer := 0;
	v_detached integer := 0;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_unit_number is null or p_unit_number < 0 or p_unit_number > 1000 then
		raise exception 'Unit number must be between 0 and 1000.';
	end if;
	if p_session_date is null then
		raise exception 'A session date is required.';
	end if;
	if v_label = '' then
		raise exception 'A session label is required.';
	end if;

	-- All-or-nothing: every target must be one the caller manages, before
	-- anything is written.
	v_sections := public._notebook_check_session_targets(p_section_ids);

	if v_id is null then
		insert into public.notebook_sessions (unit_number, session_date, session_label, created_by)
		values (p_unit_number, p_session_date, v_label, v_uid)
		returning id into v_id;

		foreach v_section in array v_sections loop
			insert into public.notebook_session_postings (session_id, section_id)
			values (v_id, v_section);
			v_added := v_added + 1;
		end loop;
	else
		perform 1 from public.notebook_sessions ss where ss.id = v_id for update;
		if not found then
			raise exception 'That session does not exist.';
		end if;
		if not public._notebook_manages_session(v_id) then
			raise exception 'Only the teacher of record for every section this check-in runs in can edit it.';
		end if;

		update public.notebook_sessions
		set unit_number = p_unit_number,
			session_date = p_session_date,
			session_label = v_label
		where id = v_id;

		-- Add what is missing...
		foreach v_section in array v_sections loop
			insert into public.notebook_session_postings (session_id, section_id)
			values (v_id, v_section)
			on conflict (session_id, section_id) do nothing;
			if found then
				v_added := v_added + 1;
			end if;
		end loop;

		-- ...and unpost what is no longer listed, detaching first so the
		-- composite key never has to refuse. Collected before the loop rather
		-- than iterated live, since the loop deletes from the table it reads.
		select coalesce(array_agg(pg.section_id), '{}'::uuid[]) into v_drop
		from public.notebook_session_postings pg
		where pg.session_id = v_id
			and not (pg.section_id = any (v_sections));

		foreach v_section in array v_drop loop
			v_detached := v_detached + public._notebook_detach_session_entries(v_id, v_section);
			delete from public.notebook_session_postings
			where session_id = v_id and section_id = v_section;
			v_removed := v_removed + 1;
		end loop;
	end if;

	return jsonb_build_object(
		'session_id', v_id,
		'section_ids', to_jsonb(public._notebook_session_sections(v_id)),
		'added', v_added,
		'removed', v_removed,
		'detached_entries', v_detached
	);
end;
$$;

revoke all on function public.notebook_admin_upsert_session(uuid[], integer, date, text, uuid) from public;
grant execute on function public.notebook_admin_upsert_session(uuid[], integer, date, text, uuid) to authenticated;

-- Run an existing check-in in more sections too. classroom_add_postings'
-- shape: the NEW targets are authorized all-or-nothing, AND the caller must
-- already manage the check-in, since widening it is a change to it.
create or replace function public.notebook_add_session_postings(
	p_session_id uuid,
	p_section_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_sections uuid[];
	v_section uuid;
	v_added integer := 0;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not exists (select 1 from public.notebook_sessions where id = p_session_id) then
		raise exception 'That session does not exist.';
	end if;
	if not public._notebook_manages_session(p_session_id) then
		raise exception 'Only the teacher of record for every section this check-in runs in can add another.';
	end if;

	v_sections := public._notebook_check_session_targets(p_section_ids);

	foreach v_section in array v_sections loop
		insert into public.notebook_session_postings (session_id, section_id)
		values (p_session_id, v_section)
		on conflict (session_id, section_id) do nothing;
		if found then
			v_added := v_added + 1;
		end if;
	end loop;

	return jsonb_build_object(
		'ok', true,
		'session_id', p_session_id,
		'added', v_added,
		'section_ids', to_jsonb(public._notebook_session_sections(p_session_id))
	);
end;
$$;

revoke all on function public.notebook_add_session_postings(uuid, uuid[]) from public;
grant execute on function public.notebook_add_session_postings(uuid, uuid[]) to authenticated;

-- Stop running a check-in in ONE section. classroom_remove_posting's shape,
-- including the deliberately weaker permission: taking your own class off a
-- shared check-in is a decision about your class and changes nothing for
-- anyone else, so it needs only classroom_manages_section for THAT section.
--
-- The last posting is refused as a structured `{ok:false}` rather than an
-- exception, because "this is the only class it runs in, delete it instead" is
-- information the UI renders. A check-in with no postings would appear on no
-- grid at all.
--
-- ENTRIES ARE DETACHED, NEVER DESTROYED -- 0069's delete-session guarantee,
-- scoped to one section. The composite key refuses the delete otherwise, so
-- this is structural rather than remembered.
create or replace function public.notebook_remove_session_posting(
	p_session_id uuid,
	p_section_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_total integer;
	v_detached integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not exists (
		select 1 from public.notebook_session_postings
		where session_id = p_session_id and section_id = p_section_id
	) then
		raise exception 'That check-in does not run in that section.';
	end if;
	if not public.classroom_manages_section(p_section_id) then
		raise exception 'Only the section''s teacher of record or a site admin can remove it.';
	end if;

	select count(*) into v_total
	from public.notebook_session_postings where session_id = p_session_id;
	if v_total <= 1 then
		return jsonb_build_object('ok', false, 'reason', 'last_posting');
	end if;

	v_detached := public._notebook_detach_session_entries(p_session_id, p_section_id);

	delete from public.notebook_session_postings
	where session_id = p_session_id and section_id = p_section_id;

	perform public._notebook_log('unpost_session', p_section_id, p_session_id, null, null,
		jsonb_build_object('detached_entries', v_detached, 'remaining', v_total - 1));

	return jsonb_build_object(
		'ok', true,
		'session_id', p_session_id,
		'remaining', v_total - 1,
		'detached_entries', v_detached,
		'section_ids', to_jsonb(public._notebook_session_sections(p_session_id))
	);
end;
$$;

revoke all on function public.notebook_remove_session_posting(uuid, uuid) from public;
grant execute on function public.notebook_remove_session_posting(uuid, uuid) to authenticated;

-- Latest definition: 0094. Two changes: authority is now "every section it runs
-- in" (_notebook_manages_session), and the detach is the shared helper. The
-- guarantee is exactly 0069's -- entries are kept and relabelled, never
-- deleted -- and the postings go with the check-in by cascade.
create or replace function public.notebook_admin_delete_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_session public.notebook_sessions%rowtype;
	v_sections uuid[];
	v_detached integer;
	v_excused integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select ss.* into v_session
	from public.notebook_sessions ss
	where ss.id = p_session_id
	for update;
	if not found then
		raise exception 'That session does not exist.';
	end if;
	if not public._notebook_manages_session(p_session_id) then
		raise exception 'Only the teacher of record for every section this check-in runs in can delete it.';
	end if;

	v_sections := public._notebook_session_sections(p_session_id);

	v_detached := public._notebook_detach_session_entries(p_session_id, null);

	select count(*) into v_excused
	from public.notebook_session_excusals x
	where x.session_id = p_session_id;

	delete from public.notebook_sessions where id = p_session_id;

	perform public._notebook_log('delete_session', v_sections[1], p_session_id, null, null,
		jsonb_build_object(
			'unit_number', v_session.unit_number,
			'session_date', v_session.session_date,
			'session_label', v_session.session_label,
			'section_ids', to_jsonb(v_sections),
			'detached_entries', v_detached,
			'removed_excusals', v_excused
		));

	return jsonb_build_object('deleted', true, 'detached_entries', v_detached);
end;
$$;

revoke all on function public.notebook_admin_delete_session(uuid) from public;
grant execute on function public.notebook_admin_delete_session(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Everything that used to read session.section_id.
--
-- Each of these is its latest prior definition with exactly one swap: the
-- single column read becomes a postings lookup. No message, parameter, return
-- shape or rule changes beyond what multi-section forces.
-- ---------------------------------------------------------------------------

-- Latest definition: 0094. The section-resolution block is the only change.
create or replace function public.notebook_create_entry(
	p_student_id uuid,
	p_drive_file_id text default null,
	p_session_id uuid default null,
	p_section_id uuid default null,
	p_custom_label text default null,
	p_original_filename text default null,
	p_folder_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_file text := btrim(coalesce(p_drive_file_id, ''));
	v_label text := nullif(btrim(coalesce(p_custom_label, '')), '');
	v_original text := nullif(btrim(coalesce(p_original_filename, '')), '');
	v_section uuid;
	v_entry_id uuid;
	v_photo_id uuid;
	v_uploaded timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_student_id is null or p_student_id <> v_uid then
		raise exception 'You can only create notebook entries for your own account.';
	end if;

	if p_folder_id is not null and not exists (
		select 1 from public.notebook_folders f
		where f.id = p_folder_id and f.student_id = v_uid
	) then
		raise exception 'That folder does not exist or is not yours.';
	end if;

	if p_session_id is not null then
		if v_file = '' then
			raise exception 'A Drive file id is required.';
		end if;
		v_section := public._notebook_resolve_session_section(p_session_id, p_section_id, v_uid);
	else
		if v_file = '' and v_label is null then
			raise exception 'A free-form entry needs a photo or a label.';
		end if;
		v_section := p_section_id;
		-- DELIBERATELY STILL NOT AN ENROLLMENT CHECK, for 0094's reason: filing
		-- your own entry against a class you are not in discloses your own work
		-- to that teacher and nobody else's to anyone.
		if v_section is not null and not exists (
			select 1 from public.classroom_sections s where s.id = v_section
		) then
			raise exception 'That section does not exist.';
		end if;
	end if;

	insert into public.notebook_entries (student_id, section_id, session_id, custom_label, folder_id)
	values (v_uid, v_section, p_session_id, v_label, p_folder_id)
	returning id, upload_timestamp into v_entry_id, v_uploaded;

	if v_file <> '' then
		insert into public.notebook_entry_photos
			(entry_id, drive_file_id, variant, sequence_order, original_filename)
		values (v_entry_id, v_file, 'original', 1, left(v_original, 300))
		returning id into v_photo_id;
	end if;

	return jsonb_build_object(
		'entry_id', v_entry_id,
		'photo_id', v_photo_id,
		'folder_id', p_folder_id,
		'status', 'compliant',
		'upload_timestamp', v_uploaded
	);
end;
$$;

revoke all on function public.notebook_create_entry(uuid, text, uuid, uuid, text, text, uuid) from public;
grant execute on function public.notebook_create_entry(uuid, text, uuid, uuid, text, text, uuid) to authenticated;

-- Latest definition: 0094. Same one swap: the entry's section still follows its
-- check-in, but a check-in now offers several and an explicit section is
-- honoured when it is one of them.
create or replace function public.notebook_admin_override_entry(
	p_entry_id uuid,
	p_set_session boolean default false,
	p_session_id uuid default null,
	p_set_section boolean default false,
	p_section_id uuid default null,
	p_custom_label text default null,
	p_status text default null,
	p_flag_reason text default null,
	p_instructor_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_old public.notebook_entries%rowtype;
	v_session uuid;
	v_section uuid;
	v_label text;
	v_status text;
	v_reason text;
	v_comment text;
	v_reviewed_by uuid;
	v_reviewed_at timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.is_admin() then
		raise exception 'Only a site admin can override notebook entries.';
	end if;

	select e.* into v_old
	from public.notebook_entries e
	where e.id = p_entry_id
	for update;
	if not found then
		raise exception 'That entry does not exist.';
	end if;

	v_session := case when p_set_session then p_session_id else v_old.session_id end;
	v_label := case
		when p_custom_label is not null then nullif(btrim(p_custom_label), '')
		else v_old.custom_label
	end;

	if v_session is not null then
		v_section := public._notebook_resolve_session_section(
			v_session,
			case
				when p_set_section then p_section_id
				-- Not re-pointing the section: the entry's current one still
				-- applies when the check-in runs there.
				when v_old.section_id is not null and exists (
					select 1 from public.notebook_session_postings pg
					where pg.session_id = v_session and pg.section_id = v_old.section_id
				) then v_old.section_id
				else null
			end,
			v_old.student_id);
	else
		v_section := case when p_set_section then p_section_id else v_old.section_id end;
		if v_section is not null and not exists (
			select 1 from public.classroom_sections s where s.id = v_section
		) then
			raise exception 'That section does not exist.';
		end if;
	end if;

	v_status := coalesce(p_status, v_old.status);
	if v_status not in ('compliant', 'flagged', 'pending_review') then
		raise exception 'Status must be one of: compliant, flagged, pending_review.';
	end if;
	if p_flag_reason is not null and p_flag_reason not in
		('not_dated', 'illegible', 'insufficient_detail', 'appears_reconstructed', 'other')
	then
		raise exception 'Flag reason must be one of: not_dated, illegible, insufficient_detail, appears_reconstructed, other.';
	end if;
	if p_flag_reason is not null and v_status <> 'flagged' then
		raise exception 'A flag reason only applies when the status is flagged.';
	end if;
	if v_status = 'flagged' then
		v_reason := coalesce(p_flag_reason, v_old.flag_reason, 'other');
	else
		v_reason := null;
	end if;

	v_comment := case
		when p_instructor_comment is not null then nullif(btrim(p_instructor_comment), '')
		else v_old.instructor_comment
	end;

	if p_status is not null then
		v_reviewed_by := v_uid;
		v_reviewed_at := now();
	else
		v_reviewed_by := v_old.reviewed_by;
		v_reviewed_at := v_old.reviewed_at;
	end if;

	update public.notebook_entries
	set session_id = v_session,
		section_id = v_section,
		custom_label = v_label,
		status = v_status,
		flag_reason = v_reason,
		instructor_comment = v_comment,
		reviewed_by = v_reviewed_by,
		reviewed_at = v_reviewed_at
	where id = p_entry_id;

	perform public._notebook_log('override_entry', v_section, v_session, p_entry_id, v_old.student_id,
		jsonb_build_object(
			'before', jsonb_build_object(
				'session_id', v_old.session_id, 'section_id', v_old.section_id,
				'custom_label', v_old.custom_label, 'status', v_old.status,
				'flag_reason', v_old.flag_reason),
			'after', jsonb_build_object(
				'session_id', v_session, 'section_id', v_section,
				'custom_label', v_label, 'status', v_status,
				'flag_reason', v_reason)
		));

	return jsonb_build_object(
		'entry_id', p_entry_id,
		'session_id', v_session,
		'section_id', v_section,
		'custom_label', v_label,
		'status', v_status
	);
end;
$$;

revoke all on function public.notebook_admin_override_entry(uuid, boolean, uuid, boolean, uuid, text, text, text, text) from public;
grant execute on function public.notebook_admin_override_entry(uuid, boolean, uuid, boolean, uuid, text, text, text, text) to authenticated;

-- Latest definition: 0069. Admin-only, so the only thing the section was ever
-- used for here is the log's subject column; a check-in can run in several
-- sections now, so the log names them all in `details` and leaves the single
-- subject column null rather than picking one arbitrarily.
create or replace function public.notebook_admin_set_excusal(
	p_session_id uuid,
	p_student_id uuid,
	p_excused boolean default true,
	p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_sections uuid[];
	v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.is_admin() then
		raise exception 'Only a site admin can excuse notebook sessions.';
	end if;

	if not exists (select 1 from public.notebook_sessions ss where ss.id = p_session_id) then
		raise exception 'That session does not exist.';
	end if;
	v_sections := public._notebook_session_sections(p_session_id);

	if p_student_id is null or not exists (
		select 1 from public.profiles p where p.id = p_student_id
	) then
		raise exception 'That student does not exist.';
	end if;

	if coalesce(p_excused, true) then
		insert into public.notebook_session_excusals (session_id, student_id, excused_by, note)
		values (p_session_id, p_student_id, v_uid, v_note)
		on conflict (session_id, student_id) do update
			set excused_by = excluded.excused_by,
				excused_at = now(),
				note = excluded.note;
	else
		delete from public.notebook_session_excusals
		where session_id = p_session_id and student_id = p_student_id;
	end if;

	perform public._notebook_log(
		case when coalesce(p_excused, true) then 'set_excusal' else 'clear_excusal' end,
		null, p_session_id, null, p_student_id,
		jsonb_build_object('note', v_note, 'section_ids', to_jsonb(v_sections)));

	return jsonb_build_object(
		'session_id', p_session_id,
		'student_id', p_student_id,
		'excused', coalesce(p_excused, true)
	);
end;
$$;

revoke all on function public.notebook_admin_set_excusal(uuid, uuid, boolean, text) from public;
grant execute on function public.notebook_admin_set_excusal(uuid, uuid, boolean, text) to authenticated;

-- Latest definition: 0094. The excusal-holder branch joins postings instead of
-- reading a column; everything else, the enrolled/holders union included, is
-- untouched.
create or replace function public._notebook_section_roster(p_section_id uuid)
returns table (
	student_key text,
	student_id uuid,
	email text,
	name text,
	enrolled boolean
)
language sql
stable
security definer
set search_path = ''
as $$
	with enrolled as (
		select
			ce.student_email as email,
			ce.display_name as roster_name,
			public._notebook_user_id_for_email(ce.student_email) as student_id
		from public.classroom_enrollments ce
		where ce.section_id = p_section_id
			and ce.active
	),
	holders as (
		select
			p.id as student_id,
			public._notebook_email_for_user(p.id) as email
		from public.profiles p
		where exists (
				select 1 from public.notebook_entries e
				where e.student_id = p.id and e.section_id = p_section_id
			)
			or exists (
				select 1
				from public.notebook_session_excusals x
				join public.notebook_session_postings pg on pg.session_id = x.session_id
				where x.student_id = p.id and pg.section_id = p_section_id
			)
	),
	combined as (
		select e.email, e.student_id, e.roster_name, true as enrolled
		from enrolled e
		union all
		select h.email, h.student_id, null::text as roster_name, false as enrolled
		from holders h
		where not exists (
			select 1 from enrolled e
			where e.student_id = h.student_id
				or (h.email is not null and e.email = h.email)
		)
	)
	select
		coalesce(c.email, c.student_id::text) as student_key,
		c.student_id,
		coalesce(c.email, p.email) as email,
		coalesce(
			nullif(btrim(c.roster_name), ''),
			nullif(btrim(p.display_name), ''),
			nullif(btrim(p.full_name), ''),
			c.email,
			p.email,
			'Student'
		) as name,
		c.enrolled
	from combined c
	left join public.profiles p on p.id = c.student_id;
$$;

revoke all on function public._notebook_section_roster(uuid) from public;

-- Latest definition: 0094. Same swap.
drop policy if exists "notebook excusals visible to subject and staff" on public.notebook_session_excusals;
create policy "notebook excusals visible to subject and staff"
	on public.notebook_session_excusals
	for select
	to authenticated
	using (
		student_id = (select auth.uid())
		or exists (
			select 1
			from public.notebook_session_postings pg
			where pg.session_id = notebook_session_excusals.session_id
				and public.classroom_manages_section(pg.section_id)
		)
	);

-- Latest definition: 0094. THE GRID IS UNCHANGED as a payload: it still shows
-- ONE section at a time, and a check-in that runs in three sections is one
-- column in each of the three. The only change is how "this section's
-- check-ins" is asked -- through the postings, not a column.
create or replace function public.notebook_get_section_grid(
	p_section_id uuid,
	p_unit_number integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_section record;
	v_sessions jsonb;
	v_students jsonb;
	v_cells jsonb;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select s.id, s.label, s.block, s.teacher_email, c.code as course_code, c.title as course_title
	into v_section
	from public.classroom_sections s
	join public.classroom_courses c on c.id = s.course_id
	where s.id = p_section_id;
	if not found then
		raise exception 'That section does not exist.';
	end if;
	if not public.classroom_manages_section(p_section_id) then
		raise exception 'Only the section instructor or a site admin can view the notebook grid.';
	end if;

	select coalesce(jsonb_agg(jsonb_build_object(
			'id', ss.id,
			'unit_number', ss.unit_number,
			'session_date', ss.session_date,
			'session_label', ss.session_label,
			'section_ids', to_jsonb(public._notebook_session_sections(ss.id))
		) order by ss.session_date, ss.unit_number, ss.session_label, ss.id), '[]'::jsonb)
	into v_sessions
	from public.notebook_sessions ss
	join public.notebook_session_postings pg on pg.session_id = ss.id
	where pg.section_id = p_section_id
		and (p_unit_number is null or ss.unit_number = p_unit_number);

	select coalesce(jsonb_agg(jsonb_build_object(
			'student_key', r.student_key,
			'id', r.student_id,
			'name', r.name,
			'email', r.email,
			'enrolled', r.enrolled,
			'free_entries', (
				select count(*)
				from public.notebook_entries e
				where e.student_id = r.student_id
					and e.section_id = p_section_id
					and e.session_id is null
			)
		) order by r.name, r.student_key), '[]'::jsonb)
	into v_students
	from public._notebook_section_roster(p_section_id) r;

	with roster as (
		select * from public._notebook_section_roster(p_section_id)
	),
	sess as (
		select ss.id, ss.session_date, ss.unit_number, ss.session_label
		from public.notebook_sessions ss
		join public.notebook_session_postings pg on pg.session_id = ss.id
		where pg.section_id = p_section_id
			and (p_unit_number is null or ss.unit_number = p_unit_number)
	),
	latest as (
		-- SCOPED TO THIS SECTION, which the single-section model got for free:
		-- a check-in shared with another class also holds that class's entries,
		-- and they belong on that class's grid, not this one.
		select distinct on (e.session_id, e.student_id)
			e.session_id, e.student_id, e.id, e.status, e.flag_reason, e.upload_timestamp
		from public.notebook_entries e
		where e.session_id in (select id from sess)
			and e.section_id = p_section_id
		order by e.session_id, e.student_id, e.upload_timestamp desc, e.id desc
	),
	counts as (
		select e.session_id, e.student_id, count(*) as n
		from public.notebook_entries e
		where e.session_id in (select id from sess)
			and e.section_id = p_section_id
		group by e.session_id, e.student_id
	)
	select coalesce(jsonb_agg(jsonb_build_object(
			'student_key', r.student_key,
			'student_id', r.student_id,
			'session_id', se.id,
			'status', case
				when l.id is not null then l.status
				when x.session_id is not null then 'excused'
				else 'missing'
			end,
			'entry_id', l.id,
			'entry_count', coalesce(c.n, 0),
			'upload_timestamp', l.upload_timestamp,
			'on_time', case
				when l.id is null then null
				else ((l.upload_timestamp at time zone 'America/Los_Angeles')::date <= se.session_date)
			end,
			'excused', (x.session_id is not null),
			'flag_reason', l.flag_reason
		) order by r.name, r.student_key, se.session_date, se.unit_number, se.session_label, se.id), '[]'::jsonb)
	into v_cells
	from roster r
	cross join sess se
	left join latest l on l.session_id = se.id and l.student_id = r.student_id
	left join counts c on c.session_id = se.id and c.student_id = r.student_id
	left join public.notebook_session_excusals x
		on x.session_id = se.id and x.student_id = r.student_id;

	return jsonb_build_object(
		'section', jsonb_build_object(
			'id', v_section.id,
			'course_code', v_section.course_code,
			'course_title', v_section.course_title,
			'label', v_section.label,
			'block', v_section.block,
			'teacher_email', v_section.teacher_email
		),
		'unit_number', p_unit_number,
		'generated_at', now(),
		'sessions', v_sessions,
		'students', v_students,
		'cells', v_cells
	);
end;
$$;

revoke all on function public.notebook_get_section_grid(uuid, integer) from public;
grant execute on function public.notebook_get_section_grid(uuid, integer) to authenticated;
