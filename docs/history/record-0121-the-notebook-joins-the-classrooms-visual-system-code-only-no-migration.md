---
title: "0121 -- The notebook joins the classroom's visual system (code only, no migration)"
date: 2026-08-20
branches: []
migrations: []
subsystems: ["Digital notebook"]
record_order: 87
---

**What it is.** The digital notebook had its own type stack, its own corner radii
and its own spacing rhythm, so a student moving between a class and their notebook
moved between two products. This puts the notebook on the platform's structural
tokens -- Rajdhani, `--radius-*`, `--space-*`, and the design-system surface and
text names -- and keeps the three palettes as what the brief calls them:
background plates, so a photograph of paper stays readable in different lighting.
No SQL, no behaviour change, no markup or layout restructuring.

### The load-bearing decision: the room ALIASES, it does not redeclare

Every notebook component now reads `--surface-*`, `--text-*` and `--hairline`, the
same names the classroom reads. The obvious way to arrange that -- have each
palette block declare `--surface-1` directly -- is wrong here, and the reason is
worth keeping: **the notebook's LIGHT palette lives at `:root`**, not on
`.nb-root` (only dark and IDEA are scoped). A palette declaring `--surface-1`
would therefore declare it globally, and the classroom, the public reference
viewer and `/classroom/view-as/<student>/notebook` would all repaint in paper
white.

So `.nb-root` aliases instead: `--surface-1: var(--nb-surface)`, `--text-1:
var(--nb-ink)`, and so on. Source and target sit on the SAME element, which is
also what keeps this clear of the var()-resolves-where-declared trap that bit
`--nb-folder-gold`: that trap needs a DESCENDANT redeclaration, and an alias is
not one. The canvas mirror (`body:has(.nb-root)`, `:root:has(...)`) still names
`--nb-bg`, because `body` and `:root` are ancestors of `.nb-root` and cannot see
the alias.

Checked before it was written, not after: `src/app.css`, `ProfileMenu`,
`VersionBadge`, `AnimatedLogo` and `Avatar` contain **zero** references to any
aliased name, and the one place `split.css` reads them (`--cr-thumb`,
`--cr-pane-line`) the notebook already overrides. So no foreign component mounted
inside `.nb-root` is reskinned by the alias.

### The review grid: the locked contract was costing the thing it protected

`CLAUDE.md` said the six status colours must be PLATFORM tokens so that no scoped
palette could reach them. Measured on the ground the cell actually composites over
(`--surface-1`, the card -- not `--nb-bg`), that rule was producing this:

|          | light | dark | idea |
|----------|-------|------|------|
| on time  | 1.93  | 4.32 | 4.49 |
| late     | 2.36  | 3.62 | 3.84 |
| awaiting | 1.94  | 5.10 | 5.28 |
| flagged  | 2.55  | 3.06 | 3.25 |
| excused  | 2.01  | 8.38 | 8.73 |
| missing  | 3.34  | 5.03 | 5.24 |

Twelve of eighteen below 4.5:1; on the DEFAULT plate all six, five of them below
even 3:1. The glyph is text at 14.4px, so 4.5:1 is its bar. Measured two ways that
agreed exactly -- a from-scratch WCAG/CIEDE2000 script (validated by reproducing
six of the seven CIEDE2000 figures `colors.css` published independently) and a
live `getComputedStyle` read in the browser pane.

Now `--nb-cell-*`, declared per plate. After:

|          | light | dark | idea |
|----------|-------|------|------|
| on time  | 4.79  | 4.76 | 4.90 |
| late     | 4.80  | 4.77 | 5.07 |
| awaiting | 4.87  | 5.09 | 5.30 |
| flagged  | 4.75  | 4.78 | 5.11 |
| excused  | 4.82  | 8.38 | 8.73 |
| missing  | 8.64  | 5.03 | 5.24 |

**THE FILL IS PINNED, NOT MIXED OFF THE INK, and that is the whole trick.** The
first attempt deepened each ink and left the fill as `color-mix(<ink> 26%)`. That
fails: the fill moves with the ink, so deepening the glyph darkens its own ground
and hands most of the contrast straight back -- on time reached only 3.84:1 that
way, and the browser measurement is what caught it after the arithmetic had said
4.51. The fills are now explicit tokens holding the exact colours the grid already
shipped, so the patch a reader recognises at a glance is unchanged and only the
mark on top of it moved.

Untouched, and verified after: the six glyphs, Share Tech Mono (30.4x30.4px cell,
`--font-mono` resolving to the identical string), the 0.35/0.4rem density, the
1.9rem box, and each state's hue identity.

**Also found while in there:** the hover/focus-visible ring was
`rgba(38, 34, 27, 0.3)` -- an ink colour on every plate. It measured 1.02:1 on
dark and 1.03:1 on IDEA, i.e. the keyboard focus indicator for every cell in the
grid was not being drawn at all in two of the three rooms. It is `--nb-cell-ring`
now and follows the plate.

**What it cost:** light's minimum pairwise CIEDE2000 falls from 15.18 to 11.90
(on time vs awaiting). Darkening six hues onto white compresses the gamut, and
that is the honest trade -- 15.18 of separation between two marks nobody could
read at 1.93:1 is not worth having, and no state depends on colour alone (each
carries its own glyph and its own fill style).

### The photo island

`CameraCapture`, `PhotoCorrector` and `PhotoStager` used a bespoke palette
(`#f5f2e9`, `#171512`, `rgba(22,20,16,...)`) that existed nowhere else and was
frozen at the light theme's values in all three palettes. They are `--nb-shot-*`
now, six tokens declared per plate. "Follows a palette change" is deliberately NOT
"inverts": these stay dark everywhere, because a viewfinder that glares and a drag
quad that has to hold contrast over an arbitrary photograph are not preferences.
What follows the room is hue and depth -- warm on light and dark, green-black on
IDEA. The LIGHT values are byte-identical to what shipped. Measured over a
worst-case mid-grey photograph: ink 16.1/17.8/18.1:1, the 62% hint step
6.8/7.2/7.3:1, deep-on-ink 14.1/17.2/17.6:1.

One value was normalised deliberately: `PhotoCorrector`'s overlay was 0.97 alpha
and `CameraCapture`'s 0.98. They are one token at 0.98. Also fixed: the drag
handle's fill was `color-mix(var(--green) 25%, var(--bg0))` -- the PORTAL's plate,
the last app-shell surface token in the room, and the reason that handle never
followed the palette.

### The masthead

Eight lines were written out verbatim in `NotebookView` and `ReviewConsole`,
differing only in the back link. Extracted to `NotebookMasthead.svelte`
(`backHref`, `backLabel`). **Deliberately not shared with `ClassroomShell`:** that
component WRAPS a route's children and owns the section switcher, the breadcrumb
trail and the tab strip, none of which has a notebook meaning; the room wrapper
sits in a different place in each room (`.cr-root` is the classroom LAYOUT's,
`.nb-root` is the notebook components' own, because the notebook also mounts under
the classroom's view-as tree); and this bar carries `NotebookThemeToggle`, which
is the notebook's alone. Rendered DOM verified identical at both call sites.

### Type

`--nb-font` is deleted. The room also stopped overriding `font-size: 1rem`, so it
inherits the platform's 1.05rem -- **not cosmetic**: Rajdhani advances ~7.7%
narrower than the system stack it replaced, so keeping 1rem would have run every
line ~8% longer in the one room whose entire job is reading. `.nb-root .btn` is
the sweep's one deliberate round UP (0.6rem to `--space-3` rather than
`--space-2`): the control measured 42.96px, already under the 44px rule, and
rounding down would have taken it to 41.04. It is 48px now. The same fix was
applied to `PhotoCorrector`'s overlay button, which the mechanical snap had taken
to 39.8px.

`--font-title: 'Orbitron', sans-serif` is new -- an addition, not a retune, so the
one classroom rule pointed at it renders exactly what it did.

### Literal counts, same counting method both sides (comments stripped, `<style>` blocks only)

|                   | colour | radius | spacing | font-family |
|-------------------|--------|--------|---------|-------------|
| notebook, before  | 52     | 15     | 333     | 4           |
| notebook, after   | **18** | **1**  | **14**  | **0**       |
| classroom, before | 30     | 2      | 411     | 164         |
| classroom, after  | 30     | 2      | 411     | **0**       |

The notebook's 18 remaining colour literals are the shadow definitions and a
handful of scrims; its 14 remaining spacing literals are the `em` values, the
locked grid density, and one off-scale 4.5rem page-bottom spacer left alone
deliberately. The classroom's colour, radius and spacing counts are UNCHANGED by
design -- the classroom was not swept, only its font literals were tokenised.

### Verified

- `svelte-check` 0 errors / 36 warnings, the baseline, unchanged.
- Full suite: 64 files, 1526 tests, all passing.
- **The classroom is pixel-unchanged**, measured rather than asserted: a
  computed-style + geometry fingerprint of 36 properties per element over 4
  harness pages and 23 scenarios -- 4113 elements at 1440px and 4113 at 375px --
  diffed before and after. 0 changed, 0 added, 0 removed, both widths. The diff
  was proved non-vacuous with a positive control: breaking `--font-mono`,
  `--font-display` and `--font-title` in the page reddened 61 of 99 elements on
  the same fixture, and restoring them returned it to 0.
- Notebook measured on all three plates: type, size, radius, padding, contrast,
  tap targets, and no horizontal overflow at 1440 or 375.

### NOT verified, and why

- **No screenshots.** The Browser pane does not composite; every visual claim
  above is a measured computed-style, geometry or contrast read, and is reported
  as such. No real Chrome is connected in this setup.
- **`CameraCapture` and `PhotoCorrector` were never rendered.** They need
  `getUserMedia` and a staged photo, which the pane cannot supply. Their tokens
  were verified by resolving `--nb-shot-*` off a probe `.nb-root` in each palette
  and computing the composites; the substitution itself is a literal-for-token
  swap whose light values are byte-identical.
- **`/classroom/view-as/<student>/notebook`.** No dev harness reproduces
  `.nb-root` nested inside `.cr-root`, so the one route where the two rooms nest
  is unverified. It was deliberately left untouched (see below).
- The live Supabase project, a signed-in session, a real Drive round trip.

### Left undone, deliberately

- **`view-as/<student>/notebook` changes zero lines.** Its `<style>` block was
  never "on classroom tokens" in the sense that needed fixing -- it is already on
  the design-system names this sweep moves the notebook TO, and its
  `.nb-noaccount` is a SIBLING of `.nb-root`, not inside it, so `--nb-*` would not
  resolve there at all. Two real findings, both structural and therefore outside a
  token sweep's remit: that page renders TWO mastheads (ClassroomShell's minimal
  bar and the notebook's own), and its no-account notice is a hand-rolled second
  copy of `NotebookNoAccountNotice`.
- **`--nb-shadow` survives under a notebook name.** The brief named `--shadow-*`
  as its destination; there is no such family anywhere in `src/`. Nine other
  `--nb-*` tokens likewise have no counterpart and had to survive -- see the
  CLAUDE.md list.
- **Font sizes were not swept.** `--fs-*` has zero consumers repo-wide, the scale
  is too coarse for the notebook's range (nine distinct sizes sit between the
  0.72rem and 0.9rem steps), and the brief named family, radius and spacing, not
  size. Adopting it would be a re-typesetting dressed as a token sweep.
- **`--nb-ink-faint` measures 3.66:1 on the light plate** (`--text-3` after the
  alias), which is below 4.5:1 and carries the column dates, counts, free-form
  note lines and the grid legend. This is PRE-EXISTING -- measured at the same
  3.66 before any edit -- and it is a palette value, so correcting it is a change
  to a plate rather than to the sweep. Reported, not silently altered.
- **Tap targets under 44px that remain** are the review grid's own cells (30x30,
  the documented locked-contract exception) and two `<select>`s at 39px, both
  pre-existing; nothing that met 44px before falls below it now.
- The notebook's `.eyebrow` is Rajdhani where the classroom's is Share Tech Mono.
  That follows directly from "Rajdhani replaces the system font stack" and is
  flagged rather than quietly widened.

---

