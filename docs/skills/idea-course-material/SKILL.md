---
name: idea-course-material
description: Plan or build IDEA course material - a unit, a day's plan, an HTML assignment or lab, a rubric, instructor notes, a printed handout - for IDEA100, IDEA209H or any IDEA course.
---

# IDEA course material

Source of truth: `docs/skills/idea-course-material/SKILL.md` in pina-hash/idea-app. The full rules live beside it in `docs/standards/`: `IDEA_HTML_ASSIGNMENT_AUTHORING.md` (mechanics, every rule paid for), `IDEA_HTML_DESIGN_DIRECTIONS.md` (how it must read and feel), `IDEA_RUBRIC_STANDARDS.md`, `IDEA_MATERIALS_PROCESS.md`. Clone the repo and read the section you need; where a clone is refused, this file is enough to start.

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

1. **One self-contained file**, everything inside it, posted as one Classroom item.
2. **Manifest first.** Module and block ids are the join key for student answers: semantic and permanent from the first draft. Never rename or reorder ids on a published item; append only (checklists store positionally).
3. **Rubric**: leveled, 3 or 4 levels (never 2), top level = criterion max, bottom = 0, weighted toward the top (10/7/4/0), a `short` of six words or fewer per level, observable and countable descriptors, no bonus criteria, sums exact.
4. **AI level per module** (0 OFF, 1 COACH, 2 ASSIST, 3 OPEN) with a one-line note for that module's real work; recommend it, he confirms.
5. **Look and feel**: run the idea-design skill. Plate look from the live site, Rajdhani and Share Tech Mono, fluid at 320 to 1920, no dead space at 960 (his half-screen), every control 44px, every stage foldable from anywhere, only the next move open, detail behind one disclosure, videos embedded at the timestamp, pictures pasted straight from the clipboard.
6. **Validate**: both validators in the repo (`tools/validate-assignment-spec.py` for the manifest rules; the HTML checks in AUTHORING section 11), then a real Chromium run at 375, 960 and 1440 in both themes, looked at, not just measured.
7. **Persona audit** before delivery: the slowest student, a student absent that day, Mr. Cosso grading it cold.
8. **Deliver** the file plus posting details (title, points, category, due date, post text). Archive to Library C.
9. **Every fix you make goes into `IDEA_HTML_ASSIGNMENT_AUTHORING.md`** in the repo in the same turn, unprompted.

## 4. Print, only when print is the right medium

Use the space-white theme of the IDEA Design System on white paper, grayscale-safe, 0.75 in margins supplied by the renderer, nothing under 9 pt, never squeeze type to hit a page count, the full logo with the gear. Filename `[QQ]x_[N]pg_[SIDED]_[What-It-Is].pdf` with the page count read from the rendered PDF and quantities derived from enrollment, total sheets stated.

## 5. Delivered filenames

Lead with course and day: `IDEA209H_Day08_<What>.html`. Print PDFs use the print convention above.
