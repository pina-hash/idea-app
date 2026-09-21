---
title: "IdeaCAD feature graph: design tree, reference geometry, mates, sketching, blends, materials, storage, add-on tools, part movement"
date: 2026-09-21
branches: ["claude/optimistic-mayer-rcq01p"]
migrations: ["0217"]
subsystems: ["ideacad", "database", "verification"]
---

Ledger 0273. One migration (`0217`), the IdeaCAD feature graph as the spine,
then ten surfaces built in parallel by ten agents on one branch, integrated
by a single writer, verified in a real Chromium at 1440 and 375, and shipped
as a PR against `main` that is NOT merged: Mr. Pina applies 0217 by hand
first.

### What changed

- **The spine** (`src/lib/ideacad/solid/`): `types.ts` gains the version 2
  manifest (a feature list, reference and mate features, `FaceRef` /
  `EdgeRef` / `VertexRef` with geometric hints, `BodyFreedom`);
  `naming.ts` is the four-tier topological naming (construction roles,
  ordinals, hints, counted fallback) with blends named from the two neighbours
  sharing the most edge length; `engine.ts` replays the feature list with a
  twelve-checkpoint window, a projection cache keyed by solid handle that is
  invalidated on `replaceBody`, `addBody` and after every checkpoint restore,
  and `replayedFrom` / `replayMs` on every projection; `commands.ts` reduces
  the document commands (add, set, rename, move, suppress, remove, mate,
  addon, metadata) and refuses in its own sentences; `upgradeManifest` turns a
  version 1 save into `body` features and the first version 2 save carries
  `diffTrees(v1, v2)` so 0209's action log replays across the boundary; the
  transform executor copies (`copyAndTransformSolid`) so undoing a move puts
  the body back.
- **Migration 0217** (`supabase/migrations/0217_ideacad_feature_graph.sql`):
  the validator accepts `ideacad-solid-v1` and `-v2`; `deleted_at` /
  `deleted_by` with a thirty-day `_ideacad_trash_window()`, a lazy
  `_ideacad_purge_expired_direct_documents()` and a preserve trigger that
  admits a purge only through the transaction-local GUC `ideacad.purge`;
  `ideacad_folders`, `tags text[]`, `thumbnail` (a data URL under 60000
  bytes, CHECKed); rename through a history row, duplicate, thumbnail RPC;
  every function revokes from `public, anon, authenticated` by name (the 0166
  shape) and grants back exactly what should hold it; a self-check that
  raises, and a read-only readiness query after `commit;` that returns rows
  with two negative controls. `tests/db/ideacad-feature-graph-storage.test.ts`
  seeds the chain through 0216's real RPCs and applies 0217 over it (25
  tests, including a mutant list as the positive control, a 31-day / 29-day
  expiry pair, a second apply, and a dollar-in-comment scan with a planted
  control). `tests/db/ideacad-grants-anon-execute-surface.test.ts` adds 0217
  and `ideacad_folders` to its allowlists.
- **Ten surfaces**, each in its own files and each recorded in
  `docs/IDEACAD.md` under "The ten surfaces": the design tree, dimensional
  control, reference geometry, mates, sketching, blends and the other
  features (hole with a sourced size chart, draft, sweep, loft; rib refused
  honestly), materials and colour, storage and the launch page (`/ideacad` is
  `LaunchPage` now, the legacy chooser at `?legacy=1`), add-ons (never-restrict
  pinned in the types), part movement (a real triad, drag arithmetic, fine
  control, snapping, `MovePanel`).
- **The integration**: 28 requests from the ten agents applied to
  `SolidWorkspace.svelte`, `viewport.ts`, `features/core.ts`, `engine.ts`,
  `readout.ts`, `tools.ts` by one writer. Declined: an export from
  `src/lib/ideacad/blade/evaluate.ts` (a forbidden path; the add-on keeps its
  own copy of the collar and spin-bolt rules and says so) and a change to the
  advisory's `bodyParts` (reported as a finding instead).
- **Browser verification**: `tools/browser-verify/checks-visual.mjs` gains
  `readoutNearPointer` (a real pointer drag, sampling the readout's distance
  from the pointer at every step); `run.mjs` dispatches it and carries a
  `--break readout-away` preset; `selftest.mjs` puts it to a broken and a
  sound fixture; three route specs (`ideacad-solid`, `ideacad-solid-state-tree`,
  `ideacad-launch`) with their measured files. The acceptance model's images
  are in `docs/ideacad/verification/0273/`.
- **Two classroom update entries** (2026-09-21) in `classroom-updates.json`.

### Decisions, and why

- **A linear feature list with a derived dependency DAG**, not a stored
  graph: the list is what a student reads and reorders, the DAG is what
  decides a replay's start and a reorder's refusal, and storing the DAG would
  be a second statement of the same dependencies.
- **Deterministic body ids `<fid>#k`** so a metadata command, a mate and a
  role can name a body a feature has not been replayed to create yet.
- **Names never rewrite a stored feature.** A hint re-attaches a reference
  with a warning on the row; an ambiguous or missing match is an error naming
  the reference. A repair during load would be a silent edit of a student's
  work.
- **The checkpoint window is twelve** and the kernel cannot discard one
  checkpoint (discarding any drops every later one, measured), so the stack is
  compacted by rebuilding from the base once it has grown past twice the
  window. The cost table is in `docs/IDEACAD.md`.
- **The hole in the acceptance model is sketched on the flange's top FACE.**
  The first run put it on a fixed `XY` datum at z 0.375 and the deep edit
  (flange 0.375 to 0.5) broke the cut and, downstream, the axis and the mate
  with lost-reference errors naming `cut.side.0`. That is the engine doing its
  job (a sketch on a fixed plane does not follow a face), and the model was
  wrong, not the engine: on a face reference the same edit rebuilt all eight
  features with the hole, the axis and the mate intact. Worth knowing because
  it is the first thing a student will do.
- **The selected tree row keeps the list's ink.** `ideacad.css` fills any
  `.ic-root button[aria-pressed='true']` with the accent and dark ink (a mode
  that is on); on a tree row the fill was overridden by the hover ground and
  the dark ink stayed, measured 1.27:1. The row now declares its own paint
  (`FeatureTree.svelte`), and the harness reads 11.59:1.

### Measured

- Acceptance model at 1440 and 375, identical numbers at both widths: bracket
  bounds [0,-2,0,3,0,2.5]; the cut produced one cylinder face; the Reference
  panel offered `axis-face`, `point-face`, `point-body`, `plane-offset`,
  `plane-angle`, `point-axis-plane`, `axis-datum`, `point-coordinates` for it;
  the concentric mate solved with residual 4.4e-16 and left the pin 2 degrees
  of freedom; editing the bracket's depth 2 to 3 through the tree's parameter
  field replayed from feature 1 in 16 to 22 ms and took the volume 3.7966 to
  5.7185 (analytic 5.7185); changing the flange from 0.375 to 0.5 in the FIRST
  sketch replayed from 0 in 21 to 28 ms and took it to 6.6872 (analytic
  6.6872), every row `ok`, the mate `ok`.
- Browser harness, the three new specs at both widths: 118 measurements, 0
  outside threshold (after the tree-row fix; 2 outside before it, both the
  1.27:1 name). Self-test: 100 controls, both slots of the new check proven.
  `--break readout-away` on `/dev/ideacad-solid` at 1440 reddened the new
  check at 446.9 px against 40 px while the readout still read a value.
- `svelte-check`: 0 errors, 37 warnings in 20 files (31 `state_referenced_locally`,
  5 `css_unused_selector`, 1 `perf_avoid_nested_class`), the baseline.
- Solid suites after integration: 427 node tests in 28 files and 400 dom
  tests in 25 files, 0 failed. The ten agents' own files: tree 38, dimensions
  151, reference 33, mates 42, sketching 73, blends 25, appearance 22, storage
  54, add-ons 22, triad 46, all 0 failed.
- Full suite, once, at the end, read from the summary line and stderr:
  SUITE_COUNTS_PLACEHOLDER
- Replay cost on the forty-feature fixture, the projection cache's memory
  and the checkpoint arithmetic: the table in `docs/IDEACAD.md`.

### Corrections to the prompt's "measured 2026-09-20" claims

- The densities and their sources live in `src/lib/ideacad/solid/advisory.ts`
  (`STOCK_MATERIALS`), not where the prompt placed them; the citation
  discipline was preserved there, unchanged.
- The archive function the prompt named as `ideacad_archive` is
  `ideacad_set_direct_document_archived(uuid, boolean)` for a direct
  document; `ideacad_archive(p_item_id)` is the classroom-item function from
  0214 and is not what the launch page calls.
- No delete RPC existed for a direct document before 0217; the trash is the
  first removal path of any kind, and it is a soft delete with a purge.
- The revolve axis was a hardcoded sketch axis; it takes a selected reference
  axis now.
- `SolidCommand` already had more members than the prompt listed (metadata,
  addon, delete-body); the reducer was extended, not created.

### Not verified

- Nothing against production or a signed-in session: the local `.env` is
  the placeholder project, so `/ideacad` over `createSolidTransports` and
  the 0217 RPCs on a live database were not driven. The RPCs are proven on
  the embedded Postgres only.
- Web fonts do not load in the harness, so every text metric is in the
  fallback stack; `prefers-reduced-motion` is `no-preference` throughout.
- Touch input: no drag was driven with a touch pointer at 375; the phone
  path in the tree is the 44 px buttons.
- The snap settings in a real drag were proven by the drag-math tests over an
  owned projection, not by a browser drag with snapping on.
- The Measure and Section panels were driven by mount tests and by the
  integrated workspace's type-check, not by a browser pass of their own.

### Deferred

- Thumbnail generation in the workspace (the RPC exists and nothing calls it).
- Hiding an owner's tags from a grantee on the launch page.
- The advisory `bodyParts` definition against `blade/evaluate.ts` (a
  `blade/**` change, outside this bundle).
- One-step undo of an add-on tool run (needs a batch command).
- A hover pipeline in the viewport.
