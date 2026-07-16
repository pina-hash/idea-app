-- 0047_fsp_frc_interest_parent_email.sql
-- FRC Team 5669 interest form: adds an optional parent/guardian email field.
--
-- Builds directly on 0046. Nothing else changes: no new RLS policy, table
-- grant, or index -- the new column rides the existing anon-insert /
-- teacher-read policies for free.
--
-- Apply manually in the Supabase SQL editor, after 0046. Idempotent where
-- practical.

alter table public.fsp_frc_interest
	add column if not exists parent_email text;
