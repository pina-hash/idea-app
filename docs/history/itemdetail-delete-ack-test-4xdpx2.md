---
title: "Testing: the ItemDetail delete-acknowledgement characterisation goes red on purpose, and the PostgREST shim's select path loses the 42P01 conflation the RPC path already lost (`claude/itemdetail-delete-ack-test-4xdpx2`, no migration)"
date: 2026-08-29
branches: [claude/itemdetail-delete-ack-test-4xdpx2]
migrations: []
subsystems: ["Testing", "Classroom"]
---

**Starting state, checked before anything else.** `git fetch origin`: `HEAD`
(this branch, stale from an earlier task) at `2113f4d`, `origin/main` at
`2113f4d`, `origin/integration` at `d61cd91`. The working tree was clean, so
the branch was reset to `origin/integration` rather than merged onto. Working
directory `/home/user/idea-app`.

**This is a reconciliation, not duplicate work, and the prompt said so up
front.** `claude/itemdetail-delete-ack-qermq5` (recorded in
`docs/history/itemdetail-delete-ack-qermq5.md`) already merged into
`integration` and fixed `ItemDetail`'s delete acknowledgement and the RPC half
of the shim's error conflation. Its OWN entry names the select-path defect and
explicitly leaves it: *"It is not in this bundle because nothing asked for it,
it would move a second set of call sites in the same change... Named here so
the next session does not have to rediscover it."* That is this session.

Precondition checked: `tests/dom/item-detail-ondeleted-mount.test.ts:237`
still read `expect(d.target.textContent).toBe(before)` -- the characterisation
of the OLD behaviour, now contradicting the merged fix. True, so the work
proceeded.

---

## 1. The characterisation test now contradicts the code, and was rewritten to assert the contract

**MEASURED BEFORE TOUCHING ANYTHING.** Running the file against the merged fix:
1 of 7 tests failed -- exactly the one the prompt named, `with NO callback --
every harness -- the write lands and the screen does not move`. It asserted
`target.textContent` was byte-identical before and after the delete; the fixed
component now replaces the page with `Deleted "..." is deleted...`, so the
assertion is false of the shipping component and was always going to be. The
other six passed, including the two the prompt asked to be confirmed rather
than assumed: the refusal-path test at old line 242 (unaffected -- a refused
delete never sets `removed`) and the re-arm test at old line 263 (unaffected --
disarming happens before the write, regardless of what happens after).

**REWRITTEN TO ASSERT THE CONTRACT, BOTH DIRECTIONS, NOT THE OLD
CHARACTERISATION.**

* **No `ondeleted`** -> the page is REPLACED: a `[data-testid="item-removed"]`
  note naming the item and saying `/is deleted/i`, and `button.danger` count is
  0 (the instructor tools, the hand-in and the delete control all leave with
  the row).
* **With `ondeleted`** -> the component renders byte-identically to the
  pre-press page (`target.textContent` compared across both presses), the
  callback fires exactly once after the write, and no
  `[data-testid="item-removed"]` node exists anywhere in the tree.

**MUTATION-PROVEN IN BOTH DIRECTIONS, on the real file, restored by `cp` from
a `/tmp` copy and verified `md5sum`-identical after every restore -- never
`git checkout --`.**

| mutant | | result |
| --- | --- | --- |
| revert the acknowledgement (`removed = true` deleted from the no-callback path) | the shipping-code characterisation, restated | 1 failed / 7 passed -- exactly the no-callback test |
| acknowledge even WITH a callback (`removed = true` moved ahead of the `ondeleted` check) | the flash, the half a naive fix gets wrong | 2 failed / 6 passed -- the new byte-identical test AND the pre-existing "has NOT unmounted... the item is still on screen" test, which reads `target.textContent` inside the callback and stops matching `ITEM.title` once the page has been replaced under it |

The second mutant reddening two tests rather than one is the right shape:
that pre-existing test was already an independent guard against exactly this
regression, from before this session touched the file, and finding it still
biting is what "confirm rather than assume" was asked for.

---

## 2. The PostgREST shim's select path carried the same 42P01 conflation the RPC path already lost

**MEASURED, NOT ASSUMED.** The select catch was instrumented to log every
`(code, table)` pair it saw and the whole suite run once. **430 select
failures**, all reported as `42P01` regardless of what Postgres actually
raised: **350 were `42703`** (undefined_column -- by far the most common
shape, a select ladder rung naming a column a shorter migration chain does not
carry), **72 were genuinely `42P01`** (undefined_table), and **8 were `42501`**
(insufficient_privilege -- an RLS-or-grant denial, not a missing-table
condition at all). 358 of 430 were misreported.

**FIXED THE SAME WAY THE RPC PATH WAS: STOP CLASSIFYING, START REPORTING.**
`selectError()` mirrors `rpcError()`'s shape and reasoning exactly, with one
difference stated in its own comment: an RPC's `42883` (undefined_function)
needs translating to `PGRST202` because Postgres draws no line between "no
such function" and "no overload matching these arguments" -- a select has no
analogous ambiguity, so there is nothing to translate. The driver's own
SQLSTATE already IS the answer, and it is passed through unclassified,
exactly as `rpcError` does for anything that isn't `42883`. A throw carrying no
`code` at all (a driver or fixture failure, not a database answer) rethrows
rather than being dressed as `42P01` -- the same choice `rpcError` and
`routineShape`'s guards already make.

**SWEPT FOR CALL SITES THAT WOULD HAVE ASSERTED THE CONFLATION ITSELF, AS
ASKED, AND FOUND NONE.** Every `.from(...).select(...)` call in `tests/`
alongside every `error?.code` / `error.code` assertion in the same files: two
files check a select's error at all
(`coin-public-board-anon-projection.test.ts`,
`tests/notebook-page-load.test.ts`), and both check `error` is non-null or
matches a message pattern, never the code value. Nothing in `src/` branches a
select-degrade ladder on the error CODE either (only on truthiness) --
`PGRST202`-alone degrading is an RPC-only rule (`$lib/classroom/transports.ts`
and friends). **So passing the real SQLSTATE through changes no existing
result**, measured: the full suite's `Test Files` / `Tests` / failure count is
identical before and after this specific change (see Measured, below), exactly
as the RPC fix's own session found for its 159 errors.

**NO STALE HEADER COMMENT NEEDED CORRECTING THIS TIME.** The only place the
select catch's old behaviour was described in words was its own two-line
comment directly above it ("A missing table or column is what a project
sitting between two hand-applied migrations actually produces"), which is
still true in substance and was replaced by `selectError`'s own doc comment
carrying the measurement. Swept `tests/`, `src/` and `docs/history/` for any
other mention of the select path's `42P01` behaviour; none exists.

**A NEW TEST FILE PINS IT, MIRRORING `postgrest-shim-rpc-error-codes.test.ts`
ONE CALL SHAPE OVER.** `tests/postgrest-shim-select-error-codes.test.ts`, a
three-migration chain (`0001`, `0067`, `0137`) with two real probe tables: one
absent (`42P01`), one present with an unknown column selected against it
(`42703`, and NOT `42P01` -- the finding), and the same table with `select`
revoked from `authenticated`/`anon`/`public` for the `42501` case. The `42501`
probe is a GRANT-layer denial, deliberately not an RLS-with-no-policy table --
RLS with no policy denies at the ROW level and answers zero rows, not an
error, which was tried first and failed for exactly that reason before the
probe was corrected. A circular-object filter value reproduces the
no-SQLSTATE-rethrow branch the same way the RPC test's circular parameter
does, with an ordinary-value call on the same table as the positive control.

**MUTATION-PROVEN.** Reverting `selectError` to the old
`return { data: null, error: { code: '42P01', message } }` (restored
byte-identical afterward, `md5sum`-checked) reddens 3 of the new file's 4
tests: the `42703`, `42501` and no-SQLSTATE-rethrow assertions all fail back to
`42P01`, leaving only the genuinely-missing-table test green (it was already
asserting `42P01`, which the mutant still produces).

**TWO PRE-EXISTING FAILURES, UNRELATED, LEFT ALONE.**
`coin-public-board-anon-projection.test.ts` and
`coin-public-surface-hardening.test.ts` each assert
`coin_role_admin_list_role_questions` called as `anon` answers `PGRST202`;
since the RPC fix landed it genuinely answers `42501` (a real
permission-denied, not a schema-cache miss -- PostgREST's own documented
behavior for a function role has EXECUTE on but a nested check inside it
raises, versus a function ANON was never granted at all, are two different
`42501` shapes and the assertion assumed the former). This predates every
change in this session (measured against a fully clean `origin/integration`
checkout, byte-identical to the merge tip, before either fix here was
applied) and is in `tests/coin-public-*`, which this session does not own.
Named here rather than silently left for the next session to rediscover, per
the standing convention this bundle is itself following.

---

## Measured

| | before (clean `origin/integration`) | after |
| --- | --- | --- |
| `svelte-check` | 0 errors / 37 warnings, 31/5/1 | **identical** |
| full suite | 205 files, 4284 tests, 3 failed, 175.15s | **206 files, 4289 tests, 2 failed, 176.58s** |

The 3 -> 2 is exactly the characterisation test going green; the 2 remaining
failures are the pre-existing, out-of-scope RPC ones named above, unchanged in
count, name and message before and after this session's edits. +5 tests = +1
(`item-detail-ondeleted-mount`, one test replaced by two) + 4
(`postgrest-shim-select-error-codes`, new file). +1 file is that new file.
Every other file's result is unchanged; verified by diffing the full
`Test Files` / `Tests` summary line across three runs (clean-before,
mid-session, and this final one) rather than by inspection.

Select-path instrumentation, run once against the full suite before the fix
and removed before this final measurement: **430 select failures, 350 `42703`
/ 72 `42P01` / 8 `42501`.**

## What was NOT verified

- **Nothing was run against the live Supabase project.** The local `.env` is a
  placeholder (`example-ref`); no migration, RPC or signed-in session here
  touches production. No migration is in this bundle.
- **No `npm run verify:browser` pass.** Neither change touches anything the
  browser harness covers -- the delete-acknowledgement page's own layout is
  happy-dom-only (no layout engine, no geometry claim made), and the shim is a
  test fixture with no rendered surface at all.
- **No `classroom-updates.json` entry.** Both changes are to test
  infrastructure and a test file; nothing a student sees moved. (The
  ItemDetail component itself was not touched this session -- it already
  shipped in `claude/itemdetail-delete-ack-qermq5`.)
- **The two pre-existing coin-RPC failures are diagnosed but not fixed.**
  Fixing them would mean deciding whether `rpcError`'s `42883`-only
  translation should widen to cover a privilege-denied function PostgREST
  itself would 404 rather than 403 -- a real question, but a different one
  from either item this session was scoped to, and outside the files this
  session owns.
