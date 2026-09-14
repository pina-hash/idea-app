---
title: "IdeaCAD direct-manipulation research and bundle plan"
date: 2026-09-14
branches: ["codex/ideacad-direct-manipulation-0253"]
migrations: []
subsystems: ["ideacad", "documentation", "interaction-design"]
---

Ledger 0253 produced a docs-only analysis of Plasticity-style viewport manipulation and measured it against IdeaCAD's schema-1 blade tree. No source, test, or migration file changed.

The current environment could not retrieve research sources: the configured web-search service returned HTTP 401, Plasticity's official manual and product roots returned HTTP 403, and direct search-engine requests returned no response. The report therefore labels every Plasticity operational claim UNVERIFIED rather than laundering recollection into product requirements. A connected follow-up owes versioned primary citations before copying Plasticity-specific bindings.

The tree audit found one especially clean inverse: the complete blade pattern's axial placement is `mount.z`, passed through evaluation as `bladeZ` and assigned to every rendered blade. That is the first proposed bundle because it directly answers dragging parts along the core while changing one scalar. Revolve stations, constrained blade-planform handles, and hex dimensions also have parameter-specific inverses; generic mesh-face edits, stock-driven extrusion thickness, arbitrary pattern placement, and standard-part movement do not.

The existing picker can return a feature-labelled mesh hit and intentionally resolves the combined blade chain to its terminal feature, but the viewport does not wire it and there is no stable face/edge/vertex provenance. The renderer rebuilds disposable tessellated geometry from evaluation output. The plan therefore refuses to equate rendered triangles with CAD topology.

The shipping plan has six independently useful bundles. Bundle one is fully specified as a ready-to-paste no-migration prompt, including exact ownership, forbidden schema/kernel files, one-edit-per-gesture history semantics, dev-harness browser proof, test-count reporting, and the required 0-error/37-warning-in-20-files Svelte baseline.

