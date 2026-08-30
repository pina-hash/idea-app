---
title: "FRC Training track"
date: 2026-07-05
branches: []
migrations: ["0039", "0040", "0041", "0042"]
subsystems: ["FRC / FSP / feedback"]
record_order: 68
---

The Team 5669 FRC training track at `/frc`. Signed-in tier, any role; the
whole track is open access and **pathway is identity, never a gate**, nothing
in the track may wall off content by pathway. Structure, theme, two domains'
unit content (CAD and Mechanical Design's sixteen units, Foundation's F1), a
real per-user progression backbone, and the knowledge-quiz auto-gate are live;
the remaining gate engines (GAUNTLET) and the rest of Foundation's units are
still deferred.

- **Registry:** `src/lib/frc/track.ts` (plain data, client-safe, like
  `curriculum.ts`): `FRC_TEAM`, the seven domains (Foundation, CAD and
  Mechanical Design with its sixteen units, Mechanisms and Prototyping,
  Programming and Controls, Strategy and Scouting, Drive Team, Capstone), the
  grouped reference shelf (`FRC_REFERENCES`), and the progression RULES kept in
  this one place: each unit's stable `id` (e.g. `MDM-1`) and `prerequisite`
  (the sequential unlock chain), the pure `unitState(unit, completedSet)`
  (locked until its prerequisite is complete, available once it is / for the
  first unit, complete when its own id is in the set), and the rank ladder
  (`FRC_RANKS` thresholds + `rankForCount` / `completedCadCount` / `frcRank`:
  Rookie 0, Technician 3, Builder 6, Engineer 10 completed CAD units, tune the
  thresholds here). A domain may declare `contentSet: 'mdm'` or
  `'foundation'` to mark that its units resolve to real per-unit pages (each
  content set is its own authored seed + parsed unit list; see the Foundation
  bullet below for how a second content set was added without introducing any
  cross-domain coupling).
- **Progression backbone (0039, locked down in 0041):** per-user unit
  completion in `frc_user_progress` (`(user_id, unit_id)` PK + `completed_at`),
  keyed by the registry unit ids. Students and teachers keep the 0039 SELECT
  policies (own rows / all rows via `is_teacher()`); **direct client writes are
  revoked entirely** (0041 drops the old insert/delete policies and revokes
  `insert, update, delete` from `authenticated`), so a student has no write
  path of their own, full stop. `src/lib/frc/progression.ts` is the client
  seam: `markUnitComplete(supabase, userId, unitId)` / `clearUnitComplete` are
  now THIN CALLERS of the `frc_mark_complete` / `frc_unmark_complete` SECURITY
  DEFINER RPCs (0041), and those RPCs enforce `is_teacher()` INSIDE the
  function body regardless of whose id is passed — so these two functions are
  the teacher-override seam only; calling them as a student (even for your own
  id) returns `{"error":"forbidden"}` and writes nothing. `loadUserProgress` /
  `loadProgressForUsers` still read directly (fail-soft to empty /
  `ready:false` if a migration is unapplied, like the pathway migration).
  `/frc/+layout.server.ts` loads the student's completed set + rank once for
  every /frc page; `FrcRankBadge.svelte` shows the rank on the track view hero
  (`size=lg`) and beside the profile in the shell header (`size=sm`);
  `DomainLanding` takes the `completed` set and renders the real available /
  complete state (plus a "suggested later" hint, see "Open learning access"
  below).
- **Teacher completion override:** the dashboard (`/dashboard`) roster gains a
  per-student "FRC completion" disclosure (`FrcUnitOverride.svelte`, a
  presentation-only toggle grid driven by one callback so it is harness-
  testable) that marks/unmarks the CAD content units via markUnitComplete /
  clearUnitComplete + `invalidateAll`. UI gating (the dashboard route is
  teacher-only) is convenience; the real authority is `is_teacher()` inside the
  RPCs themselves (0041). Fails soft with an "apply migration 0039" note when
  the table is absent.
- **Open learning access + teacher "view as student" (batch):** no unit is
  ever read-locked. `unitState()` (`track.ts`) still computes
  locked/available/complete, but it is DISPLAY/ORDERING ONLY now: a "locked"
  unit renders as a "Suggested later" badge with a "Suggested after &lt;prior
  unit&gt;" hint, never a non-link card, so `DomainLanding` links every
  content-backed unit regardless of prerequisite completion (nothing in
  `[unit]/+page.server.ts` ever gated reading either; the old block was
  discoverability only, in `DomainLanding`). Gates still record real
  completion for rank exactly as before. A teacher gets a "View as student"
  toggle in `FrcShell`'s header (visible only when the signed-in profile's
  role is `teacher`; the dev harness simulates it via a `teacherOverride` prop,
  mirroring the existing `rankCount` override pattern), backed by
  `FrcViewContext` (`track.ts`: `FRC_VIEW_CONTEXT_KEY`, `isTeacher` /
  `viewAsStudent` / `showOverride`) set once in `FrcShell` via Svelte context
  (so the toggle survives navigation between /frc pages, since the layout
  stays mounted) and read by any descendant page. When on, a banner reads
  "Previewing the track as a student sees it" and all teacher-only chrome
  hides. `DomainLanding` self-derives `showOverride` from that context (an
  explicit prop still overrides it, again the `rankCount` pattern) and, when
  true, renders a dark "Teacher tools · your account" panel above the CAD
  unit list: `FrcUnitOverride` reused in-track (not just the dashboard) so a
  teacher can mark/unmark their OWN completion to preview progress states
  without leaving the track; the real route wires it to
  `markUnitComplete`/`clearUnitComplete` against `claims.sub`. The quiz gate
  itself (`gate?.enabled`) was never role-gated, so it already worked for a
  teacher's own account; this batch only ensures `DomainLanding` never hides
  the path to it. The `/dev/frc` harness's "Simulate teacher" checkbox drives
  `FrcShell`'s `teacherOverride` prop end to end (real context, real toggle,
  fake completion handler) so this is verifiable without Supabase.
- **Knowledge-gate quiz (0040; MDM-1, 2, 3, 9, 10):** the auto-gate, built
  SERVER-AUTHORITATIVE so the answer key never reaches the client. It serves a
  PER-UNIT item bank: MDM-1 from `src/lib/server/frc/mdm-1-quiz-bank.json`, and
  MDM-2 / MDM-3 / MDM-9 / MDM-10 from the `banks` map in
  `src/lib/server/frc/mdm-quiz-banks.json` (both under `$lib/server`, so
  SvelteKit never bundles them client-side; each bank is a pool larger than its
  `testLength` with per-item options + answer index, plus its own `passPercent`,
  90 across the board; MDM-1 draws 10 questions, the others 6).
  `src/lib/server/frc/quiz-engine.ts` holds the pure logic: `getQuizBank(unitId)`
  resolves the unit's bank (MDM-1 + the shared map spread into one `BANKS`
  record), then `pickAttempt` selects that bank's `testLength` items at random,
  shuffles each item's options, splits the correct index into a server-held
  `sealed` key, `gradeAttempt` is the CANONICAL grader mirrored by the SQL RPC,
  `cooldownState` derives the cooldown, and `missedTopics(tags, objectives)`
  names missed objectives (MDM-1's curated `TOPIC_NAMES` first, then the serving
  bank's own `objectives` descriptions, so the naming stays co-located with each
  bank). `quiz-service.ts` orchestrates start/submit over a `QuizStore`
  interface, keyed by unit id throughout. The `frc_quiz_attempts` table (0040)
  is ALREADY per-unit (each row carries `unit_id`, `sealed`, `pass_percent`), so
  no migration change was needed to add units: `frc_quiz_start(p_unit_id,
  p_sealed, p_pass_percent)` persists the attempt, and `frc_quiz_grade` reads the
  unit/key/threshold off the attempt row it grades. The `sealed` key column has
  NO client SELECT grant, and grading runs inside the `frc_quiz_grade` SECURITY
  DEFINER RPC (mirrors `gradeAttempt`) so answers never leave the server. RLS
  mirrors the pattern (student reads/inserts own via the definer RPCs, teachers
  read all). The unit endpoint `POST /frc/[domain]/[unit]/quiz` (start | submit)
  takes the unit from the route (`params.unit` -> `getQuizBank`), enforces the
  ESCALATING cooldown (schedule `FRC_QUIZ_COOLDOWNS_SEC` /
  `cooldownSecondsForFailStreak` in track.ts, tunable; a pass clears the streak)
  before issuing an attempt, serves only stems + shuffled options on start, and
  grades on submit; on a FAIL it returns only the missed TOPIC names + the
  cooldown remaining, never answers. **Completion recording (0041):** on a PASS,
  `frc_quiz_grade` records the completion ITSELF, inline, in the same SQL
  transaction as grading — it derives the unit id from the attempt row it just
  graded and the user id from `auth.uid()` (never a client-supplied parameter),
  so the only way a student reaches a `frc_user_progress` row is by actually
  passing the held answer key; it does not call `frc_mark_complete` (that RPC
  is teacher-only), it writes directly as its own SECURITY DEFINER owner. The
  SvelteKit endpoint's `onPass` hook is therefore a deliberate no-op.
  `FrcQuizGate.svelte` is the unit-page UI (Start -> questions -> submit ->
  pass/next-unlocked or fail/missed-topics/cooldown), FRC-themed; it needs no
  unit id of its own because the endpoint URL encodes the unit. UnitPage shows
  it when the server load reports `gate.enabled` — true for any unit with a bank
  (MDM-1, 2, 3, 9, 10); the modeling-gate units (MDM-4 through MDM-8) have no
  bank, so `getQuizBank` returns undefined and they keep the description-only
  Gate. The unit seed metadata sets `gate: quiz` for MDM-1/2/3/9/10 (display
  label only; the real enable is `getQuizBank`). `+page.server.ts` computes the
  gate state from that unit's bank (readiness, unit-complete, cooldown
  remaining) and fails soft to the description-only Gate if 0040 is unapplied.
  The dev mock endpoint `/dev/frc-quiz` takes `?unit=` (default MDM-1) so the
  `/dev/frc` harness can exercise every quiz unit's bank without a live DB.
- **Progress lockdown (0041):** closes the self-mark hole the 0039/0040 caveat
  flagged: a student could previously insert their own `frc_user_progress` row
  directly via PostgREST (the 0039 own-row write grant), bypassing every gate.
  0041 revokes that grant, drops the old student-write policies, adds the
  teacher-only `frc_mark_complete` / `frc_unmark_complete` RPCs described above,
  and recreates `frc_quiz_grade` to write completion inline. See the SQL file's
  header comment for the full before/after.
- **Modeling-gate submissions + review queue (0042; MDM-4 through MDM-8):** the
  auto-gate for the five MODELING units (the counterpart to the knowledge quiz
  gate). A student submits a link to their pack-and-go / model plus notes; a
  teacher reviews it on the dashboard and, on approval, completes the unit
  through the EXISTING `frc_mark_complete` RPC. **The table never writes
  completion itself** (no trigger, no completion RPC): approval completion is a
  separate teacher call to `frc_mark_complete`, the single completion-write
  path. `frc_gate_submissions` is keyed `(user_id, unit_id)` with `link`,
  `notes`, `status` (`submitted` | `approved` | `needs_revision`),
  `reviewer_feedback`, and submitted/reviewed timestamps. Personal-data RLS on
  the own-row pattern (0039/0040): a student reads + writes their OWN row, but
  the INSERT/UPDATE `with check` pins their `status` to `'submitted'` (so a
  student can never self-approve) and the UPDATE `using` requires
  `status <> 'approved'` (so they may resubmit only while not yet approved);
  teachers read all and update status + feedback. `src/lib/frc/gate-submissions.ts`
  is the client seam (`loadSubmission`, `loadPendingSubmissions`, `submitGate`
  as an RLS-guarded upsert, `approveSubmission` = `markUnitComplete` THEN row
  update, `requestRevision`), all fail-soft (`ready:false` if 0042 is
  unapplied). The unit page's `+page.server.ts` computes a `modelGate` (own
  submission + unit-complete) for any unit whose gate is `gauntlet:*` and which
  has no quiz bank; `FrcModelGate.svelte` renders the submit form / awaiting /
  needs-revision (with mentor feedback + resubmit) / approved-complete states,
  with an apply-migration note when `ready` is false. `FrcQuizGate` and the five
  quiz gates (MDM-1/2/3/9/10) are unchanged. The dashboard shows the pending
  queue (`FrcReviewQueue.svelte`, presentation + callbacks like
  `FrcUnitOverride`): student, unit, link, notes, submitted time, with Approve
  (→ `frc_mark_complete` + next unlocks) and Request-revision (feedback)
  actions; the per-student completion override stays as the manual fallback
  (and the sole path when 0042 is unapplied). The `/dev/frc` harness "Model
  gate" view drives the whole submit → review → approve/revision loop over an
  in-memory store (student panel + teacher queue on one page), with a
  "migration applied" toggle for the fail-soft note. **Migration 0042 must be
  applied manually in Supabase** (after 0039/0040/0041).
- **Unit content (CAD and Mechanical Design):** the ten authored units MDM-1
  through MDM-10 live in the repo-root seed `mdm-content-seed.md` (the single
  source of truth: plain `key: value` frontmatter + `## Brief`/`## Drill`/
  `## Gate`/`## Apply` sections, units split by `===`). `src/lib/frc/mdm-content.ts`
  parses it at build time via a `?raw` import (the established legacy-loader
  convention) into a typed `MdmUnit[]`; edit the markdown, never the parsed
  module. The parser adds LIGHT MARKDOWN to each Brief paragraph:
  `markupBriefParagraph` bolds a paragraph's opening sentence when it reads as
  a short label (8 words or fewer, empirically the line between the seed's
  short lead sentences like "Define the problem." and its longer intro/closing
  prose) and prefixes the "Worked example" paragraph with a `> ` blockquote
  marker; `src/lib/frc/inline-markup.ts` is the renderer (`renderInline` turns
  `**bold**` into `<strong>` and inline `[label](url)` spans into external
  links after escaping, matching the reference shelf's external-link handling
  exactly: opens in a new tab, `rel="noopener noreferrer"`;
  `isBlockquote`/`stripBlockquote` detect the blockquote marker), used by
  `UnitPage.svelte` to show the worked example as a distinct FRC-themed
  callout. A handful of Briefs (MDM-2, MDM-3, MDM-7, MDM-8, MDM-9) carry an
  inline `[label](url)` "see it" reference to a real vendor page, written
  directly into the seed prose (no separate token or component, unlike the
  `[[diagram:...]]` token). `drillAnswers` is an array aligned to `drill`
  (not a single consolidated string): `splitConsolidatedAnswers` splits a
  trailing "Answers: 1. ... 2. ..." block per question (all ten authored
  units, MDM-1 through MDM-10, have one). **Drill is active-retrieval
  practice, not a passive reveal** (`FrcDrillPhase.svelte`, client-side only,
  no persistence): each question is a typed attempt box ("Write your answer
  from memory") with a "Check answer" button disabled until the student has
  typed a non-empty response, so the model answer cannot be seen before an
  attempt; checking reveals the model answer in a distinct FRC-themed panel
  directly below the attempt, with "I had it" / "Review this" self-mark
  buttons. A "N of M checked" progress line sits above the question list. All
  of this is local `$state` (attempts/checked/marks arrays) reset by an
  `$effect` keyed off the `unit` prop reference (`MDM_UNITS` is a stable
  module-level array, so `unit` only changes reference on a real navigation
  to a different unit, which is exactly when the practice state should
  clear). A question with no parsed answer still shows the attempt box, and
  once checked shows a plain "Model answer not yet added" note instead of a
  fabricated answer. This is now the FALLBACK drill for units with no
  interactive drill bank (MDM-4 through MDM-8; see the interactive-drill
  bullet below for MDM-1/2/3/9/10). Units MDM-11 through MDM-16 have no seed
  content yet and render as non-clickable "In development" placeholders on
  the domain page.
- **Foundation domain, all five units (F1-F5) live:** the second content set,
  proving the whole system (content model, phase machinery, both bank maps,
  the unit route) generalizes to more than one domain with NO cross-domain
  coupling introduced. `foundation-content.ts` parses the repo-root
  `foundation-content-seed.md` with the EXACT SAME `parseSeed` parser as the
  CAD content (exported from `mdm-content.ts` for reuse), into `FOUNDATION_UNITS`
  (F1 "Welcome to FRC", F2 "How a Season Runs", F3 "Safety in the Shop", F4
  "The Engineering Design Process", F5 "The Engineering Notebook", `===`-
  separated in one seed exactly like the CAD units) plus
  `foundationUnitByNumber` / `foundationUnitById`. Each unit's quiz bank lives
  under its own key (`F1` through `F5`) in the shared server
  `mdm-quiz-banks.json` (the filename predates F1; it is not MDM-exclusive)
  and its interactive drill bank under the same key in the shared client
  `mdm-drill-banks.json`, so `getQuizBank`/`getDrillBank` resolve every
  Foundation unit exactly like any MDM knowledge unit, and each runs the
  identical four-phase flow (interactive scored drill gates a server-graded
  quiz at 90 percent, which unlocks Apply). The registry (`track.ts`) gives
  Foundation `contentSet: 'foundation'` and five units with a sequential
  suggested-order chain (F2 after F1, ... F5 after F4), same convention as
  CAD; this was already generalized when F1 landed (the `FOUNDATION_UNIT_TITLES.map`
  already produced the right prerequisite chain for all five), so adding
  F2-F5's content needed NO registry code change, only the seed + bank data.
  Two call sites that used to hardcode `contentSet === 'mdm'` were generalized
  to resolve by domain: `DomainLanding`'s `hasContent()` (now checks `mdm` or
  `foundation`) and the unit route's `[domain]/[unit]/+page.server.ts` (a
  small `CONTENT_SETS` map from `contentSet` to `{ units, byNumber }`, so
  `prev`/`next` stay scoped within the resolved domain's own unit list — no
  cross-domain prerequisite or navigation was added). `FrcQuizGate`'s "all
  cleared" copy was generalized from "All CAD units cleared" to "All units in
  this domain cleared" since it is a shared component now genuinely reached
  from two domains. The `/dev/frc` harness's "Quiz gate" view keys its picker
  on unit id (not a bare number, since e.g. F1 and MDM-1 both have `n: 1`) and
  resolves the right domain/unit list per id, so every Foundation unit's full
  flow is verifiable without Supabase; the "Placeholder domain" view points at
  `mechanisms-prototyping` (still genuinely empty) since Foundation itself no
  longer has any placeholder units.
- **Interactive scored drill (MDM-1, 2, 3, 9, 10):** the repo-root
  `mdm-drill-banks.json` (a `banks` map keyed by unit id, parallel to but
  distinct from the server-only quiz banks) holds `order` (arrange a shuffled
  sequence), `match` (pair a shuffled right column to the left column), and
  `pick` (scenario multiple choice with feedback) items, plus a
  `readinessPass` percent. `src/lib/frc/drill-banks.ts` imports it directly
  (a plain JSON import, no `?raw`; unlike the quiz banks this content is
  MEANT to be visible client-side — it is coached practice, not a graded
  gate) and exposes `getDrillBank(unitId)` + a `shuffled()` Fisher-Yates
  helper; `UnitPage.svelte` picks `FrcInteractiveDrill.svelte` over
  `FrcDrillPhase.svelte` for any unit `getDrillBank` resolves. Every item type
  supports check -> see right/wrong -> retry (editing invalidates the last
  check, so re-checking is the retry, no separate button): `order` shows the
  sequence shuffled with up/down move controls per row, highlighting each row
  correct/incorrect on check; `match` shows the right column shuffled as a
  `<select>` per left row, highlighting each pairing on check; `pick` reveals
  correct/incorrect AND the authored `feedback` text the instant an option is
  selected, and also highlights the true correct option once any pick is
  made. Readiness is scored on FIRST-TRY correctness ONLY: each item's
  `firstTryCorrect` locks in on its first check/selection in the run and
  retries afterward never raise it, they only help the student learn. Once
  every item has been attempted, a readiness percent shows; at or above
  `readinessPass` a "Continue to quiz" unlocks the Quiz phase (there is
  deliberately no "continue anyway" bypass for these five units, unlike
  `FrcDrillPhase`'s write-from-memory drill); below it, the Quiz stays locked
  and the student gets "Review the Brief" (goes back, does not unlock) and
  "Redo the drill" (`resetDrill`, reshuffles order/match content and clears
  all scoring for a fresh run). All state is local `$state`, client-side and
  per-mount, reset by an `$effect` keyed on `unit.id`/`bank` — no schema, no
  persistence, no server.
- **Unit page: four sequential, gated phases (Brief, Drill, Quiz, Apply).**
  `UnitPage.svelte` no longer shows every section at once; `FrcPhaseStepper.svelte`
  renders the four phases as done / current / locked and is the only way to
  move between them (a locked phase's button is disabled; an unlocked one can
  always be reopened to review — reopening a phase remounts its component
  fresh, since each phase is a separate `{#if}` branch, so a unit's own Drill
  or Quiz progress does not survive navigating away and back within the same
  visit; this is a pre-existing property of the phase system, not specific to
  either drill). Brief -> Drill is the STUDENT'S OWN CHOICE, never a graded
  gate: Brief ends with a "Continue to drills" button. Drill -> Quiz is
  either that same free choice (`FrcDrillPhase`'s self-marked readiness
  summary, MDM-4 through MDM-8) or an earned unlock (`FrcInteractiveDrill`'s
  scored readiness gate, MDM-1/2/3/9/10; see above). The Quiz phase is the
  Gate section alone, no Brief/Drill visible: FrcQuizGate for the five
  knowledge units, FrcModelGate for the five modeling units, unchanged
  grading/review/completion. Apply is locked (a padlock card, "Pass the quiz
  to unlock Apply") until the gate clears; a cleared unit's Apply then reads
  its normal content. State: `manualUnlock` (the student's own advance
  through Brief/Drill/Quiz) and `currentPhase` (which screen is open) are
  local `$state`, both client-side and per-mount — `unlockedThrough` is `3`
  the moment `gate.unitComplete` or `modelGate.unitComplete` is true,
  REACTIVELY (so the Apply tab lights up the instant a pass/approval lands),
  but `currentPhase` deliberately does NOT auto-jump to Apply on that same
  live transition, so the student stays on the Quiz screen to see
  FrcQuizGate's "Passed" or FrcModelGate's "Approved" result and opens Apply
  themselves. It DOES jump straight to Apply on a fresh mount of an
  already-cleared unit (a `$effect` keyed on `unit.id` alone, reading
  `gate`/`modelGate` through Svelte's `untrack` so a live pass/approval within
  the same mount can never re-trigger it), so revisiting a finished unit never
  makes the student re-click through phases already done.
- **Brief concept diagrams:** a Brief paragraph that is exactly a
  `[[diagram:KEY|caption text]]` token (its own paragraph, blank lines on
  both sides in the seed) renders as a centered, captioned figure instead of
  prose. `parseDiagram` (`inline-markup.ts`) matches the token; the five SVGs
  live in `src/lib/frc/assets/diagrams/` and are imported the same way
  `FrcShell` imports the FRC logo PNGs (plain `import x from '...svg'`, so
  Vite serves them as fingerprinted/inlined production assets, never a raw
  file reference), collected into the `DIAGRAMS` key->asset map in
  `src/lib/frc/diagrams.ts`. `markupBriefParagraph` (`mdm-content.ts`) passes
  a diagram token through untouched (never bolded or mistaken for a "Worked
  example" lead); `UnitPage.svelte` checks `parseDiagram(p)` before the
  blockquote/plain-paragraph branches and looks the key up in `DIAGRAMS`,
  rendering nothing (not an error) for an unknown key. The figure is a capped
  max-width `.frc-card`-style frame (thin border, light shadow) with the SVG
  scaling responsively to full width inside it, and the caption below in the
  same muted italic note style as `.gate-note`. Five diagrams are seeded:
  `design-process-loop` (MDM-1), `orthographic-views` (MDM-2),
  `shaft-stackup` (MDM-8), `clearance-vs-tapped` (MDM-9), and
  `clearance-vs-interference` (MDM-10), each placed right after the unit's
  first Brief paragraph.
- **Routes:** `/frc` (track home, one card per domain + the student's rank),
  `/frc/[domain]` (reusable domain landing: every content-backed unit links
  regardless of state, complete/available/"suggested later" is a badge only;
  units without content read "In development"; unit-less domains show a
  "content in development" block; unknown slugs 404), `/frc/[domain]/[unit]`
  (the per-unit
  page; only `contentSet: 'mdm'` domains and unit numbers with authored content
  resolve, else 404), `/frc/references` (the shelf, external links only).
  `src/routes/frc/+layout.svelte` wraps everything in `FrcShell.svelte`
  (header + nav + footer); `+layout.server.ts` supplies the progression data.
- **Branding: the official FRC logo (not a derivative mark).** The RGB
  FIRST Robotics Competition logo is shown UNMODIFIED: horizontal
  (`src/lib/frc/assets/frc-logo-horizontal.png`) in the header, compact
  vertical (`frc-logo-vertical.png`) in the footer, both alongside Team 5669's
  own identity (never replacing it). Brand rules are honored: never recolor /
  distort / stretch / crop (`width:auto` preserves the intrinsic aspect), and
  each logo carries transparent clear space at least the height of its icon so
  nothing crowds it. The old geometric derivative mark (`FrcMark.svelte`) is
  REMOVED. Single triangle / circle / square outlines may still appear as a
  light per-card accent (the full FRC logo is on the page), but never
  recomposed into a FIRST-logo lookalike. The footer carries the exact
  trademark line: "FIRST and FIRST Robotics Competition are trademarks of For
  Inspiration and Recognition of Science and Technology (FIRST)."
- **Theme (the FRC derivative), scoped to the track only:**
  `src/lib/frc/frc-theme.css`, everything under `.frc-root` (the FrcShell
  wrapper), deliberately distinct from VIEWPORT: clean light surfaces, FIRST
  Blue `#0066B3` primary chrome, FIRST Red `#ED1C24` for action/emphasis used
  sparingly, near-black `#231F20` ink, gray `#9A989A` muted. Type is Roboto
  (`@fontsource/roboto`), headers Roboto Bold Italic. **IDEA green `#00FF41`
  appears ONLY for the achievement state** (complete unit cards and completion
  markers, used as filled markers with ink strokes on the light surfaces)
  **plus the "An IDEA program" footer mark** on the dark footer strip; never
  in primary chrome. The `.frc-root` block also neutralizes app-shell globals
  that would leak (the green `// ` h2 prefix, the green link-hover glow), and
  sits opaque at z-index 1 so the portal's `.bg-fx` scanlines never show
  through. New token names (`--frc-*`) on purpose: shared components mounted
  inside (ProfileMenu, VersionBadge) keep their global dark-theme tokens.
- **Footer changelog:** `src/lib/frc/ChangelogFooter.svelte` reuses the
  existing build-time git substrate (`virtual:site-versions`), so it
  auto-populates from commit history with no manual upkeep. It is an
  unobtrusive `<details>` disclosure ("Changelog") that opens a short capped
  list (8) of recent entries, each a date + commit summary, styled to the FRC
  theme.
- **Entry points:** the homepage launcher card (`portal-apps.ts`, Class
  group, `requiresAuth`); its icon is the official FIRST icon (emblem only, no
  wordmark; `frc-icon.png`) composited onto the dark VIEWPORT card unmodified
  (`width:auto` keeps the aspect, sized to the same height as every other
  app-icon so the card's form factor matches its neighbors; a faint FIRST-Blue
  underglow + hover border read as FRC without breaking the green/gold look,
  card size + layout unchanged). Also the `frc` app in `site-manifest.ts` (own
  version badge + changelog filter; also claims `mdm-content-seed.md`), and the
  `/frc` prefix in `authedPrefixes`.
- **Dev harness:** `/dev/frc` (404 in production, no auth / Supabase) mounts
  the real FrcShell with a view switcher. The Progression view is interactive:
  it simulates a student completing units in-memory (toggle grid + quick
  rank-threshold buttons), so the domain landing's unlock states, the rank
  badge, and the teacher-override component all update live without a DB. The
  Quiz-gate view mounts the real UnitPage + FrcQuizGate against a dev-only mock
  endpoint (`/dev/frc-quiz`, 404 in prod) that runs the REAL engine + service
  over an in-memory store with a short cooldown, so the full flow and the
  no-answer-key network contract are verifiable without a live DB. The Unit
  page view has its own MDM-1..10 picker, so the Brief markdown and the Drill
  retrieval-practice flow (attempt, check, model answer, self-mark, and the
  "not yet added" state on a question with no authored answer key) can be
  checked on any unit. Other views: track home,
  CAD domain, a placeholder domain, and the reference shelf.

