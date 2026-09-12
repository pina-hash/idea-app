# 0189 IdeaCAD durable action history: undo that survives a reload, all the way back to the creation of the part

- Issued: 2026-09-12
- By: router chat
- Owns: `supabase/migrations/0209_*.sql`, `src/lib/ideacad/history.ts` (new), the
  history region of `src/lib/ideacad/store.ts`, `tests/db/ideacad-history*`,
  `tests/ideacad-history*`, `docs/prompt-ledger/entries/0189-*`, and its own
  `docs/history/` entry. NO `.svelte` FILE -- the timeline UI is the next bundle.
- Migration permitted: exactly one. Claims: 0209. Highest on `origin/integration` and
  `origin/main` at issue: 0208, all of 0205 through 0208 applied.
- Status: pushed
- Branch: `claude/inspiring-archimedes-0n4o81`, cut from `origin/integration` at
  `7f5ca8f0`.
- Notes: Mr. Pina, 2026-09-12, in his words -- every action a student takes should be
  undoable, like SolidWorks or Fusion 360, with a history you can scroll through, at
  MAXIMUM RESOLUTION, going ALL THE WAY BACK TO THE CREATION OF THE PART. The single
  constraint that decides whether it fits: STORE ACTIONS, NEVER GEOMETRY. NO PRUNING
  AND NO RETENTION -- he said as far back as possible and pruning is his decision, not
  a default.

## Outcome

**Shipped, and the correctness claim is made rather than asserted: replaying the
stored log from the creation of the part equals the stored tree, over 220 accepted
edits producing 360 action rows, against real Postgres.** The two sides are
produced by genuinely different code -- the stored tree by
`ideacad_apply_actions` writing `ideacad_concepts.features`, the replayed one by
`stateAt` folding the rows `ideacad_concept_history` hands back -- and the corpus
is a plain mutator that imports nothing from `history.ts`, so the expected value
does not come from the thing under test.

**AND THE CORPUS EXERCISES ALL FOUR ACTION KINDS**, which is what stops the claim
being a sweep over one: 360 rows made of **310 `set`, 22 `move`, 15 `insert` and
13 `remove`**, across twelve distinct path shapes including nested array elements
(`/features/N/stations/N/z`) and feature reorders (`/features`).

**MEASURED: 220.5 BYTES PER ACTION**, heap plus both indexes plus page overhead,
by `pg_total_relation_size` delta over 3,826 rows written through the real RPC.
The budget was 400. At prompt 0189's own scale (480,000 actions = 100 students x
3 projects) that projects to **106 MB against the 192 MB the budget assumed**.
Nothing needed to be capped and nothing was.

**ONE CORRECTION TO THE PROMPT'S OWN ARITHMETIC, said plainly rather than rounded
past.** It described a snapshot as "roughly a hundred times larger"; measured
against today's blade tree it is **six times** (934 bytes for the tree against 165
bytes of tuple data for an action row). The direction of the argument survives
and the magnitude does not: a snapshot row grows with the part while an action
row does not, so six is a floor that rises as IdeaCAD grows. The decision is
unaffected -- 3,826 snapshots would have been 3.6 MB where the log is 844 KB --
but the figure is now measured instead of quoted.

**THE FOUR THINGS, each a test:**

1. **Undo after a page reload.** A second store instance with no shared memory
   opens, reads the log, folds it, inverts and appends. `tests/db/ideacad-history-store.test.ts`.
2. **Two editors of a shared document produce one coherent ordered log.** 24
   interleaved batches across the owner and a 0205 `editor` grant land in one
   0..n sequence with no gap, duplicate or tie, every row naming its author, and
   the sequence replays to the tree the two of them left. Two simultaneous
   batches: exactly one lands whole. Two simultaneous undos of the same row:
   exactly one lands, and the partial unique index is behind the sentence.
   `tests/db/ideacad-history-shared.test.ts`.
3. **A deleted part keeps its history.** `ideacad_delete_concept` soft-deletes,
   every row survives byte for byte, and the log still replays -- for the teacher
   too. The FK is `on delete cascade`, which would take the history, so the file
   also sweeps `prosrc` and asserts **no function in the schema hard-deletes a
   concept**, with a positive control that the same sweep does find
   `ideacad_unshare_document`'s delete.
4. **A scrub agrees with undoing back.** `stateAt` (forward from the origin) and
   `unwindTo` (inverting from the current tree) compared at **every** point of a
   360-action corpus in the pure suite (361 comparisons), and at 52 points over
   the real rows.

**THE DESIGN DECISION WORTH CARRYING FORWARD: UNDO APPENDS AN INVERSE, IT DOES
NOT MOVE A POINTER.** The cursor design is smaller and wrong twice over here --
it DISCARDS history, which is what "as far back as possible" refuses, and a
cursor is one mutable cell two editors fight over where appends serialise on
their own. The cost is that four presses over two edits leave six rows. That is
the point of it.

**THE SUBTLE PART IS PARITY, AND IT WAS WRONG FIRST.** A row's DEPTH is 0 with no
target and one more than its target's otherwise; even depth means applied, odd
means undone. The shallower rule -- "a row whose target is itself an inverse is a
redo" -- classifies depth 3 as a redo and tells a student there is nothing to
redo with their work one press away. Caught by the four-step trace in
`tests/ideacad-history-fold.test.ts`, and **mutation-proved**: reverting to the
shallow rule reddens exactly steps 3, 4 and 5 and nothing else, restored
md5-identical.

**NO `.svelte` FILE CHANGED, AND THAT IS STRUCTURAL RATHER THAN RESTRAINT.**
`store.edit(features)` has always taken a whole tree, so `diffTrees` works out
the actions from the accepted edit. The resolution is the ACCEPTED EDIT, which
is `ui/undo.ts`'s own argument unchanged: a slider dragged through forty values
before the green check is one decision, not forty.

## Not verified

- **Not applied anywhere.** This container cannot reach production and did not
  try. Everything measured is the real migration file against real embedded
  Postgres through the test harness.
- **No browser pass.** There is no surface: the prompt forbids a `.svelte` file
  and the timeline UI is the next bundle. `npm run verify:browser` would have
  measured nothing this bundle changed.
- `ui/undo.ts`'s in-memory stack is **untouched and still live**. Retiring it in
  favour of the durable log is the next bundle's, alongside the timeline.

## One edit outside the declared ownership, named rather than hidden

`tests/db/ideacad-grants-anon-execute-surface.test.ts` gains three entries in
`IDEACAD_FUNCTIONS` and `ideacad_history` in `IDEACAD_SELECT_TABLES`. It is
**forced and additive**: that file reads the migration directory off disk, so
0209's functions are in its catalog sweep the moment the file lands, and its
section B fails on an unclassified ideacad function by design. Confirmed in both
directions -- 1 failed / 29 passed without the classification, 30 passed with it.
This is the extension point `0206`'s own header names in words ("Classify them in
the migration that adds them and in
tests/db/ideacad-grants-anon-execute-surface.test.ts, which DOES fail on an
unclassified one") and the same one ledger 0188 used for 0207's fourteen and
0208's four.

## A second edit outside the ownership: a pre-existing flaky test this bundle rolled

`tests/db/html-assignment-manifest.test.ts` asked for the `classroom_items` kind
constraint with `pg_get_constraintdef(oid) like '%kind%' limit 1` and **no
ordering**. FIVE constraints on that table mention `kind`
(`classroom_items_grading_fields`, `_kind_check`, `_post_body`,
`_public_is_material`, `_titled`), so the query returned an arbitrary one and the
test had been passing on whichever the plan handed back. The final suite run drew
`classroom_items_public_is_material` -- `CHECK ((kind = 'material') OR (is_public
= false))` -- and the assertion `toContain("'assignment'")` failed.

**It is not 0209's.** Measured on two databases built side by side, one with the
migration and one without: five matching constraints in both, and the same
arbitrary pick in both. The coin flip is the defect and this bundle only rolled
it. Fixed by naming the constraint (`conname = 'classroom_items_kind_check'`),
which makes the query deterministic and makes the test assert the thing its own
comment claims, plus a not-null guard so a renamed constraint reddens rather than
passing as a sweep over a null. A strengthening, not a weakening, and one line of
query.

`CLAUDE.md` was **not** edited, deliberately: it is not in this bundle's
ownership and is the repo's highest-collision file. The paragraph it wants is in
the history entry's last section, ready to paste.
