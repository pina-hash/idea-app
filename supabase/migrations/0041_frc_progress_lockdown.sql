-- 0041_frc_progress_lockdown.sql
-- Close the completion self-mark hole: a student can no longer write their own
-- `frc_user_progress` row directly. Completion is now written by exactly two
-- server-side paths, and a student has no write path of their own outside a
-- genuine quiz pass.
--
-- Before this migration, `frc_user_progress` (0039) granted `insert, delete`
-- to `authenticated` with a policy of `user_id = auth.uid() OR is_teacher()`.
-- That let any signed-in student insert (or delete) their OWN completion row
-- directly via PostgREST, bypassing every gate entirely.
--
-- Target state:
--   * Students keep SELECT on their own rows (unchanged from 0039); teachers
--     keep SELECT on all rows (unchanged from 0039).
--   * Direct client insert/update/delete on `frc_user_progress` is revoked
--     entirely; the old student-write policies are dropped. No grant, no
--     policy: PostgREST rejects any direct write attempt outright.
--   * Two SECURITY DEFINER RPCs, `frc_mark_complete` / `frc_unmark_complete`,
--     are the ONLY route to a write, and both enforce `is_teacher()` inside
--     the function body: this is the teacher-override path (mark/unmark ANY
--     student), the same authority already used for role and pathway edits.
--     A student who calls either RPC directly (even for their own id) gets
--     `{"error": "forbidden"}`, since they are never a teacher.
--   * `frc_quiz_grade` (0040) is recreated (same signature) to record the
--     completion ITSELF, inline, on a genuine pass: it derives the unit id
--     from the attempt row it just graded and the user id from `auth.uid()`
--     (never a client-supplied parameter), so the only way a student reaches
--     a `frc_user_progress` write is by actually passing the held answer key.
--     It does not call `frc_mark_complete` (that RPC is teacher-only by
--     design); it writes directly, as its own SECURITY DEFINER owner, exactly
--     like `frc_mark_complete` does. Being SECURITY DEFINER, both bypass RLS
--     as the function/table owner (the table has no FORCE ROW LEVEL SECURITY),
--     so the revoked client grants and dropped policies below never affect
--     them.
--
-- Apply manually in the Supabase SQL editor, after 0039 and 0040.

-- ---------------------------------------------------------------------------
-- 1. Remove the student (and any other client) self-write entirely.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.frc_user_progress from authenticated;

drop policy if exists "frc progress insert" on public.frc_user_progress;
drop policy if exists "frc progress delete" on public.frc_user_progress;

-- SELECT policies are untouched (own rows for students, all rows for
-- teachers, both from 0039) and still apply: `select, insert, delete` was
-- granted in 0039; the revoke above leaves only `select`.

-- ---------------------------------------------------------------------------
-- 2. Teacher-only completion RPCs (the interim override path, moved off the
--    direct table write). Mirrors the trust already used for role changes
--    (0001) and pathway edits (0038): only public.is_teacher() may act on
--    behalf of another user.
-- ---------------------------------------------------------------------------
create or replace function public.frc_mark_complete(p_user_id uuid, p_unit_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
	if (select auth.uid()) is null then
		return jsonb_build_object('error', 'unauthorized');
	end if;
	if not public.is_teacher() then
		return jsonb_build_object('error', 'forbidden');
	end if;

	insert into public.frc_user_progress (user_id, unit_id)
	values (p_user_id, p_unit_id)
	on conflict (user_id, unit_id) do nothing;

	return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.frc_unmark_complete(p_user_id uuid, p_unit_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
	if (select auth.uid()) is null then
		return jsonb_build_object('error', 'unauthorized');
	end if;
	if not public.is_teacher() then
		return jsonb_build_object('error', 'forbidden');
	end if;

	delete from public.frc_user_progress
	where user_id = p_user_id and unit_id = p_unit_id;

	return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.frc_mark_complete(uuid, text) from public;
grant execute on function public.frc_mark_complete(uuid, text) to authenticated;
revoke all on function public.frc_unmark_complete(uuid, text) from public;
grant execute on function public.frc_unmark_complete(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Recreate frc_quiz_grade (0040 verbatim otherwise) to record completion
--    on a pass, inline, as the function owner. This is the quiz-pass path:
--    the only student-reachable route to a frc_user_progress row, gated on
--    v_passed (computed above from the held sealed key, never trusted from
--    the client) and scoped to v_uid (the caller's own auth.uid(), never a
--    parameter), for the unit_id read off the attempt row itself.
-- ---------------------------------------------------------------------------
create or replace function public.frc_quiz_grade(
	p_attempt_id uuid,
	p_answers integer[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_unit_id text;
	v_sealed jsonb;
	v_pass integer;
	v_total integer;
	v_correct integer := 0;
	v_missed text[] := '{}';
	v_score integer;
	v_passed boolean;
	i integer;
	v_c integer;
	v_o text;
begin
	if v_uid is null then
		return jsonb_build_object('error', 'unauthorized');
	end if;

	select unit_id, sealed, pass_percent into v_unit_id, v_sealed, v_pass
	from public.frc_quiz_attempts
	where id = p_attempt_id and user_id = v_uid and status = 'in_progress'
	for update;

	if not found then
		return jsonb_build_object('error', 'no_attempt');
	end if;

	v_total := jsonb_array_length(v_sealed);
	for i in 0 .. v_total - 1 loop
		v_c := (v_sealed -> i ->> 'c')::integer;
		v_o := v_sealed -> i ->> 'o';
		-- p_answers is 1-indexed in SQL; the client sends position-aligned indices.
		if coalesce(p_answers[i + 1], -1) = v_c then
			v_correct := v_correct + 1;
		else
			v_missed := v_missed || v_o;
		end if;
	end loop;

	v_score := round(100.0 * v_correct / greatest(v_total, 1));
	v_passed := v_score >= v_pass;

	update public.frc_quiz_attempts
	set status = case when v_passed then 'passed' else 'failed' end,
		score = v_score,
		submitted_at = now()
	where id = p_attempt_id;

	-- The completion write. SECURITY DEFINER bypasses RLS as the table owner
	-- (frc_user_progress has no FORCE ROW LEVEL SECURITY), exactly like
	-- frc_mark_complete above; the revoked authenticated grants and dropped
	-- policies from section 1 have no effect on this owner-privileged write.
	if v_passed then
		insert into public.frc_user_progress (user_id, unit_id)
		values (v_uid, v_unit_id)
		on conflict (user_id, unit_id) do nothing;
	end if;

	return jsonb_build_object(
		'passed', v_passed,
		'score', v_score,
		'missed', (select coalesce(jsonb_agg(distinct m), '[]'::jsonb) from unnest(v_missed) m)
	);
end;
$$;

revoke all on function public.frc_quiz_grade(uuid, integer[]) from public;
grant execute on function public.frc_quiz_grade(uuid, integer[]) to authenticated;
