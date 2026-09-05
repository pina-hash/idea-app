# 0038 Avatars phase two: the surfaces 0033 mapped and deliberately left
- Issued: 2026-09-04
- By: router chat for IDEA portal work
- Owns: `src/lib/Avatar.svelte`, `src/lib/avatars.ts`, the roster list in `GradingConsole.svelte`, `SectionGrid.svelte`, `ReviewConsole.svelte`, `EntryReview.svelte`, the roster reads in `src/lib/notebook/transports.ts`, one migration (conditional), `src/routes/dev/avatars/**`, `tests/avatar*`, `tests/db/avatar*`, `tools/browser-verify/routes/avatars*.mjs`, the generated regions in `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0038-*`, and its own `docs/history/` entry.
- Migration permitted: at most one, number taken at commit time. Highest on origin/main at issue: 0179. TAKEN: `0180_notebook_grid_avatar.sql`, verified free across all nine remote refs at commit time
- Status: pushed
- Branch: `claude/avatars-phase-two-surfaces-42h0pb`
- Notes: Prompt 0033 built the avatar component and wired two surfaces, then
  wrote a privacy map and a list of what it deliberately left. This bundle
  takes the items on that list whose audience the map already proved is the
  same as the audience that sees the person's name.

  From 0033's map, all measured in the harness rather than read off a policy:
  GradingConsole's roster list is staff-only and was skipped only because
  0033 was scoped to the identity row. SectionGrid, ReviewConsole and
  EntryReview are staff-only, and were skipped only for migration budget: a
  second RPC family. No student-reviewer path exists, because the 0169 tier
  is domain-locked in `notebook_reviewer_grant`.

  0033 also measured that the `avatars` bucket is PUBLIC: an anonymous caller
  reads any object. The bytes were never private; the PATH is what protects a
  face, and `profiles.avatar` is own-row-or-admin. Any read this bundle adds
  must keep that property.

  And 0033 found a real bug on the way: `initials()` bottoms out in
  `displayName()`, whose last rung is 'Signed in', so a nameless roster row
  rendered as the initials "SI".

  Deliberately excluded: the GAUNTLET leaderboard, which already shows
  student faces to every signed-in student and is Mr. Pina's decision, not a
  precedent; `/classroom/view-as`, which is admin-only and needs its picker
  widened separately; and every public or anonymous surface.
