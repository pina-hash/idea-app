-- 0048_fsp_item_opens.sql
-- FSP homepage open-state tracking: per-student first-open state for each of the
-- FSP section items (Day 1/Day 2 presentations, Live Q&A, Live Question Feed,
-- SolidWorks Add-In, IDEA-Blade Rulebook, FRC Interest Form).
--
-- One insert-only row per (student, item). `item_id` is the item's stable
-- assignment slug from the curriculum (e.g. 'fsp-day1', 'frc-interest'), text and
-- intentionally not a FK, so the FSP item list can change in code without a
-- migration (the same free-form convention as profiles.section_id).
--
-- ACCESS MODEL: a student writes ONLY their own state — this is a self-write, not
-- a staff cross-user write, so (unlike the graded GAUNTLET/FRC tables) a direct
-- RLS-scoped insert is the fitting path, no RPC. There is nothing forgeable here:
-- the row records "this student opened this link", never a grade, score, or
-- session. Reads are own-row too. There is deliberately NO update or delete grant
-- (first-open is permanent; opening again is a no-op via ON CONFLICT DO NOTHING),
-- mirroring the append-only spirit of the tour-state flag (0045). The web side
-- fails soft (empty opened-set, silent write failure) until this is applied.
--
-- Apply manually in the Supabase SQL editor.

create table if not exists public.fsp_item_opens (
	user_id uuid not null references auth.users (id) on delete cascade,
	item_id text not null,
	opened_at timestamptz not null default now(),
	primary key (user_id, item_id)
);

alter table public.fsp_item_opens enable row level security;

-- A student reads only their own open-state.
drop policy if exists "read own fsp item opens" on public.fsp_item_opens;
create policy "read own fsp item opens" on public.fsp_item_opens for select
	using (auth.uid() = user_id);

-- A student inserts only rows for themselves. No update/delete policy exists, so
-- an open-state can never be altered or removed once recorded.
drop policy if exists "insert own fsp item opens" on public.fsp_item_opens;
create policy "insert own fsp item opens" on public.fsp_item_opens for insert
	with check (auth.uid() = user_id);

-- Column-less grant: SELECT + INSERT only (no UPDATE/DELETE), so PostgREST can
-- never issue a mutating statement the policies would otherwise have to guard.
grant select, insert on public.fsp_item_opens to authenticated;
