---
title: "Lane R (ledger 0295): five migration branches folded; stopped before the apply at step 3"
date: "2026-09-22"
branches: ["claude/new-session-zsum4t"]
migrations: ["0218", "0220", "0221", "0223", "0224"]
subsystems: ["migrations", "tooling"]
---

**Status: stopped at step 3. No migration was pasted, no record was written, no deploy.**

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
