# Space White shape language: a mockup for decision 40 item 4

Ledger 0298, Tier F, written overnight on 2026-09-25 for Mr. Pina to approve or reject.
**A proposal, not a change: nothing here reaches a real page.** Every figure below was
measured in the harness Chromium (141) at 375px and 1440px, on this branch's tree.

## What to look at

- **The screenshots beside this note**, because a `/dev` page answers 404 on the live site
  and on a Vercel preview:
  - `shapes-1440.png` and `shapes-375.png`: the whole mockup, two-corner cut (recommended).
  - `shapes-1440-four.png`: the same page with the four-corner cut.
  - `shapes-glass-1440.png` and `shapes-glass-375.png`: the frosted class menu (desktop) and
    frosted Menu panel (phone), open over a dark slide. On the phone the panel's buttons and
    its class list each keep their own solid fill, so the frost shows only in the gaps between
    them (see Glass below).
- **The page itself**: `/dev/themes-shape?state=space-white` on a local `npm run dev`
  (`?cut=four` or the toggle for the other cut).
- **How to read a pair.** Each "before" is today's Space White: the site's real `.btn`,
  `.card`, classroom chips and the real classroom header component. Each "after" is the
  identical markup inside a wrapper that changes the shape tokens and nothing else, so any
  difference comes from the proposal, not from a redrawing.

## The proposal in five lines

1. **Controls and cards get cut corners.** Recommended: two opposite corners (top left and
   bottom right), 8px on a 44px control and 12px on a card. The alternative is all four
   corners (6px and 10px), the octagon of the IDEA emblem plate.
2. **Chips become hexagonal tags** in both options. A two-corner cut on a chip was tried
   first and rejected: it turned the chip into a slant whose edge ran through the letters.
3. **Glass only on things that float over the page**: the class menu on a desktop and the
   Menu panel on a phone. The classroom header does not stay at the top of the page today, so
   nothing ever scrolls under it and glass there would look exactly like solid. (The mockup
   frosts a header held at the top of a scrolling box only so the effect can be seen.) On a
   phone the frost barely shows: every button in the Menu panel and the class list inside it
   has its own solid fill, so only the gaps between them are glass.
4. **Only Space White, only where the browser can draw it.** The tokens are declared under
   Space White inside a check for real corner-shape support. IDEA and Matrix never see them;
   Safari and Firefox (no support yet) keep today's look rather than a half-applied one.
5. **No colour moves.** Every text and boundary colour is today's.

## Why a real corner shape and not the clip the logo uses

The logo window and the home stats plate cut their corners with `clip-path`. That clip also
cuts off everything drawn outside the shape, and a keyboard focus ring is drawn outside.
Measured by focusing each button for real and counting the pixels that change:

| Construction | Focus ring pixels drawn (of ~729 for a full 2px ring) | Border along the cut, against the page |
|---|---|---|
| `clip-path` (the logo's method) | **0** (0%) | **1.00:1** (no line at all) |
| `corner-shape: bevel` (proposed) | 745 (102%), 59 in the cut corner | 5.59:1 (straight edge 5.85:1) |

So the proposal is built on `corner-shape`, which draws the border, the fill and the focus
ring along the cut. It is also why the shapes are tokens (`--shape-corner`, `--shape-chip`,
`--radius-control`, `--radius-card`) rather than a polygon per element.

## Measurements

**Text, before and after** (160 measurements, 0 outside threshold, `verify:browser`,
`tools/browser-verify/routes/themes-shape-state-space-white.mjs`). No ratio moved, as expected
with no colour change. Worst of each, monitor (WCAG) and wall (`PROJECTOR_MODEL`: a 300:1
projector with 10% ambient light):

| Element | Monitor | Wall | Wall floor |
|---|---|---|---|
| Primary button label (green) | 5.21:1 | 4.20 | 3.0 |
| Status chip (Draft, amber) | 6.40:1 | 4.89 | 3.0 |
| Kind chip (Assignment) | 8.62:1 | 6.00 | 3.0 |
| Card title and body | 17.77:1 | 9.56 | 4.5 |
| Header labels | 16.49:1 | 8.90 | 3.0 |

**Boundaries along the cut** (pixel readback of the rendered frame; the darkest pixel on each
row of the cut, against the page ground):

| Edge | Straight edge | Along the cut | Wall, straight / cut (floor 2.0) |
|---|---|---|---|
| Card (`--boundary`) | 3.65:1 | 3.54:1 | 3.17 / 3.09 |
| Secondary button | 5.85:1 | 5.59:1 | 4.58 / 4.42 |
| Primary button (green) | 5.21:1 | 4.98:1 | 4.20 / 4.05 |
| Header tool | 4.11:1 | 4.00:1 | 3.55 / 3.47 |

Today's 4px rounded card corner already has a lighter anti-aliased pixel (worst 1.76:1) that
the cut does not: a 45-degree line keeps more of its colour than a small curve.

**Tap targets.** Every control 44px or more in both columns and in the after header (smallest
44x44; 0 of 10 header controls under 44 at 1440, 0 of 5 at 375, where the rest fold into the
Menu). A press 2px inside a cut corner lands on the page,
not the control: the cut removes 2 x 32 px² from a 104x44 button (about 1.4% of its area) and
the 44px height through the middle is untouched.

**Chip letters against the chip's own edge.** 0 pixels where the edge crosses a letter, nearest
gap 4px, for both chips after (5px and 4px before). The control, the rejected two-corner chip
at today's padding, measured 16 crossing pixels and a 0px gap, so the zero is a real reading.

**Glass.** The tint is `--surface-1` at 82% with a 12px blur. The worst ground a real page can
put under it is a dark island (a projected deck, the IdeaCAD viewport), so the tint is sized
for pure black:

| | Monitor | Wall |
|---|---|---|
| Body text (`--text-1`, the class names) on the tint over pure black (the floor) | 11.64:1 | 6.43 |
| Class codes (`--text-2`, the lightest ink in the menu) on the tint over pure black (the floor) | 6.37:1 | 4.52 |
| Menu labels on the rendered glass, darkest ground pixel, desktop (6 of 8 labels are on the glass; the current class sits on its own solid highlight) | 7.51:1 | 5.27 |
| Menu labels at phone width: all 5 measured sit on a SOLID fill (the class list keeps its own `--surface-1`), so this is not a glass figure | 9.02:1 | 6.26 |

**The class codes are the tight one.** On the worst ground a page can put under the menu they
clear the wall's body-text floor (4.5) by 0.02, and the muted-text floor (3.0) comfortably. A
lighter tint than 82%, or a lighter ink for the codes, would fail the body floor there. (An
earlier version of this note quoted only the `--text-1` floor, 11.64:1, which is not the
floor of the lightest label the menu actually has.)

It is off, and solid, wherever `backdrop-filter` is unsupported, the person asked the system for
reduced transparency, or asked for more contrast. The last two were read back in the harness,
both directions: with neither preference both the header and the menu compute
`blur(12px) saturate(1.2)` and the menu's fill is the 82% tint; with reduced transparency
emulated, or with more contrast emulated, both compute `none` and the menu's fill is the solid
`--surface-1` (`rgb(247, 249, 249)`). An engine that does not recognise
`prefers-reduced-transparency` evaluates that query as false and keeps the solid fill, which is
the safe direction; that was reasoned, not rendered. One construction rule came out of building it:
**the blur sits on a `::before`, never on the header itself.** A frosted element becomes the
backdrop root of everything inside it, so a menu nested in a frosted header would blur only the
header's own paint.

## Performance, honestly

- **The blur costs real compositor time when nothing is accelerating it.** This Chromium has no
  GPU, which is also what Chrome does on an old desktop whose graphics driver it has blocklisted.
  Scrolling work under the frosted header with the class menu open, the compositor's own draw
  (`DirectRenderer::DrawFrame`, traced over 180 frames, four runs) took **7.1 to 8.4 ms per
  frame with glass against 1.9 to 2.8 ms without**, roughly three to four times as much. Both
  still fit a 16.7ms frame here, and the page's own frame rate did not move (175 frames at
  16.67ms either way), but that margin is what a slower CPU spends first.
- **That figure is the mockup's, not the proposal's.** It frosts the header AND the menu; the
  proposal frosts the menu only. Measured with the header's frost taken off and the menu's
  left on (one run): **3.7 ms per frame, against 2.0 ms with no glass and 7.3 ms with both**
  in the same run, so about twice the no-glass cost rather than three to four times.
- **With a working GPU the same blur is a few shader passes over a strip about 1170 x 70 px
  plus a 240 x 250 menu**, which is small. Not measured: no container here has a GPU, and nobody
  ran it on a school desktop.
- **Corner shapes cost nothing measurable.** They are drawn the way rounded corners already are.
- **So glass stays small by rule**: menus and panels only, never a full-screen scrim, never one
  frosted surface inside another.

## What adopting it would take (not done, and not tonight's to do)

- **Tokens in `space-white.css`**, inside `@supports (corner-shape: bevel)`, and
  `corner-shape: var(--shape-corner)` beside the 335 `border-radius` lines that read
  `--radius-control`, `--radius-card` or `--radius-chip` (counted on this tree), where the
  surface is in Space White's scope. The 823 literal radii (pills, circles, one-offs) are
  untouched, which is right: a circle with a bevel becomes a diamond, and an avatar must not.
- **The two-corner cut must be a corner shape (`bevel square`), never a two-value radius.** Sites
  compose the tokens into longer shorthands (`border-radius: var(--radius-card) var(--radius-card)
  0 0` in AppLauncher and ReferenceDoc); an `8px 0` token turns those into six values and the whole
  declaration is dropped with nothing reported.
- **The classroom header's controls read `--radius-card`**, not `--radius-control`, today. The
  mockup works around it; adoption would move those rules.
- **Two sentences would change**: `space-white.css`'s header says "NO GLOW AND NO BLUR ANYWHERE",
  and CLAUDE.md's Space White bullets describe the theme's character. Glass is a reversal of the
  first, which is exactly what decision 40 asked to explore.
- **Decision 14, restated in 19** ("one radius scale shared with the classroom") is kept: the
  notebook paints the site theme, so a Space White token change reaches the classroom and the
  notebook together. The triage read it as a conflict; it is not one.
- **Measure every adopted surface** at 375 and 1440 and under the projector model, as here.

## Not verified

- No real projector, no school desktop, no GPU: the wall figures are the model's, the frame cost
  is software compositing.
- Safari, Firefox and iOS: they do not draw `corner-shape` yet, so they would keep today's look;
  that fallback was reasoned from the `@supports` gate, not rendered in those browsers.
- Hover and pressed states under the new shapes (the green hover is decision 40 item 1, another
  lane tonight). Fonts are the fallback stack (the harness blocks Google Fonts).

## Files

- `src/routes/dev/themes-shape/` (the mockup; `shape.css` is the whole proposal, written so
  adopting it is a move rather than a rewrite)
- `tools/browser-verify/routes/themes-shape-state-space-white.mjs` and its measured file
- `tools/browser-verify/_themes-shape-pixels.mjs` (the focus ring, the cut, the chip letters,
  the glass ground, the glass gate and the frame cost; `node tools/browser-verify/_themes-shape-pixels.mjs
  --shots <dir>` reproduces every pixel figure and the screenshots)

## The decision

**Approve the two-corner cut, the four-corner cut, or neither, for Space White only; and say
yes or no to glass on menus and floating panels.**
