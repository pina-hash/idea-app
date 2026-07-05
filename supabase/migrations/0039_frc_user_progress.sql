-- 0039_frc_user_progress.sql
-- FRC Training progression backbone: per-user unit completion.
--
-- Records, per user, which FRC Training units are complete, keyed by unit id
-- (the registry's stable ids, e.g. 'MDM-1'), with a completion timestamp. This
-- is the durable half of the progression system; the pure unlock + rank logic
-- lives in the registry (src/lib/frc/track.ts) and the client seam in
-- src/lib/frc/progression.ts. Everything fails soft on the web side until this
-- is applied (loadUserProgress swallows the missing-table error and returns an
-- empty set, so the track reads as "nothing complete yet").
--
-- Access model, riding the existing patterns (0001):
--   * students read their OWN completion rows;
--   * teachers read ALL rows and may mark/unmark ANY student's completion, the
--     same "teachers update any profile" trust used for the pathway roster
--     (via is_teacher()). This is the interim, mentor-verified completion path
--     until auto-gates (quiz / GAUNTLET) land; those will call the same
--     markUnitComplete seam.
--   * writes are also allowed for a user's own rows, so a future auto-gate can
--     record the signed-in student's own completion through the seam.
--
-- Apply manually in the Supabase SQL editor.

create table if not exists public.frc_user_progress (
	user_id uuid not null references auth.users (id) on delete cascade,
	unit_id text not null,
	completed_at timestamptz not null default now(),
	primary key (user_id, unit_id)
);

-- Clients read/insert/delete; row visibility + write authority is enforced by
-- the RLS policies below. No UPDATE grant: re-marking is an idempotent insert
-- (ON CONFLICT DO NOTHING), so completed_at keeps its first value.
revoke all on public.frc_user_progress from anon, authenticated;
grant select, insert, delete on public.frc_user_progress to authenticated;

alter table public.frc_user_progress enable row level security;

-- SELECT: own rows.
drop policy if exists "frc progress select own" on public.frc_user_progress;
create policy "frc progress select own"
	on public.frc_user_progress
	for select
	to authenticated
	using (user_id = (select auth.uid()));

-- SELECT: teachers read all (the dashboard override view).
drop policy if exists "frc progress select teacher" on public.frc_user_progress;
create policy "frc progress select teacher"
	on public.frc_user_progress
	for select
	to authenticated
	using (public.is_teacher());

-- INSERT: own completion, or a teacher marking any student's.
drop policy if exists "frc progress insert" on public.frc_user_progress;
create policy "frc progress insert"
	on public.frc_user_progress
	for insert
	to authenticated
	with check (user_id = (select auth.uid()) or public.is_teacher());

-- DELETE: own completion, or a teacher unmarking any student's.
drop policy if exists "frc progress delete" on public.frc_user_progress;
create policy "frc progress delete"
	on public.frc_user_progress
	for delete
	to authenticated
	using (user_id = (select auth.uid()) or public.is_teacher());
