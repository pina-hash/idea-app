---
title: "Applied records for 0212, 0213 and 0214 from Mr. Pina's catalog probe, and a re-record of 0210 whose recorded hash went stale under a comment-only edit (`claude/sweet-knuth-1no6mh`, ledger 0225)"
date: 2026-09-13
branches: [claude/sweet-knuth-1no6mh]
migrations: ["0212", "0213", "0214", "0210"]
subsystems: ["Repo workflow", "Database"]
---

This bundle writes the three `docs/migrations-applied/` records
`claude/blissful-bohr-79y23g`'s own history entry named as the outstanding
finding on migrations `0212`, `0213` and `0214`, and re-records `0210` after a
comment-only edit moved its file's bytes out from under an already-written
record. It applies nothing: no process in this container has ever reached the
production database, and none was attempted here.

## Starting point

The harness assigned `claude/sweet-knuth-1no6mh`, which was reset onto
`origin/claude/blissful-bohr-79y23g` (`2a57b7f4`) rather than
`origin/integration`, because only that branch carries the three migration
files `tools/record-applied.mjs` needs to resolve a migration number to a
file. `tests/db/migrations-applied-record.test.ts` was failing on that branch
on two independent assertions, as its own history entry documented: line 243
for the three missing records, line 256 for `0210`'s stale hash. Both failures
propagate to every branch integration cuts, which is why two other lanes were
building against red CI.

## Phase 1: 0212, 0213, 0214

Mr. Pina ran the read-only catalog probe in the Supabase SQL editor on
2026-09-13 and reported six rows, all `applied: true`, split three ways by
migration number:

- `0212` -- `public._tournament_award` pays through `_coin_insert`, and the new
  `public.tournament_reset_match`.
- `0213` -- `public.classroom_remove_enrollment`'s census now reads
  `ideacad_documents`.
- `0214` -- the new `public._ideacad_document_archived`,
  `public.ideacad_archive`, and the new table `public.ideacad_section_grants`.

Each subset (header plus only that migration's rows, taken verbatim from the
pasted table with no retyping) was handed to
`tools/record-applied.mjs <nnnn> --by "Alejandro Pina" --on 2026-09-13
--evidence - --recorded-by 0225 --note "..."`. The tool's own
`authorisingEntry` resolved the authorising ledger and source branch for each
number by walking every ref for a `Migration permitted: ... Claims: <nnnn>`
line, with no `--ledger`/`--branch` override needed:

| migration | ledger | source branch | record |
| --- | --- | --- | --- |
| 0212 | 0207 | `claude/busy-feynman-aupq55` | `docs/migrations-applied/0212-busy-feynman-aupq55.md` |
| 0213 | 0212 | `claude/sharp-einstein-cqrnx6` | `docs/migrations-applied/0213-sharp-einstein-cqrnx6.md` |
| 0214 | 0218 | `claude/youthful-lovelace-kg9482` | `docs/migrations-applied/0214-youthful-lovelace-kg9482.md` |

Each record notes, in its own body, that the evidence table was written by
hand by the router chat rather than pasted from the tool's own `--query`
output, because `verificationQuery` refuses to derive a probe for a migration
whose file sits only on a branch (`tools/idea-status.py` derives probes from
`origin/main`, and these three files were not there yet) -- and that this is
exactly what the tool's own refusal message directs a caller to do.

## Phase 2: the 0210 record that went stale

`docs/migrations-applied/0210-determined-albattani-16az27.md` recorded
`sha256: 48a4ad20...` for `supabase/migrations/0210_notebook_note_grid.sql`,
covering "repo bytes at commit `f4616dca`". The file in this tree now hashes
to `550f5597...` -- confirmed directly with `sha256sum` before touching
anything.

**The cause is a trap that will recur, so it is written down here in full.**
Commit `e8c6d805` ("Check the migration against the SQL paste trap, and write
the real path"), landed about nine hours after the record was written, edited
exactly one line inside a `--` SQL comment in `0210_notebook_note_grid.sql`:

```
--- `notebook_entry_notes.content` is `$lib/server/rich-text-normalize.ts`, a
+++ `notebook_entry_notes.content` is `src/lib/server/rich-text-normalize.ts`, a
```

It rewrote a `$lib/...` path alias as the real `src/lib/...` path, to satisfy
`CLAUDE.md`'s rule against a bare `$` in a migration comment (the dollar-quote
paste trap that cost `0194` a full apply cycle). Read with `git show e8c6d805
-- supabase/migrations/0210_notebook_note_grid.sql` (not a filtered diff --
this repository's own `CLAUDE.md` warns that a diff filter dropping lines
matching three leading `+`/`-` characters eats a removed SQL comment, because
`- --` reads as a diff header; `git show` was read directly instead): the diff
is exactly one changed line, both the removed and added forms begin with `-- `,
and no SQL statement moved. **The edit is comment-only.**

`0210` was already applied when that edit landed. The database was never
re-applied, so what is live in production is byte-identical to `0210` before
and after `e8c6d805` in every statement that runs -- only a comment, read by
nobody but a human in the SQL editor, changed. But the repository's *record* of
what was applied is keyed on the file's bytes as a whole, comment included, so
the record went stale the moment the comment changed, independent of whether
the database did.

The record was rewritten with `--force`, keeping the original attestation
(`Mr. Pina`, `2026-09-13`) and the original verification evidence
byte-for-byte, adding a note stating in plain words: the file's bytes changed
after the record was written; the change was confined to a comment; no SQL
statement was altered; the database was not re-applied; the record is being
rewritten only so the recorded hash describes the file that is actually in the
repository today. The new record's `sha256` (`550f5597...`) matches the
current file.

**The general lesson, for the next session that hits this:** the
immutable-applied-record rule in `CLAUDE.md` holds even for a comment-only
edit to an already-applied migration file, because the applied record's hash
covers the whole file and not just its executable statements. A rule fixing
one trap (bare `$` in a comment breaking the SQL editor's paste) can silently
spring a different one (an applied-record hash going stale) if the file it
touches has already been recorded as applied. Before editing any already-applied
migration file for any reason -- even a comment -- check
`docs/migrations-applied/` for a record naming it, and re-record deliberately
rather than let the hash drift unnoticed.

## Verified

- `npx vitest run tests/db/migrations-applied-record.test.ts --no-file-parallelism`:
  **23 passed, 0 failed.** Both previously-failing assertions --
  "has a record for every migration from 0193 onward, and no gaps" (the
  0212-0214 gap) and "every record names a migration file that exists, and
  hashes it correctly" (the 0210 stale hash) -- are in the passing set.
- `npm test`, foreground, full run: see the report for the exact pass/fail
  counts against the `2 failed / 9056 passed (9058)` baseline this branch
  carried in from `claude/blissful-bohr-79y23g`'s own history entry.
- `git show e8c6d805 -- supabase/migrations/0210_notebook_note_grid.sql`, read
  unfiltered: one changed line, both sides begin with `-- `, no SQL statement
  touched.
- `sha256sum supabase/migrations/0210_notebook_note_grid.sql` against the
  recorded value, both directions (before and after the re-record).

## NOT verified

- **Nothing about production.** No connection was attempted or is possible
  from this container (outbound 5432/6543 are refused; only 443 is open).
  That 0212, 0213 and 0214 are applied, and that 0210's database state matches
  its pre-`e8c6d805` bytes, both rest entirely on Mr. Pina's own reports --
  the probe table for the first, and the ordinary fact that no migration tool
  touched the database for the second.
- Whether the three migrations (0212-0214) are semantically correct. That is
  `claude/blissful-bohr-79y23g`'s and its source branches' work, not this
  bundle's; this bundle only records that they were reported applied.
- CI on this branch's own pushed tip -- not yet reported when this entry was
  written.
- `npm run verify:browser`, `verify:readme`, `verify:counts` -- out of scope:
  this bundle changes no route, no UI, and no counts-tracked surface.
