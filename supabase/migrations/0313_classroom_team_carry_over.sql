-- 0313_classroom_team_carry_over.sql
--
-- A POST THAT BECOMES A TEAM POST KEEPS WHAT ITS STUDENTS ALREADY WROTE
-- (ledger 0446; Mr. Pina, 2026-10-26, switching IDEA-Blade 02 to a team page
-- mid-assignment: "dont lose any student work. there must be a solution to
-- retain all student answers.").
--
-- WHAT WENT WRONG WITHOUT IT. A team page reads only the team's answer
-- (0302's classroom_team_answers); a member row in classroom_responses is a
-- copy of it. When a per-student post gains `team` after students answered,
-- every team box starts empty, so a student's own answer vanishes from the
-- page, and the first teammate's save then overwrites every member's row for
-- that box (0302's _classroom_save_team_response), destroying the answers the
-- other members wrote on their own.
--
-- WHAT THIS DOES. `_classroom_team_carry_over(item, team)` fills each EMPTY
-- team box of a team or role block (never a picture, never an individual
-- block) from the team's members' own answers: the most recent one wins, it
-- becomes the team's answer and every member's copy, as a save would make it.
-- NOTHING IS DROPPED: every member's own answer is written to the box's
-- history (classroom_team_log, kind 'answer', the history an instructor reads),
-- the one carried over and every one that differed from it, so a member's
-- different answer is on record before any later save replaces their copy.
-- A box the team already has an answer for is never touched, so it runs any
-- number of times and changes nothing the second time.
--
-- WHEN IT RUNS: the two moments a student's own answers can meet a team.
--   1. A manifest with `team` is stored for an item (classroom_set_html_
--      assignment, an upload or a replace): every team of every section the
--      item is posted to, in that section's current draw.
--   2. A draw is posted (posted_at set): every team post in that section.
-- A student who moves teams later is already handled by 0302's resync.
--
-- DEPLOY ORDERING: none. Nothing deployed calls the new function; the two
-- triggers only add rows on events that already happen.
--
-- WHAT UNDOES IT, a person's paste:
--   drop trigger if exists classroom_html_assignments_team_carry_over on public.classroom_html_assignments;
--   drop trigger if exists classroom_team_sets_carry_over on public.classroom_team_sets;
--   drop function if exists public._classroom_team_carry_over_html();
--   drop function if exists public._classroom_team_carry_over_set();
--   drop function if exists public._classroom_team_carry_over(uuid, uuid);
-- The team answers it wrote stay, as answers a student saved would.

do $pre$
begin
	if to_regclass('public.classroom_team_answers') is null
		or to_regclass('public.classroom_team_log') is null
		or to_regprocedure('public._classroom_html_team_manifest(uuid)') is null
		or to_regprocedure('public._classroom_section_team_set(uuid)') is null then
		raise exception '0313 cannot apply: the team documents of 0302 are missing. Apply 0302 first.';
	end if;
end
$pre$;

-- The first object is new, so the apply probe can see this landed.
create or replace function public._classroom_team_carry_over(p_item_id uuid, p_team_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_manifest jsonb := public._classroom_html_team_manifest(p_item_id);
	v_block text;
	v_pick record;
	v_count integer := 0;
begin
	if v_manifest is null or p_team_id is null then
		return 0;
	end if;
	for v_block in
		select b.blk->>'id'
		from jsonb_array_elements(
				case when jsonb_typeof(v_manifest->'modules') = 'array'
					then v_manifest->'modules' else '[]'::jsonb end) as m(mod),
			jsonb_array_elements(
				case when jsonb_typeof(m.mod->'blocks') = 'array'
					then m.mod->'blocks' else '[]'::jsonb end) as b(blk)
		where m.mod->>'audience' in ('team', 'role')
			and coalesce(b.blk->>'type', '') <> 'image'
			and coalesce(b.blk->>'id', '') <> ''
	loop
		continue when exists (
			select 1 from public.classroom_team_answers a
			where a.team_id = p_team_id and a.item_id = p_item_id and a.block_id = v_block);

		-- The members' own answers, newest first. An empty answer is no answer.
		select r.student_email, r.value, r.updated_at into v_pick
		from public.classroom_responses r
		join public.classroom_team_members m
			on m.team_id = p_team_id and m.student_email = r.student_email
		where r.item_id = p_item_id and r.block_id = v_block
			and r.value is not null
			and r.value not in ('null'::jsonb, '""'::jsonb, '{}'::jsonb, '{"text": ""}'::jsonb, '{"text": null}'::jsonb)
		order by r.updated_at desc, r.student_email
		limit 1;
		continue when v_pick.student_email is null;

		-- Every member's own answer goes into the box's history first, oldest
		-- first, so a different one is on record before its copy is replaced.
		insert into public.classroom_team_log (team_id, item_id, block_id, kind, actor_email, at, before, after, note)
		select p_team_id, p_item_id, v_block, 'answer', r.student_email, r.updated_at, null, r.value,
			case when r.student_email = v_pick.student_email
				then 'Carried over from this student''s own answer when the post became a team page'
				else 'This student''s own answer before the post became a team page; the team kept a teammate''s newer one'
			end
		from public.classroom_responses r
		join public.classroom_team_members m
			on m.team_id = p_team_id and m.student_email = r.student_email
		where r.item_id = p_item_id and r.block_id = v_block
			and r.value is not null
			and r.value not in ('null'::jsonb, '""'::jsonb, '{}'::jsonb, '{"text": ""}'::jsonb, '{"text": null}'::jsonb)
			and (r.student_email = v_pick.student_email or r.value is distinct from v_pick.value)
		order by r.updated_at, r.student_email;

		insert into public.classroom_team_answers (team_id, item_id, block_id, value, updated_by, updated_at)
		values (p_team_id, p_item_id, v_block, v_pick.value, v_pick.student_email, v_pick.updated_at)
		on conflict (team_id, item_id, block_id) do nothing;

		insert into public.classroom_responses (item_id, student_email, block_id, value, updated_at)
		select p_item_id, m.student_email, v_block, v_pick.value, now()
		from public.classroom_team_members m
		where m.team_id = p_team_id
		on conflict (item_id, student_email, block_id) do update
			set value = excluded.value, updated_at = now()
			where public.classroom_responses.value is distinct from excluded.value;

		v_count := v_count + 1;
	end loop;
	if v_count > 0 then
		perform public._classroom_live_notice('team-' || p_team_id::text, 'team-doc');
	end if;
	return v_count;
end;
$f$;

revoke all on function public._classroom_team_carry_over(uuid, uuid) from public, anon, authenticated;

-- 1. A team manifest stored for an item: every team in the current draw of
--    every section the item is posted to.
create or replace function public._classroom_team_carry_over_html()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_team uuid;
	v_total integer := 0;
begin
	if jsonb_typeof(new.manifest->'team') is distinct from 'object' then
		return null;
	end if;
	for v_team in
		select t.id
		from public.classroom_postings pg
		join public.classroom_teams t
			on t.team_set_id = public._classroom_section_team_set(pg.section_id)
		where pg.item_id = new.item_id
	loop
		v_total := v_total + public._classroom_team_carry_over(new.item_id, v_team);
	end loop;
	return null;
end;
$f$;

revoke all on function public._classroom_team_carry_over_html() from public, anon, authenticated;

drop trigger if exists classroom_html_assignments_team_carry_over on public.classroom_html_assignments;
create trigger classroom_html_assignments_team_carry_over
	after insert or update of manifest on public.classroom_html_assignments
	for each row execute function public._classroom_team_carry_over_html();

-- 2. A draw posted: every team post in that section, for every team in it.
create or replace function public._classroom_team_carry_over_set()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_item uuid;
	v_team uuid;
begin
	if new.posted_at is null or (tg_op = 'UPDATE' and old.posted_at is not distinct from new.posted_at) then
		return null;
	end if;
	for v_item in
		select pg.item_id
		from public.classroom_postings pg
		join public.classroom_html_assignments h on h.item_id = pg.item_id
		where pg.section_id = new.section_id
			and jsonb_typeof(h.manifest->'team') = 'object'
	loop
		for v_team in select t.id from public.classroom_teams t where t.team_set_id = new.id loop
			perform public._classroom_team_carry_over(v_item, v_team);
		end loop;
	end loop;
	return null;
end;
$f$;

revoke all on function public._classroom_team_carry_over_set() from public, anon, authenticated;

drop trigger if exists classroom_team_sets_carry_over on public.classroom_team_sets;
create trigger classroom_team_sets_carry_over
	after insert or update of posted_at on public.classroom_team_sets
	for each row execute function public._classroom_team_carry_over_set();

-- Every team post already stored meets its posted teams now: the post that
-- needed this (IDEA-Blade 02) may be switched before or after this applies.
do $carry$
declare
	v_item uuid;
	v_team uuid;
	v_total integer := 0;
begin
	for v_item, v_team in
		select h.item_id, t.id
		from public.classroom_html_assignments h
		join public.classroom_postings pg on pg.item_id = h.item_id
		join public.classroom_teams t on t.team_set_id = public._classroom_section_team_set(pg.section_id)
		where jsonb_typeof(h.manifest->'team') = 'object'
	loop
		v_total := v_total + public._classroom_team_carry_over(v_item, v_team);
	end loop;
	raise notice '0313: % team boxes carried over from students'' own answers', v_total;
end
$carry$;
