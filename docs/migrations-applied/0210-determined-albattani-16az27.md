---
migration: "0210"
file: 0210_notebook_note_grid.sql
sha256: 550f55974f34ead9e36815e3afe636bcf17bec349ddefcf0d4a74c11c4e712e6
sha256_covers: repo bytes at commit 2a57b7f45a87088002961ad569a1b99e3227ba9c
applied_at: 2026-09-13
recorded_at: 2026-09-13T12:49:25.058Z
source: report
attested_by: Mr. Pina
evidence: verification-output
ledger: "0192"
recorded_by_ledger: "0225"
branch: claude/determined-albattani-16az27
commit: 2a57b7f45a87088002961ad569a1b99e3227ba9c
outcome: applied
---

# 0210 applied by hand

**This record rests on Mr. Pina's report of 2026-09-13, not on a measurement made by this repository.** No process in this repository has ever connected to the production database. `0210_notebook_note_grid.sql` was pasted into the Supabase SQL editor by hand; what is written below is what was reported back, and nothing here was observed by the tool that wrote it.

`session_user` and `database` are absent on purpose. In a record written by `tools/apply-migration.mjs` they are answers the SERVER gave to a query, and this tool spoke to no server, so it has no honest value for either. The absence is the signal.

## Authorisation

- Ledger entry: `docs/prompt-ledger/entries/0192-notebook-grid-gate-and-node.md`
- `Migration permitted: exactly one. Claims: 0210. Highest on origin/main at issue: 0208`
- Written on `claude/determined-albattani-16az27`.
- Recorded, later and separately, by ledger `0225`. That bundle did not write this migration and did not apply it.

## What was reported back

As supplied to this tool, with anything shaped like a connection string masked. The values are reproduced and NOT interpreted: whether a particular `false` is a pass or a failure is a question about the query that produced it, and this tool did not write that query and did not run it.

```
Verification query run by Mr. Pina in the Supabase SQL editor after pasting
0210_notebook_note_grid.sql. Reported result:

  716 notes
  0 with a grid
  grid_only_note_ok        true
  empty_grid_note_ok       false
  control_paragraph_ok     true
  anon_holds_the_helper    false

Relayed to this tool through the ledger 0197 prompt rather than pasted
directly, so the wording above is his report of the rows and not a capture of
the editor's own output.
```

This record was rewritten by ledger 0225 on 2026-09-13. The file's bytes changed after this record was first written: commit e8c6d805 (Sep 13, 10:53:36 UTC), landed on this branch about nine hours after the original record, edited one line inside a -- SQL comment, rewriting the literal path $lib/server/rich-text-normalize.ts to src/lib/server/rich-text-normalize.ts so a reader in the SQL editor could actually open it. The change was confined to that comment; no SQL statement was altered. The database was not re-applied -- the migration that is live in production is the same migration as before, byte-for-byte in every statement. This record is being rewritten only so the recorded sha256 describes the file that is actually in the repo today, not because anything about what was applied to production has changed.

## What a verification query would cover

Derived locally by `tools/record-applied.mjs --query`, and never run from here:

- object function public._notebook_note_grid_len

## What this record does not prove

That the migration was a good idea, that a backfill inside it did the right thing, or that the database still holds what it held on the day above. It is one person's report, written down where the next session can find it instead of nowhere.
