---
title: "IDEA Armory lane B, the ideabosco.com side: `/armory` pages, the connect flow and blob-url endpoints built to the agent's contract at idea-armory `b18791d`, and the schema as a PROPOSED file outside `supabase/migrations/` (`claude/trusting-bardeen-buv6f8`, no migration)"
date: 2026-10-06
branches: [claude/trusting-bardeen-buv6f8]
migrations: []
subsystems: ["IDEA Armory", "Auth", "Tooling"]
---

Lane A shipped the Windows agent (pina-hash/idea-armory, release `v0.1.0`, built from
`b18791d`). This is lane B: everything ideabosco.com serves to it, and the pages a student
uses beside it. Authorities were idea-armory `server/sql/001`-`004`,
`docs/agent/CONTRACT.md` and `docs/agent/CLIENT.md` at `b18791d`; where the contract and
the shipped agent disagreed, the agent's code won, and every disagreement is in
`docs/armory/2026-10-06-B.md`.

## What changed

- **`docs/armory/proposed/NNNN_armory.sql`**, not a migration. `migrate.yml` applies the
  lowest unapplied file in `supabase/migrations/` to production on every push to `main`
  (checked: `on: push: branches: [main]`, no path filter), so the schema waits for a
  number and Mr. Pina's approval (decision 46, armory-migration-number-and-approval).
  It is 001-004 merged, plus `armory_connect_codes` (hash, user, email, challenge, state,
  device name, expiry, used; RLS on, no policy, `select, insert, update` to `service_role`
  only) and `armory_change_feed` joining `supabase_realtime` under the 0062 guard.
- **`tests/db/armory-proposed.ts`**, the test-only loader: it hands `startTestDb` a
  `../../docs/...` path, which the harness resolves relative to `supabase/migrations`, so
  the file is read in place and never copied. The suite asserts no committed migration
  names `armory` afterwards.
- **The three endpoints** (`src/routes/api/armory/*`), thin wrappers over
  `$lib/server/armory/handlers.ts`, which takes its collaborators from
  `$lib/server/armory/deps.ts` so a test hands the REAL route a fake Supabase.
- **`$lib/server/armory/sigv4.ts`**, the TypeScript port of `SigV4Presigner.cs`, pinned to
  the AWS published presign example (signature `aeeed9bb...d404`).
- **`$lib/server/rate-limit.ts`**: idea-app had no application-side limiter (the feedback
  box limits inside the database), so this is a small in-memory sliding window, per
  instance. The code's own entropy and two-minute life are the real defence.
- **The pages** under `src/routes/armory/**`, components in `$lib/armory/`, one stylesheet
  (`armory.css`, every class `ar-`, site tokens only, no grid), and `/dev/armory` with
  every state. `/armory` joins `SITE_PLATE_PREFIXES` (and `/dev/armory` the dev list) so it
  wears the site plate and Space White; `tests/theme-tokens.test.ts`'s policy literal
  gained `/armory`. Nothing in the launcher or shared navigation names Armory.
- **`/armory/download/<file>`** streams the latest release's asset from the private repo
  with `ARMORY_RELEASES_TOKEN`; the asset hop is `redirect: 'manual'` and the signed URL is
  fetched without the token.

## The load-bearing decisions

1. **The grant hole in idea-armory's 003 is closed in the merged file, not copied.** 001
   to 003 revoked the internal helpers (`armory_add_change`, `armory_replay`,
   `armory_remember`, `armory_require_device`) from `public` and `anon` only. On a hosted
   project the default privileges write a DIRECT `authenticated` grant (CLAUDE.md, the
   0166 shape), so any signed-in student could have written change-feed rows or receipts
   into any project. Here every helper is revoked from `authenticated` too; the apply-time
   self-check refuses the file if one is not.
2. **No `create extension pgcrypto`.** `gen_random_uuid()` is core, nothing calls a
   pgcrypto function, and the apply tool refuses extension DDL.
3. **Check order is the agent's fake site's**, not just the contract's list of statuses:
   blob-url 401, 400, 403, 403, 503, 200; start 401, 429, 429, 400, 303; exchange 429,
   400, 401, 429, 401, 410, 401 (wrong verifier consumes the code), 200. A backend that
   cannot be reached is 503 `armory_unavailable`, which the agent reads as offline.
4. **`/armory` is NOT in `authedPrefixes`.** The prefix guard redirects to `/`, which
   would drop the connect link's port, state and challenge. Each page renders a sign-in
   panel that returns to the same address through `/auth/callback?next=`.
5. **The confirm page posts a native form**, not fetch: the browser must follow the 303
   to `http://127.0.0.1:<port>/callback`, and a form does that with no script. The start
   route accepts JSON (the contract's shape, what the fake browser sends) and urlencoded.
6. **The redirect target is built from a port only** and then checked as TEXT as well as
   parsed (`isLoopbackCallback`), because a URL parser normalises `2130706433` and
   `0x7f.0.0.1` to 127.0.0.1.
7. **"Offline device" is "has gone quiet".** The schema has no heartbeat (the agent's
   polling writes nothing), so the page says a computer holding a file has written
   nothing to the change feed for two hours, derived from `payload.device_id`, and says
   it may be off. It never claims a computer IS offline.
8. **"Synced" means the file has a current version on the server**; a file with none is
   "Waiting for its first upload". A website cannot see a computer's local folder.
9. **People are shown by the first part of their address** (`ana.reyes`), full address
   beside it in the members list. Members already read each other's addresses through
   `armory_members`' RLS, so this discloses nothing new; other profiles are not readable.
10. **The last mentor is offered no Remove**, because 004 refuses it and a control whose
    only answer is a refusal is not offered.

## What was measured

- `tests/db/armory-proposed.test.ts`: 21 tests on the whole chain (every committed
  migration behind the fixture completion) plus the proposed file. Mutations, each
  restored byte-identically (md5 `d9e76f6f...` before and after): `armory_projects_read`
  `using (true)` reddened 1; the helpers granted back to `authenticated` and a select
  grant on `armory_connect_codes` to `authenticated` were both REFUSED AT APPLY by the
  file's own self-check; the stale-parent branch removed reddened 1.
- Endpoint mutations (`tests/armory-endpoints.test.ts`, `-connect-redirect`, `-releases`):
  the text half of the loopback check removed reddened 4 of 56 (the parse half still
  caught the rest, which is the point of two layers); membership off 1; the GET hash
  check off 2; verifier checked before consuming 1; the token forwarded to the signed
  host 1. All restored and md5-checked.
- `npm run verify:browser -- --route armory`: 2 route/width runs, 74 measurements, 0
  outside threshold (contrast 6.06 to 7.91:1, every control at least 44px, 0 console
  errors).
- A real `npm run build` with sentinel values in every Armory secret: 0 client files
  contain any sentinel, `SUPABASE_SERVICE_ROLE_KEY`, `ARMORY_R2_`,
  `ARMORY_RELEASES_TOKEN`, `service_role` or `armory_connect_codes`; the positive controls
  (the server output names them; the client bundle does contain the Armory pages) held.
- `svelte-check`: 0 errors, 37 warnings in 20 files (31/5/1), the baseline.
- 26 screenshots in `docs/armory/screens/` (13 states at 1440 and 375), each looked at;
  0px of horizontal scroll on every one.

## Not verified

- No real Supabase: `generateLink` plus `verifyOtp` minting an independent session, the
  realtime channel, and the RPCs through PostgREST were never exercised against a live
  project. The membership and device SQL is proven on Postgres; the supabase-js calls are not.
- No real R2: the presigner matches AWS's vector, but no URL was put to Cloudflare. Whether
  R2 honours a signed `content-length` on a presigned PUT is believed, not measured.
- The agent itself was not run (no .NET in this container); its fixtures were ported.
- Streaming a 36 to 50 MB asset through a Vercel function was not measured; if the
  platform's response limit refuses it, the fix is to 302 the browser to GitHub's signed
  URL, which carries no token.
- Edge on Windows following an https form POST's 303 to `http://127.0.0.1`: Chromium
  treats loopback as potentially trustworthy, so no mixed-form warning is expected; not
  seen on a real machine.

## Deferred

- Expired connect-code rows are never deleted (the service role has no delete grant, on
  purpose). A sweep is a later decision.
- `armory_project_files` has no side-version count, so the page reads
  `armory_side_versions` (RLS-scoped) for the chips; a projection would be one round trip.
