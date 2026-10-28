---
title: "hx-kit: team posts a member can finish, and the overhaul chats' notes"
date: 2026-10-28
branches: ["main"]
migrations: []
subsystems: ["html-assignments"]
---

The IDEA209H Unit 4 chat (Launcher: Design, Launcher: Prototype and Detail Design) and the IDEA 100 chat (Rotation 2 Survey, IDEA-Blade 02) each sent a round of notes.

The costliest: `kitRequired` counted every role's box, and a teammate's picture never reaches `HX.images`, so no student could finish a step holding four role boxes; `test.mjs` only ever ran as one student, so nothing saw it. `kitRequired` now skips a box whose team state is `owned` or `unowned`, and the test runs a team pass after its solo finish line: the first role is the member's, the others belong to "Alex" except the last, which nobody owns; the teammates' boxes are emptied; the member must finish every step, see the finish line, and see each box that is not theirs disabled with words. It then puts the teammates' answers back so the reload check sees the page it filled.

Also in the kit: the G10 badges drawn from the manifest (on each step head, and on each answer section's eyebrow line so they cost no height; a step head moves them to their own row in a narrow column), `data-optional` steps outside the count and the next-to-do, a dropdown, `.hx-table` stacking under a 30rem column with `data-label` heads, the role ring's words left to `[data-role-owner]`. In the test: the squeeze check counts a text node's own line boxes (a table cell is as tall as its row), warnings for team pictures, team tables and the `plan-owners`/`plan-balanced` checks, the member's points, a FAIL for a plan phase with no step (a WARN when its days are all off), `data-color-pairs`, selects in the filler, and a hand-built page's missing kit colors reported instead of failed.

The standard took the rest: B9 feasibility, C3 map the unit, C4 member points, G8's survey shape (required short part, then optional depth; Mr. Pina's request to the IDEA 100 chat on 2026-10-27), G10's team rules and teacher card, Part I's edit-from-live, generators and the path for a chat that cannot push, Part H's team rehearsal.

Not built: a calculator part and physics helper, video frames fetched at build time, a build-versus-live compare by document id.
