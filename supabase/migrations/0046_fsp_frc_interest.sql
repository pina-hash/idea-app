-- 0046_fsp_frc_interest.sql
-- FRC Team 5669 interest form: a standalone, PUBLIC, unauthenticated intake
-- form at /fsp/frc-interest (reached from a QR code, like the other FSP
-- tools). Prospective freshmen and parents scanning the code will not have a
-- Bosco Tech account, so this is the one FSP surface that accepts an
-- anonymous submission with no auth gate at all.
--
-- One table, no RPC needed: anonymous INSERT is safe here (unlike
-- fsp_questions/frc_user_progress, there is no grading or ranking to forge,
-- and no session/target to spoof), so the RLS insert policy itself is the
-- write path. Reads are teacher-only (the /fsp/frc-interest/admin table),
-- gated by the existing is_teacher() helper (0001).
--
-- Apply manually in the Supabase SQL editor, after 0045. Idempotent where
-- practical.

create table if not exists public.fsp_frc_interest (
	id uuid primary key default gen_random_uuid(),
	full_name text not null check (char_length(btrim(full_name)) > 0),
	email text not null check (char_length(btrim(email)) > 0),
	phone text,
	interest_areas text[] not null default '{}',
	prior_experience text,
	created_at timestamptz not null default now()
);

create index if not exists fsp_frc_interest_created_at_idx
	on public.fsp_frc_interest (created_at desc);

-- No default grants: anonymous visitors may only INSERT (via RLS below);
-- reading the roster is teacher-only.
revoke all on public.fsp_frc_interest from anon, authenticated;
grant insert on public.fsp_frc_interest to anon, authenticated;
grant select on public.fsp_frc_interest to authenticated;

alter table public.fsp_frc_interest enable row level security;

drop policy if exists "anyone can submit frc interest" on public.fsp_frc_interest;
create policy "anyone can submit frc interest"
	on public.fsp_frc_interest
	for insert
	to anon, authenticated
	with check (true);

drop policy if exists "teachers read frc interest" on public.fsp_frc_interest;
create policy "teachers read frc interest"
	on public.fsp_frc_interest
	for select
	to authenticated
	using (public.is_teacher());
