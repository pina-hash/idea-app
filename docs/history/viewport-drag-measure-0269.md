---
title: IdeaCAD parameter-drag bottleneck measurement
date: 2026-09-14
branches: ["codex/viewport-drag-measure-0269"]
migrations: []
subsystems: ["ideacad", "viewport", "performance"]
---


A ten-sample parameter-change probe changed the second default revolve-station radius by 0.001 in per sample. The clock separately enclosed the lazy `evaluation.geometry.solid` read (mesh generation) and `solidBuffers` (the viewport's CPU-side conversion into typed position, normal, index and crease arrays).

The cold sample was 626.5 ms generation plus 83.7 ms conversion. Across the following nine warm samples, generation was 267 ms median and 380 ms p95 (257–380 ms), while conversion was 33.6 ms median and 70.7 ms p95 (30.2–70.7 ms). Each sample held approximately 7,530 vertices and 15,056 triangles; small radius changes crossed the sampling grid and changed topology at samples 4 and 9.

The existing reactive path delivers one rebuild per evaluation. Ten delivered parameter changes therefore generated ten meshes and prepared ten complete geometry replacements for upload: one generation and one upload preparation per change, with no animation-frame coalescing.

## Decision

Generation alone costs 15–23 complete 16.67 ms frame budgets per warm change. It is the bottleneck before the viewport's conversion, GPU upload, or render begins. Ledger 0269 explicitly required no further implementation change when that result was found because ledger 0268 owns the generator rewrite. Accordingly, `Viewport.svelte` and its tests were not changed; buffer reuse and frame coalescing were deliberately not attempted in this bundle.

## Verification limits

The GPU upload itself and a fresh render p95 were not measurable here. The pinned Chromium executable at `/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome` could not start because the container lacks `libatk-1.0.so.0`. The prior 0.6 ms render p95 is retained only as the established baseline, not presented as this session's measurement. No screenshot was possible for the same reason. No migration was written.
