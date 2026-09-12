# 24 Should an IdeaCAD document belong to a student or a team?

- Raised: 2026-09-11  By: ledger 0145
- Status: open
- Decision: blank.
- Default this assistant would pick: **one document per student, shipped as it is, AND
  decide this before `0201` is applied** -- because the window in which the answer is free
  closes at that apply, and Mr. Pina's own description of the course makes a student-keyed
  document a cost rather than the obvious answer.
- Why it is blocked on him: the rulebook's teams of two or three, and his stated intent to
  run team sets that CHANGE through a semester with per-module team-versus-individual
  grading, are facts about the course that only he holds.
- What it unblocks: the shape of every IdeaCAD row before the first student opens one.
  IdeaCAD ships 2026-09-14.
- Context: `supabase/migrations/0201_ideacad_blade_editor.sql`;
  `docs/prompt-ledger/entries/0145-ideacad-blade-editor.md`;
  `docs/prompt-ledger/entries/0159-land-integration-ideacad-stop.md`.

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
