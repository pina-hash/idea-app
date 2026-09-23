---
migration: "0223"
file: 0223_classroom_teams.sql
sha256: 19acd2c917807ab8f5a5b6656b96d7540254aaed8ab855d383f80c6244e58321
sha256_covers: repo bytes at commit 2f26af4fb3b72a309da50c954aa806ea17d63713
applied_at: 2026-09-22
recorded_at: 2026-09-22T22:11:17.758Z
source: report
attested_by: Mr. Pina
evidence: verification-output
ledger: "0293"
recorded_by_ledger: "0295"
branch: claude/intelligent-bardeen-4quab4
commit: 2f26af4fb3b72a309da50c954aa806ea17d63713
outcome: applied
---

# 0223 applied by hand

**This record rests on Mr. Pina's report of 2026-09-22, not on a measurement made by this repository.** No process in this repository has ever connected to the production database. `0223_classroom_teams.sql` was pasted into the Supabase SQL editor by hand; what is written below is what was reported back, and nothing here was observed by the tool that wrote it.

`session_user` and `database` are absent on purpose. In a record written by `tools/apply-migration.mjs` they are answers the SERVER gave to a query, and this tool spoke to no server, so it has no honest value for either. The absence is the signal.

## Authorisation

- Ledger entry: `docs/prompt-ledger/entries/0293-classroom-teams.md`
- `Migration permitted: yes, exactly one. Claims: 0223. Highest landed on origin/main at issue: 0217. Confirmed absent from BOTH the claimed and the hole lists with `node tools/migration-claims.mjs` before the claim. **`next free` read 0219; the prompt said "Use 0223 and no other number",** which leaves 0219 through 0222 as holes this branch does not account for. They are sibling lanes' to claim, and `tests/db/migration-0177-tombstone.test.ts` is red here until they push. Renumbering was rejected: it would break an explicit instruction and risk contesting a number another lane was given.`
- Written on `claude/intelligent-bardeen-4quab4`.
- Recorded, later and separately, by ledger `0295`. That bundle did not write this migration and did not apply it.

## What was reported back

As supplied to this tool, with anything shaped like a connection string masked. The values are reproduced and NOT interpreted: whether a particular `false` is a pass or a failure is a question about the query that produced it, and this tool did not write that query and did not run it.

```
ord,check_name,examined,finding,expected,verdict
1,table deny-all,public.classroom_team_members,rls=on policies=0 anon=none authenticated=none,rls=on policies=0 anon=none authenticated=none,OK
1,table deny-all,public.classroom_team_sets,rls=on policies=0 anon=none authenticated=none,rls=on policies=0 anon=none authenticated=none,OK
1,table deny-all,public.classroom_teams,rls=on policies=0 anon=none authenticated=none,rls=on policies=0 anon=none authenticated=none,OK
2,granted to authenticated only,public.classroom_archive_team_set(uuid),anon=no authenticated=yes,anon=no authenticated=yes,OK
2,granted to authenticated only,"public.classroom_post_team_set(uuid, timestamptz)",anon=no authenticated=yes,anon=no authenticated=yes,OK
2,granted to authenticated only,"public.classroom_save_team_set(uuid, text, bigint, text, integer, jsonb)",anon=no authenticated=yes,anon=no authenticated=yes,OK
2,granted to authenticated only,"public.classroom_set_team_style(uuid, text, text, text, jsonb, text, text, text)",anon=no authenticated=yes,anon=no authenticated=yes,OK
2,granted to authenticated only,public.classroom_team_board(uuid),anon=no authenticated=yes,anon=no authenticated=yes,OK
2,granted to authenticated only,public.classroom_unpost_team_set(uuid),anon=no authenticated=yes,anon=no authenticated=yes,OK
3,"private predicate, no client role","public._classroom_team_member(uuid, text)",anon=no authenticated=no,anon=no authenticated=no,OK
3,"private predicate, no client role",public._classroom_team_set_visible(uuid),anon=no authenticated=no,anon=no authenticated=no,OK
9,POSITIVE CONTROL -- a deliberate public surface,"public.gauntlet_macro_start(text, numeric)",anon=yes authenticated=yes,anon=yes authenticated=yes,OK
```

## What a verification query would cover

No probe could be derived for this file, so this record names no object list. `tools/idea-status.py` derives a probe from a migration's FIRST object and answers nothing for some shapes; that is a limit of the derivation and not a claim about the file.

## What this record does not prove

That the migration was a good idea, that a backfill inside it did the right thing, or that the database still holds what it held on the day above. It is one person's report, written down where the next session can find it instead of nowhere.
