---
title: "A departing student's IdeaCAD document was reachable by policy and listed by nothing, because the only surface that names one drives off the enrollment; 0214 adds the archive state, an item-keyed instructor read and the instructor-shares-to-a-class grant decision 29 asked for, and closes a canWrite defect 0205 shipped (`claude/youthful-lovelace-kg9482`, migration 0214)"
date: 2026-09-13
branches: [claude/youthful-lovelace-kg9482]
migrations: ["0214"]
subsystems: ["IdeaCAD", "Classroom", "Database"]
---

Decision 29, answered by Mr. Pina on 2026-09-13: when a document's owner leaves a
section the document AND ALL ITS WORK IS ARCHIVED, NOT DELETED, and stays
accessible to the admin instructor; if the instructor shares an archived document
with a class, those students get access to it too. His reason is the whole design
constraint and every narrowing below was checked against it -- he regularly brings
up past student work to show current students as reference, and work from students
who have since left is exactly what he wants to be able to show.

Ledger 0212 shipped the smallest first move as `0213`: `classroom_remove_enrollment`
now counts IdeaCAD documents and REFUSES a removal with the number. That is the
guard and not the archive. This bundle is the archive.

## What was already true, and it is the estimate that turned out pessimistic

Decision 29's costing said every existing read "has to be audited for it, and the
audit is the work", naming `_ideacad_can_read_document`, `_ideacad_can_write_document`,
`ideacad_roster`, `ideacad_shared_with_me` and `ideacad_open_shared_document`.
Measured, the read half of that was already done:

`_ideacad_can_read_document` (0205) is `role is not null or exists (... and
_classroom_manages_item(d.item_id))`, and `_classroom_manages_item` (0085 line 467)
reads `classroom_postings` and `classroom_manages_section` and **never**
`classroom_enrollments`. All four select policies on `ideacad_documents`,
`ideacad_concepts`, `ideacad_predictions` and `ideacad_grants` delegate to it, and
so do 0207's `_ideacad_part_reader` and 0209's history policy. So a teacher of
record could already SELECT a departed student's document, its concepts, its parts
and its history, and could before this bundle.

**What was not true is that anything would LIST it.** `ideacad_roster` (0201 line
34) builds its driving set from `classroom_enrollments` and LEFT JOINS the document
onto it, so the address leaving the roster takes the document off the only surface
in the product that names one. The reach was there; the listing was not. That one
sentence is why the fix is a new item-keyed function rather than a new policy, and
`tests/db/ideacad-archive.test.ts` section A pins both halves -- the teacher reads
the rows through RLS, the read predicate names no enrollment, and `ideacad_roster`'s
deployed body does.

## The shape, and the one thing that was nearly missed

Six objects created, six replaced. The state is `archived_at` and `archived_by` on
`ideacad_documents`, paired by a CHECK so a stamp with no hand behind it cannot
exist. The path is `ideacad_set_document_archived(uuid, boolean)` -- one function
for both directions, `foundry_set_app_hidden`'s shape, because an archive that
could not be undone by the same call is a one-way door. The instructor read is
`ideacad_archive(p_item_id)`, keyed on the item.

**AN ARCHIVED DOCUMENT STOPS BEING WRITABLE THROUGH ONE TERM IN TWO PREDICATES,
AND THE SECOND IS THE HALF THAT IS EASY TO MISS.** Every write in the feature
funnels through `_ideacad_can_write_document` -- 0205's seven concept writers,
0209's `ideacad_apply_actions`, and 0207's `_ideacad_part_writer` on its wide rung
-- so narrowing that one function looked like the whole job. It is not.
`_ideacad_part_writer` **short-circuits on `_ideacad_part_owner` at 0207 line 482,
before it ever consults 0205's rule**, and four more part writes gate on
`_ideacad_part_owner` directly: `ideacad_add_part` (630), `ideacad_update_part_meta`
(691), `ideacad_release_part`'s fallback (912) and `ideacad_assign_part` (949).
Narrowing only the first would have left five assembly writes open on an archived
document, silently, with every concept write correctly refused beside them. Both
predicates now call one new `_ideacad_document_archived(uuid)`, so they cannot come
to disagree, and `_ideacad_part_writer` itself needed no change because both of its
rungs are closed by their own terms.

`_ideacad_part_owner`'s name is now slightly narrower than its body -- it answers
"may act as the owner of this assembly", which on an archived document is nobody.
Noted in a comment rather than renamed, the way `_classroom_doc_ok` and the
normalizer's `imageBlock` hook are: 0207 grants it by name and renaming a private
predicate to improve a comment is how a caller gets missed. Its one non-gate use is
`ideacad_assembly`'s `isOwner` display flag, which now reads false on an archived
document -- correct rather than collateral, since it is what removes owner controls
from a surface where every one of them would be refused.

**The read side is named nowhere in the file**, so "keeps being READABLE" is
structural rather than a filter somebody has to maintain. The migration's own
self-check asserts that as an ABSENCE: if `_ideacad_can_read_document` ever
mentions the archive, the apply raises.

## A defect in 0205 that a test found and reading did not

`ideacad_open_shared_document` computed its `canWrite` from the ROLE alone --
`coalesce(v_role in ('owner', 'editor'), false)` -- and not from
`_ideacad_can_write_document`. With the archive term added to the predicate and
nowhere else, an archived document answered **`canWrite: true` to its own owner
while every single write refused**: a surface would draw a full set of editing
controls whose only possible outcome is a refusal, which is exactly the failure
"a control whose only outcome is a refusal must not be offered" exists to prevent.

It was found by an assertion written to check something else -- "READS ARE
UNAFFECTED", which asserted `role: 'owner'` and `canWrite: false` on the same
payload. It now asks the same predicate the writes ask, and projects `archived`
beside it, because "you cannot write this" and "this is archived" are different
sentences and a reader needs the second one.

**This is a 0205 defect and not one this bundle introduced**, which matters for the
undo: re-applying 0205's own function to roll `0214` back restores it. The
migration's "what undoes it" section says so explicitly rather than leaving somebody
to rediscover it.

## The class share: what he answered, and the four things he did not

His second sentence reverses 0205's written default (lines 85-89: ONLY THE OWNER
GRANTS, a grantee cannot re-share, one email at a time, and the grantee must be
actively enrolled). An archived document's owner is gone and cannot grant, so this
could not be a widened `if`.

`ideacad_section_grants` is a second table keyed `(document_id, section_id)`.
Fanning a section out into one row per currently-enrolled address was the rejected
alternative and it is a SNAPSHOT: a student who enrolls tomorrow gets nothing and a
student who leaves keeps their row, which is the enrollment drift this whole bundle
exists to stop reasoning from. The grant is evaluated live against
`classroom_enrollments`, so deactivating a recipient closes their access in the same
statement -- measured, both directions, in section E.

**Four narrowings are the builder's judgement and the migration header says so**,
because a session reversing one should know it is reversing a builder and not Mr.
Pina:

1. **A class is ALWAYS a viewer**, and the table has NO ROLE COLUMN, so that is a
   property of the schema rather than a check that could be got wrong. The
   self-check asserts the column's absence.
2. **Only an ARCHIVED document may be shared with a class.** Without it an
   instructor could broadcast a live student's in-progress work to a whole class,
   which is a disclosure nobody has decided.
3. **The target section must be one the assignment is posted to.** This reuses the
   population `ideacad_share_document` already computes and is what lets
   `ideacad_shared_with_me` stay the ONE discovery path with no second function
   keyed on a section. **It has a real cost**: an instructor who authors a new item
   each year rather than re-posting the canonical one cannot reach last year's work
   this way. That is written into decision 29 as the open half rather than left in
   a migration comment.
4. **The owner's address is shown, not redacted.** Redaction was considered and
   rejected because `ideacad_open_shared_document` returns `to_jsonb(d)`, which
   carries `student_email` -- a redacted LIST beside an unredacted OPEN reads as a
   guarantee and is not one. The surface says so in words before the press instead,
   which is `FoundryShare`'s answer to the same problem.

Restoring a document DELETES its class grants in the same statement, and re-archiving
does not bring them back. That falls straight out of (2): a restored document holding
a class grant would be live work shared with a whole class through a door closed to
every other route.

## Two findings from the suite, both of them about this file holding somebody else's ground

**A HARD PRECONDITION ON 0207 FAILED A CHAIN THAT LEAVES 0207 OUT ON PURPOSE.**
`tests/db/ideacad-assembly-migration.test.ts` boots `ALL minus 0207` as its
world-as-it-was measurement, and 0214's first draft refused to apply there. The fix
is the ladder 0207 itself uses at its line 487: the `_ideacad_part_owner` narrowing
is wrapped in a `to_regprocedure` guard and SKIPPED when the function is absent,
with a notice saying to re-apply 0214 after 0207. It deliberately does not CREATE
the function in that case -- a copy created here would either stand in 0207's way or
be silently replaced by it, and neither is better than the notice.

**AND AN apply-time ANON SWEEP OVER THE `^_?ideacad` PREFIX WAS ASSERTING SOMETHING
ABOUT MIGRATIONS THAT ARE NOT THIS FILE'S.** 0206's own header names this exact
lesson, and 0214's first draft made the mistake anyway:
`tests/db/ideacad-grants-anon-execute-surface.test.ts` deliberately builds a chain
with 0202 AND 0206 removed, to reproduce the defect 0202 repaired as its own negative
control, and the prefix sweep REFUSED TO APPLY there over nine 0201 functions this
file never touches. A migration that cannot apply because a file BEFORE it is missing
its repair is a migration holding somebody else's ground. The check now covers the
twelve functions this file writes, and 0206 -- which is applied, owns the
subsystem-wide sweep, and is run over 0214's own database by section D of the
migration test -- keeps the rest.

That same test's section E needed generalizing rather than re-pinning, for the second
time in its life. It asserts 0201's ten are anon-executable WITHOUT 0202, and 0214
legitimately re-narrows one of them (`ideacad_roster`, which it replaces to project
`archivedAt`, and revokes by name as that requires). The exemption is chain-conditional
and is itself asserted in the direction that matters: a name listed as re-narrowed
that turns out to be OPEN reddens, so an exemption cannot quietly cover a hole.

## What was measured

**`tests/db/ideacad-archive.test.ts`, 39 assertions, against a real embedded Postgres
with the real migration chain applied unmodified.** The archived document survives its
owner's enrollment being deleted and the instructor still lists and opens it, while
`ideacad_roster` genuinely loses it -- that last clause is the positive control without
which "the archive can see it" says nothing. A current student is refused three
independent ways before the grant (role null, zero rows through RLS, and the open RPC
raising) and is a viewer after it. An out-of-class stranger stays refused through every
state. A personal editor grant beats a class viewer grant and is not demoted by it,
AND still cannot write, because the two rules compose. All six concept writes refuse on
the archived document and land on a live one in the same database and the same run, and
nothing the refused attempts carried reached the table -- with a marker search whose own
positive control is the live document's writes.

**`tests/db/ideacad-archive-migration.test.ts`, 15 assertions.** The file re-applies
over the database it built; every constraint it adds is catalog-guarded; it applies to
the chain without 0207 and creates no `_ideacad_part_owner` there; anon executes none
of its twelve functions with `app_short_link_target` as the positive control; the two
0205 policy predicates KEPT the `authenticated` grant an RLS `using` clause needs; the
new table gives `authenticated` SELECT and nothing else and `anon` nothing at all; and
0206 still passes over the result.

**THE 0213 CENSUS, THREE WAYS.** 0213 is not on this branch, so what runs here is
0138's four-way census, and the claim is made in the two halves that are separable.
Structurally: 0214 names no `classroom_remove_enrollment` outside its own read-only
self-check, and the deployed body is byte-identical across a second database built
from the chain WITHOUT 0214 and then applied over -- with a control proving 0214
genuinely applied to it, so "nothing changed" is not "nothing ran". Behaviourally:
the exact count expression 0213 takes still answers 1 for an archived document (with
a student who has none answering 0 as the query's own control), and 0138's census
still permits a clean removal and refuses one with a response attached, end to end
through the real RPC.

**`tests/dom/ideacad-archive-mount.test.ts`, 22 assertions**, mounting the real
`ArchivePanel`. With every transport: 1 Archive, 1 Restore, 1 picker, 1 Stop sharing,
2 Open, 1 disclosure sentence. With none: 0/0/0/0, and both rows plus both Open
buttons still there -- read-only is structural and is not blank. The picker is absent
on an unarchived row, absent once every class already holds it, and absent with no
sections; each paired with the positive control on the same fixture.

**`npm run verify:browser --route ideacad-archive`: 4 route/width runs, 72
measurements, 0 outside threshold.** 0px horizontal overflow at 375 and 1440.
Contrast 15.42:1 (heading), 14.5:1 (the owner address), 6.84:1 (the disclosure
sentence and the picker label), and **5.7:1 for the amber chip on the row that still
needs a decision** -- the one ratio nothing but a real browser can composite. Tap
targets: the class picker 295.8x81.4 at 375px and 493.9x81.4 at 1440px, every button
57x44 or larger, 0 under 44px and 0 under the 24px floor. Measured with no 24px
exception, because that floor is a property a surface DECLARES in a named class on
its own root and this panel's root carries none.

**MUTATION PROOF, five mutants, all killed, in the permissive direction.** M1 (the
concept write gate forgets the archive) and M2 (the assembly gate forgets it) are
KILLED AT APPLY -- the file's own self-check raises and the migration refuses, which
is a stronger kill than a failing assertion. M3 (the class grant stops checking
`ce.active`) killed 2 of 39. M4 (the archive lists every document on the item) killed
1. M5 (a live document may be broadcast to a class) killed 1. Control green at 39
passed / 0 failed; the file restored from an in-memory copy and md5-verified
byte-identical, never `git checkout --`.

**AND THE MUTATION SCRIPT'S FIRST RUN WAS WRONG IN THE EXACT WAY `CLAUDE.md` WARNS
ABOUT, WHICH IS WORTH WRITING DOWN BECAUSE IT ALMOST READ AS A RESULT.** It reported
M1 and M2 as SURVIVED. They had not survived: vitest wrote its entire failure report
to STDERR while exiting 0, the script read only the return value of `execFileSync`
(stdout), and so it never saw the words "failed to apply". What saved it was that the
script refused to call an unparseable run a pass -- it reported "no summary line"
rather than "passed", which is the difference between a wrong answer and a flagged
one. The rule that follows is narrower than the existing one and is now in
`CLAUDE.md`: read BOTH streams, on BOTH paths, because the exit code and the stream
split are two separate traps and fixing one leaves the other.

## What was NOT verified

- **THE MIGRATION IS NOT APPLIED AND CANNOT BE FROM HERE.** Nothing in this
  repository has ever connected to the production database. Every claim above is
  against an embedded Postgres with the real files applied in order.
- **`tests/db/migrations-applied-record.test.ts` IS RED FOR `0214`, and that is the
  mechanism working.** That directory's README is explicit that it holds records of
  migrations that actually applied, so writing one for an unapplied file would make
  the single property it has false. Ledger 0207 met the identical collision on `0212`
  and left it for the identical reason. It clears when Mr. Pina applies and records it.
- **0213 IS NOT ON THIS BRANCH**, so the FIVE-way census was never run. What was
  proven is stated above in the two halves that do not depend on it.
- **THE SURFACE IS NOT MOUNTED ON THE REAL CLASSROOM ITEM PAGE.** `ArchivePanel`,
  `archive.ts` and `archive-transports.ts` are complete and verified through
  `/dev/ideacad-archive`, but the item page is `ItemDetail.svelte`'s neighbourhood and
  that file belongs to ledger 0217, running alongside. The wiring is one mount plus
  one `probeIdeacadArchive` call in the item route's manager branch; it is deferred
  rather than forgotten, and it is named here so the next lane does not have to
  rediscover the shape.
- No signed-in session, no Drive round trip, no screenshots -- the browser harness
  measures computed values and reports numbers rather than capturing images.
