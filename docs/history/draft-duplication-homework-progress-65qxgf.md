---
title: "Save draft stopped ending the composing session, and a hidden tab stopped re-issuing the create: two reported symptoms, one defect and one mechanism beside it (`claude/draft-duplication-homework-progress-65qxgf`, no migration)"
date: 2026-09-05
branches: [claude/draft-duplication-homework-progress-65qxgf]
migrations: []
subsystems: ["Classroom", "Testing"]
---

**SUPERSEDED IN PART: the "THE CLEANUP QUERY" section below is UNSAFE as written -- its safety query omits `classroom_submissions` (and `classroom_submission_files` behind it) and `classroom_module_approvals`, so a draft carrying a student's hand-in reads as a surplus copy and is deleted with it. Read `docs/history/duplicate-drafts-production-ru7pag.md` (prompt 0080) before running either query. Everything else in this entry stands.**

Prompt 0061 carried two reports from the 2026-09-05 feedback pull and asked
whether they were one defect or two:

> "issue where i click save draft and instead of just saving one draft it starts
> making infinite copies of that draft"

> "Homework progress didn't save"

They are one defect, plus a second mechanism sitting next to it that turns the
same defect into the worse-sounding half of the report. Both live in
`ContentComposer.svelte`. Neither needed SQL, so no migration was taken.

Started from `origin/integration` at `fdf8c68`, working directory
`/home/user/idea-app`. Git had a committer identity already
(`Claude <noreply@anthropic.com>`), so the "Please tell me who you are" trap did
not arise. **`origin/main` (`25779fb`) is NOT contained in `origin/integration`**
at the time of writing -- main carries commits integration does not -- which is
worth knowing before anything here is merged.

## What was measured, before anything was changed

### A1, the duplication, reproduced twice in two different shapes

**Shape one: press it again.** The real `ContentComposer` mounted in create mode
with counting transports, a title typed, then the Save draft control clicked
five times:

| press | creates | updates | title still in the box |
| --- | --- | --- | --- |
| 1 | 1 | 0 | `""` |
| 2 | 2 | 0 | `""` |
| 3 | 3 | 0 | `""` |
| 4 | 4 | 0 | `""` |
| 5 | 5 | 0 | `""` |

Five presses, five creates, no updates -- and the writing gone out of the box
after the first one. Rows 2 to 5 carried a **null title**, because the form had
been wiped.

**Shape two: press it once and switch tabs.** One press whose response the
client never received (the row commits, the fetch does not answer), then six tab
switches, with nobody pressing anything:

| event | rows the server holds |
| --- | --- |
| the one press | 1 |
| tab hidden x1 | 2 |
| x2 | 3 |
| x3 | 4 |
| x4 | 5 |
| x5 | 6 |
| x6 | **7** |

### A2, the lost progress

Every path by which a student's answers reach storage was read and the SaveState
primitive behind them measured directly:

| path | what triggers a write | what happens on failure |
| --- | --- | --- |
| assignment autosave (`AssignmentEngine`) | every keystroke marks the block dirty; an 800ms debounce writes every dirty block | reported in words through `SaveIndicator`, kept dirty, retried with backoff; a refusal is stated once and not retried |
| explicit "Save now" | the same run, immediately | the same report |
| submit | flushes first, then submits | the submit's own message |
| the draft mirror | **does not exist on this surface** | -- |

Measured on the real `SaveState`:

* an edit followed by a discarded tab **200ms** later writes **0** times;
* the same edit left alone writes **1** time and reaches `saved`;
* a refused write lands in `failed` carrying the refusal's own sentence, and
  `dirty` stays true -- so it is **never silent**;
* a hidden tab **does** flush an autosaving machine, which is correct for one.

So a student's answers are not silently dropped by any path found: an in-app
navigation is cancelled, flushed and re-issued by `guardSaveNavigation`, and
every failure is stated. **The one real gap is a tab discarded under memory
pressure inside the 800ms debounce window**, which dispatches nothing at all --
`AssignmentEngine` has no `localStorage` mirror, where `NotebookView` does. That
is a REPORT, not a fix: the file is outside this bundle's ownership. See
"Deferred" below.

## The two defects

### 1. Save draft ran the end-of-session reset

`runSubmit`'s success path ended with `if (mode === 'create')`, and that block
did two things that only make sense when a piece of writing is finished:

* `createdItemId = null` -- the handle to the row just created, dropped. So
  `saveTarget` answered `create` again on the next press.
* every field cleared, and the editor remounted empty.

Both symptoms fall straight out of it. The copies pile up because there is no
record to add to; the work looks lost because it disappears out of the box while
the message underneath says it was saved.

**This is a rule `CLAUDE.md` already states**, written for the notebook
composer's `savedDraftId` after a0d43ba: *a manual save is a checkpoint, not a
finish*, and *the writing stays in the box*. The notebook was fixed; the
classroom composer still broke it. The fix is that rule applied here -- on a
create-mode save with `publish === false` the composer keeps `createdItemId`,
keeps the form, and advances the `EditBaseline` to what was just sent, so the
box reads clean and nothing goes out again until something changes. A publish
still resets, because that is the deliberate finish.

The acknowledgement had to move with it: `where` used to key on
`mode === 'edit'`, so a second checkpoint would have read "saved as a draft to 1
class" a second time, describing a post nobody made. It keys on
`target.action === 'update'` now -- what the save actually did.

### 2. A hidden tab re-issued the whole create

`SaveState`'s durability net fires on `visibilitychange` and `pagehide` whenever
the machine is `dirty`, and `dirty` **includes `failed`**. So a create the client
read as failed was re-issued in full on every tab switch, screen lock and
navigation.

The false negative that turns a re-run into a copy is ordinary rather than
exotic: **backgrounding a tab aborts the in-flight fetch and fires
`visibilitychange` in the same breath**, so on a phone or a sleeping Chromebook
the abort and the re-run are the same event, and any attempt that got far enough
to commit is another copy. Identical copies, too -- the failure path leaves the
form intact, which is why the report says "copies of *that* draft".

The composer's own header already claimed this machine "adds no autosave, no
debounce, no backoff and no navigation guard". `attach()` quietly contradicted
it. The fix is `onHide: () => {}` -- the option that exists for exactly this
decision. The listeners stay attached; only the write is withheld.

**What declining costs, stated rather than waved away.** Two cases, and only one
of them changes:

* A composer nobody has pressed anything on was **already** not flushing.
  `#flush()` returns early unless the machine is `dirty`, and `dirty` is set by
  `markDirty()`, which only `submit()` calls. So an unsaved draft on a closing
  tab was never being written before this change either.
* A composer whose save FAILED loses its one unrequested attempt to land on
  unload. That attempt was a fetch begun at `pagehide`, which is not guaranteed
  to complete in the first place; against it stands a duplicate row on every
  tab switch. And the teacher is not left in the dark: `ondirtychange` is
  driven by the `EditBaseline`, and the checkpoint advances that baseline only
  on SUCCESS -- so after a failure the composer still reports itself dirty, and
  the layout's own `beforeNavigate` raises the unload warning that gives them
  the chance to press Save draft again. A warned person with a retry beats an
  unwarned one with silent copies.

## Why the shell hides half of this, and why it is still a defect

The production create composer is mounted once, in
`src/routes/classroom/[sectionId]/+layout.svelte`, and `composerSaved` sets
`composing = false` on a full success -- so the composer **unmounts**, and shape
one's five-presses-in-one-mount is not reachable there by clicking alone. What
IS reachable in production, with no second click:

* shape two, in full: one press, a lost response, and every subsequent tab
  switch writing another row;
* and the human version of shape one: the box empties and the composer closes,
  so a teacher who is not sure it saved reopens "New post", retypes, and presses
  again -- a second row, every time round.

There is also a sharper reading of the second report than "it vanished". After
the wipe, the very next press goes out with a null title, and **0085 refuses
it** -- measured against real Postgres: `A title is required.` on an assignment
and a material, `The announcement needs a body.` on a post. So a teacher pressed
Save draft, watched their writing disappear, pressed it again, and was told a
title was required for work that had been on the screen a second earlier. That
is what "didn't save" looks like from a chair.

The corollary matters for the cleanup below: **a surplus copy is never an empty
row**, because an empty one cannot be written. It is a full copy.

## The positive control

Required by the prompt and run against the fixed tree, by mutating a scratch
copy of the component. The file was copied with `cp` first and restored **from
that copy**, md5-verified both times (`dbeeb1bab0f29b466ee44e8ded9ce065`);
`git checkout --` was never run.

| mutation | measurement | fixed | mutated |
| --- | --- | --- | --- |
| `onHide` removed | 1 press + 6 tab hides, creates | **1** | **7** |
| `onHide` removed | 1 press + 3 tab hides, creates | **1** | **4** |
| the checkpoint reverted | 5 presses, creates | **1** (+4 updates) | **5** |
| the checkpoint reverted | title in the box after 1 press | `"Bridge lab writeup"` | `""` |
| the checkpoint reverted | the message on the second press | `updated (draft)` | `saved as a draft to 1 class` |

Each mutation reddened only its own rows: `onHide` reddened 2 of 9 DOM
assertions and the checkpoint reddened 3 of 9, with no overlap. The two halves
are independently pinned rather than one thing measured twice.

**The browser check bites too**, which is the half a DOM mutation cannot show.
With both halves reverted, `npm run verify:browser -- --route composer-draft`
went from 0 outside threshold to 2, identically at both widths:

```
fixed    ["rows 1","creates 1","updates 4","title=\"Bridge lab writeup\"","said=updated-draft"]
reverted ["rows 5","creates 5","updates 0","title=\"\"","said=Assignment saved as a draft to 1 class."]
```

Five real clicks, five rows, the field emptied, and the acknowledgement claiming
a fresh post on every one of them. (The six tab switches add nothing in THIS
fixture because its transport succeeds, so the machine reaches `saved` rather
than `failed` -- the tab-switch half is the one the DOM file measures with a
lost response, where it went 1 to 7.) Restored from a `cp` copy, md5
`7452902781e24dd8716a4778a43f1f86` before and after.

## What was added

* `tests/dom/composer-draft-drive.ts` -- the instrument, kept apart from the
  assertions so the mutation proof drives the identical one (the
  `composer-mount.ts` convention).
* `tests/dom/composer-draft-checkpoint-mount.test.ts` -- 9 assertions: the press
  counts, the writing staying put, the acknowledgement's wording, the publish
  still resetting, the hidden-tab count with its control, and the signature and
  `saveTarget` decisions underneath.
* `tests/db/classroom-draft-checkpoint.test.ts` -- 7 assertions driving the
  **real** `POST /api/classroom/item` handler against real embedded Postgres as
  a real signed-in teacher, because the symptom is a row count and a mounted
  component can only report call counts. It carries the control that makes the
  claim mean something: the same five presses issued as five creates leave
  **five rows**, so a later count of one is the client holding its handle and
  not the server refusing anything.
* `src/routes/dev/composer-draft/**` -- the harness, which leaves the composer
  OPEN (the production shell closes it) and shows creates, updates and the rows
  a database would hold, with a switch for the lost-response case.
* `tools/browser-verify/routes/composer-draft.mjs` -- five real clicks and six
  real tab switches at 375 and 1440, asserting one row, four updates and the
  writing still in the field.

### A note on the db test's shim adapter

`createPostgrestShim` hands each named argument to node-postgres as it stands,
which is right for `uuid[]` and wrong for `jsonb` -- a JS array is serialized as
`{...}` and Postgres answers *invalid input syntax for type json*. PostgREST has
no such split: one JSON body arrives and every parameter is cast by the
function's declared type. The test therefore wraps the shim and reads the json
parameter names **from `pg_proc`** rather than listing them. A hardcoded
`['p_body_doc', 'p_resources']` would be a second silent copy of the RPC's
signature and would still pass on the day a parameter changed type. Fixing this
in the shim itself would be the better home for it and is outside this bundle's
ownership.

## THE CLEANUP QUERY

Nothing was run against production. This is for whoever has SQL editor access,
and it is Mr. Pina's call whether to delete anything: these rows belong to
teachers.

A surplus copy is a **full duplicate** -- same author, same kind, same title,
same body, all unpublished, minutes apart. Find them first:

```sql
-- READ ONLY. What are the duplicate drafts, and which one would be kept?
select i.author_email,
       i.kind,
       i.title,
       count(*)                                                    as copies,
       min(i.created_at)                                           as first_written,
       max(i.created_at)                                           as last_written,
       (array_agg(i.id order by i.created_at, i.id))[1]            as keep,
       (array_agg(i.id order by i.created_at, i.id))[2:]           as surplus
  from public.classroom_items i
 where i.published = false
 group by i.author_email, i.kind, i.title, i.body
having count(*) > 1
 order by count(*) desc, max(i.created_at) desc;
```

**Read that result before removing anything, and check three things.**

1. **`keep` is the OLDEST, and the oldest is not always the right one.** The
   duplicates are identical in title and body, so the choice usually does not
   matter -- but if a teacher edited one of them afterwards they are no longer
   identical and will not group together at all, which is the safe direction.
   Anything that DOES group is genuinely interchangeable.
2. **A duplicate title with a different body is not in this result**, on
   purpose. Two drafts a teacher wrote deliberately with the same name are not
   copies and must not be swept.
3. **Check what hangs off each surplus row before deleting it.** A copy created
   by a re-issued save can still have picked up attachments, a spec, a rubric or
   a check-in on the presses that followed:

```sql
-- READ ONLY. Does a candidate carry anything a delete would take with it?
select i.id,
       (select count(*) from public.classroom_postings        p where p.item_id = i.id) as postings,
       (select count(*) from public.classroom_attachments     a where a.item_id = i.id) as files,
       (select count(*) from public.classroom_responses       r where r.item_id = i.id) as student_work,
       (select count(*) from public.classroom_assignment_specs s where s.item_id = i.id) as specs,
       (select count(*) from public.classroom_rubrics         b where b.item_id = i.id) as rubrics,
       (select count(*) from public.classroom_decks           d where d.item_id = i.id) as decks
  from public.classroom_items i
 where i.id = any ($1::uuid[]);   -- the `surplus` array from the query above
```

Every table named there exists in the applied chain (checked against
`supabase/migrations/`); the column each joins on is `item_id`. Neither query
was run against production.

Anything with `student_work > 0` is **not** a surplus copy in any sense that
matters and must be left alone. For the rest, the safe removal is the app's own
path -- `POST /api/classroom/delete-content`, one id at a time, which takes the
attachment rows and sweeps the blobs with them. **Do not write a migration that
deletes these rows**: this is a decision about work belonging to teachers, taken
with the counts in front of somebody.

The finding half of that query is exercised in
`tests/db/classroom-draft-checkpoint.test.ts` against rows the test itself
writes, including the negative half -- a draft standing on its own is never
named.

## Verification

* `npx svelte-check`: **0 errors, 37 warnings**, breakdown 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`, re-derived after `npx svelte-kit sync` with the two
  `PUBLIC_SUPABASE_*` placeholders exported (the fresh-checkout phantom-errors
  rule). Identical to the baseline measured on `fdf8c68` before any edit.
* `npm run verify:browser -- --route composer-draft`: **24 measurements at 375
  and 1440, 0 outside threshold**, total wall clock 19.9s. The row that matters,
  after five real clicks and six real tab switches, identical at both widths:
  `["rows 1","creates 1","updates 4","title="Bridge lab writeup"","said=updated-draft"]`.
  Contrast on the counters 12.47:1; Save draft 130.1x44 and Hide the tab
  147.4x44, both clearing the 44px floor; 0 horizontal overflow at either
  width; 0 console errors.
* **Paint is not interactivity, and the numbers say so.** The first press is
  retried against its own effect rather than after a timer: it took **6
  attempts at 375px** and **2 at 1440px** for the click to land on a hydrated
  page, against an "app rendered" figure of 501ms and 618ms. A fixed wait
  tuned to either width would have been wrong at the other.
* A full pass over the whole harness on the same tree: **214 route/width runs,
  3122 measurements, 2 outside threshold**, 541.9s wall clock. The two are the
  standing `/dev/notebook` tap-reach rows (decision 12, with the owner), not
  anything this bundle touched.
* `npm run verify:counts`: static region 106 -> **107** specs, 53 -> **54**
  routes, 83 -> **84** `/dev` pages, 212 -> **214** runs. Exactly one route and
  one page, which is what this bundle added.
* `npm run verify:readme`: the measured region now reads **107 covered, 214
  runs, 3122 measurements, 2 outside threshold, 519.7s**, on commit `734914a`
  with a clean tree, and its selftest reports 70 controls (36 negative, 34
  positive) with 0 instrument failures. `covered` and `specs` are both 107, so
  the measured half is measured against THIS tree rather than a different set
  of routes.
  * **THE FIRST ATTEMPT AT IT CRASHED, AND IT WAS A FLAKE.** It died on the
    route after `gauntlet-shell` with `page.evaluate: Execution context was
    destroyed, most likely because of a navigation`, thrown from
    `horizontalScroll` -- the first check a route runs, i.e. immediately after
    navigating. Re-run ONCE on the same tree, per the flake rule, it completed
    with 0 failures; and a full pass over the same 107 specs had already
    completed cleanly earlier in the session. Two clean full passes against one
    crash, in a route this bundle does not touch and whose own check was not
    the one that failed. Recorded rather than chased.
* **`tests/derived-numbers.test.ts` WAS ALREADY RED ON `origin/integration`,
  and this bundle is what makes it green.** At `fdf8c68` the measured region
  covered 103 of 106 specs -- `themes.mjs`, `themes-signedout-1.mjs` and
  `themes-state-matrix.mjs` had never been measured -- so `unmeasuredSpecs`
  named three and the file failed before any edit here. Adding this bundle's
  route made it four, and regenerating the measured region cleared all four. A
  session that finds that file red on a fresh branch should not assume it broke
  it.
* `npm run check` (`svelte-kit sync && svelte-check --tsconfig ./tsconfig.json`):
  2965 files, **0 errors, 37 warnings, 20 files with problems**.
* `npm test` (the full suite, `--no-file-parallelism`): **278 files passed,
  5674 tests passed, 0 failed**, 278.1s. Run at **13:23 America/Los_Angeles on
  2026-09-05** (20:23:46 UTC), on the final tree at `923b963`.
  * An EARLIER run of the same suite, taken mid-bundle, had **2 failures, both
    in `tests/derived-numbers.test.ts`** -- the measured counts region naming
    fewer specs than the tree holds. Three of those four specs were already
    unmeasured at the branch point (see above); regenerating the region cleared
    all four, which is why the final run is clean.
* Mutation proof: above, with restores by `cp` and md5.

## NOT verified

* **Nothing was run against the live Supabase project.** No production row was
  read, counted or deleted, so the number of duplicate drafts actually sitting
  in `ideabosco.com` right now is **unknown**. The query above is what answers
  it.
* **No signed-in production surface was driven.** `npm run verify:browser`
  covers `/dev` routes only; the real `/classroom/[sectionId]` composer needs a
  Bosco Tech Google session no automated run holds.
* **The false negative was simulated, not induced.** The harness and the tests
  make a create commit and then report failure; no real aborted fetch against a
  real serverless function was measured. The mechanism (a backgrounded tab
  aborting an in-flight request) is Chromium's documented behaviour and was not
  independently reproduced here.
* **`prefers-reduced-motion` is `no-preference`** in the harness, so that path
  is not exercised, and the harness blocks non-loopback requests, so text is
  measured in the fallback font stack.

## Deferred, with reasons

* **`EntryNotes.svelte` has the same `onHide` gap.** It is the other
  `autosave: false` surface in the repo, and a write it did not ask for mints a
  revision an instructor reads. It was not touched: outside this bundle's
  ownership.
* **The real fix for both is in `SaveState` itself** -- `#flush()` should
  decline to write for a machine constructed with `autosave: false`, which is
  one rule in one place rather than an `onHide` per surface. `save-state.svelte.ts`
  is outside this bundle's ownership, so the per-surface option was used and this
  is written down instead.
* **`AssignmentEngine` has no draft mirror.** The notebook's answer to a
  discarded tab is `$lib/notebook/draft-mirror.ts`; the student's assignment
  surface has nothing equivalent, so an answer typed inside the 800ms debounce
  window and then lost with the tab is gone with nothing said. That is the only
  route by which a student's work can be lost silently that this bundle found.
  Fixing it means a mirror on that surface, which is its own bundle.
* **What to ask the person who reported "Homework progress didn't save".** The
  report carried no detail and the audit found no silent failure on the student
  path, so the useful questions are: which page were you on -- an assignment, or
  your notebook? Did you press anything, or were you typing? Did the little
  "Saved" line at the top say anything, and did a red message appear? Did the
  page close, or did your Chromebook go to sleep? Any of those separates the
  debounce-window gap above from something not yet found.
* **The production shell closes the composer on a draft save.**
  `+layout.svelte`'s `composerSaved` is outside this bundle's ownership, so the
  checkpoint's benefit there is the contract being right rather than a visible
  change to the happy path. Whether Save draft should leave the composer open --
  which is what a checkpoint really means for a teacher -- is a decision for the
  file that owns the shell.
