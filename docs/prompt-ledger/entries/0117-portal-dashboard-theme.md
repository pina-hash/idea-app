# 0117 Six reports on the portal shell: home order, class disclosure, profile page, dashboard, matrix rain reach, one admin app

- Issued: 2026-09-10
- By: Mr. Pina, six reports in his own words, routed as one portal-shell lane
  beside 0118 (classroom), 0119 (notebook), 0120 (gauntlet) and 0121
  (site-versions).
- Owns: `src/routes/+page.svelte`, `src/routes/dashboard/**`,
  `src/lib/AppLauncher.svelte`, `src/lib/ProfileMenu.svelte`,
  `src/lib/portal-apps.ts`, `src/routes/admin/**`,
  `src/lib/design-system/themes/ThemeRoot.svelte`, `src/routes/dev/portal*/**`
  and `src/routes/dev/themes/**`, their tests and route specs, the generated
  regions of `tools/browser-verify/README.md`,
  `docs/prompt-ledger/entries/0117-*`, and its own `docs/history/` entry.
- Does NOT own: `src/lib/site-versions.ts` (0121), `src/lib/classroom/**`
  (0118), `src/lib/notebook/**` (0119), `src/lib/gauntlet/**` (0120). Report,
  change nothing.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0192
- Lands on: `integration`, then `main` against the six-item checklist, with
  the standing note that gate 4's probe cannot pass in this container and that
  neither substitution on record (0114, 0115) generalises here: if a migration
  is in range at that gate, the session stops.
- Status: pushed
- Branch: `claude/portal-dashboard-theme-vycnkh`, from `origin/main` at
  `b03a941`. Report 22 was diagnosed and handed to 0118 (the fix is in
  `ClassroomFeed.svelte`); the FRC queue controls on the console measure
  18.4 and 26.2px and are handed to the owner of `src/lib/frc/**`.
- Notes: the six reports, numbered as issued. 21: for STUDENTS the apps come
  before their classes on the home page (staff ordering is not this). 22: a
  collapsed class opens in one click, not two. 23: the profile customization
  page looks dated, a judgment item decided against `src/lib/design-system/`
  with the chosen and rejected directions stated. 24: the dashboard is plain,
  sorts by most used, and uses the full screen (Mr. Pina runs 2844x1450;
  `app.css` caps `<main>` at 880px and the editor shell and maps viewer already
  release it). 25: the matrix rain background on many more pages, by finding
  where `.bg-fx` is absent or painted over, never touching GAUNTLET, GREENLINE,
  VANGUARD or FRC. 26: site admins and the admin dashboard become one app.
  Ledger 0108 split the changelog out of `+page.svelte` into an awaited virtual
  module; `entries` is never statically re-imported. Every surface here is a
  signed-in student surface, so 44px tap targets are measured at 375 and 1440.
