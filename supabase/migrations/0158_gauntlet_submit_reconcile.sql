-- 0158_gauntlet_submit_reconcile.sql
-- IDEA // GAUNTLET: one gauntlet_submit carrying BOTH the server-stamped
-- knowledge clock and the Speedrun practice meter.
--
-- Apply manually in the Supabase SQL editor, AFTER 0157 and AFTER 0151.
-- See "WHAT THIS ASSUMES" below: it refuses rather than half-applying.
--
-- ===========================================================================
-- PROVENANCE: TWO SESSIONS DERIVED THIS FILE INDEPENDENTLY AND THIS IS THE ONE
-- THAT SHIPPED. READ THIS BEFORE CONCLUDING THE OTHER ONE WAS LOST.
-- ===========================================================================
-- Two branches each carried a file at this number, written without sight of
-- one another:
--
--   claude/gauntlet-submit-reconcile-mzqr4t    b9b121c
--   claude/anon-coin-public-projections-mrlg0d 74faca9   <- this body
--
-- THE `gauntlet_submit` BODIES ARE IDENTICAL. Measured rather than taken on
-- trust: both function definitions were extracted with the `awk` range below,
-- full-line comments and blank lines removed and whitespace collapsed, and the
-- two results are 145 lines with the same md5 (4049ecd7fc3d44d668c1a898d1d8e12d).
-- Not one executable line of the function differs. That is the strongest
-- statement available about this reconciliation: two derivations that shared
-- no author and no method converged on the same body.
--
-- THE SCAFFOLDING AROUND IT DID NOT AGREE, which is why one had to be chosen
-- rather than either taken as interchangeable. The two files differ in their
-- precondition guard, their self-checks, and whether the whole file runs in an
-- explicit transaction.
--
-- WHY THIS ONE. Its derivation is a NAMED, RERUNNABLE COMMAND -- a three-way
-- merge over 0147, the genuine common ancestor of the two conflicting bodies
-- (see "HOW THIS BODY WAS DERIVED" below). The other file reached the same
-- body by splicing five clauses out of 0148 into 0151's text by hand: correct,
-- as the md5 above proves, but auditable only by redoing the splice and
-- trusting the result. A reconciliation nobody can re-run is a third
-- definition of the function.
--
-- WHAT THE OTHER FILE'S SCAFFOLDING HAD THAT THIS ONE DOES NOT, recorded here
-- so it is dropped in the open rather than quietly:
--
--   * ITS DEPENDENCY GUARD PINNED THE EXACT SIGNATURE,
--     `to_regprocedure('public._gauntlet_practice_min_interval()')`, where
--     section 1 below matches on the NAME alone. In every state reachable
--     today these are the same question -- 0151 creates exactly one such
--     function and it takes no arguments -- so this is a difference in
--     precision, not in outcome. It would start to matter only if that helper
--     ever gained an overload.
--   * A `comment on function`, recording the reconciliation in the database
--     itself where `\df+` would show it. This file leaves that to the header.
--   * A self-check on `now() - v_start.started_at`, i.e. that the elapsed is
--     computed from the STORED start row. THIS ONE WAS ADOPTED, and it is the
--     only executable line in this file that did not come from the branch
--     named above. The first draft of this comment argued it was redundant
--     against section 3's `client_elapsed_ms` and `answered_at` checks; the
--     mutation proof said otherwise. Removing the clock recomputation and
--     changing nothing else leaves every other probe string in place, so all
--     four of the original checks passed on a body that had gone back to
--     scoring `p_elapsed_ms` -- the exact defect this file exists to repair,
--     installing cleanly and reporting success. Section 3 carries the check
--     now, with that measurement recorded beside it.
--
-- APART FROM THAT ONE `if`, NOTHING EXECUTABLE WAS TAKEN FROM THE OTHER FILE.
-- The function body is that branch's SQL verbatim and everything else here is
-- comment. Blending the two scaffoldings wholesale would have produced a third
-- arrangement that neither session wrote and neither test run had applied; a
-- single check added under a measurement is a different thing, and is recorded
-- rather than smuggled.
--
-- ===========================================================================
-- WHY THIS EXISTS: 0151 REVERTS 0148, AND NOTHING WOULD HAVE SAID SO.
-- ===========================================================================
-- Both files redefine `gauntlet_submit`. 0151's header says its knowledge
-- branch is "0147's text unchanged, diffed against the source rather than
-- reconstructed" -- and that is exactly what happened: it was diffed against
-- 0147 and skipped 0148, which sits between them and had already rewritten
-- that branch. Measured on the three bodies rather than argued:
--
--     0147  gauntlet_submit  119 lines   0 refs to the clock
--     0148  gauntlet_submit  158 lines   6 refs (gauntlet_knowledge_starts,
--                                        started_at, client_elapsed_ms)
--     0151  gauntlet_submit  150 lines   0 refs, and the last word on the
--                                        knowledge path is once again
--                                        v_elapsed_ms := greatest(coalesce(p_elapsed_ms, 0), 0)
--
-- THE TELL IS IN 0151'S OWN COMMENT. Where 0148 put the clock, 0151 writes
-- "the knowledge modes are not metered ... and 0148 already gave them a
-- clock." The SENTENCE was written against 0148 and the CODE beneath it was
-- diffed against 0147, so the prose describing the clock survived and the
-- clock did not.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS URGENT AND NOT UNTIDY: THE CLIENT HALF IS ALREADY DEPLOYED.
-- ---------------------------------------------------------------------------
-- `src/lib/gauntlet/knowledge-clock.ts` is on `main` today. Its ladder
-- degrades on `PGRST202` ALONE -- the code for a function that does not
-- exist -- and 0151 does NOT drop `gauntlet_knowledge_start`. So after 0151:
--
--   1. the start call still succeeds, so the client reports `state: 'server'`;
--   2. `clockIsServerSide` is therefore true, so the client OMITS
--      `p_elapsed_ms`, exactly as it was designed to once 0148 landed;
--   3. the reverted body reads the missing parameter as NULL and
--      `greatest(coalesce(NULL, 0), 0)` scores it 0.00;
--   4. 0154 strips WRONG answers off the knowledge boards, so those zeros sit
--      at rank one with nothing left to outrank them.
--
-- Every knowledge answer, every board, silently, with no error anywhere. The
-- client's own header names this failure mode in advance ("a client that
-- stopped sending one before the migration landed would fill every knowledge
-- board with 0.00 rows") and guards against the case it could see -- the
-- function being ABSENT. It cannot see a function that is present and has been
-- rewritten underneath it.
--
-- ---------------------------------------------------------------------------
-- NEITHER ORDER SAVES IT, WHICH IS WHY THIS IS A THIRD FILE AND NOT A RE-PASTE.
-- ---------------------------------------------------------------------------
-- 0148's body contains no practice meter; 0151's contains no clock. Applying
-- them in either order leaves whichever ran last standing alone. The only fix
-- is one definition carrying both, which is this file.
--
-- ===========================================================================
-- HOW THIS BODY WAS DERIVED, AND HOW TO AUDIT IT
-- ===========================================================================
-- IT WAS NOT RETYPED FROM EITHER FILE. Both bodies were extracted
-- mechanically, and the result is a THREE-WAY MERGE with 0147 -- their genuine
-- common ancestor -- as the base:
--
--     git merge-file  0148.body  0147.body  0151.body
--
-- That is the whole derivation, and it is reproducible by anyone with the
-- three files. It reported exactly TWO conflicts, both resolved below and both
-- trivial:
--
--   CONFLICT 1, the DECLARE block. 0148 adds `v_start`, 0151 adds
--   `v_last_check`. Two adjacent insertions, not a disagreement: BOTH KEPT.
--
--   CONFLICT 2, the head of the knowledge branch. 0148 puts the clock there;
--   0151 only rewrites the COMMENT there. 0148's code is kept whole and
--   0151's sentence is kept above it with its provenance recorded, because it
--   documents a real decision (knowledge modes are deliberately not metered).
--
-- THE SPEEDRUN METER MERGED WITH NO CONFLICT AT ALL, which is the substantive
-- finding of the merge: the two changes live in different branches of the same
-- function and never touched one another's code. The revert was gratuitous.
--
-- THE AUDIT, run against the merged body before this file was written:
--
--   * every one of 0148's 39 added lines is present:              39 / 39
--   * every one of 0151's added CODE lines is present:            27 / 27
--     (its 3 comment lines are rephrased, with the reason stated)
--   * lines present in the merged body but in NEITHER source:      8
--     -- and all 8 are the comment explaining conflict 2. NOT ONE LINE OF
--     EXECUTABLE SQL IN THIS FUNCTION IS NEW.
--
-- Reproduce it with:
--   awk '/^create or replace function public.gauntlet_submit/,/^\$\$;/' <file>
-- over 0147, 0148, 0151 and this file, then diff.
--
-- CLAUSE BY CLAUSE, WHAT CAME FROM WHERE:
--
--   from 0147 (untouched by both, so untouched here): the signature, the
--     sign-in check, the challenge lookup, the publication gate, the modeling
--     branches, the answer grading, the submissions insert, the return shape.
--   from 0148: `v_start` and `c_ms_max`; the `select ... for update` on
--     gauntlet_knowledge_starts; the start-record refusal; the server-clock
--     `v_elapsed_ms` / `v_score` recomputation; the rebuilt `v_value` carrying
--     `clock`, `started_at` and `client_elapsed_ms`; `timed_attempt` in the
--     return; and the `answered_at = coalesce(answered_at, now())` close.
--   from 0151: `v_last_check`; the `pg_advisory_xact_lock` on
--     (caller, challenge); the last-practice-check lookup; and the
--     `_gauntlet_practice_min_interval()` refusal.
--
-- ===========================================================================
-- WHAT THIS ASSUMES, AND WHAT IT DOES IF THE ASSUMPTION IS FALSE
-- ===========================================================================
-- The class of defect this file repairs IS a migration assuming a state that
-- was not there, so this one checks instead of assuming. It needs TWO objects
-- it does not create:
--
--   * `public.gauntlet_knowledge_starts`      (0148)
--   * `public._gauntlet_practice_min_interval()` (0151)
--
-- Section 1 looks both up in the catalog and RAISES, naming whichever is
-- missing and changing nothing. It does not create either: a second definition
-- of the interval would be the same mistake one file over, and this file's
-- entire subject is what happens when one function has two authors.
--
-- SO IT IS SAFE IN BOTH DIRECTIONS, which is the property asked for:
--
--   0151 already pasted  -> this applies and repairs the revert.
--   0151 not yet pasted  -> this refuses, names 0151, and leaves 0148's body
--                           standing. That is the current, correct state; the
--                           database is not left half-reconciled.
--
-- THE PASTE ORDER MATTERS AND IS NOT MERELY TIDY. Between 0151 and this file
-- there is a window in which every knowledge answer scores 0.00. Paste them in
-- the same sitting, 0151 then 0158 -- or skip 0151 entirely, which is also a
-- coherent choice and leaves the clock intact and the meter absent.
--
-- ===========================================================================
-- WHAT UNDOES THIS FILE
-- ===========================================================================
-- Re-apply 0151's section 3 (`gauntlet_submit`) verbatim, which restores the
-- reverted body and reopens the defect above, or 0148's section for the
-- clock-without-meter state. There is nothing else to undo: no table, no
-- column, no grant that was not already there.
-- ===========================================================================

begin;

-- ===========================================================================
-- 1. The two objects this body calls but does not create.
-- ===========================================================================
do $guard$
declare
	v_missing text[] := '{}';
begin
	if to_regclass('public.gauntlet_knowledge_starts') is null then
		v_missing := v_missing || 'gauntlet_knowledge_starts (apply 0148 first)';
	end if;
	if not exists (
		select 1 from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = '_gauntlet_practice_min_interval'
	) then
		v_missing := v_missing || '_gauntlet_practice_min_interval() (apply 0151 first)';
	end if;

	if array_length(v_missing, 1) is not null then
		raise exception
			'0158 refuses: this reconciliation needs both halves and % is missing. Nothing has been changed. See this file''s header for the paste order.',
			array_to_string(v_missing, ' and ');
	end if;
end
$guard$;

-- ===========================================================================
-- 2. gauntlet_submit -- 0148's clock and 0151's meter, in one body.
--    Derived by three-way merge over 0147. See the header for the audit.
-- ===========================================================================
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
	v_start public.gauntlet_knowledge_starts%rowtype;
	v_last_check timestamptz;
	c_lb_to_g constant numeric := 453.59237;
	-- int4's ceiling, in ms. See the overflow note above section 4.
	c_ms_max constant numeric := 2147483647;
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
		-- 0151's comment, kept verbatim, because it records a real decision:
		-- the knowledge modes are NOT metered. They grade against a fixed key
		-- rather than a continuum, so repeating one is not a search.
		--
		-- Its last clause -- "and 0148 already gave them a clock" -- is the
		-- proof that 0151's author knew 0148 existed. The comment was written
		-- against 0148 and the CODE beneath it was diffed against 0147, which
		-- is how the clock came to be dropped while the sentence describing it
		-- survived.
		-- 0148: THE CLOCK IS THE SERVER'S. `p_elapsed_ms` is not read on this
		-- path at all; what the caller sent is recorded in `value` as evidence.
		select * into v_start
		from public.gauntlet_knowledge_starts
		where user_id = v_uid and challenge_id = p_challenge_id
		for update;
		if not found then
			raise exception 'This question was not started on this device, so there is no timer to score it against. Reload the page and answer it again.';
		end if;

		v_elapsed_ms := least(
			greatest(floor(extract(epoch from (now() - v_start.started_at)) * 1000), 0),
			c_ms_max
		)::integer;
		v_score := round(v_elapsed_ms::numeric / 1000.0, 2);
		-- REBUILT, because `gauntlet_leaderboard`'s TIEBREAK is
		-- `(value ->> 'elapsed_ms')::numeric` and would otherwise still be ranking
		-- on a number the browser chose.
		v_value := coalesce(p_value, '{}'::jsonb) || jsonb_build_object(
			'elapsed_ms', v_elapsed_ms,
			'clock', 'server',
			'started_at', v_start.started_at,
			'client_elapsed_ms', p_elapsed_ms
		);

		-- The grading below is 0008's, unchanged: this file moves the clock, not
		-- the answer check.
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
			'score_metric', v_score,
			-- Was THIS submit the one the clock was running for. False on every
			-- later review attempt, so the surface can say the ranked time was set
			-- on the first answer instead of showing a four-figure number.
			'timed_attempt', v_start.answered_at is null
		);

		-- CLOSE THE CLOCK. `coalesce` rather than a plain assignment: the stamp is
		-- set once and never moved, which is what makes a later correct resubmit
		-- cost the whole detour through the answer key.
		update public.gauntlet_knowledge_starts
		set answered_at = coalesce(answered_at, now())
		where user_id = v_uid and challenge_id = p_challenge_id;
	elsif v_challenge.mode = 'speedrun' then
		-- ### 0151: the minimum interval. Everything else in this branch is
		-- ### 0147's text unchanged.
		--
		-- Serialize this caller on this challenge first, so a double post cannot
		-- have both halves read an empty window.
		perform pg_advisory_xact_lock(
			hashtextextended(v_uid::text || ':' || p_challenge_id::text, 0)
		);

		select s.created_at into v_last_check
		from public.submissions s
		where s.user_id = v_uid
			and s.challenge_id = p_challenge_id
			and s.mode = 'speedrun'
			and s.source = 'manual'
			and s.room_id is null
		order by s.created_at desc
		limit 1;

		if v_last_check is not null
			and now() - v_last_check < public._gauntlet_practice_min_interval()
		then
			-- Names nothing in the database, characterises nobody, and says what
			-- to do next. See this file's header for why it raises rather than
			-- returning a refusal object.
			raise exception 'You just checked this part a moment ago. Give it a couple of seconds and check it again.';
		end if;
		-- ### end 0151.

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

-- The signature is 0147's, unchanged by 0148, by 0151 and by this file, so
-- there is no arity to drop and no overload to strand (the signature trap).
-- Section 3 asserts that from the catalog rather than trusting this sentence.
--
-- A `create or replace` under this project's default privileges hands the
-- function a FRESH `anon` grant, and 0137 is a one-time sweep that does not
-- cover anything replaced after it -- so the end state is restated here,
-- naming the roles, exactly as 0148 and 0151 each do.
revoke all on function public.gauntlet_submit(uuid, jsonb, integer)
	from public, anon, authenticated, service_role;
grant execute on function public.gauntlet_submit(uuid, jsonb, integer) to authenticated;

-- ===========================================================================
-- 3. Self-checks. Each reads the END STATE out of the catalog rather than
--    asserting that a statement above ran.
-- ===========================================================================
do $checks$
declare
	v_src text;
	v_arities integer;
begin
	select p.prosrc into v_src
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'gauntlet_submit';

	-- BOTH HALVES, asserted separately, because the failure this file repairs
	-- is precisely one half silently replacing the other.
	if v_src not like '%gauntlet_knowledge_starts%' then
		raise exception '0158 did not take: gauntlet_submit has no server clock (0148''s half is missing).';
	end if;
	if v_src not like '%_gauntlet_practice_min_interval()%' then
		raise exception '0158 did not take: gauntlet_submit has no practice meter (0151''s half is missing).';
	end if;
	-- The clock must be the LAST word on the knowledge path, not merely
	-- mentioned: 0151's body also names `p_elapsed_ms`, so presence alone
	-- would pass on the reverted text too.
	if v_src not like '%client_elapsed_ms%' then
		raise exception '0158 did not take: the caller''s claimed time is not being recorded as evidence, so the clock is not the server''s.';
	end if;
	-- THE ELAPSED IS COMPUTED FROM THE STORED START ROW, and this is the check
	-- that the other branch had and this one did not. It is here because it was
	-- MEASURED to matter, not on grounds of taste: replacing the recomputation
	-- with 0151's `v_elapsed_ms := greatest(coalesce(p_elapsed_ms, 0), 0)` and
	-- changing nothing else leaves `gauntlet_knowledge_starts`,
	-- `client_elapsed_ms` and the `answered_at` close all in place, so the four
	-- checks around this one ALL PASS while the clock is gone and the browser's
	-- number is scored again. Verified by applying exactly that mutant: the file
	-- installed clean and four tests in the suite reddened instead. From
	-- claude/gauntlet-submit-reconcile-mzqr4t, which is the one thing this file
	-- takes from that branch.
	if v_src not like '%now() - v\_start.started\_at%' then
		raise exception '0158 did not take: the knowledge elapsed is not stamped from the stored start row, so the clock is the caller''s again.';
	end if;
	if v_src not like '%answered_at = coalesce(answered_at, now())%' then
		raise exception '0158 did not take: the start record is never closed, so a resubmit would re-time.';
	end if;

	-- Exactly one arity, so no old overload survives to be resolved instead.
	select count(*) into v_arities
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'gauntlet_submit';
	if v_arities <> 1 then
		raise exception '0158: gauntlet_submit resolves to % rows, expected exactly 1.', v_arities;
	end if;

	-- The grant partition, both directions: a file that closed everything
	-- would satisfy half of this.
	if has_function_privilege('anon', 'public.gauntlet_submit(uuid, jsonb, integer)', 'EXECUTE') then
		raise exception '0158 leaked gauntlet_submit to anon.';
	end if;
	if not has_function_privilege('authenticated', 'public.gauntlet_submit(uuid, jsonb, integer)', 'EXECUTE') then
		raise exception '0158 went too far: authenticated lost EXECUTE on gauntlet_submit.';
	end if;

	raise notice '0158: gauntlet_submit now carries the server clock (0148) and the practice meter (0151) in one body.';
end
$checks$;

commit;
