-- 0012_gauntlet_spot_seed.sql
-- IDEA // GAUNTLET: real Spot the Error content for the knowledge mode.
--
-- 15 authored Spot the Error challenges seeded as DRAFTS for teacher review and
-- publish in the authoring UI. Mirrors the 0011 GD&T seed in mechanism. They use
-- the SAME knowledge-mode payload contract as Drawing Reading / 0011:
-- prompt = { slug, question, drawing, options }, answer = { correct, type, explanation }.
-- Graded by gauntlet_submit (0008), whose knowledge branch already lists
-- spot_the_error: choice grading matches the selected option id to answer.correct
-- and returns the explanation. No grading, route, or component change was needed.
--
-- NOTE: the source file labels the mode 'spot_error'; the actual gauntlet_mode enum
-- value (0004) and GauntletModeId is 'spot_the_error', which is used here.
--
-- Two question shapes are mixed, both multiple choice: pick-the-flawed-callout
-- (options '1'..'4', the option id IS the callout number) and identify-the-problem
-- (descriptive options, lettered ids a..d). Option order is preserved VERBATIM, NO
-- rotation: numbered callouts must read 1,2,3,4 in order, and the descriptive
-- answers are already distributed across positions by the author.
--
-- Drawings are author-styled to the program palette (white #e8ffe8, cyan #00f0ff,
-- gold #c8ff00, green #00ff41, Share Tech Mono) and inserted as-is into
-- prompt->>'drawing' (rendered inline by Asset.svelte). 'slug' lives in the public
-- prompt and is the idempotency key, so re-running never duplicates. author_id is
-- attributed to a teacher account. The provenance source gauntlet_spot_seed.json
-- lives at the repo root (not static/, so the answer key is never publicly served).
--
-- Apply manually in the Supabase SQL editor. Idempotent via the slug guard.

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'spot_the_error', $spot$Missing Arrowhead$spot$, 1, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $spot$spot-missing-arrowhead$spot$,
		'question', $spot$Which numbered callout violates drafting convention?$spot$,
		'drawing', $spot$<svg viewBox="0 0 340 240" xmlns="http://www.w3.org/2000/svg"><rect x="70" y="60" width="190" height="95" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><line x1="70" y1="180" x2="260" y2="180" stroke="#e8ffe8" stroke-width="1.6"/><polygon points="70,180 75,177.5 75,182.5" fill="#e8ffe8"/><text x="165" y="171" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="13" text-anchor="middle" dominant-baseline="central">3.00</text><line x1="70" y1="180" x2="70" y2="155" stroke="#e8ffe8" stroke-width="1.6"/><line x1="260" y1="180" x2="260" y2="155" stroke="#e8ffe8" stroke-width="1.6"/><line x1="200" y1="180" x2="173.12970905702147" y2="209.17345873809097" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="165" cy="218" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="165" y="218" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">1</text><circle cx="160" cy="105" r="18" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><line x1="160" y1="105" x2="64.98460353205412" y2="41.65640235470275" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="55" cy="35" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="55" y="35" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">2</text><line x1="285" y1="60" x2="285" y2="155" stroke="#e8ffe8" stroke-width="1.6"/><polygon points="285,60 282.5,65 287.5,65" fill="#e8ffe8"/><polygon points="285,155 282.5,150 287.5,150" fill="#e8ffe8"/><line x1="285" y1="60" x2="260" y2="60" stroke="#e8ffe8" stroke-width="1.6"/><line x1="285" y1="155" x2="260" y2="155" stroke="#e8ffe8" stroke-width="1.6"/><g transform="rotate(-90 276 107.5)"><text x="276" y="107.5" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="13" text-anchor="middle" dominant-baseline="central">1.50</text></g><line x1="285" y1="100" x2="300.54331188375073" y2="61.14172029062311" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="305" cy="50" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="305" y="50" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">3</text></svg>$spot$,
		'options', jsonb_build_array(
			jsonb_build_object('id', $spot$1$spot$, 'label', $spot$1$spot$),
			jsonb_build_object('id', $spot$2$spot$, 'label', $spot$2$spot$),
			jsonb_build_object('id', $spot$3$spot$, 'label', $spot$3$spot$)
		)
	),
	jsonb_build_object(
		'correct', $spot$1$spot$,
		'type', 'choice',
		'explanation', $spot$Callout 1 dimension has an arrowhead on only one end. A dimension line must be terminated by an arrowhead at each end.$spot$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $spot$spot-missing-arrowhead$spot$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'spot_the_error', $spot$Orientation Without Datum$spot$, 2, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $spot$spot-perp-no-datum$spot$,
		'question', $spot$Which numbered callout is incorrect?$spot$,
		'drawing', $spot$<svg viewBox="0 0 320 230" xmlns="http://www.w3.org/2000/svg"><rect x="70" y="40" width="80" height="100" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><line x1="70" y1="40" x2="150" y2="40" stroke="#e8ffe8" stroke-width="3"/><rect x="150" y="150" width="118" height="34" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><line x1="162.8" y1="156.0" x2="162.8" y2="178.0" stroke="#00f0ff" stroke-width="1.6"/><line x1="154.0" y1="178.0" x2="176.0" y2="178.0" stroke="#00f0ff" stroke-width="1.6"/><line x1="180" y1="150" x2="180" y2="184" stroke="#e8ffe8" stroke-width="1.6"/><text x="190" y="167.0" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="start" dominant-baseline="central">0.005</text><line x1="244" y1="150" x2="244" y2="184" stroke="#e8ffe8" stroke-width="1.6"/><line x1="70" y1="60" x2="55.28991510855053" y2="51.173949065130316" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="45" cy="45" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="45" y="45" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">1</text><line x1="165" y1="167" x2="129.67685995026847" y2="192.90363603646978" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="120" cy="200" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="120" y="200" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">2</text><circle cx="110" cy="95" r="16" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><line x1="110" y1="95" x2="61.79834587464478" y2="165.11149690960758" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="55" cy="175" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="55" y="175" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">3</text></svg>$spot$,
		'options', jsonb_build_array(
			jsonb_build_object('id', $spot$1$spot$, 'label', $spot$1$spot$),
			jsonb_build_object('id', $spot$2$spot$, 'label', $spot$2$spot$),
			jsonb_build_object('id', $spot$3$spot$, 'label', $spot$3$spot$)
		)
	),
	jsonb_build_object(
		'correct', $spot$2$spot$,
		'type', 'choice',
		'explanation', $spot$Callout 2 is a perpendicularity control with an empty datum compartment. Orientation controls must reference a datum; 90 degrees is meaningless without one.$spot$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $spot$spot-perp-no-datum$spot$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'spot_the_error', $spot$Cylindrical Zone Symbol$spot$, 2, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $spot$spot-pos-no-dia$spot$,
		'question', $spot$The position tolerance locates a round hole. Which numbered callout is incorrect?$spot$,
		'drawing', $spot$<svg viewBox="0 0 350 235" xmlns="http://www.w3.org/2000/svg"><rect x="70" y="45" width="210" height="110" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="175" cy="100" r="24" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><rect x="70" y="180" width="166" height="34" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="85.0" cy="197.0" r="10" fill="none" stroke="#00f0ff" stroke-width="1.6"/><line x1="70.0" y1="197.0" x2="100.0" y2="197.0" stroke="#00f0ff" stroke-width="1.6"/><line x1="85.0" y1="182.0" x2="85.0" y2="212.0" stroke="#00f0ff" stroke-width="1.6"/><line x1="100" y1="180" x2="100" y2="214" stroke="#e8ffe8" stroke-width="1.6"/><text x="110" y="197.0" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="start" dominant-baseline="central">0.010</text><line x1="164" y1="180" x2="164" y2="214" stroke="#e8ffe8" stroke-width="1.6"/><text x="176" y="197.0" fill="#00ff41" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">A</text><line x1="188" y1="180" x2="188" y2="214" stroke="#e8ffe8" stroke-width="1.6"/><text x="200" y="197.0" fill="#00ff41" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">B</text><line x1="212" y1="180" x2="212" y2="214" stroke="#e8ffe8" stroke-width="1.6"/><text x="224" y="197.0" fill="#00ff41" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">C</text><line x1="70" y1="32" x2="280" y2="32" stroke="#e8ffe8" stroke-width="1.6"/><polygon points="70,32 75,29.5 75,34.5" fill="#e8ffe8"/><polygon points="280,32 275,29.5 275,34.5" fill="#e8ffe8"/><line x1="70" y1="32" x2="70" y2="45" stroke="#e8ffe8" stroke-width="1.6"/><line x1="280" y1="32" x2="280" y2="45" stroke="#e8ffe8" stroke-width="1.6"/><text x="175.0" y="23" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="13" text-anchor="middle" dominant-baseline="central">4.00</text><line x1="175" y1="32" x2="56.96465382601898" y2="22.920357986616846" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="45" cy="22" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="45" y="22" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">1</text><line x1="236" y1="192" x2="293.2074730577552" y2="202.77821956160605" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="305" cy="205" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="305" y="205" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">2</text><line x1="199" y1="100" x2="308.0" y2="100.0" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="320" cy="100" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="320" y="100" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">3</text></svg>$spot$,
		'options', jsonb_build_array(
			jsonb_build_object('id', $spot$1$spot$, 'label', $spot$1$spot$),
			jsonb_build_object('id', $spot$2$spot$, 'label', $spot$2$spot$),
			jsonb_build_object('id', $spot$3$spot$, 'label', $spot$3$spot$)
		)
	),
	jsonb_build_object(
		'correct', $spot$2$spot$,
		'type', 'choice',
		'explanation', $spot$Callout 2 omits the diameter symbol before the tolerance value. A round hole needs a cylindrical zone, denoted by the diameter symbol; without it the zone defaults to two parallel planes.$spot$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $spot$spot-pos-no-dia$spot$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'spot_the_error', $spot$Undefined Datum Reference$spot$, 3, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $spot$spot-undefined-datum$spot$,
		'question', $spot$Which numbered callout is incorrect?$spot$,
		'drawing', $spot$<svg viewBox="0 0 345 235" xmlns="http://www.w3.org/2000/svg"><rect x="70" y="45" width="200" height="110" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><rect x="70" y="180" width="180" height="34" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="85.0" cy="197.0" r="10" fill="none" stroke="#00f0ff" stroke-width="1.6"/><line x1="70.0" y1="197.0" x2="100.0" y2="197.0" stroke="#00f0ff" stroke-width="1.6"/><line x1="85.0" y1="182.0" x2="85.0" y2="212.0" stroke="#00f0ff" stroke-width="1.6"/><line x1="100" y1="180" x2="100" y2="214" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="110" cy="197.0" r="7" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><line x1="101" y1="206.0" x2="119" y2="188.0" stroke="#e8ffe8" stroke-width="1.6"/><text x="126" y="197.0" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="start" dominant-baseline="central">0.010</text><line x1="178" y1="180" x2="178" y2="214" stroke="#e8ffe8" stroke-width="1.6"/><text x="190" y="197.0" fill="#00ff41" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">A</text><line x1="202" y1="180" x2="202" y2="214" stroke="#e8ffe8" stroke-width="1.6"/><text x="214" y="197.0" fill="#00ff41" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">B</text><line x1="226" y1="180" x2="226" y2="214" stroke="#e8ffe8" stroke-width="1.6"/><text x="238" y="197.0" fill="#00ff41" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">D</text><line x1="130" y1="180" x2="56.81740270581524" y2="167.08542400690857" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="45" cy="165" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="45" y="165" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">4</text><polygon points="120,30 114,40 126,40" fill="#00ff41"/><line x1="120" y1="40" x2="120" y2="50" stroke="#00ff41" stroke-width="1.6"/><rect x="109" y="50" width="22" height="20" fill="none" stroke="#00ff41" stroke-width="1.6"/><text x="120" y="60" fill="#00ff41" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="13" text-anchor="middle" dominant-baseline="central">A</text><line x1="120" y1="35" x2="100.73312629199899" y2="25.366563145999496" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="90" cy="20" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="90" y="20" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">2</text><polygon points="200,30 194,40 206,40" fill="#00ff41"/><line x1="200" y1="40" x2="200" y2="50" stroke="#00ff41" stroke-width="1.6"/><rect x="189" y="50" width="22" height="20" fill="none" stroke="#00ff41" stroke-width="1.6"/><text x="200" y="60" fill="#00ff41" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="13" text-anchor="middle" dominant-baseline="central">B</text><line x1="200" y1="35" x2="219.26687370800101" y2="25.366563145999496" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="230" cy="20" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="230" y="20" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">3</text><polygon points="280,90 274,100 286,100" fill="#00ff41"/><line x1="280" y1="100" x2="280" y2="110" stroke="#00ff41" stroke-width="1.6"/><rect x="269" y="110" width="22" height="20" fill="none" stroke="#00ff41" stroke-width="1.6"/><text x="280" y="120" fill="#00ff41" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="13" text-anchor="middle" dominant-baseline="central">C</text><line x1="280" y1="95" x2="302.54370751530524" y2="112.61227149633221" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="312" cy="120" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="312" y="120" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">1</text></svg>$spot$,
		'options', jsonb_build_array(
			jsonb_build_object('id', $spot$1$spot$, 'label', $spot$1$spot$),
			jsonb_build_object('id', $spot$2$spot$, 'label', $spot$2$spot$),
			jsonb_build_object('id', $spot$3$spot$, 'label', $spot$3$spot$),
			jsonb_build_object('id', $spot$4$spot$, 'label', $spot$4$spot$)
		)
	),
	jsonb_build_object(
		'correct', $spot$4$spot$,
		'type', 'choice',
		'explanation', $spot$Callout 1 references datum D, but the part defines only datums A, B, and C. A frame cannot reference a datum that is never established on the part.$spot$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $spot$spot-undefined-datum$spot$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'spot_the_error', $spot$Modifier on a Form Control$spot$, 3, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $spot$spot-mmc-on-flatness$spot$,
		'question', $spot$Which numbered callout is incorrect?$spot$,
		'drawing', $spot$<svg viewBox="0 0 350 250" xmlns="http://www.w3.org/2000/svg"><rect x="70" y="45" width="210" height="100" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><line x1="70" y1="45" x2="280" y2="45" stroke="#e8ffe8" stroke-width="3"/><rect x="150" y="175" width="112" height="34" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><polygon points="154.0,198.6 161.7,185.4 176.0,185.4 168.3,198.6" fill="none" stroke="#00f0ff" stroke-width="1.6"/><line x1="180" y1="175" x2="180" y2="209" stroke="#e8ffe8" stroke-width="1.6"/><text x="190" y="192.0" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="start" dominant-baseline="central">0.005</text><circle cx="240" cy="192.0" r="9" fill="none" stroke="#c8ff00" stroke-width="1.6"/><text x="240" y="192.0" fill="#c8ff00" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="11" text-anchor="middle" dominant-baseline="central">M</text><line x1="90" y1="45" x2="56.71424472220743" y2="37.60316549382387" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="45" cy="35" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="45" y="35" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">2</text><line x1="200" y1="192" x2="131.41240882477138" y2="214.29096713194932" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="120" cy="218" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="120" y="218" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">1</text><circle cx="110" cy="100" r="16" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><line x1="110" y1="100" x2="61.01243524650046" y2="184.6148845742265" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="55" cy="195" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="55" y="195" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">3</text></svg>$spot$,
		'options', jsonb_build_array(
			jsonb_build_object('id', $spot$1$spot$, 'label', $spot$1$spot$),
			jsonb_build_object('id', $spot$2$spot$, 'label', $spot$2$spot$),
			jsonb_build_object('id', $spot$3$spot$, 'label', $spot$3$spot$)
		)
	),
	jsonb_build_object(
		'correct', $spot$1$spot$,
		'type', 'choice',
		'explanation', $spot$Callout 1 applies the MMC modifier to flatness. Material condition modifiers apply only to features of size; flatness controls a surface and takes no modifier.$spot$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $spot$spot-mmc-on-flatness$spot$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'spot_the_error', $spot$Duplicate Dimension$spot$, 2, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $spot$spot-duplicate-dim$spot$,
		'question', $spot$Which numbered callout makes the drawing over-dimensioned?$spot$,
		'drawing', $spot$<svg viewBox="0 0 330 235" xmlns="http://www.w3.org/2000/svg"><rect x="80" y="60" width="180" height="90" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><line x1="80" y1="40" x2="260" y2="40" stroke="#e8ffe8" stroke-width="1.6"/><polygon points="80,40 85,37.5 85,42.5" fill="#e8ffe8"/><polygon points="260,40 255,37.5 255,42.5" fill="#e8ffe8"/><line x1="80" y1="40" x2="80" y2="60" stroke="#e8ffe8" stroke-width="1.6"/><line x1="260" y1="40" x2="260" y2="60" stroke="#e8ffe8" stroke-width="1.6"/><text x="170.0" y="31" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="13" text-anchor="middle" dominant-baseline="central">3.50</text><line x1="80" y1="175" x2="260" y2="175" stroke="#e8ffe8" stroke-width="1.6"/><polygon points="80,175 85,172.5 85,177.5" fill="#e8ffe8"/><polygon points="260,175 255,172.5 255,177.5" fill="#e8ffe8"/><line x1="80" y1="175" x2="80" y2="150" stroke="#e8ffe8" stroke-width="1.6"/><line x1="260" y1="175" x2="260" y2="150" stroke="#e8ffe8" stroke-width="1.6"/><text x="170.0" y="166" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="13" text-anchor="middle" dominant-baseline="central">3.50</text><line x1="80" y1="105" x2="64.0" y2="105.0" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="52" cy="105" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="52" y="105" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">1</text><circle cx="170" cy="105" r="16" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><line x1="170" y1="105" x2="205.54331188375076" y2="193.8582797093769" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="210" cy="205" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="210" y="205" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">2</text><line x1="260" y1="175" x2="280.0" y2="175.0" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="292" cy="175" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="292" y="175" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">3</text></svg>$spot$,
		'options', jsonb_build_array(
			jsonb_build_object('id', $spot$1$spot$, 'label', $spot$1$spot$),
			jsonb_build_object('id', $spot$2$spot$, 'label', $spot$2$spot$),
			jsonb_build_object('id', $spot$3$spot$, 'label', $spot$3$spot$)
		)
	),
	jsonb_build_object(
		'correct', $spot$3$spot$,
		'type', 'choice',
		'explanation', $spot$Callout 3 repeats the overall length already given at the top of the part. A distance is dimensioned once; repeating it over-dimensions the part and invites conflicting values.$spot$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $spot$spot-duplicate-dim$spot$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'spot_the_error', $spot$Dimension to a Hidden Line$spot$, 2, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $spot$spot-dim-to-hidden$spot$,
		'question', $spot$Which numbered callout violates drafting convention?$spot$,
		'drawing', $spot$<svg viewBox="0 0 340 250" xmlns="http://www.w3.org/2000/svg"><rect x="70" y="50" width="200" height="110" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><line x1="150" y1="50" x2="150" y2="160" stroke="#e8ffe8" stroke-width="1.6" stroke-dasharray="5 3"/><line x1="70" y1="195" x2="150" y2="195" stroke="#e8ffe8" stroke-width="1.6"/><polygon points="70,195 75,192.5 75,197.5" fill="#e8ffe8"/><polygon points="150,195 145,192.5 145,197.5" fill="#e8ffe8"/><line x1="70" y1="195" x2="70" y2="160" stroke="#e8ffe8" stroke-width="1.6"/><line x1="150" y1="195" x2="150" y2="160" stroke="#e8ffe8" stroke-width="1.6"/><text x="110.0" y="186" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="13" text-anchor="middle" dominant-baseline="central">1.75</text><line x1="70" y1="160" x2="53.48528137423857" y2="176.51471862576142" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="45" cy="185" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="45" y="185" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">1</text><line x1="150" y1="195" x2="167.75370774405445" y2="218.43489422215188" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="175" cy="228" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="175" y="228" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">2</text><circle cx="215" cy="100" r="18" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><line x1="215" y1="100" x2="251.0097727028639" y2="49.75380553088759" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="258" cy="40" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="258" y="40" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">3</text></svg>$spot$,
		'options', jsonb_build_array(
			jsonb_build_object('id', $spot$1$spot$, 'label', $spot$1$spot$),
			jsonb_build_object('id', $spot$2$spot$, 'label', $spot$2$spot$),
			jsonb_build_object('id', $spot$3$spot$, 'label', $spot$3$spot$)
		)
	),
	jsonb_build_object(
		'correct', $spot$2$spot$,
		'type', 'choice',
		'explanation', $spot$Callout 2 dimensions to a hidden (dashed) line. Dimensions must terminate on visible outlines; locate the feature in a view or section where its edge is visible.$spot$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $spot$spot-dim-to-hidden$spot$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'spot_the_error', $spot$Radius vs Diameter$spot$, 2, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $spot$spot-radius-on-circle$spot$,
		'question', $spot$Which numbered callout is incorrect?$spot$,
		'drawing', $spot$<svg viewBox="0 0 340 240" xmlns="http://www.w3.org/2000/svg"><rect x="70" y="50" width="200" height="110" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="150" cy="105" r="26" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><line x1="150" y1="105" x2="176" y2="88" stroke="#e8ffe8" stroke-width="1.6"/><text x="205" y="78" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="13" text-anchor="start" dominant-baseline="central">R.50</text><line x1="188" y1="80" x2="221.07560227044874" y2="64.96563533161421" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="232" cy="60" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="232" y="60" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">3</text><polygon points="110,175 104,185 116,185" fill="#00ff41"/><line x1="110" y1="185" x2="110" y2="195" stroke="#00ff41" stroke-width="1.6"/><rect x="99" y="195" width="22" height="20" fill="none" stroke="#00ff41" stroke-width="1.6"/><text x="110" y="205" fill="#00ff41" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="13" text-anchor="middle" dominant-baseline="central">A</text><line x1="110" y1="195" x2="91.38419957660616" y2="201.20526680779795" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="80" cy="205" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="80" y="205" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">2</text><line x1="70" y1="188" x2="270" y2="188" stroke="#e8ffe8" stroke-width="1.6"/><polygon points="70,188 75,185.5 75,190.5" fill="#e8ffe8"/><polygon points="270,188 265,185.5 265,190.5" fill="#e8ffe8"/><line x1="70" y1="188" x2="70" y2="160" stroke="#e8ffe8" stroke-width="1.6"/><line x1="270" y1="188" x2="270" y2="160" stroke="#e8ffe8" stroke-width="1.6"/><text x="170.0" y="179" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="13" text-anchor="middle" dominant-baseline="central">4.00</text><line x1="270" y1="188" x2="288.0" y2="188.0" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="300" cy="188" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="300" y="188" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">1</text></svg>$spot$,
		'options', jsonb_build_array(
			jsonb_build_object('id', $spot$1$spot$, 'label', $spot$1$spot$),
			jsonb_build_object('id', $spot$2$spot$, 'label', $spot$2$spot$),
			jsonb_build_object('id', $spot$3$spot$, 'label', $spot$3$spot$)
		)
	),
	jsonb_build_object(
		'correct', $spot$3$spot$,
		'type', 'choice',
		'explanation', $spot$Callout 3 dimensions a full circle with a radius (R). A complete circular feature is dimensioned by diameter; radius is reserved for arcs of less than a full circle.$spot$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $spot$spot-radius-on-circle$spot$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'spot_the_error', $spot$Duplicate Datum Letter$spot$, 3, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $spot$spot-duplicate-datum$spot$,
		'question', $spot$Which numbered callout is incorrect?$spot$,
		'drawing', $spot$<svg viewBox="0 0 330 235" xmlns="http://www.w3.org/2000/svg"><rect x="80" y="50" width="190" height="100" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><polygon points="120,35 114,45 126,45" fill="#00ff41"/><line x1="120" y1="45" x2="120" y2="55" stroke="#00ff41" stroke-width="1.6"/><rect x="109" y="55" width="22" height="20" fill="none" stroke="#00ff41" stroke-width="1.6"/><text x="120" y="65" fill="#00ff41" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="13" text-anchor="middle" dominant-baseline="central">A</text><line x1="120" y1="40" x2="100.28991510855053" y2="28.17394906513032" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="90" cy="22" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="90" y="22" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">1</text><polygon points="230,35 224,45 236,45" fill="#00ff41"/><line x1="230" y1="45" x2="230" y2="55" stroke="#00ff41" stroke-width="1.6"/><rect x="219" y="55" width="22" height="20" fill="none" stroke="#00ff41" stroke-width="1.6"/><text x="230" y="65" fill="#00ff41" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="13" text-anchor="middle" dominant-baseline="central">B</text><line x1="230" y1="40" x2="251.5410935545054" y2="27.883134875590706" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="262" cy="22" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="262" y="22" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">2</text><polygon points="180,175 174,185 186,185" fill="#00ff41"/><line x1="180" y1="185" x2="180" y2="195" stroke="#00ff41" stroke-width="1.6"/><rect x="169" y="195" width="22" height="20" fill="none" stroke="#00ff41" stroke-width="1.6"/><text x="180" y="205" fill="#00ff41" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="13" text-anchor="middle" dominant-baseline="central">A</text><line x1="180" y1="175" x2="157.55762350105462" y2="202.67893101536595" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="150" cy="212" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="150" y="212" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">4</text><circle cx="175" cy="100" r="16" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><line x1="175" y1="100" x2="213.259666992087" y2="188.97596974903956" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="218" cy="200" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="218" y="200" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">3</text></svg>$spot$,
		'options', jsonb_build_array(
			jsonb_build_object('id', $spot$1$spot$, 'label', $spot$1$spot$),
			jsonb_build_object('id', $spot$2$spot$, 'label', $spot$2$spot$),
			jsonb_build_object('id', $spot$3$spot$, 'label', $spot$3$spot$),
			jsonb_build_object('id', $spot$4$spot$, 'label', $spot$4$spot$)
		)
	),
	jsonb_build_object(
		'correct', $spot$4$spot$,
		'type', 'choice',
		'explanation', $spot$Callout 4 labels a second feature as datum A. Each datum letter must identify exactly one datum feature; reusing A is ambiguous.$spot$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $spot$spot-duplicate-datum$spot$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'spot_the_error', $spot$Incomplete Control Frame$spot$, 2, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $spot$spot-incomplete-fcf$spot$,
		'question', $spot$Which numbered callout is incorrect?$spot$,
		'drawing', $spot$<svg viewBox="0 0 340 235" xmlns="http://www.w3.org/2000/svg"><rect x="70" y="45" width="200" height="100" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="150" cy="95" r="20" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><rect x="150" y="165" width="102" height="34" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="165.0" cy="182.0" r="10" fill="none" stroke="#00f0ff" stroke-width="1.6"/><line x1="150.0" y1="182.0" x2="180.0" y2="182.0" stroke="#00f0ff" stroke-width="1.6"/><line x1="165.0" y1="167.0" x2="165.0" y2="197.0" stroke="#00f0ff" stroke-width="1.6"/><line x1="180" y1="165" x2="180" y2="199" stroke="#e8ffe8" stroke-width="1.6"/><text x="190" y="182.0" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="start" dominant-baseline="central"></text><line x1="204" y1="165" x2="204" y2="199" stroke="#e8ffe8" stroke-width="1.6"/><text x="216" y="182.0" fill="#00ff41" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">A</text><line x1="228" y1="165" x2="228" y2="199" stroke="#e8ffe8" stroke-width="1.6"/><text x="240" y="182.0" fill="#00ff41" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">B</text><line x1="130" y1="45" x2="56.917807251874514" y2="36.40209497080877" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="45" cy="35" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="45" y="35" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">2</text><line x1="175" y1="182" x2="128.91782857951708" y2="203.01993784092204" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="118" cy="208" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="118" y="208" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">1</text><polygon points="250,75 244,85 256,85" fill="#00ff41"/><line x1="250" y1="85" x2="250" y2="95" stroke="#00ff41" stroke-width="1.6"/><rect x="239" y="95" width="22" height="20" fill="none" stroke="#00ff41" stroke-width="1.6"/><text x="250" y="105" fill="#00ff41" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="13" text-anchor="middle" dominant-baseline="central">A</text><line x1="250" y1="80" x2="290.2159226362322" y2="72.2661687238015" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="302" cy="70" r="12" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="302" y="70" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">3</text></svg>$spot$,
		'options', jsonb_build_array(
			jsonb_build_object('id', $spot$1$spot$, 'label', $spot$1$spot$),
			jsonb_build_object('id', $spot$2$spot$, 'label', $spot$2$spot$),
			jsonb_build_object('id', $spot$3$spot$, 'label', $spot$3$spot$)
		)
	),
	jsonb_build_object(
		'correct', $spot$1$spot$,
		'type', 'choice',
		'explanation', $spot$Callout 1 has an empty tolerance compartment. A feature control frame must state a tolerance value between the characteristic symbol and the datum references.$spot$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $spot$spot-incomplete-fcf$spot$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'spot_the_error', $spot$Missing Dimension$spot$, 1, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $spot$spot-missing-dim$spot$,
		'question', $spot$What is wrong with this drawing?$spot$,
		'drawing', $spot$<svg viewBox="0 0 340 210" xmlns="http://www.w3.org/2000/svg"><rect x="80" y="55" width="190" height="100" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><line x1="80" y1="185" x2="270" y2="185" stroke="#e8ffe8" stroke-width="1.6"/><polygon points="80,185 85,182.5 85,187.5" fill="#e8ffe8"/><polygon points="270,185 265,182.5 265,187.5" fill="#e8ffe8"/><line x1="80" y1="185" x2="80" y2="155" stroke="#e8ffe8" stroke-width="1.6"/><line x1="270" y1="185" x2="270" y2="155" stroke="#e8ffe8" stroke-width="1.6"/><text x="175.0" y="176" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="13" text-anchor="middle" dominant-baseline="central">4.00</text><circle cx="150" cy="105" r="20" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><line x1="150" y1="105" x2="200" y2="105" stroke="#e8ffe8" stroke-width="1.6"/><text x="205" y="105" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="13" text-anchor="start" dominant-baseline="central">Ø.80</text></svg>$spot$,
		'options', jsonb_build_array(
			jsonb_build_object('id', $spot$a$spot$, 'label', $spot$The overall width is dimensioned twice$spot$),
			jsonb_build_object('id', $spot$b$spot$, 'label', $spot$The hole diameter is given but the hole's vertical location is not dimensioned$spot$),
			jsonb_build_object('id', $spot$c$spot$, 'label', $spot$The hole should use a radius, not a diameter$spot$),
			jsonb_build_object('id', $spot$d$spot$, 'label', $spot$The part outline is drawn with hidden lines$spot$)
		)
	),
	jsonb_build_object(
		'correct', $spot$b$spot$,
		'type', 'choice',
		'explanation', $spot$The hole has a size but no vertical location dimension, so its position is undefined. Every feature must be fully located.$spot$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $spot$spot-missing-dim$spot$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'spot_the_error', $spot$Views Disagree$spot$, 3, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $spot$spot-conflicting-views$spot$,
		'question', $spot$What is wrong with this drawing?$spot$,
		'drawing', $spot$<svg viewBox="0 0 280 285" xmlns="http://www.w3.org/2000/svg"><rect x="60" y="45" width="120" height="65" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="120" y="32" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="12" text-anchor="middle" dominant-baseline="central">FRONT</text><line x1="60" y1="128" x2="180" y2="128" stroke="#e8ffe8" stroke-width="1.6"/><polygon points="60,128 65,125.5 65,130.5" fill="#e8ffe8"/><polygon points="180,128 175,125.5 175,130.5" fill="#e8ffe8"/><line x1="60" y1="128" x2="60" y2="110" stroke="#e8ffe8" stroke-width="1.6"/><line x1="180" y1="128" x2="180" y2="110" stroke="#e8ffe8" stroke-width="1.6"/><text x="120.0" y="119" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="13" text-anchor="middle" dominant-baseline="central">2.00</text><rect x="60" y="165" width="120" height="45" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><line x1="60" y1="240" x2="180" y2="240" stroke="#e8ffe8" stroke-width="1.6"/><polygon points="60,240 65,237.5 65,242.5" fill="#e8ffe8"/><polygon points="180,240 175,237.5 175,242.5" fill="#e8ffe8"/><line x1="60" y1="240" x2="60" y2="210" stroke="#e8ffe8" stroke-width="1.6"/><line x1="180" y1="240" x2="180" y2="210" stroke="#e8ffe8" stroke-width="1.6"/><text x="120.0" y="231" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="13" text-anchor="middle" dominant-baseline="central">2.50</text><text x="120" y="264" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="12" text-anchor="middle" dominant-baseline="central">TOP</text></svg>$spot$,
		'options', jsonb_build_array(
			jsonb_build_object('id', $spot$a$spot$, 'label', $spot$The top view should be drawn as a section view$spot$),
			jsonb_build_object('id', $spot$b$spot$, 'label', $spot$The front view is missing its hatching$spot$),
			jsonb_build_object('id', $spot$c$spot$, 'label', $spot$The two views should not share extension lines$spot$),
			jsonb_build_object('id', $spot$d$spot$, 'label', $spot$The width of the same feature is 2.00 in the front view but 2.50 in the top view$spot$)
		)
	),
	jsonb_build_object(
		'correct', $spot$d$spot$,
		'type', 'choice',
		'explanation', $spot$Aligned views must agree. The same horizontal feature is dimensioned 2.00 in front and 2.50 in top, a conflict that makes the part unbuildable as drawn.$spot$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $spot$spot-conflicting-views$spot$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'spot_the_error', $spot$Unhatched Section$spot$, 3, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $spot$spot-section-hatch$spot$,
		'question', $spot$What is wrong with this section view?$spot$,
		'drawing', $spot$<svg viewBox="0 0 340 200" xmlns="http://www.w3.org/2000/svg"><rect x="70" y="50" width="200" height="120" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><line x1="70" y1="95" x2="270" y2="95" stroke="#e8ffe8" stroke-width="1.6"/><line x1="70" y1="125" x2="270" y2="125" stroke="#e8ffe8" stroke-width="1.6"/><text x="170" y="35" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="12" text-anchor="middle" dominant-baseline="central">SECTION A-A</text></svg>$spot$,
		'options', jsonb_build_array(
			jsonb_build_object('id', $spot$a$spot$, 'label', $spot$The section is hatched too densely to read$spot$),
			jsonb_build_object('id', $spot$b$spot$, 'label', $spot$Hidden lines should be shown inside the section$spot$),
			jsonb_build_object('id', $spot$c$spot$, 'label', $spot$The solid material cut by the section plane is not hatched$spot$),
			jsonb_build_object('id', $spot$d$spot$, 'label', $spot$The bore should be dimensioned with a radius$spot$)
		)
	),
	jsonb_build_object(
		'correct', $spot$c$spot$,
		'type', 'choice',
		'explanation', $spot$Material cut by the section plane must be shown with section lining (hatching). The solid regions here are left blank, so the section reads as empty space.$spot$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $spot$spot-section-hatch$spot$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'spot_the_error', $spot$Projection Mismatch$spot$, 4, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $spot$spot-projection$spot$,
		'question', $spot$The title block specifies third-angle projection. What is wrong?$spot$,
		'drawing', $spot$<svg viewBox="0 0 300 252" xmlns="http://www.w3.org/2000/svg"><rect x="95" y="45" width="110" height="70" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="150" y="32" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="12" text-anchor="middle" dominant-baseline="central">FRONT</text><rect x="95" y="135" width="110" height="55" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><text x="150" y="205" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="12" text-anchor="middle" dominant-baseline="central">TOP</text><text x="150" y="232" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="12" text-anchor="middle" dominant-baseline="central">THIRD ANGLE PROJECTION</text></svg>$spot$,
		'options', jsonb_build_array(
			jsonb_build_object('id', $spot$a$spot$, 'label', $spot$The top view is placed below the front view, which is first-angle arrangement$spot$),
			jsonb_build_object('id', $spot$b$spot$, 'label', $spot$The top view is too small relative to the front view$spot$),
			jsonb_build_object('id', $spot$c$spot$, 'label', $spot$A right-side view is required and is missing$spot$),
			jsonb_build_object('id', $spot$d$spot$, 'label', $spot$The two views are not aligned vertically$spot$)
		)
	),
	jsonb_build_object(
		'correct', $spot$a$spot$,
		'type', 'choice',
		'explanation', $spot$In third-angle projection the top view sits above the front view. Here it is below, which is first-angle placement and contradicts the stated standard.$spot$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $spot$spot-projection$spot$);

insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer)
select 'spot_the_error', $spot$Located Two Ways$spot$, 4, 'draft',
	(select id from public.profiles where role = 'teacher' order by created_at asc limit 1),
	jsonb_build_object(
		'slug', $spot$spot-double-control$spot$,
		'question', $spot$What is wrong with how this hole is located?$spot$,
		'drawing', $spot$<svg viewBox="0 0 350 235" xmlns="http://www.w3.org/2000/svg"><rect x="70" y="45" width="210" height="110" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="180" cy="100" r="20" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><line x1="70" y1="30" x2="180" y2="30" stroke="#e8ffe8" stroke-width="1.6"/><polygon points="70,30 75,27.5 75,32.5" fill="#e8ffe8"/><polygon points="180,30 175,27.5 175,32.5" fill="#e8ffe8"/><line x1="70" y1="30" x2="70" y2="45" stroke="#e8ffe8" stroke-width="1.6"/><line x1="180" y1="30" x2="180" y2="45" stroke="#e8ffe8" stroke-width="1.6"/><text x="125.0" y="21" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="13" text-anchor="middle" dominant-baseline="central">2.00 ±.005</text><rect x="60" y="185" width="156" height="34" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="75.0" cy="202.0" r="10" fill="none" stroke="#00f0ff" stroke-width="1.6"/><line x1="60.0" y1="202.0" x2="90.0" y2="202.0" stroke="#00f0ff" stroke-width="1.6"/><line x1="75.0" y1="187.0" x2="75.0" y2="217.0" stroke="#00f0ff" stroke-width="1.6"/><line x1="90" y1="185" x2="90" y2="219" stroke="#e8ffe8" stroke-width="1.6"/><circle cx="100" cy="202.0" r="7" fill="none" stroke="#e8ffe8" stroke-width="1.6"/><line x1="91" y1="211.0" x2="109" y2="193.0" stroke="#e8ffe8" stroke-width="1.6"/><text x="116" y="202.0" fill="#e8ffe8" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="start" dominant-baseline="central">0.010</text><line x1="168" y1="185" x2="168" y2="219" stroke="#e8ffe8" stroke-width="1.6"/><text x="180" y="202.0" fill="#00ff41" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">A</text><line x1="192" y1="185" x2="192" y2="219" stroke="#e8ffe8" stroke-width="1.6"/><text x="204" y="202.0" fill="#00ff41" font-family="'Share Tech Mono', ui-monospace, monospace" font-size="14" text-anchor="middle" dominant-baseline="central">B</text></svg>$spot$,
		'options', jsonb_build_array(
			jsonb_build_object('id', $spot$a$spot$, 'label', $spot$The position tolerance is missing its datums$spot$),
			jsonb_build_object('id', $spot$b$spot$, 'label', $spot$The diameter symbol should not appear in the position frame$spot$),
			jsonb_build_object('id', $spot$c$spot$, 'label', $spot$The plus/minus tolerance is too tight for the hole size$spot$),
			jsonb_build_object('id', $spot$d$spot$, 'label', $spot$Its location is controlled twice, by a plus/minus dimension and by a position tolerance$spot$)
		)
	),
	jsonb_build_object(
		'correct', $spot$d$spot$,
		'type', 'choice',
		'explanation', $spot$The hole location is over-controlled: a plus/minus dimension and a position tolerance both govern it, giving two conflicting requirements. Locate with basic dimensions plus position, not both.$spot$
	)
where not exists (select 1 from public.challenges where prompt->>'slug' = $spot$spot-double-control$spot$);
