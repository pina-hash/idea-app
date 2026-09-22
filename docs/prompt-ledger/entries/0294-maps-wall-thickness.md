# 0294 Wall thickness in IDEA Maps
- Issued: 2026-09-22
- By: Claude Code cloud session (Opus 5, effort high), lane D7
- Owns: `src/lib/maps/`, `src/routes/maps/`,
  `supabase/migrations/0224_maps_wall_thickness.sql`,
  `docs/standards/IDEA_MAPS_SPEC.md` (and its `REGISTER.md` row),
  `tests/maps-*.test.ts`, `tools/browser-verify/routes/maps-*.mjs`,
  `docs/prompt-ledger/entries/0294-*`, and its own `docs/history/` entry.
- Migration permitted: yes, exactly one. Claims: 0224. Highest landed at
  issue: 0217. Confirmed free with `node tools/migration-claims.mjs` before the
  first commit.
- Status: issued
- Branch: claude/new-session-ow0i42
- Notes: Builds decision 36
  (`docs/decisions/entries/36-maps-outline-is-the-interior-face.md`), which
  Mr. Pina delegated on 2026-09-21 after feedback report 38 ("wall thicknesses
  must be accounted for", 2026-09-14, from `/maps/edit`). The decision is the
  design constraint and is not relitigated: the typed outline is the INTERIOR
  face, thickness is a separate per-node value with a building-level default,
  and the wall is a band lying outward. The central promise is that every
  published row means exactly what it meant before, with no backfill.

  Two questions the decision left open are ANSWERED here rather than deferred:
  thickness is uniform PER NODE (not per edge), and it lives in a COLUMN (not
  in the `outline` jsonb), both for reasons written into 0224's header. The
  pre-existing defect that a polygon snaps to its axis-aligned bounding box
  rather than its real edges is deliberately NOT fixed and is named in the
  spec and in the history entry as its own bundle.
