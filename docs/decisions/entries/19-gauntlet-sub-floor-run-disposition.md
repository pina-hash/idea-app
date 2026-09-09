# 19 What happens to a GAUNTLET run under the plausibility floor
- Raised: 2026-09-09  By: prompt 0109, `claude/docs-standards-ledger-hihkhd`
- Status: open
- Decision: The FIRST half is answered and is not what this entry asks. Mr. Pina said
  on 2026-09-09: KEEP the floor, and make the cutoff a setting he owns. What is open
  is the SECOND half -- what a sub-floor run should look like once it exists.
- Default this assistant would pick: give the run a `pending verification` state that
  is VISIBLE on the board rather than dropping it out of the view, because `0154`
  pinned the floor to `0152`'s review-console threshold precisely so that no run
  loses a seat without a teacher seeing it, and today the seeing depends on somebody
  typing a URL nothing links to.
- Why it is blocked on him: the cost of being explicit is handing a forger the
  threshold, which `0154` names as a decision rather than an oversight. Whether a
  student is told "this run is held for review" (honest, and tells the forger where
  the line is) or told nothing (what happens now, and reads to an honest student as
  the board silently losing their run) is a teaching call about his own students, not
  a security question with a right answer.
- What it unblocks: nothing is waiting and nothing is broken. `0154` is applied
  behaviour and stands on its own. Answering this is one migration on the view plus
  one sentence on the Speedrun result card; answering "leave it silent" costs a line
  in `CLAUDE.md` saying the silence is deliberate.
- Context: `supabase/migrations/0154_gauntlet_rank_what_is_checkable.sql` (the floor,
  its self-check, and its own explicitly-not-closed list at lines 250-256);
  `supabase/migrations/0152_gauntlet_run_review.sql` (the `fast_finish` threshold the
  floor is pinned to); `supabase/migrations/0015_gauntlet_speedrun_formalize.sql`
  (`gauntlet_speedrun_ruleset`, the settings-singleton precedent);
  `supabase/migrations/0155_gauntlet_authoring_tier.sql` lines 636-643 (which declined
  to widen that singleton, and says why); `src/routes/gauntlet/run-review/`;
  `src/routes/gauntlet/speedrun/[id]/+page.svelte` lines 883-905.

## The first half, and what it still needs

**The cutoff is a bare SQL literal today.** `30000`, written into the body of the view
`public.gauntlet_leaderboard` at `0154:310-321`. There is no table, no column, no
function parameter and no setting holding it, so "a setting he owns" is a build, not a
toggle. The precedent for the shape already exists one subsystem over:
`gauntlet_speedrun_ruleset` (0015) is a singleton row with a boolean primary key fixed
to `true`, a plain RLS update policy rather than a definer RPC, and a seeded default
that is never overwritten on re-apply. `0155` deliberately left it OUT of the new
author tier on the grounds that "editing it is a site-wide settings change, not
authoring a challenge", which is the same argument for this number.

**But the floor cannot become a free-standing setting without answering `0154`'s own
self-check.** That file reads `p_fast_finish_seconds`' default straight out of
`gauntlet_run_review`'s signature in `pg_proc` and RAISES if the review console's
threshold is lower than the board's floor, because a gap between them is exactly a
band of runs that lose a seat and are never reported. If the floor moves into a
settings row, that assertion has to move with it and become a runtime check rather
than an apply-time one -- otherwise a number he lowers in a form silently reopens the
hole the assertion was written to close.

**And there is already a live gap of the same shape, which is worth his attention
before he picks a number.** `p_fast_finish_seconds` is a per-REQUEST parameter, not a
stored setting: `src/routes/gauntlet/run-review/+page.server.ts:88` reads it off the
query string (`intParam(url.searchParams.get('floor'), 30, 0, 3600)`) and the form
labels it "Quick finish under (seconds)" with the help text "Your floor, not a rule
about the part." So a teacher who types 5 into that box is looking at a console whose
threshold no longer matches the board's, and nothing reconciles the two at read time.
Whatever "a setting he owns" turns into should probably own BOTH numbers, or say in
words that they are two different questions.

## What a sub-floor run does today, measured

1. **It writes an ordinary row.** `gauntlet_macro_submit` is untouched by `0154`: the
   `submissions` row lands with `is_correct = true`, its `score_metric` and its
   `elapsed_ms`, and the token is consumed or banked exactly as for any pass. `0154`
   says so deliberately -- "Only the board declines it."
2. **It appears on no board, as an ABSENCE.** The view's `where` excludes it, so there
   is no row to carry a state. `gauntlet_macro_submit` then reads the board back for
   its own return value and gets nothing, so the RPC answers `is_correct: true` beside
   `rank: null`. A per-drawing record held by such a run renders as "No record yet".
3. **The student is told nothing at all, and this is the part that argues the
   default.** On the Speedrun result card, `result.is_correct` is true and `myBest` is
   null, so NEITHER branch of the rank sentence renders. The student reads "Pass,
   verified", sees no rank line, and sees themselves missing from the table below. The
   one component that carries a "passed but does not rank" sentence
   (`ModelingRun.svelte`) is keyed on the MODE being unranked, serves
   `reverse_engineer` and `feature_golf`, and is not mounted here.
4. **A teacher sees it only by pulling.** The run does trip `fast_finish` in
   `gauntlet_run_review`, and its telemetry is unchanged -- but the console defaults to
   a 720-hour look-back, there is no notification, no queue count and no badge, and
   **nothing in `src/` links to `/gauntlet/run-review` at all.** The page is reachable
   only by typing the URL. `0154`'s promise that every unranked run is a run the
   console already reports is true of the DATA and not yet true of anybody's day.

## Why `pending verification` rather than the two alternatives

**A leaderboard row carries no status of any kind today.** The view's columns are
`challenge_id, mode, user_id, player, is_correct, score_metric, created_at, rank`, and
membership is binary -- in the view or not. `submissions` has no status column either.
So this default is not a small change: it is the first status a board row has ever
carried, and it would want the same treatment the notebook grid's states get (a word,
a glyph and a hue, never colour alone; held out of every total by not being named).

- **Against silent unranking, which is the status quo:** it is indistinguishable from
  a bug, and the student it is most unfair to is the honest fast one. It also spends
  `0154`'s central property -- the teacher CAN see it, but only if they already knew to
  look.
- **Against refusing the submission outright:** that tells the forger the threshold
  immediately and loudly, and it throws away a `submissions` row that is the evidence
  a teacher would want.
- **For a held state:** it says something true without saying the number. "Held for a
  teacher to check" names no threshold; a forger learns that a limit exists, which
  they learn from an empty board anyway. And it gives the review console something to
  be a queue OF, which is the thing that would get the page linked.

**The honest counter, recorded because it is the strongest one:** a held state is a
public accusation on a public board, and the great majority of runs it catches will be
the cheat `0152` says no elapsed floor can distinguish from a very fast honest run.
Marking a student's row in front of their class is a heavier thing than dropping it,
and that is the trade only he can make.

## Tree check (2026-09-09)

- `0154:310-321` carries `>= 30000` as a literal in the view body, with the comment
  naming `0152`'s default as its source. Confirmed.
- `0152:255-262` declares `p_fast_finish_seconds integer default 30`. Confirmed.
- `0154`'s `do $chk$` block reads that default out of `pg_get_function_arguments` and
  RAISES when it is lower than the floor, but only `raise notice`s when it is higher.
  The asymmetry is deliberate and is stated in the file.
- No migration after `0154` redefines `gauntlet_leaderboard`. **Whether `0154` is
  APPLIED to production is not derivable from this tree** and was not checked; use
  `tools/deploy-probe.mjs`.
- `gauntlet_room_board` (0010) has no floor and is unaffected. `0154` names that as
  out of scope and still open; it is a third question this entry does not ask.
