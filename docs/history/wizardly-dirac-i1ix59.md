---
title: "IdeaCAD is wired to its store, and the prediction gate is gone by decision"
date: 2026-09-12
branches: ["claude/wizardly-dirac-i1ix59"]
migrations: []
subsystems: ["classroom", "ideacad"]
---

Two halves with nothing in common but a file. The first is the wire nobody owned;
the second is a decision of Mr. Pina's that reverses work from two bundles.

## THE BRANCH CARRIES LEDGER 0171, AND THAT IS THE FIRST THING TO KNOW

`origin/claude/pensive-turing-inj1ih` (ledger 0171: the FeatureManager, the
PropertyManager, concept cards and undo) was **green and STANDING** when this
branch was cut -- `Status: pushed`, CI success on `cdfd026d` at 15:16Z, and not
yet swept into `origin/integration`. Its file surface -- `BladeEditor.svelte`,
`src/lib/ideacad/ui/**`, the IdeaCAD browser specs -- is this bundle's own
surface, 899 changed lines in the one component this prompt owns.

Editing `integration`'s pre-0171 editor would have put every change here on a
file about to be replaced wholesale, and the merge that followed would have been
an 899-line conflict in a component nobody was left to reconcile. So the branch
is `origin/integration` with `origin/claude/pensive-turing-inj1ih` merged into
it, and the work sits on top. **The merge was clean, automatically, with no
conflict in any file.** A reader of this branch's diff against `integration`
therefore sees 0171's bundle as well as this one; `6b67f4c9` is the boundary.

## PART ONE -- the editor wrote nowhere, and had never written anywhere

`src/routes/classroom/[sectionId]/item/[itemId]/+page.svelte` line 43 called
`createIdeacadTransports(data.supabase)` and **passed the result nowhere**. The
only route to `BladeEditor` is `ItemDetail.svelte`, which ledger 0171 did not
own, so everything ledgers 0167, 0170 and 0171 built mounted in a real classroom
assignment and persisted nothing. A student could model a blade for an hour, with
a "Saved" indicator on screen the whole time, and lose all of it on reload.

**Nothing could see it.** `svelte-check` was clean, the component's own tests all
mount it with props of their own, and the store's tests exercise the store. The
join was the only thing in question and it was the one thing nothing looked at.
`tests/dom/ideacad-mount.test.ts` is that missing test and is why it is a new
file rather than an addition to either existing one.

### What was built

- **One store per page, opened per item.** `createIdeacadStore(ideacadTransports)`
  in the route, `open(itemId)` from an effect whose call is `untrack`ed and whose
  tracked input is a `$derived` item id, `destroy()` in `onDestroy` (which flushes
  what the debounce still holds -- the one moment a tab closing mid-edit is
  recoverable).
- **`ideacadEditorSeed` in `mount.ts` is the projection**, and ledger 0171's
  "one field rename at the mount site" is FOUR renames, not one: `committed_at`
  (a timestamp) to `committed` (a boolean), `predicted_concept_id` to
  `conceptId`, `made_at` to `at`, and the document's `active_concept_id` out of
  the row into its own seed. Written inline at a mount, each is a rename that can
  be got wrong somewhere else later; written as a pure function it is testable
  with no DOM.
- **`IdeacadEditorWrites` is the boundary**, a projection of `IdeacadStore` with
  the arguments narrowed. `edit` is the only synchronous method, by contract: it
  enters the autosave machine, so a caller that awaited it would be awaiting a
  debounce. **The store keeps the 750ms debounce, the serialized writes and the
  terminal `conflict` state; nothing is reimplemented and no second throttle was
  added.**
- **`activeConceptId` became a `BladeEditor` prop.** It seeded `activeId` from
  `seedConcepts[0]`, so a document whose active concept is not first could only
  be seeded by reordering the strip -- which is a student's own ordering and not
  the mount's to rewrite. `accepted` and `draft` seed from the ACTIVE concept too;
  they seeded from `concepts[0]`, which would have opened the editor showing one
  concept's geometry under another's name.

### Three mounts, and they are three answers rather than one with flags

A MANAGER READS: `ideacad_open_document` resolves its subject through
`_classroom_engine_student` and RAISES for a manager, so no store is built for
one and the editor is read-only because it was handed no writes. A STUDENT WRITES
once the document is open, keyed on the document id so a client-side navigation
rebuilds the working copy. AND A STUDENT WHOSE DOCUMENT HAS NOT OPENED YET GETS
NEITHER -- a pending line, or `IDEACAD_UNAVAILABLE` if the open was refused.
Mounting the read-only editor in that window would put a full set of controls in
front of a student and persist nothing they did with them, which is the defect
this bundle exists to end, one state in.

### Every write the editor already had UI for is wired, not only the edit

The prompt's round trip is the feature edit. Wiring only that would have left
New, Duplicate, Rename, Delete, Move and Commit persisting nothing -- the same
defect one control over, and a concept a student builds in and loses silently.
So all of them go through the store, and the ORDER is the rule: **the local list
changes only after the server agreed.** A create adopts the id the database
returns (`nextId`'s `c2`/`c3` are right for a surface persisting nothing and
wrong the moment one is, because every other write is keyed on the concept id); a
delete adopts `ideacad_delete_concept`'s own `activeConceptId` rather than
guessing `rest[0]`, which is right only while the strip's order and the stored
`position` agree and reordering is exactly what breaks that; a reposition is two
writes at 1-BASED positions, which is what `0201` stores.

A refusal NEVER rolls the local copy back -- what is on screen is the student's
work -- and says so once, in the header, in
`IDEACAD_WRITE_REFUSED`. The selection is the one deliberate exception: it moves
locally and immediately and the `setActive` follows, so a refused activate leaves
the two disagreeing until the next reload, where the server wins.

### The cost that is named rather than hidden

**`ideacad_open_document` is now called twice per page load** -- once by
`+page.server.ts` for the payload and once by `store.open()` in the browser --
because the store's only entry point is that method and it is what puts the
document id, the concept ids and the revisions into the machine that writes them.
A `seed()` on the store closes it in one call. `store.ts` is ledger 0170's file
and not this bundle's surface, so the cost is paid and written down here rather
than by editing somebody else's module from this lane.

### The round trip, measured

`tests/dom/ideacad-mount.test.ts` runs it against the REAL store with an
in-memory backend that enforces `0201`'s own staleness rule: open, edit, **assert
nothing has been written yet** (a store that wrote on the keystroke would already
have an RPC there), wait the real 750ms, see `saveConcept@2`, then open a SECOND
store over the same backend -- which shares no memory with the first and can see
only what the RPC stored -- and read the edited tree back. A second case proves
`destroy()` flushes an edit the debounce still holds.

## PART TWO -- the prediction gate is gone, and the prediction is not

**Mr. Pina decided on 2026-09-12 that physics is always visible.** His reasoning,
recorded because it is the thing a future reader will want and the code cannot
carry: IDEA100 is a rotation class, there is no time to teach the mathematics
behind rotational inertia, and visible numbers help students build maximally
competitive designs.

So rotational inertia and radius of gyration render from the first frame -- **in
the Rules rail**, which is what makes "from the first frame" true of the surface a
student sees on mount rather than only of a sheet they open -- and in every
compare column, with no prediction required and nothing hidden.

**THE PREDICTION ITSELF STAYS.** `ideacad_set_prediction` is untouched, the
stored rationale is untouched, and the sheet still asks which concept spins
longest and why. The control is **Record prediction** now, because a button
labelled Reveal physics on a surface that reveals nothing is a name that costs
somebody an hour. A recorded prediction still replaces the form rather than
asking again.

### What was deleted, named so the record shows it was decided rather than lost

This reverses work from two bundles, both of which were correct against their own
prompts, and both of whose prompts predated his answer.

- From `src/lib/ideacad/BladeEditor.svelte`: the `revealed` state (0171's
  version, seeded from an existing prediction), the `revealing` flag, the
  `canReveal` predicate, the `Reveal physics` control, the `{#if !revealed}` over
  the prediction form and the `{#if revealed}` around each compare column's
  `<dl>`. 0160's fix was the leak that unlocked on the first keystroke into the
  rationale field; 0171's were the gate opening on the press rather than on the
  write, and a prediction already recorded failing to unlock it.
- From `tests/dom/ideacad-editor-mount.test.ts`: the whole
  `describe('IdeaCAD: the prediction gate')` block -- five cases.
- From `tests/dom/ideacad-ui-mount.test.ts`: the three gate cases in
  `describe('the prediction gate opens on the WRITE, never on the press')` and
  the fourth asserting the physics locked beside unlocked rules.
- From `src/routes/dev/ideacad/+page.svelte`: `gateProbe`, nine steps, and the
  `__ideacadGateProbe` hook.
- From `tools/browser-verify/routes/ideacad-role-student-state-compare.mjs`: the
  nine expected gate strings, `'.compare dl' expectPresent: 0`, and the
  `mustNot: ['g·cm²']`.
- `tools/browser-verify/routes/ideacad-role-student-state-revealed.mjs` is
  RENAMED to `...-state-predicted.mjs`, with its measured store entry, and the
  harness state with it.

**NOT ONE OF THOSE WAS SIMPLY DELETED.** Every assertion is inverted in place,
with a comment saying what it used to claim and why it now claims the opposite.
0160's own nine-step keystroke experiment survives in the same order with its
expected answers flipped, and gains a NEGATIVE CONTROL it did not need before:
with nothing locked, every "the physics is visible" claim is also satisfied by a
sheet that shows physics and asks nothing, so the probe ends by proving the
prediction is still collected and recorded. An absent test would have left the
removal looking like the leak 0160 found coming back.

### Decision 26 is closed, and its recorded defect is withdrawn

`docs/decisions/entries/26-*` carries his answer and his reasoning. It is option
C from the entry's own table -- lock nothing -- **plus the prompt kept**, which
is a fourth answer the table did not contain: C is written there as "deletes the
feature", and it deletes the feature only if the question goes with the gate.

The entry also recorded a MEASURED DEFECT: `result.rules.slice(0, 4)` drops the
fifth rule, so `engagement` is never rendered, against a default that said it
stays visible. **The measurement was right and the verdict was wrong.** He is not
enforcing engagement this rotation, so dropping it is deliberate -- a rail
printing PASS/FAIL on engagement would quote a limit nobody is holding students
to. `evaluate` still returns the rule, so nothing is lost and widening the slice
is one line on the day he enforces it. The comment beside the slice now says so,
because the next reader measuring five rules against four rows would otherwise
"fix" it back.

## WHAT RASTERIZING FOUND, AFTER EVERY THRESHOLD PASSED

Ledger 0171 found three defects that way and this bundle found one, in the place
0171's own verdict was written to watch.

**The two physics rows pushed the readouts rail's last row below an invisible
fold.** At 1440 the rail is a 515px box and its content went to **555px** -- 40px
of overflow, with the `UNVERIFIED STANDARD PARTS` notice under a fold this
container's Chromium draws no scrollbar for. The browser pass caught it as
`the readouts rail shows its last row FAILED`, the only row outside threshold in
294 measurements.

`.metric` padding 0.7rem to 0.45rem. **0.5rem was measured first and cleared the
overflow to EXACTLY zero, which is not a margin** on a rail whose row heights are
content-driven. Measured after at 0.45rem: 0px overflow at both widths, last row
bottom **566.4px against a rail bottom of 598.0px at 1440 (31.6px spare)** and
**927.4 against 943.4 at 375 (16.0px spare)**.

**The 375 compare sheet scrolls, and already did.** Measured: the sheet is 650px
with 1151px of content, 501px of overflow. The three physics blocks account for
~165px of that, so it overflowed by ~336px BEFORE this change -- it is a
pre-existing property of stacking three comparison columns on a phone, not a
regression here. Both the last column and Close are reachable by scrolling
(measured directly, `scrollTop = scrollHeight` then read the box). Reported, not
fixed: making the sheet fit a phone is a redesign of 0171's layout and not this
bundle's.

## MEASURED

- **`npm run verify:browser -- --route ideacad`: 12 route/width runs, 294
  measurements, 0 outside threshold**, after the rail fix. Before it, the same 12
  runs and 294 measurements with 1 outside -- the rail row above.
- **Screenshots read at 375 and 1440**, not only measured: the editor, the
  compare sheet before a prediction, and the sheet with one recorded. The rail
  reads `Rotational inertia 1626.6 g·cm²` and `Radius of gyration 2.97 cm` --
  which are the same two numbers ledger 0160 measured LEAKING through the broken
  gate, now on screen deliberately.
- **`svelte-check`: 0 errors, 37 warnings in 20 files** (31 `state_referenced_locally`,
  5 `css_unused_selector`, 1 `perf_avoid_nested_class`). See the note below: this
  is one FEWER than the branch point.
- Full suite and one `verify:readme` pass: see the ledger entry's Outcome.

## REPORTED, NOT FIXED

- **`CLAUDE.md`'s `svelte-check` baseline is stale by two.** It says 40 warnings
  in 22 files at 34/5/1; `origin/integration` at `8241494f` measures **38 in 21 at
  32/5/1**. Ledgers 0168, 0171, 0172 and 0176 each measured 38/21 independently.
  That file is outside this bundle's surface.
- **This bundle removes one more, to 37 in 20, and it is explicable rather than
  mysterious.** `+page.svelte` carried TWO stacked `// svelte-ignore
  state_referenced_locally` comments above `createEngineTransports` and NONE above
  `createIdeacadTransports` -- one of the pair had drifted off the line it was
  written for, so `ideacadTransports` was warning. It has its own now and the
  duplicate is removed; net one warning, in the file this bundle already owns.
- **`supabase/migrations/0201_ideacad_blade_editor.sql` uses the broken revoke
  shape** (`revoke ... from public` then a grant, rather than `0166`'s
  role-naming form). `0202` is the repair and is applied; noted only because a
  reader of `0201` will see the shape `CLAUDE.md` forbids.
