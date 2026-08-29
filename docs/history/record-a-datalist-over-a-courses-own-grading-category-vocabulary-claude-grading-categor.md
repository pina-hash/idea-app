---
title: "A datalist over a course's own grading-category vocabulary (`claude/grading-category-datalist-z7hloe`, code only, no migration)"
date: 2026-08-27
branches: [claude/grading-category-datalist-z7hloe]
migrations: []
subsystems: ["IDEA Classroom"]
record_order: 168
---

`classroom_items.category` (0085) has always been free text with a length
check, typed into a bare `<input type="text">`; nothing derived a list of
what teachers had already typed and there was no `datalist` anywhere in
`src/`. Confirmed both before touching anything.

Built as a `datalist` over the DISTINCT categories already in use across the
COURSE the item is being posted to -- `classroom_units`'s own scope, so a
teacher's vocabulary follows the course rather than one section of it -- for
three reasons, none of them relitigated: it needs no migration, it cannot
reject a string somebody already typed (a `datalist` suggests and never
constrains), and course is already the scope this schema uses elsewhere.

### The shape

- **`courseCategorySuggestions(rawCategories)`** (`src/lib/classroom/classroom.ts`)
  is the pure ranking/dedupe function. It normalizes for COMPARISON only
  (`trim()`, internal whitespace runs collapsed to one space, lowercased) so
  `"Unit Labs"`, `"unit labs "` and `"Unit   Labs"` collapse to one suggestion,
  but never rewrites what is stored -- `category.trim()` is still all
  `createItem`/`updateItem` ever send, and the value OFFERED is always one of
  the real raw spellings on record (the first one seen for that normalized
  key), never a synthesized casing. Ordered MOST-USED FIRST: a category field
  gets typed into dozens of times a term, so the categories a teacher already
  leans on are more useful at the top than an alphabetical scan would be; ties
  (equal count) break on first-seen order rather than alphabetically, for a
  result that does not reshuffle between two calls given the same input in
  the same order.
- **`ClassroomComposerTransports.loadCategorySuggestions`** is a new OPTIONAL
  transport (the `removeEnrollment` shape, 0138): `(courseIds: string[]) =>
  Promise<TxResult<string[]>>`, returning every non-null `category` on an
  item posted to any of those courses, UNPROCESSED -- ranking is the pure
  function's job, not the transport's, so a real caller sends back a plain
  projection and a dev harness can hand back a plain array with no ranking
  logic to fake. Its ABSENCE removes the datalist down through the form and
  leaves a plain, unsuggested free-text field, with no type error -- which is
  also what every existing caller of this interface gets today, since none of
  them implement it yet (see "What is NOT wired" below).
- **`ContentComposer.svelte`** derives `categoryCourseIds` from wherever the
  item is currently posted -- `postedSections` on edit (the "Post to"
  checklist only renders on create), `sections` filtered by the checked
  targets on create -- and an `$effect` refetches through the transport
  whenever that scope changes, dropping a stale in-flight response if the
  scope changes again before it lands. The category `<input>` gains a `list`
  attribute (via `$props.id()`, the `Disclosure`/`InfoTip` convention for a
  collision-safe id) and a sibling `<datalist>`, rendered only once there is
  at least one suggestion -- an empty `list=""` pointing at nothing was
  avoided on principle, not because it would have broken anything.

### What this is NOT wired to, on purpose

- **`EXTRA_CREDIT_GRADING_CATEGORIES`** (the coin economy's three-value grading
  category enum, rendered as a `<select>` and enforced in SQL) is a different
  vocabulary entirely -- it routes Extra Credit, and a classroom category is a
  teacher's own words. Nothing here reads it, writes it, or shares a type
  with it.
- **`SpecMeta.gradingCategory`** (`src/lib/classroom/assignment-spec.ts`)
  exists in the spec schema, is set in a dev fixture, and is read by nothing.
  Whether a spec that names its grading category should populate
  `classroom_items.category` is a real question this session did NOT answer
  -- it would mean SpecImporter or the create-path writing a field it
  currently ignores, which is a decision for whoever owns that surface, not a
  side effect of adding a suggestion list. Nothing about it changed.
- **No route was touched.** The transport interface gained an optional method
  with no implementation anywhere -- every real page that constructs a
  `ClassroomComposerTransports` object (the class page, the manage console,
  `/dev/classroom`) is outside this session's file ownership (`ContentComposer.svelte`,
  `classroom.ts`, and the classroom test files covering the composer, stated
  up front by the task), so wiring an actual Supabase query for
  `loadCategorySuggestions` -- something like a select on `classroom_items`
  joined through `classroom_postings` to `classroom_sections` filtered on
  `course_id`, ordered so the most recent spelling of a category wins the
  first-seen tie-break -- is left for whichever session owns that route. Until
  then every real caller gets the omitted-transport degrade: a plain
  free-text field, unchanged from before this bundle.

### Verified

- **`courseCategorySuggestions`**: distinctness under case/whitespace
  variation, most-used-first ordering, first-seen tie-breaking (not
  alphabetical), the raw-spelling-preserved guarantee, and null/empty/
  whitespace-only inputs dropped without erroring -- `tests/classroom-category-suggestions.test.ts`.
- **The field stays free text**: an SSR render (`svelte/server`, the
  `classroom-upload-picker-parity.test.ts` pattern -- this repo has no DOM/
  event-dispatch harness) with no transport wired shows a plain
  `type="text"` input and no `<datalist>`, matching the omitted-transport
  degrade; a render with a transport that WOULD resolve suggestions still
  shows no `<datalist>`, because `$effect` never runs during an SSR render --
  documented as a limit of this test rather than claimed as coverage of the
  live-fetch path.
- **Geometry, measured** (`npm run verify:browser`'s browser, driven directly
  rather than through the harness script itself, which is out of this
  session's file ownership and was not touched): at 375px the category input
  is 157.7 x 35.4px; at 1440px it is 456.9 x 35.4px. 35.4px clears the 24px
  floor this surface is held to (an instructor-only composer field, not a
  student-facing or phone-primary control) but not the 44px one; the height
  is unchanged from before this bundle -- nothing here touched sizing. With
  no transport wired in `/dev/classroom` (unmodified, per file ownership),
  `list` read back as `null` in the live DOM, confirming the degrade holds
  in a real browser and not only in the SSR test.
- **Full suite: 135 files / 3105 tests, all passing** -- 134/3096 baseline
  plus exactly the one new file and its nine tests, nothing else moved.
- **`svelte-check`: 0 errors, 37 warnings**, mix 31 `state_referenced_locally`
  / 5 `css_unused_selector` / 1 `perf_avoid_nested_class` -- re-derived with
  `svelte-kit sync` first and a placeholder `.env` this container ships with
  neither of, matches the documented baseline exactly.

### What was NOT verified

- No live Supabase project and no signed-in surface -- there is no route
  wired to the new transport for this session to drive end to end, and none
  of the out-of-scope route files were touched to add one.
- No production or preview deployment.
- **`classroom-updates.json` gained no entry.** This bundle has no
  student-visible effect -- the suggestion list is a teacher composer
  convenience, students never see a category differently for it -- and
  `CLAUDE.md`'s own rule is explicit: "A change with no student-visible
  effect needs no entry." Recorded here instead, per the same rule's other
  half.
- `npm run build` was not run (not part of this pass; the Windows EPERM trap
  does not apply on Linux in any case).
- This branch was not merged to `main` and nothing was force-pushed.
