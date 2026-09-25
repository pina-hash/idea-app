# IdeaCAD live sync for the direct modeler

Feedback R34 (Mr. Pina, 2026-09-25): a change one editor makes to a shared IdeaCAD
model did not show for the others until they refreshed, and overlapping edits were
found only when a save was refused. This is the no-migration half of decision 38
(`docs/decisions/entries/38-ideacad-class-edit-grant.md`). The class EDIT grant is
the other half and is a separate SQL proposal (0229); nothing here changes who may
open or edit a document.

## What it is

- **After each accepted save, a ping.** `SolidWorkspace` sends
  `{documentId, conceptId, revision}` on the document's private `ideacad-doc:<id>`
  topic (`sendDocumentPing` in `src/lib/ideacad/live.ts`, event `ping`). The ping
  carries no model and writes nothing. 0216 widened `_ideacad_realtime_can_send` to
  solid-v1 writers and receiving is `_ideacad_can_read_document` (0211), so no
  policy changed.
- **A ping is a hint to read the database, never a fact.** The receiver ignores a
  ping for another document or concept, a stale or duplicate one, and an older one
  arriving after a newer one, and otherwise reads the committed revision
  (`ideacad_concepts.revision`, one column of one row, under the 0205 read policy).
- **The poll is the floor.** Every 12 s, on window focus and when the tab becomes
  visible, whether or not the channel is live.
- **What happens when the database is ahead** is one pure decision,
  `liveDecide` in `src/lib/ideacad/solid/live-sync.ts`:

| Session | Action |
| --- | --- |
| Not behind | nothing |
| A save on the wire | wait (the newer revision may be its own) |
| Unsaved or failed work | keep it; say in words a newer version exists, who saved it, offer Save backup and Load newer version (two presses) |
| Clean but busy (drag, open sketch, rollback bar, time-lapse, menu, value box) | wait; say a newer version is waiting |
| Clean and idle | read the rows after its own last committed row (`ideacad_direct_concept_history`), replay them through the worker, say who changed it |

- **Rows that do not continue the session's own history are never replayed.** A
  clean session then reopens the saved model the ordinary way (it has nothing to
  lose). A pull that fails on the wire waits for the next poll.
- **Who changed it** comes from the history rows' `actor` through `timelineActors`,
  the one rule for turning an address into a label (the reader is "you", `system`
  is never named, two people sharing a local part get their full addresses).
- **The words**: "Live" or "Live unavailable" beside the save indicator, from the
  channel status ("Connecting" until it answers; "cannot tell" never reads as live).
  A refused channel also says, once, that the model still checks every 12 seconds.
- **Optional as a whole.** `SolidWorkspace` takes `live?: SolidLiveTransport`; absent,
  there is no word, no poll and no ping. `/ideacad` wires it
  (`createSolidTransports(...).live(email)`); the legacy chooser at
  `/ideacad?legacy=1` (`IdeaCadApp.svelte`) does not yet.

## Overlap control

Still optimistic, exactly as before: a save with a stale expected revision is
refused by `ideacad_save_direct_document`, and nobody holds a lock. What changed is
WHEN a person learns about it: as soon as the other save lands, not at their own
next save. There is no automatic rebase of unsaved work onto a newer version; that
would need a per-feature merge rule and is not built.

## Measured and tested

- `tests/ideacad-solid-live-sync.test.ts`: the decision (clean, dirty, writing,
  busy), pings (another document or concept, stale, out of order, malformed, a lying
  revision), a refused channel, the history arithmetic and the words. Seven
  mutations of the decision and ping filters each redden it.
- `tests/ideacad-solid-live-transport.test.ts`: the reads name 0216's function and
  parameters and 0201's column, read off the migration files.
- `tests/db/ideacad-direct-live-sync.test.ts`: against the real migrations, an
  editor's saves reach the owner through `head` and `pull` and replay to exactly
  the tree, history and revision a full open returns, bytes included; a viewer
  reads both; a stranger reads neither.
- `/dev/ideacad-live`: two real workspaces over one in-memory server and bus.
  `tools/browser-verify/routes/ideacad-live*.mjs` measure the loop at 1440 and 375.

## Not built

- Presence (who else has the model open). The pings cannot carry it: they fire only
  after an accepted save, so a person who has the model open and changes nothing
  never sends one. Presence needs a heartbeat of its own.
- The legacy chooser's direct-open path does not pass the live transport.
- A class-wide edit grant (decision 38's migration half, proposal 0229).
