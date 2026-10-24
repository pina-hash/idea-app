-- 0295_gauntlet_board_and_tournament_registrants.sql
--
-- TWO REPAIRS (ledger 0433, docs/feedback/2026-10-23/QUEUE.md items 12 and 13).
--
-- 1. THE GAUNTLET BOARDS READ AGAIN (report 59687b79, "not displaying any
--    scores, seems like some runs have been reset"). NO RUN WAS DELETED OR
--    RESET. 0289 rebuilt `gauntlet_leaderboard` with
--    `best.user_id not in (select public._idea_test_user_ids())`, and 0288
--    revoked that function from `authenticated`. The view is owner-privileged,
--    but Postgres checks EXECUTE on a function a view calls as the CALLER, so
--    from the moment 0289 landed every signed-in read of the board answered
--    "permission denied for function _idea_test_user_ids". The board ladder
--    (`readBoard`) fails closed on any error but a missing column, so every
--    board rendered empty. `submissions` was never touched, which is why every
--    run comes back the moment this file applies: there is nothing to restore.
--
--    The fix is 0289's own pattern for the one security-invoker view it wrote
--    (`idea_hidden_test_account`): a definer helper that answers about ONE id
--    at a time, granted to `authenticated`, and never lists test accounts.
--    The view below is 0289's definition with that one condition swapped and
--    nothing else changed: the floor, the held state, the ranked-first
--    `distinct on`, the published filter and the test-account rule are
--    character for character the same.
--
-- 2. A STRAY TEAMMATE CAN BE REMOVED, AND A TEAM NAME CANNOT BECOME ONE
--    (report 919e2a21). From 0192:
--      * `tournament_remove_entry_member` now also lets a signed-in member of
--        an entry remove a NO-ACCOUNT registrant on that same entry. Every
--        other rule (the window, the last registrant, the registering
--        account's own row) is unchanged.
--      * `tournament_add_entry_member` refuses a teammate named exactly the
--        team's own name, and says to use Rename team.
--    Existing stray rows are not touched here: they are student data, and they
--    leave only through that remove action.
--
-- ADDITIVE, NO ORDERING: one new function, two bodies replaced under their
-- existing signatures, one view replaced with the same columns.
--
-- UNDO, a person's paste: re-run the gauntlet_leaderboard view from 0289 (it
-- breaks the boards again), the two tournament functions from 0192, then
-- `drop function public.idea_hidden_test_user(uuid);`.

-- ---------------------------------------------------------------------------
-- 1. The board
-- ---------------------------------------------------------------------------

-- True when the id is a test account that is not the caller. One id at a time;
-- it never lists them (0289's idea_hidden_test_account, for a user id).
create or replace function public.idea_hidden_test_user(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
	select p_user is distinct from (select auth.uid())
		and public._idea_is_test_user(p_user);
$fn$;
revoke all on function public.idea_hidden_test_user(uuid) from public, anon, authenticated;
grant execute on function public.idea_hidden_test_user(uuid) to authenticated;

-- gauntlet_leaderboard: 0289's definition, with the test-account condition
-- read through the granted helper above
create or replace view public.gauntlet_leaderboard as
select
	best.challenge_id,
	best.mode,
	best.user_id,
	coalesce(p.full_name, 'Player') as player,
	best.is_correct,
	best.score_metric,
	best.created_at,
	-- 0194: a HELD run holds no seat. Partitioning by `rank_state` keeps the
	-- ranked rows' numbering dense and unchanged -- 1..n over the ranked rows
	-- of the challenge, exactly what it was before this file -- and the `case`
	-- nulls the held partition's own numbering rather than publishing it.
	case when best.rank_state = 'ranked' then
		rank() over (
			partition by best.challenge_id, best.rank_state
			order by best.is_correct desc nulls last, best.score_metric asc nulls last, best.tiebreak asc nulls last, best.created_at asc
		)
	end as rank,
	best.rank_state
from (
	select distinct on (cand.user_id, cand.challenge_id)
		cand.user_id,
		cand.challenge_id,
		cand.mode,
		cand.is_correct,
		cand.score_metric,
		cand.created_at,
		cand.tiebreak,
		cand.rank_state
	from (
		select
			s.user_id,
			s.challenge_id,
			s.mode,
			s.is_correct,
			s.score_metric,
			s.created_at,
			(s.value ->> 'elapsed_ms')::numeric as tiebreak,
			-- 0194: THE PLAUSIBILITY FLOOR, WHICH NOW HOLDS RATHER THAN DROPS.
			-- The threshold is read from the settings row, not written here as
			-- a literal; `coalesce` covers the case where section 1's seed was
			-- removed by hand, and covers it with 0154's own number.
			--
			-- A MISSING `elapsed_ms` IS HELD. `0154` refused it (NULL >= 30000
			-- is NULL) and said so; `is null or < floor` is that same refusal
			-- with a teacher able to see the row. Every macro submit since
			-- `0006` writes the key, so such a row is not a legacy shape but a
			-- row nothing in this codebase wrote.
			--
			-- The expression is the tiebreak's, character for character, for
			-- `0154`'s reason: `score_metric` is only the clock for `speedrun`,
			-- so a macro mode admitted later would be floored on a feature
			-- count.
			case
				when s.source = 'macro'
					and s.mode in ('speedrun')
					and (
						(s.value ->> 'elapsed_ms')::numeric is null
						or (s.value ->> 'elapsed_ms')::numeric < f.floor_ms
					)
				then 'pending_verification'
				else 'ranked'
			end as rank_state
		from public.submissions s
		cross join lateral (
			select coalesce(
				(select g.speedrun_floor_ms from public.gauntlet_rank_settings g where g.id),
				30000
			)::numeric as floor_ms
		) f
		-- 0154: A RESULT IS A CORRECT RESULT. `is_correct = true` (not
		-- `is_correct`) so a NULL is refused rather than being asked to be
		-- truthy. Unchanged.
		where s.is_correct = true
			and (
				s.mode in ('drawing_reading', 'gdt_tolerance', 'spot_the_error')
				-- 0146's allowlist, unchanged and still an allowlist: a macro
				-- mode added later must be admitted by somebody who has decided
				-- its metric is checkable. What 0194 removes from this branch is
				-- ONLY the floor term -- the row now enters and is labelled,
				-- rather than being excluded.
				or (
					s.source = 'macro'
					and s.mode in ('speedrun')
				)
			)
	) cand
	order by cand.user_id, cand.challenge_id,
		-- 0194: A RANKED ROW OUTRANKS A HELD ONE FOR THE SAME PLAYER. This is
		-- where `0154`'s "it removes the run, not the player" now lives: it was
		-- a consequence of the WHERE excluding held rows, and the WHERE no
		-- longer does, so it is stated. Without this term a student's held
		-- 4-second run would represent them on a challenge they also cleared
		-- honestly, and their honest seat would disappear.
		(cand.rank_state = 'ranked') desc,
		cand.is_correct desc nulls last,
		cand.score_metric asc nulls last,
		cand.tiebreak asc nulls last,
		cand.created_at asc
) best
join public.profiles p on p.id = best.user_id
join public.challenges c on c.id = best.challenge_id
where c.published
	and not public.idea_hidden_test_user(best.user_id);

grant select on public.gauntlet_leaderboard to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Tournament registrants (latest definitions before this file: 0192)
-- ---------------------------------------------------------------------------

create or replace function public.tournament_add_entry_member(
	p_entry_id uuid,
	p_name text,
	p_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_e public.tournament_entries;
	v_t public.tournaments;
	v_member boolean;
	v_manage boolean;
	v_count integer;
	v_team integer;
	v_target uuid;
	v_id uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	select * into v_e from public.tournament_entries where id = p_entry_id;
	if not found then
		raise exception 'Entry not found.';
	end if;
	select * into v_t from public.tournaments where id = v_e.tournament_id for update;
	if not found then
		raise exception 'Tournament not found.';
	end if;
	-- Re-read under the lock: a host removal between the unlocked read above
	-- and the lock would otherwise surface as a raw foreign-key error on the
	-- insert below rather than as this sentence.
	select * into v_e from public.tournament_entries where id = p_entry_id;
	if not found then
		raise exception 'Entry not found.';
	end if;
	v_member := exists (
		select 1 from public.tournament_entry_members
		where entry_id = p_entry_id and user_id = v_uid
	);
	v_manage := public._tournament_can_manage(v_e.tournament_id);
	if not v_member and not v_manage then
		raise exception 'Only a registrant on this entry, a tournament host or a site admin can add a teammate.';
	end if;
	-- Adding BY ACCOUNT is a manager action (header, item 6). Asked before the
	-- window and the capacity: it is about who is asking, not about the entry.
	if p_email is not null and btrim(p_email) <> '' and not v_manage then
		raise exception 'Only a tournament host or a site admin can add a teammate by account. Teammates with an account can join the entry themselves.';
	end if;
	if v_t.status not in ('registration_open', 'seeding') then
		raise exception 'Teammates can only be added while registration is open or during seeding.';
	end if;
	select count(*) into v_count from public.tournament_entry_members where entry_id = p_entry_id;
	v_team := public._tournament_team_size(v_t.config);
	if v_count >= v_team then
		raise exception 'This entry is full (% of %).', v_count, v_team;
	end if;
	if p_name is null or btrim(p_name) = '' or char_length(btrim(p_name)) > 40 then
		raise exception 'Teammate names must be 1 to 40 characters.';
	end if;
	-- 0295: A TEAMMATE IS NEVER THE TEAM'S OWN NAME. Report 919e2a21: a student
	-- typed the team name they wanted into Add a teammate and got a registrant
	-- called that. Renaming the team is tournament_update_entry; this refusal
	-- says so, and it is asked of every caller, a host included.
	if lower(btrim(p_name)) = lower(btrim(v_e.display_name)) then
		raise exception 'That is the team''s name, not a teammate. To change the team name, use Rename team.';
	end if;
	if p_email is not null and btrim(p_email) <> '' then
		select id into v_target from public.profiles where lower(email) = lower(btrim(p_email));
		if v_target is null then
			raise exception 'No account found for that email.';
		end if;
		if exists (
			select 1 from public.tournament_entry_members
			where tournament_id = v_e.tournament_id and user_id = v_target
		) or exists (
			select 1 from public.tournament_entries
			where tournament_id = v_e.tournament_id and user_id = v_target
		) then
			raise exception 'That account is already registered in this tournament.';
		end if;
	end if;
	insert into public.tournament_entry_members (entry_id, tournament_id, user_id, name, added_by, created_at)
	values (p_entry_id, v_e.tournament_id, v_target, btrim(p_name), v_uid, clock_timestamp())
	returning id into v_id;
	return v_id;
end;
$$;

revoke all on function public.tournament_add_entry_member(uuid, text, text)
	from public, anon, authenticated, service_role;
grant execute on function public.tournament_add_entry_member(uuid, text, text) to authenticated;

create or replace function public.tournament_remove_entry_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_m public.tournament_entry_members;
	v_e public.tournament_entries;
	v_t public.tournaments;
	v_count integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	select * into v_m from public.tournament_entry_members where id = p_member_id;
	if not found then
		raise exception 'Registrant not found.';
	end if;
	select * into v_t from public.tournaments where id = v_m.tournament_id for update;
	if not found then
		raise exception 'Tournament not found.';
	end if;
	-- Re-read the member AND its entry under the lock: a host removal of the
	-- entry cascades the roster away, and the delete below would otherwise be
	-- a silent 0-row success.
	select * into v_m from public.tournament_entry_members where id = p_member_id;
	if not found then
		raise exception 'Registrant not found.';
	end if;
	select * into v_e from public.tournament_entries where id = v_m.entry_id;
	if not found then
		raise exception 'Entry not found.';
	end if;
	-- 0295: A NO-ACCOUNT REGISTRANT MAY BE REMOVED BY ANY SIGNED-IN MEMBER OF
	-- THE SAME ENTRY (report 919e2a21). Such a row is a name somebody typed, not
	-- a person's account, so taking it off asks nobody's consent; before this
	-- file only the registering account or a manager could, and an entry a host
	-- made has no registering account at all, which left the members of a
	-- host-made team unable to remove a stray name from their own team. A row
	-- WITH an account still answers only to itself, the registering account and
	-- a manager.
	if not (
		(v_m.user_id is not null and v_m.user_id = v_uid)
		or (v_e.user_id is not null and v_e.user_id = v_uid)
		or (v_m.user_id is null and exists (
			select 1 from public.tournament_entry_members o
			where o.entry_id = v_m.entry_id and o.user_id = v_uid
		))
		or public._tournament_can_manage(v_m.tournament_id)
	) then
		raise exception 'Only that registrant, a teammate on this entry (for a name with no account), the registering account, a tournament host or a site admin can remove a teammate.';
	end if;
	if v_t.status not in ('registration_open', 'seeding') then
		raise exception 'Teammates can only be removed while registration is open or during seeding.';
	end if;
	select count(*) into v_count from public.tournament_entry_members where entry_id = v_m.entry_id;
	if v_count <= 1 then
		raise exception 'An entry needs at least one registrant. A host or a site admin can remove the entry instead.';
	end if;
	if v_m.user_id is not null and v_m.user_id = v_e.user_id then
		raise exception 'The registering account stays on the entry. A host or a site admin can remove the entry to withdraw it.';
	end if;
	delete from public.tournament_entry_members where id = p_member_id;
end;
$$;

revoke all on function public.tournament_remove_entry_member(uuid)
	from public, anon, authenticated, service_role;
grant execute on function public.tournament_remove_entry_member(uuid) to authenticated;


do $chk$
declare
	v_runs integer;
	v_correct integer;
begin
	select count(*), count(*) filter (where is_correct = true) into v_runs, v_correct from public.submissions;
	raise notice '0295: % GAUNTLET submissions stored (% correct); none were changed, and the boards read them again', v_runs, v_correct;
	raise notice '0295: % no-account tournament registrants on entries that also have a signed-in member (removable by that member now)',
		(select count(*) from public.tournament_entry_members m
			where m.user_id is null
				and exists (select 1 from public.tournament_entry_members o where o.entry_id = m.entry_id and o.user_id is not null));
end;
$chk$;
