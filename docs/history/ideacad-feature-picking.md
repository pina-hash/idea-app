---
title: "IdeaCAD gains a pure feature-picking seam and framework-free selection model (Codex, ledger 0245)"
date: 2026-09-14
branches: ["codex/ideacad-feature-picking"]
migrations: []
subsystems: ["IdeaCAD", "Viewport", "Selection", "Testing"]
---

Ledger 0245 asked for the layer between a pointer and a feature-tree selection, but
explicitly prohibited wiring it into the existing viewport or editor. This bundle adds
that seam and nothing under an existing viewport, blade, UI, route, store, transport, or
CSS path was changed.

## The provenance finding

There is no generated-geometry provenance in the evaluated model today.
`Evaluation.geometry` contains stations, a blade polygon, blade count and placement, and
`evaluationGeometries` reduces those to three geometry roles (`body`, `hex`, `blade`), but
neither shape carries a feature id. The stored tree does contain ids and reference edges:
an extrude names its sketch, a circular pattern names its feature, and a mount names its
feature. That is enough for the smallest honest adapter, not enough for general face or
body provenance.

`renderedFeatureIds(tree)` maps the current three renderer roles. Body maps to the active
revolve and hex maps to the active hex boss. A blade combines four features, so it maps to
the last valid operation in the chain -- mount, pattern, extrude, then sketch -- rather
than falsely claiming the evaluator identifies one. Suppressed or disconnected steps are
not attributed. General per-face or arbitrary-operation provenance remains deferred until
the evaluator/geometry boundary retains source ids.

## Picking contract

`raycastFeatures(pointer, camera, targets)` takes Three.js normalized device coordinates,
the live camera, and feature-labelled render objects. It returns every distinct feature
hit front-to-back. The closest surface wins within a feature, distance orders features,
and code-unit ordering of `featureId` breaks exact distance ties without depending on
target insertion order or locale. Nothing under the pointer is the discriminated
`{ kind: 'empty', hits: [] }`, never `null` or `undefined`.

## Selection contract

`selection.ts` is immutable and framework-free. `EMPTY_SELECTION` starts both current
selection and hover empty; `setSelection`, `clearSelection`, `toggleSelection`,
`setHoverCandidate`, and `clearHoverCandidate` each return a new state and do not couple
hover to current selection.

## Exact later wiring, deliberately not done here

A later viewport/editor bundle must:

1. Call `renderedFeatureIds(tree)` whenever the evaluated tree changes.
2. Build `FeaturePickTarget[]` from the live meshes after geometry construction: label the
   body mesh with `.body`, hex mesh with `.hex`, and every blade instance with `.blade`.
   Do not include datum grid, contact shadow, or edge lines.
3. Convert a canvas pointer with
   `x = ((clientX - rect.left) / rect.width) * 2 - 1` and
   `y = -((clientY - rect.top) / rect.height) * 2 + 1`, then call
   `raycastFeatures({ x, y }, camera, targets)`.
4. On pointer movement, call `setHoverCandidate(state, result.hit.featureId)` for a hit or
   `clearHoverCandidate(state)` for `kind === 'empty'`.
5. On the editor's chosen click gesture, call `setSelection(state, result.hit.featureId)`
   (or `toggleSelection` for the modifier gesture); call `clearSelection(state)` on an
   empty click if that is the interaction policy.
6. Hand `state.selectedFeatureId` to the feature-tree selection input/callback, and hand a
   tree-row selection back through `setSelection`, so viewport and tree share one feature
   id. The state remains local unless a later design deliberately chooses wider lifetime.

No browser pass or screenshot applies: this bundle changes no runnable surface and wires
nothing. The pure module tests exercise provenance fallback, front-to-back order,
deduplication, insertion-order-independent ties, explicit empty hits, immutability, hover,
and all selection transitions.

## Verification

The focused Vitest run passed **2 files, 8 tests, 0 failures**. `npm run check`
completed with **0 errors and no diagnostics**; this checkout did not reproduce the
stated 37-warning baseline. The full `npm test` run did not pass: **471 files passed,
8 failed; 9,080 tests passed, 21 failed, 15 skipped**. All eight new tests passed in
that same run. The failures are outside this bundle's owned files: existing IdeaCAD DOM
mount tests, migration-applied bookkeeping, migration guards in a single-ref checkout,
and deploy-probe tests unable to launch `psql`. None may be repaired here because the
prompt explicitly owns only the two new modules, their tests, and this documentation.
