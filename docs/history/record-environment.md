---
title: "Environment"
date: 2026-06-20
branches: []
migrations: []
subsystems: ["Platform & access"]
record_order: 4
---

Env vars are read via `$env/static/public`:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`

One var is read via `$env/dynamic/public` instead (runtime, so a missing value
never breaks the build and the page degrades gracefully):

- `PUBLIC_FSP_APPS_SCRIPT_URL` — the Apps Script endpoint the FSP tech-selection
  tool posts to (see "FSP tech selection" below).

Some vars are SERVER-ONLY, read via `$env/dynamic/private` (runtime; never in
the client bundle; a missing value degrades to a clear "not configured"
response, never a build break):

- `SUPABASE_SERVICE_ROLE_KEY` — used by exactly TWO modules: the GREENLINE
  community-track publish endpoint (`/api/greenline-track-publish`), which must
  run the game's real track validation in Node before any row is written (there
  is deliberately no client write path to `greenline_tracks`), and the
  tournament push sender (`src/lib/server/push.ts`), which reads
  `push_subscriptions` (own-row RLS) and claims `pair_notified_at` (no client
  write path). Set it in the Vercel project env for production. Nothing else
  may read it, and it must never gain a `PUBLIC_` prefix.
- **RETIRED: `COIN_API_KEY` and `COIN_LEDGER_URL`.** They configured the Google
  Sheets / Apps Script coin ledger, which is retired (see "IDEA Coin ledger:
  RETIRED" below). Nothing reads them; **remove both from the Vercel project
  env**. What they did is recorded in
  `docs/coin-economy/archive/legacy-system/README.md`.
- `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` +
  `GOOGLE_DRIVE_REFRESH_TOKEN` — the digital notebook's photo storage (see
  "Digital notebook" below). Auth is OAUTH ON BEHALF OF A REAL BOSCO TECH
  ACCOUNT, not a service account: the shared drive's Workspace policy blocks
  any identity outside the school's domain, which a service account is by
  definition, so the original `GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY` approach
  could never be granted access and is GONE. The refresh token is minted once
  by an ADMIN via the `/admin/drive-connect` consent flow and pasted into
  Vercel BY HAND (displayed once, never logged, never stored server-side).
  All three are read ONLY by `src/lib/server/notebook-drive.ts`; unset, the
  two `/api/notebook/*` routes answer 503 "not configured" and nothing else
  is affected. Optional `GOOGLE_DRIVE_NOTEBOOK_FOLDER_ID` overrides the
  target folder — a folder INSIDE the shared drive, whose current id is the
  module default, the env var being only an override. Setup steps are in
  `.env.example`. Set all of them in the Vercel project env; never `PUBLIC_`.
- `VAPID_PRIVATE_KEY` — signs every Web Push send (tournament match alerts).
  Read ONLY by `src/lib/server/push.ts`. Its public half is
  `PUBLIC_VAPID_PUBLIC_KEY` (`$env/dynamic/public`; safe in the client bundle,
  it is what browsers subscribe against). The two must come from ONE generated
  pair (`web-push generateVAPIDKeys`), and rotating the pair orphans every
  existing subscription (sends fail silently; users re-enable). Optional
  `VAPID_SUBJECT` (mailto:/https: contact, defaults to https://ideabosco.com).
  Unset keys degrade cleanly: the alerts UI hides and every send is a no-op.
  Set all of them in the Vercel project env. The push send path also requires
  `SUPABASE_SERVICE_ROLE_KEY` (subscription reads + the pair-claim write).

See `.env.example`. **Never hardcode keys.** Never commit `.env`.

