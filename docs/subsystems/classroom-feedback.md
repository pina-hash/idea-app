# Progressive feedback and one student's page

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). Instructor notes on work in progress, and the per-student conference page and printout. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

### PROGRESSIVE FEEDBACK -- notes on work in progress, in place and in one list

**AN INSTRUCTOR LEAVES NOTES ON A STUDENT'S WORK WHILE IT IS IN PROGRESS, AND
THEY ARE PART OF GRADING (0238, decision 60, report 6b814ca1).** Mr. Pina's
answers on 2026-10-14: in place and in a list; back and forth, a Fixed it
button and seen; one place to manage everything from; ported HTML worksheets
first. A THREAD is one note on one student's work on one item, optionally on one
block (the manifest's permanent id) and optionally on one handed-in picture with
a drawing over it; its messages are the conversation.
`classroom_feedback_threads` and `classroom_feedback_messages` are RLS-on, no
policy, no client grant, written and read only through the seven definer
functions (`classroom_feedback_post`, `_reply`, `_update`, `_set_state`,
`_remove`, `_seen`, `_list`). "Not yours" and "not found" answer identically.
- **WHO IS WHICH SIDE IS ONE FUNCTION, `_classroom_feedback_role`**: the student
  the thread is about (and who can read the item), or a reviewer of that
  student's work (`classroom_can_review_submission`). Only an instructor posts,
  edits, draws, resolves, reopens or removes a whole thread; either side
  replies; only the student says Fixed it (or takes it back); a student is held
  to sixty messages an hour. Nothing is deleted: a removal is a stamp.
- **A DRAWING IS VECTOR DATA ON THE PICTURE'S OWN COORDINATES, NEVER PIXELS.**
  `marks` is a closed shape (`_classroom_feedback_marks_ok`: pen, arrow, box,
  ellipse, text; six colours by id; three widths; integers 0 to 10000 across the
  picture; at most 200 shapes) and only on a file that is this student's
  hand-in on this item. `marksOk` in `$lib/classroom/feedback/notes.ts` is the
  client's mirror and `tests/db/progressive-feedback-0238.test.ts` puts both to
  one corpus. `MarkLayer` draws it over the picture at `object-fit: contain`
  (viewBox the natural size, `xMidYMid meet`), every stroke over a halo of the
  opposite lightness, `aria-hidden` with the note's words beside it.
- **A DRAWING IS LAID ON THE PICTURE A FIELD IS SHOWING, MATCHED BY URL**
  (`marksByField` over the frame's own `images`), never through a field-to-file
  map read at load, so a picture replaced mid-lesson never takes an old drawing;
  a resolved note's drawing comes off the picture and stays in its thread.
- **ONE SESSION PER PERSON PER WORK, READ BY EVERY SURFACE ON THE PAGE.**
  `FeedbackSession` (`$lib/classroom/feedback/session.svelte.ts`) holds the
  threads; the list (`FeedbackPanel`, `FeedbackThreadView`), the frame's pins
  and drawings (`fieldNotes`, `marksByField`) and the drawing tool
  (`FeedbackDrawing` over `Annotator`) all read it, so a pin and the list cannot
  disagree. The route builds it (the item page beside the answers controller,
  the grading console per open student) and it fetches only when told. A
  student's transports carry no `post` and no `update`
  (`createFeedbackTransports(supabase, 'student')`), so no composer or drawing
  control can render on their side: ABSENCE IS THE MECHANISM, and
  `tests/dom/feedback-panel-roles-mount.test.ts` counts both sides.
- **THE ITEM PAGE GAINS NO POLL.** Its call budget is spent
  (`tests/classroom-poll.test.ts`), so the student's floor is the heartbeat it
  already sends: since 0238 `classroom_presence_ping` answers `feedback_at`,
  and `createPresenceBeatTransport`'s callback re-reads only when it moved. The
  speed is a payload-free `feedback` live notice (`$lib/classroom/live.ts`) on
  the section layout's ONE bus, shared through `provideClassroomLive` /
  `classroomLiveFromContext`, re-read after a random wait up to
  `FEEDBACK_NOTICE_JITTER_MS`. The grading console rides its own poll and the
  same notice. A write announces; nothing on the wire carries a note.
- **IN PLACE IS THE DOCUMENT'S BOX, DRAWN IN PARENT CHROME.** A worksheet reports
  where an answer sits with `idea:field-box` (the `idea:image-box` shape and
  rule, `hxBoxOf`), and the frame draws a worded 44px pin beside it for a field
  with an open note; the parent tells the document which fields have one with
  the advisory `idea:feedback` (field names only, never a note's words). The
  conversation, Fixed it and Resolve are ALWAYS parent chrome, for the reason
  Submit is. A document that predates the reporter keeps every note in the list.
  `fieldBoxReporter` in `src/routes/hx/_documents.ts` is the reference.
- **SEEN IS STAMPED WHEN THE LIST IS ON SCREEN IN A VISIBLE TAB, AND NEVER MOVES
  `updated_at`**, so reading is never news. A resolved note never counts as
  wanting attention (`wantsAttention`), read or not.
- **THE ONE PLACE IS `/classroom/student-feedback`** (`FeedbackInbox`, the
  palette's `go.feedback`, a staff door): every note this caller may read, five
  views (Needs you, Student says fixed, Waiting on student, Resolved, All), a
  class and an assignment filter, a search, and the same `FeedbackThreadView`.
  It 404s to anybody who manages no class, asked of the database
  (`classroom_manages_section`, or `navIsAdmin`), never a second spelling of
  the manage rule.
- **HARNESSES**: `/dev/progressive-feedback` (`?view=student|teacher|inbox`,
  `&draw=1`) mounts the real components over `createMemoryFeedback`, and
  `/dev/html-assignment-grading?feedback=1` is the console's own wiring;
  `tools/browser-verify/routes/progressive-feedback.mjs` measures the pins, the
  drawing and both sides' controls. **A read started during a server render
  lands outside the request**: a harness or page starts a session's first read
  in `onMount`, never at module scope (the dev server crashed on `page.url`
  read from a `.then` the first time).

### ONE STUDENT'S PAGE -- one class, one student, and a printout that names nobody else

**A MANAGER OPENS ONE STUDENT'S WORK, NOTEBOOK AND ACTIVITY IN ONE CLASS AT
`/classroom/<id>/people/<email>` (the 2026-10-07 round, reports 792eb6b1 and
63fb1c49).** The People roster's name and the palette's `@` row are its doors,
through `studentPageHref`; it is a place under the People tab, not a tab.
`StudentOverview.svelte` is the one renderer, mounted by the route and by
`/dev/classroom-student`, over the page `buildStudentPage` in
`$lib/classroom/student-overview.ts` makes from the route's reads.
- **EVERY REFUSAL IS THE SAME 404**: not a manager (the section layout's own
  `canManage`), an address `studentEmailParam` rejects (it never decodes a
  second time, which threw a 500), no roster row, and a row that manages the
  class (0138).
- **EVERY READ IS A MANAGER'S OWN READ WITH AN ATTRIBUTION FILTER, PLUS ONE
  DEFINER READ.** `classroom_student_overview` answers only what a manager
  could not read before: this class's hall passes, item views and song counts,
  and coins as the public Ledger projects them, never the note or who logged
  it. It answers NULL for every refusal, identically, and adds no policy to any
  table. Item views reaching a teacher reverses 0085's "no surface shows it",
  on Mr. Pina's request.
- **ONLY THE ONE STUDENT'S SLICE LEAVES THE SERVER.** The grid, the team board
  and the roster carry the whole class and are reduced in the load; a team is a
  name and a size, never its members, and the notebook's presence pre-fill is
  not shown. No Foundry play is shown (decisions 05 and 07).
- **THE GRADE IS POINTS ON RETURNED WORK, AS A PERCENT, AND SAYS SO (ledger
  0392, Mr. Pina for conferences: "I want to see a grade").** `studentGrade`
  sums returned, scored work with points and nothing else, and
  `STUDENT_GRADE_NOTE` sits beside it saying FACTS weighs categories, so the
  report card can differ. There is still no letter grade: a scale is a
  decision owed, not a default. This line read "There is no percent" until
  then.
- **IT IS A CONFERENCE DASHBOARD AS WELL AS A RECORD (ledger 0392).** The top
  holds the grade, `studentUpcoming` (live work still to do with a due date
  ahead, soonest first) and `StudentWorkSlideshow`: a carousel over
  `studentGallery` (hand-in pictures and turned-in notebook photos, a
  straightened page replacing its original through `notebookPhotosShown`,
  newest first, at most `STUDENT_GALLERY_MAX`), advancing on a timer that
  stops under `reduce`, under a resting mouse, on keyboard focus, in a hidden
  tab and while the Lightbox is open, with Previous, Next and one Pause key as
  44px keys (it reads Play while paused and carries no pressed state, which
  drew a lit "Play" over a stopped slideshow). **The Pause key itself never
  holds the timer** (neither a mouse on it nor focus on it), so its word is
  true whenever it is looked at or heard: pressing Play left focus on the key
  and the slideshow stood still under "Pause" (ledger 0396). Its caption
  sits on a band BELOW the picture, never over it, because a handwritten
  page's last lines are at its foot. **Every move wraps both ways
  (`slideIndex`), the timer's included, and the thumbnail strip scrolls ITSELF
  to centre the selected picture (`stripScrollLeft`, ledger 0396, report
  169b931d)**: the thumbnail is measured against the strip's own box, never by
  its `offsetLeft`, whose offset parent is the page (`main` is positioned), which
  is what sent the strip to its far end when the first picture was picked; and
  never with a bare `scrollIntoView`, which moves the page too. The shared
  Lightbox keeps its own clamp at the ends. Assignments open on due date, newest
  first (`STUDENT_ASSIGNMENT_DEFAULT_SORT`). Print is two Letter pages for the
  fixture at 0.75in margins with no text under 9pt; a score bar's fill is the
  one background `_student-print.mjs` lets through, by name.
- **A TEACHER HIDES WHOLE SECTIONS FROM THE SECTIONS KEY IN THE PAGE HEADER
  (ledger 0396, report bd38fa25)**, and the choice applies to every student
  page they open, on any computer: the classroom store's `studentPage` group
  (account, through the store's read-first writer, no migration), section ids
  from `$lib/classroom/student-sections`, which are stored and append-only. A
  hidden section is NOT RENDERED, so it leaves no gap (a group of cards takes
  as many columns as it has cards, `studentColumns`; with the grade or Coming
  up hidden the pictures move UNDER the identity, centred and as wide as a
  16:9 stage at the slideshow's `--sws-stage-max` height, because beside a
  short column they left a 200 to 400px hole and across the whole card a
  landscape picture sat in a black band) and nothing on the paper,
  and what belongs to it goes with it: its At a glance tile, and for the
  notebook its Needs attention rows, its photos in Their work
  (`studentGalleryFor`) and the Open full notebook key.
  `studentPageLayout` is the one decision of what is drawn and what prints,
  so the screen and the paper cannot disagree. `StudentSectionsMenu` is the
  one control (a popover over `anchored`, never over its own key: it opens on
  the side with more room and shrinks to it, `studentSectionsMenuFit`, with no
  fixed floor); with no store in context there is no key. Settings reads it
  out to a teacher with a Reset.
- **NEEDS ATTENTION CARRIES ITS ASSIGNMENT ROW'S OWN KEYS (ledger 0396, report
  08bafda7)**: Grade and Full screen are ONE snippet rendered on both lists,
  so they cannot drift into two spellings of where a row opens, and they sit
  on the title's line wherever they fit. Needs attention and Scores share a
  line only while about the same height (`studentDuoStacks`, decided from the
  rows each lists so the server render already has it); otherwise each takes
  the whole width. The paper keeps two columns.
- **EVERY FIGURE COUNTS UP ONCE, AND THE GRADE HAS A BAND (ledger 0392).**
  `CountFigure` is a thin caller of `countUp` (a decimal counts in tenths, the
  final figure is server-rendered and carried in a visually hidden copy for
  assistive tech). `gradeBand` (90 Excellent, 80 Good, 70 Fair, under 70
  Needs improvement, a default in one table) colors the grade box, its meter
  and every score bar, and the band's WORD sits beside the color. Needs
  improvement takes `--crimson`, a status use; words take the band moved
  toward `--text-1` so they clear 4.5:1. The glow animates opacity only,
  breathes twice (4.8s, under WCAG 2.2.2's five seconds) and rests; bars and
  the meter grow by `transform` and are whole in their base state.
- **PRESENCE SPEAKS THROUGH `presenceLineKind`, AND AN OPEN RECORD OUTRANKS ITS
  VERDICT** as work does; `presenceCoverageNote` is printed verbatim once,
  under the assignments table, because paper has no hover.
- **PRINTING IS `beforeprint`/`afterprint`**: the page sits on Space White for
  the print and restores the attribute exactly, every print rule naming
  something outside the component carries `body:has(.so-root)`, and each
  section's "Include when printing" box starts ticked and is never stored. A
  cleared box takes the section's card AND its At a glance tile off the paper
  (a tile is a section's figure, and a figure left behind says what the
  teacher chose not to print). A HIDDEN section is neither on screen nor on
  the paper, and the grade, which follows Scores and Assignments, prints on
  its own when both are hidden rather than unticked.
  `tools/browser-verify/_student-print.mjs` measures all of it (pass its port flag
  when another dev server may hold 5199). No poll, ever.
- **A REPORT FILED FROM AN ADDRESS-BEARING PATH CARRIES `:student`**, never the
  address: `captureMeta` runs `scrubAddressSegments`.
