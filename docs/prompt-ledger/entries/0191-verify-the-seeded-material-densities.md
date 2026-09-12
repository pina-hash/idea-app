# 0191 Verify the seeded material densities against their published sources

- Issued: 2026-09-12T21:45:00Z
- By: router chat
- Owns: the material seed data path, `tests/db/ideacad-materials*`,
  `docs/prompt-ledger/entries/0191-*`, and its own `docs/history/` entry.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0208
- Status: issued
- Branch: claude/dazzling-pascal-faz8t0 (cut from origin/integration 7f5ca8f0)
- Notes: `0208` is applied and every one of its eight materials landed
  `source_verified = false`, with an UNVERIFIED chip on every surface. That was
  correct and honest: ledger 0186's container had NO EGRESS -- matweb, azom,
  wikipedia, mcmaster, onlinemetals and the USDA FPL were each tried and each
  refused by the proxy -- so it named the owning standard per row and declined to
  assert a number it could not check.

  THIS BUNDLE'S FIRST JOB IS THE EGRESS TEST, and everything downstream is
  conditional on it. If no published source can be reached, the bundle STOPS on
  the densities rather than filling one in from recollection;
  `IDEA_MATERIALS_PROCESS.md` governs that and its "a file that was searched but
  not read" clause is the operative one.

  THE VALUES ARE DATA, NOT CODE. Materials are admin-managed as of `0208` and Mr.
  Pina edits them in the app, so a verified density ships as a read-only-safe SQL
  UPDATE he pastes, with a citation per row -- never as a migration. A migration
  for this is the shape `0208` exists to end.

  TWO ROWS NEED A JUDGMENT AND ARE FLAGGED, NEVER SILENTLY PICKED. "Carbon or
  unknown steel" is Mr. Pina's own category for stock of unknown provenance;
  `0208` assumes A36 and says so in the UI. "Wood" is not one material and a
  single density for it is a fiction.

  Ledgers 0189 and 0190 run in parallel and own `history.ts` and the sharing
  surfaces; neither is touched here.
