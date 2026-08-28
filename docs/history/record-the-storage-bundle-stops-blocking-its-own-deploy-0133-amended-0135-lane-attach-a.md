---
title: "The storage bundle stops blocking its own deploy (`0133` amended, `0135`, `lane/attach-any-type`)"
date: 2026-08-24
branches: [lane/attach-any-type]
migrations: ["0135"]
subsystems: ["IDEA Classroom"]
record_order: 135
---

## The storage bundle stops blocking its own deploy (`0133` amended, `0135`, `lane/attach-any-type`)

Four things, three of which were defects in the bundle above rather than new
features. The SQL and its tests are on `main`; the build change and the harness
are on `lane/attach-any-type`. NOTHING was merged to `main` from the lane.

### `0133` widened two RPCs and dropped the arities production calls

**The bundle above could not be deployed in either order, and nobody noticed
because both halves were correct on their own.** `0133` dropped
`classroom_add_attachment(uuid,text,text,text,bigint)` and
`classroom_add_submission_file(uuid,text,text,text,bigint,text,text)` and
recreated each one parameter wider. The client running on `main` names exactly
the old key sets, verified by reading the two routes. So applying the SQL took
every upload down until the storage client shipped, and shipping the client
first took every upload down until the SQL was applied. There is no ordering
that avoids an outage, and the migration's own header documented the ordering as
though there were.

`0133` has never been applied to production, so it was amended IN PLACE rather
than corrected by a follow-up. It now drops nothing a deployed client names.

**THE HARD PART IS NOT KEEPING BOTH ARITIES, IT IS KEEPING THEM RESOLVABLE.**
CLAUDE.md's signature trap says two overloads differing only by a DEFAULTED
trailing parameter make PostgREST unable to resolve the call at all, so the
naive additive fix (keep the old one, give the new parameter `default null`)
reproduces the exact outage it was meant to avoid, from a file that reads like
it is being careful. What separates the pair here is that the WIDE form declares
**no defaults at all**:

- the 5-key payload the deployed client sends binds only to the narrow form,
  because the wide one needs `p_storage_key` and has no default to supply it;
- the 6-key payload the storage client sends binds only to the wide form,
  because the narrow one has no `p_storage_key` to bind.

The smallest call the wide form accepts is strictly larger than the largest call
the narrow one accepts, so the pair is unambiguous under ANY resolution rule
rather than under a particular one, which is the property worth having in a
component nobody here can step through. Postgres forbids a required parameter
after a defaulted one, so "no defaults on the wide form" is all-or-nothing
rather than a choice about the last parameter.

The narrow forms became thin wrappers that call through with a null key, and
each **re-raises its own original refusal text** (`A Drive file id is
required.`) ahead of delegating. The wide body's "attach exactly one of" is the
right sentence for a caller with a choice and the wrong one for a caller without
one, and a client that has not been redeployed should see the errors it has
always seen.

`0134` re-creates the wide hand-in RPC, so it carries the same no-defaults
signature and the same guard; a restored `default null` there would have re-armed
the trap from a file that reads like it only touches a race.

**Measured, and printed rather than compared:** after applying and re-applying
both files, `pg_proc` holds `classroom_add_attachment` at 5 args
(`ndefaults=1`) and 6 args (`ndefaults=0`), and `classroom_add_submission_file`
at 7 args (`ndefaults=3`) and 8 args (`ndefaults=0`), identical before and after
the second apply.

**Re-apply is load-bearing here, not decoration.** Postgres REFUSES to remove a
parameter default through `create or replace` ("cannot remove parameter defaults
from existing function"), so a machine holding an earlier draft of `0133` would
reject the amended file. Both files therefore `drop function if exists` at their
OWN new signature first, a form that has never existed outside a dev database.
No drop in either file names an arity any client calls.

**What undoes `0133`:** drop the six functions and six storage policies it
creates, delete the two buckets and their objects, drop the two widened arities
(no client redeploy needed, since the deployed ones never went away), restore
the `0085`/`0086` bodies for the four RPCs, and drop the `storage_key` columns
and their CHECKs. The full list is in the file's own footer.

### `0135`: the third bucket, the public read, and a duplicate that raised

- **Instructor-only attachments were left on the 4 MiB Drive ceiling**, which
  `0133` called a stated gap. It is the wrong gap: an answer key is where a
  large CAD file most belongs. The reason `0133` gave was real --
  `classroom_can_read_instructor_material` is manager-only, so those objects
  cannot share the `classroom-attachments` prefix without becoming readable by
  every enrolled student -- and the answer is the third bucket that reason
  implies. The WRITE predicate is `0133`'s, reused rather than copied: "does the
  caller manage the item named by the key's first segment" is the same question
  with the same answer, and a second copy under an instructor-flavoured name is
  the thing that stops matching. Only the READ predicate is new.
- **A public reference document 404'd on a storage-backed attachment.**
  `classroom_public_attachment` projected `drive_file_id` only and every `0133`
  storage policy was `to authenticated`, so a signed-out visitor following a
  printed QR code got nothing. Both halves are fixed. The payload widening is a
  DISCLOSURE DECISION and is argued in the file: the key adds the item id the
  caller already holds, a uuid that names nothing, and an extension the filename
  already carried. No person, no email, no other item, and it is not itself a
  capability without a policy that admits the caller. The policy names ONE
  bucket and asks the same three conditions (`material`, `is_public`,
  `_classroom_item_live`) the public payload already applies, so there is one
  definition of "public". The signed-in branch is included because being signed
  in is not being enrolled: a visitor with a Google account would otherwise be
  the only person who could not read a public document.
- **Duplicating an item that held a storage-backed attachment RAISED**, measured
  rather than reasoned about: `new row for relation "classroom_attachments"
  violates check constraint "classroom_attachments_one_handle"`.
  `classroom_duplicate_item` copies attachment rows BY NAME and its column list
  predates `storage_key`, so the copy carried neither handle. Adding the same
  CHECK to the instructor table would have shipped a second copy of the break.
  `0108`'s body is re-signed with `storage_key` added to two INSERT lists,
  diffed against that file rather than reconstructed.
- **The copy is by reference, so the read predicate had to widen with it.** A
  copied key still names the ORIGINAL item in its first segment, so a
  prefix-only read would have listed a file the copy's section could not open.
  `classroom_can_read_attachment_object` now ORs in "may the caller read the item
  of any row that names this object". INSERT and DELETE stay on the prefix
  deliberately: writing is a claim about a key with no row yet, and a manager of
  a COPY must not be able to delete bytes the original still serves.

**Mutation proof**, in the permissive direction, restored md5-identical after
each:

- widening the anon policy to all three buckets: the MIGRATION's own guard
  refused to apply, so the file fails closed and the tests never ran;
- dropping `is_public` and the live check from the public predicate: reddened
  exactly the three assertions that should catch it (private item signed out,
  unpublished item signed out, and the pre-copy control);
- pointing the instructor read predicate at `classroom_can_read_item`: reddened
  the enrolled-student denial and nothing else.

### The `/dev/*` harnesses were compiled into production

Reported as an authentication bypass. **It was not one, and the reason is worth
recording so it is not re-litigated:** `dev` from `$app/environment` is not an
environment variable, and SvelteKit replaces it with the literal `false` during
`vite build`. The compiled `/dev/login` load is an unconditional
`error(404, "Not found")` with the branch folded away. Nothing about that can be
misconfigured on a deploy, and every `/dev/*` path was verified to answer 404
when served from a real production build.

**What WAS wrong is that the guard has to run, which means the module has to
exist to run it.** A production build compiled 105 dev route entry files
totalling **720,149 bytes** of harness, fixtures and components into the server
bundle, all unreachable. A guard that has to fire is one that can be edited,
forgotten on a new harness, or routed around.

A Vite plugin gated on `apply: 'build'` -- a property of which command is
running, not of any runtime value -- now replaces each route entry's SOURCE with
a 404 stub before the compiler sees it. Same 105 paths, **19,150 bytes**, every
one a stub. `vite dev` never invokes the plugin, and the harnesses were confirmed
to still work.

**SvelteKit 2.66 has no route-filter config** (no `kit.routes`, no
`excludeRoutes`), so the route PATHS still appear in the manifest. That is stated
rather than glossed: the path answering 404 with an empty stub and the path not
existing are the same answer to a caller, and erasing the difference would mean
mutating the working tree mid-build.

The rule lives in `src/lib/dev-routes.ts`, not in `vite.config.ts`, for the
reason the site-version rules do: a build config is the one file a test cannot
reach. The sweep asserts its own case count so a glob that matched nothing cannot
pass as coverage.

### Measured, on the student hand-in failure path

Through the real `FileUploadPanel` in the upload harness, hand-in side:

- **one oversized file staged beside a good one:** 2 picked, 1 landed, 1 failed.
  The failed file stayed staged with a Remove button and the real refusal
  sentence, limit named: "That file is 2.0 MB, and the limit is 200 MB. Nothing
  about retrying will change that". Retry buttons offered: **0**, which is
  correct, because a size refusal is not retryable. The file that landed was
  cleared and the one that did not was kept.
- **nine files where the third fails:** 9 picked, 9 attempted, 8 landed, 1
  failed. Files four through nine all landed. The old `AssignmentEngine` loop
  stopped at the first failure and abandoned everything after it; that is gone.

The harness gained a mode for the first case, because every existing failure mode
was all-or-nothing and the one-bad-file case could not be reproduced at all.
Failure is keyed on the FILENAME rather than a counter, since the calls are
concurrent and a counter makes which file fails depend on scheduling.

**Not shown by the harness:** that the submission ROW is created. The transport
is faked at the documented injection point, so there is no submission to inspect.
That property is covered at the database level by
`tests/classroom-submission-open-race.test.ts` instead.

### NOT DONE, and not attempted

- **Thumbnails for storage-backed images are still missing.**
  `isSubmissionFileImage` branches on `mime_type`, and the storage path stores
  `application/octet-stream` for every file on purpose, so every storage-backed
  image renders as a download row. The fix is an extension-based predicate, but
  `SUBMISSION_FILE_SELECT` does not carry `storage_key`, so it needs a select
  LADDER rung and a capability flag across two call sites first. Started and
  deliberately stopped rather than half-landed.
- **Instructor uploads still go through the Drive route.** `0135` gives them a
  bucket and additive RPCs, so the database half is ready and inert. Nothing
  emits the wider shape yet, which is the correct direction for a gate to precede
  its producer.
- **The public serve route was not changed.** `0135` makes a public item's object
  readable without a session and projects the key, but
  `/api/classroom/attachment/[attachment_id]` still answers 401 without a
  session, so the gap is closed in the database and still open in the route.
- **Nothing was verified against the live Supabase project.** The local `.env` is
  a placeholder, there is no WSL distro or Docker on this machine, and no local
  stack was running. Every SQL claim here is against embedded Postgres with the
  real migration files applied unmodified. **No real PostgREST was exercised**, so
  the overload-ambiguity claim is taken from CLAUDE.md, where it is recorded as
  having bitten twice; what is asserted instead is the structural property that
  makes the question moot.

---

