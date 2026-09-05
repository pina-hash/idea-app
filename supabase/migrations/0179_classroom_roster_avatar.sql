-- 0179_classroom_roster_avatar.sql
-- IDEA Classroom: the roster read projects a person's AVATAR beside the name
-- it already returns, so a face can be rendered wherever that name is.
--
-- Apply manually in the Supabase SQL editor.
--
-- ---------------------------------------------------------------------------
-- WHY A MIGRATION AT ALL, WHICH WAS THE FIRST THING CHECKED AND NOT ASSUMED
--
-- `avatars` is a PUBLIC bucket (0020) and `avatarUploadUrl` builds an
-- unsigned, unexpiring URL from a stored path, so the BYTES need nothing from
-- the database. What is not reachable is the PATH: it lives in
-- `profiles.avatar`, and `profiles` is own-row-or-admin --
-- "teachers select all profiles" (0001) reads `is_teacher()`, which 0067
-- redefined to `is_admin()`. So a TEACHER OF RECORD, who is not an admin,
-- genuinely cannot read one student's `avatar` column, and no client-side
-- rearrangement changes that. Measured in tests/db/avatar-bucket-boundary
-- and tests/db/avatar-roster-projection.
--
-- WHAT THIS DISCLOSES, STATED AS A DISCLOSURE AND NOT AS A FIELD ADDITION
-- (CLAUDE.md: widening a payload is a disclosure decision):
--
--   * TO WHOM: exactly the callers who already read this function, and the
--     predicate is UNCHANGED -- `public.classroom_manages_section(e.section_id)`
--     per row, which is the teacher of record for that section or an admin.
--     No new gate, no widened gate, no second authorization model. A student
--     calling this still gets zero rows.
--   * WHAT: two columns, `avatar` and `avatar_url`, and nothing else off
--     `profiles`. NOT `pathway`, NOT `role`, NOT `section_id`, NOT
--     `preferences`, NOT `tour_completed_at`. A face and a fallback photo are
--     what the surfaces asked for; every other column on that table is a
--     separate decision and none of them is made here.
--   * AGAINST WHAT IT IS MEASURED: the same audience already reads
--     `student_email` and `display_name` from this very function. An avatar
--     is no wider than the name it sits beside, which is the only test this
--     projection is meant to pass.
--
-- THE BUCKET BEING PUBLIC IS THE FACT THAT MAKES THIS SMALL AND IT IS ALSO
-- THE ONE WORTH WRITING DOWN. Anyone holding the path can fetch the image
-- with no session at all, and the GAUNTLET leaderboard has projected avatars
-- to every signed-in user since 0024. This function therefore hands a
-- manager a pointer to bytes that were never private, about a student whose
-- name and address it already returns. If the bucket is ever made private,
-- this projection keeps working (the path is still the path) and it is
-- `avatarUploadUrl` that has to learn to sign -- one place, not this one.
--
-- ---------------------------------------------------------------------------
-- THE EMAIL/UUID BRIDGE IS `_notebook_user_id_for_email`, THE 0094 ONE
--
-- The roster is EMAIL-keyed (`classroom_enrollments`) and `profiles` is
-- uuid-keyed, so the two have to be lined up. That mapping is the one this
-- codebase is most careful about and it already has exactly one
-- implementation; a `_classroom_`-prefixed copy would be a second, and the
-- prefix on the existing one says where it was born rather than what it does
-- (CLAUDE.md states this for Foundry, and the reason is identical here).
--
-- IT READS `auth.users`, NOT `profiles.email`, AND THAT IS THE POINT.
-- `profiles.email` is a copy written once at signup; `auth.users` is the
-- authority, which is why `current_user_email()` reads it too. Joining
-- `profiles.email` instead would quietly disagree the first time an address
-- changed.
--
-- A NULL IS AN ORDINARY ANSWER AT EVERY STEP, and there are three ways to get
-- one: the student is on the roster and has never signed in (no `auth.users`
-- row, so no uuid); they have signed in but chosen no picture and Google gave
-- none; or the address on the roster is not the one on the account. Every one
-- of them renders as an initials tile, which is the common case rather than
-- an error state -- so nothing here raises, and nothing filters a row out for
-- want of a face.
--
-- ---------------------------------------------------------------------------
-- THE SIGNATURE TRAP: THE DROP IS REQUIRED AND IS NOT OPTIONAL HERE
--
-- This changes the RETURNS TABLE, which `create or replace` cannot do --
-- Postgres refuses with "cannot change return type of existing function". So
-- the old definition is dropped at its exact argument list first, which also
-- keeps the file re-appliable over a database that took an earlier draft.
--
-- IT IS NOT THE DEPLOY-ORDERING CASE, because nothing about the CALL changes:
-- the argument list is `(uuid)` before and after, so every deployed client
-- keeps calling the same signature and simply does not name the new columns.
-- `loadSectionRoster` reads them on a widened rung and degrades to the
-- current select, which is this repository's ladder pattern -- so the
-- migration and the deploy are independent events and either may go first.
--
-- WHAT UNDOES IT: re-apply the 0138 definition of
-- `classroom_section_roster` verbatim (that file's section for it), then
-- re-apply `0137_anon_execute_sweep.sql`. Nothing else in this file has any
-- other effect; no table, column, policy or grant is touched.
-- ---------------------------------------------------------------------------

drop function if exists public.classroom_section_roster(uuid);

create or replace function public.classroom_section_roster(p_section_id uuid default null)
returns table (
	section_id uuid,
	student_email text,
	display_name text,
	active boolean,
	updated_at timestamptz,
	manages boolean,
	avatar text,
	avatar_url text
)
language sql
stable
security definer
set search_path = ''
as $$
	select
		e.section_id,
		e.student_email,
		e.display_name,
		e.active,
		e.updated_at,
		public._classroom_manages_section_email(e.section_id, e.student_email) as manages,
		p.avatar,
		p.avatar_url
	from public.classroom_enrollments e
	-- LEFT joins, both of them, and the row survives either one missing.
	left join lateral (
		select public._notebook_user_id_for_email(e.student_email) as id
	) u on true
	left join public.profiles p on p.id = u.id
	where (p_section_id is null or e.section_id = p_section_id)
		and public.classroom_manages_section(e.section_id)
	order by e.display_name, e.student_email;
$$;

-- REVOKED FROM THE ROLES THAT ACTUALLY HOLD IT, NOT ONLY FROM `public`, and
-- restated here because a `drop`/`create` pair hands the new function a fresh
-- set of grants from the project's default privileges -- which on a hosted
-- Supabase project include `anon`. 0137's sweep repaired what existed when it
-- ran; it does not cover a function created afterwards, so this file closes
-- its own. Identical to 0138's end state.
revoke all on function public.classroom_section_roster(uuid)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_section_roster(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Self-check. Reads the catalog back rather than trusting that the statements
-- above ran: the ACL is the thing that silently comes out wrong here, and a
-- migration's own guard passing only says the guard ran.
-- ---------------------------------------------------------------------------
do $$
declare
	v_count integer;
	v_anon boolean;
	v_authed boolean;
begin
	select count(*) into v_count
	from pg_proc pr
	join pg_namespace n on n.oid = pr.pronamespace
	where n.nspname = 'public' and pr.proname = 'classroom_section_roster';
	if v_count <> 1 then
		raise exception '0179: expected exactly one classroom_section_roster, found % (the signature trap: an old arity survived)', v_count;
	end if;

	v_anon := has_function_privilege('anon', 'public.classroom_section_roster(uuid)', 'execute');
	v_authed := has_function_privilege('authenticated', 'public.classroom_section_roster(uuid)', 'execute');
	if v_anon then
		raise exception '0179: anon holds EXECUTE on classroom_section_roster; the revoke did not name every role';
	end if;
	if not v_authed then
		raise exception '0179: authenticated lost EXECUTE on classroom_section_roster; the browser roster read is broken';
	end if;

	raise notice '0179: classroom_section_roster projects avatar + avatar_url; anon=% authenticated=%', v_anon, v_authed;
end;
$$;
