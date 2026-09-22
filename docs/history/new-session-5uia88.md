---
title: "The home page scrolled and nobody could see it: the pathway sheet, the body lock, and a schoolwide hero subtitle"
date: 2026-09-22
branches: ["claude/new-session-5uia88"]
migrations: []
subsystems: ["portal", "verification"]
---

Ledger 0276. A student, James Morales, filed "I cant scroll on the home page"
on 2026-09-16 against build `8b115a7`, role student, viewport 2707x1074, Chrome
on Windows. Under "tried first" he wrote "I reloaded and tried different
mouses." Both sentences turned out to be evidence, and the second one is what
named the store.

## What was actually wrong

The wheel was never blocked. `position: fixed` does not absorb a wheel event:
the scroll chain runs from the element up the DOM to the document, which is
precisely why a modal conventionally needs a body lock at all. Measured in the
container's Chromium at the reporter's own 2707x1074, with the first-login
pathway sheet up, a real trusted wheel (`page.mouse.wheel`, CDP, not a
synthetic `dispatchEvent`) moved the document 0 -> 415px, its entire range.

It was invisible. Rasterized and diffed across that full range, with every
animation stilled so the diff isolated scroll-induced change and with a
two-screenshot noise floor measured at **0%**:

| state (same page, same 438px range, animations stilled) | viewport pixels that change |
| --- | --- |
| sheet up, no lock (the shipped behavior) | **7.9%** |
| sheet hidden, no lock (the positive control) | **27.5%** |

The overlay covers 2707x1074, 100% of the viewport, at 0.72 alpha with a
`backdrop-filter`, and the panel inside it is fixed and centred. So the page
moved 438px and almost nothing a reader was looking at moved with it. A scroll
that works and cannot be seen is worse than one that refuses, because a refusal
is legible and this reads as a broken mouse. Then: no scrim exit, only Escape
and two buttons, and a deferral in `sessionStorage` -- so a reload brought the
sheet straight back. "I reloaded and tried different mouses" is the whole
defect described from the outside.

The structural floor underneath it is real too, and it is why a wide window
made this worse rather than better. Every home block is `max-width: 1100px;
margin: 0 auto`, so the document height is IDENTICAL at 1440 and at 2707 --
measured 1348px both times signed out. At 2707x1074 that is 274px of scroll
range signed out and 438px with the sheet's fixture. A wider monitor buys a
reader no extra scroll at all; it only enlarges the fixed background the
content column floats in.

## What shipped

**The body scroll is locked while the sheet is up.** Measured rather than
assumed, both directions and both instruments: `document.body.style.overflow =
'hidden'` takes a real trusted wheel from 0 -> 300 to 0 -> 0, and clearing it
restores 0 -> 300. The previous inline value is captured and restored in the
`$effect` cleanup, which runs both when `show` goes false and when the
component is destroyed, so no path -- dismiss, choose, navigate -- leaves the
page locked; it also composes with `ContentComposer`, which writes the same
property, instead of clobbering it. Verified after dismissal: inline overflow
back to `(none)`, computed back to `auto`, wheel 0 -> 300.

**`window.scrollTo` IS NOT GOVERNED BY THAT LOCK AND A TEST WRITTEN ON IT
WOULD HAVE PASSED WITH THE LOCK REMOVED.** With `body { overflow: hidden }` in
force, a real wheel goes 0 -> 0 while a programmatic `scrollTo(0, 99999)` still
reaches 438px. This cost a wrong reading inside this bundle before it was
caught: an early probe reported the programmatic scroll "REFUSED 0 -> 0", which
was an artifact of `html { scroll-behavior: smooth }` and a synchronous read
taken before the animation started, not of the lock. It is the reason the
shipped spec asserts `body`'s computed `overflow-y` rather than a scroll.

**The scrim is a real dismiss control.** A labelled `<button class="pwp-scrim">`
absolutely positioned `inset: 0` inside the overlay, AFTER the panel in DOM
order and painted behind it, so Tab reaches the six tiles and two actions first
and assistive tech gets an announced control. A click handler on the overlay
div was the rejected shape: it needs a keyboard equivalent to satisfy
`a11y_click_events_have_key_events`, would have moved the warning count off 37,
and is invisible to a screen reader either way. Hit-tested at 375x1074,
375x640, 1440x1074 and 2707x1074 -- `(4,4)`, `(8,8)` and `(mid, bottom-4)` all
resolve to `.pwp-scrim` at every one. **The scrim's own centre is inside the
panel**, because the panel is centred over it, so a check that clicked the
element's midpoint would press a pathway tile and prove nothing; the spec
clicks whatever `elementFromPoint` returns at the corner instead.

**A visible sentence naming the way out**, because the page is now genuinely
frozen and a frozen page with no stated exit is the same complaint one step
over: "The page is paused behind this box. Press Escape, or click outside it,
to decide later."

**The deferral survives a reload, and expires.** `localStorage` under
`pathway_picker_deferred`, shape `{v:1, at:<epoch ms>}`, with the pre-0276
`sessionStorage` key read as a fallback so a student mid-session is not
re-prompted. Same shape as `$lib/notebook/draft-mirror.ts`: one namespaced key,
a stored shape version, an unknown version DROPPED rather than coerced, an age
cap, a refusal returned rather than thrown.

**THE COST OF THAT, STATED: the cap is what makes permanence safe, and seven
days is the number.** This picker is the ONLY student-facing way a pathway is
ever set -- the only other write to `profiles.pathway` in `src/` is
`/dashboard`, which is admin-only -- so a deferral with no end would quietly
mean "this student never gets a pathway", which is the identity every Bosco
Tech student is supposed to carry. Seven days leaves them alone for a school
week and asks again the next one. A permanent deferral and a session-only one
were both rejected: one loses the identity, the other is the bug.

**The refusal is deliberately not rendered, and that is the one place this
departs from the draft-mirror rule it otherwise copies.** That rule protects a
store holding the only copy of somebody's writing. Here the entire consequence
of a refused write is that the sheet returns next visit, which the student sees
by definition. There is also nowhere honest to put the sentence: dismissing
unmounts the panel in the same tick, so a notice inside it could never render.
A first draft DID add one, and it was unreachable -- removed rather than
shipped as a branch that looks like coverage. The boolean is still returned so
a caller with somewhere to say it can.

**`HomeTour` no longer carries its own copy of the storage rule.** It read
`sessionStorage.getItem('pathway-picker-dismissed')` inline, a literal key and
a literal store thirty lines from the component owning both. Left alone it
would have gone on asking a key nothing writes: the tour would have decided the
picker was showing when it was not, and waited forever for a done event.
`pathwayPickerDeferred` is exported and called.

## The hero subtitle (report 13)

Replaced "Your classes, your notebook, your coin balance, and the training and
games that go with them. Sign in and everything saves." (authored `9e23c961`,
2026-08-15) with:

> Built for the whole school, not just the IDEA pathway. IDEA Maps,
> tournaments, the coin leaderboard, and VANGUARD are open to anyone. Sign in
> for your classes, notebook, and coin balance.

Three sentences, one claim each, in the order a stranger needs them: what this
is, what costs nothing, what signing in adds. **FOUR launcher cards omit
`requiresAuth`** and are reachable signed out, not three -- IDEA Maps, the IDEA
Coin Ledger, VANGUARD and Tournaments, per `$lib/portal-apps.ts`'s own comment
-- so all four are named. Measured 187 chars inside the unchanged `56ch`
measure, contrast 5.31:1 on the page plate at all three widths.

**The rejected alternative:** "One account for your classes, your notebook,
your coin balance, and every IDEA tool." Terser and in voice, and refused
because it still frames the whole site as something you must sign in to, which
is the exact complaint. A visitor told to sign in never learns about the four
things already open to them.

`docs/standards/IDEA_CLAUDE_DESIGN_STANDARDS.md` "Content voice" governed this,
because **`Writing_Voice_Guide.md` does not exist in this repository** and the
prompt cited it as authority.

## Three of the prompt's claims were wrong, and the tree won

**Claim 2's mechanism.** "No `pointer-events: none`, so it absorbs the wheel
across the whole viewport" -- it absorbs CLICKS (`pointerEvents: auto`,
measured) and not the wheel. The culprit was right; the mechanism was not, and
the fix follows the measurement rather than the claim.

**Claim 6 in full: the sticky header works.** Its premise is true and measured
-- `body`'s computed `overflow-y` IS `auto`, so per CSS Overflow 3 `body` is
technically a scroll container. The conclusion does not follow.
`document.scrollingElement` is `html`, viewport propagation comes from the ROOT
element, and Chrome resolves `position: sticky` on a body child against the
viewport, not against body's own content-sized box. Measured with a positive
control that discriminates -- a static probe div inserted right after the
header:

| | control div moved | header moved | verdict |
| --- | --- | --- | --- |
| as shipped, 375 / 1440 / 2707, three routes (9 readings) | 274-300px | **0px** | STICKS |
| injected `header { position: static }` | 300px | 300px | DOES NOT STICK |
| injected `body { overflow-x: visible }` (the prescribed fix) | 300px | **0px** | STICKS, identically |

The middle row is the positive control: the instrument does discriminate, so
the top row is a real negative result and not a blind one. The bottom row is
the change the prompt asked for, and it moves the reading not at all. **No
change was made.** Editing CSS that measures correct to fix nothing would risk
the horizontal-overflow guard that is measurably working (0px overflow at every
width) for no gain.

**`Writing_Voice_Guide.md` is not in the tree.**

## Candidates 3 and 4: ranked by measurement, and not fixed

Neither can produce "cannot scroll" on its own -- measured, a real wheel moved
the document its full range with `.tour-backdrop` mounted. Both are paint cost.
Frame intervals during a scripted wheel scroll at 2707x1074, 120 rAF samples:

| | median | p95 |
| --- | --- | --- |
| canvas on, no tour | 16.7ms | 33.4ms |
| canvas killed (control) | 16.7ms | 33.3ms |
| canvas on at 375px | 16.7ms | 16.8ms |
| signed out: canvas + the spotlight's `0 0 0 200vmax` shadow | **33.3ms** | 33.4ms |

So the spotlight's 5414px shadow spread halves the frame rate, 60fps to 30fps,
and the particle canvas is measurably free on this machine -- the opposite of
the prompt's ranking, which put the canvas above it. **Caveat that matters:
this is a cloud container's Chromium, not the school's 6-8 year old desktops,
so the absolute numbers do not transfer and only the ratio does.** Jank, not
blockage, and the prompt said to leave them unless ranked first. Left alone.

## Verification

- `npx svelte-check`: **0 errors, 37 warnings in 20 files** before and after,
  breakdown 31 `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class` unchanged. Re-derived with the two `PUBLIC_SUPABASE_*`
  values exported and `svelte-kit sync` first, per CLAUDE.md; the line on this
  tree is correct.
- New spec `tools/browser-verify/routes/tour-mode-picker.mjs`, green at 375,
  1440 and **2707**: 42 measurements, 0 outside threshold, `--strict` exit 0.
- **Mutation proof, both directions, judged by the browser harness** because
  these are geometry and CSS-state claims that `tests/dom/` has no layout
  engine to see and would read as zero:

| mutant | result |
| --- | --- |
| the body scroll lock removed | **KILLED** -- step 1's `until` never satisfied in 12 attempts, 1 measurement outside threshold, `--strict` exit 1 |
| the scrim dismiss control removed | **KILLED** -- 4 measurements outside threshold, exit 1, and the step names what it pressed instead (`pwp-overlay`) with the page still locked |

  Each mutant was restored from a `cp` copy taken beforehand and md5-verified
  against the pre-mutation digest, never with `git checkout --`, which is a
  discard-to-HEAD and would have taken this session's uncommitted work with it.
  Re-verified green after both restores.
- The counts block was REGENERATED, not hand-edited: the prompt asked for a
  hunk-by-hunk hand edit and the repo forbids it (`tests/derived-numbers.test.ts`
  reddens on an edited digit, and `readme-counts.mjs` is the only writer).
  `npm run verify:readme -- --route 'tour?mode=picker'` wrote
  `measured/tour-mode-picker.json` and both regions: 236 -> 237 specs, 472 ->
  474 runs, a 10-line diff confined to the generated tables.

## Not verified, and nobody should read otherwise

- **Nothing was measured against production.** No session here can sign in
  against it, and this container has no route to the database (measured
  previously: only 443 is open).
- **The Vercel preview was not opened.** No cloud session can.
- **Whether James's account actually had no pathway is NOT KNOWABLE from this
  tree**, and the fix is deliberately correct either way: if he was in the
  sheet, the scrim, the lock and the durable deferral answer it directly; if he
  was not, the sheet was still a live defect on its own terms and the
  measurement above stands regardless of who hit it.
- **Web fonts do not load in the harness** (the proxy resets
  `fonts.googleapis.com`), so every text measurement here is in the fallback
  stack, and `prefers-reduced-motion` is `no-preference` throughout, so that
  path is unexercised. The canvas and spotlight numbers are from a cloud
  container, not from a school desktop.

## For Mr. Pina

1. **`/dev/tour`'s "Reset flags + reload" no longer resets the pathway sheet.**
   It clears `sessionStorage`'s old key and this bundle moved the deferral to
   `localStorage`. `src/routes/dev/tour/+page.svelte` is outside this bundle's
   Owns line so it was not touched; the one-line fix is to remove
   `pathway_picker_deferred` beside the existing `removeItem`. It affects the
   harness only, never a student, and the browser spec is unaffected (each run
   gets a fresh context).
2. **`--width 2707` is not in the harness's global `WIDTHS`.** The new spec is
   meant to be driven there and says so, but adding a third global width would
   run all 237 specs at a width none was designed against -- 236 extra runs and
   findings across surfaces this bundle does not own. Worth a decision of its
   own rather than a side effect here.
3. **The spotlight tour's `200vmax` shadow halves the frame rate** (measured
   above). Out of scope for this bundle by its own ranking rule, and a real
   cost on the school's hardware, where the ratio is likely worse than here.
4. **A student has no way to set a pathway except this sheet.** `/dashboard`'s
   pathway write is admin-only, and `ProfileMenu` only displays the chip. The
   seven-day cap is what keeps the sheet coming back; a control in the profile
   menu would make the deferral genuinely free and is the better long-term
   answer.
