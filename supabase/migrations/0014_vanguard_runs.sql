-- 0014_vanguard_runs.sql
-- Per-user VANGUARD run history (append-only run log).
--
-- Each finished run by a signed-in player inserts one row here via the
-- /api/vanguard-run endpoint (fire-and-forget from the injected bootstrap).
-- Unlike vanguard_saves (one mutable row per user), this is an append-only
-- log: many rows per user, never updated or client-deleted. A future history
-- view reads it back ordered by (user_id, created_at desc). The field set is
-- intentionally lean and maps to values endRun() already computes.
--
-- Apply manually in the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.vanguard_runs (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users (id) on delete cascade,
	created_at timestamptz not null default now(),
	mode text,
	version text,
	score integer,
	sector integer,
	accuracy integer,
	time_s integer,
	kills integer,
	bosses integer,
	coins_earned integer,
	primary_weapon text,
	heavy_weapon text,
	death_cause text
);

-- Index for the future history view: a user's runs, newest first.
create index if not exists vanguard_runs_user_created_idx
	on public.vanguard_runs (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Privileges
-- Users append and read back their own runs, so clients get select/insert.
-- No update/delete: history is append-only. Row access is owner-only by RLS.
-- ---------------------------------------------------------------------------
revoke all on public.vanguard_runs from anon, authenticated;
grant select, insert on public.vanguard_runs to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security: a user may only see and append their own runs.
-- ---------------------------------------------------------------------------
alter table public.vanguard_runs enable row level security;

-- SELECT: own runs.
drop policy if exists "select own vanguard runs" on public.vanguard_runs;
create policy "select own vanguard runs"
	on public.vanguard_runs
	for select
	to authenticated
	using (user_id = (select auth.uid()));

-- INSERT: own runs.
drop policy if exists "insert own vanguard runs" on public.vanguard_runs;
create policy "insert own vanguard runs"
	on public.vanguard_runs
	for insert
	to authenticated
	with check (user_id = (select auth.uid()));

-- No UPDATE or DELETE policy: runs are append-only and not client-mutable;
-- rows cascade-delete from auth.users.
