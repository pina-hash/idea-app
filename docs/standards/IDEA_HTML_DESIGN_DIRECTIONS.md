# IDEA HTML Design Directions
**Version 1.0 - 2026-09-29**

What every HTML file built for Mr. Pina must meet before he sees it, what each kind of HTML
should look and behave like, and the audit that proves it. It exists so a file is right the
first time: he builds this program after his workday, and every critique he has to repeat is
an hour he did not have.

It is built from two sources, and they are kept apart on purpose:

- **His rulings.** Every critique he has given on an HTML file across his chats from May to
  September 2026, 92 of them, 46 raised more than once. A rule marked **(said xN)** is one he
  has had to say N times. His words are quoted where they carry the rule; profanity is
  paraphrased.
- **Research defaults.** Where he has not ruled, published research and design systems set
  the default (section 5 lists them). **His ruling wins over research every time**, and
  where the two disagree this file says so rather than quietly picking.

Scope: any HTML a chat or session delivers to him. A ported Classroom assignment also meets
`IDEA_HTML_ASSIGNMENT_AUTHORING.md` (the mechanics: manifest, bridge, sandbox, validators). A
deck made in Claude Design also meets `IDEA_CLAUDE_DESIGN_STANDARDS.md`. An app surface in
`idea-app` also meets `IDEA_INTERFACE_STANDARDS.md` and the repo's `CLAUDE.md`. Where one of
those is more specific, it governs its own ground.

This file's freshness authority is `docs/standards/IDEA_HTML_DESIGN_DIRECTIONS.md` in
`pina-hash/idea-app`, with a working copy in project knowledge and a row in `REGISTER.md`.

---

## 1. Universal rules

Every rule has a check. A rule with no check is a wish.

### 1.1 Say less

1. **Cut text hard. Students scan; they do not read.** (said x9, his most repeated
   critique.) "No student is going to read that and get anything out of it." One line per
   idea, the verb first, the number in the line. Check: no paragraph over three lines at
   1440px on a student surface; read the page aloud and cut every sentence a student would
   skip.
2. **If it is not absolutely needed, it is not there.** (said x7) "If its not absolutely
   needed, it just shouldnt be there." That covers sections, fields, callouts, agenda
   slides and any concept students would not act on ("demonstration match... don't even
   mention that"). Check: for each block, name what a student does with it; delete the ones
   with no answer.
3. **Detail exists, collapsed.** (said x3) The resolution of "too much text" against "extended
   high detail instructions for literally every possible action": the short line is on the
   page, the depth is one click away (a dropdown per step, a "Something went wrong" list, a
   hover or tap tip for a definition). Never more than two levels of disclosure. Never hide
   what most students need. Check: every step reads correctly with every disclosure closed.
4. **Steps are structured, never paragraph blobs.** (said x4) Numbered, one action per step,
   the screen or place named before the action, the control's name in bold exactly as it
   appears. Check: no step contains two actions joined by "and then".
5. **The document is self-contained.** (said x2) Anything said in class or on the stream is
   in the document. Check: a student absent that day can finish from the page alone, or the
   page names the one person to ask and what to ask them.
6. **Accurate to the source, and nothing assumed.** (said x5) The rulebook is authoritative;
   do not overstate a rule, add a rule, omit a key step, or name a place, person or program
   fact nobody told you. "DO NOT ASSUME; ask." No reference to something students have not
   reached yet, and no internal shorthand ("R1") in student copy. Check: every factual line
   traces to a source or to Mr. Pina; list the ones that do not and ask before delivery.
7. **Do not publish what is not final** ("remove any mention of varsity letter. ive yet to
   finalize").

### 1.2 Use the space

8. **Dead space is a defect, measured, at his half-screen width.** (said x8) He works with the
   page at half of a 1920 screen, about 960px. Check at 960, 1440 and 375: no region wider
   than 40 percent of the row sits empty beside content, no short card stretched to match a
   tall neighbor, and the page height is reported before and after a space pass.
   Whitespace that groups or separates is not dead space; space that is a byproduct of the
   layout is (section 3.1).
9. **Use the whole window; width is fluid at both ends.** (said x4 and x1) "I want for HTML
   assignments to take up either a narrow width or in a wider window a wider width. this
   dual functionality is very important." Check: no horizontal scroll at 320 and 375; at
   1440 the content uses the width in columns, never a narrow centered strip.
10. **On a wide screen, give the width to a related second column**, not a void: a step and
    its video, an input and its live result, a table of contents and the text. Keep each
    text column within about 45 to 90 characters.
11. **A table shows every column without sideways scrolling at desktop width** (said x2),
    and restacks into labeled rows on a phone.

### 1.3 Look

12. **The look is premium, not kiddy, not generic.** (said x5) "Apple" level, "no
    compromises", "over analyze the fine details". Plates that are rounded, lightly
    composited, gray gradients with a little glow; "glassy look, but not quite glass". A
    version that looked "kiddy" was rejected. Check: compare side by side with the IDEA site;
    it should look like it belongs there, not like a template.
13. **No grid backgrounds, ever.** (said x2) "if it's not a graph, there probably should not
    be a grid." No graph-paper texture, no blueprint grid, no perspective floor grid.
14. **Green is the primary accent and it is rationed.** (said x3) "Greenwashed" is a defect.
    Green means primary action, active, done, progress. No orange (his ruling of
    2026-09-29 for assignments). Other hues are allowed for identity, one per section or
    stage, each measured.
15. **Decoration must mean something.** "I dont even know what the patches are for." Every
    motif, color band or icon carries meaning a student can name. No background effect
    unless it matches the site's real one exactly; no knock-off matrix rain.
16. **The type is the site's.** Rajdhani for text, Share Tech Mono for labels and numbers,
    embedded, not the system font (his ruling of 2026-09-29: "the font choices on the
    document should be the same as on the idea classroom"). Rajdhani is narrow: set body
    text at about 17px weight 500 and check it reads at arm's length.
17. **Light and dark both exist and follow the site.** Define every color twice, dark and
    light, and measure contrast in both. A student may flip it for the visit.
18. **Critical constraints stand out.** Real hierarchy: the rules and numbers a student must
    hit are the most visible thing in their section; lead with the finished outcome in one
    line, not with logistics. Check: glance at the page for three seconds; name the limits.
19. **Show keys as keys** (a Windows key icon, not the word "Win"), and draw icons as inline
    SVG rather than trusting a glyph to render. Put the diameter sign in the sans face, not
    monospace, where it reads as a zero.
20. **Images are composited into the page** (said x3): no stark white rectangle, no sharp
    clashing corners; rounded, shadowed or set on a plate. An uploaded image fills its box.
    Every image is relevant ("completely useless" search results are worse than none) and
    can be clicked to enlarge.
21. **Icons have transparent backgrounds**, never a square plate behind them.

### 1.4 Work

22. **Fewer clicks, less scrolling.** (said x4) Ideally a task needs no scrolling to
    complete; where it must scroll, the status follows the reader (a pinned progress bar,
    a hand-in card that stays in view).
23. **Every navigation brings its target into view**, including into a collapsed section,
    and moves focus there.
24. **Every section can be collapsed** on a long page, with a real button and
    `aria-expanded`.
25. **Paste a picture straight from the clipboard, and say so on the box.** (said x2) Allow
    several pictures: one required, more optional. (said x3)
26. **Replace a long static section with a tool** where one fits (said x4): a live check,
    a calculator, a demo. The tool is a mirror of the rules, never a gate.
27. **Save state is visible and truthful**, and a failure is said in words next to the work,
    never only as a color.
28. **Text boxes grow as a student types; derived numbers update on every input.**
29. **A new document opens at zero.** No pre-applied points, no demo content (a tool that
    "opens with premade stuff" was rejected).
30. **No single path to completion**, and an optional block never lowers a completion
    score.
31. **Every referenced resource is a real link inside the document that opens in a new
    tab.** (said x5) A copy button alone is not enough. A link a student hands in must open
    for the teacher.
32. **Never replace or hide the system cursor.**
33. **Full function. "No neutering."** (said x2) If an HTML can do it standalone, it should
    do it posted; where the sandbox refuses something, route it through the portal rather
    than dropping it.

### 1.5 People

34. **Build for the slowest student.** (said x4) "Is it bulletproof enough that even [the
    slowest student] can comprehensively finish this within a reasonable amount of time?"
    Foolproof, nothing confusing, not tedious, and beginner- and disability-friendly:
    read aloud, bigger text, keyboard only, 44px targets on every student control.
35. **Completing it means learning it.** (said x2) The assignment is the engineering
    documentation; there is no separate documentation post. Every field is work a student
    would keep.
36. **It is fun, and it is not a compliance form.** (said x3) "i think you are trying too hard
    to micromanage... this is not a fun assignment." Specify the outcome and a realistic
    example, not every move.
37. **Every field can be started the day it is posted.**
38. **Improve surgically.** A full rebuild of something that works was judged worse than the
    original. Change what the critique names and keep what he did not mention.

### 1.6 Delivery

39. **One item, one HTML.** (said x3) Never two posts for one thing; everything is HTML.
40. **Deliver the posting details with the file:** title, points, category, due date, and
    the text for the post description.
41. **Do not over-deliver.** Answer the ask; offer the extra in one line.
42. **Propose, do not ask, except where layout options are genuinely ambiguous**: then show
    two or three and let him pick (he chooses by seeing them).

---

## 2. Directions by type

Each type states the reader's job first, because the job decides the layout. His rulings
come first in each list; research defaults follow and are marked **(research)**.

### 2.1 Graded worksheet or assignment (the ported Classroom HTML)

**Job:** do the work, record it, come back tomorrow and find the place.

- A pinned progress bar that shows where they are and what is next, live, clickable to
  jump. He asked for a completion bar and it stays. **(research)** a single percent bar that
  crawls early raises abandonment and a constant bar does not reduce drop-off (Villar et al.
  2013; Conrad et al. 2010): so drive it by steps, keep the first step short so it moves on
  day one, and show per-stage counts ("3 of 4") beside it.
- Stages or modules as segments, each with its own hue and a Collapse; green only for done.
- Inputs next to the instruction and the figure they use (spatial contiguity, Mayer and
  Fiorella). **(research)** labels above fields and one column of inputs (Penzo; Baymard).
- Uploads: a CAD file hand-in and a screenshot box side by side; paste works; several
  photos; the box shows the picture once it lands.
- The optional record (notes, extra photos, a test log) sits in the manifest header, not in
  a scored module.
- Video beside the step it teaches, played in the post.
- No instructor comment field in the document. No turn-in button: the work stays editable
  until he grades it.

### 2.2 Procedural walkthrough (slicing, printing, a machine)

**Job:** follow steps with eyes and hands on something else; recover when it goes wrong.

- Every tiny step, in order, from the first click to putting the tool back: "every tiny
  little nuance and step along the way, any issue they may run into... A student should be
  able to go through this autonomously."
- Ask which machine once, then show only that machine's steps.
- The official video for a step beside that step. Say so where the maker has none.
- Responsibilities in words, prominently, where a physical thing can get lost (a card, a
  drive, a tool), with a check the student ticks when it is back.
- A "Something went wrong" list organized by what the student sees, each with what to do.
- **(research)** one action per step, imperative verb first, place before action (Microsoft
  Style Guide); checkpoints only at the junctures that matter (Haynes et al. 2009, the WHO
  checklist); minimalist instruction with error recovery at the point of failure (Carroll;
  van der Meij, not opened); step text around 18 to 20px, read from arm's length.

### 2.3 Reference document or rules guide

**Job:** find one answer while doing something else, and leave.

- Folded into the assignment it serves when there is one (one item, one HTML).
- The rule first, the reason after; the numbers in a table.
- **(research)** a table of contents with in-page links and a long scroll beats accordions
  when readers compare sections (NN/g); headings whose first two words distinguish them;
  do not hide what most readers need (GOV.UK Details).

### 2.4 Calculator or small tool

**Job:** enter a few values, see the answer move.

- A brief "how to use every function" area, collapsed.
- Live result, no Calculate button; units on every field and on the result; the formula
  with the student's numbers visible (NN/g calculator guidelines).
- Both unit systems where students use both, with the one they use most as the default.
- Animations physically honest: a speed that looks like the number it shows.

### 2.5 Dashboard or tracker

**Job:** glance, spot the exception, decide.

- The one question it answers is visible at 1440x900 with no scroll and no click.
- **(research)** bars and lines, never pies, gauges or 3D; three or four status values each
  with a word or glyph; denser is fine for a teacher surface (NN/g).

### 2.6 Projected deck

**Job:** the room glances while he talks.

- 4:3 for his room. Slides full, not "half empty"; every slide passes the two-thirds fill
  floor in `IDEA_CLAUDE_DESIGN_STANDARDS.md`.
- Click-through builds for every list and step, so a slide is not "overwhelming" at once.
- Correct logos at a visible size; season artwork present; images composited; no agenda
  slide unless it earns its place.
- **(research)** one idea per slide, four bullets at most, two lines per bullet at most
  (Kosslyn et al. 2012); words on the slide are labels, the sentences are spoken
  (redundancy); body text at least 24pt, larger by the farthest seat.

### 2.7 Student presentation assignment

**Job:** a student builds a short deck about their work.

- A few named slides, each specified in a bullet or two plus a realistic example slide,
  mostly images, about 80 percent picture to 20 percent text, no reading off slides; short,
  since these are often first presentations. Specifications that were "over-specific and
  annoying to read" were rejected.

### 2.8 Survey or form

**Job:** give honest answers quickly.

- Only what students will remember; fewer, better answers ("less responses at a higher
  quality than a billion"); forty items was "way, way too many".
- Sliders with an optional comment each; everything optional; small items tucked into
  dropdowns. Fun, "not annoying in any way". Never a Google Form.
- Ship a read-only SQL query for reading the responses, since HTML responses are not in the
  grading export.

### 2.9 HTML email drafted by a button

- Opens Gmail compose, never `mailto:`. Outreach is short ("dont make them read too much");
  individual feedback is detailed. Formatting is polished, with Gmail-safe inline styles.

### 2.10 Printed handout or wall sign

- HTML assignments are never printed; they are digital tools. A printed piece follows
  `IDEA_PRINT_STANDARDS.md`: no font under 9pt, images never cropped.
- **(research)** a wall sign is scanned: verb-first headline, three to five short lines, at
  least 60 percent empty, mixed case, matte, cap height set by the farthest reader (US Sign
  Council; ADA chapter 7).

### 2.11 Game or simulation

**Job:** play, and learn from the system's feedback.

- Alive: real feedback, reveals, intensity that scales; never a "boring screen that pops
  up". Uses the whole window. Every visual is plainly visible.
- **(research)** the play field dominates; information sits near the focus; no color-only
  cue; a pause is always reachable; no more than three flashes a second (Game Accessibility
  Guidelines; WCAG 2.3.1).

---

## 3. Cross-cutting findings

### 3.1 Whitespace against dead space
Space that groups or separates does work. Space is dead when it pushes the priority content
below the fold, separates things read together, or is a byproduct of the layout rather than
a decision (NN/g). His half-screen view is where the byproduct shows first.

### 3.2 Light against dark
**(research)** light wins for long reading for typical vision and dark helps some readers
(Piepenbrock et al. 2013 via NN/g). **His ruling:** follow the site and let the student flip
it. Both are defined and both are measured; neither is an afterthought.

### 3.3 Collapse against long scroll
Collapse independent sections and depth a student needs only when stuck; never collapse
what most students need; two levels at most (NN/g accordions and progressive disclosure;
GOV.UK). A jump into a collapsed section opens it.

### 3.4 Tips on touch
A hover tip does not exist on a phone (NN/g). A tip holds only a definition or an aside; an
instruction needed to do the task is on the page. Tips stay inside the viewport.

### 3.5 Video
**(research)** tutorials get two to three minutes of attention and are rewatched; engagement
falls after about six minutes (Guo, Kim, Rubin 2014). Show the length, never autoplay, put
the video at the step, keep the text primary (NN/g).

---

## 4. The persona audit, before delivery

A file that passes the validators and the harness can still stop a class. Before delivery,
an agent that did not build the file completes it in a real browser, several times, as:

1. **The literal first-timer**, who follows every step exactly and has never done this.
   Every place they would stop, guess or do something wrong is a finding.
2. **The strongest student**, who wants to finish fast and do extra. Every redundant or
   padded thing is a finding.
3. **The student who does not care**, who wants 100 percent with junk. Every place the page
   certifies nonsense, and every disagreement between the progress bar and the rubric, is a
   finding.
4. **The student who tries to outsmart it**: wrong boxes, wrong types, undo, reload,
   read-only.
5. **The English learner or student with a reading disability**: read aloud, bigger text,
   keyboard only, a screen reader's view.

At 1440, 960 and 375, in both themes, with every navigation, contrast and dead-space check
measured. Findings are ranked (blockers, wrong instructions, confusion, polish) with the
evidence and a fix, and every blocker and wrong instruction is fixed or put to Mr. Pina as a
question before delivery. Anything the auditor could not verify (a machine's screen, a
room) is listed as a question, never asserted. Hook 02's audit found 4 blockers and 13 wrong
instructions in a file that had passed everything else.

---

## 5. Sources

His rulings: his claude.ai chats, May to September 2026, compiled and checked against these
standards on 2026-09-29 (92 critiques, 12 recorded conflicts resolved by the later ruling).

Research, opened on 2026-09-29 through a summarizing fetch tool; confirm exact wording at
the source before quoting a number from it elsewhere:
[WCAG 2.2 Understanding documents](https://www.w3.org/WAI/WCAG22/Understanding/),
[USWDS Typography](https://designsystem.digital.gov/components/typography/),
[GOV.UK Design System](https://design-system.service.gov.uk/),
[Baymard, Avoid Multi-Column Forms](https://baymard.com/blog/avoid-multi-column-forms),
[Penzo, Label Placement in Forms](https://www.uxmatters.com/mt/archives/2006/07/label-placement-in-forms.php),
[Rey et al. 2019, segmenting meta-analysis](https://link.springer.com/article/10.1007/s10648-018-9456-4),
[Mayer and Fiorella, extraneous processing principles](https://edtechuvic.ca/wp-content/uploads/sites/11/2022/09/principles-for-reducing-extraneous-processing-in-multimedia-learning-coherence-signaling-redundancy-spatial-contiguity-and-temporal-contiguity-principles.pdf),
[Villar, Callegaro, Yang 2013](https://openaccess.city.ac.uk/14427/),
[Conrad et al. 2010](https://academic.oup.com/iwc/article-abstract/22/5/417/688424),
[Microsoft Style Guide, step-by-step instructions](https://learn.microsoft.com/en-us/style-guide/procedures-instructions/writing-step-by-step-instructions),
[Haynes et al. 2009 via ScienceDaily](https://www.sciencedaily.com/releases/2009/01/090114172304.htm),
[Guo, Kim, Rubin 2014](https://up.csail.mit.edu/other-pubs/las2014-pguo-engagement.pdf),
[Kosslyn et al. 2012](https://www.frontiersin.org/articles/10.3389/fpsyg.2012.00230/full),
[Nielsen Norman Group articles on dark mode, accordions, tooltips, tables of contents,
dashboards, calculators, instructional video and progress indicators](https://www.nngroup.com/articles/),
[Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/full-list/),
[US Sign Council, legibility rules of thumb](https://origin.secure.website/wscfus/7691102/uploads/USSC_Sign_Legibility_Rules_of_Thumb.pdf).
Not opened, and therefore not relied on: van der Meij's error-information experiments and
Wroblewski's inline-validation study.

### Open conflicts this file does not settle
- `IDEA_instructions.md` still calls standalone single-file HTML "legacy", which reads as
  contradicting his "everything should be an HTML". It means the retired standalone form;
  the sentence should say so.
- `IDEA_DS_DIGEST.md` still lists grid backgrounds (`.ds-ambient-grid`,
  `.ds-ambient-floor`, a gridded paper surface) against rule 13.

---

## Changelog

- **1.0 (2026-09-29).** New. Written from Mr. Pina's HTML critiques across his chats (92, 46
  repeated) and a research brief on eight kinds of HTML, after he asked that every critique
  be captured so a file is right from the start. Universal rules, directions by type, the
  persona audit, and the conflicts left open.
