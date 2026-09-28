# Classroom shape language, round 2: Plate

Ledger 0341, written 2026-09-27 for Mr. Pina to approve, change or reject. **A proposal, not a
change: nothing here reaches a real page.** It answers two things he said that day: "basically
this but replace the orange with IDEA green" (pointing at the Sci-Fi Line references) and "They
should share the same sci-fi geometry with different color schemes and maybe some other theme
themed differences, but manageable differences." Round 1 (`shapes.md`) proposed corner cuts for
Space White only; its measured findings stand, its look is superseded.

Every figure below was measured in the harness Chromium (141) at 375px and 1440px, in all three
themes, on this branch's tree.

## What to look at

- **The screenshots beside this note** (a `/dev` page answers 404 on the live site):
  - `shapes-v2-page-idea-1440.png`, `shapes-v2-page-matrix-1440.png`,
    `shapes-v2-page-space-white-1440.png`: the composed page region, today above and the
    proposal below. **Start here**: it is a page, not a parts sheet.
  - `shapes-v2-<theme>-1440.png` and `shapes-v2-<theme>-375.png` for `idea`, `matrix` and
    `space-white`: the whole mockup, every pair, with both class menus open.
- **The page itself**: `/dev/themes-shape` on a local `npm run dev`. Plate is the default view.
  The Theme buttons switch IDEA, Matrix and Space White in place; the View buttons bring back
  round 1's two-corner and four-corner views for comparison (`?view=two`, `?view=four`, and
  round 1's own `?cut=four` link still works).
- **How to read a pair.** The top or left of each pair is today's classroom in the theme you
  picked: the real `.btn`, `.card`, chips, `.cr-select`, the real class list (`ClassView`), the
  real classroom header and class menu (`ClassroomShell`) and the real returned-grade card
  (`ReturnedGrade`). The bottom or right is the identical markup inside one wrapper the proposal
  keys on. Any difference comes from the proposal, not from a redrawing. The one copied rule is
  the text input's: every classroom text input is styled inside its own component, so the
  composer's `input` rule is copied onto the specimen and says so.

## The one rule, and the proof it holds

**Geometry, layout and control positions are the same in every theme.** `plate.css` is written
so it cannot be otherwise: every length (cuts, label size, marks, decoration bands) is declared
once with no theme selector near it, and the per-theme blocks declare only colours and shadows.
No rule in the file names a theme.

Measured, not argued: every element's bounding box on the Plate view, read in each theme and
diffed against IDEA (`routes/_themes-shape-plate-pixels.mjs`).

| Width | Compared | Controls (buttons, links, inputs, selects, labels) | Every other element | Page size |
|---|---|---|---|---|
| 1440 | Matrix vs IDEA | 174 boxes, **0 differ**, max delta 0.00px | 1016 boxes, **0 differ**, 0.00px | 1440x5049 both |
| 1440 | Space White vs IDEA | 174 boxes, **0 differ**, max delta 0.00px | 1016 boxes, **0 differ**, 0.00px | 1440x5049 both |
| 375 | Matrix vs IDEA | 174 boxes, **0 differ**, max delta 0.00px | 1016 boxes, **0 differ**, 0.00px | 375x9980 both |
| 375 | Space White vs IDEA | 174 boxes, **0 differ**, max delta 0.00px | 1016 boxes, **0 differ**, 0.00px | 375x9980 both |

Before and after columns alike. Left out of the element count, and only these: the logo's
spinning gear (a rotation animates its box, which is motion and not layout) and the emblem's
dark and light twins (the theme chooses which one is displayed; the slot they share is the logo
link, which is in the control count and does not move). A first unfiltered pass found exactly
those, plus the theme switch's own `on` class, and nothing else.

## The shared tokens (every theme)

| Token | Value | What it shapes |
|---|---|---|
| `--pl-cut-control` | 6px, `corner-shape: bevel` (four corners) | buttons, inputs, selects, header tools, class icons, the selected row |
| `--pl-cut-chip` | 999px, `bevel` | chips: a hexagonal tag (round 1's finding) |
| `--pl-cut-panel` | 14px, `bevel square` (top-left and bottom-right) | cards, the list well, the side panel, the class menu, the display window |
| `--pl-cut-plate` | 22px, `bevel square` | the machined plate itself |
| `--pl-label-size` | 0.6875rem (11px) | every mono label |
| `--pl-label-track` | 0.14em | mono label tracking (0.04em on a list row's meta line) |
| `--pl-ring` / `--pl-marker` / `--pl-notch` | 2px / 4px / 10px | selection: inner ring, row marker bar, notch mark |
| `--pl-band` | 22px (14px under 480px) | the padding band decoration lives in, so no decoration sits under a control |
| `--pl-screw` / `--pl-hatch` / `--pl-bracket` | 7px / 5px / 10px | decoration geometry |

`--pl-band` is the one length that moves, and it moves with the viewport, never the theme.

## The per-theme tokens (colour and material only)

| Token | IDEA (dark default) | Matrix | Space White |
|---|---|---|---|
| `--pl-plate` | `--surface-1` #101312 | `--surface-1` #080e09 | #eef2f1 |
| `--pl-plate-inset` (centre column) | `--surface-0` #0a0c0b | `--surface-0` #020402 | #e2e8e6 |
| `--pl-panel` (cards, panels) | `--surface-2` #161a18 | `--surface-2` #0c150d | `--surface-1` #f7f9f9 |
| `--pl-raised` (button face) | #1c211e | #111c12 | `--surface-raised` #fbfcfc |
| `--pl-well` | #050706 | #010201 | #e3e9e7 |
| `--pl-edge` (load-bearing edge) | `--boundary` #6f7b73 | `--boundary` #64826b | `--boundary` #6f7c78 |
| `--pl-accent` | `--green` #78b870 | `--green` #78b870 | `--green` #3b6c36 |
| `--pl-on-accent` (text on the accent fill) | #0a0c0b | #020402 | `--surface-1` #f7f9f9 |
| `--pl-display` | #030504 | #000000 | #121a17 |
| `--pl-display-ink` | `--green` | `--green` | `--accent-field` #78b870 (the brand green, legitimate as ink on a dark island) |
| depth (`--pl-shadow-*`) | a faint top highlight and a dark bottom edge; wells darker, pressed inset | same as IDEA | soft, low, even drop shadows; a white top highlight on raised faces |
| decoration inks | hatch, engraving, screws in low-alpha sage | the same in Matrix's phosphor sage | hatch and screws in the boundary grey |

**No existing token moved in any theme, and none had to.** Every floor below held on the new
surfaces with the palettes as they are, so the "adjust that theme's colour tokens and report
before and after" step had nothing to adjust. The new literals are grounds the token set has no
counterpart for (a well, a display window, a raised face), each measured below. The accent is
each theme's own `--green`; nothing semantic or identity-coloured is repainted, which keeps
Matrix inside the rule `matrix.css` states for itself.

**Theme touches that differ, and only these:** colour; material (soft shadow on Space White,
edge light on the dark themes); glass (off in all three, see below); the dark inset display,
which on the dark themes is a darker well of the same shape rather than a separate screen.
Engraving density is the same in all three.

## What came from Sci-Fi Line, and how green replaced orange

Sci-Fi Line (formerly `docs/reference/space-white/scifi-line-*.png`, **removed from the tree by
ledger 0345**: "Those are not our images", Mr. Pina, 2026-09-27) is a paid kit (uimother.com). None
of its artwork is traced, sampled or embedded: every shape here is CSS (`corner-shape`,
gradients, shadows) from our own tokens, and no control is a raster image.

| Sci-Fi Line | In the Plate | Where orange was, green is |
|---|---|---|
| One matte light plate, a slightly darker inset centre column, soft even shadows | `.pl-after` is the plate; the composed region's week panel is the inset column; Space White's shadows are low and soft | |
| Recessed gutters with angled joints between columns | the region's week column is recessed (inset shadow), the side panel raised, both cut on opposite corners so the cuts face each other across the gutter | |
| Screw heads in the plate corners | four screws per plate, in the padding band (the two cut corners carry theirs further along the edge, inside the bevel) | |
| Short angled engraving lines; checker-dot engraving | a short engraved rule at the plate's top right and along the header rail | |
| Title bar centred between two hazard-hatch blocks | the region's title tab between two hatch blocks; the header's bottom rail carries a hatch block at each end | |
| Stacks of diagonal hatch marks on plate edges | a hatch stack on each side edge of every plate, a hatch block in each card's top padding | |
| Small recessed notches on the panel border | a thickened run of each card's top edge | |
| Raised pillow buttons, soft inner shadow; pressed looks different | every `.btn` and header tool is a raised face; pressed sinks into a well with an inset shadow and **no transform**, so it moves no box | |
| Selected button: accent inner ring with a notch mark | 2px inner ring plus a 10px notch bar, plus `aria-pressed` | ring and notch are `--green` |
| Thin corner brackets round a group, small uppercase mono label centred under it | every control group; the label is real text (read out), the brackets are paint | |
| Sliders, dropdowns and lists in recessed troughs | the input, the select, the class search field and the class list sit in wells | |
| Mono uppercase list rows, hairline dividers; the selected row is a solid accent fill with light text and a marker bar at the right | the class list's open row, and the current class in the class menu | fill and marker are `--green`, text is `--pl-on-accent` |
| One dark inset screen (EQ, VU meter) where the accent glows | the returned grade's readout: a dark recessed window, faint grid, the score in the accent, an indicator light | readout is `--accent-field`, the brand green at full brightness |
| Squared mono type for labels, generous tracking, readouts in the accent | Share Tech Mono (already the house mono) at 11px or more, tracked 0.14em; readouts in the accent | |
| The accent is rare | green appears on primary action, selection, the current class, the open row and the readout, nowhere else | |

**Where I read it differently from the router chat:**

1. **List titles stay in the reading face, sentence case.** Sci-Fi Line's rows are short mono
   labels; ours are student and teacher titles that wrap. Uppercase mono on a two-line title is
   the content-voice rule broken (display and body text are sentence case) and costs reading
   speed, so only the meta line under each title becomes mono uppercase.
2. **Outlines stay.** The kit's depth comes from light, and its button edges are around 1.8:1.
   The edge of a control, a card on the plate and the only line between two rows are
   load-bearing boundaries here (3:1 floor), so the Plate keeps a `--boundary` edge on every one
   of them and adds the light on top. It reads a little more drawn than the kit; that is the
   price of the floor.
3. **The type is not pixel-edged.** The kit's labels are a pixel font. Share Tech Mono is
   already the house mono and is squared enough; adding a font is outside this bundle and the
   design standards' three families.

## What came from the other three references (shape and detail only, never colour)

| Reference | Taken | Where |
|---|---|---|
| `hud-teal-glass.png` | multi-angle chamfers on large panels, cuts that nest across a shared gutter | the region's two columns; every card and panel's opposite-corner cut |
| | hatch strips on panel edges | plate side edges, card tops, header rail, title bar |
| | a faint grid inside a panel | the display window only (text elsewhere sits on plain ground) |
| `hud-dark.png` | 1px outline strokes | every edge (also the floor's requirement) |
| | corner tick brackets | around every control group |
| | angled-end tabs | the region title tab (`bevel` on all four corners) |
| | ordered data blocks | the readout: indicator, label, value in one mono line |
| `hardware-dark.png` | recessed wells | inputs, select, search, list |
| | inset readout windows | the returned-grade display |
| | indicator lights | the display's status light |
| | controls that look pressable | raised faces, sunk pressed state |

## What was left out, and why

- **Knobs, faders, the wheel, drum pads, switches.** Audio vocabulary with no classroom use.
  The big ring knob was allowed as a circular progress or timer readout; not built, because a
  ring needs its value as a number the stylesheet cannot read, and making the grade card carry
  one is a component change. The flat readout was measured on the wall instead.
- **Tick scales beside wells.** They belong to sliders; beside a text field they would be
  decoration pretending to be a scale.
- **Glass.** Round 1 asked about it; the Plate is matte by design (Sci-Fi Line has none), so it
  is off in every theme. Round 1's glass view is still one button away for comparison.
- **The checker-dot engraving.** Not built. The engraved rule lines already carry the idea,
  and a dot texture laid under labels is a ground the contrast check cannot see (it reads a
  background colour, not an image), so every label on it would be an unmeasured one.
- **The class-list expand control stays 30x44.** `ClassView` documents it as a deliberate
  exception (a 44px-wide box would take the drag grip's taps). The proposal leaves it alone.

## Measurements

### Text contrast, before and after

`verify:browser` on the three new route specs (`themes-shape-state-idea.mjs`, `-matrix.mjs`,
`-space-white.mjs`): **242 measurements per theme, 726 in all, 0 outside threshold**, at 375
and 1440. Each figure is the worst over both widths and every match. Monitor floor is 4.5:1
(WCAG). The wall is `PROJECTOR_MODEL` (a 300:1 projector with 10% ambient light): floor 4.5
for sentences (titles, body, row names, text in a well), 3.0 for labels, chips, button words
and status. Every after figure clears its floor.

| Surface | Floor | IDEA before | IDEA after | Matrix before | Matrix after | Space White before | Space White after |
|---|---|---|---|---|---|---|---|
| button labels | 4.5 (monitor) | 8.30 | 6.91 | 8.71 | 7.42 | 5.21 | 6.04 |
| chips | 4.5 (monitor) | 6.36 | 5.70 | 6.67 | 6.04 | 5.36 | 6.04 |
| group labels | 4.5 (monitor) | 7.63 | 7.27 | 8.47 | 8.03 | 8.62 | 9.10 |
| card micro-labels | 4.5 (monitor) | 7.27 | 6.84 | 8.03 | 7.66 | 9.72 | 9.72 |
| card titles | 4.5 (monitor) | 15.42 | 14.50 | 15.43 | 14.72 | 17.77 | 17.77 |
| card body copy | 4.5 (monitor) | 15.42 | 14.50 | 15.43 | 14.72 | 17.77 | 17.77 |
| card buttons | 4.5 (monitor) | 14.96 | 13.48 | 15.59 | 13.86 | 17.77 | 18.27 |
| card chips | 4.5 (monitor) | 7.27 | 6.84 | 8.03 | 7.66 | 9.72 | 9.72 |
| field labels | 4.5 (monitor) | 7.63 | 7.27 | 8.47 | 8.03 | 8.62 | 9.10 |
| text in the input well | 4.5 (monitor) | 14.50 | 16.67 | 14.72 | 16.45 | 16.49 | 15.27 |
| text in the select well | 4.5 (monitor) | 14.50 | 16.67 | 14.72 | 16.45 | 16.49 | 15.27 |
| list row names | 4.5 (monitor) | 14.50 | 8.30 | 14.72 | 8.71 | 16.49 | 5.87 |
| list row meta | 4.5 (monitor) | 6.84 | 6.84 | 7.66 | 7.66 | 9.02 | 5.87 |
| the SELECTED list row | 4.5 (monitor) | 6.84 | 8.30 | 7.66 | 8.71 | 9.02 | 5.87 |
| the chip inside the selected row | 4.5 (monitor) | 6.84 | 6.84 | 7.66 | 7.66 | 9.02 | 9.72 |
| the class search field | 4.5 (monitor) | 14.50 | 16.67 | 14.72 | 16.45 | 16.49 | 15.27 |
| header labels | 4.5 (monitor) | 14.50 | 13.48 | 14.72 | 13.86 | 16.49 | 17.77 |
| class menu rows | 4.5 (monitor) | 6.84 | 6.84 | 7.66 | 7.66 | 9.02 | 5.87 |
| the CURRENT class menu row | 4.5 (monitor) | 6.84 | 8.30 | 7.66 | 8.71 | 9.02 | 5.87 |
| the returned-grade readout (the display) | 4.5 (monitor) | 7.91 | 8.65 | 8.25 | 8.89 | 5.87 | 7.50 |
| the teacher comment under the display | 4.5 (monitor) | 8.26 | 6.84 | 8.62 | 7.66 | 5.98 | 9.72 |
| region title and column labels | 4.5 (monitor) | 7.63 | 6.84 | 8.47 | 7.66 | 8.62 | 8.27 |
| region side-panel readout | 4.5 (monitor) | 7.91 | 8.65 | 8.25 | 8.89 | 5.87 | 7.50 |
| button labels, on the wall | 3.0 (wall) | 4.65 | 4.22 | 4.76 | 4.38 | 4.20 | 4.82 |
| chips, on the wall | 3.0 (wall) | 3.68 | 3.48 | 3.77 | 3.58 | 4.29 | 4.80 |
| group labels, on the wall | 3.0 (wall) | 4.31 | 4.21 | 4.64 | 4.52 | 6.00 | 6.31 |
| card micro-labels, on the wall | 3.0 (wall) | 4.21 | 4.07 | 4.52 | 4.42 | 6.72 | 6.72 |
| card titles, on the wall | 4.5 (wall) | 8.38 | 8.11 | 8.23 | 8.03 | 9.56 | 9.56 |
| card body copy, on the wall | 4.5 (wall) | 8.38 | 8.11 | 8.23 | 8.03 | 9.56 | 9.56 |
| card buttons, on the wall | 3.0 (wall) | 8.14 | 7.80 | 8.31 | 7.79 | 9.56 | 9.81 |
| card chips, on the wall | 3.0 (wall) | 4.21 | 4.07 | 4.52 | 4.42 | 6.72 | 6.72 |
| field labels, on the wall | 3.0 (wall) | 4.31 | 4.21 | 4.64 | 4.52 | 6.00 | 6.31 |
| text in the input well, on the wall | 4.5 (wall) | 8.11 | 8.71 | 8.03 | 8.49 | 8.90 | 8.28 |
| text in the select well, on the wall | 4.5 (wall) | 8.11 | 8.71 | 8.03 | 8.49 | 8.90 | 8.28 |
| list row names, on the wall | 4.5 (wall) | 8.11 | 4.65 | 8.03 | 4.76 | 8.90 | 4.70 |
| list row meta, on the wall | 3.0 (wall) | 4.07 | 4.07 | 4.42 | 4.42 | 6.26 | 4.70 |
| the SELECTED list row, on the wall | 3.0 (wall) | 4.07 | 4.65 | 4.42 | 4.76 | 6.26 | 4.70 |
| the chip inside the selected row, on the wall | 3.0 (wall) | 4.07 | 4.07 | 4.42 | 4.42 | 6.26 | 6.72 |
| the class search field, on the wall | 4.5 (wall) | 8.11 | 8.71 | 8.03 | 8.49 | 8.90 | 8.28 |
| header labels, on the wall | 3.0 (wall) | 8.11 | 7.80 | 8.03 | 7.79 | 8.90 | 9.56 |
| class menu rows, on the wall | 3.0 (wall) | 4.07 | 4.07 | 4.42 | 4.42 | 6.26 | 4.70 |
| the CURRENT class menu row, on the wall | 3.0 (wall) | 4.07 | 4.65 | 4.42 | 4.76 | 6.26 | 4.70 |
| the returned-grade readout (the display), on the wall | 3.0 (wall) | 4.53 | 4.74 | 4.63 | 4.80 | 4.70 | 4.41 |
| the teacher comment under the display, on the wall | 3.0 (wall) | 4.71 | 4.07 | 4.81 | 4.42 | 4.76 | 6.72 |
| region title and column labels, on the wall | 3.0 (wall) | 4.31 | 4.07 | 4.64 | 4.42 | 6.00 | 5.77 |
| region side-panel readout, on the wall | 3.0 (wall) | 4.53 | 4.74 | 4.63 | 4.80 | 4.70 | 4.41 |

**The tightest after figures**, against their own floors:

| Where | Theme | Figure | Floor | Margin |
|---|---|---|---|---|
| The open list row's title, on the wall (dark text on the IDEA green) | IDEA | 4.65:1 | 4.5 | 0.15 |
| The same, Space White (light text on the green ink) | Space White | 4.70:1 | 4.5 | 0.20 |
| The readout on the dark display, on the wall | Space White | 4.41:1 | 3.0 | 1.41 |
| Chips, on the wall | IDEA | 3.48:1 | 3.0 | 0.48 |
| The open list row and current menu row, monitor | Space White | 5.87:1 | 4.5 | 1.37 |

The open row's title on the wall is the one to watch: it is body text (a title a student reads)
on a solid accent fill, and the fill is what the reference asks for. It clears; a lighter green
fill would not.

### Borders along the cuts

The line along each cut, read from pixels (the pixel standing furthest from the ground on each
row of the cut, against the plate outside the shape), at 1440. Floors: 3:1 on a monitor for a
load-bearing edge, 2.0 on the wall.

| Edge | IDEA straight / cut (wall) | Matrix straight / cut (wall) | Space White straight / cut (wall) |
|---|---|---|---|
| Card, panel cut 14px | 4.23 / 4.02 (2.65 / 2.54) | 4.59 / 4.36 (2.80 / 2.68) | 3.85 / 3.74 (3.33 / 3.26) |
| Secondary button, control cut 6px | 4.23 / 4.06 (2.65 / 2.56) | 4.59 / 4.36 (2.80 / 2.68) | 3.85 / 3.73 (3.33 / 3.25) |
| Select well, control cut 6px | 4.23 / 4.00 (2.65 / 2.54) | 4.59 / 4.36 (2.80 / 2.68) | 3.85 / 3.75 (3.33 / 3.26) |
| List well, panel cut 14px | 4.23 / 4.00 (2.65 / 2.54) | 4.59 / 4.36 (2.80 / 2.68) | 3.85 / 3.75 (3.33 / 3.26) |
| Display window, panel cut 14px (against the card) | 3.98 / 3.76 (2.57 / 2.46) | 4.38 / 4.16 (2.73 / 2.62) | 17.05 / 14.87 (9.36 / 8.69) |

Before: today's straight edges are the same `--boundary`, so the straight figures are today's;
the cut costs 0.1 to 0.2 of a ratio, as round 1 found. On Space White the display window's own
dark fill is its edge, hence 17:1. **One instrument correction on the way**: round 1's reader
took the DARKEST pixel as the line, which is right on a light ground and reads the ground itself
back (1.00:1) on a dark one, where the edge is lighter. It now takes the pixel furthest from the
ground; on Space White that is the same pixel, so round 1's figures are unchanged.

### Focus ring pixels (the site's own 2px ring, focused for real)

At 1440; identical in all three themes to within a pixel or two.

| Control | Before, px drawn of a full ring | After |
|---|---|---|
| Primary button | 654 of ~625 (105%) | 642 of ~625 (103%), 59 in the cut corner |
| Secondary button | 758 of ~729 (104%) | 746 of ~729 (102%), 59 in the cut corner |
| Select | 1913 of ~1268 (151%, its own green ring plus the border turning green) | 1214 of ~1196 (102%) |
| Text input | 1299 of ~1268 (102%) | 1214 of ~1196 (102%) |
| Card button | 546 of ~521 (105%) | 538 of ~521 (103%) |
| Header tool | 555 of ~526 (106%) | 544 of ~526 (103%) |
| Class icon | 236 of ~384 (61%) | 260 of ~417 (62%) |
| Open list row | 1868 of ~1852 (101%) | 1660 of ~1648 (101%) |

Every ring is drawn in full along the cut. The class icon's 61% is today's, not the
proposal's: the icons sit in a strip that scrolls sideways, and the strip clips the part of the
ring that falls outside it. Worth its own fix; not this bundle's.

### Targets

| | IDEA | Matrix | Space White |
|---|---|---|---|
| After, every control (logo link included), 1440 | 0 of 60 under 44px | 0 of 60 | 0 of 60 |
| After, every control, 375 | 0 of 52 under 44px | 0 of 52 | 0 of 52 |
| Before, every control but the logo, 1440 / 375 | 0 of 57 / 0 of 49 | same | same |
| Before, the logo link, 375 (today) | **56x26.3** | 56x26.3 | 56x26.3 |
| Class-list expand control (documented exception, both columns) | 30x44 | 30x44 | 30x44 |
| Horizontal scroll, 375 / 1440 | 0px / 0px | 0px / 0px | 0px / 0px |

**Today's logo link is 26px tall at 375**, in every theme: the emblem shrinks with the viewport
and the link shrinks with it. It is a real target under 44 on the live classroom header now.
The Plate gives it `min-height: 44px`, which centres the emblem in a taller hit area and moves
nothing else in the row.

**Where a press lands.** Every after control wholly on screen was pressed at its centre and 3px
inside each edge's midpoint, section by section: 0 misses anywhere at 1440; at 375 the only
misses are the card's Open button under the open phone Menu panel (5 of 70 points in the menu
section), identical before and after, which is the specimen doing its job. A press 2px inside a
cut corner does land outside the control (for example 22 of 28 in the buttons group at 1440),
exactly as round 1 measured: the cut takes about 18px² per corner off a 44px control and the
44px through the middle is untouched. No bracket, notch, hatch or screw is ever the thing hit.

### Mono labels

| | IDEA | Matrix | Space White |
|---|---|---|---|
| Before (today), smallest mono label | 9.28px, 69 of 108 under 11px (1440) | same | same |
| After, smallest mono label | **11.00px, 0 of 111 under 11px** (1440); 0 of 109 (375) | same | same |

Today's classroom has 69 mono labels under 11px on this page alone (chips at 9.9px, the class
list's meta line at 10.4px, the header's class sub-code at 9.6px, the stacked Report word at
375). The Plate sets every one to 11px, which is the floor asked for; the route spec asserts it
as a count with the number examined beside it.

### Decoration

Asserted by the spec in every theme: at least 10 generated boxes found, **0 with any text
content** (a generated string is read out; every one here is `content: ''`), **0 that take the
pointer**. None is animated. Every one sits in a padding band no control occupies.

## Performance

Not measured, and the reason is that there is little to measure: no blur, no filter, no
animation. The Plate adds up to three box-shadows per control and a few gradient layers per
plate, which Chromium paints like the bevels the dark theme already draws. The one cost worth a
reading on a school desktop is the class list, where every row stays as it is and only the open
row gains a fill. Round 1's GPU caveat (none here) applies.

## What adopting it would take (not done)

- Block 1 of `plate.css` (the shared lengths) onto `:root`; block 2 (colours and materials) into
  `colors.css` for IDEA and into `matrix.css` and `space-white.css`; block 3 (the rules) onto
  the real component rules. Every selector starts at `.pl-after` so the move is mechanical.
- The cuts stay behind `@supports (corner-shape: bevel)`; Safari and Firefox keep today's radii.
- `ClassroomShell`'s tools read `--radius-card` today, not `--radius-control` (round 1's note);
  the Plate works around it by setting the cut directly on those controls.
- `space-white.css`'s header says "NO GLOW AND NO BLUR ANYWHERE" and its elevation tokens are
  flat; the Plate's soft shadows are a change to that sentence, which is what Sci-Fi Line asks
  for.
- The 11px label floor touches every mono label class in the classroom (the list is in
  `plate.css`), so the adopting bundle re-measures every surface they sit on at 375 for wraps.
  The class list's meta line needed tighter tracking (0.04em) to stop wrapping every fact onto
  its own line at 375.
- Measure every adopted surface at 375 and 1440 and on the wall, in all three themes, and re-run
  the box diff.

## Not verified

- No real projector, no school desktop, no GPU: wall figures are the model's.
- Safari, Firefox, iOS: they do not draw `corner-shape` yet, so they would keep today's shapes;
  the fallback is reasoned from the `@supports` gate, not rendered there.
- Fonts are the fallback stack for anything from Google Fonts (the harness blocks it); Rajdhani
  and Share Tech Mono are local and are what was measured.
- Hover was not measured (the hover ink is decision 40 item 1's, unchanged here).
- Matrix's rain was running during every Matrix measurement and is visible around the plate; no
  text sits over it (every label is on an opaque plate or panel), which was checked by the
  contrast walk reaching an opaque ground for every row.

## Files

- `src/routes/dev/themes-shape/plate.css`: the whole proposal, three blocks as described.
- `src/routes/dev/themes-shape/PlateView.svelte`: the specimens, each written once.
- `src/routes/dev/themes-shape/+page.svelte`: the theme switcher and the view switch (Plate is
  the default; round 1's views are kept).
- `tools/browser-verify/routes/_themes-shape-plate.mjs` and the three specs it feeds, with their
  files in `tools/browser-verify/measured/`.
- `tools/browser-verify/routes/_themes-shape-plate-pixels.mjs`: the box diff, focus rings, cut
  borders, label sizes, press tests and screenshots (`--shots <dir>` reproduces every picture
  beside this note).
- `docs/reference/space-white/`: the ten references, **removed from the tree by ledger 0345** (none
  of them are ours; git history still holds them). `scifi-line-6-knob-light.png` was
  byte-identical to `scifi-line-1-overview.png` in the zip as delivered.
- Round 1's spec now names its own view (`themes-shape-state-space-white-view-two.mjs`), since
  Plate became the page's default.

## Three questions for Mr. Pina, each with the default taken

1. **Approve the Plate for all three themes, or for Space White first?** Default: all three at
   once, because the whole point is that a control is in the same place and the same shape
   whichever theme a student picks, and adopting it in one theme first breaks exactly that for
   the weeks in between.
2. **Should the open row in a list be a solid green fill (the reference) or today's quiet
   surface with a green rule?** Default: solid fill, as drawn. It is the most visible thing on a
   projector, and it clears every floor, but it is also the tightest figure on the wall (4.65:1
   for the title in IDEA).
3. **Decoration density: keep the screws, hatches and brackets as drawn, or halve them?**
   Default: as drawn on panels and the header, which is where they read as a machined console;
   if it feels busy on a full class list, the first thing to drop is the hatch block on each
   card, which is the most repeated.
