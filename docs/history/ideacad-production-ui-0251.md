---
title: "IdeaCAD removes production chrome that obscured the work"
date: 2026-09-14
branches: ["codex/ideacad-production-ui-0251"]
migrations: []
subsystems: ["IdeaCAD"]
---

Numeric controls now use border-box sizing, tabular right-aligned figures, and reserved room for the browser's number affordance. This keeps a field's padding and native control inside its assigned grid track rather than clipping the least-significant digit at the pane edge.

FeatureManager and PropertyManager collapse controls remain on their existing handlers and continue to publish the same pane layout. Their presentation is now a 24-pixel icon button docked at the top inside each pane instead of a full-height strip of vertical words. Accessible names and hover titles retain the full Show/Hide wording.

The FeatureManager now lists features and its two document nodes only. Body stations remain editable through Body Revolve's existing PropertyManager and are no longer represented as pseudo-features. Selecting a writable tree row still opens its parameters in one click; the redundant EDIT tag has been removed while VIEW remains explicit for read-only rows.

PropertyManager's existing action groups were not structurally or behaviorally changed. The Blade editor's owning stylesheet now labels and spaces commit and feature-order groups as separate operations, and expands the bare fixed-feature tag into a contextual feature-identity statement.

The full test runner reported 9,091 passing, 16 failing, and 15 skipped tests across 479 files (473 passing and 6 failing). Five failures are stale FeatureManager assertions that require the station rows and redundant interaction this prompt explicitly removes; ten are the container's missing `psql`, and one is the pre-existing missing migration-applied record. `svelte-check` reported 1 error and 37 warnings in 21 files; the sole error is the pre-existing `Vector2Like` mismatch in forbidden viewport code, while this bundle adds no diagnostic. A 1440-pixel Chromium raster was attempted through the existing `/dev/ideacad?role=student&state=property` harness, but this container lacked Chromium's shared-library dependencies and its configured package sources could not supply them, so visual verification remained blocked by the environment.
