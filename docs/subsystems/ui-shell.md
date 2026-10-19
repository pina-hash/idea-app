# UI structure, shared shells and the shell chrome

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). Component structure, the split shell, the tab icon, navigation progress, pending states, the command registry, popovers, disclosures. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

## Components and UI

### Structure

- **A PLAN OR JUDGMENT COMPUTED INSIDE A CLASS-CRITICAL SURFACE'S RENDER IS
  GUARDED, SO A THROW COSTS THAT CONTROL AND SAYS SO, NEVER THE SURFACE.** A
  stored document can be legal in the database and still surprise the client (a
  module title that is a number passed 0195's check and threw in a filename
  fold). The grading console's Download all files and the Live tab's finished-
  worksheet judgment both compute under a catch for that reason (ledger 0298);
  unguarded, one odd assignment took down the whole console or the whole live
  control view.
- **Presentation components take state via props and emit intent via callbacks.**
  No component fetches its own data. The route owns the load and the transports.
- **Server calls are INJECTED as a transports object.** The real route points them
  at RPCs; the dev harness answers in memory. That split is what makes multi-step
  orchestration verifiable with no network.
- **The whole screen is a component the route mounts** (`ReviewConsole`,
  `GreenlineRace`, `ClassView`), so the dev harness mounts the IDENTICAL thing
  rather than a copy.
  - **THE COIN DESK IS THE EXCEPTION, AND THIS LINE USED TO NAME IT AS AN
    EXAMPLE.** It read `CoinDeskTool` in that list; no such component exists,
    and four source comments under `src/lib/coin-desk/` and
    `src/lib/coin-balance/` still name it as the thing they were factored out
    of. The desk is one component per AREA now (`LogView`, `QueueView`,
    `PaydayView`, `DigestView`, `TournamentTransfer`, `ContractsManager`,
    `RolesManager`, `CategoriesManager`), mounted by the route group and by
    `/dev/coin-desk` alike -- so the harness still mounts the identical
    components, and what the two no longer share is a screen-level parent. A
    surface split that way keeps the rule by mounting every real part; it does
    not get to mount a stand-in for the whole.
- **An omitted optional transport REMOVES the control it drives**, down through
  child components. Read-only is then structural -- there is no write to execute --
  rather than a discipline. A `readOnly` prop may state the intent once, but
  ABSENCE is the mechanism.
- **Presentational state that must survive navigation lives in the LAYOUT**, not
  the page: a layout component is not remounted when a child route changes. This
  is the only way staged File handles, which exist nowhere but in that browser's
  memory, survive opening an item.
- **A layout load must never read `url`** -- it would re-run on every navigation
  and undo that. `params` is safe.
- **Page data merges OVER layout data.** A layout key a page also returns will be
  shadowed; prefix layout-owned keys (`navSections`) when any page returns its own.
- **A cached sub-panel must be invalidated by writes from OTHER panels**, not just
  its own -- the staleness is invisible while it is collapsed.

### Shared shells and locked contracts

- `$lib/shell/ClassSplit` + `split.css` is the ONE two-pane master-detail shell
  (classroom, notebook feed, notebook review console, coin desk). **A surface
  needing a different arrangement gets a class or prop there, never a second
  split.** Knobs: `scroll` (`panes` when the split IS the page under a constant
  chrome height, `page` when real chrome sits above and below or the surface is
  mounted in somebody else's shell, `fill` when the caller gives the split a
  bounded box and the panes take its height -- the only one that names no
  viewport arithmetic), `navWidth`, `detailWidth` (`panel` | `roomy`), `narrow`
  (`swap` | `stack` | `stack-nav-first`), `overlay`, and `resizable` (ledger
  0297): a classroom `navWidth="list"` split that finds the classroom
  preference store in context and has something open gets a `role="separator"`
  in the gap (it takes no grid track, so the one-pane collapse keeps its
  easing), keyboard-operable, with Narrower and Wider in Settings as the
  single-pointer alternative. The width is one per DEVICE (`display.navWidth`,
  `clampNavWidth` keeps whole rem from 16 to 120 and stores the default as null)
  and the detail pane never drops under 32rem: the widest a list may be is
  read off the window (`maxRemNow`), so `aria-valuemax` and End name the width
  this window can actually draw, not the stored ceiling. Every other split is
  unchanged and `resizable={false}` opts out.
- **THE CLASSROOM'S SPLIT USES THE WHOLE WINDOW (ledger 0381, report db499adb:
  "Dead Space on full screen ... from ultra narrow to ultra wide").**
  `classroom.css` points `.cr-root`'s `--measure-split` at `--measure-console`
  (100%), the Foundry's own shape, so the class page and an open item no
  longer sit in a centred 92rem band. Prose keeps `--measure-reading`; widening
  a pane never widens a sentence. Beside an open item the class list lays its
  units in columns by its own width (`paneStreamColumns` in
  `$lib/classroom/nav.ts`), so a list dragged wide uses the room it was given.
- **A full-height surface is `.cr-app` + `.cr-app-body` around a `scroll="fill"`
  split**, not a `100vh - <chrome>` calculation. The chrome height is not a
  constant -- a hero wraps, a notice appears, someone else's banner sits above --
  so the bar measures itself and the body takes what is left. Above 1024px only;
  below it the document scrolls as it always did.
  - **THAT FRAME IS `overflow: clip`, NEVER `hidden` ALONE (ledger 0392, report
    c2a5260e).** `hidden` is still a scroll container: a focus, a
    `scrollIntoView` or find-in-page can move it, and nothing on the page can
    move it back. Measured on the grading console at 1920x912 with a ported
    worksheet: content 1019px in a 912px frame, scrolled 107 and stuck with the
    window's foot blank. `clip` has no scroll position to get stuck at;
    `hidden` stays first as the fallback.
- **NOTHING OPEN IS ONE PANE, at every width.** `hasDetail` false renders no detail
  pane and gives the navigation the whole measure; it is not a placeholder state.
  A surface whose detail pane always holds something (the coin desk's logging
  form) passes `hasDetail` and simply never collapses. The notebook's composer
  is no longer one (ledger 0298): it heads the log in the navigation pane, and
  the detail pane is only ever an entry somebody opened.
  **The list is then responsible for USING the width** -- a fixed-width column
  centred in the room it was just given is the same defect one level in. ClassView
  lays its unit groups out in COLUMNS for exactly this (see the column rule
  below for why they are multi-column and not a grid).
- **THE CLASS LIST BESIDE AN OPEN ITEM GOES COMPACT BY ITS OWN WIDTH (ledger
  0368, report R09).** `.stream` in ClassView is a size container
  (`class-stream`, measured not to capture the row menu's fixed panel), and two
  `@container` tiers, scoped to `.classroom-page.as-pane` so a phone keeps its
  44px grip, step the drag grip and a collapsed expand arrow aside and wrap the
  unit header's keys under its name at the default 26rem pane and below, then
  hide the kind WORD visually below 22rem (the glyph still says it).
  No meta field is ellipsized or hidden (ledger 0281). The instrument is
  `tools/browser-verify/routes/_narrow-list.mjs`, which steps the REAL
  separator from 18rem to 30rem and counts overflow and broken words.
- **A BREAKPOINT INSIDE A NESTED PANE IS DEAD CODE UNTIL IT IS MEASURED THERE,
  and nothing warns.** A container query whose threshold the container never
  reaches simply never fires: no unused-selector notice, no `svelte-check`
  warning, and a layout that looks deliberate because the fallback is the one
  you also wrote. Measured twice now -- `.fdy-q-work` at 58rem against the
  viewport figure when the pane was 857px, and the Foundry review inspector's
  own panel at 34rem when its container is **418px at 1440 and about 541px at
  1920**. Drive the real surface and read the CONTAINER's width before choosing
  a number, and when the measurement says the wide arrangement never has room,
  DELETE the rule rather than lowering it into columns too narrow to read.
- **A column count comes from measuring the content, not from round numbers.**
  Drive the pane across a range and count what actually breaks (ellipsised titles,
  wrapped rows); the column is the width above which the content stops gaining.
  A class with two units must get two columns and not two plus a void where a
  third would go, and the same rule must be the single narrow column with no
  breakpoint of its own.
- **PANELS OF UNEQUAL HEIGHT LAID SIDE BY SIDE GO IN A MULTI-COLUMN CONTAINER,
  NEVER IN A GRID, AND THIS RULE USED TO SAY THE OPPOSITE.** It prescribed
  `repeat(auto-fit, minmax(min(<col>, 100%), 1fr))`, which is right for a row of
  comparable things and wrong for a stack of panels: **a grid ROW is as tall as
  its tallest member**, so one long panel beside a short one kills the short
  one's column for the whole height of the long one, and nothing on screen or in
  any type check reports it. Measured on ClassView's stream at 1196x1304, the
  width it was reported at: **713.3px of the left column, its full 529px width,
  dead** between one unit's end and the next card in that column, while an
  902.5px unit filled the right. Columns have no rows to lock -- each panel is
  `break-inside: avoid`, they fill down one column and on into the next, and
  `column-fill: balance` picks the shortest height that holds them -- so the
  only void left is the ordinary ragged bottom of the last column.
  - **`column-width`, NEVER `column-count` ALONE:** the count is then the same
    arithmetic `auto-fit` was doing, so the breakpoints do not move and a pane
    narrower than one column still gets one.
  - **BUT THE COUNT IS STILL NEEDED AS A CEILING, because multicol has no
    `auto-fit`.** `auto-fit` COLLAPSES a track nothing was placed in; multicol
    cuts every column the width holds and leaves the spare one empty. Two panels
    at 1440px sat in two 426px columns with 450px of measure dead beside them
    until `columns: <width> <count>` capped it -- with both set the used count is
    `min(count, floor((width + gap) / (col + gap)))`, so panels share the whole
    measure where there is room and still drop to one column in a narrow pane.
    Cap every count the content can fall short of.
  - **A LONG PANEL MAY CONTINUE INTO THE NEXT COLUMN, AND ONLY A LONG ONE.**
    `break-inside: avoid` on every unit left a 426x702px hole under a short unit
    at 1440, and no order-preserving arrangement of unbreakable boxes removes
    it. So ClassView lets a unit of ten or more rows break BETWEEN rows (its
    header stays with its first row, each part keeps its frame through
    `box-decoration-break: clone`) and a short unit still never breaks
    (ledger 0297). The continuation carries no header of its own, which is
    recorded as open rather than solved.
  - **THE ROW GAP IS A MARGIN ON THE PANEL**, because multicol has no row gap;
    and the reading order changes from row-major to column-major, which for an
    ordered list of units is the order they are numbered in.
- **Opening something must not read as a page change.** Where a selection changes
  the geometry, ease the change (~180ms) rather than snapping the screen.
  `grid-template-columns` interpolates ONLY when both states list the same number
  of tracks -- a collapse that drops to one track flips discretely at half the
  duration, which is worse than no transition. Keep the track count and move the
  width. Behind `prefers-reduced-motion: no-preference`, like everything that moves.
- **A pane that clips its overflow SATISFIES a no-scroll measurement by hiding the
  content.** Under `scroll="page"` the guarantee comes from the content genuinely
  fitting, which is what the rule means.
- **Viewport arithmetic in a stylesheet is wrong wherever the surface is not the
  top of the page** -- the notebook mounts under the classroom shell and its
  banner in view-as. Prefer document flow over `100vh - <constant>`.
- **A PERSON'S NAME IN A LIST IS `.person-name` (`src/app.css`, ledger 0346), with
  the full name in `title`.** It wraps only between words and cuts a single word
  too long for its box with an ellipsis; `overflow-wrap: anywhere` on a name is
  what printed "Alice Alvare z" at 375. It needs a flex or grid parent (an inline
  box ignores `text-overflow`), and a component rule still saying `anywhere`
  beats it, so a list adopting it drops that declaration.
- **`min-width: 0` on grid/flex children.** An item's automatic minimum is its
  min-content, so a `nowrap` row forces the whole page wider than the viewport.
  `overflow: hidden` and an ellipsis do NOT reduce min-content.
- **The notebook review grid's density, its status glyphs (checkmark, up-arrow,
  circle, bang, E, dash, and since 0140 the guillemet), Share Tech Mono and the
  1.9rem cell box are a LOCKED CONTRACT.** Verify byte-identical after any
  restyle. Do not put words in a cell to satisfy a label audit -- the
  always-visible legend carries the meaning, with each state's hint one tap
  away as an `InfoTip` since ledger 0297 (there is no longer a how-to line
  under the grid, and there was never a hint above it).
  - **A NEW DIMENSION GETS ITS OWN MARK, NEVER A NEW GLYPH OR A NEW HUE. A NEW
    VALUE OF THE EXISTING DIMENSION GETS BOTH.** This rule used to read "never a
    seventh glyph or a seventh hue" flatly, and 0140 is what showed the sentence
    was one word short: it is about what QUESTION a mark answers, not about the
    number six. Acknowledgement (0121) asks whether anybody has SEEN the work,
    which is a different question from what the cell says about the work, so it
    is a dot in its own corner the way the multi-entry count already was.
    `scheduled` (0140) is the SAME question with an answer the vocabulary could
    not previously give -- a check-in dated ahead of today, which fell through to
    `missing` and counted against a class for work that was not due -- so it takes
    a glyph, a hue and a per-plate token like every other answer to that question.
    **A value added this way arrives with all of it or not at all:** a key, a
    label, a hint, a glyph no other state uses, a fill STYLE no other state uses
    (solid-with-a-pinned-fill, dashed, dotted), a `--nb-cell-*` token declared in
    every site theme's `.nb-root` block that moves it (the dark base and Space
    White since ledger 0297), and a MEASURED contrast figure for each of them.
    `tests/notebook-review-console.test.ts` pins the original six as the head of
    the list, in order, and asserts the whole set for uniqueness and for a token
    on every plate -- the generalization of an assertion that used to spell out
    the array and could only be deleted.
  - **The status COLOURS are per-palette (`--nb-cell-*`), and used not to be.**
    They were the portal's own tokens on the grounds that no scoped palette should
    reach them. Measured on the three notebook plates, that rule was costing the
    thing it protected: twelve of eighteen plate-state combinations sat below
    4.5:1 and on the LIGHT plate all six did, five of them below 3:1. What is
    fixed is each state's HUE IDENTITY -- green on time, amber late, cyan awaiting,
    crimson flagged, ice excused, sage missing, violet scheduled -- and only
    lightness moves per plate. **The FILL is a pinned colour, never a `color-mix`
    of the ink:** a fill derived from the ink moves whenever the ink does and hands
    most of the contrast straight back (measured, 4.79 vs 3.84).
  - **A CHECK-IN DATED IN THE FUTURE IS NOT OUTSTANDING, AND BOTH SIDES NOW SAY
    SO THE SAME WAY: `scheduled` IS A STATUS, NEVER A FILTER.** The grid gets it
    from `notebook_get_section_grid`'s own `case` (0140); the class page gets it
    from `checkInStatus`, which the loader hands the answer to. **This rule used
    to say the two sides were fixed differently on purpose** -- the student's
    class page BOUNDED its read to today or earlier, so a future check-in was not
    on the page at all. That bound is GONE and must not come back. Hiding was
    defensible only while there was no vocabulary for "not asked for yet"; once
    there was, the bound was doing to a student's page exactly what this rule
    already forbade doing to the grid, and it hid a MANAGER's own scheduled
    check-in from their own class page on the way past. Do not "make them
    consistent" in the other direction either, by bounding the grid's read --
    that hides a teacher's own work from them.
  - **THE DAY IS THE AMERICA/LOS_ANGELES CALENDAR DAY, WHICH IS THE CALENDAR
    `session_date` IS ADJUDICATED IN.** UTC runs seven or eight hours ahead and
    reproduces a smaller copy of the same bug every evening, which is when a
    teacher lays out the next day. **ONE CLOCK, IN THE LOADER.** The grid reads
    it in SQL, once per payload; the class page reads `new Date()` once in
    `+layout.server.ts`, converts it with `laCalendarDay` (which lives in
    `$lib/classroom/school-calendar.ts` since ledger 0297, where `formatDue`
    and the feed's due arithmetic read the same day) and hands the STRING
    down. `checkInStatus` takes a BOOLEAN and `checkInIsScheduled` takes two day
    strings -- neither reaches for a clock, which is what makes both assertable
    at a pinned instant. A second idea of "is this due yet" is the pair that
    stops agreeing, so nothing downstream of the loader may compute one.
  - **A TEST OF THAT CALENDAR NEEDS A PINNED INSTANT WHERE THE TWO DISAGREE.**
    The LA and UTC days are the same for most of the school day, so a check
    written against the wall clock cannot tell them apart -- 0140's UTC mutation
    failed to redden anything because the run was at 08:09 Pacific. 8pm Pacific
    (`2026-08-28T03:00:00Z`, LA `2026-08-27` and UTC `2026-08-28`) is the
    instrument.
  - **`scheduled` IS HELD OUT OF EVERY TOTAL BY NOT BEING NAMED**, on both sides:
    `gridSummary.outstanding` is a whitelist sum, `isOutstanding` is a whitelist
    predicate, and a student's `total` comes from the cell's own status. A state
    that should count has to be added deliberately, and a scheduled day still
    counts for a student who filed against it early -- which is why an ENTRY
    outranks `scheduled` in both places, and why `scheduled` in turn outranks a
    DRAFT on the class page: `isOutstanding` counts a draft, so ranking the draft
    first would tell a student they owe work nobody has asked for, which is the
    original defect in a narrower case.
  - **AND IT RENDERS BELOW EVERYTHING ACTIONABLE, WHICH IS NOT DECORATION.** The
    class stream is newest-first, so a future date is the newest thing on the
    page and an insertion by date puts a check-in nobody has been asked for in
    the FIRST row a student reads -- which is where the defect put it. So
    `mergeCheckIns` APPENDS a `scheduled` check-in instead of inserting it, and
    the block runs SOONEST-FIRST: the page reads nearest-to-now first and time
    runs both ways from today, so ascending below and descending above is one
    rule, not two. Tone, label and position are three signals of one thing and
    the row needs all three -- the label says "Not due yet" rather than
    "Scheduled" because this same stream already renders an amber `.sched-chip`
    reading "Scheduled" on an ITEM, meaning "students cannot see this yet", which
    is the opposite claim.

- **THE TAB ICON HAS ONE PAINTER, AND A SURFACE ONLY RAISES A STATUS (ledger
  0396).** `TabIcon.svelte`, mounted once in the root layout, paints through
  `$lib/tab-icon/live.ts`, which rewrites the SVG icon link's `href` and nothing
  else; a surface calls `raise(kind, opts)` and `clear(handle)` and never writes
  an icon link or `document.title` itself (the unread count's `(n) ` title
  prefix is the painter's). **Raise the next status BEFORE clearing the last**,
  or the resting icon paints for a frame between them. `$lib/tab-icon/geometry.ts`
  is Mr. Pina's design module byte for byte, held by
  `tests/fixtures/tab-icon-golden.json`, and `npm run tab-icon:build` is the
  only writer of the static icons in `static/IDEA/`: changing a drawing is a
  design decision, then a new board, then a new golden. A product that sets its
  own icon is left alone (the painter stands down when a third icon link
  appears). `docs/design/tab-icon/README.md` holds the states, the sections and
  the signals deliberately not wired.
- **`beforeinstallprompt` HAS ONE LISTENER, IN `src/app.html`, AND EVERY READER
  GOES THROUGH `$lib/install-app` (ledger 0396).** The browser fires it once,
  often before hydration, so a listener in a component either misses it or
  races the first one. The inline head script keeps the event in
  `window.__ideaInstall`; the phone pop-up (`InstallPrompt.svelte`) and the
  home header's key (`InstallAppKey.svelte`) both read it through that module,
  and `installKeyMode` is the one decision of what the key does.
- **A NAVIGATION IS THE ONE PENDING STATE THAT IS GLOBAL, AND IT IS MOUNTED
  ONCE.** `NavigationProgress.svelte` reads `navigating` from `$app/state` and
  sits in `src/routes/+layout.svelte` beside `SiteFeedback`, for the same
  reason: both layout resets in `src/routes` (the classroom projector and one
  student's work page) reset to the root layout, so nothing escapes it and every page route
  INHERITS the indicator instead of having to remember one. This is the
  deliberate opposite of the save state's per-instance rule -- a save state is
  per-surface because a global one would speak for work it cannot see, and a
  navigation is exactly one event with exactly one answer at a time. Before it,
  `navigating` in EITHER spelling (the `$app/state` rune or the deprecated
  `$app/navigation` store) was imported by zero files under `src/`, and every
  navigation in the app showed nothing until the new page painted.
  - **THE DELAY IS THE DESIGN, AND IT IS `NAV_INDICATOR_DELAY_MS` (250ms) IN
    `$lib/pending.ts`.** Below it nothing is drawn: a bar that flashes on every
    click turns an instantaneous navigation into a visible event and teaches a
    reader to ignore the one signal that matters. Above it the reader is past
    the ~100ms band in which a UI still feels like a direct response, and far
    enough below the ~1s point at which they click again. Measured on the
    harness: a warm client-side navigation between two `/dev` routes completes
    in **31-44ms** and draws nothing; a 1200ms load draws at **260-266ms**.
  - **ZERO LAYOUT SHIFT IS STRUCTURAL, NOT TUNED.** The wrapper is
    `position: fixed` and never takes a line box, so it cannot push anything;
    `pointer-events: none` so an overlay across the top of every page cannot eat
    a tap meant for the masthead. Measured, with the negative control in the
    same reading: CLS 0 and 0px reference movement for the real bar, against
    CLS 0.0056 / 3px for the identical bar put back in flow.
  - **THE TRACK IS THE STATE AND THE SWEEP IS THE DECORATION**, which is what
    makes the reduced-motion path work rather than merely not crash: with the
    animation cancelled the mark is still painted at full opacity with no
    transform, so `reduce` conveys the same state by presence. Nothing is hidden
    in a base state. Measured 7.52:1 against the page and 3.80:1 against its own
    track -- the 3:1 non-text floor, because the bar is a graphical object.
  - **THE LIVE REGION IS ALWAYS MOUNTED AND ONLY ITS TEXT MOVES.** Several
    screen readers only announce a `role="status"` they were already observing,
    so the region exists empty from the first frame and the `{#if}` wraps the
    BAR. An empty region correctly holds a ZERO BOX (measured 375x0 and 1440x0)
    -- a spec asserting it visible at rest is asserting a permanent bar.
  - **ITS HARNESS HOOK IS `data-nav-progress`, NEVER `data-testid`, AND THAT IS
    NOT A NAMING PREFERENCE.** `tools/browser-verify`'s `waitForApp` decides a
    page has painted by taking the FIRST match of
    `main, h1, [data-testid], .harness` and requiring it to have a box -- one
    candidate, not the first one with a box. A shell-mounted element is first in
    the body on every page, and this one is correctly zero-box at rest, so a
    `data-testid` here made that predicate never hold **on every route in the
    harness**. Measured on `/dev/marks`, which has nothing to do with it: "app
    rendered in 479ms" became "app DID NOT RENDER (DOM never settled) in
    30007ms", and a full pass would have gone from ~3 minutes to ~50. **Nothing
    went red** -- every check still ran and still reported correct numbers, so
    the only symptom was a slow run. Anything else mounted in the shell that can
    be zero-box takes a hook of its own for the same reason; the harness
    README's own section has the full write-up.
- **EVERY OTHER PENDING STATE IS `$lib/Pending.svelte`, AND ITS WORDS ARE
  `$lib/pending.ts`.** Same division of labour as `SaveIndicator` /
  `save-state.svelte.ts`: the module owns the sentence, the component owns only
  how it looks. Swept before it existed, `src/` carried roughly twenty
  paragraph-level pending states with no shared component and the ellipsis in
  THREE spellings -- `Loading…`, `Loading...` and `Loading&hellip;` -- which is
  not a cosmetic problem but the tell that nothing owned the decision, and also
  why none of them was a live region and none said what was pending.
  - **`pendingLabel` NORMALISES RATHER THAN TRUSTING THE CALLER.** A constant
    only makes the right spelling available; stripping whatever ellipsis was
    typed and appending the one is what makes it the only reachable one. Every
    existing call site was a hand-written string WITH its own ellipsis, so a
    component that merely appended would render `Loading……`.
  - **THE LABEL IS REQUIRED AND THERE IS NO ZERO-ARGUMENT FORM.** `Loading…`
    alone is the same sentence on a roster, a photo and a revision list.
  - **NO SPINNER.** Every surface it replaces was text, several with a comment
    saying so; the route indicator carries the motion, once, where a whole page
    is being waited on. **Do not add a pending state to something that already
    degrades correctly** -- `LinkPreviewCard` renders a working link from the
    first frame and upgrades it if metadata arrives, so there is no window to
    report and a placeholder there would replace a usable control.
  - **IT READS `var(--pending-ink, var(--text-2))`**, the room-hook mechanism
    `Disclosure` uses for `--disc-accent`. `--text-2` and NOT `--dim`, which
    clears only the darkest of the three portal grounds. Measured in all three
    rooms it ships in: portal 5.88:1, classroom card 7.27:1, and the notebook's
    default / light / IDEA plates at 7.27 / 7.75 / 9.18:1.
- **EVERY ACTION IS REGISTERED ONCE, IN `$lib/shell/commands.ts`, AND THE
  PALETTE, THE LEGEND AND VOICE READ IT (ledger 0297).** **Voice reads it
  THROUGH the palette since ledger 0298 (report 31)**, and until then it did
  not read it at all (its vocabulary was the launcher's apps): it is the
  palette's Speak control, its vocabulary is the palette's own rows, and
  `matchSpoken` in `$lib/voice/commands.ts` is the one matcher -- EXACT, so a
  near-miss or a tie acts on nothing and the words stay in the field for the
  ranked list, and an interim result acts only after `VOICE_INTERIM_STABLE_MS`
  of stillness AND only while no other listed name begins with it (a pause
  between "Lab 3" and "report" must not open "Lab 3"; the final result
  settles it). A second vocabulary or a floating Voice pill is the thing not
  to rebuild. A console's keys are
  registered by IMPORTING its table (`GRADE_KEYS` from
  `$lib/classroom/grading-keys.ts`, `REVIEW_KEYS`), never by retyping them, so
  the legend cannot describe a key the console does not bind. A `run` command
  is offered only while a surface has registered its handler through
  `registerCommandHandler`, so the palette never offers something that does
  nothing. Role and context only decide what is OFFERED; the destination
  re-checks access, as every route already does.
- **A change signal must be worth trusting.** An "Updated" badge is stamped only by a
  real content change to something already visible -- publishing, scheduling, pinning,
  reordering and filing are NOT edits, and neither is a save that changed nothing.
  Compare before stamping; do not stamp because a field was present in the payload.
- **Metadata for a third-party link is fetched SERVER-SIDE, never from the student's
  browser**, and cached in memory rather than in a table -- a cache writable by
  anything a signed-in user can reach is a cache anyone can poison. Every failure
  degrades to a plain link, never an error.
- **An authored slug or a printed URL is a PERMANENT CONTRACT.** QR codes and handouts
  are in circulation, so a route they name keeps resolving and a section anchor keeps
  its slug. Short links are re-pointable rows, so they redirect **307, not 308** (a
  permanent redirect is cached past the point where re-pointing helps), carry
  SAME-SITE targets only (an open redirector on our own domain is a phishing
  primitive), and must not carry their own fragment -- the visitor's survives the
  redirect and would be overridden.
- **Thread `now` through from the caller.** A component that reads its own clock
  silently disagrees with the ranking it is rendering.
- **A pre-save preview shows the CONTENT, at `object-fit: contain`.** A filename says
  nothing about whether the page is in frame, and cropping to fill hides the cut-off
  edge the preview exists to catch.
- **A POPOVER ANCHORED TO SOMETHING INSIDE A CLIPPING BOX USES
  `$lib/shell/anchored`, NEVER AN OFFSET MEASURED OFF ITS OWN WRAPPER.** An
  absolutely-positioned panel is trimmed by any ancestor's `overflow`, and how
  far past that ancestor it runs is a function of WHERE ITS TRIGGER SITS, not of
  the viewport -- so a media query can only ever fix the widths somebody thought
  to look at. `RichTextEditor`'s link popover was the last hand-rolled copy: a
  `@media (max-width: 30rem)` rule fixed the phone and left it clipped from
  481px to about 740px, where it opened with its Cancel sliced off inside
  `.rt-editor`'s `overflow: hidden` (measured: editor right edge 667.0 against
  panel right edge 693.2 at 700px, and 487.0 against 591.2 at 520px with Add and
  Cancel both gone). The action writes `position: fixed` plus two coordinates,
  so the panel escapes the clip entirely and flips and clamps against the
  viewport; `anchorPosition` beside it is the pure arithmetic, testable with no
  DOM. The one thing the action cannot do is cap a panel WIDER than the viewport
  -- clamping keeps its start on screen and lets the far edge run off -- so the
  panel's own stylesheet keeps a `max-width`, and its absolute rules stay as the
  fallback that prints and paints before the first placement.
- **A disclosure is a real `<button>` with `aria-expanded`/`aria-controls`**, never a
  div plus a document-level click listener -- that is mouse-only and invisible to
  assistive tech, and it double-toggles against any control added later.
  - **`$lib/Disclosure.svelte` IS THAT DISCLOSURE, and a new one is a caller of
    it.** It takes a `label` (a word, never only a caret), an optional `heading`
    level, a `collapseWhen` signal and a `scope`; `$lib/disclosure.ts` holds the
    arithmetic so it is assertable without a browser. **The region is HIDDEN IN
    CSS, never removed** -- so it prints, and reopening it costs nothing.
  - **Its default is EXPANDED, for every role.** `disclosureOpen` takes no role
    parameter and must not gain one: a per-role default is two behaviours to
    keep in step. **What is stored is the MANUAL CHOICE, never the current
    state** -- storing the state freezes the first render forever, which is the
    exact defect a collapse exists to fix. The viewer's id is added to the
    storage key INSIDE the component, so "per person, per item" is one rule in
    one place and no caller threads an identity.
  - **A room re-points it through `--disc-accent` / `--disc-focus`**, read at
    the point of use with a fallback rather than declared on the component --
    a declaration there sits on a DESCENDANT of the room's wrapper and would
    beat it.
  - **Twenty-odd hand-rolled disclosures predate it** (native `<details>`, and a
    button over a `max-height` rule). They are MIGRATION CANDIDATES, not a
    second sanctioned pattern. **A menu, a popover and a combobox are not
    disclosures** -- `aria-haspopup`, outside-dismiss and `role="combobox"` are
    different contracts and do not migrate.
- **READING COLLAPSES ONCE THE WORK HAS STARTED, and it is ONE decision across
  surfaces.** An assignment's instructions panel and a notebook check-in's
  guidance panel are the same question, so they are the same component with the
  same behaviour (`IDEA_INTERFACE_STANDARDS` 1). The "has started" signal is
  DERIVED from state the surface already holds -- `specStarted` /
  `moduleStarted` off the responses already loaded -- never from a store, a new
  prop or a second read.
- **Every section stays in the DOM when a surface must be printable**; hide an
  inactive one with CSS. A section that never rendered cannot print.
