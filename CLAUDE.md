# CLAUDE.md

Guidance for Claude (and humans) working in this repository.

## What this is

`idea-app` is the authenticated foundation for the unified **IDEA portal** at
Bosco Tech. It will replace the existing static IDEA site (GitHub Pages) over
the coming phases. This repo is the new home; the old static repo is separate.

- **Stack:** SvelteKit + Supabase + Vercel
- **Repo:** https://github.com/mrpina-dev/idea-app
- **Local path:** `C:\idea-app`

## Access model

- **Public tier (no login):** open pages anyone can see. Today this is the
  landing page at `/`. Future public pages slot into this tier.
- **Gated tier (login required):** identity and any save features. Today this
  is `/dashboard`. Unauthenticated users hitting a gated route are redirected
  to `/`.
- **Roles:** `student`, `teacher`, `visitor`, derived from the sign-in email
  domain:
  - `@boscotech.edu` -> `teacher`
  - `@boscotech.net` -> `student`
  - anything else -> `visitor`
- **Role editing:** teachers can change other users' roles. No one can change
  their own role. This is enforced server-side (a guard trigger plus RLS), not
  in client code.
- **Extensible:** roles are intentionally open-ended. Adding a future role
  (for example `parent`) means extending the CHECK constraint and the
  `role_for_email` logic, not a rebuild.

## Auth

Server-side auth uses the current `@supabase/ssr` pattern (not the deprecated
`auth-helpers`):

- `src/hooks.server.ts` creates a per-request server client and runs the route
  guard. It validates sessions with `getClaims()`.
- `src/routes/+layout.server.ts` and `src/routes/+layout.ts` create the
  client for server and browser and expose `supabase` + `claims` to pages.
- `src/routes/auth/callback/+server.ts` handles the Google OAuth code
  exchange.

Sessions are available server-side, so route guards run on the server.

## Environment

Env vars are read via `$env/static/public`:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`

See `.env.example`. **Never hardcode keys.** Never commit `.env`.

## Supabase migration convention

- SQL lives in `supabase/migrations/`, sequentially numbered:
  `0001_*.sql`, `0002_*.sql`, ...
- Migrations are applied **manually in the Supabase SQL editor** (no automated
  migration runner yet).
- Migrations should be idempotent where practical (`create or replace`,
  `if not exists`, `drop ... if exists` before `create`).

## Working conventions

- **No em dashes in user-facing copy.** Use commas, periods, or "to" for ranges.
- **Intent-based, surgical edits.** Change what the task needs and no more.
- **Commit and push every session.** Do not leave work uncommitted.
- **Keep this file current.** When the app gains routes, tiers, roles, env
  vars, or conventions, update CLAUDE.md in the same change. This
  self-maintenance is part of the job.

## Scope guardrails

Current phase is the **foundation only**: Google login, profiles/roles
backend, and the public-vs-protected route split. No coin economy, no game, no
assignments yet. Build so those layer on cleanly later.
