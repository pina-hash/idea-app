---
title: "Ledger 0401: the IDEA Website connector, slice 2 -- every function covered, levels by argument, the growing eval set, gaps as feedback, the practice endpoint (`claude/website-connector-slice-2`)"
date: 2026-10-18
branches: [claude/website-connector-slice-2]
migrations: ["0272"]
subsystems: [Connector, MCP, OAuth, Coins, Classroom, Foundry, Armory, Certifications, Tournaments, Notebook, Admin, Feedback, Migrations]
---

Ledger 0401 (solo, through the session queue) finished the IDEA Website
connector that `docs/connector/DESIGN.md` specifies: every function the site
calls and every server route now has a tool, a `site_call` entry or a written
exclusion; levels can depend on the arguments or on what is there before the
write; every tool takes his words and the server keeps them; requests that
match nothing become saved requests; what the site cannot do becomes a gap he
sees in a new Connector feedback tab; and `/mcp/practice` replays anything
without writing. One migration, 0272.

## The audit, answered from the tree

- **Pending at the start, measured 2026-10-18 on `f4fdb57`:** 355 function
  entries and 82 route entries carried `pending: slice 2` (388 function and 109
  route entries in the overlay then).
- **Classification read each function's latest definition** under
  `supabase/migrations/`. The rule (DESIGN.md section 7) held: a function that
  writes is never `read`, and one with no reverse and no revision table asks
  first unless its value can simply be set back.
- **Routes:** six are things a person does by hand and became `call` entries
  run in-process (`/api/armory/purge`, `/api/armory/sweep`,
  `/api/certifications/award`, `/api/certifications/correct`,
  `/api/foundry/delete`, `/api/foundry/source`); every other route is excluded
  by category (a page or file served, a sign-in or OAuth step, a scheduled job,
  a student's own action, a game, the connector's own transport, or the same
  work as a function entry). The tournament live-operation functions are
  `exclude: live tournament operation stays manual (Mr. Pina, 2026-10-17)`.
- **0400's tool list, levels and audit row** are the one path: `said`,
  `level_when` and practice went into `registry.ts` (one builder), `engine.ts`
  `write` (one call path) and `tools.ts` `runTool` (one dispatcher).

## Departures from the approved family table, and why

Each is the function's own definition deciding, and each says so in its YAML.

- **Asks first where the table said undo**, because there is no reverse:
  `classroom_feedback_seen` (a bulk stamp; eval 31 is seeded C),
  `foundry_review_version` (a review is given once and cannot be re-reviewed;
  eval 39 is seeded C), `classroom_hall_pass_close_by_id` (no reopen, and a long
  pass may fine), `cert_admin_save`, `cert_lesson_save`,
  `cert_exam_pool_replace` (no restore function), `maps_publish` (clears the
  draft history), `classroom_upsert_course` (no course delete), the tournament
  setup writes `tournament_shuffle_seeds`, `tournament_generate_qual_pools`,
  `tournament_send_invite`, `tournament_set_reward_rules`,
  `tournament_set_entry_style`, `tournament_add_host`, and
  `classroom_archive_team_set`, `classroom_unpost_team_set`,
  `classroom_move_team_member`, `classroom_set_team_style`,
  `classroom_feedback_update`, `classroom_song_approve`, `classroom_song_reject`,
  `classroom_set_item_thumbnail`, `foundry_clear_metadata_flag`,
  `foundry_update_app_metadata`, `foundry_publisher_decide`,
  `foundry_publisher_set_questions`, `app_feedback_edit` and
  `notebook_admin_override_entry` (each overwrites a value nothing records).
- **By argument or by what is there** (`level_when`, seven entries): the
  balance adjustment by amount (Mr. Pina); `gauntlet_author_upsert` and
  `notebook_admin_upsert_session` ask when editing (the old wording is not
  kept) and undo a new one by deleting it; `classroom_set_assignment_spec`,
  `classroom_set_reference_spec` and `classroom_save_instructor_response` undo a
  replacement and ask for the first one; `tournament_set_status` asks when
  opening a draft (nothing goes back to draft) and undoes a move between
  registration and seeding.
- **Reads that touch a row**: `classroom_hall_pass_state` and `_events` run a
  lazy sweep that may close an overdue pass, exactly as the page load does, so
  they stay `read`.
- **Excluded where the table might suggest a tool**: GAUNTLET room hosting
  (live), every student's own action, the browser instruments, and every
  function only reachable from a cron or the Windows app.

## What was built

- **The overlay**, every remaining entry: 400 function entries (301 reachable:
  288 through `site_call`, 13 promoted to tools of their own, and 99 excluded
  with a reason) and 111 route entries (6 `call`, 105 excluded), measured
  2026-10-18. The promoted tools: `add_student`, `add_tournament_entry`,
  `adjust_balance`, `close_assignment`, `create_tournament`, `delete_post`,
  `duplicate_post`, `extra_credit_coins`, `open_hall_pass`, `pin_post`,
  `remove_student`, `review_foundry_app`, `revoke_grade`. Tool list: 36.
- **`level_when`, `before` and the undo templates** (`registry.ts`,
  `engine.ts`): conditions on an argument or on `$before`; `before` as a table
  select or a read function, as him; undo arguments from `$args`, `$result`,
  `$before`, `$written`, `$user`, with `when`, `map`, `!` and `!!`, and
  several calls through `each`. A single `!` in a `when` holds for an absent
  value ("no prior row", "no id given"), which first-time grades, new sections,
  new challenges and new check-ins needed; as an argument an absent value stays
  unresolved, so the alternative is skipped.
- **Routes run in-process** (`endpoints.ts`): literal imports, `locals.supabase`
  on the minted session, audited by `connector_endpoint_begin` and `_finish`.
- **`cleanup.ts`**: after a delete commits, the Drive files and storage objects
  the database handed back are cleared, the site's own order.
- **0272**: `connector_requests`, `connector_evals` (seeded with 52 lines),
  `connector_gaps`, `connector_eval_runs`, eight definer functions and two
  private helpers. RLS on, no policy, no client grant; every function revokes
  from `public, anon, authenticated, service_role` and grants `authenticated`
  only.
- **75 more log tables, synced by the server, not listed in 0272**
  (`log-tables.ts`, through `syncRegistry`, insert only). `connector_log_tables`
  is the connector's own metadata, like `connector_registry`, so a later write
  entry needs no migration; and listing them in 0272 named Armory tables in a
  migration outside the Armory series, which `tests/db/armory-proposed.test.ts`
  refuses. For the same reason the Armory purge route's tool is
  `delete_project_forever` and saved request 40's proof reads the route's
  audit row.
- **`said` on every tool**, logged after the call with the outcome and the audit
  ids; new words become saved request 53 and on; an unknown `site_call` name and
  `report_gap` write a gap. `record_eval_result` keeps a replay result.
- **`site_find_tool`**: at most five, ranked, each with the exact `site_call` to
  make; nothing found says to call `report_gap`.
- **`/mcp/practice`**: the same handler with `practice: true`. Its 401 points to
  its own metadata at `/mcp/practice/oauth-protected-resource`, which names
  `/mcp/practice` as the resource (RFC 9728 3.3: a client checks the metadata's
  resource against the URL it called; pointing practice at `/mcp`'s metadata
  would fail that check), under the same authorization server, so one sign-in
  serves both. The `.well-known` route belongs to 0400's Owns, so the practice
  metadata lives under `src/routes/mcp/`, where the 401 header points.
- **`/admin/feedback/connector`** (open gaps first, his words, what was tried,
  Built with a ledger number, Declined, Open again, and the saved requests each
  produced with their last replay) and a **Requests** section on
  `/admin/connector` with a download. Built in the site plate with existing
  classes, after the idea-design skill; no mascot.
- **Generated documents**: `tools/connector/levels-table.mjs` writes DESIGN.md
  section 7 from the overlay (run by `npm run connector:build`), and
  `tools/connector/evals/export.mjs` writes `EVALS.md` from the table (`--json`
  takes the admin download). The coverage test fails on either going stale.

## Measured

- `tests/db/connector-permissions.test.ts`: 170 of 170, every one of the 169
  write entries refused text for text as a student, a teacher and signed out,
  and the admin's rows equal to the direct call's (a seed shuffle compared under
  one `setseed`).
- `tests/db/connector-levels.test.ts`: 111 of 111. 132 read entries wrote no
  row; every confirm entry wrote nothing without its token, with a made-up one
  and with its token on other arguments; 103 undo entries each reversed by
  `undo_last`, ten of them by meaning with their reason and their own check.
- `tests/db/connector-requests.test.ts`: 14 of 14, including the practice
  endpoint over every write entry (and every confirm pressed through with its
  practice token) and nine voice tools, all leaving the 108 log tables and six
  connector tables unchanged.
- **Mutation proof**: removing practice from the preview condition in `write`
  reddened the practice test; making `confirmFirst` always false reddened two
  confirm tests. Both restored md5-identical.
- **HTTP run** (`tools/connector/local-backend.mjs`, `vite dev`, the MCP
  Inspector CLI 2.11.0): `tools/list` on `/mcp/practice` answered 36 tools; a
  practice award wrote nothing; on `/mcp` the award wrote one
  `coin_transactions` row and one `connector_audit` row; the requests log held
  four rows with his words; "Give Mateo three coins for helping clean the shop"
  became saved request 53; "Make a seating chart for Block 2" matched seeded
  line 52 and opened a gap with `site_call:make_seating_chart` tried.
- `svelte-check`: 0 errors, 33 warnings in 18 files (29/3/1), the baseline.
- **The full suite** (845 files, 15923 tests, on an unshallowed checkout):
  15921 passed and 2 failed. One was this bundle's: the practice voice-tools
  test read "209H Block 2" as ambiguous because a sample's random section label
  ("Lab Section 2e45") carries a 2, which the name resolver reads as a block.
  The samples now use labels with no digits, and the three suites that share
  them re-ran 295 of 295. The other is `migrations-applied-record` (main's 0269
  hole, below). `npm run build` passed.

## Not verified

- **Production**: 0272 is applied by `migrate.yml`; no session reaches it.
- **claude.ai adding either connector**, and the nightly replay on Haiku 5.5
  (a scheduled task created from chat once the practice connector is added).
- **The two admin pages in a browser**: both need a Google session and no `/dev`
  harness exists for them (`src/routes/dev` is outside this ledger). Their
  loads and actions are type-checked; the gap list, the status action and the
  saved-requests read are driven by the database tests.
- **The six routes' real handlers in-process**: the test stands in a module for
  `/api/foundry/delete` to prove the call shape (asks first, runs once as him,
  audited, never twice); the real handlers need storage and signing keys.

## Outside the Owns list

Nothing was edited outside it. Three things a later bundle owns:

- `src/lib/feedback/FeedbackSourcesNav.svelte` and the `/dev/feedback` harness
  draw three keys. The area's layout mounts that component on the three
  existing pages with the Connector key beside it in the same row
  (`tests/feedback-console-route.test.ts` requires the component in the
  layout), and draws all four itself on the connector's page, where the shared
  component would light "Site".
- Ledger 0400's entry still says "0272 not used": 0400 claimed 0270 to 0272 and
  0401's permission line names its number in prose, so exactly one entry (0400)
  claims 0272 and `migrate.yml` applies it under 0400 rather than refusing two
  claims.
- `tests/db/migrations-applied-record.test.ts` fails on main as it stands:
  `docs/migrations-applied/` holds a record for 0270 and none for 0269. This
  bundle adds no record and the failure is the same without it.

The full suite also needs a checkout that is not shallow and can see
`origin/integration` (the apply-tool suites and
`tests/identity-style-shared.test.ts` say so); this container's was shallow,
and `git fetch --unshallow` plus a fetch of `integration` cleared all three.

## What a person must do

1. Nothing before deploy: `migrate.yml` applies 0271 and then 0272 on the push.
2. Add the practice connector in claude.ai (DESIGN.md section 10 step 4): name
   `IDEA Website (practice)`, URL `https://ideabosco.com/mcp/practice`.
3. From chat, create the nightly replay task on Haiku 5.5 against the practice
   connector (it records each line with `record_eval_result`).
4. When `EVALS.md` should catch up with his own requests: download the list on
   `/admin/connector` and run `node tools/connector/evals/export.mjs --json <file>`.
