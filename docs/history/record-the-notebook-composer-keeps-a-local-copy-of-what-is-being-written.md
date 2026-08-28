---
title: "The notebook composer keeps a local copy of what is being written"
date: 2026-08-26
branches: []
migrations: []
subsystems: ["Digital notebook"]
record_order: 149
---

## The notebook composer keeps a local copy of what is being written

**The failure this fixes**, from a read-only audit of the same code: a student
wrote a long notebook entry on an iPhone (iOS 18.3 Safari, 390x797), pressed
Save, turned in the draft, reopened, and it was gone. **No composer content was
persisted locally at any point.** The note lived in one `$state` variable
(`noteDraft`) and in ProseMirror's in-memory document and nowhere else, so a tab
discarded under memory pressure took it with no failed write, no error and no
message -- nothing had been dispatched, so there was nothing for any save
machine to report. The only local storage on the surface was
`notebook_pending_capture` (`camera.ts`), which carries the title, the check-in,
the section and the folder and **explicitly not the note body**.

**The keepalive beacon shipped one commit earlier does not close this, and the
measurement is the argument.** A `keepalive` body is capped at 64KB across every
in-flight keepalive request; the composer's wire body is the editor's ProseMirror
JSON, measured at 58 characters of scaffolding per block, so the normalizer's own
2000-node ceiling is 113KB of scaffolding alone and a wire body of 134.9KB was
observed for 2000 short lines. The beacon is refused whole -- **the largest notes
are exactly the ones it cannot save**, and "a large amount of writing" is what the
student reported. `localStorage` has no such ceiling. The two are not
alternatives: the beacon is the write that reaches the server, the mirror is the
copy that survives when it cannot (`IDEA_INTERFACE_STANDARDS` 2.11).

### What was built

`src/lib/notebook/draft-mirror.ts`, pure and client-safe, plus about 150 lines in
`NotebookView.svelte` and one new prop on `NoteEditor`.

- **The key is `notebook_draft_mirror:<viewer id>:<entry id | new>`**, namespaced
  alongside `notebook_pending_capture` and `vanguard_*` so a sweep of this
  feature's storage is one prefix match. The VIEWER segment is what keeps a
  shared school desktop from handing one student another's writing; the RECORD
  segment is what stops two entries overwriting each other. A slot expires after
  seven days -- long enough that a weekend cannot lose work, short enough that a
  shared machine is not holding a term of somebody's writing.
- **It is the autosave's shadow, not a second save path.** The slot is written on
  a 400ms debounce while `noteUnsaved` is true -- the SAME derived the autosave
  and the Save draft button read -- and cleared by `clearComposerMirrors()`,
  called from exactly the two places `autosaveBaseline.advance()` is called
  (`persistNote` after a successful write, `rememberDraft` when a create carried
  the note). So the slot exists precisely while there is writing the server has
  not acknowledged. One comparison, in one place, persisted.
- **It is never cleared on dispatch, and `resetForm` clears nothing.** That was
  audited specifically: `resetForm` runs on a turn-in, on a create, and as
  `resetForm(true)` -- the case where the ENTRY saved and the NOTE did not, which
  is exactly when the words in the box are the only copy anywhere. It clears
  `restoredDoc` (or the remount it triggers would re-seed the editor with writing
  that was just saved) and nothing else. A CONFIRMED DISCARD does clear:
  `closeComposer` calls `clearComposerMirrors()` after the student has answered
  "discard it?" with yes, because handing the same words back on the next load is
  a second answer to a question already answered.
- **`NoteEditor` gained `initialDoc`**, seeded straight into Tiptap's `content`.
  What a browser kept is the EDITOR's shape, and the normalizer that would turn
  it into a stored `NoteDoc` is `$lib/server` and unreachable from a browser. It
  wins over `value` when both are given, because the half that was being edited
  is the half nobody else has a copy of.
- **`EditBaseline` gained a read-only `serial` getter**, for the one caller that
  has to PERSIST the comparison rather than only ask it. There is no setter: a
  second way to seed a baseline, spelled in a shape no serializer had to agree
  with, is the thing that stops matching.

### The mirror-versus-server rule, which is the decision this bundle was asked to make

> **A mirror is restored only when the document it holds differs from the
> `autosaveBaseline` serial stored beside it -- the composer's own
> seeded-versus-edited comparison, re-run at read time -- and where the entry it
> names is still a live draft the composer ADOPTS that entry rather than starting
> a second one, so neither side is dropped: the writing goes back in the box as
> unsaved and the page says on screen that the draft already has writing saved on
> it and offers it to read first.**

Three consequences, each deliberate:

- **A slot that outlived its own acknowledgement restores nothing and says
  nothing.** `planMirrorRestore` re-runs `serializeForBaseline(doc) ===
  baseline`; equal means the mirror never held anything the server had not got,
  which is not lost work, and a recovery message about writing that was never at
  risk is the false alarm people learn to click through.
- **Adopting the draft is what keeps this ONE entry.** Without it a restore would
  leave `savedDraftId` null and the next save would CREATE a second entry beside
  the one the last session already made -- the exact duplicate `savedDraftId`
  exists to prevent. The entry is adopted only when the feed still holds it as a
  live draft; a turned-in entry and an id the feed no longer has both drop the
  HANDLE and keep the WRITING, which turns the next save into a new entry rather
  than a refusal the student can do nothing about.
- **The chain is named conservatively.** The mirror's `noteId` when that chain is
  still live, the entry's single live note when there is exactly one, and
  otherwise null -- adding a note is recoverable and writing into the wrong chain
  is not.

**What the student sees when the both-sides case fires:** their writing back in
the note box, the save indicator reading unsaved beside it, and one line above
the form -- *"Your writing was put back from this browser, where it was kept
while you typed. It has not been saved yet. The draft it belongs to already has
writing saved on it, so open that draft below if you want to read the saved
version before you save this one over the top."* No branch of that message ever
claims the writing is saved.

**What was NOT built, and why.** No comparison of the mirror's text against the
server's current note content. There is no shared client-side projection between
the editor's shape and the stored one -- `docText` walks a `NoteDoc` and nothing
walks a `TiptapNode` -- and writing one would be a second notion of "what this
document says", which is the duplicate-rule trap. The cost is one case: where the
hide-path beacon landed after the last mirror write, the restore puts back words
the server already has and reports them as unsaved. Under 0129 that write
REPLACES the autosave head rather than appending, so it costs one request and no
duplicate revision.

### Quota

`localStorage` throws when full, and a throw inside the composer's reactive
effect would be a dead editor over a lost note -- the exact outcome this module
exists to prevent. Every access is wrapped, including reading the `localStorage`
property itself (which throws where site data is blocked). On a quota refusal
`writeMirror` **sweeps only OTHER records' slots and retries once**, because the
one value that can plausibly fill the store is a very long note and that is
precisely the value that must not be dropped; on a second failure it deletes the
stale value under its own key (a slot claiming to be the writing on screen and
not being it is worse than no slot) and reports `full`. The composer then renders
one sentence beside the note box saying this browser will not keep a backup, that
saving still works normally, and to press Save draft more often. **A safety net
nobody knows is missing is worse than none.**

### The route half: a transient is not a refusal

`api/notebook/note`, `add-note` and `edit-note` all answered
`json({ error: error.message }, { status: 400 })` for every RPC error. Harmless
until the previous commit gave the composer a retry curve keyed on the status --
from that point a deadlock or a `too_many_connections`, neither of which is a
decision about the payload, was reported as a considered refusal and dropped
after one attempt with a student's writing in it.

**How the two are told apart: the SQLSTATE.** `rpcErrorStatus` in the new
`src/lib/pg-errors.ts` answers **503** for a named transient and **400** for
everything else. The whitelist is `23505`, `40001`, `40P01`, `55P03`, `57014`,
`53300` -- **moved unchanged** from `$lib/classroom/upload-errors.ts`, which found
those codes in a real browser and still holds the vocabulary for saying them to a
person; not a member was added or removed by the move, so classroom behaviour is
byte-identical and there is now one statement of the partition instead of two.
Everything else is a refusal: a `raise` from the RPC is `P0001`, a constraint is
class 23, an RLS denial is `42501`, and a PostgREST-level code or no code at all
is not a claim that the same call may work in a moment. 503 rather than 500
because it says the database was busy rather than that the handler broke; both
are 5xx, so `retryableStatus` on the client is untouched -- this only makes the
route tell the truth to the rule that was already there.

### Verified

Everything below was driven in a real Chromium against `/dev/notebook` on a local
dev server. No Supabase stack was started and none was needed.

- **The rescue, at 1440x900 and at 375x797.** Note writes set to fail, ~200
  characters typed, the tab CLOSED with no save and no unload path, a new tab
  opened on the same origin: the editor's own text came back byte-identical to
  what was typed at both widths (`restored === typed: true`), the restore
  sentence rendered, and `document.scrollWidth === innerWidth` at both (1440/1440,
  375/375).
- **The lifetime rule.** Polled every 100ms while the server answered normally: a
  slot existed from 400ms to 500ms after typing stopped and was gone from 600ms,
  cleared by the autosave's acknowledgement. Nothing typed, no slot.
- **Adoption and the drop.** A mirror planted on `e-9` (a live draft the harness
  feed still holds) restored and adopted it; a hand-planted mirror whose `doc` IS
  its own `baseline` restored nothing, showed no message, and deleted its own
  slot.
- **Every branch of `planMirrorRestore`**, called directly against the shipped
  module through the dev server: acknowledged -> drop; fresh -> restore, no
  entry; entry gone -> restore, orphaned; turned in -> restore, orphaned; live
  draft with no note -> adopt, `entryHasNote: false`; live draft, chain named ->
  adopt that chain; live draft, one chain, mirror named none -> adopt it; two
  chains, none named -> adopt the entry, chain null; a chain the entry no longer
  has -> chain null.
- **Quota, exhausted for real rather than simulated.** 5116 KB of ballast written
  until `setItem` threw, then a 22,000-character note typed: 0 mirror slots, the
  unavailable sentence rendered verbatim, the editor still accepting input and
  Save draft still enabled. Freeing the ballast and typing once more wrote the
  slot and cleared the warning.
- **The SQLSTATE mapping**, called against the shipped `pg-errors` module: the
  six transients answer 503 and `P0001`, `23514`, `23503`, `42501`, `PGRST202`,
  `PGRST200`, an empty code and no code at all answer 400.
- **A paired proof of the restore check.** `restoredDoc = found.mirror.doc` was
  removed from the restore -- the plausible omission that leaves `noteDraft` set
  and the guard reporting unsaved work while the box on screen is EMPTY, and
  which still renders the restore message. The drive reported `restored ===
  typed: false` with an empty editor, so the check bites on exactly the silent
  shape. `NotebookView.svelte` was restored byte-identically
  (md5 `d930ca01328f9d83458d3455ec79e97a` before and after) and re-measured green
  at both widths.
- **`svelte-check` 0 errors / 37 warnings** (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`) -- the documented baseline,
  unmoved.
- **Suite: 2548 passed, 112 of 113 files.** The six failures in
  `tests/standards-version-header.test.ts` are PRE-EXISTING on this branch and
  were confirmed so by stashing every change in this bundle and re-running that
  file alone (6 failed, 13 passed, identical). They belong to the open
  `standards-version-header-test` lane.

**One assertion moved and it was a comment, not prose.**
`tests/notebook-shell.test.ts` sweeps `NotebookView.svelte` for the literal
"has not been saved yet" -- the rule being that the page never spells a warning
out for itself. The restore sentences are in `draft-mirror.ts` and reach the page
as a variable, so the rule holds; what tripped the sweep was a code COMMENT
quoting the sentence. The comment was reworded and the sweep left exactly as
strict as it was.

### NOT verified

- **Nothing was run against the real Supabase project**, and the three note
  routes were not driven end to end: they need a session and a database, and the
  local stack was deliberately not started. What was verified is that all three
  call `rpcErrorStatus(error.code)` and what that function answers for each
  class of code. **No real deadlock or `too_many_connections` was provoked.**
- **No iOS device was used.** The tab-discard case was reproduced by closing a
  Chromium tab with `runBeforeUnload: false`, which is the same absence of any
  dispatched write but is not the iOS memory-pressure path itself.
- **The `entryHasNote` message was not driven end to end in the browser**, because
  the harness's in-memory transports do not survive a reload, so no
  autosave-created draft with a note is still in the feed on the next load. The
  branch was verified against the real `planMirrorRestore` and the real
  `mirrorRestoreMessage` with a live-draft-plus-note fixture.
- **A shared machine holds a student's unsaved writing in `localStorage` for up
  to seven days.** That is the stated trade of this bundle, mitigated by the
  viewer segment in the key (no other account can restore it) and by the slot
  being cleared on the first acknowledgement, which in the ordinary case is
  within a second of typing. It is not encrypted and it is not swept on sign-out.

