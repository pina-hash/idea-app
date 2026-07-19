-- 0051_greenline_decals.sql
-- GREENLINE: free-form custom decal upload (Phase 6c), gated behind teacher
-- approval. A student uploads one PNG/JPG image as a custom livery decal; it is
-- usable by the student IMMEDIATELY in their own context (garage preview, own
-- races), and becomes readable by OTHER players only once a teacher approves it.
--
-- The review flow mirrors the FRC modeling-gate (0042): pending -> approved, or
-- pending -> needs_revision (with teacher feedback text) -> the student
-- re-uploads -> back to pending. Never a blunt reject: a needs_revision decal
-- stays visible to its owner with the feedback attached, so the student can act.
--
-- Two deliberate departures from 0042's shape:
--
--   1. The TEACHER write goes through a SECURITY DEFINER RPC
--      (greenline_decal_review), NOT a teacher-RLS row update. This is the
--      cross-user staff-write convention (frc_mark_complete, the GAUNTLET
--      authoring RPCs): there is deliberately NO client-side path that lets a
--      teacher role directly mutate another user's decal row.
--
--   2. The student may resubmit at ANY status, including approved — and every
--      student write is forced back to 'pending' (WITH CHECK). Unlike an FRC
--      unit (completion is permanent, resubmitting an approved unit is
--      meaningless), a decal is a living image: replacing an approved decal
--      MUST re-enter moderation, or approve-once-then-swap-the-image would
--      bypass the whole gate.
--
-- Image immutability is the other half of that guarantee: the storage bucket
-- has NO update policy, so an object can never be overwritten in place after
-- its row is approved. Every upload goes to a fresh random path in the user's
-- own <uid>/ folder and the row's `path` moves with it (which forces the row
-- pending, per the WITH CHECK above); the abandoned object no longer matches
-- any approved row, so it stops being readable by others.
--
-- VISIBILITY GATE (where it actually lives): today NO surface renders another
-- player's vehicle or livery — the track leaderboard shows name/archetype/times
-- as text, races are vs AI, and there is no replay/spectator. So the gate is
-- enforced at the source: the storage read policy serves a decal image to a
-- non-owner only when a greenline_decals row with status='approved' matches the
-- object path (teachers read all, for the review queue). Any future surface
-- that shows another player's car inherits the gate for free, because an
-- unapproved image is simply unreadable.
--
-- Server-side upload constraints ride the bucket row itself: file_size_limit
-- 1 MiB + allowed_mime_types PNG/JPG, so the client-side checks in
-- src/lib/greenline/decals.ts are convenience, not the boundary. (Pixel
-- dimensions are client-checked only; the reviewer sees the actual image, so
-- moderation is the real content gate.)
--
-- Apply manually in the Supabase SQL editor, after 0050.

-- ===========================================================================
-- 1. The decal record: one custom decal per user.
-- ===========================================================================
create table if not exists public.greenline_decals (
	user_id uuid primary key references auth.users (id) on delete cascade,
	-- Storage object path in the greenline-decals bucket: '<uid>/<random>.<ext>'.
	path text not null,
	status text not null default 'pending'
		check (status in ('pending', 'approved', 'needs_revision')),
	reviewer_feedback text not null default '',
	submitted_at timestamptz not null default now(),
	reviewed_at timestamptz
);

create index if not exists greenline_decals_status_idx
	on public.greenline_decals (status, submitted_at);

-- Clients read/insert/update/delete their OWN row under RLS; the teacher
-- review write is the RPC below, never a direct client update.
revoke all on public.greenline_decals from anon, authenticated;
grant select, insert, update, delete on public.greenline_decals to authenticated;

alter table public.greenline_decals enable row level security;

-- SELECT: own row, any status (the uploader always sees their decal + feedback).
drop policy if exists "greenline decal select own" on public.greenline_decals;
create policy "greenline decal select own"
	on public.greenline_decals
	for select
	to authenticated
	using (user_id = (select auth.uid()));

-- SELECT: teachers read all (the dashboard review queue).
drop policy if exists "greenline decal select teacher" on public.greenline_decals;
create policy "greenline decal select teacher"
	on public.greenline_decals
	for select
	to authenticated
	using (public.is_teacher());

-- SELECT: APPROVED rows are visible to any signed-in user. This is the
-- visibility gate's data half: it lets any future surface resolve which decal a
-- player shows, and it is what makes the storage read policy below work (the
-- policy's EXISTS subquery runs as the caller, so the caller must be able to
-- SELECT the approved row it matches against).
drop policy if exists "greenline decal select approved" on public.greenline_decals;
create policy "greenline decal select approved"
	on public.greenline_decals
	for select
	to authenticated
	using (status = 'approved');

-- INSERT: a student creates their OWN row, always pending (never self-approved).
drop policy if exists "greenline decal insert own" on public.greenline_decals;
create policy "greenline decal insert own"
	on public.greenline_decals
	for insert
	to authenticated
	with check (user_id = (select auth.uid()) and status = 'pending');

-- UPDATE: a student may rewrite their OWN row at ANY status (resubmission is
-- always allowed, see the header), but the new row is always 'pending' — so a
-- student write can never approve, and replacing an approved decal's image
-- re-enters moderation by construction.
drop policy if exists "greenline decal update own" on public.greenline_decals;
create policy "greenline decal update own"
	on public.greenline_decals
	for update
	to authenticated
	using (user_id = (select auth.uid()))
	with check (user_id = (select auth.uid()) and status = 'pending');

-- DELETE: a student removes their own decal outright.
drop policy if exists "greenline decal delete own" on public.greenline_decals;
create policy "greenline decal delete own"
	on public.greenline_decals
	for delete
	to authenticated
	using (user_id = (select auth.uid()));

-- NO teacher insert/update/delete policies: the review decision is written only
-- by the SECURITY DEFINER RPC below.

-- ===========================================================================
-- 2. The teacher review write path (SECURITY DEFINER RPC).
-- ===========================================================================
-- Approve or request revision on a student's decal. is_teacher() is enforced
-- INSIDE the function (the frc_mark_complete convention), so UI gating on the
-- dashboard is convenience, not the boundary. Feedback is required for a
-- revision request (the student must see why); approve may carry an optional
-- note. Acts on the row at any current status (a teacher may re-review).
-- Returns the new status.
create or replace function public.greenline_decal_review(
	p_user_id uuid,
	p_action text,
	p_feedback text default ''
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_status text;
begin
	if not public.is_teacher() then
		raise exception 'forbidden';
	end if;
	if p_action not in ('approve', 'needs_revision') then
		raise exception 'Unknown review action: %', p_action;
	end if;
	if p_action = 'needs_revision' and length(trim(coalesce(p_feedback, ''))) = 0 then
		raise exception 'Feedback is required when requesting a revision';
	end if;

	v_status := case when p_action = 'approve' then 'approved' else 'needs_revision' end;

	update public.greenline_decals
	set status = v_status,
		reviewer_feedback = coalesce(p_feedback, ''),
		reviewed_at = now()
	where user_id = p_user_id;

	if not found then
		raise exception 'No decal submission for that user';
	end if;

	return v_status;
end;
$$;

revoke all on function public.greenline_decal_review(uuid, text, text) from public;
grant execute on function public.greenline_decal_review(uuid, text, text) to authenticated;

-- ===========================================================================
-- 3. Storage: the private greenline-decals bucket.
-- ===========================================================================
-- Private (public=false): every read goes through the policies below. The
-- bucket row itself enforces the upload constraints server-side: 1 MiB cap,
-- PNG/JPG only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
	'greenline-decals',
	'greenline-decals',
	false,
	1048576,
	array['image/png', 'image/jpeg']
)
on conflict (id) do update
	set public = false,
		file_size_limit = 1048576,
		allowed_mime_types = array['image/png', 'image/jpeg'];

-- INSERT: each user writes only their own <uid>/ folder (the avatars pattern).
drop policy if exists "greenline decals insert own folder" on storage.objects;
create policy "greenline decals insert own folder"
	on storage.objects
	for insert
	to authenticated
	with check (
		bucket_id = 'greenline-decals'
		and (storage.foldername(name))[1] = (select auth.uid())::text
	);

-- SELECT — the visibility gate itself:
--   - the owner reads their own folder (pending/needs_revision included, so
--     the uploader can use their decal immediately in their own context),
--   - teachers read everything (the review queue needs the image),
--   - anyone signed in reads an object ONLY while a greenline_decals row with
--     status='approved' points at exactly that path.
drop policy if exists "greenline decals read gated" on storage.objects;
create policy "greenline decals read gated"
	on storage.objects
	for select
	to authenticated
	using (
		bucket_id = 'greenline-decals'
		and (
			(storage.foldername(name))[1] = (select auth.uid())::text
			or public.is_teacher()
			or exists (
				select 1
				from public.greenline_decals d
				where d.path = name
					and d.status = 'approved'
			)
		)
	);

-- DELETE: own folder (cleanup of replaced/removed decals).
drop policy if exists "greenline decals delete own folder" on storage.objects;
create policy "greenline decals delete own folder"
	on storage.objects
	for delete
	to authenticated
	using (
		bucket_id = 'greenline-decals'
		and (storage.foldername(name))[1] = (select auth.uid())::text
	);

-- Deliberately NO update policy: a stored object is immutable. Replacing a
-- decal means uploading to a NEW path and moving the row's `path` (which forces
-- it back to pending), so an approved image can never be swapped in place.
