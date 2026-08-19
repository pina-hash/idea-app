-- 0116_notebook_soft_delete.sql
--
-- NOTEBOOK ENTRIES AND PHOTOS BECOME CORRECTABLE. Data layer only: this file
-- adds two nullable column pairs, four RPCs, one relaxed rule, and the
-- exclusion filters that keep what they mark out of every list, count, grid,
-- payload and export. The controls that call them are a separate change and are
-- deliberately not here.
--
-- DELETION IS SOFT, EVERYWHERE. Nothing in this file destroys a row and nothing
-- here touches Drive. That is not caution for its own sake: a photo is the ONLY
-- record of a physical notebook page, and every mutation this subsystem has
-- ever had is append-only -- a note revises by INSERTING a revision (0078),
-- photos have only ever been added (0069), and the one delete path in the whole
-- coin/notebook schema (0084's batch rollback) is scoped to its own tags.
-- Reversibility is the point, so `deleted_at` / `removed_at` are stamps a row
-- carries, not rows that stop existing.
--
--   notebook_entries      deleted_at / deleted_by
--   notebook_entry_photos removed_at / removed_by
--
-- WHAT "SOFT" COSTS, STATED PLAINLY. The RLS policies are UNCHANGED, so a
-- marked row is still returned by a plain select -- which means every read has
-- to say so. That is section 4, and it is the bulk of this file. A stamp with no
-- filter behind it is worse than no stamp at all, because the row looks deleted
-- to whoever set it and is not.
--
-- notebook_can_read_entry IS DELIBERATELY LEFT ALONE, and a deleted entry stays
-- READABLE to its owner and to the staff who could read it before. Three
-- reasons, in order of weight:
--
--   1. It is the delegation target for photos (0069), notes (0078) and folders
--      (0088). Making it false would make a deleted entry's photos unreadable
--      through the proxy, which is exactly what a reversal has to be able to
--      show. Soft delete whose contents cannot be fetched is a hard delete
--      wearing a stamp.
--   2. It is a VISIBILITY question, and the exclusions are a LISTING question.
--      Answering the second with the first is how a filter goes missing: every
--      list below states its own `deleted_at is null` where the reader can see
--      it, rather than relying on a predicate three functions away.
--   3. It is asked per row, by id, from surfaces that already hold the id. It
--      never puts a row back into a list -- section 4 is what does that job, and
--      it does it exhaustively.
--
-- THE ONE THING THIS FILE DOES NOT SHIP, said out loud rather than left to be
-- discovered: there is no restore RPC. The row survives, so a reversal is a
-- one-line update in the SQL editor, but nothing a student or an instructor can
-- reach un-deletes an entry. That was the scope given; it is worth closing.
--
-- Apply manually in the Supabase SQL editor, after 0115.

-- ---------------------------------------------------------------------------
-- 1. The columns.
--
-- `add column if not exists` skips the whole clause -- the reference included --
-- when the column is already there, so a second run of this file is a no-op
-- rather than a duplicate-object error (0088's lesson: migrations here are
-- pasted in by hand and a re-run is an ordinary thing that happens).
--
-- `on delete set null` on both actor columns: a departed account must not take
-- the record of what it did with it, the same rule reviewed_by has carried
-- since 0069.
-- ---------------------------------------------------------------------------

alter table public.notebook_entries
	add column if not exists deleted_at timestamptz;
alter table public.notebook_entries
	add column if not exists deleted_by uuid references auth.users (id) on delete set null;

alter table public.notebook_entry_photos
	add column if not exists removed_at timestamptz;
alter table public.notebook_entry_photos
	add column if not exists removed_by uuid references auth.users (id) on delete set null;

-- Partial indexes over the LIVE rows, which is what every read below asks for.
-- A deleted entry is rare against a term's worth of live ones, so the index
-- worth having is the one that does not carry them.
create index if not exists notebook_entries_live_idx
	on public.notebook_entries (student_id, upload_timestamp desc)
	where deleted_at is null;

create index if not exists notebook_entry_photos_live_idx
	on public.notebook_entry_photos (entry_id, sequence_order)
	where removed_at is null;

-- ---------------------------------------------------------------------------
-- 2. The four write RPCs.
--
-- Every one follows notebook_set_entry_pinned (0091) exactly: SECURITY DEFINER,
-- `set search_path = ''`, revoked from public and granted to authenticated,
-- returning jsonb. NO new table grant and NO new policy -- there is still no
-- DELETE grant on any notebook table, and still no direct client write path to
-- any of these columns.
-- ---------------------------------------------------------------------------

-- A student removes their own entry.
--
-- REFUSAL ORDER IS DELIBERATE. Already-deleted is checked BEFORE reviewed,
-- because the two can both be true (staff can delete a reviewed entry -- the
-- next function) and "that entry is already gone" is the more useful of the two
-- answers: telling a student to ask their instructor about something that has
-- already been removed sends them on an errand with nothing at the end of it.
--
-- THE REVIEWED REFUSAL IS THE POINT OF THE FUNCTION. Once an instructor has
-- looked at an entry, what they saw is part of a record they are keeping and the
-- student is no longer the only party to it. So the door closes and names who
-- can still open it, rather than closing silently.
create or replace function public.notebook_delete_entry(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_entry public.notebook_entries%rowtype;
	v_deleted_at timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_entry_id is null then
		raise exception 'Which entry?';
	end if;

	-- The WHERE clause is the authorization (the 0091 shape): an entry that is
	-- not the caller's is simply not matched, and answers as not found rather
	-- than reporting anything about itself.
	select e.* into v_entry
	from public.notebook_entries e
	where e.id = p_entry_id and e.student_id = v_uid
	for update;
	if not found then
		raise exception 'That entry does not exist or is not yours.';
	end if;

	if v_entry.deleted_at is not null then
		raise exception 'That entry has already been deleted.';
	end if;
	if v_entry.reviewed_at is not null then
		raise exception 'Your instructor has already reviewed that entry, so it cannot be deleted here. Ask them to remove it for you.';
	end if;

	update public.notebook_entries e
	set deleted_at = now(), deleted_by = v_uid
	where e.id = p_entry_id
	returning e.deleted_at into v_deleted_at;

	return jsonb_build_object(
		'ok', true,
		'entry_id', p_entry_id,
		'deleted_at', v_deleted_at
	);
end;
$$;

revoke all on function public.notebook_delete_entry(uuid) from public;
grant execute on function public.notebook_delete_entry(uuid) to authenticated;

-- An instructor removes a student's entry.
--
-- NO REVIEWED-STATE REFUSAL: that rule exists to stop a student withdrawing
-- work an instructor is keeping a record of, and this IS the instructor.
--
-- GATED ON classroom_manages_section(section_id), the same question every other
-- staff write in this subsystem asks. Worth knowing what that means for a
-- FREE-FORM entry: it carries `section_id = null`, and
-- classroom_manages_section(null) is is_admin(), so a teacher of record cannot
-- staff-delete a student's free-form entry -- only the chair tier can. That is
-- narrower than the READ predicate (0106's notebook_manages_student does reach a
-- free-form entry), and deliberately so: removing something is a stronger act
-- than looking at it, and a free-form entry was never filed in anyone's class.
--
-- NOT-FOUND AND NOT-YOURS ANSWER IDENTICALLY (the 0102 claim convention), so
-- probing ids through this function tells a non-manager nothing.
create or replace function public.notebook_staff_delete_entry(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_entry public.notebook_entries%rowtype;
	v_found boolean;
	v_deleted_at timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_entry_id is null then
		raise exception 'Which entry?';
	end if;

	select e.* into v_entry
	from public.notebook_entries e
	where e.id = p_entry_id
	for update;
	v_found := found;

	-- Authorization BEFORE state, and the two failures share one message.
	if not v_found or not public.classroom_manages_section(v_entry.section_id) then
		raise exception 'That entry does not exist, or is not in a class you manage.';
	end if;

	if v_entry.deleted_at is not null then
		raise exception 'That entry has already been deleted.';
	end if;

	update public.notebook_entries e
	set deleted_at = now(), deleted_by = v_uid
	where e.id = p_entry_id
	returning e.deleted_at into v_deleted_at;

	-- The audit row, which is why this is a separate function rather than a
	-- branch of the one above: a student tidying their own notebook is not an
	-- event anyone reviews, and staff removing somebody else's work is.
	perform public._notebook_log(
		'delete_entry',
		v_entry.section_id,
		v_entry.session_id,
		p_entry_id,
		v_entry.student_id,
		jsonb_build_object(
			'custom_label', v_entry.custom_label,
			'status', v_entry.status,
			'reviewed_at', v_entry.reviewed_at,
			'upload_timestamp', v_entry.upload_timestamp
		)
	);

	return jsonb_build_object(
		'ok', true,
		'entry_id', p_entry_id,
		'student_id', v_entry.student_id,
		'deleted_at', v_deleted_at
	);
end;
$$;

revoke all on function public.notebook_staff_delete_entry(uuid) from public;
grant execute on function public.notebook_staff_delete_entry(uuid) to authenticated;

-- A student removes one photo from their own entry.
--
-- OWNERSHIP IS RESOLVED THROUGH THE PARENT ENTRY, because that is where it
-- lives: notebook_entry_photos carries no student_id, and inventing one here
-- would be a second answer to "whose photo is this".
--
-- IT REFUSES TO EMPTY AN ENTRY INTO A SHELL. An entry whose last photo goes and
-- which carries no written note has nothing left in it at all -- it would sit in
-- the feed as an untitled row with no content, which is a worse outcome than
-- either keeping the photo or removing the whole entry. So the last one is
-- refused, and the message names the action that actually applies.
create or replace function public.notebook_remove_photo(p_photo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_photo public.notebook_entry_photos%rowtype;
	v_student uuid;
	v_remaining bigint;
	v_notes bigint;
	v_removed_at timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_photo_id is null then
		raise exception 'Which photo?';
	end if;

	select p.* into v_photo
	from public.notebook_entry_photos p
	where p.id = p_photo_id
	for update;
	if not found then
		raise exception 'That photo does not exist or is not yours.';
	end if;

	-- Locks the ENTRY too, so two concurrent removals cannot each see the other
	-- photo as "remaining" and empty the entry between them.
	select e.student_id into v_student
	from public.notebook_entries e
	where e.id = v_photo.entry_id
	for update;

	if v_student is distinct from v_uid then
		raise exception 'That photo does not exist or is not yours.';
	end if;
	if v_photo.removed_at is not null then
		raise exception 'That photo has already been removed.';
	end if;

	select count(*) into v_remaining
	from public.notebook_entry_photos p
	where p.entry_id = v_photo.entry_id
		and p.removed_at is null
		and p.id <> p_photo_id;

	-- ANY note revision counts. Which revision is current is derived (0078) and
	-- nothing here needs to know: the question is only whether the entry still
	-- says something once this photo is gone.
	select count(*) into v_notes
	from public.notebook_entry_notes n
	where n.entry_id = v_photo.entry_id;

	if v_remaining = 0 and v_notes = 0 then
		raise exception 'That is the only thing in this entry. Delete the whole entry instead.';
	end if;

	update public.notebook_entry_photos p
	set removed_at = now(), removed_by = v_uid
	where p.id = p_photo_id
	returning p.removed_at into v_removed_at;

	return jsonb_build_object(
		'ok', true,
		'photo_id', p_photo_id,
		'entry_id', v_photo.entry_id,
		'removed_at', v_removed_at
	);
end;
$$;

revoke all on function public.notebook_remove_photo(uuid) from public;
grant execute on function public.notebook_remove_photo(uuid) to authenticated;

-- A student retitles their own free-form entry.
--
-- REFUSES ON A SESSION-LINKED ENTRY, because the title of a check-in entry is
-- the CHECK-IN's label (entryTitle walks the session label first), so a
-- custom_label written here would be stored and never shown -- an edit that
-- silently does nothing is worse than one that says why it cannot.
--
-- THE LENGTH RULE IS THE COLUMN'S OWN: null, or 1 to 200 characters after
-- trimming. A blank string normalizes to null (clearing the title) rather than
-- being stored, which is exactly what the column CHECK means by
-- `custom_label is null`.
--
-- CLEARING IS REFUSED ON AN OTHERWISE-EMPTY ENTRY, the same shell rule
-- notebook_remove_photo carries and for the same reason: a title-only entry
-- whose title goes has nothing left in it. It can only fire on an entry with no
-- live photo and no note at all, which is precisely the row that would become a
-- shell.
create or replace function public.notebook_set_entry_label(
	p_entry_id uuid,
	p_custom_label text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_entry public.notebook_entries%rowtype;
	v_label text;
	v_photos bigint;
	v_notes bigint;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_entry_id is null then
		raise exception 'Which entry?';
	end if;

	v_label := nullif(btrim(coalesce(p_custom_label, '')), '');
	if v_label is not null and char_length(v_label) > 200 then
		raise exception 'That title is too long: keep it to 200 characters or fewer.';
	end if;

	select e.* into v_entry
	from public.notebook_entries e
	where e.id = p_entry_id and e.student_id = v_uid
	for update;
	if not found then
		raise exception 'That entry does not exist or is not yours.';
	end if;

	if v_entry.deleted_at is not null then
		raise exception 'That entry has been deleted.';
	end if;
	if v_entry.session_id is not null then
		raise exception 'This entry is filed against a scheduled check-in, so its title comes from the check-in and cannot be changed here.';
	end if;

	if v_label is null then
		select count(*) into v_photos
		from public.notebook_entry_photos p
		where p.entry_id = p_entry_id and p.removed_at is null;
		select count(*) into v_notes
		from public.notebook_entry_notes n
		where n.entry_id = p_entry_id;

		if v_photos = 0 and v_notes = 0 then
			raise exception 'That title is the only thing in this entry. Delete the whole entry instead.';
		end if;
	end if;

	update public.notebook_entries e
	set custom_label = v_label
	where e.id = p_entry_id;

	return jsonb_build_object(
		'ok', true,
		'entry_id', p_entry_id,
		'custom_label', v_label
	);
end;
$$;

revoke all on function public.notebook_set_entry_label(uuid, text) from public;
grant execute on function public.notebook_set_entry_label(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. A note on a check-in entry becomes editable.
--
-- 0078's definition with the session-linked refusal and its message removed, and
-- NOTHING else changed. That refusal existed to protect a record an instructor
-- had read: a check-in is reviewed work, so rewriting it afterwards would change
-- what was reviewed.
--
-- IT WAS PROTECTING SOMETHING THAT ALREADY SURVIVES. An edit overwrites nothing
-- -- it INSERTS a revision superseding the current one (that is what the
-- note_id / revision / supersedes_id chain is for), every earlier version stays
-- readable, and EntryNotes renders the history behind an "Edited" marker. So the
-- record the refusal defended is kept by the storage model itself, and the
-- refusal was only costing a student the ability to fix a typo in a check-in
-- note. Ownership, content validation and the row-level lock are untouched.
-- ---------------------------------------------------------------------------

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

	select e.student_id into v_student
	from public.notebook_entries e
	where e.id = v_latest.entry_id
	for update;

	-- Ownership first, so someone else's note answers the same way a note that
	-- does not exist would rather than reporting anything about it.
	if v_student is distinct from v_uid then
		raise exception 'That note is not yours.';
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

-- ---------------------------------------------------------------------------
-- 4. THE EXCLUSION SWEEP.
--
-- The RLS policies are unchanged, so a marked row is still SELECTable -- which
-- makes this section, not section 2, the part that decides whether a deletion is
-- visible anywhere. Every SERVER-SIDE read of either table is here; the
-- client-side reads are the matching half of the same sweep and live with the
-- select strings they belong to ($lib/notebook-selects).
--
-- THE LIST WAS BUILT BY ENUMERATION, NOT BY MEMORY: every function and view in
-- the schema that names notebook_entries or notebook_entry_photos was walked,
-- and each one is either here or is a WRITE against a row the caller already
-- named (add_photo, add_note, flag, resolve, override, move, pin), which cannot
-- put a deleted row into a list. 4f is the one that turned up that way.
-- ---------------------------------------------------------------------------

-- 4a. The activity view (0091). Recreated with the filter, so a deleted entry
-- cannot ride the "recent activity" sort back into a feed that is otherwise
-- excluding it, and nothing that joins against the view can count one.
--
-- Its photo sub-select gains the same clause: `last_activity_at` means "when
-- this entry was last worked on", and a photo that is no longer part of the
-- entry should not be what makes it look recent.
--
-- Still security_invoker, so it adds no reach: the caller's own RLS decides
-- which entries it sees, exactly as before.
drop view if exists public.notebook_entry_activity;
create view public.notebook_entry_activity
with (security_invoker = true) as
select
	e.id,
	e.student_id,
	greatest(
		e.upload_timestamp,
		(select max(n.created_at) from public.notebook_entry_notes n where n.entry_id = e.id),
		(select max(p.created_at)
			from public.notebook_entry_photos p
			where p.entry_id = e.id and p.removed_at is null)
	) as last_activity_at
from public.notebook_entries e
where e.deleted_at is null;

grant select on public.notebook_entry_activity to authenticated;

-- 4b. The grid roster (0098's definition, filter added). The `holders` branch is
-- what keeps a student who LEFT a class but filed work in it on the grid -- so a
-- student whose only entries in this section are deleted must stop being a
-- holder, or the grid grows a row of nothing but missing cells for someone who
-- is not in the class and has no work in it either.
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
				where e.student_id = p.id
					and e.section_id = p_section_id
					and e.deleted_at is null
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

-- 4c. The compliance grid (0098's definition, filters added). THREE reads of
-- notebook_entries here plus the roster's, and they are one question asked four
-- ways, so all four get the same clause:
--
--   * free_entries -- a count shown beside a student's name.
--   * latest       -- the distinct-on that picks WHICH entry a cell shows.
--                     Without the filter a deleted entry can be the newest one
--                     and win the pick, so the cell would report the status of
--                     something that is not there -- and a deleted FLAGGED entry
--                     would keep a cell red forever.
--   * counts       -- the multi-entry badge.
--   * (the roster, 4b.)
--
-- Everything else is 0098's, verbatim.
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
					and e.deleted_at is null
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
			and e.deleted_at is null
		order by e.session_id, e.student_id, e.upload_timestamp desc, e.id desc
	),
	counts as (
		select e.session_id, e.student_id, count(*) as n
		from public.notebook_entries e
		where e.session_id in (select id from sess)
			and e.section_id = p_section_id
			and e.deleted_at is null
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

-- 4d. One student's whole notebook as a payload (0106's definition, filters
-- added). This feeds BOTH notebook_review_student_notebook (an instructor
-- opening a name on the grid) and notebook_view_as_notebook (an admin previewing
-- a student's own screen) -- which is exactly why the filters belong here rather
-- than in either caller: the view-as preview's whole promise is that it shows
-- what the student sees, and a student does not see their deleted work.
--
-- Two filters: the entries, and each entry's photos. The notes are untouched --
-- a note has no removal of its own, and superseding is what a revision does.
create or replace function public._notebook_student_payload(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_uid uuid := public._notebook_user_id_for_email(v_email);
	v_name text;
	v_sections uuid[];
	v_section_label text;
	v_entries jsonb;
	v_folders jsonb;
	v_sessions jsonb;
	v_activity jsonb;
begin
	select min(e.display_name) into v_name
	from public.classroom_enrollments e
	where e.student_email = v_email and e.active;

	select coalesce(array_agg(e.section_id), '{}'::uuid[]) into v_sections
	from public.classroom_enrollments e
	where e.student_email = v_email and e.active;

	select case
			when count(*) = 0 then null
			when count(*) = 1 then min(nullif(concat_ws(' · ', c.code, s.label), ''))
			else count(*)::text || ' classes'
		end
	into v_section_label
	from public.classroom_sections s
	join public.classroom_courses c on c.id = s.course_id
	where s.id = any(v_sections);

	-- THEIR ENTRIES, ALL OF THEM -- every section and none, which is the point
	-- of 0106. It matches what the staff policy allows either caller to select
	-- directly, so this payload can never be a wider door than the ordinary
	-- read; the deleted ones are the one thing it is now narrower by.
	select coalesce(jsonb_agg(jsonb_build_object(
			'id', e.id,
			'session_id', e.session_id,
			'section_id', e.section_id,
			'folder_id', e.folder_id,
			'pinned_at', e.pinned_at,
			'custom_label', e.custom_label,
			'upload_timestamp', e.upload_timestamp,
			'status', e.status,
			'flag_reason', e.flag_reason,
			'instructor_comment', e.instructor_comment,
			'session', (
				select jsonb_build_object(
					'session_label', ss.session_label,
					'unit_number', ss.unit_number,
					'session_date', ss.session_date
				)
				from public.notebook_sessions ss where ss.id = e.session_id
			),
			'photos', coalesce((
				select jsonb_agg(jsonb_build_object(
					'id', p.id,
					'drive_file_id', p.drive_file_id,
					'variant', p.variant,
					'sequence_order', p.sequence_order,
					'original_filename', p.original_filename
				) order by p.sequence_order)
				from public.notebook_entry_photos p
				where p.entry_id = e.id and p.removed_at is null
			), '[]'::jsonb),
			-- EVERY revision: which one is current is derived client-side
			-- (noteThreads) and the feed shows the history.
			'notes', coalesce((
				select jsonb_agg(jsonb_build_object(
					'id', n.id,
					'entry_id', n.entry_id,
					'note_id', n.note_id,
					'revision', n.revision,
					'content', n.content,
					'created_at', n.created_at
				) order by n.created_at, n.revision)
				from public.notebook_entry_notes n where n.entry_id = e.id
			), '[]'::jsonb)
		) order by e.upload_timestamp desc), '[]'::jsonb)
	into v_entries
	from public.notebook_entries e
	where e.student_id = v_uid
		and e.deleted_at is null;

	select coalesce(jsonb_agg(jsonb_build_object(
			'id', f.id, 'name', f.name, 'color', f.color, 'created_at', f.created_at
		) order by f.name), '[]'::jsonb)
	into v_folders
	from public.notebook_folders f
	where f.student_id = v_uid;

	select coalesce(jsonb_agg(jsonb_build_object(
			'id', ss.id,
			'section_id', pg.section_id,
			'unit_number', ss.unit_number,
			'session_date', ss.session_date,
			'session_label', ss.session_label
		) order by ss.session_date desc, ss.id), '[]'::jsonb)
	into v_sessions
	from public.notebook_session_postings pg
	join public.notebook_sessions ss on ss.id = pg.session_id
	where pg.section_id = any(v_sections);

	-- The view already excludes deleted entries (4a), so this needs no clause of
	-- its own -- which is the reason the filter went into the view rather than
	-- into each of its readers.
	select coalesce(jsonb_agg(jsonb_build_object(
			'id', a.id, 'last_activity_at', a.last_activity_at
		)), '[]'::jsonb)
	into v_activity
	from public.notebook_entry_activity a
	where a.student_id = v_uid;

	return jsonb_build_object(
		'student', jsonb_build_object(
			'email', v_email,
			'display_name', v_name,
			-- null = on a roster, no account yet.
			'user_id', v_uid
		),
		'section_label', v_section_label,
		'entries', v_entries,
		'folders', v_folders,
		'sessions', v_sessions,
		'activity', v_activity
	);
end;
$$;

revoke all on function public._notebook_student_payload(text) from public;

-- 4e. Detaching a check-in's entries (0098's definition, count corrected).
--
-- THE UPDATE STILL COVERS EVERY ENTRY, DELETED ONES INCLUDED, AND MUST. A
-- deleted entry still carries the composite key to notebook_session_postings
-- (0098), so a posting cannot be removed while one still points at it -- leaving
-- them attached would trade a wrong count for a foreign-key violation.
--
-- What changes is only the RETURNED COUNT, which is a number a teacher reads
-- ("N entries were kept and relabelled"). It should describe the work that is
-- still in the class, so it counts the live rows.
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

	-- Counted BEFORE the update, which is when `session_id` still identifies
	-- the rows in question.
	select count(*) into v_detached
	from public.notebook_entries e
	where e.session_id = p_session_id
		and (p_section_id is null or e.section_id = p_section_id)
		and e.deleted_at is null;

	update public.notebook_entries e
	set session_id = null,
		custom_label = coalesce(nullif(btrim(e.custom_label), ''), v_fallback)
	where e.session_id = p_session_id
		and (p_section_id is null or e.section_id = p_section_id);

	return coalesce(v_detached, 0);
end;
$$;

revoke all on function public._notebook_detach_session_entries(uuid, uuid) from public;

-- 4f. Deleting a folder (0088's definition, count corrected) -- the same shape
-- as 4e, found by walking every function that reads either table rather than by
-- working from the list of surfaces anybody remembered.
--
-- THE UPDATE STILL UNFILES EVERY ENTRY, DELETED ONES INCLUDED, AND MUST: the
-- entry's folder link is a composite key to notebook_folders (id, student_id)
-- with no on-delete action, so a deleted entry left pointing at the folder would
-- block the folder's own removal.
--
-- What changes is the RETURNED COUNT, which the student reads as "N entries
-- moved to Unfiled". It should name the entries they can still see.
create or replace function public.notebook_delete_folder(p_folder_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_unfiled integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	perform 1
	from public.notebook_folders f
	where f.id = p_folder_id and f.student_id = v_uid
	for update;
	if not found then
		raise exception 'That folder does not exist or is not yours.';
	end if;

	-- Counted BEFORE the update, which is when folder_id still identifies them.
	select count(*) into v_unfiled
	from public.notebook_entries e
	where e.folder_id = p_folder_id
		and e.student_id = v_uid
		and e.deleted_at is null;

	update public.notebook_entries e
	set folder_id = null
	where e.folder_id = p_folder_id and e.student_id = v_uid;

	delete from public.notebook_folders f
	where f.id = p_folder_id and f.student_id = v_uid;

	return jsonb_build_object('ok', true, 'unfiled_entries', v_unfiled);
end;
$$;

revoke all on function public.notebook_delete_folder(uuid) from public;
grant execute on function public.notebook_delete_folder(uuid) to authenticated;
