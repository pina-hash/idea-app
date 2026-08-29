---
title: "The composer takes the detail pane, and the page gets a gutter (code-only; NO migration)"
date: 2026-08-16
branches: []
migrations: []
subsystems: ["IDEA Classroom"]
record_order: 50
---

Four related changes to the classroom shell. No schema change, no new write
RPC, no migration: the composer, the split shell, the shared stylesheet, and
the two dev harnesses that drive them.

### THE COMPOSER WAS MOUNTED IN THE WRONG HALF

`New post` opened `ContentComposer` INSIDE `ClassView`, which since `0111`'s
split is the ~26rem navigation pane, while the pane a full authoring form
belongs in sat empty beside it. The form is a title, a rich body, three
assignment fields, two link lists, two file lists, a deck, a spec, a posting
checklist and a schedule; none of that was ever going to fit, and it did not
need to.

- **COMPOSING IS LAYOUT STATE, NOT A ROUTE**, and that is the load-bearing
  decision rather than a placement preference. The composer holds STAGED FILE
  HANDLES -- a picked zip, a pasted screenshot, an answer key -- which exist
  nowhere but in the browser's memory. A route for composing would be destroyed
  by opening an item and would take them with it.
  `src/routes/classroom/[sectionId]/+layout.svelte` owns `composing`, and a
  layout component is not remounted when a child route changes, which is the
  same mechanism that keeps the list's folded groups alive.
- **`ClassView` renders the TRIGGER and nothing else.** It gained `composing` /
  `onCompose` / `notice`; a null `onCompose` (every read-only surface, view-as)
  removes the button. The row EDITOR is untouched -- editing stays where it was.
- **`ClassSplit` gained an `overlay` snippet.** The route's own page stays
  MOUNTED underneath, `hidden`, rather than being swapped out: closing the
  composer puts you back on the item you were reading with its scroll and its
  open panels intact, and the item's route never changed while the overlay was
  up (measured: `itemLoads` does not move).
- **Below 1024px the composer takes the full width**, and needs no new rule to:
  the layout reports `hasDetail` while composing, so the existing breakpoint
  rule steps the list aside exactly as it does for an item.
- **`--measure-form` caps it at desktop.** The detail pane reaches ~920px at
  1440, and a single-line text input that wide stops being scannable.

### LOSING WORK IS GUARDED IN ONE PLACE

`composerHasWork` (`composer-staging.ts`) is the question and the layout asks
it; `ContentComposer` REPORTS dirtiness up through `ondirtychange` rather than
guarding, because a form has no idea what is about to unmount it.

- **`beforeNavigate` covers both remaining paths.** `type: 'leave'` +
  `nav.cancel()` is what raises the browser's own unload dialog (verified: a
  dispatched `beforeunload` is `defaultPrevented` only with work in the form).
  An internal navigation confirms -- unless `navKeepsComposer` (nav.ts) says the
  composer survives it, which is every hop inside this class's two-pane shell.
  Warning on those would be a lie, and a lie people learn to click through.
- **An empty link row is NOT work.** "+ Add link" appends an empty pair, so
  counting it would make every close ask a question.
- **A partial save no longer closes the composer.** `onsaved` fires with an
  empty `text` exactly then, and the old inline `created()` closed
  unconditionally -- throwing away the staged file the message had just invited
  someone to retry. Only a non-empty `text` closes it now.

### EVERYTHING IS ATTACHABLE AT CREATION

A deck and a spec were the last two things that were not: a teacher had to post
first, find the item again, and attach them on its own page.

- **They stage exactly the way attachments do** -- held locally, applied against
  the id `createItem` returns, KEPT if they fail -- because that is the same
  ordering problem and not a different one. `applyStagedExtras` is the one
  implementation; `saveTarget` is the decision that a retry after a partial
  create UPDATES the item it already made rather than posting a duplicate.
- **`SpecImporter`'s staging mode finally has a production caller.** It has
  carried `stagingMode` + `onstage` since the consolidation with nothing but a
  harness using it. `stagedSpecKind` picks the setter from the item's KIND:
  assignment -> `setSpec`, material -> `setReferenceSpec`, announcement ->
  neither, and a kind change drops a staged document rather than silently
  discarding it at save time.
- **The 4 MiB cap is enforced at STAGE time**, through the existing
  `deckUploadSizeIssue` -- the cap is a platform one, so an oversize zip is
  never going to reach the server however long somebody waits.
- **ON EDIT THEY ARE ABSENT, deliberately.** The item page owns a card for each
  and it is on screen while the editor is open; offering them here too is
  exactly the two-deck-panels bug the previous staging caused.
  **`DeckStager.svelte` is NOT restored** -- the staged input is part of the
  composer, presented like a staged attachment.
- **Field order reads as one surface**: kind, title, body, assignment fields,
  links, files, deck, spec, instructor-only, posting targets, schedule.

### ONE PAGE GUTTER

`--cr-gutter` on `.cr-root` (1rem, 2rem at the desktop breakpoint) replaces
NINE literals -- `1.2rem` in the trail, the tabs, the split, and each of the
nine page components' own `.classroom-page`. They agreed only by having been
typed the same, and the pair that did not agree was the panes: a page
component's padding landed INSIDE the split's, so the item's content sat 19px
further in than the list beside it.

- **Both panes reset their page padding now**, not just the list.
- **The list pane is a bounded region**: a hairline, a card radius, and 24px of
  internal padding. It scrolls independently and clips at its own edges, which
  is invisible on a transparent block -- and the padding that keeps content off
  those edges then reads as a stray indent rather than as the pane's inset.
  The PANE'S BOX is what sits on the gutter, which is the alignment that
  matters. Cards inside keep their own surface (the pane paints nothing, so it
  is a frame, not a second card).
- **The notebook link moved out of the meta line** into the actions row. It was
  a `flex: none` link after a truncating span -- a link squeezed by an ellipsis
  moves as the class name changes. The row renders for a student too, whose own
  notebook is the only thing in it.
- **The status notice moved BELOW the toolbar.** It rendered above, so posting
  anything pushed the primary actions down the pane.
- **The empty detail state is quiet text**, not a dashed box as tall as the
  whole list beside it. It is an absence, not a component.
- Vertical rhythm inside the pane steps through `--space-*`: 4px title->meta,
  16px meta->actions, 24px actions->content, 16px between unit groups. **No new
  token was needed** -- `--space-5` (24px) covers both the 20px pane-padding
  floor and the 24px tab-bar gap.

### SCROLLBARS

Standard properties first, WebKit pseudo-elements as the fallback.
`scrollbar-color` INHERITS so it is declared once on `.cr-root`;
**`scrollbar-width` does NOT** (found in the browser: with only that rule both
panes came back `auto`), so it is set on `.cr-root, .cr-root *` -- a universal
selector rather than a list, because the list spans nine components and would
stop covering the next region somebody adds. The thumb is `--text-3`
("tertiary: separators, disabled, decorative"), never the accent.

**REGIONS FOUND (12 declarations across 9 files):** both split panes
(classroom.css), the section switcher's menu (ClassroomShell), the spec paste
box and preview frame (SpecImporter), the rich editor's surface
(RichTextEditor), the grading console's two columns (GradingConsole), a
revision payload (RevisionHistory), the reference tab rail (ReferenceDoc), the
reference data table (ReferenceBlock), the spec renderer's tables
(SpecRenderer), the markdown code block (MarkdownText), the grade calculator's
table (GradeCalculator), and the deck viewer (DeckViewer). All are inside
`.cr-root`, so the universal rule reaches every one.

**THE ONE DOCUMENTED EXCEPTION IS RETIRED, and its retirement is the rule now.**
ReferenceDoc's section tab strip kept `scrollbar-width: none` on the grounds
that it had REPLACED the affordance with an edge fade per end. It had not -- see
"The reference document's tab strip is operable" below. **No region may hide its
scrollbar here, and the "unless it has replaced the affordance" clause is gone
with the one region that claimed it: replacing an affordance means providing a
control, not a hint.**

### Verified

- **`tests/classroom-composer-staging.test.ts` (24 tests, pure)** covers only
  what fails silently: the retry updating rather than duplicating, the
  failed-one-stays / landed-one-clears split in both directions, a deck failure
  not skipping the spec, a throw and a cancel reading as failures rather than
  rejecting the save, the kind picking the setter with the other one provably
  never called, the size cap, and what does and does not count as work.
- **`tests/classroom-measure.test.ts` grew 12 tests** for the shared gutter and
  the scrollbars -- the same source-walking convention, because both live in
  files that have no reason to be opened together and neither renders wrong
  enough to notice.
- **MUTATION-CHECKED TEN WAYS, every one in the permissive direction.**
  `saveTarget` ignoring `createdItemId` (the duplicate-item bug) reddens 2;
  clearing a failed staged thing reddens 5; a material routed through `setSpec`
  reddens 1; an empty link row counting as work reddens 1; the detail pane
  keeping its own gutter reddens 1; a page component back on a literal reddens
  1; WebKit-only scrollbars reddens 2; `scrollbar-width` on `.cr-root` alone
  reddens 1; the tab bar back at 0.9rem reddens 1; the list pane losing its
  padding reddens 1. Every file restored byte-identical (md5-checked).
- `npx svelte-check`: **0 errors, 36 warnings** (the same 36 as HEAD).
  `npx vitest run --no-file-parallelism`: **1114/1114 across 46 files**
  (was 1079/45).
- **Browser-measured at 1440 and 375**, through `/dev/classroom-split` (whose
  stub transports were replaced with a real ledger plus injectable deck and spec
  failures, and which now mirrors the layout's composer ownership and its
  `beforeNavigate` guard exactly) and `/dev/classroom`.
  - **Gutters, 1440:** breadcrumb row 32..1393, tab bar 32..1393, list pane
    32..448, detail pane 472..1393 -- chrome and both panes on one line. Pane
    gap 24, list-pane padding 24, tab bar to pane top 24. **375:** everything on
    16, tab bar to pane 24, `document.scrollWidth` 375 with zero overflowing
    elements. Nine `/dev/classroom` surfaces swept at both widths: 0 overflow,
    gutter 32 / 16, every scroller thin.
  - **Rhythm:** 4 / 16 / 24 / 20 between the pane's top-level blocks, against a
    measured baseline of 2.39 / 8 / 20 (nearly equal, which is why nothing read
    as grouped). The status notice leaves the toolbar at 257.69 either way.
  - **Composer width:** **718px** at 1440 in the DETAIL pane against a measured
    **351px** in the nav pane before (title field 718 vs 320.22, editor 716 vs
    318.22); **325px** at 375 against ~308 before. No field is narrower at
    either width. The baseline was MEASURED by stashing the change, not
    computed.
  - **Rows:** all 20 fixture rows measure exactly two lines at both widths --
    one distinct `.row-text` height, 36.16px, crowded row included.
  - **State:** with a title, two files, a deck and a spec staged, two item
    navigations left every one of them intact, `layoutMounts` and `layoutLoads`
    unchanged and `itemLoads` climbing by one each time.
  - **Create, end to end:** a partial save (deck injected to fail) created ONE
    item, uploaded both files, attached the spec, kept the deck staged, named it
    -- *"presentation deck ... Drive refused a file in this deck"* -- and left
    the composer open. Saving again called `updateItem` on that same id,
    uploaded only the deck, and closed with *"Assignment posted to 1 class. Deck
    uploaded."* Zero second items. The material path routed its document through
    `setReferenceSpec`.
  - **Guards:** an in-class hop asked nothing; leaving the class asked once and
    stayed put when declined; a dispatched `beforeunload` was
    `defaultPrevented` only with work in the form. `navKeepsComposer` answers
    true for the class page and an item, false for People, Grades, the grading
    console, the deck viewer, another class and My Classes.
  - Zero console errors and zero trapped window errors on a fresh tab across the
    whole pass; `/classroom`, `/classroom/s-1` and `/classroom/s-1/people` all
    303 signed out.
- **A HARNESS GAP THIS PASS FOUND AND CLOSED:** the split harness had the
  composer wired but NOT the `beforeNavigate` guard, so the first leave-the-class
  drive silently navigated away. An in-class hop that correctly says nothing is
  indistinguishable from a guard that never runs -- the harness has to mirror
  the whole thing for either half to mean anything.
- **NOT verified: the live Supabase project, and no screenshots.** The local
  `.env` is the placeholder project, so the real signed-in composer -- a real
  Drive deck upload and a real `setSpec` -- has not run. The Browser pane does
  not composite, so every visual claim above is a measured DOM or
  computed-style read.

