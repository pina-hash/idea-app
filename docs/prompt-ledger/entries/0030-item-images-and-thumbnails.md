# 0030 Images in an item body, and the assignment thumbnail that needs them
- Issued: 2026-09-03
- By: router chat for IDEA portal work
- Owns: `src/lib/classroom/classroom-doc.ts`, the image branch of `spec-markdown.ts` and `RichTextEditor.svelte`, `src/lib/server/rich-text-normalize.ts`, `ItemBody.svelte`, the item card thumbnail in `ClassroomFeed.svelte`, `feed.ts`, `supabase/migrations/0176_*.sql`, `src/routes/dev/item-images/**`, `tests/classroom-item-image*`, `tests/db/classroom-item-image*`, `tests/classroom-figures.test.ts`, `tools/browser-verify/routes/item-images*.mjs`, the generated regions in `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0030-*`, and its own `docs/history/` entry.
- Migration permitted: exactly one, 0176. Highest on origin/main at issue: 0175
- Status: issued
- Branch: assigned by the harness
- Notes: An instructor asked for assignment thumbnails so a feed of items is
  scannable rather than a wall of identical cards. Prompt 0026 audited it and
  found the thumbnail is NOT DERIVABLE: the feed's widest rung carries no
  attachment, `ClassroomItem` has no attachment field, and `ItemBlock` is
  `p | h3 | h4 | ul | ol`, so an item body cannot hold an image at all. It
  built nothing and said so, which was correct: both halves are migrations
  it was forbidden to write.

  So the thumbnail is downstream of a real gap. An instructor writing an
  assignment cannot put a picture in it, on a surface whose whole subject is
  making and measuring physical things.

  `classroom-doc.ts` carries the reasoning behind the current union in its
  own comments, including why a list item cannot hold two paragraphs. Read
  those before adding a member: the union is deliberately small and every
  addition has to earn it against the same argument.

  Deliberately excluded: a second image path beside the notebook's, which has
  its own contract; video or embeds of any kind; and the cover being anything
  other than an image already in the body, because a separately uploaded
  cover is a second asset lifecycle nobody asked for.
