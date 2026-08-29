---
title: "Reverse Engineer and Feature Golf can start again, and neither ranks (`0146`)"
date: 2026-08-29
branches: [claude/gauntlet-modeling-modes-reveal-75aeej]
migrations: ["0146"]
subsystems: ["GAUNTLET"]
---

## Reverse Engineer and Feature Golf can start again, and neither ranks (`0146`)

Two of GAUNTLET's six modes have been unable to begin a run since `0015`. This
bundle restores the gate that starts them, and in the same migration removes
both from the global leaderboard, because neither ranks on anything the server
can check. It also fixes an authoring-form default that has been grading every
form-authored challenge five times looser than intended since `0036`.

The session was given three audit claims and told to verify each before acting.
Two were right, one was right about the defect and wrong about the fix, and one
sentence of supporting detail in the first was wrong. All four findings are
below, because "the audit said so" is not a verification.

### 1. The gate: confirmed, and the mechanism is worth keeping

`gauntlet_speedrun_reveal` is the only function that mints a SOLO run token --
verified by grepping every `insert into public.gauntlet_run_tokens` across the
migration history: five hits, three of them successive definitions of that one
function, and two of them (`0010`, `0028`) the room path, which carries a
`room_id`. `ModelingRun.svelte` is the shared play component for Reverse
Engineer and Feature Golf and calls exactly that RPC on Start. Its gate has read
`if v_mode <> 'speedrun'` since `0015`, so Start raised and no run could begin.

The chain, read file by file: `0005` created the function speedrun-only, `0006`
kept it, **`0007` deliberately widened it** to
`not in ('speedrun', 'reverse_engineer', 'feature_golf')` with the message `Not
a modeling challenge.`, **`0015` wrote it back to the single-mode form** while
re-signing the whole body to add `drawing_image_path`, and `0023` copied
`0015`'s body forward to add `focus_regions`, carrying the narrowing with it.

`0015`'s header describes storage fields and a ruleset singleton and **never
mentions the gate**, which is how this survived thirty migrations. That is the
general failure the repo already has a rule for -- "When re-signing a function to
change one term, DIFF IT AGAINST THE SOURCE" -- and this is its most expensive
instance so far.

**One detail in the audit was wrong and is corrected here.** It said both modes
are "linked from the dojo landing and listed as built". They are not: both carry
`status: 'construction'` in `MODES` (`src/lib/gauntlet.ts`), and
`src/routes/gauntlet/+page.svelte` renders an `<a href>` only for
`mode.status === 'live'`, giving construction modes an "In progress" chip and no
link, with page copy that says so. What is true, and is what matters, is that
both modes have complete route trees -- list page, detail page, `nextUncleared`
wiring, publish-blocker rules, demo seeds and a score branch in
`gauntlet_macro_submit` -- and are reachable by URL and by any existing link or
bookmark. The modes are built and unstartable; they are just not advertised.

### 2. The exploits: one confirmed as stated, one confirmed and worse

**Feature Golf** ranks on `v_score := p_feature_count`, an integer the caller
sends, compared against nothing. `1` takes the board; `0` or a negative takes it
further. Confirmed by reading the live `gauntlet_macro_submit` (`0061`).

**Reverse Engineer** was the one the session was told to establish rather than
assume, and the audit was right for a sharper reason than it gave. Its metric IS
computed server side -- the mean of the volume and surface-area deviations from
the stored targets -- so it is not a bare client claim. But `gauntlet_macro_submit`
returns `score_metric` on a **failing** submit as well as a passing one, and for
this mode that number is the exact deviation. That makes it an oracle on the
answer key:

    score(V) = (|V - Vt| / Vt * 100 + areaDev) / 2
    two failing probes, area held fixed:
    Vt = 100 * (V1 - V2) / (2 * (score(V1) - score(V2)))

**This was measured, not reasoned about.** `tests/gauntlet-modeling-reveal.test.ts`
drives the real `gauntlet_speedrun_reveal`, `gauntlet_macro_start` and
`gauntlet_macro_submit` against the real migration chain, submits 100000 and
90000 against a hidden target of 80000, gets 12.5 and 6.25 back, and solves for
80000 to within `toBeCloseTo(..., 3)`. Two probes. No part modelled.

This is precisely the disclosure `0061` was written to close -- it replaced the
exact deviation with a coarse unsigned band and stripped the target out of
`gauntlet_run_targets` -- and `score_metric` is the door it left open. It was
harmless only because the one mode whose `score_metric` IS a deviation could not
be started. The per-reveal budget of three failed attempts does not contain it:
re-revealing is free and unlimited, and two probes fit inside one budget anyway.

**So both modes are excluded from `gauntlet_leaderboard`, not just Feature Golf.**

### 3. Why the containment is at the board and not at the submit

`gauntlet_macro_submit` is explicitly outside this bundle's ownership, and that
turned out to be the right boundary rather than a constraint to work around:

- Feature Golf **cannot** be fixed there. The server never sees a feature tree.
  Ranking on feature count honestly needs a count the student cannot author,
  which means a signed measurement (impossible -- the macro ships as readable
  source and the add-in runs on their machine, so any key in it is theirs), a
  server-side SLDPRT parse (does not exist), or a human witness (which is what a
  supervised room already is). The migration header says all three.
- Reverse Engineer **can** be fixed there, and the fix is small: stop returning
  `score_metric` for this mode, or return it only once the run has passed. That
  is named in the header as the change that would let the exclusion be lifted,
  and left for the bundle that owns the function.

The view is an **allowlist** (`s.mode in ('speedrun')`), not `mode not in (...)`.
A macro mode added later must be admitted by somebody who has decided its metric
is checkable, rather than inheriting a board seat by default.

**What survives, and it is more than "it still records".** The submission row is
still inserted with its `score_metric`, `is_correct` and full `value` audit
trail. `gauntlet_room_board` is a separate view over `submissions` (`0010`,
row-scoped in `0060`) and is untouched, so a Feature Golf challenge raced in a
supervised room still ranks inside that room -- which is exactly the "human
witness" case above, arrived at without planning it. And `gauntlet_leaderboards()`
is unaffected: its Speedrun records are already filtered to `mode = 'speedrun'`,
and its overall XP board counts attempts and CLEARS from `submissions` directly,
so a forged feature count buys no XP because clearing still means passing the
hidden volume gate.

**What is lost, and it lands on files this bundle does not own.** The
per-challenge board on `/gauntlet/feature-golf/<id>` and
`/gauntlet/reverse-engineer/<id>` goes empty, `myBest` comes back null, and the
list pages stop marking those challenges cleared -- all four read
`gauntlet_leaderboard`. Worse, and this needs fixing by whoever owns the
component: `ModelingRun.svelte:284` keys its post-run sentence on
`result.is_correct && myBest` and falls through to **"A miss is recorded but does
not rank."** when `myBest` is null, so a PASSING Feature Golf run will read as a
miss. That is a one-conditional copy fix, reported rather than made here.

### 4. The tolerance default: the defect was real, the obvious fix is refused

`0036` tightened the server default from 0.5% to 0.1% and kept the VBA macros
and the C# add-in in step. `emptyForm` in `src/lib/gauntlet/authoring.ts` kept
seeding `0.5`, and `buildPayload` writes that seed into `answer`, where the
per-level override is read FIRST by `gauntlet_macro_submit` and beats the
constant. So every challenge authored through the form since `0036` grades at
five times the intended band, and five times the band the add-in shows the
student while they model. A part the add-in calls a fail can be a ranked pass.
All confirmed by reading the live definitions.

**The audit's implied fix -- write no override at all -- does not work, and the
migration was drafted that way before the reason surfaced.**
`gauntlet_publish_blocker` (`0009`, last defined in `0034`) refuses a modeling
challenge whose `answer` carries no `tolerance_pct`:

    'A tolerance band is required to publish.'

An explicit band is therefore mandatory on every published modeling challenge,
and the only thing the form gets to decide is which one it starts on. Seeding
`null` would leave every freshly authored challenge unpublishable until the
author typed a number they have no guidance for -- which is how `0.5` gets typed
back in by hand. So the seed becomes `GAUNTLET_DEFAULT_TOLERANCE_PCT = 0.1`,
equal to the server constant, and
`tests/gauntlet-authoring-tolerance.test.ts` **reads that constant back out of
the newest migration defining `gauntlet_macro_submit`** and pins the two
together, so the next tightening cannot leave the form behind the way `0036`
did. The publish blocker's requirement is pinned in the same file, because it is
the fact that decides the shape of the fix.

**Stored rows are untouched, deliberately.** `formFromChallenge` reads a
challenge's own stored band when editing, so an existing 0.5 challenge keeps
grading at 0.5. It also does NOT fill in a band for a stored row that has none
-- asserted, after the test initially expected the opposite -- because inventing
one would write an override into a row the server was correctly defaulting for.

The count of affected rows **could not be taken**: the local `.env` is a
placeholder project and nothing in this repo can reach production. `0146`
therefore prints it at apply time (published / total / other-band / no-band) and
writes nothing, with the corrective `update` given as a comment. The header also
names the half of that decision that is easy to miss: correcting the rows does
not re-grade anything, so a run already ranked as a pass under the 0.5 band
stays ranked while new runs are held to 0.1, and there is no way to make both
halves true at once.

### Verification

- **`svelte-check`: 0 errors / 37 warnings, 31 `state_referenced_locally` / 5
  `css_unused_selector` / 1 `perf_avoid_nested_class`**, before and after,
  re-derived rather than trusted (`svelte-kit sync` first, with the two
  `PUBLIC_SUPABASE_*` placeholders exported, per the fresh-checkout rule).
- **Full suite before: 156 files / 3395 tests passing.** After: 158 files /
  3429 tests passing (+2 files, +34 tests, no other file moved).
- **Mutation proofs, all four restored from copies and md5-verified:**
  - Gate narrowed back to `<> 'speedrun'`: the MIGRATION refuses to apply --
    its own guard raises "the reveal gate did not widen". Stronger than a red
    test, but it means the guard is structural, so:
  - Gate narrowed to refuse `feature_golf` while still NAMING both modes
    (slipping past that guard): 1 test red, the `feature_golf` token mint.
  - Gate opened to admit every mode (permissive direction): 3 red, all three
    knowledge-mode refusals.
  - Board filter restored to `0007`'s (permissive direction): exactly 3 red --
    the two exclusions and the forged-feature-count assertion -- with every
    positive control (Speedrun ranks, knowledge ranks, rows still recorded)
    staying green.
  - Form seed reverted to `0.5`: 2 red, the equality against the server
    constant and the explicit not-0.5 assertion.
- **Positive controls, because absence assertions pass against a broken
  fixture.** The board file asserts Speedrun ranks two players in order and a
  knowledge mode ranks, alongside the exclusions; the migration's apply-time
  check counts the rows the OLD view would have shown beside asserting the new
  one shows none; the tolerance file puts its SQL parser to synthetic bodies
  carrying 0.05, 0.5 and 0.25 so "equals the server constant" cannot pass
  against a parser that always returns 0.1.
- `git diff --stat src/` is `authoring.ts` only.

### NOT verified

- **`0146` has not been applied.** Nothing in this repo can reach the live
  project, and the session was forbidden from trying. Every claim about live
  behaviour is a claim about the real migration files applied to an embedded
  Postgres by the test harness.
- **No browser pass.** Both affected surfaces (`/gauntlet/feature-golf/<id>`,
  `/gauntlet/reverse-engineer/<id>`) need a signed-in session and a published
  challenge; `npm run verify:browser` covers `/dev` routes only, and there is no
  `/dev` harness for `ModelingRun`. The `ModelingRun.svelte:284` copy defect
  above is therefore read off the source, not seen on screen.
- **The count of 0.5-band challenges in production is unknown** and is printed
  by the migration rather than reported here.
- **No `classroom-updates.json` entry.** GAUNTLET is not a classroom surface and
  has never appeared in that log (0 of its 10 entries mention it).

### Deferred, and to whom

- Closing the Reverse Engineer oracle in `gauntlet_macro_submit`, which would
  let its board exclusion be lifted. Needs an answer for every deployed caller
  of the returned shape.
- The `ModelingRun.svelte` "A miss is recorded but does not rank." branch, which
  now mislabels a passing run in the two excluded modes.
- Whether the two modes should be promoted from `construction` to `live` in
  `MODES` now that they run. Deliberately not done: they run, they do not rank,
  and somebody should decide whether that is what "live" means here.
