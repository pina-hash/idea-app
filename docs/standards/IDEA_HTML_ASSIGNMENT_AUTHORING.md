# IDEA HTML Assignment Authoring Standard
**Version 1.19 - 2026-10-08**

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
- **Arrival is derived from the saved answers.** A fresh student sees every move open. A
  returning student sees done moves closed and the rest open. Read-only (the grading view)
  opens everything. An optional move opens only when it has something in it.
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
  new stage. Open all, Close all, the stage chip and the stage-done banner act per stage,
  never on the whole document, and the interaction test pins that one stage's Close all
  leaves the other alone. Re-upload over the same post: the rubric regenerates for the new
  module and every stored answer still renders.

- **One long video, many steps: embed it once per move and give each step a time key.**
  The portal plays a YouTube id and takes no start time, so a chaptered walkthrough cannot
  jump inside the frame. Each step carries a 44px key labeled with its chapter time that
  opens `https://www.youtube.com/watch?v=<id>&t=<seconds>s` in a new tab through the same
  `window.open` path as every other outside link. Steps follow the chapter order, and a
  step shared with an earlier chapter carries no second key.

---

## Changelog

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
