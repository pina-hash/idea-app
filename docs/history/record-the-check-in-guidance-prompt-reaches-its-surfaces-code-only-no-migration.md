---
title: "The check-in guidance prompt reaches its surfaces (code only, NO migration)"
date: 2026-08-21
branches: []
migrations: []
subsystems: ["Digital notebook"]
record_order: 105
---

`0123` shipped the column and the write and no client code at all -- the deploy
ordering, stated in its own header. This is the other half: the three places an
instructor writes a prompt, the three places it is read, and the ladders that let
a deployment sitting between `0122` and `0123` keep working.

### What it is

A notebook check-in can carry a paragraph saying what to photograph and what to
write about it. It is authored on the canonical check-in (never on the posting),
so one check-in posted to three classes carries one prompt; it is written by
`notebook_set_session_guidance` and by nothing else.

### Authoring: three surfaces, one component

`$lib/CheckInGuidance.svelte` is the field, and it is mounted three times:

* `CheckInStager` (staged at item creation in `ContentComposer`),
* `ItemDetail`'s instructor region, on a check-in that already exists,
* `SessionManager` under `/notebook/review`, where a check-in's date, label and
  classes are already edited.

The third is the one that would have been skipped. A field authorable in two of
three places is the split that produces "why can't I change this here", and the
review console is where a teacher already goes to fix a date.

**TWO MODES, DECIDED BY THE ABSENCE OF A TRANSPORT.** `onsave` present means the
check-in exists and the field owns a `SaveState`; `onsave` absent means it is a
staging field and the parent applies it. That is the repo's presence-gates-the-
control rule applied to a mode rather than to a button, and it is why the
composer's copy carries no save machinery it could not use.

**IT WRITES ON THE CLASSROOM RICH-TEXT CONTRACT AND INVENTS NO THIRD ONE.**
`RichTextEditor` with `ITEM_SCHEMA_OPTIONS`, the same closed schema and the same
`_classroom_doc_ok` on the far end that `0123` deliberately calls rather than
clones.

**THE WRITE IS A ROUTE, AND IT HAS TO BE.** `/api/notebook/session-guidance`
normalizes the editor's document into the stored shape and then calls the RPC
**as the caller**. The translation is `$lib/server/classroom-doc`'s whitelist,
which cannot be moved into the client without losing the first of the three
gates. The route adds no authority: `_notebook_manages_session` inside the
function is still what decides, and the SQL gate refuses the document a second
time whatever the handler did. One egress point for that write
(`saveSessionGuidance` in `$lib/check-in-guidance`), shared by the classroom's
check-in transports and the review console's, so the two cannot drift.

### The word counter

There was no general word counter in the repo -- `instructionsWordCount` walks
markdown for the spec budget and had a PRIVATE `countWords` inside it. Rather
than write a second one, `countWords` moved to `$lib/rich-text` (the shared
primitives module) and `tiptapWordCount` was written beside it, walking the
editor's own JSON. The two now share the definition of a word and nothing else,
which is what makes the cross-check in the test meaningful.

It joins runs WITHIN a block (ProseMirror splits `un**bold**ed` into three text
nodes; counting them separately charges an author three words for one) and never
ACROSS one (two list items joined would read as one word where the marker was --
the mistake the notebook normalizer made on real content).

**250 IS A TARGET AND NEVER A GATE.** No refusal in the RPC, none in the route,
none in any component: the counter goes amber and says so. The only hard ceiling
is the database's 20,000 characters, which is storage rather than editorial.

### Reading: where, and why there

**The student composer.** Between the "What is this for?" fieldset and the first
input. The picker is the first control in that form, so the prompt is on screen
before a word is typed. It is the shared `Disclosure` on the shared rule --
expanded first time, collapsed once the work has started, the manual choice
remembered -- and the "started" signal is `notebookComposerHasWork`, the SAME
function the navigation guard and the close control already ask. No second rule,
no new prop, no second read.

`NoteEditor`'s position is unchanged, which was verified rather than assumed: the
draft survived switching check-ins twice.

**The written entry.** `NotebookEntryCard`'s `.body`, beside `p.entry-session`.
Of the two structural slots the markup offers, `.tools` was rejected: it sits in
`.row`, which renders COLLAPSED as well as expanded, and it is a strip of
one-click controls (folder, pin, copy). A paragraph of somebody else's prose
inside a control group, on a row whose whole purpose collapsed is to be scanned
past, is reading material in the one place nothing else on the row is. `.body`
renders only when the entry is open and already OPENS with the line naming the
check-in, so the prompt reads as that line expanded. The third position somebody
will reach for -- beside `.row-title` -- is not a position at all: that title is
inside a `<button>`, and a disclosure's own button nested in it is invalid HTML
whose clicks would toggle the row.

`collapseWhen` is true there, and that is the SAME rule rather than a second one:
on an entry already filed, the reading is emphatically not the thing in front of
this person.

**The class item page.** Added beyond the brief, for a stated reason:
`IDEA_INTERFACE_STANDARDS` requires an instructor's view of student-facing
content to be the student view PLUS edit affordances, through one render path. A
manager-only editor with no student read would have broken that. So the prompt
renders in the check-in card for everyone and the editor sits in the instructor
region. Verified both ways: the student render carries the prompt and 0 editors,
0 inspector fields, 0 detach controls.

Its Disclosure takes its OWN scope (`item-check-in:<id>:guidance`) rather than
the composer's. They are two panels over one paragraph with different collapse
signals; one shared memory would let a collapse made mid-upload hide the prompt
on the page a student came to read it on.

Everything renders through `ItemBody` -- the one renderer for this document
shape. No second walk, no `{@html}`.

### The two-phase save, and the duplicate it prevents

A check-in and its prompt are TWO writes, so a create can half-land.
`applyStagedExtras` therefore carries `checkInSessionId` back out, exactly as
`saveTarget` carries `createdItemId`: on a retry the prompt is written onto the
check-in ALREADY MADE. Without it, "save again" schedules a second check-in for
the same day, which puts a second column on every affected class's grid and asks
a class for the same page twice -- and looks exactly like a successful retry
until somebody opens the grid.

The failure message names which half landed ("it was scheduled, but its guidance
was not saved"), because that is the difference between "go and retype a
paragraph" and "go and schedule the whole thing again".

### Ladders

Four new rungs, each its own, each the one beneath it plus the column:
`NOTEBOOK_SESSION_SELECTS` (the entry's check-in labels),
`NOTEBOOK_POSTING_GUIDANCE_SELECT` (the student's own check-ins and the class
page's), `MANAGE_SESSION_SELECTS` (the review console's). Degrading costs the
prompt and nothing else.

`undefined` and `null` are kept APART on purpose: null is the widest rung saying
"this check-in has no prompt", undefined is the read never having asked.
`ReviewConsole` reads exactly that difference (`sessions.some((s) =>
s.guidance_doc !== undefined)`) to decide whether to offer the field at all, so
an instructor on a pre-`0123` database is never handed an editor with nowhere to
save. The classroom side answers the same question from the layout load's
`checkInGuidanceReady`, and the item page hands down a transports object carrying
only the writes the schema supports.

### Two defects found in the browser, neither of which type-checking can see

**AN INFINITE AUTOSAVE LOOP.** Seeding Tiptap emits a transaction of its own,
`onchange` fired with a document nobody had typed, `markDirty` armed the
debounce, the write landed, the re-render produced another transaction. On the
isolated harness the counter passed **151 saves in a few seconds**; in the review
console, where each save refetches the section, it **wedged the renderer
outright** -- the pane stopped answering every subsequent read. Fixed by
comparing against the editor's OWN serialization at mount before calling anything
dirty: a transaction that did not change the document is not an edit. That is the
"compare before stamping" rule the Updated badge follows, applied to the signal
instead of to the badge.

It is also why `/dev/check-in-guidance` exists. Mounting the component in
isolation is what separated "the editor is broken" from "the editor is broken
THERE", and it is where the save count was readable at all.

**TWO CONTRAST FAILURES, both from portal tokens reaching a scoped light plate.**
Measured by painting each computed colour to a canvas and compositing the
ancestor background stack, so no colour syntax is skipped.

| What | Where | Before | After |
| --- | --- | --- | --- |
| An authored link in a prompt | notebook LIGHT plate | **2.00:1** | 4.89:1 |
| The FAILED save message | notebook LIGHT plate | **3.65:1** | 5.31:1 |

The link was `ItemBody`'s `--cyan`, the portal's metadata colour tuned for a dark
plate; this bundle put that renderer inside `.nb-root` for the first time. The
save message was `SaveIndicator`'s raw `--crimson`, for the same reason. Both
fixed with the `--disc-accent` mechanism -- a room hook read at the point of use
with the portal token as the fallback -- so the classroom renders byte-identically
and the notebook points them at `--nb-accent-ink` / `--nb-error`, the corrected
values that exist for exactly this.

**THE IDENTITY COLOUR DID NOT MOVE IN EITHER CASE.** The link cleared at 4.32:1
on the RECESSED plate and 4.89 on the raised one, so the panel moved to raised
paper (`--surface-1`) rather than the brass being deepened again -- and raised is
also what an instructor's words sitting above a student's form should have read
as.

### Measured

Three notebook plates, both viewports, transitions disabled before every read.

| | light | dark | idea |
| --- | --- | --- | --- |
| Prompt paragraph / list / bold | 15.82 | 14.12 | 15.29 |
| Authored link | 4.89 | 7.33 | 12.71 |
| Disclosure trigger label | 15.82 | 14.12 | 15.29 |
| Disclosure meta / Show-Hide | 7.75 | 8.80 | 9.18 |
| Field label / word count / hint | 7.75 | 8.80 | 9.18 |
| Save: saved | 4.90 | 8.02 | 8.54 |
| Save: failed | 5.31 | 6.75 | 7.03 |

At 375px nothing overflows: `document.scrollWidth` 375 against a 375 viewport, on
the composer and on the review console. Tap targets: the composer disclosure
265x44, the entry disclosure 851x44 at 1440, the Guidance button 86x44, and all
seven editor toolbar buttons 44px tall.

### Verified in the browser

Through `/dev/notebook`, `/dev/notebook-review`, `/dev/classroom` and the new
`/dev/check-in-guidance`, all mounting the REAL components.

* A manager authors, the panel closes and reopens, and the prompt reads back
  through the store rather than off the editor still on screen.
* A NON-manager is refused: the shared check-in an instructor manages only half
  of answers "Only the teacher of record for every class this check-in runs in
  can write its guidance", with the marker glyph, ONE attempt, and a manual
  Retry. Measured directly on the isolated harness: one edit, one save; a refused
  edit, one more save and no third.
* A student reads it, and the panel collapses the moment they start writing --
  `aria-expanded` false, `display: none`, and the text STILL in the DOM. The
  manual toggle then overrides that and is remembered
  (`idea:disclosure:1:<viewer>:check-in:<id>:guidance` = `open`).
* Bold, a link and a NESTED list all render through `ItemBody` on every surface.
* Role parity on the item page: the student render carries the prompt and no
  write control of any kind.

### Mutation proof

| Mutation | Result |
| --- | --- |
| **The rejected alternative**: the prompt COPIED onto the entry at creation (a `guidance_doc` column on `notebook_entries` + a before-insert trigger, plus the load reading the entry's own copy) | **2 of 5 reddened** in `notebook-guidance-propagates` -- exactly the two that distinguish the designs: the corrected prompt, and the cleared one. The third (the prompt as first written) stayed green, which is correct: both designs agree there. |
| `checkInSessionId` ignored, so a retry always creates | **1** -- "the retry writes the prompt onto the check-in already made, never a second one", and nothing else |
| `<Disclosure` added to `ItemBody` | **1** -- the generalized ItemBody assertion, confirming it still bites after being widened |

The first was verified APPLIED before its result was read: a probe confirmed the
entry row genuinely carried the snapshot (`ENTRY SNAPSHOT:
[{"guidance_doc":[{"runs":[{"text":"hi"}],"type":"p"}]}]`) before the assertions
ran. `0123_notebook_session_guidance.sql`, `src/routes/notebook/+page.server.ts`
and `src/lib/notebook-selects.ts` were all restored byte-identically
(md5-checked) and re-verified green.

### Three assertions generalized rather than deleted

Each was a passing test that a legitimate change broke by POSITION or by WORD
rather than by meaning -- the failure a hurried session deletes.

* `NOTEBOOK_POSTING_SELECTS` was spelled out as a two-item list, so adding a
  third rung broke it. It now asserts the RULE the ladder doctrine rests on:
  every rung is the one beneath it plus something, at the top level and inside
  the embed, with one embed and the same one on every rung.
* `ItemDetail`'s instructions-panel test matched the FIRST `<Disclosure>` in the
  file with a non-greedy regex, so a disclosure added above it silently captured
  the test. It now finds the panel by its `scope`, and a second case asserts the
  check-in panel has its own.
* `expect(itemBody).not.toContain('Disclosure')` matched a CSS COMMENT explaining
  that ItemBody borrows Disclosure's room-hook mechanism -- a true sentence about
  a real decision, failing a test it does not violate. It now matches the import
  and the element.

All three were re-mutated afterwards to confirm they still bite.

### Print

The print rules are written and **they are inert**, which is stated rather than
glossed. There is no print rendering anywhere in the notebook: no `@media print`
under `src/lib/notebook` or `src/routes/notebook`, and none in `app.css`. What the
rules say is correct for the day that changes -- the panels drop their plate and
keep their prose, the editor and its chrome are hidden, and `Disclosure` already
prints a collapsed region and drops its own trigger. This bundle does not give
the notebook a print stylesheet and does not claim to.

### Not verified

* **No screenshot.** The Browser pane does not composite, so every visual claim
  above is a measured computed-style, canvas-pixel or geometry read, as CLAUDE.md
  requires.
* **Nothing was checked against the live Supabase project**, a signed-in session,
  a real Drive round trip or production. The `.env` here is a placeholder
  project; every write above went through a harness or an embedded Postgres.
* **The real `/api/notebook/session-guidance` route was not driven over HTTP.**
  Its normalizer and its RPC are both covered elsewhere (`normalizeItemDoc` by
  the classroom's own tests, the RPC by `notebook-session-guidance`), and the
  harnesses answer the transport in memory; the handler itself is asserted by
  nothing but reading.
* **Printing was not exercised**, for the reason above: there is nothing to
  exercise.
* **The composer's staged path was not driven in a browser.** `/dev/classroom`'s
  compose surface needs a mode this session did not reach; the two-phase apply is
  covered directly against `applyStagedExtras` instead, including the retry, and
  `CheckInStager`'s field is the same component proven on the other two mounts.

---

