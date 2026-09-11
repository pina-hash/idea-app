---
title: "The ported-document frame gets the room, the height it was told, and a way out to a new tab: the reading measure scoped off schema-3, the border moved off the iframe, and `HX_SANDBOX_FLAGS` widened with the two popup flags (`claude/intelligent-carson-1m1t7e`, no migration)"
date: 2026-09-11
branches: [claude/intelligent-carson-1m1t7e]
migrations: []
subsystems: ["Classroom", "HTML assignments", "Interface", "Security"]
---

Three defects on the one surface a ported HTML assignment is shown on, all three
found by looking at a rendered page rather than by reading code. They are done in
the order the third forces: the width change alters how the document reflows, so
its reported `idea:height` differs afterwards, and measuring the scrollbar against
the old layout would have been fixing it against a page that no longer exists.

### ONE: a schema-3 item was penned into a reading column

`ItemDetail.svelte`'s `.classroom-page` carries
`max-width: var(--cr-measure, var(--measure-reading))`. That is right for a post,
a material or a reference document, which are prose, and for a v1 spec assignment,
whose input tables share the body's own scroll column. It is wrong for a ported
document, which is a whole application an author laid out for the width they were
given -- IDEA100 Blade CAD 01 has a two-column header, a wide slides strip and a
four-limit grid, all built for more than 46rem.

Measured on `/dev/html-progress`, the one harness that mounts the real `ItemDetail`
over a real `htmlAssignment`, at five viewport widths. "Available" is the content
box of the page element's own parent. The harness caps its own container at 72rem,
which is the harness's constraint and not the rule under test, so the 1440 and 1920
rows are also read with that cap lifted:

| viewport | available | frame before | frame after | plain assignment, before -> after |
| --- | --- | --- | --- | --- |
| 375 | 317 | 285 | 283 | 343 -> 343 |
| 768 | 710 | 678 | 676 | 736 -> 736 |
| 1024 | 966 | 896 | 900 | 736 -> 736 |
| 1440 (cap lifted) | 1382 | 896 | 1316 | 736 -> 736 |
| 1920 (cap lifted) | 1862 | 896 | 1796 | 736 -> 736 |

The before column is the defect in one number: **896px of frame no matter how much
room the page had**, 896 of 1382 at 1440 and 896 of 1862 at 1920. The control is
the right-hand column -- a non-schema-3 assignment measured on
`/dev/classroom-interaction`, whose harness applies no cap of its own, so the page
is genuinely free to widen and does not: 736px at every width, before and after,
unchanged. `document.scrollWidth` equals `clientWidth` at every width in both.

The 2px the frame loses at 375 and 768 is the border moving to the wrapper (fix
two): the frame now sits inside the border rather than carrying it.

**SCOPED, NOT REMOVED, AND THE BRANCH IS `htmlMount` RATHER THAN A SECOND
`=== 3`.** `htmlAssignmentMount` is the one place the question "is this a ported
document" is answered -- a second spelling is how a student gets a worksheet and an
instructor gets a blank spec panel -- and `html` is its answer for an item that is
one AND has a document to mount. The `unavailable` arm is deliberately not widened:
it renders a single sentence, and a sentence does not want 1900px.

**WHAT IT COSTS, RECORDED RATHER THAN HIDDEN.** This is one page-level constraint
and the frame is not its only child, so the title, the instructions disclosure and
the hand-in copy on a ported item widen with the frame. That is the trade the rule
makes: the document is the reason the page was opened and it was the thing that was
unusable. Capping the prose blocks back to a reading measure would mean new rules on
several other children of that element, which is past what this lane owns in a file
shared with two other lanes. **It is a real legibility cost and worth a later look.**

### TWO: the frame was 2px shorter inside than the height it was told

`box-sizing: border-box` is global (`src/app.css`), so the `border: 1px solid` on
`.hx-frame` made `height: {height}px` an OUTER height and left the content box 2px
short of the `idea:height` the document had just reported.

**THE FIX IS A WRAPPER, NOT `height + 2`.** Both clear the overflow; only one has no
second copy of the border width in it. Putting the arithmetic in the template leaves
the `2` there and the `1px` in the stylesheet, so the day somebody restyles the edge
the arithmetic goes quietly wrong again and nothing on screen says so. With the
border on `.hx-frame-box` the frame has no border and no padding, so its border-box
height IS its content height and there is nothing to keep in step.

Measured on the real surface, before reproduced by injected CSS rather than by
stashing the tree (`git stash` does not reliably reach the served bundle and the
failure is silent, so the before and after are taken on the same load differing in
nothing but the box model):

| | applied | iframe `clientHeight` | inner `clientHeight` |
| --- | --- | --- | --- |
| before | 726px | 724 | 724 |
| after | 726px | 726 | 726 |

**THE SCROLLBAR ITSELF NEEDED A DIFFERENT DOCUMENT, AND SAYING SO IS THE POINT.**
`/hx/worksheet` is SHORTER than the box it is given, and
`documentElement.scrollHeight` is never less than the viewport, so it cannot
overflow in either geometry -- the box-model defect is visible in it, the symptom is
not. A real ported document is long: its content height IS the height it reports, so
a box 2px short overflows by exactly 2. Put to a box-model control, a document of
fixed 1000px height told the height it reports:

| | reported | applied | content box | inner `scrollHeight` | overflow | inner scrollbar |
| --- | --- | --- | --- | --- | --- | --- |
| before | 1000 | 1000px | 998 | 1000 | 2px | **YES** |
| after | 1000 | 1000px | 1000 | 1000 | 0px | no |

Confirmed on the real surface at 375 and 1440: `delta=0` between the applied height
and `clientHeight`, `border=0px` on the frame, `box-minus-frame=2` (the edge moved
rather than being dropped), and no inner scrollbar. Those four numbers are now a
`browser-verify` row rather than a claim.

**ONE THING SEEN AND NOT FIXED, BECAUSE IT IS NOT THIS CHANGE'S.** The dev fixture's
bridge client calls `reportHeight()` ONCE at load, so any later reflow leaves a stale
height -- dead space when the document got wider, and in principle clipping when it
got narrower. Two runs of the same page produced applied heights of 726px and 375px
depending on the frame's width at the instant the document measured itself. It is a
property of the fixture, not of the frame component, and a real ported document would
report on resize. It made the before/after screenshots incomparable and is worth
naming so the next reader does not diagnose it as a layout bug.

### THREE: a document could not open a link in a new tab, and that is now a widening

**Mr. Pina's decision, 2026-09-11.** `HX_SANDBOX_FLAGS` becomes
`allow-scripts allow-popups allow-popups-to-escape-sandbox`. Without the flags
`window.open` returns `null` and a `target="_blank"` anchor does nothing; IDEA100
Blade CAD 01's Open slides button works the moment they land.

**ONE CONSTANT, BOTH READERS, CONFIRMED IN A BROWSER RATHER THAN BY READING THE
IMPORT.** The served document's CSP came back
`sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox; default-src 'none'; ...`
and the rendered `<iframe>` attribute came back with the identical three tokens.

**BOTH FLAGS ARE REQUIRED, AND THIS WAS CONFIRMED RATHER THAN ASSUMED.** A popup
opened under `allow-popups` alone INHERITS the sandbox: `window.origin` reads
`"null"` and `document.cookie` and `localStorage` both throw `SecurityError`, which
is a tab Google Slides cannot run in. With neither flag, `window.open` returns
`null`. The three-row table is in the standard's new section 5.6.

#### 0134's proof, re-run in full

Because the widening changes the thing 0134 proved. Same instrument, both halves,
with `hx_proof_sentinel=PARENT-SECRET-0153` planted on the serving origin and read
back from an ordinary page there first, so the control is known live before any
refusal is counted as meaningful.

| probe | direct navigation | framed |
| --- | --- | --- |
| `window.origin` | `"null"` | `"null"` |
| `document.cookie` | REFUSED `SecurityError` | REFUSED `SecurityError` |
| `localStorage` | REFUSED `SecurityError` | REFUSED `SecurityError` |
| `window.parent.document` | n/a, parent is self | REFUSED `SecurityError` |
| `window.top.location` | n/a, top is self | REFUSED `SecurityError` |
| credentialed `fetch` | REFUSED `TypeError` | REFUSED `TypeError` |

0 of 5 reached in both halves. `location.href` asserted unchanged afterwards.

**AN INSTRUMENT TRAP THAT COST A WRONG READING, WRITTEN DOWN BECAUSE IT WILL COST
THE NEXT ONE.** The first run used the hostile `/hx/probe` fixture for the
direct-navigation half. On a direct hit `window.top` IS the document's own window,
so the probe's own `window.top.location = 'https://example.com/'` line NAVIGATED THE
PAGE AWAY, and every reading after it was taken on a `chrome-error://chromewebdata/`
page. It reported `window.parent.document` and `window.top.location` as REACHED --
which reads exactly like the widening having broken containment -- and it reported
`document.cookie` as refused for entirely the wrong reason. The fix is an ordinary
document plus an assertion on `location.href`. **A "finding" that appears the moment
you change something is worth one more look at the instrument before it is believed.**

#### What the popup can actually do, measured

Nobody had measured this, so it is measured rather than reasoned about, from a REAL
TRUSTED CLICK inside the framed document -- `evaluate(() => window.open())` is
refused by the popup blocker for lack of a user gesture and would have read as the
sandbox refusing it. The popup is opened at an origin GENUINELY FOREIGN to the
portal, which is what a hostile document would do: `localhost:5199` and
`127.0.0.1:5199` are the same server at different origins, which is the shape needed
without leaving the container.

| from the popup | result |
| --- | --- |
| `window.origin` | its own real origin -- a normal context, not opaque |
| `window.opener` | present, a cross-origin `Window` proxy to the frame |
| `opener.document` | REFUSED `SecurityError` |
| `opener.parent.document` | REFUSED `SecurityError` |
| `opener.top.document` | REFUSED `SecurityError` |
| `opener.location` read / write | REFUSED `SecurityError` |
| `opener.top.location` read / write | REFUSED `SecurityError` |
| `opener.postMessage` | no throw; the bridge drops it (`event.source` is not the frame) |

**Confirmed from OUTSIDE the popup rather than on its own say-so:** after both write
attempts the parent tab was still at its own URL and the document frame was still at
`/hx/worksheet`. So **the widening did not buy top navigation by proxy** -- the flag
the frame is denied is not reachable through a window it opens.

The other direction: the document cannot read its own popup either (`popup.document`,
`popup.location`, `popup.origin` all `SecurityError`), though it can navigate it,
which adds nothing because it could have opened that URL directly.

**ONE RESULT THAT LOOKS ALARMING AND IS NOT.** Opened at the PORTAL'S OWN origin the
popup is same-origin with the portal tab and walked `opener.parent` into it, reading
the parent page's title. That is our page reading our page: the document cannot
script it, every read across the opaque boundary is refused, and it cannot inject
anything into it. Worth recording because the raw measurement reads as a leak.

#### What the widening costs, stated plainly

An uploaded document can now open a normal, unsandboxed tab at any URL it chooses.
**That is a stronger phishing surface than the same fake form drawn inline in the
worksheet**, because the new tab carries a real address bar and a real lock icon,
which a reader has been taught to believe. The mitigation on record is that import is
admin-only, a first-season decision: there is no content scan, no URL allowlist and no
interstitial. If documents are ever accepted from a wider set of authors than admins,
that is the decision to revisit first, and the narrower answer is to drop
`allow-popups-to-escape-sandbox` -- accepting that slide links stop working -- rather
than to add a scanner. All of this is in the standard, at section 5.6, in those words.

`allow-same-origin` is not added, and the assertion that it never is stays in three
places (the constant's own test, the CSP test, and the browser-verify row).

### What moved, and what is deliberately left

`HX_SANDBOX_FLAGS` is now pinned as a sorted TOKEN LIST rather than as a string: a
string equality reddens for a reordering that grants nothing and says nothing about
WHICH token moved when it does redden. Two further assertions were added -- the two
flags still refused (`allow-top-navigation`, `allow-forms`), and a both-or-neither
check on the popup pair, so an edit that trims the escape flag as redundant reddens
rather than quietly reverting the Open slides button to a blank tab.

**`tests/html-assignment-port.test.ts` IS LEFT ALONE AND IS STILL GREEN, AND THAT IS
A DIVERGENCE WORTH NAMING.** It asserts the token set of the `sandbox` attribute in
`/dev/html-assignment/fixtures/+page.svelte`, which is a SECOND LITERAL that predates
this lane and does not read `HX_SANDBOX_FLAGS` -- so that harness still frames its
fixture under `allow-scripts` alone while the real surface carries three flags, and
the test's `expect(tokens).not.toContain('allow-popups-to-escape-sandbox')` now reads
as a rule about the feature while being merely true of that file. It is STRICTER than
the real frame, so a drive through it under-reports what a document can do rather than
over-reporting containment, which is the safe direction. **The right fix is to point
that harness at the constant**, which is one line in a file this lane does not own and
which ledger 0150's subsystem plausibly does.

### Verified

- `svelte-check`: **0 errors, 37 warnings** (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`), unchanged from the baseline.
- Full suite: **379 files, 7464 tests, all passing.** The prompt's baseline of
  378/7454 predates ledger 0150's merge into `integration`, which added
  `tests/legacy-assignments.test.ts` (8 tests); this lane adds 2 tests to
  `tests/html-assignment-bridge.test.ts`. 378 + 1 = 379 and 7454 + 8 + 2 = 7464.
- `verify:browser --route /dev/html-assignment`: 14 route/width runs, 180
  measurements, **0 outside threshold**, at 375 and 1440.
- Rasterized and looked at a schema-3 item at 1440: the frame spans the page, the
  wrapper's rounded edge clips cleanly, the whole worksheet is visible, no inner
  scrollbar.

### NOT verified

- **Production.** Nothing here was run against the live Supabase project or a real
  signed-in session. The width numbers come from `/dev/html-progress`, the only
  harness mounting a schema-3 `ItemDetail`, whose own container caps at 72rem -- the
  1440 and 1920 rows are read with that cap lifted by injected CSS, which measures the
  page-level rule rather than the real classroom shell's geometry. **The real item
  page at `/classroom/<section>/<item>` needs a Bosco Tech session and was not
  opened.**
- **IDEA100 Blade CAD 01's Open slides button itself** was not clicked: the document
  is not importable in this container and the button's target is a Google Slides URL
  the harness blocks. What was measured is the mechanism it depends on.
- **A real cross-site popup.** The foreign origin is `localhost` against `127.0.0.1`
  on the same server. That is a genuinely different origin and is the right shape for
  every check above, but it is not a different site, so nothing here measures
  cross-SITE behaviour (cookie partitioning, for instance).
- `prefers-reduced-motion` is `no-preference` in the harness, and web fonts do not
  load (the harness blocks non-loopback), so text is measured in the fallback stack.
