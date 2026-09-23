# IdeaCAD friction log, ledger 0296

Every place the program was slow, confusing, ugly, dead, overlapping or missing something,
one line each, tagged with its area. Phase 0 lines (F001 to F066) came from driving
`/dev/ideacad-solid`, `/dev/ideacad-launch`, `/` and `/ideacad` in Chromium at 1440x900, 960x900
and 375x812 on 2026-09-23, trying to model a motor bracket, a spinner disk and a pinned
two-part assembly as a student would. Screenshots are under
`docs/ideacad/verification/0296/audit/`. Later lines are added by the seek-out loop.

Status words: **open**, **fixed** (with the commit that fixed it and how it was re-checked),
**deferred** (with the reason).

## Launch and documents

- **F001** open. A new model costs '+ New model', a name form, then 'Create and open' before the empty workspace. Widths: all. Evidence: launch-newform-1440.png Second half fixed in 609bba4a (a new document is one click from drawing); the launch name form is still open.
- **F002** fixed (4c2309d3, 676793b9 (merged in 76dc58c7)). At 375 the folder and tag rail sits above the model list, so the first card is about 570px down. Widths: 375. Evidence: launch-375.png Re-checked: Branding agent: at 375 the first card moved from 571.7px to 306.2px down; the folder rail folds into one Folders row below 960px.
- **F003** open. /ideacad signed out redirects to / with no sign-in prompt about IdeaCAD. Widths: all. Evidence: chrome-results ideacadRoute.url='/'

## Sketching

- **F004** open. Line clicks get no inference: the L profile ended with 0 constraints and 'Under defined' status words only inside the sketch editor. Widths: 1440. Evidence: bracket-attempt2-profile-1440.png
- **F005** open. Each drawn shape becomes its own sketch; several circles in one sketch require Edit sketch and the sketch panel's tools. Widths: all. Evidence: disk and bracket trees
- **F006** open. Edit sketch keeps the old zoom with the origin at screen center, draws the body over the sketch, and lets the sketch run under the Sketch panel; clicking a line to dimension it selected nothing. Widths: 1440. Evidence: interact-sketch-edit-1440.png; sketchSelection=null
- **F007** open. No size can be typed while drawing a rectangle or circle; only the readout at the pointer. Widths: 1440. Evidence: bracket-attempt1-drawing-1440.png; typedMidDraw.numeric=false

- **F067** fixed (efac228d). A rectangle drawn edge-on (zero width or height) became a flat sketch that could not be extruded, with no word about why. Widths: all. Re-checked: W2, refused with its own sentence and no feature added (test in tests/ideacad-solid-sketching-layer.test.ts).

## Part features

- **F008** fixed (efac228d). Hole tool: a plain click on the face only selects it; drilling at the press point needs a press-and-drag of a few pixels. Widths: 1440. Evidence: bracket holeLog featuresAfterClick vs featuresAfterDrag Re-checked: W2: two clicks with Hole on a face gave 2 holes, 1 body, no error.
- **F009** open. Union of a disk and two overlapping teeth refused with 'This change could not form a valid solid. Try a different size.' although nothing was sized; the failed Combine stays in the tree. Widths: 1440. Evidence: disk-union-refused-1440.png
- **F010** open. Linear and circular pattern copy whole bodies, not features, so a hole pattern means drilling each hole. Widths: all. Evidence: disk circular pattern made bodies 2 and 3

## Fillets and chamfers

- **F011** fixed (d568f208). Dragging an edge with Fillet freezes at the first sample (R 0.056 in over a 60px drag) and shows 'That edge is no longer on the model. Select it again.' Widths: 1440. Evidence: fillet-drag-live-1440.png Re-checked: W3 driver at 1440 and 960: an 8-step fillet drag on an edge read R 0.047 to 0.332 in, growing every sample, no error; a face pressed with Fillet rounded its 4 edges. Every edge and face reference now comes from the model as the gesture found it.
- **F012** fixed (d568f208). No hover preview on edges with the Fillet tool (0 pixels changed). Widths: 1440. Evidence: fillet probe hoverEdgePixels=0 Re-checked: W3 driver at 1440 and 960: with Fillet armed, pointing at a straight edge drew its tangent chain (1 edge) in the preview colour and pointing at a face drew its 4 edges, before any press. Screenshot integration-w3/fillet-preview-1440.png. At 375 the panels covered the model point (F044).
- **F013** open. Refusals are raw kernel text: 'blend: blend cliff on face Id(2) at edge Id(9): requested radius 3, available radius 2.999999999999999' and 'blend: unsupported vertex blend at Id(25): 2 stripes meet'; failed fillets stay in the tree as ERROR. Widths: 1440. Evidence: interact-fillet-oversize-1440.png, fillet-face-edges-1440.png
- **F014** open. Filleting all four edges of a face fails when one edge already has a fillet, with no suggestion of what to do. Widths: 1440. Evidence: fillet-face-edges-1440.png

## Reference geometry

- **F015** fixed (609bba4a (planes) and 8fb887cf (tree rows)). No Front, Top, Right planes or Origin in the tree; datum planes are hidden by default, named XY/XZ/YZ, and not pickable. Widths: all. Evidence: solid-empty-1440.png; reference-layer.ts datumShown=false Re-checked: W1 and the tree agent: Front, Top and Right named and pickable, and listed with the Origin above the features.
- **F016** open. Reference panel is 2013px tall and opens with prose ('Planes, axes and points to build against...'). Widths: 1440. Evidence: solid-allpanels-1440.png

## Design tree and history

- **F017** fixed (8fb887cf (merged in 8d369c7f)). Flat tree: sketches do not nest under the features that use them, no collapse (0 nested lists), no rollback bar, no timeline. Widths: all. Evidence: interact-tree-row-1440.png; treeNesting.nestedLists=0 Re-checked: Tree agent: sketches nest under the feature that consumes them; a node moves with its sketches, now as one edit (e8cb1ef9, reducer test in tests/ideacad-solid-tree-nesting.test.ts).
- **F018** fixed (8fb887cf (merged in 8d369c7f)). F2 does not rename a tree row (double-click does). Widths: 1440. Evidence: interact probe f2Renames=false, dblclickRenames=true Re-checked: Tree agent: F2, a slow second press, and the menu rename in place at three widths.
- **F019** fixed (bc2c9d87 (tree half) and d568f208 (workspace half)). Hovering a tree row highlights nothing in the viewport (0 pixels changed). Widths: 1440. Evidence: interact probe treeHoverPixels=0 Re-checked: W3 driver at 1440, 960 and 375: hovering the Plate row preselected 2 selections in the model and leaving cleared them to 0; pointing at the top face lit li[data-row=ex1].
- **F020** fixed (8fb887cf (merged in 8d369c7f)). Every row shows '● OK', and a selected row expands into six buttons and two prose sentences. Widths: 1440. Evidence: interact-tree-row-1440.png Re-checked: Tree agent: quiet rows, one menu per row; W3: the row menu is the workspace's own right-click menu (6 rows, 3 refused with their reasons, a refused press shows its sentence, focus returns to the row).
- **F021** fixed (e8cb1ef9, 135d9f91). Below 1024px the tree is a 300px slide-over that covers the tool palette and does not close when the viewport is clicked. Widths: 960, 375. Evidence: tree-open-960.png; treeStillOpenAfterViewportClick=true Re-checked: W3 driver at 960 and 375: a press on the model closed the slide-over (aria-expanded true to false); a tree-menu refusal left 0px of overlap between the message and the slide-over (tree bottom 492, message top 500.6 at 375).

## Dimensions

- **F022** fixed (8051d96a). Typing a value right after drawing drops characters: '0.25' then Enter gave a 2 in plate in 1 of 3 trials and a 25 in plate in another run; with the sketch already selected, '0.25' typed at 0ms spacing put '5' in the box. Widths: 1440. Evidence: interact typedImmediately [2, 0.25, 0.25]; typedRace delay0 boxValue '5'; pin3 first run bounds z 0..25 Re-checked: W1: rectangle then 0.25 typed at 0 ms spacing and Enter, 9 of 9 trials at 1440, 960 and 375 extruded 0.25.
- **F023** fixed (8051d96a). The typed-value box cannot be dismissed: Escape and clicking empty viewport both leave it open. Widths: 1440. Evidence: interact-numeric-stuck-1440.png Re-checked: W1: Escape and a press on the model each close the value box, at all three widths.
- **F024** open. A rectangle has no width or height to type; Dimensions says 'Sketch 1 has no number to type. Its shape comes from what it was made on.' and shows only the measured area. Widths: all. Evidence: bracket-attempt2-profile-1440.png
- **F025** open. No dimension is drawn in the viewport; every number lives in a side panel. Widths: all. Evidence: all built screenshots
- **F026** open. Fillet panel Radius shows 0.25 after a typed 0.2 fillet was applied, so the panel disagrees with the model. Widths: 1440. Evidence: bracket-attempt1-fillet-1440.png

## Selection and interaction

- **F027** fixed (ba0ea5a5). No preselection highlight: hovering a face or an edge changes 0 canvas pixels, against 208,120 pixels for the click-select control; the cursor never changes. Widths: 1440. Evidence: interact probe hover.facePixelsChanged=0 Re-checked: W2: hover preselection; canvas pixel diff before and after hover at 1440/960/375 (face 141,935 / 141,148 / 21,461 px changed).
- **F028** fixed (ba0ea5a5). Right-click on a face or on empty space opens nothing (0 DOM change) and does not change the selection. Widths: 1440. Evidence: interact-rightclick-face-1440.png Re-checked: W2: own right-click menu, specs ideacad-solid-state-menu and -menu-empty 0 outside threshold at 375 and 1440.
- **F029** fixed (ba0ea5a5). Box drag on empty space draws no rectangle and selects nothing; it selects the page's text instead (blue highlight across header and tree). Widths: 1440. Evidence: interact-boxdrag-mid-1440.png Re-checked: W2: box select both directions, spec ideacad-solid-state-box plus 17 unit tests.
- **F030** fixed (c1a6427e). Escape does not clear the selection (1 selection remains) and does not close the typed-value box. Widths: 1440. Evidence: interact probe escape.selectionsAfterEscape=1; interact-numeric-stuck-1440.png Re-checked: W1: one window Escape steps gesture, then transient chrome, then selection; inside a panel input it only takes focus out.
- **F031** fixed (ba0ea5a5). Pressing within about 7px of an edge picks the edge over the face, so drawing that starts at a face edge silently falls back to the default datum plane. Widths: 1440. Evidence: bracket-attempt1-two-bodies-1440.png; tree says 'XY plane found' Re-checked: W2: drawing tools rank a face above an edge (unit test and driver).
- **F032** fixed (ba0ea5a5). Consumed sketches win picks: the hole's own sketch covers its mouth from above and the base sketch covers the bottom face, so a circle-cut hole wall cannot be selected from any angle (8 of 8 picks failed). Widths: 1440. Evidence: pin-orbit-under-1440.png, pin2 holeAttempts Re-checked: W2: consumed sketches drawn only when open, selected or hovered from a list; 8 of 8 driver checks.
- **F033** fixed (c1a6427e). Selections persist across tool changes: after mating, the Move tool moved both bodies. Widths: 1440. Evidence: pin-moved-1440.png Re-checked: W1: after a mate lands the selection goes from 2 to 0, at 1440.
- **F034** open. Pick descriptions show internal ids ('Body 1, f8daa0329cd1e.wall (face)') in the Mates and Measure panels. Widths: 1440. Evidence: pin-mated-1440.png, misc measure text
- **F035** fixed (c1a6427e). No tool shortcuts: l, r, c, e, s and w leave the tool on Select; only F (fit) works. No command search. Widths: 1440. Evidence: interact probe shortcuts Re-checked: W1: L, C, R, E arm line, circle, rectangle, extrude; W opens command search; Space opens the View list; all remappable.
- **F036** fixed (ba0ea5a5). Any tool pressed on a sketch extrudes it: pressing the base sketch with the Hole tool made a new thin body below the plate. Widths: 1440. Evidence: pin3 first run: 'hole cut' step produced an extrude and a second body Re-checked: W2: non-sketch tools never take a sketch by pointer (registry pick kinds, driver).
- **F037** fixed (ba0ea5a5). Selected edges are 1px lines whose color change is barely visible; '4 edges selected' shows no visible edges. Widths: 1440. Evidence: fillet-face-edges-1440.png Re-checked: W2: selected edges 3.5px and hovered 5px screen-space lines.

## Viewport and display

- **F038** fixed (609bba4a). View controls are only Fit, Top and 3D (isometric): no Front, Right, Normal To or view cube, so a student drawing on XZ or YZ never sees it face on. Widths: all. Evidence: viewButtons probe Re-checked: W1: Front, Top, Right, Iso, Normal To (flips on a second press) and Fit; Normal To says what it needs when nothing is selected.
- **F039** fixed (609bba4a). The axes are a THREE.AxesHelper at the world origin inside the model, not a corner triad; they poke out of parts at the origin. Widths: all. Evidence: solid-empty-1440.png, pin-mated-1440.png Re-checked: W1: corner triad, 0px overlap with every chrome box at 1440, 960 and 375.
- **F040** open. Nothing refits after an extrude, so a 2 in upright runs off the top of the screen until Fit is pressed. Widths: 1440. Evidence: bracket-attempt1-two-bodies-1440.png
- **F041** fixed (2d8be3ac). Consumed sketches stay drawn and are left behind as ghosts when their body moves (dark rectangle under a moved plate, half disk where the pin used to be). Widths: 1440. Evidence: pin-moved-1440.png Re-checked: W2: no consumed-sketch ghost after Move at every width.
- **F042** open. Default Section (XY at 0) on a part built on XY cuts nothing and z-fights into speckle; caps are never drawn. Widths: 1440. Evidence: section-1440.png
- **F043** open. Right-drag does nothing (0 canvas pixels changed) and orbit is middle button only; a trackpad or two-button mouse user cannot orbit. Widths: 1440. Evidence: interact probe rightDragPixelsChanged=0
- **F044** open. Panels cover the model with no fit-around: at 960 a hole sits under the Dimensions panel; at 375 panels fill the viewport. Widths: 960, 375. Evidence: bracket-attempt2-final-960.png, bracket-attempt2-final-375.png
- **F045** open. Flat faces seen from below show triangulation seams. Widths: 1440. Evidence: pin-orbit-under-1440.png

## Assembly

- **F046** open. Dragging a mated part auto-adds a redundant mate that errors ('Mate 2 adds nothing: Mate 1 already hold Body 2 this way', also a grammar slip). Widths: 1440. Evidence: pin-moved-1440.png
- **F047** open. 'Add concentric mate' is offered for a flat face plus a cylinder and adds a mate that errors instead of refusing up front. Widths: 1440. Evidence: pin run 1 mate text
- **F048** open. Parts are just bodies: the pin's sketch stays where the pin was drawn after the mate moves it. Widths: 1440. Evidence: pin-mated-1440.png

## Simulation and analysis

- **F049** open. No CG, moment of inertia, interference or spinner-energy readout anywhere; the disk shows only size, volume and (with a material) mass. Widths: 1440. Evidence: disk bodyProps text; material-aluminum-1440.png

## Materials and appearance

- **F050** open. Mass is 'Unknown' until a material is chosen, then '132.74 g · Estimate' with density and a MatWeb link; the material list is a long select plus a 10-row color list in the Objects panel. Widths: 1440. Evidence: material-aluminum-1440.png

## Import and export

- **F051** open. Export offers 3MF, STL, DXF profile and an IdeaCAD backup; import only reads the backup; no STEP. Widths: 1440. Evidence: misc probe exportMenu

## Learning and onboarding

- **F052** open. Tool tooltips appear instantly (1ms) and cover the viewport; there is no help or tutorial control (0 buttons matching help/tutorial). Widths: 1440. Evidence: misc probe tooltipShownMs=1, helpOrSettings=[] Partly fixed in 8051d96a: tool tooltips wait for the delay preference (hidden at 120 ms, shown at 620 ms).
- **F053** open. Every panel opens with instruction prose (Section, Reference, Mates, Fillet, Hole, Measure), against the 'no prose instructions' principle. Widths: all. Evidence: solid-allpanels-1440.png
- **F054** fixed (609bba4a). An empty document shows no planes and no cue about where to start. Widths: all. Evidence: solid-empty-1440.png Re-checked: W1: spec ideacad-solid-state-empty, 1 cue line, 2 start buttons, 0 errors.

## Customization

- **F055** fixed (c1a6427e). No preferences, settings, shortcut or layout control in the workspace; the datum-plane toggle is in memory only. Widths: all. Evidence: misc probe helpOrSettings=[]; reference-layer.ts Re-checked: W1: preferences panel for planes, triad, quick tools, shortcuts, snaps, hint delay and units, checked at three widths.

## Branding and chrome

- **F056** fixed (609bba4a). At half width the view toolbar sits under the right toolbar: .view-tools and .right-tools overlap 59.6x46px, and the '3D' button is unreachable (elementFromPoint at its center returns 'Objects'; clicking 3D opens the Objects panel). Widths: 960. Evidence: solid-empty-960.png, tree-open-960.png, tree-960 probe threeDClickable.hit='Objects 1' Re-checked: W1: 0px overlap between the view row and the panel toggles at 1440, 960 and 375; folds into a Views menu when short.
- **F057** fixed (4c2309d3 (merged in 76dc58c7)). Front door buttons have text 1.0px from their visible border on left and right: '+ New model', 'All models', 'Archived', and 'Manage' on every card, at all three widths. Widths: 1440, 960, 375. Evidence: launch-1440.png; measured text-range rect vs border box Re-checked: Branding agent: text-to-border sweep over every bordered button on /dev/ideacad-launch at 1440, 960 and 375; every word at least 10px from its border after a 2px 10px padding floor.
- **F058** fixed (013c3405). 'Tree' header button text sits 1px below its top border and 22 to 25px above its bottom (not vertically centered). Widths: 960, 375. Evidence: solid-empty-960.png Re-checked: W1: text-to-border sweep, 0 bordered workspace controls under 6px left/right or 2px top/bottom; smallest gap 10.5px.
- **F059** fixed (4c2309d3 (merged in 76dc58c7)). 'Edit advisory limits' (Add-ons panel) text starts 1px from its left border. Widths: 1440, 960, 375. Evidence: solid-allpanels-1440.png Re-checked: Branding agent: 'Edit advisory limits' 0px to 12px on the left at 1440, 960 and 375.
- **F060** fixed (013c3405). The global Voice control floats over the workspace footer, covering '1 body' (35.6x8px) and '2 features' (31.1x8px); at 375 it also covers the bottom tool strip by 89.7x22px. Widths: 1440, 960, 375. Evidence: final-measure: footerCoveredBy, voiceOverTools Re-checked: W1: Voice docked inside the footer, 0px overlap with footer text, the 375 tool strip and panels.
- **F061** fixed (013c3405). The Report a problem control floats over the bottom of the panels column (164x44px) and covers panel controls such as 'subtract' and 'Fix in place'; clicking the viewport's bottom-right corner opens a modal feedback dialog. Widths: 1440, 960. Evidence: disk-union-refused-1440.png, pin-mated-1440.png Re-checked: W1: Report docked inside the footer, 0px overlap with footer text and panels at three widths.
- **F062** fixed (8051d96a). Expanded tool palette is a 2x17 grid holding 24 buttons: 10 empty cells, 34% empty area, 16px unused on the right, and the collapse control floats mid-column. Widths: 1440, 960. Evidence: solid-moretools-1440.png, toolsGrid measurement Re-checked: W1: expanded palette 3 columns by 8 rows, 0 empty cells, at 1440 and 960.
- **F063** fixed (8051d96a). At 375 the expanded palette becomes a one-row strip with about 703px of tools off screen and no scrollbar or overflow cue. Widths: 375. Evidence: solid-moretools-375.png Re-checked: W1: at 375 the expanded palette is 6 by 4, 0 off screen, 0 overlaps.
- **F064** open. Mates panel content is 279px wide in a 258px panel, so the whole panels column scrolls sideways 20px, clipping every panel's left padding and the Distance field's 'in' unit to a lone 'n'. Widths: 1440, 960. Evidence: final-measure withMates scrollW 280 vs clientW 260; pin-mated-1440.png
- **F065** fixed (4c2309d3 (merged in 76dc58c7)). Front door masthead is 64px tall and 90% empty at 1440; the IdeaCAD mark is a text wordmark, and there is no IDEA site logo beside it. Widths: 1440. Evidence: launch-1440.png Re-checked: Branding agent: one band; masthead empty fraction 88% to 33% at 1440, 82% to 35% at 960, 53% to 31% at 375.
- **F066** fixed (648e3152 (merged in 76dc58c7)). Home page IdeaCAD card is a static inline cube; there is no animated cube anywhere on the home page. Widths: all. Evidence: home-ideacad-card-1440.png; svgAnimated=false Re-checked: Branding agent: IdeaCadMark animates only under no-preference, 12 elements, lowest resting opacity 1, at 375, 960 and 1440.
