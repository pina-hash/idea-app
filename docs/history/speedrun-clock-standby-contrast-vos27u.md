---
title: "The SpeedrunClock STANDBY digits get their own contrast floor, the STANDBY orange becomes a viewport.css token, and a history entry's own heading is brought back in line with its title (`claude/speedrun-clock-standby-contrast-vos27u`, no migration)"
date: 2026-08-29
branches: [claude/speedrun-clock-standby-contrast-vos27u]
migrations: []
subsystems: ["GAUNTLET", "Accessibility", "Testing"]
---

### 1. The STANDBY digits: worse than the label was, and they owe the same floor

`gauntlet-run-analysis-audit-yo5huv` fixed `.sr-rec.standby-label` (3.39:1 ->
4.55:1) and reported, without fixing, that the STANDBY placeholder digits
measured worse: `.sr-main` at 2.02:1 and `.sr-sep`/`.sr-cc` at 2.27:1. It left
them alone because whether a dimmed `00:00` placeholder owes a contrast floor
at all was an open question.

**Position taken: it owes the floor.** The component's own doc comment
already says STANDBY is "what a student reads for the whole window between
the drawing being revealed and the Start macro firing" -- and for that whole
window, the digits are the only thing on the clock face saying the run has
not started (zero, not blank, not garbled, not stuck). That is informational
content, identical in kind to the STANDBY label sitting eight pixels below
it, not decoration. The deliberate signal -- "armed but not running," dimmer
than the live glow -- survives raising it: hue and saturation are held and
only lightness moves, exactly the method the label fix already used, so the
colour identity (hot orange-red main, amber separator/centiseconds) is
unchanged and only its legibility improves.

**What would make it NOT owe one:** if the digits were purely decorative
chrome with the actual state carried elsewhere (the label, an icon, an
`aria-live` announcement) with nothing lost by a viewer who cannot read them
at all. That is not this component -- nothing else on the clock face states
"00:00," and a low-vision student staring at a dead-looking readout for
however long the pre-start window runs has no other way to confirm the timer
is armed rather than broken.

**Measured, inside a real `.gt-root`** (`/dev/gauntlet-run`, the
`serverStartMs={null} running={true} ranked={true}` mount, so the class list
is `.sr-clock.standby`), by compositing onto the resolved ground and reading
the pixel back (`tools/browser-verify/checks.mjs`'s own `contrast()`, which
is the harness's one implementation of "what colour is actually behind this
element" -- not a second one written for this bundle). `.gt-root` re-points
`--bg2` to `--panel-2` (`#0e161b`), and that is the SAME ground the label
measures against and the Document Picture-in-Picture window uses:
`popout.ts` tags the PiP `document.body` with `class="gt-root"` too, so there
is one ground here, not two, confirmed by reading `popout.ts` rather than
assumed.

`.sr-main` is 40px (`2.5rem`) at `font-weight: 700` -- 40px bold clears the
large-text threshold (>=18.66px bold), so its floor is 3.0:1, not 4.5.
`.sr-sep`/`.sr-cc` are 22.08px (`1.38rem`) at `font-weight: 500` -- 500 is not
bold by the usual >=700 threshold and 22.08px is under the 24px plain-text
large-text line, so they get the ordinary 4.5:1 body floor. (The previous
entry's own table already had this right: 3.0 for `.sr-main`, 4.5 for the
other two. This entry just confirms it against the live font metrics rather
than repeating it.)

| element | old colour | size / weight | floor | before | after | new colour |
| --- | --- | --- | --- | --- | --- | --- |
| `.sr-main` (standby) | `#7a3320` | 40px / 700 | 3.0 | **2.02:1** | **3.30:1** | `#ae492e` |
| `.sr-sep` / `.sr-cc` (standby) | `#6a4a1a` | 22.08px / 500 | 4.5 | **2.27:1** | **4.76:1** | `#ac782a` |

Both derivations hold hue and saturation, moving only lightness:
`#7a3320` is `hsl(13, 58.4%, 30.2%)` -> `#ae492e` is `hsl(13, 58.4%, 43%)`;
`#6a4a1a` is `hsl(36, 60.6%, 25.9%)` -> `#ac782a` is `hsl(36, 60.6%, 42%)`.
Each carries a real margin over its floor (0.30 and 0.26 respectively) rather
than the 0.006 the label fix rejected as "not a margin" -- both were scanned
lightness-by-lightness against the real rendered ground (a small Playwright
script driving the harness's own `contrast()` helper, not a one-off formula)
before picking the value.

Re-verified after the edit, same route, same helper: `.sr-main` 3.30:1
(pass, floor 3.0), `.sr-sep`/`.sr-cc` 4.76:1 (pass, floor 4.5),
`.sr-rec.standby-label` unchanged at 4.55:1 (pass, floor 4.5, confirms the
token swap in step 2 below changed nothing about the rendered colour).

### 2. The STANDBY orange is now `--standby` in `viewport.css`

`viewport.css`'s own header: "Do not hardcode aesthetic values in GAUNTLET
page or component files; read these tokens." The previous session's own
entry called `#b86b45` (the STANDBY label colour) "the third hardcoded
orange in this one component" and could not act because `viewport.css` was
not that session's file to edit. It is this session's.

**What else is hardcoded in the file, and why only this one gets a token.**
`SpeedrunClock.svelte` carries several more literal colours: `#ff5a2b` /
`#ffb020` (the LIVE main/separator pair), `#ff2b2b` / `#7a3320` (the REC dot,
live/static), `#3a1414` (the always-`aria-hidden` ghost segment), and now the
two STANDBY digit colours from step 1. None of these are near-misses of
`#b86b45` or of each other in a way that says "this was meant to be one
token" -- checked by hue: `#b86b45` sits at hue 20deg/sat 45%, the LIVE main
and new STANDBY main share hue 13deg (a genuine live/dimmed pair, by design:
`#ff5a2b` at sat 100% versus `#ae492e` at sat 58.4%), the LIVE
separator/centiseconds and the new STANDBY separator/centiseconds sit close
at hue 39deg and 36deg (also a deliberate live/dimmed pair, not a drift
worth chasing down to the degree). Three genuinely distinct hues serving
three different roles (main digits, separator digits, the REC-line label),
not one colour wearing three hex spellings. So this bundle tokenizes
exactly the one the prior session named and was blocked on, and reports
the rest as out of scope rather than folding them in: a session whose task
was two specific findings is not the place to run a full audit of every
literal colour in the file, and CLAUDE.md's own "change what the task needs
and no more" says so directly. A full GAUNTLET run-state-colour tokenization
pass (LIVE main/separator, the REC dot, the ghost segment) is a reasonable
follow-up bundle; this is not it.

**The token**, added to `viewport.css`'s Accents block beside `--crimson`
(the same run-state slot: `--crimson` is "RESERVED: live/rec/error states
ONLY," `--standby` is its armed-but-not-started counterpart):

```css
--standby: #b86b45; /* RESERVED: STANDBY run-state text ONLY -- the armed-
	but-not-started counterpart to --crimson's LIVE, SpeedrunClock.svelte's
	REC . STANDBY label. Hue 20deg / sat 45%, measured 4.55:1 on --panel-2. */
```

`SpeedrunClock.svelte`'s `.sr-rec.standby-label` now reads `color:
var(--standby)` instead of the literal hex; its comment is updated to say
the value now lives in `viewport.css` rather than restating the token's own
comment a second time. Re-measured after the swap: still 4.55:1, confirming
the token resolves to the identical colour rather than a re-typo of it.

**Naming.** "Name the token for what it means rather than what it looks
like" -- `--standby` follows the sibling tokens' own convention
(`--crimson`, `--green`, `--cyan`, `--lime`, `--steel`: short, unprefixed,
scoped under `.gt-root` already) and names the run-state role rather than
the hue, matching `--crimson`'s own reserved-role framing in its comment.

### 3. `docs/history/gauntlet-tolerance-test-fix-u79q4y.md`: front matter and heading disagreed

`npm run history:verify` was red on a clean `origin/integration` checkout.
The entry's front-matter `title` carried the full sentence including its
trailing parenthetical (`` (`claude/gauntlet-tolerance-test-fix-u79q4y`, no
migration)``); its `##` heading was a truncated retyping of the same
sentence without that parenthetical. `docs/history/_tools/verify-split.mjs`
asserts `e.body.split('\n')[0] === '## ' + e.title` for every entry, so the
two not matching character-for-character failed the check.

**Fixed the entry, not the verifier**, per the task and per CLAUDE.md's own
"`docs/history/` is a dated record ... correcting a past bundle's account is
a NEW entry saying so, never an edit to the old one" -- this is not a new
entry, it is repairing a mechanical typo (a retyped heading that drifted
from its own front matter) rather than correcting the bundle's substantive
account, so editing in place is the right move and matches what the task
asked for. The `##` heading now reads the full title verbatim, parenthetical
included.

`npm run history:verify` after the fix:

```
entries reassembled : 168 (expected 168)
reassembled bytes   : 2252747 (expected 2252747)
reassembled sha256  : a7eac6860e43db23090a933931107fb791066784c9cc2a2534e4d982056a0545
reference sha256    : a7eac6860e43db23090a933931107fb791066784c9cc2a2534e4d982056a0545
git byte compare    : IDENTICAL against ea9f043b6c:docs/HISTORY.md
sha256 compare      : IDENTICAL

OK: the split is lossless. Every byte of the pre-split record body is present, in order.
```

168 entries checked (all of them, not only the `record-*` pre-split
archive), split still lossless, byte-identical reassembly against the pinned
pre-split reference.

**Can this recur, and should the heading be derived from the title instead
of retyped beside it?** Yes to both. Right now one sentence is physically
written twice -- once in `title:` front matter, once as the literal first
line of the body -- and CLAUDE.md itself names this shape as the failure
mode elsewhere ("Do not duplicate a rule ... a second implementation of a
check, a formatter, a ladder, or a piece of arithmetic is the thing that
quietly stops matching"). A retyped heading is exactly that: a second
implementation of one string, and this bundle is the second time it has
drifted (a `title` any longer than a short phrase is the failure mode --
easy to edit one copy and forget the other, or to draft the heading first
and extend the title afterward without going back).

**What deriving it would take**, not built here because the task said not
to: entries would drop the physical `## <title>` line from their body
entirely (front matter, one blank line, then `### <first real subsection>`
directly), and every CONSUMER of an entry's body would synthesize the
heading from `title` at read time rather than expect it inline --
`verify-split.mjs`'s reassembly (it currently reassembles raw body bytes
including the heading line; it would instead need to prepend `## ${title}`
before comparing, or compare against the reference with the heading
stripped from both sides), `history:index`'s generator if it echoes entry
bodies, and the authoring convention in this file ("Front matter, then one
blank line, then the entry opening with its own `##` heading" would become
"opening with its first `###` subsection; the `##` is generated"). That is a
migration across all 168 existing files' first line plus two tool files
plus this file's own stated convention -- a real bundle, not a fix folded
into this one.

## What was measured

- `svelte-check`: 0 errors, 37 warnings (unchanged from the stated baseline;
  re-derived via `npx svelte-kit sync && npx svelte-check` after exporting
  placeholder `PUBLIC_SUPABASE_URL`/`PUBLIC_SUPABASE_ANON_KEY`, per the
  known missing-`.env` phantom-error trap).
- `npm test`: **166 test files / 3571 tests, all passing**, on
  `origin/integration` tip `1589402203dc25e95e2ce3665bbabcd60999124f`. The
  task's cited baseline (163 files / 3508 tests) is stale by a few merges
  that landed on `integration` between when that figure was written and this
  session's fetch; no failures either before or after this bundle's edits
  (the three touched files carry no test of their own beyond
  `history:verify`, which is reported separately above).
- `npm run verify:browser`: 50 route/width runs, 410 measurements, **4
  outside threshold, none of them on a GAUNTLET route** -- all four are
  pre-existing findings on `/dev/pathways` (a 26.2px-tall harness control,
  both widths) and `/dev/notebook` (a presence count on unrelated
  free-entry title/folder fields, both widths). `/dev/gauntlet-run` and
  `/dev/gauntlet-shell*` are fully clean at both widths, including the four
  contrast checks that already read the clock plate (REC . RANKED 5.87:1,
  UNRANKED 4.69:1, STANDBY label 4.55:1, run verdict/result fields) -- this
  is the first bundle whose STANDBY-digit contrast that pass can actually
  see, since the GAUNTLET routes were only registered in the prior bundle.
- All three measurement scripts (contrast scan, lightness scan, final
  verification) drove the real `/dev/gauntlet-run` harness through
  `tools/browser-verify`'s own `launch()`/`openPage()`/`contrast()`, not a
  hand-rolled colour-math script standing in for the browser.

## Not verified

- The live Supabase project, a real signed-in session, and a real Vercel
  preview -- none of this bundle's changes touch anything that needs them
  (no migration, no server route, no auth-gated surface).
- The `/gauntlet/rooms/[id]` and `/gauntlet/speedrun/[id]` production routes
  directly (they need a real ranked run in progress); the dev harness at
  `/dev/gauntlet-run` mounts the identical `SpeedrunClock.svelte` component
  with a `serverStartMs={null}` standby state, and both production routes
  render under the same `.gt-root` layout wrapper (confirmed by reading
  `src/routes/gauntlet/+layout.svelte`), so the ground and the token
  resolve identically there.
