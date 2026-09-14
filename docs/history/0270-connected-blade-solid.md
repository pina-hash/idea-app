---
title: "Analytic blade features form one connected solid (`codex/0270-connected-blade-solid`, no migration)"
date: 2026-09-14
branches: [codex/0270-connected-blade-solid]
migrations: []
subsystems: ["IdeaCAD", "Blade evaluation", "Solid geometry"]
---

Ledger 0268 removed the staircase by emitting analytic shells, but each blade,
the collar, hex and spin bolt remained a separate closed component. This bundle
opens the nearest triangular patch inside each feature/body authored overlap and
sews the two boundary loops. The result keeps the direct profile sweeps and
polygon extrusions while making the face adjacency graph a single component.

The collar now begins on the revolved body's top face rather than around the top
of the hex extension. The hex rises through it, and the spin bolt is sewn at the
body bottom. The blade-pattern investigation found no z transform: every instance
uses the same `mount.z` and thickness, and rotation changes x/y only. The apparent
height difference was a perspective cue from the detached slabs.

The 112-case volume bound remains the first acceptance test. Watertightness,
outward signed volume and the under-four-degree revolve normal turn remain, and
the focused test now walks shared-edge face adjacency and requires every face to
be reached. It reports 14 passed / 0 failed. The retained voxel contact helper is
still reachable only as the direct export exercised by ledger 0267's mutation
proof; `evaluate()` has no call path to it.

The default mesh measures 1,632 triangles and 6.076 ms mean over 100 warm Node 24
builds. Ledger 0268 measured 1,604 triangles and 0.742 ms; joining adds 28
triangles and the nearest-overlap seam search accounts for the generation cost.
No migration, renderer or feature-tree change was made.
