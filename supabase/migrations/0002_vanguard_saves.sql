-- 0002_vanguard_saves.sql
-- Per-user cloud saves for the VANGUARD game.
--
-- The game (served at /vanguard/) keeps all of its progress in browser
-- localStorage under `vanguard_*` keys. When a user is signed in, the
-- /vanguard endpoint seeds those keys from this table on load, and an injected
-- sync script POSTs changes back to /api/vanguard-save. Each user owns exactly
-- one row holding a JSON snapshot of their `vanguard_*` keys.
--
-- Apply manually in the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.vanguard_saves (
	user_id uuid primary key references auth.users (id) on delete cascade,
	data jsonb not null default '{}'::jsonb,
	updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Privileges
-- Unlike profiles, users create and maintain their own save row, so clients
-- get select/insert/update. Row access is restricted to the owner by RLS.
-- ---------------------------------------------------------------------------
revoke all on public.vanguard_saves from anon, authenticated;
grant select, insert, update on public.vanguard_saves to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security: a user may only see and write their own save.
-- ---------------------------------------------------------------------------
alter table public.vanguard_saves enable row level security;

-- SELECT: own save.
drop policy if exists "select own vanguard save" on public.vanguard_saves;
create policy "select own vanguard save"
	on public.vanguard_saves
	for select
	to authenticated
	using (user_id = (select auth.uid()));

-- INSERT: own save.
drop policy if exists "insert own vanguard save" on public.vanguard_saves;
create policy "insert own vanguard save"
	on public.vanguard_saves
	for insert
	to authenticated
	with check (user_id = (select auth.uid()));

-- UPDATE: own save.
drop policy if exists "update own vanguard save" on public.vanguard_saves;
create policy "update own vanguard save"
	on public.vanguard_saves
	for update
	to authenticated
	using (user_id = (select auth.uid()))
	with check (user_id = (select auth.uid()));

-- No DELETE policy: saves are not client-deletable; they cascade from
-- auth.users.
