# The IDEA calendar

_Ledger 0439 (report 0ccf7bff, with d0041188 folded in), migrations 0308 and 0309. One calendar per signed-in person, a calendar per class, a "this week" strip, a phone subscription, day-by-day pacing on HTML assignments, and the post's due date sent to the document. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

### Where it lives

- **`/calendar`** is one person's whole calendar (signed in, in `authedPrefixes`,
  on the site plate). **`/classroom/<id>/calendar`** is the same page narrowed to
  one class, a 404 for a class the caller cannot read, exactly as the class page
  answers. Both are `CalendarPage.svelte` over `loadCalendar`
  (`src/lib/server/calendar/load.ts`).
- **The "this week" strip (`WeekStrip.svelte`) sits where a student already
  looks**: under the title of My Classes (every class, through `MyClasses`'
  `week` snippet) and under the header of each class page (that class, in the
  class layout's `classTeams` snippet). It loads itself once and renders nothing
  when the calendar cannot be read. **It is the door to the class calendar; the
  calendar is deliberately NOT a section tab** (`sectionTabs`): a manager's bar
  already holds six, and a seventh overflows at 375px.
- **The phone subscription** is `GET /api/calendar/feed/<token>.ics`, outside
  `authedPrefixes` because a calendar app holds no session.

### Layers, and the one visibility rule

`CALENDAR_LAYERS` in `src/lib/calendar/model.ts` is the list (classes, pacing,
team, school, no_school, idea, robotics), each on by default with an identity
colour anchored to a meaning the site already gives it. **Every layer except
the school calendar and the Techmen feed comes from the database, through ONE
rule: `_calendar_feed_email`** (0308). It is keyed on an email so the phone link
(no session) and an admin's read of one viewer can ask it; every caller-facing
function is a wrapper (`calendar_feed`, `calendar_feed_for`,
`calendar_feed_by_token`), the 0138 shape. Never write a second statement of it.

- A class is the viewer's when they are ACTIVELY ENROLLED or are its TEACHER OF
  RECORD. **Admin rights add no classes** (an admin manages every section; a
  calendar of the whole school is not his calendar).
- A post shows to a student only once `_classroom_item_live` says so; its
  teacher also sees it on its scheduled day, marked `scheduled`. A draft shows to
  nobody.
- Team tasks are the viewer's own team's in that class's posted draw
  (`_classroom_section_team_set`), named by first name as the plan names them.
- **No payload carries an address.** `tests/db/calendar.test.ts` asserts it and
  is mutation-proven in the permissive direction on the enrollment term, the
  team-membership term and the liveness term (ledger 0439 RESULTS).

A viewer's choices are `profiles.preferences.calendar` (`readCalendarPrefs`,
written through `$lib/preferences/profile-io`), applied on the page by
`visibleEvents` and, for the phone link, by the same function in the feed route.

### The outside feeds

`src/lib/server/calendar/feeds.ts` is the one reader of `BOSCO_CALENDAR_ICS_URL`
and `ROBOTICS_CALENDAR_ICS_URL` (see `docs/subsystems/environment.md`). The
school default is the calendar's public address. **`src/lib/calendar/ical.ts`
reads exactly what those feeds use** (all-day, UTC and Los Angeles times; DAILY,
WEEKLY, MONTHLY with an ordinal BYDAY, YEARLY; COUNT, UNTIL, INTERVAL, EXDATE,
RECURRENCE-ID, CANCELLED), measured on the real feed; a rule part it does not
know keeps the first date only, never invents dates. The parse is cached per
instance for `FRESH_MS` (30 minutes) and served stale for up to a day when a
fetch fails, with a sentence on the page. `tests/calendar-ical.test.ts` holds it
to the recorded feeds in `tests/fixtures/calendar/`.

### Pacing and the due date in the document

`pacing` in an HTML assignment manifest is a DISPLAY KEY (SPEC section 17):
`manifestPacing` and `manifestPacingWarnings` read it and the validator only
warns; the database gates never read it. **`_classroom_item_pacing` (0308) is the
one resolver**: a `day` step is the Nth school day from the day the post opens
(weekends and `classroom_no_school_days` skipped), an admin's change
(`classroom_item_pacing_set`, stored in `classroom_item_pacing`) wins by step
id. The item page reads it once (`loadItemPacing`), judges each step against the
rail's own `hxProgress` (`hxScheduleFor`), draws `PacingStrip` above the frame,
and sends the same object as `schedule` on `idea:state` (`HxSchedule`), whose
`due` is the POST's due date, so a document never types a second copy. The kit
fills `[data-idea-schedule]` and `[data-idea-due]` from it.

### Copying a class forward moves dates by school days

`classroom_copy_forward` (0318, ledger 0455) copies every post of one class into
another as drafts and moves each due date, scheduled day, pacing step and
sign-off date by `_classroom_shift_school_day`: the Nth school day of the old
class (weekends and `classroom_no_school_days` skipped) becomes the Nth of the
new one, and a non-school day keeps its distance from the school day before it.
That function is the one statement of the rule; the class page's "Copy to
class" panel (`CopyForwardPanel.svelte`, `src/lib/classroom/copy-forward.ts`)
only words its answer. A shared post is shared, never copied. A duplicate
(`classroom_duplicate_item`) carries the post's pacing rows and checkpoints
as they are, through `_classroom_copy_post_extras`.

### Connector

`src/lib/server/connector/registry/calendar.yaml`: reads (`calendar_feed`,
`calendar_feed_for`, `calendar_events_list`, `classroom_item_pacing`) and
ask-first writes (`calendar_event_save`, `calendar_event_move`,
`calendar_event_remove`, `classroom_item_pacing_set`,
`classroom_item_pacing_clear`); no-school days stay
`classroom_no_school_day_set`. The personal link functions are excluded: they
act as whoever calls them.
