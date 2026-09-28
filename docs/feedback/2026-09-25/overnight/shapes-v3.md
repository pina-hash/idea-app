# Classroom shape language, round 3: Plate v3

Ledger 0344, written 2026-09-28 for Mr. Pina to approve, change or reject. **A proposal, not a
change: nothing here reaches a real page.** Round 2 (`shapes-v2.md`, ledger 0341) got the rule
right (one geometry, per-theme colour) and the look wrong: on 2026-09-27 Mr. Pina called it the
bare minimum. The chips were pointy and too wide; Sci-Fi Line's corners are "bevels, but they're
also rounded"; its borders are composited, grey gradients shifting to white, "the white to
glowing looks really cool"; and no grid behind anything that is not a graph. This round brings
the Plate mockup on `/dev/themes-shape` up to the kit's finish, in all three themes.

Every figure below was measured in the harness Chromium (141) at 375px and 1440px, in all three
themes, on this branch's tree. Sampling a reference pixel to learn a colour relationship is
analysis; where it was done is said each time (the kit images lived in `/tmp/refs-r3/` and never
entered the repository). Nothing of the kit is traced, embedded or shipped: every edge, glow,
screw, hatch and ring is CSS or inline SVG drawn from our own tokens.

## What to look at

- **`shapes-v3-page-space-white-1440.png`, `shapes-v3-page-idea-1440.png`,
  `shapes-v3-page-matrix-1440.png`**: the composed page region, today above and the proposal
  below. Start here: it is a page, not a parts sheet.
- **`shapes-v3-detail-space-white-2x.png`**: a 2x sheet of the button, the selected button with
  its broken ticked ring, the pads (lit and unlit), the switch, the list well, the display, the
  progress ring and the dropdown well.
- **`shapes-v3-chips-space-white-2x.png`**: the chips before and after, holding the same words.
- **`shapes-v3-<theme>-1440.png` and `shapes-v3-<theme>-375.png`** for `idea`, `matrix` and
  `space-white`: the whole mockup, every pair, both class menus open.
- **The page itself**: `/dev/themes-shape` on a local `npm run dev`. **Plate v3 is the default
  view.** The Theme buttons switch IDEA, Matrix and Space White in place; the View buttons bring
  back round 2's Plate (`?view=plate`) and round 1's two views; the new **Label face** buttons
  switch the labels and readouts between A (Share Tech Mono, the default) and B (VT323, a pixel
  face). A collapsed **Corner study** sits under the header.
- **How to read a pair**: as in round 2. The top or left of each pair is today's classroom in the
  theme you picked (the real `.btn`, `.card`, chips, `.cr-select`, `ClassView`, `ClassroomShell`,
  `ReturnedGrade`); the bottom or right is the identical markup inside `.p3-after`, the one
  wrapper `plate-v3.css` keys on. Three pieces have no equivalent today and render in the after
  column only, each named in its section's note: the progress ring, the held switch pair, and the
  region's engraved rails.

## The one rule, and the proof it holds

**Geometry, layout and control positions are the same in every theme.** `plate-v3.css` keeps
round 2's discipline and tightens it: every length is declared once on `.p3-after` with no theme
selector near it (the only lengths that move, move with the viewport, in one 480px block); the
three theme blocks declare **colours only, shadows included** (a shadow's geometry is written
once in its rule and only its colour is a token, so a bloom one theme does not want is a
transparent colour, never a missing shadow); no rule names a theme.

**Measured**: `_themes-shape-plate-pixels.mjs` reads the bounding box of every element under the
view in each theme and diffs Matrix and Space White against IDEA.

| width | controls | elements | differing (Matrix) | differing (Space White) | max delta |
|---|---|---|---|---|---|
| 1440 | 183 | 1236 | 0 | 0 | 0.00px |
| 375 | 183 | 1236 | 0 | 0 | 0.00px |

Page size identical too (1440x6003 and 375x12235 in all three).

**The diff can see a difference (a positive control).** With one planted length
(`--p3-band: 25px`) in Matrix's colour block, the same script reported 140 of 183 controls and 969
of 1236 elements differing at 1440 (124 and 895 at 375), with Space White still at 0. The file
was restored from a saved copy and md5-checked, never from git.

**The instrument was wrong once this round and is fixed.** The first 1440 run reported 36
differing controls by 1090px. They were boxless (hidden) elements: a `display: none` element
reports a zero rect at the viewport origin, and adding the scroll offset made its "position"
the scroll of the moment, which differed because IDEA's class menus took a retry click that
scrolled the page. The reader now scrolls to the top first and records a boxless element as
boxless, and a page whose menus never open stops the run instead of diffing two different pages.

## The corner study, and the k chosen

The page carries a collapsed **Corner study** (the first thing under the header): round, bevel,
and `superellipse(0.25)`, `(0.5)` and `(0.75)`, each at a control's scale (120x44), a card's
(180x110) and a plate's (240x140), drawn in the proposal's own material. The harness Chromium
(141) supports `corner-shape`: the spec reads `round round superellipse(0.25) superellipse(0.25)`
back off the display screen, and a `@supports (corner-shape: bevel)` block holds every use, so a
browser without it draws a plain radius.

- **k = 0.25 for every chamfer**, picked by eye against the kit's display window (a trapezoid
  whose angled corners are clearly angled but end in small rounds) and its plate gutters'
  angled joints. At 0 (bevel) the ends are knife-sharp, which is exactly what Mr. Pina said the
  kit is not; at 0.5 the chamfer already reads as a fat round and the angle is lost at a
  card's size; 0.75 is a squircle. 0.25 is the one that still reads as a cut at 26px and has
  visibly softened ends at 2x.
- **Where the chamfer is**: C2's list and nothing else. The selected button's ring breaks (a
  masked pseudo-element whose break ends are cut at 118deg), the display screen's two lower
  corners (26px, k 0.25), the centre column's two raised tabs (k 0.25), the title bar's hazard
  ends (every bar ends on its own slant) and the engraved gutter joints (the SVG rails and the
  45-degree turns). Every control, pad, well, card, housing, menu, chip and plate is a plain
  rounded rectangle: the first review read round 3's first render, which still chamfered the
  cards and the menu, as "the round-2 silhouette is still there", and it was right.
- **Radii**: 11px on a 44px control (a quarter of its height, as the kit's 22px buttons measure
  about 5.5px), 5px on a 22px chip and on the selected row, 8px on a pad, 12px on a card and a
  well, 14px on the display housing, and 6px on a plate (the kit's slab is near-square, and the
  second review read a 14px plate as a rounded card).

## The fidelity table, C1 to D13

Every item from the prompt's reading of the kit, checked against my own eyes and samples
(`2-pads-list-buttons.webp`, `1-overview-knob.png` and the zoom crops, sampled in `/tmp`).

| Item | Verdict | How |
|---|---|---|
| C1 small controls rounded | **match** | Buttons, header keys, dropdown and input wells, the switch track, pads and chips are rounded rectangles: 11px on a 44px control (a quarter of its height, as the kit's 22px buttons measure), 8px on a pad, 5px on a chip. Nothing on a control is pointy. |
| C2 chamfer as a detail | **match** | The selected ring's breaks (masked, cut at 118deg), the display screen's lower corners, the centre column's two tabs, the hazard ends and the engraved gutter joints. Nowhere else: cards, housings, menu and plates are rounded, which the first review asked for and C2 already implied. |
| C3 softened chamfer, corner study | **match** | `superellipse(0.25)` on every large chamfer, behind `@supports (corner-shape: bevel)`; the study is on the page, collapsed. See the next section. |
| M1 plate, recessed column, groove | **match** | Plate `#e4e8ee` to `#dfe3ea` (kit 227,231,237: ours reads 227,231,237 at the top), a 1px lighter top edge, a soft shade gathering right and at the foot. Centre column `#d3d7e1` to `#ccd0db` (kit 214,218,228 to 205,208,216), lit from the upper left, meeting the plate in a dark line inside and a light line outside (kit: 182 then 242). |
| M2 composite button edge | **match**, one value darker | Same bands in the same order as the kit's sample (table below): a soft darker ring outside, the hairline, a transition ring, a light highlight, a face gradient 186 to 201 (kit 183 to 202), a darker foot, the hairline, a soft drop. The hairline is `#6e757e` (110) where the kit's is 134: that is the load-bearing boundary at 3.75:1 on the plate, and 3.00:1 on the recessed column, its tightest ground. |
| M3 selected: near-white face, broken ticked ring | **match** | Face 216 to 221 (kit 222); a 2px accent ring with a pale inner line, inset 5px, broken at the top-right after three ticks and a block with an angled end, and at the bottom-left after two ticks; an accent-tinted band between rim and ring as the kit carries (176,162,162 and 200,174,164 there). A masked pseudo-element, not an outline. |
| M4 pads, lit and unlit, LED | **match** | Hairline, a 3px band 172 to 155 (the kit's own), a bright inner lip 211 (kit 212), a face gradient 179 to 199 (kit 185 to 201). Lit: face 219 to 229, a 3px pure-white rim glow and a soft white core (kit: 243 to 255 over 3px, face 222). The LED sits in a recessed cup at the bottom right, in a lane of its own. |
| M5 glassy sheen | **adapted** | Crisp 1px white highlights on top edges; a soft white sheen over the ring's disc and a bright rim highlight on it (SVG, no blur, no `backdrop-filter`); a diagonal glass sheen across the display screen. The kit's floating clear disc is the ring's sheen and rim; there is no second glass object. |
| M6 glow | **match** | White segmented arcs inside the ring with an SVG blur; lit pads glow white on Space White; the readout glows in the accent on the dark display only. On the dark themes "lit" is a faint green rim glow and lit parts bloom (colour tokens, transparent on Space White). |
| M7 soft cool shadows | **match** | Every shadow is a cool grey (`rgba(70,80,100,...)` on Space White), soft, offset downward; housings and cards cast a long one that falls a little left, as the kit's VU housing does. |
| M8 gradients on greys only | **match** | The accent is flat everywhere: the primary face, the selected row, the switch's on knob, the ring's arc, the LEDs. Greys carry the gradients. |
| D1 title bar and hazard blocks | **match** | A lighter strip with a groove under it, the title centred in spaced mono caps, regular weight, mid-grey; two mirrored blocks of slanted bars at the kit's proportions (a bar half its pitch, leaning about 62 degrees), antialiased SVG, always ending in a whole bar. |
| D2 raised tabs | **match** | A small raised trapezoid (softened ends) at the top centre and the foot of the centre column. |
| D3 screws | **match** | A recessed ring with a dark centre dot in every plate corner and two in the display housing's foot; a pin-point specular on the dark themes only. |
| D4 hatch stacks | **match** | Nine round-capped diagonal strokes on each side edge, antialiased (an SVG mask over the theme's hazard colour). |
| D5 engraving | **match** | A line that runs straight and turns 45 degrees above the side column; a short engraved diagonal crossing each plate's left edge; the right rail with its angled triple lines (desktop only: stacked on a phone it would run along the well's edge). |
| D6 brackets, `+`, ticks, label below | **match** | Thin L ticks at every group's corners, mid-edge ticks, a caps label centred below, and a centred `+` exactly where the region's card gutters cross. |
| D7 dropdown well | **match** | A recessed rounded well with a crisp top shadow, a light lip outside its foot, the label left in mono caps, a small accent caret pointing down. |
| D8 list | **match**, divider held at the floor | The unit group is the well, lit from the upper left; rows divided by etched lines that stop short of the edges; the selected row is solid accent with light text, slightly proud, reaching 4px past the row; a slim accent thumb in a faint recessed track inside the well's right edge. The divider's dark line is 3:1 because it is the only separator between two interactive rows; the kit's is a 7-level whisper. Titles stay sentence case in the reading face (round 2's call). |
| D9 switch | **match**, housed | A recessed pill track and a round, centred, matte disc carrying a cross (off) or a tick (on, accent). It is the header's Light control, so it keeps that button's housing: the housing is its 44px target, its boundary and its word's home. |
| D10 slider | **omitted** | The classroom has no range control. Nothing in `ClassView`, the grading console, the composer or the Live tab takes a value on a continuum; inventing one to show the part would be a control with no job. |
| D11 progress ring | **match** | A thick flat accent arc from twelve o'clock, counter-clockwise, a shaded remainder, an outer thin segmented ring, a raised disc with a drop shadow, a fine dotted tick ring, glowing white segments, the value in the accent: real text over `aria-hidden` SVG, one `role="img"` with the value in words. Used for the returned grade (display and region). On the wall: 3.67:1 on Space White, 4.23 IDEA, 4.95 Matrix. |
| D12 display | **match** | A housing with a moulded frame (lit top-left, shaded at the foot), two screws, a cast shadow; the screen a dark trapezoid with rounded upper corners and softened lower chamfers, an inner top shadow, side walls, a subtle vertical gradient lighter at the top, and no grid. |
| D13 perforation | **match** | A 60x30 dot patch fading out radially, between the screws, under the screen. The only repeating dot pattern. |

**Classroom mapping.** The period tiles are pads; the current class is the LIT pad (plus
`aria-current` and its bold code, so the glow is never the only signal). **Item cards do not take
the lit treatment.** On this page lit already means "the current one" (the pad) and "the one you
picked" (a selected key), and "new since you last looked" on a card would read as selection, not
status; the classroom's own Updated chip already says new, in words.

## The fidelity passes

Each pass rendered every component and the composed region in Space White at device scale 2 and
set each crop beside the matching `sci-fi-line-zoom/` crop scaled to the same physical size (the
zoom factor of each crop was measured by cross-correlation against its source image, not
assumed). The comparison images contain kit crops and stayed in `/tmp`.

### Pass 1 (at least five differences per component)

- **Button, unselected**: the kit's hairline is about two of our pixels (a dark core and a
  transition); there is a light highlight ring inside it all round, where ours was a top
  highlight only; the kit's foot is a heavier dark line merging into a shadow; its radius reads
  about 11px at our scale (ours was 10); its shadow is broader; our labels tracked wider than the
  kit's group labels.
- **Button, selected**: the kit's ring sits about 6px in (ours 4); it BREAKS into ticks on its own
  line before a thicker block (ours hung ticks under a continuous line); the block sits on the
  line and is thicker; the gap before the top-right corner is cut at an angle; the bottom-left
  has a corner piece, two ticks, a gap; the band between hairline and ring is accent-tinted.
- **Pads**: the kit's bezel is thick (hairline, a 3 to 4px band with its own gradient, an inner
  line); its lit rim glow is broad; its LED sits in a recessed cup; the unlit face has a light
  line at its foot; its corner radius is larger relative to size; an inner hairline shows between
  band and face.
- **List**: the kit's well edge is a soft recess, not an outline; its inner top shadow is about 6px;
  its dividers fade over about 16px and are light; its scroll bar sits on the well's edge and runs
  past the selected row; its selected row spans the well with about 4px inset at radius 3; its
  rows are mono caps (ours sentence case, round 2's call, kept).
- **Dropdown**: our caret pointed up; the kit's is smaller; our label tracked so wide it truncated
  the unit's name; the kit's edge is a soft top lip; its face is darker than its surround with a
  lighter lip below.
- **Switch**: the kit's track is larger; its knob is a raised, shaded disc with a drop shadow (ours
  flat); its track has no dark outline; its on knob has a gradient; the knob overlaps the track's
  ends; it sits bare on the plate (ours in the Light button: kept).
- **Display**: the housing's corners were chamfered by our card rule; the screen's lower chamfers
  are larger; the screen edge is soft, not a hairline; the screws are about 20px recessed cups
  (ours 11px); the perforation is larger with bigger dots; the housing's shadow is larger; its
  bezel reads as a thick light frame.
- **Progress ring**: the kit's remainder shades to near-charcoal; its disc has a broad white rim
  and a lighter interior; its glow segments are thicker and brighter; its drop shadow is large;
  its channel is a thin dark line; its tick ring is denser and closer to the rim.
- **Title bar**: our hazard slants were reversed; the kit's bars are bolder and taller; its blocks
  end in whole bars (ours were cut); its title is larger and darker; its groove is light over dark.
- **Plate edge**: the kit's plate is lit top-left with a darker band right and at the foot; its
  screws are about 15px recessed cups; its hatch stacks are bolder with about nine strokes; short
  engraved diagonals cross the column edge; its corner brackets are thin Ls (a match).
- **Chips**: our LED read brown and flat (Space White's amber is a text ink, dark); it crowded the
  edge; the chamfer read as a folded tag; the 1px hairline and the face gradient matched.

### Pass 2 (after pass 1's fixes)

The button foot overshot into a heavy dark shelf; the selected tint read as a thick green band;
the block's end was square; side highlights too strong; the pads' foot had the same shelf; the
list's well edge and dividers stayed dark (both floors); the switch knob sat exactly in the track;
the display's screws read as eyeballs and the readout wrapped at 1440; the ring's tick ring sat ON
the white rim and its readout was small (0.16 of the diameter against the kit's 0.19); the
plate's screws had the eyeball problem and its hatch strokes were now too heavy; the dropdown
label still truncated by one character. The title bar and the chips now matched.

### Pass 3 (after pass 2's fixes)

Nothing material on the buttons, the selected ring, the pads, the plate edge, the chips, the
switch or the title bar: what was left was the kit image's own resampling softness and the
deliberate differences (labels on our buttons, the switch inside the Light button, the
floor-held hairlines on wells and dividers). One proportion on the display (the screen sat 16px
below the housing's top against the kit's 6px) was fixed.

### Then the two independent reviews, below, found what three passes had not

Mostly the dark themes, the drawn look of the edges, the leftover chamfers and one real bug (the
ring's disc never painted). That is the argument for the reviews: a pass compares the parts I
chose to crop against the crops I chose to look at. **After review 2's fixes a fourth own pass
sampled the band profiles (the table below): the number and order of bands match the kit in every
part sampled.**

### The dark themes, passes 1 and 3, against `hardware-dark.png` and `hud-dark.png`

- **Pass 1** (IDEA; Matrix the same plus nothing phosphor-specific): plate and cards 23 to 34 where
  `hardware-dark`'s tiles are 35 to 54, one black sheet; wells near 12,15,13 and the screen 2,5,4
  where near-black belongs only to crevices; edges carried entirely by a light 1px outline;
  selections and the primary solid pastel slabs, the brightest things on the plate; nothing
  bloomed; the knob face flat black (the fill bug); screws plain holes.
- **Pass 3** (after both reviews' fixes): graded charcoal plate, cards and key faces, each a clear
  step from the next; keys in near-black trays; the hairline lit at the top and at the floor at the
  foot; wells darker than the plate with a light foot lip; the display tinted glass with side walls
  and a sheen; deep-accent selections with a lit edge; faint green bloom on the lit pad, the arc
  and the selection (stronger on Matrix, whose headings are phosphor green). **Remaining
  difference**: `hardware-dark`'s knob is conic brushed metal and ours is a radial charcoal disc
  (SVG has no conic gradient, and a CSS layer under the SVG would be a second drawing of one
  control). **Not attempted by design**: `hardware-dark`'s scan-lined thermal screen and
  `hud-dark`'s dense line work, both of which are ruled fills under Mr. Pina's no-grid rule, and
  sharper dark-theme corners, which the one-geometry rule forbids.

## The independent reviews

Two fresh subagents, each given only `/tmp/refs-r3/` and the finished screenshots (no code, no
notes), each asked to rank every way the render falls short of Sci-Fi Line (and, on the dark
themes, of `hardware-dark` and `hud-dark`) and anything that still looked flat, drawn, pointy or
cheap. Everything either ranked visible was fixed or answered; the two lists and what happened
to each item follow.

### Review 1 (fresh subagent, round 3's first finished render)

It was given only `/tmp/refs-r3/` and 25 screenshots (every section's after column at 2x in all
three themes, the region at 1x, the region at 375). Its list, ranked by visibility, and what was
done with each item:

| # | Finding (its words, shortened) | Sev. | What was done |
|---|---|---|---|
| 1 | Dark themes: wells are flat black holes (input 12,15,13; display window 2,5,4); PRESSED reads as a text box | HIGH | Fixed. Every dark well is now graded charcoal with a crevice line at the top and a light lip at the foot (IDEA well 23 to 34 in mean RGB level, lip 20% white; `hardware-dark` runs 33 to 38 to 114). The display is tinted glass (`#27352c` to `#111814`) with a sheen. PRESSED is a sunk KEY with its own gradient, never the well's trough. |
| 2 | Dark themes: tonal range crushed (plate 23 to 28, cards 25 to 34), outlines do all the work | HIGH | Fixed. In mean RGB level: IDEA plate 36 to 44, recessed column 24 to 28, cards 44 to 54, key faces 46 to 61; Matrix the same steps in green-tinted charcoal (review 2 then pushed them further apart). Plates sit on the page's near-black gutter, as `hardware-dark`'s tiles do. Label ink and the hairline were lightened (lightness only) to hold the floors on the lighter grounds. |
| 3 | Rims are drawn lines, not moulded bezels; pad reads as a double outline; no halo | HIGH | Fixed. The edge is now a tube: halo, dark hairline, a LIGHT ring just inside it, a crisp top highlight, a soft (blurred) foot. The pad's dark inner hairline became a bright lip (Space White 211, the kit's 212); its band was set to the kit's 172 to 155. Every control carries a light halo on the plate. |
| 4 | Cut corners everywhere: cards, panels, menu, chips' dog-ear | HIGH | Fixed. Every card, housing, menu, chip, pad, well and plate is a plain rounded rectangle. The chamfer survives only where C2 puts it: the selected ring's breaks, the display screen, the column tabs, the hazard ends and the engraved joints. |
| 5 | Empty third of the THIS WEEK well; a blank 23px strip between header and title bar | MED-HIGH | Fixed. The region carries six cards in two rows of three (both columns, so the pair stays comparable), and the title bar butts against the header. |
| 6 | Switch thumb clipped at the top and glossy; OFF thumb sliced | MED-HIGH | Fixed. The knob's radial gradient had been centred at 34% (a radial's centre moves the whole disc, so it was cut off at the top). It is now a round, centred, matte, domed disc the full height of the track; the specular blob is gone. |
| 7 | Dark selections and TURN IN are flat pastel slabs; nothing blooms | MED-HIGH | Fixed. On a dark theme a selection (list row, current menu row) and the primary button are a DEEP accent face (`#2f4b2c`) with light type and a lit green edge, and they, the lit pad and the ring throw a faint green bloom (a colour token that is transparent on Space White). |
| 8 | Ring: light knob face mid-grey (151); ticks faint; remainder one tone; arc too thick; plain numerals. Dark knob face flat black | MEDIUM | Fixed, and the cause was a bug: a blanket `fill: none` on every circle outranked the disc's and face's `fill="url(...)"` attributes (a stylesheet beats a presentation attribute), so the disc was never painted. Now the face is near-white under a white rim, ticks darker, remainder shaded toward the lower right, arc 9/84 of the radius (was 10.5), and dark themes get a charcoal disc and a bloom under the arc. Dot-matrix numerals are face B (the A/B toggle); face A stays the default. |
| 9 | Keycap lip and a double bottom line on buttons | MEDIUM | Fixed by item 3: one even rim, the foot a soft 1px shade, no band. |
| 10 | Lit pad does not read (face 240 beside a 255 ring); LED hits the label; LED halo muddy | MEDIUM | Fixed. Lit face 216 to 221 (the kit's 222), ring pure white; LED moved to its own top-right corner, clear of both lines; halo halved on Space White. |
| 11 | Display housing drawn as rings, pure white band all round | MEDIUM | Fixed. The frame is 55% white over the face (never #FFFFFF), lit top-left, shaded along the foot and eased into the face with a blurred inner edge; the cast shadow is longer. |
| 12 | 375: pad sliced by its scroll strip; title wraps with a hanging dot; readout wraps PTS; hazard slabs; OPEN TO-DO off-centre | MEDIUM | Title: the dot is held to both neighbours and the phone title is 0.8rem, so it reads PERIOD 1 · ENGINEERING / I HONORS. Readout: 13px on a phone (a viewport length). Hazard: the tile shrinks to 10px on a phone with percentage stops, so the bars scale. Button centred. The pad slice is the header's own scroll strip, which is 31px wide in TODAY's column at 375 as well (27px after); it is the component's phone behaviour and is left. |
| 13 | Four "on" treatments; the LIGHT ring looks like the focus ring | MEDIUM | Fixed. The ThemeSwitch component's own `.on` outline no longer wins (the rule lists `.on` in its selector): the knob alone says the state. What remains is the kit's own vocabulary: the ticked ring on a selected button, the glow on a lit pad, the solid row on a list selection. |
| 14 | Wide tracking on lower case; header mixes faces; title black bold; captions dark | MEDIUM | Fixed. Every mono label is caps; every header tool word is in the label face (CLASSES, TO-DO, TOUR, NOTE); the title is regular weight in `--p3-ink-2` (it was synthetic bold from `h3`); captions take a lighter `--p3-caption` where the floor allows (Space White `#515c59`). |
| 15 | Extra accent colours: teal unit header and course code, gold and cyan kind glyphs, IDEA pill | MEDIUM | Fixed for the list: unit title, class code and kind glyphs take the grey inks, so the accent is the only colour. Kept: the chip LEDs (the prompt asks for a status LED in the chip's semantic colour), the focus ring (the site's focus token, which must stay recognisable), and the pathway chip (an identity colour, never moved). |
| 16 | Avatar and IDEA pill have no material | MED-LOW | Fixed. The account control is a machined key (face, hairline, light ring, foot, halo), drawn with shadows only so its box does not move. |
| 17 | Right column: OPEN TO-DO left-aligned; ring has no bracket or caption | MED-LOW | Fixed. Centred, and the ring sits in a bracketed group captioned GRADE. |
| 18 | Matrix is IDEA tinted green | MED-LOW | Fixed. Matrix is the one theme whose lights bloom: stronger halos on the lit pad, the LEDs, the arc and the selection, a hard glow on the readout and a green glass sheen on the screen. |
| 19 | Hatch blocks crude: triangle fragments, 7px from the edge; title hazard too dark | MED-LOW | Fixed. Each stack is a parallelogram (`clip-path`) cut on the strokes' own slant, thinner strokes, 9 to 10px in. Hazard mid-grey (Space White `#585d63`, darkest about 93 against the kit's 88). |
| 20 | Disabled CLOSED looks like a wireframe | MED-LOW | Fixed. An unlit key: flat face a shade off the plate, a quieter solid edge, no shadow, the word. |
| 21 | The open menu is a stock dropdown | LOW-MED | Fixed. A housing with a moulded frame and a recess its rows sit in. |
| 22 | The well is shaded the same on every side | LOW | Fixed. The centre column and the list well are lit from the upper left: a wide soft shadow under the top and left lips, a sharp light line on the right and the foot. |
| 23 | Chips crowded: 3px padding, LED touches the D; chip on the selected row reads as a sticker | LOW | Fixed within the width budget: 5px padding on word chips, a 4px LED with a 3px gap on LED chips, and a chip on the selected row gives up its face and keeps an outline in the row's ink. Every chip is still no wider than today's (table below). |
| 24 | Registration marks read as floating tick-and-bar | LOW | Fixed. A centred `+` exactly where the card gutters cross, and lighter brackets (140). |
| 25 | Header overlaps its own screws | LOW | Fixed. A wide plate keeps a 22px band at its foot. |
| 26 | Card hatch reads as stray characters; selected bar wider than dividers | LOW | Fixed. Card hatch removed; the selected plate now reaches 4px past the row, dividers 2px in. |
| 27 | Dark screws are plain holes | LOW | Fixed. A pin-point specular on every screw (a colour token, transparent on Space White, where the kit's screws have none). |
| 28 | Colour fringes on text | LOW | Not a defect of the render: subpixel antialiasing in the capture. No change. |

### Review 2 (a second fresh subagent, after review 1's fixes)

Same brief, same folders, new screenshots. Where it contradicted review 1 I settled it on the
kit's own pixels, and said so.

| # | Finding (shortened) | Sev. | What was done |
|---|---|---|---|
| 1 | Space White housings are still a light face inside a crisp dark hairline, a triple line (white, dark, white); card faces only 9 levels of gradient | HIGH | Fixed what the floor allows. Cards, housing and menu lost the outer ring and the second light line inside (one light top line stays); faces now run 247 to 231 (was 241 to 232); shadows are long, soft and cool, falling down and a little left. **Kept: the hairline itself.** The kit's housings have no outline, but a card's edge on the plate is a load-bearing boundary here (3:1), and the prompt names the composite border's dark outer hairline as the line that carries it. |
| 2 | Dark themes: a light outline all round, bottom as bright as top; faces barely separate from the plate | HIGH | Fixed. The hairline is a gradient (a border-box layer under a transparent border): the top catches the light (IDEA `#a3aea6`) and the foot sits AT the 3:1 floor (`#7f8b83`), never under it. The ring outside every key is now near-black, so keys sit in dark trays as `hardware-dark`'s do. Faces moved apart (mean RGB level): IDEA plate 33 to 40, cards 48 to 59, keys 56 to 72; wells went darker (22 to 29) so a recess reads by value. |
| 3 | The period pad is clipped at 375 | HIGH | **Not changed, and it is not the proposal's.** Today's header does the same: at 375 the class strip is 31px wide in the BEFORE column and 27px in the after one, a scroll strip narrower than one pad. Fixing it means changing the phone header's layout, which is a header decision, not a shape-language one. Recorded as a finding. |
| 4 | Bezels too thin, a white halo on both sides of the hairline | HIGH | Fixed, and review 1 was wrong here. Sampled on the kit, the pixel just outside a button is DARKER than the plate (220 on 227), not a halo; the light ring sits INSIDE the hairline (162, then 189). The outside ring is now a faint dark tray, and inside the hairline is a transition ring then a highlight row (163, then 205: table below). |
| 5 | Primary and selected rows are flat slabs with no housing ring; the dark primary's neon outline | HIGH/MED | Fixed for the primary: it keeps the grey hairline and a 2px grey ring inside it, then the accent face with a light line under the ring (a lit key keeps its bezel, as the kit's do); the dark primary lost its neon outline and gained a green glow inside. The selected row keeps its light rim, which is the kit's. **Kept: the green's lightness.** The Space White green is `--green`, `#3b6c36`, by the prompt's instruction; the kit's orange is lighter, and matching it would move an identity colour. |
| 6 | Card action rows don't line up | MEDIUM | Fixed. A card is a column with its action row at its foot, in both columns. |
| 7 | Row separators far too heavy | MEDIUM | Adapted. A divider between two interactive rows is a boundary (3:1), so it stays dark; it is now etched, with a light line under it, so it reads as a cut rather than a rule. |
| 8 | Dial face too white, glow segments vanish | MEDIUM | Fixed, and review 1 was half wrong: sampled, the kit's RIM is near-white (220 to 253) but its FACE is mid-grey (186 to 206). Face now 207 to 193 under a white rim; the readout ink deepened (lightness only) to `#2f5a2b` to hold 4.77:1 on it. |
| 9 | Hatch aliased and chunky | MEDIUM | Fixed. Both hatches are SVG masks over the theme's hazard colour: antialiased parallelograms at the kit's proportions (bar half the pitch, leaning about 62 degrees) with the block rounded down to whole bars and its far end cut on the bars' slant, and round-capped strokes on the plate edges. |
| 10 | Pad LED jammed in the corner; dark lit pad reads as outlined | MEDIUM | Fixed. The LED is at the bottom right (the kit's place) in a lane of its own; the dark lit pad's rim is softer (38% green) and its inner glow stronger. |
| 11 | Chips cramped; outlined chip on the green row; two LED hues | MEDIUM | Partly. The chip on the selected row is now a tag recessed into the row (darker, shadowed lip, no outline). **Kept: the spacing**, which is the width budget (every chip must be no wider than today's with the same word; Pinned has 0.55px to spare), and the LED hues, which the prompt asks for (a status LED in the chip's semantic colour). |
| 12 | Phone title wraps with an orphan | MEDIUM | Fixed. On a phone the title is 11.5px with tighter tracking and the hazard blocks are three bars each, so it is one line. |
| 13 | Dark corners too soft for the dark references | MEDIUM | **Not changed: the one rule forbids it.** Geometry is shared by every theme; a radius that differs per theme is exactly the defect the box diff exists to catch. |
| 14 | Plates look like rounded cards with a fake extrusion | MED/LOW | Fixed. Plate radius 6px (was 14), a lighter edge, and the flat right and bottom band replaced by a soft blurred shade. |
| 15 | The selected trace floats inside the button | MED/LOW | Adjusted: inset 5px (was 6; sampled on the kit, the trace sits 3 kit px, about 6 of ours, inside the hairline, so review 2's "1px gap" is not what the kit shows), and the kit's accent-tinted band between rim and trace is now there. |
| 16 | Type: near-black button text, green-tinted captions, wide tracking, vector readout, thin body | MED/LOW | Fixed where it is ours: button ink a notch off black (`#2d3238`, as the kit's labels are), button tracking 0.08em (was 0.12), captions a neutral cool grey (`#545a61`, the kit's 84,88,93). The pixel readout is face B, one click away (question 1). Body text is the reading face and stays. |
| 17 | Recessed fields lit backwards (light-dark-light at the foot), long top fade; mixed faces | LOW/MED | Fixed: the light lip is outside the foot only, the top shadow is 2 to 3px and crisp, the face gradient ends at 30%. **Kept: the input's reading face**, because its value is a person's own text; the dropdown's caps are a label. |
| 18 | Cast shadows short and straight down | LOW/MED | Fixed: longer, softer, falling a little left on cards and housings. |
| 19 | Scroll indicator painted over the outline | LOW/MED | Fixed: an accent thumb in a faint recessed track just inside the well. |
| 20 | Display flat: no window wall; nested outlines; dark screens plain | LOW/MED | Fixed: the window has light side walls; the housing frame is softer (3px, blurred inner edge). The dark screens are tinted glass with a sheen and bloom; **scan lines are refused** by Mr. Pina's no-grid rule. |
| 21 | Avatar caret crowded; the IDEA pill's own green | LOW/MED | Fixed the caret (7px right padding). The pill's green is the pathway's identity colour and is never moved. |
| 22 | Matrix is IDEA with a tint | LOW/MED | Fixed further: Matrix headings are phosphor green with a soft green bloom, on top of review 1's stronger lights and glass. |
| 23 | Rail collisions | LOW | Fixed: the side hatch is gone from that corner, the rail sits inside the plate, and on a phone the rail is hidden. |
| 24 | Pads 2px higher than the keys | LOW | Fixed: the strip pads its top and foot alike (4px, which is also exactly the focus ring's reach). |
| 25 | Disabled is a flat outlined box | LOW | Softened: a quieter edge and a soft foot. It stays flat on purpose: disabled is the one key with no light on it. |
| 26 | Section captions under their blocks | LOW | Kept: it is the kit's placement, and the region's own title bar names the section at the top. |
| 27 | Dark screws read as eyes; Space White screw centre too dark | LOW | Fixed: dark specular halved; Space White centre dot lightened to `#6a7078`. |
| 28 | Switch glyphs heavy; on-knob ring; switch inside a button housing | LOW | Fixed the glyphs (1.2 and 1.3 strokes) and the ring. **Kept the housing**: it is the header's Light button, and the housing is its target, boundary and label. |
| 29 | Counts run together; stamp middots glued; "one row open" with no row open | LOW | Fixed all three: an etched divider between the counts, room around the stamp's separators, and the caption now says "one row selected". |
| 30 | Pressed does not look pressed in | LOW | Fixed: a real inner top shadow (`--p3-press-shade`). |
| 31 | Colour fringes | LOW | Capture artefact (subpixel antialiasing). No change. |

## The band samples

Top to bottom through the middle of each part. Kit: `2-pads-list-buttons.webp` (919px), sampled
in `/tmp` (button x=720, unlit pad x=715, lit pad x=640, selected row x=380, display x=460).
Ours: the Space White render at 1440, device scale 1. The kit's controls are about half the size
of ours in CSS pixels, so a 1px kit band is a 1 to 2px band here. **The number of bands and their
order match in every part**; the values differ only where a floor requires it (the hairline) or
where the kit's own values are named in the note.

| Part | Band | Kit | Ours |
|---|---|---|---|
| Button | just outside the top | 220,224,230 (darker than the 227 plate) | 204,209,216 |
| | hairline | 134,138,143 | 110,117,126 (the 3:1 floor) |
| | transition | 162,168,173 | 163,169,176 |
| | highlight | 189,195,199 | 205,209,214 |
| | face, top to foot | 183,188,196 to 202,208,215 | 186,191,199 to 201,206,213 |
| | darker foot | 183,189,194 | 191,197,204 then 163,169,176 |
| | hairline | 137,143,148 | 110,117,126 |
| | just outside the foot | 148,154,159 | 164,171,183 |
| | soft shadow to plate | 211,217,221 to 225,229,234 | 189,194,203 to 211,216,224 |
| Unlit pad | outside | 197,200,208 | 206,212,219 |
| | hairline | 144,146,157 | 110,117,126 |
| | band (lighter at top) | 155,158,168, 2px | 173,178,186, 3px |
| | inner lip | 196 then 211,214,224 | 211,215,221 |
| | face, top to foot | 185,189,197 to 201,207,216 | 179,185,193 to 199,204,211 |
| | lower lip | 208 then 215,221,230 | 211,215,221 |
| | lower band | 187,193,202 | 156,162,170, 3px |
| | hairline, then outside | 141,146,156, then 151 to 197 | 110,117,126, then 165 to 199 |
| Lit pad | hairline | 140,143,153 | 110,117,126 |
| | band | 156 to 172 | 173,178,186 |
| | white rim glow | 243 to 252,254,255, 3px | 255,255,255, 3px |
| | glow falloff | 236 to 229,231,233 | 233,234,236 to 226,228,230 |
| | face | 222,224,226 | 219,222,225 to 229 at the foot |
| | lower glow | 243 to 253,255,255 | 236 to 255, 3px |
| | lower band | 160,161,170 | 156,162,170 |
| Selected list row | well above | 229,231,233 | 228,232,238 |
| | light rim | 242,218,215 | 207,229,203 |
| | accent, flat | 235,114,62 | 59,108,54 |
| | light rim | 249,216,195 | 207,229,203 |
| | short shadow, then well | 236,227,223 then 226,230,233 | 204,208,216 then 222,226,233 |
| Display | housing rim | 222,225,233 then 210 | 255 then 241 to 232 (the frame) |
| | screen edge | 184, 168, 123, 84 (a soft ramp) | 110,117,126 (one line) |
| | top shadow | 75,79,82 | 37,39,43 then 51,54,60 |
| | screen top, lighter | 69 to 73 | 57,61,69 |
| | darkening downward | 64, 57, 49,52,60 | 53, 48, 44, 40 |
| | lighter foot rim | 56, 70, 90, 104, 139 | 55, 84, 101 |

**The one visible difference left in the table** is the screen's edge: the kit ramps into the
housing over four pixels, ours draws one hairline. It was not flagged by either reviewer and the
screen is not a control, so the hairline could become a ramp; it is recorded here rather than
changed after the final measurement.

## The chips, before and after

Round 2's chips were hexagons (`--pl-cut-chip: 999px` bevel) and wider than today's. Round 3's are
a plain rounded rectangle (5px), 22px tall, with the composite edge drawn INSIDE the box so it
costs no width: the hairline, a light ring, a top highlight, a grey gradient face and a soft foot.
Labels are 11px mono caps, tracked 0.02em on word chips and 0.01em where a lamp shares the width.
Status rides on a tiny recessed LED (4px, in the chip's own semantic colour: amber for a draft,
gold for pinned), never on a filled chip. No chip on the page is interactive, so none needs a
44px reach.

Measured holding the same word, today's classroom chip against the proposal's (identical in all
three themes and at both widths):

| Chip | Today (w x h) | Plate v3 (w x h) | |
|---|---|---|---|
| Draft (LED) | 45.11 x 18.50 | 44.25 x 22.00 | no wider (0.86px to spare) |
| Assignment | 73.84 x 18.50 | 71.61 x 22.00 | no wider (2.23) |
| Pinned (LED) | 50.86 x 18.50 | 50.31 x 22.00 | no wider (0.55) |
| Not started | 75.22 x 16.80 | 74.56 x 22.00 | no wider (0.66) |
| Material | 62.36 x 18.50 | 59.28 x 22.00 | no wider (3.08) |

**The first round-3 chip was 0.11px WIDER than today's** (Pinned, 50.97 against 50.86) while the
note said otherwise; the measurement caught it, and a 4px LED with the lamp taking the left
padding brought it back under. The spacing both reviews called cramped is this budget.

## Grids

**Removed on this page, and asserted gone.** Round 2's `--pl-display-grid` (the readout's grid)
and its readout grid rule are deleted from `plate.css`, so round 2's own view no longer draws one
either. Round 3 paints no grid, scan line or ruled fill anywhere. Behind the page, Matrix shows
the shell's `.bg-fx`, whose `::after` is a full-window scan-line fill: this page alone hides that
one layer (`body:has(.ts-root) .bg-fx::after`), and the rain, which is `.bg-fx`'s own content, is
untouched. The only repeating patterns are the hazard blocks, the hatch stacks and the
perforation patch (60px, fading out).

**Asserted, both directions.** The Plate spec sweeps every element and both of its
pseudo-elements, the root and the body included, layer by layer: a layer is ruled when it is a
linear gradient along an axis that repeats (a `repeating-linear-gradient`, or a tile under half
the box on a repeating axis). **The sweep round 3 started with was broken and is replaced**: it
matched the computed `background-image` with one regular expression that stopped at the first
`)`, which in a computed value closes an `rgba(`, so its planted control grid was never detected
and a page covered in grids would have read zero. It said "planted control grid detected: NO" on
its first real run, which is the only reason it was caught. Now: 0 grids on the page in all three
themes at both widths; the planted grid is detected; and with this page's hide rule switched off,
Matrix's scan-line layer is found (1 grid), so the sweep reaches the layer it exists for.

**Grids outside `/dev`, reported and not changed** (a separate lane):

- `src/app.css:46` to `58`, `.bg-fx::after`: full-window scan lines behind the portal (animated),
  visible wherever `.bg-fx` shows, including the Matrix classroom.
- `src/app.css:1274` to `1279`, `.gauntlet .drawing-frame:has(.drawing-zoom)`: a 24px grid behind a
  revealed GAUNTLET drawing.
- `src/app.css:1502` to `1509`, `.lightbox-scroll`: a 26px grid in the drawing lightbox.
- `src/lib/design-system/effects.css:77` to `80`, `--blueprint-grid` and `--blueprint-grid-size`
  (24px), consumed by `src/lib/design-system/surfaces.css:30` to `33`, `.backdrop-blueprint`.
- `src/lib/design-system/deck-motion.css:82` to `85`, `.ds-bg-scanlines`: scan lines (the deck's
  ambient loop).
- `src/lib/gauntlet/RegionEditor.svelte:454` to `458`: a 24px blueprint grid behind the region
  editor.
- `src/lib/gauntlet/DrawingViewer.svelte:675` to `682`, `.dv.blueprint .dv-viewport`: a 26px
  reference grid.
- `src/lib/ideacad/app/IdeaCadApp.svelte:459`, `.start`: a 32px grid behind IdeaCAD's start
  screen.
- `src/lib/AppLauncher.svelte:680` to `684`, `.app-card[data-app='gauntlet']`: a 24px grid texture
  on the GAUNTLET launcher card.
- `src/lib/fsp/FspDeck.svelte:157` and `178` (inline 48px and 24px grids, the first animated),
  `310` to `313` (a 24px grid) and `337` (scan lines over deck images).

Not a grid: `src/lib/ideacad/ideacad.css:453` and `461` (a 2x22px dashed drag grip). Some of these
(the GAUNTLET drawing grids, IdeaCAD) may be graphs with axes in Mr. Pina's sense; that is his
call in that lane.

## The measurements

### Floors, `verify:browser` on the three Plate specs

`themes-shape-state-idea`, `-matrix` and `-space-white` (one factory, so one set of rows), each at
375 and 1440, monitor and `PROJECTOR_MODEL` (300:1 native, 10% ambient wash): **828 measurements,
0 outside threshold.** The rows cover text in every well, on the lit and unlit pads, on the
selected row and chip, on the current menu row, on the display, the ring's readout, the region's
title and captions; 44px targets in both columns; the 11px mono floor; decoration kept out of the
accessibility tree and the pointer's way; no grid anywhere.

- **Worst text contrast in any after column: the Space White display readout, the brand green
  `#78b870` on the screen's lightest point (`#383c44`), 4.68:1 on a monitor and 3.35:1 on the wall
  (floor 3.0).** The spec measures a gradient face against its WORST stop, by construction (each
  face declares that stop as its `background-color`).
- The progress ring's readout sits on SVG paint, which the spec's walk cannot see, so the pixel
  script hides the words, shoots the patch under them and scores against its 5th and 95th
  percentile pixels: **Space White 4.77:1 (wall 3.67), IDEA 5.80 (4.23), Matrix 7.17 (4.95).**
- Tightest wall figure among labels: IDEA's pad sub-labels, 3.59:1 washed (4.76 on a monitor).
- 44px: smallest after control 100.5x44 in every theme, 0 of 65 under 44px at 1440 and 0 of 57 at
  375; the list's expand controls keep their documented 30x44.
- Mono labels: after columns 143 at 1440 (132 at 375), smallest 11.00px, 0 under 11px; before
  columns 117 (115), smallest 9.28px, 75 (78) under.

### The composite hairline, the load-bearing boundary

The pixel standing furthest from the ground on each part's straight top edge, against the plate
outside it (1440):

| Part | Space White | IDEA | Matrix |
|---|---|---|---|
| card | 3.76 (wall 3.23) | 4.12 (2.78) | 4.18 (2.77) |
| button | 3.75 (3.22) | 6.29 (4.03), the lit top | 6.48 (4.05), the lit top |
| chip | 3.65 (3.14) | 4.43 (2.90) | 4.42 (2.86) |
| dropdown well | 3.72 (3.20) | 4.23 (2.83) | 4.27 (2.80) |
| list well | 3.72 (3.20) | 4.21 (2.82) | 4.23 (2.79) |
| pad | 3.75 (3.22) | 4.12 (2.78) | 4.18 (2.77) |
| display housing | 3.75 (3.22) | 4.16 (2.80) | 4.18 (2.77) |

A dark button's FOOT is the floor colour itself (`#7f8b83` IDEA, `#6b8c73` Matrix), the same line
the card row measures: 4.12 and 4.18 (wall 2.78 and 2.77). Every figure clears 3:1 on a monitor
and the projector's 2.0 for a boundary. On the recessed column, Space White's tightest ground,
the hairline is 3.00:1 (computed). The antialiased rows round a corner read lower (a diagonal
cannot be one solid pixel); they are printed by the script and are the same kind of figure round
2 reported.

### Focus rings, pixels that change against a full 2px ring (1440)

| Control | Before | After (IDEA / Matrix / Space White) |
|---|---|---|
| primary button | 104.6% | 105.6 / 105.6 / 106.4% |
| secondary button | 104.0% | 104.0 / 104.0 / 104.7% |
| selected button | 104.6% | 104.9 / 104.9 / 105.6% |
| dropdown | 150.9% | 102.6 / 102.7 / 103.6% |
| text input | 102.4% | 102.7 / 102.8 / 103.0% |
| card button | 104.8% | 106.3 / 106.3 / 107.2% |
| header tool | 105.5% | 105.9 / 105.9 / 107.4% |
| **class pad** | **61.5%** | **103.1 / 103.9 / 104.6%** |
| theme switch | 105.9% | 106.7 / 106.5 / 105.6% |
| list row link | 100.9% | 100.9% in all three |

The class pad's ring was clipped by its scroll strip in today's header (61%); the strip now has
4px on every side, which is the ring's reach, and the ring is drawn in full.

### Where a press lands

Every after control's centre and four points 3px inside its edges, hit-tested at 1440 and 375 in
all three themes: 0 presses land elsewhere, except 5 of 70 in the menu section at 375, which is
the open class menu covering a card's button, identical in the before column. Presses 2px inside a
corner land outside a rounded control by geometry.

### Paint cost, 1440, the whole page scrolled over 180 frames

| Theme | Frames | Mean | p95 | Main-thread paint | Style and layout | Compositor draw (software) |
|---|---|---|---|---|---|---|
| IDEA | 175 | 16.67ms | 16.70ms | 6.43ms | 32.14ms | 331.91ms |
| Matrix | 175 | 16.67ms | 16.70ms | 5.84ms | 29.02ms | 315.72ms |
| Space White | 175 | 16.67ms | 16.80ms | 5.45ms | 29.24ms | 283.76ms |

No frame over budget in any theme. The only filters on the page are the ring's three SVG blurs,
each on an element about 160px across; nothing page-wide. The compositor figure is Chromium's
SOFTWARE renderer in a headless container, so it is a worst case, not the school desktops' GPU.

### Label face B

VT323 (OFL, self-hosted from `@fontsource/vt323`, no CDN), for labels and readouts only, declared
at the same 11px and sized to Share Tech Mono's cap height with `font-size-adjust: cap-height 0.7`.
Measured at 11px: the rendered cap height is 8px in both faces; B's thinnest strokes are 1 to 2px.
Its ink and ground are A's, so on the projector model its contrast is A's (group captions: Space
White 5.42:1, wall 4.26; IDEA 8.57, wall 5.18; Matrix 8.29, wall 4.93). What a ratio cannot see is legibility of a pixel face at
11px on a washed wall, which is why it is a question and not a default. With face B on, the box
diff and the mono floor were run again: 0 differing boxes, 0 labels under 11px.

## Not verified

- **Safari and WebKit**: no container here has them. `corner-shape` is Chromium-only today; the
  `@supports` fallback draws plain radii, which is the whole design now except the screen's and
  the tabs' softened chamfers.
- **A real projector and a school desktop**: the projector figures are the model, and the paint
  figures are a headless software renderer.
- **Web fonts in the harness**: `verify:browser` blocks non-loopback requests, so Google-hosted
  faces fall back; the three faces this page uses are self-hosted and do load.
- **Reduced motion**: the proposal's only motion is 120ms colour and shadow easing, gated behind
  `prefers-reduced-motion: no-preference`; the harness runs `no-preference`, so the reduce path was
  read, not driven.

## The token tables

Generated from the two stylesheets with their comments stripped, so they cannot disagree with the
code. Round 2's `--pl-display-grid` is the grid this round deleted. In both files a theme block
holds colours only; every length is in the shape table.

#### Before: round 2, `plate.css` (`--pl-*`, as it stood at the start of this bundle)

Shape and layout (every theme):

| token | value | at 480px and under |
|---|---|---|
| `--pl-cut-control` | `6px` |  |
| `--pl-cut-chip` | `999px` |  |
| `--pl-cut-panel` | `14px` |  |
| `--pl-cut-plate` | `22px` |  |
| `--pl-label-size` | `0.6875rem` |  |
| `--pl-label-track` | `0.14em` |  |
| `--pl-ring` | `2px` |  |
| `--pl-marker` | `4px` |  |
| `--pl-notch` | `10px` |  |
| `--pl-band` | `22px` | `14px` |
| `--pl-screw` | `7px` |  |
| `--pl-hatch` | `5px` |  |
| `--pl-bracket` | `10px` |  |

Colour (per theme; a blank cell inherits IDEA's):

| token | IDEA | Matrix | Space White |
|---|---|---|---|
| `--pl-plate` | `var(--surface-1)` | `var(--surface-1)` | `#eef2f1` |
| `--pl-plate-inset` | `var(--surface-0)` | `var(--surface-0)` | `#e2e8e6` |
| `--pl-panel` | `var(--surface-2)` | `var(--surface-2)` | `var(--surface-1)` |
| `--pl-raised` | `#1c211e` | `#111c12` | `var(--surface-raised)` |
| `--pl-well` | `#050706` | `#010201` | `#e3e9e7` |
| `--pl-edge` | `var(--boundary)` |  |  |
| `--pl-ink` | `var(--text-1)` |  |  |
| `--pl-ink-2` | `var(--text-2)` |  |  |
| `--pl-accent` | `var(--green)` |  |  |
| `--pl-on-accent` | `#0a0c0b` | `#020402` | `var(--surface-1)` |
| `--pl-display` | `#030504` | `#000000` | `#121a17` |
| `--pl-display-ink` | `var(--green)` |  | `var(--accent-field)` |
| `--pl-display-ink-2` | `var(--text-2)` |  | `#aab6b1` |
| `--pl-display-grid` | `rgba(120, 184, 112, 0.09)` | `rgba(120, 184, 112, 0.1)` | `rgba(120, 184, 112, 0.1)` |
| `--pl-hatch-ink` | `rgba(154, 164, 157, 0.42)` | `rgba(143, 174, 148, 0.4)` | `rgba(86, 98, 94, 0.55)` |
| `--pl-engrave` | `rgba(255, 255, 255, 0.09)` | `rgba(143, 174, 148, 0.12)` | `rgba(13, 19, 17, 0.14)` |
| `--pl-screw-face` | `#2b322e` | `#1a2a1c` | `#c9d1ce` |
| `--pl-screw-slot` | `#050706` | `#010201` | `#6f7c78` |
| `--pl-bracket-ink` | `var(--text-3)` |  |  |
| `--pl-shadow-raise` | `inset 0 1px 0 rgba(255, 255, 255, 0.07), inset 0 -1px 0 rgba(0, 0, 0, 0.55)` |  | `inset 0 1px 0 #ffffff, 0 1px 2px rgba(13, 19, 17, 0.16), 0 2px 5px rgba(13, 19, 17, 0.08)` |
| `--pl-shadow-press` | `inset 0 2px 4px rgba(0, 0, 0, 0.75)` |  | `inset 0 2px 4px rgba(13, 19, 17, 0.2)` |
| `--pl-shadow-well` | `inset 0 2px 3px rgba(0, 0, 0, 0.7), inset 0 -1px 0 rgba(255, 255, 255, 0.05)` |  | `inset 0 2px 3px rgba(13, 19, 17, 0.14), inset 0 -1px 0 rgba(255, 255, 255, 0.8)` |
| `--pl-shadow-panel` | `inset 0 1px 0 rgba(255, 255, 255, 0.05)` |  | `0 1px 2px rgba(13, 19, 17, 0.08), 0 4px 12px rgba(13, 19, 17, 0.06)` |
| `--pl-shadow-float` | `0 6px 18px rgba(0, 0, 0, 0.6)` |  | `0 8px 22px rgba(13, 19, 17, 0.18), 0 2px 4px rgba(13, 19, 17, 0.1)` |

#### After: round 3, `plate-v3.css` (`--p3-*`)

Shape and layout (every theme):

| token | value | at 480px and under |
|---|---|---|
| `--p3-soft` | `superellipse(0.25)` |  |
| `--p3-r-control` | `11px` |  |
| `--p3-r-small` | `5px` |  |
| `--p3-r-pad` | `8px` |  |
| `--p3-r-panel` | `12px` |  |
| `--p3-r-plate` | `6px` |  |
| `--p3-cut-screen` | `26px` |  |
| `--p3-label-size` | `0.6875rem` |  |
| `--p3-label-track` | `0.14em` |  |
| `--p3-chip-h` | `22px` |  |
| `--p3-chip-track` | `0.02em` |  |
| `--p3-chip-track-tight` | `0.01em` |  |
| `--p3-ring-inset` | `5px` |  |
| `--p3-led-chip` | `4px` |  |
| `--p3-band` | `24px` | `16px` |
| `--p3-group-pad` | `14px` | `6px` |
| `--p3-hazard-w` | `min(26%, 176px)` | `24px` |
| `--p3-hazard-h` | `15px` | `10px` |
| `--p3-hazard-pitch` | `10px` | `6.667px` |
| `--p3-hazard-tail` | `3px` | `2px` |
| `--p3-title-size` | `1.05rem` | `0.72rem` |
| `--p3-title-track` | `0.12em` | `0.04em` |
| `--p3-readout-size` | `1rem` | `0.8125rem` |

Colour (per theme; a blank cell inherits IDEA's):

| token | IDEA | Matrix | Space White |
|---|---|---|---|
| `--p3-plate-top` | `#262b28` | `#1d271f` | `#e4e8ee` |
| `--p3-plate-bot` | `#1f2321` | `#172019` | `#dfe3ea` |
| `--p3-plate-hi` | `rgba(255, 255, 255, 0.12)` | `rgba(160, 220, 170, 0.12)` | `#f6f8fb` |
| `--p3-plate-edge` | `#343b37` | `#2a3a2d` | `#c2c7ce` |
| `--p3-plate-side` | `rgba(0, 0, 0, 0.4)` | `rgba(0, 0, 0, 0.4)` | `rgba(120, 128, 142, 0.5)` |
| `--p3-inset-top` | `#1a1d1c` | `#111812` | `#d3d7e1` |
| `--p3-inset-bot` | `#161918` | `#0e140f` | `#ccd0db` |
| `--p3-groove-dk` | `rgba(0, 0, 0, 0.8)` |  | `rgba(84, 92, 110, 0.42)` |
| `--p3-groove-lt` | `rgba(255, 255, 255, 0.09)` | `rgba(143, 174, 148, 0.1)` | `#f7f9fc` |
| `--p3-inset-shade` | `rgba(0, 0, 0, 0.55)` |  | `rgba(84, 92, 110, 0.24)` |
| `--p3-hair` | `#7f8b83` | `#6b8c73` | `#6e757e` |
| `--p3-bezel-mid` | `rgba(255, 255, 255, 0.06)` | `rgba(160, 220, 170, 0.07)` | `#a3a9b0` |
| `--p3-bezel-hi` | `rgba(255, 255, 255, 0.16)` | `rgba(160, 220, 170, 0.2)` | `#cdd1d6` |
| `--p3-tube-lo` | `rgba(0, 0, 0, 0.3)` |  | `rgba(120, 128, 138, 0.16)` |
| `--p3-foot` | `rgba(0, 0, 0, 0.5)` |  | `rgba(96, 104, 114, 0.45)` |
| `--p3-rim-out` | `rgba(0, 0, 0, 0.5)` | `rgba(0, 0, 0, 0.55)` | `rgba(80, 90, 104, 0.14)` |
| `--p3-drop` | `rgba(0, 0, 0, 0.55)` |  | `rgba(70, 80, 100, 0.24)` |
| `--p3-drop-far` | `rgba(0, 0, 0, 0.45)` |  | `rgba(70, 80, 100, 0.22)` |
| `--p3-band-top` | `#4b534d` | `#3a4e3e` | `#aeb3bb` |
| `--p3-band-bot` | `#2c312e` | `#1f2b22` | `#9ba1a9` |
| `--p3-pad-lip` | `rgba(255, 255, 255, 0.16)` | `rgba(160, 220, 170, 0.16)` | `#d3d7dd` |
| `--p3-face-top` | `#454c47` | `#35463a` | `#b8bdc5` |
| `--p3-face-bot` | `#353b37` | `#28362c` | `#cdd2d9` |
| `--p3-face-ground` | `#454c47` | `#35463a` | `#b8bdc5` |
| `--p3-lit-top` | `#4f5851` | `#3d5143` | `#d8dbde` |
| `--p3-lit-bot` | `#434b45` | `#33463a` | `#dde0e3` |
| `--p3-lit-ground` | `#4f5851` | `#3d5143` | `#d8dbde` |
| `--p3-lit-glow` | `rgba(143, 224, 138, 0.38)` | `rgba(120, 230, 132, 0.45)` | `#ffffff` |
| `--p3-lit-core` | `rgba(143, 224, 138, 0.3)` | `rgba(120, 230, 132, 0.34)` | `rgba(255, 255, 255, 0.75)` |
| `--p3-bloom` | `rgba(120, 184, 112, 0.3)` | `rgba(120, 220, 130, 0.45)` | `rgba(255, 255, 255, 0)` |
| `--p3-press-top` | `#1f2321` | `#141c15` | `#adb2ba` |
| `--p3-press-bot` | `#2c312e` | `#212c23` | `#c3c8cf` |
| `--p3-disabled-face` | `#2a2f2c` | `#1c251e` | `#dde1e7` |
| `--p3-disabled-edge` | `#505852` | `#3d5242` | `#a0a6ad` |
| `--p3-panel-top` | `#383e3a` | `#2b3a2f` | `#f5f7f9` |
| `--p3-panel-bot` | `#2e3330` | `#233027` | `#e2e6ec` |
| `--p3-panel-ground` | `#383e3a` | `#2b3a2f` | `#e2e6ec` |
| `--p3-panel-hi` | `rgba(255, 255, 255, 0.12)` | `rgba(160, 220, 170, 0.12)` | `#ffffff` |
| `--p3-frame` | `rgba(255, 255, 255, 0.04)` | `rgba(160, 220, 170, 0.04)` | `rgba(255, 255, 255, 0.55)` |
| `--p3-frame-in` | `rgba(0, 0, 0, 0.3)` |  | `rgba(128, 136, 148, 0.2)` |
| `--p3-frame-lo` | `rgba(0, 0, 0, 0.35)` |  | `rgba(110, 118, 130, 0.22)` |
| `--p3-well-shade` | `#0c0e0d` | `#050905` | `#a9aeb8` |
| `--p3-well-top` | `#141716` | `#0c120d` | `#bfc4ce` |
| `--p3-well-face` | `#1b1f1d` | `#131b14` | `#c8ccd5` |
| `--p3-well-ground` | `#1b1f1d` | `#131b14` | `#bfc4ce` |
| `--p3-well-lip` | `rgba(255, 255, 255, 0.2)` | `rgba(160, 220, 170, 0.2)` | `#eef1f6` |
| `--p3-list-face` | `#191c1b` | `#121913` | `#e4e8ee` |
| `--p3-divider` | `var(--boundary)` |  | `#7d848d` |
| `--p3-ink` | `var(--text-1)` |  |  |
| `--p3-ink-2` | `#b9c0bb` | `#a4bda8` | `var(--text-2)` |
| `--p3-caption` | `#b9c0bb` | `#a4bda8` | `#545a61` |
| `--p3-disabled` | `var(--ice)` |  |  |
| `--p3-accent` | `var(--green)` |  |  |
| `--p3-accent-tint` | `rgba(120, 184, 112, 0.35)` |  | `rgba(59, 108, 54, 0.3)` |
| `--p3-accent-glow` | `rgba(143, 224, 138, 0.55)` |  | `#cfe5cb` |
| `--p3-primary-face` | `#2f4b2c` | `#24421f` | `var(--green)` |
| `--p3-primary-ink` | `var(--text-1)` |  | `var(--surface-1)` |
| `--p3-primary-hi` | `rgba(143, 224, 138, 0.35)` | `rgba(140, 240, 150, 0.35)` | `#9dc497` |
| `--p3-primary-foot` | `rgba(0, 0, 0, 0.35)` |  | `rgba(20, 40, 18, 0.45)` |
| `--p3-primary-glow` | `rgba(120, 184, 112, 0.28)` | `rgba(120, 220, 130, 0.45)` | `rgba(255, 255, 255, 0)` |
| `--p3-sel-face` | `#2f4b2c` | `#24421f` | `var(--green)` |
| `--p3-sel-ink` | `var(--text-1)` |  | `var(--surface-1)` |
| `--p3-sel-edge` | `rgba(143, 224, 138, 0.75)` | `rgba(140, 240, 150, 0.8)` | `#cfe5cb` |
| `--p3-sel-glow` | `rgba(120, 184, 112, 0.3)` | `rgba(120, 220, 130, 0.45)` | `rgba(255, 255, 255, 0)` |
| `--p3-sel-chip-edge` | `rgba(231, 234, 232, 0.5)` | `rgba(220, 232, 220, 0.5)` | `rgba(247, 249, 249, 0.7)` |
| `--p3-led-off` | `#3a423d` | `#22342a` | `#9aa0a8` |
| `--p3-led-off-hi` | `#5a645d` | `#3c5541` | `#b9bec5` |
| `--p3-led-ring` | `#050706` | `#010201` | `#7c828a` |
| `--p3-led-halo` | `rgba(143, 224, 138, 0.6)` | `rgba(120, 230, 132, 0.8)` | `rgba(120, 184, 112, 0.35)` |
| `--p3-led-amber` | `var(--amber)` |  | `#e08a2e` |
| `--p3-led-gold` | `var(--gold)` |  | `#d9b84e` |
| `--p3-cup` | `#121514` | `#0a110b` | `#aeb4bc` |
| `--p3-cup-in` | `#000000` |  | `#8c929a` |
| `--p3-screen-top` | `#27352c` | `#1c2e20` | `#383c44` |
| `--p3-screen-bot` | `#111814` | `#0a120b` | `#25282e` |
| `--p3-screen-rim` | `rgba(143, 224, 138, 0.16)` | `rgba(140, 240, 150, 0.22)` | `rgba(255, 255, 255, 0.3)` |
| `--p3-screen-shade` | `rgba(0, 0, 0, 0.75)` |  | `rgba(0, 0, 0, 0.55)` |
| `--p3-screen-ink` | `#81bd79` | `#7bba73` | `var(--accent-field)` |
| `--p3-screen-glow` | `rgba(120, 184, 112, 0.65)` | `rgba(120, 230, 132, 0.95)` | `rgba(120, 184, 112, 0.6)` |
| `--p3-glass` | `rgba(255, 255, 255, 0.06)` | `rgba(170, 255, 180, 0.08)` | `rgba(255, 255, 255, 0.06)` |
| `--p3-hazard` | `#5b645e` | `#3f5a44` | `#585d63` |
| `--p3-engrave-dk` | `rgba(0, 0, 0, 0.75)` |  | `rgba(96, 104, 118, 0.55)` |
| `--p3-engrave-lt` | `rgba(255, 255, 255, 0.1)` | `rgba(143, 174, 148, 0.12)` | `rgba(255, 255, 255, 0.9)` |
| `--p3-screw-face` | `#3a403c` | `#2c3a2f` | `#dfe3e8` |
| `--p3-screw-hi` | `rgba(255, 255, 255, 0.16)` | `rgba(160, 220, 170, 0.18)` | `#ffffff` |
| `--p3-screw-dot` | `#070908` | `#030503` | `#6a7078` |
| `--p3-screw-ring` | `rgba(0, 0, 0, 0.75)` |  | `#8a9098` |
| `--p3-screw-spec` | `rgba(255, 255, 255, 0.25)` | `rgba(190, 255, 200, 0.25)` | `rgba(255, 255, 255, 0)` |
| `--p3-bracket` | `#66706a` | `#52705a` | `#8a9098` |
| `--p3-perf` | `rgba(255, 255, 255, 0.2)` | `rgba(143, 174, 148, 0.26)` | `rgba(96, 104, 118, 0.3)` |
| `--p3-track` | `#121514` | `#0a110b` | `#a9aeb6` |
| `--p3-knob-top` | `#5a625c` | `#465c4a` | `#f6f7f9` |
| `--p3-knob-bot` | `#373d39` | `#2a382d` | `#d3d6db` |
| `--p3-knob-icon` | `var(--text-1)` |  | `#3a3f45` |
| `--p3-knob-on-icon` | `#0a0c0b` | `#020402` | `#f7f9f9` |
| `--p3-knob-shade` | `rgba(0, 0, 0, 0.6)` |  | `rgba(60, 68, 84, 0.45)` |
| `--p3-ring-outer` | `#4b534d` | `#3a4e3e` | `#aab0b8` |
| `--p3-ring-channel` | `#0c0e0d` | `#050905` | `#9aa0a8` |
| `--p3-ring-rest-a` | `#5b645e` | `#3c5541` | `#bcc1c8` |
| `--p3-ring-rest-b` | `#1d2120` | `#0e170f` | `#464b53` |
| `--p3-ring-value` | `var(--green)` |  |  |
| `--p3-ring-bloom` | `rgba(120, 184, 112, 0.6)` | `rgba(120, 230, 132, 0.8)` | `rgba(255, 255, 255, 0)` |
| `--p3-ring-drop` | `rgba(0, 0, 0, 0.75)` |  | `rgba(60, 68, 84, 0.55)` |
| `--p3-ring-disc-a` | `#58615a` | `#44584a` | `#fbfcfd` |
| `--p3-ring-disc-b` | `#2c312e` | `#1f2b22` | `#e4e7eb` |
| `--p3-ring-disc-edge` | `#626b64` | `#4e6654` | `#b9bec5` |
| `--p3-ring-band` | `#1a1d1c` | `#0e140f` | `#c9cdd3` |
| `--p3-ring-face` | `#303632` | `#243128` | `#bcc1c8` |
| `--p3-ring-face-hi` | `#3b423d` | `#2d3b31` | `#cbd0d6` |
| `--p3-ring-ticks` | `#7d8781` | `#6b8c73` | `#8f959c` |
| `--p3-ring-glow` | `#b7e8b1` | `#b4f0bb` | `#ffffff` |
| `--p3-ring-sheen` | `rgba(255, 255, 255, 0.14)` | `rgba(160, 220, 170, 0.14)` | `rgba(255, 255, 255, 0.8)` |
| `--p3-ring-rim` | `rgba(255, 255, 255, 0.4)` | `rgba(180, 240, 187, 0.4)` | `#ffffff` |
| `--p3-ring-text` | `#9fd898` | `#9fe0a0` | `#2f5a2b` |
| `--p3-hair-top` | `#a3aea6` | `#8fb096` | `#6e757e` |
| `--p3-press-shade` | `rgba(0, 0, 0, 0.7)` | `rgba(0, 0, 0, 0.7)` | `rgba(60, 68, 84, 0.5)` |
| `--p3-btn-ink` | `var(--text-1)` |  | `#2d3238` |
| `--p3-head-ink` | `var(--text-1)` | `#c6ecc8` | `var(--text-1)` |
| `--p3-text-bloom` | `rgba(0, 0, 0, 0)` | `rgba(120, 230, 132, 0.45)` | `rgba(255, 255, 255, 0)` |
| `--p3-primary-inglow` | `rgba(120, 184, 112, 0.35)` | `rgba(120, 230, 132, 0.45)` | `rgba(255, 255, 255, 0)` |
| `--p3-screen-wall` | `rgba(143, 224, 138, 0.1)` | `rgba(140, 240, 150, 0.12)` | `rgba(255, 255, 255, 0.16)` |
| `--p3-track-faint` | `rgba(0, 0, 0, 0.35)` | `rgba(0, 0, 0, 0.4)` | `rgba(96, 104, 118, 0.18)` |
| `--p3-selchip-face` | `rgba(0, 0, 0, 0.28)` | `rgba(0, 0, 0, 0.3)` | `rgba(0, 0, 0, 0.2)` |

## Questions for Mr. Pina (each with the default I would take)

1. **Label face A or B?** A is Share Tech Mono, today's face; B is VT323, a pixel face like the
   kit's readouts, self-hosted and toggled on the page. **Default: A**, which keeps the design
   standard's three families, with B considered for the two readouts only (the display and the
   ring), where it is largest and reads most like the kit.
2. **Roll the approved look out to all three themes in one lane?** The geometry is shared and the
   box diff proves it, so one lane changes one set of rules and three colour blocks. **Default:
   yes, one lane**, the phone header's too-narrow class strip (31px today) handled in the same
   lane, since the pads are part of the look.
3. **May a follow-up take the Sci-Fi Line images out of the repository?** Round 2 committed seven
   reference images to `docs/reference/space-white/` (four of them the paid kit's; 4.4 MB for the
   seven), in a public repository; this round's own reference README says they must never be committed.
   This bundle does not own `docs/reference/**` and did not touch it. Removing them from the tree
   does not remove them from history, and `main` is never force-pushed. **Default: yes, delete
   them from the tree in a small lane of their own**, and treat the history as already published.
   **Answered 2026-09-27 ("Those are not our images") and done by ledger 0345**: all ten are gone
   from the tree; history still holds them and was not rewritten.
