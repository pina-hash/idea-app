# 0171 IdeaCAD: the FeatureManager, the PropertyManager, concept cards and undo

- Issued: 2026-09-12T13:50Z
- By: router chat (IdeaCAD lane, after 0167's viewport landed)
- Owns: `src/lib/ideacad/BladeEditor.svelte`, new components under `src/lib/ideacad/ui/**`,
  the IdeaCAD region of `src/routes/classroom/[sectionId]/item/[itemId]/+page.svelte` AND
  NOTHING ELSE IN THAT FILE, `src/routes/dev/ideacad/**`, `tests/dom/ideacad-ui*`,
  `tools/browser-verify/routes/ideacad*.mjs`, `docs/prompt-ledger/entries/0171-*`, and its
  own `docs/history/` entry.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0203
- Status: pushed
- Branch: `claude/pensive-turing-inj1ih`
- Notes: `src/lib/ideacad/transports.ts` and a new `src/lib/ideacad/store.ts` belong to
  ledger 0170, running in Codex, and are NOT written here. `store.ts` was absent from
  `origin/integration` at branch time, so this lane builds against the transports' own
  shapes and hands no store down.

  DUPLICATE CHECK, THREE WAYS, ALL CLEAR. (1) `git log --oneline
  origin/main..origin/integration` at branch time: EMPTY -- `integration` and `main` are
  the same commit, `3728698`, so nothing is in flight between them. (2)
  `tools/idea-status.py` read the ledger across `origin/main`, `origin/integration` and
  every `claude/**` and `codex/**` branch: 149 entries in flight, **no 0169, no 0170 and
  no 0171 anywhere**, highest seen 0168; a live GitHub contents listing of
  `docs/prompt-ledger/entries?ref=main` returned 0168 as the highest and no 0171. (3) A
  sweep of EVERY remote ref for `src/lib/ideacad/ui/`, `src/lib/ideacad/store.ts` or any
  `docs/prompt-ledger/entries/017*` file: none exists on any branch, so neither this lane
  nor 0170 had written a byte when this branch was cut. `node tools/migration-claims.mjs`
  reports highest landed 0203, next free 0204, and this entry claims none.

  **OUTCOME.** A FeatureManager (select, reorder, the body's stations as collapsed
  child rows), a PropertyManager replacing the tree in place with every bound read
  from the config's own rules, concept cards with profile thumbnails, live rule chips
  and reorder, and undo/redo 50 deep over accepted edits. **Rename and delete are
  REFUSED in words with their reasons**: `evaluate` reads all six features by type
  and `BladeFeature` carries no name field, and neither module is this lane's --
  making rename real is one line (`name?: string`) in `blade/tree.ts`.

  **The prediction gate was already fixed by 0160**, contrary to the prompt; this
  bundle measured it in a real Chromium at both widths with a positive control, and
  proved the probe bites by restoring 0160's defect exactly (three of nine claims
  redden, including the one 0160 measured) and restoring the file md5-identical. Two
  real gate defects that DID survive are fixed: it opened on the press rather than on
  the write, and a prediction already recorded did not unlock it.

  Three defects found by rasterizing and looking after every threshold passed: the
  tree's last two rows below an invisible fold (this container's Chromium paints
  overlay scrollbars), two Accept buttons on one screen, and the concept strip running
  off a 1440px window.

  **0170's `store.ts` landed mid-bundle** and is on the merged tree; its state shape
  and this component's props fit, needing only a field rename at the mount site.
  **The real classroom page still hands `BladeEditor` no transports**, because the
  only route to it is `ItemDetail.svelte`, which this lane does not own.

  Measured: svelte-check 0 errors / 38 warnings in 21 files (`CLAUDE.md`'s 40 in 22 is
  stale on this tree); `npm test` 407 files, 7889 tests, green; the six IdeaCAD browser
  specs 12 runs, 288 measurements, 0 outside threshold; one `verify:readme` pass, the
  store at 199 specs, 398 runs, 7022 measurements, 0 outside threshold.
