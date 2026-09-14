# 28 Can a student see their own history in full?

- Raised: 2026-09-13  By: ledger 0206, out of the IdeaCAD scope document
- Status: ANSWERED 2026-09-13 by Mr. Pina and **BUILT.** The durable data path,
  whole-history paging transport, timeline surface, and undo/redo wiring have
  landed. The older build account below is retained as history; this status line
  is the current answer.
- Build: `createIdeacadHistoryTransports` is constructed on the production
  classroom item route, `BladeEditor.svelte` mounts `HistoryTimeline.svelte`,
  and `readWholeHistory` pages to the newest sequence rather than stopping at a
  display-sized first page. No new migration or grant is needed.
- Decision: **YES. Students see their history in full.**
- Why it was blocked on him: every other per-student record in this codebase has
  had an explicit answer about what its owner may see of it, and several of them
  are narrower than "all of it" for stated reasons. Nobody had given this one an
  answer, so a session building the timeline would have been choosing a
  visibility rule rather than implementing one.
- What it unblocks: the timeline needs no owner-side filter, no cap and no
  collapse. It is the whole log.

## WHY THIS IS A SEPARATE QUESTION FROM 27, AND NOT A WEAKER VERSION OF IT

Decision 27 is about a SHARED document: what one collaborator sees of another.
This is about the ordinary case -- one student, their own part, nobody else in
it -- and it is the one that governs almost every document that will ever exist,
because sharing is opt-in and most work is nobody's but its author's.

They could have had different answers. "Full history to a collaborator" and
"summary history to yourself" is incoherent, but the reverse is not: a
per-person log could plausibly have been an instructor-facing forensic record
that a student sees only the last N entries of. **He answered both the same way,
and that is the thing to keep straight** -- 28 is not implied by 27 and should
not be quietly folded into it.

## WHAT "IN FULL" MEANS AGAINST THE SHIPPED SCHEMA

Measured on `origin/integration` at `78516fa2`.

- **Back to the creation of the part, with no floor.** `0209` writes a `seq 0`
  row of `kind = 'origin'` from an `after insert` trigger on
  `ideacad_concepts` (`0209_ideacad_history.sql` lines 309-330), and a one-time
  backfill gave every concept that already existed one, stamped
  `'migration:0209'` at the concept's own `created_at` (lines 354-357). So there
  is no concept in the table whose log does not reach its own beginning.
- **NOTHING PRUNES, AND THAT IS DELIBERATE AND WRITTEN DOWN.** There is no
  `delete`, no retention window, no cron and no trim trigger anywhere in the
  file; the only `on delete` is the FK cascade, so a row dies only with its
  concept. `0209_ideacad_history.sql` lines 40-42:

  ```
  -- THERE IS NO RETENTION AND NO PRUNING, DELIBERATELY. He said as far back as
  -- possible. Nothing in this file deletes a row, ages one out, or caps a log,
  -- and a later file that wants to is making a decision rather than tidying up.
  ```

  **"He said as far back as possible" is the same instruction this entry
  records**, reached independently by 0189 and now answered in its own right.
- **The only cap is on one PAGE of the read, never on the log.**
  `ideacad_concept_history` clamps its limit at line 532 --
  `v_limit integer := least(greatest(coalesce(p_limit, 2000), 1), 5000);` --
  and returns `newestSeq` and `total` beside the rows so a client can page
  forward from an exclusive cursor. `src/lib/ideacad/history.ts` lines 557-573
  (`readWholeHistory`) is the client that does exactly that, paging until
  `newestSeq`. **So "in full" is reachable and is what the shipped client asks
  for.** A future surface that showed one page and stopped would be narrowing
  this decision by accident.
- **The owner is admitted by the gate, obviously and first.** The read is behind
  `_ideacad_can_read_document` (`0209` lines 540-542), whose first rung is
  `_ideacad_document_role` returning `'owner'` for
  `d.student_email = current_user_email()` (`0205` lines 276-295).

## WHAT IT COSTS, MEASURED, BECAUSE "KEEP EVERYTHING FOREVER" USUALLY HAS A BILL

It does not have one at this scale, and the number is measured against real
Postgres rather than estimated.

**220.5 bytes per action** -- heap plus both indexes plus page overhead, taken as
a `pg_total_relation_size` delta rather than as `pg_column_size`, which leaves
out the 24-byte heap header and the index. Recorded at
`docs/history/inspiring-archimedes-0n4o81.md` line 44 and
`docs/prompt-ledger/entries/0189-ideacad-durable-action-history.md` line 37, and
re-asserted on every suite run by `tests/db/ideacad-history-row-size.test.ts`
against `IDEACAD_ACTION_BUDGET_BYTES` (`src/lib/ideacad/history.ts` line 498),
which is **400**.

**So the design is at 55% of the budget it was sized against**, and the budget's
own sizing case -- 100 students x 3 projects x ~1,600 actions -- prices out at
192 MB at 400 bytes and therefore about 106 MB at the measured figure. That is
the whole reason "no pruning" is affordable: at these numbers a retention policy
would be buying nothing and costing a student their record.

**The estimate this replaces is worth naming**, because it is the thing a reader
of the scope document will have in their head: the document and the chat around
it guessed **200 or 400** bytes an action. Neither was measured; the real figure
sits between them, and it was obtained by writing a corpus into a real embedded
Postgres and reading the relation size back. Prefer the instrument to the number
if the schema ever moves -- `actor` is the widest column and 0209 names it as
the first thing to normalise if the budget is ever missed.

## WHAT REMAINS TO BUILD

Nothing for this decision. A student's complete history is now visible on the
production editor surface. **No migration. No schema change. No new grant.**
`authenticated` already holds SELECT on `ideacad_history` and EXECUTE on the
read function.

## What would change this answer

A measured storage problem, which is not the situation, or Mr. Pina deciding
that seeing your own false starts discourages iteration -- the one pedagogical
argument against it, which he did not make and which the design's whole premise
(a record "as far back as possible") runs the other way.
