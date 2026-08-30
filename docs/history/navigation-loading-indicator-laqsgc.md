---
title: "A route-transition indicator, a shared pending primitive, and two orphaned assertions that could not fail (`claude/navigation-loading-indicator-laqsgc`, no migration)"
date: 2026-08-30
branches: [claude/navigation-loading-indicator-laqsgc]
migrations: []
subsystems: ["Portal shell", "Classroom", "Notebook", "Foundry", "browser-verify harness", "Coin ledger tests"]
---

Four things, three of them the same shape: a guarantee nothing was measuring.

### 1. `navigating` was imported by zero files, and it was really zero

The brief asserted it; every claim in a brief is a hypothesis here. Swept
directly: `grep -rn 'navigating' src/` returns **five hits and all five are
prose inside comments** (`foundry-dev-fixture.ts`, `composer-staging.ts`,
`NotebookView.svelte`, the `/dev/foundry-gallery` page, and the classroom
section layout). No file imports `navigating` in either spelling -- neither the
`$app/state` rune nor the deprecated `$app/navigation` store. Thirty files
import something else from `$app/navigation` (`goto`, `invalidateAll`,
`beforeNavigate`, `afterNavigate`), which is what makes the absence a real
omission rather than a codebase that does not use the module.

So every SvelteKit navigation in the application showed nothing at all until
the new page painted. The classroom item page is the surface that makes it
matter: a manager opening an assignment pays five sequential server round
trips, and on school wifi the screen simply did not change for the whole of it.

**`src/lib/NavigationProgress.svelte`**, mounted once in
`src/routes/+layout.svelte`. The load-bearing decisions, each with the
measurement that settles it, are now in `CLAUDE.md` rather than only here,
because every one of them qualifies a future change to the shell.

**The delay is 250ms** (`NAV_INDICATOR_DELAY_MS`). Below it nothing is drawn --
a bar that flashes on every click turns an instantaneous navigation into a
visible event and teaches a reader to ignore the one signal that matters. Above
it the reader is already past the ~100ms band in which a UI still feels like a
direct response to the press, and far enough below the ~1s point at which they
click a second time that the slow case is covered long before they do. It is a
PROP with that constant as its default, because the only way to verify both
halves of the rule is to drive a navigation on each side of it.

Measured, on real navigations rather than by toggling a prop:

| | 375px | 1440px |
| --- | --- | --- |
| 0ms load: navigation completed in | 31ms | 44ms |
| 0ms load: indicator | **silent** | **silent** |
| 1200ms load: navigation completed in | 1214ms | 1215ms |
| 1200ms load: indicator drawn at | **260ms** | **264ms** |

The 10-16ms over the gate is the probe's own 8ms sampling interval, not lag in
the component.

**Zero layout shift is structural, not tuned**, and the reading carries its own
negative control. The wrapper is `position: fixed` and never takes a line box.
Measured: **CLS 0 and 0px reference-element movement** for the real bar; the
identical bar forced back into flow moved the reference **3px** at CLS 0.0056
(375px) / 0.0012 (1440px). "The bar shifts nothing" is satisfied perfectly by a
probe that cannot see a shift at all, so the verdict string the spec asserts
names both clauses and the blind case is a THIRD string that reddens.

**Reduced motion is verified, not assumed.** `motion` on `/dev/navigation?force=1`
reports **1 element animated under `no-preference`, 0 still moving, transformed
or unpainted under `reduce`, lowest resting opacity 1**, at both widths. The
design is what makes that pass rather than an exemption: the TRACK is the state
and the SWEEP is the decoration, so with the animation cancelled the mark is
still painted, full opacity, no transform. Nothing is hidden in a base state.

**Contrast, painted to a canvas and read back**: the sweep measures **7.52:1**
against the page and **3.80:1** against its own track. 3:1 and not 4.5:1 is the
applicable floor -- the bar is a graphical object, not text (WCAG 1.4.11).

**The live region is always mounted and only its text moves**, because several
screen readers only announce a `role="status"` they were already observing. An
empty one correctly holds a **zero box** (375.0x0.0 and 1440.0x0.0).

### 2. One pending state, one ellipsis

The brief described "three plain paragraphs". The sweep found **roughly twenty**
paragraph-level pending states with no shared component, in **three** ellipsis
spellings: `…` (the single character), `...` (three periods) and `&hellip;`
(the numeric entity). The brief's exact "two use the single character and one
uses three periods" is true of the classroom trio specifically
(`GradingConsole`, `RevisionHistory`, `PeoplePanel`) and understates the rest.

Three spellings is not a cosmetic problem: it is the tell that nothing owned
the decision, which is also why not one of them was a live region and not one
said what was pending.

`$lib/pending.ts` owns the words, `$lib/Pending.svelte` owns the look -- the
same division `save-state.svelte.ts` / `SaveIndicator.svelte` already uses.
`pendingLabel` STRIPS whatever ellipsis the caller typed and appends the one,
in any of the three spellings, because every existing call site was a
hand-written string with its own ellipsis on the end and a component that
merely appended would render `Loading……`. A constant alone only makes the right
thing available.

**Adopted in six files**, all of them `<p class="note">` pending paragraphs
whose scoped rule was `color: var(--text-2)` and nothing else, so there was no
bespoke room styling to lose: `GradingConsole`, `RevisionHistory`,
`PeoplePanel`, `ReviewConsole`, `DocumentationCheck`, `AdminLogPanel`. Each file
retains other `.note` usages, so no scoped rule was orphaned and the
`css_unused_selector` count did not move.

**The inline variant renders a `<span>`, and finding out why is worth
recording.** It first rendered a `<p>` for both variants, and the harness page
puts the inline one inside a sentence -- a `<p>` nested in a `<p>`, which is
invalid HTML: the parser closes the outer paragraph at the inner one's start
tag. The dev route is `ssr = false`, and `appendChild` has no such restriction,
so the client-rendered DOM nested it happily and the harness's own contrast row
printed the path `p.note > p.pending.inline` without complaint. Every check was
green over markup a server render would have produced differently. Proven on the
`svelte/server` path rather than argued: `render(Pending, { variant: 'block' })`
emits `<p class="pending block" role="status" ...>` and
`{ variant: 'inline' }` emits `<span class="pending inline" role="status" ...>`,
with no `<p` anywhere in the second.

**Left alone, deliberately**, with the reason in each case:

- **`LinkPreviewCard`** -- named in the brief and correct as it stands. It
  renders a working link from the first frame and upgrades it if metadata
  arrives, so there is no window a reader waits through. A pending state here
  would replace a usable control with a placeholder.
- **`LiveTelemetry`'s "Waiting for modeling activity..."** -- an EMPTY state,
  not a pending one. Nothing is in flight.
- **The FSP surfaces** (`FspLiveFeed`, `/fsp-pulse`, `/fsp-tech-selection`) --
  `.fsp-root` is deliberately not IDEA and runs a system-sans stack. `Pending`
  forces `--font-mono` (Share Tech Mono), so adopting it there would put IDEA
  chrome into a room whose whole point is that it is not.
- **Bespoke-class pending paragraphs** (`PhotoViewer`'s `.pv-loading`,
  `CameraCapture`'s `.cc-status`, `PhotoCorrector`'s `.pc-status`,
  `TrackBuilder`'s `.tb-hint`, `GreenlineResults`'s `.gr-note`,
  `FoundryInspector`/`FoundryPlayStats`'s `.fdy-*-note`) -- each carries local
  styling that is a deliberate room decision, and none is on a surface this
  session could measure. They are migration candidates, not a second sanctioned
  pattern.
- **Every busy BUTTON LABEL** (`Saving...`, `Uploading…`, `Working...` and
  ~30 more). A button already conveys its own busy state through the control;
  replacing the label with a separate pending element is a different change with
  a different argument, and several carry comments explaining the wording.

### 3. Three dev routes, four specs, and why it is three routes

`/dev/navigation` (portal plate, plus the probes), `/dev/navigation-room`
(`.cr-root`) and `/dev/navigation-room-nb` (`.nb-root`, all three plates). The
split is forced, not chosen, and it is `/dev/animated-logo-room`'s precedent:
`classroom.css` carries `body:has(.cr-root)` and the notebook has its own canvas
mirror, so either room's wrapper repaints the whole document and one page cannot
hold two plates.

The notebook got its own route rather than a note saying it was unmeasured
because it is the room with the record -- `SaveIndicator` arrived here at
3.65:1 and `VersionBadge` at 3.20:1, both having passed review in the room they
were written for, which is exactly the shape of a primitive written on the
portal plate and mounted into three notebook surfaces in one change. Measured:
**7.27:1** (default), **7.75:1** (light), **9.18:1** (IDEA); classroom card
**7.27:1**; portal **5.88:1**.

**The probe performs two REAL navigations.** Toggling a prop and photographing
the bar proves the CSS and says nothing about whether a real navigation reaches
the state that toggles it. It lives in `/dev/navigation/+layout.svelte` because
a layout is not remounted when a child route changes -- a probe on the page is
exactly what a navigation unmounts.

Full pass: **8 route/width runs, 78 measurements, 0 outside threshold** under
`--strict`.

#### Two harness traps hit for real, both producing plausible wrong readings

- **`clickUntil` repeats until its predicate holds.** With the predicate on
  `__navProbe.done`, the second click landed 900ms into a probe that takes about
  2.5s, so TWO probes ran concurrently and the second one's FAST navigation
  sampled the indicator the first one's SLOW navigation was still painting. The
  report read `["indicator","indicator"]`: the gate looking broken in the one
  direction that matters, entirely from the instrument. Fixed by pressing once
  on a synchronous `started` flag and then `waitFor`-ing `done`, which is the
  harness's own documented split, plus a re-entrancy guard in the handler.
- **`expectVisible` defaults to `expectPresent` when omitted.** Setting
  `maxVisible: 0` alone printed the impossible threshold "1 to 0 visible" and
  reddened a correct component a second time. Both bounds have to be written.

#### A contrast probe with a typo, and the reason it now has an oracle

The dev page's own canvas probe first reported `--green` on `--bg0` as
**2.50:1**. The real figure is **7.52:1**; the divisor in the relative-luminance
step had been typed `2.055` instead of `1.055`. It was a plausible-looking
number in the FAILING direction, and it would have been "measured" straight into
this report as a finding on the component. The probe now runs three pairs whose
answers are fixed by the specification -- black on white 21:1, a colour on
itself 1:1, `#767676` on white 4.54:1 -- and reports `instrument: <what is
wrong>` instead of numbers if it cannot reproduce them. Its self-check string is
part of what the spec asserts.

The same run also showed `sweepVsTrack` at 1.01:1 for a pair visibly two stops
apart: the track is a `color-mix()` WITH ALPHA, and passing the raw declared
value as a ground is not the same as compositing it first.

### 4. Mutation proof, both directions

Restored from a **scratch copy** each time, never `git checkout --`, which
restores from HEAD and would have discarded this session's other uncommitted
work; md5 verified after each restore.

- **Delay removed** (`NAV_INDICATOR_DELAY_MS` 250 -> 0). Behavioural marker
  confirmed the mutant was live rather than a stale bundle: the report printed
  `gate 0ms`, and the fast navigation drew `indicator at 9ms`. The gate's
  `order-result` reddened; **every other measurement stayed green**, which is
  the property that makes a mutant worth anything. Restored, md5 OK, green.
- **Bar always painted** (`shown` forced true). The absence row
  `presence [no bar painted with no navigation in flight]` reddened, together
  with the resting-visibility row and the gate. Restored, md5 OK.
- **Selector renamed** (`.nav-prog-track` -> `.nav-prog-rail`). This is the
  direction an absence row structurally cannot see, and it behaved exactly that
  way: the absence row **stayed green at `present 0`** while its POSITIVE
  CONTROL on `/dev/navigation?force=1` reddened at both widths. That is the
  pairing the harness README requires, demonstrated rather than asserted.

### 4b. The worst thing this bundle did, and it never went red

The indicator's wrapper carried `data-testid="nav-progress"`. It is mounted in
the ROOT layout, so its element is the first one in the body on every page in
the application, and at rest it is correctly a ZERO BOX.

`waitForApp` decides a page has painted by taking the **first** match of
`main, h1, [data-testid], .harness` and requiring a non-zero box -- one
candidate, not the first candidate with a box. So the predicate picked a 375x0
element and never held, **on every route in the harness**.

Measured on `/dev/marks`, a route this bundle has nothing to do with, by
removing the mount and putting it back:

| | with the mount | mount removed |
| --- | --- | --- |
| `/dev/marks` @375 | **app DID NOT RENDER (DOM never settled) in 30007ms** | **app rendered in 479ms** |
| wall clock, one route/width | 31.8s | 2.2s |

A full pass would have gone from about three minutes to about fifty. **Nothing
failed.** Every check still ran and still reported correct numbers; the only
symptom was a slow run and a status line most readers skim. It was found by
noticing that a background full pass had been going for seventeen minutes.

The hook is `data-nav-progress` now, with the measurement in the component's own
source. The deeper fragility is `waitForApp`'s, and it is NOT fixed here:
`browser.mjs` is harness core and outside this lane. It is written up in
`tools/browser-verify/README.md` under its own heading so the next component to
do this is caught by reading rather than by re-measuring.

**This is also why the `--strict` runs earlier in this entry were not enough.**
Four specs green over eight runs said nothing about the other 86.

### 5. Orphan A -- five assertions in `coin-public-ledger` that could not fail

`tests/coin-public-ledger.test.ts` asserted the opaque student id was not an
email in disguise with four `expect(first.student_id).not.toContain(needle)`
calls over `studentA.email`, `'ada.lovelace'`, `'lovelace'` and `'boscotech'`.
The line above asserts `student_id` matches `/^[0-9a-f]{32}$/`, and `.`, `@`,
`l`, `o`, `s`, `v`, `t` and `h` are none of them hex digits: no hex string can
contain any of the four. A fifth,
`expect(decoded).not.toContain(studentA.email)` over the digest's 16 decoded
bytes, was vacuous by LENGTH -- the address is longer than the string searched.

Replaced with the sibling's shape (`coin-public-anon-projection.test.ts`), which
tests the generator's contract: stable, distinct, not equal to md5 of anything a
visitor already holds, and **every id moves on a salt rotation**.

Proven on two mutants, and the two halves catch different ones:

- **Empty salt** (`salt text not null default ('')` in 0089, so every id is
  plain `md5(email)`): the md5-guess sweep reddens with
  `id equals md5(ada.lovelace@boscotech.net)`. Computed against the same mutant
  id, **0 of the 8 deleted assertions would have failed**.
- **A salt-independent pepper** (`md5('fixed-pepper-not-the-salt' || e.email)`):
  the md5 sweep cannot see this one, and the **rotation** assertion reddens with
  `Walkup, Student's id survived a salt rotation`.

A trap worth recording: the first attempt at the second mutant edited 0089 and
the suite stayed green. `_coin_public_roster()` is redefined by **0157**, which
is last in this suite's chain, so 0089's copy is not the effective definition. A
mutation applied to a superseded definition is a mutant that never ran, and it
reads exactly like a check that does not bite.

### 6. Orphan B -- `/dev/foundry-submit` read `present 2` against `exactly 4`

**The spec was stale; nothing is missing from the surface, and no Foundry code
changed.**

The spec was written at 09:30 on 2026-08-30 (`91ba99f`). At 11:15 the same day,
`6cf8f11` narrowed the missing-asset sweep in `preflight.ts` so a reference that
LEAVES the bundle is no longer put to it. Two of the four sentences the spec
counted were exactly that: the fixture's `https://fonts.googleapis.com/...`
stylesheet and its `https://cdn.jsdelivr.net/npm/chart.js` script, each earning
"this upload does not include a file at ..." over a mangled split-on-slash path,
about files that were never supposed to be in the upload. The narrowing's own
header calls them false sentences and notes it can refuse nothing -- the sweep
only ever pushes warnings -- so nothing that passed before can fail now.

Read back off the rendered panels rather than reasoned about: the two remaining
are the leading slash on `/art/logo.png` (failure tone) and the unconditional
`localStorage` warning on `app.js` line 2 (warning tone). One per tone, which is
what keeps the two-panel row honest. The spec now reads 2 with the history
beside it, because a count pinned to what a surface produced before a deliberate
change is a ratchet.

### Verified

- `svelte-check`: **0 errors, 37 warnings**, breakdown re-derived as
  **31 `state_referenced_locally` / 5 `css_unused_selector` /
  1 `perf_avoid_nested_class`**. Baseline unmoved. (`.env` written with the two
  placeholder public values before `svelte-kit sync`, per the phantom-error
  note.)
- `npm test`: **215 files, 4446 tests, all passing.**
- `npm run verify:browser -- --selftest`: **64 controls (32 negative, 32
  positive), 0 instrument failures.**
- The four new specs under `--strict`: **8 runs, 78 measurements, 0 outside
  threshold.**

### NOT verified

- **Nothing signed in.** The harness drives `/dev` routes only; the six real
  surfaces the primitive was adopted into (`GradingConsole`, `RevisionHistory`,
  `PeoplePanel`, `ReviewConsole`, `DocumentationCheck`, `AdminLogPanel`) all sit
  behind a Bosco Tech Google session. What is measured is the REAL component in
  the REAL rooms those surfaces mount it in, which is the coverage a `/dev`
  route can give and is not the same as driving the surfaces themselves.
- **No live Supabase, no migration.** This bundle adds none.
- **Web fonts do not load** in the harness (the proxy resets
  `fonts.googleapis.com`), so every pixel figure here is in the fallback stack.
  Contrast is unaffected -- colour is resolved by painting and reading the pixel
  back.
- **`prefers-reduced-motion` is `no-preference` for every check except
  `motion`**, which emulates both states itself. Every geometry and contrast
  number above describes the unreduced state.
- **The 36 findings a full pass reports are pre-existing, and that is measured
  against a control rather than assumed.** Full pass on this branch: **94
  route/width runs, 1080 measurements, 36 outside threshold, 192.7s**. The same
  run on an untouched `origin/main` worktree, same machine, same session:
  **86 runs, 1002 measurements, 38 outside threshold, 171.2s**. The difference
  is exactly the two this bundle FIXED on `/dev/foundry-submit`, one per width;
  it introduces none. The 36 are `/dev/pathways`'s two harness controls and a
  cluster on `/dev/notebook`, `/dev/notebook-review-student` and the two
  `/dev/gauntlet-shell` specs where the component does not mount at all
  (`present 0` on every row, plus console errors) -- reproduced identically on
  the control, out of this lane, and not investigated.
- **A `504 (Outdated Optimize Dep)` appeared once mid-session** and did not
  reproduce on a fresh dep cache. It is vite's optimizer racing a tree being
  edited under a long-lived dev server, not a code defect; the numbers above are
  from a run started after `rm -rf node_modules/.vite`.
- **The indicator was never seen by a human.** Every claim above is a measured
  number from a headless Chromium.

### Left for a later sweep

The ~14 remaining ad-hoc pending strings named in section 2, and the two files
this lane does not own: **`src/lib/coin-desk/*`** (lane 3) carries seven
`<p class="note">Loading&hellip;</p>` paragraphs -- `RolesManager` x3, `LogView`,
`PayoutManager`, `ContractsManager`, `SectionManager` -- which are the largest
single cluster of the entity spelling and the obvious next adoption. Nothing
under `src/lib/maps/` or `src/routes/maps/` (lane 1) was read or touched.
