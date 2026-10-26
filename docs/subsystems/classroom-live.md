# Live class, presence, hall pass and polling

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). Who is working, the hall pass budget, the live tab and projector, and the one poller. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

### WHO IS WORKING -- an instrument's silence is never a fact about a student

**A DERIVED INSTRUMENT MAY NOT CONTRADICT THE RECORD IT IS RENDERED BESIDE, AND
A MISSING ROW IS AS MANY ANSWERS AS THERE ARE WAYS FOR IT TO GO MISSING.**
`0200`'s presence table (`classroom_presence_state`, the four states in
`$lib/classroom/presence/state.ts`) is written ONLY by a heartbeat ping from the
assignment page, and its own header says so: a student with no row has never
opened the assignment. `PresenceLine` printed `PRESENCE_NEVER_OPENED` from the
`{:else}` of a two-branch component, and `GradingConsole` handed it
`presenceRows.get(email) ?? null` over one nullable payload -- so "Not opened"
was ALSO what a first poll still in flight printed, what a deployment with no
such RPC printed, and what a swallowed network error printed. Mr. Pina filed it
from the other end on 2026-09-12: a roster row reading "Returned 18/20" with
"Not opened" underneath it.

- **`presenceLineKind` IS THE DECISION AND THERE IS ONE OF IT**, in `state.ts`
  beside the words, taking three facts: is there a row, has presence ANSWERED,
  and has any of this student's work arrived. `row` prints the record;
  `outranked` prints NOTHING AT ALL; `unknown` prints `PRESENCE_UNKNOWN`;
  `never-opened` is the only reading that earns the verdict. A component and its
  caller cannot disagree about which of them is printing.
- **THE ORDER IS THE RULE: `workArrived` IS WEIGHED BEFORE `loaded`.** A row a
  grader is reading says nothing rather than "Not known", which is both the
  honest answer and the quiet one -- and it takes the third line off the rows
  that have work, which is the half of the spacing complaint that could be
  answered without touching the 44px roster floor.
- **AND WORK IS ASKED OF `statusChip` ITSELF.** `workArrived` in
  `GradingConsole` returns `statusChip(s).cls !== 'none'` rather than walking
  `submission`, `responses` and `files` again: a second walk is exactly the
  second copy that stops matching, and what it produces is a chip saying "In
  progress" over a line saying "Not opened".
- **A TRANSPORT ANSWERING NULL REMOVES THE REGION, WHICH IS WHAT ITS `PGRST202`
  RUNG ALWAYS MEANT.** The region used to key on the TRANSPORT OBJECT, which
  both grading routes hand in unconditionally and correctly, so the
  absence-removes-the-region rule never fired for the one state it was written
  for. It keys on `presenceStatus` now: `pending`, `ready`, `unavailable`,
  `stale`.
- **A SWALLOWED FAILURE SAYS SO** (`PRESENCE_STALE_NOTE`). Keeping the last
  payload is right -- best-effort instrumentation must never affect what it
  measures -- but keeping it silently is how an absent reading passes for a
  fresh one.
- **THE COVERAGE SENTENCE IS A FUNCTION OF THE PAYLOAD'S OWN LIMITS**
  (`presenceCoverageNote`), because it names the retention window and a literal
  there would be the second copy of a number this module's header exists to make
  travel. `PRESENCE_COVERAGE_NOTE` is derived from
  `PRESENCE_LIMITS_FALLBACK` rather than typed.
- **DO NOT MAKE THE PRESENCE TABLE READ WORK.** That is a migration, and the
  table's silence about a student who did the work on a path that emits no beats
  is a PROPERTY of what a heartbeat is, not a gap to close in SQL. The repair
  belongs where the two facts are rendered side by side.

**AND THE PAGE'S TOOLS LIVE IN THE PAGE HEADER, NEVER ABOVE THE NAMES (ledger
0347, decision 43).** Every export (the FACTS CSV, the graded-work JSON pair and
spreadsheet with the identity toggle, Download all files) is one `Export` panel
and closing the assignment is one `Close assignment` panel, both `Disclosure`
callers in `.gc-head` with the pager beside them. They used to sit in the
roster card's tools region, where Mr. Pina found the exports scrolling in a
sliver (R16) and the names starved of room. `.disc` is `display: contents` in
the header, so each trigger sits in the tool row and each body drops to a
full-width band under it: the component still owns the state, the ARIA, the
per-person memory and the print rule, and nothing is hand-rolled. Closed by
default (`collapseWhen` constant-true, safe because the signal is LATCHED), with
the open/closed count in the Close trigger's `meta`. The triggers are painted as
keys through plate.css's own key list (`:where(.gc-head) .disc-trigger`), and an
open one is lit because `Disclosure` marks its trigger `.on`.
- **THE ROSTER IS A LIST OF PEOPLE, AND SELECTION IS A MODE.** Tick boxes, the
  presets and the selection bar exist only while `Select` is lit, and `Select`
  is absent with no rubric, with a sentence saying why. The bar sits directly
  above the names (sticky below 1024px) and says in words whose rubric form it
  will send, because the rubric form IS the batch; an armed plan takes the
  LIST's place rather than squeezing above it. `To grade` is a VIEW (`toGrade`,
  asked of `workArrived` and `changedFor`, so a kept row's chips say why); the
  pager, the keys and the presets walk the list on screen, and a pick the view
  hides stops being selected, so a batch never writes a row nobody can see.
- **THE COVERAGE SENTENCE IS AN `InfoTip` ON THE "Presence and working time"
  LABEL ABOVE THE LIST**, which is decision 43's permitted move and nothing
  weaker: the text stays in the DOM whether or not the tip shows, it is the
  trigger's description, and it renders whenever the region does.
- **THE LIST'S FLOOR IS WRITTEN AS A CEILING ON WHAT SITS ABOVE IT
  (`.roster-tools` 45%, the selection bar 50%), AND NO ABSOLUTE FLOOR ON EITHER
  SIDE.** Both earlier attempts are the same defect in two directions: a
  `min-height` on the LIST took the panels to 0px tall with 156px of content in
  them, clipped rather than scrolled; a 9rem floor on the PANELS took the list
  to 11.9px with 44px of content, where `elementFromPoint` at the first name's
  centre answered the bulk checkbox's label. A proportional cap cannot do
  either, and each region keeps its scrollbar because no region on this site
  may hide one. **Both regions above the names are `flex: 0 0 auto` under those
  ceilings (ledger 0360, report R25)**, because flex-shrink is weighted by
  flex-basis: with a shrinkable head, a long list squeezed it to a sliver with a
  scrollbar of its own. A roster row is ONE line (the name `nowrap` with an
  ellipsis, the whole name in `title`, the card and the work head), and the
  row's detail is ONE `RosterCard` for the hovered or focused name.

**AND `Return to student` IS A STICKY DOCK BOUNDED BY `.grade-main`, NEVER A
SECOND COPY AND NEVER `position: fixed`.** Above 1024px `.work-col` is its own
scroll container, so the actions row scrolled out of view inside that pane --
which is where a sticky anchors. One element made sticky cannot appear twice,
which is what the "not twice when the column does not scroll" requirement is
about; `.grade-main` bounds it to the rubric and the comment it acts on (it was
added to stop the dock short of a batch panel further down the same card, which
ledger 0347 moved to the roster). It carries a `z-index` because sticky makes
the row POSITIONED and positioned siblings paint in tree order -- the notebook
grid's sticky header shipped exactly that -- and an opaque ground because a
transparent dock over scrolling content is two lines of text on top of each
other.
- **NEXT AND PREVIOUS STUDENT ARE BUTTONS IN THE PAGE HEADER AS WELL AS `n` AND
  `p`, AND IT IS WIRING RATHER THAN LOGIC.** `moveStudent` walks the list on
  screen, opens the first name when nobody is open, routes through
  `requestSelect` so the unsaved-work guard still fires, and lands focus on the
  first criterion. It left the dock in ledger 0347 because its labels wrapped
  there and it walks the whole list, which is the page's job. `aria-disabled` and
  never `disabled` at the ends, because a disabled control swallows its own
  pointer events and the pager's live note explains itself.
- **A RETURNED GRADE CAN BE TAKEN BACK, REVOKED AND RESTORED, AND NONE OF IT
  DELETES ANYTHING (0265, ledger 0392).** `classroom_unreturn_grade` puts a
  returned row back to graded-not-returned; `classroom_revoke_grade` copies
  every grading column into `classroom_grade_revocations` and clears them;
  `classroom_restore_grade` puts the snapshot back exactly, refused as
  `graded_since` when somebody graded in between. All three gate on
  `classroom_can_review_submission` (a teacher of record or an admin), never
  on coins, and re-run the Perfect Score sync so a reward follows the grade;
  the weekly Highest Score payout is NOT reversed (a decision owed, stated in
  0265's header). `$lib/classroom/grading-undo.ts` is the client's one
  vocabulary, and an absent transport (`PGRST202`) removes the row.
- **THE RUBRIC'S WIDTH IS THE GRADER'S, BY THE CLASS LIST'S OWN GESTURE (ledger
  0381, report c0964d99: "move it over just like ... on the classroom page").**
  Beside the work, a `role="separator"` (`.rubric-sep`, in the gap, no track of
  its own) drags, takes arrows, Page keys, Home and End, and Enter or a double
  click goes back to the preset; the width (`rubricWidthRem`) is a per-device
  convenience in `localStorage` (`idea.grading.rubricWidth`, read in try/catch),
  never under `RUBRIC_MIN_REM` and never leaving the work under
  `RUBRIC_WORK_MIN_REM`. Hidden, the rubric's level and criterion keys do
  nothing (`rubricHiddenNow`), so a key never scores something off screen.
- **A GEOMETRY CLAIM HERE IS `npm run verify:browser`'s AND NOWHERE ELSE'S.**
  `tools/browser-verify/routes/grading-bulk-state-dock.mjs` drives the dock's
  own scroll container -- the pane above 1024px, the document below it -- and
  HIT-TESTS the Return control at its own centre, which is the only read that
  tells a covered control from a clickable one;
  `tools/browser-verify/routes/grading-bulk-state-redesign.mjs` holds the
  header, the no-sliver export claim and the selection mode. `tests/dom/` has no
  layout engine and reads every box as zero.

### THE HALL PASS IS A TIME BUDGET, AND THE BUDGET IS DERIVED FROM THE PASS ROWS

**A STUDENT HAS MINUTES, NOT A COUNT (ledger 0380, report 7348d14c, 0237;
decision 58).** `_classroom_hall_pass_budget` is the one rule, asked at a pinned
instant: debt(next) = max(0, debt + used - budget) and allowance = max(0, budget
- debt), per Los Angeles school day, with debt cleared at Monday 00:00 in Los
Angeles. Nothing is stored: a day's charge is `least(duration, auto check in
cap)` over the pass rows, so a pass an instructor closes late, a pass nobody
closed and a pass opened before the budget began (`classroom_hall_pass_budget_start`,
the apply instant, so nothing is charged retroactively) all fall out of one
sum. A pass open past the cap is closed AT the cap by a lazy sweep
(`_classroom_hall_pass_sweep`, run by the state read and the open call,
`closed_by` 'auto') and charged the full cap. Both numbers are the SECTION's own
(`hall_pass_daily_minutes`, `hall_pass_auto_minutes`, set through
`classroom_hall_pass_set_limits`, null for the default), and no component or
stylesheet writes 10 or 30 down: `tests/classroom-hall-pass-limits.test.ts`
sweeps for it.
- **IT REPLACES 0174'S DAILY COUNT AND COOLDOWN; BOTH ARE GONE, NOT KEPT BESIDE
  IT.** The refusal is `over_budget` and carries the instant the student may go
  again and the weekly reset, so the sentence names a day (`hallPassAvailableWords`),
  because a "no" with no way forward is asked again in person. A student whose
  debt cannot clear before the reset is told the reset's day.
- **EVERYONE IN THE CLASS SEES WHO IS OUT, REVERSING 0143'S ONE-BIT RULE
  (decision 58).** The student payload carries `out: { name, opened_at }`, the
  shown name only, so a pass nobody checked in is noticed by the room; it still
  carries no address, no pass id and no history, and the type has no field for
  one. The instructor payload carries each student's budget by address.
- **A LONG PASS WARNS AT 10 MINUTES AND FINES AT 20 (decision 67, 0243),
  REVERSING 0143's "NO COIN LINK".** `_classroom_hall_pass_check` is the one
  rule: duration is `least(closed - opened, auto check-in)`, a pass is judged
  only once CLOSED, and only when the student or the sweep closed it and no
  instructor opened it, so an instructor's pass is never warned or fined. One
  `warning` and one `fine` event per pass, keyed `(pass_id, kind)`; the fine is
  a `long_bathroom_break` row whose actor is `system`. Every path checks: the
  sweep (so the state read and both opens), `close_mine` and `close_by_id`.
  Both thresholds are coin settings, never literals in a component.
- **THE CONTROL MIRRORS THE BUDGET AND DOES NOT IMPLEMENT IT**: a payload with no
  `budget` (a database before 0237) blocks nothing, and the database refuses
  the call regardless.

### THE LIVE CLASS -- the projector reads nothing private

**THE LIVE TAB IS A MANAGER'S CONTROL VIEW AND THE PROJECTOR IS A SECOND WINDOW
IT FEEDS, AND ONLY WHAT THE CONTROL VIEW CHOOSES TO SEND EVER REACHES THE WALL
(ledger 0297).** `/classroom/<id>/live` (404 to anyone who cannot manage the
section) holds who is working, the timer, the hall pass, today's agenda and the
random picker; `/classroom/<id>/live/projector` is `+page@.svelte`, a reset to
the ROOT layout, so it inherits the site theme and drops the classroom chrome.
It loads the class label and nothing that names a person.

- **THE WALL FOLLOWS A THEME CHANGE LIVE, AND NEVER THROUGH THE FRAME (bug
  145c0352).** The projector has no theme control and a deploy never reloads
  it, so `ThemeRoot` listens for the `storage` event another window's write
  fires, reads it with `themeFromStorageEvent` and hands it to
  `adoptSiteTheme`, which moves the state and NEVER writes storage (a follower
  that repaired an unknown id would fight another build's tab over the key).
  Every open window of the browser follows; the session gate and Space White's
  scope still decide what paints. Theme in the frame was the rejected shape: a
  second writer of `data-theme` that fixed one window. With site data blocked
  nothing persists, so nothing follows. `tools/browser-verify/_theme-follow.mjs`
  drives four pages of one context and reddens with the listener removed.
- **THE CLOCK FACE IS THE FRAME'S TENTH KEY, `clockFace`, OFF BY DEFAULT (idea
  26033e4b).** `digits` is the wall as it was; `dial` is `WallClock` (an analog
  face on `PlateRing`, digits under it), the hero ONLY while no timer is up,
  because the ring already means time left. The choice is the control view's
  Clock face key, remembered per device in `display.wallClock` (a Settings row
  too). The hands come from `clockHandAngles` in school time, the hour and
  minute hands stepping once a minute; the second hand is not drawn under
  `reduce`, and no hand is ever moved by a CSS transition (354 to 0 would sweep
  backwards). Hands and indices are `--text-1` (5.78 washed at worst, Space
  White), the second hand `--plate-ring-text` (3.43), each over a
  `--plate-ring-band` halo; the Plate's tick colour fails as an index (1.58).
  The dial sizes on its own `--lp-dial`, never a re-pointed `--lp-ring`.

- **`buildProjectorFrame` IS THE ONE PROJECTION AND `parseProjectorFrame`
  RE-VALIDATES ON THE WAY IN.** A frame crosses a same-browser `BroadcastChannel`
  (with a `localStorage` fallback), and the projector keeps only
  `PROJECTOR_FRAME_KEYS` and the two hall-pass words, so a control view that
  grew a field cannot put it on a wall by accident. There is no server channel,
  which is why a phone cannot drive it; adding one is a disclosure decision.
- **A PICKED NAME REACHES THE WALL ONLY ON AN EXPLICIT Show, WITH ITS SEED, AND
  WHO IS WORKING REACHES IT ONLY AS COUNTS (ledger 0360, reports R12/R13).**
  Student activity is OFF until the control view's Student activity is pressed,
  and is then five counts (`WALL_ACTIVITY_GROUPS`). Names are a SECOND, separate
  press (Names too): never adopted from a stored frame after a reload, never for
  Working, never for whoever is out on the hall pass (`wallActivityCells`), and
  shortened to "First L." (`wallName`). Presence detail and a hall-pass name
  never reach the wall, and activity older than `WALL_ACTIVITY_STALE_MS` leaves
  it. `PROJECTOR_FRAME_VERSION` stays 1, so a wall open across a deploy keeps
  painting. **The wall's side is fitted by `wallFit` against its measured box and
  is never clipped**: the largest type that fits, never below 8H, cuts in a fixed
  order, each said as "+N more". The hero's sizes are fractions of `.lp-main`, a
  size container the window sets, never a shrink-to-fit parent (the 48px timer of
  report R12). The ring face is an SVG gradient the contrast walk cannot see, so
  `tests/classroom-projector-ring-contrast.test.ts` reads its tokens instead.
- **AN IDLE DETAIL IS A SCHOOL-DAY QUESTION (ledger 0360, report R11).**
  `idleDetail` in `$lib/classroom/live-class/grid.ts` reads "No typing today" when
  the last keystroke was on an earlier Los Angeles school day, and hours and
  minutes inside one; 0200 keeps `last_input_at` for life, so a bare minute count
  printed "No typing for 1463 min".
- **A PROJECTED ROUTE JOINS `PROJECTOR_ROUTES` IN THE SAME CHANGE, AND KEEPS
  THE FEEDBACK BUTTON'S CORNER OFF THE PROJECTED IMAGE**: the first so a deploy
  never reloads it mid-lesson, the second because the button is the root
  layout's, in the same corner on every page (ledger 0396), never relocated. The
  wall strip stops short of it (`--feedback-clear-inline`) and fades it with
  itself, the deck's stage stops short of it outside full screen, and in full
  screen it is not drawn at all, because the full-screen element is the stage.
  Wall text is sized to be read from the back of the room and measured under
  the projector wash (`PROJECTOR_MODEL`).



### LIVE POLLS -- one poller, out of step, and never as anon

**EVERY CLASSROOM WIDGET THAT RE-ASKS THE DATABASE ON ITS OWN RUNS ON
`startPoller` IN `$lib/classroom/poll`, AND A NEW ONE IS A CALLER OF IT (ledger
0357).** The production database stalled at 8:00 on 2026-09-29 and 2026-09-30
under 21 students' polling, and the five widgets of the day (`HallPass`,
`SongQueue`, `ClassTeams`, `ClassThemePanel`, `PresenceHeartbeat`) each had a
hand-rolled `setInterval` that ticked in step with the class, twice on a tab
return (`visibilitychange` AND `focus`, which also fires on every alt-tab), and
on through every error, as `anon` once the session was gone. The poller owns the
rules and `tests/classroom-poll.test.ts` pins each as a count: one call in
flight, one call per tab return (a poke must clear `defaultPokeGapMs`, never
under 10s), a random first offset in [0, interval), +/-20% jitter, nothing
while hidden, a backoff doubling to 5 minutes, and a full stop on a 401, 403 or
`42501` (`isSignedOutFailure`), handed to `pollSignedOut` in
`$lib/classroom/poll-session`, which is the root layout's own
`invalidate('supabase:auth')` and nothing invented. It starts again only when
`authChanged` sees a NEW session.

- **A TRANSPORT SAYS "SIGNED OUT" BY THROWING `PollSignedOut`, OR BY A
  `signedOut` FLAG ON ITS FAILURE, NEVER BY ANSWERING NULL.** Null is a failed
  read, which backs off; folding a lost session into it is exactly how the
  anon storm happened. A page LOAD that reaches the same read
  (`loadPostedTeams`) still catches everything, because a load must never fail
  over a widget.
- **THE FLOORS ARE THE LIVE CHANNEL'S FLOOR, NOT THE MECHANISM, AND THEY ARE
  SLOW ON PURPOSE**: hall pass 120s, songs 300s, posted teams 300s, quick posts
  600s (`QUICK_POSTS_POLL_MS`, ledger 0360), the theme
  tally 30s while a vote is open and 120s while it is closed (and only while its
  panel is open), and the presence beat at `PRESENCE_BEAT_STRETCH` (4/3) of the
  database's 30s heartbeat, which the test holds inside 0200's credit cap, input
  window and 20s floor at both ends of the jitter. The same test holds a
  student's steady-state calls a minute at no more than half the 2026-09-30
  figure on the class page and the item page; a faster interval is a decision
  with a measurement, never a tweak.
- **A HARNESS THAT COUNTS READS PASSES `pollMs`**, which the class page never
  does, so a randomly placed first poll cannot land inside a spec's few seconds.

### NOTICES FROM THE DATABASE: `teams` AND `team-doc` (ledger 0436, 0302)

**The first two topics sent by a TRIGGER rather than a client.** `_classroom_live_notice`
calls Supabase's `realtime.send` with the same payload-free `{ topic }` a client announces,
best effort (a database without it sends nothing, and a failed send never fails the
write). `teams` goes to the SECTION's channel when a draw is posted, unposted, retired,
renamed or a member moves, so a page showing a team document re-reads which team its
student is on; that is what makes the People tab's Post, the connector and the SQL editor
all reach an open page within the two seconds Mr. Pina asked for. `team-doc` goes to ONE
team's channel, keyed `team-<team id>` through the ordinary `ClassroomLive` interface (the
key is a channel name), when a team box is saved, locked or released or a role owner set,
so only that team's pages re-read. `TEAM_NOTICE_JITTER_MS` is 300: a team is four people,
not a class, and the wait only coalesces a burst. The floor is a tab return, never an
interval (the item page's call budget is spent), and a lock running out redraws on the
clock with no read (`teamNextLockChange`). `tests/db/supabase-stub.sql` carries a
`realtime.send` that writes the row the real one writes, so a suite can count notices.

**THE STAFF PAGES LISTEN ON THE SECTION, NEVER ON EVERY TEAM (ledger 0436, 0304, 0306).**
`/classroom/signoffs` and `/classroom/board` subscribe to each class they list
(`staffSections`) for `signoffs`, and the board for `teams` too, with the same jitter; a
teammate's saved answer reaches the board only through its poller floor (120 seconds,
`startPoller`, which also re-reads on a tab return), because a board subscribed to every
team's `team-doc` channel would hold fifteen channels open to show a burn-up that moves
once a class. A new request also reaches the deciding teacher's phone, by push, through
`POST /api/classroom/signoff-request` (`_classroom_signoff_notify` names who).
