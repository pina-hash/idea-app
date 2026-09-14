# IdeaCAD direct manipulation: research, constraints, and shipping plan

**Ledger:** 0253  
**Date:** 2026-09-14  
**Scope:** research and plan only; no implementation or migration

## Executive decision

The fastest valuable interaction that fits the current document is **dragging the blade assembly up and down the hex/core axis to edit `mount.z`**, with a live inch readout and typed entry. It is a one-degree-of-freedom inversion: the rendered blades already use `bladeZ = mount.z`, and changing that scalar regenerates all dependent display and physics outputs. It does not pretend a triangle in a tessellated mesh is a CAD face.

Do not begin with generic face push/pull. IdeaCAD does not hold a boundary-representation solid or face provenance; it renders disposable Three.js meshes generated from six parameter features. A generic face drag therefore has no single truthful parameter to change.

## 1. Plasticity research

### Source-access result

The required web-search pass was attempted in this container on 2026-09-14. The configured search service returned HTTP 401, and direct requests to both the [Plasticity manual](https://doc.plasticity.xyz/) and [Plasticity product site](https://www.plasticity.xyz/) returned HTTP 403. Google, Bing, and DuckDuckGo requests were also blocked before receiving a response. Consequently, none of the operational claims below could be checked against a retrieved primary source. They are deliberately marked **UNVERIFIED**, rather than presenting recollection as research. Those two official entry points are the sources a connected follow-up must open; a link here is not evidence that this session read it.

### Claims matrix

| Required question | Result of this pass |
|---|---|
| Product positioning | **UNVERIFIED.** Plasticity is described in the owner's requirement as a commercial Parasolid direct modeller for concept artists/product designers. The session could not retrieve the [official product site](https://www.plasticity.xyz/) to independently establish that description. |
| Selecting vertex, edge, face, solid; level switching; modifiers | **UNVERIFIED.** No retrieved source established selection-mode keys, selection cycling, or modifier meanings. Do not copy any Plasticity shortcut into IdeaCAD from this report. |
| Grabbing and dragging a face | **UNVERIFIED.** This pass cannot establish whether a particular gesture invokes push/pull, offset, free translation, or a command-specific gizmo, nor what HUD feedback appears. |
| Translate, rotate, and scale gizmos | **UNVERIFIED.** Axis/plane constraints, gizmo invocation, repositioning, and the exact relationship between drag and numeric input remain unsourced. |
| Snapping and inference | **UNVERIFIED.** Candidate geometry, inference rules, temporary tracking, and override keys remain unsourced. |
| What Plasticity omits relative to SolidWorks | **UNVERIFIED.** The important hypothesis is that removing drawing/documentation and a rebuild-sensitive parametric feature workflow reduces interaction overhead, but it must not be stated as Plasticity fact without a retrieved source. |
| History model | **UNVERIFIED.** This pass did not establish whether current Plasticity releases have no feature tree, a command history, selective parametrics, or another model. Version matters; a source must name the release it describes. |

### Required connected follow-up

Before Plasticity-specific bindings or behaviour become acceptance criteria, retrieve and archive citations for all six rows above. Prefer the current official manual and release notes; use an independent review only for comparisons the vendor does not make. Record the application version and publication/access date. The implementation plan below intentionally relies on the owner's desired *outcome*—low-friction viewport editing—not on any unverified Plasticity keystroke.

## 2. What IdeaCAD can and cannot invert

### The actual model

`BladeTree` is schema-1 parameter data. `evaluate()` finds one feature of each type and derives stations, a four-point blade polygon, instance count, mount height, and hex dimensions. `evaluationGeometries()` then creates new `LatheGeometry`, `CylinderGeometry`, and `ExtrudeGeometry` objects. The mesh is output, not authority.

| Feature | Rendered thing a user might drag | Honest inverse on today's tree | Limits / non-invertible cases |
|---|---|---|---|
| `revolve` | Profile station point | Radial drag → `stations[i].r`; axial drag → `stations[i].z`. | A lathed mesh face between two stations is influenced by both endpoints, so generic face offset has no unique inverse. `stations[0].z` is fixed to configured tip height; z must remain strictly increasing; 3–8 points. Use explicit station handles, not picked triangles. |
| `hexBoss` | Top face/axial handle; side pair/radial handle | Top motion along core axis → `height`; symmetric across-flats motion → `acrossFlats`. | The boss base is derived from the body's final station and has no independent position. A freely dragged single side face would skew the hex, which the schema cannot express. |
| `bladeSketch` | Root/tip points and named edges | Symmetric root-edge motion → `rootWidth`; symmetric tip-edge motion → `tipWidth`; radial tip motion → `length`; tangential tip-centre motion → `sweepDeg = atan2(shift,length)`; translating both root points radially → `mountRadius`. | An arbitrary vertex move changes several scalars and may not remain the schema's constrained trapezoid. Ambiguous gestures need named handles or a declared constraint priority; free-form four-vertex editing is not representable. |
| `extrude` | Blade top/bottom face | No continuous inverse. `thickness` is the literal `'stock'`; actual thickness comes from the selected stock id. | Drag-to-any-thickness would require a new stored parameter or choosing the nearest real stock. The renderer currently extrudes a hard-coded `.125`, while evaluation uses selected stock thickness, so visual thickness is not even a reliable inverse target today. Do not disguise a material choice as push/pull. |
| `circularPattern` | One patterned blade or an angular/count handle | A discrete gesture could drive integer `count` (2–8). | Continuous angular reposition, unequal spacing, editing one instance, or dragging radius is not representable. Instances are evenly rotated about the axis. A drag is lower value than a wheel/step control. |
| `mount` | Whole patterned blade assembly along the vertical core/hex axis | Axial translation → `z`, directly and uniquely. | X/Z-plane translation, tilt, or moving one patterned instance is not representable. This is the best first drag. |

Materials, body fill, rotation direction, and standard-part facts are document inputs but not geometric feature inversions. Standard parts have mass metadata and an empty geometry object in the fallback config; there is presently nothing to grab.

### What “parts along the hex core” means now

The only current feature that positions designed geometry along the core axis is `mount`: it references the patterned blade feature and stores one `z` value. Evaluation exports it as `geometry.bladeZ`; the viewport assigns that value to every blade mesh's vertical position. Therefore dragging the blade assembly along the core maps exactly to `mount.z`.

The `hexBoss` itself is not positioned by a `z`: its base is always `bodyTop`, and `height` changes only its extension. The named standard parts (“Hex core”, “Hex collar”, “Tip bolt”) are mass facts, not selectable geometry. If “parts” means independently placeable hardware rather than the blade assembly, the current tree cannot do it.

### Picking: what exists and what is missing

`picking.ts` can raycast `Object3D` targets labelled with a feature id, walk from the intersected child to a labelled ancestor, deduplicate hits per feature, and return hit point/distance. Its helper can assign body and hex to their one source feature. For a blade it assigns only the terminal feature in the valid sketch → extrude → pattern → mount chain, preferring `mount`.

That is **feature-level potential, not wired selection**: the current `Viewport.svelte` does not import or call `raycastFeatures`, does not label its meshes with those ids, and exposes no pointer-hit callback. It cannot select a topological face, edge, or vertex. Three.js raycasting can identify a rendered triangle and optional instance, but IdeaCAD lacks:

1. stable face/edge/vertex identifiers;
2. evaluator provenance from output topology back to source parameter(s);
3. pick targets for line/point handles and screen-space hit tolerances;
4. selection-level state and filters;
5. occlusion/cycling policy for coincident hits;
6. a drag plane/axis solver from screen rays;
7. preview/accept/cancel plumbing from viewport to the existing draft transaction.

### What breaks when an early feature moves

Today an accepted parameter edit replaces the whole tree, and reactive evaluation regenerates all downstream geometry and readouts. Declared reference dependencies are checked for presence, order, and suppression. That means a legal early scalar edit does not leave a stale later mesh: downstream output is recomputed.

The failure is semantic rather than a classic cached rebuild failure. References say only “built from feature id”; they carry no face/edge/vertex reference that can become dangling. Later features therefore cannot fail with “missing face”—but neither can they preserve design intent tied to one. Examples: moving the final body station also moves the derived hex base, while `mount.z` remains absolute and may now intersect or float; changing blade `mountRadius` does not adapt blade length to preserve overall diameter; changing stock thickness changes physics while current render thickness stays `.125`.

The drag path should therefore:

- preview by cloning and changing only its named scalar;
- validate every preview and clamp/refuse before producing an illegal tree;
- recompute every dependent output immediately;
- show a named failure rather than silently repairing unrelated later parameters;
- commit once on pointer-up/Enter through the editor's existing Accept/store path, so one gesture is one durable history decision;
- cancel to the pre-drag tree on Escape/pointer cancellation;
- eventually add explicit reference policies if the schema gains topology-dependent features. “Best effort” remapping by triangle index is forbidden.

## 3. Shipping bundles

Each bundle is independently useful and keeps the schema unchanged unless explicitly stated.

### Bundle 1 — axial blade-mount drag (ship first)

- **Owns:** `src/lib/ideacad/viewport/Viewport.svelte`; `src/lib/ideacad/viewport/picking.ts`; new `src/lib/ideacad/viewport/drag-axis.ts`; `src/lib/ideacad/BladeEditor.svelte`; `src/lib/ideacad/ui/feature-model.ts`; targeted `tests/ideacad-*mount-drag*.test.ts`; the existing dev IdeaCAD harness and its route-scoped browser-verification entry; its ledger/history files.
- **Migration:** no.
- **Felt delivery:** click the blade assembly and drag it vertically along the core; the model, dimension HUD, mass/COM/rules, and Mount height preview together. Type an exact inch value without leaving the drag. Release/Enter accepts once; Escape cancels. Read-only documents never arm it.
- **Why first:** `mount.z` is the only rendered assembly placement with a one-scalar inverse. It directly answers the owner's “parts along the hex core,” has no topology ambiguity, and exercises the reusable hard parts—selection wiring, ray-to-axis math, preview transaction, numeric HUD—without claiming generic direct modelling.

### Bundle 2 — body station handles

- **Owns:** viewport handle renderer/picker modules; `Viewport.svelte`; `BladeEditor.svelte`; `feature-model.ts`; targeted station-drag tests and dev/browser harness entries.
- **Migration:** no.
- **Felt delivery:** select Body Revolve and drag visible profile points radially or vertically; constrained neighbours and live measurements make the body feel sculptable while preserving the 3–8-station model.

### Bundle 3 — blade planform handles

- **Owns:** new blade-handle/inversion module; viewport overlays/picking; editor preview wiring; feature-model helpers; targeted unit/browser tests.
- **Migration:** no.
- **Felt delivery:** drag named root-width, tip-width, length, sweep, and mount-radius handles in top view, with exact numeric takeover. It edits the constrained trapezoid honestly rather than advertising arbitrary vertex motion.

### Bundle 4 — hex size and extension handles

- **Owns:** new hex-handle/inversion module; viewport overlays/picking; editor wiring; targeted tests/harness entries.
- **Migration:** no.
- **Felt delivery:** pull the top handle for extension height and a symmetric side handle for across-flats, with rule-limit feedback.

### Bundle 5 — selection vocabulary and reusable transform HUD

- **Owns:** viewport selection-state/filter modules, gizmo/HUD components, keyboard binding documentation, `Viewport.svelte`, `BladeEditor.svelte`, accessibility and browser tests.
- **Migration:** no.
- **Felt delivery:** predictable feature/handle targeting, cycling through obscured candidates, translate-axis highlighting, drag-plus-type numeric entry, and discoverable override/cancel controls shared by bundles 1–4.
- **Order note:** Bundle 1 should build only the narrow reusable slice it needs; this bundle generalises after measured use, rather than designing an abstract CAD gizmo before one honest manipulation exists.

### Bundle 6 — topology-capable direct modelling (decision gate)

- **Owns:** not assignable yet; it would include a new geometry kernel/provenance boundary, a new tree/schema version, evaluator/validator/history changes, conversion strategy, and broad tests.
- **Migration:** probably yes if stored concepts change; not authorised by this plan.
- **Felt delivery:** only this class of work could honestly support arbitrary face push/pull, edge moves, vertex moves, booleans, fillets, and stable downstream references.
- **Gate:** decide whether IdeaCAD remains a very fast constrained blade ideator or becomes a general B-rep modeller. Parasolid-class behaviour is not a UI bundle over Three.js triangles.

## Questions for Mr. Pina

1. Does “parts along the hex core” mean the patterned blades? **Default: yes**, because `mount.z` is the only current independent axial placement.
2. During a drag, should out-of-rule geometry preview red or stop at the limit? **Default: preview red but never commit invalid tree**, because ideation benefits from seeing the boundary.
3. Should pointer-up commit immediately, or leave the existing green Accept step? **Default: pointer-up accepts once**, because the requirement prioritises quickest controls; Escape remains cancel and Undo remains recovery.
4. For a blade vertex gesture that could change width and sweep, should Shift lock the secondary parameter? **Default: named single-parameter handles first**, because free vertex priority is otherwise surprising.
5. Is arbitrary Plasticity-style face editing a long-term product requirement, or is fast constrained blade editing enough? **Default: constrained**, because the present schema can ship it without pretending to be a B-rep kernel.

## Ready-to-paste prompt — Bundle 1

```text
Ledger <ALLOCATE BEFORE ISSUE>. NO MIGRATION.

Read CLAUDE.md in full, then docs/CODEX_ENVIRONMENT.md and
docs/IDEACAD_DIRECT_MANIPULATION.md. Audit before building; if the named axial
drag already exists, make it reachable/complete rather than creating a second path.

OWNER'S OUTCOME: In the IdeaCAD viewport, an editor can grab the patterned blade
assembly and drag it along the core axis. This edits only the mount feature's `z`.
The model and all derived readouts preview live. Show the current value in inches
during the gesture and allow typing an exact value. Pointer-up or Enter accepts the
gesture as ONE edit; Escape and pointer cancellation restore the pre-drag tree.
Read-only/shared viewers cannot arm a drag. Camera middle-button controls must remain
unchanged. Do not claim face/edge/vertex editing and do not infer a parameter from a
rendered triangle.

OWN ONLY:
- src/lib/ideacad/viewport/Viewport.svelte
- src/lib/ideacad/viewport/picking.ts
- src/lib/ideacad/viewport/drag-axis.ts (new)
- src/lib/ideacad/BladeEditor.svelte
- src/lib/ideacad/ui/feature-model.ts
- tests/ideacad-mount-drag.test.ts (new)
- src/routes/dev/ideacad/+page.svelte
- tools/browser-verify/routes/ideacad-mount-drag.mjs (new)
- docs/prompt-ledger/entries/<ledger>-*
- docs/history/<branch-slug>.md

FORBIDDEN:
- all supabase/
- every migration
- BladeTree/schema changes
- src/lib/ideacad/blade/tree.ts
- src/lib/ideacad/blade/evaluate.ts
- src/lib/ideacad/blade/validate.ts
- src/lib/ideacad/geometry.ts
- generic translate/rotate/scale gizmos
- changes outside the owned files

Implementation constraints:
1. Wire existing feature-level raycasting to the real meshes; preserve deterministic
   hit ordering. The blade selection resolves to the terminal mount feature.
2. Put pure ray-to-world-axis projection math in drag-axis.ts and unit-test camera
   orientations, near-parallel rays, clamping, and finite outputs.
3. Preview by cloning the current draft and changing `mount.z` through one pure
   feature-model helper. Use the same bounds/validation semantics as Mount height.
4. One gesture produces one accepted store edit/history decision, never one per
   pointermove. Do not add a second autosave throttle.
5. Render an axis/highlight and an inch HUD that remain readable at 375px and 1440px.
   Numeric entry must not trigger viewport shortcuts. Escape is cancel.
6. Use pointer capture as an improvement, not a precondition. Clean up every listener,
   geometry, and material on rebuild/unmount.
7. Extend the dev-only IdeaCAD harness using the real component; it must remain 404 in
   production. Drive the interaction in Chromium and measure the resulting `mount.z`,
   one accepted write, cancel restoration, read-only refusal, and unchanged camera drag.

VERIFY AND REPORT NUMBERS, NOT ONLY EXIT CODES:
- npm test
  Report total test files and total tests passed/failed from Vitest's summary.
- npm run check
  `svelte-check` must report exactly 0 errors and the established baseline of 37
  warnings in 20 files; any different count is a regression or a baseline drift that
  must be investigated and reported, not waved through.
- npm run history:verify
- npm run verify:browser -- --route ideacad-mount-drag
  Report the measured 375px and 1440px interaction results and any console/page errors.
- git diff --check

Write the branch-named history entry. Commit all owned changes. Your final commit flips
your own ledger entry from `Status: issued` to `Status: pushed`, then push. Create a PR
targeting main. This bundle carries no migration and is SELF-MERGE AUTHORIZED once every
required check is green: merge the PR yourself without force-pushing, confirm the tip is
contained in main, and report the PR, merge commit, exact test counts, exact svelte-check
counts, browser measurements, and that no migration or schema file changed.
```
