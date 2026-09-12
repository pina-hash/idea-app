# 08 Notebook: a real spreadsheet engine inside a note
- Raised: 2026-08-31  By: chat "Managing multiple FRC platform projects"
- Status: decided 2026-09-12 as a BUILD. Scoped below. The FORMULA ENGINE question
  (item 1) is answered and the engine is built; the SURFACE is still blocked on the
  gate-widening migration in item 2.
- Decision: 2026-09-12, Mr. Pina: not a table. A REAL SPREADSHEET ENGINE WITH WORKING
  FORMULAS. He explicitly dislikes how Google Docs tables behave and does not want
  that shape. His bar: it must work as well inside a note as the text editing
  currently does.
- Against the default: plainly, yes. The default below was "a table inside a note;
  ask before anything larger". He answered that the table IS the thing he does not
  want, and the bar he set -- as good as the text editing -- is the larger project
  this entry said to ask about first.
- Default this assistant would pick: A table inside a note; ask before anything
  larger.
- Why it is blocked on him: it was blocked on which of two projects he meant. That is
  answered. What is left is scope, not permission.
- What it unblocks: a notebook lane, and item 1 below makes the dependency question
  the first thing it has to settle rather than the last.
- Context: `src/lib/rich-text-schema.ts`; `src/lib/rich-text-doc.ts`;
  `supabase/migrations/0125_notebook_run_text_parity.sql`; `CLAUDE.md`, "Rendering
  untrusted content" and "A VALIDATION GATE WIDENS IN ITS OWN BUNDLE".
- Tree check (2026-09-02): no table node exists in the rich-text schema, so either
  reading is a new build.

## What is true in the tree today (measured 2026-09-12)

- **A note is three block types and nothing else.**
  `0125_notebook_run_text_parity.sql` **lines 206-287** is the live gate,
  `_notebook_note_content_ok`: a block is `p` (keys `type`, `runs` only), `ul` or
  `ol` (keys `type`, `items` only), and **line 278**'s `else return false` refuses
  everything else -- "an unknown block type is the whole point of this function". A
  run's keys are `text`, `bold`, `italic`, `href` (**line 161**). There is no table,
  no cell, no formula and no number.
- **A NOTE'S GATE IS NOT `_classroom_doc_ok`, and that matters for the build.** The
  two are separate functions: `_notebook_note_content_ok` gates a note's CONTENT,
  while `_classroom_doc_ok` gates item bodies and `notebook_sessions.guidance_doc`.
  Widening the classroom one -- which `0176_classroom_item_images.sql` **line 326**
  did, to admit `img` beside `p, h3, h4, ul, ol` -- reaches a check-in's guidance
  and NOT a student's note. A grid in a note is the notebook function's widening.
- **The editor schema is a closed StarterKit union.** `rich-text-schema.ts`
  **lines 45-57**, `NOTE_SCHEMA_OPTIONS`: headings, blockquote, code, codeBlock,
  horizontalRule, strike, underline and hardBreak are all `false`. Nothing
  table-shaped is on or off -- it is absent.
- **No formula engine is in the dependency tree.** `package.json` carries 17
  runtime dependencies; a grep for hyperformula, formulajs, xlsx, handsontable,
  jspreadsheet, univer and luckysheet returns nothing. Tiptap is `@tiptap/core`,
  `@tiptap/pm`, `@tiptap/starter-kit` -- an editor, with no grid and no evaluator.
- **The note table is append-only.** `notebook_entry_notes` has no UPDATE or DELETE
  grant; an edit inserts a superseding revision. 0129's autosave replacement is the
  one narrowing and it applies only to a draft's own head revision.

## What the build has to settle, in dependency order

1. **A formula evaluator is a dependency decision, and it is the first one.** Writing
   one is a compiler; taking one is a new package, and `CLAUDE.md` prices that at a
   4,649-line lockfile diff that must be its own commit. Nothing about the rest of
   this can be estimated until that is answered, so it is not an implementation
   detail to discover halfway.
2. **The gate widens alone, in its own bundle, before anything can emit a grid.** A
   gate accepting a shape nothing produces is inert; a producer emitting a shape the
   gate refuses breaks every save on the notebook at once. So
   `_notebook_note_content_ok` widens and ships by itself -- and `_classroom_doc_ok`
   too if a grid is wanted in an item body or a check-in's guidance, which is a
   second decision and not a free consequence. It must answer every ALREADY STORED
   note exactly as the deployed gate does, refusals included: put the corpus to the
   deployed function first, apply over the same database, compare case for case.
3. **Every walk carries the new node down.** `rich-text-doc.ts` is the ONE shared
   walk, mirrored by the SQL text projection; a grid node reaches both plain-text
   projections, both `docToTiptap`s and both renderers, or a stored note renders
   wrong in one of them with nothing to say so.
4. **Append-only decides what a cell edit costs.** Every keystroke in a grid that
   mints a revision is the 0129 problem at spreadsheet scale. A note is a DRAFT and
   private until turned in, so the autosave-replacement licence applies -- but that
   is a property of the draft, not of the grid, and a grid in a turned-in note
   appends like anything else.
5. **His bar is the acceptance test, not a sentiment.** "As well as the text editing"
   means inside the ProseMirror document, with the same undo stack, the same
   selection behaviour, the same save state, and the same three gates. A grid bolted
   beside the editor with its own store meets none of that and is the shape to
   refuse.

## The gate's refusal, MEASURED rather than read (ledger 0180, 2026-09-12)

Everything above about the gate is a correct reading of the source. This is the
same claim put to a real database, because "prefer measuring to reasoning" applies
hardest to the one fact the whole build rests on. A throwaway probe on the repo's
own harness -- a fresh database, the real migration files applied unmodified,
PostgreSQL 17.10 -- called the DEPLOYED `_notebook_note_content_ok` with eight
documents:

| document | gate |
| --- | --- |
| `[{type:'p',runs:[{text:'hello'}]}]` (control) | **true** |
| `[{type:'ul',items:[[{text:'a'}]]}]` (control) | **true** |
| `[{type:'sheet',rows:[['a','b']]}]` | **false** |
| `[{type:'table',rows:[['a','b']]}]` | **false** |
| `[{type:'grid',cells:{}}]` | **false** |
| `p` carrying an extra `sheet` key | **false** |
| `sheet` beside a valid paragraph | **false** |
| run carrying an extra `cell` key | **false** |

Three things this adds to the read above. **The two controls are the positive
control**: a probe whose helper returned `undefined` would have "refused" all six
and read as a clean result. **The answer is `false`, never NULL** -- which matters
because NULL out of this family of gates means the write is ACCEPTED (`if not NULL
then` does not fire), the exact hole 0125 was written to close, so the refusal is
real rather than a fall-through. **And there is nowhere to smuggle a grid into an
existing block**: the last three rows show the per-block key whitelists refusing a
`sheet` hung off a paragraph and a `cell` hung off a run, so the widening in item 2
above is genuinely the only door.

One thing for that migration to answer, found by the same probe and easy to miss:
the gate's last line is `v_total is not null and v_total > 0 and ...`. A note whose
only content is a spreadsheet contributes no prose to `v_total`, so **a sheet-only
note is refused as empty** unless the widening decides what a grid contributes to
the text floor. That is a decision, not an oversight to patch silently.

## The formula engine: candidates, with real registry facts

Item 1 above is right that this is the first decision and right that it is a
dependency decision. Naming the actual options, fetched from the npm registry on
2026-09-12 rather than recalled. **Nothing was installed.**

| package | license | unpacked | last publish | what it is |
| --- | --- | --- | --- | --- |
| `hyperformula` 3.4.0 | **GPL-3.0-only** | 12.6 MiB | 2026-08-10 | a real engine: parser, dependency graph, recalc order, cycle detection |
| `@formulajs/formulajs` 4.6.1 | MIT | 2.4 MiB | 2026-07-28 | a FUNCTION LIBRARY, not an engine |
| `fast-formula-parser` 1.0.19 | MIT | 0.6 MiB | **2020-11-26** | a real parser with cell refs; ~6 years unmaintained |
| `formula-parser` 2.0.1 | MIT | n/a | **2017-02-21** | effectively dead |

**The licence is the decision, and it is Mr. Pina's alone.** HyperFormula is the
only maintained complete engine and it is GPL-3.0-only. `pina-hash/idea-app` is a
PUBLIC repository (verified, not assumed) with no LICENSE file and no `license` in
`package.json`, and the bundle is served to every browser that opens a note, which
is distribution. Handsontable sell a commercial licence for exactly this case. That
is a legal and budget call, not a technical one.

Formula.js is the trap worth naming: it implements `SUM`, `VLOOKUP` and hundreds
more over values ALREADY RESOLVED, and knows nothing about `A1`, about what depends
on what, or about a circular reference. Adopting it still leaves the parser and the
graph to write, which is most of the work.

**Recommendation, offered as a recommendation:** write a scoped evaluator and adopt
none of the four. A tokenizer, a recursive-descent parser over `+ - * / ^ ( )` and
comparisons, `A1` and `A1:B9` references, topological recalculation with cycle
detection, and a named function table starting around `SUM AVERAGE MIN MAX COUNT IF
ROUND ABS SQRT` is on the order of 400-700 lines of pure, dependency-free
TypeScript -- the shape `rich-text-doc.ts` and `track-runtime.ts` already use -- and
every function in it is one somebody chose to support, so an unsupported formula
says so instead of silently returning something plausible. **The honest cost: it is
not Excel and will not do `VLOOKUP` on day one.** The function table is the artifact
to agree with him before a line is written.


## The dependency question is ANSWERED: a scoped evaluator, no package (2026-09-12)

Item 1 above said the dependency decision was the first one and that nothing else
could be estimated until it was made. Mr. Pina made it on 2026-09-12, on the
audit's own recommendation: **write a scoped evaluator and adopt none of the
four.** The licence is what settled it. HyperFormula is the only maintained
complete engine and is GPL-3.0-only; `pina-hash/idea-app` is a genuinely public
repository with no LICENSE file and no `license` in `package.json`, and the bundle
is served to every browser that opens a note, which is distribution. Formula.js is
MIT and maintained and is a function library with no parser and no dependency
graph, so adopting it leaves most of the work. The two MIT parsers were last
published in 2020 and 2017.

**He was told VLOOKUP will not exist on day one and accepted it.** That is the
scope decision, recorded here rather than in a report, because it is the thing
somebody will want to reopen.

### What ledger 0187 built, and what it deliberately did not

`src/lib/notebook/formula/` is the engine and NOTHING ELSE: a tokenizer, a
recursive-descent parser, a dependency graph with topological recalculation and
cycle detection, and a named function table holding `SUM AVERAGE MIN MAX COUNT
ROUND IF ABS`. Pure TypeScript, no DOM, no Svelte, no dependency, no storage and
no migration. It ships ahead of the surface because the engine does not depend on
the gate and the gate is what blocks the surface.

`SQRT` appeared in the audit's sketch of the table and is NOT in the shipped one:
the eight above are what the build was scoped to. Adding it is one entry.

**Lookup functions are out of scope and were not half-built.** The obligation the
engine carries instead is that adding one later is registration rather than
surgery, and one design decision buys that: a function ARGUMENT carries the
range's SHAPE (`rows` and `cols`), not just its values, because a lookup is the
one family that needs to know a range is a table. Flattening a range to a list
would have been enough for all eight functions above and would have made the first
lookup a change to the evaluator.

### What is still blocked, in the same dependency order

Item 2 is unchanged and is now the ONLY thing between this engine and a
spreadsheet a student can use: `_notebook_note_content_ok` still answers FALSE for
a `sheet` block, so the grid cannot be stored. That migration widens the gate
ALONE, before any producer can emit the shape, and it owes an answer for the
`v_total > 0` text floor that would otherwise refuse a note whose only content is
a spreadsheet.

Item 5 is unchanged and unanswered: the grid goes INSIDE ProseMirror as a custom
node or it does not meet his bar, because undo, selection and paste are the bar
and ProseMirror owns all three.

## The gate is WIDENED and the grid is a PROSEMIRROR NODE (ledger 0192, migration 0210, 2026-09-12)

Items 2 and 5 above are answered. `0210_notebook_note_grid.sql` is the migration
and `src/lib/notebook/grid/` is the editor half; between them, decision 08's three
pieces are 0180 (the audit), 0187 (the engine) and this.

### Item 2: the gate, and the text floor decided in writing

`_notebook_note_content_ok` accepts one new block type, `grid`, whose shape is
`{ "type": "grid", "rows": [["a","b"],["c","d"]] }` -- keys `type` and `rows` and
nothing else, rectangular, 1..100 rows of 1..20 cells, each cell a STRING of at
most 500 characters. A cell stores its SOURCE (`=SUM(A1:A3)`), never its computed
value; the number is derived at render by `$lib/notebook/formula`.

**THE TEXT FLOOR TOOK THE FIRST OF LEDGER 0187'S THREE ANSWERS: a grid's own cell
text counts toward `v_total`.** So a note whose only content is a materials table
saves, a table of pure numbers saves (a cell is text, so `12.5` is four
characters), and a grid whose every cell is empty is still refused -- which is
0125's stated intent holding rather than being worked around. **The floor line is
byte-identical to 0125's**; what widened is what FEEDS the total. The other two
answers were refused for reasons the migration's own header carries: a separate
has-content term would give the gate two ideas of "is there anything here", and
requiring a sentence is a product decision nobody asked for and one that fails
the bar directly.

**WHAT IT DOES TO EVERY NOTE ALREADY STORED IS NOTHING, AND IT IS PROVEN RATHER
THAN ARGUED.** No stored note can contain a grid (the deployed gate refused one,
measured by 0180, and the per-block key whitelists refuse one smuggled onto a
paragraph or a run), so the new branch is unreachable for every existing
document. The file does not rest on that: it creates the widened gate under a
TEMPORARY name, compares it against the deployed one row by row at apply time,
and REFUSES instead of applying if any answer moves. Measured on the harness over
four real seeded rows: 0 change answer, 0 already hold a grid, sixteen direct
gate cases answer as expected.

### Item 5: the grid is a ProseMirror node, and the two open questions are settled

**A cell edit is ONE TRANSACTION, not one per keystroke.** A cell being typed
into lives in the NodeView's own input and reaches the document only on Enter,
Tab or blur; Escape abandons it. One undo step is one cell edit, which is what
every spreadsheet does and what the append-only revision chain prefers. It is
structural rather than a discipline: the schema exposes exactly one write
command and it replaces the WHOLE grid. The cost, stated: Ctrl+Z *while typing in
a cell* is the browser's own text undo, because the characters are not in the
document yet.

**ONE BLOCK OWNS THE WHOLE GRID**, 0195's precedent, with the reason that
transfers -- a per-cell id in a note would be a join key against
`notebook_entry_notes`, which is the orphaning 0128's real port produced. The
node is an `atom` with a single `rows` attribute; through the DOM (the copy/paste
and `parseDOM` path) that attribute is a JSON string, and `toDOM`/`parseDOM` is
the one conversion.

Measured in a real browser at 375 and 1440, 62 measurements, none outside
threshold: a cell commit through the NodeView is exactly one undo step
(`Angle 1x1 -> EDITED -> Angle 1x1`), the document still holds exactly one grid
afterwards, every column is reachable by scrolling, no row is clipped below the
grid's box, and the sticky row header wins a hit test at its own centre after
scrolling to the far end.

### What is left, and it is smaller than what is done

**The PRODUCER.** The gate widens ALONE and before anything can emit the shape,
so this bundle deliberately does NOT wire the node into `NoteEditor.svelte`: the
one path from an editor document into `notebook_entry_notes.content` is
`$lib/server/rich-text-normalize.ts`, a whitelist translator that does not name a
grid. The next bundle adds a `NoteGrid` arm to `NoteBlock`, a branch in the
normalizer, a renderer in `NoteContent.svelte` and the node to the editor's
extension list -- importing `src/lib/notebook/grid/grid-doc.ts` rather than
restating the shape. Item 3 above is that bundle's, and it is unchanged: every
walk carries the new node down, and `richDocText` is shared with the classroom,
whose gate refuses a grid, so a grid arm there is an opt-in hook and not a new
branch in the shared walk.

**AND A `draft-mirror` VERSION BUMP, FOR A REASON THAT IS NOT THE OBVIOUS ONE.**
The mirror's `v: 1` covers its own field set and stores `doc` OPAQUELY, so a grid
needs no bump to be MIRRORED. It needs one for the ROLLBACK path, and the
measurement is worse than the throw everybody expects: a build WITHOUT the grid
node, handed a mirrored document that has one, does not throw -- Tiptap catches
`RangeError: Unknown node type` internally -- and **discards the WHOLE document**,
paragraphs included, seeding an empty editor. A student's restored draft would
come back silently blank. `tests/dom/notebook-sheet-undo.test.ts` pins both
directions.
