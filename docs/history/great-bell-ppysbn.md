---
title: "IdeaCAD document sharing: decision 24's data layer, the two defects the tests found, and the half of his sentence that is still not true"
date: "2026-09-12"
branches: ["claude/great-bell-ppysbn"]
migrations: ["0205"]
subsystems: ["IdeaCAD", "Classroom", "Database", "Testing"]
---

Ledger 0179. Mr. Pina decided decision 24 on 2026-09-12 and this bundle recorded it and
built the data layer for it. His model, in his words: like Google Docs. A student makes a
document and it is PRIVATE BY DEFAULT. The owner may share it with named classmates as
VIEW-ONLY or as EDITOR. He and Mr. Cosso SEE AND EDIT EVERYTHING BY DEFAULT, without
asking and without a student granting anything -- he called that "very convenient and
powerful" and wants it kept.

One migration, `0205_ideacad_document_sharing.sql`, claimed and taken. No `.svelte` file:
ledger 0178 owns `BladeEditor.svelte`, `ItemDetail.svelte` and the item route, and none of
the three is touched.

## What was already true, measured before anything was written

The prompt's own measurement checked out, and one part of it mattered more than expected.

`0201` creates `ideacad_documents` with `student_email text not null` and
`unique(item_id, student_email)`, so **private by default was already the shipped state**
-- there was nothing to build for that half. Ten RPCs exist; **seven of them** are the
student write path and each pins its row through `student_email =
public.current_user_email()` (`ideacad_new_concept`, `_save_concept`,
`_update_concept_meta`, `_delete_concept`, `_set_active`, `_set_prediction`,
`_commit_concept`), with `ideacad_set_editor` and `ideacad_roster` teacher-gated on
`_classroom_manages_item` and `ideacad_open_document` resolving its caller through
`_classroom_engine_student`.

**The instructor READ half already worked and was not rebuilt.** All three read policies on
documents, concepts and predictions are `student_email = current_user_email() or
_classroom_manages_item(...)`. So the missing thing was only ever the student-to-student
half, exactly as the prompt said.

## What 0205 adds

One table, `ideacad_grants`, one row per `(document_id, grantee_email)` carrying a role of
`viewer` or `editor` plus `granted_by`. Four private SECURITY DEFINER predicates. The three
read policies widened by a disjunct each, plus a read policy on the new table. The seven
student write functions widened to admit an editor grantee and to keep refusing a viewer,
**every signature unchanged**, so there is no drop, no overload and no deploy ordering: the
already-deployed client keeps calling the same shapes and this file and any client that
uses sharing may land in either order. Five new RPCs: `ideacad_share_document`,
`ideacad_unshare_document`, `ideacad_document_grants`, `ideacad_open_shared_document` and
`ideacad_shared_with_me`.

`ideacad_roster` is untouched. It is the teacher view, it already enumerates the enrolled
population and left-joins each student's own document, and sharing does not change who is
on a roster.

### Why opening a shared document is a second function and not a wider `ideacad_open_document`

`ideacad_open_document` takes an ITEM and resolves the CALLER'S OWN document, CREATING the
row and seeding `Concept 1` when they are absent. A grantee's access is to somebody else's
document, so the lookup key is different -- a document id, not an item id -- and the
creation is actively wrong twice over: a viewer must not mint rows in a document they
cannot write, and an owner who has not opened theirs yet has nothing for a classmate to
read. So `ideacad_open_shared_document` NEVER WRITES, and it returns the caller's own
`role` and `canWrite` in the payload so a client can render a read-only surface without
asking a second question.

`ideacad_shared_with_me` exists because a grantee otherwise has **no way to learn a
document id at all**: the roster is teacher-only and a classmate's document is on no
surface a student can already read.

## The three defects the tests found, which is the argument for the tests

All three were in the migration, all three were found by running it against a real Postgres
with the real chain applied, and none would have been visible by reading the SQL.

### Mutual RLS recursion, on the first read a grantee makes

The first draft spelled the cross-table lookups out INLINE. The `ideacad_documents` policy
carried `exists (select 1 from public.ideacad_grants g where ...)` and the
`ideacad_grants` policy carried `exists (select 1 from public.ideacad_documents d where
...)`. Each policy then queried the other table, whose policy queried back, and Postgres
answered

    infinite recursion detected in policy for relation "ideacad_documents"

on the first read the viewer made. **The comment justifying the inlining was wrong in its
own terms too**: it argued that inlining avoided needing an `authenticated` EXECUTE grant
on the predicates, which was true and beside the point.

Every policy now delegates to a SECURITY DEFINER predicate, which runs as the owner and so
does not re-enter RLS. That is also this repo's standing rule -- visibility delegates to
one function rather than restating who may read what -- so the fix moved the file onto the
convention rather than away from it. Two of the four predicates
(`_ideacad_can_read_document`, `_ideacad_manages_document`) are named inside policies and
therefore MUST hold `authenticated` EXECUTE, because a policy expression is evaluated as
the querying role; without it the read fails with `permission denied for function` instead
of returning the caller's own rows, which is 0109's lesson about `classroom_can_read_item`.
The other two are reached only from definer bodies and hold nothing.

**The self-check now EXERCISES the four policies rather than counting them.** Counting four
policies passes on the recursing shape, because the recursion raises at read time and not
at create time.

### A migration that worked exactly once

Each policy dropped 0201's name and created a new one. On a second paste 0201's name is
already gone and this file's own policy is there, so the create failed with
`policy "owners, grantees and managers read ideacad documents" ... already exists`. Both
names are dropped before each create now, and the grant-surface test applies the whole
file TWICE, which is what found it.

### A self-check that overreached, and falsified another migration's negative control

The first draft did two things that look like diligence and were not. Its self-check swept
every function matching `^_?ideacad` and hard-failed on any that was anon-executable; and
section 6 re-revoked 0201's seven widened functions as defence in depth.

`tests/db/ideacad-grants-anon-execute-surface.test.ts` **section E** is a deliberate
negative control: it boots the chain MINUS `0202` and asserts all TEN of `0201`'s functions
are anon-executable there, so that "0202 closes them" is a measured difference rather than
an assertion about a file. The prefix sweep **refused to apply** on that database -- naming
`ideacad_open_document`, `ideacad_roster` and `ideacad_set_editor`, three functions `0205`
never mentions -- and the re-revoke **closed seven of the ten in it**, quietly falsifying
the control even once the sweep was fixed.

**Both are now scoped to what this file introduces.** The revoke names the five new RPCs
and the four predicates; the self-check hard-fails only on those nine and raises a NOTICE
naming any other anon-executable ideacad function, so the information survives without
blocking the apply. That is also the correct scope on its own terms: a migration that
refused to apply because ANOTHER migration's objects were mis-granted would block a
legitimate apply order, and the three functions this file never mentions are `0202`'s.

The general lesson, which is the one worth keeping: **an apply-time guard that sweeps a
whole subsystem by name prefix is asserting something about migrations that do not exist
yet.** It is the right instrument for the objects the file owns and the wrong one for the
objects it does not.

## A claim this bundle wrote down and then measured false

The file's header originally said the seven widened functions had to be re-revoked because
`create or replace` under this project's default privileges can hand a function a fresh
`anon` grant -- and that 0205 would otherwise be a silent partial revert of `0202` on the
ten functions `0202` exists to have closed.

Measured on the embedded fixture, which carries the project's default privileges: a
function is anon-executable **at create (true)**, **false after `revoke all ... from
public, anon, authenticated`**, and **still false after a `create or replace` of its
body**. So a replace PRESERVES a narrowed acl and the seven were never at risk.

The five NEW functions genuinely are, which is `0201`'s defect exactly. Confirmed by
reverting section 6 to the bare `from public` form, where the self-check refuses the apply
with

    0205: 5 ideacad function(s) are still executable by anon: ideacad_document_grants(uuid),
    ideacad_open_shared_document(uuid), ideacad_share_document(uuid,text,text),
    ideacad_shared_with_me(uuid), ideacad_unshare_document(uuid,text)

naming those five and only those five -- which is the same measurement from the other side.
**So the re-revoke of the seven was dropped rather than kept.** It was written as defence
in depth on the strength of a worry the measurement refuted, and the section above is the
cost it turned out to carry. The header now says which it is.

## The four properties, each proved in both directions

**A VIEWER READS AND CANNOT WRITE.** The read half is measured against the same three reads
run by a CLASSMATE in the same section with no grant -- 1/1/1 for the viewer against 0/0/0
for the classmate, so a read that came back for everybody could not pass as a grant
working. The write half is all seven write RPCs refusing, each naming view-only access,
against the CONTROL of the same seven run by the EDITOR grantee and all seven succeeding.

**And "wrote nothing" is asserted from the table rather than from the refusals.** Each
caller's attempts carry their own marker string, and the assertion is that the viewer's
marker appears in zero feature trees, concept names and prediction rationales -- read as
the connection owner, so RLS cannot hide a write that did happen, and including
soft-deleted rows, so a write followed by a delete still counts. The editor's marker
appears in at least three places on the same read.

**A STRANGER SEES NOTHING.** Two kinds, because they fail differently: the OUT-OF-CLASS
stranger enrolled in a different section, and the IN-CLASS CLASSMATE enrolled in the very
section the item is posted to with no grant -- who is the one a policy written as "enrolled
readers" would admit, and the one a leak actually reaches. Both get 0 rows from all four
tables, refusals from all seven writes, from both owner-only sharing RPCs, from the grant
list, from the shared open and from both teacher-only RPCs. **A real document id answers
IDENTICALLY to a nonexistent one** on the grant list and the shared open, so an id cannot
be probed by comparing two messages. And a stranger is never told they are view-only, which
would confirm both that the document exists and that they are on its grant list to somebody
who is on neither.

The RPC surface is enumerated FROM THE CATALOG rather than from a list in the test, so an
eleventh function added later is covered rather than silently skipped, and the case count
is asserted.

**THE INSTRUCTOR PATH IS UNCHANGED.** A teacher of record holds no grant row -- asserted
first, as the premise -- and reads all four tables, gets the roster with the student's
document on it, reads the grant list through both the table and the RPC, and can open a
student document read-only. A teacher of a DIFFERENT section gets 0 rows from all four
against the teacher of record's 1/1/1/1 on the same fixture, and is refused by the roster,
the grant list and the shared open; ledger 0152's shape, and the premise that they really
do manage a real section is asserted so the absences cannot pass vacuously.

**The delegation chain is asserted rather than the policy text.** The manager term now sits
one level down, so the test checks that every policy names one of the two read predicates
AND that both predicates' `prosrc` calls `_classroom_manages_item`, and that neither a
policy nor a predicate re-derives it from `classroom_postings`. That is the stronger claim:
it pins that the instructor path is still the same call to the same function every other
classroom surface asks.

**ONLY THE OWNER GRANTS.** The EDITOR is the case that matters -- a viewer being unable to
re-share is nearly self-evident, while an editor can write every part of the document, so
"can write" sliding into "can re-share" is the plausible mistake and the one with an
unbounded blast radius. Refused at both roles, refused for unsharing anybody including
themselves, refused for promoting themselves through the RPC and directly at the table, with
the grant list asserted unchanged after each (a refusal message is not proof that nothing
changed). The CONTROL is the owner doing every one of those things successfully.

## Seven mutants, all detected

Run against the four property files, with the file copied to disk first and restored FROM
THAT COPY -- never `git checkout --`, which is a discard-to-HEAD and has taken three
sessions' uncommitted work in one week. Restored byte-identical, md5 confirmed.

| Mutant | Detection |
|---|---|
| read predicate → `select true` | 6 assertions reddened |
| write gate admits a viewer (`role is not null`) | 4 reddened |
| owner-only grant → any reader may share | 6 reddened |
| classmate-population check → `if false` | 4 reddened |
| grants policy → `_ideacad_can_read_document` (grantee sees whole list) | 1 reddened |
| section 6 reverted to bare `revoke ... from public` | **apply REFUSED** by the self-check, naming the 5 functions |
| table revoke removed (inherited privileges kept) | **apply REFUSED** by the self-check |

The last two are the interesting shape: they do not redden an assertion, they stop the
migration applying at all, which is the self-check doing its job and is why the suite
reported all-skipped rather than all-failed for those two.

## The client layer, and why it mounts nothing

`src/lib/ideacad/sharing.ts` is the pure client-safe registry: the role union, ONE
capability table, the words, the normalization, the grant-list arithmetic that mirrors the
RPC's own upsert, and the capability ladder. No Svelte, no transport, no client in it.

**It is explicitly not the authorization boundary**, and the module says so: every rule in
it mirrors a rule the database enforces inside a definer function, and it exists so a
surface can decide what to RENDER. Its expected values in the test come from the OTHER side
of the wire -- the view-only refusal sentence is read out of the `.sql` file and the role
vocabulary out of the CHECK constraint -- because a test whose expectation is derived from
the implementation it tests cannot fail.

The share-target check is a COURTESY and says so in its own comment: a browser cannot read
the enrollment of a class it is not in, so it refuses only what is obviously not an address
and the owner's own address, and every other refusal comes back from `0205` with its own
sentence. `ideacadRoleFromPayload` DROPS a role outside the union rather than coercing it,
and `canWrite` is false for null, so "cannot tell" never renders as the permissive answer.

The five sharing transports in `transports.ts` are all OPTIONAL. A migration is applied by
hand, so a deployment sitting between 0204 and 0205 is a real state; on it the transports
are stripped by `withoutIdeacadSharing` and the surface that would mount a share control
mounts none. Absence is the mechanism, the way an omitted `uploadSubmissionFile` removes
the file picker. `createIdeacadSharingTransports` probes once, degrades on **`PGRST202`
alone**, and fails closed on any other error -- a real fault inside a function that does
exist must not read as a missing feature.

## The blocker this branch leaves standing, named rather than patched

`tests/db/ideacad-grants-anon-execute-surface.test.ts` **fails on this branch and passed in
the baseline**, so this bundle introduces it. It is not fixed here, because the fix is a
two-file change in files this ledger does not own and one of them is an APPLIED migration.

`0202`'s apply-time self-check makes two assumptions that were true of `0201`'s world and
stop being true the moment IdeaCAD grows a private helper. Each was measured by relaxing
the other:

- `if v_total <> 10 then raise` over a `^_?ideacad` sweep. `0205` adds nine, so a re-apply
  raises `expected 10 ideacad functions in public, found 19`. **Any future ideacad
  migration hits this**, and the guard's own message anticipates exactly this case: "if a
  later migration added another, revoke it there and update this count deliberately."
- every `^_?ideacad` function must hold `authenticated` EXECUTE, raising `... LOST the
  authenticated grant ... the narrowing went too far and the feature is down` for
  `_ideacad_can_write_document(uuid)` and `_ideacad_document_role(uuid)` -- which withhold
  it deliberately, being reached only from definer bodies with nothing naming them in a
  policy.

**A candidate fix was built and verified as far as it goes, then reverted byte-identically
rather than shipped.** Scoping `0202`'s loop to its own ten by name -- the same decision
`0205` took for its nine, and it also needs `p.proname` added to that loop's select, which
it does not project -- makes the migration apply and makes section E measure its property
correctly again: `anon-executable ideacad functions -- with 0202: 0, without it: 10`. **The
test's section B then fails on two further assertions** ("has all ten functions and no
more", "keeps all ten executable by authenticated") which read the live catalog and pin the
same two assumptions. So the complete fix is the migration AND its test, and it is ledger
0161/0162's lane.

Both files are byte-identical to `HEAD` on this branch, confirmed with `git diff --quiet`.
This is the same shape as the precedent in `docs/history/hopeful-edison-pd3p6r.md`, where a
branch's CI could not go green until another lane's migration landed: the honest move is to
name it, not to reach into somebody else's file.

## The numbers

**Full suite on this branch: 414 files, 413 passed / 1 failed; 7977 passed + 14 skipped,
393.21s.** Baseline **408 files / 7903 passed / 0 failed / 416.53s**, measured on a clean
`git worktree` at `origin/integration` `6a71eff4` rather than in place, so this bundle's own
files could not land in their own baseline.

**The arithmetic reconciles exactly**, which is the check worth doing on a delta like this:
7903 + this bundle's 88 new assertions - the 14 in the blocked file (which skip rather than
fail, because its fixture cannot build) = 7977. Delta +6 files, all six this bundle's. The
single failing file is the blocker above; every one of this bundle's 88 assertions passes.

**Run twice.** The first run reported the same single failure at 415s but overlapped
single-file runs of mine on the shared cluster, which is exactly the contention
`--no-file-parallelism` exists to avoid; the number above is the second, uncontended run.

**svelte-check: 0 errors, 38 warnings in 21 files, at 32 `state_referenced_locally` / 5
`css_unused_selector` / 1 `perf_avoid_nested_class`** -- byte-identical to the baseline
measured on the same worktree, which is the expected result for a bundle that adds two
`.ts` files and no component. `CLAUDE.md` still says 40 in 22; this is the fifth lane to
measure 38 in 21 and this bundle does not own that file, so the correction is reported
rather than made.

**Paste trap: zero, two ways, against three planted positive controls.** 404 commented
lines carry 0 dollar-quote tokens and 0 bare `$` of any kind; 38 code tokens sit in 19
balanced pairs on code lines. The controls: a `$tag$` planted in a comment reads 1, a bare
`$$` in a comment reads 1, and a lone `$` in a comment reads 1 on way 2 only -- so the two
ways are genuinely independent and neither zero is vacuous.

**The verification query returns 10 rows with every `ok` column `t`**, measured by running
it against the real chain rather than predicted.

## What is NOT verified

- **`0205` is not applied anywhere.** This container cannot reach production and did not
  try. `IDEA_MIGRATION_URL` and `DEPLOY_PROBE_URL` are unset, so the applied set is CANNOT
  SAY from here and Mr. Pina reads it.
- **No browser, no mounted surface, no screenshot.** This bundle writes no `.svelte` file,
  so `npm run verify:browser` and `verify:readme` were deliberately not run. Every claim
  here is a database or arithmetic claim.
- **No signed-in session and no real Supabase project.** The `.env` in this container is
  the placeholder (`example-ref`).
- **The 200-document case is not measured.** `ideacad_grants_grantee_idx` is there for
  `shared_with_me`, but no query plan was read and no fixture has more than a handful of
  rows. Nothing here is a performance claim.
- **No cap on how many classmates a document may be shared with.** A student may share with
  the whole class. That is legitimate today and may not want to be forever; it is named
  here rather than guessed at.

## What sharing makes possible, and what part checkout still needs

Mr. Pina specified assemblies and part checkout -- an IDEA-Blade is multiple parts, one
holder per part, the assembly owner reassigning live -- and the prompt put them out of
scope. Measured, so the next bundle starts from measurement rather than from this
paragraph:

**WHAT SHARING NOW MAKES POSSIBLE.** A team of three can work in ONE document: the owner
grants `editor` to two classmates and all three write the same feature tree through the
same seven RPCs. `ideacad_save_concept`'s revision compare is the existing conflict
mechanism and it already works per caller -- a stale revision returns
`{ok:false, reason:'stale', concept}` with the stored row rather than clobbering it, so two
editors racing one concept get a refusal and the current state rather than a lost write.
Presence (`0200`) and the realtime layer are per item and per roster, so a second editor is
already visible. And the grant row is a real relation between people and a document, which
is what decision 24's cost table said three per-student documents lacked.

**WHAT PART CHECKOUT STILL NEEDS, and the first item is the blocker.**

1. **`ideacad_documents` must hold more than one part.** It holds one feature tree per
   document through `ideacad_concepts.features`, and `unique(item_id, student_email)` means
   one document per student per assignment. An assembly of N parts has no representation at
   all -- neither a parts table, nor a parent-child key, nor a slot for an assembly. This
   is a migration and it is the whole of why checkout is a later bundle: **there is nothing
   to check out yet.**
2. **A holder is not a grant.** A grant is a standing capability on a whole document; a
   checkout is an EXCLUSIVE, transient claim on ONE part, held by one person at a time,
   reassignable by the assembly owner while the holder is still in the editor. Those are
   different lifetimes and different tables. The capacity rule needs a ROW LOCK on the
   parent (`select ... for update`), not a count-then-insert, because there is no child row
   to lock for a caller who does not hold one yet -- and `now()` cannot appear in an index
   predicate, so "currently held" cannot be a partial unique index and the advisory-lock
   shape `_foundry_play_window` uses is the precedent.
3. **Reassigning live means the holder has to be told.** Revoking a checkout under somebody
   who is mid-edit is a write they will lose. The revision compare refuses the save, which
   is correct and is not the same as telling them; that is a realtime frame plus a surface
   decision, and it is the part most likely to be underestimated.
4. **Whose grade it is remains open.** Sharing gives a team one document; it does not say
   which of three enrolled students' roster rows a team grade hangs off, and
   `ideacad_roster` still returns one row per student with that student's own document, so
   a grader sees one document with work in it and two empty ones. Recorded in decision 24
   as the surviving half of its own cost table.
