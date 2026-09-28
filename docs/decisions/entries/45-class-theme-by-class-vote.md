# 45 Each course gets a theme, and the class votes it into being

- Raised: 2026-09-28  By: feedback round 2026-09-28, report R07.
- Status: DECIDED 2026-09-28 by Mr. Pina ("theme per course. no mockups. create a system where the class can vote on the theme and the most voted on features for the theme become the class theme. updated live.").
- Build: OPEN, session 4 of `docs/feedback/2026-09-28/QUEUE.md`.
- Decision: A course has a visual theme that tells it apart from other classes (a class banner, its My classes card, its key in the header strip). The theme is not picked by the teacher: the students vote on its features, the most-voted option for each feature wins, and the theme on screen follows the running tally live. No mockup step.
- Defaults taken inside that answer (a correction is one line):
  - **What is voted on is a short, fixed set of features, each with a fixed list of options** (for example: base palette, accent, banner pattern, badge), every option pre-measured against each site theme and the projector model, with a Space White twin, and never colour alone. A free colour picker would make legibility a matter of luck; a fixed list is what the CHECK allowlist and the contrast floors can hold. The FRC team 5669 branding page he linked seeds one option set.
  - **The electorate is everyone enrolled in any section of the course**, one vote per student per feature, changeable at any time. Section managers do not vote; they can open and close voting and reset it.
  - **Ties break toward the option that reached the tie first**, so the theme never flickers between two options on one refresh.
  - **The report's sections-of-one-course idea is kept**: sections share the voted theme, and each section differs by one accent the teacher sets, since a student in Block 2 cannot usefully vote on Block 4's colour.
  - **Only tallies are ever shown.** Who voted for what is never on any surface, the same rule every public count here follows.
  - **"Live" means the tally re-reads on a short poll and on focus**, the way posted teams do; no server push is added for it.
- Default this assistant would have picked: a teacher-chosen theme from presets, mockups first. Mr. Pina chose a class vote and no mockups.
- Why it was blocked on him: it is new visual language and a new kind of student write.
- What it unblocks: session 3 of `docs/feedback/2026-09-28/QUEUE.md` (one additive migration: theme features on the course, section accent, the vote table and definer RPCs).
- Context: `docs/feedback/2026-09-28/TRIAGE.md` R07. MyClasses.svelte's comment "never by a per-card color" is reversed by this decision and is edited in place by the build session.
