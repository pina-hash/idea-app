-- 0016_gauntlet_speedrun_start.sql
-- IDEA // GAUNTLET: server-verified run timing for Speedrun (the Start macro).
--
-- Until now a Speedrun run was timed from the server-stamped reveal_at (0006):
-- the clock began the instant the student revealed the drawing, which does not
-- guarantee they started from a blank part. This migration moves the clock start
-- to a BLANK-VERIFIED SolidWorks event and times start-to-submit fully
-- server-side.
--
--   1. gauntlet_run_tokens gains run_id + started_at (set by the Start macro) and
--      locked_at (set when a correct submit banks a ranked time).
--   2. gauntlet_macro_start(p_code, p_volume_mm3): validates the code like submit
--      (exists, active, not expired), rejects a non-blank part (client-attested),
--      stamps started_at = now() + a fresh run_id, and returns { run_id }. A run
--      with no correct submit yet may be re-started (fresh run_id, reset clock);
--      once a correct submit locks a ranked time, start will not reset it.
--   3. gauntlet_macro_submit now takes p_run_id and, for SOLO runs, times from the
--      token's started_at (not reveal_at), requiring p_run_id to match the issued
--      run_id. Solo runs allow multiple submits (each re-times from started_at,
--      only correct runs rank); a correct submit sets locked_at. ROOM runs (0010)
--      are unchanged: they keep the shared reveal_at clock and do not use the
--      Start macro, so p_run_id is ignored for them. Geometry tolerance,
--      is_correct, per-mode score_metric, rank, and the return shape are all
--      preserved.
--
-- Grading stays server-authoritative: the macro posts via PostgREST with the
-- public anon key and the submit code as the credential; no client correctness
-- or client clock is trusted. Apply manually in the Supabase SQL editor.
-- Idempotent where practical.

-- ---------------------------------------------------------------------------
-- 1. Per-attempt run state on the token. All nullable: a token is minted at
--    reveal (0006/0015) and only gains a run_id/started_at once the Start macro
--    fires. locked_at guards a banked ranked time from a re-start.
-- ---------------------------------------------------------------------------
alter table public.gauntlet_run_tokens
	add column if not exists run_id uuid,
	add column if not exists started_at timestamptz,
	add column if not exists locked_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Start RPC. The Start macro posts here (anon key, code is the credential).
--    SECURITY DEFINER so it can validate the code and stamp the token. Time is
--    server-authoritative from here on (started_at = now()).
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_macro_start(
	p_code text,
	p_volume_mm3 numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_token public.gauntlet_run_tokens%rowtype;
	v_now timestamptz := now();
	v_run_id uuid := gen_random_uuid();
begin
	if p_code is null or length(trim(p_code)) = 0 then
		raise exception 'Missing start code.';
	end if;

	-- A run may only begin on a blank part. This is a client-attested sanity
	-- value (the macro also checks locally), kept as a server guard.
	if p_volume_mm3 is not null and p_volume_mm3 > 0 then
		raise exception 'This part is not blank. Start your run on a new, empty part.';
	end if;

	select * into v_token from public.gauntlet_run_tokens where code = upper(trim(p_code));
	if not found then
		raise exception 'Invalid start code.';
	end if;
	if v_token.used_at is not null then
		raise exception 'This code is no longer active. Re-reveal in GAUNTLET to start a new run.';
	end if;
	if v_now > v_token.expires_at then
		raise exception 'This code has expired. Re-reveal in GAUNTLET to start a new run.';
	end if;

	-- Once a correct submit has locked a ranked time, a re-start may not reset it.
	if v_token.locked_at is not null then
		raise exception 'You already recorded a ranked run for this code. Re-reveal in GAUNTLET for a fresh run.';
	end if;

	-- (Re)start: fresh run_id, reset the server start clock. The predicates keep a
	-- concurrent lock/consume from racing this write.
	update public.gauntlet_run_tokens
		set run_id = v_run_id, started_at = v_now
		where code = v_token.code and used_at is null and locked_at is null;
	if not found then
		raise exception 'Could not start this run. Re-reveal in GAUNTLET for a fresh code.';
	end if;

	return jsonb_build_object('run_id', v_run_id, 'started_at', v_now);
end;
$$;

-- The Start macro is unauthenticated (anon key); the code is the credential.
revoke all on function public.gauntlet_macro_start(text, numeric) from public;
grant execute on function public.gauntlet_macro_start(text, numeric) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Submit RPC, now run_id-aware. The signature gains p_run_id, so drop the
--    prior 5-arg version first (a plain create-or-replace would leave it as a
--    second overload that could bypass the run_id requirement).
-- ---------------------------------------------------------------------------
drop function if exists public.gauntlet_macro_submit(text, numeric, numeric, integer, numeric);

create or replace function public.gauntlet_macro_submit(
	p_code text,
	p_volume_mm3 numeric,
	p_run_id text default null,
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
	v_run_id uuid;
	v_clock_start timestamptz;
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
		raise exception 'This submit code is no longer active. Re-reveal in GAUNTLET to start a new run.';
	end if;
	if v_now > v_token.expires_at then
		raise exception 'This submit code has expired. Re-reveal in GAUNTLET to start a new run.';
	end if;

	select * into v_challenge from public.challenges where id = v_token.challenge_id;
	if not found then
		raise exception 'Challenge not found.';
	end if;

	-- Timing origin.
	--   Solo runs (room_id null): the Start macro's server-stamped started_at,
	--   bound to a run_id. Room runs (0010): the shared reveal_at clock, since
	--   room racers do not run the Start macro (p_run_id is ignored for them).
	if v_token.room_id is null then
		if p_run_id is null or length(trim(p_run_id)) = 0 then
			raise exception 'No run has been started. Run the Start macro on a blank part first, then submit.';
		end if;
		begin
			v_run_id := trim(p_run_id)::uuid;
		exception when others then
			raise exception 'No run has been started. Run the Start macro on a blank part first, then submit.';
		end;
		if v_token.started_at is null or v_token.run_id is null then
			raise exception 'No run has been started for this code. Run the Start macro on a blank part first, then submit.';
		end if;
		if v_token.run_id <> v_run_id then
			raise exception 'This run has been replaced by a newer start. Start a new run, then submit.';
		end if;
		v_clock_start := v_token.started_at;
	else
		v_clock_start := v_token.reveal_at;
	end if;

	-- Server-authoritative elapsed time (no client clock is trusted).
	v_elapsed_ms := greatest(0, (extract(epoch from (v_now - v_clock_start)) * 1000)::bigint);
	v_elapsed_s := round(v_elapsed_ms::numeric / 1000.0, 2);

	-- Correctness is on VOLUME for every modeling mode.
	v_target_vol := (v_challenge.answer ->> 'target_volume_mm3')::numeric;
	v_tol_pct := coalesce((v_challenge.answer ->> 'tolerance_pct')::numeric, 0);
	v_correct := v_target_vol is not null
		and abs(p_volume_mm3 - v_target_vol) <= v_target_vol * v_tol_pct / 100.0;

	-- Score metric by mode (lower ranks better in all cases).
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
		'elapsed_ms', v_elapsed_ms,
		'run_id', v_run_id
	);

	-- Token lifecycle.
	--   Solo: the token is NOT consumed, so a student may submit repeatedly (each
	--   re-times from started_at; only correct runs rank). A correct submit sets
	--   locked_at so a later Start cannot reset the banked clock.
	--   Room (0010): a passing room run consumes the token; a failed room run
	--   keeps it live to retry.
	if v_token.room_id is null then
		if v_correct and v_token.locked_at is null then
			update public.gauntlet_run_tokens
				set locked_at = v_now
				where code = v_token.code and locked_at is null;
		end if;
	elsif v_correct then
		update public.gauntlet_run_tokens
			set used_at = v_now
			where code = v_token.code and used_at is null;
		if not found then
			raise exception 'This submit code was already used. Re-reveal in GAUNTLET to start a new run.';
		end if;
	end if;

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

revoke all on function public.gauntlet_macro_submit(text, numeric, text, numeric, integer, numeric) from public;
grant execute on function public.gauntlet_macro_submit(text, numeric, text, numeric, integer, numeric) to anon, authenticated;
