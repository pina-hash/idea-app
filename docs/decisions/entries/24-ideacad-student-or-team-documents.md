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

---

## The parts-and-checkout half (added 2026-09-12 by ledger 0183)

Everything above this line is left unedited. **This section is additive and does not
replace ledger 0179's**, which records the sharing half of the same decision; if both
sections arrive in one merge, keep both.

**MR. PINA'S SECOND ANSWER, 2026-09-12, in his terms.** An IDEA-Blade assembly has
SEVERAL PARTS. **ONE PERSON HOLDS A PART AT A TIME** -- industry checkout, not concurrent
editing of one part. He named concurrent editing of a single complex part a real FUTURE
feature and explicitly did NOT want it for IDEA-Blade. Switching who holds what must be
"extremely easy and intuitive". **THE ASSEMBLY OWNER HAS FULL CONTROL** over who is
editing what and can reassign teammates to parts LIVE.

**WHY THAT NEEDED A MIGRATION AT ALL, WHICH IS THE BLOCKER LEDGER 0179 NAMED:**
`ideacad_documents` holds exactly one feature tree, so there was nothing to check out.
Confirmed against `0201` before anything was built, and it is worth stating precisely
because the schema LOOKS like it already holds several trees. It does --
`ideacad_concepts` is one row per feature tree and a document has many -- but 0201's
concepts are COMPETING ALTERNATIVES OF ONE PART, which is why `ideacad_predictions`
exists to ask which of them a student thinks will win and why
`ideacad_documents.active_concept_id` names the single tree the editor shows. No row in
0201 means "the hex shank" as distinct from "the blade", so no unit of ownership existed
for a person to be given exclusive hold of.

**BUILT BY LEDGER 0183, `supabase/migrations/0207_ideacad_assembly_parts.sql` and
`src/lib/ideacad/assembly.ts`.** A document is the assembly and owns ordered
`ideacad_parts`; a concept belongs to a PART, so each part carries its own feature tree
and its own alternatives of it; every existing document was migrated into a ONE-PART
assembly. The hold lives on the part row and is taken under `select ... for update`, so
two students pressing the same control cannot both acquire it. 0201's ten RPCs are NOT
redefined -- `0205` replaces seven of them and a second replacement would revert its
sharing widening silently -- so the compatibility is paid by a trigger that fills
`part_id` for any insert that does not name one, and refuses rather than guesses once an
assembly has more than one part.

**HOW THE TWO HALVES COMPOSE, since they were decided a day apart and built in parallel.**
`0205`'s editor grant is what makes an assembly a TEAM; `0207`'s hold is what says who is
on which PART. A teammate needs both: the grant to open the document at all, and the hold
to be the one working on that part. Neither widens the other. 0207's claim gate therefore
DELEGATES to `_ideacad_can_write_document(uuid)` rather than restating it, through a
select ladder that degrades to owner-only on a deployment that has 0207 but not yet 0205.

**ONE THING IN HERE IS THIS ASSISTANT'S AND NOT HIS, AND IT IS RECORDED AS OURS: THE
STALENESS RULE.** He did not specify when a hold lapses, and a holder who closes their
laptop must not own a part for the rest of the term. The default taken is **TEN MINUTES
since the last heartbeat**, written down once in `_ideacad_hold_window()`, with a lapsed
hold TAKEN OVER by the next claimant rather than swept by anything. Ten minutes because
the client heartbeat is ten seconds, so a live tab sits sixty beats inside the window and
survives a wifi blip or a discarded-and-restored tab, while a machine that was shut down
frees its part inside one class period. **It is a number he may want to change** and the
place to change it is that one function; it is not published to a student as a count of
seconds anywhere except through `ideacad_assembly`'s own `holdWindowSeconds`, which a
surface needs in order to draw a lapsed hold honestly.

**WHAT WAS DELIBERATELY NOT BUILT.** No UI. No part deletion and no part-level
prediction. And **no instructor force path**: `ideacad_assign_part` is the OWNER's, which
is his own sentence, and ledger 0179 measured that a teacher cannot open a student
document at all (`_classroom_engine_student` raises for anyone not enrolled), so a manager
force would have granted a power with no supported way to use it. Managers read the
assembly, as they read everything else.
