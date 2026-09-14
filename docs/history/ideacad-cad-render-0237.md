---
title: IdeaCAD CAD-solid viewport render
date: 2026-09-14
branches: ["codex/ideacad-cad-render-0237"]
migrations: []
subsystems: ["ideacad", "viewport"]
---

The viewport's former Lambert materials and strong ambient wash produced almost
no readable normal falloff. The renderer now uses explicit warm key, cool fill,
and green-white rim directions with a low-energy hemisphere floor. ACES tone
mapping and sRGB output preserve the separation on the dark IdeaCAD plate. The
body, hex, and blades use three shared `MeshStandardMaterial` instances with
restrained, role-specific metalness and roughness, so the stock has a specular
response without textures, an environment map, or additional material instances.

Shaded-with-edges remains the initial display style. Body and hex feature edges
continue to be derived only in the viewport, while the blade uses the edge
geometry the existing geometry translator already supplied. The existing display
control still cycles shaded-with-edges, shaded, and wireframe; no geometry
production or feature-tree file changed.

The large teal arc was the document's clockwise/counter-clockwise rotation
annotation. It was not attached to a selected feature, had no label, and was not
part of the model. It has been removed rather than letting an unexplained gizmo
compete with the solid.

A 12-inch, half-inch-step grid now sits just below the body's lowest station, and
a translucent unlit circle with a generated 64-pixel radial alpha fade supplies a
quiet contact patch. These deliberately do not enable renderer shadow maps: they
add two simple draws rather than a depth pass and keep render-on-demand unchanged.

The apparent blade detachment in the default production model is shading, not a
geometry gap. At the blade mount height of 1.25 inches, linear interpolation of
the surrounding body stations gives a body radius of 1.5939 inches. The blade's
root lies from radius 1.45 inches at its centre to 1.4674 inches at its corners,
and occupies heights 1.25 through 1.375 inches, so it intersects the body by at
least 0.1265 inches. No blade or tree geometry was altered. A separately authored
tree can still specify a mount radius beyond its body because the current tree
contract contains no attachment constraint; that is a blade-lane validation
question rather than a viewport repair.

The previous scene issued 14 draw calls for the default four-blade model: twelve
solid/edge calls plus the two-piece arc. The new scene also issues 14: the same
twelve solid/edge calls plus grid and contact patch. That is a static draw-call
account, not a measured frame time. This Codex container has no runnable browser
or installed Chromium, so the requested p95 before/after timing and 1440/375
rasters could not be produced. Consequently the actual highlight strength,
light falloff, edge contrast, grid density, contact-patch alignment, small-screen
composition, and GPU frame cost were not visually verified. The existing
measured baseline remains p95 0.5 ms over 299 frames; no replacement measurement
is claimed.

No migration was written.
