-- 0160_classroom_submit_incomplete_work.sql
-- IDEA // CLASSROOM: a student may turn in work the preflight considers
-- unfinished. The unmet list rides along with the acceptance instead of
-- standing in front of it.
--
-- Apply manually in the Supabase SQL editor. It is independent of 0159 and
-- either may be applied first.
--
-- ===========================================================================
-- WHERE THE GATE ACTUALLY IS, AND IT IS NOT THE CLIENT
-- ===========================================================================
-- `AssignmentEngine`'s Submit button is disabled by `busy` alone and its
-- preflight card is already advisory -- it tells a student what is unfinished
-- and does not stop them pressing the button. What refuses is THIS FUNCTION,
-- which recomputes `_classroom_spec_unmet` server-side and returns
-- `{ok:false, reason:'incomplete'}` before writing anything. So the refusal a
-- student meets is the database's, and only a migration removes it.
--
-- WHY REMOVE IT. Sometimes the assignment itself is wrong and sometimes a
-- sentence counter is wrong. A student must never be trapped by a defect in
-- the instrument: the cost of accepting unfinished work is a grader seeing
-- unfinished work, which is a thing graders do; the cost of refusing it is a
-- student who cannot hand in at all and has nobody to appeal to at 11pm.
--
-- ===========================================================================
-- WHAT CHANGES, EXACTLY
-- ===========================================================================
-- 0086 is the ONLY author of `classroom_submit_assignment(uuid)` -- no later
-- migration redefines it (0134 discusses it in a comment and does not touch
-- it) -- so 0086's body is the base and this file is a diff against it.
--
-- ONE refusal is removed and nothing else. The `if jsonb_array_length(v_unmet)
-- > 0 then return ... 'incomplete'` branch is deleted; the
-- `_classroom_spec_unmet` CALL stays exactly where it was, because the answer
-- is still wanted -- it now travels on the SUCCESS payload as `unmet`, so a
-- student sees the same warning they see today and the write lands anyway.
--
-- WHAT STILL REFUSES, UNCHANGED:
--   * `already_submitted` -- resubmitting over a submitted row is still
--     refused, and `classroom_unsubmit_assignment` is still the way back.
--   * `nothing_attached` -- an assignment with NO spec still requires at
--     least one attached file, because there is nothing else it could mean to
--     submit one. An empty submission is not incomplete work, it is no work,
--     and this file is not about that.
--   * EVERY AUTHORIZATION CHECK. All of them live in
--     `_classroom_engine_student(p_item_id)`, which is the first thing the
--     declare block calls and is untouched: signed in, the item exists and is
--     a PUBLISHED assignment, and the caller holds an ACTIVE enrollment in a
--     section it is posted to. Each of those still RAISES, and a raise is not
--     reachable from anything this file edits.
--
-- ===========================================================================
-- THE PAYLOAD, AND WHY THERE IS NO NEW COLUMN
-- ===========================================================================
-- The success payload gains one key: `unmet`, always present and always a
-- jsonb ARRAY -- the unmet list when the assignment has a spec, `[]` when it
-- has none (there is no spec to be unmet against, and a caller should not have
-- to branch on null to learn that). `ok`, `state` and `submitted_at` are
-- unchanged, so this is additive and no deployed client breaks: the one caller
-- in the tree, `createEngineTransports().submitAssignment` in
-- `src/lib/classroom/transports.ts`, passes the whole object through
-- `opResult` and reads `ok`.
--
-- NO COLUMN IS ADDED, and no incompleteness is stored. It is DERIVABLE at read
-- time and already is: `_classroom_spec_unmet` is a pure function of the spec
-- plus the stored responses, files and approvals, and `specUnmet` in
-- `src/lib/classroom/assignment-spec.ts` is its mirror. The grading console is
-- already handed the spec plus, per student, `responses`, `files` and
-- `approvals` -- everything the computation needs. A stored flag would be a
-- second answer to a question that already has one, and it would be the copy
-- that goes stale the moment a student edits after submitting.
--
-- THE INSTRUCTOR-FACING DISPLAY OF THAT IS A SEPARATE BUNDLE AND IS NOT HERE.
-- This file changes what the database accepts. Nothing in it renders anything,
-- and no application code changes in this bundle.
--
-- ===========================================================================
-- WHAT THIS DELIBERATELY LEAVES ALONE
-- ===========================================================================
--   * `_classroom_spec_unmet(uuid, text, jsonb)` -- not redefined, not
--     re-signed, still called with the same three arguments in the same order.
--     What counts as unmet is not this file's question.
--   * `classroom_unsubmit_assignment` -- unchanged, including its rule that
--     unsubmitting stops being the student's call once a grade is saved.
--   * The `on conflict (item_id, student_email) do update` upsert, verbatim.
--   * `classroom_submissions` -- no column, no constraint, no policy, no grant.
--   * The signature. `classroom_submit_assignment(uuid)` gains no parameter,
--     so the signature trap does not apply and no `drop function` is needed:
--     `create or replace` cannot leave a second overload behind when the
--     parameter list has not moved. Section 3 asserts exactly one arity anyway.
--
-- ===========================================================================
-- THE GRANTS
-- ===========================================================================
-- `create or replace` on this project arrives under default privileges that
-- write a DIRECT `anon` grant into the function's `proacl`, so the roles are
-- named explicitly. `revoke ... from public` alone does nothing here (0137's
-- whole subject); `public` is included in the list ANYWAY, beside `anon`,
-- because leaving PUBLIC's entry in place would let `anon` reach the function
-- through it after its own direct grant is gone.
--
-- `service_role` is NOT NAMED, in either direction, matching 0137: it holds
-- EXECUTE today and this file must not be what takes it away.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. PRECONDITIONS. Refuse rather than half-apply.
-- ---------------------------------------------------------------------------

do $pre$
begin
	if to_regprocedure('public.classroom_submit_assignment(uuid)') is null then
		raise exception '0160 cannot apply: classroom_submit_assignment(uuid) does not exist. Apply 0086 first.';
	end if;
	if to_regprocedure('public._classroom_engine_student(uuid)') is null then
		raise exception '0160 cannot apply: _classroom_engine_student(uuid) does not exist, so the authorization this file preserves is not there to preserve.';
	end if;
	if to_regprocedure('public._classroom_spec_unmet(uuid, text, jsonb)') is null then
		raise exception '0160 cannot apply: _classroom_spec_unmet(uuid, text, jsonb) does not exist, so there is no unmet list to return.';
	end if;
	if to_regclass('public.classroom_assignment_specs') is null
		or to_regclass('public.classroom_submissions') is null
		or to_regclass('public.classroom_submission_files') is null then
		raise exception '0160 cannot apply: the assignment engine tables are missing. Apply 0086 first.';
	end if;
end
$pre$;

-- ---------------------------------------------------------------------------
-- 2. THE FUNCTION. 0086's body, with the refusal branch removed and the unmet
--    list moved onto the acceptance. The `-- 0160:` markers are the diff.
-- ---------------------------------------------------------------------------

-- Submit. THE PREFLIGHT STILL RUNS HERE, against the stored responses and
-- files, and its answer is REPORTED rather than enforced: an unfinished
-- submission is accepted and carries the full structured list back with it. A
-- no-spec assignment still requires at least one attached file (there is
-- nothing else it could mean to submit one).
create or replace function public.classroom_submit_assignment(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_engine_student(p_item_id);
	v_spec jsonb;
	v_unmet jsonb;
	v_state text;
	v_files integer;
	v_now timestamptz := now();
begin
	select s.state into v_state
	from public.classroom_submissions s
	where s.item_id = p_item_id and s.student_email = v_email;
	if v_state = 'submitted' then
		return jsonb_build_object('ok', false, 'reason', 'already_submitted');
	end if;

	select a.spec into v_spec
	from public.classroom_assignment_specs a where a.item_id = p_item_id;

	if v_spec is not null then
		-- 0160: THE CHECK STILL RUNS AND NO LONGER REFUSES. A student must not
		-- be trapped by a defect in the instrument -- a wrong assignment, a
		-- wrong sentence counter -- so what was a refusal here is now evidence
		-- returned beside the acceptance below.
		v_unmet := public._classroom_spec_unmet(p_item_id, v_email, v_spec);
	else
		select count(*) into v_files
		from public.classroom_submission_files f
		join public.classroom_submissions s on s.id = f.submission_id
		where s.item_id = p_item_id and s.student_email = v_email;
		if coalesce(v_files, 0) = 0 then
			return jsonb_build_object('ok', false, 'reason', 'nothing_attached');
		end if;
	end if;

	insert into public.classroom_submissions (item_id, student_email, state, submitted_at, updated_at)
	values (p_item_id, v_email, 'submitted', v_now, v_now)
	on conflict (item_id, student_email) do update
		set state = 'submitted', submitted_at = v_now, updated_at = v_now;

	-- 0160: `unmet` is ALWAYS an array. An assignment with no spec has nothing
	-- to be unmet against, and `[]` says that without making every caller
	-- branch on null to find out.
	return jsonb_build_object(
		'ok', true,
		'state', 'submitted',
		'submitted_at', v_now,
		'unmet', coalesce(v_unmet, '[]'::jsonb)
	);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. GRANTS. Roles named explicitly; `service_role` untouched. See the header.
-- ---------------------------------------------------------------------------

revoke all on function public.classroom_submit_assignment(uuid) from public, anon, authenticated;
grant execute on function public.classroom_submit_assignment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. SELF-CHECK. Every claim the header makes about the BODY is asserted
--    against the installed definition, not against the text above.
-- ---------------------------------------------------------------------------

do $checks$
declare
	v_src text := pg_get_functiondef('public.classroom_submit_assignment(uuid)'::regprocedure);
	v_arities integer;
	v_specs integer;
	v_submitted integer;
begin
	-- THE REFUSAL IS GONE. Matched on the two literals as they are written
	-- together in the returned object, so a comment mentioning the word
	-- cannot satisfy or defeat this check.
	if v_src like '%''reason'', ''incomplete''%' then
		raise exception '0160 did not take: classroom_submit_assignment still refuses an unfinished submission.';
	end if;

	-- THE CHECK ITSELF SURVIVED. Deleting the call along with the refusal
	-- would have removed the warning the student is meant to keep seeing, and
	-- the check above would still have passed.
	if v_src not like '%_classroom_spec_unmet(p_item_id, v_email, v_spec)%' then
		raise exception '0160 went too far: the preflight is no longer computed, so an accepted submission carries no unmet list.';
	end if;
	if v_src not like '%''unmet'', coalesce(v_unmet%' then
		raise exception '0160 did not take: the unmet list is not returned on the acceptance.';
	end if;

	-- THE OTHER TWO REFUSALS SURVIVED.
	if v_src not like '%''already_submitted''%' then
		raise exception '0160 went too far: classroom_submit_assignment no longer refuses a resubmit.';
	end if;
	if v_src not like '%''nothing_attached''%' then
		raise exception '0160 went too far: an assignment with no spec no longer requires an attached file.';
	end if;

	-- THE AUTHORIZATION SURVIVED. Every gate lives in this one call.
	if v_src not like '%public._classroom_engine_student(p_item_id)%' then
		raise exception '0160 went too far: classroom_submit_assignment no longer resolves the caller through _classroom_engine_student, so it no longer checks enrollment.';
	end if;

	-- THE WRITE SURVIVED, upsert and all.
	if v_src not like '%on conflict (item_id, student_email) do update%' then
		raise exception '0160 regressed 0086: the submission upsert is gone.';
	end if;

	-- Exactly one arity, so no old overload survives to be resolved instead.
	select count(*) into v_arities
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_submit_assignment';
	if v_arities <> 1 then
		raise exception '0160: classroom_submit_assignment resolves to % rows, expected exactly 1.', v_arities;
	end if;

	-- The grant partition, both directions: a file that closed everything
	-- would satisfy half of this.
	if has_function_privilege('anon', 'public.classroom_submit_assignment(uuid)', 'EXECUTE') then
		raise exception '0160 leaked classroom_submit_assignment to anon.';
	end if;
	if not has_function_privilege('authenticated', 'public.classroom_submit_assignment(uuid)', 'EXECUTE') then
		raise exception '0160 went too far: authenticated lost EXECUTE on classroom_submit_assignment.';
	end if;

	-- Counts. Nothing was migrated -- no column, no backfill -- so these are
	-- the population the changed rule now applies to, not a repair total.
	select count(*) into v_specs from public.classroom_assignment_specs;
	select count(*) into v_submitted
	from public.classroom_submissions where state = 'submitted';

	raise notice '0160: classroom_submit_assignment now accepts unfinished work and returns the unmet list beside ok:true. already_submitted, nothing_attached and every authorization check are unchanged.';
	raise notice '0160: % assignment(s) carry a spec and are affected by this; % submission(s) are already in the submitted state and are untouched (no column, no backfill).', v_specs, v_submitted;
end
$checks$;

commit;
