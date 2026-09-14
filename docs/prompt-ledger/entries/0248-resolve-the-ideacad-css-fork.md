# 0248 Resolve the ideacad.css fork

- Issued: 2026-09-14
- By: router chat
- Owns: `src/lib/ideacad/ideacad.css`, `src/lib/ideacad/ui/**`,
  `src/lib/ideacad/BladeEditor.svelte`, `src/lib/ideacad/viewport/**`,
  `docs/prompt-ledger/entries/0248-*`, and its own `docs/history/` entry.
- Forbidden: `src/routes/**`, `src/lib/classroom/**`, `transports.ts`,
  `store.ts`, `workspaces.ts`, any `blade/*.ts`, any migration.
- Migration permitted: no. **Claims: none.**
- Status: pushed
- Branch: `claude/hopeful-archimedes-7nlrwr`, branched from `main` at `799d2033`.
- Supersedes: PR #96 (ledger 0231). That branch is merged INTO this one by
  content rather than landed on its own, so #96 closes unmerged and its three
  commits reach `main` through this branch.
- Notes: `src/lib/ideacad/ideacad.css` was written from nothing by TWO lanes off
  different bases -- ledger 0231's scoped `.ic-root` token system (unmerged on
  PR #96) and ledger 0232's 19-line `.ic-dense` density patch (landed on
  `main`) -- so the file had two authors and no common ancestor. This resolves
  all 13 conflict hunks across four files hunk by hunk, keeps ONE definition of
  every token and selector, and reverses exactly one landed decision: the 24px
  density claim on the editor's root element, because `ItemDetail.svelte`
  mounts that component for a student. It also clears `var(--copper)`, a
  custom property referenced six times under `src/lib/ideacad/ui/` and defined
  nowhere in `src/`. No geometry, physics or validation is touched.
