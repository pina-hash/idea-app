-- 0120_notebook_session_item_link.sql
-- A notebook check-in can hang off the classroom item it belongs to, so a
-- day's material and the notebook requirement that goes with it are ONE row in
-- the class instead of two.
--
-- THE PROBLEM. A check-in is a notebook_sessions row unioned into the class
-- stream in the VIEW layer (see src/lib/classroom/class-check-ins.ts), with no
-- foreign key to classroom_items at all. So "read the shop-floor rules" and
-- "photograph your notes on the shop-floor rules" were two separate rows a
-- student had to connect for themselves, on a page where everything else that
-- belongs together is already one thing.
--
-- THE SHAPE, and it is deliberately the SMALLEST one that works: a check-in
-- does NOT become a classroom_items kind. Making it one would give it points,
-- a due date, a submission and a rubric -- a SECOND scoring path for work that
-- is already graded once, through notebook_unit_items -> classroom_submissions
-- (0097). That single-number-per-student guarantee is the whole reason 0097
-- exists and nothing here may weaken it. So the POSTING gains a pointer:
--
--   notebook_session_postings.item_id uuid null
--     -> classroom_postings (item_id, section_id)
--
-- THE COMPOSITE KEY IS THE POINT, and it is the same grain notebook_unit_items
-- already uses (0097). Pointing at (item_id, section_id) rather than at
-- classroom_items(id) makes "the item is posted to the same class the check-in
-- runs in" a property of the SCHEMA: there is no way to link a check-in in
-- period 2 to an item that only appears in period 5, so no RPC has to re-check
-- it and a raw insert cannot route around it.
--
-- NULL IS THE EXISTING BEHAVIOUR, WHICH IS WHY NOTHING IS BACKFILLED. A posting
-- with no item_id emits its own stream row exactly as it does today; a posting
-- with one renders as a block on that item and stops emitting a row. Both
-- shapes are live at once and every check-in that exists right now is the first
-- one. There is nothing to migrate and nothing to undo if this is never used.
--
-- ON DELETE SET NULL (item_id), NOT CASCADE. Unposting the item from a class
-- must not delete the check-in's posting there: that posting is the check-in's
-- presence in the class, and deleting it would take the students' filed entries
-- with it (the (session_id, section_id) key 0098 built). Returning the check-in
-- to its own stream row is the correct, lossless answer to "that item is not in
-- this class any more". The column-list form of SET NULL is PostgreSQL 15+;
-- this project is 17, and the whole-row form cannot be used because section_id
-- is NOT NULL and would be nulled with it.
--
-- ZERO CLIENT WRITE GRANTS, as everywhere: the column is readable, and both
-- writes are SECURITY DEFINER RPCs that re-check the caller in their own body.

-- ---------------------------------------------------------------------------
-- 1. The column and the key.
-- ---------------------------------------------------------------------------

alter table public.notebook_session_postings
	add column if not exists item_id uuid;

-- Postgres has no `add constraint if not exists`, and a blind drop-then-add
-- raises 2BP01 on the second run once anything depends on it. Guard on the
-- catalog instead, so re-pasting this file is ordinary.
do $$
begin
	if not exists (
		select 1 from pg_constraint
		where conname = 'notebook_session_postings_item_fkey'
			and conrelid = 'public.notebook_session_postings'::regclass
	) then
		alter table public.notebook_session_postings
			add constraint notebook_session_postings_item_fkey
			foreign key (item_id, section_id)
			references public.classroom_postings (item_id, section_id)
			on delete set null (item_id);
	end if;
end;
$$;

create index if not exists notebook_session_postings_item_idx
	on public.notebook_session_postings (item_id)
	where item_id is not null;

comment on column public.notebook_session_postings.item_id is
	'The classroom item this check-in hangs off in this class (0120). Null = it '
	'emits its own class-stream row, which is every check-in made before this '
	'migration. The composite key to classroom_postings is what guarantees the '
	'item is posted to the same section.';

-- ---------------------------------------------------------------------------
-- 2. Link / unlink.
-- ---------------------------------------------------------------------------
--
-- Both mirror notebook_link_unit_item / notebook_unlink_unit_item (0097) one
-- for one, including the decision to RAISE rather than return a structured
-- refusal: these are setup preconditions the composer and the item page already
-- prevent, not outcomes somebody reaches in the course of normal work. Every
-- message is written to be shown to the person who hit it.
--
-- ONE SECTION AT A TIME, on purpose. A check-in can run in three classes and
-- the item it belongs to may be posted to a different three; the pair is the
-- grain at which the question "does this item belong to this check-in here"
-- has an answer. The bulk path (0120's notebook_create_item_check_in below)
-- calls this per section rather than reimplementing it.

create or replace function public.notebook_link_session_item(
	p_session_id uuid,
	p_section_id uuid,
	p_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_linked integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_section_id is null or not exists (
		select 1 from public.classroom_sections s where s.id = p_section_id
	) then
		raise exception 'That class does not exist.';
	end if;
	if not public.classroom_manages_section(p_section_id) then
		raise exception 'Only the class instructor or a site admin can attach a check-in to an item.';
	end if;
	if not exists (
		select 1 from public.notebook_session_postings pg
		where pg.session_id = p_session_id and pg.section_id = p_section_id
	) then
		raise exception 'That check-in does not run in this class.';
	end if;
	if not exists (select 1 from public.classroom_items i where i.id = p_item_id) then
		raise exception 'That classwork item does not exist.';
	end if;
	-- The composite key below would refuse this anyway. Checking first turns a
	-- constraint-violation string into a sentence a teacher can act on.
	if not exists (
		select 1 from public.classroom_postings pg
		where pg.item_id = p_item_id and pg.section_id = p_section_id
	) then
		raise exception 'That item is not posted to this class, so a check-in here cannot hang off it.';
	end if;

	update public.notebook_session_postings
	set item_id = p_item_id
	where session_id = p_session_id and section_id = p_section_id;
	get diagnostics v_linked = row_count;

	return jsonb_build_object(
		'session_id', p_session_id,
		'section_id', p_section_id,
		'item_id', p_item_id,
		'linked', v_linked
	);
end;
$$;

revoke all on function public.notebook_link_session_item(uuid, uuid, uuid) from public;
grant execute on function public.notebook_link_session_item(uuid, uuid, uuid) to authenticated;

-- Unlink. It removes the POINTER and nothing else: the check-in, its postings,
-- every entry filed against it and every photo in them are untouched. The
-- check-in goes back to being its own row in the class stream, which is where
-- it was before anybody attached it.
create or replace function public.notebook_unlink_session_item(
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
	v_cleared integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.classroom_manages_section(p_section_id) then
		raise exception 'Only the class instructor or a site admin can detach a check-in from an item.';
	end if;

	update public.notebook_session_postings
	set item_id = null
	where session_id = p_session_id and section_id = p_section_id and item_id is not null;
	get diagnostics v_cleared = row_count;

	return jsonb_build_object('cleared', v_cleared);
end;
$$;

revoke all on function public.notebook_unlink_session_item(uuid, uuid) from public;
grant execute on function public.notebook_unlink_session_item(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Create a check-in that belongs to an item, in one round trip.
-- ---------------------------------------------------------------------------
--
-- WHAT THE COMPOSER CALLS. An item's check-in is staged in the form beside the
-- deck and the spec and applied the moment the item has an id, so this has to
-- be ONE call: a client-side create-then-link loop can stop halfway with
-- nobody able to say how much landed.
--
-- IT REIMPLEMENTS NOTHING. The session and its postings are created by
-- notebook_admin_upsert_session and each posting is pointed at the item by
-- notebook_link_session_item -- nested SECURITY DEFINER calls, which read the
-- session's JWT claims rather than the executing role and are therefore
-- authorized as the same caller. Every rule those two carry (the unit range,
-- the label, manage-every-target, item-posted-here) applies here unchanged.
--
-- THE SECTIONS ARE THE ITEM'S OWN, not a parameter. A check-in attached to an
-- item runs exactly where that item is posted; asking the caller to restate it
-- would let the two disagree, and the composite key would then refuse half the
-- postings after the session already existed.
create or replace function public.notebook_create_item_check_in(
	p_item_id uuid,
	p_unit_number integer,
	p_session_date date,
	p_session_label text
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
	v_session uuid;
	v_result jsonb;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not exists (select 1 from public.classroom_items i where i.id = p_item_id) then
		raise exception 'That classwork item does not exist.';
	end if;

	select coalesce(array_agg(pg.section_id), '{}'::uuid[]) into v_sections
	from public.classroom_postings pg
	where pg.item_id = p_item_id;

	if array_length(v_sections, 1) is null then
		raise exception 'That item is not posted to any class yet, so a check-in has nowhere to run.';
	end if;

	-- Creates the canonical check-in and one posting per section, refusing
	-- unless the caller manages every one of them.
	v_result := public.notebook_admin_upsert_session(
		v_sections,
		p_unit_number,
		p_session_date,
		p_session_label,
		null
	);
	v_session := (v_result ->> 'session_id')::uuid;

	foreach v_section in array v_sections loop
		perform public.notebook_link_session_item(v_session, v_section, p_item_id);
	end loop;

	return jsonb_build_object(
		'session_id', v_session,
		'item_id', p_item_id,
		'sections', array_length(v_sections, 1)
	);
end;
$$;

revoke all on function public.notebook_create_item_check_in(uuid, integer, date, text) from public;
grant execute on function public.notebook_create_item_check_in(uuid, integer, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. What this file did.
-- ---------------------------------------------------------------------------

do $$
declare
	v_postings integer;
	v_linked integer;
begin
	select count(*) into v_postings from public.notebook_session_postings;
	select count(*) into v_linked from public.notebook_session_postings where item_id is not null;
	raise notice '0120: % check-in postings, % attached to an item (0 is expected on first apply).',
		v_postings, v_linked;
end;
$$;
