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
function listed under `pending: slice 2` (a reason the coverage check accepts
until 0401 lands and removes the allowance).

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
  has a tool, a `call` entry, an `exclude` reason or (until 0401) `pending`;
  every overlay entry names something that exists. Counts carry their date.
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
  level_when: [{if: "amount > 0", level: undo}, {else: confirm}]
```

`level_when` is evaluated by the server on the resolved arguments, never by the
model. Any entry may use it; an entry without it has one `level`.

| Family | read | undo (runs, logged) | confirm (asks first) | excluded (reason) |
|---|---|---|---|---|
| Classroom posts and units | feed, item, revisions, roster, overview, perfect scores | create post or quick post, publish, pin, order, unit, layout, thumbnail, points, due, spec, rubric, restore revision, replace HTML (with the orphan refusal) | delete item, unit, section or deck; remove posting; remove enrollment; import roster; quick post take-down | presence ping, mark viewed, view-as, worksheet latch (browser instruments) |
| Grading, answers, feedback | grades, answers, feedback list, instructor responses | grade, regrade, revoke grade, close or reopen, feedback post, reply, state, seen; instructor response; designate key | delete feedback; bulk grade with no per-row preview | export record (a download) |
| Coins | balance, stats, leaderboard, lookup, export, settings read | award, fine, extra credit, pay raise, 3D print, property damage, reverse, queue, payday, digest, adjust balance UP | adjust balance DOWN or to zero, settings, categories, roles, contracts, bulk log | autopay run, digest push (cron) |
| Hall pass | state, events | open, close, limits | | |
| Tournaments | brackets, standings, matches | create, set up, name, seed, schedule | delete | advance match, enter score (live operation, out of scope) |
| Foundry | queue, versions, source read | approve, reject, publish, unpublish, gallery | delete, purge | upload bytes (a file, not a function) |
| Maps | map, revisions, search log | edit, publish, grants | delete | |
| Armory | projects, files, versions, members, incidents | membership, roles, project settings | purge, sweep, break locks, delete forever | connect flow (another device's sign-in) |
| Certifications | certs, events, verify | record event, revise | issue, revoke (signed public record) | sync jobs (cron) |
| Notebook | entries, sessions, check-ins, admin log | review, grade, check-in edits | delete | Drive connect (interactive) |
| IdeaCAD | documents, rules | rule revisions, document settings | delete document | |
| GAUNTLET | challenges, runs, reviews | author, publish, review, plausibility floor | delete challenge | room hosting (live) |
| GREENLINE | posts, queue | moderation decisions | delete | |
| People, admin | profiles, admins, feedback (all users) | avatar moderation, feedback state and reply, display settings, hall pass limits | add or remove an admin, delete feedback | push subscriptions (a device's) |
| FRC, FSP | rosters, interest, completions | completion overrides, gate reviews | | |
| Connector | audit log, connections | | disconnect all, switch off | |

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
