# 0201 IdeaCAD: the shared-open path, and a place to see what was shared with you

- Issued: 2026-09-13
- By: router chat
- Owns: the shared-open path in `src/lib/ideacad/store.ts`, the
  shared-documents surface under `src/lib/ideacad/`,
  `tests/dom/ideacad-shared-open*`, `tests/db/ideacad-shared-open*`,
  `tools/browser-verify/routes/ideacad*.mjs` and its measured store entries,
  `docs/prompt-ledger/entries/0201-*`, and its own `docs/history/` entry.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0208;
  `origin/integration` carries 0209 and 0210, both of which the prompt states
  are applied to production and verified against Mr. Pina's own queries.
- Status: pushed
- Branch: `claude/peaceful-wright-hupa6x`, branched from `origin/integration`
  at `f4616dca`.
- Notes: ledger 0195 named the gap this bundle closes.
  `ideacad_shared_with_me` and `ideacad_open_shared_document` have been applied
  to production since `0205` and have had NO CALLER; `store.ts` has no
  `openShared`. So a student can GRANT access -- ledger 0190 built
  `SharePanel` and 0195 mounted it -- and the person granted it has no way to
  open the document. The feature is half live and this is the other half.
  Ledger 0200 owns the landing of the standing range; nothing is merged here
  beyond the six-item checklist this prompt's own NO-MIGRATION status permits.
  **The instructor path is not rebuilt.** `0201`'s read policies carry
  `_classroom_manages_item`, so a teacher of record already reads everything
  with no grant; that was confirmed by reading and left alone.
