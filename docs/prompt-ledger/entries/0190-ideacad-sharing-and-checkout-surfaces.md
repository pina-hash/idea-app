# 0190 IdeaCAD: the sharing control, the parts list, and one-tap checkout

- Issued: 2026-09-12
- By: router chat
- Owns: the sharing and checkout surfaces under `src/lib/ideacad/`, the
  transports region of `src/lib/ideacad/transports.ts`,
  `tests/dom/ideacad-sharing*`, `tests/dom/ideacad-checkout*`,
  `tools/browser-verify/routes/ideacad*.mjs` and its measured store entries,
  `docs/prompt-ledger/entries/0190-*`, and its own `docs/history/` entry.
  Ledger 0189 owns `history.ts` and 0188 owns the landing; neither is touched.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0208.
  `0205` through `0208` are all applied and landed; this bundle renders what
  `0205` and `0207` already give and adds no database object.
- Status: issued
- Branch: `claude/eager-dijkstra-ewfopc`, branched from `origin/integration` at
  `7f5ca8f0`.
- Notes: the pure layers exist and are untouched -- `src/lib/ideacad/sharing.ts`
  (ledger 0179) and `src/lib/ideacad/assembly.ts` (ledger 0183) were both shipped
  with NO UI, which is the gap this bundle closes. A new dev route
  `/dev/ideacad-team` is created rather than editing
  `src/routes/dev/ideacad/+page.svelte`, which belongs to ledger 0171: a
  browser-verify spec needs a page to drive and a new URL collides with nobody.
