-- 0247_coin_v2_roles.sql
--
-- IDEA COIN V2, SESSION TWO, PART FOUR (ledger 0386): ROLES BECOME EVIDENCE
-- JOBS (2.5).
--
-- Roles were tedious and the printed checklist failed, so the stipend now
-- pays only for proven days.
--
-- CONTROL. A role has a per-class cap (default 1) and an on/off switch per
-- class (coin_role_class_settings; no row means "on, cap 1"). The class is an
-- IDEA Classroom section now, never a coin section: applications and holders
-- gain class_section_id, and the old text section_id becomes nullable
-- history. A student still applies on the Ledger (coin_role_self_apply, same
-- signature) and Mr. Pina still personally accepts (coin_role_admin_review).
-- The role TYPES stay fixed in code (coin_role_definitions); their
-- instructions are a setting (role_instructions, 0245).
--
-- EVIDENCE. Each class day the holder captures a start photo and an end photo
-- of the same spot, live, in the portal. The time is the SERVER's at upload
-- (taken_at = now() when the photo is recorded), never the file's metadata.
-- A day passes on its own when the rules pass: at least role_photos_per_day
-- photos, all inside the window (role_window_start to role_window_end, Los
-- Angeles), the last at least role_min_gap_minutes after the first, all on
-- the same day. A holder can carry their own rules (coin_role_holder_rules),
-- and any single day can be accepted or rejected by hand
-- (coin_role_day_overrides), from the queue (a role_day card, the holder's
-- exception request) or directly.
--
-- PAY is in 0249's autopay: 1 coin per week (the weekly_role_stipend
-- category's amount), paid every two weeks, prorated by valid days over
-- required days. Absence is never checked; a missed day docks only that day.
--
-- UNDO: drop the functions and the four tables this file creates; the two
-- class_section_id columns may stay (nullable, read by nothing else).

-- THE FIRST OBJECT IS NEW (the apply probe reads the first created object).
create table if not exists public.coin_role_class_settings (
	role_id text not null references public.coin_role_definitions (id),
	section_id uuid not null references public.classroom_sections (id) on delete cascade,
	cap integer not null default 1 check (cap between 0 and 20),
	enabled boolean not null default true,
	updated_by text not null default 'system',
	updated_at timestamptz not null default now(),
	primary key (role_id, section_id)
);
alter table public.coin_role_class_settings enable row level security;
revoke all on table public.coin_role_class_settings from public, anon, authenticated, service_role;

alter table public.coin_role_applications add column if not exists class_section_id uuid references public.classroom_sections (id) on delete set null;
alter table public.coin_role_holders add column if not exists class_section_id uuid references public.classroom_sections (id) on delete set null;
alter table public.coin_role_applications alter column section_id drop not null;
alter table public.coin_role_holders alter column section_id drop not null;

-- ONE BACKFILL, ONCE: a row that names no class gets the student's class when
-- they have exactly one economy-on class. Anything ambiguous is left null and
-- shows as "no class" for a full coin admin to set.
do $bf$
declare
	v_n integer;
begin
	if exists (select 1 from public.coin_settings where key = 'v2s2_roles_backfilled') then
		return;
	end if;
	update public.coin_role_holders h set class_section_id = x.section_id
	from (select student_email, min(section_id::text)::uuid as section_id from public._coin_economy_enrollments()
		group by student_email having count(distinct section_id) = 1) x
	where h.class_section_id is null and h.student_email = x.student_email;
	get diagnostics v_n = row_count;
	update public.coin_role_applications a set class_section_id = x.section_id
	from (select student_email, min(section_id::text)::uuid as section_id from public._coin_economy_enrollments()
		group by student_email having count(distinct section_id) = 1) x
	where a.class_section_id is null and a.student_email = x.student_email;
	insert into public.coin_settings (key, value, updated_by) values ('v2s2_roles_backfilled', to_jsonb(now()), 'system')
	on conflict (key) do nothing;
	raise notice '0247: % role holder row(s) given their class.', v_n;
end
$bf$;

create table if not exists public.coin_role_holder_rules (
	holder_id uuid primary key references public.coin_role_holders (id) on delete cascade,
	rules jsonb not null default '{}'::jsonb,
	updated_by text not null,
	updated_at timestamptz not null default now()
);
alter table public.coin_role_holder_rules enable row level security;
revoke all on table public.coin_role_holder_rules from public, anon, authenticated, service_role;

create table if not exists public.coin_role_evidence (
	id uuid primary key default gen_random_uuid(),
	holder_id uuid not null references public.coin_role_holders (id) on delete cascade,
	student_email text not null,
	on_day date not null,
	photo_path text not null check (char_length(photo_path) <= 300),
	taken_at timestamptz not null default now()
);
create index if not exists coin_role_evidence_day on public.coin_role_evidence (holder_id, on_day, taken_at);
alter table public.coin_role_evidence enable row level security;
revoke all on table public.coin_role_evidence from public, anon, authenticated, service_role;

create table if not exists public.coin_role_day_overrides (
	holder_id uuid not null references public.coin_role_holders (id) on delete cascade,
	on_day date not null,
	verdict text not null check (verdict in ('accepted', 'rejected')),
	decided_by text not null,
	decided_at timestamptz not null default now(),
	note text check (note is null or char_length(note) <= 500),
	primary key (holder_id, on_day)
);
alter table public.coin_role_day_overrides enable row level security;
revoke all on table public.coin_role_day_overrides from public, anon, authenticated, service_role;

-- ===== PART A BEGIN =====
-- ===== PART A: CAPS, HOLDERS, RULES =====

create or replace function public._coin_role_class_cap(p_role_id text, p_section_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
	select case when coalesce(s.enabled, true) then coalesce(s.cap, 1) else 0 end
	from (select 1) one
	left join public.coin_role_class_settings s on s.role_id = p_role_id and s.section_id = p_section_id;
$$;
revoke all on function public._coin_role_class_cap(text, uuid) from public, anon, authenticated, service_role;

create or replace function public._coin_role_holder_active(h public.coin_role_holders, p_at timestamptz default now())
returns boolean
language sql
stable
set search_path = ''
as $$
	select h.since <= p_at and (h.revoked_at is null or h.revoked_at > p_at)
		and (h.expires_at is null or h.expires_at > p_at);
$$;
revoke all on function public._coin_role_holder_active(public.coin_role_holders, timestamptz) from public, anon, authenticated, service_role;

create or replace function public._coin_role_class_held(p_role_id text, p_section_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
	select count(*)::integer from public.coin_role_holders h
	where h.role_id = p_role_id and h.class_section_id = p_section_id
		and h.revoked_at is null and (h.expires_at is null or h.expires_at > now());
$$;
revoke all on function public._coin_role_class_held(text, uuid) from public, anon, authenticated, service_role;

-- One holder's rules: their own where set, the global settings otherwise.
create or replace function public._coin_role_rules(p_holder_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select jsonb_build_object(
		'min_gap_minutes', coalesce((r.rules ->> 'min_gap_minutes')::numeric,
			(public._coin_setting('role_min_gap_minutes') #>> '{}')::numeric, 45),
		'photos_per_day', coalesce((r.rules ->> 'photos_per_day')::integer,
			(public._coin_setting('role_photos_per_day') #>> '{}')::integer, 2),
		'window_start', coalesce(r.rules ->> 'window_start', public._coin_setting('role_window_start') #>> '{}', '07:00'),
		'window_end', coalesce(r.rules ->> 'window_end', public._coin_setting('role_window_end') #>> '{}', '16:00'),
		'own', r.holder_id is not null)
	from (select 1) one
	left join public.coin_role_holder_rules r on r.holder_id = p_holder_id;
$$;
revoke all on function public._coin_role_rules(uuid) from public, anon, authenticated, service_role;

-- Does a class meet on a day? The Foundry class schedule where its teacher
-- turned it on (any window that day, the date's exceptions winning);
-- otherwise every class day (a weekday, in a semester, not a no-class day).
create or replace function public._coin_section_meets(p_section_id uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select case
		when public._coin_semester_of(p_day) is null then false
		when coalesce((select s.foundry_schedule_enabled from public.classroom_sections s where s.id = p_section_id), false) then
			case when exists (select 1 from public.foundry_class_schedule_days d where d.section_id = p_section_id and d.on_date = p_day)
				then exists (select 1 from public.foundry_class_schedule_days d
					where d.section_id = p_section_id and d.on_date = p_day and d.kind = 'window')
				else exists (select 1 from public.foundry_class_schedule w
					where w.section_id = p_section_id and w.weekday = extract(isodow from p_day))
			end
		else public._coin_is_class_day(p_day)
	end;
$$;
revoke all on function public._coin_section_meets(uuid, date) from public, anon, authenticated, service_role;

-- ONE DAY'S STATUS for a holder: accepted or rejected by hand, else passed or
-- failed by the rules, else none (no photos).
create or replace function public._coin_role_day_status(p_holder_id uuid, p_day date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_rules jsonb := public._coin_role_rules(p_holder_id);
	v_override public.coin_role_day_overrides;
	v_n integer;
	v_first timestamptz;
	v_last timestamptz;
	v_outside integer;
	v_gap numeric;
	v_reason text;
begin
	select * into v_override from public.coin_role_day_overrides o where o.holder_id = p_holder_id and o.on_day = p_day;
	select count(*), min(e.taken_at), max(e.taken_at),
		count(*) filter (where (e.taken_at at time zone 'America/Los_Angeles')::time
			not between (v_rules ->> 'window_start')::time and (v_rules ->> 'window_end')::time)
		into v_n, v_first, v_last, v_outside
	from public.coin_role_evidence e where e.holder_id = p_holder_id and e.on_day = p_day;
	v_gap := extract(epoch from (v_last - v_first)) / 60;
	if v_n = 0 then
		v_reason := 'no_photos';
	elsif v_n < (v_rules ->> 'photos_per_day')::integer then
		v_reason := 'too_few_photos';
	elsif v_outside > 0 then
		v_reason := 'outside_window';
	elsif v_gap < (v_rules ->> 'min_gap_minutes')::numeric then
		v_reason := 'gap_too_short';
	end if;
	return jsonb_build_object(
		'day', p_day,
		'photos', v_n,
		'gap_minutes', case when v_n > 1 then round(v_gap) end,
		'rules_pass', v_reason is null,
		'reason', v_reason,
		'override', v_override.verdict,
		'valid', case when v_override.verdict is not null then v_override.verdict = 'accepted' else v_reason is null end,
		'status', case
			when v_override.verdict = 'accepted' then 'accepted'
			when v_override.verdict = 'rejected' then 'rejected'
			when v_reason is null then 'passed'
			when v_n = 0 then 'none'
			else 'failed' end);
end;
$$;
revoke all on function public._coin_role_day_status(uuid, date) from public, anon, authenticated, service_role;
-- ===== PART A END =====

-- ===== PART B BEGIN =====
-- ===== PART B: APPLYING AND ACCEPTING =====

-- The class a student's application belongs to: the first of their
-- economy-on classes where the role is on and has room, else their first
-- class. Same signature as 0089's, so the Ledger's Apply works unchanged.
create or replace function public._coin_role_apply_section(p_email text, p_role_id text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(
		(select x.section_id from public._coin_economy_enrollments() x
			where x.student_email = p_email
				and public._coin_role_class_held(p_role_id, x.section_id) < public._coin_role_class_cap(p_role_id, x.section_id)
			order by public._coin_classroom_section_label(x.section_id), x.section_id limit 1),
		public._coin_home_section(p_email));
$$;
revoke all on function public._coin_role_apply_section(text, text) from public, anon, authenticated, service_role;

create or replace function public._coin_role_insert_application(p_email text, p_role public.coin_role_definitions, p_section uuid, p_answers jsonb, p_by text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_id uuid;
	v_question public.coin_role_quiz_questions;
	v_elem jsonb;
	v_written text;
	v_selected integer;
begin
	if jsonb_typeof(coalesce(p_answers, '[]'::jsonb)) <> 'array' then
		raise exception 'Answers must be a list.';
	end if;
	if jsonb_array_length(coalesce(p_answers, '[]'::jsonb)) > 50 then
		raise exception 'Too many answers (max 50).';
	end if;
	insert into public.coin_role_applications (student_email, role_id, section_id, class_section_id, submitted_by)
	values (p_email, p_role.id, null, p_section, p_by)
	returning id into v_id;
	for v_question in
		select * from public.coin_role_quiz_questions where role_id = p_role.id and active order by sequence
	loop
		select elem into v_elem from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) elem
		where elem ->> 'question_id' = v_question.id::text limit 1;
		if v_question.type = 'written' then
			v_written := nullif(btrim(coalesce(v_elem ->> 'written_answer', '')), '');
			if v_written is null then
				raise exception 'Missing an answer for "%".', v_question.question_text;
			end if;
			insert into public.coin_role_application_answers
				(application_id, question_id, question_type, sequence, question_text, written_answer)
			values (v_id, v_question.id, 'written', v_question.sequence, v_question.question_text, left(v_written, 4000));
		else
			if v_elem is null or v_elem ->> 'selected_option_index' is null then
				raise exception 'Missing an answer for "%".', v_question.question_text;
			end if;
			v_selected := (v_elem ->> 'selected_option_index')::integer;
			if v_selected < 0 or v_selected >= jsonb_array_length(v_question.options) then
				raise exception 'Invalid option selected for "%".', v_question.question_text;
			end if;
			insert into public.coin_role_application_answers
				(application_id, question_id, question_type, sequence, question_text, options,
				 selected_option_index, correct_option_index, is_correct)
			values (v_id, v_question.id, 'mc', v_question.sequence, v_question.question_text, v_question.options,
				v_selected, v_question.correct_option_index, v_selected = v_question.correct_option_index);
		end if;
	end loop;
	return v_id;
end;
$$;
revoke all on function public._coin_role_insert_application(text, public.coin_role_definitions, uuid, jsonb, text) from public, anon, authenticated, service_role;

create or replace function public.coin_role_self_apply(
	p_role_id text,
	p_answers jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_role public.coin_role_definitions;
	v_section uuid;
	v_id uuid;
begin
	if v_email is null or v_email = '' then
		return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
	end if;
	if not exists (select 1 from public._coin_economy_enrollments() x where x.student_email = v_email) then
		return jsonb_build_object('ok', false, 'reason', 'no_section');
	end if;
	select * into v_role from public.coin_role_definitions where id = p_role_id;
	if v_role.id is null or not v_role.active then
		return jsonb_build_object('ok', false, 'reason', 'unknown_role');
	end if;
	v_section := public._coin_role_apply_section(v_email, v_role.id);
	if public._coin_role_class_cap(v_role.id, v_section) = 0 then
		return jsonb_build_object('ok', false, 'reason', 'role_off');
	end if;
	if exists (select 1 from public.coin_role_holders where student_email = v_email and role_id = v_role.id
		and revoked_at is null and (expires_at is null or expires_at > now())) then
		return jsonb_build_object('ok', false, 'reason', 'already_holds_role');
	end if;
	if exists (select 1 from public.coin_role_applications where student_email = v_email and role_id = v_role.id
		and status = 'pending') then
		return jsonb_build_object('ok', false, 'reason', 'already_applied');
	end if;
	v_id := public._coin_role_insert_application(v_email, v_role, v_section, p_answers, v_email);
	return jsonb_build_object('ok', true, 'application_id', v_id);
end;
$$;
revoke all on function public.coin_role_self_apply(text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.coin_role_self_apply(text, jsonb) to authenticated;

-- The admin's apply-on-behalf, same signature as 0076's.
create or replace function public.coin_role_apply(
	p_student_email text,
	p_role_id text,
	p_answers jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_student_email, '')));
	v_role public.coin_role_definitions;
	v_id uuid;
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can apply for a role on a student''s behalf.';
	end if;
	select * into v_role from public.coin_role_definitions where id = p_role_id;
	if v_role.id is null or not v_role.active then
		return jsonb_build_object('ok', false, 'reason', 'unknown_role');
	end if;
	if public._coin_home_section(v_email) is null then
		return jsonb_build_object('ok', false, 'reason', 'no_section');
	end if;
	v_id := public._coin_role_insert_application(v_email, v_role, public._coin_role_apply_section(v_email, v_role.id),
		p_answers, public.current_user_email());
	return jsonb_build_object('ok', true, 'application_id', v_id);
end;
$$;
revoke all on function public.coin_role_apply(text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.coin_role_apply(text, text, jsonb) to authenticated;

-- ACCEPTING. Same signature as 0076's; the cap is the class's own.
create or replace function public.coin_role_admin_review(
	p_application_id uuid,
	p_decision text,
	p_note text default null,
	p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_app public.coin_role_applications;
	v_note text := nullif(btrim(coalesce(p_note, '')), '');
	v_cap integer;
	v_held integer;
	v_holder_id uuid;
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can review role applications.';
	end if;
	if p_decision not in ('approve', 'reject') then
		raise exception 'Decision must be "approve" or "reject".';
	end if;
	select * into v_app from public.coin_role_applications where id = p_application_id for update;
	if v_app.id is null then
		raise exception 'Unknown application.';
	end if;
	if v_app.status <> 'pending' then
		raise exception 'This application was already %.', v_app.status;
	end if;
	if p_decision = 'reject' then
		update public.coin_role_applications
		set status = 'rejected', reviewed_by = public.current_user_email(), reviewed_at = now(), review_note = v_note
		where id = p_application_id;
		return jsonb_build_object('ok', true, 'status', 'rejected', 'application_id', p_application_id);
	end if;
	if v_app.class_section_id is null then
		return jsonb_build_object('ok', false, 'reason', 'no_class');
	end if;
	perform pg_advisory_xact_lock(hashtext('coin_role_cap:' || v_app.role_id || ':' || v_app.class_section_id::text));
	v_cap := public._coin_role_class_cap(v_app.role_id, v_app.class_section_id);
	v_held := public._coin_role_class_held(v_app.role_id, v_app.class_section_id);
	if v_held >= v_cap then
		return jsonb_build_object('ok', false, 'reason', 'ratio_cap_reached', 'role_id', v_app.role_id,
			'section_id', v_app.class_section_id, 'cap', v_cap, 'held', v_held);
	end if;
	if exists (select 1 from public.coin_role_holders where student_email = v_app.student_email
		and role_id = v_app.role_id and revoked_at is null and (expires_at is null or expires_at > now())) then
		return jsonb_build_object('ok', false, 'reason', 'already_holds_role');
	end if;
	update public.coin_role_holders
	set revoked_at = expires_at, revoked_by = 'system', revoke_reason = 'Closed automatically: role expired.'
	where student_email = v_app.student_email and role_id = v_app.role_id
		and revoked_at is null and expires_at is not null and expires_at <= now();
	insert into public.coin_role_holders (student_email, role_id, section_id, class_section_id, application_id, assigned_by, expires_at)
	values (v_app.student_email, v_app.role_id, null, v_app.class_section_id, v_app.id, public.current_user_email(), p_expires_at)
	returning id into v_holder_id;
	update public.coin_role_applications
	set status = 'approved', reviewed_by = public.current_user_email(), reviewed_at = now(), review_note = v_note
	where id = p_application_id;
	return jsonb_build_object('ok', true, 'status', 'approved', 'application_id', p_application_id,
		'holder_id', v_holder_id, 'expires_at', p_expires_at);
end;
$$;
revoke all on function public.coin_role_admin_review(uuid, text, text, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.coin_role_admin_review(uuid, text, text, timestamptz) to authenticated;

-- Move an application or a holder to a class (an ambiguous backfill, or a
-- student who changed classes).
create or replace function public.coin_role_set_class(p_holder_id uuid, p_application_id uuid, p_section_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can change a role''s class.';
	end if;
	if not exists (select 1 from public.classroom_sections where id = p_section_id) then
		return jsonb_build_object('ok', false, 'reason', 'unknown_class');
	end if;
	if p_holder_id is not null then
		update public.coin_role_holders set class_section_id = p_section_id where id = p_holder_id;
	end if;
	if p_application_id is not null then
		update public.coin_role_applications set class_section_id = p_section_id where id = p_application_id;
	end if;
	return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.coin_role_set_class(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.coin_role_set_class(uuid, uuid, uuid) to authenticated;

create or replace function public.coin_role_class_set(p_role_id text, p_section_id uuid, p_cap integer, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_old jsonb;
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can change role caps.';
	end if;
	if not exists (select 1 from public.coin_role_definitions where id = p_role_id)
		or not exists (select 1 from public.classroom_sections where id = p_section_id) then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if p_cap is not null and p_cap not between 0 and 20 then
		return jsonb_build_object('ok', false, 'reason', 'cap');
	end if;
	select to_jsonb(s) into v_old from public.coin_role_class_settings s where s.role_id = p_role_id and s.section_id = p_section_id;
	insert into public.coin_role_class_settings (role_id, section_id, cap, enabled, updated_by)
	values (p_role_id, p_section_id, coalesce(p_cap, 1), coalesce(p_enabled, true), public.current_user_email())
	on conflict (role_id, section_id) do update
		set cap = coalesce(p_cap, public.coin_role_class_settings.cap),
			enabled = coalesce(p_enabled, public.coin_role_class_settings.enabled),
			updated_by = excluded.updated_by, updated_at = now();
	perform public._coin_audit('role_class:' || p_role_id || ':' || p_section_id, v_old,
		(select to_jsonb(s) from public.coin_role_class_settings s where s.role_id = p_role_id and s.section_id = p_section_id));
	return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.coin_role_class_set(text, uuid, integer, boolean) from public, anon, authenticated, service_role;
grant execute on function public.coin_role_class_set(text, uuid, integer, boolean) to authenticated;

-- One holder's own rules (null clears them: the globals apply again).
create or replace function public.coin_role_holder_rules_set(p_holder_id uuid, p_rules jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can change a holder''s rules.';
	end if;
	if not exists (select 1 from public.coin_role_holders where id = p_holder_id) then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if p_rules is null or p_rules = '{}'::jsonb then
		delete from public.coin_role_holder_rules where holder_id = p_holder_id;
		return jsonb_build_object('ok', true, 'rules', public._coin_role_rules(p_holder_id));
	end if;
	if jsonb_typeof(p_rules) <> 'object'
		or (p_rules ? 'min_gap_minutes' and not public._coin_setting_ok('role_min_gap_minutes', p_rules -> 'min_gap_minutes'))
		or (p_rules ? 'photos_per_day' and not public._coin_setting_ok('role_photos_per_day', p_rules -> 'photos_per_day'))
		or (p_rules ? 'window_start' and not public._coin_setting_ok('role_window_start', p_rules -> 'window_start'))
		or (p_rules ? 'window_end' and not public._coin_setting_ok('role_window_end', p_rules -> 'window_end'))
		or exists (select 1 from jsonb_object_keys(p_rules) k
			where k not in ('min_gap_minutes', 'photos_per_day', 'window_start', 'window_end')) then
		return jsonb_build_object('ok', false, 'reason', 'invalid');
	end if;
	insert into public.coin_role_holder_rules (holder_id, rules, updated_by)
	values (p_holder_id, p_rules, public.current_user_email())
	on conflict (holder_id) do update set rules = excluded.rules, updated_by = excluded.updated_by, updated_at = now();
	return jsonb_build_object('ok', true, 'rules', public._coin_role_rules(p_holder_id));
end;
$$;
revoke all on function public.coin_role_holder_rules_set(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.coin_role_holder_rules_set(uuid, jsonb) to authenticated;

-- Accept or reject one day by hand; null clears the override.
create or replace function public.coin_role_day_set(p_holder_id uuid, p_day date, p_verdict text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can change a role day.';
	end if;
	if not exists (select 1 from public.coin_role_holders where id = p_holder_id) or p_day is null then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if p_verdict is null then
		delete from public.coin_role_day_overrides where holder_id = p_holder_id and on_day = p_day;
	elsif p_verdict in ('accepted', 'rejected') then
		insert into public.coin_role_day_overrides (holder_id, on_day, verdict, decided_by, note)
		values (p_holder_id, p_day, p_verdict, public.current_user_email(), nullif(btrim(coalesce(p_note, '')), ''))
		on conflict (holder_id, on_day) do update set verdict = excluded.verdict, decided_by = excluded.decided_by,
			decided_at = now(), note = excluded.note;
	else
		return jsonb_build_object('ok', false, 'reason', 'invalid');
	end if;
	return jsonb_build_object('ok', true, 'status', public._coin_role_day_status(p_holder_id, p_day));
end;
$$;
revoke all on function public.coin_role_day_set(uuid, date, text, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_role_day_set(uuid, date, text, text) to authenticated;

-- Called by _coin_decide (0245) for a role_day card.
create or replace function public._coin_decide_role_day(p_req public.coin_requests, p_approve boolean, p_actor text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
	insert into public.coin_role_day_overrides (holder_id, on_day, verdict, decided_by, note)
	values ((p_req.payload ->> 'holder_id')::uuid, (p_req.payload ->> 'day')::date,
		case when p_approve then 'accepted' else 'rejected' end, p_actor, 'Decided from the queue.')
	on conflict (holder_id, on_day) do update set verdict = excluded.verdict, decided_by = excluded.decided_by,
		decided_at = now(), note = excluded.note;
	return jsonb_build_object('day', p_req.payload ->> 'day', 'verdict', case when p_approve then 'accepted' else 'rejected' end);
end;
$$;
revoke all on function public._coin_decide_role_day(public.coin_requests, boolean, text) from public, anon, authenticated, service_role;
-- ===== PART B END =====

-- ===== PART C BEGIN =====
-- ===== PART C: THE EVIDENCE PORTAL =====

-- The caller's active holder rows.
create or replace function public._coin_my_holders()
returns setof public.coin_role_holders
language sql
stable
security definer
set search_path = ''
as $$
	select * from public.coin_role_holders h
	where h.student_email = public.current_user_email() and h.revoked_at is null
		and (h.expires_at is null or h.expires_at > now());
$$;
revoke all on function public._coin_my_holders() from public, anon, authenticated, service_role;

-- ONE PHOTO, timed by the server the moment it is recorded.
create or replace function public.coin_role_capture(p_holder_id uuid, p_path text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_seam jsonb := public._coin_student_seam('role_capture');
	v_email text;
	v_holder public.coin_role_holders;
	v_rules jsonb;
	v_now_time time := (now() at time zone 'America/Los_Angeles')::time;
	v_today date := public._coin_la_today();
	v_n integer;
	v_row public.coin_role_evidence;
begin
	if not (v_seam ->> 'ok')::boolean then
		return v_seam;
	end if;
	v_email := v_seam ->> 'email';
	select * into v_holder from public._coin_my_holders() h where h.id = p_holder_id;
	if v_holder.id is null then
		return jsonb_build_object('ok', false, 'reason', 'not_your_role');
	end if;
	if not public._coin_own_upload_ok(p_path) then
		return jsonb_build_object('ok', false, 'reason', 'no_upload');
	end if;
	v_rules := public._coin_role_rules(v_holder.id);
	if v_now_time not between (v_rules ->> 'window_start')::time and (v_rules ->> 'window_end')::time then
		return jsonb_build_object('ok', false, 'reason', 'outside_window', 'rules', v_rules);
	end if;
	select count(*) into v_n from public.coin_role_evidence e where e.holder_id = v_holder.id and e.on_day = v_today;
	if v_n >= 10 then
		return jsonb_build_object('ok', false, 'reason', 'too_many_today');
	end if;
	insert into public.coin_role_evidence (holder_id, student_email, on_day, photo_path)
	values (v_holder.id, v_email, v_today, p_path)
	returning * into v_row;
	return jsonb_build_object('ok', true, 'evidence_id', v_row.id, 'taken_at', v_row.taken_at,
		'today', public._coin_role_day_status(v_holder.id, v_today));
end;
$$;
revoke all on function public.coin_role_capture(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_role_capture(uuid, text) to authenticated;

-- A holder asks for one day to be looked at by hand (a queue card).
create or replace function public.coin_role_request_exception(p_holder_id uuid, p_day date, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_seam jsonb := public._coin_student_seam('role_exception');
	v_email text;
	v_holder public.coin_role_holders;
	v_note text := nullif(btrim(coalesce(p_note, '')), '');
	v_req public.coin_requests;
begin
	if not (v_seam ->> 'ok')::boolean then
		return v_seam;
	end if;
	v_email := v_seam ->> 'email';
	select * into v_holder from public.coin_role_holders h where h.id = p_holder_id and h.student_email = v_email;
	if v_holder.id is null then
		return jsonb_build_object('ok', false, 'reason', 'not_your_role');
	end if;
	if p_day is null or p_day > public._coin_la_today() or p_day < public._coin_la_today() - 30 then
		return jsonb_build_object('ok', false, 'reason', 'day');
	end if;
	if v_note is null or char_length(v_note) > 1000 then
		return jsonb_build_object('ok', false, 'reason', 'note_required');
	end if;
	if exists (select 1 from public.coin_requests r where r.kind = 'role_day' and r.status = 'pending'
		and r.payload ->> 'holder_id' = p_holder_id::text and r.payload ->> 'day' = p_day::text) then
		return jsonb_build_object('ok', false, 'reason', 'already_pending');
	end if;
	v_req := public._coin_new_request('role_day', v_email, null, null,
		jsonb_build_object('holder_id', p_holder_id::text, 'day', p_day::text, 'role_id', v_holder.role_id,
			'status', public._coin_role_day_status(p_holder_id, p_day)), v_note);
	return jsonb_build_object('ok', true, 'request_id', v_req.id);
end;
$$;
revoke all on function public.coin_role_request_exception(uuid, date, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_role_request_exception(uuid, date, text) to authenticated;

-- One holder's days in a range, oldest first, with the class days marked.
create or replace function public._coin_role_days(p_holder_id uuid, p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(jsonb_agg(public._coin_role_day_status(p_holder_id, d::date)
		|| jsonb_build_object('class_day', public._coin_section_meets(h.class_section_id, d::date),
			'photo_paths', coalesce((select jsonb_agg(jsonb_build_object('path', e.photo_path, 'taken_at', e.taken_at) order by e.taken_at)
				from public.coin_role_evidence e where e.holder_id = p_holder_id and e.on_day = d::date), '[]'::jsonb))
		order by d), '[]'::jsonb)
	from public.coin_role_holders h, generate_series(p_from, p_to, interval '1 day') d
	where h.id = p_holder_id;
$$;
revoke all on function public._coin_role_days(uuid, date, date) from public, anon, authenticated, service_role;

-- THE PORTAL'S READ: the caller's active roles, the instructions, the rules,
-- and the last two weeks of days.
create or replace function public.coin_my_role()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
begin
	if (select auth.uid()) is null or v_email = '' then
		return jsonb_build_object('signed_in', false);
	end if;
	return jsonb_build_object('signed_in', true, 'roles', coalesce((select jsonb_agg(jsonb_build_object(
			'holder_id', h.id, 'role_id', h.role_id, 'role', d.name,
			'section', public._coin_classroom_section_label(h.class_section_id),
			'since', h.since, 'expires_at', h.expires_at,
			'instructions', coalesce(public._coin_setting('role_instructions') ->> h.role_id, d.description),
			'rules', public._coin_role_rules(h.id),
			'today', public._coin_la_today(),
			'class_today', public._coin_section_meets(h.class_section_id, public._coin_la_today()),
			'days', public._coin_role_days(h.id, greatest(public._coin_la_today() - 13, public._coin_la_today(h.since)), public._coin_la_today()))
			order by d.sort_order)
		from public._coin_my_holders() h join public.coin_role_definitions d on d.id = h.role_id), '[]'::jsonb));
end;
$$;
revoke all on function public.coin_my_role() from public, anon, authenticated, service_role;
grant execute on function public.coin_my_role() to authenticated;
-- ===== PART C END =====

-- ===== PART D BEGIN =====
-- ===== PART D: THE COIN DESK'S READ, AND THE BADGES =====

create or replace function public.coin_roles_admin()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can manage roles.';
	end if;
	return jsonb_build_object(
		'roles', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'description', d.description,
				'active', d.active, 'suggested_duration_days', d.suggested_duration_days,
				'instructions', public._coin_setting('role_instructions') ->> d.id) order by d.sort_order)
			from public.coin_role_definitions d), '[]'::jsonb),
		'classes', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'label', public._coin_classroom_section_label(s.id),
				'roles', (select jsonb_agg(jsonb_build_object('role_id', d.id,
					'cap', coalesce(cs.cap, 1), 'enabled', coalesce(cs.enabled, true),
					'held', public._coin_role_class_held(d.id, s.id)) order by d.sort_order)
					from public.coin_role_definitions d
					left join public.coin_role_class_settings cs on cs.role_id = d.id and cs.section_id = s.id
					where d.active))
				order by public._coin_classroom_section_label(s.id))
			from public.classroom_sections s where s.active and s.coin_economy_on), '[]'::jsonb),
		'applications', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'email', a.student_email,
				'name', public._coin_student_name(a.student_email), 'role_id', a.role_id, 'role', d.name,
				'section_id', a.class_section_id, 'section', public._coin_classroom_section_label(a.class_section_id),
				'submitted_at', a.submitted_at,
				'answers', coalesce((select jsonb_agg(jsonb_build_object('question', qa.question_text, 'type', qa.question_type,
						'options', qa.options, 'written_answer', qa.written_answer,
						'selected_option_index', qa.selected_option_index, 'is_correct', qa.is_correct) order by qa.sequence)
					from public.coin_role_application_answers qa where qa.application_id = a.id), '[]'::jsonb))
				order by a.submitted_at)
			from public.coin_role_applications a join public.coin_role_definitions d on d.id = a.role_id
			where a.status = 'pending'), '[]'::jsonb),
		'holders', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'email', h.student_email,
				'name', public._coin_student_name(h.student_email), 'role_id', h.role_id, 'role', d.name,
				'section_id', h.class_section_id, 'section', public._coin_classroom_section_label(h.class_section_id),
				'since', h.since, 'expires_at', h.expires_at, 'rules', public._coin_role_rules(h.id),
				'days', public._coin_role_days(h.id, greatest(public._coin_la_today() - 13, public._coin_la_today(h.since)), public._coin_la_today()))
				order by d.sort_order, public._coin_student_name(h.student_email))
			from public.coin_role_holders h join public.coin_role_definitions d on d.id = h.role_id
			where h.revoked_at is null and (h.expires_at is null or h.expires_at > now())), '[]'::jsonb)
	);
end;
$$;
revoke all on function public.coin_roles_admin() from public, anon, authenticated, service_role;
grant execute on function public.coin_roles_admin() to authenticated;

-- PUBLIC: who holds which role, by the Ledger's opaque id. No email.
create or replace function public.coin_public_role_badges()
returns table (student_id text, role_id text, role text)
language sql
stable
security definer
set search_path = ''
as $$
	select ros.public_id, h.role_id, d.name
	from public.coin_role_holders h
	join public.coin_role_definitions d on d.id = h.role_id
	join public._coin_public_roster() ros on ros.student_email = h.student_email
	where h.revoked_at is null and (h.expires_at is null or h.expires_at > now())
	order by ros.public_id, d.sort_order;
$$;
revoke all on function public.coin_public_role_badges() from public, anon, authenticated, service_role;
grant execute on function public.coin_public_role_badges() to anon, authenticated;

-- THE CLASS PEOPLE LIST: role badges for one class, for its managers.
create or replace function public.coin_section_role_badges(p_section_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if p_section_id is null or not public.classroom_manages_section(p_section_id) then
		return '[]'::jsonb;
	end if;
	return coalesce((select jsonb_agg(jsonb_build_object('email', h.student_email, 'role_id', h.role_id, 'role', d.name)
			order by d.sort_order)
		from public.coin_role_holders h
		join public.coin_role_definitions d on d.id = h.role_id
		join public.classroom_enrollments e on e.student_email = h.student_email and e.section_id = p_section_id and e.active
		where h.revoked_at is null and (h.expires_at is null or h.expires_at > now())), '[]'::jsonb);
end;
$$;
revoke all on function public.coin_section_role_badges(uuid) from public, anon, authenticated, service_role;
grant execute on function public.coin_section_role_badges(uuid) to authenticated;

-- The stipend is 1 coin per week now (2.5), unless an admin already set it.
do $stip$
begin
	if not exists (select 1 from public.coin_settings_audit where key = 'category:weekly_role_stipend')
		and not exists (select 1 from public.coin_settings where key = 'v2s2_stipend_rate_applied') then
		update public.coin_categories set amount = 1,
			explanation = 'Paid every two weeks to a student who holds a class role: 1 coin per week, for the days you proved with your start and end photos. Each class day with valid photos counts; a missed day only takes that day off the pay. It is separate from your wage.'
		where id = 'weekly_role_stipend';
		insert into public.coin_settings (key, value, updated_by) values ('v2s2_stipend_rate_applied', to_jsonb(now()), 'system')
		on conflict (key) do nothing;
	end if;
end
$stip$;
-- ===== PART D END =====

do $chk$
declare
	r record;
begin
	for r in
		select p.oid::regprocedure::text as sig
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname in ('coin_role_capture', 'coin_role_request_exception', 'coin_my_role',
			'coin_roles_admin', 'coin_role_class_set', 'coin_role_holder_rules_set', 'coin_role_day_set',
			'coin_role_set_class', 'coin_section_role_badges', 'coin_role_self_apply', 'coin_role_apply', 'coin_role_admin_review')
			and has_function_privilege('anon', p.oid, 'execute')
	loop
		raise exception '0247: anon must not execute %.', r.sig;
	end loop;
	if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = 'coin_role_capture'
			and pg_get_function_identity_arguments(p.oid) ~* '(email|taken|time|at\b)') then
		raise exception '0247: coin_role_capture must not take a time or an identity: the server stamps it.';
	end if;
	raise notice '0247: roles are evidence jobs. % active holder(s), % with no class.',
		(select count(*) from public.coin_role_holders where revoked_at is null),
		(select count(*) from public.coin_role_holders where revoked_at is null and class_section_id is null);
end
$chk$;
