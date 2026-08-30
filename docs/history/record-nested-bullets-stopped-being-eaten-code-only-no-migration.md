---
title: "Nested bullets stopped being eaten (code-only; NO migration)"
date: 2026-08-20
branches: []
migrations: []
subsystems: ["IDEA Classroom"]
record_order: 92
---

An interim fix for a silent data-loss defect that existed identically in both
rich-text normalizers, plus the extraction that makes "identically in both"
impossible to say again, plus the fixture work that explains why nothing caught
it.

### The defect

`src/lib/server/notebook-notes.ts`'s `listItems` tested the DIRECT CHILDREN of a
list node for `bulletList`/`orderedList`. Under the ProseMirror schema both
editors are configured with, a list's content is `listItem+` and a list item's
is `paragraph block*` -- a sublist is a child of the LIST ITEM above it, never a
sibling of it. So that branch was unreachable for any real editor output, and
every genuine nested list fell through to a single `collectRuns` over the whole
list item. That walk reaches the sublist's text too, and `pushRun` concatenates
adjacent same-mark runs with no separator.

Measured, before: a list of two items each holding a three-item sublist came out
as two items, the first reading
`Materials250 mL beakerDigital scaleGraduated cylinder`. Silent, on save, with
nothing to see until somebody read it back. `src/lib/server/classroom-doc.ts`
was a line-for-line copy and had the identical defect, so a teacher's pasted
instructions lost their sublists the same way.

### The fix, and what it deliberately does NOT do

The walk now descends INTO the list item and emits, in document order: the
item's own blocks, each as its own item, and each nested list's items spliced in
after them. Text is never joined across a list-item boundary. Each of a list
item's own blocks is its own item too -- a list item's content is
`paragraph block*`, so a paste can legitimately put two paragraphs (or a
paragraph and a heading) in one bullet, and joining those would be the same
defect one level down.

**INDENTATION IS STILL LOST, and that is the interim.** A sublist's items become
more items of the same flat list, because the stored shape (`ul`/`ol` with one
run list per item) has no way to express a level. Real nesting needs a wider
stored shape, a wider SQL gate on BOTH sides (0108's `_classroom_doc_ok` and the
note gate) and a renderer that can nest; that is its own bundle. What this fixes
is the DATA LOSS: every bullet the author wrote survives as its own readable
item. The stored document shape is unchanged, so no migration ships here and
both existing SQL gates accept the output untouched. Both call sites carry a
comment saying so.

The sibling-list branch survives as pure defensiveness, and is now labelled as
such: no editor can produce it, but the normalizer's input is arbitrary
untrusted JSON reachable straight through PostgREST, and a hand-written document
can carry one.

**Content saved before this is not recoverable.** The run-on text is stored with
its boundaries already gone; re-opening and re-saving it in the editor seeds from
that flat document and cannot put them back. The classroom update log says so
in the student's terms rather than promising a fix that does not exist.

### The extraction, and why it was judged the lower risk

`markState`, `pushRun`, `collectRuns`, `trimRuns` and `listItems` were
line-for-line copies of each other across the two normalizers. They are now
`src/lib/server/rich-text-normalize.ts`, called by both. The genuine differences
are configuration -- `maxDepth` (12 vs 16) and a `blockType` hook (the
classroom's clamped headings) -- and everything about each normalizer's own
public contract stays in that normalizer: the node cap (2000 vs 4000), refusal
vs empty document on empty input, the classroom's `looksStored` round trip, the
character cap.

The alternative offered was to fix both copies and leave them duplicated. The
extraction was judged lower risk on the evidence of this very defect: the two
copies were already wrong in exactly the same way, so the duplication was not
buying isolation, it was doubling the surface. Both functions are pure, both are
heavily covered, and the two CONTRACTS -- two closed shapes, two SQL gates, two
renderers -- are untouched. The one cast in the shared module (`RichBlock` to a
caller's closed union) is safe by construction: the walk emits only `ul`, `ol`,
`p` and whatever the caller's own `blockType` returns.

The editor SCHEMA moved for the same reason and to a different place:
`src/lib/rich-text-schema.ts` holds `NOTE_SCHEMA_OPTIONS` and
`ITEM_SCHEMA_OPTIONS` as plain data (the type import from
`@tiptap/starter-kit` is erased, so a node test with no DOM can read it). Both
editor components configure StarterKit from it, and the tests build their
fixtures from it. That is what makes fixture drift structurally impossible
rather than a thing to remember.

### Why the tests did not catch it

`tests/notebook-note-content.test.ts` and `tests/classroom-item-doc.test.ts`
each carried a nested-list fixture typed BY HAND, and both put the sublist
beside the list items rather than inside one. They exercised the dead branch and
passed, for as long as they existed, while every real nested list was being
destroyed. A green test on an impossible document is worse than no test: it is a
claim of coverage over the exact case that was broken.

Both fixtures are now built through `@tiptap/core`'s own `getSchema`, from the
same options the editor is configured with, and `check()`ed
(`tests/rich-text-fixtures.ts`). Each file also asserts the OLD shape can no
longer be constructed at all, with a positive control (the same content nested
where it really lives) beside it, so the negative cannot pass vacuously. The
notebook's version additionally asserts the note schema cannot hold a heading.

Each file gained a ROUND TRIP over one document holding one instance of every
construct its editor can produce, at every nesting arrangement its schema
permits: marks (bold, italic, both, link, bold link), both list kinds, three
levels of nesting, a two-paragraph bullet, and for the classroom both heading
levels and a heading inside a bullet. It runs written -> normalized -> stored ->
(classroom only: re-saved as stored, the publish toggle's path) -> seeded back
through `docToTiptap` -> checked against the schema -> normalized again, and
compares against a list of expected lines WRITTEN OUT BY HAND beside the
fixture. The expectation cannot agree with the implementation by construction,
which is the whole point.

### Proof

Every mutation in the PERMISSIVE direction, one at a time, restored
byte-identically (md5-checked against a recorded baseline) and re-run green
afterwards. Both files, 95 tests, run together:

| mutation | reddened | named tests |
| --- | --- | --- |
| M1 the original defect: never descend into a `listItem` | 11 | both files' nested-list, no-join, per-block, round-trip line and round-trip re-seed tests, plus the classroom's re-save |
| M2 join every block of one list item into a single item | 11 | as above |
| M3 emit a sublist's items BEFORE the item's own blocks (reorder only) | 9 | both files' nested-list, no-join, round-trip line and re-seed tests, plus the classroom's re-save |
| M5 drop a nested list instead of splicing its items in | 9 | same set as M3 |
| M6 ignore the caller's `blockType`, so a heading becomes a paragraph | 2 | the classroom's heading clamp and its round-trip line test |
| M4 (HARNESS) `editorDoc` stops calling `check()` | 2 | both files' "cannot construct the sibling-list shape" |
| M7 (HARNESS) the CAPTURED editor document is rewritten into the sibling shape | 2 | the notebook's builder-equality and sublist-inside tests |

M4 is the one that matters most: it proves the FIXTURE GUARD bites. Without it
the two "cannot construct" tests would pass whatever the schema said, and the
whole argument of this bundle would rest on an assertion that could not fail.
(The note schema's heading assertion inside the same test survives M4, because
`Node.fromJSON` throws on an unknown node type before `check()` is reached --
two mechanisms, not one.)

`svelte-check` 0 errors / 36 warnings (baseline, unmoved). Full suite 67 files /
1642 tests green.

### Other hand-written fixtures encoding a shape their producer cannot emit

Found and NAMED, not fixed, per the bundle's scope:

- **`tests/classroom-body-render.test.ts:99-109`** -- the same sibling-list
  shape, a third copy, feeding the DB-backed body render test. Its comment even
  documents the flattening rule the dead branch implements. This is the direct
  follow-up.
- **`tests/classroom-grading-console.test.ts:315-354`** -- `SPEC` is
  `{ version: '1.1', title: ... }` behind an `as unknown as AssignmentSpec`
  cast. The real type requires `schemaVersion: 1` and `meta`, and has neither
  `version` nor `title` at the top level, so the authoring path and 0092's
  `_classroom_check_spec` would both refuse it. The cast is what lets it
  compile.
- **`tests/classroom-item-doc.test.ts`, "clamps every heading level into the two
  a body may use"** -- a weaker instance, and worth stating precisely. The
  editor's schema is `levels: [3, 4]` and `transformPastedHTML` rewrites
  h1/h2/h5/h6 before ProseMirror parses, so `editor.getJSON()` can never carry
  those levels; the test's framing ("a paste carrying an h1") is not reachable.
  The clamp itself is NOT dead code -- a hand-rolled POST reaches the normalizer
  directly -- so the test is testing something real under the wrong story.
  Measured: the schema does NOT range-check a heading's `level` attr
  (`canHold` returns true for levels 1 and 6), so the new fixture guard cannot
  catch this one; it needs the editor's behaviour, not its schema.

`tests/notebook-note-route.test.ts:200-224` is the counter-example and the model
the three above should follow: it feeds editor-impossible input on purpose and
SAYS SO in a comment, because the route is reachable without an editor.

### NOT verified

- **No live Supabase project, no signed-in session, no real save.** Everything
  above is the pure normalizer and the pure doc layer, plus the existing
  DB-backed suites re-run unchanged. No item was actually saved through
  `classroom_update_item` and no note through the note RPC with a nested list in
  it; the claim that both SQL gates still accept the output rests on the stored
  shape being byte-identical in structure to what they already accept, and on
  `tests/classroom-rich-body.test.ts` (which drives the real gate) staying
  green.
- **Both editors WERE driven in a browser, but only by paste.** Each dev
  harness was opened and each editor mounted from the shared options with no
  "formatting tools could not load" notice and no console errors: the note
  toolbar offers exactly Bold / Italic / Bulleted list / Numbered list / Link,
  the body toolbar the same plus Heading / Subheading. HTML with a nested list
  was pasted into each and `editor.getJSON()` read back off the ProseMirror
  view; both put the sublist INSIDE the list item, and the classroom's pasted
  `<h1>` arrived as an h3. Those two documents are committed verbatim as
  `tests/fixtures/pasted-nested-list.json` and asserted byte-identical to what
  the schema builder produces, which is what keeps `getSchema` and the mounted
  editor from drifting apart unnoticed. **Keyboard drive did not work in the
  Browser pane**: Enter and Tab dispatched through it never reached
  ProseMirror's keymap, so indenting a list with the Tab key was NOT exercised
  and neither was Enter splitting a list item. Paste is the path that actually
  produced the reported defect, so it is the one that was reproduced.
- **M7 does not redden the line-count assertion, deliberately noted.** With the
  capture rewritten into the sibling shape the normalization test still passes,
  because the defensive sibling branch handles that shape correctly. That is
  precisely why the hand-written fixture passed for two releases, and it is the
  reason the structural assertions above exist alongside the output ones.
- **No visual or layout work, and none measured.** This bundle changes no
  markup, no CSS and no component layout; the interface-standards requirements
  scoped to the grading console do not apply to it and nothing was measured
  against them. Saying otherwise would be a coverage claim over work that does
  not exist here.
- **Existing stored content was not surveyed.** Nobody counted how many stored
  notes or item bodies already carry a run-on line from the old walk. The
  changelog entry tells students what to do if they find one.

