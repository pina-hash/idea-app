# IDEA // GAUNTLET, design doc

> **READ THIS FIRST: A CLAIM IN THIS DOCUMENT IS A LEAD, NOT A FACT.**
>
> This file was written against a snapshot of the code and **nothing keeps it
> honest** -- no test reads it, no build step checks it, and no rule anywhere
> requires a session that changes GAUNTLET to touch it. That is a structural
> property, not an accusation about any past session, and it is the same
> failure the VANGUARD backlog had: a document that is authoritative in tone,
> stale in fact, and impossible to tell apart from a current one by reading it.
>
> It stopped being maintained after migration `0027` and stood unchanged
> through **ten later GAUNTLET migrations** (`0028`-`0031`, `0033`-`0036`,
> `0060`, `0061`), two redefinitions that changed its meaning from outside
> (`0038`, `0067`), and the entire C# SolidWorks add-in. The 2026-08-29 audit
> that produced this header corrected everything it could verify and is
> recorded in `docs/history/gauntlet-component-harnesses-gnddjg.md`; anything
> not touched by that audit has been unverified since `0027`.
>
> **Before acting on a statement here, check it against the code.** The
> migrations in `supabase/migrations/` are the applied record and win; a
> function is resolved BY NAME at call time, so its LAST `create or replace` is
> the live definition. `CLAUDE.md` wins on how work in this repo is done.
> `docs/GAUNTLET-DESIGN.md` is the VIEWPORT design system and is separate.

> **AND THE SECOND MOST MISLEADING THING BELOW: "TEACHER" IN THIS DOCUMENT
> USUALLY MEANS ADMIN, BUT NOT UNIVERSALLY SINCE `0155` (QUEUED, NOT
> APPLIED).** Most authoring, hosting and moderation gates in GAUNTLET are
> written `is_teacher()` in SQL, and **`0067` redefined `is_teacher()` to
> return `is_admin()`** -- one function body, re-gating roughly ninety
> already-applied references at once. `teacher` is auto-granted by email
> domain and on its own grants **nothing** in GAUNTLET, then or now.
>
> **`0155` adds a THIRD, narrower tier on top of that**, `gauntlet_authors` /
> `gauntlet_can_author()`, which grants authoring, publishing and room hosting
> to an explicit allowlist without granting admin -- see CLAUDE.md's "GAUNTLET
> AUTHOR TIER" for the full shape and the census of which of the eleven
> GAUNTLET gates moved onto it (challenge read/write, series, the three
> challenge-asset buckets, room create/delete) versus which stayed on
> `is_admin()` (every student-work read, `gauntlet_run_review`,
> `gauntlet_practice_meter`, the global Speedrun ruleset). **`0155` is QUEUED,
> not applied** (see "Applied vs. queued" below the migration table), so as of
> this writing the two-tier world is still the live one: a Bosco Tech teacher
> who is not a row in `public.app_admins` cannot author a challenge or host a
> live room. **This is a capability question about a colleague, not a naming
> quibble:** if a teacher reports that authoring is missing, the live answer
> is an `admin_grant`; once `0155` is applied, the narrower `gauntlet_author_grant`
> is the right one instead.
>
> **The redirect this paragraph used to describe is fixed.** `/gauntlet/author`
> and `/gauntlet/rooms` now render a spoken refusal panel in the app's own
> chrome rather than a silent redirect, per
> `docs/history/gauntlet-authoring-allowlist-xui3ps.md` and
> `docs/history/gauntlet-authoring-quiz-harness-it0oat.md` (the latter also
> wired the `/gauntlet` landing page's Authoring card onto the new check).
> Every "teacher" below should be read as "admin" unless it names one of the
> eleven `0155`-moved sites; the word is left in place where it is quoting a
> migration or a policy NAME, which cannot be renamed (see `CLAUDE.md`'s
> naming trap).

The north star for the GAUNTLET section of `idea-app`. Read this before adding a
mode, a scoring rule, or schema. It exists so later work does not drift from the
original intent.

## What GAUNTLET is

GAUNTLET is a **CAD skills dojo**: students enter to train SolidWorks skills,
get scored, and level up over time. The tagline is the design brief: **enter
weak, leave strong, with visible progression.**

The important framing: **GAUNTLET is a container for multiple CAD challenge
modes, not a single speedrun game.** Speedrun is the flagship mode, but the
container is the point. Every design decision favors "more modes slot in
cleanly" over "make speedrun special." Modes share one data model, one shell,
one leaderboard mechanism.

## The two mode families

There are six modes in two families. The family determines whether a mode needs
the SolidWorks VBA macro (added in a later prompt) or is purely web based.

### Modeling modes (read geometry from SolidWorks via the macro)

These read the active part's geometry. The macro is a later prompt; until it
ships, **manual mass entry is the supervised-trust MVP path** and the macro
replaces it for ranked play.

- **Speedrun** (flagship): model a dimensioned part as fast as possible.
  Score = volume match plus time.
- **Reverse Engineer**: reproduce a part from a physical object or from views,
  with no clock. Score = volume plus surface area.
- **Feature Golf**: hit the target geometry in the fewest features. Score =
  volume for correctness, feature count for rank (like golf, lower is better).

### Knowledge modes (web only, answer based, no macro)

These never touch SolidWorks. They are answer-graded in the browser/server.

- **Drawing Reading** (built first, this prompt): read orthographic views and
  dimensions, match a 3D part to its views, recognize features and line types.
- **GD&T and Tolerance**: interpret geometric callouts, datums, and fits.
- **Spot the Error**: find the mistake in a drawing or model.

## Verification principle (modeling modes)

- **Verify on volume internally.** Volume is geometric and material
  independent, so it is the canonical correctness signal for a modeled part.
- **Present challenges in TooTallToby convention.** Students see a material, a
  density, and a target mass, the way real practice problems are stated. Mass is
  presentation; volume is the truth we check against (mass = volume x density,
  so a correct volume in the stated material yields the target mass).
- **CORRECTED 2026-08-29 -- RANKED VERIFICATION IS VOLUME ONLY, AND NOTHING
  ABOUT THE STUDENT'S MATERIAL OR DOCUMENT UNITS GATES ANYTHING (`0034`).**
  What this bullet used to say -- that the macro submit checks the measured
  density against the challenge's expected density within ~1%, and blocks a
  submit with no material -- described `0027`, and **`0034` removed every one
  of those gates.** The chain it reverses is worth knowing, because all three
  steps were the same mistake: `0026` gated on the part's assigned material
  NAME, `0027` gated on its assigned material DENSITY, and `0030` additionally
  blocked on the DOCUMENT unit system. Each read something off the student's
  part other than its geometry, so a missing, custom or mismatched material --
  or simply an IPS document -- hard-failed a geometrically correct part.
  - **The live model.** Ranked correctness is the measured geometric volume
    against the level's stored `answer->>'target_volume_mm3'`, within
    tolerance. Volume as a checksum, and nothing else.
  - **Mass is computed from the LEVEL'S density**, never from the part's
    assigned material: `mass = measured_volume x level_density`. Because the
    density is a fixed level constant, hitting target mass IS hitting target
    volume, so there is no second mass gate to keep in step.
  - **`p_material` and `p_unit_system` survive as advisory display fields
    only.** `material_matches` is reported and never affects pass/fail;
    `p_mass_g` (the part's assigned-material mass) is not read for any
    verification value at all.
  - **The default tolerance is 0.1%, not 0.5% (`0036`).** `0034` shipped
    `GAUNTLET_VOLUME_TOL_PCT = 0.5` and `0036` redefined both carrying
    functions to `0.1`. It is a DEFAULT: a level that sets its own
    `answer->>'tolerance_pct'` still wins. The constant is shared with the VBA
    macros and the C# add-in, which are preview-only; keep the three in sync.
- **Capture surface area and feature count for audit**, even when they are not
  the ranking metric, so a submission can be inspected later.
- **Manual mass entry is the supervised-trust MVP.** A student types the mass
  the macro will later read automatically. Ranked play waits for the macro.

## Data model

One schema serves all six modes from day one so later modes need no rework. See
`supabase/migrations/0004_gauntlet.sql`.

### `challenges`

`id`, `mode` (enum over the six modes), `title`, `difficulty` (1 to 5),
`asset_ref` (optional pointer to an external drawing/asset), `author_id`,
`status` (`draft`|`published`|`archived`, since 0009; `published` is now a
trigger-derived boolean from it), `created_at`, `updated_at`, and the
mode-specific JSONB payload.

The spec calls for a single JSONB payload holding both prompt and answer data.
We realize that as **two JSONB columns, `prompt` and `answer`**, for one
security reason: knowledge modes store the correct answer next to the question,
and students must not be able to read it. Splitting the payload lets a
column-level `GRANT` expose `prompt` to students while withholding `answer`
entirely from clients. The answer is read only server-side by the grading RPC.

- `prompt` (readable by signed-in students): the question, the drawing (inline
  SVG or an `asset_ref`), the answer options, and any display-only modeling data
  (material, density, target mass, hints).
- `answer` (never granted to clients): for knowledge modes the correct option
  key plus an explanation; for modeling modes the canonical volume, surface
  area, feature count, and tolerances.

Speedrun site data was formalized in `0015`: the record also holds `slug`
(stable, url-safe; a partial unique index enforces it), `par_time` (seconds),
and two Storage references,
`model_path` (STL, in `prompt`, a shape-only preview) and `drawing_image_path`
(dimensioned PNG, in `answer`, gated and revealed on Start). The drawing (PNG)
and 3D model (STL) are pure-geometry artifacts with no identity/metadata; they
live in the private `gauntlet-drawings` / `gauntlet-models` buckets (authenticated
read, admin write), served as short-lived signed URLs. One **global ruleset**
(`gauntlet_speedrun_ruleset`, a singleton row: units label, projection, rule
lines) is shared across every Speedrun challenge, not repeated per record.
`StlViewer.svelte` (three.js + STLLoader, orbit controls, auto-fit, shape only)
renders the model and replaces the isometric view that used to live on the
drawing.

`0018` adds `unit_system` (`IPS` or `MMGS`, also pure site data in `prompt`,
required by `gauntlet_publish_blocker`): every presented property (density,
target mass, the drawing's dimension-reading convention) follows the selected
system, never mixed within one challenge. The authoring form derives
`density_unit` / `mass_unit` / `length_unit` from it instead of the author
typing them; Reverse Engineer and Feature Golf keep their original fixed g/cm3
convention (no `unit_system` field). The play/room pages show the
per-challenge system's dimension label in place of the global ruleset's
generic one when a challenge sets it. The ruleset's `projection` field is
still stored but no longer rendered anywhere; it was a confusing, unused "rule
line" in the ruleset panel. **CORRECTED 2026-08-29: it is not
teacher-editable, and it is not editable by anyone.** `0015` grants `update` on
`gauntlet_speedrun_ruleset` to `authenticated` behind an admin policy, so the
column is writable *in principle* -- but **no surface in the app binds an input
to it**. There is no authoring form for the ruleset at all: the two readers
(`/gauntlet/speedrun/[id]` and `/gauntlet/rooms/[id]`) select the singleton row
and render it. Changing `projection` today means a hand-written SQL statement in
the Supabase editor. Read the phrase as "changeable by an admin with SQL
access", which is what "teacher-editable" would have to mean here anyway (see
the admin header at the top).

`0019` fixes a real "cannot be deleted" bug: `gauntlet_author_delete` archives
a challenge instead of removing it once it has submissions (so board history
is never orphaned), but the seeded `demo`-flagged placeholders (three each for
Speedrun, Reverse Engineer, Feature Golf) are test content, not board history,
and the author list has no status filter, so an archived demo row (like
"Demo Speedrun: ABS Spacer") just sat there forever looking stuck. The RPC now
hard-deletes any challenge flagged `demo` outright, cascading to its
submissions/tokens; the migration also purges every demo row that existed at
the time. Non-demo challenges are unaffected.

### `submissions`

`id`, `user_id`, `challenge_id`, `mode`, `value` (JSONB, what the student
submitted), `is_correct`, `score_metric` (numeric), `created_at`.

`score_metric` is a single number where **lower ranks better**: elapsed seconds
for timed/knowledge modes, feature count for Feature Golf. `is_correct` carries
pass/fail; `score_metric` ranks within and breaks ties. Richer raw values
(volume match, surface area) live in `value` for audit. This keeps one uniform
leaderboard ordering across every mode.

### `gauntlet_leaderboard` (a view, not a table)

Best submission per user per challenge, ranked `is_correct DESC, score_metric
ASC, created_at ASC`. It runs with the view owner's privileges (so every player
sees the whole board) and exposes only board-safe columns (player name,
correctness, metric, rank), never raw answer values.

### Security model

- **Students** read published challenge prompts and the board, and read their
  own submissions. They cannot read any `answer`, and they cannot insert
  submissions directly.
- **Grading is authoritative and server-side.** Submissions are written only by
  the `gauntlet_submit` SECURITY DEFINER RPC, which reads the hidden answer,
  grades, and inserts with `user_id = auth.uid()`. Direct client inserts are
  blocked (no grant) so a student cannot forge `is_correct` or a zero time.
- **ADMINS author challenges, gated by RLS. CORRECTED 2026-08-29: not
  `profiles.role`.** This bullet said "Teachers (the existing `profiles.role`)",
  and that has not been how the gate resolves since `0067`: the policies name
  `is_teacher()`, which now returns `is_admin()`, which reads
  `public.app_admins` -- an email-keyed roster, not the role column. A
  `profiles.role` of `teacher` grants nothing here. Any staff cross-user write
  (for example an admin entering a student's measured mass) routes through a
  SECURITY DEFINER RPC, never a direct client write.

Trade-off noted for later: the board ranks the *best* attempt, and the grading
RPC reveals the correct answer after an attempt (good for learning). For
strictly ranked play, restrict to the first attempt or withhold the answer until
the challenge is cleared. Out of scope for the MVP.

## Speedrun (machine-verified, with manual practice)

Speedrun is the first modeling mode. The student models a dimensioned part in
SolidWorks as fast as they can. The **ranked path is the SolidWorks VBA capture
macro** (`0006_gauntlet_macro.sql`): it reads the part geometry and posts a
machine-verified run, with server-authoritative timing. **Manual mass entry
remains as unranked supervised practice.** The original manual MVP is
`0005_gauntlet_speedrun.sql`.

- **Payload split.** The Speedrun `prompt` (public) carries only the framing
  shown *before* Start: material, density, target mass, tolerance, units, note,
  and a `demo` flag. The dimensioned **drawing lives in the hidden `answer`
  column**, alongside the authoritative grading values (target volume in mm3
  `target_volume_mm3`, target mass, density, tolerance) and audit values
  (surface area, feature count). The `target_mass` / `tolerance_pct` in `prompt`
  are display copies; the `answer` copies are the source of truth.
- **Reveal on start mints a submit token.** The drawing is in `answer` (no
  client grant), never in the page load, so it cannot be fetched before Start.
  `gauntlet_speedrun_reveal(challenge_id)` (SECURITY DEFINER) hands back the
  drawing **and mints a single-use, ~30-minute, `(user_id, challenge_id)`-bound
  submit code** stamped with a server-side `reveal_at` in `gauntlet_run_tokens`.
  `reveal_at` is the server-stamped clock start (no client timer to tamper with).
  Re-revealing retires the prior unused code and mints a fresh one, a new run with
  a fresh clock. See **Residual trust** below for the supervised-trust caveat on
  re-reveal.
- **Machine submit (ranked). CORRECTED 2026-08-29: the signature is EIGHT
  arguments and a solo run is timed from `started_at`, not from `reveal_at`.**
  The live definition is in `0061`:

  ```
  gauntlet_macro_submit(
      p_code text, p_volume_mm3 numeric, p_run_id text default null,
      p_surface_area_mm2 numeric default null, p_feature_count integer default null,
      p_mass_g numeric default null,        -- IGNORED for mass and verification
      p_material text default null,         -- advisory only, never gates
      p_unit_system text default null       -- informational only, never gates
  ) returns jsonb
  ```

  It is a SECURITY DEFINER RPC the macro and the add-in post to via PostgREST
  with the **public anon key** (not a user session); the submit code is the
  credential, so it is granted to `anon`. It validates the code (exists,
  unused, unexpired), verifies correctness on VOLUME against
  `answer->>'target_volume_mm3'` within tolerance (never a client correctness
  flag), records a submission with `source = 'macro'` and `score_metric` =
  elapsed, and returns pass/fail and rank.
  - **THE CLOCK MOVED IN `0016` AND THIS DOCUMENT NEVER FOLLOWED IT.**
    `reveal_at` timed a run from the instant the student revealed the drawing,
    which does not establish that they started from a blank part. `0016` added
    `gauntlet_macro_start(p_code, p_volume_mm3)`, which rejects a non-blank
    part and stamps `started_at` plus a fresh `run_id` on the token. **A SOLO
    run is timed `now() - started_at` and requires `p_run_id` to match the
    issued `run_id`.** A ROOM run is unchanged and still keeps the shared
    `reveal_at` clock, so `p_run_id` is ignored for it -- the two clocks
    coexist and which one applies is decided by whether the token carries a
    room.
  - **IT NO LONGER RETURNS THE COMPARISON VALUE (`0061`).** `target_volume_mm3`,
    `your_volume_mm3` and `tolerance_pct` are gone from the response, replaced
    by a coarse UNSIGNED deviation band (`pass` | `close` | `near` | `far`)
    whose finest step is 10x the default pass band, so it cannot be bisected
    into the tolerance. `gauntlet_run_targets` dropped the same two fields.
  - **AND A FAILING SOLO SUBMIT NOW COSTS AN ATTEMPT (`0061`).**
    `gauntlet_run_tokens.failed_attempts` budgets 3 failures per reveal;
    exhausting it retires the code, so more guesses need a fresh reveal, which
    needs a session and lands an attributable row in
    `gauntlet_speedrun_attempts` (`0033`). Together these close the exploit
    chain recorded as F4 in `docs/audits/2026-07-security-audit.md`: reveal ->
    start with a client-attested blank value -> read the target back out of the
    response -> submit it. It ranked a machine-verified run without opening
    SolidWorks.
- **Manual practice (unranked).** `gauntlet_submit` still grades a typed mass
  within tolerance and records `source = 'manual'` (the default). It is a quick
  self-check; it does not rank.
- **Source-tagged, machine-ranked board.** `submissions.source` is `'manual'` or
  `'macro'`. The `gauntlet_leaderboard` view ranks modeling modes only on
  **passing + macro** runs, so manual speedrun entries never appear on the board.
  Knowledge modes ignore `source` and keep every attempt, so Drawing Reading is
  unchanged.
- **Live result.** The play screen shows the submit code prominently with a link
  to the macro, and subscribes via Supabase **Realtime** to submissions for the
  challenge, reacting to the user's own macro row (RLS scopes students to their
  own rows; the handler also checks `user_id` because admins can read all), so
  the macro's result and the updated board appear automatically. A manual Refresh
  is the fallback.
- **CORRECTED 2026-08-29 -- THE TOOLING IS FOUR FILES IN `static/tools/`, NOT
  ONE IN `static/gauntlet/`, AND THERE IS ALSO A C# ADD-IN THIS DOCUMENT NEVER
  MENTIONED.** `static/gauntlet/` does not exist and
  `idea-gauntlet-speedrun.bas` does not exist. The single macro was split into
  three when the clock moved to `started_at` (`0016`), because Start and Submit
  became two separate posts:

  | File | Role |
  | --- | --- |
  | `static/tools/idea-gauntlet-start.bas` | Start: rejects a non-blank part, stamps `started_at` + `run_id` |
  | `static/tools/idea-gauntlet-submit.bas` | Student submit: posts the run |
  | `static/tools/idea-gauntlet-author.bas` | **Admin only** on `/gauntlet/tools`. Author capture: prints canonical `target_volume_mm3` / `surface_area_mm2` / `feature_count` / `mass_g` for the paste box |
  | `static/tools/idea-gauntlet-addin.zip` | The compiled C# SolidWorks add-in |
  | `static/tools/tools-manifest.json` | Versions, dates and changelog, read by `/gauntlet/tools` so a stale local copy is obvious |

  All of them read mass properties in SI (`UseSystemUnits = True`) and
  normalize to mm3 / mm2. The endpoint URL and public anon key are
  clearly-marked constants at the top (not secrets).

- **THE C# ADD-IN IS THE PRIMARY RUN TOOL NOW, and it is a whole subsystem this
  document was written before.** Source is in the repo at
  `tools/solidworks-addin/IdeaGauntletAddin/` (`SwAddin.cs`,
  `TaskPaneControl.cs`, `PartReader.cs`, `GauntletClient.cs`, `GauntletMath.cs`,
  `TelemetryRecorder.cs`, `AddinUpdate.cs`, `AddinIcons.cs`); the compiled
  binary is not checked in and ships as the zip above, mirrored into the public
  `gauntlet-tools` bucket by `0031`. It is a task pane rather than a macro
  prompt: it loads a level, runs the same Start/Submit RPCs, and adds two things
  the macros do not have.
  - **`GauntletMath.VolumeTolPct` is the third copy of the shared tolerance
    constant** (0.1 since `0036`), alongside the VBA `GAUNTLET_VOLUME_TOL_PCT`
    and the two SQL functions. All four are preview-or-ranked copies of one
    number and drift silently.
  - **`TelemetryRecorder` writes the modeling-process stream (`0035`)**:
    append-only `gauntlet_run_events` through `gauntlet_run_events_insert`, plus
    a materialized per-run summary through `gauntlet_run_analysis_upsert`. It is
    FAIL-SAFE and non-blocking by design -- telemetry never affects a run's
    outcome -- and it is what feeds `LiveTelemetry.svelte` and
    `PostRunAnalysis.svelte`. See "Written and not read" at the end of this
    document for what happens to the summary it writes.
- **Residual trust.** The submit token moves the clock server-side (no client
  timer to tamper with) and is single-use. Two trust assumptions remain,
  consistent with the supervised model: (1) the posted *geometry* is trusted from
  the sanctioned macro (forging it means bypassing the macro with a crafted
  request, detectable by an implausibly fast pass), and (2) the captured geometry
  is not cryptographically bound to the reveal that timed it, so a student could
  re-reveal *after* modeling to shorten the measured time; honest timing relies on
  supervision (run the macro once per genuine attempt). Deeper macro attestation
  (for example proving the model was saved after `reveal_at`) is future work. Note
  this only affects time-scored Speedrun; Reverse Engineer is untimed and Feature
  Golf scores on feature count.
- **CORRECTED 2026-08-29: telemetry is not a cheat detector, and a gate built
  on it has been proposed twice and retracted both times after measurement.**
  `0061`'s own header (an applied migration; left as written, not edited) and
  `docs/audits/2026-07-security-audit.md` both say the same thing about the
  `gauntlet_macro_start`-then-immediate-submit cheat: "Its only real detector
  is the `0035` telemetry stream -- a passing run with no modeling events is
  visibly fake." That premise is false, and it is why the idea keeps coming
  back: a zero-event run is the ORDINARY case on at least four of the paths
  that rank or grade, not a tell. The three `.bas` macros never write a
  telemetry event at all -- only `TelemetryRecorder` in the C# add-in does
  (see above) -- so every VBA macro submit is a legitimate zero-event run. An
  add-in build from before the telemetry recorder shipped is another. A room's
  manual mass entry (`gauntlet_room_manual_submit`) never touches the add-in
  or the macros. And every knowledge mode (`gauntlet_submit` outside the
  Speedrun practice branch) has nothing to model in the first place. Gating
  ranking, or even flagging, on telemetry presence or shape would treat all
  four as suspicious for doing exactly what they are meant to do. **What
  telemetry actually is:** `gauntlet_run_events` (`0035`) is anon-granted and
  client-posted, with no server attestation of any kind -- so even where
  events exist, their presence corroborates nothing that a forger could not
  fabricate more cheaply than doing the real modeling work. Before proposing a
  telemetry gate again, the question to answer first is not "does a passing
  run usually have events" but "is there anything server-side that a forger
  cannot produce for less than the cost of earning it" -- and today there is
  not.
- **Demo seeds (purged in `0019`).** The original three placeholder Speedrun
  challenges were seeded with internally consistent dummy values
  (`target_mass = target_volume x density`,
  `target_volume_mm3 = target_volume_cm3 x 1000`) and a clearly-labeled
  placeholder drawing, marked `demo`. They served their purpose (exercising the
  flow end to end) and were removed once real content authoring existed; see
  the "IDEA // GAUNTLET" entry in docs/HISTORY.md. Real challenges are
  authored from actual SolidWorks parts with the macro's Author capture mode,
  via the authoring tool.

### Drawing UX, series, and tutorials (`0022`, `0023`)

Four additive Speedrun improvements that layer on the reveal-on-start model
without touching scoring, timing, or the token flow (full detail in the
"IDEA // GAUNTLET" entry of docs/HISTORY.md):

- **Interactive drawing viewer** (`DrawingViewer.svelte`): pan / zoom / fit with a
  minimap and an optional focus-region jump strip, replacing the click-to-zoom
  image inline and in the expanded lightbox. Reading fine detail on a complex
  drawing no longer means fighting the UI. Rebuilt around a **full-sheet PDF
  contract** (see the drawing-viewer bullets in
  docs/HISTORY.md): pdf.js renders one sheet
  per page (multi-page supported), the drawing and the region hotspots share ONE
  pan/zoom transform so alignment holds at every zoom, and a sub-second CRT
  plotter scan-in plays on reveal (presentation only; reduced motion gets an
  instant fade). Legacy PNG and inline-SVG drawings still render.
- **Focus regions**: author-defined labelled rectangles in normalized PAGE
  coordinates (0 to 1 plus a 0-based `page` index for multi-page PDFs; missing
  page means page 0, so every pre-PDF region is unchanged). Because they describe
  the gated dimensioned drawing they live in `answer.focus_regions` and are
  revealed on Start by `gauntlet_speedrun_reveal` (0023), preserving the
  "nothing about the drawing leaks before Start" rule. Degrade to plain pan/zoom.
- **Picture-in-picture / pop-out**: float the drawing over SolidWorks so students
  don't alt-tab mid-run. Document PiP (primary, carries pan/zoom by moving the
  live node), `window.open` (fallback), in-app floating panel (baseline).
- **Series / collections (`0022`)**: `gauntlet_series` + `series_id`/`series_order`
  on `challenges`, a first-class organizing unit so authors group drawings (an
  FRC parts series) and students browse by series. Membership is a real relation
  (not prompt JSONB) written by `gauntlet_series_assign`, so content edits never
  clobber it. Optional per-drawing YouTube tutorial lives in
  `prompt.tutorial_video_id` (collapsed panel, lazy iframe; no migration).

## Reverse Engineer and Feature Golf

Two more modeling modes (`0007_gauntlet_modeling_modes.sql`) that reuse the macro
and the machine-verified submit path **unchanged**; only the reveal rule, the
score metric, and the board differ. `gauntlet_macro_submit` now selects the
metric by mode and **always verifies pass/fail on volume**;
`gauntlet_speedrun_reveal` mints the submit token for any modeling mode. Both
share the `ModelingRun.svelte` play component.

### Reverse Engineer (untimed, scored on form accuracy)

- **Prompt + reveal.** The challenge shows reference material (a photo or
  reference views) in the **public `prompt`** (`reference`), up front, because the
  mode is untimed. The student still clicks to mint a submit code (the reveal
  binds the macro run); there is no hidden drawing.
- **The Reverse Engineer metric.** Pass/fail is volume within tolerance, as
  usual. The ranking metric is **closeness of form**: the mean percent deviation
  of captured volume and surface area from canonical,
  `score = (|vol - target_vol|/target_vol + |area - target_area|/target_area) / 2 * 100`,
  rounded, **lower is better**. The `answer` carries `target_volume_mm3` and
  `target_surface_area_mm2`.
- **Board.** Ranks passing runs by lowest deviation, not time.

### Feature Golf (fewest features)

- **Prompt + reveal.** The target is a dimensioned drawing, hidden in `answer`
  and **gated behind Start like Speedrun** (kept gated for consistency even
  though timing is not the score). `par_features` in the public `prompt` is shown
  for flavor, not graded.
- **Scoring.** Pass/fail is volume within tolerance; among passing runs the
  metric is **feature_count** (the macro's tree count), **lower is better**. A
  wrong-volume submission does not rank. Time is a tiebreak only.
- **Known limitation (v1).** `feature_count` is a raw feature-tree count, so it
  can be gamed by collapsing intent (combining operations, library features). This
  is acceptable for v1 classroom use; a later prompt can add an intent-aware count
  or a feature-type rubric.

### Shared

- **One metric column, per-mode direction.** Each mode stores its primary metric
  as `score_metric` where **lower always ranks better** (time / deviation /
  feature count), so the single `gauntlet_leaderboard` ordering (`is_correct
  DESC, score_metric ASC, elapsed tiebreak, created_at`) ranks every mode
  correctly. The view gained an elapsed-time tiebreak for Feature Golf ties.
- **Demo seeds.** Two to three placeholders per mode, internally consistent dummy
  geometry, to be replaced by real author-captured parts.

## GD&T and Tolerance and Spot the Error (knowledge modes)

The last two modes (`0008_gauntlet_knowledge_modes.sql`) are web-only and
answer-graded **exactly like Drawing Reading**: no macro, no submit token, no
geometry capture. They complete all six modes. Both use the shared
`KnowledgePlay.svelte` component and grade through `gauntlet_submit`.

- **Generalized answer grading.** `gauntlet_submit`'s knowledge branch now grades
  by an answer `type` in the hidden `answer` payload: `'choice'` (exact option-id
  match, the default, so **Drawing Reading is preserved exactly**), `'text'`
  (case/space-insensitive exact match), and `'numeric'` (a number within an
  optional `tolerance`). The prompt renders multiple-choice options or a
  text/numeric input depending on whether it carries `options` or an `input`.
  **Single answer per challenge for v1.** Multi-part questions (several blanks
  graded together) are a possible later enhancement.
- **Boards** rank by correctness with elapsed time as a tiebreak, identical to
  Drawing Reading (the leaderboard view already covers knowledge modes, so no
  view change was needed).

### GD&T and Tolerance

Reading feature control frames (symbol, tolerance zone, datum references),
identifying datums, and interpreting fits and tolerance conditions (clearance
vs interference, MMC and LMC). Symbol and concept questions are multiple choice;
tolerance and fit computations are numeric. This mode reinforces the **GD&T
vocabulary the UC course descriptions lean on**, so it doubles as exam prep.

### Spot the Error

Each drawing numbers candidate callouts (1-4) and the student picks the flawed
one. The seed set spans the error categories: missing/redundant dimension,
misaligned/wrong projection view, impossible/inconsistent geometry, and violated
drawing convention. **Answer-based for v1** (pick the number). A **click-to-locate
canvas** (click the flawed spot on the drawing) is logged as a v2 enhancement.

## Shell

GAUNTLET is a new **auth-gated section**: any signed-in user (student or
teacher) may enter; anonymous visitors are redirected off `/gauntlet*` by
`hooks.server.ts` (a new gated tier alongside the ADMIN-only dashboard --
`/dashboard` is admin-only, not teacher-only, per `CLAUDE.md`'s access model).
It
uses the app-shell side of the IDEA Green design system (not the legacy-index
landing theme), with a small `.gauntlet`-scoped block in `app.css`.

- `/gauntlet`: the dojo landing (identity + progression) and a mode-select grid
  of all six modes. Role-aware: **admins** see the authoring entry point (the
  route reads `isAdmin()` from `$lib/server/admin`, not the role column).
- `/gauntlet/drawing-reading`: the challenge list for the first mode.
- `/gauntlet/drawing-reading/[id]`: a single challenge, end to end (drawing +
  question, answer, submit, score, per-challenge leaderboard).
- `/gauntlet/speedrun`: the challenge list for the Speedrun mode.
- `/gauntlet/speedrun/[id]`: a single Speedrun challenge, end to end
  (reveal-on-start drawing + submit code, macro-verified ranked run over
  Realtime, manual practice fallback, board).
- `/gauntlet/reverse-engineer` and `/.../[id]`: the untimed modeling mode,
  scored on form deviation (shared `ModelingRun.svelte`).
- `/gauntlet/feature-golf` and `/.../[id]`: the fewest-features modeling mode
  (shared `ModelingRun.svelte`).
- `/gauntlet/gdt-tolerance` and `/gauntlet/spot-the-error` (+ `/.../[id]`): the
  two remaining knowledge modes (shared `KnowledgePlay.svelte`).
- `/gauntlet/tools`: download + setup for the SolidWorks add-in and the three
  VBA macros. The **author-capture macro is admin-only on this page**; the run
  tools are not.
- **ADDED 2026-08-29, three routes that exist and were unlisted:**
  - `/gauntlet/leaderboard`: the cross-mode standings board
    (`gauntlet_leaderboards`, last redefined in `0038`; the Speedrun records
    list lost its tier partition in `0029` and is now flat, ordered by
    difficulty then title).
  - `/gauntlet/speedrun/history`: the signed-in student's own attempt history,
    over the `gauntlet_speedrun_attempt_history` view (`0033`), which persists
    EVERY attempt -- completed, failed, and started-but-abandoned -- not only
    the ones that produced a submission.
  - `/gauntlet/speedrun/quickstart`: the short path into a run.
- `/gauntlet/author`, `/gauntlet/author/new`, `/gauntlet/author/[id]`: the
  **admin-only** authoring tool (see "Authoring" below). A non-admin, teacher
  included, gets a redirect rather than a permission message.
- `/gauntlet/rooms` and `/gauntlet/rooms/[id]`: live synchronized rooms (host +
  racers/spectators; see "Live Rooms" below).

## Authoring

The web authoring tool (`0009_gauntlet_authoring.sql`) replaces hand-edited SQL
seeds: **admins** (not teachers -- see the header) create, edit, publish, and
delete challenges across all six modes from the browser. The seeds still work; this supplements them and is how
the demo placeholders get replaced by real captured parts.

**`0155` (queued, not applied -- see "Applied vs. queued" above) narrows "admins"
to "admins, plus anyone on the `gauntlet_authors` allowlist" for everything in
this section except the RLS read policy's "admins see and can test drafts"
clause two paragraphs down, which stays admin-only.** Once applied, read every
"admins" below as "admins or GAUNTLET authors" for create/edit/publish/delete,
series grouping, and the three challenge-asset buckets; see CLAUDE.md's
"GAUNTLET AUTHOR TIER" for the exact eleven sites and the ones deliberately left
on `is_admin()`.

- **Status lifecycle.** A `status` column (`draft` | `published` | `archived`)
  is the authoring source of truth; new challenges default to **draft**. The
  existing `published` boolean is now a **trigger-derived** column
  (`published = status = 'published'`), so every existing RLS policy, the
  leaderboard view, the play RPCs, and the published-filtered list queries keep
  working unchanged. **Students only ever see published** (drafts and archived
  have `published = false`); **admins** see and can test drafts via the RLS read
  policy still NAMED for teachers, which cannot be renamed (`CLAUDE.md`'s naming
  trap: ~90 applied references resolve it by name).
- **Server-side writes only.** Direct client INSERT/UPDATE/DELETE on
  `challenges` is revoked. All writes go through SECURITY DEFINER RPCs that
  re-check `is_teacher()` -- **which is `is_admin()` since `0067`** --
  `gauntlet_author_upsert` (create/edit),
  `gauntlet_author_set_status` (publish/unpublish/archive),
  `gauntlet_author_delete`, and `gauntlet_author_get` (returns the full
  challenge, including the hidden `answer`, for the edit form). Publishing runs
  `gauntlet_publish_blocker`, which validates the required fields **per mode**
  server-side, so an incomplete challenge cannot publish (drafts may be saved
  incomplete).
- **Soft-delete.** Deleting a challenge that has submissions **archives** it
  (status `archived`) so board history is never orphaned; only a challenge with
  no submissions is hard-deleted. (idea-app had no prior soft-delete precedent.)
- **Mode-aware form.** One form (`ChallengeForm.svelte`) whose fields switch by
  mode and write the **exact existing payload shapes** (it does not change the
  payload contract, see the per-mode sections above): modeling modes get the
  geometry/material/tolerance fields plus a **paste-capture box** that parses the
  macro's Author-capture output, and a client-side `mass = volume x density`
  mismatch warning; knowledge modes get the question, answer type (choice / exact
  text / numeric), options, correct answer, and explanation. Spot the Error is a
  multiple-choice challenge (the enumerated callouts are the options).
- **Assets. CORRECTED 2026-08-29: there are FOUR GAUNTLET buckets, not one.**
  `gauntlet` (public, `0009`) holds uploaded drawings and reference images:
  admins upload, everyone reads via the public URL, and it is the bucket this
  bullet describes. The other three are `gauntlet-drawings` and
  `gauntlet-models` (both PRIVATE, `0015`: authenticated read, admin write,
  served as short-lived signed URLs -- the gated dimensioned PNG and the STL
  shape preview) and `gauntlet-tools` (public, `0031`, the compiled add-in
  build, which is a binary and is not checked in). The
  asset can also be pasted inline SVG. It is written into the same payload slot
  the play screens already read (`prompt.drawing` for knowledge,
  `prompt.reference` for Reverse Engineer, the hidden `answer.drawing` for
  Speedrun / Feature Golf). Gated drawings keep their reveal-on-start property:
  the URL lives in the hidden `answer` column on a random, unguessable path, so
  only the reveal RPC hands it back. A shared `Asset.svelte` renders an asset as
  inline SVG or an `<img>` by sniffing the leading `<`.
- **The capture workflow.** Modeling challenges get real geometry from the
  macro's **Author capture** mode: an admin models the canonical part, runs the
  macro in Author mode, and pastes the printed values
  (`target_volume_mm3` / `surface_area_mm2` / `feature_count` / `mass_g`) into the
  form's paste box. This is the supported path to replace the demo placeholders.

## Live Rooms

Live rooms (`0010_gauntlet_rooms.sql`) are a **synchronized orchestration layer**
over an existing mode, not a new mode. A room run is an **ordinary submission
tagged with `room_id`**, graded by the same token path, so it also lands on the
global per-challenge leaderboard with no special handling. **v1 is Speedrun,
single round**; the schema is structured so a future multi-round or other modes
slot in without reworking submissions.

- **Schema.** `gauntlet_rooms` (`host_id`, short unique `join_code`,
  `current_challenge_id`, `state` of lobby/live/results, `started_at` = the one
  authoritative clock for the active round) and `gauntlet_room_participants`
  (`room_id`, `user_id`, `role` racer/spectator, unique per room+user).
  `submissions` and `gauntlet_run_tokens` gain a nullable `room_id` (solo runs
  leave it null). The single active round lives on the room; a future rounds
  table can take over `started_at`/`current_challenge_id` with `room_id` still
  the submission link.
- **Host flow (ADMIN, not teacher -- see the header).** `gauntlet_room_create`
  mints the join code and lands
  in lobby; `gauntlet_room_set_challenge` (lobby, published Speedrun only);
  `gauntlet_room_start` and `gauntlet_room_set_state` for live/results. All are
  host-only, enforced by `host_id` server-side, not just hidden in the UI.
- **Synchronized reveal + shared clock.** `gauntlet_room_start` (SECURITY
  DEFINER, host-only) sets `state = live` and one `started_at = now()`, then
  **bulk-mints one submit token per current racer**, each bound to
  `(user_id, current_challenge_id, room_id)` with `reveal_at = started_at`, so
  **every racer shares one authoritative clock**. The drawing stays in the hidden
  `answer` column and is handed back only by `gauntlet_room_reveal` once the room
  is live (gated server-side, the same principle as solo reveal-on-start but
  host-triggered and shared). A later joiner becomes a **spectator** (their join
  role depends on the room state), which is how the roster "locks" for the round.
- **Student flow.** Enter a join code (`gauntlet_room_join`), wait in the lobby,
  and on host Start the drawing + a personal submit code appear. Submit either by
  the **macro** (`gauntlet_macro_submit`, unchanged except it now copies the
  token's `room_id` onto the submission) or **manual** mass entry
  (`gauntlet_room_manual_submit`), which computes elapsed **server-side from the
  room `started_at`** (not a client timer) and verifies on mass within tolerance,
  as in solo. **Manual ranks in a room** because the host supervises and the
  start is server-authoritative. One submission per racer per round (single-use
  token). End freezes the board by retiring unused room tokens.
- **Live board + Realtime.** `gauntlet_room_board` (owner-privileged view, like
  the global leaderboard) ranks the best passing run per racer by the mode metric
  (Speedrun: lowest elapsed time), counting both sources. Clients subscribe via
  Supabase Realtime (`postgres_changes`) to the room row (state /
  `current_challenge_id`), the participants table (roster), and room-filtered
  submissions (board), with a manual Refresh fallback. **Room state is
  DB-authoritative**, so a disconnect-and-return rejoins the current state. RLS:
  members (host + participants) read the room, roster, and the room's submissions
  (a co-racer's run data, never a hidden answer); writes go only through the
  SECURITY DEFINER RPCs.
- **Known limitation.** Per-client render latency at the instant of Start is
  negligible for minute-scale Speedrun runs, so a shared `started_at` is fair
  enough for v1; sub-second fairness would need a countdown handshake.

## Build order

All six modes ship eventually. The sequence:

1. **Drawing Reading** (built): the first end-to-end mode, plus the shell,
   the full data model, and the leaderboard mechanism.
2. **Speedrun** (built): the flagship modeling mode, on manual mass entry first.
   See "Speedrun" below.
3. **The SolidWorks tooling** (built): three VBA macros and, since, a C# add-in
   -- the ranked path for Speedrun (server-authoritative timing, volume
   verification). See "Speedrun" below. This step said "the VBA macro",
   singular, and predates both the Start/Submit split and the add-in.
4. **Reverse Engineer and Feature Golf** (built): two more modeling modes on the
   macro path. See "Reverse Engineer and Feature Golf" above.
5. **GD&T and Tolerance and Spot the Error** (built): the last two knowledge
   modes, web-only and answer-graded like Drawing Reading. **All six modes now
   ship.** See "GD&T and Tolerance and Spot the Error" above.
6. **The authoring tool** (built): admins create and manage challenges from the
   browser, replacing hand-edited SQL seeds. See "Authoring" above.
7. **Live rooms** (built): host-controlled synchronized Speedrun sessions. See
   "Live Rooms" above.

## What happened after `0027` (added 2026-08-29)

The document above stopped at `0027`. These are the GAUNTLET migrations that
landed afterwards, in apply order, so a reader can tell at a glance whether a
subsystem they care about moved. The two at the end are not GAUNTLET migrations
and changed GAUNTLET's meaning anyway, which is exactly why they are easy to
miss.

| Migration | What it changed |
| --- | --- |
| `0028` | Rooms: a short 4-character join code, and the host races too |
| `0029` | Dropped the Speedrun `tier` concept entirely; `prompt->>'tier'` stripped from every challenge and the records board flattened |
| `0030` | `unit_system` made authoritative and enforced on the macro submit path -- **and then un-enforced by `0034`** |
| `0031` | The public `gauntlet-tools` bucket, for the compiled add-in build |
| `0033` | `gauntlet_speedrun_attempts`: every attempt persisted, including abandoned ones, plus the history view `/gauntlet/speedrun/history` reads |
| `0034` | **Ranked verification is volume only.** Removed the material-name (`0026`), material-density (`0027`) and document-unit (`0030`) gates |
| `0035` | Append-only telemetry `gauntlet_run_events` + the materialized `gauntlet_run_analysis` summary, both written by the add-in, fail-safe |
| `0036` | Default volume tolerance 0.5% -> **0.1%** |
| `0060` | Row-scoping fix for the two room views; asserts none of the three owner-privileged GAUNTLET views is readable by `anon` |
| `0061` | `gauntlet_macro_submit` and `gauntlet_run_targets` stop returning the ranked comparison value; coarse unsigned band instead; a failing solo submit costs one of 3 budgeted attempts per reveal |
| `0038` | Not a GAUNTLET migration: recreates `gauntlet_leaderboards()` (last defined in `0029`) for the pathway work |
| `0067` | Not a GAUNTLET migration: redefines `is_teacher()` as `is_admin()`, re-gating **every** GAUNTLET authoring, hosting and moderation check at once. See the header |
| `0146` | Admits Reverse Engineer and Feature Golf to `gauntlet_speedrun_reveal` and `gauntlet_leaderboard`. Its own comment on why Speedrun's board is safe to admit is wrong -- see the correction directly below the table |
| `0147` | `gauntlet_run_targets` and `gauntlet_macro_submit` stop returning the ranked comparison value on the RPC surface; a coarse unsigned band instead. Left the `challenges` SELECT surface (the `prompt` column, `0004`) untouched -- see `0153` |
| `0148` | Server-stamps a clock for the knowledge modes, so their board stops ranking a number the browser sent |
| `0149` | Not a GAUNTLET-only migration: a `public`-wide grant-surface reconciliation. Its GAUNTLET slice revokes `anon` from `gauntlet_speedrun_attempt_history`, `gauntlet_leaderboard`, `gauntlet_room_board` and `gauntlet_room_roster`, all four of which had been reachable by `anon` since the view creating them, on the hosted-project default-privileges defect `0060` first found and never generalized |
| `0150` | Gives the post-run analysis a class comparison the database can disclose; retires the dead `gauntlet_log_speedrun_attempt` logger |
| `0151` | Meters the Speedrun practice check per student per challenge, so hammering it for a free search is visible and bounded. **Also silently reverts `0148`'s knowledge clock fix if applied over it** -- see "Applied vs. queued" below |
| `0152` | `gauntlet_run_review`: a ranked-run forensics report (telemetry event/snapshot counts, feature-add cadence, observations like a fast finish with no telemetry) for `/gauntlet/run-review`, admin only. A REPORT, not a gate -- it ranks nobody and refuses nothing; four measured facts in its own header rule out making it a play-time gate instead |
| `0153` | Strips `target_mass`, `density` and `tolerance_pct` off the stored `prompt` on every existing row. This is what actually closes the `0004` SELECT-grant disclosure `0061` and `0147` each left open in their own headers |
| `0154` | **Changes what a student sees on the board.** A knowledge row (Drawing Reading, GD&T and Tolerance, Spot the Error) ranks only if `is_correct = true`, closing an asymmetry the modeling branch never had. A modeling run ranks only if its server-stamped clock is at least 30 seconds. No row is deleted -- both are narrowings of `gauntlet_leaderboard`'s WHERE clause, so applying this removes rows that currently hold a seat, including possibly rank 1 |
| `0155` | `gauntlet_authors` / `gauntlet_can_author()`: a third tier, narrower than admin, granting GAUNTLET challenge authoring, publishing and room hosting without granting `is_admin()`. Re-gates the eleven sites listed in CLAUDE.md's "GAUNTLET AUTHOR TIER" section; the four student-work reads, `gauntlet_run_review` (`0152`) and `gauntlet_practice_meter` (`0151`) are deliberately left on `is_admin()`. See CLAUDE.md for the tier's full shape -- this file does not restate it |

### Applied vs. queued, and why that distinction matters here

**Everything from `0151` through `0155`, plus `0157` (a Coin-economy migration,
not GAUNTLET), is QUEUED -- written, pushed, and NOT yet pasted into the live
project** as of the 2026-08-29 sweep recorded in
`docs/history/anon-coin-public-projections-mrlg0d-queued-migration-sweep.md`.
`0149` and everything before it in the table above is applied. **This is a
measurement, not a standing fact** -- migrations here are applied by hand and
separately from a deploy, so check a live catalog read (`supabase migration
list --linked`, or `select version from supabase_migrations.schema_migrations`
if that table exists on this project) rather than trusting a snapshot in a doc
that nothing keeps current.

Two consequences worth knowing before reading the sections below as describing
today's board or today's authoring surface:

- **The board students see today still holds every wrong knowledge answer and
  every under-floor modeling run that `0154` would remove.** A reader taking
  `0154` as live will reason about a leaderboard that no longer has its old
  rows; it does.
- **`0155`'s author tier is not live.** `canAuthorGauntlet` (the app-side
  check) degrades on `PGRST202` to `isAdmin`, so today the only person who can
  author a GAUNTLET challenge or host a room is an `app_admins` row, exactly as
  before this migration was written -- see CLAUDE.md's "GAUNTLET AUTHOR TIER"
  for the app-side mechanics.
- **`0151` is not safe to paste over `0148` as it stands.** The same sweep
  found `0151` was diffed against `0147` and silently drops `0148`'s
  server-stamped-clock fix for the knowledge modes, reopening the exploit
  `0148` closed. `tests/gauntlet-knowledge-clock.test.ts` documents this on a
  chain that stops at `0148` on purpose. Whoever applies `0151` needs to fix
  that regression first or bring `0148`'s clock block over by hand.

**CORRECTED 2026-08-29: `0146`'s own comment overstates why admitting Speedrun
to `gauntlet_leaderboard` was safe, and the migration is applied and immutable
so this correction lives here instead.** `0146`'s view definition says Speedrun
"ranks on a SERVER-STAMPED clock ... and its client-sent volume only has to
hit a hidden target, so neither half is authorable." At the time `0146` was
written the target was not hidden: `challenges.prompt` carried `target_mass`,
`density` and `tolerance_pct` on every published Speedrun row, and `0004`
grants `select` on `prompt` to every signed-in student. One ordinary PostgREST
read, with no reveal and no run token, handed over the ranked comparison
value directly (see `0153`, above). The clock half of `0146`'s claim holds --
`started_at`/`revealed_at` are server-stamped and not client-authorable -- but
the volume half did not, until `0153` closed it. Whether the board should have
admitted Speedrun before that closure is a question for whoever reviews the
runs already ranked; this note only corrects the reasoning `0146` recorded.

## Written and not read (audited 2026-08-29, unchanged)

Three things exist, are correct, and reach nobody. They are recorded here
because "it is already built" and "a student can see it" are different claims,
and the gap between them is invisible from the code.

- **`gauntlet_log_speedrun_attempt` is DEAD.** `0033` defines it and grants it
  to `authenticated`; **nothing calls it** -- not the app, not the macros, not
  the add-in, not another function. The attempt history it was meant to feed is
  populated by `gauntlet_attempt_from_submission` and
  `gauntlet_attempt_from_token` instead, which is why nobody noticed. It is
  removable.
- **`gauntlet_run_analysis` is HALF-BUILT: written, never read.** The add-in
  posts to `gauntlet_run_analysis_upsert` (`GauntletClient.cs`), the table has
  RLS with an own-row read policy and a `select` grant to `authenticated` -- and
  **no query anywhere in `src/` selects from it.** The post-run screen derives
  everything it shows from the raw `gauntlet_run_events` stream instead, so the
  materialized summary that exists to make history and leaderboard reads fast is
  accumulating one row per run and serving none of them. The read side is the
  missing half, not the write side.
- **`PostRunAnalysis`'s learning curve and class-median comparison are
  HALF-BUILT.** The component takes `selfHistory` (the student's prior attempts
  on this level) and `classStats` (class medians) and renders real comparisons
  from them. **The only caller that passes either is `/dev/run-analysis`**, the
  dev harness. The production mount at `src/routes/gauntlet/speedrun/[id]/+page.svelte`
  passes `events` and `targets` only, so both props take their empty defaults and
  the two comparisons degrade to nothing. A student has never seen either.
  Everything needed to finish it is already in the schema -- `0033`'s attempt
  history is the self-history, and the medians are an aggregate over it -- so
  what is missing is a load, not a feature.

## Out of scope (later prompts)

Coin payouts (last), multi-round rooms, and rooms for modes other than Speedrun.
The room schema can accept multi-round and other modes; do not build them early.
