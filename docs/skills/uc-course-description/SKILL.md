---
name: uc-course-description
description: Write, revise or check an IDEA course description for the UC A-G Course Management Portal (CMP), Area D science or honors, including unit summaries, assignments, labs and the final assessment.
---

# UC A-G course descriptions

Source of truth: `docs/skills/uc-course-description/SKILL.md` in pina-hash/idea-app (from `IDEA_Course_Description_Standards.md` v1.2). Facts to read with it in project knowledge: `UC_AG_Policy_Guide.md`, `UC_AreaD_Science_Criteria.md`, `course-examples-consolidated.md`, the filed IDEA114, IDEA209 and IDEA210 PDFs. Library B holds the archive: check `modifiedTime` on both the Doc and the PDF before citing either. Highest-scrutiny work: think hard and check everything.

## Portal fields

- Title matches the transcript; "Honors" in BOTH Title and Transcript Abbreviation when honors.
- Local code (IDEA114, IDEA209...). Bosco Tech semester courses submit as Full Year; quarter courses (IDEA210) as Half Year.
- Subject Science (D), Engineering. Integrated Academics/CTE Yes; Engineering and Architecture; Engineering Design; Classroom Based; Add to Previous Years No.
- Co-requisite: Integrated Math I, Required, on every Area D course.
- A prerequisite introduced the same year is Recommended, not Required. IDEA100 is never a formal prerequisite; call it "the school's introductory technology rotation".

## Every section is 5 to 7 sentences, no exceptions

- **Overview**: first sentence is the block statement, "Operating on an accelerated block schedule, this course meets daily for 90 minutes over one semester, delivering [X] instructional hours equivalent to a full-year Carnegie unit." (about 135 h semester 1; 142 h semester 2; 72 h quarter). States lab time percentage (IDEA114 65, IDEA209 65, IDEA210 80, IDEA305 65, IDEA306 75, IDEA404 60), quantitative reasoning, and all three Area D criteria (questions and hypotheses; quantitative data and math; evidence-based conclusions communicated in writing). Honors: an explicit honors differentiation sentence. First mention defines "the Integrated Design Engineering and Art (IDEA) pathway".
- **Unit summary**: what students learn, at least one quantitative mention and one NGSS practice, named tools; never assignment logistics.
- **Unit assignment**: one primary deliverable, how it is evaluated, no "X is the primary assessment" opener.
- **Unit lab**: one investigation, an inquiry question, named equipment, quantitative data, calculations, one written product; safety folded into the activity and specific to its hazard; no closing meta-commentary.
- **Honors final assessment**: a comprehensive written exam (scope, problem types, how lab skills are tested); a culminating project supplements it, never replaces it.

## Course-wide checks

All 8 NGSS practices appear. At least one student-designed lab. At least two assessment types. Each lab and assignment advances the previous course's level rather than repeating it. Lab percentage counts all supervised hands-on work with documentation, not pure CAD sessions.

## Style

No em dashes, no hyphens as separators, no semicolons joining clauses, no colon between two clauses ("including" instead). 15-28 words per sentence, hard ceiling 35 (run a length check, zero violations). Vary subjects and endings; not every sentence starts "Students". Name equipment specifically; never assume a drawing exists or equipment the facility lacks. FRC may be named directly, framed as engineering validation. Avoid "culminates in", "represents", "demonstrates", "develops" as meta-commentary.

## Portal entry

Plain text per field, no markdown, standards citations kept out of the portal. Paste each field and confirm nothing truncated. Equipment columns "Equipment" and "Category" map to the portal's "Title" and "Material Type". Archive an old course number before submitting a new one that reuses it. The full original standard, with its sentence-length checker script and the course-numbering table, is `docs/archive/project-knowledge/IDEA_Course_Description_Standards.md`.

## Immediate rejection triggers

A section under 5 sentences; a missing lab in Area D; a lab that is a safety orientation, notebook review or demo; no math co-requisite; no quantitative analysis; an honors course without a written final or without "Honors" in the title.
