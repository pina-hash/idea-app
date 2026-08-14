-- 0097_notebook_documentation_check.sql
--
-- DOCUMENTATION CHECK: a notebook unit becomes a gradeable IDEA Classroom item.
--
-- Apply manually in the Supabase SQL editor, after 0096.
--
-- WHAT THIS CLOSES. The notebook grid has always held the evidence a
-- Documentation Check grade is made of -- which check-ins a student filed, on
-- time or late, excused, flagged and why -- and it had nowhere to put the
-- resulting grade. So the notebook grew its OWN CSV export with a suggested
-- score and a blank column for the real one, and a Documentation Check lived
-- outside the gradebook that every other assignment lands in. This migration
-- gives a notebook unit a Classroom item to be graded ON, after which the
-- grade is written by the SAME classroom_grade_submission every other
-- assignment uses, stored in the SAME classroom_submissions row shape, and
-- exported through the SAME FACTS CSV. The notebook's own export goes away
-- with it.
--
-- THE ONE NEW THING IS A LINK, AND NOTHING ELSE.
--   * NO grading RPC. classroom_grade_submission (0086, re-signed by 0095) is
--     the only writer of a score, unchanged. A second one would be a second
--     copy of the rubric validation, the override rule and the release gate.
--   * NO rubric table. The four criteria are an ordinary rubric on the linked
--     item, installed through classroom_set_rubric like any other.
--   * NO permission check of its own for GRADING. Grading a Documentation
--     Check requires exactly what grading any Classroom item requires, which
--     is classroom_can_review_submission -- the caller manages a section the
--     item is posted to AND that the student is enrolled in. This file adds no
--     parallel rule and could not weaken that one if it tried.
--
-- WHY A JOIN TABLE AND NOT A COLUMN. A notebook unit is (section, unit
-- number) -- unit numbers are scoped to a section by construction, since
-- notebook_sessions carries both. A classroom ITEM is section-agnostic: 0085
-- made one canonical record posted to N sections through classroom_postings
-- precisely so an edit reaches every class at once. So "Unit 1 Documentation
-- Check for Block 2" is a fact about a PAIR, which is a row, not a column on
-- either side. Three sections running the same unit therefore hold three rows
-- and may each point at their own item -- or all at one item posted to all
-- three, which classroom_postings already models and this table inherits for
-- free.
--
-- THE COMPOSITE FK IS THE POINT, and it is the 0069 / 0088 / 0094 idiom a
-- third time. classroom_postings carries `unique (item_id, section_id)`, so
-- referencing that pair makes "linked to an item that is not posted to this
-- section" UNREPRESENTABLE rather than merely refused by an RPC -- and the
-- refusal survives every path, including a raw insert by a table owner. It
-- also means unposting the item from the section (or deleting either) takes
-- the link with it, with no bookkeeping: a link to a class that can no longer
-- see the item is not a link worth keeping.
--
-- AN UNLINKED UNIT IS A NORMAL STATE, NOT AN ERROR. Most units have no
-- Documentation Check item, and a teacher who has not made one yet must see
-- the grid working exactly as before. Nothing here is required by anything;
-- every read of this table is a left join in spirit.
--
-- ZERO CLIENT WRITE GRANTS, as everywhere in the notebook and in Classroom:
-- select only, and both writes are SECURITY DEFINER RPCs that re-check the
-- caller inside their own bodies.

-- ---------------------------------------------------------------------------
-- 1. The link.
-- ---------------------------------------------------------------------------

create table if not exists public.notebook_unit_items (
	-- One item per (section, unit): a unit has ONE Documentation Check, and
	-- the primary key is what says so.
	section_id uuid not null,
	unit_number integer not null check (unit_number between 0 and 1000),
	item_id uuid not null,
	linked_by text not null,
	linked_at timestamptz not null default now(),
	primary key (section_id, unit_number),
	-- See the header. The referenced pair is classroom_postings' own unique
	-- constraint, in its column order.
	constraint notebook_unit_items_posting_fkey
		foreign key (item_id, section_id)
		references public.classroom_postings (item_id, section_id)
		on delete cascade
);

create index if not exists notebook_unit_items_item_idx
	on public.notebook_unit_items (item_id);

-- ---------------------------------------------------------------------------
-- 2. Privileges + RLS.
-- ---------------------------------------------------------------------------
--
-- Readable by whoever manages the section, which is the same question every
-- other notebook staff read asks (classroom_manages_section, i.e. the teacher
-- of record or the 0067 admin tier). Students are deliberately not given a
-- read: the item itself is what they see, in Classroom, like any assignment --
-- this table is the teacher's own wiring and tells a student nothing their
-- classwork page does not already say.

revoke all on public.notebook_unit_items from anon, authenticated;
grant select on public.notebook_unit_items to authenticated;
alter table public.notebook_unit_items enable row level security;

drop policy if exists "section staff read notebook unit links" on public.notebook_unit_items;
create policy "section staff read notebook unit links"
	on public.notebook_unit_items
	for select
	to authenticated
	using (public.classroom_manages_section(section_id));

-- ---------------------------------------------------------------------------
-- 3. Link / unlink.
-- ---------------------------------------------------------------------------

-- Point a unit at an item. Upsert, so re-pointing a unit at a different item
-- is the same call (the notebook_admin_upsert_session convention: one function
-- for create and edit).
--
-- Every refusal here RAISES rather than returning a structured refusal: these
-- are setup preconditions a picker already prevents, not outcomes a grader
-- reaches in the course of normal work. The message is written to be shown.
create or replace function public.notebook_link_unit_item(
	p_section_id uuid,
	p_unit_number integer,
	p_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_kind text;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_section_id is null or not exists (
		select 1 from public.classroom_sections s where s.id = p_section_id
	) then
		raise exception 'That section does not exist.';
	end if;
	if not public.classroom_manages_section(p_section_id) then
		raise exception 'Only the section instructor or a site admin can link a Documentation Check.';
	end if;
	if p_unit_number is null or p_unit_number < 0 or p_unit_number > 1000 then
		raise exception 'Unit number must be between 0 and 1000.';
	end if;

	select i.kind into v_kind from public.classroom_items i where i.id = p_item_id;
	if v_kind is null then
		raise exception 'That classwork item does not exist.';
	end if;
	-- Only an assignment carries points, a rubric and a submission row, which
	-- is everything a grade is made of. classroom_items has no way to change
	-- an item's kind after creation, so this cannot go stale.
	if v_kind <> 'assignment' then
		raise exception 'A Documentation Check has to be an assignment; % cannot be graded.', v_kind;
	end if;
	-- The composite FK below would refuse this anyway. Checking first turns a
	-- constraint-violation string into a sentence a teacher can act on.
	if not exists (
		select 1 from public.classroom_postings pg
		where pg.item_id = p_item_id and pg.section_id = p_section_id
	) then
		raise exception 'That assignment is not posted to this class, so this class cannot be graded on it.';
	end if;

	insert into public.notebook_unit_items (section_id, unit_number, item_id, linked_by, linked_at)
	values (p_section_id, p_unit_number, p_item_id, public.current_user_email(), now())
	on conflict (section_id, unit_number) do update
		set item_id = excluded.item_id,
			linked_by = excluded.linked_by,
			linked_at = now();

	return jsonb_build_object(
		'section_id', p_section_id,
		'unit_number', p_unit_number,
		'item_id', p_item_id
	);
end;
$$;

revoke all on function public.notebook_link_unit_item(uuid, integer, uuid) from public;
grant execute on function public.notebook_link_unit_item(uuid, integer, uuid) to authenticated;

-- Unlink. It removes the LINK and nothing else: the assignment, its rubric and
-- every grade already written stay exactly as they are, because they are
-- ordinary Classroom rows that were never owned by the notebook. Unlinking
-- only stops this grid offering to grade them.
create or replace function public.notebook_unlink_unit_item(
	p_section_id uuid,
	p_unit_number integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_removed integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.classroom_manages_section(p_section_id) then
		raise exception 'Only the section instructor or a site admin can unlink a Documentation Check.';
	end if;

	delete from public.notebook_unit_items
	where section_id = p_section_id and unit_number = p_unit_number;
	get diagnostics v_removed = row_count;

	return jsonb_build_object('removed', v_removed);
end;
$$;

revoke all on function public.notebook_unlink_unit_item(uuid, integer) from public;
grant execute on function public.notebook_unlink_unit_item(uuid, integer) to authenticated;
