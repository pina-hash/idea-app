-- 0019_gauntlet_purge_demo.sql
-- IDEA // GAUNTLET: purge demo/placeholder content and fix "cannot be deleted".
--
-- Root cause (confirmed by reading 0009's gauntlet_author_delete and the
-- author list page): deleting a challenge with submissions ARCHIVES it
-- instead of removing it, so board history is never orphaned. That is
-- correct for real challenges, but the nine seeded demo rows (three each for
-- Speedrun, Reverse Engineer, Feature Golf; the "Demo Speedrun: ABS Spacer"
-- challenge from 0005 is one of them) exist only to exercise the flow -- they
-- were never real graded content, so once a teacher or student has submitted
-- against one during testing, the existing rule makes it archive forever and
-- the author page (which lists every status) keeps showing it, reading as
-- "will not clear on delete".
--
-- Fix, in two parts:
--   1. gauntlet_author_delete now hard-deletes a challenge outright when it is
--      flagged demo (prompt->>'demo' = 'true'), regardless of submissions;
--      submissions.challenge_id and gauntlet_run_tokens.challenge_id are both
--      "on delete cascade" (0004 / 0006), so this also purges any orphaned
--      submissions/tokens for it. Non-demo challenges are unaffected: the
--      archive-if-submissions-exist safety net is unchanged.
--   2. A one-time purge removes every currently-seeded demo row right now
--      (cascading to their submissions/tokens), so the stuck ABS Spacer
--      challenge and its siblings are gone immediately, not just deletable
--      the next time a teacher clicks Delete.
--
-- Apply manually in the Supabase SQL editor. Idempotent: the DELETE matches
-- zero rows once the demo seeds are gone, and the function redefinition is a
-- plain create-or-replace.

create or replace function public.gauntlet_author_delete(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_demo boolean;
begin
	if not public.is_teacher() then
		raise exception 'Only teachers can delete challenges.';
	end if;
	select coalesce((prompt ->> 'demo')::boolean, false) into v_demo
		from public.challenges where id = p_id;
	if v_demo is null then
		raise exception 'Challenge not found.';
	end if;
	if v_demo then
		-- Demo/placeholder content was never real board history: purge it and
		-- any submissions/tokens outright (both cascade on challenge delete).
		delete from public.challenges where id = p_id;
		return 'deleted';
	end if;
	if exists (select 1 from public.submissions where challenge_id = p_id) then
		update public.challenges set status = 'archived' where id = p_id;
		return 'archived';
	end if;
	delete from public.challenges where id = p_id;
	return 'deleted';
end;
$$;

revoke all on function public.gauntlet_author_delete(uuid) from public;
grant execute on function public.gauntlet_author_delete(uuid) to authenticated;

-- One-time purge of every currently-seeded demo challenge (Speedrun's
-- "Demo Speedrun: ABS Spacer" / "Demo Speedrun: Aluminum Block" / "Demo
-- Speedrun: Steel Bracket" from 0005, and the six Reverse Engineer / Feature
-- Golf demo rows from 0007). Cascades to their submissions and run tokens.
delete from public.challenges where coalesce((prompt ->> 'demo')::boolean, false);
