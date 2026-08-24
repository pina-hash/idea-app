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
--   drop function if exists public._foundry_idea_course_code();
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
-- 1. Which course counts as "the IDEA course".
--
-- A HARDCODED CONSTANT IN A ONE-LINE FUNCTION, AND THAT IS A DELIBERATE CHOICE
-- RATHER THAN AN OVERSIGHT. A config table for a single row would need a
-- table, a policy, a write path, an admin surface and a decision about what
-- happens when it is empty -- all to hold one string that changes roughly
-- never. This is the same shape `admin_owner_email()` (0067) uses to pin the
-- owner, for the same reason.
--
-- It is a FUNCTION rather than a literal repeated in two bodies so that the
-- value is stated once and is greppable. Both readers below call it.
--
-- IF IDEA IS EVER TAUGHT UNDER A SECOND COURSE CODE, this is what has to
-- change, and the change is a NEW MIGRATION rather than an edit to this one
-- (migrations are an immutable applied record). Two shapes, depending on what
-- is meant:
--
--   * The code simply CHANGED -- replace this function's body with the new
--     literal. One line, one new file.
--   * IDEA is taught under SEVERAL codes at once -- this function's signature
--     is wrong, because a single student could then hold two matching
--     enrollments and "their class" stops being one value.
--     `_foundry_author_class` would need a rule for choosing between them, and
--     that rule is a decision about meaning, not a tie-break to invent here.
--     Drop both and write them together.
--
-- The literal is UPPERCASE because `classroom_courses.code` carries a CHECK
-- that it equals `upper(btrim(code))`, so a lowercase constant here would match
-- nothing, silently, forever. Section 5 prints what it actually matched in YOUR
-- database rather than leaving that to be discovered later.
-- ---------------------------------------------------------------------------

create or replace function public._foundry_idea_course_code()
returns text
language sql
immutable
set search_path = ''
as $$
	select 'IDEA'::text;
$$;

revoke all on function public._foundry_idea_course_code() from public;

comment on function public._foundry_idea_course_code() is
	'The classroom_courses.code whose enrollments name a Foundry author''s class. '
	'Hardcoded on purpose (see 0132); changing it means a new migration.';

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
-- LEFT that class. Showing it would be showing a class they are not in.
--
-- DETERMINISTIC WHEN THERE ARE SOMEHOW TWO. The enrollment PK is
-- `(section_id, student_email)`, so one student CAN sit in two sections of one
-- course -- unusual, and not forbidden. `order by ... limit 1` means the answer
-- never flickers between page loads. It is a tie-break, not a rule: if holding
-- two IDEA sections becomes normal, see the note in section 1.
--
-- THE LABEL IS THE SECTION'S, NOT THE COURSE'S. Every row this can return is
-- from the same course by construction, so repeating "IDEA" on every card
-- would be noise. `block` is 0082's "block / period display text" and is what a
-- person actually says out loud ("Block 3"); `label` is the roster key
-- ("Period 3", "A") and is the fallback when no block was set.
-- ---------------------------------------------------------------------------

create or replace function public._foundry_author_class(p_owner uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(nullif(btrim(s.block), ''), btrim(s.label))
	from public.classroom_enrollments e
	join public.classroom_sections s on s.id = e.section_id
	join public.classroom_courses c on c.id = s.course_id
	where e.student_email = public._notebook_email_for_user(p_owner)
		and e.active
		and c.code = public._foundry_idea_course_code()
	order by btrim(s.label)
	limit 1;
$$;

revoke all on function public._foundry_author_class(uuid) from public;

comment on function public._foundry_author_class(uuid) is
	'The author''s IDEA-course section label, or null. Private: no grant, called '
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
-- 5. Report what the constant actually matched.
--
-- THE ONE THING THIS FILE CANNOT KNOW IS WHETHER 'IDEA' IS YOUR COURSE CODE.
-- It was chosen without being able to read the production catalog, and a
-- constant that matches nothing fails SILENTLY: every author simply has no
-- class, which is indistinguishable from a roster that has not been imported
-- yet. So the counts are printed at apply time, next to the codes that do
-- exist, and whoever pastes this sees within one screen whether it took.
--
-- Notices only. A course that does not exist yet is a legitimate state -- the
-- roster may be imported next week -- so this reports and does not raise.
-- ---------------------------------------------------------------------------

do $$
declare
	v_code text := public._foundry_idea_course_code();
	v_course_id uuid;
	v_sections integer := 0;
	v_enrollments integer := 0;
	v_apps integer := 0;
	v_with_class integer := 0;
	v_all_codes text;
begin
	select c.id into v_course_id from public.classroom_courses c where c.code = v_code;

	select string_agg(c.code, ', ' order by c.code) into v_all_codes
	from public.classroom_courses c;

	select count(*)::integer into v_apps from public.student_apps;

	if v_course_id is null then
		raise notice '0132: NO COURSE with code %. Every author will project a null class.', v_code;
		raise notice '0132: the codes that DO exist are: %', coalesce(v_all_codes, '(none)');
		raise notice '0132: if IDEA is taught under a different code, fix it in a NEW migration that replaces _foundry_idea_course_code().';
	else
		select count(*)::integer into v_sections
		from public.classroom_sections s where s.course_id = v_course_id;

		select count(*)::integer into v_enrollments
		from public.classroom_enrollments e
		join public.classroom_sections s on s.id = e.section_id
		where s.course_id = v_course_id and e.active;

		select count(*)::integer into v_with_class
		from public.student_apps a
		where public._foundry_author_class(a.owner) is not null;

		raise notice '0132: course % has % section(s) and % active enrollment(s).',
			v_code, v_sections, v_enrollments;
		raise notice '0132: % of % existing Foundry app(s) project a class; the rest are null, which the surfaces render as nothing.',
			v_with_class, v_apps;
	end if;

	raise notice '0132: all course codes present: %', coalesce(v_all_codes, '(none)');
end
$$;
