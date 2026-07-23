-- 0057_greenline_community_tracks.sql
-- GREENLINE community tracks (Bundle 4a): publish, browse, report, rate, and
-- per-attempt race telemetry for tracks authored in the track builder.
--
-- Four tables + RPCs, following the repo's established scoping:
--
--   greenline_tracks          : published tracks. Any signed-in user may READ
--       non-removed rows (plus their own removed rows, and teachers all rows);
--       there is NO client write path at all. The ONLY insert path is the
--       SvelteKit publish endpoint (/api/greenline-track-publish) using the
--       server-only service-role key, because authoritative validation runs
--       the game's REAL parseTrack / buildRuntime / surfaceState / LapTracker
--       code paths (TypeScript, src/lib/greenline/builder/validate.ts), which
--       cannot execute inside Postgres and must not be re-implemented in SQL.
--       A client-callable publish RPC would be a validation bypass, so none
--       exists. author_name is stamped server-side from profiles at publish
--       time, never client-submitted.
--
--   greenline_track_reports   : one report per (track, reporter), enforced by
--       the primary key. Recording only — a report never hides or removes
--       anything automatically; tracks.report_count is bumped in the same
--       transaction, only when the insert is genuinely new.
--
--   greenline_track_ratings   : 1-5 stars, one row per (track, user), upsert
--       so a user CHANGES their rating rather than adding a second row.
--       Gated server-side on a COMPLETED attempt on that track (read from
--       greenline_track_attempts, never self-reported).
--
--   greenline_track_attempts  : one row per race attempt on a published
--       track — the raw source of truth telemetry is DERIVED from (completion
--       rate, average time, unique racers, average wall violations), never a
--       pre-aggregated counter, so there is no read-modify-write race under
--       concurrent writers and the aggregate set can grow without a schema
--       change. Aggregation happens in the greenline_track_list RPC (the
--       gauntlet_leaderboards / greenline_leaderboard pattern: SECURITY
--       DEFINER read past RLS, board-safe columns only). An attempt row is
--       opened at race start and closed at finish/quit; a row whose
--       finished_at stays null is an abandoned run, distinguishable from both
--       a completed one (completed = true) and an explicit failure
--       (finished, completed = false).
--
-- All writes go through SECURITY DEFINER RPCs that pin the actor to
-- auth.uid() (the gauntlet_submit / greenline_submit_race_result doctrine);
-- direct client INSERT/UPDATE/DELETE is granted nowhere.
--
-- Apply manually in the Supabase SQL editor, after 0056.

-- ===========================================================================
-- 1. Published tracks
-- ===========================================================================
create table if not exists public.greenline_tracks (
	id uuid primary key default gen_random_uuid(),
	author_id uuid not null references auth.users (id) on delete cascade,
	-- Display name snapshot from profiles at publish time (server-stamped).
	author_name text not null,
	name text not null check (char_length(name) between 1 and 60),
	-- The full validated TrackData (schema v2), exactly as it passed the
	-- server-side validation run. The game re-parses it through parseTrack on
	-- read, so a row can never crash a client even if the schema evolves.
	data jsonb not null,
	-- Approximate lap length in meters, computed server-side at publish from
	-- the validated centerline (display only; the runtime never reads it).
	length_m numeric,
	-- Bundle 4b flips this via a teacher RPC; 4a only stores the default.
	featured boolean not null default false,
	-- Soft removal (author or teacher). Removed rows stay for history/audit;
	-- the read policy and the list RPC hide them from everyone but the author
	-- and teachers.
	removed boolean not null default false,
	-- Bumped by greenline_track_report inside the same transaction as a
	-- genuinely-new report row (the reports table is the source of truth; this
	-- is the cheap read the moderation view sorts by).
	report_count integer not null default 0,
	created_at timestamptz not null default now()
);

create index if not exists greenline_tracks_browse_idx
	on public.greenline_tracks (removed, featured desc, created_at desc);

revoke all on public.greenline_tracks from anon, authenticated;
grant select on public.greenline_tracks to authenticated;

alter table public.greenline_tracks enable row level security;

drop policy if exists "select visible greenline tracks" on public.greenline_tracks;
create policy "select visible greenline tracks"
	on public.greenline_tracks
	for select
	to authenticated
	using (not removed or author_id = (select auth.uid()) or public.is_teacher());

-- No INSERT/UPDATE/DELETE policies or grants: publish is the service-role
-- endpoint, removal is the RPC below.

-- ===========================================================================
-- 2. Reports (one per track per reporter)
-- ===========================================================================
create table if not exists public.greenline_track_reports (
	track_id uuid not null references public.greenline_tracks (id) on delete cascade,
	reporter_id uuid not null references auth.users (id) on delete cascade,
	created_at timestamptz not null default now(),
	primary key (track_id, reporter_id)
);

revoke all on public.greenline_track_reports from anon, authenticated;
grant select on public.greenline_track_reports to authenticated;

alter table public.greenline_track_reports enable row level security;

drop policy if exists "select own greenline track reports" on public.greenline_track_reports;
create policy "select own greenline track reports"
	on public.greenline_track_reports
	for select
	to authenticated
	using (reporter_id = (select auth.uid()) or public.is_teacher());

-- ===========================================================================
-- 3. Ratings (one per track per user, changeable)
-- ===========================================================================
create table if not exists public.greenline_track_ratings (
	track_id uuid not null references public.greenline_tracks (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	rating integer not null check (rating between 1 and 5),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	primary key (track_id, user_id)
);

revoke all on public.greenline_track_ratings from anon, authenticated;
grant select on public.greenline_track_ratings to authenticated;

alter table public.greenline_track_ratings enable row level security;

-- Ratings are public reads (any signed-in user), like the leaderboard.
drop policy if exists "select greenline track ratings" on public.greenline_track_ratings;
create policy "select greenline track ratings"
	on public.greenline_track_ratings
	for select
	to authenticated
	using (true);

-- ===========================================================================
-- 4. Race attempts (raw telemetry, one row per attempt)
-- ===========================================================================
create table if not exists public.greenline_track_attempts (
	id uuid primary key default gen_random_uuid(),
	track_id uuid not null references public.greenline_tracks (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	completed boolean not null default false,
	-- Total race time in ms, only meaningful when completed (client-reported
	-- game-clock time, the greenline_race_results trust model; started_at /
	-- finished_at give the server's own wall-clock bracket beside it).
	completion_time_ms integer,
	-- Soft-wall violation count for the run (client-reported at finish/quit).
	wall_violations integer,
	started_at timestamptz not null default now(),
	-- Null = the run was never closed (abandoned tab / crash): counted as a
	-- non-completion by the aggregates, distinguishable from an explicit fail.
	finished_at timestamptz
);

create index if not exists greenline_track_attempts_track_idx
	on public.greenline_track_attempts (track_id);
create index if not exists greenline_track_attempts_user_idx
	on public.greenline_track_attempts (user_id, started_at desc);

revoke all on public.greenline_track_attempts from anon, authenticated;
grant select on public.greenline_track_attempts to authenticated;

alter table public.greenline_track_attempts enable row level security;

drop policy if exists "select own greenline track attempts" on public.greenline_track_attempts;
create policy "select own greenline track attempts"
	on public.greenline_track_attempts
	for select
	to authenticated
	using (user_id = (select auth.uid()) or public.is_teacher());

-- ===========================================================================
-- Write RPCs (SECURITY DEFINER, actor pinned to auth.uid())
-- ===========================================================================

-- Report a track. Idempotent per (track, reporter): the first call records the
-- report and bumps the count; repeats are a clean no-op that reports back
-- already = true. Never hides or removes anything.
create or replace function public.greenline_track_report(p_track_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_new boolean := false;
	v_count integer;
begin
	if v_uid is null then
		raise exception 'Not authenticated';
	end if;
	if not exists (
		select 1 from public.greenline_tracks t where t.id = p_track_id and not t.removed
	) then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;

	insert into public.greenline_track_reports (track_id, reporter_id)
	values (p_track_id, v_uid)
	on conflict (track_id, reporter_id) do nothing;
	v_new := found;

	if v_new then
		update public.greenline_tracks
			set report_count = report_count + 1
			where id = p_track_id
			returning report_count into v_count;
	else
		select report_count into v_count from public.greenline_tracks where id = p_track_id;
	end if;

	return jsonb_build_object('ok', true, 'already', not v_new, 'report_count', v_count);
end;
$$;

revoke all on function public.greenline_track_report(uuid) from public;
grant execute on function public.greenline_track_report(uuid) to authenticated;

-- Remove (soft) a track: the author at any time, or any teacher. Returns
-- whether a row was removed. Never deletes rows, ratings, reports, attempts,
-- or leaderboard history — visibility only.
create or replace function public.greenline_track_remove(p_track_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
begin
	if v_uid is null then
		raise exception 'Not authenticated';
	end if;
	update public.greenline_tracks t
		set removed = true
		where t.id = p_track_id
			and not t.removed
			and (t.author_id = v_uid or public.is_teacher());
	return found;
end;
$$;

revoke all on function public.greenline_track_remove(uuid) from public;
grant execute on function public.greenline_track_remove(uuid) to authenticated;

-- Rate a track 1-5. Upsert on (track, user) so a re-rate CHANGES the existing
-- row. Gated on the caller having at least one COMPLETED attempt on the track,
-- read from greenline_track_attempts — never self-reported.
create or replace function public.greenline_track_rate(p_track_id uuid, p_rating integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
begin
	if v_uid is null then
		raise exception 'Not authenticated';
	end if;
	if p_rating is null or p_rating < 1 or p_rating > 5 then
		return jsonb_build_object('ok', false, 'reason', 'bad_rating');
	end if;
	if not exists (
		select 1 from public.greenline_tracks t where t.id = p_track_id and not t.removed
	) then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if not exists (
		select 1 from public.greenline_track_attempts a
		where a.track_id = p_track_id and a.user_id = v_uid and a.completed
	) then
		return jsonb_build_object('ok', false, 'reason', 'no_completed_attempt');
	end if;

	insert into public.greenline_track_ratings (track_id, user_id, rating, updated_at)
	values (p_track_id, v_uid, p_rating, now())
	on conflict (track_id, user_id) do update
		set rating = excluded.rating, updated_at = now();

	return jsonb_build_object('ok', true, 'rating', p_rating);
end;
$$;

revoke all on function public.greenline_track_rate(uuid, integer) from public;
grant execute on function public.greenline_track_rate(uuid, integer) to authenticated;

-- Open an attempt row at race start. Called by the race flow itself (the
-- /greenline route, when a community track launches), not by any user-facing
-- "claim a result" surface; the id it returns is what the finish call closes.
create or replace function public.greenline_track_attempt_start(p_track_id uuid)
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
	if not exists (
		select 1 from public.greenline_tracks t where t.id = p_track_id and not t.removed
	) then
		raise exception 'Unknown track';
	end if;
	insert into public.greenline_track_attempts (track_id, user_id)
	values (p_track_id, v_uid)
	returning id into v_id;
	return v_id;
end;
$$;

revoke all on function public.greenline_track_attempt_start(uuid) from public;
grant execute on function public.greenline_track_attempt_start(uuid) to authenticated;

-- Close an attempt (finish or explicit fail/quit). Only the attempt's own
-- opener may close it, exactly once: a second call finds no open row and
-- returns false. Completion time is stored only for completed runs.
create or replace function public.greenline_track_attempt_finish(
	p_attempt_id uuid,
	p_completed boolean,
	p_time_ms integer default null,
	p_wall_violations integer default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
begin
	if v_uid is null then
		raise exception 'Not authenticated';
	end if;
	update public.greenline_track_attempts a
		set completed = coalesce(p_completed, false),
			completion_time_ms = case when coalesce(p_completed, false) then p_time_ms end,
			wall_violations = p_wall_violations,
			finished_at = now()
		where a.id = p_attempt_id
			and a.user_id = v_uid
			and a.finished_at is null;
	return found;
end;
$$;

revoke all on function public.greenline_track_attempt_finish(uuid, boolean, integer, integer) from public;
grant execute on function public.greenline_track_attempt_finish(uuid, boolean, integer, integer) to authenticated;

-- ===========================================================================
-- Read RPC: the browse list with derived telemetry (one round trip)
-- ===========================================================================
-- Every aggregate is computed from the raw ratings/attempts tables at query
-- time (the "no pre-aggregated counters" rule; report_count is the one
-- deliberate exception, documented above). Board-safe columns only. The
-- caller-specific fields (my_rating, can_rate, reported, mine) let the browse
-- UI render its whole state from this single call.
create or replace function public.greenline_track_list()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with visible as (
	select t.*
	from public.greenline_tracks t
	where not t.removed
),
rating_agg as (
	select r.track_id, avg(r.rating)::numeric(4, 2) as avg_rating, count(*) as rating_count
	from public.greenline_track_ratings r
	group by r.track_id
),
attempt_agg as (
	select
		a.track_id,
		count(*) as attempt_count,
		count(*) filter (where a.completed) as completed_count,
		count(distinct a.user_id) as unique_racers,
		avg(a.completion_time_ms) filter (where a.completed and a.completion_time_ms is not null)
			as avg_time_ms,
		avg(a.wall_violations) filter (where a.wall_violations is not null)
			as avg_wall_violations
	from public.greenline_track_attempts a
	group by a.track_id
)
select coalesce(
	jsonb_agg(jsonb_build_object(
		'id', v.id,
		'name', v.name,
		'author_name', v.author_name,
		'created_at', v.created_at,
		'featured', v.featured,
		'length_m', v.length_m,
		'report_count', v.report_count,
		'avg_rating', ra.avg_rating,
		'rating_count', coalesce(ra.rating_count, 0),
		'attempt_count', coalesce(aa.attempt_count, 0),
		'completed_count', coalesce(aa.completed_count, 0),
		'unique_racers', coalesce(aa.unique_racers, 0),
		'avg_time_ms', round(aa.avg_time_ms),
		'avg_wall_violations', round(aa.avg_wall_violations, 1),
		'mine', v.author_id = (select auth.uid()),
		'my_rating', (
			select r.rating from public.greenline_track_ratings r
			where r.track_id = v.id and r.user_id = (select auth.uid())
		),
		'can_rate', exists (
			select 1 from public.greenline_track_attempts a
			where a.track_id = v.id and a.user_id = (select auth.uid()) and a.completed
		),
		'reported', exists (
			select 1 from public.greenline_track_reports rp
			where rp.track_id = v.id and rp.reporter_id = (select auth.uid())
		)
	) order by v.featured desc, v.created_at desc),
	'[]'::jsonb
)
from visible v
left join rating_agg ra on ra.track_id = v.id
left join attempt_agg aa on aa.track_id = v.id;
$$;

revoke all on function public.greenline_track_list() from public;
grant execute on function public.greenline_track_list() to authenticated;
