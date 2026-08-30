---
title: "Auth"
date: 2026-06-20
branches: []
migrations: []
subsystems: ["Platform & access"]
record_order: 3
---

Server-side auth uses the current `@supabase/ssr` pattern (not the deprecated
`auth-helpers`):

- `src/hooks.server.ts` creates a per-request server client and runs the route
  guard. It validates sessions with `getClaims()`.
- `src/routes/+layout.server.ts` and `src/routes/+layout.ts` create the
  client for server and browser and expose `supabase` + `claims` to pages.
- `src/routes/auth/callback/+server.ts` handles the Google OAuth code
  exchange.

Sessions are available server-side, so route guards run on the server.

