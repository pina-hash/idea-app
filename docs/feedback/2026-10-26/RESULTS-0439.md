# Results 0439: the IDEA calendar

Built and on main. Both database changes are applied to production.

- idea-app: `3dfff740` (pacing in manifests), `58203049` (the calendar's database), `fa397554` (the migration tool fix that let it apply), `52cd7fcd` (the calendar itself), `a2857988` (this file).
- Migrations: `supabase/migrations/0308_idea_calendar.sql`, then `supabase/migrations/0309_short_link_reserve_calendar.sql`. Applied by Migrate (records `1b8f9951`, `6575c9d4`).

## What the audit found, and what was reused

- **No calendar, no iCal code, no event table existed.** The school's days were already one module (`$lib/classroom/school-calendar`) and are reused for every date.
- **No-school days** (0303, `classroom_no_school_days`, admin and connector editable) are a calendar layer and the days pacing skips. Not duplicated.
- **Unit 4 sign-offs** (0304, `classroom_signoff_checkpoints`, or a team manifest's `team.checkpoints` before a team opens its plan) and **team plan tasks** (0303) are read where they live, with the team's own sign-off state.
- **Posts** use the classroom's own read rule (`_classroom_item_live`) and **teams** the class's posted draw (`_classroom_section_team_set`).
- **The manifest gate** never read unknown keys, so `pacing` needed no database widening; the client validator learned it as warnings only, proven over all 21 stored documents.
- **The Techmen app already publishes an iCalendar feed** (its `calendar-feed` function, a member link with `scope=all`). Read it; nothing new is needed from frc-app to start.
- **Preferences** use the site's one preferences path (a new `calendar` namespace), not a table.

## What was built

1. **`/calendar`**: month and list views, the chosen day beside the month, seven layers each on by default and switchable (Classes, Pacing, Team, Bosco Tech, No school, IDEA, Robotics), each class switchable, and a phone link.
2. **A calendar per class** at `/classroom/<class>/calendar`.
3. **This week strip** under the My Classes title and under each class's header (that class only), the door to the calendar. Choice named: the calendar is not a class tab, because a teacher's bar already holds six and a seventh overflows a phone.
4. **The Bosco Tech calendar, live**: read from its public address, refreshed within 30 minutes, every repeating event, cancellation and move handled. If the school ever makes it private, its secret address goes in one setting (below).
5. **Robotics**: events a site admin adds here, plus the Techmen app's own feed once its address is set (below).
6. **IDEA events**: added, moved and removed by a site admin on the calendar or by voice.
7. **Phone subscription**: a private link per person, made, replaced or turned off by them, showing their own layers and classes. A wrong or old link shows nothing.
8. **Day-by-day pacing**: an HTML assignment's manifest may declare `pacing` (spec section 17): a school day of the assignment (`day: 3`) or a fixed date. It shows on the calendar, above the assignment (done, today, behind, next) and inside the document on `idea:state`; a site admin can move, rename, hide or add a step without a re-upload.
9. **The post's due date reaches the document** (d0041188): `schedule.due` on `idea:state`. Documents built on the kit fill `data-idea-due` and `data-idea-schedule` themselves.
10. **Connector**: what's on my calendar, what's on a student's calendar, list, add, move and remove events, read and change an assignment's pacing. No-school days were already there.

## Measured

- Calendar privacy test, real database, 10 tests, both directions. Opening the enrollment rule turned 4 red, the team rule 8 red, the posted-yet rule 2 red; the file was restored byte for byte and is green.
- 21 of 21 stored HTML assignments validate exactly as before with pacing added and with pacing broken.
- Browser, 375 and 1440: 126 measurements, 0 outside threshold, no sideways scroll, every key 44px or more.
- Type check: 0 errors, 33 warnings in 18 files (the baseline).
- Full suite: in the history entry.

## Not verified

The live site, a real phone subscribing, a real Techmen token, and the production database itself (this container cannot reach it).

## Out of the bundle's Owns, and why

- `tools/apply-migration.mjs` (+ its test): Migrate refused 0308 because two ledger entries are numbered 0439. Without the fix no migration of this bundle could apply.
- `tools/hx-kit/kit/kit.js`, `kit.css`, `starter.html` (rebuilt): so kit-built documents draw the due date and plan.
- `src/hooks.server.ts`, `src/lib/shell/site-plate.ts`, `src/lib/site-manifest.ts`, `src/lib/short-links.ts`, `src/lib/classroom/MyClasses.svelte`, `src/routes/classroom/+page.svelte`, the class layout, `ItemDetail.svelte`, `bridge.ts`, `HtmlAssignmentFrame.svelte`: the smallest edits that place the calendar, its strip and the schedule.

## What Mr. Pina does

Nothing is required: the school calendar is public and already read.

Robotics feed (optional, one time):
1. Open the Techmen app, Profile, Calendar subscription.
2. Choose All (not My events), then Copy the https address.
3. In Vercel: idea-app project, Settings, Environment Variables, Add: name `ROBOTICS_CALENDAR_ICS_URL`, value the copied address, Production. Save, then Deployments, Redeploy.
4. Expected: /calendar shows the Techmen events on the Robotics layer within the half hour.

Only if the school calendar goes private: in Google Calendar, the General Calendar's settings, "Secret address in iCal format", copy it into a Vercel variable `BOSCO_CALENDAR_ICS_URL` the same way.

Request for the Techmen app (frc-app): a team-wide read-only calendar feed address that is not tied to one member's token, so the site does not hold Mr. Pina's personal link.
