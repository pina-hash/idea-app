---
title: "`0218` is recorded as applied, so `claude/new-session-nfgovx`'s CI can go green -- written from Mr. Pina's reported verification output by `record-applied`, never by hand (`claude/new-session-8ff2od`, no migration)"
date: 2026-09-22
branches: [claude/new-session-8ff2od]
migrations: []
subsystems: ["Migrations", "Documentation", "CI"]
---

`supabase/migrations/0218_classroom_create_item_unit.sql` (ledger 0283, branch
`claude/new-session-nfgovx`) was applied to production by hand by Mr. Pina on
2026-09-22. `docs/migrations-applied/` had no record for it, so
`tests/db/migrations-applied-record.test.ts`'s no-gaps assertion reddened on
that branch, which is what kept `integrate.yml` from ever sweeping it into
`integration`. This is the structural state of every migration branch here
until its record lands -- `0216` and `0217` both landed theirs in separate
later commits, and this bundle is the same shape for `0218`.

## What was written, and by what

This session merged `origin/claude/new-session-nfgovx` into its own branch
first (a fast-forward from `1ec2f640` to `abe3da94`, no conflicts -- the
record has to sit alongside the migration file or the no-gaps assertion still
fails). Mr. Pina's reported verification output was written to a scratch
file byte-verbatim and passed to:

    node tools/record-applied.mjs 0218 --by "Mr. Pina" --on 2026-09-22 \
        --evidence <file> --recorded-by 0284

which wrote `docs/migrations-applied/0218-new-session-nfgovx.md`. Never by
hand: a hand-written record is a session's belief wearing the tool's format,
and the tool is what stamps `source: report` so the two kinds of record stay
distinguishable by `grep` forever.

`--query` was deliberately not used to derive a fresh probe -- the prompt
named the reason and it held: `verificationQuery` derives from `HEAD`, and at
merge time `0218` was still only on a branch, not `origin/main`, so
`idea-status.py`'s probe derivation correctly has nothing to offer it.
Unlike the `0215` case in `docs/history/sharp-gauss-tpmw7s.md`, this was not
double-checked by actually running `--query` against `HEAD` here, because
`0218` genuinely is not on `origin/main` at this commit and the refusal is
the expected, unconditional answer for that state -- there was no premise to
verify against a changed fact.

`authorisingEntry` resolved the authoriser without being told: `ledger:
"0283"` (`docs/prompt-ledger/entries/0283-composer-unit-at-create-and-deck-type-gate.md`),
branch `claude/new-session-nfgovx`, which is also where the record's slug
(`new-session-nfgovx`) comes from. This bundle appears only as
`recorded_by_ledger: "0284"` -- `apply-migration.mjs`'s `appliesUnderLedger`
greps `^ledger:` to answer "has this bundle already applied a migration", so
stamping the recording lane there would attribute a migration to a lane that
wrote none of it.

## What was measured

- `tests/db/migrations-applied-record.test.ts` alone: **23 passed / 0
  failed**, where it would have failed the no-gaps assertion on this
  branch's tip before the record existed (confirmed structurally: the merge
  brought in `0218_classroom_create_item_unit.sql` with no matching record
  until this bundle wrote one).
- Full `npm test`: **529 test files passed (529), 9910 tests passed (9910),
  0 failed.** Duration 1336.93s.
- `svelte-check` was not re-run: this bundle touches no `src/` file, no
  migration and no test, so there is nothing under its own change that
  could move either number.

## Gates, per `IDEA_instructions.md` item 4

1. Pass -- `git fetch origin` first; starting sha `1ec2f640` matched
   `origin/main`.
2. Unmet, and correctly so: CI has not yet run on this branch's tip and
   `integrate.yml` has not swept it. That is the expected stop, not a
   failure, for the same reason every migration-record bundle here stops
   there.
3. Clean: only the two owned paths were written by this session
   (`docs/migrations-applied/0218-new-session-nfgovx.md`, written by the
   tool, and `docs/prompt-ledger/entries/0284-record-0218-applied.md`); the
   merge from `new-session-nfgovx` brought its own files in as a
   fast-forward, not as edits this session made.
4. Satisfied: `0218` is now in the applied-record delta and recorded.
5. Satisfied by the same record.
6. Checked across this entry and the merged-in `0283` entry; no
   contradiction found. `node tools/migration-claims.mjs` correctly reports
   `0218` as CONTESTED between this branch and `claude/new-session-nfgovx`
   at the moment of writing -- expected, since this branch now carries both
   the file and the ledger claim by virtue of the merge, and the contest
   resolves itself the moment either branch lands on `main`.

## What is NOT verified

**That `0218` is applied to production, or that its backfill did the right
thing.** Nothing in this repository can establish that -- no session here
can open a socket to the production database (see `CLAUDE.md`, and
`tools/record-applied.mjs`'s own header). This record rests entirely on Mr.
Pina's report of 2026-09-22 and says so in its own first sentence. The nine
rows of verification output were reproduced verbatim and not interpreted:
whether a given `true` is the right answer is a question about the query
that produced it, which this tool did not write and did not run.

## What was deferred

Nothing beyond what item 4's own gate 2 defers structurally: the merge to
`main` is Mr. Pina's, not this session's, per the prompt's explicit
instruction and the standing rule that a push to `main` deploys
`ideabosco.com` mid-class.
