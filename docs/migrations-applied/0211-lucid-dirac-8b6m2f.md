---
migration: "0211"
file: 0211_ideacad_realtime_policy.sql
sha256: 6d01a93b50389e8d661e2734977573fbc32904646c531f95bc71df4a3473ab92
sha256_covers: repo bytes at commit 78516fa2e6ac3ae53b823157585f63b214cb5f06
applied_at: 2026-09-13
recorded_at: 2026-09-13T04:43:16.827Z
source: report
attested_by: Mr. Pina
evidence: verification-output
ledger: "0203"
recorded_by_ledger: "0204"
branch: claude/lucid-dirac-8b6m2f
commit: 78516fa2e6ac3ae53b823157585f63b214cb5f06
outcome: applied
---

# 0211 applied by hand

**This record rests on Mr. Pina's report of 2026-09-13, not on a measurement made by this repository.** No process in this repository has ever connected to the production database. `0211_ideacad_realtime_policy.sql` was pasted into the Supabase SQL editor by hand; what is written below is what was reported back, and nothing here was observed by the tool that wrote it.

`session_user` and `database` are absent on purpose. In a record written by `tools/apply-migration.mjs` they are answers the SERVER gave to a query, and this tool spoke to no server, so it has no honest value for either. The absence is the signal.

## Authorisation

- Ledger entry: `docs/prompt-ledger/entries/0203-ideacad-private-realtime.md`
- `Migration permitted: yes. **Claims: 0211**, allocated by the prompt rather than taken as the next free number. `0193` through `0210` are all applied to production and verified; the chain on `integration` ends at `0210`.`
- Written on `claude/lucid-dirac-8b6m2f`.
- Recorded, later and separately, by ledger `0204`. That bundle did not write this migration and did not apply it.

## What was reported back

As supplied to this tool, with anything shaped like a connection string masked. The values are reproduced and NOT interpreted: whether a particular `false` is a pass or a failure is a question about the query that produced it, and this tool did not write that query and did not run it.

```
Part B of supabase/data/0203-ideacad-realtime-verification.sql, run by Mr. Pina
in the Supabase SQL editor after pasting 0211_ideacad_realtime_policy.sql.
Reported result, one row per function, anon then authenticated:

  _ideacad_realtime_can_read(text)          anon false   authenticated true
  _ideacad_realtime_can_send(text)          anon false   authenticated true
  _ideacad_realtime_topic_id(text, text)    anon false   authenticated false

Relayed to this tool through the ledger 0204 prompt rather than pasted
directly, so the wording above is his report of the rows and not a capture of
the editor's own output.

PART C RETURNED NO COMPARISON. It reported "NO DOCUMENT EXAMINED": the block
selects a document out of ideacad_documents to test the policy against, and
that table holds zero rows in production. No behavioural check of the policies
ran, in either direction.
```

THIS RECORD IS NARROWER THAN `0209`'S AND `0210`'S, AND THE DIFFERENCE IS THE WHOLE POINT OF READING IT. What part B proves is EXISTENCE AND ACL: the three functions are in the catalog and each is granted to exactly the roles `0211` names, with `_ideacad_realtime_topic_id` withheld from `authenticated` as the owner-only split requires. That is what `outcome: applied` asserts here and it is all it asserts.

**No behavioural verification of these policies exists on production.** Part C is the half that would put a real topic to `_ideacad_realtime_can_read` and `_ideacad_realtime_can_send` and compare the answers across identities. It selected no document -- `ideacad_documents` holds zero rows in production -- and returned `NO DOCUMENT EXAMINED` instead of a verdict.

**AND IT COULD NOT HAVE PASSED EVEN IF IT HAD FOUND ONE.** Ledger `0204` rewrote part C and found two defects in it that had nothing to do with `0211`. It signed its subjects in by the claim's `email`, but `current_user_email()` ignores that key entirely and resolves `auth.uid()` -- the claim's `sub` -- against `auth.users`, so every caller was anonymous and all eight answers were false; the ladder reads that as `FAIL -- REFUSING THE OWNER`, an accusation against this migration for a fault inside the verification file. And it reported through `raise notice`, which the Supabase SQL editor does not display, so a correct run and a skipped one looked identical. Both are fixed, and the corrected probe answers `PASS -- ENFORCING` against the real migration chain on an embedded Postgres: the owner reads and sends, a signed-out stranger and a signed-in classmate with no grant both get nothing.

So the honest summary is: **the objects and grants are proven on production; the policies are proven only on a test database.** The production half stays open until a document exists there, which needs a deploy -- see `docs/audits/2026-09-13-vercel-deploy-throttle.md`.

## What a verification query would cover

No probe could be derived for this file, so this record names no object list. `tools/idea-status.py` derives a probe from a migration's FIRST object and answers nothing for some shapes; that is a limit of the derivation and not a claim about the file.

## What this record does not prove

That the migration was a good idea, that a backfill inside it did the right thing, or that the database still holds what it held on the day above. It is one person's report, written down where the next session can find it instead of nowhere.
