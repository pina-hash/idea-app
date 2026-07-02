-- 0030_gauntlet_unit_system.sql
-- IDEA // GAUNTLET: unit system (IPS or MMGS) as a first-class per-challenge
-- attribute, enforced on the macro submit path.
--
-- unit_system already lived in the Speedrun prompt JSONB (0018) and drives the
-- presented density/mass/length units. This migration makes it authoritative:
--
--   1. Backfill: every Speedrun challenge missing prompt->>'unit_system' gets
--      'IPS' (the program default). Reverse Engineer / Feature Golf keep the
--      metric (MMGS, g/cm3) convention implicitly, i.e. an absent unit_system
--      reads as MMGS, exactly as the density gate (0027) already assumes.
--
--   2. gauntlet_macro_submit gains p_unit_system: the SolidWorks DOCUMENT unit
--      system reported by the macro / add-in ('IPS' or 'MMGS'). When the level
--      names a unit system and the document's differs, the submit is BLOCKED
--      (raised, nothing recorded, the solo token stays live) with a message
--      showing both, so a student models in the level's units (the drawing's
--      dimensions are read in that system). An absent p_unit_system (older
--      client) skips the check. The result also reports the measured mass in the
--      level's unit (lb for IPS, g for MMGS), converted with the exact factor
--      1 lb = 453.59237 g.
--
-- Everything else in gauntlet_macro_submit (server-authoritative timing, volume
-- correctness, and the 0027 density material gate) is preserved verbatim. The
-- signature grows by one argument, so the 7-arg 0027 form is dropped first.
--
-- Apply manually in the Supabase SQL editor. Idempotent.

-- ---------------------------------------------------------------------------
-- 1. Backfill unit_system on existing Speedrun challenges (default IPS).
-- ---------------------------------------------------------------------------
update public.challenges
set prompt = jsonb_set(prompt, '{unit_system}', '"IPS"', true)
where mode = 'speedrun'
	and coalesce(nullif(trim(prompt ->> 'unit_system'), ''), '') = '';

-- ---------------------------------------------------------------------------
-- 2. gauntlet_macro_submit with the document unit-system gate + mass reporting.
-- ---------------------------------------------------------------------------
drop function if exists public.gauntlet_macro_submit(text, numeric, text, numeric, integer, numeric, text);

create or replace function public.gauntlet_macro_submit(
	p_code text,
	p_volume_mm3 numeric,
	p_run_id text default null,
	p_surface_area_mm2 numeric default null,
	p_feature_count integer default null,
	p_mass_g numeric default null,
	p_material text default null,
	p_unit_system text default null
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
	v_detected_material text;
	v_required_material text;
	v_expected_density numeric;
	v_unit_system text;         -- the level's expected unit system (IPS/MMGS)
	v_measured_density numeric;
	v_density_tol_pct numeric;
	v_material_present boolean;
	v_density_ok boolean;
	-- Unit-system gate + mass reporting (0030).
	v_doc_unit text;            -- the SolidWorks document unit system reported
	v_mass_level numeric;       -- measured mass in the level's unit
	v_mass_unit text;
	c_lb_in3_to_g_cm3 constant numeric := 27.679904653;
	c_lb_to_g constant numeric := 453.59237;
	c_default_density constant numeric := 1.0;
	c_default_band constant numeric := 0.05;
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

	-- The level's expected unit system (Speedrun is backfilled; RE/FG default MMGS).
	v_unit_system := upper(coalesce(nullif(trim(v_challenge.prompt ->> 'unit_system'), ''), 'MMGS'));

	-- ---- UNIT-SYSTEM GATE (0030) --------------------------------------------
	-- The document's unit system must match the level's, so the student reads the
	-- drawing's dimensions in the intended system. Absent (old client): skip.
	v_doc_unit := nullif(upper(trim(coalesce(p_unit_system, ''))), '');
	if v_doc_unit is not null and v_doc_unit in ('IPS', 'MMGS') and v_doc_unit <> v_unit_system then
		raise exception
			'Wrong document units: your SolidWorks part is in %, but this challenge is in %. Switch to % (Tools > Options > Document Properties > Units), then submit again.',
			v_doc_unit, v_unit_system, v_unit_system;
	end if;

	-- ---- MATERIAL BY DENSITY (0027) -----------------------------------------
	v_detected_material := nullif(trim(coalesce(p_material, '')), '');
	v_required_material := nullif(trim(v_challenge.prompt ->> 'material'), '');

	v_expected_density := coalesce(
		nullif(v_challenge.answer ->> 'density', '')::numeric,
		nullif(v_challenge.prompt ->> 'density', '')::numeric
	);
	if v_expected_density is not null and v_unit_system = 'IPS' then
		v_expected_density := v_expected_density * c_lb_in3_to_g_cm3;
	end if;

	if p_mass_g is not null and p_volume_mm3 is not null and p_volume_mm3 > 0 then
		v_measured_density := p_mass_g / (p_volume_mm3 / 1000.0);
	end if;

	v_density_tol_pct := coalesce((v_challenge.answer ->> 'density_tolerance_pct')::numeric, 1);

	v_material_present := (v_detected_material is not null)
		or (v_measured_density is not null
			and v_measured_density > 0
			and abs(v_measured_density - c_default_density) > c_default_band);

	if v_expected_density is not null and v_expected_density > 0 and v_measured_density is not null then
		v_density_ok := abs(v_measured_density - v_expected_density) <= v_expected_density * v_density_tol_pct / 100.0;
	else
		v_density_ok := true;
	end if;

	if (v_required_material is not null or v_expected_density is not null)
		and not v_material_present then
		raise exception
			'No material applied. The part reports material % and density % g/cm3 (a blank part reads ~1.0). Apply % to your part (right-click Material in the tree), then submit again.',
			coalesce('"' || v_detected_material || '"', '(none)'),
			coalesce(round(v_measured_density, 4)::text, 'n/a'),
			coalesce('"' || v_required_material || '"', 'the challenge material');
	end if;

	-- Timing origin (unchanged).
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

	-- Correctness on VOLUME and (0027) the applied material's density.
	v_target_vol := (v_challenge.answer ->> 'target_volume_mm3')::numeric;
	v_tol_pct := coalesce((v_challenge.answer ->> 'tolerance_pct')::numeric, 0);
	v_vol_ok := v_target_vol is not null
		and abs(p_volume_mm3 - v_target_vol) <= v_target_vol * v_tol_pct / 100.0;
	v_correct := v_vol_ok and v_density_ok;

	-- Score metric by mode (lower ranks better).
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

	-- Measured mass in the level's unit (IPS: lb, MMGS: g).
	if p_mass_g is not null then
		if v_unit_system = 'IPS' then
			v_mass_level := round(p_mass_g / c_lb_to_g, 4);
			v_mass_unit := 'lb';
		else
			v_mass_level := round(p_mass_g, 2);
			v_mass_unit := 'g';
		end if;
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
		'unit_system', v_unit_system,
		'doc_unit_system', v_doc_unit,
		'elapsed_ms', v_elapsed_ms,
		'run_id', v_run_id
	);

	-- Token lifecycle (unchanged).
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
		'density_ok', v_density_ok,
		'unit_system', v_unit_system,
		'mass_level', v_mass_level,
		'mass_unit', v_mass_unit
	);
end;
$$;

revoke all on function public.gauntlet_macro_submit(text, numeric, text, numeric, integer, numeric, text, text) from public;
grant execute on function public.gauntlet_macro_submit(text, numeric, text, numeric, integer, numeric, text, text) to anon, authenticated;
