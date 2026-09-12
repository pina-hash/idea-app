# 0186 IdeaCAD materials are data: a global library, custom student materials, real stock thicknesses

- Issued: 2026-09-12T19:00:00Z
- By: router chat
- Owns: `supabase/migrations/0208_*.sql`, `src/lib/ideacad/blade/materials.ts`, the
  material and thickness controls in `src/lib/ideacad/BladeEditor.svelte`, an admin
  materials surface, `tests/db/ideacad-materials*`, `tests/ideacad-materials*`,
  `tools/browser-verify/routes/ideacad*.mjs` and its measured store entries,
  `docs/prompt-ledger/entries/0186-*`, and its own `docs/history/` entry.
- Migration permitted: exactly one. Claims: 0208. Highest on origin/main at issue: 0203
- Status: pushed
- Branch: claude/vibrant-brown-mgym02 (cut from origin/integration b0a8101d)
- Notes: REPLACES AN EARLIER 0186 DRAFT that hardcoded six materials into
  `materials.ts`. Mr. Pina rejected it on 2026-09-12: a material is four numbers in
  a form, the engine already does the calculation from input values, and shipping a
  code change to add one is overkill. MATERIALS ARE DATA. Two layers, one table:
  global (admin-managed, no deploy) and custom (a student's own, not global).
  Thickness is data too and is the lesson -- each material carries the real stock
  thicknesses it is sold in and a student picks from that list rather than typing a
  number. Seed set from Mr. Pina verbatim: stainless steel, galvanized steel, carbon
  or unknown steel, 6061 aluminum, polycarbonate, wood. 3D-printed is EXCLUDED from
  the seed set (printed density depends on slicer settings, so a stated mass would be
  a lie) and is exactly the case the custom layer answers; `pla` and `petg` are seeded
  RETIRED purely so documents already saved against the hardcoded list keep resolving.
  DENSITIES ARE UNVERIFIED BY COLUMN, not by prose: this container has no network
  route to matweb, azom, wikipedia, mcmaster, onlinemetals or the USDA FPL (each
  tried, each refused by the egress proxy), so every seeded row names the published
  standard that owns its density and lands `source_verified` false. THE STOCK
  THICKNESSES ARE A PROPOSAL for Mr. Pina to correct against what is actually in the
  shop. 0205, 0206 and 0207 are claimed by ledgers 0179, 0181 and 0183 and none was
  pushed at branch time; 0208 depends on none of them and pastes fourth.
