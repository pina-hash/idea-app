---
title: "The count nobody has, taken through the app: duplicate drafts grouped, the oldest kept, and student work refused twice (`claude/duplicate-drafts-count-wzworl`, migration 0186)"
date: 2026-09-06
branches: [claude/duplicate-drafts-count-wzworl]
migrations: ["0186"]
subsystems: ["Classroom", "Testing"]
---

Prompt 0061 fixed the two mechanisms that made `Save draft` write a new row
instead of updating one, and ended by saying plainly that production almost
certainly holds surplus copies and that **the count is unknown**, because no
cloud session can read the database. 0073 proved that is permanent: the egress
proxy answers `200 Connection Established` for 5432 and then carries no bytes.
So the count has to arrive through the app. This is that surface.

Started from `origin/integration` at `13d1747`, working directory
`/home/user/idea-app`. Git already had a committer identity
(`Claude <noreply@anthropic.com>`), so the "Please tell me who you are" trap did
not arise. Nothing was run against the live Supabase project and no attempt was
made to reach it.

## The audit, and the three places 0061's specification did not survive the tree

0061's history entry is the specification, and it holds where it matters. Its
grouping query is reproduced verbatim inside 0186 in spirit: group
`classroom_items` by `(author_email, kind, title, body)` where
`published = false`, keep the oldest, everything after it is surplus. Three
things about it changed on contact with the schema.

### 1. `published = false` is unambiguously a DRAFT, so no `publish_at` term is needed

Checked rather than assumed. `classroom_items.published` is
`boolean not null default true` (0085), and 0109's header states the state table
in its own words: a SCHEDULED item is `published = true` with a future
`publish_at`. So there is no third state hiding inside `published = false` and
0061's predicate needs nothing added to it.

**A student cannot reach an unpublished row, and this is the answer to how
urgent this is.** `classroom_can_read_item` (0109) requires a posting AND either
`classroom_manages_section` on it or
`_classroom_item_live(published, publish_at) and classroom_is_enrolled`.
`_classroom_item_live` is `coalesce(p_published,false) and (...)`, so the
student arm is false for every draft. The `classroom_postings` policy carries
the same term, and every child table's policy delegates to
`classroom_can_read_item`. A surplus draft is therefore visible to the managers
of the sections it was saved to and to nobody else: **not to students, not to
other teachers, not to a signed-out visitor.** What the duplicates cost is a
teacher's own Classwork list being three times longer than it should be, and
somebody eventually publishing the wrong copy. Nothing a student can see is
wrong today.

### 2. POSTINGS DO NOT DISQUALIFY A ROW, and 0061's safety query reads as though they do

`_classroom_check_publish_targets` (0082) raises `Select at least one section to
publish to.` on an empty list, and `classroom_create_item` calls it before the
insert. **So every item, draft included, has at least one posting by
construction.** 0061's safety query lists `postings` beside `files`,
`student_work`, `specs`, `rubrics` and `decks` under the instruction "check what
hangs off each surplus row before deleting it" -- and read straight, that makes
every row unremovable and the whole cleanup impossible. 0186 projects the
posting count because a person wants to see "listed in 2 classes" before
pressing anything; it is never a blocker, and
`tests/classroom-duplicate-drafts.test.ts` pins that in both directions.

### 3. THE SAFETY SET IS WIDER THAN SIX, and the one it missed is the hand-in itself

0061 named six tables. **Seventeen carry a foreign key to `classroom_items`, and
every one of them is `on delete cascade`**, so a delete takes all of them:

```
classroom_postings          classroom_item_resources     classroom_item_views
classroom_attachments       classroom_assignment_specs   classroom_rubrics
classroom_responses         classroom_submissions        classroom_module_approvals
classroom_reference_specs   classroom_decks              classroom_deck_uploads
classroom_deck_ingest_jobs  classroom_content_revisions  classroom_instructor_attachments
classroom_instructor_resources  classroom_instructor_keys  classroom_instructor_responses
```

The gap that matters is **`classroom_submissions`**. 0061 checks
`classroom_responses` -- a student's saved block answers -- and not the
submission row, which carries `state`, `submitted_at`, `rubric_scores`, `score`,
`teacher_comment` and `graded_at`, and is the parent of
`classroom_submission_files`. A copy with a turned-in, graded hand-in on it and
no saved responses would have read as "carries nothing" under 0061's query.
0186 counts submissions, responses AND module approvals, and any of the three
blocks.

`classroom_content_revisions` is deliberately NOT counted, and the reason is the
`postings` mistake in its other costume: the ordinary write path mints a
revision, so every item has one and counting it would block everything.
`classroom_item_views` is not counted either -- a student having opened a draft
is impossible by the read rule above, and a view is not work.

## A5: the migration was NECESSARY, and the reason is not convenience

The prompt asked to prefer no migration, and the tree refused that. Every table
0186 counts carries `grant select ... to authenticated`, so a browser genuinely
CAN read them. **The counts it would get are wrong, and wrong in the direction
that deletes a student's work.**

`classroom_submissions` and `classroom_responses` are readable under "own row or
reviewer", and reviewer is `classroom_can_review_submission(item_id,
student_email)`:

```sql
select exists (
    select 1
    from public.classroom_postings pg
    join public.classroom_enrollments e on e.section_id = pg.section_id
    where pg.item_id = p_item_id
        and e.student_email = p_student_email
        and public.classroom_manages_section(pg.section_id)
);
```

**A hand-in whose author holds no enrollment row satisfies neither arm**, so it
is invisible to the teacher through RLS. Work arriving with no enrollment behind
it is not exotic here: `splitRoster`'s off-roster list (0138) exists to report
exactly it, and CLAUDE.md already describes an off-roster email as "work arrived
with no enrollment behind it". A roster import that changes an address produces
the same thing.

So a browser counting `classroom_submissions` for such an item reads **zero**,
the surface calls the row a surplus copy, and the delete cascades the hand-in
and its files away with no undo. That is 0061's own trap -- "anything with
student work attached is not a surplus copy whatever it looks like" -- arriving
through the read policy instead of through the grouping.

**Measured, not argued.** In `tests/db/duplicate-drafts-count.test.ts`, with a
submission by a student who is not on the roster:

| the same row, counted two ways | answer |
| --- | --- |
| `select count(*) from classroom_submissions` as the connection owner | **1** |
| the identical count as the TEACHER, through RLS (what a browser gets) | **0** |
| `classroom_duplicate_drafts`'s verdict for that copy | **not removable** |

Zero rows readable, one row blocking. A count taken the readable way would have
said "safe to remove".

## A4: the predicate, and why it creates no reach

`_classroom_manages_item(id)` -- the caller manages **every** section the item is
posted to. That is exactly the gate `classroom_delete_item` already applies, and
it is strictly NARROWER than `classroom_can_read_item`, which admits a manager
of any ONE of them. So this page shows a caller only rows they could already
read on the item page and could already delete from it. **No disclosure is
created**, which was the prompt's worry, and the direction of the inequality is
what settles it.

It is deliberately not scoped to `author_email = caller`. A draft is not private
to whoever typed it -- the Classwork list already shows every draft of a section
to that section's managers -- and an author scope would leave copies belonging to
a teacher who has left with nobody able to see them.

Proven in the harness in both directions: another teacher sees `0` groups of the
first teacher's drafts, and the same call answers `1` for their own once they
have copies. A CO-POSTED draft (two sections, two different managers) is
invisible to **both**, because neither manages every posting, which is correct:
neither could delete it either.

## A3: the delete path, unchanged, with a gate in front of it

`POST /api/classroom/delete-content` takes `{ id: uuid }`, 401s without a
session, 400s a non-uuid, and calls `classroom_delete_item` on the CALLER'S OWN
client. The RPC raises `That item does not exist.` for an unknown id, so it is
**not idempotent** -- a second press of the same removal answers 400, which is
why this surface removes the row from the list on success rather than leaving a
control that would fail on a second press. It sweeps the Drive blobs the cascade
orphaned, best-effort.

It asks nothing about student work, correctly: it is also the delete behind the
item page, where a teacher deleting an assignment with hand-ins knows what they
are deleting. **This surface makes a different promise** -- it calls rows surplus
copies and offers to sweep them -- so the safety is re-asked in
`src/routes/classroom/[sectionId]/duplicates/remove/+server.ts`, which re-runs
0186, refuses anything that is not a removable surplus copy of this section, and
then forwards to `delete-content` through SvelteKit's own `fetch`. **There is no
second deletion path**: `classroom_delete_item` is still the only thing that
deletes.

The guard refuses four ways and one of them is a silence: another teacher's
copy, a row that is not a duplicate, and a row that does not exist all answer
with the **same sentence**, so an id cannot be probed. The copy being KEPT is
refused by name.

## What an instructor actually sees

`/classroom/<section>/duplicates`, for a section they manage. A summary line, a
sentence explaining what counts as a copy and that no student can see any of it,
then one card per group: the title, a kind chip, how many copies, who wrote it,
when the oldest was written, and a green line saying which copy is being kept.
Under it the surplus copies, each with its date and what it is carrying
("listed in 2 classes, 1 attached file, 1 rubric"), each with a `Remove this
copy` button that arms a confirm naming exactly what would go.

**Copies carrying student work are in their own block, headed `Not removable`,
with no control at all and a sentence in its place** naming what is on them
("A student has work on this copy (1 hand-in, 1 saved answer). Removing it would
take that work with it..."). That is 0061's trap and it is the one thing this
surface must not get wrong.

A class with nothing to clean up gets a written statement that it was looked at,
never a blank pane. A deployment without 0186 applied says the count cannot be
taken here and that nothing is missing from the class, only from the page.

## The removal is one row at a time, and that is a decision

No bulk button, no checkboxes, no Select all. A teacher's writing is not a
cache, and the whole reason these rows exist is a client that did something
repeatedly without being asked. `tests/classroom-duplicate-drafts.test.ts`
asserts the absence with the arm controls beside it as the positive control:
**4 arm controls and 0 checkboxes** on a fixture with two groups.

## The controls

### The three the prompt required, all paired

Every mutation was made on a `cp` copy and restored **from that copy**, md5
verified before and after. `git checkout --` was never run.

| # | what was opened | md5 in/out | assertions red |
| --- | --- | --- | --- |
| 1 | the grouping: `body` dropped from the group key | `de9b45...77c3` | **4 of 24** |
| 2 | the safety clause: `student_work` forced to 0 in 0186 | `de9b45...77c3` | **4 of 24** |
| 3 | the visibility predicate: `_classroom_manages_item(i.id)` -> `true` | `de9b45...77c3` | **4 of 24** |

Each reddened a **disjoint** set, so the three rules are independently pinned
rather than one thing measured three times:

* (1) the grouping tests and the same-title-different-body control;
* (2) the four student-work tests, including the "0 readable, 1 blocking" pair;
* (3) the four cross-teacher and section-filter tests.

### The fourth, which is the one B2 actually asks for

The guard is markup-independent, so it was mutated in the ROUTE:
`if (!copyIsRemovable(copy))` -> `if (false && !copyIsRemovable(copy))`, on
`src/routes/classroom/[sectionId]/duplicates/remove/+server.ts`,
md5 `e8dc5f6468e6679f7b4ac098bae04f7c` in and out.

**Fixed: the removal answers 400 `A student has work on that copy` and the row
is still in the table. Mutated: 2 of 7 red, and the row is gone.** The
measurement is the row count, not the message.

### The fifth: the browser spec is not vacuous

The harness fixture's blocked copy was flipped to `removable: true`
(`0943a6381d227666b83e0f21c7e2e73b` in and out).
`npm run verify:browser -- --route duplicate-drafts` went from **0 outside
threshold to 6**, and back to 0 on the restored tree.

## Verification

* **`npx svelte-check`: 0 errors, 37 warnings**, breakdown **31
  `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`**, re-derived after `npx svelte-kit sync` with the
  two `PUBLIC_SUPABASE_*` placeholders exported. Identical to the baseline
  measured on `13d1747` before any edit.
* **`npm run check`: 3006 files, 0 errors, 37 warnings, 20 files with
  problems.**
* **CLAUDE.md's phantom-error figure has drifted and I could not correct it.**
  The rule says a checkout with no `.env` reports **11** phantom errors across
  eight files. Measured on this tree: **13**, across ten
  (`src/hooks.server.ts`, `src/lib/profile.ts`,
  `src/lib/server/foundry-bundle.ts`, `src/lib/server/push.ts`,
  `src/routes/+layout.ts`, `src/routes/api/feedback/+server.ts`,
  `src/routes/api/greenline-track-publish/+server.ts`,
  `src/routes/maps/+page.svelte`, `src/routes/maps/edit/shelf/+page.svelte`,
  `src/routes/vanguard/+server.ts`). None of them is a file this bundle added,
  and exporting the placeholders returns the count to 0 exactly as the rule
  says. `CLAUDE.md` is outside this bundle's ownership, so the line was not
  edited; **the next session that owns it should change 11 to 13.** The
  0-errors/37-warnings baseline itself did not move, which is the number that
  matters.
* **`npm run verify:browser -- --route duplicate-drafts`: 4 route/width runs,
  46 measurements, 0 outside threshold**, 15.5s wall clock, at **375 and 1440**.
  * Tap targets: `Remove this copy` smallest **182.1x44**, 0 of 3 under 44px;
    `Reset the fixture` **190.7x44**. No density exemption is claimed.
  * Contrast: the summary line **14.66:1**, the not-removable reason
    **6.84:1**, the kept-copy sentence **7.91:1**, the empty-state sentence
    **7.27:1**. All against the real rendered ground.
  * 0px horizontal overflow at both widths. 0 console errors.
  * **PAINT IS NOT INTERACTIVITY, and the attempt counts are the report.** Both
    clicks are retried against their own effect. Measured: **1 attempt** for
    each of the arm and the confirm, at both widths, against "app rendered" of
    **805ms (375)** and **923ms (923ms at 1440)**. One attempt means hydration
    had landed before the click fired on this machine; the retry is what makes
    that a measurement rather than a hope.
* **The full suite (`npm test`, `--no-file-parallelism`): 293 files, 5979
  tests, 3 failed, 291 files passed**, 248.1s, run at **01:11 to 01:16
  America/Los_Angeles on 2026-09-06** on the final tree.
  * An earlier run, taken before the measured README region was regenerated,
    reported **5 failed of 5979**. **Four of those five were ALREADY RED at the
    branch point**, measured in a separate `git worktree` at
    `origin/integration` `13d1747` rather than assumed: two in
    `tests/derived-numbers.test.ts` (the measured counts region naming fewer
    specs than the tree holds -- **eleven specs were unmeasured before this
    bundle**, three of them since before it) and the two `gauntlet-doc`
    assertions the prompt names, which prompt 0067 owns.
  * **Regenerating the measured region cleared both `derived-numbers`
    failures**, which is this bundle paying a debt it did not create: `covered`
    is now 118 against `specs` 118, so the measured half is measured against
    THIS tree.
  * **What remains is the two `gauntlet-doc` assertions (prompt 0067's) and one
    that is this bundle's**, explained immediately below.
* `npm run verify:counts`: static region **116 -> 118** specs, **57 -> 58**
  routes, **86 -> 87** `/dev` pages, **232 -> 236** runs. Exactly two specs, one
  route and one page, which is what this bundle added.
* **`npm run verify:readme`: a full pass over all 118 specs -- 236 route/width
  runs, 3456 measurements, 2 outside threshold, 575.8s wall clock**, on commit
  `f4c30ad` with a clean tree. `covered` **118** against `specs` **118**, so
  the two rows agree and the measured half speaks for this tree. Its selftest
  reports **70 controls (36 negative, 34 positive), 0 instrument failures**.
  The two outside threshold are the standing `/dev/notebook` `tap-reach`
  toolbar rows at 375 and 1440 (decision 12, with its owner), which this bundle
  does not touch and which 0061 reported in the same words.
* Mutation proof: five separate ones, above, each restored by `cp` and md5.

### The one new failure, why it is not a defect in this file, and what closes it

`tests/db/migration-0177-tombstone.test.ts` asserts the migration series is
contiguous. On this branch it reports a hole at **0185**.

**The hole is `origin/integration` lagging `origin/main`, not a mis-numbered
file.** `0185_bucket_limits_under_the_global.sql` landed on `origin/main`
(`eec8151`) and `origin/main` is NOT contained in `origin/integration`, whose
highest migration is 0184. Taken across every ref and against
`git log --all --diff-filter=A`, **0186 is the next free number**, and numbering
this file 0185 would put two different files under one number, one of which is
already on `main`.

**Measured rather than reasoned:** `origin/main`'s own 0185 was copied into the
tree, the test was re-run, and it **passed (4 of 4)**; the file was then removed
again. So the hole closes the moment `integration` takes `main`'s 0185, with no
change to anything here.

The practical consequence worth naming: the integrate workflow merges a
`claude/**` branch only when CI is green on its tip, and CI is already red on
`origin/integration` itself from the four pre-existing failures. **So this
branch will stand rather than auto-merge**, which is a signal and not a
leftover.

## The migration: 0186, read only

`supabase/migrations/0186_classroom_duplicate_drafts.sql`. It creates two
functions and nothing else -- no table, no policy, no table grant, no trigger,
no column, no backfill. It is declared `stable`, which the suite asserts from
`pg_proc.provolatile`, and the suite also measures that a call leaves the
`classroom_items` row count byte-identical.

**Cold apply steps, for whoever pastes it:**

1. It is the LOWEST unapplied file only once `main`'s 0185 is applied; apply
   0185 first, then this. `node tools/apply-migration.mjs 186` will refuse it
   otherwise, correctly.
2. It carries no destructive DDL, so `tools/apply-migration.mjs` is available
   for it rather than a hand paste.
3. Its self-check asserts shape and privilege rather than counting rows it
   changed, because it changes none: exactly one
   `classroom_duplicate_drafts`, `anon` cannot execute it, `authenticated` can,
   and `authenticated` cannot execute the private counter. A failure of any of
   those raises and rolls the file back.
4. It re-applies cleanly, which the suite exercises by reading the file off
   disk and running it a second time against an already-migrated database.
5. **It revokes for itself.** 0137 is a one-time repair and does not cover a
   function created after it, so the narrowing NAMES the roles
   (`from public, anon, authenticated, service_role`) rather than relying on
   `from public`, which under the hosted project's default privileges would
   leave `anon` holding a direct grant. The chain in
   `tests/db/duplicate-drafts-count.test.ts` puts 0137 BEFORE 0186 for exactly
   this reason, so the ACL assertions mean "0186 closed itself" and not "0137
   happened to catch it".

**What undoes it:** `drop function if exists
public.classroom_duplicate_drafts(uuid);` and, if wanted,
`drop function if exists public._classroom_item_attached_counts(uuid);`. The
page then degrades to its stated "cannot be checked here" state through the
`PGRST202` rung, which is why that rung keys on the code alone.

## Where the pure layer lives, and why it is not a second file

The predicate, the blocked sentence, the cost list and the summary line are
exported from `DuplicateDrafts.svelte`'s own `<script module>` block rather than
from a `duplicate-drafts.ts` beside it. Two reasons, and the second is the real
one:

* it keeps `$lib/classroom` self-contained -- a component in `$lib` importing
  its own types out of `src/routes` is a dependency pointing the wrong way; and
* **`src/lib/classroom/duplicate-drafts.ts` is not a file this bundle owns.**
  The grant names `DuplicateDrafts.svelte` and the route tree, and a new module
  in `$lib/classroom` is neither. It was written there first, measured, and
  moved.

`vitest`'s `node` project imports those exports off the `.svelte` file directly;
that was probed against a throwaway component before the design was committed
rather than assumed.

## NOT verified

* **Nothing was run against the live Supabase project, and no attempt was
  made.** The number of duplicate drafts actually sitting in `ideabosco.com`
  right now is still **unknown to this session**. What changed is that it is no
  longer unknown to Mr. Pina: it is one page load, once 0186 is applied.
* **0186 has not been applied anywhere.** It has been applied to real embedded
  Postgres, over the real migration chain, unmodified -- 31 assertions across
  two files -- and to no production database.
* **No signed-in production surface was driven.** `npm run verify:browser`
  covers `/dev` routes only; `/classroom/<section>/duplicates` needs a Bosco
  Tech Google session no automated run holds. **The real page's own load
  function was not executed**: the DB tests drive the removal route handler and
  the RPC, not `+page.server.ts`.
* **The Drive sweep was not exercised.** `delete-content` calls
  `deleteDriveFile` only when `driveConfigured()`, which is false in the
  harness, so the cascade was measured and the blob removal was not.
* **`prefers-reduced-motion` is `no-preference`** in the browser harness and it
  blocks non-loopback requests, so text is measured in the fallback stack.
* The `--selftest` instrument controls were not re-derived by hand; the full
  run reports **70 controls (36 negative, 34 positive), 0 instrument
  failures**, which is the harness checking itself rather than this session
  checking it.

## Deferred, with reasons

* **THE PAGE HAS NO LINK TO IT, AND THAT IS THE ONE THING A NEXT SESSION MUST
  FIX.** The prompt granted "a new panel entry ONLY" in
  `src/lib/classroom/InstructorTools.svelte`. **That file does not exist** --
  checked against the tree, which wins. The section's tabs come from
  `sectionTabs()` in `src/lib/classroom/nav.ts`, whose `SectionTabId`,
  `locateClassroom`, `activeTab` and `navKeepsComposer` would all have to move
  together, and none of them is owned here. Rather than invent a nav change
  across four unowned functions, nothing was wired. **The page is reachable
  only by typing the URL today.** The one-line version, for whoever owns
  `nav.ts`:

  ```ts
  // in SectionTabId:            | 'duplicates'
  // in sectionTabs():
  { id: 'duplicates', label: 'Duplicates', href: `${basePath}/${sectionId}/duplicates`, manageOnly: true }
  // in locateClassroom():       if (rest[1] === 'duplicates') return { place: 'duplicates', sectionId, itemId: null };
  // in activeTab():             if (loc.place === 'duplicates') return 'duplicates';
  ```

  `navKeepsComposer` needs no change -- leaving the class page for this one
  SHOULD unmount the composer and warn, exactly as People and Grades do.
* **The count is per SECTION, not per school.** `classroom_duplicate_drafts`
  takes `p_section_id default null`, and null already means "every section the
  caller manages every posting of" -- so a school-wide figure for an admin is
  one call away and has no surface. It was not built because the prompt's
  surface is a section page and a school-wide console is its own decision about
  who reads whose drafts.
* **`classroom_content_revisions` is not offered as a signal.** A surplus copy's
  revision chain is the record of its own accidental creation, which might be
  worth showing to date a burst of copies. It would need a projection 0186 does
  not make.
* **The composer still closes on a draft save.**
  `src/routes/classroom/[sectionId]/+layout.svelte`'s `composerSaved` is what
  0061 named and it is still outside every bundle's ownership so far.

## Changelog

**No `classroom-updates.json` entry was appended, deliberately, and this is the
statement the standing directive asks for rather than silence.** The log is
student-facing and nothing here changes what a student sees: an unpublished item
is unreachable by a student (see the audit above), the new page is refused to
anyone who does not manage the section, and removing a surplus draft removes
something no student could ever have opened. If the cleanup ever removes
something a student CAN see, that is a different bundle and it needs an entry.
