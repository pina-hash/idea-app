# IdeaCAD maturity ledger, ledger 0296

The end state is judged by the LOWEST score, so the lowest is stated first.

Rubric (`docs/ideacad/OVERNIGHT_0296.md` section 3): 0 absent. 1 exists but a student
cannot use it without help. 2 usable for the basic case, with visible gaps. 3 covers what a
student in IDEA100 or FRC needs, discoverable without instruction. 4 matches the vision,
including the speed thesis against SolidWorks.

Every re-score below cites evidence: a screenshot, a test, or a measured behavior. A score
is never moved on the strength of code having been written.

## Phase 0 scores, 2026-09-23 (before any change)

Lowest: **0, Customization.** Next lowest: **1**, ten areas.

| Area | Router's claim | Phase 0 score | One line of evidence |
|---|---|---|---|
| Customization | 0 | **0** | No settings, shortcut, layout or unit control anywhere in the workspace (browser probe: 0 matching controls); four module settings live in memory only (`viewport/drag-math.ts:81`, `viewport/drawing.ts:33`, `viewport/reference-layer.ts:38`, `features/options.ts:34`). |
| Fillets and chamfers | 1 | **1** | An edge drag freezes at its first sample and reports "That edge is no longer on the model" (`audit/fillet-drag-live-1440.png`); refusals are raw kernel text (`audit/interact-fillet-oversize-1440.png`); no hover preview (0 pixels changed). Tangent chain and face-to-edges exist but default off. |
| Reference geometry | 2 | **1** | No Front, Top, Right or Origin in the tree; datum planes hidden by default, named XY/XZ/YZ and unpickable (`reference-layer.ts:38,170`); the Reference panel is 2013px of prose at 1440 (`audit/solid-allpanels-1440.png`). |
| Design tree and history | 1 | **1** | One flat `<ol>`, no nesting or collapse, no rollback bar, no timeline, F2 does nothing, row hover highlights nothing (`audit/interact-tree-row-1440.png`). |
| Dimensions | 2 | **1** | Typing after a draw drops characters ("0.25" became a 2 in and a 25 in plate), the value box cannot be dismissed, a rectangle has no size to type, nothing is drawn in the viewport (`audit/interact-numeric-stuck-1440.png`). |
| Selection and interaction | 1 | **1** | Hover changes 0 canvas pixels, right-click opens nothing, a box drag selects page text, Escape keeps the selection, consumed sketches win 8 of 8 picks on a hole wall. |
| Viewport and display | 2 | **1** | Only Fit, Top and 3D; "3D" unreachable at 960 (elementFromPoint returns "Objects"); axes helper at the origin instead of a corner triad; no view modes; uncapped section z-fights (`audit/section-1440.png`); ghost sketches (`audit/pin-moved-1440.png`). |
| Assembly | 1 | **1** | A concentric pin mate solved in 21 actions with a clear freedom sentence, but moving the pin moved both parts and the magnetic snap added an erroring redundant mate (`audit/pin-moved-1440.png`). |
| Simulation and analysis | 0 to 1 | **1** | Measure (distance, angle, body-to-body clearance with witness points) and cited-density mass exist; CG and inertia only inside the IdeaBlade add-on panel; no interference, tip-over or spinner readout (`audit/material-aluminum-1440.png`). |
| Learning and onboarding | 1 | **1** | Tooltips appear at 1 ms with no delay and are not linked for assistive tech; no help or tutorial control; an empty document shows no cue; every panel opens with instruction prose. |
| Branding and chrome | 2 | **1** | 960 overlap hides "3D"; text 1.0 px from its border on four front-door button types; the global Voice and Report controls cover the footer and panels; expanded palette is 34% empty cells; the home card is a static cube; the masthead is 90% empty. |
| Launch and documents | 3 | **2** | Folders, tags, search, archive and trash all work (`audit/launch-1440.png`), but a new model is three steps and opens on an empty canvas with no planes. |
| Sketching | 2 | **2** | Five draw tools, trim, extend, corner fillet, 21 constraint types and solve status exist; no inference relations, no typed size mid-draw, each shape its own sketch, no values drawn in the viewport. |
| Part features | 3 | **2** | Extrude, revolve, push, shell, draft, sweep, ruled loft, hole, mirror and boolean exist; patterns copy bodies not features, no counterbore or countersink, the disk-and-teeth union was refused with a wrong sentence (`audit/disk-union-refused-1440.png`). |
| Materials and appearance | 2 | **2** | Fourteen materials, "Mass: Unknown" until one is chosen, then an estimate with density and a MatWeb link; per-body colour override. The list is a code constant, not the 0208 table. |
| Add-ons | 2 | **2** | Registry with never-restrict pinned at the type level; IdeaBlade off by default; nothing else registered. |
| Import and export | 2 | **2** | 3MF, STL, DXF profile and `.ideacad` backup; import reads only the backup; no STEP. |

## Re-scores

Each line: date and time, area, old to new, the evidence, and the commit.

(none yet)
