---
title: "A student's answers are mirrored into their own browser while they type, so a discarded tab stops taking them; the restore refuses to overwrite a newer saved answer and hands the local copy back instead (`claude/assignment-draft-mirror-zpzkzd`, no migration)"
date: 2026-09-06
branches: [claude/assignment-draft-mirror-zpzkzd]
migrations: []
subsystems: ["Classroom", "Testing", "Toolchain"]
---

Prompt 0061 was sent after two student reports, "infinite copies of that draft"
and "Homework progress didn't save". It found and fixed the first, and reported
that the second had no silent-failure path left on the student side: every
refusal and every transport failure reaches `SaveIndicator` in words, and
in-app navigation is flushed and re-issued. It named one gap it could not take,
because the file was outside its ownership. This bundle is that gap.

Files owned and touched: `src/lib/classroom/AssignmentEngine.svelte`,
`src/lib/classroom/assignment-draft-mirror.ts` (new),
`src/routes/dev/assignment-mirror/**`, `tests/classroom-assignment-mirror.test.ts`,
`tests/dom/assignment-mirror-mount.test.ts`,
`tools/browser-verify/routes/assignment-mirror*.mjs`, the generated regions of
`tools/browser-verify/README.md`, `classroom-updates.json`, the ledger entry and
this file. `src/lib/notebook/draft-mirror.ts` and `ContentComposer.svelte` were
read and not edited. No migration: a mirror is local to the browser by design.

### The measurement, first, because the ledger's claim was nearly right and not exactly right

Driven against the real `AssignmentEngine` mounted in `tests/dom/`, before any
change:

* Eight characters at 120ms a character: **0 dispatches** during 1029ms of
  typing; the first `saveResponse` landed **exactly 800ms after the last
  keystroke**.
* Sixty characters at 110ms a character -- one ordinary sentence -- **0
  dispatches over 6694ms**, and `Object.keys(localStorage)` **empty at every
  point**.

So the window is not 800ms. `SaveState.#schedule()` cancels the timer before
re-arming it, and `SpecRenderer` reports a textField on `oninput`, so **every
keystroke restarts the clock**: the window is the whole of the typing plus
800ms, and a student writing three sentences without an 800ms pause has nothing
dispatched for the entire time. The answer exists in one `$state` record and
nowhere else.

**What the ledger got wrong, and it matters for what the fix has to be.** It
says a tab discarded inside that window loses the answer "with nothing
dispatched at all". The student side DOES have `SaveState`'s durability net --
`$effect(() => save.attach())` at what was line 149 -- and it fires: measured,
`visibilitychange` to `hidden` dispatched a write at 6702ms, 8ms after the
event. So on the ordinary phone case something IS sent.

It is sent as a plain `supabase.rpc`, which is an ordinary `fetch` with no
`keepalive` and no beacon, **one round trip per dirty block, awaited in turn**.
A page being frozen or unloaded is free to abandon every one of them, and the
more blocks are dirty the more certainly it does. That is the real shape of the
defect, and it is why the fix is not "flush harder".

### The mirror

`src/lib/classroom/assignment-draft-mirror.ts` follows
`src/lib/notebook/draft-mirror.ts`'s contract rather than inventing a second
one: `assignment_draft_mirror:<viewer>:<item>`, a 24-hour age cap for the same
shared-lab-machine reason, a 400ms debounce, sweep-and-retry on quota, an
unknown shape DROPPED rather than coerced, and no function in it that can
throw. Three things differ, each because an assignment is not a notebook entry.

**It is read BY KEY, never "the newest slot for this viewer".** A composer is
one surface with one draft, so the newest slot is by definition the writing
that was being typed. An assignment page is one of many, and the newest slot is
frequently a different assignment's -- restoring it here would put one
assignment's answers into another's fields, which is worse than losing them.

**A slot holds every block, not the dirty ones.** `dirtyBlocks` is a plain
`Set` the engine keeps for its own write loop; a second consumer of it would be
a second thing to keep in step, and deciding what is worth restoring needs a
comparison rather than a flag anyway. The volume is a handful of answers.

**And it carries a per-block baseline**, through `serializeForBaseline` --
`EditBaseline`'s own serializer, so "the same value" means one thing across the
two sides rather than two. `AssignmentEngine` now keeps `acked`, seeded from
`data.responses`, advanced per block on each acknowledged write from the value
that actually went out (read once before the `await`, because an edit landing
mid-flight is a genuinely newer answer than the server agreed to), and reseeded
by `refresh()`.

### The restore, which is the half with teeth

A mirror differing from the server is **two** situations wanting opposite
outcomes: an answer the server never received, or an answer the server has
since replaced. Two values cannot separate them. The recorded baseline is the
third corner, and `planAssignmentRestore` is the whole rule:

| mirror vs its baseline | server vs the mirror's baseline | outcome |
| --- | --- | --- |
| equal | -- | skip: nothing unacknowledged |
| differs | equal | **restore**: the server never moved |
| differs | server equals the mirror's value | skip: the write landed after all |
| differs | differs | **conflict** |

On a conflict the SAVED answer stays on screen and nothing is dispatched.
Silently overwriting newer saved work with an older local copy is data loss
dressed as a recovery, and it is the failure this feature would most plausibly
have shipped with.

**But the local copy is not thrown away either, and that is the second half of
the answer.** It is rendered under the message as selectable text with its own
Copy control -- `mirrorValueLines` projects every shape `ResponseValue` can
hold (text as its own lines, a table row by row against its column labels, a
checklist as the items ticked), because a shape that fell through to nothing
would be a silent drop of exactly the kind this module is about. Raw JSON would
be a technically complete disclosure nobody can act on, which is the same as
destroying it quietly.

**What is on screen is what survives.** A student who reloads before acting
loses the conflicted copy, because the next mirror write holds the merged
values. That is why the Copy control is there rather than a note saying to
write it down; it is the affordance the "nothing was thrown away" claim rests
on, and its 44px geometry is measured in the browser rather than asserted.

**The declaration is excluded in both directions.** Ticking an academic
integrity box is an act a student takes deliberately, and putting a tick back
on their behalf makes them attest to something they did not touch. It costs
almost nothing: `setDeclaration` calls `save.saveNow()` with no debounce, so
the window this module exists for barely applies to it.

**A restore marks the blocks dirty**, which is what actually saves them. A
restore that only put text on screen would leave the student looking at an
answer the server still does not have. `rendererKey` is bumped because
`SpecRenderer` seeds `initialValues` once, at mount.

### The half that closes the window rather than narrowing it

A 400ms mirror debounce takes the exposure from (typing + 800ms) down to 400ms.
It does not take it to zero, and for a tab that dies while backgrounded it does
not have to: the engine registers its OWN `visibilitychange`/`pagehide`
listeners and writes the pending slot immediately.

**`localStorage.setItem` is synchronous.** It has completed before the handler
returns, where the save's flush is a `fetch` the freezing page may abandon.
That is the entire argument for this listener existing beside `SaveState`'s,
and it is asserted directly: one keystroke, no waiting, storage empty (the
positive control), hide the tab, slot present with the character in it -- no
`await` anywhere between the event and the read.

What the 400ms debounce is left covering is a hard kill with no event at all.

### The viewer id, and why `anon` is not available here

Read inside the component off `page.data.claims.sub`, the `Disclosure` rule, so
"per person" is one rule in one place and no caller threads an identity.
`Disclosure` falls back to `anon`; **this must not**. What a disclosure
remembers is whether a panel was open; what this holds is a student's answers,
and a shared `anon` slot on a school desktop would hand one student another's
work. No viewer means no mirror is written and none is read. `/classroom` is in
`authedPrefixes`, so that branch is a fail-closed guard rather than a supported
state.

The dev route supplies one through its own `+page.server.ts` return value,
which lands in `page.data` -- so the harness drives the read the shipping
component already makes rather than being handed a prop the real page does not
pass. `?viewer=b` picks the second student, which is what makes "two students,
one machine" demonstrable.

### Storage that will not take it

`blocked` (no storage object at all, or the property access itself throws) and
`full` (the quota, after a sweep of other slots and one retry) both render
`ASSIGNMENT_MIRROR_UNAVAILABLE` at the top of the assignment: not an error,
because nothing has failed and the ordinary autosave still works, but said out
loud, because a safety net nobody knows is missing is worse than none. On a
failed retry the stale value under the key is DROPPED -- a slot claiming to be
what is on screen and not being it is worse than no slot.

All three refusals are driven by a storage stand-in in the node project rather
than by happy-dom, because a real browser will not produce a throwing `setItem`
on demand, and a test that could not make the case happen would be asserting
the branch it wanted rather than the branch that runs.

### Verification

`npx svelte-kit sync && npx svelte-check`: **0 errors, 37 warnings in 20
files**, breakdown 31 `state_referenced_locally` / 5 `css_unused_selector` / 1
`perf_avoid_nested_class` -- the documented baseline, unmoved. The two
`PUBLIC_SUPABASE_*` placeholders were exported before the sync, per the
missing-`.env` note.

Full suite on the final tree: recorded in the report for this bundle. The
`origin/integration` baseline this branch started from was **4 failed / 5921
passed over 289 files**, two files, and both failures are `tests/gauntlet-doc`
and its neighbour, which prompt 0067 owns.

**Mutation proof, four mutants, every restore by `cp` and md5-checked** (`git
checkout --` was never run):

| mutant | reddened |
| --- | --- |
| 1. the mirror write is removed | 6 of 6 DOM tests |
| 2. an acknowledged save no longer clears the slot | 1 (the one that names it) |
| 3. the three-cornered comparison collapses to two corners | 2 (both conflict tests) |
| 4. the synchronous hide flush is removed | 5 of 7 |

`md5sum -c` reported OK for both files after each.

Browser pass, `/dev/assignment-mirror` at **375 and 1440**, two specs (the
recovery and the conflict): **54 measurements, 0 outside threshold**, and three
consecutive passes to prove it. Measured values include the recovery sentence at
12.47:1, the conflicted answer's text at 11.34:1 on its own recessed plate, its
block label at 6.68:1, the Copy control at 78.2x44, the answer field at 275x62
(@375) and 860x62 (@1440), and 0px horizontal overflow at both widths. Web
fonts do not load in the harness, so text is measured in the fallback stack;
`prefers-reduced-motion` is `no-preference`, so that path is not exercised.

### The instrument defect this bundle found, which is worth more than the route it was found on

The first version of the browser specs was **flaky: 1 pass in 2 came back with
eight rows outside threshold**, always at @375, always the first run of the
pass. That is the signature of the prompt's own warning -- a measurement on the
first page load after a cold `vite dev` boot is not a measurement -- and the
mechanism is specific:

**`run.mjs` judges an `evaluate` prepare step on whether it THREW. Only a
`click` step's `until` is read at all.** An `until` written on an `evaluate`
step sits in the file looking like a guard and does nothing. So the typing step
fired its keystrokes into markup that was painted but not yet hydrated,
`queueSave` never ran, nothing was ever dirty, and every check downstream was an
honest reading of a state the run had not reached.

An intermediate "fix" -- a storage-clearing reset step -- made three passes
green and was **wrong**: `run.mjs` opens a fresh `newContext` per route/width,
so `localStorage` never leaked between the two specs at all, and the step was
buying 300ms and a remount. It reported "cleared 0 stale slot(s)" every time,
which is what said so. It was removed.

The real fix is CLAUDE.md's own prescription: the retry is INSIDE the typing
step, against the one effect only a hydrated engine produces (a mirror slot
appearing in storage), it reports the attempt count, and it THROWS when the
effect never lands. Four passes since: registered on attempt 1 or 2, and the
attempt-2 readings are the retry doing real work rather than being lucky.

That in turn made the hide-tab step's predicate non-discriminating -- by the
time the retry has confirmed a keystroke, the 800ms autosave debounce has
usually fired on its own, so `dispatched 1` holds at rest and the runner
correctly refused to count the click (7 of 8 runs). There is no predicate only
that click can produce short of the harness counting its own presses, so the
step is `force: true` **with** its `until` (force annotates; it does not exempt
the predicate requirement -- measured), and the report line carries `[force:
predicate not required to discriminate]`. What the hide actually guarantees is
asserted in `tests/dom/` instead, where the clock can be held still.

### Counts

`npm run verify:counts`: **118 specs over 58 routes, 87 `/dev` pages, 236
route/width runs** -- up from 116 / 57 / 86 / 232, which is the two new specs
and the one new dev page and nothing else.

### NOT verified, and one thing deliberately left undone

* **No live Supabase, no signed-in session, no real student device.** The local
  `.env` is a placeholder project and this container has no stack running.
  Every transport in every test and in the harness is in-memory.
* **No real tab discard.** A browser reclaiming a tab under memory pressure
  cannot be caused on demand; what is driven is `visibilitychange`, `pagehide`,
  an unmount with no flush, and a write that never settles. Those are the
  observable halves of it.
* **No iOS Safari, no Android Chrome.** The private-browsing and
  storage-disabled branches are driven through a stand-in, not through a
  browser configured that way.
* **`prefers-reduced-motion: reduce` is not exercised**, and nothing added here
  animates.
* **`CLAUDE.md` was NOT edited**, deliberately: the prompt's ownership list is
  "you own, and nothing else" and does not include it. The standing rule says a
  new convention updates it in the same change, so this is a real gap and the
  text it wants is one paragraph, to go beside the existing draft-mirror bullet
  under the save-state section: *there are now TWO draft mirrors and the
  notebook's is only the first -- `$lib/classroom/assignment-draft-mirror.ts` is
  the assignment half, keyed `assignment_draft_mirror:<viewer>:<item>`, read BY
  KEY rather than newest-first because an assignment page is one of many; a
  restore is a THREE-cornered comparison (the mirror, the baseline it recorded,
  and the server now) because two values cannot tell a lost write from a
  superseded one, and where both moved the SAVED answer wins and the local copy
  is handed back on screen rather than dropped; the mirror is written
  synchronously on `visibilitychange`/`pagehide` because `localStorage.setItem`
  completes before the handler returns where a `fetch` does not; and an
  academic integrity tick is never restored.*
* **The 800ms autosave debounce was not changed**, per the prompt. It is a
  separate trade and is not obviously wrong; the mirror makes it survivable
  rather than making it shorter.
