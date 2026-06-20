# idea-app

The authenticated foundation for the unified **IDEA portal** at Bosco Tech,
built with SvelteKit, Supabase, and Vercel. It will replace the existing
static IDEA site over the coming phases.

This phase is the foundation only: Google login, a profiles/roles backend, and
the public-vs-protected route split.

## Stack

- [SvelteKit](https://kit.svelte.dev/) (Svelte 5)
- [Supabase](https://supabase.com/) auth + Postgres, via `@supabase/ssr`
- [Vercel](https://vercel.com/) via `@sveltejs/adapter-vercel`

## Prerequisites

- Node.js 20+ (developed on Node 24)
- A Supabase project with **Google** enabled as an auth provider
- The SQL in `supabase/migrations/` applied in the Supabase SQL editor

## Environment variables

Copy `.env.example` to `.env` and fill in your Supabase project values
(Project Settings > API):

```
PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

Never commit `.env`. Only `.env.example` is tracked.

### Supabase auth setup

1. In the Supabase dashboard, enable the **Google** provider under
   Authentication > Providers and add your Google OAuth client credentials.
2. Add your site URL and the callback URL to the allowed redirect URLs:
   - Local: `http://localhost:5173/auth/callback`
   - Production: `https://your-domain/auth/callback`

## Database

Migrations are sequentially numbered in `supabase/migrations/` and applied
manually in the Supabase SQL editor. Run them in order, starting with
`0001_profiles.sql`. This creates the `profiles` table, the new-user trigger
that derives a role from the email domain, the existing-user backfill, and the
row-level security policies.

## Local development

```bash
npm install
npm run dev
```

The app runs at http://localhost:5173.

## Other scripts

```bash
npm run build     # production build (Vercel adapter)
npm run preview   # preview the production build locally
npm run check     # type-check the project
```

## Deployment

Deploy to Vercel as a SvelteKit project. Set `PUBLIC_SUPABASE_URL` and
`PUBLIC_SUPABASE_ANON_KEY` in the Vercel project environment variables, and add
the production `/auth/callback` URL to Supabase's allowed redirect URLs.

## Project layout

```
src/
  hooks.server.ts              # per-request Supabase client + route guard
  app.d.ts                     # App.Locals types (supabase, claims)
  routes/
    +layout.server.ts          # passes cookies + claims to the client
    +layout.ts                 # creates the Supabase client (server + browser)
    +layout.svelte             # refreshes data on auth state change
    +page.svelte               # public landing page + Google sign in
    auth/callback/+server.ts   # OAuth code exchange
    auth/error/+page.svelte    # sign in failure page
    dashboard/+page.server.ts  # protected loader + sign out action
    dashboard/+page.svelte     # protected dashboard
supabase/
  migrations/0001_profiles.sql # profiles table, role trigger, RLS
```
