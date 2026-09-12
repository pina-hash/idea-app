---
title: "IdeaCAD durable action history: undo that survives a reload, an append-only log, and 220 measured bytes an action"
date: 2026-09-12
branches: [claude/inspiring-archimedes-0n4o81]
migrations: ["0209"]
subsystems: ["IDEACAD", "Classroom"]
---

Mr. Pina, 2026-09-12, in his words: every action a student takes should be undoable, like
SolidWorks or Fusion 360, with a history you can scroll through, at **maximum resolution**,
going **all the way back to the creation of the part**.

What existed was ledger 0171's undo/redo, fifty deep, **in memory only**. Close the tab and it
is gone. This bundle is the durable half: `0209_ideacad_history.sql`,
`src/lib/ideacad/history.ts`, and a history region inside the store ledger 0170 built. No
`.svelte` file changed; the timeline UI is the next bundle.

## The audit the prompt asked for, before anything was built

**`ui/undo.ts` (0171) is 102 lines and holds two plain arrays.** Its depth cap is 50, a new
push CLEARS the redo future, and `clear()` drops everything when another concept is loaded. Two
of its three decisions survive into the durable design unchanged and one is deliberately
reversed: the log does **not** clear a redo future on a new edit, because nothing is thrown away
to clear. Its most important line is the one about RESOLUTION -- what is on the stack is the
ACCEPTED tree, never the draft, because a stack fed by a slider preview needs forty presses of
Ctrl+Z to undo one decision. That argument is unchanged and is why this log records the accepted
edit rather than the mouse.

**`store.ts` (0170) is 270 lines**, with a 750 ms autosave debounce, a revision-keyed stale
check, and a terminal `conflict` phase that deliberately leaves the local row untouched and
exposes the server's beside it. Two things about it decided the shape of this bundle: `edit()`
takes a WHOLE TREE (which is why a diff was the right seam and no `.svelte` file had to change),
and `write()` already captures `sentRevision`/`sentFeatures` before its await (which is where the
pending action queue had to be captured too, or edits made during a write would be sent twice or
dropped).

## Store actions, never geometry

A row is a parameter change -- which feature, what changed, the new value, who, when. Not a mesh,
not a serialized tree. The budget, worked out with Mr. Pina: at ~400 bytes an action, 100 students
across three projects a year is about 192 MB against a 500 MB tier shared with coins, notebooks,
Foundry and tournaments, and that holds **only** while a row is an action.

**Measured, against real Postgres: 220.5 bytes per action.** `pg_total_relation_size` delta --
heap, both indexes, page overhead, all of it -- across 3,826 rows written through the real RPC,
divided by the rows that produced them. 165.2 bytes of tuple data, 57.8 bytes of index. Projected
at the budget's own scale it is **106 MB against the 192 MB assumed**. Nothing was capped.

The figure is a `pg_total_relation_size` delta rather than a `pg_column_size` sum on purpose:
`pg_column_size` answers the size of the tuple's DATA and leaves out the 24-byte heap header, page
overhead, and both indexes -- the primary key on `(concept_id, seq)` and the partial unique index
on `(concept_id, undoes_seq)`. Ignoring those understates the real cost by about a third, which
is the comfortable answer rather than the true one. The corpus is 1,400 edits on purpose too:
Postgres allocates in 8 KB pages, so a few hundred rows would be a measurement of quantisation.

**One correction to the prompt's own arithmetic, said plainly.** It described a snapshot as
"roughly a hundred times larger". Measured against today's blade tree it is **six** times -- 934
bytes for the stored tree against 165 bytes of tuple data for an action row -- because that tree
is six features of scalars and is the smallest document this editor will ever hold. The direction
of the argument survives and the magnitude does not: a snapshot row grows with the part while an
action row does not, so six is a floor that rises as IdeaCAD grows, and the assertion is written
as a floor for that reason. The decision is unaffected (3,826 snapshots would have been 3.6 MB
where the log is 844 KB), but the number is now measured rather than quoted.

**There is no pruning and no retention.** He said as far back as possible. Nothing in the
migration deletes a row, ages one out or caps a log, and a later file that wants to is making a
decision rather than tidying up. Because the measurement came in at 55% of budget, there was
nothing to raise with him.

## Undo appends an inverse; it does not move a pointer

The rejected design is a per-document cursor: undo decrements it, redo increments it, a fresh
edit truncates the future. It is smaller and it is wrong twice over here. It **discards history**,
which is exactly what "as far back as possible" refuses; and a cursor is one mutable cell that two
editors of a 0205-shared document fight over, where appends serialise on their own.

So an undo is an ACTION: it appends the INVERSE of its target and names it in `undoes_seq`.
Nothing is ever deleted or rewritten, which makes this append-only in the sense
`coin_transactions` and `notebook_entry_notes` are. Four presses over two edits leave six rows.
That is the price and it is the point.

The property that falls out and is worth the most: **replay is oblivious to undo.** Reconstructing
the state at any point is applying rows 1..k on top of the origin, with no special case for an
undo row anywhere in it. That is what makes a scrub cheap and what makes the scrub-versus-unwind
equality test mean something.

### The subtle part is parity, and it was wrong first

A row's DEPTH is 0 with no target and one more than its target's otherwise. A chain 2 <- 3 <- 4 <-
5 has depths 0, 1, 2, 3. **Even depth means the action is applied** (0 is the edit, 2 is a redo);
**odd means it is undone** (1 is the undo, 3 is the undo of a redo).

The shallower rule -- "a row whose target is itself an inverse is a redo" -- was written first and
is wrong at depth 3: it classifies an undo-of-a-redo as a redo, so after undo/redo/undo the
student is told there is nothing to redo with their work one press away. Caught by the four-step
trace in `tests/ideacad-history-fold.test.ts`, which walks press by press rather than asserting an
end state, because an end-state assertion passes on a fold that was wrong in the middle and
happened to come back. **Mutation-proved**: reverting `history.ts` to the shallow rule reddens
exactly steps 3, 4 and 5 and nothing else; the file was restored from a copy (never
`git checkout --`) and md5-checked.

## The tree and the log move in one statement

`ideacad_apply_actions(concept, actions, features, revision)` writes both in one transaction, and
that is the whole of what makes the correctness claim a property the schema upholds rather than
one a client promises. Two RPCs would leave a window where one landed and the other did not, and
the failure is silent: the document renders perfectly and its history quietly no longer describes
it.

`ideacad_save_concept` is **left exactly as 0205 wrote it.** It is the arity a deployed client
already calls, so there is no deploy ordering at all -- the migration and any deploy are
independent events and either may go first. A deployment carrying 0209 with an older client keeps
saving through it and simply accrues no history, which is the feature being off rather than
broken.

## The origin is a trigger, and that is a census argument

Seq 0 carries the tree the part was created with -- the one snapshot in the design, one per
concept, and unavoidable, because "all the way back to the creation of the part" is not
answerable without it. Amortised over the hundreds of actions that follow it, it is noise.

It is written by an `after insert` trigger on `ideacad_concepts` rather than by a line in each
RPC because **four functions across three migrations create a concept** -- 0201's
`ideacad_open_document` and `ideacad_new_concept`, 0207's `ideacad_add_part` and
`ideacad_new_part_concept` -- and a fifth will exist the day somebody adds one. The trigger
catches paths written after this file. This is **not** the derived-state trigger `CLAUDE.md`
warns about: that rule is about a mutable column drifting silently, and this writes an
append-only record of an event whose absence is loud (replay has no floor, and a test asserts
every concept every creation path makes has one).

Two CHECK constraints make the floor structural in both directions: `(kind = 'origin') = (seq =
0)`, so no second origin can reset a log mid-stream and no plain action can sit at seq 0; and
`undoes_seq > 0`, so the creation of the part cannot be inverted. `invertAction` refuses it in
TypeScript for the same reason, and the constraint is the half a hand-written call cannot route
around.

## The four things, each a test

1. **Undo after a page reload.** A second store instance with no shared memory opens, reads the
   log, folds it, inverts and appends. `tests/db/ideacad-history-store.test.ts`.
2. **Two editors, one coherent ordered log.** 24 interleaved batches across the owner and a 0205
   `editor` grant land in one 0..n sequence with no gap, duplicate or tie; every row names its
   author and both are genuinely in it (a log with one author would pass an ordering check on its
   own); and the sequence replays to the tree the two of them left. Two simultaneous batches at
   the same revision: exactly one lands whole, the other is refused whole. The serialisation point
   is the `for update` on the concept row that `ideacad_save_concept` has held since 0201.
3. **A deleted part keeps its history.** `ideacad_delete_concept` soft-deletes; every row survives
   byte for byte and still replays, for the teacher too. The FK is `on delete cascade`, which
   WOULD take the history, so the file also sweeps `prosrc` and asserts no function in the schema
   hard-deletes a concept -- with a positive control that the same sweep does find
   `ideacad_unshare_document`'s delete, so "found nothing" cannot be "looked in the wrong place".
4. **A scrub agrees with undoing back.** `stateAt` (forward from the origin) and `unwindTo`
   (inverting from the current tree) are different code over different rows and nothing but a test
   makes them agree. Compared at **every** point of a 360-action corpus (361 comparisons) in the
   pure suite, and at 52 points over the real rows.

**And the claim itself:** replaying the stored log equals the stored tree, over 220 accepted edits
producing 360 action rows. The two sides are produced by genuinely different code, and the corpus
(`tests/ideacad-history-corpus.ts`) is a plain mutator that imports nothing from `history.ts` --
a corpus built from the action machinery would make the claim circular.

**One thing the paging test turned up that is worth keeping:** a partial page **cannot** be
replayed, and must not appear to be. `ideacad_concept_history` always includes seq 0 so a replay
has its floor, which means a caller who paged and replayed anyway would get origin-plus-the-newest-
ten -- a perfectly plausible-looking document that never existed. `applyAction` refuses to walk
onto a parent that is not there, which turns that loud instead of plausible, and
`readWholeHistory` is the loop that turns a paged read back into a replayable log.

## The race is closed by an index

Two editors pressing undo at the same moment would otherwise both invert the same row and apply
that inverse twice. `ideacad_history_undoes_once_idx` is a partial UNIQUE index on `(concept_id,
undoes_seq)`: the loser loses on the constraint and re-reads. Same shape 0134 established -- the
unique index IS the serialisation point and the only question is who apologises for it. The RPC
also raises a readable sentence ahead of it, and the test asserts BOTH, because a sentence that is
the only thing holding a rule is a rule one hand-written insert routes around.

## Grants: 0166's shape, and the paste trap demonstrated rather than cited

`revoke all on function ... from public, anon, authenticated` by name, then grant back
deliberately -- and the same for the table, because the identical hosted bootstrap carries
`grant all on tables`. `ideacad_apply_actions` and `ideacad_concept_history` are CLIENT;
`_ideacad_history_origin` is DEFINER (a trigger function: nothing calls it by name, the executor
fires it) and holds no client grant at all. It sits on the `_ideacad` prefix, so 0206's sweep sees
it and would have reddened had it kept the inherited anon grant.

**Section 8 checks the trap two ways against a planted control.** Way one plants a scratch
function, narrows it with `revoke ... from public` ALONE, reads `anon` back -- TRUE, the trap,
demonstrated on this database in this transaction -- then narrows it in 0166's shape and reads
FALSE, then drops it and asserts it is gone. That half REPORTS rather than raises, because a
database without the hosted default privileges legitimately closes on the old shape and refusing
to apply over a fact about the environment is the 0202 mistake in a milder costume. Way two reads
`anon` EXECUTE on this file's own three functions and every table privilege on `ideacad_history`,
and RAISES, because that is a fact about this file's own work. The positive control
(`app_short_link_target`, anon-granted on purpose since 0137) runs FIRST and raises, because a
sweep that cannot see a grant reports the same clean result as a database that has none.

0206 itself is **not** edited -- it is an applied record, and it will report these three under its
"on neither list" NOTICE, which is the designed reading. The strict half is
`tests/db/ideacad-grants-anon-execute-surface.test.ts`, which DOES fail on an unclassified ideacad
function; confirmed in both directions (1 failed / 29 passed without the classification, 30 passed
with it).

## What was measured, and what was not

- `svelte-check`: **0 errors, 37 warnings in 20 files**, 31 `state_referenced_locally` / 5
  `css_unused_selector` / 1 `perf_avoid_nested_class`. Re-derived on `origin/integration` at
  branch time after exporting placeholder `$env/static/public` values and syncing; unchanged
  after the bundle.
- Full suite: **433 files / 8318 tests green** on `origin/integration` at branch time.
- **Not applied anywhere.** This container cannot reach production and did not try. Every
  database figure is the real migration file against real embedded Postgres through the harness.
- **No browser pass.** There is no surface -- the prompt forbids a `.svelte` file and the
  timeline is the next bundle -- so `npm run verify:browser` would have measured nothing this
  bundle changed. Stated rather than skipped silently.
- `ui/undo.ts`'s in-memory stack is **untouched and still live.** Retiring it in favour of the
  durable log belongs with the timeline.

## A flaky test this bundle rolled, which was not this bundle's

`tests/db/html-assignment-manifest.test.ts` asked for the `classroom_items` kind constraint with
`pg_get_constraintdef(oid) like '%kind%' limit 1` and **no ordering**. Five constraints on that
table mention `kind`, so the query returned an arbitrary one and the test had been passing on
whichever the plan handed back; the final suite run drew `classroom_items_public_is_material` and
the `toContain("'assignment'")` assertion failed.

**Measured before touching it**, on two databases built side by side with and without 0209: five
matching constraints in both, the same arbitrary pick in both. The migration is not the cause; the
unordered `limit 1` is, and this bundle only rolled it. Fixed by naming the constraint, which is
what the test's own comment ("kind STAYS the three-value CHECK") claims it was doing all along,
with a not-null guard so a renamed constraint reddens rather than reading as a sweep over a null.

Worth writing down because the shape recurs: **an unordered `limit 1` over a catalog is not a
query, it is a sample.** A test that passes on it has not been passing, it has been winning.

## What `CLAUDE.md` will want, when a bundle that owns it lands

Not written here: `CLAUDE.md` is not in this bundle's ownership and is the repo's
highest-collision file. The paragraph it wants, ready to paste under the IDEACAD section:

> **IDEACAD'S HISTORY IS AN APPEND-ONLY ACTION LOG AND STORES ACTIONS, NEVER GEOMETRY (0209).**
> `ideacad_history` is one row per parameter change -- which feature, what changed, the new value,
> who, when -- keyed `(concept_id, seq)` with seq 0 the ORIGIN, the one snapshot, written by an
> `after insert` trigger so every one of the four concept-creating RPCs is covered. **Measured at
> 220.5 bytes an action** (heap plus both indexes) against a 400-byte budget; a snapshot per action
> is six times that on today's blade tree and rises with the part. **UNDO APPENDS AN INVERSE, IT
> DOES NOT MOVE A POINTER** -- nothing is ever deleted, because Mr. Pina asked for all the way back
> to the creation of the part (2026-09-12), and **there is no retention and no pruning**; adding
> either is his decision, not a default. A row's DEPTH parity decides whether it is applied (even)
> or undone (odd), and the shallow "its target is an inverse so it is a redo" rule is wrong at
> depth 3. `ideacad_apply_actions` writes the actions AND the tree in ONE statement, which is what
> makes "replay from the origin equals the stored tree" a property rather than a promise;
> `ideacad_save_concept` is unchanged, so there is no deploy ordering and a pre-0209 deployment
> simply accrues no history. A PARTIAL PAGE CANNOT BE REPLAYED and `applyAction` refuses rather
> than inventing the missing container.
