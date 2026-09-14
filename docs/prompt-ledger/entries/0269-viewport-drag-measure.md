# 0269 Measure IdeaCAD parameter-drag latency
- Issued: 2026-09-14T21:03:00Z
- By: Codex session
- Owns: `src/lib/ideacad/viewport/Viewport.svelte`, its tests, `docs/prompt-ledger/entries/0269-*`, `docs/history/viewport-drag-measure-0269.md`
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0215 (local tree)
- Status: pushed
- Branch: `codex/viewport-drag-measure-0269`
- Notes: Measurement found the generator, owned by ledger 0268, is the bottleneck. Per the prompt's stop condition, no viewport implementation was changed.

## Measurement and disposition

Ten parameter changes of the default blade, changing the second revolve-station radius by 0.001 in each sample, were timed around the lazy `evaluation.geometry.solid` read and then around `solidBuffers`. After the cold sample, mesh generation was 267 ms median and 380 ms p95 (257–380 ms); the viewport's CPU translation was 33.6 ms median and 70.7 ms p95. The cold pair was 626.5 ms and 83.7 ms.

The current evaluation effect calls `build` once for every evaluation it observes, and `build` creates fresh `BufferGeometry` objects. In the ten-change probe, generation happened 10 times and geometry was prepared for upload 10 times: one of each per delivered parameter change. This is not an animation-frame coalescing result; it records the existing path.

A GPU-upload duration and a fresh render p95 could not be measured in this container. The repository's pinned Chromium executable at `/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome` failed before launch because `libatk-1.0.so.0` is absent. The established render p95 remains 0.6 ms, but it is not claimed as a new reading.

The generator alone occupies 15–23 complete 60 Hz frame budgets per warm parameter change, before translation, upload, or rendering. It is therefore decisively the bottleneck. The prompt explicitly says that if this is the result, report the numbers and change nothing else because ledger 0268 is rewriting the generator. `Viewport.svelte` and its tests are consequently byte-identical to the starting tree; no speculative upload optimization was made.
