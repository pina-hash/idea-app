-- 0113_classroom_view_as_body_doc_units.sql
--
-- Apply manually in the Supabase SQL editor, after 0112.
--
-- The view-as student preview is unfaithful to the page it claims to mirror,
-- in two ways that are both visible on a fully migrated backend today. Both
-- trace to ONE cause: `_classroom_item_json` (0085) is a hand-written key list,
-- and two later migrations added columns to `classroom_items` without it.
--
--   * 0108 added `body_doc`, the authored RICH document. The preview never
--     carried it, so `ItemBody` fell through to `docFromPlainText` over the
--     plain-text projection -- and `docText` writes one line per list item
--     while `docFromPlainText` splits on BLANK lines only, so a bulleted list
--     renders as one run-on paragraph. That is the exact symptom the
--     `formatting_dropped` degrade path exists to warn about, reproduced here
--     with nothing dropped and nothing to warn about: the document is stored,
--     the payload simply did not ask for it.
--
--   * 0111 added `unit_id`. The preview never carried it either, so every item
--     read as unfiled and `classGroups` put the whole class in one
--     chronological list under no unit header at all.
--
-- WHAT THIS CHANGES IS WHAT THE PAYLOAD CONTAINS, NEVER WHO MAY READ IT. Both
-- keys come off the SAME `classroom_items` row the function already selected
-- and returned fourteen other columns from; no join is added, no predicate is
-- relaxed, and `_classroom_view_as_guard` (0083's `is_admin()` check, reused by
-- 0099 for the notebook preview) is untouched. The item filter -- posted to
-- this section, LIVE by `_classroom_item_live` (0109) -- is byte-for-byte
-- 0109's.
--
-- EVERY CALLER OF `_classroom_item_json`, checked before recreating it. There
-- are exactly two, both read-only view-as RPCs, both last recreated in 0109 and
-- both left alone here:
--
--   * `classroom_view_as_section(text, uuid)` -- recreated below, for the units
--     half only. Its item aggregate is unchanged.
--   * `classroom_view_as_item(text, uuid, uuid)` -- NOT recreated. It calls the
--     function and returns the result verbatim, so it picks the two new keys up
--     for free the moment this file runs, which fixes the same run-on-paragraph
--     bug on the view-as ITEM page. `normalizeItemRow` reads both keys with an
--     `in`-guard, so nothing has to change client-side for that page.
--
-- Nothing else in the schema references it: it carries no grant (0085 revoked
-- it from `public` and never granted it on), so it is reachable only from
-- inside the two definer functions above.
--
-- ---------------------------------------------------------------------------
-- 1. The item payload gains the two columns it was missing
-- ---------------------------------------------------------------------------
--
-- Adding keys is additive: `normalizeItemRow` distinguishes an ABSENT key from
-- a null one for both of these (`'body_doc' in row`, `'unit_id' in row`), which
-- is what let the preview degrade quietly instead of erroring -- and is also
-- what makes handing it the real values a drop-in.

create or replace function public._classroom_item_json(p_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select jsonb_build_object(
		'id', i.id, 'kind', i.kind, 'title', i.title, 'body', i.body,
		-- 0108. The plain-text `body` above stays exactly where it was: it is
		-- not a fallback for this, it is a real column with real readers (the
		-- announcement CHECK, `itemTitle`'s headline, the home feed), and
		-- `classroom_update_item` keeps the two agreeing by deriving one from
		-- the other. What was wrong was only that the RICH one was never sent.
		'body_doc', i.body_doc,
		-- 0111. On the CANONICAL record, so an item posted to three sections of
		-- one course is filed once and every section's preview agrees.
		'unit_id', i.unit_id,
		'points', i.points, 'due_at', i.due_at, 'category', i.category,
		'author_email', i.author_email, 'author_name', i.author_name,
		'published', i.published, 'pinned', i.pinned, 'sort_order', i.sort_order,
		'first_published_at', i.first_published_at, 'edited_at', i.edited_at,
		'created_at', i.created_at, 'updated_at', i.updated_at,
		'resources', public._classroom_item_resources_json(i.id),
		'attachments', public._classroom_item_attachments_json(i.id)
	)
	from public.classroom_items i where i.id = p_item_id;
$$;

revoke all on function public._classroom_item_json(uuid) from public;

-- ---------------------------------------------------------------------------
-- 2. The section payload gains that course's units
-- ---------------------------------------------------------------------------
--
-- WHY THE UNITS RIDE THE RPC RATHER THAN A CLIENT QUERY. The view-as page
-- deliberately mounts `ClassView` with no `units` prop today, and its comment
-- is right about the reason: an admin-side units query would be the ADMIN'S OWN
-- read rendered under a student's name -- the same rule that keeps check-ins
-- and per-student work off that page. 0099 states the rule generally: a view-as
-- read is ONE admin-gated function, never an assembled query. So the fix is to
-- put the units in the payload the guard already covers.
--
-- Reading them here reveals nothing new either way: `classroom_units` is
-- `grant select to authenticated` under a `using (true)` policy (0111 -- a unit
-- is a name in the shared course catalog, scoped no tighter than the course it
-- belongs to), so the student's own read of this course's units and the admin's
-- are the same rows. The faithfulness argument is what carries this, not a
-- disclosure one.
--
-- Scoped to THIS SECTION'S COURSE, off the section row the guard already
-- resolved, so it cannot widen past the one class being previewed. Ordered the
-- way `sortUnits` orders (manual order first, a unit never placed by hand
-- behind those that were, ties by name) -- the client re-sorts regardless, so
-- this is only so the payload reads sensibly on its own.

create or replace function public.classroom_view_as_section(p_email text, p_section_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_view_as_guard(p_email);
	v_section jsonb;
	v_course_id uuid;
begin
	select jsonb_build_object(
		'id', s.id, 'course_id', s.course_id, 'label', s.label, 'block', s.block,
		'teacher_email', s.teacher_email, 'active', s.active,
		'course', jsonb_build_object('id', c.id, 'code', c.code, 'title', c.title, 'active', c.active)
	), s.course_id into v_section, v_course_id
	from public.classroom_enrollments e
	join public.classroom_sections s on s.id = e.section_id
	join public.classroom_courses c on c.id = s.course_id
	where e.student_email = v_email and e.active and s.id = p_section_id;

	if v_section is null then
		return null;
	end if;

	return jsonb_build_object(
		'section', v_section,
		-- 0109's aggregate, unchanged: posted to this section, and LIVE rather
		-- than merely published, so a scheduled item stays invisible here
		-- exactly as it does for the student.
		'items', coalesce((
			select jsonb_agg(public._classroom_item_json(i.id) || jsonb_build_object(
				'viewed_at', (
					select v.viewed_at from public.classroom_item_views v
					where v.item_id = i.id and v.student_email = v_email
				)
			) order by i.created_at desc)
			from public.classroom_items i
			join public.classroom_postings pg on pg.item_id = i.id
			where pg.section_id = p_section_id
				and public._classroom_item_live(i.published, i.publish_at)
		), '[]'::jsonb),
		'units', coalesce((
			select jsonb_agg(jsonb_build_object(
				'id', u.id, 'course_id', u.course_id,
				'name', u.name, 'sort_order', u.sort_order
			) order by
				case when u.sort_order = 0 then 1 else 0 end, u.sort_order, u.name)
			from public.classroom_units u
			where u.course_id = v_course_id
		), '[]'::jsonb)
	);
end;
$$;

revoke all on function public.classroom_view_as_section(text, uuid) from public;
grant execute on function public.classroom_view_as_section(text, uuid) to authenticated;
