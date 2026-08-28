-- 0142_classroom_course_categories.sql
--
-- THE GRADING-CATEGORY DATALIST'S ONE READ.
--
-- ContentComposer offers a `datalist` of grading categories over the free-text
-- `classroom_items.category` field, scoped to the COURSE and not the section --
-- deliberately, and its own comment says why: "a teacher's vocabulary follows
-- the course rather than one block of it", so two teachers of two blocks of
-- Engineering I converge on one spelling of "Unit Labs" instead of inventing
-- two. The transport behind it (`loadCategorySuggestions`) has never been
-- implemented, so the field on production is a plain text input with nothing
-- offered over it.
--
-- WHY A PLAIN SELECT CANNOT BE THAT TRANSPORT, WHICH IS THE WHOLE REASON THIS
-- FILE EXISTS. `classroom_items` carries the "classroom items readable" policy
-- (0085), which is `classroom_can_read_item(id)`, which is PER SECTION: the
-- caller manages THAT posting's section, or is enrolled in it and the item is
-- live (0109). A client select of `category` joined out to `course_id` is
-- therefore not refused and does not error -- RLS SILENTLY NARROWS it to the
-- caller's own sections and hands back a short list with nothing anywhere
-- saying rows were dropped. A teacher of Period 1 would be offered Period 1's
-- vocabulary while the surface claims to be showing the course's, which is the
-- exact opposite of the intent, arriving as a plausible-looking success. The
-- read has to be widened past RLS, and widening past RLS is a definer function.
--
-- THE GATE IS AN EXISTING PREDICATE AND NOT A NEW ONE. `_classroom_manages_course`
-- (0111) is already "an admin, or the teacher of record of at least one section
-- of this course" -- the same question this function has to ask, written down
-- once, internal (revoked from every role by 0111 and again by 0137's sweep) and
-- reachable only from inside a definer body, which is what this is. No new
-- authority is created here and there is no second statement of the manage rule
-- to drift; if that predicate ever widens, this widens with it.
--
-- IT PROJECTS ONE COLUMN, AND THAT IS THE SAFETY ARGUMENT RATHER THAN A
-- TIDINESS ONE. See the `comment on function` below, which says it on the
-- object itself where the next person to widen it will be standing.
--
-- ONE ROW PER ITEM, NOT PER POSTING. The client ranks these by USE COUNT
-- (`courseCategorySuggestions`), so an item posted to three blocks of one
-- course must contribute its category ONCE -- otherwise a teacher who posts
-- widely outranks a teacher who posts often, for a reason no reader of the
-- list could ever guess. Hence the `exists` rather than a join that multiplies.
--
-- IT DOES NOT RANK, DE-DUPLICATE OR NORMALIZE, ON PURPOSE. Those live in
-- `courseCategorySuggestions` in `src/lib/classroom/classroom.ts`, are already
-- tested there, and a second copy here is the one that stops matching. What
-- comes back is the raw stored spellings, repeats included, because the repeats
-- ARE the ranking signal. The only ordering is a deterministic one (oldest item
-- first, `id` breaking the tie) so that two calls handed the same course see
-- the same first-seen order and the offered list does not reshuffle between
-- two renders; that is determinism, not ranking.
--
-- DRAFTS COUNT. An unpublished item's category is still a category its author
-- chose, and a vocabulary that omitted work in progress would offer a teacher
-- back less than they had already typed. This is a widening past RLS, so it is
-- a decision rather than a side effect: what crosses is the word "Unit Labs",
-- never the draft.
--
-- A COURSE THE CALLER MANAGES NO SECTION OF IS SKIPPED, NOT RAISED ON. The
-- parameter is an array because the composer's scope is every course its
-- currently-checked sections belong to, and one id the caller has no claim on
-- must not cost them the other three. A signed-out caller is refused twice
-- over: `anon` holds no grant, and `_classroom_manages_course` resolves false
-- for a null `auth.uid()` anyway.
--
-- WHAT UNDOES THIS MIGRATION:
--   drop function if exists public.classroom_course_categories(uuid[]);
-- Nothing else is created, altered or dropped. The client transport treats a
-- missing function as "no suggestions" and leaves a working free-text field,
-- so dropping it degrades the datalist and breaks nothing.
--
-- RE-APPLIABLE. The function is dropped at its exact signature first, so a
-- re-paste over a machine that took an earlier draft with a different return
-- type replaces it rather than failing on "cannot change return type".
--
-- THE REVOKE NAMES THE ROLES. This project's default privileges write a DIRECT
-- grant to anon, authenticated and service_role into every new function's
-- proacl at creation time, so `from public` alone would be a narrowing that
-- does nothing and would leave the function callable by `anon`. 0137 was a
-- one-time sweep of what already existed and does not cover anything created
-- after it, so this file revokes for itself.

-- ---------------------------------------------------------------------------
-- 1. The read
-- ---------------------------------------------------------------------------

drop function if exists public.classroom_course_categories(uuid[]);

create function public.classroom_course_categories(p_course_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(
		(
			select jsonb_agg(t.category order by t.created_at, t.id)
			from (
				select i.id, i.category, i.created_at
				from public.classroom_items i
				where i.category is not null
					and exists (
						select 1
						from public.classroom_postings pg
						join public.classroom_sections s on s.id = pg.section_id
						where pg.item_id = i.id
							and s.course_id in (
								select c.course_id
								from unnest(coalesce(p_course_ids, '{}'::uuid[])) as c(course_id)
								where public._classroom_manages_course(c.course_id)
							)
					)
			) t
		),
		'[]'::jsonb
	);
$$;

comment on function public.classroom_course_categories(uuid[]) is
'Raw, unranked grading-category strings for every item posted to any of the given courses, one per ITEM, for the composer''s suggestion datalist.

PROJECTS ONLY `category`. Not a title, not a body, not an author, not an item id, not a section, not a course. This function exists to WIDEN A READ PAST RLS -- `classroom_items` is otherwise gated per section by `classroom_can_read_item` -- so the narrowness of what it returns is the whole safety argument for granting it to every authenticated caller. A second column added here later would inherit a grant nobody re-examined, and would be read by a caller who is allowed to see this course''s vocabulary and was never established as allowed to see anything else about it. If a surface needs more than the word, it needs its own function with its own gate.

Access is per course: an admin, or the teacher of record of at least one section of it (`_classroom_manages_course`, 0111). A course id the caller manages no section of is skipped, never raised on.

Ranking, de-duplication and normalization are the client''s (`courseCategorySuggestions`); the repeats returned here are the ranking signal.';

-- REVOKED FROM THE ROLES THAT ACTUALLY HOLD IT, NOT ONLY FROM `public`.
-- `authenticated` alone: the browser calls this through PostgREST, and an
-- `anon` grant would buy a signed-out caller an empty array and a probe.
revoke all on function public.classroom_course_categories(uuid[])
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_course_categories(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. What this deployment actually holds, and what the grant actually is.
--
-- The ACL is READ BACK rather than assumed: a self-check reporting that the
-- revoke statement ran tells an operator only that the statement ran.
-- ---------------------------------------------------------------------------

do $$
declare
	v_courses integer;
	v_distinct integer;
	v_anon boolean;
	v_authed boolean;
begin
	select count(distinct s.course_id), count(distinct lower(btrim(i.category)))
	into v_courses, v_distinct
	from public.classroom_items i
	join public.classroom_postings pg on pg.item_id = i.id
	join public.classroom_sections s on s.id = pg.section_id
	where i.category is not null;

	raise notice '0142: % course(s) have at least one categorized item, % distinct category spelling(s) across all of them. Those are what the composer datalist can now offer.',
		v_courses, v_distinct;

	v_anon := has_function_privilege('anon', 'public.classroom_course_categories(uuid[])', 'execute');
	v_authed := has_function_privilege('authenticated', 'public.classroom_course_categories(uuid[])', 'execute');

	if v_anon or not v_authed then
		raise exception '0142: grant is wrong -- anon execute=%, authenticated execute=%. Expected false/true.',
			v_anon, v_authed;
	end if;

	raise notice '0142: classroom_course_categories(uuid[]) execute -- anon %, authenticated %.', v_anon, v_authed;
end $$;
