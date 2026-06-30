-- 0007_gauntlet_modeling_modes.sql
-- IDEA // GAUNTLET: the two remaining modeling modes, Reverse Engineer and
-- Feature Golf. Both reuse the SolidWorks macro and the machine-verified submit
-- path unchanged; this migration only changes scoring/reveal rules and boards.
--
--   1. gauntlet_speedrun_reveal now reveals + mints a token for ANY modeling
--      mode (speedrun, reverse_engineer, feature_golf), not just Speedrun. The
--      Feature Golf drawing is hidden in `answer` and gated behind Start like
--      Speedrun; Reverse Engineer is untimed and shows its reference up front
--      (in the public `prompt`), so its `answer` has no hidden drawing, but it
--      still mints a code to bind the macro run.
--   2. gauntlet_macro_submit now selects the SCORE METRIC by mode (verification
--      stays on volume for all three):
--        speedrun         -> elapsed time (preserved exactly)
--        feature_golf     -> feature_count (lower is better)
--        reverse_engineer -> mean percent deviation of volume and surface area
--                            from canonical (lower is better); untimed.
--   3. gauntlet_leaderboard gains an elapsed-time TIEBREAK (read from
--      value->>'elapsed_ms') so Feature Golf ties on feature count break by time.
--      The mode/source filter is unchanged: modeling ranks only passing macro
--      runs, knowledge keeps all attempts. Per-mode direction is handled by each
--      mode storing its metric as score_metric where lower always ranks better.
--   4. Demo seeds for both modes (placeholders, internally consistent dummy
--      geometry, target_mass = target_volume_cm3 x density).
--
-- Apply manually in the Supabase SQL editor. Idempotent (create or replace +
-- title-guarded seeds).

-- ---------------------------------------------------------------------------
-- 1. Reveal for any modeling mode (mints the submit token + reveal_at).
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_speedrun_reveal(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_mode public.gauntlet_mode;
	v_published boolean;
	v_drawing text;
	v_asset text;
	v_code text;
	v_reveal_at timestamptz := now();
	v_expires timestamptz := now() + interval '30 minutes';
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select c.mode, c.published, c.answer ->> 'drawing', c.asset_ref
		into v_mode, v_published, v_drawing, v_asset
		from public.challenges c
		where c.id = p_challenge_id;

	if not found then
		raise exception 'Challenge not found.';
	end if;
	if v_mode not in ('speedrun', 'reverse_engineer', 'feature_golf') then
		raise exception 'Not a modeling challenge.';
	end if;
	if not v_published and not public.is_teacher() then
		raise exception 'Challenge is not available.';
	end if;

	-- Only the latest reveal stays live: retire prior unused codes.
	update public.gauntlet_run_tokens
		set used_at = v_reveal_at
		where user_id = v_uid and challenge_id = p_challenge_id and used_at is null;

	loop
		v_code := public.gauntlet_gen_code();
		begin
			insert into public.gauntlet_run_tokens (code, user_id, challenge_id, reveal_at, expires_at)
			values (v_code, v_uid, p_challenge_id, v_reveal_at, v_expires);
			exit;
		exception when unique_violation then
			-- collision, regenerate
		end;
	end loop;

	return jsonb_build_object(
		'drawing', v_drawing,
		'asset_ref', v_asset,
		'code', v_code,
		'reveal_at', v_reveal_at,
		'expires_at', v_expires
	);
end;
$$;

revoke all on function public.gauntlet_speedrun_reveal(uuid) from public;
grant execute on function public.gauntlet_speedrun_reveal(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Machine submit: verify on volume (all modes), score metric by mode.
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

	-- Correctness is on VOLUME for every modeling mode.
	v_target_vol := (v_challenge.answer ->> 'target_volume_mm3')::numeric;
	v_tol_pct := coalesce((v_challenge.answer ->> 'tolerance_pct')::numeric, 0);
	v_correct := v_target_vol is not null
		and abs(p_volume_mm3 - v_target_vol) <= v_target_vol * v_tol_pct / 100.0;

	-- Score metric by mode (lower ranks better in all cases).
	if v_challenge.mode = 'speedrun' then
		v_score := v_elapsed_s;                              -- time (preserved exactly)
	elsif v_challenge.mode = 'feature_golf' then
		v_score := p_feature_count;                          -- fewest features
	elsif v_challenge.mode = 'reverse_engineer' then
		-- Closeness to canonical on volume + surface area (mean percent deviation).
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

	-- Claim the code atomically (single use); a concurrent double-submit loses.
	update public.gauntlet_run_tokens
		set used_at = v_now
		where code = v_token.code and used_at is null;
	if not found then
		raise exception 'This submit code was already used. Re-reveal in GAUNTLET to start a new run.';
	end if;

	insert into public.submissions (user_id, challenge_id, mode, value, is_correct, score_metric, source)
	values (v_token.user_id, v_token.challenge_id, v_challenge.mode, v_value, v_correct, v_score, 'macro');

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
-- 3. Leaderboard with an elapsed-time tiebreak (for Feature Golf ties). Output
-- columns are unchanged; `tiebreak` is internal to the ordering only.
-- ---------------------------------------------------------------------------
create or replace view public.gauntlet_leaderboard as
select
	best.challenge_id,
	best.mode,
	best.user_id,
	coalesce(p.full_name, 'Player') as player,
	best.is_correct,
	best.score_metric,
	best.created_at,
	rank() over (
		partition by best.challenge_id
		order by best.is_correct desc nulls last, best.score_metric asc nulls last, best.tiebreak asc nulls last, best.created_at asc
	) as rank
from (
	select distinct on (s.user_id, s.challenge_id)
		s.user_id,
		s.challenge_id,
		s.mode,
		s.is_correct,
		s.score_metric,
		s.created_at,
		(s.value ->> 'elapsed_ms')::numeric as tiebreak
	from public.submissions s
	where s.mode in ('drawing_reading', 'gdt_tolerance', 'spot_the_error')
		or (s.is_correct = true and s.source = 'macro')
	order by s.user_id, s.challenge_id, s.is_correct desc nulls last, s.score_metric asc nulls last, (s.value ->> 'elapsed_ms')::numeric asc nulls last, s.created_at asc
) best
join public.profiles p on p.id = best.user_id
join public.challenges c on c.id = best.challenge_id
where c.published;

grant select on public.gauntlet_leaderboard to authenticated;

-- ---------------------------------------------------------------------------
-- 4a. Reverse Engineer demo seeds. Reference is in the public `prompt` (shown
-- up front, untimed); `answer` carries canonical volume + surface area for the
-- deviation score. Placeholders; mass = target_volume_cm3 x density.
-- ---------------------------------------------------------------------------
insert into public.challenges (mode, title, difficulty, prompt, answer)
select 'reverse_engineer', 'Demo Reverse Engineer: Aluminum Bracket', 3,
$j${"material":"Aluminum 6061","density":2.70,"density_unit":"g/cm³","target_mass":216.0,"mass_unit":"g","tolerance_pct":2,"length_unit":"mm","note":"Reproduce the form from the reference as closely as you can. Scored on volume and surface area accuracy, not time.","demo":true,"reference":"<svg viewBox='0 0 380 240' xmlns='http://www.w3.org/2000/svg' fill='none' font-family='Share Tech Mono, monospace'><rect x='20' y='20' width='340' height='200' stroke='var(--dim)' stroke-width='2' stroke-dasharray='8 6'/><text x='190' y='92' fill='var(--gold)' font-size='18' text-anchor='middle'>REFERENCE PLACEHOLDER</text><text x='190' y='120' fill='var(--dim)' font-size='12' text-anchor='middle'>A photo or reference views go here.</text><text x='190' y='140' fill='var(--dim)' font-size='12' text-anchor='middle'>Real references arrive with author capture.</text><text x='190' y='178' fill='var(--cyan)' font-size='12' text-anchor='middle'>Flow demo: model 80 cm³ to pass.</text></svg>"}$j$::jsonb,
$j${"target_volume_mm3":80000.0,"target_surface_area_mm2":12000.0,"target_mass":216.0,"density":2.70,"tolerance_pct":2,"feature_count":7}$j$::jsonb
where not exists (select 1 from public.challenges where title = 'Demo Reverse Engineer: Aluminum Bracket');

insert into public.challenges (mode, title, difficulty, prompt, answer)
select 'reverse_engineer', 'Demo Reverse Engineer: ABS Knob', 2,
$j${"material":"ABS Plastic","density":1.02,"density_unit":"g/cm³","target_mass":25.5,"mass_unit":"g","tolerance_pct":2.5,"length_unit":"mm","note":"Reproduce the form from the reference as closely as you can. Scored on volume and surface area accuracy, not time.","demo":true,"reference":"<svg viewBox='0 0 380 240' xmlns='http://www.w3.org/2000/svg' fill='none' font-family='Share Tech Mono, monospace'><rect x='20' y='20' width='340' height='200' stroke='var(--dim)' stroke-width='2' stroke-dasharray='8 6'/><text x='190' y='92' fill='var(--gold)' font-size='18' text-anchor='middle'>REFERENCE PLACEHOLDER</text><text x='190' y='120' fill='var(--dim)' font-size='12' text-anchor='middle'>A photo or reference views go here.</text><text x='190' y='140' fill='var(--dim)' font-size='12' text-anchor='middle'>Real references arrive with author capture.</text><text x='190' y='178' fill='var(--cyan)' font-size='12' text-anchor='middle'>Flow demo: model 25 cm³ to pass.</text></svg>"}$j$::jsonb,
$j${"target_volume_mm3":25000.0,"target_surface_area_mm2":5000.0,"target_mass":25.5,"density":1.02,"tolerance_pct":2.5,"feature_count":4}$j$::jsonb
where not exists (select 1 from public.challenges where title = 'Demo Reverse Engineer: ABS Knob');

insert into public.challenges (mode, title, difficulty, prompt, answer)
select 'reverse_engineer', 'Demo Reverse Engineer: Steel Housing', 4,
$j${"material":"Steel AISI 1018","density":7.87,"density_unit":"g/cm³","target_mass":472.2,"mass_unit":"g","tolerance_pct":2,"length_unit":"mm","note":"Reproduce the form from the reference as closely as you can. Scored on volume and surface area accuracy, not time.","demo":true,"reference":"<svg viewBox='0 0 380 240' xmlns='http://www.w3.org/2000/svg' fill='none' font-family='Share Tech Mono, monospace'><rect x='20' y='20' width='340' height='200' stroke='var(--dim)' stroke-width='2' stroke-dasharray='8 6'/><text x='190' y='92' fill='var(--gold)' font-size='18' text-anchor='middle'>REFERENCE PLACEHOLDER</text><text x='190' y='120' fill='var(--dim)' font-size='12' text-anchor='middle'>A photo or reference views go here.</text><text x='190' y='140' fill='var(--dim)' font-size='12' text-anchor='middle'>Real references arrive with author capture.</text><text x='190' y='178' fill='var(--cyan)' font-size='12' text-anchor='middle'>Flow demo: model 60 cm³ to pass.</text></svg>"}$j$::jsonb,
$j${"target_volume_mm3":60000.0,"target_surface_area_mm2":9000.0,"target_mass":472.2,"density":7.87,"tolerance_pct":2,"feature_count":9}$j$::jsonb
where not exists (select 1 from public.challenges where title = 'Demo Reverse Engineer: Steel Housing');

-- ---------------------------------------------------------------------------
-- 4b. Feature Golf demo seeds. Drawing hidden in `answer` (gated behind Start);
-- `par_features` is shown for flavor (not graded). Placeholders.
-- ---------------------------------------------------------------------------
insert into public.challenges (mode, title, difficulty, prompt, answer)
select 'feature_golf', 'Demo Feature Golf: Stepped Block', 2,
$j${"material":"Aluminum 6061","density":2.70,"density_unit":"g/cm³","target_mass":108.0,"mass_unit":"g","tolerance_pct":1,"length_unit":"mm","par_features":4,"note":"Match the target geometry in the fewest features. Volume must be within tolerance to rank.","demo":true}$j$::jsonb,
$j${"drawing":"<svg viewBox='0 0 380 240' xmlns='http://www.w3.org/2000/svg' fill='none' font-family='Share Tech Mono, monospace'><rect x='20' y='20' width='340' height='200' stroke='var(--dim)' stroke-width='2' stroke-dasharray='8 6'/><text x='190' y='92' fill='var(--gold)' font-size='18' text-anchor='middle'>DEMO PLACEHOLDER</text><text x='190' y='120' fill='var(--dim)' font-size='12' text-anchor='middle'>No dimensioned part yet.</text><text x='190' y='140' fill='var(--dim)' font-size='12' text-anchor='middle'>Real drawings arrive with the capture macro.</text><text x='190' y='178' fill='var(--cyan)' font-size='12' text-anchor='middle'>Flow demo: model 40 cm³ to pass; fewer features wins.</text></svg>","target_volume_mm3":40000.0,"target_mass":108.0,"density":2.70,"tolerance_pct":1,"feature_count":4}$j$::jsonb
where not exists (select 1 from public.challenges where title = 'Demo Feature Golf: Stepped Block');

insert into public.challenges (mode, title, difficulty, prompt, answer)
select 'feature_golf', 'Demo Feature Golf: Flanged Plate', 3,
$j${"material":"Steel AISI 1018","density":7.87,"density_unit":"g/cm³","target_mass":236.1,"mass_unit":"g","tolerance_pct":1,"length_unit":"mm","par_features":5,"note":"Match the target geometry in the fewest features. Volume must be within tolerance to rank.","demo":true}$j$::jsonb,
$j${"drawing":"<svg viewBox='0 0 380 240' xmlns='http://www.w3.org/2000/svg' fill='none' font-family='Share Tech Mono, monospace'><rect x='20' y='20' width='340' height='200' stroke='var(--dim)' stroke-width='2' stroke-dasharray='8 6'/><text x='190' y='92' fill='var(--gold)' font-size='18' text-anchor='middle'>DEMO PLACEHOLDER</text><text x='190' y='120' fill='var(--dim)' font-size='12' text-anchor='middle'>No dimensioned part yet.</text><text x='190' y='140' fill='var(--dim)' font-size='12' text-anchor='middle'>Real drawings arrive with the capture macro.</text><text x='190' y='178' fill='var(--cyan)' font-size='12' text-anchor='middle'>Flow demo: model 30 cm³ to pass; fewer features wins.</text></svg>","target_volume_mm3":30000.0,"target_mass":236.1,"density":7.87,"tolerance_pct":1,"feature_count":5}$j$::jsonb
where not exists (select 1 from public.challenges where title = 'Demo Feature Golf: Flanged Plate');

insert into public.challenges (mode, title, difficulty, prompt, answer)
select 'feature_golf', 'Demo Feature Golf: Slotted Bar', 1,
$j${"material":"ABS Plastic","density":1.02,"density_unit":"g/cm³","target_mass":20.4,"mass_unit":"g","tolerance_pct":1.5,"length_unit":"mm","par_features":3,"note":"Match the target geometry in the fewest features. Volume must be within tolerance to rank.","demo":true}$j$::jsonb,
$j${"drawing":"<svg viewBox='0 0 380 240' xmlns='http://www.w3.org/2000/svg' fill='none' font-family='Share Tech Mono, monospace'><rect x='20' y='20' width='340' height='200' stroke='var(--dim)' stroke-width='2' stroke-dasharray='8 6'/><text x='190' y='92' fill='var(--gold)' font-size='18' text-anchor='middle'>DEMO PLACEHOLDER</text><text x='190' y='120' fill='var(--dim)' font-size='12' text-anchor='middle'>No dimensioned part yet.</text><text x='190' y='140' fill='var(--dim)' font-size='12' text-anchor='middle'>Real drawings arrive with the capture macro.</text><text x='190' y='178' fill='var(--cyan)' font-size='12' text-anchor='middle'>Flow demo: model 20 cm³ to pass; fewer features wins.</text></svg>","target_volume_mm3":20000.0,"target_mass":20.4,"density":1.02,"tolerance_pct":1.5,"feature_count":3}$j$::jsonb
where not exists (select 1 from public.challenges where title = 'Demo Feature Golf: Slotted Bar');
