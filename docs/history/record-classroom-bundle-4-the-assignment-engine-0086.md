---
title: "Classroom bundle 4: the assignment engine (`0086`)"
date: 2026-08-11
branches: []
migrations: ["0086"]
subsystems: ["IDEA Classroom"]
record_order: 59
---

Migration `0086_classroom_assignment_engine.sql` (apply manually after 0085):
file submissions on every assignment, spec-driven interactive assignments,
autosaved responses, rubrics, grading, and the approval gate. 0082's one rule
is untouched: ZERO client write grants on any classroom table, every write a
SECURITY DEFINER RPC re-checking the caller inside its own body. The spec
FORMAT is `docs/IDEA_MATERIAL_SPEC_v1.md` (committed this bundle) -- specs are
authored externally and imported, never hand-built in the app.

- **Two authority tiers, stated once.** Student RPCs
  (`classroom_save_response`, `classroom_add_submission_file`,
  `classroom_submit_assignment`, `classroom_unsubmit_assignment`, the file
  caption/delete pair) resolve the caller from `current_user_email()` with NO
  email parameter (the `classroom_mark_item_viewed` doctrine) and require
  ACTIVE enrollment in a section the PUBLISHED assignment is posted to -- so a
  teacher is refused from the student write paths by construction. Reviewer
  RPCs (`classroom_grade_submission`, `classroom_approve_module`) gate on the
  new `classroom_can_review_submission(item, email)`: the caller manages a
  section the item is posted to AND that the student is enrolled in. That
  scoping is the load-bearing boundary: a co-posted section's teacher never
  reaches a student who is not in THEIR class (test-pinned), and admins pass
  through `classroom_manages_section` as everywhere else.
- **Tables** (SELECT-only grants; RLS on all six):
  `classroom_assignment_specs` and `classroom_rubrics` (one jsonb document per
  item, readable via `classroom_can_read_item` -- a spec is the worksheet and a
  rubric is a promise, neither is a secret), `classroom_submissions` (one row
  per (item, student); states `draft` -> `submitted` -> `returned`; grading
  fields live here), `classroom_responses` (one row per (item, student,
  block), deliberately independent of submissions so autosave never creates a
  row it does not need), `classroom_submission_files` (metadata only; a null
  `block_id` is a plain hand-in, a set one is that imageZone's photo with a
  caption), `classroom_module_approvals` (the gate's state). Submissions /
  responses / approvals are own-row-or-reviewer; files delegate through their
  submission row. The responses policy is MUTATION-CHECKED BOTH WAYS:
  `using (true)` and `using (false)` each redden the isolation test, migration
  restored byte-identical.
- **Spec validation is SQL, at the door.** `_classroom_check_spec` enforces
  schema shape, globally-unique block ids, module points summing to
  `meta.totalPoints`, per-module rubrics summing to module points (required
  whenever a module carries points), and REFUSES `calc` blocks by name (the
  print fallback covers those materials until the calc engine lands).
  `validateSpec` in `src/lib/classroom/assignment-spec.ts` is the FRIENDLY
  mirror the import UI runs so a teacher sees every problem at once; the RPC
  is the boundary either way. **SQL trap learned here:** `jsonb_typeof(x) <>
  'number'` is NULL (not true) for an ABSENT key, silently skipping the raise
  -- every presence-sensitive typeof check uses `is distinct from`.
- **The preflight is server-authoritative and DERIVED, never authored.**
  `_classroom_spec_unmet` computes what stands between a student and a valid
  submission from block constraints alone (minSentences, minRows -- counting
  only rows with a non-empty cell, minImages with absent reading as "at least
  1", checklist items, the declaration, the gate), exactly per the spec doc's
  derived-behavior contract. A closed gate's entry STANDS IN for everything
  behind it (gated modules' own constraints join the list only once the gate
  opens -- mirrored in `specUnmet` client-side). The client shows the same
  list live and renders the server's list verbatim on a refused submit. THE
  SENTENCE RULE is one rule in two places: `_classroom_sentence_count` (SQL)
  and `countSentences` (TS) both split on runs of `.!?` and count pieces
  containing a letter or digit -- change both together.
- **State rules** (all server-enforced, all structured refusals): `submitted`
  locks responses, files and captions (`{ok:false, reason:'locked'}`);
  unsubmit works only while submitted AND no grade has been saved
  (`graded_at` null -- once grading started, pulling the work out is not the
  student's call); `returned` releases score + breakdown + comment and reopens
  editing for resubmission. A no-spec assignment requires at least one
  attached file to submit. The approval gate is enforced at THREE points:
  save-response, add-file (both refuse gated blocks with
  `approval_pending`), and the submit preflight.
- **Grading** is keyed by (item, student) -- not submission id -- so
  paper-in-hand work with no submission row can still be graded (the row is
  created as a draft). It REQUIRES a rubric (`classroom_rubrics`; the console
  says so and offers the builder), validates every score key against the
  criteria and every value against that criterion's points, computes the
  stored `score` as the sum, and `p_return = true` additionally requires
  EVERY criterion scored (`incomplete_scores` refusal) before flipping state
  to `returned`. Rubrics are full-set replacement
  (`classroom_set_rubric`, the tournament_set_reward_rules convention);
  `rubricFromSpec` flattens a spec's module rubrics into editable criteria
  with STABLE per-(module, row) ids so regeneration keeps existing scores
  aligned.
- **Files: the notebook pattern end to end.** Upload via
  `/api/classroom/submission-file` (multipart; the classroom attachment
  allowlist; Drive first then RPC, a refused RPC sweeps the blob), stored in
  a SEPARATE Drive subfolder (`IDEA Classroom submissions`) so student work
  and teacher handouts never interleave in the folder browsed by eye. Served
  ONLY by `/api/classroom/submission-file/[file_id]`, the RLS-enforcing proxy
  (row read under the caller's own session; empty result is 404 never 403;
  Drive failure for an authorized caller is 502). The camera pattern is the
  notebook's two-input split (capture="environment" single / gallery
  multiple). Deleting is the student's own action only; the route sweeps the
  orphaned blob.
- **Client layer:** `assignment-spec.ts` (pure: spec types + validation,
  preflight, sentence counting, rubric math, the FACTS CSV, row types, the
  transports interfaces); `AssignmentEngine.svelte` (student orchestrator:
  per-block 800ms debounced autosave with a flush before submit, live
  preflight, declaration, files, returned-grade card);
  `SpecRenderer.svelte` (modules with points/AI-badge/completion chips,
  auto-resizing textareas with the dim/amber/green sentence counter, tables
  with add/duplicate/delete/reorder rows and column tips, imageZones through
  the Drive pipeline with captions, checklists, the gate card; `readonly`
  mode is the grading console's response view -- and readonly always shows
  gated modules, since a reviewer needs to see them); `RubricView.svelte`
  (promise AND breakdown -- one rendering, optionally scored);
  `SpecImport.svelte`, `RubricBuilder.svelte` (teacher tools on the item
  page); `GradingConsole.svelte` at
  `/classroom/[sectionId]/item/[itemId]/grade` (roster-ordered status list,
  read-only work view, per-criterion scoring with live total, private
  comment, save-draft/return, gate approval, CSV export). The CSV is
  FACTS-ready: Last, First, Score, Out of; last-name alphabetical
  (`splitLastFirst` honors an authored "Last, First"); RFC 4180 + CRLF +
  UTF-8 BOM + the formula-injection guard (the notebook review CSV's
  conventions). **THE BOM IS BUILT AT RUNTIME** (`String.fromCharCode(0xfeff)`)
  -- both a literal BOM and a `﻿`-style escape proved unable to survive
  the write toolchain (and `Blob.text()` STRIPS a leading BOM, so verify BOM
  presence via `arrayBuffer()`, never `text()`).
- **Item page wiring:** the engine slot in `ItemDetail.svelte` renders the
  teacher tools (spec status + import, rubric builder, grading link) for a
  manager, the student engine for an enrolled student (its slice loaded by
  the page server load -- and only for non-managers, since the same RLS
  legitimately hands a manager every student's rows), and the placeholder in
  view-as. Everything fails soft pre-0086: the engine section simply does not
  render.
- **Verified.** `tests/classroom-engine.test.ts` (30 tests, 0001 + 0003 +
  0020 + 0053 + 0067 + 0082 + 0083 + 0085 + 0086 applied UNMODIFIED to real
  embedded Postgres): spec validation (point sums, rubric sums, duplicate
  ids, calc-by-name, missing totalPoints, non-assignment, non-manager,
  student), response RLS (classmate zero rows, section teacher reads,
  foreign teacher zero, cross-section co-posted boundary), no direct writes
  for student OR teacher (42501 all three verbs), the full preflight walk
  (six unmet kinds -> everything-but-gate -> approval unlock -> submit), the
  state machine (locked both paths, unsubmit before grading only, draft
  grade closing the unsubmit door, incomplete-scores refusal on return,
  released grade readable by its student, returned -> resubmit), grading
  gates (students refused, unknown/over-points scores refused, admin reach),
  file RLS + cross-student delete reading as nonexistent, the anon boundary
  over all ten RPCs and six tables, and the sentence-rule edges.
  Mutation-checked as described above. Browser-verified in `/dev/classroom`
  (two new views driving the REAL components against an in-memory store that
  runs the REAL pure layer): the full student loop (sentence counter walking
  dim -> amber -> green, table ops incl. a whitespace-only row counting for
  nothing, two real canvas-built photos through the zone with captions,
  checklist, declaration, live preflight counting down 6 -> 1, a submit
  refused server-side listing exactly the gate, approval in the console
  unlocking module 3, submit -> locked -> unsubmit -> resubmit) and the full
  grading loop (roster chips, read-only responses with zero editable inputs,
  incomplete-return refused naming 3 missing, live total, draft then return,
  the student's returned card with 19.5/20 + per-criterion breakdown +
  comment + Resubmit, CSV intercepted and byte-checked: BOM + last-name
  order + blank un-returned scores), the teacher import flow (three
  validation errors at once, attach disabled until valid, generate-from-spec
  -> save rubric), both pages exactly 375/375 at phone width (the wide table
  scrolls in its own container; the console stacks), zero trapped
  window.onerror across the sweep, and signed-out probes (401 on all three
  submission-file methods, 303 on the grade route). **NOT verified: the live
  Supabase project** -- the local `.env` is the placeholder project, so 0086
  has never been applied anywhere; apply it by hand in the SQL editor after
  0085, and note the autosave-survives-reload path is pinned by the DB suite
  + the load wiring rather than a live two-device check.

