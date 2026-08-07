# IDEA AI Use Policy

**Established:** 2026-08-06 (v2, revised same day: Calculation & Analysis moved to ASSIST, Design & CAD moved to OPEN)
**Applies to:** IDEA100, all IDEA209H sections (including Mr. Cosso's independently-taught Senior section), and any course added to the pathway after this one.
**Referenced by:** `HTML_ASSIGNMENT_BUILD_STANDARDS.md` (AI-Level Badge), `IDEA_instructions.md` (HTML Assignment Workflow), `IDEA209H_AI_Policy_Quick_Reference.md` (standalone instructor copy).

This policy doesn't name a tool. Gemini, ChatGPT, Claude, whatever a student or teacher has access to, the rules are the same.

The goal isn't keeping AI out of the classroom. Some students will struggle badly without it. These are tight-knit, fast-paced classes with one instructor across as many as 20 students, and AI is how a stuck student digs themselves out of a hole without waiting for help that might not reach them in time. The goal is making sure that happens effectively and responsibly: AI helps a student learn the material, it doesn't replace learning it. Everything below exists to keep that line clear without turning into paperwork nobody reads.

---

## Two Principles

These hold at every level, in every course. Nothing below overrides them.

### 1. Verify before you trust it

AI is never the source. It's fine to use it to search, compare, or explore. It is not fine to submit a spec, number, citation, or fact because AI said so. Anything AI produces that looks like a fact gets checked against the real thing before it goes in a submission.

What "checked" means depends on the kind of work:

| Category | How you verify it |
|---|---|
| Calculation & Analysis | Confirm the setup: right formula, right values, right assumptions. Check units carry through. Sanity-check the magnitude against a case you already know. Full manual re-derivation isn't required if the setup and the sense-check both hold. |
| Research & Catalog Selection | Click through to the actual datasheet or catalog page. Confirm the number is really printed there. AI's memory of a spec is not the spec. |
| Written Reports & Reflection | Confirm any fact, standard, or figure it hands you is real and says what it claims. |
| Code | Run it. Test it against a case with a known-correct output. Code that hasn't been executed hasn't been verified. |
| Design & CAD | Check it physically closes, meets the actual load or requirement, and would manufacture the way it's drawn. Not just "looks right." Applies at every level including OPEN, verification doesn't go away just because AI's share of the work goes up. |
| Notebook & Timed/Live Work | Not applicable. Nothing AI-assisted enters this category. |

### 2. Explain it or it doesn't count

Any instructor, in any IDEA course, can ask a student to explain any part of what they submitted, at any time, in their own words. Can't explain it, it gets corrected before it earns credit.

This isn't a new rule. It's IDEA209H's Presentation and Defense mechanic, already written into the approved course description, generalized to the whole pathway. 209H runs it live and scheduled: every numerical value and selection decision gets challenged in front of the class, and an unsupported choice requires revision before the work is considered complete. Everywhere else in the pathway, the same standing right applies, it's just not always on a calendar day. A spot check during work time or at grading does the same job.

This is what makes every level below enforceable without new policing infrastructure. A student who can't explain AI-generated content fails the same way a student who can't explain their own bad arithmetic fails. "The AI gave me this" collapses on its own.

---

## The Four Levels

Every module or assignment carries one of these, shown to students as a badge.

| Level | Rule |
|---|---|
| **0 · OFF** | No AI in producing the work. Applies where the setting itself proves it: notebook entries, timed work, live defense, proctored exams. |
| **1 · COACH** | AI as tutor, any time you're stuck, not only after you finish. It can explain a concept, explain why an approach isn't working, walk you through a method you don't understand yet. It talks you through your own reasoning. It generates none of the submitted answer. |
| **2 · ASSIST** | AI can help generate, draft, search, or explore. Everything factual gets verified per the table above. Student can explain and defend every part of it. |
| **3 · OPEN** | Unrestricted. Used only when directing or evaluating AI output is itself the skill being graded. Always explicit, set by the instructor, never assumed by a student. |

**COACH versus a shortcut, same tool, same moment of being stuck:**

*"I don't understand why my torque comes out negative, walk me through what that means."* That's COACH. The student is still doing the thinking, AI is helping them find their own error.

*"What's the torque for this loading scenario."* That's not COACH, that's asking for the answer to copy. Same tool, opposite outcome. One produces understanding a student can defend later. The other produces nothing they can defend, which principle 2 catches regardless.

**OPEN still isn't a blank check:** a student who uses AI heavily to iterate a bracket design, tries several variants, picks the one that clears interference and hits the load spec, and can explain why the wall thickness and fillet radius are what they are, that's OPEN working as intended. A student who can't say why any dimension is what it is fails the defense the same way any other unexplainable submission does. The level changes how much AI can touch the process. It never changes principle 2.

---

## Category Defaults

A default, not a fixed rule. The actual level for a specific assignment, or a specific module inside a larger one, gets set by the instructor at build time and can move off the default when there's a reason to (see Setting the Level, below).

| Category | Covers | Default | Why |
|---|---|---|---|
| **Calculation & Analysis** | Force/torque/gear-ratio math, tolerance and fit, any engineering computation | 2 · ASSIST | Knowing how to set the calculation up is the tested skill, not re-doing the arithmetic by hand every time. Once the setup is right, AI computing and re-computing it as inputs change is a calculator, not a crutch. Principle 2 still requires the student to explain the method and the result. |
| **Research & Catalog Selection** | Component and material selection from real vendor sources, published datasheets, bill of materials | 2 · ASSIST | Matches how this actually gets done in industry. The risk isn't AI helping search, it's AI stating a spec that isn't real. Every number traces to the actual catalog page. |
| **Written Reports & Reflection** | Lab conclusions, design rationale, post-season analysis, self-assessment | 2 for technical/analytical writing, 1 for reflective/personal writing | The conclusion is the student's judgment either way. Reflection loses its whole point if AI writes it instead of reviewing it. |
| **Code** | Programming, scripting, embedded or robot logic | 2 · ASSIST | Matches real software practice. The line has to be one the student can explain and modify, not just paste. |
| **Design & CAD** | Mechanism design, sketching, generative-design exploration, CAD modeling | 3 · OPEN | Outcome over process. If AI gets a student to a better, faster, working design, that's the point, not a shortcut around it. Generative design is already taught content in this space. Principle 2 still applies: the student has to be able to explain and defend the resulting design when asked. |
| **Notebook & Timed/Live Work** | Contemporaneous notebook entries, in-class timed work, oral defense, proctored exams | 0 · OFF | Enforced by the setting, not an honor rule. An AI-assisted notebook entry stops being a record of what actually happened. |

---

## Setting the Level

Same pattern as choosing an assignment's visual aesthetic: recommended with a one-line reason, confirmed or overridden before anything gets built, never assumed. A calculation module meant to prove unaided competence can still drop to 0 or 1. A foundational CAD module meant to test raw interface literacy, placing a mate, dimensioning a sketch, without AI, can drop below Design & CAD's default of 3 the same way. The category table is a starting point, not a ceiling, and for Design & CAD specifically, not a floor either.

Multi-module assignments (209H's staged checkpoints are the clearest example) can carry a different level per module. Checkpoint 1 might sit at COACH while Checkpoint 2 sits at ASSIST, inside the same assignment.

### AI-Level Badge

Each module header shows the level as a badge (`AI · COACH`, etc.), next to the points badge, color-coded, with a hover tooltip carrying the full rule for that level. Full technical spec (colors, tooltip mechanism, build-time behavior) is in `HTML_ASSIGNMENT_BUILD_STANDARDS.md`. A module with no student-submitted content, a live or in-person component graded outside the page, like an oral defense, skips the badge rather than forcing a value that doesn't apply.

---

## The Declaration

Appears in every HTML assignment, in the same position it holds now: right before the submission checklist. Two parts in the same block.

### Part A, Integrity Statement

The one hard-gated checkbox. This is what preflight checks for programmatically, unchanged from current build logic.

> ☐ I completed this assignment honestly. Everything submitted is my own work, including anywhere AI helped, disclosed below. I can explain any part of it if asked.

### Part B, AI Disclosure

Sits directly under Part A in the same block. Not hard-gated the way Part A is: an incomplete answer here fails the same soft preflight check every other field already uses, shows in the failure list, Proceed Anyway or Go Back.

> **How did you use AI on this assignment?**
> - ☐ I didn't use AI on this.
> - ☐ I used it to talk through a concept, get unstuck, or check work I'd already done. It didn't generate any part of what I'm submitting.
> - ☐ I used it to help generate, draft, or search. I verified everything and can explain all of it.
> - ☐ Other.

Selecting the second option opens one required field:
> *What did you use it for, and with which tool? (Name the module or section if it varied.)*

Selecting the third option opens two required fields:
> *What did you use it for, and with which tool? (Name the module or section if it varied.)*
> *What did you check it against before submitting?*

Selecting "Other" opens one required field:
> *Explain what you did.*

The options stay the same regardless of what level the assignment or module is set to. An OFF module doesn't hide the disclosure question. A student is still expected to answer honestly, and selecting anything but the first option on an OFF module is itself the disclosure of a problem, handled the way any other flag is (see When Someone Doesn't Follow It, below).

---

## Per-Course Application

**IDEA209H, all three sections.** The defense mechanic isn't new here, it's already in the approved course description. What this policy adds is making the level explicit per checkpoint instead of leaving it implicit, and folding disclosure into the declaration every assignment already requires. Mr. Cosso's Senior section runs this from `IDEA209H_AI_Policy_Quick_Reference.md`, a standalone version of this same policy that doesn't assume access to this document.

**IDEA100.** No live defense structure exists yet. Principle 2, the standing explain-it right, is the actual backstop here: any instructor, any time. If the Design, Build, Compete arc adds staged checkpoints the way 209H has them, that's decided in the IDEA100 planning chat, not here, but the same per-checkpoint leveling drops in without any change to this document.

**Future courses.** This policy is built on six categories, not on 209H's specific structure. A new course maps its assignments onto the same six and inherits the rest.

---

## When Someone Doesn't Follow It

Same pattern 209H already uses for undefendable work: corrected before it earns credit, not zeroed outright. That covers the ordinary case, more AI than the level allowed, or a missed disclosure, caught at grading or a spot check.

Reserve an actual academic-integrity conversation for the case that's genuinely dishonest: undisclosed *and* the student can't explain it when asked directly. That combination is the tell. Either piece alone (disclosed but sloppy, or undisclosed but the student can explain it fine) is a redo, not a conduct issue.

---

## Updating This Document

Say "update AI policy: [change]" and Claude edits this file and returns it for re-upload. Same mechanism as the other standards documents.
