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
- Status: pushed
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

  Shipped: migration 0224 (NEVER APPLIED -- Mr. Pina pastes it, and its tail
  carries a commented read-only verification query with a positive control),
  the geometry layer in `src/lib/maps/maps.ts`, the select ladder's first rung
  in `selects.ts` (which that module predicted since 0161), the wall band in
  the public viewer and the editor canvas, the two form fields, and
  `IDEA_MAPS_SPEC.md` 1.2 with its `REGISTER.md` row.

  The browser run corrected this session twice: the band was inheriting the
  shape's stroke at higher specificity (two lines where there is one surface,
  worst at the sub-pixel widths the feature is judged on), and the editor was
  still snapping the mover by its INNER footprint. It also corrected the
  session's own expected value for a sibling snap -- 39, not 30, because the
  chest's outer face is at 33 and the bench's inherited wall is 6.

  Left for somebody else, both named in the history entry:
  `maps-edit-state-place.mjs` and `maps-editor-state-room.mjs` carry flaky
  pointer-drag probes that drop the first drag on the branch point as well as
  on this tree; and a polygon's SNAP targets are still its bounding box.
