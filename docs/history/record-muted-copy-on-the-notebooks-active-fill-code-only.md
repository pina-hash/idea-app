---
title: "Muted copy on the notebook's active fill (code only)"
date: 2026-08-22
branches: []
migrations: []
subsystems: ["Digital notebook"]
record_order: 113
---

## Muted copy on the notebook's active fill (code only)

The one finding the console-plate bundle raised and did not fix. One CSS rule,
plus the sweep that found a second thing and then unfound it.

### What was wrong

`.pick-meta` is `--text-3`, which is REAL MUTED COPY in the notebook rather than
the classroom's decorative tertiary. On a SELECTED quick-pick the button's ground
is replaced by `--nb-accent-wash`, an 18% brass veil, which lightens the ground
out from under the text on a dark plate. Measured composited, by painting to a
canvas and reading the pixel back with `* { transition: none }` injected first:

| plate | wash ground | meta ink | before | after |
|---|---|---|---|---|
| default (console register) | `#312d1b` | `#79867d` -> `#9aa49d` | **3.63** | **5.37** |
| IDEA | `#1d3b2d` | `#7a8f83` -> `#abc1b4` | **3.55** | **6.42** |
| light | `#f8f4e7` | `#706b62` -> `#57524a` | 4.81 (passed) | **7.04** |

Identical at 1440px and at 375px. The retired warm dark plate measured 3.49 on
the same case, so this is pre-existing on every dark plate the room has ever had
and the console register was the best of the three, not the cause.

The UNSELECTED `.pick-meta` keeps `--text-3` and still measures 4.62 / 4.67 /
5.66 on its own ground -- the fix is scoped to the state that moves the ground,
rather than sweeping the token off the surface it was tuned for. The nested
"Draft in progress" span inherits (verified: `#79867d` at 4.62 unselected,
`#9aa49d` at 5.37 selected), which is why it is not named separately.

### Why not lower the wash

That was the other option and it is worse. The alpha needed to rescue `--text-3`
is about 6%, and at 6% the fill measures **1.09:1** against the card -- the
selected row stops being marked at all, which is the wash's entire job. The
token stays; the text on top of it moves.

### The rule this is an instance of

`--text-2` clears on ALL NINE combinations of three plates x the three grounds
the wash can land on (worst 4.89, default plate over `--surface-2`), where
`--text-3` fails six of them at 3.30-4.31. Note the light plate is in that
failing set too: it passes over the CARD at 4.81 and fails over `--surface-2` at
4.31, so "light is fine" was true only of the case that happened to be on
screen. Promoted to `CLAUDE.md`.

`NotebookThemeToggle` already shipped `.option.current .note { color: var(--text-2) }`
for exactly this reason. This is the second implementation of one rule, not a
new idea, and the two now say so in their comments.

### The sweep, and the three ways it lied first

Asked for "any rule putting `--text-3` on top of `--nb-accent-wash` anywhere in
`src/lib/notebook`". Answer: **exactly one**, `.pick.selected .pick-meta`. Three
earlier versions of the sweep said otherwise, and each failure mode is worth
recording because each one produced a plausible answer:

1. **Forcing the wash onto unscoped base selectors over-reported.** `.row`,
   `.callout`, `.level`, `.option`, `.pick` are not unique across components, so
   a global `background: var(--nb-accent-wash)` painted it onto elements no rule
   would ever paint, and the sweep found 47 failures on the default plate. Every
   one outside `.pick` was an artefact.
2. **`CSSStyleRule` has a `cssRules` property now (CSS Nesting), and an empty
   `CSSRuleList` is truthy.** So `if (r.cssRules) { walk(r.cssRules); continue; }`
   -- the ordinary shape for walking a stylesheet -- skipped every plain rule and
   the sweep reported **zero wash rules and a clean result**, over a document that
   had 17 of them. This is the one that would have shipped: a clean sweep is what
   nobody investigates. Promoted to `CLAUDE.md` under the DOM traps. Two smaller
   ones alongside it: `r.style.background` is read rather than `r.cssText`,
   because with nesting a parent's `cssText` contains its children's
   declarations; and `f.contentDocument` is re-read on every poll, because
   capturing it once at `onload` measured a document the iframe had already
   replaced.
3. **Dropping the state class over-reported again.** Measuring `.option` rather
   than `.option.current` put the wash behind rows that do not have it AND read
   their non-current colour, which reported `.option.current .note` as a failure
   when that rule is the very precedent being followed. The sweep now applies the
   real state -- live elements where the state is already on, forced classes and
   attributes where it is not -- so state-specific COLOUR rules apply too.

Final shape: 13 wash rules on `/dev/notebook` and 7 on `/dev/notebook-review`,
resolved from the live CSSOM; 9 and 2 hosts; 13 and 4 text elements sitting
directly on a wash. **The light column keeps reporting hits throughout, which is
the positive control** -- without it "0 on the default plate" could not be told
from a sweep that generated nothing.

### Verified

- `svelte-check`: 0 errors, 37 warnings (unchanged).
- Full suite: 87 files, 2105 tests, all passing.
- Whole-page contrast sweep, both harnesses x both widths x all three plates,
  12 configurations, every value composited to a canvas. Against a stashed tree
  the counts are identical everywhere except the fixed case: default plate
  1 -> **0** at both widths on `/dev/notebook`, IDEA 1 -> **0** at 1440 and
  14 -> **13** at 375, light unchanged at 9 and 23, `/dev/notebook-review`
  unchanged at 0 / 3 / 0.

### Not verified

- No live Supabase, no signed-in session. **No screenshots** -- the Browser pane
  does not composite, so every value above is a measured canvas or
  computed-style read.
- The `:hover` wash rules (`.chip-link:hover`) have no element to force a hover
  on from script; they were checked by reading the rules rather than measured.
  Neither has a `--text-3` descendant.

### Found and NOT fixed -- all pre-existing, none the shape this bundle is about

Confirmed identical on a stashed tree:

- **`span.dot` (the "·" between meta items) measures 1.48:1 on light and 1.63:1
  on IDEA**, 13 instances at 375px. It passes on the default plate, which is why
  the console-plate bundle did not see it.
- **`span.count` ("+1", the overflow counter) measures 1.13:1 on light.**
- **The portal `.version-badge` and its separators measure 3.20:1 on the light
  plate** -- a shared component in a scoped room, the exact case
  `CLAUDE.md` already documents for `ItemBody` and `SaveIndicator`.
- **Six marginal near-misses on the light plate, 4.14-4.45**, all
  `--nb-accent-ink` sitting on `--nb-accent-wash` (`.pick.free .pick-label`,
  `.option.current .name` and `.tick`, `.tab.selected .count`, `.chip-toggle.on`,
  the photo button's label). That is accent-on-its-own-wash, a different shape
  with a different answer (deepen the light accent ink, or thin the light wash),
  and it wants its own measured pass rather than being folded into this one.


---

