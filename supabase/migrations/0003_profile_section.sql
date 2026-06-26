-- 0003_profile_section.sql
-- Per-student class selection.
--
-- A signed-in student self-selects their 2026-27 section once; it is stored
-- here and used to pin "their class" at the top of the homepage. The value is a
-- Section.id from src/lib/curriculum.ts (free-form text, intentionally not a FK
-- so the curriculum can evolve in code without a migration).
--
-- No new grants or policies are needed: the table-level `update` grant and the
-- "update own profile" RLS policy from 0001 already let a user write their own
-- row, and the `enforce_role_change` trigger only fires on role changes.
--
-- Apply manually in the Supabase SQL editor.

alter table public.profiles
	add column if not exists section_id text;
