---
title: "The Speedrun leaderboard stops trusting a column that publishes the answer (0153)"
date: 2026-08-29
branches: [claude/gauntlet-unpublish-answer-3ov4ju]
migrations: ["0153"]
subsystems: ["GAUNTLET", "Testing"]
---

Mr. Pina's decision: the leaderboard cannot be trust-based. This bundle closes
the half of that which was never a search at all -- the ranked answer being
handed over on request -- and says plainly which half is still open.

### The premise, verified from the code rather than taken on

The brief cited `docs/history/speedrun-leaderboard-audit-vwyl49.md`. **That file
does not exist**; the nearest entry is
`docs/history/speedrun-deviation-band-measure-hoqxzz.md`, which measures the
SEARCH and explicitly leaves "whether production challenges publish
`prompt.target_mass`" as a thing it could not count. So the premise was checked
against the source instead, and every clause of it holds:

- `buildPayload` (`src/lib/gauntlet/authoring.ts`) wrote `density`,
  `target_mass` and `tolerance_pct` into **both** `prompt` and `answer`, with a
  comment calling the first three "display copies".
- `0004` grants `select (id, mode, title, difficulty, asset_ref, prompt,
  author_id, published, created_at, updated_at)` on `challenges` to
  `authenticated`, under `using (published or is_teacher())`.
- The shipped client already did the reconstruction:
  `targetVolumeFromMass(framing.target_mass, density, unit_system)` at
  `src/routes/gauntlet/speedrun/[id]/+page.svelte:437` is
  `gauntlet_macro_submit`'s own comparison value, rebuilt in the browser.
- The list page was worse than the detail page: `+page.svelte:87` printed
  `target {formatMass(c.targetMass, c.massUnit)}` on **every card in the list**.

So no search was needed against a level authored through the form. One ordinary
PostgREST read returned the target, the density that converts it to the ranked
volume, and the width of the pass band. `0061` and `0147` each recorded this in
their own headers and neither closed it.

### What shipped

**1. The form stops publishing it.** `buildPayload`'s `prompt` literal no longer
carries the three keys, for every modeling mode. They stay in `answer`, which has
no client grant, and the author still sees what they typed because
`gauntlet_author_get` hands a teacher the whole row.

**2. The two Speedrun `challenges` selects project named fields.** The list asks
for `prompt->>material, prompt->>mass_unit, prompt->>model_path, prompt->demo`;
the detail adds `unit_system`, `note`, `tutorial_video_id`, `par_time`,
`par_feature_count`. Both rebuild their framing object from the projection rather
than reading it off the column.

**THE PROJECTION IS NOT THE BOUNDARY AND IS DOCUMENTED AS NOT BEING ONE.** The
column grant means a student reaches the whole `prompt` through PostgREST without
going near a loader. What closes the leak is that the keys are no longer written
and no longer stored; naming the fields is what stops the NEXT key leaking by
default. Anyone reading the loader change as the fix has misread it.

**3. `0153` strips the rows already stored,** with a behavioural refusal in front
of it (below), and reports its counts at apply time.

**4. The gauge was replaced, not deleted.** See its own section.

### What the spec card legitimately keeps

Established by asking what a student needs in order to MODEL, and checked against
what each field is: the **material** (which SolidWorks library material to
assign -- 0026 makes it the thing they must match, and the density follows from
it), the **unit system** and the three unit labels, the **par time**, the
shape-only **STL preview**, the author's **note**, the optional **walkthrough**,
the **slug** and the **demo** flag. `density_unit` outlives the density it
labelled because it is one third of the unit convention rather than a copy of a
value. The card now says, in words, `Target -- Not published, check your mass
during the run`, because a row that is simply absent reads as a broken level.

### The gauge, and the design I did NOT ship

The brief asked for the gauge to be routed through `0151`'s metered practice
check, with the two-second floor as its cadence, and asked me to say so rather
than work around it if that turned out not to hold. **It does not hold, for a
reason other than granularity, and this is the one finding worth carrying
forward.**

An automatic checker and the student's own Check button **share one meter**.
`0151` keys its floor on `(user, challenge)` over `submissions` where
`mode = 'speedrun' and source = 'manual' and room_id is null`, which is exactly
what an automatic gauge poll would write. So a page polling on the student's
behalf would get the student's own deliberate press refused with "You just
checked this part a moment ago" -- the gauge breaking the control it exists to
support. Two further costs pointed the same way: a poll at the floor writes
hundreds of `submissions` rows per run, and every one of them is a gap at or
below `floor_gap`, which is precisely the `longest_burst` signature
`gauntlet_practice_pressure` was shipped one bundle ago to detect. An honest
student would have out-burst any attacker, and the detector would have become
noise.

**So the gauge is driven by the check the student already makes.** `LiveTelemetry`
takes `band`, `bandAtMs` and `nowMs` as props; the play page sets them from the
practice result it already receives. One control, one meter, one path, no second
number that can drift out of step with `_gauntlet_practice_min_interval()`.

- **The bar is `deviationBandFill`, four discrete steps, derived from the band
  alone** -- 15 / 45 / 75 / 100, with `unknown`, `withheld` and absent all
  drawing nothing. It is the label redrawn, not a second channel: the moment it
  is computed from a quantity it becomes a numeric readout of the deviation.
- **The two gauges that named a target are gone.** "Volume vs target" and
  "Mass (level density) / target" are now "Last check" (the server's verdict) and
  "Your part" (the student's own measured volume and the mass it implies). Their
  own numbers are not a disclosure -- they can read both off Mass Properties.
- **`targetVolumeFromMass` is DELETED.** Its only caller was the gauge, and with
  no published target mass there is no honest input left. A helper whose
  docstring is a recipe for reconstructing the ranked answer is the next person's
  foothold; `tests/gauntlet-framing-projection.test.ts` sweeps the tree for the
  name.
- **`TelemetryTargets` lost `targetVolumeMm3` and `targetMassLevel`,** because a
  field that can only be filled by reconstructing the answer should not exist.
  `densityGcm3` stays: it converts the student's own volume to their own mass,
  arrives from `gauntlet_run_targets` behind a live run code, and discloses the
  target only when multiplied by a target the client no longer has.

### 0153, and why its refusal is behavioural

One of the three keys is still read from `prompt` by live SQL:
`_gauntlet_density_g_cm3` (0147, and 0034/0061 inline) and `gauntlet_run_targets`
both `coalesce(answer->>'density', prompt->>'density')`. On a row whose `answer`
carries no density, stripping the prompt does not hide a number, it removes the
grading basis -- silently, because `->>` on a missing key is NULL and a NULL
target grades every submit as wrong.

The expected count of such rows is zero (`gauntlet_publish_blocker` has required
`answer.density` and `answer.target_mass` since 0034; every 0005/0007 seed carries
both). **Expected is not measured.** So 0153 puts the real deployed helpers to
each row's current jsonb and to the jsonb it would leave behind, compares the two
answers, and RAISES with the row titles if any row changes. A second hand-written
idea of "where does the density come from" is the copy that stops matching the
one the grader uses.

It strips **drafts and archived rows too**, which is wider than the brief asked
and is deliberate: publishing a draft does not rewrite its prompt, so leaving them
re-opens the leak the next time somebody presses Publish. Published and
unpublished counts are reported separately.

**It does not invalidate a single ranked run, and the header says so in those
words** because somebody will ask. Every ranked run was graded by
`gauntlet_macro_submit` against `answer`, which this file never names on either
side of an assignment. Nothing re-grades, re-ranks or touches a `score_metric`.
What the old framing meant -- that a student could have passed by reading the
target -- is exactly as true of the runs already recorded as it was before, and
stripping a column cannot reach backwards.

### What this does NOT close

`speedrun-deviation-band-measure-hoqxzz` measured that the target is ALSO
recoverable by searching a free pass/fail oracle: 12 probes against a student who
has nearly modelled the part, 163 from a standing start, 0 reveals. That search
still exists and `0151` slowed it rather than stopping it. This bundle removes the
case where there is nothing to search. **Speedrun is not now trustworthy**; the
containment that bundle measured to work is a person's decision about
`gauntlet_leaderboard`'s allowlist, and 0146 wrote that allowlist so a person
makes it.

### Files touched outside the brief's ownership list, and why

- **`src/lib/gauntlet/LiveTelemetry.svelte`** -- it IS the gauge. "The gauge must
  survive" cannot be done without it.
- **`src/lib/gauntlet/PostRunAnalysis.svelte`** -- its volume chart drew a dashed
  reference line at `targets.targetVolumeMm3`. Post-run is exactly when reading
  the target off costs nothing, because the level can be started again. The line
  and its now-unused `.pra-svg .target` rule are gone (the rule would otherwise
  have moved `css_unused_selector` from 5 to 6).
- **`src/routes/dev/run-telemetry/+page.svelte`** and
  **`src/routes/dev/run-analysis/+page.svelte`** -- harnesses for the two above. The
  telemetry harness gained a band PICKER rather than a target constant, because
  the band is a value the server answers and a harness that derived one from its
  own fixture would be verifying a page that does not exist.
- **`tests/gauntlet-payload-sql-contract.test.ts`**, **`gauntlet-authoring-tolerance.test.ts`**,
  **`gauntlet-post-run-analysis-wiring.test.ts`**, **`gauntlet-class-stat-floor.test.ts`** --
  see below.
- **`src/lib/gauntlet/ChallengeForm.svelte` was NOT touched.** It binds to the
  form state, which is unchanged; only where `buildPayload` puts the values moved.

### Two existing assertions were generalized rather than deleted

- **`gauntlet-authoring-tolerance.test.ts` asserted its own opposite:**
  `expect(prompt.tolerance_pct).toBe(answer.tolerance_pct)`, on the reasoning
  that the two must agree "or the page describes a band it is not graded on". The
  reasoning was sound; the premise was not -- the page had no business describing
  the band. It now asserts `prompt` has no `tolerance_pct`, with a control that
  `prompt` is still a non-empty object.
- **`gauntlet-payload-sql-contract.test.ts`'s "every prompt key the SQL reads is
  emittable" failed on `density`,** which is now emitted only into `answer`. The
  fix is a second pinned list, `LEGACY_PROMPT_FALLBACKS`, with the reason and a
  test that each entry is genuinely emittable into `answer` and is NOT emitted
  into `prompt` -- so the list cannot be used to wave through a field moving the
  wrong way. Its `emit.prompt.size` floor moved 8 -> 5 with the three keys.

### Verification

- **`svelte-check`: 0 errors, 37 warnings** (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`), re-derived after
  `npx svelte-kit sync` with placeholder `PUBLIC_SUPABASE_*` exported. Unchanged.
- **Full suite before: 171 files / 3663 tests passing**, measured on a pristine
  `origin/integration` worktree. **After: 173 files / 3700 tests passing.**
- **Mutation proof, six mutations, every one bit.** Files were copied first and
  restored FROM THE COPIES with `md5sum -c` after each, never `git checkout --`:
  0153 stripping nothing (4 failed), the list loader taking the whole `prompt`
  column (1), a loader projecting `prompt->>target_mass` (2), `deviationBandFill`
  returning a constant (1), `buildPayload` dropping `density` from `answer` (2),
  and `buildPayload` putting `target_mass` back into `prompt` (3). All four files
  md5-identical afterwards.
- **The migration was applied over SEEDED PRE-MIGRATION DATA**, not asserted
  against a chain that always had it: the chain boots at 0151, rows are seeded in
  the shape production holds, the BEFORE facts are captured through the real
  client-role read and the real grading RPC, then the file is applied. Positive
  controls assert the pre-migration world really did hand over the target and
  that the three reconstruct the ranked volume to within 1e-12.
- **A fresh authored challenge still publishes**, driven through the real
  `gauntlet_author_upsert` with the real `buildPayload` output, for `speedrun` and
  `feature_golf`, with three positive controls confirming
  `gauntlet_publish_blocker` still refuses when `answer.density`,
  `answer.target_mass` or `answer.tolerance_pct` is removed. This is the trap a
  previous tolerance fix walked into.
- **Browser pass, real Chromium 141.0.7390.37, at 375px and 1440px**, driving
  `/dev/run-telemetry` with transitions frozen and every click retried against its
  own effect rather than a timer. The closeness bar measured **0 / 15 / 45 / 75 /
  100 %** of its track across `not checked / far / near / close / pass`, with
  verdicts `Not checked / Well outside / Outside tolerance / Very close / In
  tolerance`. The student's own figures rendered live during the replay
  (`8000 mm3`, `21.6 g` -- 8 cm3 x 2.7 g/cm3). The word "target" appears nowhere
  in the panel at either width. No horizontal scroll (375/375, 1440/1440). Tap
  targets 46x44 to 94x44. **0 console errors.**
- **Contrast measured by canvas readback** (these are `var()` values a regex over
  computed styles skips): fill against its track **5.16 / 5.16 / 5.03 / 11.65**
  for far/near/close/pass, all clearing the 3:1 a boundary carries; verdict word
  against the panel **5.93 / 5.93 / 17.4 / 13.38**, all clearing 4.5:1.
- **`far` was crimson and is now amber.** GAUNTLET reserves `--crimson` for
  live/rec/error and a miss is a grading outcome, not an error --
  `.gauntlet .result-banner.no` already spells the same verdict amber two panels
  down. `near` and `far` therefore share a hue and are separated by the bar's
  LENGTH and by the word, which satisfies "colour is never the only signal" more
  strictly than a second warning hue would.

### Not verified

- **`0153` HAS NOT BEEN APPLIED ANYWHERE.** Nothing in this repo can reach the
  live project. The counts it prints are the counts it will print; the counts
  measured here are from the embedded-Postgres fixture.
- **How many production challenges actually carry these keys.** The seeds do, and
  every challenge authored through the form since 0009 does, but the real number
  comes out of the `raise notice` at apply time. That is why the file prints it.
- **The signed-in Speedrun page itself.** `/gauntlet/speedrun/[id]` needs a Bosco
  Tech Google session; no `/dev` route mounts it. `/dev/run-telemetry` mounts the
  real `LiveTelemetry`, which is the component that changed, and that is what was
  driven. The spec card and the practice wiring on the play page were verified by
  `svelte-check` and by reading, not in a browser.
- **The room surfaces lose three spec-card rows and were not repaired here.**
  `src/routes/gauntlet/rooms/[id]/+page.svelte` (lines 246-251, 418) and
  `src/lib/gauntlet/ModelingRun.svelte` (74-77, 224-233) render `Density`,
  `Target mass` and `Tolerance` off `framing`, so after 0153 they render `--`.
  They degrade rather than break. **On Reverse Engineer and Feature Golf this is
  a correction** -- the target mass is the answer there too and showing it defeats
  the mode. **On a room it is the same disclosure one surface over**, and a room
  is Speedrun: there is one `prompt` column and no way to strip it for the board
  and keep it for the room. A follow-up owns replacing those rows the way the solo
  page's were replaced; a room has a human witness, so what it may show is a
  different decision and not mine to make here.
- **`src/routes/gauntlet/reverse-engineer/+page.server.ts:45` maps
  `framing.target_mass`**, which is now always null. Same follow-up.
- **No classroom update-log entry.** Nothing under `/classroom` changed;
  GAUNTLET is not a classroom-facing surface.

### For whoever is next

- **The room and Reverse Engineer spec cards are the loose end**, named above with
  line numbers.
- **`_gauntlet_density_g_cm3`'s `prompt` fallback is now dead for every stripped
  row** and is kept only for a deployment sitting between the deploy and the
  hand-applied migration. Removing it is a migration of its own and needs its own
  count of rows that would change answer.
- **Do not reintroduce `targetVolumeFromMass`, under any name.**
  `tests/gauntlet-framing-projection.test.ts` sweeps `src/` for it and allows the
  name only inside a comment.
- **The open half is the search**, not the disclosure. Read
  `speedrun-deviation-band-measure-hoqxzz` before proposing another meter.
