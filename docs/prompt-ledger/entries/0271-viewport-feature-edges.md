# 0271 Restore analytic viewport feature edges
- Issued: 2026-09-14T22:40:00Z
- By: Codex session
- Owns: `src/lib/ideacad/viewport/Viewport.svelte`, its tests, `docs/prompt-ledger/entries/0271-*`, `docs/history/viewport-feature-edges-0271.md`
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0215 (local tree)
- Status: committed; push blocked by unavailable GitHub transport/credentials
- Branch: `codex/viewport-feature-edges-0271`
- Notes: Replaced the voxel-era smoothed-normal crease filter after ledger 0268's analytic mesh landed. The overlay now combines raw-dihedral features with a camera-derived silhouette.

## Measurement and visual disposition

On the shipped default, the old 25-degree smoothed-normal filter emitted 766 static edge segments. The 85-degree raw-dihedral filter emits 628 feature segments; the tested oblique orthographic view emits 727 total segments after adding 99 non-feature silhouette segments. The cutoff deliberately sits above both the 5.625-degree circumference facets and the coarse swept-surface triangulation, but below the collar's 90-degree top rim.

The required 1440px browser raster could not be produced in this container. Playwright's pinned Chromium aborts before launch because `libatk-1.0.so.0` is absent, and the configured apt sources contain no package providing it. This is an explicit visual-verification gap: the image was not looked at, and the programmatic counts do not substitute for that review.

No mesh, lighting, material, camera, controls, or migration changed.
