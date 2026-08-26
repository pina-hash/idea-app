# IDEA Program - Claude Context Document
**Version 2.0 - 2026-08-20**

Program-level facts that rarely change: school, pathway, courses, platforms, and
A-G status. Behavior rules live in `IDEA_instructions.md`. Pacing and calendar live
in `Fall_2026_Calendar_Context.md`. This file holds no student data.

---

## School

**Don Bosco Technical Institute (Bosco Tech)**
1151 San Gabriel Blvd, Rosemead, CA 91770
Catholic, college-preparatory, engineering-science-technology focused.
Coeducational as of Fall 2026, the first year of the transition.
Six technology pathways: ACE, BMET, CSEE, IDEA, MSET, MAT.

---

## The IDEA Pathway

**Full name:** Integrated Design, Engineering & Art (IDEA)
**How Mr. Pina describes it:** Engineering design and manufacturing, a more accurate
description of what the course actually covers.
**Role:** One of six technology pathways. Each student selects a pathway on entry and
stays in it for four years.

IDEA is a daily technology class on the 4-block A/B schedule. Technology classes meet
every day; academic classes alternate A and B days. The course description on the
school website is outdated and is never used as a curriculum reference.

---

## Instructor

**Name:** Mr. Pina (Alejandro Pina), apina@boscotech.edu
**Role:** Technology Chair of IDEA. Manages the department and teaches the majority of
IDEA sections. Head coach, FRC Team 5669 (Techmen). Oversees the FLL program.
**GitHub:** `pina-hash` (idea-app, current work), `mrpina-dev` (legacy portal, FLL camp app)

**Colleague:** Mr. Cosso teaches the Block 4 IDEA209H section independently and has no
Claude access. He receives finished materials and nothing else, which is why materials
must be self-guided and self-contained. See the identical-pacing hard rule in
`IDEA_instructions.md`.

---

## Courses, Fall 2026

| Block | Course   | Cohort              | Instructor |
|-------|----------|---------------------|------------|
| 1     | IDEA100  | Freshman rotation   | Pina       |
| 2     | IDEA209H | Sophomore           | Pina       |
| 3     | IDEA209H | Junior              | Pina       |
| 4     | IDEA209H | Senior              | Cosso      |

- Course IDs are the canonical identifiers. No informal course names are used.
- **IDEA209H is new in Fall 2026** and runs for the first time across all three upper
  grades at once. All three sections run identical pacing and identical grading.
- **IDEA100** is the freshman trimester rotation, not UC-approved by design. Three
  rotations per semester; boundaries are in `Fall_2026_Calendar_Context.md`.
- MSET sophomores historically crossed into IDEA for Q4 and vice versa. Whether that
  swap survives the IDEA209H launch is unconfirmed for 2026-27; confirm before planning
  around it.

## Rosters

Not kept in this document. Live rosters are in FACTS and in IDEA Classroom. Ask Mr.
Pina for a current export before any task that needs student names, and treat any
roster pasted into a chat as valid for that chat only.

---

## Platforms

**IDEA Classroom (canonical):** ideabosco.com, built from `pina-hash/idea-app`
(SvelteKit + Supabase + Vercel). Carries assignments, reference documents, the digital
notebook, the grading console, the coin ledger, VANGUARD, and GAUNTLET. The app is the
source of truth for specs and exports them to the repo on publish and on every revision.

**Legacy portal:** https://mrpina-dev.github.io/IDEA. Still hosts a small amount of
unmigrated content. Never canonical for anything already moved.

**Auth:** Google OAuth. `boscotech.edu` resolves as teacher, `boscotech.net` as student.

**Gradebook:** FACTS is the system of record, fed by the grading console's FACTS-ready
CSV export plus manual transcription.

**Google Classroom:** out of the materials workflow entirely. Used for text
announcements only, if at all.

---

## Tools

- **CAD:** SolidWorks
- **Fabrication:** Bambu H2D and X1C, ABS filament, two-color printing; Bambu Studio
- **Parts:** McMaster-Carr
- **Tournament brackets:** Challonge
- **Classroom economy:** IDEA Coin (i¢). Physical 3D-printed tokens with the ledger in
  idea-app (Supabase, migrations 0070 and up). The old Google Sheets/Apps Script
  spreadsheet is archived and deactivated, not running alongside. Pricing and rules are
  in `idea_coin_economy_draft_v3.md` and `idea_coin_quick_reference.md`.
- **Presentations:** Claude Design, governed by `IDEA_CLAUDE_DESIGN_STANDARDS.md`
- **FRC team management:** `FRC-Team-5669-Techmen/frc-app` (Vite + React + Supabase +
  Vercel PWA); team website on Hygraph; team Discord

---

## Materials

All course materials follow `IDEA_MATERIALS_PROCESS.md`: authored once as a spec per
`IDEA_MATERIAL_SPEC_v2.md`, imported into a classroom item, rendered to print only when
one of the four print triggers applies. Standalone single-file HTML assignments are
retired; `HTML_ASSIGNMENT_BUILD_STANDARDS.md` is kept only as the build reference if a
legacy file is ever explicitly requested.

---

## UC A-G

Mr. Pina writes and submits IDEA course descriptions to UC's CMP portal.
`IDEA_Course_Description_Standards.md` is the source of truth for writing standards,
portal field requirements, and rejection triggers. Read it in full before drafting or
revising any description. Do not substitute general knowledge of A-G requirements.

**Approved as of 2026-07-17:** IDEA114, IDEA209, IDEA209H, IDEA210, IDEA210H. IDEA210H
is approved Area D honors, which is what puts the Q3 FRC build season under full credit.
Honors designation is droppable to the standard course version with no seat or workload
change. First semester of senior year carries honors; second semester currently does not.

**In progress:** IDEA305 and IDEA306 (Area F to D) and IDEA404 (Area G to D)
reclassification submissions. Descriptions are drafted; the reclassifications are the
highest-scrutiny submissions and go first.

**Course numbering:** a course takes a new number when it changes substantially or
changes Area.
- 100-series: IDEA100 (rotation, not UC-approved), IDEA113 (existing), IDEA114 (new)
- 200-series: IDEA205 (archiving), IDEA208 (staying), IDEA209 / IDEA209H, IDEA210 / IDEA210H
- 300-series: IDEA303 (archiving), IDEA304 (archiving), IDEA305 (new), IDEA306 (new)
- 400-series: IDEA401 (archiving), IDEA403 (staying), IDEA404 (new)

Archive an old course at the same time as or before submitting its replacement, or the
portal raises a number conflict.

---

## Notes for Claude

- The school website's IDEA course descriptions are outdated. Never use them.
- Course IDs only. Do not invent course names.
- Mr. Pina does not extend deadlines. Design assignments with firm completion criteria.
- Extra credit must be flagged before grade entry so it does not depress averages.
- Purchase authorization: the Tech Chair cannot self-approve. IAD signature required;
  Assistant Principal may also be required depending on amount. Never suggest
  self-approval.
- The only coin-to-grade crossover is 2 coins per extra credit point in IDEA209H, capped
  at 2 percent of semester points.

---

## Changelog

- **2.0 (2026-08-20)** - Rewritten for Fall 2026. Rosters removed entirely and replaced
  with a pointer to FACTS and IDEA Classroom, since the copies here went a year stale
  and a stale roster is worse than none. Courses updated from IDEA-113 / IDEA-208-2 /
  IDEA-403 to the IDEA100 plus three-section IDEA209H block map, with Mr. Cosso named.
  Portal updated to ideabosco.com as canonical. Coin ledger moved to Supabase, old
  spreadsheet marked archived. Google Classroom marked out of the workflow. Assignment
  HTML section replaced with a pointer to the materials process. A-G section updated
  with the 2026-07-17 approvals and the pending reclassifications. Added FACTS, auth
  domains, FRC platforms, and the coin-to-grade cap. Coeducational status changed from
  upcoming to current.
- **1.0** - Original context document, 2025-2026 school year.
