-- 0022_gauntlet_drawing_series.sql
-- IDEA // GAUNTLET: drawing series / collections, a first-class organizing unit.
--
-- Authors group drawings into named series (like an FRC series of FRC parts) so
-- students can browse and filter by series. A series has a name, an optional
-- description, and a sort order; a challenge belongs to at most one series and
-- carries its own order within it.
--
-- Placement decision (why real columns, not prompt JSONB): series membership is
-- a genuine relation between a series and many challenges, orthogonal to a
-- challenge's content payload. Keeping it in real columns (series_id /
-- series_order) means editing a challenge's prompt/answer through the authoring
-- form NEVER clobbers its series membership (gauntlet_author_upsert only writes
-- mode/title/difficulty/prompt/answer/status), and vice versa. This differs from
-- slug/tier/par_time, which are challenge-intrinsic site data and rightly live in
-- prompt. The series itself is a small teacher-owned table with no private data,
-- so it uses plain teacher-gated RLS (like gauntlet_speedrun_ruleset, 0015), not
-- an RPC. Challenge membership DOES need an RPC because direct DML on challenges
-- is revoked (0009); gauntlet_series_assign is that single write path.
--
-- The concept is mode-agnostic at the DB level (any challenge may join a series),
-- but the v1 UI surfaces it on Speedrun (student browse + author management).
--
-- Apply manually in the Supabase SQL editor. Idempotent where practical.

-- ---------------------------------------------------------------------------
-- 1. Series table
-- ---------------------------------------------------------------------------
create table if not exists public.gauntlet_series (
	id uuid primary key default gen_random_uuid(),
	name text not null,
	description text,
	-- Display order of the series themselves (lowest first); ties break by name.
	sort_order integer not null default 0,
	author_id uuid references auth.users (id) on delete set null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

-- Keep updated_at fresh on edit (reuses the 0004 trigger function).
drop trigger if exists gauntlet_series_touch_updated_at on public.gauntlet_series;
create trigger gauntlet_series_touch_updated_at
	before update on public.gauntlet_series
	for each row execute function public.touch_updated_at();

-- Everyone signed in reads series (needed for the student browse); only teachers
-- create / rename / reorder / delete. The table has no private columns and no
-- per-mode validation, so a plain teacher-gated RLS set is the right fit, the
-- same pattern the global ruleset uses (0015), no SECURITY DEFINER RPC needed.
alter table public.gauntlet_series enable row level security;

revoke all on public.gauntlet_series from anon, authenticated;
grant select on public.gauntlet_series to authenticated;
grant insert, update, delete on public.gauntlet_series to authenticated;

drop policy if exists "read series" on public.gauntlet_series;
create policy "read series"
	on public.gauntlet_series
	for select
	to authenticated
	using (true);

drop policy if exists "teachers insert series" on public.gauntlet_series;
create policy "teachers insert series"
	on public.gauntlet_series
	for insert
	to authenticated
	with check (public.is_teacher());

drop policy if exists "teachers update series" on public.gauntlet_series;
create policy "teachers update series"
	on public.gauntlet_series
	for update
	to authenticated
	using (public.is_teacher())
	with check (public.is_teacher());

drop policy if exists "teachers delete series" on public.gauntlet_series;
create policy "teachers delete series"
	on public.gauntlet_series
	for delete
	to authenticated
	using (public.is_teacher());

-- ---------------------------------------------------------------------------
-- 2. Challenge membership columns
-- Nullable: a challenge may belong to one series or none. ON DELETE SET NULL so
-- deleting a series simply un-groups its challenges (never removes them).
-- ---------------------------------------------------------------------------
alter table public.challenges
	add column if not exists series_id uuid references public.gauntlet_series (id) on delete set null,
	add column if not exists series_order integer;

-- These two columns are board-safe site data, so extend the 0004 column-level
-- SELECT grant to expose them to students (the answer column stays withheld).
grant select (series_id, series_order) on public.challenges to authenticated;

create index if not exists challenges_series_idx
	on public.challenges (series_id, series_order);

-- ---------------------------------------------------------------------------
-- 3. Membership write path (SECURITY DEFINER, teacher-gated)
-- Direct DML on challenges is revoked (0009), so assignment / move / reorder all
-- route through this. p_series_id null unassigns; a non-null series must exist.
-- p_order defaults to keeping the current order (or 0 when newly assigned).
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_series_assign(
	p_challenge_id uuid,
	p_series_id uuid,
	p_order integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	if not public.is_teacher() then
		raise exception 'Only teachers can organize series.';
	end if;
	if not exists (select 1 from public.challenges where id = p_challenge_id) then
		raise exception 'Challenge not found.';
	end if;
	if p_series_id is not null
		and not exists (select 1 from public.gauntlet_series where id = p_series_id) then
		raise exception 'Series not found.';
	end if;
	update public.challenges
		set series_id = p_series_id,
			series_order = case
				when p_series_id is null then null
				else coalesce(p_order, series_order, 0)
			end
		where id = p_challenge_id;
end;
$$;

revoke all on function public.gauntlet_series_assign(uuid, uuid, integer) from public;
grant execute on function public.gauntlet_series_assign(uuid, uuid, integer) to authenticated;
