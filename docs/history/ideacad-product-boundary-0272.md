---
title: "Ledger 0272: IdeaCAD's product boundary (`codex/ideacad-product-boundary-0272`, no migration)"
date: 2026-09-14
branches: [codex/ideacad-product-boundary-0272]
migrations: []
subsystems: ["IdeaCAD", "Documentation"]
---

Added the owner's framing at the top of `docs/IDEACAD.md` without softening either
quote: IdeaCAD is a quick 3D sketching tool for developing and communicating ideas,
not a technical precision program and not SolidWorks.

The section records the working rule that follows. SolidWorks conventions are used
where existing muscle memory makes them genuinely helpful, with 3D viewport mouse
controls as the clear case. Everything else must be usable without instruction by a
fourteen-year-old who has never opened CAD. Speed and directness deliberately beat
precision and rigor when they conflict, and discoverability is a correctness property.

The evidence is the two moments named by the owner: opening the editor and saying
"I don't know how to do anything"; and calling the earlier sixteen-row numeric r/z
editor "extremely annoying to do anything meaningful". That earlier editor was a
spreadsheet with a 3D preview rather than a sketching tool.

The rejected-pattern list records four shapes later work must not rebuild: geometry
editing through a number table, prose instructions inside the interface, controls
discoverable only by experimentation, and second ways to perform an action that
already has a way.

## Verification

`npm run history:verify` passed. `npm test` was invoked twice, including under
the container's cached Node 24.15.0, but Vitest failed during project setup before
running any tests because Rolldown could not resolve `node:module`; the resulting
counts were 0 passed and 0 failed. This was a documentation-only bundle; no
migration was permitted or added.
