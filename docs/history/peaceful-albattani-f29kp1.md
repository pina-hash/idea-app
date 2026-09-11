---
title: "Prompt 0141: the grading console can see a ported student's work, a worksheet stops losing keystrokes, and two validators learn what a worksheet is (`claude/peaceful-albattani-f29kp1`, no migration)"
date: 2026-09-11
branches: [claude/peaceful-albattani-f29kp1]
migrations: []
subsystems: ["Classroom", "HTML assignments", "Grading", "Browser harness", "Validators"]
---

Ledger 0140 landed the ported-HTML-assignment subsystem on `main`, which made a
schema-3 assignment reachable for the first time. Mr. Pina uploaded one, a
class worked in it, and he could not grade it: the roster read "In progress",
the rubric rendered, and the pane where the student's answers belong was empty.
This bundle is that, plus the three things found beside it.

## ONE. The grading console renders the work

**The defect was wiring and nothing else.** Measured in production at `89b8154`
on 2026-09-10. `classroom_assignment_specs` has no row for a ported item, so
`spec` came back null; `GradingConsole` had carried an `htmlWork` snippet prop
since 0195 and the grade page passed none; so the work column fell through
`{#if spec}`, `{:else if htmlWork}`, `{:else if !selected.files.length}` and
rendered nothing at all. Every layer above the screen was correct -- the
responses were stored, the manifest was stored, the rubric was stored. Nothing
type-checked wrong, because every prop involved is optional and `null` is a
legal value for all of them.

**The grade load now runs the same ladder the item page runs, through the same
function.** `loadHtmlAssignment` in `$lib/classroom/html-assignment/load.ts` is
new and is an EXTRACTION rather than an addition: the item page's
`+page.server.ts` carried the only reader of `classroom_html_assignments`, and
a second copy in the grade load was the cheaper-looking fix. The ladder is not
one select -- it is a narrow probe and then a document read, each of which can
fail on a deployment short of 0195, with a `ready` flag that has to start false
-- and two spellings of "can this deployment tell me" is two answers, with the
surface that got the stale one rendering the wrong engine over nothing.

**It takes a whole `SupabaseClient`, and the narrow structural interface was
tried first.** An interface naming only `from().select().eq().maybeSingle()` is
refused by TypeScript with "Type instantiation is excessively deep and possibly
infinite", because the generated query builder is generic over the whole
database schema. `loadItemDeck` in `transports.ts` already takes the whole
client; this follows it, and the header says why rather than leaving the next
reader to rediscover it.

**The seed is the student's own, through the student's own projections.**
`hxFrameSeed` is new and is a pair, not a third implementation:
`hxValuesFromResponses` and `hxImagesFromFiles` unchanged, called together. A
read-only mount needs exactly those two and not the third (`hxFileIdsByField`
exists so a remove or a caption edit can name a row, and there are no writes
here). It is a function rather than two calls at the grading site because a
surface that called only one of them would render a student's answers with
their photographs missing and look entirely correct.

**Read-only is the absence of a write path.** No `onchange`, no `onimage`, no
`onimageremove`, no `onimagecaption` is handed down, so there is no write to
execute; `readOnly` is passed as well, which is what makes the DOCUMENT stop
accepting input -- a worksheet a grader can type into is a grader editing a
student's answers. The test asserts the four absences by name rather than
asserting `readOnly` alone.

### Rasterizing found a defect a content check could not

The first version put the document BESIDE the rubric, in the two-column
arrangement a spec render uses. Every content assertion passed: frame present,
`ready=yes`, `listening=yes`, the seeded values inside it. **Rasterized, it was
275px wide**, with the worksheet's own headings wrapping over three lines.

Measured up the container chain rather than guessed at:

| what | at 1440 | at 1920 |
| --- | --- | --- |
| `main.grading-page.cr-console` | 960 (its own `max-width`) | 960 |
| `.console.split` | 896 = roster 320 + detail 562 | 896 |
| `.work-split` | 562 | 562 |
| `.work-left` (the document) | 280 | 280 |
| `.hx-frame-wrap` | **275** | **275** |

The cap is the console's own page measure (nav.ts's `console`), so **280px is
the most the work column can ever have while the rubric sits beside it, at any
viewport width there will ever be**. The repo's own rule applies: when the
measurement says the wide arrangement never has room, drop it rather than lower
a ratio into columns too narrow to read.

**The fix is one expression, not new CSS.** `class:has-rubric={!!rubric?.length
&& !documentWork}`. Without `has-rubric`, `.work-split` is already a flex COLUMN
and `:not(.has-rubric)` already carries the app frame's single-scroller rules --
a path measured before this existed. A modifier class would have been a second
arrangement to keep in step with the first.

After: frame **562px at 1440 and at 1920**, 311px at 375 (the full column at
each), rubric stacked below, 0px horizontal overflow at both widths.

### The photographs had nowhere to go, on either surface

`idea:state` carries an image URL down and the document CANNOT render it: the
URL is a portal proxy the sandbox CSP admits no host for, and the request would
arrive credential-free off an opaque origin. CLAUDE.md already says restored
images belong in parent chrome beside the frame -- and **neither surface had
any**, so a student's photograph appeared nowhere after a reload and nowhere in
the grading console.

**The strip went into `HtmlAssignmentFrame`, not into the grading page**, and
that is the parity rule rather than convenience: an instructor's view of
student-facing content is the student view plus affordances, through the SAME
render path. Built at the grading site it would have been a second view of a
student's evidence that the student cannot see. Built in the frame, the item
page and the grading console get it from one implementation because both mount
it.

A thumbnail that will not decode falls back to its row through the img's own
`onerror`. **The explanation is its own line, not an `{:else}` on the caption**
-- the first shape folded them together, so the only row that needed the
sentence (the one with a caption) was the one that did not get it.

### Measured in a real browser, not described

`/dev/html-assignment-grading` mounts the real `GradingConsole` with `spec =
null` -- the real schema-3 configuration -- and the real `HtmlAssignmentFrame`
pointed at the real `/hx/worksheet`. Three route specs, 60 measurements, **0
outside threshold** at 375 and 1440:

- frame present 1, `ready=yes`, `listening=yes`, fills >95% of its column,
  `.work-split.has-rubric` count 0 (the rubric is below, not beside)
- the photo strip: 1 strip, 1 thumb, `naturalWidth > 0`, 0 fallbacks, the
  caption verbatim
- `?state=empty`: frame still mounted, 0 strips, 0 thumbs
- `?state=broken`: 0 thumbs, 1 fallback, the filename and the field still
  readable, the sentence present
- contrast: filename 15.42:1, caption 7.27:1, field name 7.27:1, Photos heading
  7.63:1 (all against 4.5)
- 0 horizontal overflow at both widths, 0 console errors

**And the seeding was read from INSIDE the frame**, through playwright's own
frame API: Alice `teamName="Team Meridian"`, N to Bruno `teamName=""`, P back to
Alice `"Team Meridian"` -- so N and P move between students and the frame
genuinely reseeds. A student with no answers reports `state applied, 0 value(s),
readOnly=true` and renders the empty document, not a blank pane.

**The route specs deliberately do NOT read inside the frame, and that is the
sandbox working.** `iframe.contentDocument` is NULL from page-side JavaScript
(measured), because `allow-scripts` with no `allow-same-origin` puts the
document in an opaque origin. A spec that read the seeded value from out there
would be asserting the containment had failed. Playwright's frame API is a
browser protocol rather than page script, which is why the manual read above
could cross a boundary the spec cannot.

## TWO. The worksheet was losing keystrokes, live

**Measured before the fix:** `answers.ts` called `SaveState.attach()` **zero**
times and exposed no `attach` of its own, while every other save surface calls
it from an `$effect`. It also builds its machines LAZILY, one per block on first
write, so nothing outside could attach them either. Closing the tab inside the
800ms debounce lost the last keystroke burst on a ported worksheet and on no
other surface in the app. Ledger 0139 had written the finding into the item
page's own comment and left it; this is the fix.

**The lazy half is the whole difficulty.** A net wired once over whatever
machines existed at mount covers exactly the blocks nobody has typed in yet --
an `attach()` that exists, type-checks, reads correctly and protects nothing. So
`#attached` is read by `#machine`, which wires a new machine as it makes it, and
the test that matters types into a block for the FIRST time after `attach()` has
already run.

**It delegates to `SaveState.attach()` per machine rather than putting one pair
of listeners over `flush()`.** The second shape would be a second implementation
of the durability net -- a second idea of which events count and of what "still
owed" means -- sitting beside the one in `save-state.svelte.ts` and free to stop
agreeing with it.

**The navigation half is separate and the net does not cover it.**
`visibilitychange` and `pagehide` do not fire on a client-side navigation, so
clicking the next item in the class stream was just as lossy -- which is the
case `save-guard.svelte.ts`'s own header names as the reported defect that
produced it. `guardSaveNavigation` takes a `SaveState` and this surface has one
per block, so it takes `MapsEditor`'s shape: one `autosave: false` machine that
schedules nothing and exists only as the guard's handle, whose `save()` flushes
the real ones, with `alsoUnsaved` reporting `HxAnswers.dirty`. It is built
unconditionally and gated by `enabled`, because `beforeNavigate` is a
component-init call.

**A defect in this bundle's own first draft, caught before it shipped and pinned
so it cannot come back.** `SaveState.saveNow()` RETURNS EARLY on a machine that
is clean with nothing pending -- so the `autosave: false` guard handle, which
nothing ever marked dirty, would have had the guard cancel the navigation, flush
NOTHING, re-ask, find the work still outstanding and put a `window.confirm` in
front of the student. Both halves of what the guard exists to prevent, with
nothing on screen or in a type check to say so. `HxAnswers` gained an `ondirty`
callback, fired where a block's debounce is armed, and the item page passes
`() => htmlGuardState.markDirty()`. `dirty` could not serve instead: the
machines are not runes, so it is a question asked at a moment and nothing
downstream can observe it CHANGING. The test carries the broken handle as its
own negative control -- a clean one writes nothing and leaves `dirty` true; the
armed one writes the row and clears it.

`tests/dom/html-assignment-durability.test.ts` proves both directions, with the
defect itself asserted so that deleting `attach()` cannot look like a
refactor: with `attach()`, hiding the tab inside the debounce writes the row;
**without it, `saves` is length 0 and `dirty` is true**. Each case carries its
own negative control -- nothing written inside the debounce -- so a machine that
wrote on every keystroke could not pass. It uses the REAL 800ms debounce, not
the collapsed `wait` the sibling file uses, because a debounce that resolves
immediately would write before any event fired and every assertion would pass
with no net at all.

## THREE. Both validators accepted a document that cannot talk to classroom

**Measured before:** `validateHtmlManifest` accepted
`src/lib/legacy/assignments/_TEMPLATE.html` with **0 errors and 0 warnings, and
a parsed manifest**. Every check it runs reads the manifest and the markup; none
reads a line of the document's JavaScript. So a document with a perfect
manifest, perfect `[data-field]` correspondence and no bridge code at all
validated clean, and importing it would have produced a worksheet that takes
typing and stores nothing -- the one failure this whole feature exists to avoid.

**It is a refusal, not a warning,** because there is no partial outcome: a
parent that never receives `idea:ready` never posts `idea:state`, so the
document is never seeded and every answer it might report arrives before
anything is listening.

**It asks for the handshake and not for `idea:change`.** A read-only document --
a reference sheet ported into the same frame -- is a legitimate shape that sends
one and never the other, and refusing it would refuse a document that works.

**The scan is over `documentScripts`, with JS comments stripped, and that is
load-bearing.** A refusal a comment can satisfy is not a refusal, and the file
most likely to gain `// TODO: send idea:ready` is the very TEMPLATE this exists
to catch. Both halves are tested: the template with the token added in a comment
is still refused; with a real `postMessage` it passes.

`HX_READY_TYPE` is exported from `bridge.ts` and `HxFrameMessage` names it
through `typeof`, so the union the gate matches on and the string the validator
scans for cannot drift.

Measured after, all three real documents:

| document | TypeScript | python |
| --- | --- | --- |
| `tests/fixtures/hx-smoke-test.html` | 0 errors, 0 warnings | PASS |
| `_TEMPLATE.html` | refused: never sends `idea:ready` | FAIL, same sentence |
| `idea100-blade-01.ported.html` | 0 errors | FAIL (a real mint -- see FOUR) |

**A second defect in this bundle's own first draft.** The mirrored trap scan
warned "the frame has no reach into the parent document" on the smoke test AND
on the ported Blade fixture -- because every correct ported document reaches the
classroom through `window.parent.postMessage` and checks
`e.source !== window.parent`, which IS the bridge contract. A warning false on
every working document is not a warning, it is a thing authors learn to scroll
past, and it would have cost the four traps beside it that are real. The two
bridge idioms are taken out before the scan runs; a document reading
`window.parent.document` still warns, and both directions are pinned. After:
the smoke test and the Blade port warn about **nothing at all**, and the
template keeps its one true `localStorage` warning.

**The `localStorage` warning is one of five mirrored traps.** Python already
shipped `SANDBOX_TRAPS`; a one-entry TypeScript list against a five-entry python
one is exactly the drift the parity file exists to catch, so the whole list is
mirrored and the parity test compares them by name and order. **The two SCANS
are not identical and the test says so**: TypeScript reads `documentScripts`,
python reads the raw bytes. That is deliberate -- these are warnings, where a
mention in prose costs a sentence, and the python scan predates the split. The
REFUSAL is script-scoped on both sides.

**Mutation-proven.** Disabling the refusal reddens 2 of the 9 handshake tests;
the file was restored from a `cp` copy (never `git checkout --`) and md5-checked
identical, and re-verified green.

### The narrowing refused things already in the tree, which is the point

Three existing test fixture builders emitted documents with no bridge code at
all, so 21 tests across three files went red. Each was **modelling a worksheet
that could not have stored a single answer** -- so the fixtures gained the
handshake, which is them becoming what they always claimed to be rather than
appeasing a new check. Nothing stored in production is stranded: the gate runs
at import, Mr. Pina's live document passes, and a re-upload that would now be
refused is a document that stores nothing.

## FOUR. A python false positive, and the half the prompt did not have

**Measured:** `tools/validate-assignment-spec.py` refused the ported Blade
fixture with "document builds a data-field at runtime", and its regex does match
``querySelector(`[data-field="${f}"]`)`` -- a LOOKUP. The discriminator is the
character before the attribute: a minted attribute is written into markup and
follows the whitespace after a tag name; a CSS attribute selector follows `[`.
The leading `\s` added is exactly what `DATA_FIELD_RE` in the same file already
requires, so the two checks now agree about what an attribute looks like.

**But the fixture is still refused, and correctly.** It carries BOTH shapes: two
`querySelector` lookups and **four genuine mints** (`data-field="mfg-${n}-p"`),
literally the `addMfgRow` case the check's own comment names. Fixing the regex
removes the lookups from the match set and does not change that file's verdict.
`tests/html-assignment-python-mint.test.ts` pins this explicitly so nobody reads
the fix as having made it pass, and drives the REAL tool over real temporary
documents rather than re-testing the regex in TypeScript, which would be a
second copy of the thing under test.

One instrument note worth keeping: the tool **exits non-zero on a refusal**, so
`execFileSync` throws on exactly the runs the test cares about. The first shape
of the helper produced four failures that all read as the tool being broken.

## The unpublished-item sentence

`/hx/<docId>` refuses a document whose item is unpublished or scheduled with a
bodyless 404, by design, and that gate is not loosened. Only a MANAGER can open
a non-live item, so the only reader who ever meets that 404 is the teacher, and
what they got was an empty box. `HTML_ASSIGNMENT_NOT_LIVE` renders where the
frame would be, on the grade page and on `ItemDetail`'s schema-3 branch alike,
keyed on `htmlAssignmentServed` -- `published && !isScheduled(...)`, the same
condition `$lib/server/html-assignment-document.ts` uses, imported rather than
re-spelled.

## What was NOT verified

- **Nothing was run against the live Supabase project.** The local `.env` is the
  placeholder project; no migration was applied, no RPC called, no session
  signed in. Every production claim in this entry is Mr. Pina's report at
  `89b8154` or a reading of committed source.
- **No signed-in surface was driven.** The browser measurements are `/dev`
  routes; the real `/classroom/.../grade` page needs a Bosco Tech Google
  session. The grade page's own load function was not executed -- its wiring is
  asserted as source, and the ladder it delegates to is driven directly.
- **The real `/hx/` route serving a DATABASE-backed document was not exercised.**
  The harness frames the `worksheet` fixture; which bytes arrive is the one
  thing it does not stand in for.
- **`prefers-reduced-motion` is `no-preference` in the harness**, and web fonts
  are blocked, so text was measured in the fallback stack.
- **`_TEMPLATE.html` is now refused and was deliberately left broken.** It is
  ledger 0137's file.

## A CLAUDE.md figure corrected in place

A checkout with no `.env` reports **14** phantom `$env/static/public` errors
across **11** files, not the 13 across 10 recorded there. The eleventh file is
`src/lib/server/html-assignment-document.ts`, which 0195 added after the figure
was last measured -- the number grows with the tree, which is why it keeps going
stale. **No warning moved**: the breakdown is 31 `state_referenced_locally`, 5
`css_unused_selector`, 1 `perf_avoid_nested_class`, and the baseline with `.env`
exported is 0 errors / 37 warnings, unchanged.
