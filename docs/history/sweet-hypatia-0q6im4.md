---
title: "The viewport draws `Evaluation.geometry.solid` and nothing else -- and rendering it is what exposed that `unionMesh`'s hole-closing loop inflates the part 48.7% into a rounded cube (`claude/sweet-hypatia-0q6im4`, no migration)"
date: 2026-09-14
branches: [claude/sweet-hypatia-0q6im4]
migrations: []
subsystems: ["IdeaCAD", "Viewport", "Rendering"]
---

Ledger 0254 built a single watertight, outward-wound solid -- the union of the
revolved body, the patterned blades, the hex extension, the collar and the
optional spin bolt -- and proved it over sixteen combinations of 3-8 profile
stations and 2-8 blades. **Nothing rendered it.** `Viewport.svelte` went on
building its own meshes from the convenience fields beside it (`stations`,
`hexHeight`, `bladeZ`) through `evaluationGeometries`, so the collar and the
spin bolt existed in the model and not on screen, and each part was an
independent open shell. That is the owner's verdict: *solid geometry is not
apparent, the insides show hollow, everything is just surfaces, holes
everywhere.*

Rasterized before the change, at 1440 and 375, the complaint is literal: the
lathe's top rim is an open circle showing the **inside** of the body shell
around the hex boss, and the three blades are disconnected slabs floating at
mid-height. There is no collar and no spin bolt anywhere.

## What changed

One mesh. `solidBuffers` -- exported from `Viewport.svelte`'s module context, so
a test can reach it -- translates a `SolidMesh` into position, normal, index and
crease-segment buffers, and `build()` mounts exactly one `Mesh` and one
`LineSegments`. The `evaluationGeometries` import is gone and there is no
fallback: the prompt's own reason is that two ways to draw one model is what
produced a fork, and it is the right reason.

**The axis relabel is a rotation, and that is the whole of why the model reads
as solid.** The kernel spins about part `z`; the scene is Y-up. `(x, y, z) ->
(x, z, -y)` has determinant +1, so 0254's outward winding survives it and
backface culling can be left on -- which is what makes a closed solid look
closed. The obvious relabel `(x, y, z) -> (x, z, y)` is a **mirror**: it renders
the right shape inside out, and the reflex fix for that is `DoubleSide`, which
is exactly the dodge that let the old open shells pass review. `FrontSide` is
therefore load-bearing rather than a default left alone.

**Feature edges come from smoothed normals, because the raw ones are
degenerate.** The solid is a sampled union, so its boundary is a voxel skin with
exactly **six** distinct face normals, all axis-aligned. A dihedral crease
filter over the raw faces keeps the identical **8,732** staircase edges at every
threshold from 15 to 89 degrees -- that is a cage, not a feature edge set.
Averaging the face normals into the shared grid vertices recovers the surface
the sampling approximates, and the same filter over those smoothed normals
discriminates properly:

| threshold | 15 | 20 | 25 | 30 | 40 |
|---|---|---|---|---|---|
| raw | 8732 | 8732 | 8732 | 8732 | 8732 |
| smoothed | 6437 | 1377 | **358** | 61 | 0 |

`CREASE_DEGREES` is 25 from that distribution, not from taste.

**The ground plane comes from the solid's own bounding box**, not from the
lowest station: the spin bolt hangs below the body base, so a datum placed at
the stations put the grid through the bolt.

## THE FINDING: the solid is watertight and the WRONG SHAPE

Rendering it is what made this visible, and it is a defect in
`src/lib/ideacad/blade/evaluate.ts`, which this bundle did not own and did not
touch.

`unionMesh`'s hole-closing loop runs eight passes, each filling any empty cell
with two or more occupied face-neighbours that include a perpendicular pair. On
a curved body **every surface cell is a staircase corner**, so the predicate is
true all over the outside of the part and the loop dilates it outward one cell
per pass in every diagonal direction. Reproducing the sampler with the pass
count as a parameter, on the shipped default (voxel step 0.0888 in):

| passes | cells | volume in^3 | non-manifold edges |
|---|---|---|---|
| 0 | 29,488 | **20.638** | **0** |
| 1 | 31,212 | 21.844 | 0 |
| 2 | 32,960 | 23.068 | 0 |
| 3 | 34,720 | 24.299 | 0 |
| 8 | 43,840 | **30.682** | 0 |

Cells added per pass: 1724, 1748, 1760, 1792, 1836, 1840, 1816, 1836 -- **not
decaying, increasing**, which is the signature of an unbounded dilation rather
than a repair converging on the zero-width contacts the loop's own comment says
it is closing. **At zero passes the skin is already watertight**, so on this
part the eight passes repair nothing and add 10.044 in^3 -- 48.7% -- of material
that is not in the model.

It shows in the cross-sections. Against the body's own `radiusAt(z)`:

| z | modelled radius | solid, on axis | solid, on the 45 degree diagonal |
|---|---|---|---|
| 0.50 | 1.557 | 1.689 | 2.009 |
| 1.00 | 1.582 | 2.138 | 2.013 |
| 1.60 | 1.611 | 2.138 | 2.073 |
| 2.20 | 1.640 | 1.689 | 2.073 |

The diagonal running ahead of the axis is the drift toward the bounding box.
Independently, the analytic volume of the modelled features, with overlaps
double-counted so it is a strict **upper** bound, is 20.317 in^3 (body 19.621,
hex 0.108, collar 0.576, spin bolt 0.011) -- and the 0-pass sampling lands at
20.638, which is that bound plus voxel quantisation. Both roads reach the same
place.

So the rendered model is a faithful picture of what the kernel currently says
the part is, and what the kernel says is a rounded cube. The fix belongs in
`unionMesh`: bound the loop to a predicate that actually names a zero-width
contact and run it to a fixpoint, rather than eight unconditional dilations.
`blade/evaluate.ts` is another lane's file and nothing here reaches back into
the convenience fields to hide the problem, which is the prompt's own
instruction.

## Measured

- **Frame cost, the repo's own `__ideacadRunFrameProbe`, a real 300-frame
  middle-drag through the real controls at 1440px**: render p95 **0.8 ms before,
  0.6 ms after**, against a 16.667 ms budget. It went DOWN while triangles went
  904 -> 19,120, because draw calls went 15 -> 5. The prompt's stated baseline is
  0.5 ms; the before-figure on this same container is 0.8 ms, so this machine
  simply reads a little slower than wherever 0.5 was taken.
- `presented` p95 rose 83.4 -> 100.1 ms against a 16.7 ms host idle control.
  That is **swiftshader software rasterisation in a headless container** filling
  more pixels, not a GPU measurement; 19k triangles with three directional
  lights is nothing on real hardware. Not verified on a real GPU.
- **`solidBuffers` translation fidelity**: signed volume agrees with the kernel
  mesh to 3e-8 relative (the residual is `Float32Array` storage against the
  kernel's doubles), `openEdges` 0, every normal unit to 1e-5.
- **Mutation proof**, five mutants, all killed, file restored byte-identically
  (md5 checked): mirror relabel (6 failed), naive y/z swap (1), a triangle
  dropped from the index buffer (1), normals left unnormalised (2), crease
  filter moved back to raw face normals (1). The runner concatenates stdout and
  stderr and parses the summary line rather than trusting vitest's exit code,
  and treats a missing summary as an instrument failure.
- **`svelte-check`**: 1 error, 37 warnings in 21 files, breakdown 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`. The one error is the pre-existing
  `picking.ts:80` `Vector2Like` one, untouched. Measured with
  `PUBLIC_SUPABASE_URL`/`PUBLIC_SUPABASE_ANON_KEY` exported first, per
  `CLAUDE.md`'s own instrument; without them the same tree reports 15 errors,
  the extra 14 being the `$env/static/public` phantoms.

## Not verified

- **No real GPU.** Everything visual was rasterised through swiftshader in this
  container. Colour and shading were read from screenshots, not from a
  classroom machine.
- **The `dev` guard in `build()` was not observed firing**, because no tree this
  kernel produces is open. It is reasoned from `solidBuffers`' own
  `openEdges`/`signedVolume`, which ARE both exercised in both directions by the
  unit tests' punctured and mirrored controls.
- **Reduced motion** is `no-preference` in the harness, so that path is not
  exercised.
- The out-of-band `readPixels` sweep written for this pass reported
  `paintedFraction 0` on both trees. That is the INSTRUMENT: the renderer runs
  with `preserveDrawingBuffer` false, so a read taken outside the render
  callback sees a cleared buffer. The app's own `paintedFraction` is only
  meaningful where it is actually called, inside `draw()`. The visual evidence
  here is the compositor screenshots, which is why they were looked at.

## picking.ts

`raycastFeatures` and `renderedFeatureIds` have **zero importers anywhere in
`src/`** -- swept, nothing outside the module and its own test. So switching the
mesh breaks nothing there today and nothing in that file was changed. Worth
recording for whoever wires it up: `RenderedFeatureRole` is `'body' | 'hex' |
'blade'`, and there is no longer a per-role object in the scene to hang those
ids on. One mesh carries no provenance, so feature picking against the solid
needs the kernel to retain it -- a per-triangle feature id alongside the mesh --
rather than a mapping the renderer can invent.
