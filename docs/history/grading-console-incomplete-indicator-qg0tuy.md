---
title: "The grading console says when work arrived unfinished: a second roster chip and a named list of what 0160 let through, derived at read time with no column and no RPC (`claude/grading-console-incomplete-indicator-qg0tuy`, no migration)"
date: 2026-08-30
branches: [claude/grading-console-incomplete-indicator-qg0tuy]
migrations: []
subsystems: ["Classroom", "Grading"]
---

0160 is applied to production. `classroom_submit_assignment` no longer refuses a
submission whose spec checks are unmet: it accepts it and returns the unmet list
alongside `ok: true`. That was deliberate, and the migration's own header argues
it -- sometimes the assignment is wrong and sometimes a sentence counter is
wrong, and the cost of accepting unfinished work is a grader seeing unfinished
work, against a student who cannot hand in at all and has nobody to appeal to at
11pm.

The instructor half was never built, and 0160 said so in as many words ("THE
INSTRUCTOR-FACING DISPLAY OF THAT IS A SEPARATE BUNDLE AND IS NOT HERE"). Until
this bundle the grading console rendered an incomplete submission byte for byte
like a complete one, so the first incomplete hand-in would have been graded as
though it were finished. That is worst for the instructor who teaches one section
of this course, was not part of designing any of it, and has no way to learn the
distinction exists except from the screen.

Files owned: `src/lib/classroom/GradingConsole.svelte`,
`classroom-updates.json`, and a new harness under
`src/routes/dev/grading-incomplete/`. Nothing else changed --
`git diff --stat supabase/` is empty and there is no migration in this bundle.

### The signal was already on the wire, and confirming that was the first job

`specUnmet` in `assignment-spec.ts` is the pure mirror of
`_classroom_spec_unmet`, and `StudentWork` already carries the exact three things
it reads -- `responses`, `files`, `approvals` -- beside the `spec` the console is
handed as a prop. So incompleteness is computable at read time from data the
console already has, and `unmetFor()` is three lines with no transport behind it.

**No column, no RPC, no migration**, which is 0160's own reasoning and not a
convenience: a stored flag would be a second answer to a question that already
has one, and it is the copy that goes stale the moment a RETURNED student edits
and hands in again. The derived count is live in exactly that case, which is the
case that matters.

### The mark is keyed on HAVING HANDED IN, never on the count

`handedIn(s)` is `state === 'submitted' || state === 'returned'`, and
`incompleteCount` returns 0 for everyone else. Every student still working is
unfinished by definition -- that is what the `In progress` chip already says --
so a signal keyed on the unmet count alone would light the entire roster up on
day one and mean nothing by the time it mattered. A RETURNED row keeps the mark:
the student may edit and resubmit, and a grader reopening the row should see what
it says now.

The harness's fourth student exists to hold that line. Dara Nwosu has six unmet
checks and no submission row, and under BOTH mutations below she still carries no
chip -- the gate is `handedIn`, not the count.

### Two chips, not one longer chip

`statusChip` is untouched. The incomplete pill is a second `.roster-chip`
alongside it, inside a `.roster-chips` group so a long name shrinks against the
pair rather than shoving the second one out of the row.

"Did this arrive" and "was it finished when it arrived" are two questions and a
row answers them independently -- Eli Ramos is `Returned · 14/20` AND
`Incomplete · 2`. Folding the count into the state chip would make one mark stand
for both and there would be no way to read either. This is the same argument the
notebook grid's rule makes about acknowledgement: a new DIMENSION gets its own
mark.

### `--gold`, and the two tokens it is not

This file already carries the distinction as a written rule: `.off-roster` is
`--amber` because work with no enrollment behind it is a warning, and
`.manager-note` is `--boundary` because a manager exclusion is the roster
behaving correctly. An incomplete hand-in is neither. It is not a warning --
since 0160 it is a thing the database accepts on purpose, and an amber pill would
tell an instructor who has never met the distinction that a student did something
wrong. And it is not neutral furniture -- a mark you have to already know about
to notice is not a mark.

`--gold` is the register's special-callout token: loud enough to read at a glance
and carrying no verdict. `--crimson` is reserved for live / rec / error and was
never a candidate. The WORD carries the meaning either way; the colour is never
the only signal.

### The open view says what, not merely that

The card renders at the TOP of `work-left`, above the gate row and the files, so
a grader reads it before the responses rather than after. Its list items are
`unmetLabel`'s own strings -- byte for byte the sentences the student read on the
assignment before pressing Submit -- so the two sides are looking at the same
list and neither has to be told what the other saw. The card holds no control of
any kind: nothing in it reaches the rubric, the total, the override path or the
return flow.

### What was NOT changed, deliberately

* **`specUnmet` computes exactly what it computed.** It was read, mirrored and
  mutated, never edited.
* **Nothing gates grading on completeness.** Measured: an incomplete submission
  scores and returns exactly as any other does.
* **The CSV is untouched.** `gradesCsv` has the same columns; the FACTS shape is
  what other things consume.
* **`GradesPanel.svelte` was left alone, and could not have been changed
  usefully.** It takes `AssignmentStanding[]` -- per-assignment counts, no spec
  and no per-student responses -- so it has nothing to derive an unmet list from.
  Giving it one is a payload widening in its own bundle, not a chip.
* **Between-levels overrides still require a comment.** Untouched.

### Two findings raised and not fixed, both outside the owned set

1. `AssignmentEngine.svelte` still branches on `res.data.reason === 'incomplete'`
   and renders the heading "The submission was refused -- still needed:". After
   0160 the server never returns that reason, so the branch is dead and the
   string is stale. The live preflight above the Submit button ("Before you can
   submit") is also now describing an advisory list rather than a gate. Neither
   is wrong on screen today -- the dead branch simply never renders -- but the
   wording is a student-facing bundle of its own.
2. `unmetLabel`'s approval sentence contains a `--`, which the copy conventions
   forbid in user-facing text. It is existing student-facing copy in
   `assignment-spec.ts`, not this bundle's to edit.

### The harness, and why it is its own route

`/dev/grading-incomplete` mounts the REAL `GradingConsole` against an inert
fixture. `/dev/classroom?view=grade` already mounts the console, but its engine
fixture is SHARED with six views that write to it, and bending it into the five
states this signal has to be read against would change what all of them render.

It prints an ORACLE table beside the console: `specUnmet` called directly on the
same fixture, with the count and the resolved labels per student. A browser pass
therefore compares the console against the pure function rather than against
itself, and the oracle is also what makes a mutation legible -- both sides move
together, which is the tell that the mutation landed.

### Measured (Chromium 1194, headless, 1440x900 and 375x812)

All five roster rows and their opened views agreed with the oracle at both
widths:

| student | state | chip | card items |
| --- | --- | --- | --- |
| Alice Alvarez | Submitted | none | card absent |
| Ben Okafor | Submitted | `Incomplete · 6` | 6 |
| Carla Cardenas | Submitted | `Incomplete · 1` | 1 |
| Dara Nwosu | In progress | none | card absent |
| Eli Ramos | `Returned · 14/20` | `Incomplete · 2` | 2 |

* **No horizontal overflow.** `scrollWidth === clientWidth`: 1440 === 1440 and
  375 === 375.
* **Contrast, by canvas-free computed readback against the real composited
  ground, not by token name.** Chip on a non-active row (ground `#161a18`)
  **7.66:1**; chip on the active row (ground `#0a0c0b`) **8.55:1**; card heading
  on `--bg1` `#1a2a1a` **6.58:1**; card note **12.47:1**; card list item
  **12.47:1**. Floor is 4.5:1; the lowest is 6.58.
* **Roster rows stayed 44px** at both widths with two chips in them (445.2px wide
  at 1440, 286.6px at 375) -- the chip group wraps inside the row rather than
  growing it.
* **Grading and returning an incomplete submission still works.** Ben Okafor,
  six unmet, went `Submitted` -> `Returned · 20/20` through the real
  `gradeSubmission` transport, and both the chip and the card were still there
  afterwards, unchanged -- which is the claim: a score says nothing about what is
  missing.
* **Console errors: one, and it is the harness.** The only failed request at
  either width is `fonts.googleapis.com` (`ERR_CONNECTION_RESET`), so all text
  was measured in the FALLBACK stack.
* `svelte-check`: **0 errors, 37 warnings** (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`) -- the baseline, breakdown
  intact. `npm test`: **211 files, 4397 tests, all passing.**

### The mutation proof, run in BOTH directions

The assertion runner states the five expected states independently of the page
and compares by EQUALITY, never by a floor, so a card appearing where none should
reddens exactly as a missing one does.

* **Mutation 1** -- `specUnmet` returns `[]` unconditionally: **9 assertions
  reddened** (the oracle, the chip and the card for each of Ben, Carla and Eli).
  The indicator disappeared everywhere.
* **Mutation 2** -- `specUnmet` returns one entry unconditionally: **9 assertions
  reddened**, and critically three of them are ALICE's -- her chip went
  `null -> "Incomplete · 1"` and a card appeared where none should. Mutation 1
  alone would have left every absence assertion green and vacuous; this is what
  proves they bite.

Under both, Dara Nwosu stayed unmarked, which is the designed outcome rather than
a vacuous pass: her gate is `handedIn`, which no mutation of `specUnmet` reaches.

`assignment-spec.ts` was copied to a scratch file first and restored FROM THAT
COPY, never with `git checkout --`. md5 before and after:
`bf0de6930ad07944bb858eb7e671e2f8` both times, `git diff --stat` on it empty, and
the suite re-run green afterwards.

### Not verified

* The live Supabase project. Nothing here can apply a migration or run an RPC,
  and this bundle has no SQL in it.
* Any signed-in production surface. The console behind a Google sign-in was not
  reached; everything above was measured on the dev harness.
* A Vercel preview. Deployments are rate limited, so the branch has no preview
  URL and the changelog entry does not reach students until the next production
  deploy.
* `prefers-reduced-motion: no-preference` was in force throughout; the
  reduced-motion path was not exercised (nothing added here animates).

### The changelog entry

`classroom-updates.json` gained ONE entry, dated 2026-08-30, tagged
`Assignments`, for the STUDENT-facing half of 0160 -- which was owed and was
deliberately withheld until the SQL was applied, since shipping it earlier would
have announced a capability the database still refused. The grading-console half
is instructor-facing and correctly gets none.
