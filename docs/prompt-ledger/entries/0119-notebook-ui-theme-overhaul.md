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
- Status: issued
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
