# 27 Does a shared editor get full history and undo?

- Raised: 2026-09-13  By: ledger 0206, out of the IdeaCAD scope document
- Status: ANSWERED 2026-09-13 by Mr. Pina and **BUILT.** The attributed durable
  history, full timeline, undo/redo transport, and production shared-document
  opening path have all landed. The stale account below is retained as history;
  this status line is the current answer.
- Build: `src/lib/ideacad/ui/HistoryTimeline.svelte` renders every entry's actor;
  `src/lib/ideacad/BladeEditor.svelte` mounts the timeline; the classroom route
  constructs `createIdeacadHistoryTransports`; and `ItemDetail.svelte` mounts
  `SharedDocuments` and calls `store.openShared` on the production item page.
- Decision: **YES, AND THE HISTORY IS ATTRIBUTED PER PERSON, THE WAY GOOGLE DOCS
  DOES IT.** A shared editor gets the full history and full undo. Every entry
  carries who made it. Anyone with access can view ALL of the history, whoever
  made each edit, and each entry is clearly marked as that person's.

  **His words:** the history is tracked per person, and it must be clear whether
  an edit came from one person or the other or anyone else who added it.
- Why it was blocked on him: it is a call about what one student may see of
  another student's work inside a document they have both been given. Sharing
  (`0205`) had already decided WHO may open a document; nobody had decided
  whether opening it shows you your collaborator's edit trail by name.
- What it unblocks: the timeline surface can render `actor` without hedging, and
  a shared editor's `undo` needs no separate answer.

## THIS NEEDS NO MIGRATION, AND THAT IS MEASURED RATHER THAN ASSUMED

Both halves were read off the tree on `origin/integration` at `78516fa2` before
this entry was written.

- **The column exists and is NOT NULL.**
  `supabase/migrations/0209_ideacad_history.sql` **line 184**, inside the
  `create table` at lines 176-187:

  ```sql
  	actor text not null,
  ```

  0209's own header at lines 168-173 says what it holds: "`actor` IS AN EMAIL
  AND IS THE WIDEST COLUMN HERE ... It is the first thing to normalise if the
  measured row size ever misses the budget."

- **The read function already projects it.** `ideacad_concept_history`
  (`0209_ideacad_history.sql` lines 519-563) **line 551**:

  ```sql
  				       h.undoes_seq as "undoesSeq", h.actor, h.at
  ```

  `actor` is projected unaliased, so it lands in the returned JSON under the key
  `"actor"`. **One correction to the shape, since it will be read by somebody
  wiring a client:** the function returns a single `jsonb` object
  (`returns jsonb`, line 523), not a `returns table`. The rows are a
  `jsonb_agg` under the key `rows`, beside `conceptId`, `total` and `newestSeq`.

- **Every writer stamps it from the session, never from a parameter.** The three
  write paths are the origin trigger (lines 309-322, `coalesce(nullif(
  public.current_user_email(), ''), 'system')`), the one-time backfill (lines
  354-357, the literal `'migration:0209'`), and the only client-reachable one,
  `ideacad_apply_actions` (lines 464-476), which writes
  `public.current_user_email()`. **So attribution cannot be forged by a caller:
  there is no actor parameter on any of them.** That is the same property every
  student-facing write RPC in this schema has, and it is what makes "each entry
  is clearly marked as that person's" a fact about the signature rather than a
  check somebody could get wrong.

- **The read is gated on the document, so a shared editor genuinely gets it.**
  `0209` lines 540-542:

  ```sql
  	if v_document is null or not public._ideacad_can_read_document(v_document) then
  		raise exception 'That part is not one you can open.';
  	end if;
  ```

  `_ideacad_can_read_document` (`0205_ideacad_document_sharing.sql` lines
  297-310) is owner, viewer, editor or manager. So "anyone with access can view
  ALL of the history" is already exactly what the gate says, for the whole log
  and not for the caller's own rows -- there is no per-actor filter anywhere in
  the function. **A viewer sees it too**, which is wider than the question asked
  and is what the answer's own wording ("anyone with access") calls for.

## WHO IS BUILDING IT, AND WHAT THEY ASSUMED WITHOUT KNOWING THIS ANSWER

**LEDGER 0196 IS BUILDING THIS TIMELINE RIGHT NOW AND WAS NEVER TOLD THIS
DECISION EXISTED.** It was issued 2026-09-13 as "IdeaCAD: the history timeline,
and the retirement of the in-memory undo stack", and this entry and that bundle
ran in parallel. Its branch `claude/gracious-hopper-a46lec` has pushed; the
files below were read off it, and **not one of them was edited by this bundle.**

What it did, read from its branch:

- `src/lib/ideacad/ui/HistoryTimeline.svelte` and `src/lib/ideacad/ui/timeline.ts`
  are new. **It renders the actor.** `HistoryTimeline.svelte` line 178, inside
  the row's `.meta` span:

  ```svelte
  {#if entry.actor}<span class="who">{entry.actor}</span>{/if}
  ```

- Its row type carries it: `timeline.ts` line 316, `readonly actor: string | null;`
  and `history.ts` line 109, `readonly actor?: string;`.
- It closes the wiring gap this entry's measurement found on `integration`:
  `src/lib/ideacad/transports.ts` gains `createIdeacadHistoryTransports` and the
  real item page calls it. Its own ledger says so in its own words: before that,
  0209's RPCs "have no caller at all on the real page".

**SO THE ANSWER AND THE BUILD AGREE, BY LUCK RATHER THAN BY INSTRUCTION.** 0196
chose to render the actor because the column was there, not because anyone had
decided it should be visible to a collaborator. That is worth writing down
plainly: had it decided the other way -- rendered `actor` only when it differed
from the viewer, or omitted it as somebody else's business -- nothing would have
caught it, because there was no decision to check against. **This entry is what
that check is, from now on.**

**Two things 0196 assumed that this decision now settles, neither of them wrong,
both of them now load-bearing rather than incidental:**

1. **The actor is rendered unconditionally, for every row, not only for other
   people's.** That matches "the history is tracked per person" and should not
   be "tidied" later into hiding your own name -- a log where your own edits are
   unlabelled and your collaborator's are labelled reads as a log about THEM.
2. **The type is nullable (`string | null`) over a column that is `not null`.**
   The `{#if entry.actor}` guard can therefore never be false for a row written
   by `0209`, and that is fine as defensive rendering. It should not be read as
   licence to ship a row with no actor: the column forbids it and the writers
   cannot produce one.

## WHAT REMAINS OPEN

The decided display and shared-open path are built. One authority question was
never answered by this decision: **may one editor undo another person's action?**
`0209` models an undo as an appended INVERSE row
   naming its target in `undoes_seq`, with a partial unique index
   (`ideacad_history_undoes_once_idx`, lines 246-248) making a double-undo
   impossible and raising 'Somebody already undid that action. Reload the
   history and try again.' (lines 454-461). **That refusal text is written for
   two people and is already correct for this decision.** What is not yet
   decided anywhere is whether one editor may undo ANOTHER's action at all; the
   schema permits it today (the gate is `_ideacad_can_write_document`, which is
   about the document and not about whose row it is). **That is a real question
   and it is not this entry's** -- this entry answers visibility, not authority.

## What would change this answer

Mr. Pina saying a student should not see which of their collaborators made a
given edit -- which he did not say, and which his phrasing rules out directly.
Nothing about the data would change; the display would lose one span.
