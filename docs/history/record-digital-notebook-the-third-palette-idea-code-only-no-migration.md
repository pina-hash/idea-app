---
title: "Digital notebook: the third palette, IDEA (code-only; NO migration)"
date: 2026-08-15
branches: []
migrations: []
subsystems: ["Digital notebook"]
record_order: 28
---

A green-black IDEA-identity theme beside the light and dark editorial ones. A
RECOLOUR, not a reskin: `notebook-theme.css` needed exactly ONE edit and all 16
notebook components needed NONE, so the spacing, the type stack, the whitespace
and the layout are the other two palettes'. No Orbitron, no Rajdhani, no
GAUNTLET chrome -- the notebook wearing IDEA green, not becoming a terminal.

- **`.nb-root[data-nb-theme='idea']` in `colors.css` + `effects.css`**, the way
  the dark palette was added. Ground `#0b1410`, surface `#101c16`, ink
  `#e8f2ec`, accent `#6cf4b5`, gold `#c8a848` kept as the secondary thread.
- **THE NEUTRAL LADDER IS NOT EYEBALLED.** It reproduces the dark palette's own
  OKLCH lightness steps at hue 160, which is why the ratios land within 0.2 of
  dark's throughout: ink 16.35 (dark 15.45), ink-soft 9.82 (9.63), ink-faint
  5.42 (5.36), ink-hover 13.14 (12.93), hairline 1.34 (1.29), hairline-strong
  1.74 (1.68).

### ONE SELECTOR, and the narrowing that made room for it

IDEA is OPT-IN ONLY, and that is a property of the CSS rather than of the
store: light and dark each have a `prefers-color-scheme` selector, IDEA has
none, so no device preference can reach it. 'system' still means exactly the
light/dark pair.

**The dark media query had to be narrowed from `:not([data-nb-theme='light'])`
to `:not([data-nb-theme])` for that to hold** -- the old form also matches
`='idea'`, so under a dark OS the IDEA surfaces would have been handed dark's
warm browns on top of their own greens, decided by nothing but source order.
Behaviour-preserving for both existing palettes (explicit dark has always had
its own block). Verified BOTH ways in the browser: the old selector really does
match the IDEA wrapper, and injecting the old rule really does turn the ground
`#16140f` and the ink `#f0ebdd`.

### THE ACCENT WAS NOT A FREE CHOICE -- read this before "calming it down"

The review grid's six status colours are a locked contract AND platform tokens,
so they are byte-identical in all three palettes -- which also means an accent
must clear all six at once. Two of them bracket the green family: `--green`
`#78b870` (on time) at OKLCH hue 142 and `--cyan` `#5abda8` (awaiting review) at
hue 178.

- **The brief's own suggestion, `#5dcaa5`, sits BETWEEN them**: 12.13 from the
  green and **5.56 from the cyan**, so a student-name link in the sticky column
  would have read as the marker in the cell beside it. The brief named the green
  as the risk; the cyan is closer, and is the binding constraint.
- **Hue offers no escape** -- the corridor is 36 degrees wide and both ends are
  occupied; a search of the whole green-teal arc returned ZERO colours 18 clear
  of both. **Dropping chroma walks into `--ice` `#a9bcab`** instead (a
  low-chroma candidate measured 10.18 from it). The only free axis is
  LIGHTNESS, upward, which is why this is a brighter mint than the room's other
  colours rather than a quiet one.
- **Shipped separation (CIEDE2000, measured live off the rendered cells):**
  cyan 15.75, green 15.95, ice 20.01, gear 29.06, amber 50.42, crimson 69.71.
- **The bar is 15.18** -- `--green` vs `--cyan` themselves, i.e. the
  discrimination the grid ALREADY asks of a reader for two colours in the same
  role in adjacent cells. The accent clears it against all six, in an easier
  task (underlined sans text, not a mono glyph in a chip). Chroma is 0.15
  against raw `#00FF41`'s 0.28, so the full IDEA green stays where the brief put
  it: small marks only, never a surface.

### `--nb-meta-accent`, the one new token

Green leads (links, active states, status text) and gold stays the secondary
thread on the eyebrow -- the meta line above a heading. `.eyebrow` hardcoded
`--nb-accent-ink`, which is the same thing on light and dark and green here, so
the two had to part company. Light and dark resolve the new token straight back
to their own accent-ink and render exactly what they always did (verified:
eyebrow `#8a6d24` light, `#c8a848` dark, unchanged).

**THE var()-RESOLVES-WHERE-DECLARED TRAP, in three new forms.** A custom
property defined as `var(<another custom property>)` resolves where it is
DECLARED, so each must be re-declared per palette: `--nb-meta-accent` (else
dark's eyebrow inherits light's deepened brass), `--nb-folder-gold` (else a GOLD
folder follows the accent and turns green, colliding with the on-time glyph),
and `--nb-folder-none`. All three verified resolving correctly per palette.

### Three-way picker

`NotebookThemeToggle` is a MENU where it was a cycle: cycling four states means
up to three presses, and a theme nobody knows exists cannot be discovered by a
button showing one state at a time. Four options (Match my device / Light / Dark
/ IDEA), each with a one-line note. Dismissal listens on POINTERDOWN and ignores
detached targets (the ProfileMenu trap) so the press that opens it cannot close
it. `cycleNotebookTheme` is gone.

### Two real layout bugs the verification found

1. **The menu hung off the left edge of the phone.** Anchored `right: 0` to the
   trigger -- right on a wide header, wrong at 375px where the masthead WRAPS
   and the trigger lands mid-row: measured left **-19.2px**, unreachable and not
   even scrollable-to. Narrow screens now drop `.nb-theme-picker` to
   `position: static` so the menu's containing block becomes `.app-header`,
   which already spans the width; insets are measured from the screen.
2. **`main` painted over the menu, at BOTH widths.** `.app-header` and `main`
   both sit at `z-index: 1` in `.nb-root`'s stacking context and `main` comes
   later, so it won the tie and covered anything the header dropped below
   itself. Caught by `elementFromPoint`, not by looking. `.nb-root .app-header`
   is `z-index: 2` now; every masthead dropdown benefits.

### Verified

- **The locked grid contract is byte-identical across all three palettes: 0
  diffs**, comparing all six states' glyph character, colour, border colour,
  border style and width, background, font-family, font-size, width, height,
  radius and line-height, plus cell density, td padding, row height, table width
  and the selected ring. Measured 30.3906px cells, Share Tech Mono, 14.4px,
  1119.63px table -- matching the documented contract. It holds BY CONSTRUCTION:
  every grid colour is a platform token (`--green`, `--amber`, `--cyan`,
  `--crimson`, `--ice`, `--gear`, `--dim`) and the selection ring is `--gold`
  directly, so no `--nb-*` palette can reach them.
- **Every text token clears AA on the IDEA ground** (and on the card): ink
  16.35/15.29, ink-soft 9.82/9.18, ink-faint 5.42/5.07, ink-hover 13.14/12.28,
  accent 13.59/12.71, gold 8.16/7.63, ok 9.13/8.54, error 7.50/7.02, warn
  8.49/7.94, all six folder colours 7.94-9.57, folder-none 5.42. Nothing was
  carried over on assumption -- the light palette needed its gold deepened from
  2.19:1, and every value here was measured against this ground.
- **Photos are not competed with**: no image carries a filter, opacity change or
  blend mode, the surface around one is `--nb-surface-dim` at chroma 8/255, and
  photo frames use the `--nb-hairline` rather than the accent.
- **Picker**: the opening press leaves it open, outside press dismisses, Escape
  dismisses and returns focus, picking applies and persists. A choice survives a
  real reload; with the choice cleared, a dark OS resolves to dark and a light OS
  to light, and IDEA is selected by neither.
- 375/375 at phone width on both surfaces in all three themes, menu fully
  on-screen and every option hittable at 44px+; desktop menu anchored to the
  trigger. `svelte-check` 0 errors, 36 warnings (the same 36 as HEAD).
  `npm test` **819/819 across 36 files**. Zero console errors.
- **A MEASUREMENT TRAP worth knowing, and it nearly read as a bug:** the global
  `a` rule carries `transition: color`, and the Browser pane does not composite,
  so `getComputedStyle().color` on any link reports the PRE-transition value
  forever -- the student link measured gold under every palette until
  transitions were killed, after which it read the accent correctly. This is the
  documented pane trap in a second place; inject
  `* { transition: none !important }` before asserting any computed colour.
- **NOT verified: screenshots.** The pane does not composite, so every visual
  claim above is a measured computed-style, geometry or hit-test read.

