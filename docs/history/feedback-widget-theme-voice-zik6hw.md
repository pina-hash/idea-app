---
title: "The report window: an IDEA theme that actually paints, dictation through the browser's own speech service, and the box out of the shell chunk (`claude/feedback-widget-theme-voice-zik6hw`)"
date: 2026-09-09
branches: [claude/feedback-widget-theme-voice-zik6hw]
migrations: []
subsystems: ["Feedback", "Operations"]
---

Prompt 0111. No migration. Started from `origin/main` at `54bf64f2`. Owned
paths only: `src/lib/feedback/**`, `src/routes/dev/feedback/**`,
`tests/feedback*`, `tests/dom/feedback*`, the two feedback route specs under
`tools/browser-verify/routes/` and the README's generated regions, this entry
and the ledger entry. Nothing else in the tree was touched; the candidates for
`CLAUDE.md` are listed at the end rather than written, because that file is
outside the surface.

## ONE: the IDEA theme, and why the box was blue

`SiteFeedback.svelte` already carried a block handing the portal's tokens to
the box: `.sfb-host { --fb-accent: var(--green); ... }`. It never painted
anything. `FeedbackBox.svelte` declares every `--fb-*` token on `.fb-scrim`,
which is a DESCENDANT of `.sfb-host`, and a descendant's own declaration beats
an inherited one -- so the box wore its neutral blue defaults (`#7fd0ff`
accent, `#0b1016` plate) on every portal surface while the file beside it said
otherwise. GREENLINE never had the problem because it uses the component's
documented shape, `.gp-feedback :global(.fb-scrim) { ... }`, which lands ON the
scrim and wins on specificity.

The fix is that shape, in `SiteFeedback` (`.sfb-host :global(.fb-scrim)`),
and every value in it is a design-system token read BY NAME, never a literal:
`--bg1`/`--bg0` for the plate, `--white` for ink, `--text-2` for both
secondary tiers, `--green` for the accent, `--amber` for the danger tone,
`--boundary` for every line, `--bg2` for the fills, `--font-display` and
`--font-mono` for the two faces, `--crimson` for the live dot. Reading by name
is what makes one block right in more than one room: mounted in the GAUNTLET
footer the same block sits inside `.gt-root`, which re-points `--green`,
`--bg0/1/2` and both font tokens, so the box comes out neon on graphite with no
GAUNTLET branch anywhere; a site theme (`data-theme="matrix"`) moves it the
same way.

**The component grew hooks, not branches.** The fills were literals beside a
token set whose comment said "driven entirely" by tokens -- a host could
recolour the accent and still get blue-black fields, chips and buttons. So
`.fb-scrim` now declares `--fb-field`, `--fb-chip`, `--fb-control`,
`--fb-shade`, `--fb-font-mono`, `--fb-accent-edge`, `--fb-accent-edge-on` and
`--fb-live`, each defaulting to the exact literal it painted before. GREENLINE
sets none of them and renders byte-identically in colour (measured below); the
one visible change there is the close glyph, which was a bare `<button>` in
the UA face (Arial, measured) and now takes the chrome face.

**The inks are the measured ones, not the obvious ones.** Computed in
`scratchpad/contrast.mjs` over the three grounds a box element can sit on in
each room, then re-read off the real rendered page by painting each colour
onto its ground in a canvas (the pane's own rule for `color-mix` values):

| room | ground | white | text-2 | dim | green | amber | crimson | boundary |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| portal | bg2 (worst) | 11.34 | 5.51 | 4.24 | 6.00 | 4.60 | 3.88 | 3.21 |
| matrix | bg2 (worst) | 14.34 | 7.39 | 5.36 | 7.59 | 5.82 | 4.91 | 4.22 |
| GAUNTLET | bg2 (worst) | 17.40 | 7.11 | 4.69 | 13.38 | 5.93 | 5.10 | 4.14 |

So: `--dim` is the register's own dim token and fails at 4.24 on `--bg2`,
which is exactly the ground a placeholder sits on, so secondary copy is
`--text-2`; `--crimson` reads 3.88 on `--bg2` and is reserved for live/rec
anyway, so the danger tone is `--amber`; and the component's own 45% / 55%
tints of the accent, used on the primary button's edge and the selected chip's,
measured 2.37 and 2.83 against a 3:1 non-text floor -- which is why the two
accent edges became hooks and the portal hands them the full `--green` (6.00),
the way `.btn` in the shell draws its edge.

**Measured on the rendered page, five rooms, `scratchpad/theme-measure.mjs`
through the harness Chromium at 1440:**

- portal (`/dev/feedback`): plate `#1a2a1a` to `#121a12`, box face Rajdhani,
  chrome face Share Tech Mono, accent `#78b870`; title 12.09, note 5.88,
  labels 5.88, kind chips 5.51 (edge 3.21), textarea ink 11.34 (edge 3.21),
  SEND 6.00 (edge 6.00), count 5.88, close glyph 5.88. Worst text 5.51, worst
  edge 3.21.
- GAUNTLET (the real `viewport.css` injected and `.gt-root` put on `<html>`,
  because `/dev/gauntlet-shell` deliberately omits `SiteFeedback` and the real
  `/gauntlet` layout needs a session): plate `#0a1014` to `#04070a`, accent
  `#00ff41`; worst text 7.11, worst edge 4.14.
- matrix (`data-theme="matrix"`): plate `#0c140d` to `#030503`; worst text
  7.39, worst edge 4.22.
- GREENLINE (`/dev/greenline-portal`, its own `FeedbackBox` mount): plate
  `#0b1016` to `#05080b`, accent `#2ae57e`, face Saira Condensed -- every
  colour identical to before; its note/label/count at 4.38 is GREENLINE's own
  pre-existing value and is not this bundle's.
- FRC (`/dev/frc`, the shell's floating mount): identical numbers to the
  portal, because the root layout mounts the control OUTSIDE `.frc-root` and
  the scrim covers the page at 82%. The box on FRC is the portal's box, not an
  FRC-styled one; matching FRC would need hooks on `.frc-root`, which is
  outside this surface.

**Where the override lives, and the alternative not taken.** The prompt said
"where the design system lives". `src/lib/design-system/` is that place and is
outside the owned paths, so the block sits in `SiteFeedback.svelte`, which is
the portal's own mount of the box and already claimed to be doing this. Moving
it to `design-system/` later is a cut-and-paste with no behaviour change.

## TWO: dictation, the judgment item

**The shape.** `src/lib/feedback/dictation.ts`: `dictationConstructor()` reads
`SpeechRecognition ?? webkitSpeechRecognition` off the window and answers null
for anything that is not a function; `Dictation` wraps one session with four
events (final, interim, listening, error); `appendDictation` is the text rule;
`dictationErrorMessage` is the vocabulary. `FeedbackBox` resolves the
constructor ONCE at mount (`untrack`ed, on purpose -- the harness remounts
through a `{#key}`) and renders a DICTATE control beside the message label only
when one exists. `SiteFeedback` threads a `dictation` prop straight through so
a harness can hand in a stand-in.

**The three constraints, and how each is a mechanism rather than a
discipline.**

- *Unsupported means the plain textarea.* Null constructor, nothing renders:
  no button, no note, no live region. Asserted both ways under
  `svelte/server` (0 controls with no window; 1 with a fake constructor; 0
  with `dictation: null`; the textarea present in all three) and under
  happy-dom.
- *Nothing goes anywhere but the browser's own service.* The module makes no
  request of any kind: swept with comments stripped for `fetch(`,
  `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, dynamic
  `import(`, `supabase`, `MediaRecorder`, `getUserMedia`, with the vendor
  constructor name as the positive control. The sentence under the control
  says it in words. The Web Speech API itself sends audio to the browser
  vendor's service (Google's in Chrome and Edge, Apple's in Safari); that is
  the browser's own service and the note names it.
- *Never overwrite typed text.* A final sentence is APPENDED to whatever is in
  the field at the moment it arrives, read fresh, not snapshotted at start;
  interim text is previewed BESIDE the field and never written into it.
  Inserting at the caret was refused: a caret with a selection behind it
  replaces the selection, which is the silent overwrite this rule exists to
  prevent, and a person looking away to speak does not know where their caret
  is. `appendDictation` is asserted as a prefix invariant over 54 typed/spoken
  pairs, and the mounted box is driven type-then-dictate-then-type-then-
  dictate with a MUTANT beside it (the append line replaced by an assignment)
  that measurably loses the typed text.

**What else it does.** `continuous` and `interimResults` on; the result walk
starts at `resultIndex` so Safari's re-delivery of earlier results is not
committed twice; `aborted` after our own `stop()` is not reported; a
constructor that throws is a refusal sentence, not an exception out of a click
handler; sending and "send another" stop the session; unmount aborts it;
listening ends when the browser's `end` fires, never when stop was asked for,
so nothing auto-restarts (iOS ends a session on its own after a pause and an
auto-restart loop there is the known trap). The listening dot is `--fb-live`
(`--crimson` in the portal: live/rec is what it is reserved for) beside the
word STOP, pulses only under `prefers-reduced-motion: no-preference`, and
rests painted at full opacity under `reduce`. The status line is a
`role="status"` live region; the interim preview is not, because it changes
several times a second.

**Where it is expected to work.** Chrome and Edge on Windows
(`webkitSpeechRecognition`, online only). Safari on iPadOS 14.5 and later,
with Siri and Dictation enabled in Settings. NOT Firefox, and NOT Chrome or any
third-party browser on an iPad (WebKit shells do not expose the API), where the
control does not render.

**What could not be tested here.** A real microphone, a real speech service,
and the actual browsers above: the container has Chromium with no audio
device, so every drive used the harness's scripted recogniser, which answers
the same four events through the same `SpeechRecognitionLike` shape. The
permission prompt, the iOS pause-then-end behaviour and the `network` refusal
are all mapped to sentences but none was observed. Mr. Pina's first press on a
school iPad and a school laptop is the check that remains.

## THREE: the box out of the shell chunk, and the trade

**What 0107 measured and what this measured.** 0107 read 43,672 bytes for
`FeedbackBox` and called it about 25% of a 174.8 KiB shell. The first number is
SOURCE bytes and the second is gzip, so they do not divide. Measured here on
production builds of the baseline (`origin/main` in a worktree) and this branch,
walking the client manifest from the SvelteKit start entry, the app entry and
the root layout node (`scratchpad/shell-size.mjs`):

| | files | raw | gzip |
| --- | --- | --- | --- |
| baseline shell | 23 | 664,220 | 180,821 |
| this branch | 19 | 641,786 | 171,921 |
| saving | 4 | 22,434 | 8,900 (4.9%) |

The box and the uploader now sit in two lazy chunks, 12,040 and 7,513 bytes
raw (4,919 and 2,845 gzipped). `save-state` and `SaveIndicator` moved with the
box, as the prompt predicted, and are still shipped by the routes that use them.

**The design.** `SiteFeedback` `import()`s both modules; type-only imports keep
the props typed. The chunk is requested one macrotask after hydration (a
`setTimeout(0)` in an effect whose only tracked read is `shown`), and again on
`pointerenter`, `focus` and `pointerdown` of the trigger -- redundant while the
mount-time fetch succeeded, and the retry when it did not. A click captures
the meta and sets `open` exactly as before; the box mounts when the module
resolves. A failed fetch forgets itself, says so beside the trigger
(`.sfb-load-failed`, `role="alert"`) and the next press or hover tries again.

**An idle callback was the first shape and was measured out.** With
`requestIdleCallback({timeout: 4000})`, a click landing in the first second
after hydration on a throttled link waited a median 640 ms for the chunk
against 97 ms on the static import, because idle had not come yet. Asking at
mount shrinks the window to the fetch itself, in flight.

**Click-to-dialog, measured** (`scratchpad/latency.mjs`: `vite preview` of each
build, a fresh context per trial so the chunk is uncached, CDP-throttled to
150 ms RTT / 1.5 Mbps down / 4x CPU, the landing page `/` with no session,
five trials per row, `performance.now()` from the click's own listener to a
`MutationObserver` seeing `.fb-box`):

| build | scenario | click to dialog, ms | median |
| --- | --- | --- | --- |
| baseline | hover 800 ms, then click | 101, 64, 85, 92, 85 | 85 |
| baseline | click at hydration | 116, 91, 96, 92, 137 | 96 |
| this branch | hover 800 ms, then click | 94, 56, 69, 69, 77 | 69 |
| this branch | click at hydration | 388, 145, 341, 516, 394 | 388 |
| this branch, idle-callback draft | click at hydration | 671, 640, 625, 598, 688 | 640 |

So: **in the ordinary path there is no delay** -- the chunk was requested
before the click in every hover trial, and the panel opens as fast as before.
**There is a measurable delay in one window**: a click that lands within
about 200 ms of hydration (the loop presses every 200 ms from
`DOMContentLoaded` and takes the first press that opens anything) on a link
throttled to a slow school connection, where the fetch is still in flight and
the click waits for it. On the school LAN that fetch is tens of milliseconds;
the throttling is what makes it visible.

**The call.** Shipped, with the numbers above in the commit and here. The
prompt's rule was "if the dynamic import measurably delays the panel opening,
say so and ship the theme and voice work without it"; the delay is said, and
it is confined to a click inside the first fifth of a second of interactivity
on a throttled link, which nobody reporting a problem makes -- they have
looked at the page first. What it buys is 8.9 KB gzipped and the parse of
22 KB off every route's critical path, which is real and smaller than 0107
believed. If the residual window is not worth that, the split is one revert
(`9f8fe9de`) and the theme and dictation stand on their own.

**A second reason the fetch is at mount rather than idle.** A tab open across
a deploy loses the old build's hashed chunks; a chunk fetched at mount is in
memory for the tab's life, so that failure can only land in the milliseconds
between load and the mount-time fetch, and the notice beside the trigger
covers what is left.

**`tests/feedback-coverage.test.ts` stayed green untouched**: it reads the root
layout's mount and renders `SiteFeedback` closed. Two dom tests that opened the
box through `SiteFeedback` synchronously now poll for the field for up to a
second (`untilBox`); `FeedbackBox`'s own tests mount it directly and are
unchanged.

## Verification

- `svelte-check`: 0 errors, 37 warnings, 31 `state_referenced_locally` / 5
  `css_unused_selector` / 1 `perf_avoid_nested_class` -- the baseline exactly.
  The first draft reported 39: the two extra were the deliberate once-at-mount
  read of the `dictation` prop, now `untrack`ed with the reason beside it.
- Full suite, once at the end on the tree with `origin/main` merged twice
  (`999e0612` the second time): 337 files, 6,597 tests, all passing, 339 s.
  The prompt's baseline of 327 / 6,525 is the pre-merge tree; the other
  lanes' files account for the rest beside this bundle's two files and 21
  tests. A first run taken while the first merge landed under it reported
  3 failures, one in the rubric surface (green on re-run) and two in
  `derived-numbers`, which is what forced the full measured pass rather than
  a two-route one: the merged tree carried route specs the README's measured
  region had never covered.
- Browser harness, the FULL measured pass (`npm run verify:readme`, Chromium
  141.0.7390.37, every spec at 375 and 1440, fallback font stack,
  reduced-motion only where the motion check flips it): 290 runs, 4,454
  measurements, 2 outside threshold, both the known notebook toolbar
  tap-reach rows (decision 12, with the owner). Measured on `da4605ba`,
  clean tree; the README's measured region is regenerated from it and
  `covered` now lists both feedback specs. For the two feedback routes at
  both widths: box title 14.22:1, note / labels / count / the audio note
  6.91:1, the selected chip and SEND 6.00:1 on the field fill, the DICTATE
  word 5.51:1, STOP 11.34:1 on the listening control, the status line 6.91:1;
  every box button, chip and the dictate control 44px tall at both widths
  (smallest 104.8x44 resting, 75x44 listening); the live dot is the one
  animated element in the box, pulses under no-preference and rests at
  opacity 1 under reduce; 0 console errors. Two earlier full passes went into
  this one: the first found 14 rows outside on the dictating spec because
  its click step re-pressed a TOGGLE (STOP at 400ms, before the 900ms
  sentence), the second found 2 because a text-contains row read a
  textarea's `textContent`, which is empty for a value set by script; both
  were spec defects and both are recorded in the spec. A third row,
  `/dev/frc?state=reviewer` at 375 (`view-as-student` order-result), was
  outside on that second pass and inside on the first and the third: a flake
  outside this bundle's paths, reported and not touched.
- The harness's own Vite boot is 180 to 184 s cold on this container against
  a 180 s window, so three launches failed to boot; the passes above ran
  against a server started by hand on port 5199 and warmed on
  `/dev/pathways` first, which the harness reuses (its `startDevServer`
  probes the port before spawning).
- The dom and node feedback files on their own: 10 files, 257 tests, plus the
  two new files at 21 tests.
- Screenshots of the themed box and the listening state at 375 and 1440 were
  taken through the harness Chromium and read by eye (`scratchpad/theme-*.png`,
  `scratchpad/dictate-*.png`); not committed.

**Not verified.** A real microphone or speech service in any browser (see
TWO). The Vercel preview. A signed-in surface, so the attach control beside the
new dictate control was not seen in the same box; it is a separate `{#if}` on a
separate prop and the row layout is the same flex row the label already had.
The GAUNTLET numbers come from the real `viewport.css` applied to the feedback
harness, not from the `/gauntlet` layout itself, which needs a session.

## Two traps met, for the next session

- **`pkill -f` and `pgrep -f | xargs kill` match the shell that runs them** when
  the pattern appears in that shell's own command line. Twice in this session a
  background build died with exit 144 before it started because the compound
  command it was launched from contained the pattern used to kill an unrelated
  preview server. Kill by port (`fuser -k <port>/tcp`) or anchor the pattern to
  the process image.
- **Vite dev serves a `.css` file as a JS module unless asked with `?direct`**,
  so a stylesheet fetched to inject into another page arrives as JavaScript
  and applies nothing, silently: the first GAUNTLET measurement read the portal
  tokens and reported them as GAUNTLET's.

## Candidates for `CLAUDE.md`, not written because the file is outside this surface

- A `--fb-*` (or any `--x-*`) override for a component that DECLARES its tokens
  on its own root must target that root (`.host :global(.root)`), never an
  ancestor; the ancestor form is dead on arrival and looks correct.
- Dictation: append, never replace; interim beside the field; nothing rendered
  where the API is absent; the browser's own service only.
- The two traps above.
