-- 0187_classroom_duplicate_drafts.sql
--
-- THE COUNT NOBODY HAS. Read only: this file COUNTS and LISTS. It deletes
-- nothing, it updates nothing, and it creates no write path of any kind.
--
-- ---------------------------------------------------------------------------
-- WHY THERE IS A FUNCTION HERE AT ALL
-- ---------------------------------------------------------------------------
--
-- Prompt 0061 fixed the two mechanisms that made `Save draft` write a new row
-- instead of updating one, and said plainly that production almost certainly
-- holds surplus copies whose number is UNKNOWN, because no cloud session can
-- reach the database. 0073 proved that is permanent. So the count has to come
-- through the app.
--
-- The obvious cheaper answer is to skip the migration and count in the browser
-- off the existing grants: `classroom_items` and every child table below carry
-- `grant select ... to authenticated`, so a client CAN read them. That answer
-- is REFUSED, and the reason is not tidiness -- it is that the client-visible
-- counts under-report in the UNSAFE direction.
--
--   `classroom_submissions` and `classroom_responses` are readable under
--   "own row or reviewer", and reviewer is `classroom_can_review_submission`,
--   which requires the student to have an ENROLLMENT ROW in a section the
--   caller manages:
--
--       from classroom_postings pg
--       join classroom_enrollments e on e.section_id = pg.section_id
--       where pg.item_id = ... and e.student_email = ...
--         and classroom_manages_section(pg.section_id)
--
--   A hand-in whose author is NOT on the roster therefore satisfies neither
--   arm, so it is invisible to the teacher through RLS. Work arriving with no
--   enrollment behind it is a documented, ordinary state in this codebase --
--   `splitRoster`'s off-roster list exists to report exactly it (0138) -- and
--   a roster import that changes an address produces it too.
--
--   A browser counting `classroom_submissions` for such an item reads ZERO,
--   the surface calls the row a surplus copy, and the delete cascades a
--   student's hand-in and its files away. That is 0061's own trap
--   ("anything with student work attached is not a surplus copy whatever it
--   looks like") arriving through the read policy rather than through the
--   grouping.
--
-- So the counting happens inside a SECURITY DEFINER function, where the count
-- is the number of rows that EXIST rather than the number the caller may read,
-- and the caller is handed a decision instead of a set of rows to re-derive
-- one from.
--
-- ---------------------------------------------------------------------------
-- WHAT COUNTS AS A SURPLUS COPY
-- ---------------------------------------------------------------------------
--
-- 0061's history entry is the specification and this is that query, moved
-- inside a function with three corrections the tree forced:
--
--   * GROUPED BY (author_email, kind, title, body) over `published = false`,
--     oldest kept. Unchanged. `published = false` is unambiguously a DRAFT:
--     a SCHEDULED item is `published = true` with a future `publish_at`
--     (0109), so no publish_at term is needed and none is written.
--
--   * POSTINGS DO NOT DISQUALIFY A ROW, and 0061's safety query listing them
--     beside the other five reads as though they do.
--     `_classroom_check_publish_targets` (0082) RAISES on an empty section
--     list, so EVERY item -- draft included -- has at least one posting by
--     construction. Treating `postings > 0` as "something hangs off this"
--     would make every row unremovable and the surface useless. The posting
--     count is projected because a reader wants to see it; it is not a
--     blocker.
--
--   * THE SAFETY SET IS WIDER THAN SIX. 0061 named postings, attachments,
--     responses, specs, rubrics and decks. Seventeen tables carry a FK to
--     `classroom_items`, all `on delete cascade`, and the one 0061 missed that
--     matters most is `classroom_submissions` -- the hand-in row itself,
--     carrying state, score, rubric scores and the teacher's comment, and the
--     parent of `classroom_submission_files`. A count that checks
--     `classroom_responses` but not `classroom_submissions` would call an
--     item with a graded, turned-in hand-in "carries nothing".
--
-- ---------------------------------------------------------------------------
-- WHO MAY SEE THIS
-- ---------------------------------------------------------------------------
--
-- `_classroom_manages_item(id)` -- the caller manages EVERY section the item
-- is posted to. That is EXACTLY the gate `classroom_delete_item` already
-- applies, and it is strictly NARROWER than `classroom_can_read_item`, which
-- admits a manager of ANY ONE of them. So this function shows a caller only
-- rows they can already read on the item page AND could already delete from
-- it. It creates no reach.
--
-- It is not scoped to the author. A draft is not private to whoever typed it
-- -- the classwork list already shows every draft of a section to that
-- section's managers -- and scoping it to `author_email = caller` would leave
-- copies belonging to a teacher who has left with nobody able to see them.
--
-- ---------------------------------------------------------------------------
-- WHAT UNDOES THIS FILE
-- ---------------------------------------------------------------------------
--
--   drop function if exists public.classroom_duplicate_drafts(uuid);
--
-- Nothing else. It creates no table, no policy, no grant on any table, no
-- trigger and no column; it reads and returns jsonb. Dropping it removes the
-- `/classroom/<section>/duplicates` page's data and nothing more -- the page
-- degrades to its "cannot answer" state (`PGRST202`), which is why the client
-- ladder keys on that code alone.
--
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The blockers, counted as they EXIST rather than as the caller may read.
--
-- One private helper, so "what hangs off this item" has exactly one statement
-- and a surface cannot answer it a second way. Returns a jsonb object of
-- counts; the CALLER decides what a count means, because the two audiences
-- differ -- student work is never removable, an author's own spec is only a
-- reason to look first.
-- ---------------------------------------------------------------------------
create or replace function public._classroom_item_attached_counts(p_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select jsonb_build_object(
		-- Projected, never a blocker: every item has at least one (see header).
		'postings', (select count(*) from public.classroom_postings where item_id = p_item_id),
		-- STUDENT WORK. Any of these three makes the row not a surplus copy.
		'submissions', (select count(*) from public.classroom_submissions where item_id = p_item_id),
		'responses', (select count(*) from public.classroom_responses where item_id = p_item_id),
		'approvals', (select count(*) from public.classroom_module_approvals where item_id = p_item_id),
		-- AUTHORED CONTENT the delete would cascade away with the row.
		'files', (select count(*) from public.classroom_attachments where item_id = p_item_id),
		'resources', (select count(*) from public.classroom_item_resources where item_id = p_item_id),
		'specs', (select count(*) from public.classroom_assignment_specs where item_id = p_item_id),
		'reference_specs', (select count(*) from public.classroom_reference_specs where item_id = p_item_id),
		'rubrics', (select count(*) from public.classroom_rubrics where item_id = p_item_id),
		'decks', (select count(*) from public.classroom_decks where item_id = p_item_id),
		-- INSTRUCTOR-ONLY material (0090, 0128). Invisible to a student and to
		-- an instructor who is not the author, so a surface that did not count
		-- it would delete an answer key nobody on screen could see.
		'instructor_files', (select count(*) from public.classroom_instructor_attachments where item_id = p_item_id),
		'instructor_resources', (select count(*) from public.classroom_instructor_resources where item_id = p_item_id),
		'instructor_responses', (select count(*) from public.classroom_instructor_responses where item_id = p_item_id),
		'instructor_keys', (select count(*) from public.classroom_instructor_keys where item_id = p_item_id)
	);
$$;

-- Private helper: no client calls it. `service_role` is not touched (0131).
revoke all on function public._classroom_item_attached_counts(uuid)
	from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The surface's one read.
--
-- p_section_id null  -> every section the caller manages every posting of.
-- p_section_id set   -> only groups with a member posted to that section.
--
-- REVISIONS ARE DELIBERATELY NOT COUNTED. `classroom_content_revisions` (0110)
-- gets a row from the ordinary write path, so every item that has ever been
-- saved carries at least one; counting it as a blocker would block everything,
-- which is the `postings` mistake in its other costume. What a revision chain
-- records about a row nobody published and nobody read is its own creation.
-- ---------------------------------------------------------------------------
create or replace function public.classroom_duplicate_drafts(p_section_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_groups jsonb;
	v_surplus integer := 0;
	v_removable integer := 0;
	v_blocked integer := 0;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;

	with mine as (
		select i.id, i.kind, i.title, i.body, i.author_email, i.author_name, i.created_at
		from public.classroom_items i
		where i.published = false
			-- The delete gate, asked as the read gate. See the header.
			and public._classroom_manages_item(i.id)
			and (
				p_section_id is null
				or exists (
					select 1 from public.classroom_postings pg
					where pg.item_id = i.id and pg.section_id = p_section_id
				)
			)
	),
	grouped as (
		select m.author_email,
			min(m.author_name)                                  as author_name,
			m.kind,
			m.title,
			count(*)                                            as copies,
			min(m.created_at)                                   as first_written,
			max(m.created_at)                                    as last_written,
			(array_agg(m.id order by m.created_at, m.id))[1]     as keep_id,
			(array_agg(m.id order by m.created_at, m.id))[2:]    as surplus_ids
		from mine m
		group by m.author_email, m.kind, m.title, m.body
		having count(*) > 1
	),
	-- One row per surplus copy, carrying its own counts and its own verdict.
	scored as (
		select g.*,
			s.id                                                as surplus_id,
			si.created_at                                       as surplus_created_at,
			public._classroom_item_attached_counts(s.id)        as counts
		from grouped g
		cross join lateral unnest(g.surplus_ids) as s(id)
		join public.classroom_items si on si.id = s.id
	),
	verdicts as (
		select sc.*,
			-- STUDENT WORK is absolute: never removable, whatever else is true.
			((sc.counts->>'submissions')::int
				+ (sc.counts->>'responses')::int
				+ (sc.counts->>'approvals')::int) as student_work,
			-- Authored content the cascade would take. A reason to look, and
			-- the surface says which -- but it is the AUTHOR'S own material on
			-- a copy of the author's own draft, so it does not make the row
			-- untouchable the way somebody else's work does.
			((sc.counts->>'files')::int
				+ (sc.counts->>'resources')::int
				+ (sc.counts->>'specs')::int
				+ (sc.counts->>'reference_specs')::int
				+ (sc.counts->>'rubrics')::int
				+ (sc.counts->>'decks')::int
				+ (sc.counts->>'instructor_files')::int
				+ (sc.counts->>'instructor_resources')::int
				+ (sc.counts->>'instructor_responses')::int
				+ (sc.counts->>'instructor_keys')::int) as authored
		from scored sc
	)
	select
		coalesce(jsonb_agg(gr order by gr->>'first_written' desc), '[]'::jsonb),
		coalesce(sum((gr->>'surplus_count')::int), 0),
		coalesce(sum((gr->>'removable_count')::int), 0),
		coalesce(sum((gr->>'blocked_count')::int), 0)
	into v_groups, v_surplus, v_removable, v_blocked
	from (
		select jsonb_build_object(
			'author_email', v.author_email,
			'author_name', v.author_name,
			'kind', v.kind,
			'title', v.title,
			'copies', v.copies,
			'first_written', v.first_written,
			'last_written', v.last_written,
			'keep_id', v.keep_id,
			'surplus_count', count(*),
			'removable_count', count(*) filter (where v.student_work = 0),
			'blocked_count', count(*) filter (where v.student_work > 0),
			'surplus', jsonb_agg(
				jsonb_build_object(
					'id', v.surplus_id,
					'created_at', v.surplus_created_at,
					'removable', v.student_work = 0,
					'student_work', v.student_work,
					'authored', v.authored,
					'counts', v.counts
				) order by v.surplus_created_at, v.surplus_id
			)
		) as gr
		from verdicts v
		group by v.author_email, v.author_name, v.kind, v.title, v.copies,
			v.first_written, v.last_written, v.keep_id
	) rolled;

	return jsonb_build_object(
		'groups', v_groups,
		'totals', jsonb_build_object(
			'groups', jsonb_array_length(v_groups),
			'surplus', v_surplus,
			'removable', v_removable,
			'blocked', v_blocked
		)
	);
end;
$$;

-- A NARROWING MUST NAME THE ROLES (the hosted-Supabase default privileges
-- write a DIRECT grant to anon/authenticated/service_role at creation time, so
-- `from public` alone would leave anon holding it). 0137 is a one-time repair
-- of what was already there and does not cover a function created after it.
revoke all on function public.classroom_duplicate_drafts(uuid)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_duplicate_drafts(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Self-check. Read-only, so this asserts SHAPE and PRIVILEGE rather than
--    counting rows it changed -- there are none.
-- ---------------------------------------------------------------------------
do $$
declare
	v_n integer;
begin
	select count(*) into v_n from pg_catalog.pg_proc p
	join pg_catalog.pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_duplicate_drafts';
	if v_n <> 1 then
		raise exception '0187: expected exactly one classroom_duplicate_drafts, found %', v_n;
	end if;

	if has_function_privilege('anon', 'public.classroom_duplicate_drafts(uuid)', 'execute') then
		raise exception '0187: anon can execute classroom_duplicate_drafts';
	end if;
	if not has_function_privilege('authenticated', 'public.classroom_duplicate_drafts(uuid)', 'execute') then
		raise exception '0187: authenticated cannot execute classroom_duplicate_drafts';
	end if;
	if has_function_privilege('authenticated', 'public._classroom_item_attached_counts(uuid)', 'execute') then
		raise exception '0187: authenticated can execute the private counter';
	end if;

	raise notice '0187: read-only. classroom_duplicate_drafts(uuid) granted to authenticated only; the counter is private. No rows were read, written or deleted by this file.';
end;
$$;
