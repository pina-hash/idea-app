# 0127 HTML assignment: the manifest, its validator, and migration 0195

- Issued: 2026-09-10
- By: Mr. Pina, as one of four parallel lanes building against a single normative
  contract for ported HTML assignments (0126 the bridge and serving route, 0127
  the manifest and store, 0128 the fixtures, 0129 the rubric translation).
- Owns: `src/lib/classroom/html-assignment/manifest.ts` and `store.ts`;
  `supabase/migrations/0195_*.sql`; the `schemaVersion` gate region of
  `src/lib/classroom/assignment-spec.ts` AND NOTHING ELSE IN THAT FILE;
  `tools/validate-assignment-spec.py`; the HTML-import path in
  `src/lib/classroom/ContentComposer.svelte`; `tests/html-assignment-manifest*`,
  `tests/db/html-assignment*`; `docs/prompt-ledger/entries/0127-*`, and its own
  history entry.
- Migration permitted: exactly one. Claims: 0195. Highest on origin/main at issue: 0193
- Status: pushed
- Branch: claude/html-assignment-manifest-contract-gye4f7
- Notes: 0126 owns `bridge.ts`, `HtmlAssignmentFrame.svelte` and
  `src/routes/hx/**`; 0128 owns `src/routes/dev/html-assignment/fixtures/`; 0129
  owns `rubric.ts`. This lane creates none of them and imports none of them: a
  type another lane owns is declared locally under a `CONTRACT COPY` marker for
  the integration bundle to delete. The migration is NOT applied -- this
  container cannot reach the production database -- and the entry carries the
  verification query instead.
- Amendment 1 (mid-session) added `header: HtmlBlock[]` to the manifest, which
  this lane applied; its other five items land in 0126's files or confirm what
  was already built. `0194` read as an unaccounted hole for part of the session
  and is `claude/gauntlet-verification-floor-oclq47`'s (ledger 0120), pushed
  while this lane ran; it applies before `0195`.
