# IDEA Rubric Standards
**Version 1.2 - 2026-08-19**
Governs how rubrics are authored, structured, and used across every IDEA course. Applies to IDEA100, IDEA209H, and every course after.

---

## Why This Exists

IDEA209H runs three sections with two instructors. Identical pacing across sections is a hard structural guarantee. Identical grading has to be an equally hard guarantee, and it cannot be achieved by calibrating people. It has to be a property of the instrument.

A rubric criterion with one descriptor requires the grader to judge how closely the work matches it. That judgment is where drift enters: between students in the same section, between sections, and between instructors. A criterion with leveled descriptors asks the grader to select which observable description the work matches. Two graders reading countable descriptors land in the same place.

**The consistency requirement is why rubrics are authored at spec time, not at grading time.** A rubric written after the work comes in is written around the work that came in. A rubric written with the assignment defines the target before anyone attempts it, which is what makes it fair and what makes it identical across sections.

---

## Criterion Structure

Every criterion carries an id, a name, and an ordered list of levels. Every level carries a point value, an observable descriptor, and a short form.

```json
{
  "id": "c1",
  "criterion": "Material identification",
  "levels": [
    { "points": 10, "label": "Complete",  "short": "All 6, justified",     "descriptor": "All six materials correctly identified, each with a stated visual justification." },
    { "points": 7,  "label": "Proficient", "short": "4-5, or 1 unjustified", "descriptor": "Four or five materials correctly identified with justification, or all six identified with justification missing on one." },
    { "points": 4,  "label": "Developing", "short": "2-3, or none justified", "descriptor": "Two or three materials correctly identified, or all six identified with no justifications given." },
    { "points": 0,  "label": "Absent",     "short": "Under 2",             "descriptor": "Fewer than two correctly identified, or not attempted." }
  ]
}
```

### Rules

- **Every level carries a `short`.** Six words maximum, no terminal punctuation. The short form is what a grader reads when selecting a level; the full descriptor is what settles a dispute and what a student reads when they ask why. A grading console that shows only full descriptors makes a grader read roughly eighty words to pick one of four buttons, which is how grading stops being quick and starts being skipped. The short must name the same countable thing the descriptor does. If a short cannot be written in six words, the level is not distinct enough and the criterion needs rewriting.
- **Four levels by default.** Three is acceptable when a criterion is close to binary and a fourth level would be an invented distinction. Never two: a two-level criterion is a checklist item and belongs in a checklist block instead.
- **Top level equals the criterion maximum. Bottom level is always 0.** No criterion may have a floor above zero.
- **Points weight toward the top, not evenly.** Use 10/7/4/0 rather than 10/6.7/3.3/0. Proficiency is the target, and even spacing implies the midpoint is the expectation.
- **Criterion maximums are whole numbers** that sum exactly to the module's point value.
- **Level labels are consistent within an assignment.** Do not mix Complete/Proficient/Developing/Absent in one criterion with Excellent/Good/Fair/None in the next.

---

## Descriptor Writing

This is the part that does the work. Everything else is arithmetic.

**Descriptors must be observable and countable.** A descriptor states what is present in the work, not how good it is.

| Unusable | Usable |
|---|---|
| Demonstrates strong understanding of material properties | Correctly states the property and names the test that would measure it, for all four materials |
| Sketch is clear and well executed | Sketch is dimensioned, labeled with material, and shows all three views |
| Explanation is thorough | Explanation names the failure mode, cites the measured value, and states the design consequence |
| Good use of engineering vocabulary | Uses the correct term for yield, ultimate, and elastic region throughout |

**Each level differs from the one above by a stated, checkable difference.** If you cannot say in one clause what separates Complete from Proficient, the levels are not distinct and the criterion needs rewriting.

**No comparative language.** Never "better than most" or "above average for the class." A student's score cannot depend on who else is in their section.

**The test:** could a colleague with no context and no conversation with the author grade a stack of work identically using only these descriptors. If not, the descriptors are not finished. This is the operative standard for any section taught by an instructor other than the author.

---

## Grading Behavior

- **The grader selects a level.** The level's point value is applied. This is the default path and the one that produces consistency.
- **Overriding to an in-between value is allowed and requires a comment.** Edge cases are real, and forbidding judgment entirely produces worse outcomes than making judgment visible. An override without a comment is not permitted.
- **Every criterion must be scored before an assignment can be returned.** Enforced by the engine.
- **Rubrics are visible to students before submission.** A student who can read exactly what earns full credit is being graded on the work, not on their ability to guess the standard.
- **The console selects on `short` and reaches the descriptor on demand.** The selection control carries the short form so four levels can be read at a glance; the full descriptor is one expand or hover away and is always reachable without leaving the criterion. The descriptor is what a student is shown when they ask why, so it is never merely stored, it is displayed on request.
- **A level with no `short` falls back to its full descriptor rather than rendering empty.** Specs imported before version 1.1 carry no short forms, and a console that shows a blank button for them is broken in a way that looks like a data problem. The fallback is a compatibility path for material already in the database, not a license to author without `short`: a spec authored without one is invalid and fails verification before delivery.
- **Adding `short` to material already imported is a spec change, not a console change.** The console's job is to display what the rubric carries. Whatever the import path requires to get a revised spec's levels into the stored rubric is what a `short` backfill requires; do not build a second write path for one field.

---

## Authoring Workflow

Rubrics are authored inside the assignment spec, in the same pass as the content. There is no separate rubric artifact, no rubric CSV, no rubric markdown per assignment.

1. Draft module content and blocks.
2. For each module, write criteria covering what the module actually asks for. A criterion with no corresponding block is testing something the assignment never asked the student to do.
3. Write levels top-down: define Complete first, since it is the target, then define each lower level by what is missing from the one above.
4. Apply the observable-and-countable test to every descriptor.
5. Verify arithmetic: level maximums sum to module points, module points sum to assignment total.
6. The engine's rubric builder generates the grading rubric from the spec on import. Edits after generation are possible but should be rare; if a rubric needs editing after import, the spec should be corrected too so the file stays canonical.

---

## Consistency Practices

Structural guarantees handle most of this, but two practices are worth keeping:

- **First assignment of a unit:** the author and any other instructor grade the same two or three submissions independently and compare before grading the rest. Disagreement is a descriptor defect, not a people problem, and the fix is to rewrite the descriptor.
- **Recurring override:** if the same criterion is being overridden repeatedly, its levels do not match reality. Fix the spec for the next run rather than continuing to override.

---

## Verification Before Delivery

- Every criterion has 3 or 4 levels
- Every level carries a `short` of six words or fewer, naming the same countable thing as its descriptor
- No level relies on the console's descriptor fallback; the fallback exists for material imported before 1.1
- Top level equals criterion maximum, bottom level is 0
- Level maximums sum to module points; module points sum to assignment total
- Every descriptor is observable and countable
- Level labels are consistent across criteria within the assignment
- No comparative language anywhere

---

## Changelog

- **1.2 (2026-08-19)** - Grading Behavior gained the three console rules that 1.1 implied but never stated: selection reads `short` with the descriptor reachable on demand, a level with no `short` falls back to its descriptor rather than rendering an empty control, and a `short` backfill on already-imported material is a spec revision rather than a second write path for one field. The fallback is scoped explicitly as a compatibility path for specs imported before 1.1, since the field is required at authoring time and describing it as optional would make the verification list unenforceable. Housekeeping: the version header had been stale at 1.0 since the 1.1 update and now matches the changelog.

- **1.1 (2026-08-19)** - Added the required `short` field on every level. Full descriptors averaging twenty-one words made level selection slow enough in the grading console that the leveled rubric's speed advantage was being lost. Short forms carry the selection, descriptors carry the authority.

- **1.0 (2026-08-13)** - Initial standard. Replaces the flat single-descriptor rubric shape used in `IDEA_MATERIAL_SPEC_v1.md` v1.0, which could not guarantee grading consistency across sections and instructors.
