---
name: idea-course-material
description: Plan or build IDEA course material - a unit, a day's plan, an HTML assignment or lab, a rubric, instructor notes, a printed handout - for IDEA100, IDEA209H or any IDEA course.
---

# IDEA course material

Source of truth: `docs/skills/idea-course-material/SKILL.md` in pina-hash/idea-app. The full rules live beside it in `docs/standards/`: `IDEA_HTML_ASSIGNMENT_AUTHORING.md` (how an assignment is designed, built and tested; its evidence record is `IDEA_HTML_ASSIGNMENT_LESSONS.md`), `IDEA_HTML_DESIGN_DIRECTIONS.md` (how it must read and feel), `IDEA_RUBRIC_STANDARDS.md`, `IDEA_MATERIALS_PROCESS.md`. Clone the repo and read the section you need; where a clone is refused, this file is enough to start.

## 1. Start from what is true now

1. **Scope before building a unit or anything large.** Reply first with the plan as short bullets (window and day count, what each day is, points, the one hard constraint), let him react, then build. A finished workbook before scoping gets pulled back.
2. **Check what students already have.** The live export is `materials/<course>/<slug>/` in the repo (`material.json`, `assignment.json`, `rubric.json`). Never trust a runbook table or memory of what was built; about half of "not built" turns out built.
3. **Pacing facts** come from project knowledge: `Fall_2026_Calendar_Context.md`, `IDEA_bell_schedules.md` (Blocks 2-4 run 85 min on a Daily day, never 90), the course pacing workbook, the syllabus (nothing may contradict it). A missing workbook is asked for in the turn the need appears.
4. **Owning sources before authoring.** Textbooks (Library B), named standards and manufacturer documentation for engineering facts; `frctoolrecommendations.pdf` for shop tools, fasteners and PPE. Every material ships a student-visible Sources block.
5. Run deeper-not-bigger for any new unit or assignment.

## 2. Hard constraints

- IDEA209H sections run identical pacing and identical grading. Block 4 (Mr. Cosso) has no Claude access: nothing may require an unwritten judgment call.
- Deadlines are firm. No weekday names in student-facing copy. American spelling, no em dashes. Course IDs only.
- Student copy states only what is known and seen: no forward references, no internal shorthand ("R1"), no unconfirmed facts.
- Instructor materials list topics, timings, facts, expected wrong answers and likely questions with their answers, never lines to read aloud.
- Mechanical drawings of parts go to Mr. Pina.
- Never author or mention a facilitation guide unless asked.

## 3. Student-facing work is ONE HTML item

No JSON specs, no separate guide post. The guide folds into the assignment.

**Build it with the idea-html-assignment skill, test it with the idea-html-test skill.** They carry the learning brief he approves before any HTML, the hx-kit starter and build (`tools/hx-kit/`), the look (the IDEA Design System as the base, a subject palette for variance), one step per screen, and the release gates. The rules are `IDEA_HTML_ASSIGNMENT_AUTHORING.md` 2.0 or later.

Two things this skill adds for a unit:
1. **AI level per module** (0 OFF, 1 COACH, 2 ASSIST, 3 OPEN) with a one-line note for that module's real work; recommend it, he confirms. The parts that prove learning are built so AI is of little use (AUTHORING A7).
2. **Size the posts before building them** (AUTHORING Part C): one deliverable and one due date per post, one to four classes, split where the grade changes hands.

## 4. Print, only when print is the right medium

Use the space-white theme of the IDEA Design System on white paper, grayscale-safe, 0.75 in margins supplied by the renderer, nothing under 9 pt, never squeeze type to hit a page count, the full logo with the gear. Filename `[QQ]x_[N]pg_[SIDED]_[What-It-Is].pdf` with the page count read from the rendered PDF and quantities derived from enrollment, total sheets stated.

## 5. Delivered filenames

Lead with course and day: `IDEA209H_Day08_<What>.html`. Print PDFs use the print convention above.
