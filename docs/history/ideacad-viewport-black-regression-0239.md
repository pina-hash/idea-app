---
title: IdeaCAD viewport black-frame regression
date: 2026-09-14
branches: ["codex/ideacad-viewport-black-regression-0239"]
migrations: []
subsystems: ["ideacad", "viewport"]
---

Ledger 0237 replaced Lambert stock with metallic `MeshStandardMaterial` instances
while also removing the broad ambient light and providing no environment map. That
combination made the new stock depend entirely on the direct-light response; the
rendered canvas in production was indistinguishable from its dark clear colour even
though the existing harness still observed draw calls and triangles.

The three-point rig, hemisphere floor, ACES tone mapping, shaded-with-edges default,
grid and contact patch remain. Each stock role now carries a restrained emissive
response in its own base colour. This is not a replacement unlit material: direct
lights still describe the form and metalness/roughness still shape the highlight. It
is the minimum environment-independent response that keeps stock distinguishable
when reflected radiance is absent.

The viewport probe now reads the real WebGL framebuffer and reports the fraction of
pixels meaningfully different from the encoded clear colour. In development the
first fitted, sized frame asserts that at least 0.5% of the framebuffer differs. The
comparison samples the actual corner pixels after output colour conversion rather
than predicting bytes from the CSS colour. This would have failed the shipped black
canvas while draw-call and triangle-content checks stayed green.

No migration was written. The installed Chromium binary could not launch because
`libatk-1.0.so.0` and the rest of its system runtime were absent, and the configured
package snapshot was unreachable, so 1440px and 375px rasters and visual inspection
were not possible in this container.
