---
title: "Four instructor reports: the hall pass gets a limit it can be given an exception to, and the People tab gets a roster export, a class mail draft and a reproducible picker (`claude/classroom-instructor-tools-040i06`, migration 0174)"
date: 2026-09-02
branches: [claude/classroom-instructor-tools-040i06]
migrations: ["0174"]
subsystems: ["Classroom", "Testing", "Browser harness"]
---

Prompt 0016. Four things an instructor reported, of which one had a real cost
and three were "add X" items that turned out genuinely not to exist.

## What was audited first, and which claims were wrong

The prompt's claims were checked against the tree rather than taken. Three were
wrong or imprecise, and they are worth recording because two of them decide
where code goes.

- **`src/routes/classroom/people/**` does not exist.** The People tab is
  `src/routes/classroom/[sectionId]/people/`. Nothing was created at the stated
  path.
- **The CSV writer is not in `grading-export.ts`.** `gradesCsv`, `csvCell` and
  `splitLastFirst` are in `src/lib/classroom/assignment-spec.ts`;
  `grading-export.ts` writes JSON and XLSX and its own header says why ("WHY
  JSON RATHER THAN THE FACTS CSV BESIDE IT"). `csvCell` was also NOT exported,
  which is the one line of an unowned file this bundle had to change.
- **`/dev/notebook` @375 and `/dev/gauntlet-shell-countdown` @1440 are not
  flaky in this tree.** Neither appeared in the counts block before this bundle
  or after it; the four outside-threshold rows are the same four in both runs.

The claim that DID hold: `HallPass.svelte` says in a comment near line 370 that
"nothing here enforces a time limit" (it is a CSS comment justifying `--teal`
over `--amber` for an open pass, which is a slightly different sentence than the
prompt implies but the same fact).

## The hall pass, which is the item with a cost

**"SPAM" IS THREE DIFFERENT DEFECTS AND THE SCHEMA SAYS SO.** 0143's capacity
check is a partial unique index on `(section_id) where closed_at is null` --
one open row per SECTION, never per student -- and nothing anywhere counted or
waited. So:

1. **Two passes at once.** A student enrolled in two sections could hold an
   open pass in each: marked out of two classes, in two histories, occupying a
   slot in a room they are not in. The index cannot see this by construction.
2. **The next pass immediately.** Nothing stood between a close and the next
   open. Sign in, sign out, all period.
3. **An unbounded number across a period.** Nothing counted at all.

**ALL THREE ARE FIXED.** Defect 1 by asking, before the insert, whether this
student holds an open pass ANYWHERE -- reusing 0143's existing `already_out`
refusal rather than inventing a word, because the sentence is exactly true and
is about their own row. Defect 2 by a cooldown measured from the last close in
that section. Defect 3 by a cap on passes opened on the current
America/Los_Angeles calendar day, per student per section.

**NOTHING EXPIRES OR AUTO-CLOSES A PASS.** 0143's own header says "a long
absence is a conversation an instructor has, not something the schema
adjudicates," and that is untouched: 0174 limits how OFTEN a pass may be taken
and never how long one lasts. There is a test asserting a six-hour pass is
still open and still refuses nothing.

### Why it needed a migration at all, and why it needed one column

The audit's question was whether existing data could carry the limit. **It
can** -- `opened_at` and `closed_at` are all three rules need, and no table or
index was added for them. But the guards live INSIDE `classroom_hall_pass_open`,
and changing a function is a migration whatever else is true, so the file was
going to exist regardless.

**ONE COLUMN WAS ADDED, `opened_by`, AND IT IS THE OVERRIDE'S AUDIT TRAIL.**
Without it an overridden pass is byte-identical to a self-opened one, so the
history an instructor reads cannot tell "this student went four times" from
"this student went once and I sent them three times" -- and a limit whose
exceptions leave no trace is a limit nobody can check. It is the exact mirror of
`closed_by`, which 0143 added for the same reason. Nothing is backfilled: null
already means "the student themselves", which every pre-0174 row was.

### The refusal carries a time, and that is the whole point

A refusal with no instant in it is asked again thirty seconds later, out loud,
which is the behaviour being closed. So `cooldown` answers with `retry_at` and
the sentence names a clock time in the school's own zone; `limit_reached`
answers with the count and the cap and points at the person who can override it.

That obligation propagates: `hallPassOutcome` in `transports.ts` had to stop
discarding the row's extra fields, and `report()` in `HallPass.svelte` had to
stop calling the message builder with the word alone. Either one dropping the
detail leaves a plausible sentence ("wait a few minutes") on screen and nothing
anywhere reporting the loss.

**AND THE COUNT IS SHOWN BEFORE ANYBODY TAPS.** "2 of 3 passes used today" sits
under the status line, from the payload, so a student does not spend a pass
finding out what the rule is.

### The numbers are written down once

`_classroom_hall_pass_limits()` is the only statement of the cooldown and the
cap -- the `_foundry_play_window()` shape -- and the state RPC PROJECTS its
answer, so no component, constant or stylesheet in `src/` writes 10 or 3 down.
`tests/classroom-hall-pass-limits.test.ts` sweeps `src/lib/classroom` and
`src/routes/classroom` for a hardcoded one, with a positive control on the
pattern so an empty result means "nobody wrote one" rather than "the regex
matches nothing".

### The override, and what it does NOT override

`classroom_hall_pass_open_for(section, student_email)` is manager-only and
bypasses the cooldown and the cap. It bypasses nothing else: the student must be
actively enrolled, must not already hold an open pass in any section, and the
one-at-a-time capacity index still applies. **An override is permission to go
now, not permission to be in two places.** An overridden pass still counts
toward that day's cap, so the next one needs another override, which is the
instructor deciding again.

**IT NAMES THE STUDENT, WHICH IS 0144'S ARGUMENT IN THE OTHER DIRECTION.** A
manager is deciding ABOUT somebody, and saying who is the only thing that
carries that intent across the gap between reading a list and pressing a
control. It costs no disclosure: a manager already reads those names on the
People tab.

**SO THE MANAGER BRANCH OF THE STATE RPC NOW PROJECTS THE ACTIVE ROSTER**, and
that is the one addition worth arguing with. The alternative was a control that
made an instructor TYPE an email address at the classroom door, which nobody
uses correctly. It is active-only, because `open_for` refuses anybody else and a
control whose only possible answer is a refusal must not be offered. The STUDENT
branch never evaluates the expression -- asserted, along with the whole key set
of a student payload, in the db test.

### Disclosure is unchanged, and it was re-checked rather than assumed

Every field 0174 adds to the student branch is about the CALLER: their own count
today, their own next eligible instant, and the two numbers of the rule. There
is still no name, no email, no pass id and no history. The db test asserts the
exact key set, asserts `roster` is absent, serializes the payload and greps it
for the other student's name and address, and carries a POSITIVE CONTROL in the
same test -- the manager, on the same open pass, is told all of it.

### Measured

- `tests/db/classroom-hall-pass-limits.test.ts`, 24 tests, against the real
  migration chain applied to a real Postgres. The clock is faked by BACKDATING
  ROWS, never by moving `now()`, so nothing sleeps.
- **The day boundary is tested at 8pm Pacific**, where the LA and UTC dates
  genuinely disagree, and the test asserts they disagree before it asserts which
  one the RPC used. 0140's instrument: at any other hour a UTC mutation reddens
  nothing.
- **MUTATION PROOF, three mutants, permissive direction.** Each guard's
  condition was replaced with `false` in turn, against a `cp` copy restored from
  that copy (never `git checkout --`, per CLAUDE.md), md5-verified identical
  afterwards:
  - cross-section guard removed: **1 test failed** (the two-passes-at-once case)
  - daily cap removed: **5 tests failed**
  - cooldown removed: **4 tests failed**
  - restored md5 `9e857e0ce1126bcedbc55d249337010f`, identical to the original.

## The other three

**THE ROSTER EXPORT** reuses `csvCell` and `splitLastFirst` from
`assignment-spec.ts` rather than writing a second escape. That is not tidiness:
a display name is a value a person typed, the file is opened in Excel, and Excel
executes a leading `=`, `+`, `-` or `@`. A second implementation that quoted
correctly and forgot the formula guard would look perfect in every eyeball check.
`csvCell` was module-private and is now exported, which is the one line changed
in a file this bundle did not own.

Columns: Last, First, Email, Status, Class, Block -- each one a thing the row
already renders (`rosterStatus` in `PeoplePanel.svelte`). **Deliberately left
out:** `section_id` (an internal uuid that means nothing in a spreadsheet and
everything in a pasted URL) and `updated_at` (on no screen in the tab, so
exporting it would be widening what a roster read discloses rather than moving
what it shows). Every row is exported, managers and inactive enrollments alike,
with the Status column telling them apart -- silently dropping a student who
left from a file called "roster" is the failure that matters here.

**EMAILING THE CLASS IS A DRAFT, BECAUSE THE APP CANNOT SEND MAIL.** Audited:
there is no mail sender anywhere in `src/` -- no SMTP, no Resend, no SendGrid,
nothing. The only precedent is a per-row `mailto:` in `FrcInterestAdmin.svelte`.
So the control opens the machine's own mail client, BCC, with the teacher as the
only visible recipient, and says so in words before the link.

**THE CEILING IS HANDLED BY SPLITTING, AND THE SPLIT IS STATED.** There is no
specified `mailto:` length limit and every layer has a different practical one;
the conservative 1800 characters is what this module refuses past. **Measured,
and it is the thing worth knowing: a real class does not reach it.** 39
recipients at `first.last@boscotech.net` encode to roughly 1140 characters, so
the ordinary case is ONE draft. When a roster does cross the ceiling the plan
becomes several drafts, each link naming its own place in the sequence and its
own count, and the note says the split, the total it adds up to, and that
sending only some of them leaves part of the class out. A single address too
long to fit at all is a refusal with the copyable list offered instead. **The
one outcome refused everywhere is a link that quietly drops recipients**: that
message looks sent and is not, to precisely the people who cannot tell.

**THE PICKER IS SEEDED, AND THAT IS THE ENTIRE DESIGN.** A draw made in front of
a class has to survive a re-render, and `Math.random` does not: a poll landing, a
resize or a navigation back re-rolls it silently, and a teacher who says "team
three, you are up" and then scrolls has changed the answer with nothing on
screen looking wrong. So every draw is a pure function of (names, seed), the seed
is held by the surface, a new draw is a deliberate new seed, and the seed is
PRINTED -- which is what makes "it was random" a claim a student can check
rather than one they have to accept.

**TEAMS ARE DEALT ROUND-ROBIN, NOT SLICED**, and this is the bug the obvious
implementation has: chunking a shuffled list into runs of `size` leaves the
remainder as a final team, so 13 students in fours gives 4, 4, 4 and ONE PERSON
ALONE. That happens for most class sizes over a term and reads as a correct
draw. The team COUNT is decided first (`ceil(n / size)`) and the list dealt
across it, so sizes differ by at most one. 151 assertions cover every remainder
class from 1 to 34 students against team sizes 2 through 5.

`mulberry32` is written out in `picker.ts` rather than reused: `shuffled` in
`$lib/frc/drill-banks` is unseeded and lives in a module that imports a question
bank, and `shuffledIndices` in `$lib/server/frc/quiz-engine` is server-only and
module-private. Neither is reachable for a reproducible client-side draw.

## Where they went

**ONE CARD, ONE ROW OF CONTROLS, ONE PANEL OPEN AT A TIME**, between the roster
and the notebook compliance element. Three stacked `Disclosure`s would have been
the obvious shape and is wrong here: `Disclosure` defaults to EXPANDED, so three
of them push the roster off a page an instructor reads standing up with a class
in front of them. All three tools act on the list directly above them, so nothing
has to be scrolled back to. The resting cost is one heading and one button row,
which the browser spec asserts (both panels absent at rest, beside three positive
rows).

## Verified

- **`npx svelte-check`: 0 errors, 37 warnings** (31 `state_referenced_locally`,
  5 `css_unused_selector`, 1 `perf_avoid_nested_class`), the baseline. **The
  no-`.env` phantom count in this checkout is 12, not the 11 CLAUDE.md states**
  -- all twelve are `$env/static/public` errors that vanish when the two
  placeholder values are exported before `svelte-kit sync`, and none is in a
  file this bundle touched. That line in CLAUDE.md is a number that has drifted
  again; it was not corrected here because `CLAUDE.md` is outside this bundle's
  file scope.
- **`npm test`: 237 files, 5026 tests, all passing**, 204.9s.
- **`npm run verify:browser`, four new specs, 8 route/width runs, 140
  measurements, 0 outside threshold.** Click attempts are reported: every step
  landed on 1 attempt except the oversized-roster email click at 375px, which
  took **3** -- paint is not interactivity, and the retry against the step's own
  `until` predicate is what makes that a measured fact rather than a timer.
- **`npm run verify:readme`: full run, 140 route/width runs, 1878 measurements,
  4 outside threshold, 335.4s, selftest 64 controls / 0 instrument failures.**
  The four outside-threshold rows are IDENTICAL BY IDENTITY to the previous
  block's four (`/dev/pathways` @375 and @1440 `tap-target`,
  `/dev/coins-signedin-1` @375 and `/dev/coins` @375 `horizontal-scroll`); the
  eight new runs contributed none. The tool rewrote only lines 32-54, inside the
  `counts:begin`/`counts:end` markers.

## NOT verified

- **The live Supabase project.** Nothing here can apply a migration or run an
  RPC against production; the local `.env` points at a placeholder project and
  no Docker or WSL exists in this container.
- **A signed-in Bosco Tech session.** The People tab and the hall pass override
  are staff-only surfaces and no cloud session holds an account, so the real
  refusal, the real override and the real mail-client handoff are Mr. Pina's
  steps. They are listed in the session report.
- **The `mailto:` handoff itself.** Whether a given mail client accepts a
  1140-character BCC list is a property of that machine, not of this code. The
  ceiling is a conservative guess documented as one.

## Deferred

- **Per-section limit numbers.** A column, a settings control, a validation rule
  and an answer for every section with no value yet. The override covers the
  case that actually arrives.
- **A period window instead of a calendar day.** Nothing in this schema records
  when a class meets; `classroom_sections.block` is a label.
- **`classroom_hall_pass_close(uuid)`** is still standing with no caller, as
  0144 left it. Dropping it is still a later migration with its own caller
  guard.
