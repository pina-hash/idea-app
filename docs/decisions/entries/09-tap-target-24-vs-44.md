# 09 Tap targets: 24px instructor density against the 44px floor
- Raised: 2026-08-31  By: chat "Managing multiple FRC platform projects"
- Status: open
- Decision:
- Default this assistant would pick: 44px on every student-facing surface without exception; 24px permitted on instructor-only density surfaces that declare it in a named CSS class, and the standard gains that clause.
- Why it is blocked on him: It reassigns a shared rule that four sessions each correctly refused to change from inside a bundle that did not own it.
- What it unblocks: A standards edit to `IDEA_INTERFACE_STANDARDS.md` and the classroom density surfaces that sit on the seam.
- Context: `docs/standards/IDEA_INTERFACE_STANDARDS.md` section 10; `src/lib/classroom/classroom.css` around its `min-height: 24px` rule and the comment above it; `CLAUDE.md`, "44px minimum tap targets".
- Tree check (2026-09-02): the seam is real, but the standard already carries most of the default. `IDEA_INTERFACE_STANDARDS.md` 2.11 section 10 states 44px "on every student-facing surface at every width" and a 24px absolute floor "even to mouse-only instructor consoles" (added in 2.3, 2026-08-20), and `classroom.css` documents its 24px density contract against that clause. What the standard does not say is that a 24px surface must declare itself in a named CSS class; that sentence is the only part of the default not already written down.
