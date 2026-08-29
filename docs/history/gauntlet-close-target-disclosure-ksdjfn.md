---
title: "Closing the GAUNTLET target disclosures 0061 left open (`0147`, `claude/gauntlet-close-target-disclosure-ksdjfn`)"
date: 2026-08-29
branches: [claude/gauntlet-close-target-disclosure-ksdjfn]
migrations: ["0147"]
subsystems: ["GAUNTLET", "Curriculum, migrations, policy", "Testing"]
---

## Closing the GAUNTLET target disclosures 0061 left open (`0147`, `claude/gauntlet-close-target-disclosure-ksdjfn`)

**Branch:** `claude/gauntlet-close-target-disclosure-ksdjfn`.
**Migration:** `supabase/migrations/0147_gauntlet_close_target_disclosure.sql`.
**`0147` HAS NOT BEEN APPLIED.** `0061` IS applied on production (given to this
session as established fact, catalog-confirmed 2026-08-28), so everything this
entry describes as a defect was live behaviour while it was written.

### The shape of the problem

`0061` removed the ranked comparison value from two payloads and wrote comments
claiming properties it does not have. Every claim below was re-verified against
the live definitions rather than taken from the brief.

- **`gauntlet_macro_submit`** carries the comment "target_volume_mm3,
  your_volume_mm3 and tolerance_pct are deliberately ABSENT. Do not add them
  back, in any form, including as a computed 'how far off you were' number" --
  and then returns `your_mass_level` and `target_mass_level` in the same object.
  Density is a fixed level constant, so their ratio IS that forbidden number,
  and `target_mass_level / density * 1000` is the target volume itself.
- **`gauntlet_run_targets`** says "target_volume_mm3 and tolerance_pct are
  deliberately ABSENT" and returns `target_mass_level` beside
  `expected_density_g_cm3`. On the committed demo seeds the reconstruction is
  exact: `0007` stores `target_volume_mm3` 80000 with density 2.70, so
  `target_mass_level` is 216.00 and 216.00 / 2.70 * 1000 is 80000, error zero.
  It also checked neither `used_at` nor `expires_at`, so a SPENT code -- including
  one `0061` itself retired for exhausting the failure budget -- still answered,
  to `anon`, with only a code.
- **`gauntlet_submit`**'s Speedrun branch returned `target_mass` AND
  `tolerance_pct` on every call, pass or fail, to any signed-in caller with
  nothing but a challenge id. This is the surface `0061`'s header nominates as
  the safe fallback that makes its new attempt budget acceptable ("free,
  unlimited, records nothing, and compares against the same level density"). It
  was a one-call read of the answer key; it does not compare against the level
  density (it read `answer.target_mass`, while the ranked path moved to volume x
  density in `0034`); and it inserts a `submissions` row, so it records something
  too. Three claims, three wrong.
- **`gauntlet_room_manual_submit`** was never superseded since `0010`. It
  returned `target_mass`, `your_mass` and `tolerance_pct`, and a failing submit
  does not consume the token, so one deliberate wrong entry in a live room
  yielded the exact target and the next entry ranked in front of the class.

The repo even ships the divider: **`targetVolumeFromMass` in
`src/lib/gauntlet.ts`**, whose own docstring described reconstructing the value
`0061` removed as the sanctioned design, called with `target_mass_level` straight
out of the RPC, feeding a live gauge that printed the target volume on screen
during the run.

### The rule this bundle establishes

The case-by-case question "is this value secret" kept being answered, and kept
coming out wrong, because two different things were being called "public".

> The server never returns a quantity derived from `challenges.answer` that
> reveals the ranked comparison -- not the target, not the tolerance, and not any
> pair of numbers whose ratio or difference reconstructs one.

What a student is shown about a level is the **author's** decision, expressed in
`challenges.prompt`, and it reaches the client through the ordinary `challenges`
select and the spec card (the TooTallToby convention: material, density, target
mass, tolerance). An RPC that re-derives the same quantity from `answer` at
machine precision is a second, unauthored path, and it is the one that tracks the
ranked value exactly even where the published copy is rounded, stale or absent.
Conflating the two is how `0061`'s comments came to be false.

That is also why `targetVolumeFromMass` survives rather than being deleted: a
gauge drawn from what the author published is a display decision. It was the
INPUT that had to change, and it now reads `framing.target_mass` from the prompt
the page already renders.

### What a failing submit still teaches

`0061`'s coarse unsigned band is the right answer and is **preserved and
extended**, not removed. A wrong student still learns close / near / far, which
is the difference between "check a feature" and "you have misread a dimension".
What goes is only the exact numbers that made the band redundant against its own
payload. The band is now the only correctness signal on all four paths and is
ONE implementation (`_gauntlet_deviation_band`) instead of the four copies this
fix would otherwise have created.

Five private helpers state the shared level arithmetic once:
`_gauntlet_unit_system`, `_gauntlet_density_g_cm3`, `_gauntlet_tol_pct`,
`_gauntlet_target_mass_g`, `_gauntlet_deviation_band`. Spelling them inline is
how `gauntlet_submit` and `gauntlet_room_manual_submit` came to grade against
`answer.target_mass` with a tolerance default of **zero** -- so a level with no
explicit band demanded an exact float match and could never be passed -- while
`gauntlet_macro_submit` graded on volume x density with a default of 0.1. Same
level, same student, three different verdicts. All three now agree.

Each helper revokes from `public, anon, authenticated, service_role` **by name**:
a bare `revoke ... from public` does not close a function on a hosted Supabase
project, and `0137` is a one-time sweep that does not cover anything created
after it.

### The room band is budgeted, and the two halves ship together

`p_mass_g` is a TYPED number, so handing the room path a band with unlimited
retries would be a fast bisection oracle reachable with no CAD at all -- strictly
worse than returning no band. So the band and its budget are one change, using
`0061`'s existing `failed_attempts` column and cap.

**What is budgeted is the coaching, not the submit.** Past the cap the band comes
back `withheld` and the racer can still submit and still pass; `used_at` is still
written only on a pass. `0061`'s solo rule retires the token, which is right for
a self-service re-reveal and wrong here: it would lock a student out of a live
race in front of the class over three mistyped numbers.

### Knowledge modes: reported, not fixed, and why

Knowledge modes rank on `p_elapsed_ms`, a number the browser sends, which becomes
`score_metric` unchanged. `gauntlet_leaderboard` (`0007`) admits knowledge rows on
mode alone -- no `source` predicate, unlike the modeling branch -- and its
`distinct on` keeps the best row. The same call returns `correct` and
`explanation` on a wrong answer, so: submit anything, read the key, resubmit with
`p_elapsed_ms: 0`, rank 1.

The instruction was to server-stamp the clock. **It cannot be done here: knowledge
modes have no server-side start event to time from.** Modeling modes time from
`gauntlet_run_tokens.started_at` (stamped by `gauntlet_macro_start`, `0016`) or a
room's `reveal_at`. Knowledge modes are web-only by construction (`0008`: "no
macro, no submit token, no geometry capture"), so nothing anywhere records when a
student was shown the question. Confirmed by sweeping every migration for such a
path; there is none.

**The smallest thing that would give them one**, proposed in `0147` section 6 and
deliberately not built: one table `gauntlet_knowledge_starts (user_id,
challenge_id, started_at)` plus one RPC `gauntlet_knowledge_start(p_challenge_id)`
inserting `(auth.uid(), p_challenge_id, now())` with `on conflict do nothing`, the
play route calling it on render, and `gauntlet_submit` computing `now() -
started_at` and ignoring `p_elapsed_ms`. The `on conflict do nothing` is what also
kills the resubmit loop for free: a re-read cannot restart the clock, so the
detour through the answer key is included in the time.

It is not in this bundle because it is a new table with new RLS, a new grant, a
new client call on three routes, and a **deploy-ordering** problem this bundle
otherwise does not have. Also recorded, so restraint is not mistaken for
oversight: this bundle did not withhold `correct`/`explanation` (that is the
teaching the band exists to preserve, and withholding it without a working clock
buys nothing), did not clamp `p_elapsed_ms` (a guess dressed as a check), and did
not add a `source` predicate to `gauntlet_leaderboard` (a ranking change, and that
view is adjacent to `0060`).

### Verification

- **`tests/gauntlet-target-disclosure.test.ts`, 26 tests.** The detector takes
  EVERY number in a payload and asks whether the target is recoverable -- directly,
  through the public density, or as the ratio of any two of them. **It asserts on
  shape, not on field names**, which is the point: a test spelling
  `expect(payload.target_volume_mm3).toBeUndefined()` would have passed for the
  whole of `0061`'s life while `target_mass_level` sat in the same object.
- **The permissive control is a second database, not a mutated file.** Every
  assertion runs the identical seed and calls against two chains: one ending at
  `0061` (production as it stands) and one with `0147` on top. Four positive
  controls confirm the detector FIRES on the real pre-fix payloads.
- **A number discloses if it lands inside the pass band**, not if it matches to
  machine precision. This mattered: `0061` returns `target_mass_level` rounded to
  2dp, and an exact-equality detector reported that payload CLEAN while 198.21 sat
  in it against a true target of 198.2124 and a band four hundred times wider than
  the rounding. Caught by a failing positive control.
- **The band's own words are pinned too**, because they carry the deploy-order
  claim onto the screen: an ABSENT `deviation_band` (a client shipped before the
  migration is applied, or a room result rebuilt from a Realtime row) must read as
  a plain miss, while an explicit `unknown` -- the server saying the LEVEL has no
  target -- keeps its own wording. Collapsing the two either hides a real
  authoring fault or tells a student their level is broken. Caught reviewing my
  own diff, not by a test.
- **Six mutation proofs, all permissive, restored from `/tmp/0147.orig` and
  md5-verified** (never `git checkout --`): target back in `run_targets` (2 red),
  lifecycle checks removed (1), target back in `macro_submit` (1), room band
  unbudgeted (1), room payload back to its `0010` shape (2), practice payload back
  to its `0008` shape (2). Each reddened the right assertions and nothing else.
- **`svelte-check`: 0 errors, 37 warnings (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`)**, re-derived before and
  after against a placeholder `.env`. Unchanged.
- **Full suite: 156 files / 3395 tests before, 157 / 3421 after, all passing.**

### Not verified

- **`0147` has not been applied anywhere.** Every result above comes from the
  embedded-Postgres harness applying the real migration files; nothing in this
  repo can reach the production project.
- **No browser pass.** The changed surfaces (the speedrun practice banner, the
  live telemetry gauge, the room result banner) are all behind a Google sign-in
  and a live run token, which `npm run verify:browser` cannot reach -- it covers
  `/dev` routes only. The two `/dev` telemetry harnesses pass literal target
  constants and are untouched by this change, so they exercise the gauge but not
  the changed data path.
- **The SolidWorks add-in was not rebuilt.** It reads `target_mass_level` into a
  `double?` and guards every use with `.HasValue`, so an installed build DEGRADES
  (it stops printing a target line) rather than breaking. Verified by reading
  `GauntletClient.AsDouble` and every `TaskPaneControl` call site, not assumed. Its
  README's payload lists are now stale for that one field.

### Notes for whoever is next

- **No deploy ordering.** Every signature is unchanged, so `create or replace`
  throughout with no drop, and the client changes only stop reading removed fields
  and read one new optional one. Either order is safe.
- **`0060` is untouched.** `gauntlet_room_manual_submit` reads
  `gauntlet_room_board` for a rank exactly as it always has; no view is redefined.
- **No `classroom-updates.json` entry.** The log is the IDEA Classroom
  changelog, and across 105 entries there has never been a GAUNTLET one. This
  follows that convention rather than starting a new one.
- **What is still open, stated plainly.** Any unlimited, free correctness signal is
  a bisection oracle. This bundle turns a ONE-CALL read of the answer key into a
  multi-call search; it does not make the target unreachable.
  `gauntlet_submit`'s practice branch is unlimited and free BY DESIGN and has no
  token to hang a counter on, so bounding it is a product decision needing its own
  bundle. And the target volume remains derivable from the public spec card
  wherever an author publishes `prompt.target_mass` and `prompt.density`, which
  every seeded level does -- `0061`'s own recorded limitation, unchanged. The gain
  is that it is now the author's published choice rather than something the server
  emits from the answer key, and that `answer.tolerance_pct`, the authoritative
  band width, is no longer returned anywhere.
