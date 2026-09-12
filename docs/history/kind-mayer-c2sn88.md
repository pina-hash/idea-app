---
title: "Decision 08's notebook spreadsheet: the audit says the database refuses a grid outright, so the build does not start and the formula engine is a licensing decision for Mr. Pina (`claude/kind-mayer-c2sn88`, ledger 0180, no migration)"
date: 2026-09-12
branches: [claude/kind-mayer-c2sn88]
migrations: []
subsystems: ["Notebook", "Database", "Documentation"]
---

Mr. Pina decided 08 on 2026-09-12: a REAL spreadsheet inside a note -- rows,
columns and a working formula engine -- explicitly not a table, because he
dislikes how Google Docs tables behave. His bar is that it must work as well
inside a note as the text editing currently does.

This bundle was issued as an audit and a recommendation with a conditional build
attached: build the non-formula half **if and only if** a grid can be stored and
rendered with no new dependency and no migration. **It cannot be stored at all
without a migration, measured rather than reasoned, so nothing was built.** That
is the finding, and it is a better outcome than a half-built grid: the gate has
to widen in its own bundle before anything can emit the shape, which is
`CLAUDE.md`'s own rule about validation gates and the reason this lane was told
not to allocate a migration number for itself.

## The stop: the note gate refuses a grid, and it is not the gate this decision named

Ledger 0173 had already measured that a note's content gate is
`_notebook_note_content_ok` and **not** `_classroom_doc_ok`. That is confirmed
here. At this branch's own base (`origin/integration` at `6a71eff4`) decision 08
still carried the stale claim -- `Status: open`, and a context line reading
"`_classroom_doc_ok` widened first" -- and the two are different functions:
`_classroom_doc_ok` is the pure jsonb predicate the classroom and
`notebook_sessions.guidance_doc` share (0108, 0122, 0123), so widening it would
have changed nothing whatever about whether a note can hold a grid. A lane acting
on that entry as written would have written a migration against the wrong function
and found out at the first save.

**THAT CORRECTION WAS NOT THIS BUNDLE'S TO MAKE IN THE END, AND THE RECORD SHOULD
SAY SO.** Ledger 0173 rewrote decision 08 in commit `0093a26b` at 14:53 UTC,
forty minutes after this branch was cut and while this session was running, and
its rewrite already carries the gate correction, the `else return false` reading,
the widen-alone sequencing and the observation that Mr. Pina's bar means inside
the ProseMirror document with the same undo stack. Two lanes reached the same
findings independently from primary sources, which is the best available evidence
that the findings are right and not an artifact of either reading.

So when the two versions collided in the sweep, **0173's landed entry was taken as
the base and this bundle's contribution appended to it** rather than the other way
round. What is genuinely added is the half 0173 could not have: the gate's refusal
MEASURED against a real database rather than read off the source, and the formula
engine's actual candidates with registry facts and a licence argument.

The live definition is
`supabase/migrations/0125_notebook_run_text_parity.sql:206`. Nothing after 0125
redefines it -- 0137 touches only its grants -- and **three write RPCs**
(`notebook_add_note`, `notebook_edit_note`, `notebook_create_note_entry`) each
call it as `if not public._notebook_note_content_ok(p_content) then raise`,
across twelve call sites in 0078, 0088, 0094, 0114, 0116, 0118, 0119 and 0129,
those being successive redefinitions of the same three rather than twelve
separate functions. Its block loop
ends:

```sql
else
    -- An unknown block type is the whole point of this function.
    return false;
```

**Measured, not read.** A throwaway probe on the real harness (a fresh database
on the shared cluster, the real migration files applied unmodified, PostgreSQL
17.10) put seven documents to the deployed function:

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

The two controls are the positive control: without them a probe whose helper
returned `undefined` for everything would have "refused" all six and read as a
clean result. **`false` and not NULL** is the second thing worth reporting: 0125
closed the `is distinct from` hole that made this family of gates return NULL,
and NULL here would have meant the write was ACCEPTED, since every caller asks
`if not <gate> then raise` and `not NULL` does not fire. The refusal is real.

The probe was written under `tests/db/` and **deleted rather than committed** --
`tests/db/` is not this lane's owned surface, and the measurement belongs in this
entry, not in somebody else's directory.

## What a note stores today

`src/lib/notebook-notes.ts:67`:

```ts
export type NoteBlock = { type: 'p'; runs: NoteInline[] } | NoteList;
export type NoteDoc = NoteBlock[];
```

A closed union of three block types (`p`, `ul`, `ol`), capped at 2000 blocks,
20,000 characters of plain text (`NOTE_MAX_CHARS`) and 12 levels of list nesting
(`NOTE_LIST_MAX_DEPTH`). The `p` block refuses any key but `type` and `runs`, and
`ul`/`ol` refuse any key but `type` and `items`, so there is nowhere to smuggle a
grid into an existing block either -- which the probe's last three rows confirm.

**No table or grid block exists anywhere in the notebook.** Every `table` hit
under `src/lib/notebook/` is a database table named in prose, the admin log's
literal `<table>` element, or CSS; `NoteContent.svelte` branches on exactly
`ul` and `p`. `@tiptap/extension-table` is **not installed** -- the editor is
StarterKit with headings, blockquote, code, codeBlock, horizontalRule, strike,
underline and hardBreak all switched off (`src/lib/rich-text-schema.ts`), so a
grid is not one flag away in the editor either.

## The precedent that fits: 0195's manifest stores a table as ONE block

`src/lib/classroom/html-assignment/manifest.ts:86` is the shape worth copying,
and its own comment states the rule:

> A TABLE IS ONE BLOCK, AND THAT IS A CORRECTION RATHER THAN A SIMPLIFICATION.
> `type: 'table'` means the block's value is a JSON string of rows, and the
> document serialises the WHOLE table whenever any cell changes. There is no
> per-cell `data-field`.

It is a `classroom_responses` ANSWER rather than a rich-text document, so it is
not a drop-in; what transfers is the decision that **one block owns the whole
grid**, and the reason -- 0128's real port minted a field at runtime that no
manifest named, which the parent could only drop silently. A per-cell block id
in a note would be the same orphaning against `notebook_entry_notes`, where the
join key is permanent by construction.

It also carries a warning for this feature rather than only a pattern:
serialising the whole grid on every cell change is exactly the write amplification
the notebook's revision chain is least able to absorb. See below.

## Autosave, undo and conflict: two carry a grid, one does not

- **Autosave carries it, because on this surface there isn't any.**
  `EntryNotes.svelte:162` is `autosave: false`, deliberately: a note write INSERTS
  a revision (0078), so a debounce would mint one every 800ms. The machine still
  reports `dirty` for the navigation guard and schedules nothing. A grid changes
  nothing here. Where autosave DOES run -- the composer, into a private draft --
  0129's coalescing replaces the head revision in place rather than appending, so
  a whole-grid-per-keystroke payload is absorbed by the same mechanism that
  absorbs a paragraph. The `draft-mirror` is shape-versioned and drops an unknown
  shape rather than coercing it, so a grid added to the mirror needs a version
  bump and gets a clean failure if it does not.
- **Conflict carries it unchanged.** `unique (note_id, revision)` plus
  `supersedes_id` means two concurrent edits collide on the constraint instead of
  one silently winning, and that is indifferent to what the block holds.
- **Undo does NOT carry it, and this is the real engineering finding.** Undo in a
  note is ProseMirror's history plugin, inside the Tiptap instance
  (`NoteEditor.svelte`). A grid rendered BESIDE the editor has no undo at all --
  Ctrl+Z in a cell would either do nothing or undo the prose behind it, which is
  worse. A grid rendered INSIDE ProseMirror as a custom node inherits undo,
  cursor behaviour and the paste filter for free, but costs a NodeView and a
  schema node, and the schema is the paste filter, so it is also the thing that
  decides what a paste can bring in. **Mr. Pina's bar -- "works as well inside a
  note as the text editing currently does" -- is a bar about undo, selection and
  paste, and it points at the in-ProseMirror answer.** That is the expensive one,
  and it is the one worth quoting him a real estimate for rather than shipping the
  cheap one and discovering the bar at the demo.

## The formula engine: a licensing decision, not a technical one

Named with real registry facts (fetched 2026-09-12), not from memory. **No
dependency was added.**

| package | license | size (unpacked) | last publish | verdict |
| --- | --- | --- | --- | --- |
| `hyperformula` 3.4.0 | **GPL-3.0-only** | 12.6 MiB | 2026-08-10 | the only complete, maintained engine; the licence is the problem |
| `@formulajs/formulajs` 4.6.1 | MIT | 2.4 MiB | 2026-07-28 | maintained, but a FUNCTION LIBRARY, not an engine |
| `fast-formula-parser` 1.0.19 | MIT | 0.6 MiB | **2020-11-26** | a real parser with cell refs; ~6 years unmaintained |
| `formula-parser` 2.0.1 | MIT | n/a | **2017-02-21** | effectively dead |

The distinction that decides this: **HyperFormula is an engine** -- a parser, a
dependency graph, recalculation order and cycle detection. **Formula.js is a
function library** -- it implements `SUM`, `VLOOKUP` and several hundred others
over values already resolved, and knows nothing about `A1`, about what depends on
what, or about a circular reference. Adopting it still leaves the parser and the
graph to write, which is most of the work.

**What I would pick, and why.** Write a minimal evaluator, and do not adopt any
of the four.

- HyperFormula is the technically right answer and **GPL-3.0-only makes it Mr.
  Pina's decision and nobody else's.** This repository is public and the bundle is
  served to every browser that opens a note, which is distribution; GPL-3.0
  obligations would attach to the work it is linked into. There is no LICENSE file
  and `package.json` declares no license, so today the repo has no answer to that
  question at all. Handsontable sell a commercial license for exactly this case.
  That is a legal and a budget call.
- The two MIT parsers are unmaintained -- one for six years, one for nine -- and
  a formula engine is a surface where an unmaintained dependency's bugs become
  wrong numbers in a student's lab notebook rather than a crash somebody notices.
- A minimal evaluator is genuinely small **if the scope is set first**: a
  tokenizer, a recursive-descent parser over `+ - * / ^ ( )` and comparisons, `A1`
  and `A1:B9` references, a topological recalculation with cycle detection, and a
  named function table starting at roughly `SUM AVERAGE MIN MAX COUNT IF ROUND
  ABS SQRT`. That is on the order of 400-700 lines of pure, testable TypeScript
  with no DOM and no dependency -- the shape `$lib` already uses for
  `rich-text-doc.ts` and `track-runtime.ts` -- and it has the property the
  dependencies do not: **every function in it is one somebody chose to support**,
  so a formula a student writes either works or says it is not supported, rather
  than silently returning something plausible.
- The honest cost: it is not Excel, it will not do `VLOOKUP` on day one, and
  anyone expecting Excel parity will be disappointed. Scope is the thing to agree
  with Mr. Pina before a line is written, and the function table is the artifact
  to agree it against.

**This is a recommendation, not a decision, and nothing was installed.**

## What was NOT verified, and why

- **No live Supabase project.** The local `.env` is the placeholder project;
  nothing here can apply a migration, run an RPC against production, or sign in.
  Every gate measurement above is against the embedded harness, which applies the
  real migration files unmodified -- that is the strongest instrument in the repo
  and it is still not production.
- **No browser pass, deliberately.** No mounted surface was touched, so
  `verify:browser` and `verify:readme` would have measured an unchanged tree. The
  prompt's rasterize-at-375-and-1440 instruction was conditional on building the
  grid, and the grid was not built. When it is, that pass is owed in full,
  including ledger 0171's overlay-scrollbar lesson: a grid is the exact surface
  where a content check passes over rows hidden below an invisible fold.
- **`@tiptap/extension-table` was not evaluated by mounting it**, only by
  confirming it is absent from the dependency tree.

## A baseline correction this bundle owes

`CLAUDE.md`'s verification standard states the `svelte-check` baseline as **0
errors, 40 warnings in 22 files**, broken down 34 `state_referenced_locally` / 5
`css_unused_selector` / 1 `perf_avoid_nested_class`. Measured on
`origin/integration` at `6a71eff4` with `.env` exported and `svelte-kit sync`
run first: **0 errors, 38 warnings in 21 files**, breaking down **32** /
5 / 1.

The drift is **entirely `state_referenced_locally`, 34 to 32** -- which is the
third time that has been the sole moving part, and the file predicts it in those
words. Two warnings were removed by work already on `integration`; nothing in
this bundle touched a `.svelte` file. The line is corrected in the same change,
per the file's own standing rule that a session measuring a different number
corrects it and says which warning moved.

## Deferred, named rather than left implied

1. **The gate-widening migration.** It lands alone, before any producer can emit
   a sheet, and it needs its own number from the router chat. It also owes an
   answer for the `v_total > 0` text floor: a note whose only content is a
   spreadsheet has no prose in it at all and would be refused as empty by the
   current last line.
2. **The grid as a ProseMirror node vs. beside the editor**, per the undo finding
   above. This is the decision that sets the size of the whole build.
3. **The formula engine scope**, once Mr. Pina answers the dependency question.
