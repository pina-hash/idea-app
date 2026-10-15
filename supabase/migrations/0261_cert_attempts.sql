-- 0261_cert_attempts.sql
--
-- IDEA CERTIFICATION PORTAL, PART TWO OF FIVE (ledger 0391): ATTEMPTS.
-- docs/certifications/DATA_MODEL.md section 0261. One student working one
-- certification: the attempt and its per-part checks, the project and checkout
-- submissions and their reviews, training progress and watch telemetry, and
-- the private evidence bucket.
--
-- WHAT IT CREATES, all new and all cert_-prefixed:
--   tables     cert_attempts, cert_checks, cert_submissions, cert_reviews,
--              cert_training_progress, cert_watch_sessions (append-only),
--              cert_practice_results (append-only)
--   storage    the private bucket cert-evidence (45 MiB a file, the portal
--              ceiling 0185 holds every bucket to) and two storage.objects
--              policies, in a guarded block that NOTICEs where the applying
--              role cannot write storage, exactly as 0233 does
--   helpers    _cert_attempt_owner, _cert_can_read_evidence,
--              _cert_storage_prefix_uuid, _cert_touch, _cert_holds,
--              _cert_next_part, _cert_part_unlocked, _cert_part_word,
--              _cert_certifier_emails, _cert_training_revision,
--              _cert_merge_ranges, _cert_training_rollup, _cert_attempt_json,
--              _cert_check_done
--   policy predicates (granted to authenticated because a storage policy is
--              evaluated as the QUERYING role, the 0070 lesson)
--              cert_can_write_evidence_object, cert_can_read_evidence_object
--   client     cert_start, cert_withdraw, cert_me, cert_submit, cert_review,
--              cert_checkout_in_person, cert_watch_report,
--              cert_lesson_complete, cert_practice_record, cert_student_view,
--              cert_desk
--
-- THE ONE FIXED ORDER a certification is earned in is training, guided, exam,
-- autonomous, checkout; a part unlocks when every earlier part is done or
-- waived (_cert_part_unlocked), and the next part is the first still pending
-- (_cert_next_part). A waived part's check row is created as waived at start
-- so the checklist still names it.
--
-- NOBODY ACTS ON THEIR OWN RECORD: cert_review and cert_checkout_in_person
-- refuse a certifier whose address is the attempt's. Every student-facing
-- writer takes no identity parameter.
--
-- LATE-BOUND, like 0260's readers: _cert_attempt_json projects seats and exams
-- (0262) and the award (0263), _cert_holds reads cert_awards (0263), and every
-- notifying write calls _cert_notify (0263). All are plpgsql and resolve those
-- names when they run, so this file applies on its own and its self-check calls
-- none of them. The five files land as one bundle on one merge.
--
-- ADDITIVE AND IDEMPOTENT; every table RLS on, no policy, no client grant; every
-- function revokes from public, anon, authenticated and service_role by name
-- and grants back only what its contract row lists. DEPLOY ORDER: none.
--
-- UNDO, for a person's paste:
--   drop policy if exists "cert evidence insert by owner" on storage.objects;
--   drop policy if exists "cert evidence readable by owner or certifier" on storage.objects;
--   delete the bucket row from storage.buckets by hand, after its objects
--   drop function if exists public.cert_desk();
--   drop function if exists public.cert_student_view(text);
--   drop function if exists public.cert_practice_record(uuid, text, text, boolean);
--   drop function if exists public.cert_lesson_complete(uuid, text);
--   drop function if exists public.cert_watch_report(uuid, text, numeric, jsonb, numeric, integer, numeric);
--   drop function if exists public.cert_checkout_in_person(uuid, text, text);
--   drop function if exists public.cert_review(uuid, text, text);
--   drop function if exists public.cert_submit(uuid, text, jsonb, jsonb);
--   drop function if exists public.cert_me();
--   drop function if exists public.cert_withdraw(uuid);
--   drop function if exists public.cert_start(text);
--   drop function if exists public.cert_can_read_evidence_object(text);
--   drop function if exists public.cert_can_write_evidence_object(text);
--   drop function if exists public._cert_check_done(uuid, text, text, text);
--   drop function if exists public._cert_attempt_json(uuid);
--   drop function if exists public._cert_training_rollup(text, uuid);
--   drop function if exists public._cert_merge_ranges(jsonb, numeric);
--   drop function if exists public._cert_training_revision(text, uuid);
--   drop function if exists public._cert_certifier_emails(uuid);
--   drop function if exists public._cert_part_word(text);
--   drop function if exists public._cert_part_unlocked(uuid, text);
--   drop function if exists public._cert_next_part(uuid);
--   drop function if exists public._cert_holds(text, uuid);
--   drop function if exists public._cert_touch(uuid);
--   drop function if exists public._cert_storage_prefix_uuid(text);
--   drop function if exists public._cert_can_read_evidence(uuid);
--   drop function if exists public._cert_attempt_owner(uuid);
--   drop table if exists public.cert_practice_results;
--   drop table if exists public.cert_watch_sessions;
--   drop table if exists public.cert_training_progress;
--   drop table if exists public.cert_reviews;
--   drop table if exists public.cert_submissions;
--   drop table if exists public.cert_checks;
--   drop table if exists public.cert_attempts;

-- ===== PART A BEGIN =====
-- ===== PART A: TABLES =====

create table if not exists public.cert_attempts (
	id uuid primary key default gen_random_uuid(),
	certification_id uuid not null references public.cert_certifications (id),
	revision_id uuid not null references public.cert_revisions (id),
	email text not null check (email = lower(btrim(email)) and email like '%@%'),
	state text not null default 'active' check (state in ('active', 'withdrawn', 'dormant', 'complete')),
	started_at timestamptz not null default now(),
	finished_at timestamptz,
	withdrawn_at timestamptz,
	dormant_at timestamptz,
	last_activity_at timestamptz not null default now()
);
create unique index if not exists cert_attempts_one_live_idx
	on public.cert_attempts (certification_id, email) where state in ('active', 'dormant');
create index if not exists cert_attempts_email_idx on public.cert_attempts (email, started_at desc);
create index if not exists cert_attempts_cert_state_idx on public.cert_attempts (certification_id, state);
alter table public.cert_attempts enable row level security;
revoke all on table public.cert_attempts from public, anon, authenticated;

create table if not exists public.cert_checks (
	attempt_id uuid not null references public.cert_attempts (id) on delete cascade,
	part text not null check (part in ('training', 'guided', 'exam', 'autonomous', 'checkout')),
	state text not null default 'pending' check (state in ('pending', 'done', 'waived')),
	checked_by text,
	checked_at timestamptz,
	note text,
	primary key (attempt_id, part)
);
alter table public.cert_checks enable row level security;
revoke all on table public.cert_checks from public, anon, authenticated;

create table if not exists public.cert_submissions (
	id uuid primary key default gen_random_uuid(),
	attempt_id uuid not null references public.cert_attempts (id) on delete cascade,
	part text not null check (part in ('guided', 'autonomous', 'checkout')),
	evidence jsonb not null,
	self_inspection jsonb not null default '[]'::jsonb,
	in_person boolean not null default false,
	state text not null default 'pending' check (state in ('pending', 'passed', 'failed')),
	submitted_at timestamptz not null default now(),
	decided_at timestamptz
);
create index if not exists cert_submissions_attempt_idx on public.cert_submissions (attempt_id, part, submitted_at desc);
create index if not exists cert_submissions_pending_idx on public.cert_submissions (submitted_at) where state = 'pending';
alter table public.cert_submissions enable row level security;
revoke all on table public.cert_submissions from public, anon, authenticated;

create table if not exists public.cert_reviews (
	id uuid primary key default gen_random_uuid(),
	submission_id uuid not null references public.cert_submissions (id) on delete cascade,
	reviewer_email text not null,
	decision text not null check (decision in ('pass', 'fail')),
	feedback text not null default '',
	reviewed_at timestamptz not null default now(),
	check (decision <> 'fail' or length(feedback) > 0)
);
create index if not exists cert_reviews_submission_idx on public.cert_reviews (submission_id, reviewed_at desc);
alter table public.cert_reviews enable row level security;
revoke all on table public.cert_reviews from public, anon, authenticated;

create table if not exists public.cert_training_progress (
	email text not null,
	certification_id uuid not null references public.cert_certifications (id) on delete cascade,
	item_key text not null,
	item_kind text not null check (item_kind in ('video', 'lesson')),
	duration_seconds numeric,
	ranges jsonb not null default '[]'::jsonb,
	covered_seconds numeric not null default 0,
	completed_at timestamptz,
	updated_at timestamptz not null default now(),
	primary key (email, certification_id, item_key)
);
alter table public.cert_training_progress enable row level security;
revoke all on table public.cert_training_progress from public, anon, authenticated;

create table if not exists public.cert_watch_sessions (
	id bigserial primary key,
	email text not null,
	certification_id uuid not null,
	item_key text not null,
	at timestamptz not null default now(),
	played_seconds numeric,
	max_rate numeric,
	checkins_missed integer,
	coverage numeric
);
create index if not exists cert_watch_sessions_at_idx on public.cert_watch_sessions (at desc);
alter table public.cert_watch_sessions enable row level security;
revoke all on table public.cert_watch_sessions from public, anon, authenticated;
revoke all on sequence public.cert_watch_sessions_id_seq from public, anon, authenticated;

create table if not exists public.cert_practice_results (
	id bigserial primary key,
	email text not null,
	certification_id uuid not null,
	kind text not null check (kind in ('quick', 'practice')),
	item_id text not null,
	correct boolean not null,
	at timestamptz not null default now()
);
create index if not exists cert_practice_results_at_idx on public.cert_practice_results (at desc);
alter table public.cert_practice_results enable row level security;
revoke all on table public.cert_practice_results from public, anon, authenticated;
revoke all on sequence public.cert_practice_results_id_seq from public, anon, authenticated;
-- ===== PART A END =====

-- ===== PART B BEGIN =====
-- ===== PART B: HELPERS =====

-- The attempt's email is the caller's. False, never a raise, with no session,
-- because the storage policy wrappers call it.
create or replace function public._cert_attempt_owner(p_attempt uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_email text := lower(btrim(coalesce(public.current_user_email(), '')));
begin
	if v_email = '' or p_attempt is null then
		return false;
	end if;
	return exists (select 1 from public.cert_attempts t where t.id = p_attempt and t.email = v_email);
end;
$fn$;
revoke all on function public._cert_attempt_owner(uuid) from public, anon, authenticated, service_role;

-- Owner, or a certifier of the attempt's certification.
create or replace function public._cert_can_read_evidence(p_attempt uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_cert uuid;
begin
	if p_attempt is null then
		return false;
	end if;
	if public._cert_attempt_owner(p_attempt) then
		return true;
	end if;
	select certification_id into v_cert from public.cert_attempts where id = p_attempt;
	if v_cert is null then
		return false;
	end if;
	return public._cert_can_certify(v_cert);
end;
$fn$;
revoke all on function public._cert_can_read_evidence(uuid) from public, anon, authenticated, service_role;

-- The first path segment when it is a bare uuid, else null; every caller is
-- written so null fails closed (the 0133 rule).
create or replace function public._cert_storage_prefix_uuid(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $fn$
	select case
		when split_part(coalesce(p_name, ''), '/', 1)
			~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
		then split_part(p_name, '/', 1)::uuid
	end;
$fn$;
revoke all on function public._cert_storage_prefix_uuid(text) from public, anon, authenticated, service_role;

-- The two names a storage.objects policy may carry. A policy expression runs
-- as the querying role, so these two are granted to authenticated and the
-- _cert_ helpers behind them stay private. Neither can raise.
create or replace function public.cert_can_write_evidence_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_attempt uuid := public._cert_storage_prefix_uuid(p_name);
begin
	if v_attempt is null or not public._cert_attempt_owner(v_attempt) then
		return false;
	end if;
	return exists (select 1 from public.cert_attempts t where t.id = v_attempt and t.state in ('active', 'dormant'));
end;
$fn$;
revoke all on function public.cert_can_write_evidence_object(text) from public, anon, authenticated, service_role;
grant execute on function public.cert_can_write_evidence_object(text) to authenticated;

create or replace function public.cert_can_read_evidence_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
	return public._cert_can_read_evidence(public._cert_storage_prefix_uuid(p_name));
end;
$fn$;
revoke all on function public.cert_can_read_evidence_object(text) from public, anon, authenticated, service_role;
grant execute on function public.cert_can_read_evidence_object(text) to authenticated;

-- Activity: last_activity_at moves, and a dormant attempt comes back.
create or replace function public._cert_touch(p_attempt uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	t public.cert_attempts%rowtype;
begin
	update public.cert_attempts set state = 'active', dormant_at = null, last_activity_at = now()
	where id = p_attempt and state = 'dormant'
	returning * into t;
	if found then
		perform public._cert_event('attempt.revived', t.email, t.email, t.certification_id, t.id, '{}'::jsonb, null);
		return;
	end if;
	update public.cert_attempts set last_activity_at = now() where id = p_attempt;
end;
$fn$;
revoke all on function public._cert_touch(uuid) from public, anon, authenticated, service_role;

-- Holds an active award that has not expired (reads 0263's cert_awards).
create or replace function public._cert_holds(p_email text, p_cert uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
	if p_email is null or p_cert is null then
		return false;
	end if;
	return exists (
		select 1 from public.cert_awards a
		where a.certification_id = p_cert and a.email = lower(btrim(p_email))
			and a.status = 'active' and (a.expires_at is null or a.expires_at > now())
	);
end;
$fn$;
revoke all on function public._cert_holds(text, uuid) from public, anon, authenticated, service_role;

create or replace function public._cert_next_part(p_attempt uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $fn$
	select c.part from public.cert_checks c
	where c.attempt_id = p_attempt and c.state = 'pending'
	order by array_position(array['training', 'guided', 'exam', 'autonomous', 'checkout'], c.part)
	limit 1;
$fn$;
revoke all on function public._cert_next_part(uuid) from public, anon, authenticated, service_role;

create or replace function public._cert_part_unlocked(p_attempt uuid, p_part text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
	select not exists (
		select 1 from public.cert_checks c
		where c.attempt_id = p_attempt and c.state = 'pending'
			and array_position(array['training', 'guided', 'exam', 'autonomous', 'checkout'], c.part)
				< array_position(array['training', 'guided', 'exam', 'autonomous', 'checkout'], p_part)
	);
$fn$;
revoke all on function public._cert_part_unlocked(uuid, text) from public, anon, authenticated, service_role;

-- The word a student reads for a part (PART_WORDS in parts.ts).
create or replace function public._cert_part_word(p_part text)
returns text
language sql
immutable
set search_path = ''
as $fn$
	select case p_part
		when 'training' then 'Training'
		when 'guided' then 'Guided project'
		when 'exam' then 'Exam'
		when 'autonomous' then 'Autonomous project'
		when 'checkout' then 'Checkout'
		else coalesce(p_part, '')
	end;
$fn$;
revoke all on function public._cert_part_word(text) from public, anon, authenticated, service_role;

-- Everybody who certifies a certification: live authority rows, every admin
-- and the owner. Distinct and sorted.
create or replace function public._cert_certifier_emails(p_cert uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $fn$
	select coalesce(array_agg(distinct e order by e), '{}'::text[]) from (
		select a.email as e from public.cert_authority a where a.certification_id = p_cert and a.revoked_at is null
		union
		select x.email from public.app_admins x
		union
		select public.admin_owner_email()
	) s where e is not null and e <> '';
$fn$;
revoke all on function public._cert_certifier_emails(uuid) from public, anon, authenticated, service_role;

-- Which revision a person's training is judged against: their live attempt's,
-- else the certification's current one while it is published or retired.
create or replace function public._cert_training_revision(p_email text, p_cert uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $fn$
	select coalesce(
		(select t.revision_id from public.cert_attempts t
			where t.certification_id = p_cert and t.email = p_email and t.state in ('active', 'dormant')
			order by t.started_at desc limit 1),
		(select c.current_revision_id from public.cert_certifications c
			where c.id = p_cert and c.state in ('published', 'retired'))
	);
$fn$;
revoke all on function public._cert_training_revision(text, uuid) from public, anon, authenticated, service_role;

-- Played ranges clamped to the duration, sorted and merged: the one
-- implementation of coverage on the server (the client's mergeRanges only
-- decides what a surface draws).
create or replace function public._cert_merge_ranges(p_ranges jsonb, p_duration numeric)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $fn$
declare
	r record;
	v_out jsonb := '[]'::jsonb;
	v_start numeric;
	v_end numeric;
begin
	if not public._cert_jt(p_ranges, 'array') or p_duration is null or p_duration <= 0 then
		return '[]'::jsonb;
	end if;
	for r in
		select greatest(0, least(p_duration, (e -> 0 #>> '{}')::numeric)) as s,
			greatest(0, least(p_duration, (e -> 1 #>> '{}')::numeric)) as f
		from jsonb_array_elements(p_ranges) e
		where jsonb_typeof(e) = 'array' and jsonb_array_length(e) = 2
			and jsonb_typeof(e -> 0) = 'number' and jsonb_typeof(e -> 1) = 'number'
		order by 1, 2
	loop
		if r.f <= r.s then
			continue;
		end if;
		if v_start is null then
			v_start := r.s;
			v_end := r.f;
		elsif r.s <= v_end then
			v_end := greatest(v_end, r.f);
		else
			v_out := v_out || jsonb_build_array(jsonb_build_array(v_start, v_end));
			v_start := r.s;
			v_end := r.f;
		end if;
	end loop;
	if v_start is not null then
		v_out := v_out || jsonb_build_array(jsonb_build_array(v_start, v_end));
	end if;
	return v_out;
end;
$fn$;
revoke all on function public._cert_merge_ranges(jsonb, numeric) from public, anon, authenticated, service_role;

-- One attempt, as every surface reads it. Exams carry per-question detail
-- only for a certifier of the certification who is not the student.
create or replace function public._cert_attempt_json(p_attempt uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	t public.cert_attempts%rowtype;
	c public.cert_certifications%rowtype;
	v_pkg jsonb;
	v_me text := lower(btrim(coalesce(public.current_user_email(), '')));
	v_detail boolean;
begin
	select * into t from public.cert_attempts where id = p_attempt;
	if not found then
		return null;
	end if;
	select * into c from public.cert_certifications where id = t.certification_id;
	select package into v_pkg from public.cert_revisions where id = t.revision_id;
	v_detail := v_me <> t.email and public._cert_can_certify(t.certification_id);

	return jsonb_build_object(
		'id', t.id,
		'certification', jsonb_build_object('id', c.id, 'code', c.code, 'name', c.name, 'level', c.level, 'category', c.category),
		'revision_id', t.revision_id,
		'email', t.email,
		'state', t.state,
		'started_at', t.started_at,
		'finished_at', t.finished_at,
		'withdrawn_at', t.withdrawn_at,
		'dormant_at', t.dormant_at,
		'last_activity_at', t.last_activity_at,
		'parts', coalesce(v_pkg -> 'parts', '{"guided": true, "exam": true, "autonomous": true, "checkout": true}'::jsonb),
		'checks', coalesce((
			select jsonb_agg(jsonb_build_object('part', k.part, 'state', k.state,
				'checked_by_name', case when k.checked_by = 'system' then 'Automatic' else public._cert_person_name(k.checked_by) end,
				'checked_at', k.checked_at, 'note', k.note)
				order by array_position(array['training', 'guided', 'exam', 'autonomous', 'checkout'], k.part))
			from public.cert_checks k where k.attempt_id = t.id
		), '[]'::jsonb),
		'next_part', public._cert_next_part(t.id),
		'submissions', coalesce((
			select jsonb_agg(jsonb_build_object('id', s.id, 'part', s.part, 'state', s.state, 'in_person', s.in_person,
				'submitted_at', s.submitted_at, 'decided_at', s.decided_at, 'evidence', s.evidence,
				'self_inspection', s.self_inspection,
				'review', (select jsonb_build_object('decision', r.decision, 'feedback', r.feedback,
					'reviewer_name', public._cert_person_name(r.reviewer_email), 'reviewed_at', r.reviewed_at)
					from public.cert_reviews r where r.submission_id = s.id order by r.reviewed_at desc limit 1))
				order by s.submitted_at)
			from public.cert_submissions s where s.attempt_id = t.id
		), '[]'::jsonb),
		'exams', coalesce((
			select jsonb_agg((jsonb_build_object('id', e.id, 'state', e.state, 'released_at', e.released_at,
				'started_at', e.started_at, 'submitted_at', e.submitted_at, 'passed', e.passed,
				'missed_topics', coalesce(e.score -> 'missed_topics', '[]'::jsonb),
				'flags_count', jsonb_array_length(e.flags))
				|| case when v_detail then jsonb_build_object('detail', public._cert_exam_result_json(e.id)) else '{}'::jsonb end)
				order by e.released_at)
			from public.cert_exam_attempts e where e.attempt_id = t.id
		), '[]'::jsonb),
		'cooldown_until', public._cert_cooldown_until(t.id),
		'seat', (
			select jsonb_build_object('id', s.id, 'state', s.state, 'sitting_id', s.sitting_id,
				'scheduled_at', s.scheduled_at, 'requested_at', s.requested_at, 'decision_note', s.decision_note)
			from public.cert_seats s
			where s.attempt_id = t.id and s.state in ('requested', 'approved', 'booked')
			order by s.requested_at desc limit 1
		),
		'award', (
			select jsonb_build_object('serial', a.serial, 'awarded_at', a.awarded_at, 'expires_at', a.expires_at,
				'status', public._cert_award_status(a))
			from public.cert_awards a where a.attempt_id = t.id
		)
	);
end;
$fn$;
revoke all on function public._cert_attempt_json(uuid) from public, anon, authenticated, service_role;

-- Marks a pending check done and returns the notification row to send (null
-- when the check was not pending). Completing every part leaves the attempt
-- active: the award is a separate, deliberate press.
create or replace function public._cert_check_done(p_attempt uuid, p_part text, p_by text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	t public.cert_attempts%rowtype;
	c public.cert_certifications%rowtype;
	v_next text;
	v_body text;
begin
	update public.cert_checks set state = 'done', checked_by = p_by, checked_at = now(), note = p_note
	where attempt_id = p_attempt and part = p_part and state = 'pending';
	if not found then
		return null;
	end if;
	select * into t from public.cert_attempts where id = p_attempt;
	select * into c from public.cert_certifications where id = t.certification_id;
	perform public._cert_event('check.done', p_by, t.email, t.certification_id, t.id,
		jsonb_build_object('part', p_part), p_note);
	v_next := public._cert_next_part(p_attempt);
	v_body := public._cert_part_word(p_part) || ' is checked off for ' || c.name || ' (' || c.code || ').'
		|| case when v_next is null then ' Every part is done; a certifier can now award it.'
			else ' Next up: ' || lower(public._cert_part_word(v_next)) || '.' end;
	return public._cert_notify(t.email, 'part_checked', 'Checked off: ' || public._cert_part_word(p_part),
		v_body, '/certifications/' || c.code,
		jsonb_build_object('attempt_id', t.id, 'part', p_part, 'code', c.code, 'next_part', v_next));
end;
$fn$;
revoke all on function public._cert_check_done(uuid, text, text, text) from public, anon, authenticated, service_role;

-- When every training item of the caller's live attempt's revision is complete,
-- the training check is done (checked_by = system). Answers what happened.
create or replace function public._cert_training_rollup(p_email text, p_cert uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	t public.cert_attempts%rowtype;
	v_pkg jsonb;
	v_missing integer;
	v_note jsonb;
begin
	select * into t from public.cert_attempts
	where certification_id = p_cert and email = p_email and state in ('active', 'dormant')
	order by started_at desc limit 1;
	if not found then
		return jsonb_build_object('training_done', false, 'notify', '[]'::jsonb);
	end if;
	perform public._cert_touch(t.id);
	if not exists (select 1 from public.cert_checks k where k.attempt_id = t.id and k.part = 'training' and k.state = 'pending') then
		return jsonb_build_object('training_done', true, 'notify', '[]'::jsonb);
	end if;
	select package into v_pkg from public.cert_revisions where id = t.revision_id;
	select count(*) into v_missing
	from jsonb_array_elements(coalesce(v_pkg -> 'training' -> 'items', '[]'::jsonb)) i
	where not exists (
		select 1 from public.cert_training_progress p
		where p.email = p_email and p.certification_id = p_cert and p.item_key = (i ->> 'key') and p.completed_at is not null
	);
	if v_missing > 0 then
		return jsonb_build_object('training_done', false, 'notify', '[]'::jsonb, 'items_left', v_missing);
	end if;
	v_note := public._cert_check_done(t.id, 'training', 'system', null);
	return jsonb_build_object('training_done', true,
		'notify', case when v_note is null then '[]'::jsonb else jsonb_build_array(v_note) end);
end;
$fn$;
revoke all on function public._cert_training_rollup(text, uuid) from public, anon, authenticated, service_role;
-- ===== PART B END =====

-- ===== PART C BEGIN =====
-- ===== PART C: THE STUDENT'S WRITES AND READS =====

-- Start: published, no live attempt, every prerequisite held. The attempt pins
-- the current revision and gets one check per part, waived where the revision
-- waives it.
create or replace function public.cert_start(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	c public.cert_certifications%rowtype;
	v_pkg jsonb;
	v_parts jsonb;
	v_missing text[];
	v_existing uuid;
	v_id uuid;
	v_part text;
begin
	select * into c from public.cert_certifications where code = upper(btrim(coalesce(p_code, '')));
	if not found or c.state = 'draft' then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if c.state <> 'published' then
		return public._cert_refuse('retired', 'This certification is retired and takes no new starts.');
	end if;
	select id into v_existing from public.cert_attempts
	where certification_id = c.id and email = v_me and state in ('active', 'dormant');
	if found then
		return public._cert_refuse('already_started', 'You already have an attempt on this certification.')
			|| jsonb_build_object('attempt_id', v_existing);
	end if;
	select coalesce(array_agg(q.code order by q.code), '{}'::text[]) into v_missing
	from public.cert_prerequisites pr join public.cert_certifications q on q.id = pr.requires_id
	where pr.certification_id = c.id and not public._cert_holds(v_me, q.id);
	if array_length(v_missing, 1) is not null then
		return public._cert_refuse('locked', 'This certification needs ' || array_to_string(v_missing, ', ') || ' first.')
			|| jsonb_build_object('missing', to_jsonb(v_missing));
	end if;
	select package into v_pkg from public.cert_revisions where id = c.current_revision_id;
	v_parts := coalesce(v_pkg -> 'parts', '{"guided": true, "exam": true, "autonomous": true, "checkout": true}'::jsonb);

	insert into public.cert_attempts (certification_id, revision_id, email)
	values (c.id, c.current_revision_id, v_me)
	returning id into v_id;
	insert into public.cert_checks (attempt_id, part, state) values (v_id, 'training', 'pending');
	foreach v_part in array array['guided', 'exam', 'autonomous', 'checkout'] loop
		insert into public.cert_checks (attempt_id, part, state, checked_at)
		values (v_id, v_part,
			case when (v_parts -> v_part) = 'true'::jsonb then 'pending' else 'waived' end,
			case when (v_parts -> v_part) = 'true'::jsonb then null else now() end);
	end loop;
	perform public._cert_event('attempt.started', v_me, v_me, c.id, v_id, jsonb_build_object('code', c.code, 'revision_id', c.current_revision_id), null);
	return jsonb_build_object('ok', true, 'attempt', public._cert_attempt_json(v_id));
end;
$fn$;
revoke all on function public.cert_start(text) from public, anon, authenticated, service_role;
grant execute on function public.cert_start(text) to authenticated;

create or replace function public.cert_withdraw(p_attempt uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	t public.cert_attempts%rowtype;
begin
	select * into t from public.cert_attempts where id = p_attempt and email = v_me for update;
	if not found then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if t.state not in ('active', 'dormant') then
		return public._cert_refuse('not_active', 'This attempt is already ' || t.state || '.');
	end if;
	update public.cert_attempts set state = 'withdrawn', withdrawn_at = now(), last_activity_at = now() where id = t.id;
	update public.cert_seats set state = 'cancelled', decided_at = now(), decided_by = v_me
	where attempt_id = t.id and state in ('requested', 'approved', 'booked');
	perform public._cert_event('attempt.withdrawn', v_me, v_me, t.certification_id, t.id, '{}'::jsonb, null);
	return jsonb_build_object('ok', true);
end;
$fn$;
revoke all on function public.cert_withdraw(uuid) from public, anon, authenticated, service_role;
grant execute on function public.cert_withdraw(uuid) to authenticated;

-- My certifications: every attempt, every award, the unread count.
create or replace function public.cert_me()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
begin
	return jsonb_build_object(
		'attempts', coalesce((
			select jsonb_agg(public._cert_attempt_json(t.id) order by t.started_at desc)
			from public.cert_attempts t where t.email = v_me
		), '[]'::jsonb),
		'awards', coalesce((
			select jsonb_agg(jsonb_build_object('id', a.id, 'serial', a.serial, 'code', a.code, 'name', a.name,
				'level', a.level, 'category', a.category, 'awarded_at', a.awarded_at,
				'awarded_by_name', a.awarded_by_name, 'expires_at', a.expires_at,
				'status', public._cert_award_status(a), 'revision_id', a.revision_id) order by a.awarded_at desc)
			from public.cert_awards a where a.email = v_me
		), '[]'::jsonb),
		'notifications_unread', (select count(*) from public.cert_notifications n where n.email = v_me and n.read_at is null)
	);
end;
$fn$;
revoke all on function public.cert_me() from public, anon, authenticated, service_role;
grant execute on function public.cert_me() to authenticated;

-- Hand in a project or a checkout video. The evidence is checked against the
-- revision's own list, the self-inspection must be complete, and the queue is
-- told.
create or replace function public.cert_submit(p_attempt uuid, p_part text, p_evidence jsonb, p_self_inspection jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	t public.cert_attempts%rowtype;
	c public.cert_certifications%rowtype;
	v_pkg jsonb;
	v_parts jsonb;
	v_spec jsonb;
	v_bad text[] := '{}'::text[];
	v_text text;
	v_links jsonb := '[]'::jsonb;
	v_files jsonb := '[]'::jsonb;
	v_yt text;
	v_item jsonb;
	v_kind text;
	v_self jsonb := '[]'::jsonb;
	v_id uuid;
	v_notify jsonb := '[]'::jsonb;
	v_cert_email text;
begin
	if coalesce(p_part, '') not in ('guided', 'autonomous', 'checkout') then
		raise exception 'cert_submit: part must be guided, autonomous or checkout';
	end if;
	select * into t from public.cert_attempts where id = p_attempt and email = v_me for update;
	if not found then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if t.state not in ('active', 'dormant') then
		return public._cert_refuse('not_active', 'This attempt is ' || t.state || ', so nothing can be handed in on it.');
	end if;
	perform public._cert_touch(t.id);
	select * into c from public.cert_certifications where id = t.certification_id;
	select package into v_pkg from public.cert_revisions where id = t.revision_id;
	v_parts := coalesce(v_pkg -> 'parts', '{"guided": true, "exam": true, "autonomous": true, "checkout": true}'::jsonb);
	if (v_parts -> p_part) is distinct from 'true'::jsonb then
		return public._cert_refuse('waived', 'This certification does not use a ' || lower(public._cert_part_word(p_part)) || '.');
	end if;
	if not exists (select 1 from public.cert_checks k where k.attempt_id = t.id and k.part = p_part and k.state = 'pending') then
		return public._cert_refuse('done', 'The ' || lower(public._cert_part_word(p_part)) || ' is already checked off.');
	end if;
	if not public._cert_part_unlocked(t.id, p_part) then
		return public._cert_refuse('locked', 'Finish ' || lower(public._cert_part_word(public._cert_next_part(t.id))) || ' first.');
	end if;
	if exists (select 1 from public.cert_submissions s where s.attempt_id = t.id and s.part = p_part and s.state = 'pending') then
		return public._cert_refuse('pending', 'A submission for this part is already waiting for review.');
	end if;

	-- The evidence shape.
	if not public._cert_jt(p_evidence, 'object') then
		raise exception 'cert_submit: evidence must be an object';
	end if;
	v_text := coalesce(p_evidence ->> 'text', '');
	if length(v_text) > 20000 then
		v_bad := array_append(v_bad, 'text: at most 20,000 characters');
	end if;
	if (p_evidence ? 'links') and jsonb_typeof(p_evidence -> 'links') <> 'null' then
		if not public._cert_jt(p_evidence -> 'links', 'array') then
			v_bad := array_append(v_bad, 'links: must be an array of web addresses');
		elsif jsonb_array_length(p_evidence -> 'links') > 20 then
			v_bad := array_append(v_bad, 'links: at most 20');
		else
			v_links := p_evidence -> 'links';
			if exists (select 1 from jsonb_array_elements(v_links) l where jsonb_typeof(l) <> 'string' or (l #>> '{}') !~ '^https?://\S+$') then
				v_bad := array_append(v_bad, 'links: every link starts with http:// or https://');
			end if;
		end if;
	end if;
	v_yt := nullif(public._cert_norm(p_evidence ->> 'youtube_id'), '');
	if v_yt is not null and v_yt !~ '^[A-Za-z0-9_-]{11}$' then
		v_bad := array_append(v_bad, 'youtube_id: must be the 11 character id of a YouTube video');
	end if;
	if (p_evidence ? 'files') and jsonb_typeof(p_evidence -> 'files') <> 'null' then
		if not public._cert_jt(p_evidence -> 'files', 'array') then
			v_bad := array_append(v_bad, 'files: must be an array');
		elsif jsonb_array_length(p_evidence -> 'files') > 20 then
			v_bad := array_append(v_bad, 'files: at most 20');
		else
			v_files := p_evidence -> 'files';
			for v_item in select value from jsonb_array_elements(v_files) loop
				if not public._cert_jt(v_item, 'object') or not public._cert_jt(v_item -> 'path', 'string')
					or not public._cert_jt(v_item -> 'name', 'string') or not public._cert_jt(v_item -> 'size', 'number') then
					v_bad := array_append(v_bad, 'files: every file is a path, a name and a size');
					exit;
				elsif left(v_item ->> 'path', length(t.id::text) + 1) <> (t.id::text || '/') then
					v_bad := array_append(v_bad, 'files: a file path starts with this attempt''s own id');
					exit;
				end if;
			end loop;
		end if;
	end if;
	if p_part = 'checkout' and v_yt is null then
		v_bad := array_append(v_bad, 'youtube_id: a checkout video is one unlisted YouTube link');
	end if;

	-- Every required evidence item in the revision's list is present.
	v_spec := case when p_part = 'checkout' then '{}'::jsonb else coalesce(v_pkg -> (p_part || '_project'), '{}'::jsonb) end;
	for v_item in select value from jsonb_array_elements(coalesce(v_spec -> 'evidence', '[]'::jsonb)) loop
		if (v_item -> 'required') is distinct from 'true'::jsonb then
			continue;
		end if;
		v_kind := v_item ->> 'kind';
		if (v_kind in ('photo', 'file') and jsonb_array_length(v_files) = 0)
			or (v_kind = 'text' and public._cert_norm(v_text) = '')
			or (v_kind = 'link' and jsonb_array_length(v_links) = 0)
			or (v_kind = 'youtube' and v_yt is null) then
			v_bad := array_append(v_bad, ('evidence: ' || coalesce(v_item ->> 'label', v_kind) || ' is required'));
		end if;
	end loop;

	-- Every self-inspection item is checked.
	if p_self_inspection is not null and jsonb_typeof(p_self_inspection) <> 'null' then
		if not public._cert_jt(p_self_inspection, 'array') then
			raise exception 'cert_submit: self_inspection must be an array';
		end if;
		v_self := p_self_inspection;
	end if;
	for v_item in select value from jsonb_array_elements(coalesce(v_spec -> 'self_inspection', '[]'::jsonb)) loop
		if not exists (
			select 1 from jsonb_array_elements(v_self) s
			where jsonb_typeof(s) = 'object' and (s ->> 'item') = (v_item #>> '{}') and (s -> 'checked') = 'true'::jsonb
		) then
			v_bad := array_append(v_bad, ('self_inspection: not checked: ' || (v_item #>> '{}')));
		end if;
	end loop;

	if array_length(v_bad, 1) is not null then
		return public._cert_refuse('invalid', 'The submission is not complete.') || jsonb_build_object('problems', to_jsonb(v_bad));
	end if;

	insert into public.cert_submissions (attempt_id, part, evidence, self_inspection)
	values (t.id, p_part, jsonb_build_object('text', v_text, 'links', v_links, 'youtube_id', v_yt, 'files', v_files), v_self)
	returning id into v_id;
	perform public._cert_event('submission.sent', v_me, v_me, t.certification_id, t.id,
		jsonb_build_object('submission_id', v_id, 'part', p_part), null);

	foreach v_cert_email in array public._cert_certifier_emails(t.certification_id) loop
		if v_cert_email <> v_me then
			v_notify := v_notify || public._cert_notify(v_cert_email, 'queue_submission',
				'New ' || lower(public._cert_part_word(p_part)) || ' to review: ' || c.code,
				coalesce(public._cert_person_name(v_me), 'A student') || ' handed in the ' || lower(public._cert_part_word(p_part))
					|| ' for ' || c.name || '.',
				'/certifications/desk/review/' || v_id,
				jsonb_build_object('submission_id', v_id, 'attempt_id', t.id, 'part', p_part, 'code', c.code));
		end if;
	end loop;
	return jsonb_build_object('ok', true, 'submission_id', v_id, 'notify', v_notify);
end;
$fn$;
revoke all on function public.cert_submit(uuid, text, jsonb, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.cert_submit(uuid, text, jsonb, jsonb) to authenticated;

-- Pass or fail a submission. A certifier of its certification who is NOT the
-- student; a fail needs written feedback; a pass checks the part off.
create or replace function public.cert_review(p_submission uuid, p_decision text, p_feedback text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	s public.cert_submissions%rowtype;
	t public.cert_attempts%rowtype;
	c public.cert_certifications%rowtype;
	v_feedback text := public._cert_norm(p_feedback);
	v_notify jsonb := '[]'::jsonb;
	v_note jsonb;
begin
	if coalesce(p_decision, '') not in ('pass', 'fail') then
		raise exception 'cert_review: decision must be pass or fail';
	end if;
	select * into s from public.cert_submissions where id = p_submission for update;
	if not found then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	select * into t from public.cert_attempts where id = s.attempt_id;
	if not public._cert_can_certify(t.certification_id) then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	-- Nobody acts on their own record (Mr. Pina's rule).
	if t.email = v_me then
		return public._cert_refuse('self', 'You cannot review your own attempt.');
	end if;
	if s.state <> 'pending' then
		return public._cert_refuse('decided', 'This submission was already ' || s.state || '.');
	end if;
	if p_decision = 'fail' and v_feedback = '' then
		return public._cert_refuse('feedback_required', 'A fail needs written feedback so the next attempt is better.');
	end if;
	select * into c from public.cert_certifications where id = t.certification_id;

	insert into public.cert_reviews (submission_id, reviewer_email, decision, feedback)
	values (s.id, v_me, p_decision, v_feedback);
	update public.cert_submissions set state = case when p_decision = 'pass' then 'passed' else 'failed' end, decided_at = now()
	where id = s.id;
	perform public._cert_touch(t.id);
	perform public._cert_event('review.decided', v_me, t.email, t.certification_id, t.id,
		jsonb_build_object('submission_id', s.id, 'part', s.part, 'decision', p_decision), nullif(v_feedback, ''));

	v_notify := v_notify || public._cert_notify(t.email, 'review_returned',
		public._cert_part_word(s.part) || ': ' || case when p_decision = 'pass' then 'passed' else 'not yet' end,
		case when p_decision = 'pass'
			then 'Your ' || lower(public._cert_part_word(s.part)) || ' for ' || c.name || ' passed.'
				|| case when v_feedback = '' then '' else ' Feedback: ' || v_feedback end
			else 'Your ' || lower(public._cert_part_word(s.part)) || ' for ' || c.name
				|| ' was returned. Read the feedback, revise, and hand it in again; there is no waiting period. Feedback: ' || v_feedback
		end,
		'/certifications/' || c.code,
		jsonb_build_object('submission_id', s.id, 'attempt_id', t.id, 'part', s.part, 'decision', p_decision, 'code', c.code));
	if p_decision = 'pass' then
		v_note := public._cert_check_done(t.id, s.part, v_me, null);
		if v_note is not null then
			v_notify := v_notify || v_note;
		end if;
	end if;
	return jsonb_build_object('ok', true, 'notify', v_notify);
end;
$fn$;
revoke all on function public.cert_review(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.cert_review(uuid, text, text) to authenticated;

-- A checkout watched in the room: the submission and its review in one
-- statement, with the same effects as cert_review.
create or replace function public.cert_checkout_in_person(p_attempt uuid, p_decision text, p_feedback text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	t public.cert_attempts%rowtype;
	c public.cert_certifications%rowtype;
	v_pkg jsonb;
	v_feedback text := public._cert_norm(p_feedback);
	v_id uuid;
	v_notify jsonb := '[]'::jsonb;
	v_note jsonb;
begin
	if coalesce(p_decision, '') not in ('pass', 'fail') then
		raise exception 'cert_checkout_in_person: decision must be pass or fail';
	end if;
	select * into t from public.cert_attempts where id = p_attempt for update;
	if not found or not public._cert_can_certify(t.certification_id) then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if t.email = v_me then
		return public._cert_refuse('self', 'You cannot check out your own attempt.');
	end if;
	if t.state not in ('active', 'dormant') then
		return public._cert_refuse('not_active', 'This attempt is ' || t.state || '.');
	end if;
	select package into v_pkg from public.cert_revisions where id = t.revision_id;
	if (coalesce(v_pkg -> 'parts', '{}'::jsonb) -> 'checkout') is distinct from 'true'::jsonb then
		return public._cert_refuse('waived', 'This certification does not use a checkout.');
	end if;
	if not exists (select 1 from public.cert_checks k where k.attempt_id = t.id and k.part = 'checkout' and k.state = 'pending') then
		return public._cert_refuse('done', 'The checkout is already checked off.');
	end if;
	if not public._cert_part_unlocked(t.id, 'checkout') then
		return public._cert_refuse('locked', 'The student still has ' || lower(public._cert_part_word(public._cert_next_part(t.id))) || ' to finish first.');
	end if;
	if p_decision = 'fail' and v_feedback = '' then
		return public._cert_refuse('feedback_required', 'A fail needs written feedback so the next attempt is better.');
	end if;
	if exists (select 1 from public.cert_submissions s where s.attempt_id = t.id and s.part = 'checkout' and s.state = 'pending') then
		return public._cert_refuse('pending', 'A checkout video from this student is still waiting for review. Decide that first.');
	end if;
	select * into c from public.cert_certifications where id = t.certification_id;

	insert into public.cert_submissions (attempt_id, part, evidence, self_inspection, in_person, state, decided_at)
	values (t.id, 'checkout', jsonb_build_object('text', '', 'links', '[]'::jsonb, 'youtube_id', null, 'files', '[]'::jsonb),
		'[]'::jsonb, true, case when p_decision = 'pass' then 'passed' else 'failed' end, now())
	returning id into v_id;
	insert into public.cert_reviews (submission_id, reviewer_email, decision, feedback)
	values (v_id, v_me, p_decision, v_feedback);
	perform public._cert_touch(t.id);
	perform public._cert_event('review.decided', v_me, t.email, t.certification_id, t.id,
		jsonb_build_object('submission_id', v_id, 'part', 'checkout', 'decision', p_decision, 'in_person', true), nullif(v_feedback, ''));
	v_notify := v_notify || public._cert_notify(t.email, 'review_returned',
		'Checkout: ' || case when p_decision = 'pass' then 'passed' else 'not yet' end,
		case when p_decision = 'pass'
			then 'Your in-person checkout for ' || c.name || ' passed.'
				|| case when v_feedback = '' then '' else ' Feedback: ' || v_feedback end
			else 'Your in-person checkout for ' || c.name || ' did not pass yet. Feedback: ' || v_feedback
		end,
		'/certifications/' || c.code,
		jsonb_build_object('submission_id', v_id, 'attempt_id', t.id, 'part', 'checkout', 'decision', p_decision, 'code', c.code));
	if p_decision = 'pass' then
		v_note := public._cert_check_done(t.id, 'checkout', v_me, null);
		if v_note is not null then
			v_notify := v_notify || v_note;
		end if;
	end if;
	return jsonb_build_object('ok', true, 'submission_id', v_id, 'notify', v_notify);
end;
$fn$;
revoke all on function public.cert_checkout_in_person(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.cert_checkout_in_person(uuid, text, text) to authenticated;

-- The watch floor. A rate above 2x or a duration of zero records nothing;
-- ranges are clamped and merged here; a video counts at 95% (Mr. Pina's two
-- rules, written as literals on purpose); completed_at is never cleared.
create or replace function public.cert_watch_report(
	p_cert uuid, p_item_key text, p_duration numeric, p_ranges jsonb,
	p_max_rate numeric, p_checkins_missed integer, p_played_seconds numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	v_rev uuid;
	v_pkg jsonb;
	v_item jsonb;
	p public.cert_training_progress%rowtype;
	v_merged jsonb;
	v_covered numeric := 0;
	v_coverage numeric;
	v_complete boolean;
	v_roll jsonb;
begin
	if p_max_rate is not null and p_max_rate > 2.0 then
		return public._cert_refuse('rate', 'Playback above 2x does not count.');
	end if;
	if p_duration is null or p_duration <= 0 then
		return public._cert_refuse('duration', 'The player reported no duration, so nothing was recorded.');
	end if;
	v_rev := public._cert_training_revision(v_me, p_cert);
	if v_rev is null then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	select package into v_pkg from public.cert_revisions where id = v_rev;
	select i into v_item from jsonb_array_elements(coalesce(v_pkg -> 'training' -> 'items', '[]'::jsonb)) i
	where (i ->> 'key') = p_item_key and (i ->> 'kind') = 'video';
	if v_item is null then
		return public._cert_refuse('not_found', 'Not found.');
	end if;

	select * into p from public.cert_training_progress
	where email = v_me and certification_id = p_cert and item_key = p_item_key for update;
	v_merged := public._cert_merge_ranges(coalesce(p.ranges, '[]'::jsonb) || coalesce(p_ranges, '[]'::jsonb), p_duration);
	select coalesce(sum((e -> 1 #>> '{}')::numeric - (e -> 0 #>> '{}')::numeric), 0) into v_covered
	from jsonb_array_elements(v_merged) e;
	v_coverage := round(v_covered / p_duration, 4);
	-- Mr. Pina's rule: a video counts once its played seconds cover 95% of it.
	v_complete := v_coverage >= 0.95;

	insert into public.cert_training_progress (email, certification_id, item_key, item_kind, duration_seconds, ranges, covered_seconds, completed_at, updated_at)
	values (v_me, p_cert, p_item_key, 'video', p_duration, v_merged, v_covered, case when v_complete then now() end, now())
	on conflict (email, certification_id, item_key) do update
		set duration_seconds = excluded.duration_seconds, ranges = excluded.ranges, covered_seconds = excluded.covered_seconds,
			completed_at = coalesce(public.cert_training_progress.completed_at, excluded.completed_at), updated_at = now();
	insert into public.cert_watch_sessions (email, certification_id, item_key, played_seconds, max_rate, checkins_missed, coverage)
	values (v_me, p_cert, p_item_key, p_played_seconds, p_max_rate, p_checkins_missed, v_coverage);
	perform public._cert_event('watch.session', v_me, v_me, p_cert, null,
		jsonb_build_object('item_key', p_item_key, 'played_seconds', p_played_seconds, 'max_rate', p_max_rate,
			'checkins_missed', p_checkins_missed, 'coverage', v_coverage), null);

	v_roll := public._cert_training_rollup(v_me, p_cert);
	return jsonb_build_object('ok', true, 'covered_seconds', v_covered, 'coverage', v_coverage,
		'complete', v_complete or p.completed_at is not null,
		'training_done', v_roll -> 'training_done', 'notify', v_roll -> 'notify');
end;
$fn$;
revoke all on function public.cert_watch_report(uuid, text, numeric, jsonb, numeric, integer, numeric) from public, anon, authenticated, service_role;
grant execute on function public.cert_watch_report(uuid, text, numeric, jsonb, numeric, integer, numeric) to authenticated;

create or replace function public.cert_lesson_complete(p_cert uuid, p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	v_rev uuid;
	v_pkg jsonb;
	v_key text := 'lesson:' || lower(public._cert_norm(p_slug));
	v_roll jsonb;
begin
	v_rev := public._cert_training_revision(v_me, p_cert);
	if v_rev is null then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	select package into v_pkg from public.cert_revisions where id = v_rev;
	if not exists (
		select 1 from jsonb_array_elements(coalesce(v_pkg -> 'training' -> 'items', '[]'::jsonb)) i
		where (i ->> 'key') = v_key and (i ->> 'kind') = 'lesson'
	) then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	insert into public.cert_training_progress (email, certification_id, item_key, item_kind, covered_seconds, completed_at, updated_at)
	values (v_me, p_cert, v_key, 'lesson', 1, now(), now())
	on conflict (email, certification_id, item_key) do update
		set completed_at = coalesce(public.cert_training_progress.completed_at, now()), covered_seconds = 1, updated_at = now();
	v_roll := public._cert_training_rollup(v_me, p_cert);
	return jsonb_build_object('ok', true, 'complete', true,
		'training_done', v_roll -> 'training_done', 'notify', v_roll -> 'notify');
end;
$fn$;
revoke all on function public.cert_lesson_complete(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.cert_lesson_complete(uuid, text) to authenticated;

create or replace function public.cert_practice_record(p_cert uuid, p_kind text, p_item_id text, p_correct boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
begin
	if coalesce(p_kind, '') not in ('quick', 'practice') then
		raise exception 'cert_practice_record: kind must be quick or practice';
	end if;
	if public._cert_norm(p_item_id) = '' or p_correct is null then
		raise exception 'cert_practice_record: item_id and correct are required';
	end if;
	if not exists (select 1 from public.cert_certifications where id = p_cert) then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	insert into public.cert_practice_results (email, certification_id, kind, item_id, correct)
	values (v_me, p_cert, p_kind, public._cert_norm(p_item_id), p_correct);
	return jsonb_build_object('ok', true);
end;
$fn$;
revoke all on function public.cert_practice_record(uuid, text, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.cert_practice_record(uuid, text, text, boolean) to authenticated;
-- ===== PART C END =====

-- ===== PART D BEGIN =====
-- ===== PART D: THE CERTIFIER'S READS =====

-- Any student's every certification and every part, for the certifications
-- the caller certifies. A non-certifier gets not found.
create or replace function public.cert_student_view(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_email text := lower(public._cert_norm(p_email));
	v_admin boolean;
begin
	perform public._cert_caller();
	if not public._cert_is_certifier() then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	v_admin := public.is_admin();
	return jsonb_build_object(
		'email', v_email,
		'name', public._cert_person_name(v_email),
		'attempts', coalesce((
			select jsonb_agg(public._cert_attempt_json(t.id) order by t.started_at desc)
			from public.cert_attempts t
			where t.email = v_email and (v_admin or public._cert_can_certify(t.certification_id))
		), '[]'::jsonb),
		'awards', coalesce((
			select jsonb_agg(jsonb_build_object('id', a.id, 'serial', a.serial, 'code', a.code, 'name', a.name,
				'level', a.level, 'category', a.category, 'awarded_at', a.awarded_at,
				'awarded_by_name', a.awarded_by_name, 'expires_at', a.expires_at,
				'status', public._cert_award_status(a), 'revision_id', a.revision_id) order by a.awarded_at desc)
			from public.cert_awards a
			where a.email = v_email and (v_admin or public._cert_can_certify(a.certification_id))
		), '[]'::jsonb)
	);
end;
$fn$;
revoke all on function public.cert_student_view(text) from public, anon, authenticated, service_role;
grant execute on function public.cert_student_view(text) to authenticated;

-- The desk: the review queue oldest first, pending sitting requests, today's
-- exams and the tiles, all scoped to the caller's certifications.
create or replace function public.cert_desk()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	v_admin boolean;
	v_scope uuid[];
begin
	if not public._cert_is_certifier() then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	v_admin := public.is_admin();
	select coalesce(array_agg(c.id), '{}'::uuid[]) into v_scope from public.cert_certifications c
	where v_admin or exists (select 1 from public.cert_authority a where a.certification_id = c.id and a.email = v_me and a.revoked_at is null);

	return jsonb_build_object(
		'queue', coalesce((
			select jsonb_agg(jsonb_build_object('submission_id', s.id, 'attempt_id', t.id, 'part', s.part,
				'in_person', s.in_person, 'submitted_at', s.submitted_at,
				'waited_seconds', floor(extract(epoch from (now() - s.submitted_at)))::bigint,
				'student', jsonb_build_object('email', t.email, 'name', public._cert_person_name(t.email)),
				'certification', jsonb_build_object('id', c.id, 'code', c.code, 'name', c.name)) order by s.submitted_at)
			from public.cert_submissions s
			join public.cert_attempts t on t.id = s.attempt_id
			join public.cert_certifications c on c.id = t.certification_id
			where s.state = 'pending' and c.id = any (v_scope)
		), '[]'::jsonb),
		'requests', coalesce((
			select jsonb_agg(jsonb_build_object('seat_id', x.id, 'attempt_id', x.attempt_id, 'requested_at', x.requested_at,
				'note', x.note,
				'student', jsonb_build_object('email', x.email, 'name', public._cert_person_name(x.email)),
				'certification', jsonb_build_object('id', c.id, 'code', c.code, 'name', c.name)) order by x.requested_at)
			from public.cert_seats x
			join public.cert_certifications c on c.id = x.certification_id
			where x.state = 'requested' and c.id = any (v_scope)
		), '[]'::jsonb),
		'exams_today', (
			select count(*) from public.cert_exam_attempts e
			where e.certification_id = any (v_scope)
				and (e.released_at at time zone 'America/Los_Angeles')::date = (now() at time zone 'America/Los_Angeles')::date
		),
		'tiles', jsonb_build_object(
			'active_attempts', (select count(*) from public.cert_attempts t where t.state = 'active' and t.certification_id = any (v_scope)),
			'dormant_attempts', (select count(*) from public.cert_attempts t where t.state = 'dormant' and t.certification_id = any (v_scope)),
			'pending_reviews', (select count(*) from public.cert_submissions s join public.cert_attempts t on t.id = s.attempt_id
				where s.state = 'pending' and t.certification_id = any (v_scope)),
			'oldest_wait_seconds', (select coalesce(floor(extract(epoch from (now() - min(s.submitted_at))))::bigint, 0)
				from public.cert_submissions s join public.cert_attempts t on t.id = s.attempt_id
				where s.state = 'pending' and t.certification_id = any (v_scope)),
			'awards_total', (select count(*) from public.cert_awards a where a.certification_id = any (v_scope)),
			'awards_30d', (select count(*) from public.cert_awards a where a.certification_id = any (v_scope) and a.awarded_at > now() - interval '30 days')
		)
	);
end;
$fn$;
revoke all on function public.cert_desk() from public, anon, authenticated, service_role;
grant execute on function public.cert_desk() to authenticated;
-- ===== PART D END =====

-- ===== PART E BEGIN =====
-- ===== PART E: THE EVIDENCE BUCKET, GUARDED =====
-- Private, 45 MiB a file (47185920, the portal ceiling public.portal_upload_max_bytes()
-- states; the literal is written out because tests/upload-limits.test.ts
-- reads every storage.buckets literal). Objects are keyed attempt_id/uuid.ext;
-- the INSERT policy admits the attempt's owner while the attempt is live and
-- the SELECT policy admits the owner or a certifier. No update, no delete, no
-- anon policy. Where the applying role cannot write storage, this NOTICEs and
-- the rest of the file still lands (0233's shape).
do $$
begin
	begin
		insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
		values ('cert-evidence', 'cert-evidence', false, 47185920, null)
		on conflict (id) do update
			set public = false, file_size_limit = 47185920, allowed_mime_types = null;

		drop policy if exists "cert evidence insert by owner" on storage.objects;
		create policy "cert evidence insert by owner"
			on storage.objects
			for insert
			to authenticated
			with check (
				bucket_id = 'cert-evidence'
				and public.cert_can_write_evidence_object(name)
			);

		drop policy if exists "cert evidence readable by owner or certifier" on storage.objects;
		create policy "cert evidence readable by owner or certifier"
			on storage.objects
			for select
			to authenticated
			using (
				bucket_id = 'cert-evidence'
				and public.cert_can_read_evidence_object(name)
			);
	exception when insufficient_privilege then
		raise notice '0261 cert attempts: the storage half was NOT applied (this role cannot write storage.buckets or storage.objects policies). Re-paste 0261 in the SQL editor to finish it; evidence uploads are refused until then.';
	end;
end;
$$;
-- ===== PART E END =====

-- ===== PART Z BEGIN =====
-- ===== SELF-CHECK (kept last) =====
do $z$
declare
	v_fn text;
	v_tbl text;
	v_bad text[] := '{}'::text[];
	v_oid oid;
begin
	foreach v_fn in array array[
		'cert_can_write_evidence_object(text)',
		'cert_can_read_evidence_object(text)',
		'cert_start(text)',
		'cert_withdraw(uuid)',
		'cert_me()',
		'cert_submit(uuid, text, jsonb, jsonb)',
		'cert_review(uuid, text, text)',
		'cert_checkout_in_person(uuid, text, text)',
		'cert_watch_report(uuid, text, numeric, jsonb, numeric, integer, numeric)',
		'cert_lesson_complete(uuid, text)',
		'cert_practice_record(uuid, text, text, boolean)',
		'cert_student_view(text)',
		'cert_desk()'
	] loop
		v_oid := to_regprocedure('public.' || v_fn);
		if v_oid is null then
			v_bad := array_append(v_bad, (v_fn || ' is missing'));
		else
			if has_function_privilege('anon', v_oid, 'execute') then
				v_bad := array_append(v_bad, (v_fn || ' is executable by anon'));
			end if;
			if not has_function_privilege('authenticated', v_oid, 'execute') then
				v_bad := array_append(v_bad, (v_fn || ' is not executable by authenticated'));
			end if;
		end if;
	end loop;

	foreach v_fn in array array[
		'_cert_attempt_owner(uuid)',
		'_cert_can_read_evidence(uuid)',
		'_cert_storage_prefix_uuid(text)',
		'_cert_touch(uuid)',
		'_cert_holds(text, uuid)',
		'_cert_next_part(uuid)',
		'_cert_part_unlocked(uuid, text)',
		'_cert_part_word(text)',
		'_cert_certifier_emails(uuid)',
		'_cert_training_revision(text, uuid)',
		'_cert_merge_ranges(jsonb, numeric)',
		'_cert_attempt_json(uuid)',
		'_cert_check_done(uuid, text, text, text)',
		'_cert_training_rollup(text, uuid)'
	] loop
		v_oid := to_regprocedure('public.' || v_fn);
		if v_oid is null then
			v_bad := array_append(v_bad, (v_fn || ' is missing'));
		elsif has_function_privilege('anon', v_oid, 'execute')
			or has_function_privilege('authenticated', v_oid, 'execute')
			or has_function_privilege('service_role', v_oid, 'execute') then
			v_bad := array_append(v_bad, (v_fn || ' is executable by a client'));
		end if;
	end loop;

	foreach v_tbl in array array[
		'cert_attempts', 'cert_checks', 'cert_submissions', 'cert_reviews',
		'cert_training_progress', 'cert_watch_sessions', 'cert_practice_results'
	] loop
		if not exists (
			select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
			where n.nspname = 'public' and c.relname = v_tbl and c.relrowsecurity
		) then
			v_bad := array_append(v_bad, (v_tbl || ' has no row level security'));
		end if;
		if has_table_privilege('anon', 'public.' || v_tbl, 'select,insert,update,delete,truncate,references,trigger')
			or has_table_privilege('authenticated', 'public.' || v_tbl, 'select,insert,update,delete,truncate,references,trigger') then
			v_bad := array_append(v_bad, (v_tbl || ' carries a client grant'));
		end if;
		if exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = v_tbl) then
			v_bad := array_append(v_bad, (v_tbl || ' carries a policy'));
		end if;
	end loop;
	foreach v_tbl in array array['cert_watch_sessions_id_seq', 'cert_practice_results_id_seq'] loop
		if has_sequence_privilege('anon', 'public.' || v_tbl, 'usage,select,update')
			or has_sequence_privilege('authenticated', 'public.' || v_tbl, 'usage,select,update') then
			v_bad := array_append(v_bad, (v_tbl || ' carries a client grant'));
		end if;
	end loop;

	-- The storage half, where it landed: private, at the portal ceiling, no
	-- anon policy.
	if exists (select 1 from storage.buckets b where b.id = 'cert-evidence') then
		if not exists (select 1 from storage.buckets b where b.id = 'cert-evidence' and b.public = false and b.file_size_limit = 47185920) then
			v_bad := array_append(v_bad, 'the cert-evidence bucket is not private at the portal ceiling');
		end if;
		if exists (
			select 1 from pg_catalog.pg_policies pol
			where pol.schemaname = 'storage' and pol.tablename = 'objects'
				and (coalesce(pol.qual, '') || coalesce(pol.with_check, '')) like '%cert-evidence%'
				and (pol.roles && array['anon', 'public']::name[])
		) then
			v_bad := array_append(v_bad, 'a policy on the cert-evidence bucket names anon or public');
		end if;
	end if;

	-- The merge is the one implementation of coverage; two planted readings.
	if public._cert_merge_ranges('[[0, 10], [5, 20], [30, 40], [-5, 3], [50, 45]]'::jsonb, 35) <> '[[0, 20], [30, 35]]'::jsonb then
		v_bad := array_append(v_bad, 'the range merge did not clamp and merge as expected');
	end if;
	if public._cert_part_unlocked('00000000-0000-0000-0000-000000000000', 'training') is distinct from true then
		v_bad := array_append(v_bad, 'training is not unlocked on an attempt with no checks');
	end if;

	if array_length(v_bad, 1) is not null then
		raise exception '0261 self-check refused: %', array_to_string(v_bad, '; ');
	end if;
	raise notice '0261 cert attempts: 7 tables with RLS on and no client grant, 13 client functions closed to anon, 14 private helpers closed to every client, evidence bucket %.',
		case when exists (select 1 from storage.buckets b where b.id = 'cert-evidence') then 'in place' else 'NOT applied (see the notice above)' end;
end $z$;
-- ===== PART Z END =====
