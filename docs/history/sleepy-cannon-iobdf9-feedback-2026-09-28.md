---
title: "Feedback round 2026-09-28: eighteen reports triaged, decisions 42 to 45, and the round 1 prompt (ledger 0347) written (`claude/sleepy-cannon-iobdf9`, docs only)"
date: 2026-09-28
branches: [claude/sleepy-cannon-iobdf9]
migrations: []
subsystems: ["IDEA Classroom", "Feedback", "IDEA Maps", "Portal", "Documentation"]
---

A feedback round, run by the same session that shipped ledger 0346 (`docs/history/sleepy-cannon-iobdf9.md`). It builds nothing. This file carries a suffix because that branch already has its history entry, and the round is a separate piece of work that happened after it.

**Input.** `idea-feedback-2026-09-28T18-30-50.zip`: eighteen reports, all Mr. Pina's, filed 2026-09-25 to 2026-09-28 against builds `abf070c` to `a4f769c`, six with screenshots. Every screenshot predates the Plate rollout. The zip, the unpacked archive and the identity list stayed in the session scratchpad. The only report text committed is what `tools/feedback_triage_md.py` rendered into `docs/feedback/2026-09-28/TRIAGE.md` (0 identity hits).

**Grounding.** Four read-only investigators checked the reports against the tree at `1183d8f5`, one each on the grading console, classroom organisation and the composer, the feedback console with voice, help and maps, and themes and identity. There were fewer than ten reports per cluster, so this used plain subagents, not the Workflow tool, which needs an explicit opt-in.

Verdicts:

| Verdict | Reports |
|---|---|
| Already shipped (in part) | R01: drag-and-drop of a ported document inside the composer's create form |
| Bug, confirmed | R11, R12, R14, R15, R17 |
| Bug, suspected | R05, R08, R09 |
| Buildable feature | R02, R04, R06, R10 |
| Conflicts with a CLAUDE.md rule | R16 (the 45% panel ceiling) |
| Needs a decision | R03, R07, R13 |
| Needs a migration | R18 |

**Decisions, asked in one batch, all answered 2026-09-28.**

- **42, feedback-console-at-admin-feedback.** The console moves to `/admin/feedback`, which needs no migration.
- **43, grading-console-redesign-no-approval-step.** Mr. Pina chose "redesign now, best judgment, no approval step, straight to main" over the narrow-fix default. The entry lists what the redesign must still keep.
- **44, team-edits-marked-edited.** A posted draw can be edited in place, keeps its seed, and says it was edited.
- **45, class-theme-by-class-vote.** One theme per course, voted into being by the class feature by feature, updated live, with no mockups. The defaults taken inside that answer are written in the entry: fixed option lists, every enrolled student votes, ties go to the first to reach the tie, a teacher-set section accent, tallies only, poll-based "live".
- **R13 was not asked.** The build session draws the alternatives and picks one, then amends decision 40 item 2. This follows the "no approval step" answer he gave for grading.

**Queue.** `docs/feedback/2026-09-28/QUEUE.md` lists the sessions in order:

1. Round 1, ledger 0347: the grading redesign and every no-migration fix.
2. Promote the 2026-09-25 SQL proposals 0228 and 0229, plus the lock change split out of 0228.
3. Teams after posting.
4. Class themes by class vote.

The FRC build waits on his approval of `docs/frc/REDESIGN_BRIEF.md`. Migration numbers 0230 (teams), 0231 (themes) and 0232 (the lock change) are reserved in the queue; no ledger entry claims them yet. Only session 1's brief and prompt are written, because a brief for session 3 would describe a tree session 1 is about to change.

**Mark seen.** `docs/feedback/2026-09-28/MARK_SEEN.sql` holds the 18 report ids, for Mr. Pina to paste once. It contains no `$` anywhere, so the SQL editor's statement splitter has nothing to trip on.

**Not verified.** Every file:line in the triage is an investigator's claim against `1183d8f5`, and the build session checks each one before relying on it. R08 (dictation on a phone) and R09 (the Matrix rain on a phone) can be neither reproduced nor verified in this container.
