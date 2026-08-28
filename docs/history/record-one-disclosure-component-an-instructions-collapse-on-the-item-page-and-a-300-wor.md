---
title: "One disclosure component, an instructions collapse on the item page, and a 300-word guard (code only, NO migration)"
date: 2026-08-21
branches: []
migrations: []
subsystems: ["IDEA Classroom", "Build, theme, tests, conventions"]
record_order: 99
---

## One disclosure component, an instructions collapse on the item page, and a 300-word guard (code only, NO migration)

Three things, and the first exists because the second needed it.

### What was there

**Twenty-odd hand-rolled disclosures in two families, and no shared component.**
One family is native `<details>` (16 occurrences across 10 files); the other is a
button carrying `aria-expanded`, sometimes `aria-controls`, over a region hidden
by a `max-height` rule or an `{#if}`. They disagreed about the parts nobody looks
at: whether the trigger says a word or only draws a caret, whether the region is
announced, whether anything is remembered, whether it survives print.

**`ItemDetail` rendered the instructions body unconditionally** -- no clamp, no
disclosure -- and so did every module's `instructions` block inside
`SpecRenderer`. `IDEA_INTERFACE_STANDARDS` 1 has required the opposite since 2.1:
"Reading material does not sit between a person and their work on every return
visit... Where this shape appears on more than one surface it is one component
with one behaviour."

**The 300-word instructions ceiling was a document, not a constraint.**
`IDEA_MATERIAL_SPEC` v2.1 split the budget into a 250-word target and a 300-word
ceiling precisely so the ceiling could be tested, and nothing tested it.

### What changed

**`src/lib/Disclosure.svelte` + `src/lib/disclosure.ts`.** A real `<button>` with
`aria-expanded` and `aria-controls` pointing at a real id, a visible word on the
trigger ("Instructions" plus "Show"/"Hide", never a bare caret), an optional
`heading` level so it can replace a section label without contributing type, and
a 44px trigger. The arithmetic lives in the `.ts` so it is assertable without a
browser.

Load-bearing decisions:

- **The region is HIDDEN IN CSS, never removed.** `display:none` when closed,
  `display:block` under `@media print`. Collapsing is about the second visit, so
  the material stays one press away, and a printed handout carries it whatever
  the screen was showing.
- **What is stored is the MANUAL CHOICE, never the current state.** Storing the
  state would freeze the FIRST render forever: a student who opened an
  assignment, read the instructions and started typing would have "expanded"
  written down and be handed the wall of text again on every visit after, which
  is the exact defect the collapse exists to fix. So the stored value is
  `open`/`closed` only once a person has toggled, and
  `disclosureOpen(stored, collapseWhen)` is the whole rule: `stored ?? !collapseWhen`.
- **The default is EXPANDED, for every role.** `disclosureOpen` takes two
  parameters and no role, which is asserted on its `.length` -- the moment it
  grows a third, an instructor and a student can be given different defaults.
- **The viewer's id is added to the key INSIDE the component**, read off
  `page.data.claims.sub`, so "per person, per item" is one rule in one place and
  no caller threads an identity through. Key shape:
  `idea:disclosure:1:<viewer>:<scope>`, versioned so a future shape change is a
  new namespace rather than a migration. A null or blank scope remembers
  nothing, which is the right answer for a preview or a harness.
- **An unrecognised stored value is DROPPED, not coerced** (the `preferences`
  doctrine applied to the browser's own store): a truthiness check on some other
  string would put the panel in a state no branch renders, and nothing would ever
  overwrite it.
- **`stored` is a `$derived` read, not an `$effect`,** so the first client render
  already has the remembered answer and nothing flips a frame later; a keyed
  `override` carries the just-made write, since localStorage is not reactive, and
  keying it to the storage key is what makes a caller that swaps `scope` without
  remounting fall back to the new panel's own memory.
- **Two room hooks, `--disc-accent` and `--disc-focus`, read at the POINT OF USE
  with a fallback** rather than declared as tokens on `.disc`. A declaration
  there would sit on a descendant of `.nb-root` and beat the room's own value --
  the var()-resolves-where-declared trap in reverse. `.nb-root` now declares both
  as `--nb-accent-ink`, so the paper room gets brass rather than the portal's
  mint and its cyan focus ring, neither of which is measured on paper.

**The collapse, on BOTH instructions surfaces of the item page.** The brief named
`ItemDetail` and `ItemBody` in one breath and `SpecRenderer`'s `values` map in the
next; they are different components, so the choice was put to the author, who
chose both with one component. That is also what the standard requires.

- `ItemDetail`'s written-body card ("Instructions" on an assignment, "Details"
  otherwise) is wrapped, with `heading={2}` so the section label it replaces keeps
  its place in the outline. **The disclosure is at the call site, not inside
  `ItemBody`** -- the class stream mounts `ItemBody` too, where a collapse would
  mean something else entirely.
- Each module's `instructions` block in `SpecRenderer` is wrapped, scoped
  `<assignmentId>:<moduleId>:instructions:<blockIndex>`, so a second instructions
  block later in a module is its own panel.
- **The "has started" signal is DERIVED from state each surface already holds.**
  New pure helpers in `assignment-spec.ts`: `blockStarted` (one implementation),
  and `moduleStarted` / `specStarted` over it. `SpecRenderer` reads it off the
  `values` map it already owns, in the same `{#each}` and beside the
  `moduleCompletion` that already reads it; `ItemDetail` reads it off the `engine`
  slice it already loaded. No store, no new prop, no second read.
- **`blockStarted` is deliberately NOT `blockProgress(...).have > 0`.**
  `blockProgress` answers "how far against its own constraint" and returns null
  for an unconstrained block, so a student typing into a textField with no
  `minSentences` would count as not started.
- **A manager has no engine slice, so `started` is false and the panel stays open
  for them.** That is the rule producing the right answer, not an exemption from
  it -- there is no `canManage` anywhere in the expression, which a test asserts
  by reading the source.

**The 300-word guard.** `instructionsWordCount(mod)` walks `parseMarkdown`'s
output -- the same walk `MarkdownText` performs -- and sums every `instructions`
block in the module. A regex syntax stripper was rejected: it is a second, worse
implementation of the parser, it would charge an author for their own list markers
and pipe borders, and the number a test failed on would not be the number on the
page. Figure alt text counts (it renders as the visible caption); code blocks
count (they render).

- **Runs within one paragraph, cell or list item are JOINED before counting.** A
  run boundary is a formatting boundary, not a word boundary: `**Measure**.`
  arrives as a bold run and a `.` run, and counting them apart charges two words
  for one. This was found by a constructed fixture coming out 3 over. Joining must
  never cross a structural boundary -- two list items joined would read as one
  word where the marker was.
- `validateSpec` gained a third return field, `warnings`, non-blocking by
  construction: the spec still comes back and `parsed` is still set, so Publish
  stays enabled. `SpecImporter`'s existing problem list now carries a `tone` per
  row with the WORD "Error" or "Warning" beside the colour, and the `Valid: ...`
  line renders BESIDE a warning rather than being displaced by it, so "this does
  not stop you" is legible without a sentence saying so.
- **Errors moved from `--amber` to `--crimson`.** The list drew errors in the
  WARNING colour, which left nothing for a warning to be; `--crimson` is the
  token's documented role.
- Over the CEILING is still a warning and not an error. The ceiling is the test's
  job, by name and by count; the tier that gates publishing is the one that
  answers to the SQL boundary.

### Measured

**The catalog: 19 modules across 8 specs.** Max non-exempt **243 words**
(`materials/idea209h/unit-1-lab-density-and-measurement-checkpoint-1`, m1).
Distribution by bucket: 0-50: 3, 51-100: 3, 101-150: 3, 151-200: 2, 201-250: 2,
**251-300: 0**, 301+: 6. All six over the ceiling are the two modules of the three
byte-identical authoring test copies (md5 `3620df29a1e5eee6e7a538514730c607`),
exempt by path AND by hash, capped at three entries.

**The counts differ from the brief's.** This counter reads m1 at **520** and m2 at
**340**; the brief said 506 and 328. The gap is a counting-rule difference, not a
defect: composition is m1 `{heading 34, paragraph 309, tableHeader 7, tableRows
82, list 61, code 27}` and m2 `{heading 20, paragraph 230, list 60, code 30}`. A
naive regex-stripped whitespace count of the same source gives 526/341, so this
counter sits slightly BELOW the naive one, which is the run-join rule doing its
job. Nothing about the exemption changes either way: both modules are far over 300
on every rule tried.

**Page height, `/dev/classroom?view=assignment`, both panels open vs. collapsed:**
3953 -> 3603px at 1440x900 (**350px**), 4728 -> 4354px at 375x812 (**374px**).

**Viewports.** 1440x900: `scrollWidth 1425, clientWidth 1425` (document and body),
trigger box 846x44, body pane 846px. 375x812: `scrollWidth 375, clientWidth 375`,
trigger box 293x44, disclosure body `scrollWidth 293, clientWidth 293`. No
horizontal overflow at either end, and the 44px trigger survives the narrow width
exactly.

**The classroom's green `// ` h2 prefix does not leak onto the heading-wrapped
trigger:** computed `::before` content is `none`.

**Importer contrast**, read back through a canvas rather than parsed out of a
computed style: "Error" tag **4.81:1**, "Warning" tag **5.70:1**, problem text
**14.5:1**, each against the surface it actually composites over. With only a
warning: Publish enabled, `Valid: "Warning demo" -- 1 module - 5 points.` shown
beside it. With an error and a warning: error first, Publish disabled, no valid
line.

### Verified in the Browser pane, through `/dev/classroom`

The harness mounts the REAL `ItemDetail`, the REAL `AssignmentEngine` and the REAL
`SpecRenderer`; only the transports are in memory. Transitions were disabled
before every geometry read.

1. **Fresh load, nothing entered:** both panels `aria-expanded="true"`,
   `display: block`, localStorage empty. Nothing is stored for an untouched item.
2. **One textField typed into:** both panels flipped to `aria-expanded="false"`,
   `display: none`, prose still in the DOM (123 and 227 characters), and
   localStorage STILL empty -- the collapse is derived, not written.
3. **Manual collapse with nothing entered:** wrote exactly one key,
   `idea:disclosure:1:anon:item:i-3:body = closed`. The sibling module panel, a
   different scope, stayed open.
4. **Reload:** still `aria-expanded="false"`, `display: none`, content still in
   the DOM, with nothing entered -- so the surviving collapse is the remembered
   choice and nothing else.
5. **A different item:** the stored key re-pointed at another item id, reload --
   this item opens EXPANDED while the other stays remembered closed.
6. **Manual open after typing:** stays open and stores
   `...:idea100-bridge-01:m1:instructions:0 = open`, so the override beats the
   started signal in both directions.
7. **Instructor view (`?view=item-teacher`):** the same two panels, both open, no
   role difference, `h2 > button` confirmed.

### Mutation proof

**11 mutations, each verified APPLIED by grep AND by a changed md5 before its
result was read, each restored byte-identically (md5 back to the original), a zero
treated as a failure of the proof rather than a finding.** Every one reddened at
least one assertion; none reported zero. One (M11) failed the proof on its first
run -- pattern matched 0 times against a CRLF file -- and was reported as a
harness failure and re-run with a corrected pattern, which is exactly what the
"verified applied" check exists for.

| # | mutation | reddened |
|---|---|---|
| M1 | `disclosureOpen` -> `return true` | 5 |
| **M2** | **`disclosureOpen` -> `stored ?? false` (REJECTED ALTERNATIVE: collapsed on first open)** | **3** |
| M3 | `moduleStarted` -> `return false` | 3 |
| M4 | Disclosure body -> `{#if open}` (removes instead of hiding) | 1 |
| M5 | `collapseWhen={readonly ? false : started}` (a different default per role) | 1 |
| M6 | ceiling 300 -> 600 | 3 |
| M7 | `runWords` -> `return 0` | 8 |
| M8 | the 251-300 warning tier removed | 1 |
| M9 | sweep pointed at a directory that does not exist | 4 |
| M10 | a fourth exemption added | 3 |
| M11 | an exempt spec edited by one byte | 1 |

**M2 is the one that matters.** Collapsing by default on a first open is the
design a future session would refactor toward, because it looks tidier and nothing
else would stop it. It reddened 3 -- *and a different three* than M1's permissive
mutation: M1 killed the collapse and lost "is COLLAPSED once one cell of one row
has been entered" and "HIDES the material, it never removes it"; M2 killed the
default and lost "is EXPANDED when the student has entered nothing". That
difference is the proof the suite encodes the DECISION and not merely the
behaviour.

M9, M10 and M11 are harness checks on the guard's own positive controls: that a
sweep finding nothing reddens rather than passing, that the three-entry cap bites,
and that the hash pin bites.

### Suite

`npx svelte-check`: **0 errors, 36 warnings** -- the baseline, unchanged.
`npx vitest run --no-file-parallelism`: **74 files, 1843 passing** (72/1812
before; two new files, 31 new assertions).

`vitest.config.ts` gained one alias, `$app/state` -> `tests/stubs/app-state.ts`.
`Disclosure` reads `page.data` for the viewer id, and two components already
covered by render tests mount it, so without a stand-in those existing tests could
not import them.

### The other disclosures, for a later pass

**Same shape, migratable to `Disclosure`** (a button with `aria-expanded` over an
in-flow region): `ClassroomFeed.svelte:143`, `ClassView.svelte:962` (unit group)
and `:606` (row expand), `DeckViewer.svelte:118`, `ItemDetail.svelte:370` (the
inspector strip), `RevisionHistory.svelte:128` and `:163`,
`EntryReview.svelte:379` and `:473`, `NotebookEntryCard.svelte:686`,
`UnitManager.svelte:158`, `dev/series/+page.svelte:112`,
`gauntlet/speedrun/+page.svelte:155`. Native `<details>`, same family, 16
occurrences: `PeoplePanel` (2), `LogView` (3), `ChangelogFooter`, `EntryNotes`
(2), `NotebookEntryCard` (2), `dashboard`, `dev/classroom-deck`,
`gauntlet/rooms/[id]`, `gauntlet/speedrun/[id]` (2), `gauntlet/tools` (2).

**Genuinely different, and they do NOT migrate.** `ProfileMenu.svelte:149`,
`ClassView.svelte:694`, `ClassroomShell.svelte:101` and
`NotebookThemeToggle.svelte:108` are anchored MENUS -- `aria-haspopup`, outside
dismiss on `pointerdown`, a different contract. `RichTextEditor.svelte:360` is an
anchored POPOVER that is also `aria-pressed`. `LogView.svelte:1197` is a
`role="combobox"` where `aria-expanded` describes a listbox, an ARIA contract of
its own. `ClassView.svelte:891` and `:902` are mode toggles whose `aria-expanded`
describes a panel elsewhere in the tree, not an adjacent region.
`SessionManager.svelte:314` switches a row into a manage mode.
`gauntlet/speedrun/[id]`'s two `<details bind:open>` carry externally driven
state.

### NOT VERIFIED, and why

- **The live Supabase project.** The local `.env` is the placeholder
  (`example-ref`). Nothing here ships SQL, changes an RPC signature or needs a
  grant; the remembered state is localStorage and the word count is client-side.
- **A signed-in viewer id in the key.** The harness has no claims, so every key
  driven in the browser read `anon`. That the id separates two people is asserted
  in unit tests against `disclosureKey`, not driven with two real sessions.
- **The notebook check-in guidance panel.** It does not exist yet. The room hooks
  are declared and the component reads only tokens `.nb-root` aliases, but no
  `Disclosure` is mounted under `.nb-root` today, so its appearance on paper is
  reasoned from the token table rather than measured.
- **Print output.** The Browser pane cannot emulate print media. The
  `@media print` rule is asserted as authored CSS, not as a rendered sheet.
- **Screenshots.** The pane does not composite. Every visual claim above is a
  measured computed-style, geometry or canvas-readback figure.
- **The other disclosures.** Inventoried and classified by reading them; none was
  converted and none was driven.

**Undoing it:** revert the changed files and delete the five new ones
(`src/lib/Disclosure.svelte`, `src/lib/disclosure.ts`, `tests/stubs/app-state.ts`
and the two new test files). There is no migration and nothing applied. Reverting
`assignment-spec.ts` alone would leave `SpecRenderer` importing `moduleStarted`,
`ItemDetail` importing `specStarted`, and `SpecImporter` reading
`result.warnings` -- revert those with it. Stored `idea:disclosure:*` keys become
inert strings; nothing reads them.

---

