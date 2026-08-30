---
title: "Launcher accents restored as stylesheet data, and measured for the first time"
date: 2026-08-21
branches: []
migrations: []
subsystems: ["Home page, launcher, tour"]
record_order: 104
---

Code only, no SQL. Reverts the second half of item 1 in `f734e7c`. The section
ordering that bundle shipped is untouched and stays.

### What `f734e7c` got wrong, and what it got right

It deleted `PortalApp.theme` and the inline `--acc-primary`/`--acc-secondary`
pair on the grounds that CLAUDE.md said launcher cards carry one shared accent.
The document was wrong. The eleven pairs had been painting the whole time, and
the per-app identity is deliberate: GAUNTLET, GREENLINE and VANGUARD carry their
own product colours and the FRC card carries FIRST's brand. All-gold was rejected
on sight.

What that bundle was right about is the MECHANISM. An inline custom property
beats every class rule, so `.app-card`'s shared brass/gold pair was dead code
that could never paint, no later rule could correct a single card, and the only
way to learn what a card would paint was to read the registry. It fixed the
cascade by deleting the identity along with it, which was the wrong half.

### The shape it comes back in

The card already carried `data-app={app.id}`, for the tour and for
drag-and-drop. The accents are now plain rules on `.app-card[data-app='<id>']`
in `AppLauncher.svelte`, with the same values `f734e7c` deleted, `cardTexture`
included (it keyed off the theme pair and went with it: VANGUARD's scanlines,
GAUNTLET's 24px blueprint grid, FRC's diagonal stripes, brushed metal for
everyone else, all at <=3% opacity).

Three consequences, and they are the argument for data over inline:

* **The shared pair is a LIVE default.** Four of the eleven cards -- classroom,
  notebook, coins, coin-desk -- declare nothing and paint from `.app-card`. A new
  app needs no entry anywhere to look right.
* **One card is overridable with one selector**, rather than a registry edit that
  nothing downstream can beat.
* **`PortalApp` still has no colour field.** That part of `f734e7c` stands: the
  registry carries an app's identity, not its paint. A colour field there is how
  the value gets read back onto the element again.

### The measurement nobody had ever done

These pairs feed `--acc-glow`, `--acc-line`, `--acc-line-strong`, `--acc-wash`
and `--acc-hover-glow` through `color-mix`, and had never been checked against
the rules the rest of the app is held to. Every colour was resolved by **painting
it to a canvas and reading the pixel back**, not by parsing a computed string: a
regex silently skips a syntax it does not know, and these resolve to
`color(srgb ...)` and `color-mix(...)` notations. The painter asserts the parse
(a sentinel fill that survives means the string was rejected) rather than
returning a plausible wrong colour. Grounds are composited layer by layer from an
opaque ancestor down, including the worst-case (lightest) stop of each card's own
texture gradient.

Measured in the Browser pane on `/dev/home-order` at 1440px and 375px, all
eleven cards, comfortable view so every element is genuinely rendered. Ratios do
not move with width; the geometry does, and did not break (1440px: three columns,
grid `scrollWidth` 1036 = `clientWidth` 1036. 375px: one column, cards 343px in a
375px layout viewport).

#### Before -- as restored, derived values untouched

| App | Accent pair | Title / CTA / icon (need 4.5) | Card edge vs page / card (need 3) | Verdict |
| --- | --- | --- | --- | --- |
| classroom, notebook, coins, coin-desk | `#C8A848` / `#78B870` | 6.34 rest, 5.82 hover, **4.75 CTA hover** | **1.44** / **1.46** | edge FAIL |
| gauntlet | `#00FF41` / `#00F0FF` | 10.35 / 9.24 / 6.89 | **1.64** / **1.67** | edge FAIL |
| frc | `#ED1C24` / `#0066B3` | **3.41** rest, **3.39** hover, **3.16** CTA hover | **1.15** / **1.12** | text FAIL, edge FAIL |
| greenline | `#2AE57E` / `#CFDAE2` | 8.73 / 7.88 / 6.01 | **1.56** / **1.60** | edge FAIL |
| vanguard | `#00FF41` / `#C8FF00` | 10.39 / 9.27 / 6.91 | **1.64** / **1.68** | edge FAIL |
| tournaments | `#00FF41` / `#C8A848` | 10.65 / 9.55 / 7.07 | **1.64** / **1.68** | edge FAIL |
| dashboard, admin | `#78B870` / `#5ABDA8` | 6.15 / 5.70 / **4.63** | **1.43** / **1.46** | edge FAIL |

Two findings, and only one of them is about the colours that came back.

**The card edge failed on every card, the shared gold included.** It is a 20% mix
of the accent, and it is the only thing separating a card from the page: `--bg1`
on `--bg0` measures 1.18:1, which is one region to the eye. That is the standard's
own example of a load-bearing boundary (`IDEA_INTERFACE_STANDARDS` 10, "the edge
of a card sitting directly on the page plate"), and this was failing before this
bundle and before `f734e7c`.

**FRC's text failed**, at 3.41:1. `#ED1C24` is a mid-luminance red made for white
paper, which is exactly where `.frc-root` uses it (`--frc-bg` is `#EEF1F5`); on a
dark card it does not carry text.

#### The trap in the middle

The first attempt at FRC was to tint the ink. Sweeping it from 80% brand red down
to 40% moved the CTA hover case only 3.41 -> 4.89 and cost the entire colour.
The reason is the one the standard names: the pill's hover background was
`color-mix(--acc-primary 12%, transparent)` -- **a fill derived from the very ink
sitting on it**, so lightening the ink lightened its own ground with it and the
ratio barely moved. Pinning that fill to `--bg2` broke the coupling, and every
accent then cleared 4.5:1 on it with the ink free to move independently.

#### The fixes, all to derived values

| What moved | From | To | Why not the other thing |
| --- | --- | --- | --- |
| Glyph colour | `--acc` read `--acc-primary` directly | new `--acc-ink`, defaulting to `--acc-primary`; every derived value now reads the ink | Gives a card one place to fix legibility without touching its brand |
| FRC ink | `#ED1C24` | `hsl(357.7 85.3% 68%)` (= `#F3686D`) | `#ED1C24` **is** `hsl(357.7 85.3% 52.0%)`: same hue, same saturation, lightness only. Written as `hsl()` so the one number that changed is visible. `--acc-primary` stays `#ED1C24` and still paints the strip, the texture and the pairing with FIRST Blue |
| Card edge | `--acc-line` at 20% | new `--acc-edge` at 75% of the ink; `--acc-edge-strong` = the ink | 75% is the floor that gets every accent over 3:1, FRC worst at 3.35 |
| CTA pill edge | `--acc-line` at 20% | unchanged, deliberately | It decorates a LABEL, not a control anyone can operate; its own text clears 4.5:1. Raising one hairline for both draws every card as a wireframe, which is the standard's stated reason for carrying two tokens |
| CTA hover fill | `color-mix(--acc-primary 12%)` | `--acc-cta-hover-fill: var(--bg2)` | See above: a fill mixed from its own ink moves with it |

#### After -- every value, measured

Text needs 4.5:1; the load-bearing edge needs 3:1. `icon` equals `title` by
construction (both take `--acc`); the FRC card's icon is the official FIRST logo
image and takes no accent colour at all.

| App | Identity (unmoved) | Ink | Title rest / hover | CTA rest / hover | Edge vs page / card | Edge hover | CTA pill line (decorative) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| classroom | `#C8A848` / `#78B870` | = identity | 6.34 / 5.82 | 6.34 / 6.17 | 4.85 / 4.21 | 7.74 / 5.82 | 1.46 |
| notebook | `#C8A848` / `#78B870` | = identity | 6.34 / 5.82 | 6.34 / 6.17 | 4.85 / 4.21 | 7.74 / 5.82 | 1.46 |
| coins | `#C8A848` / `#78B870` | = identity | 6.34 / 5.82 | 6.34 / 6.17 | 4.85 / 4.21 | 7.74 / 5.82 | 1.46 |
| gauntlet | `#00FF41` / `#00F0FF` | = identity | 10.35 / 9.24 | 10.35 / 10.38 | 7.65 / 6.47 | 13.01 / 9.24 | 1.67 |
| frc | `#ED1C24` / `#0066B3` | `hsl(357.7 85.3% 68%)` | 4.99 / 4.76 | 4.99 / 4.73 | 3.80 / 3.35 | 5.93 / 4.76 | 1.31 |
| greenline | `#2AE57E` / `#CFDAE2` | = identity | 8.73 / 7.88 | 8.73 / 8.51 | 6.44 / 5.57 | 10.66 / 7.88 | 1.60 |
| vanguard | `#00FF41` / `#C8FF00` | = identity | 10.39 / 9.27 | 10.39 / 10.38 | 7.65 / 6.49 | 13.01 / 9.27 | 1.68 |
| tournaments | `#00FF41` / `#C8A848` | = identity | 10.65 / 9.55 | 10.65 / 10.38 | 7.65 / 6.59 | 13.01 / 9.55 | 1.68 |
| coin-desk | `#C8A848` / `#78B870` | = identity | 6.34 / 5.82 | 6.34 / 6.17 | 4.85 / 4.21 | 7.74 / 5.82 | 1.46 |
| dashboard | `#78B870` / `#5ABDA8` | = identity | 6.15 / 5.70 | 6.15 / 6.00 | 4.74 / 4.13 | 7.52 / 5.70 | 1.46 |
| admin | `#78B870` / `#5ABDA8` | = identity | 6.15 / 5.70 | 6.15 / 6.00 | 4.74 / 4.13 | 7.52 / 5.70 | 1.46 |

Worst case anywhere: **4.73** on text (FRC's CTA over its hover fill) against a
4.5 floor, and **3.35** on the load-bearing edge (FRC, against the card) against a
3.0 floor. Nothing fails.

**Not measured, and deliberately.** The 2px `.app-strip` gradient is decoration
carrying no state; `--acc-glow` and `--acc-hover-glow` are glows that only add
light behind something already measured; `--acc-wash` at 5% is a hover tint whose
effect is inside the numbers above. The `.app-sub` line, the legacy badge and the
customize buttons are not accent-derived (`--dim`, `--amber`, hardcoded greens)
and are out of this sweep's scope.

### Verification

* `svelte-check`: **0 errors, 36 warnings**, the baseline unchanged.
* Full suite: **78 files, 1954 tests, all passing.**
* Harness: `/dev/home-order` gained an `?admin=1` knob. Without it `isAdmin` is
  false and three of the eleven cards never mount, so a sweep over what is on
  screen silently measures eight of them and comes back clean.
* Both viewports measured, numbers above.
* **The shared default confirmed live in the browser**, with the positive control
  the claim needs: `classroom` resolves `--acc-primary` to `#C8A848` (from
  `var(--gold)` on `.app-card`, declaring nothing of its own) while `gauntlet`
  resolves `#00FF41` in the same read. A default that "still paints" proves
  nothing if the same check cannot see a declared accent.

#### Mutation proof

Four, against `tests/home-order-and-accent.test.ts`. Each was confirmed applied
by grep AND by a changed md5 before its result was read, and restored
byte-identically (`src/lib/AppLauncher.svelte`, `2d1d468b9c17eaaef2cec9eb0d8f9985`
before and after all four).

| Mutation | Tests reddened |
| --- | --- |
| The accent pair put back as an inline `style={accStyle}` -- the rejected alternative | **1** -- "stamps NO accent custom property on any card", and nothing else |
| `.app-card`'s shared `var(--gold)`/`var(--green)` default replaced with a per-card colour | **1** -- "keeps the shared pair as a LIVE default", and nothing else |
| FRC's `--acc-primary` moved to the lightened red (the identity moved instead of the ink) | **1** -- "never moves an identity colour for contrast", and nothing else |
| `data-app` dropped from the link branch, so the rules key on nothing | **1** -- "gives every card the `data-app` attribute", and nothing else |

The first is the one the user asked for by name: an inline accent must redden a
test asserting a stylesheet rule can still override it. It does, and only it.

### Not verified

* No screenshot. The Browser pane does not composite, so every visual claim here
  is a measured computed-style, canvas-pixel or geometry read, as CLAUDE.md
  requires. Transitions were disabled before every read.
* Nothing was checked against the live Supabase project, a signed-in session or
  production; the harness supplies all eleven cards from local data.
* The 3D and legacy surfaces the accents point AT (`.gt-root`, `.glb`,
  `.frc-root`) were not re-measured. Nothing in this bundle touches them.
* No student-facing classroom behaviour changed, so `classroom-updates.json` gets
  no entry.

