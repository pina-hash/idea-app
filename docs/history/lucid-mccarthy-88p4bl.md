---
title: "Foundry full screen on an iPhone: the hypothesis was wrong, the overlay already worked, and what a phone actually lost was a row of chrome and the bottom of its own viewport (`claude/lucid-mccarthy-88p4bl`, no migration)"
date: 2026-09-11
branches: [claude/lucid-mccarthy-88p4bl]
migrations: []
subsystems: ["IDEA Foundry", "Interface", "browser-verify harness"]
---

Prompt 0148, from a student report: Enrique Mercado, 2026-09-10, build
`fca512a`, route `/foundry`, iPhone on iOS 18.7 / Safari 26.3, viewport 607x320
(landscape). His words: **"doesn't full screen on mobile good"**.

Branched from `origin/integration` at `7be051f6`, which was the same commit as
`origin/main` (0 ahead, 0 behind), so no merge was possible or needed. The three
opening fetches and the duplicate check are in the ledger entry
(`docs/prompt-ledger/entries/0148-foundry-fullscreen-ios.md`) and are not
repeated here.

## The prompt's hypothesis is false, and the code already knew

The prompt named `AppStage.svelte` around line 396 -- `el.requestFullscreen()`
-- and said that because iOS Safari implements element fullscreen on nothing but
a `<video>`, "the feature cannot work on any iPhone as written and no amount of
permission fixing changes it."

**`enterFull` sets the class BEFORE it feature-tests, and returns early when the
API is absent:**

```js
function enterFull() {
	full = true;
	native = false;
	const el = stage;
	if (!el || typeof el.requestFullscreen !== 'function') return;
	el.requestFullscreen().then(() => { native = true; }, () => { native = false; });
}
```

So the overlay is the floor, not a fallback, and this is deliberate in three
places that all predate this bundle: the component's own header
(`AppStage.svelte:65`, "NATIVE WHERE IT EXISTS, A FIXED OVERLAY WHERE IT DOES
NOT"), `CLAUDE.md`'s Foundry section, and
`tests/dom/foundry-app-stage-mount.test.ts`, whose header points out that
happy-dom has no `requestFullscreen` either, so **every full-screen test in that
file has been driving the iOS path all along**.

Measured rather than argued. Element fullscreen was DELETED from the page --
`delete Element.prototype.requestFullscreen`, `webkitRequestFullscreen` and
`Document.prototype.exitFullscreen`, which is feature removal and not UA
sniffing -- and the real gallery (`/dev/foundry-gallery`) driven at four
viewports in the container's Chromium 141.0.7390.37:

| viewport | API | `data-full` | stage box | exit control |
|---|---|---|---|---|
| 607x320 | present | `native` | 607x320 at top 0 | hit-tests to itself |
| 607x320 | **removed** | `overlay` | 607x320 at top 0 | hit-tests to itself |
| 390x844 | removed | `overlay` | 390x844 at top 0 | hit-tests to itself |
| 844x390 | removed | `overlay` | 844x390 at top 0 | hit-tests to itself |
| 375x812 | removed | `overlay` | 375x812 at top 0 | hit-tests to itself |
| 1440x900 | removed | `overlay` | 1440x900 at top 0 | hit-tests to itself |

`position` is `fixed` in every row and the stage's box equals the viewport's to
within a pixel in every row. **A phone gets a full-screen overlay. The control
is not dead.** The fix the prompt proposed -- "a CSS pseudo-fullscreen fallback
... expand the stage to fill the viewport with fixed positioning" -- is the code
that is already there.

## What is actually wrong, and it is two things

### 1. The height of the full-screen chrome was a function of the app's title

`runningLabel` is `Running <app title>` and it sat in the same `flex-wrap: wrap`
row as the two controls, so whenever it did not fit beside them the bar took a
second row. Measured on the real gallery, before:

| viewport | bar | hint | frame | frame as % of viewport height |
|---|---|---|---|---|
| 607x320 | 52px | 20.5px | 247.5px | 77.3% |
| **390x844** | **104px** | 20.5px | 719.5px | **85.2%** |

The only difference between those two rows is whether the label happened to fit.
A second row costs 52px -- the 44px tap floor plus the gap -- and on a phone held
sideways that is a sixth of the screen, spent on a label, in the one state whose
entire purpose is room. An app title is a string a student chose, so this was a
surface whose chrome grew when somebody named their project well.

**The bar is now one row in the full state and the LABEL is what gives**, with
its text in an element of its own so `text-overflow` has a box to apply to. The
controls carry `flex: 0 0 auto` and never shrink: on the overlay path Escape is a
keydown a focused cross-origin frame never delivers, so the visible control is
the guarantee and a button quietly shrunk under its own 44px floor is the same
defect one step on. Truncation rather than hiding, because the label is the only
place the bar says WHICH app is running and the review queue leans on that --
`runningLabel` names the submitted version there.

After, same surface, same instrument:

| viewport | path | bar | hint | frame | % of viewport height |
|---|---|---|---|---|---|
| 607x320 | overlay | 52px | 20.5px | 247.5px | 77.3% |
| 390x844 | native | **52px** | 20.5px | **771.5px** | **91.4%** |
| 390x844 | overlay | 52px | 40.9px | 751.1px | 89.0% |
| 844x390 | overlay | 52px | 20.5px | 317.5px | 81.4% |
| 375x812 | overlay | 52px | 40.9px | 719.1px | 88.6% |
| 1440x900 | overlay | 52px | 20.5px | 827.5px | 91.9% |

**52px at every viewport, on both paths, with a short title and with a long one.**
At 390x844 that is 52px of screen handed back to the app (85.2% -> 91.4%). At
Enrique's own 607x320 it changes nothing, because his label already fit -- which
is worth saying plainly rather than letting a table imply otherwise.

Independently re-measured with a deliberately long title
(`Deflector Drill Championship Edition Remastered`) against a short one
(`Pong`): before, the bar height moved with the title; after, it is 52px for
both at every viewport.

### 2. `inset: 0` is the LARGE viewport on WebKit, and the overlay stated no height

`inset: 0` sizes a fixed element against the initial containing block, and which
viewport the ICB is depends on the engine: WebKit resolves it against the large
viewport, the viewport as it would be with the browser's toolbars retracted. With
the toolbars up, the bottom of the overlay is therefore behind them. The bar and
its controls are at the TOP and stay visible; what is cut off is the bottom edge
of the running app. That is a full screen that does not quite fit, which is the
shape of the sentence the report actually carries.

`height: 100vh; height: 100dvh;` is the fix and it is **already this repo's
pattern** -- `src/routes/fsp/live/+page.svelte` has carried exactly that pair for
its own full-bleed root. Foundry's overlay never got it. The declaration is
over-constrained against `top: 0` and `bottom: 0`, which CSS resolves by ignoring
`bottom`, so the height wins and nothing else in the rule had to move.

**THIS HALF IS NOT VERIFIED, AND THE INSTRUMENT SAYS SO ITSELF.** There is no
WebKit build in this container (`/opt/pw-browsers` holds `chromium`,
`chromium-1194`, `chromium_headless_shell-1194` and `ffmpeg-1011`, and nothing
else), so the engine whose behaviour this addresses cannot be driven here.
Deleting the two height declarations and re-running the new route spec changed
**nothing**: 22 measurements, 0 outside threshold, identical to the unmutated
tree. That is the honest reading in both directions -- it is the proof the
addition is inert where it CAN be measured, and it is the proof that no check in
this harness can tell whether it does the thing it is there for.

## What was NOT the cause, each ruled out by measurement

- **Not the missing API.** Above.
- **Not a containing block.** No ancestor of the stage on either surface carries
  `transform`, `filter`, `perspective`, `contain` or `backdrop-filter`;
  `forge.css` and `split.css` were swept for all five. `position` reads `fixed`
  and the box is the viewport's.
- **Not the page scrolling behind the overlay.** With the overlay up on the
  gallery, whose document is 3452px tall at 607x320, `window.scrollTo(0, 99999)`
  moved the page by **0px** at both viewports.
- **Not a covered control on the shipping surface.** On `/dev/foundry-run` with a
  long title at 607x320 the Full screen control DID hit-test to
  `SiteFeedback`'s fixed trigger (`.sfb-shell`, 164x44 at y=264 of a 320-tall
  viewport) and the Stop control sat below the fold at y=300..344. That is the
  harness page's own layout putting the stage low on a short screen; on
  `/dev/foundry-gallery` -- the real component tree -- the bar sits at y=121 with
  the same long title and both controls hit-test to themselves. **Recorded
  because it looked like the finding for twenty minutes and is not one**, and
  because the collision is real on any surface whose controls land bottom-right
  on a short viewport, which is somebody else's lane to judge.

## Coverage, and where each claim lives

The split is `tests/dom/` for structure and `verify:browser` for geometry,
because happy-dom has no layout engine and any box read there is zero.

- **`tools/browser-verify/routes/foundry-gallery-state-full-screen.mjs`** (new,
  an `aliasOf` state of `/dev/foundry-gallery`) measures the full-screen state at
  375 and 1440: the stage is `fixed` and exactly the viewport box, the bar is one
  row over three items, neither control is shrunk by the row, the frame gets at
  least 80% of the viewport height, both controls clear 44px and hit-test to
  themselves, the hint is present and says the BUTTON rather than the key, and
  the frame is still mounted inside the full-screen stage. **44 measurements, 0
  outside threshold.**
  - **It removes element fullscreen in a prepare step and measures the OVERLAY
    path on purpose**, for two reasons. It is the configuration iOS gives every
    viewer, so it is the configuration the report came from; and it is
    DETERMINISTIC, where the native path is not -- measured in one session,
    headless Chromium answered `data-full="native"` on the gallery and
    `"overlay"` on `/dev/foundry-run` for the same component and the same press.
    A harness whose measured state flips between runs reports two different
    things under one label. The step returns a STRING
    (`element fullscreen removed`) so a removal that stopped removing anything
    shows up in the report rather than relabelling the native path.
- **`tests/dom/foundry-app-stage-mount.test.ts`** gains the structural half: the
  label's text is in `.fdy-running-label`, inside the `aria-live` region, beside
  the still-`aria-hidden` dot, with **no stray text node left in the region** --
  which is the shape the fix removed and the one that cannot be truncated. Plus
  a positive control on the no-label default, so the element is not merely
  present when a caller supplies a string.

### The checks were put to the defect, and one of them exposed the stale-bundle trap

Three mutants, each applied to a working copy and each restored from an
in-memory copy (`cp`, never `git checkout --`), `md5sum -c` clean afterwards:

| mutant | result |
|---|---|
| drop `flex-wrap: nowrap` from the full-screen bar | **reddens** at 375: `["2 rows","3 item(s)"]` against `["one row",...]` |
| drop `height: 100vh; height: 100dvh;` | **nothing reddens** -- 0 outside threshold. The inert-in-Chromium reading above. |
| put the label text back as a bare text node | **reddens**: `.fdy-running-label` present 0, plus its contrast row; and the dom test goes 2 failed / 10 passed |

**The third mutant passed the first time it was run, and it was the served
bundle that was stale rather than the check that was weak.** `CLAUDE.md` names
this ("a `git stash` does not reliably reach the served bundle" -- the same
Vite-watcher window, reached by an edit rather than a stash). The re-run
`touch`es the file and then POLLS the dev server for the mutated source before
measuring anything, printing which attempt it became live on. Without that
control the row would have been recorded as green over a defect that was
genuinely there, which is the exact failure the mutation was run to rule out.

At 1440 the first mutant does NOT redden -- the label fits, so the bar is one row
with the rule and without it. That is the measurement saying the defect is a
narrow-viewport one, not the check failing, and it is why the row is measured at
both widths rather than only the wide one.

## What is deliberately not here

- **No migration.** `Claims: none`.
- **`CLAUDE.md` IS NOT EDITED, AND ONE SENTENCE IN IT IS NOW WORTH PROMOTING.**
  This bundle's Owns list does not include it and three other ledgers were in
  flight, so a shared file was left alone. Nothing in it became false: its
  Foundry section already says the overlay is the floor and native the upgrade,
  which this bundle confirms rather than corrects. What it does not yet say is
  the durable rule this found -- **a fixed overlay that must fill a phone's
  screen states its height in `dvh`; `inset: 0` alone is the large viewport on
  WebKit** -- which will bite the next full-screen surface anybody writes and
  belongs beside the existing rule rather than inside this entry.
- **No `classroom-updates.json` entry.** The standing directive is scoped to
  classroom-facing behaviour; Foundry is its own subsystem, the file is at the
  repo root and outside this bundle's Owns list, and three ledgers were running
  in parallel.
- **No change to the hint's words**, which `CLAUDE.md` pins ("the sentence says
  the button, not the key"), and no change to the 44px floor, which is a hard
  rule for a student-facing surface. At 607x320 those two account for the
  remaining 72.5px of chrome, which is 22.7% of a 320-tall screen and is
  therefore close to the floor of what this state can cost.
- **Nothing was verified on a real iPhone, or on any WebKit at all.** Everything
  above is Chromium 141.0.7390.37 at explicit viewport sizes, with element
  fullscreen removed where the table says so.
