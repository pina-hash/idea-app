# 0129 manifestToRubric: an HTML assignment's manifest becomes the rubric the grading console already grades

- Issued: 2026-09-10
- By: Mr. Pina, as one of four simultaneous lanes building against the HTML
  assignment contract (0126 the bridge and the serving route, 0127 the manifest
  and the store, 0128 the fixtures, 0129 this one).
- Owns: `src/lib/classroom/html-assignment/rubric.ts`,
  `tests/html-assignment-rubric*`, a `/dev` harness route under
  `src/routes/dev/html-rubric/**`, its own route spec under
  `tools/browser-verify/routes/` (one file per route, collision-free by
  construction), `docs/prompt-ledger/entries/0129-*`, and its own
  `docs/history/` entry. It owns NO other source file, and specifically NOT
  `GradingConsole.svelte`, `RubricBuilder.svelte`, `RubricView.svelte`,
  `assignment-spec.ts` or `transports.ts`.
- Migration permitted: no. Claims: none.
- Lands on: `integration`. Not `main`.
- Status: pushed
- Branch: `claude/html-assignment-manifest-contract-r8gphu`, branched from
  `origin/integration` at `fd8e136e`.
- Notes: ONE JOB. `manifestToRubric(manifest)` produces exactly what
  `classroom_set_rubric` already accepts, so the grading console, extra credit,
  bulk grading and the FACTS export need no change at all.

  **IT DELEGATES TO `rubricFromSpec` RATHER THAN MIRRORING IT.** The output has
  to match byte for byte, and a second implementation of the id namespacing,
  the `<module title>: <criterion>` join, the `criterionMax` rule and the
  short-preserving level map is precisely the thing that quietly stops
  matching. So the manifest is projected onto the rubric-shaped slice of an
  `AssignmentSpec` and handed to the one translator the composer and the
  builder already call. Byte-for-byte becomes a property of construction rather
  than a claim a test has to keep re-proving.

  **PROVEN AGAINST THE REAL CONSUMER, NOT AGAINST AN OBJECT.** The defect class
  this replaces is a rubric that stored fine and displayed wrong (2026-09-08,
  IDEA209H Unit 1: an instructor rewrote descriptors and saw nothing change,
  because `levelShort` renders `short` first and nothing in the product could
  edit it). So the harness mounts the REAL `RubricView` and the REAL
  `GradingConsole` over a manifest-derived rubric beside a spec-derived one and
  shows the two render identically.

  **CONTRACT AMENDMENT 1 CHANGED NOTHING THIS LANE HAD ALREADY BUILT.** Five
  of its seven corrections are bridge, frame and serving-route concerns this
  module reads none of. Two were additive and applied: the manifest's new
  top-level `header: HtmlBlock[]`, whose blocks never reach the rubric because
  they are not modules (asserted anyway, with an emptied header as the positive
  control); and NO HALF POINTS, which is the ONLY rule in
  `manifestRubricIssues` with no counterpart in SQL -- measured, the real
  `classroom_set_rubric` accepts and stores a level worth 0.5, so the client is
  the only place it can be refused.

  **NO MIGRATION, NO SQL, NO WRITE.** `classroom_set_rubric` touches no scores
  and this bundle calls nothing. Who invokes `manifestToRubric` -- and when a
  re-uploaded revision regenerates the stored rubric -- is 0127's import path,
  and is REPORTED here rather than wired, because that call site is not this
  lane's file.
