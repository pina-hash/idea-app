# 0225 The applied records for 0212, 0213 and 0214, and the 0210 record that went stale

- Issued: 2026-09-13
- By: router chat
- Owns: `docs/migrations-applied/**`, `docs/prompt-ledger/entries/0225-*`, and its
  own `docs/history/` entry. NO OTHER FILE.
- Migration permitted: no. **Claims: none.** It records migrations already applied
  by hand and applies nothing.
- Status: issued
- Branch: assigned by the harness, started from `claude/blissful-bohr-79y23g`
  rather than `origin/integration`, because that branch carries `0212` to `0214`
  and `record-applied` refuses a number whose file it cannot find.
- Notes: `tests/db/migrations-applied-record.test.ts` failed on two independent
  assertions - no record for `0212` to `0214`, and `0210`'s recorded sha256 no
  longer matching its file after a comment-only edit in `e8c6d805`. That red is
  inherited by every branch cut from `integration`, so two live lanes were
  building against it. The evidence is Mr. Pina's own catalog probe output of
  2026-09-13, six rows, all `true`.
