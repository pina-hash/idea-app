-- 0049_greenline_accounts.sql
-- GREENLINE: real Supabase-backed accounts for the combat-racing prototype.
-- Two concerns, each following a pattern already proven elsewhere in the repo:
--
--   1. greenline_loadouts  : a player's saved build (archetype + one part per
--      slot). A pure SELF-write, owner-scoped exactly like vanguard_saves
--      (0002): one mutable row per user, client select/insert/update, RLS
--      restricts every row to its owner. Nothing here is forgeable or
--      cross-user (a build only affects its owner's own vehicle), so a direct
--      client write under owner RLS is the correct, convention-matching path,
--      NOT an RPC. The garage's localStorage save (greenline_loadout key)
--      stays as the offline fallback; this gives it something real to sync to.
--
--   2. greenline_race_results + the leaderboard : follows GAUNTLET's read/write
--      scoping (0024 / gauntlet_submit). Writes go ONLY through the
--      SECURITY DEFINER RPC greenline_submit_race_result, which stamps
--      user_id = auth.uid() and created_at server-side so a client can never
--      forge attribution or target another player (the "block direct client
--      inserts where appropriate" guidance). Reads go through the
--      SECURITY DEFINER RPC greenline_leaderboard, which aggregates every
--      player's results past RLS and returns board-safe columns only (display
--      name + avatar, never emails), exactly like gauntlet_leaderboards runs
--      with owner privileges so the whole board is visible to any signed-in
--      user. The append-only results log is otherwise owner-select only.
--
-- Auth is the portal's existing Google OAuth + profiles model (0001); this
-- migration adds no auth path of its own. Both track_id and archetype/part ids
-- are free-form text (the profiles.section_id doctrine): the track catalog and
-- the loadout parts pool live in code (src/lib/greenline/*), so they can change
-- without a schema migration, and the leaderboard is track-aware without ever
-- assuming a single track.
--
-- Apply manually in the Supabase SQL editor.

-- ===========================================================================
-- 1. Saved loadouts (one row per user, owner-scoped self-write)
-- ===========================================================================
create table if not exists public.greenline_loadouts (
	user_id uuid primary key references auth.users (id) on delete cascade,
	-- Archetype id (armor | velocity | handling | systems). Free-form text, no
	-- CHECK: the archetype catalog lives in code and can grow without a migration.
	archetype text not null,
	-- Equipped part id per slot: { plating, drivetrain, tires, systems }. jsonb
	-- so the parts pool stays a code concern; the client validates/fails-soft on
	-- unknown ids (parseLoadout in src/lib/greenline/loadout.ts).
	parts jsonb not null default '{}'::jsonb,
	updated_at timestamptz not null default now()
);

-- Privileges: users create and maintain their own loadout, so clients get
-- select/insert/update. Row access is owner-only by RLS. No delete (a loadout
-- is overwritten, not removed; rows cascade from auth.users).
revoke all on public.greenline_loadouts from anon, authenticated;
grant select, insert, update on public.greenline_loadouts to authenticated;

alter table public.greenline_loadouts enable row level security;

drop policy if exists "select own greenline loadout" on public.greenline_loadouts;
create policy "select own greenline loadout"
	on public.greenline_loadouts
	for select
	to authenticated
	using (user_id = (select auth.uid()));

drop policy if exists "insert own greenline loadout" on public.greenline_loadouts;
create policy "insert own greenline loadout"
	on public.greenline_loadouts
	for insert
	to authenticated
	with check (user_id = (select auth.uid()));

drop policy if exists "update own greenline loadout" on public.greenline_loadouts;
create policy "update own greenline loadout"
	on public.greenline_loadouts
	for update
	to authenticated
	using (user_id = (select auth.uid()))
	with check (user_id = (select auth.uid()));

-- ===========================================================================
-- 2. Race results (append-only, track-aware) + leaderboard RPCs
-- ===========================================================================
create table if not exists public.greenline_race_results (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users (id) on delete cascade,
	created_at timestamptz not null default now(),
	-- Which track (TrackData.id, e.g. 'proving-ground-07'). Free-form text so the
	-- track catalog stays a code concern; the board never assumes one track.
	track_id text not null,
	-- Game mode. RACE is the ranked mode this board serves, but the schema does
	-- not assume a single mode (elimination and future modes can log here too).
	mode text not null default 'race',
	-- Finishing position in that race's field (1 = won). Per-race context; the
	-- cross-player global ranking is total_time_ms, not this.
	finish_position integer,
	-- Total race time and best single lap, in milliseconds (lower is better).
	total_time_ms integer,
	best_lap_ms integer,
	-- Laps run (gives finish_position meaning) and the build used (board flavor).
	laps integer,
	archetype text
);

-- The leaderboard's ranking access path: best time per track+mode.
create index if not exists greenline_race_results_board_idx
	on public.greenline_race_results (track_id, mode, total_time_ms);
-- A user's own results, newest first.
create index if not exists greenline_race_results_user_idx
	on public.greenline_race_results (user_id, created_at desc);

-- Privileges: NO client insert. Results are written only by the definer RPC
-- below (GAUNTLET's grading shape), so attribution cannot be forged. Clients may
-- select their own rows (owner RLS); the whole board is read via the definer
-- leaderboard RPC. No update/delete: the log is append-only.
revoke all on public.greenline_race_results from anon, authenticated;
grant select on public.greenline_race_results to authenticated;

alter table public.greenline_race_results enable row level security;

drop policy if exists "select own greenline results" on public.greenline_race_results;
create policy "select own greenline results"
	on public.greenline_race_results
	for select
	to authenticated
	using (user_id = (select auth.uid()));

-- No INSERT/UPDATE/DELETE policies: the only write path is the RPC.

-- ---------------------------------------------------------------------------
-- Write path: submit a finished race. SECURITY DEFINER so it can insert past
-- the no-insert RLS while binding the row to the caller. user_id and created_at
-- are stamped server-side (auth.uid() / now()); the client cannot set them, so
-- a result can never be attributed to another player. The metric values are
-- client-reported (this is a client-side game with no server sim, the same
-- supervised-trust reality as GAUNTLET's manual submits) but ownership is not.
-- Returns the new row id.
-- ---------------------------------------------------------------------------
create or replace function public.greenline_submit_race_result(
	p_track_id text,
	p_mode text default 'race',
	p_finish_position integer default null,
	p_total_time_ms integer default null,
	p_best_lap_ms integer default null,
	p_laps integer default null,
	p_archetype text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_id uuid;
begin
	if v_uid is null then
		raise exception 'Not authenticated';
	end if;
	if p_track_id is null or length(trim(p_track_id)) = 0 then
		raise exception 'A track id is required';
	end if;

	insert into public.greenline_race_results (
		user_id, track_id, mode, finish_position,
		total_time_ms, best_lap_ms, laps, archetype
	)
	values (
		v_uid,
		trim(p_track_id),
		coalesce(nullif(trim(p_mode), ''), 'race'),
		p_finish_position,
		p_total_time_ms,
		p_best_lap_ms,
		p_laps,
		p_archetype
	)
	returning id into v_id;

	return v_id;
end;
$$;

revoke all on function public.greenline_submit_race_result(text, text, integer, integer, integer, integer, text) from public;
grant execute on function public.greenline_submit_race_result(text, text, integer, integer, integer, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Read path: the track leaderboard. SECURITY DEFINER, in the spirit of
-- gauntlet_leaderboards (0024): it aggregates every player's results past RLS
-- and returns board-safe columns only. One row per player: their best (fastest
-- total time) run on the given track+mode, that run's finishing position /
-- laps / build, plus their overall best single lap on the track. Ranked by
-- total time ascending (ties to the earliest holder), rank() so ties share a
-- rank. Any signed-in user may read it, the same visibility as GAUNTLET boards.
-- ---------------------------------------------------------------------------
create or replace function public.greenline_leaderboard(
	p_track_id text,
	p_mode text default 'race',
	p_limit integer default 100
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with filtered as (
	select r.*
	from public.greenline_race_results r
	where r.track_id = p_track_id
		and r.mode = coalesce(nullif(trim(p_mode), ''), 'race')
),
best_run as (
	-- Fastest completed run per player (their leaderboard entry).
	select distinct on (f.user_id)
		f.user_id, f.finish_position, f.total_time_ms, f.laps, f.archetype, f.created_at
	from filtered f
	where f.total_time_ms is not null
	order by f.user_id, f.total_time_ms asc, f.created_at asc
),
best_lap as (
	-- True best single lap across ALL of the player's runs on the track.
	select f.user_id, min(f.best_lap_ms) as best_lap_ms
	from filtered f
	where f.best_lap_ms is not null
	group by f.user_id
),
ranked as (
	select
		b.user_id,
		b.finish_position,
		b.total_time_ms,
		b.laps,
		b.archetype,
		bl.best_lap_ms,
		p.display_name, p.full_name, p.avatar, p.avatar_url,
		rank() over (order by b.total_time_ms asc, b.created_at asc) as rank
	from best_run b
	join public.profiles p on p.id = b.user_id
	left join best_lap bl on bl.user_id = b.user_id
	order by rank asc
	limit greatest(coalesce(p_limit, 100), 1)
)
select coalesce(
	jsonb_agg(jsonb_build_object(
		'user_id', user_id,
		'display_name', display_name,
		'full_name', full_name,
		'avatar', avatar,
		'avatar_url', avatar_url,
		'archetype', archetype,
		'finish_position', finish_position,
		'total_time_ms', total_time_ms,
		'best_lap_ms', best_lap_ms,
		'laps', laps,
		'rank', rank
	) order by rank asc),
	'[]'::jsonb
)
from ranked;
$$;

revoke all on function public.greenline_leaderboard(text, text, integer) from public;
grant execute on function public.greenline_leaderboard(text, text, integer) to authenticated;
