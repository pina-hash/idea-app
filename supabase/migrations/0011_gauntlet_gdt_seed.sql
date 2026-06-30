-- 0011_gauntlet_gdt_seed.sql
-- IDEA // GAUNTLET: real GD&T and Tolerance content for the knowledge mode.
--
-- 20 authored challenges (symbol ID, frame anatomy, datums, fits, MMC/LMC,
-- bonus/virtual condition) seeded as DRAFTS for teacher review and publish in
-- the authoring UI. They use the SAME knowledge-mode payload contract as
-- Drawing Reading / 0008: prompt = { slug, question, drawing?, options | input },
-- answer = { correct, type, tolerance?, explanation }. Multiple choice grades by
-- option id; numeric grades by numeric value (gauntlet_submit, 0008) so 0.5,
-- 0.50 and 0.500 all match. No grading or component change was needed.
--
-- The source content lists the correct answer first in every multiple-choice
-- set; option order is rotated deterministically here so the correct answer is
-- distributed across positions (same choices, same correct answer).
--
-- 'slug' lives in the public prompt (challenge identity metadata; harmless to
-- expose) and is the idempotency key, so re-running never duplicates. asset_svg
-- maps to prompt->>'drawing' (rendered inline by Asset.svelte); a null drawing
-- shows no art. author_id is attributed to a teacher account.
--
-- Apply manually in the Supabase SQL editor. Idempotent via the slug guard.

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'gdt_tolerance', $gdt$Symbol ID: Position$gdt$, 1, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $gdt$gdt-sym-position$gdt$,
		'question', $gdt$Identify the geometric characteristic symbol shown.$gdt$,
		'drawing', $gdt$<svg viewBox="0 0 88 80" xmlns="http://www.w3.org/2000/svg" font-family="Arial,Helvetica,sans-serif"><circle cx="44" cy="40" r="11" fill="none" stroke="#E6EDF3" stroke-width="2"/><line x1="28" y1="40" x2="60" y2="40" stroke="#E6EDF3" stroke-width="2"/><line x1="44" y1="24" x2="44" y2="56" stroke="#E6EDF3" stroke-width="2"/></svg>$gdt$,
		'options', jsonb_build_array(
			jsonb_build_object('id', 'a', 'label', $gdt$Position$gdt$),
			jsonb_build_object('id', 'b', 'label', $gdt$Concentricity$gdt$),
			jsonb_build_object('id', 'c', 'label', $gdt$Symmetry$gdt$),
			jsonb_build_object('id', 'd', 'label', $gdt$Circular runout$gdt$)
		)
	),
	jsonb_build_object(
		'correct', 'a',
		'type', 'choice',
		'explanation', $gdt$The crosshair inside a circle is the Position symbol. It locates a feature of size relative to datums.$gdt$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $gdt$gdt-sym-position$gdt$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'gdt_tolerance', $gdt$Symbol ID: Flatness$gdt$, 1, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $gdt$gdt-sym-flatness$gdt$,
		'question', $gdt$Identify the geometric characteristic symbol shown.$gdt$,
		'drawing', $gdt$<svg viewBox="0 0 88 80" xmlns="http://www.w3.org/2000/svg" font-family="Arial,Helvetica,sans-serif"><polygon points="32,47.2 40.4,32.8 56,32.8 47.6,47.2" fill="none" stroke="#E6EDF3" stroke-width="2"/></svg>$gdt$,
		'options', jsonb_build_array(
			jsonb_build_object('id', 'a', 'label', $gdt$Straightness$gdt$),
			jsonb_build_object('id', 'b', 'label', $gdt$Flatness$gdt$),
			jsonb_build_object('id', 'c', 'label', $gdt$Profile of a surface$gdt$),
			jsonb_build_object('id', 'd', 'label', $gdt$Parallelism$gdt$)
		)
	),
	jsonb_build_object(
		'correct', 'b',
		'type', 'choice',
		'explanation', $gdt$The parallelogram is Flatness, a form control. Form controls take no datum reference.$gdt$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $gdt$gdt-sym-flatness$gdt$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'gdt_tolerance', $gdt$Symbol ID: Perpendicularity$gdt$, 1, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $gdt$gdt-sym-perp$gdt$,
		'question', $gdt$Identify the geometric characteristic symbol shown.$gdt$,
		'drawing', $gdt$<svg viewBox="0 0 88 80" xmlns="http://www.w3.org/2000/svg" font-family="Arial,Helvetica,sans-serif"><line x1="41.6" y1="28" x2="41.6" y2="52" stroke="#E6EDF3" stroke-width="2"/><line x1="32" y1="52" x2="56" y2="52" stroke="#E6EDF3" stroke-width="2"/></svg>$gdt$,
		'options', jsonb_build_array(
			jsonb_build_object('id', 'a', 'label', $gdt$Parallelism$gdt$),
			jsonb_build_object('id', 'b', 'label', $gdt$Position$gdt$),
			jsonb_build_object('id', 'c', 'label', $gdt$Perpendicularity$gdt$),
			jsonb_build_object('id', 'd', 'label', $gdt$Angularity$gdt$)
		)
	),
	jsonb_build_object(
		'correct', 'c',
		'type', 'choice',
		'explanation', $gdt$The inverted-T symbol is Perpendicularity, an orientation control holding a feature 90 degrees to a datum.$gdt$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $gdt$gdt-sym-perp$gdt$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'gdt_tolerance', $gdt$Feature Control Frame Anatomy$gdt$, 1, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $gdt$gdt-frame-anatomy$gdt$,
		'question', $gdt$In a feature control frame, what does the first (leftmost) compartment always contain?$gdt$,
		'options', jsonb_build_array(
			jsonb_build_object('id', 'a', 'label', $gdt$The tolerance value$gdt$),
			jsonb_build_object('id', 'b', 'label', $gdt$The primary datum letter$gdt$),
			jsonb_build_object('id', 'c', 'label', $gdt$The basic dimension$gdt$),
			jsonb_build_object('id', 'd', 'label', $gdt$The geometric characteristic symbol$gdt$)
		)
	),
	jsonb_build_object(
		'correct', 'd',
		'type', 'choice',
		'explanation', $gdt$A frame reads left to right: characteristic symbol, then tolerance, then datum references.$gdt$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $gdt$gdt-frame-anatomy$gdt$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'gdt_tolerance', $gdt$Basic Dimensions$gdt$, 1, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $gdt$gdt-basic-dim$gdt$,
		'question', $gdt$A dimension enclosed in a rectangular box (a basic dimension) represents what?$gdt$,
		'options', jsonb_build_array(
			jsonb_build_object('id', 'a', 'label', $gdt$A theoretically exact value with no tolerance of its own$gdt$),
			jsonb_build_object('id', 'b', 'label', $gdt$A maximum material limit$gdt$),
			jsonb_build_object('id', 'c', 'label', $gdt$A reference dimension that may be ignored$gdt$),
			jsonb_build_object('id', 'd', 'label', $gdt$A toleranced dimension of plus or minus 0.001$gdt$)
		)
	),
	jsonb_build_object(
		'correct', 'a',
		'type', 'choice',
		'explanation', $gdt$A basic dimension is exact. The permitted variation comes from the feature control frame, not the dimension.$gdt$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $gdt$gdt-basic-dim$gdt$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'gdt_tolerance', $gdt$Plus/Minus Tolerance: Max Size$gdt$, 1, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $gdt$gdt-tol-max$gdt$,
		'question', $gdt$A dimension is 1.000 +/- 0.005 in. What is the maximum acceptable size?$gdt$,
		'input', jsonb_build_object('type', 'numeric')
	),
	jsonb_build_object(
		'correct', $gdt$1.005$gdt$,
		'type', 'numeric',
		'tolerance', 0,
		'explanation', $gdt$Maximum is the nominal plus the upper tolerance: 1.000 + 0.005 = 1.005.$gdt$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $gdt$gdt-tol-max$gdt$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'gdt_tolerance', $gdt$Tolerance Zone Shape$gdt$, 2, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $gdt$gdt-zone-shape$gdt$,
		'question', $gdt$The feature control frame shown is applied to a hole. What is the shape and size of its tolerance zone?$gdt$,
		'drawing', $gdt$<svg viewBox="0 0 251 74" xmlns="http://www.w3.org/2000/svg" font-family="Arial,Helvetica,sans-serif"><rect x="16" y="16" width="219" height="42" fill="none" stroke="#E6EDF3" stroke-width="2"/><circle cx="35.0" cy="37.0" r="11" fill="none" stroke="#E6EDF3" stroke-width="2"/><line x1="19.0" y1="37.0" x2="51.0" y2="37.0" stroke="#E6EDF3" stroke-width="2"/><line x1="35.0" y1="21.0" x2="35.0" y2="53.0" stroke="#E6EDF3" stroke-width="2"/><line x1="54" y1="16" x2="54" y2="58" stroke="#E6EDF3" stroke-width="2"/><circle cx="68" cy="37.0" r="7" fill="none" stroke="#E6EDF3" stroke-width="2"/><line x1="59" y1="46.0" x2="77" y2="28.0" stroke="#E6EDF3" stroke-width="2"/><text x="86" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="16" text-anchor="start" dominant-baseline="central">0.010</text><line x1="145" y1="16" x2="145" y2="58" stroke="#E6EDF3" stroke-width="2"/><text x="160" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="16" text-anchor="middle" dominant-baseline="central">A</text><line x1="175" y1="16" x2="175" y2="58" stroke="#E6EDF3" stroke-width="2"/><text x="190" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="16" text-anchor="middle" dominant-baseline="central">B</text><line x1="205" y1="16" x2="205" y2="58" stroke="#E6EDF3" stroke-width="2"/><text x="220" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="16" text-anchor="middle" dominant-baseline="central">C</text></svg>$gdt$,
		'options', jsonb_build_array(
			jsonb_build_object('id', 'a', 'label', $gdt$A spherical zone 0.010 in diameter$gdt$),
			jsonb_build_object('id', 'b', 'label', $gdt$A cylindrical zone 0.010 in diameter$gdt$),
			jsonb_build_object('id', 'c', 'label', $gdt$A square zone 0.010 wide$gdt$),
			jsonb_build_object('id', 'd', 'label', $gdt$Two parallel planes 0.010 apart$gdt$)
		)
	),
	jsonb_build_object(
		'correct', 'b',
		'type', 'choice',
		'explanation', $gdt$The diameter symbol ahead of the tolerance makes the zone cylindrical, 0.010 across.$gdt$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $gdt$gdt-zone-shape$gdt$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'gdt_tolerance', $gdt$Datum Precedence$gdt$, 2, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $gdt$gdt-primary-datum$gdt$,
		'question', $gdt$In the feature control frame shown, which datum is the primary datum?$gdt$,
		'drawing', $gdt$<svg viewBox="0 0 251 74" xmlns="http://www.w3.org/2000/svg" font-family="Arial,Helvetica,sans-serif"><rect x="16" y="16" width="219" height="42" fill="none" stroke="#E6EDF3" stroke-width="2"/><circle cx="35.0" cy="37.0" r="11" fill="none" stroke="#E6EDF3" stroke-width="2"/><line x1="19.0" y1="37.0" x2="51.0" y2="37.0" stroke="#E6EDF3" stroke-width="2"/><line x1="35.0" y1="21.0" x2="35.0" y2="53.0" stroke="#E6EDF3" stroke-width="2"/><line x1="54" y1="16" x2="54" y2="58" stroke="#E6EDF3" stroke-width="2"/><circle cx="68" cy="37.0" r="7" fill="none" stroke="#E6EDF3" stroke-width="2"/><line x1="59" y1="46.0" x2="77" y2="28.0" stroke="#E6EDF3" stroke-width="2"/><text x="86" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="16" text-anchor="start" dominant-baseline="central">0.010</text><line x1="145" y1="16" x2="145" y2="58" stroke="#E6EDF3" stroke-width="2"/><text x="160" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="16" text-anchor="middle" dominant-baseline="central">A</text><line x1="175" y1="16" x2="175" y2="58" stroke="#E6EDF3" stroke-width="2"/><text x="190" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="16" text-anchor="middle" dominant-baseline="central">B</text><line x1="205" y1="16" x2="205" y2="58" stroke="#E6EDF3" stroke-width="2"/><text x="220" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="16" text-anchor="middle" dominant-baseline="central">C</text></svg>$gdt$,
		'options', jsonb_build_array(
			jsonb_build_object('id', 'a', 'label', $gdt$C$gdt$),
			jsonb_build_object('id', 'b', 'label', $gdt$They have equal precedence$gdt$),
			jsonb_build_object('id', 'c', 'label', $gdt$A$gdt$),
			jsonb_build_object('id', 'd', 'label', $gdt$B$gdt$)
		)
	),
	jsonb_build_object(
		'correct', 'c',
		'type', 'choice',
		'explanation', $gdt$Datums are listed in order of precedence. The first datum compartment, A, is primary and is contacted first.$gdt$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $gdt$gdt-primary-datum$gdt$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'gdt_tolerance', $gdt$What Perpendicularity Controls$gdt$, 2, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $gdt$gdt-perp-control$gdt$,
		'question', $gdt$What does the feature control frame shown control?$gdt$,
		'drawing', $gdt$<svg viewBox="0 0 175 74" xmlns="http://www.w3.org/2000/svg" font-family="Arial,Helvetica,sans-serif"><rect x="16" y="16" width="143" height="42" fill="none" stroke="#E6EDF3" stroke-width="2"/><line x1="32.6" y1="25.0" x2="32.6" y2="49.0" stroke="#E6EDF3" stroke-width="2"/><line x1="23.0" y1="49.0" x2="47.0" y2="49.0" stroke="#E6EDF3" stroke-width="2"/><line x1="54" y1="16" x2="54" y2="58" stroke="#E6EDF3" stroke-width="2"/><text x="68" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="16" text-anchor="start" dominant-baseline="central">0.005</text><line x1="129" y1="16" x2="129" y2="58" stroke="#E6EDF3" stroke-width="2"/><text x="144" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="16" text-anchor="middle" dominant-baseline="central">A</text></svg>$gdt$,
		'options', jsonb_build_array(
			jsonb_build_object('id', 'a', 'label', $gdt$Location of the feature from datum A$gdt$),
			jsonb_build_object('id', 'b', 'label', $gdt$Roundness of the feature$gdt$),
			jsonb_build_object('id', 'c', 'label', $gdt$Size of the feature$gdt$),
			jsonb_build_object('id', 'd', 'label', $gdt$Orientation of the feature at 90 degrees to datum A within a 0.005 zone$gdt$)
		)
	),
	jsonb_build_object(
		'correct', 'd',
		'type', 'choice',
		'explanation', $gdt$Perpendicularity is an orientation control. It does not locate or size the feature.$gdt$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $gdt$gdt-perp-control$gdt$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'gdt_tolerance', $gdt$Diametral Clearance$gdt$, 2, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $gdt$gdt-clearance$gdt$,
		'question', $gdt$A hole is dia 0.510 and the shaft assembled into it is dia 0.500. What is the diametral clearance?$gdt$,
		'input', jsonb_build_object('type', 'numeric')
	),
	jsonb_build_object(
		'correct', $gdt$0.010$gdt$,
		'type', 'numeric',
		'tolerance', 0,
		'explanation', $gdt$Clearance is hole minus shaft: 0.510 - 0.500 = 0.010.$gdt$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $gdt$gdt-clearance$gdt$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'gdt_tolerance', $gdt$MMC of a Hole$gdt$, 2, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $gdt$gdt-mmc-hole$gdt$,
		'question', $gdt$A hole is dimensioned dia 0.500 to 0.510. What is its maximum material condition (MMC)?$gdt$,
		'input', jsonb_build_object('type', 'numeric')
	),
	jsonb_build_object(
		'correct', $gdt$0.500$gdt$,
		'type', 'numeric',
		'tolerance', 0,
		'explanation', $gdt$A hole has the most material when it is smallest, so MMC is the 0.500 limit.$gdt$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $gdt$gdt-mmc-hole$gdt$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'gdt_tolerance', $gdt$Identify the Fit$gdt$, 2, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $gdt$gdt-fit-type$gdt$,
		'question', $gdt$A hole is dia 0.500 to 0.504 and a shaft is dia 0.495 to 0.498. What type of fit is this?$gdt$,
		'options', jsonb_build_array(
			jsonb_build_object('id', 'a', 'label', $gdt$Clearance fit$gdt$),
			jsonb_build_object('id', 'b', 'label', $gdt$Interference fit$gdt$),
			jsonb_build_object('id', 'c', 'label', $gdt$Transition fit$gdt$),
			jsonb_build_object('id', 'd', 'label', $gdt$Line fit$gdt$)
		)
	),
	jsonb_build_object(
		'correct', 'a',
		'type', 'choice',
		'explanation', $gdt$The hole is always larger than the shaft (min clearance 0.002, max 0.009), so it is always a clearance fit.$gdt$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $gdt$gdt-fit-type$gdt$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'gdt_tolerance', $gdt$Bonus Tolerance$gdt$, 3, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $gdt$gdt-bonus-tol$gdt$,
		'question', $gdt$A hole dia 0.500 to 0.520 has the position control shown, applied at MMC. The hole is produced at dia 0.515. What is the total position tolerance available (zone diameter)?$gdt$,
		'drawing', $gdt$<svg viewBox="0 0 271 74" xmlns="http://www.w3.org/2000/svg" font-family="Arial,Helvetica,sans-serif"><rect x="16" y="16" width="239" height="42" fill="none" stroke="#E6EDF3" stroke-width="2"/><circle cx="35.0" cy="37.0" r="11" fill="none" stroke="#E6EDF3" stroke-width="2"/><line x1="19.0" y1="37.0" x2="51.0" y2="37.0" stroke="#E6EDF3" stroke-width="2"/><line x1="35.0" y1="21.0" x2="35.0" y2="53.0" stroke="#E6EDF3" stroke-width="2"/><line x1="54" y1="16" x2="54" y2="58" stroke="#E6EDF3" stroke-width="2"/><circle cx="68" cy="37.0" r="7" fill="none" stroke="#E6EDF3" stroke-width="2"/><line x1="59" y1="46.0" x2="77" y2="28.0" stroke="#E6EDF3" stroke-width="2"/><text x="86" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="16" text-anchor="start" dominant-baseline="central">0.010</text><circle cx="143" cy="37.0" r="9" fill="none" stroke="#E6EDF3" stroke-width="2"/><text x="143" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="11" text-anchor="middle" dominant-baseline="central">M</text><line x1="165" y1="16" x2="165" y2="58" stroke="#E6EDF3" stroke-width="2"/><text x="180" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="16" text-anchor="middle" dominant-baseline="central">A</text><line x1="195" y1="16" x2="195" y2="58" stroke="#E6EDF3" stroke-width="2"/><text x="210" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="16" text-anchor="middle" dominant-baseline="central">B</text><line x1="225" y1="16" x2="225" y2="58" stroke="#E6EDF3" stroke-width="2"/><text x="240" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="16" text-anchor="middle" dominant-baseline="central">C</text></svg>$gdt$,
		'input', jsonb_build_object('type', 'numeric')
	),
	jsonb_build_object(
		'correct', $gdt$0.025$gdt$,
		'type', 'numeric',
		'tolerance', 0,
		'explanation', $gdt$Bonus = produced size - MMC = 0.515 - 0.500 = 0.015. Total = stated 0.010 + bonus 0.015 = 0.025.$gdt$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $gdt$gdt-bonus-tol$gdt$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'gdt_tolerance', $gdt$Runout Type$gdt$, 3, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $gdt$gdt-total-runout$gdt$,
		'question', $gdt$Which control inspects the entire cylindrical surface as the part rotates, not just individual circular cross sections?$gdt$,
		'options', jsonb_build_array(
			jsonb_build_object('id', 'a', 'label', $gdt$Concentricity$gdt$),
			jsonb_build_object('id', 'b', 'label', $gdt$Total runout$gdt$),
			jsonb_build_object('id', 'c', 'label', $gdt$Circular runout$gdt$),
			jsonb_build_object('id', 'd', 'label', $gdt$Cylindricity$gdt$)
		)
	),
	jsonb_build_object(
		'correct', 'b',
		'type', 'choice',
		'explanation', $gdt$Circular runout checks one cross section at a time; total runout controls the whole surface at once.$gdt$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $gdt$gdt-total-runout$gdt$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'gdt_tolerance', $gdt$Degrees of Freedom$gdt$, 3, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $gdt$gdt-dof$gdt$,
		'question', $gdt$A primary planar datum feature, when contacted, removes how many degrees of freedom?$gdt$,
		'input', jsonb_build_object('type', 'numeric')
	),
	jsonb_build_object(
		'correct', $gdt$3$gdt$,
		'type', 'numeric',
		'tolerance', 0,
		'explanation', $gdt$A plane stops one translation (normal to it) and two rotations, removing three of the six degrees of freedom.$gdt$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $gdt$gdt-dof$gdt$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'gdt_tolerance', $gdt$Profile Disposition$gdt$, 3, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $gdt$gdt-profile-disp$gdt$,
		'question', $gdt$A profile of a surface tolerance of 0.020 is shown equally disposed about the true profile. How far may the surface deviate to either side of the true profile?$gdt$,
		'input', jsonb_build_object('type', 'numeric')
	),
	jsonb_build_object(
		'correct', $gdt$0.010$gdt$,
		'type', 'numeric',
		'tolerance', 0,
		'explanation', $gdt$Equally disposed splits the 0.020 zone in half, so 0.010 to each side.$gdt$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $gdt$gdt-profile-disp$gdt$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'gdt_tolerance', $gdt$Why Use MMC$gdt$, 3, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $gdt$gdt-mmc-why$gdt$,
		'question', $gdt$Why does adding the MMC modifier to a position tolerance benefit production?$gdt$,
		'drawing', $gdt$<svg viewBox="0 0 271 74" xmlns="http://www.w3.org/2000/svg" font-family="Arial,Helvetica,sans-serif"><rect x="16" y="16" width="239" height="42" fill="none" stroke="#E6EDF3" stroke-width="2"/><circle cx="35.0" cy="37.0" r="11" fill="none" stroke="#E6EDF3" stroke-width="2"/><line x1="19.0" y1="37.0" x2="51.0" y2="37.0" stroke="#E6EDF3" stroke-width="2"/><line x1="35.0" y1="21.0" x2="35.0" y2="53.0" stroke="#E6EDF3" stroke-width="2"/><line x1="54" y1="16" x2="54" y2="58" stroke="#E6EDF3" stroke-width="2"/><circle cx="68" cy="37.0" r="7" fill="none" stroke="#E6EDF3" stroke-width="2"/><line x1="59" y1="46.0" x2="77" y2="28.0" stroke="#E6EDF3" stroke-width="2"/><text x="86" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="16" text-anchor="start" dominant-baseline="central">0.010</text><circle cx="143" cy="37.0" r="9" fill="none" stroke="#E6EDF3" stroke-width="2"/><text x="143" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="11" text-anchor="middle" dominant-baseline="central">M</text><line x1="165" y1="16" x2="165" y2="58" stroke="#E6EDF3" stroke-width="2"/><text x="180" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="16" text-anchor="middle" dominant-baseline="central">A</text><line x1="195" y1="16" x2="195" y2="58" stroke="#E6EDF3" stroke-width="2"/><text x="210" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="16" text-anchor="middle" dominant-baseline="central">B</text><line x1="225" y1="16" x2="225" y2="58" stroke="#E6EDF3" stroke-width="2"/><text x="240" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="16" text-anchor="middle" dominant-baseline="central">C</text></svg>$gdt$,
		'options', jsonb_build_array(
			jsonb_build_object('id', 'a', 'label', $gdt$It removes the datum requirement$gdt$),
			jsonb_build_object('id', 'b', 'label', $gdt$It changes the zone from round to square$gdt$),
			jsonb_build_object('id', 'c', 'label', $gdt$It allows bonus tolerance as the feature departs from MMC$gdt$),
			jsonb_build_object('id', 'd', 'label', $gdt$It tightens the tolerance as the hole grows$gdt$)
		)
	),
	jsonb_build_object(
		'correct', 'c',
		'type', 'choice',
		'explanation', $gdt$As the hole grows away from MMC, extra position tolerance becomes available, easing manufacture without hurting assembly.$gdt$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $gdt$gdt-mmc-why$gdt$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'gdt_tolerance', $gdt$Virtual Condition: Pin$gdt$, 4, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $gdt$gdt-vc-external$gdt$,
		'question', $gdt$A pin (external feature) has an MMC of dia 0.500 and a perpendicularity tolerance of 0.005 applied at MMC. What is its virtual condition?$gdt$,
		'drawing', $gdt$<svg viewBox="0 0 195 74" xmlns="http://www.w3.org/2000/svg" font-family="Arial,Helvetica,sans-serif"><rect x="16" y="16" width="163" height="42" fill="none" stroke="#E6EDF3" stroke-width="2"/><line x1="32.6" y1="25.0" x2="32.6" y2="49.0" stroke="#E6EDF3" stroke-width="2"/><line x1="23.0" y1="49.0" x2="47.0" y2="49.0" stroke="#E6EDF3" stroke-width="2"/><line x1="54" y1="16" x2="54" y2="58" stroke="#E6EDF3" stroke-width="2"/><text x="68" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="16" text-anchor="start" dominant-baseline="central">0.005</text><circle cx="125" cy="37.0" r="9" fill="none" stroke="#E6EDF3" stroke-width="2"/><text x="125" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="11" text-anchor="middle" dominant-baseline="central">M</text><line x1="149" y1="16" x2="149" y2="58" stroke="#E6EDF3" stroke-width="2"/><text x="164" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="16" text-anchor="middle" dominant-baseline="central">A</text></svg>$gdt$,
		'input', jsonb_build_object('type', 'numeric')
	),
	jsonb_build_object(
		'correct', $gdt$0.505$gdt$,
		'type', 'numeric',
		'tolerance', 0,
		'explanation', $gdt$For an external feature, virtual condition = MMC + geometric tolerance = 0.500 + 0.005 = 0.505.$gdt$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $gdt$gdt-vc-external$gdt$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'gdt_tolerance', $gdt$Virtual Condition: Hole$gdt$, 4, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $gdt$gdt-vc-internal$gdt$,
		'question', $gdt$A hole (internal feature) has an MMC of dia 0.510 and a position tolerance of 0.010 applied at MMC. What is its virtual condition?$gdt$,
		'drawing', $gdt$<svg viewBox="0 0 271 74" xmlns="http://www.w3.org/2000/svg" font-family="Arial,Helvetica,sans-serif"><rect x="16" y="16" width="239" height="42" fill="none" stroke="#E6EDF3" stroke-width="2"/><circle cx="35.0" cy="37.0" r="11" fill="none" stroke="#E6EDF3" stroke-width="2"/><line x1="19.0" y1="37.0" x2="51.0" y2="37.0" stroke="#E6EDF3" stroke-width="2"/><line x1="35.0" y1="21.0" x2="35.0" y2="53.0" stroke="#E6EDF3" stroke-width="2"/><line x1="54" y1="16" x2="54" y2="58" stroke="#E6EDF3" stroke-width="2"/><circle cx="68" cy="37.0" r="7" fill="none" stroke="#E6EDF3" stroke-width="2"/><line x1="59" y1="46.0" x2="77" y2="28.0" stroke="#E6EDF3" stroke-width="2"/><text x="86" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="16" text-anchor="start" dominant-baseline="central">0.010</text><circle cx="143" cy="37.0" r="9" fill="none" stroke="#E6EDF3" stroke-width="2"/><text x="143" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="11" text-anchor="middle" dominant-baseline="central">M</text><line x1="165" y1="16" x2="165" y2="58" stroke="#E6EDF3" stroke-width="2"/><text x="180" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="16" text-anchor="middle" dominant-baseline="central">A</text><line x1="195" y1="16" x2="195" y2="58" stroke="#E6EDF3" stroke-width="2"/><text x="210" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="16" text-anchor="middle" dominant-baseline="central">B</text><line x1="225" y1="16" x2="225" y2="58" stroke="#E6EDF3" stroke-width="2"/><text x="240" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="16" text-anchor="middle" dominant-baseline="central">C</text></svg>$gdt$,
		'input', jsonb_build_object('type', 'numeric')
	),
	jsonb_build_object(
		'correct', $gdt$0.500$gdt$,
		'type', 'numeric',
		'tolerance', 0,
		'explanation', $gdt$For an internal feature, virtual condition = MMC - geometric tolerance = 0.510 - 0.010 = 0.500.$gdt$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $gdt$gdt-vc-internal$gdt$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'gdt_tolerance', $gdt$Worst-Case Assembly$gdt$, 4, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $gdt$gdt-assembly$gdt$,
		'question', $gdt$A hole has a virtual condition of dia 0.500 and the pin going into it has a virtual condition of dia 0.500. What does this guarantee?$gdt$,
		'drawing', $gdt$<svg viewBox="0 0 271 74" xmlns="http://www.w3.org/2000/svg" font-family="Arial,Helvetica,sans-serif"><rect x="16" y="16" width="239" height="42" fill="none" stroke="#E6EDF3" stroke-width="2"/><circle cx="35.0" cy="37.0" r="11" fill="none" stroke="#E6EDF3" stroke-width="2"/><line x1="19.0" y1="37.0" x2="51.0" y2="37.0" stroke="#E6EDF3" stroke-width="2"/><line x1="35.0" y1="21.0" x2="35.0" y2="53.0" stroke="#E6EDF3" stroke-width="2"/><line x1="54" y1="16" x2="54" y2="58" stroke="#E6EDF3" stroke-width="2"/><circle cx="68" cy="37.0" r="7" fill="none" stroke="#E6EDF3" stroke-width="2"/><line x1="59" y1="46.0" x2="77" y2="28.0" stroke="#E6EDF3" stroke-width="2"/><text x="86" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="16" text-anchor="start" dominant-baseline="central">0.010</text><circle cx="143" cy="37.0" r="9" fill="none" stroke="#E6EDF3" stroke-width="2"/><text x="143" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="11" text-anchor="middle" dominant-baseline="central">M</text><line x1="165" y1="16" x2="165" y2="58" stroke="#E6EDF3" stroke-width="2"/><text x="180" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="16" text-anchor="middle" dominant-baseline="central">A</text><line x1="195" y1="16" x2="195" y2="58" stroke="#E6EDF3" stroke-width="2"/><text x="210" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="16" text-anchor="middle" dominant-baseline="central">B</text><line x1="225" y1="16" x2="225" y2="58" stroke="#E6EDF3" stroke-width="2"/><text x="240" y="37.0" fill="#E6EDF3" font-family="Arial,Helvetica,sans-serif" font-size="16" text-anchor="middle" dominant-baseline="central">C</text></svg>$gdt$,
		'options', jsonb_build_array(
			jsonb_build_object('id', 'a', 'label', $gdt$The parts will always have 0.010 clearance$gdt$),
			jsonb_build_object('id', 'b', 'label', $gdt$The parts will always interfere$gdt$),
			jsonb_build_object('id', 'c', 'label', $gdt$Nothing can be determined$gdt$),
			jsonb_build_object('id', 'd', 'label', $gdt$The parts will always just assemble at worst case$gdt$)
		)
	),
	jsonb_build_object(
		'correct', 'd',
		'type', 'choice',
		'explanation', $gdt$Matching virtual conditions define the worst-case mating boundary. Equal VCs mean the pin and hole always just fit.$gdt$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $gdt$gdt-assembly$gdt$);
