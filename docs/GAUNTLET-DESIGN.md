# GAUNTLET "VIEWPORT" design system

The visual and interaction system for everything under `/gauntlet`. It makes
the dojo feel like a living CAD workspace: a viewport, a feature tree, an
origin triad, a crosshair cursor. It is a **visual + interaction layer only**;
it never touches data flow, Supabase wiring, auth, scoring, room timing, or
verification logic.

**Standing rule: all GAUNTLET UI, current and future, conforms to this
system.** Read tokens and reuse the components below; do not write one-off
aesthetic values (colors, glows, radii, fonts) in page or component files.

## Source of truth

- Tokens + re-skin layer: `src/lib/gauntlet/viewport/viewport.css`, scoped to
  `.gt-root` (the `/gauntlet` layout wrapper) so nothing leaks to the rest of
  the app.
- Ambient components are mounted **once** in
  `src/routes/gauntlet/+layout.svelte`; every current and future GAUNTLET page
  inherits them for free.
- Fonts are loaded once globally (root layout, `@fontsource`): **Orbitron**
  (500/700/900) for display and headings, **Rajdhani** (400 to 700) for body
  and UI, **Share Tech Mono** for all data, timers, coordinates, and metadata.

## Tokens

Surfaces:

| Token | Value | Role |
| --- | --- | --- |
| `--void` | `#04070A` | page base, cooled graphite-black |
| `--panel` | `#0A1014` | cards and panels |
| `--panel-2` | `#0E161B` | inputs, inset chrome |
| `--line` | `#16242C` | steel hairline borders |

Accents:

| Token | Value | Role |
| --- | --- | --- |
| `--green` | `#00FF41` | primary; the MODELING family color |
| `--cyan` | `#00F0FF` | the KNOWLEDGE family color |
| `--lime` | `#C8FF00` | gold-green accent: hover shift, callouts |
| `--steel` | `#3B6E8F` | ambient viewport light (grid floor, fog) |
| `--crimson` | `#FF3355` | **RESERVED: live/rec/error states ONLY.** Never a general accent. |
| `--ax-x` / `--ax-y` / `--ax-z` | `#FF4D57` / `#00FF41` / `#3F8CFF` | origin triad |

Text: `--white #E8FFF0` (body), `--dim #5F8A78` (secondary),
`--ice #88DDFF` (data readouts).

Glows: `--glow-green`, `--glow-cyan`, `--glow-lime`, `--glow-crimson`
(each `0 0 10px` at .75 + `0 0 30px` at .28 of its color).

Geometry: `--radius-card 14px`, `--radius-ctl 10px`.

Fonts: `--font-head` (Orbitron), `--font-body` (Rajdhani), `--font-data`
(Share Tech Mono).

The scope block also re-points the app-shell tokens the pre-existing
`.gauntlet` styles consume (`--bg1 -> --panel`, `--gold -> --lime`,
`--font-mono -> --font-data`, ...), which is how the legacy rules inherit the
VIEWPORT palette without a rewrite.

## Components (`src/lib/gauntlet/viewport/`)

Mounted once in the layout (ambient):

- **ViewportBackground** - fixed full-viewport canvas (z 0, pointer-events
  none): receding isometric grid floor in steel with fog fade, a slowly
  orbiting wireframe hex-prism (green edges, lime vertices) upper-right, an
  origin triad bottom-left, and mouse parallax. DPR capped at 2, single rAF
  loop, paused on `document.hidden`, cleaned up on destroy.
- **CursorLayer** - CAD crosshair cursor (reticle ring + dot + cross lines)
  easing after the mouse with a trailing mono X/Y mm readout; the ring
  enlarges and shifts lime over interactive elements. Pointer-events none.
  Disabled on touch devices and under reduced motion (native cursor restored).
- **FeatureTreeNav** - FeatureManager-style rail: root node, Modeling and
  Knowledge groups with line icons and tree connectors, a Sessions group
  (rooms, tools), and an origin/units/view footer block. Fixed rail on
  viewports >= 1440px. Leaves glow in their family color.
- **TrademarkFooter** - the Dassault Systemes disclaimer, on every page.
- **Vignette** (`.gt-vignette`, a layout div styled in viewport.css) - steel
  light pooling upper-right, a green wash lower-left, darkened corners.

Used per page:

- **TiltCard** `family: 'modeling' | 'knowledge'` - magnetic 3D tilt
  (clamped ~10deg), cursor-tracking specular sheen, family-colored edge glow.
  The parent grid supplies `perspective` (viewport.css handles `.mode-grid`).
- **CountdownOverlay** `active`, `onDone` - the 3-2-1-BUILD flourish on
  live-room start. Trigger it from observed state transitions only; the
  server-authoritative timing is never altered.
- **ModeArt** `id: GauntletModeId` - wireframe line-art icon per mode;
  strokes inherit `currentColor` so the family color comes from the card.
- **motion.ts** - `entrance` (IntersectionObserver fade/slide action),
  `entranceSweep` (staggered entrance for a container's children; the layout
  runs it on `main.gauntlet` after every navigation), `countUp` (numeric stat
  action), `prefersReducedMotion()`, `isCoarsePointer()`.

Shared primitive styling (buttons with green->lime fill and tactile press,
glow-breathe on key readouts, crimson live/error states, Orbitron headings,
radii, focus rings) lives in the re-skin layer of `viewport.css`.

## Family color-coding

Modeling modes (Speedrun, Reverse Engineer, Feature Golf) are **green**;
knowledge modes (Drawing Reading, GD&T and Tolerance, Spot the Error) are
**cyan**. Applies to mode cards, tree leaves, tags, and edge glows.

## Motion + accessibility floor (non-negotiable)

Under `prefers-reduced-motion: reduce`:

- the canvas renders one static frame (no loop, no parallax),
- no tilt, no custom cursor (native cursor restored), no count-up, no
  entrance animation, no glow-breathe;
- `viewport.css` force-disables all animation/transition in scope and the JS
  helpers self-disable, so components never need their own guard.

Always: visible keyboard focus (lime outline) on all interactive elements;
overlay layers are `pointer-events: none` and never block interaction; body
text stays readable on the dark base (`--white` on `--void`/`--panel`).

## SOLIDWORKS branding (compliance-critical)

- Nominative text only: "trains SOLIDWORKS skills" (all caps in body text)
  is fine.
- **Never** the SOLIDWORKS logo, a logo-lookalike, or an imitation of its
  red-on-white scheme. The CAD feel comes from generic interface language:
  feature tree, viewport, origin triad, coordinate readout, IPS/3dp units.
- The trademark disclaimer footer stays on every GAUNTLET page:
  "SOLIDWORKS is a trademark of Dassault Systemes. IDEA GAUNTLET is an
  educational tool built at Bosco Tech and is not affiliated with, sponsored
  by, or endorsed by Dassault Systemes."

## Adding a new GAUNTLET page

1. Put it under `src/routes/gauntlet/` - the layout gives it the background,
   cursor, tree nav, entrance choreography, and disclaimer automatically.
2. Use `<main class="gauntlet">` and the existing shared classes; they are
   already skinned by the system.
3. Read tokens for any new styles; reuse the components above.
4. Crimson only for live/rec/error. Family colors by mode family.
