# 0119 Overhaul the notebook UI/UX; theme parity and a matrix option

- Issued: 2026-09-09
- By: Mr. Pina, one of five lanes (0117 owns the portal, including
  `src/lib/design-system/themes/ThemeRoot.svelte`).
- Owns: `src/lib/notebook/**`, `src/routes/notebook/**`,
  `src/routes/api/notebook/**`, `src/routes/dev/notebook*/**`,
  `tests/notebook*`, `tests/dom/notebook*`,
  `tools/browser-verify/routes/notebook*.mjs`, the generated regions of
  `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0119-*`, and
  its own `docs/history/` entry. The notebook's OWN theme system
  (`notebook-theme.svelte.ts`, `notebook-theme.css`,
  `NotebookThemeToggle.svelte`) is in scope; `ThemeRoot` is not, and a change
  it would need there is reported rather than made.
- Migration permitted: no. Claims: none.
- Lands on: the branch. Merge is not granted by this prompt's ending.
- Status: pushed
- Branch: `claude/notebook-ui-theme-overhaul-0gnx0f`, branched from
  `origin/main` at `b03a9410` (HEAD, `origin/main` and `origin/integration`
  identical at session start; clone unshallowed, `origin/integration`
  fetched, identity `Claude <noreply@anthropic.com>` already set).
- Notes: TWO REPORTS.

  **28. "Overhaul the notebook UI/UX."** The whole brief. Read the surface
  (41 files, 17,640 lines at issue), choose a direction, build it, and say in
  the report what was chosen, what was rejected, and why.

  **29. Theme parity, and a matrix option.** The site theme system and the
  notebook's own are two implementations; a student who picks matrix on the
  site does not get it in the notebook. Give the notebook a matrix option and
  make the two agree where agreeing is right and diverge only where the
  notebook has a reason.

  **ONE DECISION IS OPEN AND IS NOT PREJUDGED**: decision 08
  (`docs/decisions/entries/08-notebook-spreadsheet.md`) asks whether the
  notebook gets a spreadsheet or table node. Nothing here builds one, designs
  around one existing, or closes it.

  **MEASURED AND STANDING**: `/dev/notebook` carries the repo's only two
  long-standing outside-threshold rows, at 375 and 1440, `tap-reach` on the
  toolbar text controls, measured reach 32.5x45 against a 44px floor
  (decision 12, the toolbar half). Fix them or say why not; either way say
  which.

  The harness Vite boot is 180 to 187 seconds cold against a 180 second
  window: Vite is started separately on 5199 and the harness reuses it. No
  `pkill -f`.

  Baseline svelte-check 0 errors / 37 warnings at 31/5/1.

  **OUTCOME.** Both reports built; the record is
  `docs/history/notebook-ui-theme-overhaul-0gnx0f.md`. Report 28: the hero
  became one bar (title, class, entries, drafts, check-ins-to-file as a
  button, Section review, New entry), the student's notebook took the review
  console's application frame so both panes own their scroll above 1024px
  (`scroll="fill"`, conditional on `masthead` so the view-as mount degrades to
  page-flow by construction), the list pane became a pinned head over a
  scrolling body, nothing-open gives the list the whole measure in columns,
  and the compose actions are pinned to the pane's foot above the breakpoint.
  Report 29: a fourth notebook plate, `matrix`, keyed on BOTH the room's own
  attribute and `:root[data-theme='matrix']` over an unset plate, so the
  default ("the same surfaces as your classes") follows the site theme by
  cascade; the picker reads `<html data-theme>` back through a
  MutationObserver and says "Following the site theme: Matrix right now"; the
  six register tokens are matrix.css's values to the byte and a test compares
  the two files. The rain stays out of the room, with the reason stated.

  **DECISION 12'S TOOLBAR ROWS ARE FIXED**, on step 1 of
  IDEA_INTERFACE_STANDARDS 10: the four words are `.tool-btn` boxes on a row
  that wraps, and at 375 the busiest ordinary state (Sort, Expand all, Select)
  fits on ONE line at 44px each with `scrollWidth 375 == clientWidth 375`. The
  harness measures them as `tapTargets` (smallest 137.4 x 44 at both widths);
  the `tapReach` row on `.tools .inline-link` is deleted with the reason
  beside the swatch row that stays. The decision entry is not this bundle's
  file and is not edited.

  **VERIFIED.** svelte-check 0 errors / 37 warnings at 31/5/1 before and
  after. Notebook harness routes: 20 runs / 242 measurements / 0 outside
  threshold; the two new plate specs 4 runs / 64 measurements / 0 outside.
  Full harness run over the committed tree and the regenerated measured
  region: see the README's block and the final notes below. Not verified: any
  signed-in surface (every measurement is a `/dev` fixture); the follow state
  was reached by writing the site attribute by hand because the harness holds
  no session.

  **NOT MINE, NAMED:** `CLAUDE.md` says three plates in four places; decision
  12's entry; the plate block's proper home in `colors.css` (0117's lane at
  the time); `ThemeRoot` exporting its derived attribute. One selector in
  `tools/browser-verify/routes/classroom-view-as-notebook.mjs` was updated
  (`.pane-head h2` no longer exists on the read-only mount, so its contrast
  row matched nothing); that file is outside the `notebook*.mjs` pattern and
  the one-line touch is reported here.

  **FINAL.** Full harness run over `2dcb31f` (clean tree, Vite pre-started on
  5199 and reused): **316 route/width runs, 5318 measurements, 0 outside
  threshold, 810.1s**, selftest 70 controls / 0 failures; both README regions
  regenerated on that commit (`dirty: false`), 158 specs, `derived-numbers`
  green. Full suite once at the end: **345 files / 6770 tests, 0 failures,
  316s**. `origin/main` had not moved from `b03a9410`, so there was nothing to
  pull. Pushed with `-u`, never force. Four commits: the ledger, the work, the
  README regions, the history entry; this status flip is the last change.

