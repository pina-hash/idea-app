---
title: "Three of Mr. Pina's five grading asks, and the two prompt claims the tree refused: the rubric sits beside a ported HTML assignment (the withholding rested on a HARNESS reading), batch grading reaches the per-section console without it becoming the cross-class console, and dictated feedback lands in the comment and every criterion note (`claude/new-session-cf42g6`, no migration)"
date: 2026-09-22
branches: [claude/new-session-cf42g6]
migrations: []
subsystems: ["Classroom", "Grading", "Dictation", "Browser verification"]
---

Lane D1 was issued five grading-console reports and permission for exactly one
migration, `0219`. Three shipped; two are left; **`0219` is released unclaimed**,
because the three that shipped need no schema change at all. That is worth saying
plainly rather than as an omission: this bundle deploys with nothing for Mr. Pina to
paste into the SQL editor and no ordering between an apply and a deploy.

Baselines re-derived at branch time on `origin/main` at `1ec2f640`, which is this
session's starting sha exactly: **`svelte-check` 0 errors, 37 warnings in 20 files**,
breakdown **31 `state_referenced_locally` / 5 `css_unused_selector` / 1
`perf_avoid_nested_class`**. That is `CLAUDE.md`'s stated figure to the digit, so
that line needed no correction for the seventh time. It held at 37/20 at every
checkpoint in this bundle.

## What shipped, and what did not

| # | Report | Outcome |
|---|---|---|
| 1 | AI grade import + hidden grading standards | **Left.** Reasoning below. |
| 2 | Quick return a zero or incomplete | **Shipped**, minus "incomplete", which is a schema change. |
| 3 | Voice / dictated feedback | **Shipped.** |
| 4 | A comment bank | **Left.** This is what `0219` was for. |
| 5 | The rubric beside a ported HTML assignment | **Shipped.** |

The prompt said five was a lot and that shipping three well beats shipping five
thinly. That is the call made here, and the three chosen are not the three cheapest
-- they are the three that remove friction from something Mr. Pina does every
period, and that can be verified end to end in a container with no database.

## Report 5, and the reason it is first: the withholding rested on a harness reading

The side-by-side layout was already built (`.work-split.has-rubric`, a two-column
grid) and deliberately withheld from ported documents, with a long comment giving
measured numbers: `main.cr-console` caps itself at 960px, so the roster takes 320
and the split gets **562 at 1440 and at 1920 alike**, which at `1.05fr : 1fr` is
280px of document -- "so the wide arrangement never has room".

Every one of those numbers is real. They were measured on
`/dev/html-assignment-grading`, **which does not set `--cr-measure-route`**. The real
route does, in `src/routes/classroom/+layout.svelte`, from
`classroomMeasure('item-grade') === 'console'`, and `--measure-console` is `100%`.
So in the harness `--cr-measure` falls back to `--measure-page` (60rem) and on the
page an instructor actually opens it resolves to the window.

This is `CLAUDE.md`'s own named failure -- *a harness must mirror the whole mechanism
it stands in for* -- and this is what it costs: a layout decision taken against a
width the surface never has. Measured under the real route's condition, same fixture:

| viewport | main | roster | split | document col | rubric col |
|---|---|---|---|---|---|
| 1440 | 1408 | 320 | **1009.6** | **509.7** | 485.5 |
| 1920 | 1888 | 320 | **1489.6** | **755.6** | 719.6 |

The document gets 509.7px at 1440, not 280 -- more than the whole split was under
the stale reading.

**And it fits, measured on the real ported worksheet rather than the smoke fixture.**
`idea100-blade-01.ported.html`, 47 inputs and 2 tables, driven at every column width
the split can produce:

| document column | horizontal overflow | document height | inputs clipped |
|---|---|---|---|
| 297px | 0px | 11664px | 11 |
| 400px | 0px | 9020px | 6 |
| 510px | 0px | 7617px | 6 |
| 756px | 0px | 6278px | 1 |
| 1010px | 0px | 5960px | 1 |

It never overflows horizontally -- it is a responsive document -- so the question was
never *does it fit* but *how much taller does it get*. At 1440 that is 7617 against
5960: **1657px more document scroll, bought by taking the rubric out from under
5960px of document and putting it beside it in its own scroll container.** That is
the trade Mr. Pina asked for in the words "a despicable amount of scrolling".

**The floor is the knee in that table**, which is the one thing this adds. Between
400px and 297px the document gains 2644px and five more inputs clip; above 400px it
is flat. From the split's own arithmetic -- `column = (viewport - 444.8) * 0.5122`,
exact at both measured widths -- 400px of document needs 1226px of viewport, so the
collapse sits at **78rem**, giving 411px.

### The band that could have broken, and did not

Between 1024px and 78rem a document is stacked while still carrying `has-rubric`,
and the application frame hangs two-pane scrolling off that same class. Collapsing
the *tracks* alone would have left a one-column grid whose first child scrolls
inside a bounded `minmax(0, 1fr)` row and whose second child -- the rubric -- lands
in an implicit `auto` row underneath and overflows the pane, with no scrollbar and
no way to reach the bottom of it. Nothing on screen reports that and it is only
reachable between two breakpoints.

So the collapse reverts `display` to the flex column, and a media query bounded at
**both** ends tells that band it is one scroller. Bounded at both ends on purpose:
unbounded, `overflow-y: visible` on `.work-col` would reach 1440 and 1920 and take
the independent panes away from the arrangement this whole change exists to switch
on.

Verified in Chromium at 1100 / 1240 / 1260 / 1440 / 1920: flex one-scroller below
the breakpoint, two independently scrolling columns above it, rubric reachable in
every band. **A spec assignment is unchanged by construction** -- `documentWork` is
false for one, so neither the widened class nor any new rule applies to it.

### The harness is fixed, not worked around

The first version of this bundle measured the real route's condition by
INJECTING `--cr-measure-route` into the harness at runtime, and left the
fixture alone. That was wrong, and the browser pass said so: the collapse is a
viewport media query, so at 1440 the harness reported `splitDisplay=grid` --
two columns -- over a container that was still 562px wide, which is a 280px
document column and exactly the state this bundle exists to avoid. The spec
would then have pinned a cramped arrangement the real route never produces,
and the next session to read it would have "fixed" the wrong thing.

So `/dev/html-assignment-grading` sets `--cr-measure-route: var(--measure-console)`
and carries `.cr-app`, which is what `src/routes/classroom/+layout.svelte`
does, from the same answer. **The harness now reproduces the injected numbers
exactly** -- 1009.6 / 509.7 at 1440 and 1489.6 / 755.6 at 1920, measured a
second time with nothing injected -- which is the confirmation the table above
deserved and did not have.

**A viewport media query is the right instrument HERE and that is worth stating,
because the harness discrepancy looks like an argument against it.** A container
query is the honest shape for "is there room", and it was the first design; it
is refused because `container-type: inline-size` makes the element a containing
block for `position: fixed` descendants and the level tooltip is placed by
`$lib/shell/anchored`, which writes exactly that. What makes the viewport query
correct is that `document-work` can only ever be true on ONE route -- the
per-item grade route, whose measure is `console`, i.e. the window. The
cross-class console never sets it, because it is handed no `htmlWork` at all.

### And the spec asserts the rule rather than the state

`html-assignment-grading.mjs` had `rubricBeside=0` pinned, which is the
withholding this bundle removed, and its comment carried the stale 562px
reading. It reads `rubricBeside=1` and `documentWork=1` now -- and for the
arrangement itself it asserts `collapseMatchesWidth`, because the spec runs at
two widths against ONE expected array and the arrangement legitimately differs
between them. A literal could only have been right at one width; the rule
("grid exactly when the viewport is at least 78rem") is true at both and false
the moment either half moves without the other.

`document-work` is not a second arrangement. It declares no columns, no gap and no
ratio; it re-points the collapse point of the arrangement `has-rubric` already
describes. The previous author rejected a modifier class on the ground that it would
be a second arrangement to keep in step, and that ground still holds -- which is why
this is a breakpoint and not a layout.

**A container query was the first design and was refused.** The question "is there
room for two columns" is genuinely about the container, and the container is what
was measured -- but `container-type: inline-size` makes the element a containing
block for `position: fixed` descendants, and the level tooltip is positioned by
`$lib/shell/anchored`, which writes exactly that. It would have been positioned
against `.work` instead of the viewport.

## Report 2: the prompt's cheapest-large-win was the wrong change

The prompt said *passing the `bulk` prop is the cheapest large win here*, and told
the lane to read the console's own comment before assuming it is one line. The
comment is what says the prompt is wrong.

`BulkGradingTransports` carried **two capabilities that only ever travelled
together**: `loadAcross` (read one assignment across every class the caller teaches
it in) and `gradeMany` (write many students in one statement, 0175). And
`GradingConsole.load()` branches on the OBJECT:

```
if (bulk) { const res = await bulk.loadAcross(item.id); ... }
```

So handing the per-section route that prop would not have given it batch grading.
It would have replaced Mr. Pina's one class with every class he teaches the
assignment in -- which is a different page, that already exists at
`/classroom/grading/<itemId>`, and that the per-section console **links to**. That
is the whole reason the report exists: every piece of the machinery was built and
none of it was reachable from the route he grades on, because the only switch also
changed what the page was.

**`loadAcross` is optional now.** The object says a console may write a batch; the
method says it also reads across classes. `createBatchGradingTransports` is
`createBulkGradingTransports` minus that one key, written as a rest-spread of it
rather than as a second factory, so there is still exactly one statement of the
batch write and its refusal wording.

**Four things hang off the method rather than the object, and the fourth is the one
that would have gone unnoticed:**

1. the section grouping;
2. the section labels on each row;
3. **the presence scope** -- `bus.loadPresence(item.id, bulk ? null : section.id)`,
   where `null` asks for every section the caller manages. Keyed on the object it
   would silently have widened the per-section route's presence read the moment that
   route gained batch grading;
4. **the link across**, which lived in the `{:else}` of the same conditional as the
   batch bar. Keyed on the object, the page would have become the page it used to
   link to, with the link gone.

### The zero

`bottomLevelScores` reads each criterion's own bottom level rather than filling 0.
`criterionIssues` already enforces that a valid rubric's bottom level is worth 0, so
on every valid rubric the two agree -- but **a rubric mid-edit is not required to be
valid**, and a criterion migrated from the flat format can have one level. Writing 0
there is a number no level explains, which is precisely the override
`_classroom_check_levels` then demands a written justification for. A criterion with
no levels at all contributes no key rather than a 0, for the same reason.

**One control serves both paths, and that falls out of the console's shape rather
than being arranged**: `scores` is both what the rubric panel binds and what
`bulkPlan` sends to everyone ticked. So the control is a zero for the open student if
nobody is ticked and a zero for thirty if `Nothing handed in` is. It goes through
`pickLevel` per criterion rather than assigning `scores`, because `pickLevel` also
closes the override box and drops the criterion from `needComment`.

**It fills the form and sends nothing.** Return still arms and still confirms; the
batch still shows its plan first. A one-press "zero everyone" with no plan in between
is the one gesture on this surface nobody could take back.

The new preset is `missing` -- "Nothing handed in" -- written as the exact complement
of `submitted` through one shared predicate, so the two can never both claim a
student or both miss one. **It is deliberately not `ungraded`**, which is the one it
will be confused with: a student who handed in on time and is waiting is `ungraded`
and must never be swept into a zero.

`BULK_PRESETS` is now the single statement of which presets exist, with `BulkPreset`
derived from the array rather than written beside it, so adding a member makes both
the label map and `applyPreset`'s switch refuse to compile until they agree.

### Verified

Three transport shapes on one fixture: cross-class (presets, **7** tick boxes, 2
section groups, no link), batch-over-one-section (presets, **4** tick boxes, 0
groups, **link present**), no batch (0 presets, 0 ticks, link present). The tick-box
count is the assertion that catches a widened read -- the markup is identical either
way.

Driven end to end on the per-section shape: `Nothing handed in` selected Dara Nwosu,
the zero control put both criteria on "0 Absent" and the total on `0 / 20`, the batch
count read "1 student selected, all in IDEA100 - Period 1 - Block 1", the plan said
"About to return 1 grade", and the roster read back **`Dara Nwosu Returned - 0/20`**.

### What "incomplete" would have cost, and why it is not here

There is **no incomplete state in the schema**. A submission is `submitted` or
`returned` plus a lock; the roster's "incomplete" chip is a count of unmet spec
checks, not a grade. Adding one is a migration touching every reader of
`classroom_submissions.state` -- the grading console, the FACTS export, the Grades
tab, the GitHub export -- and it is a decision about what a teacher means by it
before it is a schema change. **The half Mr. Pina actually needs is shipped**: the
work that earns a zero is the work that never arrived, and that is now one preset
and one press.

## Report 3: no speech code was added

`$lib/feedback/dictation.ts` was already a complete Web Speech wrapper -- the
session, the four events, the refusal sentences, the language, and
`appendDictation`, which never removes a character -- and nothing in it mentions
feedback. It is imported, not copied. Nothing is recorded or uploaded; Mr. Pina said
he did not want to spend the storage and this spends none.

**One controller per console, holding one session.** A rubric puts five of these
buttons on one screen, so a `Dictation` per button is five recognisers racing for one
microphone: the second `start()` either throws or takes the microphone from the
first, and what a grader sees is two buttons reading STOP while their words land in
the field they stopped dictating into. `Dictation.start` already refuses a second
session on one instance, so holding exactly one makes *only one field at a time* a
property of the object graph rather than a rule every call site has to keep.

Switching fields is a **queue, not a restart**: `stop()` is not synchronous, so
starting the next field immediately hits that same early return and lights a button
that never hears anything. The `end` event is what starts the next one.

### Two defects the browser pass found that reading would not have

**The refusal did not outlive the session it ended.** Rendered only while the field
was still listening, a denied microphone cleared the listening state correctly and
took the explanation with it: the pass reported `error=ABSENT` beside a tidy button
reading DICTATE. That is what a silent failure looks like from outside -- everything
in order and nothing said. `errorKey` is the split, keyed per field so one refusal is
not printed under all five controls.

**The harness fixture was modelling nothing real.** Its `refused` mode fired an
`error` with no `end`, which no real recogniser emits -- a session that errors is
over, so it ends. Written that way it left the button reading STOP forever, and the
mode was certifying a dead branch. It errors and then ends now, like a real one, and
a separate `broken` mode makes `start()` **throw** -- the one real path with no `end`
at all, which is what Chrome does on a second start and what `Dictation.start`
catches. Both are shapes the real producer can emit; that is the point.

### Verified

`?speech=none` renders 0 controls with the textareas intact (the Firefox and
third-party-iPad case). A transcript appends to text already typed:
`"Typed before speaking."` became `"Typed before speaking. clean weld, but the
fillet radius is undersized"`. Interim text sits beside the field in a live region
and never in it -- traced frame by frame: at ~200ms the region read "clean weld" and
the field was still empty; at ~400ms the final was in the field and the region
cleared. Pressing a criterion's control while the comment was live ended with
exactly one listening, the words in the field that won and the abandoned one empty.
Tap targets 90x44 and 125x44 at 1440 and 375; the zero control 212.1x44 / 269x44 /
170x84.4 / 254.6x54.4.

## Mutation proof

Eleven mutants. **Ten killed, one killed only by the browser harness, and one of the
ten survived on the first attempt -- both of those are the findings worth keeping.**

`tools/mutate-check.mjs` was written for this and answers all three of the traps
`CLAUDE.md` names: it restores from a byte copy in memory and md5-checks the restore
(never `git checkout --`, which is a discard-to-HEAD); it parses the summary line
rather than trusting vitest's exit code; and it concatenates stdout and stderr on
every path. It runs a green control first and refuses to report any verdict if the
clean tree is not green.

**M1 SURVIVED at first.** The generalized preset assertion took its population from
`Object.keys(BULK_PRESET_LABEL)` -- so deleting a label removed it from the
population too, and 55 tests passed over the exact key that had gone missing. A
sweep whose population comes from the thing under test cannot see anything leave it.
Repointed at `BULK_PRESETS`, which is the order list the console renders from, it
kills. That is also why the pinned `toHaveLength(4)` it replaced was the wrong
assertion in the first place: it was a number a legitimate change necessarily
breaks, and the repair offered each time is to write down the new number.

The other seven in that group: `bottomLevelScores` reading a literal 0; scoring a
level-less criterion; `missing` silently becoming `ungraded`; exclusivity replaced by
an immediate restart; `errorKey` never set; the no-`end` guard removed; and interim
text written into the field.

**M11 SURVIVED `npm test` AND IS REPORTED AS SUCH, because the thing it breaks is
not covered by the suite at all.** It is the change the prompt proposed -- the
console branching on the OBJECT again (`if (bulk)`) rather than on the method --
and nothing in `tests/` mounts `GradingConsole`, so 60 tests passed over a console
that would have turned the per-section grading route into the cross-class one. The
browser harness is what kills it, and emphatically: **34 of 40 measurements outside
threshold on `grading-bulk-state-section`, against 0 on the restored tree**, because
the console calls an undefined `loadAcross`, throws, and never renders a roster at
all.

That is the honest shape of the proof rather than a gap to paper over: the
transport's SHAPE is pinned by `npm test` (M9, the factory keeping `loadAcross`, and
M10, an own key holding `undefined` -- which answers identically under
`bulk?.loadAcross` today and is one optional-chaining change from not doing), and
the console's USE of it is pinned by the browser spec. **Neither instrument covers
both halves, and only one of them runs in CI.**

## The suite, and the one thing it caught

**`npm test`: 528 of 529 files and 9887 of 9889 tests green on the first clean
run, with the 2 failures BELONGING TO THIS BUNDLE and now fixed.**
`tests/derived-numbers.test.ts` reddened because a new browser spec exists in
`routes/` with no measurement under `measured/` -- which is precisely what that
test is for, and `npm run verify:counts` had said so in words
("1 spec(s) in this tree have no measurement under measured/") before the suite
did. `npm run verify:readme -- --route "state=section"` measured it: 40
measurements, 0 outside threshold, `dirty: false` at `306a497c`. The store now
holds 242 specs, 484 runs, 8834 measurements.

**Re-run whole afterwards on the committed tree, with nothing else running:
529 of 529 files and 9889 of 9889 tests passed, 0 failures, 1263.85s.** That is
the figure to compare a later tree against; this bundle adds 22 tests across
two new files (`classroom-grading-dictation` and
`classroom-batch-grading-transport`) plus five in `classroom-grading-bulk`.

Two notes on running it. **The filter matches the spec's PATH, not its
filename**, so `--route grading-bulk-state-section` answers "No routes matched"
and `--route "state=section"` is the form that works; and **`verify:readme`
takes no `--port`**, unlike `run.mjs`. Neither is a defect, and both cost a
cycle here.

**`run-tests.mjs` was right and the wrapper's exit code was not**: the
background job reported `exited with code 0` while the tool's own last line
said it was failing the process. That is the trap its header documents, seen
live -- the summary line is the truth.

## Four files outside the prompt's Owns line

Reported rather than buried, with the reason each was needed:

* **`src/routes/dev/html-assignment-grading/+page.svelte`** -- the harness that
  caused report 5. Leaving it measuring a console that does not exist would have
  meant pinning a 280px document column as correct. The argument is above.
* **`src/routes/dev/grading-rubric/+page.svelte`** and
  **`src/routes/dev/grading-bulk/+page.svelte`** -- the scripted speech recogniser
  and the `?state=section` transport shape. Neither feature is drivable without a
  fixture, and a feature verified only by reading is not verified.
* **`tools/browser-verify/routes/grading-bulk.mjs`** -- its pinned preset count of
  4 is 5 now. A spec my own change reddens is mine to correct.
* **`tools/mutate-check.mjs`** -- new, no caller in `src/`. The prompt requires a
  mutation proof per shipped change with a byte-copy restore, and `CLAUDE.md`
  records three separate ways a hand-rolled mutation script has produced a FALSE
  CLEAN READING on this repo: `git checkout --` discarding the session's own work,
  vitest's exit code being 0 on a real failure, and the failure report landing on
  stderr while only stdout is read. This answers all three and runs a green control
  first, refusing to report any verdict if the clean tree is not green. Eleven
  mutants went through it here.

## An instrument finding, because it cost a wrong diagnosis here

**Two harness passes running at once produce spurious failures.** A
`--route grading` run made while a full pass was still going reported five
findings on `classroom-split-...-compose-assignment-rubric` -- a composer spec
this bundle touches no code for -- including
`prepare-click [[data-testid="new-post"]] 1 matched, 12 attempt(s), predicate
never satisfied`. Run alone, the same spec reports **18 measurements, 0 outside
threshold**. Two vite servers and two Chromiums on this container are enough to
starve a click's predicate, and the failure reads exactly like a regression in
somebody else's component.

**And a `git worktree` with a symlinked `node_modules` is not a usable
baseline for console errors.** Vite's `fs.allow` refuses to serve a file
outside the worktree root, so every `@fontsource` request 403s and the run
reports 16 console errors that are entirely the setup's. Useful for the
non-console checks; useless for that one.

The pre-existing findings in the committed `measured/` baseline are all
IdeaCAD (`ideacad*.json`, 2 to 42 outside per spec) and none of them is
touched here.

## For Mr. Pina

1. **Nothing to paste.** No migration. `0219` is free for whoever needs it next;
   `tools/migration-claims.mjs` will show it unclaimed.
2. **Two of the five are still open**, and the comment bank (report 4) is the one
   that needs the migration `0219` was set aside for -- one table, a usage counter
   to drive "most common at the top", three RPCs and a picker. It was left whole
   rather than half-built.
3. **The AI grade importer (report 1) is the larger open one**, and its *hidden
   standards* half has a decision in it that is yours rather than a lane's. The
   prompt offered two shapes and the safer one is the document: **0090 already gives
   an item instructor-only attachments and links** (`hasInstructorMaterial`), so
   grading standards can be an instructor-only document on the assignment **with no
   new data model and nothing that could leak a rubric to a student**. A structured
   per-criterion hidden field is a migration, a spec-schema change, and a proof
   obligation on every rubric renderer -- and the thing being protected is a rubric
   a student must not see. Recommendation: the document first, the field only if the
   document turns out not to be enough.
4. **A thing worth knowing about the harnesses, and it is the one to act on.**
   `/dev/html-assignment-grading` did not set `--cr-measure-route`, so it
   measured a 960px console where the real route measures the window -- and
   that is what cost this feature a correct layout for however long the
   withholding stood. **It is fixed here.** `/dev/grading-rubric` and
   `/dev/grading-bulk` still have the same gap and were left alone, because
   changing what they measure would move every assertion on eight specs and
   that is its own bundle rather than a ride-along. Three harnesses
   (`classroom-nav`, `classroom-inspector`, `classroom-split`) do set it, which
   is what made the difference visible at all. **Worth a lane: sweep every
   `/dev` harness that mounts a classroom surface and give it the measure its
   real route resolves to.**

## Not verified

* **Nothing was run against the live Supabase project.** No session in this
  repository can reach it, and this bundle carries no SQL to apply.
* **`prefers-reduced-motion: reduce` was not exercised.** The harness runs at
  `no-preference`. The dictate dot's pulse is gated behind
  `prefers-reduced-motion: no-preference` and nothing is hidden in a base state --
  with the animation cancelled the dot paints at full opacity -- but that is read
  off the stylesheet, not measured.
* **No real microphone and no real speech service.** Dictation was driven end to
  end through an injected scripted recogniser. The `SpeechRecognitionLike` shape it
  satisfies is the one `$lib/feedback/dictation.ts` already drives in production for
  the site report box, so the wrapper itself is not new code on a new path -- but
  nothing here proves a real browser's service behaves as scripted.
* **Web fonts do not load in the harness** (the proxy resets
  `fonts.googleapis.com`), so every text measurement above is in the fallback stack.
* **The ported-document measurements are of one document.**
  `idea100-blade-01.ported.html` is the real thing and the one the prompt names, but
  a worksheet with a wide fixed-width table in it could still overflow at 411px
  where this one does not. The collapse point is set from this document's curve.
