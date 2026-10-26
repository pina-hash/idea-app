-- 0307_classroom_team_voice.sql
--
-- TEAMS BY VOICE (ledger 0436, IDEA209H Unit 4;
-- Mr. Pina's addendum 2 of 2026-10-26: "Teams must be fully manageable from
-- the IDEA Website connector, by voice").
--
-- Every function here is a server rule the site's own buttons can call too, so
-- a change through the connector and a click are the same write, the same
-- change log and the same two-second live notice (the triggers of 0302 fire on
-- the rows, whoever wrote them):
--   * classroom_preview_team_draw   the SERVER draws at random, teams of 3 or
--     4 only (never 2 or 5), leaving out whoever he names, and returns the
--     teams and the seed WITHOUT saving anything;
--   * classroom_draw_teams          the same draw from the same seed, saved
--     through classroom_save_team_set (0223) and, when he says so, posted
--     through classroom_post_team_set, in one step;
--   * classroom_swap_team_members   two students trade teams, as two
--     classroom_move_team_member moves (0225), so the change log shows the
--     same two moves a click makes;
--   * classroom_add_team, classroom_remove_team (an empty team only, and one
--     with no saved work), classroom_rename_team (returns the old name, so
--     undo puts it back).
--
-- AND A NAME KEPT, ON PURPOSE. 0306's burn-up board is classroom_team_board()
-- beside 0223's classroom_team_board(uuid), the People tab's draw board. The
-- pair is resolvable (the one form takes no argument, the other one required
-- uuid with no default, so no payload binds to both). Renaming it was tried in
-- this file before it ever ran and refused by the Migrate probe: a drop of
-- either form reads, by name, as retiring 0225's function, and 0225 has no
-- history row to answer for it. So nothing here drops or renames it.

-- DEPLOY ORDERING: none for the site; the connector entries naming these
-- functions answer "could not find the function" until it is applied.
--
-- WHAT UNDOES IT, a person's paste:
--   drop function if exists public.classroom_preview_team_draw(uuid, integer, text[], bigint);
--   drop function if exists public.classroom_draw_teams(uuid, integer, text[], bigint, boolean, text);
--   drop function if exists public._classroom_team_draw(uuid, integer, text[], bigint);
--   drop function if exists public.classroom_swap_team_members(uuid, text, text);
--   drop function if exists public.classroom_add_team(uuid, text);
--   drop function if exists public.classroom_remove_team(uuid);
--   drop function if exists public.classroom_rename_team(uuid, text);
-- Draws already saved stay saved.

do $pre$
begin
	if to_regprocedure('public.classroom_save_team_set(uuid, text, bigint, text, integer, jsonb)') is null then
		raise exception '0307 cannot apply: classroom_save_team_set does not exist. Apply 0223 first.';
	end if;
end
$pre$;

-- ---------------------------------------------------------------------------
-- 1. The draw. One rule, previewed and saved from the same seed.
-- ---------------------------------------------------------------------------

-- THE DRAW, written nowhere: the class's active students (test accounts and
-- the class's own teachers left out, as the roster leaves them out), less the
-- ones named in p_leave_out (an address, a whole roster name, or one word of
-- it), shuffled by the seed, cut into teams of 3 and 4 only. p_size is the
-- size he prefers; the other size makes up the remainder. A class that cannot
-- be cut into 3s and 4s (1, 2 or 5 students) is refused.
create or replace function public._classroom_team_draw(
	p_section_id uuid,
	p_size integer,
	p_leave_out text[],
	p_seed bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_seed bigint := coalesce(p_seed, floor(random() * 1000000000000)::bigint);
	v_size integer := coalesce(p_size, 4);
	v_token text;
	v_hits jsonb;
	v_out text[] := '{}';
	v_unknown text[] := '{}';
	v_ambiguous jsonb := '[]'::jsonb;
	v_n integer;
	v_k integer;
	v_base integer;
	v_extra integer;
	v_teams jsonb := '[]'::jsonb;
	v_list jsonb;
	v_i integer;
	v_at integer := 0;
	v_take integer;
	v_roster jsonb;
begin
	if v_size not in (3, 4) then
		return jsonb_build_object('ok', false, 'reason', 'size', 'message', 'Teams are 3 or 4 students.');
	end if;

	select coalesce(jsonb_agg(jsonb_build_object('email', e.student_email,
			'name', coalesce(nullif(btrim(e.display_name), ''), split_part(e.student_email, '@', 1)))), '[]'::jsonb)
		into v_roster
	from public.classroom_enrollments e
	where e.section_id = p_section_id and e.active
		and not public._classroom_manages_section_email(p_section_id, e.student_email)
		and e.student_email not in (select public._idea_test_emails());

	foreach v_token in array coalesce(p_leave_out, '{}') loop
		v_token := lower(btrim(v_token));
		continue when v_token = '';
		select coalesce(jsonb_agg(jsonb_build_object('email', r.email, 'name', r.name)), '[]'::jsonb) into v_hits
		from jsonb_to_recordset(v_roster) as r(email text, name text)
		where r.email = v_token or lower(r.name) = v_token
			or v_token = any (regexp_split_to_array(lower(r.name), '[ ,]+'));
		if jsonb_array_length(v_hits) = 0 then
			v_unknown := v_unknown || v_token;
		elsif jsonb_array_length(v_hits) > 1 then
			v_ambiguous := v_ambiguous || jsonb_build_array(jsonb_build_object('said', v_token, 'students', v_hits));
		else
			v_out := v_out || (v_hits->0->>'email');
		end if;
	end loop;
	if cardinality(v_unknown) > 0 then
		return jsonb_build_object('ok', false, 'reason', 'unknown_students', 'names', to_jsonb(v_unknown));
	end if;
	if jsonb_array_length(v_ambiguous) > 0 then
		return jsonb_build_object('ok', false, 'reason', 'ambiguous', 'choices', v_ambiguous);
	end if;

	select count(*) into v_n from jsonb_to_recordset(v_roster) as r(email text, name text) where r.email <> all (v_out);
	v_k := case when v_size = 4 then ceil(v_n / 4.0)::integer else floor(v_n / 3.0)::integer end;
	if v_k < 1 or v_n < 3 * v_k or v_n > 4 * v_k then
		v_k := case when v_size = 4 then floor(v_n / 3.0)::integer else ceil(v_n / 4.0)::integer end;
	end if;
	if v_k < 1 or v_n < 3 * v_k or v_n > 4 * v_k then
		return jsonb_build_object('ok', false, 'reason', 'cannot_split', 'students', v_n,
			'message', format('%s students cannot be split into teams of 3 and 4.', v_n));
	end if;
	v_base := v_n / v_k;
	v_extra := v_n % v_k;

	select coalesce(jsonb_agg(jsonb_build_object('email', r.email, 'name', r.name)
			order by md5(v_seed::text || ':' || r.email), r.email), '[]'::jsonb)
		into v_list
	from jsonb_to_recordset(v_roster) as r(email text, name text) where r.email <> all (v_out);

	for v_i in 1 .. v_k loop
		v_take := v_base + case when v_i <= v_extra then 1 else 0 end;
		v_teams := v_teams || jsonb_build_array(jsonb_build_object(
			'team_number', v_i,
			'members', (select coalesce(jsonb_agg(x.m order by x.o), '[]'::jsonb)
				from jsonb_array_elements(v_list) with ordinality as x(m, o)
				where x.o > v_at and x.o <= v_at + v_take)
		));
		v_at := v_at + v_take;
	end loop;

	return jsonb_build_object(
		'ok', true,
		'seed', v_seed,
		'size', v_size,
		'students', v_n,
		'left_out', (select coalesce(jsonb_agg(jsonb_build_object('email', r.email, 'name', r.name) order by r.name), '[]'::jsonb)
			from jsonb_to_recordset(v_roster) as r(email text, name text) where r.email = any (v_out)),
		'teams', v_teams
	);
end;
$f$;

-- READ: the draw he would get, nothing saved. Say the seed back to keep it.
create or replace function public.classroom_preview_team_draw(
	p_section_id uuid,
	p_size integer default 4,
	p_leave_out text[] default '{}',
	p_seed bigint default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
begin
	if (select auth.uid()) is null or not public.classroom_manages_section(p_section_id) then
		raise exception 'That class does not exist.';
	end if;
	return public._classroom_team_draw(p_section_id, p_size, p_leave_out, p_seed);
end;
$f$;

-- SAVE the draw from its seed and, with p_post, show it to the class now.
create or replace function public.classroom_draw_teams(
	p_section_id uuid,
	p_size integer default 4,
	p_leave_out text[] default '{}',
	p_seed bigint default null,
	p_post boolean default false,
	p_label text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_draw jsonb;
	v_set uuid;
begin
	if (select auth.uid()) is null or not public.classroom_manages_section(p_section_id) then
		raise exception 'That class does not exist.';
	end if;
	v_draw := public._classroom_team_draw(p_section_id, p_size, p_leave_out, p_seed);
	if (v_draw->>'ok')::boolean is not true then
		return v_draw;
	end if;
	v_set := public.classroom_save_team_set(
		p_section_id,
		coalesce(nullif(btrim(p_label), ''), 'Teams of ' || (v_draw->>'size') || ', ' || to_char(public._classroom_school_today(), 'Mon FMDD')),
		(v_draw->>'seed')::bigint,
		'size',
		(v_draw->>'size')::integer,
		(select jsonb_agg(jsonb_build_object('team_number', (t->>'team_number')::integer,
				'members', (select jsonb_agg(m->>'email') from jsonb_array_elements(t->'members') m)))
			from jsonb_array_elements(v_draw->'teams') t)
	);
	if coalesce(p_post, false) then
		perform public.classroom_post_team_set(v_set, null);
	end if;
	return v_draw || jsonb_build_object('team_set_id', v_set, 'posted', coalesce(p_post, false));
end;
$f$;

-- ---------------------------------------------------------------------------
-- 2. Editing a draw: swap, add, remove, rename.
-- ---------------------------------------------------------------------------

-- Two students trade teams in one draw: two ordinary moves.
create or replace function public.classroom_swap_team_members(p_team_set_id uuid, p_first text, p_second text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_a text := lower(btrim(coalesce(p_first, '')));
	v_b text := lower(btrim(coalesce(p_second, '')));
	v_team_a uuid;
	v_team_b uuid;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if not exists (select 1 from public.classroom_team_sets s
		where s.id = p_team_set_id and s.archived_at is null and public.classroom_manages_section(s.section_id)) then
		raise exception 'Team set not found.';
	end if;
	select m.team_id into v_team_a from public.classroom_team_members m where m.team_set_id = p_team_set_id and m.student_email = v_a;
	select m.team_id into v_team_b from public.classroom_team_members m where m.team_set_id = p_team_set_id and m.student_email = v_b;
	if v_team_a is null or v_team_b is null then
		return jsonb_build_object('ok', false, 'reason', 'not_on_a_team');
	end if;
	if v_team_a = v_team_b then
		return jsonb_build_object('ok', false, 'reason', 'same_team');
	end if;
	perform public.classroom_move_team_member(p_team_set_id, v_a, v_team_b);
	perform public.classroom_move_team_member(p_team_set_id, v_b, v_team_a);
	return jsonb_build_object('ok', true,
		'first', jsonb_build_object('email', v_a, 'team_id', v_team_b),
		'second', jsonb_build_object('email', v_b, 'team_id', v_team_a));
end;
$f$;

-- A new, empty team at the end of a draw.
create or replace function public.classroom_add_team(p_team_set_id uuid, p_name text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_name text := nullif(btrim(coalesce(p_name, '')), '');
	v_number integer;
	v_id uuid;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	perform 1 from public.classroom_team_sets s
	where s.id = p_team_set_id and s.archived_at is null and public.classroom_manages_section(s.section_id)
	for update;
	if not found then
		raise exception 'Team set not found.';
	end if;
	if v_name is not null and char_length(v_name) > 40 then
		return jsonb_build_object('ok', false, 'reason', 'name_too_long');
	end if;
	select coalesce(max(t.team_number), 0) + 1 into v_number from public.classroom_teams t where t.team_set_id = p_team_set_id;
	insert into public.classroom_teams (team_set_id, team_number, name) values (p_team_set_id, v_number, v_name)
	returning id into v_id;
	return jsonb_build_object('ok', true, 'team_id', v_id, 'team_number', v_number);
end;
$f$;

-- An EMPTY team leaves its draw. A team with anyone on it, or with saved work
-- or a plan of its own, is refused: its work would go with it.
create or replace function public.classroom_remove_team(p_team_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if not exists (select 1 from public.classroom_teams t join public.classroom_team_sets s on s.id = t.team_set_id
		where t.id = p_team_id and s.archived_at is null and public.classroom_manages_section(s.section_id)) then
		raise exception 'That team does not exist.';
	end if;
	if exists (select 1 from public.classroom_team_members m where m.team_id = p_team_id) then
		return jsonb_build_object('ok', false, 'reason', 'not_empty');
	end if;
	if exists (select 1 from public.classroom_team_answers a where a.team_id = p_team_id)
		or exists (select 1 from public.classroom_team_plans p where p.team_id = p_team_id) then
		return jsonb_build_object('ok', false, 'reason', 'has_work');
	end if;
	delete from public.classroom_teams where id = p_team_id;
	return jsonb_build_object('ok', true, 'removed', true);
end;
$f$;

-- A team's name; empty for "Team <n>". Returns the name it had, for undo.
create or replace function public.classroom_rename_team(p_team_id uuid, p_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_name text := nullif(btrim(coalesce(p_name, '')), '');
	v_previous text;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	select t.name into v_previous from public.classroom_teams t join public.classroom_team_sets s on s.id = t.team_set_id
	where t.id = p_team_id and s.archived_at is null and public.classroom_manages_section(s.section_id)
	for update of t;
	if not found then
		raise exception 'That team does not exist.';
	end if;
	if v_name is not null and char_length(v_name) > 40 then
		return jsonb_build_object('ok', false, 'reason', 'name_too_long');
	end if;
	update public.classroom_teams set name = v_name where id = p_team_id;
	return jsonb_build_object('ok', true, 'name', v_name, 'previous', v_previous);
end;
$f$;

revoke all on function public._classroom_team_draw(uuid, integer, text[], bigint) from public, anon, authenticated;
revoke all on function public.classroom_preview_team_draw(uuid, integer, text[], bigint) from public, anon, authenticated;
grant execute on function public.classroom_preview_team_draw(uuid, integer, text[], bigint) to authenticated;
revoke all on function public.classroom_draw_teams(uuid, integer, text[], bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.classroom_draw_teams(uuid, integer, text[], bigint, boolean, text) to authenticated;
revoke all on function public.classroom_swap_team_members(uuid, text, text) from public, anon, authenticated;
grant execute on function public.classroom_swap_team_members(uuid, text, text) to authenticated;
revoke all on function public.classroom_add_team(uuid, text) from public, anon, authenticated;
grant execute on function public.classroom_add_team(uuid, text) to authenticated;
revoke all on function public.classroom_remove_team(uuid) from public, anon, authenticated;
grant execute on function public.classroom_remove_team(uuid) to authenticated;
revoke all on function public.classroom_rename_team(uuid, text) from public, anon, authenticated;
grant execute on function public.classroom_rename_team(uuid, text) to authenticated;

do $check$
declare
	v_n integer;
begin
	select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_team_board';
	if v_n <> 2 then
		raise exception '0307: expected the two classroom_team_board forms (the draw board and the burn-up board), found %.', v_n;
	end if;
	if has_function_privilege('anon', 'public.classroom_draw_teams(uuid, integer, text[], bigint, boolean, text)', 'execute')
		or has_function_privilege('authenticated', 'public._classroom_team_draw(uuid, integer, text[], bigint)', 'execute') then
		raise exception '0307: a team function is executable by a role that must not hold it.';
	end if;
	raise notice '0307: % saved team draws.', (select count(*) from public.classroom_team_sets);
end
$check$;
