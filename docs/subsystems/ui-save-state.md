# The one save state

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). Autosave, drafts, mirrors, guards and the save indicator. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

- **EVERY SURFACE THAT PERSISTS WORK USES THE ONE SAVE STATE**
  (`$lib/save-state.svelte.ts`), never a sixth hand-rolled variant. It owns the five
  states (clean, dirty, writing, saved, failed), the 800ms debounce, backoff to
  8s, and the visibilitychange / pagehide net; `$lib/save-guard.svelte.ts` is its
  navigation guard and `SaveIndicator.svelte` is the one set of words for it.
  - **`saved` is the ACKNOWLEDGEMENT, never the dispatch**, and it carries the
    clock time of the write. A status set beside a `fetch` call says a request
    was made, which is not what the reader is asking.
  - **A retryable failure and a REFUSAL are different outcomes.** Backoff belongs
    to the network; a server that considered the payload and said no is answered
    once and reported, never retried five times.
    - **WHICH ONE AN RPC ERROR IS COMES FROM ITS SQLSTATE, AND THE PARTITION IS
      `$lib/pg-errors`.** `rpcErrorStatus(code)` answers 503 for a NAMED
      transient (`23505`, `40001`, `40P01`, `55P03`, `57014`, `53300`) and 400
      for everything else, so the client rule "4xx is a refusal" needs no second
      copy on the wire. A whitelist, on purpose: almost every failure on a write
      path IS a considered refusal (`P0001` is a `raise`, class 23 is a
      constraint, `42501` is RLS), and a route answering 400 for every RPC error
      -- which the three notebook note routes did -- reports a deadlock as a
      decision about the payload and drops the write after one attempt.
      `$lib/classroom/upload-errors.ts` reads the same list for its own
      vocabulary; **do not write a second one.**
  - **A SURFACE WHOSE ONLY COPY OF SOMEBODY'S WRITING IS IN MEMORY HAS NO
    FAILURE TO REPORT WHEN IT LOSES IT**, which is why the notebook composer
    mirrors its note into `localStorage` (`$lib/notebook/draft-mirror.ts`,
    `IDEA_INTERFACE_STANDARDS` 6, the two rules its version 2.11 added -- this
    line cited it as "2.11" and there is no section 2.11, which is the one
    trap in citing that document: its sections are integers and everything
    with a decimal point in it is a CHANGELOG VERSION). A tab discarded under memory pressure
    dispatches nothing, so no save machine, no beacon and no navigation guard
    ever sees it. **The keepalive beacon is not the answer at the sizes that
    matter** -- 64KB across every in-flight keepalive request, against a
    measured 134.9KB wire body for 2000 short lines, so the longest notes are
    exactly the ones it refuses whole.
    - **THE MIRROR IS THE SAVE STATE'S SHADOW, NEVER A SECOND SAVE PATH.** It
      is written while the surface's own unsaved predicate is true and cleared
      beside every `EditBaseline.advance()`, so the slot exists precisely while
      the server has not acknowledged the work -- one comparison, persisted,
      rather than a second idea of "unsaved". **Cleared on a confirmed
      acknowledgement or a confirmed discard, NEVER on dispatch**, and a
      `resetForm`-shaped reset clears nothing: it runs in the one case where
      the entry saved and the writing did not.
    - **KEY IT PER VIEWER AND PER RECORD** (`notebook_draft_mirror:<viewer>:<record>`,
      namespaced beside `notebook_pending_capture` and `vanguard_*`). The viewer
      segment is what stops a shared school desktop handing one student
      another's writing; the record segment is what stops two entries
      overwriting each other.
    - **A QUOTA REFUSAL IS SAID OUT LOUD AND NEVER THROWN.** Storage throws when
      full and where site data is blocked, and an exception escaping into a
      reactive effect is a dead editor over a lost note. Sweep OTHER records'
      slots, retry once, then drop the stale value under this key -- a slot
      claiming to be what is on screen and not being it is worse than no slot --
      and tell the person the backup is not there. A safety net nobody knows is
      missing is worse than none.
    - **IT EXPIRES, AND THE CAP IS ABOUT EXPOSURE RATHER THAN CONVENIENCE.**
      `DRAFT_MIRROR_MAX_AGE_MS` is 24 hours. Past it a slot is abandoned work
      rather than lost work, and the window it bounds is how long unsaved
      typing sits in plain `localStorage` on a shared school device -- not how
      long somebody might want their draft back. An UNKNOWN stored shape version
      is DROPPED rather than coerced, for the same reason a preference read
      drops an unrecognised value: a mirror that half-restores is worse than one
      that admits it cannot. A KNOWN OLDER ONE IS READ, and this line said
      "older or unknown" until 2026-09-13 -- a slot written twenty minutes
      before a deploy is still somebody's unsaved writing, and dropping it for
      being one version behind is the loss the mechanism exists to prevent.
    - **AND THE SHAPE VERSION WAS NEVER THE GUARANTEE IT READ AS. A MIRROR
      REFUSES A DOCUMENT THIS BUILD CANNOT RENDER, AND HOLDS IT RATHER THAN
      DROPPING OR STRIPPING IT.** The version covers the mirror's own FIELD SET;
      the document is stored and handed back OPAQUELY, so one naming a node the
      running editor has never heard of passes every check and reaches Tiptap
      intact. **Tiptap does not throw on that. It catches the `RangeError`,
      logs it, and DISCARDS THE WHOLE DOCUMENT** -- prose sitting before the
      offending block included -- so the restored draft is one empty paragraph
      and nothing anywhere reports it. Measured for an unknown BLOCK, an unknown
      INLINE node and an unknown MARK alike; only an unrecognised attr on a
      known node is harmless. So `unknownTypes` checks the document against
      `NOTE_MIRROR_VOCABULARY`, which is pinned against the editor's real
      `getSchema` in both directions, and `planMirrorRestore` answers `hold`.
      - **HOLD, NEVER DROP AND NEVER STRIP, and both alternatives lose the
        writing.** Dropping is total loss of the only copy. Stripping to the
        blocks it understands destroys the rest about four hundred
        milliseconds later, because the restored box IS what the composer
        mirrors next -- and it restates `rich-text-normalize`'s whitelist drop
        on the READ path. Holding keeps every byte where it is, so a rollback
        rolled forward restores it whole. **Every write path steers around a
        held key** -- the acknowledgement sweep, the debounced write and
        `writeMirror`'s own quota sweep, which is told what not to eat. The age
        cap still bounds it: exposure outranks holding.
      - **`mirrorVersionFor` DERIVES THE VERSION FROM THE DOCUMENT, and a
        literal at the call site is what shipped the defect.** `V1_MIRROR_VOCABULARY`
        is FROZEN and `NOTE_MIRROR_VOCABULARY` moves, so the bump arms itself
        when the two diverge: a bundle that wires a node into the editor adds
        one name and nothing else has to remember. Bumping unconditionally is
        the wrong answer -- it makes every ordinary draft unreadable to the
        build currently running. **The bump only helps builds that already know
        to look, which is why it is the smaller half of this rule.**
    - **THIS IS A PATTERN A SECOND SURFACE MAY RE-IMPLEMENT, WHICH IS THE ONE
      PLACE "DO NOT DUPLICATE A RULE" IS ANSWERED WITH A COPY.**
      `$lib/maps/shelf-mirror.ts` is the second one -- the shelf card, on a
      phone standing at a toolbox, which is the worst connection and the most
      fragile tab in the building. Every RULE above is followed there; what
      differs is the PAYLOAD, and generalising the notebook module into a
      type-parameter shape would mean editing somebody else's surface from a
      maps bundle to remove a duplication smaller than the change. **So a
      third mirror is a third module, not a third caller** -- and it owes all
      EIGHT properties: one namespaced prefix, a key per viewer and per
      record, a dropped-not-coerced shape version, a refusal to hand back a
      document this build cannot render, the age cap, a quota answer
      that sweeps other slots and retries, a refusal reported rather than
      thrown, and a written statement of what it cannot hold (a `File` handle
      is memory, and the surface says so while the picture is still staged).
      **The fourth is the one added late, and it binds only a mirror whose
      payload is SCHEMA-BOUND** -- handed back to something that validates it
      and can refuse. Today exactly one of the three is: `ResponseValue` is
      strings and booleans and `MapsShelfDraft` is plain fields, so neither
      sibling carries this hole and neither needs the check. A mirror that
      starts carrying a document acquires it that day, and the reason it is on
      this list rather than in the notebook's own file is that nothing warned
      the first time.
    - **A SECOND SURFACE WITH THE SAME PAYLOAD IS A CALLER, NOT A MIRROR.** The
      header's quick note (ledger 0298) writes a notebook note, so it is
      mirrored through the notebook's own module under the reserved
      `QUICK_NOTE_RECORD`, vocabulary check included; `latestMirror` skips that
      record, so the notebook composer never adopts the quick note's writing
      and two editors never write one note chain.
  - **Pending work is FLUSHED before a navigation, and only a flush that cannot
    land raises a question.** The correct answer to "you have unsaved work" is
    "then save it"; a confirm on every move is a confirm nobody reads.
    **Work the machine CANNOT write -- a staged `File` handle, a child
    surface's own machine -- is reported to that ONE guard through
    `alsoUnsaved`, never a second `beforeNavigate` beside it:** two guards on
    one page race to cancel the same navigation and ask two questions about
    one move. It is asked again AFTER the flush, so whatever the flush landed
    stops counting.
  - **PER-INSTANCE, NEVER A SHELL BANNER.** One global indicator reading "all
    changes saved" while a sibling surface holds a failed write is a false
    negative with a much wider blast radius than the defect it papers over.
  - **`autosave: false` where a write MINTS A RECORD SOMEBODY ELSE READS** (a
    notebook note is a revision, and `EntryNotes` edits one an instructor has
    already seen): the machine still reports dirty for the guard and schedules
    nothing. **A record NOBODY else can read yet is the exception, and the
    privacy is what makes it one** -- the notebook composer autosaves into a
    DRAFT entry, which is invisible at both read sites until it is turned in,
    so the revisions it mints are the author's own history and not a thread
    filling up in front of a reader. **Autosave into a record the moment it
    becomes visible to anyone else is the thing this rule refuses.**
    - **AND THE REVISION-PER-WRITE COST IS PAID AT THE DATABASE, not by
      debouncing harder (0129).** A revision the autosave wrote is REPLACED
      by the next one rather than superseded; a deliberate save stamps a
      boundary. See the append-only rule under "State modelling" for what
      makes that safe and what it must never be extended to. A surface whose
      writes ARE visible to someone else has neither half: it appends, and it
      is `autosave: false`.
  - **`markDirty` driven from an `$effect` must be `untrack`ed.** It reads the
    phase it may then write, so a tracked call re-runs the effect on every
    transition and turns `saved` straight back into `dirty`. A dirty signal
    reported to a parent tracks `save.dirty`, NOT the draft -- the draft is
    cleared before the acknowledgement lands -- and is withdrawn on teardown,
    because a remount destroys the instance that reported it.
  - **`markDirty` FIRES ON A REAL CHANGE, NEVER ON A CHANGE EVENT.** Compare the
    incoming value against the last acknowledged one first. A rich-text editor
    emits a transaction just for being SEEDED -- ProseMirror normalizes what it
    is handed -- so wiring `markDirty` straight to an editor's `onchange` arms
    the debounce for a document nobody typed, the write lands, the re-render
    produces another transaction, and the surface autosaves itself forever
    (measured: 151 writes in seconds; on a surface whose save refetches, it
    wedged the renderer outright). Compare against the EDITOR'S OWN
    serialization at mount (`onready`), not against the value handed in, or a
    harmless normalization reads as an unsaved change.
  - **`$lib/edit-baseline` IS THAT COMPARISON, AND THERE IS ONE OF IT.**
    `EditBaseline` holds what a surface opened on (`seed`), answers whether the
    current value has moved off it (`changed`), and adopts a new reference after a
    write (`advance`); `changed` is FALSE before anything is seeded, because a
    surface whose editor has not reported yet has by definition had nothing typed
    into it. `CheckInGuidance`, `EntryNotes` and `ContentComposer` all read it.
    Three copies of "has this actually been edited" is three things that can stop
    agreeing.
  - **THE EDITOR IS ONLY THE LOUDEST CASE. ANY `dirty` DERIVED FROM THE PRESENCE
    OF STATE HAS THE SAME BUG.** `ContentComposer` reported dirty from the first
    frame in edit mode because its draft carries the item's own title and body:
    `composerHasWork` was answering "is there content in here" and being read as
    "has this been edited". Both questions are now the SAME comparison against a
    different reference -- `composerDraftSignature` differs from an EMPTY draft,
    or differs from the SEEDED one -- so the two answers cannot drift apart. A
    guard that fires when nothing is wrong is a guard people learn to click
    through, which costs the one case it exists for.
  - **A MANUAL SAVE IS A CHECKPOINT, NOT A FINISH, AND ONLY A DELIBERATE FINISH
    ENDS THE SESSION.** A surface that keeps a handle on the record it created
    (the notebook composer's `savedDraftId`) must keep it across an explicit
    save: reset the handle and the next keystroke starts a SECOND record, with
    one piece of work split across two. So a Save-draft-shaped button clears
    only what actually landed and leaves the surface on the same record; only a
    turn-in, a publish, or an explicit new-record action calls the reset. This
    is the same thing 0129 says from the storage end -- an explicit save stamps
    a revision BOUNDARY, which is a thing you write past, not a thing you stop
    at.
    - **AND THE WRITING STAYS IN THE BOX, because the two halves are one
      rule.** Where the next write EDITS the chain rather than appending to
      it, a cleared box over a kept handle means the next paragraph REPLACES
      the saved one as the record's current content instead of following it,
      and the earlier words survive only as a revision nobody is looking at.
      What makes keeping them safe is that the write already advanced the
      `EditBaseline`: the box reads clean and nothing is sent again until
      something actually changes.
    - **ITS BUTTON THEN ASKS THE DIFF, NEVER "IS THERE CONTENT IN HERE"** --
      the presence-of-state bug one bullet up, in its other costume. Once the
      surface holds a record, "something new to save" is what the server has
      not acknowledged, plus any boundary the click still owes. The button and
      the handler read the SAME derived predicate; two spellings of it is the
      thing that stops matching.
