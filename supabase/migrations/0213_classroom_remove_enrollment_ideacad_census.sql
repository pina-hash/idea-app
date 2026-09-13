-- 0213_classroom_remove_enrollment_ideacad_census.sql
--
-- ONE THING: the census inside `classroom_remove_enrollment` learns about
-- IdeaCAD. Nothing else in 0138 is touched, and no archive is built here.
--
-- THE DEFECT, found by ledger 0206 on 2026-09-13 and reported rather than
-- fixed. `classroom_remove_enrollment` (0138) is a HARD DELETE: it takes four
-- counts, and if every one of them is zero it runs
-- `delete from public.classroom_enrollments`, with no soft-delete stamp and
-- nothing to restore from. The four are `classroom_responses`,
-- `classroom_submissions`, `classroom_module_approvals` and
-- `notebook_entries`, each scoped to the SECTION through
-- `classroom_postings`, because the enrollment is.
--
-- IdeaCAD is not among them, and `ideacad_roster` (0201) builds its rows like
-- this:
--
--   from (select distinct ce.student_email
--           from public.classroom_postings cp
--           join public.classroom_enrollments ce on ce.section_id = cp.section_id
--          where cp.item_id = p_item_id) e
--   left join public.ideacad_documents d
--          on d.item_id = p_item_id and d.student_email = e.student_email
--
-- The ENROLLMENT is the driving set and the document is LEFT JOINED onto it.
-- Delete the enrollment and the address leaves `e`, so the left join never
-- reaches the document: the row is still in `public.ideacad_documents`, its
-- concepts are still in `public.ideacad_concepts`, and the only function that
-- lists a class's IdeaCAD work cannot see any of it. A student whose only work
-- is a finished IdeaCAD part is therefore removed OUTRIGHT -- the refusal
-- never fires, because nothing asked -- and the part is silently unreachable.
--
-- THE UNIT COUNTED IS THE DOCUMENT, NOT THE CONCEPT, and that is the grain the
-- stranding actually has. `ideacad_documents` carries `unique(item_id,
-- student_email)`, `ideacad_concepts` cascades off it and `ideacad_predictions`
-- is keyed on it, so one document row is exactly one thing that becomes
-- unlistable and everything else goes with it. Counting concepts instead would
-- report a bigger number for the same single loss and would say nothing extra
-- about what is in the way.
--
-- A DOCUMENT OPENED AND NEVER WORKED IN STILL COUNTS, DELIBERATELY, AND THIS
-- IS THE ONE JUDGEMENT WORTH ARGUING WITH. `ideacad_open_document` inserts the
-- document row AND seeds `Concept 1` on the FIRST OPEN, so unlike the other
-- four categories a row here can exist because somebody loaded a page. Two
-- ways to be wrong: refuse a removal that had nothing behind it, which costs a
-- manager a conversation and is reversible; or pass a removal that strands a
-- term of modelling, which is the defect and is not. `deleted_at` on a concept
-- is not consulted for the same reason 0138 counts a soft-deleted
-- `notebook_entries` row: the document is the thing, and a concept in the bin
-- is not what makes it exist. The narrowing, if it is ever wanted, is a
-- predicate over what a student actually changed -- and that is a second
-- definition of "is this work", which is the thing this file is careful not to
-- write.
--
-- IT IS THE CENSUS AND NOT THE ARCHIVE. Decision 29 is answered -- a departing
-- owner's document is ARCHIVED and stays reachable by the admin instructor,
-- and an instructor who shares it with a class gives those students access --
-- but that is a document state, an archive path and an instructor surface, and
-- it is a bundle of its own. What this file buys is that nobody loses a part
-- BEFORE that bundle ships. It does not make a removed student's document
-- reachable, and it does not help the students (if any) whose enrollments were
-- already deleted while the census was blind: nothing here goes looking for an
-- orphan, and section 4 reports what is currently in the way rather than what
-- has already gone through.
--
-- TWO MIGRATIONS MUST NOT REDEFINE THE SAME OBJECT, so this file names exactly
-- ONE: `public.classroom_remove_enrollment(uuid, text)`. It does not touch
-- `_admin_is_email`, `is_admin`, `_classroom_manages_section_email`,
-- `classroom_manages_section`, `classroom_section_roster` or
-- `_notebook_section_roster`, all of which 0138 owns, and it touches nothing
-- 0201 owns.
--
-- NO SIGNATURE CHANGE, so THE SIGNATURE TRAP DOES NOT ARISE and there is no
-- drop. The argument list is `(uuid, text)` before and after and the return
-- type is still `jsonb`, so `create or replace` replaces the one function
-- rather than adding an overload beside it. Section 3 asserts `pg_proc` holds
-- exactly ONE row for the name, which is the assertion that would catch it if
-- that ever stopped being true.
--
-- NO DEPLOY ORDERING EITHER, in the direction that matters. The returned
-- `counts` object GAINS a key and loses none, so a client that has not been
-- redeployed reads the four it knows and ignores the fifth; the `total` is the
-- sum of five and is what both the database and the surface treat as the
-- refusal. The client half of this bundle adds the fifth label so the sentence
-- names it, and until that deploys the refusal is right and its sentence is
-- short. The reverse order is the one that would break, and it cannot happen
-- here: a label for a key the database does not send renders nothing.
--
-- RE-APPLIABLE. One `create or replace`, one catalog-guarded precondition, one
-- read-only self-check and one read-only report. Nothing is dropped, no row is
-- written, and a second paste produces the same end state.
--
-- WHAT UNDOES IT: re-apply 0138's own definition of
-- `classroom_remove_enrollment`, which restores the four-count census
-- verbatim. The ACL is unchanged by that, because `create or replace`
-- preserves it. Nothing else in this file needs undoing -- it creates no
-- object, grants nothing new and writes no row.
--
-- THE GRANT SHAPE IS 0166's AND NOT 0201's. `revoke ... from public` alone is
-- NOT a narrowing on a hosted Supabase project: the project bootstraps
--
--   alter default privileges in schema public
--     grant execute on functions to anon, authenticated, service_role;
--
-- so a function arrives with a DIRECT grant to each of those roles and
-- removing the PUBLIC entry leaves all three. 0201 used the bare form and all
-- ten of its functions came out anon-executable on production, which is what
-- 0202 had to repair. So section 2 revokes from `public, anon, authenticated,
-- service_role` BY NAME and grants back `authenticated` alone, which is 0138's
-- own end state restated. On production `create or replace` preserves the
-- existing ACL and the restatement is a no-op; on a database where this
-- function does not yet exist it is the whole of the narrowing.
--
-- NO DOLLAR SIGN APPEARS IN ANY COMMENT IN THIS FILE. A dollar-quote token
-- inside a leading-dash comment balances in Postgres and breaks the Supabase
-- editor's client-side statement splitter, which cost 0194 an apply cycle. The
-- verification query at the bottom is plain SELECT and needs none.

-- ---------------------------------------------------------------------------
-- 1. PRECONDITION. Refuse rather than ship a function that raises at call
--    time.
--
--    plpgsql resolves a table reference when the statement first RUNS, not
--    when the body is compiled, so a `create or replace` naming
--    `public.ideacad_documents` on a database that never applied 0201 succeeds
--    quietly and then fails at every single removal attempt -- including the
--    ones that would otherwise have been allowed. That turns a widened refusal
--    into a total outage of the People tab's Remove control, so it is refused
--    here instead, with the name of the file to apply first.
-- ---------------------------------------------------------------------------

do $guard$
begin
	if to_regclass('public.ideacad_documents') is null then
		raise exception
			'0213 needs public.ideacad_documents, which 0201_ideacad_blade_editor.sql creates. Apply 0201 first. Nothing was changed.';
	end if;
	if to_regprocedure('public.classroom_remove_enrollment(uuid, text)') is null then
		raise exception
			'0213 replaces public.classroom_remove_enrollment(uuid, text), which 0138_classroom_manager_exclusion_and_enrollment_removal.sql creates. Apply 0138 first. Nothing was changed.';
	end if;
end
$guard$;

-- ---------------------------------------------------------------------------
-- 2. The census, widened by one category.
--
--    0138's body VERBATIM apart from the IdeaCAD count, the declaration it
--    needs, its term in `v_total` and its key in the returned object. The base
--    was diffed against 0138 to confirm nothing else moved: the same gate
--    (`classroom_manages_section`), the same `not_enrolled` refusal, the same
--    four existing counts with the same joins and the same email
--    normalisation, the same single DELETE, and the same success payload.
--
--    IT STILL NEVER PARTIALLY DELETES. Every count is taken before the DELETE,
--    inside one function and therefore one transaction; a nonzero total
--    returns the refusal and writes nothing at all.
--
--    THE NEW COUNT IS SCOPED TO THE SECTION LIKE THE OTHER FOUR, through
--    `classroom_postings`, because the enrollment is: a student in two classes
--    has IdeaCAD work in both, and removing them from one must not be refused
--    by the other's. `classroom_postings` carries `unique (item_id,
--    section_id)`, so the join adds exactly one row per document and cannot
--    multiply the count.
--
--    IT IS EMAIL-KEYED WITH NO uuid BRIDGE. `ideacad_documents.student_email`
--    is an address, exactly as `classroom_responses`, `classroom_submissions`
--    and `classroom_module_approvals` are, so this count needs no
--    `_notebook_user_id_for_email` hop. Only the notebook count does, and that
--    one is left exactly as 0138 wrote it.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_remove_enrollment(
	p_section_id uuid,
	p_student_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_uid uuid := (select auth.uid());
	v_email text := lower(btrim(coalesce(p_student_email, '')));
	v_student_id uuid;
	v_responses integer := 0;
	v_submissions integer := 0;
	v_approvals integer := 0;
	v_entries integer := 0;
	v_ideacad integer := 0;
	v_total integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_section_id is null or not exists (
		select 1 from public.classroom_sections s where s.id = p_section_id
	) then
		raise exception 'That section does not exist.';
	end if;
	if not public.classroom_manages_section(p_section_id) then
		raise exception 'Only the section''s teacher of record or a site admin can manage its roster.';
	end if;

	-- A missing enrollment is a REFUSAL a surface renders, not a raise: two
	-- managers with the page open is ordinary, and the second Remove is a
	-- no-op somebody should be told about rather than an error.
	if not exists (
		select 1 from public.classroom_enrollments e
		where e.section_id = p_section_id and e.student_email = v_email
	) then
		return jsonb_build_object('ok', false, 'reason', 'not_enrolled', 'student_email', v_email);
	end if;

	select count(*) into v_responses
	from public.classroom_responses r
	join public.classroom_postings pg on pg.item_id = r.item_id
	where r.student_email = v_email and pg.section_id = p_section_id;

	select count(*) into v_submissions
	from public.classroom_submissions s
	join public.classroom_postings pg on pg.item_id = s.item_id
	where s.student_email = v_email and pg.section_id = p_section_id;

	select count(*) into v_approvals
	from public.classroom_module_approvals a
	join public.classroom_postings pg on pg.item_id = a.item_id
	where a.student_email = v_email and pg.section_id = p_section_id;

	-- The uuid/email bridge is 0094's, never a second copy of that mapping.
	v_student_id := public._notebook_user_id_for_email(v_email);
	if v_student_id is not null then
		select count(*) into v_entries
		from public.notebook_entries ne
		where ne.student_id = v_student_id and ne.section_id = p_section_id;
	end if;

	-- 0213. The document is the grain: concepts cascade off it and the
	-- prediction is keyed on it, so one row here is one thing `ideacad_roster`
	-- stops being able to list.
	select count(*) into v_ideacad
	from public.ideacad_documents d
	join public.classroom_postings pg on pg.item_id = d.item_id
	where d.student_email = v_email and pg.section_id = p_section_id;

	v_total := v_responses + v_submissions + v_approvals + v_entries + v_ideacad;
	if v_total > 0 then
		return jsonb_build_object(
			'ok', false,
			'reason', 'work_attached',
			'section_id', p_section_id,
			'student_email', v_email,
			'total', v_total,
			'counts', jsonb_build_object(
				'responses', v_responses,
				'submissions', v_submissions,
				'approvals', v_approvals,
				'notebook_entries', v_entries,
				'ideacad_documents', v_ideacad
			)
		);
	end if;

	delete from public.classroom_enrollments e
	where e.section_id = p_section_id and e.student_email = v_email;

	return jsonb_build_object(
		'ok', true,
		'section_id', p_section_id,
		'student_email', v_email
	);
end;
$fn$;

-- THE ROLES ARE NAMED. See the header: `revoke ... from public` alone leaves
-- the direct `anon` grant this project's default privileges write, which is
-- what 0202 had to repair after 0201 used the bare form. `authenticated`
-- alone is granted back, because the browser calls this through PostgREST and
-- nothing else does. This restates 0138's end state rather than changing it.
revoke all on function public.classroom_remove_enrollment(uuid, text)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_remove_enrollment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The self-check. 0131's convention: read the catalog back rather than
--    trust that the statements above ran. Raises, so a partial apply cannot
--    look like a clean one.
--
--    IT ASSERTS THE ACL, NOT THE REVOKE'S VERDICT. A revoke that removed
--    nothing and a revoke that removed the right thing are the same statement
--    from the outside; `has_function_privilege` is what tells them apart.
-- ---------------------------------------------------------------------------

do $check$
declare
	v_arities integer;
	v_src text;
	v_anon boolean;
	v_authed boolean;
begin
	select count(*) into v_arities
	from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_remove_enrollment';
	if v_arities <> 1 then
		raise exception
			'0213: expected exactly one public.classroom_remove_enrollment, found %. A surviving second arity is the signature trap.',
			v_arities;
	end if;

	select p.prosrc into v_src
	from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_remove_enrollment';

	if position('public.ideacad_documents' in v_src) = 0 then
		raise exception '0213: the deployed census does not read public.ideacad_documents.';
	end if;
	-- The QUOTED key, which is the one the client reads. Matching the bare
	-- word would be satisfied by the table reference already asserted above.
	if position('''ideacad_documents''' in v_src) = 0 then
		raise exception '0213: the deployed census returns no ideacad_documents key.';
	end if;
	if position('v_ideacad' in v_src) = 0 then
		raise exception '0213: the deployed census declares no IdeaCAD term.';
	end if;

	-- The four 0138 already counted must still be there. A widening that drops
	-- an existing refusal is worse than the hole it closes.
	if position('public.classroom_responses' in v_src) = 0
		or position('public.classroom_submissions' in v_src) = 0
		or position('public.classroom_module_approvals' in v_src) = 0
		or position('public.notebook_entries' in v_src) = 0 then
		raise exception '0213: one of 0138 own four counts is missing from the deployed census.';
	end if;

	v_anon := has_function_privilege('anon', 'public.classroom_remove_enrollment(uuid, text)', 'execute');
	v_authed := has_function_privilege('authenticated', 'public.classroom_remove_enrollment(uuid, text)', 'execute');
	if v_anon then
		raise exception '0213: anon can execute classroom_remove_enrollment. The revoke did not name the roles.';
	end if;
	if not v_authed then
		raise exception '0213: authenticated cannot execute classroom_remove_enrollment. The grant did not land.';
	end if;

	raise notice '0213: census widened to five categories; one arity; anon false, authenticated true.';
end
$check$;

-- ---------------------------------------------------------------------------
-- 4. What this changes, against the real table, at apply time.
--
--    A widened refusal narrows what can be removed, so somebody should know
--    how many people it newly stands in front of BEFORE they meet one. Named
--    rather than counted, for 0138's reason: a number tells an operator
--    nothing they can act on, and the whole point is that a person has to
--    decide what to do about each of these.
--
--    ONLY THE ROWS WHOSE ANSWER CHANGES ARE REPORTED -- an enrollment with
--    IdeaCAD work AND nothing in the original four. An enrollment that was
--    already refused is not affected by this file and is noise here.
-- ---------------------------------------------------------------------------

do $report$
declare
	v_count integer;
	v_who text;
begin
	select count(*), coalesce(string_agg(
		x.student_email || ' in ' || x.label || ' (' || x.docs || ' IdeaCAD document(s))',
		'; ' order by x.student_email
	), '(none)')
	into v_count, v_who
	from (
		select
			e.student_email,
			s.label,
			(
				select count(*)
				from public.ideacad_documents d
				join public.classroom_postings pg on pg.item_id = d.item_id
				where d.student_email = e.student_email and pg.section_id = e.section_id
			) as docs,
			(
				select count(*)
				from public.classroom_responses r
				join public.classroom_postings pg on pg.item_id = r.item_id
				where r.student_email = e.student_email and pg.section_id = e.section_id
			)
			+ (
				select count(*)
				from public.classroom_submissions sub
				join public.classroom_postings pg on pg.item_id = sub.item_id
				where sub.student_email = e.student_email and pg.section_id = e.section_id
			)
			+ (
				select count(*)
				from public.classroom_module_approvals a
				join public.classroom_postings pg on pg.item_id = a.item_id
				where a.student_email = e.student_email and pg.section_id = e.section_id
			)
			+ coalesce((
				select count(*)
				from public.notebook_entries ne
				where ne.student_id = public._notebook_user_id_for_email(e.student_email)
					and ne.section_id = e.section_id
			), 0) as already
		from public.classroom_enrollments e
		join public.classroom_sections s on s.id = e.section_id
	) x
	where x.docs > 0 and x.already = 0;

	raise notice '0213: % enrollment row(s) are newly refused by this widening -- IdeaCAD work attached and nothing in the original four: %',
		v_count, v_who;
	raise notice '0213: an enrollment already refused by one of the original four is unaffected and is not listed.';
end
$report$;

-- ---------------------------------------------------------------------------
-- 5. VERIFICATION QUERY. Run it in a NEW SQL editor tab after this file has
--    applied. It RETURNS ROWS -- the Supabase editor shows only the last
--    statement's result set and displays no notice or warning at all, so a
--    check written as a raise is a check nobody sees.
--
--    It is safe to leave here as a comment because it is plain SELECT and
--    carries no dollar-quote token; the splitter trap that cost 0194 an apply
--    cycle needs one.
--
--    It NAMES WHAT IT EXAMINED rather than answering a bare count: the arity,
--    the five category names read out of the deployed body one at a time, the
--    four 0138 already had among them, and the two grants.
--
-- select 'arity: exactly one classroom_remove_enrollment' as examined,
--        (select count(*) = 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = 'classroom_remove_enrollment') as ok
-- union all select 'counts classroom_responses (0138)',
--        (select position('public.classroom_responses' in p.prosrc) > 0 from pg_proc p
--          join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = 'classroom_remove_enrollment')
-- union all select 'counts classroom_submissions (0138)',
--        (select position('public.classroom_submissions' in p.prosrc) > 0 from pg_proc p
--          join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = 'classroom_remove_enrollment')
-- union all select 'counts classroom_module_approvals (0138)',
--        (select position('public.classroom_module_approvals' in p.prosrc) > 0 from pg_proc p
--          join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = 'classroom_remove_enrollment')
-- union all select 'counts notebook_entries (0138)',
--        (select position('public.notebook_entries' in p.prosrc) > 0 from pg_proc p
--          join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = 'classroom_remove_enrollment')
-- union all select 'counts ideacad_documents (0213)',
--        (select position('public.ideacad_documents' in p.prosrc) > 0 from pg_proc p
--          join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = 'classroom_remove_enrollment')
-- union all select 'returns an ideacad_documents key (0213)',
--        (select position('ideacad_documents' in p.prosrc) > 0 from pg_proc p
--          join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = 'classroom_remove_enrollment')
-- union all select 'anon CANNOT execute it',
--        not has_function_privilege('anon', 'public.classroom_remove_enrollment(uuid, text)', 'execute')
-- union all select 'authenticated CAN execute it',
--        has_function_privilege('authenticated', 'public.classroom_remove_enrollment(uuid, text)', 'execute');
-- ---------------------------------------------------------------------------
