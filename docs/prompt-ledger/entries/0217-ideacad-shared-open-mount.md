# 0217 The IdeaCAD shared-open mount, and the four defects behind it

- Issued: 2026-09-13
- By: router chat
- Owns: the IdeaCAD region of `src/lib/classroom/ItemDetail.svelte`,
  `tests/dom/ideacad-shared-mount*`, `tools/browser-verify/routes/ideacad*.mjs`
  and its measured store entries, `docs/prompt-ledger/entries/0217-*`, and its own
  `docs/history/` entry. `deploy.yml`, `deploy-probe.mjs` and `CLAUDE.md` belong to
  ledger 0216 and were not touched; `src/lib/ideacad/store.ts` was not changed.
- Migration permitted: no. **Claims: none.**
- Status: pushed
- Branch: `claude/vibrant-keller-4wtm7c`, branched from `origin/integration` at
  `9b010f53`.
- Notes: The last thing between decision 24 and a working feature. `0205` applied
  `ideacad_shared_with_me` and `ideacad_open_shared_document` to production; ledger
  0190 built `SharePanel`, ledger 0195 mounted it, ledger 0201 built
  `shared-open.ts`, `SharedDocuments.svelte` and `store.openShared` and could mount
  none of it, because `ItemDetail.svelte` was outside its Owns. For three days the
  grant was live and unreachable BY CONSTRUCTION.

  **The duplicate check ran three ways and all three came back clean.** (1)
  `git ls-tree` over `docs/prompt-ledger/entries/` on `origin/integration` and
  `origin/main`: the highest entries are `0210`, `0211`, `0214`, `0215`; no `0216`
  and no `0217`. (2) `git log --all --grep='0217'` and
  `git log --all -- 'docs/prompt-ledger/entries/0217*'` both match nothing across
  56 remote refs. (3) The SEMANTIC check, which is the one that matters here:
  `SharedDocuments` appears ZERO times in `ItemDetail.svelte` on `origin/main` and
  on `origin/integration`, and `git log --all -S'SharedDocuments' -- <that file>`
  is empty. The one name-matching branch, `origin/codex/execute-instructions-from-ideacad.md`,
  is ledger-0145-era and its three-dot diff against `integration` is empty.

  **The mount is one prop, `ideacadShared`, following ledger 0195's shape**, with
  the panel below the editor and above `SharePanel`, and a banner plus a return
  control above everything when the open document is not the caller's own. The
  writable/read-only choice is `canWrite || accessLost` off the store, never a
  callback's presence.

  **Four real defects were found, three of them only by rasterizing and looking.**
  (1) `BladeEditor.svelte` line 147 called `structuredClone(c.features)` with no
  `$state.snapshot`, so the writable Blade editor threw `DataCloneError` and
  rendered ZERO times on the real item page -- a production defect standing since
  ledger 0178, invisible because nothing in the repo had ever mounted `ItemDetail`
  with a real store snapshot. (2) `+page.svelte` hardcoded `role: 'owner'`, which
  on a classmate's document would have offered a share form for a document the
  caller does not own. (3) `SharePanel` on a shared document rendered
  `IDEACAD_ROLE_NOTES.editor` byte-identically to the shared row 150px above it --
  ledger 0201's second rasterized defect, reappearing BETWEEN two panels. (4) The
  save chip read "Changed elsewhere" in the access-lost state, 1200px above a
  notice saying the access was removed.

  **Decision 27's open case is closed.** Ledger 0211 named it: two real editors on
  one shared document had never been driven through the timeline. Driven here and
  rasterized -- the log reads `luis.ortega 6:00 PM` on the origin row and
  `You 9:12 AM` on the reader's own.

  Measured: `svelte-check` 0 errors / 37 warnings in 20 files (31/5/1), re-derived
  on the branch point in a stashed tree and identical after; the full suite 461
  files, 8767 tests, 0 failures, 579.1s; `npm run verify:browser -- --route /dev/ideacad`
  50 route/width runs, 972 measurements, 0 outside threshold; 14 mutants, 13
  caught, 1 genuine defence-in-depth survivor proved pairwise. One
  `npm run verify:readme -- --route ideacad-item` pass wrote seven measurement
  files; the store now holds 222 specs, 444 runs, 7940 measurements, 0 outside
  threshold.
