-- 0033_gauntlet_speedrun_attempts.sql
--
-- Persist EVERY Speedrun attempt server-side, including completed, failed, and
-- started-but-abandoned/timed-out runs, plus a per-user history the site reads.
--
-- Design (additive and non-invasive): the two existing core writes already
-- describe the whole lifecycle, so we mirror them into a durable attempts table
-- via triggers rather than editing the grading RPCs:
--   * gauntlet_run_tokens gains run_id + started_at when the Start macro fires
--     (0016) -> AFTER trigger logs an 'in_progress' attempt (the START).
--   * a graded run inserts into submissions (macro or manual) -> AFTER trigger
--     reconciles that attempt to 'passed' / 'failed' (the FINISH).
--   * an 'in_progress' attempt whose run token expired with no finish is an
--     ABANDONED / timed-out run, derived in the history view (no cron needed).
--
-- CRITICAL: both triggers swallow all exceptions (EXCEPTION WHEN OTHERS), so a
-- logging bug can NEVER abort the grading transaction that fired them. The worst
-- case is a missing/imperfect history row, never a broken run.
--
-- Idempotent (create ... if not exists / create or replace / drop ... if exists).

-- ---------------------------------------------------------------------------
-- 1. The attempts table. run_id is the natural key for a lifecycle (start ->
--    finish); manual submissions with no token get a standalone row (run_id null).
-- ---------------------------------------------------------------------------
create table if not exists public.gauntlet_speedrun_attempts (
	id uuid primary key default gen_random_uuid(),
	run_id uuid,
	user_id uuid not null references auth.users (id) on delete cascade,
	challenge_id uuid not null references public.challenges (id) on delete cascade,
	series_id uuid,
	room_id uuid,
	elapsed_ms bigint,
	result text not null default 'in_progress'
		check (result in ('in_progress', 'passed', 'failed', 'abandoned')),
	expires_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create unique index if not exists gauntlet_speedrun_attempts_run_idx
	on public.gauntlet_speedrun_attempts (run_id) where run_id is not null;
create index if not exists gauntlet_speedrun_attempts_user_idx
	on public.gauntlet_speedrun_attempts (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. START: a run token that just got a run_id + started_at (the Start macro).
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_attempt_from_token()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
	v_mode public.gauntlet_mode;
	v_series uuid;
begin
	if new.run_id is null or new.started_at is null then
		return new;
	end if;
	select mode, series_id into v_mode, v_series
	from public.challenges where id = new.challenge_id;
	if v_mode is distinct from 'speedrun' then
		return new;
	end if;
	insert into public.gauntlet_speedrun_attempts
		(run_id, user_id, challenge_id, series_id, room_id, result, expires_at, created_at, updated_at)
	values
		(new.run_id, new.user_id, new.challenge_id, v_series, new.room_id, 'in_progress',
		 new.expires_at, coalesce(new.started_at, now()), now())
	on conflict (run_id) where run_id is not null do nothing;
	return new;
exception when others then
	return new; -- logging must never break the run flow
end;
$$;

drop trigger if exists gauntlet_attempt_start on public.gauntlet_run_tokens;
create trigger gauntlet_attempt_start
	after insert or update on public.gauntlet_run_tokens
	for each row execute function public.gauntlet_attempt_from_token();

-- ---------------------------------------------------------------------------
-- 3. FINISH: a graded Speedrun submission (macro or manual). score_metric is the
--    elapsed SECONDS for Speedrun, so elapsed_ms = score_metric * 1000.
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_attempt_from_submission()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
	v_run uuid;
	v_series uuid;
	v_elapsed bigint;
	v_result text;
begin
	if new.mode is distinct from 'speedrun' then
		return new;
	end if;
	v_result := case when new.is_correct then 'passed' else 'failed' end;
	v_elapsed := case when new.score_metric is not null
		then round(new.score_metric * 1000)::bigint else null end;

	-- The started run token this submission belongs to (latest, matching room).
	select t.run_id into v_run
	from public.gauntlet_run_tokens t
	where t.user_id = new.user_id
		and t.challenge_id = new.challenge_id
		and t.started_at is not null
		and t.room_id is not distinct from new.room_id
	order by t.started_at desc
	limit 1;

	select series_id into v_series from public.challenges where id = new.challenge_id;

	insert into public.gauntlet_speedrun_attempts
		(run_id, user_id, challenge_id, series_id, room_id, elapsed_ms, result, created_at, updated_at)
	values
		(v_run, new.user_id, new.challenge_id, v_series, new.room_id, v_elapsed, v_result, now(), now())
	on conflict (run_id) where run_id is not null do update
		set result = excluded.result,
			elapsed_ms = coalesce(excluded.elapsed_ms, public.gauntlet_speedrun_attempts.elapsed_ms),
			series_id = coalesce(public.gauntlet_speedrun_attempts.series_id, excluded.series_id),
			updated_at = now();
	return new;
exception when others then
	return new; -- logging must never break grading
end;
$$;

drop trigger if exists gauntlet_attempt_finish on public.submissions;
create trigger gauntlet_attempt_finish
	after insert on public.submissions
	for each row execute function public.gauntlet_attempt_from_submission();

-- ---------------------------------------------------------------------------
-- 4. Optional explicit logger (SECURITY DEFINER), for a client to record an
--    outcome the triggers cannot see (e.g. marking a run abandoned from the UI).
--    Writes only for auth.uid(); never trusts a passed-in user.
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_log_speedrun_attempt(
	p_challenge_id uuid,
	p_run_id uuid default null,
	p_result text default 'abandoned',
	p_elapsed_ms bigint default null,
	p_room_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_series uuid;
begin
	if auth.uid() is null then
		raise exception 'Sign in to log an attempt.';
	end if;
	if p_result not in ('in_progress', 'passed', 'failed', 'abandoned') then
		raise exception 'Invalid result %', p_result;
	end if;
	select series_id into v_series from public.challenges where id = p_challenge_id;
	insert into public.gauntlet_speedrun_attempts
		(run_id, user_id, challenge_id, series_id, room_id, elapsed_ms, result, created_at, updated_at)
	values
		(p_run_id, auth.uid(), p_challenge_id, v_series, p_room_id, p_elapsed_ms, p_result, now(), now())
	on conflict (run_id) where run_id is not null do update
		set result = excluded.result,
			elapsed_ms = coalesce(excluded.elapsed_ms, public.gauntlet_speedrun_attempts.elapsed_ms),
			updated_at = now();
end;
$$;

grant execute on function public.gauntlet_log_speedrun_attempt(uuid, uuid, text, bigint, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Access: read own attempts (teachers read all), never write directly (the
--    triggers / definer RPC are the only writers). The history view resolves
--    the effective result (abandoned) and joins titles; security_invoker so the
--    base-table RLS still scopes each reader to their own rows.
-- ---------------------------------------------------------------------------
alter table public.gauntlet_speedrun_attempts enable row level security;
revoke all on public.gauntlet_speedrun_attempts from anon, authenticated;
grant select on public.gauntlet_speedrun_attempts to authenticated;

drop policy if exists "read own attempts" on public.gauntlet_speedrun_attempts;
create policy "read own attempts" on public.gauntlet_speedrun_attempts
	for select using (user_id = (select auth.uid()) or public.is_teacher());

create or replace view public.gauntlet_speedrun_attempt_history
with (security_invoker = true) as
select
	a.id,
	a.run_id,
	a.user_id,
	a.challenge_id,
	c.title as challenge_title,
	a.series_id,
	s.name as series_name,
	a.room_id,
	a.elapsed_ms,
	case
		when a.result = 'in_progress' and a.expires_at is not null and a.expires_at < now()
			then 'abandoned'
		else a.result
	end as result,
	a.created_at
from public.gauntlet_speedrun_attempts a
join public.challenges c on c.id = a.challenge_id
left join public.gauntlet_series s on s.id = a.series_id;

grant select on public.gauntlet_speedrun_attempt_history to authenticated;
