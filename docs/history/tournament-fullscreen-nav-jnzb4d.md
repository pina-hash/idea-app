---
title: "Prompt 0091: the tournament projector had no way out of fullscreen, was drawing its stage in an 880px column, and was eating the letter `f` out of the report box (`claude/tournament-fullscreen-nav-jnzb4d`)"
date: 2026-09-06
branches: [claude/tournament-fullscreen-nav-jnzb4d]
migrations: []
subsystems: ["Tournaments", "Testing", "Browser harness"]
---

No migration, no database change, no claim. Three defects on one surface,
all three found by measurement rather than by reading, and one of them found
by the instrument written for a different one.

**This surface runs the IDEA100 Hook Design Competition bracket in front of a
class on Tuesday 2026-09-08.** Everything below was chosen with that as the
constraint, which is why the exit control dims rather than hides.

## What was reported

Mr. Pina, from the tournaments surface, on 2026-09-06:

> ullscreen ormatting is poor. missing button to go back to last page

Prompt 0077 had rebuilt `/tv` two days earlier and sized it for a room --
up-next names 24.8px to 57.6px, round labels 17.6 to 27.2, a match clock, and
an F key for fullscreen -- and measured all of it at 1920 in a headless
browser. Its own checklist said it could not look at a projector. This is the
first report from the real thing.

## 1. The stage was rendering in an 880px column, and it is not a fullscreen bug

`src/app.css` carries `main { max-width: 880px; margin: 0 auto; }`. `TvStage`'s
stage is a `<main class="tv-body">` and the component only ever overrode
`padding` -- a class beats an element selector, so the padding was replaced and
the cap and the auto-centring were not. `.tv-head` and `.tv-foot` are a
`header` and a `footer` and are matched by neither, so they went full bleed.

Measured at 1920x1080 before the fix:

| | before | after |
| --- | --- | --- |
| `.tv-body` width | **880** (45.8% of 1920, 520px dead black each side) | 1920 |
| `.split-main` (the up-next column) | **243px** | 1283px |
| up-next entry name, laid-out width | **0px** (`scrollWidth` 155, `clientWidth` 0) | 155px, not truncated |
| `.versus` (the live pair) | 784px | 1824px |

The two entry names the room is there to read were being ellipsised out of
existence by a grid track that had nothing left to give. At 1600x900 the
played-count line additionally hung 79px past the bottom of the stage box.

**IT IS A WIDTH DEFECT AND NOT A FULLSCREEN ONE.** Real fullscreen was entered
in Chromium (`document.fullscreenElement === HTML`) and every figure came back
BYTE-IDENTICAL to the same viewport in a window, at all three ratios. Nothing
about the layout is a function of the fullscreen state; it is a function of
viewport width alone, and it gets worse the wider the screen. Fullscreen is
simply how somebody first reaches the widest state their machine has. In a
Playwright context the viewport already carries no browser chrome, so a
1920x1080 viewport IS a 1920x1080 fullscreen box -- which is why prompt 0077
measured a passing 1920 and Mr. Pina saw a failing one: he was in a WINDOW on
a projector at some width, and the window's own width is what the cap was
fighting.

The fix is two declarations inside `.tv-body`'s own rule, `max-width: none`
and `margin: 0`, with the measurement written beside them.

**What was NOT done: `src/app.css` was not touched.** The 880px cap is right
for every reading surface in the app and wrong for the one element in it that
is a wall. Lifting the global rule to fix one component would repaint every
page in the portal from a tournaments bundle.

## 2. There was no way out, and the exit control is in the footer's own flow

The Fullscreen API's exit is Escape and browsers deliberately paint no chrome
for it. `/tv` offered fullscreen on an F key, hinted once for nine seconds and
then gone, and rendered **zero** buttons, links or `role=button` elements
inside `.tv` in any state. So a person who pressed F on the machine driving a
projector had to already know a keyboard shortcut, in front of a room.

`.tv-exit` is a real `<button>` carrying the words **"Exit full screen"** and
the key that does the same thing, **"Esc"**. Three decisions in it are
load-bearing:

* **IT LIVES IN `.tv-foot`'S OWN FLOW, NOT FLOATING OVER THE STAGE.** `.tv-foot`
  is a `flex: none` sibling BELOW `.tv-body`, so "it never covers the match" is
  a property of the box model rather than a number somebody tuned. Measured at
  all three ratios: no intersection with `.tv-body`, `.versus` or `.upnext`.
* **IT DIMS AND NEVER HIDES.** The ordinary answer for a control over a
  projected image is to fade it out entirely after a few seconds of stillness.
  The failure this control exists to fix is *a person stuck in front of a
  room*, and a control that has vanished is one more thing they have to know
  how to summon. `EXIT_CONTROL_IDLE_MS` is 4000ms and it moves `opacity` only:
  the box does not move, so the footer never reflows, and the pill is
  hit-testable and Tab-focusable at every moment rather than only after a
  reveal gesture a keyboard cannot easily perform. Measured 15.86:1 awake and
  **6.60:1 settled**, both halves of it, at all three ratios.
* **IT IS AT THE LEFT END OF THE FOOTER, WHICH IS THE FIX FOR A DEFECT THE
  FIRST DRAFT SHIPPED.** `SiteFeedback`'s shell pill is `position: fixed` at
  `right`/`bottom` with `z-index: 90`, mounted in the ROOT LAYOUT, so it is on
  this page like every other. Written into the right end of the footer first,
  Chromium refused to click the exit control at 1024x768 -- *"Report a problem
  intercepts pointer events"* -- which is a way out that cannot be taken.
  Packing the footer from the left makes the clearance a property of the
  layout instead of a margin measured against another component's size.

`isFull` is read from the browser's own `fullscreenchange` event rather than
tracked beside the toggle, because Escape, the F key and the control are three
ways in and out and only the event sees all three. It is seeded on mount, so a
reload taken while already fullscreen still renders the exit.

**F is still a toggle and Escape is still the browser's.** Neither was
narrowed.

### The 375px reachability defect, found by the hit test

At 375px the footer was `nowrap`, the share address alone is 246px of a 375px
row, and the exit control was pushed to `right: 473` -- **98px outside the
viewport**. `.tv`'s own `overflow: hidden` clipped it in silence, so the
harness's horizontal-scroll check read 0px overflow and said nothing. What
caught it was hit-testing the control's own span: three of five sample points
answered `null` (outside the viewport) and two answered the report pill.
`flex-wrap: wrap` plus `order: -1` puts the way out on the first row and lets
the address wrap under it, which also lifts it clear of the band the report
pill is anchored in. After: `x 19..211` of 375, 5/5 sample points on the
control.

**This is the argument for hit-testing over a rect test, again.** A rect
intersection would have called both the 1024 case and this one fine.

## 3. The swallowed keystroke was real, and it is Mr. Pina's own report

Both letters missing from *"ullscreen ormatting"* are `f`. `TvStage` bound a
`svelte:window` keydown that matched `f`/`F` and called `preventDefault()`
**unconditionally**, and `/tournaments/[id]/tv` carries no `FEEDBACK_EXCLUSIONS`
rule, so the report box is on this page like every other.

Two window listeners sit on the SAME node here, and `FeedbackBox`'s own
`stopPropagation()` cannot stop a sibling listener on that node -- only
`stopImmediatePropagation()` would -- so nothing downstream could have saved
it. Every `f` typed into the report box was eaten AND toggled the projector's
fullscreen while somebody was typing a sentence about fullscreen.

Reproduced in Chromium against the real component, through the real report
box, on the real page:

```
typed  "Fullscreen formatting is poor"
got    "ullscreen ormatting is poor"     <- before
got    "Fullscreen formatting is poor"   <- after
```

`keyTargetIsTextEntry` in the new `src/lib/tournaments/fullscreen.ts` is the
whole fix and it lives alone, because a second copy of "is somebody typing" is
the copy that stops matching. It is deliberately wider than
`<input type=text>`: `INPUT`, `TEXTAREA`, `SELECT` and any `isContentEditable`
host, which is the shape this repo's rich text arrives in. A non-element target
answers false rather than throwing -- a handler that throws on one synthetic
event is a handler that stops working for every real key after it.
`keyHasModifier` beside it stands the shortcut down for Ctrl+F, Cmd+F and
Alt+F, which are the browser's and the OS's.

### The same defect, off this surface, NOT fixed here

**`src/lib/fsp/FspDayArchive.svelte:74`** binds the identical shortcut with the
identical shape:

```js
if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    toggleFullscreen();
}
```

It checks modifiers (which `TvStage` did not) and does NOT check whether a
person is typing. It is outside this bundle's ownership and was left alone.
The fix there is one line: `if (keyTargetIsTextEntry(e.target)) return;`,
importing the predicate rather than writing a second one. Whether
`fullscreen.ts` should move out of `$lib/tournaments/` when a second subsystem
calls it is a decision for the bundle that does it.

## What was measured, and with what

Real fullscreen, at 1920x1080 (16:9), 1920x1200 (16:10) and 1024x768 (4:3),
driven with `playwright-core` against `/opt/pw-browsers/chromium`.
`document.fullscreenElement` was `HTML` in every reading -- these are
fullscreen numbers, not window numbers relabelled.

Type sizes in fullscreen, after (unchanged by this bundle; the clamps were
already at their ceilings at 1920):

| | 1920x1080 | 1920x1200 | 1024x768 |
| --- | --- | --- | --- |
| tournament name | 41.6 | 41.6 | 26.62 |
| round label | 35.2 | 35.2 | 21.5 |
| up-next round labels | 27.2 | 27.2 | 16.38 |
| up-next entry name | 57.6 (155px wide) | 57.6 (155px wide) | 30.72 (83px wide) |
| played count | 32 | 32 | 19.46 |
| footer / exit control | 26.88 | 26.88 | 14.34 |

Exit control: 400x64 at 1920, 214x44 at 1024 -- the 44px floor is a
`min-height`, held at every ratio. 5/5 `elementFromPoint` samples across its
full span return the control itself at every ratio and at 375. Nothing in
`.tv` falls outside the viewport at any ratio; no horizontal scroll anywhere;
no console errors.

Contrast, composited over the real ground with the ancestor opacity
premultiplied:

| | awake | settled |
| --- | --- | --- |
| "Exit full screen" | 15.86:1 | 6.60:1 |
| "Esc" | 15.86:1 | 6.60:1 |
| the pill's border (a `--boundary`-class edge, 3:1) | 6.86:1 | 3.36:1 |

**THE FIRST CONTRAST PASS WAS WRONG AND ITS OWN NUMBERS SAID SO.** The helper
forgot to premultiply the ink by the ancestor opacity, so it reported the ratio
RISING from 15.86 to 16.89 as the pill DIMMED -- which is impossible, and is
the tell. Corrected, with a negative control (the ink forced to its own ground)
reading 1.08:1.

`--tnm-ink-dim` on the "Esc" hint was the first draft and it FAILS: 6.86:1 at
full strength, **3.36:1 settled**, under the 4.5 floor for a word in the state
the control spends almost all of its life in. Solving the composite for 4.5 at
0.62 opacity on this ground needs an ink of at least 213 and `--tnm-ink` is
237, so nothing dimmer can clear it -- the two halves are separated by SIZE and
the gap instead of by hue.

## The instrument's own limits, stated

* **The harness's `contrast` check cannot see this control's idle state.** It
  composites ancestor BACKGROUNDS and models no ancestor `opacity` -- its own
  header lists `opacity` among the things it deliberately does not chase -- so
  it reports 15.86:1 whether the pill is at full strength or settled. That is
  not a fault in the check; nothing else in the app dims a control on a timer.
  The new route spec therefore carries its own opacity-composited probe, whose
  `state:idle` element is the positive control against measuring the easy state.
* **`Escape` could not be verified as an exit here.** Chromium's
  fullscreen-exit-on-Escape is browser-UI level and a Playwright-synthesized
  Escape does not reach it: `document.fullscreenElement` stayed set. Nothing in
  this bundle touches Escape, so it behaves exactly as it did before -- but
  "Escape exits" is **NOT VERIFIED** here and is the first thing to check on
  the real machine.
* **The real `/tv` route was not driven.** It needs a Supabase session and a
  live tournament. Everything here is the identical `TvStage` component through
  `/dev/tournaments?view=tv`, which is what the route mounts. The route file
  itself is unchanged.
* **`prefers-reduced-motion` is `no-preference` in the harness**, so the
  reduced-motion path (the pill's opacity transition is gated behind
  `no-preference`; with it cancelled the pill simply snaps between the two
  opacities and is fully painted in both) was not exercised.
* **Web fonts do not load in the harness** (`fonts.googleapis.com` is blocked),
  so every size above is measured in the fallback stack.

## Tests, and the controls that prove they bite

`tests/tournament-tv-fullscreen.test.ts` (node, 22 tests) covers the predicates
and a source contract. `tests/dom/tournament-tv-exit-mount.test.ts` (dom, 8
tests) covers what only a real event can settle: `defaultPrevented` after a
real dispatch, which node rendered, which browser call a real click made.
`tools/browser-verify/routes/tournaments-view-tv-status-live-field-4-state-live.mjs`
is the only route spec in the directory that drives `requestFullscreen`, and it
carries the geometry.

Three positive controls, each run against the REAL component, restored from a
`cp` copy and verified md5-identical (`33add171b157463d7bb3841f38142b41`):

1. **Remove the exit control** (`{#if isFull}` to `{#if false}`): the harness
   reported **7 measurements outside threshold**, the dom test 4 failures and
   the node test 1, every one of them naming the control. Note what stayed
   green: `pair:present` held and `covers-the-pair:no` passed VACUOUSLY, which
   is precisely why `exit:present` is an element of the compared array.
2. **Move it over the live pair** (`position: fixed; top/left 50%`): the
   geometry row reddened -- `covers-the-pair:YES`, `covers-the-stage:YES`,
   `hit:SOMETHING-ELSE` -- while `presence` and `text-contains` stayed **green**.
   The control still existed and still said the right words. That is the proof
   the check measures geometry and not existence. **The dom mount test passed
   all 8 under the same mutation**, which is CLAUDE.md's happy-dom rule
   demonstrated rather than quoted: there is no layout engine there and a
   geometry claim written in that project would have passed vacuously.
3. **Revert the keystroke guard** (`if (false && keyTargetIsTextEntry(...))`):
   the dom test reddened on the textarea case. Its own positive control -- a
   bare `f` on `document.body` IS prevented -- runs first in the same test, so
   "not prevented" can never pass because the handler was simply never bound.

## Deliberately not done

* The host console and the public page (settled by 0077) were not touched, and
  neither was anything about how a match advances.
* `src/app.css`'s 880px `main` cap was not changed. See above.
* `FspDayArchive`'s copy of the keystroke defect was reported, not fixed.
* The exit control does not auto-HIDE. It dims. See above for why, on a machine
  driving a class.
* `tools/browser-verify/checks.mjs` was not given a first-class overlap or
  reach check, though it wants one: the claim is expressed through
  `orderResult`, which is honest (the probe returns an array the run compares
  element for element) but is documented as reading a value the page computed
  rather than a DOM position. A `noOverlap`/`reach` check belongs in that file,
  which is outside this bundle's ownership.

## A container fact worth knowing

Two tests unrelated to this work, `tests/apply-migration-guard.test.ts` and
`tests/apply-migration-trace.test.ts`, failed on the first full run in this
fresh cloud container with *"could not list supabase/migrations on
origin/integration"* -- they derive the applied set from that ref, and the
container's clone had fetched only `origin/main` and the session branch.
`git fetch origin integration` and both pass (51 tests). It reads exactly like
a broken migration gate and is nothing of the kind.
