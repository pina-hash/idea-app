---
title: "Voice navigation with no AI, a build-time code census, and why the two coin cards stay two"
date: 2026-09-22
branches: ["claude/new-session-avpli9"]
migrations: []
subsystems: ["portal", "voice", "IDEA Coins", "build"]
---

Three reports, answered together because all three land on the portal shell and
the home banner. Report 11 asked how close voice navigation could get without
paying for an AI API; report 12 asked for a lines-of-code counter in the top
banner; report 16 asked for the IDEA Coin Ledger and Coin Desk to become one
split tile for admins.

### FOR MR. PINA: there is no AI in voice navigation and there is nothing to pay for

This is the first thing to say because the question has been asked twice.

The browser does the speech recognition. Chrome, Edge and Safari each ship a
`SpeechRecognition` implementation and each vendor runs their own service behind
it; the page hands it a microphone stream and gets text back. No request of ours
is involved, there is no API key, there is no per-minute cost, and there is no
model to choose or downgrade. This repository already had the whole driver --
`src/lib/feedback/dictation.ts`, the report box's DICTATE control, written in a
previous bundle -- and its own header already states the constraint: "No audio
and no transcript goes through this repo, a Supabase function, or any endpoint
of ours."

What was missing was the other half: a table of things a person can SAY and the
route each one means. That is `src/lib/voice/commands.ts`, and it is a lookup,
not a model. A string comes in, a destination or a refusal comes out. It never
calls anything.

**Three things worth deciding about, since they are yours rather than
technical:**

1. **The microphone is off until somebody presses Start, and a reload turns it
   off again.** Nothing is remembered anywhere -- there is no preference, no
   `localStorage` key, no session flag. Pressing Start is what triggers the
   browser's own permission prompt; the page never asks for one on load.
2. **One activation is one command.** The session ends the moment an utterance
   matches, before the navigation is even requested, so the microphone closes
   while the next page is still loading. A MISS does not end it -- a student who
   was misheard has to be able to say the word again without hunting for a
   button -- and a twenty-second idle cap bounds that case.
3. **The panel says all of this in words before the Start control**, so a
   student, or a parent looking over their shoulder, reads what it does before
   it does anything.

### 11. Voice navigation

**Exact match, deliberately, and this is the design decision worth defending.**
There is no fuzzy matching, no edit distance and no closest-guess. An utterance
either IS one of the phrases, after normalisation and after one leading verb is
stripped, or it is not a command at all. A near-miss that navigates is strictly
worse than one that does nothing: it moves a student off the page they were on,
in answer to something they did not say, and the way back is a control they
cannot find because the page changed. A miss reports what it HEARD -- normalised,
so they see the words the way the matcher saw them -- and leaves the phrase list
on screen.

**The vocabulary is derived from `PORTAL_APPS`, never retyped.** Every launcher
card is sayable by its own title, normalised: `IDEA // GAUNTLET` resolves from
"idea gauntlet" with no table entry anywhere. `SPOKEN_ALIASES` only ADDS shorter
or more natural forms beside that ("my classes", "cad", "coin ledger", "f r c"),
so a card added next month is sayable the day it ships and a missing alias costs
a convenience rather than a destination. Three non-card destinations are written
out (`home`, the update log, the archive) and five page actions (back, top,
bottom, help, stop). **Twenty-one phrases for an admin, sixteen destinations and
five actions**, every one of them printed in the panel.

**The list a person is shown is the list that works.** An `adminOnly` surface
404s for everybody else and a `requiresAuth` one bounces a signed-out visitor,
so both are withheld from a vocabulary that could not use them. Measured in the
harness: 16 destinations for an admin, 14 for a signed-in student, and the four
cards that deliberately omit `requiresAuth` (Maps, the Coin Ledger, VANGUARD,
Tournaments) for a signed-out visitor.

**Absence is the mechanism, twice over.** A browser with no `SpeechRecognition`
-- Firefox, and every third-party browser on an iPad, which is a WebKit shell
that does not expose the API -- renders NOTHING. Not a disabled button, not a
tooltip. And `navigate` is an injected transport: the harness hands in one that
records instead of moving.

**THE TWO LEGACY PAGES CARRY NO VOICE CONTROL, AND THAT IS STRUCTURAL.**
`/coins/index.html` and `/vanguard/` are served from `+server.ts` endpoints
with no Svelte layout above them, so nothing the root layout mounts reaches
them -- measured: 0 controls on both, 2 on `/maps`. It is the same gap
`SiteFeedback` has there and solves by INJECTION
(`$lib/server/legacy-report-panel.ts`), and closing it the same way is a bundle
of its own. The practical shape of it: you can SAY "coin ledger" and get there,
and once you are there you cannot say "home". Recorded rather than fixed,
because injecting a second control into a frozen legacy file is not a thing to
do as a side effect.

**It reuses `feedbackExclusion` rather than keeping a second list of games and
decks.** Both are asking the identical question -- may anything float over this
surface -- and the report control already answers it by route id. Where the two
part company is what an exclusion MEANS: every surface must be able to report a
defect, so that control RELOCATES into the surface's own chrome; navigation is a
convenience, and a projected deck, a race and a timed CAD run are each something
a person is deliberately inside. There it is simply absent.

**A full navigation, not `goto`, and that is two decisions at once.** `goto`
cannot reach `/coins/index.html` or `/vanguard/`, which are server endpoints
rather than page routes and are two of the sixteen destinations; and a document
navigation GUARANTEES the microphone is gone, because the whole page is.

### 12. The lines-of-code counter

**The number is built, never typed.** `vite.config.ts` runs `git ls-files`, reads
the files git names, and hands them to `buildCodeCensus` in
`src/lib/code-census.ts`; the result is emitted as a third virtual module,
`virtual:site-code`, beside the two the version substrate already emits. That
split is the same one `site-versions.ts` states: the build config only GATHERS,
and every rule about what counts lives in a pure module a test can reach. There
is not a threshold, an extension or an exclusion in `vite.config.ts`.

**What it replaces.** The only lines-of-code figure this repository has ever
carried is `35,000+ lines`, hardcoded in the FSP day-one slide deck
(`src/lib/fsp/day1-slides.ts`), whose own speaker note reads "Edit the
lines-of-code figure to the real number." **That file is outside this bundle's
scope and was not edited** -- it is a deck, not a counter -- but the real number
is now derivable, and it is wrong there by more than an order of magnitude. That
is a thing to fix in a bundle that owns the deck.

**The measured answer, at `1ec2f640` plus this bundle's own files:**

| | |
|---|---|
| Total | **781,360** lines in **2,332** files |
| Code | 530,570 |
| Comment | 202,785 |
| Blank | 48,005 |

By language: TypeScript 359,521 (1,205 files), Svelte 210,865 (522), SQL
101,096 (224), JavaScript 46,605 (284), HTML 36,204 (27), CSS 10,191 (22), C#
6,650, CI workflows 3,491, Shell 2,520, Python 2,400, scripts 1,486, SVG 331.

**`git ls-files` is the whole answer to "does this count node_modules".** It
lists TRACKED files only, so the install tree, the build output and `.env` are
outside the census BY CONSTRUCTION rather than by an exclusion somebody has to
keep current. There is deliberately no `node_modules` rule, and a test asserts
there is not: a rule there would suggest the boundary is a list that can be
spelled wrong.

**Markdown and JSON are not counted.** There are 921 tracked `.md` files --
`docs/history/` is one per bundle -- and counting them would roughly double the
figure with writing rather than code; 97 of the tracked `.json` files are the
classroom export the app writes by itself. Neither is a number to be proud of.

**Four named exclusions, each with the sentence the panel prints beside it**: the
archived Sheets-era coin ledger under `docs/` (12,389 lines, kept so the old
system can be read and never reintroduced), the vendored Remus WASM bindings
IdeaCAD builds on (11,874), a generated design-system bundle in `static/` under
its own hashed directory (2,212), and `materials/` (765), which the classroom
export writes on every item save with no person involved. A total with no stated
boundary is a total nobody can check, so the panel prints all four and says why.

**Blank / comment / code is the nuance, and the comment column is the honest
one.** A bare line count over a codebase whose house style is a paragraph of
reasoning above every rule says the wrong thing about it in both directions.
202,785 of 781,360 lines is written explanation.

**Three axes, because the ask was two questions and the third was free.** "What
type of code it is" is the language table. "Where all that code is" is genuinely
two different questions -- which LAYER of the stack, and which APP -- and the app
answer costs nothing, because `appForPath` in `site-manifest.ts` already exists
to decide exactly that for the per-app version numbers. A second ownership table
is what stops matching. By layer: components and libraries 292,739, tests and
harnesses 225,937, database 101,201, pages and endpoints 92,663, tooling and CI
56,397, everything else 12,423.

**No per-file list, deliberately.** Three aggregate tables are a couple of
kilobytes; a row per file would be thousands, on the signed-out landing page, to
say something nobody reads to the end of. That is also why this is a third
virtual module rather than two more exports on `virtual:site-versions`: that one
is imported by the root layout and therefore lands on every route in the site.

**It survives a shallow clone, which the version numbers do not.** `git ls-files`
does not depend on history depth. Measured in this container, which IS a shallow
clone: the build warns that it is stamping with no version numbers and the code
census comes out complete and correct on the same run.

**Hover shows the basic data and click shows the breakdown**, which is report
12's own shape -- but the hover is the EXTRA, never the only way in. A phone
cannot hover and a keyboard does not, so the sentence the hover reveals is also
the first line inside the panel.

**IT IS A DESKTOP READOUT, AND THAT IS ARITHMETIC RATHER THAN TASTE.** See the
second defect below: there is no width of chip that fits in the signed-out
banner at 375px, and any readout there costs the sticky header a second row.

### 16. The two coin cards stay two, and the confusion is answered in copy

All four structural reasons in the prompt were confirmed against the tree with
line numbers. The decision, and it is proposed rather than asked:

**The merged tile was refused, for two costs it cannot avoid.**

1. **`visibleApps` partitions `adminOnly` to the END of the grid.** So a merged
   tile is either admin-only -- which DELETES the public Ledger card every
   student and every signed-out visitor uses, an outcome worse than the problem
   -- or it is a public card carrying an admin-only button inside it.
2. **A merged tile keeps ONE id, and pins, custom order and usage counts are all
   keyed on the id.** Retiring `coin-desk` silently drops every admin's pin,
   dragged position and launch history for the tool they use most. That is
   exactly the loss the `dashboard` entry refused to take when `admin` merged
   into it, and the admin whose record it is here is Mr. Pina's own.

**The shape is buildable if you want it, with the price known.** The card's root
element would stop being an anchor for this card only -- it is an `<a>` today, so
two buttons inside it is invalid markup -- which also moves drag, tour and
`data-app` handling for that branch. Say the word and it is a bundle.

**What shipped instead is parallel copy plus a verb.** Each card now says which
side of the ledger it is, in the same grammar, so the question is answered by
either card ALONE rather than by comparing them -- which matters, because the
admin partition means the two are never adjacent in the default order:

- IDEA Coin Ledger: "Where everyone reads the coins ... Nothing here changes a
  balance."
- Coin Desk: "Where staff write the coins: log fines, awards and purchases into
  the IDEA Coin Ledger. The only tool that changes a balance."

And the CTA verb differs: **View live** against **Log**, where Coin Desk used to
say "Open", which is what five other cards say and says nothing. The verb is the
last thing a person reads, on the control they are about to press.

**One thing the prompt did not claim and which is worth recording: the two MARKS
were already right.** `CoinMark` flips the coin face-on and `CoinDeskMark`
strikes a `+` on it, and `CoinDeskMark`'s own header already names the
relationship ("one is a currency, one is an act of awarding it"). Neither was
touched. The confusion was in the words.

**`(0070)` is gone from the Coin Desk card.** A migration number in a launcher
card is a commit message that wandered into the interface, and
`tests/coin-card-pair.test.ts` now sweeps the whole registry for that shape and
for em dashes.

### Two defects found by verification rather than by reading

Both were in this bundle's own first draft, and both were invisible to the
instrument that should have caught them. They are the reason the verification
standard is what it is.

**1. The readout grew the header, twice, and the second time the HARNESS was
what hid it.**

Put in `.header-right`, where the other two controls are, the chip measured
116px wide against 26.4px of slack: the actions row needs 316.6px of the 343px
available at 375, so `.auth-block` was pushed onto a third row and the banner
went from **125.5px to 158.7px**. At 1440 it was 64px either way, so half the
widths said it was fine.

The first fix was a `.header-left` group -- the emblem and the readout together,
so the chip rides the LOGO's row. Measured on `/dev/home-order`: **125.5 ->
125.5 at 375**, zero growth. The browser spec agreed. **And it was still
wrong.**

**THE HARNESS FIXTURE IS SIGNED IN, AND THE LANDING PAGE IS NOT.** With a class
chip and a profile menu, `.header-right` is 316px and the banner has ALREADY
wrapped to two rows at 375px, so a readout on the logo's row is free and the
probe reports a clean "identical". Measured on the real, signed-out `/` at the
same width, where `.header-right` is 210px:

| | without the readout | with it |
|---|---|---|
| `/` signed out, 375px | **75.5px** | **115.1px** |

The banner fits on ONE row signed out, and the readout costs a second one --
39.6px, permanently, on a sticky header, on the page every visitor lands on.
The arithmetic says no chip could have fixed it: 343px of inner width, less the
104px emblem, less the 210px actions row, less the 1rem gap, leaves
**thirteen pixels**.

**So it is hidden below the breakpoint the banner already wraps at.** Swept at
**320, 360, 375, 414, 480, 500, 600, 768, 769, 800, 900, 1024, 1280, 1440 and
1920**, on the signed-out `/` AND on the signed-in admin fixture: **zero growth
and zero horizontal overflow at every one of the thirty measurements.** The band
where it would have cost a row is roughly 346px to 493px; at 320 the banner
already wraps and above ~494px it fits with room to spare.

**What a phone reader gets instead is a decision, not an oversight** -- see the
list at the end.

That gate then forced a second change: the browser pass runs every spec at 375
AND 1440, so the PANEL cannot be measured from the home harness at all. It has
its own route now (`/dev/code-census`, with a `?census=empty` negative control),
and the home spec keeps the banner's own three questions -- shown exactly where
there is room, costs the header nothing at either width, reachable where it is
shown.

The chip reaches 44px through `.tap-reach-44` with `--tap-reach-w: 0px`, not
through its own height: the box stays 23.6px, the hit area is 44px, and the
horizontal reach is off because the sign-in controls sit closer than 44px on
that row. **Hit-tested, not computed**: 3 of 3 sample points down the chip's
44px span answer the chip at 1440.

**2. `recognizer={null}` fell through a `??` to the live browser constructor.**
`VoiceNav` read `recognizer ?? dictationConstructor()`, which makes an explicit
`null` indistinguishable from an absent prop -- so the harness page asking for
the no-support state got Chromium's own `webkitSpeechRecognition` back and
rendered a control that would have opened a real microphone on a page whose
whole point is that it cannot.

**The mount test asserting exactly this was GREEN the entire time**, because
happy-dom has no `webkitSpeechRecognition` and the fallback answered null there
too. It took a real Chromium to find it. The default is `undefined` now and the
read is `!== undefined`; `tests/dom/voice-nav-mount.test.ts` plants a
constructor on `window` as its positive control, so its own row can never again
pass for that reason.

A third, smaller one: the inline panel's `calc(100vw - 1.5rem)` width, correct
for a control docked 12px from the edge, ran **9px** past the right edge inside
a padded column at 375. Bounded to its container.

### What was measured

- **`svelte-check`: 0 errors, 37 warnings in 20 files**, the documented baseline,
  unchanged. Re-derived rather than trusted: measured in a clean `git worktree`
  at `origin/main` (0 errors, 37 warnings, 20 files, 31 `state_referenced_locally`
  / 5 `css_unused_selector` / 1 `perf_avoid_nested_class`) and again on this
  tree. **The line in CLAUDE.md is correct as written and needed no correction
  this time**, which is worth saying given it has drifted five times. Two
  warnings this bundle added (`state_referenced_locally` on a `$state(startOpen)`
  seed in each new component) were removed by spelling the intent with `untrack`
  rather than by absorbing them into the baseline.
- **The census derived twice, agreeing exactly.** Method A is the shipping one:
  `git ls-files` through `buildCodeCensus`. Method B is a shell pipeline --
  `git ls-files | grep -E '\.(ext|...)$' | grep -v ...` then `wc -l`, plus a
  count of the seven files with no trailing newline, since `wc -l` counts
  newlines. **2,332 files and 781,360 lines from both.** Blank disagreed by
  1,226 on the first pass, which turned out to be a real convention question --
  whether a whitespace-only line inside a block comment is blank or comment --
  and was settled toward the one an ordinary `grep -c '^[[:space:]]*$'` agrees
  with, because that is how anybody checks this figure. After that:
  **48,005 blank from both.** `tests/code-census.test.ts` runs that
  reconciliation on every suite run, with no figure written down in it.
- **`npm run verify:browser`**: `/dev/voice` and `/dev/voice?recognizer=off`,
  **74 measurements, 0 outside threshold**; the four home-order specs plus the
  new admin one, **154 measurements, 0 outside threshold**. Contrast on the
  voice panel 7.27:1 (privacy sentence), 15.42:1 (a phrase), 8.26:1 (a list
  heading), 7.91:1 (the state readout), 6.06:1 (Stop). Every control in the
  voice panel and the counter panel at or above 44px; smallest 56.6x44.
- **The `--dim` failure, and the documented fix rather than the obvious one.**
  Four of the counter panel's labels measured **4.24:1** on `--bg2`, which is
  exactly the figure CLAUDE.md records for that token on that ground. The token
  was NOT moved -- five FRC components read `--dim` on `.frc-root`'s paper where
  it already measures 2.95 -- so the CALL SITES took `--text-2` instead.
  Re-measured: 4.52 to 6.0 and above across the panel, worst row now 4.52:1.
- **The listening pulse is `prefers-reduced-motion` gated and nothing is hidden
  at rest**: 1 element animated under `no-preference`, 0 still moving,
  transformed or unpainted under `reduce`, lowest resting opacity 1.
- **Every phrase in the vocabulary driven through the real `Dictation` driver**
  with a stubbed recogniser, in `tests/dom/voice-nav-mount.test.ts`: the printed
  phrase for all sixteen destinations resolves to the href the registry carries,
  a match calls `abort()` before navigating, a miss navigates nowhere and keeps
  listening, and interim text is shown and never acted on.

### The mutation proof

Nine mutants, one per shipped guarantee, each applied to the working tree and
judged through `npm test`. The script restores from a BYTE COPY HELD IN MEMORY
and md5-checks the file afterwards -- never `git checkout --`, which restores
from HEAD and would have discarded this bundle's uncommitted work, leaving
every later mutant to "pass" against a pristine tree. It reads the SUMMARY LINE
from stdout and stderr concatenated rather than the exit code, and treats a run
whose summary it cannot find as an instrument failure. The clean tree was run
first as the control, green.

| Mutant | Guarantee | Verdict |
|---|---|---|
| `voice-exact-match` | a near-miss navigates nowhere | KILLED, 3 tests |
| `voice-audience-gate` | an admin surface is not sayable by a student | KILLED, 3 tests |
| `voice-no-mic-at-mount` | no recogniser until Start is pressed | KILLED, 15 tests |
| `voice-null-means-none` | an explicit null means NONE, not "ask the browser" | KILLED, 1 test |
| `census-exclusions` | the app-written export is not counted | KILLED, 2 tests |
| `census-block-comments` | a block comment carries across lines | KILLED, 1 test |
| `census-line-total` | a final line with no newline is still a line | KILLED, 2 tests |
| `coin-card-copy` | each card says which side of the ledger it is | KILLED, 4 tests |
| `coin-card-verb` | the two cards offer different verbs | KILLED, 1 test |

**Nine of nine killed, every file restored byte-identical.** One of them,
`census-line-total`, came back NOT APPLIED on the first run -- its anchor was
written with two tabs where the file has one -- and that is the reason the
script distinguishes "anchor not found" from "survived" at all: a mutant that
never applied is an instrument failure, and reporting it as a pass is how a
proof certifies a guarantee it never tested. Re-run with the corrected anchor,
it killed.

**THE EXIT-CODE TRAP WAS DEMONSTRATED LIVE ON THE WAY HERE.** The full suite
run that found the two `derived-numbers` failures printed
`Test Files 1 failed | 530 passed` and `run-tests.mjs: vitest reported
failures`, while the shell pipeline around it reported `exited with code 0`.
A mutation script judging by the throw would have read two real failures as a
clean run.

### What was NOT verified

- **No real microphone, anywhere.** Every path was driven through a stubbed
  recogniser. Whether Chrome's service transcribes "IdeaCAD" as "idea cad" or as
  something else on a real student's voice in a real classroom is not knowable
  from here, and the alias table is a first guess at it. **The one thing worth
  watching after this ships is which real utterances MISS**, and the miss path
  prints the heard words on screen precisely so a student can read them back.
- **No signed-in surface, and no production data.** The vocabulary gating was
  verified against the registry and the harness, not against a real session.
- **`prefers-reduced-motion: reduce` was exercised by the harness's media
  emulation only**, not on a device with the OS setting on.
- **Text is measured in the fallback font stack.** The harness blocks
  `fonts.googleapis.com`, so Orbitron and Rajdhani do not load; the chip's width
  at 375 (116px) would differ with the real faces, and the header measurement
  above should be re-taken on a real deploy if the banner ever gets tight.
- **The census was not measured on Vercel.** `git ls-files` is run at build time
  and Vercel shallow-clones by default, which does NOT affect the file list --
  but that is reasoning, not a measurement, and the first production build is
  where it gets confirmed. The failure mode is safe either way: an empty list
  yields `complete: false` and the banner renders nothing.

### Files outside the prompt's Owns line

Four, each with its reason:

- `src/site-versions.d.ts` -- the ambient declaration for the third virtual
  module. It has to sit beside its two siblings or nothing can import the id.
- `vitest.config.ts` and `tests/stubs/site-code.ts` -- without a stand-in for
  `virtual:site-code`, the home page cannot be imported by any test at all,
  which would take `tests/home-order-and-accent.test.ts`'s section-order and
  accent-mechanism assertions down with it. The stub derives its numbers from
  the real `buildCodeCensus`, the way its `site-versions` sibling does.
- `tools/browser-verify/routes/voice.mjs` and `voice-recognizer-off.mjs` -- the
  prompt named `home-*.mjs`; the voice surface needs specs of its own and they
  cannot be home routes.
- `classroom-updates.json` -- the standing directive. Voice navigation is
  shell-mounted, so it appears on classroom pages, which makes it
  classroom-facing behaviour.

`src/lib/site-versions.ts`, `src/lib/AppLauncher.svelte`,
`src/lib/marks/CoinMark.svelte` and `src/lib/marks/CoinDeskMark.svelte` were on
the Owns line and needed no change.

### For Mr. Pina to act on

1. **`src/lib/fsp/day1-slides.ts` still says `35,000+ lines`**, with a speaker
   note asking whoever presents it to find the real number. It is over
   **780,000**, and wrong by more than an order of magnitude. That file was
   outside this bundle's scope, so it is a one-string edit whenever a bundle
   owns the deck -- but **read the figure off the home banner rather than off
   this page**, because the banner's is derived on every build and any number
   written into a slide starts going stale the day it is typed. That is the
   whole reason the counter exists.
2. **The merged coin tile is yours to call.** It was refused here for the two
   costs above, not because it cannot be built. If the public Ledger card
   disappearing for students is acceptable to you, or if losing your own Coin
   Desk pin and usage history is, say so and it becomes a bundle.
3. **Voice navigation needs no budget and no API.** If anyone asks what it
   costs: nothing, and there is no key to rotate or leak.
4. **A phone gets no lines-of-code readout, and that is the open question.**
   The banner has thirteen pixels of slack at 375px signed out, so the chip is
   hidden below 768px. If you want one on a phone it needs a different home --
   a fourth tile in the hero stats row directly below the banner is the
   obvious candidate, and it costs the header nothing. That is a decision
   about where it belongs, not a defect, and it was left to you rather than
   guessed at.
5. **Watch which utterances miss.** The alias table is a first guess at how a
   speech service hears these names. A student reporting "it never understands
   X" is a one-line addition to `SPOKEN_ALIASES`, not a redesign.
