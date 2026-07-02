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
| `--steel` | `#3B6E8F` | ambient viewport light (fog, particulate) |
| `--crimson` | `#FF3355` | **RESERVED: live/rec/error states ONLY.** Never a general accent. |
| `--ax-x` / `--ax-y` / `--ax-z` | `#FF4D57` / `#00FF41` / `#3F8CFF` | origin triad |

Text: `--white #E8FFF0` (body), `--dim #5F8A78` (secondary),
`--ice #88DDFF` (data readouts).

Glows: `--glow-green`, `--glow-cyan`, `--glow-lime`, `--glow-crimson`
(each `0 0 10px` at .75 + `0 0 30px` at .28 of its color).

Geometry: `--radius-card 14px`, `--radius-ctl 10px`.

Fonts: `--font-head` (Orbitron, display + headings + wordmark + stat numerals),
`--font-body` (Rajdhani, body/UI/inputs), `--font-data` (Share Tech Mono, all
data/labels/coords). This matches the landing page (Orbitron display type) and
the VIEWPORT sample. The app-shell `--font-display` stays Rajdhani for body and
inputs; display chrome (the header wordmark, headings, `.stat-value`) reads
`--font-head` explicitly so it is Orbitron, not Rajdhani.

The GAUNTLET header (`Header.svelte`) brand block is a mono "Trains SOLIDWORKS
skills" eyebrow over an Orbitron-900 `IDEA // GAUNTLET` wordmark that clips the
green -> lime -> cyan gradient (IDEA -> `/`, GAUNTLET -> `/gauntlet`, dim `//`),
with the breadcrumb trailing in mono. The header is **sticky** (`.gt-root
.app-header`, scoped so the dashboard's shared `.app-header` is untouched),
pinned to the top of the viewport with a blurred void backdrop as the page
scrolls beneath it.

Each page supplies exactly one real `<h1>` (a11y). Where a page's h1 text
would otherwise repeat the header's wordmark (the dojo landing's motto), it is
styled back down to the calm mono/cyan eyebrow treatment
(`.dojo-hero h1.dojo-tagline`) rather than the generic Orbitron h1 skin, so it
reads as a subtitle, not a second brand line.

The scope block also re-points the app-shell tokens the pre-existing
`.gauntlet` styles consume (`--bg1 -> --panel`, `--gold -> --lime`,
`--font-mono -> --font-data`, ...), which is how the legacy rules inherit the
VIEWPORT palette without a rewrite.

## Components (`src/lib/gauntlet/viewport/`)

Mounted once in the layout (ambient):

- **ViewportBackground** - fixed full-viewport WebGL canvas (z 0,
  pointer-events none): a **volumetric CAD space**, not a flat pattern. A
  floating hero machined part upper-right (solid PBR metal with a faint green
  tessellation-edge overlay; three procedural geometries from
  `hero-parts.ts`, hex boss / stepped flange / L-bracket, cycle with a ~26s
  fade), studio key/rim lighting over a RoomEnvironment map with ACES,
  exponential fog for depth falloff, fine drifting particulate at several
  depths plus a few oversized soft bokeh motes near the lens, gentle mouse
  parallax via camera offset, and a slight CSS soft-focus on the canvas
  (gentle depth of field) so foreground content always reads sharper than
  the space behind it. The center content scrim lives in `.gt-vignette`; a
  crisp origin-triad SVG sits bottom-left outside the blur. **The old
  scrolling isometric grid floor is retired; do not reintroduce it.** DPR
  capped at 1.5, single rAF loop, paused on `document.hidden`, one static
  frame under reduced motion, silent fallback to the flat void base if
  WebGL is unavailable, cleaned up on destroy.
- **CursorLayer** - CAD crosshair cursor (reticle ring + dot + cross lines)
  easing after the mouse with a trailing mono X/Y mm readout; the ring
  enlarges and shifts lime over interactive elements. Pointer-events none.
  Disabled on touch devices and under reduced motion (native cursor restored).
- **FeatureTreeNav** - FeatureManager-style rail: root node, Modeling and
  Knowledge groups with line icons and tree connectors, a Sessions group
  (rooms, tools), and an origin/units/view footer block. Fixed rail on
  viewports >= 1440px. Leaves glow in their family color. **Hidden by
  default** (the rail reads as clutter during a run): a small edge tab
  reveals it, the choice persists per browser (`gt-tree-open`). Do not make
  it visible by default.
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
  Speedrun's art is animated (a stopwatch dial whose hand sweeps, a hex part
  inside, pulsing fast-forward chevrons); the scoped viewport.css
  reduced-motion block stills it automatically.
- **PartThumb** (`src/lib/gauntlet/PartThumb.svelte`) - a level tile's
  isometric 3D thumbnail: each Speedrun level's STL renders once per browser
  to a small transparent PNG (fixed true-iso orthographic camera, the
  StlViewer machined-metal + studio-light family, contact shadow) through the
  shared queued offscreen renderer in `part-thumbs.ts`, then is cached in
  IndexedDB keyed by `model_path` + a style version (bump STYLE_VERSION after
  a look change to invalidate). Signed Storage URLs are resolved only on a
  cache miss. Levels with no model get a quiet wireframe glyph placeholder.
  Verify all of this at `/dev/visuals` (dev-only harness, 404 in production,
  no auth or Supabase), which also mounts the volumetric background and the
  StlViewer with a generated sample STL.
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

## Narrow-viewport refinement

Most layout already holds up at any width (flex-wrap, grid auto-fill). A
dedicated block at the end of `viewport.css` handles the exceptions: the
leaderboard (`.board`) scrolls horizontally instead of squeezing columns; wide
letter-spacing mono codes (`.code-value`, `.room-code`) shrink fluidly via
`clamp()` with `word-break: break-all` as a last resort; and a `max-width:
720px` query trims header/main padding, hides the decorative header clock,
tightens the mode grid's minimum column, and further reduces code letter-
spacing. Verified by injecting the real stylesheet and reading computed
styles at 375px and 320px viewports (no overflow at either).

## Live Rooms formatting parity

A room's racer/host/spectator views reuse the exact same visual language as
the solo Speedrun page (`/gauntlet/speedrun/[id]`), not a simplified variant:
the blueprint `.drawing-frame` with click-to-zoom and a sheet title block, the
`.spec`/`.ruleset-panel` cards (via `{#snippet specCard()}` /
`{#snippet rulesetCard()}` in the room page, since the same markup repeats
across host/lobby/racer/spectator states), the always-visible STL preview
(`StlViewer`, no toggle), and a
live `SpeedrunClock` anchored to the room's single authoritative
`started_at` (display-only; scoring still comes from the server-computed
elapsed time in `gauntlet_room_manual_submit` / `gauntlet_macro_submit`,
unchanged). The room's server load fetches the same `ruleset` and signed STL
`modelUrl` the solo page fetches, both read-only display data with no
scoring/auth/timing implications.

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
