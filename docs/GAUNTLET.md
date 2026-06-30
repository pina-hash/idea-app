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
`published`, `created_at`, `updated_at`, and the mode-specific JSONB payload.

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

## Shell

GAUNTLET is a new **auth-gated section**: any signed-in user (student or
teacher) may enter; anonymous visitors are redirected off `/gauntlet*` by
`hooks.server.ts` (a new gated tier alongside the teacher-only dashboard). It
uses the app-shell side of the IDEA Green design system (not the legacy-index
landing theme), with a small `.gauntlet`-scoped block in `app.css`.

- `/gauntlet`: the dojo landing (identity + progression) and a mode-select grid
  of all six modes. Built modes link in; unbuilt modes render as "coming soon."
  Role-aware: teachers see an authoring entry point (stubbed for now).
- `/gauntlet/drawing-reading`: the challenge list for the first mode.
- `/gauntlet/drawing-reading/[id]`: a single challenge, end to end (drawing +
  question, answer, submit, score, per-challenge leaderboard).
- `/gauntlet/author`: teacher-only authoring entry point, stubbed.

## Build order

All six modes ship eventually. The sequence:

1. **Drawing Reading** (this prompt): the first end-to-end mode, plus the shell,
   the full data model, and the leaderboard mechanism.
2. **Speedrun**: the flagship modeling mode, on manual mass entry first.
3. **The VBA macro**: replaces manual entry for ranked modeling play.
4. **The remaining modes**: Reverse Engineer, Feature Golf, GD&T and Tolerance,
   Spot the Error.
5. **Live rooms**: synchronous head-to-head play.

## Out of scope for the first prompt

Speedrun, the VBA macro, coin payouts, and the full authoring UI. The schema and
shell anticipate them, but they are later prompts. Do not build them early.
