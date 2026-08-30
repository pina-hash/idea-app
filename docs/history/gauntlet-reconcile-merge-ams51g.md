---
title: "Two branches, one 0158: reconciling duplicate reconciliations, and the third instance of a chain constant that had stopped meaning what it said (`claude/gauntlet-reconcile-merge-ams51g`)"
date: 2026-08-29
branches: [claude/gauntlet-reconcile-merge-ams51g, claude/gauntlet-submit-reconcile-mzqr4t, claude/anon-coin-public-projections-mrlg0d]
migrations: ["0158"]
subsystems: ["GAUNTLET", "Testing", "Migrations"]
---

**Starting state, checked before anything else.** `git fetch origin`: `HEAD` and
`origin/main` both at `2113f4d`, `origin/integration` at `a816a98`. Branched
from `origin/integration`. Working directory `/home/user/idea-app`.

Two branches each carried a file numbered `0158_gauntlet_submit_reconcile.sql`,
written without sight of one another, both repairing the same defect: `0151`
redefines `gauntlet_submit` from a base of `0147` and so silently reverts
`0148`'s server-stamped knowledge clock.

    claude/gauntlet-submit-reconcile-mzqr4t     b9b121c
    claude/anon-coin-public-projections-mrlg0d  74faca9

Both branch off `d61cd91` and each adds exactly one commit.

### What the file list actually showed, which was not what the brief predicted

The brief said `mrlg0d` also carried five test edits from a queued-migration
sweep that "must survive". **They were already on `integration` and needed
nothing done to them.** `d75aa1f` ("Testing: sweep every test chain against the
six migrations waiting to be applied") is the parent of `integration`'s tip
merge, and `mrlg0d` was subsequently rewritten to sit directly on `d61cd91` --
so `d75aa1f` is an ancestor of `integration` and *not* of `mrlg0d`'s current
tip. Verified per file rather than by reasoning: `tests/coin-public-ledger`,
`gauntlet-authoring-tolerance`, `gauntlet-mode-ranked-parity`,
`gauntlet-modeling-reveal` and `gauntlet-run-review-route` are byte-identical
between `d75aa1f` and `origin/integration` (md5 per file). Branching from
`integration` carries them; nothing was ported.

## The claim that both reports made, verified

Both sessions reported the other's `0158` as identical in executable SQL,
differing only by an eight-line comment and a blank line.

**That is true of the `gauntlet_submit` FUNCTION, and false of the FILE.**

Extracting each function definition, dropping full-line comments and blank
lines and collapsing whitespace gives **145 lines with the same md5
(`4049ecd7fc3d44d668c1a898d1d8e12d`) on both sides**. Not one executable line
of the function differs. Two derivations that shared no author and no method
converged on the same body, which is the strongest available statement about
this reconciliation.

The **scaffolding around it did not agree**, and the same strip over the whole
file leaves 200 lines against 206 with substantial differences in three places:

* **the precondition guard** -- `mzqr4t` raises on the first missing dependency
  and pins the helper's exact signature with `to_regprocedure(...)`; `mrlg0d`
  accumulates both missing dependencies into one message and matches the helper
  by name only;
* **the self-checks** -- different probe strings, different arrangement, `mzqr4t`
  splitting the ACL into its own `do` block;
* **the transaction** -- `mrlg0d` wraps the file in `begin;`/`commit;`,
  `mzqr4t` does not, and `mzqr4t` adds a `comment on function`.

So one had to be chosen rather than either taken as interchangeable. Both
self-check sets were confirmed to bite before choosing: every probe string each
set uses is present in the merged body and absent from `0151`'s reverted body,
counted in both.

### Which file shipped, and why

**`mrlg0d`'s.** Its derivation is a named, rerunnable command -- a three-way
merge over `0147`, the genuine common ancestor of the two conflicting bodies
(`git merge-file 0148.body 0147.body 0151.body`). `mzqr4t` reached the identical
body by splicing five clauses out of `0148` into `0151`'s text by hand: correct,
as the md5 proves, but auditable only by redoing the splice and trusting the
result. A reconciliation nobody can re-run is a third definition of the
function.

It also carries the eight-line comment recording conflict 2 of that merge (why
`0151`'s sentence was kept above `0148`'s code), which is a comment explaining a
merge decision and therefore worth keeping.

The file ships with a **provenance header** naming both branches, both shas, the
md5 equality above, and -- itemised -- what the other branch's scaffolding had
that this one does not. A dropped check recorded in the open is a decision; a
dropped check nobody wrote down is a regression.

## The measurement that changed one decision

The provenance header's first draft argued that `mzqr4t`'s self-check on
`now() - v_start.started_at` was redundant against `mrlg0d`'s `client_elapsed_ms`
and `answered_at = coalesce(...)` checks. **The mutation proof said otherwise,
and the file changed rather than the claim.**

Removing the clock recomputation and changing nothing else leaves
`gauntlet_knowledge_starts`, `client_elapsed_ms` and the `answered_at` close all
textually in place. Measured: **all four of the original self-checks passed, the
migration installed cleanly and reported success, and the body had gone back to
scoring `p_elapsed_ms`** -- the exact defect the file exists to repair, applying
with a green notice. Four tests in the suite reddened instead.

With `mzqr4t`'s check added, the same mutant is **refused at apply time**:

    0158 did not take: the knowledge elapsed is not stamped from the stored
    start row, so the clock is the caller's again.

and the suite goes from 4 failures to 13 (the chain cannot be built at all).
That one `if` is **the only executable line in the file not from `mrlg0d`'s
branch**, and the measurement is recorded beside it in the migration.

**An honest limit, stated because it is not fixed.** The meter half has no
equivalent apply-time check. Disabling the refusal (`if false and ...`) leaves
`_gauntlet_practice_min_interval()` textually present, so the `prosrc` probe
still passes and the migration installs. The meter's presence is proven
**behaviourally by the suite** -- 5 tests redden across both files -- not by the
migration's own self-check. A `prosrc` string check cannot tell a live guard
from a dead one, and inventing a cleverer string would be a check that looks
stronger than it is.

## The two shared test files, merged by content

The two sessions did **not** write the same thing, and neither file was picked
whole.

### `tests/gauntlet-practice-meter.test.ts`

Both appended `0158` to `CHAIN` and both fixed the `CHAIN_BEFORE` hazard, by
different means:

* `mzqr4t` filtered `0151` and `0158` out of `CHAIN`;
* `mrlg0d` **truncated at the named file**, `CHAIN.slice(0, CHAIN.indexOf('0151...'))`,
  with a throw if `0151` is not on `CHAIN` at all.

**Took `mrlg0d`'s.** Today the two produce the identical chain, since `0151` and
`0158` are the last two entries -- but a filter keeps everything after the
removed file, so appending an `0159` that depends on `0151` would build a state
no operator can reach. A truncation cannot. `mrlg0d`'s reasoning for this ("a
truncation and not a filter") is kept verbatim, and a stale one-line doc comment
it had left stranded above the new block was removed.

Both sessions then fixed the same real defect in the knowledge-mode test: it
submitted three knowledge answers with **no start row** and required all three
to resolve, which is only true of a body with no clock in it. The chain was
manufacturing the evidence for its own assertion.

* `mzqr4t` asserted the refusal **first**, then started the question, then made
  the original three-resolve claim.
* `mrlg0d` started the question and kept the three-resolve claim.

**Merged to `mzqr4t`'s ordering on `mrlg0d`'s comments**: the refusal assertion
is what makes the three resolves mean "unmetered" rather than "ungated".

Both new tests were kept, because they assert different things:

* `mrlg0d`'s **"THE TWO REFUSALS ARE DIFFERENT"** -- the unstarted refusal is the
  clock's, not the meter's, told apart by the sentence raised;
* `mzqr4t`'s **"scores a knowledge answer on the SERVER clock"** -- the number
  the clock produces is the server's, including the zero case the deployed
  client would actually hit by omitting `p_elapsed_ms`.

### `tests/gauntlet-knowledge-clock.test.ts`

Here the two approaches were in **genuine tension**, and this is the one place
the merge is neither file.

* `mrlg0d` widened `CHAIN_0148` itself to run through `0158`, so all ten
  existing assertions exercise the reconciled body. Minimal diff, maximum
  coverage.
* `mzqr4t` left `CHAIN_0148` alone and added `CHAIN_TODAY` and `CHAIN_REWOUND`
  plus four new tests, including a **positive control asserting the rewound
  (broken) world**.

`mrlg0d`'s widening has a cost its own diff does not show. `seed(chain, extraSql)`
applies the mutant **after** the chain, and both mutants here are derived from
`0148`'s text. With `0158` on `CHAIN_0148`, a mutated `0148` is pasted **over**
`0158`, putting a body carrying no practice meter in front of the assertions:
the mutation proof still passes and has silently stopped describing the shipped
function. `mzqr4t` flagged exactly this in its own comment.

**So the merge takes both and pays neither cost.** `CHAIN_0148` keeps its
truthful definition and survives for exactly two uses that need `0148` last --
the before/after pair (whose subject is what `0148` changed against `0147`) and
the two mutants. The **ten plain `seed()` calls were repointed to `CHAIN_TODAY`**,
which is `mrlg0d`'s coverage fix achieved without touching the mutants.
`CHAIN_TODAY` uses `mrlg0d`'s fuller list (`0152` through `0155` included, which
is what production will actually have between `0151` and `0158`), and
`CHAIN_REWOUND` is derived from it **by truncating at `0158`** rather than by
`slice(0, -1)` -- the same hazard, not reproduced in the file that fixes it.

All four of `mzqr4t`'s new tests were kept.

## The third instance of the chain hazard

Both reports predicted a third `CHAIN_BEFORE = CHAIN.slice(0, -1)`. Swept
`tests/` for the spelling; there is exactly one live instance left and it is
**`tests/gauntlet-author-tier-routes.test.ts:78`**, "the chain one file short of
`0155`". Fixed the same way: truncate at the named file, with a guard against
`indexOf` returning `-1`.

**It is not a live failure.** Nothing appends to that `CHAIN` today, so the
constant is still correct as written. This closes it while it is cheap. The
failure mode if it were left is the quiet one: `dbBefore` becomes a second copy
of the after-world and the absence assertions pass because `0155` is applied.

After the fix, every remaining `slice(0, -1)` match under `tests/` is inside a
comment describing the defect.

## Verification

**Baseline, `origin/integration` `a816a98`, clean tree, full suite in the
foreground:**

    Test Files  3 failed | 202 passed (205)
         Tests  3 failed | 4284 passed (4287)
      Duration  165.89s

**After, same command:**

    Test Files  3 failed | 202 passed (205)
         Tests  3 failed | 4290 passed (4293)
      Duration  167.57s

**+6 tests, all passing, and the same three failures** -- four added to
`gauntlet-knowledge-clock` and two to `gauntlet-practice-meter`, which is
exactly the merged set. All three failures are **inherited, none are mine**:

* `tests/dom/item-detail-ondeleted-mount.test.ts` -- fixed on
  `claude/itemdetail-delete-ack-test-4xdpx2`;
* `tests/coin-public-board-anon-projection.test.ts` and
  `tests/coin-public-surface-hardening.test.ts` -- both the same
  `expected '42501' to be 'PGRST202'` assertion, fixed on
  `claude/permission-denial-assertions-zq6yks`.

Each was reproduced on the baseline run before any of my changes existed, and
re-confirmed afterwards by running the three files on their own: same three
files, same three assertions, same messages. None of them is in this branch's
diff.

**`svelte-check`, re-derived rather than trusted**, with the two placeholder
env values exported before `svelte-kit sync`: **0 errors, 37 warnings**,
breaking down 31 `state_referenced_locally` / 5 `css_unused_selector` / 1
`perf_avoid_nested_class`. Unchanged from the documented baseline.

### Mutation proof

Run per the standing rules: mutants derived from `0158`'s real text, pristine
copies held **outside the repo** in the scratchpad, restored from those copies
and md5-checked, **never `git checkout --`**. DB files run with
`--no-file-parallelism` throughout.

| | result |
|---|---|
| shipped | clock scores the server's ~6s and ignores a claimed 999999ms; second practice check refused |
| clock removed | client's 1000ms scored as `1`; **omitted** parameter scores `0` -- the production defect reproduced |
| meter removed | three back-to-back practice checks all resolve |
| clock removed, against the shipped suite | **4 tests redden across both files** |
| meter removed, against the shipped suite | **5 tests redden across both files** |

The cross-file reddening is what the merge bought: before it, the practice-meter
suite had no assertion that could detect a rewound clock.

**One instrument defect found and fixed mid-proof, worth recording.** The first
probe extracted the function with
`indexOf('create or replace function public.gauntlet_submit')` and got
`syntax error at or near "/"`. The header quotes that exact phrase inside the
`awk` reproduction line, so the extraction started **mid-comment**. The file's
own header anchors its `awk` at line start for this reason; the probe now
matches with `^`.

`0158` restored to `7480f62d794b295d84872d8d5354a0bf`, verified against the
scratchpad copy. The three test files were never mutated and were md5-confirmed
unchanged across the whole proof. The probe file was deleted.

## Not verified

* **`0158` HAS NOT BEEN APPLIED.** It is not on the live Supabase project. The
  local `.env` is the placeholder `example-ref`; nothing in this session could
  apply a migration, run an RPC or sign in against production. Every claim above
  is from the embedded-Postgres fixture with the real migration files applied
  unmodified.
* No browser pass. This bundle changes no rendered surface -- one migration and
  three test files -- so `npm run verify:browser` had nothing to measure.
* No classroom-facing behaviour changed, so no `classroom-updates.json` entry.

## Deferred, and named rather than done

* **The meter has no apply-time self-check**, per the honest limit above. Giving
  it one means a check that can tell a live guard from a dead one, which a
  `prosrc` `like` cannot. That is its own piece of work.
* **`mzqr4t`'s `comment on function`** was not adopted. It would put the
  reconciliation in the database where `\df+` shows it, which is a real
  convenience; it is left out because it is not needed for correctness and this
  file already takes one line from that branch under a measurement.
* **`mrlg0d`'s dependency guard matches `_gauntlet_practice_min_interval` by
  name, not by signature.** In every state reachable today those are the same
  question, since `0151` creates exactly one such function and it takes no
  arguments. It would begin to matter only if that helper gained an overload.

## What supersedes what

This branch carries both bundles' work exactly once and **supersedes both source
branches**. `claude/gauntlet-submit-reconcile-mzqr4t` and
`claude/anon-coin-public-projections-mrlg0d` should be **deleted unmerged** --
merging either after this one would reintroduce a second `0158` and a second
copy of the two test files' edits.

Neither source branch's history entry is carried. Both describe deriving a
`0158` that did not ship in the form they describe, and two entries each
claiming to be the record of this migration is the same duplication one
directory over. Their substance -- both derivations, the md5 equality, the
scaffolding differences -- is folded in above.
