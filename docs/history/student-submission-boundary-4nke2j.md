---
title: "The path a student's graded work takes, driven as a student: ten cases, five mutation proofs, and one asymmetry where the row is locked and the bytes are not (`claude/student-submission-boundary-4nke2j`, no migration)"
date: 2026-09-05
branches: [claude/student-submission-boundary-4nke2j]
migrations: []
subsystems: ["IDEA Classroom", "Storage", "Testing"]
---

Prompt 0054. One new test file, `tests/db/classroom-submission-file-boundary.test.ts`,
31 tests. **Nothing under `src/` was touched, no migration was written, and
`tests/db/postgrest-shim.ts` was not changed** -- the audit found it did not need to be.

## What the prompt claimed, and what the tree said

The prompt's premise was that `classroom_add_submission_file` and the `submission-files`
owner policy "had never faced a real student JWT". **That is not what the tree says, and
the correction matters more than the bundle would have without it.**
`tests/classroom-storage-objects.test.ts` (0133's own suite) already drives six of the
ten cases as a real student, with permitted-caller controls beside each denial, including
the two that matter most -- a student reading another student's object, and a student
writing into another student's prefix. Four out of four "add X" items in this repository
already existed, and this was the fifth.

**What was genuinely missing was narrower and, once found, more interesting than the
premise.** Three things:

1. **THAT SUITE'S CHAIN STOPS AT 0133.** The function a student actually calls is
   **0134's** (the conflict-tolerant open, added when 0133 made student uploads
   concurrent); the gate inside it is **0109's** (a scheduled assignment does not exist
   to a student); **0135** adds a SECOND permissive select policy to `storage.objects`;
   and **0137** is the sweep that decides whether `anon` reaches any of it. A permissive
   policy is OR'd with every other permissive policy on the table, so "does 0135 widen
   `submission-files`" is a question **only a chain carrying 0135 can answer** -- and
   nothing carried it. This file's chain carries all four, with 0137 in its numeric place
   AND repeated last, because 0160 and 0171 each `create or replace` a function after it
   and production re-runs the sweep by hand after such a file.
2. **THE LIFECYCLE.** What the path does once the work is TURNED IN, and once it is
   GRADED, had never been put to a student anywhere. Both answers are below.
3. **THE ENROLLMENT GATE ON THE ATTACH ITSELF.** That an outsider cannot OPEN a
   submission was covered; that they cannot ATTACH is a different function with its own
   copy of the gate, and it was not.

## The answer to the question the bundle exists for

**No. A student cannot read another student's submitted work, and that is measured in
both halves.** The bytes are refused by `classroom_can_read_submission_object` behind the
`submission files readable by owner or reviewer` policy; the ROW that names them is
refused by `classroom_submission_files`' own policy, which asks the same
`classroom_can_review_submission`. A key is only useful to somebody who can learn it, so
both halves are asserted rather than one. Opening the read predicate to `select true`
flips both to readable, which is what says the zeros were the policy refusing and not the
query missing.

## The contract this bundle establishes

**Identity.** `classroom_add_submission_file` takes **no identity parameter of any
kind** -- asserted from `proargnames`, not read off the source. The caller is
`auth.uid()` by way of `_classroom_engine_student`, so "attach as somebody else" is not
expressible in the signature rather than being a check that could be got wrong. The
sweep has a positive control: `classroom_can_review_submission`, the same feature from
the teacher's end, genuinely does take a student, so the pattern finds one when there is
one to find. (The first draft of that sweep read the whole argument string and matched
`uid` inside `uuid` -- a sweep that cannot tell a type from a name would have missed a
real one.)

**Who may attach.** An actively enrolled student, to a LIVE assignment posted to a
section they are in, and nobody else. A student in another section is refused by name; a
student whose enrollment was deactivated is refused by the same clause, with the control
taken while the enrollment was still active. The refusal lands **before the key is
looked at**, so a well-formed key of the caller's own gets them no further.

**Where the bytes may go.** `<submission_id>/<uuid>.<ext>`, under the caller's OWN
submission and nowhere else, and **the row must agree with the key**: attaching a key
whose first segment names a different submission raises `That storage key does not belong
to this submission.` Nothing a person typed is in the key, which is why nothing has to be
sanitised out of it; the filename is kept verbatim, case included, in its own column.

**Accepted types: ALL OF THEM. There is no allowlist anywhere to add one to.** The
bucket carries `allowed_mime_types = null`; the RPC records whatever `p_mime_type` string
it is handed, truncated to 200 characters, and validates nothing. What pays for the
missing list is three properties, none of which this bundle weakens: the bucket is
private, every read is a signed URL carrying `download=`, so the response is
`Content-Disposition: attachment` **on the Supabase origin and not ours**, and the client
(`$lib/classroom/file-upload.ts`) stores every object as `application/octet-stream` and
**never reads `File.type`**. An instructor opening a hand-in is protected by the foreign
origin and the attachment disposition, not by anything about the file.

**Ceiling: 209715200 bytes (200 MiB), enforced by Storage itself**, restated by
`CLASSROOM_UPLOAD_MAX_BYTES` for the early browser refusal and by `MAX_STORAGE_BYTES` in
the sign route for a 413 before a signed URL exists. `p_size_bytes` on the ROW is
recorded and never checked -- a 60 MB row is an ordinary row, and a row may claim a size
the object does not have. That costs nothing, because the bucket enforces the bytes.

**Once turned in.** The attach returns `{ok:false, reason:'locked'}` -- a structured
refusal and **not a raise**, because the student did nothing wrong and the route renders
it as "This is turned in, so files are locked." Nothing lands. `classroom_unsubmit_
assignment` is the student's own way back in, and the attach works again immediately
afterwards, which is what says the two functions read the same state.

**Once graded, and this is the pair.** Grading does **not** move the state on its own:
the work stays `submitted` and the attach stays `locked` -- **and the door unsubmit
opened is now shut**, `{ok:false, reason:'graded'}`. Without that second half the first
would be worthless, because a student could unsubmit, attach and resubmit under a grade
already written. **Releasing the grade (`p_return`) sets `returned`, and that reopens the
work.** That is right, not a hole: `returned` is documented on the column as "graded and
released (editable again for resubmission)", so a student given feedback can act on it
and a student not given it cannot touch the work. The only way back into a graded hand-in
is the teacher's.

## The finding

**THE ROW IS LOCKED AND THE BYTES ARE NOT.** `classroom_delete_submission_file` reads the
submission's state and refuses `submitted` with `locked`. The `submission files delete
own submission` policy asks `classroom_owns_submission_object`, **which is ownership and
nothing else**. So the two halves of one decision disagree, and **the half with no undo
is the open one** -- a Storage delete cannot be reversed and this repository holds no
backup of a bucket.

Measured: alice turns in a hand-in, the row delete returns `locked` and the row survives,
and `delete from storage.objects` as alice removes the object anyway (1 row). The row is
still there naming bytes that are gone, and the teacher who could read those bytes a
moment earlier now reads 0.

**What it costs.** The hand-in is still listed, still counted, still gradeable on paper,
and the download a teacher clicks 404s -- which reads as a platform fault rather than as
something the student did.

**What it does NOT cost, and this is what decided the migration question.** The policy is
ownership-scoped, and that scoping is mutation-proved: with
`classroom_owns_submission_object` opened to `select true`, bruno plants a file in
alice's folder and alice reads a file she never put there; with it restored he is refused
again. **So a student can destroy only their OWN work.** It is self-harm plus a teacher's
inconvenience, not a disclosure, not a cross-student reach, and not an escalation.

The milder twin is recorded beside it: the INSERT policy is ownership-only too, so a
student can put bytes into their own prefix on a submitted hand-in. That buys nothing --
the attach refuses, so the object is orphaned the moment it lands, serves to nobody and is
listed by nothing.

## Why no migration was written, and what to write instead

The prompt permitted one, conditionally: only if leaving the defect live overnight is
worse than shipping a schema change from a test bundle. **It is not, and the reason is
the paragraph above** -- the catastrophic reading is closed, and what is open destroys
only the actor's own work.

**Against that sits a concrete way to make tomorrow morning worse.** The obvious
narrowing, `and state <> 'submitted'`, is WRONG, and the reason is a shipped path:
`src/routes/api/classroom/submission-file/+server.ts` uploads the bytes FIRST and records
the row SECOND, and when the record is refused it sweeps the orphaned object **using the
student's own client**. That sweep runs in exactly the `locked` case, so the obvious
narrowing would refuse it every time a student picks a file for work they have already
turned in, and leave an orphan behind. Fixing that has an `src/` half, and `src/` was
read-only for this bundle.

So the fix is **keyed on the ROW, not on the submission**: an object no live row names is
always the owner's to remove (that is the sweep), and an object a SUBMITTED row names is
nobody's.

```sql
create or replace function public.classroom_submission_object_is_locked(p_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
        select exists (
                select 1
                from public.classroom_submission_files sf
                join public.classroom_submissions s on s.id = sf.submission_id
                where sf.storage_key = p_name and s.state = 'submitted'
        );
$$;
revoke all on function public.classroom_submission_object_is_locked(text)
        from public, anon, authenticated, service_role;
grant execute on function public.classroom_submission_object_is_locked(text) to authenticated;

drop policy if exists "submission files delete own submission" on storage.objects;
create policy "submission files delete own submission"
        on storage.objects for delete to authenticated
        using (
                bucket_id = 'submission-files'
                and public.classroom_owns_submission_object(name)
                and not public.classroom_submission_object_is_locked(name)
        );
```

**IT IS NOT A SUGGESTION. It is applied to a database of its own inside this file and
exercised against all four cases** -- a draft hand-in's bytes are still the student's to
remove; **the orphan sweep still works**, which is what rules out the one-line narrowing;
the submitted hand-in's bytes are refused (0 rows deleted) while the teacher still reads
them; and releasing the grade hands the bytes back, in step with the attach. The refusal
is compared against **the unpatched fixture**, where the identical statement on an object
in the identical state removes it, so the 0 is the policy's doing and not the setup's.
The next bundle inherits a measurement rather than a guess. **It still needs the real
upload driven against it before it ships**, which is the whole reason it did not ship
here.

## The gap between the harness and a real student JWT

Asked because a bundle proving a boundary must be able to say whether it proved the
boundary or a model of it.

`db.asUser` sets `request.jwt.claims` to `{sub, role:'authenticated'}` and then `SET ROLE
authenticated` -- exactly what PostgREST does. A real Supabase JWT additionally carries
`email`, `aud`, `exp`, `iat`, `iss`, `aal`, `amr`, `session_id`, `app_metadata`,
`user_metadata` and `is_anonymous`.

**That gap does not reach this boundary, and the reason is structural rather than
lucky.** `current_user_email()` (0067) resolves the caller by reading
`auth.users.email WHERE id = auth.uid()` -- from the table, described in its own comment
as "authoritative rather than profiles.email, a copy written once at signup" -- so every
identity read on this path descends from `sub` alone. Swept: **no function on this path
calls `auth.jwt()`, `auth.email()` or `auth.role()`** (0067, 0082, 0086, 0109, 0133,
0134). A boundary that read the `email` CLAIM would be a boundary this harness could not
test, and none of them does.

**What the harness still cannot say anything about**, and no test here claims to: the
real storage-api request path (these tests reach `storage.objects` in SQL, which is where
the policy lives, but not the HTTP handler in front of it), signed URL minting and its
`download=` header, expiry, and anything about a real browser or a real upload.

## The shim

**Unchanged, and the audit is why rather than the absence of a reason to.** Prompt 0006's
finding holds exactly: `createPostgrestShim` exposes `from(table).select(...)` and
`rpc(name, args)` and nothing else -- no `insert`, no `update`, no `delete`, no `storage`.

But **widening it would have been the wrong instrument even if it were free.** The
storage half of this boundary does not go through PostgREST at all: it goes through
storage-api against `storage.objects`, and what decides it is RLS. Driving that as raw
SQL under `asUser` is the *truer* reading, not the workaround -- and it is what the
existing 0133 suite already does. The shim is shared by every suite that imports it, so a
widening here would have bought a less faithful measurement at the cost of a fixture more
permissive than production, which is one of the shapes the verification standard names.

## Mutation proof, and the bug in the first draft of it

Five denials, each put to a database whose own clause was opened in the PERMISSIVE
direction, on a second fixture of its own. Read predicates opened to `select true`; the
key-ownership `if` made trivially satisfiable rather than deleted; the enrollment `raise`
turned into `null;`, a valid plpgsql no-op, so the guard still evaluates and simply stops
refusing; **both** spellings of the `locked` refusal replaced, since replacing one would
leave a mutation biting on one path and not the other.

**THE FIRST DRAFT LEFT EVERY MUTATION IN PLACE, and it produced exactly the failure
CLAUDE.md warns about.** By the fourth test the database no longer resembled the one
under test: the key-ownership mutation was still live when the enrollment mutation was
measured, and the enrollment case "flipped" for the wrong reason. So each mutation now
captures the shipped definition from `pg_get_functiondef` first, re-applies it in
`finally`, and **asserts the restored definition byte-identical to the captured one** --
the same guarantee an md5 gives a file, taken on a catalog instead. Each rewrite also
asserts its target substring's occurrence count, because a `replace()` that matched
nothing returns the original string happily.

**Two mutations flipped in a way that corrected the assertion rather than the code**, and
both are worth keeping:

* Opening the OWNS predicate lets bruno write into alice's folder but **not read it
  back** -- the SELECT policy asks a different predicate. A read-back would have reported
  the mutation as not biting when it bit exactly as intended. The flip is measured as an
  insert, plus alice reading a file she never put there.
* A raise **rolls its own statement back**, submission row included, so counting rows
  after the mutated attach reported zero and read as a mutation that did not bite. The
  flip is measured through `classroom_open_submission`, which asks the identical gate and
  RETURNS rather than raising, so the row it opens survives.

## What was measured

* `npm run check`: **0 errors, 37 warnings**, breakdown **31 `state_referenced_locally` /
  5 `css_unused_selector` / 1 `perf_avoid_nested_class`**, 2954 files, 20 with problems.
  Re-derived on this machine after `svelte-kit sync` with the two `PUBLIC_SUPABASE_*`
  placeholders exported, per the missing-`.env` trap. Run at **11:46 PDT
  (America/Los_Angeles), 2026-09-05**. The baseline in `CLAUDE.md` is correct as written
  and was not changed.
* The new file alone: **31 tests, all passing, 2.9s.**
* `npm test`: **11:47:26 to 11:50:51 PDT (America/Los_Angeles), 2026-09-05**, 204.1s.
  **274 files, 5648 tests: 5646 passed, 2 failed.**

**BOTH FAILURES ARE INHERITED AND NEITHER IS THIS BUNDLE'S**, which was established by
measurement and not by argument: the new file was moved out of `tests/` with `cp`/`mv`,
`tests/derived-numbers.test.ts` was run against the resulting tree (byte-identical to
`origin/integration`) and **failed identically**, and the file was moved back and
**md5-verified against the copy** (`814ef1dc…`, matching). No `git checkout --` was run
on anything, at any point.

The failure is the stale measured region again, one bundle after the last one fixed it,
and it is precisely traceable. The tree holds **106** route specs; the measured region
covers **103**; the three uncovered are `themes.mjs`, `themes-signedout-1.mjs` and
`themes-state-matrix.mjs`, added by `3c1b38c` (the Matrix site theme). The region was
regenerated at `c7f57b9`, on the autoresize branch, which did not carry them; the two
merged into `integration` and the region has been three specs stale ever since. **Closing
it needs `npm run verify:readme`** -- a full browser pass over every route at both widths,
466s and a dev server on the last measurement -- and both the README and `tools/` are
outside this bundle's ownership. No route spec was added here, so per the prompt nothing
was regenerated.

## Not verified

* **The live Supabase project.** The local `.env` is the placeholder `example-ref`, and
  in this container there is no `.env` at all. Nothing here applied a migration, ran an
  RPC or signed in against production. **Every claim above is against the embedded
  Postgres fixture with the real migration files applied to it.**
* **A real browser, a real upload, a real signed URL.** No `verify:browser` run: this
  bundle touches no rendered surface. So the storage-api HTTP path, the signed upload
  URL, the `download=` header on the way back and the 200 MiB cap **as Storage enforces
  it** are all read out of the migration and the route rather than driven. The bucket
  columns are asserted; the enforcement is not.
* **The proposed policy against the real upload path.** It is measured in the fixture,
  including the orphan sweep, but nobody has uploaded a file through
  `/api/classroom/submission-file` with it applied.
* **The two `derived-numbers` failures were not fixed**, only traced. The tree is three
  route specs stale in its measured region and stays that way.
