---
title: "The notebook grid's insertion path: the toolbar control, the producer wiring, and the engine's refusals rendered as sentences (`claude/funny-faraday-feobl2`, ledger 0199, no migration)"
date: 2026-09-13
branches: [claude/funny-faraday-feobl2]
migrations: []
subsystems: ["Notebook", "Documentation"]
---

Decision 08's last piece. `0210` is applied, so the gate admits a grid; ledger
0192 landed the ProseMirror node and its NodeView; ledger 0187 landed the formula
engine. Ledger 0192's own outcome note ends "THE PRODUCER IS NOT HERE,
deliberately" and names the four edits the next bundle owes. This is that bundle,
and **a student can now make one**.

## What changed

**`NoteEditor.svelte` gained the node, its NodeView and a `Grid` control.** The
node and the view arrive through the SAME dynamic import ProseMirror already
arrives on, so nothing about the component's browser-only, never-during-SSR
design moved; `/dev/notebook-sheet`'s hand-built editor was the construction that
was copied, which is what its own header asked for.

**`NoteBlock` gained a grid arm, and the shape did not move.** `grid-doc.ts`
still holds the only declaration of `NoteGrid`, the three caps and
`gridTextLength`; `$lib/notebook-notes` RE-EXPORTS the type. That was ledger
0192's explicit instruction and it is the half that matters -- a second
declaration would leave `_notebook_note_grid_len` mirroring one of two shapes.

**`$lib/server/notebook-notes.ts` claims the node through the hook the
classroom's image already uses.** Its contract is "a node that carries no runs at
all"; its NAME is `imageBlock`. It is not renamed, because renaming it touches
the classroom's normalizer, and because `CLAUDE.md` already prescribes the
comment-not-rename answer for `_classroom_doc_ok`, whose name lies the same way.
The claimant validates with `gridProblem` -- the same function the paste filter
calls -- and BUILDS `{type, rows}` rather than passing the node along.

**`NoteContent.svelte` renders a stored grid through the same `GridView` with no
`oncommit`.** Not a second read-only table: a note is read by an instructor and
by its author, and a separate renderer would be a second idea of what
`=SUM(A1:A4)` comes to, which is exactly the number being discussed.

**`GridIssues` puts the engine's own refusal sentences under the grid.** New, and
the reason is below.

## The decisions worth keeping

**A CODE IN A CELL IS NOT A MESSAGE, AND THAT WAS THE GAP.** Ledger 0187 built
the four refusals well -- a cycle carries its path, a malformed formula carries
the POSITION, division by zero is a cell error rather than a NaN, an empty cell
is zero in arithmetic -- and every one of them arrives with a student-facing
`message`. What the grid did with that message was put it in a `title`. A
`title` is not discoverable and a phone cannot hover; the notebook is written on
a phone as often as on a laptop. So a fifteen-year-old read `#CYCLE!` in a cell
and had nowhere at all to find out what it meant, and the messages might as well
not have existed.

`GridIssues` is `FoundryIssues`'s shape and its rule: the sentence is the
ENGINE'S, rendered VERBATIM, with the LOCATION as a chip beside it rather than a
prefix onto it (`preflight.ts`'s `locationOf` rule -- several of the engine's
sentences already name their cells, and a renderer that prefixed every one would
print the location twice and put the stutter on the clipboard). Measured on
screen: `B7 #NAME?` / "This sheet does not have a function called VLOOKUP, at
position 1. It knows ABS, AVERAGE, COUNT, IF, MAX, MIN, ROUND, SUM." The engine
names what it DOES have, which is the sentence a student can act on.

**VLOOKUP IS NOT HALF-BUILT AND NOTHING SPECIAL-CASES ITS NAME.** Mr. Pina
accepted its absence; what a student who types it gets is the engine's ordinary
`#NAME?`, position included. The bundle's contribution is that the sentence is
READ.

**AN ALL-EMPTY GRID IS TOLD, NOT SILENTLY REFUSED ON SAVE.** `0210`'s floor line
is byte-identical to `0125`'s -- `v_total > 0` -- so a note whose only content is
an empty grid still totals zero and the database still refuses it. That is ledger
0192's decision working, and it leaves a TIMING failure behind: the refusal is
right, and it arrives at the worst moment, from the furthest place, about
something the student cannot see. So the grid says it itself, in `GRID_EMPTY_NOTICE`,
while it is empty and before anything is pressed. **It is a NOTICE and not an
error** -- nothing is wrong yet -- and it is toned apart from the error lines,
measured as two different computed colours rather than asserted from the
stylesheet (a token that failed to resolve would leave both rows identical and
look deliberate).

**THE CLIENT FLOOR AND THE GATE AGREE, AND THAT COST ONE LINE OF CARE.**
`normalizeNoteDoc`'s floor is `docText(doc) === ''`. `richDocText` is the MIRROR
of `_classroom_doc_text` and `_classroom_doc_ok` refuses a grid, so a grid arm
added THERE would be a branch the SQL it mirrors does not have. The notebook's
own `docText` substitutes its grids for paragraphs before delegating -- and a
grid with no text contributes NO BLOCK AT ALL. Mapped to an empty paragraph
instead, a note of two empty grids projects `"\n"`, not the empty string, and the
client posts a note the gate refuses. Dropping the runless block is what makes
"some block contributed length" and "the projection is non-empty" the same
question, which is the question `v_total > 0` asks. It is a named test and a
killed mutant, not an argument.

**`docToTiptap` IS THE ARM THAT LOSES WORK IF IT IS FORGOTTEN.** Without it a
stored grid falls to `listToTiptap`, which reads an undefined `block.items` and
seeds an empty list; the student reopens a note to add a sentence, their table is
gone, and the next save writes the note without it. Nothing throws. It has a test
that round-trips a stored grid out to the editor and back and compares byte for
byte, and a mutant that removes the arm reddens it.

**`GRID_NODE_NAME` MOVED FROM `grid-node.ts` TO `grid-doc.ts`, AND STAYS ONE
DECLARATION.** `docToTiptap` has to name the node; `$lib/notebook-notes` is
imported by the server normalizer; `grid-node.ts` imports `@tiptap/core`. Reading
the constant from there would have put ProseMirror in every server route that
touches a note, to read one string. `grid-node.ts` re-exports it, so every
existing importer is untouched.

**THE INSERT CONTROL REFUSES INSIDE A GRID, AND THE GUARD IS NOT REDUNDANT --
which the mutation proof is what established.** The first mutant that removed
`if (active.grid) return;` did NOT redden, and the obvious reading was "defence
in depth, ProseMirror refuses it anyway". It does not. A node selection on an
`atom` is a selection ProseMirror will REPLACE, so without the guard the press
does not add a second grid: it overwrites the student's own grid with a fresh
empty one, and a COUNT of grids cannot tell the two apart. The test now types
into a cell first and asserts that cell survives the press, and the mutant dies.
That is the case for `CLAUDE.md`'s rule about not removing a redundant check
because a test did not notice -- here the check was not redundant and the test
was not looking.

**`aria-disabled`, NEVER `disabled`, AND THE LABEL DOES NOT DIM.** The control
has a reason to give and a genuinely disabled control swallows pointer events. It
was styled with `--text-3` first, which on the notebook's default plate is
`--nb-ink-faint` and **measured 2.95:1 on the toolbar's own ground at 1440**,
against its enabled neighbour's 6.84:1 -- a control whose entire job in that
state is to be READ. Dimming below the text floor to say "unavailable" is the
`--dim`-on-`--bg1` mistake in miniature. The tone now matches every other control
in the toolbar and a DASHED EDGE is the difference: a shape, not a colour. The
browser pass caught this; nothing else would have.

## Measured

**Baseline, re-derived in a clean `git worktree` at the branch point
(`origin/integration` `843b3860`)**: suite **446 files / 8,518 tests / 0 failed**;
`svelte-check` **0 errors, 37 warnings in 20 files**, 31 `state_referenced_locally`
/ 5 `css_unused_selector` / 1 `perf_avoid_nested_class`. **`CLAUDE.md` states
exactly that and is correct**, so no correction was needed and none was made --
the second time in six corrections.

**After**: suite **447 files / 8,545 tests / 0 failed**; `svelte-check`
**0 errors, 37 warnings in 20 files**, same 31/5/1. The delta is exactly this
bundle's one test file and its 27 tests; the new components introduced no
warnings.

**Browser pass, `/dev/notebook-grid-insert` at 375 and 1440: 70 measurements, 0
outside threshold.** Contrast measured against the real rendered ground: the
problem sentence 15.42:1, the cell/code chip 7.50:1, the `Grid` control label
6.84:1, column headers 6.84:1, cell text 7.27:1. Tap targets: every one of the 14
note toolbar controls at 44x44, the inserted grid's 12 cells at 87x44 (375) and
277.8x44 (1440), its 4 resize controls at 73.1x44. Horizontal scroll 0px at both
widths. Console errors 0.

**Mutation proof, permissive direction: eight mutants, all killed, plus a green
positive control**, over six files, every one restored from an in-memory copy and
md5-verified (never `git checkout --`, which discards uncommitted work and makes
every later mutant pass against a pristine tree). The mutants: the normalizer's
claim removed; its `gridProblem` validation removed; `docToTiptap`'s grid arm
removed; an empty grid contributing a blank line; the insert guard removed; the
problem list rendering nothing; the empty-grid notice removed; `NoteContent`'s
grid arm removed.

**Rasterized and looked at, at both widths**, which is how the `aria-disabled`
contrast finding and the fixture's off-by-one cell references were found -- the
spec's first run had three rows outside threshold and two of them were the spec
being wrong about its own fixture.

## What is NOT verified, and what is left

**NO LIVE DATABASE WAS REACHED.** `0210` is reported applied; nothing in this
container can confirm that, run an RPC, or sign in. Every claim about the gate
here is a claim about the migration FILE and about the TypeScript mirror of it,
proven against each other and against `tests/db/notebook-sheet-gate.test.ts`'s
embedded Postgres, never against production.

**THE `draft-mirror` `v: 2` IS NOT HERE, AND IT IS OWED.** Ledger 0192 measured
the hazard and named it: a build WITHOUT the grid node, handed a mirrored
document that has one, does not throw -- it discards the WHOLE document,
paragraphs included. `src/lib/notebook/draft-mirror.ts` is **ledger 0198's file**
and was not touched. The exposure is narrow and worth stating precisely: it needs
a browser holding a mirrored draft containing a grid AND a deployment rolled back
past this bundle. It is not a reason to hold this one, and it IS a reason the next
bundle touching that module should bump the shape version, whose stored-version
rule already drops rather than coerces.

**A 4-COLUMN GRID CLIPS ITS LAST COLUMN AT 375px, AND THAT IS OVERFLOW RATHER
THAN A DEFECT -- MEASURED, NOT ASSUMED.** The raster shows column D sliced
mid-glyph with no visible affordance. The reachability probe scrolls the scroller
to its far end and counts cells still outside the box: **0**. This Chromium
paints no scrollbar into a raster at any colour (ledger 0186, proven with a
magenta-on-green control), so what the picture cannot show is the platform
scrollbar a real viewer has; the always-rasterizable statement of how much grid
there is is the `5 x 4` readout, which is on screen. **Ledger 0192 removed a
trailing edge fade for good reasons** -- a `mask-image` is unconditional, so with
the grid FITTING its pane at 1440 it faded real content and said "there is more"
where there was not. A fade applied only when `scrollWidth > clientWidth` would
answer that objection exactly and is worth raising with Mr. Pina; it is NOT taken
here, because `GridView.svelte` is ledger 0192's file, the removal was their
measured decision, and re-adding the mechanism they removed is not a thing to do
in passing.

**NO LOOKUP FUNCTION WAS BUILT, deliberately**, and nothing was half-built toward
one. `#N/A` is still absent from `ERROR_CODES` for the same reason.

## Files outside the literal Owns list, and why

The ledger entry owns "the grid insertion path in the notebook editor toolbar and
menu". Ledger 0192's outcome note names the four edits the producer bundle owes
and they live in four files that entry does not spell out, so they are listed
here rather than left to be discovered: `src/lib/notebook-notes.ts` (the
`NoteBlock` arm, `docText`, `docToTiptap`), `src/lib/server/notebook-notes.ts`
(the claim), `src/lib/server/rich-text-normalize.ts` (one union member and one
comment), `src/lib/notebook/NoteContent.svelte` (the renderer). Three more:
`src/lib/notebook/grid/GridView.svelte` and `grid-node.ts`/`grid-doc.ts`, each
touched minimally -- two lines mounting `GridIssues`, and the constant's move --
where ledger 0192's "yours to use, not to change" is about the node's decided
semantics, none of which moved. `src/routes/dev/notebook-grid-insert/**` is a new
route colliding with nothing, and `classroom-updates.json` is the standing
directive.
