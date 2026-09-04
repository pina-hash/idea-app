# 0032 Finish the attachment story: a picker instead of a filename, paste everywhere, and an image's words
- Issued: 2026-09-03
- By: router chat for IDEA portal work
- Owns: `ContentComposer.svelte`, `RichTextEditor.svelte`, the text projection in `classroom-doc.ts`, `src/lib/rich-text-doc.ts`, `src/lib/file-drop.ts`, paste wiring in `PeoplePanel.svelte` and `SpecImporter.svelte`, drop wiring in `FoundrySubmit.svelte`, `supabase/migrations/0178_*.sql` (conditional), `src/routes/dev/attach-reach/**`, four test files, `tools/browser-verify/routes/attach-reach*.mjs`, the generated regions in `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0032-*`, and its own `docs/history/` entry.
- Migration permitted: at most one, 0178, only if proven. 0177 reserved for 0031. Highest on origin/main at issue: 0176
- Status: pushed
- Branch: `claude/attachment-picker-paste-image-gptgo3` (0178 landed straight to `main` as `dabfc17`)
- Notes: Three loose ends, all from bundles that reported them rather than
  widening their own scope.

  Prompt 0030 shipped images in an item body and said plainly that the
  toolbar's Image control ASKS FOR A FILENAME rather than offering a picker
  of the item's own files, because `ContentComposer` passes the editor no
  attachment list and that prop was not its file. An instructor typing a
  storage key by hand is not a feature.

  It also deferred two things. Pasting a copied figure reference still lands
  as text, which needs a ProseMirror paste plugin rather than
  `transformPastedText`. And the plain-text projection DROPS an image's
  description, so an image-only body has an empty `body` column and its alt
  text reaches neither the stream preview, the announcement fallback nor the
  export. Fixing that needs `rich-text-doc.ts` and `_classroom_doc_text`
  changed TOGETHER, because 0030 measured that they agree by construction
  and widening either alone is what breaks them.

  Prompt 0026 mapped every surface that can attach a file and found paste
  working on six and absent on ten, and found `FoundrySubmit` hand-rolling
  its own drop instead of using `dropTarget`.

  Deliberately excluded: the notebook's photo path, which has its own
  contract; and any surface whose picker is not a file picker.
