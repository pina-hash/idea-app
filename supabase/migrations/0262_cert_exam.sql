-- 0262_cert_exam.sql
--
-- IDEA CERTIFICATION PORTAL, PART THREE OF FIVE (ledger 0391): THE EXAM.
-- docs/certifications/DATA_MODEL.md section 0262. Sitting windows, seats
-- (requests and bookings), and the exam attempts themselves: a release by the
-- proctor, a server-side draw, one question at a time, focus flags, scoring
-- on submission, the 7-day cooldown.
--
-- WHAT IT CREATES, all new and all cert_-prefixed:
--   tables     cert_sittings, cert_seats, cert_exam_attempts
--   helpers    _cert_cooldown_until, _cert_exam_draw, _cert_exam_score_one,
--              _cert_exam_question_json, _cert_exam_result_json,
--              _cert_exam_finish
--   client     cert_sitting_post, cert_sitting_cancel, cert_sittings,
--              cert_seat_request, cert_seat_decide, cert_seat_cancel,
--              cert_exam_release, cert_exam_open, cert_exam_answer,
--              cert_exam_flag, cert_exam_submit, cert_exam_end,
--              cert_exam_live, cert_exam_result
--
-- THE BROWSER NEVER HOLDS THE ANSWER KEY. The draw is stored server-side as
-- question ids; _cert_exam_question_json is the one projection a student's
-- browser receives and it never carries the answer or the explanation; scoring
-- runs in _cert_exam_finish on the stored key; a failed student is told the
-- TOPICS they missed and never which questions. Even cert_exam_result, the
-- certifier's full view, returns the student's answer and correct or not,
-- never the key text (the pool editor in 0260 is where an admin reads keys).
--
-- THE RULES MR. PINA SET ARE LITERALS HERE ON PURPOSE: the 7-day cooldown
-- after a failed exam (_cert_cooldown_until) and 100% to pass
-- (_cert_exam_finish). The release window comes from cert_settings.
--
-- NOBODY ACTS ON THEIR OWN RECORD: cert_seat_decide, cert_exam_release,
-- cert_exam_end and cert_exam_result refuse a certifier whose address is the
-- attempt's.
--
-- LATE-BOUND like the two files before it: the notifications go through
-- _cert_notify (0263). ADDITIVE AND IDEMPOTENT; every table RLS on, no policy,
-- no client grant; every function revokes from public, anon, authenticated and
-- service_role by name and grants back only authenticated. DEPLOY ORDER: none.
--
-- UNDO, for a person's paste:
--   drop function if exists public.cert_exam_result(uuid);
--   drop function if exists public.cert_exam_live(uuid);
--   drop function if exists public.cert_exam_end(uuid, text);
--   drop function if exists public.cert_exam_submit(uuid);
--   drop function if exists public.cert_exam_flag(uuid, text);
--   drop function if exists public.cert_exam_answer(uuid, integer, jsonb);
--   drop function if exists public.cert_exam_open(uuid);
--   drop function if exists public.cert_exam_release(uuid);
--   drop function if exists public.cert_seat_cancel(uuid);
--   drop function if exists public.cert_seat_decide(uuid, text, timestamptz, text);
--   drop function if exists public.cert_seat_request(uuid, uuid, text);
--   drop function if exists public.cert_sittings();
--   drop function if exists public.cert_sitting_cancel(uuid);
--   drop function if exists public.cert_sitting_post(jsonb);
--   drop function if exists public._cert_exam_finish(uuid, text, text);
--   drop function if exists public._cert_exam_result_json(uuid);
--   drop function if exists public._cert_exam_question_json(uuid, integer);
--   drop function if exists public._cert_exam_score_one(text, jsonb, jsonb, jsonb);
--   drop function if exists public._cert_exam_draw(uuid, uuid);
--   drop function if exists public._cert_cooldown_until(uuid);
--   drop table if exists public.cert_exam_attempts;
--   drop table if exists public.cert_seats;
--   drop table if exists public.cert_sittings;

-- ===== PART A BEGIN =====
-- ===== PART A: TABLES =====

create table if not exists public.cert_sittings (
	id uuid primary key default gen_random_uuid(),
	series_id uuid,
	certification_id uuid references public.cert_certifications (id) on delete set null,
	starts_at timestamptz not null,
	ends_at timestamptz not null,
	seat_limit integer not null check (seat_limit between 1 and 200),
	location text,
	note text,
	state text not null default 'open' check (state in ('open', 'closed', 'cancelled')),
	created_by text,
	created_at timestamptz not null default now(),
	check (ends_at > starts_at)
);
create index if not exists cert_sittings_starts_idx on public.cert_sittings (starts_at);
alter table public.cert_sittings enable row level security;
revoke all on table public.cert_sittings from public, anon, authenticated;

create table if not exists public.cert_seats (
	id uuid primary key default gen_random_uuid(),
	attempt_id uuid not null references public.cert_attempts (id) on delete cascade,
	certification_id uuid not null references public.cert_certifications (id),
	email text not null,
	sitting_id uuid references public.cert_sittings (id) on delete set null,
	state text not null check (state in ('requested', 'approved', 'declined', 'booked', 'cancelled', 'used')),
	requested_at timestamptz not null default now(),
	note text,
	decided_by text,
	decided_at timestamptz,
	scheduled_at timestamptz,
	decision_note text
);
create unique index if not exists cert_seats_one_open_idx
	on public.cert_seats (attempt_id) where state in ('requested', 'approved', 'booked');
create index if not exists cert_seats_sitting_idx on public.cert_seats (sitting_id, state);
alter table public.cert_seats enable row level security;
revoke all on table public.cert_seats from public, anon, authenticated;

create table if not exists public.cert_exam_attempts (
	id uuid primary key default gen_random_uuid(),
	attempt_id uuid not null references public.cert_attempts (id) on delete cascade,
	seat_id uuid references public.cert_seats (id) on delete set null,
	certification_id uuid not null references public.cert_certifications (id),
	revision_id uuid not null references public.cert_revisions (id),
	email text not null,
	proctor_email text not null,
	state text not null default 'released' check (state in ('released', 'in_progress', 'submitted', 'expired')),
	released_at timestamptz not null default now(),
	release_expires_at timestamptz not null,
	started_at timestamptz,
	deadline timestamptz,
	submitted_at timestamptz,
	time_limit_minutes integer not null,
	draw jsonb not null,
	answers jsonb not null default '[]'::jsonb,
	current_index integer not null default 0,
	flags jsonb not null default '[]'::jsonb,
	score jsonb,
	passed boolean
);
create index if not exists cert_exam_attempts_attempt_idx on public.cert_exam_attempts (attempt_id, released_at desc);
create index if not exists cert_exam_attempts_cert_released_idx on public.cert_exam_attempts (certification_id, released_at desc);
alter table public.cert_exam_attempts enable row level security;
revoke all on table public.cert_exam_attempts from public, anon, authenticated;
-- ===== PART A END =====

-- ===== PART B BEGIN =====
-- ===== PART B: HELPERS =====

-- The last submitted exam: failed means a 7-day cooldown from its submission
-- (Mr. Pina's rule, a literal on purpose); passed or none means null.
create or replace function public._cert_cooldown_until(p_attempt uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $fn$
	select case when e.passed then null else e.submitted_at + interval '7 days' end
	from public.cert_exam_attempts e
	where e.attempt_id = p_attempt and e.state = 'submitted'
	order by e.submitted_at desc
	limit 1;
$fn$;
revoke all on function public._cert_cooldown_until(uuid) from public, anon, authenticated, service_role;

-- A fresh random draw: each topic's minimum first, then a random fill from
-- the rest of the active pool up to questions_per_exam, then shuffled, each
-- choice question with its own shuffled option order. RAISES when the pool
-- cannot cover the exam.
create or replace function public._cert_exam_draw(p_cert uuid, p_revision uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_exam jsonb;
	v_per integer;
	v_topic jsonb;
	v_min integer;
	v_ids uuid[];
	v_picked uuid[] := '{}'::uuid[];
	v_topic_ids text[];
	v_draw jsonb;
begin
	select package -> 'exam' into v_exam from public.cert_revisions where id = p_revision;
	if v_exam is null or jsonb_typeof(v_exam) <> 'object' then
		raise exception 'cert: pool cannot cover the exam';
	end if;
	v_per := coalesce((v_exam ->> 'questions_per_exam')::integer, 0);
	if v_per < 1 then
		raise exception 'cert: pool cannot cover the exam';
	end if;
	select coalesce(array_agg(t ->> 'id'), '{}'::text[]) into v_topic_ids
	from jsonb_array_elements(coalesce(v_exam -> 'topics', '[]'::jsonb)) t;

	for v_topic in select value from jsonb_array_elements(coalesce(v_exam -> 'topics', '[]'::jsonb)) loop
		v_min := coalesce((v_topic ->> 'minimum')::integer, 0);
		if v_min <= 0 then
			continue;
		end if;
		select coalesce(array_agg(s.id), '{}'::uuid[]) into v_ids from (
			select q.id from public.cert_exam_questions q
			where q.certification_id = p_cert and q.active and q.topic = (v_topic ->> 'id')
			order by random() limit v_min
		) s;
		if coalesce(array_length(v_ids, 1), 0) < v_min then
			raise exception 'cert: pool cannot cover the exam';
		end if;
		v_picked := v_picked || v_ids;
	end loop;

	if coalesce(array_length(v_picked, 1), 0) < v_per then
		select coalesce(array_agg(s.id), '{}'::uuid[]) into v_ids from (
			select q.id from public.cert_exam_questions q
			where q.certification_id = p_cert and q.active and q.topic = any (v_topic_ids)
				and not (q.id = any (v_picked))
			order by random() limit (v_per - coalesce(array_length(v_picked, 1), 0))
		) s;
		v_picked := v_picked || v_ids;
	end if;
	if coalesce(array_length(v_picked, 1), 0) < v_per then
		raise exception 'cert: pool cannot cover the exam';
	end if;

	select jsonb_agg(jsonb_build_object(
		'question_id', q.id, 'topic', q.topic, 'type', q.type,
		'option_order', case when q.type in ('multiple_choice', 'multiple_select')
			then (select jsonb_agg(o ->> 'key' order by random()) from jsonb_array_elements(q.options) o)
			else null end
	) order by random())
	into v_draw
	from public.cert_exam_questions q where q.id = any (v_picked);
	return v_draw;
end;
$fn$;
revoke all on function public._cert_exam_draw(uuid, uuid) from public, anon, authenticated, service_role;

-- One answer against one key, per type. A missing or malformed answer is
-- simply wrong; nothing here raises.
create or replace function public._cert_exam_score_one(p_type text, p_answer jsonb, p_key jsonb, p_option_order jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $fn$
declare
	v_given text;
	v_num numeric;
begin
	if p_answer is null or jsonb_typeof(p_answer) = 'null' then
		return false;
	end if;
	if p_type = 'multiple_choice' then
		return jsonb_typeof(p_answer) = 'string' and jsonb_typeof(p_key) = 'string'
			and (p_answer #>> '{}') = (p_key #>> '{}');
	elsif p_type = 'multiple_select' then
		if jsonb_typeof(p_answer) <> 'array' or jsonb_typeof(p_key) <> 'array' then
			return false;
		end if;
		return (select coalesce(array_agg(distinct a #>> '{}' order by a #>> '{}'), '{}'::text[]) from jsonb_array_elements(p_answer) a)
			= (select coalesce(array_agg(distinct k #>> '{}' order by k #>> '{}'), '{}'::text[]) from jsonb_array_elements(p_key) k);
	elsif p_type = 'numeric' then
		if jsonb_typeof(p_key) <> 'object' then
			return false;
		end if;
		begin
			v_num := case
				when jsonb_typeof(p_answer) = 'number' then (p_answer #>> '{}')::numeric
				when jsonb_typeof(p_answer) = 'string' then (public._cert_norm(p_answer #>> '{}'))::numeric
				else null end;
		exception when others then
			return false;
		end;
		if v_num is null then
			return false;
		end if;
		return abs(v_num - (p_key ->> 'value')::numeric) <= coalesce((p_key ->> 'tolerance')::numeric, 0);
	elsif p_type = 'short' then
		if jsonb_typeof(p_answer) <> 'string' or jsonb_typeof(p_key -> 'accept') <> 'array' then
			return false;
		end if;
		v_given := regexp_replace(lower(public._cert_norm(p_answer #>> '{}')), '\s+', ' ', 'g');
		v_given := regexp_replace(v_given, '\.$', '');
		return exists (
			select 1 from jsonb_array_elements_text(p_key -> 'accept') a
			where regexp_replace(regexp_replace(lower(public._cert_norm(a)), '\s+', ' ', 'g'), '\.$', '') = v_given
		);
	end if;
	return false;
end;
$fn$;
revoke all on function public._cert_exam_score_one(text, jsonb, jsonb, jsonb) from public, anon, authenticated, service_role;

-- What a student's browser receives for one question: the prompt, the options
-- in this student's order, a unit for a numeric one, the deadline. NEVER the
-- answer, never the explanation.
create or replace function public._cert_exam_question_json(p_exam uuid, p_index integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	e public.cert_exam_attempts%rowtype;
	v_d jsonb;
	q public.cert_exam_questions%rowtype;
begin
	select * into e from public.cert_exam_attempts where id = p_exam;
	if not found or p_index is null or p_index < 0 or p_index >= jsonb_array_length(e.draw) then
		return null;
	end if;
	v_d := e.draw -> p_index;
	select * into q from public.cert_exam_questions where id = (v_d ->> 'question_id')::uuid;
	if not found then
		return null;
	end if;
	return jsonb_build_object(
		'index', p_index,
		'total', jsonb_array_length(e.draw),
		'type', q.type,
		'prompt', q.prompt,
		'options', case when q.type in ('multiple_choice', 'multiple_select') then (
			select jsonb_agg(jsonb_build_object('key', k.key,
				'text', (select o ->> 'text' from jsonb_array_elements(q.options) o where (o ->> 'key') = k.key)) order by k.ord)
			from jsonb_array_elements_text(coalesce(v_d -> 'option_order', '[]'::jsonb)) with ordinality as k(key, ord)
		) else null end,
		'unit', case when q.type = 'numeric' then q.answer ->> 'unit' else null end,
		'deadline', e.deadline
	);
end;
$fn$;
revoke all on function public._cert_exam_question_json(uuid, integer) from public, anon, authenticated, service_role;

-- The certifier's full view of one exam: the score, every question with the
-- student's answer and correct or not, the flags and the timings. No key text.
create or replace function public._cert_exam_result_json(p_exam uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	e public.cert_exam_attempts%rowtype;
begin
	select * into e from public.cert_exam_attempts where id = p_exam;
	if not found then
		return null;
	end if;
	return jsonb_build_object(
		'exam_id', e.id,
		'state', e.state,
		'score', e.score,
		'per_question', coalesce((
			select jsonb_agg(jsonb_build_object(
				'index', d.ord - 1, 'topic', d.item ->> 'topic', 'type', d.item ->> 'type',
				'prompt', q.prompt,
				'answer_given', e.answers -> (d.ord - 1)::integer,
				'correct', (select (pq -> 'correct')::boolean from jsonb_array_elements(coalesce(e.score -> 'per_question', '[]'::jsonb)) pq
					where (pq ->> 'index')::integer = d.ord - 1)
			) order by d.ord)
			from jsonb_array_elements(e.draw) with ordinality as d(item, ord)
			left join public.cert_exam_questions q on q.id = (d.item ->> 'question_id')::uuid
		), '[]'::jsonb),
		'flags', e.flags,
		'released_at', e.released_at,
		'release_expires_at', e.release_expires_at,
		'started_at', e.started_at,
		'submitted_at', e.submitted_at,
		'deadline', e.deadline,
		'passed', e.passed,
		'proctor_name', public._cert_person_name(e.proctor_email)
	);
end;
$fn$;
revoke all on function public._cert_exam_result_json(uuid) from public, anon, authenticated, service_role;

-- Scores an in-progress exam as it stands and closes it. 100% passes (Mr.
-- Pina's rule). A pass checks the exam part off under the proctor's name; a
-- fail starts the cooldown and tells the student the topics they missed and
-- the date they may sit again. Returns the student's own result plus the
-- notifications to send.
create or replace function public._cert_exam_finish(p_exam uuid, p_actor text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	e public.cert_exam_attempts%rowtype;
	c public.cert_certifications%rowtype;
	v_total integer;
	v_correct integer := 0;
	v_i integer;
	v_d jsonb;
	q public.cert_exam_questions%rowtype;
	v_ok boolean;
	v_by_topic jsonb := '{}'::jsonb;
	v_per jsonb := '[]'::jsonb;
	v_missed text[] := '{}'::text[];
	v_topic text;
	v_tc integer;
	v_tt integer;
	v_passed boolean;
	v_score jsonb;
	v_notify jsonb := '[]'::jsonb;
	v_note jsonb;
	v_cooldown timestamptz;
begin
	select * into e from public.cert_exam_attempts where id = p_exam for update;
	if not found or e.state <> 'in_progress' then
		return null;
	end if;
	select * into c from public.cert_certifications where id = e.certification_id;
	v_total := jsonb_array_length(e.draw);
	for v_i in 0 .. v_total - 1 loop
		v_d := e.draw -> v_i;
		v_topic := v_d ->> 'topic';
		select * into q from public.cert_exam_questions where id = (v_d ->> 'question_id')::uuid;
		v_ok := found and public._cert_exam_score_one(q.type, e.answers -> v_i, q.answer, v_d -> 'option_order');
		if v_ok then
			v_correct := v_correct + 1;
		elsif not (v_topic = any (v_missed)) then
			v_missed := v_missed || v_topic;
		end if;
		v_tc := coalesce((v_by_topic -> v_topic ->> 'correct')::integer, 0) + case when v_ok then 1 else 0 end;
		v_tt := coalesce((v_by_topic -> v_topic ->> 'total')::integer, 0) + 1;
		v_by_topic := v_by_topic || jsonb_build_object(v_topic, jsonb_build_object('correct', v_tc, 'total', v_tt));
		v_per := v_per || jsonb_build_array(jsonb_build_object('index', v_i, 'topic', v_topic, 'correct', v_ok));
	end loop;
	-- Mr. Pina's rule: a score of 100% passes.
	v_passed := v_total > 0 and v_correct = v_total;
	v_score := jsonb_build_object('correct', v_correct, 'total', v_total, 'by_topic', v_by_topic,
		'missed_topics', to_jsonb(v_missed), 'per_question', v_per);

	update public.cert_exam_attempts
	set state = 'submitted', submitted_at = now(), score = v_score, passed = v_passed
	where id = e.id;
	perform public._cert_touch(e.attempt_id);
	perform public._cert_event('exam.submitted', p_actor, e.email, e.certification_id, e.attempt_id,
		jsonb_build_object('exam_id', e.id, 'correct', v_correct, 'total', v_total, 'passed', v_passed,
			'flags_count', jsonb_array_length(e.flags)), p_reason);

	if v_passed then
		perform public._cert_event('exam.passed', p_actor, e.email, e.certification_id, e.attempt_id,
			jsonb_build_object('exam_id', e.id), null);
		v_note := public._cert_check_done(e.attempt_id, 'exam', e.proctor_email, null);
		if v_note is not null then
			v_notify := v_notify || v_note;
		end if;
	else
		v_cooldown := public._cert_cooldown_until(e.attempt_id);
		perform public._cert_event('exam.failed', p_actor, e.email, e.certification_id, e.attempt_id,
			jsonb_build_object('exam_id', e.id, 'missed_topics', to_jsonb(v_missed), 'cooldown_until', v_cooldown), null);
		v_notify := v_notify || public._cert_notify(e.email, 'review_returned', 'Exam: not yet',
			'Your ' || c.name || ' exam scored ' || v_correct || ' of ' || v_total || '. Topics to study: '
				|| coalesce(nullif(array_to_string(v_missed, ', '), ''), 'none') || '. You can take it again on '
				|| to_char(v_cooldown at time zone 'America/Los_Angeles', 'FMMonth FMDD, YYYY') || '.',
			'/certifications/' || c.code,
			jsonb_build_object('exam', 'failed', 'exam_id', e.id, 'attempt_id', e.attempt_id, 'code', c.code,
				'missed_topics', to_jsonb(v_missed), 'cooldown_until', v_cooldown));
	end if;

	return jsonb_build_object('ok', true, 'passed', v_passed, 'total', v_total, 'correct', v_correct,
		'missed_topics', to_jsonb(v_missed), 'cooldown_until', v_cooldown, 'notify', v_notify);
end;
$fn$;
revoke all on function public._cert_exam_finish(uuid, text, text) from public, anon, authenticated, service_role;
-- ===== PART B END =====

-- ===== PART C BEGIN =====
-- ===== PART C: SITTINGS AND SEATS =====

-- An admin posts a window, repeated weekly up to 26 times under one series.
create or replace function public.cert_sitting_post(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	v_starts timestamptz;
	v_ends timestamptz;
	v_limit integer;
	v_weeks integer;
	v_cert uuid;
	v_series uuid := gen_random_uuid();
	v_ids uuid[] := '{}'::uuid[];
	v_id uuid;
	v_i integer;
begin
	if not public.is_admin() then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if not public._cert_jt(p, 'object') then
		raise exception 'cert_sitting_post: expected an object';
	end if;
	begin
		v_starts := (p ->> 'starts_at')::timestamptz;
		v_ends := (p ->> 'ends_at')::timestamptz;
	exception when others then
		return public._cert_refuse('invalid', 'The window needs a start and an end time.');
	end;
	if v_starts is null or v_ends is null or v_ends <= v_starts then
		return public._cert_refuse('invalid', 'The window needs a start and an end time, and it ends after it starts.');
	end if;
	if not public._cert_jint(p -> 'seat_limit') or (p ->> 'seat_limit')::numeric not between 1 and 200 then
		return public._cert_refuse('invalid', 'The seat limit is a whole number from 1 to 200.');
	end if;
	v_limit := (p ->> 'seat_limit')::integer;
	v_weeks := 0;
	if (p ? 'repeat_weeks') and jsonb_typeof(p -> 'repeat_weeks') <> 'null' then
		if not public._cert_jint(p -> 'repeat_weeks') or (p ->> 'repeat_weeks')::numeric not between 0 and 26 then
			return public._cert_refuse('invalid', 'Repeat is a whole number of weeks from 0 to 26.');
		end if;
		v_weeks := (p ->> 'repeat_weeks')::integer;
	end if;
	if (p ? 'certification_id') and jsonb_typeof(p -> 'certification_id') <> 'null' then
		begin
			v_cert := (p ->> 'certification_id')::uuid;
		exception when others then
			return public._cert_refuse('invalid', 'The certification id is not a uuid.');
		end;
		if not exists (select 1 from public.cert_certifications where id = v_cert) then
			return public._cert_refuse('not_found', 'Not found.');
		end if;
	end if;
	for v_i in 0 .. v_weeks loop
		insert into public.cert_sittings (series_id, certification_id, starts_at, ends_at, seat_limit, location, note, created_by)
		values (v_series, v_cert, v_starts + (v_i * interval '7 days'), v_ends + (v_i * interval '7 days'), v_limit,
			nullif(public._cert_norm(p ->> 'location'), ''), nullif(public._cert_norm(p ->> 'note'), ''), v_me)
		returning id into v_id;
		v_ids := v_ids || v_id;
	end loop;
	perform public._cert_event('sitting.posted', v_me, null, v_cert, null,
		jsonb_build_object('series_id', v_series, 'count', v_weeks + 1, 'starts_at', v_starts, 'seat_limit', v_limit), null);
	return jsonb_build_object('ok', true, 'series_id', v_series, 'sitting_ids', to_jsonb(v_ids));
end;
$fn$;
revoke all on function public.cert_sitting_post(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.cert_sitting_post(jsonb) to authenticated;

create or replace function public.cert_sitting_cancel(p_sitting uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	w public.cert_sittings%rowtype;
	s record;
	v_notify jsonb := '[]'::jsonb;
begin
	if not public.is_admin() then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	select * into w from public.cert_sittings where id = p_sitting for update;
	if not found then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if w.state = 'cancelled' then
		return public._cert_refuse('cancelled', 'This window is already cancelled.');
	end if;
	update public.cert_sittings set state = 'cancelled' where id = w.id;
	for s in
		update public.cert_seats x set state = 'cancelled', decided_by = v_me, decided_at = now(),
			decision_note = 'The window was cancelled.'
		where x.sitting_id = w.id and x.state = 'booked'
		returning x.id, x.email, x.attempt_id, x.certification_id
	loop
		v_notify := v_notify || public._cert_notify(s.email, 'sitting_declined', 'Exam window cancelled',
			'The exam window on ' || to_char(w.starts_at at time zone 'America/Los_Angeles', 'FMMonth FMDD, YYYY at FMHH12:MI AM')
				|| ' was cancelled. Sign up for another window or send a request.',
			'/certifications/' || (select code from public.cert_certifications where id = s.certification_id),
			jsonb_build_object('seat_id', s.id, 'attempt_id', s.attempt_id, 'sitting_id', w.id, 'cancelled', true));
		perform public._cert_event('seat.cancelled', v_me, s.email, s.certification_id, s.attempt_id,
			jsonb_build_object('seat_id', s.id, 'sitting_id', w.id), 'window cancelled');
	end loop;
	perform public._cert_event('sitting.cancelled', v_me, null, w.certification_id, null,
		jsonb_build_object('sitting_id', w.id, 'seats_cancelled', jsonb_array_length(v_notify)), null);
	return jsonb_build_object('ok', true, 'notify', v_notify);
end;
$fn$;
revoke all on function public.cert_sitting_cancel(uuid) from public, anon, authenticated, service_role;
grant execute on function public.cert_sitting_cancel(uuid) to authenticated;

-- Open windows that have not ended, for anyone signed in.
create or replace function public.cert_sittings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
	perform public._cert_caller();
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'id', w.id, 'starts_at', w.starts_at, 'ends_at', w.ends_at, 'seat_limit', w.seat_limit,
			'seats_taken', (select count(*) from public.cert_seats s where s.sitting_id = w.id and s.state in ('booked', 'used')),
			'location', w.location, 'note', w.note,
			'certification', case when c.id is null then null else jsonb_build_object('code', c.code, 'name', c.name) end,
			'state', w.state) order by w.starts_at)
		from public.cert_sittings w
		left join public.cert_certifications c on c.id = w.certification_id
		where w.state = 'open' and w.ends_at > now()
	), '[]'::jsonb);
end;
$fn$;
revoke all on function public.cert_sittings() from public, anon, authenticated, service_role;
grant execute on function public.cert_sittings() to authenticated;

-- A student asks for a seat: with a window it is booked, without one it is a
-- request the certifiers hear about. Guided must be done or waived, no
-- cooldown may be running, and only one seat may be open.
create or replace function public.cert_seat_request(p_attempt uuid, p_sitting uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	t public.cert_attempts%rowtype;
	c public.cert_certifications%rowtype;
	w public.cert_sittings%rowtype;
	v_pkg jsonb;
	v_cooldown timestamptz;
	v_taken integer;
	s public.cert_seats%rowtype;
	v_notify jsonb := '[]'::jsonb;
	v_cert_email text;
begin
	select * into t from public.cert_attempts where id = p_attempt and email = v_me for update;
	if not found then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if t.state not in ('active', 'dormant') then
		return public._cert_refuse('not_active', 'This attempt is ' || t.state || '.');
	end if;
	perform public._cert_touch(t.id);
	select * into c from public.cert_certifications where id = t.certification_id;
	select package into v_pkg from public.cert_revisions where id = t.revision_id;
	if (coalesce(v_pkg -> 'parts', '{}'::jsonb) -> 'exam') is distinct from 'true'::jsonb then
		return public._cert_refuse('waived', 'This certification has no exam.');
	end if;
	if not exists (select 1 from public.cert_checks k where k.attempt_id = t.id and k.part = 'exam' and k.state = 'pending') then
		return public._cert_refuse('done', 'The exam is already checked off.');
	end if;
	if not public._cert_part_unlocked(t.id, 'exam') then
		return public._cert_refuse('locked', 'Finish ' || lower(public._cert_part_word(public._cert_next_part(t.id))) || ' first.');
	end if;
	-- The cooldown: a failed exam locks the exam for 7 days (Mr. Pina's rule).
	v_cooldown := public._cert_cooldown_until(t.id);
	if v_cooldown is not null and v_cooldown > now() then
		return public._cert_refuse('cooldown', 'You can take this exam again on '
			|| to_char(v_cooldown at time zone 'America/Los_Angeles', 'FMMonth FMDD, YYYY') || '.')
			|| jsonb_build_object('cooldown_until', v_cooldown);
	end if;
	if exists (select 1 from public.cert_seats x where x.attempt_id = t.id and x.state in ('requested', 'approved', 'booked')) then
		return public._cert_refuse('seat_open', 'You already have a seat request or booking open.');
	end if;

	if p_sitting is not null then
		select * into w from public.cert_sittings where id = p_sitting for update;
		if not found or w.state <> 'open' or w.ends_at <= now() then
			return public._cert_refuse('sitting_closed', 'That window is not open.');
		end if;
		if w.certification_id is not null and w.certification_id <> c.id then
			return public._cert_refuse('sitting_mismatch', 'That window is for a different certification.');
		end if;
		select count(*) into v_taken from public.cert_seats x where x.sitting_id = w.id and x.state in ('booked', 'used');
		if v_taken >= w.seat_limit then
			return public._cert_refuse('sitting_full', 'That window is full.');
		end if;
		insert into public.cert_seats (attempt_id, certification_id, email, sitting_id, state, note, scheduled_at)
		values (t.id, c.id, v_me, w.id, 'booked', nullif(public._cert_norm(p_note), ''), w.starts_at)
		returning * into s;
		perform public._cert_event('seat.booked', v_me, v_me, c.id, t.id,
			jsonb_build_object('seat_id', s.id, 'sitting_id', w.id, 'scheduled_at', w.starts_at), nullif(public._cert_norm(p_note), ''));
	else
		insert into public.cert_seats (attempt_id, certification_id, email, state, note)
		values (t.id, c.id, v_me, 'requested', nullif(public._cert_norm(p_note), ''))
		returning * into s;
		perform public._cert_event('seat.requested', v_me, v_me, c.id, t.id,
			jsonb_build_object('seat_id', s.id), nullif(public._cert_norm(p_note), ''));
		foreach v_cert_email in array public._cert_certifier_emails(c.id) loop
			if v_cert_email <> v_me then
				v_notify := v_notify || public._cert_notify(v_cert_email, 'queue_request',
					'Exam sitting requested: ' || c.code,
					coalesce(public._cert_person_name(v_me), 'A student') || ' asked for an exam sitting for ' || c.name || '.'
						|| case when public._cert_norm(p_note) = '' then '' else ' Note: ' || public._cert_norm(p_note) end,
					'/certifications/desk/sittings',
					jsonb_build_object('seat_id', s.id, 'attempt_id', t.id, 'code', c.code));
			end if;
		end loop;
	end if;
	return jsonb_build_object('ok', true,
		'seat', jsonb_build_object('id', s.id, 'state', s.state, 'sitting_id', s.sitting_id,
			'scheduled_at', s.scheduled_at, 'requested_at', s.requested_at, 'decision_note', s.decision_note),
		'notify', v_notify);
end;
$fn$;
revoke all on function public.cert_seat_request(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.cert_seat_request(uuid, uuid, text) to authenticated;

-- A certifier approves a request with a time, or declines it with a note.
create or replace function public.cert_seat_decide(p_seat uuid, p_decision text, p_scheduled_at timestamptz, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	s public.cert_seats%rowtype;
	c public.cert_certifications%rowtype;
	v_note text := nullif(public._cert_norm(p_note), '');
	v_notify jsonb := '[]'::jsonb;
begin
	if coalesce(p_decision, '') not in ('approve', 'decline') then
		raise exception 'cert_seat_decide: decision must be approve or decline';
	end if;
	select * into s from public.cert_seats where id = p_seat for update;
	if not found or not public._cert_can_certify(s.certification_id) then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if s.email = v_me then
		return public._cert_refuse('self', 'You cannot decide your own sitting request.');
	end if;
	if s.state <> 'requested' then
		return public._cert_refuse('decided', 'This request is already ' || s.state || '.');
	end if;
	select * into c from public.cert_certifications where id = s.certification_id;
	if p_decision = 'approve' then
		if p_scheduled_at is null then
			return public._cert_refuse('time_required', 'An approval names the time of the sitting.');
		end if;
		update public.cert_seats set state = 'approved', decided_by = v_me, decided_at = now(),
			scheduled_at = p_scheduled_at, decision_note = v_note where id = s.id;
		v_notify := v_notify || public._cert_notify(s.email, 'sitting_approved', 'Exam sitting approved: ' || c.code,
			'Your ' || c.name || ' exam is set for '
				|| to_char(p_scheduled_at at time zone 'America/Los_Angeles', 'FMMonth FMDD, YYYY at FMHH12:MI AM')
				|| '. Your proctor releases it on their own device when you are in the room.'
				|| case when v_note is null then '' else ' Note: ' || v_note end,
			'/certifications/' || c.code,
			jsonb_build_object('seat_id', s.id, 'attempt_id', s.attempt_id, 'scheduled_at', p_scheduled_at, 'code', c.code));
	else
		if v_note is null then
			return public._cert_refuse('note_required', 'A decline carries a note so the student knows what to do next.');
		end if;
		update public.cert_seats set state = 'declined', decided_by = v_me, decided_at = now(), decision_note = v_note where id = s.id;
		v_notify := v_notify || public._cert_notify(s.email, 'sitting_declined', 'Exam sitting declined: ' || c.code,
			'Your sitting request for ' || c.name || ' was declined. Note: ' || v_note,
			'/certifications/' || c.code,
			jsonb_build_object('seat_id', s.id, 'attempt_id', s.attempt_id, 'code', c.code));
	end if;
	perform public._cert_event('seat.decided', v_me, s.email, s.certification_id, s.attempt_id,
		jsonb_build_object('seat_id', s.id, 'decision', p_decision, 'scheduled_at', p_scheduled_at), v_note);
	return jsonb_build_object('ok', true, 'notify', v_notify);
end;
$fn$;
revoke all on function public.cert_seat_decide(uuid, text, timestamptz, text) from public, anon, authenticated, service_role;
grant execute on function public.cert_seat_decide(uuid, text, timestamptz, text) to authenticated;

create or replace function public.cert_seat_cancel(p_seat uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	s public.cert_seats%rowtype;
begin
	select * into s from public.cert_seats where id = p_seat for update;
	if not found or (s.email <> v_me and not public._cert_can_certify(s.certification_id)) then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if s.state not in ('requested', 'approved', 'booked') then
		return public._cert_refuse('decided', 'This seat is already ' || s.state || '.');
	end if;
	update public.cert_seats set state = 'cancelled', decided_by = v_me, decided_at = now() where id = s.id;
	perform public._cert_event('seat.cancelled', v_me, s.email, s.certification_id, s.attempt_id,
		jsonb_build_object('seat_id', s.id, 'was', s.state), null);
	return jsonb_build_object('ok', true);
end;
$fn$;
revoke all on function public.cert_seat_cancel(uuid) from public, anon, authenticated, service_role;
grant execute on function public.cert_seat_cancel(uuid) to authenticated;
-- ===== PART C END =====

-- ===== PART D BEGIN =====
-- ===== PART D: THE EXAM =====

-- The proctor, on their own device, releases the exam for one seat: a fresh
-- draw, a release that lasts the settings' window, the seat used.
create or replace function public.cert_exam_release(p_seat uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	s public.cert_seats%rowtype;
	t public.cert_attempts%rowtype;
	v_pkg jsonb;
	v_cooldown timestamptz;
	v_draw jsonb;
	v_window integer;
	v_limit integer;
	e public.cert_exam_attempts%rowtype;
begin
	select * into s from public.cert_seats where id = p_seat for update;
	if not found or not public._cert_can_certify(s.certification_id) then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if s.email = v_me then
		return public._cert_refuse('self', 'You cannot release your own exam.');
	end if;
	if s.state not in ('approved', 'booked') then
		return public._cert_refuse('seat_state', 'This seat is ' || s.state || ', so there is nothing to release.');
	end if;
	select * into t from public.cert_attempts where id = s.attempt_id for update;
	if t.state not in ('active', 'dormant') then
		return public._cert_refuse('not_active', 'This attempt is ' || t.state || '.');
	end if;
	if not exists (select 1 from public.cert_checks k where k.attempt_id = t.id and k.part = 'exam' and k.state = 'pending') then
		return public._cert_refuse('done', 'The exam is already checked off.');
	end if;
	v_cooldown := public._cert_cooldown_until(t.id);
	if v_cooldown is not null and v_cooldown > now() then
		return public._cert_refuse('cooldown', 'This student is in a cooldown until '
			|| to_char(v_cooldown at time zone 'America/Los_Angeles', 'FMMonth FMDD, YYYY') || '.')
			|| jsonb_build_object('cooldown_until', v_cooldown);
	end if;
	-- A release nobody used has expired; say so in the row before deciding.
	update public.cert_exam_attempts set state = 'expired'
	where attempt_id = t.id and state = 'released' and release_expires_at <= now();
	if exists (select 1 from public.cert_exam_attempts x where x.attempt_id = t.id and x.state in ('released', 'in_progress')) then
		return public._cert_refuse('exam_open', 'An exam is already released or in progress for this student.');
	end if;
	select package into v_pkg from public.cert_revisions where id = t.revision_id;
	v_limit := coalesce((v_pkg -> 'exam' ->> 'time_limit_minutes')::integer, 30);
	select release_window_minutes into v_window from public.cert_settings where id;
	v_window := coalesce(v_window, 10);
	begin
		v_draw := public._cert_exam_draw(t.certification_id, t.revision_id);
	exception when others then
		return public._cert_refuse('pool', 'The question pool cannot cover this exam. Ask the admin to add questions.');
	end;

	insert into public.cert_exam_attempts (attempt_id, seat_id, certification_id, revision_id, email, proctor_email,
		release_expires_at, time_limit_minutes, draw, answers)
	values (t.id, s.id, t.certification_id, t.revision_id, t.email, v_me,
		now() + (v_window * interval '1 minute'), v_limit, v_draw,
		(select coalesce(jsonb_agg('null'::jsonb), '[]'::jsonb) from jsonb_array_elements(v_draw)))
	returning * into e;
	update public.cert_seats set state = 'used', decided_by = coalesce(decided_by, v_me), decided_at = coalesce(decided_at, now()) where id = s.id;
	perform public._cert_touch(t.id);
	perform public._cert_event('exam.released', v_me, t.email, t.certification_id, t.id,
		jsonb_build_object('exam_id', e.id, 'seat_id', s.id, 'total', jsonb_array_length(v_draw),
			'release_expires_at', e.release_expires_at), null);
	return jsonb_build_object('ok', true, 'exam_id', e.id, 'release_expires_at', e.release_expires_at,
		'total', jsonb_array_length(v_draw));
end;
$fn$;
revoke all on function public.cert_exam_release(uuid) from public, anon, authenticated, service_role;
grant execute on function public.cert_exam_release(uuid) to authenticated;

-- The student opens a released exam: the clock starts; an open one resumes;
-- a release past its window expires.
create or replace function public.cert_exam_open(p_exam uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	e public.cert_exam_attempts%rowtype;
	v_result jsonb;
begin
	select * into e from public.cert_exam_attempts where id = p_exam and email = v_me for update;
	if not found then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if e.state = 'released' then
		if e.release_expires_at <= now() then
			update public.cert_exam_attempts set state = 'expired' where id = e.id;
			return public._cert_refuse('release_expired', 'This release expired. Ask your proctor to release the exam again.');
		end if;
		update public.cert_exam_attempts
		set state = 'in_progress', started_at = now(), deadline = now() + (time_limit_minutes * interval '1 minute')
		where id = e.id
		returning * into e;
		perform public._cert_touch(e.attempt_id);
		perform public._cert_event('exam.opened', v_me, v_me, e.certification_id, e.attempt_id,
			jsonb_build_object('exam_id', e.id, 'deadline', e.deadline), null);
	elsif e.state = 'in_progress' then
		if now() > e.deadline + interval '5 seconds' then
			v_result := public._cert_exam_finish(e.id, v_me, 'time up');
			return public._cert_refuse('time_up', 'Time is up; the exam was submitted as it stood.') || jsonb_build_object('result', v_result);
		end if;
	elsif e.state = 'submitted' then
		return public._cert_refuse('submitted', 'This exam was already submitted.');
	else
		return public._cert_refuse('release_expired', 'This release expired. Ask your proctor to release the exam again.');
	end if;
	return jsonb_build_object('ok', true,
		'exam', jsonb_build_object('id', e.id, 'state', e.state, 'total', jsonb_array_length(e.draw),
			'current_index', e.current_index, 'deadline', e.deadline),
		'question', public._cert_exam_question_json(e.id, e.current_index));
end;
$fn$;
revoke all on function public.cert_exam_open(uuid) from public, anon, authenticated, service_role;
grant execute on function public.cert_exam_open(uuid) to authenticated;

-- One answer, in order, before the deadline. The next question comes back, or
-- done when the last one is answered. Past the deadline the exam is submitted
-- as it stands and the result comes back instead.
create or replace function public.cert_exam_answer(p_exam uuid, p_index integer, p_answer jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	e public.cert_exam_attempts%rowtype;
	v_result jsonb;
	v_total integer;
	v_answer jsonb := coalesce(p_answer, 'null'::jsonb);
begin
	select * into e from public.cert_exam_attempts where id = p_exam and email = v_me for update;
	if not found then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if e.state <> 'in_progress' then
		return public._cert_refuse('not_open', 'This exam is ' || e.state || '.');
	end if;
	if now() > e.deadline + interval '5 seconds' then
		v_result := public._cert_exam_finish(e.id, v_me, 'time up');
		return public._cert_refuse('time_up', 'Time is up; the exam was submitted as it stood.') || jsonb_build_object('result', v_result);
	end if;
	v_total := jsonb_array_length(e.draw);
	if p_index is distinct from e.current_index or e.current_index >= v_total then
		return public._cert_refuse('out_of_order', 'Answers are taken one at a time, in order.') || jsonb_build_object('current_index', e.current_index);
	end if;
	if jsonb_typeof(v_answer) not in ('string', 'array', 'number', 'null') or length(v_answer::text) > 4000 then
		raise exception 'cert_exam_answer: an answer is a string, an array of keys, a number or null, under 4000 characters';
	end if;
	update public.cert_exam_attempts
	set answers = jsonb_set(answers, array[e.current_index::text], v_answer, true), current_index = current_index + 1
	where id = e.id
	returning * into e;
	if e.current_index >= v_total then
		return jsonb_build_object('ok', true, 'done', true, 'total', v_total);
	end if;
	return jsonb_build_object('ok', true, 'question', public._cert_exam_question_json(e.id, e.current_index));
end;
$fn$;
revoke all on function public.cert_exam_answer(uuid, integer, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.cert_exam_answer(uuid, integer, jsonb) to authenticated;

create or replace function public.cert_exam_flag(p_exam uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	e public.cert_exam_attempts%rowtype;
begin
	if coalesce(p_kind, '') not in ('blur', 'hidden', 'fullscreen_exit', 'resize', 'copy', 'paste', 'contextmenu') then
		raise exception 'cert_exam_flag: unknown flag kind';
	end if;
	select * into e from public.cert_exam_attempts where id = p_exam and email = v_me for update;
	if not found then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if e.state not in ('released', 'in_progress') then
		return public._cert_refuse('closed', 'This exam is ' || e.state || '.');
	end if;
	update public.cert_exam_attempts
	set flags = flags || jsonb_build_array(jsonb_build_object('at', now(), 'kind', p_kind))
	where id = e.id
	returning * into e;
	perform public._cert_event('exam.flag', v_me, v_me, e.certification_id, e.attempt_id,
		jsonb_build_object('exam_id', e.id, 'kind', p_kind), null);
	return jsonb_build_object('ok', true, 'flags_count', jsonb_array_length(e.flags));
end;
$fn$;
revoke all on function public.cert_exam_flag(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.cert_exam_flag(uuid, text) to authenticated;

-- The student submits. They get their pass or fail, the count, the topics they
-- missed and the cooldown date, and nothing about which questions.
create or replace function public.cert_exam_submit(p_exam uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	e public.cert_exam_attempts%rowtype;
	v_result jsonb;
begin
	select * into e from public.cert_exam_attempts where id = p_exam and email = v_me;
	if not found then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if e.state <> 'in_progress' then
		return public._cert_refuse('not_open', 'This exam is ' || e.state || '.');
	end if;
	v_result := public._cert_exam_finish(e.id, v_me, null);
	return v_result;
end;
$fn$;
revoke all on function public.cert_exam_submit(uuid) from public, anon, authenticated, service_role;
grant execute on function public.cert_exam_submit(uuid) to authenticated;

-- The proctor ends an exam from their side: an open one is submitted as it
-- stands, a released one that was never opened expires. Returns the full
-- result.
create or replace function public.cert_exam_end(p_exam uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	e public.cert_exam_attempts%rowtype;
	v_reason text := nullif(public._cert_norm(p_reason), '');
	v_result jsonb;
begin
	select * into e from public.cert_exam_attempts where id = p_exam for update;
	if not found or (e.proctor_email <> v_me and not public._cert_can_certify(e.certification_id)) then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if e.email = v_me then
		return public._cert_refuse('self', 'You cannot end your own exam from the proctor side.');
	end if;
	if e.state = 'in_progress' then
		v_result := public._cert_exam_finish(e.id, v_me, coalesce(v_reason, 'ended by the proctor'));
	elsif e.state = 'released' then
		update public.cert_exam_attempts set state = 'expired' where id = e.id;
		perform public._cert_event('exam.submitted', v_me, e.email, e.certification_id, e.attempt_id,
			jsonb_build_object('exam_id', e.id, 'expired', true), coalesce(v_reason, 'ended by the proctor before it opened'));
		v_result := jsonb_build_object('ok', true, 'notify', '[]'::jsonb);
	else
		return public._cert_refuse('closed', 'This exam is already ' || e.state || '.');
	end if;
	return jsonb_build_object('ok', true, 'notify', coalesce(v_result -> 'notify', '[]'::jsonb),
		'result', public._cert_exam_result_json(e.id));
end;
$fn$;
revoke all on function public.cert_exam_end(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.cert_exam_end(uuid, text) to authenticated;

-- Live proctoring: every exam released today or still in progress, for the
-- caller's certifications (null = all of them).
create or replace function public.cert_exam_live(p_cert uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	v_admin boolean;
begin
	if not public._cert_is_certifier() then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	v_admin := public.is_admin();
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'exam_id', e.id,
			'student', jsonb_build_object('email', e.email, 'name', public._cert_person_name(e.email)),
			'certification', jsonb_build_object('code', c.code, 'name', c.name),
			'state', e.state, 'current_index', e.current_index, 'total', jsonb_array_length(e.draw),
			'released_at', e.released_at, 'release_expires_at', e.release_expires_at,
			'started_at', e.started_at, 'deadline', e.deadline, 'flags', e.flags,
			'passed', e.passed, 'submitted_at', e.submitted_at) order by e.released_at desc)
		from public.cert_exam_attempts e
		join public.cert_certifications c on c.id = e.certification_id
		where (p_cert is null or e.certification_id = p_cert)
			and (v_admin or exists (select 1 from public.cert_authority a where a.certification_id = c.id and a.email = v_me and a.revoked_at is null))
			and (e.state = 'in_progress'
				or (e.released_at at time zone 'America/Los_Angeles')::date = (now() at time zone 'America/Los_Angeles')::date)
	), '[]'::jsonb);
end;
$fn$;
revoke all on function public.cert_exam_live(uuid) from public, anon, authenticated, service_role;
grant execute on function public.cert_exam_live(uuid) to authenticated;

-- The full stored result, for a certifier of the certification who is not the
-- student. No answer key text, ever.
create or replace function public.cert_exam_result(p_exam uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	e public.cert_exam_attempts%rowtype;
begin
	select * into e from public.cert_exam_attempts where id = p_exam;
	if not found or not public._cert_can_certify(e.certification_id) then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if e.email = v_me then
		return public._cert_refuse('self', 'Your own exam shows you the topics you missed, not the questions.');
	end if;
	return public._cert_exam_result_json(e.id);
end;
$fn$;
revoke all on function public.cert_exam_result(uuid) from public, anon, authenticated, service_role;
grant execute on function public.cert_exam_result(uuid) to authenticated;
-- ===== PART D END =====

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
		'cert_sitting_post(jsonb)',
		'cert_sitting_cancel(uuid)',
		'cert_sittings()',
		'cert_seat_request(uuid, uuid, text)',
		'cert_seat_decide(uuid, text, timestamptz, text)',
		'cert_seat_cancel(uuid)',
		'cert_exam_release(uuid)',
		'cert_exam_open(uuid)',
		'cert_exam_answer(uuid, integer, jsonb)',
		'cert_exam_flag(uuid, text)',
		'cert_exam_submit(uuid)',
		'cert_exam_end(uuid, text)',
		'cert_exam_live(uuid)',
		'cert_exam_result(uuid)'
	] loop
		v_oid := to_regprocedure('public.' || v_fn);
		if v_oid is null then
			v_bad := array_append(v_bad, v_fn || ' is missing');
		else
			if has_function_privilege('anon', v_oid, 'execute') then
				v_bad := array_append(v_bad, v_fn || ' is executable by anon');
			end if;
			if not has_function_privilege('authenticated', v_oid, 'execute') then
				v_bad := array_append(v_bad, v_fn || ' is not executable by authenticated');
			end if;
		end if;
	end loop;

	foreach v_fn in array array[
		'_cert_cooldown_until(uuid)',
		'_cert_exam_draw(uuid, uuid)',
		'_cert_exam_score_one(text, jsonb, jsonb, jsonb)',
		'_cert_exam_question_json(uuid, integer)',
		'_cert_exam_result_json(uuid)',
		'_cert_exam_finish(uuid, text, text)'
	] loop
		v_oid := to_regprocedure('public.' || v_fn);
		if v_oid is null then
			v_bad := array_append(v_bad, v_fn || ' is missing');
		elsif has_function_privilege('anon', v_oid, 'execute')
			or has_function_privilege('authenticated', v_oid, 'execute')
			or has_function_privilege('service_role', v_oid, 'execute') then
			v_bad := array_append(v_bad, v_fn || ' is executable by a client');
		end if;
	end loop;

	foreach v_tbl in array array['cert_sittings', 'cert_seats', 'cert_exam_attempts'] loop
		if not exists (
			select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
			where n.nspname = 'public' and c.relname = v_tbl and c.relrowsecurity
		) then
			v_bad := array_append(v_bad, v_tbl || ' has no row level security');
		end if;
		if has_table_privilege('anon', 'public.' || v_tbl, 'select,insert,update,delete,truncate,references,trigger')
			or has_table_privilege('authenticated', 'public.' || v_tbl, 'select,insert,update,delete,truncate,references,trigger') then
			v_bad := array_append(v_bad, v_tbl || ' carries a client grant');
		end if;
		if exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = v_tbl) then
			v_bad := array_append(v_bad, v_tbl || ' carries a policy');
		end if;
	end loop;

	-- The scorer, one planted reading per type, and the one it must refuse.
	if public._cert_exam_score_one('multiple_choice', '"a"'::jsonb, '"a"'::jsonb, null) is distinct from true
		or public._cert_exam_score_one('multiple_choice', '"b"'::jsonb, '"a"'::jsonb, null) is distinct from false
		or public._cert_exam_score_one('multiple_select', '["c","a"]'::jsonb, '["a","c"]'::jsonb, null) is distinct from true
		or public._cert_exam_score_one('multiple_select', '["a"]'::jsonb, '["a","c"]'::jsonb, null) is distinct from false
		or public._cert_exam_score_one('numeric', '12.6'::jsonb, '{"value": 12.5, "tolerance": 0.1}'::jsonb, null) is distinct from true
		or public._cert_exam_score_one('numeric', '12.7'::jsonb, '{"value": 12.5, "tolerance": 0.1}'::jsonb, null) is distinct from false
		or public._cert_exam_score_one('short', '"  A Reamer. "'::jsonb, '{"accept": ["reamer", "a reamer"]}'::jsonb, null) is distinct from true
		or public._cert_exam_score_one('short', '"drill"'::jsonb, '{"accept": ["reamer"]}'::jsonb, null) is distinct from false
		or public._cert_exam_score_one('short', 'null'::jsonb, '{"accept": ["reamer"]}'::jsonb, null) is distinct from false then
		v_bad := array_append(v_bad, 'the scorer did not answer the planted readings');
	end if;

	if array_length(v_bad, 1) is not null then
		raise exception '0262 self-check refused: %', array_to_string(v_bad, '; ');
	end if;
	raise notice '0262 cert exam: 3 tables with RLS on and no client grant, 14 client functions closed to anon, 6 private helpers closed to every client, scorer checked.';
end $z$;
-- ===== PART Z END =====
