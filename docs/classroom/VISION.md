# IDEA Classroom vision

- Owner: Mr. Pina. This file holds his intent for IDEA Classroom and the notebook inside it.
  It is not a build plan and not a backlog. A plan or brief that disagrees with it is wrong,
  and this file is corrected only by him or by a session quoting him.
- Written: 2026-09-23, by the router chat, from his own words on 2026-09-23 and earlier
  statements recorded in this project. Quotes are his words with typing errors corrected.
  Everything not in quotation marks is a restatement and should be read as one.
- Companion files: `docs/standards/IDEA_CLASSROOM_REBUILD_PLAN.md` (decisions already made,
  locked unless this file or he supersedes one by name), `docs/standards/IDEA_INTERFACE_STANDARDS.md`,
  `docs/standards/IDEA_CLAUDE_DESIGN_STANDARDS.md`, `docs/classroom/research/2026-09-23-classroom-research.md`
  (the evidence behind the choices below), and `docs/ideacad/VISION.md` (on
  `claude/gracious-ride-cdf7jw` until ledger 0296 lands on `main`), whose principles about
  chrome, dead space and customization he stated for IdeaCAD and applies here too.

## What this overhaul is

> "Overhaul IDEA Classroom from the interface to the visual design to the functionality and
> everything in between. No compromises."

> "I want a finished and well rounded, highly functional and battle-tested product by the
> time Claude Opus 5.5 is done with this."

> "Remember not just theme, also functions, fine details. The details matter greatly. Very
> greatly. Space efficiency. General efficiency. All very important."

> "Dig deep. Don't miss anything."

IDEA Classroom is the program he teaches from every day: IDEA100 (the freshman rotation),
IDEA209H across three sections (Mr. Cosso teaches Block 4 with no Claude access), and FRC as
an honors course inside IDEA class time. Students post, read, hand in and get graded here,
and he projects it at the front of the room.

## It is in use, right now

> "I'm using IDEA Classroom heavily with my classes right now, so take that into
> consideration."

Nothing a student or teacher relies on today may break, disappear, or lose work: not a
published item, not an answer, not a hand-in, not a notebook entry, not a link a post or a QR
code already points at. Improvement arrives on top of what works.

## The notebook, inside the classroom

> "Integrate the notebook into IDEA Classroom with IDEA Classroom being the driving force. So
> visually and functionally the IDEA notebook should follow IDEA Classroom, not the other way
> around."

> "Currently the notebook has not been used for weeks since it isn't yet convenient and
> useful enough. There needs to be genuine integration and usefulness and practicality with
> the notebook before it will ever be used again. I think a full integration into IDEA
> Classroom would be appropriate."

The notebook stops being a separate place a student has to remember to go. It lives where
the class and the work already are, looks like the classroom, and is worth opening because it
saves the student and the teacher effort rather than adding a chore.

## A white theme for the projector

> "Add a really clean, like futuristic space console, white theme option to IDEA Classroom
> (shows better on the projector and looks clean)."

> "Don't forget to update the banner to the active theme."

On 2026-09-16 he recorded that his classroom projector's blacks are not dark enough, so dark
elements and dark backgrounds wash out. The white theme is an option beside the existing
themes, not a replacement for them. The banners and mastheads follow whichever theme is
active.

## How work on the classroom should behave

> "Seeking out improvements, especially in lower areas, and fleshing them out autonomously."

The same rule he set for IdeaCAD on 2026-09-22 applies here, in his words there: "I want for
Claude Code to seek out improvements to work towards my vision rather than just relying on the
prompt for things to add/change." And: "If one part of the program is built out really in
depth right now, I want the other parts to catch up before further progress is made on the
more developed parts." A list in a prompt is a set of seeds, never the boundary of the work.
The least mature area goes first.

## Principles that decide design questions

These are his, stated across IdeaCAD and the classroom. Where he said them about IdeaCAD they
are marked, and he applies them to the whole site.

- **Space efficiency.** Every panel and toolbar earns its area. Empty regions, oversized
  padding, and content capped narrow inside a wide pane are defects. (IdeaCAD 2026-09-22: "no
  dead space, no useless dead space.")
- **Button text never touches its border,** on any page, at any width. (IdeaCAD 2026-09-22.)
- **Nothing overlaps at half-screen width.** (IdeaCAD 2026-09-22.)
- **No prose instructions in the interface.** The program is self-explanatory; if a control
  needs a sentence explaining it, the control is wrong. (IdeaCAD: "the program itself should
  be the tutorial.")
- **Customization.** In his words, three times: "customization, customization,
  customization." Shortcuts exist for experts and are always optional. (IdeaCAD 2026-09-22.)
- **One thing to post per thing.** Never split a guide and its assignment into two classroom
  items; it confuses students every time. (2026-09-14.)
- **Everything student-facing reads well.** He finds JSON-rendered material terribly
  formatted and moved assignments to HTML for legibility (2026-09-14, 2026-09-15). Anything
  the classroom renders is held to that bar.
- **HTML assignments are fluid:** narrow in a narrow window, wider in a wide one. "This dual
  functionality is very important." (IDEA-Blade, 2026-09-14.)
- **The Cosso constraint.** Block 4 is taught by an instructor with no Claude access, so
  anything that needs an undocumented judgment call is a defect.
- **Deadlines are firm.** Nothing implies flexibility.
- **He does not want to be routed through process.** Merges, deploys and records happen
  without him; the only things that come back to him are decisions that are genuinely his.

## Shipping

> "Don't forget to tell Claude Code to merge, commit, and push directly to main. The update
> package should automatically go live as soon as it's done. Make no mistakes."

He approved merges to `main` on 2026-09-01 with one exception he agreed to: a deploy that
carries a database migration comes back to him, because he applies the SQL by hand first.

## Open questions only he can answer

Recorded so a session does not answer them silently. Each goes to `docs/decisions/entries/`
when it becomes blocking; until then the session builds the default and says so.

- Whether the standalone `/notebook` route should survive as its own door at all once the
  notebook lives inside each class, or only as a redirect into the classroom.
- Whether guardians should ever receive anything (missing-work digests are the strongest
  evidence in the research, and a guardian channel does not exist today).
- Whether any AI-assisted grading (drafted comments, imported grades) belongs in the grading
  console, given the AI policy levels he assigns per module.
- Raised by ledger 0297 (the default each one ships with is in brackets):
  - The names "Space White" and "Light" for the white theme and its one-tap button. [Built with those names.]
  - Whether a name drawn by the random picker may show on the projector wall, and whether a
    phone should be able to drive the projector, which needs a server channel and is a
    disclosure decision. [A pick shows only when the teacher presses Show; no phone remote.]
  - Whether today's agenda should follow the teacher from one device to another, which needs a
    table per class and day. [Kept on the device.]
  - Whether a student's notebook card should say "Late" when the teacher's grid does. [It does
    not; the student's status words are unchanged.]
  - Whether a next step written while approving should also mark the entry compliant (today's
    one writer of a teacher comment does), or ride with a plain acknowledgement. [It marks it.]
  - The notebook streak: consecutive class days with an entry, where a today with nothing filed
    yet does not break it. [Built that way; never ranked.]
  - The class icon format (the course code without "IDEA", over the period and block) and the
    width below which the header's tools fold into a Menu. [1180px.]
  - Whether a long unit may continue into the next column of the class page without repeating
    its heading. [It does; short units never split.]
  - Weeks in the to-do start on Sunday, undated work is listed last, and due dates name no
    weekday for teachers either. [Built that way.]
  - How long a student is shown as idle on the Live grid, and whether its door count should
    leave staff out. [5 minutes; staff are left out of the grid only.]
  - Whether the notebook capture should also be on the class page, not only on an assignment.
    [Assignment page only.]
  - Whether every existing user should be offered the classroom tour once after the deploy, teachers
    mid-class included (one row, never blocking), or whether the offer should wait. [Offered once.]
  - Whether one item should hold several named photo galleries, which needs a column. [All of an
    item's pictures form one gallery.]
  - Whether a ported HTML worksheet should keep a copy of unsaved answers in the browser, which
    changes what a worksheet opens on after a lost connection. [Not built; the design is in the history
    entry.]
  - Whether a teacher's gallery tiles should carry Rename, Remove and Move controls. [Not built.]
  - The presentation upload limit (4 MB): raising it needs one measured upload on a preview first.
    [4 MB.]
  - One class-list width across a person's classes on a device, and the Grades order remembered
    from the control itself. [Both built that way.]
