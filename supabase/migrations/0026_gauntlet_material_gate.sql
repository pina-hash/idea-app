-- 0026_gauntlet_material_gate.sql
-- IDEA // GAUNTLET: a run passes only if the correct MATERIAL is applied.
--
-- The challenge's required material has always lived in the public framing
-- (prompt->>'material', authored in the Speedrun form and shown to students in
-- the spec card); until now nothing verified the student actually applied it,
-- so a run could pass on volume alone with no material (or the wrong one) and
-- a fluke density. This migration adds the gate to the macro submit path:
--
--   1. gauntlet_macro_submit gains p_material (the applied material's library
--      name, read from the part by the add-in / Submit macro via
--      GetMaterialPropertyName2).
--   2. If the challenge specifies a material, the submit is REJECTED (raised,
--      nothing recorded, the solo token stays live so the student can fix the
--      material and resubmit on the same clock) when no material is applied or
--      when the applied name does not match, case-insensitive and trimmed.
--      Messages are student-readable: "No material applied..." / "Wrong
--      material...". Challenges with no material in the prompt skip the gate.
--   3. The applied material is recorded in the submission value for audit.
--
-- Volume tolerance stays the geometry check; material is an added gate on top.
-- The gate covers every gauntlet_macro_submit caller: solo Speedrun, Reverse
-- Engineer, Feature Golf, and room runs submitted by the macro/add-in. Manual
-- practice (gauntlet_submit) and host-supervised room manual submits cannot
-- read the part, so they are unchanged.
--
-- The signature changes, so the previous 6-arg version is dropped first (a
-- plain create-or-replace would leave it as a second overload that bypasses
-- the gate, and PostgREST would refuse the ambiguous RPC name).
--
-- Apply manually in the Supabase SQL editor. Idempotent where practical.

drop function if exists public.gauntlet_macro_submit(text, numeric, text, numeric, integer, numeric);

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
	v_correct boolean;
	v_value jsonb;
	v_rank integer;
	v_required_material text;
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

	-- MATERIAL GATE (0026). When the challenge names a material, the applied
	-- material must match it, case-insensitive and trimmed. Rejected submits
	-- record nothing and consume nothing: fix the material and submit again
	-- (the clock keeps running, like any other failed attempt).
	v_required_material := nullif(trim(v_challenge.prompt ->> 'material'), '');
	if v_required_material is not null then
		if p_material is null or length(trim(p_material)) = 0 then
			raise exception 'No material applied. Apply "%" to your part (right-click Material in the tree), then submit again.',
				v_required_material;
		end if;
		if lower(trim(p_material)) <> lower(v_required_material) then
			raise exception 'Wrong material "%", expected "%". Apply it, then submit again.',
				trim(p_material), v_required_material;
		end if;
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
		'material', nullif(trim(coalesce(p_material, '')), ''),
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

-- The macro/add-in are unauthenticated (anon key); the code is the credential.
revoke all on function public.gauntlet_macro_submit(text, numeric, text, numeric, integer, numeric, text) from public;
grant execute on function public.gauntlet_macro_submit(text, numeric, text, numeric, integer, numeric, text) to anon, authenticated;
