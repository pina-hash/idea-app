# 29 What happens to an IdeaCAD document when its owner leaves a section?

- Raised: 2026-09-13  By: ledger 0206, out of the IdeaCAD scope document
- Status: ANSWERED 2026-09-13 by Mr. Pina.
- Build: **WRITTEN 2026-09-13 by ledger 0218 as
  `supabase/migrations/0214_ideacad_document_archive.sql`, AND NOT YET APPLIED
  -- it is Mr. Pina's to paste at the SQL editor.** All four pieces costed below
  are in that file: an `archived_at` / `archived_by` state on
  `ideacad_documents`; `ideacad_set_document_archived` as the archive path;
  `ideacad_archive`, an instructor read keyed on the ITEM; and
  `ideacad_section_grants` plus three functions for the
  instructor-shares-to-a-class grant. The smallest first move named here --
  widening `classroom_remove_enrollment`'s census -- shipped separately and
  first, as `0213` under ledger 0212, and `0214` deliberately does not touch it.
  **Two halves of this entry are still open and are listed under "What is still
  open" at the end.**
- Decision: **THE DOCUMENT AND ALL ITS WORK IS ARCHIVED, NOT DELETED**, and
  stays accessible to the admin instructor. If the instructor shares an archived
  document with a class, those students get access to it too.
- **HIS REASON, RECORDED BECAUSE IT IS THE WHOLE ARGUMENT:** he regularly brings
  up past student work to show current students as reference, and work from
  students who have since left is exactly what he wants to be able to show.
- Why it was blocked on him: it is a decision about a departed student's record
  -- whether the school keeps it, who may see it afterwards, and whether it may
  be shown to a later cohort. None of that is a technical call.
- What it unblocks: nothing was waiting. What it CLOSES is a live gap, measured
  below, in which exactly the work he wants to keep can already become
  unreachable.

## WHAT IS TRUE TODAY, MEASURED ON `origin/integration` AT `78516fa2`

**There is no archive state, and there is no code path anywhere that reasons
about a document whose owner left.**

- **`ideacad_documents` has six columns and not one of them is a lifecycle
  flag.** The `create` at `supabase/migrations/0201_ideacad_blade_editor.sql`
  **line 14** is the only DDL that ever touches its columns; `grep -rn "alter
  table public.ideacad_documents" supabase/migrations/` returns exactly two
  lines, both in 0201, and neither is a column change (one adds a FK, one
  enables RLS). The columns are `id`, `item_id`, `student_email`,
  `active_concept_id`, `created_at`, `updated_at`, with
  `unique(item_id, student_email)`. **No `archived_at`, no `deleted_at`, no
  `status`, no `active`.**
- **`deleted_at` exists on `ideacad_concepts` and NOT on the document**
  (`0201` line 15), so the soft-delete idiom this schema already uses is
  available one level down and absent at the level this decision is about.
- **Enrollments normally deactivate rather than vanish.**
  `supabase/migrations/0082_classroom.sql` lines 629-632: "Enrollment rows are
  never deleted from the app: `active = false` removes a student from the live
  roster while keeping the record".
- **A deactivated student loses their own document immediately, and that part
  already works the way he would want.** `ideacad_open_document` resolves the
  caller through `_classroom_engine_student`, whose gate
  (`0086_classroom_assignment_engine.sql` lines 216-224) raises 'Only a student
  enrolled in this class can work on this assignment.' once `e.active` is false.
  So a departed student stops writing. **Nothing is lost by that** -- the rows
  are untouched.
- **The instructor's listing is `ideacad_roster`, and it drives off the
  ENROLLMENT, not off the document.** `0201` **line 34**:

  ```sql
  from(select distinct ce.student_email from public.classroom_postings cp
       join public.classroom_enrollments ce on ce.section_id=cp.section_id
       where cp.item_id=p_item_id) e
  left join public.ideacad_documents d on d.item_id=p_item_id and d.student_email=e.student_email
  ```

  The document is the LEFT side of a left join off the roster. It has no
  `ce.active` filter, so a DEACTIVATED student still appears -- good -- but the
  row exists on that list only for as long as an enrollment row exists.

## THE LIVE GAP THIS DECISION CLOSES, AND IT IS THE REASON TO BUILD IT

**`classroom_remove_enrollment` (0138) is a HARD DELETE, and its refusal does
not count IdeaCAD work.**

It counts exactly four things before deleting
(`0138_classroom_manager_exclusion_and_enrollment_removal.sql` lines 419-440):
`classroom_responses`, `classroom_submissions`,
`classroom_module_approvals`, and `notebook_entries`. If the total is zero it
proceeds to line 458:

```sql
	delete from public.classroom_enrollments e
	where e.section_id = p_section_id and e.student_email = v_email;
```

**IdeaCAD documents and concepts are counted by nothing.** 0138 predates 0201 by
sixty-three migrations, and no later file widens that census -- `grep -l
classroom_remove_enrollment supabase/migrations/*.sql` returns 0138, 0143, 0145
and 0200, and none of those three mentions `ideacad` at all.

**So today: a student whose only work on an assignment is a finished IdeaCAD
part can be removed outright from the section, the refusal will not fire, and
their `ideacad_documents` row survives with nothing able to list it** -- because
`ideacad_roster` has no enrollment row to drive off any more. The bytes are
still in the table; the teacher has no surface that will show them. **That is
precisely the loss his reason rules out**, arriving silently, through a control
that reports success.

**Two smaller findings from the same measurement, recorded so a builder does not
have to rediscover them:**

- **A grant outlives the grantee's enrollment.** `ce.active` is checked at
  SHARE time (`0205` lines 710-719, 'You can only share this with a classmate in
  this class.') and by none of `_ideacad_document_role`,
  `_ideacad_can_read_document` or `_ideacad_can_write_document`, which never
  consult `classroom_enrollments` at all. So a departed student keeps reading and
  writing anything already shared with them. **That is a hole in the other
  direction from this decision** and it should be settled by the same bundle.
- **A departed owner's held parts are never released.** Nothing clears
  `ideacad_parts.held_by` on an enrollment change; a hold frees only by the
  ten-minute read-time window (`0207` lines 444-452), a takeover, or
  `ideacad_assign_part`, which is the OWNER's -- and the owner is the person who
  left. Deactivation is the benign case here, since the window lapses; a hard
  delete leaves a hold nobody will ever look at.

## WHAT THIS COSTS TO BUILD -- A MIGRATION, AND IT IS MR. PINA'S TO APPLY

Named, not designed. **Do not read this as a specification; it is a cost
estimate so nobody thinks this is a one-line change.**

1. **A new state on the document.** An `archived_at timestamptz` on
   `ideacad_documents`, plus the decision -- which is a real one -- of whether
   archiving is stamped by the roster change or by an instructor's deliberate
   act. Every existing read has to be audited for it, and the audit is the work:
   `_ideacad_can_read_document`, `_ideacad_can_write_document`,
   `ideacad_roster`, `ideacad_shared_with_me` and
   `ideacad_open_shared_document` all answer today with no idea the state
   exists. An archived document must stop being WRITABLE and keep being
   READABLE, which is not a filter either predicate currently has a shape for.
2. **An archive path.** Something has to stamp it. The honest candidate is
   `classroom_remove_enrollment` itself -- which would mean widening a function
   that belongs to the classroom, not to IdeaCAD, and whose four-way census is
   0138's own design. **The cheaper and safer first move is to add IdeaCAD to
   that census so the removal REFUSES with a count**, exactly as it does for the
   other four kinds of work. That alone closes the silent-loss gap above and
   needs no new state at all; it is strictly smaller than this decision and
   could ship first.
3. **An instructor surface for reaching archived work.** `ideacad_roster` cannot
   be it, for the structural reason above: it is driven off the roster, so a
   document belonging to nobody currently enrolled is invisible to it by
   construction. This needs a read keyed on the ITEM rather than on the
   enrollment -- a second function, not a parameter on that one.
4. **The re-share to a current class.** His second sentence -- "if the
   instructor shares an archived document with a class, those students get
   access to it too" -- is a genuinely new grant shape.
   `ideacad_share_document` today is OWNER-ONLY by explicit decision (`0205`
   lines 85-89: "ONLY THE OWNER GRANTS ... a grantee cannot re-share"), grants
   to ONE email at a time into `ideacad_grants`, whose primary key is
   `(document_id, grantee_email)`, and refuses anyone not actively enrolled. An
   instructor sharing a departed student's document to a whole section satisfies
   none of those three. **This is the widest part of the answer and it reverses
   a stated default**, so it wants its own reasoning rather than a widened
   `if`.

**Ordering, since these are separable:** (2)-as-a-refusal is a small,
independently valuable migration that stops the bleeding. (1), (3) and (4) are
the feature, and (4) is the part most worth putting back in front of him with a
concrete shape before it is built.

## What would change this answer

Nothing about the storage cost, which is trivial. The one thing worth checking
back on is whether a departed student may still READ their own archived work --
he did not say, this entry does not assume, and both answers are defensible.


---

## WHAT WAS BUILT, 2026-09-13, ledger 0218 -- and which parts are a builder's judgement

`supabase/migrations/0214_ideacad_document_archive.sql`. Its own header is the
full reasoning; this section records what the decision got and what it did not,
so nobody has to read a migration to find out whether this entry is closed.

**HIS TWO SENTENCES, AND WHERE EACH ONE LANDED.**

- *"The document and all its work is archived, not deleted, and stays accessible
  to the admin instructor."* `archived_at` and `archived_by` on the document;
  `ideacad_archive(p_item_id)` lists it, keyed on the ITEM so it survives any
  enrollment change. **The instructor's READ needed no change at all** -- that
  was measured rather than assumed, and is the one estimate in the costing above
  that turned out to be pessimistic: `_ideacad_can_read_document` already asked
  `_classroom_manages_item`, which reads `classroom_postings` and never
  `classroom_enrollments`, and all four select policies already delegated to it.
  What was missing was only the LISTING.
- *"If the instructor shares an archived document with a class, those students
  get access to it too."* `ideacad_section_grants`, a second grant table keyed
  `(document_id, section_id)`, with `ideacad_share_document_with_section`,
  `ideacad_unshare_document_from_section` and
  `ideacad_document_section_grants`. A recipient discovers it through
  `ideacad_shared_with_me` and opens it through `ideacad_open_shared_document`,
  the same two functions a person-to-person share already used.

**AN ARCHIVED DOCUMENT STOPS BEING WRITABLE AND KEEPS BEING READABLE**, which is
this entry's own requirement. One term, `_ideacad_document_archived(uuid)`, in
TWO predicates -- and the second is the half that was nearly missed:
`_ideacad_part_writer` short-circuits on `_ideacad_part_owner` BEFORE consulting
0205's rule, and four assembly writes gate on it directly, so narrowing
`_ideacad_can_write_document` alone would have left five part writes open on an
archived document, silently. The read side is named nowhere in the file, so
"keeps being readable" is structural rather than a filter somebody has to
maintain.

**FOUR NARROWINGS ARE THE BUILDER'S JUDGEMENT, NOT HIS**, recorded here so the
next session knows what it is reversing:

1. **A class grant is ALWAYS a viewer.** `ideacad_section_grants` has no role
   column, so this is a property of the schema rather than a check. A current
   student editing a departed student's reference part would have no owner left
   to undo it.
2. **Only an ARCHIVED document may be shared with a class.** His sentence says
   "an archived document" and the narrow reading is the safe one: without it an
   instructor could broadcast a LIVE student's in-progress work to a whole class.
3. **The target section must be one the assignment is posted to.** This reuses
   the population `ideacad_share_document` already computes and lets
   `ideacad_shared_with_me` stay the one discovery path. **It has a real cost and
   it is the first thing to revisit** -- see below.
4. **The owner's address is shown, not redacted.** Redaction was considered and
   rejected: `ideacad_open_shared_document` returns the document row, so a
   redacted list beside an unredacted open reads as a guarantee and is not one.
   The surface says so in words before the press instead, the way `FoundryShare`
   does.

**ARCHIVING DOES NOT UNLOCK A REMOVAL, DELIBERATELY.** `0213`'s census counts
`ideacad_documents` rows with no `archived_at` term, and `0214` does not name
`classroom_remove_enrollment` at all, so a student with IdeaCAD work is refused
before and after. A removal that silently archived would be the same class of
defect as the silent delete `0213` closed. The two files are independent and may
be applied in either order.

## What is still open

- **NARROWING 3 IS THE ONE TO PUT BACK IN FRONT OF HIM.** An instructor who
  authors a NEW item each year rather than re-posting the canonical one cannot
  reach last year's work through the class share at all; they would have to post
  the old item to the new section. Whether that matches how he actually runs the
  Blade assignment year to year is a question nobody has asked him, and widening
  it means a second discovery path keyed on a section rather than an item, which
  is a real disclosure surface and not a widened `if`.
- **WHETHER A DEPARTED STUDENT MAY STILL READ THEIR OWN ARCHIVED WORK.** The
  original entry flagged this as the one thing worth checking back on, and `0214`
  did not decide it: the owner keeps the `owner` role and therefore keeps reading,
  because collapsing the role to null would take the document out of every read
  including the instructor's. That is the permissive answer arrived at by not
  deciding, and it deserves his word rather than a default.
- **A DEPARTED OWNER'S HELD PARTS ARE STILL NEVER RELEASED.** Named in this entry
  as a separate finding and still true. On an archived document a hold is INERT,
  because every write it would authorize is now closed, so this is tidiness
  rather than a hole -- but it is tidiness nobody has done.
- **NOTHING GOES LOOKING FOR AN ORPHAN TO ARCHIVE.** `0214` section 10 REPORTS,
  at apply time, every document whose owner has no enrollment on the item, and
  writes nothing. They are reachable from that moment -- `ideacad_archive` lists
  an off-roster document whether or not anybody archived it -- but whether each
  is reference work worth keeping is a decision with that list in front of you.
