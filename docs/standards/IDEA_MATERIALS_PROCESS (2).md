# IDEA Materials Production Process
**Version 2.6 - 2026-08-25**
Pathway-wide. Governs how all IDEA course materials are created, for IDEA100, IDEA209H, and every course after.

**Changed in v2.5:** added "An Instrument Is Not a Material." A non-graded instrument that collects student input matches neither spec kind and had no route, which turned a routing question into an open architecture question every time one was needed. Added its row to the material type table.

**Changed in v2.4:** Claude Design work is now governed by `IDEA_CLAUDE_DESIGN_STANDARDS.md` rather than by the loose instruction to feed it "the spec plus design system tokens." That instruction produced a 29-slide deck using one design system component, because a prompt that names no components gets hand-rolled slides. Added `IDEA_DS_DIGEST.md` to Session Prerequisites. Also corrects the version line, which said 2.2 while the changelog above it described v2.3.

**Changed in v2.3:** added Session Prerequisites, since the two files chat needs to author against live in the repo where chat cannot see them. Added the Inherit Before Authoring rule and the paired-deliverable rule for reference documents. Print sources are now explicitly markup-only.

**Changed in v2.2:** facilitation guides are deferred to the end of a unit's build and produced only on explicit request. They are no longer part of a normal authoring pass.

**Changed in v2.1:** added Placement as a required pipeline step. A material is not finished when the file is delivered; it is finished when every file it produced is in its permanent home. Added the canonical repo layout and the authoring path convention that makes placement possible.

**Changed in v2:** the assignment engine and IDEA Classroom are live. Print is no longer the default rendering target for student work. It is now an exception with a defined trigger list. Google Classroom is out of the workflow entirely.

---

## Core Principle (unchanged)

**Author once, render per target.** Every student-facing assignment is authored as a structured content spec (`IDEA_MATERIAL_SPEC_v2.md` defines the format). The spec is the durable asset. Renderings are disposable outputs generated from it.

This is the principle paying off. The delivery format changed completely between v1 and v2 of this document, and no authored content had to be rebuilt.

Machinery that must behave identically across materials lives in maintained code (the idea-app engine), never in prose standards that get re-materialized per build.

---

## Material Types and Formats

| Type | Default target | Produced by |
|---|---|---|
| Interactive assignment | Assignment spec → engine import | Chat (spec) → engine |
| Lab worksheet | Assignment spec → engine import. Bench recording stays in the physical notebook, photographed and uploaded. | Chat (spec) → engine |
| Reference document | Reference spec → Materials post. Syllabi, policies, standing references. | Chat (spec) → engine |
| Exam / timed assessment | Print. See "When Print Is Still Correct." | Chat |
| Signature-required document | Print. See "When Print Is Still Correct." | Chat |
| Lecture aid / deck | PPTX or Claude Design output. Fewer slides, higher signal. | Chat scope → prompt per `IDEA_CLAUDE_DESIGN_STANDARDS.md` → Claude Design, or pptx skill |
| Reference sheet / handout | IDEA Classroom Materials post. Print only if it must leave the building. | Chat |
| Instructor facilitation guide | IDEA Classroom Materials post, section-scoped. Print optional for teaching from. **Deferred and request-only, see below.** | Chat, last |
| Rubric / grading artifact | Authored inside the assignment spec per `IDEA_RUBRIC_STANDARDS.md`. | Chat (in spec) |
| Classroom post text | Plain text, direct paste into IDEA Classroom | Chat |
| Interactive demo / visualizer | Software in idea-app, browser-verified | Chat spec → CC |
| Non-graded instrument | App surface. Not a spec. See "An Instrument Is Not a Material." | Chat spec → CC |

Format follows type. Nothing is forced through print machinery by default, and nothing is forced through the engine by default either.

---

## Session Prerequisites

**Chat cannot see the repo.** Standards docs live in project knowledge; the files
that actually govern rendering and validation live in `idea-app`. Chat authoring
against a file it cannot read will reinvent it, and the reinvention looks correct
right up until the shared file changes and the material silently stops matching.

Before authoring begins, chat asks Alejandro to upload whatever the material needs:

| Building | Required uploads | Without it |
|---|---|---|
| Any print material | `materials/_shared/print.css` | Chat rebuilds the design system inline and the material stops inheriting shared style changes |
| Any reference document | `tools/validate-reference-spec.py` | Import errors surface in the Supabase SQL editor instead of in chat |
| Any assignment spec | `tools/validate-reference-spec.py` | Same |
| Any Claude Design artifact | `IDEA_DS_DIGEST.md` in project knowledge | Chat names components from memory, and a slide inventory that specifies a component that does not exist produces a hand-built one |

Chat asks for these **before writing the file, not after delivering it.** A delivered
material that turns out to have been authored blind is a rebuild, not a revision.

This was learned by building the IDEA100 syllabus with a self-contained stylesheet, a
base64-embedded logo, CDN-loaded fonts, and an invented accent green, all of which had
to be thrown away once `print.css` was uploaded.

---

## Inherit Before Authoring

**When a course gets its first instance of a material type another course already has,
read that existing material first.** Its files are the pattern: structure, class names,
section order, asset layout, footer format.

The pathway has one visual and structural identity, not one per course. A second
syllabus that was designed rather than inherited will differ in a dozen small ways that
each individually look like a choice and collectively look like a mistake.

Applies to syllabi, notebook standards, lab references, unit assignments, and anything
else that will eventually exist once per course.

---

## Every Material Cites Its Sources

**No material is authored from general knowledge where a source that owns the subject
exists, and every material ships the list of what it was built from, visible to
students.** Two halves of one rule. The first governs how the material is built; the
second is why the first is checkable.

Established 2026-08-25 as a standing correction from Alejandro, after the Unit 1
hardware content was authored against the NASA RAP Robotics Design Guide only because a
Drive sweep happened to surface it, while two engineering textbooks that own the same
material sat in Library B unopened and unremembered.

### Consulting

Before authoring, identify what owns the subject and open it. `IDEA_REFERENCE_LIBRARY.md`
rules 7 through 10 govern this and are not restated here. The short form: the trigger is
the subject, not doubt, and time pressure is the argument for consulting rather than
against it.

### What counts as a source

A named work that a student could go and check.

- A textbook, named by title and edition.
- A published standard or specification, named by its number and revision.
- A manufacturer datasheet or vendor catalog page, named by part number.
- An organizational reference document, named by title and version.

What does not count, and must never appear in a sources block:

- General knowledge. If nothing was opened, nothing is cited, and that is the defect the
  rule exists to catch rather than a formatting choice.
- An AI's recollection of any of the above. A model that names a part number is not a
  catalog page.
- A prior chat. A remembered fact is a claim, not a source.
- A file that was searched but not read. `fullText contains` returning a hit proves the
  string is in the document, not that the passage was consulted.

### The Sources block

Every assignment, worksheet, reference document, and deck carries one, as the last thing
in it.

| Kind | Where it goes |
|---|---|
| Assignment | A final `instructions` block headed `### Sources`, after the last graded module's content |
| Reference document | A final section, slug `sources`, title `Sources` |
| Deck | One sheet immediately before the closing bookend |
| Print rendering | Same position as the material it renders, never dropped to save a page |

Each entry names the work, its version or edition, and where the student can reach it.
Entries are one line. A sources block is not a bibliography exercise and carries no
citation format: title, version, where to find it.

### The copyright line does not move

Sources are cited, never excerpted. The textbooks and vendor documents in the libraries
are copyrighted, and a sources block naming a work is not permission to reproduce a
passage, table, or figure from it into student-facing material. Verify the fact, the
formula, or the standard value against the source, then write the explanation fresh.
Where a value is genuinely the source's, state the value and name the source in the same
sentence.

### Why students see it

Because the assignment already requires it of them. The approved course description makes
every numerical value and selection decision defensible on challenge, and Checkpoint 2
grades a selection against published properties rather than against plausibility. A
material that cites nothing while demanding citation teaches that values come from
nowhere and that authority is a matter of who is speaking. The sources block is the
worked example of the behavior the defense is about to test.

---

## Reference Documents Are Never Built As Code

A reference document is a JSON spec attached to a Material in IDEA Classroom. The site
already renders it.

**There is no route, no component, no CC prompt, and no deploy.** A CC prompt that
proposes building a course page is a category error: it hand-builds a page the engine
would have rendered from the spec, and it creates a second surface that drifts from the
spec the moment either changes.

### A syllabus is a paired deliverable

Both artifacts, every time, from the same approved content:

| Artifact | Destination | Why |
|---|---|---|
| `<COURSE>_Syllabus_<term>.pdf` from an HTML source | Copier, and attached to the Material | Print trigger 1, physical signature |
| `<courseid>-syllabus.reference.json` | Attached to the same Material | The digital syllabus students actually use |

Delivering one without the other is a half-finished material. Say which is still
outstanding rather than letting it read as complete.

### Print sources are markup only

The HTML is a rendering source, not a standalone page. It carries no `<style>` block, no
base64-embedded images, and no CDN font links. It links `../../_shared/print.css`,
references shared assets by repo-relative path, and assumes Orbitron, Rajdhani, and
Share Tech Mono are installed on the rendering machine.

### Short link before print

The QR and the printed short link resolve only after the Material exists. Order is fixed:
attach the spec, publish, set `public`, copy the UUID URL, register the short link at
`/admin/links`, then print. Printing before the short link is registered ships a dead QR.

---

## Facilitation Guides Are Deferred

A facilitation guide is built **last in a unit's build, and only when Alejandro asks
for one by name.** It is never bundled into an authoring pass, never proposed, and
never listed in a deliverable set unprompted.

A guide narrates a day that is already fully specified, which puts it downstream of
every other artifact for that day. Pacing changes, a rubric revision, a sample
logistics decision, a deck edit, or a calendar correction all rewrite it. Built early,
it gets rebuilt repeatedly and consumes the session's attention on narration instead
of on the instruments that actually gate the day.

Instructor material that grading or preparation genuinely depends on is a different
type and stays in the normal pass: answer keys, sample keys, and setup notes. The test
is whether the day fails without it. A missing answer key stops grading. A missing
facilitation guide does not stop anything.

Constraints surfaced while building the instruments still get raised in chat when they
threaten a graded day, such as equipment that has not arrived or a taught-versus-assessed
gap. Flagging a blocker is not the same as writing the guide.

---

## An Instrument Is Not a Material

**A thing that collects student input and grades none of it is not a material. It is an app
surface, and it does not go through this pipeline.**

The schema has exactly two kinds and neither one fits. An `assignment` collects input, and it
also carries `totalPoints` that must equal the sum of its module points, leveled rubric
criteria that must sum to their module, a submission and preflight cycle, a self-score
readout, and a row in the grading console. A `reference` carries none of that and collects
nothing: `points`, `totalPoints`, `rubric`, `aiLevel`, `declarations`, `approvalGate`, and
`modules` are rejected as keys at any depth, and every block type is display-only.

So an intake survey, a preference form, a self-report checklist, or an availability poll can
be expressed only by forcing it into `assignment` at zero points, which produces rubric
criteria whose top level equals their bottom level, and renders to the student as a graded
item worth nothing. That is not a workaround with a cost. It is a different instrument
wearing the wrong shape, and the grading console will list it.

**Route it as an app surface built by Claude Code, in whichever app owns the data.** Ownership
is decided by who consumes the answers, not by who is asking for the form. An instrument whose
results drive roster, assignment, or scheduling decisions belongs in the app that holds the
roster, even when the request arrives through a course-facing conversation.

**Check for an existing collector first.** Two forms asking the same question in two apps
produce two answers and no way to tell which is current. Before specifying a new instrument,
audit the app that owns the data for a form that already collects part of it, read-only, per
the repo-state rule in `IDEA_instructions.md`.

Established 2026-08-25, from an FRC orientation intake that was scoped as a spec for idea-app
and is neither.

---

## When Print Is Still Correct

Four triggers. If none apply, the material goes in the app.

1. **A physical signature is required.** Syllabus acknowledgment, safety certification sign-off, permission and release forms. A signature has to come back on paper.
2. **The work is AI level 0 OFF and timed.** Final exams and in-class timed assessments. A device in hand defeats the point, and the printed instrument is the control.
3. **It has to leave the building.** Anything going home to a parent who will not log in, or handed out at Open House.
4. **Contingency.** A printed fallback for a graded activity that cannot slip if the network or the app is down on the day. Judgment call, made per material, not a standing habit.

Everything else, including lab worksheets, goes in the engine. Bench work was always handwritten in the physical notebook and photographed; that is unchanged and is not a reason to print a worksheet.

`IDEA_PRINT_STANDARDS.md` remains fully active. Its scope narrows to the four triggers above.

---

## Pipeline (per material)

1. **Classify.** Pacing entry → material type per the table above.
2. **Check the print triggers.** If one applies, note which. This is an explicit step, not an assumption.
3. **Spec.** Chat drafts the content spec. Alejandro approves content before any rendering.
4. **Render.** Route by type:
   - Assignment or worksheet → assignment spec delivered for engine import.
   - Reference document → reference spec delivered for a Materials post.
   - Print-trigger material → print rendering per `IDEA_PRINT_STANDARDS.md`.
   - Deck or one-pager → scoped and prompted per `IDEA_CLAUDE_DESIGN_STANDARDS.md`. The prompt names a component per slide and carries the inheritance block verbatim.
   - Demo → CC prompt against idea-app, standard routing header.
5. **Verify.** Engine: local validator, then import validation, then a browser check as a student before posting. Print: visual check of the rendered output. Claude Design: the pre-delivery audit in `IDEA_CLAUDE_DESIGN_STANDARDS.md`, counts first, then screenshot review of every slide.
6. **Deliver.** The spec file plus any instructor-only materials in the same pass.
   The Sources block is part of the material, not an addendum: a spec delivered without
   one is incomplete and goes back, the same as a spec whose points do not sum.
7. **Place.** On Alejandro's confirmation that the material is complete, deliver placement instructions per the standard below. See "Placement."

---

## Placement

**A material is not finished when the file is delivered. It is finished when every file it produced is in its permanent home.**

This step exists because a finished material scatters files across three destinations with different lifespans, and the person who has to file them is the one who did not create them. Left implicit, sources get discarded and the next revision becomes a rebuild.

### Trigger

Alejandro confirms a material is complete. Not at delivery, since a material under revision is not ready to file.

### What placement instructions must contain

- **Grouped by destination, not by file.** Someone filing things works one destination at a time.
- **Every file accounted for.** Including files deliberately not delivered, and why. A silently withheld file reads as an oversight.
- **Exact paths, with new folders flagged as new.** "Create `materials/`" not "put it in materials."
- **Files that are now superseded and should be deleted.** Two documents describing the same thing will contradict each other. Adding without removing is half the job.
- **Files already placed, named as already placed.** Prevents redoing work or double-importing.
- **The command to regenerate**, for anything with a build step.
- **No file left with an ambiguous destination.** If a file has no home, say so and say why it still exists.

### Canonical repo layout

```
tools/
  validate-reference-spec.py     mirrors the SQL validator
  render-print-material.py       HTML source to US Letter PDF

materials/
  _shared/                       assets used by more than one material
    print.css
    idea-logo.png
  <courseid>/
    <material>/
      <source>.html              print source
      <output>.pdf               rendered output
      <spec>.reference.json      or <spec>.spec.json
      <material-specific assets>
```

`_shared` holds anything serving more than one material. The underscore sorts it above the course folders. Material-specific assets, such as a QR encoding one document's short link, stay in the material's own folder.

### Authoring path convention

**Print sources reference shared assets by repo-relative path, never by bare filename.** A stylesheet linked as `print.css` renders only when every file sits in one directory, which forces either a flat folder or a rewrite at placement time. Author as `../../_shared/print.css` from the start.

This is recorded here rather than in `IDEA_PRINT_STANDARDS.md` because it is a repo-layout rule, not a rendering rule. It was learned by having to rewrite the IDEA209H syllabus paths after the fact.

### Destinations and what belongs in each

| Destination | Holds | Does not hold |
|---|---|---|
| Project knowledge | Standards docs, context, voice guides. Things chat reads. | Tools, since chat cannot execute a file from there. Course materials, which belong in the repo. |
| idea-app repo | Spec files, print sources, shared assets, rendered outputs, tools. The version-controlled record. | Standards docs, which live in project knowledge so chat reads them every session. |
| The app or the copier | Imported specs, attached PDFs, posted materials. | Anything that only exists there. Everything placed here also has a repo copy. |

---

## What the Engine Owns

Do not hand-produce these.

- **Point arithmetic.** Import validates that module points sum to the assignment total and that rubric criteria sum to their module.
- **Rubric artifacts.** The rubric builder generates the grading rubric from the spec. No separate CSV, no separate markdown.
- **Grade export.** FACTS-ready CSV comes out of the grading console.
- **Behavioral consistency.** Sentence counters, autosave, preflight, per-module completion, submit and reopen state, AI-level badges, print view.
- **Theme.** `idea-green` only; the engine ships no others.

---

## Google Classroom

Out of the workflow. IDEA Classroom on ideabosco.com is the posting, distribution, submission, and grading surface.

**FACTS remains the system of record for grades**, fed by CSV export and manual transcription. Direct FACTS API integration is not available; its Google Classroom link runs through Google's OneRoster partner program, which is not open to custom apps.

**Still outside our control**, and the reason Phase 3 is not simply declared finished: school-level gradebook requirements, parent visibility expectations, and other teachers' workflows. Those are institutional, not technical.

---

## Phase Status

- **Phase 1, assignment engine.** Complete. Spec import and validation, student renderer, autosave, preflight, submit.
- **Phase 2, grading in-app.** Complete for IDEA courses. Rubric builder, grading console, student-facing grade return, FACTS-ready CSV export.
- **Phase 3, full replacement.** In use for IDEA courses. Announcements, materials distribution, canonical-plus-postings sync, and public reference documents are live. Not institutionally complete while the external dependencies above are unresolved.

---

## Standards Map

| Document | Status | Scope |
|---|---|---|
| `IDEA_MATERIALS_PROCESS.md` (this file) | Active | Pipeline, placement, tool roles, phases |
| `IDEA_MATERIAL_SPEC_v2.md` | Active, load-bearing | Assignment and reference spec schemas. Validated server-side on every write. |
| `IDEA_RUBRIC_STANDARDS.md` | Active | Leveled rubric criteria, descriptor writing, grading behavior |
| `IDEA_PRINT_STANDARDS.md` | Active, narrowed scope | Print rendering rules, for the four triggers above |
| `IDEA_Design_System.md` | **Retired 2026-08-25** | Nothing. Absorbed into `IDEA_CLAUDE_DESIGN_STANDARDS.md` 2.0 |
| `IDEA_CLAUDE_DESIGN_STANDARDS.md` | Active, sole design standard | Visual identity: colors, typography, effects, voice, print accent mapping, motion. Plus scoping protocol, prompt skeleton, inheritance rules, reveals, image slots, pre-delivery audit, live evolution |
| `IDEA_DS_DIGEST.md` | Active, generated, not a standard | Chat-facing extract of the Claude Design bundle. Descriptive evidence, never authority for a rule. Not hand-edited. Regenerated via `build_ds_digest.py` |
| `HTML_ASSIGNMENT_BUILD_STANDARDS.md` | Fully retired | Kept only as reference for a legacy standalone HTML build if explicitly requested |
| Engine behavior standards | Active | idea-app code plus CLAUDE.md |

---

## Tool Roles

- **Claude chat (this project):** judgment and content. Classification, specs, rubrics, AI-level recommendations, classroom post text, grading, print renderings, placement instructions.
- **Claude Design:** visual-first artifacts where layout is the product and logic is thin. Decks, one-pagers, posters. Never stateful tools. Governed by `IDEA_CLAUDE_DESIGN_STANDARDS.md`, which is not optional: chat scopes a slide inventory naming a component per slide before any prompt is written.
- **Claude Code:** everything that lives in a repo. The engine, spec import tooling, portal, demos.

Handoff rule: chat decides and specifies, Design lays out, Code implements and maintains.

---

## Changelog

- **2.6 (2026-08-25)** - Added "Every Material Cites Its Sources" as a governing section,
  from a standing correction by Alejandro. Two halves: nothing is authored from general
  knowledge where an owning source exists, and every material ships a student-visible
  Sources block naming what it was built from. Defines what counts as a source and, more
  usefully, what does not: general knowledge, an AI's recollection, a prior chat, and a
  file that was searched but never read. Places the block per material kind. Restates
  that citing is not excerpting, since naming a copyrighted textbook is not permission to
  reproduce from it. Pipeline step 6 updated to make a missing Sources block a rejection
  rather than a note.
- **2.5 (2026-08-25)** - Added "An Instrument Is Not a Material," after an FRC orientation intake was scoped as an assignment spec and turned out to match neither kind: `assignment` cannot express zero points without producing degenerate rubric levels and a graded row, and `reference` rejects `points` and `rubric` outright and collects nothing. Recorded the routing rule that an instrument is an app surface owned by whichever app consumes the answers, and the requirement to audit for an existing collector before specifying a new one. Added the type table row.

- **2.3 (2026-08-16)** - Added Session Prerequisites, requiring `print.css` and the reference-spec validator to be uploaded before authoring rather than after delivery. Added Inherit Before Authoring. Added Reference Documents Are Never Built As Code, covering the syllabus paired-deliverable rule, the markup-only constraint on print sources, and the short-link ordering dependency.
- **2.2 (2026-08-15)** - Facilitation guides deferred to the end of a unit's build and made request-only, with the rationale and the distinction from answer keys, sample keys, and setup notes. Material type table updated.
- **2.1 (2026-08-13)** - Added Placement as pipeline step 7, with its trigger, required contents, the canonical repo layout, the repo-relative asset path convention, and a destinations table. Added reference documents to the material type table and to Phase 3. Updated the standards map for `IDEA_MATERIAL_SPEC_v2.md` and `IDEA_RUBRIC_STANDARDS.md`.
- **2.0 (2026-08-11)** - Assignment engine and IDEA Classroom live. Print became an exception with four triggers. Google Classroom removed from the workflow.
- **1.0 (2026-08-10)** - Initial process.
