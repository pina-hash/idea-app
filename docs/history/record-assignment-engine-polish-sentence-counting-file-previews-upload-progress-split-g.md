---
title: "Assignment engine polish: sentence counting, file previews, upload progress, split grading (`0112`)"
date: 2026-08-16
branches: []
migrations: ["0112"]
subsystems: ["IDEA Classroom"]
record_order: 60
---

Four fixes to the 0086 assignment engine and its grading console, all
reported from a real student/teacher test run. No schema change except the
one migration named below.

- **The sentence counter (`countSentences` in `assignment-spec.ts`, mirrored
  exactly by `_classroom_sentence_count`, redefined in
  `0112_classroom_sentence_count_fix.sql`, apply manually after `0111`).**
  The old rule was a bare split on runs of `. ! ?`, so a decimal (`3.5`), a
  chained one (`3.3.3.3`), an ellipsis (`...`) or an abbreviation (`Dr.`,
  `e.g.`) each inflated the count -- and since the preflight reads this exact
  function to decide whether a text block meets its `minSentences`, a student
  could satisfy a requirement without writing real sentences. Before
  splitting, a period is now PROTECTED (replaced with a non-splitting marker)
  when it is: part of an ellipsis (2+ consecutive dots), between two digits, or
  part of `e.g.` / `i.e.` / a short list of common titles/abbreviations
  (`mr`, `dr`, `etc`, `vs`, ...). Both the client function and the SQL
  function apply the exact same five-step transform (ellipsis -> decimals ->
  e.g. -> i.e. -> abbreviation list) -- **change both together or the live
  counter disagrees with the submit preflight it backs.** The counter is also
  a small pill now (a coloured dot + border, dim/amber/green), not a
  0.66rem line of text easy to miss.
- **File previews everywhere a file is shown.** `AttachmentList.svelte`
  (items, instructor-only materials) already thumbnailed images; it now also
  shows a short type badge (PDF / DOC / XLS / ZIP / ...) for anything that is
  not an image, via the new `fileKindLabel()` in `classroom.ts` (mime-type
  first, filename extension as the fallback -- the camera-upload lesson: a
  browser can legitimately fail to type a file). The real gap was
  `SubmissionFileRow[]` lists (a student's plain hand-in files, and the
  "Files handed in" list in the grading console), which showed a bare
  filename and size with no preview at all. `SubmissionFileList.svelte` is
  the `AttachmentList` convention applied there -- ONE renderer, mounted by
  both `AssignmentEngine.svelte`'s "Your files" section and
  `GradingConsole.svelte`, so a student's own list and what a teacher grades
  can never drift into showing different things. `isSubmissionFileImage()`
  (assignment-spec.ts) is the one image-type check both it and SpecRenderer's
  imageZone blocks read.
- **Upload progress on every file upload in the classroom module.**
  `src/lib/classroom/upload-progress.ts` (`postFormWithProgress`) is the
  deck uploader's own reasoning (deck-upload.ts: `fetch` cannot report
  upload progress in a browser, XHR can) applied to the plain one-request
  case every other upload actually is. `uploadAttachment` /
  `uploadInstructorAttachment` (transports.ts, ContentComposer's staged file
  list) and `uploadSubmissionFile` (the assignment engine, both the plain
  "Extra files" list and SpecRenderer's imageZone blocks) all take an
  optional trailing `onProgress` callback now and render a live percentage
  bar while `busy`/uploading. The dev harness (`/dev/classroom`) simulates
  staggered progress (`simulateUpload`) so the bar is browser-verifiable with
  no real network.
- **Grading console: work and rubric side by side.** The grader used to
  scroll a single column past the student's responses to reach the rubric,
  then back up to see a level's descriptor. `GradingConsole.svelte` now
  splits into `.work-split.has-rubric` (a two-column grid, left = gate +
  files + responses, right = the rubric card), each column independently
  `overflow-y: auto` up to `calc(100vh - 11rem)`. Below 900px it collapses to
  one stacked column exactly as before. Every existing grading rule is
  untouched -- the override comment requirement, scoring every criterion
  before return, and the level descriptors staying on screen at the point of
  selection are all the same code, only the layout around them moved.
- **Verified**: `npm run check` 0 errors, 36 warnings (the same 36 as HEAD).
  `npm test` 1065/1065. Browser-verified in `/dev/classroom`: the counter
  read 4 (was 7) on a pathological decimal/ellipsis string, 2 on `"Dr. Smith
  went to the store. He bought milk."`, 3 on an ellipsis+decimal sentence,
  and amber "1 sentence" below min; a staged PDF and PNG in the assignment
  engine's file list showed a `PDF` badge and a real image thumbnail with a
  live progress bar climbing 0% -> 100% during upload (confirmed on both the
  plain file list and an imageZone block); the composer's attachment upload
  showed the same live bar and the saved item rendered `DOC`/`PDF` badges;
  and the grading console's split rendered two non-overlapping columns at
  the same y-position with independent `scrollTop`, level descriptors intact
  in the right column, collapsing to one column with no overflow at 375px
  width.

