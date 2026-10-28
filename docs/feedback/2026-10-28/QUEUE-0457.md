# Queue 0457: grading

Issued 2026-10-28 from the IDEA & FRC chat "IDEA Website Feedback Pass Ranked List".
Mr. Pina's words: "go ahead and run breaks classes week items, HTML program items, and then also do 11, 12, 13, 14, 15, 16, 17, 18, 19, and 20."
This lane is items 11 to 20 of that list, except the upload-time halves of 17 and 19, which lane 0458 owns (the importer and replace screen). Lanes 0455, 0456 and 0458 run beside or after it.

Standing rules (his, from project memory):
- FACTS is the grade system of record. He does not grade IDEA209H Block 4 (Mr. Cosso's section); there he never overwrites existing IDEA Classroom grades, only fills empty ones, and reports differences from FACTS (Oct 14).
- Excused-absence extensions follow the syllabus and are checked against FACTS attendance; a student with an excused absence who still has time and has not turned the work in gets an A (absent) in FACTS.
- Partial late credit (Oct 27): items done on time earn full score, late items earn partial credit (he chose 50%), within a single assignment. Late saves are kept.
- Students must not lose points for something the assignment did not clearly ask for.
- IDEA-Blade team credit: every teammate gets the same score (team answers pooled into one submission, graded once); Hook grades are individual.
- Grading from the connector must be fast and in bulk (Oct 26): Claude sees every part of an assignment and what each student turned in.

Report ids are the first 8 characters; the connector's list_site_feedback and list_gaps return full text.

## Item 11: Block 4 grade protection (2044c229)

A per-class "fill empty only" setting that the grading console, bulk grade and the connector all respect, and a list of the grades it refused to overwrite. Today a bulk grade on a shared post can overwrite Block 4 grades.

## Item 12: connector picks the wrong class (02fd45c0)

On Oct 28 "IDEA209H Block 2" came back ambiguous between Block 2 and Block 3; on Oct 26 "209H Block 3", even the exact full title, matched Block 4. Same-titled posts across sections (Shop Fix: Design) resolve only by post id. The block number he says picks that block's class outright, and a post title plus a class picks that class's post. Class labels on the site read like "IDEA209H · Section 2 · Block 3" and "IDEA 100 · Section 2 · Block 1".

## Item 13: one "needs grading" view (gap ba704a08)

His words: "I need to catch up on grading for all my classes, except for the idea 2 9H, block 4, section 3." Needed: every past-due assignment with saved student work that has no grade yet, by class, with a way to leave out a class he does not teach. On the site and as one connector call. Today it takes about 20 calls.

## Item 14: HTML work shows "not turned in" (6aa5954d)

Every student shows "not turned in" on HTML assignments in read grades even with every answer saved. HTML posts have no turn-in button. Show "answered X of Y" and "saved after due" instead, in the grading console and the connector.

## Item 15: per-student extensions and an absent status (gap 12d29c40)

His words: "check attendance on facts to determine if students are eligible for assignment extension via the syllabus. And if so, please adjust their late date status appropriately. Or if I still have time to complete the assignment and have not turned it in, you must put a A for absent." Needed: a per-student due date on a post (an excused absence moves that student's due date by the days out) and an "absent / still has time" status on a student's work that is not a grade. Both settable from the connector in bulk.

## Item 16: partial late credit (gap d8aded45)

His words: "go ahead and add a partial late credit calculator for crediting items that were done on time for full score and late items as late within a single assignment." Needed: for each answer keep the on-time version (as of that student's own due date) and the later version, not only the latest save. On-time work earns full credit; late-only improvements earn the late rate (50%, editable). The grading console shows which answers were late on each rubric line. Workaround used: score each criterion twice and apply on-time + 0.5 x (all - on-time). Today edits after the due date erase the on-time version.

## Item 17: rubric total vs post points (gap 5b1693c1; ccecb3b9 upload half is lane 0458's)

When a rubric totals more than the post's points (Hook 03: rubric 70 on a 20-point post), scale the rubric total to the post's points, or warn. Today a grade with rubric scores ignores any total sent with it and saves the raw rubric sum, and a score-only grade reads "out of 70". Your half: grading scales or warns in the console and the connector; lane 0458 adds the warning at upload and replace.

## Item 18: grade as teams (62eded18)

IDEA-Blade 01 is graded as one merged score per team, but the site keeps one copy per student, so the merge was done by hand. Rotation 3 repeats it starting Oct 29. On any post, a "Grade as teams" switch uses the posted team draw, shows each team's answers merged (newest answer per box, with who wrote it), and saves one score to every teammate. (True team posts are lane 0456's teams page; this is for posts handed out as individual copies.)

## Item 19: rubric lines hidden on the page (c9d7efc3; the upload check is lane 0458's)

A grading audit on Oct 28 found 18 of 61 rubric lines whose requirement appeared only in a tooltip or hidden text. Your half: the grading console marks such a line for the grader. Lane 0458 flags it at upload.

## Item 20: syllabus point targets and blind grading (c622b97a)

IDEA100 Rotation 2 posts total 295 points against the syllabus's 500; IDEA209H Unit 3 is 25 Unit Assignment points short. Store the syllabus categories and their point targets per course (editable by him on the site), show posted points vs target per category on the class Grades page, and add a blind grading mode in the grading console that hides the existing score. Read the syllabi in the repo or project files for the real categories; never guess a target, leave it blank for him.
