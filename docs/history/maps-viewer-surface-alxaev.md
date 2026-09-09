---
title: "IDEA Maps: the viewer takes the whole window, and the black 'The map' bar is gone (`claude/maps-viewer-surface-alxaev`, prompt 0112, no migration)"
date: 2026-09-09
branches: [claude/maps-viewer-surface-alxaev]
migrations: []
subsystems: ["IDEA Maps", "Components and UI", "Visual theme", "Testing"]
---

Two things from Mr. Pina, in his words. "i dont know if the black 'the map'
banner at the top of the page should be there. It looks out of place." And:
"idea maps must make better use of the full screen. When i open 'Google Maps'
the full screen is used. The same should be true for IDEA maps. Also
incorporate incorporatable features and UI improvements from google maps into
idea maps. I think if someone has used google maps they should instantly be
able to understand idea maps." He runs 2844x1450. This bundle is the answer to
both, and the second is an outcome rather than a specification, so most of
this entry is about which map conventions transfer to a building-and-shelf map
and which do not. No migration, and none was needed: nothing here reads a row
the public viewer did not already read.

## The measurement that was the brief

`MapsViewer` was a reading column, `max-width: 78rem`, centred. Measured on
the harness's room state BEFORE this bundle, against the window:

| window | viewer width | share of the window | drawing |
| --- | --- | --- | --- |
| 375x667 | 343px | 91% | 311x237 |
| 1440x900 | 1248px | 87% | 685x521 |
| 2844x1450 | 1248px | **44%** | 685x521 |

At Mr. Pina's size the map was a postcard in the middle of the screen, and
the crumb trail was a full-width `--surface-0` bar above the heading -- at
the top of the map it held exactly one word, "The map", which is a title's
job, and the real title sat under it. AFTER, same states, same instrument:

| window | viewer width | share | panel | map pane | drawing |
| --- | --- | --- | --- | --- | --- |
| 375x667 | 375px | 100% | (one column) | 351px wide | 351x267 |
| 1440x900 | 1440px | 100% | 416px | 1024x867 | 1024x867 |
| 2844x1450 | 2844px | 100% | 416px | **2428x1417** | 2428x1417 |

## The layout: a panel and a map pane, which is every map anybody has used

Above the application breakpoint (1024px, the one breakpoint `split.css`
already owns) the page is an application frame -- `.cr-app` + `.cr-app-body`,
the repo's own shape for a room that IS the viewport -- and `MapsViewer` fills
it as a two-column grid: a PANEL at `--measure-nav` (26rem, the shell's
navigation token, which is also within a few pixels of the width every web
map uses) and a MAP PANE that is everything else. The panel scrolls on its
own; the map pane never scrolls; the document does not scroll at all
(measured: `scrollHeight` 900 in a 900 window at 1440, 1450 in 1450 at 2844).
The portal chrome -- logo, the way into the editor, Home, the account menu --
is handed to the viewer by the route as a SNIPPET and rendered at the top of
the panel, the way a map puts its own mark inside the search panel rather
than on a bar above the whole map. The harness passes no chrome and renders
nothing there, which the render test asserts both ways.

**THE TRICK BELOW THE BREAKPOINT IS `display: contents`, AND IT IS THE WHOLE
REASON THERE IS ONE DOM.** A phone wants the search, then the results, then
the drawing, then the level; a desktop wants the drawing in a pane of its own
beside all of that in a column. One document cannot hold both orders unless
the panel can dissolve, so below 1024px the panel and its scroller are
`display: contents` and `order` puts the map block between the results and
the level. The alternative was a second copy of the breadcrumb or the map for
the other width, which is the pair that stops agreeing. `CLAUDE.md`'s
"below it the document scrolls as it always did" is kept exactly: the phone
layout is an ordinary scrolling page with the search box sticky at its top.

**`main` IN `app.css` IS A READING COLUMN, AND THAT WAS THE FIRST DEFECT THE
INSTRUMENT FOUND.** The route wraps the viewer in `<main class="cr-app">`,
and the global `main { max-width: 880px; margin: 0 auto }` capped the whole
application at 880px centred -- measured as a 416px map pane in a 2844px
window on the first shot, before a single number was quoted. The route's and
the harness's `main` both release it. Nothing in `app.css` was edited.

## The breadcrumb: not a bar, and not at the top

`MapsBreadcrumb` renders NOTHING when the chain is empty and no card is open.
A breadcrumb with one crumb is a heading, and the heading was already there.
From one level down it is a row of chips directly above the level's heading
-- where a breadcrumb conventionally lives -- with no background, no
`position: sticky` and no full-width bar. The root crumb reads "Map" and the
separator is a chevron. Its `aria-label="Where you are"`, its `<ol>`, its
real links and its `aria-current="page"` on the level you are standing on
are unchanged, and `tests/maps-viewer-render.test.ts` asserts both directions
on one instrument: zero `maps-viewer-crumbs` at the top, one at the building.

Two measured consequences. **The chips are at least 44px wide**, because the
reach grows in height only and "Map" is 36px of text: the harness measured
the walked reach at 37x45 on the first run, under the floor on width, and
the old "The map" had cleared it by being seven letters long. **And in the
panel the trail WRAPS, at a row pitch of exactly 44px** (28px chip plus 16px
row gap), so a height-only reach centred on each chip ends where the next
row's begins -- the collision the one-line rule avoids on a phone, avoided by
arithmetic on a desktop where a 26rem panel cannot hold five crumbs on a
line. Measured after: walked reach 45x45 at 375 and 45x44.3 at 1440 across
every crumb on every state, 0 under 44.

## What transferred from Google Maps, and what did not

**Taken, because a building-and-shelf map has the same need:**

- **The map fills the window and the panel is the reading column.** The
  brief, and the table above.
- **The search box is pinned at the top of the panel.** It is `position:
  sticky; top: 0` inside whatever scrolls -- the panel above the breakpoint,
  the document below -- so one rule does both widths. The hint moved out of
  the form so the pinned block is one label and one row tall.
- **Selecting a place never blanks the map.** `mapsDrawing` in `viewer.ts`
  is the rule: the map pane shows the deepest drawable frame at or above the
  level, with the level marked "you are here" when the frame is its parent's.
  A drawer shows its chest's front with that drawer picked out; a unit with no
  compartments shows its room's plan; the item card sits beside the drawing
  of the place it is in. Before this a compartment level drew nothing and the
  card sat over an empty pane. "Here" is a second state with a second word,
  drawn heavier in the accent, and never the staged route's gold: the
  compartment spec composites the two borders and asserts the "here" one is
  green-dominant.
- **The top of the map opens on something.** A root building carries an
  outline and no site position, so the directory's own plan is empty. One
  root is drawn as ITSELF; several unplaced roots are laid side by side at
  their true sizes by `mapsSitePlanView`, with a caption saying their
  positions are not recorded -- honest about size, honest about placement.
- **Zoom and pan, in the application layout only.** Wheel zooms ABOUT THE
  POINTER (the thing under the pointer stays under it; measured 1.00 to 2.46
  on one wheel with the scale bar going 5 ft to 2 ft and the page not
  scrolling), a drag pans with pointer capture, a pinch zooms, `+` `-` `0`
  and the arrows work from the keyboard on the focusable canvas, and three
  WORDED controls -- "+ In", "- Out", "Fit" -- sit in the pane's top right.
  Top right rather than every map's bottom right because the shell's fixed
  "Report a problem" control sat on top of "Fit" at both widths measured. The
  viewBox arithmetic is pure (`mapsZoomedBox`, `mapsZoomAbout`) and clamped
  so the frame cannot be dragged out of view. **Below the breakpoint no
  gesture is taken and no control is offered**: the map is a block in a
  scrolling document there, so a wheel over it must scroll the page and a
  zoomed drawing with no pan is worse than a fitted one. Measured at 375:
  wheel leaves zoom at 1.00 and `touch-action` at `auto`.
- **Labels are a constant size on screen, and the ones that do not fit are
  hidden until pointed at.** A label in inches was 6px on a phone and would
  be 60px on a 2844px monitor; it is now `13px / rendered scale`, re-derived
  from a `ResizeObserver`-backed measurement on every zoom (harness: the same
  label measures within 1.5px at 2.25x and 3.4x). A label wider than its
  shape is withheld -- the `<title>` and the list row still name it -- and
  returns on hover, on the mark and on "here"; a forced label on a too-small
  shape sits beside it on whichever side has room, like a pin's label.
  Server-rendered, the fallback is a sixtieth of the frame, the old rule.
- **A scale bar** reads off the rendered scale: the longest round length that
  fits 160px, in feet once whole ("10 ft" at 1440 on the building, "2 ft" on
  the room at 2844). It exists only after measurement, which is why the room
  spec's geometry line now waits for it before reading anything.
- **Pointing at a row lights its shape, and the other way round.** One
  `hot` state in the viewer, set by `pointerenter`/`focus` on rows, shapes
  and slots; measured as class changes in both directions.
- **The place card leads with its photos**, then the facts, then the
  vocabulary; and it carries **"Show me the way"** (a staged route to this
  thing from the top, offered only when the card was reached by browsing --
  reached by the route, the trail above IS the way) and **"Copy link"**
  (the position is the URL; the clipboard is asked once and either answer is
  said in words, with the address shown selectable where it refuses).

**Rejected, with the reason:**

- **A blue dot, "my location", directions from where you stand.** Spec
  section 3 excludes positioning outright, and it is right: phone GPS is
  metres, indoors worse, and cannot place a person at a drawer.
- **Layers, satellite, traffic, street view.** There is nothing to layer.
- **A draggable bottom sheet on the phone.** `CLAUDE.md` is explicit that
  below the breakpoint the document scrolls as it always did, and a sheet is
  a JavaScript scroll model with its own accessibility problems standing in
  for a page that already scrolls.
- **Literal `+`/`-` glyph buttons with no words.** "Every control carries a
  visible word"; the controls have both.
- **Pan and pinch on the phone.** See above: a page that scrolls cannot also
  be a map that pans under the same finger, and the list is the phone's
  control anyway.
- **A fullscreen button.** The layout already takes the window.
- **A per-step directions list replacing the trail dots.** The stages ARE the
  containment chain, so the breadcrumb is already that list with words on it
  (prompt 0020's argument), and the dots stay aria-hidden progress marks.
- **Zooming in as a way of descending into a room.** The tempting mapping of
  Google's zoom levels onto containment levels was a hijack of the wheel: a
  click on a shape already descends, and the wheel now does what it does on
  every map.

## Departures from the spec, stated

`IDEA_MAPS_SPEC.md` 1.1 section 6 says "the containment chain stays visible
as a breadcrumb throughout" the staged route. At the route's first stage the
chain is empty (the directory, with the building marked), so there is no
breadcrumb there any more; what is on screen is the heading "IDEA Maps" and
the trail's own sentence, "Step 1 of 5: IDEA Building, on the map". That is
the letter of the sentence given up for its intent, and it is the same
decision as the bar: a one-word breadcrumb was never wayfinding. Everything
else in section 6 -- descending navigation, a persistent search bar at every
level, staged route with the highlight at each level, both widths first-class,
design-system tokens, `app.css` untouched -- is kept. The accent identity
decided by 0020 is unchanged.

## Verification

- **`svelte-check`: 0 errors, 37 warnings**, breakdown 31 / 5 / 1,
  re-derived after `svelte-kit sync` with the two `PUBLIC_SUPABASE_*`
  placeholders exported. Three new warnings appeared mid-bundle in
  `MapsPlan.svelte` (a `figcaption` not last, handlers on a non-interactive
  wrapper, a non-reactive `drag`) and were fixed rather than accepted: the
  controls moved above the caption, the pan surface carries an ignore with
  its reason, and the template reads a `dragging` state.
- **Full suite: 330 files, 6550 tests, all green** on the
  merged tree (the prompt's baseline was 327 / 6525).
- **`npm run verify:browser -- --route maps-viewer`: 16 route/width runs,
  300 measurements, 0 outside threshold once the item spec stopped expecting "Copy link" on a control it had already pressed**, at 375 and 1440, over
  eight specs: the directory, the room, the unit, the compartment (new), the
  thin stack, the browsed item card (new), the staged route mid-walk and
  arrived. Every tap target on every state clears 44px at both widths; the
  smallest is 44.0 (the search box, the card controls) and the rows are 44.9.
  Two harness limits apply: external requests are blocked so text is measured
  in the fallback stack, and `prefers-reduced-motion` is `no-preference`.
- **The full harness run, `npm run verify:readme`: README_RUNS runs,
  README_MEASUREMENTS measurements, README_OUTSIDE outside threshold, README_SECONDS s** on
  `README_SHA`. README_OUTSIDE_NOTE
- **Gestures, driven with a real mouse through playwright-core rather than
  the harness's synthetic events**: at 1440, wheel -600 over the room takes
  zoom 1.00 to 2.46 and the scale bar from 5 ft to 2 ft with `scrollY` 0; a
  120x80px drag starting on a shape pans without navigating; `0` fits, `+`
  gives 1.50, ArrowRight moves the viewBox; at 375 every one of those leaves
  the drawing at 1.00 and `touch-action: auto`.
- **A plain click on a shape starts a SvelteKit navigation to `/maps?at=...`
  on this tree AND on `origin/main` in a worktree** -- the router's
  `preventDefault` and the `/maps/__data.json` fetch are identical on both --
  and neither completes in this container, because the route's server load
  waits on the placeholder Supabase host. That is the environment, not a
  regression, and it was established by running the old tree beside the new
  one rather than assumed.
- **`tests/maps-viewer-drawing.test.ts`** pins the drawing rule (room, unit,
  compartment, undrawn unit, one root, several roots, empty map, an address it
  cannot find), the zoom clamp and the about-a-point invariant, and the scale
  bar's picks.

## Not verified

- **Nothing was run against the live Supabase project.** The `.env` is the
  placeholder; the real `/maps` route was opened on the dev server and
  rendered its chrome and its "could not be loaded" notice in the panel, with
  the map pane's empty state behind it, which is the fail-soft path and not
  the data path.
- **No signed-in session.** The editor entry control is unchanged and was not
  exercised; `ProfileMenu` renders nothing signed out and was seen only in
  that state.
- **2844x1450 was measured by my own playwright script**, not by the harness,
  whose widths are 375 and 1440 by design. The numbers in the first table are
  from that script.
- **Pinch was exercised only as two synthetic pointers.** No touch hardware.
- **A real room was still not on the map**, which is 0020's standing point.
  The fixture's building is 1200x800 with three rooms; the label-fit rule's
  behaviour on a dense real room is a prediction from its arithmetic.

## Reported, not changed

- **The editor is untouched** (`src/routes/maps/edit/**`, `MapsEditor`,
  `MapsEditorShell`, `NodeTree`, `PlanCanvas`, `shelf*.ts`, `grants.ts`), per
  the prompt.
- **The guesser game is not built.** The prompt says a decision entry records
  the deferral; no file under `docs/decisions/entries/` on this tree mentions
  it, so the deferral is recorded here as the prompt's word.
- **`h2` inside the panel takes the shell's green `// ` prefix**, on the
  card's title and the list heading, as it did before this bundle. It is the
  IDEA shell's editorial style; changing it would be a room decision, and
  the room did not ask.
- **`tests/derived-numbers.test.ts` reddens on any tree that adds a route
  spec until `npm run verify:readme` has measured it**, by its own design; it
  was red between the two new specs landing and the measured run at the end
  of this bundle, and green after.
