-- 0045_profile_tour.sql
-- First-time orientation tour: adds profiles.tour_completed_at.
--
-- Null means the user has never finished or skipped the portal tour, so the
-- homepage auto-launches it once after sign-in. Non-null means they have seen
-- it (completed, skipped, or closed); it never auto-launches again. The manual
-- "Take the tour" header control ignores this flag entirely.
--
-- NO new policies or grants are needed: users stamp their own row through the
-- existing "update own profile" RLS policy (0001), the same trust level as
-- display_name / section_id / pathway, and the column-less grant from 0001
-- (select, update on profiles to authenticated) already covers it. The
-- enforce_role_change guard is untouched. The web side fails soft (no
-- auto-launch, no writes) until this is applied.
--
-- Apply manually in the Supabase SQL editor.

alter table public.profiles
	add column if not exists tour_completed_at timestamptz;
