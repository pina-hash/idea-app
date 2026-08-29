---
title: "GAUNTLET's first tests and first component harnesses: 6 of 12 unmeasured components driven, 2 new instrument capabilities, 48 tests over the payload/SQL key contract and the progression model, and docs/GAUNTLET.md corrected from a 0027 snapshot (`claude/gauntlet-component-harnesses-gnddjg`, no migration)"
date: 2026-08-29
branches: [claude/gauntlet-component-harnesses-gnddjg]
migrations: []
subsystems: ["GAUNTLET", "browser-verify harness", "docs"]
---

## GAUNTLET's first tests and first component harnesses: 6 of 12 unmeasured components driven, 2 new instrument capabilities, 48 tests over the payload/SQL key contract and the progression model, and docs/GAUNTLET.md corrected from a 0027 snapshot (`claude/gauntlet-component-harnesses-gnddjg`, no migration)

GAUNTLET had **no automated test of any kind** and **twelve components no dev
route could reach**, eleven of them student-facing. Its design doc stopped at
migration `0027` and was wrong in ways somebody would have acted on. This bundle
closes the first two partially and the third fully.

**Nothing under `src/lib/gauntlet/` or `src/routes/gauntlet/` was touched**, and
no migration was written. Every change is in `src/routes/dev/` (two new
harnesses), `tools/browser-verify/`, `tests/` (two new files) and
`docs/GAUNTLET.md`.

### The count, verified rather than taken from the brief

`docs/history/dev-routes-audit-5nocl7.md` recorded ten unreachable GAUNTLET
components ("`ChallengeForm`, `ModelingRun`, `KnowledgePlay`, `SpeedrunClock`,
`RunResults`, `Asset`, and four `viewport/*`"). Re-derived here by walking the
import graph transitively from every file under `src/routes/dev`, it is
**twelve of twenty-two**: the `viewport/*` half is **six**, not four --
`CountdownOverlay`, `CursorLayer`, `FeatureTreeNav`, `ModeArt`, `TiltCard`,
`TrademarkFooter`. Eleven are student-facing; `ChallengeForm` is the admin
authoring form.

### Two routes, six components, and the four left behind

Ranked by how many students see the component and how silently a defect in it
would fail, not by how easy it was to mount.

**`/dev/gauntlet-shell`** mounts the four pieces the GAUNTLET layout puts on
**every page**, in the real `.gt-root` > `.gt-content` arrangement the layout
uses (they read tokens off that wrapper and two of them position against it, so
a bare mount would measure colours and geometry that exist nowhere):
`TrademarkFooter`, `FeatureTreeNav`, `CursorLayer`, `CountdownOverlay`. An
alias spec arms the countdown. Deliberately not copied from the layout:
`SiteFeedback` and `VersionBadge` (portal components driven elsewhere, and they
want a session) and `entranceSweep` (a staggered opacity that would put every
measurement on a moving target).

**`/dev/gauntlet-run`** mounts the two components a student sees on **every
run**: `RunResults` in its four verdict states and `SpeedrunClock` in its three.

**Left, and why.** `ModelingRun`, `KnowledgePlay` and `ChallengeForm` each need
a substantial injected-transport fixture (a submit path, a reveal path, a live
Supabase client for signed URLs) and are 240-600 lines; that is a bundle of its
own and `ChallengeForm` is admin-only besides. `Asset` is 18 lines with one
branch. `ModeArt` and `TiltCard` are landing-page decoration, seen once per
visit rather than once per run. **The six taken are every GAUNTLET component
that is on screen for every page or every run; the six left are the ones behind
a fixture or off the hot path.**

### The instrument gained two capabilities, because two GAUNTLET rules could not be expressed

**`textContains` -- what an element SAYS.** `presence` proves an element is in
the DOM and paints; `contrast` proves its ink is readable. Neither reads a word
of it. The trademark footer is compliance-critical per `docs/GAUNTLET-DESIGN.md`
(nominative SOLIDWORKS text only, never the logo or a lookalike), and a footer
that had lost "Dassault Systemes" from its sentence is present, visible, and
clears 4.5:1 exactly as before -- **every other check in the file comes back
green on it**. The new check takes `must` and `mustNot` lists, collapses
whitespace on both sides (the real sentence is wrapped across three source
lines; an editor reflowing a paragraph must not redden a compliance check), and
**fails on zero matched nodes**, because a selector matching nothing satisfies
"no forbidden phrase appears" perfectly. `mustNot` is the direction a `must`
list cannot see: a sentence can keep every required phrase and add one that
reverses it.

**`presence` gained `maxVisible`.** `expectVisible` is a FLOOR (`visible >= n`),
so every `expectVisible: 0` row in `routes.mjs` was vacuous in its second half
-- a panel that started painting itself open still came back green and the
report simply read "visible 2" instead of "visible 0". `maxVisible` is the
ceiling, and CLAUDE.md's verification standard requires asserting both
directions of a visibility claim. Omitted, nothing changes.

**AND ITS FIRST USE WAS WRONG, WHICH IS THE PART WORTH WRITING DOWN.**
GAUNTLET-DESIGN states the FeatureManager rail as a prohibition -- "hidden by
default; do not make it visible by default" -- so `maxVisible: 0` looked like
exactly the tool. It reddened. At 1440px the collapsed rail is not
`display: none`: it is `translateX(calc(-100% - 1.5rem))` plus
`pointer-events: none`, so it keeps a real 232px box entirely off the left edge
and `isVisible` correctly reports it as painted. The rail was behaving exactly
as designed.

The available repair was to teach `isVisible` about the viewport, and it was
refused: `tapReach` already reports off-screen sample points as a harness
artefact, so moving that predicate would change readings on routes this bundle
does not own, with two other sessions live in the tree. **The effect is
asserted instead**, with an `orderResult` probe that samples the rail's own box
clamped into the viewport and asks the DOM what a pointer at each point
actually lands on. It answers `unreachable` for `display: none` at 375 and for
the off-screen transform at 1440 -- two mechanisms, one guarantee, one
width-independent reading -- and would answer `reachable` for a rail opened by
any means.

**`--break blank-text`** is `textContains`'s live control. It names the
compliance footers (`.gt-tm p, footer p`) rather than sweeping the document,
because blanking everything would redden `contrast` and `tap-target` too and a
control that reddens everything proves nothing about the check under test. On
`/dev/gauntlet-shell` it reddens **only** the `text-contains` row, which is the
whole argument for the check existing. `overflow` and `invisible` both gained
`.gt-root`.

### Three real findings, reported and NOT fixed

None is in a file this bundle owns.

1. **The Speedrun clock's STANDBY label measures 3.39:1** (`#9a5a3a` on
   `rgb(14,22,27)`), against the 4.5:1 minimum, at **both widths**. STANDBY is
   the state between pressing reveal and the SolidWorks Start macro firing --
   `running` true, `serverStartMs` still null -- so it is the label a student
   reads for the whole window in which they are waiting to be allowed to start.
   `SpeedrunClock.svelte`. For scale beside it: `REC . RANKED` is 5.87:1 and
   `UNRANKED` is 4.69:1, so this is the one that did not get measured.
2. **Four of the eight post-run controls fall below 44px at 375px**, smallest
   40.4px: three `a.btn` at 43.4px and the `Run again` `button.btn.secondary`
   at 40.4px. At 1440px all eight measure 45.4px.
   **The mechanism, measured rather than guessed:** `.btn` in `src/app.css` is
   content-sized with `min-height: auto`; `.btn-row` is
   `display: flex; flex-wrap: wrap` with the default `align-items: stretch`. At
   1440 every control sits on one flex line and is STRETCHED to the tallest, so
   the 45.4px that reads as compliance is an accident of the row not wrapping.
   At 375 they wrap onto separate lines and each is sized to its own content,
   and the floor is not there to catch them. Ruled out as a font-load race by
   re-measuring cold, warm and after `await document.fonts.ready` -- identical
   every time, with Rajdhani, Share Tech Mono and Orbitron all reporting
   `loaded`. **This is `src/app.css`, not GAUNTLET**, so it is wider than the
   post-run screen: any `.btn` in a wrapping `.btn-row` has the same hole, and
   CLAUDE.md is explicit that the floor is `min-height` and never a height.
3. **`/dev/notebook`'s standing finding is NONDETERMINISTIC**, and the cause is
   its own prepare step. The row `free-entry title + folder fields` reported
   `present 1` at both widths in the baseline and `present 1` at 375 with
   `present 2` at 1440 after. The prepare line says why: at 375 it reads
   `1 matched, 0 attempt(s), already satisfied` and at 1440 `1 attempt(s),
   predicate satisfied`. The `until` predicate is satisfiable by the PRE-click
   state, so whether the click happens at all is a race, and the assertion
   passes exactly when it does. Isolated re-runs at 1440 reproduced `present 1`
   three times out of three, so the passing case is the rarer one.
   **Left alone deliberately**: `tools/browser-verify/` is this bundle's to
   change, but repairing that predicate would make the row PASS and silently
   retire a finding another session installed on purpose. That is that
   session's call, not this one's.

### The first GAUNTLET tests: 48 of them, over the two things that fail silently

Chosen for "a wrong answer is invisible from the screen", not for ease. The only
gauntlet-adjacent tests before this were `panzoom-transform`, over a module
extracted OUT of `DrawingViewer`.

**`tests/gauntlet-payload-sql-contract.test.ts` (15 tests).**
`buildPayload` writes the `prompt`/`answer` JSONB; the readers are plpgsql
functions that reach in by literal string key. **The two sides are joined by
nothing but a spelling, and every layer between them is indifferent to it** --
`svelte-check` types the form state and never the object, PostgREST forwards
jsonb without inspecting it, and Postgres answers `->>` on a missing key with
NULL rather than an error. A renamed key therefore produces a challenge that
saves, publishes, reveals a NULL drawing, and grades every submission against a
NULL target, which `gauntlet_macro_submit` reads as not-correct. **The student
models the part right and is told they are wrong.**

**The expected values come from the migrations, not from the code under test.**
The test parses `supabase/migrations/` for every `answer->>'x'` / `prompt->'x'`
the live GAUNTLET functions read, resolving "live" the way Postgres does -- a
function is resolved by name at call time, so the LAST `create or replace` in
migration order wins and the earlier ones are history. Reading every migration
indiscriminately would have credited the schema with `tier` (dropped in `0029`)
and `target_volume` (a superseded spelling). It carries a positive control (the
extraction must find at least 10 answer keys and 4 prompt keys, or a regex that
stopped matching would turn every assertion into a vacuous truth) and a
one-entry exclusion list with its reason (`demo`, the purge predicate in
`gauntlet_author_delete`, written by seeds and never by the form). Beyond the
sweep it pins the public/private split per mode -- a Speedrun drawing in the
ANSWER and never the prompt, Reverse Engineer's reference deliberately the
opposite -- and the `buildPayload`/`formFromChallenge` round trip, because a
field that writes but does not read back is silently blanked the next time
anybody presses save.

**`tests/gauntlet-progression.test.ts` (33 tests).** A student sees "12 day
streak", "Level 4 Machinist", "+135 XP" and a row of badges, and there is no
second place any of those is written down and no way to tell a correct figure
from a wrong one by looking. **What is pinned is the stated rule, not the
implementation**: progression.ts's own header is the specification, and the
level ladder is recomputed here by counting UP through the documented curve
rather than by the square root the implementation inverts, so an algebra slip
in either cannot agree with the other. The day arithmetic is checked across a
month boundary, a year boundary, a US DST transition and a leap day, where the
expected answer is the calendar's.

**Both files are mutation-proved, eight mutations in total**, each in the
permissive direction, each restored md5-identically and re-verified green:

| Mutation | Reddened |
| --- | --- |
| `target_volume_mm3` renamed to `target_volume` in the answer | 5 tests |
| gated Speedrun drawing leaked into the public `prompt` | 2 tests |
| focus-region percent inverse broken (`/100` -> `/1000`) | 1 test |
| streak forgives ANY gap (`gap > 2` -> `gap > 99`) | 2 tests |
| streak forgives NO gap (`gap > 2` -> `gap > 1`) | 1 test |
| `LEVEL_NAMES` clamp dropped | 1 test |
| `series-complete`'s `total > 0` guard dropped | 1 test |
| streak badges keyed on `current` instead of `best` | 1 test |

The `series-complete` one is the one worth naming: without the `total > 0`
guard, a mode with nothing published in it satisfies `cleared >= total`
trivially (0 >= 0), so every student on the site is awarded "clear every
published challenge in one mode" on their first page load -- and CLAUDE.md is
explicit that an empty mode is a legitimate state, not a bug to be fixed out
from under it.

**One latent hole found and NOT fixed, because `progression.ts` is not this
bundle's to touch:** `levelFromXp(negative)` returns `level: NaN` and
`name: undefined`, because `Math.max(1, NaN)` is `NaN`. It is unreachable today
(the RPC's counts are non-negative) and there is deliberately no test asserting
the current behaviour, because a test that pins a broken answer is a ratchet.

### `docs/GAUNTLET.md`: what it claimed, and what is true

Every claim below was verified against the migrations and the source before
being corrected. A freshness header now leads the file, saying in the document's
own voice that it was written against a snapshot, that nothing keeps it honest,
and that a claim in it is a **lead rather than a fact** -- the same structural
failure the VANGUARD backlog had.

- **"Teacher" throughout meant admin, and this is a capability question about a
  colleague.** `0067` redefined `is_teacher()` to return `is_admin()`, re-gating
  roughly ninety already-applied references in one function body. A Bosco Tech
  teacher who is not a row in `public.app_admins` **cannot author a challenge,
  cannot host a live room, and cannot reach `/gauntlet/author` at all** -- and
  the route answers a redirect, not a permission message, so it reads as a
  broken link rather than a missing grant. The routes were updated to
  `isAdmin()`; only the doc was not. It now carries a prominent header block
  and ten in-place corrections. The word is left standing only where it quotes
  a policy or function NAME, which cannot be renamed.
- **The verification section described gates that no longer exist.** It
  documented `0027`'s density check ("within a tolerance, default 1%") and its
  no-material block. `0034` removed all three gates in that chain -- `0026`'s
  material NAME, `0027`'s material DENSITY, `0030`'s document UNIT SYSTEM --
  because each read something off the student's part other than its geometry.
  Ranked correctness is volume against the level's stored value, mass is
  computed from the LEVEL's density, and material and unit system survive as
  advisory display fields. The default tolerance is **0.1%** (`0036`), not the
  0.5% `0034` shipped with.
- **`gauntlet_macro_submit` is EIGHT arguments**, not the five listed. The live
  definition is `0061`'s.
- **A solo run is timed from `started_at`, not `reveal_at`.** `0016` moved the
  clock to a blank-verified SolidWorks event; the doc still described the
  reveal clock as the model. ROOM runs genuinely do still use `reveal_at`, so
  the two coexist and which applies depends on whether the token carries a
  room. `0061` additionally removed the ranked comparison value from the
  response (coarse unsigned band instead) and made a failing solo submit cost
  one of 3 budgeted attempts per reveal, closing exploit chain F4.
- **The tooling is four files in `static/tools/`, not one in
  `static/gauntlet/`.** `static/gauntlet/` does not exist and
  `idea-gauntlet-speedrun.bas` does not exist; the single macro became Start,
  Submit and Author capture when the clock moved. **And there is a whole C#
  SolidWorks add-in the document never mentioned** --
  `tools/solidworks-addin/IdeaGauntletAddin/`, shipped as a zip, which is the
  primary run tool and carries the `0035` telemetry recorder. It is also the
  third copy of the shared tolerance constant.
- **Four storage buckets, not one**: `gauntlet` (public, `0009`),
  `gauntlet-drawings` and `gauntlet-models` (private, `0015`), `gauntlet-tools`
  (public, `0031`).
- **Three routes existed and were unlisted**: `/gauntlet/leaderboard`,
  `/gauntlet/speedrun/history`, `/gauntlet/speedrun/quickstart`.
- **`projection` is not teacher-editable and is not editable by anyone.**
  `0015` grants `update` on the ruleset behind an admin policy, so the column is
  writable in principle -- but no surface in the app binds an input to it and
  there is no ruleset authoring form at all. Changing it means hand-written SQL.
- **A ledger of the ten later GAUNTLET migrations** (`0028`-`0031`,
  `0033`-`0036`, `0060`, `0061`) plus the two that changed GAUNTLET's meaning
  from outside (`0038`, `0067`) now closes the document, so a reader can tell at
  a glance whether a subsystem moved.

### Dead vs half-built (reported, nothing changed)

Recorded in `docs/GAUNTLET.md` as well, because "it is already built" and "a
student can see it" are different claims and the gap is invisible from the code.

- **`gauntlet_log_speedrun_attempt` is DEAD.** `0033` defines it and grants it
  to `authenticated`; nothing calls it -- not the app, not the three macros, not
  the C# add-in, not another SQL function. The attempt history it was meant to
  feed is populated by `gauntlet_attempt_from_submission` and
  `gauntlet_attempt_from_token` instead, which is why nobody noticed. Removable.
- **`gauntlet_run_analysis` is HALF-BUILT: written, never read.** The add-in
  posts to `gauntlet_run_analysis_upsert` (`GauntletClient.cs`), the table has
  RLS with an own-row read policy and a `select` grant to `authenticated`, and
  **no query anywhere in `src/` selects from it.** The post-run screen derives
  everything from the raw `gauntlet_run_events` stream instead, so the
  materialized summary that exists to make history and leaderboard reads fast is
  accumulating a row per run and serving none. The missing half is the read.
- **`PostRunAnalysis`'s learning curve and class-median comparison are
  HALF-BUILT.** The component takes `selfHistory` and `classStats` and renders
  real comparisons from them; **the only caller that passes either is
  `/dev/run-analysis`**. The production mount passes `events` and `targets`
  only, so both props take their empty defaults and both comparisons degrade to
  nothing. A student has never seen either. Everything needed is already in the
  schema -- `0033`'s attempt history IS the self-history and the medians are an
  aggregate over it -- so what is missing is a load, not a feature.

### Verified

- **`npx svelte-kit sync && npx svelte-check`: 0 errors, 37 warnings**, mix
  **31 `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`** over 20 files. Identical before and after. (A
  fresh checkout needs `npm ci`, then the two `PUBLIC_SUPABASE_*` placeholders
  exported, then `svelte-kit sync`, or 11 phantom errors land and vitest fails
  its dependency-optimisation step with a misleading rolldown/tsconfig error.)
- **`npm test`: 156 files / 3395 tests / 93.30s before, 158 files / 3443 tests
  / 91.15s after. All passing both times.** +2 files, +48 tests, no runtime
  cost (both files are pure `node`-project TS with no database).
- **`npm run verify:browser`: 40 route/width runs, 306 measurements, 4 outside
  threshold, 94.9s before; 46 runs, 388 measurements, 6 outside threshold,
  116.7s after.** The 4 pre-existing are 2 x `/dev/pathways` harness controls
  and 2 x `/dev/notebook` (which became 1 -- see finding 3). The 3 new are the
  STANDBY contrast at both widths and the 375px tap targets. **No threshold was
  loosened.**
- **`npm run verify:browser -- --selftest`: 44 controls (22 negative, 22
  positive), 0 instrument failures**, up from 36.
- **`--break` on both new routes**: `overflow`, `tiny-taps`, `low-contrast`,
  `invisible`, `console-error` and `blank-text` each redden their own check and
  leave the others green. `blank-text` reddens `text-contains` alone.
- **`npm run build` exits 0**, and both new harnesses compile to empty
  `function _page($$renderer) {}` stubs -- confirmed by reading the emitted
  entry files, which contain no fixture and no component reference.
- **Eight mutation proofs**, tabulated above, each restored md5-identically
  (`d3ca2288...` for `authoring.ts`, `245350be...` for `progression.ts`) and
  re-verified green afterwards.

### NOT verified

- **No live Supabase, no signed-in session, no SolidWorks, no real macro or
  add-in round trip.** Every SQL claim in this entry is read off the migration
  files, which is what the payload/SQL contract test does too; none of it was
  executed against the live project. The local `.env` is a placeholder.
- **The three findings were diagnosed, not fixed**, and no fix was attempted or
  tested for any of them. All three are in files this bundle does not own.
- **`prefers-reduced-motion` is `no-preference` throughout**, so
  `CountdownOverlay`'s reduced-motion path -- which renders nothing and calls
  `onDone` immediately -- is NOT exercised. That is the branch carrying the
  `untrack` guard, and it is untested here.
- **The countdown's numeral has no measurable contrast, by construction.** It is
  painted with `background-clip: text` over `color: transparent`, so a contrast
  row on it would read the transparent value and pass vacuously. Deliberately
  absent rather than overlooked.
- **The trademark footer's contrast (5.19:1) and the clock label figures are
  measured in the REAL faces, not the fallback stack**, contrary to the standing
  README caveat: `@fontsource` serves Rajdhani, Share Tech Mono and Orbitron
  from the app bundle rather than from Google, and `document.fonts` reports all
  three `loaded` on these routes. The caveat still holds for anything that
  reaches `fonts.googleapis.com`.
- **Six of the twelve unreachable components remain unreachable**:
  `ModelingRun`, `KnowledgePlay`, `ChallengeForm`, `Asset`, `ModeArt`,
  `TiltCard`.
- **Two other sessions were live in GAUNTLET while this ran.** Nothing here
  reads or asserts GAUNTLET behaviour that either could be changing -- the two
  test files cover `authoring.ts` and `progression.ts`, neither of which either
  session was reported to be touching -- but the doc corrections were verified
  against the tree at `319fc76` and a later fix could contradict one.
