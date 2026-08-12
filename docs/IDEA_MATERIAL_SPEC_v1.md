# IDEA Material Spec - Schema v1
**Version 1.0 - 2026-08-10**
The canonical authoring format for IDEA assignments and worksheets. One spec per material. The spec is the durable, version-controlled asset; every rendering (print, engine) is generated from it. When the idea-app engine goes live, specs import directly - no content rework.

Canonical form: one JSON file per material, named `[assignmentId].spec.json`.
ID convention unchanged: `[course]-[project or unit]-[assignment#]`, lowercase, hyphens only. Examples: `idea209h-u1-03`, `idea100-blade-02`.

---

## Top-Level Structure

```json
{
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

- `totalPoints` must equal the sum of module points. Verified before delivery.
- `dueDate` is fixed at authoring. Deadlines are firm; no rendering may imply flexibility.
- `theme` selects an aesthetic from the design system. Print renderings ignore it (print is always the light print theme); the engine applies it.
- `gradingCategory` matches the course's locked grading system categories.
- `headerFields`: `studentName` and `date` always present. Add others as needed.
- `buildVersion`: bump on breaking content changes (module removed, points changed, field IDs renamed). Wording fixes do not bump.

### modules[]

```json
{
  "id": "m1",
  "title": "Appearance-Based Identification",
  "points": 20,
  "aiLevel": 1,
  "intro": "One short paragraph of module context. Markdown allowed.",
  "blocks": [ ],
  "rubric": [
    { "criterion": "All six materials correctly identified", "points": 10, "descriptor": "Full credit requires correct ID with stated visual justification." }
  ]
}
```

- `aiLevel`: 0-3 per `IDEA_AI_Use_Policy.md` category defaults, recommended by chat, confirmed by Alejandro before the spec is finalized. `null` omits the badge (live/in-person components graded outside the material).
- `rubric` per module. Rubric points must sum to module points.

### Block Types

Every block type defines both an engine rendering and a print rendering. That dual contract is what makes specs portable. Blocks appear in `blocks[]` in display order.

**instructions** - static content.
```json
{ "type": "instructions", "content": "Markdown text. May include numbered procedures." }
```
Print: rendered as body text. Engine: rendered as module content.

**textField** - written student response.
```json
{ "type": "textField", "id": "f1", "prompt": "Explain why 304 stainless resists corrosion better than 1018 steel.", "minSentences": 3, "maxSentences": 5, "points": 5 }
```
Print: prompt followed by ruled response lines (see `IDEA_PRINT_STANDARDS.md` for line count rules). Engine: auto-resizing textarea with sentence counter (dim / amber / green states).

**table** - structured data entry.
```json
{
  "type": "table", "id": "t1", "points": 10,
  "columns": [
    { "key": "material", "label": "Material", "tip": "Material — Name from the six-material set." },
    { "key": "observation", "label": "Visual Observation", "tip": "Visual Observation — What you see: color, luster, weight feel." }
  ],
  "minRows": 6,
  "printRows": 8,
  "rowImages": false,
  "statusColumn": false
}
```
Print: table with `printRows` blank ruled rows (default `minRows + 2`). Engine: add/duplicate/delete/reorder rows, tooltips from `tip`, optional per-row images and status color-coding.

**imageZone** - visual evidence.
```json
{ "type": "imageZone", "id": "z1", "minImages": 2, "captions": true, "points": 5, "printAs": "sketch" }
```
`printAs` controls the print rendering:
- `"sketch"`: bordered sketch box with caption line(s).
- `"attach"`: labeled space instructing the student to staple or tape a printed photo.
- `"notebookRef"`: a line for the student's engineering notebook page reference (the digital notebook system captures the actual image).
Engine: upload zone with paste support, captions, lightbox, minimum count.

**checklist** - binary completion items.
```json
{ "type": "checklist", "id": "c1", "points": 5, "items": ["Blank measured and recorded", "Tool zeroed before first cut"] }
```
Print: checkbox list. Engine: interactive checkboxes counted toward completion.

**calc** - engine-only computed tools (dual-unit sync, stat bars, fit calculator).
```json
{ "type": "calc", "id": "k1", "tool": "dualUnit", "config": { }, "printAs": "manualTable", "printConfig": { } }
```
Every `calc` block must declare a `printAs` fallback: `manualTable` (student computes by hand into a table), `worked` (values provided, student interprets), or `omit` (engine-only, points shift per an explicit note in the spec). No calc block ships without its print fallback defined.

### declarations

```json
{ "academicIntegrity": true }
```
Print: declaration text with a signature and date line. Engine: required checkbox, blocked submit without it. Declaration text is standard across materials and lives with the renderer, not per-spec.

### approvalGate

`null` when absent. When present:
```json
{ "afterModule": "m2", "label": "Instructor Approval Required" }
```
Print: instructor initials + date line at that position. Engine: gated modules per the established gate behavior (animations are Phase 2 polish).

### print

Per-material print overrides. Usually empty. See `IDEA_PRINT_STANDARDS.md` for defaults.
```json
{ "linesPerSentence": 2 }
```

---

## Derived Behavior (never authored manually)

- **Preflight / completion criteria** derive from block constraints: `minSentences`, `minRows`, `minImages`, checklist items, declaration. Print renders these as a completion checklist near the header ("done" is unambiguous). Engine runs them as preflight before submit.
- **Self-score / points display** derives from module and block points.
- **Footer content** derives from meta: assignment title, course ID, school name, total points, build version.

If a completion rule cannot be expressed through block constraints, it is added as a named entry in a `customChecks` array on the module with a plain-language description, and implemented explicitly in the engine when that material is imported. Print renders the description as a checklist line.

---

## Authoring Workflow

1. Chat drafts the spec from the pacing entry and content discussion.
2. Chat presents for approval: module structure, points, AI levels (with one-line rationale each), and theme recommendation.
3. On approval, the spec JSON is finalized and delivered alongside its print rendering.
4. Spec files accumulate as the material library. When the engine's import path exists, the library seeds it.

Point totals, rubric sums, and calc print-fallbacks are verified before every delivery.
