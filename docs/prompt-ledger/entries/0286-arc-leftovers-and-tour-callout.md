# 0286 Two IdeaCAD arc leftovers and two tour-callout findings
- Issued: 2026-09-22
- By: Lane B
- Owns: `src/lib/ideacad/solid/sketch/editor.ts`, `src/lib/ideacad/solid/viewport/drawing.ts`, `src/lib/tour/SpotlightTour.svelte`, `tests/ideacad-solid-sketching-geometry.test.ts`, one new spec under `tools/browser-verify/routes/` with its `measured/*.json` and the generated counts block, `docs/prompt-ledger/entries/0286-*`
- Migration permitted: no. Highest on origin/main at issue: 0217
- Status: issued
- Branch: `claude/new-session-ig6vdi`
- Notes: Three of the four items shipped as written and the fourth did not exist.
  `drawing.ts` needed NO edit -- item B's repair is `arcDraft`'s own direction rule
  reused, so `arcEntities` kept its signature and its one caller was left alone.
  **Item C's premise was stale**: `--dim` on `--bg1` measures 4.52:1, not the 4.46
  on record, so the reported label defect is not on this tree and the labels were
  not touched. What IS under a floor on those same four controls is the BOX -- the
  thinned `--dim` border at 2.00:1 and the primary's 55% gold at 2.76:1 against a
  3:1 boundary floor -- so the item shipped a repair, but not the one it was written
  for. `CLAUDE.md`'s `--dim` paragraph is corrected in place (one figure and two
  clauses); that file is outside the stated ownership and the edit is called out in
  the history entry so it can be reverted on its own if Mr. Pina would rather it
  went through its own bundle. `classroom-updates.json` gained one entry under the
  standing directive. Item A leaves ONE arc path open by design -- a drag that ends
  on another point is a JOIN and still breaks the radius -- and 0275's amber notice
  is kept as the safety net for it. Full reasoning, every measurement, the two
  rejected alternatives for item A and the two deliberate mutation survivors are in
  `docs/history/new-session-ig6vdi.md`.
