# 24 Should an IdeaCAD document belong to a student or a team?

- Raised: 2026-09-11  By: ledger 0145
- Status: decided
- Decision: **Mr. Pina decided on 2026-09-12: resolution A, ONE DOCUMENT PER STUDENT, plus
  SHARING.** In his words: like Google Docs. A student makes a document and it is PRIVATE
  BY DEFAULT. The owner may share it with named classmates as VIEW-ONLY or as EDITOR. He
  and Mr. Cosso SEE AND EDIT EVERYTHING BY DEFAULT, without asking and without a student
  granting anything -- he called that "very convenient and powerful" and wants it kept.
  **Sharing is his answer to the team half of the question**, not a separate feature: a
  team of three collaborates in ONE member's document through editor grants, rather than in
  a team-keyed row. See "How the decision resolves the question" below, and the two halves
  of it that are NOT yet true of the code.
- Default this assistant would pick: A was the default. The SHARING half is his, and it is
  the part the default did not contain -- the analysis below treated "no shared edit" as a
  cost of A to be accepted, and he answered it instead.
- Why it was blocked on him: the rulebook's teams of two or three, and his stated intent to
  run team sets that CHANGE through a semester with per-module team-versus-individual
  grading, are facts about the course that only he holds.
- What it unblocked: the shape of every IdeaCAD row before the first student opens one, and
  the data layer for sharing. IdeaCAD ships 2026-09-14.
- Built by: ledger 0179, `supabase/migrations/0205_ideacad_document_sharing.sql` and
  `src/lib/ideacad/sharing.ts`.
- Context: `supabase/migrations/0201_ideacad_blade_editor.sql`;
  `supabase/migrations/0205_ideacad_document_sharing.sql`;
  `docs/prompt-ledger/entries/0145-ideacad-blade-editor.md`;
  `docs/prompt-ledger/entries/0159-land-integration-ideacad-stop.md`;
  `docs/prompt-ledger/entries/0179-ideacad-document-sharing.md`.

## The question, in one sentence

Is an IdeaCAD document keyed to ONE STUDENT (its shipped shape) or to a TEAM, given that
teams change through a semester and some modules are graded individually?

## What is true in the tree today (measured 2026-09-11)

- `supabase/migrations/0201_ideacad_blade_editor.sql` **line 14** creates
  `ideacad_documents` with `student_email text not null` and
  **`unique(item_id, student_email)`**. The owner is a student, in the key.
- **Ten RPCs pin it.** `student_email = public.current_user_email()` appears **10 times**
  across lines 27-33 (`ideacad_new_concept`, `_save_concept`, `_update_concept_meta`,
  `_delete_concept`, `_set_active`, `_set_prediction`, `_commit_concept`), each raising
  "You can only ... your own concept." `ideacad_open_document` (**line 26**) creates the
  row from `_classroom_engine_student(p_item_id)`, the 0086 helper.
- **The three read policies (lines 22-24) are `student_email = current_user_email() OR
  _classroom_manages_item(...)`.** There is no team predicate anywhere in the schema, and
  no table names a team.
- **`ideacad_roster` (line 34) builds the teacher view from `classroom_enrollments`**, one
  row per enrolled student, left-joined to the document. A team view would have no key to
  group on.
- **`0201` IS NOT APPLIED AND IS NOT ON `main`.** `git diff --name-only
  origin/main...origin/integration -- supabase/migrations/` returns `0199` and `0201`;
  `origin/main`'s highest is `0198`. Landing lane 0159 stopped for exactly this. Production
  is unreachable from this container (`DEPLOY_PROBE_URL` unset, no `.env`, egress refuses
  `ideabosco.com`), so applied state is CANNOT SAY from here and must be read by Mr. Pina.

**That last fact is the decision-relevant one.** While `0201` is unapplied it is not an
applied record, so a different key is an EDIT to that file. After it applies, it is a new
migration plus a data migration of every document and concept already written.

## What each option costs

| | Migration? | Applied production state? | Cost |
|---|---|---|---|
| **A. One document per student** (shipped) | none, if decided before `0201` applies | no | Every student has an attributable durable workspace and individual grading is free. **A team of three produces three documents with no relation between them**: no shared edit, no single artifact to grade as a team, and a teacher comparing teammates reads three roster rows. |
| **B. Key the document to a team** | rewrite `0201` now, or a NEW migration + backfill after it applies | after apply, yes | Needs a team identity that does not exist anywhere in the schema, plus conflict semantics for two students editing one concept -- which the shipped save path does not have (`ideacad_save_concept`, line 28, is a per-caller revision compare). Individual grading then needs a second key. |
| **C. Ship A, add a nullable `team_id` beside it now** | one column in `0201` while it is unapplied; otherwise its own migration | no, if done before apply | Keeps the shipped ownership and the individual grade, and leaves a join for a team view later. Costs one unused column and the discipline not to read it until it means something. |

## Why A, with the timing caveat

**A is what ships, it is correct for individual grading, and nothing about the 2026-09-14
date makes B buildable.** B needs a team identity, a membership table that changes through
a semester, and multi-writer conflict semantics for a CAD feature tree -- three things that
are each their own bundle, and none of which exist.

**But A is a decision with a cost, not the obvious answer.** Teams of two or three sharing
no document means the team's work lives in whichever member's document they happened to
drive, and per-module team-versus-individual grading has no way to say which. If Mr. Pina
expects a team artifact this term, **C is the cheap hedge and it is only cheap until
`0201` applies.**

## If nobody decides

`0201` applies as written and A becomes the answer by default -- which is a legitimate
outcome, but it is then permanent in the ordinary way: the key is in a unique constraint
and ten RPC bodies, so changing it later is a migration, a backfill of live student work,
and a rewrite of the roster read. **The cheap moment is now, before the apply.**

---

## How the decision resolves the question (added 2026-09-12 by ledger 0179)

Everything above this line is the question as it stood on 2026-09-11 and is left
unedited, including the cost table. What follows is the answer and what was built for it.

**A IS RATIFIED AND `0201` NEEDED NO EDIT.** The key stays `student_email` and
`unique(item_id, student_email)`; the ten RPCs keep their owner pin; `ideacad_roster` keeps
grouping on the enrolled student. `0205` adds a grants table beside all of that and changes
no column and no key. So the "cheap moment" the entry closed on did not have to be caught:
the answer turned out not to need the window.

**AND OPTION C WAS NOT TAKEN.** No nullable `team_id` was added. A grant row IS the
relation the entry said three documents lacked, and it is a better one than a team column
would have been: it is per-document rather than per-student, it carries a role, the owner
controls it, and it needs no membership table that changes through a semester.

**WHAT THE SHARING ANSWER FIXES, FROM THE ENTRY'S OWN COST COLUMN.** A of "a team of three
produces three documents with no relation between them: no shared edit, no single artifact
to grade as a team". The FIRST half is fixed -- one member owns the document and grants
`editor` to the other two, and all three write the same feature tree through the same seven
RPCs. **The second half is not**, and it is the open residue below.

## Two things this decision implies that are NOT yet true of the code

Recorded here rather than in a report, because each is a gap between the decision as Mr.
Pina stated it and what an applied database does.

**1. INSTRUCTORS READ EVERYTHING AND STILL CANNOT EDIT ANYTHING.** His sentence is "see and
edit". Measured on `0201`: all three read policies carry
`_classroom_manages_item(...)`, so the SEE half has worked since `0201` and `0205` widened
it no further. But all seven student write functions resolve their row through
`student_email = current_user_email()` and there is no manager term in any of them, so the
EDIT half has never been true. `0205` deliberately did not add it, and the reason is that a
predicate is not the missing piece: `ideacad_open_document` resolves a document through
`_classroom_engine_student`, which RAISES for anyone not enrolled in a section the item is
posted to, so a teacher cannot open a student document at all and the roster is their whole
read path. Widening only the write gate would grant a teacher permission to save a concept
they have no supported way to open. **Teacher edit needs a teacher-side document entry
point, and it is its own bundle.** `tests/db/ideacad-sharing-instructor-path.test.ts`
asserts `canWrite` is FALSE for a manager today, so the gap is pinned rather than assumed,
and that assertion is the one to invert deliberately when it ships.

**2. WHICH DOCUMENT IS THE TEAM'S ARTIFACT FOR GRADING IS STILL UNANSWERED.** Sharing gives
a team one document to work in; it does not say which of three enrolled students' roster
rows a team grade hangs off, and `ideacad_roster` still returns one row per student with
that student's own document. A grader looking at three teammates sees one document with
work in it and two empty ones. This is the surviving half of the entry's second cost and it
is not closed by `0205`.

## One decision inside `0205` that is MINE and not his

**ONLY THE OWNER GRANTS: a grantee cannot re-share, at either role.** He did not say this.
It is recorded as the bundle's default rather than his ruling, and the reasoning is that
re-sharing makes the set of people who can read a student's work unbounded by anything the
owner did, while an owner who wants a wider audience can grant it themselves -- so the
conservative direction is the reversible one. If he wants editors to be able to re-share,
that is a widening of one predicate and needs no new table.

Two smaller ones, same standing: a grantee must be in the item's own enrolled population
(he said "named classmates"; the enforcement is mine, and it is what makes "a stranger sees
nothing" structural rather than resting on nobody typing an outside address), and a grantee
sees only their own grant row rather than the whole list.
