---
migration: "0194"
file: 0194_gauntlet_verification_floor.sql
sha256: feb2c63a4dc29d9b2fe2ab229a68e536cd374f9d57d238f711cc587b8c3e59cb
sha256_covers: repo bytes at commit f4616dcab08d20d2260791110f90bf50ebdbbb71
applied_at: 2026-09-13
recorded_at: 2026-09-13T01:33:09.098Z
source: report
attested_by: Mr. Pina
evidence: report-only
ledger: "0120"
recorded_by_ledger: "0197"
branch: claude/gauntlet-verification-floor-oclq47
commit: f4616dcab08d20d2260791110f90bf50ebdbbb71
outcome: reported
---

# 0194 applied by hand

**This record rests on Mr. Pina's report of 2026-09-13, not on a measurement made by this repository.** No process in this repository has ever connected to the production database. `0194_gauntlet_verification_floor.sql` was pasted into the Supabase SQL editor by hand; what is written below is what was reported back, and nothing here was observed by the tool that wrote it.

`session_user` and `database` are absent on purpose. In a record written by `tools/apply-migration.mjs` they are answers the SERVER gave to a query, and this tool spoke to no server, so it has no honest value for either. The absence is the signal.

## Authorisation

- Ledger entry: `docs/prompt-ledger/entries/0120-gauntlet-verification-floor.md`
- `Migration permitted: exactly one. Claims: 0194.`
- Written on `claude/gauntlet-verification-floor-oclq47`.
- Recorded, later and separately, by ledger `0197`. That bundle did not write this migration and did not apply it.

## What was reported back

**No verification output was supplied.** The whole of the evidence is the report that the file was pasted and applied. This record says the migration is live; it does not say that any object the file names was seen afterwards.

No verification query was reported for this file individually. What is on record is Mr. Pina's report, relayed through the ledger 0197 prompt on 2026-09-13, that every migration from `0193` through `0210` was pasted into the Supabase SQL editor and applied. `0209` and `0210` are the two he verified with a query, and their records carry it; this one does not. A SECOND, EARLIER ATTESTATION EXISTS for this file and is not this bundle's: `docs/prompt-ledger/entries/0140-land-integration-deploy-gate.md` reads "`0193`, `0194`, `0195`, `0196`, `0197`. All five are hand-applied to production and reported verified", with that session's own caveat that it verified none of the values itself. `0142-html-assignment-progress.md` says the same in one line. Both are reports, like this one.

## What a verification query would cover

Derived locally by `tools/record-applied.mjs --query`, and never run from here:

- object table public.gauntlet_rank_settings

## What this record does not prove

That the migration was a good idea, that a backfill inside it did the right thing, or that the database still holds what it held on the day above. It is one person's report, written down where the next session can find it instead of nowhere.
