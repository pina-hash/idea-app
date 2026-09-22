---
title: "The classroom split takes a bounded parent, and --cr-chrome-h stops deciding a pane height"
date: 2026-09-22
branches: ["claude/new-session-w594ua"]
migrations: []
subsystems: ["classroom", "shell", "verification"]
---

Ledger 0277. Haden Klinman filed "screen cuts off at bottom sometimes" on
2026-09-15 against build `8b115a7`, from an IDEA209H item page at 2133x1058.
The word that mattered was "sometimes". Two files under `src/` changed, both
in `$lib/shell`; the five other files the prompt handed this lane were
audited and needed no edit.

## What the constant was actually doing

`split.css`'s default `scroll="panes"` bounds each pane at
`calc(100vh - var(--cr-chrome-h))`, `--cr-chrome-h: 10.5rem` -- 168px -- and
the classroom section route mounted `ClassSplit` with no `scroll` prop, so
that default was the classroom's arrangement. Measured in Chromium 141 on
`/dev/classroom-split`, the chrome above the split against that 168px:

| surface | chrome | vs 168px | document overflow | pane bottom vs viewport bottom |
| --- | --- | --- | --- | --- |
| item page, one-line trail | 157.9px | **-10.1** | 0 | -10.1px (short) |
| item page, trail wrapped | 184.3px | **+16.3** | 16px | +16.3px (past the fold) |
| class page | 201.3px | **+33.3** | 33px | +33.3px (past the fold) |

One number was wrong about all three, in both directions. The class page
carries a section tab bar and an item page does not -- `ClassroomShell` gates
it on `tab`, which `activeTab` returns null for on an item -- and the item
page instead carries a 44px "Hide other items" button in its breadcrumb row,
which `canCollapseNav` offers only there. So the two surfaces have genuinely
different chrome and always did.

The 33.3px on the class page is unconditional at every desktop size whose
list is long enough to reach the cap: measured at 1440x900, 1280x800 and
1366x768, and absent at 2133x1058 and 1920x1080 only because the 20-item
fixture's list stops at 797px, under the 890/912 cap those heights give. A
real class reaches the cap at any height. `overscroll-behavior: contain` is
what makes it a defect rather than an annoyance -- a wheel over the pane,
which is the whole screen while nothing is open, never chains out to the
document, so the 33px below the fold cannot be scrolled to where the content
is.

## "Sometimes" is the breadcrumb trail wrapping, and it is the class's name

The item page's own chrome crosses the constant when `.crumbs` goes to two
lines: 60px to 86.4px, chrome 157.9px to 184.3px. Swept across nine widths
from 1024 to 2133 with a 69-character section label, it wrapped at 1024 and
1100 and was one line from 1200 up. So whether an item page clipped depended
on the length of the class's own name against the width of the window, which
is exactly the shape of a report that says "sometimes".

**The prompt's claim that a long ITEM TITLE wraps the trail is wrong, and the
tree wins.** `.crumbs span[aria-current]` is `white-space: nowrap` with
`text-overflow: ellipsis` and `max-width: 22rem`, so the title crumb cannot
grow past 352px however long the title is; the fixture's 89-character title
kept the trail on one line at every width measured. It is the section label,
which has no such cap, that wraps it.

**What was NOT reproduced: a clip on an item page at 2133x1058.** At that
size the crumbs box is capped at `--measure-split` (92rem, 1472px) and the
trail measured 884px even with the synthetic long label, so it does not wrap
and the item page's chrome stays at 157.9px, ten pixels under. The class page
at 2133x1058 clips as soon as the list is longer than this fixture's, which
is the likeliest thing behind the report; the wrapped-trail item case is real
at narrower windows. Both are gone either way -- the fix removes the class of
defect rather than the instance -- but this entry does not claim to have
reproduced the exact frame the student was looking at.

## The fix, and why it is not a prop

`split.css` already argued the whole thing in its own words, under
`fill-height`: "The constant is not wrong by a few pixels, it is wrong by a
DIFFERENT amount per surface and per state ... THE CALLER'S HALF OF THE
CONTRACT is a bounded parent." So this is that variant, taken structurally:

```css
@media (min-width: 1024px) {
	.cr-app,
	.cr-root:has(> .cr-split:not(.page-flow)) { height: 100dvh; overflow: hidden; }
	.cr-root:has(> .cr-split:not(.page-flow)) { display: flex; flex-direction: column; }
	.cr-app > .cr-app-body,
	.cr-root > .cr-split:not(.page-flow) { flex: 1 1 auto; min-height: 0; }
}
```

plus the same two structural selectors added to the three existing
`fill-height` rules, so the pane geometry is stated once and only the
selector lists grew.

**A `scroll="fill"` prop on the classroom's mount was written first and does
not work, for two reasons.** The caller's half of the `fill` contract is a
bounded PARENT, and `.cr-root` is rendered by
`src/routes/classroom/+layout.svelte` while the split is rendered by
`src/routes/classroom/[sectionId]/+layout.svelte` -- two files, and a prop on
the second supplies nothing to the first. And the dev harness at
`/dev/classroom-split` mounts the identical shell into its own `.cr-root` and
passes no props of its own, so a prop-keyed fix would have been measurable on
no harness at all, which is the one thing that makes the numbers above
possible. `classroom.css` already reaches across that same gap with a
`:has()` rooted at `.cr-root`, for the nav-collapse toggle, and says in its
own comment why.

**`--cr-chrome-h` is now resolved by nothing in this tree** -- every shipped
mount names `page` or `fill`, and the classroom is bounded by its room. It
stays, because `panes` is still `ClassSplit`'s default and a surface that
takes the default must still get a bounded pane rather than one that grows to
its content. Both places that said "the default is the classroom's"
(`split.css`'s header, `ClassSplit`'s `scroll` prop doc) are corrected in
place and say so, since that sentence stopped being true here.

## Two bugs in this lane's own first draft, kept because the second is easy

The first draft put `display: flex` on the BODY selector rather than on the
room. `.cr-root > .cr-split:not(.page-flow)` outranks `.cr-split { display:
grid }`, so both panes collapsed into a flex row; and `.cr-root` itself never
became a column, so `height: 100%` resolved against an auto height. Measured
at 2133x1058: the detail pane came back 1058px tall with its bottom 157.9px
below the fold and the item footer clipped by 109.6px -- a worse version of
the defect being fixed, and it looked plausible on every presence and
contrast row. The rule now carries a comment naming both. The lesson worth
keeping is that a `:has()`-keyed structural rule is high-specificity by
construction and will silently outrank the component's own `display`.

## Results

Every desktop case, after: document overflow 0, pane bottom exactly on the
viewport bottom (0.0px), item footer reachable with 0px below the fold.

| case | before | after |
| --- | --- | --- |
| item 2133x1058 | pane 890px, 10.1px short | pane 900.1px, flush |
| item 1440x900 | pane 732px, 10.1px short | pane 742.1px, flush |
| item, wrapped trail, 1024 | 16px doc overflow, 16.3px past the fold | 0, flush |
| class 1440x900 | 33px doc overflow, 33.3px past the fold | 0, flush |
| class 1280x800 | 33px doc overflow, 33.3px past the fold | 0, flush |
| class 1366x768 | 33px doc overflow, 33.3px past the fold | 0, flush |
| anything at 375x900 | unchanged | unchanged, byte for byte |

The panes still scroll independently and still carry
`overscroll-behavior: contain`; the nav pane scrolls its own content at
1440/1280/1366 exactly as before.

## Per-consumer proof

Every other mount of `ClassSplit` was driven at 375 and 1440 and compared
field for field (split count, document overflow, document height, both panes'
box height, max-height, overflow-y, overscroll-behavior and whether they
scroll) before and after: **19 of 20 route/width runs identical**. The
notebook feed, the notebook review console, the coin desk, the maps editor,
all three Foundry mounts, `/dev/classroom-inspector` (a `page-flow` split in
a `.cr-root`, excluded by `:not(.page-flow)`) and view-as did not move by one
pixel.

The one that moved is `/dev/classroom-stream` at 1440, the second classroom
harness, and it moved the intended way: its nav pane was capped at the
constant's 732px with 86.1px of viewport unused below it (its chrome is
81.9px -- no breadcrumb row, since it passes a single crumb), and now takes
818.1px and ends exactly at the fold. Nothing was clipped either way; the
pane gained 86px of reading height. `display` stays `grid` and the column
track list is identical in both.

## Verification

- `svelte-check`: **0 errors, 37 warnings in 20 files**, 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`, before AND after. Re-derived rather than read off
  `CLAUDE.md`, after exporting the two `PUBLIC_SUPABASE_*` values and running
  `svelte-kit sync`.
- Both widened browser specs green at 375, 1440 and 2133.
- **Mutation proof**: with `split.css` reverted to HEAD and everything else in
  place, the run reports 4 measurements outside threshold at 1440 and 2133 --
  the class-page row returns
  `["room-bounded:no-overflows-33px", "scroll-arrangement:pane-past-fold-by-33.3px"]`
  and the item row `["room-bounded:yes", "scroll-arrangement:pane-short-by-10.1px",
  "footer-reachable:yes"]`. Restored from a saved copy (never
  `git checkout --`) and md5-verified identical; 0 outside threshold again.

### The instrument bit once, and the check it produced

The first reachability probe reported the item footer 849px below the fold at
375px on a page where it is perfectly reachable. `src/app.css` sets a global
`scroll-behavior: smooth`, so `window.scrollTo(0, y)` ANIMATES and the rect
read on the next line is the position before the scroll. Both scrolls in the
committed probe pass `behavior: 'instant'`, and the probe refuses to call
anything reachable unless it can also say it arrived -- `scrollTop` within
1px of its own maximum -- so a scroll that silently did not happen returns
`footer-reachable:cannot-say-scroll-did-not-reach-end` rather than a verdict.

## What this lane did NOT verify

- The live site. No cloud session can open a Vercel preview, and nothing here
  was measured against production.
- A signed-in classroom route. Every number above is from
  `/dev/classroom-split`, which mounts the real `ClassroomShell`,
  `ClassSplit` and `ItemDetail` against a fixture. The shipping route differs
  from that harness in one way this lane could not close: the composer is a
  fixed full-viewport dialog on the real route and an in-pane `overlay` on
  the harness, because `src/routes/dev/classroom-split/[sectionId]/+layout.svelte`
  was outside this lane's file list. A fixed layer is not clipped by an
  `overflow: hidden` ancestor that has no transform, filter or containment,
  and `.cr-root` has none -- but that is read off the spec and the tree, not
  measured in a browser.
- Whether students are in class right now.

## For Mr. Pina

1. **The prompt's claim 4 is half wrong and the correction is worth keeping**:
   a long item TITLE cannot wrap the breadcrumb trail (it is capped at 22rem
   with an ellipsis); a long CLASS NAME can, and that is the "sometimes".
2. **The harness and the shipping route disagree about the composer**, above.
   Closing it means teaching `/dev/classroom-split` the `screen` composer the
   real layout uses, which belongs to whichever lane owns that route.
3. **`--cr-chrome-h` now has no reader.** It is kept as the safe default for a
   surface that takes `scroll="panes"` and means it. If a later bundle would
   rather the default were `fill`, that is a decision about every room at
   once, not a tidy-up.
