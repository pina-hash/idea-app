# 0197 The hand-applied migration record, and the decision parser that cannot see `Build:`
- Issued: 2026-09-13 01:10 UTC
- By: router chat
- Owns: `docs/migrations-applied/**`, `tools/record-applied.mjs` (new), `tools/idea-status.py`, `tests/db/migrations-applied*`, `docs/decisions/entries/21-*`, `docs/prompt-ledger/entries/0197-*`, and its own `docs/history/` entry. NO FILE UNDER `src/`.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0208
- Status: pushed
- Branch: `claude/zen-edison-jpgz4s`, from `origin/integration` at `f4616dca`
- Notes: Ledgers 0196, 0200 and 0201 run in parallel; no file of theirs is touched.
  Premise from ledger 0193's read-back audit
  (`docs/audits/2026-09-12-ledgers-0103-0192-read-back.md`), items 1 and 2. Two
  halves: backfill `0193`-`0210` into `docs/migrations-applied/` as APPLIED on Mr.
  Pina's report rather than on a measurement, through a new writer that has no
  database code path at all; and teach `tools/idea-status.py` to read `Build:` as
  well as `Status:`, so a decision he has already answered but nobody has built is
  in a list. Decision 21 is recorded, not built -- `integrate.yml` is owned by no
  bundle here.

## Outcome

Both halves shipped. `docs/migrations-applied/` holds eighteen records for `0193`-`0210`,
written by the new `tools/record-applied.mjs`, which has no database code path;
`tools/idea-status.py` reads `Build:` and prints a second list, which surfaces decisions
04 and 21 for the first time. Decision 21 is recorded with its last prerequisite met and
the four remaining build items restated; `integrate.yml` is untouched.

**The merge to `main` was NOT taken**, and not because a gate went red: ledger 0200 owns
that merge and performed it at 02:01 UTC, three minutes ahead of this lane. This work was
swept into `integration` by `integrate.yml` after 0200's tested sha, so it is in
`integration` (`79f66750`, green: 451 files, 8609 tests, 0 failures) and not in `main`
(`ee4a1c42`) -- which is 0200's own rule about what belongs to the next landing. Full
six-gate table in the history entry.

**Reported, not fixed** (owned by no lane here): `parsePermitted` in
`tools/migration-claims.mjs` misses a backticked `` Claims: `0196` `` and a `Claims:` on
its own bullet, so two entries that DID name their number read as "PERMITTED BUT NAMING NO
NUMBER". Decision 04's `Build:` line is stale.

