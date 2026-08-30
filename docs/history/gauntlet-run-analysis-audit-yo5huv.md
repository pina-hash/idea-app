---
title: "Three built-and-disconnected GAUNTLET features, wired (`claude/gauntlet-run-analysis-audit-yo5huv`, migration 0150)"
date: 2026-08-29
branches: [claude/gauntlet-run-analysis-audit-yo5huv]
migrations: ["0150"]
subsystems: ["GAUNTLET", "Telemetry", "Disclosure", "Accessibility"]
---

An audit reported three things in GAUNTLET that were built and not connected,
plus one contrast failure measured by an earlier session. All four were put to
the code before anything was changed; all four held, and one of them held for a
reason different from the one the audit assumed.

### 1. `gauntlet_run_analysis` is written by the add-in and read by nothing

CONFIRMED. `grep` across `src/`, `tests/`, `static/` and `tools/` finds the
table named in exactly two places outside its own migration: the C# add-in's
`GauntletClient.PostAnalysisAsync`, and prose in `docs/`. Nothing in `src/`
reads it. `PostRunAnalysis.svelte` derives everything from `gauntlet_run_events`.

**It is NOT a duplicate of derivable data, and the two fields that make it not
one are the two that matter most.** Reading the deployed add-in's
`TelemetryRecorder.Stop()` against the event emitters beside it:

| summary column | also an event? | verdict |
| --- | --- | --- |
| `undo_count`, `redo_count` | `undo` / `redo` are emitted | derivable |
| `integrity.file_created_utc` | `integrity` event carries the same string | derivable |
| `final_volume_mm3`, `feature_count` | last `snapshot` payload | derivable |
| `rebuild_ms`, `error_count`, `warning_count` | -- | **written as hard-coded `0`**; carry nothing |
| `stuck_point` | -- | **never written at all** by the deployed build |
| `computed_mass`, `mass_unit` | **no** | **only here** |
| `active_ms`, `idle_ms` | **no** | **only here** |

`computed_mass` comes from `SubmitResult.YourMassLevel` -- SolidWorks' own mass
evaluation of the part the student actually built, with the material actually
assigned to it. The component instead computes `volume x the LEVEL'S EXPECTED
density`, which **by construction cannot disagree with the target**. So the
figure on screen was silently right in exactly the case the student got the
material wrong, which is a graded failure mode. The two numbers mean different
things, so the label now moves with the source: "Measured mass" when the
summary landed, "Est. mass" when it did not. A measured value wearing the
estimate's label would read as agreement with the target precisely where they
disagree.

`active_ms` / `idle_ms` are accrued inside the add-in at its refresh tick with a
4s idle threshold. `PostRunAnalysis` re-derived them from gaps BETWEEN EVENTS at
8s -- and events are only emitted when the geometry changed, so the estimate
cannot see the ticks that produced no event. Two different numbers under one
label. The summary is preferred where present and the tile says `(est.)` where
it is not. A PARTIAL summary (one of the pair) is ignored rather than mixed, or
a measured active time renders beside a zero idle nobody measured.

The three hard-coded zeros and `stuck_point` are **documented as inert rather
than read**: they are columns a deployed add-in fills with placeholders, and a
future session wiring `error_count` from this table would get zeros that look
like measurements. The note lives on the component's `analysis` prop and in
0150's header, which is where somebody would be standing when they reach for it.

**The add-in genuinely cannot be updated**, which is what makes "stop writing
it" unavailable. Verified: `AddinUpdate.ManifestUrl` is `""` and `CheckAsync()`
returns `null` on its first line, so a deployed copy cannot learn it is stale.
(Setting that constant is a one-line change in a file this session did not own.)

### 2. `selfHistory` and `classStats` were passed only by a dev route

CONFIRMED: the shipping mount passed `events` and `targets`; only
`src/routes/dev/run-analysis` passed all four.

`selfHistory` comes from `gauntlet_speedrun_attempt_history` (0033) in the
route's server load, **with an explicit `user_id` filter**. That is the
documented attribution exception, not defensive belt-and-braces: `read own
attempts` is `user_id = auth.uid() or public.is_teacher()`, so without the
filter an admin's own results screen would show the whole class's runs as their
personal learning curve.

`classStats` is the one that needed a decision. **A class median is other
students' work, and it cannot be computed in a browser even in principle** --
every table behind it is RLS-scoped to the caller's own rows, so widening that
RLS to make a client-side median possible would hand every student every other
student's individual runs in order to show them one number. So it is a definer
RPC, `gauntlet_class_run_stats`, and the disclosure rule is the whole of it.

**THE FLOOR IS FIVE DISTINCT PEER STUDENTS**, and four properties make it mean
what it says:

- **Distinct students, never runs.** One student with five attempts is one
  person. Every population is collapsed to one value per student (their best on
  that axis) before it is counted or measured.
- **Peers, never the population.** The caller is excluded from the count AND the
  median. Otherwise a floor of five is met by four classmates plus you, and "vs
  class median" against a set containing your own run is not the claim the label
  makes.
- **Per statistic, never once.** The three medians run over three different
  populations (attempts, analysis rows, event streams), so each carries its OWN
  peer count and is nulled on its own. A single global count is how a median
  over two people rides out on a count established by a different median over
  thirty.
- **Below the floor is null, not an error** -- the same answer an unknown
  challenge id gives, so nothing can be probed by reading a refusal.

Five rather than three because three is a named person and five is a group;
lower than that and a student in a class of six can subtract themselves from the
set. Peer COUNTS are returned and rendered ("11 classmates") because a median
with no n is a number a student cannot weigh, and a count that is by
construction >= 5 names nobody. No user id, email, run id, rank or per-run row
is returned, and a test pins the exact key set so a field cannot be added
unnoticed.

The component gained `hasClassStats`: a non-null `classStats` whose every median
came back null is still "no class comparison", because an empty list under a
heading reads as a broken panel rather than a withheld one.

**The dwell median is a deliberate second statement of the component's "longest
dwell"**, which this repo normally refuses. It is here because the per-student
half cannot run anywhere else, and it is pinned by a test that puts the same
stream through both.

### 3. `gauntlet_log_speedrun_attempt` has zero callers

CONFIRMED across `src/`, `tests/`, `static/`, `tools/` and every migration: the
only occurrences are its own definition in 0033 and one line of prose in
`docs/history/`. Both outcomes it existed to write now arrive without it
(`gauntlet_attempt_from_token` logs the start, `gauntlet_attempt_from_submission`
reconciles the finish), and the third, `abandoned`, is DERIVED at read time by
`gauntlet_speedrun_attempt_history` from an expired token -- which is why no
client ever needed to post it. What was left was a definer function granted to
`authenticated` letting any signed-in caller write an arbitrary `result` and
`elapsed_ms` into their own attempt history. **Dropped in 0150.**

### 4. The STANDBY contrast failure

RE-MEASURED rather than taken, in a real Chromium, inside `.gt-root`, by
compositing onto the ground `.sr-clock` actually paints and reading the pixel
back. Every figure the earlier session reported reproduced exactly:

| label | colour | ratio on `--bg2` (#0e161b) |
| --- | --- | --- |
| `REC . RANKED` | `#ff5a2b` | 5.87 |
| `UNRANKED` | `--dim` `#5f8a78` | 4.69 |
| `STANDBY` | `#9a5a3a` | **3.39** |
| the same STANDBY hex in the PORTAL room (`--bg2` `#222e22`) | | **2.63** |

The room matters because `.gt-root` re-points `--bg2` to `--panel-2`; measuring
in the portal gives 2.63 and would send someone chasing a different number. The
clock has ONE ground in practice: `popout.ts` tags the Picture-in-Picture body
`gt-root`, so a popped-out clock resolves the same token.

Fixed to **`#b86b45`**, which measures **4.55:1**. Hue (20deg) and saturation
(45%) are held and only lightness moves, 41.6% -> 49.6% -- verified by reading
the HSL of both back off the canvas. A lightness sweep found the true minimum
clearing 4.5 is L=49.2 (`#b66b45`, 4.506); that was rejected for having 0.006 of
margin, which is not a margin.

**Should it be a token?** Yes. `viewport.css`'s own header says "Do not hardcode
aesthetic values in GAUNTLET page or component files; read these tokens", and
this is the third hardcoded orange in one component. The right shape is a
`--gt-standby` (or a `--crimson`-style reserved standby token) declared beside
`--crimson`, since STANDBY is a run-state colour exactly as REC is. **Not done
here: `viewport.css` was not this session's to edit.** Until it is, the hex
carries its measurement and its reasoning in a comment beside it.

**A finding this session did not fix, reported rather than left silent.** The
standby DIGITS, measured the same way, are worse than the label was:

| element | colour | size | floor | ratio |
| --- | --- | --- | --- | --- |
| `.sr-main` (standby) | `#7a3320` | 40px bold | 3.0 (large text) | **2.02** |
| `.sr-sep` / `.sr-cc` (standby) | `#6a4a1a` | 22px | 4.5 | **2.27** |

Both fail, and `.sr-main` fails even the relaxed large-text floor. They are left
alone deliberately: the audit named one fix, the dimming is a deliberate
"armed but not started" signal, and whether a placeholder `00:00` is
informational content at all is a design decision rather than a mechanical
raise. It wants its own bundle.

## What was measured

- `svelte-check`: **0 errors / 37 warnings (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`)** before and after --
  baseline held. Two phantom errors appeared mid-session from stale generated
  route types after adding load keys and cleared with `svelte-kit sync`, exactly
  as the toolchain trap describes.
- Full suite: **161 files / 3476 tests passing** before; **163 files / 3508
  tests passing** after (+2 files, +32 tests, no failures).
- Real Chromium at **1440px and 375px** on `/dev/run-analysis`: no horizontal
  scroll at either width (scrollWidth == innerWidth), panel 712px / 327px, the
  new `Est. mass` and `Active (est.)` labels present, the comparison column
  rendering both medians and the learning curve. Panel copy contrast measured
  against its real ground: `.pra-stat .l` 4.69, `.pra-sub` 4.92, `.pra-callout`
  18.22, `.pra-label` 4.92.

## Mutation proof

Every behavioural change was opened in the PERMISSIVE direction and the file
restored from a copy, md5-checked (never `git checkout --`).

SQL, against `tests/gauntlet-class-stat-floor.test.ts`: floor 5 -> 1 (3 failed);
count runs not students on elapsed (1), on features (1), on dwell (1); include
the caller (2); one global count gating all three (1); drop the dwell tail
`coalesce` (1); scan all event types instead of `feature_add` (1). Eight
mutations, all bite.

Client, against `tests/gauntlet-post-run-analysis-wiring.test.ts`: revert the
mount to the pre-bundle two-prop form -- the original defect (3 failed); drop
the `user_id` filter off `selfHistory` (1); ignore the measured mass (1); ignore
the add-in's active/idle (1); make `hasClassStats` a bare truthiness check (1).
Five mutations, all bite.

**THE FIRST DRAFT OF THE DWELL MIRROR TEST PROVED NOTHING, AND THE MUTATION IS
WHAT SAID SO.** It used one fixture whose largest dwell was a middle gap, so
deleting the tail `coalesce` and dropping the `event_type` filter BOTH left the
answer unchanged and the test green at 12/12. A single stream has a single
maximum and therefore exercises exactly one of the two branches that can be
wrong. It now takes two fixtures: TAIL, whose largest dwell is the last
feature's and exists only because the tail runs to the run's end; and NOISE,
whose largest gap in the stream is between non-feature events and must not be
counted. Both mutations bite against the pair. Every fixture gap is a whole
tenth of a second, because the component's answer is read back off its rendered
`toFixed(1)` callout and a 12,250ms gap reads back as 12,300 -- which looks like
a disagreement and is not one.

## Not verified

- **Nothing was run against the live Supabase project.** The local `.env` is a
  placeholder project; 0150 has not been applied anywhere but the test fixture's
  embedded Postgres. It must be pasted into the SQL editor by hand.
- **No signed-in GAUNTLET surface was driven in a browser.** The real speedrun
  page needs a Bosco Tech Google session and a running SolidWorks add-in; what
  was driven is `/dev/run-analysis`, which mounts the real component.
- **The `analysis` prop was not exercised in a browser**, because the dev
  harness that mounts this component was not this session's file to edit. Its
  behaviour is covered by server-render assertions on the real component in both
  directions.
- **No real add-in summary row was observed.** The `computed_mass` /
  `active_ms` claims come from reading the deployed C# source, not from a
  captured run.
- The browser pass runs with `prefers-reduced-motion: no-preference` and with
  non-loopback requests blocked, so text is measured in the fallback font stack.

## Deferred

- `viewport.css` should gain a standby token and `SpeedrunClock` should read it.
- The standby DIGITS (2.02 and 2.27) need their own bundle.
- `AddinUpdate.ManifestUrl` is still `""`, so no deployed add-in can be updated.
  Until it is set, every column above stays frozen at what the shipped build
  writes.
