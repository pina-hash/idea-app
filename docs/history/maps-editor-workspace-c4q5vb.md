---
title: "The maps editor becomes a workspace: tree, sheet and inspector on one screen, and a typed inch redraws the plan as it is typed (`claude/maps-editor-workspace-c4q5vb`, prompt 0093, no migration)"
date: 2026-09-06
branches: [claude/maps-editor-workspace-c4q5vb]
subsystems: ["IDEA Maps", "Testing", "Browser verification"]
migrations: []
---

Application code only. Migration 0191 was claimed and not used: Phase A found
nothing the schema could not express -- every gap was arrangement, not data --
so the number is released. Started from `origin/main` at `e06ed58` in
`/home/user/idea-app`; the container's git had a committer identity already
set (`Claude <noreply@anthropic.com>`), so no "Please tell me who you are"
arose.

## What Mr. Pina reported, and what the tree said

The ledger entry for this prompt says `PlanCanvas.svelte` is mounted "below
Placement, below Publish subtree, below Add inside this building, below Items
in here, below Stock in here and above Delete", so that the drawing sat at the
bottom of a scroll of forms. **That is not what the tree says.** Line 636 of
`NodeDetail.svelte` was INSIDE the geometry section, directly under the
Position X / Y / Rotation row and above the elevation editor, the save
controls, the publish panel, the subtree publish, add-child, contents and
delete. Measured on the warm dev server (second load), driving the real
`/dev/maps-edit` harness the way he did:

| viewport | width field top to frame top | frame bottom | extra scroll with the field at the top |
|---|---|---|---|
| 1440x900 | 245px | 923px | 23px |
| 1920x1080 | 245px | 695px | 0px |
| 2560x1440 | 245px | 695px | 0px |

So the scroll distance was 245px and the cause was not scroll. Four things
were:

1. **A new BUILDING drew nothing at all.** Add building, type Rectangle,
   width 600, depth 400: the canvas section was 59px tall and held one
   sentence, "A top-level container has no frame to be placed in." The canvas
   only ever drew a shape inside a PARENT'S frame; a root has none.
2. **A new ROOM drew nothing until BOTH X and Y were typed.** 240 x 180 in
   the building: "Type a position X and Y above to place this shape."
3. **The geometry hint above the fields still said "drawing and dragging are
   a later bundle"**, 245px above a working canvas.
4. **The page was a 90rem column.** At 1920 the content was 1440px wide with
   480px dead; at 2560, 1120px dead; the detail pane was 904px at every width.

Also measured on the way: "Add building" took effect on attempt 2-3 (SSR
markup is on screen ~300ms before hydration attaches the handler), and the
`?state=place` frame measured 600px wide -- the component's nominal
pre-layout fallback -- when the snapshot landed before hydration, and 904px
after. Paint is not interactivity.

## How much of section 7 already existed

Most of it. `PlanCanvas.svelte` (519 lines) already had drag with pointer
capture, snapping to the parent's walls and every placed sibling with the
snap named in words, a nudge pad with two steps, arrow-key nudging, a
snap-to-nearest control and a readout. Typed inch dimensions, parent
assignment through the Inside picker, the elevation editor, shelf entry,
draft-per-object, subtree publish and P2 grants (0172) were all live. What
was ABSENT: a root's own frame, children drawn inside the selected shape,
dimension labels on the drawing, selection from the drawing, undo, zoom, and
a workspace to put it in. So this bundle WIRED far more than it built, in
the order the prompt gave: live redraw (already there, made visible), then
selection, then drag (already there), then snap (already there), plus undo.

### Section 6 and 7 checklist (present / partial / absent, after this bundle)

Section 6, the viewer (READ-ONLY for this bundle; verified by reading the
tree, not changed): `/maps` anonymous published-only -- present; descending
navigation -- present; persistent search bar -- present; staged route with
breadcrumb -- present; mobile and desktop verified -- present (six
`maps-viewer*` specs); tokens from `src/lib/design-system/` -- present; maps
accent identity from a Claude Design pass -- ABSENT (`--maps-accent` is still
`var(--gear)`, the deliberate placeholder).

Section 7, the editor: typed inch dimensions -- present; drag placement --
present, now on screen beside the fields; snapping -- present; parent
assignment -- present (the Inside picker; the sheet never reparents on
overlap, and says so); accuracy from the typed numbers -- present (a drag
writes X and Y through `onplace` and nothing else; undo hands the previous
position back through the same call); elevation editor per unit -- present;
item entry at the shelf -- present; draft per object, publish per
selection/subtree, admin save-and-publish -- present; P2 grants draft-only,
publish stays admin -- present (0172); revision history surface -- ABSENT
(spec P2, untouched here). Added by this bundle beyond the list: a root's
own frame, children inside the edited shape, dimension labels, selection
from the sheet, undo, zoom, a cursor readout, an overview, and the way in.

## What shipped

**The workspace** (`MapsEditor.svelte`): `ClassSplit` with `scroll="fill"`
and `narrow="stack-nav-first"`, the detail ALWAYS present -- with nothing
selected it holds `MapsOverview`, which draws every root with what is inside
it. Three measures on `.mp-root`: `--mp-tree-w: clamp(16rem, 16vw, 20rem)`,
`--mp-inspector-w: clamp(24rem, 24vw, 30rem)`, and `--measure-split` re-
pointed at `--measure-console` so the split takes the window. The nav pane
gained a third tab, Editors, rendered only when the route hands in the grant
console as a snippet (absence is the mechanism; `/dev/maps-grants` still
mounts its own console below and stays green).

**The shell** (`MapsEditorShell.svelte`): `.cr-app` + `.cr-app-body`, a one-
row bar (eyebrow, title, Public map, Shelf entry, Dashboard for admins, Home,
ProfileMenu) and the version badge; no hero. `/maps/edit` and the new
`/dev/maps-editor` harness both mount it. The Dashboard link hides under
640px: four links wrapped the bar to 170px at 375, three fit one row (118px).

**Stage and inspector** (`NodeDetail.svelte`): one component, two regions,
a container query at 46rem (three 8.5rem inch fields plus a 20rem sheet).
Each region owns its scroll where the shell bounds the height. The stage is
the plan sheet (plus the elevation editor for a unit); for a compartment it
is the new `ElevationSketch.svelte`, read-only, drawing the unit's stack
with this compartment marked at the height BEING TYPED -- read-only because
the unit's own `UnitElevation` already edits those rows and two editable
copies of one number is the pair that stops agreeing.

**The sheet** (`PlanCanvas.svelte`, every existing testid kept): a root's
own live outline as the frame with its children inside; the edited shape's
own children drawn inside it at its live position, rotating with it; one
extra level faintly; a GHOST at the frame's centre for a shape with a size
and no position, placed by a drag or by Place here (`mapsGhostPosition`);
an SVG overlay with a foot grid (`mapsGridStepIn`), the frame's size, the
shape's width and depth and its X/Y offsets from the frame origin as
dimension lines in the metadata hue; siblings and children as buttons that
SELECT (`onselect`); Fit / zoom out / zoom in / Ctrl+wheel; Undo as a
control and as Ctrl+Z on the sheet outside a text field, one history entry
per drag, nudge or snap; a cursor readout in inches; `visibleIds` so a
grantee's sheet and tree agree. `mapsSnapTargets` now reads the parent's
EFFECTIVE outline (pending edit first), as the siblings already did.

**The way in**: `MapsEditEntry.svelte` on `/maps`, keyed on
`mapsCanEnterEditor` (`entry.ts`): an admin's control is in the first render
from the root layout's `isAdmin`; a signed-in non-admin's grants are probed
once after hydration through `maps_my_editor_grants`; a signed-out visitor
asks nothing and sees nothing. The route's own `+layout.server.ts` gate is
untouched. `/maps/+page.server.ts` is outside this bundle's ownership, which
is why the grantee half resolves client-side; moving it into the load is the
one-line follow-up.

**Tree rows** stack kind above name: at 16rem the old one-line row read
"Machin..." and "Wor...".

## Measured

Layout, the real shell over the fixture, room selected (Machine Shop):

| viewport | bar | tree | stage | inspector | sheet pane | frame drawn | doc scroll |
|---|---|---|---|---|---|---|---|
| 375x800 | 375x118 | 375 (stacked) | 375 | 375 (below) | 375x320 | 307x205 | 3557px doc, one column |
| 1440x900 | 61px | 256px | 696px | 384px | 696x431 | 544x363 | none (900/900) |
| 1920x1080 | 61px | 307px | 1048px | 461px | 1048x470 | 602x402 (fit by height) | none |
| 2560x1440 | 61px | 320px | 1656px | 480px | 1656x1052 | 1475x984 | none |

`tools/browser-verify` over the five new `maps-editor*` specs: **10 runs, 232
measurements, 0 outside threshold at 375 and 1440**, and 0 outside at 1920
and 2560 (the overview's first 1920 run 500'd on a null parent in a hint
branch this bundle had just introduced; fixed and re-measured). The nine
existing `maps-edit*` and `maps-grants*` specs, which this bundle cannot
edit, over the new `MapsEditor`: 516 measurements in the combined run, the
only 2 outside being the two root-probe drafts below, since corrected.

Two probe drafts measured the wrong thing before they measured the right
one: the root frame's aspect ratio read 1.495 off the bounding box (the 1px
border) and 1.502 off `clientWidth` (integer rounding); it reads 1.500 ->
1.875 off the box less its computed border. And a child-name contrast row on
the room state matched nothing because the units inside a 400in room draw
9px and 36px wide, under the 44px at which a shape carries a name at all.

Contrast (every text role asserted, worst measured in the fallback stack):
tree row name and kind, tabs, overview heading and hint, root card name and
count, frame size, drawn names and sizes over their own fills, the unplaced
sentence, bar eyebrow/title/links, sheet hints, snap readout, zoom, tool
labels, inspector labels and crumb, sketch hint/slot name/slot size/meta --
all >= 4.5:1. Tap targets: tree rows, tabs, add controls, root-open, bar
links, Fit/zoom/Undo, nudge and snap, step radios, every inch input, save
controls all >= 44px; the drawn shapes are scale drawings and deliberately
not measured against 44 (stated in each spec); the sketch's other slots
clear the 24px floor.

`svelte-check`: 0 errors, 37 warnings (31 `state_referenced_locally`, 5
`css_unused_selector`, 1 `perf_avoid_nested_class`), before and after.

## The three positive controls (B6)

All restored from `cp` copies, md5-identical, re-run green.

1. **A typed dimension changes the drawing.** Handing the sheet the SEEDED
   outline instead of the typed one (fields still update): 3 of 10 reddened
   in `tests/dom/maps-editor-stage-mount.test.ts` (shape width, root aspect,
   ghost) and 1 of 8 in the pinned `maps-plan-canvas-mount` -- every one on
   drawn geometry, none on a field value. NodeDetail md5
   `920e728eeda966e14ca6f0defacd1533` both sides.
2. **A drag does not rewrite a typed dimension.** Making `acceptPlacement`
   also write the dragged X into the width field: 2 of 10 and 2 of 8
   reddened. Same md5 both sides.
3. **The entry control and the route gate are separate clauses.** Opening
   `mapsCanEnterEditor` (yes for everybody): 4 of 8 reddened in
   `tests/maps-editor-entry.test.ts`, all the render/predicate ones, while
   the route-only tests stayed green. Opening the layout gate instead: 1 of
   8 reddened -- the route 404 -- and every render test stayed green. The
   grant test ties them: the same non-editor, refused and shown nothing, is
   granted Machine Shop through the real `maps_editor_grant`, and then the
   probed scope says yes and the layout admits them. md5
   `6a72fbcdc36ed9006dd51f946f55348f` (entry.ts) and
   `86fc7bf61dc38e00654a8e50ed101a34` (layout) both sides.

## Not verified

- The live Supabase project: nothing here touched production, applied a
  migration or signed in. The grant flip ran against the embedded fixture.
- A signed-in browser session on the real `/maps/edit` and `/maps` routes:
  both need a Bosco Tech account no automated session holds. The harness
  measured the identical shell over the fixture.
- The grantee's entry control appearing after hydration on the public page:
  the predicate it feeds is pinned; the `onMount` probe is not driven.
- Web fonts: the harness measures text in the fallback stack;
  `prefers-reduced-motion` is not exercised (nothing here animates).
- Deep nesting beyond one faint level inside a drawn child; polygons rotate
  correctly as layers but were checked only through the fixture's rectangles
  and its one 90-degree chest.

## Deferred, and why

- Moving the grantee probe into `/maps/+page.server.ts` (outside ownership).
- A fixture with two roots, for the overview's multi-card grid (the fixture
  has one building; the grid rule is `auto-fit` at 30rem).
- Rubber-band multi-select, alignment guides beyond snap, and drawing a
  polygon by clicking corners: real CAD conveniences, none in section 7.
- A `stage` snippet on `ClassSplit` (outside ownership); this bundle got the
  third region by making `NodeDetail` the stage-plus-inspector pair, which
  also kept the pinned mount test finding both halves inside it.
- The maps accent identity (spec section 10, a Claude Design pass).

No `classroom-updates.json` entry: the editor is admin-and-grantee only and
a student sees no difference on any classroom surface.
