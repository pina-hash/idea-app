# What happens to the 2026-09-25 feedback, in order

Run one ultracode session at a time. Its agents share one container and working tree, so two
at once write the same files (`IDEA_instructions.md`, "An `ultracode` bundle serializes").
Write each later session's brief AFTER the one before it lands, from the tree as it is then.
A brief written today about session 4 goes stale the moment session 1 moves the classroom.

| # | Session | Reports | Migration | Status |
|---|---|---|---|---|
| 1 | **Round 1**: broken in class plus every no-migration fix (ledger 0298) | R29 R07 R14 R13 R27(a) R23 R30 R20 R35b R24 R17 R26(color) R19 R16 R18 R11 R02 R25 R27(timer) R21 R28 R31 R22 R08 R04 R12 | none | brief and prompt written |
| 2 | **Turn-in model** (decision 37): no Submit on any assignment kind, editable until graded, append-only edit history, post-grade edits flagged with times; the full `/profile` page if round 1 could not place it | R27, R18 | 0228 (reserved) | write after 1 lands |
| 3 | **IdeaCAD collaboration** (decision 38): live class edit grant, live sync without refresh, conflict handling; also sketch relations and snapping (R05), the fillet gap (R06) | R34 R05 R06 | 0229 (reserved) | write after 2 |
| 4 | **Notebook redesign**: quick note from anywhere, an inbox that files itself, a one-box composer, and the check-in status demoted to a chip | R32 R33 | none for the first bundle | write after 3; defaults below |
| 5 | **FRC training: a design brief, not a build.** Inventory what is worth keeping, then answer the questions below. A build session follows his approval | R35 | none | write any time; design only |
| 6 | **Space White shape language** (decision 40 item 4): chamfered, futuristic, functional geometry and a glass exploration, as `/dev/themes` before/after mockups he approves first | R26 | none | after 1 |
| later | Tournament banner image (needs a column and an RPC); linkage motion like motiongen (R15); theme wallpapers and per-app backdrops (R09, R10) | R01 R15 R09 R10 | R01 yes | open |
| waits on him | Hex_Spacer calls perfect parts out of tolerance (R03). Needs two SQL reads first; see TRIAGE | R03 | maybe | two queries to run |

## Every session ships straight to `main`

Approved by Mr. Pina on 2026-09-25: each session merges its own branch into `main` as each
priority tier goes green, without waiting on the `integration` sweep, so work is live as soon
as it is done. For sessions 2 and 3, which carry migrations, merging to `main` also triggers
`.github/workflows/migrate.yml`, which applies the lowest unapplied migration. The client
deploy and the apply then race, so those migrations must be ADDITIVE in CLAUDE.md's sense:
new functions or new arities beside the old ones, never a drop the running client still calls.
The session states in its report that it checked this.

## Running in parallel without costing a lane

Session 5 (the FRC design brief) writes documents only and owns only `docs/frc/**`, so it can
run at the same time as round 1 at no risk. Everything else waits its turn.

## Session 4 defaults (a correction is one line)

- Quick notes are PRIVATE drafts until the student files them or turns them in (0118 already
  makes drafts invisible to staff).
- "Smart" filing is deterministic, never AI: it files by the route and class the note was
  taken on. AI touches the per-module AI policy, which is set by asking him.
- The quick note is for every signed-in person, docked in the shell header. It is never a
  floating pill, because 0297 moved the floating pills off after they won hit tests over row
  controls.
- The teacher's review grid stays as it is. The student's first screen becomes their own
  engineering log: a feed plus a one-box composer, with the check-in status as a chip.
- Three light entry templates (design decision, test result, build log) are offered, and he
  edits the wording.

## Session 5: the questions he answers before an FRC build prompt exists

1. Where does FRC training live: idea-app `/frc`, or the separate frc-app repo the standards
   register names? The default is idea-app, where sign-in, the notebook, grading, GAUNTLET and
   IdeaCAD already are.
2. What does "practical" mean? The default is that every unit ends in a real artifact or a
   demonstrated skill (a GAUNTLET clear, an IdeaCAD part, a notebook build log, a signed-off
   bench task), never a quiz alone. Today's quiz auto-gate can be passed by picking the
   longest option.
3. Who signs off a skill: him, student leads, or the artifact itself?
4. What is the unit list? That content is his, and the session drafts only the structure.
