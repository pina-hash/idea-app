---
migration: "0205"
file: 0205_ideacad_document_sharing.sql
sha256: a2a26c5f1d286a541b965afb0dac3b111827a68c95e60310e60efdbca40d4d83
sha256_covers: repo bytes at commit f4616dcab08d20d2260791110f90bf50ebdbbb71
applied_at: 2026-09-13
recorded_at: 2026-09-13T01:30:57.665Z
source: report
attested_by: Mr. Pina
evidence: report-only
ledger: "0179"
recorded_by_ledger: "0197"
branch: claude/great-bell-ppysbn
commit: f4616dcab08d20d2260791110f90bf50ebdbbb71
outcome: reported
---

# 0205 applied by hand

**This record rests on Mr. Pina's report of 2026-09-13, not on a measurement made by this repository.** No process in this repository has ever connected to the production database. `0205_ideacad_document_sharing.sql` was pasted into the Supabase SQL editor by hand; what is written below is what was reported back, and nothing here was observed by the tool that wrote it.

`session_user` and `database` are absent on purpose. In a record written by `tools/apply-migration.mjs` they are answers the SERVER gave to a query, and this tool spoke to no server, so it has no honest value for either. The absence is the signal.

## Authorisation

- Ledger entry: `docs/prompt-ledger/entries/0179-ideacad-document-sharing.md`
- `Migration permitted: exactly one. Claims: 0205. Highest landed migration at issue: 0203`
- Written on `claude/great-bell-ppysbn`.
- Recorded, later and separately, by ledger `0197`. That bundle did not write this migration and did not apply it.

## What was reported back

**No verification output was supplied.** The whole of the evidence is the report that the file was pasted and applied. This record says the migration is live; it does not say that any object the file names was seen afterwards.

No verification query was reported for this file individually. What is on record is Mr. Pina's report, relayed through the ledger 0197 prompt on 2026-09-13, that every migration from `0193` through `0210` was pasted into the Supabase SQL editor and applied. `0209` and `0210` are the two he verified with a query, and their records carry it; this one does not.

## What a verification query would cover

Derived locally by `tools/record-applied.mjs --query`, and never run from here:

- object table public.ideacad_grants

## What this record does not prove

That the migration was a good idea, that a backfill inside it did the right thing, or that the database still holds what it held on the day above. It is one person's report, written down where the next session can find it instead of nowhere.
