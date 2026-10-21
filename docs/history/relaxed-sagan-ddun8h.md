---
title: "Feedback round 2026-10-21: stocks relaunch, HTML assignments, small fixes, coins for everyone, live view"
date: 2026-10-21
branches: [claude/relaxed-sagan-ddun8h]
migrations: ["0283", "0284", "0285", "0286"]
subsystems: [Classroom home feed, Class page, Quick posts, Post thumbnails, Tournaments, Feedback console, Profiles, Portal launcher]
---

One session working a numbered list from Mr. Pina, a push to `main` after each
numbered task. This entry grows task by task.

## Task 3, small fixes (no migration in the pushed commit)

- **TO GRADE and due soon (d76087b2).** Ledger 0416 (`ee8aa483`) had already
  stopped a teacher's header counting due-soon work as "need attention". What
  was left was a place for it: `SectionFeed.dueSoon` and `dueSoonSummary` give a
  manager a separate "N due soon" badge beside the to-grade chip, outside
  `actionCount`. The report's Liam Fernandez case (state submitted, a returned
  score) is a resubmission after a return, which `isAwaitingGrade` counts on
  purpose; no data was available here to say otherwise.
- **Notices (7ec59920).** The card header carries the Notice word, its end, the
  link keys and the teacher's Posted / Take down on one wrapping line, and a
  link key is named for the link (`quickPostLinkName`: IDEA Market, Google Doc,
  else the host). The "important" flag (the rest of the report) needs a column and
  an RPC, so it is held back with its migration rather than pushed against a
  database that lacks it.
- **Banners with no picture (0fc73fdd).** The generated banner already set the
  post's kind and title (0416); it now also gets a tinted grid and a stronger
  wash so it reads as designed rather than empty.
- **Blank names (a5fc5e64).** `$lib/tournaments/names.ts` (`hasVisibleText`,
  `cleanName`) replaces `trim()` at every tournament, team, member and walk-up
  name entry. NOT done: the database still refuses only `btrim(x) = ''`, which
  does not catch zero-width or other invisible names sent straight to the RPC.
- **Name order (715c8421).** `$lib/person-name.ts` flips an unambiguous
  "Last, First" and is applied in `displayName`, the market parsers, the stocks
  leaderboard and the coin desk roster label. The leaderboard's own rows all go
  through one parser, so the viewer's row was never formatted differently in
  code; the stored roster name was the source, which the helper now normalises.
- **FRC Training (d3348bf9).** The launcher card is `adminOnly`. The `/frc`
  routes themselves are unchanged and reachable by address.
- **Feedback screenshots (d204cb36).** A click on a report's screenshot opens the
  classroom `Lightbox`, paging through every screenshot in the filtered list; the
  link keeps its address for a picture that will not decode.

## Not verified

No signed-in session or live site from this container, so none of this is
checked on `ideabosco.com`; `svelte-check` held at 0 errors, 33 warnings in 18
files.

## Task 5, live view and the projector (no migration)

- **Presence input (fbe44d35).** `PresenceHeartbeat` now stamps input on pointer
  moves, wheel, touch and scroll as well as keys, so "typed" in a beat means any
  input while the tab is in front. A sandboxed worksheet frame never reaches the
  page's listeners, so two things that do cross count instead: the document's own
  bridge messages (`idea:change`, `idea:image*`) and focus moving into a frame.
  A frame that is open and untouched still goes idle. The database's windows are
  unchanged (no migration).
- **Idle and away.** `LIVE_IDLE_MS` is 150 s (two minutes of silence plus the
  heartbeat's lag, up to 48 s); a row whose page is not visible is `away` at once
  (it read "idle, other tab" for the whole away window). Words: "Active",
  "No activity for N min"; the wall's group reads Idle, not "Not typing".
- **Projector (b0d7e288).** Root cause: full screen was requested on `.lp-stage`,
  inside `.lp-root`, so the plate's ground stayed behind and the browser's black
  backdrop showed under the theme's ink (dark clock on black, light cards).
  `stage` is the root now. Measured in Chromium at 1440x1080, 1920x1080 and
  1280x720 under Space White and IDEA: ground `rgb(223,227,234)` with clock ink
  `rgb(13,19,17)` in fullscreen; the clock is 600x230 at 1440 and 800x306 at 1920
  (it was 529x203). A due time is a row under its title (`splitWallLine`); the fit
  estimate counts it.

## Not verified

No signed-in live session: the live grid against real students, and the frame
focus path in a real worksheet, are unchecked.

## Held for hand-applied migrations (branch `claude/relaxed-sagan-ddun8h`)

- **0283, stocks relaunch (79e16faa, fbe274c3).** Written and tested by a
  separate worktree session; its own record is `worktree-agent-a99d257ab862b767a.md`.
- **0284, HTML assignment title (8812b4ba).** `classroom_html_assignments.show_title`
  and `classroom_html_set_show_title`. An HTML assignment opens with its document
  first (`itemPanelDefaults(layout, workFirst)`), its post title hidden by default
  with a per-post switch for a manager who is an admin (the transport is handed
  only to admins, like uploads), the kind, chips and last-updated on one wrapping
  line, and no description card when the body has no visible character. The
  column is read on its own rung and falls back to "hidden, no switch". A
  duplicated post does not copy the flag, so it starts hidden.
- **0285, important notices (7ec59920).** `classroom_quick_posts.important`, a
  set RPC with take-down's own permission rule, and `classroom_quick_posts(uuid)`
  restated with the key and an important-first order. Switch shown only when the
  read carries the key. Tested against a notice made before the file.
- **0286, coins without a class (18451adf).** One function changes:
  `_coin_economy_enrollments()` adds the CALLER's own row, with no section, when
  the caller is a student or visitor profile, not an admin, with no enrollment.
  Class-scoped uses join on section so a null never matches, and nobody else
  sees the member because the row exists only in their own session. Probed: a
  member could file a class job application with no class, so
  `coin_role_self_apply` is restated asking for a class too. Mutation: dropping
  the own-session filter put members in an enrolled student's send-to
  directory and reddened that test; the file was restored by md5. Known limits:
  a member can send but is not listed for others to send to, and nobody is
  given coins by it.
