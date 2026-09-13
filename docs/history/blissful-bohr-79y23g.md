---
title: "Three finished branches stood unmerged because their CI was RED, not absent, and the red was the applied-record test correctly reporting migrations Mr. Pina had already applied by hand; landing them needs one counts regeneration and no source edit, and leaves integration red on a comment-only edit to already-applied 0210 (`claude/blissful-bohr-79y23g`, migration files 0212, 0213, 0214)"
date: 2026-09-13
branches: [claude/blissful-bohr-79y23g, claude/sharp-einstein-cqrnx6, claude/busy-feynman-aupq55, claude/youthful-lovelace-kg9482]
migrations: ["0212", "0213", "0214"]
subsystems: ["Repo workflow", "Tournaments", "Classroom", "IdeaCAD", "Database"]
---

Three branches had been finished for hours and were ancestors of nothing. This
bundle lands them and does not touch a line of source, test or migration to do it.

- `claude/sharp-einstein-cqrnx6` (ledger 0212, migration file 0213) merged CLEAN.
- `claude/busy-feynman-aupq55` (ledger 0207, file 0212) conflicted on
  `tools/browser-verify/README.md` and nothing else.
- `claude/youthful-lovelace-kg9482` (ledger 0218, file 0214) conflicted on the same
  file and nothing else; `CLAUDE.md` auto-merged.

Every conflict hunk, in both merges, was strictly inside the `counts:` markers. No
genuine content conflict occurred anywhere, which is the outcome the prompt named as
the STOP condition and is worth stating as a measured negative rather than passed over.

## The two claims the tree contradicted

**The prompt said none of the three branches had any CI check run on its tip -- "not a
red one, no run at all" -- and that this was why the sweep never merged them. All
three have a run on their exact tip sha, and all three concluded FAILURE.**

| branch | tip | run | conclusion |
|---|---|---|---|
| `sharp-einstein-cqrnx6` | `d0a9b8da` | 34741102408 | failure |
| `busy-feynman-aupq55` | `c79709df` | 34741825064 | failure |
| `youthful-lovelace-kg9482` | `c137e5e3` | 34747897208 | failure |

That is a materially different diagnosis. An absent run is a dispatch problem; a red
run is `integrate.yml` doing exactly its job. And the red is the same red in each
case: `tests/db/migrations-applied-record.test.ts` reporting that the migration the
branch carries has no record under `docs/migrations-applied/`. On
`youthful-lovelace`'s run the assertion at line 243 prints a one-element diff,
`- "0214"`, against `1 failed | 8812 passed`. **So the gate that held all three
branches is the applied-record test, and what it was reporting was true.** Nobody
fabricated a record to get past it, which is the right call and is why the branches
stood.

**The prompt also said this bundle changes no route spec.** `youthful-lovelace` adds
two, `routes/ideacad-archive.mjs` and `routes/ideacad-archive-state-readonly.mjs`,
with a measurement file for each. That is why the STATIC half of the counts block
conflicted as well as the measured half, and it is the reason the regeneration below
was not a formality.

## The counts block, and why neither side's number was right

This is the "green parents, red merge" case `tools/browser-verify/README.md`
describes in its own prose, observed rather than reasoned about. In the static
region HEAD carried **222** specs and `youthful-lovelace` carried **217** -- it
branched from an older integration and added its two to 215, while integration moved
on to 222. Neither number is true of the merged tree, so taking a side would have
written a wrong number with no conflict left to show it, and a hand-merge would have
had to invent 224.

One `npm run verify:counts` on the fully merged tree answered **224 specs over 87
routes, 115 `/dev` pages, 448 runs**, and **224 specs measured, 8012 measurements, 0
outside threshold**. The two regions AGREE on the spec count, which was the prompt's
other stop condition, so there was nothing to stop for. `npm run verify:counts --
--check` on the clean committed tree then reported "both counts regions agree with
this tree" and wrote nothing.

`measured/` holds 225 files against 224 specs. The extra is `_selftest.json`, which
carries the `--selftest` control counts and is not a route spec, so the store is
exactly complete: **zero unmeasured specs**. `verify:readme` was not run and did not
need to be -- both regions are a tree read.

The merge-2 conflict was resolved by the same command rather than by choosing a
side, because the region is a pure function of the tree and an intermediate value is
overwritten deterministically by the final run. The authoritative block is the one
regenerated after all three merges were in.

## Two authors, one object: four functions, and this time it is the healthy shape

Swept across 0212, 0213, 0214 and everything on integration from 0205 up -- ten
files, 86 distinct objects, comments and dollar-quoted bodies stripped so a name in
prose cannot count. **Four objects are defined by two files each, and all four pair
0205 with 0214:**

    function public._ideacad_can_write_document    <- 0205, 0214
    function public._ideacad_document_role         <- 0205, 0214
    function public.ideacad_open_shared_document   <- 0205, 0214
    function public.ideacad_shared_with_me         <- 0205, 0214

**This is not the 0148/0151 failure.** There, a later file restored an earlier body
and silently deleted a server-stamped clock that an intermediate file had added.
Here every signature is byte-identical between the two files, so `create or replace`
is correct and the signature trap does not apply; nothing in 0206 through 0213
touches any of the four, so there is no intermediate author whose change could be
lost; and 0214's bodies are substantially archive-aware, so they are forward
redefinitions rather than restorations. `youthful-lovelace`'s own history entry
documents one of them as a deliberate CORRECTION -- `ideacad_open_shared_document`
computed `canWrite` from the role alone, `coalesce(v_role in ('owner','editor'),
false)`, instead of from `_ideacad_can_write_document`, so an archived document
answered `canWrite: true` to its own owner until 0214 closed it.

**What made this safe to read is that the later file's own record names the earlier
one.** That is precisely what 0148/0151 lacked, and it is the cheap durable
protection: a migration redefining another migration's function says so in its
header. It is not something a test can check across two files that no test carries
together, which is the gap that let 0151 through and which still exists.

## The migration files are landed, not applied, and nothing was renumbered

0212, 0213 and 0214 are reported APPLIED to production by Mr. Pina while their files
sat on these branches. No database connection was attempted: a cloud container
cannot reach this project (outbound 5432 and 6543 are refused, only 443 is open) and
that is permanent. `tools/apply-migration.mjs` was not run.

The three files arrived by merge and are byte-identical to their source branches --
verified as blob identity, not as a diff:

    0212  cf009fd22a950ec228f1d9631163f8d65f97d038
    0213  008c3b40a3fb34256cc7d01d1af2d5e6227a805d
    0214  390b7cf4b78db6a2320e6c6bd66d22ff906f831d

`supabase/migrations/` now holds 212 files, highest 0214, and **no number appears
twice** across the whole directory. From 0205 up the sequence is dense and
unambiguous: 0205 through 0214, one file each.

`node tools/migration-claims.mjs` reports `highest landed 0211`, `next free 0215`,
and three CONTESTED pairs -- 0212, 0213 and 0214, each pitting this branch against
the branch it just merged. **Those three are artefacts of the merge and not
collisions**: the tool reads every ref, and a number held by both a source branch and
the branch that landed it is the same blob in two places. The blob identities above
are what settles that. It also reports 0190 and 0191 as claimed-not-landed against
this branch; those are pre-existing holes attributed here only because the ledger
entries naming them (0092, 0093, 0098, 0099) are on integration and therefore on any
branch cut from it.

## THE THINGS A PERSON HAS TO ACT ON

**ONE. There is no applied record for 0212, 0213 or 0214, and this bundle
deliberately did not write one.** `docs/migrations-applied/` stops at 0211.
`tools/record-applied.mjs` writes a record from Mr. Pina's own verification output
and never from a session's belief, and a record asserting an apply this container
cannot observe would be exactly the fabrication the mechanism exists to prevent. The
consequence is concrete rather than tidy: **`tests/db/migrations-applied-record.test.ts`
fails on the merged tree until those three records exist**, so every branch cut from
integration inherits a red suite, and `integrate.yml` will hold the next finished
branch for the same reason it held these three. Whether that may pass gate 4 is
Mr. Pina's decision and not this session's.

**TWO. Integration was ALREADY RED before any of this, on a different assertion, and
the cause is a comment-only edit to a migration that had already been applied.**
Measured on `origin/integration` at `709827d7` with nothing merged: `1 failed | 8832
passed`, the failure being

    0210-determined-albattani-16az27.md: expected '48a4ad20...' to be '550f5597...'

`docs/migrations-applied/0210-determined-albattani-16az27.md` records
`sha256: 48a4ad20...`, covering "repo bytes at commit `f4616dca`". Commit `e8c6d805`
(2026-09-13 10:53, "Check the migration against the SQL paste trap, and write the
real path") then changed ONE line inside a `--` comment in
`0210_notebook_note_grid.sql` -- `$lib/server/rich-text-normalize.ts` to
`src/lib/server/rich-text-normalize.ts`, to remove a bare `$` from a comment -- and
the file now hashes to `550f5597...`. The record was written at `e4a7ff62` (01:50),
nine hours earlier.

The edit was made for a good reason and is the kind of thing the paste-trap rule
asks for. But 0210 had already been pasted and applied, so the edit changed the
repository's record of what was applied without changing what is in the database,
which is the immutable-applied-record rule holding even for a comment. **It is not
this bundle's to fix** -- it owns no migration and no applied record -- and it will
not fix itself. The two ways out are to re-record 0210 against its current bytes, or
to revert the comment edit; both are decisions about which bytes are the truth, and
the first needs Mr. Pina's attestation like any other record.

**THREE. The applied-record test now fails on two independent assertions at once,
which is the shape that hides a real regression.** Line 256 is the stale 0210 hash;
line 243 is the three missing records. A session reading "1 test failed" in this
file and matching it against the baseline's "1 test failed" would conclude nothing
had changed. The count moved from 1 to 2 and the second is new.

## Measured

Both suite runs are read off the summary line, never off an exit code: `npm test`
exits 0 with a failing test, and `tools/run-tests.mjs` says so in its own header.

- **Baseline, `origin/integration` `709827d7`, nothing merged:** `Test Files 1 failed
  | 464 passed (465)`, `Tests 1 failed | 8832 passed (8833)`, 718.61s.
  `svelte-check` 0 errors, 37 warnings in 20 files, breaking down 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1 `perf_avoid_nested_class`
  -- the documented baseline exactly, re-derived in this container rather than read
  off `CLAUDE.md`.
- **After all three merges, `7003db59`:** `Test Files 1 failed | 472 passed (473)`,
  `Tests 2 failed | 9056 passed (9058)`, 717.05s.
- **The delta is `+8` test files, `+224` passing tests, `+1` failing test, and every
  part of it is accounted for.** The three branches touch 11 test files, of which 8
  are new: `classroom-remove-enrollment-ideacad`, `ideacad-archive-migration`,
  `ideacad-archive`, `tournament-bracket-reward-payout`,
  `tournament-bracket-topology`, `tournament-correction-reset`,
  `ideacad-archive-mount` and `tournament-rewards-payout-mount`. `465 + 8 = 473`.
  **All 11 pass**, the 3 modified ones (`coin-symbol`, `tournament-members`,
  `ideacad-grants-anon-execute-surface`) included.
- **The one new failure is not a regression and is not in code.** Both failures are
  in `tests/db/migrations-applied-record.test.ts`: line 243 is new and is the three
  missing applied records, line 256 is the pre-existing 0210 hash. No other test moved
  in either direction.
- **`svelte-check` after the merges: 0 errors, 37 warnings in 20 files, 31 / 5 / 1.**
  Total AND mix unchanged, which is the half that matters -- a held total over a
  shifted mix is still a finding, and there was no shift.
- `npm run verify:counts -- --check` on the clean committed merged tree: both regions
  agree with the tree.
- Merge shas, in order: `8cb396b8`, `e7c1938e`, `7003db59`.

## NOT verified

- **Nothing about production.** No connection was attempted or is possible. That
  0212, 0213 and 0214 are applied rests entirely on Mr. Pina's report.
- **No browser pass.** `npm run verify:browser` was not run and neither was
  `verify:readme`; the two new route specs `youthful-lovelace` added carry
  measurement files taken on that branch, and this bundle re-measured nothing.
- **CI on the merged tree.** `integration` takes no push-triggered run, and this
  branch's own run had not reported when the session ended.
- Whether the four dual-authored functions are SEMANTICALLY correct after 0214. The
  sweep establishes that the redefinition is deliberate, forward and documented; it
  does not re-review the SQL, which is 0218's work and outside this bundle's surface.
