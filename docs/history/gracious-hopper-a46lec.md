---
title: "The IdeaCAD history timeline: a scrollable log in a student's own words, a scrub that agrees both ways, and the retirement of the in-memory undo stack"
date: 2026-09-13
branches: [claude/gracious-hopper-a46lec]
migrations: []
subsystems: ["IDEACAD", "Classroom"]
---

Mr. Pina, 2026-09-12, in his own words: a history you can SCROLL THROUGH, like
SolidWorks or Fusion 360, at MAXIMUM RESOLUTION, ALL THE WAY BACK TO THE
CREATION OF THE PART.

0209 built the durable half and said, in its own closing section, that
`ui/undo.ts`'s in-memory stack was untouched and still live. What that meant in
practice is worth stating plainly: **the action log was written and read by
nothing.** Every accepted edit appended rows to `ideacad_history`, and a
student's Ctrl+Z still hit fifty trees in memory that the next reload threw
away. This bundle is the surface over that log, the wire that makes the RPCs
reachable at all, and the retirement of the stack.

## What was removed

**`src/lib/ideacad/ui/undo.ts` is deleted.** It held two things and they went to
different places:

- **`UndoStack` and `UNDO_DEPTH` are gone entirely.** Fifty accepted trees in
  memory, a depth cap, and a redo future cleared by each new edit. Nothing
  replaces the class; undo and redo are transports over the log now.
- **`undoKeyFor` moved verbatim into `src/lib/ideacad/ui/timeline.ts`.** What
  the KEYS mean did not change and re-deciding it would have been a second
  answer to a settled question. Ctrl+Z undo, Ctrl+Y and Ctrl+Shift+Z redo,
  `defaultPrevented` still the caller's discriminator against the viewport's own
  bindings.

**`undo.ts`'s one load-bearing decision survives intact, in a different place.**
What went on the stack was the ACCEPTED tree and never the draft, because a
stack fed by a slider preview needs forty Ctrl+Z presses to undo one decision.
That grain is now `store.edit` diffing the accepted tree against the last one
the log accounts for, so a row is still one decision. Retiring the stack cost no
resolution.

**Two of its rules deliberately did NOT carry across**, and both are written
into the test file that used to assert them rather than deleted quietly: there
is no depth cap (he asked for all the way back to the creation of the part), and
a new edit does not clear a redo branch (nothing is thrown away, so there is
nothing to clear). A future session restoring either would be undoing 0189's
central decision.

## The wire that did not exist

`createIdeacadStore` takes its history transports as an option, and the real
item page was calling it with none. There was also no factory to pass:
`transports.ts` had no counterpart to `createIdeacadSharingTransports`. So
`ideacad_apply_actions` and `ideacad_concept_history` were applied to production
with no caller in `src/` at all. `createIdeacadHistoryTransports` and one line
at the store call are what close that.

**The factory throws an error CARRYING the PostgREST code**, which is the only
part of it worth a comment: a bare `new Error(message)` discards the `PGRST202`
the store's ladder keys on.

## The ladder, which is the rung that keeps a pre-0209 editor on screen

0209 is applied by hand, so a tree between 0208 and it is a real state -- and
`loadHistory` is the FIRST thing that runs after a document opens. Without a
rung, `open()` would have rejected outright and the whole blade editor would
have been replaced by a refusal sentence on such a deployment.

So the store's history region turns itself off on `PGRST202` **alone**, publishes
`historyReady: false`, and every write goes back through `ideacad_save_concept`
exactly as 0208 did. It is the narrowest possible probe because it is a call the
feature makes anyway -- no round trip is spent asking, unlike 0205's sharing
probe. The other direction is the one that fails silently and has its own test:
a caller who may not read a part raises from inside a function that DOES exist,
and reading that as "not deployed" would turn a refusal into a silently missing
feature.

## A row says what changed, not where

A stored action carries a JSON Pointer, because that is what replays.
`/features/1/acrossFlats` is not what a fifteen-year-old reads, and a timeline
printing it would be a debugging view wearing a student's clothes.

**Every row is named against the tree the action applied to**, not against the
document as it stands. `/features/1` is only "Hex Extension" if you know what sat
at index 1 at that moment; a pointer-to-name table would let a feature reordered
later rewrite what every earlier row claims to be about. `buildTimeline` walks
forward from the origin carrying the tree and names each row before applying it.
One pass, and the names are true at the moment they describe.

**The names come from the controls.** `featureLabel` and `fieldLabel` are
`feature-model.ts`'s own -- the same strings the PropertyManager draws -- so a
student reads "Across flats" in the timeline because that is the word on the
control they turned. `fieldLabel` did not exist before this bundle: its nine
names were literals inside `panelFor`, and a second copy in the timeline module
is exactly the drift this would have caused. The four names
`feature-model.ts` genuinely has no counterpart for (spin direction and the
three materials keys, all drawn by `BladeEditor`'s own 0208 materials panel)
are stated once in `timeline.ts` and there is nothing there to drift from.

**It never throws.** `history.ts` refuses a log it cannot replay LOUDLY and is
right to -- a replay that invented a missing container would produce a document
that never existed -- but a refusal inside a LABEL is a blank editor over a
sentence. A row this client cannot walk is marked `broken`, the walk stops
advancing, and the rest of the history renders.

## There is no cursor, and the UI must never imply one

0189 chose append-an-inverse over move-a-pointer: a cursor discards history,
which is what "as far back as possible" refuses, and it is one mutable cell two
editors of a 0205-shared document fight over. Four presses over two edits leave
SIX rows.

All six render. Nothing is greyed out as "ahead of" a position and nothing is
ever removed. A row carries its own STATE -- applied or undone, read from the
depth parity `foldHistory` computes rather than re-decided here -- plus the verb
for its place in an inverse chain. The one "you are here" mark is the newest
live row, which is the answer to "what does Ctrl+Z do next": a fact about the
fold, not a position anybody scrolls. `TIMELINE_WORDS.note` says the rule in
words on screen, because a student who knows other CAD expects an undone step to
vanish and would otherwise read the list as broken.

**Depth 3 is the case 0189 got wrong first** and the timeline reads the parity
through `foldHistory` rather than re-deciding it. The pure suite walks
undo/redo/undo press by press and asserts the redo target is the depth-3 row,
because an end-state assertion passes on a fold that was wrong in the middle and
happened to come back. Mutation-proved: reverting `foldHistory` to the shallow
rule reddens it.

## Where it lives, and why not anywhere else

**A fourth mode of the tree pane.** `.ideacad` is a three-row grid whose header
already carries a comment saying a fourth child would take an implicit row and
steal height from the viewport. That pane meanwhile already has three modes --
FeatureManager, PropertyManager, and 0208's Materials panel all replace each
other in it -- so this is the established arrangement rather than a new one, it
inherits the pane's measured 300px, and it is where SolidWorks puts a history.
**The rules rail was not an option**: ledger 0178 left it at 502px in a 515px
box with 13px spare.

## The scrub is a look and never a write

Committing to a past state is Undo pressed until it is reached, which is what
keeps the log append-only. A click that silently rewrote the document would be
the cursor 0189 refused, wearing a list's clothes. The panel says so in words
where the student is looking, and the readouts follow the step being looked at
-- a scrub that moved the model and left the mass and the rules quoting the
current part would be the worst of both.

**The past tree is computed from rows the component already holds**, with no
transport, which is what lets a VIEWER scrub a part they cannot write. `dirty`
deliberately does not follow it, so the confirm pair never arms against a diff
nobody made.

## The scrub agrees both ways

0189 proved `stateAt` against `unwindTo` at every point of a 360-action corpus.
This bundle's prompt asked that the SCRUB be held to the same standard, which
means proving it over **the seq the timeline hands a caller** rather than over an
index into a row array. They are the same number in a log this client allocated
and different numbers in a paged read, a shared document, or a concept whose log
this client did not write -- and an off-by-one between them is a scrub showing
the wrong step with nothing on screen to say so.

Measured over the real corpus: **221 comparisons at every seq the timeline
offers**, forward replay against backward inversion, plus a sparse-seq log where
index and seq deliberately disagree. Mutation-proved: rewriting `stateAt`'s
limit test to use `all.indexOf(row)` reddens it.

## What a rasterized screenshot found that every check had passed

This is the part worth keeping. The browser pass reported **60 measurements, 0
outside threshold** at 375 and 1440. Then the surface was rasterized and looked
at, and there were three real defects on screen:

1. **`aluminum-0125` and `steel-0125` were printed as values.** The check
   forbade JSON POINTERS and had nothing whatever to say about a stored id in a
   VALUE -- which is the same defect one column over, and the exact thing the
   feature exists to prevent. Fixed with a caller-supplied namer reading the
   resolved material library (`bladeConfigWithMaterials`), which is what the
   pickers read; it cannot be a table in `timeline.ts`, because since 0208 a
   material is a row an admin adds in a form with no deploy and a student's own
   custom materials are in that config too.
2. **The list hung below the pane.** It carried its own `max-height: min(46vh,
   420px)`, which cannot know how tall the pane is, so three rows sat under the
   pane's bottom edge inside a second nested scroll region -- **ledger 0171's
   defect reproduced exactly**. And the check PASSED it, because it measured
   each row against the LIST box after scrolling the list, which every row is
   trivially inside. Fixed with `height: 100%` on the panel and `flex: 1;
   min-height: 0` on the list; the check now measures against the PANE and
   asserts the list is inside it. Measured after: list bottom 582 against pane
   bottom 598, `paneScrolls: false`, last row fully inside after scrolling.
3. **UNDO and REDO were flush against their own left border.** `.tap-44` is
   `inline-flex` with no `justify-content`, so a label inside one sits at
   flex-start unless the control says otherwise.

**The lesson is the one this repo already writes down and this is a fresh
instance of it: a green check is a claim about the question it asked.** Two of
these three were invisible to a passing content sweep and one was a check
measuring the wrong box. All three checks were strengthened in the same edit, so
each now bites on the defect that got past it.

## The live controls that were proving nothing

`--break overflow` and `--break invisible` both came back GREEN on this route.
Neither preset's selector list names `.ideacad`, which is the console's root, so
neither was INJECTING its defect -- on this route or on the five existing
`/dev/ideacad*` specs, since the day they were written. `run.mjs`'s own comment
already names this failure mode. With `.ideacad` added: overflow 4 findings,
invisible 20. `tiny-taps` 8 and `low-contrast` 20 bit before and after.

## Two things the FULL suite found that every scoped run had passed

Both are worth writing down, because both are the same shape: a file the change
touched indirectly, which no targeted run was ever going to name.

**`ideacadEditorSeed` threw on a snapshot with no history region.** The type says
`history` is always there and a store built by `createIdeacadStore` always has
it -- but the seed takes a SNAPSHOT, and `tests/dom/ideacad-mount.test.ts`
hand-rolls a partial one, as any older surface or future shape might. Spreading
`undefined` throws, and a throw there does not cost the timeline: it returns a
null seed, and the student gets a refusal sentence where their blade was. Fixed
in `mount.ts` with `?? []`, which is the correct degraded answer rather than
padding -- `buildTimeline` returns an empty timeline for an empty log and the
History control is simply absent.

**The browser-verify README's generated counts went stale the moment a spec was
added.** `tests/derived-numbers.test.ts` reddened on seven assertions, which is
the tripwire working: the region claimed no measurement was outside its
threshold while holding no measurement for the new spec at all, and the tool's
own note names the fix. `npm run verify:readme -- --static` rewrote the static
half and `-- --route 'state=history'` measured the new spec into the per-spec
store in **13.5 seconds**. The store now holds **209 specs, 418 runs, 7534
measurements, 0 outside threshold**. The `--route` filter matches on a spec's
PATH or LABEL, not on its filename, which the tool's own error message does not
say -- worth knowing before assuming a new spec is unregistered.

## What was measured

- **Full suite: 452 files / 8622 tests green**, against a branch-time baseline of
  **450 files / 8586 tests** measured on `origin/integration` at `f4616dca`
  before any change. Two new test files, and a net +36 tests: this bundle adds
  46 and the retired `UndoStack` took its 6 with it, with the rest accounted for
  by the rewritten `ideacad-ui-mount` block.
- **`svelte-check`: 0 errors, 37 warnings in 20 files**, 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`. Re-derived on `origin/integration` at branch time
  after exporting placeholder `$env/static/public` values and syncing, and
  unchanged after the bundle. One new `state_referenced_locally` appeared
  briefly and was removed rather than accepted, by moving the client read beside
  the two the file already ignores for the same reason.
- **Browser pass: 568 measurements across all 12 `/dev/ideacad*` route/width
  runs, 0 outside threshold.** The timeline's own route is 60 of those.
  `--selftest`: 70 controls, 36 negative and 34 positive, 0 instrument failures.
- **Mutation proof, 19 mutants, all PERMISSIVE, 18 killed.** Read off the "Tests
  N failed | M passed" line and never off vitest's exit code -- ledger 0199's
  runner judged by exit status and reported two survivors as killed. Every
  restore was from an in-memory copy and md5-checked, never `git checkout --`.
  The one survivor is the `scrollbar-gutter` rule, which is CORRECT: happy-dom
  has no layout engine, so a CSS claim in `tests/dom/` passes vacuously. It is
  asserted in the browser pass instead.
  Two mutants SURVIVED on the first round and both were real test gaps, closed
  before the second: the panel's own close button dropping the scrub (only the
  header toggle was being pressed), and the read-only predicate (the markup gate
  was being asserted and the handler was not -- two layers, and a proof that
  opens one and stays green has proved nothing about the other).

## What was NOT verified

- **Nothing was applied anywhere and this container cannot reach production.**
  There is no migration in this bundle. Every claim about 0209's RPCs is against
  their shapes as committed in `supabase/migrations/0209_ideacad_history.sql`
  and against the in-memory transports the tests supply.
- **No signed-in surface was driven.** The browser pass covers `/dev` routes
  only; the real item page's wire (`createIdeacadHistoryTransports` into
  `createIdeacadStore`, and `ideacadWrites.undo/redo` gated on `historyReady`)
  is asserted by type checking and by reading, not by a session.
- **Two editors on one shared document were not driven through the timeline.**
  `store.undo` re-reads the log before inverting for exactly that case and
  `tests/db/ideacad-history-shared.test.ts` covers the database side, but no
  browser pass put two clients on one part.
- **Web fonts do not load under the harness** (the proxy blocks
  `fonts.googleapis.com`), so every contrast and tap-target figure is measured in
  the fallback stack, and `prefers-reduced-motion` is `no-preference`, so that
  path is not exercised.

## What was deferred

- **A paged timeline.** `readWholeHistory` pages until the newest row is in hand
  and the whole log is held in memory. At 0209's measured 220.5 bytes an action
  that is fine for a term of work and is not fine forever; the read RPC already
  pages, so the surface is where the work would go.
- **A jump-to-step control.** The list scrolls; there is no "go to the oldest"
  or filter-by-feature. At eight steps that is right. At four hundred it is a
  decision, not an omission, and it belongs with whoever first has a part that
  long.
- **`refreshHistory` has no caller on the real page.** A second editor's rows
  arrive when `store.undo` re-reads or when the write path detects a gap, not on
  a poll. That is 0201's shared-open lane's question rather than this one's.

## What `CLAUDE.md` will want, when a bundle that owns it lands

Not written here: `CLAUDE.md` is not in this bundle's ownership and is the
repo's highest-collision file. 0189 left the same note for the same reason and
its paragraph is still unpasted. The paragraph this bundle wants, to go under
the IDEACAD section beside 0189's:

> **THE HISTORY TIMELINE IS A LIST WITH NO CURSOR IN IT, AND `ui/undo.ts` IS
> RETIRED (0196).** `ui/timeline.ts` is the arithmetic and
> `ui/HistoryTimeline.svelte` the surface, mounted as a FOURTH MODE OF THE TREE
> PANE beside the FeatureManager, the PropertyManager and 0208's Materials
> panel -- not a fourth grid row (it would steal viewport height) and not the
> rules rail (0178 left it with 13px spare). **A ROW SAYS WHAT CHANGED, NOT
> WHERE**: every row is named against THE TREE THE ACTION APPLIED TO, because
> `/features/1` means whatever sat at index 1 at that moment and a
> pointer-to-name table lets a later reorder rewrite what every earlier row
> claims to be about. The words come from the controls -- `featureLabel` and
> `fieldLabel` in `feature-model.ts`, which is why `FIELD_LABELS` exists at all
> -- and a stored id is resolved by a caller-supplied namer reading
> `bladeConfigWithMaterials`, never a table in the timeline module, because
> since 0208 a material is a row an admin adds in a form. **NOTHING IS EVER
> GREYED OUT AS "AHEAD OF" ANYTHING**: four presses over two edits leave six
> rows and all six render, marked applied or undone by the depth parity
> `foldHistory` computes. **THE SCRUB IS A READ**: `stateAt` over rows the
> component already holds, no transport (so a viewer can scrub), and `dirty`
> does not follow it. **UNDO AND REDO ARE TRANSPORTS AND ABSENCE REMOVES THEM**
> -- no `undoStep` is a read-only surface or a deployment without 0209, and the
> store's history region turns ITSELF off on `PGRST202` alone so a pre-0209
> deployment keeps its editor and saves through `ideacad_save_concept`. The
> timeline still renders for a viewer, because reading a history is not writing
> to one. **`ui/undo.ts`'s one load-bearing rule survives the retirement**: the
> grain is the ACCEPTED edit and never the draft, now enforced by `store.edit`
> diffing accepted trees. Its depth cap and its cleared redo branch did NOT
> carry across, deliberately.
