---
title: "Two surfaces 0153 missed: the room page and ModelingRun still printed the target"
date: 2026-08-29
branches: [claude/strip-target-density-tolerance-c7xtlh]
migrations: []
subsystems: ["GAUNTLET", "Testing"]
---

`e8b352f` ("GAUNTLET: stop publishing a Speedrun level's target, density and
pass band", `docs/history/gauntlet-unpublish-answer-3ov4ju.md`) closed the
`authoring.ts` write path and the two solo Speedrun loaders, but never touched
`src/routes/gauntlet/rooms/[id]/+page.svelte` or
`src/lib/gauntlet/ModelingRun.svelte`. Both still read `framing.density`,
`framing.target_mass` and `framing.tolerance_pct` straight off the published
`prompt` and printed Density / Target mass / Tolerance on their spec cards.
This bundle closes both, per the standing instruction: strip on both surfaces,
replace rather than blank.

### Why the room surface is not exempt

A room has a human witness (the host), which is why this looked defensible
longer than it should have. It is not: a room run carries `source = 'macro'`,
and a supervised manual entry through `gauntlet_room_manual_submit` ranks too,
on the SAME global `gauntlet_leaderboard` a solo run does. The host watches the
room, not the leaderboard -- nothing about a host being present stops a racer
from reading the target mass off their own screen and modeling straight to it,
which is exactly the search 0061/0147/0153 spent three bundles closing on the
solo surface. There is no different answer for the room.

### What changed

**`src/routes/gauntlet/rooms/[id]/+page.svelte`**

- Removed the `band` computed straight from `framing.target_mass` /
  `framing.tolerance_pct` (used only to print the band's two edges next to the
  Tolerance field).
- The racer's spec card (`specCard` snippet) no longer shows Density or Target
  mass; Tolerance is gone entirely. In their place: `Mass in <unit>` and
  `Target: Not published — check your mass during the run` -- the identical
  wording the solo Speedrun page already uses for the same case.
- The host's lobby summary card dropped its own `Target mass` field (it kept
  Challenge and Material).
- **Replaced rather than blanked, per the standing instruction.** The result
  banner (rendered after a manual submit, which is the ONLY room path that
  answers a band today -- the macro/Realtime path sets `band: null`) now draws
  a four-step closeness bar straight off `myResult.band`, reusing
  `deviationBandFill` -- the identical shape `LiveTelemetry.svelte` draws for a
  solo run, expressed as two new, narrowly-scoped CSS classes (`.band-bar`,
  `.band-fill`) in a local `<style>` block, since this route has no shared
  stylesheet entry of its own and app.css is out of scope for this bundle. It
  also prints the racer's own typed mass (`myResult.your_mass`, straight off
  `gauntlet_room_manual_submit`'s existing `your_mass` field, already granted
  and already disclosing nothing per 0147's own comment) as "You measured X g"
  -- never paired with a target, exactly as the solo practice check does.
- `myResult`'s type gained `your_mass: number | null`; the Realtime INSERT
  handler (macro path) sets it `null`, since a macro submission carries no
  typed mass to report.

**`src/lib/gauntlet/ModelingRun.svelte`** (the shared Reverse Engineer /
Feature Golf play screen)

- Removed the same `band` computed from `framing.target_mass` /
  `framing.tolerance_pct`.
- The spec card's Density / Target mass / Tolerance fields are replaced with
  `Mass in <unit>` and `Target: Not published`. Unlike the room and the solo
  Speedrun page, this component has **no band at all**: neither Reverse
  Engineer nor Feature Golf has a manual-check RPC, so there is nothing to
  draw a fill from. "Not published" is the honest answer here too, per the
  standing instruction ("say `Not published`... rather than leaving `--`,
  because a dash reads as a bug") -- it is not paired with a bar because there
  is no server verdict to draw one from.
- Dropped the now-unused `formatMass` import.

Neither file's loader (`rooms/[id]/+page.server.ts`,
`reverse-engineer/[id]/+page.server.ts`, `feature-golf/[id]/+page.server.ts`)
was touched -- out of scope for this bundle (rooms' own loader still selects
`prompt` whole; the solo Speedrun loaders' named-field projection from 0153
was not extended here). What changed is the RENDER layer, deliberately: the
mutation proof below drives both components against a **legacy-shaped**
`framing` object (still carrying `density` / `target_mass` / `tolerance_pct`,
exactly what a pre-0153 row, or a deployment sitting between the push and the
hand-applied migration, still holds) and proves neither renders any of it.

### What must not break, checked

`gauntlet_room_manual_submit` (0147, `supabase/migrations/0147_gauntlet_close_target_disclosure.sql:911-919`)
still returns `deviation_band` unconditionally on every call, alongside
`your_mass`. So the room's manual submit path has a band to draw from on every
answer, pass or fail; the four-step fill is never rendered as an empty
placeholder.

### Verified

- **`svelte-check`: 0 errors / 37 warnings, 31 `state_referenced_locally` / 5
  `css_unused_selector` / 1 `perf_avoid_nested_class`** -- unchanged, before
  and after, re-derived with `svelte-kit sync` first against a checkout with a
  placeholder `.env` (this session's own, gitignored, not committed).
- **Two new DOM mount test files**, both against the real components:
  - `tests/dom/gauntlet-room-target-disclosure.test.ts` -- a racer's spec card
    and the host's lobby card leak nothing from a legacy-shaped `framing`, the
    band-driven fill + "You measured" line render correctly for both a fail
    (`near`, 45% fill) and a pass (`pass`, 100% fill) after driving
    `submitManual`'s real click handler and RPC call, and a positive control
    confirms the fixture actually carries the answer it must not leak.
  - `tests/dom/gauntlet-modeling-run-target-disclosure.test.ts` -- the same
    exclusion at the framing screen and after Start reveals the code, plus the
    fixture's own positive control.
- **Mutation-proved, both files**, per the standing instruction: reintroduced
  the exact removed markup (Density / Target mass / Tolerance fields) in each
  component, confirmed the corresponding tests redden (3 of 3 in the room
  suite, 2 of 3 in the ModelingRun suite -- the third only asserts the
  positive-control fixture shape, which the markup mutation cannot touch),
  then restored each file from an in-memory copy and confirmed the restored
  file is **md5-identical** to the pre-mutation version (never `git checkout
  --`, per the standing warning about that command discarding uncommitted
  work).
- **The existing `tests/dom/gauntlet-modeling-run-mount.test.ts` suite (9
  tests) still passes unchanged** against the edited `ModelingRun.svelte`.
- **Full `npm test` run before and after**: see the counts below.

### Not verified

- **No dev route reaches either page.** `/gauntlet/rooms/[id]` needs a real
  room row (host, participants, RLS) and `/gauntlet/reverse-engineer/[id]` /
  `/gauntlet/feature-golf/[id]` need a real challenge row; neither has a
  `/dev`-guarded harness. This is stated plainly rather than claimed: both
  surfaces were driven only through the DOM mount tests above, which mount the
  real component with a scripted Supabase client, not through a browser.
- The live Supabase project, a real Drive round trip, a signed-in session,
  and any screenshot -- none of this bundle touches those paths, so none was
  exercised.
