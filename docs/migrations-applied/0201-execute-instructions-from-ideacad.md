---
migration: "0201"
file: 0201_ideacad_blade_editor.sql
sha256: 6723b941225bc846bbc58ad477ecd9ac4f40262ddaab848b7184cf43e8a4c47a
sha256_covers: repo bytes at commit f4616dcab08d20d2260791110f90bf50ebdbbb71
applied_at: 2026-09-13
recorded_at: 2026-09-13T01:32:27.907Z
source: report
attested_by: Mr. Pina
evidence: report-only
ledger: "0145"
recorded_by_ledger: "0197"
branch: codex/execute-instructions-from-ideacad.md
commit: f4616dcab08d20d2260791110f90bf50ebdbbb71
outcome: reported
---

# 0201 applied by hand

**This record rests on Mr. Pina's report of 2026-09-13, not on a measurement made by this repository.** No process in this repository has ever connected to the production database. `0201_ideacad_blade_editor.sql` was pasted into the Supabase SQL editor by hand; what is written below is what was reported back, and nothing here was observed by the tool that wrote it.

`session_user` and `database` are absent on purpose. In a record written by `tools/apply-migration.mjs` they are answers the SERVER gave to a query, and this tool spoke to no server, so it has no honest value for either. The absence is the signal.

## Authorisation

- Ledger entry: `docs/prompt-ledger/entries/0145-ideacad-blade-editor.md`
- `Migration permitted: exactly one, 0201.`
- Written on `codex/execute-instructions-from-ideacad.md`.
- Recorded, later and separately, by ledger `0197`. That bundle did not write this migration and did not apply it.

## What was reported back

**No verification output was supplied.** The whole of the evidence is the report that the file was pasted and applied. This record says the migration is live; it does not say that any object the file names was seen afterwards.

No verification query was reported for this file individually. What is on record is Mr. Pina's report, relayed through the ledger 0197 prompt on 2026-09-13, that every migration from `0193` through `0210` was pasted into the Supabase SQL editor and applied. `0209` and `0210` are the two he verified with a query, and their records carry it; this one does not. The ledger entry names no `claude/**` branch: 0145 ran as a Codex task and its `Branch:` line describes the environment's `work` checkout. The branch above is the one that actually carried the file, read off the merge that brought it in (`87ba98a3`, pull request #92).

## What a verification query would cover

Derived locally by `tools/record-applied.mjs --query`, and never run from here:

- object constraint classroom_items_assignment_schema_version_check on public.classroom_items

## What this record does not prove

That the migration was a good idea, that a backfill inside it did the right thing, or that the database still holds what it held on the day above. It is one person's report, written down where the next session can find it instead of nowhere.
