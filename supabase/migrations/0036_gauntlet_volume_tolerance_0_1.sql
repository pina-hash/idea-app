-- 0036_gauntlet_volume_tolerance_0_1.sql
-- IDEA // GAUNTLET: tighten the default volume-checksum tolerance from 0.5% to
-- 0.1%.
--
-- The shared relative-tolerance constant GAUNTLET_VOLUME_TOL_PCT is the DEFAULT
-- used only when a level does not set its own band. This migration redefines the
-- two server functions that carry it (0034) so the default is 0.1 instead of 0.5:
--   * gauntlet_macro_submit.c_volume_tol_pct GOVERNS ranked pass/fail.
--   * gauntlet_run_targets.c_volume_tol_pct is the preview/practice display copy.
-- Kept in sync with the VBA macros (GAUNTLET_VOLUME_TOL_PCT) and the C# add-in
-- (GauntletMath.VolumeTolPct), which are preview-only.
--
-- The per-level override is UNTOUCHED: both functions still read
-- answer->>'tolerance_pct' first and fall back to the constant only when it is
-- absent, so a level that sets its own band still wins.
--
-- Bodies are copied verbatim from 0034 with ONLY the constant changed (do not
-- hand-edit 0034; this supersedes it). Apply manually in the Supabase SQL editor,
-- in order, after 0035. Idempotent (create or replace).

-- ---------------------------------------------------------------------------
-- 1. gauntlet_macro_submit (ranked): default tolerance 0.1%.
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_macro_submit(
	p_code text,
	p_volume_mm3 numeric,
	p_run_id text default null,
	p_surface_area_mm2 numeric default null,
	p_feature_count integer default null,
	p_mass_g numeric default null,        -- IGNORED for mass/verification (part-material derived)
	p_material text default null,         -- advisory only, never gates
	p_unit_system text default null       -- informational only, never gates
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
	-- Level-sourced density + mass (never the part's assigned material).
	v_unit_system text;             -- the level's unit system (IPS/MMGS)
	v_density_gcm3 numeric;         -- level density normalized to g/cm3
	v_your_mass_g numeric;          -- measured_volume x level_density
	v_target_mass_g numeric;        -- target_volume x level_density
	v_your_mass_level numeric;      -- in the level's unit
	v_target_mass_level numeric;
	v_mass_unit text;
	-- Non-gating material advisory.
	v_detected_material text;
	v_required_material text;
	v_material_matches boolean;
	-- Shared verification tolerance DEFAULT (was 0.5 in 0034). Keep in sync with
	-- the VBA macros (GAUNTLET_VOLUME_TOL_PCT) and the C# add-in
	-- (GauntletMath.VolumeTolPct). A level's answer.tolerance_pct still wins.
	c_volume_tol_pct constant numeric := 0.1;
	c_lb_in3_to_g_cm3 constant numeric := 27.679904653;
	c_lb_to_g constant numeric := 453.59237;
begin
	if p_code is null or length(trim(p_code)) = 0 then
		raise exception 'Missing submit code.';
	end if;
	if p_volume_mm3 is null then
		raise exception 'Missing captured volume. No solid body was read from the part.';
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

	-- Timing origin (unchanged): solo runs time from the Start macro's
	-- server-stamped started_at bound to a run_id; room runs from the shared
	-- reveal_at (room racers do not run the Start macro).
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

	v_elapsed_ms := greatest(0, (extract(epoch from (v_now - v_clock_start)) * 1000)::bigint);
	v_elapsed_s := round(v_elapsed_ms::numeric / 1000.0, 2);

	-- ---- RANKED CORRECTNESS: VOLUME ONLY ------------------------------------
	v_target_vol := (v_challenge.answer ->> 'target_volume_mm3')::numeric;
	v_tol_pct := coalesce((v_challenge.answer ->> 'tolerance_pct')::numeric, c_volume_tol_pct);
	v_correct := v_target_vol is not null
		and abs(p_volume_mm3 - v_target_vol) <= v_target_vol * v_tol_pct / 100.0;

	-- Score metric by mode (lower ranks better in all cases). Volume-only.
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

	-- ---- MASS FROM THE LEVEL'S DENSITY (never the part's material) -----------
	v_unit_system := upper(coalesce(nullif(trim(v_challenge.prompt ->> 'unit_system'), ''), 'MMGS'));
	v_density_gcm3 := coalesce(
		nullif(v_challenge.answer ->> 'density', '')::numeric,
		nullif(v_challenge.prompt ->> 'density', '')::numeric
	);
	if v_density_gcm3 is not null and v_unit_system = 'IPS' then
		v_density_gcm3 := v_density_gcm3 * c_lb_in3_to_g_cm3;  -- lb/in3 -> g/cm3
	end if;

	if v_density_gcm3 is not null then
		v_your_mass_g := (p_volume_mm3 / 1000.0) * v_density_gcm3;          -- cm3 x g/cm3 = g
		if v_target_vol is not null then
			v_target_mass_g := (v_target_vol / 1000.0) * v_density_gcm3;
		end if;
		if v_unit_system = 'IPS' then
			v_mass_unit := 'lb';
			v_your_mass_level := round(v_your_mass_g / c_lb_to_g, 4);
			v_target_mass_level := case when v_target_mass_g is not null then round(v_target_mass_g / c_lb_to_g, 4) else null end;
		else
			v_mass_unit := 'g';
			v_your_mass_level := round(v_your_mass_g, 2);
			v_target_mass_level := case when v_target_mass_g is not null then round(v_target_mass_g, 2) else null end;
		end if;
	end if;

	-- ---- NON-GATING MATERIAL ADVISORY ---------------------------------------
	v_detected_material := nullif(trim(coalesce(p_material, '')), '');
	v_required_material := nullif(trim(v_challenge.prompt ->> 'material'), '');
	if v_detected_material is not null and v_required_material is not null then
		v_material_matches := lower(v_detected_material) = lower(v_required_material);
	else
		v_material_matches := null;  -- unknown; never a failure
	end if;

	v_value := jsonb_build_object(
		'volume_mm3', p_volume_mm3,
		'surface_area_mm2', p_surface_area_mm2,
		'feature_count', p_feature_count,
		'computed_mass_g', case when v_your_mass_g is not null then round(v_your_mass_g, 4) else null end,
		'mass_level', v_your_mass_level,
		'mass_unit', v_mass_unit,
		'unit_system', v_unit_system,
		'doc_unit_system', nullif(upper(trim(coalesce(p_unit_system, ''))), ''),
		'material', v_detected_material,
		'material_matches', v_material_matches,
		'volume_ok', v_correct,
		'elapsed_ms', v_elapsed_ms,
		'run_id', v_run_id
	);

	-- Token lifecycle (unchanged): solo tokens are not consumed (re-submit allowed,
	-- correct submit locks the banked clock); a passing room run consumes the token.
	if v_token.room_id is null then
		if v_correct and v_token.locked_at is null then
			update public.gauntlet_run_tokens set locked_at = v_now
				where code = v_token.code and locked_at is null;
		end if;
	elsif v_correct then
		update public.gauntlet_run_tokens set used_at = v_now
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
		'tolerance_pct', v_tol_pct,
		'volume_ok', v_correct,
		'unit_system', v_unit_system,
		'mass_unit', v_mass_unit,
		'your_mass_level', v_your_mass_level,
		'target_mass_level', v_target_mass_level,
		'detected_material', v_detected_material,
		'material_matches', v_material_matches
	);
end;
$$;

revoke all on function public.gauntlet_macro_submit(text, numeric, text, numeric, integer, numeric, text, text) from public;
grant execute on function public.gauntlet_macro_submit(text, numeric, text, numeric, integer, numeric, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. gauntlet_run_targets (preview/practice display): default tolerance 0.1%.
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_run_targets(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_token public.gauntlet_run_tokens%rowtype;
	v_challenge public.challenges%rowtype;
	v_unit_system text;
	v_density_gcm3 numeric;
	v_target_vol numeric;
	v_tol_pct numeric;
	v_target_mass_g numeric;
	v_target_mass_level numeric;
	v_density_level numeric;
	v_mass_unit text;
	v_length_unit text;
	c_volume_tol_pct constant numeric := 0.1;   -- keep in sync (see gauntlet_macro_submit)
	c_lb_in3_to_g_cm3 constant numeric := 27.679904653;
	c_lb_to_g constant numeric := 453.59237;
begin
	if p_code is null or length(trim(p_code)) = 0 then
		raise exception 'Missing code.';
	end if;
	select * into v_token from public.gauntlet_run_tokens where code = upper(trim(p_code));
	if not found then
		raise exception 'Invalid code.';
	end if;
	select * into v_challenge from public.challenges where id = v_token.challenge_id;
	if not found then
		raise exception 'Challenge not found.';
	end if;

	v_unit_system := upper(coalesce(nullif(trim(v_challenge.prompt ->> 'unit_system'), ''), 'MMGS'));
	v_target_vol := (v_challenge.answer ->> 'target_volume_mm3')::numeric;
	v_tol_pct := coalesce((v_challenge.answer ->> 'tolerance_pct')::numeric, c_volume_tol_pct);
	v_density_gcm3 := coalesce(
		nullif(v_challenge.answer ->> 'density', '')::numeric,
		nullif(v_challenge.prompt ->> 'density', '')::numeric
	);
	-- Keep the level's stored density in its own unit for display, and normalized.
	if v_unit_system = 'IPS' then
		v_density_level := v_density_gcm3;                       -- as stored (lb/in3)
		if v_density_gcm3 is not null then v_density_gcm3 := v_density_gcm3 * c_lb_in3_to_g_cm3; end if;
		v_mass_unit := 'lb';
		v_length_unit := 'in';
	else
		v_density_level := v_density_gcm3;                       -- already g/cm3
		v_mass_unit := 'g';
		v_length_unit := 'mm';
	end if;

	if v_density_gcm3 is not null and v_target_vol is not null then
		v_target_mass_g := (v_target_vol / 1000.0) * v_density_gcm3;
		v_target_mass_level := case when v_unit_system = 'IPS'
			then round(v_target_mass_g / c_lb_to_g, 4) else round(v_target_mass_g, 2) end;
	end if;

	return jsonb_build_object(
		'challenge_id', v_token.challenge_id,
		'title', v_challenge.title,
		'target_volume_mm3', v_target_vol,
		'tolerance_pct', v_tol_pct,
		'expected_density_g_cm3', v_density_gcm3,
		'density_level', v_density_level,
		'unit_system', v_unit_system,
		'mass_unit', v_mass_unit,
		'length_unit', v_length_unit,
		'target_mass_level', v_target_mass_level,
		'material', nullif(trim(v_challenge.prompt ->> 'material'), '')
	);
end;
$$;

revoke all on function public.gauntlet_run_targets(text) from public;
grant execute on function public.gauntlet_run_targets(text) to anon, authenticated;
