-- ---------------------------------------------------------------------------
-- 0223  CLASSROOM TEAMS: a draw that survives the reload, can be posted to the
--       class for a bounded period, and can be decorated by the students on it.
--
-- WHAT THIS IS FOR. The People tab has had a random team picker since the
-- picker module landed, and it has never written anything down: `teams` is a
-- `derived` value behind a `drawn` flag, so a reload loses every roster. That
-- single absence is why "export the teams" and "post the teams" were not merely
-- unbuilt but unbuildable -- there was nothing to export and nothing to post.
-- This file is that substrate and nothing more ambitious.
--
-- THREE TABLES, AND THE SHAPE IS FORCED BY TWO RULES ALREADY IN THIS REPO.
--
--   classroom_team_sets     one draw. Carries the SEED, so a persisted draw can
--                           still be re-derived and checked by the room, and the
--                           posting window.
--   classroom_teams         one team in that draw. This is the row a student
--                           decorates, which is why a team is a ROW and not just
--                           a number on a member.
--   classroom_team_members  who is on it. Email only.
--
-- 1. THE ROSTER IS NOT DUPLICATED, IT IS REFERENCED. A member row carries an
--    EMAIL and nothing else -- no name, no active flag, no section. The source
--    of truth for all three is `classroom_enrollments`, and a copy taken at draw
--    time is a copy that is wrong by the next roster import.
--
-- 2. AND THE READ LEFT JOINS THAT ROSTER, WHICH IS THE WHOLE ANSWER TO "what
--    happens when a student leaves the class". An inner join is what every
--    presence-shaped read in this app already does, and it SILENTLY DROPS the
--    row: the team quietly becomes a team of three, no error, nothing on screen,
--    and the fact that somebody was moved out of the section is destroyed in the
--    one artifact that recorded who worked with whom. So the read left joins and
--    projects `still_enrolled`, and the surface says so. A team holding a student
--    who left is the state that will ACTUALLY OCCUR, so it is a state with a
--    word for it rather than a state that erases itself.
--
-- WHY "one student, one team per set" IS A PRIMARY KEY AND NOT A CHECK IN AN
-- RPC. `classroom_teams` carries a redundant-looking `unique (id, team_set_id)`
-- purely so `classroom_team_members` can hold a COMPOSITE foreign key
-- `(team_id, team_set_id)` against it. With `primary key (team_set_id,
-- student_email)` beside it, a student appearing on two teams of one draw is
-- unrepresentable -- not refused, unrepresentable -- so no RPC has to re-check
-- it and no raw insert can route around it. That is the composite-key rule from
-- CLAUDE.md applied to the one invariant a team draw actually has.
--
-- EMAILS. `current_user_email()` already returns `lower(btrim(...))` and
-- `classroom_enrollments.student_email` is CHECK-constrained to exactly that
-- form, so the two compare as exact strings BY CONSTRUCTION rather than by
-- anybody remembering to fold case at the comparison. This file's own email
-- column carries the identical CHECK and every write normalizes with
-- `lower(btrim(...))` on the way in, so a teacher pasting a mixed-case address
-- cannot create a member row that no enrollment will ever match.
--
-- AUDIENCE, STATED RATHER THAN INHERITED. `tournament_entry_styles` is public
-- select to `anon` because a TV projector holds no session. A CLASSROOM TEAM
-- ROSTER NAMES STUDENTS IN A CLASS AND IS A DIFFERENT QUESTION. Its audience is
-- the section's own enrolled students and the section's managers, and NOBODY
-- ELSE -- never `anon`, at any posting state. A posted roster is posted TO THE
-- CLASS, which is what the report asked for; it is not published.
--
-- THE MECHANISM FOR THAT IS TWO INDEPENDENT REFUSALS, EITHER OF WHICH DENIES ON
-- ITS OWN. All three tables have RLS enabled with NO POLICY, and no client role
-- holds any grant on them. Every read and every write goes through a SECURITY
-- DEFINER function that re-checks the caller in its own body, which is the
-- classroom module's existing write-path rule extended to the read as well --
-- because the read here is genuinely audience-dependent (a manager sees every
-- draw, a student sees only a posted one inside its window) and a policy
-- expressing that would be a second statement of the same rule.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO. It stores no preset LIST. Badge and
-- flourish ids are length-bounded free text, validated by the client against
-- `BADGES` and `FLOURISHES` in `src/lib/tournaments/entry-styles.ts`. Copying
-- those id lists into a CHECK constraint here would be a second copy of a list
-- that lane D2 is in the middle of generalizing, and a CHECK constraint is the
-- copy that cannot be changed without a migration.
--
-- WHAT UNDOES THIS MIGRATION, stated before it is applied, per CLAUDE.md:
--
--   drop function if exists public.classroom_set_team_style(uuid, text, text, text, jsonb, text, text, text);
--   drop function if exists public.classroom_team_sets(uuid);
--   drop function if exists public.classroom_archive_team_set(uuid);
--   drop function if exists public.classroom_unpost_team_set(uuid);
--   drop function if exists public.classroom_post_team_set(uuid, timestamptz);
--   drop function if exists public.classroom_save_team_set(uuid, text, bigint, text, integer, jsonb);
--   drop function if exists public._classroom_team_set_visible(uuid);
--   drop function if exists public._classroom_team_member(uuid, text);
--   drop table if exists public.classroom_team_members;
--   drop table if exists public.classroom_teams;
--   drop table if exists public.classroom_team_sets;
--
-- Those drops are destructive DDL, so they are a PERSON'S to run and not a
-- session's; they are written here so the undo is known before the apply.
-- Nothing outside this file references any of these objects, so the drops are
-- self-contained.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.classroom_team_sets (
	id uuid primary key default gen_random_uuid(),
	section_id uuid not null references public.classroom_sections (id) on delete cascade,

	-- What the teacher called this draw. "Build teams", "Lab partners".
	label text not null check (char_length(btrim(label)) between 1 and 120),

	-- THE SEED THE DRAW CAME FROM, STORED BECAUSE IT IS WHAT MAKES THE DRAW
	-- CHECKABLE. `pickerSeedLabel` prints it, the panel shows it, and a student
	-- who suspects the teacher arranged the teams can be handed the seed and the
	-- roster and get the same answer back. A persisted draw that lost its seed
	-- would be a list of names with no way to tell a draw from an arrangement.
	seed bigint not null,

	-- How many teams were asked for, and which way round the teacher asked.
	-- Stored so the panel can reopen on the mode it was drawn with.
	mode text not null check (mode in ('size', 'count')),
	mode_value integer not null check (mode_value between 1 and 200),

	created_by text not null
		check (created_by = lower(btrim(created_by)) and created_by like '%@%'),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),

	-- THE POSTING WINDOW, AND IT IS A WINDOW ON THE TEAMS RECORD RATHER THAN A
	-- NEW FIELD ON AN ITEM. The rejected alternative was to make a posted roster
	-- a `classroom_items` row with an end date, which would have meant touching
	-- the item model -- inheriting the `(item_id, student_email, block_id)`
	-- answer shape for something that takes no answers, and editing a file this
	-- lane does not own. A window here touches nothing else.
	--
	-- `posted_at` null means never posted. `visible_until` null beside a
	-- non-null `posted_at` means posted with no end, which is a legitimate thing
	-- to want ("these are the teams for the rest of the unit") and is why the
	-- window is two nullable columns rather than one interval.
	posted_at timestamptz,
	visible_until timestamptz,

	-- ARCHIVE, NEVER DELETE. A team draw records who worked with whom, which is
	-- exactly the kind of thing somebody wants six weeks later when a project is
	-- being marked. Retiring one takes it off every surface and keeps the row.
	archived_at timestamptz,

	constraint classroom_team_sets_window_ordered
		check (
			visible_until is null
			or posted_at is null
			or visible_until > posted_at
		)
);

create index if not exists classroom_team_sets_section_idx
	on public.classroom_team_sets (section_id, created_at desc);

create table if not exists public.classroom_teams (
	id uuid primary key default gen_random_uuid(),
	team_set_id uuid not null
		references public.classroom_team_sets (id) on delete cascade,
	team_number integer not null check (team_number between 1 and 200),

	-- The students' own name for themselves. Null renders as "Team <n>".
	name text check (name is null or char_length(btrim(name)) between 1 and 40),

	-- THE STYLE, IN THE SAME COLUMN SHAPE `tournament_entry_styles` USES, so the
	-- pure renderers in `src/lib/tournaments/entry-styles.ts` -- `accentOf`,
	-- `hasStyle`, `backgroundCss`, `isImageBackground`, `bannerInk` -- accept a
	-- team's style with no adapter. Those functions already take
	-- `EntryStyleDraft`, which is a `Pick` that excludes `entry_id` and
	-- `tournament_id`, so they are structurally reusable TODAY and this file
	-- needs no extraction. Generalizing the tournament module off
	-- `TournamentEntry` is lane D2's work and is deliberately not duplicated here.
	background_type text check (background_type in ('solid', 'gradient')),
	-- Shape follows background_type, validated in the RPC, which is the only
	-- writer:
	--   solid    -> a json string, '#rrggbb'
	--   gradient -> a json array of exactly two '#rrggbb' strings
	--
	-- 'image' IS ABSENT FROM THE CHECK ABOVE ON PURPOSE, and it is the one place
	-- this shape departs from the tournament one. An image background needs a
	-- bucket, an upload path and a storage policy, none of which exist for a
	-- classroom team; admitting the value with nowhere to put the bytes would be
	-- a column that can only ever hold a URL somebody typed.
	background_value jsonb,

	accent_color text check (
		accent_color is null
		-- `char_length = 7` rather than a regex end-anchor, and it is the same
		-- assertion: seven characters whose first seven are '#' plus six hex
		-- digits IS a six-digit hex colour and nothing else. The anchor is
		-- avoided because a dollar sign is the one character that can break a
		-- hand-paste in the Supabase editor, and this file is applied by hand.
		or (char_length(accent_color) = 7 and accent_color ~ '^#[0-9a-f]{6}')
	),
	badge text check (badge is null or char_length(btrim(badge)) between 1 and 40),
	flourish text check (flourish is null or char_length(btrim(flourish)) between 1 and 40),
	tagline text check (tagline is null or char_length(btrim(tagline)) between 1 and 48),

	-- WHO LAST TOUCHED IT. Last write wins between two members, and this column
	-- is what makes that a recorded fact rather than a silent one.
	style_updated_by text
		check (style_updated_by is null
			or (style_updated_by = lower(btrim(style_updated_by)) and style_updated_by like '%@%')),
	style_updated_at timestamptz,

	constraint classroom_teams_number_unique unique (team_set_id, team_number),
	-- Redundant against the primary key, and present ONLY so the member table
	-- below can point a composite foreign key at it. See the header.
	constraint classroom_teams_id_set_unique unique (id, team_set_id),
	constraint classroom_teams_bg_pair
		check ((background_type is null) = (background_value is null))
);

create table if not exists public.classroom_team_members (
	team_set_id uuid not null,
	team_id uuid not null,
	student_email text not null
		check (student_email = lower(btrim(student_email)) and student_email like '%@%'),

	-- One student is on at most ONE team of a given draw, and it is a key.
	primary key (team_set_id, student_email),

	-- The composite key that makes a member's team and a member's draw agree by
	-- construction. `on delete cascade` so retiring a draw takes its membership
	-- with it.
	constraint classroom_team_members_team_fk
		foreign key (team_id, team_set_id)
		references public.classroom_teams (id, team_set_id)
		on delete cascade
);

create index if not exists classroom_team_members_team_idx
	on public.classroom_team_members (team_id);
create index if not exists classroom_team_members_student_idx
	on public.classroom_team_members (student_email);

-- ---------------------------------------------------------------------------
-- 2. RLS on, no policy, no client grant -- two independent refusals
--
-- `storage.objects`-style: a table with RLS enabled and NO policy denies every
-- `anon` and `authenticated` request by default. The revokes below remove the
-- grants this project's default privileges hand out at CREATE time, so the
-- absence of a policy and the absence of a grant each deny on their own. Either
-- one being reopened by a later file leaves the other standing.
--
-- THE `grant all on tables` HALF IS AS REAL AS THE FUNCTION HALF AND 0201 LOST
-- IT: a hosted Supabase project bootstraps default privileges that hand both
-- client roles all seven table privileges at creation, and RLS covers none of
-- TRUNCATE, REFERENCES or TRIGGER. So the revoke names the roles.
-- ---------------------------------------------------------------------------

alter table public.classroom_team_sets enable row level security;
alter table public.classroom_teams enable row level security;
alter table public.classroom_team_members enable row level security;

revoke all on table public.classroom_team_sets from public, anon, authenticated;
revoke all on table public.classroom_teams from public, anon, authenticated;
revoke all on table public.classroom_team_members from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Private predicates
--
-- Both are SECURITY DEFINER with an empty search_path, both are revoked from
-- every client role by name, and NEITHER is named inside an RLS policy -- there
-- are no policies on these tables -- so neither needs an `authenticated`
-- EXECUTE grant. They are called only from the definer functions below, which
-- run as owner. That is the narrowest grant that works, so it is the one taken.
-- ---------------------------------------------------------------------------

create or replace function public._classroom_team_member(p_team_id uuid, p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $teams$
	select exists (
		select 1
		from public.classroom_team_members m
		where m.team_id = p_team_id
		  and m.student_email = lower(btrim(coalesce(p_email, '')))
	);
$teams$;

revoke all on function public._classroom_team_member(uuid, text)
	from public, anon, authenticated;

-- IS THIS DRAW SHOWING TO THE CLASS RIGHT NOW. Three terms, and all three are
-- read at CALL TIME rather than stamped anywhere: a window that expired is a
-- window that expired, with no sweep needed and nothing to drift. That is the
-- derived-never-stored rule -- there is no `is_visible` column to go stale and
-- no cron to stop running.
create or replace function public._classroom_team_set_visible(p_team_set_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $teams$
	select exists (
		select 1
		from public.classroom_team_sets s
		where s.id = p_team_set_id
		  and s.archived_at is null
		  and s.posted_at is not null
		  and s.posted_at <= now()
		  and (s.visible_until is null or s.visible_until > now())
	);
$teams$;

revoke all on function public._classroom_team_set_visible(uuid)
	from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Writes -- manager only
--
-- Every one re-checks `classroom_manages_section` in its own body. The UI gate
-- on the People tab is convenience; these are the boundary.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_save_team_set(
	p_section_id uuid,
	p_label text,
	p_seed bigint,
	p_mode text,
	p_mode_value integer,
	p_teams jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $teams$
declare
	v_email text := public.current_user_email();
	v_set_id uuid;
	v_team jsonb;
	v_team_id uuid;
	v_number integer;
	v_member text;
	v_members jsonb;
	v_unknown text[] := '{}';
	v_seen text[] := '{}';
begin
	if v_email = '' then
		raise exception 'You must be signed in to save teams.';
	end if;

	if public.classroom_manages_section(p_section_id) is not true then
		raise exception 'Only a teacher of this class can save its teams.';
	end if;

	-- `is distinct from` and NOT `<>`: jsonb_typeof of an ABSENT or null value
	-- is NULL, and `NULL <> 'array'` is NULL, which in a boolean gate falls
	-- straight through and ACCEPTS the write. That exact shape cost this repo
	-- four months of a notebook gate that never fired.
	if jsonb_typeof(p_teams) is distinct from 'array' then
		raise exception 'Teams must be a JSON array.';
	end if;

	if jsonb_array_length(p_teams) < 1 then
		raise exception 'A team set needs at least one team.';
	end if;

	if p_mode is null or p_mode not in ('size', 'count') then
		raise exception 'Mode must be size or count.';
	end if;

	insert into public.classroom_team_sets
		(section_id, label, seed, mode, mode_value, created_by)
	values (
		p_section_id,
		btrim(coalesce(p_label, '')),
		p_seed,
		p_mode,
		p_mode_value,
		v_email
	)
	returning id into v_set_id;

	for v_team in select * from jsonb_array_elements(p_teams)
	loop
		v_number := (v_team ->> 'team_number')::integer;
		v_members := v_team -> 'members';

		if v_number is null then
			raise exception 'Every team needs a team_number.';
		end if;

		if jsonb_typeof(v_members) is distinct from 'array' then
			raise exception 'Team % has no members array.', v_number;
		end if;

		insert into public.classroom_teams (team_set_id, team_number)
		values (v_set_id, v_number)
		returning id into v_team_id;

		for v_member in select jsonb_array_elements_text(v_members)
		loop
			v_member := lower(btrim(coalesce(v_member, '')));
			if v_member = '' then
				continue;
			end if;

			-- AN ADDRESS WITH NO ENROLLMENT BEHIND IT IS COLLECTED AND REPORTED,
			-- never written and never silently dropped. A team naming somebody
			-- who is not in the class is either a typo or a roster that moved
			-- under the draw, and both are things the teacher needs told.
			-- INACTIVE enrollments are accepted: a student who left the class is
			-- exactly who this record exists to remember.
			if not exists (
				select 1 from public.classroom_enrollments e
				where e.section_id = p_section_id
				  and e.student_email = v_member
			) then
				v_unknown := v_unknown || v_member;
				continue;
			end if;

			if v_member = any (v_seen) then
				raise exception 'Student % appears on more than one team.', v_member;
			end if;
			v_seen := v_seen || v_member;

			insert into public.classroom_team_members (team_set_id, team_id, student_email)
			values (v_set_id, v_team_id, v_member);
		end loop;
	end loop;

	if array_length(v_unknown, 1) is not null then
		raise exception
			'% of the addresses on these teams are not enrolled in this class: %',
			array_length(v_unknown, 1),
			array_to_string(v_unknown, ', ');
	end if;

	return v_set_id;
end;
$teams$;

revoke all on function
	public.classroom_save_team_set(uuid, text, bigint, text, integer, jsonb)
	from public, anon, authenticated;
grant execute on function
	public.classroom_save_team_set(uuid, text, bigint, text, integer, jsonb)
	to authenticated;

-- POST. Two verbs rather than one nullable flag, because "post until Friday"
-- and "take it down" are different intentions and a single toggle taking a
-- timestamp makes the second one an argument value.
create or replace function public.classroom_post_team_set(
	p_team_set_id uuid,
	p_visible_until timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $teams$
declare
	v_section uuid;
begin
	select s.section_id into v_section
	from public.classroom_team_sets s
	where s.id = p_team_set_id and s.archived_at is null;

	if v_section is null then
		raise exception 'Team set not found.';
	end if;

	if public.classroom_manages_section(v_section) is not true then
		raise exception 'Only a teacher of this class can post its teams.';
	end if;

	if p_visible_until is not null and p_visible_until <= now() then
		raise exception 'That end time has already passed.';
	end if;

	update public.classroom_team_sets
	set posted_at = now(),
		visible_until = p_visible_until,
		updated_at = now()
	where id = p_team_set_id;

	return jsonb_build_object('ok', true, 'posted', true, 'visible_until', p_visible_until);
end;
$teams$;

revoke all on function public.classroom_post_team_set(uuid, timestamptz)
	from public, anon, authenticated;
grant execute on function public.classroom_post_team_set(uuid, timestamptz)
	to authenticated;

create or replace function public.classroom_unpost_team_set(p_team_set_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $teams$
declare
	v_section uuid;
begin
	select s.section_id into v_section
	from public.classroom_team_sets s
	where s.id = p_team_set_id and s.archived_at is null;

	if v_section is null then
		raise exception 'Team set not found.';
	end if;

	if public.classroom_manages_section(v_section) is not true then
		raise exception 'Only a teacher of this class can take down its teams.';
	end if;

	update public.classroom_team_sets
	set posted_at = null, visible_until = null, updated_at = now()
	where id = p_team_set_id;

	return jsonb_build_object('ok', true, 'posted', false);
end;
$teams$;

revoke all on function public.classroom_unpost_team_set(uuid)
	from public, anon, authenticated;
grant execute on function public.classroom_unpost_team_set(uuid) to authenticated;

-- ARCHIVE, NEVER DELETE. There is no delete RPC and no delete grant anywhere in
-- this file, so "a draw cannot be destroyed" is a property of what exists rather
-- than a rule somebody follows.
create or replace function public.classroom_archive_team_set(p_team_set_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $teams$
declare
	v_section uuid;
begin
	select s.section_id into v_section
	from public.classroom_team_sets s
	where s.id = p_team_set_id and s.archived_at is null;

	if v_section is null then
		raise exception 'Team set not found.';
	end if;

	if public.classroom_manages_section(v_section) is not true then
		raise exception 'Only a teacher of this class can retire its teams.';
	end if;

	update public.classroom_team_sets
	set archived_at = now(), posted_at = null, visible_until = null, updated_at = now()
	where id = p_team_set_id;

	return jsonb_build_object('ok', true, 'archived', true);
end;
$teams$;

revoke all on function public.classroom_archive_team_set(uuid)
	from public, anon, authenticated;
grant execute on function public.classroom_archive_team_set(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The style write -- MEMBERSHIP, NOT OWNERSHIP
--
-- THIS IS THE ONE CHECK THAT COULD NOT BE COPIED FROM ANYWHERE, and it is worth
-- saying why rather than leaving it to be rediscovered.
-- `tournament_set_entry_style` authorizes on `entries.user_id = auth.uid()` --
-- an OWNER column holding one uuid, with a host standing in only for an
-- UNLINKED walk-up entry. A TEAM HAS NO `user_id`. It has members, it has
-- several of them, and they are keyed by EMAIL because the classroom is
-- email-keyed so a roster can exist before anybody signs in. So the predicate
-- is `_classroom_team_member`, and it is new code rather than a translation.
--
-- WHO WINS WHEN TWO MEMBERS DISAGREE: THE LAST ONE TO WRITE, AND THE ROW
-- RECORDS WHO THAT WAS. This is a deliberate DEPARTURE from decision 30's shape
-- and the departure is flagged rather than smuggled.
--
-- Decision 30 ruled out symmetric team rights for an IdeaCAD ASSEMBLY, on the
-- stated grounds that "members of a team hold DIFFERENT RESPONSIBILITIES, so
-- they hold different responsibilities on the assembly" -- and gave that
-- subsystem an owner, an agreed manager, granular per-member permissions and
-- transferable ownership. Every clause of that reasoning is about a WORK
-- PRODUCT that is divided into parts and checked out one part at a time.
--
-- A TEAM'S BANNER IS NOT A WORK PRODUCT. There is no division of labour in
-- picking an accent colour, nothing to check out, and nothing that one member
-- is more responsible for than another. Building an owner, an agreed manager
-- and a transfer path for a colour swatch would be four columns and three RPCs
-- of ceremony protecting a decision that costs one click to reverse -- and the
-- report's own words were "customizeable by the students who are in them",
-- plural, with no owner named.
--
-- So: any member may write, the last write wins, and `style_updated_by` plus
-- `style_updated_at` make the outcome attributable. If two students genuinely
-- fight over a colour, that is a classroom conversation and the row says who to
-- have it with, which is strictly more than an owner column would give a
-- teacher. THE ALTERNATIVE IS AN AGREED PER-TEAM MANAGER, exactly as decision
-- 30 has; it is one nullable column and one branch here, and it is the right
-- change to make the day somebody reports an actual dispute. It is not worth
-- building before then.
--
-- A MANAGER OF THE SECTION MAY ALSO WRITE, and that is not the tournament rule.
-- A host there deliberately CANNOT restyle a linked player's banner, because a
-- tournament entry is a person's own identity in a bracket. A classroom team's
-- banner is displayed to a class by the teacher who posted it, so the teacher
-- needs to be able to take something down without archiving the whole draw.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_set_team_style(
	p_team_id uuid,
	p_name text default null,
	p_accent_color text default null,
	p_background_type text default null,
	p_background_value jsonb default null,
	p_badge text default null,
	p_flourish text default null,
	p_tagline text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $teams$
declare
	v_email text := public.current_user_email();
	v_section uuid;
	v_archived timestamptz;
	v_accent text := nullif(lower(btrim(coalesce(p_accent_color, ''))), '');
	v_name text := nullif(btrim(coalesce(p_name, '')), '');
	v_badge text := nullif(btrim(coalesce(p_badge, '')), '');
	v_flourish text := nullif(btrim(coalesce(p_flourish, '')), '');
	v_tagline text := nullif(btrim(coalesce(p_tagline, '')), '');
	v_bg_type text := nullif(btrim(coalesce(p_background_type, '')), '');
	v_bg jsonb := p_background_value;
begin
	if v_email = '' then
		raise exception 'You must be signed in to customize a team.';
	end if;

	select s.section_id, s.archived_at into v_section, v_archived
	from public.classroom_teams t
	join public.classroom_team_sets s on s.id = t.team_set_id
	where t.id = p_team_id;

	-- "Not found" and "not yours" answer identically, so a team id cannot be
	-- probed from outside the class.
	if v_section is null then
		raise exception 'Team not found.';
	end if;

	if v_archived is not null then
		raise exception 'These teams have been retired and can no longer be changed.';
	end if;

	if not public._classroom_team_member(p_team_id, v_email)
		and public.classroom_manages_section(v_section) is not true then
		raise exception 'Only a student on this team, or a teacher of the class, can customize it.';
	end if;

	if v_accent is not null
		and not (char_length(v_accent) = 7 and v_accent ~ '^#[0-9a-f]{6}') then
		raise exception 'An accent colour must be a hex value like #3f8f5f.';
	end if;

	-- THE BACKGROUND PAIR, VALIDATED TOGETHER because the column constraint
	-- requires them to arrive together and a caller sending one is a caller who
	-- would otherwise get a constraint name instead of a sentence.
	if v_bg_type is null then
		v_bg := null;
	else
		if v_bg_type not in ('solid', 'gradient') then
			raise exception 'A team background must be solid or gradient.';
		end if;

		if v_bg_type = 'solid' then
			if jsonb_typeof(v_bg) is distinct from 'string'
				or char_length(v_bg #>> '{}') <> 7
				or (v_bg #>> '{}') !~ '^#[0-9a-f]{6}' then
				raise exception 'A solid background must be one hex colour.';
			end if;
		else
			if jsonb_typeof(v_bg) is distinct from 'array'
				or jsonb_array_length(v_bg) <> 2
				or jsonb_typeof(v_bg -> 0) is distinct from 'string'
				or jsonb_typeof(v_bg -> 1) is distinct from 'string'
				or char_length(v_bg -> 0 #>> '{}') <> 7
				or char_length(v_bg -> 1 #>> '{}') <> 7
				or (v_bg -> 0 #>> '{}') !~ '^#[0-9a-f]{6}'
				or (v_bg -> 1 #>> '{}') !~ '^#[0-9a-f]{6}' then
				raise exception 'A gradient background must be two hex colours.';
			end if;
		end if;
	end if;

	update public.classroom_teams
	set name = v_name,
		accent_color = v_accent,
		background_type = v_bg_type,
		background_value = v_bg,
		badge = v_badge,
		flourish = v_flourish,
		tagline = v_tagline,
		style_updated_by = v_email,
		style_updated_at = now()
	where id = p_team_id;

	return jsonb_build_object('ok', true, 'team_id', p_team_id, 'updated_by', v_email);
end;
$teams$;

revoke all on function
	public.classroom_set_team_style(uuid, text, text, text, jsonb, text, text, text)
	from public, anon, authenticated;
grant execute on function
	public.classroom_set_team_style(uuid, text, text, text, jsonb, text, text, text)
	to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The read
--
-- NAMED `classroom_team_board` AND NOT `classroom_team_sets`, deliberately: a
-- function sharing a name with a table collides with the composite type Postgres
-- creates for that table, which is legal, confusing to read, and ambiguous to
-- PostgREST's own resolution.
--
-- TWO AUDIENCES, ONE FUNCTION, AND THE PROJECTION IS THE DIFFERENCE:
--
--   * A MANAGER of the section sees every live draw, posted or not, with its
--     window and its seed.
--   * AN ENROLLED STUDENT sees only draws that are posted AND inside their
--     window right now.
--   * ANYBODY ELSE -- including a signed-in visitor with no enrollment -- gets
--     'Not found.', the same sentence a section that does not exist gets.
--   * `anon` cannot reach this at all: the grant below names `authenticated`
--     only, so a signed-out call fails at the grant before the body runs.
--
-- THE MEMBER JOIN IS A LEFT JOIN AND THAT IS THE WHOLE POINT. `classroom_team_members`
-- drives, `classroom_enrollments` hangs off it, and `still_enrolled` is the
-- projection of whether the roster still has them. An inner join here would
-- silently shrink a team every time somebody transferred out.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_team_board(p_section_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $teams$
declare
	v_email text := public.current_user_email();
	v_manages boolean;
	v_sets jsonb;
begin
	if v_email = '' then
		raise exception 'You must be signed in to read team rosters.';
	end if;

	v_manages := public.classroom_manages_section(p_section_id) is true;

	if not v_manages and not exists (
		select 1 from public.classroom_enrollments e
		where e.section_id = p_section_id
		  and e.student_email = v_email
		  and e.active
	) then
		raise exception 'Not found.';
	end if;

	select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc), '[]'::jsonb)
	into v_sets
	from (
		select
			s.id,
			s.label,
			s.seed::text as seed,
			s.mode,
			s.mode_value,
			s.created_at,
			s.posted_at,
			s.visible_until,
			public._classroom_team_set_visible(s.id) as showing,
			(
				select coalesce(jsonb_agg(t_row order by t_row.team_number), '[]'::jsonb)
				from (
					select
						t.id,
						t.team_number,
						t.name,
						t.accent_color,
						t.background_type,
						t.background_value,
						t.badge,
						t.flourish,
						t.tagline,
						t.style_updated_by,
						t.style_updated_at,
						-- The caller's own membership, projected rather than left
						-- to the client to re-derive from a list of addresses:
						-- the client cannot see who else is signed in, and two
						-- spellings of "am I on this team" is the pair that stops
						-- agreeing.
						public._classroom_team_member(t.id, v_email) as mine,
						(
							select coalesce(jsonb_agg(m_row order by m_row.display_name, m_row.student_email), '[]'::jsonb)
							from (
								select
									m.student_email,
									coalesce(e.display_name, split_part(m.student_email, '@', 1)) as display_name,
									(e.section_id is not null and e.active) as still_enrolled
								from public.classroom_team_members m
								left join public.classroom_enrollments e
									on e.section_id = s.section_id
									and e.student_email = m.student_email
								where m.team_id = t.id
							) as m_row
						) as members
					from public.classroom_teams t
					where t.team_set_id = s.id
				) as t_row
			) as teams
		from public.classroom_team_sets s
		where s.section_id = p_section_id
		  and s.archived_at is null
		  and (v_manages or public._classroom_team_set_visible(s.id))
	) as x;

	return jsonb_build_object(
		'ok', true,
		'manages', v_manages,
		'sets', v_sets
	);
end;
$teams$;

revoke all on function public.classroom_team_board(uuid)
	from public, anon, authenticated;
grant execute on function public.classroom_team_board(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Apply-time self-check
--
-- IT ASSERTS THE ACL, NOT ITS OWN VERDICT. A guard passing tells you the guard
-- ran; reading `has_table_privilege` and `has_function_privilege` back tells you
-- what is actually granted, which is the thing `revoke ... from public` silently
-- fails to change on this project.
--
-- AND IT NAMES ONLY THE OBJECTS THIS FILE WRITES. It does not sweep
-- `classroom_%` or any other prefix. 0206's header states the general form and
-- 0214 made the mistake anyway: a later file that sweeps a subsystem REFUSES TO
-- APPLY on any chain where an earlier file's repair is deliberately left out as
-- a negative control, over functions it never touched. A migration checks its
-- own names and leaves everybody else's ground alone.
-- ---------------------------------------------------------------------------

do $teams$
declare
	v_tables text[] := array[
		'classroom_team_sets',
		'classroom_teams',
		'classroom_team_members'
	];
	v_public_fns text[] := array[
		'classroom_save_team_set(uuid, text, bigint, text, integer, jsonb)',
		'classroom_post_team_set(uuid, timestamptz)',
		'classroom_unpost_team_set(uuid)',
		'classroom_archive_team_set(uuid)',
		'classroom_set_team_style(uuid, text, text, text, jsonb, text, text, text)',
		'classroom_team_board(uuid)'
	];
	v_private_fns text[] := array[
		'_classroom_team_member(uuid, text)',
		'_classroom_team_set_visible(uuid)'
	];
	v_name text;
	v_priv text;
	v_policies integer;
	v_rls boolean;
begin
	-- The tables: present, RLS on, no policy, and no privilege of ANY kind for
	-- either client role. All four together are what make the deny-all real.
	foreach v_name in array v_tables loop
		select c.relrowsecurity into v_rls
		from pg_catalog.pg_class c
		join pg_catalog.pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'public' and c.relname = v_name;

		if v_rls is null then
			raise exception '0223: table public.% is missing.', v_name;
		end if;
		if not v_rls then
			raise exception '0223: table public.% does not have row level security enabled.', v_name;
		end if;

		select count(*) into v_policies
		from pg_catalog.pg_policies p
		where p.schemaname = 'public' and p.tablename = v_name;

		if v_policies <> 0 then
			raise exception
				'0223: table public.% carries % policy/policies. This file deliberately has none: every read and write goes through a definer function.',
				v_name, v_policies;
		end if;

		foreach v_priv in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
			if has_table_privilege('anon', 'public.' || v_name, v_priv) then
				raise exception
					'0223: anon still holds %s on public.% -- the revoke did not name the roles it needed to.',
					v_priv, v_name;
			end if;
			if has_table_privilege('authenticated', 'public.' || v_name, v_priv) then
				raise exception
					'0223: authenticated still holds %s on public.% -- the revoke did not name the roles it needed to.',
					v_priv, v_name;
			end if;
		end loop;
	end loop;

	-- The granted functions: authenticated YES, anon NO. The anon half is the
	-- one that fails silently on this project, because the hosted default
	-- privileges write a DIRECT anon grant at CREATE time that removing the
	-- `public` entry never touches. 0201 shipped exactly that hole across ten
	-- functions; 0166 is the shape this file copies.
	foreach v_name in array v_public_fns loop
		if to_regprocedure('public.' || v_name) is null then
			raise exception '0223: function public.% is missing.', v_name;
		end if;
		if has_function_privilege('anon', 'public.' || v_name, 'execute') then
			raise exception
				'0223: anon can execute public.% -- revoke from anon BY NAME, per 0166.',
				v_name;
		end if;
		if not has_function_privilege('authenticated', 'public.' || v_name, 'execute') then
			raise exception
				'0223: authenticated cannot execute public.% -- the grant is missing and every caller would fail.',
				v_name;
		end if;
	end loop;

	-- The private predicates: NEITHER client role, because neither is named
	-- inside an RLS policy (there are none) and both are called only from
	-- definer bodies running as owner.
	foreach v_name in array v_private_fns loop
		if to_regprocedure('public.' || v_name) is null then
			raise exception '0223: function public.% is missing.', v_name;
		end if;
		if has_function_privilege('anon', 'public.' || v_name, 'execute')
			or has_function_privilege('authenticated', 'public.' || v_name, 'execute') then
			raise exception
				'0223: private predicate public.% is executable by a client role.',
				v_name;
		end if;
	end loop;

	raise notice '0223: % tables deny-all, % granted functions, % private predicates -- all checked against the catalog.',
		array_length(v_tables, 1), array_length(v_public_fns, 1), array_length(v_private_fns, 1);
end;
$teams$;

-- ---------------------------------------------------------------------------
-- 8. VERIFICATION QUERY -- read-only, commented out, run it by hand AFTER the
--    apply, as the LAST statement in the editor.
--
--    The Supabase SQL editor renders only the final statement's result set and
--    shows no notices at all, so the self-check above is invisible there: it
--    either applies or it raises. This query is the part a person can READ.
--
--    It names every object it examined, prints the ACTUAL grant state beside the
--    EXPECTED one, and never reports a bare count -- a count of zero problems
--    and a query that examined nothing look identical.
--
--    THE LAST ROW IS A POSITIVE CONTROL and it is the row to read first.
--    `gauntlet_macro_start` is one of this project's deliberate public surfaces
--    (the unauthenticated GAUNTLET run path), so it MUST come back
--    `anon=yes`. If it does not, the query is not reading grants at all and
--    every OK above it means nothing.
--
--    Every row should read OK. There is no dollar sign anywhere in this block,
--    deliberately: a dollar-quote token inside a comment balances in Postgres
--    and breaks the editor's own client-side statement splitter, which cost
--    0194 a full apply cycle.
--
-- with privs as (
--   select unnest(array['select','insert','update','delete','truncate','references','trigger']) as p
-- ),
-- checks as (
--   select 1 as ord, 'table deny-all' as check_name, 'public.' || t.tbl as examined,
--     'rls=' || (case when c.relrowsecurity then 'on' else 'OFF' end)
--       || ' policies=' || (select count(*)::text from pg_policies pl
--                           where pl.schemaname = 'public' and pl.tablename = t.tbl)
--       || ' anon=' || (select coalesce(string_agg(p, ','), 'none') from privs
--                       where has_table_privilege('anon', 'public.' || t.tbl, p))
--       || ' authenticated=' || (select coalesce(string_agg(p, ','), 'none') from privs
--                                where has_table_privilege('authenticated', 'public.' || t.tbl, p))
--       as finding,
--     'rls=on policies=0 anon=none authenticated=none' as expected
--   from unnest(array['classroom_team_sets','classroom_teams','classroom_team_members']) as t(tbl)
--   join pg_class c on c.relname = t.tbl
--   join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
--
--   union all
--   select 2, 'granted to authenticated only', 'public.' || f.sig,
--     'anon=' || (case when has_function_privilege('anon', 'public.' || f.sig, 'execute') then 'yes' else 'no' end)
--       || ' authenticated=' || (case when has_function_privilege('authenticated', 'public.' || f.sig, 'execute') then 'yes' else 'no' end),
--     'anon=no authenticated=yes'
--   from unnest(array[
--     'classroom_save_team_set(uuid, text, bigint, text, integer, jsonb)',
--     'classroom_post_team_set(uuid, timestamptz)',
--     'classroom_unpost_team_set(uuid)',
--     'classroom_archive_team_set(uuid)',
--     'classroom_set_team_style(uuid, text, text, text, jsonb, text, text, text)',
--     'classroom_team_board(uuid)'
--   ]) as f(sig)
--
--   union all
--   select 3, 'private predicate, no client role', 'public.' || f.sig,
--     'anon=' || (case when has_function_privilege('anon', 'public.' || f.sig, 'execute') then 'yes' else 'no' end)
--       || ' authenticated=' || (case when has_function_privilege('authenticated', 'public.' || f.sig, 'execute') then 'yes' else 'no' end),
--     'anon=no authenticated=no'
--   from unnest(array[
--     '_classroom_team_member(uuid, text)',
--     '_classroom_team_set_visible(uuid)'
--   ]) as f(sig)
--
--   union all
--   select 9, 'POSITIVE CONTROL -- a deliberate public surface', 'public.gauntlet_macro_start(text, numeric)',
--     'anon=' || (case when has_function_privilege('anon', 'public.gauntlet_macro_start(text, numeric)', 'execute') then 'yes' else 'no' end)
--       || ' authenticated=' || (case when has_function_privilege('authenticated', 'public.gauntlet_macro_start(text, numeric)', 'execute') then 'yes' else 'no' end),
--     'anon=yes authenticated=yes'
-- )
-- select ord, check_name, examined, finding, expected,
--   case when finding = expected then 'OK' else 'PROBLEM -- read this row' end as verdict
-- from checks
-- order by ord, examined;
-- ---------------------------------------------------------------------------
