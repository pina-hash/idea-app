# IDEA // GAUNTLET, design doc

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
- **Teachers** (the existing `profiles.role`) author challenges, gated by RLS.
  Any future staff cross-user write (for example a teacher entering a student's
  measured mass) routes through a SECURITY DEFINER RPC, never a direct client
  write.

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
- **Machine submit (ranked).** `gauntlet_macro_submit(code, volume_mm3,
  surface_area_mm2, feature_count, mass_g)` is a SECURITY DEFINER RPC the macro
  posts to via PostgREST with the **public anon key** (not a user session); the
  submit code is the credential, so it is granted to `anon`. It validates the
  code (exists, unused, unexpired), resolves user/challenge/`reveal_at`, computes
  **elapsed = now() - reveal_at** (server-stamped, so there is no client clock to
  tamper with), verifies correctness **on volume**
  against `target_volume_mm3` within tolerance (never a client correctness flag),
  marks the code used, and records a submission with `source = 'macro'`,
  `score_metric` = elapsed, and volume/area/feature_count/mass in `value`.
  Returns pass/fail, elapsed, and rank.
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
  own rows; the handler also checks `user_id` because teachers can read all), so
  the macro's result and the updated board appear automatically. A manual Refresh
  is the fallback.
- **The macro doubles as the authoring capture tool.** `static/gauntlet/`
  `idea-gauntlet-speedrun.bas` reads mass properties in SI (`UseSystemUnits =
  True`), normalizes to mm3 / mm2 / g, and reads the feature count. **Student
  submit** posts a run; **Author capture** prints canonical
  `target_volume_mm3` / `surface_area_mm2` / `feature_count` / `mass_g` (from a
  prompted density) for seeding real challenges. The endpoint URL + public anon
  key are clearly-marked constants at the top (not secrets). It is linked from
  the Speedrun screen and `/gauntlet/tools`.
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
- **Demo seeds.** Two to three placeholder Speedrun challenges are seeded with
  internally consistent dummy values (`target_mass = target_volume x density`,
  `target_volume_mm3 = target_volume_cm3 x 1000`) and a clearly-labeled
  placeholder drawing, marked `demo`. Real challenges are authored from actual
  SolidWorks parts with the macro's Author capture mode.

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
`hooks.server.ts` (a new gated tier alongside the teacher-only dashboard). It
uses the app-shell side of the IDEA Green design system (not the legacy-index
landing theme), with a small `.gauntlet`-scoped block in `app.css`.

- `/gauntlet`: the dojo landing (identity + progression) and a mode-select grid
  of all six modes. Role-aware: teachers see the authoring entry point.
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
- `/gauntlet/tools`: download + setup for the SolidWorks capture macro.
- `/gauntlet/author`, `/gauntlet/author/new`, `/gauntlet/author/[id]`: the
  teacher-only authoring tool (see "Authoring" below).

## Authoring

The web authoring tool (`0009_gauntlet_authoring.sql`) replaces hand-edited SQL
seeds: teachers create, edit, publish, and delete challenges across all six
modes from the browser. The seeds still work; this supplements them and is how
the demo placeholders get replaced by real captured parts.

- **Status lifecycle.** A `status` column (`draft` | `published` | `archived`)
  is the authoring source of truth; new challenges default to **draft**. The
  existing `published` boolean is now a **trigger-derived** column
  (`published = status = 'published'`), so every existing RLS policy, the
  leaderboard view, the play RPCs, and the published-filtered list queries keep
  working unchanged. **Students only ever see published** (drafts and archived
  have `published = false`); teachers see and can test drafts via the teacher RLS
  read policy.
- **Server-side writes only.** Direct client INSERT/UPDATE/DELETE on
  `challenges` is revoked. All writes go through SECURITY DEFINER RPCs that
  re-check `is_teacher()`: `gauntlet_author_upsert` (create/edit),
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
- **Assets.** A public Storage bucket `gauntlet` holds uploaded drawings and
  reference images (teachers upload; everyone reads via the public URL). The
  asset can also be pasted inline SVG. It is written into the same payload slot
  the play screens already read (`prompt.drawing` for knowledge,
  `prompt.reference` for Reverse Engineer, the hidden `answer.drawing` for
  Speedrun / Feature Golf). Gated drawings keep their reveal-on-start property:
  the URL lives in the hidden `answer` column on a random, unguessable path, so
  only the reveal RPC hands it back. A shared `Asset.svelte` renders an asset as
  inline SVG or an `<img>` by sniffing the leading `<`.
- **The capture workflow.** Modeling challenges get real geometry from the
  macro's **Author capture** mode: a teacher models the canonical part, runs the
  macro in Author mode, and pastes the printed values
  (`target_volume_mm3` / `surface_area_mm2` / `feature_count` / `mass_g`) into the
  form's paste box. This is the supported path to replace the demo placeholders.

## Build order

All six modes ship eventually. The sequence:

1. **Drawing Reading** (built): the first end-to-end mode, plus the shell,
   the full data model, and the leaderboard mechanism.
2. **Speedrun** (built): the flagship modeling mode, on manual mass entry first.
   See "Speedrun" below.
3. **The VBA macro** (built): the SolidWorks capture macro, now the ranked path
   for Speedrun (server-authoritative timing, volume verification). See
   "Speedrun" below.
4. **Reverse Engineer and Feature Golf** (built): two more modeling modes on the
   macro path. See "Reverse Engineer and Feature Golf" above.
5. **GD&T and Tolerance and Spot the Error** (built): the last two knowledge
   modes, web-only and answer-graded like Drawing Reading. **All six modes now
   ship.** See "GD&T and Tolerance and Spot the Error" above.
6. **The authoring tool** (built): teachers create and manage challenges from the
   browser, replacing hand-edited SQL seeds. See "Authoring" above.
7. **Live rooms**: synchronous head-to-head play.

## Out of scope (later prompts)

Live synchronized rooms, and coin payouts last. Do not build them early.
