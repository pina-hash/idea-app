-- 0021_gauntlet_progression.sql
-- Dopamine + retention layer, the data side: ONE read-only RPC returning the
-- calling user's progression aggregates, derived entirely from the existing
-- submissions/challenges tables. Nothing new is writable by clients, so XP,
-- streaks, and badges cannot be forged: every number is recomputed from the
-- graded submissions that only the grading RPCs can insert.
--
-- The XP model, streak walk (with its one-missed-day grace), level curve, and
-- badge definitions live in src/lib/gauntlet/progression.ts; this function
-- only supplies the raw aggregates. Everything is distinct-based (distinct
-- challenges attempted/cleared, distinct practice days), so re-submitting the
-- same challenge repeatedly earns nothing (no farming, no pressure).
--
-- SECURITY DEFINER because two aggregates peek at the hidden `answer` column
-- (sub-par and dead-on checks); only booleans/counters derived from it are
-- returned, never answer contents, and every aggregate is scoped to
-- auth.uid()'s own submissions.
--
-- Apply manually in the Supabase SQL editor.

create or replace function public.gauntlet_progression()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with subs as (
	select s.*
	from public.submissions s
	where s.user_id = (select auth.uid())
),
best as (
	-- The user's best submission per challenge (same ordering as the board).
	select distinct on (challenge_id) challenge_id, mode, is_correct, score_metric
	from subs
	order by challenge_id, is_correct desc nulls last, score_metric asc nulls last, created_at asc
),
pub as (
	select id, mode, prompt from public.challenges where published
),
per_mode as (
	select
		p.mode::text as mode,
		count(*) as total,
		count(b.challenge_id) as attempted,
		count(*) filter (where b.is_correct) as cleared
	from pub p
	left join best b on b.challenge_id = p.id
	group by p.mode
),
days as (
	-- Distinct practice days in the school's timezone, newest first.
	select distinct (created_at at time zone 'America/Los_Angeles')::date as d
	from subs
)
select jsonb_build_object(
	'attempted_ids',
		(select coalesce(jsonb_agg(challenge_id), '[]'::jsonb) from best),
	'cleared_ids',
		(select coalesce(jsonb_agg(challenge_id), '[]'::jsonb) from best where is_correct),
	'per_mode',
		(select coalesce(
			jsonb_object_agg(mode, jsonb_build_object(
				'total', total, 'attempted', attempted, 'cleared', cleared)),
			'{}'::jsonb) from per_mode),
	'practice_days',
		(select coalesce(jsonb_agg(to_char(d, 'YYYY-MM-DD') order by d desc), '[]'::jsonb)
			from (select d from days order by d desc limit 400) recent),
	'today',
		to_char((now() at time zone 'America/Los_Angeles')::date, 'YYYY-MM-DD'),
	'macro_clears',
		(select count(*) from subs where source = 'macro' and is_correct),
	'sub_par_clears',
		-- Speedrun clears at or under the challenge's par time.
		(select count(*)
			from subs s
			join pub p on p.id = s.challenge_id
			where s.mode = 'speedrun'
				and s.is_correct
				and s.score_metric is not null
				and (p.prompt ->> 'par_time') ~ '^[0-9.]+$'
				and s.score_metric <= (p.prompt ->> 'par_time')::numeric),
	'dead_on',
		-- Any modeling clear landing within HALF the allowed tolerance
		-- (volume for macro runs, mass for supervised manual runs).
		(select exists (
			select 1
			from subs s
			join public.challenges c on c.id = s.challenge_id
			where s.is_correct
				and s.mode in ('speedrun', 'reverse_engineer', 'feature_golf')
				and (c.answer ->> 'tolerance_pct') ~ '^[0-9.]+$'
				and (
					((s.value ->> 'volume_mm3') ~ '^[0-9.]+$'
						and (c.answer ->> 'target_volume_mm3') ~ '^[0-9.]+$'
						and abs((s.value ->> 'volume_mm3')::numeric - (c.answer ->> 'target_volume_mm3')::numeric)
							<= (c.answer ->> 'target_volume_mm3')::numeric * (c.answer ->> 'tolerance_pct')::numeric / 200.0)
					or
					((s.value ->> 'mass') ~ '^[0-9.]+$'
						and (c.answer ->> 'target_mass') ~ '^[0-9.]+$'
						and abs((s.value ->> 'mass')::numeric - (c.answer ->> 'target_mass')::numeric)
							<= (c.answer ->> 'target_mass')::numeric * (c.answer ->> 'tolerance_pct')::numeric / 200.0)
				)
		))
);
$$;

revoke all on function public.gauntlet_progression() from public;
grant execute on function public.gauntlet_progression() to authenticated;
