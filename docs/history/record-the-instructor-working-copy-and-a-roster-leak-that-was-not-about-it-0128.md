---
title: "The instructor working copy, and a roster leak that was not about it (`0128`)"
date: 2026-08-22
branches: []
migrations: ["0128"]
subsystems: ["IDEA Classroom"]
record_order: 110
---

An instructor can now fill an assignment out themselves, on the same renderer a
student uses, with the answers autosaving the same way. One copy per item can be
designated the ANSWER KEY, which every instructor on that item can then read. In
the same bundle, and independent of it, `studentWorkRows` stops appending a
roster row for any email it happens to see in the payload.

### What shipped

**`0128_classroom_instructor_copy.sql`** -- two tables and four functions:

- `classroom_instructor_responses` (`item_id`, `instructor_email`, `block_id`,
  `value`, `updated_at`), column for column `classroom_responses` with the
  student replaced by the instructor.
- `classroom_instructor_keys` (`item_id` primary key, `instructor_email`,
  `designated_at`, `designated_by`). One key per item; designating replaces.
- `classroom_save_instructor_response`, `classroom_designate_instructor_key`,
  `classroom_undesignate_instructor_key` -- none takes an email.
- `classroom_instructor_key_email(item_id)`, the gated lookup the RLS policy
  names, plus the private `_classroom_instructor_copy_author`.

**The surface** is `src/lib/classroom/InstructorCopy.svelte`, mounted by
`ItemDetail` in the ENGINE SLOT -- the same position in the reading order a
student's hand-in occupies -- when a manager has both a spec and a copy payload.
`SpecRenderer` gained one prop, `fileNotice`.

**The roster fix** is in `studentWorkRows`, which now returns
`{ rows, offRoster }`; `GradingConsole` renders the count of off-roster response
sets in an amber note above the roster.

### The load-bearing decisions

**Its own table, not a flag on `classroom_responses`.** This is 0090's argument
applied again, and it is the whole design. Every reader of `classroom_responses`
in this app -- the grading console, the FACTS CSV, the Grades tab, the GitHub
export -- is written on the premise that a row there belongs to a student on
somebody's roster. An `is_instructor` column would make ONE forgotten
`and not is_instructor` enough to grade a teacher or put an answer key in a CSV.
A wrong table name fails loudly where a forgotten filter leaks.

**The write gate is `classroom_can_read_instructor_material`, NOT
`_classroom_manages_item`.** The editing bar for instructor MATERIALS is "manages
every section this is posted to", because an edit changes what every one of that
item's classes sees. A working copy changes nothing anyone else reads until it is
designated, and a Block 4 instructor who teaches one of an item's three sections
must be able to keep one. Designating is the same gate for the same reason: it is
still their own copy they are putting up.

**An UNDESIGNATED copy is private to its author.** The policy's second branch
admits only the designated key's author, so a half-written key is not on anybody
else's screen. That is not modesty: half an answer key read as the whole one is
worse than none.

**Undesignating is narrower than designating, and replacement is the escape
hatch.** The author, whoever designated it, or an admin. Any instructor on the
item can still REPLACE the key with their own, so no item is ever stuck with a
key nobody present can move -- which is what makes the narrow rule safe.

**File blocks are out, and they say so.** There is no instructor-side counterpart
to `classroom_submission_files`, so `classroom_save_instructor_response` refuses
an `imageZone` by the same rule the student path uses, and `SpecRenderer`'s new
`fileNotice` renders the block with a sentence instead of a picker that leads
nowhere. The module progress chip also stops COUNTING those blocks on such a
surface (`progressModule`), because a chip reading 2/3 where the third can never
be done is a lie about the work rather than a reminder about it.

**The empty-copy rule lives in the server only.** The Designate control is not
disabled on an empty copy: the RPC answers `empty_copy` and the surface renders
it where the instructor is working. A disabled control swallows the pointer event
a "why is this disabled" cue would have to fire from, and a second copy of the
rule in the client is a second thing that can stop matching.

**"Not a submission" is ABSENCE, not concealment.** No state chip, no
submitted/returned machine, no grade card, no rubric score, no declaration, no
preflight, no submit. There is no `classroom_submissions` row for an instructor
and nothing on this surface could create one. Measured on the harness: **0 file
inputs, 0 submit controls, and 0 of 16 submission strings present** ("Submit",
"Resubmit", "Unsubmit", "Academic integrity", "Returned", "Not submitted",
"Handing this in", "Your files", "Extra files", "Before you can submit", "Rubric
breakdown", "Teacher comment", "Take a photo", "Choose photos", "Choose files",
"pts left"). The two controls on it are "Designate as answer key" and the
renderer's own "Add row".

**The `mine` split in `loadInstructorCopy` is ATTRIBUTION, not authorization.**
RLS legitimately returns two people's rows through one policy here, so somebody
has to say which are the caller's -- the documented exception to "no identity
filter in a read".

### The roster leak, which existed today and is not about instructors

`studentWorkRows` called `ensure()` on responses, submissions, files AND
approvals. Any email in the payload that was not on the roster got a row
appended, `active: true`, display name taken from the local part of its address,
indistinguishable on screen from a student. That row reached the roster list, its
status chip, the returned count, the FACTS CSV, and the Grades tab's counts,
where it was measured against a denominator (the enrollment count) that
deliberately excluded it.

**It is reachable without this feature.** `classroom_can_review_submission`
answers for a student enrolled in ANY section of the item that the caller
manages, so a manager of two sections opening the console for an item posted to
both legitimately receives the other section's students' rows. Every one of them
was an appended roster row.

**Dropped, but never silently.** A silent drop hides a real enrollment mistake
exactly as well as it hides the cross-section case, so the emails come back
beside the rows and the console says how many were found. The COUNT only: an
off-roster email in a console reaches an export, a paste and a screenshot, and
the count is what tells somebody to go and look at the People tab.

### What was measured

Full suite: **87 files, 2102 tests, all passing**. `svelte-check`: **0 errors, 36
warnings** -- the baseline, unchanged.

`tests/classroom-instructor-copy.test.ts`, 22 tests, boots the chain at `0095` --
SHORT of 0128 -- seeds a complete assignment through the real 0086 RPCs (two
students, a graded-and-returned submission, one awaiting grading, files, a
cross-section student on a co-posted item), captures every downstream payload,
then applies `0128` over that database.

| Payload | Before 0128 | After 0128 |
| --- | --- | --- |
| Grading grid rows (P1, worksheet) | 2, states `returned` / `submitted` | identical |
| Roster list | 2 | identical |
| FACTS CSV string | contains `Alvarez`, `Baptiste` | byte-identical |
| Grades tab standings | 2 assignments | identical |
| Home feed to-grade count | 1 | 1 |

The migration is applied TWICE in the same test (re-pasting one is ordinary
here), and `pg_proc` is asserted to hold exactly one row for each of the five new
functions -- the signature trap.

Grants on both new tables, read straight from
`information_schema.role_table_grants`: `authenticated:SELECT` and nothing else,
`anon` absent entirely.

### Mutation proof

Each mutation was applied in the PERMISSIVE direction, the single test file was
run, and the file was restored and md5-checked
(`f7630b88668550fa68f6493d2d9d0be7` for the migration,
`40343ef1b5b96d5aceb9ca444c27d9ef` for `assignment-spec.ts`).

| # | Mutation | Reddened |
| --- | --- | --- |
| M1 | the responses policy to `using (true)` | 3 (student reads zero; an undesignated copy is private; replacing a key hides the old author's rows) |
| M2 | the keys policy to `using (true)` | 1 (student reads zero) |
| M3 | the gate inside `classroom_instructor_key_email` removed | 1 (a student cannot name the key author) |
| M4 | `studentWorkRows` reverted to the appending `ensure()` | 2 (the off-roster exclusion, and the CSV/count assertions) |

**M3 is the interesting one, and it is defence in depth working.** Opening the
helper's internal gate leaked the key author's EMAIL through a direct RPC call
but leaked NO rows, because the responses policy's outer
`classroom_can_read_instructor_material` still refuses a student before the
branch that names the helper is reached. Each layer was opened separately and
only the assertions that layer protects reddened.

### Verified in the browser

Through `/dev/classroom?view=instructor-copy`, which mounts the REAL `ItemDetail`
with `canManage` true -- the same slot and the same branch the live page takes.

- Autosave: typing into the first textField and waiting 1.4s put the exact text
  into the harness store, and the indicator read **"Saved 3:37 AM"** -- the
  acknowledgement with its clock time, not the dispatch.
- Designate: the key moved from `mreed@boscotech.edu` to the viewer, the chip
  changed to "Designated answer key: your copy", the read-only section
  disappeared (it is now the viewer's own copy), and the control became
  "Undesignate as answer key".
- Undesignate: the key went to null and the chip to "No answer key designated
  yet".
- The other instructor's key, read-only: **0 textareas, 0 file inputs, 0 forms,
  0 editable controls** -- the two inputs in it are DISABLED checkboxes and the
  four buttons are two info tips, a table header tip and a disclosure. Its table
  cells render as text (`Top chord` / `Compression` ...) and its textField answer
  is present.
- **1440x900**: surface 896px, banner one row at 56px, no horizontal overflow
  (scrollWidth 1425 against 1440). The Designate control is **179x44** and hit
  tests to itself; the checklist labels are **44px**; "Add row" is **69x44**; the
  instructions disclosure is **846x44**.
- **375x812**: no horizontal overflow (scrollWidth 375), surface 343px, the
  banner wraps to 77px, the Designate control is still **179x44** and hit tests
  to itself, and the response table scrolls inside its own container (client 293
  against scroll 384) rather than pushing the page wide.
- The grading console with a planted off-roster response set: the payload
  contains it (**positive control**), the roster renders **24** names and not 25,
  the off-roster email is absent from the list, and the notice reads "1 response
  set on this assignment belongs to somebody who is not on this class roster...".
- **The student render scan.** `/dev/classroom?view=assignment` mounts the same
  `ItemDetail` for a student. All 13 instructor-copy strings -- the five exported
  constants verbatim, both instructor addresses, the key author's own sentence,
  `instructor-copy`, `instructorCopy` and both table names -- scored **0 hits in
  a 20,585-character render**, against control strings confirmed PRESENT in the
  same read ("Submit", "Academic integrity", "Take a photo", "Photo evidence",
  "Extra files"). Scanning the whole 427,545-character document returned exactly
  one hit, and it is the harness's own view-switcher button label ("Instructor
  copy (teacher)") on a route that 404s in production.

### What is NOT verified

- **Nothing was run against the live Supabase project.** The local `.env` is the
  placeholder project. 0128 is applied by hand in the SQL editor; every SQL claim
  here is against a real embedded Postgres with the real migration files applied.
- **No signed-in browser pass**, so the real route's `loadInstructorCopy` and its
  transports were driven only through the harness's in-memory answers. The
  RPC-level behaviour they call is covered by the DB suite against real policies.
- **`npm run build` was not run** (the pre-existing Windows EPERM in the Vercel
  adapter's `closeBundle`).
- **No screenshot.** The Browser pane does not composite; every visual number
  above is a measured computed-style, geometry or hit-test read.
- **The pre-0128 fallback was not driven in a browser.** A manager on a
  deployment without the migration gets `loadInstructorCopy` returning null and
  `ItemDetail` falling to the read-only `SpecRenderer` it showed before -- the
  branch is one `{:else if spec}` and is unchanged, but nobody watched it.

### Deferred

- **File blocks in an instructor copy.** It needs an instructor-side counterpart
  to `classroom_submission_files` and its own Drive folder, proxy and RLS. Stated
  on the block rather than half-built.
- **No comparison view.** Reading the key beside your own copy means scrolling
  from one to the other; a side-by-side or a per-block diff is a real feature and
  nobody has asked for it yet.
- **No `classroom-updates.json` entry.** Nothing in this bundle changes what a
  student sees: the surfaces are the manager's item page and the grading console,
  and the student render was scanned to zero. The standing directive is for
  student-visible change.

