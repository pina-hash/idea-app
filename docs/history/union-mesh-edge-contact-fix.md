---
title: "`unionMesh` repairs diagonal edge contacts to a fixpoint without dilating curved surfaces (`codex/union-mesh-edge-contact-fix`, no migration)"
date: 2026-09-14
branches: [codex/union-mesh-edge-contact-fix]
migrations: []
subsystems: ["IdeaCAD", "Blade evaluation", "Solid geometry"]
---

Ledger 0265 proved that the fixed eight-pass hole-closing loop was an unbounded
morphological dilation: it mistook every convex voxel staircase for a hole and
inflated the default rotor 48.7%. Watertightness stayed green before and after,
so this bundle makes volume the primary acceptance test and keeps manifoldness
as the second test.

## The zero-width contact the repair owns

The old comment named cells touching only at an edge or point, but its predicate
actually saw an empty cell with any perpendicular pair of occupied
face-neighbours. That is insufficient: it describes the outside corner of every
sampled curved surface. The specific edge-contact topology is a 2x2 ring around
an edge with the two occupied cells diagonal and both remaining cells empty.
The new predicate checks the fourth, diagonal cell is empty. When it is occupied,
the three cells are an ordinary surface staircase and the outside cell is left
empty.

This was not merely synthetic. The expanded evaluation corpus found one tree:
three profile stations, three blades, no spin bolt and a suppressed hex/collar.
It adds four cells in its first repair pass and zero in the next, so `[4]` is its
recorded positive-pass delta sequence. The default tree reaches the fixpoint
without adding a cell.

Repair now runs until a zero-addition pass, bounded by the largest grid
dimension. Positive pass sizes must decrease strictly; an equal or larger pass
raises instead of continuing. A three-cell topology whose pass sizes would be
1 then 2 pins that divergence refusal.

## Measured

The same default tree, at the same 0.0888-inch voxel step, before and after:

| implementation / passes | cells | volume in^3 | non-manifold edges |
|---|---:|---:|---:|
| old predicate, 0 | 29,488 | 20.638 | 0 |
| old predicate, 8 | 43,840 | 30.682 | 0 |
| new predicate, fixpoint (0 positive passes) | 29,488 | 20.638 | 0 |

| implementation | cells added per positive pass |
|---|---|
| old predicate | 1724, 1748, 1760, 1792, 1836, 1840, 1816, 1836 |
| new predicate, default tree | none |
| new predicate, real edge-contact tree | 4 |

The default volume is accepted against the independent 20.317 in³ analytic
upper bound with 2% voxel-quantisation tolerance. A 112-case spread covers 3,
4, 6 and 8 profile stations; every blade count from 2 through 8; both spin-bolt
states; and exposed versus suppressed collar states. Each sampled mesh must be
at most 4% over its own analytic, deliberately overlap-overcounted upper bound,
must have strictly decreasing repair deltas, and must remain outward and
watertight.

## Mutation proof

The old fixed eight-pass loop and broad predicate were planted back. The focused
file reported **3 failed / 8 passed**: the first spread case inflated from a
9.325 in³ tolerated bound to 19.503 in³; the real-contact case produced deltas
`1814, 1846, 1859, 1896, 1889, 1879, 1893, 1890` instead of `[4]`; and the
default measured 30.682 in³ instead of 20.638 in³. The source was restored with
matching md5 `84a5d56872228474d4eecdfc24945376` before verification.

## Scope and verification limits

No migration was written or applied. No renderer or UI file changed. The
analytic spread is an upper-bound check over sampled meshes, not an exact CSG
volume proof; its 4% tolerance covers center-sampling quantisation on the
smaller synthetic profiles, while the independently supplied default bound is
held to 2%.

The existing viewport crease regression was recalibrated from one tenth to one
fifth of the raw staircase-edge count after the corrected solid measured 736
smoothed edges against 5,444 raw edges. The former one-tenth ratio was itself a
measurement of the inflated rounded cube and therefore encoded the defect as an
acceptance fixture.

A browser screenshot was attempted through the real `/dev/ideacad` harness, but
this container's cached Chromium cannot start because `libatk-1.0.so.0` is
absent. Installing Playwright dependencies was also unavailable because the npm
registry answered 403. No screenshot is claimed.
