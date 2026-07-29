-- 0060_gauntlet_view_scoping.sql
-- Row-scoping fix for the two GAUNTLET room views, plus an explicit assertion
-- that none of the three owner-privileged GAUNTLET views is readable by `anon`.
--
-- BACKGROUND. The Supabase table editor flags gauntlet_leaderboard,
-- gauntlet_room_board and gauntlet_room_roster as "Unrestricted". That label
-- means the relation has no RLS policies of its own, which is true of every
-- view (a view cannot carry RLS). It does NOT mean anonymous read access: all
-- three are granted only to `authenticated`, and every consuming route sits
-- under the `/gauntlet` prefix in hooks.server.ts, so an anonymous request is
-- redirected before it reaches one. This migration re-asserts the `anon` revoke
-- so that stays enforced rather than merely assumed (a `create or replace view`
-- preserves existing grants, so a grant made by hand in the dashboard would
-- otherwise survive silently).
--
-- WHY security_invoker IS DELIBERATELY *NOT* SET ON THESE THREE. All three run
-- with the view owner's privileges by design, documented at 0004:182-188 and
-- 0010:140-142. That bypass is load-bearing, not incidental: `profiles` SELECT
-- is own-row-only for students ("select own profile", 0001), and `submissions`
-- SELECT is own-row + teacher + room-member (0004, 0010). Under invoker rights a
-- student would see only their own row on every board, so the leaderboard, the
-- room board and the room roster would all collapse to self-only for exactly the
-- users they exist to serve. security_invoker is therefore a functional break
-- here, not an access-neutral hardening, and it buys nothing anyway because
-- there is no `anon` grant to contain. The 0033 attempt-history view DOES set
-- security_invoker, correctly, because that one is deliberately own-rows-only.
--
-- The right control for an owner-privileged view is an EXPLICIT row predicate
-- inside the view, compensating for the RLS it bypasses. gauntlet_leaderboard
-- already does this (`where c.published`, so a draft challenge never surfaces a
-- board) and needs no change. The two room views never got their equivalent:
-- they bypass the "members read rooms" / "members read roster" / "members read
-- room submissions" policies with nothing put back, so any authenticated user
-- could read the roster and board of a room they are not in by querying the
-- view directly through PostgREST with a room_id. The room PAGE is member-gated
-- (a non-member's gauntlet_rooms read returns null and the load redirects), but
-- that guards the route, not the view.
--
-- Fix: add the membership predicate the views' own comments already assume
-- ("so every MEMBER sees names"), using the existing gauntlet_is_room_member
-- helper (0010) — the same SECURITY DEFINER function the base-table policies
-- use, so view and table now agree on who may read a room. Owner privileges are
-- retained purely for the `profiles` name join, which is what they were for.
-- Columns are unchanged; only rows are narrowed.
--
-- Apply manually in the Supabase SQL editor, after 0059. Idempotent.

-- ---------------------------------------------------------------------------
-- 1. gauntlet_room_board: identical columns and ranking to 0010, membership
-- scoped. The predicate goes in the inner query so non-member rows never reach
-- the window function; ranks are unaffected either way because the partition is
-- already (room_id, challenge_id), so filtering whole rooms cannot renumber a
-- surviving room's board.
--
-- gauntlet_room_manual_submit (0010) reads this view to report a rank. It is
-- SECURITY DEFINER, but auth.uid() reads the request's JWT claim rather than the
-- executing role, so it still resolves to the submitting racer, who is a member
-- by construction (they hold a room token). That path is unaffected.
-- ---------------------------------------------------------------------------
create or replace view public.gauntlet_room_board as
select
	best.room_id,
	best.challenge_id,
	best.user_id,
	coalesce(p.full_name, 'Player') as player,
	best.is_correct,
	best.score_metric,
	best.source,
	best.created_at,
	rank() over (
		partition by best.room_id, best.challenge_id
		order by best.score_metric asc nulls last, best.created_at asc
	) as rank
from (
	select distinct on (s.user_id, s.room_id, s.challenge_id)
		s.user_id, s.room_id, s.challenge_id, s.is_correct, s.score_metric, s.source, s.created_at
	from public.submissions s
	where s.room_id is not null
		and s.is_correct = true
		and public.gauntlet_is_room_member(s.room_id)
	order by s.user_id, s.room_id, s.challenge_id, s.score_metric asc nulls last, s.created_at asc
) best
join public.profiles p on p.id = best.user_id;

grant select on public.gauntlet_room_board to authenticated;
revoke all on public.gauntlet_room_board from anon;

-- ---------------------------------------------------------------------------
-- 2. gauntlet_room_roster: identical columns to 0010, membership scoped.
-- ---------------------------------------------------------------------------
create or replace view public.gauntlet_room_roster as
select
	pr.room_id,
	pr.user_id,
	pr.role,
	pr.joined_at,
	coalesce(p.full_name, 'Player') as player
from public.gauntlet_room_participants pr
join public.profiles p on p.id = pr.user_id
where public.gauntlet_is_room_member(pr.room_id);

grant select on public.gauntlet_room_roster to authenticated;
revoke all on public.gauntlet_room_roster from anon;

-- ---------------------------------------------------------------------------
-- 3. gauntlet_leaderboard: definition intentionally UNCHANGED (last defined in
-- 0007). It is a leaderboard: every signed-in player is meant to see every
-- player's row, so global visibility is the feature, and the RLS it bypasses is
-- already compensated for by the explicit `where c.published` filter. Its
-- columns are board-safe by construction — challenge_id, mode, user_id, display
-- name, correctness, score metric, timestamp, rank — and it deliberately selects
-- no `value` column, so raw measurements and answer-adjacent data never appear.
-- Only the `anon` revoke is asserted here.
-- ---------------------------------------------------------------------------
revoke all on public.gauntlet_leaderboard from anon;
grant select on public.gauntlet_leaderboard to authenticated;
