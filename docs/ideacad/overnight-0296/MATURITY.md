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

## Final scores, 2026-09-23, on the tree merged to main

**Lowest: 2.** Up from 0. Nine areas sit at 2 and eight at 3; nothing is at 4, so under the
catch-up rule nothing is frozen and the areas at 2 go first next time.

| Area | Phase 0 | Final | Evidence for the final score |
|---|---:|---:|---|
| Customization | 0 | **2** | One per-user store in `profiles.preferences.ideacad.solid` (no migration) for planes, triad, view mode, quick toolbar and order, remappable shortcuts, snaps, polygon sides, feature defaults, hint delay, recent commands and units, edited in a Preferences panel with a Reset per group (W1, `foundation-w1/` screenshots, `tests/ideacad-solid-preferences.test.ts`). Not 3: panel layout, widths and colours are not customizable, and the profile store was never run against a real profile row. |
| Fillets and chamfers | 1 | **2** | The drag grows live (8 distinct readouts over an 80 px drag at 960 and 1440, F011), the tangent chain previews before the press (F012), a refused size is a sentence with a one-click "Use 0.499 in" found in at most 8 kernel attempts (F013, F014, real-kernel tests), tangent propagation is on by default and the last size is remembered. Not 3: the edge-set accelerator near the pointer was not wired, a near miss takes the face (F083), and an L bracket's every edge at once is refused by the kernel (F074). |
| Reference geometry | 1 | **2** | Front, Top, Right and the Origin exist in every part, named, in the tree with an eye and in the viewport, and a drawing press on a plane sketches on it (W1, tree agent, `tree/` screenshots). Not 3: no temporary axes on cylinders, no drag-a-face offset plane, and the Reference panel is still a long list (711 px, from 2013). |
| Selection and interaction | 1 | **2** | Hover on every kind (141,935 px changed over a face at 1440, pick under 1 ms median on 402 faces), box select in both directions, Select Other, pick filter, a registry-built right-click menu for seven kinds, context toolbar and breadcrumb, command search, remappable shortcuts, Escape that always clears (W1, W2). Not 3, because the final student drive still failed picks: the context bar can cover the next target (F071), the pin assembly's picks failed at 960 (F072), and 2 of 4 drill clicks landed at 1440 (F084). |
| Assembly | 1 | **2** | Behaviour-named joints (hinge, slider, cylindrical, planar, fixed, pin in slot) as one undo each, invalid pairs refused in words before adding, readable face names, and a hinged pin that a Move drag moved 0 in with no extra mate (W4 at 1440). Not 3: parts are still bodies, not definitions with occurrences; real-UI picks failed at 960 (F071, F072); an unmated multi-select still moves every body (F076). |
| Simulation and analysis | 1 | **2** | An Analysis toggle opens a mass table, combined CG, tip angle and sideways limit, inertia about a picked axis, exact interference and a true minimum clearance, every number Unknown with its blocking bodies under the density rule; spinner and FRC add-ons off by default (analysis agent, W4, `analysis/` screenshots, spec `ideacad-solid-state-sheet`). Not 3: no pose-dependent CG or one-degree-of-freedom posing, and no student drove it end to end with real materials. |
| Launch and documents | 2 | **2** | The front door is one compact band with the site logo and the refined IdeaCAD logo, no text touching a border (minimum 6.4 px), models first on a phone (first card 306 px down, from 572). Unchanged by rubric: a new model is still three steps (F001 partly). |
| Sketching | 2 | **2** | Sizes on drawn shapes are driving and typable, a size can be typed while drawing ("3 Tab 1.5 Enter" gave 3 x 1.5), the bracket's L was 7 Line clicks in a Front view (W4). Not 3: no inference relations on click (F004), one sketch per drawn shape (F005), no status colours. |
| Part features | 2 | **2** | A blind pocket from a face sketch now cuts (F078, fixed in the ending after it had always been refused), combine, mirror and pattern refusals say what to change (F009 partly). Not 3: patterns copy bodies not features (F010), no counterbore or countersink. |
| Materials and appearance | 2 | **2** | Unchanged: cited densities and colours; the material list is still a code constant, not the 0208 table (an open question). |
| Import and export | 2 | **2** | Unchanged in the product. A measured spike shows STEP needs `remus-wasm-io` (the core kernel's `toBREP` refuses) and that v2.130.20 round-trips exactly with 25.4 scaling; not vendored tonight. |
| Design tree and history | 1 | **3** | SolidWorks-shaped: planes and Origin on top, sketches nested and collapsed under the features that use them, rename by F2 or a slow double-click, quiet rows, one shared menu with refusals, hover linked both ways, a rollback bar that inserts at the bar (7 real-kernel tests), and a bottom history slider with Play, Pause, Stop and three speeds replaying cached meshes at 1.1 to 1.4 ms a step (W3; specs `ideacad-solid-state-tree` and `-history` 0 outside threshold at 375, 960 and 1440). |
| Dimensions | 1 | **3** | Every driving size is drawn beside its geometry as a 44 px button and typed in place, driven values gray and marked measured, labels follow the camera and avoid the chrome, and drawn shapes arrive sized (dims agent; mounted in 38667e2e; W4's bracket drive). Not 4: no smart-dimension tool placed by the student, and the first dimension does not rescale the sketch. |
| Viewport and display | 1 | **3** | Front, Top, Right, Iso, Normal To (with flip), Fit framing the model clear of open panels, a corner triad that turns with the view, four display modes, size-relative display tessellation (a disk from 2,580 to 5,956 triangles, orbit p95 1.7 to 0.8 ms), right-drag orbit, refit when an edit runs off screen, 0 px overlap at 960. Open: F045 (seams), no capped section; F085, a sketch-entry framing that overrode a view chosen in the same moment, was fixed in the ending. |
| Learning and onboarding | 1 | **3** | Tool cards open after the preference's delay (406 to 427 ms, from 1 ms) with a looping gesture picture, on focus as well as hover; a Learn button opens a non-blocking five-task tutorial on the student's own model; first-use hints retire when the tool makes something; instruction prose is gone from the panels (learning agent, W4, spec `ideacad-solid-state-learn`). Its "cut a hole" task was blocked by the pocket refusal until the ending's fix, which was verified by kernel tests and not re-driven through the tutorial. |
| Branding and chrome | 1 | **3** | Site logo and refined IdeaCAD logo on the chooser, an animated extruding cube on the home card that stands still under reduced motion, 0 overlaps at 960 (was 59.6 x 46 px), no control text within 6 px of its border in the workspace or the front door, the palette's empty cells gone, the shell's Voice and Report controls docked in the footer. |
| Add-ons | 2 | **3** | IdeaBlade, a spinner-weapon calculator and FRC checks, all off by default and advisory only, with every formula shown and its source named; never-restrict still pinned at the type level. |

## Re-scores

Every move above is from Phase 0 to the final tree in one step, because the agents that built
each area reported evidence per area and this ledger records the orchestrator's reading of it
rather than each agent's suggestion. Where an agent suggested a higher score than this ledger
gives (W2 suggested more for selection; W4 suggested 3 for simulation, assembly and
sketching), the final student drive or a missing capability named above is why it was not
taken.
