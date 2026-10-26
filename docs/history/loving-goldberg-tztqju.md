---
title: "Ledger 0436: IDEA209H Unit 4 -- one shared document per team, a team plan and tracker, a sign-off queue, grading by team, a team board, and teams by voice (main, mirrored to `claude/loving-goldberg-tztqju`)"
date: 2026-10-26
branches: [main, claude/loving-goldberg-tztqju]
migrations: ["0301", "0302", "0303", "0304", "0305", "0306", "0307"]
subsystems: [Classroom, HTML assignments, Teams, Grading, Rubrics, Live, Connector, Push, Migrations]
---

Ledger 0436 (solo, pushed straight to `main`, every step mirrored to
`claude/loving-goldberg-tztqju`) built IDEA209H Unit 4's team launcher surfaces
from Mr. Pina's decision 71 and its two addenda of 2026-10-26, in the order the
prompt set, each step pushed alone and its migration applied before any client
named it. Nothing is cut. The prompt named this ledger 0435; that id was already
taken on `main`, and two entries claiming one id made Migrate refuse 0301, so the
entry is `0436-unit4-team-launcher.md` (its Notes say so).

## Pushed, step by step

| Step | What | Migration | Pushed | Applied record |
|---|---|---|---|---|
| ledger | entry, Owns verbatim, `Migration permitted: yes` | | `2b6e5a4` | |
| a | the validator widens alone: `audience: "role"` with `role`, and `team.roles` | 0301 | `93f130b` | `0dce547` |
| b | one live shared document per team, per-box lock, change log, posting is the switch | 0302 | `4cc4512` | `b03bf37` |
| c | team plan, tracker timeline, check-in | 0303 | `08fe8b9` | `f08ba43` |
| d | sign-off queue and approvals | 0304 | `b4a1826` | `62de2db` |
| e | grading by team (database first, then the screen) | 0305 | `27a3b2c`, `3b2ecad` | `adbbf52` (by hand, see below) |
| f | team board, machine counts, push on a new request | 0306 | `0b8b9fd`, `1a99f1f` | `9902525` |
| addendum 2 | teams by voice through the connector | 0307 | `7a3ca47`, corrected `5fda514` | `3eabe4d` |

After the closing push the live footer read **IDEA Portal v1.2549 · 84c0f6b**
(Oct 26, 2026); `84c0f6b` is a later ledger's docs commit on top of this ledger's
last, `1087880`, so the deploy carries all of it.

Final migration numbers, in apply order (all applied by `migrate.yml`):

- `supabase/migrations/0301_html_manifest_team_roles.sql`
- `supabase/migrations/0302_classroom_team_documents.sql`
- `supabase/migrations/0303_classroom_team_plans.sql`
- `supabase/migrations/0304_classroom_team_signoffs.sql`
- `supabase/migrations/0305_classroom_team_grading.sql`
- `supabase/migrations/0306_classroom_team_board.sql`
- `supabase/migrations/0307_classroom_team_voice.sql`

## Found versus built

Found and reused, never duplicated: the team draws (0223, 0225:
`classroom_save_team_set`, `classroom_post_team_set`, `classroom_unpost_team_set`,
`classroom_move_team_member`, `classroom_archive_team_set`,
`classroom_set_team_style`, `classroom_team_board(uuid)`), the 0086 approval rows
(`classroom_module_approvals`, which a sign-off writes as module
`signoff-<key>`), the one grading rule (`classroom_grade_submission`) and its bulk
path (`classroom_grade_submissions`, 0175), the completion rule
(`hxBlockHasResponse`), the live notice shape (`live.ts`), the push path
(`src/lib/server/push.ts`, the tournament-push idiom), the connector generator.

Built:

- **The shared document (0302).** Team rows (`classroom_team_answers`) are the one
  canonical answer per team block, fanned out to each member's own row so every
  existing reader works unchanged; a resync trigger moves answers in and out when a
  member moves, so work stays with the team. The section's current team set is
  derived at every call from its most recently posted visible draw: posting,
  unposting and a hand edit are the switch, nothing binds at upload (addendum 1).
  A per-box lock (two minutes after the last touch), owner checks for role blocks
  and past-due read-only are server rules; the page mirrors them through
  `TeamDocSession` and the bridge's `idea:field-focus`/`idea:field-blur`. Database
  triggers send the payload-free notice (`realtime.send`), so a post from the People
  tab, the connector or the SQL editor all reach an open page.
- **The plan (0303).** Tasks seeded from every graded block with its rubric points,
  owned tasks to the role owner, team tasks owned by the team, team-added tasks at 0
  points; the 0.75x to 1.25x share rule; Done automatic, On it from the check-in,
  Blocked the one student status, Behind and Slipping derived; a school-day timeline
  skipping weekends and the admin-editable no-school days (Nov 11 seeded); the
  tracker reaches the document as `idea:team-tracker`.
- **Sign-offs (0304).** Checklists come from the manifest's `team.checkpoints` and
  become admin-editable rows the first time they are read; the queue routes
  owner-only items to Mr. Pina alone; Approve writes the 0086 rows and stamps the
  change log; Send back turns failed items into 0-point tasks for the role owner (or
  the team). Sign-off 1 fixes owners for students.
- **Grading by team (0305, rubric standard 1.4, spec 16.8).** The rubric is still
  generated from the manifest. Team criteria are scored once and copied to every
  member through the bulk path; role criteria land only on the role's owner; a
  double owner gets the mean of two role blocks; individual criteria stay per
  member. A team assignment is refused one student at a time on every path (the
  per-student console, the bulk call made directly, a direct score), because
  `classroom_grade_team` names the team for its own transaction
  (`idea.team_grade`, the 0270 connector pattern). `_classroom_item_out_of` is the
  team and individual criteria plus ONE role block, and `teamRubricOutOf` mirrors it
  for the returned-grade card and the grading export. The ordinary console sends a
  team post to `/classroom/<id>/item/<id>/teams`.
- **The board (0306).** `/classroom/board`: per team a burn-up (planned points by
  school day as a dashed line, done points stacked by owner, drawn to today),
  percent done, Behind, Slipping, Uneven, Blocked, the next sign-off in school days,
  the shop gates; under it every machine's tagged tasks by day across every class.
  `classroom_team_board()` reads every team as its own plan plus when each task's
  work was saved. A new sign-off request pushes to the deciding teacher's phone
  through `POST /api/classroom/signoff-request` (`_classroom_signoff_notify`:
  the class's teacher, or Mr. Pina alone for an owner-only item).
- **Teams by voice (0307, addendum 2).** New server functions, each the same write a
  button makes: `classroom_preview_team_draw` (read: the server's random draw,
  teams of 3 and 4 only, never 2 or 5, absent students left out by address, roster
  name or one word of it, the seed returned), `classroom_draw_teams` (the same draw
  from the seed, saved through `classroom_save_team_set` and posted when he says
  post it), `classroom_swap_team_members` (two ordinary moves),
  `classroom_add_team`, `classroom_remove_team` (empty and workless only),
  `classroom_rename_team` (returns the old name for undo).

## Connector tools (named, as the prompt asks)

Hand entries in `src/lib/server/connector/registry/classroom.yaml` (outside Owns,
written because addendum 2 asks for them): read `classroom_preview_team_draw`,
`classroom_team_plan`, `classroom_signoff_queue`; undo `classroom_draw_teams` (undo
retires the draw), `classroom_swap_team_members`, `classroom_add_team`,
`classroom_rename_team`; confirm `classroom_remove_team`, `classroom_team_set_role`,
`classroom_team_task_set_due`, `classroom_signoff_decide`,
`classroom_machine_tag_set`, `classroom_no_school_day_set`. Already there and
reused: `classroom_team_board`, `classroom_save_team_set`, `classroom_post_team_set`
(undo), `classroom_unpost_team_set`, `classroom_move_team_member`,
`classroom_archive_team_set`. Generated by `npm run connector:build`: read
`classroom_item_teams`, `classroom_section_teams`, `classroom_team_document_for`,
`classroom_team_box_history`, `classroom_team_grading`,
`classroom_signoff_checklists`; confirm `classroom_grade_team`,
`classroom_signoff_checkpoint_set`, `classroom_team_plan_set_role` and the task
writes. `src/lib/server/connector/log-tables.ts` names the team tables the new
writes land in.

**Two levels differ from addendum 2, and why.** An owner change asks first ALWAYS,
not only after sign-off 1, and a due-date move asks first: the connector's `before`
read runs as him through row-level security, and the plan tables have no policy, so
the server cannot learn "after sign-off 1" or the old date before the call to pick
a level or an undo. Asking first is the stricter of the two answers.

## Measured

- `svelte-check` 0 errors, 33 warnings in 18 files after every step (re-derived
  with `svelte-kit sync` first).
- Two browser contexts as teammates on `/dev/team-document`: 12/12 (post to
  document 60 to 233 ms, a held box 162 to 323 ms, a teammate's edit visible in
  1093 ms including the 800 ms debounce, a move 53 to 110 ms, an unpost 61 to
  112 ms, another section unaffected).
- Slipping flagged two school days before the Design sign-off on the plan harness
  (planned to date 90, done 30), and on the board harness for three of four teams.
- Sign-off queue at 375: keys at least 48 px, Approve and Send back hit-tested clear
  of the feedback key, the whole decision on one screen; scripted taps 193 to 547 ms
  per team.
- Team grading at 375: 36 level keys at least 48 px tall, two across; Save and
  return hit-tested clear; nine criteria groups tapped in 1974 ms scripted; every
  member's preview 150 of 150 on a full score. At 1440 four across.
- Board at 1440 and 375: no horizontal page scroll; machine counts equal the tags
  seeded (router 4 on Nov 4, printer 3 and 1, laser 2).
- `npm run verify:browser` on the four new route specs (`team-grade`,
  `team-board`, `signoff-queue`, `team-plan`): 8 runs, 66 measurements, 0 outside
  threshold (with `CHROMIUM_PATH` pointed at this container's browser).
- The connector judge (`tests/db/classroom-team-voice.test.ts`, through `runTool`
  as the signed-in admin): draw and post, swap, rename, assign a role, approve one
  request and send one back; after each, the student's own read shows it, the live
  notice was sent, and the change log matches a click-made change field for field
  (a role's own id aside, since the two set different roles).
- Mutation proofs, permissive direction, each restored from a copy and md5-checked:
  0302 (five), 0303 (one), 0304 (two; the owner-only clause first survived with no
  witness, a non-owner admin was added), 0305 (four), 0306 (two), 0307 (four; the
  roster's manager exclusion first survived, a witness enrolling the class's teacher
  and an admin was added).
- Migrations tested over seeded pre-migration data where they change existing
  behaviour: 0301's widened gate answered all 21 stored manifests from `materials/`
  as before; 0305 left every stored total and grade unchanged except the team
  assignment's out-of.

## The full suite, once, at the end

`npm test` on `b75c58d`: **Test Files 8 failed | 905 passed (913); Tests 9 failed |
16847 passed | 6 skipped (16862)**. Five were this ledger's and are fixed in the
closing push, each file re-run green: the team plan's check-in `$effect` (now a
writable `$derived`, `classroom-composer-effect-reactivity`), the standards
register rows for the spec 1.11 and the rubric standard 1.4
(`standards-version-header`), the sequence count 0302's `classroom_team_log` adds
(`grant-sequence-sweep-control`, 16 to 17) and the browser-verify README counts
for the four new specs (`derived-numbers`, five assertions). Four are not this
ledger's and fail the same way without it: `apply-migration-guard` control 3 and
`apply-migration-trace` (no `origin/integration` ref in this checkout),
`identity-style-shared` (its pinned commit is outside this shallow clone) and
`coin-stocks-relaunch` (it boots the chain short of 0283, so no migration of this
ledger is in it).

## Two apply incidents, both closed

- **0305's record was committed by hand.** The apply succeeded (run 40309704841,
  history row written, eight objects present) but the workflow's record push lost a
  race with another push to `main`. `docs/migrations-applied/0305-main.md` was
  rendered with the tool's own `renderAppliedRecord` from that run's log (`adbbf52`).
- **0307 was corrected in place before it ever ran.** It first dropped 0306's
  `classroom_team_board()` to rename the burn-up board, which would have removed an
  overload of 0223's `classroom_team_board(uuid)`. Migrate refused it (run
  40314325477): `tools/idea-status.py` reads a drop by name, so it took 0225's
  function as retired, and 0225 has no history row to answer for it. Nothing was
  applied, so the file was corrected rather than followed by another (`5fda514`):
  the two forms stay side by side. No payload binds to both (one takes nothing, the
  other one required uuid with no default), the coverage and permission suites pass
  with both, and the self-check asserts exactly the two.

## Not verified

- A real Supabase Realtime round trip: `realtime.send` is stubbed in the test
  database; the two-second switch is measured on the harness's in-memory stand-in
  and the database tests count the notice rows. No signed-in production session
  opened a team document.
- A push notification on a phone: `POST /api/classroom/signoff-request` is not
  exercised end to end (no VAPID keys or subscription here).
- The teammate's picture in a shared box: submission files stay the uploader's, so
  a picture shows only for the student who took it and in grading (spec 16.3 tells
  authors to prefer text).
- A field check in a checklist is "has an answer" in the database; the plan page
  applies the full completion rule before it offers Request sign-off.
- `tests/apply-migration-guard.test.ts` control 3 and
  `tests/apply-migration-trace.test.ts` fail in this container on a clean base
  (no `origin/integration` ref); not this ledger's.

## Outside Owns, disclosed

`tools/validate-assignment-spec.py` (step a's widening, the Python twin of the
TypeScript validator), `src/lib/server/connector/registry/classroom.yaml` and
`endpoints.yaml` and `log-tables.ts` (addendum 2 asks for the tools; the new route
needs its exclusion), `src/routes/api/classroom/signoff-request/+server.ts` (the push
route the prompt allows "if the existing push path makes it small"), the generated
connector files, and `docs/connector/DESIGN.md`'s generated levels table.

## For Mr. Pina

- Author the Unit 4 posts with `team`, `team.roles`, `team.checkpoints` and
  `audience` per spec section 16; give every role module the same points. Nothing
  here authors one.
- Post the team draws (People tab, or say "draw teams for Block 2" then "post it").
- The machine list and the no-school days have no screen: edit them by voice
  ("Nov 26 is a no-school day") or ask for a screen.
- 0225 has no row in `supabase_migrations.schema_migrations`. While it has none, no
  migration may drop either form of `classroom_team_board`.
