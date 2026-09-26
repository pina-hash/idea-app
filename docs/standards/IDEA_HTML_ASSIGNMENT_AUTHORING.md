# IDEA HTML Assignment Authoring Standard
**Version 1.1 - 2026-09-25**

For a chat that is WRITING an assignment, not building the subsystem that serves it.

`IDEA_HTML_ASSIGNMENT_SPEC.md` owns what the subsystem is and how it behaves. This file
owns what an author has to do, in the order they have to do it, and every rule in it was
paid for by a document that shipped or nearly shipped wrong. Read the SPEC when you need
the contract. Read this when you need to write one.

This file has exactly one home and it does not move:
`docs/standards/IDEA_HTML_ASSIGNMENT_AUTHORING.md` in `pina-hash/idea-app`, which is its
freshness authority, with the working copy in project knowledge and a row in `REGISTER.md`.
Fetch the mirror before editing it and again immediately before delivering it.

---

## 1. One item, one file, everything inside it

**An HTML assignment is a single self-contained document.** Markup, styles, script and
manifest, all inline. No external stylesheet, no CDN, no font file, no image URL. It is
uploaded whole, stored verbatim and served from a sandboxed second origin.

**A GUIDE IS NOT A SECOND ITEM.** The importer refuses any HTML document that is not a
graded assignment: a module needs a non-empty `criteria` array and a criterion needs three
or four levels, so a zero-point reference document cannot be posted on this path at all.
Measured 2026-09-14 against `validateHtmlManifest` with both a criteria-free module and a
single-level criterion; both refused.

That is not a limitation to work around with a second posting. **Fold the guide into the
assignment it serves**, as collapsed `<details>` sections above the work, marked not
graded. Mr. Pina's words on 2026-09-14: posting two separate items for one thing makes no
sense and confuses students. Two items also means two due dates, two grade rows and two
places for a student to look for the same rule.

A guide with no assignment attached stays a reference spec under
`IDEA_MATERIAL_SPEC_v2.md` until the importer accepts a zero-point document.

---

## 2. Write the manifest first, and treat block ids as permanent

The manifest is a `<script type="application/json" id="idea-manifest">` block in the head.
`IDEA_HTML_ASSIGNMENT_SPEC.md` section 4 owns its shape. Three authoring consequences:

**Block ids are the join key for every answer ever stored under them, and they are
permanent.** Renaming one orphans that student's work silently: nothing errors, the answer
simply stops rendering. Choose semantic ids on the first draft, before anybody has typed
anything, and never tidy them afterwards. `pres-plan-blade` survives a rewrite of the
question it sits under; `q3` does not survive the question moving.

**`id` and `field` are different strings on purpose.** `id` goes to the database and is
frozen. `field` is the document's own `data-field` and can be renamed freely, because it
never leaves the file.

**The points arithmetic is checked three ways.** Every criterion's `points` equals its top
level's points, every module's `points` equals its criteria summed, and the document's
`points` equals its modules summed. A mismatch anywhere is a refusal, not a warning.

---

## 3. The rubric writes itself, and a hand edit is never re-derived

Importing the document generates the rubric from the manifest. **Do not build one by hand
in the rubric builder**, and do not ask Mr. Pina to. The builder is for `schemaVersion: 1`
spec assignments.

Two behaviors worth knowing while authoring:

- The rubric is rewritten at **every** revision, so a re-upload carries corrected levels
  through without touching a score.
- **A hand-edited rubric is never re-derived.** Once somebody edits it in the console, later
  uploads leave it alone. So if a rubric has been touched by hand, changing the manifest's
  levels changes nothing a grader sees.

Levels follow `IDEA_RUBRIC_STANDARDS.md`: three or four, never two, strictly descending,
bottom at 0, top equal to the criterion. A criterion worth less than 2 points cannot carry
three distinct levels above zero, so do not write 1-point criteria.

---

## 4. What the sandbox costs an author

The full list is SPEC section 7. The ones that bite an author:

| Thing | What happens |
|---|---|
| `localStorage` | **Throws**, it does not return null. A copied autosave takes the page down before anything renders. |
| Network of any kind | Refused. No fetch, no image URL, no analytics. |
| Web fonts | Refused by CSP, including all three IDEA typefaces. Use system and monospace stacks. |
| `window.print()` | Returns silently and does nothing. A Print button is inert. |
| Downloads | Do not fire. A "download with data" control is inert. |
| File upload by the document | Impossible. Image bytes go up as `idea:image` and the parent uploads them. |
| Submit | Not the document's. Hand-in is a parent control in parent chrome. |
| Popups | **Allowed** since ledger 0153. `allow-popups allow-popups-to-escape-sandbox` are both granted and both required. |

State is seeded by the parent through `idea:state` and saved through `idea:change`. A
document that does not send `idea:ready` never gets seeded and loses everything a student
types, which the validator refuses outright.

---

## 5. Opening something outside the frame

Popups work now, so an author can send a student to a deck, a form or a mail draft. Three
findings, all measured, all of which produce a broken-looking button if ignored.

**`mailto:` is not reliable and should never be the primary control.** On a managed school
Chrome nothing is registered to handle the protocol, so `window.open('mailto:...')` opens a
tab, finds nowhere to send it, and leaves the student on `about:blank`. Confirmed
2026-09-14 from Mr. Pina's own screenshot of exactly that, on the school account, against
IDEA100 Blade CAD 02's work order button.

**Use the Gmail compose URL instead**, which needs no protocol handler and every student
has the account:

```
https://mail.google.com/mail/?view=cm&fs=1&tf=1&to=<addr>&su=<subject>&body=<body>
```

Keep `mailto:` as a second button for anyone with a real mail client, and keep a Copy
button as the floor, because a blocked tab has to leave the student somewhere.

**Never pass `noopener` in the `window.open` feature string.** It makes the call return
`null` by specification, which is indistinguishable from a blocked popup: a tab that opened
perfectly reported "your browser blocked the new tab" underneath it, 2026-09-14. Clear
`w.opener` on the returned handle instead, and treat a genuine `null` as the blocked case.

**A mail body is plain text rendered in a proportional font.** Format with horizontal rules
and headings, never with padded columns: a run of one repeated glyph draws a clean line at
any font, while aligned label columns fall apart the moment two labels differ in width.

---

## 6. Width: fluid, both ends, and this is not optional

**A document must read well in a narrow column and use the space in a wide pane.** Mr.
Pina, 2026-09-14: this dual functionality is very important. IDEA Classroom widens the page
for a ported assignment, and a document locked to a phone layout wastes the whole pane.

How, concretely:

- Grids reflow on their own content with `repeat(auto-fit, minmax(min(<n>px, 100%), 1fr))`,
  not at named breakpoints.
- Cap the tracks with a `max-width` on the grid where more columns would be worse than
  fewer. Six limit cards in a row is not an improvement on four.
- Page container up to about 1680px, with padding that grows: `clamp(14px, 2.2vw, 34px)`.
- Prose stops at a readable measure in `ch`, never at the pane width.
- Media queries handle only what a grid cannot decide: when a two-column hero stacks, when
  a pinned bar drops its meta column, when a table restacks.
- A table that restacks on a phone carries its column labels with it, or the second column
  becomes an unlabeled paragraph.

**Verify at four widths and look at the rasters.** 1600, 1100, 760 and 400. A content check
passes over a broken layout, and this Chromium paints no scrollbar into a screenshot.

---

## 7. Height, and the 2px that draws a scrollbar

The document reports its own height with `idea:height` and the parent sizes the frame to
it. **`.hx-frame` carries a 1px border**, so a frame sized to exactly the reported height is
2px shorter inside than the document needs, and that 2px overflow draws a full scrollbar
inside the assignment.

**Report `offsetHeight + 4`** until the frame's own border is accounted for parent-side.
Measured 2026-09-11, reproduced 2026-09-14.

**`position: sticky` cannot work in this document.** The frame is as tall as the whole
document, so nothing ever scrolls within it; the scrolling element is the parent page. A
pinned header uses `IntersectionObserver` probes and positions in **document** coordinates
(`rect.top + window.scrollY`), which also keeps working if a frame ever does scroll
internally.

**Clip the probe strips to the document.** Strips are rebuilt only when the height moves
by more than one strip, so after a small shrink the last strip hangs below the document
and draws an inner scrollbar. Set the probe container's height to the document height on
every resize, with `overflow: hidden`. Measured 2026-09-22 on the IDEA100 Rotation Survey.

**An element that follows the reader** (the Dogtag hand-in card) sits in a wrapper that
stretches to its grid row, and is moved with `translateY`, clamped between 0 and the
wrapper's height minus its own. Only in the layout where it has a column of its own:
stacked on a phone, it stays in normal flow.

**Never change layout inside a `ResizeObserver` callback.** Rebuilding probes there, or
posting `idea:height` so the parent resizes the frame, raises "ResizeObserver loop completed
with undelivered notifications" in Classroom's console. Queue the work with
`requestAnimationFrame`, and send `idea:height` only when the height actually changed.
Seen in Mr. Pina's console 2026-09-24 on the Dogtag; not reproduced in container Chromium,
so a clean container run is not evidence this is fixed in a new document.

---

## 8. Do not build a compliance form

Mr. Pina, 2026-09-14, on a presentation assignment that had grown sentence counters on
every field, six self-report checkboxes and a rehearsal attestation: this is not a fun
assignment.

The rules that came out of it:

- **A progress counter counts work, not compliance.** Filled-in thinking counts. Ticking a
  box that says you rehearsed does not.
- **Do not grade self-reported process.** If the thing you want is that they rehearsed,
  grade the performance, not a checkbox claiming it happened.
- **Sentence minimums are a last resort.** They turn planning into hitting a word count. Use
  them where a one-word answer is genuinely useless, not everywhere prose appears.
- **A field the student cannot fill today is a scheduling defect.** Tag what can be started
  now and what waits, in the document, so an assignment posted early is usable the day it
  is posted rather than an accusation.
- **Validate what costs them points by mistake, and nothing else.** A link that nobody can
  open is worth checking. How they feel about their own preparation is not.

Tone follows `Writing_Voice_Guide.md` and `RULE_no_scripted_lines.md`. Student-facing copy
is scannable rather than readable, and names no weekday.

---

## 9. A live check is a mirror, not a gate

Where a document checks a student's own number against a rule, it reports and stops:
nothing is blocked, nothing is scored on it, and an out-of-range number still saves.
Finding the problem is usually the lesson, so the failing case gets a calm sentence and a
next action rather than a red wall.

Two authoring rules follow:

- **Say what to do, not just what is wrong.** "Over 5.00 in. Bring the blade arms in."
- **Row-by-row checks cannot see a trade-off.** Where two limits spend the same budget,
  every row can pass while the thing still fails. Add one cross-check that speaks only when
  both inputs are readable, and have it report headroom rather than a verdict.
- **An unparseable entry says so**, rather than being silently treated as zero.

---

## 9b. Handing in a file that is not a picture

An `image` block stores whatever it is sent, typed as octet-stream, with the name and
extension intact. That is how the Dogtag takes a `.SLDPRT` and an `.xs`.

- **The document checks the extension**, because nothing else will. Refuse the wrong file
  with a sentence that names the right one, including the likely mix-up (the DXF).
- **The acknowledgement names no field.** `idea:saved` carries only `ok`, `at` and a
  reason, so with two file blocks, queue every write and match acknowledgements in the
  order sent. Allow one upload at a time, and give up on a write unanswered after 45
  seconds so a dropped connection cannot lock every box.
- **The teacher needs a Download button in the document.** A file handed in through an
  HTML block has a block id, so it does not appear under the grading console's files
  handed in, and the frame's photo list has no download link (as read 2026-09-22). The
  stored URL is a path on Classroom's own site, so the document completes it against
  `https://ideabosco.com` and opens it in a new tab, where the teacher's session fetches
  it. **Untested in production as of 2026-09-25.**
- The document caps a file at 50 MB; the server's own cap is higher.

---

## 10. Read-only and restore are half the document

Every document is rendered at least three ways: blank for a new student, seeded with saved
values, and read-only for a closed assignment or a teacher looking at somebody's work.

- `idea:state` seeds every `[data-field]`, the table JSON and any stored image.
- A stored image comes back as a URL, not bytes. Show that it exists; do not expect to
  redraw it from what was pasted.
- `readOnly` disables every `[data-field]` and every control that would mutate one.
- **Anything without a `data-field` stays live in read-only.** That is how a tool section
  (a work order form, a calculator) keeps working after the assignment is closed for
  grading, and it is deliberate.
- Any derived readout must be recomputed inside `applyState`, or a restored page shows
  seeded values with blank verdicts beside them.

---

## 11. Validate before delivering, with both validators

Both run in the container and neither is optional.

**The real importer**, which is what will actually accept or refuse the file:

```
tsx check.ts <file.html>     # calls validateHtmlManifest from
                             # src/lib/classroom/html-assignment/manifest.ts
```

**The authoring validator**, which catches what the importer does not care about but the
programme does:

```
python3 tools/validate-assignment-spec.py <file.html>
```

It checks rubric level counts, whether a criterion can afford its levels, the three-way
points sums, block id uniqueness, the instructions ceiling, weekdays, British spellings and
the Sources block.

Then drive it in Chromium before delivery. The minimum run:

1. Fill every field, paste an image, confirm each value reaches the parent under the field
   name the manifest declares.
2. Re-seed from the saved values and confirm every one comes back, including the table and
   any derived readout.
3. Re-seed read-only and confirm the graded fields are disabled and the tool fields are not.
4. Rasterize at 1600, 1100, 760 and 400 and **look at the images**.
5. Confirm no inner scrollbar at any width, with every collapsible section open.
6. Confirm the console is clean. A page error in this document is a lost answer. Listen
   for window `error` events inside the frame as well as page errors.

**Do not judge the file from the Claude artifact preview.** It refuses to render these
documents and shows "This content is blocked", which is the preview's policy and says
nothing about the file. Measured 2026-09-14.

---

## 12. Delivering

Filename leads with course and day: `IDEA100_D26_Blade-Presentation.html`.

The delivery names the item's posting details, because the document cannot carry them:
title as it appears in IDEA Classroom, total points, grading category, due date, and the
text for the post description. The post description is the only place a clickable link
reliably lives for a student who cannot open one from inside the frame.

Finished documents go to Library C, never to `docs/standards/`.

**Responses to an HTML item are not in the whole-class grading export**, because the item
has no spec (as of 2026-09-22). Anything whose answers Mr. Pina wants to read in bulk, a
survey above all, ships with a read-only, single-statement SQL query over
`classroom_responses` for the item, returning the student and field, never a bare count.

**A theme switch lasts for the visit.** Storage throws, so the choice lives in a variable,
is never sent to Classroom, and the page opens on Standard.

---

## Changelog

- **1.1 (2026-09-25).** Written from the IDEA100 Rotation Survey (2026-09-22) and the
  IDEA100 Dogtag (2026-09-24), both built in the same chat that wrote 1.0. Base: 1.0 as
  delivered by that chat; 1.0 never reached `docs/standards/` or project knowledge, so
  there is no mirrored copy to have forked from. Adds to section 7: clip the probe strips,
  the follow-the-reader element, and no layout changes inside a `ResizeObserver` callback.
  Adds section 9b, handing in a file that is not a picture. Adds to section 11 listening
  for window errors, and to section 12 that HTML item responses are not in the grading
  export and that a theme switch lasts for the visit.

- **1.0 (2026-09-14).** First version. Written from the IDEA100 IDEA-Blade documents built
  2026-09-11 to 2026-09-14 (Blade CAD 01, Blade CAD 02, Final Presentation) and from
  `IDEA_HTML_ASSIGNMENT_SPEC.md` 1.1 at `origin/main`, to answer a need the SPEC does not:
  the SPEC records what the subsystem is, and an author writing an assignment needs what to
  do and in what order. Carries five things measured during those builds that no standard
  held: the importer refuses a zero-point document so a guide folds into its assignment
  rather than being posted beside it; `mailto:` opens `about:blank` on a managed school
  Chrome and the Gmail compose URL is the reliable control; `noopener` in a `window.open`
  feature string returns `null` and reads exactly like a blocked popup; the frame's 1px
  border means a document reporting its exact height draws a 2px inner scrollbar; and
  `position: sticky` cannot work in a frame as tall as its document. Also records Mr.
  Pina's two authoring rulings of 2026-09-14: fluid width at both ends is required rather
  than preferred, and an assignment is not a compliance form.
