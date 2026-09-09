---
title: "Prompt 0119: the notebook overhaul (a work-first page, the toolbar's standing finding closed, a phone feed that is a list again) and theme parity with a Matrix plate (`claude/notebook-ui-theme-overhaul-t3dc3a`, no migration)"
date: 2026-09-09
branches: [claude/notebook-ui-theme-overhaul-t3dc3a]
migrations: []
subsystems: ["Digital notebook", "Site theme", "Browser harness"]
---

Two reports were asked for and both are here: (28) the notebook UI/UX overhaul,
with what was chosen and what was rejected and why; (29) theme parity between the
site theme system and the notebook's own, with a Matrix option for the notebook.
No migration, no schema, decision 08 (a table node) untouched and unprejudged.

### 28. The direction: a work-first notebook

The brief was three words. Reading the surface end to end (41 files, 17,640 lines,
and every measured pass in `docs/history/` since 2026-08-16), the notebook's
problem was not its tokens, its type or its contrast -- five bundles had measured
all of that onto solid ground -- but WHAT SAT BETWEEN A STUDENT AND THEIR WORK.
Four things, each measured before it was changed:

1. **A hero, on every visit.** An eyebrow, a 2.15rem title, a three-line
   paragraph explaining what a notebook is, then two chips. `IDEA_INTERFACE_
   STANDARDS` 1 names reading material on a return visit as a cost and vertical
   scroll as a cost, and this was both, above the composer, above the feed.
2. **The toolbar's list controls under the 44px floor**, the repo's only two
   standing outside-threshold rows for weeks (decision 12, item 2): Select,
   Done, Clear and Expand all were underlined words with `.tap-reach-44` and
   `--tap-reach-w: 0px`, walked 32.5 x 45 against 44 at 375 and 1440. The
   arithmetic that kept them standing was the row they shared with the sort
   and the count: 293px at 375 against 346px at 44px each, so widening the
   words alone bought a 13px document overflow.
3. **A phone feed that was mostly buttons.** Every collapsed entry rendered
   its six labelled controls (folder, turn in or move to drafts, pin, copy,
   rename, delete) on three lines. Measured on the fixture feed at 375: nine
   rows averaging **229px each, 133px of it the control strip**, a feed of
   **2641px** and a document of **5227px**.
4. **A desktop placeholder pane.** With the composer closed, or on every
   read-only mount (the review console's per-student page, view-as), the
   detail pane rendered one sentence ("Pick an entry on the left") beside a
   26rem list -- the exact layout section 1 forbids -- and the list never got
   the width.

**What was built.**

- **The hero is a page head.** Eyebrow, a 1.85rem title, ONE line ("Only you,
  your section instructor and the department chair can see this notebook",
  addressed to the reader on a read-only mount: "Only this student...") and a
  STATUS STRIP of what needs doing, actionable where it can be: a **Next
  check-in** chip (`nearestOutstanding`, the same answer the composer's
  auto-select reads) that picks that session and brings the composer into
  view, a **drafts** chip (the same predicate the all-drafts note uses) that
  applies the Drafts filter, then the class chip and the review link.
  Actionable first, identity last -- which also packs the strip into two lines
  at 375 instead of three. Shell top padding 40px to 24px.
- **The toolbar is three lines**: search, filter chips, then count + sort + the
  list controls, which are ordinary 44px boxes (`.tool-btn`) on a wrapping
  line. Measured after: **Select 57.5 x 44 at 1440, Expand all 78.4 x 44 and
  Select 57.5 x 44 at 375, 0px overflow at both widths**, the tools row 96px
  tall at 375 (two lines) and 44px at 1440. The harness row moved from
  `tapReach` to `tapTargets`, because a box is measured as a box; the one
  `.tap-reach-44` left in the view (Manage folders, in the folder hint,
  walked 81 x 45) keeps a `tapReach` row so the mechanism is still walked on
  this route. **Both standing rows are closed.** Decision 12's entry is not in
  this bundle's surface and still reads "not fixed"; its transition belongs
  to whoever owns `docs/decisions/`.
- **A collapsed entry is a row, on every width.** The control strip renders on
  the OPEN entry only (`{#if !collapsed}` around `.tools`); the desktop `row`
  variant already carried no tools and kept them on the open entry, so the
  phone feed now does what the desktop does, one tap away. Bulk-select stays
  on the collapsed row. Measured after at 375: **88px per row (from 229),
  feed 1369px (from 2641), document 3955px (from 5227)**. This REVERSES a
  written decision ("filing, pinning and copying are one click away collapsed
  or expanded") that was made when the strip was three controls; the comment
  in `NotebookEntryCard.svelte` says so and carries the numbers.
- **Nothing open is one pane.** `detailHasContent` is `showEntry ||
  composerMounted`; the placeholder paragraph is gone. The feed then USES the
  width: with nothing open above 1024px each date group lays its rows in
  `auto-fit` columns of `minmax(min(24rem, 100%), 1fr)`. Measured at 1440
  with the composer closed: nav pane 1376px, three columns of ~430px, 0 of 9
  titles ellipsised. The row title stopped claiming spare width (`flex: 0 1
  auto`) so a lone pinned row's chips sit beside its title rather than 1300px
  away.
- **Copy tightened where it was reading material**: the title hint, the folder
  hint, the editor hint, and the photo stager's two hint lines folded into
  one. "Add an entry" is "New entry", matching the trigger that opens it. The
  read-only pane head is "Entries" rather than "My entries".

**What was rejected, and why.**

- *Collapsing the composer behind a launcher on phones.* The capture path is
  the phone's primary job (a student at a bench photographing a page), the
  stack order is pinned by `tests/notebook-shell.test.ts` and CLAUDE.md, and a
  collapsed form hides the check-in prompt the composer opens with.
- *An overflow "More" menu for the entry's secondary controls.* A menu is a
  different contract (`aria-haspopup`, outside-dismiss), it hides Delete and
  Rename behind a second press, and the labelled-tool decision was measured by
  a prior pass. Moving the whole strip to the open entry gave the phone feed
  back without a new contract.
- *Rain in the notebook.* The classroom hides the shell's `.bg-fx` and so does
  the notebook; the room is opaque; "the same surfaces as your classes" means
  no rain. `notebook-site-matrix.mjs` asserts no canvas.
- *A table or spreadsheet node.* Decision 08 is open; nothing here designs
  around one.
- *Retiring the notebook's own picker in favour of the site theme.* Light and
  IDEA have notebook reasons (paper for reading photographs in shop light;
  the program plate), so the picker stays and only its DEFAULT defers.
- *A profile-stored plate.* Per-browser is the settled argument in both
  stores' headers.
- *Editing `CLAUDE.md`, `docs/decisions/12-*` and `classroom-updates.json`.*
  All three are outside this bundle's owned surface with four lanes running
  beside it; the exact edits are listed under "For the owner" below.

### 29. Theme parity, and a Matrix plate

The site theme is `data-theme` on `<html>` (`ThemeRoot`, one value, `matrix`,
session-gated); the notebook's is `data-nb-theme` on `.nb-root` (absent =
default, `light`, `idea`). The notebook's DEFAULT plate is defined as "the
classroom's console register" but its six register tokens were LITERALS in
`colors.css` (for a cycle-avoidance reason that still holds), so when the site's
Matrix theme repainted `--surface-0/1/2`, `--text-1/2` and `--boundary`, the
notebook did not follow. That is the brief's sentence.

**Agree where agreeing is right.** The default plate now FOLLOWS the site
theme, in CSS alone: `:root[data-theme='matrix'] .nb-root:not([data-nb-theme])`
declares matrix.css's six register literals (specificity (0,4,0) over the
default block's (0,2,0), so import order decides nothing). "Default" means
"the same surfaces as your classes", and the site theme decides what the
classes look like; this is the notebook's control deferring, not two controls
fighting -- the argument `matrix.css`'s header made against reaching into the
room is answered by the room reaching out.

**Diverge where the notebook has a reason.** Light and IDEA are explicit
choices and do not follow the site theme. Semantic and identity colours never
move: brass stays `var(--gold)`, the five folder colours and the seven
`--nb-cell-*` inks and four fills are byte-identical to the default plate
(pinned by test). Only chrome moves.

**And a Matrix option.** A fourth explicit plate, `data-nb-theme='matrix'`,
sharing ONE declaration block with the site-following selector so the two
cannot drift. The picker has four rows; the Default row's note reads
`notebookDefaultNote(siteTheme())` ("Following the site theme: Matrix right
now") so a student can see why the notebook already looks like the site; the
trigger carries `data-plate` (painted) beside `data-theme-state` (chosen).
The pure half moved to `src/lib/notebook/notebook-theme.ts`, the
`$lib/theme.ts` / `theme.svelte.ts` split, and `notebook-theme.svelte.ts`
re-exports every name it always exported, so `NotebookView` and
`ReviewConsole` changed only a comment.

**Measured, computed by script and pinned by `tests/notebook-theme.test.ts`
(35 tests), never typed.** Register: bg #020402, surface #080e09, surface-dim
#0c150d, ink #dce8dc, ink-soft #8fae94, boundary #64826b (matrix.css's own).
Authored: ink-faint #65866a, ink-hover #c3d8c3, masthead #0c150d with a
hairline edge, shot island on the matrix ground hue.

| token | bg | surface | surf-dim | wash/bg | wash/surf | wash/dim |
|---|---|---|---|---|---|---|
| ink | 16.28 | 15.43 | 14.72 | 12.68 | 11.55 | 10.78 |
| ink-soft | 8.47 | 8.03 | 7.66 | 6.60 | 6.01 | 5.61 |
| ink-faint | 5.07 | 4.80 | 4.58 | 3.94 | 3.60 | 3.35 |
| brass | 8.96 | 8.50 | 8.11 | 6.98 | 6.36 | 5.93 |
| ok / error / warn | 9.82 / 8.25 / 9.33 | 9.31 / 7.82 / 8.84 | 8.88 / 7.46 / 8.44 | 7.65 / 6.42 / 7.27 | 6.97 / 5.85 / 6.62 | 6.50 / 5.46 / 6.18 |

Boundary 4.85 / 4.59 / 4.38 (floor 3). Cells: on time 4.90, late 5.07,
awaiting 5.30, flagged 5.11 on their fills; excused 9.72, missing 5.83,
scheduled 6.46 on the card. Folders on the card 8.27 to 9.97. Ink-faint fails
the three wash cells, exactly as the default plate's does, and the room's rule
already covers it: muted copy on the wash takes `--text-2`, which clears all
six (worst 5.61). Mutation proof: one digit of `--nb-surface` in the matrix
block reddens the parity assertion alone (1 failed / 34 passed), file restored
from a copy, md5 identical.

**In the browser** (harness, both widths, `/dev/notebook?plate=matrix` and
`/dev/notebook?site=matrix`, the second through `setSiteTheme` -- the shipping
call ProfileMenu makes -- plus the attribute ThemeRoot would write with a
session): privacy line 8.47, chip meta 8.03, brass 8.5, title 16.28, result
count 4.8 on the card and 5.07 on the page, pick meta 4.58 recessed and 6.03
on the wash, picker trigger word 14.87 on the masthead band, trigger 65 x 44 /
87.4 x 44. Identical numbers on both routes, which is the one-block claim
measured. No rain canvas. `data-plate="matrix"` with `data-theme-state=
"default"` on the site route.

### Verification

- `svelte-check`: 0 errors / 37 warnings at 31/5/1, re-derived after every
  edit.
- Tests: the 19 files that mount or pin the notebook and the theme layer,
  527 passed, run serially; a first parallel run tripped the parallelism trap
  (`pg_authid_rolname_index`) on a db file, which is the harness racing and not
  the code, and passed serially. The full suite is reported at the end of this
  entry.
- Browser harness, every `notebook`-matching spec (12 specs, 24 runs): the two
  standing rows are gone; one classroom-split route failed a prepare click on
  a cold sequence and passed on re-run (2 attempts), which this bundle did not
  touch.
- Screenshots at 375 and 1440 on the default, light and matrix plates, read by
  eye from the harness Chromium (it composites): the head, the toolbar, the
  three-column feed with nothing open, the phone feed as a list.

**Not verified:** the live project, a signed-in session, a real phone. The
harness measures text in the fallback stack (web fonts are blocked) and does
not exercise `prefers-reduced-motion`. `tests/dom/` mounts nothing here.

### For the owner (outside this bundle's surface, exact edits)

- `CLAUDE.md`, Visual theme, the `.nb-root -- notebook editorial` bullet:
  "default / light / IDEA palettes" is now four, and the default follows the
  site theme; the sentence "Every `--nb-*` token. The notebook has its OWN
  plate picker, and a site theme reaching into a room that already asks the
  question is two controls fighting" in `matrix.css`'s header is now answered
  by the room's own block (the site theme still touches no `--nb-*` token).
- `docs/decisions/entries/12-*`: item 2 (the toolbar links) is fixed by this
  bundle, measured above; the 32px-at-phone-width question is moot because
  the controls took a line of their own.
- `classroom-updates.json`, a student-readable entry: "Your notebook opens on
  what needs doing. The page now starts with your next check-in and any
  drafts still to turn in, both one tap from the form. On a phone the list of
  entries is a list again: an entry's buttons appear when you open it. The
  appearance menu gained Matrix, and Default now follows whatever site theme
  you picked."

### The full pass, on the committed tree

`npm test`: **345 files, 6793 tests passed, 2 failed**, and the two were
`tests/derived-numbers.test.ts` reading a measured README region that had not
yet covered the two new specs; after the region below was regenerated it is
**18 passed** serially. 347s.

`npm run verify:browser`, full, on commit `947c3e5` with `dirty: false`, Vite
pre-started on 5199 and reused (server boot 62ms): **316 route/width runs,
5356 measurements, 0 outside threshold, 798.0s**; selftest **70 controls (36
negative, 34 positive), 0 instrument failures**. The two `/dev/notebook`
tap-reach rows that were the only outside rows of every pass since 2026-09-05
are gone, and the two new matrix routes are covered (158 of 158 specs). The
measured region of `tools/browser-verify/README.md` is regenerated from that
run's own JSON (`--from`), never edited.

`svelte-check`: 0 errors / 37 warnings at 31/5/1, unchanged from the baseline.
