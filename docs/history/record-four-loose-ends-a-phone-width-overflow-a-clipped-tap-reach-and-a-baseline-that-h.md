---
title: "Four loose ends: a phone-width overflow, a clipped tap reach, and a baseline that had drifted (code only, NO migration)"
date: 2026-08-22
branches: []
migrations: []
subsystems: ["Build, theme, tests, conventions"]
record_order: 115
---

Four items handed in from earlier sessions, three of them found in passing. One
turned out to be already fixed; the write-up says so rather than claiming it.

### The home page overflowed horizontally at 375px

`documentElement.scrollWidth` 412 against a `clientWidth` of 375, on a page that
is the home screen on a phone. Confirmed pre-existing (it reproduces on a stashed
tree, so it predates the launcher work).

**The measurement itself is the first finding.** `window.innerWidth` reported
**412** on the same page while `documentElement.clientWidth` reported **375** --
and the harness page beside it, which does not overflow, reported 375 for both.
That is not a scrollbar. With `width=device-width`, an overflowing document zooms
the VISUAL viewport out to fit while leaving the layout viewport at 375, so
`innerWidth` grows to describe the damage and reads as if there were none. Every
width claim here is `documentElement.clientWidth`.

Two causes, the same defect twice: a flex item's automatic minimum is its
min-content, and neither of these could get under it.

- **`.launcher-actions`** (`src/lib/AppLauncher.svelte`) was `inline-flex` with
  no wrap: a 156px sort select plus a 116.5px and a 95.2px button plus two
  0.9rem gaps = **396.5px** of min-content inside a **343px** bar. Now
  `flex-wrap: wrap` + `min-width: 0`, which drops the requirement to the widest
  single control. Measured after: bar 343, actions 343, right edge 359 against
  375; document `scrollWidth` 375 = `clientWidth`. At 1440 the row is unchanged
  -- one line, right edge 1230.5, flush with the bar as before.
- **`.legacy-index .course-meta`** (`src/app.css`) carried `flex-shrink: 0`. The
  chips inside it already wrap among themselves, so the row only ever needs the
  widest ONE -- refusing to shrink handed it the whole nowrap sum instead. The
  harness fixture hides this because its teacher address is short; with a
  representative local part the right edge measured **401.3px** against 375.
  Now `min-width: 0` and no `flex-shrink`, plus `overflow-wrap: anywhere` on
  `.section-meta`, because an address local part has no space to break at and
  its min-content is otherwise the whole token. Measured after: right edge
  **342** for a 60-character address, 33px inside the viewport. At 1440,
  byte-for-byte the same geometry as before (261.2 / 205.7 / 133.2 wide, all
  right-aligned at 1188.1, one line each).

### `.pick-meta` on a selected quick-pick -- ALREADY FIXED, and re-measured

The report described `--text-3` on the brass wash at 3.63:1, failing on every
plate. **That is the pre-`f334756` state.** The rule shipped in that commit and
is in the tree. The report also names a "retired dark" plate, which `e4258a2`
removed -- which is what dates it.

Re-measured anyway, by compositing the wash onto its real ground and painting the
result to a canvas (the ground was asserted opaque by painting the chain over
both black and white and requiring the same pixel back):

| plate | wash | `.pick.selected .pick-meta` |
| --- | --- | --- |
| default | `rgba(200,168,72,.18)` | **5.37:1** |
| light | `rgba(200,168,72,.13)` | **7.04:1** |
| idea | `rgba(108,244,181,.15)` | **6.42:1** |

A sweep over every element in the notebook whose background chain contains the
wash, on all three plates, returns **no `.pick-meta` failure** -- and returns two
OTHER near-misses on the light plate, which is the positive control saying the
sweep is reading the right property. Those two are under "Fixed in passing"
below, as NOT fixed.

### The breadcrumb's upward tap reach was dead

Hit-testing `.crumbs a` down its full span: **9px** of upward reach against the
22px a 44px target needs -- exactly the link's own half-height, so the entire
`.tap-reach-44` extension above the link was being taken by something else. That
something was `div.app-header.cr-header`, at every sampled y.

**It was paint order, not a real target conflict.** The masthead's bottom band is
16px of padding: a hit-test across the full width at 6px above its border returns
the header div itself at every x from 20 to 1420, and its tallest child ends 17px
short of the border. Nothing there is tappable. But `.cr-root .app-header` is
`z-index: 2` and the reach is a positioned pseudo-element at `z-index: auto`, so
the header painted over it and took the tap.

**Raising the trail is the rejected alternative, and the header's own comment is
why.** `.sw-menu` is trapped inside the header's stacking context, so any value
that gets the reach past the header -- 3, or 2 and winning the tie on document
order -- also puts it over the open section switcher, which drops down across
exactly this strip. Making the menu escape (a portal, or `position: fixed` with
scripted anchoring) is a different and much larger change, and this repo already
carries a note about anchored menus breaking when the trigger's row wraps. The
pin stays untouched.

So the trail was given real room: `padding-top: var(--space-4)` on `.crumbs`, and
its `ol` bottom margin 8px -> `var(--space-4)`. **16px rather than 12px on
purpose** -- the requirement is 12.8px, and a floor rounds both ways, so
`--space-3` would clip 0.8px off the top and measure 43.2px while reading as
snapped to the scale.

The second half was not in the report: **the downward reach was borrowed, not
free.** It extended 4.8px into `.sec-tab`'s own 44px box and won the hit test
there, leaving the tab bar 39.2px.

Measured after, at 1440 and at 375, through `/dev/classroom`'s shell view:

- Every crumb link: **44px** of contiguous vertical ownership, bounded above by
  `nav.crumbs` and below by `div.cr-root` -- its own edges, not a neighbour's.
- Horizontally unchanged: 64px for a 62.2px link, stopping at the sibling `li`,
  so two crumbs 0.35rem apart still keep their own taps (`--tap-reach-w: 0px`).
- Every `.sec-tab`: **44 of 44px** owned (was 39.2).
- With no tab bar at all (`/classroom/updates`): still 44px, and `main`
  (`z-index: 1`, relative) does not clip it.
- **The pin still does its job**, which is the control that matters here: with
  the switcher open at 375px, all five `.sw-item` rows hit-test to themselves
  (39-40px of 40). Had the trail been raised instead, these are the rows that
  would have gone dead -- the exact bug the pin was added for.

Cost, stated plainly: **24px of chrome** above every classroom page (16px new at
the top, 8px added at the bottom). That is what a 44px target costs when both
neighbours already own their space. The reach still earns its place over a
`min-height` on the link, because the trail is `align-items: baseline` and a
taller link drags the `/` separators off the baseline -- but the old comment's
claim that the reach avoided the chrome cost was wrong, and has been corrected in
place rather than left to be read again.

### The `svelte-check` baseline said 36 against a tree measuring 37

Two sessions found this independently, which is the signal that the number was
being trusted rather than re-derived. Corrected to **37**, and `CLAUDE.md` now
says HOW to re-derive it (`npx svelte-kit sync && npx svelte-check`, sync first
because stale route types report phantom errors) and carries the breakdown --
**31 `state_referenced_locally`, 5 `css_unused_selector`, 1
`perf_avoid_nested_class`, over 20 files** -- so a total that holds while the mix
moves is still a finding.

### A test that pinned the shape instead of the rule

`tests/classroom-measure.test.ts` asserted `padding: 0 var(--cr-gutter...)`
appeared exactly twice in `ClassroomShell.svelte`. The rule is that the trail and
the tab bar take their INLINE padding from the gutter and neither keeps a
literal; the `0` was incidental, and the assertion broke the moment the trail
took vertical room. **Generalized rather than deleted**: it now parses each
rule's `padding` shorthand (splitting on top-level whitespace only, because
`var(--cr-gutter, 1.2rem)` carries a space of its own) and asserts every inline
side reads the gutter, naming which row failed.

Re-mutated to confirm it still bites:

- Literal gutter on `.crumbs` -> `.crumbs keeps a literal inline gutter`.
- Literal gutter on `.sec-tabs` -> `.sec-tabs keeps a literal inline gutter`.
- `.crumbs` padding removed entirely -> `.crumbs declares no padding shorthand`,
  the positive control that stops an unmatched selector sailing past the loop
  with an empty string.

`ClassroomShell.svelte` was restored md5-identical (`09d80c25...`) after each,
and the file is green.

### Verified

- `svelte-check`: **0 errors, 37 warnings**, unchanged by this bundle.
- Full suite: **88 files, 2135 tests, all passing.**
- Browser measurement at **1440** and **375** for every geometry and colour claim
  above, through `/`, `/dev/home-feed`, `/dev/notebook` and `/dev/classroom`.

### NOT verified

- **No screenshot.** The Browser pane does not composite. Every number above is a
  measured computed-style, geometry or hit-test read, or a canvas pixel read
  back.
- **No live Supabase and no signed-in session.** The classroom feed's overflow
  was reproduced on `/dev/home-feed` with a representative teacher address
  injected into the real component, not against a real roster; the signed-in
  home page was never rendered.
- **`npm run build` was not run** (the pre-existing Windows EPERM in the Vercel
  adapter's `closeBundle`).
- **No real phone.** 375px here is an emulated viewport, and the pinch-zoom
  behaviour that made `innerWidth` read 412 was observed in emulation.

### Fixed in passing, and said out loud -- NOT fixed, deliberately

Both found by the wash sweep, both on the light plate only, both outside what was
asked for:

- **`.pick.free .pick-label`** ("Something else") is `--nb-accent-ink` on
  `--surface-2` at **4.32:1**, 16.8px/600 -- not large text, so the bar is 4.5.
  This is the SAME value `.nb-guidance`'s own comment already records for an
  authored link on recessed paper, and it was solved there by moving the block to
  raised paper. The same move would work here.
- **A `.count` chip at 4.25:1 and a "Take a photo" label at 4.45:1**, both
  `--nb-accent-ink` on a wash.

These are colour decisions on a surface this bundle was not asked to change, and
a fourth unrequested colour edit is how a scoped bundle stops being reviewable.
Raised here with the numbers so the decision is somebody's rather than nobody's.

---

