---
migration: "0225"
file: 0225_classroom_team_edits_and_class_themes.sql
sha256: b00971e3a1e0a845ece8933e2c9966e9279b15a39e1649be4853ad19f74e0d1b
sha256_covers: repo bytes at commit a8881227fd13fc9e1e7b80aa9073c339d575f40c
applied_at: 2026-09-29
recorded_at: 2026-09-29T02:55:22.952Z
source: report
attested_by: Mr. Pina
evidence: report-only
ledger: "0347"
recorded_by_ledger: "0347"
branch: claude/quirky-pascal-zwy3zd
commit: a8881227fd13fc9e1e7b80aa9073c339d575f40c
outcome: reported
---

# 0225 applied by hand

**This record rests on Mr. Pina's report of 2026-09-29, not on a measurement made by this repository.** No process in this repository has ever connected to the production database. `0225_classroom_team_edits_and_class_themes.sql` was pasted into the Supabase SQL editor by hand; what is written below is what was reported back, and nothing here was observed by the tool that wrote it.

`session_user` and `database` are absent on purpose. In a record written by `tools/apply-migration.mjs` they are answers the SERVER gave to a query, and this tool spoke to no server, so it has no honest value for either. The absence is the signal.

## Authorisation

- Ledger entry: `docs/prompt-ledger/entries/0347-feedback-2026-09-28-round-1.md`
- `Migration permitted: yes, exactly one. Claims: 0225. Highest on origin/main at issue: 0224. Not this entry's: 0228 and 0229 (the 2026-09-25 proposals). The brief named 0230; the session renumbered it to 0225, which `tools/migration-claims.mjs` reported as next free, because 0230 left 0225, 0228 and 0229 as holes nothing claims and `tests/db/migration-0177-tombstone.test.ts` refuses an unexplained hole.`
- Written on `claude/quirky-pascal-zwy3zd`.
- Recorded by ledger `0347`, the same bundle that wrote this migration; it did not apply it.

## What was reported back

**No verification output was supplied.** The whole of the evidence is the report that the file was pasted and applied. This record says the migration is live; it does not say that any object the file names was seen afterwards.

## What a verification query would cover

Derived locally by `tools/record-applied.mjs --query`, and never run from here:

- object column public.classroom_team_sets.edited_at

## What this record does not prove

That the migration was a good idea, that a backfill inside it did the right thing, or that the database still holds what it held on the day above. It is one person's report, written down where the next session can find it instead of nowhere.
