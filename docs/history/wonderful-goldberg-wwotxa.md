---
title: "Decision 02's `test RLS policy` on the coin ledger does not exist and never did, so `0204` was released unwritten; what ships instead is the catalog sweep that stops the audit being done by hand a fourth time (`claude/wonderful-goldberg-wwotxa`, ledger 0174)"
date: 2026-09-12
branches: [claude/wonderful-goldberg-wwotxa]
migrations: []
subsystems: ["Database", "Security", "Testing", "Coin economy"]
---

The prompt carried an approval: Mr. Pina said on 2026-09-12 to remove the test
RLS policy from the coin ledger, and granted exactly one migration, `0204`, to
do it. It also required the audit to come first, and named the outcome that
would cancel the migration -- "if it is already gone, say so and close the entry
rather than writing a migration."

**It was never there.** So this bundle writes no SQL, releases `0204`
unwritten, and closes `docs/decisions/entries/02-coin-ledger-test-rls-policy.md`
on the premise rather than on the work.

## What the audit found

Against a real Postgres with the whole chain applied -- **201 migration files**,
`pg_policies` read after the last of them, not a grep over migration text:

- **`coin_transactions`, the ledger, has RLS enabled and exactly ONE policy.**
  `read own or admin coin transactions`, `0070:343`, `for select to
  authenticated using ((student_email = current_user_email()) or is_admin())`,
  `with_check` null. No non-SELECT policy of any kind, which is `0070`'s own
  comment ("every write goes through the SECURITY DEFINER functions") verified
  from the catalog rather than read from the file.
- **Sixteen coin tables, fifteen policies, one per table.** Every one is
  `SELECT`, every one is `to authenticated` and to nothing else.
  `coin_public_id_secret` is the sixteenth: RLS on, **zero policies**, which is
  how a table denies every client.
- **Nothing test-shaped, anywhere on the coin surface.** Zero policy names on a
  coin table match a word-bounded `test|debug|temp|tmp|todo|scratch`.
- **No coin policy admits `anon` or `public`.** Twenty policies schema-wide
  admit `anon` and every one of them is a maps or tournaments public read; not
  one is on a coin table. The public ledger at `/coins` is served by
  anon-granted RPCs that project the address away inside the database (`0089`
  through `0157`), which is exactly why no policy is needed for it.
- **The only two `using (true)` coin reads are the two the 2026-09-02 tree check
  already named**: `read coin categories` (`0070`, the price list) and `read
  coin contracts` (`0077`), both to `authenticated`, both commented as
  deliberate in the same breath as "no insert/update/delete policies". Neither
  is the ledger and neither carries a balance.

The decision entry's own `Tree check` line, written 2026-09-02, reached the same
conclusion by grep and stated the two outcomes left open: name the policy, or
withdraw the premise. This is the withdrawal, with the catalog behind it instead
of the text.

## Why a test rather than a sentence in the ledger entry

The audit has now been done by hand **twice** -- 2026-09-02 by grep, 2026-09-12
against the catalog -- and a grep over migration text is not the catalog. A
policy can be created in one file and replaced in another; `create policy`
statements counted across 201 files do not say what a database carrying all of
them ends up with. Doing it a third time by hand is the failure mode, not the
work.

And the regression it guards is **silent**, which is this repo's bar for adding
a test at all. A permissive policy on the coin ledger -- a `using (true)` for a
new board, an `anon` grant for a public surface, a genuine debugging policy
somebody forgets to drop -- breaks nothing on screen, fails no type check, and
publishes every student's balance to every signed-in student. Before this file,
nothing in the suite read `pg_policies` for a coin table at all.

`tests/db/coin-ledger-policy.test.ts`, 14 tests:

- **The ledger field by field**: RLS on, one policy, `SELECT`, roles exactly
  `{authenticated}`, `with_check` null, the qual naming `student_email`,
  `current_user_email()` and `is_admin()` in an `OR`, and **not** naming
  `is_teacher` -- which returns `is_admin()` (the `0067` trap), so it would pass
  an `is_admin()` grep while reading as a wider gate.
- **The whole coin surface as a NAME-TO-TABLE map, not a count.** A count passes
  on exactly the swap that matters: one deliberate policy dropped and one loose
  one added holds it at fifteen. The map also asserts one-per-table, because a
  second policy on a coin table is OR'd with the first and can only widen the
  read.
- **Three absence sweeps** -- test-shaped names, `anon`/`public` roles, and
  `using (true)` on the ledger.
- **A planted positive control for each**, mutating in the permissive direction:
  a real policy created on `coin_transactions` as the connection owner, the
  sweep asserted to find it, then dropped in a `finally` and the clean state
  re-read. A policy commented out fails closed and reddens almost nothing, which
  is why the plant is a live permissive policy and not a removal.

### The instrument's own negative control, which is the part worth keeping

`TEST_SHAPED` is word-bounded (`\y...\y`) and the file asserts **why**: the
unanchored spelling matches `attempts`, so it reports hits on
`gauntlet_speedrun_attempts` and `greenline_track_attempts` -- two tables with
nothing to do with any of this, which read as findings. The last test pins that
the loose pattern still returns exactly those two and the anchored one returns
zero, so if the loose form ever comes back clean the anchors have stopped being
load-bearing and the comment above them is stale.

The first draft of the sweep reported those two as hits. They were the only
"finding" in the whole audit and both were the regex.

## Two traps this bundle hit

**`pg_policies.roles` is `name[]`, an oid node-postgres carries no array parser
for**, so it arrives as the raw literal `{authenticated}` and every array method
on it throws `p.roles.join is not a function`. Cast it in SQL
(`roles::text[]`), not in the test. Twelve of fourteen assertions passed while
the two that read roles failed, which is the shape that makes it look like a
schema finding.

**A backtick inside a SQL comment inside a JS template literal ends the
literal.** The cast's own explanatory comment was written as ``-- `pg_policies.roles`
is `name[]` `` inside the backticked `POLICY_SELECT`, and the file stopped
parsing with `Expected a semicolon`, pointing at the comment. Nothing about it
reads as a quoting error.

## The claim on `0204`, and how the ledger entry nearly burned it

`tools/migration-claims.mjs` resolves a `Migration permitted` line by checking
the explicit `Claims: NNNN` spelling **first**, before the `NONE WRITTEN`
release form. The entry's first draft quoted the prompt's grant verbatim --
`Migration permitted: exactly one. Claims: 0204.` -- **on that same line**, to
record what had been granted. Measured: the tool then reported `next free 0205`
and listed `0204` under CLAIMED, NOT LANDED, held by a branch that lands no
migration. That is the burned number the ledger README names, arriving through a
quotation rather than through a claim.

Moving the quotation into `Notes` and leaving `NONE WRITTEN` on the permitted
line returns `next free` to `0204`. The verbatim grant is still in the entry,
one field down, where nothing parses it.

## The paste trap: zero, and the zero is vacuous, which is said out loud

A `$tag$` inside a `--` comment balances in Postgres and breaks the Supabase
editor's client-side statement splitter; it cost `0194` a full apply cycle.

**This bundle adds or modifies zero SQL files**, so both instruments report
**0** and the verdict is CLEAN -- vacuously, by construction, and a sweep over
zero files proves nothing about the instruments. So both were put to planted
controls anyway: a tag in a leading comment reads 1 on instrument 1 (leading
`--`) and 1 on instrument 2 (everything after the first `--`); a bare `$$` in a
**trailing** comment reads 0 on instrument 1 and 1 on instrument 2, which is the
case the wider instrument exists for; and a file with real `$checks$`
delimiters on code lines reads CLEAN on both, so the pair does not flag an
ordinary dollar-quoted block.

## The numbers

**Full suite, measured twice on one checkout, baseline first.**

| | files | tests | failed | duration |
|---|---|---|---|---|
| `origin/integration` `eef6e851` | 405 | 7819 | 0 | 393.14s |
| this branch `488d9e62` | 406 | 7833 | 0 | 392.34s |

The delta is **+1 file and +14 tests**, which is exactly this file and nothing
else. The baseline was taken by detaching the working tree to
`origin/integration` and confirming `git status` clean, `HEAD` equal to
`origin/integration`, and `tests/db/coin-ledger-policy.test.ts` absent -- rather
than by subtracting this file's own count from the after run, which would have
put the file under test into its own baseline.

**svelte-check: 0 errors, 38 warnings in 21 files**, at 32
`state_referenced_locally`, 5 `css_unused_selector`, 1
`perf_avoid_nested_class`. Identical before and after, which is the expected
answer for a bundle that adds no `.svelte` file and touches nothing under
`src/`. Re-derived with `npx svelte-kit sync && npx svelte-check` after
exporting placeholder `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY`,
because a checkout with no `.env` reports phantom `$env/static/public` errors.

**`CLAUDE.md`'s stated baseline is stale and this lane did not own the file.**
It says 40 warnings in 22 files at 34/5/1; `origin/integration` `eef6e851`
measures **38 in 21 at 32/5/1**, so the warning that moved is
`state_referenced_locally`, 34 to 32, and two files dropped out of the count
entirely. `CLAUDE.md`'s own rule is that a session measuring a different number
corrects that line in the same change; this prompt's owned surface is four
paths and none of them is `CLAUDE.md`, and prompt 0055 set the precedent for
reporting a contradiction in a file a lane does not own rather than editing it.
**The next lane that owns `CLAUDE.md` should carry 38 / 21 / 32-5-1 into it.**

## Mutation proof

Not required for this file by `CLAUDE.md`'s rule -- but the three absence sweeps
are exactly the shape it names, so they have it, twice over.

- **The planted controls inside the file** are the first half, and they run on
  every suite run rather than once.
- **Two mutants of the file itself** are the second. Dropping
  `coin_transactions` from the expected map reddens **4 of 14**; unanchoring
  `TEST_SHAPED` reddens **1 of 14** (the instrument's own negative control, the
  one whose whole job is to notice). Both restored from a `cp` copy in the
  scratchpad and md5-verified byte-identical -- never `git checkout --`, which
  restores from HEAD and discards uncommitted work silently.

## What is explicitly NOT verified

- **Production.** The local `.env` points at a placeholder project and there is
  none in a cloud checkout at all. Everything above is the migration chain
  applied to an embedded Postgres. **Whether production's `pg_policies` matches
  is not derivable from this tree** -- `tools/deploy-probe.mjs` is the
  instrument, and the verification query below is the one to paste into the SQL
  editor. If production carries a coin policy this chain does not produce, that
  is a policy created outside the migration record, which is a finding of a
  different kind and would need its own decision.
- **No browser pass**, and none is owed: the bundle touches no surface.
- **No migration was applied**, because none was written.

## Deferred, and named so it is not mistaken for done

- **`CLAUDE.md`'s svelte-check baseline** (above), owned by nobody in this round.
- **The two `using (true)` coin reads are pinned, not argued.** `read coin
  categories` and `read coin contracts` are open to every signed-in account and
  both migrations call that deliberate. This bundle asserts the set is exactly
  those two so a third is a decision somebody has to make; it does not revisit
  the two.
- **The other fifteen coin tables get the map and no field-by-field pin.** The
  ledger is the one that carries a balance, so it is the one pinned in detail.
  Widening that to every coin table is a bigger file and a different argument.
