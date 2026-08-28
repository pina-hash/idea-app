---
title: "Save draft is a checkpoint, and the light plate is measured on six grounds"
date: 2026-08-22
branches: []
migrations: []
subsystems: ["Digital notebook"]
record_order: 116
---

## Save draft is a checkpoint, and the light plate is measured on six grounds

Two independent passes, kept separately reviewable. Part A is a behaviour defect
a0d43ba introduced in the notebook composer. Part B closes the colour findings
the previous bundle raised and deliberately deferred (see "Fixed in passing, and
said out loud" immediately above): all of them, plus what the sweep added.

### Part A -- a Save draft ended the composer session

**The defect.** `continueSaved()` ended with an unconditional `resetForm()`,
which nulls `savedDraftId`. So a Save draft on a session that already had a
draft -- which, once autosave exists, is EVERY Save draft, because the click
flushes the pending autosave first and the autosave has already created the
entry -- ended the session. The next word typed created a second entry, and one
piece of work ended up split across two.

Reproduced on `/dev/notebook` before changing anything: type "Alpha", wait for
the autosave (entry `new-1`, revision 1, replaceable), press Save draft (seals
revision 1, clears the box), type "Beta" -> **entry `new-2`**, a second row with
one revision. Two entries where there should have been one.

**Why it is a defect rather than a choice.** a0d43ba's own fresh-create branch
(`createFromNote`) does the opposite -- it calls `rememberDraft` and keeps the
handle -- so the two paths disagreed about what a Save draft means. And 0129,
one bundle later, made an explicit save a revision BOUNDARY: a thing you write
past, not a thing you stop at. The reset was the last place still treating it as
a finish.

**The fix.** A new `checkpoint()` beside `resetForm()`, and the two now say the
two different things. `continueSaved` branches on `submitted`: a turn-in resets,
a draft save checkpoints. `createFromNote` and `createFromPhoto` were brought
onto the same helper, so all three draft paths behave identically.

**The writing stays in the box, and that is the same rule from the other end.**
This was the adjacent half, and it is why the fix is not a one-line branch. Once
the handle survives, the chain is EDITED from here on -- so clearing the box (as
a0d43ba's fresh-create branch did) means the next paragraph REPLACES the saved
one as the entry's current note rather than following it, and the first
paragraph survives only as a revision nobody is looking at. Keeping the text is
safe because `persistNote`/`rememberDraft` have already advanced
`autosaveBaseline` to exactly that document: the box reads clean and nothing is
resent until something changes. `save.markSaved(Date.now())`, not `save.reset()`
-- the machine is reporting a write that just landed, and `clean` would throw
away the acknowledgement and its clock time.

**Which forced the button to ask a different question.** With the box kept,
`canSaveDraft = draftsReady && canSubmit` would have stayed lit forever on a
form holding nothing but words already saved -- the presence-of-state dirty
signal `ContentComposer` was already caught doing. It is now `saveDraftDue`:
for a fresh session, anything in the form; for a session holding a draft, what
the server has not acknowledged (`noteUnsaved || labelDue || staged.length`)
plus `headUnsealed`. `runSave` reads the SAME derived predicate rather than
spelling it a second time.

`headUnsealed` is the case that is not a diff, and dropping it would have
regressed 0129: when the autosave has already written exactly these words,
nothing is owed but the click still owes a BOUNDARY, and a button disabled on
"no diff" would never stamp it. It is written in two places (`persistNote`,
which knows how it sent the write, and the autosave's own create), and cleared
by a successful `sealNotes` and by `resetForm`.

#### Verified by driving `/dev/notebook`

Every case below is a read of the harness's entry rows, not of the feed's
markup: `__notebookEntries` and `__notebookReplaceable` were added to the
harness as read-only getters for that, the way `__notebookReceived` already
exists one level up. "One entry with two revisions" is a claim about rows, and
reading it off the rendered feed measures the renderer.

- **Type, Save draft, type again** -> ONE entry (`new-3`), ONE chain, **two
  revisions**: r1 "Alpha paragraph one." (sealed) and r2 holding BOTH
  paragraphs. Before the fix, the same drive produced two entries.
- **Save draft twice with nothing between** -> no new revision, no new entry.
  The button is `disabled` after the first, so the second click is swallowed by
  the DOM. To prove the ENFORCING half rather than only the visible one, the
  `disabled` attribute was stripped and the click forced through -- a state the
  UI cannot reach, said out loud -- and it produced **zero** log lines: no RPC
  at all, revisions still 2, entries still 1. `runSave`'s guard refused it
  independently.
- **Turn in** -> the entry is submitted, the box clears, both buttons disable.
  Typing afterwards creates `new-4`, a fresh draft, leaving the turned-in entry
  untouched. The session does end.
- **A photo staged at the moment of the Save draft** -> ONE entry. The photo
  uploaded onto it (`add-photo entry_id="new-1"`), the note sealed, the stage
  cleared, the text kept. Typing afterwards added revision 2 to the same chain
  on the same entry, which still carries its photo.

### Part B -- the light plate, one measured pass

**The sweep.** Every candidate is an element with its own non-whitespace text,
visible, inside `.nb-root`. The foreground is painted over its composited ground
on a canvas and read back; the ground is composited by walking ancestors until
one is OPAQUE, and an element whose ground never reaches alpha 255 is reported
as unmeasurable rather than measured against a guess (0 of them, at both
widths). Nothing is parsed out of a declared hex -- these resolve to
`color-mix()` and `color(srgb ...)`, which a regex over computed styles skips
silently.

Four corrections the sweep needed before its numbers were worth anything, three
of them found by its own denominator rather than by inspection:

- **A positive control was planted first**: a span at 1.07:1 and one at 21.00:1,
  both on the live plate. The sweep caught the first and passed the second.
  Without that, "no hits" cannot be told from "found nothing at all".
- **`__report` returned `fails: []` beside `distinctFailures: 18`** --
  `[].slice.call()` on a Map iterator. A zero with no denominator beside it
  would have been read as a clean result; the denominator is what caught it.
- **Own-opacity was being ignored**, so `.sep` (opacity 0.6) was reported at its
  parent's 3.20 rather than its real 1.90. Every ratio below is opacity-aware.
- **`.sr-only` was being counted as a candidate.** A 1px clipped span is not on
  screen; excluding it by its clip is what keeps the denominator honest.

**Denominators, and the diff.** The same driver visits the same states in the
same order for baseline and re-run, so the two are comparable:

| | states | candidate visits | distinct candidates | failures |
|---|---|---|---|---|
| light 1440 before | 24 | 2857 | 115 | **23** |
| light 1440 after | 24 | 2857 | 115 | **2** |
| light 375 before | 25 | 4959 | 109 | **18** |
| light 375 after | 25 | 4959 | 109 | **2** |

21 fixed at 1440, 16 at 375, **0 regressions at either width**.

**The families, which are not the ones the brief named.** The brief described
six near-misses as "all `--nb-accent-ink` on `--nb-accent-wash`". Measured, they
are three separate things, and two of the named cases (`row-draft`,
`entry-draft-chip`) are `--nb-warn`, not the accent ink at all. Saying so
because the grouping changes the fix.

*F1 -- `--nb-accent-ink`, 15 distinct candidates.* The plate has **six** grounds,
not three: the three surfaces and the wash laid over each. It had been measured
against the bare three. Bare: 4.89 / 4.68 / 4.32. Washed: 4.45 / 4.25 / 3.95.
Three of six under the bar. `#8a6d24` -> `#7e6320`, which is `hsl(43 59% 31%)`
-- its own hue (42.9deg) and saturation (58.6%), lightness only, from 34.1%.
After: 5.69 / 5.44 / 5.02 bare, 5.17 / 4.94 / 4.59 washed. Worst 4.59.

*The rejected alternative, measured rather than asserted.* Thinning the wash
instead loses on three counts, any one of which is fatal: to carry the current
ink to 4.5 on wash-over-page the alpha has to drop to **5%**, where the fill
measures **1.04:1** against its own card and the selected row stops being marked
at all; it never reaches 4.5 on wash-over-recessed at ANY alpha down to 4% (best
4.20), because thinning only asymptotes to the bare recessed plate, which was
itself failing at 4.32; and it does nothing whatever for the six candidates
sitting on a bare recessed plate with no wash under them.

**What deepening cost:** the brass thread reads a little more present on paper,
4.89 -> 5.69 on the card. It is the same brass -- nothing desaturated, nothing
re-hued. `--nb-folder-gold` and `--nb-meta-accent` alias it and move with it;
gold as a folder colour goes 4.68 -> 5.44 on the page, still inside that set's
own ">= 4.5 and clearly apart from the other five" rule.

*F2 -- the status inks*, moved by the one dial this plate already turns (how
much of the dark end each `color-mix` carries; the semantic token it starts from
is the identity and does not move). `--nb-warn` 78% -> 62% (worst 3.50 -> 4.64;
it was failing four of six, from 4.33 down). `--nb-ok` 72% -> 62% (worst 3.95 ->
4.64; it was failing the recessed plate at 4.33 -- **found by the token probe,
not by a visited state**, and fixed because 4.33 on a real plate ground is under
the bar wherever it lands). `--nb-error` 76% -> 72% (worst 4.28 -> 4.57).

*F3 -- the meta separator dots*, and this one is not a light-plate problem.
`.dot` in `EntryNotes` and `NotebookEntryCard` was `--nb-hairline-strong`: a RULE
WEIGHT, authored to sit below every text threshold because a hairline is drawn
beside content, never as content. Painted as a middot it measured **1.48** light,
**1.58** default, **1.63** IDEA -- invisible on all three. Repointed at
`--nb-boundary`, the room's load-bearing separator token, which is per-plate
already, so one rule fixes three. All three plates, surface / page / recessed:

| plate | before | after |
|---|---|---|
| light | 1.48 / 1.42 / 1.31 | **3.72 / 3.56 / 3.28** |
| default | 1.58 / 1.54 / 1.63 | **4.23 / 4.44 / 3.98** |
| IDEA | 1.63 / 1.74 / 1.82 | **3.25 / 3.48 / 3.63** |

*F4 -- `VersionBadge`*, the case CLAUDE.md already documents for `ItemBody` and
`SaveIndicator`: a shared component in a scoped room, reading `--dim` (tuned for
a dark plate) off the notebook's paper at **3.20:1**. Followed that precedent
rather than inventing a second answer -- a `--stamp-ink` hook declared on
`.nb-root`, portal token as the fallback, so the shell renders byte-identically.
Light 3.20 -> **5.06**. The two dark plates move too (default 5.87 -> 5.16, IDEA
5.60 -> 5.42) and that is the hook working rather than a side effect: they had
been reading the portal's ink on the notebook's page. Both clear either way.

This one is worth naming separately because nobody carried it into the room:
unlike `ItemBody` and `SaveIndicator`, which arrived with a feature and were
measured on the way in, the stamp had been sitting in every notebook header all
along, reading a token off a plate it has never been on. That is what a hook
audit finds and a change review never does.

Its `.sep` is the same defect as F3 one component over: a separator painted
below the threshold at which it separates anything. At 0.6 opacity it measured
2.38-2.76 across the three portal grounds and the three notebook plates; 0.8 is
the lowest step clearing 3:1 on all six (worst **3.23**, on `--bg2`) while
staying well under the stamp's own 4.24-5.42.

**The two that still fail the sweep, deliberately.** `.sep` at 3.38 and `.dot` at
3.72 (light; 3.65/4.23 default, 3.88/3.25 IDEA). Both are non-text separator
glyphs, and the sweep applies a flat 4.5 to everything. The bar a boundary
carries is 3:1 and both clear it with margin. Reported with the numbers rather
than exempted quietly, and the sweep was deliberately NOT taught to skip them --
a sweep that knows which failures not to mention is a sweep nobody can audit.

### Verified

- `svelte-check`: **0 errors, 37 warnings** -- re-derived after
  `npx svelte-kit sync`, unchanged by either part.
- Full suite: **88 files, 2135 tests, all passing.**
- Part A driven end to end on `/dev/notebook`, all four cases above.
- Part B: light plate at **1440** and **375**, both dark plates at **1440**,
  every ratio a canvas pixel read over a ground asserted opaque.
- The dark-plate before/after is a real **stash diff**, not an assumption: both
  plates show 2 failures before and 2 after (the same two candidates), both
  substantially improved, 115 distinct candidates either way.

### NOT verified

- **No screenshot.** The Browser pane does not composite.
- **No live Supabase and no signed-in session.** Part A was driven entirely
  against the dev harness's in-memory transports, which mirror the 0129 RPCs
  (including `replaceable` and `notebook_seal_notes`) but are not them. No
  migration was applied and no RPC was called for real. **This bundle ships no
  SQL.**
- **`npm run build` was not run** (the pre-existing Windows EPERM in the Vercel
  adapter's `closeBundle`).
- **No real phone.** 375px is an emulated viewport.
- **The classroom was not swept.** `--stamp-ink` and the `.sep` opacity are
  shared-component changes, and the `.sep` figure covers the portal's three
  grounds by probe, but no full classroom sweep was run to confirm nothing else
  moved there.
- **`--nb-ok`'s failing case was never produced on screen** -- it came from the
  token probe against the plate's own grounds, not from a state the driver
  reached.

### Two traps this cost a detour to find

- **A `git stash` does not reliably reach the served bundle.** The first stashed
  baseline measured the CHANGED stylesheet: Vite's watcher had not invalidated
  the module and the reload served the edited one. Silent -- a plausible
  baseline comes back and the diff simply understates itself. Caught by reading
  `--stamp-ink` and finding it still set. Fixed by `touch`ing the files and
  re-reading the token before trusting the sweep.
- **A scripted read must be anchored at a unique node.**
  `document.querySelector('.sep')` returned an unrelated component's separator:
  Svelte scopes the STYLE, not the class, and four `.sep` elements were in that
  tree. It reported opacity 1 for an element that was 0.8, which reads exactly
  like a correct measurement.

---

