-- undo-0229_ideacad_class_edit_grant.sql
--
-- ===========================================================================
-- STATUS: THE UNDO FOR A PROPOSAL. NOTHING APPLIES IT, AND IT IS PASTED BY HAND.
-- ===========================================================================
-- It reverses 0229_ideacad_class_edit_grant.sql (beside this file) and nothing
-- else. tools/apply-migration.mjs refuses it by design, because it drops a
-- table, so a person pastes it in the SQL editor. Its name does not start with
-- four digits on purpose: it must never be mistaken for a migration, and it must
-- never be moved under supabase/migrations/.
--
-- tests/db/proposed-0229-class-edit-grant.test.ts applies it (twice) at the end
-- of its run and asserts that EVERY function in public comes back to exactly
-- the source and the ACL it had before 0229 was applied, and that 0229 applies
-- again over the result. That test is the proof that this file undoes 0229 and
-- only 0229; read it before trusting this header.
--
-- WHAT IT DOES, IN THIS ORDER, IN ONE TRANSACTION
--
--   0. Refuses unless the two functions it re-creates are still of the 0214
--      lineage (the role reads ideacad_grants and ideacad_section_grants; the
--      discovery read reads ideacad_section_grants).
--   1. Re-creates 0214's _ideacad_document_role and ideacad_shared_with_me,
--      COPIED BYTE FOR BYTE from supabase/migrations/0214 (the test asserts
--      both are verbatim substrings of 0214). FIRST, because a SQL function body
--      that names a table is not a recorded dependency: drop the table while
--      the role still names it and every IdeaCAD read errors at its next call.
--      A create or replace keeps each function's ACL, so no grant is touched.
--      NOT 0214'S SECTIONS 4 AND 7 WHOLE: those also hold functions 0216 later
--      replaced, and pasting them reverts 0216's solid-v1 refusals.
--   2. Refuses if any function other than 0229's own four still names the
--      table or one of those four. Postgres records no dependency from one
--      plpgsql body to another, so a drop succeeds silently and the caller
--      breaks at its next call; this sweep is the caller guard.
--   3. Drops 0229's four functions, then the table (its policy, trigger and
--      index go with it). Every class EDIT grant is lost; 0214's class VIEWER
--      grants live in a different table and are untouched.
--
-- IT IS ONLY CORRECT WHILE 0229 IS THE LAST FILE TO REPLACE THOSE TWO
-- FUNCTIONS. If a later file replaced either one, step 1 reverts that file too:
-- grep supabase/migrations for both names before pasting this.
--
-- RE-PASTING IT IS HARMLESS: every drop is "if exists" and step 1 re-creates
-- what is already there.
-- ---------------------------------------------------------------------------

begin;

do $undopreflight$
declare
	v_src text;
begin
	select p.prosrc into v_src
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = '_ideacad_document_role';
	if v_src is null or position('ideacad_grants' in v_src) = 0 or position('ideacad_section_grants' in v_src) = 0 then
		raise exception 'undo-0229 cannot apply: the deployed _ideacad_document_role is not of the 0214 lineage, so re-creating 0214''s body would revert whatever replaced it. Diff it first.';
	end if;
	select p.prosrc into v_src
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'ideacad_shared_with_me';
	if v_src is null or position('ideacad_section_grants' in v_src) = 0 then
		raise exception 'undo-0229 cannot apply: the deployed ideacad_shared_with_me is not of the 0214 lineage. Diff it first.';
	end if;
end
$undopreflight$;

-- ---------------------------------------------------------------------------
-- 1. 0214's two functions, verbatim.
-- ---------------------------------------------------------------------------

create or replace function public._ideacad_document_role(p_document_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $role$
	select case
		when v.email = '' then null
		when exists (
			select 1 from public.ideacad_documents d
			where d.id = p_document_id and d.student_email = v.email
		) then 'owner'
		else coalesce(
			(
				select g.role from public.ideacad_grants g
				where g.document_id = p_document_id and g.grantee_email = v.email
			),
			(
				select 'viewer'
				from public.ideacad_section_grants sg
				join public.classroom_enrollments ce on ce.section_id = sg.section_id
				where sg.document_id = p_document_id
					and ce.student_email = v.email
					and ce.active
				limit 1
			)
		)
	end
	from (select public.current_user_email() as email) v;
$role$;

create or replace function public.ideacad_shared_with_me(p_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $sharedwithme$
declare
	v_email text := public.current_user_email();
begin
	if coalesce(v_email, '') = '' then
		raise exception 'You must be signed in.';
	end if;
	return (
		select coalesce(jsonb_agg(jsonb_build_object(
			'documentId', x.document_id,
			'ownerEmail', x.owner_email,
			'role', x.role,
			'grantedAt', x.granted_at,
			'updatedAt', x.updated_at,
			'via', x.via
		) order by x.owner_email), '[]')
		from (
			select distinct on (u.document_id)
				u.document_id, u.owner_email, u.role, u.granted_at, u.updated_at, u.via
			from (
				select d.id as document_id, d.student_email as owner_email, g.role,
					g.granted_at, d.updated_at, 'person' as via, 0 as rank
				from public.ideacad_grants g
				join public.ideacad_documents d on d.id = g.document_id
				where g.grantee_email = v_email and d.item_id = p_item_id
				union all
				select d.id, d.student_email, 'viewer',
					sg.granted_at, d.updated_at, 'class', 1
				from public.ideacad_section_grants sg
				join public.ideacad_documents d on d.id = sg.document_id
				join public.classroom_enrollments ce on ce.section_id = sg.section_id
				where ce.student_email = v_email and ce.active and d.item_id = p_item_id
			) u
			order by u.document_id, u.rank, u.granted_at
		) x
	);
end
$sharedwithme$;

-- ---------------------------------------------------------------------------
-- 2. THE CALLER GUARD.
-- ---------------------------------------------------------------------------

do $undocallers$
declare
	v_hits text[];
begin
	select array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text) into v_hits
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public'
		and p.proname not in ('ideacad_grant_class_edit', 'ideacad_revoke_class_edit',
			'ideacad_class_edit_grants', '_ideacad_class_edit_reach')
		and (position('ideacad_section_edit_grants' in p.prosrc) > 0
			or position('ideacad_grant_class_edit(' in p.prosrc) > 0
			or position('ideacad_revoke_class_edit(' in p.prosrc) > 0
			or position('ideacad_class_edit_grants(' in p.prosrc) > 0
			or position('_ideacad_class_edit_reach(' in p.prosrc) > 0);
	if v_hits is not null then
		raise exception 'undo-0229 refuses: % function(s) outside 0229 still name its table or its functions, and would break at their next call: %.',
			array_length(v_hits, 1), array_to_string(v_hits, ', ');
	end if;
end
$undocallers$;

-- ---------------------------------------------------------------------------
-- 3. THE DROPS. Functions first, then the table they read.
-- ---------------------------------------------------------------------------

drop function if exists public.ideacad_grant_class_edit(uuid, uuid);
drop function if exists public.ideacad_revoke_class_edit(uuid, uuid);
drop function if exists public.ideacad_class_edit_grants(uuid);
drop function if exists public._ideacad_class_edit_reach(uuid, uuid);
drop table if exists public.ideacad_section_edit_grants;

do $undocheck$
declare
	v_left integer;
begin
	if to_regclass('public.ideacad_section_edit_grants') is not null then
		raise exception 'undo-0229: the table is still there.';
	end if;
	select count(*) into v_left
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname in ('ideacad_grant_class_edit', 'ideacad_revoke_class_edit',
		'ideacad_class_edit_grants', '_ideacad_class_edit_reach');
	if v_left <> 0 then
		raise exception 'undo-0229: % of 0229''s functions survived.', v_left;
	end if;
	if position('ideacad_section_edit_grants' in (
		select prosrc from pg_proc where oid = 'public._ideacad_document_role(uuid)'::regprocedure
	)) > 0 then
		raise exception 'undo-0229: _ideacad_document_role still reads the class edit table.';
	end if;
	raise notice 'undo-0229: the class edit grant table and its four functions are gone; the role and discovery read are 0214''s again.';
end
$undocheck$;

commit;
