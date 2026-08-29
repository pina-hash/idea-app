---
title: "The 375px overflow trio fixed, three routes registered, and a real click-through bug in the harness itself (`claude/horizontal-overflow-375px-f7yxnt`, no migration)"
date: 2026-08-28
branches: [claude/horizontal-overflow-375px-f7yxnt]
migrations: []
subsystems: ["browser-verify harness", "Notebook", "FRC", "Classroom"]
---

`claude/dev-routes-audit-5nocl7` audited every `/dev` route, found three real
horizontal-overflow defects at 375px and left all three unfixed because it was
scoped to `tools/`. This bundle owns the source files those defects live in
(`src/lib/notebook/`, `src/lib/frc/FrcShell.svelte`) plus `tools/
browser-verify/` itself, so it closes the loop: each diagnosis was re-verified
independently before touching anything, all three are fixed, three routes are
registered, and the harness gained a real capability fix (`clickUntil` could
not press an `aria-disabled` control) plus a new check (`tap-reach`) that a
prior route needed and never had.

### Starting state

`git fetch origin` at session start showed `HEAD` already equal to
`origin/main` (`33c0202`), which had just merged PR #47 from `integration` --
there is no separate `integration` branch ahead of `main` right now, contrary
to the session brief's assumption. `claude/horizontal-overflow-375px-f7yxnt`
already existed at that same tip with no prior commits, so this bundle branches
from `main` as the closest available base.

### The three defects, each re-diagnosed before fixing

**1. `/dev/notebook`, 10px overflow -- confirmed NOT the rail.** The prior
audit's headline element (`div.cr-split.has-detail`) and its top-ranked
offender list (`nav.rail` and its children, overhanging by 100-235px) were a
RED HERRING: `FolderRail`'s `ul` genuinely is `overflow-x: auto`, so those
elements are clipped inside their own scroll container and contribute nothing
to the document's actual `scrollWidth` -- they simply sort to the top of the
horizontal-scroll check's offender list because that check ranks by
`right - clientWidth` (viewport-relative), which is large for anything inside
a horizontally-scrollable rail regardless of whether it is visually clipped.
The check's own `slice(0, 6)` then hides the real, small offender underneath a
pile of harmless large ones. Found instead with a standalone script dumping
every offender ascending by overhang: `label.field.label-field span.hint`
(the free-entry title field's hint sentence) at 10.5px overhang, present only
intermittently depending on which check-in auto-selected on mount.

Root cause: `.field` (app.css) is a global key/value ROW flex class built for a
profile or course header (`justify-content: space-between`, no wrap). Every
label in the notebook compose form carries `.field` for its border-bottom
rhythm, and `.note-field`/`.folder-field` already override it back to a
column stack -- but `.label-field` itself never did, so the ONE label that is
`field label-field` alone (the title field) inherited the row layout, laid its
heading, input and hint sentence out side by side with no wrap, and the long
hint forced the row -- and the document -- past the viewport. The folder field
happened to be safe only because it ALSO carries `.folder-field`. Fixed by
moving the column-stack override onto `.label-field` itself
(`NotebookView.svelte`), which is where both labels' shared class already was.

**2. `/dev/frc`, overflow via `.frc-nav` -- confirmed the described trap,
`flex-wrap` was the working remedy, not bare `min-width: 0`.** Tried in order,
each measured before moving on:
- `min-width: 0` on `.frc-header` alone: no change (60px overflow persisted).
- `min-width: 0` on `.frc-nav` alone: `.frc-nav` itself stopped being reported
  as an offender, but the total `scrollWidth` was unchanged -- the overflow
  just moved one level down, to `FrcRankBadge`'s `.rank-chip`, which has its
  own explicit `white-space: nowrap`.
- `min-width: 0` on `.rank-chip` too: overflow shrank (435 -> 410) but did not
  reach zero, because the chip's own children (`.rank-chip-name`,
  `.rank-chip-count`) are ALSO nowrap text with no `min-width: 0`, and chasing
  the trap down every nesting level just crushes legible text into overlapping
  fragments rather than actually giving the content anywhere to go.

The shape here is different from the `nb-guidance`/pasted-URL case CLAUDE.md's
`min-width: 0` rule describes: that is ONE wide text node that can wrap at
word boundaries once allowed to shrink. This is several separate short items
(three links, an admin toggle, a rank badge, the profile menu) that
collectively do not fit one row -- a "too many nowrap siblings" problem, not
a "one item's min-content is too wide" problem. `flex-wrap: wrap` on
`.frc-nav` alone (no `min-width: 0` anywhere) measured 0px overflow at 375px
in three repeated runs and left the nav on one line, unaffected, at 1440px
(28.7px tall, single row). That is the fix landed in `FrcShell.svelte`.

**3. `/dev/classroom-deck`, 17px overflow -- confirmed exactly as diagnosed.**
`.controls label > select` -- the `<select>`'s widest OPTION text ("normal
export (wrapper folder + hidden state file)") set the label's automatic
min-content past the viewport, even though `.controls` itself wraps. `.controls
label { min-width: 0; }` (the exact CLAUDE.md remedy) measured 0px overflow.
This is `src/routes/dev/classroom-deck/+page.svelte`, a dev-harness-only file
the audit deliberately left unfixed because it wasn't listed in that session's
ownership; it is not on this session's forbidden list either, and the fix is a
one-line change to markup nobody but the harness renders.

### Three routes registered

- **`/dev/notebook`** (student account). Reachable from nowhere else in the
  harness before this. A `prepare` step now clicks "Something else" (`.pick.
  free`) before measuring, because which check-in auto-selects on mount is not
  pinned by the route and differs enough between runs/widths to make the
  title field's presence non-deterministic otherwise -- caught by running the
  full suite once and finding 2 unexpected `>>>` rows at 1440px (a presence
  count of 1 instead of 2, and 9 un-ignored 401s from the wide layout's feed
  rendering real photo thumbnails). Both are now handled: the click pins the
  free-entry state, and `ignoreConsole` covers the `/api/notebook/photo/`
  401s the same way every other notebook route's fixture does.
- **`/dev/notebook-review-student`**. Already clean at both widths, confirmed
  (0px overflow, both runs). Needed one `ignoreConsole` addition for the two
  401s ana's fixture photos produce -- named to the EXACT failing requests
  (`ana-p1`, `ana-p2-live`) rather than a blanket 401 pattern, which required
  a real harness capability that did not exist: `browser.mjs`'s console
  listener could not previously tell two "Failed to load resource" messages
  apart, because Chromium never puts a failing resource's URL in the console
  text itself (only in `msg.location()`, which playwright-core does not
  expose for this case). Fixed by pairing each such console error FIFO with
  the next same-page HTTP response carrying status >= 400, appending
  `[<status> <url>]` to the reported text -- proven both ways (the
  classroom-split spec's existing blanket 401 ignore, and the two new named
  ones, both still work; the full suite is unaffected).
- **`/dev/song-queue`**. Shipped 2026-08-28, built and never registered (its
  own header says so). Re-measured rather than copied: 0px overflow
  confirmed; the 23 `.tap-44` primary controls confirmed at 44.0px min
  dimension; the 20 `.tap-reach-44` approved/pending row links needed a NEW
  check rather than the existing `tapTargets`, because that check measures a
  control's own rendered box and a `.tap-reach-44` control is BY DESIGN under
  44px there (24.3px measured) -- pointing `tapTargets` at it would have
  reported 20 findings on a surface that is actually fine, exactly the trap
  the task brief named. See below.

### `tapReach`: a new check, because `tap-target` cannot see a reach

`.tap-reach-44` (app.css) grows a control's hit area with a centred `::after`
pseudo-element instead of growing its own box, for a control sitting inside a
line of text where inflating the box would reflow the writing. `checks.mjs`
gained `tapReach(page, {selector, min})`, which:

- Confirms the pseudo-element actually exists on that element
  (`getComputedStyle(el, '::after').content !== 'none'`) before crediting it
  with any reach at all -- an earlier draft skipped this and unconditionally
  assumed a 44px floor for every matched element, which the self-test's own
  negative control caught immediately (a plain link with no reach mechanism
  measured "44x44, within threshold" -- exactly the false-green this whole
  check exists to prevent).
- Recomputes the reach's geometry the way the CSS computes it (centred,
  `max(ownWidth, --tap-reach-w)` x `max(ownHeight, 44px)`), never trusting the
  box alone.
- Hit-tests five points across that geometry -- the centre and the midpoint of
  each edge -- because a neighbouring reach or an opaque sibling overlapping
  part of it steals a tap silently, which geometry alone cannot see
  (CLAUDE.md: "Verify a reach by HIT-TESTING it"). Proven with a self-test pair
  built around a deliberately overlapping sibling.
- Marks a sample point outside the viewport `offscreen` and excludes it from
  the stolen-tap count and the gate -- the same `elementFromPoint`-answers-null
  artefact CLAUDE.md already documents for `tapTargets`' own centre hit-test
  (measured live on `/dev/song-queue`: most of the 100 sample points across 20
  links are offscreen in the harness's fixed 900px-tall viewport, and none of
  that is a finding).

`run.mjs` gained a `tapReach` step (mirroring `tapTargets`) and a `printDetail`
branch. `routes.mjs`'s song-queue spec asserts `tapReach` on `.sq-link.tap-
reach-44` instead of `tapTargets`, which is now correctly green: `smallest
reach 309x44 ... 0/20 reaches under 44px, 0 tap(s) stolen`.

### The `clickUntil` fix: a real bug, not a hypothetical one

Item 7 named a real trap: Playwright's `locator.click()` performs an
actionability check that refuses a control carrying `aria-disabled="true"` --
this repo uses that attribute over `disabled` deliberately, in several places,
specifically so a blocked control can still take a tap and explain itself
(CLAUDE.md). A route driving one through `clickUntil`'s old `locator.click()`
would see every attempt fail and report a dead button, when the real page
handles the tap fine.

Proven, not assumed: the self-test's negative control uses Playwright's own
`locator.click()` directly against a real `aria-disabled="true"` button wired
to a click handler, and it genuinely times out with the handler never firing
-- this is not a fixture engineered to redden, it is the actual documented
Playwright behavior reproduced in this container's own Chromium.

Fixed in `browser.mjs`: `clickUntil` now dispatches via
`page.mouse.click(x, y)` at the target's bounding-box centre (falling back to
an ordinary `.click()` only when the element cannot be boxed at all, e.g.
`display: none`), which has no actionability gate in front of it and lands the
same way a finger does -- including still missing a genuinely `disabled`
control, since the browser itself swallows that event before any handler
runs, same as before. `/dev/song-queue`'s prepare step now exercises this for
real: it clicks the capped student's `aria-disabled` Request control and
waits for the notice it produces, which would have silently failed under the
old mechanism.

### The harness's own numbers, re-measured

- `--selftest`: **36 controls, 18 negative and 18 positive, 0 instrument
  failures** (up from 30/15/15 -- `click-through (aria-disabled control)` and
  two `tap-reach` groups added).
- Full run: **20 route specs over 15 distinct routes** (up from 17/12), **40
  route/width runs, 306 measurements, exactly 2 outside threshold** -- the
  same known `/dev/pathways` 194.7x26.2 finding at both widths, nothing new.
  **101.5s wall clock**, up from the prior session's 91.4s baseline for +9.3s
  across three new specs (roughly in line with the ~2.6s/route-width estimate
  that line already carried). Documented in `README.md` as the point worth
  saying out loud rather than quietly shipping: still a pass a person will run
  before pushing, but no longer a number nobody notices.
- `--break overflow` on all three new routes reddens `horizontal-scroll` and
  nothing else. `--break tiny-taps` and `--break console-error` on
  `/dev/song-queue` each redden exactly their own check and leave every other
  measurement green.

### Verified

- `npx svelte-kit sync && npx svelte-check`: **0 errors, 37 warnings**, mix
  **31 `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`** over 20 files -- the baseline exactly, before and
  after every change in this bundle.
- `npm test`: **147 files, 3327 tests, all passing.**
- `npm run verify:browser`: see above -- 40 runs, 306 measurements, 2 outside
  threshold, 101.5s.
- `npm run verify:browser -- --selftest`: 36 controls, 0 instrument failures.
- Each of the three overflow fixes re-measured in isolation via a standalone
  Playwright script before being folded into the registered route specs, and
  the FRC fix specifically confirmed unaffected at 1440px (single-line nav,
  28.7px tall).

### NOT verified

- No signed-in surface, no live Supabase, no real Drive round trip -- the
  harness's hard boundary, unchanged.
- Text is measured in the fallback stack (web fonts blocked); every pixel
  figure quoted here, including the reach geometry, is approximate to that
  degree. Contrast figures are unaffected (painted and read back).
  `prefers-reduced-motion` is `no-preference` throughout.
- `--break low-contrast` and `--break invisible` were not run against the
  three new routes specifically (only `overflow`, `tiny-taps` and
  `console-error`, chosen to match each route's own new check surface);
  `--selftest` already proves those two checks generically.
- The `.env` placeholder used for `svelte-kit sync`/`npm test`/the browser
  pass was created and left in place locally (gitignored, never committed) --
  a fresh checkout still needs `npm ci && npx svelte-kit sync` with a
  placeholder `.env` from `.env.example` before either baseline reproduces.
