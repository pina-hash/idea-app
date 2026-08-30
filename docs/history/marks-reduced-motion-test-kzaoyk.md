---
title: "Eleven app marks get their first test, and four harnesses stop measuring the wrong room (`claude/marks-reduced-motion-test-kzaoyk`, no migration)"
date: 2026-08-29
branches: [claude/marks-reduced-motion-test-kzaoyk]
migrations: []
subsystems: ["browser-verify harness", "Portal launcher", "Coin Desk", "GAUNTLET", "Classroom"]
---

Two gaps, both of the same kind: a rule written down in `CLAUDE.md` that
nothing measured, and a set of harnesses whose readings had all been taken
against the wrong plate.

**Nothing outside `src/routes/dev/` and `tools/browser-verify/` was touched**,
with one exception noted below (`docs/history/`, this file).

### 1. Eleven marks, none of them ever rendered in a dev route

`src/lib/marks/` holds the per-app glyphs on every launcher card -- Admin,
Classroom, CoinDesk, Coin, Dashboard, Foundry, Gauntlet, Greenline, Notebook,
Tournament, Vanguard. **Verified rather than taken from the brief**: `grep -rn
'marks/' src/routes/dev/` returned nothing, and the only importer of any of
them anywhere in the tree was `src/lib/AppLauncher.svelte`. Every student sees
several of them on the portal home page, which is the first screen they land
on, and not one had ever been driven.

The rule they have to satisfy is stated three times in `CLAUDE.md` and is not
identical in any two of them. The narrowest and strongest is the one under the
launcher-card section:

> Every other app mark is a component in `$lib/marks` with a 3-4.6s loop gated
> behind `prefers-reduced-motion: no-preference`, and **nothing is hidden in a
> base state**: with the animation cancelled every animated element is at full
> opacity and no transform, so a reduced-motion reader sees the whole glyph.

The other two are "Everything animated is gated behind
`prefers-reduced-motion`" and, one line earlier, AnimatedLogo's "Its spin is
gated behind `prefers-reduced-motion: no-preference`". The FRC exception is the
other direction, in the same section: "THE FRC MARK IS NEVER ANIMATED, and that
outranks matching the cards either side of it. FIRST's brand guidelines
prohibit altering the mark, and motion is an alteration."

**The FRC mark is not in `src/lib/marks/`.** It is
`src/lib/frc/assets/frc-icon.png`, mounted as an `<img>` by `AppLauncher`'s own
`appIcon` snippet, and its rule lives in `CLAUDE.md`'s launcher section rather
than anywhere near the image. It is asserted in the same place the others are.

#### `/dev/marks` -- one route, not eleven

All twelve glyphs on one page, each in a `figure[data-mark]` cell, mounted at
the launcher's own 34px icon size AND at 96px for reading. **One route is a
runtime decision and it is stated in the file**: the pass is ~58 route/width
runs, and eleven routes would have bought eleven separate page loads for
measurements that share one. `data-mark` keeps the reporting per-mark anyway --
the spec names one selector per glyph, so a failure says which mark, and the
check's own rows say which element inside it.

The page carries **no room wrapper, deliberately**: `AppLauncher` mounts on the
portal home page, which has no scoped theme, and the marks read `currentColor`
and `var(--gold)` -- both of which resolve differently inside `.gt-root` or
`.nb-root`.

#### `motion` -- the new check, and why the cancelled state is the hard half

A test that measures the animation RUNNING proves nothing about what a
reduced-motion reader sees. `motionSweep` in `tools/browser-verify/checks.mjs`
flips Chromium's own emulation of the media feature and reads the SAME elements
twice:

- **RUNNING** (`no-preference`) discovers which elements animate at all.
- **REDUCED** re-reads exactly those. Each must have no animation attached,
  `animation-name: none`, `transform: none`, and must still be painted.

Four decisions inside it are load-bearing:

- **The running set is the POSITIVE CONTROL.** An `expect: 'gated'` entry that
  finds NOTHING to animate FAILS. A sweep with an empty case list satisfies
  "nothing moves under reduce" perfectly, and that is exactly the shape a
  renamed class silently produces. One of the five negative controls is this
  case.
- **Discovery is `Element.getAnimations()`, not a walk of
  `document.styleSheets`.** The stylesheet walk is the worse instrument for a
  reason `CLAUDE.md` already names: `CSSStyleRule` has a `cssRules` property now
  (CSS Nesting) and an empty `CSSRuleList` is truthy, so the ordinary shape for
  walking a sheet skips every plain rule's declarations and comes back with zero
  matches -- which reads exactly like a clean result. Asking the element what is
  attached to it has no selector to fail to parse, and it reports an
  `animation-play-state: paused` animation too (`FoundryMark` pauses rather than
  removes), which is correct: paused is attached.
- **The painted predicate is NOT `checks.mjs`'s own `isVisible`.** `isVisible`
  flags a zero-area box, which is right for a laid-out element and wrong for SVG
  stroke geometry: `<path d="M5 10v20" />` is a vertical line with a 0px-wide
  box, so every animated rail, tick and node in these marks would have reported
  itself invisible. `motion` keeps the opacity/display/visibility half --
  ancestor opacity walk included, verbatim, because `opacity` is not inherited
  and a child of an `opacity: 0` group computes 1 -- and drops the geometry half.
- **"Full opacity" is REPORTED, not gated.** These glyphs author depth with
  opacity: `.node { opacity: 0.35 }` in `GauntletMark` is its resting value, not
  a dimmed frame, and `.scan` rests at 0.8 while its keyframes peak at 0.85. A
  gate at 1.0 would fail correct marks; a gate at 0.35 would be fitted to
  today's data. What is GATED is "painted at all", on the harness's own existing
  0.01 floor. What is REPORTED, per element, is the resting opacity and the
  resting transform, plus the lowest resting opacity in the set on the summary
  line -- which is the number a future reader can audit.

**`expect: 'never'` is asserted in the RUNNING phase**, which is the phase where
every other mark is moving. Under `reduce` alone, an animation that is merely
gated is indistinguishable from no animation at all -- and a gated animation on
the FIRST emblem is still an alteration.

**One call sweeps every entry in a spec**, returning an array rather than one
result. Each media flip costs a settle; eleven marks measured one at a time
would have paid twenty-two of them per route/width.

#### What it measured

All eleven marks and the FRC icon pass, at both widths, first run:

| mark | elements swept | animated | not settled under reduce | lowest resting opacity |
| --- | --- | --- | --- | --- |
| vanguard | 31 | 12 | 0 | 1 |
| gauntlet | 37 | 10 | 0 | 0.35 |
| greenline | 15 | 4 | 0 | 0.3 |
| coins | 15 | 4 | 0 | 1 |
| classroom | 13 | 2 | 0 | 1 |
| notebook | 15 | 2 | 0 | 1 |
| tournament | 15 | 8 | 0 | 1 |
| coin-desk | 15 | 4 | 0 | 1 |
| dashboard | 13 | 2 | 0 | 1 |
| admin | 21 | 4 | 0 | 1 |
| foundry | 17 | 4 | 0 | 1 |
| **frc** | 8 | **0** | 0 | n/a |

`/dev/marks` also reports 0px horizontal overflow at 375 and 1440, and 7.52:1 /
6.91:1 / 5.88:1 on its heading, note and captions.

**The live control fires on the real surface.** `--break motion` injects an
UNGATED spin onto `[data-mark] svg *, [data-mark] img` -- outside any media
query, which is the defect -- and reddens **12 of 12 motion rows and nothing
else**: horizontal-scroll, all three contrast rows, all four presence rows and
console-errors stay green. It names the mark cells rather than sweeping the
document for `blank-text`'s reason plus one of its own: an `!important` rotate
on every element moves every tap-target box and every contrast ground with it,
and a preset that reddens everything proves nothing about the check under test.

### 2. Four harnesses were measuring the wrong room

Room classes come from the LAYOUT chain, and a `/dev` route has no such layout
above it. **Each was verified against the chain rather than taken from the
brief:**

| component | harness gave | production gives | verified at |
| --- | --- | --- | --- |
| `ShortLinkManager` | `.cr-root` | no room | `/admin/links` (portal shell) |
| `AnimatedLogo` | no room | `.cr-root` | `/reference/+layout.svelte` |
| `PathwayChip`, `Avatar` | no room | `.gt-root` | `/gauntlet/+layout.svelte` |
| `StudentPreview` | no room | `.cd-root` | `/coin-desk/+layout.svelte` |

Two corrections to the brief's list came out of that check, and both matter:

- **`/fsp/live` does not mount this `StudentPreview`.** It mounts
  `$lib/fsp/FspStudentPreview.svelte`, a different component. `StudentPreview`
  (`$lib/coin-desk/`) is mounted by exactly one route, `/coin-desk/preview`, so
  it is a one-room component and needed one harness, not two.
- **`PathwayChip` and `Avatar` ship in two rooms, not one.** `/dashboard`
  mounts both with no room and `/gauntlet/leaderboard` mounts both inside
  `.gt-root`, and `ProfileMenu` carries them into every room in the app. So
  `/dev/pathways` gained a `.gt-root` stage rather than being moved into one.

#### What moved, measured

- **`PathwayChip` in `.gt-root`: 6.5:1**, ink `rgb(255, 102, 102)` on ground
  `rgb(35, 12, 15)`. The roomless reading, which is the one the harness had
  always reported, is **4.84:1** on `rgb(54, 43, 29)`. The chip's fill is
  `withAlpha(colour, 0.12)` -- 12% alpha over whatever is behind it -- so its
  ratio is a property of the GROUND, and `.gt-root` re-points `--bg0`, `--bg1`,
  `--bg2`, `--white`, `--dim`, `--green`, `--cyan` and `--gold` to the viewport
  palette with `background: var(--void)` (`#04070a`) under it. **The room is the
  better of the two**, so the 4.84:1 the pass already reports remains the worst
  case and no threshold moved. The leaderboard name in that room measures
  19.23:1.
- **`AnimatedLogo` reads no room tokens at all.** Its stylesheet declares no
  `var()`: two PNGs layered at fixed percentages. No room can repaint the
  emblem; what a room changes is the ground behind it and the chrome around it.
- **`StudentPreview` in `.cd-root`: nothing coloured moved.** Banner copy
  10.67:1 and picker label 5.31:1, identical either side of the wrapper --
  because `split.css` says in words that "the coin desk sits on the portal's own
  dark plate rather than bringing a room palette". What the room moves is
  geometry: the student picker went from 352x19 to **247.3x19** at 375px once
  the page took `--cr-measure`/`--cr-gutter`.

#### `.cr-root` repaints the whole document, which forced a second route

`classroom.css` carries `body:has(.cr-root) { background: var(--surface-0) }`
and `body:has(.cr-root) .bg-fx { display: none }`. Adding a `.cr-root` section
to `/dev/animated-logo` therefore took the plate out from under the ROOMLESS
half of the same page: **measured, the note copy's ground moved rgb(18, 26, 18)
-> rgb(10, 12, 11) and its ratio 5.31:1 -> 5.87:1.** One page cannot hold both
plates, so the room mount is `/dev/animated-logo-room`, a second route, and
`/dev/animated-logo` is byte-for-byte back to its baseline numbers (5.31:1 on
rgb(18, 26, 18)). `.gt-root` has no such rule, which is why `/dev/pathways`
could take its second stage in the same page.

**`AnimatedLogo` ships in more rooms than any other shared component here** --
portal and `/admin*` (none), `ClassroomShell` and `/reference/[itemId]`
(`.cr-root`), `NotebookMasthead` (`.nb-root`), GAUNTLET's `Header` (`.gt-root`),
`FoundryShell` (`.fg-root`), `/coin-desk/+layout` (`.cd-root`), `FspDeck`
(`.fsp-root`), the tournament pages. It does not follow that it needs eight
harnesses, because it reads no room token; `.cr-root` earns one because it is
the room that repaints both the ground and the header slot the emblem sits in.
**The rest are named in the route's own header rather than silently omitted**:
nothing in this repo has measured the emblem's header slot on `.nb-root`'s paper
or in the forge.

#### The short-link tab moved out rather than being left in the wrong room

`ShortLinkManager` was a tab on `/dev/classroom-reference`, which wraps its
whole page in `.cr-root` -- correctly, for the reference components it exists
for, and wrongly for this one. The tab is gone and `/dev/short-links` is the
mount, with `/admin/links`'s own chrome (`.app-header`, `.hero`,
`main.admin-page` at 48rem) and no room. `/dev/classroom-reference` is not in
the browser pass, so no spec changed with it.

**Whoever last touched that component had already found this and written it
down without closing it.** `src/lib/ShortLinkManager.svelte`'s own style comment
reads: "this component is the one `.btn.tiny` call site that is NOT inside
`.cr-root` ... The dev harness mounts it INSIDE `.cr-root`, which is why the
divergence is invisible there." That is the loop this closes.

### Findings reported and left standing

Neither is in a file this bundle owns, and no threshold was loosened for either.

1. **`ShortLinkManager`'s composer save control measures 76.1x24px** at both
   widths -- the primary action of the add/re-point form, under the 44px floor.
   It carries `class="btn tiny"`, and the component's own `.btn.tiny` rule pins
   `min-height: 24px` with a comment justifying that floor for "the row-ops
   chips -- Edit, Delete, Cancel beside a short link in a table". The composer's
   save button is not a row-ops chip; it took the chip floor by sharing the
   class. **Owner: `src/lib/ShortLinkManager.svelte`** (markup ~line 135, style
   ~line 329). The six genuine row-ops chips measure 48.6x24 to 76.1x24 and are
   asserted at the documented 24px floor, which `IDEA_INTERFACE_STANDARDS` 10
   gives an admin-only, non-student-facing surface -- reported, not loosened:
   the check still prints every box and still counts anything under 24px
   separately.
2. **`StudentPreview`'s student picker measures 19px tall** (247.3x19 at 375px,
   352x19 at 1440px), under the 44px floor AND under the 24px absolute floor.
   `/coin-desk/preview` is admin-only, so the 24px floor is the applicable one
   and it still fails. **Owner:
   `src/lib/coin-desk/StudentPreview.svelte`** (`.preview-picker select`). The
   room fix did not cause it -- it measured 19px roomless too; the room only
   changed its width.

### Verification

- **`svelte-check`: 0 errors, 37 warnings**, mix **31 `state_referenced_locally`
  / 5 `css_unused_selector` / 1 `perf_avoid_nested_class`** -- the baseline,
  unmoved. Re-derived with the two `PUBLIC_SUPABASE_*` placeholders exported
  and `npx svelte-kit sync` run first, per `CLAUDE.md`.
- **`npm test`: 191 files, 4083 tests, all passing, 163.3s, exit 0.** This
  bundle adds no application code, so the suite is unchanged.
- **The full browser pass: 58 route/width runs, 532 measurements, 6 outside
  threshold, 144.8s** (server boot 2.4s). The 6 are three findings seen at each
  width: the two pre-existing `/dev/pathways` harness controls at 194.7x26.2px,
  and the two reported below. **Nothing else moved.**
- **Runtime cost, stated rather than glossed**: +27.9s for 8 more runs, **~3.5s
  per route/width** -- at the top of the range `README.md` already carried and
  above its ~2.6s estimate, which is worth knowing because none of the four new
  specs mounts a canvas. The README's figure was 117s / 46 runs before this and
  now reads 144.8s / 58; both numbers are re-derived rather than quoted.
- **`--break console-error` and `--break blank-text` still fire**, checked
  because the `--break` dispatch gained a `{ css: ... }` branch for the new
  `motion` preset beside the existing `{ js: ... }` one.
- **`--selftest`: 54 controls (27 negative, 27 positive), 0 instrument
  failures**, up from 44/22/22. The five new groups are: an animation declared
  outside any media query; an element the animation fades in, invisible once
  cancelled; a residual base transform; a sweep that found nothing to animate;
  and `expect: 'never'` with a gated animation on the mark.
- **`--break motion`** on `/dev/marks`: 12 of 12 motion rows redden, every
  other check on the page stays green.
- `node tools/browser-verify/routes/_tools/verify-loader-guards.mjs`: ALL GUARDS
  FIRED, `pathways.mjs` restored byte-identically.

### Deliberately not changed

- **The four new dev routes are not registered in `src/lib/site-manifest.ts`.**
  That file is `src/lib/`, which this bundle does not own -- and it is also the
  established shape: `/dev/pathways`, `/dev/animated-logo` and
  `/dev/coin-preview` are not in it either. Only the dev harnesses an APP claims
  for changelog attribution appear there.
- **`classroom-updates.json` gains no entry.** Nothing here changes what a class
  sees: every change is a dev harness (404 in production) or the verification
  tooling.

### Not verified

- **Nothing was measured against the live Supabase project**, a real Drive round
  trip, or a signed-in session. Every number here is from `/dev` routes driven
  by `tools/browser-verify` against a local `vite dev`.
- **Web fonts do not load** in the harness (the proxy resets
  `fonts.googleapis.com`), so every pixel figure above -- the 19px picker, the
  24px chips, the 34px icon slot -- is measured in the fallback stack and is
  approximate. Contrast is unaffected: colour is resolved by painting and
  reading the pixel back.
- **The `.gt-root` stage does not mount `ViewportBackground`.** The real
  `/gauntlet/leaderboard` has a WebGL canvas painting over `.gt-root`'s own
  `background: var(--void)`; the 6.5:1 figure is against that solid void base,
  which viewport.css itself describes as the state that "stands alone while the
  volumetric scene loads (and if WebGL is unavailable, when the canvas stays
  empty)". A ratio taken over a live canvas would be a ratio against whichever
  frame it landed on.
- **The two findings above were reported, not fixed**, and neither file was
  opened for editing.
- The rooms `AnimatedLogo` ships in beyond `.cr-root` -- `.nb-root`,
  `.gt-root`, `.fg-root`, `.cd-root`, `.fsp-root`, `.tnm-root` -- are still
  unmeasured, and are named in `/dev/animated-logo-room`'s header as gaps rather
  than closed.
