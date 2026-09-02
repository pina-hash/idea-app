# 0008 IDEA Maps: HEIC on capture, and the 23505 that is a permanent refusal
- Issued: 2026-09-02
- By: router chat for IDEA portal work (Lane 1, Maps)
- Owns: `src/lib/maps/**`, `src/lib/pg-errors.ts`, `src/routes/maps/**`, `src/routes/dev/maps-media/**`, `tests/maps-*.test.ts`, `tests/db/maps-*.test.ts`, `tools/browser-verify/routes/maps-*.mjs`, the generated counts block in `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0008-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0170
- Status: issued
- Branch: assigned by the harness
- Notes: The two obligations migration 0168 handed forward and neither of
  which was built. The `maps-media` bucket admits HEIC and no browser except
  Safari renders one, so a photo taken at a toolbox uploads and then shows as
  a broken image to everyone else. And `src/lib/pg-errors.ts` classifies
  SQLSTATE 23505 as transient for every caller, so a caller that hits a
  permanent unique-constraint refusal retries it to exhaustion; 0168 added a
  new partial unique index over published compartment elevation slots, which
  makes a second such refusal reachable.

  The public viewer at `/maps` is NOT in this bundle and is blocked on the
  Claude Design accent pass per spec section 10.

  Deliberately excluded: any migration (none permitted), the public viewer,
  and any edit under `src/lib/classroom/**`, `src/lib/notebook/**` or
  `src/lib/server/**`, which are read-only to this bundle.
