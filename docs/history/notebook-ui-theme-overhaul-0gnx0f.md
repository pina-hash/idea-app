---
title: "Prompt 0119: the notebook overhauled into a bar and two panes that own their scroll, decision 12's toolbar closed on its own arithmetic, and a Matrix plate the notebook's default follows from the site (`claude/notebook-ui-theme-overhaul-0gnx0f`, no migration)"
date: 2026-09-09
branches: [claude/notebook-ui-theme-overhaul-0gnx0f]
migrations: []
subsystems: ["Digital notebook", "Site themes", "Browser harness", "Testing"]
---

Two reports, one bundle, no schema. Report 28 was the whole brief in one
sentence, "overhaul the notebook UI/UX", over 41 files and 17,640 lines; report
29 was theme parity between the site's theme system and the notebook's own,
plus a Matrix option in the room. Decision 08 (a spreadsheet or table node) is
untouched in every direction: nothing here builds one, designs around one, or
closes it.

### Report 28: the direction, and what was rejected

**THE NOTEBOOK IS A WORKING SURFACE, NOT A PAGE, AND IT WAS DRESSED AS A
PAGE.** Every visit opened on an eyebrow, a 2.15rem title, a three-line
paragraph about who can see the notebook, and a chip row: measured, ~355px of
chrome above the working surface (the two-pane history entry's own figure),
read once by a student who comes to this page to photograph a page and file it.
The review console had already been rebuilt around "every row above the grid is
a row of the grid not on screen"; the student's notebook is the same shape and
had not been.

What was built:

- **One bar where the hero was** (`.nb-bar`, `data-testid="nb-bar"`): the
  eyebrow and a 1.55rem title on the left; the facts a student comes here to
  check as chips (the class, `N entries`, `N drafts` in the warning thread,
  `N check-ins to file ›` as a BUTTON that brings the compose form forward
  with the nearest outstanding check-in already picked, and the Section review
  link for staff); and the page's one primary action, `New entry`, on the
  right above the breakpoint. The one line of the old paragraph that was doing
  work -- only you, your instructor and the chair can see this -- survives as a
  note under the bar, and only for the student: the read-only mounts (the
  per-student review page, view-as) already name whose notebook it is in their
  own strip, and the title there reads "Notebook" rather than "My Notebook",
  which it used to say to an instructor.
- **An application frame, conditionally.** The wrapper is `class:cr-app=
  {masthead}` and the main is `class:cr-app-body={masthead}`: when this
  component owns the page, above 1024px the frame is the viewport and the
  split is `scroll="fill"`, so the list pane and the compose pane each scroll on
  their own and the document does not (IDEA_INTERFACE_STANDARDS 1: "the page
  does not scroll; the panes do"). When it does not own the page --
  `/classroom/view-as/<email>/notebook` mounts the whole thing under the
  classroom's shell and impersonation banner with `masthead={false}` -- there
  is no frame, and `fill` resolves against an auto height and degrades to
  page-flow by construction, in split.css's own words. Measured on the view-as
  harness route at both widths: 0px overflow, heading contrast 15.42 / 16.19.
  `tests/notebook-shell.test.ts` moves NotebookView from `page` to `fill` in
  its surfaces map and pins that the frame class is conditional and never bare.
- **The list pane is a head and a body.** The head -- "Entries" with the
  result count beside it, the search, and the tools row -- stays put while the
  body scrolls, through the mechanism split.css already offers a fill pane's
  direct child (`max-height: 100%`). The folder rail and the filter chips are
  the FIRST thing in the body rather than in the head, and that was a
  measurement, not a taste: with them in the head it was 430px of a 587px pane
  at 1440 (eight 44px folder chips wrapping to three lines in a 26rem pane,
  six filter chips to two more) and the list had 157px to scroll in. A folder
  and a filter are set once and read; the search and the sort are used while
  scanning. After: head 146px, body 441px.
- **Nothing open is one pane.** `hasDetail` is now "the entry you picked, or
  the compose form", and with neither the detail pane is not rendered and the
  list takes the whole measure, laying its rows out in as many 28rem columns
  as fit (two at 1440). The sentence that used to occupy the empty pane --
  "Pick an entry on the left to read it" -- was the placeholder
  IDEA_INTERFACE_STANDARDS 1 names, and it is gone along with
  `nb-detail-empty`.
- **The compose pane** keeps every field and every sentence it had (the
  check-in picker, the guidance disclosure, title and folder, the stager, the
  editor, the autosave notes), reordered so the two short fields share a line
  above the breakpoint and every explanatory sentence sits ABOVE the actions
  row -- because above the breakpoint the actions row (Turn in, Save draft,
  progress, the SaveIndicator) is now `position: sticky; bottom: 0` inside the
  pane's own scroll, on the card's surface under a hairline, so the two
  controls the form exists for are on screen however far down a 1210px form
  the student is. Below the breakpoint it flows where it always did: a bar
  pinned over a phone's viewport would cover the control a thumb was reaching
  for. The card's heading names the picked check-in ("Gearbox build (both
  periods)") and falls back to "Add an entry" for a free entry.
- **Below the breakpoint, the phone's notebook is what it was**: the compose
  card first, the feed under it in its card chrome, the `full` cards expanding
  in place, `narrow="stack"` unchanged. What a phone gained is the bar (144px
  at 375, against the hero's ~300) and the toolbar below.

**What was rejected, and why.**

- *A full-height frame under view-as too.* Would clip the notebook by exactly
  the classroom shell's height, silently, on an admin preview. The frame is
  keyed on `masthead`, and the shell test asserts it.
- *Letting the site theme's rain into the room.* See report 29.
- *Collapsing the phone composer behind a "New entry" strip.* CLAUDE.md and the
  harness spec both record that a phone has always shown the form above the
  feed; a student at a bench who opens the notebook to snap a page should not
  find the camera behind a tap. Left as it was, deliberately.
- *Thinning the collapsed card's tool row on the phone.* Every collapsed card
  at 375 carries a folder select and up to five labelled tools (Pin, Copy,
  Rename, Move to drafts, Delete), which is most of each card's height. The
  history entry that put filing in the row explains why it is there (a student
  had to open an entry and scroll past everything to discover filing was
  possible), and "every control carries a visible word" rules out a glyph
  strip. This is the largest remaining density cost on the phone feed and it
  is reported rather than reversed: it is a recorded decision, and reversing it
  from an overhaul brief without asking is the "resolve silently toward the
  document" shape IDEA_INTERFACE_STANDARDS 12 refuses.
- *Rendering the composer only when there is something to file.* A notebook is
  a capture tool; the form is its primary act and a student arriving from a
  classroom deep link expects it open. The nothing-open state is reachable by
  the form's own Close, which is enough.

### Decision 12: the toolbar rows, closed on step 1

`/dev/notebook` carried the repo's only two standing outside-threshold rows for
weeks: `tap-reach` on `.tools .inline-link` at 375 and 1440, walked 32.5 x 45
against the 44px floor. Prompt 0047 had narrowed the question to "may `.tools`
wrap, for 32px at phone width", because at 375 the row had 293px and four 44px
boxes plus the sort control need 346.6px.

The toolbar was rebuilt rather than patched, and the arithmetic came out
better than the decision entry expected. The four underlined words are
`.tool-btn` boxes now -- `min-height: 44px; min-width: 44px`, a hairline
border, the room's surface -- on a row with `flex-wrap: wrap` and `min-width:
0` (the second is CLAUDE.md's own automatic-minimum trap, and the reason the
old row overflowed the page rather than itself), and the result count moved up
beside the "Entries" heading so the row carries only controls. **Measured at
375 in the busiest ordinary state (Sort, Expand all, Select): 112 + 78.4 +
57.5px, all three on ONE line at y=2738, 44px each, `scrollWidth 375 ==
clientWidth 375`.** The 32px second line the decision priced in is paid only
when a query is active and `Clear` joins them. At 1440 the row has two
controls and fits with room. Harness rows: `tap-target` on `.tools .tool-btn,
.tools .sort select` reports smallest 137.4 x 44 at both widths; the old
`tapReach` row for `.tools .inline-link` is deleted because the class is no
longer on that row, and the spec says so beside the swatch row that stays.

The decision entry itself (`docs/decisions/entries/12-*`) is not in this
bundle's ownership and is not edited; its toolbar item is closed by this
record and the harness, and the entry can say so when its owner next touches
it. `.inline-link` with its height-only reach still serves its two prose call
sites ("Clear the filters", "Manage folders"), which are the exempt case.

### Report 29: parity, and the one divergence with a reason

**The two theme systems were two answers to one sentence.** The notebook's
default plate is documented as "the same surfaces as your classes", and maps
six tokens one to one onto the classroom's console register. The site theme
(`$lib/theme.svelte.ts`, `ThemeRoot`, `matrix.css`) repaints that register on
`<html data-theme='matrix'>` while a session holds -- and the notebook, keyed
only on its own `data-nb-theme`, kept painting the UNTHEMED register beside a
themed classroom. matrix.css touches no `--nb-*` token on purpose ("a site
theme reaching into a room that already asks the question is two controls
fighting over one surface"), which is right; the answer is the notebook's to
give, from its side.

What was built, all inside the notebook's own theme system:

- **A fourth plate, `matrix`**, declared in `notebook-theme.css` under TWO
  selectors as one block: `.nb-root[data-nb-theme='matrix']` (chosen in the
  room) and `:root[data-theme='matrix'] .nb-root:not([data-nb-theme])` (the
  default plate under the site attribute). Nothing in JS decides the follow;
  the cascade reads the attribute ThemeRoot wrote, which is the one answer to
  "what did the site decide". Specificity (0,4,0) beats the default block's
  (0,2,0). An EXPLICIT light or IDEA plate carries the attribute and is left
  alone: the room's own control wins inside the room, which is the divergence
  the brief allows -- a student who picked paper for reading photographs
  picked it for a reason. The canvas mirror (`:root:has(...)`) follows the same
  two routes, or the page behind the wrapper would paint the light default
  under a black notebook.
- **The six register tokens are matrix.css's own values, to the byte**
  (`#020402 / #080e09 / #0c150d / #dce8dc / #8fae94 / #64826b`), and
  `tests/notebook-theme.test.ts` reads both files and compares them, with the
  default plate's map onto the unthemed `:root` as the positive control on the
  reader. That is the "agree where agreeing is right" half made checkable: a
  value that drifts in either file reddens.
- **Authored where the register has no counterpart**, computed on this plate's
  grounds: `--nb-ink-faint` is hsl(128 12% 50%) = `#708f74`, because matrix's
  `--text-3` (`#4f6853`) measures 3.37 / 3.19 / 3.05 on bg / surface / dim --
  the same failure the default plate records for the unthemed `--text-3`; the
  authored value clears at 5.75 / 5.45 / 5.20 and sits 12 lightness points
  under `--nb-ink-soft`. The accent is the IDEA plate's mint `#6cf4b5`
  rather than the rain's `#00ff41`: matrix.css spends the vivid phosphor on
  the rain alone and pulls every text tier to 12-21% saturation, and a
  full-chroma link colour would undo that one room over; the mint is already
  measured against the grid's seven status inks (15.75+ CIEDE2000 from every
  one), which are identical on every dark plate. Folders, the photo island,
  the cell inks and the PINNED cell fills are the dark plates' own.
- **Where the block lives is stated in the block.** Every other plate's values
  sit in `colors.css` beside the light palette, and this belongs there too; it
  is in `notebook-theme.css` because this prompt owns the notebook's theme
  system and not the design-system layer, which another lane (0117) owned at
  the same time, and a conflict in `colors.css` with a portal lane is worse
  than a plate one file over. It is a cut-and-paste move for whoever next
  touches `colors.css`; the test reads it from `notebook-theme.css` until then.
- **The picker says what is showing.** `NotebookThemeToggle` reads
  `<html data-theme>` through a MutationObserver (`watchSiteThemeOnDocument`
  in the store) -- off the DOCUMENT, never off `$lib/theme.svelte.ts`, because
  the store is the preference and the attribute is the decision, with
  ThemeRoot's session gate between them; a second reading of that gate is what
  would stop agreeing with it (a harness with no session and a stored 'matrix'
  is the case where it already would). `notebookPlateShowing(stored, siteAttr)`
  is the pure mirror of the stylesheet's selector pair. The trigger reads
  "Matrix" when the room IS matrix, carries `data-theme-state` (stored) and
  `data-theme-showing` (resolved), and the Default row's note becomes
  "Following the site theme: Matrix right now". A fourth row, with a
  falling-code glyph that does not move, chooses Matrix for the room alone.
- **The rain does not enter the room, and that is the divergence with a
  reason.** `.nb-root` is opaque and `body:has(.nb-root) .bg-fx` is hidden, so
  the canvas ThemeRoot mounts inside `.bg-fx` is never behind the notebook.
  Letting it through would mean a transparent page ground under a list whose
  rows paint their titles straight onto it, and the rain's legibility figure
  (matrix-rain.ts) is measured against the portal's content band, not a 26rem
  list of entry titles; a photograph of a notebook page over falling glyphs is
  also not a reading surface. Under Matrix the notebook is the theme's
  grounds, tiers and boundary with no motion -- what a reduced-motion reader of
  the portal gets.

**Measured in Chromium 141 (the harness), on the plate rather than assumed**,
in two new route specs (`notebook-plate-matrix.mjs`, reached through the
shipping picker: open the menu, pick Matrix, and the attribute, the stored key
and the trigger word all say so; `notebook-plate-follow.mjs`, with the site
attribute written by hand because the harness holds no session and ThemeRoot
therefore cannot write it, which the spec says in its own header):

| what | ground | ratio |
|---|---|---|
| entry titles, worst = the untitled row (`--text-3`) | page `#020402` | 5.75 |
| entry meta stamps (`--nb-ink-faint`) | page | 5.75 |
| title hint on the compose card | card `#080e09` | 5.45 |
| privacy note (`--text-2`) | page | 8.47 |
| the check-ins chip (accent as text) | page | 14.93 |
| selected folder chip name | accent wash on card | 11.21 / 12.41 |
| muted copy on the selected pick (`--text-2`) | wash | 5.84 |
| picker trigger word | masthead band `#0c150d` | 14.89 |
| "Following the site theme" note | current row's wash | 5.84 |
| other rows' notes (`--text-3`) | menu surface | 5.45 |

64 measurements over the two specs at both widths, 0 outside threshold; the
four plate rows measure 341 x 52.7 (375) and 262 x 52.7 (1440) with the menu
open. The review console on the same plate was driven and screenshotted at
1440: 30 cells, every status ink and fill as on the other dark plates.

### Verified

- `svelte-check`: 0 errors / 37 warnings at 31/5/1, re-derived before and
  after (the baseline first, with a placeholder `.env`, then twice more over
  the restructured tree). No number moved.
- `tests/notebook-theme.test.ts` (new, 10): the registry, the resolution
  function in both directions, parity of the six tokens against matrix.css
  with the default plate as positive control, every authored hex ink on the
  three grounds (30 cases, 4.5 for text and 3 for the boundary), the faint tier
  measurably below the soft one, matrix.css still touching no `--nb-*` token,
  and the pinned cell fills.
- `tests/notebook-shell.test.ts` (63): NotebookView's scroll mode is `fill` in
  the surfaces map, the frame class is asserted conditional, the page-flow
  sweep's positive control no longer counts the notebook (it is now one of
  three exempt page-flow mounts plus one `fill` mount that reveals). Every
  other notebook test file run alongside passed: shell, page-load, view-as,
  entry-controls, guidance-surfaces, draft-state, text-only-entry,
  entry-title, folders, pin-activity, soft-delete-restore, scheduled-check-ins,
  composer-effect-reactivity (the two NotebookView allowlist entries hold),
  boundary-token (still four plates, 15 cases: it reads `colors.css` by
  opening selector and the matrix block is in `notebook-theme.css`; extending
  that list is its owner's), theme-preference, theme-tokens.
- Browser harness over every notebook route at 375 and 1440, on the running
  Vite on 5199: 20 route/width runs, 242 measurements, 0 outside threshold --
  the two decision-12 rows gone from the outside list for the first time since
  they were written. Full run over the committed tree: see the regenerated
  measured region of `tools/browser-verify/README.md` (its numbers are the
  record; this entry does not restate them).
- Geometry at 375, after a defect this bundle introduced and fixed: the list
  head as a `display: grid` sized its `auto` track to the folder rail's
  min-content contribution (618px, because the rail's strip scrolls rather
  than wraps at that width) and put 276px of overflow on the document with no
  element reported past the edge. A column flex container gives every child
  the container's width and lets the strip scroll inside it; after the fix,
  `scrollWidth 375 == clientWidth 375`. The rule is beside the CSS.
- The dev harness `--selftest`: 70 controls, 0 instrument failures, before any
  spec was changed.

### NOT verified

- No signed-in session anywhere in this bundle: `/notebook`, `/notebook/review`
  and view-as were driven only through their `/dev` harnesses against
  fixtures. The follow behaviour was proven by writing `data-theme` on `<html>`
  by hand (the harness holds no session, so ThemeRoot cannot write it); the
  shipping switch itself is proven on `/dev/themes` by `themes-state-matrix.mjs`,
  unchanged here.
- Text was measured in the fallback stack (the harness blocks
  fonts.googleapis.com) and `prefers-reduced-motion` was `no-preference`,
  per the harness README's two standing limits.
- The full test suite: run once at the end; its outcome is in the ledger
  entry's final notes and in this bundle's report, not restated here.

### Left undone, by name

- `CLAUDE.md` still says the notebook has three plates in four places (the
  Visual theme section's "default / light / IDEA palettes", the review-grid
  rule's "all three plates", the Pending rule's three-plate figures, and the
  wash rule's "three plates x three grounds"). It is not in this bundle's
  ownership and is not edited; the corrections are one word each and this
  entry names the lines.
- `docs/decisions/entries/12-*`'s toolbar item is closed by this bundle's
  measurement and is not edited for the same reason.
- The matrix plate block belongs in `colors.css` beside the other three; see
  above for why it is in `notebook-theme.css` today.
- `ThemeRoot` could export its derived "attribute I am writing" so a room
  need not observe the document; the observer is the right shape until it
  does, and the change is 0117's file.
- The phone feed's per-card tool row, named above as the largest remaining
  density cost, is a question for the decision that put it there.
