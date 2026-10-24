# Results, session 0431: HTML assignments in IDEA Classroom

Ledger 0431, 2026-10-23, solo on main. Migration: `supabase/migrations/0298_html_assignment_duplicate_and_live_lock.sql` (0295 to 0297 were taken by 0432 and 0433 at landing). The record is `docs/history/0431-html-assignment-duplicate-export-lock-expand.md`.

## What to do now

1. Nothing for the migration: it applies through Migrate on the push (no destructive DDL, no top-level DML). Check the next morning that the site's HTML assignments still open.
2. Run the backfill once, after the deploy, from a Claude chat with the IDEA Website connector: ask it to "run the classroom export html action" (its generated tool is `site_route_api_classroom_export_html`; it asks first). It answers which assignments landed in `materials/<course>/<slug>/` and which did not. It is safe to run again.
3. Paste the SELECT below into the Supabase SQL editor (it only reads) to list duplicates left empty before the fix. Repair each by re-uploading its HTML, or by deleting it and duplicating the source again now that duplicate copies the document.
4. To get Answers left jumping inside a live worksheet, rebuild it on the current kit (`tools/hx-kit`) and re-upload it. Until then the list still shows what is left, and a pick scrolls to the top of the worksheet and says so.

## The five items: found vs built

1. **Duplicate loses the document (2954e260).** Found: `classroom_duplicate_item` (last defined in 0193) copied the rubric and spec but not `classroom_html_assignments` or `assignment_schema_version`; the connector's `duplicate_post` calls the same function; 0268's comment was wrong. Built: 0298 copies the document, manifest, filename and show-title switch under a new serving handle and sets the version in the same transaction (and copies an IdeaCAD Blade editor the same way, the same bug). The connector needed no change. Test: each copy's document equals its own source byte for byte across two classes; mutation (copy another item's document) reddened 2 tests, restored md5-identical.
2. **Export to materials (a71b7b8a).** Found: the export read specs only, so an HTML assignment was skipped. Built: every upload now exports `assignment.html` (verbatim), `manifest.json`, `rubric.json` and `material.json` to `materials/<course>/<slug>/`, by the same commit path; the backfill is an admin action, `POST /api/classroom/export/html`, reachable through the connector. Reruns commit nothing. Mutation (every item into the first item's course folder) reddened 2 tests, restored md5-identical. Not built: the connector's `replace_html_assignment` does not trigger the export (connector code is another session's); the backfill catches those up.
3. **Close flips an open worksheet (9f746072).** Found: the lock came from page-load data only. Built: the page's existing heartbeat (every 40 s, no new poll) now answers the student's own lock; the grading page announces the close or reopen live, and an open page re-reads within 3 seconds; a save refused as closed flips the worksheet at once. Typed-but-unsaved answers stay visible read only, with a note and Copy; a reopen saves them. A close made through the connector lands by the next heartbeat, so up to about 40 seconds.
4. **Expand mode (989cfcb6).** Found: nothing existed. Built: a Full page key on the frame; the worksheet fills the whole window (not browser fullscreen), Exit full page always on screen, Escape when focus is outside the worksheet, remembered in that browser only. Measured at 375 and 1440: the stage is exactly the window box, the worksheet gets at least 75% of the window height, Exit hit-tests to itself and is 152x44, the page behind is locked, focus moves to Exit and back to Full page, no horizontal scroll.
5. **Answers left as a list (cb6d42bc).** Found: "N answers left" was text on the module chips. Built: an Answers left button and clickable chips open a list of every owed answer, grouped by section, each saying what it needs ("Needs 2 sentences", "Box to check"); picking one goes through the bridge (`idea:focus`), never into the document. Measured at 375 and 1440: the jump scrolled past a 1400 px spacer, ringed the answer on screen, focused the worksheet and closed the list; rows and keys 44 px; contrast 14.5:1.

## Checks

- `svelte-check`: 0 errors, 33 warnings in 18 files (baseline unchanged).
- Browser: the six `html-assignment-live*` specs, 12 runs, 140 measurements, 0 outside threshold. The existing `html-assignment*` (54 runs), `html-progress` and `html-instructor` specs show only console-error rows from Chromium 153's new CSP wording for refusals the probe documents cause on purpose (present before this change), and one timing miss under load that passed alone.

## Not verified

The live database, a real GitHub push of the backfill, a signed-in student page in production, iOS Safari for full page, and the jump inside any live Unit 3 document. The live site footer version was not read (the fetch was not permitted from this session).

## The duplicates already left empty (read-only)

Paste into the Supabase SQL editor and Run. It only reads. Each row is an assignment that looks like a copy of an HTML assignment (its title is the source's title plus "(copy)", or its rubric is identical to the source's) but has no worksheet document.

<!-- empty-duplicates-sql:start -->
```sql
select course, class, post_title, created, copied_from, post_id
from (
	select distinct on (c.id, se.id)
		co.code as course,
		se.label as class,
		c.title as post_title,
		c.created_at as created,
		src.title as copied_from,
		c.id as post_id
	from public.classroom_items c
	join public.classroom_items src
		on src.id <> c.id
		and src.assignment_schema_version = 3
		and src.created_at < c.created_at
	join public.classroom_html_assignments h on h.item_id = src.id
	left join public.classroom_rubrics rc on rc.item_id = c.id
	left join public.classroom_rubrics rs on rs.item_id = src.id
	left join public.classroom_postings p on p.item_id = c.id
	left join public.classroom_sections se on se.id = p.section_id
	left join public.classroom_courses co on co.id = se.course_id
	where c.kind = 'assignment'
		and c.assignment_schema_version is null
		and not exists (select 1 from public.classroom_html_assignments x where x.item_id = c.id)
		and (
			c.title = left(coalesce(src.title, '') || ' (copy)', 300)
			or (rc.criteria is not null and rc.criteria = rs.criteria and rc.criteria <> '[]'::jsonb)
		)
	order by c.id, se.id, (c.title = left(coalesce(src.title, '') || ' (copy)', 300)) desc, src.created_at desc
) found
order by created, course, class;
```
<!-- empty-duplicates-sql:end -->
