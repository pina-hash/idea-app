---
title: "The reference document's tab strip is operable (code-only; NO migration)"
date: 2026-08-17
branches: []
migrations: []
subsystems: ["IDEA Classroom"]
record_order: 65
---

## The reference document's tab strip is operable (code-only; NO migration)

The section tab strip could scroll and offered nothing that scrolled it. One
pass fixed its scroll containment and keyboard reach; the next hid its scrollbar
"because the edge fade replaced the affordance". **A gradient says there is
more; it is not a control.** What was left: no scrollbar, no buttons, no wheel
handling, no drag -- so the only thing that moved the strip was clicking a
half-visible tab, which also changed the section, and tabs past the last one
reachable that way were unreachable. **TWO EARLIER INSTRUCTIONS ARE REVERSED
HERE and are not to be reinstated: "do not add arrow buttons", and the
hidden-scrollbar exception.**

### Four ways to move it, none of which change the section

- **The SCROLLBAR is the module's own**, inherited from `$lib/shell/split.css`
  with nothing overridden in the component -- which is why the exception had to
  leave that file rather than be narrowed (see "THE ONE DOCUMENTED EXCEPTION IS
  RETIRED" above). `ReferenceDoc.svelte` now contains no scrollbar declaration
  at all, and a test asserts that.
- **PREV / NEXT** at the strip's edges, in their own flex columns rather than
  floating over it: a tab half under a button is a tab you cannot fully see or
  reliably click, which is the state this exists to end. **Both are rendered
  whenever the strip overflows and the spent one is disabled and faded rather
  than removed** -- dropping it out of flow would resize the strip mid-scroll
  and shift every tab sideways the first time the reader moved it. Quiet chrome
  in `--text-2` mono, aligned to the TAB ROW (measured: a stretched button
  centred its chevron 5px below the labels beside it, because the strip is now
  44px of tabs plus a ~10px scrollbar band).
- **The WHEEL**, vertical delta translated to horizontal, on a `{ passive:
  false }` listener because a passive one cannot preventDefault. **Not swallowed
  once the strip is at the end in the wheel's direction**, so the page keeps
  scrolling.
- **POINTER DRAG** past a 6px slop threshold, which cancels the click it would
  otherwise fire (capture phase, so it gets in front of the tab's own onclick).
  Under the threshold it is still a tap and the tab selects. **Touch returns
  early on purpose**: native touch scrolling is what gives the strip its
  momentum, and a 1:1 JS drag would replace a flick that coasts with one that
  stops dead.

`keepActiveVisible` on selection is unchanged; it is simply no longer the only
thing that can move the strip, which is what it had become. Every listener is
attached by hand (the DrawingViewer rule) because neither `{ passive: false }`
nor `{ capture: true }` is expressible as a Svelte event attribute.

### `src/lib/classroom/tab-strip.ts` -- and the reachability bug it caught

The rules deciding HOW FAR each control moves are pure functions over a
`{ scrollLeft, clientWidth, scrollWidth }` measurement, in content-space, with
no DOM. Not tidiness: one of those decisions is the difference between "every
tab can be reached" and "some cannot", and that is a property worth proving over
every layout rather than the handful a browser pass can drive.

**A PRESS LANDS A TAB, IT DOES NOT MOVE A FIXED NUMBER OF PIXELS**, and the
fixed step was written first and measured to be broken: at 375px it left **7 of
14 tabs unreachable**. A fixed step lands on a fixed grid of scroll positions,
and a tab wider than the overshoot falls between two of them -- clipped right at
one, clipped left at the next -- so Next and Prev swap it between the edges
forever. So Next takes the first tab clipped by the trailing edge and puts it AT
the leading edge; Prev does the mirror. Still roughly a strip-width per press
(measured 218/249 at 375px, 606/642 at 1440px) and it can never overshoot the
tab it is bringing in.

**TWO MORE BUGS THE EXHAUSTIVE SWEEP FOUND that the 70-case browser sweep did
not generate**, both in that rule: a tab WIDER than the strip is clipped by the
trailing edge while its start is already behind the leading one, so aligning it
sent Next BACKWARDS and stalled (fixed: a press never goes backwards, and a
no-progress press falls back to a plain page); and the 8px landing gap made a
tab only slightly narrower than the strip impossible to fit -- a 194px tab in a
200px strip "landed" still clipped and oscillated forever (fixed: the gap
shrinks to whatever is spare, down to none).

**Scroll snap is GONE** (`scroll-snap-type: x proximity` and the per-tab
`scroll-snap-align`): measured, any move shorter than the gap to the next tab
boundary was snapped back to where it started, so small wheel deltas and short
drags silently did nothing.

### The phone gets a labelled select, decided by measurement

The buttons cost **88px** of strip. At a 375px viewport: the public
`/reference` page goes 337 -> 249px (4 -> 3 whole tabs) and the classroom item
page, which pays the page gutter AND the card's padding, goes 293 -> 205px
(3 -> 2). **The bar: a strip must show at least THREE whole tabs** -- the one
you are on and a neighbour each side -- or it is a peephole, and paging through
fourteen sections two labels at a time is worse than a picker showing all
fourteen. The item page fails that, so below **40rem** the strip is replaced by
a labelled `<select>` (at a 641px viewport that same page shows 5 whole tabs, so
the strip appears with real room rather than at the edge of the bar it just
failed).

**This reverses the earlier "scrolls horizontally on a phone rather than
collapsing into a menu: a student has to be able to SEE that more tabs exist"** --
written when the strip had no controls, and a strip you cannot scroll is not one
you can see more of. Both controls are always in the DOM and a media query picks
one, so nothing measures a viewport in JS and the server and client cannot
disagree about which exists. The select routes through the same `selectTab`, so
the deep-link hash and the history entry come with it. The dead `600px` tab-type
rule went with the strip that no longer renders there.

**The active tab's underline-join is gone** and cannot come back: the scrollbar
occupies a band between the tabs and the rail's bottom border, and a scrollbar
gutter is not paintable by content, so the 1px cover would sit mid-strip
covering nothing. The filled surface and the green cap were always the findable
part.

### Verified

- **`tests/classroom-tab-strip.test.ts` (29 tests, pure).** The headline is a
  **reachability sweep over 240 generated strips (4,000+ cases)**: every tab
  brought fully into view from six scroll positions, by the buttons alone, with
  no selection. Deliberately includes tabs wide relative to the strip, the shape
  that broke the fixed step. Kept honest by asserting the case count, so a sweep
  that generated nothing cannot pass. Plus the exact 14-tab 249px layout that
  failed in the browser, asserted alongside a blind step that provably still
  oscillates on it; the wheel's axis choice, edge pass-through, clamping and
  exact-delta movement; the drag's touch exclusion, button and slop rules;
  and the button state at both ends.
- **MUTATION-CHECKED, 20 mutations, every one caught** and each file restored
  byte-identical (md5): a blind fixed step reddens 5, no-backwards-guard 1,
  the landing gap never giving way 1, no no-progress fallback 2, the wheel
  swallowing the page at the ends 1, deltaY-only 1, touch taken over 1, no slop
  1, the drag not following the pointer 1, the buttons never dead 1, plus 8
  component/CSS mutations (scrollbar hidden again, passive wheel, bubble-phase
  click cancel, buttons never disabled, snap back on, the select removed, print
  not hiding the picker, the exception clause restored). **One finding worth
  keeping:** the wheel's overflow guard and its edge guard both cover a
  non-overflowing strip, so removing either alone leaves that test green --
  removing both reddens it. Noted in the test.
- `npx svelte-check`: **0 errors, 36 warnings** (the same 36 as HEAD).
  `npx vitest run --no-file-parallelism`: **1165/1165 across 48 files**.
- **Browser-verified by dispatched input, not geometry** -- the previous pass
  measured `scrollWidth` against `clientWidth` and called the strip working,
  which proves capability, not operability. Through `/dev/classroom-reference`,
  extended with a **14-section fixture** (`OVERFLOW_REFERENCE`) that overflows
  at every width verified, and a **"Public page (/reference)"** view that mounts
  the REAL public page component with fixture data (that route resolves its
  document through one RPC against a live project this repo's placeholder `.env`
  cannot reach, and the strip's width there is a property of that page's own
  chrome). The harness's own `.dev-page` cap is dropped for both page views --
  measured, it under-reported the item page's strip by 38px, most of a tab.
  - **Reader, item page and public page at 1440px: zero failed assertions
    each**, with **210/210 reachability cases per surface** (70 each by buttons,
    wheel and drag) and the active section unchanged throughout.
  - Real `WheelEvent`s scroll the strip both ways and are `defaultPrevented`;
    at each end the event is **NOT** cancelled (`moved: 0, defaultPrevented:
    false`), which is what leaves the page scroll to the page -- an untrusted
    event cannot scroll anything itself, so that flag is the claim.
  - Real `pointerdown`/`move`/`up` sequences: a 150px mouse drag moved the strip
    150px with the click cancelled and the section unchanged; **the IDENTICAL
    sequence with `pointerType: 'touch'` moved it 0** -- the A/B showing the
    difference is the pointer type, not the gesture. A 3px press on the
    already-active tab moved 0 with its click NOT cancelled; a tap selected.
  - Real button clicks: 218px per press on a 249px strip; prev `disabled` +
    `opacity: 0` + `pointer-events: none` at the start, next the same at the
    end, both live midway, a spent press moving 0, and the box width identical
    at both ends so nothing shifts.
  - **The scrollbar is genuinely rendered:** `offsetHeight 54` vs
    `clientHeight 44` -- 10px reserved, matching the module's own rule -- with
    `scrollbar-width: thin` and `scrollbar-color` resolving to `--text-3`
    (`#5c665f`), the same token as the other twelve regions. **Reproducing the
    retired exception in the live page drops the reserved space to 0**, which is
    the browser-side mutation check. At 375px it reserves 0 because Chrome's
    mobile emulation uses overlay scrollbars, as a real phone does -- and that
    width shows the select anyway.
  - At 375px on all three surfaces: strip `display: none`, the select rendered,
    labelled "Section", 14 options, 44px tall, sticky, `document.scrollWidth`
    375 with zero overflowing elements; picking a section changed it, pushed the
    hash and the back button moved between sections.
  - Keyboard re-verified on every strip surface: arrows move focus AND selection
    with `defaultPrevented`, Home/End jump to the ends, exactly one tab in the
    tab order, focus lands on the active tab and that tab is fully in view.
  - Stacked (non-tabbed) mode untouched: no strip, no picker, all 14 sections
    shown. **Zero console errors** throughout.
- **NOT verified: screenshots, and the live project.** The Browser pane in this
  environment does not composite, so every visual claim above is a measured
  computed-style or geometry read. **Also worth knowing for the next pass: the
  hidden pane never fires a native `scroll` event** (they are dispatched at
  animation-frame timing), so a plain `scrollLeft` write leaves the buttons'
  disabled state stale there -- the driver dispatches the event the browser
  itself would. That the component's own controls work regardless is by design:
  `measureRail()` is called at the end of every one of them, and the native
  listener exists only for scrolling we did not initiate.

