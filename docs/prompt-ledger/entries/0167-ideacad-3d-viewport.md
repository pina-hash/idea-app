# 0167 IdeaCAD: build the 3D viewport that has never existed

- Issued: 2026-09-12
- By: router chat
- Owns: `src/lib/ideacad/viewport/**`, `src/lib/ideacad/geometry.ts`, `src/lib/ideacad/BladeEditor.svelte`, `src/lib/ideacad/config.ts`, `src/routes/dev/ideacad/**`, `tests/dom/ideacad-viewport*`, `tests/ideacad-viewport*`, `tools/browser-verify/routes/ideacad*.mjs` and the generated regions of its README, `docs/prompt-ledger/entries/0167-*`, and its own `docs/history/` entry.
- Migration permitted: no. Claims: none. Highest on origin/integration at issue: 0202
- Status: pushed
- Branch: `claude/keen-pasteur-40dx0m`, branched from `origin/integration` at `ebf23dcd`
- Notes: Ledgers 0166, 0168 and 0169 run in parallel; this lane touches none of their files. There is no 3D viewport in the tree: ledger 0160 measured no canvas, no `WebGLRenderer`, no camera and no controls anywhere, `geometry.ts` with zero importers, `viewport/controls-math.ts` with zero importers outside its own test, and `config.ts` with zero importers and no test. Ledger 0145's report described a toolbar and rule readouts that were not true of the tree; 0160's measurements govern. This lane builds the real canvas, camera and orbit controls, wired to the existing `controls-math.ts` (`THREE.OrbitControls` is not in the pinned build, which is why that module exists) and rendering the geometry `geometry.ts` already builds. Those modules are tested and correct and are imported, not rewritten.
