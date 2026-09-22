---
migration: "0218"
file: 0218_classroom_create_item_unit.sql
sha256: bd16e0c7f0f1c277fed3116ad46cf42be975b5a1ed225c7d3130ea6284fcbcb3
sha256_covers: repo bytes at commit abe3da945a8c05d7deb9cb8edec6b4d6469177db
applied_at: 2026-09-22
recorded_at: 2026-09-22T16:49:13.639Z
source: report
attested_by: Mr. Pina
evidence: verification-output
ledger: "0283"
recorded_by_ledger: "0284"
branch: claude/new-session-nfgovx
commit: abe3da945a8c05d7deb9cb8edec6b4d6469177db
outcome: applied
---

# 0218 applied by hand

**This record rests on Mr. Pina's report of 2026-09-22, not on a measurement made by this repository.** No process in this repository has ever connected to the production database. `0218_classroom_create_item_unit.sql` was pasted into the Supabase SQL editor by hand; what is written below is what was reported back, and nothing here was observed by the tool that wrote it.

`session_user` and `database` are absent on purpose. In a record written by `tools/apply-migration.mjs` they are answers the SERVER gave to a query, and this tool spoke to no server, so it has no honest value for either. The absence is the signal.

## Authorisation

- Ledger entry: `docs/prompt-ledger/entries/0283-composer-unit-at-create-and-deck-type-gate.md`
- `Migration permitted: yes, exactly one. Claims: 0218. Highest landed on origin/main at issue: 0217. `node tools/migration-claims.mjs` reports `next free 0218` and names 0218 in neither the claimed-not-landed list nor the holes list.`
- Written on `claude/new-session-nfgovx`.
- Recorded, later and separately, by ledger `0284`. That bundle did not write this migration and did not apply it.

## What was reported back

As supplied to this tool, with anything shaped like a connection string masked. The values are reproduced and NOT interpreted: whether a particular `false` is a pass or a failure is a question about the query that produced it, and this tool did not write that query and did not run it.

```
checked                                                                                                  | ok
arity: exactly one classroom_create_item                                                                 | true
signature: the surviving one takes 13 arguments                                                          | true
signature: its last argument is named p_unit_id                                                          | true
signature: p_unit_id is DEFAULTED, so a client that never heard of it still resolves                     | true
body: it writes unit_id on the canonical record                                                          | true
grant: anon CANNOT execute it                                                                             | true
grant: authenticated CAN execute it                                                                       | true
untouched: classroom_set_item_unit is still the post-creation path, one arity                            | true
POSITIVE CONTROL -- app_short_link_target IS anon-executable, so a grant is visible to this query at all  | true
```

## What a verification query would cover

No probe could be derived for this file, so this record names no object list. `tools/idea-status.py` derives a probe from a migration's FIRST object and answers nothing for some shapes; that is a limit of the derivation and not a claim about the file.

## What this record does not prove

That the migration was a good idea, that a backfill inside it did the right thing, or that the database still holds what it held on the day above. It is one person's report, written down where the next session can find it instead of nowhere.
