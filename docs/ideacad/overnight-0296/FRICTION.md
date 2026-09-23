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

- **F001** open. A new model costs '+ New model', a name form, then 'Create and open' before the empty workspace. Widths: all. Evidence: launch-newform-1440.png
- **F002** open. At 375 the folder and tag rail sits above the model list, so the first card is about 570px down. Widths: 375. Evidence: launch-375.png
- **F003** open. /ideacad signed out redirects to / with no sign-in prompt about IdeaCAD. Widths: all. Evidence: chrome-results ideacadRoute.url='/'

## Sketching

- **F004** open. Line clicks get no inference: the L profile ended with 0 constraints and 'Under defined' status words only inside the sketch editor. Widths: 1440. Evidence: bracket-attempt2-profile-1440.png
- **F005** open. Each drawn shape becomes its own sketch; several circles in one sketch require Edit sketch and the sketch panel's tools. Widths: all. Evidence: disk and bracket trees
- **F006** open. Edit sketch keeps the old zoom with the origin at screen center, draws the body over the sketch, and lets the sketch run under the Sketch panel; clicking a line to dimension it selected nothing. Widths: 1440. Evidence: interact-sketch-edit-1440.png; sketchSelection=null
- **F007** open. No size can be typed while drawing a rectangle or circle; only the readout at the pointer. Widths: 1440. Evidence: bracket-attempt1-drawing-1440.png; typedMidDraw.numeric=false

## Part features

- **F008** open. Hole tool: a plain click on the face only selects it; drilling at the press point needs a press-and-drag of a few pixels. Widths: 1440. Evidence: bracket holeLog featuresAfterClick vs featuresAfterDrag
- **F009** open. Union of a disk and two overlapping teeth refused with 'This change could not form a valid solid. Try a different size.' although nothing was sized; the failed Combine stays in the tree. Widths: 1440. Evidence: disk-union-refused-1440.png
- **F010** open. Linear and circular pattern copy whole bodies, not features, so a hole pattern means drilling each hole. Widths: all. Evidence: disk circular pattern made bodies 2 and 3

## Fillets and chamfers

- **F011** open. Dragging an edge with Fillet freezes at the first sample (R 0.056 in over a 60px drag) and shows 'That edge is no longer on the model. Select it again.' Widths: 1440. Evidence: fillet-drag-live-1440.png
- **F012** open. No hover preview on edges with the Fillet tool (0 pixels changed). Widths: 1440. Evidence: fillet probe hoverEdgePixels=0
- **F013** open. Refusals are raw kernel text: 'blend: blend cliff on face Id(2) at edge Id(9): requested radius 3, available radius 2.999999999999999' and 'blend: unsupported vertex blend at Id(25): 2 stripes meet'; failed fillets stay in the tree as ERROR. Widths: 1440. Evidence: interact-fillet-oversize-1440.png, fillet-face-edges-1440.png
- **F014** open. Filleting all four edges of a face fails when one edge already has a fillet, with no suggestion of what to do. Widths: 1440. Evidence: fillet-face-edges-1440.png

## Reference geometry

- **F015** open. No Front, Top, Right planes or Origin in the tree; datum planes are hidden by default, named XY/XZ/YZ, and not pickable. Widths: all. Evidence: solid-empty-1440.png; reference-layer.ts datumShown=false
- **F016** open. Reference panel is 2013px tall and opens with prose ('Planes, axes and points to build against...'). Widths: 1440. Evidence: solid-allpanels-1440.png

## Design tree and history

- **F017** open. Flat tree: sketches do not nest under the features that use them, no collapse (0 nested lists), no rollback bar, no timeline. Widths: all. Evidence: interact-tree-row-1440.png; treeNesting.nestedLists=0
- **F018** open. F2 does not rename a tree row (double-click does). Widths: 1440. Evidence: interact probe f2Renames=false, dblclickRenames=true
- **F019** open. Hovering a tree row highlights nothing in the viewport (0 pixels changed). Widths: 1440. Evidence: interact probe treeHoverPixels=0
- **F020** open. Every row shows '● OK', and a selected row expands into six buttons and two prose sentences. Widths: 1440. Evidence: interact-tree-row-1440.png
- **F021** open. Below 1024px the tree is a 300px slide-over that covers the tool palette and does not close when the viewport is clicked. Widths: 960, 375. Evidence: tree-open-960.png; treeStillOpenAfterViewportClick=true

## Dimensions

- **F022** open. Typing a value right after drawing drops characters: '0.25' then Enter gave a 2 in plate in 1 of 3 trials and a 25 in plate in another run; with the sketch already selected, '0.25' typed at 0ms spacing put '5' in the box. Widths: 1440. Evidence: interact typedImmediately [2, 0.25, 0.25]; typedRace delay0 boxValue '5'; pin3 first run bounds z 0..25
- **F023** open. The typed-value box cannot be dismissed: Escape and clicking empty viewport both leave it open. Widths: 1440. Evidence: interact-numeric-stuck-1440.png
- **F024** open. A rectangle has no width or height to type; Dimensions says 'Sketch 1 has no number to type. Its shape comes from what it was made on.' and shows only the measured area. Widths: all. Evidence: bracket-attempt2-profile-1440.png
- **F025** open. No dimension is drawn in the viewport; every number lives in a side panel. Widths: all. Evidence: all built screenshots
- **F026** open. Fillet panel Radius shows 0.25 after a typed 0.2 fillet was applied, so the panel disagrees with the model. Widths: 1440. Evidence: bracket-attempt1-fillet-1440.png

## Selection and interaction

- **F027** open. No preselection highlight: hovering a face or an edge changes 0 canvas pixels, against 208,120 pixels for the click-select control; the cursor never changes. Widths: 1440. Evidence: interact probe hover.facePixelsChanged=0
- **F028** open. Right-click on a face or on empty space opens nothing (0 DOM change) and does not change the selection. Widths: 1440. Evidence: interact-rightclick-face-1440.png
- **F029** open. Box drag on empty space draws no rectangle and selects nothing; it selects the page's text instead (blue highlight across header and tree). Widths: 1440. Evidence: interact-boxdrag-mid-1440.png
- **F030** open. Escape does not clear the selection (1 selection remains) and does not close the typed-value box. Widths: 1440. Evidence: interact probe escape.selectionsAfterEscape=1; interact-numeric-stuck-1440.png
- **F031** open. Pressing within about 7px of an edge picks the edge over the face, so drawing that starts at a face edge silently falls back to the default datum plane. Widths: 1440. Evidence: bracket-attempt1-two-bodies-1440.png; tree says 'XY plane found'
- **F032** open. Consumed sketches win picks: the hole's own sketch covers its mouth from above and the base sketch covers the bottom face, so a circle-cut hole wall cannot be selected from any angle (8 of 8 picks failed). Widths: 1440. Evidence: pin-orbit-under-1440.png, pin2 holeAttempts
- **F033** open. Selections persist across tool changes: after mating, the Move tool moved both bodies. Widths: 1440. Evidence: pin-moved-1440.png
- **F034** open. Pick descriptions show internal ids ('Body 1, f8daa0329cd1e.wall (face)') in the Mates and Measure panels. Widths: 1440. Evidence: pin-mated-1440.png, misc measure text
- **F035** open. No tool shortcuts: l, r, c, e, s and w leave the tool on Select; only F (fit) works. No command search. Widths: 1440. Evidence: interact probe shortcuts
- **F036** open. Any tool pressed on a sketch extrudes it: pressing the base sketch with the Hole tool made a new thin body below the plate. Widths: 1440. Evidence: pin3 first run: 'hole cut' step produced an extrude and a second body
- **F037** open. Selected edges are 1px lines whose color change is barely visible; '4 edges selected' shows no visible edges. Widths: 1440. Evidence: fillet-face-edges-1440.png

## Viewport and display

- **F038** open. View controls are only Fit, Top and 3D (isometric): no Front, Right, Normal To or view cube, so a student drawing on XZ or YZ never sees it face on. Widths: all. Evidence: viewButtons probe
- **F039** open. The axes are a THREE.AxesHelper at the world origin inside the model, not a corner triad; they poke out of parts at the origin. Widths: all. Evidence: solid-empty-1440.png, pin-mated-1440.png
- **F040** open. Nothing refits after an extrude, so a 2 in upright runs off the top of the screen until Fit is pressed. Widths: 1440. Evidence: bracket-attempt1-two-bodies-1440.png
- **F041** open. Consumed sketches stay drawn and are left behind as ghosts when their body moves (dark rectangle under a moved plate, half disk where the pin used to be). Widths: 1440. Evidence: pin-moved-1440.png
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

- **F052** open. Tool tooltips appear instantly (1ms) and cover the viewport; there is no help or tutorial control (0 buttons matching help/tutorial). Widths: 1440. Evidence: misc probe tooltipShownMs=1, helpOrSettings=[]
- **F053** open. Every panel opens with instruction prose (Section, Reference, Mates, Fillet, Hole, Measure), against the 'no prose instructions' principle. Widths: all. Evidence: solid-allpanels-1440.png
- **F054** open. An empty document shows no planes and no cue about where to start. Widths: all. Evidence: solid-empty-1440.png

## Customization

- **F055** open. No preferences, settings, shortcut or layout control in the workspace; the datum-plane toggle is in memory only. Widths: all. Evidence: misc probe helpOrSettings=[]; reference-layer.ts

## Branding and chrome

- **F056** open. At half width the view toolbar sits under the right toolbar: .view-tools and .right-tools overlap 59.6x46px, and the '3D' button is unreachable (elementFromPoint at its center returns 'Objects'; clicking 3D opens the Objects panel). Widths: 960. Evidence: solid-empty-960.png, tree-open-960.png, tree-960 probe threeDClickable.hit='Objects 1'
- **F057** open. Front door buttons have text 1.0px from their visible border on left and right: '+ New model', 'All models', 'Archived', and 'Manage' on every card, at all three widths. Widths: 1440, 960, 375. Evidence: launch-1440.png; measured text-range rect vs border box
- **F058** open. 'Tree' header button text sits 1px below its top border and 22 to 25px above its bottom (not vertically centered). Widths: 960, 375. Evidence: solid-empty-960.png
- **F059** open. 'Edit advisory limits' (Add-ons panel) text starts 1px from its left border. Widths: 1440, 960, 375. Evidence: solid-allpanels-1440.png
- **F060** open. The global Voice control floats over the workspace footer, covering '1 body' (35.6x8px) and '2 features' (31.1x8px); at 375 it also covers the bottom tool strip by 89.7x22px. Widths: 1440, 960, 375. Evidence: final-measure: footerCoveredBy, voiceOverTools
- **F061** open. The Report a problem control floats over the bottom of the panels column (164x44px) and covers panel controls such as 'subtract' and 'Fix in place'; clicking the viewport's bottom-right corner opens a modal feedback dialog. Widths: 1440, 960. Evidence: disk-union-refused-1440.png, pin-mated-1440.png
- **F062** open. Expanded tool palette is a 2x17 grid holding 24 buttons: 10 empty cells, 34% empty area, 16px unused on the right, and the collapse control floats mid-column. Widths: 1440, 960. Evidence: solid-moretools-1440.png, toolsGrid measurement
- **F063** open. At 375 the expanded palette becomes a one-row strip with about 703px of tools off screen and no scrollbar or overflow cue. Widths: 375. Evidence: solid-moretools-375.png
- **F064** open. Mates panel content is 279px wide in a 258px panel, so the whole panels column scrolls sideways 20px, clipping every panel's left padding and the Distance field's 'in' unit to a lone 'n'. Widths: 1440, 960. Evidence: final-measure withMates scrollW 280 vs clientW 260; pin-mated-1440.png
- **F065** open. Front door masthead is 64px tall and 90% empty at 1440; the IdeaCAD mark is a text wordmark, and there is no IDEA site logo beside it. Widths: 1440. Evidence: launch-1440.png
- **F066** open. Home page IdeaCAD card is a static inline cube; there is no animated cube anywhere on the home page. Widths: all. Evidence: home-ideacad-card-1440.png; svgAnimated=false
