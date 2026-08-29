---
title: "The /dev route audit: 3 routes added to the browser pass, 2 instrument bugs found by its own controls, and 3 real overflow defects reported but not fixed (`claude/dev-routes-audit-5nocl7`, no migration)"
date: 2026-08-28
branches: [claude/dev-routes-audit-5nocl7]
migrations: []
subsystems: ["browser-verify harness", "Classroom", "Foundry", "Notebook"]
---

Three sessions this week shipped interactive UI, hand-measured it through
one-off scripts, and could not register the route because `tools/` belonged to
somebody else. Those measurements ran exactly once. This bundle owns
`tools/browser-verify/` and closes that gap for the three surfaces worth the
runtime, having first audited all of them.

**Nothing under `src/` was touched.** Every change is in
`tools/browser-verify/`.

### The counts, confirmed rather than taken from the brief

- `src/routes/dev` holds **53 immediate directories**, not 52: **50** with a
  page and **3 server-only** (`ai-level-badge-reference`, `coins`, `frc-quiz`,
  each a bare `+server.ts` with no browser surface to drive). There are **52
  `+page.svelte` files**, because `classroom-split` contributes two nested
  pages and `feedback` contributes `feedback/boom`.
- `routes.mjs` drove **14 specs over 9 distinct routes**, not 14 routes: five
  of the specs are `aliasOf` variants measuring a second state of a route
  already listed. It now drives **17 specs over 12 distinct routes**.

### The ranking, and the routes deliberately NOT added

**THE CLONE IS SHALLOW AND THAT DEGRADES THE OBVIOUS SIGNAL.** `git rev-list
--count HEAD` is 191 and the earliest commit is 2026-08-24, so "edited this
month" cannot be asked -- every file with any history at all was touched inside
a five-day window, and 1 commit dated 2026-08-26 means "existed at the squash
boundary", not "written that day". What discriminates is the 08-27/08-28 slice,
which is genuine per-session work.

Ranked on "if this broke silently, would anyone find out before a student did",
and then filtered by whether the route comes back clean (see the permanent-
finding rule below), the three added were:

1. **`/dev/hall-pass`** -- mandated by the brief, and it earns it independently.
   It is a PHONE control on a student surface, it is `aria-disabled` rather than
   `disabled` so it can explain itself, and 0144 put a role BRANCH inside its
   one handler. All three are invisible to `svelte-check` and none of them looks
   wrong on screen.
2. **`/dev/foundry-submit`** -- the student's own upload surface, and the
   highest-churn dev route nothing drove. `FoundrySubmit`, `FoundryContract`,
   `FoundryIssues` and `AppFrame` appear in no other spec; `/dev/foundry-forge`
   drives `FoundryMine` and stops there. What is measured is the REFUSAL path,
   because a refusal that stops rendering leaves a student stuck with nothing on
   screen saying why.
3. **`/dev/notebook-review`** -- the compliance grid is a LOCKED CONTRACT whose
   every status value owes a MEASURED CONTRAST FIGURE per plate, and nothing
   automated had ever measured one. 0140 added a seventh value (`scheduled`)
   days ago.

**Not added, and why.** `/dev/classroom-reference` was fourth and was dropped on
its own evidence: `ReferenceDoc.svelte` has one commit and has not moved since
the squash boundary, and its hot dependencies (`ItemDetail`, `classroom.ts`) are
already driven through `/dev/classroom`. `/dev/classroom-phase1` is a kitchen
sink whose hot components are all already covered by `/dev/classroom` and
`/dev/classroom-split` -- duplicate coverage at full runtime cost.
`/dev/tournaments` mounts 13 components and 2 canvases, none of them touched in
the 08-27/08-28 slice. `/dev/classroom-upload` renders two buttons, and
`FileUploadPanel`'s interesting behaviour (per-file progress, retry, partial
failure) needs staged files the harness cannot supply. `/dev/greenline-portal`
has the highest raw churn of any undriven route and is a game menu over WebGL --
slow, canvas-dominated, and nothing a student is graded on. **`/dev/notebook`,
`/dev/classroom-deck` and `/dev/frc` were excluded for a different reason: each
reports a real horizontal overflow at 375px** (below).

### Runtime, before and after

| | specs | route/width runs | measurements | wall clock |
| --- | --- | --- | --- | --- |
| before | 14 | 28 | 200 | **71.9s** (warm), 79.8s (cold) |
| after | 17 | 34 | 258 | **91.4s** |

**The brief's "roughly 22 seconds" and the README's "~34 seconds ... 8 route
specs" were both wrong before this bundle touched anything**, by 3x and by
6 specs. The README now carries the measured figures and an instruction to
re-derive rather than quote them. ~2.6s per route/width, close to linear:
another four specs is another ~21s. 91s is inside what a person will run; it is
not far inside, and the next session adding routes should say so explicitly.

### Two instrument bugs, both found by the harness's own live controls

**1. `--break overflow` and `--break invisible` matched nothing on the new
routes.** Both presets selected `.harness, main, body > div`. `/dev/hall-pass`
is rooted at `div.cr-root.wrap` under a `display: contents` wrapper that
`min-width` cannot inflate, so `--break overflow` came back GREEN -- a live
control that proves nothing, failing in the reassuring direction. Both presets
now name the room wrappers (`.cr-root`, `.fg-root`, `.nb-root`, and the rest).

**2. `presence` reported elements painted nowhere as visible, because
`opacity` is not inherited.** Widening the `invisible` preset exposed it: with
opacity 0 on three routes' room wrappers, every presence row still came back
green. A child of an `opacity: 0` parent computes opacity 1. `isVisible` now
walks ancestors and NAMES the one responsible in its reason string.

**That repair turned up seven assertions that had been passing vacuously.**
`/dev/home-order` and `/dev/home-feed` assert `.assignment-item` rows that live
inside `.course-card`, which `src/app.css` stamps `opacity: 0` until an
IntersectionObserver adds `.visible`. On `/dev/home-feed` nothing EVER adds it,
because that route mounts `ClassroomFeed` directly and the observer lives in the
real page's `onMount` -- so nine rows were being measured for contrast and tap
geometry at opacity 0, at every width, on every run since the harness shipped.

The fix is the one CLAUDE.md prescribes for this case: put the component into
the state its own cleanup produces, which is byte-identically the reduced-motion
first frame, and SAY HOW MANY were settled. `SETTLE_ENTRANCE` does it and the
prepare line prints the count (`settled entrance on 3 course-card(s) and 0
app-card(s)`), so a step that silently matches nothing the day a class name
moves is visible rather than green.

**The first attempt at settling was wrong and the second is why the helper
injects a STYLE RULE.** Adding `.visible` and clearing the inline opacity
settled `/dev/home-order`'s student variant and left the teacher variant and
`/dev/home-feed` at opacity 0 -- `AppLauncher`'s own `onMount` re-stamps
`style.opacity = '0'`, and whether it has run by the time a prepare step fires
is a race that resolves differently per route. A rule cannot be re-stamped over.

Writing `expectVisible: 0` on the rows to match the measurement would have been
the wrong repair: it records the vacuum as if it were the intended reading.

### `waitFor`, a new prepare step, with its own negative control

`/dev/notebook-review`'s grid arrives on an async transport, and the first visit
to any route also pays vite's module-graph compile. The run visits 375 before
1440, so the cold pass measured **0 cells** and the warm pass measured **30** --
which reads exactly like a console that renders no grid at phone width and is
nothing of the kind. Warm, both widths render the identical 30 cells.

`{ waitFor: '<predicate source>', timeoutMs }` waits for a page-side predicate
and REPORTS the wait in milliseconds; a predicate that never holds prints
FAILED. It is not a longer `settleMs`: a fixed timeout long enough today
measures an empty page the day the payload gets slower, silently, because every
selector honestly matches nothing. In the run it reports 970ms at 375 and 651ms
at 1440.

Its negative control is a predicate that never holds. Selftest went from 24
controls to **30 (15 negative, 15 positive), 0 instrument failures** -- the
`wait-for` pair and the ancestor-opacity pair.

### What each new spec measures

**`/dev/hall-pass`.** The brief's hand measurements REPRODUCE EXACTLY: min
dimension **44.0px** over 4 controls, **4/4** centre hit tests land on the
control itself, **0px** overflow at both widths, the blocked control carries
`aria-disabled="true"` and **no control carries a `disabled` attribute** (0
present, asserted as an exclusion). Status line 15.42:1, blocked-control ink
9.31:1.

The load-bearing assertion is 0144's branch, and it is an `orderResult` because
it is a claim about a WRITE that no DOM read can settle -- the button is
identical either way. The prepare steps press the manager's control and then the
student's; the log is projected down to the METHOD each press called, and the
expected pair `['closeById', 'closeMine']` is 0144's rule rather than the
fixture's prose, so reformatting a log line cannot move it and taking the wrong
branch must.

One assertion is deliberately split: `.hp-actions` is **present 5, visible 4**.
The read-only mount (`transports={null}`) renders none, which is the absence
mechanism working; the manager-with-nobody-out mount renders an EMPTY block
(zero box, 309.0x0.0 at 375px) because it has transports and nothing to press.
Asserting visible 5 would be asserting a control the component is right not to
offer.

**`/dev/foundry-submit`.** Driving `[data-drive="zip-bad"]` runs the REAL
`preflightZipInBrowser` over the same normalized zip the surface would have
uploaded, and **4 sentences render at 14.27:1** -- a leading slash, two
references to files the upload does not contain, and the unconditional storage
warning. The count is 4 rather than "at least 1" on purpose: 1 would pass on a
panel that had lost three of them. Copy controls measure 77.4x44, min dim 44.0.

`[data-fdy-input]` is NOT asserted, and that is not an oversight: it exists
before the drive and is gone after it, so a presence row for it measured 0 and
reported a finding about a control that had done its job. It is proven by the
prepare step instead, and more strongly -- the route's own `drive()` returns
without handing over the files if it cannot find the input, so `.fdy-issues`
never appears and the step prints FAILED.

**`/dev/notebook-review`.** The five cell states this fixture produces, each
measured against its real rendered ground: **late 5.07:1, flagged 5.11:1,
excused 9.31:1, missing 5.59:1, and 0140's `scheduled` 6.19:1**. All clear 4.5.
Cells measure 30.4x30.4 against the **24px** floor -- the documented
locked-density exception, not a relaxation. 30 cells, 8 legend rows (7 states
plus the not-reviewed dot). The two states the fixture does not produce
(`ontime`, `await`) are asserted as ABSENT, so the five contrast rows cannot be
misread as covering all seven.

### The permanent-finding rule was honoured, and it is what shaped the list

The pass reported exactly **2 measurements outside threshold** before this
bundle and reports exactly **2** after: the same `/dev/pathways` 194.7x26.2px
harness controls, one per width. No threshold was loosened.

Two of my own spec rows did go red on the first full run and both were the
spec's fault rather than the surface's -- the `.hp-actions` visible count and
the consumed file input, corrected above. They are recorded here because a
route added with over-strict assertions is indistinguishable from a route that
found something, and the difference is worth writing down.

### Three real overflow defects, REPORTED AND LEFT

Each is a horizontal overflow at 375px, measured through the harness's own
check, in a file this bundle does not own. **None of these routes was added**,
precisely because adding one would have installed a standing finding.

1. **`/dev/notebook`, 10px** (scrollWidth 385 vs 375). The escape is at
   `div.cr-split.has-detail`, whose scrollWidth exceeds its clientWidth at
   375px; the folder rail above it fits (293px) and is not the cause. `body`
   carries `overflow-x: hidden`, so there is no scrollbar to see -- the content
   is simply cut. **This is the highest-value uncovered surface in the repo**:
   it is the student's own notebook, `NotebookView.svelte` was edited on 08-27,
   and after this bundle it is one of only two recently-changed components not
   reachable from any harness-table route.
2. **`/dev/frc`, 86px** (461 vs 375). `header.frc-header` is a flex row at
   `min-width: auto` containing `nav.frc-nav` (410.6px, `flex-wrap: nowrap`),
   with the `FrcRankBadge` chip overhanging furthest. This is the
   `min-width: 0` trap CLAUDE.md already names, on a signed-in student surface
   at phone width. `src/lib/frc/FrcShell.svelte`.
3. **`/dev/classroom-deck`, 17px** (392 vs 375). **This one is in a file this
   bundle DOES own** -- `src/routes/dev/classroom-deck/+page.svelte`, its own
   `.controls` scaffolding: `label` is a flex child with no `min-width: 0`
   wrapping a `<select>` whose min-content is its widest option. It is
   deliberately left unfixed: the fix delivers nothing this bundle ships (the
   route is not being added), and two other sessions are live in this tree. The
   whole repair is `min-width: 0` on `.controls label` plus `max-width: 100%`
   on the select.

`/dev/notebook` also emits 9 console 401s at 1440 -- the classroom attachment
proxy with no session, the same cause the `i-crowded` spec already documents an
ignore for.

### Surfaces shipped in the visible window with NO dev route at all

The question the brief asked, answered as precisely as a shallow clone allows.

- **Two real serving routes, added 2026-08-27, with no dev route of any kind:**
  `src/routes/foundry/download/[appId]/[versionId]/+server.ts` (the author's own
  zip) and `src/routes/foundry/preview/[appId]/[versionId]/[...path]/+server.ts`
  (the author's own run, at any status). Both need a session and the
  `foundry-bundles` bucket, so they sit outside this harness's boundary either
  way -- but they have no harness at all, and the preview route serves a
  student's own bytes.
- **20 of 204 `src/lib` components are unreachable from any dev route**, and all
  20 carry a single 2026-08-26 commit, so none of them is recent work: 10
  GAUNTLET (`ChallengeForm`, `ModelingRun`, `KnowledgePlay`, `SpeedrunClock`,
  `RunResults`, `Asset`, and four `viewport/*`), 5 FSP (`FspDeck`,
  `FspLiveFeed`, `FspDayArchive`, `FspCourseInfoPanel`,
  `FspPresentationsPanel`), 2 tournaments (`ResultForm`, `MatchAlerts`), and
  `InstallPrompt.svelte`.
- **Of the 38 components changed on 08-27/08-28, every one is now reachable
  from a harness-table route except two**: `notebook/NotebookView.svelte` and
  `notebook/NotebookEntryCard.svelte`. They have dev routes -- `/dev/notebook`,
  `/dev/notebook-review-student`, `/dev/classroom-view-as-notebook` -- and none
  is in the table. `/dev/notebook` is blocked by the 10px overflow above;
  `/dev/notebook-review-student` is clean at both widths and emits two
  attachment 401s that would need a documented `ignoreConsole`. **That pair is
  the next bundle.**

### Verified

- `npx svelte-kit sync && npx svelte-check`: **0 errors, 37 warnings**, mix
  **31 `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`** over 20 files -- the baseline exactly. (A fresh
  checkout needs the two `PUBLIC_SUPABASE_*` placeholders exported before the
  sync, or 11 phantom errors land.)
- `npm test`: **142 files, 3232 tests, all passing**, unchanged. Expected: this
  bundle adds no application logic and touches nothing under `src/`.
- `npm run verify:browser`: 34 route/width runs, 258 measurements, **2 outside
  threshold** (the two known `/dev/pathways` controls), 91.4s.
- `npm run verify:browser -- --selftest`: **30 controls (15 negative, 15
  positive), 0 instrument failures**.
- `--break` on each new route: `overflow`, `tiny-taps`, `low-contrast`,
  `invisible` and `console-error` each redden their own check and leave the
  others green, on `/dev/hall-pass`, `/dev/foundry-submit` and
  `/dev/notebook-review`.

### NOT verified

- **No signed-in surface, no live Supabase, no real Drive round trip.** The
  harness drives `/dev` routes against a placeholder-env dev server, which is a
  hard boundary.
- **Text is measured in the fallback stack.** The harness blocks every
  non-loopback request, so Rajdhani and Share Tech Mono never load and every
  pixel figure quoted here -- tap-target geometry included -- is approximate.
  Contrast is unaffected: colour is resolved by painting and reading the pixel
  back.
- **`prefers-reduced-motion` is `no-preference` throughout**, so that path is
  not exercised on any route. `SETTLE_ENTRANCE` produces the same end state the
  reduced-motion path renders from the first frame, but it does so by injecting
  a rule, not by setting the media feature.
- **The three overflow defects were diagnosed, not fixed**, and no fix was
  attempted or tested for any of them.
- **The two new Foundry serving routes were read, not driven.**
