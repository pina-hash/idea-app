# 0225 The applied records for 0212, 0213 and 0214, and the 0210 record that went stale

- Issued: 2026-09-13
- By: router chat
- Owns: `docs/migrations-applied/**`, `docs/prompt-ledger/entries/0225-*`, and its
  own `docs/history/` entry. NO OTHER FILE.
- Migration permitted: no. **Claims: none.** It records migrations already applied
  by hand and applies nothing.
- Status: pushed
- Branch: `claude/sweet-knuth-1no6mh`, started from `claude/blissful-bohr-79y23g`
  rather than `origin/integration`, because that branch carries `0212` to `0214`
  and `record-applied` refuses a number whose file it cannot find.
- Notes: `tests/db/migrations-applied-record.test.ts` failed on two independent
  assertions - no record for `0212` to `0214`, and `0210`'s recorded sha256 no
  longer matching its file after a comment-only edit in `e8c6d805`. That red is
  inherited by every branch cut from `integration`, so two live lanes were
  building against it. The evidence is Mr. Pina's own catalog probe output of
  2026-09-13, six rows, all `true`. Both assertions pass now:
  `tests/db/migrations-applied-record.test.ts` alone is 23 passed, 0 failed, and
  the full suite is 473 test files passed (473), 9058 tests passed (9058), 0
  failed -- against the inherited `2 failed / 9056 passed (9058)` baseline, a
  clean `+2` with nothing else moved. Full account in
  `docs/history/sweet-knuth-1no6mh.md`.
