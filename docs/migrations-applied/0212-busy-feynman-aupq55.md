---
migration: "0212"
file: 0212_tournament_reset_and_reward_payout.sql
sha256: 110120e3665938b5040debe69827d1d3bad0c0ed22983cbe47fddc87e37222a2
sha256_covers: repo bytes at commit 2a57b7f45a87088002961ad569a1b99e3227ba9c
applied_at: 2026-09-13
recorded_at: 2026-09-13T12:47:59.028Z
source: report
attested_by: Alejandro Pina
evidence: verification-output
ledger: "0207"
recorded_by_ledger: "0225"
branch: claude/busy-feynman-aupq55
commit: 2a57b7f45a87088002961ad569a1b99e3227ba9c
outcome: applied
---

# 0212 applied by hand

**This record rests on Alejandro Pina's report of 2026-09-13, not on a measurement made by this repository.** No process in this repository has ever connected to the production database. `0212_tournament_reset_and_reward_payout.sql` was pasted into the Supabase SQL editor by hand; what is written below is what was reported back, and nothing here was observed by the tool that wrote it.

`session_user` and `database` are absent on purpose. In a record written by `tools/apply-migration.mjs` they are answers the SERVER gave to a query, and this tool spoke to no server, so it has no honest value for either. The absence is the signal.

## Authorisation

- Ledger entry: `docs/prompt-ledger/entries/0207-tournament-bracket-coverage-correction-reset-and-reward-payout.md`
- `Migration permitted: yes. Claims: 0212. Highest on origin/main at issue: 0211 (per `tools/migration-claims.mjs`; next free 0212)`
- Written on `claude/busy-feynman-aupq55`.
- Recorded, later and separately, by ledger `0225`. That bundle did not write this migration and did not apply it.

## What was reported back

As supplied to this tool, with anything shaped like a connection string masked. The values are reproduced and NOT interpreted: whether a particular `false` is a pass or a failure is a question about the query that produced it, and this tool did not write that query and did not run it.

```
| migration | object                                                                     | applied |
| --------- | -------------------------------------------------------------------------- | ------- |
| 0212      | function public._tournament_award pays through _coin_insert                | true    |
| 0212      | function public.tournament_reset_match (new in 0212)                       | true    |
```

The probe above was written by hand by the router chat because tools/record-applied.mjs could derive no probe for this migration while its file was only on a branch (not yet on origin/main), and the tool's own refusal message said to do exactly that: write the verification query by hand and pass its output to --evidence.

## What a verification query would cover

No probe could be derived for this file, so this record names no object list. `tools/idea-status.py` derives a probe from a migration's FIRST object and answers nothing for some shapes; that is a limit of the derivation and not a claim about the file.

## What this record does not prove

That the migration was a good idea, that a backfill inside it did the right thing, or that the database still holds what it held on the day above. It is one person's report, written down where the next session can find it instead of nowhere.
