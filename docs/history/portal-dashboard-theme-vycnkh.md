---
title: "Prompt 0117: six portal-shell reports -- apps above classes for students, one full-width admin console ordered by use, the profile panel on the design system, and the Matrix rain reaching into three rooms (`claude/portal-dashboard-theme-vycnkh`, no migration)"
date: 2026-09-10
branches: [claude/portal-dashboard-theme-vycnkh]
migrations: []
subsystems: ["Portal shell", "Admin console", "Profile", "Site theme", "Browser harness"]
---

Six reports from Mr. Pina, numbered 21 to 26 as issued, on the portal shell.
Five were built; one (22) belongs to a file another lane owns and is handed on
with the diagnosis. No migration, `Claims: none`.

## The opening, and what the prompt claimed that the tree disagreed with

`git fetch --unshallow` (the clone WAS shallow: `is-shallow-repository`
answered true before, false after), `git fetch origin integration`, identity
`Claude <noreply@anthropic.com>` already set. `origin/main` and
`origin/integration` were both at `b03a941` at branch time.

**The 880px `main` cap did not apply to `/dashboard`.** The prompt said
`app.css` caps any `<main>` at 880px and that this is what would bite; the
dashboard never sat in a `main` at all -- it is a `.legacy-index` div, and the
caps that actually held it were `.legacy-index .courses`, `.hero`, `.divider`
and `.promo-callout`, each `max-width: 1100px` centred. The old `/admin` page
DID sit in `<main class="admin-page">` under the 880px rule. Both are released
the same way the maps viewer releases its own: the new page's own stylesheet,
never `app.css`.

## 21. Students get Apps above Your Classes

`src/routes/+page.svelte` keyed the order on `managesAnySection || !hasClasses`
and carried a paragraph REFUSING this exact report on a measurement: at 375px a
student's class block grows 616px per class, so flipping the order moves the
scroll onto the feed's deep links rather than removing it. The measurement is
still true and is kept in the comment as the COST; Mr. Pina asked a second time
with it known, and the order is now `isStudent || managesAnySection ||
!hasClasses`, where `isStudent` is `signedIn && profile.role === 'student'`.
Staff ordering is unchanged. The key is the ROLE and not "does not manage",
because a `visitor` is neither; the test file gained a `visitor-with-class`
viewer as the positive control for that, and the CLAUDE.md paragraph that said
the order "never" turns on role was corrected in place (the checkable half of
that file passes `tools/claude-md-check.mjs`).

Measured on `/dev/home-order?role=student&classes=1&rows=3`: `.launcher`
precedes `[data-tour="classes"]` at 375 and 1440; the teacher spec beside it
still puts Apps first for a manager and the empty-feed spec still puts Apps
first for nobody's student.

## 22. A collapsed class opens in one click -- DIAGNOSED, NOT CHANGED

Measured on the same harness at 375: one click collapses (aria-expanded
true->false, `.assignment-list` 330px -> 16px) and one click expands. The two
clicks Mr. Pina counts are expand THEN "Open class": the collapsed header
carries **0 anchors**, and the only link to the class sits inside the list the
collapse hides (max-height 0, opacity 0). The fix is in
`src/lib/classroom/ClassroomFeed.svelte`, which ledger 0118 owns: make the
course title in the header a link to `${basePath}/${section.id}` (or lift
`.feed-more` into the header row) so a collapsed card opens in one click. This
bundle changed nothing there.

## 23. The profile panel, restyled onto the design system

The customization surface is not a page; it is the popover in
`src/lib/ProfileMenu.svelte`, mounted in 69 headers. What was dated, measured
on `/dev/profile-menu` before the change: neon literal fallbacks (`#00ff41`,
`#00f0ff`, `#050f07`) from before the token layer; Edit, Upload image and Use
Google photo as ~15px underlined mono words; eight presets 8-across at ~32px
named only by a `title`; Save/Cancel and Dashboard/Sign out at ~30px. Every
one a student-facing control under the 44px floor.

**Chosen:** keep the anchored popover and make it the same object a home card
is -- `--bg1` on `--boundary` with `--bevel-raised`, `--radius-card`, type from
the tokens, ONE 44px control class (`.pm-btn`) with a word on every action,
presets four across with their names under them and `aria-pressed`, tokens
only. **Rejected:** a `/profile` page (the theme control's safety rests on the
theme being on exactly where THIS menu is reachable, and a page is a second
write surface for the same four fields); a modal (heavier than a name edit
needs, and the pointerdown outside-dismiss is the popover's contract); a light
paper plate (this is the shell's component, not a room's).

Measured with the panel open, `/dev/profile-menu?state=open` (the param is
only the spec's filename; the panel is opened by pressing the real trigger):

| | 375 | 1440 |
| --- | --- | --- |
| panel box | 343x669 at x=8 | 352x669 at x=684 |
| Save name / Cancel / Upload / Use Google photo, smallest | 99.9x44 | 99.9x44 |
| name field | 253x66.7 | 262x66.7 |
| eight presets, smallest | 71.3x60.2 | 73.5x60.2 |
| theme radios | 309x47.8 | 318x47.8 |
| Sign out | 94.6x44 | 94.6x44 |
| preset word on the selected tint | 5.34:1 | 5.34:1 |
| control words | 6:1 | 6:1 |
| theme notes on the tint | 4.91:1 | 4.91:1 |

**The panel went 12px off the left edge at 375 the first time** (343px wide,
`right: 0` against a trigger whose header leaves 44px of padding). It reads its
own box once on open and shifts by exactly the overrun (`--pm-shift`); x=8 on
the second run. The trigger's 34px painted box and its `.tap-reach-44` are
untouched and `tests/profile-menu-tap-reach.test.ts` still pins them.

## 24 and 26. One admin console, the whole window, ordered by use

`src/lib/portal-apps.ts` carried a paragraph arguing the two admin cards were
"two rooms with a path between them" and fixed a tagline instead. Asked again
in the same words, they are one room. `/admin`'s four cards (the roster, the
coin links, the short links, the Drive connection) are PANELS on `/dashboard`
beside the review queues, the feedback queue and the pathway roster -- nine
panels, registry in `src/routes/dashboard/console.ts`, the roster extracted to
`src/routes/dashboard/AdminRoster.svelte`. `/admin/+page.svelte` is deleted;
`/admin/+page.server.ts` keeps the 404 for anyone who is not an admin and
sends an admin on to `/dashboard#panel-admins` (measured on a throwaway dev
route that a server load with no page component answers its 303).
`/admin/links` and `/admin/drive-connect` keep their paths as pages of the
same app. The launcher card keeps the id `dashboard` (it is the key an
admin's pin, order and usage are stored under) and drops `admin`;
`AdminMark.svelte` in `$lib/marks` is now drawn by nothing and is left where
it is (not this bundle's file). `src/routes/coin-desk/+layout.svelte` still
links "Site Admins" to `/admin`, which now forwards; not this bundle's file.

**"Sort by most used" is the admin's own record.** Nothing loads a tally, and
a school-wide count would answer which panel the SCHOOL uses. A use is noted
on the first pointerdown or focus inside a panel per page load, persisted
into `profiles.preferences.dashboard` (spread-merged beside `homepage`,
validated on read: an unknown sort or a malformed usage entry is DROPPED),
and ranked on the next load by `rankByUse`, extracted from the launcher's
`sortApps` so there is one spelling of "count descending, ties in curated
order". The order is seeded once at construction, deliberately not in an
effect: every `invalidateAll()` after an approval brings the new record back
through `data.userProfile`, and an effect would reorder the grid under the
pointer that just pressed Approve.

**The window.** `repeat(auto-fit, minmax(min(26rem, 100%), 1fr))` inside a
`clamp(1rem, 2.5vw, 3rem)` gutter; the roster spans two columns above 64rem.
Prose is capped at the sentence (`--measure-reading` on the hero paragraph),
never at the console.

| | 375 | 1440 | 2844 |
| --- | --- | --- | --- |
| grid width / window | 375 / 375 | 1440 / 1440 | 2844 / 2844 |
| columns | 1 | 3 | 6 |
| roster panel | 343 | 904 (span 2) | 900 (span 2) |
| document height | 5453 | 2926 | 1967 |
| scrollWidth | 375 | 1440 | 2844 |

Every control this bundle wrote clears 44px at both widths: nav chips
(224.5x44 smallest at 375), the order select, the roster filter, the pathway
selects, the FRC completion disclosure, every `.btn`, the roster's Remove /
Confirm / Cancel (78.7x44) and Grant admin (309x44). Panel titles, blurbs,
chip counts and roster emails clear 4.5:1; the roster NAME was 4.01:1 in
CSEE's blue through `pathwayColor` and takes `pathwayInk` now (5.28:1 on the
harness's worst case).

**Outstanding, with numbers, handed on:** the FRC review queue's controls are
`$lib/frc` files this bundle does not own and measure under BOTH floors on the
console -- `.frq-link` "Open model" 74.6x18.4, `.frq-btn` Approve / Request
revision 126.9x26.2 and 115.2x26.2, and `FrcUnitOverride`'s `.fuo-unit` rows
29.2px tall. The `portal-admin.mjs` spec keeps the row so the number stays on
every run; the fix belongs to whoever next owns `src/lib/frc/**`.

## 25. The Matrix rain reaches into three rooms

`ThemeRoot` was already correct (the rain is a lazy chunk inside the `matrix`
branch, ledger 0108); the reach was the question. Swept sixteen harness rooms
at 1440 with `data-theme='matrix'` set: `.bg-fx` computed `display: none` on
`/dev/classroom`, `/dev/classroom-reference`, `/dev/spec-table`,
`/dev/notebook`, `/dev/foundry-gallery` and `/dev/foundry-admin`, with an
opaque `.cr-root`, `.nb-root` or `.fg-root` under the centre of each; the
coin desk, the maps viewer, the feedback console, the pathway picker, the
short-link editor and every `.legacy-index` page already showed the layer.

Six theme-keyed rules in `matrix.css`, two per room and one declaration each:
`body:has(<room>) .bg-fx { display: block }` and `<room> { background-color:
transparent }` for `.cr-root`, `.nb-root:not([data-nb-theme])` and `.fg-root`.
The notebook only on its DEFAULT plate: light and IDEA are the room's own
choice. NOT reached: GAUNTLET, GREENLINE, VANGUARD and FRC (named by the
prompt), Tournaments (an emerald room with a one-emerald rule, not a page
with cards on it) and FSP (archived, deliberately not IDEA).
`tests/theme-tokens.test.ts` pins the exception list at nine, each with what
it may declare.

`/dev/themes?room=classroom|notebook|foundry` wraps the page in the room's
real root class with the room's real stylesheet imported, and one spec per
room proves, in order: theme OFF, the room hides the layer (positive control
that the room stylesheet is in the document); theme ON, `.bg-fx` is `block`,
the root computes `rgba(0, 0, 0, 0)`, and the rain canvas is inside the layer,
`data-motion` running, 30+ frames -- at 375 and 1440 for all three. The board
inside a room is a pairing no page makes (`--gear` read 4.49 on the forge's
grounds and 4.43 on the notebook's, both token-on-room pairings that predate
the rain) so the room specs measure the profile panel's copy instead, which
those rooms really mount.

## Verification

- `svelte-check`: 0 errors / 37 warnings, 31 `state_referenced_locally` / 5
  `css_unused_selector` / 1 `perf_avoid_nested_class`, re-derived after the
  sync with the two public env placeholders exported. One deliberate
  capture-once read in the console is `svelte-ignore`d rather than counted.
- Full suite: see the closing commit's message for the file and test counts.
- `npm run verify:browser` with Vite started separately on 5199 (boot 3.0s
  here; the harness reported "reused a server already on
  http://127.0.0.1:5199", server boot 51-395ms): thirteen specs this bundle
  owns or touched, at 375 and 1440, every row inside threshold except the
  FRC queue controls above. Seven specs are new (`portal-admin.mjs`,
  `portal-admin-used-roster-admins.mjs`, `portal-admin-owner-1.mjs`,
  `profile-menu-state-open.mjs`, three `themes-state-matrix-room-*.mjs`);
  the README's static region regenerated to 163 specs / 68 routes / 96 dev
  pages / 326 runs, and its measured region by the full pass on the committed
  tree (recorded in that commit).
- Text is measured in the fallback stack (the harness blocks
  fonts.googleapis.com) and `prefers-reduced-motion` is `no-preference`.

## Not verified

- Nothing was signed into or read from production: the live `profiles`
  write for the console preference, `admin_list`, `isOwner`, and the two
  Drive booleans are exercised only through the harness stub and the
  `vi.doMock`ed `/admin` load in `tests/portal-admin-console.test.ts`.
- The Vercel preview. The checks to run there: sign in as an admin, open
  `/dashboard` at the full window and count the columns (three at 1440, six
  at 2844); press inside a panel, reload, and see it move up; open `/admin`
  and land on the roster panel; sign in as a student and see Apps above
  Your Classes on `/`; switch to Matrix in the profile menu and open a
  classroom page, the notebook on its default plate, and the Foundry.
- The classroom, notebook and Foundry under the theme were measured through
  their root classes and stylesheets on the theme harness, not by mounting a
  classroom page: the rain's content band (1100px) is narrower than the
  classroom's 92rem split, so its outer columns get the film at full gain,
  and what sits there is card, not copy. Worth a look on the preview.
