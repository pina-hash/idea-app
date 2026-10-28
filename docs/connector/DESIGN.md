# The IDEA Website Connector

A remote MCP connector hosted on ideabosco.com (`https://ideabosco.com/mcp`) that
lets Mr. Pina do anything he can do on the site by hand from any Claude chat,
including by voice on his phone, acting as himself with exactly his admin
permissions. Decided in chat on 2026-10-17; built by ledger 0400 (first slice)
and 0401 (generated coverage of everything else). Measured on main `b0f523d`,
2026-10-17: 374 distinct database functions the site's code calls, 102 server
endpoints, 337 pages.

Locked by Mr. Pina (2026-10-17), and not open to a session:

- Scope is the whole website, read and write. One exception: running a live
  tournament (advancing matches, entering scores) stays manual; creating and
  setting up tournaments is in scope.
- It acts as him through the same database functions his own sign-in calls. No
  service-role shortcut and no new permission. A test proves it can never exceed
  what his account can do.
- Every write lands in the site's real logs exactly as if he did it by hand (a
  coin award carries the reason he spoke), plus one connector audit row marked
  "via Claude".
- Three safety levels: reads run at once; writes he can undo run at once and are
  logged; anything irreversible or destructive asks in chat first.
- Every write supports a preview. Repeating a request can never double an
  action. Student names are matched against his rosters and the connector asks
  when a name is ambiguous.
- He can revoke access and switch the connector off.
- Tools come from one registry, never hundreds of hand-written ones.
- A CI check lists every function the site's code calls and every server
  endpoint, and fails when one has neither a tool nor a written reason.
- Standard claude.ai custom-connector sign-in, so it works on any device. It
  passes Anthropic's MCP Inspector, verified against database rows.
- Nothing lets a student account use it.

## 1. Sign-in: ideabosco.com is the authorization server

Claude's requirements (claude.com/docs/connectors/building/authentication, read
2026-10-17): the MCP URL answers `401` with a `WWW-Authenticate: Bearer
resource_metadata=...` pointer; protected-resource metadata names the issuer;
the issuer serves RFC 8414 metadata; PKCE S256; Claude registers through DCR, or
uses its Client ID Metadata Document when the metadata advertises
`client_id_metadata_document_supported: true` and `"none"` in
`token_endpoint_auth_methods_supported`; the hosted apps redirect to
`https://claude.ai/api/mcp/auth_callback`; Claude Code redirects to a loopback
on any port; token endpoint accepts form-urlencoded, answers in under 10 s,
rotates refresh tokens, returns `invalid_grant` for a dead refresh token.

The site already is the identity: his Google sign-in and `is_admin()`. So the
site is also the OAuth server, and the consent step is the site's own session.

Routes (all new, none under `authedPrefixes`; a surface a non-admin may not see
answers 404, per "Probing must reveal nothing"):

| Route | Role |
|---|---|
| `POST /mcp` | the MCP endpoint (Streamable HTTP, stateless, JSON responses; no session ids). No bearer, or a dead one: `401` with the `resource_metadata` pointer. |
| `GET /.well-known/oauth-protected-resource/mcp` and `/.well-known/oauth-protected-resource` | `resource: "https://ideabosco.com/mcp"`, `authorization_servers: ["https://ideabosco.com"]`, `scopes_supported: ["site", "offline_access"]`, `bearer_methods_supported: ["header"]`. |
| `GET /.well-known/oauth-authorization-server` | issuer, `authorization_endpoint` `/connector/authorize`, `token_endpoint` `/connector/token`, `registration_endpoint` `/connector/register`, `revocation_endpoint` `/connector/revoke`, `code_challenge_methods_supported: ["S256"]`, `token_endpoint_auth_methods_supported: ["none"]`, `client_id_metadata_document_supported: true`, `grant_types_supported: ["authorization_code","refresh_token"]`, `response_types_supported: ["code"]`, `scopes_supported: ["site","offline_access"]`. |
| `GET /connector/authorize` | A page. No site session: render the site's own sign-in panel the way `/armory` pages do (the prefix guard would drop the query), returning to the same address. Session but not `is_admin()`: 404. Admin: a consent card in the IDEA look naming the client (the CIMD document's `client_name`, fetched over HTTPS and checked to carry its own URL as `client_id`; or the DCR record) and the redirect host, one **Connect** button and one **Not now**. Connect inserts a `connector_codes` row (sha256 of the code, user id, email, client id, redirect uri, code challenge, scope, 5 minute expiry) and redirects with `code` and `state`. |
| `POST /connector/token` | form-urlencoded. `authorization_code`: looks the code up by hash, checks client, redirect uri, expiry, single use and the PKCE verifier; issues an opaque access token (32 random bytes, 1 hour) and a refresh token (32 random bytes, 30 days); stores sha256 of both on one `connector_tokens` row (user id, email, client id, label, created, expires, last used, revoked at, refresh rotations). `refresh_token`: rotates both tokens on the same row in one statement; a revoked, expired or already rotated token answers `invalid_grant`. |
| `POST /connector/register` | RFC 7591 fallback. Stores `connector_clients` (random client id, redirect uris, name). Only `https://claude.ai/api/mcp/auth_callback` and loopback `http://localhost/...` or `http://127.0.0.1/...` (port ignored) are accepted as redirect uris. |
| `POST /connector/revoke` | RFC 7009: revokes the row the token belongs to. |
| `/admin/connector` | Admin tier, 404 otherwise. The on/off switch (`connector_settings.enabled`), every connection with its label, created and last-used times and a **Disconnect** button, **Disconnect all**, and the audit log (newest 200 rows, filter by tool and by day, each row opening to its arguments and the rows it wrote). In the IDEA look (idea-design skill). |

Who the connector acts as: the user on the token row, every request. The MCP
route turns the bearer into a Supabase session for that user with the Armory
pattern (`auth.admin.generateLink({type:'magiclink'})` on the service client,
then `verifyOtp` on a fresh anon client: `src/lib/server/armory/backend.ts`,
`mintSession`), cached in process memory keyed by token hash until it expires,
and never stored. Every tool call then runs through a client carrying THAT
access token, so `auth.uid()`, `current_user_email()`, `is_admin()`,
`_coin_full_staff()` and every RLS policy see him and nobody else. The service
role is referenced in exactly one file, `src/lib/server/connector/backend.ts`,
for exactly two things: the `connector_*` tables (which no client role may
touch) and `mintSession`. A test greps that this stays true.

Two gates stop a student account: consent answers 404 to a non-admin, and
every MCP request re-checks `is_admin()` as the minted user before any tool
runs, so removing an email from `app_admins` kills its tokens on the next call.
The kill switch is read the same way on every request. Any admin may connect;
each acts as themselves. There is no identity constant in the code.

## 2. The registry

Three layers, one builder. Nothing about a function's arguments is typed by
hand.

1. **Inventory** (`tools/connector/inventory.mjs`, generated, checked in as
   `src/lib/server/connector/inventory.generated.json`): every distinct
   `.rpc('name')` in `src/**` and every `+server.ts` under `src/routes/**` with
   its methods. The CI test regenerates it and fails on a diff, and the file
   carries the counts and the date they were measured.
2. **Schema** (`tools/connector/schema.mjs`, generated from the database):
   boots the embedded cluster `tests/db/cluster.ts` uses, applies every
   migration, and reads `pg_proc` for each inventoried function: argument names,
   types, defaults, return type, and `obj_description`. Written to
   `src/lib/server/connector/schema.generated.json`.
3. **Overlay** (`src/lib/server/connector/registry/*.yaml`, one file per family:
   `classroom.yaml`, `coin.yaml`, `foundry.yaml`, ... and `endpoints.yaml`),
   the only hand-written layer. One entry per function or endpoint:

```yaml
coin_log_transaction:
  tool: award_coins          # the voice name; or `exclude: <reason>`
  surface: tool              # tool (its own MCP tool) or call (reached through site_call)
  level: undo                # read | undo | confirm
  undo: coin_reverse_transaction
  describe: Give a student IDEA Coins with the reason you say.
  say: ["give Mateo 5 coins for helping clean up", "award 10 to the whole team", "pay her 3 for the demo"]
  args:
    p_email: {name: student, resolve: student}   # resolved by find_student
    p_amount: {name: amount}
    p_reason: {name: reason, required: true}
  idempotent: [student, amount, reason]
```

One builder (`src/lib/server/connector/registry.ts`) reads the three layers and
emits the MCP tool list: every `surface: tool` entry as its own tool (schema from
layer 2, names and descriptions from layer 3), plus three built-in tools:
`find_student`, `site_find_tool(query)` and `site_call(name, args, dry_run,
request_id, confirm_token, again)`, whose description is generated from the
`surface: call` entries. The long tail is two hops away; the first slice is one.
Every tool, facade or generic, comes from the registry and nowhere else.

Why not 374 tools: Claude sees every tool description on every turn, and on
voice a 400-item list makes tool choice worse, not better. The split is a
registry attribute, so moving a function to its own tool is one line.

Descriptions good enough for voice: `describe` is one sentence in his words
(coins, classes, posts, students, never table names); `say` carries three to six
ways he would actually phrase it, in the description; argument names are the
nouns he uses (`student`, `class`, `post`, `amount`, `reason`, `due`); a date
argument accepts "Friday", "tomorrow 3pm" and ISO, resolved in his time zone
(America/Los_Angeles); a `student` argument is resolved by `find_student`
against the rosters of the sections he teaches (`classroom_section_roster`
through his own session), first name, nickname, last name or "Daniel R", and an
ambiguous match returns the candidates with their class instead of guessing. The
structural judge is `tests/connector-registry.test.ts`: every tool has a
`describe` under 200 characters, three or more `say` lines, every argument a
description, and no table or column name in any of them.

## 3. Safety levels, preview, repeats

One database function carries every write: `connector_call(p_tool, p_function,
p_args jsonb, p_request_key, p_mode)`, SECURITY INVOKER, so the inner function
is gated exactly as from the browser. It builds the call from `pg_proc` (named
arguments, each cast to its declared type, `%I` and `%L` only), refuses a name
that is not in the registry table, and:

- `p_mode = 'preview'`: executes the function, collects the return value and
  every row written or changed in this transaction in the tables listed in
  `connector_log_tables` (seeded with every log, revision, transaction and
  event table and every table the first-slice tools write; rows whose `xmin`
  is the current transaction id), then raises `CONNECTOR_PREVIEW:<json>`. The
  raise rolls everything back; the server parses the payload. That is the
  preview for every function, including the ones that never had one.
- `p_mode = 'commit'`: inserts the `connector_audit` row first (`request_key`
  unique; on conflict it returns the stored result with `repeated: true` and
  executes nothing), executes, then completes the audit row with the result and
  the rows written. A failure rolls back both, and the server records the
  failure on a second, separate statement (`connector_audit_failure`).

The audit row: who, tool, function, arguments, request key, level, result, rows
written (table, id, summary), `via: 'claude'`, started and finished times. The
site's real logs are written by the inner function, unchanged: a coin award is a
`coin_transactions` row logged by him with the spoken reason, the same row the
Coin Desk writes.

Levels, enforced by the server from the registry, never by the prompt:

- **read**: direct RPC as him, no audit row, no preview.
- **undo**: preview on request (`dry_run: true`); otherwise executed and logged.
  Every `undo` entry names its reverse (`undo:`), and `undo_last` reverses the
  newest connector write that has one.
- **confirm**: the first call always returns the preview and a `confirm_token`
  (sha256 of user, tool, canonical args, preview payload, minute); nothing is
  written. The second call must carry that token, within 10 minutes, with the
  same arguments, or it is refused. Claude reads the preview to him and asks;
  "yes" is the second call. The gate is structural.

Repeat protection: `request_key` is Claude's `request_id` when it sends one
(the tool descriptions ask for a fresh random id per user request, reused on a
retry). Without one the server derives sha256(user, tool, canonical args) and
treats a match in the last 120 seconds as the same request: it returns the
earlier result with `repeated: true` and nothing executes. A deliberate second
award of the same amount to the same student for the same reason carries
`again: true`, which salts the key.

## 4. The first slice (ledger 0400), usable on his phone first

Facade tools, all from the registry: `find_student`, `list_classes`,
`list_posts`, `get_post`, `create_post` (a classroom item or a quick post, to one
class or several, with kind, points and due), `set_points`, `set_due`,
`set_rubric`, `set_published`, `replace_html_assignment`, `read_grades`,
`read_answers`, `grade`, `send_feedback`, `award_coins`, `fine_coins`,
`coin_balance`, `undo_last`, `connector_disconnect`, plus `site_find_tool` and
`site_call` with the registry carrying first-slice entries and every other
function listed under `pending: slice 2` (a reason the coverage check accepted
until 0401 removed the allowance; every function now has a tool, a `call`
entry or a written exclusion).

`replace_html_assignment` refuses when any `block_id` that has a stored answer
in `classroom_responses` for the item (any posting) is absent from the new
document's manifest, naming the ids, because a renamed block id orphans every
answer under it silently (CLAUDE.md, PORTED HTML ASSIGNMENTS). The manifest is
produced by the same parser the site's importer uses, never a second one. The
tool always returns the block diff (kept, added, missing) with the result.

## 5. Outside judges

- `tests/db/connector-permissions.test.ts`: for every write entry in the
  registry, the call through `connector_call` as a student, as a non-admin
  teacher and signed out raises the same refusal the direct call raises
  (compared text for text), and as the admin the direct call and the connector
  call write identical rows in every `connector_log_tables` table apart from
  ids and timestamps, the audit row being the only extra.
- `tests/db/connector-preview.test.ts`: a preview leaves zero rows in every log
  table and reports the rows a commit of the same call then writes.
- `tests/db/connector-repeat.test.ts`: the same request twice writes once;
  `again: true` writes twice.
- `tests/connector-coverage.test.ts`: every inventoried function and endpoint
  has a tool, a `call` entry or an `exclude` reason (the `pending` allowance is
  gone since 0401); every overlay entry names something that exists; section 7
  below and `EVALS.md` are what their generators write. Counts carry their date.
- `tests/db/connector-levels.test.ts` (0401): every read entry writes no log
  row and no audit row; every confirm entry writes nothing without the token it
  was handed, with a made-up one, or with its token carried to other arguments;
  every undo entry's write lands and `undo_last` reverses it, judged on the log
  tables (a reversal that leaves a record on purpose, such as a revoked grade,
  is named in the file with its reason and its own check); `level_when` both
  ways.
- `tests/db/connector-requests.test.ts` (0401): a request is logged with his
  words; words that match no saved request become one; an unknown `site_call`
  name and `report_gap` become an open gap; the practice endpoint, called with
  every write entry in the registry, leaves every log table and every connector
  table unchanged; a site route asks first, runs once as him and is audited.
- `tests/connector-oauth.test.ts`: both metadata documents, the `401` shape,
  PKCE failure, code reuse, refresh rotation, `invalid_grant`, a revoked token
  and the kill switch each answer as the spec says; consent answers 404 to a
  student session.
- `tests/connector-service-role.test.ts`: `SUPABASE_SERVICE_ROLE_KEY` and the
  service client appear under `src/lib/server/connector/` only in `backend.ts`,
  only in the token-store functions and `mintSession`.
- The MCP Inspector (`npx @modelcontextprotocol/inspector --cli`) against the
  app running locally with `CONNECTOR_BACKEND=local-pg` (a backend
  implementation that runs `connector_call` on the embedded cluster with
  `request.jwt.claims` set, exactly as `tests/db/harness.ts` does) and a seeded
  admin token: `tools/list`, then `tools/call` on `award_coins`, `create_post`
  and `fine_coins` with `dry_run` and without, and the judge is the rows in
  `coin_transactions`, `classroom_items` and `connector_audit` read back from
  the cluster, never the Inspector's own output.
- The finish line: `docs/connector/EVALS.md` run from a fresh chat on his phone,
  with the audit rows read from the production database as the record.

## 6. Order of work

1. **Ledger 0400** (Opus 5.5, high, one migration or more as needed from
   0270): everything in sections 1, 2, 3, 4 and 5 except the full overlay.
   Lands on main complete: sign-in, admin page, registry builder, the first
   slice, every test above, the Inspector run recorded in its history entry.
2. **Ledger 0401** (Opus 5.5, high, after 0400): the overlay for every
   remaining function and endpoint (tool, call or exclude with reason; levels
   per section 7), the endpoints that are real functions reachable through
   `site_call` (in-process handler calls with the minted session), the
   `pending` allowance removed from the coverage check, `level_when`, the
   request log, the database eval set, gaps and the Connector feedback
   section, and the practice endpoint (sections 8 and 9).
3. **This chat**: he adds the connector in claude.ai, the eval set runs from his
   phone, and the audit rows are read as the record.

## 7. Safety level by family

The rule: a function that only returns data is `read`; a write with a revision
table, a reverse function or a value that can be set back is `undo`; a delete,
purge, remove, reset, bulk operation, signed public record or change to who is
admin is `confirm`; a browser-session instrument or a cron entry point is
excluded.

**Approved by Mr. Pina on 2026-10-17 as proposed, with one change:** a coin
balance adjustment that ADDS to a student's balance runs at once; one that
lowers it (setting it to zero included) asks first. `coin_admin_adjust_balance`
takes a signed `p_amount` (0251), so the overlay states the level by argument:

```yaml
coin_admin_adjust_balance:
  level_when: [{if: "p_amount > 0", level: undo}, {else: confirm}]
```

`level_when` is evaluated by the server on the resolved arguments, never by the
model. Any entry may use it; an entry without it has one `level`. Since ledger
0401 a condition may also name what the site holds before the write, read by
the entry's own `before` (as him): `$before.found` ("an answer is already
there, so this one can be put back") or `$before.status = draft`. Five more
entries use it, each because one branch has a reverse and the other has none
(a first spec, a first instructor answer, opening a draft tournament, editing
an existing check-in or challenge).

The family table Mr. Pina approved is in git history at ledger 0400. From
ledger 0401 the table is GENERATED from the overlay the server enforces, so it
cannot say one thing while the server does another; where an entry departs
from the family rule above, the reason is in its YAML and in the 0401 history
entry.

<!-- levels:start (generated by tools/connector/levels-table.mjs from the overlay; edit the YAML, not this table) -->
Generated from the overlay on 2026-10-28.

| Family | read | undo (runs, logged) | confirm (asks first) | by argument | excluded |
|---|---|---|---|---|---|
| calendar.yaml | 4 | 0 | 5 | 0 | 3 |
| Certifications | 12 | 0 | 3 | 0 | 10 |
| Foundry | 20 | 6 | 6 | 0 | 10 |
| GAUNTLET | 8 | 3 | 1 | 1 | 11 |
| GREENLINE | 2 | 3 | 1 | 0 | 6 |
| IDEA Armory | 17 | 6 | 5 | 0 | 11 |
| IDEA Classroom | 30 | 54 | 32 | 3 | 25 |
| IDEA Coin | 27 | 8 | 9 | 1 | 26 |
| IDEA Maps | 3 | 2 | 1 | 0 | 0 |
| IdeaCAD | 5 | 2 | 0 | 0 | 1 |
| market.yaml | 6 | 0 | 9 | 1 | 0 |
| Notebook | 4 | 14 | 5 | 1 | 9 |
| People, feedback and the rest of the site | 13 | 9 | 9 | 0 | 6 |
| Site routes (run in-process as him) | 4 | 0 | 10 | 0 | 107 |
| The connector itself | 5 | 1 | 3 | 0 | 7 |
| Tournaments | 1 | 7 | 10 | 1 | 8 |
| view-as.yaml | 1 | 0 | 1 | 0 | 3 |
| **All** | **162** | **115** | **110** | **8** | **243** |

<details><summary>calendar.yaml</summary>

- **Read:** `calendar_events_list`, `calendar_feed_for`, `calendar_feed`, `classroom_item_pacing`
- **Asks first:** `calendar_event_move`, `calendar_event_remove`, `calendar_event_save`, `classroom_item_pacing_clear`, `classroom_item_pacing_set`
- **Excluded (the reason is in the YAML):** `calendar_feed_by_token`, `calendar_feed_link_revoke`, `calendar_feed_link`

</details>

<details><summary>Certifications</summary>

- **Read:** `cert_admin_get`, `cert_admin_list`, `cert_award_get`, `cert_exam_live`, `cert_exam_pool_get`, `cert_export`, `cert_get`, `cert_is_certifier`, `cert_lesson_document`, `cert_me`, `cert_notifications_unread`, `cert_verify`
- **Asks first:** `cert_admin_save`, `cert_exam_pool_replace`, `cert_lesson_save`
- **Excluded (the reason is in the YAML):** `cert_award_commit`, `cert_award_correct`, `cert_award_prepare`, `cert_error_log`, `cert_expiry_reminders`, `cert_mirror_snapshot`, `cert_notifications_mark_sent`, `cert_notifications_unsent`, `cert_sweep_dormant`, `cert_sync_log_write`

</details>

<details><summary>Foundry</summary>

- **Read:** `foundry_app_play_stats`, `foundry_author_profile`, `foundry_class_schedule_get`, `foundry_collections_read`, `foundry_featured_read`, `foundry_gallery_overrides_read`, `foundry_game_requests`, `foundry_get_app`, `foundry_list_apps`, `foundry_manageable_sections`, `foundry_my_play_stats`, `foundry_people_search`, `foundry_play_counts`, `foundry_publisher_applications`, `foundry_publisher_pending_count`, `foundry_publisher_questions_admin`, `foundry_publisher_status`, `foundry_section_access`, `foundry_trusted_roster`, `foundry_vote_counts`
- **Undo:** `foundry_set_app_hidden`, `foundry_set_app_major`, `foundry_set_section_open`, `foundry_set_site_open`, `foundry_trusted_grant`, `foundry_trusted_revoke`
- **Asks first:** `foundry_clear_metadata_flag`, `foundry_cover_set`, `foundry_publisher_decide`, `foundry_publisher_set_questions`, `foundry_review_version` (review_foundry_app), `foundry_update_app_metadata`
- **Excluded (the reason is in the YAML):** `foundry_cover_html`, `foundry_create_app`, `foundry_create_version`, `foundry_delete_app`, `foundry_delete_version`, `foundry_play_ping`, `foundry_play_start`, `foundry_publisher_apply`, `foundry_submit_version`, `foundry_vote`

</details>

<details><summary>GAUNTLET</summary>

- **Read:** `gauntlet_author_get`, `gauntlet_can_author`, `gauntlet_class_run_stats`, `gauntlet_leaderboards`, `gauntlet_progression`, `gauntlet_rank_settings_get`, `gauntlet_run_review`, `gauntlet_run_targets`
- **Undo:** `gauntlet_author_set_status`, `gauntlet_rank_settings_set`, `gauntlet_series_assign`
- **Asks first:** `gauntlet_author_delete`
- **By argument:** `gauntlet_author_upsert`: undo when p_id is null, otherwise confirm
- **Excluded (the reason is in the YAML):** `gauntlet_knowledge_start`, `gauntlet_room_create`, `gauntlet_room_delete`, `gauntlet_room_join`, `gauntlet_room_manual_submit`, `gauntlet_room_reveal`, `gauntlet_room_set_challenge`, `gauntlet_room_set_state`, `gauntlet_room_start`, `gauntlet_speedrun_reveal`, `gauntlet_submit`

</details>

<details><summary>GREENLINE</summary>

- **Read:** `greenline_leaderboard`, `greenline_track_list`
- **Undo:** `greenline_decal_review`, `greenline_track_review`, `greenline_track_set_featured`
- **Asks first:** `greenline_track_remove`
- **Excluded (the reason is in the YAML):** `greenline_purchase_item`, `greenline_submit_race_result`, `greenline_track_attempt_finish`, `greenline_track_attempt_start`, `greenline_track_rate`, `greenline_track_report`

</details>

<details><summary>IDEA Armory</summary>

- **Read:** `armory_app_feedback_admin_list`, `armory_app_incident_report`, `armory_app_incidents_admin_list`, `armory_can_take_back`, `armory_cots_list`, `armory_file_history`, `armory_is_member`, `armory_list_changes`, `armory_my_projects`, `armory_orphans_count`, `armory_people_search`, `armory_project_checkouts`, `armory_project_files`, `armory_project_part_numbers`, `armory_project_summaries`, `armory_purge_preview`, `armory_team_status`
- **Undo:** `armory_app_feedback_restore_statuses`, `armory_app_feedback_set_status_many`, `armory_app_feedback_set_status`, `armory_app_incident_set_status`, `armory_app_incidents_restore_statuses`, `armory_app_incidents_set_status_many`
- **Asks first:** `armory_add_member`, `armory_break_lock`, `armory_break_locks`, `armory_create_project`, `armory_remove_member`
- **Excluded (the reason is in the YAML):** `armory_cots_add`, `armory_cots_correct`, `armory_cots_retire`, `armory_orphans_pending`, `armory_orphans_swept`, `armory_part_number_take`, `armory_part_subsystem_retire`, `armory_part_subsystem_save`, `armory_purge_project`, `armory_register_device`, `armory_set_part_prefix`

</details>

<details><summary>IDEA Classroom</summary>

- **Read:** `classroom_course_categories`, `classroom_duplicate_drafts`, `classroom_feedback_list`, `classroom_grade_protection_refusals`, `classroom_grade_revocation`, `classroom_hall_pass_events`, `classroom_hall_pass_state`, `classroom_html_retired_blocks`, `classroom_item_grade_protection`, `classroom_item_revisions`, `classroom_manages_section`, `classroom_needs_grading`, `classroom_posting_perfect_scores`, `classroom_presence_state`, `classroom_presentation_queue`, `classroom_preview_team_draw`, `classroom_public_attachment`, `classroom_public_reference`, `classroom_quick_post_file`, `classroom_quick_posts`, `classroom_section_roster` (class_roster), `classroom_signoff_queue`, `classroom_song_queue`, `classroom_student_overview`, `classroom_team_board`, `classroom_team_grading`, `classroom_team_plan`, `classroom_view_as_students`, `classroom_worksheet_latched`, `classroom_worksheet_past_manifests`
- **Undo:** `classroom_add_postings`, `classroom_add_team`, `classroom_approve_module`, `classroom_close_assignment` (close_assignment), `classroom_create_item`, `classroom_designate_instructor_key`, `classroom_draw_teams`, `classroom_duplicate_item` (duplicate_post), `classroom_feedback_post`, `classroom_feedback_reply`, `classroom_feedback_set_state`, `classroom_grade_direct`, `classroom_grade_submission`, `classroom_hall_pass_open_for` (open_hall_pass), `classroom_hall_pass_set_limits`, `classroom_html_retire_blocks`, `classroom_post_team_set`, `classroom_presentation_close`, `classroom_presentation_mark`, `classroom_presentation_move`, `classroom_presentation_reopen`, `classroom_quick_post_create`, `classroom_quick_post_set_important`, `classroom_rename_attachment`, `classroom_rename_instructor_attachment`, `classroom_rename_team`, `classroom_restore_grade`, `classroom_restore_revision`, `classroom_revoke_grade` (revoke_grade), `classroom_save_team_set`, `classroom_set_attachment_order`, `classroom_set_enrollment` (add_student), `classroom_set_grade_protection`, `classroom_set_html_assignment`, `classroom_set_instructor_attachment_order`, `classroom_set_instructor_resources`, `classroom_set_item_layout`, `classroom_set_item_order`, `classroom_set_item_pinned` (pin_post), `classroom_set_item_public`, `classroom_set_item_thumbnail_focus`, `classroom_set_item_unit`, `classroom_set_posting_perfect_score`, `classroom_set_published`, `classroom_set_rubric`, `classroom_set_section_active`, `classroom_set_section_thumbnail_shape`, `classroom_set_unit_order`, `classroom_swap_team_members`, `classroom_undesignate_instructor_key`, `classroom_update_enrollment`, `classroom_update_item`, `classroom_upsert_section`, `classroom_upsert_unit`
- **Asks first:** `classroom_archive_team_set`, `classroom_delete_attachment`, `classroom_delete_deck`, `classroom_delete_instructor_attachment`, `classroom_delete_item` (delete_post), `classroom_delete_section`, `classroom_delete_unit`, `classroom_feedback_remove`, `classroom_feedback_seen`, `classroom_feedback_update`, `classroom_grade_submissions`, `classroom_grade_team`, `classroom_hall_pass_close_by_id`, `classroom_html_unretire_blocks`, `classroom_import_roster`, `classroom_machine_tag_set`, `classroom_move_team_member`, `classroom_no_school_day_set`, `classroom_presentation_start`, `classroom_quick_post_take_down`, `classroom_remove_enrollment` (remove_student), `classroom_remove_posting`, `classroom_remove_team`, `classroom_set_item_thumbnail`, `classroom_set_team_style`, `classroom_signoff_decide`, `classroom_song_approve`, `classroom_song_reject`, `classroom_team_set_role`, `classroom_team_task_set_due`, `classroom_unpost_team_set`, `classroom_upsert_course`
- **By argument:** `classroom_save_instructor_response`: undo when $before.found, otherwise confirm, `classroom_set_assignment_spec`: undo when $before.found, otherwise confirm, `classroom_set_reference_spec`: undo when $before.found, otherwise confirm
- **Excluded (the reason is in the YAML):** `classroom_add_attachment`, `classroom_add_instructor_attachment`, `classroom_add_submission_file`, `classroom_deck_ingest_abandon`, `classroom_deck_ingest_begin`, `classroom_deck_ingest_claim_stage`, `classroom_deck_ingest_finish`, `classroom_deck_ingest_record`, `classroom_deck_upload_cancel`, `classroom_deck_upload_claim`, `classroom_deck_upload_start`, `classroom_delete_submission_file`, `classroom_mark_item_viewed`, `classroom_open_submission`, `classroom_presence_ping`, `classroom_quick_post_add_file`, `classroom_record_export`, `classroom_save_response`, `classroom_set_submission_file_caption`, `classroom_song_request`, `classroom_submit_assignment`, `classroom_team_progress`, `classroom_unsubmit_assignment`, `classroom_worksheet_latch_for`, `classroom_worksheet_latch`

</details>

<details><summary>IDEA Coin</summary>

- **Read:** `coin_admin_lookup`, `coin_alias_list`, `coin_auditor_queue`, `coin_donation_items_list`, `coin_economy_health`, `coin_export`, `coin_fine_roster`, `coin_fine_sections`, `coin_me`, `coin_my_page`, `coin_my_role`, `coin_my_stats`, `coin_no_shop_today`, `coin_public_leaderboard`, `coin_public_reasons`, `coin_public_reported_coins`, `coin_public_role_badges`, `coin_public_role_questions`, `coin_public_roles`, `coin_public_student`, `coin_public_transactions`, `coin_queue`, `coin_section_role_badges`, `coin_settings_get`, `coin_staff_scope`, `coin_student_stats`, `coin_voice_catalog`
- **Undo:** `coin_alias_set_amount`, `coin_log_extra_credit` (extra_credit_coins), `coin_log_pay_raise`, `coin_log_perfect_score`, `coin_log_property_damage_careless`, `coin_log_three_d_printing`, `coin_log_transaction`, `coin_voice_log`
- **Asks first:** `coin_admin_create_category`, `coin_admin_set_category_active`, `coin_alias_delete`, `coin_alias_promote`, `coin_bulk_log_students`, `coin_fine_log`, `coin_reverse_transaction`, `coin_settings_set_category`, `coin_settings_set`
- **By argument:** `coin_admin_adjust_balance` (adjust_balance): undo when p_amount > 0, otherwise confirm
- **Excluded (the reason is in the YAML):** `coin_admin_assign_contract`, `coin_admin_cancel_contract`, `coin_admin_edit_contract`, `coin_admin_reset_contract`, `coin_admin_restore_contract`, `coin_autopay_run`, `coin_banner`, `coin_buy_hall_pass_minutes`, `coin_contract_mark_done`, `coin_contract_post`, `coin_contract_self_claim`, `coin_contracts_admin`, `coin_digest_push_due`, `coin_hall_pass_minutes_mine`, `coin_hall_pass_minutes_quote`, `coin_market_board`, `coin_my_contract_claims`, `coin_my_contracts`, `coin_my_portfolio`, `coin_public_contracts`, `coin_public_stocks`, `coin_public_transfers`, `coin_role_self_apply`, `coin_stock_detail`, `coin_stocks_board`, `coin_stocks_tick`

</details>

<details><summary>IDEA Maps</summary>

- **Read:** `maps_editor_roster`, `maps_my_editor_grants`, `maps_search`
- **Undo:** `maps_editor_grant`, `maps_editor_revoke`
- **Asks first:** `maps_publish`

</details>

<details><summary>IdeaCAD</summary>

- **Read:** `ideacad_archive`, `ideacad_assembly`, `ideacad_direct_documents`, `ideacad_direct_folders`, `ideacad_shared_with_me`
- **Undo:** `ideacad_material_save_global`, `ideacad_material_set_retired`
- **Excluded (the reason is in the YAML):** `ideacad_set_direct_document_thumbnail`

</details>

<details><summary>market.yaml</summary>

- **Read:** `coin_banner_admin`, `coin_market_admin_listings`, `coin_market_cards_admin`, `coin_market_moderation`, `coin_stock_admin_list`, `coin_transfer_moderation`
- **Asks first:** `coin_banner_remove`, `coin_market_card_set_featured`, `coin_market_cards_feature_only`, `coin_market_listing_staff`, `coin_market_official_save`, `coin_market_resolve`, `coin_market_review_remove`, `coin_stock_admin_set`, `coin_transfer_remove_message`
- **By argument:** `coin_banner_save` (post_market_banner): undo when p_id is null, otherwise confirm

</details>

<details><summary>Notebook</summary>

- **Read:** `notebook_get_section_grid`, `notebook_review_student_notebook`, `notebook_reviewed_sections`, `notebook_view_as_notebook`
- **Undo:** `notebook_accept_entry`, `notebook_add_session_postings`, `notebook_admin_set_excusal`, `notebook_create_item_check_in`, `notebook_flag_entry`, `notebook_link_session_item`, `notebook_link_unit_item`, `notebook_resolve_entry`, `notebook_set_session_guidance`, `notebook_staff_restore_entry`, `notebook_staff_restore_note`, `notebook_unaccept_entry`, `notebook_unlink_session_item`, `notebook_unlink_unit_item`
- **Asks first:** `notebook_admin_delete_session`, `notebook_admin_override_entry`, `notebook_remove_session_posting`, `notebook_staff_delete_entry`, `notebook_staff_delete_note`
- **By argument:** `notebook_admin_upsert_session`: undo when p_id is null, otherwise confirm
- **Excluded (the reason is in the YAML):** `notebook_add_note`, `notebook_add_photo`, `notebook_create_entry`, `notebook_create_note_entry`, `notebook_delete_folder`, `notebook_edit_note`, `notebook_move_entries`, `notebook_seal_notes`, `notebook_upsert_folder`

</details>

<details><summary>People, feedback and the rest of the site</summary>

- **Read:** `admin_list`, `app_feedback_admin_list`, `app_feedback_rewards_list`, `app_feedback_spam_review`, `app_short_link_list`, `app_short_link_target`, `frc_can_review`, `frc_review_queue`, `is_admin`, `is_owner`, `profile_avatar_hold_status`, `profile_avatar_holds`, `profile_avatar_my_hold`
- **Undo:** `app_feedback_restore_statuses`, `app_feedback_set_horizon`, `app_feedback_set_status_many`, `app_feedback_set_status`, `app_short_link_upsert`, `frc_mark_complete`, `frc_unmark_complete`, `profile_avatar_hide`, `profile_avatar_restore`
- **Asks first:** `admin_grant`, `admin_revoke`, `app_feedback_edit`, `app_feedback_file` (file_site_feedback), `app_feedback_reward`, `app_feedback_spam_dismiss`, `app_feedback_spam_fine`, `app_short_link_delete`, `clear_fsp_session`
- **Excluded (the reason is in the YAML):** `app_feedback_submit`, `frc_quiz_grade`, `frc_quiz_start`, `idea_cert_sync`, `push_subscribe`, `submit_fsp_question`

</details>

<details><summary>Site routes (run in-process as him)</summary>

- **Read:** `/api/admin/files/upload-part` (upload_part), `/api/admin/files/upload` (start_upload), `/api/admin/test-accounts` (list_test_students), `/api/foundry/source` (read_foundry_source)
- **Asks first:** `/api/admin/files/attach` (attach_file), `/api/admin/files/foundry-cover` (set_foundry_cover), `/api/admin/files/foundry` (publish_foundry_app), `/api/admin/test-accounts/act` (act_as_test_student), `/api/admin/test-accounts/create` (create_test_student), `/api/armory/purge` (delete_project_forever), `/api/armory/sweep` (armory_storage_cleanup), `/api/certifications/award` (issue_certification), `/api/certifications/correct` (correct_certification), `/api/foundry/delete` (delete_foundry_app)
- **Excluded (the reason is in the YAML):** `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource/mcp`, `/.well-known/oauth-protected-resource`, `/_platform/[...asset]`, `/a/[appId]/[...path]`, `/admin/drive-connect/callback`, `/admin/drive-connect`, `/api/armory/blob-url`, `/api/armory/connect/exchange`, `/api/armory/connect/start`, `/api/avatar/[...path]`, `/api/certifications/evidence/[...path]`, `/api/certifications/evidence/sign`, `/api/certifications/export`, `/api/certifications/jobs/[job]`, `/api/certifications/package/export/[id]`, `/api/certifications/package/import`, `/api/classroom/attachment/[attachment_id]`, `/api/classroom/attachment/sign`, `/api/classroom/attachment`, `/api/classroom/deck/[deck_id]/[...path]`, `/api/classroom/deck`, `/api/classroom/delete-content`, `/api/classroom/export`, `/api/classroom/html-assignment-source/[itemId]`, `/api/classroom/instructor-attachment/[attachment_id]`, `/api/classroom/instructor-attachment/sign`, `/api/classroom/instructor-attachment`, `/api/classroom/item`, `/api/classroom/link-preview`, `/api/classroom/quick-post-file/[file_id]`, `/api/classroom/quick-post-file/sign`, `/api/classroom/quick-post-file`, `/api/classroom/signoff-request`, `/api/classroom/submission-file/[file_id]`, `/api/classroom/submission-file/sign`, `/api/classroom/submission-file`, `/api/classroom/thumbnail/[itemId]`, `/api/classroom/thumbnail/sign`, `/api/classroom/thumbnail`, `/api/coin/autopay`, `/api/coin/claim`, `/api/coin/digest-push`, `/api/coin/me`, `/api/coin/public`, `/api/coin/role-apply`, `/api/coin/signin`, `/api/feedback`, `/api/foundry-cover/[...path]`, `/api/greenline-track-publish`, `/api/notebook/add-note`, `/api/notebook/add-photo`, `/api/notebook/edit-note`, `/api/notebook/note`, `/api/notebook/photo/[photo_id]`, `/api/notebook/session-guidance`, `/api/notebook/upload`, `/api/tournament-push`, `/api/vanguard-feedback`, `/api/vanguard-run-state`, `/api/vanguard-run`, `/api/vanguard-save`, `/armory/[project]/file/[file]/version/[version]`, `/armory/download/[file]`, `/armory/get`, `/assignments/[slug]`, `/auth/callback`, `/b/[appId]/[versionId]/[...path]`, `/c/[appId]`, `/certifications/lesson/[lessonId]`, `/certifications/verify/public-key`, `/classroom/[sectionId]/duplicates/remove`, `/coins/[...path]`, `/connector/register`, `/connector/revoke`, `/connector/token`, `/dev/ai-level-badge-reference`, `/dev/cert-certification/lesson/[lessonId]`, `/dev/classroom-deck/f/[deck_id]/[...path]`, `/dev/classroom-deck/fixture`, `/dev/classroom-deck/ingest`, `/dev/classroom/normalize`, `/dev/coins/api/claim`, `/dev/coins/api/me`, `/dev/coins/api/public`, `/dev/coins/api/role-apply`, `/dev/coins`, `/dev/deploy-safety/slide`, `/dev/deploy-safety/upload`, `/dev/feedback/assignment`, `/dev/foundry-admin/refusal`, `/dev/foundry-mosaic/cover/[shape]`, `/dev/frc-quiz`, `/dev/html-instructor/copy/doc`, `/dev/maps-media/o/[...path]`, `/dev/notebook/normalize`, `/foundry/download/[appId]/[versionId]`, `/foundry/preview/[appId]/[versionId]/[...path]`, `/foundry/starter`, `/frc/[domain]/[unit]/quiz`, `/hx/[docId]/thumbnail`, `/hx/[docId]`, `/mcp/practice/oauth-protected-resource`, `/mcp/practice`, `/mcp`, `/sitemap.xml`, `/vanguard`

</details>

<details><summary>The connector itself</summary>

- **Read:** `connector_admin_audit`, `connector_admin_evals`, `connector_admin_gaps` (list_gaps), `connector_admin_state`, `connector_lookup`
- **Undo:** `connector_admin_set_gap`
- **Asks first:** `connector_admin_disconnect_all`, `connector_admin_disconnect`, `connector_admin_set_enabled`
- **Excluded (the reason is in the YAML):** `connector_audit_failure`, `connector_call`, `connector_endpoint_begin`, `connector_endpoint_finish`, `connector_eval_record`, `connector_report_gap`, `connector_request_log`

</details>

<details><summary>Tournaments</summary>

- **Read:** `tournament_reward_settlement`
- **Undo:** `tournament_add_entry_member`, `tournament_create` (create_tournament), `tournament_host_add_entry` (add_tournament_entry), `tournament_rename_entry_member`, `tournament_reorder_seed`, `tournament_update_entry`, `tournament_update`
- **Asks first:** `tournament_add_host`, `tournament_delete`, `tournament_generate_qual_pools`, `tournament_host_add_team`, `tournament_remove_entry_member`, `tournament_remove_entry`, `tournament_send_invite`, `tournament_set_entry_style`, `tournament_set_reward_rules`, `tournament_shuffle_seeds`
- **By argument:** `tournament_set_status`: confirm when $before.status = draft, otherwise undo
- **Excluded (the reason is in the YAML):** `tournament_join_entry`, `tournament_live_config_apply`, `tournament_live_config_preview`, `tournament_ping_entry`, `tournament_register_entry`, `tournament_respond_invite`, `tournament_start_match`, `tournament_submit_qual_result`

</details>

<details><summary>view-as.yaml</summary>

- **Read:** `view_as_history`
- **Asks first:** `test_account_retire`
- **Excluded (the reason is in the YAML):** `test_account_register`, `test_accounts_list`, `view_as_grant`

</details>

<!-- levels:end -->

## 8. Haiku first

Mr. Pina, 2026-10-17: he would rather run phone chats on Haiku 5.5, because it
answers fast, if Haiku can do the job. The design makes that the target rather
than a hope:

- **The model decides as little as possible.** Name matching, date parsing,
  safety levels, confirmation, repeat protection and the HTML orphan check all
  happen on the server. A weaker model cannot skip a confirmation or double an
  award, because neither is in its hands.
- **Few tools, plain words.** About twenty facade tools on the first hop; the
  long tail behind `site_find_tool` and `site_call`, whose results tell the
  model exactly what to call next.
- **Errors that say the next move.** Every refusal names what to ask him or
  which tool to call ("Two students named Daniel: Daniel Ruiz (209H Block 2),
  Daniel Ortega (209H Block 4). Ask which.").
- **The judge runs on Haiku 5.5.** The eval set (section 9) passes on Haiku
  5.5 or the gap is a defect in a description or a server rule, fixed there.
  Sonnet 5.5 and Opus 5.5 are the fallback when a request needs judgment, never
  the target.

## 9. The request log, a growing eval set, and gaps

Mr. Pina, 2026-10-17: the eval list cannot be fixed at fifty. Whatever he asks
that is not on it gets added; it is done with whatever the site already has;
and when nothing can do it, that is logged as feedback so it gets built into
the site later. Built by ledger 0401.

- **Every tool takes `said`**: his request in his own words, verbatim,
  required. The server writes it to `connector_requests` (request key, said,
  tools called, arguments, outcome: done, previewed, asked, refused, gap; the
  audit rows it produced; the model name when the client sends it), as him,
  through `connector_call`, same gates.
- **The eval set lives in the database**, `connector_evals`, seeded from the 50
  lines in `EVALS.md` with each one's expected tool path, level and proof query.
  A request whose normalized `said` matches no eval is appended as a new eval
  automatically, with the path that served it as its expected path and its
  outcome. `EVALS.md` is regenerated from the table by
  `tools/connector/evals/export.mjs`, so the file stays readable and the table
  stays the source.
- **When nothing can do it**, the model calls `report_gap(said, what_is_missing)`
  (its description says to, and `site_find_tool` says so when it finds no
  match), and the server also records a gap on its own whenever `site_call`
  names a function the registry does not have. A gap is a row in
  `connector_gaps`: what he asked, what was tried, status (`open`, `built`,
  `declined`), and the ledger that built it.
- **A new feedback section**, `/admin/feedback/connector`, beside the Armory and
  incidents tabs: open gaps first, each with his words and what was tried, a
  status control, and the eval rows it produced. The morning check lists open
  gaps, so they reach a Claude Code prompt without him re-asking. When a later
  ledger adds the missing function to the registry, the gap is marked `built`
  with that ledger number and its eval starts passing.
- **Replay without touching real data.** `https://ideabosco.com/mcp/practice`
  is the same server with one difference fixed by the URL, never by an argument:
  every write runs as a preview and nothing commits. A nightly scheduled task on
  Haiku 5.5 (created from chat once the practice connector is added) replays
  every eval through the practice connector and records pass or fail per eval
  in `connector_eval_runs`; a fail lists on `/admin/connector` and in the
  morning check. Reads replay for real; they write nothing.
- **The finish line** is unchanged in kind: every eval in the table passes from
  a fresh phone chat on Haiku 5.5, judged by rows, and the set keeps growing as
  he uses it.

## 10. Adding the connector in claude.ai (once per account, any device)

1. Open https://claude.ai/settings/connectors
2. **Add custom connector**. Name: `IDEA Website`. URL: `https://ideabosco.com/mcp`. Leave the OAuth client fields blank. **Add**.
3. **Connect**. The site opens; sign in with the admin Google account if asked; **Connect** on the consent card. Expected: the connector shows as connected and `list_classes` works in a new chat.
4. After ledger 0401, the same three steps once more with Name `IDEA Website (practice)` and URL `https://ideabosco.com/mcp/practice` (section 9).

## What 0400 built (2026-10-18)

Everything in sections 1 to 5 except the full overlay, which is 0401's. Where
the build differs from the text above, this is the record and the reason.

- **Transport.** `@modelcontextprotocol/sdk` 1.32.1 ships
  `WebStandardStreamableHTTPServerTransport`; `/mcp` uses it stateless
  (`sessionIdGenerator: undefined`, `enableJsonResponse: true`) with the SDK's
  low-level `Server`, whose tool handlers take raw JSON Schema (the registry's
  schemas are generated, not zod). No hand-written JSON-RPC handler was needed.
- **Overlay is compiled.** `vite build` has no YAML loader, so
  `tools/connector/overlay.mjs` compiles `registry/*.yaml` to
  `overlay.generated.json`; the YAML stays the only thing edited, `yaml` is a
  devDependency, and the coverage test fails on a stale JSON.
- **Facades are registry entries in `registry/tools.yaml`.** Most first-slice
  voice tools resolve names and read before they write, so they are facades
  with a `uses` list; each write takes its function entry's level, preview and
  undo. Function entries are `surface: call`, reached through `site_call`.
- **Confirm tokens are stored, not hashed from the preview.** A preview carries
  fresh ids and timestamps, so a hash over it could never be recomputed at
  commit. A random token whose sha256 sits in `connector_confirmations` beside
  the user, the tool and a hash of the exact arguments is single use and ten
  minutes long.
- **Rows written: in-progress xmin, not "xmin = the transaction id".** A write
  inside an exception block (every bulk coin function) lands in a
  subtransaction with its own id. The exact test is "visible and still in
  progress", with each 32-bit xmin widened around the call's own id;
  `tests/db/connector-xmin.test.ts` proves it, the naive equality missing the
  subtransaction row as its positive control. Deletions are not captured as
  rows written (a deleted row is gone from the transaction's view); the audit
  row still records the call and its result.
- **Five definer helpers are executable by `authenticated`.** `connector_call`
  is invoker, and an invoker cannot write a table no client role may touch, yet
  the audit row must be in the same transaction. The helpers refuse unless the
  caller is an admin AND `connector_call` stamped a transaction-local marker in
  the same transaction; a direct PostgREST call is its own transaction and is
  refused. `connector_call` is granted to `anon` too, so a signed-out call reads
  the inner function's own refusal text for text.
- **A non-admin through `connector_call`** gets the inner refusal when the
  inner call refuses, and "The IDEA Website connector is for site admins." when
  it would have worked; nothing lands either way.
- **`connector_registry` is synced by the server** from the compiled overlay
  (upsert, every ten minutes per instance), so 0401 needs no migration to add
  entries.
- **The admin page's switch and disconnects are definer functions** gated on
  `is_admin()` (`connector_admin_*`), called on the admin's own session, and
  reachable through `site_call` at the confirm level (evals 49 and 50).
- **Awards need a category.** The coin economy has no general "any amount,
  any reason" award (categories are data, `IDEA_COIN_V2.md`). `award_coins` and
  `fine_coins` ask for the category when it is not said and check a stated
  amount against the category's pricing; eval line 4 ("five coins for helping
  clean the shop") gets a question, not a write, until a fitting award category
  exists on `/coin-desk/settings`. That is Mr. Pina's call, not a code change.
- **A rubric said as "Accuracy 10" gets three plain bands** (full, half, none):
  the database requires three or four levels. The result says so.
- **`grade` returns the grade unless told to hold it,** and its undo puts back
  a previous direct score, or revokes a first grade; a grade that replaced a
  rubric-scored one has no automatic undo, and the result says so.
- **Two unowned files had to move with the routes.** `/mcp` and `/connector`
  are top-level route names, so 0271 reserves them as short links and
  `src/lib/short-links.ts` (and the two short-link tests' chains) name them; and
  the token endpoint's origin-less form POST is refused by SvelteKit's built-in
  CSRF check in production, so `svelte.config.js` turns that off and
  `hooks.server.ts` runs `connectorCsrfGuard`, the same rule with the two OAuth
  paths exempt.
- **Inventory, measured 2026-10-17 on `40e50d6`:** 377 distinct literal
  `.rpc('name')` names under `src/` (374 by a single-line grep, which misses
  three calls split across lines: `notebook_remove_session_posting`,
  `foundry_publisher_pending_count`, `tournament_create`), 102 `+server.ts`
  files, 337 pages, and 35 `.rpc(` call sites whose name is a variable and
  which no scanner can see. With 0400 in the tree: 382 functions, 109
  endpoints, 339 pages (`inventory.generated.json`).

## What 0401 built (2026-10-18)

Sections 7, 8 and 9 and the rest of section 2's overlay. Where the build
differs from the text above, this is the record and the reason.

- **Every function and route is answered for.** Measured 2026-10-18: the
  inventory holds 385 literal `.rpc('name')` names, 110 `+server.ts` files and
  340 pages. The overlay holds 400 function entries (the extra fifteen are
  functions a facade, an undo or a preview calls by name): 301 reachable, 288
  through `site_call` and 13 promoted to tools of their own, and 99 excluded
  with a written reason. Of the 110 routes, 6 are `call` entries and 104 are
  excluded by category (a file served, a sign-in step, a scheduled job, a
  student's own action, a game, or the same work as a function entry). The
  tool list is 36: 21 facades, 13 promoted entries, `site_find_tool` and
  `site_call`. The `pending` allowance is gone from the coverage check.
- **Routes run in-process as him.** `endpoints.ts` imports the six route
  modules by literal path and calls the handler with `locals.supabase` a client
  carrying the minted session and `locals.claims` naming him, so every gate in
  the route decides as on the site. No route gained a caller; the Foundry
  delete's storage sweep is still that route's own service-role read. A route
  change is audited by `connector_endpoint_begin` and `_finish` (0272) with the
  same repeat protection a function write has.
- **`level_when` can read the site before the write.** A condition names an
  argument (`p_amount > 0`) or a `$before` value the entry's own `before` read
  found, as him. Seven entries use it: the balance adjustment by amount;
  editing an existing challenge or check-in asks (the old wording is not kept)
  while a new one is undone by deleting it; and a first spec, a first
  instructor answer and opening a draft tournament ask, because nothing puts
  "never had one" or "draft" back, while replacing or moving one is undone.
- **Undo is computed from what was there.** An entry may read `before` (a
  table select or a read function) and its undo templates name `$before`,
  `$args`, `$result`, `$written` and `$user`; an undo may be several calls
  (`each`). A delete whose bytes live in Drive or Storage clears them only
  after the database half commits (`cleanup.ts`), the site's own order.
- **The extra log tables are synced, not migrated.** The tables a write
  entry's rows land in beyond 0270's 33 are listed in `log-tables.ts` and
  inserted by `syncRegistry` with the registry rows, insert only, so a later
  write entry needs no migration. 0272 names no subsystem's tables.
- **The request log, the saved requests and the gaps are written by definer
  functions that re-check `is_admin()`, not through `connector_call`** (0272).
  Section 9 said "through `connector_call`"; that path exists to give a write
  entry its audit row and its preview, and logging his words is neither: it
  runs once per tool call, outside the write's own transaction, so a refused
  write is still a logged request. The tables carry no client grant and no
  policy, exactly like the rest of `connector_*`.
- **`said` is required on every tool**, and the server logs it after the call
  with the outcome (`done`, `previewed`, `asked`, `refused`, `gap`) and the
  audit ids. Words are matched after lowercasing and stripping punctuation and
  apostrophes; a new wording becomes saved request 53, 54 and so on, with the
  tool that served it as its expected path.
- **The seed is 52 lines**: the fifty, plus 51 (adding to a balance runs at
  once) and 52 (a seating chart is a gap), as `EVALS.md` already listed. Lines
  31 and 39 are seeded as asks-first, not undo: marking feedback seen is a bulk
  stamp with no reverse, and a Foundry review is given once and cannot be
  re-reviewed.
- **Practice is fixed by the URL.** `/mcp/practice` is the same handler with
  `practice: true`; every write returns its preview, a confirm returns the
  token `practice` and pressing it previews again, reads are real, and nothing
  is logged (not the request, not a gap). Both URLs are listed as protected
  resources, so one sign-in covers either. The nightly replay is a scheduled
  task created from chat once the practice connector is added; it records each
  result through `record_eval_result` (`connector_eval_runs`), the one write
  practice makes on purpose.
- **`site_find_tool` answers at most five**, ranked, each with the exact
  `site_call` to make (the name and every argument as a placeholder), and when
  nothing matches it says to call `report_gap`.
- **The Connector tab** is `/admin/feedback/connector` (open gaps first, his
  words, what was tried, Built with a ledger number, Declined, and the saved
  requests each produced with their last replay), and `/admin/connector`
  gained a Requests section with a download that `export.mjs --json` turns
  into `EVALS.md`. The feedback area's layout puts the Connector key beside
  `FeedbackSourcesNav` (which, with the `/dev/feedback` harness, is outside
  this ledger and still lists three) and draws all four on the connector's
  own page.

## What 0416 built (2026-10-19)

Mr. Pina, 2026-10-19: the connector does everything he can do on the site by
hand, and it updates itself on every push, generated rather than guarded.

- **A fourth layer, generated.** `tools/connector/auto.mjs` writes
  `src/lib/server/connector/auto.generated.json` (and
  `endpoints.generated.ts` for route imports) for every function and route the
  hand overlay does not name: an admin action (its body reaches a staff gate,
  `tools/connector/gates.mjs`) becomes a `site_call` entry, `read` when it
  writes nothing and `confirm` otherwise, never `undo`; anything else is an
  exclusion with its reason. A hand entry always replaces a generated one.
  `.github/workflows/connector.yml` runs `npm run connector:build` on every
  push to `main` and commits what changed.
- **The inventory sees names passed through helpers.** A quoted string naming
  a public function a migration creates counts as a call; 253 functions were
  invisible to the `.rpc('name')` scan on 2026-10-19, the IDEA Market banner
  among them. On this tree: 623 functions called, 136 generated tools (29
  reads, 107 that ask first), 60 generated exclusions.
- **Hand entries for what he named.** The market banner (`post_market_banner`
  and its removal, with an undo for a new pin), the market's moderation,
  official cards and reviews, coin transfer messages, coin stocks, hall pass
  time (the coin settings), Armory team membership by email with a role, and
  the site's own feedback list: `list_site_feedback` (filters by status, fix
  soon or long term, app and date, and keeps each report short),
  `file_site_feedback` (0282's `app_feedback_file`, as him, asks first),
  status, and `feedback_screenshot` (a five-minute link signed as him).
- **Two root fixes.** A confirm whose arguments the server fills (an Armory
  `p_operation`) hashed a fresh uuid each call and was refused every time; the
  hash is now over what he gave and the commit reuses the preview's values. A
  function with two forms took no subset of its optional arguments; `site_call`
  now fits one form or says what is missing, and `app_feedback_admin_list`
  always sends all three.
- **`list_posts` names every class a shared post is in**, with a `shared` line
  saying an edit changes all of them.
