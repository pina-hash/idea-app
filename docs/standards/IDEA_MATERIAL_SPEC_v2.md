# IDEA Material Spec - Schema v2
**Version 2.3 - 2026-08-20**
The canonical authoring format for IDEA course materials. One spec per material. The spec is the durable, version-controlled asset; every rendering is generated from it.

**Changed in v2:** schema gains a `kind` discriminator. `assignment` is everything v1 described, unchanged. `reference` is new: structured, tabbed, read-only documents that render as IDEA Classroom Materials. Validation is now enforced server-side on every write, so this document describes rules the database will actually reject, not conventions. Rubrics moved to leveled descriptors per `IDEA_RUBRIC_STANDARDS.md`. Supersedes v1.0 (2026-08-10).

---

## Two Kinds

```json
{ "kind": "assignment", "schemaVersion": 1 }
{ "kind": "reference",  "schemaVersion": 2 }
```

| | `assignment` | `reference` |
|---|---|---|
| Container | `modules[]` | `sections[]` |
| Points, rubrics, AI levels | Yes | Rejected outright |
| Student input | Yes | None. It reads, it never collects |
| Submission, preflight, grading | Yes | None |
| Renders as | An assignment in the engine | A Materials post in IDEA Classroom |
| Naming | `[assignmentId].spec.json` | `[referenceId].reference.json` |

An absent `kind` is treated as `assignment`, so every pre-v2 spec still validates and behaves identically. That default lives in `_classroom_assert_assignment_kind`, not in the reference validator, which requires `kind` to be present and exactly `"reference"`.

Each kind has its own writer RPC and its own table. A reference document pasted into the assignment importer is refused by name, and the reverse is also refused. The separation is deliberate: the public read path physically cannot return an assignment spec.

---

# Part 1: Assignment Specs

Canonical form: one JSON file per material, named `[assignmentId].spec.json`.
ID convention: `[course]-[project or unit]-[assignment#]`, lowercase, hyphens only. Examples: `idea209h-u1-03`, `idea100-blade-02`.

## Top-Level Structure

```json
{
  "kind": "assignment",
  "schemaVersion": 1,
  "meta": { },
  "modules": [ ],
  "declarations": { },
  "approvalGate": null,
  "print": { }
}
```

### meta

```json
{
  "assignmentId": "idea209h-u1-03",
  "course": "IDEA209H",
  "unit": 1,
  "title": "Material Identification Checkpoint",
  "buildVersion": "v1",
  "totalPoints": 70,
  "dueDate": "2026-09-04",
  "theme": "idea-green",
  "gradingCategory": "Unit Assignments",
  "headerFields": ["studentName", "date", "section"]
}
```

- `totalPoints` must equal the sum of module points. Enforced on import.
- `dueDate` is fixed at authoring. Deadlines are firm; no rendering may imply flexibility.
- `theme` is always `idea-green`. The engine ships no other themes, so this is not a per-material decision. See `IDEA_Design_System.md`.
- `gradingCategory` matches the course's locked grading categories.
- `headerFields`: `studentName` and `date` always present.
- `buildVersion`: bump on breaking content changes (module removed, points changed, field IDs renamed). Wording fixes do not bump.

### modules[]

```json
{
  "id": "m1",
  "title": "Appearance-Based Identification",
  "points": 20,
  "aiLevel": 1,
  "aiNote": "One or two sentences on what this level means for this specific module.",
  "intro": "One short paragraph of module context. Markdown allowed.",
  "blocks": [ ],
  "rubric": [ ]
}
```

- `aiLevel`: 0-3 per `IDEA_AI_Use_Policy.md` category defaults, recommended by chat, confirmed by Alejandro before the spec is finalized. `null` omits the badge.
- `aiNote`: optional. Surfaced on hover and on focus of the AI badge, and printed beneath the module heading. One or two sentences, written for this module's actual work rather than restated from the policy table, because a student reading "AI can help generate, draft, search, or explore" still does not know whether that covers the lookup they are about to do. Omit and the badge falls back to the generic level rule. Plain text, no markdown. Required whenever `aiLevel` is set on a graded module.
- `instructions` block content has an **authoring target of 250 words per module and a hard ceiling of 300**. Instructions and the input tables share one scroll column on the item page, so every paragraph of teaching pushes the working surface further down. Procedure a student needs at the bench stays in the item. Teaching that explains why belongs in the unit reference document. Author against the item page, not against the print sheet: the print renderer paginates and the item page does not.
  - **250 is the target, 300 is enforced.** "Roughly 250" cannot be tested, and an untestable budget is a preference. A module between 251 and 300 words is over target and passes; a module at 301 fails the repo's spec-lint test by name and by count. The gap exists so that a single unavoidably long procedure does not require a standards argument, and so the ceiling stays a ceiling rather than becoming the new target.
  - The count is words of rendered `instructions` content per module, summed across every `instructions` block in that module, markdown syntax excluded.
- `rubric` levels each carry a `short` of six words or fewer alongside the full `descriptor`, per `IDEA_RUBRIC_STANDARDS.md`.

**Figures in `instructions` content (live as of `cc9f9aa`).** A line whose entire trimmed content is `![alt](src)` renders as a captioned figure; the alt text is required, non-empty, and serves as both the alt attribute and the visible caption. An image inside a paragraph is deliberately unsupported, and every other occurrence of `![` keeps its current behaviour of a literal exclamation mark followed by an ordinary link. Permitted `src` values are same-origin only: `attachment:<filename>`, resolved at render time against the item's own attachments, and absolute paths under a named set of static prefixes. External `http` and `https`, protocol-relative, `data:`, any other scheme, and SVG from any source are refused, and a refused or unresolved reference renders as its caption with a visible marker rather than as a broken image. The alias form rather than a file id is deliberate: a spec must be authorable before the item exists, must survive a file being re-uploaded, and must still mean something in the exported copy under `materials/`.

**What a figure costs.** A figure is a block: it takes the full measure of its column and cannot sit beside the text it illustrates. In print it is capped so a single figure cannot take a page. Author the alt text as a real caption, since it is both the accessibility text and the visible label, and a figure whose reference does not resolve renders as that caption with a marker rather than as a gap. Prefer one figure carrying one idea over a composite image whose parts need separate explanation.

**There is no separate print renderer for spec blocks,** and any statement to the contrary is wrong. Print rendering is `@media print` CSS inside the components that render the blocks. `printAs` was declared on the assignment block type and read by nothing, and is removed. The in-repo `docs/IDEA_MATERIAL_SPEC_v1.md` is now a stub naming this document as canonical; two applied migrations still cite the old path by comment, deliberately left, since an applied migration is an immutable record and the citation now resolves to the stub that says it is not authoritative.
- `rubric` criteria carry **leveled descriptors** per `IDEA_RUBRIC_STANDARDS.md`. The flat single-`descriptor` shape used in v1.0 is invalid: it could not guarantee grading consistency across sections and instructors. Criterion maximums sum to module points.

### Block Types

Blocks appear in `blocks[]` in display order.

**instructions** - static content.
```json
{ "type": "instructions", "content": "Markdown text. May include numbered procedures." }
```

**textField** - written student response.
```json
{ "type": "textField", "id": "f1", "prompt": "Explain why 304 stainless resists corrosion better than 1018 steel.", "minSentences": 3, "maxSentences": 5, "points": 5 }
```

**table** - structured data entry. Students add rows.
```json
{
  "type": "table", "id": "t1", "points": 10,
  "columns": [
    { "key": "material", "label": "Material", "tip": "Name from the six-material set." }
  ],
  "minRows": 6, "printRows": 8, "rowImages": false, "statusColumn": false
}
```

**imageZone** - visual evidence.
```json
{ "type": "imageZone", "id": "z1", "minImages": 2, "captions": true, "points": 5, "printAs": "sketch" }
```
`printAs`: `"sketch"` (bordered box with caption lines), `"attach"` (space to staple a printed photo), `"notebookRef"` (a line for the notebook page reference).

**checklist** - binary completion items.
```json
{ "type": "checklist", "id": "c1", "points": 5, "items": ["Blank measured and recorded"] }
```

**calc** - **never author these in assignment specs. The assignment importer refuses them.** The `calc` type is valid only in reference documents, where it carries the read-only tools described in Part 2.

### declarations, approvalGate, print

```json
{ "academicIntegrity": true }
{ "afterModule": "m2", "label": "Instructor Approval Required" }
{ "linesPerSentence": 2 }
```

Declaration text is standard across materials and lives with the renderer, not per-spec. `approvalGate` is `null` when absent. Per-material print overrides are usually empty; see `IDEA_PRINT_STANDARDS.md`.

### Derived behavior, never authored

Preflight and completion criteria derive from block constraints (`minSentences`, `minRows`, `minImages`, checklist items, declaration). Self-score and points display derive from module and block points. Footer content derives from `meta`. If a completion rule cannot be expressed through block constraints, add it as a named entry in `customChecks` on the module with a plain-language description.

---

# Part 2: Reference Documents

Structured read-only documents rendered as a Materials post: a syllabus, a policy, a standing reference. No points, no student input, no submission.

Canonical form: one JSON file per document, named `[referenceId].reference.json`.

## Top-Level Structure

```json
{
  "kind": "reference",
  "schemaVersion": 2,
  "meta": {
    "referenceId": "idea209h-syllabus",
    "course": "IDEA209H",
    "title": "IDEA209H Digital Syllabus",
    "subtitle": "Engineering I Honors, Fall 2026",
    "buildVersion": "v3",
    "theme": "idea-green"
  },
  "navigation": "tabs",
  "sections": [ ]
}
```

- `kind` must be present and exactly `"reference"`. Unlike the assignment side, there is no default.
- `schemaVersion` must be the number `2`.
- `meta.referenceId` and `meta.title` are required and non-blank. **`referenceId` is authored metadata only.** It is validated, then never read by the route or the RPC. The public URL keys on the classroom item's UUID, not on this field.
- `subtitle`, `course`, `buildVersion`, and `theme` are optional and unvalidated.
- `navigation`: `"tabs"` or `"stacked"`, defaulting to `"tabs"` at render time.
- `sections`: required, non-empty, maximum 40.

## sections[]

```json
{
  "slug": "ai-policy",
  "title": "AI Policy",
  "blurb": "Optional one-line summary.",
  "blocks": [ ]
}
```

- `slug`: required, `^[a-z0-9]+(-[a-z0-9]+)*$`, 60 characters or fewer, unique within the document.
- `title`: required, non-blank.
- `blocks`: required, 1 to 60.

**Slugs are a permanent contract.** Assignments deep-link into reference documents (`/reference/<itemId>#ai-policy`) instead of restating policy. Uniqueness is enforced only within a single document; nothing stops a slug from changing, and nothing warns when one does. Treat a slug change as a breaking change and bump `buildVersion`.

## Block Types

All are display-only. None accept input or produce state.

**instructions** - markdown prose.
```json
{ "type": "instructions", "content": "Markdown. Headings h3 and h4 only." }
```
h1 and h2 belong to the document and section titles. Content is sanitized on render because reference documents can be served publicly.

**keyValue** - a compact facts strip.
```json
{ "type": "keyValue", "title": "optional", "items": [ { "label": "Term", "value": "Aug 17 to Dec 11, 2026" } ] }
```
1 to 40 items. `value` must be a JSON string, never a number or boolean.

**dataTable** - a static display table.
```json
{
  "type": "dataTable", "title": "optional", "caption": "optional",
  "columns": [ { "key": "date", "label": "Date" } ],
  "rows": [ { "date": "Mon, Aug 17" } ]
}
```
1 to 10 columns, keys matching `^[A-Za-z0-9_-]{1,40}$` and unique within the block. 1 to 200 rows, each a JSON object.

**Row keys are not checked against column keys anywhere**, in SQL or in the client. A mistyped row key imports cleanly and renders a blank cell. Verify locally.

**callout** - an emphasis box.
```json
{ "type": "callout", "variant": "required", "title": "optional", "content": "Markdown." }
```
`variant` is `info`, `warn`, or `required`.

**cardGrid** - 2 to 4 titled cards.
```json
{ "type": "cardGrid", "cards": [ { "title": "IDEA Classroom", "url": "https://...", "body": "optional" } ] }
```
`title` required. `url` optional; when present and non-empty it must start with `http://` or `https://`.

**linkCard** - 1 to 30 URLs as preview cards.
```json
{ "type": "linkCard", "links": [ { "url": "https://...", "fallbackLabel": "3M 60926 combination cartridge" } ] }
```
Both `url` and `fallbackLabel` are required. Previews are fetched server-side and cached; a failed fetch degrades to a plain link. **`fallbackLabel` stays on the page regardless**, which is why it is mandatory: retailer listings die, and a part number must remain readable when one does.

**calc** - read-only tools.
```json
{ "type": "calc", "tool": "gradeCalculator", "config": { } }
```

`gradeCalculator`: `config.categories` is 1 to 20 entries of `name`, `pointsPossible` (number, > 0), and `weight` (number, > 0), plus a required non-blank `config.disclaimer`. Entirely client-side; nothing is saved or transmitted.

`aiLevelLookup`: `config.entries` is 1 to 40 entries of `workType`, `level` (number, 0-3), `permitted`, and `notPermitted`, each non-blank, plus an optional `example`.

## Rejected Keys

These seven names may not appear as a key **anywhere** in a reference document, at any depth:

```
points  totalPoints  rubric  aiLevel  declarations  approvalGate  modules
```

The check walks objects and arrays to depth 12 inclusive and rejects rather than ignores. A reference document reads; it never collects work, so a rubric or a point value in one is a category error, not a stray field.

**This bites in practice.** A `dataTable` column key of `points` fails import with a message about references having no points, which reads as a schema disagreement rather than a naming collision. Use `pts`.

## Size

Payload cap of 400,000 bytes, enforced on write. Content well past a reasonable reference document.

---

## Publishing a Reference Document

1. Create a Material in IDEA Classroom.
2. Attach the spec on the item detail page. **`VALIDATE` only checks the JSON; `ATTACH DOCUMENT` is what saves it.**
3. Publish the item, and set `public` if it must be readable without a boscotech.net account.
4. Copy the public URL from the item's Public link badge.
5. For anything printed, add a short-link row at `/admin/links` pointing at that path, and print the short link rather than the UUID.

Writes require the caller to be teacher of record for **every** class the item is posted to, or admin. The item's `kind` must be `material`.

**Public reads answer identically for five different failure cases**: unknown id, private, unpublished, no document attached, and not a material. Good security, no diagnostic value. When a public URL 404s, check attachment state first, since a validated-but-not-attached document is the most common cause and looks identical to everything else.

---

## What Is Enforced Where

| Rule | SQL | Client | Local validator |
|---|---|---|---|
| Every content rule in Part 2 | Yes | Yes | Yes |
| 400 KB payload cap | Yes | No | Yes |
| Authorization, item kind, existence | Yes | No | No |
| dataTable row-to-column conformance | No | No | Warning only |

`tools/validate-reference-spec.py` mirrors the SQL validator and is run before every delivery. It exists because an import failure discovered in the Supabase SQL editor costs a round trip, and because the row-conformance gap is invisible to both enforced layers.

---

## Authoring Workflow

1. Read `IDEA_MATERIALS_PROCESS.md` to classify, and `IDEA_RUBRIC_STANDARDS.md` when authoring an assignment.
2. Propose structure in chat before writing any file: modules or sections, points, block types, rubric criteria with levels, AI level per module with a one-line rationale. AI levels require explicit confirmation.
3. Author to the constraints. Assignments never carry `calc` blocks. Reference documents never carry points, rubrics, or AI levels.
4. Run the local validator. Resolve every error and read every warning.
5. Deliver the spec file, plus any instructor-only materials in the same pass. Add a print rendering only when a print trigger applies.

Spec files are the version-controlled record. `buildVersion` bumps on breaking content changes, including a section slug change.

---

## Changelog

- **2.3 (2026-08-20)** - The figure gate comes off: figures in `instructions` content shipped in `cc9f9aa` and are now authorable in both kinds. Added a short note on what a figure costs, since it is a block rather than an inline and takes the full measure of its column. The two corrections in 2.2 are updated to past tense: `printAs` is removed, and `docs/IDEA_MATERIAL_SPEC_v1.md` is now a stub naming this document as canonical, with two applied migrations still citing the old path by comment and deliberately left, because an applied migration is an immutable record and the citation resolves to a stub that declares itself non-authoritative.

- **2.2 (2026-08-20)** - Figure syntax for `instructions` content recorded as a decision, gated as not yet implemented so nothing is authored against it early, with the same-origin allow list and the reasoning for an attachment alias rather than a file id. Two corrections from a read-only audit: there is no separate print renderer for spec blocks, print is component CSS and the dual engine-and-print contract asserted elsewhere is not implemented; and `printAs` is declared and read by nothing. Recorded that the in-repo `docs/IDEA_MATERIAL_SPEC_v1.md` is stale and non-authoritative, after it was cited as authority by an agent reading the repo, which is the same stale-base failure the delivery rules exist to prevent.

- **2.1 (2026-08-19)** - Two corrections to text that had already changed without a version bump or a changelog entry, which is the defect this entry exists to close. The `short` rubric-level field was added to `modules[]` alongside `IDEA_RUBRIC_STANDARDS.md` 1.1 and is now recorded here. The `instructions` budget is split into a 250-word authoring target and a 300-word enforced ceiling, because "roughly 250" is not a number a test can fail against and the budget was being carried as a preference rather than a constraint; the counting rule is stated so the guard and the author measure the same thing.

- **2.0 (2026-08-13)** - Added the `kind` discriminator and the full reference document shape, its seven block types, the rejected-key list, and the publishing path. Corrected assignment rubrics to leveled descriptors per `IDEA_RUBRIC_STANDARDS.md`. Recorded that `calc` blocks are refused by the assignment importer and valid only in reference documents. Added the enforcement matrix, since validation is now server-side and this document describes rejections rather than conventions.
- **1.0 (2026-08-10)** - Initial schema. Assignment and worksheet content format with print and engine dual rendering contract.
