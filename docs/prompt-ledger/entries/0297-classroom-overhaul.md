# 0297 IDEA Classroom overhaul: foundation, catch-up, notebook integration, Space White, shipped live

- Issued: 2026-09-23T12:45:00Z
- By: router chat, for one Claude Code session (Opus 5.5, ultracode)
- Owns: `src/lib/classroom/**`, `src/routes/classroom/**`, `src/lib/notebook/**`,
  `src/lib/notebook*.ts`, `src/routes/notebook/**`, `src/routes/api/notebook/**` and
  `src/routes/api/classroom/**` where a seed needs them, `src/lib/shell/**`,
  `src/lib/design-system/**`, `src/lib/theme.ts`, `src/lib/theme.svelte.ts`, `src/app.html`,
  theme handling in `src/hooks.server.ts`, the theme and banner rules in `src/app.css`,
  `src/routes/+page.svelte` and `src/routes/+layout.svelte` where a banner, theme or deploy
  safety needs them, `src/lib/AppLauncher.svelte` and `src/lib/portal-apps.ts` for the
  Classroom and Notebook entries and theme treatment, `src/lib/ProfileMenu.svelte`,
  `src/lib/brand/**`, `src/lib/marks/ClassroomMark.svelte` and `NotebookMark.svelte`,
  `src/lib/file-drop.ts`, `src/lib/tour/**`, shared components where a theme, border, overlap
  or space defect lives, `svelte.config.js` for deploy safety, tests for these surfaces
  (never `tests/**/ideacad*`), `tools/browser-verify/**` specs and `measured/*.json` for these
  surfaces plus the generated counts in its `README.md`, `src/routes/dev/**` harnesses for
  these surfaces, `docs/classroom/**`,
  `docs/standards/IDEA_CLASSROOM_REBUILD_PLAN.md`, `IDEA_CLAUDE_DESIGN_STANDARDS.md`,
  `IDEA_INTERFACE_STANDARDS.md` and their `REGISTER.md` rows, the sections of `CLAUDE.md`
  whose truth changes, `classroom-updates.json`, `docs/prompt-ledger/entries/0297-*`, and its
  own `docs/history/` entry.
- Does not touch: `src/lib/ideacad/**`, `src/routes/ideacad/**`, `docs/ideacad/**`,
  `src/lib/marks/IdeaCadMark.svelte`, the IdeaCAD launcher entry, `src/routes/dev/ideacad-*`,
  `tools/browser-verify/routes/ideacad-*` (ledger 0296 owns them and is running now on
  `claude/gracious-ride-cdf7jw`; that branch may be swept into `integration` and deleted
  mid-run, so look for its work on `main` and `integration` rather than by branch name), `supabase/**`, `materials/**` (never
  written from a branch), `.github/workflows/**`, `vercel.json`, and the other apps' own
  surfaces beyond measuring them under Space White and scoping the theme.
- Migration permitted: no. Claims: 0227. Highest on origin/main at issue: 0224
- Status: issued
- Branch: assigned by the harness, started from `origin/main`; the final report names it.
- Notes: 0227 is reserved for proposed SQL only, at
  `docs/classroom/overhaul-0297/0227_PROPOSED.sql`, never under `supabase/migrations/`; it is
  released in the history entry if no proposal is written. Migration number 0225 was allocated
  to the unrun ledger 0285 and 0226 is claimed by ledger 0296. The brief is
  `docs/classroom/OVERHAUL_0297.md`, the governing intent is `docs/classroom/VISION.md`, and
  the evidence is `docs/classroom/research/2026-09-23-classroom-research.md`, all committed in
  this entry's commit. Folds in the classroom half of the unrun ledger 0285 (lane E). Merges
  its own branch into `main` when done, approved by Mr. Pina on 2026-09-23 ("merge, commit,
  and push directly to main... automatically go live as soon as it's done"), and confirms the
  deploy against the version production serves.
