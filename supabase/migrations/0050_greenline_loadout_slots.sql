-- 0050_greenline_loadout_slots.sql
-- GREENLINE: named loadout save slots (up to 5 builds per user), extending the
-- single-build model from 0049.
--
-- 0049 gave each user exactly ONE stored build (greenline_loadouts, PK user_id),
-- which is the ACTIVE/working build the race screen actually races with. This
-- migration keeps that row as the active build (so 0049's fail-soft race path is
-- untouched) and layers named save slots on top:
--
--   1. greenline_loadouts gains a nullable active_slot: which named slot the
--      working build was last loaded from / saved into (null = a custom,
--      unsaved working build). The row still holds the live archetype/parts the
--      game reads, so nothing about racing changes.
--
--   2. greenline_loadout_slots holds up to 5 named builds per user, PK
--      (user_id, slot) with slot in [0,5). A pure owner-scoped self-write, the
--      SAME pattern as greenline_loadouts / vanguard_saves: a named build only
--      affects its owner and nothing is forgeable, so direct client
--      select/insert/update/DELETE under owner RLS is correct (unlike the
--      single loadout, slots are removable, hence the delete grant).
--
-- Both archetype and part ids stay free-form text/jsonb (the 0049 doctrine): the
-- catalog lives in code (src/lib/greenline/loadout.ts) and the client
-- validates + fails soft on unknown ids (normalizeLoadout / parseLoadout).
--
-- Apply manually in the Supabase SQL editor, after 0049.

-- ===========================================================================
-- 1. Active-slot pointer on the working build
-- ===========================================================================
alter table public.greenline_loadouts
	add column if not exists active_slot smallint;

-- ===========================================================================
-- 2. Named loadout slots (up to 5 per user, owner-scoped self-write)
-- ===========================================================================
create table if not exists public.greenline_loadout_slots (
	user_id uuid not null references auth.users (id) on delete cascade,
	-- Slot index 0..4. A small fixed grid of named builds, not an unbounded
	-- list; the CHECK is the hard cap so a client cannot spill past 5 slots.
	slot smallint not null check (slot >= 0 and slot < 5),
	-- Player-given build name. Trimmed/validated client-side; never empty here.
	name text not null,
	-- Same shape as greenline_loadouts: archetype id + one part id per slot.
	archetype text not null,
	parts jsonb not null default '{}'::jsonb,
	updated_at timestamptz not null default now(),
	primary key (user_id, slot)
);

-- A user's own slots, in slot order (the only access path the client needs).
create index if not exists greenline_loadout_slots_user_idx
	on public.greenline_loadout_slots (user_id, slot);

-- Privileges: users create, overwrite, and remove their own named builds, so
-- clients get select/insert/update/delete. Row access is owner-only by RLS.
revoke all on public.greenline_loadout_slots from anon, authenticated;
grant select, insert, update, delete on public.greenline_loadout_slots to authenticated;

alter table public.greenline_loadout_slots enable row level security;

drop policy if exists "select own greenline slots" on public.greenline_loadout_slots;
create policy "select own greenline slots"
	on public.greenline_loadout_slots
	for select
	to authenticated
	using (user_id = (select auth.uid()));

drop policy if exists "insert own greenline slots" on public.greenline_loadout_slots;
create policy "insert own greenline slots"
	on public.greenline_loadout_slots
	for insert
	to authenticated
	with check (user_id = (select auth.uid()));

drop policy if exists "update own greenline slots" on public.greenline_loadout_slots;
create policy "update own greenline slots"
	on public.greenline_loadout_slots
	for update
	to authenticated
	using (user_id = (select auth.uid()))
	with check (user_id = (select auth.uid()));

drop policy if exists "delete own greenline slots" on public.greenline_loadout_slots;
create policy "delete own greenline slots"
	on public.greenline_loadout_slots
	for delete
	to authenticated
	using (user_id = (select auth.uid()));
