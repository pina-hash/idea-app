-- 0061_gauntlet_target_disclosure.sql
-- IDEA // GAUNTLET: stop handing the ranked answer key to the caller that
-- submits against it, and end the unlimited free wrong submit.
--
-- Closes the exploit chain recorded as F4 in docs/audits/2026-07-security-audit.md
-- (re-verified against the live definitions and confirmed unfixed on 2026-08-03).
-- The chain was: reveal for a code -> gauntlet_macro_start with a client-attested
-- blank-part value -> read target_volume_mm3 from gauntlet_run_targets (or from
-- one deliberate wrong submit, which cost nothing) -> submit that exact value
-- back. It ranked a machine-verified run without opening SolidWorks.
--
-- TWO changes, and they are only strong together:
--
--   1. NEITHER RPC RETURNS THE RANKED COMPARISON VALUE ANY MORE.
--      gauntlet_run_targets drops target_volume_mm3 and tolerance_pct.
--      gauntlet_macro_submit drops target_volume_mm3, your_volume_mm3 and
--      tolerance_pct, and returns a COARSE ABSOLUTE deviation band instead
--      ('pass' | 'close' | 'near' | 'far'). The band is deliberately:
--        * coarse   - its finest step (1%) is 10x the 0.1% default pass band, so
--                     it cannot be bisected into tolerance in a few probes;
--        * unsigned - no over/under. Direction is the single most useful bit for
--                     iterating onto a target, and it buys the student nothing
--                     the unranked practice check does not already give them.
--      The tolerance comparison itself is UNCHANGED and still runs server-side.
--
--   2. A FAILING SOLO SUBMIT NOW COSTS AN ATTEMPT.
--      gauntlet_run_tokens gains failed_attempts, and a code carries a budget of
--      3 failures per reveal. Exhausting it retires the code (used_at), so
--      further guesses need a fresh reveal, which requires a SESSION and lands
--      another attributable row in gauntlet_speedrun_attempts (0033). This is
--      what makes change 1 hold: without it, the coarse band could still be
--      walked onto the target for free.
--
-- HOW FAR CHANGE 2 ACTUALLY GOES, because it is easy to overread: the budget is
-- per TOKEN, and re-revealing is unlimited, so it does NOT bound total guesses
-- against a challenge - the target belongs to the challenge, not the token, so
-- knowledge carries across reveals. What it does is make a single reveal
-- unconvertible into a rank (the budget is deliberately below the ~4 probes it
-- takes to narrow the 1% band into the 0.1% pass band, see c_max_failed_attempts)
-- and force anything more into a slow, noisy loop of authenticated reveals that
-- each leave a row behind. Guessing becomes visible rather than impossible.
--
-- PRODUCT TRADEOFF, stated plainly: retries used to be unlimited, and the tools
-- tell students to "submit again with the same code, your time keeps counting".
-- That workflow SURVIVES - the clock still runs, geometry can still be fixed and
-- resubmitted - but it is now budgeted, and three failures is tighter than the
-- old unlimited. The reason that is acceptable rather than harsh: the UNRANKED
-- practice mass check (PracticeMassVerify / the add-in's practice button) is
-- free, unlimited, records nothing, and compares against the same level density,
-- so a student who is unsure has an exact self-check that costs no attempts. The
-- ranked submit is for when you already believe you are done. A student who
-- exhausts the budget re-reveals and starts a fresh clock, which is the same
-- cost an honest restart has always had.
--
-- The budget is PER TOKEN and is deliberately NOT reset by gauntlet_macro_start:
-- start's blank-part check is client-attested, so resetting there would hand the
-- counter straight back to the caller it is meant to bind.
--
-- DELIBERATELY UNCHANGED (all three are load-bearing and were verified sound):
--   * Attribution. The row is still inserted with v_token.user_id read off the
--     token, never a parameter. A student can still only ever cheat as themselves.
--   * The server-stamped clock. Elapsed is still now() - started_at.
--   * The volume check itself, and the per-level answer.tolerance_pct override.
--
-- WHAT THIS DOES NOT CLOSE, recorded rather than glossed over:
--   * The target volume remains DERIVABLE from the PUBLIC challenge framing,
--     because prompt.target_mass and prompt.density are shown to the student on
--     the spec card by design (the TooTallToby convention) and mass is exactly
--     volume x density. So this removes the exact, unrounded, zero-effort value
--     and - the part that matters most - the narrowing feedback loop, but it does
--     not make the target secret. Only the attempt budget bounds a derived guess.
--   * Reverse Engineer's ranked score_metric IS the mean percent deviation from
--     the stored targets, so for that mode the exact miss distance is inherent to
--     the score and cannot be removed here without redesigning the metric.
--     Feature Golf still ranks on the client-reported p_feature_count.
--   Both are detailed in F4's 2026-08-03 note.
--
-- Bodies are copied from 0036 (the live definition) with only the changes above;
-- do not hand-edit 0036, this supersedes it. Apply manually in the Supabase SQL
-- editor, in order, after 0060. Idempotent (create or replace / if not exists).

-- ---------------------------------------------------------------------------
-- 1. Per-reveal failed-attempt counter on the run token.
-- ---------------------------------------------------------------------------
alter table public.gauntlet_run_tokens
	add column if not exists failed_attempts integer not null default 0;

comment on column public.gauntlet_run_tokens.failed_attempts is
	'Failed macro submits against this code. Budgeted per reveal (0061): reaching the cap retires the code, so a wrong volume cannot be guessed without limit.';

-- ---------------------------------------------------------------------------
-- 2. gauntlet_macro_submit: no target in the payload, coarse band, budgeted fails.
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_macro_submit(
	p_code text,
	p_volume_mm3 numeric,
	p_run_id text default null,
	p_surface_area_mm2 numeric default null,
	p_feature_count integer default null,
	p_mass_g numeric default null,        -- IGNORED for mass/verification (level-density derived)
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
	-- Disclosure-safe feedback (0061): a coarse, unsigned band, never the target.
	v_dev_pct numeric;
	v_band text;
	-- Attempt budget (0061).
	v_failed integer;
	v_attempts_left integer;
	v_retired boolean := false;
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
	-- Shared verification tolerance DEFAULT. Keep in sync with the VBA macros
	-- (GAUNTLET_VOLUME_TOL_PCT) and the C# add-in (GauntletMath.VolumeTolPct),
	-- which are preview-only. A level's answer.tolerance_pct still wins.
	c_volume_tol_pct constant numeric := 0.1;
	-- Coaching band edges, percent. c_band_close_pct is deliberately an order of
	-- magnitude above the pass band so the band can never be bisected into it.
	c_band_close_pct constant numeric := 1.0;
	c_band_near_pct constant numeric := 5.0;
	-- Failed solo submits allowed per reveal before the code is retired.
	-- 3, not a rounder 5, for a measured reason: intersecting the intervals a
	-- run of 'close' answers implies takes about 4 probes to narrow from the 1%
	-- band into the 0.1% pass band, so a budget of 5 would let ONE reveal be
	-- converted into a rank by feel. 3 keeps that under the budget. It costs
	-- honest students very little, because the unranked practice mass check is
	-- free, unlimited, and exact - a student who needs more than three ranked
	-- attempts should be using it instead.
	c_max_failed_attempts constant integer := 3;
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
	-- Unchanged. The target is read here and compared here, and from 0061 it goes
	-- no further: it is never returned to the caller.
	v_target_vol := (v_challenge.answer ->> 'target_volume_mm3')::numeric;
	v_tol_pct := coalesce((v_challenge.answer ->> 'tolerance_pct')::numeric, c_volume_tol_pct);
	v_correct := v_target_vol is not null
		and abs(p_volume_mm3 - v_target_vol) <= v_target_vol * v_tol_pct / 100.0;

	-- ---- COARSE, UNSIGNED DEVIATION BAND (0061) ------------------------------
	-- The only correctness signal a failing caller gets. No exact deviation, no
	-- direction, no target: enough to coach ("you are close, check a feature" vs
	-- "you have misread a dimension"), never enough to converge on the answer.
	if v_correct then
		v_band := 'pass';
	elsif v_target_vol is null or v_target_vol = 0 then
		v_band := 'unknown';
	else
		v_dev_pct := abs(p_volume_mm3 - v_target_vol) / v_target_vol * 100.0;
		if v_dev_pct <= c_band_close_pct then
			v_band := 'close';
		elsif v_dev_pct <= c_band_near_pct then
			v_band := 'near';
		else
			v_band := 'far';
		end if;
	end if;

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
	-- Unchanged, and deliberately still returned: target mass and density are
	-- PUBLIC framing (prompt), shown on the spec card before the run starts.
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

	-- ---- TOKEN LIFECYCLE ----------------------------------------------------
	-- Solo: a PASS banks the clock (locked_at, unchanged). A FAIL now SPENDS an
	-- attempt from the reveal's budget, and exhausting the budget retires the
	-- code. An already-locked token is never retired by later failures: the
	-- ranked time is banked and there is nothing left to guess for.
	-- Room tokens are host-supervised and single-round; their behaviour is
	-- unchanged (consumed on a pass, untouched on a failure).
	if v_token.room_id is null then
		if v_correct then
			if v_token.locked_at is null then
				update public.gauntlet_run_tokens set locked_at = v_now
					where code = v_token.code and locked_at is null;
			end if;
			v_failed := coalesce(v_token.failed_attempts, 0);
		else
			update public.gauntlet_run_tokens
				set failed_attempts = coalesce(failed_attempts, 0) + 1,
					used_at = case
						when coalesce(failed_attempts, 0) + 1 >= c_max_failed_attempts
							and locked_at is null
						then v_now
						else used_at
					end
				where code = v_token.code
				returning failed_attempts, (used_at is not null) into v_failed, v_retired;
		end if;
		v_attempts_left := greatest(0, c_max_failed_attempts - coalesce(v_failed, c_max_failed_attempts));
	elsif v_correct then
		update public.gauntlet_run_tokens set used_at = v_now
			where code = v_token.code and used_at is null;
		if not found then
			raise exception 'This submit code was already used. Re-reveal in GAUNTLET to start a new run.';
		end if;
	end if;

	-- The stored value keeps the full picture for the audit trail (it is the
	-- student's OWN measurement plus their attempt number, never the target).
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
		'deviation_band', v_band,
		'failed_attempts', v_failed,
		'elapsed_ms', v_elapsed_ms,
		'run_id', v_run_id
	);

	insert into public.submissions (user_id, challenge_id, mode, value, is_correct, score_metric, source, room_id)
	values (v_token.user_id, v_token.challenge_id, v_challenge.mode, v_value, v_correct, v_score, 'macro', v_token.room_id);

	select gl.rank into v_rank
	from public.gauntlet_leaderboard gl
	where gl.challenge_id = v_token.challenge_id and gl.user_id = v_token.user_id;

	-- NOTE: target_volume_mm3, your_volume_mm3 and tolerance_pct are deliberately
	-- ABSENT (0061). Do not add them back, in any form, including as a computed
	-- "how far off you were" number: the pairing of the target with the submitted
	-- value is what turned a failing submit into a free read of the answer key.
	return jsonb_build_object(
		'is_correct', v_correct,
		'mode', v_challenge.mode,
		'elapsed_ms', v_elapsed_ms,
		'score_metric', v_score,
		'rank', v_rank,
		'volume_ok', v_correct,
		'deviation_band', v_band,
		'attempts_remaining', v_attempts_left,
		'code_retired', coalesce(v_retired, false),
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
-- 3. gauntlet_run_targets: level constants WITHOUT the ranked comparison value.
--
-- What stays is exactly what the student is already shown on the public spec
-- card before the run starts (material, density, target mass, unit system), so
-- the unranked practice mass check and the live target-vs-computed mass readout
-- keep working with no loss. What goes is target_volume_mm3 - the value the
-- ranked check compares against - and tolerance_pct, the width of the pass band.
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
	v_target_mass_g numeric;
	v_target_mass_level numeric;
	v_density_level numeric;
	v_mass_unit text;
	v_length_unit text;
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
	-- Read locally to derive the target MASS below. Never returned (0061).
	v_target_vol := (v_challenge.answer ->> 'target_volume_mm3')::numeric;
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

	-- NOTE: target_volume_mm3 and tolerance_pct are deliberately ABSENT (0061).
	-- This RPC is anon-granted (the run code is the credential) and is called by
	-- the macros and the add-in, so anything returned here is readable by anyone
	-- holding a code.
	return jsonb_build_object(
		'challenge_id', v_token.challenge_id,
		'title', v_challenge.title,
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

-- ---------------------------------------------------------------------------
-- 4. gauntlet_macro_start: reconsidered, deliberately UNCHANGED.
--
-- Its blank-part guard (p_volume_mm3 > 0) is client-attested, and it stays that
-- way because there is no server-side way to observe a CAD part: the server sees
-- only a number the caller chose. It is NOT part of the F4 disclosure chain -
-- steps 2 and 3 of that chain are what sections 2 and 3 above remove - and
-- tightening it here would be theatre.
--
-- What it genuinely fails to prevent is a SEPARATE cheat that F4 never covered:
-- model the part completely first, then call start (clock begins) and submit
-- immediately, for a ranked time of a few seconds. That is not fixable in SQL.
-- Its real detector is the 0035 telemetry stream (a passing run with no modeling
-- events is visibly fake), which is itself anon-granted and so forgeable. Both
-- facts are recorded in F4's 2026-08-03 note rather than silently folded in.
-- ---------------------------------------------------------------------------
