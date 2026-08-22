-- 0128_classroom_instructor_copy.sql
-- The INSTRUCTOR WORKING COPY of a spec-driven assignment: an instructor fills
-- the assignment out themselves, their answers autosave exactly the way a
-- student's do, and one copy per item can be designated the ANSWER KEY that
-- every instructor on that item can read.
--
-- ITS OWN TABLE, NOT A FLAG ON classroom_responses, for 0090's stated reason,
-- and it is the whole design: classroom_responses' policy admits the row's own
-- student, and every read of it across this app -- the grading console, the
-- FACTS CSV, the Grades tab, the export -- is written on the premise that a row
-- there belongs to a student on somebody's roster. Folding an instructor's
-- answers in behind an `is_instructor` column would make ONE forgotten
-- `and not is_instructor` anywhere in that set enough to grade a teacher, hand
-- their answers to the class, or put an answer key in a CSV. A wrong table name
-- fails loudly where a forgotten filter leaks.
--
-- PER-BLOCK ROWS, mirroring classroom_responses column for column
-- (item / author / block / value / updated_at, that primary key). The engine
-- autosaves one block at a time, so a document-per-instructor would have needed
-- a different save body, a different transfer and a different renderer contract
-- for the sake of a shape nothing else here uses.
--
-- WHO MAY DO WHAT, all of it inside these SECURITY DEFINER bodies and the
-- policies below, none of it in a client:
--
--   * WRITE + READ YOUR OWN COPY: any instructor who manages a section this
--     assignment is posted to -- classroom_can_read_instructor_material (0090),
--     the same gate the answer-key attachments already use. NOT
--     _classroom_manages_item (the "manages EVERY posted section" editing bar):
--     a working copy is one person's own work on their own class, not a change
--     to what every other class sees, and a Block 4 instructor who teaches one
--     of an item's three sections must be able to keep one.
--   * READ THE DESIGNATED KEY: the same gate. That is the point of designating
--     one -- an instructor reads the key another instructor authored.
--   * NO STUDENT READ PATH EXISTS. classroom_can_read_instructor_material is
--     the manager-only half of classroom_can_read_item with the enrolled
--     student branch removed entirely, so there is no published-content branch
--     to fall through. No policy here admits a student, no payload carries one
--     of these rows to a student page, and no proxy serves them.
--
-- THE WRITE RPCs TAKE NO IDENTITY PARAMETER. The author is
-- current_user_email(), so "an instructor can only write their own copy" is a
-- property of the SIGNATURE rather than a check that could be got wrong -- the
-- classroom_save_response doctrine, applied again.
--
-- ONE KEY PER ITEM, and designating REPLACES. classroom_instructor_keys is
-- keyed on item_id alone, so there is no state where two copies are both "the"
-- key and no reconciliation to get wrong.
--
-- FILE-UPLOAD BLOCKS ARE OUT OF SCOPE HERE, deliberately and visibly: there is
-- no instructor-side counterpart to classroom_submission_files, so an
-- imageZone block takes no value in a working copy and the save RPC refuses one
-- by the same rule the student path uses (only textField, table and checklist
-- take a typed response). The surface says so on the block rather than
-- rendering a control that does nothing.
--
-- ZERO CLIENT WRITE GRANTS, as everywhere in this module.
--
-- Apply manually in the Supabase SQL editor, after 0127.

-- ---------------------------------------------------------------------------
-- 1. Tables.
-- ---------------------------------------------------------------------------

-- Column for column classroom_responses (0086), with student_email replaced by
-- instructor_email. The check is the same normalization the whole email-keyed
-- half of this schema uses.
create table if not exists public.classroom_instructor_responses (
	item_id uuid not null references public.classroom_items (id) on delete cascade,
	instructor_email text not null
		check (instructor_email = lower(btrim(instructor_email)) and instructor_email like '%@%'),
	-- A spec block id. There is no '@declaration' counterpart: a declaration is
	-- a student attesting to their own conduct, which an instructor copy is not.
	block_id text not null check (char_length(block_id) between 1 and 64),
	value jsonb not null,
	updated_at timestamptz not null default now(),
	primary key (item_id, instructor_email, block_id)
);

create index if not exists classroom_instructor_responses_item_idx
	on public.classroom_instructor_responses (item_id, instructor_email);

comment on table public.classroom_instructor_responses is
	'An instructor own working copy of an assignment spec, one row per block. Never a submission: no grade, no state, no roster, and no student read path.';

create table if not exists public.classroom_instructor_keys (
	item_id uuid primary key references public.classroom_items (id) on delete cascade,
	instructor_email text not null
		check (instructor_email = lower(btrim(instructor_email)) and instructor_email like '%@%'),
	designated_at timestamptz not null default now(),
	designated_by text not null
);

comment on table public.classroom_instructor_keys is
	'Which instructor working copy is this item answer key. One row per item: designating replaces.';

-- ---------------------------------------------------------------------------
-- 2. Visibility. SELECT only, as everywhere else in this module.
-- ---------------------------------------------------------------------------

-- WHICH COPY IS THE KEY, answered for a caller who may ask. The gate is INSIDE
-- the body rather than left to the calling policy: this function is granted to
-- `authenticated` (it is named directly in an RLS `using` clause, so it is
-- evaluated as the querying role), and without the gate any signed-in account
-- holding an item id could read back a staff email address.
create or replace function public.classroom_instructor_key_email(p_item_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
	select case
		when public.classroom_can_read_instructor_material(p_item_id) then (
			select k.instructor_email
			from public.classroom_instructor_keys k
			where k.item_id = p_item_id
		)
	end;
$$;

revoke all on function public.classroom_instructor_key_email(uuid) from public;
grant execute on function public.classroom_instructor_key_email(uuid) to authenticated;

revoke all on public.classroom_instructor_responses from anon, authenticated;
grant select on public.classroom_instructor_responses to authenticated;
alter table public.classroom_instructor_responses enable row level security;

-- Two branches, and the outer gate is what makes a student's answer NO before
-- either is considered: your own copy, or the one copy designated as the key.
-- Another instructor's UNDESIGNATED working copy is nobody else's to read --
-- it is a draft of a key, and half a key on a screen is worse than none.
drop policy if exists "classroom instructor copies own or designated key" on public.classroom_instructor_responses;
create policy "classroom instructor copies own or designated key"
	on public.classroom_instructor_responses
	for select
	to authenticated
	using (
		public.classroom_can_read_instructor_material(item_id)
		and (
			instructor_email = public.current_user_email()
			or instructor_email = public.classroom_instructor_key_email(item_id)
		)
	);

revoke all on public.classroom_instructor_keys from anon, authenticated;
grant select on public.classroom_instructor_keys to authenticated;
alter table public.classroom_instructor_keys enable row level security;

drop policy if exists "classroom instructor keys follow their item" on public.classroom_instructor_keys;
create policy "classroom instructor keys follow their item"
	on public.classroom_instructor_keys
	for select
	to authenticated
	using (public.classroom_can_read_instructor_material(item_id));

-- ---------------------------------------------------------------------------
-- 3. Writes.
-- ---------------------------------------------------------------------------

-- The instructor-side counterpart of _classroom_engine_student (0086): resolve
-- the caller, refuse anyone who is not an instructor on this assignment, and
-- return the email every write below keys on. No `published` check -- a key is
-- normally authored BEFORE the assignment goes out.
create or replace function public._classroom_instructor_copy_author(p_item_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
begin
	if (select auth.uid()) is null or coalesce(v_email, '') = '' then
		raise exception 'You must be signed in.';
	end if;
	if not exists (
		select 1 from public.classroom_items i
		where i.id = p_item_id and i.kind = 'assignment'
	) then
		raise exception 'That assignment does not exist.';
	end if;
	if not public.classroom_can_read_instructor_material(p_item_id) then
		raise exception 'Only an instructor for one of this classes can keep a working copy of it.';
	end if;
	return v_email;
end;
$$;

revoke all on function public._classroom_instructor_copy_author(uuid) from public;

-- Autosave one block of the caller's own working copy. The block vocabulary is
-- classroom_save_response's, minus the two things a working copy has no notion
-- of: the submitted lock (there is no submission) and the approval gate (there
-- is nobody to approve it).
create or replace function public.classroom_save_instructor_response(
	p_item_id uuid,
	p_block_id text,
	p_value jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_instructor_copy_author(p_item_id);
	v_spec jsonb;
	v_block jsonb;
	v_type text;
begin
	select a.spec into v_spec
	from public.classroom_assignment_specs a where a.item_id = p_item_id;
	if v_spec is null then
		raise exception 'This assignment has no interactive spec.';
	end if;
	if p_value is null or pg_column_size(p_value) > 100000 then
		raise exception 'That response is too large.';
	end if;
	if p_block_id = '@declaration' then
		raise exception 'An instructor copy carries no declaration.';
	end if;

	select b.blk into v_block
	from jsonb_array_elements(v_spec->'modules') as m(mod),
		jsonb_array_elements(m.mod->'blocks') as b(blk)
	where b.blk->>'id' = p_block_id
	limit 1;
	if v_block is null then
		raise exception 'Unknown block "%".', p_block_id;
	end if;
	v_type := v_block->>'type';
	if v_type not in ('textField', 'table', 'checklist') then
		raise exception 'Block "%" does not take a typed response.', p_block_id;
	end if;

	insert into public.classroom_instructor_responses
		(item_id, instructor_email, block_id, value, updated_at)
	values (p_item_id, v_email, p_block_id, p_value, now())
	on conflict (item_id, instructor_email, block_id) do update
		set value = excluded.value, updated_at = now();

	return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.classroom_save_instructor_response(uuid, text, jsonb) from public;
grant execute on function public.classroom_save_instructor_response(uuid, text, jsonb) to authenticated;

-- Designate the CALLER'S OWN copy as this item's answer key. No email
-- parameter, for the same reason the save has none. An EMPTY copy is refused
-- structurally rather than raised: it is an ordinary mistake with an obvious
-- remedy, and the surface renders it where the instructor is working.
create or replace function public.classroom_designate_instructor_key(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_instructor_copy_author(p_item_id);
begin
	if not exists (
		select 1 from public.classroom_instructor_responses r
		where r.item_id = p_item_id and r.instructor_email = v_email
	) then
		return jsonb_build_object('ok', false, 'reason', 'empty_copy');
	end if;

	insert into public.classroom_instructor_keys
		(item_id, instructor_email, designated_at, designated_by)
	values (p_item_id, v_email, now(), v_email)
	on conflict (item_id) do update
		set instructor_email = excluded.instructor_email,
			designated_at = now(),
			designated_by = excluded.designated_by;

	return jsonb_build_object('ok', true, 'instructor_email', v_email);
end;
$$;

revoke all on function public.classroom_designate_instructor_key(uuid) from public;
grant execute on function public.classroom_designate_instructor_key(uuid) to authenticated;

-- Withdraw the designation. The AUTHOR of the key, whoever designated it, or an
-- admin -- not every instructor on the item, because taking another
-- instructor's key down is not the same act as putting your own up. Anyone who
-- may keep a copy can still REPLACE the key by designating theirs, so no item
-- can be left stuck with a key nobody present can move.
create or replace function public.classroom_undesignate_instructor_key(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_instructor_copy_author(p_item_id);
	v_author text;
	v_by text;
begin
	select k.instructor_email, k.designated_by into v_author, v_by
	from public.classroom_instructor_keys k
	where k.item_id = p_item_id;
	if v_author is null then
		return jsonb_build_object('ok', false, 'reason', 'no_key');
	end if;
	if v_author <> v_email and coalesce(v_by, '') <> v_email and not public.is_admin() then
		return jsonb_build_object('ok', false, 'reason', 'not_yours');
	end if;

	delete from public.classroom_instructor_keys where item_id = p_item_id;
	return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.classroom_undesignate_instructor_key(uuid) from public;
grant execute on function public.classroom_undesignate_instructor_key(uuid) to authenticated;
