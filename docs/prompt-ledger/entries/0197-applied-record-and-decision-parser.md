# 0197 The hand-applied migration record, and the decision parser that cannot see `Build:`
- Issued: 2026-09-13 01:10 UTC
- By: router chat
- Owns: `docs/migrations-applied/**`, `tools/record-applied.mjs` (new), `tools/idea-status.py`, `tests/db/migrations-applied*`, `docs/decisions/entries/21-*`, `docs/prompt-ledger/entries/0197-*`, and its own `docs/history/` entry. NO FILE UNDER `src/`.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0208
- Status: issued
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
