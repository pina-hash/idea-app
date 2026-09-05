# 0041 The image control asks for a filename; give it a picker
- Issued: 2026-09-04
- By: router chat for IDEA portal work
- Owns: `RichTextEditor.svelte`, `ContentComposer.svelte`, `src/lib/classroom/attachments.ts` (conditional), `src/routes/dev/item-images/**`, `tests/classroom-item-image*`, `tests/dom/item-image*`, `tools/browser-verify/routes/item-images*.mjs`, the generated regions in `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0041-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0180
- Status: issued
- Branch: assigned by the harness
- Notes: Prompt 0030 shipped images in an item body and said plainly what it
  could not finish: the toolbar's Image control ASKS FOR A FILENAME, because
  `ContentComposer` passes the editor no attachment list and that prop was
  not in its owned set. An instructor typing a storage key by hand is not a
  feature, and a key typed wrong produces a body referencing a picture that
  will never load.

  0030 also required alt text four ways and refuses rather than drops. That
  contract survives whatever the picker does.

  Deliberately excluded: `classroom-doc.ts` and `ItemBody.svelte`, both
  settled; the notebook's photo path; and any new upload route, since the
  attachment upload already exists and is proven on production.
