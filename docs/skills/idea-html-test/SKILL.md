---
name: idea-html-test
description: Test an IDEA HTML assignment before it reaches students - the automatic in-classroom test, a fresh-agent rule audit and cold open, the practicality pass, Mr. Pina's cold open and a two-student pilot. Use before any post or re-upload.
---

# IDEA HTML assignment testing

Source of truth: `docs/skills/idea-html-test/SKILL.md` in pina-hash/idea-app. The gates are Part H of `docs/standards/IDEA_HTML_ASSIGNMENT_AUTHORING.md`. The chat that built the file never grades it: every gate here is an outside judge. Run them in order and stop at the first that fails.

## 1. The automatic test

```
node tools/hx-kit/test.mjs <file>.html
```

It runs the real importer check and the authoring validator, then drives the file inside a stand-in for the classroom item page at 1920x1080, 1440, 960 and 375, both themes. Every line must be PASS; read every WARN. Then open the screenshots and look at them, at least `01-in-classroom-1920x1080-first-screen.png`, every `10-step-*.png`, `03-grader-read-only-1920x1080.png` and `05-document-375.png`. A layout check passes over things only eyes catch: a label wrapping badly, an empty column, a picture that says nothing.

Pass `--today YYYY-MM-DD` to see arrival on a given class day, and `--pane <px>` with a fresher classroom measurement.

## 2. The rule audit, by a fresh agent

Start an agent that has seen neither the build nor this chat. Give it the standard and the built file, and this prompt:

> Audit this HTML assignment against every rule in this standard that applies to it. For each rule: PASS or FAIL, the line in the file that shows it, and the fix for a FAIL. Then list anything a student would stall on that no rule covers.

Fix every FAIL or write down why not.

## 3. The cold open, by another fresh agent

Give a second fresh agent only the screenshots (not the source, not the brief) and this prompt:

> You are a ninth grader who has never seen this assignment. Looking only at these screens: what do you do first, how do you know a step is done, and how do you know the whole thing is done? Then answer as the slowest student in the class, and as a teacher grading it cold with no explanation. Name every place you would hesitate or guess.

Any hesitation is a finding. Then run the persona audit in `IDEA_HTML_DESIGN_DIRECTIONS.md` section 4.

## 4. The practicality pass

Walk every instruction against the real tool, the real room and the real stock (AUTHORING A9, L23): the button names in the current version of the software, where things actually live, what the machines actually do, what students actually have. List every lab or equipment fact the file asserts and confirm each with Mr. Pina. Never assert one he has not confirmed.

## 5. Mr. Pina's cold open

He opens it with no explanation, as a draft post in his class (drafts are invisible to students). Send him only the posting details and one line: "Open it cold and tell me where you get stuck." Any confusion is a fail, fixed before the post goes live.

## 6. A two-student pilot, for a new kind of assignment

Two students work the first step while the class starts. Anything they stall on is fixed that day. The first week of use is part of the build: each fix goes into the standard the day it is reported.

## 7. Every re-upload

Read the replace screen before saving: blocks kept, new, dropped, and how many answers each carries. Nothing dropped; a block students answered is retired, never removed. Then open the live post and confirm the new text is there.

## Report

End with one table: each gate, PASS or FAIL, and the evidence (the report line, the agent's finding, his answer). A gate not run is written as not run, never as passed.
