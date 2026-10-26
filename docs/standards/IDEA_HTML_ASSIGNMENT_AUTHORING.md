# IDEA HTML Assignment Authoring Standard
**Version 2.4 - 2026-10-26**

How any HTML assignment for any IDEA class is designed, built, tested and released. It is
written so the first draft is the right one: a chat that follows it delivers an assignment
Mr. Pina can open cold, understand, and post, with at most one round of changes.

**2.0 is a rebuild, not an edit.** 1.x was a defect ledger: every rule paid for by a
document that broke, which kept known failures out and said nothing about how to design a
lesson, so first drafts came out thin. 2.0 puts the learning design first (Parts A to C),
moves the plumbing into a kit and an automatic test so nobody has to remember it (Part F),
and keeps every 1.x rule, word for word, in `IDEA_HTML_ASSIGNMENT_LESSONS.md`, cited here
as **L** plus its 1.34 section number ("L17"). Nothing was dropped by the move; where 2.0
changes a 1.x rule, the changelog says which and why.

| Need | Where |
|---|---|
| Build one | the **idea-html-assignment** skill, then this file |
| Test one | the **idea-html-test** skill and `tools/hx-kit/test.mjs` |
| The starter, the plumbing, the test | `tools/hx-kit/` (its README says how) |
| The contract: manifest, bridge, sandbox | `IDEA_HTML_ASSIGNMENT_SPEC.md` |
| How each kind of HTML should read and feel | `IDEA_HTML_DESIGN_DIRECTIONS.md` |
| Why a rule exists, with its measurement | `IDEA_HTML_ASSIGNMENT_LESSONS.md` |
| Rubric levels and descriptors | `IDEA_RUBRIC_STANDARDS.md` |
| What the site does with a document, surface by surface | `docs/audits/2026-10-22-html-assignment-site-integration.md` |

Home: `docs/standards/IDEA_HTML_ASSIGNMENT_AUTHORING.md` in `pina-hash/idea-app`, the
freshness authority, with a working copy in project knowledge and a row in `REGISTER.md`.

**THIS FILE UPDATES ITSELF (Mr. Pina, 2026-09-30).** Any chat or session that builds or
revises an HTML assignment adds every fix it makes to this file in the same turn,
unprompted: the rule in the Part it belongs to (never a new dated section; the dated story
goes in the changelog line), a changelog line, and the `REGISTER.md` row, landed in the
mirror and project knowledge together. A fix to plumbing goes into `tools/hx-kit/` instead,
so every assignment gets it on its next build.

---

## Part A. What an assignment is for

Mr. Pina's vision, stated 2026-10-21. Every other rule serves these.

**A1. Real skills, not students following instructions.** A student comes out able to do
something they could not do before, in the real tool or the real shop, on their own. An
assignment a student can finish by clicking through without learning anything has failed,
however polished it is.

**A2. The automatic classroom.** Every assignment is autonomous: a student can complete it
self-guided, start to finish, at their own pace, inside the class time allotted. The help
lives in the assignment (the steps, the video, the "That is not what I see" list, the
example), not in a lecture and not in Mr. Pina walking the room. Content is built before
the class starts, so the course runs again next year without him re-teaching it. It is
more work up front than teaching it live, and that is the point: it is done once.
A step a student cannot get past without asking the teacher is a defect, unless the
assignment says who to ask and what to ask (a Print Tech, a teammate).

**A3. Hands-on and in-page, both.** Hands-on work in the tool and the shop stays the core.
The HTML is also a learning tool in its own right: a simulation, an interactive figure, a
live check, a sorted comparison, anything that gets a complex idea in faster than reading
would. The target is lean learning: the most genuinely useful learning in the least time.
Every block earns its place by what a student learns from it. No bloat, no busywork.

**A4. Never automatic.** Engineering design and manufacturing is solving problems and
finding a way to do something unfamiliar. Every assignment carries at least one real
problem the student must work through themselves: a choice with a wrong answer, a number
they must find, a fix they must design, a result they must explain. A walkthrough with
nothing to decide teaches clicking. **A question whose answer is printed beside it checks
nothing**: ask about a different instance than the one shown (the starter shows 0.512 in and
asks about a display reading 12.70 mm).

**A5. Evidence Mr. Pina grades, and the bar is visible.** No file analyzer: SolidWorks work
varies too much. A student proves the skill with evidence of their own work (a screenshot
at the step where the setup can be checked, a photo of the part, a reading only the real
act gives) and with the assignment itself done to a high standard. The page says what
high quality looks like, in the evidence panel, before the student starts.

**A6. Examples are copy-proof.** Some students copy or paraphrase any example. An example
shows the standard on a different part, problem or scenario than the one the student must
do, so the bar is clear and the answer cannot be lifted (the kit's `hx-example` panel labels
itself "different part, same standard").

**A7. AI is a tool, used responsibly.** Mr. Pina encourages AI to elevate work and does not
ban it. AI augments a student; it never replaces their work or their understanding. So an
assignment may let AI help with guidance and questions, and its most consequential parts,
the ones that prove learning, are built so AI is of little use: evidence of the student's
own part, their own readings, their own decisions about their own design, a screenshot of
their own screen. A question an AI could answer from the prompt alone proves nothing.
The course's AI level per module follows `IDEA_AI_Use_Policy.md`.

**A8. No low ceiling.** A student who finishes early is not challenging themselves, even
with perfect work. Every assignment has a stretch tier built in by the author, never left
for Mr. Pina to write later: the same skill taken deeper (a harder constraint, an
optimization, a real-world tolerance, a trade-off defended with evidence), never busy work.
Stretch pays in IDEA Coins, not grade points, so the grade stays fair; it is an
`optional: true` block that never counts toward completion. How a coin award is triggered
without hand-checking is open site work (Part J); until then the stretch block exists and
says "IDEA Coins, not points", and the award is Mr. Pina's to make.

**A9. Grounded.** Every lab, equipment or course fact comes from Mr. Pina's own materials
(his videos, slides, rulebooks, templates) or is confirmed with him before delivery. Never
a vendor default, never a guess, never a fact carried from an older document unchecked.
The video outranks an older handout (L18). Copy claims only what the real hardware does and
advice names only what the student actually has (L23).

---

## Part B. Design before HTML: the learning brief

**No HTML is written for a new assignment until Mr. Pina has approved a one-screen brief.**
This is the fix for thin first drafts: the brief carries what a rich draft needs. A
revision of a live assignment needs no brief; a new stage of one does.

The brief, as short bullets he can react to on his phone:

1. **The skill.** One sentence, a verb a student can do afterward ("read a caliper to
   0.001 in and judge a part against a tolerance").
2. **The proof.** What evidence shows a student can do it alone, and what high quality looks
   like (A5).
3. **Where they get stuck.** The real failure points, from his videos, last year's work or
   his answer; each becomes a "That is not what I see" row or a check.
4. **What it builds on.** The earlier assignment, file or skill it uses, by name.
5. **The problem they solve themselves** (A4) and **the stretch** (A8).
6. **The shape.** Classes, phases and steps (Part C), the post it lives in, points.
7. **Facts to confirm.** Every lab or equipment fact the assignment will assert (A9).
8. **The look.** The subject palette and the picture in the header (Part D).

Approved, the brief is pasted as a comment at the top of the source file, all eight items, so
the next chat that touches it inherits the intent (the starter's comment is the model; a
brief missing its facts or its look was the first thing a fresh audit caught). Before writing the brief, run the deeper-not-bigger
skill on the ask.

---

## Part C. Sizing a post: count against depth

Mr. Pina named the balance (2026-10-21): how much goes in each post against how many posts
there are. **This rule is set by his own classes' numbers, read 2026-10-22, and it is
re-checked after every post closes (C2).** The study usually cited for "more deadlines beat
fewer" (Ariely and Wertenbroch 2002, Study 2) failed to replicate, and Data Colada concluded
in September 2026 that its data were likely fabricated; nothing here rests on it.

**C1. What the live posts showed** (saved answers over blocks per student, read through the
IDEA Website connector; blocks include optional ones, so the ratio understates completion;
IDEA-Blade 01, the Shop Fix Build Log and Presentation were not yet final; DOGTAG and
SolidWorks Day measure nothing and are left out):

| Post | Blocks | Students at 80% or more | Median | The best student saved |
|---|---|---|---|---|
| Shop Trophy Tolerance Inspection (209H, 3 sections) | 8 | 88% | 0.88 | all |
| Hook 01 (IDEA100) | 12 | 0% (90% at half or more) | 0.75 | 9 of 12 |
| Shop Fix Design (209H) | 33 | 0% (72% at half or more) | 0.67 | 23 of 33 |
| Hook 03 (IDEA100) | 50 | 0% | 0.52 | 32 of 50 |
| Hook 02 (IDEA100) | 62 | 0% | 0.32 | 22 of 62 |
| Shop Trophy Portfolio Capture (209H, after the inspection) | 25 | 10% | 0.20 | |
| Shop Fix Build Log (209H, after the design) | 28 | 0% | 0.04 | 18 of 28 |

Three findings, each now a rule:

1. **Small, focused posts finish; big ones carry blocks nobody reaches.** On the 50- and
   62-block posts even the best student saved a third to two thirds. Points predicted
   nothing (the 100-point IDEA-Blade 01 landed mid-pack).
2. **A documentation post after the work collapses.** Portfolio Capture after the
   inspection and the Build Log after the design had 62% and 70% of students under a
   quarter, while the same students finished the activity posts. The record is captured
   during the work, at the machine, not as a separate post afterward.
3. **IDEA209H Unit 1's six single-hand-in posts held at 90 to 98% turned in.** A post with
   one clear finish line gets finished (the kit's finish line, E3b, gives an HTML post one).

**The rule:**

- **One post is one deliverable a student can name, with one due date and one finish line.**
  "The Tolerance Inspection", not "Day 3".
- **About 15 required blocks, 20 at most.** Every block is one a student is expected to fill;
  an optional block earns its place or goes. Past 20, split at the next hand-in.
- **One to four classes, at most four phases and about twelve steps.** The test warns past
  any of them.
- **Evidence is captured inside the activity's post, as the work happens**: the photo at
  the machine, the reading at the bench. Never a log or portfolio post due after the work is
  done.
- **Split where the grade changes hands**: at a hand-in graded on its own, at an event (a
  tournament, a test day), or where the work changes kind (design to build to present).
  Never split one class into several posts, and never a post per class by default. A
  checkpoint worth fewer than 10 points is a step, not a post.
- **A post whose phases span classes ships with today's phase only**, later phases locked,
  added by a re-upload under new permanent ids (L16).
- **IDEA209H posts one copy to all three sections** (identical pacing and grading).
- **Duplicate post does not copy an HTML document** (audit gap 1, filed): a second post is
  built from the source, never by duplicating.

**C2. Every post is measured after it closes**, and the measurement changes the next one
(the idea-html-test skill's last gate): read the post's completion through the connector's
`read_grades` (saved over blocks per student) and record the median, the share at 80% or
more, and the best student's count. **The best student below 60% of the blocks** means dead
blocks: cut them from the source before it is used again. **A median below 50%** means the
post was too big or in the wrong place in the unit: split it or move its evidence into the
activity. The numbers and the change go into this Part's table and the changelog.

---

## Part D. The look: base plus variance

**D1. The base: the IDEA Design System, through the kit.** Tokens for both themes, the
Plate components and the site's fonts are inlined by `tools/hx-kit/build.mjs` from the
design system's own `tokens.json`; nobody types a hex. Raised means pressable, inset means
read-only; panels, keys, chips and wells are the system's classes. Quality is on par with
the site because it is the site's parts (L21, design system tokens).

**D2. Color by meaning, in the chrome.** Green is act and done, and rationed: the one next
action, active and done marks, links, focus (three or fewer green elements on the first
screen; the test counts them). Amber is a limit, a warning or a deadline. Red is only a
number that must change. Cyan is help. Gold is the stretch. These never change per
assignment.

**D3. Variance: every assignment looks like itself (Mr. Pina, 2026-10-21).** Assignments
must not all look the same: "a blob of do this step, do this step". Each one has its own
identity on top of the base, so it stays cohesive with the brand and distinct from the
others:

- **A subject palette.** Two hues on `<html>` (`data-hue-from`, `data-hue-to`, OKLCH degrees,
  anywhere on the wheel; `data-hue-to` may pass 360 to run through red) and, optionally,
  `data-hue-chroma` (a multiplier: 0.3 to 0.5 for a near-neutral steel or graphite look, 1 by
  default). `build.mjs` is the one place these are read: it writes them into the page and
  refuses to build without them, because there is no default. The kit colors each phase along
  that spectrum: the plan strip, step numbers, phase tags, the step track, example and figure
  accents. Lightness is fixed per theme, so text stays readable; the test measures every
  phase color at 4.5:1 in both themes, FAILS a page whose rendered palette is not the one
  declared, and FAILS a hue inside the site's green (120 to 160, which means done). Amber and
  red keep their meaning in the chrome because chrome states carry words; a warm subject
  palette is allowed.
- **Pick the spectrum from the real subject's own colors**, never from a habit: the material,
  the machine, the part, the theme of the project. Combat and fabrication run warm (sparks,
  hot steel, copper, bronze); a printed part takes the filament's color; a calendar or
  survey takes something neither of its neighbors has. **Cyan to violet is not a default**
  (Mr. Pina, 2026-10-26: "Everything's just cyan, blue, purple now"). Until that date the
  kit never read the attributes, so every kit page showed cyan to violet whatever its author
  chose, and the examples in this section steered the rest there too. Use that band only when
  the subject itself is that color, and say so in the brief; the test warns otherwise.
  Never within 60 degrees of the course's previous assignment's pair.
- **Candidates, not one guess.** The palette is a taste call: render two to five on the real
  page (first screen and the thumbnail) and let him pick.
- **A header picture of the real subject** (the part, the tool, the machine), drawn as SVG on
  the palette or rendered from the real geometry (L21, show the real thing).
- **Figures and illustrations in the palette**, so the content layer carries the identity
  while the chrome stays the site's.
- **The plan strip is the signature**: classes grouped into phases, each phase a band in its
  spectrum color, wide as its days. The model is the openable, color-coded calendar in the
  IDEA209H Shop Fix assignment, which Mr. Pina singled out: groups of days, each a color
  along a spectrum, readable at a glance.

This supersedes, for the content layer only, L15's "one accent color" and L21's "role and
product hues are retired"; it keeps L13's idea (each stage its own hue) and L21's color by
meaning for the chrome. The design system's "no second accent hue" means no second UI
accent; the subject palette is not a UI accent and never marks an action or a state.

**D4. Theme.** The document follows the site's light or dark theme (`idea:theme`) and keeps
its own per-visit Light/Dark key; storage throws, so the choice lives in a variable. Keep
it this way (Mr. Pina, 2026-10-21, reversing a proposal to remove the key).

**D5. Premium, never bare minimum; dead space is a defect** (L8, `IDEA_HTML_DESIGN_DIRECTIONS.md`
1.2 and 1.3). Judge the first screen: if it could be any school's, it is not done.

---

## Part E. Built for the classroom page, not for a browser tab

What the frame is, from the code (audit, 2026-10-22): the document sits in a sandboxed
frame inside the classroom item page, under a 60px masthead, a 44px breadcrumb row and the
post's own header and progress rail. The frame grows to the document's full reported height
and never scrolls inside; from 1024px up the item pane scrolls on its own, below that the
whole page does. The class list starts collapsed on a work surface. **There is no expand or
full-page mode** (proposed, Part J). At 1920x1080 the pane showed about 830px of the
document (measured 2026-10-20, L22).

**E1. Pages, not one long scroll.** One step on screen at a time, with Back and a Next that
names the next step; the kit's navigator does this. **Every step, from the bar to its
bottom, fits one screen of the pane (830px at 1920x1080)**; a step that does not is split
or trimmed. The test measures every step.

**E2. One obvious next action, everywhere.** The bar says where you are in words ("Measure
· Step 3 of 4 · Measure your part") and offers Next to do when the student is somewhere
else; on the step that is next, its own Next is the one primary key. Something to do sits
on the first screen (the test checks).

**E3. Arrival is derived from saved answers.** A student lands on today's phase (from the
plan's dates) at its first step not done. **Every step asks for evidence of its own**, even
a procedure (the reading with the jaws closed, not "I zeroed it"): a step counted done on a
visit proves nothing, the kit shows "Step done" only on evidence, and the test warns on a
step without any. A grader (read-only) gets List view, every step open, and a bar that says
"Grading view, read only" with no save state.

**E3b. The finish line is said.** When everything is in, the last step says so and that
there is nothing to turn in (the work hands in as it saves, decision 37); the kit does this.
Without it a student hunts for a Submit button that does not exist.

**E4. The plan strip shows the whole unit.** Every class in the post, grouped by phase,
today marked; pressing a class opens its first step. A no-class day is a flat chip.

**E5. Inside a step, depth is one click away** and two levels at most: "That is not what I
see", optional photos, a definition behind a tap tip. Folding rules still hold inside a step
(L17): fold only on a press, `display: none` never a height animation, a closed header says
what is inside.

**E6. Design for the real screen.** Judge layout in the classroom stand-in at 1920x1080
(the test's first screenshots), then 1440, 960 (his half screen) and 375, both themes. A
screenshot of the file alone is not the judgment (L22).

---

## Part F. Building: start from the kit

`tools/hx-kit/` holds the plumbing every rule in L4 to L11 demanded, built and tested once:

```
node tools/hx-kit/build.mjs <course>_<what>.src.html     # writes <course>_<what>.html
node tools/hx-kit/test.mjs  <course>_<what>.html          # the automatic test (Part H)
```

The source carries two markers (`<!-- hx:head -->`, `<!-- hx:script -->`); the build inlines
the site's fonts, both themes' tokens, the Plate, the kit's components, the tested bridge
client (from `IDEA_HTML_ASSIGNMENT_BRIEF.md` 6.1 to 6.5) and the step navigator. **Never edit
the inlined blocks**; fix the kit and rebuild. Start every new assignment by copying
`tools/hx-kit/starter.src.html`, which shows every component in use.

**F1. One item, one file.** Everything inline; a guide folds into the assignment it serves,
never a second post (L1).

**F2. Manifest first; block ids are permanent.** Semantic ids on the first draft
(`cc-measure-readings`, never `q3`), never renamed: a renamed id orphans every answer stored
under it, silently. `field` is the document's own name and may change. A `prompt` on every
block, written as the student saw it (it heads the grader's columns). Points add up three
ways. Every `data-field` is declared and every declared field has exactly one box (L2,
SPEC 4).

**F3. The rubric generates from the manifest**; never build one by hand, and hold hand edits
until the last stage is in, because a hand-edited rubric is never re-derived (L3).
Levels follow `IDEA_RUBRIC_STANDARDS.md`.

**F4. The anatomy of a step** (kit classes):

| Part | Class | Rule |
|---|---|---|
| Head | `hx-step-head`, `h2` | The title is the action ("Measure your part"), no second numbering (L22). |
| Moves | `hx-do` | One action per line, the screen or place before the action, the control's name in bold as it appears. Steps from the teacher's video, in its order and button names (L18). |
| End frame | `hx-see` | "You should see": one sentence of what the screen or part shows when it worked. Every procedural step (L21). |
| Fix list | `details.hx-stuck` | "That is not what I see": symptoms in the student's words beside the fix (L18). |
| Evidence | `hx-evidence` | The graded inputs, in one panel inside the step that produces them, labeled as counting toward the grade (L15). |
| Example | `hx-example` | A different part, same standard (A6). |
| Stretch | `hx-stretch` | Optional, IDEA Coins not points (A8). Inside the step it extends, as a closed disclosure; never a step of its own, because a step with no required box counts as done on a visit. |
| Terms | `.it[data-term]` + `#hx-glossary` | The first use of each term; the kit writes every tip from one glossary, so a term reads the same everywhere; never on a button name (L21). |
| Video | `hx-video` + `idea:video` | The portal plays it over the box, full width, at the step it teaches, chapter keys only where students get stuck (L18, L21). A video card shows the video's own YouTube thumbnail, embedded as bytes (the frame loads no remote image), with a small play badge in a corner that never covers it; a generic card per video makes every video look the same. |

**F4b. One evidence panel per step**, the same classes on every step. When a step's moves
and its hand-ins do not fit one screen, the hand-in becomes its own step (the starter's
"Photograph it"), never a longer step.

**F4c. The document never asks for what the portal already knows**: no "Your name" box
(the portal knows the student; header blocks are for a team or a role). **It never restates
the due date**: the post holds it and the document cannot see it (audit gap 6), so a second
copy is one that disagrees; the plan strip's last class says when the work ends.

**F5. Write for scanning.** One line per idea, the verb first, the number in the line; detail
behind one disclosure. **A placeholder shows the form of an answer, starting "e.g.", and never a
value a student could take for theirs** (a fresh cold open read "0.500" as filled in and
copied it); a live readout is drawn as a line of text, never as a box that looks typeable
(the kit's `hx-readout`). Show the form only ("e.g. 0.00", "e.g. 000"): a believable number
in a measurement box is one a student copies. State the writing budget near the top ("1 sentence in the whole
thing"); a required answer is one sentence with a starter as its placeholder, and an
either/or judgment is a pick, never a sentence (L14). No weekday names, American spelling,
no em dashes.

**F6. Never a compliance form.** Counters count work, not compliance; no self-reported
process; no "I did it" checkboxes, ask for evidence the page or the grader can check (a pick
of what was actually set, a value only the real act gives, a screenshot); no single path to
completion; one required photo with optional slots (L8, L14).

**F7. Picks are picture cards; failure picks list every real mode plus "Something else"**
(L15). A pick that depends on a machine asks once and shows only that machine's steps (L13).

**F8. Never ask for a number before its instrument exists**, and name the instrument beside
the box (SolidWorks Mass Properties, the slicer, the scale). Weights in pounds and grams
(L21). A limit and a design are two labeled numbers (L21).

**F9. Live checks are mirrors, never gates**: say what to do, not just what is wrong; a
cross-check for trade-offs; an unparseable entry says so (L9). Work out the numbers a student
needs for the next decision and show them where the decision is made (the starter's average,
spread and limits, repeated on the verdict step).

**F9b. An optional box the rubric grades says when it is still empty.** A block that can only
be optional (a live post's gate may only loosen, or the box depends on a pick) but carries
rubric points gets a readout beside it: "Still to fill: wins, losses" once the pick that needs
it is made. Never hide such a box behind a pick: a hidden box is skipped by the automatic test
and by a student, so show it with a line saying when to leave it blank. **The step's own done mark
counts it too**: when the pick makes the box necessary, the page drops its `data-optional` and calls
`kitRefresh()`, so "Step done" never shows over an empty box the rubric grades.

**F10. Hand-ins.** **Where a paste goes is always marked**: the kit outlines the target box and
labels it "Ctrl+V pastes here", and clicking or tabbing to another box moves the mark (two
boxes on one screen otherwise leave a student guessing). An optional picture box sits in the
open, never behind a disclosure a student has to discover. Pictures: paste or choose, one upload at a time, a box the portal draws
the stored copy into (`data-image-box`, L10b). Files that are not pictures: the extension
checked in words, success read off `idea:state`, replace means remove first (L9b; the
portal appends a new row on every upload, so a document that skips Remove piles up old
files, audit). Links to present: a `text` block with `link: "presentation"` (L9c). A file a
vault (IDEA Armory) already holds is not uploaded again; grade from the vault (L23).

**F11. Read-only and restore are half the document.** The kit seeds every field from
`idea:state`, never overwrites a field the student touched, never trims a value it sends,
survives stale echoes, disables every graded control in read-only and leaves tools live
(L10). Derived readouts recompute in `HX.onState`. Do not hand-roll any of this.

**F12. Media budget: 2 MB per document.** Crop drawings to their frame as PNG, renders as
small WebP, video by YouTube id only; icons as inline SVG, never a glyph (L11b).

**F13. Opening something outside the frame**: Gmail compose URL over `mailto:`, never
`noopener` in `window.open` (clear `w.opener` instead), one worded key per external tool
(L5, L20).

**F14. Thumbnails**: the manifest's `thumbnail` key, a picture of the real thing (L10d, L21). The
wide and banner shapes carry the title and the stage in words, and posts in one unit look
different from each other at a glance: a different scene (the part being built, two parts
fighting) and the post's own subject palette, never the same render on the same gray.

**F15. Teams**: `idea:team-progress` reaches the document with each teammate's progress
(audit); a team assignment may show it. Teams of two in a class of threes fold one role
into another (L21).

---

## Part G. Directions by type

Each type is the core above plus these. `IDEA_HTML_DESIGN_DIRECTIONS.md` section 2 holds the
research behind them.

**G1. Worksheet** (record work and thinking). Evidence panels carry the grade; a live tool
replaces a static table where one fits; arrival on the first open step.

**G2. Walkthrough** (a machine, a program, a procedure). Every tiny step from the first click
to putting the tool back; the machine asked once; "You should see" and "That is not what I
see" on every step; checkpoint evidence where the setup can be checked; a lookup table for
anything keyed on what someone tells the student (L14, L21).

**G3. Video tutorial stage.** The teacher's own videos are the source; one move per video,
the card first; a chaptered video plays full width with Back a step and Next step under it;
chapter times from YouTube's own transcript; a video slot renders nothing until recorded
(L18, L21, L22).

**G4. Build log or hand-in** (shop work). Photos at the machine and finished; problems with
what was done about them; every change from the plan and why; a fit check with a locked
prediction before any filing (the IDEA209H Shop Fix Build Log pattern).

**G5. Design** (sketch, CAD, decide). Paper before CAD: a concept sketch per student, the
team picks one; the real part drawn from the instructor's template; fixes drawn before and
after on the earlier part's geometry (L15, L16, L21).

**G6. Results stage** (after an event). The first pick decides what else is asked; the
earlier prediction beside the result, worked out in words (L20).

**G7. Presentation.** A few named slides with a realistic example slide, mostly pictures; the
link handed in as `link: "presentation"`; the deck opened in a new tab once (L20, Design
Directions 2.7).

**G8. Survey.** Fewest questions that matter, everything optional, a `prompt` on every block
so the Answers CSV reads (Design Directions 2.8).

**G9. Simulation or game.** The interactive is the lesson: real feedback, physically honest
motion, a model only of physics the real equipment follows (L23, Design Directions 2.11).

---

## Part H. Testing and release

An assignment is released only after all seven, in order. **The chat never grades its own
work**: every gate below is an outside judge.

1. **Both validators**: the real importer check and `tools/validate-assignment-spec.py`
   (both run inside `test.mjs`).
2. **The automatic test, every line PASS**: `node tools/hx-kit/test.mjs <file>.html`. It
   serves the document under the real served policy inside the classroom stand-in and
   checks: the first screen holds something to do; the green ration; the subject palette's
   bands and contrast in both themes; every step fits the pane; no scrollbar inside the frame;
   every control 44px; every typed answer reaches the portal exactly through stale echoes;
   nothing dropped by the gate; a picture hands in and its box is reported; a reload restores
   every answer; read-only disables every graded control and shows every step; a clean
   console; no sideways scroll at 1440, 960 and 375; every step asks for evidence; the finish
   line shows when everything is in. **Then look at its screenshots.**
3. **The rule audit by a fresh agent** that has seen neither the build nor the chat: this
   file and the built document, PASS or FAIL with the line for every rule that applies (L21).
4. **The cold open by a fresh agent**: given only the screenshots and the file, it answers
   "what do you do first, and how do you know you are done?" for a first-timer, the slowest
   student and a grader. Any hesitation is a finding. Then the persona audit (Design
   Directions 4).
5. **The practicality pass**: every instruction walked against the real tool, the real room
   and the real stock; every fact on the brief's list confirmed with Mr. Pina (A9, L23).
6. **Mr. Pina's cold open**: he opens it with no explanation. Any confusion is a fail, fixed
   before posting.
7. **A two-student pilot** before the whole class, for a new kind of assignment: two
   students work the first step while the rest start; anything they stall on is fixed that
   day. The first week of use is part of the build (L14).

After the due date, **measure the post** (C2) and carry what it shows into the next one.

On every re-upload, **read the replace screen**: blocks kept, new, dropped, and the answers
each carries. None dropped (L22, L23).

---

## Part I. Delivering, and changing a live post

- **Filename** leads with course and day: `IDEA209H_Day08_<What>.html`; the source beside
  it as `.src.html`. Finished documents go to Library C.
- **Posting details** with the file: title, points, category, due date, the post text (the
  only reliably clickable link for a student).
- **A change never costs a student progress**: a block students answered is retired by
  keeping it (optional, hidden), never dropped; a completion gate only loosens; every id
  kept on a re-upload (L21, L23).
- **Answers are read in the grading console** (Answers, Answers by question, Answers CSV);
  no SQL ships with a document (L12).

---

## Part J. What the site does, and what it is missing

The audit of 2026-10-22 (`docs/audits/2026-10-22-html-assignment-site-integration.md`)
read every bridge message, surface and event in the code. What an author can count on:
saving with retries and a browser backup copy, the echo, read-only on close and in grading,
theme, video in the post, pictures and files drawn in place, presentation links, teacher
notes pinned beside a box, team progress, generated rubrics, Answers views and CSV,
thumbnails, the connector's replace with retire.

**Open site work, filed as site feedback:**

1. **Expand mode** (Mr. Pina's proposal, 2026-10-21): a control that lets the assignment take
   the whole web page above the classroom chrome, with a clear way back; not browser
   fullscreen. None exists; Foundry's `AppStage` has the pattern.
2. **Duplicate post loses an HTML document**: the copy is a plain assignment with no
   document, in the UI and through the connector.
3. **Closing an assignment while a student has it open** does not flip the open frame to
   read-only; saves are refused with the closed sentence.
4. **No notification** to a student when a grade is returned or a note arrives.
5. **Stretch coin awards cannot be automated yet**: no rule ties an award to a block or a
   rubric level; Perfect Score is the nearest hook (A8).
6. **The document cannot see its due date**; the plan's dates are written into the file.
7. Smaller: `idea:team-progress` is not re-sent after a document reloads in place; the
   cross-class console omits retired blocks from its Answers views; no export carries
   teacher notes.

---

## Course notes

Facts that hold for one course only. Confirm each with Mr. Pina before relying on it in a
new term.

**IDEA100** (freshman rotation, fun first, short writing):
- Printers: every X1 Carbon has a 0.6 mm nozzle; an H2D side may be 0.6, 0.6 High Flow or
  0.4; the slicer setting is a lookup keyed on what the Print Tech says. SD cards and drives
  live in the printers (L14, L21).
- SolidWorks exports **STEP, never STL** (`STEP AP214 (*.step;*.stp)`) (L14).
- IDEA-Blade: the launcher spins left (counterclockwise from above); blades are cut from one
  0.100 in steel sheet; the template is a five-tooth star with obround slots and a 0.50 in
  hex bore inside a 5.00 in circle; launchers are electric, so no spin-up difference (L21,
  L23).
- Team CAD lives in IDEA Armory, one project per team; a part reaches teammates on Check in
  (L21, L22, L23).

**IDEA209H** (honors, three sections):
- Identical pacing and grading across sections; one post shared to all three; Block 4
  (Mr. Cosso) has no Claude access, so nothing may need an unwritten judgment call.
- The Shop Fix calendar (Unit 3) is the model for the plan strip (D3).

---

## Changelog

- **2.4 (2026-10-26).** Ledger 0439. Mr. Pina: "Everything's just cyan, blue, purple now."
  Root cause, measured: nothing in the kit read `data-hue-from`/`data-hue-to`, so every kit
  page rendered kit.css's default 195 to 290 whatever its author set, and D3's examples plus
  test bands that excluded every warm hue steered authors to the same band anyway. D3 now: the
  palette comes from the subject's own colors anywhere on the wheel, only the site's green is
  reserved, cyan to violet is never a default, an optional chroma multiplier allows steel and
  graphite looks, candidates are rendered for him to pick. Kit: `palette` and `paletteCss` in
  `tools/hx-kit/build.mjs` (the one reader; no default, refuses to build without one),
  `--hx-cs` in `kit.css`, and `test.mjs` fails a page whose rendered palette is not the declared one.
- **2.3 (2026-10-26).** Ledger 0438. From Mr. Pina opening IDEA-Blade 01 and 02 at 3 AM before
  class: F10, the paste target is always marked and optional picture boxes sit in the open; F9b,
  the step's done mark counts a box the student's pick made necessary; F14, thumbnails carry
  the title and differ across a unit; F4, video cards show the real YouTube thumbnail with a
  corner play badge. Kit: `kitMarkPaste` in `tools/hx-kit/kit/kit.js` and its style in `kit.css`.
- **2.2 (2026-10-26).** Ledger 0435. From rebuilding IDEA-Blade 02 on the kit the night
  before class, judged by the automatic test and two fresh agents: F9b, an optional box the
  rubric grades says when it is still empty and is never hidden behind a pick; F5, placeholders
  show the form only, never a believable number; F4, the stretch lives inside the step it extends.
  Kit: `test.mjs` now hands in every required picture, so the finish line is tested on a
  complete page rather than warned about whenever a post has two picture hand-ins.
- **2.1 (2026-10-22).** Ledger 0429. Part C rebuilt on measured completion (Mr. Pina asked for the
  deeper pass on post count against depth): the live posts' completion table, about 15
  required blocks and 20 at most, evidence captured inside the activity's post rather than a
  documentation post after it, one finish line per post, and C2, every post measured after it
  closes with the thresholds that trigger a cut or a split. The deadline study the old intuition
  rested on failed to replicate and is named so nobody cites it.
- **2.0 (2026-10-22).** Ledger 0428. Rebuilt from Mr. Pina's planning session of 2026-10-21
  (the HTML Assignment Standard Rebuild Brief) after he found first drafts thin and the file
  "only works for making HTMLs that already exist". New: Part A, his vision as the core
  rules (real skills, the automatic classroom, lean learning, never automatic, evidence he
  grades, copy-proof examples, responsible AI, no low ceiling with stretch in IDEA Coins,
  grounded facts); Part B, the learning brief he approves before any HTML; Part C, post count
  against depth (proposed); Part D, base plus variance (a subject palette along a spectrum,
  the Shop Fix calendar as the model), superseding L15's one accent and L21's retired hues for
  the content layer only, and keeping the theme key; Part E, built for the classroom page
  (pages not one long scroll, every step within the 830px pane, one obvious next action);
  Part F, the kit (`tools/hx-kit/`: starter, build, plumbing) replacing rules to remember;
  Part G, directions by type for any course; Part H, seven release gates (both validators,
  the automatic in-site test, a fresh-agent rule audit, a fresh-agent cold open, the
  practicality pass, Mr. Pina's cold open, a two-student pilot); Part J, the site audit's
  findings and open site work; course facts moved to Course notes. Every 1.34 rule moved word
  for word to `IDEA_HTML_ASSIGNMENT_LESSONS.md` and is cited as L plus its section. Replaced:
  L17 to L21's following bar and stage folding, for kit builds, by one step per screen with
  the plan strip and List view (their landing and fold rules still apply inside a step).
  The starter was then put through gates 3 and 4 before landing: a fresh rule audit (15 FAILs)
  and a fresh cold open (4 stoppers) found a verdict asked with no limit given, a question
  whose answer sat beside it, a step counted done on a visit, no finish line, a name box the
  portal does not need and a due date that disagreed with the post's; each became a rule
  above (A4, Part B, E3, E3b, F4b, F4c, F9) and a kit or starter fix, and a step that grew past
  the pane was split, as E1 says.
- **1.0 to 1.34 (2026-09-10 to 2026-10-21).** See `IDEA_HTML_ASSIGNMENT_LESSONS.md`.
