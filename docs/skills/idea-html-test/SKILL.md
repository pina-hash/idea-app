---
name: idea-html-test
description: Test an IDEA HTML assignment before it reaches students - the automatic in-classroom test, a fresh-agent rule audit and cold open, the practicality pass, Mr. Pina's cold open and a two-student pilot - and measure it after it closes. Use before any post or re-upload, and after a post's due date.
---

# IDEA HTML assignment testing

Source of truth: `docs/skills/idea-html-test/SKILL.md` in pina-hash/idea-app. The gates are Part H of `docs/standards/IDEA_HTML_ASSIGNMENT_AUTHORING.md`. The chat that built the file never grades it: every gate here is an outside judge. Run them in order and stop at the first that fails.

## 1. The automatic test

```
node tools/hx-kit/test.mjs <file>.html
```

It runs the real importer check and the authoring validator, then drives the file inside a stand-in for the classroom item page at 1920x1080, 1440, 1152 (a laptop at 125% zoom), 960 and 375, both themes, and as a team member when the post is a team post. Every line must be PASS; read every WARN. Then open the screenshots and look at them, at least `01-in-classroom-1920x1080-first-screen.png`, every `10-step-*.png`, `03-grader-read-only-1920x1080.png` and `05-document-375.png`. A layout check passes over things only eyes catch: a label wrapping badly, an empty column, a picture that says nothing.

Pass `--today YYYY-MM-DD` to see arrival on a given class day, and `--pane <px>` with a fresher classroom measurement.

## 2. The rule audit, by a fresh agent

Start an agent that has seen neither the build nor this chat. Give it the standard and the built file, and this prompt:

> Audit this HTML assignment against every rule in this standard that applies to it. For each rule: PASS or FAIL, the line in the file that shows it, and the fix for a FAIL. Then list anything a student would stall on that no rule covers.

Fix every FAIL or write down why not.

## 3. The cold open, by another fresh agent

Give a second fresh agent only the screenshots (not the source, not the brief) and this prompt:

> Play four people meeting this assignment cold, looking only at these screens, one after another:
> 1. **Maya**, a strong 10th grader who moves fast and skims.
> 2. **Jordan**, an average 10th grader who does what the page says and nothing more.
> 3. **Theo**, a 10th grader who missed the first day of the project and has no idea what the team already decided.
> 4. **The Block 4 teacher**, who has no Claude access, did not build this, and must run the class and grade it with no explanation.
>
> For each: what do you do first, how do you know a step is done, how do you know the whole thing is done, and where exactly would you get stuck or have to guess? Quote the screen text that caused it.

Any place one of them gets stuck or guesses is a finding, fixed before posting. The teacher's answers decide whether Block 4 can run it with nothing unwritten. Then run the persona audit in `IDEA_HTML_DESIGN_DIRECTIONS.md` section 4.

## 4. The practicality pass

Walk every instruction against the real tool, the real room and the real stock (AUTHORING A9, L23), and recompute every worked example's arithmetic from its inputs (AUTHORING A6): the button names in the current version of the software, where things actually live, what the machines actually do, what students actually have. List every lab or equipment fact the file asserts and confirm each with Mr. Pina. Never assert one he has not confirmed.

## 4b. A team post: the rehearsal

Draw a test team from the test accounts (`_idea_test_emails`). Fill the post as each role, request every sign-off, and approve it from `/classroom/signoffs` and from the IDEA Website connector. The automatic test's team pass must already be PASS. Nothing team-based posts until the rehearsal passes. Ship a one-screen teacher card with it: where the sign-off queue is, what each checklist item means, what to do when a team is stuck (Block 4's teacher has no Claude).

## 5. Mr. Pina's cold open

He opens it with no explanation, as a draft post in his class (drafts are invisible to students). Send him only the posting details and one line: "Open it cold and tell me where you get stuck." Any confusion is a fail, fixed before the post goes live.

## 6. A two-student pilot, for a new kind of assignment

Two students work the first step while the class starts. Anything they stall on is fixed that day. The first week of use is part of the build: each fix goes into the standard the day it is reported.

## 7. Every re-upload

Start from the live page, never `materials/`: read the post's current document, and check the committed source rebuilds to it. Read the replace screen before saving: blocks kept, new, dropped, and how many answers each carries. Nothing dropped; a block students answered is retired, never removed. Then read the stored document again and compare it with what you uploaded.

## 8. After the post closes

Measure it, because the next post is built from what this one shows (AUTHORING C2). Through the IDEA Website connector, `read_grades` on the post: for each student, answers saved over blocks. Record the median, the share at 80% or more, and the best student's count, as aggregates only (no names). The best student under 60% of the blocks means dead blocks: cut them from the source. A median under 50% means the post was too big or its evidence sat after the work: split it, or move the evidence into the activity's post. Add the row to the standard's Part C table and a changelog line.

## Report

End with one table: each gate, PASS or FAIL, and the evidence (the report line, the agent's finding, his answer). A gate not run is written as not run, never as passed.
