-- 0153_gauntlet_unpublish_the_target.sql
-- IDEA // GAUNTLET: take the ranked answer out of the PUBLISHED column on the
-- rows that already carry it.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS IS, AND WHY A CODE CHANGE ALONE WOULD HAVE CHANGED NOTHING.
--
-- `buildPayload` (src/lib/gauntlet/authoring.ts) wrote `target_mass`, `density`
-- and `tolerance_pct` into BOTH `challenges.prompt` and `challenges.answer`,
-- and a comment called the first pair "display copies". They are not copies of a
-- display value, they are the level's ranked answer and its pass band, and
-- `prompt` is not private:
--
--     0004:  grant select (id, mode, title, difficulty, asset_ref, prompt,
--                          author_id, published, created_at, updated_at)
--              on public.challenges to authenticated;
--     0004:  create policy "read published challenges" ... using (published or is_teacher());
--
-- So ONE ordinary PostgREST read -- no reveal, no run token, no clock, no rate
-- limit, no search -- returned the target mass, the density that converts it to
-- the ranked comparison volume, and the exact width of the pass band, for every
-- published level at once, to every signed-in student. The shipped client did
-- the conversion itself: `targetVolumeFromMass(prompt.target_mass, density,
-- unit_system)` is `gauntlet_macro_submit`'s own comparison value, reconstructed
-- in the browser and drawn on a gauge.
--
-- `0061` and `0147` each recorded this in their own headers as a remaining
-- limitation and neither closed it. `0151` metered the practice check on the
-- premise that recovering the target required a search; against a level that
-- publishes it, no search is required at all. This file closes the disclosure at
-- its source -- the stored bytes -- and the same commit stops the form writing
-- it and stops the two Speedrun loaders projecting it.
--
-- THIS ALONE IS NOT THE END OF THE LEADERBOARD QUESTION, AND SAYING SO IS PART
-- OF THE FIX. `docs/history/speedrun-deviation-band-measure-hoqxzz.md` measured
-- that the target is ALSO recoverable by search, through a free pass/fail
-- oracle, in 12 probes against a student who has nearly modelled the part and
-- 163 from a standing start. That search still exists, and `0151` slowed it
-- rather than stopping it. What this file removes is the case where there is
-- nothing to search: the answer being handed over on request. Anybody reading
-- this as "Speedrun is now trustworthy" has misread it; the containment that
-- bundle measured to work is a person's decision about `gauntlet_leaderboard`'s
-- allowlist, and it is not made here.
--
-- ---------------------------------------------------------------------------
-- IT DOES NOT INVALIDATE A SINGLE RUN ALREADY ON THE BOARD, AND SOMEBODY WILL
-- ASK, SO IT IS WRITTEN DOWN HERE.
--
-- Every ranked Speedrun run was graded by `gauntlet_macro_submit` against
-- `challenges.answer`, which this file does not touch, has never touched, and
-- must not touch. `_gauntlet_target_mass_g` and `_gauntlet_tol_pct` prefer
-- `answer` and the ranked path has always used it. Nothing here re-grades,
-- re-ranks, deletes a submission, or changes a `score_metric`. A run that passed
-- yesterday passed against the same number it would be graded against today.
--
-- What the old framing DID mean is that a student could have passed by reading
-- the target rather than by modelling to it -- and that is exactly as true of
-- the runs already recorded as it was before this migration. Stripping the
-- column cannot reach backwards. If a specific board is in doubt, that is a
-- question for a person with `gauntlet_practice_pressure` (0151) and the run
-- telemetry, not something a migration can decide.
--
-- ---------------------------------------------------------------------------
-- WHAT IT REFUSES TO DO, AND WHY THE CHECK IS BEHAVIOURAL.
--
-- One of the three keys is still READ from `prompt` by live SQL:
--
--     _gauntlet_density_g_cm3(prompt, answer)  -- 0147, and 0034/0061 inline
--         coalesce(answer->>'density', prompt->>'density')
--     gauntlet_run_targets(code)               -- 0147, the same coalesce again
--         for the level-unit density it shows the add-in
--
-- So on a row whose `answer` carries no density, removing `prompt.density` does
-- not merely hide a number, it takes away the level's GRADING BASIS -- silently,
-- because `->>` on a missing key is NULL and a NULL target grades every submit
-- as wrong. `gauntlet_publish_blocker` (0034) has required `answer.density` and
-- `answer.target_mass` on every published modeling challenge since 0034, and
-- every seed in 0005/0007 carries both, so the expected count of such rows is
-- ZERO. Expected is not measured.
--
-- The check is therefore a BEHAVIOURAL PROBE, per CLAUDE.md: it puts the real,
-- currently-deployed helpers to each row's CURRENT jsonb and to the jsonb this
-- file would leave behind, and compares the two answers. The question is which
-- rows CHANGE ANSWER, and a second hand-written idea of "where does the density
-- come from" is the copy that stops matching the one the grader uses. If any row
-- would change, the file RAISES with the counts and applies nothing.
--
-- `tolerance_pct` needs no probe: `_gauntlet_tol_pct` reads `answer` alone and
-- falls back to the 0.1 shared default (0036). `target_mass` needs none for its
-- own sake either -- `_gauntlet_target_mass_g` reads `answer->>'target_mass'`
-- and never the prompt -- but it is probed anyway, because that helper computes
-- from the DENSITY first and so changes answer for exactly the rows the density
-- probe catches, one step further on.
--
-- ---------------------------------------------------------------------------
-- IDEMPOTENT. The update is guarded on the row still carrying one of the keys,
-- so a second paste reports 0 rows and writes nothing. Re-pasting is ordinary
-- here (0034's rule) and this file is safe to re-run any number of times.
--
-- WHAT UNDOES IT: nothing has to. Every value removed is still on the same row,
-- in `answer`, which is where the graders have always read it. A row could be
-- rewritten from its own answer if anyone wanted the public copy back -- and
-- nobody should, because that is the disclosure. There is no data to restore
-- from a backup and no dependent object to recreate.
--
-- CREATES NO FUNCTION, so there is no new grant to narrow and 0137's sweep has
-- nothing to cover here.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Preconditions. The probe below calls 0147's helpers; without them this file
--    would strip the column with nothing having checked what that costs.
-- ---------------------------------------------------------------------------
do $mig$
begin
	if to_regprocedure('public._gauntlet_density_g_cm3(jsonb, jsonb)') is null
		or to_regprocedure('public._gauntlet_target_mass_g(jsonb, jsonb)') is null
	then
		raise exception
			'0153 requires 0147 (_gauntlet_density_g_cm3 / _gauntlet_target_mass_g). Apply 0147 first; nothing has been changed.';
	end if;
end
$mig$;

-- ---------------------------------------------------------------------------
-- 2. Count what is there, before anything is written, and print it. The operator
--    checks these against what the deployed app actually holds.
-- ---------------------------------------------------------------------------
do $mig$
declare
	v_modeling bigint;
	v_pub_any bigint;
	v_unpub_any bigint;
	v_pub_mass bigint;
	v_pub_density bigint;
	v_pub_tol bigint;
	v_speedrun bigint;
begin
	select
		count(*) filter (where c.mode in ('speedrun', 'reverse_engineer', 'feature_golf')),
		count(*) filter (where c.mode in ('speedrun', 'reverse_engineer', 'feature_golf')
			and c.published
			and c.prompt ?| array['target_mass', 'density', 'tolerance_pct']),
		count(*) filter (where c.mode in ('speedrun', 'reverse_engineer', 'feature_golf')
			and not c.published
			and c.prompt ?| array['target_mass', 'density', 'tolerance_pct']),
		count(*) filter (where c.mode in ('speedrun', 'reverse_engineer', 'feature_golf')
			and c.published and c.prompt ? 'target_mass'),
		count(*) filter (where c.mode in ('speedrun', 'reverse_engineer', 'feature_golf')
			and c.published and c.prompt ? 'density'),
		count(*) filter (where c.mode in ('speedrun', 'reverse_engineer', 'feature_golf')
			and c.published and c.prompt ? 'tolerance_pct'),
		count(*) filter (where c.mode = 'speedrun'
			and c.published
			and c.prompt ?| array['target_mass', 'density', 'tolerance_pct'])
	into v_modeling, v_pub_any, v_unpub_any, v_pub_mass, v_pub_density, v_pub_tol, v_speedrun
	from public.challenges c;

	raise notice '0153: % modeling challenges in total.', v_modeling;
	raise notice '0153: PUBLISHED rows carrying at least one of the three keys in prompt: % (of which % are speedrun, the only globally ranked modeling mode).',
		v_pub_any, v_speedrun;
	raise notice '0153:   published prompt.target_mass   %', v_pub_mass;
	raise notice '0153:   published prompt.density       %', v_pub_density;
	raise notice '0153:   published prompt.tolerance_pct %', v_pub_tol;
	raise notice '0153: DRAFT/archived rows also carrying one: %. They are stripped too -- a draft is teacher-only today, but publishing one does not rewrite its prompt, so leaving them would re-open the leak the next time somebody presses Publish.',
		v_unpub_any;
end
$mig$;

-- ---------------------------------------------------------------------------
-- 3. The refusal. Behavioural: the deployed helpers, this row's current jsonb
--    against the jsonb this file would leave behind.
-- ---------------------------------------------------------------------------
do $mig$
declare
	v_stranded bigint;
	v_detail text;
begin
	with candidate as (
		select
			c.id,
			c.title,
			c.published,
			c.prompt as before_prompt,
			c.prompt - 'target_mass' - 'density' - 'tolerance_pct' as after_prompt,
			c.answer
		from public.challenges c
		where c.mode in ('speedrun', 'reverse_engineer', 'feature_golf')
			and c.prompt ?| array['target_mass', 'density', 'tolerance_pct']
	),
	probed as (
		select
			k.id,
			k.title,
			k.published,
			public._gauntlet_density_g_cm3(k.before_prompt, k.answer)
				is distinct from public._gauntlet_density_g_cm3(k.after_prompt, k.answer) as density_moved,
			public._gauntlet_target_mass_g(k.before_prompt, k.answer)
				is distinct from public._gauntlet_target_mass_g(k.after_prompt, k.answer) as mass_moved
		from candidate k
	)
	select
		count(*),
		string_agg(format('%s (%s, published=%s)', p.title, p.id, p.published), '; ' order by p.title)
	into v_stranded, v_detail
	from probed p
	where p.density_moved or p.mass_moved;

	if v_stranded > 0 then
		raise exception
			'0153 REFUSES: % modeling challenge(s) would change their grading basis if prompt were stripped, because the value the grader reads comes from prompt and is missing from answer. Nothing has been changed. Put the value into answer on each row first (answer.density and answer.target_mass are what gauntlet_publish_blocker already requires), then re-run this file. Rows: %',
			v_stranded, coalesce(v_detail, '(none named)');
	end if;

	raise notice '0153: grading-basis probe passed. 0 rows change what _gauntlet_density_g_cm3 or _gauntlet_target_mass_g answer.';
end
$mig$;

-- ---------------------------------------------------------------------------
-- 4. The strip. `answer` is not named on either side of this statement.
-- ---------------------------------------------------------------------------
do $mig$
declare
	v_touched bigint;
begin
	with stripped as (
		update public.challenges c
		set prompt = c.prompt - 'target_mass' - 'density' - 'tolerance_pct',
			updated_at = now()
		where c.mode in ('speedrun', 'reverse_engineer', 'feature_golf')
			and c.prompt ?| array['target_mass', 'density', 'tolerance_pct']
		returning c.id
	)
	select count(*) into v_touched from stripped;

	raise notice '0153: stripped % row(s). A re-paste of this file reports 0.', v_touched;
end
$mig$;

-- ---------------------------------------------------------------------------
-- 5. Assert the end state rather than trusting step 4's own count, and assert
--    the thing this file is FOR: no modeling challenge publishes the answer.
-- ---------------------------------------------------------------------------
do $mig$
declare
	v_left bigint;
	v_answer_intact bigint;
	v_answer_total bigint;
begin
	select count(*) into v_left
	from public.challenges c
	where c.mode in ('speedrun', 'reverse_engineer', 'feature_golf')
		and c.prompt ?| array['target_mass', 'density', 'tolerance_pct'];

	if v_left > 0 then
		raise exception '0153: % modeling row(s) still carry a target/density/tolerance key in prompt after the update. This should be impossible; investigate before deploying.', v_left;
	end if;

	select
		count(*) filter (where c.answer ? 'target_mass' and c.answer ? 'density'),
		count(*)
	into v_answer_intact, v_answer_total
	from public.challenges c
	where c.mode in ('speedrun', 'reverse_engineer', 'feature_golf')
		and c.published;

	raise notice '0153: 0 modeling rows publish a target, a density or a tolerance.';
	raise notice '0153: answer untouched -- % of % published modeling rows still carry both answer.target_mass and answer.density (this file never wrote to answer; a shortfall here is a pre-existing row, not damage).',
		v_answer_intact, v_answer_total;
end
$mig$;
