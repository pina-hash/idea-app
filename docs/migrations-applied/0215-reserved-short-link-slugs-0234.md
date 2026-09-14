---
migration: "0215"
file: 0215_short_link_reserve_ideacad.sql
sha256: 243d2b6671d9d09569beda68b4d3905e75761e10441caab39ecaafcca6f54be9
sha256_covers: repo bytes at commit e6a537f88d0f6c5624052b2af7469bc060f7f564
applied_at: 2026-09-14
recorded_at: 2026-09-14T16:57:07.572Z
source: report
attested_by: Alejandro Pina
evidence: verification-output
ledger: "0234"
recorded_by_ledger: "0266"
branch: codex/reserved-short-link-slugs-0234
commit: e6a537f88d0f6c5624052b2af7469bc060f7f564
outcome: applied
---

# 0215 applied by hand

**This record rests on Alejandro Pina's report of 2026-09-14, not on a measurement made by this repository.** No process in this repository has ever connected to the production database. `0215_short_link_reserve_ideacad.sql` was pasted into the Supabase SQL editor by hand; what is written below is what was reported back, and nothing here was observed by the tool that wrote it.

`session_user` and `database` are absent on purpose. In a record written by `tools/apply-migration.mjs` they are answers the SERVER gave to a query, and this tool spoke to no server, so it has no honest value for either. The absence is the signal.

## Authorisation

- Ledger entry: `docs/prompt-ledger/entries/0234-reserved-short-link-slugs.md`
- `Migration permitted: yes. Claims: 0215. Highest on origin/main at issue: 0214`
- Written on `codex/reserved-short-link-slugs-0234`.
- Recorded, later and separately, by ledger `0266`. That bundle did not write this migration and did not apply it.

## What was reported back

As supplied to this tool, with anything shaped like a connection string masked. The values are reproduced and NOT interpreted: whether a particular `false` is a pass or a failure is a question about the query that produced it, and this tool did not write that query and did not run it.

```
| check                                    | answer |
| ---------------------------------------- | ------ |
| audit table exists                       | true   |
| ideacad reserved                         | true   |
| no short link still occupies ideacad     | true   |
| open-lab NOT reserved (negative control) | true   |
```

The probe that produced the rows above was written by hand by the router chat rather than taken from `record-applied --query`, which is why its four checks do not line up with the object list below: the derivation covers one object for this file, the audit table, while the hand-written probe also asks whether `ideacad` is reserved, whether any short link still occupies it, and whether `open-lab` is NOT reserved. That last row is a negative control, included deliberately so the evidence shows the predicate discriminates rather than answering `true` to everything.

## What a verification query would cover

Derived locally by `tools/record-applied.mjs --query`, and never run from here:

- object table public.app_short_link_reserved_moves

## What this record does not prove

That the migration was a good idea, that a backfill inside it did the right thing, or that the database still holds what it held on the day above. It is one person's report, written down where the next session can find it instead of nowhere.
