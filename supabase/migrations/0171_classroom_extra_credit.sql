-- 0171_classroom_extra_credit.sql
-- IDEA // CLASSROOM: points awarded beyond the rubric total, recorded as
-- extra credit rather than folded into a criterion.
--
-- Apply manually in the Supabase SQL editor, after 0170. It is independent of
-- every other pending file and may go in any order relative to them.
--
-- ===========================================================================
-- WHY THIS NEEDS A MIGRATION AT ALL, WHICH WAS NOT ASSUMED
-- ===========================================================================
-- `score` is stamped SERVER-SIDE by classroom_grade_submission and the CSV
-- never re-derives it, so extra credit has to survive that stamping rather
-- than being a client-side display. Measured against the real function on the
-- real tables before this file was written, both doors are shut:
--
--   * a score above a criterion's own maximum raises
--     'The score for "Answered" must be between 0 and 10.'
--   * an extra key in p_scores raises
--     'Score key "extra_credit" is not a rubric criterion.'
--
-- So there is no way to express it today and no read that could infer it. (The
-- sibling report in the same bundle -- "did the work change after I graded it"
-- -- is derivable from `classroom_responses.updated_at` against
-- `classroom_submissions.graded_at`, was measured to be so, and correctly gets
-- NO schema change.)
--
-- ===========================================================================
-- ITS OWN COLUMN, NEVER A CRITERION
-- ===========================================================================
-- A leveled criterion's MAXIMUM is its top level's points (0095), and the
-- criterion maxima must sum to the module's points (_classroom_check_spec).
-- A criterion carrying a score outside its own range is therefore a rubric
-- that no longer describes how the work was scored, and the override machinery
-- 0095 built -- "a score matching no level requires a comment" -- would read an
-- award as an unexplained override forever. Extra credit sits beside
-- `rubric_scores`, not inside it, and every constraint 0095 wrote stays exactly
-- as strict as it is.
--
-- IDEA_RUBRIC_STANDARDS 1.3 IS THE REASON IT IS SHAPED THIS WAY AND NOT A
-- REASON AGAINST IT. That section forbids a BONUS CRITERION ("a criterion
-- marked bonus either pushes the module past its own total or silently makes
-- optional work required") and says recognition for optional work belongs
-- OUTSIDE the rubric. This is outside the rubric: no criterion is added, no
-- criterion becomes optional, and the maxima still sum to the module total.
-- What the standard does NOT do is describe a landing place for the points,
-- and `coin_log_extra_credit` (0070) already SELLS them -- 2i¢ per point,
-- capped at 21 per student per semester -- with nowhere in the gradebook to
-- record what was bought. This column is that place. Whether the two should be
-- wired together, and whether the semester cap should bind here, is a POLICY
-- question for the owner and is deliberately not answered by this file: it
-- adds no coin surface and reads no coin row.
--
-- ===========================================================================
-- NULL, ZERO, AND WHY THEY ARE DIFFERENT
-- ===========================================================================
--   null   nothing was awarded. Every row that exists today, with no backfill:
--          adding a nullable numeric column rewrites nothing.
--   0      an award was explicitly taken back. Scores identically to null.
--   > 0    an award.
--
-- The PARAMETER treats null as LEAVE ALONE rather than as "clear", and that is
-- the whole reason the narrow arity below is safe to keep: a client that has
-- never heard of extra credit regrades through the 6-argument form, which
-- passes null, and an award already on the row SURVIVES. Clearing is 0, which
-- only a client that knows about the field can send. Getting this backwards
-- would mean the old console silently erasing an award every time somebody
-- fixed a typo in a comment.
--
-- NEGATIVE IS REFUSED. A deduction is a different instrument with different
-- rules (it can take a student below what the rubric says they earned), and
-- letting it in through the extra-credit door would make `score` no longer
-- bounded below by the criteria sum with nothing saying so.
--
-- ===========================================================================
-- THE SIGNATURE: BOTH ARITIES SURVIVE, ON PURPOSE
-- ===========================================================================
-- The DEPLOYED console calls the 6-argument form. Dropping it and deploying a
-- new client are mutually blocking -- apply first and every grade breaks until
-- the client ships, ship first and every grade breaks until it is applied --
-- so this file takes the documented additive shape instead:
--
--   * the WIDE form declares NO DEFAULTS AT ALL, so the old key set cannot
--     bind to it (Postgres forbids a required parameter after a defaulted one,
--     which makes this all-or-nothing rather than a choice);
--   * the NARROW form keeps its 0095 signature VERBATIM, defaults included,
--     and has no parameter for the new key, so the new key set cannot bind to
--     it;
--   * the narrow form becomes a THIN WRAPPER that calls through with null, so
--     there is exactly one copy of the grading rule and every refusal message a
--     deployed client already shows is produced by the same statements that
--     produced it before.
--
-- The smallest call the wide form accepts (7 arguments) is strictly larger
-- than the largest the narrow one accepts (6), so the pair is unambiguous
-- under any resolution rule. The wide form is dropped at its OWN exact new
-- signature first, because Postgres refuses to remove a default through
-- `create or replace` -- which is also what keeps this file re-appliable over
-- a database that took an earlier draft.
--
-- ===========================================================================
-- GRANTS
-- ===========================================================================
-- A hosted Supabase project's default privileges hand every NEW function a
-- direct `anon` grant at creation time, and `create or replace` hands an
-- existing one a fresh grant with it. 0137 was a one-time sweep and does not
-- cover either, so BOTH arities revoke by NAMING THE ROLES and grant back only
-- `authenticated`. `revoke ... from public` alone would remove one entry that
-- is not the one doing the work.
--
-- ===========================================================================
-- WHAT UNDOES THIS
-- ===========================================================================
--   drop function public.classroom_grade_submission(uuid, text, jsonb, text, boolean, jsonb, numeric);
--   -- then re-apply 0095's section 6 verbatim to restore the 6-argument body,
--   -- which is the ONLY definition of the grading rule this file removes.
--   alter table public.classroom_submissions drop constraint classroom_submissions_extra_credit_range;
--   alter table public.classroom_submissions drop column extra_credit;
--
-- Dropping the column loses every award recorded through it, and `score` on
-- those rows keeps the total that included them until each is regraded. Count
-- them before deciding: select count(*) from public.classroom_submissions
-- where coalesce(extra_credit, 0) <> 0;

-- ---------------------------------------------------------------------------
-- 1. The column.
-- ---------------------------------------------------------------------------

alter table public.classroom_submissions
	add column if not exists extra_credit numeric;

-- `add constraint if not exists` does not exist, and a blind drop-then-add
-- raises 2BP01 on a re-paste, so the catalog is the guard.
do $$
begin
	if not exists (
		select 1 from pg_constraint
		where conname = 'classroom_submissions_extra_credit_range'
			and conrelid = 'public.classroom_submissions'::regclass
	) then
		alter table public.classroom_submissions
			add constraint classroom_submissions_extra_credit_range
			check (extra_credit is null or (extra_credit >= 0 and extra_credit <= 10000));
	end if;
end
$$;

comment on column public.classroom_submissions.extra_credit is
	'Points awarded beyond the rubric total. Null = none awarded, 0 = an award taken back. Already summed into `score` by classroom_grade_submission; never add it on again. Never a rubric criterion (IDEA_RUBRIC_STANDARDS 1.3).';

-- ---------------------------------------------------------------------------
-- 2. The wide form: 0095's body, plus extra credit. NO DEFAULTS.
-- ---------------------------------------------------------------------------

drop function if exists public.classroom_grade_submission(uuid, text, jsonb, text, boolean, jsonb, numeric);

create function public.classroom_grade_submission(
	p_item_id uuid,
	p_student_email text,
	p_scores jsonb,
	p_comment text,
	p_return boolean,
	p_criterion_comments jsonb,
	-- null = leave whatever is stored alone. 0 = take an award back.
	p_extra_credit numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_student_email, '')));
	v_criteria jsonb;
	v_crit jsonb;
	v_score numeric := 0;
	v_value jsonb;
	v_missing text[] := '{}';
	v_uncommented text[] := '{}';
	v_key text;
	v_known text[] := '{}';
	v_given numeric;
	v_on_level boolean;
	v_note text;
	v_comments jsonb := '{}'::jsonb;
	v_n integer;
	v_k integer;
	v_now timestamptz := now();
	v_state text;
	v_extra numeric;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'A student email is required.';
	end if;
	if not exists (
		select 1 from public.classroom_items i
		where i.id = p_item_id and i.kind = 'assignment'
	) then
		raise exception 'That assignment does not exist.';
	end if;
	if not public.classroom_can_review_submission(p_item_id, v_email) then
		raise exception 'Only a teacher of record for this student''s class can grade this.';
	end if;

	select r.criteria into v_criteria from public.classroom_rubrics r where r.item_id = p_item_id;
	if v_criteria is null then
		raise exception 'Create a rubric for this assignment before grading.';
	end if;
	if p_scores is null or jsonb_typeof(p_scores) <> 'object' then
		raise exception 'Scores must be an object keyed by rubric criterion id.';
	end if;
	if p_criterion_comments is not null and jsonb_typeof(p_criterion_comments) not in ('object', 'null') then
		raise exception 'Criterion comments must be an object keyed by rubric criterion id.';
	end if;

	-- Extra credit, validated before anything is summed. The range mirrors the
	-- CHECK on the column rather than replacing it: the constraint is the
	-- boundary (a direct write cannot route around it) and this is the sentence
	-- a grader reads.
	if p_extra_credit is not null then
		if p_extra_credit < 0 then
			raise exception 'Extra credit cannot be negative. To lower a score, score the rubric criteria lower.';
		end if;
		if p_extra_credit > 10000 then
			raise exception 'Extra credit must be 10000 or less.';
		end if;
	end if;

	for v_n in 0 .. jsonb_array_length(v_criteria) - 1 loop
		v_crit := v_criteria->v_n;
		v_key := v_crit->>'id';
		v_known := v_known || v_key;
		v_value := p_scores->v_key;
		v_note := nullif(btrim(coalesce(p_criterion_comments->>v_key, '')), '');
		if char_length(coalesce(v_note, '')) > 1000 then
			raise exception 'The comment on "%" is too long (1000 characters max).', v_crit->>'criterion';
		end if;

		if v_value is null or jsonb_typeof(v_value) = 'null' then
			v_missing := v_missing || v_key;
			-- A comment with no score is kept: the grader may be explaining why
			-- they have not settled on one yet.
			if v_note is not null then
				v_comments := v_comments || jsonb_build_object(v_key, v_note);
			end if;
			continue;
		end if;

		if jsonb_typeof(v_value) <> 'number' then
			raise exception 'The score for "%" must be a number.', v_crit->>'criterion';
		end if;
		v_given := (p_scores->>v_key)::numeric;
		if v_given < 0 or v_given > (v_crit->>'points')::numeric then
			raise exception 'The score for "%" must be between 0 and %.',
				v_crit->>'criterion', v_crit->>'points';
		end if;
		v_score := v_score + v_given;

		-- OVERRIDE = a score matching no level. Derived from the number itself
		-- (level points are strictly descending, so at most one can match), never
		-- taken from a client flag: there is nothing here to forge.
		v_on_level := false;
		if jsonb_typeof(v_crit->'levels') = 'array' then
			for v_k in 0 .. jsonb_array_length(v_crit->'levels') - 1 loop
				if jsonb_typeof(v_crit->'levels'->v_k->'points') = 'number'
					and (v_crit->'levels'->v_k->>'points')::numeric = v_given then
					v_on_level := true;
					exit;
				end if;
			end loop;
		end if;
		if not v_on_level and v_note is null then
			v_uncommented := v_uncommented || v_key;
		end if;
		if v_note is not null then
			v_comments := v_comments || jsonb_build_object(v_key, v_note);
		end if;
	end loop;

	for v_key in select jsonb_object_keys(p_scores) loop
		if v_key <> all (v_known) then
			raise exception 'Score key "%" is not a rubric criterion.', v_key;
		end if;
	end loop;
	if p_criterion_comments is not null and jsonb_typeof(p_criterion_comments) = 'object' then
		for v_key in select jsonb_object_keys(p_criterion_comments) loop
			if v_key <> all (v_known) then
				raise exception 'Comment key "%" is not a rubric criterion.', v_key;
			end if;
		end loop;
	end if;

	-- Structured refusals (the greenline_purchase_item convention), so the
	-- console renders them next to the criterion instead of as an error banner.
	-- The override check runs on EVERY write, not only on release: an
	-- unexplained off-level score must never be storable, even as a draft.
	if array_length(v_uncommented, 1) is not null then
		return jsonb_build_object(
			'ok', false,
			'reason', 'override_needs_comment',
			'missing', to_jsonb(v_uncommented)
		);
	end if;
	if p_return and array_length(v_missing, 1) is not null then
		return jsonb_build_object(
			'ok', false,
			'reason', 'incomplete_scores',
			'missing', to_jsonb(v_missing)
		);
	end if;

	-- WHAT EXTRA CREDIT ENDS UP AS. Null means leave the stored value alone, so
	-- the read has to happen before the write and cannot be folded into the
	-- upsert's excluded row.
	if p_extra_credit is null then
		select s.extra_credit into v_extra
		from public.classroom_submissions s
		where s.item_id = p_item_id and s.student_email = v_email;
	else
		v_extra := p_extra_credit;
	end if;

	-- `score` CARRIES IT. The gradebook CSV, the Grades tally and the student's
	-- own returned view all read this one number, so an award that lived only
	-- in its own column would be an award nobody was actually given.
	v_score := v_score + coalesce(v_extra, 0);

	insert into public.classroom_submissions
		(item_id, student_email, rubric_scores, criterion_comments, score, extra_credit,
		 teacher_comment, graded_by, graded_at, updated_at)
	values (p_item_id, v_email, p_scores, v_comments, v_score, v_extra,
		nullif(btrim(coalesce(p_comment, '')), ''), public.current_user_email(), v_now, v_now)
	on conflict (item_id, student_email) do update
		set rubric_scores = excluded.rubric_scores,
			criterion_comments = excluded.criterion_comments,
			score = excluded.score,
			extra_credit = excluded.extra_credit,
			teacher_comment = excluded.teacher_comment,
			graded_by = excluded.graded_by,
			graded_at = v_now,
			updated_at = v_now;

	if p_return then
		update public.classroom_submissions
		set state = 'returned', returned_at = v_now, updated_at = v_now
		where item_id = p_item_id and student_email = v_email;
	end if;

	select s.state into v_state
	from public.classroom_submissions s
	where s.item_id = p_item_id and s.student_email = v_email;

	return jsonb_build_object(
		'ok', true, 'score', v_score, 'state', v_state, 'extra_credit', v_extra
	);
end;
$$;

revoke all on function public.classroom_grade_submission(uuid, text, jsonb, text, boolean, jsonb, numeric)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_grade_submission(uuid, text, jsonb, text, boolean, jsonb, numeric)
	to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The narrow form: 0095's signature verbatim, now a thin wrapper.
-- ---------------------------------------------------------------------------
-- NOT DROPPED. The deployed console calls this exact arity, and its defaults
-- are what keep it unable to reach the wide form. Its body is one delegation,
-- so the grading rule has exactly one implementation and every refusal a
-- deployed client already renders comes back byte-identical.

create or replace function public.classroom_grade_submission(
	p_item_id uuid,
	p_student_email text,
	p_scores jsonb,
	p_comment text default null,
	p_return boolean default false,
	p_criterion_comments jsonb default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
	select public.classroom_grade_submission(
		p_item_id, p_student_email, p_scores, p_comment, p_return, p_criterion_comments, null::numeric
	);
$$;

revoke all on function public.classroom_grade_submission(uuid, text, jsonb, text, boolean, jsonb)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_grade_submission(uuid, text, jsonb, text, boolean, jsonb)
	to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Self-check. Asserts the ACL and the arities, not its own verdict.
-- ---------------------------------------------------------------------------

do $$
declare
	v_arities integer;
	v_wide_defaults integer;
	v_narrow_defaults integer;
	v_anon_wide boolean;
	v_anon_narrow boolean;
	v_auth_wide boolean;
	v_auth_narrow boolean;
	v_awarded bigint;
begin
	select count(*) into v_arities
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_grade_submission';
	if v_arities <> 2 then
		raise exception 'Expected exactly 2 arities of classroom_grade_submission, found %.', v_arities;
	end if;

	-- A COUNT OF TWO PASSES ON EXACTLY THE ARRANGEMENT THAT BREAKS EVERY CALL,
	-- so the defaults are asserted structurally beside it.
	select p.pronargdefaults into v_wide_defaults
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_grade_submission' and p.pronargs = 7;
	if v_wide_defaults <> 0 then
		raise exception 'The 7-argument form must declare no defaults; it has %.', v_wide_defaults;
	end if;
	select p.pronargdefaults into v_narrow_defaults
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_grade_submission' and p.pronargs = 6;
	if v_narrow_defaults <> 3 then
		raise exception 'The 6-argument form must keep its 3 defaults; it has %.', v_narrow_defaults;
	end if;

	v_anon_wide := has_function_privilege('anon',
		'public.classroom_grade_submission(uuid, text, jsonb, text, boolean, jsonb, numeric)', 'execute');
	v_anon_narrow := has_function_privilege('anon',
		'public.classroom_grade_submission(uuid, text, jsonb, text, boolean, jsonb)', 'execute');
	v_auth_wide := has_function_privilege('authenticated',
		'public.classroom_grade_submission(uuid, text, jsonb, text, boolean, jsonb, numeric)', 'execute');
	v_auth_narrow := has_function_privilege('authenticated',
		'public.classroom_grade_submission(uuid, text, jsonb, text, boolean, jsonb)', 'execute');
	if v_anon_wide or v_anon_narrow then
		raise exception 'anon must not hold execute on either grading arity (wide %, narrow %).',
			v_anon_wide, v_anon_narrow;
	end if;
	if not v_auth_wide or not v_auth_narrow then
		raise exception 'authenticated must hold execute on both grading arities (wide %, narrow %).',
			v_auth_wide, v_auth_narrow;
	end if;

	select count(*) into v_awarded
	from public.classroom_submissions where coalesce(extra_credit, 0) <> 0;
	raise notice '0171: extra_credit column present; % submission row(s) carry an award.', v_awarded;
end
$$;
