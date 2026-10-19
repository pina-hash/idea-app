# The class page

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). Teams, class themes, the class header, quick posts, the pattern, the tour, class settings and each person's page layout. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

### CLASSROOM TEAMS -- a draw that persists, and a style keyed on MEMBERSHIP

**THE RANDOM PICKER AND THE TEAMS FEATURE ARE TWO THINGS AND THE FIRST IS
EPHEMERAL ON PURPOSE.** `src/lib/classroom/picker.ts` is a pure draw over names
and a seed; `0223` is what makes one LAST. A teacher re-rolling in front of a
class must not be writing rows on every press of Draw again, so **saving is a
separate deliberate press and is never a side effect of drawing** -- the same
rule Foundry states as "preflight passing is not submission".

- **TWO WAYS TO ASK FOR A DRAW, ONE DEALER.** `pickerTeams(candidates, size,
  seed)` keeps its exact original signature and behaviour;
  `pickerTeamsBy(candidates, mode, value, seed)` is the surface's entry point
  and takes `'size'` or `'count'`. Both route through one private dealer via
  `pickerTeamCount`, so **the round-robin deal cannot acquire a second
  spelling**. Do not replace the size mode and do not change the dealing.
  - **COUNT MODE IS CLAMPED TO THE CLASS SIZE, and the clamp is the count-mode
    twin of the round-robin deal.** Slicing leaves one student alone; an
    unclamped count leaves EMPTY TEAMS -- headed cards with nobody under them --
    which reads as a broken draw rather than as a teacher asking for more teams
    than they have students. The panel says so BEFORE the draw
    (`picker-count-clamped`), because a clamp nobody was told about reads as the
    control being ignored.
- **THE ROSTER IS REFERENCED, NEVER DUPLICATED, AND THE READ LEFT JOINS IT.** A
  `classroom_team_members` row carries an EMAIL and nothing else; the name and
  the active flag come from `classroom_enrollments` at read time.
  `classroom_team_board` LEFT joins and projects `still_enrolled`. **An inner
  join here silently shrinks a team every time somebody transfers out** -- which
  is what every presence-shaped read in this app does -- and destroys the record
  of who worked with whom in the one artifact that held it. A team holding a
  student who left is the state that will ACTUALLY OCCUR, so it has a word for
  it rather than erasing itself, on the surface and in the CSV alike.
- **ONE STUDENT, ONE TEAM PER DRAW, IS A KEY AND NOT A CHECK.**
  `classroom_teams` carries a redundant-looking `unique (id, team_set_id)` purely
  so `classroom_team_members` can hold a COMPOSITE foreign key against it, with
  `primary key (team_set_id, student_email)` beside it. The invalid state is
  unrepresentable, so no RPC re-checks it and no raw insert routes around it.
- **THE STYLE WRITE IS KEYED ON MEMBERSHIP, NOT OWNERSHIP, AND THAT IS THE ONE
  PREDICATE THAT DOES NOT TRANSLATE.** `tournament_set_entry_style` authorizes on
  `tournament_entries.user_id = auth.uid()`; **a team has no `user_id`, it has
  members, keyed by email**. `_classroom_team_member` is new code rather than a
  translation. Any member may write, **last write wins**, and `style_updated_by`
  records who -- a deliberate DEPARTURE from `docs/decisions/entries/30-*`, whose
  owner/manager/transfer shape rests on members holding DIFFERENT
  RESPONSIBILITIES for a work product. A banner is not a work product. **The
  agreed-manager alternative is one nullable column and one branch, and is the
  right change the day somebody reports an actual dispute**; it is not worth
  building before then. A section MANAGER may also write, which the tournament
  rule deliberately does not allow a host, because a teacher who posted a banner
  to a class needs to take one down without retiring the whole draw.
- **AUDIENCE IS STATED, NOT INHERITED: PUBLIC MEANS THE CLASS.**
  `tournament_entry_styles` is `anon`-readable because a TV projector holds no
  session. **A team roster names students in a class**, so its audience is the
  section's own enrolled students and its managers and NOBODY ELSE -- never
  `anon`, at any posting state. All three tables have RLS on with NO POLICY and
  no client grant, so either denies on its own, and every read and write goes
  through a definer function.
- **THE POSTING WINDOW IS A WINDOW ON THE TEAMS RECORD, NOT A FIELD ON AN ITEM.**
  Making a posted roster a `classroom_items` row with an end date would inherit
  the `(item_id, student_email, block_id)` answer model for something that takes
  no answers. Visibility is DERIVED at call time by
  `_classroom_team_set_visible`; there is no stored flag to go stale and no
  sweep. Post and unpost are TWO verbs, because "post until Friday" and "take it
  down" are different intentions and a single toggle taking a timestamp makes
  the second one an argument value.
- **THE SEED IS STORED AND IS IN THE EXPORT, AND A HAND EDIT IS MARKED, NOT
  HIDDEN (0225, decision 44).** The seed is what makes a draw checkable rather
  than merely plausible, and an export is the artifact that outlives the
  screen. A persisted draw that lost its seed is a list of names with no way to
  tell a draw from an arrangement. A manager may still move a student between
  teams of one draw, or add a latecomer with a LIVE enrollment, through
  `classroom_move_team_member`: it locks the set, never touches the seed, and
  stamps `edited_at`/`edited_by`; a student who has left may be moved but not
  added, and a move that changes nothing stamps nothing. `classroom_team_board`
  projects `edited_at` to everyone and `edited_by` to a manager only.
  `teamSetEditedWords` in `$lib/classroom/teams.ts` is the one spelling
  ("Edited by hand") the People tab, the class page (`ClassTeamSet.edited`, a
  boolean, never the address) and the CSV's Edited column read. A rename goes
  through the style write with the other five fields carried over (that write
  replaces all six, so a name-only call wipes a banner), and stamps nothing,
  because it changes no membership. On People a drag onto another team card
  and Move to are two spellings of ONE handler (`moveMember`); a board whose
  sets lack the `edited_at` key (`TeamBoard.editsReady`), or a move answering
  `unavailable`, removes both and says why. **Move to is a worded button that
  opens a row of team buttons, never a `<select>` acting on `change`**: a
  keyboard arrowing through a select fires `change` on every step in Chrome,
  so the first arrow press moved the student. A choice puts the focus back on
  the moved student's own Move to, in the card they landed in.
- **THE RENDERERS ARE THE TOURNAMENT MODULE'S, CONSUMED READ-ONLY.** `accentOf`,
  `hasStyle`, `backgroundCss` and `bannerInk` all take `EntryStyleDraft`, a
  `Pick` that EXCLUDES `entry_id` and `tournament_id`, so they accept a team
  today with no adapter and no extraction. `teamStyle` in
  `$lib/classroom/teams.ts` is the one projection. **Generalizing that module off
  `TournamentEntry` is lane D2's work and must not be done twice**; when it
  lands, that import is the one line that moves. The ink comes from `bannerInk`
  and is never chosen at the call site -- a student may pick any background, and
  a second answer to "which of dark or light survives on it" is how a team ends
  up with black text on a black gradient.
- **NO PRESET LIST LIVES IN SQL.** Badge and flourish ids are length-bounded free
  text, validated by the client against `BADGES` and `FLOURISHES`. A CHECK
  constraint would be a second copy of a list D2 is moving, and the copy that
  cannot change without a migration.
- **A POSTED ROSTER IS ON THE CLASS PAGE (ledger 0297), AND SO IS THE STYLE
  EDITOR (ledger 0360, report R17).** `ClassTeams.svelte` (over `$lib/classroom/class-teams.ts`)
  is mounted from `src/routes/classroom/[sectionId]/+layout.svelte`: it renders
  only a set `_classroom_team_set_visible` answers for, names only (never an
  address). Since ledger 0298 every own-team card comes FIRST and open
  (`ownTeams`), the whole draw sits closed below it, and a teacher gets one
  key in the class header saying until when, linking to People
  (`postedTeamsNotice`, `teamsManageLink`, through `classHeaderTeams` since
  ledger 0360). "Today" on the post control ends at the end of today in
  Los Angeles (`teamWindowEnd` over `schoolDayEnd`), never the browser's
  tomorrow. **The section layout's load never re-runs on a navigation inside
  the class**, so a draw posted after a page opened reached nobody who had it
  open, the teacher pressing Class straight after People included; so
  `ClassTeams` is mounted whether or not anything is posted and re-reads
  through `refreshPostedTeams` every `CLASS_TEAMS_POLL_MS` and on focus, and
  People's post, take-down and retire call `onchanged`. **A member styles
  their own team there**: `TeamStyleEditor` (name, motto, colour, background,
  badge; autosave off, a refusal shown verbatim) opens from "Customize team" on
  an own-team card and from "Edit look" for a manager, through `ClassTeams`'
  `style` prop, and an absent prop removes both. The write is the
  membership-gated one above, the preview is the banner's own 0.22 wash under
  `--text-1`, and a landed save asks the poller for one read (`runNow`) and
  changes no interval. `teamStyleInputOf` carries all seven fields and
  lowercases a hex, because 0223 checks a background hex without `lower()`.

### CLASS THEMES -- the class votes, a tally is all that leaves, and the banner is a wash

**`$lib/classroom/class-theme.ts` IS THE ONE CATALOGUE, AND THE DATABASE STORES
ONLY IDS (decision 45, 0225).** A course's look is voted feature by feature
(palette, pattern, badge) and every section of the course shares it; what tells
Block 2 from Block 4 is the one accent a teacher sets per section
(`SECTION_ACCENTS`, written only by `classroom_set_section_accent`). The vote is
the only way a course's look changes: a teacher opens, closes and resets it
(`classroom_theme_set_voting`, `classroom_theme_reset`) and is refused a vote.

- **THE WINNER RULE IS THE DATABASE'S AND THERE IS ONE OF IT**:
  `_classroom_theme_winners` over one definition of a counted vote,
  `_classroom_theme_counted_votes`. Most votes wins; a tie goes to the option
  whose LATEST counted vote is EARLIEST, so an option that only drew level never
  takes over and the banner cannot flicker. `classThemeBallot` reads the winners
  and never recomputes a tie. A reset stamps a time and deletes nothing.
- **ONLY TALLIES LEAVE THE DATABASE.** `classroom_theme_tally` answers counts, a
  voter count, the winners and the CALLER'S OWN choices, never another voter's
  address or a per-vote time; both tables are RLS-on, no-policy, no-grant, and
  `ClassThemePanel` renders counts only. `classroom_class_themes(uuid[])` is the
  one paint read and OMITS a section the caller cannot read rather than raising.
- **EVERY READ VALIDATES AGAINST THE CATALOGUE AND DROPS WHAT IT DOES NOT KNOW,
  AND OPTION IDS ARE APPEND-ONLY** (the avatar-preset reason: a shipped id sits in
  vote rows and on sections). `tests/classroom-class-theme.test.ts` pins every
  list as a prefix and sweeps every palette and accent against grounds parsed
  from the theme CSS, straight and under `PROJECTOR_MODEL`; an option or a new
  ground joins only with that sweep green.
- **A CLASS NOBODY HAS VOTED ON RENDERS EXACTLY AS BEFORE.** `resolveClassTheme`
  answers null with no known winner and no accent, `ClassThemeBanner` then
  renders its children and nothing else, and a card or strip key carries no
  style; `tests/classroom-class-theme-render.test.ts` compares the markup byte
  for byte.
- **THE BANNER IS A WASH, THE WORDS TAKE `--text-1`, AND EVERY OTHER MARK IS ITS
  OWN ELEMENT.** The palette's wash is a translucent `background-color` over the
  room's own ground (a colour, not an image layer, so the browser pass's ground
  walk composites it), the pattern a `background-image` on the banner alone, and
  nothing on it takes `--text-2` (3.13:1 there on IDEA). The plate repaints a
  card's and a key's BORDER, so a card's accent is `.class-theme-edge` and a strip
  key's is `.cls-theme-bar`: a border colour there came out the plate's grey and
  the contrast check passed on the grey.
- **ONE READ PAINTS EVERY SURFACE.** The classroom layout reads every listed
  class's theme once (`navThemes`, in batches of 200); the strip, My Classes and
  the banner paint from it, and a vote overlays the winners for its own course
  only. `unavailable`, an error or "Not found." is NO theme and no panel, never a
  broken page. **The panel hands `onwinners` its OWN course id**, and a winner
  that differs from that read re-runs it through `depends('classroom:themes')`
  (that load alone), because the classroom layout's load does not re-run on a
  navigation and the strip and My Classes would otherwise keep the old look.

### THE TOP OF A CLASS -- one header, its notices, and a pattern that moves only when asked

**THE TOP OF A CLASS IS ONE BLOCK, `ClassHeader.svelte`, AND IT REPLACED FIVE
ROWS (ledger 0360, report R19).** ClassView mounts it where the banner, the
theme row and the New post row were, and the section layout hands it the tools
row, the quick posts and the posted teams as snippets. Inside the header the
order is fixed: the title line (the class badge beside the plate title bar),
then ONE wrapping key row (the identity chip; the layout's own `.class-tools`
made boxless, so the hall pass, the music and the live door are items of the
row; the class theme's trigger, whose vote drops to an opaque full-width band;
Next due; a teacher's teams key; Quick post, New post and Units). The notices
follow it and the posted teams are a panel of their own (see "EACH PERSON'S
PAGE LAYOUT").
- **`nextDueFor` in `$lib/classroom/class-header.ts` IS THE ONE DECISION OF
  THE NEXT DUE KEY**, and it asks `assignmentStanding`, never a second walk of
  the work: a student is offered the earliest assignment still TO DO and not
  yet past due, a manager the earliest published live one. Drafts and
  scheduled items are never next for anybody.
- **THE TEACHER'S "TEAMS POSTED UNTIL" STRIP IS THE HEADER'S TEAMS KEY NOW**
  (`classHeaderTeams` over `postedTeamsNotice` and `teamsManageLink`), so the
  class page hands `ClassTeams` `manage={null}`.
- **THE BADGE SITS BESIDE THE TITLE** (`ClassThemeBanner`'s `badgeInline`),
  never in a column down the banner, which took 37px from every key row on a
  phone.
- **THE KEY WIDTHS ARE MEASURED CAPS, NOT ROUND NUMBERS**: at 1278 and 1440 a
  teacher's row is two lines and a student's one or two. A key that holds a
  title gives up its middle to an ellipsis, with the whole of it in its
  `title`.
- **ON A PHONE THE KEYS ARE TILES, TWO TO A LINE, AND ONE KEY A LINE IS THE
  REJECTED SHAPE.** A `class-header` container query at 30rem (a phone, and the
  26rem list pane beside an open item) makes the tools, the class theme and
  Next due tiles that say their word on one line and their status on the next;
  one key a line put a student 52px LOWER than the strips it replaced, because
  Next due is a line they never had. Each tile carries `min-width: 0`: a line
  is broken on each item's size clamped by its minimum, and the theme
  trigger's minimum is its `nowrap` voted words (299px), which took it a line
  of its own. The block is the stylesheet's LAST, because the trigger's own
  cap has the same specificity and won while the block sat above it.
  `class-header*.mjs` hold every tool word, status and due date WHOLE inside
  its key at both widths, and a teacher's three posting keys on one line.
- **A CLASS WITH NO THEME RENDERS THE HEADER WITH NO BANNER**, which is
  `ClassThemeBanner`'s null path, byte for byte.

**QUICK POSTS ARE THEIR OWN RECORD, NEVER AN ITEM WITH AN END DATE (0230,
report R22).** One `classroom_quick_posts` row and a
`classroom_quick_post_sections` join, RLS on, no policy and no client grant,
written and read only through `classroom_quick_posts`,
`classroom_quick_post_create` and `classroom_quick_post_take_down`. Taking one
down is a stamp; nothing deletes one. An announcement with an end date would
have put every notice into every items reader and into `materials/`.
- **THE DATABASE STORES ONLY `expires_at`.** Every preset (the end of the
  school day, the next school day, the end of the week, next week, an hour, a
  picked time, until taken down) resolves in `quickPostExpiry` in
  `$lib/classroom/quick-posts.ts` against an injected clock. **THE SCHOOL DAY
  ENDS AT `SCHOOL_DAY_END_MINUTES` (3:00 PM) BECAUSE THERE IS NO BELL SCHEDULE
  IN THIS TREE**; a real one replaces that number and nothing else. A picked
  `datetime-local` value is school time, never the device's.
- **AN END NEEDS NO NETWORK.** `QuickPosts` hides a notice at its end from the
  end the read already carried (`quickPostNextChange`), corrected by the read's
  server `now` within `QUICK_POST_MAX_SKEW_MS`. The poll is the floor at
  `QUICK_POSTS_POLL_MS` (600s: 0.1 a minute, which is exactly the headroom 0357
  left on the item page), and the speed is the `quick-posts` live notice,
  re-read after a random wait of up to `QUICK_POST_NOTICE_JITTER_MS`.
- **"ALL MY CLASSES" IS THE VIEWER'S OWN CLASSES BY `teacher_email`, NEVER
  EVERYTHING THEY MANAGE** (`quickPostTargets`): an admin manages every
  section, so the managed list is the whole school.
- **A NOTICE IS NEVER COLOUR ALONE AND NEVER `{@html}`.** A gold stripe, a
  megaphone, the word Notice and its end in words ("Until 3:00 PM today");
  links are `quickPostRuns` through `safeHref`, rendered as elements, with a
  44px Open key each when a notice carries three or fewer.
- **POST IS ONE PREDICATE** (`quickPostSendCheck`, the `reviewCanSend` rule),
  and the composer holds a deploy reload while it has writing, staged files or
  an upload in it.
- **A NOTICE HOLDS 4000 CHARACTERS AND UP TO TEN FILES (0233, ledger 0368,
  report R04), AND THE READ SAYS WHICH DATABASE THIS IS.** Files are
  `classroom_quick_post_files` rows (RLS on, no policy, no grant, written only
  by `classroom_quick_post_add_file`, which only the notice's AUTHOR may call
  while it is up) over the private `quick-post-files` bucket, 45 MiB a file,
  served only by `classroom_quick_post_file` and a signed download, never
  inline. The read projects `files` (never a key or an address), `files_ready`
  (the bucket's insert policy is there: the storage half sits in a guarded
  block that NOTICEs rather than refuses where the applying role cannot write
  storage) and `limits`; `quickPostLimits` reads a board without them as 1000
  characters and no files, so a client ahead of the migration never offers
  what the database refuses. Post creates the notice FIRST and then uploads
  onto it; a file that fails stays staged with its Retry, "Attach the rest"
  goes to the SAME notice, and the classes hear of it after the first pass.
  A long notice shows a lead (`quickPostSplit`: a line break, then a sentence
  end, then a space, never inside a word) and folds the rest in one
  `Disclosure`, closed on arrival; files sit under it through `AttachmentList
  compact` (every picture a tile opening the Lightbox on the notice's set,
  every other file a download row).

**THE CLASS PATTERN FLOWS CONTINUOUSLY, ON ITS OWN LAYER, AND STOPS FOR ANYBODY
WHO ASKS (ledger 0381, decision 61, REPLACING ledger 0360's arrival-then-hover
loop).** Mr. Pina, 2026-10-14: "still glitching and pausing. they should be
smoothly continuous looping animations". The old motion was a 4.2s arrival that
eased to a stop, then a loop that ran only under a hovering pointer and swung
back and forth, so it paused whenever the pointer left, never ran on a touch
screen and slowed to nothing at both ends of every swing. The pattern is still a
real `aria-hidden` element in `ClassThemeBanner` (a scoped `::after` is pruned),
drawn with the catalogue's own stroke at its own alpha and painted over the
wash and under the words by TREE ORDER among positioned boxes, with no z-index,
so the banner is still no stacking context.
- **ONE PERIOD OF A REPEATING GRADIENT IS THE SAME PICTURE, SO THE LOOP HAS NO
  SEAM.** `patternFlow` in `$lib/classroom/class-theme.ts` derives the moving
  form from the one template (no second copy of any pattern): a registered
  property (`--ct-phase` for stripes, rings and ripples, `--ct-turn` for rays)
  runs from zero to exactly one period, linearly, forever, through Web
  Animations (`PATTERN_FLOW_MS`, stepped at `PATTERN_FLOW_FPS`). Never a
  transform over an overscanned layer, never `alternate`, never an ease.
- **IT IS PHASE-LOCKED TO THE WALL CLOCK** (`patternFlowOffset(Date.now())`),
  so a remount (a tab change, a return from `display: none`) lands on the frame
  already showing instead of restarting it.
- **IT STOPS UNDER `reduce` AND UNDER `Class banner motion` = Still** (Display
  settings, `display.bannerMotion`, per device), which is WCAG 2.2.2's off
  switch for motion past five seconds; stopped, the layer draws the still
  template byte for byte. A browser that cannot register a custom property
  would animate it in one jump a period, so it stays still there too.
- `class-header-pattern-*.mjs` measure the flow and the still state;
  `classroom-theme.mjs`'s `motion` row measures both media states.

### THE CLASSROOM TOUR -- offered once, recorded when shown

**`classroomTourFor` in `$lib/tour/classroom-tours.ts` IS THE ONE DECISION OF
WHICH TOUR A PERSON GETS (ledger 0297).** Inside a class the teacher tour goes
only to someone who manages THAT class; staff status decides only outside a
class, so a teacher enrolled in somebody else's class gets the student tour
there. Both tours run on `SpotlightTour`, which drops a step whose target is
absent, and every step names its targets by `data-testid` hook, tried in order;
`tests/classroom-tour.test.ts` sweeps `src/` for every hook, so **a surface a
step names keeps its hook**, and a step names a control by its printed word.

- **THE OFFER IS RECORDED AS `offered` THE MOMENT IT SHOWS, AND STAYS ON
  SCREEN.** Recording on the answer offers it forever to someone who walks
  away; removing it on the write removes it the moment it appears. The state
  lives in the preferences store's `guidance` group (account), a finished run
  is never taken back by a replay, and Reset in Settings brings the offer back.
- **THE OFFER NEVER BLOCKS.** One row under the header, nothing focused and
  nothing paused, never on a projected deck; Escape answers it only when the
  key press is plainly meant for it.
- **THE REPORT CONTROL'S WORDS ARE `REPORT_LABEL` AND `REPORT_LABEL_SHORT`** in
  `$lib/feedback/context.ts`; any copy that tells somebody to press it reads
  them, because the updates page pointed at a "Feedback button" for weeks after
  the button said "Report a problem". **They are "Send feedback" and "Feedback"
  since 2026-10-07** (report e36c5437: the box takes ideas and praise too), with
  `FEEDBACK_PROMPT` and the speech-bubble `FEEDBACK_GLYPH` beside them (the error
  page keeps `PROBLEM_GLYPH`); VANGUARD gets all of them through its config
  JSON, never as literals, and a legacy page's button is the real
  `FeedbackTrigger`, server-rendered, so it reads them as every page does. The
  identifiers and every hook (`data-tour="report"`, `.sfb-*`, VANGUARD's panel
  ids) keep their names, because tours and specs address them; the classroom
  header's `shell-report` slot went with the docked control (ledger 0396).
- **`InfoTip` OPENS ON A TAP AND STAYS OPEN UNTIL A TAP ELSEWHERE, ESCAPE OR
  BLUR.** A tip a phone cannot open is a `title` by another name. It has two
  sizes and the caller says which: `tap="reach"` (the default) for a trigger
  inside a line of text, whose 44px is a height-only reach, and `tap="box"` for
  one that owns its row, which is itself a 44px box so its reach never hangs over
  the controls below and takes their taps. **Every classroom setting carries a
  `help` sentence** (`$lib/preferences/classroom.ts`, report R04), rendered as a
  `box` InfoTip on the setting's TITLE and never inside a choice's label, where a
  tap would also pick the choice. A help line that restates its title is noise,
  and `tests/preferences-store.test.ts` refuses one.

### A CLASS'S OWN SETTINGS, AND ITS ARCHIVED CLASSES

**A CLASS'S OWN SETTINGS ARE ITS SIXTH TAB, NOT PEOPLE'S LAST CARD (report R06,
2026-09-28).** `sectionTabs` ends with a manager-only `settings` tab
(`classSettingsHref`), whose route 404s a non-manager exactly as People and
Grades do, and `ClassSettingsPanel` holds Edit details, Archive class and Delete
class, MOVED rather than copied out of `PeoplePanel`, which keeps one line
pointing at the tab. The header's per-person control says `Display settings`
(command `settings.open`), so it is never mistaken for `class.settings`.
`tests/classroom-settings-tab.test.ts` drives the real load in both directions.

**ARCHIVED IS ONE PREDICATE, `splitArchived` IN `nav.ts` (report R12).** My
Classes puts archived classes under a closed `Disclosure` with the count
outside; the header's class strip draws active classes plus one Archived key
over an `anchored` list, and its Classes menu (ledger 0392, report 2f019c5b)
lists Your classes and Archived under their own labels, one line per class
with the course code in a fixed column. `keep` is the class on screen: it keeps
its own key when archived, so nobody is stranded on a page whose key vanished.
`active` absent reads as active.

**A CONTROL THAT OPENS A PANEL IS LIT WHILE IT IS OPEN (report R15)**:
`class:on` beside `aria-expanded`, which the plate's key list already draws, so
the way back is the pressed key. `Disclosure` does it for every caller.

### EACH PERSON'S PAGE LAYOUT -- hide, show and reorder, and the work never moves

**A PERSON ARRANGES THE CLASS PAGE AND THE ITEM PAGE FOR THEMSELVES, AND IT IS
SAVED TO THEIR ACCOUNT (ledger 0360, report R23, phase 1 as Mr. Pina decided it
on 2026-09-30).** `$lib/classroom/panel-layout.ts` is the vocabulary and the
arithmetic, the preference store's `panels` group (account) holds it through
`readPanelLayout`, `PanelLayoutEditor` (Settings) edits it with a drag grip,
arrow keys, Move up and Move down, Show and Reset, `PanelStack` renders a page
through `resolvePanels`, and `PanelsHiddenNote` says on the page what is
hidden and links back. Adding buttons is phase 2 and is not built.

- **THE PANEL IDS ARE STORED AND APPEND-ONLY** (`CLASS_PANELS`,
  `ITEM_PANELS`), for the avatar-preset reason: renaming one turns somebody's
  arrangement back into the default with nothing saying why. A stored id this
  build does not know is dropped on read, never coerced.
- **EACH PAGE HAS ONE ANCHOR THAT NEVER MOVES AND IS NEVER HIDDEN**, the posts
  on the class page and the work on the item page, and `PanelStack` renders it
  BETWEEN two keyed lists and outside both. Moving an `<iframe>` in the DOM
  reloads it, and a ported worksheet is an iframe, so one keyed list over every
  panel would reload a student's open worksheet on every reorder. The class
  header moves but never hides, because it holds the page's h1.
- **ORDER IS DOM ORDER, NEVER CSS `order`**, so reading order and tab order are
  what is on screen. A hidden panel is NOT RENDERED, so whatever it polls stops.
- **ON THE CLASS PAGE THE HEADER IS ONE PANEL WITH THREE PIECES (R19 on
  R23).** `tools`, `theme` and `actions` (Quick post, New post, Units) are
  `within: 'banner'`: they show and hide in place (a hidden piece is handed to
  `ClassHeader` as null, so whatever it polls stops) and never move, and the
  editor lists them inside the header's row with Show and no grip. Their ids
  stay because they are stored, and an order naming one is placed without it.
  `teams`, `find` and `videos` move; hiding `teams` also takes a teacher's
  teams key out of the header. A hidden search row with a filter still
  narrowing keeps its count and Clear in the posts, and `class.search` leaves
  the palette with it.
- **WHAT IS NOT A PANEL STAYS PUT**: the item's hero and inspector, the page
  footer, the drop overlay, and the class page's notices, which sit directly
  under the header while it leads the page and lead the page otherwise
  (`classNoticesFirst`), so no arrangement puts a teacher's notice under a
  student's search, videos or posts.
- **AN UNSET LAYOUT RENDERS EXACTLY AS BEFORE.** The default order is the page's
  own (`classPanelDefaults`, `itemPanelDefaults`, which puts the rubric last
  per report R20), and an empty stored order means "the default", so a new
  panel added later lands where the default puts it for everybody who never
  touched the editor. `tests/classroom-panel-layout-render.test.ts` holds the
  class page to a golden taken before the page went through `PanelStack`.
