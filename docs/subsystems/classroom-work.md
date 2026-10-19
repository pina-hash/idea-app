# Classroom work: notebook capture, item page, thumbnails, what a student owes

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). Notebook capture, the item page media and feedback card, post thumbnails, and the owed-work predicates. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

### NOTEBOOK CAPTURE -- where the work is, and never only in memory

**A STUDENT ADDS TO THEIR NOTEBOOK FROM THE ASSIGNMENT PAGE, AND IT FILES ITSELF
(ledger 0297).** `NotebookCapture.svelte` sits in the item page's check-in card
for a student (never for a manager, never on an announcement). `captureFiling`
in `$lib/notebook/capture.ts` is the one answer to "where does this go": the
item's check-in (its session and section) when it has one, otherwise the class
with the item's title as the entry's custom label. No migration was needed:
the columns were all there.

- **A PHOTO IS WRITTEN TO THE DEVICE BEFORE IT IS SENT, AND UPLOADED AS A DRAFT
  THE MOMENT IT IS TAKEN.** `$lib/notebook/capture-store.ts` is an IndexedDB
  store per viewer and per filing with a 24-hour expiry, and it never rejects:
  a full or blocked store comes back as a state the surface says out loud.
  `$lib/notebook/capture-queue.ts` uploads serially and a failure holds the
  line. This is the draft-mirror rule's photo half; the capture NOTE has no
  mirror yet, which is recorded as open.
- **THE RETRY IS IDEMPOTENT THROUGH A TOKEN IN THE FILENAME, BECAUSE THE PHOTO
  ROWS HAVE NO OTHER KEY.** A capture carries `CAPTURE_TOKEN_TAIL` in its
  original filename and a retry re-reads the entry's photos for it before
  sending again, so a dropped connection never doubles a page;
  `displayPhotoName` strips it so the tag never shows. An idempotency column
  would retire it, and that is a migration, not a rename.
- **STRAIGHTENING IS A CHOICE AFTER THE FACT, AND PAIRING STAYS ADJACENCY.** An
  enhanced copy pairs with the original before it, so only the LATEST page may
  be straightened, removing a page removes its enhanced copy first
  (`pageRemovalOrder`), and a restore is refused unless the pairing map is
  unchanged (`restoreKeepsPairing`). Every order of add, straighten, remove and
  restore to depth 8 is enumerated in `tests/notebook-capture.test.ts`; a looser
  rule is how a straightened page ends up beside the wrong original.
- **ONE-PASS APPROVAL IS THE EXISTING TWO WRITERS, NEVER A THIRD.**
  `approveAction` in `$lib/notebook/review-queue.ts` sends `notebook_accept_entry`
  with no comment and `notebook_resolve_entry` (the only writer of an
  instructor comment) with one; `reviewQueue` never sweeps in a flagged entry
  and reads "cannot tell" as not reviewed. `EntryVerdict.svelte` is the one
  renderer of a flag or a next step, on the student's card and in review alike.
- **THE CLASS TIMELINE IS READ-ONLY OVER HAND-INS AND ITS STREAK IS NEVER
  RANKED** (`$lib/notebook/timeline.ts`, `classDayStreak`): a student's own count
  of consecutive class days with an entry, where a today with nothing filed yet
  does not break it, and no surface compares one student's streak to another's.

### THE ITEM PAGE'S MEDIA AND FEEDBACK -- one card, one viewer, one router

**A RETURNED GRADE IS ONE CARD ON EVERY ENGINE, AND THE COMMENT COMES BEFORE
THE BREAKDOWN (ledger 0297).** `ReturnedGrade.svelte` renders the score, the
teacher's comment, then `RubricView`; `AssignmentEngine` mounts it for a spec
assignment and `ItemDetail` mounts it in PARENT CHROME for a ported HTML
document and an IdeaCAD link, never inside the sandboxed frame. At 375 the
comment used to sit 1065px under the grade. "How this is graded" is a
`Disclosure` over the stored rubric (never a spec-derived copy) at the BOTTOM
of the item page, after the work and before the footer, closed for every role
(`collapseWhen` constant-true, latched; a person's own press is remembered per
item under `item:<id>:rubric`), and a returned card replaces it so the rubric
is never shown twice; that card keeps its score and comment above the work and
folds its breakdown behind the same choice (ledger 0360, report R20: the work
starts 927px higher at 1440 on a new assignment). **The item page's panels are
`PanelStack` around the work** (see "EACH PERSON'S PAGE LAYOUT"): `ItemDetail`'s
`itemPanel` and `workPanel` snippets sit inside its `main`, where the markup
always did, and with no stored layout the order is `itemPanelDefaults(layout)`,
the rubric last.

- **EVERY PICTURE IN THE CLASSROOM OPENS IN `$lib/media/Lightbox.svelte`**, a
  native `<dialog>` on `$lib/panzoom` (no second pan/zoom), with Download as an
  `<a download>` to the same proxy URL the thumbnail uses, so no serve route
  changed. Body figures, handouts and galleries, imageZone photos, hand-ins
  (which is also the grading console's view) and authored figures all open it,
  and `PhotoViewer` is a thin wrapper over it. Every drag has a button
  alternative that appears only for an axis the picture actually overflows.
- **A ZIP OF PICTURES IS A GALLERY WITH NO MIGRATION.** `ZipChoice.svelte` asks
  in words (Presentation, Image gallery, Attach as a file); `gallery-zip.ts`
  reads the zip in the browser with Foundry's reader and uploads each picture as
  an ordinary attachment through `uploadClassroomFile`, so a second zip adds to
  the same set. **Named, separate galleries need a column** and are not encoded
  in filenames.
- **A DROPPED FILE GOES TO THE BOX WHOSE OWN ACCEPT RULE MATCHES IT.**
  `composerDropRoute` in `$lib/classroom/composer-drop.ts` reads each box's own
  constant (`SPEC_ACCEPT`, `HTML_DOCUMENT_ACCEPT`, `DECK_ACCEPT`), the composer's
  root never takes a file a nested box should have, and the drop scrolls the
  receiving box into view. `FileUploadPanel` still accepts every type.
  **On the EDIT form a spec or a ported document is never an ordinary file**
  (reports R01, R11): a spec goes to the item page's own importer through
  `specDrop` (the edit form still carries no importer of its own), a web page
  goes to the replace box, and where the item cannot take one the root REFUSES
  it in words (`composerDropRefusal`), naming the file and saying how to hand it
  out on purpose. A refusal stays on screen until the next drop. The composer's
  drop zone is off only while a save runs, never because of
  `attachmentsEnabled`. **A drop on the class page is a manager's New post**:
  ClassView hands the files up (`onDropFiles`), the section layout opens a fresh
  composer with `initialFiles`, and `composerKindForDrop` picks the kind before
  the SAME router runs, so the class page never gains a second idea of where a
  file goes.
- **THE DECK CAP IS THE TRANSPORT'S, AND 4 MiB IS IT.** A deck uploads as one
  multipart POST that our own function buffers; the 150 MiB figure is a guard on
  the zip already stored in Drive and no browser request reaches it. Raising the
  client cap needs one measured request on a Vercel preview first.
- **A CLAUDE DESIGN DECK BUILDS `<deck-stage>` LATE.** Its export loads React
  from a CDN before the element exists, so `DeckViewer` keeps watching the frame
  after `load`; a control wired only at `load` never appears.
- **A YOUTUBE LINK GETS A THUMBNAIL CARD ONLY ON YOUTUBE'S OWN HOSTS, AFTER
  `safeHref`, WHERE IT IS A PARAGRAPH OR ENDS ONE** (`$lib/youtube.ts`, which
  `gauntlet/authoring.ts` re-exports), with `referrerpolicy="no-referrer"`, no
  server fetch and no new document node. Decision 23 stands. **The "ends one"
  limit is about prose, not about videos**: the class page's closed Videos
  section (`ClassVideos.svelte` over `$lib/classroom/class-videos.ts`, ledger
  0298) cards EVERY such link in the loaded items, mid-sentence ones too, with
  the same two predicates, never reads `instructorLinks`, and never lists a
  video from a draft or a scheduled item (a manager is told how many it holds
  back).

### POST THUMBNAILS -- a slot, a shape that is CSS, and a frame the parent owns

**EVERY POST HAS A THUMBNAIL SLOT AND `PostThumbnail.svelte` IS ITS ONE
RENDERER (0268, ledger 0396, report a6a037f3).** A slot shows a picture a
teacher set, a live HTML thumbnail the document's manifest declares, or the
generated identity (the post's kind glyph on a plate tile tinted by its unit);
no row means the generated identity, so a class page is never a wall of text.
The class page rows, the home page's class card rows and the to-do rows mount
it; the lists deliberately left without one are named in that ledger's history
entry. **A post is one identity on the class page and on the home page**: the
home load reads each course's unit order (`loadClassroomWork`'s `units`, one
read, skipped while nothing is filed) so `unitTint` gives a post the same tint
in both, and the home card's Tile and Off draw `KIND_GLYPHS`, never a second
glyph set.

- **A ONE-TO-ONE TABLE, NEVER COLUMNS ON `classroom_items`.** Items are copied,
  revisioned and exported, and a column joins every one of those paths.
  `classroom_item_thumbnails` is read through its own ladder rung
  (`ITEM_SELECT_THUMBS`) and written only by 0268's definer functions, gated on
  the existing manage predicates. **A hand-set thumbnail beats the manifest
  structurally**: the document trigger's sync (`_classroom_thumbnail_sync`)
  never overwrites a `manual` row, and Automatic deletes it and re-reads the
  manifest. A manifest naming a template the document does not carry writes no
  live row (`_classroom_html_may_carry_template`, deliberately wider than the
  route's exact `servedThumbnailTemplate`, so a document the route serves always
  gets one).
- **THE SHAPE IS A DISPLAY SETTING, NEVER A PROPERTY OF THE POST, AND IT IS
  CSS.** `resolveThumbShape` is the one precedence (the person's
  `display.thumbShape`, per device, then the class default on
  `classroom_sections`, then Tile, never Off by default). The slot's size comes
  from `--thumb-w`, `--thumb-h` and `--thumb-shape` keyed on `data-shape`, so a
  new shape is a rule plus a `THUMB_SHAPES` entry and never a data change; a
  picture is `object-fit: cover` around its stored focal point.
- **THE TILE SITS INSIDE THE ROW'S OWN LINK**, so a row stays one 44px target;
  only an `"interactive": true` live thumbnail sits beside it and keeps its own
  clicks. A non-interactive frame is inert and the slot forwards the pointer to
  it, because a parent cannot learn whether a click inside a cross-origin
  sandboxed frame was handled.
- **A LIVE THUMBNAIL IS SERVED BY `/hx/<doc>/thumbnail` UNDER THE WORKSHEET
  ROUTE'S OWN GATES AND HEADERS**: the author's template contents byte for byte
  inside a fixed shell, `HX_SANDBOX_FLAGS`, never `allow-same-origin`, and a
  bridge (`hxThumbReceive`) that answers only the frame's own window at the
  sandbox's expected origin. Draft and scheduled posts plan the generated look
  (`thumbnailPlan`, on the loader's clock), so no frame is made for a post the
  route refuses.
- **PERFORMANCE IS THE PARENT'S JOB** (`HtmlThumbnailFrame.svelte`): frames are
  made near the viewport, one per idle period and never while scrolling,
  paused off screen, in a hidden tab and while scrolling, and taken down far
  away; under reduced motion a thumbnail draws `HX_THUMB_STILL_FRAMES` frames and
  stops, never nothing. A `:has(... :hover)` rule over the list cost 704ms of
  style work in 3s at 4x CPU, which is why the row hover is written with
  descendant rules only.

### WHAT A STUDENT OWES -- one predicate, one read, one day

**"MISSING" HAS ONE IMPLEMENTATION: `assignmentStanding` AND `checkInStanding`
in `$lib/classroom/classroom.ts` (ledger 0297).** The class filter, the row chip,
the to-do page, the home feed's overdue case and every count ask it. A second
spelling of "past due and nothing turned in" is how a row reads "Not started"
while the Missing filter lists it, which is exactly what shipped before it.
Undated work is never Missing and never counted; it is listed last.

- **ONE PREDICATE IS NOT ENOUGH: ITS INPUTS ARE ONE SET TOO, AND UNTIL LEDGER
  0298 THEY WERE NOT.** This section said the surfaces "cannot disagree" because
  they asked one function, while the class page handed it only the check-ins
  with a stream row of their own and the to-do handed it all of them; a
  check-in attached to an item (0120) read "1 missing" on My Classes and the
  to-do and 0 on the class page, with nothing there to show for it. Every
  surface now hands in EVERY check-in: the class page draws an attached one as
  a chip on its item (`attachedCheckInChip`, grouped once by `checkInsByItem`)
  and its filter keeps that item when the check-in is what matches.
- **A FINISHED PORTED WORKSHEET IS DONE, AND THAT IS A DERIVED INPUT, NEVER A
  STATE (decision 37).** A schema-3 document has no turn-in, so every one read
  Missing from its due instant until a grade was returned. `hxCompletion` in
  `$lib/classroom/html-assignment/progress.ts` is the progress rail reaching
  100% (never `hxIncompleteBlocks` alone, which passes an empty worksheet whose
  manifest asks for no sentences), and `readWorksheetCompletions` reads it from
  the caller's own answers and photos -- paged, because PostgREST truncates at
  1000 rows without an error -- for the home page, My Classes, the to-do and the
  class page alike. Its answer rides on the submission rows as a derived
  completed_at (`withWorksheetCompletions`), so `assignmentStanding`, the chip
  ("Complete", or "Complete, late" in a word and a tone), the filters and
  `isAwaitingGrade` all read it with no new parameter anywhere.
  **Saving an answer creates no submission row** (only a file, a grade, a submit
  or a close does), so a finished worksheet with none gets a derived draft row.
  **The state is never moved to `submitted`**: that locks saves (0197). A read
  that cannot answer changes nothing.
  - **A FINISHED WORKSHEET STAYS FINISHED, WHICH A DERIVED COMPLETION CANNOT
    PROMISE ON ITS OWN (ledger 0380, report e32659e9).** Completion is judged
    against the manifest the worksheet has TODAY, so the day an author adds a
    required block (or raises a `minSentences`, or drops an `optional`) every
    student who had finished reads Missing or In progress on every surface at
    once. `classroom_worksheet_latches` (0237) keeps the first moment a
    student's own load found it complete, and readers see the UNION
    (`mergeLatches`: the earlier instant wins, so a later edit cannot make a
    finished worksheet late). **A LATCH IS A LABEL AND NOTHING ELSE**: it is
    never `submitted` (that locks saves, 0197), decides no grade and gates no
    write; the derivation still runs beside it. It is stamped only by `classroom_worksheet_latch`
    from the student's own pinned read (`latches: { stamp: true }` in
    `readWorksheetCompletions`) and read back through
    `classroom_worksheet_latched`, which answers a student their own rows and a
    manager every student's in a section they manage in one primary-key lookup
    (so the grading roster, the live grid and the people page take it with no
    per-row policy cost). Where 0237 is not applied every read is the
    derivation alone.
  - **A WORKSHEET FINISHED BEFORE ITS LATCH EXISTED IS JUDGED AGAINST THE
    WORKSHEET IT WAS (ledger 0381, 0238 part B, report e32659e9 again).** A
    latch is stamped only from a load that found the work complete, so a
    student who finished before 0237 and whose worksheet was edited since had
    no latch and read Missing. `classroom_worksheet_past_manifests` answers each
    item's displaced manifests (the newest twenty `classroom_content_revisions`
    rows, readable by anyone who can read the item), and
    `worksheetCompletedAtAcross` in `$lib/classroom/student-work.ts` counts the
    work complete against the current manifest OR any past one; the student's
    own read then stamps it as before. The grading console stamps it too,
    through `classroom_worksheet_latch_for` (a reviewer of that student only,
    insert-if-absent, never a later instant than now), once per student it
    judges finished with no latch, so a finish found on a teacher's screen
    reaches the student's surfaces. **The Grades tab now counts it**:
    `assignmentStandings` takes the latched and derived finishes as its
    `finished` input, so a finished, ungraded worksheet is awaiting a grade
    there, never missing.
  - **THE READ IS PINNED TO ONE ADDRESS, ALWAYS -- THE CALLER'S OWN, OR ON ONE
    STUDENT'S PAGE THE ONE STUDENT A MANAGER OPENED -- AND THE TEACHER'S HOME
    TALLY DOES NOT GET ONE.** `classroom_responses` is policed per row
    (own address, or `classroom_can_review_submission`), so an answers read
    with no `student_email` filter visits every classmate's answer to refuse
    it: measured on the test cluster, one 60-block worksheet in four classes of
    30 cost 8.1 to 8.8 seconds per count as a student unpinned and 2 to 3ms
    pinned, and 3.6 to 3.9 seconds as an admin reading everybody's. So
    `loadClassroomWork` reads only the classes the caller takes
    (`worksheetCandidates`), with `onlyEmail`, and the teacher surfaces that
    say Complete are the ones that already hold ONE item's answers: the
    grading console's roster, and the Live tab's grid, which judges the
    grading read it already polls with `worksheetCompletedAt` against the
    manifest from `readWorksheetManifests` (two reads pinned to the item, never
    an answers read). The home tally and the Grades tab counting a finished
    worksheet wait for a definer function answering per item (decision 37's
    migration half): the Grades tab would read every worksheet in the class,
    measured at 2.3 seconds for three worksheets and thirty students against a
    17 to 44ms load. `isAwaitingGrade` already counts one the moment a row
    carries `completed_at`.

- **AN OWED-WORK PAYLOAD SHIPS SLIM ITEMS (ledger 0360, report R08).** The home
  and to-do loads pass items through `slimOwedWorkItem`
  (`$lib/classroom/owed-work-slim.ts`): no text body, and the document reduced to
  its first image, which is all `feedCover` reads. A future owed-work surface that
  wants an item's text reads the item itself. The home load asks
  `classroom_section_roster` only when `sectionManagedBy` says the caller manages a
  listed class.
- **OWED WORK IS ONE READ.** `loadClassroomWork` in
  `$lib/classroom/student-work.ts` is the home page's, the classroom index's and
  the to-do page's load: classes, items, the caller's own submissions and
  check-ins, and ONE clock read handed down as `{ now, today }`. Another
  student's score never enters that payload. A check-in's status is keyed on
  the session AND the section, never on the session alone.
- **A DUE DATE IS THE SCHOOL'S DAY.** `$lib/classroom/school-calendar.ts` is the
  one conversion (`laCalendarDay`, `schoolDayOf`, weeks starting Sunday) and
  reads no clock; `formatDue` prints in America/Los_Angeles and names no
  weekday. A browser's own zone deciding "due today" is the evening bug the
  notebook grid already had.
