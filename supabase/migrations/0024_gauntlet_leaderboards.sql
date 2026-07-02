-- 0024_gauntlet_leaderboards.sql
-- IDEA // GAUNTLET: the overall leaderboard, the data side. ONE read-only RPC,
-- in the exact spirit of gauntlet_progression (0021): everything is derived from
-- the existing graded submissions, so nothing is forgeable (only the grading RPCs
-- can insert submissions). It returns two boards in one payload:
--
--   overall  : every player ranked by total XP, computed the SAME way the dojo's
--              own progression does (distinct challenges attempted + cleared +
--              distinct practice days). XP constants MIRROR
--              src/lib/gauntlet/progression.ts (XP_PER_ATTEMPT=15,
--              XP_PER_CLEAR=120, XP_PER_PRACTICE_DAY=20); keep them in lock-step,
--              and the client derives the level/name via levelFromXp(). Ties share
--              a rank (rank() window), broken by cleared then attempted.
--   speedrun : one row per PUBLISHED Speedrun challenge (drawing) with the record
--              holder, i.e. the fastest passing run, read from the existing
--              gauntlet_leaderboard view (which already restricts modeling boards
--              to passing macro runs and breaks time ties by created_at, so rank 1
--              is the earliest holder of the fastest time). Left-joined from the
--              challenge list so drawings with no record yet come back with a null
--              holder (clean empty state). The client groups these by tier.
--
-- Board-safe columns only: display name + avatar (avatars are non-sensitive by
-- design, they render on public leaderboards, see 0020), never emails or answers.
-- SECURITY DEFINER so it can aggregate every player's submissions and read their
-- profile names/avatars past RLS, exactly like the gauntlet_leaderboard view runs
-- with owner privileges. Any signed-in user (student or teacher) may read it, the
-- same visibility as the per-challenge board.
--
-- Apply manually in the Supabase SQL editor.

create or replace function public.gauntlet_leaderboards(p_limit integer default 100)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with per_user as (
	-- Distinct-based aggregates per player (same definitions as gauntlet_progression).
	select
		s.user_id,
		count(distinct s.challenge_id) as attempted,
		count(distinct s.challenge_id) filter (where s.is_correct) as cleared,
		least(count(distinct (s.created_at at time zone 'America/Los_Angeles')::date), 400) as practice_days
	from public.submissions s
	group by s.user_id
),
scored as (
	select
		u.user_id, u.attempted, u.cleared, u.practice_days,
		(u.attempted * 15 + u.cleared * 120 + u.practice_days * 20) as xp
	from per_user u
),
ranked as (
	select
		sc.user_id, sc.attempted, sc.cleared, sc.practice_days, sc.xp,
		p.display_name, p.full_name, p.avatar, p.avatar_url,
		rank() over (order by sc.xp desc, sc.cleared desc, sc.attempted desc) as rank
	from scored sc
	join public.profiles p on p.id = sc.user_id
	where sc.xp > 0
	order by rank asc, coalesce(p.display_name, p.full_name, '') asc
	limit greatest(coalesce(p_limit, 100), 1)
),
sr as (
	-- Record per published Speedrun drawing (null holder = no record yet).
	select
		c.id as challenge_id,
		c.title,
		c.difficulty,
		c.prompt ->> 'tier' as tier,
		case when (c.prompt ->> 'par_time') ~ '^[0-9.]+$' then (c.prompt ->> 'par_time')::numeric end as par_time,
		rec.score_metric as best_time,
		rec.user_id,
		rp.display_name, rp.full_name, rp.avatar, rp.avatar_url
	from public.challenges c
	left join public.gauntlet_leaderboard rec
		on rec.challenge_id = c.id and rec.mode = 'speedrun' and rec.rank = 1
	left join public.profiles rp on rp.id = rec.user_id
	where c.mode = 'speedrun' and c.published
)
select jsonb_build_object(
	'overall',
		(select coalesce(jsonb_agg(jsonb_build_object(
			'user_id', user_id,
			'display_name', display_name,
			'full_name', full_name,
			'avatar', avatar,
			'avatar_url', avatar_url,
			'attempted', attempted,
			'cleared', cleared,
			'practice_days', practice_days,
			'xp', xp,
			'rank', rank
		) order by rank asc), '[]'::jsonb) from ranked),
	'speedrun',
		(select coalesce(jsonb_agg(jsonb_build_object(
			'challenge_id', challenge_id,
			'title', title,
			'difficulty', difficulty,
			'tier', tier,
			'par_time', par_time,
			'best_time', best_time,
			'user_id', user_id,
			'display_name', display_name,
			'full_name', full_name,
			'avatar', avatar,
			'avatar_url', avatar_url
		) order by coalesce(tier, 'ZZ') asc, difficulty asc, title asc), '[]'::jsonb) from sr)
);
$$;

revoke all on function public.gauntlet_leaderboards(integer) from public;
grant execute on function public.gauntlet_leaderboards(integer) to authenticated;
