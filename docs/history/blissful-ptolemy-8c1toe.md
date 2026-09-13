---
title: "Ledger 0206: four IdeaCAD decisions that lived in a chat where the status tool could not see them, and the `Build:` field that is why they were invisible (`claude/blissful-ptolemy-8c1toe`, no migration)"
date: 2026-09-13
branches: [claude/blissful-ptolemy-8c1toe]
migrations: []
subsystems: ["IdeaCAD", "Decisions", "Documentation", "Classroom", "Testing"]
---

A living scope document for IdeaCAD was written on 2026-09-12 and edited in a
router chat ever since. It carries Mr. Pina's own words on decision 24 and on
four questions nobody had filed, and it is **not in this repository** -- which
is the whole reason those four were never asked until 2026-09-13. This bundle
files them. It writes no SQL, no source and no test.

## WHAT WAS ACTUALLY DONE

**Four decision entries, 27 through 30, each recorded as ANSWERED rather than
open**, with Mr. Pina's reasoning preserved in his own words and, for each, a
measured statement of what the shipped schema already supports and what is left
to build. None of the four is built.

**AND THE SMALL MECHANICAL THING THAT IS ACTUALLY THE POINT OF THE BUNDLE: ALL
FOUR CARRY A `Build:` FIELD.** The first draft of all four did not, and that
draft would have reproduced, exactly, the failure that put them in a chat
document for a month.

`tools/idea-status.py` has two filters over the decision register.
`owed_decisions` is `status == "open"` -- his to answer. `unbuilt_decisions`
(lines 187-190) is:

```python
    return [r for r in rows if r["build"] == "open" and r["status"] != "open"]
```

It is keyed on `Build:` **alone** and never on `Status:`, and the comment above
it in `decisions()` says why, from the day it was written: an answered entry
reads `Status: decided`, so a filter on `Status == open` cannot see it, "which
is how a decision Mr. Pina had already answered stayed invisible to every lane's
status read". Two entries were in that hole on 2026-09-12 (04 and 21).

So an entry written `Status: ANSWERED` with **no `Build:` line at all** parses
with `build == ""`, matches neither filter, and appears in **no list the status
tool prints**. It would sit in `docs/decisions/entries/`, correct, committed,
and invisible -- the same outcome as sitting in a chat, reached by a different
route. Caught by reading the parser before writing the entries rather than
after; verified afterwards by running `parse_fields` and both filters over the
working tree:

```
   27  status='answered'   build='open'
   28  status='answered'   build='open'
   29  status='answered'   build='open'
   30  status='answered'   build='open'

unbuilt (a lane's to build): ['04', '21', '27', '28', '29', '30']
```

The four appear. Before the `Build:` lines were added they appeared in neither
list, which was confirmed the same way.

One other parser detail, since it is invisible in a rendered file: `first_word`
takes `split()[0]`, so a `Status:` line opening `**ANSWERED` parses as
`'**answered'`. The bold was moved off the first word in all four. The bold
markers were then re-balanced and asserted even per file.

## THE FOUR DECISIONS, AND THE MEASUREMENT EACH RESTS ON

Everything below was read off `origin/integration` at `78516fa2`, which is this
branch's own branch point. **Nothing was taken from the scope document's prose**;
the document's entire failure mode was prose outrunning the tree, and its own
working notes say to trust measurements over prose.

### 27 -- a shared editor gets full history and undo, attributed per person

His answer: yes, and the history is attributed per person the way Google Docs
does it. Anyone with access sees all of it and each entry is clearly marked as
that person's.

**This needs no migration, and that was verified in both halves rather than
assumed from the prompt.** `0209_ideacad_history.sql` line 184 declares
`actor text not null` inside the `create table` at lines 176-187, and
`ideacad_concept_history` projects it at line 551. **One correction to the shape
anyone wiring a client will care about:** that function is `returns jsonb`
(line 523), not `returns table` -- the rows arrive as a `jsonb_agg` under the
key `rows`, beside `conceptId`, `total` and `newestSeq`.

The stronger property, which matters more than the column existing: **no write
path takes an actor parameter.** All three writers stamp it from the session --
the origin trigger (lines 309-322), the one-time backfill (lines 354-357,
literal `'migration:0209'`), and the only client-reachable one,
`ideacad_apply_actions` (lines 464-476, `public.current_user_email()`). So
attribution is a property of the signatures, not a check that could be got
wrong. And the read gate is `_ideacad_can_read_document` (lines 540-542), which
is owner, viewer, editor or manager, with **no per-actor filter in the function
at all** -- so "anyone with access can view ALL of the history" is already
literally what the gate does.

**LEDGER 0196 IS BUILDING THIS TIMELINE AND WAS NEVER TOLD THE DECISION
EXISTED.** It was issued the same day, ran in parallel, and has pushed to
`claude/gracious-hopper-a46lec`. Read off its branch, without editing a byte of
it: `src/lib/ideacad/ui/HistoryTimeline.svelte` **line 178** renders

```svelte
{#if entry.actor}<span class="who">{entry.actor}</span>{/if}
```

and `ui/timeline.ts` line 316 types the row's `actor`. It also closes the wiring
gap measured here on `integration`, where `transports.ts` supplies no history
factory at all: its ledger says 0209's RPCs otherwise "have no caller at all on
the real page".

**The answer and the build agree by luck, not by instruction, and that is worth
saying out loud.** 0196 rendered the actor because the column was there. Had it
decided the other way -- shown the actor only when it differed from the viewer,
or omitted it as somebody else's business -- nothing anywhere would have caught
it, because there was no decision to check against. Decision 27 is now that
check. Two of its assumptions are recorded in the entry as load-bearing rather
than incidental: the actor renders unconditionally including on your own rows,
and the nullable client type over a `not null` column is defensive rendering
rather than licence to ship an unattributed row.

### 28 -- a student sees their own history in full

His answer: yes. Recorded as its own entry rather than folded into 27, because
they could have differed: "full history to a collaborator, summary to yourself"
is incoherent, but the reverse is not.

"In full" was checked against the schema and is true in the strong sense.
Every concept has a `seq 0` origin row, from a trigger for new ones and from a
backfill for the ones that predated 0209. **Nothing prunes**, deliberately --
0209 lines 40-42 say so in its own words, including his instruction ("He said as
far back as possible"). The only cap is on one PAGE of a read
(`least(greatest(coalesce(p_limit, 2000), 1), 5000)`, line 532), and the shipped
client (`history.ts` lines 557-573, `readWholeHistory`) pages until `newestSeq`,
so a surface that showed one page and stopped would be narrowing this decision
by accident.

**The cost is measured, and the estimate it replaces is the one a reader of the
scope document has in their head.** That document and its chat guessed 200 or
400 bytes an action. The real figure is **220.5 bytes per action** -- heap plus
both indexes plus page overhead, taken as a `pg_total_relation_size` delta
rather than `pg_column_size`, which leaves out the 24-byte heap header and the
index entirely. Recorded at `docs/history/inspiring-archimedes-0n4o81.md` line
44 and re-asserted every suite run by `tests/db/ideacad-history-row-size.test.ts`
against `IDEACAD_ACTION_BUDGET_BYTES = 400` (`history.ts` line 498). **The
design sits at 55% of its own budget**, so the sizing case prices at about
106 MB rather than 192 MB, and a retention policy would buy nothing while
costing a student their record.

### 29 -- an owner leaving a section archives the work, and this one needs a migration

His answer: the document and all its work is archived, not deleted, and stays
accessible to the admin instructor; an instructor may share an archived document
with a class and those students get access too. **His reason is recorded because
it is the whole argument**: he regularly brings up past student work to show
current students as reference, and work from students who have since left is
exactly what he wants to be able to show.

**Measuring what exists today turned up a live gap that is exactly the loss his
reason rules out, arriving silently.**

`ideacad_documents` has six columns and not one is a lifecycle flag -- the
`create` at `0201` line 14 is the only DDL that ever touches its columns
(`grep -rn "alter table public.ideacad_documents"` returns two lines, both in
0201, one a FK and one enabling RLS). `deleted_at` exists on `ideacad_concepts`
and not on the document, so the soft-delete idiom this schema already uses is
available one level down and absent at the level the decision is about.

The instructor's only listing surface is `ideacad_roster` (`0201` line 34), and
it **drives off the enrollment**: the document is the LEFT side of a left join
off `classroom_enrollments`. Meanwhile `classroom_remove_enrollment` (0138) is a
**hard delete** whose refusal counts exactly four kinds of work -- responses,
submissions, module approvals and notebook entries (lines 419-440) -- before
running `delete from public.classroom_enrollments` at line 458. **IdeaCAD is
counted by nothing.** 0138 predates 0201 by sixty-three migrations and no later
file widens that census; of the four migrations that name the function, none
mentions `ideacad`.

**So today a student whose only work on an assignment is a finished IdeaCAD part
can be removed outright, the refusal will not fire, and their document survives
with nothing able to list it** -- because the roster has no enrollment row left
to drive off. The bytes stay; the teacher loses the surface. Reported, not
fixed: `classroom_remove_enrollment` is not this bundle's file.

Two smaller findings from the same pass, recorded in the entry so a builder does
not rediscover them. **A grant outlives its grantee's enrollment**: `ce.active`
is checked at share time (`0205` lines 710-719) and by none of
`_ideacad_document_role`, `_ideacad_can_read_document` or
`_ideacad_can_write_document`, which never consult `classroom_enrollments` at
all. And **a departed owner's held parts are never released**, since the only
things that free a hold are the ten-minute read-time window, a takeover, or
`ideacad_assign_part`, which is the owner's.

The entry names the build in four separable pieces and says which is smallest
and most valuable first: **widening 0138's census so the removal refuses with a
count**, which closes the silent-loss gap and needs no new state at all.

### 30 -- an assembly is owned by the person who created it

His answer, in his terms: the creator owns it; team ownership is fair in
principle but members hold different responsibilities, so they hold different
responsibilities on the assembly; there is a manager role held by a person the
team agrees to; permissions are granular, with different members getting
different access and different information; and ownership is transferable.

**The structural fact to get straight first is that there is no assembly table**
-- `0207` lines 38-39 say "The document IS the assembly" -- so the whole answer
is about the `ideacad_documents` row, and a reader looking for an owner column on
`ideacad_parts` will find only `held_by`, the transient checkout holder.

What is **already true**: ownership by the creator, by construction. The owner is
`ideacad_documents.student_email`, written once by `ideacad_open_document`'s
`on conflict do nothing` insert and **never updated by any code path in the
repository** -- `grep -rn "set student_email"` over the whole tree returns one
hit and it is `classroom_update_enrollment`, a different table. Checkout is also
built and applied, which is the half that matters day to day.

What **does not exist**, each needing new columns:

- **A manager role.** And the name is a trap: `manager` already means the teacher
  of record in this subsystem (`_ideacad_manages_document`, and the literal
  `'manager'` at `0205` line 846), which 0205's own header calls out at lines
  265-268. A student manager has no representation, and calling one `manager`
  would be the most confusing possible choice.
- **Granular permissions**, whose two halves are very different sizes. Different
  *access* is a third role or a per-part grant. Different *information* means two
  members opening one document get different payloads, which is a projection
  decision on every read RPC -- and it **collides with decisions 27 and 28**, since
  a history "anyone with access can view ALL of" is not obviously compatible with
  members meant to see different things. Recorded as unresolved and his to settle.
- **Transferable ownership**, where one constraint blocks the obvious
  implementation: `unique(item_id, student_email)` on `ideacad_documents`. A
  transfer to a classmate who has already opened the same assignment is a unique
  violation, and on a team assembly that is the normal case, not an edge one. It
  is not one `update`, and it is the part most likely to be underestimated.

## WHAT WAS VERIFIED

- **`svelte-check`: 0 errors, 37 warnings in 20 files**, breakdown
  **31 `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`** -- the CLAUDE.md baseline exactly, on all three
  numbers and on the mix. Re-derived rather than trusted: `PUBLIC_SUPABASE_URL`
  and `PUBLIC_SUPABASE_ANON_KEY` exported to placeholders BEFORE
  `npx svelte-kit sync`, per the missing-`.env` phantom-error rule, then read off
  the tool's own summary line.
- **The decision parser**, run over the working tree, in both directions: all
  four entries absent from every list before the `Build:` lines, all four in
  `unbuilt_decisions` after.
- **Full suite: 8672 passed, 1 failed, 457 files.** The failure is **not this
  bundle's** and is described below.
- **`npm ci` then `npx svelte-kit sync`** was needed before anything ran, which is
  the documented fresh-checkout trap; without the sync vitest dies in dependency
  optimisation with a misleading rolldown/tsconfig error.

### THE SUITE IS RED ON `integration`, AND `npm test` EXITED 0 WHILE IT WAS

```
 Test Files  1 failed | 456 passed (457)
      Tests  1 failed | 8672 passed (8673)
```

`tests/db/migrations-applied-record.test.ts` > "has a record for every migration
from 0193 onward, and no gaps" fails at line 243: the recorded set runs 0193
through **0210** and the wanted set runs through **0211**. `docs/migrations-applied/`
has no `0211-*` file. Migration `0211_ideacad_realtime_policy.sql` landed with
ledger 0203; its applied record did not.

**This is pre-existing and untouched by this bundle** -- the working tree holds
four new untracked files under `docs/decisions/entries/` and nothing else, and
this bundle changed no file the test reads.

**It is also not this bundle's to fix**, which is a rule and not a preference.
`docs/migrations-applied/README.md` says a record is written either by
`tools/apply-migration.mjs` from a transaction it watched commit, or by
`tools/record-applied.mjs` from **the report of the person who pasted the
migration by hand**. No cloud session can reach production, so the second is the
only available route and it rests on Mr. Pina's report. Writing the file from
this session would be asserting an apply nobody here observed, into the one
directory whose entire premise is that nothing in it is a plan.

**And it is worth noting the exit code lied.** `npm test` returned 0 with a
clean assertion failure in the `node` project -- exactly the trap
`tools/run-tests.mjs` documents in its own header and that ledger 0199 measured.
Every count in this bundle was read off the summary line.

## THE TWO STRAYS THIS BUNDLE WAS ASKED TO RECORD, AND ONE OF THEM IS ALREADY FIXED

**1. Commit `c44fb0e9` carries GitHub's default template subject. CONFIRMED
LIVE.**

```
c44fb0e99511422f22cc2090dccad8db2dd1e75d
  date:   2026-09-11 07:52:12 -0700
  author: mrpina-dev <apina@boscotech.edu>
  subj:   Update fmt.Println message from 'Hello' to 'Goodbye'
```

It adds `docs/prompts/0145-ideacad.md`, 837 lines, and has nothing to do with
Go. It is contained in **both** `origin/main` and `origin/integration`. It
matters because commit subjects are not private in this repository: the site
changelog and every page's version are generated from git history
(`virtual:site-versions`), and the first line of every commit shows up on `/`,
where students see it. Nothing was done about it here -- rewriting history on
either of those branches is not a thing a lane does, and the honest remedy is a
decision about whether the changelog generator should filter a subject like this
one, which is a different bundle.

**2. `tools/browser-verify/routes/presence-presence-off.mjs` -- THE FLAKE WAS
REAL AND IT IS ALREADY FIXED. The prompt's description of it is one day stale.**

The prompt said the roster renders 300-700ms after load and "the spec has no
wait". The first half is exactly right and is now quoted in the file itself. The
second half was true of the ORIGINAL spec (`3423f677`, 2026-09-11) -- checked,
and it contained no `prepare` and no `waitFor` -- and stopped being true on
2026-09-12, when `cdbabb08` added a 30-line header and a predicate:

```js
	prepare: [
		{
			waitFor: `() => document.querySelectorAll('.roster-row').length === 5`,
			label: 'the roster has loaded (5 rows)'
		}
	],
```

That commit is on `main` and on `integration`. Its own comment gives the
reasoning the fix rests on, and it is worth keeping: a longer `settleMs` is the
wrong fix because a fixed timeout measures an empty page the day the payload
gets slower and "reports honest zeros about a surface that had not finished
loading", and the predicate waits for **five** rows rather than one because a
predicate satisfied by the first row would be satisfied by a partial render.

Recorded here anyway, as asked, so it stops living in a transcript -- but
recorded as **closed**, because writing down a live defect that is not live is
how the next reader spends an afternoon on a file that is already correct.

## WHAT WAS NOT VERIFIED, AND WHAT IS NOT DONE

- **Nothing against production.** No `.env`, `DEPLOY_PROBE_URL` unset,
  `IDEA_MIGRATION_URL` unset. `node tools/deploy-probe.mjs --ref origin/integration`
  prints "DEPLOY_PROBE_URL is not set, so production's applied set cannot be read.
  This is 'cannot confirm', never 'applied'." **So this bundle reports no
  production version string**: it cannot read one, and "cannot say" is never a
  pass. What can be said from the repository is that the chain on `integration`
  ends at **0211** and `tools/migration-claims.mjs` reports highest landed 0211,
  next free 0212.
- **No browser pass**, as instructed.
- **`docs/IDEACAD.md` WAS NOT WRITTEN, AND THAT IS THE ONE THING THIS BUNDLE
  OWED AND DID NOT DELIVER.** `IDEACAD_SCOPE.md` was to be uploaded and it never
  arrived in the container; `find / -iname 'IDEACAD_SCOPE*'` returns nothing and
  the scratchpad is empty. The document carries Mr. Pina's own words on decision
  24 and they exist in no other place, so there is nothing in this repository or
  anywhere reachable from it to reconstruct them from. **Writing the file anyway
  would have meant inventing the quotations the prompt exists to preserve**, which
  is the one failure mode worse than not landing it. Everything that was to be
  brought current against the tree WAS measured and is recorded above and in the
  four entries, so the landing is now a merge of known text with known
  corrections rather than a fresh investigation.

## THE MIGRATION RANGE, AND THE NUMBERING

`tools/migration-claims.mjs` reports highest landed **0211**, next free 0212, and
two claimed-not-landed numbers, **0190 and 0191**. Those are not pending work:
ledger 0092 says in its own words "0190 is unclaimed and stays free" and 0093 is
the same shape for 0191. They are permanent holes from two bundles that declined
their migration, and the tool attributes an in-flight claim to whatever branch is
checked out, which is why they came back labelled with this one. **This bundle
carries no migration and claims no number.**

Ledger 0204 has not landed -- there is no `docs/prompt-ledger/entries/0204-*` on
`integration` or on `main` -- so the range is non-empty and holds `0211`, which
the prompt permits and which ledger 0203 delivered. Nothing above 0211 exists.
No other migration is present, so there is no stop.

## DUPLICATE CHECK FOR 0206

Three ways, all clear, all run before any work:

1. **Ledger files on both long-lived refs.** `git ls-tree -r --name-only` over
   `docs/prompt-ledger/entries/` on `origin/integration` and `origin/main`: the
   entries run to 0203 and there is no 0204-0209 of any kind.
2. **Every remote ref.** A scan of all 50-odd `refs/remotes/origin/*` for a file
   matching `entries/0206-` returns nothing on any branch.
3. **`git log --all --grep=0206`.** Four commits match and none is a ledger:
   the substantive one is `7ab0e5a3`, "0206: replace 0202's ideacad grant check
   so the subsystem can grow", which is **migration** `0206_ideacad_grant_guard.sql`
   from ledger 0181. The two numbering spaces collide at 0206 and that is the
   only reason the grep is not empty.

Also checked at branch time: `git fetch --unshallow origin` succeeded (the clone
was shallow), `git fetch origin integration` succeeded, and the committer
identity is `Claude <noreply@anthropic.com>`, which matches the identity on the
integration branch's own recent non-bot commits.
