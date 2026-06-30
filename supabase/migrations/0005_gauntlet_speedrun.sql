-- 0005_gauntlet_speedrun.sql
-- IDEA // GAUNTLET: Speedrun, the first modeling mode (manual mass entry MVP).
--
-- No table DDL: the 0004 schema already supports modeling modes. This migration
-- only adds the behavior that was deferred ("This mode cannot be scored yet"):
--   1. gauntlet_submit now grades Speedrun by verifying the typed mass against
--      the target within a tolerance band (knowledge grading is unchanged).
--   2. gauntlet_speedrun_reveal returns the dimensioned drawing on demand. The
--      drawing is stored in the HIDDEN `answer` column (not `prompt`), so it is
--      never fetchable via a normal challenge query: it is revealed only when
--      the student clicks Start, which is also when the client timer begins.
--      This is the reveal-on-start anti-cheat for the supervised-trust manual
--      path. Machine-authoritative timing / start tokens arrive with the macro.
--   3. gauntlet_leaderboard becomes mode-aware: modeling modes rank only PASSING
--      submissions (by time ascending); knowledge modes are unchanged (all
--      attempts, correct-first). A failed Speedrun attempt is still recorded as
--      a submission, it just does not appear on the board.
--   4. Two/three placeholder demo Speedrun challenges are seeded so the flow is
--      testable. They use internally consistent dummy values (mass = volume x
--      density) and a clearly-labeled placeholder drawing, not a real part.
--
-- Speedrun challenge payload (see docs/GAUNTLET.md):
--   prompt (public framing, shown BEFORE Start, no drawing): material, density,
--     density_unit, target_mass, mass_unit, tolerance_pct, length_unit, note,
--     demo. The target_mass / tolerance_pct here are display copies.
--   answer (hidden): drawing (revealed on Start), and the AUTHORITATIVE grading
--     values target_volume, target_mass, density, tolerance_pct, plus
--     surface_area / feature_count captured for audit.
--
-- Apply manually in the Supabase SQL editor. Idempotent (create or replace +
-- title-guarded seeds).

-- ---------------------------------------------------------------------------
-- Reveal RPC: hand back the hidden drawing for a Speedrun challenge on Start.
-- Reads the `answer` column (owner privilege; clients have no grant on it).
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
	if v_mode <> 'speedrun' then
		raise exception 'Not a Speedrun challenge.';
	end if;
	if not v_published and not public.is_teacher() then
		raise exception 'Challenge is not available.';
	end if;

	return jsonb_build_object('drawing', v_drawing, 'asset_ref', v_asset);
end;
$$;

revoke all on function public.gauntlet_speedrun_reveal(uuid) from public;
grant execute on function public.gauntlet_speedrun_reveal(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Grading RPC (the only writer of submissions). Now grades Speedrun too.
-- elapsed_ms is recorded into value for every mode; score_metric is elapsed
-- seconds (lower ranks better). Speedrun verifies the typed mass on tolerance.
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
	v_mass numeric;
	v_target numeric;
	v_tol_pct numeric;
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
	-- Lower-is-better rank metric: elapsed seconds.
	v_score := round(v_elapsed_ms::numeric / 1000.0, 2);
	-- Record both the submitted value and the elapsed time for audit.
	v_value := coalesce(p_value, '{}'::jsonb) || jsonb_build_object('elapsed_ms', v_elapsed_ms);

	if v_challenge.mode in ('drawing_reading', 'gdt_tolerance', 'spot_the_error') then
		v_submitted := nullif(p_value ->> 'answer', '');
		v_answer_key := v_challenge.answer ->> 'correct';
		v_correct := v_submitted is not null
			and v_answer_key is not null
			and v_submitted = v_answer_key;
		v_result := jsonb_build_object(
			'mode', v_challenge.mode,
			'is_correct', v_correct,
			'correct', v_challenge.answer ->> 'correct',
			'explanation', v_challenge.answer ->> 'explanation',
			'score_metric', v_score
		);
	elsif v_challenge.mode = 'speedrun' then
		-- Manual mass entry: a correct VOLUME yields the target mass in the
		-- stated material, but manual entry only gives us a mass number, so the
		-- supervised-trust MVP verifies on mass within the tolerance band. The
		-- macro will verify on volume directly in a later prompt.
		begin
			v_mass := nullif(p_value ->> 'mass', '')::numeric;
		exception when others then
			v_mass := null;
		end;
		v_target := (v_challenge.answer ->> 'target_mass')::numeric;
		v_tol_pct := coalesce((v_challenge.answer ->> 'tolerance_pct')::numeric, 0);
		v_correct := v_mass is not null
			and v_target is not null
			and abs(v_mass - v_target) <= v_target * v_tol_pct / 100.0;
		v_result := jsonb_build_object(
			'mode', 'speedrun',
			'is_correct', v_correct,
			'your_mass', v_mass,
			'target_mass', v_target,
			'tolerance_pct', v_tol_pct,
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

revoke all on function public.gauntlet_submit(uuid, jsonb, integer) from public;
grant execute on function public.gauntlet_submit(uuid, jsonb, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Mode-aware leaderboard. Same shape and owner-privilege/published rules as
-- 0004, but the inner set now drops failed attempts for MODELING modes, so a
-- Speedrun board ranks only passing runs (by time ascending). Knowledge modes
-- keep every attempt (correct-first), so Drawing Reading is unchanged.
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
		order by best.is_correct desc nulls last, best.score_metric asc nulls last, best.created_at asc
	) as rank
from (
	select distinct on (s.user_id, s.challenge_id)
		s.user_id,
		s.challenge_id,
		s.mode,
		s.is_correct,
		s.score_metric,
		s.created_at
	from public.submissions s
	-- Knowledge modes keep all attempts; modeling modes rank only passing runs.
	where s.is_correct = true
		or s.mode in ('drawing_reading', 'gdt_tolerance', 'spot_the_error')
	order by s.user_id, s.challenge_id, s.is_correct desc nulls last, s.score_metric asc nulls last, s.created_at asc
) best
join public.profiles p on p.id = best.user_id
join public.challenges c on c.id = best.challenge_id
where c.published;

grant select on public.gauntlet_leaderboard to authenticated;

-- ---------------------------------------------------------------------------
-- Seed: placeholder demo Speedrun challenges (clearly marked demo:true).
-- Dummy but internally consistent: target_mass = target_volume x density.
-- The drawing is a labeled PLACEHOLDER, not a real dimensioned part; real
-- challenges are authored from SolidWorks parts once the capture macro ships.
-- Each insert is idempotent via a title guard. author_id is null (seeded).
-- ---------------------------------------------------------------------------

insert into public.challenges (mode, title, difficulty, prompt, answer)
select 'speedrun', 'Demo Speedrun: Aluminum Block', 2,
$j${"material":"Aluminum 6061","density":2.70,"density_unit":"g/cm³","target_mass":270.0,"mass_unit":"g","tolerance_pct":1,"length_unit":"mm","note":"Model the part from the revealed drawing, then read Mass Properties > Mass and enter it.","demo":true}$j$::jsonb,
$j${"drawing":"<svg viewBox='0 0 380 240' xmlns='http://www.w3.org/2000/svg' fill='none' font-family='Share Tech Mono, monospace'><rect x='20' y='20' width='340' height='200' stroke='var(--dim)' stroke-width='2' stroke-dasharray='8 6'/><text x='190' y='92' fill='var(--gold)' font-size='18' text-anchor='middle'>DEMO PLACEHOLDER</text><text x='190' y='120' fill='var(--dim)' font-size='12' text-anchor='middle'>No dimensioned part yet.</text><text x='190' y='140' fill='var(--dim)' font-size='12' text-anchor='middle'>Real drawings arrive with the capture macro.</text><text x='190' y='178' fill='var(--cyan)' font-size='12' text-anchor='middle'>Flow demo: enter the target mass to pass.</text></svg>","target_volume":100.0,"volume_unit":"cm³","target_mass":270.0,"density":2.70,"tolerance_pct":1,"surface_area":150.0,"feature_count":3}$j$::jsonb
where not exists (select 1 from public.challenges where title = 'Demo Speedrun: Aluminum Block');

insert into public.challenges (mode, title, difficulty, prompt, answer)
select 'speedrun', 'Demo Speedrun: Steel Bracket', 3,
$j${"material":"Steel AISI 1018","density":7.87,"density_unit":"g/cm³","target_mass":393.5,"mass_unit":"g","tolerance_pct":1,"length_unit":"mm","note":"Model the part from the revealed drawing, then read Mass Properties > Mass and enter it.","demo":true}$j$::jsonb,
$j${"drawing":"<svg viewBox='0 0 380 240' xmlns='http://www.w3.org/2000/svg' fill='none' font-family='Share Tech Mono, monospace'><rect x='20' y='20' width='340' height='200' stroke='var(--dim)' stroke-width='2' stroke-dasharray='8 6'/><text x='190' y='92' fill='var(--gold)' font-size='18' text-anchor='middle'>DEMO PLACEHOLDER</text><text x='190' y='120' fill='var(--dim)' font-size='12' text-anchor='middle'>No dimensioned part yet.</text><text x='190' y='140' fill='var(--dim)' font-size='12' text-anchor='middle'>Real drawings arrive with the capture macro.</text><text x='190' y='178' fill='var(--cyan)' font-size='12' text-anchor='middle'>Flow demo: enter the target mass to pass.</text></svg>","target_volume":50.0,"volume_unit":"cm³","target_mass":393.5,"density":7.87,"tolerance_pct":1,"surface_area":120.0,"feature_count":6}$j$::jsonb
where not exists (select 1 from public.challenges where title = 'Demo Speedrun: Steel Bracket');

insert into public.challenges (mode, title, difficulty, prompt, answer)
select 'speedrun', 'Demo Speedrun: ABS Spacer', 1,
$j${"material":"ABS Plastic","density":1.02,"density_unit":"g/cm³","target_mass":30.6,"mass_unit":"g","tolerance_pct":1.5,"length_unit":"mm","note":"Model the part from the revealed drawing, then read Mass Properties > Mass and enter it.","demo":true}$j$::jsonb,
$j${"drawing":"<svg viewBox='0 0 380 240' xmlns='http://www.w3.org/2000/svg' fill='none' font-family='Share Tech Mono, monospace'><rect x='20' y='20' width='340' height='200' stroke='var(--dim)' stroke-width='2' stroke-dasharray='8 6'/><text x='190' y='92' fill='var(--gold)' font-size='18' text-anchor='middle'>DEMO PLACEHOLDER</text><text x='190' y='120' fill='var(--dim)' font-size='12' text-anchor='middle'>No dimensioned part yet.</text><text x='190' y='140' fill='var(--dim)' font-size='12' text-anchor='middle'>Real drawings arrive with the capture macro.</text><text x='190' y='178' fill='var(--cyan)' font-size='12' text-anchor='middle'>Flow demo: enter the target mass to pass.</text></svg>","target_volume":30.0,"volume_unit":"cm³","target_mass":30.6,"density":1.02,"tolerance_pct":1.5,"surface_area":60.0,"feature_count":2}$j$::jsonb
where not exists (select 1 from public.challenges where title = 'Demo Speedrun: ABS Spacer');
