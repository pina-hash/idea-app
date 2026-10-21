# IDEA HTML Assignment Authoring Standard
**Version 1.33 - 2026-10-20**

For a chat that is WRITING an assignment, not building the subsystem that serves it.

`IDEA_HTML_ASSIGNMENT_SPEC.md` owns what the subsystem is and how it behaves. This file
owns what an author has to do, in the order they have to do it, and every rule in it was
paid for by a document that shipped or nearly shipped wrong. Read the SPEC when you need
the contract. Read this when you need to write one.

This file has exactly one home and it does not move:
`docs/standards/IDEA_HTML_ASSIGNMENT_AUTHORING.md` in `pina-hash/idea-app`, which is its
freshness authority, with the working copy in project knowledge and a row in `REGISTER.md`.
Fetch the mirror before editing it and again immediately before delivering it.

**Design direction lives in `IDEA_HTML_DESIGN_DIRECTIONS.md`**: the rules every HTML file
Mr. Pina receives must meet, what each kind of HTML (worksheet, walkthrough, reference,
tool, dashboard, deck, print, game) should look and behave like, and the persona audit run
before delivery. This file owns the mechanics of a ported assignment; that one owns how it
should read and feel. An assignment meets both.

**A chat with no repository gets `IDEA_HTML_ASSIGNMENT_BRIEF.md`**: one self-contained file
condensed from this one, the SPEC, the design directions and the template, with a tested
bridge client and reporters to copy. A rule changed here changes there in the same turn.

**THIS FILE UPDATES ITSELF, AND THAT IS MR. PINA'S STANDING INSTRUCTION OF 2026-09-30.**
Any chat or session that builds or revises an HTML assignment adds every optimization, fix
or correction it makes to an HTML file to this document in the same turn, unprompted:
a rule in the section it belongs to, or a dated section like 13 and 14, plus a changelog
line and a `REGISTER.md` row. It lands in the mirror and in project knowledge together.
Nobody asks for it. A lesson that lives only in one assignment's build script is lost to
the next assignment, which is how the same critique came back across several chats.

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

**Give each block a `prompt`: the question as a grader reads it.** A grader reading
answers outside the document (the Answers view, Answers by question, the Answers CSV) sees
the block's `prompt` where it has one and its `field` where it does not, so a manifest
without prompts heads a column `Work: reflection` when the student was asked "What did you
model today, and what took the longest?". Write the question as the student saw it, short
enough to head a column; only the first 500 characters are shown. `prompt` changes nothing
inside the document and nothing about saving, so adding one to a live worksheet is a
re-upload with every block id unchanged. `IDEA_HTML_ASSIGNMENT_SPEC.md` section 4.8 owns
the three display keys.

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
| Web fonts | A font HOST is refused. A font the document carries as a `data:` URI renders since ledger 0351 (`font-src data:`). Use the site's faces: Rajdhani 500/600/700 for text and Share Tech Mono 400 for labels, from `@fontsource`, about 80 KB as woff2. Measure a font claim by rendered width against a fallback, never `document.fonts.check()`. |
| `window.print()` | Returns silently and does nothing. A Print button is inert. |
| Downloads | **Fire** since ledger 0368 (`allow-downloads`, SPEC 5.7), a link to the stored file, a `data:` or `blob:` link, and a new-tab open alike. A download is still never a save path: answers save through the bridge. |
| File upload by the document | Impossible. Image bytes go up as `idea:image` and the parent uploads them. |
| Submit | Not the document's. Hand-in is a parent control in parent chrome. |
| Popups | **Allowed** since ledger 0153. `allow-popups allow-popups-to-escape-sandbox` are both granted and both required. |
| A stored picture | The document cannot draw it (the URL is the portal's). Hold a box open and report it with `idea:image-box`; the portal draws it there (section 10b). |

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

**Probes, not one observer.** A single `IntersectionObserver` on a tall element stops
firing once its intersection ratio stops changing, so a pinned bar or a following drawing
freezes mid-scroll. Use an array of 1px probes down the element and take the topmost
visible probe as the visible top of the document; probes report against the top-level
viewport even from inside the cross-origin frame. Measured 2026-09-22 on the IDEA209H
Shop Trophy inspection.

**Clip the probe strips to the document.** Strips are rebuilt only when the height moves
by more than one strip, so after a small shrink the last strip hangs below the document
and draws an inner scrollbar. Set the probe container's height to the document height on
every resize, with `overflow: hidden`, and size the count as
`floor((height - 2) / STEP) + 1` so the last probe never sits past the end. Measured
2026-09-22 on the IDEA100 Rotation Survey and again on the IDEA209H inspection.

**An element that follows the reader** (the Dogtag hand-in card) sits in a wrapper that
stretches to its grid row, and is moved with `translateY`, clamped between 0 and the
wrapper's height minus its own. Only in the layout where it has a column of its own:
stacked on a phone, it stays in normal flow. **Never report a picture box (section 10b)
inside an element that follows the reader**: it moves on every parent scroll, so the
portal's picture would lag behind it unless the document re-sends the box on every move.

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
- **Ask for one photo, and allow more.** Students put two sketches on one page as often as
  not. One required image block with one or two optional slots filled in order beats one
  upload per item, which students find annoying and which fails the student whose page
  does not match the boxes. Mark each extra photo slot `"optional": true`, or it counts
  toward completion like the first. Mr. Pina, 2026-09-27, on IDEA100 Hook 01.
- **No single path to completion.** Every answer is free text or starts from an optional
  starter; a card that starts an answer never overwrites one the student has written. The
  progress bar counts what is there and blocks nothing. Mr. Pina asked for exactly this on
  2026-09-27: the assignment must not refuse full completion unless it is done one way.
- **Explanation text is the minimum that states the concept, and freshmen still will not
  read it.** Put definitions in hover tips, a `data-tip` attribute drawn by a CSS `::after`
  (pure CSS, so it works in the sandbox with no script), and plan for the class to read the
  longer parts together. Mr. Pina, 2026-09-27.
- **Dead space is a defect, and it is measured.** He asked for a space-efficiency pass twice
  on one document. What worked on Hook 01: cards with the image beside the text rather than
  above it, a lone short card folded into a one-line banner, the answer box placed in the
  grid's empty cell, notes moved into the shorter of two sibling cards, and a photo upload
  that sits beside its rows rather than above them. Measure the page height at 1000 px
  before and after; Hook 01 went from 5,190 px to 4,175 px with no content removed.
- **A pinned progress bar counts work and names the next item.** Its segments can be
  buttons that scroll to their field: `scrollIntoView` called inside the frame scrolls the
  parent page, measured 2026-09-27 in container Chromium with the frame cross-origin.

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
- **Success is read off `idea:state`, never off an acknowledgement.** `idea:saved` carries
  only `ok`, `at` and a reason, and text saves are debounced and coalesced (800 ms in
  `answers.ts`), so acknowledgements cannot be paired with writes in order: matching them
  in order, which 1.3 prescribed, credits a file with a text save's ack. The parent adds a
  field to `images` only once its upload has landed and re-posts state, so a file is
  handed in when its field appears there. A failure arriving while a file is pending is
  shown on that file. Allow one upload at a time, and give up on a write unanswered after
  45 seconds so a dropped connection cannot lock every box.
- **Replace means remove first.** A second `idea:image` on a field that already holds a
  file is not specified to replace it. Offer Remove, which sends `idea:image-remove`, and
  only then a new pick.
- **A Download button in the document works since ledger 0368.** It did nothing before:
  the sandbox refused every download the document started, including the new tab it
  opened (Mr. Pina's report of 2026-10-06), and `allow-downloads` fixed every deployed
  document's button with no re-upload. The stored URL is a path on Classroom's own site, so
  the document completes it against `https://ideabosco.com` and opens it in a new tab,
  where the teacher's session fetches it. **The portal now offers the file too, so the
  button is a convenience rather than the only way**: a stored file has a worded Download
  in its box (section 10b) or on its row in the list under the frame, in the Lightbox, and
  in the grading console's Answers view. A file whose name is not a picture is shown as a
  file with a Download, never as a broken image.
- The document caps a file at 50 MB; the server's own cap is higher.

---

## 9c. A presentation link hand-in

When students hand in a link to something they will present (Slides, Canva, a video),
declare it, so the parent can check it for the student and open it for the class. One
`text` block per link, with `link: "presentation"` and a `prompt`:

```json
{ "id": "pres-link", "field": "pres-link", "type": "text", "link": "presentation", "prompt": "Link to your deck" }
```

What the parent then does, with nothing in the document to write:

- **The student is told whether it is a link**, under the progress rail: where it goes
  ("Google Slides", "Canva", or the site's own name) and a Test it key, or "This does not
  look like a link yet. Paste the share link; it starts with https://." The check never
  blocks saving and changes nothing about progress.
- **A grader gets an Open key beside it**, in the work head and in every answer list. A
  field holding words gets "Not a working link" with what the student typed, and no key.
- **Present links** in the grading console's header opens a full-screen list, one student
  at a time with Open, Previous and Next, for the class to present from the room's screen.
  When any block declares a link, only declared links are listed; otherwise every link
  found in the answers is. It says how many have no link that opens and never shows an
  address.

Rules that follow from it:

- **`link` only works on a `text` block.** On any other type both validators warn and the
  key is ignored. A field pasted without `https://` still opens; a field of words does not.
- **Keep the box a plain text input.** Do not add `type="url"` validation, a pattern, or a
  Test button of your own inside the document: the parent's check is the one the grader
  sees, and a second one that disagrees with it is a student told two different things.
- **Ask for a share link that anyone at the school can open**, in the prompt or the
  instruction beside it. The Open key opens whatever was pasted, in the grader's own
  browser; a link only its owner can open is the most common way presenting stalls.

---

## 10. Read-only and restore are half the document

Every document is rendered at least three ways: blank for a new student, seeded with saved
values, and read-only for a closed assignment or a teacher looking at somebody's work.

- `idea:state` seeds every `[data-field]`, the table JSON and any stored image.
- A stored image comes back as a URL, not bytes. Show that it exists ("Saved: <name>")
  inside the box you report for it (section 10b), where the portal draws the stored copy
  over your text; do not expect to redraw it from what was pasted.
- `readOnly` disables every `[data-field]` and every control that would mutate one.
- **Anything without a `data-field` stays live in read-only.** That is how a tool section
  (a work order form, a calculator) keeps working after the assignment is closed for
  grading, and it is deliberate.
- Any derived readout must be recomputed inside `applyState`, or a restored page shows
  seeded values with blank verdicts beside them.

**`idea:state` is not only the first seed. The parent re-posts it after every
`idea:change`, and it can arrive late.** `HtmlAssignmentFrame.svelte` re-posts state from
an effect on the saved values, so every save comes back to the document as an echo, and
an echo can carry a value from before the student's last keystroke. Values can also arrive
empty and then filled, so "seed once" is not a fix either. Three rules:

- **Never trim or normalize a value you send.** A trimmed value echoes back and overwrites
  the field mid-word. On 2026-09-23 students typing "Char on two slot edges" saved
  "Charontwoslotedges" in a live IDEA209H inspection, and the same defect was found in two
  more posted documents that day. Stored text that already lost its spaces cannot be
  repaired.
- **A field the document has written is owned by the document.** Keep a dirty set keyed on
  field name; `applyState` skips any field in it, and skips a field whose value already
  matches. The same applies to a table block's JSON and to image captions.
- **Trim only when reading a value to judge it**, never when storing it.
- **Image slots belong in the dirty set too.** An echo posted before the parent registers a
  new image would otherwise clear the photo the student just attached.
- **An echo must not reset the document's own chrome.** A status pill that `applyState` sets
  to "Autosave on" is reset by every echo, so "Saved 2:37" never survives to be read. Change
  it only when `readOnly` flips or on the first seed. Found on IDEA100 Hook 01, 2026-09-27.
- **A hidden store is caught by the generic restore loop.** A table's JSON store is itself a
  `[data-field]` element. A loop restoring every `textarea[data-field]` writes the store
  first, the table restore then compares against the store, finds nothing to do, and leaves
  every cell blank. Exclude hidden stores from the generic loop (`:not([hidden])`). The
  reload check found this on Hook 01; the echo check could not, because the table's cells
  were already dirty there.

---

## 10b. Showing a stored picture in its place (ledger 0368)

Mr. Pina, 2026-10-06: "I need for images to show within html assignments not under them."
The document cannot draw a stored picture: the portal hands back a link the sandbox may
not load, and bytes never come back down (SPEC 6.5). So the document holds a BOX open
where the picture belongs and tells the portal where it is, and the portal draws the
stored picture over it, in its own chrome, with Enlarge into the classroom Lightbox and a
Download. A file that is not a picture by its name is drawn there as a file with a
Download. **A document that reports no box keeps every picture in the list under the
frame**, which is where all of them are until a document is re-uploaded with this reporter.
Re-uploading changes no block id, so every stored answer still renders.

Mark each picture area with its field, and report every box:

```js
// One box per image field: <div class="photo-box" data-image-box="photo">Saved: ...</div>
function sendImageBoxes() {
  document.querySelectorAll('[data-image-box]').forEach(function (el) {
    var r = el.getBoundingClientRect();
    var showing = r.width > 0 && r.height > 0 && !document.body.classList.contains('modal-open');
    parent.postMessage({
      type: 'idea:image-box',
      field: el.getAttribute('data-image-box'),
      rect: showing ? { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY),
                        w: Math.round(r.width), h: Math.round(r.height) } : null,
      clipTop: 0
    }, '*');
  });
}
var imageBoxTimer = 0;
function queueImageBoxes() { clearTimeout(imageBoxTimer); imageBoxTimer = setTimeout(sendImageBoxes, 100); }
addEventListener('resize', queueImageBoxes);
```

- **Send after every `idea:state`** (the seed, every echo, read-only), after a fold or a
  stage change, and on a resize through the timeout above. Only the document can see its
  own layout move; the portal never measures inside the frame. Never send from inside a
  `ResizeObserver` callback (section 7).
- **`rect: null` while the box is hidden** (a closed fold, another stage) **or while the
  document's own modal is over it**. The portal then lists the picture under the frame
  again, so it is never lost.
- **`clipTop` is how many pixels of the box's top a following header covers**, so the
  portal hides that strip rather than painting over the header.
- **Keep Choose, Remove and caption controls OUTSIDE the box.** The portal's picture is
  opaque and takes every click in the rectangle.
- **Size the box for a picture and for a file**: at least 160px wide and 120px tall, so a
  file's kind, its name and a 44px Download fit. Give it an `aspect-ratio`, so it holds its
  shape at every width.
- **Keep your own fallback text inside the box** ("No photo yet", "Saved: <name>"). The
  portal's picture covers it; a portal that predates ledger 0368 does not, and the student
  still sees the right words. The portal answers with `idea:image-box-state` (`field`,
  `shown`); listening is optional and nothing may wait on it.
- **Never report a box inside an element that follows the reader** (section 7).
- **Report boxes in the read-only grading view too.** That is where a teacher reads the
  hand-in, and the reporter sends nothing a student typed.
- **Retrofitting a document already posted: one reporter, keyed on the manifest
  (ledger 0369).** Read the image fields out of `#idea-manifest`, find each box by
  `[data-image-box="<field>"]` (set it where the document paints the box), send `null` for
  a field with no box on screen, and queue a send from a `MutationObserver` on the body as
  well as on `idea:state` and resize: a fold, a stepper moving to the next step, and the
  following bar moving all change the DOM, so nothing has to remember to call it. Send only
  what changed. A file hand-in whose box holds its own Remove or Download keeps no box and
  stays in the list under the frame, because the portal's drawing would cover those keys.

---

## 10c. Reporting where each answer sits, so feedback can be pinned (0238)

Ledger 0381 built progressive feedback (decision 60): an instructor leaves notes on a
student's in-progress worksheet, on the whole worksheet or on one block, optionally with a
drawing over one of the student's stored pictures; the student sees them live, replies and
presses Fixed it; both sides see when the other has seen a note; and the instructor manages
every note from one inbox page. **All of the conversation (the reply, Fixed it, Resolve) is
parent chrome, never inside the document**, for the reason Submit is (section 4): a button
inside the document is a handler the document wrote. **The document's only part is telling
the portal where each answer sits.**

- **The portal names the fields with a note.** `{ type: 'idea:feedback', fields: [...] }` is
  ADVISORY: the sorted, de-duplicated field names with an open note, sent once the document
  is ready (after the first `idea:state`) and again whenever the set changes. It carries no
  word of any note, no author and no status. A document may report boxes only for those
  fields and may mark them itself; it must never wait on it, because a page with no
  feedback, and a portal that predates 0238, sends nothing.
- **The document answers with `idea:field-box`**:
  `{ type: 'idea:field-box', field, rect: { x, y, w, h } | null, clipTop? }`, exactly the
  `idea:image-box` shape and rules (section 10b, `hxBoxOf`): four finite numbers in the
  document's own CSS pixels from its top-left, scroll included; `x` and `y` at least 0, `w`
  and `h` above 0, `x + w` at most 8000, `y + h` at most the 40,000px height ceiling;
  `clipTop` absent (0), non-negative, capped at `h`. The field must be one the manifest
  declares (it goes through the parent's own field-to-block map); a block id or an
  undeclared field is dropped. `rect: null` withdraws the box.
- **What the portal draws**: a worded 44px pin ("Note", "2 notes", "New note") beside the
  box's top-right corner, kept inside the frame, for a field with an open note. Pressing it
  opens that note in the list beside the worksheet. A field whose notes are all resolved has
  no pin. A picture field may be reported with its picture box element, and with no field
  box at all the portal falls back to the box reported with `idea:image-box`.
- **Re-send after every `idea:state`, after a resize** (debounced with a timeout, never from
  inside a `ResizeObserver` callback, section 7) **and after anything that moves a box** (a
  fold opening, a stage change). Only the document can see its own layout move.
- **Drawings need nothing new.** The teacher's drawing is laid by the parent over the
  student's stored picture where the portal draws it: over the box reported with
  `idea:image-box`, or in the list under the frame. The author's only job there is 10b.
- **Put each field's `data-field` on the element a pin should sit beside.** The reporter
  looks for `[data-image-box="<field>"]` first and `[data-field="<field>"]` second, so a
  radio group's `data-field` goes on its `<fieldset>` and a table's on its visible wrapper.
  A hidden store (section 10's table JSON) has no box, so its field gets no pin and its
  notes stay in the list.
- **Report in the read-only grading view too**: that is where a teacher writes the note, and
  the reporter sends nothing a student typed.
- **A document that predates this works unchanged**: every note is still in the list beside
  the worksheet. Retrofitting is the reporter plus a re-upload with every block id unchanged.

The reference reporter is `fieldBoxReporter()` in `src/routes/hx/_documents.ts`. Copy it
verbatim; it relies on the bridge client's `send` (`function send(msg) {
parent.postMessage(msg, '*'); }`):

```js
var NOTE_FIELDS = [];
var REPORTED = {};
function fieldBoxOf(field) {
	var el = document.querySelector('[data-image-box="' + CSS.escape(field) + '"]') ||
		document.querySelector('[data-field="' + CSS.escape(field) + '"]');
	if (!el) return null;
	var r = el.getBoundingClientRect();
	if (!(r.width > 0 && r.height > 0)) return null;
	return { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) };
}
function reportFieldBoxes() {
	NOTE_FIELDS.forEach(function (field) {
		REPORTED[field] = true;
		send({ type: 'idea:field-box', field: field, rect: fieldBoxOf(field) });
	});
	Object.keys(REPORTED).forEach(function (field) {
		if (NOTE_FIELDS.indexOf(field) >= 0) return;
		delete REPORTED[field];
		send({ type: 'idea:field-box', field: field, rect: null });
	});
}
addEventListener('message', function (e) {
	var d = e.data;
	if (!d || typeof d !== 'object') return;
	if (d.type === 'idea:feedback' && Array.isArray(d.fields)) {
		NOTE_FIELDS = d.fields.filter(function (f) { return typeof f === 'string'; });
		reportFieldBoxes();
	}
	if (d.type === 'idea:state') setTimeout(reportFieldBoxes, 0);
});
var fieldBoxTimer = 0;
addEventListener('resize', function () {
	clearTimeout(fieldBoxTimer);
	fieldBoxTimer = setTimeout(reportFieldBoxes, 100);
});
```

`IDEA_HTML_ASSIGNMENT_BRIEF.md` section 6 carries it beside a bridge client that also calls
it after every fold, tested together in Chromium against the real gate.

---

## 10d. A thumbnail: how the post looks in a class list (0268)

Ledger 0396 gave every post a thumbnail slot on the class page and the home page's class
cards (report a6a037f3). A document may declare its own, which the post wears until a
teacher sets one by hand on the post's form; a re-upload never replaces a hand-set one.
`IDEA_HTML_ASSIGNMENT_SPEC.md` sections 4.10 and 6.8 are the contract; this is what an author
does.

- **Declare it in the manifest, at the top level**, beside `modules`:
  `"thumbnail": { "kind": "html", "template": "idea-thumbnail" }` for a live thumbnail, or
  `"thumbnail": { "kind": "image", "src": "attachment:cover.png" }` for a picture attached
  to the post (a `data:` PNG, JPEG, GIF or WebP under 400,000 characters also works; an SVG
  and any `https:` address never do). Every problem with the key is a warning saying the
  post shows the generated look instead, and nothing about it can stop an upload.
- **The template's id must be the one the manifest names.** A manifest naming a template the
  document does not carry (a typo between the two is the usual way) gets no live thumbnail:
  the post shows the generated look on every list, the import warns, and the post's form
  says the template is missing and which one to add.
- **A live thumbnail is a `<template id="idea-thumbnail">` in the same file.** Its contents
  are served alone, in a fixed shell with a transparent background, in the post's slot under
  the same sandbox as the worksheet: write it as a small self-contained page (a `<style>`,
  the markup, a `<script>` if it needs one). Nothing in it can see the worksheet, its fields
  or its answers. It is inert inside the worksheet itself, because a template is.
- **Fill the box, whatever its shape.** The slot is one of three shapes, chosen by each
  reader: Tile (a square about 48px, 36px in a phone's narrow list), Wide (16:9, the
  row's width) and Banner (the row's width, about 56px tall). `<html>` carries
  `data-idea-shape`, and `--idea-thumb-w` and `--idea-thumb-h` hold the size in px;
  position things with `position: absolute; inset: 0` and sizes in `%`, and say anything
  in words only where there is room (Wide and Banner).
- **Follow the site's light or dark look**: `data-idea-scheme` is `light` or `dark` and
  `data-idea-theme` names the theme (`idea`, `matrix`, `space-white`). Key colours on them.
- **Animate freely, and let the portal stop it.** CSS animations and
  `requestAnimationFrame` loops stop on their own while the thumbnail is off screen, the tab
  is hidden, the page is scrolling, or the reader asks for reduced motion
  (`data-idea-paused`, `data-idea-motion`). Do not add your own pause. Under reduced motion
  a CSS animation rests on its first frame, and a `requestAnimationFrame` loop runs for two
  display frames after the thumbnail loads and again after every resize, shape change or
  theme change, then waits: so a canvas that sizes itself to the slot (setting
  `canvas.width` clears it) draws a still picture of itself at the right size and in the
  right colours. Draw from your loop, not once at load, and redraw on `idea:thumbnail`.
- **Hover works without code**: `--idea-pointer-x` and `--idea-pointer-y` (0 to 1) and
  `data-idea-pointer` follow the pointer over the slot, and `idea:thumbnail` and
  `idea:pointer` events fire on `window` for script that wants them.
- **A click opens the post.** Make it interactive (`"interactive": true`) only when the
  thumbnail has its own controls, a toy a student can press: then its buttons, links and
  inputs keep their clicks and a click anywhere else still opens the post. Keep interactive
  controls usable at 36px or mark them for Wide and Banner only
  (`:root[data-idea-shape="tile"] button { display: none; }`), and in a Tile draw what the
  controls change instead, so a press there opens the post.

A working thumbnail to copy (it is the one in `src/lib/legacy/assignments/_TEMPLATE.html`):

```html
<template id="idea-thumbnail">
<style>
  :root { --t-a: #1c4a2a; --t-b: #0b1d12; --t-ink: #9ff0a8; }
  :root[data-idea-scheme="light"] { --t-a: #eef8f0; --t-b: #cfe9d6; --t-ink: #1d6b2c; }
  .t { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 6%;
       background: radial-gradient(circle at calc(var(--idea-pointer-x, .5) * 100%) calc(var(--idea-pointer-y, .5) * 100%), var(--t-a), var(--t-b) 75%);
       color: var(--t-ink); font: 700 15px/1.2 system-ui, sans-serif; overflow: hidden; }
  .t svg { height: 70%; aspect-ratio: 1; animation: t-spin 6s linear infinite; }
  .t .w { display: none; }
  :root[data-idea-shape="wide"] .t .w, :root[data-idea-shape="banner"] .t .w { display: block; }
  :root[data-idea-pointer] .t svg { animation-duration: 2s; }
  @keyframes t-spin { to { transform: rotate(360deg); } }
</style>
<div class="t">
  <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" stroke-width="14" stroke-dasharray="11 8.9"/><circle cx="50" cy="50" r="9" fill="currentColor"/></svg>
  <span class="w">Gear ratios</span>
</div>
</template>
```

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
7. **Run the harness as a real parent does: echo `idea:state` back on every
   `idea:change`, after a short delay (about 40 ms), and type multi-word phrases with
   spaces into every text box, table cell and caption.** A harness that seeds once and
   never echoes passes a document that eats every space a student types. Measured
   2026-09-23. **Make one echo in three stale**, re-posting the values as they stood before
   the change, because that is the echo that overwrites a field mid-word. Hook 01's run on
   2026-09-27: 275 echoes, every multi-word value came back exactly as typed.

**Do not judge the file from the Claude artifact preview.** It refuses to render these
documents and shows "This content is blocked", which is the preview's policy and says
nothing about the file. Measured 2026-09-14.

---

## 11b. Media and the 2 MB cap

The importer refuses a document over 2 MB (`HTML_DOCUMENT_MAX_BYTES` in
`src/lib/classroom/html-assignment/store.ts`), and the CSP allows images only as `data:`
and `blob:`. Everything visual is inlined, so the cap is a media budget.

- **Crop a drawing to its frame and keep native resolution as PNG.** A mechanical drawing
  exported at 5760x3240 has four or five colors and compresses to roughly 65 to 100 KB as
  a cropped PNG. Converting to WebP or resizing it made it larger or unreadable, measured
  2026-09-21. A zoom and pan viewer then shows real detail.
- **A video plays in the post, drawn by the parent (ledger 0349).** A player framed inside
  the document draws nothing, so the document holds a 16:9 box open and sends `idea:video`
  with the YouTube id and the box's rectangle; the portal draws the player over it. Keep a
  fallback: if no `idea:video-state` answers within 1.5 s, offer the video on YouTube in a
  new tab. The card carries its thumbnail as a `data:` URI (about 3 KB at 176x99), its
  length, and sits beside the step it teaches, not only in a list at the top. Prefer the
  maker's official video; say so when none exists for a step rather than filling the gap
  with a stranger's.
- **Do not trust a glyph to render.** A `▶` rendered as a missing-glyph box in the frame's
  font stack; draw icons as inline SVG.
- **Set the diameter sign in the sans face.** In the monospace stack `Ø` reads as a zero, so
  a callout reading "Ø1.000" read as "01.000" (Mr. Pina's screenshot, 2026-09-27). A
  dimensioned drawing is generated from geometry code with every rule value measured on the
  generated shape (Hook 01 used shapely and measured its 0.500 in opening), never drawn by
  hand.
- **3D renders for a feature explainer can be made in the container.** three.js from npm
  runs in the container Chromium with `--use-gl=angle --use-angle=swiftshader
  --enable-unsafe-swiftshader`. Build each shape as extruded layers, screenshot with a
  transparent background, crop, and inline as JPEG (Hook 01: seven renders, 71 KB in
  all). Two traps, both paid for on 2026-09-27: layers that share a side wall z-fight into
  stripes, so each thinner layer gives up the area a thicker one covers, less a 0.01 in
  overlap; and a cut-open view earns its space only where the section shows something the
  outside does not, which it did for an I-beam rim and did not for four other features.
- **A Google Slides preview is slide one only.** The Drive connector's export as
  `image/jpeg` returns the first slide, and export as PDF refused a 168 MB deck with "File
  too large for export". Measured 2026-09-27. Label the thumbnail as the first slide.

---

## 12. Delivering

Filename leads with course and day: `IDEA100_D26_Blade-Presentation.html`.

The delivery names the item's posting details, because the document cannot carry them:
title as it appears in IDEA Classroom, total points, grading category, due date, and the
text for the post description. The post description is the only place a clickable link
reliably lives for a student who cannot open one from inside the frame.

Finished documents go to Library C, never to `docs/standards/`.

**Answers are read in bulk in the grading console, and no SQL query ships with a
document any more.** That rule was written when an HTML item's answers were in no export
(2026-09-22); the graded-work export has carried them since ledger 0298, and ledger 0360
added three ways to read them without opening each student's worksheet: the work column's
**Answers** view (one student's answers as a list, with no document to load), **Answers by
question** in the header (one question, every student's answer under it), and the
**Answers CSV** beside it (one row per student, one column per question, headed with the
block's `prompt`, which is why section 2 asks for one). **Present links** reads a declared
link field (section 9c). A survey therefore needs a `prompt` on every block, not a query.

**The look follows the site, and a student may flip it for the visit.** Mr. Pina's ruling
of 2026-09-29 supersedes 1.4's "one look": the plate look from the site (raised means
pressable, inset means not, rounded corners, no grid), IDEA green as the one accent, no
orange, and light or dark to match the site. The parent sends `idea:theme` (`light` for
Space White, `dark` otherwise, ledger 0350) after the first state and on every change; the
document follows it, and a Light/Dark key overrides it for the visit only (storage throws,
so it lives in a variable and is never sent to Classroom). Define every color twice, in a
dark block and a light block, with no length in either, and measure contrast in both.

---

## 13. Rules paid for by Hook 02 (2026-09-29)

A multi-stage post, audited by five student personas before class, found these. Each is now
a rule for any assignment of that shape.

- **Mark an optional record block `"optional": true` in its module; the header is for
  identity.** Without the key every block in a scored module counts toward completion, so
  an optional second photo left a one-photo student at 83 percent forever (Hook 01). An
  optional block is judged and never counted: it shows whether it is met and never holds
  back the bar or the completion check (`IDEA_HTML_ASSIGNMENT_SPEC.md` section 4.9). Both
  validators warn on a module with two or more photo blocks and none optional, on a module
  whose every block is optional (it can never move the bar), and on `optional` in the
  header (it changes nothing there); a value that is not `true` or `false` is refused.
- **A post with stages gives each stage its own hue and its own Collapse.** A long page of
  identical cards reads as mundane and a student loses their place. Tint the stage band,
  its step numbers and its section rules (blue, teal, violet; never orange), keep green for
  done and progress, and measure every hue in both themes. The Collapse control is a real
  button with `aria-expanded`, and any jump into a collapsed stage (progress bar, stage
  card, link) opens it first.
- **Read aloud reads the whole stage a student can see**, in order: headings, steps,
  questions and notes, skipping video cards, links and the student's own typing. A button
  that read only the intro spoke 46 of 1,833 words of the printing stage.
- **A failed save is said in words, next to the work.** The status pill alone clipped off
  screen at half-screen widths and shrank to a dot on a phone. Show "Not saved" as a banner
  under the bar until the next save lands, and let the bar's track shrink (`minmax(0, 1fr)`)
  so its right end never leaves the viewport.
- **A pasted picture goes to the box the student means.** Honor the last box they touched
  only while it is on screen; clear it when they focus any other field; otherwise take the
  first empty box on screen. A paste once landed three screens away, in the wrong stage.
- **A box inside a closed `<details>` is never a paste target.** Chromium gives content in
  a closed `<details>` a layout parent, so an `offsetParent` test calls it visible, and a
  plate screenshot landed in Hook 03's optional, folded V3 stress box. Filter
  `closest('details:not([open])')` out of the paste-target list as well as `hidden`.
- **A later version's file card reuses the hand-in code, keyed on the slot.** Derive the
  version and piece from the slot name (`v3A` is V3, piece A) rather than adding a second
  name checker, and name the previous version back to the student ("That is V2") when it
  lands in the new slot.
- **The document's sentence counter is the portal's.** Port `countSentences` from
  `src/lib/classroom/assignment-spec.ts` exactly (abbreviations, decimals, ellipses, split
  on `.!?`). A second counter disagreed on "Se rompe allí." and on any answer without a
  final period, so the page said done where the portal said not, or the reverse.
- **Progress refuses the obvious junk it can check without judging.** A number must be a
  positive number, a file must carry the right name, a weight above the cap or a half-scale
  weight heavier than the full size says so in words. The bar still never gates the rubric;
  it just stops certifying nonsense.
- **When the steps differ by machine, ask which one once, then show only that one's
  steps.** Before a choice, show both, with swapped words ("card or drive") where a sentence
  names one. A step that does not apply to the chosen machine stays numbered and says
  "nothing to do here", so the numbers never skip.
- **A walkthrough names who to ask and what every term means the first time it appears**
  (Print Tech, print board, score sheet). A literal first-timer stops at the first noun
  nobody defined. Where the answer is a place only Mr. Pina knows (where the drives live),
  ask him before delivery; do not invent one.
- **Run the persona audit before delivery** (`IDEA_HTML_DESIGN_DIRECTIONS.md` section 4).
  It found four blockers and thirteen wrong instructions in a document that passed both
  validators and the harness drive.

## 14. Rules paid for by Hook 02's first morning (2026-09-30)

Mr. Pina read Hook 02 an hour before class and gave these. Each is now a rule.

- **Writing in a rotation class is short, and the page says how short.** Students do not
  want to write, and IDEA100 is meant to be fun. Every required answer is one sentence, its
  box shows a sentence starter as the placeholder ("It broke at the ..."), and any either/or
  judgment is a pick rather than a sentence (snapped or pulled open; right, half right or
  wrong). State the whole budget near the top: "five sentences in the whole thing, one at a
  time. Everything else is a click, a number, or a photo." Hook 02 went from eight required
  sentences to five with no point moved.
- **Equipment facts come from Mr. Pina, not from the vendor's defaults.** Hook 02 shipped
  telling every student to slice for a 0.4 mm nozzle, Bambu's default, when every X1 Carbon
  in the lab has a 0.6 and an H2D side may be 0.6, 0.6 High Flow or 0.4. The same draft
  said the SD cards and drives are handed out, when they live in the printers. It also told students to export an STL; IDEA exports **STEP, never STL** (`STEP AP214 (*.step;*.stp)` in SolidWorks Save As), and Bambu Studio imports it with its units intact. Before
  delivering a walkthrough of lab equipment, list every lab-specific fact it asserts
  (nozzle, profile, where media and tools live, which setting is manual) and confirm each
  with him.
- **A lookup that depends on what someone tells the student is a table, not a paragraph.**
  "Print Tech says 0.6 High Flow" maps to a printer profile and a flow setting in one row.
- **Table cells at phone width wrap with `overflow-wrap: break-word`, never `anywhere`.**
  `anywhere` lowers a column's minimum width, so at 375 px "Standard" rendered as
  "Standar" over "d". `break-word` breaks only a word that cannot fit on its own line.
- **Long is acceptable when every item is needed.** Mr. Pina found Hook 02 text heavy and
  kept it, because a student needs every fact in it. Make a long walkthrough lighter by
  folding stages, showing only the chosen machine's steps, and putting the video beside
  the step it shows. Never by cutting a fact a student needs.
- **No "I did it" checkboxes. Ask for evidence the page can check instead.** Mr. Pina has
  never seen a student read a checkbox before clicking it, and students hunt them down only
  at hand-in. A checkbox is a promise, not a demonstration. Replace each with something the
  student must produce: a pick of what they actually set, with the page flagging a wrong
  pick (Generic ABS, the 0.6 nozzle on an X1 Carbon); a value only the real act gives (the
  printer name off the print board, the load off the score sheet); or nothing at all, where
  a screenshot or a number already proves it, or where the item is a rule rather than a
  step. Keep a checkbox only for an act with nothing to show (pieces kept in the bin). This
  adds no grading. Hook 02 went from seven checkboxes to one.
- **The first week of use is part of the build.** Expect small adjustments as students use
  a new assignment, make them the day they are reported, and add each one here.

## 15. Rules paid for by Hook 02's visual overhaul (2026-09-30)

Mr. Pina found Hook 02 word heavy and "a mess" beside Hook 01, which students liked for
its pictures and diagrams. The overhaul kept every fact and every block id and changed how
the page reads. Each change is now a rule.

- **One picture per step.** Every step of a procedure carries an illustration of what the
  student will see or do: the window, the menu, the printer, the part. Draw it as inline
  SVG that reads the theme's tokens, so it follows light and dark, and draw the real part
  from the course's own geometry (Hook 02 defines the hook once as a `<symbol>` and places
  it with `<use>` in fourteen figures). A screenshot of software goes stale at the next
  update; a drawing of the idea does not.
- **A long procedure is a stepper, not a scroll.** One step on screen at a time, a
  numbered track grouped by phase (A Into Bambu Studio, B Weigh it, ...), Previous and a
  Next that names the next step. This is the SolidWorks Day pattern, and it is the one that
  worked in class. Every step stays in the DOM so print shows all of them, a progress-bar
  jump opens the step holding its target, and a playing video stops when the step changes.
  Hook 02 went from 9,176 px tall at 1440 to about 6,100 with nothing removed.
- **One accent color.** Per-stage hues (blue, cyan, purple) read as noise and fight the
  room's identity. Stages differ by number and a small mark, never by hue.
- **Graded inputs sit in one labeled panel, inside the step that produces them.** The
  label is "Counts toward your grade". A student then knows which boxes matter without
  reading the rubric, and every other line on the step is plainly help.
- **Number the moves inside a stage**, as headers ("1 Pick your hook type"), and say how
  many there are in the stage's first line.
- **Make progress visible, because it is the reward.** A step button gets a tick the
  moment its evidence is in, a finished stage shows a banner, a number with a cap gets a
  gauge (grams against the 50 g limit), and Next glows once the step is done. Keep every
  motion behind `prefers-reduced-motion: no-preference`; with it off, the state still
  shows by color and glyph.
- **An either/or pick is a picture card.** Two cards with a drawing each (snapped or
  pulled open; standard or multi-part), the radio inside as the control, the chosen card
  marked with `:has(input:checked)`.
- **Number a measurement diagram to match its table**, and light the number up while its
  row is focused or clicked. "Which dimension is this" stops being a question.
- **`position: sticky` does nothing inside a ported document.** The frame grows to the
  document's height, so the frame's own viewport is the whole document and nothing ever
  sticks. Do not build a sticky nav; put navigation where it is used.
- **A grid or flex `li` splits its inline children into separate grid items.** A step
  line with a bold word and a key cap rendered as three columns. Wrap the line's content in
  one `<span>`.
- **SVG markers on a `<symbol>` need the theme class on the symbol's own `<svg>`**, or
  they paint in the browser default black; set `markerUnits="userSpaceOnUse"` so a scaled
  figure does not scale its arrowheads too.
- **A selector that reads text from a row is child-scoped** (`.dn > span`), so adding a
  decoration span to the row later does not change what the script reads.
- **A design option is drawn exactly as the earlier assignment drew it.** Hook 02's
  multi-part card first showed a standard hook cut in two, which is not a multi-part hook
  and contradicts Hook 01, which says cutting a standard hook into pieces gains nothing.
  Draw it from the earlier assignment's own geometry (Hook 01's two-piece link,
  `link()` in its generator), never a new stand-in (Mr. Pina, 2026-10-01).
- **A measurement figure puts each dimension where the calipers go**, drawn from the
  part's own geometry: edge to edge across a hole, the gap at its narrowest, a thickness
  across its thickest section in a side view, arrowheads on every dimension line. Hook 02's
  first draft marked the opening with a dashed circle and the thickness with an underline,
  and Mr. Pina caught both. A test rig is drawn the way the load actually goes through
  the part.
- **A "how did it fail" pick lists the real failure modes plus "Something else" with a
  short field**, never a two-way choice. Hook 02 had snapped and pulled open only; FDM parts
  also delaminate and multi-part joints let go (Mr. Pina, 2026-10-01).
- **In Chromium, an element screenshot taller than the viewport can paint the document's
  top bar into the middle of the image.** Confirm with a full-page screenshot at a viewport
  as tall as the document before calling it a layout defect.

---

## 16. Rules paid for by Hook 03 (2026-10-05)

Hook 03 carries a hook from its first pull to the tournament across four classes. Built
the night before its first stage was taught.

- **A post whose stages span classes ships with today's stage only.** Later stages show
  as locked cards ("Opens next class") with no inputs, and their blocks arrive at a later
  re-upload under new permanent ids. Adding blocks never orphans an answer (section 2);
  building a stage before its lesson is settled writes ids and a rubric for work nobody has
  agreed to. The rubric regenerates from the manifest on that re-upload only while nobody
  has hand-edited it (section 3), so hold rubric edits until the last stage is in.
- **A "where did it break" pick filters the fix playbook below it.** Show only the fixes
  for the picked place, always show the one that applies everywhere (here, paying for added
  material with grams taken from somewhere the test showed was fine), and keep a "See every
  fix" button so nothing is hidden from a student who wants to read them all. Each pick is a
  picture card drawn on the student's own part with the place highlighted, plus
  "Somewhere else" with a short field.
- **A fix is drawn before and after on the earlier part's geometry**: the old outline
  dashed, the new one solid, the added material in the success color. Parameterize the
  earlier outline's sizes rather than drawing a new hook (section 15). A fix whose earlier
  state already has it, like a fillet, is drawn against a version without it, or the figure
  shows no change.
- **A version-named hand-in checks the version.** A V2 slot handed a file named `V1_`
  says so and gives the exact Save As step. A renamed V1 is the commonest wrong V2.
- **`[hidden]` loses to any class that sets `display`.** A field styled `display: grid`
  stays on screen with `hidden` set. Every document carries
  `[hidden]{display:none !important}`.
- **A locked stage card keeps its two columns.** Dimming it is enough; collapsing the mark
  and the words into one column squeezes the text into a narrow strip at desktop width.

## 17. Folding sections cleanly, and the classroom look (2026-10-05)

Hook 03 was rebuilt the night before class so a stage reads as a short list of numbered
moves that fold, in IDEA Classroom's plate look. Mr. Pina's bar: collapsing that is clean,
never annoying. Measured in Chromium against a host page that resizes the frame the way the
portal does: at 1440px the stage went from 4834px tall to 2581px with every move folded.

- **A move folds only when the student presses something.** Picking an answer, finishing a
  field or reaching 100% never folds anything; a section closing under the cursor is the
  annoying kind. A move offers a "Next: <title>" key once it is done, and pressing it folds
  this move and opens the next. Progress-bar jumps and links only ever OPEN.
- **Arrival is derived from the saved answers, and only the next move opens.** In each
  stage the first move not yet done starts open and every other move starts as its
  one-line header; Open all brings them back. A stage whose moves are all done starts
  folded. Read-only (the grading view) opens everything. An optional move opens only when
  it has something in it. This replaced "every move open" on 2026-10-08, when Mr. Pina
  found a three-stage Hook 03 a disgusting amount of scrolling: a fresh student's page went
  from 13,202px to 4,768px at 1440.
- **A whole stage folds from anywhere on the page.** Each stage header carries Collapse
  stage, and the progress bar that follows the reader carries one key per stage (V2, Sim,
  V3), pressed while open. Either key lands the page on that stage's header. With many
  segments the bar drops its segment words below 1700px and keeps the Next line.
- **Group a long video's chapters rather than spending all of them.** Six steps or fewer
  per chapter player, a step text of one line where it can be.
- **A closed header still says what is inside it**: the number, the title, a one-line
  summary of the answer ("Neck", "46.8 g, under the cap", "0 of 4 answered"), a Done or To
  do chip, and the word Show or Hide beside the chevron. A collapsed section that hides
  whether it is finished makes the student open it to find out.
- **Fold with `display: none`, never by animating height.** The frame's height comes from
  the document through `idea:height`, so a height animation resizes the frame every frame
  and moves the parent page under the reader. A short fade on the opened body is enough.
- **Next is an instant cut, with focus moved.** Fold the current move, open the next, put
  its header at the top of the screen with no smooth scroll (the content above the reader is
  what shrinks, so a slide drags the page), and focus the next header so the keyboard and a
  screen reader land on it.
- **A header click opens in place, unless the opened body would run off the screen.** Then
  bring the header to the top, but wait about 120ms first: the scroll has to happen after
  the portal grows the frame, or the page is still the old height and stops short. Measured:
  scrolled at once the header moved 92px instead of to the top.
- **Open all and Close all sit beside the stage title**, Open all leaving optional moves
  as they are. A textarea inside a closed move measured 0px when it was filled, so regrow
  every textarea in a move when it opens.
- **A pick-dependent panel stays shut until the pick.** The fix playbook shows nothing
  before a break is picked, only a "See every fix" key.
- **The stage chip counts the moves it sits above.** A chip counting progress segments
  read "1 of 6 done" over two Done moves.
- **The classroom look, from `src/lib/classroom/plate.css`**: the stage title is centered
  spaced mono caps between hazard-hatch masks over a groove; status chips are recessed with
  a small lamp; keys are raised with mono caps words; Space White keys are grey
  (`#b8bdc5` to `#cdd2d9`, ink `#2d3238`), never white on white. Raised means pressable and
  recessed means not, so a status chip never gets a drop shadow.
- **Every control is 44px tall at every width**, the classroom's rule for student
  surfaces. A slim progress segment reaches 44px through an invisible `::after` hit area,
  checked by hit-testing points across its full height.
- **A class name shared across stylesheets can paint a state class.** Hook 02's `.next`
  panel rule matched the progress bar's `.pseg.next` state and drew the current segment as
  a box. Before reusing an earlier document's CSS, search it for every bare class the new
  markup uses as a state.
- **A picture shows inside the document from its own bytes only until the upload lands.**
  On upload the document draws it from the bytes it already holds. After that, and after
  every reload, the portal hands back a link the sandbox is not allowed to load, so the
  document can only say "Saved: <name>" -- and the portal draws the stored picture over the
  box the document reports (section 10b, ledger 0368). A document with no box reporter
  leaves the picture in the list under the frame, in the student's view and the grading
  view alike. That is the platform (`CLAUDE.md`, "bytes go frame-to-parent only"). Tell
  students the picture stays in the worksheet only when the document reports its box.

## 18. A video tutorial stage, and adding a stage to a live post (2026-10-07)

Paid for by Hook 03 Stage 2, Simulate: a SolidWorks static study taught entirely by six
short videos Mr. Pina recorded, built into the live post so no live demo is needed.

- **The teacher's own videos are the source, and they outrank every older document.** Read
  every transcript before writing a step, and where an older handout or shot list says
  something different, the video wins (Simulate: Normal direction, not Selected; Split Line
  from Features > Curves before the study, not from the load window; No on the
  notification). Each move's steps are the video's steps, in its order, in its button
  names, so a student watching and a student reading do the same thing.
- **One move per video, the video card first.** Card, then the numbered steps, then a
  "You should see" line describing the end frame, then any hand-in. A student who will not
  read can play the card and match the end frame.
- **Every move carries "That's not what I see".** A closed disclosure under the steps, each
  row a symptom in the student's words beside the fix. Write the symptoms from what goes
  wrong in that exact procedure (no add-in tab, a circle that does not cross the face, the
  wrong face picked, units in N, arrows the wrong way, a frozen solve), and end the last
  move with "raise your hand" for whatever none of the rows fit.
- **Evidence at the checkpoints, not a checkbox per move.** A screenshot where the setup
  can be checked (both split faces; the fixture and load before Run with the study tree
  showing; the result with its scale), and a move with no evidence of its own is done when
  the next evidence lands. A screenshot before Run is what lets a grader see a load on the
  wrong face or in the wrong units, which the result alone hides.
- **A video card names its maker and its place in the set** ("Mr. Pina video, 3 of 6"),
  never a length nobody measured. Its thumbnail is the real one, inlined as a `data:` JPEG,
  because the sandbox loads no image host.
- **A pick that reads an earlier stage's answer shows it.** The Read move prints "Test 1
  broke at: Bowl" beside the question it is compared with, from the saved Stage 1 answer,
  so the student compares rather than remembers.
- **Adding a stage to a live post keeps every earlier id.** The new module gets new,
  permanent block ids; the earlier module, its rubric and its moves are untouched; the
  manifest's points grow by the new module's points; the stage list moves "Today" to the
  new stage. The stage chip and the stage-done banner act per stage, never on the whole
  document (section 19 replaced Open all and Close all with the stage banner). Re-upload over the same post: the rubric regenerates for the new
  module and every stored answer still renders.

- **One long video, many steps: a chapter player, played inside the assignment.** The
  16:9 box takes the full width of the document, never a column beside the steps: Mr. Pina,
  2026-10-12, "there's a lot of little details" a student cannot see in a half-width box.
  The steps sit under it as a grid of buttons, each with its chapter time; pressing one
  sends `idea:video` with the id, the box and `start` in whole seconds
  (`IDEA_HTML_ASSIGNMENT_SPEC.md` 1.7), so the portal plays it in that box from that step,
  and scrolls the video into view under the following bar. Directly under the video sit
  Back a step, the line "Step 3 of 6: title", Next step and Stop video, so a student walks
  every step without scrolling. A step for the other printer is hidden and skipped. A
  poster starts step 1; Stop video brings it back. Never send a student to a new tab for a
  chapter (Mr. Pina, 2026-10-08: "really annoying"). The step text is a title and one line,
  because the video carries the rest. Group chapters that serve one step; skip the rest. A
  single video opened from a card also plays full width.

## 19. Navigation a ninth grader can follow (2026-10-12)

Mr. Pina, reading Hook 03 on the last print day: "I do not know where I am or how to get to
where I need to go." Stage keys that struck through when folded "made no sense", Read aloud
and the "Six moves" intro line were noise, and a separate Collapse stage button was the
wrong control. The rules that replaced them:

- **The stage banner IS the control.** Each stage opens under one full-width banner button
  (`aria-expanded`, `aria-controls` on the stage body): the stage's picture, "Stage 3", its
  name, the class and points, a progress chip ("2 of 5 done"), and the word Show or Hide
  with a chevron. Pressing it opens or closes the whole stage. No other fold key exists.
- **One stage open at a time while a student works.** Opening a stage closes the others,
  and the page lands on that banner. Arrival opens TODAY'S stage (one constant, `TODAY_STAGE`), because that is where the class is working; an earlier stage still owed says so on its banner, its stage key and Next to do. (1.22 opened the first stage not done, which sent a student missing one field from an earlier stage away from the day's work.) Read only (a teacher grading) opens every stage and keeps
  them independent. A stage that has not opened yet is a locked banner, "Opens after the
  tournament", not a button.
- **The following bar says where you are, in words.** Left: "You are here" over
  "Stage 3 · Move 2 · Weigh V3, alone", read from the page as it scrolls (stage, then the
  open move under the top of the screen). Middle: one key per stage with its number and
  a count ("3/5", or Done in a filled number when complete); the stage on screen is lit,
  never struck through, and pressing a key opens that stage and jumps to its banner.
  Right: a Next to do key naming the first move not done ("Stage 3 · Move 1 · Build V3 at
  the red") that opens its stage and move and focuses it; once everything is in it reads
  All done. Then the theme key and the save pill. Under 760px the bar is two rows: where
  you are and the save state, then the stage keys and Next to do.
- **Cut what does not help a first-timer find the next thing.** No stage cards above the
  stages (the bar and the banners carry them), no per-requirement segment strip, no Read
  aloud, no Open all or Close all, no intro line repeating the move count, and no stats
  row in the hero. The hero keeps the title, one line and the reading-size keys.
- **Test it as a student would.** The interaction test lands a new student on Stage 1
  alone, walks it, presses Next to do and checks Stage 2 opens with Stage 1 folded and the
  move focused at the top, checks the "You are here" text at a scrolled move, presses an
  open banner to close it and a stage key to open another alone, plays a chapter and
  checks the video sits on screen under the bar at full width, and reloads to check the
  arrival stage.

## 20. The results stage, after the event (2026-10-13)

Hook 03's Stage 4 ("What happened") is the pattern for any stage written after a tournament,
a test day or a launch. It keeps Rotation 1's Failure Analysis shape (the result, a photo,
right or wrong with one change, a slide in the class deck) and adds four rules.

- **The first pick decides what else is asked.** A radio of outcomes ("Broke in a match",
  "Won, then broke", "Never broke", "Never pulled") shows a load only for a part that was
  tested and a spot only for one that broke. Nobody is asked for something that did not
  happen to them, and the label of the load field changes with the outcome (the reading when
  it broke, or the highest reading it survived).
- **A conditional field is `optional: true` in the manifest, and the document judges it.**
  The portal counts every non-optional block toward Complete, so a required spot would leave
  a "Never broke" student Missing forever. The move's own done-check enforces the condition.
- **Put the earlier prediction beside the result, worked out in words.** A panel reads the
  Stage 3 call and the result and states the comparison ("35 lb less than your call (16%)",
  "Not the spot you called"), so the sentence a student writes compares two things already on
  screen. Right or wrong scores the same; the rubric grades saying it plainly.
- **An external tool the work must happen in opens in a new tab, once, and says so.** A shared
  Google Slides deck cannot be edited inside the frame, so it is one worded key ("Open the IDEA
  Hook Designs deck, Google Slides, new tab"), and the evidence comes back as a pasted
  screenshot of the slide, never an "I did it" checkbox.

---

## 21. Rules paid for by IDEA-Blade (2026-10-14 to 2026-10-18)

Built on IDEA100 IDEA-Blade 01 (Design) and 02 (Build and Fight), the last unit of a
rotation, where the class must execute a seven-class timeline on command.

- **A landing aims below the following bar and checks itself.** Next to do, a stage key and
  every Go key call one helper (`hxLand`): it aims a 1px anchor at the target's top minus the
  bar's height minus 12px, scrolls instantly, then re-reads the bar's real position after the
  portal resizes the frame and corrects up to twice. A scroll aimed once, before the frame
  grows, lands the target under the bar (Mr. Pina's screenshot, 2026-10-14). Test it on a
  harness host that resizes the frame a beat late.
- **Color by meaning, never green everywhere.** Green is act and done. Amber is a limit, a
  warning or a deadline (every "due" chip, the rule drawing's limits). Red is only a number
  that must change. Blue is help ("That is not what I see"). A role or a product may carry
  its own hue (Blade orange, Body blue, Assembly violet; SolidWorks red, xTool teal) only
  beside its word. Every ink measured at 4.5:1 or better on its ground in both themes.
  Greenwashing a page, every heading and fill in the accent, is a defect (Mr. Pina, 2026-10-14).
  The ration that passed (Mr. Pina, 2026-10-19, "too greenwashed" on IDEA-Blade 01): green
  lights only the one next Go in the Today plan, the active day and stage keys, a picked card,
  done chips and done numbers, links, focus rings and a hover. Eyebrows and stage labels take
  the muted ink, icons the text ink, the graded panel's frame and label the neutral line,
  every other key and callout graphite. Count the green elements on the first screen: more
  than three is the defect.
- **Build on the design system's tokens and components, never a hand-rolled palette.** An
  assignment that writes its own colors, key shadows and chips reads as "not quite the site"
  even when every rule above is met, and he cannot name why (Mr. Pina, 2026-10-19, IDEA-Blade
  01). Generate the custom properties from the IDEA Design System's `tokens.json` (both
  themes, shadows included) and style every part on them: the page is the plate gradient,
  the title is the title bar between hazard ends with a mono breadcrumb above it, sections
  are panels (moves are nested panels), everything pressable is a key, the one next action
  is the primary key, an ON key is lit with the broken accent ring, status is a 22px chip
  with a 4px lamp, and inputs, slots and read-only facts are wells. Role and product hues
  are retired: a role is its icon and its word. A deadline is an amber lamp beside plain
  text. A rule drawing is line work in the plate's inks. A list of rows is one well split
  by dividers, never a stack of outlined boxes with colored stripes.
- **Never ask for a number a student cannot know yet.** A Day 1 mass budget asked ninth
  graders to guess grams for parts nobody had modeled (Mr. Pina, 2026-10-19: "how in God's
  name is a student gonna know how many grams each part is"). Ask for a number only on the
  day its real instrument exists, and name the instrument beside the box: SolidWorks Mass
  Properties for a steel part (material set first), the slicer's filament weight for a
  printed part (never SolidWorks, which assumes a solid part), the scale for hardware.
- **A weight is written in pounds and grams, every time**: "1.5 lb (680 g)". Inputs stay in
  grams, because every instrument above reads grams, and every total the page computes
  shows both.
- **Show the real thing, not an icon.** Line icons for the parts read as clip art. Render the
  actual object (three.js in headless Chromium: the part's real proportions, its real
  material, studio light, no ground plane, a CSS drop shadow) and embed it as a small WebP:
  the whole build in the hero, and each role's own part on its role card. Five renders cost
  about 45 KB.
- **Teams of two and three in one class.** When students pick teams and the count does not
  divide by three, a team of two folds one role into another rather than leaving it empty: a
  fourth role card ("Blade and Assembly, team of two only") whose value shows both roles'
  steps through space-separated `data-role` tokens and a Today task tagged with both. Pick the
  pairing by load: the role whose own file is due first takes the role due last.
- **A template file is a download, through the attachment proxy.** Attach it to the post and
  link `https://ideabosco.com/api/classroom/attachment/<id>` as a 44px key with the saved file
  name beside it and what to do next (open it, Save As where). Show only the student's
  role's file once a role is picked.
- **A multi-day unit opens with a Today plan.** Under the hero: a strip of every class in the
  unit (later classes in the next post drawn dashed, a no-class day as a flat chip), the day
  on screen lit, a dot on today, and a press on any day shows that day's plan for this visit.
  The plan is that day's tasks for the student's role only (everyone's tasks plus their
  role's, each with its role word), each a numbered row with its state read from the move it
  points at and a Go key that opens that move alone and lands it under the bar. It ends with
  one "Done when" line that names the finish line for that class. Before the first class it
  says "Next class"; on a no-class day it says so and shows the next class.
- **Right-size the challenge with levels, never bonus points.** Per role: Ready (every rule
  met, full points), Strong (one measurable improvement that makes it perform better) and
  Stretch (only once Ready and Strong are saved by a named class). Say "Aim for Strong; get
  Ready saved first", and a dated stop rule in amber ("End of class Oct 20: Ready not saved?
  Stop adding. Finish Ready first."). The pick is an optional radio block, so the teacher sees
  ambition without it counting.
- **A video library is slots first, cards when recorded.** Each move names the videos that
  teach it (`data-vids`), and one table holds every video with its role, title, YouTube id,
  start second and inlined thumbnail. A slot with no id renders nothing and the library hides,
  so a post can go live before the videos exist and gain them by a re-upload that changes only
  the table. A card says "Mr. Pina video, n of N" counted over the student's role. Playing
  one opens a full-width 16:9 box at the top of its move with a Stop video key, sends
  `idea:video` (id, rect, start, clipTop under the bar), and falls back to a YouTube link
  after 1.5 s with no `idea:video-state`.
- **Team CAD lives in IDEA Armory, one project per team.** Armory names a file once per
  project, so a class-wide project collides on every template part; each team gets its own
  project and folder (`C:\IDEA\Armory\<project>`). The Day 1 move walks setup from
  ideabosco.com/armory/start, Save As into the team folder with the team name in the file
  name, closing the file to send it, and a screenshot of the folder as optional evidence.
  Every later move opens files by right-click, Show more options, IDEA Armory, Check out and
  open. The fix list carries the installer warning, the shared-computer PIN prompt, a
  read-only file and a name already used.
- **A live thumbnail carries no wrapped title.** The thumbnail shell has no fonts and no
  container, so size its words with `vh` and set `white-space: nowrap`; render it in all three
  shapes and both schemes before delivery.
- **Design on paper before CAD.** A design unit opens with a team concept sketch, never with
  a file: top view and side view in pencil, every part labeled with how it is made, the
  hitting or working edge circled, sizes written beside it, one photo handed in by every
  teammate. Show an annotated example sketch, the rules it must fit beside it (sizes
  current on the page, the official rulebook linked for everything else), and say what is
  scarce (one new steel blade per team; printing is open). Size targets are read off the
  sketch, and the Armory and SolidWorks setup move to the next class.
- **A thumbnail is a picture of the real thing.** Use the render of the part the unit makes,
  never an abstract glyph built from primitives; an abstract shape at 48px reads as
  something else entirely (an ice cream cone windmill). In the wide shape give the image a
  set width and let the words wrap in their own column, with a non-breaking hyphen
  (`&#8209;`) inside a compound title.
- **Audit against this file, rule by rule, before delivery.** Mr. Pina, 2026-10-19: "this
  document is being evolved, but not used". A build that grew this file all week still
  shipped with no tap tips, no writing budget, a "You should see" on two moves of eleven and
  a deadline that contradicted itself. Before delivering, hand the built file and this file
  to a fresh agent that has seen neither the build nor the chat, and have it report PASS or
  FAIL with the line for every rule that applies. Fix every FAIL or say why not.
- **Tap tips are a component, not a promise.** Wrap the first use of each term in a move:
  `<span class="it" tabindex="0" data-tip="...">term<span class="vh"> (definition)</span></span>`.
  The `::after` is `display:none` until `:hover`, `:focus` or `.open` (a tap toggles it), so a
  closed tip adds no width; give it `box-sizing: border-box` and a width set by script to fit
  inside the stage, because the stage clips (`overflow: hidden`) and a tip measured against
  the window is cut off at 375. Do not tip a button or menu name (`Export plate sliced file`)
  or anything inside a label, link, summary or the drawing. Generate them from one glossary
  list so every move defines the same term the same way. Use a class other than `.tip` if
  `.tip` is already a paragraph style.
- **A limit and a design are two numbers, and the drawing says which is which.** An example
  that showed a 5.00 circle in one view and 4.80 across in the other read as a contradiction.
  Draw the limit dashed and label it as the limit ("5.00 dashed circle = the rule limit"),
  give the design its own labeled number ("tips on a 4.80 circle"), and print both together
  where the size is dimensioned ("4.80 across (5.00 max)").
- **Draw the real part from the instructor's template, not an invention.** A blade drawn
  from imagination was "absolutely horrendous". Take the shape from the template slide or
  part the class actually starts from (IDEA-Blade: a five-tooth star with obround slots and a
  0.50 in hex bore, 0.100 steel, inside a 5.00 circle), and make the render, the example
  sketch and the thumbnail from that one geometry.
- **Lab fact: the IDEA-Blade launcher spins left, counterclockwise seen from above.** Every
  spin arrow, "which edge hits first" and leading-face callout follows that direction.
- **Every procedural move ends with "You should see" and "That is not what I see".** One
  sentence of what the screen or the paper shows when the move worked, then a fix list in
  the student's own words. The sketch's list: we cannot agree, nothing to draw the circle
  with, a blurry or sideways photo, paste does nothing, a teammate absent.
- **A printer setting is a lookup table keyed on what the Print Tech says**, never "set the
  nozzle to match": one row per printer and nozzle, with the exact printer preset name to
  pick and the nozzle type. The Print Tech is the student in charge of that printer.
- **A drawing that needs a minimum width sits in a grid child with `min-width: 0`.** The
  example sketch scrolls sideways at 375 inside its own box; without `min-width: 0` on the
  grid child the drawing's 600px minimum widened the whole column and the stage scrolled
  its text out of view.

- **A whole-workflow video gets a chapter key on the steps where a student gets stuck (IDEA-Blade 01, 2026-10-20).**
  When Mr. Pina records one video through a role's whole job, a step carries a small key at
  its top right (44px, the play glyph and the time) that plays that same video inside the
  assignment from the second the step starts. Key only what is new or easy to get wrong (a
  new tool, a rule, a choice with a wrong answer); never at 0:00, which repeats the card;
  never a step the class already knows (Edit Sketch, Extrude). 29 keys on IDEA-Blade 01
  was too many (Mr. Pina, "too many timestamps"); with eight videos it settled at 20, two to
  five per role on any one day. An independent audit counts them per role in List view. The steps are
  rewritten from the transcript in the video's order and button names (section 18), so the
  text and the key say the same thing. One video record per recording; a later move that
  reuses its tail (the DXF at the end of the blade video) points at the same id with its own
  `start`, never a second upload.
- **Chapter times come from YouTube's own transcript, never from a generated breakdown.**
  Open the video's watch page, Show transcript, and read each step's first line off its
  timestamp. A second-by-second "breakdown" written from a transcript is a paraphrase with
  invented precision; on 2026-10-20 its chapter list matched the real transcript within a
  few seconds, and that was checked, not assumed.
- **One map, three views, the student picks (IDEA-Blade 01, 2026-10-20).** Mr. Pina could not
  tell where he was: the plan was by day, the stages by topic, the same task numbered twice,
  folds inside folds. The fix is one map (the classes) and a View switch in the following bar:
  **Day** (one class, every step open, scroll only), **Step** (one step, Back and Next) and
  **List** (everything open, a Jump to list that tracks the reader). Stages stay in the manifest
  for grading and are hidden from navigation; the choice is an optional `radio` answer in an
  individual module so it follows the student, never a team module. A grader always gets List.
  `nav.js` in the IDEA-Blade build is the working reference.
- **Taking out a question students already answered: keep its block, hide its field.** On
  IDEA-Blade 01 (2026-10-20) the level pick was cut mid-class after 16 students had answered
  it. Dropping its block makes the replace screen ask to orphan those answers; instead the
  manifest keeps the block (marked retired in its prompt, `optional: true`) and the document
  keeps its input inside a `hidden` wrapper, so the replace reports no block dropped and
  every stored answer stays attached to the assignment.
- **Where the files live is what the video shows.** When templates already sit in each
  team's IDEA Armory project, the steps open them from Armory (Open, not Check out, so the
  save becomes a copy) and the template downloads come out of the assignment. A second way
  to the same file is a second thing to go wrong.

## 22. Rules paid for by IDEA-Blade 01's second class (2026-10-20)

Everything below was fixed live on IDEA-Blade 01 during one class day, each from something
Mr. Pina or a student hit. Section 21 holds the rest of that day (chapter keys, transcript
timing, retiring an answered question, the three views).

**Judge it where students see it.**
- **The target is IDEA Classroom at 1920x1080 with default settings, not the file opened
  alone.** Measured 2026-10-20: with the class list open, the assignment frame is about 1450px
  wide and the visible pane about 830px tall, below the post header and files. Measure in the
  live portal (resize the browser to 1920x1080, read the frame's width and the pane's height),
  then lay out for that box.
- **Keep the top short.** At 1100px and up the hero is one band (render capped near 190px tall,
  the long intro line hidden) and Today is one row, so the following bar and the first step
  sit inside the first 830px of the frame (694px measured on IDEA-Blade 01).
- **The replace screen is the outside judge for every re-upload.** Read its report before Save
  and publish: blocks kept, blocks new, blocks dropped and how many stored answers each
  carries. A new optional block is reported with generic "have it to do" wording; optional
  blocks never count toward completion. Then open the live `/hx/` document and confirm the new
  text is in it.

**Navigation.**
- **Any student can see any role's steps.** A "Steps for: Blade · Body · Assembly" control in
  the bar shows another role's steps for an absent teammate, a curious student or a second
  try, with the student's own role marked "yours". While looking, a banner says the role and
  the hand-ins stay theirs, offers Back to my part, and every hand-in box is hidden so nothing
  lands under the wrong role. The saved role never changes.
- **A control that changes nothing is bloat.** A "pick your level" radio that only highlighted
  a card was cut (Mr. Pina: "its bloat"). Upgrade targets (Strong, Stretch) sit at the end of
  the step as "Saved and checked in? Make it fight better", shown, not chosen, and never graded.
- **Step titles never carry a second numbering.** "Armory folder · Class 2" beside a Day 2
  map is a third answer to "where am I"; the title is the action ("Connect Armory").

- **A resource students must open is a card, never a plain key.** On IDEA-Blade 01 almost no
  student opened the rulebook or the template slides from ordinary keys. Each became a gold
  card (icon, a "Read before you sketch / model" label, a title, one line of what is inside, an
  Open key), shown in the hero and again at the step that needs it.

**Videos.**
- **Merge slots to match what was recorded.** When Mr. Pina records sketch and extrude as one
  clip, the two slots become one video record and one card per role; never two cards on one
  upload. A later step that reuses the tail of a clip points at the same id with its own
  `start`.
- **A video that is not Mr. Pina's says so.** The card's maker line comes from the record
  (`by: 'Practice video'`) instead of "Mr. Pina video", and its aria label says practice video.
- **A role with no recording today gets a practice box, not nothing.** Assembly discovery: one
  outside tutorial picked from a reseller's channel (named, and flagged as not yet watched),
  plus steps that practice the real mates on the team's own template parts in a throwaway
  assembly saved outside the team folder.
- **Thumbnails come from the title card.** A frame of the clip's own intro card, inlined as a
  `data:` JPEG at 352x198, so the card matches the video before YouTube's thumbnail exists.
- **Right after upload, YouTube may refuse to play inside the page while it processes.** The
  fallback ("Open the video on YouTube") shows; that is not a bug in the document. Check the
  watch page's `playableInEmbed` before calling it broken, and wait for processing before
  announcing a video.
- **Title cards and outro for recordings come from a pack, not by hand.** `card.py` renders one
  intro per clip code (codes follow `VIDEO_ORDER`) and one outro; a PowerShell script adds them
  to every file in `raw` by its code. A combined clip uses the first step's code and a
  re-rendered card titled for the whole clip.

**Content.**
- **The steps describe the tool as it really works, from the video.** For IDEA Armory that is
  the app, not File Explorer: Open looks only, Check out and open edits, Ctrl+S, close with the
  inner X (not SolidWorks' outer one), then Check in. Template downloads are removed once the
  templates live in each team's project.
- **Say the collaboration shape outright.** Every teammate sketches their own idea, the team
  picks one, and every part is modeled from that one sketch; the modeling step opens with
  "Build your team's chosen sketch… check your part against it before you hand in." Left
  implicit on Day 1, teams split up and modeled without the sketch.

## Changelog

- **1.33 (2026-10-20).** Ledger 0419. New section 22 from IDEA-Blade 01's second class: judge layout in IDEA Classroom at 1920x1080 (a 1450x830 frame) and keep the top short, read the replace screen before every publish, any student can see any role's steps with hand-ins hidden, cut controls that change nothing, merge video slots to match recordings, label outside videos, a practice box for an unrecorded role, title-card thumbnails, YouTube processing versus a real embed fault, the card pack, steps that match the real Armory flow, and the sketch-per-person, team-picks-one collaboration said outright.
- **1.32 (2026-10-20).** Ledger 0418. Section 21: chapter keys on the hard steps of a whole-workflow video, chapter times read from YouTube's own transcript, templates opened from the team's Armory project when that is where the video opens them, a question already answered is retired by hiding its field, never by dropping its block, and a multi-day assignment offers Day, Step and List views over one map of the classes.
- **1.31 (2026-10-19).** Ledger 0413. Section 21: a rule-by-rule audit by a fresh agent before delivery, tap tips as a component, a limit and a design labeled as two numbers, the real part drawn from the template, the launcher spins left, "You should see" on every procedural move, a printer lookup table, and `min-width: 0` around a wide drawing.

- **1.30 (2026-10-19).** Ledger 0412. Section 21: design on paper before CAD (a team concept sketch on Day 1) and thumbnails that show the real part.
- **1.29 (2026-10-19).** Ledger 0411. Section 21: never ask for a number a student cannot know yet, weights in pounds and grams, and renders of the real part in place of icons.
- **1.28 (2026-10-19).** Ledger 0410. Section 21: build on the design system's tokens and components (the IDEA-Blade 01 restyle).
- **1.27 (2026-10-19).** Ledger 0409. Section 21: the green ration that passed on IDEA-Blade 01, and teams of two and three in one class.
- **1.26 (2026-10-18).** Ledger 0408. New section 21 from IDEA-Blade 01 and 02: landings aimed below
  the following bar that re-check themselves, color by meaning, template downloads through the
  attachment proxy, a Today plan for a multi-day unit, Ready/Strong/Stretch levels with a dated
  stop rule, a video library that renders only recorded videos, team CAD in one IDEA Armory
  project per team, and an unwrapped live thumbnail title.

- **1.25 (2026-10-16).** Ledger 0396, migration 0268 (post thumbnails, report a6a037f3).
  New section 10d: a document may declare how its post looks in a class list with a
  top-level `thumbnail` key, a live thumbnail in a `<template id="idea-thumbnail">` or a
  picture (`attachment:` or a raster `data:` URI); fill the slot in every shape from the
  shape attribute and the size variables; follow the light or dark look; animate and let the
  portal pause it (under reduced motion a canvas loop still draws a still picture of itself,
  again after every resize, shape or theme change); hover with no code; and `interactive`
  only for a thumbnail with controls of its own, kept to Wide and Banner when they are too
  small for a Tile. Carries a working example, the one now in `_TEMPLATE.html`. A manifest
  naming a template the document does not carry gets the generated look, never a live
  thumbnail that cannot appear.
- **1.24 (2026-10-14).** Ledger 0381, migration 0238. New section 10c: the document reports
  each answer's box with `idea:field-box` so the portal pins a teacher's note beside it,
  answering the advisory `idea:feedback` (field names only, never waited on), with the
  rectangle rules of 10b, the pin the portal draws, when to re-send, why a radio group's or a
  table's `data-field` sits on its visible wrapper, and the verbatim reference reporter. All
  of the conversation stays parent chrome. The header points a chat with no repository at the
  new `IDEA_HTML_ASSIGNMENT_BRIEF.md`.
- **1.23 (2026-10-13).** Ledger 0379. Section 19: arrival opens today's stage. New section 20:
  the results stage after an event (outcome-driven questions, conditional blocks optional in
  the manifest, the earlier call worked out beside the result, one external tool opened once
  with a screenshot as evidence). From building Hook 03 Stage 4.
- **1.22 (2026-10-12).** Ledger 0378. Section 18: the chapter player's video takes the
  full width with Back a step and Next step under it. New section 19: the stage banner is
  the fold control, one stage open at a time, and a following bar that says where you are,
  keys each stage and offers the next move. From Mr. Pina's read of Hook 03.
- **1.21 (2026-10-08).** Ledger 0373. Section 18: a chaptered video is a chapter player that
  plays each step inside the assignment (`idea:video` gains `start`), replacing the 1.19
  time keys that opened YouTube in a new tab.
- **1.20 (2026-10-08).** Ledger 0372. Section 17: only the next move opens on arrival, done
  stages arrive folded, a whole stage folds from its header or from keys in the following
  bar, and a long video's chapters are grouped. From Mr. Pina's read of Hook 03 Stage 3.
- **1.19 (2026-10-08).** Ledger 0371. Section 18: a chaptered walkthrough video is embedded
  once per move, and each step gets a time key opening YouTube at its chapter.
- **1.18 (2026-10-08).** Ledger 0370. Section 13: a box in a closed `<details>` is never a
  paste target, and a later version's file card reuses the hand-in code keyed on the slot.
  From Hook 03 Stage 3 (V3, the call and the team print plate).
- **1.17 (2026-10-07).** Ledger 0369. Section 10b: retrofitting a posted document with one
  manifest-keyed reporter that re-sends from a `MutationObserver`, and why a file card with
  its own keys reports no box. Applied to Hook 01, SolidWorks Day, Hook 02 and Hook 03.
- **1.16 (2026-10-07).** Ledger 0368, two of Mr. Pina's reports from 2026-10-06. Section
  4: downloads fire (`allow-downloads`), and a stored picture is the portal's to draw.
  New section 10b: a copy-paste reporter for `idea:image-box`, so the portal draws a stored
  picture (or a file with a Download) over the box the document holds open, and its rules
  (send after every state, fold, stage change and resize; null while hidden or under the
  document's own modal; `clipTop` under a following header; controls outside the box; at
  least 160 by 120; the fallback text kept; never inside a following element; until a
  document is re-uploaded with it, its pictures stay in the list under the frame). Section
  9b: the in-document Download button works now and the portal offers the file too.
  Section 7: no picture box inside an element that follows the reader. Sections 10 and 17
  edited in place for the box.
- **1.15 (2026-10-07).** Ledger 0367. New section 18: a video tutorial stage built from the
  teacher's own videos (they outrank older handouts), one move per video with a "You
  should see" end frame and a "That's not what I see" fix list, screenshot evidence at the
  checkpoints, honest video card labels, an earlier answer shown beside its comparison, and
  adding a stage to a live post with every earlier id kept and per-stage controls.
- **1.14 (2026-10-05).** Ledger 0362. New section 17: folding moves cleanly (fold only on a
  press, arrival from saved answers, closed headers that say what is inside, `display:none`
  over height animation, Next as an instant cut with focus, a delayed bring-up for a low
  header, the stage chip counting moves), the classroom plate look, 44px taps at every
  width, a shared class name painting a state class, and pictures shown only until reload.
- **1.13 (2026-10-05).** Ledger 0361. New section 16: six rules from the Hook 03 build
  (ship today's stage only with later stages locked, a break pick that filters the fix
  playbook, before-and-after fix figures, a version-named hand-in check, the `[hidden]`
  trap, locked stage cards).
- **1.12 (2026-10-01).** Ledger 0360. Section 2: give each block a `prompt`, the question
  as a grader reads it. New section 9c, a presentation link hand-in (`link:
  "presentation"` on a `text` block, what the parent does with it, and three rules).
  Section 12: the SQL query for reading answers in bulk is retired, replaced by the grading
  console's Answers view, Answers by question and the Answers CSV. Section 8: mark each
  extra photo slot `"optional": true`. Section 13: optional record blocks are marked
  `optional: true` in their module instead of moving to the header, which is for identity.
- **1.11 (2026-10-01).** Section 15: measurement figures dimension where the calipers go; failure-mode picks list every real mode plus Something else (Mr. Pina).
- **1.10 (2026-10-01).** Section 15: a design option is drawn from the earlier assignment's own geometry (Mr. Pina).
- **1.9 (2026-09-30).** New section 15: thirteen rules from the Hook 02 visual overhaul (one picture per step, a stepper for a long procedure, one accent, the graded-input panel, numbered moves, visible progress, picture cards, a numbered measurement diagram, no sticky inside the frame, and four traps) (Mr. Pina).
- **1.8 (2026-09-30).** Section 14: no "I did it" checkboxes; ask for checkable evidence (Mr. Pina).
- **1.7 (2026-09-30).** Section 14: the lab exports STEP, never STL (Mr. Pina).
- **1.6 (2026-09-30).** Header: the standing instruction that this file updates itself
  whenever an HTML assignment is built or revised. New section 14: six rules from Mr.
  Pina's pre-class read of Hook 02 (writing budget, lab facts confirmed with him, lookup
  tables, `break-word` in narrow table cells, long when needed, the first week of use).

- **1.5 (2026-09-29).** Three stale rules corrected against the tree and Mr. Pina's rulings:
  section 4, a font the document embeds as `data:` now renders (ledger 0351), and the site's
  own faces are the ones to embed; section 11b, a video plays in the post through
  `idea:video` (ledger 0349) instead of only linking out; section 12, the look follows the
  site's light or dark through `idea:theme` (ledger 0350) with a per-visit override,
  replacing 1.4's one-look rule. New section 13 carries ten rules from Hook 02's
  pre-delivery persona audit. Design direction for every HTML type moves to the new
  companion `IDEA_HTML_DESIGN_DIRECTIONS.md`, pointed at from the header.

- **1.4 (2026-09-27).** From the IDEA100 Rotation 2 Hook 02 build (V1 Checkpoint, two
  `.SLDPRT` hand-ins), base 1.3 at `origin/main` `03f2c691`. Section 9b: replaces the rule
  to match acknowledgements in the order sent, which cannot work because text saves are
  debounced, with reading success off `idea:state` (read from `answers.ts` `image()`,
  which adds the field to `images` only after the upload lands); adds that replacing a
  file means removing it first. Nothing else changed.
- **1.3 (2026-09-27).** From the IDEA100 Rotation 2 Hook 01 build (Research and Concepts),
  base 1.2 at `origin/main` `1c5a1848`. Adds to section 8: one photo with optional extra
  slots, no single path to completion, minimum text with hover tips and a class
  read-through, dead space as a measured defect, and a progress bar whose segments scroll
  the parent. Adds to section 10: image slots in the dirty set, an echo must not reset the
  status pill, and a hidden table store caught by the generic restore loop. Adds to section
  11 step 7 the stale echo. Adds to section 11b the diameter sign in the sans face and
  drawings generated from geometry, container 3D renders with three.js and their two traps,
  and the one-slide limit on a Slides preview. Replaces in section 12 the theme-switch
  paragraph with "Prefer one look to a theme switch", keeping the old rule for documents
  that still have one. Nothing else removed or reworded.
- **1.2 (2026-09-27).** Merges a fork. Two chats each wrote a different 1.1 dated
  2026-09-25 from the same undelivered 1.0: this file's 1.1 (Rotation Survey and Dogtag,
  landed at `f5a4b033`) and a second 1.1 from the IDEA209H Unit 2 chat (Shop Trophy
  inspection and FRC5669 training documents), refused at ledger 0299's audit. The number
  1.1 was used twice; only the landed one is the 1.1 of record. Merged by content on the
  landed base: adds to section 7 probe arrays over a single observer and the probe count
  formula; adds to section 10 the parent's echo of `idea:state` after every change and the
  three rules from the 2026-09-23 lost-spaces defect; adds step 7 to section 11, an
  echoing harness typing multi-word text; adds section 11b, media and the 2 MB cap.
  Nothing in the landed 1.1 was removed or reworded.

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
