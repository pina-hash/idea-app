---
title: "2026-27 curriculum (a LOOKUP, no longer a picker)"
date: 2026-08-15
branches: []
migrations: []
subsystems: ["Curriculum, migrations, policy"]
record_order: 16
---

## 2026-27 curriculum (a LOOKUP, no longer a picker)

`src/lib/curriculum.ts` is **plain data** (no `?raw`/`$lib/legacy` imports) so it
is safe in the client bundle.

**SCOPE, narrowed again now that the picker is retired:** this file is the course
catalog behind the hero's course count and the `/archive` listing, plus the
lookup that turns a stored `profiles.section_id` back into something readable
for anyone who still needs to. It does **not** own class content --
announcements, assignments and materials live in IDEA CLASSROOM
(0082/0083/0085/0086), which the home-page feed and `/classroom` read. See
"Home page: the live IDEA Classroom feed" below.

- `SECTIONS`: every section, including `summer-2026` (the concluded Freshman
  Summer Program, archived at `/fsp/archive`). **Nothing here is ever deleted:**
  every id may already sit in a real `profiles.section_id`, and removing one
  would orphan those rows and break `sectionById`. The `assignments` arrays are
  legacy and render nowhere.
- Helpers: `sectionById()`, `selfSelectOptions()`, `activeCourseCount()`.
  `summerProgram()` and `sectionsByYear()` were removed with the markup they
  served. **`selfSelectOptions()` now has NO caller** -- it is kept because it is
  the one description of how the catalog groups by year, and the next surface
  that needs to offer a section will want it.
- **`activeCourseCount()` excludes a CONCLUDED programme.** It counts distinct
  course CODES (three IDEA 209H sections are one course) with `term === 'Summer'`
  filtered out, because the FSP ran and finished. That is why the hero reads 4
  and not 5. The FSP section entry itself stays in `SECTIONS`.
- **Per-student class: NOT this file any more.** `profiles.section_id` is a
  free-form `Section.id`, intentionally not a FK (`0003_profile_section.sql`),
  and it is now WRITTEN BY NOTHING -- see "The pathway-year picker is retired"
  below.
- **Archive:** the discontinued 2025-26 courses (IDEA-113/208/303/403) live as
  `ARCHIVE_COURSES` in the same file and render on `/archive`
  (`src/routes/archive/+page.svelte`), linked discreetly from the homepage footer.
  Their assignment bodies are still served by the public `/assignments/<slug>`
  endpoint; the archive page only links to them.

