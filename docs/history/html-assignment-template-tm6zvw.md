---
title: "A blank HTML assignment to start from: Blade 01's machinery with Blade 01's curriculum removed, its manifest drawing the rubric panels and totals, and an author document for the four things a copy gets wrong (`claude/html-assignment-template-tm6zvw`, no migration)"
date: 2026-09-10
branches: [claude/html-assignment-template-tm6zvw]
migrations: []
subsystems: ["Classroom", "Legacy content", "Standards"]
---

Every HTML assignment to date was built by copying the last one, so the reusable
machinery and one assignment's curriculum arrive welded together. Deleting the
parts that do not apply is the first hour of authoring a new one, and it is the
hour in which a storage key gets left behind.

`src/lib/legacy/assignments/_TEMPLATE.html` is that machinery with nothing in
it, and `docs/standards/IDEA_HTML_ASSIGNMENT_TEMPLATE.md` is the author's copy
of what the structure actually requires.

## What is general and what was Blade 01's

The whole hook surface of the source document is 57 `data-field` attributes and
9 `data-min` attributes, measured, and nothing else. Everything else is either
machinery that reads those attributes or curriculum that happens to carry them.

**Kept, unchanged in behaviour:** `collectData`, `saveToStorage`,
`loadFromStorage`, `loadData`, `downloadHTML`, `runPreflight`, `moduleComplete`,
`countSentences`, `sentOk`, `notEmpty`, `getFieldVal`, `autoResize`,
`resizeAll`, `autoFillDate`, `flashSave`, the clear dialog, the preflight
dialog, the toolbar, the read-only-copy boot path, the print rules, the
print-only instructor scoring table, the integrity declaration and the
submission checklist. The CSS was taken VERBATIM out of the source file by
script rather than retyped, minus the rules belonging to deleted regions, so a
kept rule is byte-identical to the one shipping to IDEA100 students today.

**Kept and marked clearly removable**, because not every assignment wants
pictures: the sketch uploader -- `addImageFiles`, `downscaleDataUrl`,
`renderImageItem`, `openLightbox`, `closeLightbox`, `updateImageCount`, the
`sketch-drop-zone` markup and the lightbox. Its init wiring is guarded on both
element lookups, so deleting the markup alone cannot break the rest of the boot
path, and the comment above the module lists every piece that goes with it.

**Deleted as content:** every module's prose and rubric text; the manufacturing
table (`addMfgRow`, `#mfg-tbody`, `.mfg-*`, `.add-row-btn`); the
angular-momentum demo (`am-canvas`, `am-slider`, `am-spin-btn`, `am-status`,
`spinDemo` and the whole `.am-*` block).

**Three further things were deleted that the prompt did not name, and they are
content by the same test.** The **rulebook block** (`.rulebook-*`, about 100
lines of markup and CSS) is a link to the IDEA-Blade Rulebook and an
acknowledgement that the reader has read it -- a required-reading pattern, but
one whose every string names the Blade program. The **team-entry banner**
(`.team-banner-*`, `.scope-tag`) explains what TEAM and INDIVIDUAL mean on a
Blade team build. The **"Blade" disambiguation note** under the masthead
(`.brand-note`) explains that "blade" means the whole battle-top. What survives
of the team idea is the `.mod-scope` chip on a module header, because that is
now drawn from the manifest's own `audience` field and means something to any
assignment. An author who wants a required-reading block can lift one from a
shipped assignment; carrying a dead one in the template would have cost a
tenth of the file to say nothing.

## The manifest draws the document

The one behavioural change rather than a subtraction. Blade 01 states its points
three times -- the module header chip, the visible rubric panel, and the
print-only instructor table -- and a manifest would have been a fourth. Those
are four copies of one arithmetic, kept in step by whoever remembers.

The template renders the module number, title, scope chip and points chip, every
rubric panel row with its levels, the total bar, the footer total and the whole
instructor scoring table FROM the manifest at load. Points and criteria are
written down exactly once, in the one place the importer also reads, so an
author who edits the manifest cannot leave a stale number on screen and an
author who never opens the manifest cannot ship an unimportable file.

**That bought a second script-built region, which is why `js-built` is a class
rather than a list of ids.** `22016bbd` fixed Blade 01's export by emptying two
named containers in the clone; the rule was real and the mechanism did not
generalise. Every container script fills by appending now carries
`class="js-built"`, and `downloadHTML` empties that selector. Adding a region
means adding the class, which is the whole of the ceremony.

## Two defects found by driving it, and fixed in the template

Both are inherited from Blade 01 and both were found in the browser, not by
reading.

**Multi-select upload order was the order files finished decoding.**
`addImageFiles` started a `FileReader` per file and pushed from each callback.
Measured on two PNGs picked as "top, side": they came back side-first, so a
student captioning the rows top-to-bottom captions the wrong pictures. The
template awaits each file in turn.

**A row found itself again by `dataUrl` string equality.** Two copies of one
picture have the same string, so editing or removing either row hit the first
one. The row now closes over the image object itself, which is exact and is
also less code.

Neither is changed in `idea100-blade-01.html`, which is not this bundle's file
and is md5-verified unchanged at `2211141fc0d2e08ee6c005d3d0d639d3`.

## Measured

**The shipped validator, both directions, with a positive control.**
`validateHtmlManifest` over the template: **0 errors, 0 warnings**, 10
`data-field` attributes in the document against 10 manifest blocks. Two mutants,
built as separate files so the template itself was never edited: an input
deleted from the document is refused ("declares a field the document has no
[data-field] for"), and an input the manifest does not declare is refused ("a
student's answer there would be dropped with nothing to say so"). The template's
own md5 was checked identical afterwards.
`python3 tools/validate-assignment-spec.py` on the same file: **PASS**, exit 0.

**A real browser round trip**, Chromium 1194 over `file://`. Typed into all six
text fields, checked all three checkboxes, uploaded two header-verified PNGs
(8x5 and 6x6), captioned both, pressed Download with Data. Export filename
`IDEA000_ASSIGNMENT_00_Ana_Reyes.html`. In the exported bytes: **10
`data-field` attributes, 10 unique, NO duplicates**; 0 `preview-item` nodes, 0
`rubric-row` nodes and an empty instructor tbody, so nothing script-built was
written in as markup. Opened in a FRESH browser: all nine scalar answers came
back exactly, both images came back once each in upload order with the right
dimensions and the right captions, the score read 20 / 20 and the rubric panels
and instructor table rebuilt to 4 rows and 3 rows.

**The preflight bites.** Empty document: 9 issues, one per manifest block, by
module title. Fully complete: `runPreflight()` returns `[]`. Clearing one
required field returns exactly `["Module One Title: m1 summary is empty"]`, the
module dot goes grey and the score drops to 10 / 20. Cutting a written answer to
one sentence returns `["Module One Title: m1 reasoning (1/3 sentences)"]`, and
the dialog renders that row under "Pre-Submission Check".

**svelte-check 0 errors / 37 warnings, 31/5/1** -- baseline. The two console
errors during the browser pass are `fonts.googleapis.com`
(`ERR_CONNECTION_RESET`, no network in the container) and the favicon's absolute
`/IDEA/...` path (`ERR_FILE_NOT_FOUND` over `file://`, correct when served at
`/assignments/<slug>`). Neither is a defect and neither appears when served.

**The file is 1575 lines**, against a target of about 1200. The overrun is the
CSS taken verbatim (459 lines) plus the comments the template exists to carry.
Compressing the CSS would have made it stop matching the shipped assignments it
was copied from, which is the property that makes it trustworthy.

## Not verified

The template was never served through SvelteKit -- `/assignments/_TEMPLATE` was
not requested from a running dev server, so `rewriteLegacyLinks` and
`injectVersionBadge` were not exercised over it, and the favicon was not
observed resolving. No print pass: the print stylesheet's behaviour over the
generated instructor table is asserted only from the DOM, not from a rendered
page. No import into IDEA Classroom, which is ledger 0138's surface and did not
exist on this branch. No measurement at 375px or 1440px; this is not an app
route and `npm run verify:browser` covers `/dev` only.

## Left for Mr. Pina to decide

`_TEMPLATE.html` in that folder is a LIVE PUBLIC ROUTE at
`/assignments/_TEMPLATE`, because `src/lib/legacy/index.ts` globs
`./assignments/*.html` and strips `.html` with no filter. Confirmed by reading
both that file and `src/routes/assignments/[slug]/+server.ts`, which reads no
session. Nothing in `tests/` or `tools/` pins the assignment list, and the
template is not linked from `COURSE_LAYOUT`, so it is reachable only by typing
the URL. The judgement and the options are in the ledger entry; the glob was not
changed, because `src/lib/legacy/index.ts` is not this bundle's file.
