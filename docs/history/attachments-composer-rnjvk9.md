---
title: "Attachments and the composer: a pasted screenshot reaching two lists, a thumbnail with nothing to derive it from, and a format control nobody could specify (`claude/attachments-composer-rnjvk9`, no migration)"
date: 2026-09-04
branches: [claude/attachments-composer-rnjvk9]
migrations: []
subsystems: ["Classroom", "Components and UI", "Testing", "Content, copy and legacy"]
---

Prompt 0026 carried three instructor reports on one surface: paste to upload should
work everywhere a file can be attached, assignments want a thumbnail, and "format
control", reported with no detail behind it. The prompt's own warning was that
"add X" items in this repository keep turning out to already exist and be
unreachable. Two of the three were that again, in different ways, and the third
was a real defect hiding under the first.

## The audit

**Paste already reaches every classroom surface that can attach a file.**
`src/lib/file-drop.ts` handles a drop (unfiltered, matching the picker beside it)
and a paste (filtered to `image/*`), and `dropTarget` is mounted on
`FileUploadPanel`, `SpecProseField`, `DeckPanel` and `FeedbackBox`;
`SpecRenderer` routes an answer-field paste to a module's photo zone through the
same `filesFromClipboard`. The surfaces with no paste are all outside this
bundle: `PeoplePanel` (roster CSV), `SpecImporter` (spec JSON), `ProfileMenu`,
`ChallengeForm`, `EntryStyleEditor`, `ShelfEntry`, the Foundry submit zone,
`Garage` and the tournament banner picker. They are reported and untouched.

**The notebook has no paste path at all**, which corrects the prompt's premise:
`PhotoStager` is three pickers (one of them a camera `capture` input) and nothing
else -- no paste, no drop. So there was no better notebook approach to move; the
shared primitive is already the more capable of the two.

**`FoundrySubmit` hand-rolls its own `ondragover`/`ondrop`** rather than using
`dropTarget`. That is a second implementation of drop, and a migration candidate
for whoever owns that file; nothing was changed here.

## The defect: one screenshot, two lists

`ContentComposer` mounts `FileUploadPanel` TWICE -- the student-facing list and
the instructor-only one -- and both carry `dropTarget`, whose paste listener sits
on each panel's own root. The composer ALSO carries its own `onpaste` on the
outermost element, so a screenshot pasted into the title field or the body editor
still reaches a list. Those are the same event: a paste bubbles, and
`preventDefault()` does not stop propagation.

Measured on a mounted composer before any fix, as staged rows in each panel:

| paste target | instructor list | student list |
| --- | --- | --- |
| instructor-only panel | 1 | **1** |
| student-facing panel | 0 | **2** |

The first row is the one that matters. An answer key screenshot pasted into the
instructor-only box was also staged on the student-facing list, and on save it
would upload to `classroom-attachments`, which the whole class may read. The
second row is one file attached twice.

**The fix is `claimPaste` in `$lib/file-drop`**: the first handler to ask owns the
event, every handler above it gets `false` and does nothing at all -- not stage,
and not `preventDefault` either, since the owner has already made that call. A
WeakSet rather than a flag on the event, so nothing is added to a real
`ClipboardEvent`'s shape and a caller cannot mark an event without also finding
out whether it was already marked. `createDropController` asks it too, so a
future nested pair of drop targets cannot reintroduce the same defect; the claim
sits AFTER the "no images, nothing to intercept" return, or a plain-text paste
would be claimed by the first surface it crossed and every surface above it would
stand down over an event none of them was going to act on.

**`event.defaultPrevented` was the obvious alternative and is the wrong signal,
and the reason is measured rather than argued.** The worry was that ProseMirror
consumes a paste before the form sees it, which would make a
`defaultPrevented`-keyed guard stop attaching screenshots pasted into the body.
Read from a listener on `.rt-editor` -- between the ProseMirror surface and the
form -- in a real browser: `prosemirror consumed image paste before the form saw
it: false`. It finds no text and no html on a screenshot paste and declines it.
So both spellings agree today, which is exactly what makes the flag the wrong one
to key on: it would rest on a third-party library's internal choice about an
event it did not want. `defaultPrevented` says somebody stopped the browser's
default; it does not say somebody has already attached this file, and only the
second question has a right answer here.

## The thumbnail is not derivable, and the missing half is a migration

The home feed's widest select rung is `ITEM_SELECT_UNITS`: id, kind, title, body,
points, due_at, category, author, published, pinned, `body_doc`, `publish_at`,
`unit_id`. **No attachment embed, and `ClassroomItem` has no attachment field at
all.** So there is no image in the payload a card could draw.

Nor can the body carry one. `ItemBlock` is `p | h3 | h4 | ul | ol` and nothing
else, and StarterKit was measured to ship no `image` extension, so an item body
cannot hold a picture in the first place. Adding one is a change to
`_classroom_doc_ok`, which is a migration this bundle may not write.

Even granting an embed, three costs remain, and they are the argument rather than
a caveat: the bytes are private, so each thumbnail is a proxy request that 302s to
a signed URL -- thirty cards is thirty round trips on the page students open most;
`ClassroomAttachment` carries no cover designation, so "which image represents
this item" is a stored decision and therefore also a migration; and the widening
of a feed payload is a disclosure decision in its own right.

**So nothing was built, and the card was left exactly as it is.** It already
renders a per-kind glyph from a total `Record<ClassroomItemKind, ...>` with an
`{:else}` fallback -- it is never an empty box and never a spinner, which is what
the prompt asked the no-thumbnail state to look like. Inventing a decorative
stand-in (initials, a category tint) would have been a thumbnail that carries no
information about the item, maintained forever, in place of a glyph that already
distinguishes the three kinds.

## Format control: nothing built, and the question that would settle it

`RichTextEditor` produces bold, italic, links, bulleted and numbered lists, and
headings at levels 3 and 4. `ItemBody` renders exactly `p`, `h3`, `h4`, `ul`,
`ol` with bold/italic/href runs. **The two match exactly**, so the gap the prompt
suggested looking for -- what a body can express that the editor cannot produce --
is empty.

The one real gap is one level over and is already handled. The spec markdown
format (`parseMarkdown`) has `quote`, `code`, `table` and `figure`, none of which
the shared editor schema allows. But `SpecProseField` does not offer the rich
editor for such a field: `markdownEditable` round-trips the markdown first and
falls back to a plain-text source mode when it would not survive, and
`markdownUneditableReasons` tells the author why. So there is no data loss and no
unreachable formatting; the design already answers it.

Every concrete reading of "format control" therefore either does not exist or is
already built. **Nothing was built.** The question that would settle it, for
whoever asks the reporter: *when you wanted format control, were you looking at
the item body editor, the spec prose editor, or the plain-text source box -- and
what were you trying to write that you could not?* An answer naming a table or a
code block points at the spec editor's source-mode fallback (already there, and
possibly just not discoverable). An answer naming an image points at the item body
schema, which is a migration. An answer naming something else means this was never
the right guess.

## Verification

- `svelte-check`: **0 errors, 37 warnings**, breakdown **31 `state_referenced_locally`
  / 5 `css_unused_selector` / 1 `perf_avoid_nested_class`** -- the baseline, unmoved.
  Re-derived after `svelte-kit sync` with the two `PUBLIC_SUPABASE_*` values exported.
- `npm test`: **249 files, 5226 tests, all passing.**
- `npm run verify:browser -- --route composer-attach` at **375 and 1440**: 22
  measurements, **0 outside threshold**, 0 console errors, 0px horizontal overflow
  at both widths, h1 contrast 14.22:1. The readiness gate (`data-composer-ready`,
  polled on a 50ms interval because Tiptap is imported dynamically) satisfied in
  **964ms** on the cold width and **0ms already satisfied** on the second -- reported
  because `waitForApp` returns on DOM stability, which the SSR markup satisfies long
  before the editor exists, and a spec that trusted it would have measured a page
  with no editor on it.
- Full `npm run verify:readme` on the committed tree: **174 runs, 2412 measurements,
  4 outside threshold, 396.6s**, selftest 64 controls / 0 instrument failures. The
  four outside-threshold rows are **identical by identity** to the pre-bundle
  baseline (`/dev/pathways` tap-target at both widths, `/dev/coins-signedin-1` and
  `/dev/coins` horizontal-scroll at 375). This route contributed none; the deltas are
  exactly +2 runs and +22 measurements.

**Both required positive controls were run, restored from `cp` copies rather than
`git checkout --`, and re-verified md5-identical:**

1. Paste path given a filter of its own, bypassing the picker's `stage`: 2 tests
   reddened in `composer-attach-parity-mount` (`['empty.png','real.png']` against
   the picker's `['real.png']`). Restore md5 `6d5b9eb2…`, matching.
2. Paste handler made to swallow plain text: **3** tests reddened across both vitest
   projects -- the composer routing test, the existing panel parity mount test, and
   the node-project `file-drop` test. Restore md5 `2f56aa74…`, matching. The guard
   bites in three independent places, which is what the second control was asking.

## Not verified

- **No real system paste.** The harness dispatches a `ClipboardEvent` carrying a
  real `DataTransfer` with a real PNG `File`, at a real node, so the browser's own
  event class, the real bubbling and ProseMirror's real handler all run -- but the
  event is `isTrusted: false` and nothing goes through the OS clipboard. Ctrl+V on
  the preview, signed in, is a separate check and is not claimed here.
- No signed-in surface, no live Supabase project, no real upload. The harness
  transports answer in memory and the page never saves.
- `prefers-reduced-motion` is `no-preference` in the harness, and web fonts are
  blocked (`fonts.googleapis.com` is reset by the proxy), so text was measured in
  the fallback stack.

## Deliberately not done

- **Paste was not widened beyond `image/*`.** A copied FILE of any type arrives as
  a clipboard item with `kind === 'file'`, so the restriction is stricter than it
  strictly needs to be, and a teacher who copies a PDF in Finder and pastes it gets
  silence where the picker would have accepted it. Widening is not safe from here:
  `SpecRenderer` routes a pasted image to a module's PHOTO zone and says so in
  words, so the same change would start sending PDFs to a photo zone. It belongs
  in a bundle that owns those surfaces.
- No paste added to the nine non-classroom attach surfaces listed above; all are
  outside this bundle's files.
