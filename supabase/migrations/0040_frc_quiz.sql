-- 0040_frc_quiz.sql
-- FRC knowledge-gate quiz: the server-authoritative attempt log + grading.
--
-- One table serves both the ATTEMPT LOG (item 3: per user + unit, timestamp,
-- score, pass/fail) and the in-flight attempt state. The answer key for an
-- in-flight attempt lives in the `sealed` column and is NEVER exposed to the
-- client: no client SELECT grant on `sealed`, and grading happens inside a
-- SECURITY DEFINER RPC that reads it and returns only the result. Selection and
-- option shuffling happen in the SvelteKit endpoint (server, from the server-
-- only bank); the endpoint stores the sealed key via `frc_quiz_start` and
-- grades via `frc_quiz_grade`.
--
-- Access model mirrors the existing pattern (0001 / 0039): a student reads and
-- (via the definer RPCs) inserts/finalizes their OWN attempts; teachers read
-- all. Direct client writes are revoked; all writes go through the RPCs.
--
-- Everything fails soft on the web side until this is applied: the unit quiz
-- endpoint and the page load swallow the missing-table/function error and the
-- unit falls back to its description-only Gate.
--
-- Apply manually in the Supabase SQL editor.

create table if not exists public.frc_quiz_attempts (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users (id) on delete cascade,
	unit_id text not null,
	started_at timestamptz not null default now(),
	submitted_at timestamptz,
	status text not null default 'in_progress'
		check (status in ('in_progress', 'passed', 'failed')),
	score integer,
	pass_percent integer not null,
	-- Server-held answer key for the served questions: a jsonb array of
	-- {"c": <correct shuffled index>, "o": <objective tag>}. PRIVATE: no client
	-- SELECT grant below, so it never reaches the browser.
	sealed jsonb not null
);

create index if not exists frc_quiz_attempts_user_unit_idx
	on public.frc_quiz_attempts (user_id, unit_id, submitted_at desc);

-- Column-level SELECT: the student may read the LOG columns of their own
-- attempts, but NOT `sealed` (the answer key) or `pass_percent`. Writes go only
-- through the definer RPCs, so no insert/update/delete grant.
revoke all on public.frc_quiz_attempts from anon, authenticated;
grant select (id, user_id, unit_id, started_at, submitted_at, status, score)
	on public.frc_quiz_attempts to authenticated;

alter table public.frc_quiz_attempts enable row level security;

-- SELECT: own attempts.
drop policy if exists "frc quiz select own" on public.frc_quiz_attempts;
create policy "frc quiz select own"
	on public.frc_quiz_attempts
	for select
	to authenticated
	using (user_id = (select auth.uid()));

-- SELECT: teachers read all.
drop policy if exists "frc quiz select teacher" on public.frc_quiz_attempts;
create policy "frc quiz select teacher"
	on public.frc_quiz_attempts
	for select
	to authenticated
	using (public.is_teacher());

-- ---------------------------------------------------------------------------
-- Start: persist a new in-flight attempt with its sealed key. Abandons any
-- prior in-flight attempt for this unit (an unsubmitted attempt is not a fail,
-- so it must not affect the cooldown streak). Cooldown is enforced by the
-- server endpoint (using the tunable track.ts schedule) BEFORE calling this.
-- ---------------------------------------------------------------------------
create or replace function public.frc_quiz_start(
	p_unit_id text,
	p_sealed jsonb,
	p_pass_percent integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_id uuid;
	v_started timestamptz;
begin
	if v_uid is null then
		return jsonb_build_object('error', 'unauthorized');
	end if;

	delete from public.frc_quiz_attempts
	where user_id = v_uid and unit_id = p_unit_id and status = 'in_progress';

	insert into public.frc_quiz_attempts (user_id, unit_id, sealed, pass_percent)
	values (v_uid, p_unit_id, p_sealed, p_pass_percent)
	returning id, started_at into v_id, v_started;

	return jsonb_build_object('attempt_id', v_id, 'started_at', v_started);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grade: compare the submitted answers to the sealed key, finalize the attempt,
-- and return only the result (score, pass, missed objective tags). Never
-- returns the key. Mirrors gradeAttempt() in quiz-engine.ts.
-- ---------------------------------------------------------------------------
create or replace function public.frc_quiz_grade(
	p_attempt_id uuid,
	p_answers integer[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_sealed jsonb;
	v_pass integer;
	v_total integer;
	v_correct integer := 0;
	v_missed text[] := '{}';
	v_score integer;
	v_passed boolean;
	i integer;
	v_c integer;
	v_o text;
begin
	if v_uid is null then
		return jsonb_build_object('error', 'unauthorized');
	end if;

	select sealed, pass_percent into v_sealed, v_pass
	from public.frc_quiz_attempts
	where id = p_attempt_id and user_id = v_uid and status = 'in_progress'
	for update;

	if not found then
		return jsonb_build_object('error', 'no_attempt');
	end if;

	v_total := jsonb_array_length(v_sealed);
	for i in 0 .. v_total - 1 loop
		v_c := (v_sealed -> i ->> 'c')::integer;
		v_o := v_sealed -> i ->> 'o';
		-- p_answers is 1-indexed in SQL; the client sends position-aligned indices.
		if coalesce(p_answers[i + 1], -1) = v_c then
			v_correct := v_correct + 1;
		else
			v_missed := v_missed || v_o;
		end if;
	end loop;

	v_score := round(100.0 * v_correct / greatest(v_total, 1));
	v_passed := v_score >= v_pass;

	update public.frc_quiz_attempts
	set status = case when v_passed then 'passed' else 'failed' end,
		score = v_score,
		submitted_at = now()
	where id = p_attempt_id;

	return jsonb_build_object(
		'passed', v_passed,
		'score', v_score,
		'missed', (select coalesce(jsonb_agg(distinct m), '[]'::jsonb) from unnest(v_missed) m)
	);
end;
$$;

revoke all on function public.frc_quiz_start(text, jsonb, integer) from public;
grant execute on function public.frc_quiz_start(text, jsonb, integer) to authenticated;
revoke all on function public.frc_quiz_grade(uuid, integer[]) from public;
grant execute on function public.frc_quiz_grade(uuid, integer[]) to authenticated;
