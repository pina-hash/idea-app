---
migration: "0224"
file: 0224_maps_wall_thickness.sql
sha256: e7a21eb88114706ed410adff140416ac3df33c0c5a460139a987c9cfbfd8e93e
sha256_covers: repo bytes at commit 2f26af4fb3b72a309da50c954aa806ea17d63713
applied_at: 2026-09-22
recorded_at: 2026-09-22T22:12:01.881Z
source: report
attested_by: Mr. Pina
evidence: verification-output
ledger: "0294"
recorded_by_ledger: "0295"
branch: claude/new-session-ow0i42
commit: 2f26af4fb3b72a309da50c954aa806ea17d63713
outcome: applied
---

# 0224 applied by hand

**This record rests on Mr. Pina's report of 2026-09-22, not on a measurement made by this repository.** No process in this repository has ever connected to the production database. `0224_maps_wall_thickness.sql` was pasted into the Supabase SQL editor by hand; what is written below is what was reported back, and nothing here was observed by the tool that wrote it.

`session_user` and `database` are absent on purpose. In a record written by `tools/apply-migration.mjs` they are answers the SERVER gave to a query, and this tool spoke to no server, so it has no honest value for either. The absence is the signal.

## Authorisation

- Ledger entry: `docs/prompt-ledger/entries/0294-maps-wall-thickness.md`
- `Migration permitted: yes, exactly one. Claims: 0224. Highest landed at issue: 0217. Confirmed free with `node tools/migration-claims.mjs` before the first commit.`
- Written on `claude/new-session-ow0i42`.
- Recorded, later and separately, by ledger `0295`. That bundle did not write this migration and did not apply it.

## What was reported back

As supplied to this tool, with anything shaped like a connection string masked. The values are reproduced and NOT interpreted: whether a particular `false` is a pass or a failure is a question about the query that produced it, and this tool did not write that query and did not run it.

```
examined,ok
column: maps_nodes.wall_thickness_in,true
column: maps_nodes.default_wall_thickness_in,true
constraint: maps_nodes_wall_thickness_shape,true
constraint: maps_nodes_default_wall_thickness_shape,true
constraint: maps_nodes_compartment_no_wall,true
predicate: null is accepted (no answer is legal),true
"predicate: 0 is accepted (a drawn line, decision 36)",true
predicate: 5.5 is accepted,true
predicate: -1 is refused,true
predicate: NaN is refused (numeric sorts NaN ABOVE every value),true
predicate: Infinity is refused,true
predicate: -Infinity is refused,true
no backfill: no row carries a thickness this file did not write,true
no backfill: every row still carries the outline it carried,true
compartments carry no wall,true
untouched: _maps_outline_ok still exists at its 0161 arity,true
untouched: _maps_outline_ok says nothing about thickness,true
promotion: maps_publish would carry wall_thickness_in,true
promotion: maps_publish would carry default_wall_thickness_in,true
grant: anon CANNOT execute _maps_wall_thickness_ok,true
POSITIVE CONTROL -- grant: authenticated CAN execute _maps_wall_thickness_ok,true
```

## What a verification query would cover

No probe could be derived for this file, so this record names no object list. `tools/idea-status.py` derives a probe from a migration's FIRST object and answers nothing for some shapes; that is a limit of the derivation and not a claim about the file.

## What this record does not prove

That the migration was a good idea, that a backfill inside it did the right thing, or that the database still holds what it held on the day above. It is one person's report, written down where the next session can find it instead of nowhere.
