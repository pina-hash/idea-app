-- 0037_vanguard_run_state_per_mode.sql
-- IDEA // VANGUARD: cross-device run resume, ONE saved run per game mode.
--
-- Supersedes 0032, which keyed vanguard_run_state on user_id alone (one row per
-- user, so a HARDCORE checkpoint clobbered a saved NORMAL run and vice versa).
-- The checkpoint is ephemeral, minimal, sector-boundary data, so it is safe to
-- drop and recreate: this migration DROPs the table (cascade) and rebuilds it
-- with a COMPOSITE primary key (user_id, mode) so each user holds one in-progress
-- run per mode. The /api/vanguard-run-state endpoint upserts on (user_id, mode),
-- deletes a single mode's row, and lists all of a user's saved runs; the
-- /vanguard injection exposes them to the game's title screen for a per-mode
-- RESUME card.
--
-- Owner-scoped exactly like vanguard_saves (0002): a user only ever sees and
-- writes their own rows, enforced by RLS. Apply manually in the Supabase SQL
-- editor. Ephemeral, so no data preservation is attempted.

-- ---------------------------------------------------------------------------
-- Table (composite PK: one run per user per mode)
-- ---------------------------------------------------------------------------
drop table if exists public.vanguard_run_state cascade;

create table public.vanguard_run_state (
	user_id uuid not null references auth.users (id) on delete cascade,
	mode text not null,
	data jsonb not null,
	updated_at timestamptz not null default now(),
	primary key (user_id, mode)
);

-- ---------------------------------------------------------------------------
-- Privileges: owner creates and maintains their own rows. DELETE is allowed
-- (unlike vanguard_saves) because ending a run clears that mode's checkpoint.
-- ---------------------------------------------------------------------------
revoke all on public.vanguard_run_state from anon, authenticated;
grant select, insert, update, delete on public.vanguard_run_state to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security: a user may only see and write their own run states.
-- ---------------------------------------------------------------------------
alter table public.vanguard_run_state enable row level security;

drop policy if exists "select own vanguard run state" on public.vanguard_run_state;
create policy "select own vanguard run state"
	on public.vanguard_run_state
	for select
	to authenticated
	using (user_id = (select auth.uid()));

drop policy if exists "insert own vanguard run state" on public.vanguard_run_state;
create policy "insert own vanguard run state"
	on public.vanguard_run_state
	for insert
	to authenticated
	with check (user_id = (select auth.uid()));

drop policy if exists "update own vanguard run state" on public.vanguard_run_state;
create policy "update own vanguard run state"
	on public.vanguard_run_state
	for update
	to authenticated
	using (user_id = (select auth.uid()))
	with check (user_id = (select auth.uid()));

drop policy if exists "delete own vanguard run state" on public.vanguard_run_state;
create policy "delete own vanguard run state"
	on public.vanguard_run_state
	for delete
	to authenticated
	using (user_id = (select auth.uid()));
