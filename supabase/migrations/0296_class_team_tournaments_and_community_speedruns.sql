-- 0296_class_team_tournaments_and_community_speedruns.sql
--
-- LEDGER 0433, docs/feedback/2026-10-23/QUEUE.md items 14 and 15.
--
-- 1. CLASS TEAMS ARE THE SOURCE OF TRUTH FOR A TOURNAMENT'S TEAMS (connector gap
--    5f6a37e8; Mr. Pina 2026-10-23: "class teams are the source of truth;
--    tournaments follow them"). Before this file a class team set and a
--    tournament's entries were set up, and customized, twice.
--
--    * `classroom_teams` gains `description` and `picture_url`, so a team's
--      name, picture, description and style are ONE record.
--    * `tournament_entry_class_teams` links an entry to the class team it
--      follows (one team per entry, one entry per team per tournament). RLS on,
--      no policy, no client grant: the link names a class, and a class roster's
--      audience is the class (0223), never the public bracket.
--    * `_tournament_team_mirror` copies the shared record onto every linked
--      entry and its banner; a trigger on `classroom_teams` runs it, so a save
--      on the class page shows in the bracket. The entry's NAME follows only
--      while the tournament has not started, the rule every tournament name
--      already obeys ("Entry names lock once the bracket is generated").
--    * A save from the tournament side on a linked entry (`tournament_update_entry`,
--      `tournament_set_entry_style`) writes the CLASS team instead, under the
--      class team's own rule (a member of the team, or a teacher of the class),
--      and the mirror carries it back. A student customizes once.
--    * `tournament_take_team_set` (a host who also manages the class) makes or
--      links one entry per team and puts each member with an account on it.
--      An existing entry with the team's name is LINKED rather than duplicated,
--      which is the IDEA-Blade Rotation 2 case in the report.
--    * A teacher moving a student between teams moves them in every linked
--      tournament still taking registrations (a trigger on the membership).
--    * `tournament_unlink_class_team` lets a host stop following; the entry
--      keeps its current copy.
--    * Reads: `tournament_class_linked_entries` (which entries follow a class
--      team, ids only, for the bracket's note), `tournament_team_set_options`
--      (a host's class team sets), `classroom_team_shared` (the class page's
--      description, picture and tournaments, under `classroom_team_board`'s own
--      audience rule).
--    Tournaments made separately keep working unchanged: an entry with no link
--    takes every path it took before.
--
-- 2. GAUNTLET: FIVE NEW SPEEDRUN PARTS AND COMMUNITY SPEEDRUNS (item 15).
--    * Five published Speedrun parts in a new "Shop Hardware" series, from
--      `gauntlet_speedrun_seed.json` at the repo root (its provenance and its
--      geometry). Volumes are exact closed forms; each must pass
--      `gauntlet_publish_blocker` or the file raises. Idempotent on the slug.
--    * `gauntlet_routes`: a student strings 2 to 8 published Speedrun parts into
--      their own speedrun and shares it by link at once. Its board is built
--      ONLY from runs the part boards already rank (`gauntlet_leaderboard`,
--      `rank_state = 'ranked'`), so a held run never counts and the floor, the
--      test-account rule and the run review are inherited rather than restated.
--      A player is on a route's board when they hold a ranked run on every
--      part; the total is the sum of those times.
--    * REVIEW: listing a speedrun for EVERY student needs a GAUNTLET author or
--      an admin (`gauntlet_can_author`, 0155's tier: curating GAUNTLET content
--      is exactly what that tier is for). The only new content is the student's
--      own title and description; the parts are already published and the runs
--      are already reviewed. Editing a listed speedrun sends it back for review.
--
-- ADDITIVE, NO ORDERING: new tables, new functions, two functions replaced under
-- their own signatures with their old behaviour for every unlinked entry, two
-- nullable columns. The client reads every new name best effort.
--
-- UNDO, a person's paste: drop the triggers `classroom_teams_mirror` and
-- `classroom_team_members_follow`; re-run `tournament_update_entry` and
-- `tournament_set_entry_style` from 0192; drop the functions this file creates,
-- then the tables `tournament_entry_class_teams` and `gauntlet_routes`; set the
-- five parts (prompt slug in the seed file) to status 'archived'. The two new
-- `classroom_teams` columns may stay (nothing else reads them).

-- ===========================================================================
-- PART 1. CLASS TEAMS AND TOURNAMENTS
-- ===========================================================================

alter table public.classroom_teams
	add column if not exists description text
		check (description is null or char_length(description) <= 200),
	add column if not exists picture_url text
		check (picture_url is null or char_length(picture_url) <= 600);

create table if not exists public.tournament_entry_class_teams (
	entry_id uuid primary key references public.tournament_entries (id) on delete cascade,
	tournament_id uuid not null references public.tournaments (id) on delete cascade,
	team_id uuid not null references public.classroom_teams (id) on delete cascade,
	linked_by text not null,
	linked_at timestamptz not null default now(),
	constraint tournament_entry_class_teams_one_per_tournament unique (tournament_id, team_id)
);
create index if not exists tournament_entry_class_teams_team_idx
	on public.tournament_entry_class_teams (team_id);
alter table public.tournament_entry_class_teams enable row level security;
revoke all on table public.tournament_entry_class_teams from public, anon, authenticated;

-- May the caller customize this class team: a member of it, or a teacher of
-- its class. 0223's rule, as one boolean the tournament side can ask.
create or replace function public._classroom_team_may_style(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
	select public.current_user_email() <> ''
		and exists (
			select 1
			from public.classroom_teams t
			join public.classroom_team_sets s on s.id = t.team_set_id
			where t.id = p_team_id
				and s.archived_at is null
				and (
					public._classroom_team_member(t.id, public.current_user_email())
					or public.classroom_manages_section(s.section_id) is true
				)
		);
$fn$;
revoke all on function public._classroom_team_may_style(uuid) from public, anon, authenticated;

-- The team's display name, as the class page shows it.
create or replace function public._classroom_team_display_name(p_team public.classroom_teams)
returns text
language sql
immutable
set search_path = ''
as $fn$
	select left(coalesce(nullif(btrim(p_team.name), ''), 'Team ' || p_team.team_number::text), 40);
$fn$;
revoke all on function public._classroom_team_display_name(public.classroom_teams) from public, anon, authenticated;

-- Copy one class team's shared record onto every entry linked to it.
create or replace function public._tournament_team_mirror(p_team_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_t public.classroom_teams;
	v_link record;
	v_n integer := 0;
	v_badge text;
	v_flourish text;
begin
	select * into v_t from public.classroom_teams where id = p_team_id;
	if not found then
		return 0;
	end if;
	for v_link in
		select l.entry_id, l.tournament_id, tr.status
		from public.tournament_entry_class_teams l
		join public.tournaments tr on tr.id = l.tournament_id
		where l.team_id = p_team_id
	loop
		update public.tournament_entries e
		set display_name = case when v_link.status in ('live', 'complete') then e.display_name
				else public._classroom_team_display_name(v_t) end,
			description = coalesce(v_t.description, ''),
			thumbnail_url = v_t.picture_url
		where e.id = v_link.entry_id;

		if v_t.background_type is null and v_t.accent_color is null and v_t.badge is null
			and v_t.flourish is null and v_t.tagline is null then
			delete from public.tournament_entry_styles where entry_id = v_link.entry_id;
		else
			-- The banner tables keep their own allowlists as CHECKs (0064). A
			-- class team badge outside them is shown on the class page and left
			-- off the banner rather than failing the student's save.
			v_badge := v_t.badge;
			v_flourish := v_t.flourish;
			begin
				insert into public.tournament_entry_styles as s (
					entry_id, tournament_id, background_type, background_value,
					accent_color, badge, flourish, tagline, updated_by, updated_at
				)
				values (
					v_link.entry_id, v_link.tournament_id, v_t.background_type, v_t.background_value,
					v_t.accent_color, v_badge, v_flourish, v_t.tagline, (select auth.uid()), now()
				)
				on conflict (entry_id) do update set
					background_type = excluded.background_type,
					background_value = excluded.background_value,
					accent_color = excluded.accent_color,
					badge = excluded.badge,
					flourish = excluded.flourish,
					tagline = excluded.tagline,
					updated_by = excluded.updated_by,
					updated_at = excluded.updated_at;
			exception when check_violation then
				insert into public.tournament_entry_styles as s (
					entry_id, tournament_id, background_type, background_value,
					accent_color, badge, flourish, tagline, updated_by, updated_at
				)
				values (
					v_link.entry_id, v_link.tournament_id, v_t.background_type, v_t.background_value,
					v_t.accent_color, null, null, v_t.tagline, (select auth.uid()), now()
				)
				on conflict (entry_id) do update set
					background_type = excluded.background_type,
					background_value = excluded.background_value,
					accent_color = excluded.accent_color,
					badge = null,
					flourish = null,
					tagline = excluded.tagline,
					updated_by = excluded.updated_by,
					updated_at = excluded.updated_at;
			end;
		end if;
		v_n := v_n + 1;
	end loop;
	return v_n;
end;
$fn$;
revoke all on function public._tournament_team_mirror(uuid) from public, anon, authenticated;

create or replace function public._classroom_teams_mirror_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
	perform public._tournament_team_mirror(new.id);
	return new;
end;
$fn$;
revoke all on function public._classroom_teams_mirror_trigger() from public, anon, authenticated;

drop trigger if exists classroom_teams_mirror on public.classroom_teams;
create trigger classroom_teams_mirror
	after update of name, accent_color, background_type, background_value, badge, flourish,
		tagline, description, picture_url
	on public.classroom_teams
	for each row execute function public._classroom_teams_mirror_trigger();

-- Put one student (by email) on, or take them off, a linked entry, while the
-- tournament still takes registrations. Never raises: a full entry, a student
-- with no account, or one already registered elsewhere in the tournament is
-- simply not added, and the last registrant is never removed.
create or replace function public._tournament_team_follow(
	p_team_id uuid,
	p_email text,
	p_add boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_link record;
	v_user uuid;
	v_name text;
	v_n integer := 0;
begin
	select p.id, left(coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.full_name), ''),
			split_part(p_email, '@', 1)), 40)
		into v_user, v_name
	from public.profiles p
	where lower(p.email) = lower(btrim(p_email))
	limit 1;
	if v_user is null then
		return 0;
	end if;
	for v_link in
		select l.entry_id, l.tournament_id, tr.config
		from public.tournament_entry_class_teams l
		join public.tournaments tr on tr.id = l.tournament_id
		where l.team_id = p_team_id and tr.status in ('registration_open', 'seeding')
	loop
		if p_add then
			if not exists (select 1 from public.tournament_entry_members
					where tournament_id = v_link.tournament_id and user_id = v_user)
				and not exists (select 1 from public.tournament_entries
					where tournament_id = v_link.tournament_id and user_id = v_user)
				and (select count(*) from public.tournament_entry_members where entry_id = v_link.entry_id)
					< public._tournament_team_size(v_link.config) then
				insert into public.tournament_entry_members (entry_id, tournament_id, user_id, name, added_by, created_at)
				values (v_link.entry_id, v_link.tournament_id, v_user, v_name, (select auth.uid()), clock_timestamp());
				v_n := v_n + 1;
			end if;
		else
			if (select count(*) from public.tournament_entry_members where entry_id = v_link.entry_id) > 1 then
				delete from public.tournament_entry_members
				where entry_id = v_link.entry_id and user_id = v_user;
				v_n := v_n + 1;
			end if;
		end if;
	end loop;
	return v_n;
end;
$fn$;
revoke all on function public._tournament_team_follow(uuid, text, boolean) from public, anon, authenticated;

create or replace function public._classroom_team_members_follow_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
	if tg_op in ('DELETE', 'UPDATE') then
		if tg_op = 'DELETE' or old.team_id is distinct from new.team_id then
			perform public._tournament_team_follow(old.team_id, old.student_email, false);
		end if;
	end if;
	if tg_op in ('INSERT', 'UPDATE') then
		if tg_op = 'INSERT' or old.team_id is distinct from new.team_id then
			perform public._tournament_team_follow(new.team_id, new.student_email, true);
		end if;
	end if;
	return null;
end;
$fn$;
revoke all on function public._classroom_team_members_follow_trigger() from public, anon, authenticated;

drop trigger if exists classroom_team_members_follow on public.classroom_team_members;
create trigger classroom_team_members_follow
	after insert or update or delete on public.classroom_team_members
	for each row execute function public._classroom_team_members_follow_trigger();

-- A host who also teaches the class takes a tournament's entries from one of
-- its team sets. Refuses rather than truncates: a team bigger than the
-- tournament's team size stops the whole call and writes nothing.
create or replace function public.tournament_take_team_set(
	p_tournament_id uuid,
	p_team_set_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_email text := public.current_user_email();
	v_uid uuid := (select auth.uid());
	v_t public.tournaments;
	v_set public.classroom_team_sets;
	v_team public.classroom_teams;
	v_size integer;
	v_count integer;
	v_entry uuid;
	v_name text;
	v_created integer := 0;
	v_linked integer := 0;
	v_skipped integer := 0;
	v_added integer := 0;
	v_no_account integer := 0;
	v_member record;
	v_user uuid;
	v_mname text;
begin
	v_t := public._tournament_require_host(p_tournament_id);
	select * into v_t from public.tournaments where id = p_tournament_id for update;
	if v_t.status not in ('registration_open', 'seeding') then
		raise exception 'Teams can only be added while registration is open or during seeding.';
	end if;
	select * into v_set from public.classroom_team_sets where id = p_team_set_id;
	if not found or v_set.archived_at is not null
		or public.classroom_manages_section(v_set.section_id) is not true then
		raise exception 'Team set not found.';
	end if;
	v_size := public._tournament_team_size(v_t.config);

	-- Every team is measured first, so a refusal writes nothing.
	for v_team in select * from public.classroom_teams where team_set_id = p_team_set_id order by team_number loop
		select count(*) into v_count from public.classroom_team_members where team_id = v_team.id;
		if v_count > v_size then
			raise exception '% has % students and this tournament takes teams of up to %. Change the team size in Settings first.',
				public._classroom_team_display_name(v_team), v_count, v_size;
		end if;
	end loop;

	for v_team in select * from public.classroom_teams where team_set_id = p_team_set_id order by team_number loop
		v_name := public._classroom_team_display_name(v_team);
		if exists (select 1 from public.tournament_entry_class_teams
				where tournament_id = p_tournament_id and team_id = v_team.id) then
			v_skipped := v_skipped + 1;
			continue;
		end if;
		-- An entry already made by hand under the same name is linked, not doubled.
		select e.id into v_entry
		from public.tournament_entries e
		where e.tournament_id = p_tournament_id
			and lower(btrim(e.display_name)) = lower(v_name)
			and not exists (select 1 from public.tournament_entry_class_teams l where l.entry_id = e.id)
		order by e.created_at
		limit 1;
		if v_entry is not null then
			-- What the class team has not set yet, it takes from the entry, so a
			-- customization made on the tournament side is not lost.
			update public.classroom_teams ct
			set description = coalesce(ct.description, nullif(e.description, '')),
				picture_url = coalesce(ct.picture_url, e.thumbnail_url),
				accent_color = coalesce(ct.accent_color, st.accent_color),
				tagline = coalesce(ct.tagline, st.tagline),
				background_type = case when ct.background_type is null and st.background_type in ('solid', 'gradient')
					then st.background_type else ct.background_type end,
				background_value = case when ct.background_type is null and st.background_type in ('solid', 'gradient')
					then st.background_value else ct.background_value end,
				badge = coalesce(ct.badge, st.badge),
				flourish = coalesce(ct.flourish, st.flourish)
			from public.tournament_entries e
			left join public.tournament_entry_styles st on st.entry_id = e.id
			where ct.id = v_team.id and e.id = v_entry;
			v_linked := v_linked + 1;
		else
			insert into public.tournament_entries (tournament_id, user_id, display_name, description, thumbnail_url, seed, created_by)
			values (p_tournament_id, null, v_name, coalesce(v_team.description, ''), v_team.picture_url,
				(select coalesce(max(seed), 0) + 1 from public.tournament_entries where tournament_id = p_tournament_id), v_uid)
			returning id into v_entry;
			v_created := v_created + 1;
		end if;
		insert into public.tournament_entry_class_teams (entry_id, tournament_id, team_id, linked_by)
		values (v_entry, p_tournament_id, v_team.id, v_email);

		for v_member in
			select m.student_email, e.display_name as roster_name
			from public.classroom_team_members m
			left join public.classroom_enrollments e on e.section_id = v_set.section_id and e.student_email = m.student_email
			where m.team_id = v_team.id
			order by m.student_email
		loop
			v_user := null;
			select p.id, left(coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.full_name), ''),
					nullif(btrim(v_member.roster_name), ''), split_part(v_member.student_email, '@', 1)), 40)
				into v_user, v_mname
			from public.profiles p where lower(p.email) = v_member.student_email limit 1;
			if v_user is null then
				v_no_account := v_no_account + 1;
				continue;
			end if;
			if exists (select 1 from public.tournament_entry_members where tournament_id = p_tournament_id and user_id = v_user)
				or exists (select 1 from public.tournament_entries where tournament_id = p_tournament_id and user_id = v_user) then
				continue;
			end if;
			if (select count(*) from public.tournament_entry_members where entry_id = v_entry) >= v_size then
				continue;
			end if;
			insert into public.tournament_entry_members (entry_id, tournament_id, user_id, name, added_by, created_at)
			values (v_entry, p_tournament_id, v_user, v_mname, v_uid, clock_timestamp());
			v_added := v_added + 1;
		end loop;

		-- An entry needs at least one registrant (0192). A team nobody on which
		-- has signed in yet carries its own name until somebody does.
		if not exists (select 1 from public.tournament_entry_members where entry_id = v_entry) then
			insert into public.tournament_entry_members (entry_id, tournament_id, user_id, name, added_by, created_at)
			values (v_entry, p_tournament_id, null, v_name, v_uid, clock_timestamp());
		end if;

		perform public._tournament_team_mirror(v_team.id);
	end loop;

	return jsonb_build_object('ok', true, 'created', v_created, 'linked', v_linked, 'already', v_skipped,
		'players_added', v_added, 'no_account', v_no_account);
end;
$fn$;
revoke all on function public.tournament_take_team_set(uuid, uuid) from public, anon, authenticated;
grant execute on function public.tournament_take_team_set(uuid, uuid) to authenticated;

-- Stop following the class team. The entry keeps what it shows now.
create or replace function public.tournament_unlink_class_team(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_tid uuid;
begin
	select tournament_id into v_tid from public.tournament_entries where id = p_entry_id;
	if v_tid is null then
		raise exception 'Entry not found.';
	end if;
	perform public._tournament_require_host(v_tid);
	delete from public.tournament_entry_class_teams where entry_id = p_entry_id;
	return jsonb_build_object('ok', true, 'unlinked', found);
end;
$fn$;
revoke all on function public.tournament_unlink_class_team(uuid) from public, anon, authenticated;
grant execute on function public.tournament_unlink_class_team(uuid) to authenticated;

-- Which entries of a tournament follow a class team. Entry ids only: no class,
-- no team, no roster. Public, like the bracket it annotates.
create or replace function public.tournament_class_linked_entries(p_tournament_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $fn$
	select coalesce(array_agg(l.entry_id order by l.entry_id), '{}'::uuid[])
	from public.tournament_entry_class_teams l
	where l.tournament_id = p_tournament_id;
$fn$;
revoke all on function public.tournament_class_linked_entries(uuid) from public, anon, authenticated;
grant execute on function public.tournament_class_linked_entries(uuid) to anon, authenticated;

-- The class team sets a host may take entries from: live sets of classes the
-- caller manages. Answers an empty list to anybody else.
create or replace function public.tournament_team_set_options(p_tournament_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
	if (select auth.uid()) is null or not public._tournament_can_manage(p_tournament_id) then
		return '[]'::jsonb;
	end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'id', s.id,
			'label', s.label,
			'class', public._coin_classroom_section_label(s.section_id),
			'teams', (select count(*) from public.classroom_teams t where t.team_set_id = s.id),
			'largest', (select coalesce(max(c.n), 0) from (
				select count(*) as n from public.classroom_team_members m where m.team_set_id = s.id group by m.team_id) c),
			'linked_here', (select count(*) from public.tournament_entry_class_teams l
				join public.classroom_teams t on t.id = l.team_id
				where t.team_set_id = s.id and l.tournament_id = p_tournament_id)
		) order by s.created_at desc)
		from public.classroom_team_sets s
		where s.archived_at is null and public.classroom_manages_section(s.section_id) is true
	), '[]'::jsonb);
end;
$fn$;
revoke all on function public.tournament_team_set_options(uuid) from public, anon, authenticated;
grant execute on function public.tournament_team_set_options(uuid) to authenticated;

-- The class page's half of the shared record: each visible team's description,
-- picture and the tournaments it plays in. `classroom_team_board`'s own
-- audience: a teacher of the class, or an enrolled student; posted sets only
-- for a student.
create or replace function public.classroom_team_shared(p_section_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_email text := public.current_user_email();
	v_manages boolean;
begin
	if v_email = '' then
		raise exception 'You must be signed in to read team rosters.';
	end if;
	v_manages := public.classroom_manages_section(p_section_id) is true;
	if not v_manages and not exists (
		select 1 from public.classroom_enrollments e
		where e.section_id = p_section_id and e.student_email = v_email and e.active
	) then
		raise exception 'Not found.';
	end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'team_id', t.id,
			'description', t.description,
			'picture_url', t.picture_url,
			'tournaments', coalesce((
				select jsonb_agg(jsonb_build_object('id', tr.id, 'name', tr.name, 'status', tr.status) order by tr.created_at desc)
				from public.tournament_entry_class_teams l
				join public.tournaments tr on tr.id = l.tournament_id
				where l.team_id = t.id
			), '[]'::jsonb)
		))
		from public.classroom_teams t
		join public.classroom_team_sets s on s.id = t.team_set_id
		where s.section_id = p_section_id
			and s.archived_at is null
			and (v_manages or public._classroom_team_set_visible(s.id))
	), '[]'::jsonb);
end;
$fn$;
revoke all on function public.classroom_team_shared(uuid) from public, anon, authenticated;
grant execute on function public.classroom_team_shared(uuid) to authenticated;

-- A member or a teacher sets the team's description and picture from the class
-- page. The picture is the same kind of address a tournament thumbnail is.
create or replace function public.classroom_set_team_details(
	p_team_id uuid,
	p_description text,
	p_picture_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_desc text := nullif(btrim(coalesce(p_description, '')), '');
	v_pic text := nullif(btrim(coalesce(p_picture_url, '')), '');
begin
	if public.current_user_email() = '' then
		raise exception 'You must be signed in to customize a team.';
	end if;
	if not public._classroom_team_may_style(p_team_id) then
		raise exception 'Team not found.';
	end if;
	if v_desc is not null and char_length(v_desc) > 200 then
		raise exception 'A team description is limited to 200 characters.';
	end if;
	if v_pic is not null and (char_length(v_pic) > 600 or v_pic !~ '^https?://') then
		raise exception 'A team picture must be a web address.';
	end if;
	update public.classroom_teams
	set description = v_desc,
		picture_url = v_pic,
		style_updated_by = public.current_user_email(),
		style_updated_at = now()
	where id = p_team_id;
	return jsonb_build_object('ok', true, 'team_id', p_team_id);
end;
$fn$;
revoke all on function public.classroom_set_team_details(uuid, text, text) from public, anon, authenticated;
grant execute on function public.classroom_set_team_details(uuid, text, text) to authenticated;

-- tournament_update_entry and tournament_set_entry_style: 0192's bodies, each
-- with one branch for an entry that follows a class team. An unlinked entry
-- takes every path it took before.

create or replace function public.tournament_update_entry(
	p_entry_id uuid,
	p_display_name text,
	p_description text default null,
	p_thumbnail_url text default null
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
	v_desc text;
	v_thumb text;
	v_team uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	select * into v_e from public.tournament_entries where id = p_entry_id;
	if not found then
		raise exception 'Entry not found.';
	end if;
	-- The lock first, then every question (the serialization rule).
	select * into v_t from public.tournaments where id = v_e.tournament_id for update;
	if not found then
		raise exception 'Tournament not found.';
	end if;
	-- The entry was read UNLOCKED to learn which tournament to lock; a host
	-- removal can commit in between. Re-read it under the lock so a rename
	-- of a vanished entry is a refusal and not a silent 0-row update.
	select * into v_e from public.tournament_entries where id = p_entry_id;
	if not found then
		raise exception 'Entry not found.';
	end if;
	-- 0296: AN ENTRY THAT FOLLOWS A CLASS TEAM IS EDITED AS THAT TEAM, under the
	-- class team's own rule (a student on it, or a teacher of the class).
	select l.team_id into v_team from public.tournament_entry_class_teams l where l.entry_id = p_entry_id;
	if v_team is not null then
		if not public._classroom_team_may_style(v_team) then
			raise exception 'This team comes from a class. A student on the team or a teacher of the class can change it.';
		end if;
	else
		v_member := exists (
			select 1 from public.tournament_entry_members
			where entry_id = p_entry_id and user_id = v_uid
		);
		if not v_member and not public._tournament_can_manage(v_e.tournament_id) then
			raise exception 'Only a registrant on this entry, a tournament host or a site admin can edit it.';
		end if;
	end if;
	-- ONE RULE, NO HOST CARVE-OUT: the bracket is a printed thing by now.
	if v_t.status in ('live', 'complete') then
		raise exception 'Entry names lock once the bracket is generated.';
	end if;
	if p_display_name is null or btrim(p_display_name) = ''
		or char_length(btrim(p_display_name)) > 40 then
		raise exception 'Display name must be 1 to 40 characters.';
	end if;
	if p_description is not null then
		v_desc := btrim(p_description);
		if char_length(v_desc) > 200 then
			raise exception 'Description is limited to 200 characters.';
		end if;
	end if;
	if p_thumbnail_url is not null then
		v_thumb := btrim(p_thumbnail_url);
		if char_length(v_thumb) > 600 then
			raise exception 'Thumbnail URL is too long.';
		end if;
	end if;
	if v_team is not null then
		update public.classroom_teams
		set name = btrim(p_display_name),
			description = case when p_description is null then description else nullif(v_desc, '') end,
			picture_url = case when p_thumbnail_url is null then picture_url else nullif(v_thumb, '') end,
			style_updated_by = public.current_user_email(),
			style_updated_at = now()
		where id = v_team;
		return p_entry_id;
	end if;
	update public.tournament_entries
	set display_name = btrim(p_display_name),
		description = coalesce(v_desc, description),
		thumbnail_url = case
			when p_thumbnail_url is null then thumbnail_url
			else nullif(v_thumb, '')
		end
	where id = p_entry_id;
	return p_entry_id;
end;
$$;

revoke all on function public.tournament_update_entry(uuid, text, text, text)
	from public, anon, authenticated, service_role;
grant execute on function public.tournament_update_entry(uuid, text, text, text) to authenticated;

create or replace function public.tournament_set_entry_style(
	p_entry_id uuid,
	p_background_type text default null,
	p_background_value jsonb default null,
	p_accent_color text default null,
	p_badge text default null,
	p_flourish text default null,
	p_tagline text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_e public.tournament_entries;
	v_bg_type text := nullif(btrim(coalesce(p_background_type, '')), '');
	v_bg jsonb;
	v_accent text := nullif(lower(btrim(coalesce(p_accent_color, ''))), '');
	v_badge text := nullif(btrim(coalesce(p_badge, '')), '');
	v_flourish text := nullif(btrim(coalesce(p_flourish, '')), '');
	v_tagline text := nullif(btrim(coalesce(p_tagline, '')), '');
	v_team uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in to customize an entry.';
	end if;

	select * into v_e from public.tournament_entries where id = p_entry_id;
	if not found then
		raise exception 'Entry not found.';
	end if;

	-- 0296: an entry that follows a class team is styled as that team.
	select l.team_id into v_team from public.tournament_entry_class_teams l where l.entry_id = p_entry_id;
	if v_team is not null then
		if not public._classroom_team_may_style(v_team) then
			raise exception 'This team comes from a class. A student on the team or a teacher of the class can change it.';
		end if;
		if v_bg_type = 'image' then
			raise exception 'A class team background is a colour or a gradient.';
		end if;
	-- Authorization: a LINKED MEMBER of the entry (the captain included), or a
	-- host or admin standing in for an entry with NO linked member (an
	-- unlinked walk-up). A host or admin may NOT restyle an entry that has a
	-- linked member: that banner is the student's identity.
	elsif exists (
		select 1 from public.tournament_entry_members
		where entry_id = p_entry_id and user_id is not null
	) then
		if not exists (
			select 1 from public.tournament_entry_members
			where entry_id = p_entry_id and user_id = v_uid
		) then
			raise exception 'Only a player on this entry can customize it.';
		end if;
	else
		if not public._tournament_can_manage(v_e.tournament_id) then
			raise exception 'Only a host or a site admin can customize a walk-up entry.';
		end if;
	end if;

	v_bg := public._tournament_normalize_background(v_bg_type, p_background_value);

	if v_accent is not null and v_accent !~ '^#[0-9a-f]{6}$' then
		raise exception 'Accent color must be a hex value like #1f6feb.';
	end if;
	if v_badge is not null and v_badge not in (
		'bolt', 'flame', 'star', 'shield', 'gear', 'skull', 'crown', 'rocket'
	) then
		raise exception 'Unknown badge: %', v_badge;
	end if;
	if v_flourish is not null and v_flourish not in (
		'glow-pulse', 'particle-trail', 'screen-shake-on-elimination', 'confetti-on-win'
	) then
		raise exception 'Unknown flourish: %', v_flourish;
	end if;
	if v_tagline is not null and char_length(v_tagline) > 48 then
		raise exception 'Tagline must be 48 characters or fewer.';
	end if;

	if v_team is not null then
		update public.classroom_teams
		set accent_color = v_accent,
			background_type = v_bg_type,
			background_value = case when v_bg_type is null then null else v_bg end,
			badge = v_badge,
			flourish = v_flourish,
			tagline = v_tagline,
			style_updated_by = public.current_user_email(),
			style_updated_at = now()
		where id = v_team;
		return p_entry_id;
	end if;

	-- Nothing set at all: clear the row, back to the default treatment.
	if v_bg_type is null and v_accent is null and v_badge is null
		and v_flourish is null and v_tagline is null then
		delete from public.tournament_entry_styles where entry_id = p_entry_id;
		return null;
	end if;

	insert into public.tournament_entry_styles as s (
		entry_id, tournament_id, background_type, background_value,
		accent_color, badge, flourish, tagline, updated_by, updated_at
	)
	values (
		p_entry_id, v_e.tournament_id, v_bg_type, v_bg,
		v_accent, v_badge, v_flourish, v_tagline, v_uid, now()
	)
	on conflict (entry_id) do update set
		background_type = excluded.background_type,
		background_value = excluded.background_value,
		accent_color = excluded.accent_color,
		badge = excluded.badge,
		flourish = excluded.flourish,
		tagline = excluded.tagline,
		updated_by = excluded.updated_by,
		updated_at = excluded.updated_at
	where s.entry_id = p_entry_id;

	return p_entry_id;
end;
$$;

revoke all on function public.tournament_set_entry_style(
	uuid, text, jsonb, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.tournament_set_entry_style(
	uuid, text, jsonb, text, text, text, text
) to authenticated;


-- ===========================================================================
-- PART 2. GAUNTLET: COMMUNITY SPEEDRUNS
-- ===========================================================================

create table if not exists public.gauntlet_routes (
	id uuid primary key default gen_random_uuid(),
	owner_id uuid not null references auth.users (id) on delete cascade,
	title text not null check (char_length(btrim(title)) between 1 and 60),
	description text not null default '' check (char_length(description) <= 280),
	challenge_ids uuid[] not null check (cardinality(challenge_ids) between 2 and 8),
	-- private: the owner and anyone holding the link. pending: asked to be
	-- listed. listed: on every student's list. hidden: taken down by a reviewer.
	status text not null default 'private' check (status in ('private', 'pending', 'listed', 'hidden')),
	reviewed_by text,
	reviewed_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
create index if not exists gauntlet_routes_owner_idx on public.gauntlet_routes (owner_id);
create index if not exists gauntlet_routes_status_idx on public.gauntlet_routes (status);
alter table public.gauntlet_routes enable row level security;
revoke all on table public.gauntlet_routes from public, anon, authenticated;

-- Why a list of parts cannot make a speedrun, or null when it can.
create or replace function public._gauntlet_route_parts_problem(p_ids uuid[])
returns text
language sql
stable
security definer
set search_path = ''
as $fn$
	select case
		when p_ids is null or cardinality(p_ids) < 2 then 'Pick at least 2 parts.'
		when cardinality(p_ids) > 8 then 'A speedrun holds at most 8 parts.'
		when (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids) then 'Each part can be in a speedrun once.'
		when (select count(*) from public.challenges c
			where c.id = any(p_ids) and c.mode = 'speedrun' and c.published) <> cardinality(p_ids)
			then 'Every part must be a published Speedrun part.'
	end;
$fn$;
revoke all on function public._gauntlet_route_parts_problem(uuid[]) from public, anon, authenticated;

-- Make or edit one of your own speedruns. Editing a listed or pending one sends
-- it back for review.
create or replace function public.gauntlet_route_save(
	p_route_id uuid,
	p_title text,
	p_description text,
	p_challenge_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_uid uuid := (select auth.uid());
	v_title text := btrim(coalesce(p_title, ''));
	v_desc text := btrim(coalesce(p_description, ''));
	v_problem text;
	v_id uuid;
	v_status text;
begin
	if v_uid is null then
		raise exception 'Sign in to make a speedrun.';
	end if;
	if char_length(v_title) not between 1 and 60 then
		raise exception 'A speedrun name must be 1 to 60 characters.';
	end if;
	if char_length(v_desc) > 280 then
		raise exception 'A description is limited to 280 characters.';
	end if;
	v_problem := public._gauntlet_route_parts_problem(p_challenge_ids);
	if v_problem is not null then
		raise exception '%', v_problem;
	end if;
	if p_route_id is null then
		if (select count(*) from public.gauntlet_routes where owner_id = v_uid) >= 20 then
			raise exception 'You can keep up to 20 speedruns. Delete one to make another.';
		end if;
		insert into public.gauntlet_routes (owner_id, title, description, challenge_ids)
		values (v_uid, v_title, v_desc, p_challenge_ids)
		returning id into v_id;
		return v_id;
	end if;
	select status into v_status from public.gauntlet_routes where id = p_route_id and owner_id = v_uid for update;
	if not found then
		raise exception 'Speedrun not found.';
	end if;
	update public.gauntlet_routes
	set title = v_title,
		description = v_desc,
		challenge_ids = p_challenge_ids,
		status = case when v_status = 'listed' then 'pending' else v_status end,
		updated_at = now()
	where id = p_route_id;
	return p_route_id;
end;
$fn$;
revoke all on function public.gauntlet_route_save(uuid, text, text, uuid[]) from public, anon, authenticated;
grant execute on function public.gauntlet_route_save(uuid, text, text, uuid[]) to authenticated;

-- The owner asks for it to be listed for everyone, or takes it back to link-only.
create or replace function public.gauntlet_route_share(p_route_id uuid, p_list boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_status text;
begin
	select status into v_status from public.gauntlet_routes
	where id = p_route_id and owner_id = (select auth.uid()) for update;
	if not found then
		raise exception 'Speedrun not found.';
	end if;
	if v_status = 'hidden' then
		raise exception 'A teacher took this speedrun down. Make a new one to share.';
	end if;
	v_status := case when coalesce(p_list, false) then
		case when v_status = 'listed' then 'listed' else 'pending' end
		else 'private' end;
	update public.gauntlet_routes set status = v_status, updated_at = now() where id = p_route_id;
	return v_status;
end;
$fn$;
revoke all on function public.gauntlet_route_share(uuid, boolean) from public, anon, authenticated;
grant execute on function public.gauntlet_route_share(uuid, boolean) to authenticated;

-- A GAUNTLET author or an admin lists, hides or returns one.
create or replace function public.gauntlet_route_review(p_route_id uuid, p_decision text)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_status text;
begin
	if not public.gauntlet_can_author() then
		raise exception 'Speedrun not found.';
	end if;
	v_status := case p_decision when 'list' then 'listed' when 'hide' then 'hidden' when 'return' then 'private' end;
	if v_status is null then
		raise exception 'Choose list, hide or return.';
	end if;
	update public.gauntlet_routes
	set status = v_status, reviewed_by = public.current_user_email(), reviewed_at = now(), updated_at = now()
	where id = p_route_id;
	if not found then
		raise exception 'Speedrun not found.';
	end if;
	return v_status;
end;
$fn$;
revoke all on function public.gauntlet_route_review(uuid, text) from public, anon, authenticated;
grant execute on function public.gauntlet_route_review(uuid, text) to authenticated;

create or replace function public.gauntlet_route_delete(p_route_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
	delete from public.gauntlet_routes
	where id = p_route_id and (owner_id = (select auth.uid()) or public.is_admin());
	if not found then
		raise exception 'Speedrun not found.';
	end if;
end;
$fn$;
revoke all on function public.gauntlet_route_delete(uuid) from public, anon, authenticated;
grant execute on function public.gauntlet_route_delete(uuid) to authenticated;

-- One route's board: players holding a RANKED run on every part, by total time.
-- Read through `gauntlet_leaderboard`, so the floor, the held state and the
-- test-account rule are the part boards' own.
create or replace function public._gauntlet_route_board(p_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
	with ranked as (
		select gl.user_id, gl.player, gl.challenge_id, gl.score_metric
		from public.gauntlet_leaderboard gl
		where gl.challenge_id = any(p_ids) and gl.rank_state = 'ranked' and gl.score_metric is not null
	),
	complete as (
		select r.user_id, max(r.player) as player, sum(r.score_metric) as total, max(r.score_metric) as slowest
		from ranked r
		group by r.user_id
		having count(distinct r.challenge_id) = cardinality(p_ids)
	)
	select coalesce(jsonb_agg(jsonb_build_object(
		'rank', b.rank, 'player', b.player, 'total_seconds', b.total, 'me', b.user_id = (select auth.uid()))
		order by b.rank, b.player), '[]'::jsonb)
	from (
		select c.*, rank() over (order by c.total asc) as rank
		from complete c
		order by c.total asc
		limit 50
	) b;
$fn$;
revoke all on function public._gauntlet_route_board(uuid[]) from public, anon, authenticated;

-- Visible to the caller: listed; or your own; or, for a reviewer, everything;
-- or, by its link, any route that has not been taken down.
create or replace function public._gauntlet_route_visible(p_route public.gauntlet_routes, p_by_link boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
	select (select auth.uid()) is not null and (
		p_route.status = 'listed'
		or p_route.owner_id = (select auth.uid())
		or public.gauntlet_can_author()
		or (p_by_link and p_route.status in ('private', 'pending'))
	);
$fn$;
revoke all on function public._gauntlet_route_visible(public.gauntlet_routes, boolean) from public, anon, authenticated;

create or replace function public._gauntlet_route_json(p_route public.gauntlet_routes, p_detail boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
	select jsonb_build_object(
		'id', p_route.id,
		'title', p_route.title,
		'description', p_route.description,
		'author', coalesce((select nullif(btrim(p.full_name), '') from public.profiles p where p.id = p_route.owner_id), 'Player'),
		'mine', p_route.owner_id = (select auth.uid()),
		-- The review state is the owner's and a reviewer's to see.
		'status', case when p_route.owner_id = (select auth.uid()) or public.gauntlet_can_author() then p_route.status end,
		'part_count', cardinality(p_route.challenge_ids),
		'created_at', p_route.created_at,
		'parts', case when p_detail then (
			select coalesce(jsonb_agg(jsonb_build_object(
				'id', c.id, 'title', c.title, 'difficulty', c.difficulty, 'published', c.published,
				'my_seconds', mine.score_metric, 'my_state', mine.rank_state) order by x.ord), '[]'::jsonb)
			from unnest(p_route.challenge_ids) with ordinality as x(cid, ord)
			join public.challenges c on c.id = x.cid
			left join public.gauntlet_leaderboard mine on mine.challenge_id = c.id and mine.user_id = (select auth.uid())
		) end,
		'board', case when p_detail then public._gauntlet_route_board(p_route.challenge_ids) end
	);
$fn$;
revoke all on function public._gauntlet_route_json(public.gauntlet_routes, boolean) from public, anon, authenticated;

create or replace function public.gauntlet_routes()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
	if (select auth.uid()) is null then
		raise exception 'Sign in to see speedruns.';
	end if;
	return jsonb_build_object(
		'can_review', public.gauntlet_can_author(),
		'routes', coalesce((
			select jsonb_agg(public._gauntlet_route_json(r, false)
				order by (r.owner_id = (select auth.uid())) desc, (r.status = 'pending') desc, r.created_at desc)
			from public.gauntlet_routes r
			where r.status = 'listed'
				or r.owner_id = (select auth.uid())
				or (public.gauntlet_can_author() and r.status in ('pending', 'hidden'))
		), '[]'::jsonb));
end;
$fn$;
revoke all on function public.gauntlet_routes() from public, anon, authenticated;
grant execute on function public.gauntlet_routes() to authenticated;

create or replace function public.gauntlet_route(p_route_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_r public.gauntlet_routes;
begin
	select * into v_r from public.gauntlet_routes where id = p_route_id;
	if not found or not public._gauntlet_route_visible(v_r, true) then
		raise exception 'Speedrun not found.';
	end if;
	return public._gauntlet_route_json(v_r, true) || jsonb_build_object('can_review', public.gauntlet_can_author());
end;
$fn$;
revoke all on function public.gauntlet_route(uuid) from public, anon, authenticated;
grant execute on function public.gauntlet_route(uuid) to authenticated;

-- ===========================================================================
-- PART 3. FIVE NEW SPEEDRUN PARTS ("Shop Hardware")
--
-- Generated from gauntlet_speedrun_seed.json; tests/db/gauntlet-community-0296.test.ts
-- checks every stored value against that file and recomputes each volume from
-- its geometry. Inside a do block (a seed row is never top-level DML). A part
-- whose slug already exists is left alone, so a re-paste inserts nothing.
-- ===========================================================================

do $seed$
declare
	v_series uuid;
	v_author uuid := (select p.id from public.profiles p where lower(p.email) = public.admin_owner_email() limit 1);
	v_row record;
	v_blocker text;
	v_new integer := 0;
	v_kept integer := 0;
begin
	select id into v_series from public.gauntlet_series where name = 'Shop Hardware' limit 1;
	if v_series is null then
		insert into public.gauntlet_series (name, description, sort_order, author_id)
		values ('Shop Hardware', 'Five real shop parts: a standoff, an angle, a bearing block, a collar and a motor plate.',
			(select coalesce(max(sort_order), 0) + 1 from public.gauntlet_series), v_author)
		returning id into v_series;
	end if;
	for v_row in
		select * from (values
		($part$hex-standoff-10af$part$, $part$Hex Standoff$part$, 1, 1, $part${"material": "Brass", "density_unit": "g/cm³", "mass_unit": "g", "length_unit": "mm", "note": "Model the part from the revealed drawing. Apply Brass.", "slug": "hex-standoff-10af", "unit_system": "MMGS", "par_time": 90}$part$::jsonb, $part${"drawing": "<svg viewBox=\"0 0 600 380\" xmlns=\"http://www.w3.org/2000/svg\"><polygon points=\"181.96,170.00 155.98,215.00 104.02,215.00 78.04,170.00 104.02,125.00 155.98,125.00\" fill=\"none\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><circle cx=\"130.00\" cy=\"170.00\" r=\"22.50\" fill=\"none\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><line x1=\"66.04\" y1=\"170.00\" x2=\"193.96\" y2=\"170.00\" stroke=\"#00f0ff\" stroke-width=\"1\" stroke-dasharray=\"14 4 3 4\"/><line x1=\"130.00\" y1=\"113.00\" x2=\"130.00\" y2=\"227.00\" stroke=\"#00f0ff\" stroke-width=\"1\" stroke-dasharray=\"14 4 3 4\"/><line x1=\"104.02\" y1=\"125.00\" x2=\"44.04\" y2=\"125.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"104.02\" y1=\"215.00\" x2=\"44.04\" y2=\"215.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"48.04\" y1=\"125.00\" x2=\"48.04\" y2=\"215.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"48.04,125.00 51.04,133.00 45.04,133.00\" fill=\"#00f0ff\"/><polygon points=\"48.04,215.00 45.04,207.00 51.04,207.00\" fill=\"#00f0ff\"/><text x=\"37.04\" y=\"170.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"middle\" dominant-baseline=\"central\" transform=\"rotate(-90 37.04 170.00)\">10 A/F</text><line x1=\"145.75\" y1=\"154.25\" x2=\"190.00\" y2=\"90.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"145.75,154.25 147.82,145.96 152.76,149.36\" fill=\"#00f0ff\"/><line x1=\"190.00\" y1=\"90.00\" x2=\"250.00\" y2=\"90.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><text x=\"194.00\" y=\"81.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"start\" dominant-baseline=\"central\">Ø5 THRU</text><text x=\"130.00\" y=\"290.00\" fill=\"#e8ffe8\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"11\" text-anchor=\"middle\" dominant-baseline=\"central\">FRONT</text><polygon points=\"300.00,125.00 525.00,125.00 525.00,215.00 300.00,215.00\" fill=\"none\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><line x1=\"300.00\" y1=\"170.00\" x2=\"525.00\" y2=\"170.00\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><line x1=\"300.00\" y1=\"147.50\" x2=\"525.00\" y2=\"147.50\" stroke=\"#e8ffe8\" stroke-width=\"1.2\" stroke-dasharray=\"6 4\"/><line x1=\"300.00\" y1=\"192.50\" x2=\"525.00\" y2=\"192.50\" stroke=\"#e8ffe8\" stroke-width=\"1.2\" stroke-dasharray=\"6 4\"/><line x1=\"288.00\" y1=\"170.00\" x2=\"537.00\" y2=\"170.00\" stroke=\"#00f0ff\" stroke-width=\"1\" stroke-dasharray=\"14 4 3 4\"/><line x1=\"300.00\" y1=\"125.00\" x2=\"300.00\" y2=\"91.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"525.00\" y1=\"125.00\" x2=\"525.00\" y2=\"91.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"300.00\" y1=\"95.00\" x2=\"525.00\" y2=\"95.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"300.00,95.00 308.00,92.00 308.00,98.00\" fill=\"#00f0ff\"/><polygon points=\"525.00,95.00 517.00,98.00 517.00,92.00\" fill=\"#00f0ff\"/><text x=\"412.50\" y=\"85.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"middle\" dominant-baseline=\"central\">25</text><text x=\"412.50\" y=\"290.00\" fill=\"#e8ffe8\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"11\" text-anchor=\"middle\" dominant-baseline=\"central\">RIGHT</text><polygon points=\"400.00,318.00 590.00,318.00 590.00,370.00 400.00,370.00\" fill=\"none\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><text x=\"408.00\" y=\"330.00\" fill=\"#e8ffe8\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"start\" dominant-baseline=\"central\">HEX STANDOFF</text><text x=\"408.00\" y=\"346.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"11\" text-anchor=\"start\" dominant-baseline=\"central\">BRASS</text><text x=\"408.00\" y=\"361.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"10\" text-anchor=\"start\" dominant-baseline=\"central\">MM  THIRD ANGLE  ALL HOLES THRU</text></svg>", "target_volume_mm3": 1674.1897, "feature_count": 2, "target_mass": 14.2306, "density": 8.5, "tolerance_pct": 0.1}$part$::jsonb),
		($part$angle-bracket-50x5$part$, $part$Angle Bracket$part$, 2, 2, $part${"material": "Plain Carbon Steel", "density_unit": "g/cm³", "mass_unit": "g", "length_unit": "mm", "note": "Model the part from the revealed drawing. Apply Plain Carbon Steel.", "slug": "angle-bracket-50x5", "unit_system": "MMGS", "par_time": 150}$part$::jsonb, $part${"drawing": "<svg viewBox=\"0 0 600 380\" xmlns=\"http://www.w3.org/2000/svg\"><polygon points=\"60.00,250.00 220.00,250.00 220.00,234.00 76.00,234.00 76.00,90.00 60.00,90.00\" fill=\"none\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><line x1=\"60.00\" y1=\"250.00\" x2=\"60.00\" y2=\"280.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"220.00\" y1=\"250.00\" x2=\"220.00\" y2=\"280.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"60.00\" y1=\"276.00\" x2=\"220.00\" y2=\"276.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"60.00,276.00 68.00,273.00 68.00,279.00\" fill=\"#00f0ff\"/><polygon points=\"220.00,276.00 212.00,279.00 212.00,273.00\" fill=\"#00f0ff\"/><text x=\"140.00\" y=\"287.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"middle\" dominant-baseline=\"central\">50</text><line x1=\"60.00\" y1=\"250.00\" x2=\"30.00\" y2=\"250.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"60.00\" y1=\"90.00\" x2=\"30.00\" y2=\"90.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"34.00\" y1=\"250.00\" x2=\"34.00\" y2=\"90.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"34.00,250.00 31.00,242.00 37.00,242.00\" fill=\"#00f0ff\"/><polygon points=\"34.00,90.00 37.00,98.00 31.00,98.00\" fill=\"#00f0ff\"/><text x=\"23.00\" y=\"170.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"middle\" dominant-baseline=\"central\" transform=\"rotate(-90 23.00 170.00)\">50</text><line x1=\"76.00\" y1=\"94.00\" x2=\"116.00\" y2=\"72.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"76.00,94.00 81.56,87.52 84.46,92.77\" fill=\"#00f0ff\"/><line x1=\"116.00\" y1=\"72.00\" x2=\"176.00\" y2=\"72.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><text x=\"120.00\" y=\"63.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"start\" dominant-baseline=\"central\">THK 5 BOTH LEGS</text><line x1=\"60.00\" y1=\"145.20\" x2=\"76.00\" y2=\"145.20\" stroke=\"#e8ffe8\" stroke-width=\"1.2\" stroke-dasharray=\"6 4\"/><line x1=\"60.00\" y1=\"162.80\" x2=\"76.00\" y2=\"162.80\" stroke=\"#e8ffe8\" stroke-width=\"1.2\" stroke-dasharray=\"6 4\"/><line x1=\"147.20\" y1=\"250.00\" x2=\"147.20\" y2=\"234.00\" stroke=\"#e8ffe8\" stroke-width=\"1.2\" stroke-dasharray=\"6 4\"/><line x1=\"164.80\" y1=\"250.00\" x2=\"164.80\" y2=\"234.00\" stroke=\"#e8ffe8\" stroke-width=\"1.2\" stroke-dasharray=\"6 4\"/><text x=\"140.00\" y=\"330.00\" fill=\"#e8ffe8\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"11\" text-anchor=\"middle\" dominant-baseline=\"central\">FRONT</text><polygon points=\"300.00,90.00 428.00,90.00 428.00,250.00 300.00,250.00\" fill=\"none\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><line x1=\"300.00\" y1=\"234.00\" x2=\"428.00\" y2=\"234.00\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><circle cx=\"332.00\" cy=\"154.00\" r=\"8.80\" fill=\"none\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><line x1=\"332.00\" y1=\"140.00\" x2=\"332.00\" y2=\"168.00\" stroke=\"#00f0ff\" stroke-width=\"1\" stroke-dasharray=\"14 4 3 4\"/><circle cx=\"396.00\" cy=\"154.00\" r=\"8.80\" fill=\"none\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><line x1=\"396.00\" y1=\"140.00\" x2=\"396.00\" y2=\"168.00\" stroke=\"#00f0ff\" stroke-width=\"1\" stroke-dasharray=\"14 4 3 4\"/><line x1=\"300.00\" y1=\"90.00\" x2=\"300.00\" y2=\"68.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"332.00\" y1=\"90.00\" x2=\"332.00\" y2=\"68.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"300.00\" y1=\"72.00\" x2=\"332.00\" y2=\"72.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"300.00,72.00 308.00,69.00 308.00,75.00\" fill=\"#00f0ff\"/><polygon points=\"332.00,72.00 324.00,75.00 324.00,69.00\" fill=\"#00f0ff\"/><text x=\"316.00\" y=\"62.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"middle\" dominant-baseline=\"central\">10</text><line x1=\"332.00\" y1=\"90.00\" x2=\"332.00\" y2=\"68.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"396.00\" y1=\"90.00\" x2=\"396.00\" y2=\"68.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"332.00\" y1=\"72.00\" x2=\"396.00\" y2=\"72.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"332.00,72.00 340.00,69.00 340.00,75.00\" fill=\"#00f0ff\"/><polygon points=\"396.00,72.00 388.00,75.00 388.00,69.00\" fill=\"#00f0ff\"/><text x=\"364.00\" y=\"62.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"middle\" dominant-baseline=\"central\">20</text><line x1=\"428.00\" y1=\"250.00\" x2=\"456.00\" y2=\"250.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"428.00\" y1=\"154.00\" x2=\"456.00\" y2=\"154.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"452.00\" y1=\"250.00\" x2=\"452.00\" y2=\"154.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"452.00,250.00 449.00,242.00 455.00,242.00\" fill=\"#00f0ff\"/><polygon points=\"452.00,154.00 455.00,162.00 449.00,162.00\" fill=\"#00f0ff\"/><text x=\"463.00\" y=\"202.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"middle\" dominant-baseline=\"central\" transform=\"rotate(-90 463.00 202.00)\">30</text><line x1=\"402.16\" y1=\"147.84\" x2=\"468.00\" y2=\"100.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"402.16,147.84 406.87,140.71 410.40,145.56\" fill=\"#00f0ff\"/><line x1=\"468.00\" y1=\"100.00\" x2=\"528.00\" y2=\"100.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><text x=\"472.00\" y=\"91.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"start\" dominant-baseline=\"central\">4X Ø5.5 THRU</text><text x=\"364.00\" y=\"266.00\" fill=\"#e8ffe8\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"10\" text-anchor=\"middle\" dominant-baseline=\"central\">HORIZONTAL LEG: SAME 2 HOLES, 30 FROM BACK FACE</text><text x=\"364.00\" y=\"330.00\" fill=\"#e8ffe8\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"11\" text-anchor=\"middle\" dominant-baseline=\"central\">RIGHT</text><polygon points=\"400.00,318.00 590.00,318.00 590.00,370.00 400.00,370.00\" fill=\"none\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><text x=\"408.00\" y=\"330.00\" fill=\"#e8ffe8\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"start\" dominant-baseline=\"central\">ANGLE BRACKET</text><text x=\"408.00\" y=\"346.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"11\" text-anchor=\"start\" dominant-baseline=\"central\">PLAIN CARBON STEEL</text><text x=\"408.00\" y=\"361.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"10\" text-anchor=\"start\" dominant-baseline=\"central\">MM  THIRD ANGLE  ALL HOLES THRU</text></svg>", "target_volume_mm3": 18524.8341, "feature_count": 3, "target_mass": 144.4937, "density": 7.8, "tolerance_pct": 0.1}$part$::jsonb),
		($part$bearing-block-22$part$, $part$Bearing Block$part$, 2, 3, $part${"material": "6061 Alloy", "density_unit": "g/cm³", "mass_unit": "g", "length_unit": "mm", "note": "Model the part from the revealed drawing. Apply 6061 Alloy.", "slug": "bearing-block-22", "unit_system": "MMGS", "par_time": 180}$part$::jsonb, $part${"drawing": "<svg viewBox=\"0 0 600 380\" xmlns=\"http://www.w3.org/2000/svg\"><polygon points=\"50.00,142.00 266.00,142.00 266.00,250.00 50.00,250.00\" fill=\"none\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><circle cx=\"158.00\" cy=\"185.20\" r=\"39.60\" fill=\"none\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><line x1=\"106.40\" y1=\"185.20\" x2=\"209.60\" y2=\"185.20\" stroke=\"#00f0ff\" stroke-width=\"1\" stroke-dasharray=\"14 4 3 4\"/><line x1=\"158.00\" y1=\"133.60\" x2=\"158.00\" y2=\"236.80\" stroke=\"#00f0ff\" stroke-width=\"1\" stroke-dasharray=\"14 4 3 4\"/><line x1=\"74.30\" y1=\"250.00\" x2=\"74.30\" y2=\"142.00\" stroke=\"#e8ffe8\" stroke-width=\"1.2\" stroke-dasharray=\"6 4\"/><line x1=\"97.70\" y1=\"250.00\" x2=\"97.70\" y2=\"142.00\" stroke=\"#e8ffe8\" stroke-width=\"1.2\" stroke-dasharray=\"6 4\"/><line x1=\"218.30\" y1=\"250.00\" x2=\"218.30\" y2=\"142.00\" stroke=\"#e8ffe8\" stroke-width=\"1.2\" stroke-dasharray=\"6 4\"/><line x1=\"241.70\" y1=\"250.00\" x2=\"241.70\" y2=\"142.00\" stroke=\"#e8ffe8\" stroke-width=\"1.2\" stroke-dasharray=\"6 4\"/><line x1=\"50.00\" y1=\"250.00\" x2=\"50.00\" y2=\"282.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"266.00\" y1=\"250.00\" x2=\"266.00\" y2=\"282.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"50.00\" y1=\"278.00\" x2=\"266.00\" y2=\"278.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"50.00,278.00 58.00,275.00 58.00,281.00\" fill=\"#00f0ff\"/><polygon points=\"266.00,278.00 258.00,281.00 258.00,275.00\" fill=\"#00f0ff\"/><text x=\"158.00\" y=\"289.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"middle\" dominant-baseline=\"central\">60</text><line x1=\"50.00\" y1=\"250.00\" x2=\"22.00\" y2=\"250.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"50.00\" y1=\"142.00\" x2=\"22.00\" y2=\"142.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"26.00\" y1=\"250.00\" x2=\"26.00\" y2=\"142.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"26.00,250.00 23.00,242.00 29.00,242.00\" fill=\"#00f0ff\"/><polygon points=\"26.00,142.00 29.00,150.00 23.00,150.00\" fill=\"#00f0ff\"/><text x=\"15.00\" y=\"196.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"middle\" dominant-baseline=\"central\" transform=\"rotate(-90 15.00 196.00)\">30</text><line x1=\"50.00\" y1=\"142.00\" x2=\"50.00\" y2=\"118.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"158.00\" y1=\"142.00\" x2=\"158.00\" y2=\"118.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"50.00\" y1=\"122.00\" x2=\"158.00\" y2=\"122.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"50.00,122.00 58.00,119.00 58.00,125.00\" fill=\"#00f0ff\"/><polygon points=\"158.00,122.00 150.00,125.00 150.00,119.00\" fill=\"#00f0ff\"/><text x=\"104.00\" y=\"112.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"middle\" dominant-baseline=\"central\">30</text><line x1=\"266.00\" y1=\"250.00\" x2=\"292.00\" y2=\"250.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"266.00\" y1=\"185.20\" x2=\"292.00\" y2=\"185.20\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"288.00\" y1=\"250.00\" x2=\"288.00\" y2=\"185.20\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"288.00,250.00 285.00,242.00 291.00,242.00\" fill=\"#00f0ff\"/><polygon points=\"288.00,185.20 291.00,193.20 285.00,193.20\" fill=\"#00f0ff\"/><text x=\"299.00\" y=\"217.60\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"middle\" dominant-baseline=\"central\" transform=\"rotate(-90 299.00 217.60)\">18</text><line x1=\"185.72\" y1=\"157.48\" x2=\"208.00\" y2=\"96.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"185.72,157.48 185.63,148.94 191.27,150.98\" fill=\"#00f0ff\"/><line x1=\"208.00\" y1=\"96.00\" x2=\"268.00\" y2=\"96.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><text x=\"212.00\" y=\"87.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"start\" dominant-baseline=\"central\">Ø22 THRU</text><text x=\"158.00\" y=\"335.00\" fill=\"#e8ffe8\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"11\" text-anchor=\"middle\" dominant-baseline=\"central\">FRONT</text><polygon points=\"330.00,60.00 481.20,60.00 481.20,160.80 330.00,160.80\" fill=\"none\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><circle cx=\"355.20\" cy=\"110.40\" r=\"8.19\" fill=\"none\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><line x1=\"355.20\" y1=\"98.40\" x2=\"355.20\" y2=\"122.40\" stroke=\"#00f0ff\" stroke-width=\"1\" stroke-dasharray=\"14 4 3 4\"/><circle cx=\"456.00\" cy=\"110.40\" r=\"8.19\" fill=\"none\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><line x1=\"456.00\" y1=\"98.40\" x2=\"456.00\" y2=\"122.40\" stroke=\"#00f0ff\" stroke-width=\"1\" stroke-dasharray=\"14 4 3 4\"/><line x1=\"377.88\" y1=\"60.00\" x2=\"377.88\" y2=\"160.80\" stroke=\"#e8ffe8\" stroke-width=\"1.2\" stroke-dasharray=\"6 4\"/><line x1=\"433.32\" y1=\"60.00\" x2=\"433.32\" y2=\"160.80\" stroke=\"#e8ffe8\" stroke-width=\"1.2\" stroke-dasharray=\"6 4\"/><line x1=\"481.20\" y1=\"60.00\" x2=\"507.20\" y2=\"60.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"481.20\" y1=\"160.80\" x2=\"507.20\" y2=\"160.80\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"503.20\" y1=\"60.00\" x2=\"503.20\" y2=\"160.80\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"503.20,60.00 506.20,68.00 500.20,68.00\" fill=\"#00f0ff\"/><polygon points=\"503.20,160.80 500.20,152.80 506.20,152.80\" fill=\"#00f0ff\"/><text x=\"514.20\" y=\"110.40\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"middle\" dominant-baseline=\"central\" transform=\"rotate(-90 514.20 110.40)\">40</text><line x1=\"330.00\" y1=\"60.00\" x2=\"306.00\" y2=\"60.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"330.00\" y1=\"110.40\" x2=\"306.00\" y2=\"110.40\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"310.00\" y1=\"60.00\" x2=\"310.00\" y2=\"110.40\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"310.00,60.00 313.00,68.00 307.00,68.00\" fill=\"#00f0ff\"/><polygon points=\"310.00,110.40 307.00,102.40 313.00,102.40\" fill=\"#00f0ff\"/><text x=\"299.00\" y=\"85.20\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"middle\" dominant-baseline=\"central\" transform=\"rotate(-90 299.00 85.20)\">20</text><line x1=\"330.00\" y1=\"160.80\" x2=\"330.00\" y2=\"182.80\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"355.20\" y1=\"160.80\" x2=\"355.20\" y2=\"182.80\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"330.00\" y1=\"178.80\" x2=\"355.20\" y2=\"178.80\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"330.00,178.80 338.00,175.80 338.00,181.80\" fill=\"#00f0ff\"/><polygon points=\"355.20,178.80 347.20,181.80 347.20,175.80\" fill=\"#00f0ff\"/><text x=\"342.60\" y=\"189.80\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"middle\" dominant-baseline=\"central\">10</text><line x1=\"456.00\" y1=\"160.80\" x2=\"456.00\" y2=\"182.80\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"481.20\" y1=\"160.80\" x2=\"481.20\" y2=\"182.80\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"456.00\" y1=\"178.80\" x2=\"481.20\" y2=\"178.80\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"456.00,178.80 464.00,175.80 464.00,181.80\" fill=\"#00f0ff\"/><polygon points=\"481.20,178.80 473.20,181.80 473.20,175.80\" fill=\"#00f0ff\"/><text x=\"468.60\" y=\"189.80\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"middle\" dominant-baseline=\"central\">10</text><line x1=\"349.47\" y1=\"104.67\" x2=\"326.00\" y2=\"38.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"349.47,104.67 343.98,98.12 349.64,96.12\" fill=\"#00f0ff\"/><line x1=\"326.00\" y1=\"38.00\" x2=\"386.00\" y2=\"38.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><text x=\"330.00\" y=\"29.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"start\" dominant-baseline=\"central\">2X Ø6.5 THRU</text><text x=\"405.60\" y=\"204.80\" fill=\"#e8ffe8\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"11\" text-anchor=\"middle\" dominant-baseline=\"central\">TOP (SCALE 0.7)</text><polygon points=\"400.00,318.00 590.00,318.00 590.00,370.00 400.00,370.00\" fill=\"none\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><text x=\"408.00\" y=\"330.00\" fill=\"#e8ffe8\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"start\" dominant-baseline=\"central\">BEARING BLOCK</text><text x=\"408.00\" y=\"346.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"11\" text-anchor=\"start\" dominant-baseline=\"central\">6061 ALLOY</text><text x=\"408.00\" y=\"361.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"10\" text-anchor=\"start\" dominant-baseline=\"central\">MM  THIRD ANGLE  ALL HOLES THRU</text></svg>", "target_volume_mm3": 54803.7072, "feature_count": 3, "target_mass": 147.97, "density": 2.7, "tolerance_pct": 0.1}$part$::jsonb),
		($part$shaft-collar-half-inch$part$, $part$Shaft Collar$part$, 3, 4, $part${"material": "6061 Alloy", "density_unit": "g/cm³", "mass_unit": "g", "length_unit": "mm", "note": "Model the part from the revealed drawing. Apply 6061 Alloy.", "slug": "shaft-collar-half-inch", "unit_system": "MMGS", "par_time": 210}$part$::jsonb, $part${"drawing": "<svg viewBox=\"0 0 600 380\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M 196.00 79.19 A 96.00 96.00 0 1 1 184.00 79.19 L 184.00 137.38 A 38.10 38.10 0 1 0 196.00 137.38 Z\" fill=\"none\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><line x1=\"82.00\" y1=\"175.00\" x2=\"298.00\" y2=\"175.00\" stroke=\"#00f0ff\" stroke-width=\"1\" stroke-dasharray=\"14 4 3 4\"/><line x1=\"190.00\" y1=\"67.00\" x2=\"190.00\" y2=\"283.00\" stroke=\"#00f0ff\" stroke-width=\"1\" stroke-dasharray=\"14 4 3 4\"/><line x1=\"122.80\" y1=\"107.80\" x2=\"84.00\" y2=\"75.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"122.80,107.80 114.75,104.93 118.63,100.34\" fill=\"#00f0ff\"/><line x1=\"84.00\" y1=\"75.00\" x2=\"24.00\" y2=\"75.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><text x=\"80.00\" y=\"66.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"end\" dominant-baseline=\"central\">Ø32</text><line x1=\"163.33\" y1=\"201.67\" x2=\"120.00\" y2=\"305.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"163.33,201.67 163.00,210.21 157.47,207.89\" fill=\"#00f0ff\"/><line x1=\"120.00\" y1=\"305.00\" x2=\"60.00\" y2=\"305.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><text x=\"116.00\" y=\"296.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"end\" dominant-baseline=\"central\">Ø12.7 THRU</text><line x1=\"184.00\" y1=\"79.19\" x2=\"184.00\" y2=\"45.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"196.00\" y1=\"79.19\" x2=\"196.00\" y2=\"45.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"184.00\" y1=\"49.00\" x2=\"196.00\" y2=\"49.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"184.00,49.00 192.00,46.00 192.00,52.00\" fill=\"#00f0ff\"/><polygon points=\"196.00,49.00 188.00,52.00 188.00,46.00\" fill=\"#00f0ff\"/><text x=\"190.00\" y=\"39.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"middle\" dominant-baseline=\"central\">2 SLOT THRU</text><text x=\"190.00\" y=\"330.00\" fill=\"#e8ffe8\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"11\" text-anchor=\"middle\" dominant-baseline=\"central\">FRONT</text><polygon points=\"320.00,79.00 392.00,79.00 392.00,271.00 320.00,271.00\" fill=\"none\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><line x1=\"320.00\" y1=\"136.90\" x2=\"392.00\" y2=\"136.90\" stroke=\"#e8ffe8\" stroke-width=\"1.2\" stroke-dasharray=\"6 4\"/><line x1=\"320.00\" y1=\"213.10\" x2=\"392.00\" y2=\"213.10\" stroke=\"#e8ffe8\" stroke-width=\"1.2\" stroke-dasharray=\"6 4\"/><line x1=\"320.00\" y1=\"79.00\" x2=\"392.00\" y2=\"79.00\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><line x1=\"308.00\" y1=\"175.00\" x2=\"404.00\" y2=\"175.00\" stroke=\"#00f0ff\" stroke-width=\"1\" stroke-dasharray=\"14 4 3 4\"/><line x1=\"320.00\" y1=\"271.00\" x2=\"320.00\" y2=\"303.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"392.00\" y1=\"271.00\" x2=\"392.00\" y2=\"303.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"320.00\" y1=\"299.00\" x2=\"392.00\" y2=\"299.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"320.00,299.00 328.00,296.00 328.00,302.00\" fill=\"#00f0ff\"/><polygon points=\"392.00,299.00 384.00,302.00 384.00,296.00\" fill=\"#00f0ff\"/><text x=\"356.00\" y=\"310.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"middle\" dominant-baseline=\"central\">12</text><text x=\"356.00\" y=\"330.00\" fill=\"#e8ffe8\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"11\" text-anchor=\"middle\" dominant-baseline=\"central\">RIGHT</text><text x=\"404.00\" y=\"109.00\" fill=\"#e8ffe8\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"10\" text-anchor=\"start\" dominant-baseline=\"central\">SLOT RUNS</text><text x=\"404.00\" y=\"123.00\" fill=\"#e8ffe8\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"10\" text-anchor=\"start\" dominant-baseline=\"central\">FULL WIDTH</text><polygon points=\"400.00,318.00 590.00,318.00 590.00,370.00 400.00,370.00\" fill=\"none\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><text x=\"408.00\" y=\"330.00\" fill=\"#e8ffe8\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"start\" dominant-baseline=\"central\">SHAFT COLLAR</text><text x=\"408.00\" y=\"346.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"11\" text-anchor=\"start\" dominant-baseline=\"central\">6061 ALLOY</text><text x=\"408.00\" y=\"361.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"10\" text-anchor=\"start\" dominant-baseline=\"central\">MM  THIRD ANGLE</text></svg>", "target_volume_mm3": 7898.8681, "feature_count": 2, "target_mass": 21.3269, "density": 2.7, "tolerance_pct": 0.1}$part$::jsonb),
		($part$motor-plate-80$part$, $part$Motor Plate$part$, 3, 5, $part${"material": "6061 Alloy", "density_unit": "g/cm³", "mass_unit": "g", "length_unit": "mm", "note": "Model the part from the revealed drawing. Apply 6061 Alloy.", "slug": "motor-plate-80", "unit_system": "MMGS", "par_time": 240}$part$::jsonb, $part${"drawing": "<svg viewBox=\"0 0 600 380\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M 74.00 40.00 L 266.00 40.00 A 24.00 24.00 0 0 1 290.00 64.00 L 290.00 256.00 A 24.00 24.00 0 0 1 266.00 280.00 L 74.00 280.00 A 24.00 24.00 0 0 1 50.00 256.00 L 50.00 64.00 A 24.00 24.00 0 0 1 74.00 40.00 Z\" fill=\"none\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><circle cx=\"170.00\" cy=\"160.00\" r=\"34.50\" fill=\"none\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><circle cx=\"170\" cy=\"160\" r=\"75.00\" fill=\"none\" stroke=\"#00f0ff\" stroke-width=\"1\" stroke-dasharray=\"14 4 3 4\"/><circle cx=\"116.97\" cy=\"106.97\" r=\"6.45\" fill=\"none\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><circle cx=\"74.00\" cy=\"64.00\" r=\"8.25\" fill=\"none\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><circle cx=\"116.97\" cy=\"213.03\" r=\"6.45\" fill=\"none\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><circle cx=\"74.00\" cy=\"256.00\" r=\"8.25\" fill=\"none\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><circle cx=\"223.03\" cy=\"106.97\" r=\"6.45\" fill=\"none\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><circle cx=\"266.00\" cy=\"64.00\" r=\"8.25\" fill=\"none\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><circle cx=\"223.03\" cy=\"213.03\" r=\"6.45\" fill=\"none\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><circle cx=\"266.00\" cy=\"256.00\" r=\"8.25\" fill=\"none\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><line x1=\"38.00\" y1=\"160.00\" x2=\"302.00\" y2=\"160.00\" stroke=\"#00f0ff\" stroke-width=\"1\" stroke-dasharray=\"14 4 3 4\"/><line x1=\"170.00\" y1=\"28.00\" x2=\"170.00\" y2=\"292.00\" stroke=\"#00f0ff\" stroke-width=\"1\" stroke-dasharray=\"14 4 3 4\"/><line x1=\"50.00\" y1=\"280.00\" x2=\"50.00\" y2=\"302.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"290.00\" y1=\"280.00\" x2=\"290.00\" y2=\"302.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"50.00\" y1=\"298.00\" x2=\"290.00\" y2=\"298.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"50.00,298.00 58.00,295.00 58.00,301.00\" fill=\"#00f0ff\"/><polygon points=\"290.00,298.00 282.00,301.00 282.00,295.00\" fill=\"#00f0ff\"/><text x=\"170.00\" y=\"309.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"middle\" dominant-baseline=\"central\">80</text><line x1=\"50.00\" y1=\"280.00\" x2=\"22.00\" y2=\"280.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"50.00\" y1=\"40.00\" x2=\"22.00\" y2=\"40.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"26.00\" y1=\"280.00\" x2=\"26.00\" y2=\"40.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"26.00,280.00 23.00,272.00 29.00,272.00\" fill=\"#00f0ff\"/><polygon points=\"26.00,40.00 29.00,48.00 23.00,48.00\" fill=\"#00f0ff\"/><text x=\"15.00\" y=\"160.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"middle\" dominant-baseline=\"central\" transform=\"rotate(-90 15.00 160.00)\">80</text><line x1=\"50.00\" y1=\"40.00\" x2=\"50.00\" y2=\"18.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"74.00\" y1=\"40.00\" x2=\"74.00\" y2=\"18.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"50.00\" y1=\"22.00\" x2=\"74.00\" y2=\"22.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"50.00,22.00 58.00,19.00 58.00,25.00\" fill=\"#00f0ff\"/><polygon points=\"74.00,22.00 66.00,25.00 66.00,19.00\" fill=\"#00f0ff\"/><text x=\"62.00\" y=\"12.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"middle\" dominant-baseline=\"central\">8</text><line x1=\"194.15\" y1=\"135.85\" x2=\"312.00\" y2=\"44.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"194.15,135.85 198.62,128.57 202.30,133.30\" fill=\"#00f0ff\"/><line x1=\"312.00\" y1=\"44.00\" x2=\"372.00\" y2=\"44.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><text x=\"316.00\" y=\"35.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"start\" dominant-baseline=\"central\">Ø23 THRU</text><line x1=\"227.55\" y1=\"208.52\" x2=\"312.00\" y2=\"178.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"227.55,208.52 234.05,202.98 236.09,208.62\" fill=\"#00f0ff\"/><line x1=\"312.00\" y1=\"178.00\" x2=\"372.00\" y2=\"178.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><text x=\"316.00\" y=\"169.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"start\" dominant-baseline=\"central\">4X Ø4.3 ON Ø50 BC, 45°</text><line x1=\"271.77\" y1=\"261.77\" x2=\"312.00\" y2=\"284.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"271.77,261.77 280.23,263.02 277.33,268.27\" fill=\"#00f0ff\"/><line x1=\"312.00\" y1=\"284.00\" x2=\"372.00\" y2=\"284.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><text x=\"316.00\" y=\"275.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"start\" dominant-baseline=\"central\">4X Ø5.5 THRU</text><text x=\"316.00\" y=\"80.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"11\" text-anchor=\"start\" dominant-baseline=\"central\">4X R8 CORNERS</text><text x=\"170.00\" y=\"362.00\" fill=\"#e8ffe8\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"11\" text-anchor=\"middle\" dominant-baseline=\"central\">FRONT</text><polygon points=\"560.00,40.00 578.00,40.00 578.00,280.00 560.00,280.00\" fill=\"none\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><line x1=\"560.00\" y1=\"40.00\" x2=\"560.00\" y2=\"18.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"578.00\" y1=\"40.00\" x2=\"578.00\" y2=\"18.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><line x1=\"560.00\" y1=\"22.00\" x2=\"578.00\" y2=\"22.00\" stroke=\"#00f0ff\" stroke-width=\"1\"/><polygon points=\"560.00,22.00 568.00,19.00 568.00,25.00\" fill=\"#00f0ff\"/><polygon points=\"578.00,22.00 570.00,25.00 570.00,19.00\" fill=\"#00f0ff\"/><text x=\"569.00\" y=\"12.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"middle\" dominant-baseline=\"central\">6</text><text x=\"569.00\" y=\"296.00\" fill=\"#e8ffe8\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"11\" text-anchor=\"middle\" dominant-baseline=\"central\">RIGHT</text><polygon points=\"400.00,318.00 590.00,318.00 590.00,370.00 400.00,370.00\" fill=\"none\" stroke=\"#e8ffe8\" stroke-width=\"2\"/><text x=\"408.00\" y=\"330.00\" fill=\"#e8ffe8\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"13\" text-anchor=\"start\" dominant-baseline=\"central\">MOTOR PLATE</text><text x=\"408.00\" y=\"346.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"11\" text-anchor=\"start\" dominant-baseline=\"central\">6061 ALLOY</text><text x=\"408.00\" y=\"361.00\" fill=\"#00f0ff\" font-family=\"'Share Tech Mono', ui-monospace, monospace\" font-size=\"10\" text-anchor=\"start\" dominant-baseline=\"central\">MM  THIRD ANGLE  ALL HOLES THRU</text></svg>", "target_volume_mm3": 34658.7905, "feature_count": 5, "target_mass": 93.5787, "density": 2.7, "tolerance_pct": 0.1}$part$::jsonb)
		) as p(slug, title, difficulty, ord, prompt, answer)
	loop
		v_blocker := public.gauntlet_publish_blocker('speedrun'::public.gauntlet_mode, v_row.prompt, v_row.answer);
		if v_blocker is not null then
			raise exception '0296: part % cannot publish: %', v_row.slug, v_blocker;
		end if;
		if exists (select 1 from public.challenges c where c.mode = 'speedrun' and c.prompt ->> 'slug' = v_row.slug) then
			v_kept := v_kept + 1;
			continue;
		end if;
		insert into public.challenges (mode, title, difficulty, status, author_id, prompt, answer, series_id, series_order)
		values ('speedrun', v_row.title, v_row.difficulty, 'published', v_author, v_row.prompt, v_row.answer, v_series, v_row.ord);
		v_new := v_new + 1;
	end loop;
	raise notice '0296: % new Speedrun parts published in Shop Hardware, % already there', v_new, v_kept;
end;
$seed$;

do $chk$
begin
	raise notice '0296: % class team links, % community speedruns',
		(select count(*) from public.tournament_entry_class_teams), (select count(*) from public.gauntlet_routes);
end;
$chk$;
