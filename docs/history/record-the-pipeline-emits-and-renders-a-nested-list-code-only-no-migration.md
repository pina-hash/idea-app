---
title: "The pipeline emits and renders a nested list (code only, NO migration)"
date: 2026-08-21
branches: []
migrations: []
subsystems: ["Digital notebook", "IDEA Classroom"]
record_order: 103
---

`0122` widened both rich-text storage gates to accept a nested list and shipped
alone, inert by construction: nothing emitted the shape and nothing rendered it.
This is the other half. The walk now emits a sublist inside the item it hangs
off, both plain-text mirrors descend into it, both editor round trips carry it
back out, and both renderers recurse.

**No SQL. No migration. Nothing to apply.** Every gate this needs is already in
the database.

### The shape, which is `0122`'s and not this bundle's

```
item := ( run | list )*
run  := { text, bold?, italic?, href? }
list := { type: 'ul' | 'ol', items: item[] }
```

`type` is a TOTAL discriminator per element -- a run cannot carry one, and has
not been able to since `0078`/`0108` -- so every document stored before `0122` is
this shape with no list in it, and there is no legacy branch anywhere. Only
`ul`/`ol` nest; `p`, `h3` and `h4` do not.

### What changed

**`src/lib/rich-text-doc.ts` is new** -- the STORED-document walk both closed
shapes share, the mirror image of `$lib/server/rich-text-normalize.ts` one
direction earlier. It holds `itemParts` (the own-runs-then-sublists split) and
`richDocText` (the plain-text projection). It exists for the reason the server
walk does: `docText` was written out twice, `0122` made the walk recursive, and
two hand-written recursive walks over one grammar is two chances to descend
differently. Both `NoteDoc` and `ItemDoc` stay separate closed contracts; what is
shared is the walk over the part they have in common, parameterized by the one
thing that differs -- the depth cap.

**`listItems` in `rich-text-normalize.ts` emits the sublist.** A sublist attaches
to the LAST item emitted before it, which is document order and nothing cleverer:
the nesting hangs off the text immediately above it. A `listItem` whose sublist
has no text before it -- an empty bullet holding an indented list, which a paste
can carry -- becomes an item of its own holding only that list, so the level
survives rather than being hoisted into its parent. `listFrom` returns null for a
list that normalizes to nothing, so no empty `ul` is ever stored. The
sibling-list branch (not editor output; hand-written JSON can carry one) now
nests rather than splices, for the same reason.

**Both `docText`s call `richDocText`** with their own cap (12 / 16), and both
`docToTiptap`s carry the sublist back into the editor as a further block of the
same `listItem` -- which is exactly where the editor had it. That path matters
more than it looks: `normalizeItemDoc` routes an ALREADY-STORED document through
`docToTiptap` on every publish toggle, so a level lost there would be lost with
nobody editing anything.

**Both renderers recurse**, carrying the depth down rather than reading it off
the document, and stop at the cap. A renderer that trusts the gate is a renderer
that hangs the day something reaches the table another way. Each gained one CSS
rule: a sublist inside an `li` takes the item's own leading instead of a block's
trailing gap.

**Both dev harnesses now seed a nested list** (`/dev/notebook`'s `NESTED_NOTE`,
`/dev/classroom-phase1`'s `RICH`), so one is on screen -- and in the editor,
through `docToTiptap` -- without anybody pasting it first.

### The decisions worth keeping

**A LIST ITEM STILL CANNOT HOLD TWO PARAGRAPHS, and that is the price of one
spelling.** `paragraph block*` says an editor can produce one; each paragraph
becomes its own item here. `0122` rejected the block-item vocabulary that would
have expressed it (an item holding blocks, its own text wrapped in a `p`)
deliberately: `notebook_entry_notes` is append-only with no UPDATE grant, so
every item stored to date would have become a second, legacy vocabulary no
migration respecting that table could retire, and both the gate and the renderer
would carry "run list or block list?" forever. The limit is commented at the site
so a later pass does not "fix" it back.

**THE TRIM IS SQL'S `btrim`, NOT JAVASCRIPT'S `trim`, AND THE DIFFERENCE IS
REACHABLE.** `_classroom_doc_text` ends in `btrim(...)`, which strips SPACES
ONLY. Until this bundle no normalizer output could begin or end with a blank
line, so `trim()` was an invisible approximation. An item holding a sublist and
no text of its own projects to a line that OPENS WITH A NEWLINE, `trim()` would
eat it and the database would not, and `classroom_items.body` is derived by the
SQL function inside the write RPCs -- a caller's `p_body` is ignored when a
document is supplied. So the mirror follows the column: measured, both sides
answer `"\nIndented"`.

**OWN TEXT FIRST, in ONE place.** `_classroom_item_text` resolves an item that
interleaves a run after a sublist as all of its own runs, then every sublist.
`itemParts` is that resolution, and BOTH the projection and the two renderers
read it -- so render order and text order cannot disagree, which they would the
first time one walked in document order and the other did not.

**The walk's reach is well inside the gate's, and that asymmetry is the point.**
`maxDepth` counts ProseMirror TREE levels and one list level costs two of them,
so the walk emits at most 5 list levels for a note and 7 for a body, against
gates that accept 12 and 16. Measured, not derived, and asserted against Postgres
rather than against the arithmetic: a gate narrower than the walk breaks every
save on the feature at once.

### Not done, deliberately

- **Nothing already flattened is recovered.** The boundaries are gone from
  storage; a list stored before this reads exactly as it did. Said in the student
  changelog too, because the alternative is a "repair" pass that invents
  structure the data never carried.
- **No print rules.** Neither renderer has any, anywhere in this repo; that is
  its own bundle and was not started here.

### Verification

`svelte-check` 0 errors / 36 warnings (the baseline, unchanged). Full suite green
at **78 files / 1951 tests**.

**tests/rich-text-nesting.test.ts is new** (52 cases): the editor schema -> the
normalizer -> `_classroom_doc_ok` / `_notebook_note_content_ok` on real embedded
Postgres -> `classroom_create_item` / `notebook_create_note_entry` -> a real read
back -> `ItemBody` / `NoteContent` server-rendered. Eleven arrangements (ul-in-ul,
ol-in-ul, ul-in-ol, ol-in-ol, three levels, two sublists on one item, a sublist
under the second paragraph of an item, an empty bullet holding a sublist, marks
and a link inside a nested item, paragraphs around a nested list, a heading above
one), each asserted as a stored shape, round tripped back through `docToTiptap`
AND through ProseMirror's own schema, projected to text, gate-checked and
rendered. The renderer assertions read an OUTLINE of the markup rather than its
text, because the interim output and this one contain identical words and differ
only in what encloses what.

- **The projection against SQL, case for case:** 23 documents -- every
  arrangement, the cap, one past it, six past it, an empty document, a list with
  no items, an item with none, an empty sublist, a run after a sublist, a block
  with no `runs` key -- `_classroom_doc_text` vs `docText`, zero disagreements,
  with the newline-opening case pinned explicitly on both sides so they cannot
  agree by both stripping it.
- **Depth:** editor documents from 1 to 20 levels, every one normalized, every
  result accepted by the real gate; the emitted depth follows the author to 5
  (note) / 7 (body) and stops. At the stored cap the renderer emits 16 `<ul>`;
  one past it, still 16, and the 17th level's text is absent.
- **`tests/fixtures/flat-stored-corpus.json` is new and is a GOLDEN RECORDING**
  of what the flattening normalizer emitted, generated mechanically from the
  shipping source before this bundle changed it.
  `tests/rich-text-nested-lists.test.ts` (0122's parity proof) now reads it
  instead of calling the normalizer live: its claim is about documents ALREADY
  STORED when 0122 was applied, and a live call would now hand the pre-0122 gate
  documents it rightly refuses.
- **Two assertions were GENERALIZED, not deleted:** the notebook's and the
  classroom's "keeps every bullet of a nested list" both pinned the interim flat
  splice. They now assert the nested shape, the outer list's item count, AND the
  same one-line-per-bullet text projection -- so they still fail for either older
  walk.

**Browser, both editors, at 1440 and 375** (`/dev/notebook`, `/dev/classroom-phase1`):

- Pasted `text/html` with `ul > li > ul` into the real note editor;
  `editor.getJSON()` held the nesting; saving through the harness (which calls
  the REAL normalizer at `/dev/notebook/normalize`) rendered
  `<ul><li>Materials<ul><li>250 mL beaker</li><li>Digital scale</li></ul></li><li>Method<ol>...</ol></li></ul>`.
- Same in the classroom editor with a three-level paste (`ul > ul > ol`) and an
  `h1` clamped to `h3`, through `/dev/classroom/normalize` and `ItemBody`.
- **The reopen path, both sides:** clicking Edit on a stored nested note put the
  sublist back INSIDE its `listItem` in the editor, and saving it again stored
  byte-identical markup; the classroom composer's edit tab did the same.
- **Measured:** a nested item indents 24px per level in the notebook (22-23px in
  the classroom body), markers change per level (disc / circle / decimal), the
  nested list's bottom margin is 0 against the top-level list's 11.2px, and
  `scrollWidth === clientWidth` at 1440 and at 375 (no horizontal overflow). No
  console errors.
- **NOT exercised in the browser: Tab / Shift-Tab indentation.** Keys dispatched
  through the pane do not reach a ProseMirror keymap, so every nested document
  above arrived by paste, which is the path most structural editor input takes
  anyway. Tab's binding is Tiptap's own and was not touched by this bundle.

**Also not verified:** the live Supabase project (the local `.env` is a
placeholder), a signed-in session, and any real Drive round trip.

### Mutation proof

Every mutation was confirmed to have REACHED THE FILE before any result was read
from it -- the marker grepped out of the mutated module and its md5 compared
against the original -- and every module was restored byte-identically after
(`md5sum -c` clean against a baseline taken first).

| Mutation | Reddened |
| --- | --- |
| **THE REJECTED ALTERNATIVE:** `listItems` splices a sublist's items into the parent as siblings (b57b61d's interim) | **22** across 4 files -- the whole nesting file's structural half, both normalizer tests, and all three body-render assertions |
| `ItemBody` cannot render a sublist (the `parts.lists` loop removed) | **9** |
| `NoteContent` cannot render a sublist | **3** |
| `richDocText` stops descending into a sublist | **30** across 4 files |
| `docToTiptap` (classroom) drops the sublist on reopen | **14** |
| The renderer's depth cap removed | **1** -- exactly the over-cap render assertion, and nothing else |
| `btrim` mirror -> JavaScript `trim()` | **2** -- the empty-bullet projection and the SQL agreement sweep, and nothing else |

The last two are the ones worth reading: each reddened only what it was aimed at,
so neither the cap assertion nor the SQL-agreement sweep is passing for some
other reason.

---

