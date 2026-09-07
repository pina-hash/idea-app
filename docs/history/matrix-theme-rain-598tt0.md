---
title: "The Matrix theme gets its rain and loses its tint: a canvas of falling glyphs inside .bg-fx, a low-saturation repaint, and the landing page made to show it (`claude/matrix-theme-rain-598tt0`, no migration)"
date: 2026-09-06
branches: [claude/matrix-theme-rain-598tt0]
migrations: []
subsystems: ["Design system", "Portal shell", "Browser harness", "tests"]
---

Prompt 0090. No migration. Mr. Pina looked at the Matrix theme prompt 0049 built and
reported two things: it tints everything an unpleasant green, and there are no falling
letters anywhere. Both were true, both are measured below, and both are fixed. The rain
did not exist and was built; the tint was one hue at one saturation and is now restraint.

## The base

Started from `origin/main` at `e06ed581b068741a765cb649ccbf9ea022de245b`, working
directory `/home/user/idea-app`, on the harness-minted branch
`claude/matrix-theme-rain-598tt0`. Git already carried a committer identity
(`Claude <noreply@anthropic.com>`), so the "Please tell me who you are" failure the
prompt warns about did not arise and nothing was set. No
`docs/prompt-ledger/entries/0090-*` existed at HEAD; the highest migration on
`origin/main` was `0189`, as the ledger text says. The ledger entry was the first
commit, pushed alone (`b8a302d`).

A fresh checkout: `npm ci`, then `npx svelte-kit sync` with the two `PUBLIC_SUPABASE_*`
placeholders exported (the missing-`.env` phantom-error trap). Baseline
`npx svelte-check` at 14:29 PDT: **0 errors, 37 warnings**, breakdown **31
`state_referenced_locally` / 5 `css_unused_selector` / 1 `perf_avoid_nested_class`**.

## A1: what the theme painted, layer by layer, and what a person saw

`matrix.css` was 224 lines: one `:root[data-theme='matrix']` block of eighteen token
values, one `.bg-fx` rule, one gated animation, one keyframes block, and a measured
table in a comment. The `.bg-fx` rule painted four layers, bottom to top:

1. a `repeating-linear-gradient(to bottom, rgba(0,255,65,0.13) 0, rgba(0,255,65,0) 90px,
   rgba(0,255,65,0) 220px)` on a **17px x 220px** tile, repeated -- a horizontal band
   every 220px, fading over its first 90px;
2. a `repeating-linear-gradient(to right, ...)` drawing a **1px** line at 5.5% alpha every
   **17px**, repeated across -- a vertical hairline grid;
3. a radial wash at 50% -10% at 7%;
4. a radial wash at 50% 120% at 4%.

The animation, verbatim:

```css
@media (prefers-reduced-motion: no-preference) {
	:root[data-theme='matrix'] .bg-fx {
		animation: matrix-rain 7s linear infinite;
	}
}

@keyframes matrix-rain {
	from { background-position: 0 0, 0 0, 0 0, 0 0; }
	to   { background-position: 0 220px, 0 0, 0 0, 0 0; }
}
```

**There is no glyph anywhere in the file**: no `content`, no text, no canvas, no SVG, no
image. Confirmed by reading it end to end and by grep. And because every column's
"streak" started at the same `background-position`, layer 1 did not read as columns at
all.

**What a person saw**, from screenshots of `/dev/themes?state=matrix` and
`/dev/maps-viewer` at 1440 and 375: a near-black page with **broad horizontal green
bands sliding slowly downward**, like venetian blinds or a stage curtain, crossed by a
faint vertical hairline grid, with a green glow at the top edge. Every word on the page
was the same mint green. No letters fell; nothing changed as it moved. On the maps
harness, whose lower half is empty, the bands were the whole picture. At 375 the same,
narrower.

**And on the home page, nothing at all.** `/` is wrapped in
`.legacy-index.surface-machined` (`position: relative; z-index: 1;
background-color: var(--bg0)`), an opaque plate ABOVE `.bg-fx`, with its own particle
starfield in `#bg-canvas`. Screenshotted on the home harness with the theme on: stars,
mint text, and no part of `.bg-fx` visible anywhere. That is what "there are no falling
letters anywhere" looked like from the code -- on the page every student opens, the
theme's one moving layer was behind a wall.

## A2: the tint, in numbers

Per-pixel statistics over viewport screenshots (`pngjs`; "dark" is V < 8%, "lit-neutral"
is lit at S < 12%, "green" is hue 70-170deg, "other" is any other hue):

| surface | width | palette | dark | lit-neutral | green | other hue | mean S of lit px |
| --- | --- | --- | --- | --- | --- | --- | --- |
| launcher harness | 1440 | base | 6.5% | 1.7% | 89.4% | 2.3% | 0.337 |
| launcher harness | 1440 | matrix (0049) | 43.9% | **0.0%** | 55.0% | 1.1% | **0.784** |
| launcher harness | 375 | base | 0.0% | 2.2% | 91.0% | 6.8% | 0.339 |
| launcher harness | 375 | matrix (0049) | 51.1% | **0.0%** | 45.5% | 3.4% | **0.785** |
| classroom item | 1440 | base | 83.0% | 3.4% | 10.8% | 2.8% | 0.211 |
| classroom item | 1440 | matrix (0049) | 83.3% | 0.3% | 14.4% | 2.0% | **0.479** |
| maps viewer | 1440 | base | 7.8% | 0.9% | 91.3% | 0.0% | 0.318 |
| maps viewer | 1440 | matrix (0049) | 65.6% | 0.1% | 34.3% | 0.0% | **0.827** |

The base palette is ALSO green by hue -- the plate is dark green -- so "what fraction is
green" is not the objection. The objection is the last two columns: under the theme
**0.0% of lit pixels were neutral** and their **mean saturation went from 0.34 to 0.78**.
Every lit thing on screen -- body text, meta, borders, cards -- was one hue at one
saturation, and the grounds beneath were so close to black (a card on the page at
1.05:1) that nothing stepped. A page with one hue at one saturation and no steps has no
depth and no focus, which is exactly what was happening. (The classroom reading at 375
was discarded: the forced attribute was removed by `ThemeRoot`'s own effect after the
check and the "themed" screenshot was the base palette; the 1440 reading was taken with
a stickier force and is the one in the table.)

The responsible tokens: `--white` at `#caf0cb` (hsl 122 56% 87%), `--text-1` `#ccf5cc`,
`--text-2` `#7fb883`, `--dim` `#5e9a60` (24%), `--ice` `#91c492` (30%), `--gear`
`#568c58` (24%), `--boundary` `#5f8a63`, and grounds `#040804` / `#081108` / `#0d1a0d`
that step 1.05 and 1.23 against the page where the base steps 1.18 and 1.51.

## A3: where a rain layer can live, and what each mechanism costs

`.bg-fx` is mounted **once**, `src/routes/+layout.svelte:74`, so every page route
inherits it. It is NOT on every themed page, in two different ways:

- **suppressed** (`display: none`): `body:has(.cr-root)` (classroom.css:71),
  `body:has(.nb-root)` (notebook-theme.css:186), `body:has(.fg-root)` (forge.css:171),
  `body:has(.tv.fixed)` (TvStage.svelte:378), and `@media print` on
  `/reference/[itemId]`;
- **covered** by an opaque room root above it: `.legacy-index.surface-machined` on `/`
  and `/archive`, and `.frc-root`, `.gt-root`, `.glb`, `.tnm-root`, `.fsp-root`.

So a rain layer inside `.bg-fx` is visible on the shell pages (the launcher harness,
`/maps` signed in, `/admin`, `/dashboard`, `/coin-desk`, `/assignments/*`, every `/dev`
route) and NOT on `/` unless something changes about the plate. The rooms are the rooms
-- each paints its own opaque ground on purpose, and the prior bundle's "not touched"
list argues why a theme stays out of them -- but `/` is the shell's own front door, and
a theme whose rain is behind a wall there is a theme with no rain. That is the second
and third non-token rule in `matrix.css` (see "What was built").

**The cost of each mechanism**, measured on this container's Chromium 141 with software
raster (`--disable-gpu`, which is what the harness launches with; the school desktops
have GPUs and every number below is a CPU-only upper bound). Each prototype was a
full-viewport field of ~16px glyph columns with per-column speeds and glyph mutation,
driven for 3s; "main-thread" is CDP `TaskDuration` per second of wall time:

| at 1440x900 | rAF fps | frame p95 | main-thread ms/s | of which script | notes |
| --- | --- | --- | --- | --- | --- |
| the real page, theme OFF | 60 | 16.7ms | 60 | 2 | baseline |
| the real page, the 0049 hatch | 60 | 16.8ms | 65 | 1 | +5 ms/s |
| canvas 2D prototype | 60 | 16.7ms | 153 | 13 | own draw 61ms / 3000ms |
| DOM/CSS columns prototype | 60 | 16.8ms | 134 | 6 | style 28 + layout 23 from mutation |
| SVG prototype | 60 | 16.8ms | 189 | 6 | style 21 + layout 26 |
| WebGL prototype | **34.5** | 33.4ms | **998** | 2 | SwiftShader (software GL) |

| at 375x667 | rAF fps | main-thread ms/s | of which script |
| --- | --- | --- | --- |
| theme OFF / the hatch | 60 / 60 | 61 / 66 | 2 / 1 |
| canvas 2D | 60 | **46** | 13 |
| DOM/CSS | 60 | 48 | 4 |
| SVG | 60 | 65 | 4 |
| WebGL | 60 | 360 | 5 |

WebGL could not be measured fairly: the renderer string is `ANGLE (Google, Vulkan 1.3.0
(SwiftShader Device (Subzero)))`, a software rasteriser, so its 998 ms/s says nothing
about a real GPU, where it would likely be the cheapest of the four. It was not built
past a point-sprite field. **Canvas 2D was chosen**: cheapest at 375, within 19 ms/s of
the cheapest at 1440, ONE element, zero style and layout cost (a glyph mutation is a
`drawImage`, where in the DOM or SVG it is a relayout), and it draws behind everything by
construction.

## A4: the reduced-motion contract, before and after

Before: the gate was `@media (prefers-reduced-motion: no-preference)` around the CSS
animation, declared inside the query rather than declared and cancelled, so under
`reduce` `animation-name` computed to `none` and the still was the running picture with
the bands parked. That was a legitimate still of a hatch. A still of REAL rain has to be
a frozen field of glyphs -- heads and fading tails parked mid-fall -- and a blank ground
would be a regression. That is what `drawStill` paints (B3).

## A5: what must not move

Read out of `AppLauncher.svelte`. Nine `[data-app]` rules declare a pair; the shared
default is `--acc-primary: var(--gold)` (`#c8a848`) / `--acc-secondary: var(--green)`
(`#78b870`). **There is no colour field on `PortalApp` or in `site-manifest.ts`**
(prompt 0077's correction stands; `portal-apps.ts:33` says so in words); the accents live
only in the launcher's stylesheet rules.

| card | `--acc-primary` | `--acc-secondary` |
| --- | --- | --- |
| gauntlet | `#00ff41` | `#00f0ff` |
| vanguard | `#00ff41` | `#c8ff00` |
| greenline | `#2ae57e` | `#cfdae2` |
| coins | `#c8ff00` | `#00f0ff` |
| tournaments | `#0fbe7a` | `#e0ac4e` |
| foundry | `#f6952f` | `#c65a1d` |
| maps | `#40e3b1` | `var(--gold)` |
| frc | `#ed1c24` | `#0066b3` (plus `--acc-ink: hsl(357.7 85.3% 68%)`) |
| dashboard, admin | `#78b870` | `#5abda8` |
| classroom, notebook, coin-desk | default | default |

The semantic colours, from `colors.css`: `--green #78b870`, `--gold #c8a848`, `--cyan
#5abda8`, `--amber #d08030`, `--teal #3ea368`, `--violet #7050a8`, `--violet-ink
#a08ac7`, `--crimson #d95f5f`. None of these is declared by the theme, before or after.

## A6: the counts block

`npm run verify:counts -- --check`: the static region agrees with the tree (133 specs
over 64 routes, 92 `/dev` pages, 266 runs). The measured region's `covered` array holds
**133** entries against **133** spec files on disk, none missing in either direction;
`outside` is **2**, both `/dev/notebook` `tap-reach` rows ("toolbar text controls, under
the floor on width -- decision 12, with the owner") at 375 and 1440. Measured at
`2026-09-06T21:09:40Z` on `79a9faa`, not dirty.

## What was built

- **`src/lib/design-system/themes/matrix-rain.ts`** -- the pure half: constants
  (`RAIN`), the glyph set, columns and their step function, the fade solved both ways,
  the content band, the seeded generator, and the contrast arithmetic (`worstFrame`).
  No DOM, no clock; 19 tests in `tests/theme-rain.test.ts`.
- **`src/lib/MatrixRain.svelte`** -- the painter. Renders no markup; takes `active` and,
  while true, creates a `<canvas>` INSIDE `.bg-fx`, drives it from
  `requestAnimationFrame` painting on every other frame, holds a seeded still under
  `prefers-reduced-motion: reduce`, degrades under slow frames, and removes the canvas on
  teardown. 10 tests in `tests/dom/theme-rain-mount.svelte.test.ts` through the real
  component with `mount()`.
- **`ThemeRoot.svelte`** -- derives the attribute once and mounts
  `<MatrixRain active={attr === 'matrix'} />` from the same value, so the rain is on
  exactly when the attribute is.
- **`matrix.css`** -- the repaint (B2), the `.bg-fx` rule reduced to its two radial
  washes, no animation and no keyframes, and two new non-token rules for the landing
  page: `.legacy-index.surface-machined { background-color: transparent }` and
  `.legacy-index #bg-canvas { display: none }`. `colors.css` and `effects.css` untouched.
- **`src/routes/dev/themes/+page.svelte`** -- the harness root is a `<main>` now. It was
  an unpositioned `div`, so the fixed `.bg-fx` layer painted OVER the board's cards (a
  positioned z-index-0 layer paints after in-flow blocks), which no shipping page does:
  they mount `main` or a room root at z-index 1. Measured before the fix: glyphs on top of
  the "bg1 cards" row.
- **`tests/theme-tokens.test.ts`** -- the selector rule is a NAMED list of three
  exceptions now, each with its reason and the declarations it may carry, pinned in
  length, every entry required to be used, with a positive control that catches an
  exception that grows. Plus an assertion that no theme file carries `animation` or
  `@keyframes` at all.
- **`tools/browser-verify/routes/themes*.mjs`** -- the themed spec reaches the rain
  through the shipping control and asserts it off the canvas's own `data-motion` /
  `data-frames` (a `waitFor`) and prints its lit-pixel count; the motion row says
  `never` (no CSS animation left on the layer or the canvas); the OFF and signed-out
  specs assert **0** canvases as the negative controls.

### The two landing-page exceptions, and why they are rules and not a workaround

`tests/theme-tokens.test.ts` used to allow exactly one non-root selector, `.bg-fx`. The
rain needed no second one to EXIST -- it lives inside `.bg-fx` -- but it needed one to be
SEEN on `/`, because that page's plate is opaque above the layer. The alternatives were
worse: putting the rain above the plate means putting it above the page's copy; asking
the home page to change means editing `+page.svelte` and `app.css`, which this bundle does
not own; leaving it means the theme rains everywhere but the front door. So the theme
makes the plate's COLOUR transparent (its vignette and brushed textures stay and sit over
the rain as an edge darkening) and switches off the plate's own starfield, because two
particle systems on one ground are noise. Each exception may declare exactly one
property, and the test reddens if either grows.

## B1: the rain

**What it does.** Columns 16px wide, one per column of the viewport (90 at 1440, 24 at
375), each with its own speed between 0.16 and 0.6 rows per frame (about 10 to 36 rows a
second) and its own start. A column's HEAD is drawn from a pre-rendered atlas in
`#d2ffd9`, almost white; the cell it just left is redrawn in the trail green `#1fc35a`
with a NEW glyph; and two cells further up the trail are re-glyphed each advance at the
brightness the trail already has there. The fade is one `destination-out` strip over the
whole canvas per paint (9% of alpha per 60fps frame, so a glyph is at 5% after ~32
frames), which is what makes every glyph decay from the moment it was drawn and makes a
fast column drag a long tail (20 rows) and a slow one a short one (6). A column whose
whole streak has left the bottom restarts above the top at a random delay and a new
speed. The glyphs are digits, capitals and operators, **half of them mirrored** (the
atlas draws the upper half of the index space under `scale(-1, 1)`), and not katakana: a
school desktop with no CJK font would draw tofu.

**The content band.** The canvas is the whole viewport and the page's copy sits on it,
so the rain runs at full brightness only OUTSIDE a centred 1100px band (the landing
page's own measure), with a 48px ramp, and inside it at `contentGain` **0.2**. And
inside the band **no bright head is drawn at all** -- `headColour` answers the trail
colour for any column at the band gain -- because of the measurement below. At 1440 the
vivid margins are the outer ~120px each side; at 1920 about 360px; at 375 the whole
width is the band.

**The worst frame, measured rather than averaged.** For every visible text element whose
ground is the bare page, on the home harness and the theme harness at 1440 and 375, the
brightest canvas pixel under the element's box was composited over the page ground and
the contrast taken, sampled 60 times at 75ms over 150 painted frames, keeping the
minimum. First with bright heads drawn inside the band:

| element | token | bare | worst sampled | analytic (head at 0.2) |
| --- | --- | --- | --- | --- |
| hero title | `--white` | 16.35 | 9.9 | 9.92 |
| harness note | `--text-2` | 8.42 | 5.1 | 5.11 |
| "Your Classes" | `--cyan` | 9.04 | 5.47 | |
| hero subtitle | `--dim` | 6.11 | **3.7** | 3.71 |
| hero eyebrow | `--teal` | 6.47 | **3.92** | |

The brightest pixel found was L=0.0348, the analytic head at gain 0.2 is 0.0347. Body
copy and metadata held; the `--dim` subtitle and the `--teal` eyebrow (a semantic token
this theme never touches) dipped under a head cell, both holding against the trail (4.59
and 4.68). Lowering the gain until `--dim` held under a head (about 0.13) made the rain
under content invisible (head at 1.32:1 against the ground). Drawing the in-band head in
the trail colour instead keeps the whisper and removes the dip. Re-sampled, same method:

| element | token | bare | worst sampled | analytic (trail at 0.2) |
| --- | --- | --- | --- | --- |
| hero title | `--white` | 16.35 | **12.28** | 12.28 |
| harness note | `--text-2` | 8.42 | **6.33** | 6.33 |
| "Your Classes", "Apps" | `--cyan` | 9.04 | **6.79** | |
| hero subtitle, "Comfortable view" | `--dim` | 6.11 | **4.59** | 4.59 |
| hero eyebrow | `--teal` | 6.47 | **4.86** | |

Brightest pixel L=0.0183 against the analytic trail 0.0184. Every text role measured on
the bare ground clears 4.5:1 at every sampled frame, at both widths, on both surfaces.
`tests/theme-rain.test.ts` computes the same table from the theme's own hexes and the
module's constants and asserts it, with a positive control that the same tiers FAIL at
gain 1 -- which is what makes the band load-bearing.

**What it costs.** On the real pages, painting on every other animation frame (the film
is 24fps; a glyph advance is a discrete step; only the fade is continuous and its step is
invisible at either rate), CDP `TaskDuration` per second of wall time, software raster:

| page | width | theme OFF | theme ON | rain's share | loop script |
| --- | --- | --- | --- | --- | --- |
| `/dev/themes` | 1440 | 69 | 166 | **+97 ms/s** | 10 |
| `/dev/themes` | 375 | 64 | 83 | **+19 ms/s** | 5 |
| home harness | 1440 | 185 | 202 | **+17 ms/s** | 20 |
| home harness | 375 | 142 | 124 | **-18 ms/s** | 16 |

The page's own `requestAnimationFrame` loop stays at **60 fps** (p95 16.7ms) in every
themed reading; the rain paints at 30. Painting on every frame cost 292 ms/s at 1440,
which is why it does not. On the home page the rain REPLACES the starfield, which also
costs main thread, so the theme's net cost there is +17 ms/s at 1440 and it is cheaper
than the base page at 375.

**A device that cannot keep up.** Frame intervals are watched; 90 consecutive frames over
34ms (1.5s under 30fps) halve the rate to painting every fourth frame (`data-motion`
`half`), and 90 more park the field as a still and stop the loop (`still-slow`). A gap
over 250ms -- a tab that was hidden -- is not counted. Both paths are exercised in the
DOM test by pumping 50ms frames; nothing in this container is slow enough to reach them
for real.

## B2: the tint

The rule the theme obeys did not change: identity and semantic colours untouched, the
four unowned tiers luminance-held. What changed is restraint. The text tiers went from
24-56% saturation to **12-21%**, phosphor-tinted near-neutrals; the grounds kept the green
cast and stepped more (a card on the page **1.09:1** and the plate **1.36:1**, from 1.05
and 1.23; base 1.18 and 1.51); `--green-tint` and the semantic six are now the only
vivid greens on a page, apart from the rain.

| token | 0049 | now | hsl now |
| --- | --- | --- | --- |
| `--bg0` / `--bg1` / `--bg2` / `--plate` | `#040804` / `#081108` / `#0d1a0d` / `#132313` | `#030503` / `#0c140d` / `#111911` / `#1b2a1c` | |
| `--surface-0/1/2` | `#020502` / `#060e07` / `#0a150b` | `#020402` / `#080e09` / `#0c150d` | |
| `--text-1` | `#ccf5cc` | `#dce8dc` | 120 21% 89% |
| `--text-2` | `#7fb883` | `#8fae94` | 130 16% 62% |
| `--text-3` | `#4a6f4d` | `#4f6853` | |
| `--boundary` | `#5f8a63` | `#64826b` | 134 13% 45% |
| `--green-tint` | `#073a1c` | `#093619` | |
| `--white` (L held) | `#caf0cb` | `#e0e8e0` | 120 15% 89%, L 0.7904 -> 0.7894 (-0.13%) |
| `--dim` (L held) | `#5e9a60` | `#769477` | 122 12% 52%, L 0.2641 -> 0.2636 (-0.18%) |
| `--ice` (L held) | `#91c492` | `#a7bda8` | 123 14% 70%, L 0.4734 -> 0.4744 (+0.20%) |
| `--gear` (L held) | `#568c58` | `#6a876b` | 122 12% 47%, L 0.2143 -> 0.2145 (+0.10%) |

`--dim` on FRC paper 3.34 -> 3.35, on the FRC card 3.06 -> 3.06, `--white` on FSP navy
12.44 -> 12.42: nothing moved in a room the theme never entered.

**The board, measured in Chromium 141 by the harness** (`/dev/themes?state=matrix`,
grounds composited and read back off a canvas), identical at 375 and 1440, and identical
to two decimals with the node workbench the palette was solved on:

| role | bg0 | bg1 | bg2 | surface-0 | surface-1 | surface-2 | plate | green-tint | floor |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `--white` | 16.35 | 14.97 | 14.34 | 16.45 | 15.59 | 14.87 | 12.04 | | 4.5 |
| `--text-1` | 16.18 | 14.82 | 14.19 | 16.28 | 15.43 | 14.72 | 11.92 | 10.70 | 4.5 |
| `--text-2` | 8.42 | 7.71 | 7.39 | 8.47 | 8.03 | 7.66 | 6.20 | 5.57 | 4.5 |
| `--ice` | 10.21 | 9.35 | 8.96 | 10.27 | 9.74 | 9.29 | | | 4.5 |
| `--dim` | 6.11 | 5.59 | 5.36 | 6.14 | 5.82 | 5.56 | | | 4.5 |
| `--gear` | 5.15 | 4.72 | **4.52** | 5.18 | 4.91 | 4.69 | | | 4.5 |
| `--boundary` | 4.82 | 4.41 | 4.22 | 4.85 | 4.59 | 4.38 | | **3.18** | 3 |
| `--text-3` | 3.35 | 3.07 | 2.94 | 3.37 | 3.19 | 3.05 | | | decorative |

**All 54 cells clear their floor and not one is below the base palette's value**; the
three that clear a floor the base misses (`--gear` on `--bg2` 3.57, `--dim` on `--bg2`
4.24, `--boundary` on `--green-tint` 2.86) still do. The worst text cell is `--gear` on
`--bg2` at 4.52 and the worst boundary 3.18, both at the margin because `--gear` and
`--dim` cannot move in luminance and `--bg2` is as light as it can be under them.

**Positive control.** `--acc-primary: #00ff41;` appended to the theme's root block: TWO
tests reddened, both naming `matrix.css: --acc-primary` ("the token files are not edited
by a theme" and "no theme declares an identity or a semantic token"). Restored from a `cp`
copy; md5 `41701696cb30c57480eaad92304f94a1` before and after.

## B3: reduced motion, in a real browser

Chromium's emulation flipped mid-session on the home harness and the theme harness, at
1440 and 375:

- **running**: `data-motion` `running`, `data-frames` advancing (120 at the read), 1.14
  to 1.23% of the field lit, **0** CSS animations on the layer or the canvas;
- **reduce**: `data-motion` `reduced`, `data-frames` **120 -> 120** over 1.5s (no frame
  scheduled), the field **painted** -- 1.77% lit at 1440 and 2.06% at 375, mean alpha of
  a lit pixel 0.144 / 0.088 -- and the canvas's alpha data hashed **identical** 1.5s
  apart (a screenshot pair on the home harness differed once; the canvas did not, so it
  was something else on that harness);
- **back to no-preference**: `running`, frames advancing again (180 at the read);
- **hidden tab** (another page brought to front): frames 180 -> 180 over 1.5s; visible
  again, `running`, 210.

**In plain words, the still**: the same near-black page, with the rain frozen mid-fall
-- in the margins, bright leading glyphs each with a green tail fading up behind it, a
few dozen streaks parked at different heights; under the copy, the same field as a faint
whisper. It is the running picture with the clock stopped, seeded so a reload shows the
same picture, and nothing on it is hidden.

## B4: the clean-off guarantee

Through the shipping ProfileMenu control at both widths, every click landing on the
first attempt: **136** `:root` custom properties read (every `--name` any `:root` rule
declares); **22** move when the theme goes on; **0** differ between a session that never
turned it on and one that turned it on and off again. `<html>` after: `lang=en` and
nothing else. `localStorage['idea_site_theme']` null, canvases in `.bg-fx` **0**, body
background back to `rgb(18, 26, 18)`.

## B5: browser proof on the surfaces

Four surfaces, two widths, themed and unthemed; worst ratio per selector over every
match, no horizontal scroll on any of the sixteen readings, no page error:

| surface | width | palette | worst per selector | launcher |
| --- | --- | --- | --- | --- |
| launcher harness | 375, 1440 | base | h1 14.22, h2 6.91, p 6.91, card CTA (13) 5.04, launcher buttons 5.31, switch 6.00 | 13 cards, **10** distinct accent pairs |
| launcher harness | 375, 1440 | matrix | h1 16.35, h2 8.42, p 8.42, card CTA (13) 6.25, launcher buttons 6.11, switch 7.59 | 13 cards, **10** distinct accent pairs |
| home harness | 375, 1440 | base | h1 14.22, hero-sub 5.31, eyebrow 5.62, year label 7.85, feed rows (3) 12.09, a (23) 5.31 | |
| home harness | 375, 1440 | matrix | h1 16.35, hero-sub 6.11, eyebrow 6.47, year label 9.04, feed rows (3) 14.97, a (23) 6.11 | rain running |
| classroom item | 375, 1440 | base | h1 15.70, h2 (6) 8.26, p (4) 7.63, a (31) 7.63, button (55) 6.84, li (25) 14.07 | |
| classroom item | 375, 1440 | matrix | h1 16.45, h2 (6) 8.62, p (4) 8.47, a (31) 8.22, button (55) 7.66, li (25) 14.87 | no rain: `.bg-fx` suppressed |
| maps viewer | 375, 1440 | base | h1 10.86, h2 6.91, p (3) 5.31, button 6.84, a (13) 7.52, li 14.66 | |
| maps viewer | 375, 1440 | matrix | h1 12.50, h2 8.42, p (3) 6.11, button 7.66, a (13) 8.66, li 16.18 | |

Every selector holds or improves. The launcher's cards are exactly as tellable apart:
the same **10 distinct (primary, secondary) pairs over 13 cards** themed and unthemed at
both widths, read off the computed custom properties. One `button` on the home harness
reads 1.16 themed and 1.18 unthemed: it is `.pm-trigger`, the avatar button, whose own
computed `color` is the UA black under an image, identical in both palettes and not this
bundle's.

The classroom and maps pages carry no `claims` in their loaders, so their themed
readings were taken with the attribute forced by hand, the force RETRIED against
`ThemeRoot`'s own effect until it had held for 1.2s (2 attempts each time) -- a forced
attribute repaints the tokens but does NOT mount the rain, which is keyed on a session;
the home harness carries claims and got the rain through the real path. Hydration on the
harness runs: `waitForApp` 452-939ms; every scripted press 1 attempt.

**The theme harness spec run** (`npm run verify:browser -- --route themes`): 6
route/width runs, **94 measurements, 0 outside threshold**; the rain `waitFor` satisfied
in 515ms (375) and 516ms (1440); lit pixels 0.71% and 0.90%.

## B6 and B7: counts, suite and check

`npm run verify:counts` found the static region already current (133 specs over 64
routes, 92 `/dev` pages, 266 runs); no spec file was added, three were changed.
`npm run verify:readme` was run once at the end on the clean committed tree, with its
own server on 5199 (the session's dev server sat on 5190), and rewrote the measured
region; its figures are in the README's own data line.

The full suite, run once at the end, from 15:39:23 to 15:43:29 America/Los_Angeles: **313 files, 6331 tests, 0 failures, 244.6s. A first run at 15:34 PDT had 2 failures, both in the migration-apply CLI tests (`tests/apply-migration-guard.test.ts`, `tests/apply-migration-trace.test.ts`) and both with one cause -- the CLI reads the applied set off `origin/integration`, which this fresh container had never fetched; a read-only `git fetch origin integration` and the two files pass (51 tests), and the full re-run is the figure above**.
`npx svelte-check` after `npx svelte-kit sync` with the two `PUBLIC_SUPABASE_*`
placeholders exported: **0 errors, 37 warnings**, breakdown **31 `state_referenced_locally` / 5
`css_unused_selector` / 1 `perf_avoid_nested_class`** -- the baseline, unmoved.

## What a person now sees

Turn it on from the profile menu and the page goes near-black -- a proper black, not the
dark green it was -- with the writing close to white with a faint green cast, and the
things that are meant to be coloured still coloured: the gold school year, the teal
eyebrow, the cyan and green instructor names, each launcher card's own colour on its own
edge. Down both sides of the page, where nothing is written, columns of characters fall:
a bright, almost-white leading glyph with a green tail fading up behind it, some columns
fast and long, some slow and short, the characters flickering to other characters as
they fall, mirrored letters and digits and operators. Behind the writing itself the same
rain is there as a faint green whisper, so the page is read as easily as before. On a
desktop this is the film's look at the edges and a calm page in the middle; on a phone,
where the whole width is writing, it is the whisper only. With reduced motion set it is
the same scene frozen. Turn it off and it is the IDEA plate again, nothing left behind.

**Is it movie accurate?** At the margins, at 1440 and wider, yes as far as a 16px Latin
glyph set can be: the film's characters are half-width katakana and this cannot promise
a font that has them. Under the content and on a phone it is deliberately not -- a
whisper rather than the film -- and that is the price of every text tier holding 4.5:1
at the rain's worst frame, which this bundle chose over a rain nobody could read through.

## What was NOT verified

- **Nothing against the live Supabase project**; no RPC, no migration, no sign-in. The
  session gate was exercised through the harness's own `?signedout=1` and the stored
  preference, exactly as prompt 0049 did.
- **No real production surface.** Every measurement is against `/dev` routes on the local
  dev server; `/` itself was measured through `/dev/home-order`, which mounts the real
  landing page with a harness bar above it.
- **`prefers-reduced-motion: reduce` was Chromium's emulation**, not an OS setting.
- **A GPU.** Every cost figure is software raster in this container; the school
  desktops' GPUs would make the canvas upload cheaper and WebGL measurable. The
  degradation path (half rate, then parked) was reached only in the DOM test by pumping
  50ms frames.
- **Fonts.** The harness blocks every non-loopback request, so the atlas was drawn in the
  fallback monospace, not Share Tech Mono; the component rebuilds the atlas on
  `document.fonts.ready`, which fired with the fallback here.
- **Whether it LOOKS right** is Mr. Pina's check; screenshots were taken and looked at,
  and the plain-words paragraph above is from them, but the judgment is his.

## Deferred, deliberately

- **Katakana.** A font the platform can promise on every school desktop would let the
  glyph set be the film's; today that is a font decision, not a rain decision.
- **The rain in the rooms** (classroom, notebook, Foundry, the projector view). Each
  suppresses `.bg-fx` on purpose and paints its own plate; a theme reaching into them is
  what the prior bundle's "not touched" list refuses, and nothing here changes that.
- **The profile trigger's 1.16:1 `color`** on the home harness -- pre-existing, identical
  unthemed, `ProfileMenu`'s to look at.
- **A second theme.** The mechanism is unchanged: a file plus one `@import`, and the
  exception list is pinned at three with reasons, so a second theme wanting a fourth
  exception has to say why.
