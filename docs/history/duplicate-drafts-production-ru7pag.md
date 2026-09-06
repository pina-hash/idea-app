---
title: "0061's duplicate-draft cleanup query would delete a student's hand-in: the two omitted tables, the 18-table cascade census, and why the count cannot be taken in the browser (`claude/duplicate-drafts-production-ru7pag`, no migration)"
date: 2026-09-06
branches: [claude/duplicate-drafts-production-ru7pag]
migrations: []
subsystems: ["IDEA Classroom", "Curriculum, migrations, policy"]
---

**This entry supersedes the "THE CLEANUP QUERY" section of
`docs/history/draft-duplication-homework-progress-65qxgf.md` (prompt 0061).
Everything else in that entry stands.** 0061 is a dated record and is not
rewritten to match what was learned afterwards, so the correction is here; the
only edit made to it is one pointer line at its top, because a superseding
record nobody can reach from the stale one corrects nothing.

Nothing in this bundle is a code change. It is a record, written because the
unsafe thing is a committed instruction addressed to a person with SQL editor
access, and the next person to read 0061 will run it.

## The one-sentence finding

0061's safety query checks six item-keyed tables and misses two that hold
student work. **A draft carrying a hand-in but no response passes that query,
reads as a surplus copy, and is deleted with the hand-in inside it**, because
every item-keyed child table is `on delete cascade`.

## What 0061 got right, and is not in question

The grouping is correct and is still the specification:

```sql
group by i.author_email, i.kind, i.title, i.body
having count(*) > 1
-- where i.published = false, keeping (array_agg(i.id order by i.created_at, i.id))[1]
```

So is the reasoning around it -- that a duplicate title with a different body is
not a copy and must not be swept, that an edited copy no longer groups and that
this is the safe direction, and that **a surplus copy is never an empty row**
because 0085's `classroom_items_titled` and `classroom_items_post_body`
constraints refuse one. The defect is confined to the second query, the one that
decides whether a candidate is safe to remove.

## 1. The two omitted tables

0061's safety query counts `classroom_postings`, `classroom_attachments`,
`classroom_responses`, `classroom_assignment_specs`, `classroom_rubrics` and
`classroom_decks`. Two tables holding student work are absent:

* **`classroom_submissions`** (`0086`, `item_id ... on delete cascade`) -- the
  hand-in itself, carrying `state` (`draft` / `submitted` / `returned`) and
  `submitted_at`. **`classroom_submission_files` hangs off it**
  (`submission_id ... on delete cascade`), so a student's uploaded bytes go too,
  by a two-step cascade that is invisible in any query that only looks for
  `item_id`.
* **`classroom_module_approvals`** (`0086`, primary key
  `(item_id, student_email, module_id)`) -- a teacher's record that a named
  student cleared a named module. Not a hand-in, but a per-student record of
  work being accepted, and unrecoverable.

`classroom_responses` alone is therefore not "student work". An assignment can
carry a submission with files and no response row at all -- responses are
per-block answers, and a hand-in whose work is an uploaded file produces none.
**That is the exact shape 0061's query calls safe.**

## 2. Postings do not disqualify, and zero postings means undeletable

0061 lists `postings` first among the six, which reads as a disqualifier. It is
not one, and it cannot be: **every draft the composer creates has a posting** --
that is how it reaches a class at all -- so a rule that treated a posting as
disqualifying would find nothing.

The direction is in fact reversed. `classroom_delete_item` gates on
`_classroom_manages_item(p_id)` (`0085`), which is

```sql
select exists (select 1 from public.classroom_postings where item_id = p_item_id)
    and not exists (... a posting whose section the caller does not manage ...)
```

The leading `exists` means **an item with zero postings can never be deleted
through the app by anyone**, admin included: the first clause is false, so the
RPC raises *"Only the teacher of record for every class this is posted to can
delete it."* A zero-posting row is not a removable row that happens to be
unattached; it is a row with no removal path at all, and a surface offering a
control for it would be offering a control whose only possible outcome is a
refusal. Say so in words instead.

The second clause is the other half: a copy posted to two sections needs the
caller to manage **both**. A co-teacher of one of them is refused.

## 3. The census is 18 tables, all `on delete cascade`

Read off `supabase/migrations/` rather than recalled -- every table whose
`item_id` references `classroom_items (id) on delete cascade`, whether declared
in its own `create table` or added by a later `alter table`:

| | table | what a delete takes |
| --- | --- | --- |
| 1 | `classroom_assignment_specs` | the worksheet |
| 2 | `classroom_attachments` | student-facing files (Drive/Storage rows) |
| 3 | `classroom_content_revisions` | the authoring history |
| 4 | `classroom_deck_ingest_jobs` | deck import state |
| 5 | `classroom_deck_uploads` | uploaded deck archives |
| 6 | `classroom_decks` | the deck, its Drive folder and ~30 files |
| 7 | `classroom_instructor_attachments` | instructor-only files |
| 8 | `classroom_instructor_keys` | which copy is the answer key |
| 9 | `classroom_instructor_resources` | instructor-only links |
| 10 | `classroom_instructor_responses` | **an instructor's own answers** |
| 11 | `classroom_item_resources` | authored links |
| 12 | `classroom_item_views` | who opened it |
| 13 | `classroom_module_approvals` | **per-student module approvals** |
| 14 | `classroom_postings` | which classes it is in |
| 15 | `classroom_reference_specs` | reference-doc structure |
| 16 | `classroom_responses` | **per-block student answers** |
| 17 | `classroom_rubrics` | the grading rubric |
| 18 | `classroom_submissions` | **student hand-ins** (and their files, transitively) |

Bold is work belonging to a person rather than to the item. `0128`'s
`classroom_instructor_responses` is worth naming beside the student ones: it is
an instructor's own copy of the answers, deliberately given its own table so no
forgotten filter could grade a teacher, and a cleanup that silently ate it would
be destroying staff work rather than student work but destroying it just the
same.

## 4. `classroom_item_views` is a history signal, not a blocker

A row there means a student opened the item. It is not work and must not block a
removal -- blocking on it would refuse a genuine surplus copy for the sole reason
that somebody once looked at it. But on a row the grouping calls a
never-published surplus draft, a non-zero view count says **the grouping is wrong
about that row's history**: something made it visible once. Show it beside the
counts; do not act on it.

## 5. The count cannot be taken in the browser, and this is the permissive direction

All seven relevant tables carry `grant select ... to authenticated` with RLS, so
a client-side count *runs*. It is nonetheless the wrong instrument, and the way
it fails is the dangerous one.

`classroom_responses` and `classroom_submissions` are both governed by

```sql
using (student_email = public.current_user_email()
       or public.classroom_can_review_submission(item_id, student_email))
```

and `classroom_can_review_submission` (`0086`) requires a row in
`classroom_enrollments` for that student in a posted section the caller manages.
**So the count is scoped by CURRENT enrollment, not by what exists.** A student
who has left the roster -- transferred, unenrolled by `0082`'s soft delete, or
removed through `0138`'s `classroom_remove_enrollment` -- makes their own work
invisible to the manager, and the browser reports **zero student work on an item
that has some**.

The path that produces it is ordinary rather than exotic: an item is published,
takes hand-ins, is flipped back to `published = false`, and a student leaves.
It then groups as an unpublished draft and answers "nothing attached".

A safety check that fails toward *permitting* the delete is not a safety check.
The answer is a **read-only `security definer` function** that counts inside the
database, where enrollment does not filter it -- which is the one thing on this
whole feature that genuinely earns a migration, and it earns it here rather than
in the surface.

**And the page fails CLOSED while that function is missing.** Per the repo's
degradation rule a client degrades past a missing RPC on `PGRST202` alone; the
correct degradation here is not "fall back to counting in the browser" but "mark
every row not-removable and say the safety check is unavailable on this
deployment". A fallback that under-reports student work is worse than no page.

## 6. A surplus draft is invisible to students, so this is clutter and not a leak

Worth stating because it sets the urgency, and because it was assumed the other
way. `classroom_can_read_item` (`0109`) gives a non-manager the row only when
`_classroom_item_live(published, publish_at)` holds, which is

```sql
select coalesce(p_published, false) and (p_publish_at is null or p_publish_at <= now());
```

`published = false` fails it outright. The postings policy repeats the rule
independently, and item resources, attachments, specs, rubrics and decks all
delegate to the same function. **No student can reach an unpublished item, its
files, its spec or its rubric.** A surplus draft is clutter in the Classwork
lists of the teachers who manage that section, and nothing more.

The corollary for whoever builds the surface: scoping it to
`classroom_manages_section` creates no disclosure at all, because those are
exactly the rows already on that manager's own Classwork tab.

## The corrected safety query

Replacing 0061's. **Read only.** `$1` is its `surplus` array.

```sql
-- READ ONLY. Does a candidate carry anything a delete would take with it?
-- Run as a caller who can see it all, or from a definer function: as an
-- ordinary manager, the two student columns are filtered by CURRENT enrollment
-- and can report zero for work that exists (see section 5).
select i.id,
       (select count(*) from public.classroom_postings           p where p.item_id = i.id) as postings,
       (select count(*) from public.classroom_attachments        a where a.item_id = i.id) as files,
       (select count(*) from public.classroom_responses          r where r.item_id = i.id) as responses,
       (select count(*) from public.classroom_submissions        s where s.item_id = i.id) as submissions,
       (select count(*) from public.classroom_submission_files   f
          join public.classroom_submissions s2 on s2.id = f.submission_id
         where s2.item_id = i.id)                                                          as submission_files,
       (select count(*) from public.classroom_module_approvals   m where m.item_id = i.id) as approvals,
       (select count(*) from public.classroom_instructor_responses ir where ir.item_id = i.id) as instructor_answers,
       (select count(*) from public.classroom_assignment_specs   sp where sp.item_id = i.id) as specs,
       (select count(*) from public.classroom_rubrics            b where b.item_id = i.id) as rubrics,
       (select count(*) from public.classroom_decks              d where d.item_id = i.id) as decks,
       (select count(*) from public.classroom_item_views         v where v.item_id = i.id) as views
  from public.classroom_items i
 where i.id = any ($1::uuid[]);
```

**A row is removable only when `responses`, `submissions`, `submission_files`,
`approvals` and `instructor_answers` are all zero.** `postings` must be **one or
more** or the delete is impossible (section 2). `views` is a signal to read, not
a gate (section 4). `files`, `specs`, `rubrics` and `decks` are Mr. Pina's
judgement -- they are the teacher's own work on a copy, worth looking at before
removing, and never worth removing automatically.

Removal stays what 0061 said: `POST /api/classroom/delete-content`, one id at a
time, which runs `classroom_delete_item` on the caller's own session so the
database is the boundary and sweeps the orphaned Drive blobs afterwards. It is
**not idempotent** -- a second call on the same id raises *"That item does not
exist."*, which the route returns as a 400.

## What was measured, and what was not

Everything above was read off the tree at `origin/integration` `13d1747`:
`0085` (`classroom_items`, `classroom_postings`, `_classroom_manages_item`,
`classroom_delete_item`, the readable policy), `0086` (the engine tables and
`classroom_can_review_submission`), `0090`, `0092`, `0101`, `0102`, `0105`,
`0109` (`_classroom_item_live` and the widened `classroom_can_read_item`),
`0110`, `0128`, and `src/routes/api/classroom/delete-content/+server.ts`. The
census is a mechanical sweep of `supabase/migrations/` for
`references public.classroom_items (id) on delete cascade`, counted at 18.

**NOT verified, and the list is short because nothing here is code:**

* **Nothing was run against the live Supabase project, and nothing could be.**
  Prompt 0073 established that a cloud container cannot reach it: the egress
  proxy answers `200 Connection Established` for port 5432 and then carries no
  bytes. **So the number of duplicate drafts in production is still unknown**,
  and so is whether any of them carries a submission. This entry says the query
  is unsafe; it does not say anyone has been harmed by it.
* **Neither query was executed anywhere** -- not against production, not against
  the embedded-Postgres harness. They are read and corrected by inspection of
  the migration files that define the tables and policies they name.
* No test, harness, browser pass or `svelte-check` run was taken. This bundle
  changes no code, so the baseline is untouched by construction rather than by
  measurement.

## How this came to be written

Two sessions were issued prompt 0074 within three seconds of each other and both
recorded a byte-identical ledger entry --
`claude/duplicate-drafts-production-ru7pag` at 07:17:44 UTC and
`claude/duplicate-drafts-count-wzworl` at 07:17:47 UTC, both parented on
`13d1747`. The ledger's duplicate check passed for both, correctly:
`docs/prompt-ledger/README.md` already states that it does not catch "two chats
that both write a prompt in the same minute, before either records an entry".
Nothing is broken and neither session erred.

The same gap bit this bundle's own ledger number twice over within four
minutes: it was issued 0075, verified free against every ref tip and against
`git log --all --diff-filter=A`, and collided with
`claude/red-merge-green-parents-ft3e57` -- which had been issued 0075 already
and pushed ten seconds later -- and 0076 went to
`claude/tournament-thumbs-listing-psuleu` at 08:06:56. It was renumbered to
0077 by the identical checks, with a note beside it predicting that 0077
carried the identical weakness -- and it did: 0077 had gone to the tournament
redesign at 08:11, unpushed and invisible, the third collision in an hour. It
is **0080** now, and 0080 was not derived: it was stated by the person holding
the issue list, with 0078 and 0079 reserved as a deliberate gap. **A number
verified free is a number nobody has PUSHED, not a number nobody HOLDS**, no
git command can close that distance, and the fix is the issuer saying the
number rather than a session deriving one.

The two audited 0061 independently and reached the same conclusions, which is
why this is written as corroboration rather than as one session's reading.
`wzworl` builds the surface; this session stood down from it and carries the
finding out, so it does not disappear with the branch that is discarded. It also
removed its own copy of the `0074` ledger entry, leaving `wzworl`'s as the single
authoritative one -- two branches carrying that file would collide on
`integration` the moment one of them flipped its `Status:`.

## Deferred

* **The surface itself** -- the count, the grouping, the per-row safety report,
  the one-at-a-time removal and the read-only definer function -- is
  `claude/duplicate-drafts-count-wzworl`'s, under prompt 0074.
* **`0061`'s entry is otherwise untouched.** Its two defects, its measurements,
  its mutation proof and its deferred list are all correct and are not restated
  here.
* **Whether any production row is actually at risk is unanswered** and will stay
  unanswered until somebody with SQL editor access runs the corrected query. That
  is the point of writing it down.
