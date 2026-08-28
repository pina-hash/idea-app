---
title: "Editing what a student reads, in place, with a guard that refuses everything else (`claude/assignment-spec-editor-6q4n3f`, code only, no migration)"
date: 2026-08-27
branches: [claude/assignment-spec-editor-6q4n3f]
migrations: []
subsystems: ["IDEA Classroom"]
record_order: 154
---

## Editing what a student reads, in place, with a guard that refuses everything else (`claude/assignment-spec-editor-6q4n3f`, code only, no migration)

Changing one sentence in a published assignment meant editing raw JSON and
re-importing the whole spec. This adds a wording editor over both spec kinds --
the assignment spec and the reference spec -- that renders the document's own
block list and makes every TEXT surface editable where it sits, and it refuses,
at save, any outgoing document that differs from the incoming one anywhere else.

Three sections of IDEA 209H run identical grading and one is taught by somebody
with no way to debug a spec, so the failure mode this had to rule out is not "the
editor is awkward", it is "a typo fix silently moved a point value". That is what
the guard is for, and it is the reason the editor does not merely render the safe
fields.

### The enumeration, and what is deliberately not on it

`src/lib/classroom/spec-text.ts` is the ONE statement of which fields are wording.
It is derived from the two schemas and reports 15 surfaces on the assignment
fixture and 24 on the reference fixture; over the whole of `materials/` (10
assignments, 8 reference documents) it yields 1607.

**Assignment:** `meta.title`, `approvalGate.label`, per module `title` and
`intro`, and per block `instructions.content`, `textField.prompt`,
`table.columns[].label` / `.tip`, and `checklist.items[]`. An `imageZone` and a
`calc` block carry no text at all and contribute nothing.

**Reference:** `meta.title` / `subtitle`, per section `title` and `blurb`, and per
block `instructions.content`, `keyValue.title` + `items[].label` / `.value`,
`dataTable.title` / `caption` / `columns[].label` / `rows[][col]`,
`callout.title` / `content`, `cardGrid.title` + `cards[].title` / `.body`,
`linkCard.title` + `links[].fallbackLabel` / `.label` / `.note`, and `calc.title`.

What is off the list is the interesting half:

- **Every grading field.** `meta.totalPoints`, `module.points`, `block.points`
  and the whole `rubric` subtree.
- **`module.aiLevel` AND `module.aiNote`.** The level is obvious. The note is out
  for the less obvious reason that it is the module's statement of what AI use is
  permitted -- the level expressed in words -- and a level whose prose says
  something else is worse than either alone. One line in `assignmentSurfaces`
  reverses that if the judgement is ever reversed.
- **`section.slug`**, a permanent printed contract.
- **Every `url`, every `id`, every `key`, every `type`, and `calc.config` in both
  kinds.** The config carries points possible, category weights and the AI
  ladder's own levels; the prose inside it explains those numbers, and a
  text-only carve-out into a union-typed object is where a guard bug would be
  least visible.
- **`meta.headerFields` and `module.customChecks`.** Measured, not assumed: both
  are declared in `assignment-spec.ts` and read by nothing anywhere in `src/`.
  They are not text surfaces, they are dead fields.

`kind` per surface is also a measurement rather than a preference. Exactly TWO
fields per spec go through `MarkdownText` -- an assignment's
`instructions.content`, and a reference document's `instructions.content` and
`callout.content`. Everything else is interpolated as plain text
(`<p>{mod.intro}</p>`, `<label>{block.prompt}</label>`, `<dt>{item.label}</dt>`),
so a rich-text control over one of those would let an author write `**bold**` and
read it back literally on a student's page. Prose gets the editor; a sentence
gets a textarea; a short string gets an input.

### The guard

`src/lib/classroom/spec-text-guard.ts` walks the before and after documents in
parallel. At a path the enumeration named, a string difference is permitted; at
every other path deep equality is required, and any difference is a refusal
naming the path and both values. The allowed set is computed from the BEFORE
document, so a save that invented a module cannot also invent permission for the
text inside it -- the new module is an array-length difference and is refused
before anything inside it is read.

`prepareSpecTextSave` applies the edit set and then guards THE RESULT, so a bug
in `applySpecTextEdits` is a refusal rather than a bad write. That is the whole
argument for the shape: the guard is not the intent, it is the document.

**Two corpus findings, both real bugs caught by sweeping `materials/`:**

- **Seven reference documents carry `caption: null` on a dataTable.** With the
  type test ahead of the identity test, the guard refused every edit anywhere in
  those documents with "changed from null to null". `compareText` now asks
  identity first, and treats `null` as absent for a text surface -- which is what
  every renderer already makes of it (`{#if block.caption}` cannot tell a null
  from a missing key).
- **Two documents carry a dataTable cell stored as `""`.** The
  optional-emptied-means-removed rule deleted the key when the value was written
  back unchanged, so a no-op round trip rewrote a document nobody had edited.
  `applySpecTextEdits` now returns early when the value has not moved, before
  that rule.

### The markdown bridge, and where the editor cannot go

Spec prose is a markdown string; the editor is Tiptap configured by
`ITEM_SCHEMA_OPTIONS`. `src/lib/classroom/spec-markdown.ts` converts markdown to
the codebase's own `ItemDoc` (so `docToTiptap` stays the one seeder) and the
editor's output back to markdown. Markdown has tables, blockquotes, code and
figures that `ItemDoc` does not.

So the editor is offered only where it can hold the whole field, tested by a real
round trip rather than a feature sniff. **Measured over the 209 prose fields in
`materials/`: 197 open in the editor, 12 fall back to a source textarea** -- 8
carrying a code block, 7 a table, 3 an image, 1 inline code (the counts overlap).
Each fallback says in one sentence what made it one.

The eligibility test is SEMANTIC, not byte identity, and that too is a
measurement: `parseMarkdown` joins a hard-wrapped paragraph's lines with a space
and clamps `##` to `###`, so a byte comparison refused a further 16 fields that
render identically. Byte identity for an untouched field comes from a stronger
place -- `applySpecTextEdits` never writes a surface nobody touched.

`markdownFromEditor` also reports whether its own output is FAITHFUL, and that
needed two questions rather than one. The structural round trip alone passes on
`Multiply 3 *by* 4.` typed as plain text -- the string is a fixed point, so the
check is happy while the page gains an italic nobody typed. The second question
compares the WORDS: `parseInline` has no escape syntax, so every character it
treats as markup is one it also deletes from the text, and a plain-text
comparison catches exactly that class of divergence without a second copy of
"which characters are special".

### Images go in where they are used

A drop or an image paste into a prose field uploads through
`uploadClassroomFile` (role `attachment`, the existing sign / PUT / record path,
no second transport) and appends `figureReference(filename)` in the same action,
so the reference and the file cannot diverge. The field then moves to source
mode, because a figure is the one thing the editor cannot hold.

**A reference that would not render is refused rather than written.**
`FIGURE_RE` matches a src of `[^)\s]+`, so `![x](attachment:bench setup.png)` is
not a figure at all -- it falls through to the paragraph path and a student reads
the markup. Found in a browser with a file named "truss detail.png".
`figureLineRenders` puts the produced line through the REAL parser; on a refusal
the file is still attached and the message says to rename it. This is a
pre-existing gap in `figureReference`, which `AttachmentList`'s copy affordance
shares; only this caller checks it.

### Three defects found by the browser pass, none of them visible to type-checking

1. **`state_unsafe_mutation`, thrown every time.** Unmounting the rich editor by
   flipping an `{#if}` INSIDE `SpecProseField` throws: Tiptap dispatches one last
   transaction from `editor.destroy()`, which lands in `RichTextEditor`'s own
   `syncActive` while Svelte is still evaluating the block that removed it.
   Measured three ways -- typing then dropping an image reproduced it every time;
   unmounting the WHOLE component after the same typing never did; the composer's
   own cancel path (which unmounts the component, not a branch) is clean. Deferring
   the flip with `setTimeout` did not help. The fix is that the source-mode flag
   lives in `SpecTextEditor` and re-keys the field, so the instance is replaced
   rather than reshaped.
2. **A save loop, three extra writes per save.** Clearing the edit set on a
   successful save handed the prose field the stored value again, the reseed
   emitted another ProseMirror transaction, `markDirty` fired, and the save
   machine coalesced another write out of it -- with the acknowledgement wiped off
   the screen by its own follow-up. Fixed the way `CLAUDE.md` already says to:
   `EditBaseline` seeded from the editor's own `onready` output, so a seeding
   transaction reports nothing, plus `edit()` comparing against what the control
   is already showing rather than against the edit slot alone.
3. **A manual save is a checkpoint, not a finish.** Clearing `edits` put the
   pre-save wording back on screen until the item's reload landed, and a second
   edit made straight after a save was appended to the OLD text. The typed value
   now stays and the comparison moves: `acked` holds what the server confirmed,
   "unsaved" is `edits` against that, and when the reload arrives the two agree by
   construction.

### It saves through what already exists

`teacherTransports.setSpec` and `referenceTransports.setReferenceSpec`, unchanged.
Confirmed by reading the SQL rather than assumed:

- **Revision history and rollback come free.** `classroom_set_assignment_spec`
  and `classroom_set_reference_spec` (0110) each call
  `_classroom_snapshot_content` on the outgoing document before writing, and
  `classroom_revert_content` restores a snapshot by calling those same setters.
  The history panel already on the item page reverts a wording change with
  nothing added here.
- **One edit reaches every class.** `classroom_assignment_specs.item_id` is a
  PRIMARY KEY on the canonical item -- one row per item, never per posting -- and
  every reader is `where a.item_id = p_item_id`. `classroom_postings` is
  `(item_id, section_id)`. There is no per-class copy to keep in step.

`transports.ts` and `revisions.ts` were on this session's file list and needed no
change at all.

### Verification

- **`svelte-check`: 0 errors, 37 warnings before and after**, same mix (31
  `state_referenced_locally`, 5 `css_unused_selector`, 1 `perf_avoid_nested_class`).
  The container had no `.env`, which reports 11 phantom errors from
  `$env/static/public`; one was written from `.env.example` with placeholder
  values and is gitignored.
- **Full suite: 122 files, 2783 tests, all passing.** Two new files add 50 tests
  (28 guard, 22 enumeration and bridge); the tree was 120 files / 2733 tests.
- **Mutation proof of the guard, both directions**, restored md5-identical after
  each. PERMISSIVE (an early `return` in `compare`, a guard that approves
  everything) reddened 16 of 28 -- all 13 refusal tests plus the three permit
  tests that assert which keys changed. RESTRICTIVE (the allowed-text branch
  deleted, a guard that permits nothing) reddened 9 of 28 -- all 7 permit tests,
  the refusal whose wording comes from that branch, and the save-path test. The
  second half is the positive control: a guard tightened into uselessness passes
  every refusal test on its own.
- **Browser pass in headless Chromium** against the existing `/dev/classroom`
  harness at `?view=item-teacher`, which mounts the real `ItemDetail` with
  `canManage` and the teacher transports, so nothing about the harness changed.
  The reference kind and the guard's refusal were driven by mounting the real
  `SpecTextEditor` through the dev server's own module graph
  (`import('/src/lib/classroom/SpecTextEditor.svelte')`) rather than by editing a
  harness route, which is out of this session's file scope.
  - The assignment panel renders 9 groups, 17 labelled fields, 0 number inputs
    and 0 selects; the strings "points", "Rubric" and "Total" appear nowhere in
    it, and "Points"/"AI levels" appear only in its own explanatory sentence.
  - The harness's one prose block deliberately contains figures, so it falls to
    source mode there, and the fallback sentence names "an image".
  - A short-string edit saved: title changed, `meta.totalPoints`,
    `module.points` and the rubric's top level all unchanged in the outgoing
    document.
  - A prose edit through the rich editor saved as
    `### Weigh each sample\n\nRecord to **two** decimals. Then divide.`
  - An image drop uploaded, appended the figure to the EDITED text, switched the
    field to source, and saved.
  - The guard's refusal was reached by mounting a spec whose `points` changes
    between reads -- a simulated bug in the editor, which is exactly what the
    guard exists for. It rendered "modules[0].points changed from 25 to 20" and
    **the transport was never called.**
  - Zero page errors on every path after the three fixes above.
- **Measured at 1440px and 375px** with transitions frozen: panel 875px and
  322px, `document.scrollWidth` equal to the viewport at both (no horizontal
  overflow), 0 children wider than the panel, and **0 controls under 44px** at
  either width.

### What was NOT verified

- **Nothing was run against the live Supabase project.** The local `.env` is a
  placeholder; no RPC, no signed-in session, no real upload. The claims about
  `classroom_set_assignment_spec` are from reading 0086, 0092 and 0110.
- **No real attachment upload.** The `upload` transport was faked in every
  browser run; the sign / PUT / record path itself is unchanged and untested here.
- **The reference editor was never driven through `ItemDetail`.** No harness
  mounts a material with `canManage` and `referenceTransports`, and adding one is
  out of this session's file scope. `SpecTextEditor` was driven directly with a
  reference spec instead.
- **No screenshots**, and no pass on a real deployment.

### Deferred, and one thing that could not be followed literally

- **`src/lib/file-drop.ts` does not exist on `main`.** The brief said to reuse it;
  it is being built in a parallel lane (`claude/shared-upload-drop-paste-bhwqq1`)
  and reaching into another lane's file is how two half-merged copies of one
  primitive end up in the tree. `SpecProseField`'s drop and paste are therefore
  the minimum DOM glue and no pure logic at all, so swapping them for
  `use:dropTarget` when that lane lands is a deletion rather than a merge.
- **A dev harness route for this editor.** Harness routes are outside this
  session's file list. The existing classroom harness reaches the assignment path
  because it mounts the real `ItemDetail`; the reference path has no harness.
- **`figureReference` still produces an unrenderable reference for a filename
  with a space**, everywhere else it is used. Only this caller checks.
- **A per-field diff against the last revision.** The history panel shows whole
  documents; saying which sentence moved is a different feature.

---

