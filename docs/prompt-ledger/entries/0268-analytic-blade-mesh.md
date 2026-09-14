# 0268 Build the blade mesh from parametric surfaces
- Issued: 2026-09-14T19:00:00Z
- By: Codex session
- Owns: `src/lib/ideacad/blade/evaluate.ts`, `src/lib/ideacad/blade/mesh.ts`, their tests, `docs/prompt-ledger/entries/0268-*`, `docs/history/analytic-blade-mesh.md`
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0215
- Status: pushed
- Branch: `codex/analytic-blade-mesh`
- Notes: No migration. Validation, feature semantics, materials, UI, viewport,
  routes, editor, stylesheet, store and transports were untouched.

## What it did

The body, collar and spin bolt are now 96-segment analytic profile sweeps. The
hex is a six-sided prism and every patterned blade is a direct closed-polygon
extrusion. The voxel sampler is no longer used by evaluation. The retained
`repairVoxelEdgeContacts` export exists only for ledger 0267's mutation proof.

The generated mesh is a collection of individually closed, outward feature
shells. This deliberately does not claim a general CSG union: blades overlap the
body over their authored mount depth, and the hex/collar overlap at their known
interfaces. Producing one exterior-only shell would require splitting those
surfaces along their exact intersection curves. No sampler is hidden on that
path. The renderer displays the direct surfaces without voxel staircases, while
the limitation remains explicit rather than being called an analytic boolean.

## Acceptance and measurement

The 112-case 0267 volume spread remains: 3/4/6/8 stations, 2 through 8 blades,
both spin-bolt states, and collar present or suppressed. Volume is checked first
against the independently constructed overlap-inclusive analytic upper bound,
then every shell edge must have exactly two incident triangles and orientation
must be outward.

A new normal-continuity assertion limits adjacent body faces around the
circumference to less than 4 degrees. The 96-segment sweep turns 3.75 degrees;
the old voxel surface's 90-degree turn fails the assertion.

Measured in Node 24 over 100 builds after warm-up:

| tree | voxel baseline | analytic | analytic mean generation |
|---|---:|---:|---:|
| default, 4 stations / 4 blades | about 19,000 triangles / 29,488 cells | 1,604 triangles | 0.742 ms |
| heaviest, 8 stations / 8 blades | not retained by 0267 | 2,420 triangles | 0.522 ms |

The default triangle reduction is greater than 11x. The heavy timing being
slightly lower is normal sub-millisecond timer and JIT noise; both avoid all
grid allocation and sampling.
