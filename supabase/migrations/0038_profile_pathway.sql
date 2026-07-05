-- 0038_profile_pathway.sql
-- Bosco Tech pathways: every student is identified by their pathway.
--
-- Adds `pathway` to profiles: one of the six Bosco Tech pathways
-- (IDEA, ACE, BMET, CSEE, MSET, MAT), or null until the student picks it in
-- the first-login picker on the web side. Pathway is IDENTITY AND ATTRIBUTION
-- ONLY, never an access gate: no policy, guard, grading path, or route may
-- consult it to grant or deny anything.
--
-- Modeled like `role` (text + CHECK, the 0001 profiles convention, so adding
-- a future pathway is a constraint edit, not a type migration). NO new
-- policies or grants are needed:
--   * students set their own pathway through the existing "update own
--     profile" policy (same trust level as display_name / section_id);
--   * teachers see and change any student's pathway through the existing
--     "teachers select/update any profile" policies (the dashboard roster).
-- Role derivation is untouched: role_for_email (0001) already maps
-- @boscotech.edu -> teacher and @boscotech.net -> student regardless of
-- pathway, and the enforce_role_change guard still owns the role column.
--
-- Also recreates gauntlet_leaderboards() (last defined in 0029) with the
-- players' pathway in both boards, so standings attribute each student by
-- pathway. Board-safe by design, like avatars (0020): identity, not private
-- data. Everything fails soft on the web side until this is applied.
--
-- Apply manually in the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- 1. The pathway column (nullable; null = not chosen yet).
-- ---------------------------------------------------------------------------
alter table public.profiles
	add column if not exists pathway text;

alter table public.profiles
	drop constraint if exists profiles_pathway_check;
alter table public.profiles
	add constraint profiles_pathway_check
	check (pathway is null or pathway in ('IDEA', 'ACE', 'BMET', 'CSEE', 'MSET', 'MAT'));

-- ---------------------------------------------------------------------------
-- 2. Recreate the leaderboards RPC with pathway (0029 verbatim otherwise).
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
		p.display_name, p.full_name, p.avatar, p.avatar_url, p.pathway,
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
		rp.display_name, rp.full_name, rp.avatar, rp.avatar_url, rp.pathway
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
			'pathway', pathway,
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
			'avatar_url', avatar_url,
			'pathway', pathway
		) order by difficulty asc, title asc), '[]'::jsonb) from sr)
);
$$;

revoke all on function public.gauntlet_leaderboards(integer) from public;
grant execute on function public.gauntlet_leaderboards(integer) to authenticated;
