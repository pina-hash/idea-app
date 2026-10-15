# The IDEA certification package, format version 1

A certification travels as one ZIP so that a Claude chat can read, critique,
refine or author one from scratch, and the portal can import it with no deploy.
This file is the format's documentation and is addressed to an AI tool as much
as to a person: be literal, keep the spellings below, and do not invent keys.
`docs/certifications/DATA_MODEL.md` says how the same data is stored.

## The ZIP

```
<CODE>.idea-certification.zip
  certification.json           the manifest (required)
  study-guide.md               the study guide (required to publish)
  common-mistakes.json         array of { "title", "body" }
  practice-quiz.json           array of practice questions (see Questions)
  exam-pool.json               array of exam questions WITH answer keys (see Questions)
  guided-project.json          the guided project (see Projects)
  autonomous-project.json      the autonomous project
  checkout.json                { "card": "<markdown>", "filming_guide": "<markdown>" }
  videos.json                  the training items in order (see Training)
  lessons/<slug>.html          one interactive HTML lesson (optional, any number)
  lessons/<slug>.manifest.json the lesson's manifest (the HTML assignment engine's closed shape)
  README.md                    written by the exporter; explains the files; ignored on import
```

Every file is UTF-8. JSON files are objects or arrays exactly as described;
markdown files are plain markdown in the dialect the portal renders (headings,
paragraphs, lists, bold, italic, links, images by URL). No HTML in markdown.

The exporter writes every file, empty where the kit has nothing (`[]`, `""`). The
importer accepts a ZIP missing any optional file and treats it as empty. A
missing `certification.json` refuses the import.

## certification.json

```json
{
  "format": "idea-certification",
  "version": 1,
  "code": "MILL-1",
  "name": "Manual Mill Level 1",
  "level": 1,
  "category": "Machining",
  "sort_order": 10,
  "renewal": "never",
  "definition": "What holding this certification means, in one or two sentences.",
  "allows": "What a holder may do.",
  "does_not_allow": "What a holder may still not do.",
  "prerequisites": ["SAFE-1"],
  "parts": { "guided": true, "exam": true, "autonomous": true, "checkout": true },
  "exam": {
    "time_limit_minutes": 30,
    "questions_per_exam": 20,
    "topics": [
      { "id": "setup", "name": "Workholding and setup", "minimum": 3 },
      { "id": "speeds", "name": "Speeds and feeds", "minimum": 3 }
    ]
  }
}
```

Rules:

- `format` is exactly `idea-certification` and `version` is `1`.
- `code`: uppercase letters, digits and hyphens, 1 to 32 characters, starting
  with a letter or digit. It is the certification's identity. Importing a code
  the portal already has creates a NEW REVISION of that certification;
  importing a new code creates a DRAFT.
- `level`: an integer 1 to 9. `sort_order`: an integer; the catalog orders by
  category (earliest sort_order first), then sort_order, then level, then code.
- `renewal`: `never` or `school_year` (expires on the school-year date the admin
  sets; SAFE-1 and RESP-1 use it).
- `prerequisites`: codes of other certifications. `[]` when none. A code the
  portal does not know refuses the import.
- `parts`: which of the four waivable parts this certification uses. Training
  content is always required and is not listed here. A part set to `false` is
  shown on the checklist as waived.
- `exam` is required when `parts.exam` is true. Every topic `id` is unique,
  lowercase, letters digits and hyphens. `minimum` is how many questions of that
  topic every exam must contain (at least 1). The sum of minimums may not exceed
  `questions_per_exam`. The pool must hold at least `questions_per_exam` times
  two questions in total, and every topic must hold at least its minimum.

## Training: videos.json

An ordered array. Each item is one of:

```json
{ "kind": "video", "key": "yt:dQw4w9WgXcQ", "title": "Part 1: the vise", "youtube_id": "dQw4w9WgXcQ", "start": 0 }
{ "kind": "lesson", "key": "lesson:tramming", "title": "Tramming the head", "slug": "tramming" }
```

- `youtube_id` is the 11-character id of a PUBLIC YouTube upload. The portal
  plays it embedded, tracks played seconds, caps speed at 2x and asks random
  Continue check-ins. `start` is an optional whole second to begin at.
- `slug` names `lessons/<slug>.html` in the same ZIP (or a lesson the portal
  already holds for this code). The lesson runs in the HTML assignment engine
  in a sandbox; see `docs/standards/IDEA_HTML_ASSIGNMENT_SPEC.md` for what a
  document may contain and `lessons/<slug>.manifest.json` for its blocks (an
  empty manifest `{}` is fine for a lesson with nothing to answer).
- `key` is the stable identity progress is saved under: `yt:<id>` or
  `lesson:<slug>`. Renaming a key loses the students' progress on it.

Quick checks ride in `videos.json` too, as a second top-level form:

```json
{ "items": [ ...the items above... ],
  "quick_checks": [
    { "id": "qc-1", "after": "yt:dQw4w9WgXcQ", "prompt": "Which way does the vise jaw move?", "options": ["Toward you", "Away from you"], "answer": 0, "explain": "The fixed jaw is at the back." }
  ] }
```

Either a bare array (items only) or this object is accepted. Quick checks are
ungraded; `after` names the item they follow; `answer` is the index of the
right option; `explain` is shown after answering.

## Questions

`practice-quiz.json` and `exam-pool.json` are arrays of questions. A practice
question is the simple shape above (prompt, options, answer index, explain).
An exam question carries its topic and type:

```json
{ "id": "optional-stable-id", "topic": "setup", "type": "multiple_choice",
  "prompt": "The vise should be...", "options": [ { "key": "a", "text": "..." }, { "key": "b", "text": "..." } ],
  "answer": "a", "explain": "optional, shown to nobody during the exam", "active": true }
{ "type": "multiple_select", "answer": ["a", "c"], ... }
{ "type": "numeric", "prompt": "RPM for a 1/2 in HSS end mill in aluminum at 300 SFM?", "answer": { "value": 2292, "tolerance": 50, "unit": "rpm" } }
{ "type": "short", "prompt": "Name the tool that trues a hole to size.", "answer": { "accept": ["reamer", "a reamer"] } }
```

- Option keys are single lowercase letters, unique within the question, 2 to 8
  options. The portal shuffles option order per student, so never write "all of
  the above".
- A `short` answer is compared after lowercasing, trimming, collapsing spaces
  and dropping a trailing period. List every spelling you accept.
- `active: false` keeps a question out of new draws without deleting it.
- The practice quiz must not reuse exam questions: paraphrase the topics.

## Projects

`guided-project.json` and `autonomous-project.json`:

```json
{
  "objective": "One sentence: what the student makes or does.",
  "spec": "<markdown: the full specification and acceptance criteria>",
  "acceptance": ["Flat to 0.002 in", "Edges deburred"],
  "references": [ { "label": "Drawing", "href": "https://..." } ],
  "steps": [
    { "title": "Square the stock", "body": "<markdown, full instructions>", "fade": "full" },
    { "title": "Cut the step", "body": "<markdown: the goal only>", "fade": "goal", "hint": "Climb mill the last pass." },
    { "title": "Finish", "body": "", "fade": "hint", "hint": "Think about tool deflection." }
  ],
  "self_inspection": ["I measured every dimension on the drawing", "I deburred every edge"],
  "evidence": [
    { "kind": "photo", "label": "The finished part beside the drawing", "required": true },
    { "kind": "text", "label": "Your measured dimensions", "required": true },
    { "kind": "youtube", "label": "A short clip of the last cut", "required": false }
  ]
}
```

- `steps` exist only on the GUIDED project. `fade` is how much help the step
  shows: `full` (everything), `goal` (the goal, with the hint behind a click),
  `hint` (only a hint behind a click). Help should fall away toward the end.
- The autonomous project has no `steps`: objective only. The portal states that
  outside help voids the attempt.
- `evidence` kinds: `photo`, `file`, `text`, `link`, `youtube`. Video evidence
  is only ever a YouTube link; the portal stores no video.

## Checkout

`checkout.json` is `{ "card": "<markdown>", "filming_guide": "<markdown>" }`:
what the checkout demonstrates, and how to film one continuous, unedited take
uploaded to YouTube as unlisted. Required when `parts.checkout` is true.

## Import behavior

1. The portal unpacks the ZIP in the browser, validates every file against this
   format, and shows the problems if any.
2. It shows a diff against the current revision (new code: everything is new).
3. On confirm, an existing code gets a new revision; a new code becomes a draft.
   The exam pool is replaced whole (questions absent from the file are
   deactivated, never deleted). Lessons present in the ZIP are upserted by slug.
4. Nothing is published by importing. Publishing is a separate press and
   refuses an incomplete kit.
