# 0270 Join and place the analytic blade solid
- Issued: 2026-09-14T22:45:00Z
- By: Codex session
- Owns: `src/lib/ideacad/blade/evaluate.ts`, `src/lib/ideacad/blade/mesh.ts`, their tests, `docs/prompt-ledger/entries/0270-*`, `docs/history/0270-connected-blade-solid.md`
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0215
- Status: issued
- Branch: `codex/0270-connected-blade-solid`
- Notes: No migration. Tree, validation, feature semantics, materials, UI, viewport,
  routes, editor, stylesheet, store and transports were untouched.

## What it did

Every analytic feature shell is now opened at its nearest authored overlap with
the revolved body and the two triangular loops are sewn together. The resulting
manifold is one face-adjacent component rather than a body plus loose closed
shells. The collar starts on the body top face and the hex passes through it;
the spin bolt meets the body bottom face. No voxel sampling is used.

The circular pattern was not applying a z transform: `rotated` changes x and y
only, while every extrusion receives the same `mount.z` and stock-thickness
endpoints. The apparent stepped heights came from perspective on disconnected
slabs, not different mesh z coordinates.

## Acceptance and measurement

The 112-case analytic-volume spread remains first, followed by manifold/outward
checks and a face-edge graph walk which must reach every face. The smoothness
and 0267 voxel-repair mutation coverage remain. The focused file reports 14
passed / 0 failed.

Measured in Node 24 over 100 warm builds, the default is 1,632 triangles and
6.076 ms mean generation time, versus ledger 0268's 1,604 triangles and 0.742
ms. The 28 triangles are the seven six-face seams replacing fourteen removed
faces; the time cost is the analytic nearest-overlap search, with no grid
allocation or sampling.
