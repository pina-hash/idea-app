-- 0304_classroom_team_signoffs.sql
--
-- THE SIGN-OFF QUEUE (ledger 0436, IDEA209H Unit 4; decision 71, every rule
-- Mr. Pina's, with his power-source change of 2026-10-26 in the seed lists the
-- manifests carry).
--
-- A team assignment declares its checkpoints (`team.checkpoints`, spec 16.5).
-- The first time a team's plan or the queue reads one, it is copied into
-- `classroom_signoff_checkpoints`, keyed by the post that declared it, and from
-- then on the checklist is ADMIN-EDITABLE DATA: a re-upload never overwrites
-- it. A team's checkpoint is every row with its key across the team's posts,
-- their items together, the title, date and gate from the post made first.
--
-- REQUEST, THEN APPROVE OR SEND BACK.
--   * Any member requests (`classroom_signoff_request`). The plan's own checks
--     (every task owned and dated, every role owned, the split balanced) are
--     the database's and are asked here; a field check is asked as "has an
--     answer", and the page holds the full completion rule before it offers
--     the button. One open request per team per checkpoint.
--   * The queue (`classroom_signoff_queue`) is every open request the caller
--     may decide, oldest first: an admin decides any section, a section
--     manager only their own, and a request carrying an owner-only item is Mr.
--     Pina's alone (`is_owner()`).
--   * APPROVE is the 0086 approval, not a second system: it writes one
--     `classroom_module_approvals` row per team member, keyed on the post that
--     declared the checkpoint and the module id `signoff-<key>`, stamped with
--     the instructor and the time, and logs the stamp in the team's change log.
--   * SEND BACK turns every failed item into a 0-point task: the role owner's
--     for a role item, the team's for a team item, due the next school day.
--     The note is the failed items, so nobody types. The team may request
--     again at once. A send-back task is cleared when its checkpoint is later
--     approved.
--   * Sign-off 1 (the team's earliest checkpoint) approved FIXES OWNERS: a
--     student can no longer change a role or a team task's owner. A manager
--     still can, logged, and through the connector that change asks first.
--
-- Sign-offs carry no points and are in no rubric. The shop gate each one opens
-- (`gate`) is shown on the board.
--
-- DEPLOY ORDERING: none for clients. `classroom_team_set_role` (0302),
-- `classroom_team_task_set_owner` and `classroom_team_plan` (0303) are
-- re-created with the same signatures; the plan read gains keys a deployed
-- page ignores.
--
-- WHAT UNDOES IT, a person's paste: re-run 0302's classroom_team_set_role and
-- 0303's classroom_team_task_set_owner and classroom_team_plan (each with its
-- grant lines), drop the functions this file creates, then
--   drop table if exists public.classroom_signoff_requests, public.classroom_signoff_checkpoints;
--   alter table public.classroom_team_tasks drop column if exists checkpoint_key;
-- Approval rows already written stay in classroom_module_approvals.

do $pre$
begin
	if to_regclass('public.classroom_team_tasks') is null then
		raise exception '0304 cannot apply: classroom_team_tasks does not exist. Apply 0303 first.';
	end if;
	if to_regclass('public.classroom_module_approvals') is null then
		raise exception '0304 cannot apply: classroom_module_approvals does not exist. Apply 0086 first.';
	end if;
end
$pre$;

-- ---------------------------------------------------------------------------
-- 1. Tables. The first object is new.
-- ---------------------------------------------------------------------------

create table if not exists public.classroom_signoff_checkpoints (
	item_id uuid not null references public.classroom_items (id) on delete cascade,
	checkpoint_key text not null check (checkpoint_key ~ '^[A-Za-z0-9_-]{1,40}$'),
	title text not null check (char_length(btrim(title)) between 1 and 80),
	due_on date,
	gate text check (gate is null or char_length(gate) <= 200),
	-- [{id, kind: 'auto'|'tap', text, check?, blocks?, ownerOnly?, role?}]
	items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
	seeded_at timestamptz not null default now(),
	edited_by text,
	edited_at timestamptz,
	primary key (item_id, checkpoint_key)
);

create table if not exists public.classroom_signoff_requests (
	id uuid primary key default gen_random_uuid(),
	team_id uuid not null references public.classroom_teams (id) on delete cascade,
	checkpoint_key text not null check (checkpoint_key ~ '^[A-Za-z0-9_-]{1,40}$'),
	requested_by text not null,
	requested_at timestamptz not null default now(),
	owner_only boolean not null default false,
	status text not null default 'open' check (status in ('open', 'approved', 'sent_back')),
	decided_by text,
	decided_at timestamptz,
	-- {item id: true | false} for every tap item, as the instructor tapped it.
	results jsonb,
	note text check (note is null or char_length(note) <= 2000)
);

create unique index if not exists classroom_signoff_requests_one_open
	on public.classroom_signoff_requests (team_id, checkpoint_key) where status = 'open';
create index if not exists classroom_signoff_requests_team_idx
	on public.classroom_signoff_requests (team_id, checkpoint_key, requested_at desc);

alter table public.classroom_team_tasks add column if not exists checkpoint_key text;

alter table public.classroom_signoff_checkpoints enable row level security;
alter table public.classroom_signoff_requests enable row level security;
revoke all on table public.classroom_signoff_checkpoints from public, anon, authenticated;
revoke all on table public.classroom_signoff_requests from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Private helpers.
-- ---------------------------------------------------------------------------

-- ONE ITEM OF A DECLARED CHECKLIST, kept to the shape the queue reads, or null.
create or replace function public._classroom_signoff_item(p_item jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $f$
	select case
		when jsonb_typeof(p_item) <> 'object'
			or coalesce(p_item->>'id', '') !~ '^[A-Za-z0-9_-]{1,40}$'
			or coalesce(btrim(p_item->>'text'), '') = ''
			or coalesce(p_item->>'kind', '') not in ('auto', 'tap') then null
		else jsonb_strip_nulls(jsonb_build_object(
			'id', p_item->>'id',
			'kind', p_item->>'kind',
			'text', left(btrim(p_item->>'text'), 200),
			'check', case when p_item->>'kind' = 'auto'
				and p_item->>'check' in ('plan-owners', 'roles-owned', 'plan-balanced', 'blocks-complete', 'assignment-complete')
				then p_item->>'check' end,
			'blocks', case when jsonb_typeof(p_item->'blocks') = 'array' then p_item->'blocks' end,
			'ownerOnly', case when (p_item->'ownerOnly') = 'true'::jsonb then true end,
			'role', case when coalesce(p_item->>'role', '') ~ '^[A-Za-z0-9_-]{1,40}$' then p_item->>'role' end
		))
	end;
$f$;

-- COPY A TEAM'S DECLARED CHECKPOINTS IN, once each.
create or replace function public._classroom_signoff_seed(p_team_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_item record;
	v_cp jsonb;
begin
	for v_item in select * from public._classroom_team_items(p_team_id) loop
		for v_cp in
			select c from jsonb_array_elements(case when jsonb_typeof(v_item.manifest->'team'->'checkpoints') = 'array'
				then v_item.manifest->'team'->'checkpoints' else '[]'::jsonb end) c
		loop
			continue when coalesce(v_cp->>'id', '') !~ '^[A-Za-z0-9_-]{1,40}$';
			insert into public.classroom_signoff_checkpoints (item_id, checkpoint_key, title, due_on, gate, items)
			values (
				v_item.item_id,
				v_cp->>'id',
				left(coalesce(nullif(btrim(v_cp->>'title'), ''), v_cp->>'id'), 80),
				case when coalesce(v_cp->>'date', '') ~ '^\d{4}-\d{2}-\d{2}' then (v_cp->>'date')::date end,
				nullif(left(btrim(coalesce(v_cp->>'gate', '')), 200), ''),
				coalesce((
					select jsonb_agg(x.clean order by x.ord)
					from (
						select public._classroom_signoff_item(i) as clean, ord
						from jsonb_array_elements(case when jsonb_typeof(v_cp->'items') = 'array' then v_cp->'items' else '[]'::jsonb end)
							with ordinality as t(i, ord)
					) x where x.clean is not null
				), '[]'::jsonb)
			)
			on conflict (item_id, checkpoint_key) do nothing;
		end loop;
	end loop;
end;
$f$;

-- A TEAM'S CHECKPOINTS: [{key, title, date, gate, anchor (the first post), items:
-- [{..., source (post id)}]}], by date.
create or replace function public._classroom_team_checkpoints(p_team_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $f$
	with rows as (
		select c.*, ti.created_at as item_created
		from public._classroom_team_items(p_team_id) ti
		join public.classroom_signoff_checkpoints c on c.item_id = ti.item_id
	), keys as (
		select distinct on (checkpoint_key) checkpoint_key, title, due_on, gate, item_id as anchor
		from rows order by checkpoint_key, item_created, item_id
	)
	select coalesce(jsonb_agg(jsonb_build_object(
		'key', k.checkpoint_key, 'title', k.title, 'date', k.due_on, 'gate', k.gate, 'anchor', k.anchor,
		'items', coalesce((
			select jsonb_agg(i.item || jsonb_build_object('source', r.item_id) order by r.item_created, i.ord)
			from rows r cross join lateral jsonb_array_elements(r.items) with ordinality as i(item, ord)
			where r.checkpoint_key = k.checkpoint_key
		), '[]'::jsonb)
	) order by k.due_on nulls last, k.checkpoint_key), '[]'::jsonb)
	from keys k;
$f$;

-- A STORED ANSWER IS PRESENT: 0290's own test of "holds an answer" (a boolean,
-- or a string with something other than blanks, brackets, quotes and commas),
-- restated for one value so the request can ask it of a block.
create or replace function public._classroom_answer_present(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $f$
	select coalesce(jsonb_typeof(p_value) = 'boolean'
		or (jsonb_typeof(p_value) = 'string' and (p_value #>> '{}') ~ '[^][[:space:]",]')
		or (jsonb_typeof(p_value) = 'object' and jsonb_typeof(p_value->'text') = 'string'
			and (p_value->>'text') ~ '[^][[:space:]",]'), false);
$f$;

-- THE PLAN'S OWN CHECKS, the database's answer: owners and dates, roles, balance.
create or replace function public._classroom_signoff_plan_check(p_team_id uuid, p_check text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $f$
	select case p_check
		when 'plan-owners' then not exists (
			select 1 from public.classroom_team_tasks t join public.classroom_team_plans p on p.id = t.plan_id
			where p.team_id = p_team_id and t.removed_at is null
				and (t.due_on is null or public._classroom_team_task_owner(p_team_id, t) is null))
		when 'roles-owned' then not exists (
			select 1 from jsonb_array_elements(public._classroom_team_roles(p_team_id)) r(role)
			where public._classroom_team_role_owner(p_team_id, r.role->>'id') is null)
		when 'plan-balanced' then coalesce((public._classroom_team_balance(p_team_id)->>'balanced')::boolean, false)
		else null
	end;
$f$;

-- THE ONE AUTO CHECK, as far as the database judges it: a plan check exactly,
-- a field check as "every named block holds an answer" for the team.
create or replace function public._classroom_signoff_auto_ok(p_team_id uuid, p_item jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_blocks text[];
	v_source uuid := (p_item->>'source')::uuid;
	v_block text;
	v_owner jsonb;
	v_manifest jsonb;
begin
	if p_item->>'check' in ('plan-owners', 'roles-owned', 'plan-balanced') then
		return public._classroom_signoff_plan_check(p_team_id, p_item->>'check');
	end if;
	select h.manifest into v_manifest from public.classroom_html_assignments h where h.item_id = v_source;
	if p_item->>'check' = 'assignment-complete' then
		select coalesce(array_agg(b->>'id'), '{}') into v_blocks
		from jsonb_array_elements(case when jsonb_typeof(v_manifest->'modules') = 'array' then v_manifest->'modules' else '[]'::jsonb end) m,
			jsonb_array_elements(case when jsonb_typeof(m->'blocks') = 'array' then m->'blocks' else '[]'::jsonb end) b
		where (b->'optional') is distinct from 'true'::jsonb;
	elsif p_item->>'check' = 'blocks-complete' and jsonb_typeof(p_item->'blocks') = 'array' then
		select coalesce(array_agg(x), '{}') into v_blocks from jsonb_array_elements_text(p_item->'blocks') x;
	else
		return true;
	end if;
	foreach v_block in array v_blocks loop
		v_owner := public._classroom_html_team_block(v_manifest, v_block);
		if v_owner is not null then
			if not exists (select 1 from public.classroom_team_answers a
				where a.team_id = p_team_id and a.item_id = v_source and a.block_id = v_block
					and public._classroom_answer_present(a.value))
				and not exists (select 1 from public.classroom_submission_files f
					join public.classroom_submissions s on s.id = f.submission_id
					join public.classroom_team_members m on m.student_email = s.student_email and m.team_id = p_team_id
					where s.item_id = v_source and f.block_id = v_block) then
				return false;
			end if;
		else
			if exists (select 1 from public.classroom_team_members m where m.team_id = p_team_id
				and not exists (select 1 from public.classroom_responses r
					where r.item_id = v_source and r.block_id = v_block and r.student_email = m.student_email
						and public._classroom_answer_present(r.value))
				and not exists (select 1 from public.classroom_submission_files f
					join public.classroom_submissions s on s.id = f.submission_id
					where s.item_id = v_source and s.student_email = m.student_email and f.block_id = v_block)) then
				return false;
			end if;
		end if;
	end loop;
	return true;
end;
$f$;

-- THE STATE OF A TEAM'S CHECKPOINT: 'approved', 'requested', 'sent-back' or 'open'.
create or replace function public._classroom_signoff_state(p_team_id uuid, p_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $f$
	select coalesce((
		select case r.status when 'approved' then 'approved' when 'open' then 'requested' else 'sent-back' end
		from public.classroom_signoff_requests r
		where r.team_id = p_team_id and r.checkpoint_key = p_key
		order by (r.status = 'approved') desc, r.requested_at desc limit 1
	), 'open');
$f$;

-- SIGN-OFF 1 APPROVED: the team's earliest checkpoint has an approved request.
create or replace function public._classroom_team_owners_fixed(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $f$
	select coalesce((
		select public._classroom_signoff_state(p_team_id, c->>'key') = 'approved'
		from jsonb_array_elements(public._classroom_team_checkpoints(p_team_id)) c
		limit 1
	), false);
$f$;

-- The next school day after a date (weekends and no-school days skipped).
create or replace function public._classroom_next_school_day(p_from date)
returns date
language sql
stable
security definer
set search_path = ''
as $f$
	select min(d)::date from generate_series(p_from + 1, p_from + 21, interval '1 day') d
	where extract(isodow from d) < 6
		and not exists (select 1 from public.classroom_no_school_days n where n.day = d::date);
$f$;

-- MAY THE CALLER DECIDE THIS REQUEST: a manager of the team's section, and Mr.
-- Pina alone for an owner-only request.
create or replace function public._classroom_signoff_may_decide(p_request public.classroom_signoff_requests)
returns boolean
language sql
stable
security definer
set search_path = ''
as $f$
	select coalesce(public.classroom_manages_section(public._classroom_team_section(p_request.team_id))
		and (not p_request.owner_only or public.is_owner()), false);
$f$;

revoke all on function public._classroom_signoff_item(jsonb) from public, anon, authenticated;
revoke all on function public._classroom_signoff_seed(uuid) from public, anon, authenticated;
revoke all on function public._classroom_team_checkpoints(uuid) from public, anon, authenticated;
revoke all on function public._classroom_answer_present(jsonb) from public, anon, authenticated;
revoke all on function public._classroom_signoff_plan_check(uuid, text) from public, anon, authenticated;
revoke all on function public._classroom_signoff_auto_ok(uuid, jsonb) from public, anon, authenticated;
revoke all on function public._classroom_signoff_state(uuid, text) from public, anon, authenticated;
revoke all on function public._classroom_team_owners_fixed(uuid) from public, anon, authenticated;
revoke all on function public._classroom_next_school_day(date) from public, anon, authenticated;
revoke all on function public._classroom_signoff_may_decide(public.classroom_signoff_requests) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Owners fixed after sign-off 1: the two owner writes, re-created with the
--    one check added (marked 0304) and nothing else changed.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_team_set_role(
	p_team_id uuid,
	p_role_id text,
	p_owner_email text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_me text := public.current_user_email();
	v_section uuid := public._classroom_team_section(p_team_id);
	v_owner text := nullif(lower(btrim(coalesce(p_owner_email, ''))), '');
	v_plan uuid;
	v_before text;
begin
	if (select auth.uid()) is null or coalesce(v_me, '') = '' then
		raise exception 'You must be signed in.';
	end if;
	if v_section is null or not (
		public._classroom_team_member(p_team_id, v_me) or public.classroom_manages_section(v_section)
	) then
		raise exception 'That team does not exist.';
	end if;
	if not exists (
		select 1 from jsonb_array_elements(public._classroom_team_roles(p_team_id)) r(role)
		where r.role->>'id' = p_role_id
	) then
		return jsonb_build_object('ok', false, 'reason', 'unknown_role');
	end if;
	if v_owner is not null and not public._classroom_team_member(p_team_id, v_owner) then
		return jsonb_build_object('ok', false, 'reason', 'not_member');
	end if;
	v_plan := public._classroom_team_plan_id(p_team_id);
	select r.owner_email into v_before from public.classroom_team_plan_roles r
	where r.plan_id = v_plan and r.role_id = p_role_id;
	if v_before is not distinct from v_owner then
		return jsonb_build_object('ok', true);
	end if;
	-- 0304: after sign-off 1 a student cannot move a role; a manager can, logged.
	if public._classroom_team_owners_fixed(p_team_id) and not public.classroom_manages_section(v_section) then
		return jsonb_build_object('ok', false, 'reason', 'owners_fixed');
	end if;
	if v_owner is null then
		delete from public.classroom_team_plan_roles r where r.plan_id = v_plan and r.role_id = p_role_id;
	else
		insert into public.classroom_team_plan_roles (plan_id, role_id, owner_email, set_by)
		values (v_plan, p_role_id, v_owner, v_me)
		on conflict (plan_id, role_id) do update
			set owner_email = excluded.owner_email, set_by = excluded.set_by, set_at = now();
	end if;
	insert into public.classroom_team_log (team_id, kind, actor_email, before, after, note)
	values (p_team_id, 'role', v_me, to_jsonb(v_before), to_jsonb(v_owner), p_role_id);
	perform public._classroom_live_notice('team-' || p_team_id::text, 'team-doc');
	return jsonb_build_object('ok', true);
end;
$f$;

revoke all on function public.classroom_team_set_role(uuid, text, text) from public, anon, authenticated;
grant execute on function public.classroom_team_set_role(uuid, text, text) to authenticated;

create or replace function public.classroom_team_task_set_owner(p_task_id uuid, p_member_key text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_team uuid := public._classroom_team_task_team(p_task_id);
	v_task public.classroom_team_tasks;
	v_email text;
begin
	if v_team is null then
		raise exception 'That task does not exist.';
	end if;
	select * into v_task from public.classroom_team_tasks where id = p_task_id for update;
	if v_task.kind = 'seed' and (v_task.role_id is not null or v_task.member_email <> '') then
		return jsonb_build_object('ok', false, 'reason', 'fixed_owner');
	end if;
	if p_member_key is not null then
		v_email := public._classroom_member_by_key(v_team, p_member_key);
		if v_email is null then
			return jsonb_build_object('ok', false, 'reason', 'not_member');
		end if;
	end if;
	if v_task.owner_email is not distinct from v_email then
		return jsonb_build_object('ok', true);
	end if;
	-- 0304: after sign-off 1 a student cannot move an owner; a manager can, logged.
	if public._classroom_team_owners_fixed(v_team)
		and not public.classroom_manages_section(public._classroom_team_section(v_team)) then
		return jsonb_build_object('ok', false, 'reason', 'owners_fixed');
	end if;
	update public.classroom_team_tasks set owner_email = v_email where id = p_task_id;
	insert into public.classroom_team_log (team_id, item_id, block_id, kind, actor_email, before, after, note)
	values (v_team, v_task.item_id, v_task.block_id, 'task-owner', public.current_user_email(),
		to_jsonb(v_task.owner_email), to_jsonb(v_email), left(v_task.title, 500));
	perform public._classroom_live_notice('team-' || v_team::text, 'team-doc');
	return jsonb_build_object('ok', true);
end;
$f$;

revoke all on function public.classroom_team_task_set_owner(uuid, text) from public, anon, authenticated;
grant execute on function public.classroom_team_task_set_owner(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Request, queue, decide.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_signoff_request(p_team_id uuid, p_checkpoint_key text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_me text := public.current_user_email();
	v_cp jsonb;
	v_item jsonb;
	v_failed jsonb := '[]'::jsonb;
	v_id uuid;
begin
	if not public._classroom_team_member(p_team_id, v_me) then
		raise exception 'That team does not exist.';
	end if;
	perform public._classroom_signoff_seed(p_team_id);
	select c into v_cp from jsonb_array_elements(public._classroom_team_checkpoints(p_team_id)) c
	where c->>'key' = p_checkpoint_key;
	if v_cp is null then
		return jsonb_build_object('ok', false, 'reason', 'unknown_checkpoint');
	end if;
	if public._classroom_signoff_state(p_team_id, p_checkpoint_key) = 'approved' then
		return jsonb_build_object('ok', false, 'reason', 'approved');
	end if;
	for v_item in select i from jsonb_array_elements(v_cp->'items') i where i->>'kind' = 'auto' loop
		if not public._classroom_signoff_auto_ok(p_team_id, v_item) then
			v_failed := v_failed || jsonb_build_array(v_item->>'id');
		end if;
	end loop;
	if jsonb_array_length(v_failed) > 0 then
		return jsonb_build_object('ok', false, 'reason', 'auto_failed', 'items', v_failed);
	end if;
	insert into public.classroom_signoff_requests (team_id, checkpoint_key, requested_by, owner_only)
	values (p_team_id, p_checkpoint_key, v_me,
		exists (select 1 from jsonb_array_elements(v_cp->'items') i where (i->'ownerOnly') = 'true'::jsonb))
	on conflict (team_id, checkpoint_key) where status = 'open' do nothing
	returning id into v_id;
	if v_id is null then
		return jsonb_build_object('ok', false, 'reason', 'already_requested');
	end if;
	insert into public.classroom_team_log (team_id, kind, actor_email, after, note)
	values (p_team_id, 'signoff-request', v_me, to_jsonb(p_checkpoint_key), v_cp->>'title');
	perform public._classroom_live_notice('team-' || p_team_id::text, 'team-doc');
	perform public._classroom_live_notice(public._classroom_team_section(p_team_id)::text, 'signoffs');
	return jsonb_build_object('ok', true, 'id', v_id);
end;
$f$;

-- THE QUEUE: every open request the caller may decide, oldest first, with the
-- checklist and what the page needs to judge each auto item.
create or replace function public.classroom_signoff_queue()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_out jsonb := '[]'::jsonb;
	v_req public.classroom_signoff_requests;
	v_cp jsonb;
	v_section uuid;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	for v_req in
		select * from public.classroom_signoff_requests r where r.status = 'open' order by r.requested_at, r.id
	loop
		continue when not public._classroom_signoff_may_decide(v_req);
		perform public._classroom_signoff_seed(v_req.team_id);
		select c into v_cp from jsonb_array_elements(public._classroom_team_checkpoints(v_req.team_id)) c
		where c->>'key' = v_req.checkpoint_key;
		v_section := public._classroom_team_section(v_req.team_id);
		v_out := v_out || jsonb_build_array(jsonb_build_object(
			'id', v_req.id,
			'requested_at', v_req.requested_at,
			'requested_by', public._classroom_first_name(v_section, v_req.requested_by),
			'owner_only', v_req.owner_only,
			'section', (select jsonb_build_object('id', s.id, 'label', s.label) from public.classroom_sections s where s.id = v_section),
			'team', (select jsonb_build_object('id', t.id, 'name', coalesce(nullif(btrim(t.name), ''), 'Team ' || t.team_number),
				'members', (select coalesce(jsonb_agg(public._classroom_first_name(v_section, m.student_email) order by m.student_email), '[]'::jsonb)
					from public.classroom_team_members m where m.team_id = t.id))
				from public.classroom_teams t where t.id = v_req.team_id),
			'checkpoint', jsonb_build_object('key', v_cp->>'key', 'title', v_cp->>'title', 'date', v_cp->>'date', 'gate', v_cp->>'gate'),
			'items', coalesce((
				select jsonb_agg(i || jsonb_build_object(
					'auto_ok', case when i->>'kind' = 'auto' then public._classroom_signoff_auto_ok(v_req.team_id, i) end,
					'owner', case when i->>'role' is null then null else
						public._classroom_first_name(v_section, public._classroom_team_role_owner(v_req.team_id, i->>'role')) end
				) order by ord)
				from jsonb_array_elements(v_cp->'items') with ordinality as x(i, ord)
			), '[]'::jsonb)
		));
	end loop;
	return jsonb_build_object('ok', true, 'requests', v_out);
end;
$f$;

-- APPROVE OR SEND BACK. `p_results` is {item id: true|false} for the tap items.
-- Approve needs every item to pass. Send back makes each failed item a 0-point
-- task and the note; the team may request again at once.
create or replace function public.classroom_signoff_decide(p_request_id uuid, p_results jsonb, p_approve boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_me text := public.current_user_email();
	v_req public.classroom_signoff_requests;
	v_cp jsonb;
	v_item jsonb;
	v_failed jsonb := '[]'::jsonb;
	v_pass boolean;
	v_plan uuid;
	v_section uuid;
	v_due date;
	v_note text;
	v_by text;
begin
	select * into v_req from public.classroom_signoff_requests where id = p_request_id for update;
	if v_req.id is null or not public._classroom_signoff_may_decide(v_req) then
		raise exception 'That request does not exist.';
	end if;
	if v_req.status <> 'open' then
		return jsonb_build_object('ok', false, 'reason', 'decided', 'status', v_req.status);
	end if;
	if p_results is not null and jsonb_typeof(p_results) <> 'object' then
		raise exception 'The results must be an object of item ids.';
	end if;
	select c into v_cp from jsonb_array_elements(public._classroom_team_checkpoints(v_req.team_id)) c
	where c->>'key' = v_req.checkpoint_key;
	for v_item in select i from jsonb_array_elements(coalesce(v_cp->'items', '[]'::jsonb)) i loop
		if v_item->>'kind' = 'auto' then
			v_pass := public._classroom_signoff_auto_ok(v_req.team_id, v_item);
		else
			v_pass := coalesce((p_results->>(v_item->>'id'))::boolean, false);
		end if;
		if not v_pass then
			v_failed := v_failed || jsonb_build_array(v_item);
		end if;
	end loop;
	if p_approve and jsonb_array_length(v_failed) > 0 then
		return jsonb_build_object('ok', false, 'reason', 'items_failed',
			'items', (select jsonb_agg(f->>'id') from jsonb_array_elements(v_failed) f));
	end if;
	v_section := public._classroom_team_section(v_req.team_id);
	v_by := coalesce((select nullif(btrim(p.full_name), '') from public.profiles p where p.id = auth.uid()), split_part(v_me, '@', 1));

	if p_approve then
		update public.classroom_signoff_requests
		set status = 'approved', decided_by = v_me, decided_at = now(), results = p_results
		where id = v_req.id;
		-- THE 0086 APPROVAL, one row per member, on the post that declared the checkpoint.
		insert into public.classroom_module_approvals (item_id, student_email, module_id, approved_by)
		select (v_cp->>'anchor')::uuid, m.student_email, 'signoff-' || v_req.checkpoint_key, v_me
		from public.classroom_team_members m where m.team_id = v_req.team_id
		on conflict (item_id, student_email, module_id) do update
			set approved_by = excluded.approved_by, approved_at = now();
		insert into public.classroom_team_log (team_id, kind, actor_email, after, note)
		values (v_req.team_id, 'signoff-approved', v_me,
			jsonb_build_object('checkpoint', v_req.checkpoint_key, 'by', v_by, 'at', now()),
			left((v_cp->>'title') || ' approved by ' || v_by, 500));
	else
		v_note := (select string_agg(f->>'text', '; ' order by ord) from jsonb_array_elements(v_failed) with ordinality as x(f, ord));
		update public.classroom_signoff_requests
		set status = 'sent_back', decided_by = v_me, decided_at = now(), results = p_results,
			note = left(coalesce(v_note, 'Sent back'), 2000)
		where id = v_req.id;
		v_plan := public._classroom_team_plan_id(v_req.team_id);
		v_due := public._classroom_next_school_day(public._classroom_school_today());
		insert into public.classroom_team_tasks (plan_id, kind, role_id, title, owner_email, due_on, source_note,
			checkpoint_key, created_by)
		select v_plan, 'sendback', null, left('Fix: ' || (f->>'text'), 120),
			case when f->>'role' is not null then public._classroom_team_role_owner(v_req.team_id, f->>'role') end,
			v_due, left((v_cp->>'title') || ' sent back by ' || v_by, 300), v_req.checkpoint_key, v_me
		from jsonb_array_elements(v_failed) f;
		insert into public.classroom_team_log (team_id, kind, actor_email, after, note)
		values (v_req.team_id, 'signoff-sent-back', v_me,
			jsonb_build_object('checkpoint', v_req.checkpoint_key, 'failed', (select jsonb_agg(f->>'id') from jsonb_array_elements(v_failed) f)),
			left(coalesce(v_note, ''), 500));
	end if;
	perform public._classroom_live_notice('team-' || v_req.team_id::text, 'team-doc');
	perform public._classroom_live_notice(v_section::text, 'signoffs');
	return jsonb_build_object('ok', true, 'status', case when p_approve then 'approved' else 'sent_back' end,
		'tasks', case when p_approve then 0 else jsonb_array_length(v_failed) end);
end;
$f$;

-- THE CHECKLISTS, for an admin: every stored checkpoint of the posts the caller
-- can manage, and the one write that edits one.
create or replace function public.classroom_signoff_checklists()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
begin
	if not public.is_admin() then
		raise exception 'Only a site admin can edit sign-off checklists.';
	end if;
	return jsonb_build_object('ok', true, 'checkpoints', coalesce((
		select jsonb_agg(jsonb_build_object('item_id', c.item_id, 'item_title', i.title, 'key', c.checkpoint_key,
			'title', c.title, 'date', c.due_on, 'gate', c.gate, 'items', c.items, 'edited_at', c.edited_at)
			order by c.due_on nulls last, i.title, c.checkpoint_key)
		from public.classroom_signoff_checkpoints c join public.classroom_items i on i.id = c.item_id
	), '[]'::jsonb));
end;
$f$;

create or replace function public.classroom_signoff_checkpoint_set(
	p_item_id uuid,
	p_key text,
	p_title text,
	p_due_on date,
	p_gate text,
	p_items jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_items jsonb;
begin
	if not public.is_admin() then
		raise exception 'Only a site admin can edit sign-off checklists.';
	end if;
	if p_items is null or jsonb_typeof(p_items) <> 'array' then
		raise exception 'The checklist must be a list of items.';
	end if;
	select coalesce(jsonb_agg(public._classroom_signoff_item(i) order by ord), '[]'::jsonb) into v_items
	from jsonb_array_elements(p_items) with ordinality as x(i, ord);
	if exists (select 1 from jsonb_array_elements(v_items) v where v = 'null'::jsonb) then
		return jsonb_build_object('ok', false, 'reason', 'bad_item');
	end if;
	update public.classroom_signoff_checkpoints
	set title = left(btrim(coalesce(nullif(p_title, ''), title)), 80), due_on = p_due_on,
		gate = nullif(left(btrim(coalesce(p_gate, '')), 200), ''), items = v_items,
		edited_by = public.current_user_email(), edited_at = now()
	where item_id = p_item_id and checkpoint_key = p_key;
	if not found then
		return jsonb_build_object('ok', false, 'reason', 'unknown_checkpoint');
	end if;
	return jsonb_build_object('ok', true);
end;
$f$;

revoke all on function public.classroom_signoff_request(uuid, text) from public, anon, authenticated;
revoke all on function public.classroom_signoff_queue() from public, anon, authenticated;
revoke all on function public.classroom_signoff_decide(uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.classroom_signoff_checklists() from public, anon, authenticated;
revoke all on function public.classroom_signoff_checkpoint_set(uuid, text, text, date, text, jsonb) from public, anon, authenticated;
grant execute on function public.classroom_signoff_request(uuid, text) to authenticated;
grant execute on function public.classroom_signoff_queue() to authenticated;
grant execute on function public.classroom_signoff_decide(uuid, jsonb, boolean) to authenticated;
grant execute on function public.classroom_signoff_checklists() to authenticated;
grant execute on function public.classroom_signoff_checkpoint_set(uuid, text, text, date, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The plan read, 0303's body with the sign-off keys added (marked 0304):
--    the checkpoints and their state, whether owners are fixed, and a
--    send-back task's `cleared`. Same signature, so a deployed page keeps
--    working and simply gains the keys.
-- ---------------------------------------------------------------------------

-- `p_team_id` null is the caller's own team in the section's current draw.
create or replace function public.classroom_team_plan(p_section_id uuid, p_team_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_me text := public.current_user_email();
	v_set uuid := public._classroom_section_team_set(p_section_id);
	v_team uuid := p_team_id;
	v_today date := public._classroom_school_today();
begin
	if (select auth.uid()) is null or coalesce(v_me, '') = '' then
		raise exception 'You must be signed in.';
	end if;
	if v_team is null then
		if v_set is null then
			return jsonb_build_object('ok', true, 'team', null, 'reason', 'not_posted');
		end if;
		select m.team_id into v_team from public.classroom_team_members m
		where m.team_set_id = v_set and m.student_email = v_me;
		if v_team is null then
			return jsonb_build_object('ok', true, 'team', null, 'reason', 'no_team');
		end if;
	end if;
	if not public._classroom_team_plan_access(v_team)
		or public._classroom_team_section(v_team) <> p_section_id then
		raise exception 'That team does not exist.';
	end if;
	perform public._classroom_team_seed_tasks(v_team);
	perform public._classroom_signoff_seed(v_team);
	return (
		with team as (
			select t.id, t.team_number, s.section_id, s.posted_at, s.created_at as drawn_at,
				coalesce(nullif(btrim(t.name), ''), 'Team ' || t.team_number) as name
			from public.classroom_teams t join public.classroom_team_sets s on s.id = t.team_set_id
			where t.id = v_team
		), plan as (
			select p.id from public.classroom_team_plans p where p.team_id = v_team
		)
		select jsonb_build_object(
			'ok', true,
			'today', v_today,
			'team', (select jsonb_build_object('id', team.id, 'name', team.name, 'number', team.team_number,
				'section_id', team.section_id, 'drawn_on', (team.drawn_at at time zone 'America/Los_Angeles')::date) from team),
			'me', public._classroom_member_key(v_team, v_me),
			'manager', public.classroom_manages_section(p_section_id),
			'members', coalesce((
				select jsonb_agg(jsonb_build_object(
					'key', public._classroom_member_key(v_team, m.student_email),
					'name', public._classroom_first_name(team.section_id, m.student_email),
					'me', m.student_email = v_me
				) order by (m.student_email = v_me) desc, e.display_name, m.student_email)
				from team join public.classroom_team_members m on m.team_id = team.id
				left join public.classroom_enrollments e on e.section_id = team.section_id and e.student_email = m.student_email
				where m.student_email = v_me or m.student_email not in (select public._idea_test_emails())
			), '[]'::jsonb),
			'roles', coalesce((
				select jsonb_agg(jsonb_build_object(
					'id', r.role->>'id', 'title', r.role->>'title',
					'owner', case when o.owner is null then null else public._classroom_member_key(v_team, o.owner) end
				) order by r.ord)
				from jsonb_array_elements(public._classroom_team_roles(v_team)) with ordinality as r(role, ord)
				left join lateral (select public._classroom_team_role_owner(v_team, r.role->>'id') as owner) o on true
			), '[]'::jsonb),
			'items', coalesce((
				select jsonb_agg(jsonb_build_object('id', ti.item_id, 'title', i.title, 'due_at', ti.due_at)
					order by ti.due_at nulls last, ti.created_at)
				from public._classroom_team_items(v_team) ti join public.classroom_items i on i.id = ti.item_id
			), '[]'::jsonb),
			'tasks', coalesce((
				select jsonb_agg(jsonb_build_object(
					'id', t.id, 'kind', t.kind, 'title', t.title,
					'item_id', t.item_id, 'block_id', t.block_id, 'role_id', t.role_id,
					'block', case when t.item_id is null then null else
						public._classroom_html_block(h.manifest, t.block_id) end,
					'owner', case when public._classroom_team_task_owner(v_team, t) is null then null
						else public._classroom_member_key(v_team, public._classroom_team_task_owner(v_team, t)) end,
					'fixed_owner', t.kind = 'seed' and (t.role_id is not null or t.member_email <> ''),
					'due_on', t.due_on, 'cap', public._classroom_team_task_cap(v_team, t),
					'points', t.points, 'machine', t.machine, 'depends_on', t.depends_on,
					'blocked', t.blocked_reason, 'note', t.source_note,
					-- The linked answer, the team's for a shared block and the
					-- member's own for an individual one, so the page can apply
					-- the one completion rule. A picture counts by its presence.
					'value', case
						when t.item_id is null then null
						when t.member_email <> '' then (select r.value from public.classroom_responses r
							where r.item_id = t.item_id and r.block_id = t.block_id and r.student_email = t.member_email)
						else (select a.value from public.classroom_team_answers a
							where a.team_id = v_team and a.item_id = t.item_id and a.block_id = t.block_id)
					end,
					'has_image', case when t.item_id is null then false else exists (
						select 1 from public.classroom_submission_files f
						join public.classroom_submissions s on s.id = f.submission_id
						where s.item_id = t.item_id and f.block_id = t.block_id
							and (case when t.member_email <> '' then s.student_email = t.member_email
								else s.student_email in (select m.student_email from public.classroom_team_members m where m.team_id = v_team) end)
					) end,
					-- 0304: a send-back task its checkpoint has since approved.
					'cleared', t.kind = 'sendback' and exists (
						select 1 from public.classroom_signoff_requests r
						where r.team_id = v_team and r.checkpoint_key = t.checkpoint_key
							and r.status = 'approved' and r.decided_at > t.created_at),
					'on_it', coalesce((
						select jsonb_agg(public._classroom_member_key(v_team, c.student_email))
						from public.classroom_team_checkins c
						where c.team_id = v_team and c.school_day = v_today and t.id = any (c.task_ids)
					), '[]'::jsonb)
				) order by t.due_on nulls last, t.created_at, t.title)
				from plan join public.classroom_team_tasks t on t.plan_id = plan.id
				left join public.classroom_html_assignments h on h.item_id = t.item_id
				where t.removed_at is null
			), '[]'::jsonb),
			'checked_in', coalesce((
				select jsonb_agg(public._classroom_member_key(v_team, c.student_email))
				from public.classroom_team_checkins c where c.team_id = v_team and c.school_day = v_today
			), '[]'::jsonb),
			'balance', public._classroom_team_balance(v_team),
			-- 0304: the team's checkpoints with their state, and whether owners are fixed.
			'checkpoints', coalesce((
				select jsonb_agg(jsonb_build_object(
					'key', c->>'key', 'title', c->>'title', 'date', c->>'date', 'gate', c->>'gate',
					'state', public._classroom_signoff_state(v_team, c->>'key'),
					'items', c->'items',
					'auto', (select coalesce(jsonb_object_agg(i->>'id', public._classroom_signoff_auto_ok(v_team, i)), '{}'::jsonb)
						from jsonb_array_elements(c->'items') i where i->>'kind' = 'auto'),
					'decision', (select jsonb_build_object('status', r.status, 'at', r.decided_at, 'note', r.note,
							'by', coalesce((select nullif(btrim(p.full_name), '') from public.profiles p
								where lower(p.email) = r.decided_by limit 1), split_part(r.decided_by, '@', 1)))
						from public.classroom_signoff_requests r
						where r.team_id = v_team and r.checkpoint_key = c->>'key' and r.status <> 'open'
						order by r.decided_at desc limit 1)
				) order by ord)
				from jsonb_array_elements(public._classroom_team_checkpoints(v_team)) with ordinality as x(c, ord)
			), '[]'::jsonb),
			'owners_fixed', public._classroom_team_owners_fixed(v_team),
			'machines', coalesce((select jsonb_agg(jsonb_build_object('id', mt.id, 'label', mt.label) order by mt.sort)
				from public.classroom_machine_tags mt where mt.active), '[]'::jsonb),
			'no_school', coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'label', d.label) order by d.day)
				from public.classroom_no_school_days d), '[]'::jsonb)
		)
	);
end;
$f$;

revoke all on function public.classroom_team_plan(uuid, uuid) from public, anon, authenticated;
grant execute on function public.classroom_team_plan(uuid, uuid) to authenticated;

do $report$
begin
	raise notice '0304: % stored checkpoints, % sign-off requests.',
		(select count(*) from public.classroom_signoff_checkpoints),
		(select count(*) from public.classroom_signoff_requests);
end
$report$;
