-- 0029_gauntlet_drop_tiers.sql
-- IDEA // GAUNTLET: remove the Speedrun "tier" concept entirely.
--
-- Tier (T1..T4) was per-challenge site data stored in the public prompt JSONB
-- (prompt->>'tier'); it was never a column. It duplicated the 1..5 difficulty
-- and grouped the Speedrun records board. We are collapsing standings to XP and
-- a flat per-drawing records list, so tier is dropped:
--
--   1. gauntlet_leaderboards() no longer selects, returns, or orders by tier.
--      The Speedrun records come back ordered by difficulty then title (the same
--      within-tier order as before, just without the tier partition).
--   2. Existing challenges have the now-dead prompt->>'tier' key stripped, so no
--      row silently carries a tier after this migration.
--
-- Nothing else changes: XP, the per-challenge board, scoring, and the density
-- material gate (0027) are untouched. Apply manually in the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- 1. Recreate the leaderboards RPC without tier (0024 verbatim otherwise).
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_leaderboards(p_limit integer default 100)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with per_user as (
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
			'par_time', par_time,
			'best_time', best_time,
			'user_id', user_id,
			'display_name', display_name,
			'full_name', full_name,
			'avatar', avatar,
			'avatar_url', avatar_url
		) order by difficulty asc, title asc), '[]'::jsonb) from sr)
);
$$;

revoke all on function public.gauntlet_leaderboards(integer) from public;
grant execute on function public.gauntlet_leaderboards(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Strip the dead tier key from every challenge prompt.
-- ---------------------------------------------------------------------------
update public.challenges
set prompt = prompt - 'tier'
where prompt ? 'tier';
