-- 0032_vanguard_run_state.sql
-- IDEA // VANGUARD: cross-device save/resume of an IN-PROGRESS run.
--
-- vanguard_saves (0002) syncs BETWEEN-run progression (upgrades, scores). This
-- table holds the current run's CHECKPOINT so a signed-in player can quit on one
-- device and resume the same run on another. It is a minimal, sector-boundary
-- snapshot (sector, score, loadout, coins/lives), written when a player launches
-- into a new sector and cleared when the run ends. One row per user, owner-scoped
-- exactly like vanguard_saves. The /api/vanguard-run-state endpoint (cookie auth
-- via locals.supabase) reads/writes/clears it; the game exposes capture/restore
-- hooks and the /vanguard injection drives the autosave + resume offer.
--
-- Apply manually in the Supabase SQL editor.

create table if not exists public.vanguard_run_state (
	user_id uuid primary key references auth.users (id) on delete cascade,
	data jsonb not null default '{}'::jsonb,
	updated_at timestamptz not null default now()
);

-- Owner creates and maintains their own row; DELETE is allowed here (unlike
-- vanguard_saves) because ending a run clears the checkpoint client-side.
revoke all on public.vanguard_run_state from anon, authenticated;
grant select, insert, update, delete on public.vanguard_run_state to authenticated;

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
