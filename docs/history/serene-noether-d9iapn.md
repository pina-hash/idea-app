---
title: The Foundry gallery is a mosaic of student thumbnails
date: 2026-09-12
branches: ["claude/serene-noether-d9iapn"]
migrations: []
subsystems: ["foundry"]
---

Mr. Pina, 2026-09-12: every card in the gallery is the same brownish orange and
he does not like it. He wants it to look like a Steam library, which he called
beautiful. Specifically: the card IS the uploaded thumbnail, at whatever aspect
ratio the student uploaded, so the gallery is a mosaic of varying shapes rather
than a uniform grid; the app's name lives in the thumbnail the student makes,
with a hover popup naming the app for anyone who needs it; and students get more
customisation over their own card.

## What was there, and where the colour came from

The card was `FoundryGallery.svelte`'s own `{#each}` block: a `.fdy-card-cover`
box pinned to `aspect-ratio: 16 / 9`, with a `.fdy-card-body` panel under it
stacking title, tagline, author, class and plays, the whole thing on an opaque
`--surface-1` plate inside a `--boundary` frame, in a
`repeat(auto-fit, minmax(min(20rem, 100%), 1fr))` grid.

The colour is the forge room's plate and not a rule of the card's:
`--surface-1` aliases `--fg-surface` (`#14110d`) and `--surface-2` aliases
`--fg-surface-2` (`#1b1712`), both stated in `forge.css` as "near-black with a
faint WARM cast". Measured on the harness, the card came back `rgb(20, 17, 13)`
and the cover box `rgb(27, 23, 18)`.

**The sameness was the second half, and it is the half that mattered.** With no
cover uploaded, every card drew `.fdy-card-blank` -- an identical `#1b1712` 16:9
tile carrying one letter. A gallery of those is N copies of one warm-brown
rectangle, which is exactly what "every card is the same brownish orange"
describes. And it is an ORDINARY state rather than an edge case:
`foundryPublishBlockers` requires a description to publish and has never
required a picture.

## No cover dimension is stored anywhere, and that shaped everything

`student_apps.cover_path` (0130) is the only cover column in the schema. There
is no width, no height, no mime and no byte size, on any migration; 0132 and
0173 only re-project the same column. This lane carried no migration, so the
aspect ratio has to be MEASURED from the decoded image in the browser.

`foundryCoverMeasured` does it, and it stamps the result on the element as a
custom property rather than into a keyed reactive map -- the same mechanism
`foundryCoverFailed` already used beside it, for the same stated reason: the
gallery and `/foundry/mine` draw one of these per row, and a keyed flag has to
be kept in step with a list that reloads after every save.

Worth knowing alongside that: nothing constrains an uploaded cover today.
`$lib/upload-limits.ts` records the cover row as `guards: ['bucket']` --
"nothing checks a size before sending" -- and no code anywhere looks at its
dimensions. The 1:9 upload is not hypothetical, it is simply one nobody has made
yet.

## The clamp, and the property it buys

`[0.5625, 2]` -- 9:16 to 2:1 -- and both ends are measured from what students
actually upload rather than chosen as round numbers.

The tall bound is a portrait phone screenshot, the tallest thing anybody
legitimately hands in. **What it buys is that at 375px, in the 343px column the
grid actually gets, the tallest possible card is 610px -- shorter than the 667px
viewport of the smallest phone in common use.** So one upload can never occupy a
whole screen and there is always a next card in view. Measured on the harness at
both widths: ratios 0.563 to 2.000 across eleven cards, tallest 610px at 375 and
443px at 1440, shortest 172px and 125px.

The wide bound is one notch past the 16:9 a browser window, a desktop app window
and a landscape phone all sit at or under, so every real landscape screenshot
passes through unclamped.

**A modern tall phone is clamped, deliberately, and it costs a crop.** 1179x2556
is 0.461, so `object-fit: cover` trims roughly its top and bottom 9%. Losing a
strip of a very tall screenshot is a much smaller price than one card filling a
phone screen, and the detail pane shows the app itself at full size.

## Multicol, not a grid, and what that costs

`CLAUDE.md` already states the mechanism: panels of unequal height go in a
multi-column container and never in a grid, because a grid ROW is as tall as its
tallest member. In a mosaic of arbitrary shapes that is fatal -- a 2:1 card
beside a 9:16 one kills most of a row. Columns have no rows to lock.

The column ceiling is capped at the number of cards, because multicol has no
`auto-fit`: it cuts every column the width holds and leaves the spare ones
empty. Measured: 5 columns at 1440 and 1 at 375, with no horizontal overflow at
either width (`scrollWidth` equal to `clientWidth` on the list and on the
document).

**WHAT IT COSTS, and it is a real cost: the reading order is COLUMN-MAJOR.**
Under `Most played` the second-ranked app sits below the first rather than
beside it. That is the price of a gapless mosaic in CSS today --
`grid-template-rows: masonry` is not shipped, and the alternatives are a JS
layout pass or `grid-auto-flow: dense`, which reorders a ranked list outright in
order to backfill its holes. It is written into the stylesheet rather than left
to be rediscovered.

## The no-cover default is the session's proposal, not his

He did not address it, and it decides half the design. **A generated cover**: a
plate whose hue comes from the app's own id, carrying the app's title as the
art, at a fixed 3:2.

The reasoning is that the complaint is SAMENESS, and one flat fallback colour
reproduces it exactly for every app without a picture. A per-app hue ends that,
and painting the name into a cover we generate is the one case where "the name
is in the thumbnail" can be GUARANTEED rather than asked of a student.

**The hue can never land in the band this room reserves for heat.**
`forge.css` gives the amber `--fg-heat-*` scale one meaning -- IN PROGRESS --
and says nothing else may wear it; its five stops measure 21.7 to 35.2 degrees,
so 15-50 is excluded with margin. Swept over 20,000 generated hues: 0 inside the
band, with the predicate's own positive control beside it.

**The honest caveat, recorded because it is the weakest part of this bundle.**
His words include "no generated color". Read in context that describes the card
for an app that HAS a thumbnail -- no chrome, no tint, no panel -- and he
separately left this case unaddressed. But it is the closest thing in his own
words to an opinion against this, and if he overrules it the alternative is one
line: a flat `--fg-surface-2` plate with the name on it, and coverless apps go
back to looking alike.

## Four routes to the name, because a hover popup cannot be the whole answer

This is a student surface opened on phones, and a touch device cannot hover.

1. A generated cover paints the name as its art, permanently, at every width.
2. An uploaded cover carries a name plate, permanent on a touch device and at
   phone widths.
3. On a wide viewport with a pointer, that same plate is the hover popup, and
   keyboard focus opens it too.
4. `aria-label` on the link, in every configuration, so the accessible name
   never depends on a visual state.

**The reveal is written as the enhancement that has to be opted into**
(`@media (hover: hover) and (min-width: 48rem)`), never as a hide that a query
has to undo. Anything the media query cannot speak for gets a name rather than a
bare picture, so the failure mode is a plate somebody did not need. Measured at
375: nine plates, opacity 1, `hover-reveal false`. At 1440: nine present,
opacity 0, revealed to 1 by focus.

**A tension worth naming: at 375 the plate IS an overlay panel, which he said no
to.** The prompt's own touch requirement is what forces it. It is kept to a
name-only strip on a scrim rather than the panel of metadata that used to sit
under every card, which is as close to "no overlay panel" as the touch
requirement permits.

## Two defects the measurements found that a threshold pass did not

**The `made` predicate disagreed with the render branch.** `made = !src` gave a
card whose `cover_path` is not a storage key a generated hue it never used AND
withheld its name plate, so that app's name appeared nowhere on its card at any
width. It renders `.fg-cover-bad`, not a generated cover. Found by reading the
harness's own per-card dump (`bad-key ... made Y plate null`) after the
screenshot looked fine.

**A ranked gallery showed no numbers at 1440.** The browser spec reported the
play chips `present 2, visible 0`: they sit on plates the hover reveal hides, so
pressing `Most played` produced a wall of pictures in an order the reader cannot
check -- worse in a mosaic than in a grid, because it reads down its columns. A
plate carrying a count is now exempt from the reveal. Under `Recent`, the
default and the state the gallery is normally looked at in, no card carries one
and every card is the pure picture.

A third, smaller: the failed-cover card painted Chromium's own broken-image
glyph over the top-left of `[data-cover-failed]`'s pattern. Neither
`color: transparent` (already in the rule) nor `content: ''` removes it, both
measured. What removes it is giving the element a picture that decodes, so
`foundryCoverFailed` now swaps in a 1x1 transparent GIF -- and
`foundryCoverMeasured` refuses an element already marked failed, because a 1x1
is a perfectly measurable square and would otherwise stamp a 1:1 card. It went
unnoticed while a cover was a small framed thumbnail; the card is the picture
now, so the glyph is the picture.

## What the student got

The card is their picture, and its SHAPE is theirs too -- a tall cover makes a
tall card. `/foundry/mine` now previews it with the REAL `FoundryCard`, not a
second rendering of one, which is why the card is a component at all: a preview
that drifts from the thing it previews drifts about exactly what they are
deciding from. The note beside the upload says the picture is the card, that its
shape is theirs, that the name should be in the art, and that a cover under 800
pixels wide will be stretched and look soft.

That last sentence is a COST this bundle introduced and did not hide. The old
fixed box letterboxed a small screenshot and rendered it sharp; a card that IS
the picture has to fill its column, so a small cover is upscaled. It is not
recoverable while the card is the picture, so it is answered where a student can
act on it.

## Verification

- **Full suite 406 files / 7837 tests / 0 failures.** Two files were red
  mid-bundle and both were this change's doing: `tests/derived-numbers.test.ts`
  (the counts region, stale until regenerated) and three assertions in
  `tests/foundry-gallery.test.ts` pinning the letter tile, `scale-down` and the
  card's class line. The three were rewritten as the stronger claims the change
  makes available rather than relaxed -- see that commit for why each moved.
- **`svelte-check` 0 errors, 38 warnings, 21 files** (34 -> 32
  `state_referenced_locally`, 5 `css_unused_selector`, 1
  `perf_avoid_nested_class`). **The branch point `eef6e85` was measured in a
  worktree and reports the IDENTICAL 0 / 38 / 21**, so this change moved neither
  number. `CLAUDE.md`'s stated baseline of 40 in 22 files is stale at this
  branch point; ledger 0168 measured 38 / 21 independently and also reported
  rather than edited. Reported, not fixed: `CLAUDE.md` is outside this lane's
  Owns and four lanes were live on it.
- **`verify:browser` on every foundry spec: 18 route/width runs, 336
  measurements, 0 outside threshold.**
- **One `verify:readme` pass on the committed tree at `1c29061`**, scoped with
  `--route foundry`: 9 specs re-measured in **51.7s**, where the old single-line
  region cost a full pass. The store now holds 197 specs / 394 runs / 6898
  measurements / 0 outside threshold.
- **Mutation proof, both directions, eleven mutants in the dom suite** -- lazy
  loading restored, the accessible name dropped, a generated cover's name
  dropped, a plate added to a generated cover, `made` keyed on the src alone,
  the chrome panel restored, `Recent` showing counts, the column ceiling
  unbound, the clamp removed, an unloaded image reporting the fallback, and the
  hue allowed into the heat band. All eleven redden; all three files restored
  byte-identically by md5 and re-verified green. Restores are FROM A COPY, never
  `git checkout --`, which on an uncommitted tree discards the session's own
  work and makes every later mutant pass against a pristine original.
- **Four more against the browser spec**, and two of them found gaps in the
  spec rather than in the page, which is the reason that proof was worth
  running:
  - **the contrast check was checking its own arithmetic.** It carried the
    scrim's alpha as a LITERAL, so thinning the real scrim until the name
    failed changed nothing it measured. It reads the gradient's stops off the
    page now and interpolates at the glyph's own top edge: thinning the scrim
    takes it to **1.11:1** and reddens.
  - **the column-ceiling mutant is invisible to geometry** on this fixture --
    1294px of pane fits five 15rem columns whatever the ceiling says, and there
    are eleven cards. The ceiling only binds with FEWER cards than the width
    allows, so it is asserted structurally in the dom suite, where the mutant
    does redden, and the spec says so rather than implying coverage it lacks.

### Contrast, composited, because both grounds are gradients

The ordinary `contrast` check cannot measure either text on this card and must
not be asked to: its ground-walk looks for an opaque `background-color` up the
ancestor chain, and the plate is a scrim over a student's photograph while a
generated cover is a gradient. Pointed at either it reported a
confident-looking **14.59:1 against `rgb(27, 23, 18)`** -- the card's bed, a
colour that is behind both and painted over by both. That is `CLAUDE.md`'s
`color-mix` warning in a different costume.

Composited instead:

- **the plate's name over a PURE WHITE photograph: 7.60:1**, at a scrim alpha of
  0.74 read off the page at the glyph's top edge. White is the worst ground a
  student can ever supply, so this holds for every cover rather than for a
  fixture.
- **a generated cover's name on its two gradient stops: 9.58:1 and 14.06:1.**
  The gradient is fixed in lightness and only its hue moves, so the pair stands
  for every app.

### Two instrument findings, both of which produced a wrong reading first

- **`fullPage: true` perturbs the page.** A full-page capture made the name
  plate read **0.147** where the settled page rests at 0, and made a 4-column
  screenshot of a 5-column layout. Both looked exactly like defects. Measured
  four ways over three seconds with no animations pending, at rest it is 0 and 5
  columns. Viewport screenshots after a settle are the instrument; fullPage is
  not.
- **A screenshot taken straight after the images decode catches the multicol
  mid-balance**, so the spec settles 900ms before any geometry is read.

## Not verified

- **Production.** `ideabosco.com` and `apps.ideabosco.com` both answered 200,
  but nothing here was checked against real student covers: this container
  cannot reach the database, and every cover in every fixture was generated by
  the harness. **The clamp has never met a real upload.** The shapes it was
  measured against are the ones this bundle chose.
- **The Vercel preview**, which no cloud session can check.
- **A real touch device.** `(hover: none)` was not exercised -- the harness
  Chromium reports `hover: hover` at every width. What IS measured at 375 is the
  width half of the same condition, which is why the condition is a conjunction
  and why the plate is permanent unless BOTH halves hold.
- **`prefers-reduced-motion: reduce`**, which the harness does not set. The only
  thing gated behind it is the plate's 180ms fade; with it cancelled the plate
  is at full opacity with no transform, so nothing is hidden in a base state.

## Deliberately not done

- **No migration**, so no cover dimension, focal point or per-app colour is
  stored. Every one of those would make the card more customisable and every one
  is a schema change with its own answer for the rows already stored.
- **`FoundryMine`'s own app list** still draws its small square thumbnails. It
  is a management list rather than a gallery, and the preview beside the cover
  upload is where that surface now shows the real card.
- **`docs/decisions/entries/03-*`** (the LAUNCHER card's colours) is ledger
  0173's and was not touched. It is a different surface from this gallery card,
  though it carries the same complaint.
