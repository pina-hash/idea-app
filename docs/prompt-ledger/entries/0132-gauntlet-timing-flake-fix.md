# 0132 The GAUNTLET verification-floor fixture has two runs racing a clock

- Issued: 2026-09-10
- By: a landing/repair session, following on the diagnosis carried in this
  entry itself (no prior ledger entry named the defect; see Notes).
- Owns: `tests/db/gauntlet-verification-floor.test.ts`,
  `docs/prompt-ledger/entries/0132-*`, and its own `docs/history/` entry.
  Nothing else.
- Migration permitted: none. Claims: none.
- Status: pushed
- Branch: `claude/gauntlet-timing-flake-fix-i5kzst`, branched from
  `origin/integration` at `541e00a1`. It lands on `integration` only; this lane
  does not merge to `main`.
- Notes: `integration` was red on `tests/db/gauntlet-verification-floor.test.ts`,
  intermittently. The fixture's `runFor` backdates
  `gauntlet_run_tokens.started_at = now() - elapsedMs` in one statement, and
  `gauntlet_macro_submit` computes `elapsed_ms = now() - started_at` in a
  LATER one -- so the stored metric is `elapsedMs + drift`, with drift
  independent per call. Ben and Cleo's honest runs were both seeded with the
  identical nominal `HONEST_MS` (187,004ms), and the board's rank-1 seat test
  asserts Ben takes it. `0194`'s ranking window ends in a deterministic
  `created_at asc` tiebreak, which the fixture appeared to be relying on --
  but it never runs, because the two `score_metric` values coming back from
  the database are never actually equal once each has its own drift. Whichever
  round trip happened to be quicker won the seat, load-dependent: roughly 1 in
  16 on the merged tree, 0 in 6 on a quiet machine.

  The fix gives Cleo a distinctly slower honest time (`CLEO_HONEST_MS =
  192,881`, roughly 5.9s slower than Ben's `HONEST_MS`), far enough apart that
  no plausible round-trip drift can close the gap or invert the ordering. Two
  downstream assertions that read `HONEST_MS` back are corrected to read the
  constant that actually applies to the row they are checking: Cleo's ranked
  `score_metric` (hers, formerly a wrong reuse of Ben's constant) now reads
  `CLEO_HONEST_MS`; the per-drawing record assertion, which reads Ben's own
  held time, is unchanged. No other line in the file moved.

  Proved by running the file 20 times in a row standalone (20/20 passed, all
  11 tests each run) and 4 more times with the full suite running
  concurrently in the background (24/24 total, still 11/11 each run) -- the
  load condition the flake actually needed to surface. `supabase/migrations/
  0194_gauntlet_verification_floor.sql` was not touched; it was never the
  defect.

  **A second, unrelated, pre-existing failure was found and left alone**,
  because this lane owns exactly one file: `tests/derived-numbers.test.ts`
  fails on `origin/integration`'s own tip (`541e00a1`, confirmed against a
  clean stash of this lane's one change) because three `html-rubric-*` route
  specs landed after the measured region's last regeneration
  (`docs/history/ledger-0130-derived-numbers-b629zb.md`) and were never
  measured by it. That is a landing bundle's job, per that entry's own
  "every landing bundle inherits this one's job" -- not this one's, and
  `npm run verify:readme` was correctly withheld from this prompt for exactly
  that reason.

  `npm run verify:readme` was not run, per the prompt. Baseline svelte-check:
  0 errors / 37 warnings at 31/5/1, confirmed. The full suite, run once at
  the end, is 358 passed / 1 failed (the `derived-numbers` file above) out of
  359 files, 7055 passed / 5 failed out of 7060 tests -- the tree has grown
  past the 357-file/7026-test figure this prompt cited, from merges landed
  after that figure was written; the only file this lane's change touches is
  green. Push, never force-push. Not merged to `main`.
