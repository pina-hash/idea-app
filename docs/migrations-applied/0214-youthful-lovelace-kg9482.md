---
migration: "0214"
file: 0214_ideacad_document_archive.sql
sha256: 364b40cab632467ba9ab638a47e28259a1b33cee2817b96757acfc67ad07e9df
sha256_covers: repo bytes at commit 2a57b7f45a87088002961ad569a1b99e3227ba9c
applied_at: 2026-09-13
recorded_at: 2026-09-13T12:48:38.292Z
source: report
attested_by: Alejandro Pina
evidence: verification-output
ledger: "0218"
recorded_by_ledger: "0225"
branch: claude/youthful-lovelace-kg9482
commit: 2a57b7f45a87088002961ad569a1b99e3227ba9c
outcome: applied
---

# 0214 applied by hand

**This record rests on Alejandro Pina's report of 2026-09-13, not on a measurement made by this repository.** No process in this repository has ever connected to the production database. `0214_ideacad_document_archive.sql` was pasted into the Supabase SQL editor by hand; what is written below is what was reported back, and nothing here was observed by the tool that wrote it.

`session_user` and `database` are absent on purpose. In a record written by `tools/apply-migration.mjs` they are answers the SERVER gave to a query, and this tool spoke to no server, so it has no honest value for either. The absence is the signal.

## Authorisation

- Ledger entry: `docs/prompt-ledger/entries/0218-ideacad-document-archive.md`
- `Migration permitted: exactly one. **Claims: 0214.** Highest landed on `origin/integration` at issue: 0211. `0212` is HELD by ledger 0207 on `claude/busy-feynman-aupq55` and `0213` by ledger 0212 on `claude/sharp-einstein-cqrnx6`; `node tools/migration-claims.mjs` reports `next free 0214`, and 0214 is absent from both of its lists. No ref anywhere carries a `supabase/migrations/0214_*` file.`
- Written on `claude/youthful-lovelace-kg9482`.
- Recorded, later and separately, by ledger `0225`. That bundle did not write this migration and did not apply it.

## What was reported back

As supplied to this tool, with anything shaped like a connection string masked. The values are reproduced and NOT interpreted: whether a particular `false` is a pass or a failure is a question about the query that produced it, and this tool did not write that query and did not run it.

```
| migration | object                                                                     | applied |
| --------- | -------------------------------------------------------------------------- | ------- |
| 0214      | function public._ideacad_document_archived (new in 0214)                   | true    |
| 0214      | function public.ideacad_archive (new in 0214)                              | true    |
| 0214      | table public.ideacad_section_grants (new in 0214)                          | true    |
```

The probe above was written by hand by the router chat because tools/record-applied.mjs could derive no probe for this migration while its file was only on a branch (not yet on origin/main), and the tool's own refusal message said to do exactly that: write the verification query by hand and pass its output to --evidence.

## What a verification query would cover

No probe could be derived for this file, so this record names no object list. `tools/idea-status.py` derives a probe from a migration's FIRST object and answers nothing for some shapes; that is a limit of the derivation and not a claim about the file.

## What this record does not prove

That the migration was a good idea, that a backfill inside it did the right thing, or that the database still holds what it held on the day above. It is one person's report, written down where the next session can find it instead of nowhere.
