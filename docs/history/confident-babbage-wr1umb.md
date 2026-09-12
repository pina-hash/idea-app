---
title: "0206: replacing 0202's apply-time check, and the two incidental properties that were never the point"
date: "2026-09-12"
branches: ["claude/confident-babbage-wr1umb"]
migrations: ["0206"]
subsystems: ["IdeaCAD", "Database", "Testing"]
---

Ledger 0181. Ledger 0179 built IdeaCAD document sharing, ran its suite, found one file red
that had been green in its baseline, diagnosed it precisely, built a candidate fix, verified
it as far as it goes, and then **reverted it byte-identically and named the blocker rather
than reaching into two files it did not own** -- one of them an APPLIED migration. This
bundle owns those two files and closes it.

One migration, `0206_ideacad_grant_guard.sql`, claimed and taken. No `.svelte` file and no
file under `src/` at all. `0202`'s text is not touched.

## The blocker, confirmed before anything was changed

`0202` section 4 sweeps every function matching the ideacad name prefix and asserts three
things about what it finds:

1. **Zero of them are executable by `anon`.**
2. Exactly **ten** of them exist.
3. **Every** one of them is executable by `authenticated`.

(1) is the property `0202` was written for. `0201` invented its own revoke shape, lost the
`anon` clause, and all ten of its functions came out anon-executable on production.

(2) and (3) are facts about `0201`'s world -- ten functions, every one of them called from a
browser -- and `0205` ends both. It adds nine: five sharing RPCs, two predicates named
inside RLS policies, and **two definer-only predicates that withhold the `authenticated`
grant deliberately**, because nothing but a SECURITY DEFINER body ever calls them.

Reproduced first, on a scratch worktree with `origin/claude/great-bell-ppysbn` merged in and
nothing else changed:

    error: 0202: expected 10 ideacad functions in public, found 19.
    Test Files 1 failed (1) / Tests 14 skipped (14)

Fourteen skipped rather than failed, because the failure is in `beforeAll` and the fixture
never builds -- which is exactly the shape ledger 0179 reported.

## What 0206 is

**A guard and nothing else.** It creates no object and moves no grant. After `0202` and
`0205` there is nothing left to repair: `0202` narrowed `0201`'s ten functions and four
tables, `0205` narrowed its own nine and its one table, both in `0166`'s shape. That was
measured rather than assumed -- the guard passes on the real chain with no privilege
statement in front of it. So no grant moved and `0166`'s shape had nothing to be applied to.

The three assertions are split by **which kind of claim each one is**:

- **The `anon` property is UNIVERSAL and is swept BY PREFIX, with no count ceiling.** A
  migration that adds an ideacad function and forgets `0166`'s revoke shape should redden
  here, including one written after this file. That is a property every future ideacad
  migration ought to uphold, and one failing it is genuinely broken.
- **The `authenticated` requirement is checked against an EXPLICIT NAMED LIST**, by
  signature, split `client` / `definer`. `client` means a browser reaches it -- either
  PostgREST calls it as an RPC, or an RLS policy names it, which imposes the same
  requirement for a different reason: a policy expression is evaluated as the querying role,
  so a predicate in a `using` clause must hold the grant or the read fails with `permission
  denied for function` instead of returning the caller's own rows. That is `0109`'s lesson
  about `classroom_can_read_item`. `definer` means nothing but another definer body calls it.
- **The count is gone entirely.** There is no number in the file a later migration has to
  come back and bump.

**An unclassified ideacad function raises a NOTICE, not an exception**, and that is the
whole of what stops this file becoming the next `0202`. `0205`'s own header states the
general lesson and this file is built on it: an apply-time guard that sweeps a whole
subsystem by name prefix is asserting something about migrations that do not exist yet. A
future migration's own helper is not this file's to have an opinion about.

**The strict half of that decision lives in the test instead**, which DOES fail on an
unclassified ideacad function. A test is editable in the same commit that adds the function;
an applied migration is not. That asymmetry is deliberate and it is the point.

## The one thing the first draft got wrong, and the measurement that said so

The first draft **RAISED** if any classified object was absent, reasoning that a guard
sweeping a population which is not there yet reports exactly what a clean database reports.
The reasoning is sound; the instrument was wrong.

`0205` sits on an unmerged lane. This branch carries `0206` and not `0205`, which is an
ordinary state in a repo where migrations are applied by hand one file at a time -- and the
raise made `0206` un-appliable on it. Measured, on a tree that was perfectly legitimate:

    Migration 0206_ideacad_grant_guard.sql failed to apply:
      0206: 10 classified ideacad object(s) do not exist: ...
    Test Files 4 failed | 406 passed (410)

Four otherwise-green files down, three of them nothing to do with IdeaCAD. **It is the
`0202` mistake in a milder costume** -- a guard refusing to apply because of what ANOTHER
migration had or had not done. It is now a notice naming exactly what is absent, and the
guard sweeps everything that is there.

What replaces the vacuity protection it was buying: the prefix sweep for the `anon` property
does not consult the list at all, so it cannot go quiet by the list being wrong, and the
guard refuses outright if that sweep finds no ideacad function whatsoever.

**The order still matters and is reported rather than enforced.** Pasted before `0205` the
guard covers `0201`'s ten and says so; pasted after it, all nineteen. `0205` carries its own
self-check over its own nine either way, so neither order leaves a gap -- but only one of
them leaves this guard covering the whole subsystem.

## The guard driven to a refusal, four ways and back

A guard that only ever returns one value has not been tested. Each arm is a CATALOG edit
restored by its exact inverse; nothing under `supabase/migrations/` is written and no `git`
command is run, because a `git checkout --` inside a mutation script is a discard-to-HEAD
and has taken three sessions' uncommitted work in one week.

| Arm | Reading |
|---|---|
| unmutated chain | `APPLIED CLEAN` -- the control every other arm needs |
| `anon` granted on `ideacad_roster(uuid)` | `0206: 1 ideacad function(s) are executable by anon: ideacad_roster(uuid)` |
| `anon` granted on `_ideacad_document_role(uuid)` | named -- the definer half is not exempt from the `anon` sweep |
| `authenticated` revoked from `ideacad_share_document` | `0206: 1 client-callable ideacad function(s) LOST the authenticated grant: ideacad_share_document(uuid,text,text)` |
| `TRUNCATE` granted to `authenticated` on `ideacad_documents` | `... beyond authenticated SELECT: TRUNCATE on ideacad_documents` |
| **no mutation, definer-only helpers holding no client grant** | **`APPLIED CLEAN`** |

**The last row is the one the file exists for.** It is precisely the state `0202` refuses,
and the premise is measured before the assertion -- the two helpers are read out of the
catalog as holding no `authenticated` grant, and the count of them asserted greater than
zero, so the pass cannot come from there being nothing to admit.

Each refusal names **exactly** the mutated function: the test iterates every other ideacad
name and asserts none of them appears in the message. A guard that names the whole subsystem
whenever anything is wrong is not naming the defect. And a final arm re-reads the full acl
of every ideacad object and compares it to the pre-mutation reading, because a restore that
quietly did not land would leave the rest of the run measuring a mutated database.

## The discriminator, on one database

The cleanest single reading, both files re-pasted over the identical merged chain:

    === RE-PASTE 0202 (the applied record, superseded) ===
    REFUSED: 0202: expected 10 ideacad functions in public, found 19.

    === RE-PASTE 0206 (the guard that replaces its check) ===
    APPLIED CLEAN

## The test

### Section B: classified rather than counted

`has all ten functions and no more` and `keeps all ten executable by authenticated` were the
test-side twins of `0202`'s two incidental assertions, and they failed for the same reason.
Both are replaced.

What is pinned now is that every ideacad function has been **classified**. Adding one means
adding a row with the reason it is client-callable or definer-only -- a decision somebody
makes about the function in front of them, where bumping a count is a number somebody
changes until the test goes green. The `anon` assertion is unchanged and still universal.

A new arm asserts the definer-only helpers **withhold** the grant. Without it, `definer`
would be a pure exemption -- a way to make a failing assertion go away -- rather than a
claim about the schema that is itself measured.

The table assertions moved from a fixed four to a catalog sweep by prefix, so `0205`'s
`ideacad_grants` is covered without anyone remembering to add it. The other direction --
"`authenticated` still HAS select" -- stays NAMED, because a future ideacad table with RLS
and no client grant at all is a legitimate shape (`student_app_plays` is exactly that) and
sweeping would refuse it.

### Section E: widened, not re-pinned

The control is correct and is kept: `0201`'s ten are anon-executable on a chain with `0202`
left out, and zero are on a chain with it. `anon-executable ideacad functions -- with 0202:
0, without it: 10`.

It was an exact-set comparison, `toEqual([...the ten])`, **which is a count in another
shape**: it says as much about what ELSE is open as about `0201`'s ten, so a later ideacad
migration lands there for a reason that has nothing to do with `0202`. It is a containment
now.

**`0206` comes out of that control chain too, and not as a convenience.** The control
deliberately reconstructs the world where `0201`'s ten ARE anon-executable, which is exactly
the state `0206` refuses -- so leaving it in makes the chain fail to build and the control
measure nothing. Measured: `0206: 10 ideacad function(s) are executable by anon`, all ten
named, 22 tests skipped. A guard over the repaired world cannot sit in a chain that un-does
the repair. That the guard refuses there is itself evidence it bites, and section G asserts
it deliberately rather than leaving it as a build failure.

### Section C: the idempotence property moved with the check

It re-applied `0202` and compared the acl before and after. Once `0205` is applied that
raises, so the property moves to `0206`. It is not dropped, and `0202`'s file is not
rewritten.

### Section F: the seam

`0206` section 1 and the test's classification table are two independent statements of one
rule -- deliberately, because a test whose expected value comes from the thing it tests
cannot fail. Two independent statements are only worth having if something compares them, so
section F parses the migration's own `VALUES` list back out of the `.sql` file and
reconciles names and kinds both. It also asserts the parse returned a real list rather than
an empty one, and that no ideacad function is overloaded -- which is what makes it sound to
compare a signature-keyed list against a name-keyed one.

### The chain ladder

`EXPECTED_FUNCTIONS` filters the classification by whether the migration that creates it is
in `ALL_MIGRATIONS`, read off the FILES and never off the catalog -- deriving "is 0205 here"
from whether its functions turned up would make every assertion circular. That is the same
widen-then-degrade shape every client select in this repo uses, and it is what lets one file
be green on this branch, on `0179`'s branch, and on the merge of the two.

The vacuity premise for the definer-only arms is tied to the same signal. Asserting
`definer.length > 0` unconditionally reddens a legitimate chain; asserting nothing lets the
arm go quiet the day `0205` lands. Measured in both directions -- that assertion is what
failed first on this branch.

## The numbers

**This branch (0205 absent), full suite: 410 files, 7950 passed, 0 failed, 0 skipped.**
Baseline **410 files / 7935 passed / 0 failed / 475.95s**, measured on a clean `git worktree`
at `origin/integration` `b0a8101d` rather than in place. Delta **+15 assertions, +0 files** --
this bundle adds no test file, it rewrites one. 14 tests became 29.

**A first baseline attempt was thrown away and the reason is worth writing down.** It was
started in the background and then edited underneath: vitest transforms and imports files
throughout a run, so the "baseline" imported a test file this session had changed and a
migration it had added, and reported 4 failures that were this bundle's own. A baseline
measured in the tree you are editing is not a baseline. The one above is from a separate
worktree at the branch point, with nothing of this bundle in it.

**On the merged tree (`origin/claude/great-bell-ppysbn` merged into a scratch worktree, my
two files on top): the file that ledger 0179 left red is green -- 29 passed (29).** The
ideacad population there reads 19 functions, 17 client-callable, 2 definer-only, 0
unclassified, 5 tables.

**svelte-check: 0 errors, 37 warnings in 20 files**, at 31 `state_referenced_locally` / 5
`css_unused_selector` / 1 `perf_avoid_nested_class` -- identical before and after, which is
the expected result for a bundle that writes one `.sql` file and one `.test.ts`. **CLAUDE.md
says 38 in 21 with a 32/5/1 breakdown.** This is the sixth lane to measure a different
number than that line carries, the drift is entirely `state_referenced_locally` again, and
it has moved DOWN again. This bundle does not own `CLAUDE.md`, so it is reported rather than
corrected.

**Paste trap: zero, two ways, against three planted positive controls.** No comment line
carries a dollar-quote token and no comment line carries a bare `$` of any kind; the two
code tokens are one balanced `$guard$` pair. The controls: `$tag$` in a comment reads 1 on
way 1 and 2 on way 2, `$$` in a comment reads 1 and 2, and a lone `$` reads **0 on way 1 and
1 on way 2** -- so the two ways are genuinely independent and neither zero is vacuous.

**`node tools/claude-md-check.mjs`: CLAUDE.md agrees with the tree.**

## What is NOT verified

- **Neither `0205` nor `0206` is applied anywhere.** This container cannot reach production
  and did not try. `IDEA_MIGRATION_URL` is unset, so the applied set is CANNOT SAY from here
  and Mr. Pina reads it.
- **`0204` is not in any chain this bundle measured.** It is claimed by ledger 0177 on
  another unmerged lane. The chain here runs `0203`, `0205`, `0206` with a hole at `0204`,
  which the harness applies in file order without complaint. Nothing about `0206` reads a
  migration number.
- **No browser, no mounted surface, no screenshot.** This bundle writes no `.svelte` file, so
  `npm run verify:browser` was not run, and `verify:readme` was deliberately not run.
- **No signed-in session and no real Supabase project.** The `.env` in this container is the
  placeholder (`example-ref`).
- **The merged-tree measurement is the merge of two branches, not of two merged branches.**
  `origin/claude/great-bell-ppysbn` was merged into a scratch worktree and this branch merged
  on top. It proves the two files compose; it is not a claim about what `integration` will
  look like, and `0204`'s lane was not in it.

## What this does not fix, named rather than left to be found

**Once `0205` is applied, `0202` can no longer be re-pasted.** That is stated in `0206`'s
header rather than hidden. It is not repairable without editing an applied migration, which
is the rule this whole bundle is shaped by. What it costs is the ability to re-run `0202`'s
own check, and that is exactly what `0206` replaces -- so the property survives, on a file
that can be re-pasted.

**`0203_sequence_anon_grant_sweep.sql` was checked for the same wall and does NOT have it**,
which is worth recording because the first draft of this paragraph guessed that it did. Its
own self-check is `if v_checked <> 3`, and the three are sequences it NAMES and revokes
itself -- so it asserts "the three I named are all here", not "the schema contains exactly
three". A migration that adds a fourth sequence tomorrow does not move that number. **That
is the named-list shape `0206` adopts**, arrived at independently and already in the repo,
which is a better argument for it than anything in this entry: the file that did not pin a
population is the file that did not break.
