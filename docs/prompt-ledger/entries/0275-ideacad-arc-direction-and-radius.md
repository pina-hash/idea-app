# 0275 The IdeaCAD arc tool: which way round, and one radius
- Issued: 2026-09-22
- By: Lane L1, from a student's report of 2026-09-21 19:57 local against build `3793ea2`
- Owns: `src/lib/ideacad/solid/sketch/editor.ts`, `src/lib/ideacad/solid/sketch/model.ts`, `src/lib/ideacad/solid/validate.ts`, `src/lib/ideacad/solid/types.ts`, `src/lib/ideacad/solid/SketchEditor.svelte`, `tests/ideacad-solid-sketching-session.test.ts`, `tests/ideacad-solid-sketching-geometry.test.ts`, one new spec under `tools/browser-verify/routes/` plus the counts block in `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0275-*`
- Migration permitted: no. Highest on origin/main at issue: 0217
- Status: issued
- Branch: `claude/new-session-9tmqf4`
- Notes: Four of the five reported defects are fixed and the fifth is deliberately
  not, with the measurement that decides it. `validate.ts` and `types.ts` are
  UNCHANGED: the prompt asked for the v1 radius guard to be restored in the v2
  validator, and `validateManifest` gates both the save AND the open, so that guard
  would stop a sketch already carrying an inconsistent arc from opening at all --
  turning a sketch a student can still repair by hand into one they cannot reach.
  The kernel already refuses the geometry at the only place it is consumed (measured:
  `makeCircleArc3d` throws for a mismatch of one part in a million), so the guard's
  value is delivered where it costs nothing: the sketch panel says so in words, and
  the arc tool can no longer produce one. Full reasoning and the numbers are in
  `docs/history/new-session-9tmqf4.md`.
