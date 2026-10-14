# IDEA HTML Assignment Brief
**Version 1.0 - 2026-10-14**

The one file to give a Claude chat that builds an HTML assignment for IDEA Classroom, the
class portal Mr. Pina (owner) runs for the IDEA pathway at Bosco Tech. With only this file, a
chat can build a document that works on its first upload: it saves every answer through the
portal, restores on reload, hands in pictures and files, lets the portal draw stored
pictures, videos and teacher notes in place, follows the site's light and dark themes, fits
every width, passes both validators, and grades against a rubric generated from it.

Home: `docs/standards/IDEA_HTML_ASSIGNMENT_BRIEF.md` in `pina-hash/idea-app`, condensed from
the authoring standard 1.24, the subsystem specification 1.8, the HTML design directions and
the template beside it. Where this brief and the portal disagree, the portal is right; say
so in your delivery.

**How to use it.** Read it once, top to bottom, then build in order: the manifest (3), the
markup (5), the code (6), the look (7), the work (8), the checks (10). **Copy the code in
section 6 as written**: all of it was run on 2026-10-14 in Chromium inside the real sandbox,
against the portal's own message gate, with a parent echoing stale state the way the portal
does. **Never assume a fact about the lab, the class or the schedule** (which printer, which
nozzle, where tools live, what was taught): ask Mr. Pina. Every rule here was paid for by a
document that shipped wrong.

---

## 1. What you are building

**One self-contained HTML file**: markup, styles, script, fonts, pictures and the manifest,
all inline. Mr. Pina uploads it to an assignment post; the portal stores it byte for byte and
serves it to every student inside a sandboxed `<iframe>` with no same-origin grant, so it runs
in an opaque origin: no storage, no cookies, no network, no reach into the page around it. The
only way out is `parent.postMessage`, and only the messages in section 4 count.

**The portal owns everything that records anything**: every save and upload, the
completeness check, Submit and turn-in, the rubric and grading, stored pictures and files,
the video player and the teacher's notes. Your document is the work surface: it shows the
questions, takes the answers, reports each one, and says where things sit so the portal can
draw over them.

**The manifest makes it gradeable.** A JSON block in the document declares the modules,
every answer box (a "block") and the rubric. At import the portal stores it, generates the
rubric from it, and maps every answer the document reports to a stored row through it.

**A guide is not a second item.** A zero-point document is refused, so a reference guide
folds into the assignment it serves as collapsed sections marked not graded. One post, one
file.

---

## 2. The sandbox: what works and what does not

The served policy, exactly:

```
sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads;
default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';
img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none';
frame-ancestors <the portal>
```

| Works | Notes |
|---|---|
| Inline `<script>`, inline `<style>`, `style=""` | With no `src` or `href` to any host. |
| Pictures as `data:` or `blob:` URLs, inline `<svg>` | Draw icons as SVG; a `▶` glyph rendered as a missing-glyph box. |
| Fonts as `data:` URLs in `@font-face` | Section 7.6. |
| `window.open(url, '_blank')`, `<a target="_blank">` | An ordinary, unsandboxed tab. Never `noopener` (8.4). |
| A download from a `data:` or `blob:` link | Fires. Never a way to save or hand in. |
| Copy with `document.execCommand('copy')` on a selected text area | Measured. `navigator.clipboard` is blocked. |
| Paste events carrying a picture; canvas; SVG; CSS animation; `IntersectionObserver`; `ResizeObserver` | Ordinary browser features. |
| `element.scrollIntoView()` | Scrolls the portal page from inside the frame. |
| A YouTube video | Only through `idea:video` (6.5). |

| Does not work | What happens | Do instead |
|---|---|---|
| `localStorage`, `sessionStorage`, `indexedDB`, `document.cookie` | **Throws `SecurityError`** (measured): a copied autosave kills the page before it renders. | Save through the bridge; keep visit-only state in variables. |
| `fetch`, XHR, WebSocket, EventSource, `sendBeacon` | Refused. | Nothing leaves but `postMessage`. |
| Any file from a host: script, stylesheet, `@import`, font host, `<img src="https://...">`, `<iframe>` | Refused. | Inline it. |
| `<audio>`, `<video>`, even from `data:` | Refused (measured). | YouTube through `idea:video`; no sound files. |
| Web workers | Refused (measured). | The main thread. |
| `alert`, `confirm`, `prompt`, `print` | Ignored; **`confirm()` returns `false`**, so "Are you sure?" silently cancels (measured). | A two-step inline confirm; no Print button. |
| Submitting a `<form>` | Refused. | No `<form>`; plain inputs and `type="button"` buttons. |
| Navigating the top page | Throws or does nothing. | A new tab. |
| `<base href>` | Loads nothing, and turns every `#anchor` into a navigation away. | Never use it. |
| `position: sticky` | Never sticks: the frame is as tall as the document. | 7.3. |
| Camera, microphone, location, the Clipboard API | Blocked. | A photo upload; `execCommand('copy')`. |
| Showing a stored picture yourself | Its URL cannot load in the sandbox. | Hold a box open; the portal draws it (6.3). |

---

## 3. The manifest

It sits in the `<head>`, exactly once, as valid JSON (no comments, no trailing commas; write
any `<` inside a string as `\u003c`):

```html
<script type="application/json" id="idea-manifest"> { ...JSON... } </script>
```

### 3.1 Keys

| Where | Key | Rule |
|---|---|---|
| top | `schemaVersion`, `kind` | `3` and `"html-assignment"`. |
| top | `title`, `course` | Non-empty; `course` is the code, e.g. `"IDEA100"`. |
| top | `points` | Whole, 0 to 10000, equal to the modules' points summed. |
| top | `header` | Optional blocks for identity (name, team): no points, never graded, never count toward completion. |
| top | `modules` | 1 to 40, with at most 400 blocks across the whole manifest. |
| module | `id`, `title` | Id per 3.3, unique; title non-empty. |
| module | `points` | Whole, equal to its criteria's top levels summed. |
| module | `audience` | Optional `"team"` or `"individual"`. |
| module | `blocks`, `criteria` | The answer boxes, and the rubric (3.4, non-empty). |
| block | `id` | **Permanent** (3.3); unique across the manifest, header included. |
| block | `field` | The box's `data-field` attribute; unique; renameable. |
| block | `type` | One of the six in 3.2. |
| block | `minSentences` | Optional whole 0 to 100, on `text` or `longText`; the completeness check counts sentences against it. |
| block | `optional` | `true` or `false` (anything else is refused). Optional blocks show met or not and never hold back completion. |
| block | `prompt` | The question as a grader reads it; heads the block's CSV column and answer lists. Give every block one (500 characters shown). |
| block | `link` | `"presentation"`, on a `text` block: a share link the student hands in (9.4). |

### 3.2 Block types

| `type` | Element carrying `data-field` | Value sent | Answered when |
|---|---|---|---|
| `text` | `<input type="text">` | The string exactly as typed | It holds a non-space character |
| `longText` | `<textarea>` | The string exactly as typed | The same, with `minSentences` sentences |
| `radio` | The `<fieldset data-kind="radio">` around the radios | The chosen radio's `value`, or `""` | Non-empty |
| `checkbox` | `<input type="checkbox">` | `true` or `false` | Any stored `true` or `false`; an untouched box has none |
| `table` | The `<div data-kind="table">` around the table | The whole table as one JSON string of rows, on any cell change | Any cell holds something |
| `image` | A hidden `<input type="file">` | Nothing: the file goes up as `idea:image` | A file is stored (any type, not only pictures) |

**Every `data-field` is declared and every declared field has exactly one element**; both
mismatches are refused (an undeclared box drops what is typed in it; a declared one with no
box can never be answered). A table has ONE `data-field` on its wrapper, never one per cell,
and nothing creates a `data-field` at run time.

### 3.3 Ids, and why a block id is permanent

Module, block and criterion ids match `^[A-Za-z0-9_-]{1,40}$`: no dots, no spaces. **A block
id is the key every stored answer hangs on.** Renaming one after a student answered orphans
that work silently: no error, the answer just stops showing. Choose meaningful ids on the
first draft (`blade-plan-why`, not `q3` or `c1`) and never tidy them. The `field` never
leaves the document and can be renamed freely. Adding blocks later is safe.

### 3.4 The rubric

The portal generates the rubric from the manifest at import and at every re-upload, until a
teacher edits it by hand; after that, uploads leave it alone. Never build one by hand.

- **Three or four levels, never two** (two is a checkbox, or merge it into another
  criterion). **Whole points, strictly descending, top equal to the criterion's `points`,
  bottom 0**, so three levels need at least 2 points and four need at least 3. A 1-point
  criterion cannot be written.
- **Every level has a `label`, a `short` and a `descriptor`.** `short` is printed on the
  grading button: six words at most, no closing `.`, `!` or `?`, naming the same countable
  thing as the descriptor, which settles disputes and is what a student reads.
- One label family per assignment: `Complete / Proficient / Developing / Absent` (three
  levels drop one), never mixed with `Excellent / Good / Fair / None`. Write the top level
  first, then each lower one by what is missing; neighbors differ by something checkable.
- Criterion ids are unique within their module. Criterion to top level, criteria to module,
  modules to total: each sum is checked, and a mismatch is refused.
- No weekday names, no British spellings (`colour`, `centre`, `licence`...) and no em dash
  anywhere in the manifest.

### 3.5 A complete manifest

The manifest of the example section 6 was tested against:

```json
{
  "schemaVersion": 3, "kind": "html-assignment",
  "title": "Blade Check", "course": "IDEA100", "points": 20,
  "header": [
    {"id": "id-name", "field": "studentName", "type": "text", "prompt": "Your name"}
  ],
  "modules": [
    {
      "id": "blade-plan", "title": "Plan the blade", "points": 10, "audience": "individual",
      "blocks": [
        {"id": "blade-plan-stock", "field": "stock", "type": "radio", "prompt": "Which stock will you cut the blade from?"},
        {"id": "blade-plan-why", "field": "why", "type": "longText", "minSentences": 2, "prompt": "Why that stock? Name one thing you gave up for it."},
        {"id": "blade-plan-mass", "field": "mass", "type": "text", "prompt": "Predicted blade mass, in grams"}
      ],
      "criteria": [
        {
          "id": "plan-choice", "text": "The stock choice is explained with a real trade-off", "points": 6,
          "levels": [
            {"points": 6, "label": "Complete", "short": "Choice and trade-off both named", "descriptor": "Names the stock and one specific thing given up for it, such as weight for stiffness."},
            {"points": 4, "label": "Proficient", "short": "Trade-off named but vague", "descriptor": "Names the stock and gestures at a trade-off without saying what was given up."},
            {"points": 2, "label": "Developing", "short": "Choice with no trade-off", "descriptor": "Names the stock with no reason, or a reason that is not a trade-off."},
            {"points": 0, "label": "Absent", "short": "No choice made", "descriptor": "No stock chosen, or the answer is blank."}
          ]
        },
        {
          "id": "plan-mass", "text": "The mass prediction is a number with a unit", "points": 4,
          "levels": [
            {"points": 4, "label": "Complete", "short": "Number in grams", "descriptor": "A single number in grams."},
            {"points": 2, "label": "Developing", "short": "Number, no unit", "descriptor": "A number with no unit, or a range."},
            {"points": 0, "label": "Absent", "short": "No number", "descriptor": "No number given."}
          ]
        }
      ]
    },
    {
      "id": "blade-build", "title": "Build and record", "points": 10, "audience": "individual",
      "blocks": [
        {"id": "blade-build-cuts", "field": "cuts", "type": "table", "prompt": "Cut log: each cut, its tool and its length"},
        {"id": "blade-build-photo", "field": "photo", "type": "image", "prompt": "Photo of the finished blade"},
        {"id": "blade-build-photo-2", "field": "photo2", "type": "image", "optional": true, "prompt": "A second photo, if you have one"},
        {"id": "blade-build-deck", "field": "deckLink", "type": "text", "link": "presentation", "prompt": "Share link to your one-slide summary"},
        {"id": "blade-build-scrap", "field": "scrap", "type": "checkbox", "prompt": "Offcuts are in the scrap bin"}
      ],
      "criteria": [
        {
          "id": "build-log", "text": "The cut log matches the blade in the photo", "points": 6,
          "levels": [
            {"points": 6, "label": "Complete", "short": "Every cut logged and visible", "descriptor": "Every cut in the photo has a row, with its tool and length."},
            {"points": 4, "label": "Proficient", "short": "One cut missing", "descriptor": "One cut in the photo has no row, or one row has no length."},
            {"points": 2, "label": "Developing", "short": "Several cuts missing", "descriptor": "Two or more cuts are missing or unreadable."},
            {"points": 0, "label": "Absent", "short": "No log or photo", "descriptor": "The log or the photo is missing."}
          ]
        },
        {
          "id": "build-summary", "text": "The summary slide opens and shows the blade", "points": 4,
          "levels": [
            {"points": 4, "label": "Complete", "short": "Opens, shows the blade", "descriptor": "The link opens for the teacher and the slide shows the finished blade."},
            {"points": 2, "label": "Developing", "short": "Opens, blade missing", "descriptor": "The link opens but the slide does not show the blade."},
            {"points": 0, "label": "Absent", "short": "No working link", "descriptor": "No link, or a link nobody but the student can open."}
          ]
        }
      ]
    }
  ]
}
```

---

## 4. The bridge: every message, both directions

### 4.1 Document to portal

| Message | Shape | Send it |
|---|---|---|
| `idea:ready` | `{ type, schemaVersion: 3 }` | **Once**, after your listener is attached and the page is built. A second one makes the portal forget every box. |
| `idea:change` | `{ type, field, value }`; a string or a boolean | On every edit, the value exactly as it stands. |
| `idea:image` | `{ type, field, name, bytes }` | A file added to an empty slot. `bytes` is base64 or the `data:` URL from `FileReader.readAsDataURL`; `name` keeps its extension. |
| `idea:image-remove` | `{ type, field }` | The student removes the stored file. |
| `idea:image-caption` | `{ type, field, caption }` | Once the file is stored; over 500 characters is dropped. |
| `idea:height` | `{ type, px }` | Whenever the page height changes; positive, at most 40000. |
| `idea:video` | `{ type, videoId, rect, clipTop?, start? }` | On Play, and again with the same id and start whenever the box moves; `videoId: null` stops it. The id is YouTube's 11 characters; `start` is whole seconds. |
| `idea:image-box` | `{ type, field, rect, clipTop? }` | For every image field, after every state, fold, stage change and resize; `rect: null` while the box is hidden. |
| `idea:field-box` | `{ type, field, rect, clipTop? }` | For each field named in `idea:feedback`, after the same events; `rect: null` withdraws it. |

### 4.2 Portal to document

| Message | Shape | Arrives |
|---|---|---|
| `idea:state` | `{ type, values, images, readOnly }` | Right after `idea:ready`, then after every change, upload, removal and caption (the echo, 4.3), and when read-only flips. `values`: field to string or boolean. `images`: field to `{ url, name, caption }`. |
| `idea:saved` | `{ type, at, ok, schemaVersion: 3, reason? }` | After a save lands or fails. `at` is an ISO time; `reason`, only when `ok` is false, is a sentence to show. |
| `idea:theme` | `{ type, theme }`: `'light'` or `'dark'` | After the first state, and whenever the site's theme changes. |
| `idea:video-state` | `{ type, videoId, open }` | When the portal opens or closes a player. |
| `idea:image-box-state` | `{ type, field, shown }` | When it starts or stops drawing a stored file over a box. |
| `idea:feedback` | `{ type, fields }` | The fields with an open teacher note, sorted, no repeats: after the first state on a page that shows notes, and whenever the set changes. Never a note's words. |

### 4.3 The rules that make it work

1. **Name a `field`, never a block id.** The portal maps field to block through its stored
   manifest; an undeclared field, or a block id in the field slot, is dropped without a
   word to you.
2. **Post with `'*'`; accept only `e.source === parent`.** The portal sees your messages
   as coming from the origin `"null"` (opaque), so the source check is what identifies the
   portal. Never compare origins.
3. **The echo can be stale.** An echo can carry a value from before the last keystroke, so:
   never trim or normalize a value you send (a trimmed echo landing mid-word saved
   "Charontwoslotedges" for real students); a field the student touched this visit belongs
   to the document and no echo overwrites it; skip a field whose value already matches;
   keep an uploading slot out of an echo's reach; never reset your own chrome (a "Saved
   2:37" pill) on an echo. Trim only to judge a value, never to store it.
4. **Acknowledgements cannot be paired with writes**: text saves are debounced (800 ms) and
   coalesced. A file is handed in when its field appears in `images`.
5. **Bytes go up only.** A stored file comes back as a URL the sandbox cannot load: show
   "Saved: name" and let the portal draw it.
6. **`readOnly: true`** comes for a closed assignment, a submitted or returned hand-in, and a
   teacher reading the work. Disable every input carrying or inside a `data-field` and every
   control that would change one; anything without a `data-field` stays live, so a
   calculator still works after the assignment closes.
7. **Never wait on an advisory message.** `idea:theme`, `idea:video-state`,
   `idea:image-box-state` and `idea:feedback` may never come (an older portal, a page with
   no notes). Keep a fallback for each.
8. **A box is four numbers in the document's CSS pixels from its top-left, scroll
   included**: `x`, `y` at least 0; `w`, `h` above 0; `x + w` at most 8000; `y + h` at most
   40000. `clipTop` is the pixels of the box's top your own following header covers (absent
   is 0, capped at `h`). A box breaking these is dropped.
9. **Only the document sees its layout move, so only the document re-sends.** A scroll of
   the portal page moves the frame and its overlays together; a fold above a box, a stage
   change or a resize moves the box inside the document. The code calls this
   `hxQueueLayout()`.

### 4.4 Teacher notes (progressive feedback)

A teacher can leave notes on a worksheet while the student works: on the whole worksheet or
one block, optionally with a drawing over one of the student's stored pictures. The student
sees them live, replies and presses Fixed it; each side sees when the other has seen a note;
the teacher works every note from one inbox. **All of that conversation is the portal's,
beside the worksheet, never inside it**, for the reason Submit is: a button inside the
document is a handler the document wrote.

**Your part is saying where each answer sits.** The portal names the fields with an open
note in `idea:feedback`; the reporter in 6.4 answers with `idea:field-box` for each, and the
portal draws a worded 44px pin ("Note", "2 notes", "New note") beside that box's top-right
corner, inside the frame. Pressing it opens the note in the list beside the worksheet. A
field whose notes are all resolved has no pin. An image field uses its picture box if no
field box arrives, and the teacher's drawing is laid over the stored picture wherever the
portal draws it. You may mark the named fields yourself; never wait for the message. A
document without the reporter still works: every note is in the list.

---

## 5. The markup, one pattern per block type

Wrap the page in `<main id="hx-page">`; the height reporter measures it. The example's body,
one of every block type:

```html
<main id="hx-page">
  <header class="card">
    <h1>Blade Check</h1>
    <p class="muted">Plan your blade, cut it, and show it. Two sentences in the whole thing.</p>
    <button type="button" class="key" id="theme-key">Light</button>
    <p class="status" id="hx-save" role="status">Saves as you type</p>
    <label>Your name
      <input type="text" data-field="studentName" autocomplete="off">
    </label>
  </header>

  <section class="card" id="plan">
    <h2>1 Plan the blade</h2>
    <div class="grid">
      <div>
        <fieldset data-field="stock" data-kind="radio">
          <legend>Which stock will you cut the blade from?</legend>
          <label class="pick"><input type="radio" name="stock" value="birch-ply"> Birch ply, 3 mm</label>
          <label class="pick"><input type="radio" name="stock" value="acrylic"> Acrylic, 3 mm</label>
          <label class="pick"><input type="radio" name="stock" value="aluminum"> Aluminum, 1.6 mm</label>
        </fieldset>
        <label>Predicted blade mass, in grams
          <input type="text" data-field="mass" inputmode="decimal" placeholder="e.g. 42">
        </label>
      </div>
      <div>
        <label>Why that stock? Name one thing you gave up for it.
          <textarea data-field="why" placeholder="I picked it because ... but it costs ..."></textarea>
        </label>
        <p class="chip" data-count-for="why" data-min="2">0 of 2 sentences</p>
      </div>
    </div>
  </section>

  <section class="card" id="build">
    <h2>2 Build and record</h2>
    <div data-field="cuts" data-kind="table">
      <table class="cut-table">
        <thead><tr><th>Cut</th><th>Tool</th><th>Length (mm)</th></tr></thead>
        <tbody>
          <tr>
            <td data-label="Cut"><input type="text" aria-label="Cut"></td>
            <td data-label="Tool"><input type="text" aria-label="Tool"></td>
            <td data-label="Length (mm)"><input type="text" aria-label="Length in mm" inputmode="decimal"></td>
          </tr>
        </tbody>
      </table>
      <button type="button" class="key" data-edits data-add-row="cuts">Add a row</button>
    </div>

    <div class="grid">
      <div>
        <p>Photo of the finished blade</p>
        <div class="box" data-image-box="photo" data-empty="No photo yet. Paste one here or press Choose photo.">No photo yet. Paste one here or press Choose photo.</div>
        <input type="file" data-field="photo" accept="image/*" hidden>
        <button type="button" class="key" data-edits data-choose="photo">Choose photo</button>
        <button type="button" class="key" data-edits data-remove="photo" hidden>Remove</button>
        <label>Caption <input type="text" data-edits data-caption-for="photo" maxlength="500"></label>
        <p class="status" data-file-note="photo"></p>
      </div>
      <div>
        <p>A second photo, if you have one <span class="chip">Optional</span></p>
        <div class="box" data-image-box="photo2" data-empty="No photo yet. Paste one here or press Choose photo.">No photo yet. Paste one here or press Choose photo.</div>
        <input type="file" data-field="photo2" accept="image/*" hidden>
        <button type="button" class="key" data-edits data-choose="photo2">Choose photo</button>
        <button type="button" class="key" data-edits data-remove="photo2" hidden>Remove</button>
        <p class="status" data-file-note="photo2"></p>
      </div>
    </div>

    <label>Share link to your one-slide summary (anyone at school can open it)
      <input type="text" data-field="deckLink" placeholder="https://docs.google.com/presentation/...">
    </label>
    <label class="pick"><input type="checkbox" data-field="scrap"> Offcuts are in the scrap bin</label>
  </section>
</main>
```

- `data-edits` marks a control that changes an answer without being one (Choose, Remove, a
  caption, Add a row); read-only disables it.
- `data-image-box="<field>"` is where a stored file is drawn; `data-empty` is its empty
  words; `data-file-note="<field>"` shows upload messages.
- A caption carries `data-caption-for="<field>"` and **no** `data-field`: it is stored with
  the file, not as a block.
- `data-ext=".sldprt"` (or `".sldprt,.step"`) on a file input refuses other extensions.

---

## 6. The code to copy

One `<script>` at the end of `<body>`, in this order: 6.1, 6.2, 6.3, 6.4, 6.5 (only with a
video), then the page's own code ending with `hxStart()` (6.6). They share one `send`.

### 6.1 The bridge client

Seeds every `[data-field]` from `idea:state` without overwriting a field the student
touched; sends every edit untrimmed; handles radios, checkboxes and tables; applies
read-only; shows the save state in `#hx-save`; follows `idea:theme`; reports the height; and
re-sends every box after a layout change.

```js
/* ===== IDEA bridge client. Copy as is. ===== */
var HX = {
  ready: false, seeded: false, readOnly: false,
  values: {},   // the last values the portal sent, by field
  images: {},   // the last stored files the portal sent: field -> { url, name, caption }
  owned: {},    // fields the student changed this visit: no echo overwrites them
  sent: {},     // the last value sent for each field
  theme: null,  // 'light' or 'dark' from the page's own key, for this visit only
  onState: [],  // fn(message, isFirstSeed) after every idea:state
  onSaved: []   // fn(message) after every idea:saved
};
function send(msg) { parent.postMessage(msg, '*'); }
function hxRoots() { return Array.prototype.slice.call(document.querySelectorAll('[data-field]')); }
function hxRoot(field) { return document.querySelector('[data-field="' + CSS.escape(field) + '"]'); }
function hxKind(el) {
  if (el.dataset.kind) return el.dataset.kind;   // 'radio' or 'table'
  if (el.type === 'checkbox') return 'checkbox';
  if (el.type === 'file') return 'image';
  return 'text';                                  // text input or textarea
}
function hxCells(row) { return row.querySelectorAll('input, textarea, select'); }
function hxRead(root) {
  var kind = hxKind(root);
  if (kind === 'checkbox') return root.checked;
  if (kind === 'radio') {
    var on = root.querySelector('input[type="radio"]:checked');
    return on ? on.value : '';
  }
  if (kind === 'table') {
    return JSON.stringify(Array.prototype.map.call(root.querySelectorAll('tbody tr'), function (tr) {
      return Array.prototype.map.call(hxCells(tr), function (c) { return c.value; });
    }));
  }
  return root.value;
}
function hxAddRow(root) {
  var body = root.querySelector('tbody');
  var row = body.rows[0].cloneNode(true);
  Array.prototype.forEach.call(hxCells(row), function (c) { c.value = ''; });
  body.appendChild(row);
}
function hxWrite(root, value) {
  var kind = hxKind(root);
  if (kind === 'image') return;
  if (kind === 'checkbox') { root.checked = value === true; return; }
  if (kind === 'radio') {
    root.querySelectorAll('input[type="radio"]').forEach(function (r) { r.checked = r.value === value; });
    return;
  }
  if (kind === 'table') {
    var rows;
    try { rows = JSON.parse(value); } catch (e) { return; }
    if (!Array.isArray(rows)) return;
    var body = root.querySelector('tbody');
    while (body.rows.length < rows.length) hxAddRow(root);
    Array.prototype.forEach.call(body.rows, function (tr, i) {
      Array.prototype.forEach.call(hxCells(tr), function (c, j) {
        var cell = rows[i] && rows[i][j];
        c.value = cell == null ? '' : String(cell);
      });
    });
    return;
  }
  root.value = typeof value === 'string' ? value : String(value);
}
/* A student edit: send the value exactly as it stands. Never trim it. */
function hxEdited(root) {
  if (HX.readOnly || hxKind(root) === 'image') return;
  var field = root.dataset.field;
  var value = hxRead(root);
  if (HX.sent[field] === value) return;
  HX.sent[field] = value;
  HX.owned[field] = true;
  send({ type: 'idea:change', field: field, value: value });
}
function hxOnEdit(e) {
  var root = e.target && e.target.closest ? e.target.closest('[data-field]') : null;
  if (root) hxEdited(root);
}
addEventListener('input', hxOnEdit);
addEventListener('change', hxOnEdit);
/* "Add a row" on a table: <button type="button" data-add-row="<field>" data-edits>. */
document.addEventListener('click', function (e) {
  var add = e.target.closest ? e.target.closest('[data-add-row]') : null;
  var root = add ? hxRoot(add.dataset.addRow) : null;
  if (!root || HX.readOnly) return;
  hxAddRow(root);
  hxEdited(root);
  hxQueueLayout();
});
function hxSetReadOnly(ro) {
  HX.readOnly = ro;
  document.documentElement.classList.toggle('is-readonly', ro);
  document.querySelectorAll('[data-field], [data-field] input, [data-field] textarea, ' +
    '[data-field] select, [data-field] button, [data-edits]').forEach(function (el) { el.disabled = ro; });
}
function hxApplyState(d) {
  var first = !HX.seeded;
  HX.seeded = true;
  HX.values = d.values || {};
  HX.images = d.images || {};
  hxRoots().forEach(function (root) {
    var field = root.dataset.field;
    if (HX.owned[field] || !Object.prototype.hasOwnProperty.call(HX.values, field)) return;
    var value = HX.values[field];
    if (hxRead(root) === value) return;
    hxWrite(root, value);
    HX.sent[field] = value;
  });
  var ro = d.readOnly === true;
  if (first || ro !== HX.readOnly) hxSetReadOnly(ro);
  HX.onState.forEach(function (fn) { fn(d, first); });
  hxQueueLayout();
}
function hxSetTheme(theme) { document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark'; }
function hxOnSaved(d) {
  var pill = document.getElementById('hx-save');
  var at = new Date(d.at);
  if (pill) {
    pill.textContent = d.ok
      ? 'Saved ' + (isNaN(at) ? '' : at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))
      : 'Not saved: ' + (d.reason || 'try again.');
    pill.classList.toggle('failed', !d.ok);
  }
  HX.onSaved.forEach(function (fn) { fn(d); });
}
addEventListener('message', function (e) {
  if (e.source !== parent) return;
  var d = e.data;
  if (!d || typeof d !== 'object') return;
  if (d.type === 'idea:state') hxApplyState(d);
  else if (d.type === 'idea:saved') hxOnSaved(d);
  else if (d.type === 'idea:theme' && !HX.theme) hxSetTheme(d.theme);
});
/* Height: the frame is exactly this tall. Measure the page wrapper, never
   documentElement.scrollHeight (it never drops below the frame's own height). */
var hxPage = document.getElementById('hx-page');
var hxLastHeight = 0;
var hxLayoutTimer = 0;
function hxReportHeight() {
  var px = Math.ceil(hxPage.getBoundingClientRect().height) + 2;
  if (px === hxLastHeight) return;
  hxLastHeight = px;
  send({ type: 'idea:height', px: px });
}
/* Call after anything that moves the layout: a fold, a stage change, a new row. */
function hxQueueLayout() {
  clearTimeout(hxLayoutTimer);
  hxLayoutTimer = setTimeout(function () {
    hxReportHeight();
    if (typeof sendImageBoxes === 'function') sendImageBoxes();
    if (typeof reportFieldBoxes === 'function') reportFieldBoxes();
    if (typeof hxMoveVideo === 'function') hxMoveVideo();
  }, 60);
}
new ResizeObserver(hxQueueLayout).observe(hxPage);
addEventListener('resize', hxQueueLayout);
function hxStart() {
  if (HX.ready) return;
  HX.ready = true;
  send({ type: 'idea:ready', schemaVersion: 3 });
  hxQueueLayout();
}
/* ===== end of the bridge client ===== */
```

From your own code: call `hxQueueLayout()` after a fold, a stage change or a revealed panel;
call `hxEdited(root)` after your code fills a field (a starter sentence the student asked
for; never over their writing); push a function onto `HX.onState` to recompute anything
derived from answers (a counter, a verdict), or a restored page shows answers beside blank
verdicts; push onto `HX.onSaved` to react to a save.

### 6.2 Pictures and files

Choose or paste, one upload at a time, a 45-second give-up, remove, caption, and the wrong
extension refused in words. The box shows the student's picture from its own bytes while it
uploads, then "Saved: name", which the portal covers with the stored copy.

```js
/* ===== Pictures and files: choose, paste, remove, caption. Copy as is. ===== */
var HX_MAX_FILE = 50 * 1024 * 1024;
HX.pending = null;   // { field, timer } while the one upload in flight is unanswered
HX.removing = {};    // field -> true until the portal's state no longer lists it
HX.lastBox = null;   // the image field the student last touched, for paste
function hxEl(attr, field) { return document.querySelector('[' + attr + '="' + CSS.escape(field) + '"]'); }
function hxNote(field, text, failed) {
  var el = hxEl('data-file-note', field);
  if (el) { el.textContent = text; el.classList.toggle('failed', !!failed); }
}
function hxDrawBox(field, text, src) {
  var box = hxEl('data-image-box', field);
  if (!box) return;
  box.textContent = '';
  if (src) { var img = new Image(); img.alt = text; img.src = src; box.appendChild(img); }
  else box.appendChild(document.createTextNode(text));
}
function hxEmptyText(field) {
  var box = hxEl('data-image-box', field);
  return (box && box.getAttribute('data-empty')) || 'Nothing here yet';
}
/* After every idea:state: a file is handed in when its field appears in images. */
HX.onState.push(function () {
  document.querySelectorAll('input[type="file"][data-field]').forEach(function (input) {
    var field = input.dataset.field;
    var stored = HX.images[field];
    var cap = hxEl('data-caption-for', field);
    if (HX.pending && HX.pending.field === field) {
      if (!stored) return;                       // an echo from before the upload landed
      clearTimeout(HX.pending.timer);
      HX.pending = null;
      hxNote(field, 'Handed in.', false);
      if (cap && cap.value) send({ type: 'idea:image-caption', field: field, caption: cap.value });
    }
    if (HX.removing[field]) {
      if (stored) return;
      delete HX.removing[field];
      hxNote(field, 'Removed.', false);
    }
    hxDrawBox(field, stored ? 'Saved: ' + stored.name : hxEmptyText(field));
    var remove = hxEl('data-remove', field);
    if (remove) remove.hidden = !stored;
    if (cap && !HX.owned['caption:' + field]) cap.value = stored ? stored.caption : '';
  });
});
/* A failed save while a file is uploading or being removed is shown on that file. */
HX.onSaved.push(function (d) {
  if (d.ok) return;
  if (HX.pending) {
    var field = HX.pending.field;
    clearTimeout(HX.pending.timer);
    HX.pending = null;
    hxNote(field, 'Not handed in: ' + (d.reason || 'try again.'), true);
    hxDrawBox(field, hxEmptyText(field));
  }
  Object.keys(HX.removing).forEach(function (f) {
    delete HX.removing[f];
    hxNote(f, 'Not removed: ' + (d.reason || 'try again.'), true);
  });
});
function hxAttach(field, file) {
  if (HX.readOnly) return;
  if (HX.pending) return hxNote(field, 'One file at a time. Wait for the last one to finish.', true);
  if (HX.images[field]) return hxNote(field, 'Remove the file that is here first, then add the new one.', true);
  var input = hxRoot(field);
  var ext = ((file.name.match(/\.[^.]+$/) || [''])[0]).toLowerCase();
  var allowed = ((input && input.dataset.ext) || '').toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (allowed.length && allowed.indexOf(ext) < 0) {
    return hxNote(field, 'This box takes a ' + allowed.join(' or ') + ' file. That one is ' +
      (ext || 'a file with no extension') + '.', true);
  }
  if (file.size > HX_MAX_FILE) {
    return hxNote(field, 'That file is ' + Math.ceil(file.size / 1048576) + ' MB. The limit is 50 MB.', true);
  }
  var reader = new FileReader();
  reader.onerror = function () { hxNote(field, 'That file could not be read. Choose it again.', true); };
  reader.onload = function () {
    HX.pending = { field: field, timer: setTimeout(function () {
      HX.pending = null;
      hxNote(field, 'No answer from Classroom after 45 seconds. Check the connection and add it again.', true);
      hxDrawBox(field, hxEmptyText(field));
    }, 45000) };
    hxNote(field, 'Uploading ' + file.name, false);
    if (/^image\//.test(file.type)) hxDrawBox(field, file.name, reader.result);
    else hxDrawBox(field, 'Uploading ' + file.name);
    send({ type: 'idea:image', field: field, name: file.name, bytes: reader.result });
  };
  reader.readAsDataURL(file);
}
function hxRemove(field) {
  if (HX.readOnly || !HX.images[field] || HX.removing[field]) return;
  HX.removing[field] = true;
  hxNote(field, 'Removing', false);
  send({ type: 'idea:image-remove', field: field });
}
document.addEventListener('change', function (e) {
  var input = e.target;
  if (!input || input.type !== 'file' || !input.dataset.field) return;
  var file = input.files && input.files[0];
  input.value = '';
  if (file) hxAttach(input.dataset.field, file);
});
document.addEventListener('click', function (e) {
  var t = e.target.closest ? e.target.closest('[data-choose], [data-remove], [data-image-box]') : null;
  if (!t) return;
  if (t.dataset.choose) {
    HX.lastBox = t.dataset.choose;
    var input = hxRoot(t.dataset.choose);
    if (input && !HX.readOnly) input.click();
  } else if (t.dataset.remove) hxRemove(t.dataset.remove);
  else HX.lastBox = t.getAttribute('data-image-box');
});
var hxCaptionTimers = {};
document.addEventListener('input', function (e) {
  var cap = e.target.closest ? e.target.closest('[data-caption-for]') : null;
  if (!cap || HX.readOnly) return;
  var field = cap.dataset.captionFor;
  HX.owned['caption:' + field] = true;
  clearTimeout(hxCaptionTimers[field]);
  hxCaptionTimers[field] = setTimeout(function () {
    if (HX.images[field]) send({ type: 'idea:image-caption', field: field, caption: cap.value });
  }, 600);
});
document.addEventListener('focusin', function (e) {
  var slot = e.target.closest ? e.target.closest('[data-choose], [data-caption-for]') : null;
  if (slot) HX.lastBox = slot.dataset.choose || slot.dataset.captionFor;
  else if (e.target.closest && e.target.closest('[data-field]')) HX.lastBox = null;
});
/* A pasted picture goes to the slot last touched while it is empty and visible, else the first. */
function hxPasteTarget() {
  var open = Array.prototype.filter.call(document.querySelectorAll('[data-image-box]'), function (box) {
    var field = box.getAttribute('data-image-box');
    var input = hxRoot(field);
    return box.getClientRects().length > 0 && !box.closest('details:not([open])') &&
      !HX.images[field] && !(input && input.dataset.ext);
  }).map(function (box) { return box.getAttribute('data-image-box'); });
  return HX.lastBox && open.indexOf(HX.lastBox) >= 0 ? HX.lastBox : open[0] || null;
}
document.addEventListener('paste', function (e) {
  if (HX.readOnly) return;
  var files = (e.clipboardData && e.clipboardData.files) || [];
  var file = Array.prototype.filter.call(files, function (f) { return /^image\//.test(f.type); })[0];
  var field = file && hxPasteTarget();
  if (!field) return;
  e.preventDefault();
  hxAttach(field, file);
});
```

### 6.3 The picture-box reporter

Tells the portal where each `[data-image-box]` is, so it draws the stored picture (or a file
tile with a Download) there, opening a zoomable viewer on a click. `null` while the box is
hidden or in a closed `<details>`, which moves the picture to the list under the frame.

```js
/* ===== Picture-box reporter: where each stored picture should be drawn. ===== */
var HX_BOX_SENT = {};
function sendImageBoxes() {
  document.querySelectorAll('[data-image-box]').forEach(function (el) {
    var field = el.getAttribute('data-image-box');
    var r = el.getBoundingClientRect();
    var showing = r.width > 0 && r.height > 0 && !el.closest('details:not([open])');
    var rect = showing
      ? { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) }
      : null;
    var key = JSON.stringify(rect);
    if (HX_BOX_SENT[field] === key) return;
    HX_BOX_SENT[field] = key;
    send({ type: 'idea:image-box', field: field, rect: rect, clipTop: 0 });
  });
}
```

### 6.4 The field-box reporter

Verbatim from the portal's reference. It answers `idea:feedback` with an `idea:field-box`
per named field (the picture box for an image field, else the element carrying the
`data-field`), withdraws fields that left the list, and re-sends after every state and
resize; `hxQueueLayout()` calls it after a fold too. This is why a radio group's
`data-field` sits on its `<fieldset>` and a table's on its wrapper: the pin lands by the
whole group, not one radio or a hidden input.

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

### 6.5 Video

A player framed inside the sandbox draws nothing, so the portal plays the video over a 16:9
box you hold open. If no `idea:video-state` comes within 1.5 s (an older portal, the file
opened on its own), the box offers YouTube in a new tab.

```js
/* ===== A video the portal plays over a 16:9 box. ===== */
/* <div class="video-box" data-video="<11-character YouTube id>" data-start="95"></div>
   <button type="button" class="key" data-play="<same id>">Play video</button> */
var HX_VIDEO = { box: null, answered: false, timer: 0 };
function hxSendVideo(box) {
  var r = box.getBoundingClientRect();
  var start = parseInt(box.dataset.start || '0', 10);
  send({ type: 'idea:video', videoId: box.dataset.video, start: start > 0 ? start : undefined, clipTop: 0,
    rect: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) } });
}
function hxPlay(box) {
  HX_VIDEO.box = box;
  hxSendVideo(box);
  clearTimeout(HX_VIDEO.timer);
  HX_VIDEO.timer = setTimeout(function () {
    if (HX_VIDEO.answered) return;
    var key = document.createElement('button');
    key.type = 'button'; key.className = 'key'; key.textContent = 'Watch on YouTube, new tab';
    key.addEventListener('click', function () {
      var w = window.open('https://www.youtube.com/watch?v=' + box.dataset.video + '&t=' + (box.dataset.start || 0) + 's', '_blank');
      if (w) w.opener = null;
    });
    box.textContent = 'The video did not open here. ';
    box.appendChild(key);
  }, 1500);
}
function hxStopVideo() {
  if (!HX_VIDEO.box) return;
  HX_VIDEO.box = null;
  send({ type: 'idea:video', videoId: null });
}
/* Called by hxQueueLayout: keep the player on its box, and stop it when the box is hidden. */
function hxMoveVideo() {
  var box = HX_VIDEO.box;
  if (!box) return;
  if (box.getClientRects().length === 0 || box.getBoundingClientRect().width === 0) return hxStopVideo();
  hxSendVideo(box);
}
addEventListener('message', function (e) {
  if (e.data && e.data.type === 'idea:video-state') HX_VIDEO.answered = true;
});
document.addEventListener('click', function (e) {
  var key = e.target.closest ? e.target.closest('[data-play]') : null;
  var box = key && document.querySelector('[data-video="' + CSS.escape(key.dataset.play) + '"]');
  if (box) hxPlay(box);
});
```

A chaptered video is one box at full document width with a grid of step buttons under it,
each setting `data-start` and calling `hxPlay(box)` (the same id with a new start swaps the
player in place), and Back a step, "Step 3 of 6: title", Next step and Stop video directly
under the box. A card names its maker and place ("Mr. Pina video, 3 of 6"), shows the real
thumbnail as a `data:` JPEG (about 3 KB at 176x99), and sits beside the step it teaches.

### 6.6 The page's own code, and starting

Here: the portal's sentence counter, ported exactly (a second counter disagreed with the
portal about "Se rompe allí."), growing text areas, and the Light/Dark key. `hxStart()` is
the last line.

```js
/* ===== Page code: everything below is this assignment's own. ===== */
/* The portal's sentence counter, ported exactly. */
function countSentences(text) {
  var s = text || '';
  s = s.replace(/\.{2,}/g, '\x01');
  s = s.replace(/(\d)\.(?=\d)/g, '$1\x01');
  s = s.replace(/\be\.g\./gi, 'eg\x01');
  s = s.replace(/\bi\.e\./gi, 'ie\x01');
  s = s.replace(/\b(mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|approx|fig|vol|ed|eds|al)\./gi, '$1\x01');
  return s.split(/[.!?]+/).filter(function (piece) { return /[A-Za-z0-9]/.test(piece); }).length;
}
function refreshPage() {
  document.querySelectorAll('[data-count-for]').forEach(function (chip) {
    var box = hxRoot(chip.dataset.countFor);
    var need = Number(chip.dataset.min);
    var have = box ? countSentences(box.value) : 0;
    chip.textContent = Math.min(have, need) + ' of ' + need + ' sentences' + (have >= need ? ', done' : '');
  });
  document.querySelectorAll('textarea').forEach(function (t) {
    t.style.height = 'auto';
    t.style.height = t.scrollHeight + 2 + 'px';
  });
}
document.addEventListener('input', refreshPage);
HX.onState.push(refreshPage);
/* The Light/Dark key: overrides the portal's theme for this visit only. */
var themeKey = document.getElementById('theme-key');
function labelThemeKey() {
  themeKey.textContent = document.documentElement.dataset.theme === 'light' ? 'Dark' : 'Light';
}
themeKey.addEventListener('click', function () {
  HX.theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  hxSetTheme(HX.theme);
});
new MutationObserver(labelThemeKey).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
refreshPage();
hxStart();
```

---

## 7. Layout and look

### 7.1 Width: fluid at both ends

Mr. Pina reads at half of a 1920 screen; students use laptops and phones; the portal widens
the post for an HTML assignment.

- Grids reflow on content: `repeat(auto-fit, minmax(min(<n>px, 100%), 1fr))`, with a
  `max-width` where more columns would be worse. The page goes to about 1680px with padding
  `clamp(14px, 2.2vw, 34px)`; prose stops near 70 characters.
- Media queries only for what a grid cannot decide (a layout stacking, a table restacking).
  A restacked table carries its labels (`data-label`); narrow cells use
  `overflow-wrap: break-word`, never `anywhere` ("Standar" over "d" at 375px).
- No horizontal scroll at 320 or 375. At 1440 the width goes to a related second column (a
  step and its video, an input and its live result), never a void or a narrow strip.

### 7.2 Height

- The frame is exactly as tall as your `idea:height`, never under 320px. **Measure the page
  wrapper, never `document.documentElement.scrollHeight`**, which never drops below the
  frame's height: measured, a document reporting it stayed at 1575px after its content
  shrank to 752px. 6.1 measures `#hx-page` plus 2px.
- Never size anything with `vh` or `height: 100%` against the page: the frame's viewport is
  the document. Never change layout inside a `ResizeObserver` callback; queue it.
- `[hidden] { display: none !important; }` always: `hidden` loses to a class that sets
  `display`.

### 7.3 Something that follows the reader

`position: sticky` does nothing here. A following bar uses an array of 1px
`IntersectionObserver` probes down the page (they report against the portal's viewport from
inside the frame), takes the topmost visible one as the top of the screen, and moves with
`translateY` in document coordinates. Clip the probe container to the document height with
`overflow: hidden`, `floor((height - 2) / STEP) + 1` probes. Never put a picture or video
box inside anything that follows the reader.

### 7.4 Folding sections

- **Fold only on a press.** Answering, finishing or reaching 100% never folds anything. A
  finished move offers "Next: <title>", which folds it, opens the next, puts that header at
  the top with no smooth scroll and moves focus there.
- **Arrival opens where the work is** (the first move not done, or today's stage); the rest
  start as one-line headers. Read-only opens everything.
- **A closed header says what is inside**: number, title, a one-line summary ("46.8 g, under
  the cap"), a Done or To do chip, and the word Show or Hide.
- Fold with `display: none`, never an animated height (it resizes the frame every frame),
  then `hxQueueLayout()`. A fold control is a `<button>` with `aria-expanded` and
  `aria-controls`; any jump into a folded section opens it first.
- Stages spanning classes ship with today's stage only; later ones are locked cards ("Opens
  next class") with no inputs, arriving later as new blocks with new ids.

### 7.5 Theme and colors

The document follows the site's theme (`idea:theme`: Space White is `light`, everything
else `dark`), and a Light/Dark key flips it for the visit only. Define every color twice,
with no length in either block. These are the site's values, measured on all three grounds:
text at least 14.5:1 dark and 15.7:1 light, muted 6.8:1 and 8.6:1, accent 7.4:1 and 5.2:1,
error 4.8:1 and 5.3:1, lines 3.65:1 or better.

```css
/* Fonts: the four @font-face rules go first (section 7.6); until then the fallback stack renders. */
:root, [data-theme="dark"] {
  --ground: #0a0c0b; --card: #101312; --inset: #161a18; --text: #e7eae8; --muted: #9aa49d;
  --line: #6f7b73; --accent: #78b870; --on-accent: #0a0c0b; --error: #d95f5f;
  --key-top: #2a302d; --key-bottom: #1d221f; --key-ink: #e7eae8;
  --shadow: 0 1px 0 rgba(255,255,255,.06) inset, 0 2px 6px rgba(0,0,0,.45);
}
[data-theme="light"] {
  --ground: #e8eceb; --card: #f7f9f9; --inset: #edf1f0; --text: #0d1311; --muted: #384340;
  --line: #6f7c78; --accent: #3b6c36; --on-accent: #ffffff; --error: #b42b2b;
  --key-top: #cdd2d9; --key-bottom: #b8bdc5; --key-ink: #2d3238;
  --shadow: 0 1px 0 rgba(255,255,255,.7) inset, 0 2px 5px rgba(0,0,0,.18);
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html, body { margin: 0; background: var(--ground); color: var(--text); }
body { font: 500 17px/1.5 Rajdhani, "Segoe UI", system-ui, sans-serif; }
#hx-page { display: flow-root; max-width: 1680px; margin: 0 auto; padding: clamp(14px, 2.2vw, 34px); }
.key, .chip { font-family: "Share Tech Mono", ui-monospace, monospace; }
p { max-width: 70ch; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 14px;
  padding: clamp(12px, 1.6vw, 22px); margin: 0 0 1rem; }
.grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr)); }
label { display: block; margin: 0 0 .9rem; }
input[type="text"], textarea { width: 100%; min-height: 44px; font: inherit; color: var(--text);
  background: var(--inset); border: 1px solid var(--line); border-radius: 8px; padding: .5rem .65rem; }
textarea { min-height: 6rem; resize: vertical; }
fieldset { border: 0; padding: 0; margin: 0 0 .9rem; min-width: 0; }
.pick { display: flex; align-items: center; gap: .6rem; min-height: 44px; padding: .4rem .7rem;
  border: 1px solid var(--line); border-radius: 10px; margin: 0 0 .4rem; }
.pick:has(input:checked) { border-color: var(--accent); }
input[type="radio"], input[type="checkbox"] { width: 22px; height: 22px; accent-color: var(--accent); }
.key { display: inline-flex; align-items: center; min-height: 44px; padding: 0 1rem; cursor: pointer;
  border: 1px solid var(--line); border-radius: 10px; color: var(--key-ink); box-shadow: var(--shadow);
  background: linear-gradient(var(--key-top), var(--key-bottom)); text-transform: uppercase; }
.key:disabled { opacity: .5; cursor: not-allowed; }
.chip { display: inline-block; padding: .15rem .55rem; border-radius: 999px; font-size: .85rem;
  background: var(--inset); border: 1px solid var(--line); color: var(--muted); }
.muted { color: var(--muted); }
:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.box { display: flex; align-items: center; justify-content: center; text-align: center; overflow: hidden;
  width: min(100%, 360px); aspect-ratio: 4 / 3; min-height: 120px; color: var(--muted);
  border: 2px dashed var(--line); border-radius: 12px; }
.box img { width: 100%; height: 100%; object-fit: contain; }
.status { margin: 0; }
.status.failed { color: var(--error); font-weight: 700; }
.cut-table { width: 100%; border-collapse: collapse; }
.cut-table th, .cut-table td { text-align: left; padding: .3rem; overflow-wrap: break-word; }
@media (max-width: 600px) {
  .cut-table thead { display: none; }
  .cut-table tr, .cut-table td { display: block; }
  .cut-table td::before { content: attr(data-label); display: block; color: var(--muted); font-size: .8rem; }
}
```

- **One accent, IDEA green**: the primary action, active, done, progress. No orange. Another
  hue only where it means something a student can name, measured in both themes. Never
  color alone: a word or glyph beside it.
- **Raised means pressable, recessed means not**: keys raised with mono caps words, status
  chips recessed with no drop shadow. Space White keys are grey, never white on white.
- **No grid backgrounds**, no decoration that means nothing. Premium and calm like the site:
  rounded plates, light gradients, no stark white rectangles, pictures on a plate and
  clickable to enlarge.

### 7.6 Fonts

The site's faces: Rajdhani 500, 600, 700 for text, Share Tech Mono 400 for labels and
numbers. A font host is refused, so embed the woff2 files from the npm packages
`@fontsource/rajdhani` (`files/rajdhani-latin-500-normal.woff2`, `-600-`, `-700-`) and
`@fontsource/share-tech-mono` (`files/share-tech-mono-latin-400-normal.woff2`): about 60 KB,
80 KB as base64. If you cannot fetch them, ship the fallback stack and say so.

```python
import base64
def face(path, family, weight):
    b = base64.b64encode(open(path, "rb").read()).decode()
    return ('@font-face{font-family:"%s";font-weight:%d;font-style:normal;'
            'src:url(data:font/woff2;base64,%s) format("woff2");}' % (family, weight, b))
```

Check a font by rendered width against the fallback, never `document.fonts.check()` (it
answers true for a font that is not there). Body text about 17px weight 500. Set `Ø` in the
sans face; in monospace it reads as a zero.

### 7.7 Taps, keyboard, motion

Every control is at least 44px tall at every width (a slim one through an invisible
`::after` hit area) and has a visible word, not only a glyph or a `title`. Focus is always
visible. Motion lives inside `@media (prefers-reduced-motion: no-preference)`, and nothing is
hidden in a base state, so with motion off every state still shows by color and glyph.

---

## 8. Writing the work

### 8.1 Say less, and make it fun

- Students scan. One line per idea, verb first, the number in the line; cut any block a
  student does nothing with. Depth is one click away (a closed "Something went wrong" list,
  a tip), never more than two levels; an instruction needed to do the task is on the page.
- Writing is short, and the page says so near the top ("two sentences in the whole thing;
  everything else is a click, a number or a photo"). Each required answer shows a sentence
  starter as its placeholder. An either/or judgment is a pick (picture cards), not a
  sentence.
- Steps: numbered, one action each, the place before the action, a control's name in bold as
  it appears. One picture per step, as inline SVG reading the theme's colors, drawn from the
  part's real geometry (a dimension where the calipers go; a design option exactly as the
  earlier assignment drew it).
- No weekday names (a date is right for one section in one term), American spelling, no em
  dashes. Name who to ask; define every term the first time it appears.

### 8.2 It is not a compliance form

- **No "I did it" checkboxes.** Ask for evidence the page can check: a pick of what they
  actually set (flagging a wrong one), a value only the real act gives (the printer's name
  off its board, the load off the score sheet), or a screenshot. A checkbox only for an act
  with nothing to show. Never grade self-reported process; sentence minimums are a last
  resort.
- **No single path to completion.** Every answer is free text or an optional starter that
  never overwrites. Mark every extra photo slot and every conditional block
  `"optional": true` (the document's own check enforces the condition), or a student sits
  below 100% forever.
- Every field can be started the day the post goes up.

### 8.3 Progress, checks and graded inputs

- Progress is visible and counts work: a tick when a move's evidence is in, a banner when a
  stage is done, a gauge for a capped number. It never blocks anything, but refuses obvious
  junk it can check (a weight that is not a positive number, a wrongly named file).
- A live check is a mirror, not a gate: it says what to do ("Over 5.00 in. Bring the arms
  in."), says so when an entry cannot be read, and an out-of-range number still saves.
- Graded inputs sit in one panel labeled "Counts toward your grade" inside the step that
  produces them. Show an earlier answer beside what it is compared with.
- Everything visual is inline within the 2 MB cap: drawings cropped to their frame as PNG at
  native resolution (65 to 100 KB), renders as JPEG, icons as SVG.

### 8.4 Opening something outside the frame

- A link a student needs is a real link opening a new tab, and the post description carries
  it too.
- `var w = window.open(url, '_blank'); if (w) w.opener = null;` and a `null` handle means
  the tab was blocked: say so. **Never put `noopener` in the feature string**: it makes
  `window.open` return `null` even when the tab opened.
- Mail opens the Gmail compose URL
  (`https://mail.google.com/mail/?view=cm&fs=1&tf=1&to=...&su=...&body=...`), never only
  `mailto:` (school Chrome has no mail handler and lands on a blank tab), with a Copy button
  as the floor. Format a mail body with headings and rules, never padded columns.
- A tool the work must happen in (a shared Slides deck) opens once from one worded key; the
  evidence comes back as a pasted screenshot.

---

## 9. Hand-ins

### 9.1 Pictures

One `image` block per slot. Ask for one picture and allow more as `optional` slots. A
student chooses or pastes: a paste goes to the slot they last touched while it is empty and
visible, else the first empty visible picture slot, never into a closed `<details>`. Say on
the box that pasting works.

### 9.2 Files that are not pictures

An `image` block stores any file with its name and extension (`.SLDPRT`, `.step`). The
document checks the extension, because nothing else will, and names the right file and the
likely mix-up ("This box takes a .sldprt file. That one is .dxf."). A slot named for a
version checks the version (a `V1_` file in the V2 slot says so). The document caps a file
at 50 MB. The portal draws a stored file as a tile with its name and a Download, so the box
is at least 160 by 120px.

### 9.3 How a file is handed in

Read success off `idea:state` (its field appears in `images`); a failed `idea:saved` while
a file uploads is shown on that file. One upload at a time; give up after 45 seconds.
**Replace means remove first**: a second `idea:image` on a full slot is not a replacement. A
caption goes up only once the file is stored. **Keep Choose, Remove and the caption outside
the box**: the portal's drawing over it takes every click. In a teacher's own working copy
the portal refuses a file with a reason, which the code shows.

### 9.4 A link to something they will present

One `text` block per link, with `"link": "presentation"` and a `prompt`, as a plain text
input: no `type="url"`, no pattern, no Test button of your own. The portal checks it for the
student, gives the grader an Open key, and lists the links for the class to present from.
Ask for a share link anyone at the school can open.

---

## 10. Before you deliver

### 10.1 The pre-flight check

The importer refuses a document with every problem named, and Mr. Pina's upload is the worst
place to learn of one. This checks what the importer and the program's own validator
refuse; on 2026-10-14 it agreed with both on the example and on 21 broken copies (renamed
fields, two-level criteria, sums that do not add up, weekdays, British spellings, a missing
handshake, duplicate ids, a 1-point criterion and more). Run `python3 preflight.py file.html`;
fix every `E` line and read every `W` line.

```python
import json, re, sys
ID = re.compile(r"^[A-Za-z0-9_-]{1,40}$")
TYPES = ("text", "longText", "checkbox", "radio", "image", "table")
DAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
BRIT = re.compile(r"\b(centre[sd]?|colour[s]?|behaviour[s]?|organis\w+|recognis\w+|modell\w+|"
                  r"labour|defence|licence|programme|whilst|amongst)\b", re.I)
SCRIPT = re.compile(r"<script\b([^>]*)>([\s\S]*?)</script\s*>", re.I)
FIELD = re.compile(r"""\sdata-field\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'`=<>]+))""", re.I)
html = open(sys.argv[1], encoding="utf-8").read()
E, W = [], []
if len(html.encode("utf-8")) > 2 * 1024 * 1024:
    E.append("document is over 2 MB")
manifests = [m for m in SCRIPT.finditer(html)
             if re.search(r"""type\s*=\s*["']?application/json""", m.group(1), re.I)
             and re.search(r"""id\s*=\s*["']?idea-manifest\b""", m.group(1))]
if len(manifests) != 1:
    sys.exit(f"REFUSED: need exactly one idea-manifest script, found {len(manifests)}")
try:
    man = json.loads(manifests[0].group(2))
except ValueError as e:
    sys.exit(f"REFUSED: the manifest is not valid JSON: {e}")
spans = {m.span() for m in manifests}
scripts = "\n".join(m.group(2) for m in SCRIPT.finditer(html) if m.span() not in spans)
scripts = re.sub(r"//[^\n]*", " ", re.sub(r"/\*[\s\S]*?\*/", " ", scripts))
inert = re.sub(r"<style\b[^>]*>[\s\S]*?</style\s*>", " ",
               SCRIPT.sub(" ", re.sub(r"<!--[\s\S]*?-->", " ", html)), flags=re.I)
text = re.sub(r"\s+", " ", re.sub(r"<[^>]*>", " ", inert).replace("&nbsp;", " "))
def copy(where, s):
    for d in DAYS:
        if re.search(rf"\b{d}\b", s or ""):
            E.append(f"{where} names a weekday: {d}")
    if BRIT.search(s or ""):
        E.append(f"{where} uses a British spelling: {sorted(set(x.lower() for x in BRIT.findall(s)))}")
def whole(v, lo, hi):
    return isinstance(v, int) and not isinstance(v, bool) and lo <= v <= hi
if man.get("schemaVersion") != 3: E.append("schemaVersion must be 3")
if man.get("kind") != "html-assignment": E.append('kind must be "html-assignment"')
for k in ("title", "course"):
    if not str(man.get(k) or "").strip(): E.append(f"manifest needs a {k}")
if not whole(man.get("points"), 0, 10000): E.append("manifest points must be a whole number 0..10000")
blocks, fields, total = set(), {}, 0
def block(b, where):
    bid = str(b.get("id", ""))
    if not ID.match(bid): E.append(f"{where}: bad id {bid!r}")
    elif bid in blocks: E.append(f"duplicate block id {bid}")
    blocks.add(bid)
    f = str(b.get("field") or "").strip()
    if not f: E.append(f"{where}: no field")
    elif f in fields: E.append(f"field {f} claimed twice")
    fields[f] = bid
    if b.get("type") not in TYPES: E.append(f"{where}: type {b.get('type')!r}")
    if b.get("minSentences") is not None and not whole(b["minSentences"], 0, 100): E.append(f"{where}: minSentences")
    if "optional" in b and not isinstance(b["optional"], bool): E.append(f"{where}: optional must be true or false")
    if "link" in b and (b["link"] != "presentation" or b.get("type") != "text"): W.append(f"{where}: link ignored")
    if "prompt" in b and not (isinstance(b["prompt"], str) and 0 < len(b["prompt"].strip()) <= 500):
        W.append(f"{where}: prompt ignored or cut")
for i, b in enumerate(man.get("header") or []):
    block(b, f"header block {i + 1}")
    if "points" in b: E.append(f"header block {i + 1} declares points")
mods = man.get("modules") or []
if not mods or len(mods) > 40: E.append("need 1 to 40 modules")
seen_mods = set()
for m in mods:
    mid = str(m.get("id", ""))
    if not ID.match(mid) or mid in seen_mods: E.append(f"module id {mid!r} bad or repeated")
    seen_mods.add(mid)
    if not str(m.get("title") or "").strip(): E.append(f"module {mid}: no title")
    pts = m.get("points")
    if not whole(pts, 0, 10000): E.append(f"module {mid}: points"); pts = 0
    total += pts
    if m.get("audience") not in (None, "team", "individual"): E.append(f"module {mid}: audience")
    bl = m.get("blocks") or []
    for b in bl: block(b, f"module {mid} block {b.get('id')}")
    photos = [b for b in bl if b.get("type") == "image"]
    if len(photos) >= 2 and not any(b.get("optional") is True for b in photos):
        W.append(f"module {mid}: {len(photos)} photo blocks and none optional")
    if bl and all(b.get("optional") is True for b in bl): W.append(f"module {mid}: every block optional")
    crit, cids, csum = m.get("criteria") or [], set(), 0
    if not crit: E.append(f"module {mid}: no criteria")
    for c in crit:
        cid, lv = str(c.get("id", "")), c.get("levels") or []
        where = f"module {mid} criterion {cid}"
        if not ID.match(cid) or cid in cids: E.append(f"{where}: id bad or repeated in module")
        cids.add(cid)
        if not str(c.get("text") or "").strip(): E.append(f"{where}: no text")
        if len(lv) not in (3, 4): E.append(f"{where}: needs 3 or 4 levels, has {len(lv)}"); continue
        p = [l.get("points") for l in lv]
        if not all(whole(x, 0, 1000) for x in p): E.append(f"{where}: level points must be whole"); continue
        if any(p[i] <= p[i + 1] for i in range(len(p) - 1)): E.append(f"{where}: levels must strictly descend")
        if p[-1] != 0: E.append(f"{where}: bottom level must be 0")
        if p[0] < len(lv) - 1 or p[0] < 2: E.append(f"{where}: worth {p[0]}, too little for {len(lv)} levels")
        if c.get("points") != p[0]: E.append(f"{where}: points must equal the top level ({p[0]})")
        csum += p[0]
        for l in lv:
            sh = str(l.get("short") or "").strip()
            if not sh or len(sh.split()) > 6 or sh[-1] in ".!?": E.append(f"{where}: short {sh!r}")
            if not str(l.get("label") or "").strip() or not str(l.get("descriptor") or "").strip():
                E.append(f"{where}: every level needs a label and a descriptor")
    if crit and csum != (pts or 0): E.append(f"module {mid}: criteria sum {csum}, module says {pts}")
if total != man.get("points"): E.append(f"modules sum {total}, manifest says {man.get('points')}")
if len(blocks) > 400: E.append("more than 400 blocks")
in_doc = {(m.group(2) or m.group(3) or m.group(4) or "").strip() for m in FIELD.finditer(inert)} - {""}
if set(fields) - in_doc: E.append(f"declared but no [data-field] in the document: {sorted(set(fields) - in_doc)}")
if in_doc - set(fields): E.append(f"[data-field] the manifest does not declare: {sorted(in_doc - set(fields))}")
if "idea:ready" not in scripts: E.append("the document never sends idea:ready")
if "allow-same-origin" in html: E.append("the document mentions allow-same-origin")
if re.search(r"""(setAttribute\(\s*['"]data-field|\sdata-field\s*=\s*[`'"][^`'"]*\$\{)""", html):
    E.append("the document builds a data-field at runtime")
if "\u2014" in json.dumps(man, ensure_ascii=False): E.append("em dash in the manifest")
copy("the manifest", json.dumps(man, ensure_ascii=False))
copy("the document", text)
for trap in ("localStorage", "sessionStorage", "document.cookie", "window.parent", "window.top"):
    if trap in html: W.append(f"the document mentions {trap}")
for w in W: print("W", w)
for e in E: print("E", e)
print("REFUSED" if E else "PASS", f"({len(E)} errors, {len(W)} warnings)")
```

With the `pina-hash/idea-app` repository, also run the real two: `python3
tools/validate-assignment-spec.py <file>`, and `validateHtmlManifest` from
`src/lib/classroom/html-assignment/manifest.ts`.

### 10.2 Drive it the way the portal does

Run it in Chromium if you can. A small parent page frames the file with
`sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads"`,
answers `idea:ready` with `idea:state`, and for every `idea:change` stores the value and
re-posts `idea:state` 40 ms later **with the values from before the change on every third
echo** (the stale echo that eats spaces), then an `ok` `idea:saved`; it answers `idea:image`
by adding `{ url, name, caption: "" }` to `images` and re-posting. Then:

1. Type multi-word phrases into every box, cell and caption; pick every radio; add a
   picture. Each value reaches the parent exactly as typed, under its declared field.
2. Remount with the stored values: everything comes back, tables and readouts included.
3. Re-seed with `readOnly: true`: every answer control disabled, tools still live.
4. Send `idea:feedback`: each `idea:field-box` and `idea:image-box` rect equals the
   element's own position.
5. Fold a section: the reported height drops.
6. Look at 1600, 1100, 960, 760, 400 and 375px, both themes, sections open and closed: no
   inner scrollbar, no horizontal scroll, no dead space.
7. A clean console, inside the frame too: a page error here is a lost answer.

A Claude artifact preview shows "This content is blocked" for these files; that is the
preview's policy and says nothing about the file.

### 10.3 Audit it as five students

Complete it in a browser as the literal first-timer (every place they would stop or guess),
the strongest student (everything padded), the student after 100% with junk (everything the
page certifies that is nonsense), the student who tries to break it (wrong boxes and files,
undo, reload, read-only), and an English learner or a student with a reading disability
(keyboard only, bigger text). Fix every blocker and wrong instruction, or ask Mr. Pina.

### 10.4 The checklist

- [ ] Pre-flight passes; under 2 MB; `idea:ready` sent once with `schemaVersion: 3`.
- [ ] Every `data-field` declared and present; block ids final and matching any earlier
      upload; every block has a `prompt`; extra and conditional blocks `optional`.
- [ ] Nothing from a host; no storage, `confirm`, `<form>` or `<base>`.
- [ ] Values sent untrimmed; touched fields survive a stale echo; restore and read-only work.
- [ ] Picture boxes at least 160 by 120 with their controls outside; height from the wrapper.
- [ ] Both themes measured; 44px controls; no horizontal scroll at 320; lab facts confirmed.

---

## 11. Delivering

- Filename leads with course and day: `IDEA100_D26_Blade-Presentation.html`.
- With it, the posting details the document cannot carry: the title as it appears in IDEA
  Classroom, total points, grading category, due date, and the post description (with any
  link a student must click).
- A re-upload over the same post keeps every answer while every block id is unchanged. A
  later stage is a new module with new block ids, the manifest's points growing by its
  points.
- Mr. Pina reads answers in bulk in the grading console (one student's answers, every answer
  to one question, a CSV headed by each `prompt`, a present-links view). No SQL ships with a
  document.
- **End the delivery with every fix you had to make that this brief did not warn you
  about**, so it can join the standards.

---

## 12. The classic failures

- Renaming or deleting a block id after students answered: their work vanishes silently.
- An autosave touching `localStorage`: the page dies before it renders.
- Trimming a value before sending it, or seeding without skipping touched fields: the echo
  eats what a student types.
- A web font, a CDN script, an image URL: refused, and the page loses its look.
- A Submit button in the document: hand-in is the portal's.
- Drawing a stored picture yourself: show "Saved: name" and report the box.
- Waiting on `idea:theme`, `idea:video-state` or `idea:feedback`: an older portal never
  sends it.
- `idea:ready` twice: the portal forgets every box.
- Reporting `documentElement.scrollHeight`: the frame never shrinks.
- `confirm()` before a destructive step: it returns false, so the step never runs.
- A `data-field` per table cell, or one made at run time: the answer is dropped.
- Two photo slots in a module with neither optional: a one-photo student never completes.
- A section that folds itself, or a header that hides whether it is done.
- `noopener` in `window.open`; `mailto:` as the only mail control.
- The words "allow-same-origin" anywhere in the file, even a comment: the program's
  validator refuses it.
- A vendor default stated as a lab fact (the lab exports STEP, never STL).

---

## Changelog

- **1.0 (2026-10-14).** New. The one file to hand a Claude chat that builds a ported HTML
  assignment, condensed from the authoring standard 1.24, the subsystem specification 1.8,
  the HTML design directions 1.0 and the template 1.0, with every protocol fact checked
  against the portal's code. Carries a bridge client, a pictures and files handler, the
  picture-box reporter, the field-box reporter for progressive feedback (verbatim), a video
  hand-off and a pre-flight check, all run on 2026-10-14 in Chromium inside the real sandbox
  against the portal's message gate with a stale-echoing parent; the pre-flight agreed with
  both real validators on 22 cases. Four behaviors were measured for it rather than carried:
  `confirm()` returns false in the sandbox, `data:` audio and video are refused,
  `navigator.clipboard` is blocked while `execCommand('copy')` works, and a document
  reporting `documentElement.scrollHeight` never lets the frame shrink.
