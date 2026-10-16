-- 0265_classroom_grade_revoke.sql
--
-- TAKING A GRADE BACK (ledger 0392, report 6bedda49, Mr. Pina 2026-10-15:
-- "add an undo function for grading. I want to be able to revoke a grade
-- entirely at any point in time").
--
-- WHAT WAS MEASURED FIRST, BECAUSE THIS FILE EXISTS ONLY IF THE ANSWER WAS NO.
-- No function in the schema moves a submission out of 'returned' or clears a
-- saved grade. `classroom_grade_submission` (0242) only ever writes a grade
-- and, with p_return, stamps 'returned'; with p_return false it leaves the
-- state alone, so "Save draft" on a returned row leaves it returned.
-- `classroom_unsubmit_assignment` (0198) is the student's and refuses a graded
-- row. A teacher cannot write `classroom_submissions` directly (0086 grants
-- SELECT only). So there was no undo of any kind.
--
-- WHAT IT CREATES, all new (no existing object is redefined):
--   table      classroom_grade_revocations  -- append-only snapshots, RLS on,
--                                              no policy, no client grant
--   helper     _classroom_grade_ungraded_state(classroom_submissions)
--   client     classroom_unreturn_grade(uuid, text)   -- returned -> not yet returned, grade kept
--              classroom_revoke_grade(uuid, text)     -- the grade off entirely, snapshot kept
--              classroom_restore_grade(uuid, text)    -- the last revoked grade back, exactly
--              classroom_grade_revocation(uuid, text) -- is there one to restore, and what
--
-- WHO. Each function asks `classroom_can_review_submission`, the same
-- predicate `classroom_grade_submission` asks, so the people who can grade a
-- student are exactly the people who can take that grade back. No identity of
-- the caller is a parameter; the student is, as it is on the grading write.
--
-- WHERE THE ROW GOES. A row leaving 'returned' goes to 'submitted' when the
-- student handed it in (`submitted_at` is set; 0198 makes that column the
-- discriminator) and to 'draft' otherwise. A returned row is already editable
-- by its student (0086's own comment), so neither answer opens anything a
-- student could not already do; 'submitted' puts handed-in work back in the
-- grading queue, which is what an undo of a return means.
--
-- COINS GO THROUGH THE EXISTING PATH AND NEVER GATE THE GRADE. Each function
-- ends with `_coin_perfect_score_sync`, the one Perfect Score state machine
-- (0242): a row that is no longer returned is no longer eligible, so a paid
-- Perfect Score is reversed through `_coin_reverse` exactly as a lower regrade
-- reverses it, and a restored perfect grade pays again. The call is wrapped
-- the way the grading write wraps it: a coin failure can never undo or block
-- the grade change, and the nightly autopay settles anything missed (and
-- anything held while autopay is paused). The weekly Highest Score payout is
-- a judgment over a whole period that has already been made, and it is NOT
-- reversed here; that is recorded as a decision owed in the history entry.
--
-- BOUGHT POINTS STAY. A student's purchased extra credit (coin_buy_extra_credit)
-- is theirs: revoking keeps exactly the bought points on the row and removes
-- only what the grader added; restoring never lowers it below them.
--
-- ADDITIVE AND IDEMPOTENT. Re-pasting this file changes nothing. DEPLOY ORDER:
-- none; nothing deployed calls these before the client that names them ships,
-- and the client degrades on PGRST202 alone.
--
-- UNDO, for a person's paste:
--   drop function if exists public.classroom_grade_revocation(uuid, text);
--   drop function if exists public.classroom_restore_grade(uuid, text);
--   drop function if exists public.classroom_revoke_grade(uuid, text);
--   drop function if exists public.classroom_unreturn_grade(uuid, text);
--   drop function if exists public._classroom_grade_ungraded_state(public.classroom_submissions);
--   drop table if exists public.classroom_grade_revocations;
-- (the table drop is refused by the migration role's guard; a person pastes it)

-- ===== PART A BEGIN =====
create table if not exists public.classroom_grade_revocations (
	id uuid primary key default gen_random_uuid(),
	submission_id uuid not null references public.classroom_submissions (id) on delete cascade,
	item_id uuid not null references public.classroom_items (id) on delete cascade,
	student_email text not null,
	-- Every grading column as it stood, so a restore is exact.
	snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
	revoked_by text not null,
	revoked_at timestamptz not null default now(),
	restored_by text,
	restored_at timestamptz
);
create index if not exists classroom_grade_revocations_subject_idx
	on public.classroom_grade_revocations (item_id, student_email, revoked_at desc);
alter table public.classroom_grade_revocations enable row level security;
revoke all on table public.classroom_grade_revocations from public, anon, authenticated, service_role;
-- ===== PART A END =====

-- ===== PART B BEGIN =====
-- The state a row takes when it stops being returned (see the header).
create or replace function public._classroom_grade_ungraded_state(p_row public.classroom_submissions)
returns text
language sql
immutable
set search_path = ''
as $$
	select case
		when p_row.state <> 'returned' then p_row.state
		when p_row.submitted_at is not null then 'submitted'
		else 'draft'
	end;
$$;
revoke all on function public._classroom_grade_ungraded_state(public.classroom_submissions) from public, anon, authenticated, service_role;

-- Best effort, exactly as the grading write runs it.
create or replace function public._classroom_grade_coin_sync(p_submission_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
	return public._coin_perfect_score_sync(p_submission_id);
exception when others then
	raise warning 'perfect score sync failed for %: %', p_submission_id, sqlerrm;
	return 'failed';
end;
$$;
revoke all on function public._classroom_grade_coin_sync(uuid) from public, anon, authenticated, service_role;

-- The shared front door: signed in, a real assignment, a reviewer of this
-- student. Raises on misuse, exactly as `classroom_grade_submission` does.
create or replace function public._classroom_grade_undo_guard(p_item_id uuid, p_student_email text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_student_email, '')));
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'A student email is required.';
	end if;
	if not exists (select 1 from public.classroom_items i where i.id = p_item_id and i.kind = 'assignment') then
		raise exception 'That assignment does not exist.';
	end if;
	if not public.classroom_can_review_submission(p_item_id, v_email) then
		raise exception 'Only a teacher of record for this student''s class can change this grade.';
	end if;
	return v_email;
end;
$$;
revoke all on function public._classroom_grade_undo_guard(uuid, text) from public, anon, authenticated, service_role;

-- UNDO A RETURN: the grade stays as a draft only the teacher sees; the student
-- stops seeing it and the row goes back to where it was before the return.
create or replace function public.classroom_unreturn_grade(p_item_id uuid, p_student_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_grade_undo_guard(p_item_id, p_student_email);
	v_row public.classroom_submissions;
	v_state text;
	v_coins text;
begin
	select * into v_row from public.classroom_submissions s
	where s.item_id = p_item_id and s.student_email = v_email
	for update;
	if v_row.id is null or v_row.state <> 'returned' then
		return jsonb_build_object('ok', false, 'reason', 'not_returned');
	end if;
	v_state := public._classroom_grade_ungraded_state(v_row);
	update public.classroom_submissions
	set state = v_state, returned_at = null, updated_at = now()
	where id = v_row.id;
	v_coins := public._classroom_grade_coin_sync(v_row.id);
	return jsonb_build_object('ok', true, 'state', v_state, 'score', v_row.score, 'coins', v_coins);
end;
$$;
revoke all on function public.classroom_unreturn_grade(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.classroom_unreturn_grade(uuid, text) to authenticated;

-- REVOKE: the grade off the row entirely, at any time, with a snapshot kept.
create or replace function public.classroom_revoke_grade(p_item_id uuid, p_student_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_grade_undo_guard(p_item_id, p_student_email);
	v_row public.classroom_submissions;
	v_state text;
	v_bought numeric;
	v_id uuid;
	v_coins text;
begin
	select * into v_row from public.classroom_submissions s
	where s.item_id = p_item_id and s.student_email = v_email
	for update;
	if v_row.id is null
		or (v_row.graded_at is null and v_row.score is null and v_row.direct_score is null
			and v_row.rubric_scores is null and v_row.state <> 'returned') then
		return jsonb_build_object('ok', false, 'reason', 'nothing_to_revoke');
	end if;

	insert into public.classroom_grade_revocations (submission_id, item_id, student_email, snapshot, revoked_by)
	values (v_row.id, p_item_id, v_email, jsonb_build_object(
		'state', v_row.state,
		'rubric_scores', v_row.rubric_scores,
		'criterion_comments', v_row.criterion_comments,
		'score', v_row.score,
		'direct_score', v_row.direct_score,
		'extra_credit', v_row.extra_credit,
		'teacher_comment', v_row.teacher_comment,
		'graded_by', v_row.graded_by,
		'graded_at', v_row.graded_at,
		'returned_at', v_row.returned_at
	), public.current_user_email())
	returning id into v_id;

	v_bought := coalesce(public._coin_purchased_extra_credit(v_row.id), 0);
	v_state := public._classroom_grade_ungraded_state(v_row);
	update public.classroom_submissions
	set state = v_state,
		rubric_scores = null,
		criterion_comments = null,
		score = null,
		direct_score = null,
		extra_credit = case when v_bought > 0 then v_bought else null end,
		teacher_comment = null,
		graded_by = null,
		graded_at = null,
		returned_at = null,
		updated_at = now()
	where id = v_row.id;

	v_coins := public._classroom_grade_coin_sync(v_row.id);
	return jsonb_build_object('ok', true, 'revocation_id', v_id, 'state', v_state,
		'previous_score', v_row.score, 'coins', v_coins);
end;
$$;
revoke all on function public.classroom_revoke_grade(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.classroom_revoke_grade(uuid, text) to authenticated;

-- RESTORE: the most recent revoked grade back exactly as it was. Refused once
-- a new grade has been saved since, so a restore never overwrites newer work.
create or replace function public.classroom_restore_grade(p_item_id uuid, p_student_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_grade_undo_guard(p_item_id, p_student_email);
	v_row public.classroom_submissions;
	v_rev public.classroom_grade_revocations;
	v_snap jsonb;
	v_state text;
	v_extra numeric;
	v_bought numeric;
	v_coins text;
begin
	select * into v_row from public.classroom_submissions s
	where s.item_id = p_item_id and s.student_email = v_email
	for update;
	if v_row.id is null then
		return jsonb_build_object('ok', false, 'reason', 'nothing_to_restore');
	end if;
	select * into v_rev from public.classroom_grade_revocations r
	where r.submission_id = v_row.id and r.restored_at is null
	order by r.revoked_at desc, r.id desc
	limit 1
	for update;
	if v_rev.id is null then
		return jsonb_build_object('ok', false, 'reason', 'nothing_to_restore');
	end if;
	if v_row.graded_at is not null or v_row.score is not null or v_row.direct_score is not null then
		return jsonb_build_object('ok', false, 'reason', 'graded_since');
	end if;

	v_snap := v_rev.snapshot;
	-- A returned grade comes back returned; any other snapshot keeps the row's
	-- CURRENT state, so a student's hand-in since the revoke is not undone.
	v_state := case when v_snap ->> 'state' = 'returned' then 'returned' else v_row.state end;
	v_bought := coalesce(public._coin_purchased_extra_credit(v_row.id), 0);
	v_extra := nullif(v_snap ->> 'extra_credit', '')::numeric;
	if v_bought > 0 and coalesce(v_extra, 0) < v_bought then
		v_extra := v_bought;
	end if;

	update public.classroom_submissions
	set state = v_state,
		rubric_scores = v_snap -> 'rubric_scores',
		criterion_comments = v_snap -> 'criterion_comments',
		score = nullif(v_snap ->> 'score', '')::numeric
			+ (coalesce(v_extra, 0) - coalesce(nullif(v_snap ->> 'extra_credit', '')::numeric, 0)),
		direct_score = nullif(v_snap ->> 'direct_score', '')::numeric,
		extra_credit = v_extra,
		teacher_comment = v_snap ->> 'teacher_comment',
		graded_by = v_snap ->> 'graded_by',
		graded_at = nullif(v_snap ->> 'graded_at', '')::timestamptz,
		returned_at = case when v_state = 'returned' then coalesce(nullif(v_snap ->> 'returned_at', '')::timestamptz, now()) else null end,
		updated_at = now()
	where id = v_row.id;
	-- jsonb null is not SQL null for a jsonb column: put the absences back as absences.
	update public.classroom_submissions
	set rubric_scores = case when jsonb_typeof(rubric_scores) = 'null' then null else rubric_scores end,
		criterion_comments = case when jsonb_typeof(criterion_comments) = 'null' then null else criterion_comments end
	where id = v_row.id;

	update public.classroom_grade_revocations
	set restored_by = public.current_user_email(), restored_at = now()
	where id = v_rev.id;

	v_coins := public._classroom_grade_coin_sync(v_row.id);
	return jsonb_build_object('ok', true, 'state', v_state,
		'score', (select s.score from public.classroom_submissions s where s.id = v_row.id), 'coins', v_coins);
end;
$$;
revoke all on function public.classroom_restore_grade(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.classroom_restore_grade(uuid, text) to authenticated;

-- WHAT A RESTORE WOULD PUT BACK, for the console's offer. Null when there is
-- nothing to restore, and null (never a raise) for a caller who is not a
-- reviewer of this student, so the console can ask without probing.
create or replace function public.classroom_grade_revocation(p_item_id uuid, p_student_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_student_email, '')));
	v_rev public.classroom_grade_revocations;
begin
	if (select auth.uid()) is null or v_email = '' then
		return null;
	end if;
	if not public.classroom_can_review_submission(p_item_id, v_email) then
		return null;
	end if;
	select * into v_rev from public.classroom_grade_revocations r
	where r.item_id = p_item_id and r.student_email = v_email and r.restored_at is null
	order by r.revoked_at desc, r.id desc
	limit 1;
	if v_rev.id is null then
		return null;
	end if;
	return jsonb_build_object(
		'revoked_at', v_rev.revoked_at,
		'revoked_by', v_rev.revoked_by,
		'score', v_rev.snapshot -> 'score',
		'state', v_rev.snapshot ->> 'state'
	);
end;
$$;
revoke all on function public.classroom_grade_revocation(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.classroom_grade_revocation(uuid, text) to authenticated;
-- ===== PART B END =====

-- ===== PART Z BEGIN =====
do $z$
declare
	v_bad text[] := '{}';
	v_fn text;
	v_oid oid;
begin
	foreach v_fn in array array[
		'classroom_unreturn_grade(uuid,text)', 'classroom_revoke_grade(uuid,text)',
		'classroom_restore_grade(uuid,text)', 'classroom_grade_revocation(uuid,text)'
	] loop
		v_oid := to_regprocedure('public.' || v_fn);
		if v_oid is null then
			v_bad := array_append(v_bad, v_fn || ' is missing');
		elsif has_function_privilege('anon', v_oid, 'execute') then
			v_bad := array_append(v_bad, v_fn || ' is executable by anon');
		elsif not has_function_privilege('authenticated', v_oid, 'execute') then
			v_bad := array_append(v_bad, v_fn || ' is not executable by authenticated');
		end if;
	end loop;
	foreach v_fn in array array[
		'_classroom_grade_ungraded_state(public.classroom_submissions)', '_classroom_grade_coin_sync(uuid)',
		'_classroom_grade_undo_guard(uuid,text)'
	] loop
		v_oid := to_regprocedure('public.' || v_fn);
		if v_oid is null then
			v_bad := array_append(v_bad, v_fn || ' is missing');
		elsif has_function_privilege('anon', v_oid, 'execute')
			or has_function_privilege('authenticated', v_oid, 'execute') then
			v_bad := array_append(v_bad, v_fn || ' is executable by a client');
		end if;
	end loop;
	if has_table_privilege('anon', 'public.classroom_grade_revocations', 'select,insert,update,delete,truncate,references,trigger')
		or has_table_privilege('authenticated', 'public.classroom_grade_revocations', 'select,insert,update,delete,truncate,references,trigger') then
		v_bad := array_append(v_bad, 'classroom_grade_revocations carries a client grant');
	end if;
	if not exists (
		select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'public' and c.relname = 'classroom_grade_revocations' and c.relrowsecurity
	) then
		v_bad := array_append(v_bad, 'classroom_grade_revocations has no row level security');
	end if;
	if array_length(v_bad, 1) is not null then
		raise exception '0265 self-check refused: %', array_to_string(v_bad, '; ');
	end if;
	raise notice '0265 grade revoke: 1 table (RLS on, no client grant), 4 client functions closed to anon, 3 private helpers closed to every client.';
end $z$;
-- ===== PART Z END =====
