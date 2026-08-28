---
title: "The class page is a two-pane master-detail shell (code-only; NO migration)"
date: 2026-08-16
branches: []
migrations: []
subsystems: ["IDEA Classroom"]
record_order: 63
---

## The class page is a two-pane master-detail shell (code-only; NO migration)

`/classroom/[sectionId]` is a persistent navigation pane beside a detail pane
above 1024px. No URL changed and no route was renamed; what moved is which LOAD
owns the class, and therefore which component survives opening an item.

### The class content is navigation, so it is a LAYOUT

`[sectionId]/+page.server.ts` became `[sectionId]/+layout.server.ts` (a `git mv`
plus the load type), and `+page.svelte`'s ClassView mount moved into a new
`[sectionId]/+layout.svelte`. That is the whole mechanism: a layout component is
not remounted when a child route changes, so opening an item preserves the
list's local state -- folded units, expanded rows, an open composer, an open row
menu, the pane's scroll position -- and re-runs only the item's own load. What
remains on the page is the empty detail state: what you see before you pick
something.

- **THE LAYOUT LOAD MUST NEVER READ `url`.** A dependency on the pathname would
  re-run it on every navigation and undo the entire point. `params.sectionId` is
  safe (it does not change inside a class); the pathname is not. Reading the
  pathname in the layout COMPONENT is free -- component reactivity, not a load
  dependency -- and that is how the split decides whether it applies.
- **The load now also runs on /people, /grades and the deck viewer**, which do
  not use the list. It is paid ONCE per section visit rather than per
  navigation, so browsing a class and then opening the roster is cheaper than it
  was, and only a cold direct hit on /people or /grades pays more. A conditional
  load would have had to read `url`, which is exactly what it cannot do.
- **Split only where a list beside a detail means something:** the class page
  and an item. Grading, the roster, the marks table and the full-screen deck
  viewer render full width, exactly as they did.
- **Two knock-on improvements on the deck route**, which previously carried
  neither `section` nor `canManage` in its data: its breadcrumb names the real
  class instead of the literal "Class", and a manager sees the People and Grades
  tabs there.

### The item load stops returning four keys, and two queries go with them

`item/[itemId]/+page.server.ts` no longer returns `section`, `canManage`,
`sections` or `attachmentsEnabled`. Page data merges OVER layout data, so
returning them would only SHADOW the layout's copies -- and they were computed
identically (same table, same `SECTION_SELECT`, same `normalizeSectionRow`, the
same `manages === true`, and `driveConfigured()`, which takes no request input
at all). Audited before dropping: nothing else consumes that page's data.
`grade/` and `deck/` have fully independent loads, and `await parent()` appears
nowhere in the classroom tree.

- **Gone with them:** the section row query (the layout already 404s an
  unreadable section, and the item's own `posted_in!inner` join is what ties the
  item to the class) and the full section list.
- **The manages RPC STAYS**, because this load BRANCHES on the answer --
  instructor-only materials, the `is_public` read, and the spec/rubric-vs-engine
  split. Reading it back off the layout would mean `await parent()` and
  serializing behind the whole class load for one boolean.
- `grades/` and `people/` were left alone: they return `canManage: true` as a
  literal and 404 unless the caller manages the section, so their own gate has
  to stay independent of anything a layout hands them.

### Width tokens, and the chrome that never lined up with them

Five page widths were written as literals across eleven files with nothing tying
them together, and `ClassroomShell` pinned `.crumbs` and `.sec-tabs` at 60rem
independently -- so the chrome only aligned on the routes that happened to be
60rem too. Six tokens now live in `src/lib/design-system/effects.css`, beside
the radii and the spacing scale they are named after: `--measure-reading` 46rem
(prose), `--measure-form` 48rem, `--measure-panel` 52rem, `--measure-page` 60rem
(the default), `--measure-wide` 62rem (a dense work surface), `--measure-split`
92rem (both panes).

- **`classroomMeasure(loc)` in nav.ts is the ONE decision**, in the module that
  already answers "where am I". `/classroom/+layout.svelte` sets it on
  `.cr-root`, the chrome reads it, and each component reads
  `var(--cr-measure, var(--measure-X))` -- the fallback being what the dev
  harness and view-as get.
- **THE ROUTE SETS `--cr-measure-route`, NOT `--cr-measure`, AND THAT
  INDIRECTION IS LOAD-BEARING.** An inline style beats every selector, `:has()`
  included, so a route writing `--cr-measure` directly could not be widened by
  the split rule -- which is the bug it was first written with, measured live at
  960px of chrome over a 1440px split. `classroom.css` resolves
  `--cr-measure: var(--cr-measure-route, var(--measure-page))`, so both writers
  are stylesheet rules on one element and specificity decides.
- **view-as deliberately gets NULL**, not a width: it is one place covering two
  genuinely different pages (a 46rem picker and a full class page) and runs the
  shell in minimal mode with no chrome to align. Every component there keeps
  exactly what it had.
- `tests/classroom-measure.test.ts` pins the pairing against the shipping
  source, because it lives in two files that have no reason to be opened
  together -- a `case` in nav.ts and a `max-width` in a component's `<style>` --
  and the failure is a few pixels of misalignment. Mutation-checked both ways.

### The landmark follows the DETAIL, not the split

ClassView takes `asPane`, which swaps its root between `<main>` and `<section>`
so a document never carries two mains. It is keyed on whether an ITEM IS OPEN,
not on whether the route is a split -- a distinction found at 375px, where
keying on the split left the class page on a phone with its one `<main>` inside
the hidden detail pane. All four combinations were measured: exactly one `<main>`
in the DOM and visible, always on the pane that is the content in that state.

### Verified

- **Browser-measured in `/dev/classroom-split`** (404 in production, no auth, no
  Supabase), a dev route tree shaped exactly like the real one -- a layout load
  plus a child page load -- mounting the REAL ClassSplit, ClassView, ItemDetail
  and ClassroomShell, and running the REAL `locateClassroom` /
  `classroomMeasure` / `classroomCrumbs` / `sectionTabs` on a rewritten path.
  The real routes need a session and a live project the placeholder `.env`
  cannot provide; this is what makes the claims drivable at all.
  `ClassSplit.svelte` was extracted so both mount the identical component.
- **State preservation, proven rather than asserted.** With a unit folded, a row
  expanded and the pane scrolled to 260, a real link click to an item left
  `layoutLoads` at **1**, took `itemLoads` **0 -> 1**, left `layoutMounts` at
  **1**, and preserved the folded group, the expanded row and `scrollTop 260`
  exactly. Item -> item repeated it (`itemLoads` 2, then 3). Class -> item, where
  the landmark tag swaps, also held scroll at **340**.
- **Independent scroll**: both panes overflow (nav 1382/748, detail 1929/748);
  scrolling the detail to 400 left the nav and the window at 0, then scrolling
  the nav to 300 left the detail at 400, with the document itself not scrolling
  at all.
- **1440x900**: crumbs, tabs and the split all measure **1425px** -- the chrome
  aligned with the split. **1023px**: single column, crumbs **960px** and the
  content's own max-width **960px**, agreeing. **1024px**: grid, crumbs 1009 ==
  split 1009 -- a clean switch at exactly the breakpoint.
- **375px**: on an item the nav pane is `display: none` and the item is the full
  375 with `overflow-y: visible` (the page scrolls as it always did); on the
  class page the detail is `display: none`, so there is no empty panel under the
  list. `document.scrollWidth` is 375 on both, no element overflows, and every
  row is at or above 44px. **Nothing became unreachable at either width**: the
  breadcrumb's class link is the way back to the list on a phone, and it was
  clicked to confirm.
- Selected row: exactly one, `--surface-2` fill with a 3px `rgb(120,184,112)`
  (`--green`) inset rule plus `aria-current="page"` -- never colour alone.
- Zero console errors on a clean tab across a fold, an expand and two
  navigations.
- `svelte-check`: 0 errors, 36 warnings (the same 36 as HEAD). `npm test`:
  **1079/1079 across 45 files** (was 1066/44; the new measure suite is the
  difference exactly). Two existing suites had their import updated from
  `[sectionId]/+page.server` to `[sectionId]/+layout.server` -- the assertions
  are unchanged, only the file they import moved.
- **NOT verified: the real signed-in routes, and no screenshots.** The
  placeholder `.env` reaches no project, so `/classroom` cannot be loaded; the
  Browser pane does not composite, so every visual claim above is a measured DOM
  or computed-style read. Deploy and check with a real account that a manager's
  row menu and composer behave inside a 26rem pane.

