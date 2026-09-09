---
title: "Prompt 0110: the tournament surface, the entry model, and a scroll a student could not reach (`claude/tournaments-surface-scroll-yqplco`)"
date: 2026-09-09
branches: [claude/tournaments-surface-scroll-yqplco]
migrations: ["0192"]
subsystems: ["Tournaments", "Testing", "Browser harness"]
---

One migration, `0192`, claimed in the ledger before any work and NOT APPLIED from
this container (it cannot reach production; Mr. Pina applies it). Seven reports
from the 2026-09-09 feedback export, three of them about the same thing seen
from three places: the surface did not use the screen it was on.

**FOR MR. PINA, in order. Nothing below depends on reading further.**

1. **Apply** `supabase/migrations/0192_tournament_entry_members_and_admin_hosts.sql`
   in the SQL editor, after 0189. It re-applies safely (measured: a second apply
   inserts 0 rows and changes no function, grant or publication). Then run the
   verification query under "The migration" below; the expected answer for
   every column is written beside it.
2. **Deploy after the apply.** The four-argument registration call still works
   against the old database and the new one, so the order only matters for
   team registration, the member controls, the rename control and the admin
   console gate, which call functions that exist only after 0192.
3. **One edit outside this bundle's ownership is still owed:**
   `src/lib/server/push.ts` notifies only an entry's registering account, so a
   linked teammate never hears "your next match is set". The exact change is
   under "Outside this bundle's ownership".
4. **The preview checks** are under "The preview".

## The base

Started from `origin/main` at `54bf64f2` (`ledger: 0105 pushed`), which is also what
`origin/integration` pointed at: the branch was cut from the tip and nothing was ahead
on either ref, so the `git fetch --unshallow origin`, `git fetch origin integration`
and identity check the prompt opens with reported a full clone (the remote carried
~70 sibling `claude/**` refs, all fetched), `integration` present, and `Claude
<noreply@anthropic.com>` already set. `node tools/migration-claims.mjs` showed 0190 and
0191 held by lanes in flight and 0192 named by nothing, so the ledger entry claiming it
was the first commit, pushed alone, before any file was read for the work.

Baseline measured before anything changed: `svelte-check` 0 errors / 37 warnings
(31 `state_referenced_locally`, 5 `css_unused_selector`, 1 `perf_avoid_nested_class`),
`npm run verify:counts -- --check` agreeing with the tree, and the nine existing
tournament test files at 139 of 139 in 5.3s. Every figure below is against that.

**`origin/main` moved 50 commits while this ran** (prompts 0104 through 0114,
`main` at `999e0612` by the end) and was merged into the branch here, never on
`main`. Nothing on it touched a file this bundle owns; the one conflict was
the README's static counts block, hunk by hunk, resolved by regenerating the
block from the merged tree (155 specs, 67 routes, 95 `/dev` pages, 310 runs;
`npm run verify:counts -- --check` agrees). svelte-check on the merged tree is
the same 0 errors / 37 warnings with the same breakdown; `0192` is still the
only claim on its number after the merge (`node tools/migration-claims.mjs`).

## What was asked, and what the tree said

Prompts 0077 and 0091 were read first, as the ledger said to, and about half of what a
reader might expect to build was already there: the room's page-scale chrome, the
event rail, the up-next block, the host's match control on the 44px floor, the
projector's sizes and its exit control. What was NOT there, item by item:

1. **The scroll.** `TvStage`'s register state showed `entryRows.slice(0, 6)` and a
   "+N more" line, and its shell is `position: fixed; overflow: hidden` with the body a
   `min-height: 0` flex child that nothing let scroll. On a projector that is six of
   twenty-two teams, forever; on a phone that opened the `/tv` link it is the same six
   with everything under them clipped in silence. The comment at line 759 that the
   prompt cites is 0091's own note that a horizontal-scroll check reads 0px on a
   clipping container, which is exactly the shape here in the other axis.
2. **The width.** `fullscreen.ts` is 0091's module: the text-entry guard for the
   projector's F key, the modifier check, `fullscreenActive`, `toggleFullscreen` and
   the exit control's idle constant. The bracket page did not call it, and did not
   need to for the width: the event page capped itself at `72rem` (1152px) in its own
   style block and `BracketView`'s round columns carried `min-width: 13.5rem` with no
   `flex-grow`, so at 2844px a 16-entry losers bracket (six columns, 1296px) scrolled
   sideways inside a 1152px column with 1700px of plate empty either side. That is
   "cut off and squished" as measured. The list page sat at `60rem`, the host console
   and the two detail routes at their own literals -- five hardcoded page widths in one
   subsystem, which `IDEA_INTERFACE_STANDARDS` 1 names as a defect in as many words.
3. **The list.** One vertical column of identical cards at 60rem, a status chip whose
   only difference between "open" and "seeding" was a word in the same ink, no lane
   grouping, nothing on the page that said which event was running or who was playing.
4. **The rest of the pages** were on the room's chrome since 0077 but each carried its
   own measure, and none used the horizontal axis above 1024px.
5. **Admin.** `_tournament_require_host` (0062) admitted a `tournament_hosts` row and
   nothing else, and every host RPC from 0062 to 0065 goes through it; `tournament_delete`
   alone admitted `is_teacher()` (which 0067 made `is_admin()`); the host console's load
   redirected a non-host away before an admin could reach it; `tournament_set_entry_style`
   read the hosts table directly for the walk-up case. So an admin could delete any
   tournament and manage none.
6. **Rename.** No RPC of any kind changed an entry's name after registration, for
   anyone, in any state.
7. **Teams.** One `user_id` per entry, `display_name` free text, the reward ledger's
   `user_id` copied from the entry, so a team registered as "Azad + Diego" paid one
   account and named nobody.

## The design direction for the list page, and what was rejected

The room's own rules were the constraint, not a palette to invent: `tournaments-theme.css`
is emerald and gold on a flat dark plate, at most ONE dominant emerald element per screen,
gold for placement and rank only, crimson for live/error status only, and the room
aliases the portal's vocabulary rather than redeclaring it. `src/lib/design-system/` is
the machined-metal system (bevels, brushed textures, blueprint grids, Rajdhani / Share
Tech Mono / Chakra Petch) and its own `themes/index.css` says a theme may not repaint an
identity colour or a semantic one, which is the same rule 0077 wrote for the room.

**Chosen: an arena board, grouped by what a person can DO, with the running event as a
marquee.** `boardLane(status)` in `live.ts` maps the five statuses onto four lanes --
live, open for entry, coming up, finished -- and `TournamentBoard.svelte` renders them in
that order, skipping an empty lane rather than labelling nothing. The first live
tournament is the marquee: a `--tnm-panel-2` panel with the name at display size, the
LIVE chip (the page's one emerald element, with the existing pulse), the event rail
filling in, the pair playing now as two of the entries' own banners, and two actions,
Watch and TV mode. Open tournaments are cards with the entry count, the team size when it
is more than one, a Register action for a signed-in viewer and "Sign in to enter" for a
signed-out one -- and a Watch link on every card regardless, because a spectator with no
account is who the surface is for. Finished tournaments carry the champion in gold and a
Results link. Every chip is a GLYPH plus a WORD (the pulsing dot and "Live", a `+` and
"Open", a laurel and "Final"), so colour is never the only signal, and on desktop the
lane cards sit in an `auto-fit` grid under the `--measure-split` measure, so the page
uses the horizontal axis it was given.

Rejected, and why:

- **A fixture board** (a mono table: name, status, entries, champion, one row per
  tournament, the departures-board look). It reads as event-like at a glance and it is
  the cheapest to build. It was rejected because it is the same complaint in a different
  typeface -- a table of rows IS a settings page -- it collapses to nothing at 375px
  without a second layout, and it gives the running event no more room than a draft.
- **A poster grid** (every tournament a tall card tiled with its entries' banners, the
  students' own art doing the work). Rejected because per-entry palettes are the
  students' own and are never constrained by the room's tokens (0064's rule), so a page
  built from them cannot keep the one-emerald rule or any contrast promise, and it
  spends the vertical axis on decoration a list does not need.
- **Bevels and brushed textures from the design system** on the marquee. The room is
  flat by its own declaration (`.card { box-shadow: none }`, panels with hairlines), and
  a room that "aliases, it does not redeclare" does not import a second surface
  language for one panel. The design system's spacing, radius vocabulary and measure
  tokens are what the board reads; its texture layer stays on the portal home.
- **A second dominant emerald** for a second live tournament. Two live events at once is
  the exception; the marquee's chip is the dominant one and any further live card in
  the lane repeats the same chip for the same meaning, which the component says in its
  own comment rather than pretending the case cannot arise.

## The migration, and the decisions inside it

`0192_tournament_entry_members_and_admin_hosts.sql`, one file, re-appliable, applied
by hand after 0189. It does five things, each of which is a rule rather than a feature:

- **An admin is a host everywhere, by one edit.** `_tournament_require_host` admits
  `public.is_admin()` beside the hosts row, and because every host RPC from 0062 through
  0065 calls it, that one body re-gates the whole console at once -- the same mechanism
  the `is_teacher()` trap describes, used on purpose and written down. `tournament_delete`
  drops its `is_teacher()` call for `is_admin()` (CLAUDE.md: never a new call to
  `is_teacher()`), and `tournament_set_entry_style`'s walk-up branch admits an admin too.
  `_tournament_can_manage(uuid)` is the boolean form for the functions that need a
  predicate rather than a raise. The host console's load admits a hosts row OR `isAdmin`
  and says on the page that the viewer is managing as an admin and is not a host.
- **"Not started" is `status not in ('live', 'complete')`, one rule, no host
  carve-out.** The bracket is what starts an event and `tournament_generate_bracket` is
  what stamps `live`; qualifying pools run during `seeding` and a name change there is
  harmless. A host or an admin renaming an entry mid-bracket was considered and refused
  in the same sentence, because the bracket, the projector, the event rail and the ledger
  all carry the name a room has been reading for an hour, and a rule with a carve-out is
  two rules. `entriesLocked(status)` in `tournaments.ts` is the client's one spelling of
  it, and the team panel says "Entry names lock once the bracket is generated" in the
  place the control used to be.
- **Members are a table, every entry has at least one, and the captain is a member.**
  `tournament_entry_members` (chosen name, optional linked account, public read like
  every tournament table, zero client writes, realtime-published) holds EVERY registrant
  including the registering account, backfilled from every existing entry so no read
  has a legacy branch. `tournament_entries.user_id` stays as the captain (and keeps
  0062's one-entry-per-account rule); the members table extends that rule to teammates
  with its own partial unique index. A teammate joins in one of three ways, all
  server-gated: the captain types names at registration (the WIDE `tournament_register_entry`,
  six arguments, no defaults; the 0062 four-argument form stays verbatim as a thin
  wrapper, which is CLAUDE.md's signature-trap exception and what makes the apply order
  and the deploy order independent), a signed-in teammate presses Join on an entry with
  room while registration is open, or the captain, a host or an admin adds a teammate by
  chosen name with an optional account email that is resolved inside the definer function
  and never returned. `team_size` (1..6) is a config key like the others, locked with
  the config once the bracket exists.
- **Rewards pay every registrant, and the ledger is the mechanism.** `_tournament_award`
  is the one insert both hooks (match win, placements) call, and it now writes one row
  per member, each carrying the full amount, that member's `user_id` and a new `member_id`
  column; a row written before 0192 has a null `member_id` and reads exactly as it did.
  The client dedupes an award on `(entry, match, reason)` to show a per-person figure
  with "× N" beside it, so a team of two reads "+10 each" rather than "+20". This was
  judged correct to build inside the bundle rather than left, because the award path is
  one function with two callers and the record is the ledger itself; what is NOT
  touched is the coin economy, which the tournament ledger has never fed (measured:
  no migration under `007x_coin*` reads it), so "pays" means the permanent record and
  nothing more, as it always has.
- **Nothing logs to `tournament_match_events`.** No event type fits a pre-bracket rename
  or a roster change, and widening that CHECK for a name nobody has read yet is not
  worth a second event vocabulary.

Undoing it is stated in the file's header: drop the new functions, the ledger column and
the members table, and restore the seven re-declared functions from 0062, 0063, 0064
and 0068 by number.

Three things the migration says that the plan above did not, all found by the
review round and decided here rather than left:

- **Adding a teammate BY ACCOUNT EMAIL is for hosts and admins only.** The first
  draft let any registrant type any account's email and bind it to their entry;
  the bound account was then refused its own registration until it found the
  row and left, with nothing telling it. So `tournament_add_entry_member`
  refuses a non-manager's email with 'Only a tournament host or a site admin
  can add a teammate by account. Teammates with an account can join the entry
  themselves.' A captain adds UNLINKED teammates by name; a teammate with an
  account presses Join (`tournament_join_entry`), which is the consent path.
  `EntryTeamPanel` takes `manager` and offers the email field only when it is
  true; the host console mounts it that way, the event page never does.
- **The two remove refusals name who can act.** 'An entry needs at least one
  registrant. A host or a site admin can remove the entry instead.' and 'The
  registering account stays on the entry. A host or a site admin can remove
  the entry to withdraw it.' The first draft said "remove the entry instead"
  to a student who cannot (0062's `tournament_remove_entry` is host-only). A
  captain-callable withdraw is its own bundle.
- **`tournament_update` keeps a stored `team_size` when the config it is sent
  has no such key**, the one place 0062's whole-object replacement is softened.
  A client resending `best_of` alone must not silently shrink a team event, and
  the largest-roster floor would otherwise have refused that very call naming
  a number nobody typed. `_tournament_team_size(jsonb)` is the single reading
  of the key (1 for every config written before this file). The entry-side
  RPCs also re-read the entry AFTER taking the tournament lock, so a host
  removing an entry in the same instant as a rename is 'Entry not found.'
  rather than a silent zero-row success.

The tests' chain needed `0004_gauntlet.sql`, which the plan omitted: 0062's
`tournaments_touch_updated_at` trigger names `touch_updated_at()`, which 0004
defines, so the stated chain fails at 0062 without it. Both files carry it.

## What was built, by surface

**`src/lib/tournaments/`.** `tournaments.ts` gains the member type,
`team_size` on the config (`parseConfig` clamps to 1..6), `memberMap`,
`memberNames`, `entryIsFull`, `myEntryFor` (membership first, then the captain
column, the ONE spelling of "my entry"; a source sweep in
`tests/tournament-members.test.ts` refuses a route computing it any other way),
`entriesLocked`, and the award arithmetic: `rewardAwards` folds ledger rows on
`entry|match|reason` into one award with a `recipients` count, and
`rewardTotals` / `entryLedgerRun` read awards, so a team of two shows "+10 each
× 2" rather than "+20". `live.ts` gains `rosterWindow` (the projector's paging
arithmetic, 8 per page), `boardLane` / `boardLanes` / the lane labels.
`TvStage` scrolls its body, pages its roster with a keyboard path (ArrowRight /
PageDown and back, standing down for text entry like the F key), names the
registrants under the pair on the floor, and still renders no control but the
exit. `BracketView`'s round columns grow into the width they are given.
`EntryBanner` takes `members` and draws them under the name when the roster
says more than the name does. `RewardsPanel`, `EntryDetail` (a Registrants
block) and `MatchDetail` read the new shapes. Three new components:
`TournamentBoard` (the list page's whole screen), `RegisterEntry` (the
registration form: team name, roster name, teammates, description, picture)
and `EntryTeamPanel` (rename, roster, add, remove, leave, with the lock
sentence where the control used to be). `tournaments-theme.css` gains the page
measures (`.tnm-page` on `--measure-page`, `.wide` on `--measure-split`,
`.console` on `--measure-console`, `.tnm-prose` on `--measure-reading`), the
chip glyph, the action row with its 44px floor, the desktop two-column
`.tnm-two`, and the bracket's `:fullscreen` plate. `DeleteTournament`'s
compact trigger, Cancel and confirm took the 44px floor in the component (the
trigger measured 18.8px, under even the 24px floor, on every mount since 0066).

**`src/routes/tournaments/`.** The list load fetches whole entry rows and the
live tournaments' bracket rows and styles; the page mounts the board under the
masthead with the two transports and subscribes to the tournaments and bracket
tables so the marquee follows the floor. The event page is `tnm-page console`
(the window, less the gutter), keeps its prose at the reading measure, puts Now
playing beside Up next and rewards beside entries on desktop, wraps the
bracket in a stage with a Full screen / Exit full screen control (the second
caller of `fullscreen.ts`; the first is the projector's F key), registers
through `RegisterEntry` with the six-argument RPC on a team event and the
four-argument one otherwise, mounts `EntryTeamPanel` for the viewer's own
entry, offers Join on entries with room while registration is open, and shows
`Host console` to a host and `Manage (admin)` to an admin who is not one. An
invitee's roster names are landed after the accept, and a failure there is
reported as names that did not land rather than as a failed registration,
because the entry stands. The host console admits a hosts row OR `isAdmin`,
says so on the page when it is the admin, lists each entry's registrants with
a rename control (pre-bracket) and a team toggle (team events), and counts the
delete warning's payouts as distinct awards rather than ledger rows. The
projector, entry and match routes load and subscribe to the members table. The
new-tournament form gains "Registrants per entry" (Solo, or teams of up to N)
and its inputs took the 44px floor (34.4 and 35.4px before). `/api/tournament-push`'s
ping sends to every linked member.

**`src/routes/dev/tournaments/`.** The sim carries members and a team size,
mirrors every 0192 rule with its exact sentences (window, capacity, the
manager-only email add, the last-member and captain refusals, the lock), and
pays one ledger row per member. Views: `?view=list` with `signedin`, `admin`
and `hosted` flags over five tournaments (one live, one open, one seeding, two
finished with a paid ledger), `?view=register&team=N`, `?view=team&state=…`
with `viewer=host` and `team=3`, `?view=tv&status=registration_open&field=22`,
and `?view=page` with the fullscreen control and the roster lines.

**`tools/browser-verify/routes/`.** Nine tournament specs added and one
updated: the three board states, the 22-entry roster, the two team states plus
the captain-with-room and host variants, the team registration form, and the
16-entry page with the width probe. The README's static counts region moved
from 142 specs / 284 runs to 151 / 302 (`npm run verify:counts -- --check`
agrees with the tree).

## Measured

Every browser figure is from `/dev/tournaments` in the harness Chromium with
web fonts blocked (fallback stack) and `prefers-reduced-motion` at
`no-preference` except inside the motion check.

**The scroll (item 1).** Register state, 22 entries, `.tv-body`:

| viewport | clientHeight | scrollHeight | scrolls |
| --- | --- | --- | --- |
| 375x667 (phone) | 579 | 1144 | yes, 565px past the frame, the last banner inside the frame after scrolling |
| 375x900 (harness) | 800 | 1164 | yes |
| 1440x900 | 768 | 777 | yes, 9px |
| 1920x1080 | 921 | 921 | fits |
| 2844x1450 | 1272 | 1272 | fits, six roster columns |

Computed `overflow-y: auto`, `overscroll-behavior: contain`, document
horizontal overflow 0 at every width, 0 controls in the stage. Before the
change the same state at 375x667 clipped everything below the fold and showed
six of the twenty-two names. Paging: 8 banners per page, "Showing 1 to 8 of 22
· page 1 of 3", ArrowRight to "9 to 16 … page 2 of 3" in 125ms, PageDown to
"17 to 22 … page 3 of 3" (6 banners), wrap in both directions, the auto-page
interval created once (a mutation reverting the effect to read the paged
window made it 5 `setInterval` calls across 3 ticks against 2).

**The width (item 2).** Event page, 16 entries, one match live:

| viewport | `main` | bracket `.rounds` | of the page |
| --- | --- | --- | --- |
| 375 | 375 (content 337) | 1384 inside its own scroll container | document overflow 0 |
| 1440 | 1440 (content 1402) | 1402 | 100% |
| 1920 | 1920 (1882) | 1882 | 100% |
| 2844x1450 | 2844 = 100% of the window | 2806 | 100.0%; the first four round columns 688px each |

Before: `main` capped at 1152px (`72rem`) with the losers bracket scrolling
sideways inside it. The Full screen control measures 139x44 and reads "Full
screen"; a real click puts `document.fullscreenElement` on the stage and the
theme's `:fullscreen` rule applies (24px padding, `overflow: auto`); a second
click exits. The board at 2844 is 1472px wide (the 92rem split measure) with
the finished lane in three columns.

**The board (item 3).** Signed out: marquee 1, `.tnm-status.live` exactly 1
on the whole board and inside the marquee, lanes in DOM order live / open /
upcoming / finished, 5 of 5 Watch or Results links, every chip a word after
its hidden glyph (Final, Live, Open, Seeding), "Sign in to enter" present and
"Register" absent. Signed in: Register present, the invites section above the
lanes. Admin: Manage and a delete control on 5 of 5 cards. Contrast, worst of
each: lane labels 6.86:1, marquee name 12.72, card names 14.1, LIVE chip 5.31
on its wash, Open 14.1, Final 8.03, Seeding 6.1, Champion line 8.03, Watch /
Results 6.32, Manage 12.72, delete trigger 5.5. Tap targets after the fix
round: title links 207.3x44 at 375 and 1272.3x44 at 1440 (24.8px before),
compact delete trigger 114.8x44 (18.8 before), card and marquee actions 45.4,
Manage 45.4. Motion: the marquee's live rail cell animates under
no-preference and is still under reduce; the chip's `::before` pulse is probed
running through `getAnimations({ subtree: true })`.

**The projector's live pair** names the registrants ("Azad · Diego") under the
team's name at 1 line; the host console's next-up banner carries the same
line.

**The forms.** Team registration: 1 teammate input at team size 2, "Team name"
and never "Entry name", submit disabled until a name is typed, every field 44
at its label. Team panel: rename control 1 and the lock sentence 0 before the
bracket, 0 and 1 after; the email field present for the host's mount and
absent for the captain's with the join sentence in its place; every control
95.5x44 or larger.

**The runs.** Round one, `--route tournaments` at 375 and 1440: 32 runs, 866
measurements, 10 outside threshold, all of them the two 44px findings above.
The two projector specs and the 16-entry page at 1920: 5 runs, 95
measurements, 0 outside. After the fix round, the board, team, roster and
registration specs at both widths: 18 runs, 658 measurements, 0 outside,
42.6s. Pages rendered in 814 to 1271ms (the 16-entry page 2214ms at 1920).

## Tests, and the controls that prove they bite

**`tests/db/tournament-admin-manage.test.ts` (37) and
`tests/db/tournament-entry-members.test.ts` (56)**, 93 in 4.7s over eight
databases on the shared cluster, every one applying 0001, 0003, 0004, 0020,
0062, 0063, the realtime publication, then 0064 through 0068, 0137 and 0192
verbatim off disk, every row seeded through the real RPCs. What they pin:

- A student who is neither admin nor host is refused by seven RPCs
  (`tournament_update`, `_set_status`, `_host_add_entry`, `_set_reward_rules`,
  `_update_entry` on another's entry, `_add_entry_member`, `_delete`) by
  message; a `@boscotech.edu` teacher on no roster is refused identically (the
  0067 lesson: the domain is not staff); an admin holding NO hosts row
  succeeds at all seven, delete last with the typed name; a second host
  succeeds; anon cannot execute any of the 13 public signatures and
  `authenticated` can, read off `has_function_privilege`.
- The rename lock: the owner and a teammate rename during `registration_open`
  and `seeding`; after `tournament_generate_bracket` the owner, a teammate, a
  host and an admin are all refused with the lock sentence.
- Registration: the narrow form writes one member named as the entry; the
  wide form writes the captain and the unlinked teammates in order; one over
  `team_size` refuses; Join fills the last seat and two accounts racing for it
  serialise on the tournament lock (5 of 5 iterations left exactly 2 members
  and the loser read "full"); an account already on any entry is refused
  everywhere; an invite accepted by an account already on a roster is a
  no-op accept rather than a raw unique-index error; add by email resolves a
  profile case- and whitespace-insensitively for a host and an admin and is
  refused for a captain and a teammate with the exact sentence; remove refuses
  the last member and the captain's row while teammates remain.
- Backfill against PRE-migration data: two entries registered through the
  0062 RPCs (one linked, one host walk-up), 0192 applied over them, both carry
  exactly one member with the right account, name and stamps; applied a second
  time, "backfilled 0", and a snapshot of every tournament function's
  signature, defaults, ACL and body hash, the member rows and the publication
  tables is deep-equal before and after.
- Rewards: a team of two winning a contested match writes two rows of the
  full amount with each member's account and row; an unlinked teammate's row
  carries a null account and its member id; placements settle once, per
  member; a forfeit pays nothing; the delete refusal reports the summed coins
  (130 to 2 entries in one fixture, 20 to 1 in another).
- Entry styles: a linked teammate may restyle; a host may not restyle a linked
  entry; a host and an admin may restyle an unlinked walk-up; an unlinked
  entry that gains a linked teammate stops being host-restyleable.
- `tournament_ping_entry` returns every linked member's account.

Four positive controls, each a string-replaced copy of 0192 applied in its own
database (no file on disk is mutated, and each replacement asserts it hit
exactly one site): the admin clause removed from `_tournament_require_host`
reddens exactly the four admin cases that route through it (the other three
read `is_admin()` or `_tournament_can_manage` directly, which is why the
control opens one gate and not all seven); the per-member award loop replaced
by 0063's single insert pays the team 1 row instead of 2; `and not v_manage`
struck from the email branch lets the captain's by-email add land; the
`team_size` fold-in disabled makes a keyless config write 1 over a stored 3.

**Node and dom** (`tests/tournament-members.test.ts` 23,
`tests/dom/tournament-board-mount.test.ts` 15,
`tests/dom/tournament-team-panel-mount.test.ts` 16,
`tests/dom/tournament-tv-roster-mount.test.ts` 7, and the five pre-existing
tournament files): 127 tests in 9 files. The board test asserts both
directions on every gate (Watch links = tournaments for a signed-out viewer;
"Register" 0 signed out and 1 signed in; delete controls 0 with no transport,
5 for an admin with it, 1 for a host of one); the panel test pins the email
field present with `manager` and absent without, and two mutations (`{#if
manager}` to `{#if true}`, `{#if !manager}` to `{#if false}`) each redden
exactly that test, restored from a `cp` copy and md5-checked.

**The full suite**, serialised through `npm test`, first run at 12:40-12:45
UTC on 2026-09-09: 333 files, 6,679 tests, 4 failed in 2 files, 290s. The two
in `tests/derived-numbers.test.ts` are the README's measured region not yet
knowing the nine new specs, which by rule is regenerated only on a committed
tree (see the follow-up below); the two in `tests/grant-surface.test.ts` were
the roster table undeclared in the anon registry, declared now. The re-run
after both is under "The follow-up".

## The follow-up: the README's measured region, and the suite on the merged tree

`npm run verify:readme` ran once, on the committed merged tree at `c50a322`
(the working tree carried this entry uncommitted, which the block records as
"dirty at measurement"; a document cannot move a measurement): **310
route/width runs, 5,180 measurements, 2 outside threshold, 745.3s**, the
selftest's 70 controls (36 negative, 34 positive) with 0 failures, and
`covered` 155 of the static region's 155, so every tournament spec is in the
measured half for the first time. The two outside rows are the notebook
toolbar's text controls at 375 and 1440, decision 12's standing finding with
its owner, the same two rows the previous block carried; nothing from this
bundle is outside threshold in a full run.

The full suite on the same tree, after that regeneration, serialised through
`npm test` at 13:01-13:06 UTC: **341 files, 6,730 tests, 0 failed, 302s.**
The four first-run failures are gone for the two reasons above, and the eight
files main brought in run green beside this bundle's.

## Not verified

- **Production.** Nothing here reached the live project: the migration is not
  applied, no RPC was called against it, and whether Realtime carries
  `tournament_entry_members` there is answered only by the guard in the file.
  The verification query is what says the apply landed.
- **The real routes.** Every browser figure is the identical component mounted
  by `/dev/tournaments`; the signed-in states (register, join, rename, the host
  console, the admin console, the invite roster path) were rendered server-side
  with fixtures (0 of every control absent, 1 of every control present, both
  directions counted) and never driven against a database, because there is no
  session and no local stack in this container.
- **PostgREST's overload resolution** between the four-key and six-key
  register calls is argued from `pronargdefaults` and measured at the Postgres
  level (the narrow wrapper calling the wide form); a real PostgREST call in
  both shapes was not run.
- **Escape** leaving the bracket's fullscreen, and the roster's 7-second auto
  rotation: only the control's exit path and the keyboard paging were driven.
- **Touch and wheel** scrolling of the projector body: the probe set
  `scrollTop` programmatically and read that it landed.
- **`prefers-reduced-motion`** on the chip's own `::before` pulse: the rail
  cell in the same stylesheet is the measured gate.
- **Web-font metrics**: every pixel figure is in the fallback stack.

## Outside this bundle's ownership

- **`src/lib/server/push.ts`, `sweepPairNotifications`** still pushes
  `entries.user_id` only. Add a third read to its `Promise.all`:
  `admin.from('tournament_entry_members').select('entry_id, user_id').eq('tournament_id', tournamentId).not('user_id', 'is', null)`,
  fold it into a `Map<entryId, userId[]>`, and replace the one line
  `const linked = [a.user_id, b.user_id].filter(...)` with the union of both
  entries' member accounts and the two captain columns, deduplicated. The
  captain fallback keeps a pre-0192 deployment behaving exactly as today.
- **`tests/upload-limits.test.ts:665`** pinned the `Upload failed` sentence at
  `routes/tournaments/[id]/+page.svelte:195`; the page grew above it and the
  sentence is at line 392, so the pin was moved -- the one edit outside the
  ownership list, exactly as 0077 moved the same pin. A prefix match on the
  file would survive the next edit above it; changing the assertion's shape
  was left to that file's owner.
- **`tests/grant-surface.test.ts`** is the declared registry of everything
  `anon` may reach, and it reddened on the roster table exactly as its own
  message says it should: "add it to ANON_SURFACE with the reason somebody
  decided it." `tournament_entry_members` is now the thirteenth tournament
  table there, under the tournament reason extended with 0192's own (chosen
  names, revoke then grant, the session-blind projector reads it), and the
  pin moved from 19 to 20. The second and last edit outside the ownership
  list; a public-read table cannot land without it.
- **`classroom-updates.json`** was not appended: tournaments is not a
  classroom surface and the file is outside this bundle.
- A captain-callable withdraw (`tournament_remove_entry` is host-only) is a
  widening of a 0062 gate with its own answer for a seeded pool, and is its
  own bundle.

## The preview

The branch deploys to Vercel's git preview for
`claude/tournaments-surface-scroll-yqplco`; the URL is on the deployment's
page under the project (the host is `idea-app-git-claude-tournaments-surface-scroll-yqplco-<team>.vercel.app`,
where the team segment is Vercel's). It runs against production data, so the
checks below are read-only until the migration is applied and are the
signed-in ones after it.

1. `/tournaments` signed out: the running event (if any) at the top with Watch
   and TV mode, "Sign in to enter" on an open one, and no Register, Manage or
   delete control anywhere. Signed in as Mr. Pina (an admin): Manage on every
   card.
2. `/tournaments/<id>` on the 2844x1450 screen: the bracket spans the window
   with no sideways scroll at 16 entries; the Full screen control fills the
   screen with the bracket and Escape or the control brings it back.
3. `/tournaments/<id>/tv` on a phone with registration open: the roster
   scrolls and the pages turn; on the projector, ArrowRight turns the page.
4. After 0192: `/tournaments/<id>/host` as the admin on a tournament he does
   not host shows the admin notice and every control; a student's rename
   works before the bracket and reads the lock sentence after; a team event
   (create one with "Teams of up to 2") lets a second account Join an entry
   with room and refuses a full one; the payout history shows "× 2" beside a
   team's award.
