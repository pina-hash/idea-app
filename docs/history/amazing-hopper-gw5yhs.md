---
title: "The notebook's scoped formula evaluator: an engine with no dependency, built ahead of a surface the note gate still refuses (`claude/amazing-hopper-gw5yhs`, ledger 0187, no migration)"
date: 2026-09-12
branches: [claude/amazing-hopper-gw5yhs]
migrations: []
subsystems: ["Notebook", "Documentation"]
---

Decision 08 was decided as a BUILD on 2026-09-12: a real spreadsheet inside a
note, with working formulas, explicitly not a Google-Docs-shaped table, and Mr.
Pina's bar is that it must work as well inside a note as the text editing does.
Ledger 0180 audited it and found the build blocked at the database:
`_notebook_note_content_ok` (`0125:206`) answers FALSE for `sheet`, `table` and
`grid`, measured against real PostgreSQL 17.10, so a spreadsheet cannot be STORED
in a note without a migration.

**This bundle builds the engine alone, because the engine does not depend on the
gate.** Nothing here stores anything, renders anything, or knows what a note is.
`src/lib/notebook/formula/` is eight pure TypeScript modules with no DOM, no
Svelte, no Supabase and no package added. `package.json` was not in this bundle's
surface and is unchanged.

## The dependency decision, which is the one this rests on

Mr. Pina answered item 1 of decision 08 on 2026-09-12: write a scoped evaluator,
adopt none of the four candidates. The reasoning is 0180's and is not relitigated
here. The short form: HyperFormula is the only maintained complete engine and is
GPL-3.0-only against a genuinely public repository with no LICENSE file, and the
bundle is served to every browser that opens a note, which is distribution;
Formula.js is MIT and maintained and is a function LIBRARY with no parser and no
dependency graph, so taking it leaves the parser and the graph to write, which is
most of the work; the two MIT parsers were last published in 2020 and 2017, and a
formula engine is a surface where an unmaintained dependency's bugs become wrong
numbers in a student's lab notebook.

**He was told VLOOKUP will not exist on day one and accepted it.** That is
recorded in decision 08 rather than only in a report, because it is the thing
somebody will want to reopen.

## What was built

| module | what it owns |
| --- | --- |
| `values.ts` | the value union, the seven error codes, every coercion |
| `references.ts` | A1 notation both directions, range expansion, the size cap |
| `tokenize.ts` | the tokenizer, with a position OFFSET as a parameter |
| `parse.ts` | recursive descent, one function per precedence level |
| `functions.ts` | the function table and its arity/error rules |
| `evaluate.ts` | one tree against a cell-value context |
| `sheet.ts` | the dependency graph, the order, the cycle |
| `index.ts` | the public surface |

Scope as issued: cell references, ranges, arithmetic, parentheses, comparison
operators, and `SUM AVERAGE MIN MAX COUNT ROUND IF ABS`. **`SQRT` was in 0180's
sketch of the table and is NOT in the shipped one**; the eight above are what was
asked for, and adding a ninth is one entry.

### The load-bearing decisions

**AN ERROR IS A VALUE, NEVER A THROW.** Everything else follows from this. A
thrown exception would need catching at every aggregation boundary, and one
missed catch takes a note down; a value propagates by the ordinary rules and is
refused in one place. It is also what makes `IF` able to DISCARD a failing
branch, which is the ordinary way a student guards a division.

**NaN IS NEVER A VALUE.** Every arithmetic result goes through `finite()`, and a
non-finite one becomes `#NUM!`. A NaN renders as a plausible blank and adds
itself into totals silently, which is the failure ledger 0187's third refusal
names.

**THE POSITION OFFSET IS A PARAMETER, NOT A SECOND TOKENIZER**, the rule
`scanJs` follows for an inline `<script>` in `$lib/foundry/preflight.ts`. A
cell's source is `=A1+2`; the parser is handed the text after the `=` with
`offset` 1, so every reported position indexes the source the student can see.
And every message CARRIES ITS OWN LOCATION as well as setting the field, which is
the preflight convention: a surface that prints a chip beside a sentence already
containing the number prints it twice.

**A CYCLE IS FOUND BY THE RECALCULATION WALK AND REPORTED WITH ITS PATH.**
Colouring a node grey while it is on the stack means meeting a grey node IS the
cycle, and the current path written out is the cycle, so the error says
`A1 -> B1 -> A1` rather than "circular reference somewhere". Kahn's algorithm
would have answered which cells are in a cycle and not what order they close in.

**BOTH WALKS USE AN EXPLICIT STACK.** A thousand-cell chain is an ordinary paste
and a recursive walk overflows on it; a stack overflow is not a cell error, it is
a dead note. The parser cannot use a stack the same way, so it carries a
`MAX_DEPTH` of 64 instead and refuses past it.

**A REFERENCE IS CANONICALISED AT PARSE TIME.** `b7`, `B7` and `B07` are one key,
because two spellings of a key is a cell that depends on itself under one name
and not the other, which is a recalculation that silently never fires.

**`$A$1` IS REFUSED RATHER THAN ACCEPTED AND IGNORED.** The dollar signs mean
something only once a grid can copy a formula between cells, which this does not
do. Accepting them would make `$A$1` and `A1` identical today and different the
day fill lands, in stored notes nobody would re-check. The refusal names the
alternative.

**THE ERROR SWEEP IS THE TABLE'S RULE, WITH EXACTLY ONE OPT-OUT.** Every entry is
called only after its arguments have been swept for errors, so no function can
forget to propagate. `IF` sets `propagatesArgumentErrors: false` and it has to:
`IF(A1=0, 0, 10/A1)` is the ordinary way to guard a division, and under the sweep
the untaken branch's `#DIV/0!` would come back as the answer, which is precisely
what the formula was written to avoid. `IF` still returns an error from the TEST
and from the branch it actually takes, pinned in both directions.

**THE 15-SIGNIFICANT-DIGIT CUT IS ON THE DISPLAY AND NEVER ON THE VALUE.** This
was not in the scope and was found by the worksheet test: `33.19 + 2.90` is
`36.089999999999996` in IEEE-754, and a cost column showing that is a spreadsheet
a student stops trusting. Rounding the stored value would make every chained
calculation lossy in a way nothing reports, so `toDisplay` cuts and the
arithmetic stays exact. Fifteen digits is a spreadsheet's own figure.

**ADDING A LOOKUP IS REGISTRATION, AND ONE DECISION BUYS THAT.** A function
ARGUMENT carries the range's SHAPE (`rows`, `cols`) and not just its values,
because a lookup is the one family that needs to know a range is a TABLE rather
than a bag. Flattening to a plain list would have been enough for all eight
shipped functions and would have made the first lookup a change to the evaluator
rather than an entry in the table. What a `VLOOKUP` would still owe is a `#N/A`
member in `ERROR_CODES`, its own approximate-match rule, and its own tests.

**`isError` IS GENERIC**, because half the engine returns `T | FormulaError`
rather than a `FormulaValue`: the tokenizer returns `Token[] | FormulaError`, the
parser `FormulaNode | FormulaError`, range expansion `ExpandedRange |
FormulaError`. One guard narrows all of them; a predicate per union is four
spellings of "did this refuse". It was written non-generic first and
`svelte-check` reported 44 errors across the call sites, which is how the design
was found.

## The four refusals, each measured

`tests/notebook-formula-refusals.test.ts`, 31 assertions.

1. **A circular reference reports the cycle.** A self-reference gives
   `cycle: ['A1','A1']`; a two- and a three-step ring name every member in order,
   closing on itself; a cycle reached through a RANGE is found; a cell that
   merely READS a cycle inherits the error and is NOT added to the reported ring,
   which is what keeps the message pointing at the cells a student has to fix;
   breaking the cycle clears it rather than leaving it stuck. **A 2000-cell ring
   returns in well under the test's budget** rather than hanging or overflowing.
2. **An empty cell is zero in arithmetic and not an error**, in `+`, `-` and `*`,
   and a blank is still NOT counted by `COUNT` or averaged by `AVERAGE` (4 and 6
   over two cells averages 5, not 10/3), and displays as nothing rather than `0`.
3. **Division by zero is a cell error**, with the position of the `/`; dividing
   by an EMPTY cell is the same refusal, since a blank is zero; the error reaches
   a `SUM` over the column and the cell beyond it, and the test asserts the value
   is not the plausible wrong number and is not NaN.
4. **A malformed formula is a cell error carrying the position**, over a
   ten-case corpus whose size is asserted so a sweep that generated nothing
   cannot pass: `=1+`, `=(1+2`, `=1+2)`, `=SUM(1;2)`, `=`, `=1 # 2`, `=$A$1`,
   `="unclosed`, `=WIDGET`, `=A0`. A broken formula gets NO dependencies, so
   nothing downstream waits on it, and it recovers the moment it is fixed.

The error vocabulary is asserted CLOSED and every one of the seven codes is
produced by a formula in the same test, so a code cannot sit in the union with no
producer.

## Mutation proof, both directions, and the run that proved nothing first

`tests/notebook-formula-*` were mutation-proved with a script that restores from
a COPY taken in memory, never with `git checkout --` (which is a discard-to-HEAD
and would have taken the whole session's uncommitted work with it). Every file
was md5-compared against its pre-mutation copy afterwards and all eight matched.

**THE FIRST RUN WAS VACUOUS AND THE COUNTS ARE WHAT CAUGHT IT.** The script
passed `--reporter basic`, which does not exist in vitest 4, so every mutant
crashed at startup with a non-zero exit and was scored RED. Thirteen kills, all
of them fiction. `CLAUDE.md`'s rule is exactly this: a mutation that reddens
nothing has three causes and only one is a finding, so check the COUNT and not
the colour. Every line read `passed=0 failed=0`. The script now scores
`passed == 0 && failed == 0` as INSTRUMENT FAILED rather than as a kill, and
carries a no-op comment edit as a positive control that must come back GREEN.

| mutant | direction | result |
| --- | --- | --- |
| `M0` no-op comment (positive control) | none | GREEN, 31 passed |
| `M1` cycle detection stops recording a cycle | permissive | RED, 8 failed |
| `M2` an empty cell stops being zero | restrictive | RED, 2 failed |
| `M3a` the divide-by-zero check alone | permissive | RED, 5 failed |
| `M3b` the non-finite guard alone | permissive | RED, 2 failed |
| `M3c` both of those together | permissive | RED, 6 failed |
| `M4` a parse error stops carrying its position | permissive | RED, 12 failed |
| `M5` the table-level error sweep alone | permissive | **GREEN, survived** |
| `M5b` that sweep AND `collectNumbers`' own propagation | permissive | RED, 1 failed |
| `M6` topological order reversed | permissive | RED, 4 failed |
| `M7` a change stops propagating to dependents | permissive | RED, 7 failed |
| `M8` every write recomputes the whole sheet | restrictive | RED, 3 failed |
| `M9` `ROUND` stops rounding halves away from zero | permissive | RED, 1 failed |
| `M10` the range size cap | permissive | RED, 1 failed |

**`M5` SURVIVING IS THE CORRECT RESULT AND NOT A GAP**, and it is the case
`CLAUDE.md` describes: defence in depth means a mutation can stay green while one
layer is opened, and the check is to open BOTH and confirm only that reddens.
The table's sweep and `collectNumbers`' own `isError` are two layers over the
same rule; with only the sweep opened the inner one still refuses, and with both
opened `SUM(1, 1/0)` comes back as `1` and the test bites.

**`M5b` SURVIVED ON THE FIRST ATTEMPT TOO, FOR A REASON WORTH WRITING DOWN.**
Both of its edits are in one file, and the script applied the second replacement
to the ORIGINAL text rather than to the already-mutated string, so the second
silently discarded the first and `M5b` measured `M5` twice. That is the
"mutant never applied" cause again, wearing a different hat and reading as a
survivor rather than as a kill. It was redone with both edits applied to one
string and an assertion that BOTH landed before the run.

**`M8` is the direction that is easy to leave untested.** "A cell recomputes when
what it depends on changes" is visible in the values; "and not otherwise" is
not, and a sheet that recomputes everything on every keystroke is correct in
every value it reports. `lastRecalculated` is what makes that half a measurement,
and `M8` is the mutant that proves the measurement bites.

## Line count against 0180's estimate, which it is well over

Ledger 0180 estimated **400 to 700 lines**. Measured:

| | lines |
| --- | --- |
| `src/lib/notebook/formula/**`, total | **1,509** |
| the same, excluding blank and comment-only lines | **1,084** |
| `tests/notebook-formula-*` | 1,134 |

So roughly **2.2x the estimate on total lines and 1.55x on code lines**, and
saying which parts cost more is the point of reporting it rather than quietly
landing it:

- **425 of the 1,509 are comment or blank.** This repository's convention is that
  a rule carries its reasoning where it is written, and 0180's estimate was for
  code. That is the single largest line of the gap and the least interesting.
- **The four refusals are most of the rest.** Carrying a POSITION through the
  tokenizer and every parser branch puts a field on nearly every node and an
  argument on nearly every refusal. Reporting a cycle's PATH rather than its
  existence costs the grey colouring, the path array and the per-member map.
  Doing both walks with an explicit stack rather than recursion costs roughly
  three times the lines of the recursive form. An estimate for "cycle detection"
  is not an estimate for "report the cycle" and the difference is real.
- **Errors as VALUES rather than throws** costs an `isError` check at every
  arithmetic and aggregation boundary plus the coercion helpers. A throwing
  evaluator is perhaps sixty lines shorter and fails refusal three.
- **Spreadsheet semantics that are not "arithmetic"** are about 120 lines and
  every one of them is a defect if left out: the range-versus-scalar asymmetry
  for text, blank-filling in comparisons, cross-type ordering, half-away-from-zero
  rounding through a decimal string, the display cut.
- **One deliberate trade the other way:** five explicit precedence functions
  (about 90 lines) where a precedence-climbing table would have been about 35.
  The explicit form is what makes the `-2^2` decision readable, and that is the
  rule most likely to be "corrected" by somebody who has not read this.
- `index.ts` (60 lines of re-exports) was in no estimate at all.

## Verification

- **`svelte-check`: 0 errors, 37 warnings in 20 files, breaking down 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`.** Measured on `origin/integration` at `b0a8101d`
  BEFORE any change, with `.env` exported and `svelte-kit sync` run first, and
  again after: **identical, both numbers and the breakdown.**
- **`CLAUDE.md` states that baseline as 38 warnings in 21 files (32/5/1), and it
  is stale by one warning.** The drift is once again entirely
  `state_referenced_locally`, 32 to 31, which is now the FIFTH time that has been
  the sole moving part and the second time it has moved downwards. **The
  correction was NOT made here**, deliberately: `CLAUDE.md` is outside this
  bundle's owned surface and ledgers 0181 through 0186 were running in parallel,
  and a shared-file edit from a lane that does not own it is this repository's
  most reliable merge conflict. It is reported instead, which is what the file's
  own rule is for when the measuring session cannot make the edit.
- **Full suite green**, run serially through `npm test`. Baseline on
  `origin/integration` at branch time: **410 files, 7,935 tests, 0 failures.**
  After: 416 files, 8,054 tests, 0 failures. The delta is exactly this bundle's
  six files and 119 tests.
- **Mutation proof** as tabled above, 13 real mutants plus a positive control,
  restores md5-verified.

## What was NOT verified, and why

- **No browser pass, and none was owed.** No `.svelte` file, no route and no
  mounted surface was touched, so `verify:browser` would have measured an
  unchanged tree and the prompt correctly excluded `verify:readme`.
- **No live Supabase project and no migration.** `IDEA_MIGRATION_URL` and
  `DEPLOY_PROBE_URL` are both unset in this container, so production is
  unreachable from here; `node tools/deploy-probe.mjs --ref origin/integration`
  exits 1 with "DEPLOY_PROBE_URL is not set, so production's applied set cannot
  be read. This is 'cannot confirm', never 'applied'." Ledger 0114's gate-4
  substitution is what covers that, and it applies only because this bundle adds
  no migration, which was confirmed empty rather than assumed.
- **Nothing here has been run against a real note.** It cannot be: the note gate
  refuses the block. Every claim above is about the engine.
- **`@tiptap/extension-table` was not evaluated**, because this bundle touches no
  editor.

## What the grid surface still needs

Three things, and only the first is small.

**1. The migration that widens `_notebook_note_content_ok`.** It lands ALONE and
before any producer can emit a sheet, which is `CLAUDE.md`'s validation-gate rule
and 0180's sequencing. Its obligation that outranks the widening: it must answer
every ALREADY STORED note exactly as the deployed gate does, refusals included,
proven by putting a corpus to the deployed function first, applying over the same
database, and comparing case for case. It needs a number from the router chat.

**2. The sheet-only-note text floor IS an issue, and it is a decision rather than
a patch.** The gate's last line is
`return v_total is not null and v_total > 0 and v_total <= 20000;`
(`0125_notebook_run_text_parity.sql:285`), so a note whose only content is a
spreadsheet contributes no prose and is refused as EMPTY. The comment above it is
the thing to argue with rather than around, because it states an intent and not
an oversight: *"A note with no text at all is a mistake, not a note."* A student who opens a note, builds a materials table and writes no
sentences is the ordinary case for this feature, not an edge, so leaving it is
shipping a spreadsheet that cannot be saved on its own. Three answers, and the
migration has to pick one in writing: count a grid's own cell text toward
`v_total` (a sheet with any filled cell is then non-empty, and a sheet of pure
numbers still is, since cells are text in the document); count a grid as
CONTRIBUTING to emptiness without contributing text (a separate "has content"
term beside the character total); or leave the floor alone and require a
sentence, which is a product decision to state out loud rather than a default to
inherit. The first is the smallest change with the fewest surprises; whichever is
taken, the migration must show what it does to the notes already stored, because
this is a gate CHANGE and a gate change is a narrowing somewhere.

**3. Undo, which is the expensive one and the reason the surface is a real
project.** Undo in a note is ProseMirror's history plugin, inside the Tiptap
instance in `NoteEditor.svelte` (0180's finding, confirmed here by reading it:
the editor is `StarterKit.configure(NOTE_SCHEMA_OPTIONS)` at `NoteEditor.svelte:202`,
and `NOTE_SCHEMA_OPTIONS` switches eight extensions off and `history` is not one
of them, so StarterKit's history extension is on). That
gives the grid two shapes and only one of them meets Mr. Pina's bar:

- **A grid BESIDE the editor has no undo at all.** Ctrl+Z in a cell either does
  nothing or undoes the prose behind it, which is worse than nothing. A grid with
  its own undo stack is a second history in the same document, and the two
  interleave wrongly the first time somebody types a paragraph, edits a cell, and
  presses Ctrl+Z twice expecting their own order back. Nothing about this is
  fixable from outside ProseMirror, because the plugin owns the transaction
  history and a store beside it is not in that history.
- **A grid INSIDE ProseMirror as a custom node inherits undo for free**, along
  with selection and the paste filter, because every cell edit becomes a
  ProseMirror TRANSACTION and the history plugin records transactions. That is
  the shape to build. It costs a schema node and a NodeView, and the schema is
  also the paste filter (`rich-text-schema.ts`), so the same change decides what
  a paste can bring into a grid.

  The two things that need deciding before that is written, both of which this
  engine is indifferent to: **whether a cell edit is one transaction or one per
  keystroke** (one per keystroke gives cell-level undo granularity and a long
  history; one per cell-commit gives coarse undo and a short one, and the
  notebook's append-only revision chain prefers the coarse answer), and **how the
  node's attributes serialise**, where 0195's manifest is the precedent worth
  copying: a table is ONE block whose value is the whole grid, never a block per
  cell, because a per-cell id in a note would be the same orphaning against
  `notebook_entry_notes` that 0128's real port produced.

Autosave and conflict need nothing: `EntryNotes.svelte` is `autosave: false`
deliberately, and the composer's draft path is covered by 0129's revision
coalescing, which absorbs a whole-grid payload the same way it absorbs a
paragraph. The `draft-mirror` is shape-versioned and drops an unknown shape
rather than coercing it, so a grid in the mirror needs a version bump and gets a
clean failure if it does not get one.
