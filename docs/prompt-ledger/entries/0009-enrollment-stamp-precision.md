# 0009 The enrollment-recency tests are nondeterministic: Postgres microseconds truncated to JS milliseconds
- Issued: 2026-09-02
- By: router chat for IDEA portal work
- Owns: `tests/foundry-author-class.test.ts`, the timestamp-reading helpers in `tests/db/harness.ts`, `docs/prompt-ledger/entries/0009-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0170
- Status: issued
- Branch: assigned by the harness
- Notes: CI run #504 on `main` at `d6811eb` failed on
  `a student holding two IDEA enrollments > and the opposite order yields
  the opposite course`, at `expected 1788332569600 to be greater than
  1788332569600`. Two enrollment `created_at` values identical to the
  millisecond. The same commit passed the full suite in prompt 0005's
  session, so it is nondeterministic rather than a regression.

  The projection under test is not broken. `0132` sorts on
  `e.created_at desc` at the database's own microsecond resolution and
  orders the pair correctly. The loss happens on the way out: node-postgres
  parses a `timestamptz` into a JS `Date`, which carries milliseconds, so two
  inserts a few hundred microseconds apart arrive in the test as equal. The
  assertion that fails is the test's own PRECONDITION about its fixture, not
  its claim about the product.

  Deliberately excluded: any migration, any change to the projection or to
  `0132`, and any change to what the tests assert about the product.
