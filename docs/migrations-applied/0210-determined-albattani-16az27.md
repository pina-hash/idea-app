---
migration: "0210"
file: 0210_notebook_note_grid.sql
sha256: 48a4ad209f32803539dc90bdfc62090d2e53c655fde9366e798ab14598c28bab
sha256_covers: repo bytes at commit f4616dcab08d20d2260791110f90bf50ebdbbb71
applied_at: 2026-09-13
recorded_at: 2026-09-13T01:33:45.534Z
source: report
attested_by: Mr. Pina
evidence: verification-output
ledger: "0192"
recorded_by_ledger: "0197"
branch: claude/determined-albattani-16az27
commit: f4616dcab08d20d2260791110f90bf50ebdbbb71
outcome: applied
---

# 0210 applied by hand

**This record rests on Mr. Pina's report of 2026-09-13, not on a measurement made by this repository.** No process in this repository has ever connected to the production database. `0210_notebook_note_grid.sql` was pasted into the Supabase SQL editor by hand; what is written below is what was reported back, and nothing here was observed by the tool that wrote it.

`session_user` and `database` are absent on purpose. In a record written by `tools/apply-migration.mjs` they are answers the SERVER gave to a query, and this tool spoke to no server, so it has no honest value for either. The absence is the signal.

## Authorisation

- Ledger entry: `docs/prompt-ledger/entries/0192-notebook-grid-gate-and-node.md`
- `Migration permitted: exactly one. Claims: 0210.`
- Written on `claude/determined-albattani-16az27`.
- Recorded, later and separately, by ledger `0197`. That bundle did not write this migration and did not apply it.

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

## What a verification query would cover

No probe could be derived for this file, so this record names no object list. `tools/idea-status.py` derives a probe from a migration's FIRST object and answers nothing for some shapes; that is a limit of the derivation and not a claim about the file.

## What this record does not prove

That the migration was a good idea, that a backfill inside it did the right thing, or that the database still holds what it held on the day above. It is one person's report, written down where the next session can find it instead of nowhere.
