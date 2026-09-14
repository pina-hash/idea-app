# 0265 The viewport renders the solid
- Issued: 2026-09-14T07:10:00Z
- By: Claude Code session
- Owns: `src/lib/ideacad/viewport/Viewport.svelte`, its tests, `docs/prompt-ledger/entries/0265-*`, `docs/history/sweet-hypatia-0q6im4.md`
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0215 (local tree)
- Status: pushed
- Branch: `claude/sweet-hypatia-0q6im4`
- Notes: Renderer only. `viewport/controls.ts`, `camera-rig.ts`, `controls-math.ts`,
  `picking.ts`, all of `blade/`, `ui/`, `routes/`, `BladeEditor.svelte`,
  `ideacad.css`, `store.ts` and `geometry.ts` were forbidden and none was
  touched.

## What it did

`Evaluation.geometry.solid` (ledger 0254) is now the only thing the viewport
draws. The per-part meshes built from `geometry.stations`, `geometry.hexHeight`
and `geometry.bladeZ` are gone, along with the `evaluationGeometries` import;
there is no fallback path. One `BufferGeometry`, one material, one
`LineSegments` of crease edges.

## What it found, which is the half that matters

**The solid is watertight and outward-wound, and it is the WRONG SHAPE.**
`unionMesh`'s hole-closing loop in `src/lib/ideacad/blade/evaluate.ts` inflates
the part by 48.7%: measured, the sampled model is 29,488 cells / 20.638 in^3 and
the eight passes take it to 43,840 cells / 30.682 in^3, adding ~1,750 cells
EVERY pass with no decay. At zero passes the skin already has **0 non-manifold
edges**, so the passes repair nothing on this part and are pure dilation. The
rendered result reads as a rounded cube rather than a rotor.

`blade/evaluate.ts` is another lane's file and was not touched. See
`docs/history/sweet-hypatia-0q6im4.md` for the full measurement table and the
shape of the fix.
