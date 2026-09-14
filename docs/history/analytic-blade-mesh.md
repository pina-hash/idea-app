---
title: "Blade geometry is swept directly instead of skinned from voxels (`codex/analytic-blade-mesh`, no migration)"
date: 2026-09-14
branches: [codex/analytic-blade-mesh]
migrations: []
subsystems: ["IdeaCAD", "Blade evaluation", "Solid geometry"]
---

The production blade model was visibly a staircase because `unionMesh` sampled
every feature onto a cubic grid before drawing it. Increasing that grid would
only exchange larger meshes and slower edits for smaller steps. Evaluation now
constructs the authored surfaces directly: profile sweeps for the body, collar
and spin bolt, a six-sided extrusion for the hex, and closed polygon extrusions
for the patterned blades.

## Load-bearing boundary

This bundle does not describe concatenated closed feature shells as a general
boolean union. Blade/body and hex/collar volumes overlap. Removing the internal
patches requires splitting both analytic surfaces along their intersection
curves; that work is not approximated by silently restoring the voxel sampler.
Every emitted component is closed and outward, so export and display remain
well-defined, but callers needing a single exterior-only B-rep must not infer
one from this triangle collection.

## Assertions and measurements

The 0267 112-tree volume spread remains the first acceptance boundary and uses
the overlap-inclusive analytic upper bound. Edge incidence and signed volume
then assert closed outward shells. A new smoothness assertion measures adjacent
body normals and requires less than 4 degrees; the 96-segment sweep measures
3.75 degrees where the voxel skin turned 90 degrees.

The default fell from roughly 19,000 triangles and 29,488 sampled cells to
1,604 triangles. The eight-station/eight-blade case is 2,420 triangles. One
hundred Node 24 builds averaged 0.742 ms and 0.522 ms respectively (the ordering
within sub-millisecond measurements is JIT/timer noise). No migration, UI,
viewport, validation, feature-tree or parameter-semantics change was made.

## Verification limit

Vitest could not initialize in this container: Rolldown failed to resolve
`node:module` from its generated runtime despite Node 24.15.0 and a clean
`npm ci`, before collecting any test. TypeScript's no-emit check completed.
