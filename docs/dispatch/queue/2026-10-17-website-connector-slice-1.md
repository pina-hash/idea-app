---
id: 2026-10-17-website-connector-slice-1
repo: pina-hash/idea-app
chat: IDEA Website Connector
ledger: 0400
migration: 0270
model: opus-5.5
effort: high
size: L
owns: src/lib/server/connector/**, src/routes/mcp/**, src/routes/connector/**, src/routes/.well-known/**, src/routes/admin/connector/**, tools/connector/**, supabase/migrations/0270_*.sql, supabase/migrations/0271_*.sql, supabase/migrations/0272_*.sql, tests/connector-*, tests/db/connector-*, docs/connector/**, the dependency lines for the MCP SDK and a YAML parser in package.json and package-lock.json, the "THE IDEA WEBSITE CONNECTOR" section of CLAUDE.md, docs/prompt-ledger/entries/0400-*, its own docs/history/ entry, db:idea-supabase
after:
needs_go: no
go: no
status: done
started_at: 2026-10-17T23:35:00-07:00
finished_at: 2026-10-18T08:34:05Z
trigger_id: trig_01SuLKvoJobosth25qVDQPbS
queued_at: 2026-10-17T23:40:00-07:00
---
Before doing anything else: `git fetch origin main`, check out `origin/main` on a working branch, and confirm the committer identity is `Claude <noreply@anthropic.com>`. This is a solo session: you will rebase on `origin/main` and push `HEAD:main` once at the end, with the ledger entry in the same push.

Every statement below about the repo is a claim; check each one in the tree before relying on it.

Read first, in this order: `docs/connector/DESIGN.md` (the whole design; it is the spec and it is already decided), `docs/connector/EVALS.md`, `CLAUDE.md` sections "Access model", "Probing must reveal nothing", "Write path", "Verification standard", "Commands" and "Testing", `src/lib/server/armory/backend.ts` and `src/lib/server/armory/handlers.ts` (the session-minting pattern you reuse), `tests/db/harness.ts` and `tests/db/cluster.ts` (how a caller is impersonated), and `src/lib/classroom/html-assignment/` (the importer's manifest parser).

## Owns

You may write only: `src/lib/server/connector/**`, `src/routes/mcp/**`, `src/routes/connector/**`, `src/routes/.well-known/**`, `src/routes/admin/connector/**`, `tools/connector/**`, `supabase/migrations/0270_*.sql` (and `0271_*.sql`, `0272_*.sql` if needed), `tests/connector-*`, `tests/db/connector-*`, `docs/connector/**`, the dependency lines for the MCP SDK and a YAML parser in `package.json` and `package-lock.json`, a new "THE IDEA WEBSITE CONNECTOR" section in `CLAUDE.md`, `docs/prompt-ledger/entries/0400-*`, and your own `docs/history/` entry. Nothing else.

## Numbers

Ledger 0400. Migration 0270; 0271 and 0272 are yours too if the work needs more than one file. The highest migration on origin/main at issue was 0269.

## Audit phase (answer each from the tree before building)

1. Which `@modelcontextprotocol/sdk` version is current and does it ship a web-standard Streamable HTTP server transport usable from a SvelteKit `+server.ts` on Vercel (stateless, JSON responses, no session id)? If it does not, write the thin JSON-RPC handler yourself over the SDK's `McpServer`, in `src/lib/server/connector/transport.ts`, and say so in the history entry.
2. Does `vite build` on this repo tolerate `.yaml` imports, or must the overlay be loaded at build time by `tools/connector/` into a generated JSON? Pick whichever keeps `npm run check` and the Vercel build clean; the hand-written overlay stays YAML either way.
3. Does `auth.admin.generateLink` plus `verifyOtp` produce a session whose `is_admin()` is true for an `app_admins` email in the embedded cluster, or is minting only testable against Supabase? Design `ConnectorBackend` so the tests never need minting: the local backend runs `connector_call` with `request.jwt.claims` set, as `tests/db/harness.ts` does.
4. Confirm the orphan rule: `classroom_set_html_assignment` (0195) does NOT check that answered block ids survive a replacement. Confirm where `classroom_responses.block_id` lives and how postings of one item are enumerated.
5. Measure the inventory yourself (`.rpc('…')` names under `src/`, `+server.ts` files under `src/routes/`, `+page.svelte` files) and record the numbers with today's date in `inventory.generated.json`. The chat measured 374, 102 and 337 on `b0f523d`; a difference is reported, not hidden.

## The build

Build everything in DESIGN.md sections 1 to 5 except the full overlay, complete and refined, in the IDEA look (run the idea-design skill before the consent card and the `/admin/connector` page; both are instructor-facing, so no mascot GIFs). Outcomes:

- `POST https://ideabosco.com/mcp` is a working remote MCP server that claude.ai can add as a custom connector with no client fields filled in, sign in through the site's own Google session, and call. Discovery, `401` shape, CIMD and DCR, PKCE S256, opaque rotating tokens, `invalid_grant`, revocation, the 10-second budget on every OAuth endpoint, and the two gates that stop a student account, all as the design states.
- The registry: `tools/connector/inventory.mjs`, `tools/connector/schema.mjs` (reads `pg_proc` from the embedded cluster with every migration applied), the overlay files with full entries for every first-slice function and `pending: slice 2` for every other inventoried function and endpoint, and the single builder that emits the tool list. `npm run connector:build` regenerates the generated files; the coverage test fails on a stale one.
- `connector_call` in migration 0270 with preview (the `CONNECTOR_PREVIEW:` raise), commit, the audit row inserted first on a unique `request_key`, `connector_log_tables` seeded with every log, revision, transaction and event table plus every table the first-slice tools write, and `connector_audit_failure`. The `xmin` comparison against the current transaction id must be proven by a test, not assumed; if it cannot be made exact, record written rows another way (returning ids from the audit trigger path) and say which in the history entry.
- The first-slice facade tools named in DESIGN.md section 4, each with `describe`, `say` lines and argument names in his words; `find_student` against the rosters of the sections the caller teaches, with ambiguity returned as candidates; dates resolved in America/Los_Angeles; `replace_html_assignment` with the orphan refusal using the importer's own parser and the block diff in every result; `undo_last`; `connector_disconnect`; `site_find_tool` and `site_call` already wired so 0401 only fills the overlay.
- The three levels enforced server-side from the registry: `read` direct, `undo` logged with `dry_run` on request, `confirm` requiring a `confirm_token` from a preview of identical arguments within 10 minutes. Repeat protection from `request_id` or the 120-second derived key, with `again: true` as the deliberate second.
- `/admin/connector`: the switch, the connections list with Disconnect and Disconnect all, and the audit log view. Admin tier, 404 to everyone else.
- Every test in DESIGN.md section 5, and the Inspector run against the app on the local backend with the rows read back from the cluster. Record the Inspector commands and the rows read in the history entry.
- CLAUDE.md gains a section "THE IDEA WEBSITE CONNECTOR" in the house style stating the access model (acts as the token's user, service role in one file for two things), the three levels, the audit row, and that the registry is the only source of tools. DESIGN.md gets a "What 0400 built" note with anything that differed from the design and why.

Constraints: no new permission anywhere; no grant to `anon` or `authenticated` beyond `connector_call`, `connector_audit_failure` and the admin-page reads, each gated inside its body; the `connector_*` tables have no client policy at all; `is_admin()` is checked as the minted user on every request before any tool runs; nothing identifies Mr. Pina by a constant. Copy follows the Copy conventions: no em dashes, American spelling. Student-facing surfaces: none in this work.

## Checks, sized to the job

During the work: the targeted test files as you write them (`tests/connector-*`, `tests/db/connector-*`), then `npm run check`. At the end, ONE full `npm test` with its summary line read (it can exit 0 with a failure), and `npm run build` so the Vercel build is known clean. The browser harness only on the two new routes if `tools/browser-verify` has a spec shape that fits; otherwise skip it and say so.

## Landing

Rebase on `origin/main`, run the gate above, push `HEAD:main` once. Never force-push, never delete a remote branch. A real content conflict is a stop: push nothing and report it.

## Report

The pushed sha; what the audit found versus what was built; the counts measured with their date; the live site's footer sha if reachable (landed is not deployed; `migrate.yml` applies 0270 on push); the Inspector commands and the rows read back; and anything a person must do, written into the history entry as well. Set the queue entry `docs/dispatch/queue/2026-10-17-website-connector-slice-1.md` to `status: done` in the same push, per your launcher's instructions.

## Ledger entry (write it as `docs/prompt-ledger/entries/0400-website-connector-slice-1.md`, in the format of its neighbors)

Title: IDEA Website Connector, slice 1: sign-in, registry, safety levels, the phone tools.
Owns: (copy the Owns list above verbatim.)
Migration permitted: 0270, and 0271 to 0272 if needed. Highest on origin/main at issue: 0269.
