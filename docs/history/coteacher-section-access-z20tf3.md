---
title: "0169: a section-scoped NOTEBOOK REVIEWER tier, so a co-teacher can review one section's notebooks without taking the section over or holding admin (`claude/coteacher-section-access-z20tf3`, migration 0169)"
date: 2026-08-30
branches: [claude/coteacher-section-access-z20tf3]
migrations: ["0169"]
subsystems: ["Notebook", "Access model", "Classroom"]
---

**THE PROBLEM WAS STRUCTURAL.** `classroom_sections.teacher_email` is one text
column, `_classroom_manages_section_email` (0138) resolves manage-ness to
admin-or-that-one-address, and a sweep for `co_teacher`, `coteacher`,
`secondary_teacher` and `classroom_section_teachers` across
`supabase/migrations/`, `src/` and `tests/` -- on this tree, on `origin/main`
and on `origin/integration` -- returned nothing. So a second instructor who
genuinely teaches a section could reach its notebook review console only by
replacing the teacher of record or by holding `app_admins`, the whole 0067
tier. 0169 gives "may review this section's notebooks" its own grant:
`notebook_section_reviewers`, keyed `(section_id, email)`, mirroring 0155/0167
in everything but scope -- SECTION-scoped because a notebook reviewer reads
student work, and a global list would hand one grant every section's students.

**THE SEAM, MEASURED BEFORE IT WAS CHOSEN.** The whole notebook chain was
booted on the embedded-Postgres harness (through 0140, applied by hand after
0137 exactly as on the live project) and the catalog read back: every notebook
staff gate is either a direct `classroom_manages_section(section_id)` call
inside a notebook function or policy, or one of two notebook-side helpers
(`_notebook_manages_session`, `_notebook_manages_student_email`). Nothing
classroom-side sits downstream of any of them. **The notebook path is therefore
separable from the shared classroom predicate**, and 0169 touches neither
`_classroom_manages_section_email` nor `_notebook_manages_student_email` -- the
latter deliberately, because it feeds `notebook_manages_student`, which gates
the four staff delete/restore RPCs, and widening it would hand a reviewer
soft-deletion as a side effect of the per-student read. The student-notebook
RPC moved to a new private helper (`_notebook_reviews_student_email`) instead.

**NINE SITES OPEN, PER-SITE, 0167's INSTRUMENT**: the grid (0140), the four
verdicts (0118's flag/resolve, 0121's accept/unaccept), `notebook_can_read_entry`
(0118 -- notes, photos and folders follow by delegation, the one-function
visibility rule doing its job), `notebook_review_student_notebook` (0106), the
entries staff-read policy (0118) and the excusal read policy (0098). Each was
recreated from its latest applied definition with ONE predicate call swapped to
`notebook_reviews_section()` (which folds `classroom_manages_section()`, so
every re-gate is a pure widening) -- plus, where the refusal sentence named the
tiers, that sentence extended to name this one, because a refused co-teacher
should learn what grant would fix it. **The transcription was mechanical, not
typed**: a build script extracted each block from its source migration and
asserted every substitution occurred exactly once, and the test captures
prosrc/polqual BEFORE applying 0169, applies the spelled-out diff in JS, and
compares byte-for-byte against what 0169 installed.

**THE SHUT LIST IS THE CENSUS' OTHER HALF** (0169 section 6, self-checked from
the catalog at apply time and again in the test): check-in management
(authoring what students owe is the teacher of record's), doc-check links and
grading (classroom grading is exactly what this bundle must not widen), staff
delete/restore (moderation, not review -- deletion is on 0067's list), the
four admin-only actions (excusal writes, entry override, the admin log,
view-as -- the teacher of record does not hold them either, and a tier below
the teacher of record cannot hold what the teacher of record does not), and
every classroom surface. One named limitation: `_notebook_section_roster`
still asks "manages" for its exclusion flag, so a reviewer swept onto their
own section's roster shows as a student row in the grid -- teaching the 0138
exclusion about reviewers is deferred until a real case exists. Grants are
`@boscotech.edu` only (0155's rule, not 0167's both-domains deviation, which
was for its own enumerated population): a `.net` grant would put a student
account over classmates' notebooks.

**THE APP HALF.** `notebook_reviewed_sections()` (the caller's own grants with
section labels -- a reviewer cannot read `classroom_sections` at all, so
without it they would hold a grant they could not name) is read by the new
`$lib/server/notebook-review.ts`, the `gauntlet-authoring.ts` analogue -- with
one deliberate divergence: no `isAdmin` degrade on `PGRST202`, because this
tier's pre-migration world is "nobody holds it", so the degrade and the denial
coincide on the empty list. **The audit that commissioned this named
`src/lib/server/frc-review.ts` as the template; that file does not exist --
0167 shipped database-only.** `notebookAccess` gains
`isSectionReviewer`/`reviewsSections` and the review page merges reviewed
sections (each `manages: false`) with taught ones; `ReviewSection.manages` is a
new REQUIRED field so no constructor can forget the decision. The console
withholds the Check-ins tab, the Grade unit tab, the delete/restore-note
controls and the entry danger zone per SELECTED SECTION on that flag --
per-section, not per-viewer, because one person can teach P1 and review P2 --
and `SessionManager` is handed only manageable sections as posting targets.
The per-student page withholds its restore control for reviewer-only viewers
(coarse: chair-or-teaches-anything, the whole pre-0169 population; the payload
carries no section ids to ask finer with, and the RPC's gate holds regardless).

**VERIFIED:**
- `tests/notebook-section-reviewer-tier.test.ts` (rides the migration commit):
  26 tests -- transcription fidelity byte-for-byte, ACL read from the catalog
  rather than the self-check's verdict, pre-0169 seeding through the real RPCs,
  double-apply idempotency, every grant/refusal direction paired with its
  positive control, and three PERMISSIVE mutants (`notebook_reviews_section`
  -> true, `_notebook_reviews_student_email` -> true, the entries policy ->
  `using (true)`) each flipping the denial it protects and each restored from
  the file text captured at import (never `git checkout --`), md5-checked.
- `tools/browser-verify`: three new specs
  (`/dev/notebook-review?viewer=reviewer`, `?viewer=instructor`,
  `?viewer=instructor&nosections=1`). 10 route/width runs, 104 measurements,
  0 outside threshold at 375px and 1440px: the reviewer sees the grid
  (30 cells), the Review tab and the flag control, with Check-ins / Grade unit
  / Admin log tabs and the entry danger zone at present-count 0; the
  instructor spec measures the SAME selectors at 1 (the misspelled-selector
  control); the nosections spec measures the other-section teacher's view as
  the empty-state card alone. Mutating `sectionManages` to `true` reddened all
  six absence measurements at both widths; restored md5-identical, re-run
  green. Fonts blocked (fallback stack), reduced-motion not exercised, per the
  harness's standing limits. One fixture-owned console 401
  (`/api/notebook/photo/*` -- the harness has no session) is ignored by
  pattern in the two entry-opening specs.
- `svelte-check` at the baseline: 0 errors, 37 warnings (31/5/1), re-derived.
- Full `npm test` green (figure in the session report).
- The dev harness gained a `?viewer=`/`?nosections=1` seed and a `reviewer`
  viewer whose in-memory gates mirror 0169's split (`mayReview` beside
  `mayManage`; the pre-existing classroom-submission `mayReview(item, email)`
  was renamed `mayReviewSubmission` to make room). One self-inflicted finding
  caught by the run: the first reviewer `<option>` label widened the select
  past 375px (76px page overflow) -- a `<select>` sizes to its longest option.

**NOT VERIFIED:** the live Supabase project (0169 is written, not applied; the
local `.env` is the placeholder), a real signed-in session end to end, and the
`/notebook/review` route guard against a real reviewer account -- the route
gates are exercised only through `notebookAccess`'s unit-level behavior and
the harness. 0167/0168 were also unapplied at the time of writing; 0169 has no
dependency on either (it transcribes from 0140/0118/0121/0106/0098, all
applied).

**DEFERRED, NAMED:** a UI for `notebook_reviewer_grant`/`_revoke`/`_roster`
(SQL-editor-only today, like 0155 and 0167 shipped); letting a teacher of
record grant a reviewer for their own section (a delegation design with its
own questions); teaching the roster exclusion about reviewers; and a finer
per-student `canRestore` on the student review page.
