---
title: IdeaCAD analytic feature edges and silhouettes
date: 2026-09-14
branches: ["codex/viewport-feature-edges-0271"]
migrations: []
subsystems: ["ideacad", "viewport", "rendering"]
---

Ledger 0265's smoothed-normal crease test was calibrated for a voxel skin. After ledger 0268 replaced that skin with analytic surfaces, the same test promoted triangulation boundaries into visible edges. `Viewport.svelte` now computes feature edges from the raw normals of adjacent faces and derives the view-dependent silhouette from whether those faces lie on opposite sides of the camera-facing test.

The feature threshold is 85 degrees. It is intentionally above the analytic revolve's 5.625-degree circumference facets and the coarse swept-surface triangulation, while remaining below the collar top rim's 90-degree turn. A synthetic 64-segment cylinder test proves that none of its longitudinal segment boundaries become features and that all 64 top-rim edges survive. A second test proves that silhouettes change with the camera direction.

On the shipped default, the former 25-degree smoothed-normal filter selected 766 static segments. The replacement selects 628 static feature segments. At the tested oblique orthographic camera direction, 99 non-feature silhouette segments bring the displayed set to 727. Feature edges are excluded from the silhouette pass so shared members are not drawn twice.

## Verification limits

The component test passed. The repository test and Svelte diagnostics were run as recorded in the ledger/PR. A 1440px raster was attempted twice, including after attempting to install Chromium's system dependencies, but Chromium could not load `libatk-1.0.so.0`; the apt sources exposed no installable package. No screenshot was produced and no claim of visual inspection is made. No mesh, lighting, material, camera, controls, or migration changed.
