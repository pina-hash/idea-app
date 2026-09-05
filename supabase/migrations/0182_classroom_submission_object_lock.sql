-- 0182_classroom_submission_object_lock.sql
--
-- THE ROW IS LOCKED AND THE BYTES ARE NOT. This file closes that.
--
-- ---------------------------------------------------------------------------
-- THE DEFECT
-- ---------------------------------------------------------------------------
--
-- `classroom_delete_submission_file` (0086, re-signed in 0133) reads the
-- submission's state and refuses `submitted` with `{ok:false, reason:'locked'}`.
-- The storage policy standing beside it, `submission files delete own
-- submission` (0133), asks `classroom_owns_submission_object` AND NOTHING ELSE.
--
-- So the two halves of one decision disagree, and the half with no undo is the
-- open one. Measured on a real chain, as a real student: alice attaches a file,
-- turns the work in, the row delete answers `locked` and the row survives, and
-- `delete from storage.objects` as alice removes the object anyway (1 row). The
-- row is still there naming bytes that are gone; the teacher who could read
-- those bytes a moment earlier reads 0 objects and 1 row, and the download she
-- clicks 404s in a way that reads as a platform fault rather than as something
-- the student did. A Storage delete cannot be reversed and this repository
-- holds no backup of a bucket.
--
-- The same asymmetry sits on the INSERT policy, more mildly: bytes can land in
-- the caller's own prefix on a hand-in that is already turned in. Nothing can
-- name them (the attach refuses with the same `locked`), so they serve nobody
-- and are listed by nothing -- but they are still bytes arriving at work a
-- teacher is holding, and one rule stated in one half is how the delete half
-- came to be forgotten in the first place.
--
-- The scoping of both is ownership, so what is open is self-harm plus a
-- teacher's confusion. It is not a disclosure, not a cross-student reach and
-- not an escalation. That is why this is an ordinary lane and not an incident.
--
-- ---------------------------------------------------------------------------
-- WHY THE OBVIOUS NARROWING IS WRONG ON THE DELETE, AND RIGHT ON THE INSERT
-- ---------------------------------------------------------------------------
--
-- The one-line answer, `and <this submission is not submitted>`, is CORRECT for
-- INSERT and BREAKS the DELETE. The reason is a shipped path:
-- `src/routes/api/classroom/submission-file/+server.ts` uploads the bytes FIRST
-- and records the row SECOND, and when the record is refused it sweeps the
-- orphaned object USING THE STUDENT'S OWN CLIENT. That sweep runs in exactly
-- the `locked` case, so a submission-keyed narrowing on DELETE would refuse the
-- sweep precisely when it is needed and leave an orphan behind every time.
--
-- INSERT has no such caller. Nothing legitimately writes an object into a
-- submitted hand-in's prefix: `classroom_open_submission` refuses a locked
-- submission before a signed upload URL is minted at all, so the only way to
-- reach the insert policy in that state is to go around the app.
--
-- So the two halves key on two different things, deliberately:
--
--   DELETE keys on the ROW.    An object NO LIVE ROW NAMES is always the
--                              owner's to remove -- that is the sweep. An
--                              object a SUBMITTED row names is nobody's.
--   INSERT keys on the PREFIX. A key's first segment IS its submission
--                              (`<submission_id>/<uuid>.<ext>`), and a new
--                              object has no row to key on yet.
--
-- WHICH STATES LOCK IS WRITTEN DOWN ONCE, in `_classroom_submission_is_locked`,
-- and both predicates read it. Two literals thirty lines apart is how the two
-- halves of a decision come to disagree, which is the defect this file exists
-- to close; writing it twice again while closing it would be absurd.
--
-- `returned` REOPENS THE WORK and is not locked, in step with the attach and
-- with `classroom_delete_submission_file`'s own `v_state = 'submitted'` test.
-- 0086's column comment says so: "graded and released (editable again for
-- resubmission)". A student given feedback can act on it; a student holding an
-- ungraded hand-in cannot touch it, and neither can a student whose grade has
-- not been released.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE DOES NOT DO
-- ---------------------------------------------------------------------------
--
-- * It does not touch `classroom_delete_submission_file`. Its `v_state =
--   'submitted'` test is the twin of the one below and stays where it is; the
--   two are held in step by a test that drives BOTH halves across all three
--   states rather than by a shared body, because re-signing a busy deployed
--   RPC to change nothing about its behaviour is a risk this file does not need
--   to take. See `tests/classroom-storage-objects.test.ts`.
-- * It does not touch the SELECT policy. A teacher must keep reading a
--   submitted hand-in; that is the whole point of it being locked.
-- * It adds no UPDATE policy. 0133 deliberately has none on either bucket and
--   this file does not change that.
-- * It touches no other bucket. `classroom-attachments`, `instructor-
--   attachments` and every non-classroom bucket are untouched, which section 4
--   asserts at apply time.
--
-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
--
-- What undoes this file, exactly:
--
--   drop policy if exists "submission files delete own submission" on storage.objects;
--   create policy "submission files delete own submission"
--     on storage.objects for delete to authenticated
--     using (bucket_id = 'submission-files'
--            and public.classroom_owns_submission_object(name));
--   drop policy if exists "submission files insert own submission" on storage.objects;
--   create policy "submission files insert own submission"
--     on storage.objects for insert to authenticated
--     with check (bucket_id = 'submission-files'
--                 and public.classroom_owns_submission_object(name));
--   drop function if exists public.classroom_submission_object_is_locked(text);
--   drop function if exists public.classroom_submission_prefix_is_locked(text);
--   drop function if exists public._classroom_submission_is_locked(uuid);
--
-- That is 0133's section 4 verbatim for those two policies. Nothing stored
-- changes either way: this file writes no row, drops no column and backfills
-- nothing, so a rollback loses nothing but the narrowing.
--
-- IDEMPOTENT. `create or replace` throughout, `drop policy if exists` before
-- each create, and no DML at all. Re-pasting it is ordinary and lands in the
-- same state.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Which states lock. ONE statement of it.
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER because `classroom_submissions` carries RLS and the two
-- predicates below are evaluated inside a policy, where an invoker-rights read
-- would answer "not locked" for a row the caller happens not to see -- which
-- fails OPEN. A missing row answers false, which is correct on its own terms:
-- an object whose submission does not exist is named by nothing.
--
-- Not granted to `authenticated`: its only callers are the two SECURITY
-- DEFINER predicates below, whose bodies run as the owner.

create or replace function public._classroom_submission_is_locked(p_submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1
		from public.classroom_submissions s
		where s.id = p_submission_id
			and s.state = 'submitted'
	);
$$;

revoke all on function public._classroom_submission_is_locked(uuid)
	from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The DELETE predicate: keyed on the ROW.
-- ---------------------------------------------------------------------------
--
-- True when a live `classroom_submission_files` row names this exact object AND
-- that row's submission is turned in. False for an object no row names, which
-- is what keeps the server route's orphan sweep working -- and false is also
-- what it answers the instant `classroom_delete_submission_file` removes the
-- row, which is the order that RPC already works in (it deletes the row, then
-- hands the key back for the route to sweep).

create or replace function public.classroom_submission_object_is_locked(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1
		from public.classroom_submission_files sf
		where sf.storage_key = p_name
			and public._classroom_submission_is_locked(sf.submission_id)
	);
$$;

revoke all on function public.classroom_submission_object_is_locked(text)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_submission_object_is_locked(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The INSERT predicate: keyed on the PREFIX.
-- ---------------------------------------------------------------------------
--
-- A new object has no row to key on, so the question has to be asked of the
-- submission its key names. `_classroom_storage_prefix_uuid` is 0133's ONE
-- reader of the key layout and returns NULL for anything that is not a bare
-- uuid in segment 1; NULL answers false here, and the policy's
-- `classroom_owns_submission_object` fails closed on the same NULL, so the
-- pair still refuses a malformed key.

create or replace function public.classroom_submission_prefix_is_locked(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select public._classroom_submission_is_locked(
		public._classroom_storage_prefix_uuid(p_name)
	);
$$;

revoke all on function public.classroom_submission_prefix_is_locked(text)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_submission_prefix_is_locked(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The two policies, replaced. 0133's clauses are kept verbatim and one
--    conjunct is added to each.
-- ---------------------------------------------------------------------------

drop policy if exists "submission files delete own submission" on storage.objects;
create policy "submission files delete own submission"
	on storage.objects
	for delete
	to authenticated
	using (
		bucket_id = 'submission-files'
		and public.classroom_owns_submission_object(name)
		and not public.classroom_submission_object_is_locked(name)
	);

drop policy if exists "submission files insert own submission" on storage.objects;
create policy "submission files insert own submission"
	on storage.objects
	for insert
	to authenticated
	with check (
		bucket_id = 'submission-files'
		and public.classroom_owns_submission_object(name)
		and not public.classroom_submission_prefix_is_locked(name)
	);

-- ---------------------------------------------------------------------------
-- 5. Self-check and counts.
-- ---------------------------------------------------------------------------

do $$
declare
	v_missing text;
	v_locked_objects bigint;
	v_locked_submissions bigint;
	v_other_buckets bigint;
begin
	-- The two policies exist and carry the new conjunct.
	select string_agg(want, ', ') into v_missing
	from (values
		('submission files delete own submission'),
		('submission files insert own submission')
	) as t(want)
	where not exists (
		select 1 from pg_policies p
		where p.schemaname = 'storage' and p.tablename = 'objects' and p.policyname = t.want
			and coalesce(p.qual, '') || coalesce(p.with_check, '') like '%_is_locked%'
	);
	if v_missing is not null then
		raise exception '0182: policy not narrowed: %', v_missing;
	end if;

	-- `anon` reaches neither predicate, and `authenticated` reaches both. This
	-- is asserted from the catalog rather than from the revoke having run,
	-- because on a hosted project the default privileges hand every new
	-- function a direct `anon` grant at creation time and a plain
	-- `revoke ... from public` would not have removed it.
	if has_function_privilege('anon', 'public.classroom_submission_object_is_locked(text)', 'execute')
		or has_function_privilege('anon', 'public.classroom_submission_prefix_is_locked(text)', 'execute')
		or has_function_privilege('anon', 'public._classroom_submission_is_locked(uuid)', 'execute')
		or has_function_privilege('authenticated', 'public._classroom_submission_is_locked(uuid)', 'execute')
	then
		raise exception '0182: a predicate is granted more widely than intended';
	end if;
	if not has_function_privilege('authenticated', 'public.classroom_submission_object_is_locked(text)', 'execute')
		or not has_function_privilege('authenticated', 'public.classroom_submission_prefix_is_locked(text)', 'execute')
	then
		raise exception '0182: a predicate named in an RLS policy is not granted to authenticated';
	end if;

	-- No other bucket's policies were touched.
	select count(*) into v_other_buckets
	from pg_policies p
	where p.schemaname = 'storage' and p.tablename = 'objects'
		and coalesce(p.qual, '') || coalesce(p.with_check, '') like '%_is_locked%'
		and p.policyname not like 'submission files %';
	if v_other_buckets > 0 then
		raise exception '0182: % policy/policies outside submission-files name the new predicate', v_other_buckets;
	end if;

	-- What is now protected, against the real table, so the operator can check
	-- it against what the deployed app holds.
	select count(*) into v_locked_submissions
	from public.classroom_submissions s where s.state = 'submitted';
	select count(*) into v_locked_objects
	from public.classroom_submission_files sf
	where sf.storage_key is not null
		and public._classroom_submission_is_locked(sf.submission_id);

	raise notice '0182: % submission(s) currently turned in; % stored object(s) are now undeletable by their student until the work is unsubmitted or returned.',
		v_locked_submissions, v_locked_objects;
	raise notice '0182: nothing stored was changed. A student can still delete a DRAFT hand-in''s bytes, and the server route''s orphan sweep is unaffected (it removes objects no row names).';
end;
$$;
