# 30 Who owns an assembly?

- Raised: 2026-09-13  By: ledger 0206, out of the IdeaCAD scope document
- Status: ANSWERED 2026-09-13 by Mr. Pina. **PARTLY BUILT.** The ownership rule
  itself is already what the shipped schema says; the three things layered on
  top of it -- a manager role, granular per-member permissions, and transfer --
  exist nowhere and each needs new columns. **No migration is written here.**
- Build: OPEN in three of its four parts. Already true and needing nothing:
  ownership by the creator, and the checkout model from decision 24. Still to
  build, all of them migrations: a third grant role that must NOT be called
  `manager` (the name means the teacher of record in this subsystem);
  per-member access; per-member INFORMATION, which collides with decisions 27
  and 28 and should go back to him before it is built; and ownership transfer,
  which is blocked by `unique(item_id, student_email)` and wants its own
  decision entry first.
- Decision: **THE PERSON WHO CREATED IT.** Team ownership is fair in principle,
  but members of a team hold DIFFERENT RESPONSIBILITIES, so they hold different
  responsibilities on the assembly. There is a manager role, held by a person
  the team agrees to. Permissions are granular: different members get different
  access and different information. Ownership is TRANSFERABLE between people.
- Why it was blocked on him: it is an answer about how a student team is
  organised, which is a teaching decision about group work and not a schema
  question. The alternative -- a co-owned assembly with symmetric rights -- is
  perfectly buildable and he ruled it out on the grounds quoted above.
- What it unblocks: nothing immediately, and that is worth saying plainly. The
  parts of this answer that are already true needed no decision, and the parts
  that are not true need a migration nobody has written.

## THE ONE STRUCTURAL FACT TO GET STRAIGHT FIRST: THE DOCUMENT IS THE ASSEMBLY

There is no `ideacad_assemblies` table and there is not going to be one.
`supabase/migrations/0207_ideacad_assembly_parts.sql` lines 38-39:

```
--   1. `ideacad_parts` -- an ordered part list under a document. The document
--      IS the assembly; a part is the unit of work and the unit of checkout.
```

So "who owns an assembly" is "who owns the `ideacad_documents` row", and every
answer below is about that row. A reader looking for an owner column on
`ideacad_parts` will not find one: its only person-column is `held_by`, which is
the transient checkout holder and not an owner.

## WHAT THE SHIPPED SCHEMA ALREADY SUPPORTS

Measured on `origin/integration` at `78516fa2`.

**1. "The person who created it" -- ALREADY TRUE, and by construction.**

The owner is `ideacad_documents.student_email`, a `text` email and not a uuid
(`0201_ideacad_blade_editor.sql` line 14). It is written once, by the insert
inside `ideacad_open_document` (line 26,
`insert into public.ideacad_documents(item_id,student_email) values(p_item_id,e)
on conflict(item_id,student_email) do nothing`), where `e` is the caller
resolved through `_classroom_engine_student`. **The creator is the opener, and
no code path in the repository ever updates that column afterwards** --
`grep -rn "set student_email"` over the whole tree returns exactly one hit and
it is `classroom_update_enrollment` (`0083` lines 402-407), a different table.

The predicate is `_ideacad_part_owner` (`0207` lines 454-467), which compares
that column to `current_user_email()`.

**2. Checkout, which is decision 24's model and is what makes "different
responsibilities" mean anything today -- BUILT AND APPLIED.**

One person holds a part at a time. The hold is four columns on the part row
(`0207` lines 246-249: `held_by`, `held_at`, `hold_beat_at`, `hold_revision`),
kept honest by an all-or-nothing CHECK (lines 252-255), lapsing at a read-time
ten-minute window (`_ideacad_hold_window`, lines 444-452) with nothing sweeping
it, and driven by four RPCs: `ideacad_claim_part`, `ideacad_beat_part`,
`ideacad_release_part`, and `ideacad_assign_part`. The client half is
`src/lib/ideacad/checkout.ts` and it is wired on the real item page.

**This is the half of decision 30 that already works**, and it is the half that
matters most day to day: two students on one assembly genuinely cannot edit one
part at once, which is what he asked for in decision 24 and explicitly did not
want the alternative of.

**3. A two-rung permission ladder -- BUILT, but it is not the granular one.**

`ideacad_grants` (`0205` lines 217-225) is keyed `(document_id, grantee_email)`
and carries `role text not null` constrained to exactly two values (lines
234-236):

```sql
			check (role in ('viewer', 'editor'));
```

`_ideacad_part_writer` (`0207` lines 469-494) is owner-or-`_ideacad_can_write_document`,
and that in turn is `role in ('owner','editor')` (`0205` lines 329-337).

## WHAT THE ANSWER ASKS FOR THAT DOES NOT EXIST

Three things, each needing new columns. Stated as gaps, not designs.

**A. A MANAGER ROLE HELD BY A PERSON THE TEAM AGREES TO -- DOES NOT EXIST.**

The word `manager` exists in this subsystem and means something else, which is
the trap. `_ideacad_manages_document` (`0205` lines 312-327) and the string
`'manager'` in `ideacad_open_shared_document`'s payload (line 846,
`'role', coalesce(v_role, 'manager')`) both mean **the teacher of record**,
derived from `_classroom_manages_item`. 0205 says so in its own header, lines
265-268: "Manager-ness is NOT folded into it, and that is the whole reason the
instructor path can be described as unchanged".

**So a student "manager" of an assembly has no representation at all**, and the
name it would want is taken by the instructor. `ideacad_grants.role` admits two
values and a third is a CHECK constraint change plus an answer for every
predicate that switches on it. **Naming it `manager` would be the single most
confusing possible choice here**; the next bundle should pick a different word.

Note also that a team manager would be the first grantee with any authority
beyond editing, which collides with 0205's stated default (lines 85-89): "ONLY
THE OWNER GRANTS. A grantee cannot re-share, at either role." A manager the team
agrees to is exactly someone you would expect to be able to add a member.
Reversing that is a widening, which 0205 itself calls "the cheap direction" --
but it is a reversal of a written decision and wants to be recorded as one.

**B. GRANULAR PERMISSIONS -- "different access AND DIFFERENT INFORMATION" --
DOES NOT EXIST, AND THE SECOND HALF IS THE HARDER ONE.**

Access today is one of two rungs for the whole document. There is no per-part
grant, no per-field grant, and no notion of a member seeing a subset.

**The "different information" half is a bigger change than the access half**,
and it is worth separating them before anyone builds:

- *Different access* is a third role, or a per-part grant table. Bounded work.
- *Different information* means two members opening the same document get
  different PAYLOADS. Every read is currently whole-document --
  `ideacad_open_shared_document` returns the document, its concepts and its
  prediction; `ideacad_assembly` returns every part with its hold state. Making
  those answer differently per member is a projection decision on every one of
  them, and it collides with decisions 27 and 28: a per-person history that
  "anyone with access can view ALL of" is not obviously compatible with members
  who are meant to see different things. **That interaction is unresolved and
  should be put back to him rather than guessed.**

**C. TRANSFERABLE OWNERSHIP -- DOES NOT EXIST, AND ONE CONSTRAINT BLOCKS THE
OBVIOUS IMPLEMENTATION.**

There is no transfer or reassign RPC for document ownership anywhere in
`supabase/migrations/`. The one function whose comment says "reassign" is
`ideacad_assign_part`, and it reassigns a HOLD, not an owner (`0207` lines
949-951).

**The blocker is `unique(item_id, student_email)` on `ideacad_documents`**
(`0201` line 14). One document per student per assignment is what makes
`ideacad_open_document`'s `on conflict do nothing` idempotent and what
`ideacad_roster`'s left join keys on. **So transferring ownership to a
classmate who has already opened that same assignment is a unique violation**,
and that is not an edge case -- on a team assembly it is the normal case, since
teammates will have opened the item themselves.

A transfer therefore is not one `update`. It needs an answer for the receiving
student's own existing document, and the candidates (merge them, refuse the
transfer, or stop keying documents to a single student) are three quite
different products. **This is the part of decision 30 most likely to be
underestimated.**

## WHAT REMAINS TO BUILD, IN ONE LINE EACH

Nothing here is this bundle's, and none of it should be folded into another
lane's migration.

1. A third grant role that is not called `manager`, with its own answer for
   whether it may grant. Needs a CHECK change and a pass over every predicate.
2. Per-member access, if that is the lighter reading of "granular" -- most
   plausibly a per-part grant beside `ideacad_grants`.
3. Per-member INFORMATION, which is a projection change on every read RPC and
   which needs him to resolve its collision with decisions 27 and 28 first.
4. Ownership transfer, which needs a decision about
   `unique(item_id, student_email)` before any RPC is written.

**All four are migrations, and therefore all four are Mr. Pina's to apply at the
SQL editor.** Item 4 wants a decision entry of its own before it wants code.

## What would change this answer

He has already ruled out symmetric team ownership, so the shape is settled. What
is genuinely open is how much granularity is worth the schema -- a three-rung
ladder is a modest change and a per-member information model is a large one, and
his answer does not say which of those he pictured.
