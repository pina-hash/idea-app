-- 0027_gauntlet_material_density_gate.sql
-- IDEA // GAUNTLET: verify the applied material by DENSITY, not by name.
--
-- 0026 gated the macro submit on an exact, case-insensitive MATERIAL NAME match
-- (p_material vs prompt->>'material'). That regressed real, correctly-materialed
-- runs two ways:
--   * A custom-library material (e.g. "6061-T6 (SS)") never matches a challenge
--     authored as "6061 Alloy", so a correct part was hard-blocked as "Wrong
--     material".
--   * When the client could not read the name (reading the wrong configuration,
--     or GetMaterialPropertyName2 returning empty for a custom library), a
--     correctly-materialed part was hard-blocked as "No material applied".
--
-- The physical truth of "the right material" is its DENSITY, which the macro
-- already reports implicitly: measured density = mass / volume, independent of
-- geometry and of the material's library or display name. This migration
-- replaces name gating with density verification:
--
--   1. Measured density (g/cm3) = p_mass_g / (p_volume_mm3 / 1000).
--   2. Expected density comes from the challenge (answer->>'density', the same
--      value the author entered and publish requires), normalized to g/cm3 from
--      the challenge's unit system (IPS density is lb/in3 -> x 27.679904653;
--      MMGS and the Reverse Engineer / Feature Golf default are already g/cm3).
--   3. A material is "assigned" when the part reports a non-empty name OR a real
--      density (present, > 0, and outside SolidWorks' ~1.0 g/cm3 no-material
--      default band). The submit is BLOCKED (raised, nothing recorded, the solo
--      token stays live to retry on the same clock) ONLY when there is genuinely
--      no material: an empty name AND a default/zero density.
--   4. Correctness now requires BOTH the volume check (unchanged) AND the
--      measured density within a tolerance (answer->>'density_tolerance_pct',
--      default 1%) of the expected density. A present-but-wrong material is
--      recorded is_correct = false (unranked), NOT raised, so the student sees
--      "outside tolerance" with the detected vs expected density and can fix it
--      on the same clock. Only genuinely-no-material blocks.
--   5. The return payload and the block message carry the detected material name
--      and the measured / expected density so failures are debuggable.
--
-- The signature is unchanged from 0026 (the 7-arg form), so this is a plain
-- create-or-replace with no drop: both callers (the Submit macro and the C#
-- add-in) already send p_material and p_mass_g; the server derives density and
-- needs no new argument. Server-authoritative timing (run_id / started_at /
-- reveal_at) is untouched. The gate covers every gauntlet_macro_submit caller
-- (solo Speedrun, Reverse Engineer, Feature Golf, and room macro runs); manual
-- practice (gauntlet_submit) and host-supervised room manual submits cannot read
-- the part and stay unchanged.
--
-- Apply manually in the Supabase SQL editor. Idempotent.

create or replace function public.gauntlet_macro_submit(
	p_code text,
	p_volume_mm3 numeric,
	p_run_id text default null,
	p_surface_area_mm2 numeric default null,
	p_feature_count integer default null,
	p_mass_g numeric default null,
	p_material text default null
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
	v_vol_ok boolean;
	v_correct boolean;
	v_value jsonb;
	v_rank integer;
	-- Material / density verification (0027).
	v_detected_material text;    -- the applied material name, or null when none read
	v_required_material text;    -- the challenge's authored material name (debug only)
	v_expected_density numeric;  -- normalized to g/cm3
	v_unit_system text;
	v_measured_density numeric;  -- g/cm3, from the submitted part
	v_density_tol_pct numeric;
	v_material_present boolean;
	v_density_ok boolean;
	-- 1 lb/in3 = 453.59237 g / 16.387064 cm3.
	c_lb_in3_to_g_cm3 constant numeric := 27.679904653;
	-- SolidWorks' default (no material applied) density is ~1000 kg/m3 = 1.0 g/cm3.
	c_default_density constant numeric := 1.0;
	c_default_band constant numeric := 0.05;  -- g/cm3 either side of the default
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

	-- ---- MATERIAL BY DENSITY (0027, replaces the 0026 exact-name gate) -------
	v_detected_material := nullif(trim(coalesce(p_material, '')), '');
	v_required_material := nullif(trim(v_challenge.prompt ->> 'material'), '');

	-- Expected density (the author's value; publish requires it for modeling
	-- modes). Read the authoritative private copy, fall back to the public one.
	-- Normalize to g/cm3 from the challenge's unit system: IPS stores lb/in3,
	-- MMGS and the Reverse Engineer / Feature Golf default store g/cm3.
	v_expected_density := coalesce(
		nullif(v_challenge.answer ->> 'density', '')::numeric,
		nullif(v_challenge.prompt ->> 'density', '')::numeric
	);
	v_unit_system := coalesce(nullif(trim(v_challenge.prompt ->> 'unit_system'), ''), 'MMGS');
	if v_expected_density is not null and upper(v_unit_system) = 'IPS' then
		v_expected_density := v_expected_density * c_lb_in3_to_g_cm3;
	end if;

	-- Measured density (g/cm3) from the submitted, material-bearing part. The
	-- geometry cancels out, so this is the applied material's density regardless
	-- of its library or display name.
	if p_mass_g is not null and p_volume_mm3 is not null and p_volume_mm3 > 0 then
		v_measured_density := p_mass_g / (p_volume_mm3 / 1000.0);
	end if;

	v_density_tol_pct := coalesce((v_challenge.answer ->> 'density_tolerance_pct')::numeric, 1);

	-- A material is assigned when the part reports a name OR a real density
	-- (present, > 0, and outside the ~1.0 g/cm3 no-material default band).
	v_material_present := (v_detected_material is not null)
		or (v_measured_density is not null
			and v_measured_density > 0
			and abs(v_measured_density - c_default_density) > c_default_band);

	-- Density correctness: measured within tolerance of expected. Skipped (true)
	-- when either side is unknown (no expected density, or no captured mass).
	if v_expected_density is not null and v_expected_density > 0 and v_measured_density is not null then
		v_density_ok := abs(v_measured_density - v_expected_density) <= v_expected_density * v_density_tol_pct / 100.0;
	else
		v_density_ok := true;
	end if;

	-- BLOCK only when the challenge expects a material and there is genuinely
	-- none: no name AND no real density. A present-but-wrong material is graded
	-- (is_correct = false below), not raised, so the clock keeps running.
	if (v_required_material is not null or v_expected_density is not null)
		and not v_material_present then
		raise exception
			'No material applied. The part reports material % and density % g/cm3 (a blank part reads ~1.0). Apply % to your part (right-click Material in the tree), then submit again.',
			coalesce('"' || v_detected_material || '"', '(none)'),
			coalesce(round(v_measured_density, 4)::text, 'n/a'),
			coalesce('"' || v_required_material || '"', 'the challenge material');
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

	-- Correctness is on VOLUME for every modeling mode, AND (0027) on the applied
	-- material's density.
	v_target_vol := (v_challenge.answer ->> 'target_volume_mm3')::numeric;
	v_tol_pct := coalesce((v_challenge.answer ->> 'tolerance_pct')::numeric, 0);
	v_vol_ok := v_target_vol is not null
		and abs(p_volume_mm3 - v_target_vol) <= v_target_vol * v_tol_pct / 100.0;
	v_correct := v_vol_ok and v_density_ok;

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
		'material', v_detected_material,
		'measured_density_g_cm3', case when v_measured_density is not null then round(v_measured_density, 4) else null end,
		'expected_density_g_cm3', case when v_expected_density is not null then round(v_expected_density, 4) else null end,
		'density_ok', v_density_ok,
		'volume_ok', v_vol_ok,
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
		'tolerance_pct', v_tol_pct,
		'volume_ok', v_vol_ok,
		'detected_material', v_detected_material,
		'measured_density_g_cm3', case when v_measured_density is not null then round(v_measured_density, 4) else null end,
		'expected_density_g_cm3', case when v_expected_density is not null then round(v_expected_density, 4) else null end,
		'density_tolerance_pct', v_density_tol_pct,
		'density_ok', v_density_ok
	);
end;
$$;

-- The macro/add-in are unauthenticated (anon key); the code is the credential.
-- Signature is unchanged from 0026, so re-affirm the grant (idempotent).
revoke all on function public.gauntlet_macro_submit(text, numeric, text, numeric, integer, numeric, text) from public;
grant execute on function public.gauntlet_macro_submit(text, numeric, text, numeric, integer, numeric, text) to anon, authenticated;
