# Feedback, reports and dictation

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). The report affordance, app_feedback write paths, the console, archives, dictation. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

- **`app_feedback` HAS TWO WRITE PATHS ON PURPOSE, AND THEY DO NOT CONVERGE.**
  A signed-in report is the direct insert above, whose `WITH CHECK` pins
  `user_id` to `auth.uid()`; an anonymous one goes through
  `app_feedback_submit`, granted to `service_role` ALONE and reachable only
  from `src/routes/api/feedback/+server.ts`. **Do not merge them.** Converging
  would mean either forwarding a caller's JWT into a function granted to the
  role that bypasses RLS, or letting a server route assert who wrote a row --
  both replacing a database-enforced gate with a server-side one where the
  database-enforced one already works. And 0126's XOR check makes the single
  row shape impossible anyway: an account and an address hash cannot sit on
  one row, because that pair links the account to every anonymous report from
  the same address. **This reverses a plan stated three times** (0053, 0085 and
  0126 each said the direct grant would be revoked once the RPC existed); the
  reasoning is in `docs/history/` under the anonymous-path bundle
  (`grep -rl 'anonymous report' docs/history`).
  - **THE ADDRESS IS DETERMINED BY THE ROUTE, FROM THE REQUEST.**
    `getClientAddress()`, never a header (a caller can set one, so a rate limit
    keyed on it counts to five over an unbounded set of buckets) and never the
    body (there is no field for it). The route hands over an ADDRESS; the salt
    lives in the database and the digest is taken inside the definer function,
    so no route can choose what lands in `reporter_hash`.

- **EVERY SURFACE REPORTS ITS OWN DEFECTS, AND THE AFFORDANCE IS MOUNTED ONCE IN
  THE ROOT LAYOUT.** `SiteFeedback.svelte` sits in `src/routes/+layout.svelte`;
  the two layout resets in `src/routes` (the classroom projector, below, and one
  student's work page) both reset to the ROOT layout, so that mount is what makes
  coverage something a new route INHERITS rather than has to remember. **Do not
  mount it per page** -- that is the rejected alternative, and
  `tests/feedback-coverage.test.ts` sweeps every `+page.svelte` and reddens if it
  moves back to one.
  - **THE BUTTON IS IN ONE PLACE ON EVERY PAGE, AND A ROOM MAKES ROOM FOR IT
    RATHER THAN MOVING IT (ledger 0396, Mr. Pina: "the location of its buttons
    are identical everywhere").** It is the root layout's corner button on the
    classroom, the notebook, Armory, GAUNTLET, the deck, the projector, an error
    page and the rest; the classroom header, the Armory header, the deck bar,
    the projector strip and the error card used to carry docked copies at
    `place="relocated"`, and all of them are gone (ledger 0297 had docked the
    classroom's over hit-test collisions; report 30 kept it out of the Menu).
    `FeedbackTrigger` declares `--feedback-clear-block` and
    `--feedback-clear-inline` on `body` only while a floating button is on the
    page, and a room reads them with a 0px fallback: the classroom's `.cr-root`
    and Armory's `.ar-root` pad their foot, `ClassSplit`'s scrolling panes pad
    theirs and set `scroll-padding-bottom`, the grading dock (which pins against
    the window below 1024px) pins at the button's top instead of the window's
    edge (`bottom: var(--feedback-clear-block)`), and the projector strip and the
    deck's stage stop short of it. A new surface with a
    control at its bottom-right edge does the same, and the instrument is a hit
    test of its controls at the end of every scroll container. **Every
    popover placed with `$lib/shell/anchored` keeps clear of it**: the
    button's wrapper carries `data-corner-reserve`, and `cornerReserve` reads
    it live for the action (on by default) and for `anchorInWindow`, which a
    component placing its own panel calls instead of a bare `anchorPosition`
    (IdeaCAD's right-click and row menus, command search and context toolbar,
    the grading roster's card); IdeaCAD's list beside a menu and its tool card
    take the reserve as an argument, and `tests/anchored-direct-callers.test.ts`
    sweeps the tree for a call that leaves it out. `anchorPosition`'s `avoid`
    treats its top as the window's bottom for a panel whose columns cross it,
    above its key as well as below, because a panel inside `main` is always
    painted under the button; a panel that room cannot take moves sideways
    (beside its key, or left of the button) rather than being clamped over its
    own key. The action re-places a panel when its own size changes (never for
    a scroll inside it) and writes `--anchor-room` (`anchorFitHeight`, which
    weighs the same sideways places before it shortens a panel), which every
    panel whose content can outgrow its room caps its height with and scrolls
    inside (the Quick note, the editor's picture panel, the row menu);
    `tests/anchored-room-cap.test.ts` holds every `use:anchored` panel to that
    cap or a listed reason. A panel sized by hand to the room beside its key
    (the student page's Sections menu) measures it with `anchorRooms`. The
    action writes window coordinates, so an ancestor with a `transform`, a
    `filter` or a `backdrop-filter` (the home header's blur, which the plate
    now takes off the header it unsticks) misplaces every fixed panel inside it. On a `.cr-root`
    route the root layout wraps the window in `CLASSROOM_PLATE`
    (`feedbackWearsClassroomPlate`), so the button and the box are the home
    page's plate key and plate box. The error card's "Tell us what happened"
    opens the same window through `openSiteFeedback` (`$lib/feedback/opener.ts`);
    a surface wanting a second way in does that, never a second mount.
  - **AN EXCLUSION IS BY CATEGORY AND IT RELOCATES, NEVER DELETES, AND THE
    REGISTRY IS SHORT ON PURPOSE.** `FEEDBACK_EXCLUSIONS` in
    `src/lib/feedback/context.ts`, matched on ROUTE ID so a page added under an
    excluded section inherits it, is GREENLINE and VANGUARD (Mr. Pina's two
    products that keep their own feedback systems), the served Coin Ledger
    (which carries the same button server-rendered and opens the same window in
    a frame) and `embed`, `/feedback/embed`, the window's own page, which IS the
    window. An error page is never excluded: the error boundary replaces the
    page, so the room's own control is not there. **GAUNTLET is not a category
    since ledger 0396** (report 80bb4d23). A category with nowhere to relocate
    to is an exclusion that deleted the control. `CLASSROOM_SHELL_HARNESSES`
    (the `/dev` routes mounting the real shell) lives with the quick note now,
    its one reader.
  - **CONTEXT IS CAPTURED, NEVER TYPED**, through `captureMeta`: route id, path,
    role, section, viewport, clock time, and the build. A field somebody has to
    fill in is a field that arrives empty.
  - **A SIGNED-OUT VISITOR GETS THE SAME CONTROL, and the sign-in page is the
    reason.** The person who most needs to report is the one whose sign-in is
    broken, and a writer that answered null with no session removed the control
    on exactly that page. `feedbackWriter` now hands a signed-out caller the
    anonymous route; `feedbackIsAnonymous` is the ONE predicate saying which
    kind of report this will be, and every mount reads it rather than spelling
    "are they signed in" a second time. **`submit={null}` still removes the
    control** -- absence is still the mechanism, being signed out is simply no
    longer one of its causes.
  - **THE OPTIONAL CONTACT IS OFFERED ONLY WHERE THERE IS NO ACCOUNT**
    (`askContact`), is optional in the LABEL rather than only in a placeholder,
    and is absent from the entry entirely when it was not asked for. It is
    **NEVER AN IDENTITY**: nothing verified it, so every surface showing it says
    so, and the export's identity toggle withholds it exactly as it withholds a
    name. A signed-in row cannot carry one.
  - **A REPORT HAS A HORIZON (0230): `now` OR `long_term`, ITS OWN COLUMN, NEVER
    A KIND.** Only `long_term` is ever sent: the signed-in path names it on a
    ladder rung of its own, so an ordinary report stays the same base insert,
    and the anonymous path sends `meta.horizon`, which `app_feedback_submit`
    lifts. `rowHorizon` is the one reader (the column wins over `meta`). The
    console opens on Fix soon, long-term ideas get their own wide read so old
    ones cannot fall off the newest-200 window, and `app_feedback_set_horizon`
    (admin only) is filing, not reviewing, so it leaves the status and the review
    stamp alone. The archive marks each report's horizon in its index and in
    its own report file, and its README lists long-term items in their own
    section.
  - **FOR AN ADMIN, THE REPORT BOX LINKS TO THE CONSOLE (report R15).**
    `feedbackConsoleHref` answers `FEEDBACK_CONSOLE_PATH` only for
    `isAdmin === true` and never on the console itself; `SiteFeedback` derives it
    from `page.data.isAdmin`, so no mount threads it, and it opens a new tab so a
    half-typed report is never lost.
  - **`app_feedback` is the ONE queue for every WEBSITE surface**, and the
    console at `/admin/feedback` (admin only, decision 42) reads ALL apps. Filter
    before exporting; an export of everything is a semester nobody reads. **The
    IDEA Armory Windows app is the one sender that is not a website surface
    (0233, v0.3 items 4 and 4b):** its notes and incidents are
    `armory_app_feedback` and `armory_app_incidents`, tables of their own because
    the payload is (a required app version, the computer's name, 8000
    characters, a context of at most 128 KiB, an incident report of up to 1 MiB),
    shown as two tabs of the same console. Only an admin reads a row (RLS on
    `is_admin()`), the list functions never carry `report`, and an incident is
    DELETED by the next submit 90 days after it arrived, Mr. Pina's retention and
    the one report that is not kept.
    - **IT IS A SITE PAGE, NOT A CLASSROOM ONE (report R03).** The portal's app
      header, the root layout's report control and the site plate, and no
      `.cr-root` around it, so `FeedbackConsole` may style nothing through
      classroom.css. `/classroom/feedback` answers 307 there only after
      `requireFeedbackConsole` (`$lib/server/feedback-console.ts`), the one gate
      both loads call, so a non-admin gets the same 404 at both addresses and
      no Location at either. `tests/feedback-console-route.test.ts` drives both
      real loads.
    - **THE ARMORY APP'S NOTES AND INCIDENTS ARE THE AREA'S OTHER TWO TABS
      (2026-10-07).** `/admin/feedback/armory` and `/admin/feedback/incidents`
      mount `ArmoryFeedbackConsole` and `ArmoryIncidentConsole` over
      `$lib/feedback/armory-reports.ts`; `src/routes/admin/feedback/+layout.server.ts`
      is the area's one gate and `+layout.svelte` carries the header and the
      `FeedbackSourcesNav` strip, whose current key is `.on` as well as
      `aria-current`. A page whose database is not updated yet reads
      `ARMORY_REPORTS_NOT_READY`, never an error. A report is read by the
      admin's own client only at the download, one `.json` per card and one
      zip for a selection (`buildIncidentZip`, over `buildZip`), never N
      downloads from one press, in the file shape docs/ARMORY.md documents for
      the app's reader. The three consoles share one status list
      (`FEEDBACK_STATUSES`) and one download click (`saveBlob` in
      `$lib/feedback/download.ts`).
    - **THE LAST STATUS MOVE IS UNDOABLE FOR `FEEDBACK_UNDO_MS` AND NO LONGER
      (report R02).** `feedbackUndoFor` keeps each LANDED report with the status
      the console showed BEFORE the press -- read after the write, the
      optimistic map already says the new status and the undo is a no-op that
      looks like it worked. A new move replaces the offer, a thrown batch
      withdraws it, and the timer is `setTimeout`. It goes back through the
      same `app_feedback_set_status` call, which stamps `reviewed_at` and
      `reviewed_by` afresh (0188), so an undone report records the undo as its
      last review.
    - **AN AUTHORLESS ROW IS VISIBLY ANONYMOUS, from the payload rather than
      from an empty name** (`anonymous`, stated by 0127). **The reporter hash is
      not in that payload and must not be added**: it exists to be counted, and
      a column that reaches a console reaches an export, a paste and a
      screenshot.
    - **THE QUEUE RENDERS A STRING ANYONE CAN WRITE**, which no rich-text
      renderer or sanitizer touches. `tests/feedback-untrusted-render.test.ts`
      asserts it for this surface specifically rather than inheriting the
      typed-document argument, which does not apply here.
    - **THERE ARE THREE DOWNLOADS AND THE ARCHIVE IS THE ONE WITH THE PICTURES
      IN IT.** `feedbackMarkdown` is the pasteable bundle and `feedbackJson` is
      the rows; both NAME a screenshot and neither can carry one, because
      `rowScreenshotPath` is a key into a private bucket.
      `buildFeedbackArchive` (`$lib/feedback/archive.ts`) is the zip:
      index.json, and per report a report.md with the image BESIDE it, named
      from index.json's own `files` lookup. A folder of loose screenshots a
      reader matches up by guessing is the problem it was built to end, so **no
      report may point at an image that is not there and no image may be an
      orphan** -- both directions, because a silently mismatched screenshot is
      worse than no screenshot at all.
      - **IT REUSES `$lib/foundry/zip-write.ts` AND A SECOND ZIP WRITER IS THE
        THING TO REFUSE.** `buildZip` is a pure writer with no Foundry knowledge
        in it; its folder says where it was born, not what it does. It BUFFERS,
        which is why the archive carries an image budget
        (`FEEDBACK_ARCHIVE_IMAGE_BUDGET`) rather than whatever the filter
        matched: the bucket's own ceiling is 8 MiB an object, so an unbounded
        batch is hundreds of MB of input plus output in a tab.
      - **THE BYTES COME FROM AN INJECTED TRANSPORT, ON THE ADMIN'S OWN CLIENT,
        AND NO POLICY WAS WIDENED TO GET THEM.** `feedback media admin read`
        (0170) already gives an admin SELECT on every object in the bucket --
        the same policy the thumbnail on the row goes through. It is a
        `download` and NOT the load's signed URLs, which last five minutes: a
        queue is worked through for longer, and an export pressed after they
        expire would produce an archive with no images and no reason on screen.
        **Absence of the transport removes the control**, so an archive of
        reports whose every image failed is not a thing this console can make.
      - **EVERY REPORT STATES HOW OLD ITS BUILD IS, AND THE REFERENCE POINT IS
        THIS BUILD'S OWN COMMIT RATHER THAN `origin/main`.** A browser has no
        git and cannot ask a remote for its head; the two agree on a production
        deploy and not on a preview, so `feedbackBuildAge` NAMES what it counted
        to. It reads `virtual:site-changelog` through `await import()` at the
        press -- the payload boundary that module's own declaration sets -- and
        every branch is a SENTENCE: no identifier captured, a build timestamp
        rather than a commit, and a commit the log cannot hold (it omits merges
        AND truncates on a shallow clone, and a reader told only one of those
        concludes the wrong thing half the time).
      - **`README.md` SAYS WHAT THE ARCHIVE IS AND NOTHING ABOUT PROCESS.** No
        branching, no testing, no prompt: a session already has all of it from
        this file and the standards, and a second copy would go stale and then
        contradict them. `tests/feedback-archive.test.ts` sweeps for it.
      - **THE SUBMITTER TOGGLE STILL DECIDES AND THE ARCHIVE SAYS WHICH WAY.**
        It withholds a NAME, never a report: `tried` and the screenshot stay.
- **DICTATION IS ONE DRIVER AND ONE APPEND, AND A FINAL RESULT IS NOT ALWAYS
  NEW WORDS (reports R03, R08, 5ab3adb6).** `Dictation` in `$lib/feedback/dictation.ts`
  is the only Web Speech session on the site -- the report box, the grading
  console's `GradingDictation` and the palette's Speak control all drive it --
  and `appendDictation` is the only way a transcript reaches a field: it never
  removes a character, it shapes only the transcript (fillers dropped, spoken
  "comma", "question mark", "new line" written as marks, "period" only where it
  cannot name a class period), and it appends a chunk OPEN. **`DictationJoin` is
  the one thing that closes a sentence**, with a period appended at the end and
  only to text it wrote itself: when `continuesSentence` judges the next chunk a
  new sentence (a word no sentence ends on, a carrying-on word or a spoken mark
  keeps it open; otherwise a pause from the last thing heard of the last phrase
  past `DICTATION_SENTENCE_PAUSE_MS`, which is UNMEASURED) or when the session
  ends. Report R03's period at every final is retired: a final arrives at every
  breath, and it put periods mid-sentence. `FinalResults` decides which finals
  are new words, keyed on what the event says and never on a user-agent sniff: a
  final at confidence exactly 0 is Chrome-on-Android's provisional guess, shown
  as the preview and held until a confirmed final replaces it, a higher index
  finishes it, or `end` flushes it (BEFORE `onListening(false)`, so it lands in
  the field that was listening); an identical re-send, or an extension of the
  last final, with no interim heard between, adds only its new words. Desktop
  output is asserted byte-identical to the plain `resultIndex` walk. **The
  Android shape is react-speech-recognition's model, not a measurement**: no
  container here has a phone. The report box never focuses its field on a
  coarse pointer (`coarsePointer`), because that raises the phone keyboard over
  the box.
  - **KEEP-ALIVE IS AN OPTION, OFF BY DEFAULT, AND ONLY A FINE POINTER TURNS IT
    ON.** With it, an `end` the person did not ask for opens a fresh recogniser
    in the same session (no second `onListening(true)`), never after a refused
    microphone or an `aborted` it did not cause, never in a hidden tab, never
    past four quick ends in a row (`DICTATION_MAX_QUICK_RESTARTS`, reset by any
    words heard) and never past `DICTATION_IDLE_MS` with nothing heard; and
    `listening` is true across the gap so a STOP there is not lost. On a phone
    it stays off (Android chimes at every start, iOS may refuse a start outside
    a tap) and the box says "Paused". The palette passes no options, which is
    what keeps its Speak control byte-for-byte what it was.
  - **WORDS STILL BEING HEARD ARE DRAWN OVER THE FIELD, NEVER WRITTEN INTO IT.**
    `DictationGhost` lays an `aria-hidden` mirror with the field's own metrics
    over the caller's untouched textarea and draws exactly what
    `DictationJoin.preview` says the next final will add; the field's ground
    stays the plate's, so its contrast is an `orderResult` compositing probe,
    never the ancestor-walking row.
  - **THE LOUDNESS METER IS `$lib/feedback/mic-level.ts`, NEVER `dictation.ts`**,
    which keeps its no-capture sweep. It opens once per session after the
    service's `start`, only where the microphone permission already reads
    granted and only on a fine pointer, records and sends nothing, and is
    closed on every end; a failure is no meter. `DictationLevel` moves its bars
    by transform only, and only under `no-preference`.
  - **A SURFACE THAT MOVES ON WAITS FOR THE SENTENCE IN FLIGHT.** The report
    box's SEND and the grading console's switch, save and return wait for the
    session to end (up to `DICTATION_STOP_GRACE_MS`), because a field keyed the
    same for every student sent a late sentence to the NEXT student. The
    console's one writer of the open student, `applySelect`, DROPS any session
    still open (`drop()`), so a path that does not wait ("Discard and switch")
    cannot carry one across. Escape stops dictation before it does anything
    else, a queued field included, and a `DictateButton` whose field unmounts
    stops its own session.
- **THE REPORT BOX AGAINST SPAM, AND WHAT A REPORT CAN EARN (ledger 0432,
  migration 0297).** `_app_feedback_spam_guard`, a trigger before insert on
  `app_feedback`, serves both write paths. It refuses a fifth report from one
  account or address inside two minutes, or a sixteenth inside an hour
  (`_feedback_rate_rules`), with `feedback_slow_down`, which
  `feedbackSlowDown` turns into a sentence that keeps the words typed; it
  never drops a report. Obvious junk (`_feedback_junk_reason`) and a repeat of
  the same words within a day are kept and marked `spam`, with
  `meta.auto_spam` saying why. It stamps `meta.evidence` itself (the sign-in
  session's start and browser, the gap since the account's last report) and
  replaces any the client sent; an admin's own reports are never shaped. The
  client sends `meta.device` (`feedbackDeviceKey`, a random key per browser),
  which is how a shared lab computer shows.
  - **THE FINE PROMPT NEVER FINES ON ITS OWN.** `src/lib/feedback/spam.ts` is
    the one statement of a burst (`SPAM_BURST_SENTENCE`), the amounts (1 a
    report, 5 a burst) and the doubts that point away from the account owner;
    `SpamFinePrompt` draws it over `app_feedback_spam_review`, and one press
    calls `app_feedback_spam_fine`, a system fine the student can dispute, or
    `app_feedback_spam_dismiss`. Tested against the 2026-10-22 runs in
    `tests/feedback-spam.test.ts`.
  - **A REWARD IS HIS NUMBER, 1 TO 10, ONCE.** `app_feedback_reward` pays the
    reporter and resolves the report; the console's "Led to a change" control
    asks him for the amount each time. `FEEDBACK_REWARD_LINE` is the one line
    by the report box for a signed-in student.
  - **A SELECTION MOVES IN ONE CALL.** All three consoles take a
    `setStatusMany` (`$lib/feedback/bulk.ts`, the `*_set_status_many`
    functions), falling back to one call per row on a database without 0297.

