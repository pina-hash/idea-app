-- 0147_gauntlet_close_target_disclosure.sql
-- IDEA // GAUNTLET: close the target/tolerance disclosures 0061 left open, and
-- make 0061's own comments true.
--
-- 0061 IS APPLIED ON PRODUCTION (catalog-confirmed 2026-08-28), so everything
-- below is live behaviour today, not a latent defect in an unapplied file.
--
-- 0061 removed the ranked comparison value from TWO payloads and then wrote
-- comments claiming properties it does not have. Each claim was re-verified
-- against the live definitions before this file was written:
--
--   CLAIM (0061, gauntlet_macro_submit): "target_volume_mm3, your_volume_mm3 and
--   tolerance_pct are deliberately ABSENT. Do not add them back, in any form,
--   including as a computed 'how far off you were' number."
--   FACT: the same return object carries `your_mass_level` AND `target_mass_level`.
--   Mass is volume x a FIXED level density, so their ratio IS the exact signed
--   deviation - the "how far off you were" number the comment forbids - and
--   `target_mass_level` divided by the public `prompt.density` is the target
--   volume itself. The coarse unsigned band sitting above them is redundant
--   against its own payload.
--
--   CLAIM (0061, gauntlet_run_targets): "target_volume_mm3 and tolerance_pct are
--   deliberately ABSENT."
--   FACT: it returns `target_mass_level` and `expected_density_g_cm3` in one
--   object. target_volume_mm3 = target_mass_level / density * 1000. On the
--   committed demo seeds the reconstruction is EXACT (0007: target_volume_mm3
--   80000, density 2.70, so target_mass_level = 216.00 and 216.00 / 2.70 * 1000
--   = 80000, error zero). The repo even ships the divider: `targetVolumeFromMass`
--   in src/lib/gauntlet.ts, whose own docstring describes reconstructing the
--   value 0061 removed.
--
--   CLAIM (0061 header): the unranked practice mass check is the safe fallback
--   that makes the new attempt budget acceptable - "free, unlimited, records
--   nothing, and compares against the same level density".
--   FACT: that fallback is `gauntlet_submit`'s Speedrun branch, which returns
--   `target_mass` AND `tolerance_pct` on EVERY call, pass or fail, to any
--   authenticated caller straight through PostgREST - no run code, no reveal, no
--   clock, no attempt cost, no rate limit. So 0061's stated mitigation for its
--   own tightening was itself a one-call read of the answer key. It also does
--   NOT compare "against the same level density": it compares against
--   `answer.target_mass` directly, while the ranked path has compared against
--   volume x density since 0034. And it "records nothing" is false too - it
--   inserts a submissions row.
--
-- THE RULE THIS FILE ESTABLISHES, because "is this value secret" kept being
-- answered case by case and kept coming out wrong:
--
--   THE SERVER NEVER RETURNS A QUANTITY DERIVED FROM `challenges.answer` THAT
--   REVEALS THE RANKED COMPARISON - not the target, not the tolerance, and not
--   any pair of numbers whose RATIO or DIFFERENCE reconstructs one.
--
--   What a student is shown about a level is the AUTHOR'S decision, expressed in
--   `challenges.prompt`, which reaches the client through the ordinary
--   `challenges` select and the spec card (material, density, target mass,
--   tolerance - the TooTallToby convention). An RPC that re-derives the same
--   quantity from `answer` at machine precision is a SECOND, unauthored
--   disclosure path, and it is the one that tracks the ranked value exactly even
--   when the published copy is rounded, stale, or absent. Conflating the two is
--   how 0061's comments came to be false.
--
-- WHAT A FAILING SUBMIT STILL TEACHES. 0061's coarse unsigned band is the right
-- answer and is PRESERVED and EXTENDED, not removed: a student who is wrong
-- still learns close / near / far, which distinguishes "check a feature" from
-- "you have misread a dimension". What goes is only the exact numbers that made
-- the band redundant. The band is now the ONLY correctness signal on all four
-- paths, and it is ONE implementation (_gauntlet_deviation_band) rather than the
-- four copies this fix would otherwise have created.
--
-- WHAT IS NOT CLOSED HERE, recorded rather than glossed over (0061 got into
-- trouble by claiming more than it did):
--   * ANY unlimited, free correctness signal is a bisection oracle. Removing the
--     exact numbers turns a ONE-CALL read of the answer key into a multi-call
--     search; it does not make the target unreachable. `gauntlet_submit`'s
--     practice branch is unlimited and free BY DESIGN (0061 leans on that), and
--     it has no token to hang a counter on, so it cannot be budgeted here.
--     Bounding it is a product decision about the practice check and needs its
--     own bundle. The ROOM path does have a token, so its band IS budgeted below.
--   * The target volume remains DERIVABLE from the public spec card wherever an
--     author publishes `prompt.target_mass` and `prompt.density` (every seeded
--     level does). That is 0061's own recorded limitation and is unchanged. The
--     gain is that it is now the author's published choice rather than something
--     the server emits from the answer key, and that `answer.tolerance_pct` -
--     the AUTHORITATIVE pass band, which need not equal the published copy - is
--     no longer returned anywhere.
--   * Knowledge-mode ranking. See section 6.
--
-- NO DEPLOY ORDERING. Every signature is unchanged, so this is `create or
-- replace` throughout with no drop (the signature trap does not apply). The
-- client changes in this bundle only STOP reading removed fields and read one
-- new optional one, so both orders are safe: an old client ignores the new key,
-- and a new client renders nothing where a removed key used to be.
--
-- DOES NOT TOUCH `gauntlet_room_board` or `gauntlet_room_roster` (0060, being
-- applied by hand separately). `gauntlet_room_manual_submit` READS the board for
-- a rank, exactly as it always has, and no view is redefined here.
--
-- Apply manually in the Supabase SQL editor, after 0061. Idempotent.

-- ---------------------------------------------------------------------------
-- 1. The shared level arithmetic, stated ONCE.
--
-- These five predicates were previously spelled out inline in each function,
-- which is how gauntlet_submit and gauntlet_room_manual_submit came to grade on
-- `answer.target_mass` with a tolerance default of 0 while gauntlet_macro_submit
-- graded on volume x density with a default of 0.1. Same level, same student,
-- three different verdicts.
--
-- They are private: revoked from every role by name (a bare `revoke ... from
-- public` does NOT close a function on a hosted Supabase project, whose default
-- privileges write direct grants to anon/authenticated/service_role at creation
-- time). Nothing grants them back. They are only ever called from inside the
-- SECURITY DEFINER functions below, which run as the owner and so reach them
-- regardless of grants.
-- ---------------------------------------------------------------------------

create or replace function public._gauntlet_unit_system(p_prompt jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
	select upper(coalesce(nullif(trim(p_prompt ->> 'unit_system'), ''), 'MMGS'));
$$;

comment on function public._gauntlet_unit_system(jsonb) is
	'The level unit system (IPS/MMGS) from the public prompt. One spelling (0147).';

-- Level density normalized to g/cm3. Prefers answer.density (authoritative) and
-- falls back to prompt.density, exactly as 0034/0061 did inline.
create or replace function public._gauntlet_density_g_cm3(p_prompt jsonb, p_answer jsonb)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_density numeric;
	c_lb_in3_to_g_cm3 constant numeric := 27.679904653;
begin
	v_density := coalesce(
		nullif(p_answer ->> 'density', '')::numeric,
		nullif(p_prompt ->> 'density', '')::numeric
	);
	if v_density is not null and public._gauntlet_unit_system(p_prompt) = 'IPS' then
		v_density := v_density * c_lb_in3_to_g_cm3;   -- lb/in3 -> g/cm3
	end if;
	return v_density;
end;
$$;

comment on function public._gauntlet_density_g_cm3(jsonb, jsonb) is
	'Level density in g/cm3 (answer.density preferred, prompt.density fallback, IPS normalized). One spelling (0147).';

-- The pass band width. 0.1 percent is the shared default (0036) and a level may
-- still override it with answer.tolerance_pct. This value is NEVER returned to a
-- caller; it exists so the three grading paths agree on one number.
create or replace function public._gauntlet_tol_pct(p_answer jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$
	select coalesce(nullif(p_answer ->> 'tolerance_pct', '')::numeric, 0.1);
$$;

comment on function public._gauntlet_tol_pct(jsonb) is
	'Pass band percent: answer.tolerance_pct, else the 0.1 shared default (0036). Never returned to a caller (0147).';

-- The level target MASS in grams, on the 0034 model: mass = volume x level
-- density. Falls back to the authored answer.target_mass (read in the level's
-- own unit) only where a level carries no target_volume_mm3, so no existing
-- level loses its grading basis.
create or replace function public._gauntlet_target_mass_g(p_prompt jsonb, p_answer jsonb)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_density numeric := public._gauntlet_density_g_cm3(p_prompt, p_answer);
	v_vol numeric := nullif(p_answer ->> 'target_volume_mm3', '')::numeric;
	v_mass numeric;
	c_lb_to_g constant numeric := 453.59237;
begin
	if v_density is not null and v_vol is not null then
		return (v_vol / 1000.0) * v_density;          -- cm3 x g/cm3 = g
	end if;
	v_mass := nullif(p_answer ->> 'target_mass', '')::numeric;
	if v_mass is null then
		return null;
	end if;
	if public._gauntlet_unit_system(p_prompt) = 'IPS' then
		return v_mass * c_lb_to_g;
	end if;
	return v_mass;
end;
$$;

comment on function public._gauntlet_target_mass_g(jsonb, jsonb) is
	'Level target mass in grams on the 0034 volume x density model, falling back to answer.target_mass. Never returned to a caller (0147).';

-- The ONE coaching vocabulary. Coarse (its finest step is 10x the 0.1 percent
-- pass band, so it cannot be bisected into tolerance in a few probes) and
-- UNSIGNED (direction is the single most useful bit for iterating onto a
-- target). Verbatim the edges and the reasoning 0061 established for
-- gauntlet_macro_submit; this is that band lifted out so the other three paths
-- can use it without a second copy.
create or replace function public._gauntlet_deviation_band(
	p_actual numeric,
	p_target numeric,
	p_correct boolean
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_dev_pct numeric;
	c_band_close_pct constant numeric := 1.0;
	c_band_near_pct constant numeric := 5.0;
begin
	if p_correct then
		return 'pass';
	end if;
	if p_target is null or p_target = 0 or p_actual is null then
		return 'unknown';
	end if;
	v_dev_pct := abs(p_actual - p_target) / p_target * 100.0;
	if v_dev_pct <= c_band_close_pct then
		return 'close';
	elsif v_dev_pct <= c_band_near_pct then
		return 'near';
	else
		return 'far';
	end if;
end;
$$;

comment on function public._gauntlet_deviation_band(numeric, numeric, boolean) is
	'Coarse UNSIGNED correctness band (pass/close/near/far/unknown). The only correctness signal a failing caller gets on any path (0147, lifted from 0061).';

revoke all on function public._gauntlet_unit_system(jsonb) from public, anon, authenticated, service_role;
revoke all on function public._gauntlet_density_g_cm3(jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function public._gauntlet_tol_pct(jsonb) from public, anon, authenticated, service_role;
revoke all on function public._gauntlet_target_mass_g(jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function public._gauntlet_deviation_band(numeric, numeric, boolean) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. gauntlet_submit: the Speedrun practice branch stops returning the answer key.
--
-- THE DEFECT. Its Speedrun branch returned `target_mass` and `tolerance_pct` on
-- EVERY call, pass or fail. It is granted to `authenticated` and takes a bare
-- challenge id, so any signed-in student reaches it directly through PostgREST
-- with no run code, no reveal, no clock, no attempt cost and no rate limit:
--
--   POST /rest/v1/rpc/gauntlet_submit {"p_challenge_id":"<uuid>","p_value":{"mass":0}}
--   -> {"target_mass": 216.0, "tolerance_pct": 2, ...}
--
-- `prompt.density` is public framing by design, so that answer also yields
-- target_volume_mm3 = target_mass / density * 1000 - the exact value the ranked
-- macro check compares against. This is step 3 of the F4 chain 0061 exists to
-- close, standing wide open through a door 0061 never touched, and it is the
-- very surface 0061's header nominates as the safe free fallback.
--
-- WHAT CHANGES:
--   * `target_mass` and `tolerance_pct` are GONE from the result. `your_mass` -
--     the caller's own typed number - stays, and `deviation_band` replaces them,
--     so the practice check still teaches close / near / far.
--   * The comparison now uses the SAME basis as the ranked path (0034): target
--     mass = target_volume_mm3 x level density, with the 0.1 default tolerance,
--     both via the shared helpers. It previously read `answer.target_mass` with
--     a tolerance default of ZERO, which meant a level carrying no explicit band
--     demanded an EXACT float match and could never pass at all - so 0061's
--     claim that this check "compares against the same level density" was false
--     in two directions at once. Every seeded level sets tolerance_pct and has
--     target_volume_mm3 = target_mass / density exactly, so no seeded level
--     changes verdict; what changes is that an unbanded or volume-only level now
--     grades instead of being unpassable.
--   * The KNOWLEDGE branch is deliberately BYTE-FOR-BYTE UNCHANGED. See section 6.
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_submit(
	p_challenge_id uuid,
	p_value jsonb,
	p_elapsed_ms integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_challenge public.challenges%rowtype;
	v_elapsed_ms integer;
	v_score numeric;
	v_value jsonb;
	v_correct boolean;
	v_result jsonb;
	v_submitted text;
	v_answer_key text;
	v_answer_type text;
	v_mass numeric;
	v_target_g numeric;
	v_target_level numeric;
	v_tol_pct numeric;
	v_unit_system text;
	v_band text;
	c_lb_to_g constant numeric := 453.59237;
begin
	if v_uid is null then
		raise exception 'You must be signed in to submit.';
	end if;

	select * into v_challenge from public.challenges where id = p_challenge_id;
	if not found then
		raise exception 'Challenge not found.';
	end if;
	if not v_challenge.published and not public.is_teacher() then
		raise exception 'Challenge is not available.';
	end if;

	v_elapsed_ms := greatest(coalesce(p_elapsed_ms, 0), 0);
	v_score := round(v_elapsed_ms::numeric / 1000.0, 2);
	v_value := coalesce(p_value, '{}'::jsonb) || jsonb_build_object('elapsed_ms', v_elapsed_ms);

	if v_challenge.mode in ('drawing_reading', 'gdt_tolerance', 'spot_the_error') then
		-- UNCHANGED from 0008. See section 6 for why the clock and the answer key
		-- are not touched in this bundle.
		v_submitted := nullif(btrim(p_value ->> 'answer'), '');
		v_answer_key := v_challenge.answer ->> 'correct';
		v_answer_type := coalesce(v_challenge.answer ->> 'type', 'choice');
		if v_submitted is null or v_answer_key is null then
			v_correct := false;
		elsif v_answer_type = 'numeric' then
			begin
				v_correct := abs(v_submitted::numeric - v_answer_key::numeric)
					<= coalesce((v_challenge.answer ->> 'tolerance')::numeric, 0);
			exception when others then
				v_correct := false;
			end;
		elsif v_answer_type = 'text' then
			v_correct := lower(btrim(v_submitted)) = lower(btrim(v_answer_key));
		else
			v_correct := v_submitted = v_answer_key;
		end if;
		v_result := jsonb_build_object(
			'mode', v_challenge.mode,
			'is_correct', v_correct,
			'correct', v_answer_key,
			'explanation', v_challenge.answer ->> 'explanation',
			'score_metric', v_score
		);
	elsif v_challenge.mode = 'speedrun' then
		-- Manual mass entry (unranked supervised practice; the leaderboard ranks
		-- modeling rows only when source = 'macro', so this never ranks).
		begin
			v_mass := nullif(p_value ->> 'mass', '')::numeric;
		exception when others then
			v_mass := null;
		end;
		v_unit_system := public._gauntlet_unit_system(v_challenge.prompt);
		v_target_g := public._gauntlet_target_mass_g(v_challenge.prompt, v_challenge.answer);
		v_tol_pct := public._gauntlet_tol_pct(v_challenge.answer);
		-- The student types in the LEVEL's unit, so compare there.
		v_target_level := case
			when v_target_g is null then null
			when v_unit_system = 'IPS' then v_target_g / c_lb_to_g
			else v_target_g
		end;
		v_correct := v_mass is not null
			and v_target_level is not null
			and abs(v_mass - v_target_level) <= v_target_level * v_tol_pct / 100.0;
		v_band := public._gauntlet_deviation_band(v_mass, v_target_level, v_correct);
		v_value := v_value || jsonb_build_object('deviation_band', v_band);
		-- NOTE: `target_mass` and `tolerance_pct` are deliberately ABSENT (0147),
		-- and so is anything they can be rebuilt from. `your_mass` is the caller's
		-- OWN typed number, so it discloses nothing; `deviation_band` is coarse and
		-- unsigned. Do not add a percentage, a delta, a target in any unit, or a
		-- band edge here: any second number beside `your_mass` whose ratio or
		-- difference with it yields the target puts this straight back.
		v_result := jsonb_build_object(
			'mode', 'speedrun',
			'is_correct', v_correct,
			'your_mass', v_mass,
			'mass_unit', case when v_unit_system = 'IPS' then 'lb' else 'g' end,
			'unit_system', v_unit_system,
			'deviation_band', v_band,
			'score_metric', v_score
		);
	else
		raise exception 'This mode cannot be scored yet.';
	end if;

	insert into public.submissions (user_id, challenge_id, mode, value, is_correct, score_metric)
	values (v_uid, p_challenge_id, v_challenge.mode, v_value, v_correct, v_score);

	return v_result;
end;
$$;

revoke all on function public.gauntlet_submit(uuid, jsonb, integer) from public, anon, authenticated, service_role;
grant execute on function public.gauntlet_submit(uuid, jsonb, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. gauntlet_run_targets: drop target_mass_level, and honour the token lifecycle.
--
-- TWO defects, both live.
--
--   (a) 0061's own comment says "target_volume_mm3 and tolerance_pct are
--       deliberately ABSENT", and the function then returns `target_mass_level`
--       beside `expected_density_g_cm3`. One division reconstructs the target
--       volume, exactly on every committed seed. The comment describes a
--       property the function does not have, and the client-side divider is
--       shipped in this repo (`targetVolumeFromMass`, removed from the RPC path
--       in this bundle).
--
--   (b) It checked neither `used_at` nor `expires_at`. It is granted to `anon`
--       and the run code IS the credential, so a SPENT or EXPIRED code still
--       answered - including a code 0061 itself retired for exhausting the
--       failure budget, which is precisely the state where a caller is being
--       told to stop guessing. Every sibling that takes a code (macro_submit,
--       room_manual_submit) has always refused both. It now refuses both, with
--       the same sentences, so the three agree.
--
-- WHAT STAYS is exactly the level framing the student is already shown on the
-- public spec card before the run starts - material, density, unit system - so
-- the add-in's live mass readout keeps computing the student's OWN mass from the
-- level density. What goes is the only value in the payload that came from
-- `answer` and named the target.
--
-- The C# add-in (tools/solidworks-addin) reads `target_mass_level` into a
-- `double?` and guards every use with `.HasValue`, so an installed build DEGRADES
-- rather than breaking: it stops printing a target line. No rebuild is required
-- for correctness. Verified by reading GauntletClient.AsDouble and every
-- TaskPaneControl call site, not assumed.
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
	v_now timestamptz := now();
	v_unit_system text;
	v_density_gcm3 numeric;
	v_density_level numeric;
	v_mass_unit text;
	v_length_unit text;
begin
	if p_code is null or length(trim(p_code)) = 0 then
		raise exception 'Missing code.';
	end if;
	select * into v_token from public.gauntlet_run_tokens where code = upper(trim(p_code));
	if not found then
		raise exception 'Invalid code.';
	end if;
	-- (b) above. Same refusals the submit paths have always given.
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

	v_unit_system := public._gauntlet_unit_system(v_challenge.prompt);
	v_density_gcm3 := public._gauntlet_density_g_cm3(v_challenge.prompt, v_challenge.answer);
	-- The level's stored density in its own unit, for display beside the normalized one.
	v_density_level := coalesce(
		nullif(v_challenge.answer ->> 'density', '')::numeric,
		nullif(v_challenge.prompt ->> 'density', '')::numeric
	);
	if v_unit_system = 'IPS' then
		v_mass_unit := 'lb';
		v_length_unit := 'in';
	else
		v_mass_unit := 'g';
		v_length_unit := 'mm';
	end if;

	-- NOTE: target_volume_mm3, tolerance_pct AND target_mass_level are all
	-- deliberately ABSENT (0147). This RPC is anon-granted and the code is the
	-- only credential, so anything returned here is readable by anyone holding a
	-- code. `expected_density_g_cm3` is safe ONLY because no target accompanies
	-- it: density alone reconstructs nothing. Adding any target back - in any
	-- unit, as a mass, a volume, a band edge or a percentage - re-opens the
	-- division this section exists to remove.
	return jsonb_build_object(
		'challenge_id', v_token.challenge_id,
		'title', v_challenge.title,
		'expected_density_g_cm3', v_density_gcm3,
		'density_level', v_density_level,
		'unit_system', v_unit_system,
		'mass_unit', v_mass_unit,
		'length_unit', v_length_unit,
		'material', nullif(trim(v_challenge.prompt ->> 'material'), '')
	);
end;
$$;

revoke all on function public.gauntlet_run_targets(text) from public, anon, authenticated, service_role;
grant execute on function public.gauntlet_run_targets(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. gauntlet_macro_submit: drop target_mass_level, keep everything else.
--
-- 0061 removed the volume trio and then returned `your_mass_level` and
-- `target_mass_level` together. Because density is a FIXED level constant:
--
--     your_mass_level / target_mass_level  =  your_volume / target_volume
--
-- which is the exact SIGNED deviation - the "how far off you were" number
-- 0061's own comment forbids adding back "in any form" - and
--
--     target_mass_level / density * 1000   =  target_volume_mm3
--
-- which is the ranked comparison value itself, since `prompt.density` is public.
-- So the coarse band directly above them in the same object was redundant
-- against its own payload for the whole of 0061's life.
--
-- `your_mass_level` STAYS: it is the caller's own submitted volume times a
-- public density, so it tells them nothing they did not send. `target_mass_level`
-- GOES. The band, the attempt budget, the token lifecycle, the attribution, the
-- server-stamped clock and the volume comparison itself are all UNCHANGED from
-- 0061; the arithmetic simply moved into the shared helpers so the four paths
-- cannot drift again. Behaviour here is otherwise identical: this function
-- already used the 0.1 default and the same band edges.
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
	v_band text;
	-- Attempt budget (0061).
	v_failed integer;
	v_attempts_left integer;
	v_retired boolean := false;
	-- Level-sourced density + mass (never the part's assigned material).
	v_unit_system text;
	v_density_gcm3 numeric;
	v_your_mass_g numeric;
	v_your_mass_level numeric;
	v_mass_unit text;
	-- Non-gating material advisory.
	v_detected_material text;
	v_required_material text;
	v_material_matches boolean;
	c_max_failed_attempts constant integer := 3;
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
	v_tol_pct := public._gauntlet_tol_pct(v_challenge.answer);
	v_correct := v_target_vol is not null
		and abs(p_volume_mm3 - v_target_vol) <= v_target_vol * v_tol_pct / 100.0;

	-- ---- COARSE, UNSIGNED DEVIATION BAND ------------------------------------
	v_band := public._gauntlet_deviation_band(p_volume_mm3, v_target_vol, v_correct);

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
	-- The caller's OWN mass only. The level's target mass is NOT computed here
	-- any more, because it was returned (0147).
	v_unit_system := public._gauntlet_unit_system(v_challenge.prompt);
	v_density_gcm3 := public._gauntlet_density_g_cm3(v_challenge.prompt, v_challenge.answer);
	if v_density_gcm3 is not null then
		v_your_mass_g := (p_volume_mm3 / 1000.0) * v_density_gcm3;
		if v_unit_system = 'IPS' then
			v_mass_unit := 'lb';
			v_your_mass_level := round(v_your_mass_g / c_lb_to_g, 4);
		else
			v_mass_unit := 'g';
			v_your_mass_level := round(v_your_mass_g, 2);
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

	-- ---- TOKEN LIFECYCLE (unchanged from 0061) ------------------------------
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

	-- The stored value keeps the full picture for the audit trail (the student's
	-- OWN measurement plus their attempt number, never the target).
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

	-- NOTE: target_volume_mm3, your_volume_mm3 and tolerance_pct are ABSENT
	-- (0061), and target_mass_level is now ABSENT too (0147) because it was the
	-- same disclosure wearing a unit conversion. `your_mass_level` is the ONLY
	-- mass here and is derived entirely from what the caller sent. Do not add a
	-- second number beside it whose ratio or difference with it yields the
	-- target: that pairing - not the field name - is the defect.
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
		'detected_material', v_detected_material,
		'material_matches', v_material_matches
	);
end;
$$;

revoke all on function public.gauntlet_macro_submit(text, numeric, text, numeric, integer, numeric, text, text) from public, anon, authenticated, service_role;
grant execute on function public.gauntlet_macro_submit(text, numeric, text, numeric, integer, numeric, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. gauntlet_room_manual_submit: the one path 0061 never superseded.
--
-- Untouched since 0010, and the worst of the four because it is the LIVE
-- CLASSROOM path. It returned `target_mass`, `your_mass` AND `tolerance_pct` on
-- every submit, and a FAILING submit does not consume the token (by design: a
-- racer retries on the shared clock). So one deliberate wrong entry yielded the
-- exact target and the exact band, and the next entry ranked on the room board
-- in front of the class. No modelling required.
--
-- It also drifted from every other path: it graded typed mass against
-- `answer.target_mass` while everything else moved to volume x density in 0034,
-- and its tolerance defaulted to ZERO rather than 0.1, so a level with no
-- explicit band demanded an exact float match and could never be passed.
--
-- WHAT CHANGES:
--   * `target_mass` and `tolerance_pct` are GONE. `your_mass` - the racer's own
--     typed number - stays.
--   * Grading moves onto the shared helpers, so this path, the practice check
--     and the ranked macro now agree on one target basis and one pass band.
--   * A coarse band is returned so a wrong racer still learns something, AND IT
--     IS BUDGETED. That pairing is deliberate and the two halves must not be
--     separated: `p_mass_g` is a TYPED number, so an unbudgeted band here would
--     be a fast bisection oracle reachable with no CAD at all - strictly worse
--     than returning no band. The counter is 0061's existing
--     `failed_attempts` column and its existing cap, so there is one rule.
--   * WHAT IS BUDGETED IS THE COACHING, NOT THE SUBMIT. Past the cap the band
--     comes back 'withheld' and the racer can still submit and still pass. A
--     room round is host-supervised and single-shot for the student; retiring
--     their token mid-round would lock them out of a live race in front of the
--     class over three mistyped numbers, which is a far worse failure than a
--     bounded oracle. This is why the solo retirement rule is NOT copied here.
--     `used_at` is still written only on a pass, exactly as before.
-- ---------------------------------------------------------------------------
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
	v_target_g numeric;
	v_target_level numeric;
	v_tol_pct numeric;
	v_unit_system text;
	v_correct boolean;
	v_band text;
	v_failed integer;
	v_coaching_left integer;
	v_value jsonb;
	v_rank integer;
	c_max_coached_attempts constant integer := 3;
	c_lb_to_g constant numeric := 453.59237;
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

	v_unit_system := public._gauntlet_unit_system(v_challenge.prompt);
	v_target_g := public._gauntlet_target_mass_g(v_challenge.prompt, v_challenge.answer);
	v_tol_pct := public._gauntlet_tol_pct(v_challenge.answer);
	-- The racer types in the LEVEL's unit, so compare there.
	v_target_level := case
		when v_target_g is null then null
		when v_unit_system = 'IPS' then v_target_g / c_lb_to_g
		else v_target_g
	end;
	v_correct := v_target_level is not null
		and abs(p_mass_g - v_target_level) <= v_target_level * v_tol_pct / 100.0;

	-- Spend a coaching attempt on a miss. Never touches used_at, so a racer is
	-- never locked out of a live round; only the band goes quiet.
	if v_correct then
		v_failed := coalesce(v_token.failed_attempts, 0);
	else
		update public.gauntlet_run_tokens
			set failed_attempts = coalesce(failed_attempts, 0) + 1
			where code = v_token.code
			returning failed_attempts into v_failed;
	end if;
	v_coaching_left := greatest(0, c_max_coached_attempts - coalesce(v_failed, c_max_coached_attempts));

	if v_correct then
		v_band := 'pass';
	elsif v_coaching_left > 0 then
		v_band := public._gauntlet_deviation_band(p_mass_g, v_target_level, false);
	else
		v_band := 'withheld';
	end if;

	v_value := jsonb_build_object(
		'mass_g', p_mass_g,
		'elapsed_ms', v_elapsed_ms,
		'deviation_band', v_band,
		'failed_attempts', v_failed
	);

	-- A failed room run keeps the token live to retry on the shared clock; only a
	-- pass consumes it (single passing run per racer per round). Unchanged.
	if v_correct then
		update public.gauntlet_run_tokens set used_at = v_now
			where code = v_token.code and used_at is null;
		if not found then raise exception 'You have already submitted a passing run this round.'; end if;
	end if;

	insert into public.submissions (user_id, challenge_id, mode, value, is_correct, score_metric, source, room_id)
	values (v_token.user_id, v_token.challenge_id, v_challenge.mode, v_value, v_correct, v_elapsed_s, 'manual', v_token.room_id);

	select rb.rank into v_rank from public.gauntlet_room_board rb
		where rb.room_id = v_token.room_id and rb.user_id = v_token.user_id;

	-- NOTE: target_mass and tolerance_pct are deliberately ABSENT (0147).
	-- `your_mass` is the racer's own typed number and discloses nothing. Do not
	-- pair it with a target, a delta or a percentage.
	return jsonb_build_object(
		'is_correct', v_correct,
		'score_metric', v_elapsed_s,
		'rank', v_rank,
		'your_mass', p_mass_g,
		'mass_unit', case when v_unit_system = 'IPS' then 'lb' else 'g' end,
		'unit_system', v_unit_system,
		'deviation_band', v_band,
		'coaching_remaining', v_coaching_left
	);
end;
$$;

revoke all on function public.gauntlet_room_manual_submit(text, numeric) from public, anon, authenticated, service_role;
grant execute on function public.gauntlet_room_manual_submit(text, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. KNOWLEDGE-MODE RANKING: reported, NOT fixed here, and this is why.
--
-- THE DEFECT, verified against the live definitions:
--   * `gauntlet_submit(p_challenge_id, p_value, p_elapsed_ms)` takes the elapsed
--     time as a PARAMETER. It becomes `score_metric` unchanged
--     (round(p_elapsed_ms / 1000, 2)), with no source check and no timing check.
--   * `gauntlet_leaderboard` (0007) admits knowledge rows on `s.mode in
--     ('drawing_reading','gdt_tolerance','spot_the_error')` alone - no
--     `source` predicate, unlike the modeling branch which requires
--     `source = 'macro'` - and its `distinct on (user_id, challenge_id)` keeps
--     the BEST row, ordered `is_correct desc, score_metric asc`.
--   * The same call returns `correct` and `explanation` on a WRONG answer.
--   So: submit anything, read the key off the refusal, resubmit correct with
--   `p_elapsed_ms: 0`, and the second row supersedes the first at rank 1 on
--   every knowledge board.
--
-- THE INSTRUCTION WAS TO SERVER-STAMP THE CLOCK. IT CANNOT BE DONE HERE:
-- KNOWLEDGE MODES HAVE NO SERVER-SIDE START EVENT TO TIME FROM. Modeling modes
-- time from `gauntlet_run_tokens.started_at`, stamped by `gauntlet_macro_start`
-- (0016) and bound to a run_id, or from the room's `reveal_at`. Knowledge modes
-- are web-only by construction (0008: "no macro, no submit token, no geometry
-- capture"), so nothing anywhere records when a student was shown the question.
-- There is no row, no token and no event to subtract from `now()`. Confirmed by
-- sweeping every migration for a knowledge-mode start path; there is none.
--
-- THE SMALLEST THING THAT WOULD GIVE THEM ONE, proposed and deliberately NOT
-- built in this bundle:
--
--   A single table `gauntlet_knowledge_starts (user_id, challenge_id,
--   started_at, PRIMARY KEY (user_id, challenge_id))` plus one RPC
--   `gauntlet_knowledge_start(p_challenge_id uuid)` that inserts
--   `(auth.uid(), p_challenge_id, now())` with `on conflict do nothing` and
--   returns nothing. The play route calls it when the question renders.
--   `gauntlet_submit` then computes `now() - started_at` itself and IGNORES
--   `p_elapsed_ms` for scoring, which also makes the first attempt the timed
--   one for free: `on conflict do nothing` means a re-read cannot restart the
--   clock, so the resubmit-with-zero loop scores the total time including the
--   detour through the answer key rather than 0.
--
--   That is one table, one RPC and one arithmetic change, and it mirrors
--   `gauntlet_macro_start`'s existing shape rather than inventing a scheme.
--
-- WHY IT IS NOT IN THIS FILE. It is a new table with new RLS, a new grant, a new
-- client call on three play routes, and a DEPLOY ORDERING problem this bundle
-- otherwise does not have (a submit that requires a start row refuses every
-- in-flight session until the routes ship). It also forces a product decision
-- this bundle has no mandate for: what a student sees on a re-attempt once the
-- clock is real. Folding it in would put an unordered, behaviour-changing
-- migration inside a disclosure fix that is otherwise order-free.
--
-- WHAT THIS BUNDLE DELIBERATELY DID NOT DO TO KNOWLEDGE MODES, so the next
-- session does not mistake restraint for oversight: it did not withhold
-- `correct`/`explanation` on a wrong answer (that is the teaching the coarse
-- band exists to preserve elsewhere, and withholding it without a working clock
-- buys nothing), it did not clamp or floor `p_elapsed_ms` (a guess dressed as a
-- check), and it did not add a `source` predicate to `gauntlet_leaderboard`
-- (a ranking change, and the view is adjacent to 0060, which is being applied by
-- hand separately).
--
-- The knowledge branch of gauntlet_submit in section 2 is therefore
-- byte-for-byte 0008's.
