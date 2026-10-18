---
name: "deeper-not-bigger"
description: "Before building any IDEA unit, assignment, deck, or app feature, raise the ambition of the ask: outcome over task, expert methods and raw sources, outside judges, and fields beyond the obvious one."
---

# Deeper, not bigger

A pass that runs before a build, adapted from Felix Rieseberg's ambition framework (felixrieseberg.com, Oct 2026). It changes what is asked for, not how much. Output is a rewritten ask plus the questions only Mr. Pina can answer; then build.

## 1. Altitude: the goal behind the goal

Ask what Mr. Pina wants to happen after this exists. If the honest answer is a standing outcome (students can do X by date Y; production never falls behind main; every published item passes its validator), propose owning that outcome instead of producing the one artifact. List the instruments the outcome needs first: data Claude can fetch itself, a way to reproduce, a way to verify. Owning an outcome without instruments is a wish.

## 2. Depth: work the way the best in the field would

Answer four questions before writing anything:
1. What would a top professional in this field do here that was not asked for? (For manufacturing: a real quote, a real tolerance stack, a real failure part. For teaching: evidence of what students actually got wrong last time.)
2. What is the rawest source material they would start from, instead of something already digested? Under `IDEA_MATERIALS_PROCESS.md`, the owning source is consulted before authoring, and a named standard or manufacturer's documentation counts as a source.
3. What specific methods and tools would they use? Insist on the real instrument (a database, a statistical test, a simulation, a CAD script), not a markdown table in professional vocabulary.
4. What, other than Claude or Mr. Pina, will show the result is right? Name the outside judge: `validate-assignment-spec.py`, `validate-reference-spec.py`, a Chromium render at both viewport ends, a printed proof, a pixel diff, a measured number with its date. Claude never grades its own work.

Set the target unreasonably high and treat it as reachable. Models hill-climb well against a number.

## 3. Range: bring in other fields

Restate the artifact as verbs. A Shop Fix assignment is not "a worksheet"; it is getting a 15-year-old to see a manufacturing constraint in a part they designed and change the design because of it. Pick the fields those verbs need (a shop supervisor, a game designer, an assessment specialist, a QA tester whose job is to break it). Have Claude DO what each field does to the work. Never role-play their voice; that makes the transcript weirder and the work no better.

## 4. Build all the candidates

Where a choice is a taste call (visual direction, format, sequencing), build two to five candidates in parallel and let Mr. Pina pick on his phone, rather than specifying one. Double down on the winner with five variations.

## 5. Hard rules that still apply

The pass never overrides IDEA standards: student-facing copy names no weekday and is scannable; instructor materials list topics, never lines to read; mechanical drawings route to Mr. Pina; deadlines are firm; IDEA209H sections stay identical. Block 4's instructor has no Claude access, so anything requiring an undocumented judgment call is a defect.

## Output

The rewritten ask in a few lines, the outside judge named, the candidates to build, and at most one question for Mr. Pina. Then start building.