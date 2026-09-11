---
title: "An instructor can fill in a ported HTML assignment: `classroom_save_instructor_response` gains 0197's manifest arm (0199), and the working copy that gate licenses (`claude/intelligent-bell-te9r2l`, ledger 0156)"
date: 2026-09-11
branches: [claude/intelligent-bell-te9r2l]
migrations: ["0199"]
subsystems: ["Classroom", "Database", "Interface", "Testing"]
---

Ledger 0154 named two gaps, shipped one, and refused to build the other because
the database would not take the writes. This is the other one, at both ends: the
migration that opens the gate, and the surface it licenses.

## The defect, in one sentence

Nobody could open a ported worksheet and confirm it records anything before a
class used it, so the first person to find a broken document was a
fifteen-year-old, mid-period, with their work already typed into it.

## Why the gate was shut, and why 0197 did not open it

`0197` widened the two functions that write a STUDENT answer -- it names them in
its own header as "the only function in the schema that writes
`classroom_responses`" and its file-attachment twin. `classroom_save_instructor_response`
writes neither: it writes `classroom_instructor_responses`, 0128's own table, so
it was outside that census and nobody touched it. Measured by 0154 through the
real RPC, and re-measured here before anything was written:

1. it selects from `classroom_assignment_specs` and raises 'This assignment has
   no interactive spec.' with no row, so every instructor save on a schema-3
   item raised before looking at anything;
2. it resolves `p_block_id` inside that spec's modules, so a manifest's ids were
   unfindable even if a spec row had existed;
3. it gates on `textField|table|checklist` against a manifest's
   `text|longText|checkbox|radio|image|table`. **The two vocabularies overlap on
   one word.** That is why "give the ported item a companion spec row" is not a
   repair here either: five of the six types would still be refused.

## 0199

One `create or replace` at an unchanged signature, with one branch added, in
0197's shape. `_classroom_html_manifest(uuid)` and `_classroom_html_block(jsonb,
text)` are 0197's and are CALLED, not reimplemented -- two spellings of "is this
a ported document" is how a student save and an instructor save come to disagree
about which assignment they are on, and the precondition block refuses to apply
without them rather than creating its own.

The authorization stays where 0128 put it: `_classroom_instructor_copy_author`
initialises `v_email` in the DECLARE section, so it runs before the body and a
caller who may not keep a working copy reads their own refusal ahead of every
sentence below -- on both arms. It was deliberately not moved.

`@declaration` is refused on both arms in 0128's own words and 0128's own
position. 'An instructor copy carries no declaration.' is true whether the
assignment is a spec or a document, so the refusal is engine-independent and did
not grow an arm it does not need.

### The one decision that is a trade rather than a rule

**The six-type vocabulary is now stated in two functions**, 0197's and this one.
The alternative was extracting a shared predicate, which means `create or
replace`-ing `classroom_save_response` -- the live student write path, over a
live gradebook -- inside a migration titled "instructor copy". That was refused,
and the duplication is paid for twice instead:

- **behaviourally, on every suite run.** `tests/db/html-assignment-instructor-gate.test.ts`
  puts all six types plus a block id no manifest carries to BOTH functions, on
  one database, on the same document, and fails if either admits or refuses a
  type the other does not. Measured: all six accepted by both, the control
  refused by both.
- **at apply time.** 0199's self-check reads the DEPLOYED
  `classroom_save_response` back off `prosrc` and raises if any type this file
  admits is missing from it, so the file refuses to apply over a narrower
  student gate.

A test that runs forever is a better pin than a comment, and a stronger one than
a predicate only one of the two callers would have used.

### What a spec-backed assignment sees: nothing, and it is proved

`tests/db/html-assignment-instructor-gate.test.ts` follows CLAUDE.md's widening
rule literally. One database, one seeded class, a corpus of **21** calls to the
DEPLOYED function covering every branch the gate has -- the three types that take
a typed response, the one that does not, an `instructions` block with no id, an
unknown id, the upsert, the size cap, a null value, the declaration, an item with
no spec, a student, an instructor who manages no section of the item, a material,
an item id that does not exist, and the two answer-key functions before and after
anything is written. The mutable state is then reset to exactly what it was, 0199
is applied to that same database, and the identical corpus runs again.

**21 compared, 0 differences**, returned jsonb and refusal TEXT alike.

Two of those cases exist only to catch a reordering, because inserting an engine
discriminator ahead of the spec lookup is precisely the edit that could cause
one: a null value on an item with no spec, and `@declaration` on an item with no
spec. Both still answer about the spec, which is 0128's order.

**Three ported controls are asserted to DIFFER** -- a module block, a HEADER
block and a checkbox, all refused with 'no interactive spec' before and accepted
after. A corpus that matched case for case is also what a migration that failed
to apply produces; without the controls the file would be a green tick over an
apply that did nothing.

### The paste trap

A `$tag$` inside a `--` comment balances in Postgres and breaks the Supabase SQL
editor's client-side splitter. Checked two ways on this file: a grep for a line
whose leading token is `--` and which also carries a dollar-quote tag returns
**0**, and a scan of everything after the first `--` on every line returns **0**.
Both instruments return **1** against a planted positive control appended to a
copy of the same file. The file holds 8 dollar-quote tags, four balanced pairs
(`$pre$`, `$report$`, `$$`, `$checks$`), every one a real delimiter.

## The surface

`HtmlInstructorCopy.svelte` is `InstructorCopy.svelte` with the other engine
under it, deliberately and visibly: the same banner, the same key row, the same
designate and undesignate sentences, the same empty-copy refusal, with
`SpecRenderer` replaced by `HtmlAssignmentFrame`. Every string is IMPORTED from
`assignment-spec.ts` rather than retyped, so a teacher who keeps a working copy
of a v1 assignment and one of a ported assignment reads one vocabulary.

**What is deliberately not carried over is the save machinery.** `InstructorCopy`
owns a `SaveState`, a dirty set and a navigation guard because `SpecRenderer`
hands it one value at a time. The ported engine already has all of it --
`HxAnswers` holds one `SaveState` per BLOCK with its own debounce, backoff,
durability net and acknowledgement -- so this component takes a controller and
hands its four callbacks to the frame. A second save machine here would be a
second idea of what "unsaved" means on one page.

- **The controller is a REQUIRED prop**, which inverts the absence rule to the
  same end: there is no way to mount the working copy in a read-only shape at
  all, and a surface that cannot build a controller renders the ordinary frame
  instead.
- **The working copy REPLACES the read-only frame rather than joining it.** Two
  mounts of one document are two worksheets a teacher can type into, and the one
  that records nothing looks identical.
- **`htmlInstructorAnswers` is a SECOND prop**, never `htmlAnswers`
  reinterpreted for a manager. The two write different tables through different
  RPCs, and a single prop whose meaning turned on `canManage` is how a teacher's
  answers would one day land in `classroom_responses` as a student hand-in.
- **No progress rail.** A completion meter over a copy that is never graded and
  never handed in measures progress towards nothing; what a working copy is for
  is checking that the document RECORDS, and a block saving is what says so.

### Photographs, and the transports that are not there

There is no instructor counterpart to `classroom_submission_files`, and 0199 did
not add one. `hxInstructorAnswerTransports` therefore projects `saveResponse`
ALONE -- the identical function object `createInstructorCopyTransports` returns,
asserted by IDENTITY in the tests, so there is exactly one caller of
`classroom_save_instructor_response` in the codebase and it is not in this lane.

`HxAnswerTransports` became `Pick<..., 'saveResponse'> & Partial<Pick<..., three
file writes>>` to express that. **Handing the ENGINE's uploader over instead is
the tempting one-line fix and is much worse than nothing**:
`classroom_add_submission_file` opens a `classroom_submissions` row for its
caller, so a teacher pressing a camera inside their own working copy would
acquire a hand-in on their own assignment -- a row the grading console, the
Grades tab, the FACTS export and every roster read treat as a student's.

**Each absence settles a REFUSAL rather than dropping the message.** A message
the frame delivers and nothing answers is a camera control that silently does
nothing, and that is worse here than for a student: the instructor is the person
checking whether the worksheet works. `HX_REFUSALS.noInstructorFiles` is its own
sentence and deliberately not `readOnly`'s -- this worksheet IS taking typing,
and telling an instructor it is not open for editing would be false in the one
direction that matters to them.

## What rasterizing found, which no test would have

The harness frames the REAL ported document, IDEA100 Blade CAD 01. Looked at, at
1440 and 375:

- **The blade document paints its own global save state.** Before the refused
  picture its header reads `Saved 2026-09-11T14:54:48.132Z`; after it, its own
  generic `Not saved. Your work is still on screen; it has not reached the
  server.` -- its wording, not the controller's, and global to the whole
  worksheet even though only the picture was refused.
- **So the refusal REASON travels and whether it is SHOWN is the document
  author's decision.** That is a property of the bridge's single acknowledgement
  channel and is the same on the student path today. What it means here is that
  the only sentence guaranteed to reach an instructor about photographs is the
  one in PARENT chrome, which is why `HTML_INSTRUCTOR_COPY_UPLOAD_NOTE` is
  rendered unconditionally above the frame rather than only for a manifest
  declaring an `image` block.

## The harness, and the drive that could not be written

`/dev/html-instructor/copy` mounts the real component over the real ported
document, served by `./doc` through `/hx/`'s own `hxDocumentHeaders` and
`hxPortalOrigin` -- called, not copied, so the CSP including the `sandbox`
directive is the shipping one.

**`/hx/worksheet` cannot be used here and that was measured rather than
assumed.** Its block ids are `mod-1.a.team`, `mod-1.b.reflection`,
`mod-1.c.done` -- dotted, which `^[A-Za-z0-9_-]{1,40}$` refuses, so
`validateHtmlManifest` rejects that document outright ("Module mod-1 block 1
needs an id"). The fixture predates the charset rule and is written for the
bridge harness, which never validates. A working-copy harness built on it would
have shown a teacher a worksheet recording answers under block ids
`classroom_save_instructor_response` would refuse -- a harness that lies in the
exact direction this surface exists to catch.

**The browser route's first drive does not work, for the best possible reason.**
It typed into the document through the frame's own `contentDocument`. Measured,
that is `null`: `HX_SANDBOX_FLAGS` withholds `allow-same-origin`, so the document
sits at an opaque origin and the parent cannot reach into it -- the same refusal
that stops the document reaching out. The instrument is subject to the property
it is measuring. So the null is ASSERTED instead, and the end-to-end reading
comes from the document's own code: the blade document prefills its date field on
load and sends the ordinary `idea:change`, which leaves an opaque origin, is
accepted on source and shape, is resolved from the FIELD the document named to
the permanent BLOCK ID through the parent's stored manifest, and is written
through the projection. The row reads `package-date · {"text":"09 / 11 / 2026"}`.
That is stronger evidence than a scripted keystroke that a real ported document's
own writes land, and weaker evidence about typing specifically -- a human pass is
what covers that and this file cannot.

The value is not pinned, only its shape: the document prefills TODAY, so
asserting the string would redden every day but one, which is the ratchet rule in
miniature. `"text"` is the codec's own key and is what says the value reached the
column in the shape `classroom_instructor_responses` holds.

## What was measured

- **`svelte-check`: 0 errors, 37 warnings, 31 `state_referenced_locally` / 5
  `css_unused_selector` / 1 `perf_avoid_nested_class`.** Exactly the baseline
  read off `origin/integration` at branch time, re-derived rather than trusted:
  `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` were written to `.env`
  with placeholders BEFORE `npx svelte-kit sync`, which is what keeps the fresh
  checkout's phantom `$env/static/public` errors out of the count. 3228 files
  against the baseline's 3220. **The sync is not optional after adding a route**:
  without it this tree reported 2 phantom `Cannot find module './$types'` errors
  in two files the change never touched.
- **Full suite: 393 files, 7601 tests, all passing.** Baseline on
  `origin/integration` at branch time was 385 files / 7575 tests.
- **`tests/db/html-assignment-instructor-gate.test.ts`: 8 passed.** Read off the
  verbose per-test output rather than the summary, because a `startTestDb` that
  never booted reports the file as passing nothing: 21 spec-path cases printed
  with their answers, 3 controls printed before and after, six vocabulary lines,
  the key round trip, the boundary with both its positive controls, the ACL.
- **`tests/db/html-assignment-revision.test.ts`: 7 passed**, down from 8 -- the
  0154 probe is deleted, not inverted, and its now-dead `refusal` helper with it.
- **The read-only claim, mutation-proved.** Two mutants on the grading route --
  a write callback on its frame, and a `HtmlInstructorCopy` mount -- each
  reddened exactly one assertion and nothing else. Restored from a COPY and
  md5-verified byte-identical, never with `git checkout --`.
- **`npm run verify:browser -- --route html-instructor/copy`: 42 measurements, 0
  outside threshold**, at 375 and 1440. Contrast on the banner sentences 6.84:1,
  the photograph note 6.91:1, the answer-key chip 7.52:1, all against the real
  rendered ground. Tap target on the answer-key control 259.9x44, smallest
  dimension 44px. 0px horizontal overflow at both widths. Presence both
  directions: exactly one working copy, one banner, ONE frame, one recorded row,
  one refusal, and the empty-state line gone.
- **Console errors: 0, with 3 ignored by named pattern.** Two of those come from
  INSIDE the frame -- the blade document references a favicon and a Google Fonts
  stylesheet and the document CSP refuses both. That is the real behaviour of
  that document under the real policy, not something the harness introduced, so
  it is named by pattern (which the runner still prints) rather than left to fail
  a threshold about our own page.
- **`node tools/claude-md-check.mjs`: agrees with the tree.**

## What was NOT verified

- **The migration is NOT APPLIED.** No session container can reach the database:
  the agent proxy accepts a CONNECT to 5432 and carries no bytes. Every database
  claim here is against a real embedded Postgres with the real chain applied, not
  against production.
- **No signed-in session and no real Supabase.** The harness transports are
  in-memory stand-ins for 0128's, so what the browser pass measures is that a
  change reaches `saveResponse` with the right block id -- that the RPC then
  accepts those ids is the database test's half.
- **Typing by hand into the document.** Impossible from the harness, per the
  `contentDocument` finding above; the automatic reading is the document's own
  on-load change.
- **`prefers-reduced-motion`,** which the harness leaves at `no-preference`, and
  **web fonts**, which it blocks -- text is measured in the fallback stack.
- **The item page itself in a browser.** It needs a session and a database; what
  is driven is the harness that mounts the identical component.

## Deferred

- **An instructor-side file table.** The honest fix for photographs is a
  counterpart to `classroom_submission_files`, which is a migration, a bucket, a
  storage policy and a serve path of its own. Until then the refusal is the
  answer and it is said in words.
- **A per-block acknowledgement channel.** The blade document's global "Not
  saved" on any failed ack is a bridge property, not this lane's, and changing it
  means changing `idea:saved` for every ported document already in circulation.
