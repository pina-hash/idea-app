---
title: "An image's words reach the column, a dragged file reaches the box beside it, and the picker this prompt was mostly about does not exist yet (`claude/attachment-picker-paste-image-gptgo3`, 0178)"
date: 2026-09-04
branches: [claude/attachment-picker-paste-image-gptgo3]
migrations: ["0178"]
subsystems: ["Classroom", "Foundry", "Components and UI", "Database conventions", "Testing"]
---

Prompt 0032 asked for three loose ends from earlier bundles: a picker in place of
the editor's filename field for an item-body image, paste on the surfaces that
lack it, and an image's description reaching the plain-text projection. Its own
instruction was that every statement in it is a claim and the tree wins. Three of
its central premises turned out to be false, and the largest piece of the work it
describes could not be built by a bundle owning the files this one owns.

## What the tree actually held

**Prompt 0030's CLIENT half is not on `integration`, on `main`, or on any remote
branch.** `d98704b` on `main` -- the commit whose subject is "An item body may
hold a picture" -- contains exactly two files: `0176_classroom_item_images.sql`
and `tests/db/classroom-item-image-gate.test.ts`. The SQL gate that makes
`{ type: 'img', src, alt }` storable landed; nothing that produces, edits or
renders such a block did. Measured rather than inferred: there is no `img` in
`ITEM_SCHEMA_OPTIONS`, none in `rich-text-normalize.ts`'s block union, no `img`
arm in the `ItemBlock` type, none in `ItemBody.svelte`, and `@tiptap/extension-image`
is not a dependency. `git branch -r` lists three branches and none of them
carries it.

So the prompt's "prompt 0030 shipped images in an item body" is false here, and
its "the toolbar's Image control ASKS FOR A FILENAME" describes a control that
does not exist -- `RichTextEditor`'s toolbar is bold, italic, heading,
subheading, bulleted list, numbered list, link, and nothing else.

**This is what blocks B1, and the block is ownership rather than effort.** An
image insert control needs a node in the editor schema
(`src/lib/rich-text-schema.ts`), a branch in the server normalizer
(`src/lib/server/rich-text-normalize.ts`), an arm in the renderer
(`src/lib/classroom/ItemBody.svelte`) and, for a Tiptap image node, a new
dependency. None of those four is in this bundle's owned set, and `ItemDoc`
cannot gain an `img` variant without the normalizer and the renderer following
it. Building the picker would have meant writing prompt 0030's deferred client
half across four unowned files. It is reported and untouched.

**The third premise -- that the projection drops an image's description -- is
true, and is the piece that could be finished.** Both `else` arms agree by
construction: TypeScript reads `block.runs`, finds none and joins to `''`; SQL
aggregates `jsonb_array_elements(b.value->'runs')`, which is zero rows for an
absent key under a `coalesce(..., '')`. An image contributed a blank line.

## The projection (0178)

`classroom_items.body` is derived from `body_doc` by `_classroom_doc_text` inside
the write RPCs, and it is not a preview. Every reader below was found by reading
the tree, not by assuming the prompt's list:

| reader | what an image-only body did |
| --- | --- |
| `ClassView` stream row | renders the body only `{#if item.body.trim()}` -- drew **nothing** |
| `ItemDetail` | same gate on the whole Instructions/Details disclosure -- drew **nothing** |
| `itemTitle` (`classroom.ts:944`) | first non-blank line, else the literal `'Untitled'` |
| ... which feeds | the home-feed card, the stream row and its tooltip, the item page `<title>` and `<h1>`, the classroom breadcrumb, the grading console heading, the Grades row label |
| `grading-export.ts` | `itemTitle` into the export payload, the CSV's Assignment column and the **download filename** |
| `itemBodyDoc` | converts this column when `body_doc` is absent, so it is also the fallback render |
| `RevisionHistory` | the word count in a revision's one-line summary |
| `constraint classroom_items_post_body` (0085) | `kind <> 'post' or btrim(body) <> ''` -- an **announcement whose content was a picture could not be inserted at all** |

That last row is why this is a fix rather than a nicety: the gate 0176 opened was
closed again one layer down by a table CHECK nobody had connected to it, and the
teacher who wrote a description was told their announcement had no body.

**Two claims in the prompt about those readers are wrong and are corrected here.**
The GitHub export does **not** read `body` -- `classroom-export.ts:435` selects
`id, kind, title, author_name, author_email, export_slug` and an item with only a
written body is `skipped: no_spec`; it reaches the export only through
`itemTitle`. And there is no classroom push notification at all: `push.ts` is
tournament-only.

**0178 is one function and one guarded backfill.** `_classroom_doc_text` gains a
`when b.value->>'type' = 'img' then coalesce(b.value->>'alt', '')` arm.
`coalesce`, never a NULL line: a NULL is what `string_agg` SKIPS, and an image
with no description must contribute the same blank line every other runless block
does rather than silently vanishing. The signature does not move, so all six
write RPCs that name it resolve unchanged and the file has no deploy ordering.

**The mirror moved in the same commit, which is the whole point.** `richDocText`
gains the same arm, spelled to mirror `->>` rather than approximate it -- a
`jsonText` helper answering NULL for absent and for JSON null, the raw characters
for a string, and the JSON text for anything else, so a number projects `'5'` on
both sides. Only the string case is reachable through the gate; it is written out
in full because the corpus test puts both sides the same odd values.

**The `alt` field is on the SHARED `RichDocBlock` and that costs the notebook
nothing.** 0176 deliberately left the guidance gate narrow, so no guidance
document can hold an image; 0178 counts that at apply time rather than asserting
it from the gate, and REFUSES if the count is not zero.

**The backfill runs exactly once by being a no-op the second time.** Its
predicate is "the column disagrees with the function", scoped to documents that
actually hold an image -- a row disagreeing for any other reason is a finding,
not a backfill, and section 4 prints that number separately. It can only add
text, so `classroom_items_post_body` cannot be newly violated by it.

**Every count is expected to be zero on production, and that is a statement about
the client.** Nothing in `src/` can produce an image block yet. A non-zero count
means somebody wrote one through a direct PostgREST call and is worth reading.

## The drop (B2, B4)

**Prompt 0026's table, re-measured, with a missing-versus-deliberate reading.**

| surface | picker | paste | reading |
| --- | --- | --- | --- |
| `FileUploadPanel` (x2 in the composer) | plain | yes | -- |
| `SpecProseField`, `DeckPanel`, `FeedbackBox` | plain / `.zip` | yes | -- |
| `SpecRenderer` answer field | routes to the photo zone | yes | -- |
| `PeoplePanel` roster CSV | `.csv` | **deliberately absent** | wants TEXT; a textarea sits beside the picker and pasting a roster into it already works. `filesFromClipboard` is `image/*` only, and an image is not a roster. **DROP was missing** and is added. |
| `SpecImporter` spec JSON | `.json` | **deliberately absent** | same, and more strongly: the textarea's own class is `paste` and its placeholder says "Paste the spec JSON here". **DROP was missing** and is added. |
| `FoundrySubmit` | any | **missing** | had a hand-rolled drop and no paste at all. Migrated. |
| `ProfileMenu`, `ChallengeForm`, `EntryStyleEditor`, `ShelfEntry`, `Garage`, tournament banner, `PhotoStager` | various | missing | outside this bundle, unowned, untouched |

**The interesting part of these two surfaces is not the drop, it is the paste they
must NOT take.** `SpecImporter` renders inside `ContentComposer`, whose own
`onpaste` stages a screenshot onto the item's attachments. A paste bubbles, and
`claimPaste` makes the first handler to ask the OWNER of the event -- so a drop
target on the spec panel that claimed an image and then refused it for not being
JSON would have silently eaten every screenshot pasted anywhere inside that
panel. So `accept` runs BEFORE the claim, and nothing is claimed unless something
survived it.

**`accept` takes the `<input accept>` attribute's own string.** `matchesAccept`
parses the same comma-separated list of extensions and media types the browser's
picker does, and each surface writes that one constant into both the attribute
and the drop rule -- one value read twice rather than two spellings of one rule.
It matches on the extension OR the type, either alone being enough, because
`File.type` is legitimately empty for a file dragged off a desktop and is Excel's
guess when it is not. No spec admits everything, which is byte-identical to every
caller written before the parameter existed.

**`FoundrySubmit` keeps reading a dropped folder by handing its reader in.**
`dropTarget` reads `dataTransfer.files`, which does not enumerate a directory;
`filesFromDataTransfer` walks `webkitGetAsEntry()`. That is a reading of the
transfer, not a second drop state machine, so it is a `resolve` parameter. The
swap buys the zone depth counting (its highlight flickered off and on when a drag
crossed its own two buttons), an `isFileDrag` check (dragging selected text lit
the whole zone up), and `claimPaste`. `drop` became async for it, and the
`preventDefault` and the feedback reset stay SYNCHRONOUS ahead of the await --
a drop's default is cancelled during dispatch or not at all.

## Measured

- **`svelte-check`: 0 errors, 37 warnings** (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`), re-derived after
  `svelte-kit sync` with the two `PUBLIC_SUPABASE_*` placeholders exported.
  Baseline held.
- **Full suite. On this branch: 254 files / 5327 tests before, 255 / 5353
  after.** The prompt quoted 253/5309 and 255/5361 from other trees; neither
  matches this one. On the `main`-bound tree carrying 0178 alone: **245 files /
  5177 tests**, against 244 / 5166 for `main` unchanged.
- **The `main` commit is the projection only.** `dabfc17` carries
  `0178_classroom_doc_text_image_alt.sql`, its db test, `rich-text-doc.ts` and
  the scoped assertion in 0176's test -- and nothing else. The branch's own
  `ad071b1` had swept the in-progress `file-drop.ts` widening in with a
  `git add -A`, which is harmless on the branch (the next commit adds its
  callers and its tests) and would have put an uncalled parameter on `main`, so
  the `main` commit was assembled from the four files rather than cherry-picked.
- **Browser, real Chromium 141, `/dev/attach-reach` at 375px and 1440px: 26
  measurements, 0 outside threshold**, 17 verdicts true at both widths, 0px
  horizontal overflow, 0 console errors. `foundry-submit`, `composer-attach`,
  `classroom` and `classroom-images` re-run after the change: 408 measurements,
  0 outside threshold.
- **The counts block's outside-threshold rows on `integration`: ZERO**
  (`"outside":0,"outsideRows":[]` at sha `b1c97fa`). Regenerated on this branch:
  **190 runs, 2648 measurements, 0 outside threshold**, 70 `--selftest` controls
  with 0 instrument failures -- two runs and 26 measurements more than the last
  reading, all of them the new spec, and the list is still empty.
- **No `classroom-updates.json` entry.** The two classroom surfaces this bundle
  touches are instructor tools (a roster import and a spec import), and the
  projection change has no student-visible effect yet because nothing in `src/`
  can produce an image block. A change to what a class SEES always earns an
  entry; this is not one.

## The three positive controls

1. **The accept filter disabled** (substituted for the prompt's "break the picker
   so it offers a key the item will not save", which describes the picker that
   does not exist): 5 tests reddened, including the nested-paste one.
2. **The paste handler made to swallow plain text**: 4 tests reddened across both
   vitest projects.
3. **One side of the projection changed alone**, both directions. TypeScript
   reverted: the corpus test reddened with `TS mirror vs column: an image on its
   own: expected '' to be 'A caliper reading 12.7 mm'`. SQL reverted: 0178's own
   section-3 self-check raised at apply time and the file did not apply at all,
   so the disagreement never reached the table.

Every mutation was restored from a `cp` copy and md5-checked identical.

## Two harness defects found by building the harness

Both are the shape this page exists to catch elsewhere, and both would have read
as flaky behaviour rather than as instrument error:

- **Clearing a bound textarea with `el.value = ''` does not tell Svelte.**
  `bind:value`'s state kept the old string, so writing that same string back
  produced no re-render and the box stayed visibly empty. The first table run
  reported the CSV and the second reported `''` for identical input. The native
  setter plus a real `input` event is what a person typing produces.
- **A verdict asserting an absolute staged count reports how many times it has
  been asked.** Staging is cumulative; run 1 read 0 -> 1 and run 2 read 1 -> 2,
  and `=== 1` called the second a failure. The delta is the honest claim.

The spec's `orderResult` must return an ARRAY: the harness reports a joined
string as CANNOT COMPARE, which is the right refusal and is how this was found.

## Not verified

- **No real system paste and no real system drag.** The harness dispatches real
  `ClipboardEvent`/`DragEvent` objects carrying real `DataTransfer`s with real
  `File`s into the real tree, so the browser's event classes, real bubbling and
  the components' real handlers all run -- but they are `isTrusted: false`.
  Prompt 0026 recorded this limit for paste and it is unchanged.
- **A dropped FOLDER is unreachable from the harness at all.**
  `DataTransferItem.webkitGetAsEntry()` cannot be synthesized, so the Foundry
  zone's directory walk is asserted against an injected resolver in
  `tests/classroom-file-drop.test.ts` and its FILE path is what the browser pass
  exercises.
- **Nothing was run against the live Supabase project.** 0178 has not been
  applied anywhere but the embedded-Postgres fixture, and the counts it prints
  are predictions.
- **No signed-in surface was driven.** `/dev/attach-reach` needs no session; the
  real `/classroom` surfaces do, and the local Supabase stack was not used.
- **`prefers-reduced-motion` is `no-preference`** in the harness, and web fonts
  do not load (the proxy resets `fonts.googleapis.com`), so text was measured in
  the fallback stack.

## Deferred, with the reason

- **The image picker (B1)**, blocked on ownership as above. Whoever takes it owns
  the schema, the normalizer, the renderer and the dependency as well as the
  editor, and should note that `ContentComposer` has `existing` (the item's saved
  attachments) and `stagedFileCount` (files not yet uploaded) in scope but no
  single list of "what this item will save with" -- a picker offering a staged
  name that then fails to upload produces a body referencing a key that never
  lands, which 0176 makes storable and renders as the description plus a marker.
- **Pasting a copied figure reference as a figure** rather than as text, which
  needs a ProseMirror paste plugin and the same four unowned files.
- **Paste or drop on the seven remaining non-classroom pickers**, unowned.

## Cold apply

`supabase/migrations/0178_classroom_doc_text_image_alt.sql`, pasted into the
Supabase SQL editor. It refuses if 0176 is not applied. Expect five notices; on
production every count in them is expected to be `0` for the reason in the file's
own section 6. What undoes it is in the file header: re-paste the
`_classroom_doc_text` block from 0122 and re-run the revoke beneath it. Nothing
else moves -- no signature changed, and the rows the backfill touched keep their
descriptions until their next save, which is the safe direction.
