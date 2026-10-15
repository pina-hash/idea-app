-- 0242_coin_v2_grading_and_autopay.sql
--
-- IDEA COIN V2, PART FOUR (ledger 0384): DIRECT SCORE ENTRY, THE PERFECT SCORE
-- TOGGLE, AND AUTOPAY.
--
-- GRADING. A grader may type "score out of N" and that number is the score of
-- record, with or without a rubric. It is stored as `direct_score` and
-- classroom_grade_submission (still the ONLY writer of state = 'returned')
-- honours it. classroom_grade_direct is the new door and calls through to it,
-- so single grading, bulk grading and the Documentation Check all keep one
-- grading rule. Bought extra credit can never be taken away by a regrade.
--
-- AUTOPAY. One idempotent definer function, coin_autopay_run(), pays
-- everything owed and nothing more. "Nothing more" is a database uniqueness
-- key per kind of pay:
--   wage           (student, week)
--   Highest Grade  (section, period) is evaluated once; its winners are keyed
--                  (section, period, student)
--   Perfect Score  (submission), a state row: paid if currently perfect, once
-- Every automatic row's actor is 'system' and carries its period in meta.
-- The pause setting stops all of it.
--
-- IT IS GRANTED TO anon AND authenticated, deliberately. It takes no argument
-- that names a person or an amount, it can only pay what is owed (a second
-- call finds every key taken), it answers a non-admin with counts only, and it
-- throttles itself. That is what lets the nightly scheduler call it with no
-- credential at all and every coin page call it as a catch-up.
--
-- UNDO: re-run 0171's body of classroom_grade_submission, drop the functions
-- and the five tables this file creates, and drop the two new columns.

-- ===== PART A BEGIN =====
-- ===== PART A: COLUMNS AND TABLES =====

alter table public.classroom_submissions add column if not exists direct_score numeric;
do $a$
begin
	if not exists (select 1 from pg_catalog.pg_constraint where conname = 'classroom_submissions_direct_score_range') then
		alter table public.classroom_submissions add constraint classroom_submissions_direct_score_range
			check (direct_score is null or (direct_score >= 0 and direct_score <= 100000));
	end if;
end
$a$;

alter table public.classroom_postings add column if not exists perfect_score_award boolean not null default false;

create table if not exists public.coin_autopay_runs (
	id bigserial primary key,
	trigger text not null,
	started_at timestamptz not null default now(),
	finished_at timestamptz,
	result jsonb
);
alter table public.coin_autopay_runs enable row level security;
revoke all on table public.coin_autopay_runs from public, anon, authenticated, service_role;
revoke all on sequence public.coin_autopay_runs_id_seq from public, anon, authenticated, service_role;

create table if not exists public.coin_autopay_wages (
	student_email text not null,
	week_start date not null,
	transaction_id uuid,
	created_at timestamptz not null default now(),
	primary key (student_email, week_start)
);
alter table public.coin_autopay_wages enable row level security;
revoke all on table public.coin_autopay_wages from public, anon, authenticated, service_role;

create table if not exists public.coin_autopay_highest_periods (
	section_id uuid not null,
	period_start date not null,
	evaluated_at timestamptz not null default now(),
	top_ratio numeric,
	primary key (section_id, period_start)
);
alter table public.coin_autopay_highest_periods enable row level security;
revoke all on table public.coin_autopay_highest_periods from public, anon, authenticated, service_role;

create table if not exists public.coin_autopay_highest (
	section_id uuid not null,
	period_start date not null,
	student_email text not null,
	transaction_id uuid,
	created_at timestamptz not null default now(),
	primary key (section_id, period_start, student_email)
);
alter table public.coin_autopay_highest enable row level security;
revoke all on table public.coin_autopay_highest from public, anon, authenticated, service_role;

create table if not exists public.coin_perfect_scores (
	submission_id uuid primary key references public.classroom_submissions (id) on delete cascade,
	paid boolean not null default false,
	amount numeric,
	last_transaction_id uuid,
	updated_at timestamptz not null default now()
);
alter table public.coin_perfect_scores enable row level security;
revoke all on table public.coin_perfect_scores from public, anon, authenticated, service_role;
-- ===== PART A END =====

-- ===== PART B BEGIN =====
-- ===== PART B: PERFECT SCORE =====

create or replace function public._coin_autopay_paused()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce((public._coin_setting('autopay_paused') #>> '{}')::boolean, false);
$$;
revoke all on function public._coin_autopay_paused() from public, anon, authenticated, service_role;

-- Paid if currently perfect, once. Locked on the state row, so two grading
-- writes at once cannot both pay.
create or replace function public._coin_perfect_score_sync(p_submission_id uuid, p_run bigint default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_sub public.classroom_submissions;
	v_state public.coin_perfect_scores;
	v_out numeric;
	v_eligible boolean := false;
	v_amount numeric;
	v_row public.coin_transactions;
	v_rev jsonb;
begin
	if public._coin_autopay_paused() then
		return 'paused';
	end if;
	select * into v_sub from public.classroom_submissions s where s.id = p_submission_id;
	if v_sub.id is null then
		return 'missing';
	end if;
	insert into public.coin_perfect_scores (submission_id) values (p_submission_id) on conflict do nothing;
	select * into v_state from public.coin_perfect_scores where submission_id = p_submission_id for update;

	v_out := public._classroom_item_out_of(v_sub.item_id);
	if v_sub.state = 'returned' and v_out is not null and v_out > 0
		and coalesce(v_sub.score, 0) - coalesce(v_sub.extra_credit, 0) >= v_out
		and exists (
			select 1 from public.classroom_postings p
			join public._coin_economy_enrollments() x on x.section_id = p.section_id and x.student_email = v_sub.student_email
			where p.item_id = v_sub.item_id and p.perfect_score_award
		) then
		v_eligible := true;
	end if;

	if v_eligible and not v_state.paid then
		v_amount := greatest(1, round(v_out / 25.0));
		v_row := public._coin_insert(v_sub.student_email, 'perfect_score_graded_work', v_amount, v_out,
			'Perfect score: ' || coalesce((select i.title from public.classroom_items i where i.id = v_sub.item_id), 'graded work') || '.',
			jsonb_build_object('submission_id', v_sub.id::text, 'item_id', v_sub.item_id::text, 'out_of', v_out,
				'autopay', 'perfect_score', 'autopay_run', p_run),
			'digital', null, 'system');
		update public.coin_perfect_scores set paid = true, amount = v_amount, last_transaction_id = v_row.id, updated_at = now()
		where submission_id = p_submission_id;
		return 'paid';
	elsif not v_eligible and v_state.paid then
		v_rev := public._coin_reverse(v_state.last_transaction_id, 'Perfect Score taken back: the score is no longer full.', 'system');
		update public.coin_perfect_scores set paid = false, updated_at = now() where submission_id = p_submission_id;
		return case when (v_rev ->> 'ok')::boolean then 'reversed' else 'cleared' end;
	end if;
	return 'unchanged';
end;
$$;
revoke all on function public._coin_perfect_score_sync(uuid, bigint) from public, anon, authenticated, service_role;

create or replace function public.classroom_set_posting_perfect_score(p_item_id uuid, p_section_id uuid, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_sub record;
begin
	if public.current_user_email() = '' then
		raise exception 'You must be signed in.';
	end if;
	if p_section_id is null or not public.classroom_manages_section(p_section_id) then
		raise exception 'That class does not exist.';
	end if;
	if p_on is null then
		return jsonb_build_object('ok', false, 'reason', 'invalid');
	end if;
	update public.classroom_postings set perfect_score_award = p_on
	where item_id = p_item_id and section_id = p_section_id;
	if not found then
		return jsonb_build_object('ok', false, 'reason', 'not_posted');
	end if;
	-- Settle every returned submission in this class now, either direction.
	for v_sub in
		select s.id from public.classroom_submissions s
		join public.classroom_enrollments e on e.student_email = s.student_email and e.section_id = p_section_id
		where s.item_id = p_item_id and (s.state = 'returned' or exists (
			select 1 from public.coin_perfect_scores ps where ps.submission_id = s.id and ps.paid))
	loop
		begin
			perform public._coin_perfect_score_sync(v_sub.id);
		exception when others then
			raise warning 'perfect score sync failed for %: %', v_sub.id, sqlerrm;
		end;
	end loop;
	return jsonb_build_object('ok', true, 'item_id', p_item_id, 'section_id', p_section_id, 'on', p_on);
end;
$$;
revoke all on function public.classroom_set_posting_perfect_score(uuid, uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.classroom_set_posting_perfect_score(uuid, uuid, boolean) to authenticated;

-- The toggles for one item, for the sections the caller manages.
create or replace function public.classroom_posting_perfect_scores(p_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(jsonb_agg(jsonb_build_object(
			'section_id', p.section_id,
			'label', public._coin_classroom_section_label(p.section_id),
			'on', p.perfect_score_award,
			'economy_on', s.coin_economy_on,
			'out_of', public._classroom_item_out_of(p_item_id))
		order by public._coin_classroom_section_label(p.section_id)), '[]'::jsonb)
	from public.classroom_postings p
	join public.classroom_sections s on s.id = p.section_id
	where p.item_id = p_item_id and public.classroom_manages_section(p.section_id);
$$;
revoke all on function public.classroom_posting_perfect_scores(uuid) from public, anon, authenticated, service_role;
grant execute on function public.classroom_posting_perfect_scores(uuid) to authenticated;
-- ===== PART B END =====

-- ===== PART C BEGIN =====
-- ===== PART C: GRADING =====
--
-- 0171's body, with three changes and nothing else:
--   1. a stored direct_score is the score of record (rubric sum ignored), and
--      a direct score lets an item with no rubric be graded at all;
--   2. stored extra credit never drops below what the student bought;
--   3. after the write, Perfect Score is settled (best effort: a coin problem
--      may never fail a grade).
-- Same signature, so no drop: create or replace keeps its OID and grants.

create or replace function public.classroom_grade_submission(
	p_item_id uuid,
	p_student_email text,
	p_scores jsonb,
	p_comment text,
	p_return boolean,
	p_criterion_comments jsonb,
	p_extra_credit numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_student_email, '')));
	v_criteria jsonb;
	v_crit jsonb;
	v_score numeric := 0;
	v_value jsonb;
	v_missing text[] := '{}';
	v_uncommented text[] := '{}';
	v_key text;
	v_known text[] := '{}';
	v_given numeric;
	v_on_level boolean;
	v_note text;
	v_comments jsonb := '{}'::jsonb;
	v_n integer;
	v_k integer;
	v_now timestamptz := now();
	v_state text;
	v_extra numeric;
	v_direct numeric;
	v_sub_id uuid;
	v_bought numeric := 0;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'A student email is required.';
	end if;
	if not exists (
		select 1 from public.classroom_items i
		where i.id = p_item_id and i.kind = 'assignment'
	) then
		raise exception 'That assignment does not exist.';
	end if;
	if not public.classroom_can_review_submission(p_item_id, v_email) then
		raise exception 'Only a teacher of record for this student''s class can grade this.';
	end if;

	select s.id, s.direct_score into v_sub_id, v_direct
	from public.classroom_submissions s
	where s.item_id = p_item_id and s.student_email = v_email;

	select r.criteria into v_criteria from public.classroom_rubrics r where r.item_id = p_item_id;
	if v_criteria is null and v_direct is null then
		raise exception 'Create a rubric for this assignment before grading.';
	end if;
	if p_scores is null or jsonb_typeof(p_scores) <> 'object' then
		raise exception 'Scores must be an object keyed by rubric criterion id.';
	end if;
	if p_criterion_comments is not null and jsonb_typeof(p_criterion_comments) not in ('object', 'null') then
		raise exception 'Criterion comments must be an object keyed by rubric criterion id.';
	end if;

	if p_extra_credit is not null then
		if p_extra_credit < 0 then
			raise exception 'Extra credit cannot be negative. To lower a score, score the rubric criteria lower.';
		end if;
		if p_extra_credit > 10000 then
			raise exception 'Extra credit must be 10000 or less.';
		end if;
	end if;

	if v_criteria is not null then
		for v_n in 0 .. jsonb_array_length(v_criteria) - 1 loop
			v_crit := v_criteria->v_n;
			v_key := v_crit->>'id';
			v_known := v_known || v_key;
			v_value := p_scores->v_key;
			v_note := nullif(btrim(coalesce(p_criterion_comments->>v_key, '')), '');
			if char_length(coalesce(v_note, '')) > 1000 then
				raise exception 'The comment on "%" is too long (1000 characters max).', v_crit->>'criterion';
			end if;

			if v_value is null or jsonb_typeof(v_value) = 'null' then
				v_missing := v_missing || v_key;
				if v_note is not null then
					v_comments := v_comments || jsonb_build_object(v_key, v_note);
				end if;
				continue;
			end if;

			if jsonb_typeof(v_value) <> 'number' then
				raise exception 'The score for "%" must be a number.', v_crit->>'criterion';
			end if;
			v_given := (p_scores->>v_key)::numeric;
			if v_given < 0 or v_given > (v_crit->>'points')::numeric then
				raise exception 'The score for "%" must be between 0 and %.',
					v_crit->>'criterion', v_crit->>'points';
			end if;
			v_score := v_score + v_given;

			v_on_level := false;
			if jsonb_typeof(v_crit->'levels') = 'array' then
				for v_k in 0 .. jsonb_array_length(v_crit->'levels') - 1 loop
					if jsonb_typeof(v_crit->'levels'->v_k->'points') = 'number'
						and (v_crit->'levels'->v_k->>'points')::numeric = v_given then
						v_on_level := true;
						exit;
					end if;
				end loop;
			end if;
			if not v_on_level and v_note is null then
				v_uncommented := v_uncommented || v_key;
			end if;
			if v_note is not null then
				v_comments := v_comments || jsonb_build_object(v_key, v_note);
			end if;
		end loop;
	end if;

	for v_key in select jsonb_object_keys(p_scores) loop
		if v_key <> all (v_known) then
			raise exception 'Score key "%" is not a rubric criterion.', v_key;
		end if;
	end loop;
	if p_criterion_comments is not null and jsonb_typeof(p_criterion_comments) = 'object' then
		for v_key in select jsonb_object_keys(p_criterion_comments) loop
			if v_key <> all (v_known) then
				raise exception 'Comment key "%" is not a rubric criterion.', v_key;
			end if;
		end loop;
	end if;

	if array_length(v_uncommented, 1) is not null then
		return jsonb_build_object('ok', false, 'reason', 'override_needs_comment', 'missing', to_jsonb(v_uncommented));
	end if;
	-- A DIRECT SCORE IS A COMPLETE SCORE: the rubric need not be filled in.
	if p_return and v_direct is null and array_length(v_missing, 1) is not null then
		return jsonb_build_object('ok', false, 'reason', 'incomplete_scores', 'missing', to_jsonb(v_missing));
	end if;

	if p_extra_credit is null then
		select s.extra_credit into v_extra
		from public.classroom_submissions s
		where s.item_id = p_item_id and s.student_email = v_email;
	else
		v_extra := p_extra_credit;
	end if;

	-- BOUGHT POINTS STAY. A grader's extra credit can raise them, never remove them.
	if v_sub_id is not null then
		v_bought := public._coin_purchased_extra_credit(v_sub_id);
		if v_bought > 0 and coalesce(v_extra, 0) < v_bought then
			v_extra := v_bought;
		end if;
	end if;

	if v_direct is not null then
		v_score := v_direct;
	end if;
	v_score := v_score + coalesce(v_extra, 0);

	insert into public.classroom_submissions
		(item_id, student_email, rubric_scores, criterion_comments, score, extra_credit,
		 teacher_comment, graded_by, graded_at, updated_at)
	values (p_item_id, v_email, p_scores, v_comments, v_score, v_extra,
		nullif(btrim(coalesce(p_comment, '')), ''), public.current_user_email(), v_now, v_now)
	on conflict (item_id, student_email) do update
		set rubric_scores = excluded.rubric_scores,
			criterion_comments = excluded.criterion_comments,
			score = excluded.score,
			extra_credit = excluded.extra_credit,
			teacher_comment = excluded.teacher_comment,
			graded_by = excluded.graded_by,
			graded_at = v_now,
			updated_at = v_now
	returning id into v_sub_id;

	if p_return then
		update public.classroom_submissions
		set state = 'returned', returned_at = v_now, updated_at = v_now
		where item_id = p_item_id and student_email = v_email;
	end if;

	select s.state into v_state
	from public.classroom_submissions s
	where s.item_id = p_item_id and s.student_email = v_email;

	-- PERFECT SCORE, BEST EFFORT. Instrumentation-grade: a coin failure can
	-- never undo a grade, and the nightly run settles anything missed here.
	begin
		perform public._coin_perfect_score_sync(v_sub_id);
	exception when others then
		raise warning 'perfect score sync failed for %: %', v_sub_id, sqlerrm;
	end;

	return jsonb_build_object(
		'ok', true, 'score', v_score, 'state', v_state, 'extra_credit', v_extra, 'direct_score', v_direct
	);
end;
$$;

-- "Score out of N", typed. p_score null clears a direct score and the rubric
-- sum is the score again. Then the ONE grading rule runs.
create or replace function public.classroom_grade_direct(
	p_item_id uuid,
	p_student_email text,
	p_score numeric,
	p_comment text,
	p_return boolean,
	p_extra_credit numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_student_email, '')));
	v_out numeric;
	v_scores jsonb;
	v_comments jsonb;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if not exists (select 1 from public.classroom_items i where i.id = p_item_id and i.kind = 'assignment') then
		raise exception 'That assignment does not exist.';
	end if;
	if not public.classroom_can_review_submission(p_item_id, v_email) then
		raise exception 'Only a teacher of record for this student''s class can grade this.';
	end if;
	v_out := public._classroom_item_out_of(p_item_id);
	if p_score is not null then
		if v_out is null or v_out <= 0 then
			return jsonb_build_object('ok', false, 'reason', 'no_total');
		end if;
		if p_score < 0 or p_score > v_out then
			return jsonb_build_object('ok', false, 'reason', 'out_of_range', 'out_of', v_out);
		end if;
	end if;

	insert into public.classroom_submissions (item_id, student_email, direct_score, updated_at)
	values (p_item_id, v_email, p_score, now())
	on conflict (item_id, student_email) do update set direct_score = excluded.direct_score;

	select coalesce(s.rubric_scores, '{}'::jsonb), s.criterion_comments into v_scores, v_comments
	from public.classroom_submissions s where s.item_id = p_item_id and s.student_email = v_email;
	if not exists (select 1 from public.classroom_rubrics r where r.item_id = p_item_id) then
		v_scores := '{}'::jsonb;
		v_comments := null;
	end if;

	return public.classroom_grade_submission(p_item_id, v_email, v_scores, p_comment,
		coalesce(p_return, false), v_comments, p_extra_credit) || jsonb_build_object('out_of', v_out);
end;
$$;
revoke all on function public.classroom_grade_direct(uuid, text, numeric, text, boolean, numeric)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_grade_direct(uuid, text, numeric, text, boolean, numeric) to authenticated;
-- ===== PART C END =====

-- ===== PART D BEGIN =====
-- ===== PART D: AUTOPAY =====

create or replace function public._coin_week_start(p_day date)
returns date
language sql
immutable
set search_path = ''
as $$
	select p_day - (extract(isodow from p_day)::integer - 1);
$$;
revoke all on function public._coin_week_start(date) from public, anon, authenticated, service_role;

-- Does a Monday-to-Sunday week pay? Not when it is on the no-pay list, and not
-- when it starts after the last day of the school year.
create or replace function public._coin_week_pays(p_week date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select not exists (
			select 1 from jsonb_array_elements_text(coalesce(public._coin_setting('no_pay_weeks'), '[]'::jsonb)) w
			where w::date = p_week)
		and (public._coin_setting('no_pay_after') is null
			or p_week <= (public._coin_setting('no_pay_after') #>> '{}')::date);
$$;
revoke all on function public._coin_week_pays(date) from public, anon, authenticated, service_role;

create or replace function public._coin_autopay_wages(p_run bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_today date := public._coin_la_today();
	v_start date := public._coin_week_start(coalesce((public._coin_setting('autopay_start') #>> '{}')::date, v_today));
	v_week date;
	v_cand record;
	v_base numeric;
	v_tier integer;
	v_row public.coin_transactions;
	v_n integer := 0;
begin
	select c.amount into v_base from public.coin_categories c where c.id = 'weekly_wage' and c.active;
	if v_base is null then
		return 0;
	end if;
	v_week := v_start;
	while v_week + 6 < v_today loop
		if public._coin_week_pays(v_week) then
			for v_cand in
				select distinct x.student_email
				from public._coin_economy_enrollments() x
				where public._coin_la_today(x.enrolled_at) <= v_week + 6
					and not exists (select 1 from public.coin_autopay_wages w
						where w.student_email = x.student_email and w.week_start = v_week)
			loop
				insert into public.coin_autopay_wages (student_email, week_start)
				values (v_cand.student_email, v_week)
				on conflict do nothing;
				if found then
					select greatest(coalesce(t.tier, 1), 1) into v_tier from public.coin_wage_tiers t
					where t.student_email = v_cand.student_email;
					v_tier := greatest(coalesce(v_tier, 1), 1);
					v_row := public._coin_insert(v_cand.student_email, 'weekly_wage', round(v_base * v_tier, 2), null,
						'Weekly wage, week of ' || to_char(v_week, 'FMMonth FMDD, YYYY') || '.',
						jsonb_build_object('autopay', 'weekly_wage', 'week_start', v_week, 'wage_tier', v_tier,
							'base_amount', v_base, 'autopay_run', p_run),
						'digital', null, 'system');
					update public.coin_autopay_wages set transaction_id = v_row.id
					where student_email = v_cand.student_email and week_start = v_week;
					v_n := v_n + 1;
				end if;
			end loop;
		end if;
		v_week := v_week + 7;
	end loop;
	return v_n;
end;
$$;
revoke all on function public._coin_autopay_wages(bigint) from public, anon, authenticated, service_role;

-- One student's grade in one class up to a day: (sum of score minus extra
-- credit) over (sum of out-of), over their returned work this semester.
create or replace function public._coin_section_grade_ratio(p_section_id uuid, p_email text, p_until date, p_sem jsonb)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
	select case when sum(o.out_of) > 0 then sum(o.earned) / sum(o.out_of) end
	from (
		select coalesce(s.score, 0) - coalesce(s.extra_credit, 0) as earned,
			public._classroom_item_out_of(s.item_id) as out_of
		from public.classroom_submissions s
		join public.classroom_postings p on p.item_id = s.item_id and p.section_id = p_section_id
		where s.student_email = p_email and s.state = 'returned'
			and public._coin_la_today(s.returned_at) <= p_until
			and public._coin_item_day(s.item_id) between (p_sem ->> 'start')::date and (p_sem ->> 'end')::date
	) o
	where o.out_of is not null and o.out_of > 0;
$$;
revoke all on function public._coin_section_grade_ratio(uuid, text, date, jsonb) from public, anon, authenticated, service_role;

create or replace function public._coin_autopay_highest(p_run bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_today date := public._coin_la_today();
	v_weeks integer := greatest(coalesce((public._coin_setting('highest_grade_weeks') #>> '{}')::integer, 2), 1);
	v_anchor date := public._coin_week_start(coalesce((public._coin_setting('highest_grade_anchor') #>> '{}')::date, v_today));
	v_start date := public._coin_week_start(coalesce((public._coin_setting('autopay_start') #>> '{}')::date, v_today));
	v_amount numeric;
	v_p date;
	v_end date;
	v_any_pays boolean;
	v_w date;
	v_sem jsonb;
	v_sec record;
	v_top numeric;
	v_win record;
	v_row public.coin_transactions;
	v_n integer := 0;
begin
	select c.amount into v_amount from public.coin_categories c where c.id = 'highest_grade_weekly' and c.active;
	if v_amount is null then
		return 0;
	end if;
	v_p := v_anchor;
	while v_p + v_weeks * 7 - 1 < v_today loop
		v_end := v_p + v_weeks * 7 - 1;
		if v_end >= v_start then
			v_any_pays := false;
			v_w := v_p;
			while v_w <= v_end loop
				if public._coin_week_pays(v_w) then
					v_any_pays := true;
				end if;
				v_w := v_w + 7;
			end loop;
			v_sem := public._coin_semester_of(v_end);
			if v_any_pays and v_sem is not null then
				for v_sec in
					select s.id from public.classroom_sections s
					where s.active and s.coin_economy_on
						and not exists (select 1 from public.coin_autopay_highest_periods h
							where h.section_id = s.id and h.period_start = v_p)
				loop
					insert into public.coin_autopay_highest_periods (section_id, period_start)
					values (v_sec.id, v_p) on conflict do nothing;
					if not found then
						continue;
					end if;
					select max(g.ratio) into v_top
					from (select public._coin_section_grade_ratio(v_sec.id, x.student_email, v_end, v_sem) as ratio
						from public._coin_economy_enrollments() x where x.section_id = v_sec.id) g;
					update public.coin_autopay_highest_periods set top_ratio = v_top
					where section_id = v_sec.id and period_start = v_p;
					if v_top is null then
						continue;
					end if;
					for v_win in
						select x.student_email from public._coin_economy_enrollments() x
						where x.section_id = v_sec.id
							and public._coin_section_grade_ratio(v_sec.id, x.student_email, v_end, v_sem) = v_top
					loop
						insert into public.coin_autopay_highest (section_id, period_start, student_email)
						values (v_sec.id, v_p, v_win.student_email) on conflict do nothing;
						if found then
							v_row := public._coin_insert(v_win.student_email, 'highest_grade_weekly', v_amount, null,
								'Highest grade in ' || coalesce(public._coin_classroom_section_label(v_sec.id), 'your class')
									|| ', ' || to_char(v_p, 'FMMon FMDD') || ' to ' || to_char(v_end, 'FMMon FMDD') || '.',
								jsonb_build_object('autopay', 'highest_grade', 'section_id', v_sec.id::text,
									'period_start', v_p, 'period_end', v_end, 'ratio', round(v_top, 4), 'autopay_run', p_run),
								'digital', null, 'system');
							update public.coin_autopay_highest set transaction_id = v_row.id
							where section_id = v_sec.id and period_start = v_p and student_email = v_win.student_email;
							v_n := v_n + 1;
						end if;
					end loop;
				end loop;
			end if;
		end if;
		v_p := v_p + v_weeks * 7;
	end loop;
	return v_n;
end;
$$;
revoke all on function public._coin_autopay_highest(bigint) from public, anon, authenticated, service_role;

create or replace function public._coin_autopay_perfect(p_run bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_sub record;
	v_out text;
	v_n integer := 0;
begin
	for v_sub in
		select s.id from public.classroom_submissions s
		where (s.state = 'returned' and exists (
				select 1 from public.classroom_postings p where p.item_id = s.item_id and p.perfect_score_award))
			or exists (select 1 from public.coin_perfect_scores ps where ps.submission_id = s.id and ps.paid)
	loop
		begin
			v_out := public._coin_perfect_score_sync(v_sub.id, p_run);
			if v_out in ('paid', 'reversed') then
				v_n := v_n + 1;
			end if;
		exception when others then
			raise warning 'perfect score sync failed for %: %', v_sub.id, sqlerrm;
		end;
	end loop;
	return v_n;
end;
$$;
revoke all on function public._coin_autopay_perfect(bigint) from public, anon, authenticated, service_role;

-- THE ONE ENTRY POINT. Throttled: a run that started under two minutes ago is
-- not repeated (an admin's own press always runs). Concurrent calls queue on
-- one advisory lock rather than racing, and every key is unique anyway.
create or replace function public.coin_autopay_run(p_trigger text default 'page')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_admin boolean := public.is_admin();
	v_trigger text := case when lower(coalesce(p_trigger, '')) in ('nightly', 'page', 'admin')
		then lower(p_trigger) else 'page' end;
	v_run bigint;
	v_wages integer;
	v_highest integer;
	v_perfect integer;
	v_result jsonb;
begin
	if v_trigger = 'admin' and not v_admin then
		v_trigger := 'page';
	end if;
	if public._coin_autopay_paused() then
		return jsonb_build_object('ok', true, 'ran', false, 'reason', 'paused');
	end if;
	if not pg_try_advisory_xact_lock(hashtext('coin_autopay_run')) then
		return jsonb_build_object('ok', true, 'ran', false, 'reason', 'busy');
	end if;
	if v_trigger <> 'admin' and exists (select 1 from public.coin_autopay_runs r
		where r.started_at > now() - interval '2 minutes') then
		return jsonb_build_object('ok', true, 'ran', false, 'reason', 'recent');
	end if;

	insert into public.coin_autopay_runs (trigger) values (v_trigger) returning id into v_run;
	v_wages := public._coin_autopay_wages(v_run);
	v_highest := public._coin_autopay_highest(v_run);
	v_perfect := public._coin_autopay_perfect(v_run);
	v_result := jsonb_build_object('wages', v_wages, 'highest_grade', v_highest, 'perfect_score', v_perfect);
	update public.coin_autopay_runs set finished_at = now(), result = v_result where id = v_run;
	return jsonb_build_object('ok', true, 'ran', true, 'run_id', v_run) || v_result;
end;
$$;
revoke all on function public.coin_autopay_run(text) from public, anon, authenticated, service_role;
grant execute on function public.coin_autopay_run(text) to anon, authenticated;

-- The Coin Desk's "Autopay runs" list: every automatic row of the last few
-- weeks, grouped by run, each with its own reversal state. Admin only.
create or replace function public.coin_autopay_recent(p_days integer default 21)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if not public.is_admin() then
		raise exception 'Only site admins can read autopay runs.';
	end if;
	return jsonb_build_object(
		'paused', public._coin_autopay_paused(),
		'runs', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'trigger', r.trigger,
				'started_at', r.started_at, 'finished_at', r.finished_at, 'result', r.result) order by r.id desc)
			from (select * from public.coin_autopay_runs order by id desc limit 30) r), '[]'::jsonb),
		'rows', coalesce((select jsonb_agg(jsonb_build_object(
				'id', t.id, 'at', t.created_at, 'email', t.student_email,
				'name', coalesce(ros.display_name, t.student_email),
				'category_id', t.category_id, 'category', c.name, 'amount', t.amount, 'note', t.note,
				'run_id', t.meta -> 'autopay_run', 'reversed', public._coin_is_reversed(t.id))
				order by t.created_at desc, t.id desc)
			from public.coin_transactions t
			join public.coin_categories c on c.id = t.category_id
			left join public._coin_public_roster() ros on ros.student_email = t.student_email
			where t.actor_email = 'system' and t.category_id <> 'reversal'
				and t.created_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 21), 120)))
		), '[]'::jsonb)
	);
end;
$$;
revoke all on function public.coin_autopay_recent(integer) from public, anon, authenticated, service_role;
grant execute on function public.coin_autopay_recent(integer) to authenticated;
-- ===== PART D END =====

do $chk$
declare
	v_n integer;
begin
	select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_grade_submission';
	if v_n <> 2 then
		raise exception '0242: expected exactly 2 arities of classroom_grade_submission, found %.', v_n;
	end if;
	if has_function_privilege('anon', 'public.classroom_grade_direct(uuid, text, numeric, text, boolean, numeric)', 'execute') then
		raise exception '0242: anon must not execute classroom_grade_direct.';
	end if;
	if has_function_privilege('anon', 'public.classroom_set_posting_perfect_score(uuid, uuid, boolean)', 'execute') then
		raise exception '0242: anon must not execute the Perfect Score toggle.';
	end if;
	raise notice '0242: direct scores, the Perfect Score toggle and autopay are in place. Autopay pays nothing until it runs.';
end
$chk$;
