---
title: "`0215` is recorded as applied, so `main` is green again -- written from production's answer by `record-applied`, with the prompt's stated reason for the hand-written probe dropped because it measured false (`claude/sharp-gauss-tpmw7s`, no migration)"
date: 2026-09-14
branches: [claude/sharp-gauss-tpmw7s]
migrations: []
subsystems: ["Migrations", "Documentation", "CI"]
---

`supabase/migrations/0215_short_link_reserve_ideacad.sql` was applied to
production by Mr. Pina. `docs/migrations-applied/` had no record for it, and
`tests/db/migrations-applied-record.test.ts`'s no-gaps assertion -- *has a
record for every migration from 0193 onward* -- reads the migrations directory
and the records directory and compares the two sets. So the moment the file
landed on `main` with no record beside it, `main` went red, and every branch cut
from it inherited the failure. Measured here before the change:

```
× has a record for every migration from 0193 onward, and no gaps
  AssertionError: expected [ '0193', ... (19) ] to deeply equal [ '0193', ... (20) ]
Tests  1 failed | 22 passed (23)
```

Four earlier sessions correctly refused to write the record. That refusal was
right: a record is a report of what production answered, and a session that has
not been told what production answered has only its own belief, which is
precisely what `docs/migrations-applied/README.md` exists to keep out of the
directory. What changed is not the standard, it is that production answered.

## What was written, and by what

One file, `docs/migrations-applied/0215-reserved-short-link-slugs-0234.md`,
written by `node tools/record-applied.mjs 0215 --by "Alejandro Pina" --on
2026-09-14 --evidence - --recorded-by 0266`. Never by hand: a hand-written
record is a session's belief wearing the tool's format, and the tool is what
stamps `source: report` so the two kinds of record stay distinguishable by
`grep` forever.

The evidence -- four rows Mr. Pina read back out of the Supabase SQL editor --
was written to a file byte-verbatim and piped to `--evidence -`. It was not
retyped, reformatted or interpreted, which is the tool's own contract: *whether
a particular `false` is a pass or a failure is a question about the query that
produced it, and this tool did not write that query and did not run it.*

`authorisingEntry` resolved the authoriser without being told: `ledger: "0234"`,
`branch: codex/reserved-short-link-slugs-0234`. This bundle appears only as
`recorded_by_ledger: "0266"`. That split is load-bearing rather than tidy --
`apply-migration.mjs`'s `appliesUnderLedger` greps `^ledger:` to answer "has
this bundle already applied a migration", so stamping the recording lane there
would make the question answer about a lane that wrote nothing.

## The prompt's premise for the note, and why it is not in the record

The prompt asked the note to say the probe was written by hand **because**
`record-applied` could derive no probe for this migration. That was checked
rather than restated, and it is false in this checkout:

```
$ node tools/record-applied.mjs 0215 --query
--   object table public.app_short_link_reserved_moves
set transaction read only;
select i, applied from ( ... ) as probe order by i;
(exit 0)
```

`verificationQuery` derives from `HEAD`, and `0215` is on `origin/main`
(`e6a537f8`) now, so the derivation succeeds. The refusal the prompt described
is the real and common one for a file still sitting only on a branch -- it just
is not this file's state any more.

Writing the stated reason down would have been worse than a stray inaccuracy:
`renderReportedRecord` places the note immediately above **What a verification
query would cover**, which in this record lists the derived object. The sentence
would have been contradicted three lines later, inside the same permanent file,
by the tool that wrote both.

So the note keeps the two things that are true and were the point of asking for
it -- the router chat wrote the probe by hand, and `open-lab NOT reserved` is a
deliberate negative control so the evidence shows the predicate discriminates
rather than answering `true` to everything -- and states the derivation's actual
coverage (one object, the audit table) in place of the claim that there was
none. The negative control is the half worth keeping: three rows answering
`true` prove nothing on their own if the predicate answers `true` to everything,
and the fourth row is what makes the other three mean something.

## What was measured

- The record test, before: **1 failed / 22 passed**, on the no-gaps assertion.
- The record test, after: **23 passed / 0 failed**.
- Full suite after the change: see the numbers in the session report. The
  baseline on `main` was 1 failed / 9136 passed, that one failure being this
  record.
- `svelte-check`: re-derived rather than read off `CLAUDE.md`, after
  `svelte-kit sync` and with the two `$env/static/public` values exported, per
  the phantom-error trap.

## What is NOT verified

**That `0215` is applied to production.** Nothing in this repository can
establish that, which is the entire premise of the directory. This record rests
on Mr. Pina's report of 2026-09-14 and says so in its own first sentence. No
socket was opened, no connection string was read, and `record-applied.mjs` has
no database code path to open one with.

Nor does it establish that the hand-written probe's four checks are the right
four, or that its SQL says what its row labels say it says. The probe was not
written here and was not run here.

## What was deferred

Nothing. The bundle is one record, one ledger entry and this file.
