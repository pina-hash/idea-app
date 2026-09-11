---
title: "A posted ported HTML assignment can be replaced, and the re-upload counts the answers it would orphan before it writes; the instructor working copy stays unbuilt because `classroom_save_instructor_response` still carries 0128's spec gate (`claude/beautiful-hawking-7dm6ho`, ledger 0154, no migration)"
date: 2026-09-11
branches: [claude/beautiful-hawking-7dm6ho]
migrations: []
subsystems: ["Classroom", "Interface", "Testing"]
---

Two gaps were named. One shipped in full. The other is blocked by a function
nobody widened, and this entry is mostly about why not building it was the
answer.

## GAP ONE -- a posted document could not be changed at all

`canStageHtml` in `ContentComposer.svelte` required `mode === 'create'`, so the
upload panel did not render on an edit and there was no path to replace a
ported document. A typo in a worksheet a class was already working in was
permanent. Decision 10's recorded narrowing is that the instructor edit path IS
re-upload producing a new revision, because a sandboxed document cannot be
edited in place.

The write side already existed and needed nothing.
`classroom_set_html_assignment` (0195) upserts onto the SAME `document_id` --
so the frame src never moves out from under a reader -- and snapshots the old
document into `classroom_content_revisions`. Measured before any code was
written, against real Postgres and the real RPCs:

```
first upload: ok=true doc=ff72aa58… revision=null
save b-one / b-two: {"ok":true}     stored responses: b-one, b-two
re-upload:    ok=true doc=ff72aa58… revision=1 sameDocumentId=true
responses after re-upload: b-one, b-two
```

That last line is the whole bundle. **A block id is the join key for every
stored answer.** A `classroom_responses` row names an item and a `block_id` and
nothing else about the document, so a re-upload whose manifest renames an id
does not move the rows under it and does not delete them -- they stay exactly
where they were and stop being reachable, because no block in the new document
carries that id. No error, no empty row, no warning. The worksheet renders
perfectly and a term of work is gone from the screen.

### What was built

`htmlManifestDiff(previous, next)` in `store.ts` splits the ids three ways --
kept, removed, added -- walking the HEADER as well as the modules through
`manifestBlocks`, because a student's name is an answer stored under a block id
like any other and a modules-only walk would report a renamed identity field as
nothing at all. `assessHtmlReupload` puts the removed ids to the database
through a `countOrphanedAnswers` transport and builds the sentences a teacher
reads.

The three sentences on the dangerous shape, as they render:

> 3 answer blocks are in both documents (who, b-setup, b-error). Every answer
> stored under them is kept.
>
> 1 answer block is new (b-passes). Nothing is stored under it yet, so nothing
> is at risk there.
>
> 1 answer block in the document on this assignment is not in the new one
> (b-reading). 3 answers are stored under that block. Replacing the document
> does not delete them and does not move them: they stay in the database and
> stop appearing anywhere, because no block in the new document carries the old
> id. Give the new document the SAME block ids and the work comes back.

and the confirmation reads **"Replace the document and orphan 3 answers"**.

### The decisions inside that, and why each is the way it is

**THE COUNT IS COUNTED, NOT ESTIMATED, AND THAT IS WHY IT IS A TRANSPORT.**
"This could affect student work" is a sentence people learn to click through;
"3 answers" is not. The figure is read from `classroom_responses`, scoped to
exactly the ids about to be dropped, for this item, now.

**IT COUNTS UPLOADED FILES TOO, AS A SECOND FIGURE.** A dropped image block
orphans a photograph exactly as a dropped text block orphans a sentence, and
counting only responses would understate the loss on the one block type where
the work is hardest to redo. Two real counts, named separately; neither is
inferred from the other, and a total would hide which.

**A DROPPED BLOCK NOBODY ANSWERED COSTS NOTHING AND IS WAVED THROUGH.** It is
named in the report and asks for no second press. A guard that fires when
nothing is wrong is a guard people learn to click through, which costs the one
case it exists for.

**EVERY WAY OF NOT KNOWING FAILS CLOSED.** A stored manifest that cannot be
walked answers NULL rather than an empty diff -- an empty diff would read as
"nothing at risk" on exactly the input where nothing is known -- and a refused
count, a thrown count and an absent counter all require the confirmation, whose
label becomes "Replace the document without knowing what it orphans". `null`
from the counter is never read as zero. This is `htmlAssignmentMount`'s own
rule about which engine an item is, applied one surface over.

**`countOrphanedAnswers` IS THE ONE OPTIONAL TRANSPORT HERE THAT FAILS CLOSED
RATHER THAN QUIET.** Every other absence in this module removes a WRITE, so
nothing can go wrong by omitting one; omitting this one would remove a WARNING
and leave the write. The asymmetry is written down beside the field.

**THE SECOND PRESS IS A CHECKBOX, NOT AN ARMED BUTTON.** What it records has to
survive everything else on the form -- a teacher confirms the cost, goes back to
fix the title, then posts -- and an arm-then-confirm pair would need re-arming
after every unrelated keystroke, which is how a confirmation becomes a thing
people click twice without reading. It is retracted by any new pick and by
Cancel, so it can never stand for a document other than the one on screen.

**THE POST CONTROL IS `aria-disabled`, NEVER `disabled`.** A genuinely disabled
control swallows the pointer event a cue would have to fire from, and the whole
point of the hold is that there IS a reason the teacher has to be able to reach.
The press lands in `submit`, which reads the same `htmlReuploadHold` predicate
the control's own state reads -- one predicate, because two spellings of "is
this ready" is what produces a click that does nothing and says nothing. The
refusal takes the WHOLE post, not just the document: posting the title and
skipping the upload would leave a teacher looking at a saved item and an
unreplaced worksheet, which is the same silence this gate exists to end.

**THE EDIT ARM IS NARROWER THAN THE CREATE ARM, AND `htmlAssignment` IS THE
NARROWING.** It offers a REPLACEMENT for a document already there, never a
CONVERSION of a v1 spec assignment into a ported one -- which is a different
decision, with a spec and a rubric and a term of spec-keyed answers on the other
side of it. An assignment with no stored document shows nothing on an edit,
exactly as before.

**THE RUBRIC FLAG IS RECOVERED, NOT REMEMBERED.** `stagedRubricDerived` cannot
survive a page load, so an edit always arrives holding `false`, which
`stagedRubricAfterManifest` reads as "nothing of anybody's is here" and
overwrites -- eating a rubric somebody corrected by hand.
`manifestRubricIsDerived(stored manifest, stored rubric)` asks the only question
that decides it, which is what store.ts's own header already told a re-upload
surface to do. A stored manifest that cannot be read answers false, which leaves
the rubric alone; the acknowledgement then SAYS the rubric was left as it is and
to check it against the new document, because that is the one case where the
grading console legitimately no longer matches the worksheet.

**THE COUNTER LIVES IN THE ITEM ROUTE AND NOT IN `transports.ts`.** The edit
path is its only caller -- the create-mode composer is mounted by the class
layout and has no stored document to diff against, so a counter there would be
dead code. There is exactly one implementation either way; the day a second
surface needs one it moves beside the factory.

## GAP TWO -- the instructor working copy, and why it was not built

`InstructorCopy.svelte` does exactly this for a `schemaVersion: 1` spec, and its
own header says it knows nothing about schema 3 on purpose. The ask was to hand
a schema-3 item the same thing: a writable frame stored against the
instructor's own identity, autosaving, designatable as the key.

**THE DATABASE REFUSES EVERY ONE OF THOSE SAVES.** Measured through the real
RPC on a real schema-3 item:

```
classroom_save_instructor_response on a schema-3 item
  => This assignment has no interactive spec.
the same call on a v1 spec item => ACCEPTED
```

`classroom_save_instructor_response` (0128) reads `classroom_assignment_specs`,
raises without a row, and resolves the block id against that spec with a type
gate of `textField|table|checklist` -- against a manifest's `text`, `longText`,
`checkbox`, `radio`, `image`, `table`, an overlap of ONE. It is precisely the
gate 0197 opened for `classroom_save_response` and
`classroom_add_submission_file`, and 0197 did not touch it. There is one
definition of that function in the whole tree and one caller.

Ledger 0154 carried `Migration permitted: no. Claims: none.` and an instruction
to stop and report if one turned out to be needed. So the surface was not built.
**A writable frame over a shut gate is a worksheet that takes typing and saves
nothing**, which is the one failure this feature's own rules name as worth
avoiding -- and it would be worse than the current read-only state, not better,
because a teacher would believe they had confirmed the document saves.

What was built instead is the record: a probe in
`tests/db/html-assignment-revision.test.ts` that pins the refusal by its exact
text, with a spec-backed item as the positive control so the refusal is
provably about the ported item rather than about the caller or the fixture. It
is **written to be DELETED rather than inverted**, exactly as
`tests/db/html-assignment-write-gate.test.ts` was before 0197 moved the student
gate. The repair is one branch in one function, the same shape 0197 gave the
other two, and it belongs in a bundle that may carry a migration.

The consequence the original prompt named is still true and is worth restating
plainly: **nobody can open a ported document as themselves and confirm it saves
before a class uses it.** The first person to find a broken worksheet is still a
student. What 0154 removed is the adjacent, larger failure -- that a broken
worksheet could not be FIXED once posted.

## The read-only half, proved separately

`tests/html-assignment-instructor-readonly.test.ts` sweeps the grading console's
`HtmlAssignmentFrame` mount and asserts it carries `readOnly`, `saved={null}`
and none of the four write callbacks, with the item page's mount -- which
legitimately carries all four -- read by the SAME parser in the same run as the
positive control. Without it a parser that silently matched nothing would report
every mount as callback-free.

The four swept names are checked against the component's own props declaration
rather than maintained by hand: the frame declares seven `on*` props, four of
which can carry an answer and three of which (`onready`, `onheight`,
`ondropped`) are notifications that cannot. Both lists are pinned and the length
is asserted, so a FIFTH callback lands in neither set and reddens here rather
than being discovered on the console.

**Mutation-proved.** One permissive mutation -- `onchange={() => {}}` added to
the grading mount -- reddens exactly one assertion; the file was restored from a
`cp` copy, md5-identical (`bc2d30de6c4e136e1c940d77b85d485d` both sides), and
re-verified green. Restoring with `git checkout --` was deliberately not used:
this tree was uncommitted at the time, and that command is a discard-to-HEAD.

## What was measured

**The three shapes, against real Postgres with real stored answers**
(`tests/db/html-assignment-revision.test.ts`, 8 tests):

| shape | verdict | stored answers before / after |
| --- | --- | --- |
| every id kept | one press, `counts {responses: 0, files: 0}`, revision 1, same `document_id` | 6 / 6 |
| `b-reading` renamed | HELD, `counts {responses: 3, files: 0}`, confirm names 3 | 6 / 6, three of them now unreachable |
| a block added | one press, nothing lost, and the new block then takes an answer | 6 / 7 |

The orphaning is a READING, not a claim: the rows are read straight off the
table as the connection owner after the re-upload and printed.

**The rules, with no database** (`tests/html-assignment-reupload.test.ts`, 14
tests): ten unwalkable stored-manifest shapes answer null with a positive
control beside them; refused, thrown and absent counters all fail closed with a
working zero-count as their control; singular and plural read correctly; the id
list caps at six and counts the rest.

**The harness fixtures** (`tests/html-assignment-reupload-fixtures.test.ts`, 10
tests) go through the REAL importer. This caught one: the first draft carried a
manifest and no bridge script, and all four were refused with "The document
never sends idea:ready" -- correctly. A harness whose fixture the importer
refuses measures the refusal panel and reports it as the diff panel working.

**In a real browser**, driving the real component at 1440 and 375:

- the panel, the report, the confirmation and the held sentence all present and
  visible exactly once
- `aria-disabled=true disabledAttr=false` on the publish control while held;
  pressing it writes NOTHING and prints the held sentence in the form's own
  message line; ticking the box clears the attribute and the post then writes
- the clean shape offers no confirmation and no held sentence at all
- contrast against the REAL rendered ground: verdict sentences **6.84:1**,
  confirmation label **6.84:1**, held sentence **6.91:1** (floor 4.5); the
  panel's amber edge computes **5.79:1** against its own surface (floor 3.0)
- tap target, HIT-TESTED at the label: **1025.3x44** at 1440 and **312.3x44** at
  375
- no horizontal scroll at either width (375 vs 375, 1440 vs 1440)
- `npm run verify:browser --route /dev/html-instructor`: **40 measurements, 0
  outside threshold** across both widths

**The browser route bites.** One permissive mutation -- the hold never engages --
reddens 6 of 20 measurements at 1440; `ContentComposer.svelte` restored md5-identical.

## Two findings about the instruments, kept because both cost time

**A PREPARE STEP CANNOT ASSERT ITS OWN EFFECT IN THE SAME TICK.** Written as one
step -- click the confirmation, then read `aria-disabled` off the publish control
synchronously -- the route reported `aria-disabled=true` through all twelve
attempts, at both widths, on a page where the release genuinely works. The click
sets `checked` and schedules the derived; Svelte applies the attribute on a later
microtask. Split into two steps, the `until` on the second waits for the flush
and it lands on attempt 1. A step whose action and whose assertion are the same
statement cannot wait for itself.

**THE RUNNER HAS NO TOP-LEVEL `evaluate` CHECK.** The first draft of the route
spec carried an `evaluate: [...]` array with `expect:` fields beside `presence`
and `contrast`. Nothing consumes it -- the runner reads `presence`,
`textContains`, `contrast`, `tapTargets`, `tapReach`, `domOrder`, `orderResult`,
`datalistOrder`, `statePairs` and `motion` -- so three assertions would have sat
in the file looking measured and measuring nothing. It is the silent shape
`prepareStepShapeResults` exists to catch one level down, and there is no
equivalent guard for an unknown top-level key.

**A SCOPED CLASS LOST TO A TAG-PLUS-CLASS SELECTOR.** The confirmation rendered
with its checkbox CENTRED ON ITS OWN LINE above the sentence: this form's own
`label { display: flex; flex-direction: column }` -- every other label here puts
its caption above its input -- is (0,1,1) and beat `.reupload-confirm` at
(0,1,0). The box still measured **44px tall** while its contents overflowed it,
which is exactly why the tap floor is hit-tested rather than read off a computed
height. Fixed by selecting `label.reupload-confirm` and stating
`flex-direction: row` rather than relying on a default this element does not
inherit.

## What is NOT verified

- **Nothing was run against the live Supabase project.** The local `.env` is a
  placeholder (`example-ref`); every database measurement here is the embedded
  Postgres fixture with the real migration files applied unmodified.
- **No signed-in surface was driven.** `/dev/html-instructor` mounts the real
  `ContentComposer` with in-memory transports; the real edit path on
  `/classroom/<section>/item/<item>` needs a Bosco Tech Google session no
  automated run holds.
- **The counter's two PostgREST reads were not executed against a live
  PostgREST.** The item route's `countOrphanedAnswers` is asserted in SQL shape
  by the db test's equivalent counter (run as a manager, under RLS); the
  `.in()`/`!inner` embed itself is exercised by no test. A stale embed there
  would answer `PGRST200`, which this design reads as "could not count" and
  fails closed on -- so the failure mode is an unnecessary confirmation, never a
  silent zero.
- **`prefers-reduced-motion` was not exercised**; the harness runs at
  `no-preference`, and web fonts are blocked, so all text was measured in the
  fallback stack.

## Deferred

- **The instructor working copy for schema 3**, which needs one branch in
  `classroom_save_instructor_response` mirroring 0197's. The probe pinning the
  current refusal is written to be deleted in that bundle.
- **A dropped image block's uploaded files are counted but not offered a
  path back.** The confirmation says how many there are; restoring them still
  means putting the old block id back in the document.
- **The re-upload panel does not show the revision history.** The old document
  is kept as a revision and `classroom_restore_revision` already handles the
  `html_assignment` target, but nothing on this surface links to it.
