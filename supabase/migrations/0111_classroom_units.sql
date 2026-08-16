-- 0111_classroom_units.sql
--
-- UNITS: teacher-defined groups ("Unit 1", "Rotation 3") that a class's content
-- is organized into, replacing the due-date buckets the Classwork tab inherited
-- from Google Classroom. These courses are taught in units and rotations, not in
-- "upcoming / past due", so the grouping is now the one the teacher authored.
--
-- Apply manually in the Supabase SQL editor, after 0110.
--
-- THIS FILE TOUCHES NO EXISTING FUNCTION, POLICY OR GRANT. It adds one table,
-- one nullable column, and five new functions. Every authority rule in the
-- module is exactly where 0082/0085 left it -- which is also what makes the
-- claim "no permission boundary moved" checkable rather than argued: there is
-- nothing here that could have moved one.
--
-- ---------------------------------------------------------------------------
-- WHY A UNIT BELONGS TO A COURSE, AND THE ASSIGNMENT TO THE CANONICAL ITEM
-- ---------------------------------------------------------------------------
--
-- Since 0085 there is ONE canonical record per piece of content and a POSTING is
-- nothing but "this item appears in this class", carrying no state of its own --
-- deliberately, because the moment a posting could hold its own copy of
-- something the copies could drift apart again. So the unit assignment is a
-- column on `classroom_items`, never on `classroom_postings`: an item posted to
-- three classes is filed once, and all three read the same answer by
-- construction rather than by three writes staying in step.
--
-- That forces the UNIT itself to be reachable from every class the item appears
-- in, which is why a unit belongs to a COURSE rather than to a section.
-- IDEA209H runs three sections on identical pacing (the same fact 0098 exists
-- for), so "Unit 1" is a fact about the course and every section of it shows the
-- same units in the same order. A section-scoped unit would mean creating "Unit
-- 1" three times, filing an item into one of them, and having it read as
-- unfiled in the other two.
--
-- KNOWN, ACCEPTED DEGRADATION: an item posted across sections of DIFFERENT
-- courses carries the unit of whichever course it was filed under, and reads as
-- unfiled in the other. That is honest (it genuinely is not in any of that
-- course's units) and it is a rare shape -- one handout in both IDEA209H and
-- ENG1H -- which the "Not in a unit" group renders perfectly well.
--
-- FILING IS NOT AN EDIT. classroom_set_item_unit never touches `edited_at`, for
-- the reason classroom_set_item_pinned does not: it changes where the item sits,
-- not what it says, so it must never raise a student's "Updated" badge. Tested.
--
-- A DUPLICATE LANDS UNFILED, and classroom_duplicate_item is deliberately NOT
-- recreated here to change that. Recreating it would mean copying 0101's body
-- forward, which is exactly the "diff it against the source or error semantics
-- quietly change" trap 0109 wrote down -- and a fresh draft with no unit is a
-- defensible answer that costs one click in the new class view.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

create table if not exists public.classroom_units (
	id uuid primary key default gen_random_uuid(),
	course_id uuid not null references public.classroom_courses(id) on delete cascade,
	name text not null,
	-- Manual order, set by handing over the full list (classroom_set_unit_order).
	-- 0 means "never placed by hand" and sorts behind anything that was.
	sort_order integer not null default 0,
	created_by text not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint classroom_units_name_len check (btrim(name) <> '' and length(name) <= 60)
);

-- Case- and whitespace-insensitive, so "unit 1" and "Unit 1 " cannot both exist
-- and the picker never offers two rows a teacher reads as the same unit.
create unique index if not exists classroom_units_course_name_key
	on public.classroom_units (course_id, lower(btrim(name)));

create index if not exists classroom_units_course_idx
	on public.classroom_units (course_id, sort_order);

-- ON DELETE SET NULL: a unit is ORGANIZATION, not a record. Deleting one unfiles
-- its items and loses nothing else -- the notebook-folder doctrine, and the
-- reason a unit gets a real delete at all while everything in this module that
-- holds history is archived instead.
alter table public.classroom_items
	add column if not exists unit_id uuid references public.classroom_units(id) on delete set null;

create index if not exists classroom_items_unit_idx on public.classroom_items (unit_id);

-- ---------------------------------------------------------------------------
-- 2. Privileges + RLS. SELECT only, as everywhere else in this module: there is
--    no client write grant on this table and never will be.
--
--    Readable to any signed-in user, MIRRORING classroom_courses exactly. A unit
--    is a name in the shared catalog ("Unit 3", "Rotation 1") sitting beside a
--    course code and title that are themselves readable to everyone; scoping it
--    tighter than the course it belongs to would be inconsistent for no gain.
-- ---------------------------------------------------------------------------

revoke all on public.classroom_units from anon, authenticated;
grant select on public.classroom_units to authenticated;
alter table public.classroom_units enable row level security;

drop policy if exists "classroom units readable" on public.classroom_units;
create policy "classroom units readable"
	on public.classroom_units
	for select
	to authenticated
	using (true);

-- ---------------------------------------------------------------------------
-- 3. Who may shape a course's units
--
-- The same shape classroom_manages_section has, lifted to the course: an admin,
-- or the teacher of record of at least one section of it. Internal (`_` prefix,
-- no grant) so it is reachable only from inside the definer functions below --
-- granted, it would be a probe for who teaches what.
--
-- is_admin() is spelled out rather than left to classroom_manages_section
-- because a course with NO sections yet has nothing for that scan to find, and
-- an admin setting a course up must not be locked out of it.
-- ---------------------------------------------------------------------------

create or replace function public._classroom_manages_course(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select p_course_id is not null and (
		public.is_admin()
		or exists (
			select 1 from public.classroom_sections s
			where s.course_id = p_course_id
				and public.classroom_manages_section(s.id)
		)
	);
$$;

revoke all on function public._classroom_manages_course(uuid) from public;

-- ---------------------------------------------------------------------------
-- 4. Writes
-- ---------------------------------------------------------------------------

-- Create or rename. ONE function for both (the notebook_admin_upsert_session
-- convention): a null id creates, a set id renames the row it names.
--
-- A duplicate name comes back as a STRUCTURED refusal rather than an exception,
-- because it is the one failure ordinary use reaches and the answer belongs
-- beside the field the teacher typed in.
create or replace function public.classroom_upsert_unit(
	p_course_id uuid,
	p_name text,
	p_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_email text := public.current_user_email();
	v_name text := btrim(coalesce(p_name, ''));
	v_course uuid := p_course_id;
	v_id uuid;
	v_next integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if v_name = '' then
		raise exception 'A unit needs a name.';
	end if;
	if length(v_name) > 60 then
		raise exception 'That unit name is too long (60 characters maximum).';
	end if;

	if p_id is not null then
		select course_id into v_course from public.classroom_units where id = p_id;
		if v_course is null then
			raise exception 'That unit does not exist.';
		end if;
	end if;

	if not public._classroom_manages_course(v_course) then
		raise exception 'Only a teacher of this course can change its units.';
	end if;

	if exists (
		select 1 from public.classroom_units
		where course_id = v_course
			and lower(btrim(name)) = lower(v_name)
			and (p_id is null or id <> p_id)
	) then
		return jsonb_build_object('ok', false, 'reason', 'duplicate_name', 'name', v_name);
	end if;

	if p_id is null then
		select coalesce(max(sort_order), 0) + 1 into v_next
		from public.classroom_units where course_id = v_course;
		insert into public.classroom_units (course_id, name, sort_order, created_by)
		values (v_course, v_name, v_next, v_email)
		returning id into v_id;
		return jsonb_build_object('ok', true, 'unit_id', v_id, 'created', true);
	end if;

	update public.classroom_units
	set name = v_name, updated_at = now()
	where id = p_id;
	return jsonb_build_object('ok', true, 'unit_id', p_id, 'created', false);
end;
$$;

revoke all on function public.classroom_upsert_unit(uuid, text, uuid) from public;
grant execute on function public.classroom_upsert_unit(uuid, text, uuid) to authenticated;

-- Delete. The items filed into it are UNFILED, not deleted -- the FK's
-- ON DELETE SET NULL does that, so there is no bookkeeping here that could get
-- it wrong. The count comes back so the confirmation can say what it cost.
create or replace function public.classroom_delete_unit(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_course uuid;
	v_items integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	select course_id into v_course from public.classroom_units where id = p_id;
	if v_course is null then
		raise exception 'That unit does not exist.';
	end if;
	if not public._classroom_manages_course(v_course) then
		raise exception 'Only a teacher of this course can change its units.';
	end if;

	select count(*) into v_items from public.classroom_items where unit_id = p_id;
	delete from public.classroom_units where id = p_id;
	return jsonb_build_object('ok', true, 'unfiled', v_items);
end;
$$;

revoke all on function public.classroom_delete_unit(uuid) from public;
grant execute on function public.classroom_delete_unit(uuid) to authenticated;

-- Manual order, set by handing over the FULL list in its new order -- the
-- classroom_set_item_order convention, for the same reason: what gets stored is
-- then always exactly the order somebody was looking at.
create or replace function public.classroom_set_unit_order(
	p_course_id uuid,
	p_unit_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_id uuid;
	v_i integer := 0;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not public._classroom_manages_course(p_course_id) then
		raise exception 'Only a teacher of this course can change its units.';
	end if;
	if p_unit_ids is null or array_length(p_unit_ids, 1) is null then
		raise exception 'Nothing to order.';
	end if;
	if array_length(p_unit_ids, 1) > 200 then
		raise exception 'At most 200 units per reorder.';
	end if;

	-- Every id must belong to THIS course, so a reorder can never reach a unit
	-- of a course the caller was never authorized against.
	foreach v_id in array p_unit_ids loop
		if not exists (
			select 1 from public.classroom_units where id = v_id and course_id = p_course_id
		) then
			raise exception 'One of those units is not part of this course.';
		end if;
	end loop;

	foreach v_id in array p_unit_ids loop
		v_i := v_i + 1;
		update public.classroom_units set sort_order = v_i, updated_at = now() where id = v_id;
	end loop;

	return jsonb_build_object('ok', true, 'ordered', v_i);
end;
$$;

revoke all on function public.classroom_set_unit_order(uuid, uuid[]) from public;
grant execute on function public.classroom_set_unit_order(uuid, uuid[]) to authenticated;

-- File an item into a unit, or out of one (a null unit unfiles it).
--
-- The bar is _classroom_manages_item -- manage EVERY class the item is posted to
-- -- and not the weaker "manage one of them", because the unit lives on the
-- canonical record: filing changes where the item sits for all of them at once,
-- which is the same reason editing takes that bar.
--
-- The unit must belong to a course one of the item's own postings is in.
-- Without that check an item could be filed into a unit no class it appears in
-- can see, which renders as a silently vanished item rather than a refusal.
create or replace function public.classroom_set_item_unit(
	p_item_id uuid,
	p_unit_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_course uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not exists (select 1 from public.classroom_items where id = p_item_id) then
		raise exception 'That item does not exist.';
	end if;
	if not public._classroom_manages_item(p_item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can file it.';
	end if;

	if p_unit_id is not null then
		select course_id into v_course from public.classroom_units where id = p_unit_id;
		if v_course is null then
			raise exception 'That unit does not exist.';
		end if;
		if not exists (
			select 1
			from public.classroom_postings pg
			join public.classroom_sections s on s.id = pg.section_id
			where pg.item_id = p_item_id and s.course_id = v_course
		) then
			return jsonb_build_object('ok', false, 'reason', 'wrong_course');
		end if;
	end if;

	-- Deliberately NOT an edit: filing changes where the item sits, not what it
	-- says, so it never stamps edited_at or raises an "Updated" badge -- exactly
	-- as classroom_set_item_pinned does not.
	update public.classroom_items
	set unit_id = p_unit_id, updated_at = now()
	where id = p_item_id;

	return jsonb_build_object('ok', true, 'item_id', p_item_id, 'unit_id', p_unit_id);
end;
$$;

revoke all on function public.classroom_set_item_unit(uuid, uuid) from public;
grant execute on function public.classroom_set_item_unit(uuid, uuid) to authenticated;
