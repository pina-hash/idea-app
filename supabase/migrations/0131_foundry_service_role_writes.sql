-- 0131_foundry_service_role_writes.sql
-- Two fixes to 0130, both ADDITIVE. No drops, no data touched, no behaviour
-- removed from any existing caller.
--
-- ---------------------------------------------------------------------------
-- FIX 1: service_role cannot satisfy the Foundry CHECK constraints.
--
-- A CHECK CONSTRAINT'S FUNCTION IS EVALUATED AS THE WRITING ROLE. service_role
-- bypasses RLS; it does NOT bypass function grants. 0130 revokes its three
-- private predicates from `public` and never grants them onward, so every
-- table whose CHECK calls one is UNWRITABLE by a server holding the service
-- key -- with `permission denied for function <name>` -- even though 0130's own
-- `grant insert, update, delete ... to service_role` on those tables is sitting
-- right there.
--
-- The RPCs never showed this, because SECURITY DEFINER runs their checks as the
-- owner. The gap only opens for a caller that writes DIRECTLY, which is exactly
-- the extraction Edge Function that `student_app_files` exists to be written by
-- and nothing else. Measured against the real Storage service and the real
-- migration chain: the function extracted a bundle into `foundry-bundles`
-- successfully and then failed on the index insert with
--
--   permission denied for function _classroom_deck_path_ok
--
-- and on the manifest update with
--
--   permission denied for function _foundry_norm
--
-- THREE FUNCTIONS, NOT TWO. The whole `public` schema was swept for the same
-- shape -- a helper reachable from a write-time expression (a CHECK, an index
-- predicate or expression, a column default, a generated column) that
-- service_role cannot execute. RLS policies are deliberately NOT part of that
-- sweep: service_role bypasses RLS, so a policy function is not reachable by
-- it. Triggers were checked too and are clean -- both Foundry triggers are
-- SECURITY DEFINER, so their bodies run as the owner.
--
-- What the sweep found, and what is done about each:
--
--   _classroom_deck_path_ok(text)  GRANTED HERE. Six CHECK constraints, three
--                                  of them on tables service_role can write:
--                                  student_app_files.path,
--                                  student_app_versions.zip_path,
--                                  student_apps.cover_path. (The other three
--                                  are classroom_decks / classroom_deck_files,
--                                  which service_role holds no write grant on
--                                  at all -- so not reachable there, but the
--                                  grant is per-function, not per-table.)
--
--   _foundry_norm(text)            GRANTED HERE. Seven CHECK constraints across
--                                  student_apps (title, tagline, description,
--                                  build_notes, hidden_reason) and
--                                  student_app_versions (review_note,
--                                  reject_reason). An UPDATE re-evaluates every
--                                  CHECK on the row, not only the columns it
--                                  touched, which is why writing a manifest
--                                  needs this one.
--
--   _foundry_slug_ok(text)         GRANTED HERE, and it was NOT in the original
--                                  report. Same shape exactly: student_apps.slug
--                                  has a CHECK that calls it, and service_role
--                                  holds insert and update on student_apps. It
--                                  is not reachable from the extraction function
--                                  (which never writes student_apps), so it is
--                                  latent rather than blocking -- the next
--                                  service-role writer of that table would fail
--                                  identically, one function later, with the
--                                  same invisible symptom. Fixing two of three
--                                  and leaving the third is how the same
--                                  debugging session happens twice.
--
--   coin_semester_key(timestamptz) FOUND, DELIBERATELY NOT GRANTED. It is the
--                                  DEFAULT for coin_transactions.semester_key
--                                  and is granted to `authenticated` but not to
--                                  service_role, which is the shape -- but
--                                  service_role holds NO insert or update on
--                                  coin_transactions, so there is no writer for
--                                  the gap to open under. Granting execute to a
--                                  role that cannot write the table widens reach
--                                  for nobody. If a service-role writer of the
--                                  coin ledger is ever added, this becomes real
--                                  and belongs in that migration, next to the
--                                  table grant that makes it reachable.
--
-- ---------------------------------------------------------------------------
-- FIX 2: foundry-uploads has no SELECT policy, which makes its UPDATE and
-- DELETE policies inert.
--
-- Storage has to FIND an object before it can act on one, and PostgreSQL
-- applies SELECT policies to a WHERE-qualified UPDATE. With no SELECT policy
-- naming the bucket, an owner sees none of their own objects, so:
--
--   - `remove()` reports SUCCESS and the object survives -- the worst of the
--     three, because it is silent and looks like it worked;
--   - `update()` and an upsert are refused with `new row violates row-level
--     security policy`, which reads as a permissions bug rather than a
--     visibility one.
--
-- Measured with the JWT claims set directly in SQL: an owner saw 0 rows in
-- foundry-uploads and 2 in foundry-covers, which is the same policy shape with
-- a SELECT policy attached.
--
-- The new policy is scoped EXACTLY like the three write policies 0130 already
-- carries for this bucket -- same bucket pin, same
-- `(storage.foldername(name))[1] = auth.uid()::text` own-prefix rule -- so it
-- widens nothing beyond "an owner can see their own uploads".
--
-- WHAT THIS DOES NOT CHANGE, stated because it is a decision and not an
-- oversight: SINGLE-WRITE-PER-PATH STAYS THE MODEL. A student who fixes a zip
-- produces a NEW version and uploads under a NEW path. This policy exists so
-- that DELETE is honest, not to make overwriting a supported flow. Note that
-- 0130's UPDATE policy plus this SELECT policy does make an own-prefix
-- overwrite technically possible where it previously failed; the model is now
-- a client convention rather than something the database refuses. Making it a
-- refusal again would mean dropping the UPDATE policy, which is a removal and
-- does not belong in an additive migration.
--
-- ---------------------------------------------------------------------------
-- WHAT UNDOES THIS MIGRATION. Nothing here creates a table, a column or a row,
-- so the reversal is exact and loses nothing:
--
--   revoke execute on function public._classroom_deck_path_ok(text) from service_role;
--   revoke execute on function public._foundry_norm(text) from service_role;
--   revoke execute on function public._foundry_slug_ok(text) from service_role;
--   drop policy if exists "foundry uploads read own folder" on storage.objects;
--
-- After that revoke, the extraction function stops being able to write
-- student_app_files and student_app_versions again, which is the state 0130
-- left behind.
--
-- Apply manually in the Supabase SQL editor, after 0130.

-- ---------------------------------------------------------------------------
-- 1. The three grants.
--
-- `grant` is idempotent -- re-granting an existing privilege is a no-op -- so
-- this file re-applies cleanly, which matters because a re-paste is ordinary
-- here.
-- ---------------------------------------------------------------------------

grant execute on function public._classroom_deck_path_ok(text) to service_role;
grant execute on function public._foundry_norm(text) to service_role;
grant execute on function public._foundry_slug_ok(text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. The missing SELECT policy on foundry-uploads.
--
-- GUARDED ON pg_policies RATHER THAN drop-then-create. 0130's own convention
-- for a policy is `drop policy if exists` followed by `create`, and that is a
-- perfectly good idiom -- but this migration is additive by instruction, and a
-- catalog guard removes nothing at all on a re-paste. The trade-off is the
-- usual one for `if not exists`: re-pasting an EDITED body would silently do
-- nothing. That is safe here because an applied migration is never edited; a
-- change to this policy is a new file.
-- ---------------------------------------------------------------------------

do $$
begin
	if not exists (
		select 1 from pg_policies
		where schemaname = 'storage'
			and tablename = 'objects'
			and policyname = 'foundry uploads read own folder'
	) then
		create policy "foundry uploads read own folder"
			on storage.objects
			for select
			to authenticated
			using (
				bucket_id = 'foundry-uploads'
				and (storage.foldername(name))[1] = (select auth.uid())::text
			);
		raise notice '0131: created the foundry-uploads own-folder SELECT policy.';
	else
		raise notice '0131: the foundry-uploads own-folder SELECT policy was already present.';
	end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Report what landed, so the operator can check it against what the
--    deployed app actually holds rather than trusting that the file ran.
-- ---------------------------------------------------------------------------

do $$
declare
	v_missing text;
	v_policies integer;
begin
	select string_agg(p.proname, ', ' order by p.proname) into v_missing
	from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public'
		and p.proname in ('_classroom_deck_path_ok', '_foundry_norm', '_foundry_slug_ok')
		and not has_function_privilege('service_role', p.oid, 'EXECUTE');

	if v_missing is not null then
		raise exception '0131 did not take: service_role still cannot execute %', v_missing;
	end if;
	raise notice '0131: service_role can execute all three Foundry CHECK predicates.';

	select count(*) into v_policies
	from pg_policies
	where schemaname = 'storage' and tablename = 'objects'
		and (coalesce(qual, '') || coalesce(with_check, '')) like '%foundry-uploads%';
	raise notice '0131: foundry-uploads now carries % policies (expected 4: select, insert, update, delete).', v_policies;
end
$$;
