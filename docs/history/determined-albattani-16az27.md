---
title: "The notebook grid: the gate migration that lets a spreadsheet be a note, and the ProseMirror node that makes undo work (`claude/determined-albattani-16az27`, ledger 0192, migration 0210)"
date: 2026-09-12
branches: [claude/determined-albattani-16az27]
migrations: ["0210"]
subsystems: ["Notebook", "Database", "Documentation"]
---

Decision 08's third and last piece. Ledger 0180 audited the feature and measured
the blocker against real PostgreSQL 17.10; ledger 0187 built the formula engine.
What was left was the database gate and the editor node, and both are here.

**`0210_notebook_note_grid.sql` widens `_notebook_note_content_ok` to accept one
new block type.** `src/lib/notebook/grid/` is the shape's declaration, a
ProseMirror node and its NodeView. `src/lib/notebook/formula/**` is IMPORTED and
untouched.

## The three decisions, and none of them was a default to inherit

### One: the text floor, which is the decision the migration exists to make

`0125_notebook_run_text_parity.sql:285` ends
`return v_total is not null and v_total > 0 and v_total <= 20000;`, and the
comment above it states an INTENT rather than an oversight: *"A note with no text
at all is a mistake, not a note."* A student who opens a note, builds a materials
table and writes no sentences is the ORDINARY case for this feature, so leaving
that line alone ships a spreadsheet that cannot be saved on its own -- and the
student finds out at the moment they press save.

Ledger 0187 named three answers and recommended the first. **This file takes it: a
grid's own cell text counts toward `v_total`.**

- A grid with any filled cell makes the note non-empty. A table of pure numbers
  still does, because a cell stores TEXT -- `12.5` is four characters exactly as
  `steel` is five.
- A grid whose every cell is empty contributes 0 and the note is refused. That is
  0125's intent HOLDING rather than being worked around: an empty spreadsheet is
  a note with nothing in it.
- The 20,000 ceiling covers grid text too, for the same reason it covers list
  text -- it is a ceiling on a NOTE, not on prose. Measured through the gate: a
  paragraph of 19,999 characters plus a one-character grid is accepted and a
  two-character grid is refused, which is the only way to see the two totals are
  ONE total.

**THE LAST LINE IS BYTE-IDENTICAL TO 0125'S, and that is the point of taking this
answer rather than the other two.** What widens is what FEEDS `v_total`, never the
floor, so a note with no grid in it cannot change answer by arithmetic. A separate
has-content term beside the character total would have given the gate two ideas
of "is there anything here" and made the answer depend on which one a later
reader edited; requiring a sentence is a product decision nobody asked for and
one that fails Mr. Pina's bar directly.

### Two: what a grid is

    { "type": "grid", "rows": [["Part","Qty"],["Angle","4"]] }

Keys `type` and `rows` and nothing else -- the per-block whitelist every other
block in this gate already carries, and the reason there is nowhere to hang a
field nobody validates. `rows` is RECTANGULAR: every row the same length, empty
cells the empty string, and the column count IS `rows[0].length`. A `cols` field
beside it would be a second source of truth for one number.

**ONE BLOCK OWNS THE WHOLE GRID, NEVER A BLOCK PER CELL**, which is 0195's
precedent and transfers for the reason 0195 gives: a per-cell id in a note would
be a join key against `notebook_entry_notes`, where a block id is permanent by
construction, and 0128's real port is what happens when a runtime-minted per-cell
key meets a parent that can only drop it silently. A cell is addressed by its
POSITION, which is also what `A1` means.

**A CELL STORES ITS SOURCE, NEVER ITS COMPUTED VALUE.** `=SUM(A1:A3)` is what is
written down; the number is derived at render. A stored value is a second copy of
an answer the engine already gives and it goes stale the moment a precedent
changes, with nothing to report it.

The caps are `100 x 20` rows and columns and 500 characters a cell -- two caps
whose PRODUCT is the 2,000-cell bound on the gate's own work, rather than a third
`MAX_CELLS` that would make two of the three unreachable in some shapes. Twenty
columns is `A` through `T`, one letter each, which is the readable half of `A1`
notation. None of them binds in practice: the note's own 20,000-character ceiling
refuses a full grid long before any of them, and they exist so the WORK is bounded
before that total is reached, which a character ceiling alone cannot do. They are
stated in two languages -- `grid-doc.ts` needs them to refuse with a SENTENCE,
which a CHECK predicate cannot give -- and pinned against each other by reading
the migration's own text.

### Three: the grid is inside ProseMirror, and a cell edit is ONE transaction

`NoteEditor.svelte:202` is `StarterKit.configure(NOTE_SCHEMA_OPTIONS)`, and
`NOTE_SCHEMA_OPTIONS` switches eight extensions off with `history` not among
them, so ProseMirror's history plugin owns Ctrl+Z. Mr. Pina's bar is a bar about
undo, and beside the editor there is no undo at all.

**ONE TRANSACTION PER CELL COMMIT, NOT ONE PER KEYSTROKE.** A cell being typed
into lives in the NodeView's own input and reaches the document on Enter, Tab or
blur; Escape abandons it. One undo step is one cell edit -- what every
spreadsheet does, and what the append-only revision chain prefers. It is
STRUCTURAL: `grid-node.ts` exposes exactly one write command and it replaces the
WHOLE grid, so there is no per-cell command a later edit could start calling on
`oninput`. The cost, stated rather than discovered: Ctrl+Z *while typing in a
cell* is the browser's own text undo, because those characters are not in the
document yet.

The node is an `atom` with one `rows` attribute. Through the DOM -- the copy/paste
and `parseDOM` path -- that attribute is a JSON string, and `toDOM`/`parseDOM` is
the one conversion. **The cells are deliberately not ProseMirror child nodes**: a
cell holds a formula source, and modelling it as a text block would put the
note's whole inline schema inside every cell and make `=SUM(A1:A3)` something a
student could embolden half of. The cost of `atom` is that ProseMirror does not
manage the caret inside the grid, so the NodeView owns cell focus itself.

## What the gate change does to every note already stored: nothing, proven

This is a widening, so the usual danger runs the other way -- but "widening" is a
claim about a diff, and the obligation that outranks it is behavioural.

No stored note can contain a grid: the deployed gate refuses one outright (0180
measured it, `false` and never NULL) and the per-block key whitelists refuse one
smuggled onto a paragraph or a run. So the new branch is unreachable for every
existing document. **The file does not rest on that.** It creates the widened gate
under a TEMPORARY name, compares it against the deployed one row by row at apply
time with `is distinct from` so a NULL on either side counts as a disagreement,
and RAISES instead of applying if any answer moves. Only then does it install the
body under the real name and drop the temporary one.

Every other branch is re-pasted from 0125 byte for byte, **including the `<>` on
the `ul`/`ol` `items` guard**, which 0122 and 0125 each deliberately preserved.
Correcting it here would make a widening migration quietly REFUSE something the
deployed gate accepts.

Measured on the harness, over four rows written through the real
`notebook_create_note_entry`:

```
0210: 0 of 4 stored note revision(s) change answer under the widened gate.
0210: 0 stored note revision(s) already contain a grid block (expected 0 before this file).
0210: --- the gate, asked directly ---
0210:   control: a paragraph                 -> true   (expected true)
0210:   control: a list                      -> true   (expected true)
0210:   control: an unknown block type       -> false  (expected false)
0210:   control: a note with no text         -> false  (expected false)
0210:   a grid beside a paragraph            -> true   (expected true)
0210:   A GRID ALONE, no prose at all        -> true   (expected true)
0210:   a grid of pure numbers alone         -> true   (expected true)
0210:   a grid holding a formula             -> true   (expected true)
0210:   a grid with EVERY cell empty         -> false  (expected false)
0210:   a ragged grid                        -> false  (expected false)
0210:   a grid with no rows                  -> false  (expected false)
0210:   a grid with a numeric cell           -> false  (expected false)
0210:   a grid with an extra key             -> false  (expected false)
0210:   a grid with NO rows key at all       -> false  (expected false)
0210:   a grid whose rows is an object       -> false  (expected false)
0210:   a grid nested inside a paragraph     -> false  (expected false)
0210: all 16 cases answered as expected.
```

**THE FOURTH SEEDED ROW IS THE ONE THAT MATTERS AND IT LOOKS LIKE A MISTAKE.** A
`{"type":"ul"}` block with NO `items` key is ACCEPTED by the deployed gate -- the
0078 `<>` trap -- so it is a shape that can genuinely be in production. It is
seeded deliberately, because without it the survey counts over a table holding
nothing of the affected shape and its refusal can never fire. The mutation proof
below measures exactly that: with the row absent the survey applied happily under
a narrowing mutation; with it present the migration refuses.

The four grant lines follow **0166's shape, copied rather than reinvented**:
`revoke all ... from public, anon, authenticated` then `grant execute ... to
service_role`, because a hosted Supabase project's default privileges write a
DIRECT `anon` grant into every new function's ACL and `revoke ... from public`
does not touch it. 0201 invented its own shape and all ten of its functions came
out anon-executable. The ACL is read back off `has_function_privilege` and
exercised as a real refused call from `anon`.

## Mutation proof: 14 mutants, one positive control, two redone

`tests/db/notebook-sheet-gate.test.ts` and the two `tests/dom/notebook-sheet-*`
files, mutated with a script that restores from an IN-MEMORY COPY -- never
`git checkout --`, which is a discard-to-HEAD and would have taken this session's
uncommitted work with it. Every mutant's edits are applied to ONE accumulating
string per file and each is asserted to have landed, which is the failure ledger
0187's `M5b` hit. All four touched files md5-identical afterwards.

| mutant | result |
| --- | --- |
| `M0` no-op comment (positive control) | GREEN, 18 passed |
| `M1` the grid arm stops feeding `v_total` (the text floor undone) | RED, 13 failed |
| `M2` rectangularity not enforced | RED, 13 failed |
| `M3` a cell may be any jsonb type | RED, 13 failed |
| `M4` the key whitelist goes | RED, 13 failed |
| `M5` all three caps go | RED, 4 failed |
| `M6` `revoke` names only `public` (0201's defect) | RED, 13 failed |
| `M7a` both gate copies correct the 0078 trap, survey INTACT | RED, 13 failed |
| `M7b` the same narrowing, survey BLINDED | RED, 2 failed |
| `M8` the write command stops validating | RED, 1 failed |
| `M9` `parseHTML` claims a bare `<table>` | RED, 1 failed |
| `M10a` the cells become real ProseMirror content | RED, 8 failed |
| `M11` a commit fires when nothing changed | RED, 1 failed |
| `M12` read-only stops being structural | RED, 1 failed |
| `M13` `gridProblem` stops checking rectangularity | RED, 1 failed |

**`M7a` AND `M7b` ARE THE DEFENCE-IN-DEPTH CHECK, AND THEY ARE THE REASON THE
FIXTURE GREW A ROW.** They are the same narrowing -- both copies of the gate
"tidying" the 0078 `<>` trap -- with and without the survey. With the survey
intact the MIGRATION refuses and thirteen tests fail because nothing was applied;
with it blinded the migration lands and the test's own corpus comparison catches
it, exactly two. Two layers, each measured biting alone.

**TWO MUTANTS SURVIVED ON THE FIRST ATTEMPT AND BOTH WERE THE MUTANT'S FAULT, not
a gap.** The first `M7` replaced a pattern that appears in the temporary function
and NOT in the installed one, because the two copies carry different comments --
so it mutated the half the survey compares against and left the half that ships,
which is the "mutant never applied where it mattered" shape wearing a new hat.
And `M10` flipped `atom: true` to `false`, which changes nothing: ProseMirror's
`isAtom` is `isLeaf || spec.atom`, and a node with no `content` expression is a
leaf either way. `M10a` gives the node `content: 'block+'` instead, which is the
thing that would actually make a per-cell node expressible, and it kills eight.

## The browser pass, and the three things it found

`npm run verify:browser -- --route notebook-sheet`, at **375 and 1440**:
**62 measurements, 0 outside threshold.** `/dev/notebook-sheet` mounts the real
node, the real NodeView, the real `GridView` and the real formula engine inside a
Tiptap editor configured the way a note's editor is.

Measured: cells 87x44 at 375 and 214.5x44 at 1440 (the student-facing floor, with
no density exemption to claim); contrast 6.84:1 on the headers, 6.6:1 on cell
text, 14.5:1 on the resize controls; 0px document overflow at both widths; a
cell commit through the NodeView reported `["Angle 1x1","EDITED","Angle 1x1"]`
against an expected undo step, with exactly one grid still in the document
afterwards; every column reachable by scrolling; no row clipped below the grid's
box; and the sticky row header winning a hit test at its own centre after
scrolling to the far end.

Three findings that no other instrument would have produced.

**THE READ-ONLY FIXTURE DIVIDED A CELL BY ITSELF.** `Mean` was written `=B2/B3`
in cell B3, so the pass reported `#CYCLE!` where the spec expected `#DIV/0!`. The
engine was right both times; the FIXTURE was wrong. Worth recording because a
plausible-looking formula referring to its own cell is the easiest mistake to
make in a grid and the hardest to see in a diff.

**THE TRAILING EDGE FADE WAS A LIE AND THE 1440 RASTER IS WHAT KILLED IT.** The
scroller carried `mask-image: linear-gradient(to right, #000 calc(100% - 18px),
transparent)`, added against ledger 0186's finding that this Chromium paints no
scrollbar into a screenshot. A `mask-image` is unconditional, so with the grid
FITTING its pane -- measured, scrollWidth 949 against clientWidth 949 -- the last
18px of the D column were dimmed anyway. `CLAUDE.md`'s rule is that a gradient
SAYS there is more; one that says it unconditionally is not saying anything, and
it dimmed real content to do it. It is gone. Reachability is MEASURED now instead,
`scrollbar-gutter: stable` stays (it reserves the track whether or not anything is
painted in it), and the always-true statement of how much grid there is is the
`n x m` readout. **Building a decorative workaround for an instrument's limitation
is how a surface acquires a falsehood.**

**`nodeAt` THROWS RATHER THAN RETURNING NULL FOR A POSITION PAST THE END OF THE
DOCUMENT** -- `RangeError: Position 14 outside of fragment`, found by a test
written to check that a stale position is refused. That is not hypothetical: a
commit is dispatched from a cell's BLUR handler, and a blur races a delete, so
the position can genuinely be stale on arrival. A throw there escapes into an
event handler and takes the editor down. The command bounds-checks first now.

## The draft-mirror rollback hazard, measured, and worse than expected

The prompt said a grid in the mirror needs a version bump. It does, but **not for
the reason it looks like**, and the distinction is the finding.

`draft-mirror.ts` is shape-versioned at `v: 1` and drops an unknown version
rather than coercing it -- but that version covers the MIRROR'S OWN FIELD SET,
and `doc` is stored and returned OPAQUELY as a `TiptapNode`. So a grid inside
`doc` needs no bump to be MIRRORED. It needs one for the ROLLBACK path: a mirror
written by a build WITH the node and restored by a build WITHOUT it -- a
rollback, or a tab left open across a deploy.

Measured in `tests/dom/`, not assumed. It does **not** throw: Tiptap catches
`RangeError: Unknown node type: notebookGrid` internally and logs it, so
`NoteEditor.svelte`'s `catch { failed = true }` never fires and no surface reports
anything. And **it discards the WHOLE document** -- not the grid, the document. A
paragraph sitting BEFORE the grid comes back gone and the editor is seeded with a
single empty paragraph. So the failure mode of a rollback is a student's restored
draft silently blank. The next bundle owes `v: 2` for that reason;
`tests/dom/notebook-sheet-undo.test.ts` pins both directions with the
round-trip-whole case as the positive control.

`draft-mirror.ts` is outside this bundle's surface and nothing here writes a grid
into a mirror anyway, because the node is not wired into the editor.

## What is NOT here, deliberately: the producer

**The gate widens ALONE, before anything can emit the shape**, which is
`CLAUDE.md`'s validation-gate rule and 0180's sequencing. The same bundle adds an
EDITOR, and the distinction is worth stating precisely because it looks like a
producer: the one path from an editor document into `notebook_entry_notes.content`
is `$lib/server/rich-text-normalize.ts`, a whitelist translator that BUILDS its
output from the node types it names, and it does not name `grid`. That file, and
`$lib/notebook-notes.ts`, and `NoteContent.svelte`, are not this bundle's and are
untouched -- so a note containing a grid, saved today, stores the note WITHOUT
the grid, which is the "content disappears" failure that normalizer's own header
describes and never a corrupt row.

**`NotebookGrid` is therefore NOT in `NoteEditor.svelte`'s extension list.** The
next bundle adds the four pieces together and IMPORTS
`src/lib/notebook/grid/grid-doc.ts` rather than restating the shape -- which is
why the declaration lives in a module both the migration's tests and the node
already read, instead of in `notebook-notes.ts` where it will eventually be
re-exported from.

`_classroom_doc_ok` is not touched either: a grid in an item body or a check-in's
guidance is decision 08's own "second decision and not a free consequence", and
`CheckInGuidance` has no renderer for one.

## Verification

- **`svelte-check`: 0 errors, 37 warnings in 20 files (31 `state_referenced_locally`
  / 5 `css_unused_selector` / 1 `perf_avoid_nested_class`).** Measured on
  `origin/integration` at `7f5ca8f0` BEFORE any change, with the two `PUBLIC_`
  values exported and `svelte-kit sync` run first, and again after: identical,
  both numbers and the breakdown. **`CLAUDE.md` states exactly this and is
  correct**, which is the first time in five corrections it has been; no edit was
  needed and none was made.
- **Full suite green: 443 files, 8,463 tests, 0 failures**, against a baseline
  RE-DERIVED at the merged base in a clean `git worktree` -- `origin/integration`
  at `20a17d12`: **440 files, 8,414 tests, 0 failures**. The delta is exactly this
  bundle's three test files and 49 tests (18 + 16 + 15). The baseline read at the
  ORIGINAL branch point, `7f5ca8f0`, was **433 files, 8,318 tests** -- exactly the
  figure the prompt gives, which it attributes to `247dfc4a` (that is `main`;
  integration at `7f5ca8f0` contains it and measures the same). It is re-derived
  rather than subtracted because the branch merged `integration` again mid-session
  and everything ledgers 0189, 0191 and 0193 landed sits between the two readings.
  **Measured in a worktree and not on the tree under test**, which is ledger
  0177's rule: a baseline measured on the tree under test is not a baseline.
- **`npm run verify:browser -- --route notebook-sheet`**: 62 measurements, 0
  outside threshold, both widths. `--probe` first: Chromium 141.0.7390.37,
  screenshots work, rAF fires, `IntersectionObserver` fires, `ResizeObserver`
  delivers.
- **`npm run verify:readme -- --route notebook-sheet`** wrote
  `tools/browser-verify/measured/notebook-sheet.json` and both README counts
  regions.
- **`node tools/claude-md-check.mjs`**: agrees with the tree.
- **Rasterized and looked at**, both widths, which is how the edge-fade defect was
  found -- every content check passed over it.

**AND THE BRANCH HAD TO MERGE `integration` MID-SESSION, WHICH IS WORTH
RECORDING BECAUSE IT WAS A TEST FAILURE FIRST.** It was cut from `7f5ca8f0`, and
the router chat allocated `0210` with a deliberate one-number gap because ledger
0189 was in flight holding `0209`. Until 0189 landed, this branch's migration
series had a hole at 0209 that no ref could account for, and
`tests/db/migration-0177-tombstone.test.ts` failed on exactly that -- one failing
test in an otherwise green suite, for a reason entirely outside this bundle. It
is the documented cost of allocating a number ahead of the file, and it closed
itself when `0209_ideacad_history.sql` landed on `origin/integration` at
`20a17d12`, which this branch then merged. **The right response was to wait and
merge, never to take 0209 or to edit that test** -- the first would be the
collision the ledger exists to prevent and the second is a ratchet.

## What was NOT verified, and why

- **No live Supabase project, and 0210 is NOT applied.** The local `.env` is the
  placeholder (`example-ref`); `IDEA_MIGRATION_URL` and `DEPLOY_PROBE_URL` are
  unset in this container, so `tools/deploy-probe.mjs` cannot speak for
  production's applied set and "cannot say" is never a pass. Every measurement
  above is against the embedded harness, which applies the real migration files
  unmodified. **The file is Mr. Pina's to paste.**
- **No signed-in surface.** `/dev/notebook-sheet` is dev-only and needs no
  session; a real note page needs a Bosco Tech Google account no automated run
  holds.
- **The grid has never been saved into a real note**, and cannot be: the producer
  is the next bundle. Every claim about storage above is about the GATE.
- **Web fonts do not load in the harness** (the proxy blocks
  `fonts.googleapis.com`), so every geometry and contrast number is measured in
  the fallback stack; and `prefers-reduced-motion` is `no-preference`, so that
  path is not exercised. Nothing in this bundle animates.
- **The screenshot script raced Vite's cold dep-optimize reload** and measured an
  empty editor at 375 three runs in a row before the wait was re-asserted after
  the settle. That was the INSTRUMENT and not the page -- the browser-verify
  harness, which polls, never saw it -- but it is recorded because a
  deterministic first-context miss reads exactly like a broken NodeView.
