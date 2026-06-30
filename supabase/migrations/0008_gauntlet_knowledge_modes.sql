-- 0008_gauntlet_knowledge_modes.sql
-- IDEA // GAUNTLET: the last two knowledge modes, GD&T and Tolerance and Spot
-- the Error. Both are web-only and answer-graded exactly like Drawing Reading
-- (no macro, no submit token, no geometry capture). This completes all six modes.
--
--   1. gauntlet_submit's knowledge grading is generalized to grade by answer
--      `type`: 'choice' (exact id match, the default, preserves Drawing Reading
--      exactly), 'text' (case/space-insensitive exact match), and 'numeric'
--      (number within an optional `tolerance`). The Speedrun manual branch is
--      unchanged. Submissions stay `source = 'manual'`; the leaderboard already
--      ranks knowledge modes by correctness then time, so no view change.
--   2. Seeds: six GD&T questions (multiple choice + numeric) and five Spot the
--      Error questions (pick the flawed numbered callout), authored as plausible,
--      internally consistent questions with correct answers.
--
-- Apply manually in the Supabase SQL editor. Idempotent (create or replace +
-- title-guarded seeds).

-- ---------------------------------------------------------------------------
-- 1. Generalized knowledge grading (type: choice / text / numeric).
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
	v_score := round(v_elapsed_ms::numeric / 1000.0, 2);
	v_value := coalesce(p_value, '{}'::jsonb) || jsonb_build_object('elapsed_ms', v_elapsed_ms);

	if v_challenge.mode in ('drawing_reading', 'gdt_tolerance', 'spot_the_error') then
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
		-- Manual mass entry (supervised practice). Unchanged from 0005.
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
-- 2a. GD&T and Tolerance seeds. The feature control frame SVG (position, Ø0.5
-- Ⓜ, datums A B C) is reused across the first four; fits use a shaft-in-hole.
-- ---------------------------------------------------------------------------
insert into public.challenges (mode, title, difficulty, prompt, answer)
select 'gdt_tolerance', 'Read the Control: Characteristic', 2,
$j${"drawing":"<svg viewBox='0 0 380 120' xmlns='http://www.w3.org/2000/svg' fill='none' font-family='Share Tech Mono, monospace'><rect x='40' y='40' width='300' height='44' stroke='var(--white)' stroke-width='2'/><line x1='100' y1='40' x2='100' y2='84' stroke='var(--white)' stroke-width='2'/><line x1='210' y1='40' x2='210' y2='84' stroke='var(--white)' stroke-width='2'/><line x1='250' y1='40' x2='250' y2='84' stroke='var(--white)' stroke-width='2'/><line x1='290' y1='40' x2='290' y2='84' stroke='var(--white)' stroke-width='2'/><circle cx='70' cy='62' r='11' stroke='var(--cyan)' stroke-width='2'/><line x1='70' y1='47' x2='70' y2='77' stroke='var(--cyan)' stroke-width='2'/><line x1='55' y1='62' x2='85' y2='62' stroke='var(--cyan)' stroke-width='2'/><text x='112' y='67' fill='var(--white)' font-size='15'>Ø0.5</text><circle cx='190' cy='62' r='9' stroke='var(--gold)' stroke-width='1.5'/><text x='190' y='67' fill='var(--gold)' font-size='12' text-anchor='middle'>M</text><text x='230' y='68' fill='var(--green)' font-size='15' text-anchor='middle'>A</text><text x='270' y='68' fill='var(--green)' font-size='15' text-anchor='middle'>B</text><text x='315' y='68' fill='var(--green)' font-size='15' text-anchor='middle'>C</text></svg>","question":"What geometric characteristic does this feature control frame specify?","instructions":"Read the symbol in the first cell of the frame.","options":[{"id":"a","label":"Position"},{"id":"b","label":"Flatness"},{"id":"c","label":"Circularity"},{"id":"d","label":"Profile of a surface"}]}$j$::jsonb,
$j${"correct":"a","type":"choice","explanation":"The crosshair-in-a-circle symbol is the Position symbol. The frame controls the location of the feature relative to datums A, B, and C."}$j$::jsonb
where not exists (select 1 from public.challenges where title = 'Read the Control: Characteristic');

insert into public.challenges (mode, title, difficulty, prompt, answer)
select 'gdt_tolerance', 'Read the Control: Tolerance Zone', 2,
$j${"drawing":"<svg viewBox='0 0 380 120' xmlns='http://www.w3.org/2000/svg' fill='none' font-family='Share Tech Mono, monospace'><rect x='40' y='40' width='300' height='44' stroke='var(--white)' stroke-width='2'/><line x1='100' y1='40' x2='100' y2='84' stroke='var(--white)' stroke-width='2'/><line x1='210' y1='40' x2='210' y2='84' stroke='var(--white)' stroke-width='2'/><line x1='250' y1='40' x2='250' y2='84' stroke='var(--white)' stroke-width='2'/><line x1='290' y1='40' x2='290' y2='84' stroke='var(--white)' stroke-width='2'/><circle cx='70' cy='62' r='11' stroke='var(--cyan)' stroke-width='2'/><line x1='70' y1='47' x2='70' y2='77' stroke='var(--cyan)' stroke-width='2'/><line x1='55' y1='62' x2='85' y2='62' stroke='var(--cyan)' stroke-width='2'/><text x='112' y='67' fill='var(--white)' font-size='15'>Ø0.5</text><circle cx='190' cy='62' r='9' stroke='var(--gold)' stroke-width='1.5'/><text x='190' y='67' fill='var(--gold)' font-size='12' text-anchor='middle'>M</text><text x='230' y='68' fill='var(--green)' font-size='15' text-anchor='middle'>A</text><text x='270' y='68' fill='var(--green)' font-size='15' text-anchor='middle'>B</text><text x='315' y='68' fill='var(--green)' font-size='15' text-anchor='middle'>C</text></svg>","question":"What is the diameter of the tolerance zone, in millimeters?","instructions":"Read the tolerance cell. The Ø prefix matters.","input":{"type":"numeric","unit":"mm","placeholder":"0.0"}}$j$::jsonb,
$j${"correct":"0.5","type":"numeric","tolerance":0,"explanation":"Ø0.5 specifies a cylindrical tolerance zone 0.5 mm in diameter. The Ø means the zone is a cylinder, not a width."}$j$::jsonb
where not exists (select 1 from public.challenges where title = 'Read the Control: Tolerance Zone');

insert into public.challenges (mode, title, difficulty, prompt, answer)
select 'gdt_tolerance', 'Read the Control: Primary Datum', 1,
$j${"drawing":"<svg viewBox='0 0 380 120' xmlns='http://www.w3.org/2000/svg' fill='none' font-family='Share Tech Mono, monospace'><rect x='40' y='40' width='300' height='44' stroke='var(--white)' stroke-width='2'/><line x1='100' y1='40' x2='100' y2='84' stroke='var(--white)' stroke-width='2'/><line x1='210' y1='40' x2='210' y2='84' stroke='var(--white)' stroke-width='2'/><line x1='250' y1='40' x2='250' y2='84' stroke='var(--white)' stroke-width='2'/><line x1='290' y1='40' x2='290' y2='84' stroke='var(--white)' stroke-width='2'/><circle cx='70' cy='62' r='11' stroke='var(--cyan)' stroke-width='2'/><line x1='70' y1='47' x2='70' y2='77' stroke='var(--cyan)' stroke-width='2'/><line x1='55' y1='62' x2='85' y2='62' stroke='var(--cyan)' stroke-width='2'/><text x='112' y='67' fill='var(--white)' font-size='15'>Ø0.5</text><circle cx='190' cy='62' r='9' stroke='var(--gold)' stroke-width='1.5'/><text x='190' y='67' fill='var(--gold)' font-size='12' text-anchor='middle'>M</text><text x='230' y='68' fill='var(--green)' font-size='15' text-anchor='middle'>A</text><text x='270' y='68' fill='var(--green)' font-size='15' text-anchor='middle'>B</text><text x='315' y='68' fill='var(--green)' font-size='15' text-anchor='middle'>C</text></svg>","question":"Which datum is the primary datum reference?","instructions":"Datum references are read left to right in the frame.","options":[{"id":"a","label":"A"},{"id":"b","label":"B"},{"id":"c","label":"C"},{"id":"d","label":"They are equal"}]}$j$::jsonb,
$j${"correct":"a","type":"choice","explanation":"Datum references are read left to right; the first listed, A, is the primary datum. B is secondary and C is tertiary. Order matters, it sets up the datum reference frame."}$j$::jsonb
where not exists (select 1 from public.challenges where title = 'Read the Control: Primary Datum');

insert into public.challenges (mode, title, difficulty, prompt, answer)
select 'gdt_tolerance', 'The Circled M Modifier', 3,
$j${"drawing":"<svg viewBox='0 0 380 120' xmlns='http://www.w3.org/2000/svg' fill='none' font-family='Share Tech Mono, monospace'><rect x='40' y='40' width='300' height='44' stroke='var(--white)' stroke-width='2'/><line x1='100' y1='40' x2='100' y2='84' stroke='var(--white)' stroke-width='2'/><line x1='210' y1='40' x2='210' y2='84' stroke='var(--white)' stroke-width='2'/><line x1='250' y1='40' x2='250' y2='84' stroke='var(--white)' stroke-width='2'/><line x1='290' y1='40' x2='290' y2='84' stroke='var(--white)' stroke-width='2'/><circle cx='70' cy='62' r='11' stroke='var(--cyan)' stroke-width='2'/><line x1='70' y1='47' x2='70' y2='77' stroke='var(--cyan)' stroke-width='2'/><line x1='55' y1='62' x2='85' y2='62' stroke='var(--cyan)' stroke-width='2'/><text x='112' y='67' fill='var(--white)' font-size='15'>Ø0.5</text><circle cx='190' cy='62' r='9' stroke='var(--gold)' stroke-width='2'/><text x='190' y='67' fill='var(--gold)' font-size='12' text-anchor='middle'>M</text><text x='230' y='68' fill='var(--green)' font-size='15' text-anchor='middle'>A</text><text x='270' y='68' fill='var(--green)' font-size='15' text-anchor='middle'>B</text><text x='315' y='68' fill='var(--green)' font-size='15' text-anchor='middle'>C</text></svg>","question":"The circled M after the tolerance means the stated tolerance applies at which condition?","instructions":"It is a material condition modifier.","options":[{"id":"a","label":"Maximum material condition (MMC)"},{"id":"b","label":"Least material condition (LMC)"},{"id":"c","label":"Regardless of feature size (RFS)"},{"id":"d","label":"A basic dimension"}]}$j$::jsonb,
$j${"correct":"a","type":"choice","explanation":"The circled M is the maximum material condition modifier. The full tolerance applies at MMC, and a bonus tolerance becomes available as the feature departs from MMC toward LMC."}$j$::jsonb
where not exists (select 1 from public.challenges where title = 'The Circled M Modifier');

insert into public.challenges (mode, title, difficulty, prompt, answer)
select 'gdt_tolerance', 'Clearance or Interference', 3,
$j${"drawing":"<svg viewBox='0 0 380 170' xmlns='http://www.w3.org/2000/svg' fill='none' font-family='Share Tech Mono, monospace'><circle cx='100' cy='90' r='48' stroke='var(--white)' stroke-width='2'/><circle cx='100' cy='90' r='38' stroke='var(--ice)' stroke-width='2'/><line x1='148' y1='62' x2='220' y2='42' stroke='var(--cyan)' stroke-width='1'/><text x='226' y='46' fill='var(--cyan)' font-size='12'>HOLE Ø20 +0.03/+0.01</text><line x1='138' y1='108' x2='220' y2='126' stroke='var(--ice)' stroke-width='1'/><text x='226' y='130' fill='var(--ice)' font-size='12'>SHAFT Ø20 0/-0.02</text></svg>","question":"A shaft (Ø20, 0 / -0.02) sits in a hole (Ø20, +0.03 / +0.01). Is this fit clearance, interference, or transition?","instructions":"Compare the largest shaft to the smallest hole.","options":[{"id":"a","label":"Clearance"},{"id":"b","label":"Interference"},{"id":"c","label":"Transition"},{"id":"d","label":"Cannot be determined"}]}$j$::jsonb,
$j${"correct":"a","type":"choice","explanation":"Largest shaft is 20.00 and smallest hole is 20.01, so the hole is always larger than the shaft. There is always clearance (minimum 0.01, maximum 0.05), so it is a clearance fit."}$j$::jsonb
where not exists (select 1 from public.challenges where title = 'Clearance or Interference');

insert into public.challenges (mode, title, difficulty, prompt, answer)
select 'gdt_tolerance', 'Minimum Clearance', 4,
$j${"drawing":"<svg viewBox='0 0 380 170' xmlns='http://www.w3.org/2000/svg' fill='none' font-family='Share Tech Mono, monospace'><circle cx='100' cy='90' r='48' stroke='var(--white)' stroke-width='2'/><circle cx='100' cy='90' r='38' stroke='var(--ice)' stroke-width='2'/><line x1='148' y1='62' x2='220' y2='42' stroke='var(--cyan)' stroke-width='1'/><text x='226' y='46' fill='var(--cyan)' font-size='12'>HOLE Ø20 +0.03/+0.01</text><line x1='138' y1='108' x2='220' y2='126' stroke='var(--ice)' stroke-width='1'/><text x='226' y='130' fill='var(--ice)' font-size='12'>SHAFT Ø20 0/-0.02</text></svg>","question":"For the same shaft and hole, what is the minimum clearance, in millimeters?","instructions":"Minimum clearance = smallest hole minus largest shaft.","input":{"type":"numeric","unit":"mm","placeholder":"0.00"}}$j$::jsonb,
$j${"correct":"0.01","type":"numeric","tolerance":0.001,"explanation":"Smallest hole is 20.01, largest shaft is 20.00. Minimum clearance = 20.01 - 20.00 = 0.01 mm."}$j$::jsonb
where not exists (select 1 from public.challenges where title = 'Minimum Clearance');

-- ---------------------------------------------------------------------------
-- 2b. Spot the Error seeds. Each drawing numbers candidate callouts 1-4; the
-- student picks the flawed one. Categories: redundant dim, missing dim,
-- impossible geometry, convention violation, wrong projection.
-- ---------------------------------------------------------------------------
insert into public.challenges (mode, title, difficulty, prompt, answer)
select 'spot_the_error', 'Redundant Dimension', 2,
$j${"drawing":"<svg viewBox='0 0 400 210' xmlns='http://www.w3.org/2000/svg' fill='none' font-family='Share Tech Mono, monospace'><rect x='60' y='40' width='280' height='70' stroke='var(--white)' stroke-width='2'/><line x1='200' y1='40' x2='200' y2='110' stroke='var(--dim)' stroke-width='1' stroke-dasharray='4 4'/><text x='130' y='135' fill='var(--cyan)' font-size='13' text-anchor='middle'>20</text><circle cx='130' cy='155' r='11' stroke='var(--gold)' stroke-width='1.5'/><text x='130' y='160' fill='var(--gold)' font-size='12' text-anchor='middle'>1</text><text x='270' y='135' fill='var(--cyan)' font-size='13' text-anchor='middle'>30</text><circle cx='270' cy='155' r='11' stroke='var(--gold)' stroke-width='1.5'/><text x='270' y='160' fill='var(--gold)' font-size='12' text-anchor='middle'>2</text><text x='185' y='192' fill='var(--cyan)' font-size='13' text-anchor='middle'>50</text><circle cx='225' cy='188' r='11' stroke='var(--gold)' stroke-width='1.5'/><text x='225' y='193' fill='var(--gold)' font-size='12' text-anchor='middle'>3</text><text x='34' y='80' fill='var(--cyan)' font-size='13' text-anchor='middle'>15</text><circle cx='34' cy='100' r='11' stroke='var(--gold)' stroke-width='1.5'/><text x='34' y='105' fill='var(--gold)' font-size='12' text-anchor='middle'>4</text></svg>","question":"Which numbered dimension is redundant (the part is over-dimensioned)?","instructions":"Dimensions are in mm. Look for a length that is already fixed by others.","options":[{"id":"1","label":"1 (the 20)"},{"id":"2","label":"2 (the 30)"},{"id":"3","label":"3 (the 50 overall)"},{"id":"4","label":"4 (the 15 height)"}]}$j$::jsonb,
$j${"correct":"3","type":"choice","explanation":"Dimensions 1 and 2 (20 and 30) already fix the overall length, since 20 + 30 = 50. Dimension 3, the overall 50, is therefore redundant. A chain plus its overall over-dimensions the feature; drop one."}$j$::jsonb
where not exists (select 1 from public.challenges where title = 'Redundant Dimension');

insert into public.challenges (mode, title, difficulty, prompt, answer)
select 'spot_the_error', 'Missing Dimension', 2,
$j${"drawing":"<svg viewBox='0 0 400 200' xmlns='http://www.w3.org/2000/svg' fill='none' font-family='Share Tech Mono, monospace'><rect x='70' y='45' width='250' height='90' stroke='var(--white)' stroke-width='2'/><circle cx='150' cy='90' r='16' stroke='var(--ice)' stroke-width='2'/><text x='195' y='162' fill='var(--cyan)' font-size='13' text-anchor='middle'>40</text><circle cx='235' cy='158' r='11' stroke='var(--gold)' stroke-width='1.5'/><text x='235' y='163' fill='var(--gold)' font-size='12' text-anchor='middle'>1</text><text x='350' y='95' fill='var(--cyan)' font-size='13' text-anchor='middle'>25</text><circle cx='350' cy='118' r='11' stroke='var(--gold)' stroke-width='1.5'/><text x='350' y='123' fill='var(--gold)' font-size='12' text-anchor='middle'>2</text><text x='110' y='32' fill='var(--cyan)' font-size='13' text-anchor='middle'>10</text><circle cx='150' cy='28' r='11' stroke='var(--gold)' stroke-width='1.5'/><text x='150' y='33' fill='var(--gold)' font-size='12' text-anchor='middle'>3</text><circle cx='150' cy='90' r='26' stroke='var(--gold)' stroke-width='1.5' stroke-dasharray='4 3'/><circle cx='184' cy='90' r='11' stroke='var(--gold)' stroke-width='1.5'/><text x='184' y='95' fill='var(--gold)' font-size='12' text-anchor='middle'>4</text></svg>","question":"The plate has overall width (1) and height (2) and the hole has a horizontal location (3). Which numbered item is missing a required dimension?","instructions":"A hole needs both a horizontal and a vertical location.","options":[{"id":"1","label":"1 (width)"},{"id":"2","label":"2 (height)"},{"id":"3","label":"3 (hole from left)"},{"id":"4","label":"4 (the hole)"}]}$j$::jsonb,
$j${"correct":"4","type":"choice","explanation":"The hole (4) has a horizontal location (3) but no vertical location, so its position is undefined. Every hole needs both a horizontal and a vertical locating dimension."}$j$::jsonb
where not exists (select 1 from public.challenges where title = 'Missing Dimension');

insert into public.challenges (mode, title, difficulty, prompt, answer)
select 'spot_the_error', 'Impossible Geometry', 4,
$j${"drawing":"<svg viewBox='0 0 400 200' xmlns='http://www.w3.org/2000/svg' fill='none' font-family='Share Tech Mono, monospace'><rect x='90' y='50' width='200' height='90' stroke='var(--white)' stroke-width='2'/><rect x='64' y='72' width='252' height='30' stroke='var(--amber)' stroke-width='2'/><text x='190' y='165' fill='var(--cyan)' font-size='13' text-anchor='middle'>25</text><circle cx='250' cy='161' r='11' stroke='var(--gold)' stroke-width='1.5'/><text x='250' y='166' fill='var(--gold)' font-size='12' text-anchor='middle'>1</text><text x='190' y='92' fill='var(--cyan)' font-size='13' text-anchor='middle'>30</text><circle cx='150' cy='88' r='11' stroke='var(--gold)' stroke-width='1.5'/><text x='150' y='93' fill='var(--gold)' font-size='12' text-anchor='middle'>2</text><text x='340' y='80' fill='var(--cyan)' font-size='13' text-anchor='middle'>18</text><circle cx='340' cy='100' r='11' stroke='var(--gold)' stroke-width='1.5'/><text x='340' y='105' fill='var(--gold)' font-size='12' text-anchor='middle'>3</text><text x='60' y='100' fill='var(--cyan)' font-size='13' text-anchor='middle'>8</text><circle cx='60' cy='120' r='11' stroke='var(--gold)' stroke-width='1.5'/><text x='60' y='125' fill='var(--gold)' font-size='12' text-anchor='middle'>4</text></svg>","question":"The part is 25 wide (1) with a slot dimensioned 30 wide (2). Which numbered callout makes the geometry impossible?","instructions":"A feature cannot be larger than the part that contains it.","options":[{"id":"1","label":"1 (part width 25)"},{"id":"2","label":"2 (slot width 30)"},{"id":"3","label":"3 (height 18)"},{"id":"4","label":"4 (depth 8)"}]}$j$::jsonb,
$j${"correct":"2","type":"choice","explanation":"The slot is dimensioned 30 wide (2) but the whole part is only 25 wide (1). A slot cannot be wider than the part that contains it, so callout 2 makes the geometry impossible."}$j$::jsonb
where not exists (select 1 from public.challenges where title = 'Impossible Geometry');

insert into public.challenges (mode, title, difficulty, prompt, answer)
select 'spot_the_error', 'Dimension to a Hidden Line', 3,
$j${"drawing":"<svg viewBox='0 0 400 200' xmlns='http://www.w3.org/2000/svg' fill='none' font-family='Share Tech Mono, monospace'><rect x='70' y='50' width='250' height='90' stroke='var(--white)' stroke-width='2'/><line x1='200' y1='50' x2='200' y2='140' stroke='var(--dim)' stroke-width='2' stroke-dasharray='6 5'/><text x='130' y='34' fill='var(--cyan)' font-size='13' text-anchor='middle'>30</text><circle cx='130' cy='28' r='11' stroke='var(--gold)' stroke-width='1.5'/><text x='130' y='33' fill='var(--gold)' font-size='12' text-anchor='middle'>1</text><text x='350' y='100' fill='var(--cyan)' font-size='13' text-anchor='middle'>20</text><circle cx='350' cy='118' r='11' stroke='var(--gold)' stroke-width='1.5'/><text x='350' y='123' fill='var(--gold)' font-size='12' text-anchor='middle'>2</text><text x='250' y='170' fill='var(--cyan)' font-size='13' text-anchor='middle'>15</text><circle cx='200' cy='166' r='11' stroke='var(--gold)' stroke-width='1.5'/><text x='200' y='171' fill='var(--gold)' font-size='12' text-anchor='middle'>3</text><text x='40' y='100' fill='var(--cyan)' font-size='13' text-anchor='middle'>50</text><circle cx='40' cy='120' r='11' stroke='var(--gold)' stroke-width='1.5'/><text x='40' y='125' fill='var(--gold)' font-size='12' text-anchor='middle'>4</text></svg>","question":"One dimension breaks a drawing convention. Which numbered dimension is dimensioned to a hidden (dashed) line?","instructions":"Dimensions should locate visible outlines, not hidden lines.","options":[{"id":"1","label":"1"},{"id":"2","label":"2"},{"id":"3","label":"3"},{"id":"4","label":"4"}]}$j$::jsonb,
$j${"correct":"3","type":"choice","explanation":"Dimension 3 (the 15) is measured to the dashed hidden line in the middle of the part, which violates convention. Dimension to visible outlines; if you must locate a hidden feature, add a view or a section that shows it as a solid line."}$j$::jsonb
where not exists (select 1 from public.challenges where title = 'Dimension to a Hidden Line');

insert into public.challenges (mode, title, difficulty, prompt, answer)
select 'spot_the_error', 'Misaligned View', 3,
$j${"drawing":"<svg viewBox='0 0 400 250' xmlns='http://www.w3.org/2000/svg' fill='none' font-family='Share Tech Mono, monospace'><rect x='60' y='130' width='90' height='70' stroke='var(--white)' stroke-width='2'/><circle cx='86' cy='150' r='11' stroke='var(--gold)' stroke-width='1.5'/><text x='86' y='155' fill='var(--gold)' font-size='12' text-anchor='middle'>1</text><text x='105' y='216' fill='var(--dim)' font-size='10' text-anchor='middle'>FRONT</text><rect x='60' y='50' width='90' height='60' stroke='var(--white)' stroke-width='2'/><circle cx='86' cy='70' r='11' stroke='var(--gold)' stroke-width='1.5'/><text x='86' y='75' fill='var(--gold)' font-size='12' text-anchor='middle'>2</text><text x='105' y='126' fill='var(--dim)' font-size='10' text-anchor='middle'>TOP</text><rect x='210' y='160' width='70' height='70' stroke='var(--white)' stroke-width='2'/><circle cx='236' cy='180' r='11' stroke='var(--gold)' stroke-width='1.5'/><text x='236' y='185' fill='var(--gold)' font-size='12' text-anchor='middle'>3</text><text x='245' y='246' fill='var(--dim)' font-size='10' text-anchor='middle'>RIGHT</text><line x1='150' y1='130' x2='210' y2='130' stroke='var(--dim)' stroke-width='0.75' stroke-dasharray='3 3'/><line x1='150' y1='200' x2='210' y2='200' stroke='var(--dim)' stroke-width='0.75' stroke-dasharray='3 3'/></svg>","question":"In third-angle projection the right-side view must line up horizontally with the front view. Which numbered view is misaligned?","instructions":"The dashed guides show where the front view projects to.","options":[{"id":"1","label":"1 (front)"},{"id":"2","label":"2 (top)"},{"id":"3","label":"3 (right)"},{"id":"4","label":"All are aligned"}]}$j$::jsonb,
$j${"correct":"3","type":"choice","explanation":"The right-side view (3) is dropped below the projection guides; it must align horizontally with the front view (same top and bottom edges). The top view (2) is correctly aligned vertically above the front."}$j$::jsonb
where not exists (select 1 from public.challenges where title = 'Misaligned View');
