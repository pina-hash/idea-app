# 0119 Notebook UI/UX overhaul, and theme parity with a matrix option

- Issued: 2026-09-09
- By: Mr. Pina, one of five parallel lanes (0117 owns the portal, including
  `src/lib/design-system/themes/ThemeRoot.svelte`).
- Owns: `src/lib/notebook/**`, `src/routes/notebook/**`,
  `src/routes/api/notebook/**`, `src/routes/dev/notebook*/**`, `tests/notebook*`,
  `tests/dom/notebook*`, `tools/browser-verify/routes/notebook*.mjs`, the
  generated regions of `tools/browser-verify/README.md`,
  `docs/prompt-ledger/entries/0119-*`, and its own `docs/history/` entry. The
  notebook's OWN theme system (`notebook-theme.svelte.ts`, `notebook-theme.css`,
  `NotebookThemeToggle.svelte`) is inside that surface; `ThemeRoot.svelte` is
  not, and a change it needs there is reported, never made.
- Migration permitted: no. Claims: none. Schema need is a STOP and a report.
- Status: pushed
- Branch: `claude/notebook-ui-theme-overhaul-t3dc3a`, branched from
  `origin/main` at `b03a9410`.
- Notes: two reports. (28) "Overhaul the notebook UI/UX" -- the whole brief; the
  session decides a direction, builds it, and states what it chose and what it
  rejected. (29) Theme parity with the site theme system and a matrix option for
  the notebook, agreeing where agreeing is right and diverging only where the
  notebook has a reason.

  Decision 08 (`docs/decisions/entries/08-notebook-spreadsheet.md`) is OPEN and
  is not prejudged: no table or spreadsheet node is built, designed around, or
  closed.

  Standing measured finding: `/dev/notebook` carries the repo's only two rows
  outside threshold, `tap-reach` on the toolbar text controls at 375 and 1440,
  32.5 x 45 against a 44px floor (decision 12, item 2). This bundle fixes them or
  says why not, and says which.

  Harness Vite boot is 180 to 187s cold against a 180s window: Vite is started
  separately on 5199 and reused. No `pkill -f`. No migration. Push, never
  force-push.
