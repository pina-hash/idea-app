---
title: "The row is locked and the bytes are not: 0182 closes both halves of a turned-in hand-in, and the refusal learns to say why (`claude/submission-bytes-deletable-r66zwt`, migration 0182)"
date: 2026-09-05
branches: [claude/submission-bytes-deletable-r66zwt]
migrations: ["0182"]
subsystems: ["IDEA Classroom", "Storage", "Testing"]
---

Prompt 0056. One migration, two source files, one test file extended by 12 tests
(5 of them mutation controls), a browser pass at both widths, and one
student-facing changelog entry. Started from `origin/integration`
`b000e2ffe67aad9016e33095c4cafe29d99fabc3`; the container's git already carried a
committer identity, so nothing had to be set.

## What was wrong, reproduced before it was fixed

Prompt 0054 found this and did not ship it. The reproduction here is its own,
against the unpatched tree, on a chain carrying 0109/0133/0134/0135/0137/0160/0171:

```
attach ok, file_id = 6a29948a-...
submit  = {"ok":true,"state":"submitted","unmet":[],"submitted_at":"..."}
classroom_delete_submission_file = {"ok":false,"reason":"locked"}
delete from storage.objects as alice, rows = 1
AFTER: submission_files rows naming the key = 1
AFTER: submission state = submitted
AFTER: teacher reads objects = 0   teacher reads the ROW = 1
```

Every clause of 0054's claim holds. The row survives naming bytes that are gone,
the state does not move, and the teacher who could read the object a moment
earlier reads zero while still reading the row that promises it. What she clicks
404s, which reads as a platform fault rather than as something the student did.

**The milder twin, also measured here**: the INSERT policy was ownership-only
too, so a student could put bytes into their own prefix on a turned-in hand-in
(1 object landed), the attach refused them (`locked`), and the route's orphan
sweep removed them again on the student's own client (1 row).

## The two predicates, and why they key on different things

**DELETE keys on the ROW. INSERT keys on the PREFIX.** That asymmetry is the
whole design and it is forced by a shipped path.

`src/routes/api/classroom/submission-file/+server.ts` uploads the bytes FIRST and
records the row SECOND, and when the record is refused it sweeps the orphan
**using the student's own client** -- `supabase` off `locals`, never a
service-role client. Quoted rather than summarised, because the argument rests on
it:

```ts
	if (result?.ok === false) {
		// A structured refusal (locked / approval_pending): nothing was written,
		// so the object it would have pointed at goes too.
		await supabase.storage.from(SUBMISSION_FILES_BUCKET).remove([storageKey]);
		return json({ ok: false, reason: result.reason ?? 'refused' });
	}
```

So a `state <> 'submitted'` narrowing on DELETE would refuse the sweep in exactly
the case it exists for. **A row-keyed predicate does not**: an object no live row
names is always the owner's to remove, and that is precisely what an orphan is.
It also composes with the RPC's own order -- `classroom_delete_submission_file`
deletes the ROW and only then hands the key back for the route to sweep, so by the
time `remove()` runs there is nothing to be locked by.

INSERT has no such caller, and a brand-new object has no row to key on anyway, so
it asks the question of the submission its key names.

**Could the sweep be issued by anything else?** Only a service-role client, and
that is a second reader of `SUPABASE_SERVICE_ROLE_KEY` inside the classroom --
`CLAUDE.md` names its four readers and says one module knows each credential.
That is a bigger change than this bundle owns and it would move the
authorization boundary from the database into a route. It was not done.

## What was changed from 0054's proposal

The shape is 0054's and it is right. Three changes:

1. **Which states lock is written down ONCE**, in
   `_classroom_submission_is_locked(uuid)`, and both predicates read it. 0054's
   snippet spelled `s.state = 'submitted'` inside the one predicate it proposed;
   with two predicates that would have been two literals, which is the defect
   this file exists to close, wearing a different hat. Measured as a property:
   mutation control 3 widens that one function and BOTH halves move together.
2. **The insert half moves too**, which 0054 recorded and left. Argued below.
3. **`classroom_delete_submission_file` was NOT re-signed**, though it holds the
   twin of that state test. Sharing a body would mean a `create or replace` of a
   busy deployed RPC to change nothing about its behaviour, and `CLAUDE.md` warns
   that a re-signed function is how error semantics quietly change. The two are
   held in step by a TEST instead -- the row refusal and the byte refusal driven
   across all three states and compared as a table -- which is a stronger
   guarantee than a shared helper anyway: it compares the observable behaviours
   rather than one input to one function.

## Why the insert half moved

It buys nothing on its own: an orphan in a private bucket that no row names
serves nobody and is listed by nothing. Three things decided it.

* **Insert is never the orphan sweep**, so the objection that rules out the
  one-line narrowing on DELETE does not apply to it at all.
* **The legitimate flow cannot reach it.** `sign/+server.ts` calls
  `classroom_open_submission` first, which refuses a locked submission before a
  signed upload URL exists. So the only way to write into a submitted prefix is
  to go around the app.
* **The vocabulary for the refusal already existed**, which is the tell that
  somebody expected it to be possible: `DENIED_REASON.submission` in
  `$lib/classroom/upload-errors.ts` already reads "if it was turned in while this
  was uploading, unsubmit and try again."

**Closing one and silently leaving the other is what produced this defect.** One
rule stated in one half is how the delete half came to be forgotten.

## What the student sees now, and the finding underneath it

**Today the surface said nothing useful and, in the ordinary case, could not say
anything at all.** The route answered `{ok:false, reason:'locked'}` with status
200; `deleteSubmissionFile` in `transports.ts` read `res.ok` as true and returned
`{ok:true, data:{ok:false}}`; and the only sentence anywhere was a literal inside
`AssignmentEngine.svelte` ("This is submitted, so files are locked.") which could
not know which reason came back.

The route owns the words now, because it is what knows the reason, and the
transport reports a considered refusal as `{ok:false, gate:'denied',
retryable:false, message}` -- the same shape the upload path already uses for the
identical refusal. The sentence is the attach path's own wording with the WHY
inserted:

> This is turned in, so files are locked. Your teacher has it now. Unsubmit it to keep working.

**AND THE CONTROL IS NORMALLY NOT THERE AT ALL, which nothing had written down.**
`AssignmentEngine` passes `onremove={editable ? (f) => removeFile(f.id) : null}`,
so once the work is turned in `SubmissionFileList` renders no Remove button.
Measured in a real browser rather than read off the source: **3 Remove controls
before Submit, 0 after, at both 375 and 1440**, one attempt, 28ms and 35ms. So
the `locked` delete refusal is reachable only through a RACE -- a page that still
believes the work is a draft while the server has it submitted -- or a direct
call to the endpoint. That is exactly the confusing moment a sentence is for, and
it is also why this half is a courtesy rather than the fix. **The fix is the
policy.**

**One follow-up this bundle could not take**, because `AssignmentEngine.svelte`
is outside its ownership: `removeFile`'s `if (res.data.ok === false)` branch and
its hardcoded sentence are now unreachable from the real transport (the dev
harness at `/dev/classroom` still returns the old shape and still reaches it).
Whoever owns that file should delete the branch and let the one sentence through,
and update the harness transport to `{ok:false, message}` with it.

## The tests

`tests/classroom-storage-objects.test.ts`, extended rather than a third file.
**Its existing chain STOPS AT 0133 and was deliberately left alone** -- every
assertion above the new section was measured against that fixture, and four more
files under them would change the world each one reads. The new work brings its
own database.

**The chain it brings, and why each file is in it** (0054 found all four):

| file | why |
| --- | --- |
| `0109` | the SCHEDULED-posting gate inside the function a student actually calls; numerically before 0133, so it sits in numeric place |
| `0134` | the conflict-tolerant `classroom_open_submission`; 0133 made student uploads concurrent and this is the repair |
| `0135` | a SECOND permissive select policy on `storage.objects`, OR'd with every other one, so only a chain carrying it can answer whether it widens `submission-files` |
| `0137` | the anon EXECUTE sweep, in numeric place AND repeated last |
| `0160` | submitting unfinished work is accepted, which changes what `classroom_submit_assignment` returns |
| `0171` | extra credit, the last classroom migration before this one |
| `0182` | in numeric place, so the chain is the paste order an operator will use |

**0137 repeated last is the one thing that could have broken this bundle**, and it
is asserted rather than assumed: a function named in an RLS `using` clause is
evaluated as the QUERYING role, so a sweep that took `authenticated` off the new
predicate would not narrow the delete, it would break it -- the 0070 lesson 0109
writes down. Measured from `has_function_privilege` after the trailing sweep: the
two policy predicates keep `authenticated` and are refused to `anon`; the private
state helper is refused to both, which is correct because its only callers are
SECURITY DEFINER bodies running as the owner. (0137 is safe here by construction:
its `k_private` list is spelled out and fixed at 0137's own time, so a function
created after it that HOLDS `authenticated` is re-granted and one that does not is
left alone.)

**Twelve new tests.** Four cases, the insert half, the state-agreement table, the
grant assertion, a policy-blast-radius check, a re-apply check, the route driven
end to end, the real transport driven with a stubbed fetch, and five mutation
controls.

### The mutation controls, and one thing done differently

Five clauses opened, each confirmed to flip its own case:

| # | clause opened | measured flip |
| --- | --- | --- |
| 1 | the row predicate, made unsatisfiable | submitted bytes removed again (1), teacher then reads 0; the ROW half still refuses, so only one half moved |
| 2 | the row predicate re-keyed on the SUBMISSION (0054's rejected one-liner) | the orphan sweep refused (0 rows), the orphan left behind (1 object) |
| 3 | `draft` added to the locked states | the draft path breaks at the FIRST step (insert refused by RLS), and the byte delete with a live row goes 1 -> 0 |
| 4 | `returned` added to the locked states | after release the bytes stay refused (0), where the shipped file gives 1 |
| 5 | the prefix predicate, made unsatisfiable | bytes land on a turned-in hand-in again (1); the delete half stays shut, so again only one half moved |

**CONTROLS 1 AND 5 ARE OPENED PERMISSIVELY AND 2, 3 AND 4 RESTRICTIVELY, on
purpose.** `CLAUDE.md` says to mutate in the permissive direction, and that rule
is about proving a DENIAL. Three of these prove a PERMISSION -- the sweep still
lands, a draft still works, release still hands the bytes back -- and the only
mutation that can flip a permission is one that takes it away.

**THE MUTATION IS APPLIED TO THE FILE'S TEXT IN MEMORY, NOT TO THE FILE ON DISK,
and that is a deliberate departure from the prompt's `cp`-and-restore
instruction.** `mutate()` reads the shipped `0182_*.sql`, asserts the substring it
is about to rewrite occurs EXACTLY ONCE (a `replace()` that matched nothing
returns the original string happily, which is a mutation run that proves nothing),
and applies the rewritten text to a database built from the chain without 0182,
followed by 0137 -- the production order. What is under test is the shipped file's
own bytes, exactly as an on-disk mutation would test them, with **no window in
which a crashed run leaves a mutant in `supabase/migrations/`** and no restore
step that could put back the wrong thing. The guarantee the `cp` step exists to
give is asserted directly instead: the file's md5 is taken before the first
mutation and compared after the last. **No `git checkout --` was run on any file
at any point in this session.**

Two mutations had to be designed around the file's own self-check, and the reason
is worth keeping: a mutation that removes the new conjunct from a policy makes
0182 RAISE at apply time, which is an apply failure and not a flipped case. Each
mutation therefore leaves the policy text alone and opens the PREDICATE, and where
a constant would do the job it uses `p_name is null` instead -- a constant
conjunct is folded away by the planner and the function call can vanish from the
stored policy expression with it.

## Cold apply

Paste in numeric order into the Supabase SQL editor, as one file, after `0181`:

```
supabase/migrations/0182_classroom_submission_object_lock.sql
```

It creates three functions and replaces two `storage.objects` policies. **It
writes no row, drops no column and backfills nothing**, so there is no
pre-migration data question and nothing to seed: the only state it can be applied
over is the policy set 0133 left, which is what the test chain applies it over.

On success it prints two notices, the first with counts read from the real tables:

```
0182: N submission(s) currently turned in; M stored object(s) are now undeletable
      by their student until the work is unsubmitted or returned.
0182: nothing stored was changed. ...
```

**Check M against what the deployed app holds.** It raises instead of committing
if either policy failed to take the new conjunct, if `anon` can reach any of the
three functions, if `authenticated` cannot reach the two named in policies, or if
any policy outside `submission files %` names the new predicate.

**What undoes it** is in the file's own ROLLBACK section: recreate 0133's two
policies verbatim without the new conjunct and drop the three functions. Nothing
stored changes either way.

**Re-pasting is ordinary and tested** (`0182 re-applies`): `create or replace`
throughout, `drop policy if exists` before each create, no DML.

## What was measured

* `npm run check`: **0 errors, 37 warnings**, breakdown **31
  `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`**. Re-derived after `svelte-kit sync` with the two
  `PUBLIC_SUPABASE_*` placeholders exported, per the missing-`.env` trap. The
  baseline in `CLAUDE.md` is correct as written and was not changed.
* `tests/classroom-storage-objects.test.ts` alone: **42 tests**, and **40** on the
  `main` commit's own tree, which is what says the migration commit is
  self-contained.
* The full suite: see the run recorded in the session report.
* **Browser, real Chromium 1194 at `/opt/pw-browsers`, both widths.** The
  refusal sentence produced by the REAL `transports.ts` module (imported through
  Vite's module graph in the page, with `fetch` stubbed to the patched route's
  exact body) came back `ok=false gate=denied retryable=false` with the shipped
  wording at both widths. Rendered in the real `Extra files (optional)` card:
  846 x 36.7px over ~2 lines at 1440 (card 896px) and 293 x 74.2px over ~4 lines
  at 375 (card 343px); 12.48px/18.72px Share Tech Mono; amber
  `rgb(208, 128, 48)` on `rgb(16, 19, 18)` = **6.06:1** against the 4.5 floor; no
  horizontal scroll at either width (scrollWidth 1440/375 against viewport
  1440/375); 1 console error per page, `net::ERR_FAILED` from the harness's own
  external-request block.
  **The rendering is a FORCED state and is reported as one**: `uploadError` is
  component-local and the harness's transports never set it, so the paragraph was
  inserted into the real card with the real classes and measured there, matched
  as a unique node (1 match). The STRING is the one the real transport produced,
  not one typed into the script.
* `waitForApp` returned `{hydrated, domStable}` in 494-761ms; the scripted click
  retried against its own effect and needed **1 attempt, 28-35ms**.

## Not verified

* **The live Supabase project.** There is no `.env` in this container and the
  local one is the placeholder `example-ref`. Nothing here applied a migration,
  ran an RPC or signed in against production. Every database claim is against the
  embedded Postgres with the real migration files applied.
* **The real storage-api HTTP path.** These tests reach `storage.objects` in SQL,
  which is where the policy lives, but not the handler in front of it. In
  particular **whether the INSERT policy is evaluated when the signed upload URL
  is MINTED or when the PUT lands is not measured here.** Either answer is safe:
  minted-time means the narrowing is inert for the legitimate flow (the sign
  route already refuses a locked submission first), and PUT-time means a
  mid-upload submit now gets a clean `denied` with existing wording instead of a
  wasted transfer followed by a sweep. But it is unmeasured, and it is the one
  thing to watch after the apply.
* **A signed-in surface.** `/dev/login` exists and docker is present, but the
  Supabase CLI is not installed in this container, so no local stack was booted
  and the real `/classroom/.../item/...` page was not driven. The browser pass is
  against `/dev/classroom`, whose own transports are in-memory.
* **The end-to-end refusal through the harness UI.** It cannot be driven there:
  `/dev/classroom`'s `deleteSubmissionFile` still returns the pre-0056 shape, and
  that file is outside this bundle's ownership. The route half and the transport
  half are each driven for real, in Node and in the browser respectively; they are
  proved separately rather than in one press.
* **`tests/derived-numbers.test.ts`'s two failures were not fixed, only
  confirmed.** The tree holds **106** route specs and the measured region covers
  **103**; the three uncovered are `themes.mjs`, `themes-signedout-1.mjs` and
  `themes-state-matrix.mjs`, from the Matrix theme landing after the last
  regeneration at `c7f57b9`. This bundle added no route spec and regenerated
  nothing, so `tools/browser-verify/README.md` is untouched and the two failures
  are inherited exactly as `origin/integration` carries them.

## One thing about the number

**0181 was taken while this bundle was being built.** It was free across every ref
at the start and prompt 0052 (`0181_avatars_private.sql`) landed on `main`
mid-session, which is exactly the collision the prompt warned about. The file was
renumbered to **0182**, re-verified free across every remote and local ref and
against `git log --all --diff-filter=A`, and 0181's own contents were checked for
interaction: it touches the `avatars` bucket only and shares no policy, predicate
or table with this one.
