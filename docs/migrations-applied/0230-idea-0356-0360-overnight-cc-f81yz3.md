---
migration: "0230"
file: 0230_quick_posts_foundry_and_feedback_horizon.sql
sha256: b691236c3e1326286bbfba2e9997db8264fb6c9b1877821befff302383d24832
sha256_covers: repo bytes at commit eb595a15c17bb70cb1c789c7fa9a50fdcc8875bf
applied_at: 2026-10-06
recorded_at: 2026-10-08T21:52:53.009Z
source: report
attested_by: the Migrate workflow's production catalog probe (run 37484392652)
evidence: verification-output
ledger: "0360"
recorded_by_ledger: "0376"
branch: claude/idea-0356-0360-overnight-cc-f81yz3
commit: eb595a15c17bb70cb1c789c7fa9a50fdcc8875bf
outcome: applied
---

# 0230 applied by hand

**This record rests on the Migrate workflow's production catalog probe (run 37484392652)'s report of 2026-10-06, not on a measurement made by this repository.** No process in this repository has ever connected to the production database. `0230_quick_posts_foundry_and_feedback_horizon.sql` was pasted into the Supabase SQL editor by hand; what is written below is what was reported back, and nothing here was observed by the tool that wrote it.

`session_user` and `database` are absent on purpose. In a record written by `tools/apply-migration.mjs` they are answers the SERVER gave to a query, and this tool spoke to no server, so it has no honest value for either. The absence is the signal.

## Authorisation

- Ledger entry: `docs/prompt-ledger/entries/0360-feedback-2026-10-01-overnight.md`
- `Migration permitted: yes, 0230 only. Claims: 0230, 0228, 0229. 0228 and 0229 are reserved for decisions 37 and 38 and are not taken by this entry; they are named here only so `tests/db/migration-0177-tombstone.test.ts` reads them as accounted for rather than as holes. Highest on origin/main at issue: 0225.`
- Written on `claude/idea-0356-0360-overnight-cc-f81yz3`.
- Recorded, later and separately, by ledger `0376`. That bundle did not write this migration and did not apply it.

## What was reported back

As supplied to this tool, with anything shaped like a connection string masked. The values are reproduced and NOT interpreted: whether a particular `false` is a pass or a failure is a question about the query that produced it, and this tool did not write that query and did not run it.

```
From the log of the Migrate workflow, run 37484392652 (job 112340572105),
2026-10-06T15:06:58Z, tools/apply-migration.mjs reading production's own
pg_catalog before it refused 0231 for an unrelated reason:

    0230  APPLIED      table public.classroom_quick_posts
    0230  APPLIED      function public.app_feedback_admin_list carries 0230's body
    0230  APPLIED      function public.app_feedback_submit carries 0230's body
    0230  APPLIED      function public.foundry_section_access carries 0230's body
    0231  NOT APPLIED  type public.armory_member_role
```

0230 was pasted into the SQL editor by hand on a date no record in this repository holds. applied_at is the date of the earliest measurement that saw it applied (the probe lines above, read from production's own pg_catalog), not the date of the paste. Recorded by ledger 0376 because its absence had turned main's CI red.

## What a verification query would cover

Derived locally by `tools/record-applied.mjs --query`, and never run from here:

- object table public.classroom_quick_posts

## What this record does not prove

That the migration was a good idea, that a backfill inside it did the right thing, or that the database still holds what it held on the day above. It is one person's report, written down where the next session can find it instead of nowhere.
