---
title: "The app becomes a route to its own spec data: the attached JSON is on the page, one press copies it, and Replace opens on what is attached rather than on nothing (`claude/spec-importer-seeding-display-f8d83n`)"
date: 2026-08-30
branches: [claude/spec-importer-seeding-display-f8d83n]
migrations: []
subsystems: ["Classroom", "Testing"]
---

An audit found that an instructor who did not author a spec could not read one.
All four claimed defects were confirmed against `main` before anything was
built, and none of them was already false:

1. `raw` was `$state('')` and the only writes to it were the file picker, the
   `bind:value` and `clearEditor`. **"Replace spec" opened an empty box.**
2. The attached spec was rendered as a summary line only (`attachedMeta`:
   title, id, module or section count, points). The JSON appeared nowhere in
   `src/`.
3. No copy, no download, no export -- `grep -n "clipboard\|download"` over
   `SpecImporter.svelte` returned one hit, and it was a comment about the
   public toggle's wording.
4. The only route to the bytes was the GitHub export under `materials/`, which
   nothing on screen mentions.

The constraint this failed is that one instructor teaches a section of this
course with no access to the tooling and was not part of designing it. Every
other affordance here assumed the reader had authored the thing they were
looking at.

## What was built, and why it is one feature rather than three

**THE JSON IS ON THE PAGE**, under the summary line, in the shared
`Disclosure` with `collapseWhen` true -- collapsed because a spec is tens of
kilobytes and nobody opens an item page to read JSON, present because "there
is a document here and this is it" is the whole defect. Collapsing hides
rather than removes, so it prints and reopening costs nothing. `scope` is
per item and per kind; it is null in staging mode, which is the documented
"do not persist" answer for a panel with no item to remember it against.

**ONE PRESS COPIES IT**, from the always-visible action row beside "Replace
spec" rather than from inside the panel: reading the document and taking it
are different jobs, and the common one is handing the JSON to an AI tool.

**THE EDITOR OPENS ON WHAT IS ATTACHED.** `toggleEditor` seeds `raw` from the
same serialization the panel renders and flushes validation immediately, so
the box comes up valid with a live preview and no keystroke.

They are one feature because they are one serialization. `specJsonText` is
read by the viewer, the copy control and the seed alike; three spellings of
"the spec as JSON" is how the panel comes to show one thing and the clipboard
to carry another.

## The load-bearing decisions

**THE STORED OBJECT IS NOT THE AUTHORED BYTES, AND THE PANEL SAYS SO.** `spec`
arrives as the row's jsonb, so Postgres has already reordered the keys and
dropped the whitespace. It is the same document -- it validates, it
republishes, it is the right thing to paste into a tool -- but it is not a
byte-for-byte copy of the file somebody once pasted, and a surface that
implied otherwise would be lying in a way nobody could check. One sentence
above the `<pre>` states it.

**SEEDING MAKES AN ACCIDENTAL REPUBLISH POSSIBLE, SO ONE IS REFUSED.** An
empty box could not overwrite anything by accident; a seeded one is one stray
click from writing a revision that changes nothing, which is exactly the "a
save that changed nothing is not an edit" case the item page already cares
about. The guard is a COMPARISON, not a flag: `EditBaseline` records what the
box opened on and answers whether it has moved off it, so "is there content in
here" can never be mistaken for "has this been edited". That class already
exists for precisely this bug in `ContentComposer` and `CheckInGuidance`;
writing a second comparison here is what this repo has paid for before.

**ONE PREDICATE, AND THE CONTROL IS `aria-disabled`.** `publishReady` drives
both the button and the handler -- two spellings of "is this ready" is what
produces a click that does nothing. `disabled` was replaced because a
genuinely disabled control swallows the press and can never say why it
refused, and the unchanged-from-attached case is the one that most needs to.
The refusal renders in the ONE problem list every other problem appears in,
as a WARNING rather than an error: nothing is wrong with the document, and the
"Valid:" line stays beside it, which is what makes "you are being told
something, not stopped" legible without a sentence explaining it.

**THE CLIPBOARD REFUSAL IS THE INTERESTING HALF.** A copy control that
silently does nothing where the clipboard is unavailable is worse than no
control: the reader walks away believing they hold the spec. Three things
follow. The async API is tried, then a selected off-screen textarea (an
insecure origin and a dismissed permission prompt are both ordinary), and only
if BOTH fail is a refusal shown. The success note times out at 2.5s and **the
refusal does not** -- one that faded would leave a reader who looked away
believing the copy worked. And the refusal OPENS the JSON panel, because its
advice ("select it and copy it yourself") is only true if the text is actually
on screen.

**SEEDING NEVER OVERWRITES A DRAFT.** Closing the editor has never discarded
what was typed, so the seed fires only into an EMPTY box. The case the defect
was about is opening on nothing.

**NOTHING WAS ADDED TO `ItemDetail` OR `ContentComposer`.** Every input the
feature needs -- `spec`, `staged`, `itemId`, `kind` -- was already a prop, so
the change is one file plus a harness. That was checked rather than assumed.

## Staging mode

The composer's mount passes `itemId: null` and no transports, and `spec` is
always null there; `shown` resolves to `staged`. So the panel and the copy
control are **absent until something is staged** and appear afterwards,
reading the staged document -- which is the same rule the attached case
follows, with no staging branch anywhere in the component. There is no
attached spec for it to try to read, and measured, the editor opens with 0
characters in it. The write path is untouched: `onstage` fires, nothing
reaches a server, and the guard applies equally.

## Measured

`npm run verify:browser` could not be extended -- `tools/browser-verify/routes/`
is owned by another lane this session -- so Chromium was driven directly
against `/dev/spec-importer` at 1440px and 375px. The route spec that should be
committed there later is printed in this session's final report.

- **Readable.** 108 lines / 2512 chars (assignment), 46 lines / 943 chars
  (reference), Share Tech Mono at 11.52px. At 1440 the box is 900x350px and
  shows **19 of 108 lines** before scrolling; at 375 it is 315x286px and shows
  **15 of 108**. Long lines scroll INSIDE the box (`white-space: pre`,
  content 448px wide in a 315px box at 375) and the page itself never does.
- **Copy.** Clipboard holds 2512 chars against 2512 on the page, identical.
  Note reads `Copied. 108 lines · 2.5 kB.`
- **Copy denied** (both `navigator.clipboard` and `execCommand` removed before
  any page script ran): refusal visible at 37px/1440 and 74px/375, contrast
  **6.36:1**, still present after 3.2s, and the JSON panel went from
  `visible=false` to `visible=true`. JSON body contrast **7.63:1**.
- **Seeding.** Textarea seeded with 2512 / 943 chars, byte-identical to the
  panel; with no keystroke: 0 problems, preview rendered, `Valid: "Bridge
  stackup" -- 2 modules · 20 points.`
- **The guard.** Pressing Publish on an unedited seed: transport calls
  **0 before, 0 after**; a Warning-tier line; the "Valid:" line still beside
  it. After editing one field: `aria-disabled=false` and the write LANDS
  (`setSpec(i-assignment, "Bridge stackup (rev 2)")`, then `onchanged`).
- **Absence checks carry positive controls.** In staging with nothing staged,
  `spec-json`/`spec-copy`/`spec-json-toggle` are exactly 0 while
  `spec-open-editor` is 1; after staging, `spec-json` and `spec-copy` go to
  **1**. That 0 -> 1 transition is what proves the zeros were measuring
  something real.
- **No horizontal overflow** in any of the four cases at either width:
  `scrollWidth === clientWidth` (1440/1440, 375/375). **0 console errors.**
- **Invalid JSON still reddens**: 0 problems seeded -> 1 error, the parser's
  own message, `rgb(217,95,95)`, valid line and preview gone,
  `aria-disabled=true`.
- **Mutation proof on the seeding**: green, seeding removed -> **both cases
  red** (0 chars, exit 1), restored from a COPY (never `git checkout --`,
  which discards uncommitted work to HEAD), md5 `0ee3399e...` identical, green
  again.
- `svelte-check`: **0 errors, 37 warnings**, breakdown 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class` -- the documented baseline, unmoved.
- `npm test`: **211 files, 4395 tests, all passing.**

## Tap targets, stated rather than papered over

The classroom inspector's action row is a locked `.btn.tiny` density: measured
at both widths, "Close import" 24px, "Publish spec" 24px, "Upload .json"
27.6px, "Remove spec" 24px -- **all pre-existing, all before this bundle**,
confirmed on the nothing-attached case where every control is one this bundle
did not touch. `Copy JSON` is 24px because it sits IN that row and matches its
siblings exactly; inflating one button to 44 in a row of 24s would break a real
invariant to satisfy a guideline written for standalone controls, which is the
documented exception. The one control this bundle added that OWNS its row --
the Disclosure trigger -- measures **44px**. This is an instructor-only
surface, so the applicable floor is 24px, and nothing added here is below it.

## Not verified

- Nothing was run against the live Supabase project. The local `.env` is a
  placeholder, so no RPC, no real `classroom_set_assignment_spec` write and no
  real jsonb round trip was exercised. **The claim that Postgres reorders keys
  is why the panel's sentence hedges, and it was reasoned from jsonb's
  documented behaviour rather than measured here.**
- No signed-in session and no production surface. Every measurement is the
  real component in the dev harness against in-memory transports.
- `prefers-reduced-motion` was `no-preference` throughout; that path was not
  exercised.
- No Vercel preview: deployments are rate limited this session.

## Deliberately not done

No `classroom-updates.json` entry. All three mounts are gated behind manager
transports (`canEditAssignment`, `canEditReference`, `canStageSpec`, each
requiring `teacherTransports`/`referenceTransports`), so nothing here is
reachable by a student and nothing a class sees changed. The rule is that a
change to what a class SEES always gets an entry; this changes only what the
person managing the item can reach.

Not a spec authoring UI, not a schema change, not a new export format, and no
change to the GitHub export, which works and was never the problem.
