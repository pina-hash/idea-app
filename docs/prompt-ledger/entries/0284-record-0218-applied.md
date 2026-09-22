# 0284 Record that 0218 was applied

- Issued: 2026-09-22T00:00:00Z
- By: Claude Code session
- Owns: `docs/migrations-applied/**`, `docs/prompt-ledger/entries/0284-*`,
  `docs/history/<this branch>.md`
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0217.
- Status: issued
- Branch: `claude/new-session-8ff2od`
- Notes: Documentation only. No file under `src/`, `supabase/` or `tests/` was
  touched, and no other document was edited. The migration this records was
  written by ledger 0283 (branch `claude/new-session-nfgovx`) and applied by
  hand by Mr. Pina; this bundle neither wrote nor applied it.

## What it did

`origin/claude/new-session-nfgovx` (ledger 0283, migration
`supabase/migrations/0218_classroom_create_item_unit.sql`) was carrying no
applied record, so `tests/db/migrations-applied-record.test.ts` failed on that
branch and `integrate.yml` never swept it into `integration`. Mr. Pina applied
0218 by hand in the Supabase SQL editor on 2026-09-22 and ran the
verification query from the migration's own tail; all nine rows, including
the positive control, came back true.

This session merged `origin/claude/new-session-nfgovx` into its own branch
(a fast-forward, no conflicts), wrote his reported output to a file, and ran:

    node tools/record-applied.mjs 0218 --by "Mr. Pina" --on 2026-09-22 \
        --evidence <file> --recorded-by 0284

which wrote `docs/migrations-applied/0218-new-session-nfgovx.md`. The tool
resolved the authorising ledger itself through `authorisingEntry`:
`ledger: "0218"` was not it -- it correctly found `ledger: "0283"`
(`docs/prompt-ledger/entries/0283-composer-unit-at-create-and-deck-type-gate.md`),
branch `claude/new-session-nfgovx`, and the slug came from that branch name.
This bundle appears only as `recorded_by_ledger: "0284"`, which is the split
`record-applied.mjs`'s own header explains: `apply-migration.mjs`'s
`appliesUnderLedger` greps `^ledger:` to ask which bundle applied a migration,
and stamping the recording bundle there would attribute a migration to a lane
that wrote none of it.

`--query` was not used, per the prompt's own instruction: probes are derived
from `origin/main` and 0218 is only on a branch at commit time, so it would
have correctly refused.

## Gates (per `IDEA_instructions.md` item 4)

1. **Pass.** Fetched `origin` before starting; session sha `1ec2f640` matched
   `origin/main`. Working directory `/home/user/idea-app`, no other checkout
   touched.
2. **Unmet, correctly.** CI has not yet run on this branch and
   `integrate.yml` has not swept it. This is the expected stop, not a
   failure -- the branch cannot merge to `integration` until its own CI goes
   green.
3. **Clean.** No file outside the two paths this entry owns was written:
   `docs/migrations-applied/0218-new-session-nfgovx.md` (by the tool) and
   this ledger entry, plus the history entry below. The merge from
   `new-session-nfgovx` brought its own files in as a fast-forward, not as
   edits made by this session.
4. **Satisfied.** `node tools/migration-claims.mjs` and the local test run
   below both agree that 0218 is now in the applied-record delta and
   recorded.
5. **Satisfied** by the same record.
6. **Checked** across this entry and the merged-in 0283 entry; no ledger
   contradiction found.

## Test run

`npm test` summary line reported below, with
`tests/db/migrations-applied-record.test.ts` passing where it previously
would have failed on this branch's tip for lack of a 0218 record.

## Not verified

The live production database was not queried by this session, cannot be
(no session in this repository can reach it -- see `CLAUDE.md`), and this
record rests entirely on Mr. Pina's reported output, exactly as
`record-applied.mjs`'s own rendered record says in its first paragraph.
