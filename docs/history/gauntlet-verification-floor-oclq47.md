---
title: "The GAUNTLET plausibility floor becomes a setting Mr. Pina owns, and a run under it is HELD IN VIEW rather than dropped out of it; 0154's apply-time pin is replaced by two runtime properties (`claude/gauntlet-verification-floor-oclq47`, migration 0194)"
date: 2026-09-10
branches: [claude/gauntlet-verification-floor-oclq47]
migrations: ["0194"]
subsystems: ["GAUNTLET", "Database", "Interface"]
---

Decision 19 was raised with its second half open. Mr. Pina answered it:

> "Runners must be able to submit legitimate times under 30 seconds. That
> artificial cap is nonsense or at the very least I should have control over
> that cutoff time and the run submitter should have a status for a low time
> submitted run for verification."

Three things, and this bundle is all three: keep the floor, make the cutoff his,
and give a sub-floor run a status rather than silently unranking it.

### The three claims from the 0109 research, all confirmed against the tree

Confirmed before anything was built on them, because a bundle that starts from a
prior session's summary is a bundle that inherits its mistakes.

1. **The student is told nothing today.** `speedrun/[id]/+page.svelte` rendered
   the rank sentence under `{#if result.is_correct && myBest}` and the miss
   sentence under `{:else if !result.is_correct}`. A sub-floor run has
   `is_correct` true and no board row, so **neither branch ran**: the card said
   "Pass, verified" over a table the student was missing from, with nothing
   anywhere saying why. Confirmed by reading the two branches.
2. **Nothing in `src/` links to `/gauntlet/run-review`.** Every occurrence of
   the string in `src/` is inside the route's own files, in comments. No `href`,
   no `goto`. The page has been reachable only by typing the URL since 0152.
3. **A board row carries no status field.** `LeaderboardRow` was
   `challenge_id, user_id, player, is_correct, score_metric, rank, created_at`,
   and the view's column list matched. This bundle's `rank_state` is the first
   status a board row has ever carried.

### What 0154's pin was, and why it could not survive being moved into a form

`0154` pinned the board's floor to 30 seconds because that is `0152`'s own
`gauntlet_run_review.p_fast_finish_seconds` default, so that **every run the
board refused was a run the review console already reported.** It enforced that
with a `do $chk$` block reading the console's signature out of `pg_proc` and
RAISING when the console's threshold was the lower of the two.

An apply-time assertion cannot check a number somebody types into a form later.
Decision 19 names this exactly, and it is the reason the pin is REPLACED rather
than dropped. What replaces it is two properties, neither of which can drift:

* **The board no longer drops the run at all.** A held run is on the board with
  `rank_state = 'pending_verification'` and a NULL `rank`. There is no longer a
  state in which a run is absent from the board, so half the failure mode is
  closed structurally rather than by an assertion. Nothing has to stay equal to
  anything.
* **The console emits `pending_verification` from the SAME settings row**, and
  never from `p_fast_finish_seconds`. So it is unconditional: a teacher who
  narrows the "Quick finish under (seconds)" box to 5 narrows `fast_finish` for
  their own purposes and cannot narrow this, and `p_observed_only` can never
  filter a held run off the console.

Together those are stronger than the equality they replace. **After 0194 there
is no floor value, including zero and including a value changed while a run is
in flight, at which a run is on neither surface.**

`p_fast_finish_seconds` keeps its meaning, its default and its signature. It is
a teacher's own lens over the report, which is what `0152`'s form already calls
it; the two questions are now answered by two observations instead of by one
number doing both jobs badly. The signature not moving is what makes this a
plain `create or replace` with no drop, no second overload and no deploy
ordering.

### Why the number is not published, and how

Decision 19's whole argument for a status rather than an explanation is that a
held state says something true without handing a forger the threshold. That is
worth nothing if the number is one PostgREST call away, so:

* `gauntlet_rank_settings` has **no grant to `anon` or `authenticated`** and no
  policy for them. Roles are NAMED in the revoke, not `from public`, because on
  a hosted Supabase project the default privileges write a direct grant to each
  role at creation time.
* The **view reads the row without a function and without a grant**, through a
  scalar subquery, because the view is owner-privileged (`0060` section 3's
  posture, unchanged). A helper function would have needed an EXECUTE grant to
  be callable, and granting one to `authenticated` would have published the
  number it exists to hide.
* `gauntlet_rank_settings_get` exists and is **admin only** -- the console has
  to show him the number he is editing. It answers NULL to a student, which is
  the same answer a missing row gives.
* Not one sentence on any student-facing surface names a count of seconds. The
  browser pass asserts that as an absence, with the phrases spelled out.

### The board's own shape

`0154`'s definition with one change to what rows enter and one column added.

* **`rank_state` is appended AFTER `rank`**, which is not a style choice:
  `create or replace view` may add columns only at the end, and appending is
  also what preserves the existing grants.
* **The `case` is written once**, computed in an inner select so the
  `distinct on`'s ORDER BY can sort on the column rather than on a second copy
  of the expression. Two spellings of "is this run held" would stop matching in
  the direction that quietly ranks a held run.
* **"It removes the run, not the player" is preserved, and is now STATED rather
  than inherited.** `0154` got it free from the WHERE excluding held rows; the
  WHERE no longer does, so `(cand.rank_state = 'ranked') desc` leads the
  `distinct on` ordering. Without that term a student's held 4-second run would
  represent them on a challenge they also cleared honestly, and their honest
  seat would disappear. Mutation-proved below.
* **The published per-drawing record needed no change.**
  `gauntlet_leaderboards()` joins the board `on ... and rec.rank = 1`, and
  `NULL = 1` is NULL. That is exactly why it has an assertion: nothing in the
  diff would have shown it breaking.
* **A row with no `elapsed_ms` at all is HELD, not dropped.** `0154` excluded it
  (`NULL >= 30000` is NULL) and called that fail-closed, which it was; held is
  the same refusal to rank with a teacher able to see it. It holds at every
  floor value including zero.

### What was measured

**The db test is the pin.** `tests/db/gauntlet-verification-floor.test.ts`, 9
tests, against a real embedded Postgres with the real chain through `0154` and
then `0194`. Every run is driven through the real RPC chain (reveal, start,
submit) rather than hand-inserted, and the token's `started_at` is back-dated
because the clock is server-stamped and cannot be asked for.

The central assertion reads the console at its **narrowest lens** -- a
zero-second floor with `p_observed_only`, which switches `fast_finish` off
entirely and is the exact configuration that would have hidden the run before
this file. It asserts the held run is reported AND that `fast_finish` is absent,
so it cannot be passing through the old mechanism. Its positive control is the
same read at the default lens; its negative control is that an honest run
appears on neither. And because `gauntlet_run_review` answers an EMPTY SET to a
non-admin rather than raising, a separate test drives the identical call as a
student and asserts zero rows, so no non-empty result above can be a closed gate
misread as a working pin.

**Mutation proof, restoring from a `cp` copy and md5-checked**, in the
permissive direction:

| Mutant | Result |
| --- | --- |
| Console arm reads `b.fast_ms` instead of `b.board_floor_ms` | Migration **refused to apply** -- its own self-check caught it |
| Same, with the self-check's arm assertions ALSO neutered | 2 tests red (the pin, and the floor-moves-both-sides test) |
| The view excludes held rows again (`0154`'s shape) | 2 tests red (the board row, and floor-moves-both-sides) |
| The `(rank_state = 'ranked') desc` term removed, self-check opened | 2 tests red (including a held run taking an honest seat) |

Defence in depth confirmed by opening both layers separately: the migration's
self-check bites alone, and with it opened the test bites alone.

**Browser pass**, `/dev/gauntlet-rank-state` at 375px and 1440px, against
Chromium 141.0.7390.37. 28 measurements, 0 outside threshold:

* Horizontal overflow **0px** at both widths.
* The held chip's word, against the REAL rendered ground rather than the token:
  **15.45:1** (`rgb(200,255,0)` on `rgb(14,22,27)`, the board row's ground, not
  the page plate's).
* The result card's sentence: **19.23:1**.
* Exactly **1 chip over 4 board rows**, and exactly **2 over the whole page** --
  the board's and the result card's, with the `ranked` mount rendering nothing.
* The rank column reads `1 / 2 / 3 / en-dash`: ranked rows keep their numbers
  and the board did not renumber around the held row, and the held row's cell is
  a mark rather than a blank.
* 0 console errors.

Three browser mutations, each restored: a chip on every row (4 presence rows
red), the sentence naming "30 seconds" (the no-threshold row red), and a blank
rank cell (the mark row red).

**`svelte-check`: 0 errors, 37 warnings, 31 `state_referenced_locally` / 5
`css_unused_selector` / 1 `perf_avoid_nested_class`.** Re-derived, with the two
`PUBLIC_SUPABASE_*` placeholders exported before the sync; without them this
checkout reports the documented 13 phantom errors.

### What is explicitly NOT verified

* **0194 is NOT APPLIED.** This container cannot reach the production database:
  the proxy accepts a CONNECT to 5432 and then carries no bytes. Every figure
  above is from the embedded Postgres, never from live data. The apply-time
  counts in section 5 have therefore never run against real rows, and the
  numbers they print are unknown -- **read them before deciding to apply**, the
  way `0154` and `0146` ask.
* **Section 5's behavioural pin check SKIPS unless the applying session is an
  admin**, and says so rather than printing a zero that would be the gate rather
  than the pin. Section 7 carries the query to paste as an admin afterwards.
* No signed-in surface was driven in a browser. The harness covers `/dev` routes
  only, and `/gauntlet/run-review` and the Speedrun result card both need a real
  session.
* The harness blocks every non-loopback request, so `fonts.googleapis.com` did
  not load and **all text was measured in the fallback stack**;
  `prefers-reduced-motion` was `no-preference`, so that path was not exercised.

### Two corrections made along the way, both worth recording

**The first draft of section 4 reconstructed `0152`'s function body from memory
rather than copying it, and the diff was large and wrong.** Among other things
it replaced the chosen-name projection (`display_name` falling back to
`full_name`, `0151`'s rule and `0004`'s) with `coalesce(pr.full_name, 'Player')`
-- a disclosure regression on an admin console, arriving inside a change that
had nothing to do with names. It also rewrote the telemetry aggregation, the
volume tolerance and the derived `started_at`. CLAUDE.md's "when re-signing a
function to change one term, DIFF IT AGAINST THE SOURCE" is exactly this, and
the fix was to splice `0152`'s body in programmatically and diff the result: the
committed file differs from `0152` by the two additions and nothing else.

**The self-check's first regex refused the correct code.** It looked for
`pending_verification[^;]*fast_ms` over the raw `prosrc`, and section 4's own
COMMENTS name both identifiers while explaining why they must not be the same
thing. The block now strips line comments first and reads the observation's own
predicate, bounded by the array-element separator it sits between -- the same
comment-stripping rule `tools/gauntlet-doc-check.mjs` carries, for the same
reason.

### Deferred, and named so it is not mistaken for done

* **`gauntlet_room_board` (`0010`) still has no floor.** `0154` named it out of
  scope; it stays out of scope. A room round is minutes long and a floor
  interacts with a host's own timing, so it is a third question.
* **The knowledge-mode boards and `ModelingRun` were not touched.** The floor is
  a Speedrun rule, so `rank_state` is `ranked` for every knowledge row by
  construction, and their loaders were left on their existing selects rather
  than given ladders they cannot need.
* **A run held today stays held until somebody looks.** There is no release
  action: a teacher raises or lowers the floor, or asks the student. An explicit
  per-run "this one is fine, rank it" would be a fourth state and a write path
  on a table that has none, and it is not what he asked for.
