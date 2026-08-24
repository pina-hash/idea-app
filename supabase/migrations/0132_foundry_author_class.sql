-- 0132_foundry_author_class.sql
--
-- THE AUTHOR'S CLASS ON A FOUNDRY APP, PROJECTED INSIDE THE DEFINER.
--
-- The gallery identifies an app by its author's name and their class. The name
-- was already there (`owner_display_name` / `owner_full_name`, 0130). The class
-- was not, and could not be added from the client, for two independent reasons:
--
--   * `profiles` RLS gives a signed-in student their OWN row and nothing else
--     ("select own profile" is `id = auth.uid()`; all-profiles is `is_teacher()`,
--     which since 0067 means `is_admin()`). A student browsing the gallery
--     cannot read a peer's profile by any path.
--   * `classroom_enrollments` is `student_email = current_user_email() or
--     classroom_manages_section(...)`. Same answer: own rows or a manager's.
--
-- So the projection happens INSIDE these SECURITY DEFINER reads, which already
-- decide who may see which app, and the two tables stay exactly as locked as
-- they are today. Nothing here grants anything to anybody.
--
-- THE ROSTER IS THE SOURCE, NOT `profiles.section_id`. That column exists and
-- would have been far easier to read -- it is on the row these functions
-- already join. It is deliberately NOT used here: 0003 added it as a value the
-- student SELF-SELECTS, free-form text, "intentionally not a FK", validated by
-- nothing. Rendering it under a published app would present a student's own
-- claim about themselves as a roster fact. `classroom_enrollments` is imported
-- and maintained by staff, and is the only authoritative answer to "whose class
-- is this student in".
--
-- NULL IS A NORMAL ANSWER AND THE SURFACES MUST RENDER NOTHING FOR IT. An app
-- outlives an enrollment, a roster import lags a term, a student transfers, an
-- alumnus keeps a published app. Every one of those is a real state, not an
-- error, and none of them is a reason to invent a label.
--
-- WHAT UNDOES THIS FILE:
--
--   drop function if exists public.foundry_list_apps(uuid, boolean, boolean);
--   drop function if exists public._foundry_author_class(uuid);
--   drop function if exists public._foundry_is_idea_course(text);
--   -- then re-run 0130's definitions of foundry_list_apps and foundry_get_app
--   -- verbatim; both are `create or replace` reads and carry no state.
--
-- Nothing here writes a row, drops a column, or changes a policy, so an undo
-- costs a re-paste of two function bodies and loses no data.
--
-- Apply manually in the Supabase SQL editor, after 0131.
-- (`supabase db push` is not usable on this project: the remote has no
-- migration history table, so it plans all 132 local files.)

-- ---------------------------------------------------------------------------
-- 1. Which courses count as "an IDEA course".
--
-- A PREDICATE OVER THE CODE, NOT A PINNED CONSTANT, AND THE CONSTANT IS WHAT
-- THIS FILE GOT WRONG BEFORE IT WAS APPLIED ANYWHERE. It pinned the literal
-- 'IDEA'. Production holds exactly two courses -- 'IDEA209H' (Engineering I
-- Honors) and 'IDEA 100' (Intro to IDEA), both active -- so the constant
-- matched NEITHER, and matching nothing fails silently: every author projects
-- null and the gallery shows no class for anybody, which is indistinguishable
-- from a roster that has not been imported yet.
--
-- THE PREDICATE: the code, uppercased and with every whitespace character
-- removed, begins with IDEA.
--
--   * UPPERCASED is belt and braces. `classroom_courses.code` carries a CHECK
--     that it equals `upper(btrim(code))`, so a stored code is already upper --
--     but this function takes TEXT, not a row, and a caller passing a raw
--     string should not get a silently different answer from the same value
--     read out of the column.
--   * WHITESPACE REMOVED is load-bearing rather than tidy: 'IDEA 100' has a
--     space INSIDE it, which `btrim` does not touch and the column's CHECK does
--     not forbid. A bare `like 'IDEA%'` would happen to match that one anyway,
--     but only by luck of where the space fell; stripping it means the
--     predicate answers the same for 'IDEA 100', 'IDEA100' and ' IDEA 100 '.
--   * BEGINS WITH is what makes the A-G course numbers free. IDEA210, IDEA305,
--     IDEA306 and IDEA404 all match the day somebody creates them, with no
--     second migration and no edit here.
--
-- WHAT WOULD BREAK IT: an IDEA course whose code does not START with IDEA.
-- Name it 'ENGR209H', or 'HON-IDEA-209', and its enrollments stop counting as
-- IDEA enrollments -- silently, exactly the way the constant did, because a
-- student simply projects null. That is the one shape to check before adding a
-- course, and section 5 prints the codes the predicate actually matched in YOUR
-- database, so the answer is on screen at apply time rather than discovered on
-- the gallery later.
--
-- THE OTHER DIRECTION IS LOOSER THAN A LIST OF CODES WOULD BE, and it is worth
-- saying out loud: a code that merely STARTS with those four letters and is not
-- an IDEA course -- 'IDEALART' -- would match. No such code exists, the prefix
-- is a school-wide naming convention rather than a coincidence, and the
-- alternative (a list of exact codes) is the thing that goes stale every time
-- the A-G work adds a number. If a non-IDEA course ever wants that prefix, this
-- predicate tightens in a new migration.
--
-- IMMUTABLE and pure: it names no table and reads no row, so it can sit in a
-- join predicate without costing a lookup.
-- ---------------------------------------------------------------------------

-- The pinned constant this replaces. DROPPED rather than left beside its
-- replacement: this file has never been applied to production, but it HAS been
-- applied to local stacks, and a dead second statement of "which course is the
-- IDEA course" is exactly the copy that stops agreeing with the live one.
drop function if exists public._foundry_idea_course_code();

create or replace function public._foundry_is_idea_course(p_code text)
returns boolean
language sql
immutable
set search_path = ''
as $$
	select regexp_replace(upper(coalesce(p_code, '')), '\s', '', 'g') like 'IDEA%';
$$;

revoke all on function public._foundry_is_idea_course(text) from public;

comment on function public._foundry_is_idea_course(text) is
	'True when a classroom_courses.code names an IDEA course: uppercased and '
	'whitespace-stripped, it begins with IDEA. Covers IDEA209H and IDEA 100 '
	'today and every IDEAnnn added later. See 0132.';

-- ---------------------------------------------------------------------------
-- 2. uuid -> class label, or null.
--
-- THE BRIDGE IS `_notebook_email_for_user`, WHICH IS THE SANCTIONED ONE.
-- `student_apps.owner` is a uuid; `classroom_enrollments` is keyed by email,
-- because a roster is imported before anyone signs in. 0094 added exactly two
-- no-grant helpers to cross that gap and said why a VIEW is refused: a view
-- mapping emails to account ids needs a SELECT grant, and any grant on that
-- mapping hands every signed-in student the school's address book keyed to
-- user ids. This calls the existing helper rather than adding a third.
--
-- ITS NAME SAYS `_notebook_` AND IT IS BEING CALLED FROM FOUNDRY. That is not
-- a mistake and it is not worth renaming: it is a pure `uuid -> lowercased
-- email` lookup with no notebook in it, and CLAUDE.md's rule about renaming a
-- misleading function is a last resort for a name that says the WRONG thing,
-- not a prefix that says where it was born. Copying it under a `_foundry_`
-- prefix would be a second implementation of the one mapping this codebase is
-- most careful about.
--
-- PRIVATE, WITH NO GRANT, like the helper it calls. It is reachable only from
-- the two definers below. A grant here would let any signed-in caller ask for
-- any account's class, which is the disclosure the whole arrangement avoids.
--
-- ONLY `active` ENROLLMENTS. 0082 soft-deletes a roster row by clearing
-- `active` rather than deleting it, so an inactive row is a student who has
-- LEFT that class. Showing it would be showing a class they are not in. Note
-- that this is a FILTER, while the COURSE's own `active` below is only a
-- PREFERENCE: a roster row says whether this student is still in the class,
-- where a course being retired says nothing about whether they were in it.
--
-- IT PROJECTS THE COURSE TITLE, NOT THE SECTION LABEL AND NOT THE BLOCK. Once
-- more than one IDEA course can match, "Block 3" is ambiguous as well as
-- internal: it is scheduling, it tells a viewer nothing, and two different IDEA
-- courses each have one. 'Engineering I Honors' is what somebody browsing a
-- gallery can actually do something with. `btrim` because 0082's CHECK
-- constrains the TRIMMED length rather than the stored value.
--
-- A STUDENT MAY HOLD MORE THAN ONE IDEA ENROLLMENT -- which is exactly what the
-- single-course premise got wrong -- so the resolution is a TOTAL ORDER and the
-- same student always yields the same answer. Every key, in order, with why it
-- is where it is:
--
--   1. `c.active desc` -- PREFER A LIVE COURSE. A student carrying both a
--      retired IDEA course and a current one is described by the current one.
--      `active` is NOT NULL, so `desc` puts true first with no NULLS clause to
--      get wrong.
--   2. `e.created_at desc` -- THE MOST RECENT ENROLLMENT, by the enrollment's
--      OWN timestamp. `created_at` and NOT `updated_at`:
--      `classroom_set_enrollment` upserts on the PK and stamps
--      `updated_at = now()` on every write, so re-importing last year's roster
--      file would make last year's class look like the newest one.
--      `created_at` is when this student joined this roster, and never moves.
--   3. `s.created_at desc` -- THE SECTION'S, as the fallback, and it is
--      genuinely load-bearing rather than defensive. `now()` is TRANSACTION
--      time and `classroom_import_roster` creates a whole file's enrollments in
--      one transaction, so two enrollments made by one import tie EXACTLY on
--      key 2. The more recently created section is the newer class.
--      (A `coalesce` onto the section would have been the wrong shape:
--      `e.created_at` is NOT NULL with a default, so it could never fire, and
--      would read as a guard while guarding nothing.)
--   4. `s.id` -- THE ABSOLUTE TIEBREAK, and what makes the order TOTAL rather
--      than merely usually-decisive. Two sections of two different IDEA
--      courses, both active, both created in one transaction, tie on all three
--      keys above; a uuid cannot tie, because the enrollment PK is
--      `(section_id, student_email)` and the email is fixed here, so every
--      candidate row carries a distinct `section_id`. Arbitrary, but STABLE,
--      which is the whole requirement: a card must not change its class between
--      two page loads.
-- ---------------------------------------------------------------------------

create or replace function public._foundry_author_class(p_owner uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
	select btrim(c.title)
	from public.classroom_enrollments e
	join public.classroom_sections s on s.id = e.section_id
	join public.classroom_courses c on c.id = s.course_id
	where e.student_email = public._notebook_email_for_user(p_owner)
		and e.active
		and public._foundry_is_idea_course(c.code)
	order by c.active desc, e.created_at desc, s.created_at desc, s.id
	limit 1;
$$;

revoke all on function public._foundry_author_class(uuid) from public;

comment on function public._foundry_author_class(uuid) is
	'The title of the author''s IDEA course, or null. Private: no grant, called '
	'only from foundry_list_apps and foundry_get_app.';

-- ---------------------------------------------------------------------------
-- 3. foundry_list_apps, dropped and recreated.
--
-- A `returns table` function's shape is part of its identity, so adding a
-- column is a DROP and a CREATE rather than a `create or replace` -- Postgres
-- refuses to replace with a different return type. That is also why this is
-- the one thing in this file that is briefly destructive: between the drop and
-- the create the function does not exist. It is a read, so nothing is lost;
-- but it is the reason this migration is applied BEFORE any client that names
-- the new column is deployed (the deploy-ordering rule).
--
-- The body is 0130's, unchanged except for the new column. It is restated in
-- full because that is what recreating a function means, not because anything
-- else about it moved.
-- ---------------------------------------------------------------------------

drop function if exists public.foundry_list_apps(uuid, boolean, boolean);

create or replace function public.foundry_list_apps(
	p_owner uuid default null,
	p_include_hidden boolean default false,
	p_include_unpublished boolean default false
)
returns table (
	id uuid,
	slug text,
	title text,
	tagline text,
	description text,
	cover_path text,
	build_notes text,
	owner uuid,
	owner_display_name text,
	owner_full_name text,
	owner_class text,
	published_version_id uuid,
	published_ordinal integer,
	version_count integer,
	submitted_version_id uuid,
	metadata_flagged_at timestamptz,
	hidden_at timestamptz,
	created_at timestamptz,
	updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
	select
		a.id, a.slug, a.title, a.tagline, a.description, a.cover_path, a.build_notes,
		a.owner, p.display_name, p.full_name,
		public._foundry_author_class(a.owner),
		a.published_version_id,
		(select pv.ordinal from public.student_app_versions pv where pv.id = a.published_version_id),
		(select count(*)::integer from public.student_app_versions v where v.app_id = a.id),
		-- The review trail is the owner's and the staff's. Everyone else gets
		-- null here rather than a hint that something is sitting in the queue.
		case
			when a.owner = (select auth.uid()) or public.is_admin() then (
				select sv.id from public.student_app_versions sv
				where sv.app_id = a.id and sv.status = 'submitted'
			)
		end,
		a.metadata_flagged_at, a.hidden_at, a.created_at, a.updated_at
	from public.student_apps a
	left join public.profiles p on p.id = a.owner
	where (select auth.uid()) is not null
		and public._foundry_app_in_population(
			a.owner, a.hidden_at, a.published_version_id,
			p_include_hidden, p_include_unpublished
		)
		and (p_owner is null or a.owner = p_owner)
	order by a.updated_at desc, a.created_at desc;
$$;

revoke all on function public.foundry_list_apps(uuid, boolean, boolean) from public;
grant execute on function public.foundry_list_apps(uuid, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. foundry_get_app gains one JSON key.
--
-- A jsonb return has no declared shape, so this is a plain `create or replace`
-- with the same signature and no drop -- and therefore none of the signature
-- trap: there is no second overload to leave behind.
--
-- The body is 0130's with `owner_class` added beside `owner_display_name`.
-- ---------------------------------------------------------------------------

create or replace function public.foundry_get_app(
	p_slug text,
	p_include_hidden boolean default false,
	p_include_unpublished boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_slug text := lower(public._foundry_norm(p_slug));
	v_app record;
	v_privileged boolean;
	v_versions jsonb;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select a.*, p.display_name as owner_display_name, p.full_name as owner_full_name
	into v_app
	from public.student_apps a
	left join public.profiles p on p.id = a.owner
	where a.slug = v_slug
		and public._foundry_app_in_population(
			a.owner, a.hidden_at, a.published_version_id,
			p_include_hidden, p_include_unpublished
		);

	if not found then
		return null;
	end if;

	v_privileged := (v_app.owner = v_uid) or public.is_admin();

	select coalesce(jsonb_agg(rows.payload order by rows.ordinal desc), '[]'::jsonb)
	into v_versions
	from (
		select v.ordinal, jsonb_build_object(
			'id', v.id,
			'ordinal', v.ordinal,
			'status', v.status,
			'manifest', v.manifest,
			'byte_size', v.byte_size,
			'file_count', v.file_count,
			'created_at', v.created_at,
			-- The zip and the review trail are privileged. A reader of a
			-- published app gets the build, never the paperwork around it.
			'zip_path', case when v_privileged then v.zip_path end,
			'reviewed_by', case when v_privileged then v.reviewed_by end,
			'reviewed_at', case when v_privileged then v.reviewed_at end,
			'review_note', case when v_privileged then v.review_note end,
			'reject_reason', case when v_privileged then v.reject_reason end
		) as payload
		from public.student_app_versions v
		where v.app_id = v_app.id
			and (v_privileged or v.id = v_app.published_version_id)
	) rows;

	return jsonb_build_object(
		'id', v_app.id,
		'slug', v_app.slug,
		'title', v_app.title,
		'tagline', v_app.tagline,
		'description', v_app.description,
		'cover_path', v_app.cover_path,
		'build_notes', v_app.build_notes,
		'owner', v_app.owner,
		'owner_display_name', v_app.owner_display_name,
		'owner_full_name', v_app.owner_full_name,
		'owner_class', public._foundry_author_class(v_app.owner),
		'published_version_id', v_app.published_version_id,
		'metadata_flagged_at', v_app.metadata_flagged_at,
		'hidden_at', v_app.hidden_at,
		'created_at', v_app.created_at,
		'updated_at', v_app.updated_at,
		'versions', v_versions
	);
end;
$$;

revoke all on function public.foundry_get_app(text, boolean, boolean) from public;
grant execute on function public.foundry_get_app(text, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Report which courses the predicate actually matched.
--
-- THE ONE THING THIS FILE CANNOT KNOW IS WHICH COURSES EXIST IN YOUR DATABASE,
-- and a predicate that matches nothing fails SILENTLY: every author simply has
-- no class, which is indistinguishable from a roster that has not been imported
-- yet. That is not hypothetical -- the pinned constant this file used to carry
-- was exactly that failure, and it was caught by reading the catalog rather
-- than by anything on screen. So the matched codes and the counts are printed
-- at apply time, next to the codes that did NOT match, and whoever pastes this
-- sees within one screen whether it took.
--
-- Notices only. No IDEA course yet is a legitimate state -- the roster may be
-- imported next week -- so this reports and does not raise.
-- ---------------------------------------------------------------------------

do $$
declare
	v_matched text;
	v_unmatched text;
	v_courses integer := 0;
	v_sections integer := 0;
	v_enrollments integer := 0;
	v_apps integer := 0;
	v_with_class integer := 0;
begin
	select
		count(*) filter (where public._foundry_is_idea_course(c.code))::integer,
		string_agg(c.code || ' (' || c.title || case when c.active then '' else ', INACTIVE' end || ')',
			', ' order by c.code) filter (where public._foundry_is_idea_course(c.code)),
		string_agg(c.code, ', ' order by c.code) filter (where not public._foundry_is_idea_course(c.code))
	into v_courses, v_matched, v_unmatched
	from public.classroom_courses c;

	select count(*)::integer into v_apps from public.student_apps;

	select count(*)::integer into v_with_class
	from public.student_apps a
	where public._foundry_author_class(a.owner) is not null;

	if v_courses = 0 then
		raise notice '0132: NO COURSE code begins with IDEA. Every author will project a null class.';
		raise notice '0132: the codes that DO exist are: %', coalesce(v_unmatched, '(none)');
		raise notice '0132: an IDEA course whose code does not START with IDEA is what breaks this. Rename it, or tighten the predicate in a NEW migration.';
	else
		select count(*)::integer into v_sections
		from public.classroom_sections s
		join public.classroom_courses c on c.id = s.course_id
		where public._foundry_is_idea_course(c.code);

		select count(*)::integer into v_enrollments
		from public.classroom_enrollments e
		join public.classroom_sections s on s.id = e.section_id
		join public.classroom_courses c on c.id = s.course_id
		where public._foundry_is_idea_course(c.code) and e.active;

		raise notice '0132: % IDEA course(s) matched: %', v_courses, v_matched;
		raise notice '0132: they hold % section(s) and % active enrollment(s).', v_sections, v_enrollments;
		raise notice '0132: % of % existing Foundry app(s) project a class; the rest are null, which the surfaces render as nothing.',
			v_with_class, v_apps;
	end if;

	raise notice '0132: course codes that did NOT match: %', coalesce(v_unmatched, '(none)');
end
$$;
