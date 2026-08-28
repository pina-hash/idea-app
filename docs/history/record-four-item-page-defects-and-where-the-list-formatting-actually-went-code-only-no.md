---
title: "Four item-page defects, and where the list formatting actually went (code-only; NO migration)"
date: 2026-08-16
branches: []
migrations: []
subsystems: ["IDEA Classroom"]
record_order: 47
---

## Four item-page defects, and where the list formatting actually went (code-only; NO migration)

Four defects reported from production on a real assignment. No schema change,
no RPC change, no migration: every fix is in the client, one route, or a
stylesheet.

### THE LISTS: NOT STRIPPED ON WRITE, AND NOT A RENDERER BUG

A body authored as a bulleted list rendered as one run-on paragraph -- no
breaks, no markers. The three obvious candidates were all investigated and all
cleared, which is the finding worth keeping:

- **The normalizer is correct.** `normalizeItemDoc` over real Tiptap output for
  a `bulletList` returns `{ type: 'ul', items: [...] }`. Measured, not read.
- **The SQL gate is correct.** `_classroom_doc_ok` accepts exactly that shape,
  and `classroom_create_item` stores it verbatim.
- **The RENDERER is correct**, and this was settled in a browser before anything
  was changed: `ItemBody` over a stored doc emits real `<ul>`, `<ol>` and `<li>`
  with `list-style-type: disc` and a 22.4px indent.

**The document is not being STORED, so there is nothing for the renderer to
render.** `/api/classroom/item` degrades past `p_body_doc` when the RPC does not
have that parameter -- a backend without `0108` -- and the save then succeeds
carrying only the plain-text column. `docText` writes ONE LINE PER LIST ITEM
and `docFromPlainText` splits on BLANK lines only, so the fallback joins the
whole body, heading included, into a single paragraph. That is the reported
symptom exactly, and it is the fallback working as designed on input that has
already lost its structure.

- **THE FIX IN CODE IS TO STOP IT BEING SILENT.** The degrade cost a teacher
  something they can see and said nothing: the composer reported a clean save.
  The route now reports `formatting_dropped` when it had to drop that parameter
  AND the weaker call then succeeded (never on a genuine refusal), the transport
  carries it as `ItemSaved.formattingDropped`, and the composer surfaces it
  through its existing "saved, but N things did not" path, naming what was lost
  and what to do about it.
- **THE ACTUAL REPAIR IS TO APPLY `0108`**, which this repo cannot do -- the
  local `.env` is the placeholder project. Until it is applied every save keeps
  losing formatting, now loudly.
- **ALREADY-AFFECTED ITEMS CANNOT BE RECOVERED AND MUST NOT BE REWRITTEN.** The
  markers were never in the text column, so there is nothing to migrate from;
  `0108`'s own backfill will turn those bodies into flat paragraphs, which is
  the honest result. A test pins that the fallback invents no structure, so
  nobody writes a "repair" pass that fabricates lists. **The count of affected
  items was NOT measurable from here** (no live credentials); on the live
  project it is
  `select count(*) from classroom_items where body_doc is null and body like '%' || chr(10) || '%';`
  before applying `0108`, and after it, the items whose stored doc is every
  block `p` while the teacher remembers authoring a list.

### The composer's duplicate deck and spec panels

With the editor open on an item page, `ContentComposer` rendered its own
Presentation deck panel and its own Interactive spec panel while the page-level
Presentation card and Assignment Engine card were also on screen -- two of each,
with near-identical explanatory text.

Both are REMOVED from the composer (and `DeckStager.svelte`, left with no
caller, is deleted rather than kept as a second way in). The composer keeps only
the item's own fields, verified in the browser as exactly: Title, Instructions,
Points, Due date, Grading category, Links, Files, Instructor only, Posted to,
Also post to, Schedule.

- **NOTHING WAS REACHABLE ONLY FROM THE COMPOSER COPIES**, checked control by
  control: `DeckPanel` already owns upload, replace, remove, progress, cancel,
  the entry-page question and the missing-state warning, and the page-level card
  mounts the same `SpecImporter` the composer did. The one thing that genuinely
  went is attaching a deck or spec in the same gesture that CREATES an item --
  save first, then attach on the page that then exists, which is a step fewer
  than staging ever was since neither needs the editor open at all.
- The Claude Design export explainer now appears once, on `DeckPanel`, cut from
  four sentences to two.

### Two chips on the item page

- **The Updated badge is gated on `first_published_at`.** It is student-facing
  change signalling, and an item that has never gone live cannot have been
  missed. This mirrors the rule `classroom_update_item` already applies on the
  way in (`edited_at` is only stamped once `first_published_at` is set), so the
  read and the write agree now. An item published and later pulled back to draft
  KEEPS its badge, which is correct.
- **No due date means no due segment**, rather than the sentence "Due No due
  date". `formatDue(null)` still returns its string for callers that want a
  value; the item page's label and its value now come or go together.

### The green bleed under the classroom shell

`.cr-root` painted `--surface-0` and was `min-height: 100vh`, but `body`
(app.css) paints `--bg0`, the portal's green plate -- and a body background
PROPAGATES TO THE CANVAS, which covers every pixel the document does not. So
green showed wherever the canvas was visible and the wrapper was not: the last
child's bottom margin collapsing out through a wrapper with no bottom padding,
overscroll, and the mobile URL-bar gap past 100vh. `body:has(.cr-root)` paints
the canvas `--surface-0` -- the same `:has()` scoping the `.bg-fx` suppression
beside it already uses, so /classroom and /reference are covered and no other
route is touched. Measured: with a 120px gap forced below the wrapper the canvas
reads `rgb(10,12,11)` where it read `#121a12`; a route with no `.cr-root` still
reads `rgb(18,26,18)` with `.bg-fx` running.

### Verified

- **`tests/classroom-body-render.test.ts` (10 tests)** is the coverage gap
  itself: every existing suite stopped one layer short of the reported symptom
  (`classroom-item-doc` checks what the normalizer RETURNS,
  `classroom-rich-body` what the gate ACCEPTS and the RPC STORES), so nothing
  asserted what the renderer DOES. It drives editor JSON -> the real normalizer
  -> the real SQL gate -> the real `classroom_create_item` -> a real read-back
  -> the REAL `ItemBody`, server-rendered to a string, covering a bulleted list,
  an ordered list, a nested list, both headings, bold, italic and a link. Its
  second half pins the DEGRADED render -- one `<p>`, everything run together --
  so the symptom can never again be mistaken for a normalizer or gate defect.
  **MUTATION-CHECKED THREE WAYS:** stripping lists in the normalizer reddens 6
  including the stored-shape assertion; dropping the `ul`/`ol` branches from
  `ItemBody` reddens 3 and leaves the stored-shape assertion GREEN, which is the
  write-vs-render split the file exists to make visible; making
  `docFromPlainText` emit one paragraph per line reddens exactly the one degrade
  assertion. Every module restored byte-identical (git-verified).
- **`vitest.config.ts` gained the Svelte plugin**, for one job: `render()` from
  `svelte/server` needs no DOM and no browser, so `environment: 'node'` is
  unchanged and NO dependency was added (`svelte` and the plugin were already
  devDependencies). It is what lets a test assert markup rather than the data a
  renderer was handed.
- **`tests/classroom-edit-visibility.test.ts` gained 4 tests** for the badge
  rule, written as pure assertions because one of the rows is deliberately one
  the RPCs cannot produce (a draft carrying `edited_at`) -- exactly the row the
  guard exists to catch. Mutation-checked: removing the `first_published_at`
  guard reddens exactly the never-published test.
- `npx svelte-check`: **0 errors, 36 warnings** (the same 36 as HEAD).
  `npx vitest run --no-file-parallelism`: **1065/1065 across 44 files**
  (was 1051/43).
- **Browser-verified** in `/dev/classroom-phase1`, extended for this: the
  `ItemBody` view gained a card rendering the SAME body with no stored document
  beside the correct one, and the `ItemDetail shell` view gained deck transports
  plus an unposted-draft toggle. Measured: the rich body emits 1 `<ul>`, 1
  `<ol>`, 6 `<li>`, 1 h3, 2 h4, 2 `<strong>`, 1 `<em>`, 1 `<a rel="noopener
  noreferrer">` with `list-style-type: disc`; the degraded body emits 1 `<p>`, 0
  lists, 0 items; with the editor OPEN there is exactly 1 Presentation heading, 1
  Assignment engine heading and 1 deck hint, and the composer offers no spec
  importer and no deck stager; the unposted draft reads
  `15 pts · Unit Labs · Posted Aug 13 by T. Vargas` with zero Updated chips,
  while the published one still reads `Due Thu, Aug 20, 3:00 PM · 20 pts · ...`.
  **375/375 at phone width with zero overflowing elements** on the bodies,
  create, edit and editor-open detail views, and an armed `window.onerror`
  caught ZERO errors throughout. Reduced motion: nothing on these surfaces
  animates at all, and `DeckPanel`'s one animation keeps its existing
  `prefers-reduced-motion` override.
- **NOT verified: the live Supabase project, and no screenshots.** The local
  `.env` is the placeholder project, so the production state of `0108` could not
  be confirmed from here and the affected-item count could not be measured. The
  Browser pane does not composite, so every visual claim above is a measured DOM
  or computed-style read.

