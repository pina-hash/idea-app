---
migration: "0221"
file: 0221_foundry_boards_and_author_profile.sql
sha256: c98c8755f751c3fa3aa0685c88a1cf5f3eda990980d340ec091a8ae07c0f72f7
sha256_covers: repo bytes at commit 2f26af4fb3b72a309da50c954aa806ea17d63713
applied_at: 2026-09-22
recorded_at: 2026-09-22T22:10:33.605Z
source: report
attested_by: Mr. Pina
evidence: verification-output
ledger: "0290"
recorded_by_ledger: "0295"
branch: claude/new-session-dsdncq
commit: 2f26af4fb3b72a309da50c954aa806ea17d63713
outcome: applied
---

# 0221 applied by hand

**This record rests on Mr. Pina's report of 2026-09-22, not on a measurement made by this repository.** No process in this repository has ever connected to the production database. `0221_foundry_boards_and_author_profile.sql` was pasted into the Supabase SQL editor by hand; what is written below is what was reported back, and nothing here was observed by the tool that wrote it.

`session_user` and `database` are absent on purpose. In a record written by `tools/apply-migration.mjs` they are answers the SERVER gave to a query, and this tool spoke to no server, so it has no honest value for either. The absence is the signal.

## Authorisation

- Ledger entry: `docs/prompt-ledger/entries/0290-foundry-boards-profiles-search-mobile.md`
- `Migration permitted: yes, exactly one. Claims: 0221. Confirmed free with `node tools/migration-claims.mjs` at issue (highest landed 0217; 0218 held by two other lanes; 0219, 0220, 0221 unclaimed) and by the absence of any `supabase/migrations/0221*` file. Highest on origin/main at issue: 0217`
- Written on `claude/new-session-dsdncq`.
- Recorded, later and separately, by ledger `0295`. That bundle did not write this migration and did not apply it.

## What was reported back

As supplied to this tool, with anything shaped like a connection string masked. The values are reproduced and NOT interpreted: whether a particular `false` is a pass or a failure is a question about the query that produced it, and this tool did not write that query and did not run it.

```
examined,ready
"function exists: foundry_play_counts(boolean,boolean)",true
function exists: foundry_author_profile(uuid),true
exactly one foundry_play_counts overload (the drop held),true
exactly one foundry_author_profile overload,true
column added: foundry_play_counts projects seconds_played,true
column added: foundry_play_counts projects plays_prev_7d,true
column KEPT: foundry_play_counts still projects plays_7d,true
column REFUSED: foundry_play_counts has no cross-app players count,true
author card reads no address: foundry_author_profile never names an email column,true
author card reads no section_id,true
author card is gated on the population predicate,true
grant: authenticated CAN execute both new functions,true
grant: anon can execute NEITHER of them,true
grant: service_role holds neither (nothing server-side reads plays),true
UNTOUCHED: student_app_plays still answers no client role directly,true
"POSITIVE CONTROL -- app_short_link_target IS anon-executable, so this query can see a grant at all",true
```

## What a verification query would cover

No probe could be derived for this file, so this record names no object list. `tools/idea-status.py` derives a probe from a migration's FIRST object and answers nothing for some shapes; that is a limit of the derivation and not a claim about the file.

## What this record does not prove

That the migration was a good idea, that a backfill inside it did the right thing, or that the database still holds what it held on the day above. It is one person's report, written down where the next session can find it instead of nowhere.
