-- 0136_classroom_manager_exclusion_and_enrollment_removal.sql
--
-- TWO THINGS, AND THEY ARE THE TWO HALVES OF ONE DEFECT.
--
-- An instructor with an enrollment row in their own section rendered as a
-- STUDENT: a name on the check-in grid with a LEFT badge and a row of cells
-- nobody can check, a row in the grading roster, a line in the FACTS CSV, and
-- one more head in the Grades tab denominator. Nothing anywhere could remove
-- that row, because `classroom_set_enrollment` (0082) writes an `active` flag
-- and no enrollment DELETE path has ever existed -- the table carries a SELECT
-- grant and nothing else, and no migration to date names `delete from
-- public.classroom_enrollments`.
--
-- SO: the display is fixed by EXCLUSION (a manager is never a student row,
-- whatever their enrollment says), and the data is fixed by a BOUNDED REMOVAL
-- (an enrollment with nothing hanging off it can be deleted; one with work
-- attached is refused with the counts, never partially deleted).
--
-- THE EXCLUSION NEEDED A PREDICATE THAT DID NOT EXIST, AND THE ANSWER IS TO
-- GENERALIZE THE ONE THAT DID, NOT TO WRITE A SECOND. `classroom_manages_section`
-- (0082) asks about the CALLER; the question here is about a THIRD PARTY'S
-- email. Section 1 lifts the rule into an email-scoped function and turns the
-- caller-scoped one into a thin wrapper over it, so there is still exactly ONE
-- statement of "who manages a section" and every one of the ~90 applied
-- references keeps resolving the same name to the same signature. `is_admin()`
-- gets the identical treatment for the identical reason: the manage rule
-- contains the admin rule, and restating "who is an admin" inside it would be
-- the second copy this file exists to avoid.
--
-- WHAT UNDOES THIS MIGRATION. Re-paste 0067's `is_admin()` and 0082's
-- `classroom_manages_section` bodies over the wrappers, re-paste 0118's
-- `_notebook_section_roster` over section 3, then
-- `drop function if exists public.classroom_section_roster(uuid);` and
-- `drop function if exists public.classroom_remove_enrollment(uuid, text);`.
-- Nothing here drops a column, a table or a row, and the two private helpers
-- may be left in place harmlessly.
--
-- RE-APPLIABLE. Every definition is `create or replace`, and the two functions
-- whose RESULT SHAPE is new are dropped at their exact signature first (a
-- `returns table` cannot be replaced with a different column list, which is
-- what a re-paste over a half-applied earlier draft would hit).

-- ---------------------------------------------------------------------------
-- 1. ONE definition of "who manages this", asked of an EMAIL.
--
-- Both wrappers below are semantics-preserving by construction, and the
-- signed-out case is the one worth stating: `current_user_email()` (0067)
-- returns the EMPTY STRING and not null when `auth.uid()` is null, so both
-- helpers refuse '' explicitly. That is what reproduces `is_admin()`'s own
-- `when auth.uid() is null then false` guard through the new shape.
-- ---------------------------------------------------------------------------

-- Is this ADDRESS an admin? The owner is pinned unconditionally, exactly as
-- 0067 has it -- table or no table, row or no row.
create or replace function public._admin_is_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select case
		when coalesce(btrim(p_email), '') = '' then false
		when lower(btrim(p_email)) = public.admin_owner_email() then true
		else exists (
			select 1 from public.app_admins a where a.email = lower(btrim(p_email))
		)
	end;
$$;

revoke all on function public._admin_is_email(text) from public;

-- 0067's is_admin(), now a caller-scoped reading of the rule above. The body
-- is replaced; the NAME, the signature and therefore every policy that
-- resolves it are untouched.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select case
		when (select auth.uid()) is null then false
		else public._admin_is_email(public.current_user_email())
	end;
$$;

grant execute on function public.is_admin() to authenticated;

-- Can this ADDRESS manage this section? Teacher of record, or an admin.
-- The section half is deliberately not filtered on `s.active`: an archived
-- class still has a teacher of record, and a manager of an archived section is
-- still not one of its students.
create or replace function public._classroom_manages_section_email(
	p_section_id uuid,
	p_email text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select case
		when coalesce(btrim(p_email), '') = '' then false
		when public._admin_is_email(p_email) then true
		when p_section_id is null then false
		else exists (
			select 1 from public.classroom_sections s
			where s.id = p_section_id
				and s.teacher_email = lower(btrim(p_email))
		)
	end;
$$;

revoke all on function public._classroom_manages_section_email(uuid, text) from public;
grant execute on function public._classroom_manages_section_email(uuid, text) to authenticated;

-- 0082's classroom_manages_section, now a thin wrapper. Same name, same
-- signature, same answers.
create or replace function public.classroom_manages_section(p_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select public._classroom_manages_section_email(p_section_id, public.current_user_email());
$$;

revoke all on function public.classroom_manages_section(uuid) from public;
grant execute on function public.classroom_manages_section(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The check-in grid's roster: managers excluded at the source.
--
-- 0118's definition VERBATIM apart from two `not ...` clauses, one per branch,
-- and the base was diffed against 0118 to confirm nothing else moved.
--
-- BOTH BRANCHES NEED IT, and only one of them is obvious. `enrolled` is the
-- roster row itself. `holders` is the branch that kept the instructor visible
-- AFTER a deactivation: it puts back anyone with submitted entries or excusals
-- in the section, flagged `enrolled: false`, which is precisely the LEFT badge
-- on the row this bundle exists to remove. Deactivating never touched it, and
-- neither would a deletion.
--
-- A HOLDER WITH NO EMAIL IS KEPT. `_notebook_email_for_user` answers null for
-- an account with no address, `_classroom_manages_section_email(_, null)` is
-- false, and `not false` keeps the row -- so the fail-open direction here is
-- "stays a student", which is the one that loses no work.
-- ---------------------------------------------------------------------------

create or replace function public._notebook_section_roster(p_section_id uuid)
returns table (
	student_key text,
	student_id uuid,
	email text,
	name text,
	enrolled boolean
)
language sql
stable
security definer
set search_path = ''
as $$
	with enrolled as (
		select
			ce.student_email as email,
			ce.display_name as roster_name,
			public._notebook_user_id_for_email(ce.student_email) as student_id
		from public.classroom_enrollments ce
		where ce.section_id = p_section_id
			and ce.active
			and not public._classroom_manages_section_email(p_section_id, ce.student_email)
	),
	holders as (
		select
			p.id as student_id,
			public._notebook_email_for_user(p.id) as email
		from public.profiles p
		where exists (
				select 1 from public.notebook_entries e
				where e.student_id = p.id
					and e.section_id = p_section_id
					and e.deleted_at is null
					and e.submitted_at is not null
			)
			or exists (
				select 1
				from public.notebook_session_excusals x
				join public.notebook_session_postings pg on pg.session_id = x.session_id
				where x.student_id = p.id and pg.section_id = p_section_id
			)
	),
	combined as (
		select e.email, e.student_id, e.roster_name, true as enrolled
		from enrolled e
		union all
		select h.email, h.student_id, null::text as roster_name, false as enrolled
		from holders h
		where not exists (
			select 1 from enrolled e
			where e.student_id = h.student_id
				or (h.email is not null and e.email = h.email)
		)
			and not public._classroom_manages_section_email(p_section_id, h.email)
	)
	select
		coalesce(c.email, c.student_id::text) as student_key,
		c.student_id,
		coalesce(c.email, p.email) as email,
		coalesce(
			nullif(btrim(c.roster_name), ''),
			nullif(btrim(p.display_name), ''),
			nullif(btrim(p.full_name), ''),
			c.email,
			p.email,
			'Student'
		) as name,
		c.enrolled
	from combined c
	left join public.profiles p on p.id = c.student_id;
$$;

revoke all on function public._notebook_section_roster(uuid) from public;

-- ---------------------------------------------------------------------------
-- 3. The roster read every CLASSROOM surface builds its student list from.
--
-- It returns the enrollment rows a manager could already read straight off the
-- table -- same columns, same rows -- with ONE column added: whether that
-- person can manage the section they are enrolled in. The client never
-- re-derives that, and could not: admin-ness is keyed on `app_admins`, which is
-- admin-only readable, so a browser has no way to ask.
--
-- IT PROJECTS THE FLAG RATHER THAN FILTERING. The People tab has to SHOW the
-- manager row -- it is the row somebody has come there to remove -- while the
-- grading console, the FACTS export and the Grades denominator have to drop it.
-- One read, one flag, and each surface states its own intent.
--
-- NULL SECTION = every section the caller manages, which is what the home feed
-- needs to keep a manager's own submission out of its to-grade count. The gate
-- is `classroom_manages_section` per row, so a student calling this gets
-- nothing at all rather than their own row: this is a management read.
--
-- IT DISCLOSES NOTHING NEW. Every address it returns is on a roster the caller
-- already reads, and the flag is computed inside the definer -- there is no
-- parameter through which the admin roster can be enumerated.
-- ---------------------------------------------------------------------------

drop function if exists public.classroom_section_roster(uuid);

create or replace function public.classroom_section_roster(p_section_id uuid default null)
returns table (
	section_id uuid,
	student_email text,
	display_name text,
	active boolean,
	updated_at timestamptz,
	manages boolean
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
		public._classroom_manages_section_email(e.section_id, e.student_email) as manages
	from public.classroom_enrollments e
	where (p_section_id is null or e.section_id = p_section_id)
		and public.classroom_manages_section(e.section_id)
	order by e.display_name, e.student_email;
$$;

revoke all on function public.classroom_section_roster(uuid) from public;
grant execute on function public.classroom_section_roster(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Removing an enrollment, and only when there is nothing to strand.
--
-- THE TABLE STILL HAS NO DELETE GRANT AND NO WRITE POLICY (0082 grants SELECT
-- and nothing else). This function is SECURITY DEFINER and is therefore the
-- only path there is; adding a grant or a policy is what would open a second
-- one.
--
-- THE GATE IS THE EXISTING ONE. `classroom_manages_section` is teacher of
-- record or admin, which is the same gate `classroom_set_enrollment` and
-- `classroom_update_enrollment` already use. No new authority is created here.
--
-- WHAT COUNTS AS ATTACHED, and why each one. A row here is scoped to the
-- SECTION, through `classroom_postings`, because the enrollment is: a student
-- in two classes has work in both, and removing them from one must not be
-- refused by the other's.
--   * classroom_responses      -- answers typed into an assignment
--   * classroom_submissions    -- a hand-in, with its files cascading off it
--   * classroom_module_approvals -- an instructor's sign-off on their work
--   * notebook_entries         -- entries filed against this section, and
--     DELIBERATELY WITHOUT `deleted_at is null`. 0116/0117 make a soft-deleted
--     entry RESTORABLE, so an entry in the bin is work somebody can still get
--     back, and deleting the enrollment out from under it is exactly the
--     stranding this check exists to prevent.
--
-- Notebook EXCUSALS are not counted: an excusal is a staff annotation about a
-- session, keyed (session_id, student_id), and it neither belongs to the
-- enrollment nor becomes unreadable without it. If that judgement is ever
-- revisited the answer is another count in this list, not a second RPC.
--
-- IT NEVER PARTIALLY DELETES. Every count is taken before the single DELETE
-- statement, inside one function and therefore one transaction; a nonzero
-- total returns the refusal and writes nothing at all.
-- ---------------------------------------------------------------------------

drop function if exists public.classroom_remove_enrollment(uuid, text);

create or replace function public.classroom_remove_enrollment(
	p_section_id uuid,
	p_student_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_email text := lower(btrim(coalesce(p_student_email, '')));
	v_student_id uuid;
	v_responses integer := 0;
	v_submissions integer := 0;
	v_approvals integer := 0;
	v_entries integer := 0;
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

	v_total := v_responses + v_submissions + v_approvals + v_entries;
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
				'notebook_entries', v_entries
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
$$;

revoke all on function public.classroom_remove_enrollment(uuid, text) from public;
grant execute on function public.classroom_remove_enrollment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. What this changed, against the real table, at apply time.
--
-- Named rather than counted: "3 rows" tells an operator nothing they can act
-- on, and the whole point of the bundle is that somebody has to decide what to
-- do with each of these people.
-- ---------------------------------------------------------------------------

do $$
declare
	v_count integer;
	v_who text;
begin
	select count(*), coalesce(string_agg(
		e.student_email || ' in ' || s.label || ' (teacher of record: ' || s.teacher_email || ')',
		'; ' order by e.student_email
	), '(none)')
	into v_count, v_who
	from public.classroom_enrollments e
	join public.classroom_sections s on s.id = e.section_id
	where public._classroom_manages_section_email(e.section_id, e.student_email);

	raise notice '0136: % enrollment row(s) belong to somebody who can manage that section. They no longer render as students anywhere: %',
		v_count, v_who;
	raise notice '0136: each of those can now be removed outright from the class People tab, or will be refused with the counts if work is attached to it.';
end $$;
