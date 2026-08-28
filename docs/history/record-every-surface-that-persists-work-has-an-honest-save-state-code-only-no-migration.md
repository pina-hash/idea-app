---
title: "Every surface that persists work has an honest save state (code only, no migration)"
date: 2026-08-21
branches: []
migrations: []
subsystems: ["Build, theme, tests, conventions"]
record_order: 95
---

## Every surface that persists work has an honest save state (code only, no migration)

One new primitive, one navigation guard, one shared indicator, six consumers,
one test file, and a fault-injection panel on the classroom harness.

### WHAT WAS ACTUALLY WRONG

`FspTechSelection` and `FspPulse` were the only two surfaces in the repo that
retried a failed write, and they held **two byte-identical copies** of the same
~90 lines: the 800ms debounce, exponential backoff to 8s, the coalescing of an
edit that lands mid-write, and a `visibilitychange` / `pagehide` net. Nothing
else reused it, so the classroom wrote a worse third variant.

`AssignmentEngine` set `saveStatus = 'saving'` **inside `queueSave`**, before any
network call existed and 800ms before one would; never re-attempted a failed
value unless the student happened to edit that same block again; and had no
`beforeNavigate` and no unload net, so clicking the next item inside the debounce
window discarded the last answer **in silence**. That is the reported defect and
it is the first thing the test file covers.

### THE PRIMITIVE, AND THE ONE LINE IT EXISTS FOR

`src/lib/save-state.svelte.ts`. Five states: `clean`, `dirty`, `writing`, `saved`
(carrying the epoch ms of the acknowledgement), `failed`. **`saved` is reached
only where the save function resolves ok.** Never on dispatch, never on a timer,
never because a debounce was scheduled. Everything else in the module is
machinery around that line, and the mutation that moves it above the `await`
reddens exactly one named test.

- **THE TWO FAILURES ARE NOT THE SAME FAILURE.** `{retryable: true}` is the
  network; the identical payload again is the right response. `{retryable:
  false}` is the server having considered it and said no ("this is submitted, so
  edits are locked"). Collapsing them spends fifteen seconds of backoff arriving
  at the same answer while telling someone their work is being retried when
  nothing about it will change. A refusal stops after one attempt; proved by
  mutation (1 call, no waits, against 5 calls and `[800,1600,3200,6400]`).
- **`#pending` is cleared immediately before the value goes out**, not at the top
  of the run, so anything typed after that point is a genuinely newer edit and
  causes one more run when this one settles. A success re-runs immediately; a
  failure re-arms the debounce, so a broken endpoint cannot be hammered by
  someone typing.
- **A scheduled timer that fires with nothing pending BAILS.** An edit made
  mid-write arms the debounce AND is picked up by the faster settle path; without
  the bail the timer fires behind it and writes an identical row a second time.
  Found by the coalescing test asserting 2 calls and getting 3.
- **`autosave: false` is a real mode, not a smaller autosave.** A notebook note
  write INSERTS a revision (0078), so a debounce there would mint one every 800ms
  and fill a thread with versions nobody asked for. `markDirty` still moves the
  machine to `dirty` -- which is what the guard reads -- and schedules nothing.
- **PER-INSTANCE, NEVER GLOBAL, and there is no shell banner.** A surface reading
  "all changes saved" while a sibling holds a failed write is a false negative
  with a much wider blast radius than the defect it would paper over. Asserted
  directly: the root layout, the classroom shell and the profile menu name
  neither `SaveState` nor `SaveIndicator`.
- **`onHide` is the caller's choice.** The default net is `saveNow()`, right for
  our own origin. FSP hands in its `sendBeacon`, because its endpoint is an Apps
  Script `/exec` on another origin and a fetch begun at `pagehide` is not
  guaranteed to leave the machine.

`src/lib/save-guard.svelte.ts` is the SvelteKit half, split out so the state
machine stays importable and assertable with no `$app/*` in scope. It **flushes
first and only asks if the flush could not land** -- the correct answer to "you
have unsaved work" is always "then save it", and a confirm on every click is a
confirm nobody reads. `type: 'leave'` cancels, which is what raises the native
unload dialog (SvelteKit's own `beforeunload`, the mechanism NotebookView already
depended on).

`src/lib/SaveIndicator.svelte` renders `saveStateLabel`, the ONE spelling of the
five states' words, so four surfaces cannot drift into four vocabularies. Colour
is never the only signal: every state carries its words and `failed` additionally
carries a marker glyph.

### THE SIX CONSUMERS

Both FSP surfaces were **refactored onto the module in the same bundle** -- the
whole point of an extraction is undone by leaving the originals on their copy.
They keep their own pill markup and their two readiness lines ("Enter your name
to begin"), because those are about whether there is anything to save yet rather
than about a save; the three save states now read from the shared label. Their
`sendBeacon` survives as `onHide`.

`AssignmentEngine` gets **one SaveState for the whole engine, not one per block**:
the student is owed a single honest answer to "is my work saved", and N
indicators each speaking for one block cannot give it. A `Set` of dirty block ids
remembers what still owes a write; a transport failure leaves the id in the set
so the retry re-sends it, and the value was never taken off the screen because
`values` is what the field renders from. `refresh()` clears the set and calls
`markSaved()` -- every field was just re-seeded from its response rows, so a
still-marked block would make the guard ask about work that no longer exists.

`EntryNotes` reports its dirty state UP through its card to the page, because the
guard tested `staged`, `title` and `noteDraft` only and an open note editor was
invisible to it. `notebookUnsavedReason` in `notebook-shell.ts` combines the two
answers in one place, so the guard and the Close control cannot diverge.

`GradingConsole` gets a live unsaved marker. Its dirty guard (7e6cfd7) already
refused to swap students over unsaved grading and still is the boundary; what it
did not do was SAY anything, so a grader learned there was unsaved work only when
a confirm appeared over a click they had already decided on. `grade()` now
returns a `SaveOutcome` rather than a boolean, so its refusals
(`incomplete_scores`, `override_needs_comment`) are not retried with backoff.

`ContentComposer`'s BEHAVIOUR is deliberately untouched: it already collects every
failure into one report and leaves anything that did not land staged, so saving
again retries exactly the rest. Only its indicator was aligned, and its verdict is
**read off `msg`** rather than re-derived -- a second reading of the same run is
how an indicator ends up disagreeing with the report printed under it.

### TWO BUGS FOUND IN THE BROWSER, BOTH INVISIBLE TO THE TYPE CHECK

1. **The dirty signal leaked.** A successful note save reloads the feed, which
   remounts the card, so the instance that reported `dirty` was destroyed rather
   than corrected and the page's Set kept that entry id forever. Fixed with a
   teardown that withdraws the signal.
2. **And it was reported off the wrong thing.** The signal came from the effect
   tracking the DRAFT, reading `save.dirty` inside its `untrack`. A successful
   save clears the draft BEFORE the acknowledgement lands, so the last thing the
   page heard was `dirty` while the phase was still `writing`, and the `writing`
   to `saved` transition -- the one that actually releases the guard -- re-ran
   nothing. The note saved, the editor closed, and every navigation after that
   still asked about it, which is the kind of warning people learn to click
   through. The signal now has its own effect tracking `save.dirty`.

**`untrack` is load-bearing at every `markDirty` call site driven by an effect.**
`markDirty` READS the phase it may then write, so a tracked call re-runs its
effect on every transition the machine makes and turns `saved` straight back into
`dirty`, forever.

### WHAT WAS MEASURED

Browser, against the REAL components through the dev harnesses, transitions
disabled first (the pane freezes them at t=0).

- **The reported defect, A/B.** Typed into the assignment's free-text block and
  read the harness's own response store directly rather than the field, because
  the field holds the text either way -- which is precisely how the lost write
  stayed invisible. At 200ms: indicator `dirty` / "Unsaved changes", store still
  holding the previous value. Navigated to `/dev/pathways` (a real route change;
  the engine unmounts, confirmed). **Guard removed: the store held `null`, the
  answer was lost. Guard present, identical sequence: the store held the typed
  value.**
- **A rejected write, full lifecycle:** `dirty`, `Saving...`, `Retrying (attempt
  2 of 5)...`, 3, 4, then `Not saved. The network is down (simulated).` with a
  Retry control, the value still in the field and the store unchanged throughout.
  Endpoint back up, Retry pressed: `Saved 11:40 PM` and the store holds the value.
- **FSP, refactored:** `dirty`, `Saving...`, `Saved 11:42 PM`, one POST in the
  harness log. Two queued failures: visible `Retrying (attempt 3 of 5)...`, then
  recovery to `Saved`. FspPulse the same.
- **GradingConsole:** nothing while clean, `Unsaved changes` the moment a
  criterion is scored, `Saved 11:43 PM` on the acknowledgement.
- **EntryNotes and the notebook guard:** with the composer NOT mounted and an open
  note editor dirty, the navigation was intercepted with "You have edits to a note
  that have not been saved yet." and declining kept both the page and the editor.
  After the save: not asked, navigated.
- **1440x900:** status row 896x44, indicator 190x44 on one line, `Save now` 79x44,
  Share Tech Mono, centre-aligned with the state chip, `scrollWidth` 1425, no
  horizontal overflow. The grading indicator sits on the same 44px row as the
  grade actions (436x44).
- **375x812:** `scrollWidth` 375 and no horizontal overflow in any of the five
  states. `dirty` 190x44, `saved` 183x44, `failed` wraps to 343x71 with `Retry`
  58x44 and `Save now` 79x44 -- both above the 44px tap floor.

### MUTATION PROOF

The harness was proved against a deliberately bad mutation FIRST (`markDirty`
returning early past the pending flag): **12 of 34 reddened.** Then, each applied
alone and restored md5-identically:

| Mutation | Reddened |
| --- | --- |
| `saved` set before the `await` (dispatch-driven again) | 1: "never reports saved while the write is still in flight" |
| `#flush` returns early (the durability net removed) | 2: the visibilitychange write, and the FSP `onHide` preference |
| `guardSaveNavigation` removed from AssignmentEngine | 1: "flushes before navigation and nets the tab going away" |
| the note-editor clause removed from `notebookUnsavedReason` | 1: "reports the note editor even when the composer is empty" |
| `ondirty` removed from EntryNotes | 1: "the notebook page's guard asks about note editors" |
| NotebookView spelling its own warning out | 1: "says the same thing wherever it is asked" |

The flush test is paired with a POSITIVE CONTROL that runs the same edit with no
flush and asserts the store does NOT hold it, so the flush assertion cannot pass
vacuously.

**One existing assertion was GENERALIZED, not deleted.**
`tests/notebook-shell.test.ts` asserted exactly three occurrences of
`NOTEBOOK_DISCARD_WARNING` in NotebookView, which a second KIND of unsaved work
necessarily breaks. What it was protecting is that the page never spells a
warning out for itself; it now asserts that rule, and was re-mutated to confirm
it still bites.

### Not verified

- **No live Supabase project.** The local `.env` is the placeholder. Every browser
  figure resolves against the harnesses' in-memory stores, never a real
  `classroom_responses` row, a real `notebook_edit_note` call or a real Apps
  Script `/exec`. What is proved is the state machine, the guard and the
  indicator; not the RPCs underneath them, which are unchanged.
- **`pagehide` was not fired in a real tab teardown.** The listener registration
  and the flush are asserted against a stand-in `document`/`window` in the unit
  test, and `visibilitychange` was exercised there; the browser pass did not close
  a tab, so `sendBeacon`'s real behaviour at unload is unverified here, as it
  always has been.
- **No screenshots.** The Browser pane does not composite, so every visual figure
  above is a measured geometry or computed-style read, reported as such.
- **The `saved` state on ContentComposer is short-lived by design and was not
  measured**: its parent closes the composer on a successful save, so what is
  observable there is the refused state, which was measured and reads identically
  to the other three.
- **Switching entries in the notebook still discards an open note editor without
  asking.** The teardown withdraws the dirty signal, which is correct: the edit is
  gone from the screen, and warning about it at a later route change would be a
  lie. That the detail-pane SWAP itself does not ask is pre-existing and outside
  this bundle, which was scoped to the navigation guard. Worth a look.
- **The 44px floor was measured on the indicator's own controls only.** The
  surrounding surfaces were not re-audited.

