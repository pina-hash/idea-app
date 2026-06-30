-- 0010_gauntlet_rooms.sql
-- IDEA // GAUNTLET: live synchronized rooms. A room is a host-controlled,
-- synchronized session layered over an existing mode (v1: Speedrun, single
-- round). It REUSES the existing verification and scoring: a room run is an
-- ordinary submission tagged with room_id, graded by the same token path.
--
--   * gauntlet_rooms / gauntlet_room_participants hold the session + roster.
--   * submissions and gauntlet_run_tokens gain a nullable room_id, so a room run
--     is a normal submission/token linked to its room (solo runs leave it null).
--   * Host Start sets ONE authoritative started_at and bulk-mints one token per
--     racer with reveal_at = started_at, so every racer shares one clock. The
--     drawing stays in the hidden answer column and is handed back only by
--     gauntlet_room_reveal once the room is live (gated server-side, not client).
--   * Macro runs reuse gauntlet_macro_submit unchanged except it now copies the
--     token's room_id onto the submission. Manual runs in a room go through
--     gauntlet_room_manual_submit, which computes elapsed from the room's
--     started_at (server-authoritative) and verifies on mass, like solo.
--   * Single active round lives on the room (started_at, current_challenge_id);
--     a future multi-round can reset them or move to a rounds table without
--     reworking submissions (room_id stays the link).
--
-- Apply manually in the Supabase SQL editor. Idempotent where practical.

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------
create table if not exists public.gauntlet_rooms (
	id uuid primary key default gen_random_uuid(),
	host_id uuid not null references auth.users (id) on delete cascade,
	join_code text not null unique,
	current_challenge_id uuid references public.challenges (id) on delete set null,
	state text not null default 'lobby' check (state in ('lobby', 'live', 'results')),
	-- The authoritative synchronized clock for the active round (null in lobby).
	started_at timestamptz,
	created_at timestamptz not null default now()
);

create table if not exists public.gauntlet_room_participants (
	room_id uuid not null references public.gauntlet_rooms (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	role text not null default 'racer' check (role in ('racer', 'spectator')),
	joined_at timestamptz not null default now(),
	primary key (room_id, user_id)
);

create index if not exists gauntlet_rooms_host_idx on public.gauntlet_rooms (host_id);
create index if not exists gauntlet_room_participants_user_idx
	on public.gauntlet_room_participants (user_id);

-- A room run is a normal submission / token linked to its room.
alter table public.submissions
	add column if not exists room_id uuid references public.gauntlet_rooms (id) on delete set null;
create index if not exists submissions_room_idx on public.submissions (room_id) where room_id is not null;

alter table public.gauntlet_run_tokens
	add column if not exists room_id uuid references public.gauntlet_rooms (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 2. Membership helper (security definer, so RLS does not recurse)
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.gauntlet_rooms r
		where r.id = p_room_id and r.host_id = (select auth.uid())
	) or exists (
		select 1 from public.gauntlet_room_participants p
		where p.room_id = p_room_id and p.user_id = (select auth.uid())
	);
$$;

revoke all on function public.gauntlet_is_room_member(uuid) from public;
grant execute on function public.gauntlet_is_room_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS. Rooms and roster are readable by their members (host + participants).
-- All writes go through the SECURITY DEFINER RPCs below (no write policies).
-- ---------------------------------------------------------------------------
alter table public.gauntlet_rooms enable row level security;
revoke all on public.gauntlet_rooms from anon, authenticated;
grant select on public.gauntlet_rooms to authenticated;
drop policy if exists "members read rooms" on public.gauntlet_rooms;
create policy "members read rooms" on public.gauntlet_rooms
	for select to authenticated
	using (public.gauntlet_is_room_member(id));

alter table public.gauntlet_room_participants enable row level security;
revoke all on public.gauntlet_room_participants from anon, authenticated;
grant select on public.gauntlet_room_participants to authenticated;
drop policy if exists "members read roster" on public.gauntlet_room_participants;
create policy "members read roster" on public.gauntlet_room_participants
	for select to authenticated
	using (public.gauntlet_is_room_member(room_id));

-- Members may read the room's submissions (so the live board updates over
-- Realtime for everyone). This adds to the existing own/teacher submission read
-- policies; it exposes only a co-racer's own run data, never a hidden answer.
drop policy if exists "members read room submissions" on public.submissions;
create policy "members read room submissions" on public.submissions
	for select to authenticated
	using (room_id is not null and public.gauntlet_is_room_member(room_id));

-- ---------------------------------------------------------------------------
-- 4. Room board: best passing run per racer for a room round, ranked by the
-- mode metric (Speedrun: lowest elapsed time). Owner-privileged like the global
-- leaderboard; exposes only board-safe columns. BOTH sources rank in a room
-- (manual entry counts because the host supervises and the start is server
-- authoritative). Partitioned by (room_id, challenge_id) for a future multi-round.
-- ---------------------------------------------------------------------------
create or replace view public.gauntlet_room_board as
select
	best.room_id,
	best.challenge_id,
	best.user_id,
	coalesce(p.full_name, 'Player') as player,
	best.is_correct,
	best.score_metric,
	best.source,
	best.created_at,
	rank() over (
		partition by best.room_id, best.challenge_id
		order by best.score_metric asc nulls last, best.created_at asc
	) as rank
from (
	select distinct on (s.user_id, s.room_id, s.challenge_id)
		s.user_id, s.room_id, s.challenge_id, s.is_correct, s.score_metric, s.source, s.created_at
	from public.submissions s
	where s.room_id is not null and s.is_correct = true
	order by s.user_id, s.room_id, s.challenge_id, s.score_metric asc nulls last, s.created_at asc
) best
join public.profiles p on p.id = best.user_id;

grant select on public.gauntlet_room_board to authenticated;

-- Roster with player names. Owner-privileged (like the board) so every member
-- sees names even though students cannot read each other's `profiles` rows. The
-- participants table itself is also realtime-subscribed for live roster updates.
create or replace view public.gauntlet_room_roster as
select
	pr.room_id,
	pr.user_id,
	pr.role,
	pr.joined_at,
	coalesce(p.full_name, 'Player') as player
from public.gauntlet_room_participants pr
join public.profiles p on p.id = pr.user_id;

grant select on public.gauntlet_room_roster to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Macro submit now copies the token's room_id onto the submission. Identical
-- to 0007 otherwise (multi-mode scoring preserved exactly).
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_macro_submit(
	p_code text,
	p_volume_mm3 numeric,
	p_surface_area_mm2 numeric default null,
	p_feature_count integer default null,
	p_mass_g numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_token public.gauntlet_run_tokens%rowtype;
	v_challenge public.challenges%rowtype;
	v_now timestamptz := now();
	v_elapsed_ms bigint;
	v_elapsed_s numeric;
	v_score numeric;
	v_target_vol numeric;
	v_target_area numeric;
	v_tol_pct numeric;
	v_vol_dev numeric;
	v_area_dev numeric;
	v_correct boolean;
	v_value jsonb;
	v_rank integer;
begin
	if p_code is null or length(trim(p_code)) = 0 then
		raise exception 'Missing submit code.';
	end if;
	if p_volume_mm3 is null then
		raise exception 'Missing captured volume.';
	end if;

	select * into v_token from public.gauntlet_run_tokens where code = upper(trim(p_code));
	if not found then
		raise exception 'Invalid submit code.';
	end if;
	if v_token.used_at is not null then
		raise exception 'This submit code was already used. Re-reveal in GAUNTLET to start a new run.';
	end if;
	if v_now > v_token.expires_at then
		raise exception 'This submit code has expired. Re-reveal in GAUNTLET to start a new run.';
	end if;

	select * into v_challenge from public.challenges where id = v_token.challenge_id;
	if not found then
		raise exception 'Challenge not found.';
	end if;

	v_elapsed_ms := greatest(0, (extract(epoch from (v_now - v_token.reveal_at)) * 1000)::bigint);
	v_elapsed_s := round(v_elapsed_ms::numeric / 1000.0, 2);

	v_target_vol := (v_challenge.answer ->> 'target_volume_mm3')::numeric;
	v_tol_pct := coalesce((v_challenge.answer ->> 'tolerance_pct')::numeric, 0);
	v_correct := v_target_vol is not null
		and abs(p_volume_mm3 - v_target_vol) <= v_target_vol * v_tol_pct / 100.0;

	if v_challenge.mode = 'speedrun' then
		v_score := v_elapsed_s;
	elsif v_challenge.mode = 'feature_golf' then
		v_score := p_feature_count;
	elsif v_challenge.mode = 'reverse_engineer' then
		v_target_area := (v_challenge.answer ->> 'target_surface_area_mm2')::numeric;
		if v_target_vol is not null and v_target_vol <> 0 then
			v_vol_dev := abs(p_volume_mm3 - v_target_vol) / v_target_vol * 100.0;
		end if;
		if v_target_area is not null and v_target_area <> 0 and p_surface_area_mm2 is not null then
			v_area_dev := abs(p_surface_area_mm2 - v_target_area) / v_target_area * 100.0;
		end if;
		if v_vol_dev is not null and v_area_dev is not null then
			v_score := round((v_vol_dev + v_area_dev) / 2.0, 3);
		elsif v_vol_dev is not null then
			v_score := round(v_vol_dev, 3);
		else
			v_score := null;
		end if;
	else
		raise exception 'This mode is not macro-scored.';
	end if;

	v_value := jsonb_build_object(
		'volume_mm3', p_volume_mm3,
		'surface_area_mm2', p_surface_area_mm2,
		'feature_count', p_feature_count,
		'mass_g', p_mass_g,
		'elapsed_ms', v_elapsed_ms
	);

	-- Solo runs are one-shot (re-reveal for another attempt). A room run shares
	-- the room clock, so a FAILED room run keeps the token live to retry; only a
	-- passing room run (or any solo run) consumes the token.
	if v_token.room_id is null or v_correct then
		update public.gauntlet_run_tokens
			set used_at = v_now
			where code = v_token.code and used_at is null;
		if not found then
			raise exception 'This submit code was already used. Re-reveal in GAUNTLET to start a new run.';
		end if;
	end if;

	-- room_id is the change from 0007: a room run lands as a room-tagged
	-- submission; solo runs (token.room_id is null) are unchanged.
	insert into public.submissions (user_id, challenge_id, mode, value, is_correct, score_metric, source, room_id)
	values (v_token.user_id, v_token.challenge_id, v_challenge.mode, v_value, v_correct, v_score, 'macro', v_token.room_id);

	select gl.rank into v_rank
	from public.gauntlet_leaderboard gl
	where gl.challenge_id = v_token.challenge_id and gl.user_id = v_token.user_id;

	return jsonb_build_object(
		'is_correct', v_correct,
		'mode', v_challenge.mode,
		'elapsed_ms', v_elapsed_ms,
		'score_metric', v_score,
		'rank', v_rank,
		'target_volume_mm3', v_target_vol,
		'your_volume_mm3', p_volume_mm3,
		'tolerance_pct', v_tol_pct
	);
end;
$$;

revoke all on function public.gauntlet_macro_submit(text, numeric, numeric, integer, numeric) from public;
grant execute on function public.gauntlet_macro_submit(text, numeric, numeric, integer, numeric) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Host RPCs (security definer; host-only enforced by host_id)
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_room_create()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_code text;
	v_id uuid;
begin
	if v_uid is null then raise exception 'You must be signed in.'; end if;
	if not public.is_teacher() then raise exception 'Only teachers can host rooms.'; end if;
	loop
		v_code := public.gauntlet_gen_code();
		begin
			insert into public.gauntlet_rooms (host_id, join_code) values (v_uid, v_code)
				returning id into v_id;
			exit;
		exception when unique_violation then
		end;
	end loop;
	return jsonb_build_object('id', v_id, 'join_code', v_code);
end;
$$;

create or replace function public.gauntlet_room_set_challenge(p_room_id uuid, p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_room public.gauntlet_rooms%rowtype;
	v_mode public.gauntlet_mode;
	v_published boolean;
begin
	select * into v_room from public.gauntlet_rooms where id = p_room_id;
	if not found then raise exception 'Room not found.'; end if;
	if v_room.host_id <> v_uid then raise exception 'Only the host can set the challenge.'; end if;
	if v_room.state <> 'lobby' then raise exception 'The challenge can only be set in the lobby.'; end if;
	select mode, published into v_mode, v_published from public.challenges where id = p_challenge_id;
	if not found then raise exception 'Challenge not found.'; end if;
	if v_mode <> 'speedrun' then raise exception 'Rooms support Speedrun challenges only (v1).'; end if;
	if not v_published then raise exception 'Pick a published challenge.'; end if;
	update public.gauntlet_rooms set current_challenge_id = p_challenge_id where id = p_room_id;
end;
$$;

create or replace function public.gauntlet_room_start(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_room public.gauntlet_rooms%rowtype;
	v_start timestamptz := now();
	v_expires timestamptz;
	v_racer record;
	v_code text;
begin
	select * into v_room from public.gauntlet_rooms where id = p_room_id;
	if not found then raise exception 'Room not found.'; end if;
	if v_room.host_id <> v_uid then raise exception 'Only the host can start the round.'; end if;
	if v_room.state <> 'lobby' then raise exception 'The round has already started.'; end if;
	if v_room.current_challenge_id is null then raise exception 'Pick a challenge before starting.'; end if;
	-- Re-validate the challenge is still a published Speedrun (it could have been
	-- unpublished or archived since it was selected).
	if not exists (
		select 1 from public.challenges
		where id = v_room.current_challenge_id and mode = 'speedrun' and published
	) then
		raise exception 'The selected challenge is no longer a published Speedrun. Pick another.';
	end if;
	v_expires := v_start + interval '30 minutes';

	-- One authoritative clock for the round.
	update public.gauntlet_rooms set state = 'live', started_at = v_start where id = p_room_id;

	-- Bulk-mint one token per current racer; all share reveal_at = started_at, so
	-- every racer is timed from the same instant. The roster locks here because a
	-- later joiner becomes a spectator (see gauntlet_room_join).
	for v_racer in
		select user_id from public.gauntlet_room_participants
		where room_id = p_room_id and role = 'racer'
	loop
		loop
			v_code := public.gauntlet_gen_code();
			begin
				insert into public.gauntlet_run_tokens (code, user_id, challenge_id, reveal_at, expires_at, room_id)
					values (v_code, v_racer.user_id, v_room.current_challenge_id, v_start, v_expires, p_room_id);
				exit;
			exception when unique_violation then
			end;
		end loop;
	end loop;

	return jsonb_build_object('id', p_room_id, 'state', 'live', 'started_at', v_start);
end;
$$;

create or replace function public.gauntlet_room_set_state(p_room_id uuid, p_state text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_room public.gauntlet_rooms%rowtype;
begin
	-- Going live is exclusively via gauntlet_room_start (which sets the clock and
	-- mints tokens). Restricting the target to 'results' prevents a broken live
	-- room with no started_at / no tokens.
	if p_state <> 'results' then
		raise exception 'Use Start to go live; a round can only be moved to results here.';
	end if;
	select * into v_room from public.gauntlet_rooms where id = p_room_id;
	if not found then raise exception 'Room not found.'; end if;
	if v_room.host_id <> v_uid then raise exception 'Only the host can change the room state.'; end if;
	update public.gauntlet_rooms set state = p_state where id = p_room_id;
	-- Ending the round freezes the board: retire any unused tokens for this room.
	update public.gauntlet_run_tokens set used_at = now()
		where room_id = p_room_id and used_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Member RPCs
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_room_join(p_join_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_room public.gauntlet_rooms%rowtype;
	v_role text;
begin
	if v_uid is null then raise exception 'You must be signed in.'; end if;
	select * into v_room from public.gauntlet_rooms where join_code = upper(trim(p_join_code));
	if not found then raise exception 'No room found for that code.'; end if;

	-- The host returns to their own room as host, not a participant.
	if v_room.host_id = v_uid then
		return jsonb_build_object('id', v_room.id, 'role', 'host', 'state', v_room.state);
	end if;

	-- Joining after Start makes you a spectator for the active round.
	v_role := case when v_room.state = 'lobby' then 'racer' else 'spectator' end;
	insert into public.gauntlet_room_participants (room_id, user_id, role)
		values (v_room.id, v_uid, v_role)
		on conflict (room_id, user_id) do nothing;
	-- Existing participants keep their original role.
	select role into v_role from public.gauntlet_room_participants
		where room_id = v_room.id and user_id = v_uid;
	return jsonb_build_object('id', v_room.id, 'role', v_role, 'state', v_room.state);
end;
$$;

-- Hand back the (gated) drawing + the caller's submit code once the room is live.
create or replace function public.gauntlet_room_reveal(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_room public.gauntlet_rooms%rowtype;
	v_drawing text;
	v_code text;
begin
	if v_uid is null then raise exception 'You must be signed in.'; end if;
	if not public.gauntlet_is_room_member(p_room_id) then
		raise exception 'You are not in this room.';
	end if;
	select * into v_room from public.gauntlet_rooms where id = p_room_id;
	if not found then raise exception 'Room not found.'; end if;
	-- Server-side gate: the drawing is never returned while the room is in lobby.
	if v_room.state = 'lobby' then raise exception 'The round has not started yet.'; end if;

	select c.answer ->> 'drawing' into v_drawing
		from public.challenges c where c.id = v_room.current_challenge_id;
	-- The caller's submit code, if they raced this round (null for spectators).
	select code into v_code from public.gauntlet_run_tokens
		where room_id = p_room_id and user_id = v_uid and challenge_id = v_room.current_challenge_id
		order by created_at desc limit 1;

	return jsonb_build_object('drawing', v_drawing, 'code', v_code, 'started_at', v_room.started_at);
end;
$$;

-- Manual room run: server-authoritative elapsed from the room start, verify on
-- mass within tolerance (as in solo), tag room_id, source 'manual'. Manual
-- ranks in a room because the host supervises and the start is authoritative.
create or replace function public.gauntlet_room_manual_submit(p_code text, p_mass_g numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_token public.gauntlet_run_tokens%rowtype;
	v_challenge public.challenges%rowtype;
	v_now timestamptz := now();
	v_elapsed_ms bigint;
	v_elapsed_s numeric;
	v_target numeric;
	v_tol_pct numeric;
	v_correct boolean;
	v_value jsonb;
	v_rank integer;
begin
	if v_uid is null then raise exception 'You must be signed in.'; end if;
	if p_code is null or length(trim(p_code)) = 0 then raise exception 'Missing submit code.'; end if;
	if p_mass_g is null then raise exception 'Enter the mass from Mass Properties.'; end if;

	select * into v_token from public.gauntlet_run_tokens where code = upper(trim(p_code));
	if not found then raise exception 'Invalid submit code.'; end if;
	if v_token.room_id is null then raise exception 'This code is not a room run.'; end if;
	if v_token.user_id <> v_uid then raise exception 'This submit code is not yours.'; end if;
	if v_token.used_at is not null then raise exception 'You have already submitted this round.'; end if;
	if v_now > v_token.expires_at then raise exception 'This run has expired.'; end if;

	select * into v_challenge from public.challenges where id = v_token.challenge_id;
	if not found then raise exception 'Challenge not found.'; end if;

	v_elapsed_ms := greatest(0, (extract(epoch from (v_now - v_token.reveal_at)) * 1000)::bigint);
	v_elapsed_s := round(v_elapsed_ms::numeric / 1000.0, 2);

	v_target := (v_challenge.answer ->> 'target_mass')::numeric;
	v_tol_pct := coalesce((v_challenge.answer ->> 'tolerance_pct')::numeric, 0);
	v_correct := v_target is not null and abs(p_mass_g - v_target) <= v_target * v_tol_pct / 100.0;

	v_value := jsonb_build_object('mass_g', p_mass_g, 'elapsed_ms', v_elapsed_ms);

	-- A failed room run keeps the token live to retry on the shared clock; only a
	-- pass consumes it (single passing run per racer per round).
	if v_correct then
		update public.gauntlet_run_tokens set used_at = v_now
			where code = v_token.code and used_at is null;
		if not found then raise exception 'You have already submitted a passing run this round.'; end if;
	end if;

	insert into public.submissions (user_id, challenge_id, mode, value, is_correct, score_metric, source, room_id)
	values (v_token.user_id, v_token.challenge_id, v_challenge.mode, v_value, v_correct, v_elapsed_s, 'manual', v_token.room_id);

	select rb.rank into v_rank from public.gauntlet_room_board rb
		where rb.room_id = v_token.room_id and rb.user_id = v_token.user_id;

	return jsonb_build_object(
		'is_correct', v_correct,
		'score_metric', v_elapsed_s,
		'rank', v_rank,
		'target_mass', v_target,
		'your_mass', p_mass_g,
		'tolerance_pct', v_tol_pct
	);
end;
$$;

-- Grants: members call these from the browser; the macro stays anon via
-- gauntlet_macro_submit above. Each RPC re-checks host/member server-side.
revoke all on function public.gauntlet_room_create() from public;
revoke all on function public.gauntlet_room_set_challenge(uuid, uuid) from public;
revoke all on function public.gauntlet_room_start(uuid) from public;
revoke all on function public.gauntlet_room_set_state(uuid, text) from public;
revoke all on function public.gauntlet_room_join(text) from public;
revoke all on function public.gauntlet_room_reveal(uuid) from public;
revoke all on function public.gauntlet_room_manual_submit(text, numeric) from public;
grant execute on function public.gauntlet_room_create() to authenticated;
grant execute on function public.gauntlet_room_set_challenge(uuid, uuid) to authenticated;
grant execute on function public.gauntlet_room_start(uuid) to authenticated;
grant execute on function public.gauntlet_room_set_state(uuid, text) to authenticated;
grant execute on function public.gauntlet_room_join(text) to authenticated;
grant execute on function public.gauntlet_room_reveal(uuid) to authenticated;
grant execute on function public.gauntlet_room_manual_submit(text, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Realtime: rooms + roster (submissions are already in the publication).
-- ---------------------------------------------------------------------------
do $$
begin
	if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
		if not exists (
			select 1 from pg_publication_tables
			where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gauntlet_rooms'
		) then
			alter publication supabase_realtime add table public.gauntlet_rooms;
		end if;
		if not exists (
			select 1 from pg_publication_tables
			where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gauntlet_room_participants'
		) then
			alter publication supabase_realtime add table public.gauntlet_room_participants;
		end if;
	end if;
end
$$;
