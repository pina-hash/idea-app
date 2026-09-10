# IDEA HTML Assignment Template
**Version 1.0 - 2026-09-10**
How to start a new HTML assignment from the blank template at `src/lib/legacy/assignments/_TEMPLATE.html`. Written for the person authoring an assignment, not for the person maintaining the app.

---

## Why This Exists

Every HTML assignment so far was built by copying the last one. That works, and it also means every new assignment starts as somebody else's curriculum with the machinery welded into it: Blade 01's rubric text, Blade 01's manufacturing table, Blade 01's angular-momentum demo. Deleting the parts that do not apply is the first hour of the job, and it is the hour in which a storage key gets left behind.

`_TEMPLATE.html` is the same machinery with nothing in it. It carries two example modules so the pattern is visible, and every place you are meant to edit carries an HTML comment saying what to change.

---

## What an HTML assignment is

One self-contained HTML file. A student opens it, types into it, and the browser saves their answers as they go. When they are done they press **[ Download with Data ]**, which hands them a copy of the same file with their answers embedded in it, and that file is what they upload to IDEA Classroom.

The file is served from this repository. Drop it in `src/lib/legacy/assignments/` and it is live at `/assignments/<filename without .html>`. There is no registration step and no list to add it to: `src/lib/legacy/index.ts` finds every `.html` file in that folder automatically. Nothing else needs to change.

To link it from the assignments index on the dashboard, add a row to `COURSE_LAYOUT` in that same file. That is optional; the URL works either way.

---

## The two attributes that make a field a field

**`data-field`** turns an input into an answer. It is the name that answer is saved under, it is what the print view mirrors, and it is what IDEA Classroom looks for on import.

```html
<input type="text" data-field="hypothesis" placeholder="..." >
<div class="print-mirror single-line" data-mirror="hypothesis"></div>
```

Three rules: it must be unique in the document, the `data-mirror` beneath it must be the same string, and it must appear in the manifest. Miss the mirror and the field prints blank. Miss the manifest and the import is refused.

**`data-min`** sets a sentence minimum on a written answer. It lives on the counter beneath the textarea, not on the textarea:

```html
<textarea data-field="analysis" placeholder="..."></textarea>
<div class="print-mirror" data-mirror="analysis"></div>
<div class="sent-count" data-min="3" data-field-ref="analysis">
  <span class="sent-dot"></span><span><span class="current">0</span> / 3 sentences minimum</span>
</div>
```

`data-field-ref` names the textarea. The counter turns amber below the minimum and green at it, the module's dot stays grey until it is met, and the completeness check lists the field by name and by how far short it is. **The same number goes in the manifest as `minSentences`.** Change it in one place and the counter and the grading console disagree about what was asked for.

---

## The four things to change when you start a new assignment

These are the four a copied assignment gets wrong. Each one is marked in the file with a comment saying so.

**1. The storage key.** One line near the top of the script:

```js
const STORAGE_KEY = 'idea000-assignment-00';
```

**This is the one that does real harm.** Everything a student types is saved in their browser under this exact string. Two assignments sharing a key share one saved record, so opening the second writes over the first one's work, with no warning and no way back. Nothing on screen says anything; the student finds out when they reopen the other assignment and it is holding this one's answers. **Set it to this file's own filename, without `.html`, every time.**

**2. The export filename prefix.** Inside `downloadHTML`:

```js
const EXPORT_PREFIX = 'IDEA000_ASSIGNMENT_00_';
```

This is what a student's submitted file is called, and it is how thirty downloads in a folder get told apart. Leave the `[data-field="student-name"]` lookup on the line below it alone: the student's name is the other half of the filename and it is read from that field.

**3. The due date.** A read-only field in the header. Nothing computes it and nothing warns about it, so a copied assignment shows the date it was copied from until somebody notices. Keep the spaced format, `09 / 11 / 2026` - that is what the date fields beside it use and what students read everywhere else.

**4. The export must stay a blank template plus its data.** This one is not a value you change, it is a rule you can break by adding something. Several regions are built by script when the file opens: the image previews, the rubric panels, the instructor scoring table. `downloadHTML` empties every element carrying `class="js-built"` before writing the file out, because otherwise those regions are written into the export as markup and then built *again* when it opens. On Blade 01, before this was fixed, one sketch came back as two preview items and six table rows came back as seven with two elements sharing one `data-field` - which is exactly the duplicate that makes an answer unstorable. **If you add a region that script fills by appending nodes, give it `class="js-built"`.** Emptying it costs nothing; the embedded data is what puts it back.

---

## Adding a module

A module is two things, and it is always both: a block of markup, and an entry in the manifest at the bottom of the file. A module with no manifest entry scores nothing. A manifest entry with no markup is refused on import.

Copy an example module's markup, then:

1. Change `data-module="..."` on the wrapper and `id="rubric-..."` on the panel at the bottom to your module's id.
2. Change the `onclick="toggleRubric('...')"` on the rubric button to the same id.
3. Rewrite the prompt, the labels and the placeholders.
4. Give every input a new `data-field`, with a matching `data-mirror` beneath it.
5. Add the module to the manifest.

You do not touch the module number, title, scope chip, points chip or the rubric panel's contents. All of those are filled from the manifest when the file opens, along with the total bar, the footer total and the instructor scoring table. Points and criteria are written down once, in the manifest, and everything visible is drawn from there.

The second example module is an **image zone**. If your assignment does not want one, the comment above it lists everything to delete - the markup, the manifest module, the lightbox near the top of the file, and one section of the script. Nothing else depends on it. If you keep it, set `IMAGE_MIN` to the number of images required.

---

## The manifest, and why a block id is permanent

At the bottom of the file:

```html
<script type="application/json" id="idea-manifest">
```

This is what IDEA Classroom reads when the file is imported. Every block in it looks like this:

```json
{ "id": "module-one-summary", "field": "m1-summary", "type": "text" }
```

The **`field`** is the document's `data-field`. It is a pointer, and renaming it is free: change it in both places and nothing else moves.

The **`id`** is not. When a student answers that block, their answer is stored in a row keyed by this id. It is the column their work lives in. **Rename an id after a class has answered and their work is orphaned** - the old rows are still there, nothing reads them, and the block shows as unanswered. There is no repair for it short of editing the database by hand.

So: pick ids that describe what the block *is*, not where it sits. `module-one-summary` survives being moved; `q3` does not survive anything. Before students have opened the file, change ids as freely as you like. After, treat them as fixed and rename the `field` instead.

The importer refuses a document rather than shipping a broken one. It checks, among other things:

- Every `field` has a `data-field` in the document, **and** every `data-field` in the document is in the manifest. Both directions - an undeclared input silently drops the answer a student typed into it.
- Ids are letters, digits, `-` and `_`, up to 40 characters, and no two blocks share one.
- Criteria sum to their module's points, and modules sum to the assignment's total.
- Every criterion carries **3 or 4 levels**, strictly descending, the top worth the criterion maximum and the bottom worth 0. Two levels is a checklist item, not a criterion.
- A criterion needs at least as many points as it has levels above zero, so **a 1-point criterion cannot be written at all** - give it 2, or merge it into another criterion.
- `short` is what the grading console prints on the level button: six words at most, and no full stop at the end.
- No weekday names and no British spellings anywhere a student reads. A document naming "Friday" is right for one section in one term and wrong everywhere else.

You can check a file before handing it over:

```bash
python3 tools/validate-assignment-spec.py src/lib/legacy/assignments/<your-file>.html
```

It reports every problem at once, with the module and criterion named. A standalone assignment will warn that the document reaches for `localStorage`; that warning is aimed at the embedded form and is expected here, because saving to the browser is how a standalone assignment works.

---

## Before you hand it in

- Open it in a browser and type into every field. The module dots turn green and the score in the toolbar climbs.
- Press **[ Download with Data ]** with the document empty. The completeness check should list every required field by name.
- Fill it in, download it, then open the downloaded file. Every answer should come back, and the images should come back once each.
- Press **[ Print / Export PDF ]**. The typed values print through the mirrors; the instructor scoring table appears at the end.

---

## Changelog

- **1.0 (2026-09-10)** - First version, written alongside `src/lib/legacy/assignments/_TEMPLATE.html`. The template is Blade 01's machinery with Blade 01's curriculum removed: the module prose and rubrics, the manufacturing table, the angular-momentum demo and the rulebook block are gone, and two placeholder modules stand in their place. What is new rather than merely carried over is that the manifest now draws the module headers, the rubric panels, the totals and the instructor scoring table, so points and criteria are written down once instead of being kept in step by hand between the markup and the manifest.
