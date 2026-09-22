---
title: "Lane R (ledger 0295): five migration branches folded, four applies recorded; deploy held on one test"
date: "2026-09-22"
branches: ["claude/new-session-zsum4t"]
migrations: ["0218", "0220", "0221", "0223", "0224"]
subsystems: ["migrations", "tooling"]
---

**Status: the four migrations were applied and recorded, but the deploy is held on one test failure (see the last section).

## What landed on the branch

The five branches were merged in this order: `8ff2od` (which brings `nfgovx`), `shpxf0`,
`dsdncq`, `4quab4`, `ow0i42`. Nothing conflicted under `src/`, `supabase/` or `tests/`.
The only file that conflicted was `tools/browser-verify/README.md`, three times (on
`dsdncq`, `4quab4` and `ow0i42`), and every hunk was inside the generated counts block,
which `npm run verify:counts` regenerated. The prompt's other two expected conflicts did
not happen:

- `classroom-updates.json` merged without a conflict. All 173 entries are present,
  checked by date and title against every side.
- `measured/classroom-stream-manage-1.json` is changed only by `shpxf0`.

Ledger 0295 claims 0219 and 0222. After it landed, `node tools/migration-claims.mjs`
prints no "HOLES NOTHING ACCOUNTS FOR" section, and "next free" is 0225.

## The combined chain: `npm test` run once, alone

Result: `Test Files 2 failed | 539 passed (541)`, `Tests 2 failed | 10294 passed (10296)`.

- `tests/db/migration-0177-tombstone.test.ts` **passed**, so the burned numbers work.
- Every `tests/db/` file applied the combined chain (0218, 0220, 0221, 0223 and 0224 in
  one database). No migration failed to apply.
- `tests/db/migrations-applied-record.test.ts` failed as expected: 0220, 0221, 0223 and
  0224 have no applied record yet.
- **`tests/identity-consumer-inheritance.test.ts` failed, which was not expected.** This
  is the stop.

## The unexpected failure, and why it cannot pass on any merged tree

The test is `left every identity consumer untouched since origin/main`, from ledger 0289
on `claude/nifty-euler-shpxf0`, commit `8e0af002`. It reads
`git diff --name-only origin/main...HEAD` and asserts two things about that diff:

1. it contains `src/lib/Avatar.svelte` (its positive control);
2. it contains none of seven "identity consumer" files.

Both assertions are true only on `shpxf0`'s own branch:

- In this combined tree, ledger 0293 (`intelligent-bardeen-4quab4`, classroom teams)
  legitimately edits `src/lib/classroom/PeoplePanel.svelte`, so assertion 2 fails.
- On `integration`, the diff against `main` carries every lane's work, so it fails for
  the same reason.
- **On `main`, once this ships, `origin/main...HEAD` is empty**, so the positive control
  in assertion 1 fails. The test would be red on `main` permanently, and on every branch
  cut from it.

The test encodes one lane's promise ("this bundle did not edit them") as a property of
whatever tree it runs in. That is the "never assert over something another writer
changes" shape from `CLAUDE.md`'s Testing section, applied to git history.

## What Mr. Pina needs to decide

This lane may not edit `tests/`, so the fix belongs to a separate bundle. The options:

1. **Delete the one `it(...)` block** (lines 73 to 97). The claim it proves was true when
   0289 was reviewed, and that review is the whole of its value. The other 16 tests in
   the file are ordinary render assertions and are unaffected.
2. Pin the diff to 0289's own commit range rather than `origin/main...HEAD`. That keeps
   the claim but freezes it to history, so it asserts nothing about the current tree.

Option 1 is the recommendation. After that fix lands, re-run this lane from step 3; the
merge and the ledger on this branch can be kept as they are.

## Not done

Steps 4 to 8 and the deploy did not happen. No migration was applied because of this
lane, and 0220, 0221, 0223 and 0224 are still unapplied. The five source branches, and
this one, have red CI tips and will not be swept into `integration`.

## Update: the four migrations were applied anyway, and are now recorded

Mr. Pina applied 0220, 0221, 0223 and 0224 in the SQL editor after this lane stopped,
then pasted back each verification table. All four were checked row by row before
anything was recorded:

- **0221**: all 16 rows plus the positive control on `app_short_link_target` read true.
- **0223**: all 12 rows read `OK`, including the positive control on
  `gauntlet_macro_start`.
- **0224**: all 21 rows read true, including the last-row positive control on
  `_maps_wall_thickness_ok`.
- **0220**: 16 rows, and **two** read FAIL where the prompt expected one.
  - "CONTROL, must FAIL: image accepted" is the planted control, and its FAIL is correct.
  - "the tagline refuses empty" is a defect in the verification query, not the
    migration. It was checked against the deployed definition in its own row rather
    than taken on report. The migration writes `between 1 and 48`; Postgres stores and
    renders that as `>= 1 ... AND ... <= 48`, so the probe's pattern `%1 AND 48%` can
    never match the rendered text. The deployed constraint does refuse an empty
    tagline.
  - The row "confetti is NOT allowed" passes for the wrong reason: its pattern
    `%glow-pulse%` would pass even if confetti were allowed. The deployed array holds
    only `glow-pulse` and `particle-trail`, so the rule holds anyway.
  - All three points are written into the record's own note. The migration file is
    not edited, because it is applied and its text has to match what ran.

The records were all written by `tools/record-applied.mjs`, each with its pasted table
as evidence. 0220's evidence also carries the supplementary catalog read, in which
every column and constraint the migration creates reads present.

- 0221, 0223 and 0224 resolved their own authorising ledger.
- 0220 did not: ledger 0289 carries no parseable `Claims:` field and no `Branch:` line.
  It was recorded with `--ledger 0289 --branch claude/nifty-euler-shpxf0`, both checked
  against 0289's own "Migration permitted: yes, exactly one, number 0220". A first run
  without `--branch` wrote the record as `0220-ledger-0289.md` with `branch: unknown`.
  That file was deleted and rewritten as `0220-nifty-euler-shpxf0.md`.

With the records in place, `tests/db/migrations-applied-record.test.ts` and
`tests/db/migration-0177-tombstone.test.ts` pass: 2 files, 27 tests. The deadlock itself
is resolved.

## Still held: the deploy

`tests/identity-consumer-inheritance.test.ts` still fails on this tree, for the reason
given above. Until it is fixed, the full suite is red on this branch, CI will not go
green, `integrate.yml` will not sweep it, and gates 2 and 6 cannot be met. Nothing was
merged to `main` and nothing was deployed.

Production is therefore **ahead of the deployed app**: it now carries 0220, 0221, 0223
and 0224. That is the ordinary safe direction, since each is additive, but it should
not stay that way for long.
