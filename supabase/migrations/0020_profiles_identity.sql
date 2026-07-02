-- 0020_profiles_identity.sql
-- Global user profiles, phase 2 of the portal build:
--   * display_name: user-editable name shown across the portal (falls back to
--     the Google full_name, then the email).
--   * avatar: the user's chosen picture. One of
--       'preset:<id>'     -> a built-in preset mark (src/lib/profile.ts)
--       'upload:<path>'   -> an uploaded image in the public 'avatars' bucket
--       null              -> fall back to avatar_url (Google photo), then initials.
--   * preferences: free-form JSONB for per-user portal settings (theme,
--     homepage layout, etc.). Owned by the user via the existing
--     "update own profile" RLS policy; no new policy needed.
--
-- Role assignment (0001) is untouched: the enforce_role_change guard trigger
-- and role_for_email derivation still own the role column.
--
-- Apply manually in the Supabase SQL editor.

alter table public.profiles
	add column if not exists display_name text,
	add column if not exists avatar text,
	add column if not exists preferences jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- Avatar uploads: public 'avatars' bucket, each user writes only their own
-- <uid>/ folder. Avatars are non-sensitive by design (they render on public
-- leaderboards), so public read is intentional.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read"
	on storage.objects
	for select
	to public
	using (bucket_id = 'avatars');

drop policy if exists "avatars insert own folder" on storage.objects;
create policy "avatars insert own folder"
	on storage.objects
	for insert
	to authenticated
	with check (
		bucket_id = 'avatars'
		and (storage.foldername(name))[1] = (select auth.uid())::text
	);

drop policy if exists "avatars update own folder" on storage.objects;
create policy "avatars update own folder"
	on storage.objects
	for update
	to authenticated
	using (
		bucket_id = 'avatars'
		and (storage.foldername(name))[1] = (select auth.uid())::text
	)
	with check (
		bucket_id = 'avatars'
		and (storage.foldername(name))[1] = (select auth.uid())::text
	);

drop policy if exists "avatars delete own folder" on storage.objects;
create policy "avatars delete own folder"
	on storage.objects
	for delete
	to authenticated
	using (
		bucket_id = 'avatars'
		and (storage.foldername(name))[1] = (select auth.uid())::text
	);
