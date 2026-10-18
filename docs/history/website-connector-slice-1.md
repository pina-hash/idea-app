---
title: "Ledger 0400: the IDEA Website connector, slice 1 -- sign-in, registry, safety levels, the phone tools (`claude/website-connector-slice-1`)"
date: 2026-10-18
branches: [claude/website-connector-slice-1]
migrations: ["0270", "0271"]
subsystems: [Connector, OAuth, MCP, Coins, Classroom, HTML assignments, Admin, Short links, Migrations]
---

Ledger 0400 (solo, through the session queue) built the first slice of the IDEA
Website connector that `docs/connector/DESIGN.md` specifies: a remote MCP server
at `https://ideabosco.com/mcp`, the site as its own OAuth server, one database
function every write goes through, the audit trail, the registry that is the
only source of tools, the first-slice voice tools, the admin page, and every
outside judge section 5 names. 0401 fills the rest of the overlay.

## The audit, answered from the tree

1. **The SDK.** `@modelcontextprotocol/sdk` 1.32.1 (npm, published
   2026-10-05) ships `WebStandardStreamableHTTPServerTransport`, which takes a
   web `Request` and answers a `Response`. Stateless
   (`sessionIdGenerator: undefined`) with `enableJsonResponse: true` it serves a
   SvelteKit `+server.ts` directly; no hand-written JSON-RPC handler was needed.
   It is used with the SDK's low-level `Server` rather than `McpServer`,
   because the registry's input schemas are generated JSON Schema and
   `McpServer.registerTool` wants zod. A split v2 package
   (`@modelcontextprotocol/server` 2.3.1) also exists; the prompt named the
   `sdk` package and that is what is installed.
2. **YAML.** `vite build` has no YAML loader, so the overlay stays YAML and
   `tools/connector/overlay.mjs` compiles it to `overlay.generated.json`, which
   the server imports. `yaml` 2.9.1 is a devDependency only.
3. **Minting.** The embedded cluster has no auth server, so
   `generateLink` plus `verifyOtp` is testable only against Supabase. The
   backend is an interface (`ConnectorBackend`) with a second implementation,
   `backend-local.ts`, that "mints" by naming the user and runs every call with
   `request.jwt.claims` set and `SET ROLE authenticated`, as `tests/db/harness.ts`
   does. Every test and the Inspector run use it; the Supabase half of
   `mintSession` is the Armory function's shape and is not exercised here.
4. **The orphan rule.** Confirmed: `classroom_set_html_assignment` (0195)
   snapshots and upserts with no look at stored answers.
   `classroom_responses.block_id` is keyed `(item_id, student_email, block_id)`
   on the canonical item, so "any posting" is every response for the item id;
   postings are `classroom_postings (item_id, section_id)`.
5. **The inventory, measured 2026-10-17 on `40e50d6` (origin/main at issue):**
   377 distinct literal `.rpc('name')` names under `src/`, not the chat's 374:
   a single-line grep (the chat's instrument, which reproduces 374) misses three
   calls split across lines, `notebook_remove_session_posting`,
   `foundry_publisher_pending_count` and `tournament_create`. 102 `+server.ts`
   files and 337 `+page.svelte` files, as the chat measured. 35 `.rpc(` call
   sites pass the name as a variable and are invisible to any scanner
   (`classroom_create_item` and `classroom_update_item` among them, called through
   `callWithDegrade`). With this ledger in the tree:
   382 functions, 109 endpoints, 339 pages, measured 2026-10-18 and recorded in
   `src/lib/server/connector/inventory.generated.json`.

## What was built

- **Migration 0270** (`0270_website_connector.sql`): eight `connector_*` tables
  (RLS on, no policy, no client grant, service_role only), `connector_call`
  (SECURITY INVOKER, preview and commit), five private helpers,
  `connector_audit_failure`, and five `connector_admin_*` functions for the
  admin page, with an apply-time self-check over this file's own objects.
- **Migration 0271**: `connector` and `mcp` join `_app_short_link_reserved`.
- **The OAuth server** (`src/lib/server/connector/oauth.ts` and the routes):
  both metadata documents, the 401 with `resource_metadata`, CIMD (fetched over
  https from a public host, required to name itself) and DCR, PKCE S256 only,
  five-minute single-use codes taken before they are checked, opaque 32-byte
  tokens stored as sha256, refresh rotation in one statement, `invalid_grant`
  for a dead refresh token, RFC 7009 revocation, and a nine-second budget on
  every endpoint. Redirects go only to Claude's callback or a loopback address,
  for every client however it registered.
- **The MCP route** (`mcp.ts`): bearer, switch, then `is_admin()` as the minted
  user on every request; a removed admin's connection is revoked there.
- **The registry**: `tools/connector/inventory.mjs`, `schema.mjs` (with
  `schema-query.mjs`, shared with the coverage test), `overlay.mjs`,
  `build.mjs` (`npm run connector:build`), `cluster.mjs`; the YAML overlay with
  full entries for 31 live functions, 2 exclusions with their reasons
  (`connector_call`, `connector_audit_failure`) and `pending: slice 2` for the
  other 355; the 109 endpoints, 82 pending and 27 excluded with their reason
  (the connector's own 7 routes and 20 dev harness routes); and `registry.ts`,
  the one builder.
- **The tools** (`tools.ts`, `engine.ts`, `resolve.ts`, `dates.ts`): the
  nineteen facades DESIGN.md section 4 names, `site_find_tool` and `site_call`.
- **`/admin/connector`** and the consent card at `/connector/authorize`, both in
  the site plate (the consent card wears `SITE_PLATE` by hand, so the site's
  one revert switch still governs it; it is outside the theme scope and stays
  dark).
- **`tools/connector/local-backend.mjs`** for the Inspector run.

## Decisions, and why

DESIGN.md's "What 0400 built" note carries each departure from the design with
its reason: the compiled overlay, facades as registry entries, stored confirm
tokens, the in-progress xmin test with 64-bit widening, the five helpers
executable by `authenticated` behind a transaction-local marker, the non-admin
passthrough, the server-synced `connector_registry`, the definer admin
functions, awards that need a category, default rubric bands, and grade's undo.

Two are worth restating here because a later session could undo them by
accident:

- **The rows-written read.** The first draft compared xmin to an epoch taken
  from the snapshot's xmax; it failed against the shared test cluster with
  "transaction ID ... is in the future", because a subtransaction's id can sit
  ABOVE the snapshot's xmax. The shipped form widens each 32-bit xmin to the
  64-bit id within 2^31 of the call's own top-level id. The transaction
  statistics (`pg_stat_get_xact_tuples_inserted`) were measured to be a
  superset, not exact: the per-backend pending counters can still hold a
  previous transaction's insert, so they are used only to skip untouched tables.
- **The CSRF exemption.** SvelteKit 2.66 refuses a cross-origin or origin-less
  form POST in production with no per-route switch. Claude's token request is
  exactly that. `trustedOrigins: ['*']` plus a guard that restates the rule
  with two exempt paths is the narrowest fix; a blanket off would open a
  same-site form post from a student bundle on the apps origin.

## Outside the Owns list

Forced by the design, each the smallest edit that keeps the suite honest:
`svelte.config.js` and `src/hooks.server.ts` (the CSRF guard);
`src/lib/short-links.ts` and the chains of `tests/short-link-reserved-names.test.ts`
and `tests/short-link-redirect.test.ts` (new top-level routes are reserved
names); one entry, with its reason, in the anon allowlist of
`tests/db/ideacad-grants-anon-execute-surface.test.ts` (`connector_call` is
granted to anon so a signed-out call reads the inner function's own refusal);
the `connector:build` script line in `package.json`; and the
`SUPABASE_SERVICE_ROLE_KEY` census in `CLAUDE.md` (six readers to seven, which
that line requires in the same edit).

## Measured

- **Mutation proof, 9 of 9 killed**, each restored byte-identically (md5):
  the non-admin refusal removed from `connector_call` (3 failed), everyone
  treated as admin there (18 failed), the MCP route keeping a removed admin,
  consent skipping the admin check, the CSRF guard exempting everything, `rpc`
  using the service client, the confirm gate skipped, the orphan refusal
  skipped, and the 120-second window ignored (2 failed). Judged by the summary
  line over stdout and stderr, never the exit code.
- **The connector test files**: `tests/connector-*.test.ts` (6 files) and
  `tests/db/connector-*.test.ts` (5 files plus the fixture), 116 tests.
- **The full suite, once, at the end** (after the rebase onto `15be5862`):
  843 files passed of 843, 15374 tests passed, read off its summary line. An
  earlier full run had five failing files: two were this change (the anon
  allowlist and a regex over the hooks sequence, both fixed), three were this
  checkout lacking `origin/integration` and history (fixed by fetching them).
- **`svelte-check`**: 0 errors, 33 warnings in 18 files before and after
  (re-derived with the placeholder environment exported, then sync).
- **`npm run build`**: clean on Linux in 67 s; the three `.well-known` routes,
  `/mcp` and `/connector/*` are in the Vercel route table.
- **The consent page**, `vite dev` against the local backend, measured in
  Chromium: no horizontal scroll at 375 (card 343 px) or 1440 (card 608 px), the
  sign-in key 44 px tall; an unknown client renders the problem card (200, no
  redirect); a bad response type 303s to the client's callback with
  `error=unsupported_response_type`; `/admin/connector` signed out is 404.

## The MCP Inspector run

```
node tools/connector/local-backend.mjs     # prints CONNECTOR_LOCAL_PG_URL and ACCESS_TOKEN
PUBLIC_SUPABASE_URL=http://localhost:54321 PUBLIC_SUPABASE_ANON_KEY=placeholder \
  CONNECTOR_BACKEND=local-pg CONNECTOR_LOCAL_PG_URL=<url> npx vite dev --port 5199
I="npx -y @modelcontextprotocol/inspector@2.11.0 --cli http://localhost:5199/mcp --transport http --header Authorization:Bearer\ <token>"
$I --method tools/list                                                     # 21 tools
$I --method tools/call --tool-name award_coins --tool-arg 'students=["Mateo"]' --tool-arg kind="Above and Beyond" --tool-arg amount=3 --tool-arg reason="helping clean the shop" --tool-arg dry_run=true   # preview
  ... the same without dry_run, request_id=insp-award-1                    # done
$I --method tools/call --tool-name create_post --tool-arg 'classes=["209H Block 2"]' --tool-arg kind=assignment --tool-arg title="Tolerance Check" --tool-arg points=20 --tool-arg due="Friday at 11:59" --tool-arg dry_run=true|false --tool-arg request_id=insp-post-1
$I --method tools/call --tool-name fine_coins --tool-arg 'students=["Daniel R"]' --tool-arg kind=Off-Task --tool-arg reason="phone out" --tool-arg dry_run=true|false --tool-arg request_id=insp-fine-1
  ... the commit again with the same request_id                            # repeated
$I --method tools/call --tool-name fine_coins --tool-arg 'students=["Daniel"]' ...   # ambiguous
```

The judge, read back from the cluster as its owner afterwards (Saturday
2026-10-17 in Los Angeles):

- `coin_transactions`: exactly two rows. `mateo.reyes@boscotech.net`,
  `above_and_beyond`, 3.00, "helping clean the shop"; `daniel.ruiz@boscotech.net`,
  `off_task_device_use`, -2.00, "phone out". Both `actor_email`
  `inspector@boscotech.edu`. The two previews, the repeat and the ambiguous call
  wrote nothing.
- `classroom_items`: exactly one, "Tolerance Check", assignment, 20 points,
  `due_at` 2026-10-24T06:59Z (Friday 23:59 PDT), published, author
  `inspector@boscotech.edu`.
- `connector_audit`: exactly three rows, all `via` claude, `status` done,
  level undo, keyed: award_coins / coin_log_transaction (1 row written, undo
  `coin_reverse_transaction`), create_post / classroom_create_item (2 rows,
  undo `classroom_delete_item`), fine_coins / coin_log_transaction (1 row, undo
  `coin_reverse_transaction`).
- `connector_registry`: the 31 live entries, synced by the first MCP request.

## Not verified

- **Minting against Supabase** (`auth.admin.generateLink` then `verifyOtp`),
  and therefore the whole route on a real deployment: no session here can reach
  production or a Supabase project. The local backend stands in for it.
- **claude.ai adding the connector.** The CIMD path is implemented to the
  published requirements and unit-tested against a fetched document shape; no
  real Claude client has connected.
- **The admin page and the consent card's signed-in states in a browser**: both
  need a Google session. Their loads and actions are driven by tests (consent
  404 to a student, the card for an admin); the page markup was type-checked
  and the signed-out consent state was rendered and measured.
- **The browser harness** has no spec shape for these two routes (it covers
  `/dev` routes, and these need a session), so it was not run.
- **Whether 0270 and 0271 are applied**: `migrate.yml` applies them on the push.

## What a person must do

1. Nothing before deploy: `migrate.yml` applies 0270, then 0271, on the push to
   `main`, and the site needs no new environment variable
   (`SUPABASE_SERVICE_ROLE_KEY` is already set for Armory).
2. Add the connector in claude.ai (DESIGN.md section 10): Settings, Connectors,
   Add custom connector, name `IDEA Website`, URL `https://ideabosco.com/mcp`,
   OAuth fields blank, Add, Connect, then Connect on the site's card.
3. Decide whether the coin economy should have an award category that takes
   any amount with a note (a row on `/coin-desk/settings`, no code): until it
   does, "give Mateo five coins for helping clean the shop" asks which category.
4. 0401 fills the overlay and removes the `pending` allowance from
   `tests/connector-coverage.test.ts`. Meanwhile **any session that adds a new
   `.rpc('name')` or `+server.ts` must add an overlay entry and run
   `npm run connector:build`**, or that test reddens.
