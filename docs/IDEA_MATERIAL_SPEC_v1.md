# IDEA Material Spec - Schema v1.1
**Version 1.1 - 2026-08-13**
The canonical authoring format for IDEA assignments and worksheets. One spec per material. The spec is the durable, version-controlled asset; every rendering is generated from it.

Canonical form: one JSON file per material, named `[assignmentId].spec.json`.
ID convention: `[course]-[project or unit]-[assignment#]`, lowercase, hyphens only. Examples: `idea209h-u1-03`, `idea100-blade-02`.

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

- `totalPoints` must equal the sum of module points.
- `dueDate` is fixed at authoring. Deadlines are firm; no rendering may imply flexibility.
- `theme`: engine materials use `idea-green`. The engine ships no other themes yet. Per-material theme selection applies only to Claude Design output.
- `gradingCategory` matches the course's locked grading categories exactly, since it feeds the FACTS export.
- `headerFields`: `studentName` and `date` always present.
- `buildVersion`: bump on breaking content changes (module removed, points changed, field ids renamed). Wording fixes do not bump.

### modules[]

```json
{
  "id": "m1",
  "title": "Appearance-Based Identification",
  "points": 20,
  "aiLevel": 1,
  "intro": "One short paragraph of module context. Markdown allowed.",
  "blocks": [ ],
  "rubric": [ ]
}
```

- `aiLevel`: 0-3 per `IDEA_AI_Use_Policy.md` category defaults, recommended by chat, confirmed by Alejandro before the spec is finalized. `null` omits the badge.
- `rubric`: leveled criteria per `IDEA_RUBRIC_STANDARDS.md`. Criterion maximums must sum to module points.

### rubric[] (changed in v1.1)

Each criterion carries an ordered list of levels. Flat single-descriptor criteria are no longer valid.

```json
{
  "id": "c1",
  "criterion": "Material identification",
  "levels": [
    { "points": 10, "label": "Complete",   "descriptor": "All six materials correctly identified, each with a stated visual justification." },
    { "points": 7,  "label": "Proficient", "descriptor": "Four or five correctly identified with justification." },
    { "points": 4,  "label": "Developing", "descriptor": "Two or three correctly identified, or all six with no justifications." },
    { "points": 0,  "label": "Absent",     "descriptor": "Fewer than two correct, or not attempted." }
  ]
}
```

Structure, point distribution, and descriptor language are governed by `IDEA_RUBRIC_STANDARDS.md`. Read it before authoring any rubric. Hard constraints in summary: three or four levels, top level equals the criterion maximum, bottom level is 0, descriptors observable and countable, level labels consistent within an assignment.

### Block Types

Blocks appear in `blocks[]` in display order. Each type defines an engine rendering and a print rendering; the dual contract is what makes specs portable.

**instructions** - static content.
```json
{ "type": "instructions", "content": "Markdown text. May include numbered procedures." }
```

**textField** - written student response.
```json
{ "type": "textField", "id": "f1", "prompt": "Explain why 304 stainless resists corrosion better than 1018 steel.", "minSentences": 3, "maxSentences": 5, "points": 5 }
```
Engine: auto-resizing textarea with a live sentence counter (dim / amber / green). Print: prompt plus ruled response lines.

**table** - structured data entry.
```json
{
  "type": "table", "id": "t1", "points": 10,
  "columns": [
    { "key": "material", "label": "Material", "tip": "Material - Name from the six-material set." },
    { "key": "observation", "label": "Visual Observation", "tip": "Visual Observation - Color, luster, weight feel." }
  ],
  "minRows": 6,
  "printRows": 8,
  "rowImages": false,
  "statusColumn": false
}
```

**imageZone** - visual evidence.
```json
{ "type": "imageZone", "id": "z1", "minImages": 2, "captions": true, "points": 5, "printAs": "sketch" }
```
`printAs`: `sketch`, `attach`, or `notebookRef`.

**checklist** - binary completion items.
```json
{ "type": "checklist", "id": "k1", "points": 5, "items": ["Blank measured and recorded", "Tool zeroed before first cut"] }
```

**calc** - RESERVED, NOT YET SUPPORTED. The engine's spec importer refuses calc blocks by name. Do not author them. Materials needing computed tools use a table with a hand-computed column until the block type ships. The shape is retained here so the type name stays reserved:
```json
{ "type": "calc", "id": "k9", "tool": "dualUnit", "config": { }, "printAs": "manualTable" }
```

### declarations

```json
{ "academicIntegrity": true }
```
Engine: required checkbox, blocked submit without it. Declaration text lives with the renderer, not per-spec.

### approvalGate

`null` when absent. When present:
```json
{ "afterModule": "m2", "label": "Instructor Approval Required" }
```
Engine: gated modules locked until a teacher approves, enforced server-side at save, upload, and submit.

### print

Per-material print overrides. Usually empty, and only relevant when a print trigger from `IDEA_MATERIALS_PROCESS.md` applies.

---

## Derived Behavior (never authored manually)

- **Preflight and completion criteria** derive from block constraints: `minSentences`, `minRows`, `minImages`, checklist items, declaration. The engine recomputes preflight server-side on submit regardless of client state.
- **Points display** derives from module and block points.
- **Footer content** derives from meta.

If a completion rule cannot be expressed through block constraints, add it as a named entry in a `customChecks` array on the module with a plain-language description.

---

## Authoring Workflow

1. Chat drafts the spec from the pacing entry and content discussion.
2. Chat presents for approval: module structure, points, block types, rubric criteria with levels, and AI levels with a one-line rationale each.
3. On approval, the spec JSON is finalized and delivered as a file for engine import.
4. Alejandro imports the spec in IDEA Classroom, generates the rubric, and verifies through view-as-student before publishing.

Verified before every delivery: module points sum to total, criterion maximums sum to module points, top level equals criterion maximum and bottom level is 0 on every criterion, block ids unique, no calc blocks.

---

## Changelog

- **1.1 (2026-08-13)** - Rubric criteria changed from flat single-descriptor to leveled, governed by the new `IDEA_RUBRIC_STANDARDS.md`. Flat criteria are no longer valid. `calc` marked reserved and unsupported, since the engine importer refuses it. Authoring workflow corrected: specs are delivered for engine import, not paired with a print rendering by default. Theme guidance corrected to `idea-green` for engine materials.
- **1.0 (2026-08-10)** - Initial schema.
