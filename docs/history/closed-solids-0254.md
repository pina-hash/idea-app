---
title: "IdeaCAD closed blade solids, real hex bounds, collar, and optional spin bolt"
date: 2026-09-14
branches: ["codex/closed-solids-0254"]
migrations: []
subsystems: ["ideacad", "blade geometry"]
---

Ledger 0254 replaces the blade evaluator's collection of implied feature shells with one sampled boundary of the feature union. The body, hex extension, collar, blade pattern, and optional bottom spin bolt participate in one occupancy union before its exposed boundary is triangulated. Every face is outward wound, internal faces are absent, and zero-width sampled contacts are closed before skinning. The manifold regression checks every undirected edge has exactly two incident faces and checks positive signed volume across sixteen combinations spanning 3 through 8 profile stations and 2 through 8 blades.

The stored schema remains schema 1 and the profile station format is unchanged. An optional schema-1 `spinBolt` flag was added. Compatibility is deliberately asymmetric: a document saved before the flag existed receives both physical defaults while evaluating; an explicit `spinBolt: false` removes the bottom bolt and remains valid. The collar is implicit and always present because this bundle establishes it as part of every generated body.

“Full 0.5 inch in width on top” is interpreted as **0.5 inch of radial collar width outside the hex core's circumscribed radius**. “Adapts to the height of the design” is interpreted as collar axial height equal to 10% of the revolved body's top height, clamped to 0.125–0.5 inches so short designs retain a printable collar and tall designs do not acquire an unbounded tower. This interpretation is isolated in evaluation geometry so the owner can correct it directly after visual inspection.

Hex extension now has one rule: at least 0.5 inches, with no maximum. Evaluation does not consult the stale fallback config maximum, and validation gives the student an actionable sentence stating both facts.

### What was measured

- Focused evaluation and tree-operation verification passes 2 files / 15 tests, including 16 manifold parameter combinations.
- The manifold mesh is lazy: ordinary physics/readout evaluation does not pay the sampled-union cost; geometry is generated on first access and cached.
- Full-suite verification reported 472 passing files / 7 failing files and 9,097 passing tests / 16 failing tests / 15 skipped tests. The failures were pre-existing checkout/environment failures: missing `psql`, missing the 0215 applied record, the already-landed station-boundary test defect, existing DOM feature-manager assertions, and the existing viewport picking type mismatch. The two test-fixture failures exposed by this bundle were corrected and the focused 15-test rerun passed.
- `svelte-check` reported 1 error and 37 warnings in 21 files. The sole error is the pre-existing, forbidden `src/lib/ideacad/viewport/picking.ts` `Vector2Like` mismatch; this bundle introduced no diagnostic in an owned file.
- No migration was created.

### What was NOT verified

- No viewport or renderer was changed or visually inspected, because those paths were explicitly forbidden. The new unified solid is available at `Evaluation.geometry.solid`; the current viewport remains an unowned consumer of the older convenience geometry fields. Consequently this bundle proves the generated kernel mesh, not that the existing viewport has switched to drawing it.
- No production, preview deployment, signed-in session, or live Supabase project was used.
