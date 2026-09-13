# 29 What happens to an IdeaCAD document when its owner leaves a section?

- Raised: 2026-09-13  By: ledger 0206, out of the IdeaCAD scope document
- Status: ANSWERED 2026-09-13 by Mr. Pina. **NOT BUILT, AND IT NEEDS A
  MIGRATION.** This is the one of the four that cannot be closed by a display
  change: it is a new state on the document, an archive path, and an instructor
  surface for reaching archived work. **No migration is written here**, and this
  bundle carries none.
- Build: OPEN, AND IT IS THE ONLY ONE OF THE FOUR THAT NEEDS A MIGRATION, so it
  is Mr. Pina's to apply at the SQL editor. Four separable pieces, listed in
  full under "What this costs to build": an `archived_at` state on
  `ideacad_documents` with a pass over every read that does not know it exists;
  an archive path; an instructor read keyed on the ITEM rather than on the
  enrollment; and the instructor-shares-to-a-class grant, which reverses 0205's
  written owner-only default. **The smallest useful first move is none of
  those**: widen `classroom_remove_enrollment`'s four-way census to count
  IdeaCAD work, which closes the live silent-loss gap below and needs no new
  state.
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
