-- ---------------------------------------------------------------------------
-- 0225  TEAM EDITS AFTER THE DRAW, AND CLASS THEMES BY CLASS VOTE.
--
-- WHY 0225 AND NOT THE 0230 THE ROUND'S BRIEF NAMED. `node
-- tools/migration-claims.mjs` answered "next free 0225" when this was written,
-- which is the number the prompt-ledger README says a migration takes. 0230
-- would have left 0225, 0228 and 0229 as holes that no ledger claim accounts
-- for, and `tests/db/migration-0177-tombstone.test.ts` correctly refuses an
-- unexplained hole; 0228 and 0229 are reserved in prose for the 2026-09-25
-- proposals and are not this file's to claim. The ledger entry (0347) says so.
--
-- TWO FEATURES IN ONE FILE, AND THAT IS FORCED RATHER THAN CHOSEN.
-- `.github/workflows/migrate.yml` applies the LOWEST unapplied migration and
-- exactly one file per push. The round that ships both features lands in ONE
-- push to main, so two new files would leave the second unapplied while the
-- deployed client already calls it. So Part A (decision 44, teams) and Part B
-- (decision 45, class themes) share this file, and nothing in either half
-- reads the other.
--
-- ===========================================================================
-- PART A. A POSTED DRAW CAN BE EDITED BY HAND, AND SAYS IT WAS (decision 44).
-- ===========================================================================
--
-- A teacher needs to move a student between two teams after a draw was saved
-- or posted (somebody was absent, two friends ended up together, a latecomer
-- joined the class). 0223 had no way to do that short of retiring the draw and
-- drawing again, which throws away the teams' own names and banners.
--
-- 1. THE SEED STAYS, AND THE DRAW IS MARKED INSTEAD. 0223 stores the seed
--    because it is what makes a draw CHECKABLE: the same seed over the same
--    roster gives the same teams. A hand edit breaks that match, so either the
--    record says so or every edit has to become a new draw. Mr. Pina chose the
--    first ("Mark it edited"). `edited_at` and `edited_by` on the set are that
--    mark; nothing rewrites or clears the seed, and the export carries both.
--
-- 2. THE MOVE IS ONE RPC, `classroom_move_team_member`, AND IT IS A MANAGER'S.
--    It locks the set row FOR UPDATE, so two teachers dragging the same draw
--    at once are serialized rather than interleaved. A student already on the
--    draw is MOVED (their one member row changes team); a student already on
--    the target team is a no-op that stamps nothing, because a mark that fires
--    on a click that changed nothing is a mark nobody can trust. A student NOT
--    on the draw may be ADDED, but only with an ACTIVE enrollment in the
--    set's own section: that is the latecomer case. A student who has left the
--    class may still be MOVED, because they are still on the draw and the draw
--    is the record of who worked with whom; they may not be ADDED, because
--    adding somebody to a team is a claim about the class as it is now.
--
-- 3. A CROSS-SET MOVE IS UNREPRESENTABLE, NOT REFUSED. 0223's composite key
--    `(team_id, team_set_id)` means a member row cannot name a team of another
--    draw at all, so the RPC's own "That team is not part of this draw." is a
--    readable sentence in front of a key that would refuse anyway.
--
-- 4. A RENAME IS NOT AN EDIT OF THE DRAW AND NEEDS NO SQL. The manager branch
--    of 0223's `classroom_set_team_style` already writes `name`. A rename
--    changes no membership, so the seed still reproduces exactly who is on
--    which team, and it does not stamp `edited_at`.
--
-- 5. THE BOARD PROJECTS THE MARK, AND WHO MADE IT ONLY TO A MANAGER.
--    `classroom_team_board` is re-created with the same signature and the same
--    return type (jsonb), so this is not the signature trap and no drop is
--    involved. Its body is 0223's, byte for byte, plus two projected columns:
--    `edited_at` for every caller (the class page says "Edited by hand"), and
--    `edited_by` only when the caller manages the section. A student learns
--    that a teacher changed the teams, never an address.
--
-- ===========================================================================
-- PART B. EACH COURSE GETS A THEME, AND THE CLASS VOTES IT INTO BEING
-- (decision 45).
-- ===========================================================================
--
-- 1. WHAT IS VOTED ON IS A FIXED CATALOGUE THAT LIVES IN THE CLIENT, NOT HERE.
--    A feature id and an option id are length-bounded lowercase slugs, and the
--    client validates them against its catalogue, exactly as 0223 stores a
--    badge id as free text rather than a CHECK list: a list written into SQL is
--    a second copy of the catalogue and the copy that cannot change without a
--    migration. What bounds junk rows instead is a cap of twelve distinct
--    features per voter per course, far above any catalogue this ships with.
--
-- 2. THE ELECTORATE IS LIVE. A voter is anybody with an ACTIVE enrollment in a
--    section of the course whose section is itself active (0083's flag).
--    Anybody who manages a section of the course, an admin included, is
--    refused a vote: decision 45 gives teachers the accent and the class the
--    theme. `classroom_manages_section` answers true for an admin on every
--    section (0138's `_classroom_manages_section_email` asks `_admin_is_email`
--    before it looks at the section at all), so an admin is a manager of every
--    course that has a section, and reads the tally and opens and closes
--    voting through the same rule rather than a second one.
--
-- 3. ONE VOTE PER STUDENT PER FEATURE IS A PRIMARY KEY, `(course_id, feature,
--    student_email)`, and changing your mind is an upsert. Withdrawing deletes
--    the caller's OWN row and nothing else: a vote is a live preference, not a
--    record of the class.
--
-- 4. A RESET ARCHIVES, IT NEVER DELETES. `classroom_theme_reset` stamps
--    `reset_at`; every vote cast at or before it simply stops counting. A
--    student re-voting after a reset re-stamps their row, so it counts again.
--
-- 5. THE WINNER RULE HAS ONE IMPLEMENTATION, `_classroom_theme_winners`, over
--    ONE definition of a counted vote, `_classroom_theme_counted_votes`. Per
--    feature the option with the most counted votes wins. A TIE GOES TO THE
--    OPTION WHOSE MOST RECENT COUNTED VOTE IS EARLIEST: it reached the tied
--    count first, by accumulation. That is what stops the theme flickering
--    between two options on one refresh: a student switching to the other
--    option re-stamps their row, so the option that has only just drawn level
--    does not take over, and re-voting for the option you already hold stamps
--    nothing. Option id ascending is the last key, so the order is total.
--
-- 6. ONLY TALLIES LEAVE THIS FILE. `classroom_theme_tally` answers counts per
--    option, how many students have a counted vote, the winners, and the
--    CALLER'S OWN counted choices. It never carries another voter's address
--    and never a per-vote time. Both tables have RLS on, no policy and no
--    client grant, 0223's two independent refusals.
--
-- 7. ONE PAINT READ, `classroom_class_themes(uuid[])`, for the class page, My
--    classes and the header strip in one round trip. A section the caller
--    cannot see is OMITTED rather than refused, so an id cannot be probed; the
--    gate is `classroom_can_read_section`, the same predicate the class page
--    reaches through the section table's own select policy.
--
-- 8. EACH SECTION DIFFERS BY ONE ACCENT THE TEACHER SETS, `theme_accent` on
--    `classroom_sections`, written only through `classroom_set_section_accent`.
--    Same slug shape as an option id, validated by the client the same way.
--
-- ===========================================================================
-- GRANTS, AND WHY THE SHAPE IS 0166'S.
-- ===========================================================================
-- A hosted project writes a DIRECT `anon` grant into every new function and
-- table at creation time, which `revoke ... from public` never touches (0201
-- is the file that learned it). Every object here names the roles: public
-- functions are revoked from public, anon and authenticated and granted back
-- to authenticated; private helpers are granted to nobody, because none is
-- named inside an RLS policy and every caller is a definer body running as the
-- owner; the two tables are revoked from all three, so the missing policy and
-- the missing grant each deny on their own.
--
-- ===========================================================================
-- WHY THIS IS ADDITIVE, SO THE APPLY AND THE DEPLOY MAY LAND IN EITHER ORDER.
-- ===========================================================================
-- Nothing the deployed client calls is dropped or re-signatured. Three columns
-- are added, all nullable, so no stored row changes shape and no select that
-- names its columns changes answer. `classroom_team_board` keeps its signature
-- and its return type and only gains keys in its jsonb, which the deployed
-- client ignores. Every other function is new, and the client that calls them
-- degrades on PGRST202 alone, so a deploy that lands before this apply shows
-- no move controls and no theme rather than an error.
--
-- ===========================================================================
-- WHAT UNDOES THIS MIGRATION, stated before it is applied, per CLAUDE.md.
-- ===========================================================================
--
--   drop function if exists public.classroom_class_themes(uuid[]);
--   drop function if exists public.classroom_set_section_accent(uuid, text);
--   drop function if exists public.classroom_theme_reset(uuid);
--   drop function if exists public.classroom_theme_set_voting(uuid, boolean);
--   drop function if exists public.classroom_theme_tally(uuid);
--   drop function if exists public.classroom_theme_vote(uuid, text, text);
--   drop function if exists public._classroom_theme_winners(uuid);
--   drop function if exists public._classroom_theme_counted_votes(uuid);
--   drop function if exists public._classroom_theme_manager(uuid);
--   drop function if exists public._classroom_theme_voter(uuid, text);
--   drop table if exists public.classroom_theme_settings;
--   drop table if exists public.classroom_theme_votes;
--   alter table public.classroom_sections drop constraint if exists classroom_sections_theme_accent_shape;
--   alter table public.classroom_sections drop column if exists theme_accent;
--   drop function if exists public.classroom_move_team_member(uuid, text, uuid);
--   -- then re-paste 0223's classroom_team_board (its section 6) FIRST, because
--   -- a plpgsql body records no dependency on the columns it reads, and only
--   -- after that:
--   alter table public.classroom_team_sets drop constraint if exists classroom_team_sets_edited_mark;
--   alter table public.classroom_team_sets drop column if exists edited_by;
--   alter table public.classroom_team_sets drop column if exists edited_at;
--
-- Those are destructive DDL and a PERSON'S to run, not a session's. Nothing
-- outside this file references any object it creates.
--
-- NO DOLLAR SIGN APPEARS IN ANY COMMENT IN THIS FILE, deliberately: a
-- dollar-quote token inside a comment balances in Postgres and breaks the
-- Supabase editor's own statement splitter, which cost 0194 an apply cycle.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- PART A. TEAMS
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- A1. The mark on the set
--
-- Both nullable: a draw nobody edited by hand has neither. The constraint makes
-- the pair travel together and holds `edited_by` to the same normalized-email
-- shape as 0223's `created_by`. Guarded on pg_constraint because Postgres has
-- no `add constraint if not exists`, so the file re-applies cleanly.
-- ---------------------------------------------------------------------------

alter table public.classroom_team_sets
	add column if not exists edited_at timestamptz;
alter table public.classroom_team_sets
	add column if not exists edited_by text;

do $teams$
begin
	if not exists (
		select 1 from pg_catalog.pg_constraint
		where conname = 'classroom_team_sets_edited_mark'
		  and conrelid = 'public.classroom_team_sets'::regclass
	) then
		alter table public.classroom_team_sets
			add constraint classroom_team_sets_edited_mark
			check (
				(edited_at is null and edited_by is null)
				or (
					edited_at is not null
					and edited_by = lower(btrim(edited_by))
					and edited_by like '%@%'
				)
			);
	end if;
end;
$teams$;

-- ---------------------------------------------------------------------------
-- A2. The move
--
-- `moved` and `added` are two different outcomes and never both true:
--   moved true    a student already on the draw changed team
--   added true    a student not on the draw joined it (a latecomer)
--   both false    already on that team; nothing changed and nothing stamped
-- ---------------------------------------------------------------------------

create or replace function public.classroom_move_team_member(
	p_team_set_id uuid,
	p_student_email text,
	p_to_team_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $teams$
declare
	v_email text := public.current_user_email();
	v_student text := lower(btrim(coalesce(p_student_email, '')));
	v_section uuid;
	v_current uuid;
	v_moved boolean := false;
	v_added boolean := false;
begin
	if v_email = '' then
		raise exception 'You must be signed in to change teams.';
	end if;

	-- THE LOCK IS THE SERIALIZATION POINT. Two managers moving students in one
	-- draw at the same moment take turns here, so the second reads the first's
	-- result rather than a snapshot from before it.
	select s.section_id into v_section
	from public.classroom_team_sets s
	where s.id = p_team_set_id and s.archived_at is null
	for update;

	if v_section is null then
		raise exception 'Team set not found.';
	end if;

	if public.classroom_manages_section(v_section) is not true then
		raise exception 'Only a teacher of this class can change its teams.';
	end if;

	if not exists (
		select 1 from public.classroom_teams t
		where t.id = p_to_team_id and t.team_set_id = p_team_set_id
	) then
		raise exception 'That team is not part of this draw.';
	end if;

	select m.team_id into v_current
	from public.classroom_team_members m
	where m.team_set_id = p_team_set_id and m.student_email = v_student;

	if v_current is not null then
		if v_current = p_to_team_id then
			return jsonb_build_object(
				'ok', true, 'moved', false, 'added', false, 'team_id', p_to_team_id
			);
		end if;

		update public.classroom_team_members
		set team_id = p_to_team_id
		where team_set_id = p_team_set_id and student_email = v_student;
		v_moved := true;
	else
		-- An ADD is a claim about the class as it is now, so it needs a live
		-- enrollment. A MOVE (above) does not: a student who has left is still
		-- on the draw, and the draw is the record.
		if not exists (
			select 1 from public.classroom_enrollments e
			where e.section_id = v_section
			  and e.student_email = v_student
			  and e.active
		) then
			raise exception 'That student is not enrolled in this class.';
		end if;

		insert into public.classroom_team_members (team_set_id, team_id, student_email)
		values (p_team_set_id, p_to_team_id, v_student);
		v_added := true;
	end if;

	update public.classroom_team_sets
	set edited_at = now(),
		edited_by = v_email,
		updated_at = now()
	where id = p_team_set_id;

	return jsonb_build_object(
		'ok', true, 'moved', v_moved, 'added', v_added, 'team_id', p_to_team_id
	);
end;
$teams$;

revoke all on function public.classroom_move_team_member(uuid, text, uuid)
	from public, anon, authenticated;
grant execute on function public.classroom_move_team_member(uuid, text, uuid)
	to authenticated;

-- ---------------------------------------------------------------------------
-- A3. The board, re-created with the mark
--
-- 0223's body verbatim, plus exactly two lines after `showing`: `s.edited_at`
-- for every caller, and `s.edited_by` only when `v_manages` is true. Same
-- signature and same return type, so `create or replace` replaces it in place
-- and no second overload can exist. `tests/db/classroom-team-edits.test.ts`
-- diffs this body against 0223's and reddens on any other change.
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
			s.edited_at,
			case when v_manages then s.edited_by end as edited_by,
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

-- ===========================================================================
-- PART B. CLASS THEMES
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- B1. The section accent
-- ---------------------------------------------------------------------------

alter table public.classroom_sections
	add column if not exists theme_accent text;

do $theme$
begin
	if not exists (
		select 1 from pg_catalog.pg_constraint
		where conname = 'classroom_sections_theme_accent_shape'
		  and conrelid = 'public.classroom_sections'::regclass
	) then
		-- `!~ '[^a-z0-9-]'` rather than an anchored pattern: the end anchor is a
		-- dollar sign, and this file is pasted by hand.
		alter table public.classroom_sections
			add constraint classroom_sections_theme_accent_shape
			check (
				theme_accent is null
				or (
					char_length(theme_accent) between 1 and 40
					and theme_accent !~ '[^a-z0-9-]'
				)
			);
	end if;
end;
$theme$;

-- ---------------------------------------------------------------------------
-- B2. The two tables
-- ---------------------------------------------------------------------------

create table if not exists public.classroom_theme_votes (
	course_id uuid not null references public.classroom_courses (id) on delete cascade,
	feature text not null
		check (char_length(feature) between 1 and 40 and feature !~ '[^a-z0-9-]'),
	student_email text not null
		check (student_email = lower(btrim(student_email)) and student_email like '%@%'),
	option_id text not null
		check (char_length(option_id) between 1 and 40 and option_id !~ '[^a-z0-9-]'),
	-- WHEN THIS VOTE LAST COUNTED FROM, and it is load-bearing twice: a vote at
	-- or before the course's `reset_at` does not count, and the tie rule reads
	-- the latest counted vote per option. Re-voting for the option already held
	-- leaves it alone, so a repeat click cannot move a tie.
	voted_at timestamptz not null default now(),
	primary key (course_id, feature, student_email)
);

create index if not exists classroom_theme_votes_voter_idx
	on public.classroom_theme_votes (course_id, student_email);

-- No row means voting is open and has never been reset.
create table if not exists public.classroom_theme_settings (
	course_id uuid primary key references public.classroom_courses (id) on delete cascade,
	voting_open boolean not null default true,
	reset_at timestamptz,
	updated_by text
		check (updated_by is null or (updated_by = lower(btrim(updated_by)) and updated_by like '%@%')),
	updated_at timestamptz not null default now()
);

alter table public.classroom_theme_votes enable row level security;
alter table public.classroom_theme_settings enable row level security;

revoke all on table public.classroom_theme_votes from public, anon, authenticated;
revoke all on table public.classroom_theme_settings from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- B3. Private helpers. SECURITY DEFINER, empty search_path, granted to nobody:
--     none is named inside an RLS policy and every caller is a definer body.
-- ---------------------------------------------------------------------------

-- WHO MAY VOTE. The email-scoped form, because the vote and the tally ask it
-- about the caller and a test asks it about a third party; the empty string is
-- refused explicitly, which is `current_user_email()`'s answer with no session.
create or replace function public._classroom_theme_voter(p_course_id uuid, p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $theme$
	select case
		when coalesce(btrim(p_email), '') = '' then false
		else exists (
			select 1
			from public.classroom_enrollments e
			join public.classroom_sections s on s.id = e.section_id
			where s.course_id = p_course_id
			  and s.active
			  and e.active
			  and e.student_email = lower(btrim(p_email))
		)
	end;
$theme$;

revoke all on function public._classroom_theme_voter(uuid, text)
	from public, anon, authenticated;

-- WHO MANAGES THE COURSE'S THEME: whoever manages at least one of its sections,
-- asked through the WRAPPER, so this is not a third statement of the manage
-- rule. True for an admin whenever the course has a section.
create or replace function public._classroom_theme_manager(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $theme$
	select exists (
		select 1
		from public.classroom_sections s
		where s.course_id = p_course_id
		  and public.classroom_manages_section(s.id) is true
	);
$theme$;

revoke all on function public._classroom_theme_manager(uuid)
	from public, anon, authenticated;

-- WHICH VOTES COUNT: every vote cast after the course's last reset. The one
-- definition, read by the winner rule and by every figure the tally reports,
-- so a count and a winner can never be taken over two different sets.
create or replace function public._classroom_theme_counted_votes(p_course_id uuid)
returns table (feature text, option_id text, student_email text, voted_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $theme$
	select v.feature, v.option_id, v.student_email, v.voted_at
	from public.classroom_theme_votes v
	where v.course_id = p_course_id
	  and v.voted_at > coalesce(
		(select st.reset_at from public.classroom_theme_settings st where st.course_id = p_course_id),
		'-infinity'::timestamptz
	  );
$theme$;

revoke all on function public._classroom_theme_counted_votes(uuid)
	from public, anon, authenticated;

-- THE WINNER RULE, AND THERE IS ONE OF IT. Most counted votes; a tie to the
-- option whose latest counted vote is EARLIEST; then option id. See the header.
create or replace function public._classroom_theme_winners(p_course_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $theme$
	select coalesce(jsonb_object_agg(w.feature, w.option_id), '{}'::jsonb)
	from (
		select distinct on (c.feature) c.feature, c.option_id
		from (
			select cv.feature, cv.option_id, count(*) as votes, max(cv.voted_at) as last_at
			from public._classroom_theme_counted_votes(p_course_id) cv
			group by cv.feature, cv.option_id
		) as c
		order by c.feature, c.votes desc, c.last_at asc, c.option_id asc
	) as w;
$theme$;

revoke all on function public._classroom_theme_winners(uuid)
	from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- B4. The vote
-- ---------------------------------------------------------------------------

create or replace function public.classroom_theme_vote(
	p_course_id uuid,
	p_feature text,
	p_option text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $theme$
declare
	v_email text := public.current_user_email();
	v_feature text := lower(btrim(coalesce(p_feature, '')));
	v_option text := lower(btrim(coalesce(p_option, '')));
	v_open boolean;
	v_reset timestamptz;
	v_held integer;
begin
	if v_email = '' then
		raise exception 'You must be signed in to vote on the class theme.';
	end if;

	if char_length(v_feature) not between 1 and 40 or v_feature ~ '[^a-z0-9-]' then
		raise exception 'That is not one of the class theme''s features.';
	end if;

	if v_option <> '' and (char_length(v_option) > 40 or v_option ~ '[^a-z0-9-]') then
		raise exception 'That is not one of the choices for this part of the theme.';
	end if;

	if public._classroom_theme_manager(p_course_id) then
		raise exception 'Teachers set the class accent; the theme is the class''s vote.';
	end if;

	-- Not a voter and no such course answer identically, so a course id
	-- cannot be probed.
	if not public._classroom_theme_voter(p_course_id, v_email) then
		raise exception 'Not found.';
	end if;

	select st.voting_open, st.reset_at into v_open, v_reset
	from public.classroom_theme_settings st
	where st.course_id = p_course_id;

	-- A GRACEFUL REFUSAL, NOT A RAISE: a surface shows "voting is closed" in
	-- words, and a withdrawal is frozen along with everything else.
	if coalesce(v_open, true) is not true then
		return jsonb_build_object('ok', false, 'reason', 'closed');
	end if;

	if v_option = '' then
		delete from public.classroom_theme_votes v
		where v.course_id = p_course_id
		  and v.feature = v_feature
		  and v.student_email = v_email;
		return jsonb_build_object('ok', true, 'withdrawn', true);
	end if;

	-- THE CAP, serialized per voter per course: there is no parent row to lock
	-- for somebody who holds no vote yet, so two concurrent new features from
	-- one student take turns on this key instead.
	perform pg_advisory_xact_lock(hashtextextended('classroom_theme_vote:' || p_course_id::text || ':' || v_email, 0));

	if not exists (
		select 1 from public.classroom_theme_votes v
		where v.course_id = p_course_id
		  and v.feature = v_feature
		  and v.student_email = v_email
	) then
		select count(*) into v_held
		from public.classroom_theme_votes v
		where v.course_id = p_course_id and v.student_email = v_email;

		if v_held >= 12 then
			raise exception 'You have already voted on every part of the theme this class can have.';
		end if;
	end if;

	insert into public.classroom_theme_votes as cur
		(course_id, feature, student_email, option_id, voted_at)
	values (p_course_id, v_feature, v_email, v_option, now())
	on conflict (course_id, feature, student_email) do update
	set option_id = excluded.option_id,
		voted_at = case
			when cur.option_id is distinct from excluded.option_id
				or cur.voted_at <= coalesce(v_reset, '-infinity'::timestamptz)
				then excluded.voted_at
			else cur.voted_at
		end;

	return jsonb_build_object(
		'ok', true,
		'option', v_option,
		'winners', public._classroom_theme_winners(p_course_id)
	);
end;
$theme$;

revoke all on function public.classroom_theme_vote(uuid, text, text)
	from public, anon, authenticated;
grant execute on function public.classroom_theme_vote(uuid, text, text)
	to authenticated;

-- ---------------------------------------------------------------------------
-- B5. The tally. Counts, never voters.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_theme_tally(p_course_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $theme$
declare
	v_email text := public.current_user_email();
	v_manages boolean;
	v_voter boolean;
	v_open boolean;
	v_reset timestamptz;
begin
	if v_email = '' then
		raise exception 'You must be signed in to read the class theme vote.';
	end if;

	v_manages := public._classroom_theme_manager(p_course_id);
	v_voter := public._classroom_theme_voter(p_course_id, v_email);

	if not v_manages and not v_voter then
		raise exception 'Not found.';
	end if;

	select st.voting_open, st.reset_at into v_open, v_reset
	from public.classroom_theme_settings st
	where st.course_id = p_course_id;

	return jsonb_build_object(
		'ok', true,
		'course_id', p_course_id,
		'voting_open', coalesce(v_open, true),
		'reset_at', v_reset,
		'manages', v_manages,
		'can_vote', v_voter and not v_manages,
		'voters', (
			select count(distinct cv.student_email)
			from public._classroom_theme_counted_votes(p_course_id) cv
		),
		'counts', (
			select coalesce(
				jsonb_agg(
					jsonb_build_object('feature', c.feature, 'option', c.option_id, 'votes', c.votes)
					order by c.feature, c.votes desc, c.option_id
				),
				'[]'::jsonb
			)
			from (
				select cv.feature, cv.option_id, count(*) as votes
				from public._classroom_theme_counted_votes(p_course_id) cv
				group by cv.feature, cv.option_id
			) as c
		),
		'winners', public._classroom_theme_winners(p_course_id),
		'mine', (
			select coalesce(jsonb_object_agg(cv.feature, cv.option_id), '{}'::jsonb)
			from public._classroom_theme_counted_votes(p_course_id) cv
			where cv.student_email = v_email
		)
	);
end;
$theme$;

revoke all on function public.classroom_theme_tally(uuid)
	from public, anon, authenticated;
grant execute on function public.classroom_theme_tally(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- B6. Open, close and reset. A manager of the course, else 'Not found.'
-- ---------------------------------------------------------------------------

create or replace function public.classroom_theme_set_voting(p_course_id uuid, p_open boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $theme$
declare
	v_email text := public.current_user_email();
	v_open boolean;
	v_reset timestamptz;
begin
	if v_email = '' then
		raise exception 'You must be signed in to open or close the class theme vote.';
	end if;

	if not public._classroom_theme_manager(p_course_id) then
		raise exception 'Not found.';
	end if;

	if p_open is null then
		raise exception 'Say whether voting on the class theme is open or closed.';
	end if;

	insert into public.classroom_theme_settings as cur
		(course_id, voting_open, updated_by, updated_at)
	values (p_course_id, p_open, v_email, now())
	on conflict (course_id) do update
	set voting_open = excluded.voting_open,
		updated_by = excluded.updated_by,
		updated_at = excluded.updated_at
	returning cur.voting_open, cur.reset_at into v_open, v_reset;

	return jsonb_build_object('ok', true, 'voting_open', v_open, 'reset_at', v_reset);
end;
$theme$;

revoke all on function public.classroom_theme_set_voting(uuid, boolean)
	from public, anon, authenticated;
grant execute on function public.classroom_theme_set_voting(uuid, boolean)
	to authenticated;

-- ARCHIVE, NEVER DELETE: a reset stamps the line and every vote behind it stops
-- counting. Nothing is removed, and a student re-voting counts again.
create or replace function public.classroom_theme_reset(p_course_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $theme$
declare
	v_email text := public.current_user_email();
	v_open boolean;
	v_reset timestamptz;
begin
	if v_email = '' then
		raise exception 'You must be signed in to reset the class theme vote.';
	end if;

	if not public._classroom_theme_manager(p_course_id) then
		raise exception 'Not found.';
	end if;

	insert into public.classroom_theme_settings as cur
		(course_id, reset_at, updated_by, updated_at)
	values (p_course_id, now(), v_email, now())
	on conflict (course_id) do update
	set reset_at = excluded.reset_at,
		updated_by = excluded.updated_by,
		updated_at = excluded.updated_at
	returning cur.voting_open, cur.reset_at into v_open, v_reset;

	return jsonb_build_object('ok', true, 'voting_open', v_open, 'reset_at', v_reset);
end;
$theme$;

revoke all on function public.classroom_theme_reset(uuid)
	from public, anon, authenticated;
grant execute on function public.classroom_theme_reset(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- B7. The section accent write
-- ---------------------------------------------------------------------------

create or replace function public.classroom_set_section_accent(p_section_id uuid, p_accent text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $theme$
declare
	v_email text := public.current_user_email();
	v_accent text := nullif(lower(btrim(coalesce(p_accent, ''))), '');
begin
	if v_email = '' then
		raise exception 'You must be signed in to set a class accent.';
	end if;

	if public.classroom_manages_section(p_section_id) is not true then
		raise exception 'Only a teacher of this class can set its accent.';
	end if;

	if v_accent is not null and (char_length(v_accent) > 40 or v_accent ~ '[^a-z0-9-]') then
		raise exception 'That is not one of the class accents.';
	end if;

	update public.classroom_sections
	set theme_accent = v_accent
	where id = p_section_id;

	-- Reachable only by an admin, for whom the manage rule answers true about
	-- any id at all.
	if not found then
		raise exception 'Class not found.';
	end if;

	return jsonb_build_object('ok', true, 'accent', v_accent);
end;
$theme$;

revoke all on function public.classroom_set_section_accent(uuid, text)
	from public, anon, authenticated;
grant execute on function public.classroom_set_section_accent(uuid, text)
	to authenticated;

-- ---------------------------------------------------------------------------
-- B8. The paint read. One object per visible section, in the order asked;
--     an id the caller cannot see is omitted, never an error.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_class_themes(p_section_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $theme$
declare
	v_email text := public.current_user_email();
	v_out jsonb;
begin
	if v_email = '' then
		raise exception 'You must be signed in to read class themes.';
	end if;

	if p_section_ids is null then
		return '[]'::jsonb;
	end if;

	if cardinality(p_section_ids) > 200 then
		raise exception 'Ask for at most 200 classes at a time.';
	end if;

	with asked as (
		select a.id, min(a.ord) as ord
		from unnest(p_section_ids) with ordinality as a(id, ord)
		where a.id is not null
		group by a.id
	),
	visible as (
		select s.id, s.course_id, s.theme_accent, asked.ord
		from asked
		join public.classroom_sections s on s.id = asked.id
		where public.classroom_can_read_section(s.id)
	),
	courses as (
		select c.course_id, public._classroom_theme_winners(c.course_id) as winners
		from (select distinct v.course_id from visible v) as c
	)
	select coalesce(
		jsonb_agg(
			jsonb_build_object(
				'section_id', v.id,
				'course_id', v.course_id,
				'accent', v.theme_accent,
				'winners', c.winners
			)
			order by v.ord
		),
		'[]'::jsonb
	)
	into v_out
	from visible v
	join courses c on c.course_id = v.course_id;

	return v_out;
end;
$theme$;

revoke all on function public.classroom_class_themes(uuid[])
	from public, anon, authenticated;
grant execute on function public.classroom_class_themes(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- C. Apply-time self-check
--
-- IT ASSERTS THE CATALOG, NOT ITS OWN VERDICT, AND IT NAMES ONLY THIS FILE'S
-- OBJECTS: the two tables, the three new columns and their two constraints,
-- the seven new public functions and the re-created board, and the four private
-- helpers. It sweeps no prefix, so a chain that deliberately leaves an earlier
-- repair out as a negative control still applies this file.
-- ---------------------------------------------------------------------------

do $check$
declare
	v_tables text[] := array[
		'classroom_theme_votes',
		'classroom_theme_settings'
	];
	v_columns text[] := array[
		'classroom_team_sets.edited_at',
		'classroom_team_sets.edited_by',
		'classroom_sections.theme_accent'
	];
	v_constraints text[] := array[
		'classroom_team_sets_edited_mark',
		'classroom_sections_theme_accent_shape'
	];
	v_public_fns text[] := array[
		'classroom_move_team_member(uuid, text, uuid)',
		'classroom_team_board(uuid)',
		'classroom_theme_vote(uuid, text, text)',
		'classroom_theme_tally(uuid)',
		'classroom_theme_set_voting(uuid, boolean)',
		'classroom_theme_reset(uuid)',
		'classroom_set_section_accent(uuid, text)',
		'classroom_class_themes(uuid[])'
	];
	v_private_fns text[] := array[
		'_classroom_theme_voter(uuid, text)',
		'_classroom_theme_manager(uuid)',
		'_classroom_theme_counted_votes(uuid)',
		'_classroom_theme_winners(uuid)'
	];
	v_name text;
	v_priv text;
	v_policies integer;
	v_rls boolean;
	v_overloads integer;
begin
	foreach v_name in array v_tables loop
		select c.relrowsecurity into v_rls
		from pg_catalog.pg_class c
		join pg_catalog.pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'public' and c.relname = v_name;

		if v_rls is null then
			raise exception '0225: table public.% is missing.', v_name;
		end if;
		if not v_rls then
			raise exception '0225: table public.% does not have row level security enabled.', v_name;
		end if;

		select count(*) into v_policies
		from pg_catalog.pg_policies p
		where p.schemaname = 'public' and p.tablename = v_name;
		if v_policies <> 0 then
			raise exception '0225: table public.% carries % policy/policies; it must have none.', v_name, v_policies;
		end if;

		foreach v_priv in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
			if has_table_privilege('anon', 'public.' || v_name, v_priv)
				or has_table_privilege('authenticated', 'public.' || v_name, v_priv) then
				raise exception '0225: a client role still holds % on public.% -- the revoke must name the roles.', v_priv, v_name;
			end if;
		end loop;
	end loop;

	foreach v_name in array v_columns loop
		if not exists (
			select 1 from information_schema.columns
			where table_schema = 'public'
			  and table_name = split_part(v_name, '.', 1)
			  and column_name = split_part(v_name, '.', 2)
			  and is_nullable = 'YES'
		) then
			raise exception '0225: nullable column public.% is missing.', v_name;
		end if;
	end loop;

	foreach v_name in array v_constraints loop
		if (select count(*) from pg_catalog.pg_constraint where conname = v_name) <> 1 then
			raise exception '0225: constraint % is missing or duplicated.', v_name;
		end if;
	end loop;

	foreach v_name in array v_public_fns loop
		if to_regprocedure('public.' || v_name) is null then
			raise exception '0225: function public.% is missing.', v_name;
		end if;
		select count(*) into v_overloads
		from pg_catalog.pg_proc p
		join pg_catalog.pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = split_part(v_name, '(', 1);
		if v_overloads <> 1 then
			raise exception '0225: public.% has % overloads; it must have exactly one.', split_part(v_name, '(', 1), v_overloads;
		end if;
		if has_function_privilege('anon', 'public.' || v_name, 'execute') then
			raise exception '0225: anon can execute public.% -- revoke from anon BY NAME, per 0166.', v_name;
		end if;
		if not has_function_privilege('authenticated', 'public.' || v_name, 'execute') then
			raise exception '0225: authenticated cannot execute public.% -- the grant is missing.', v_name;
		end if;
	end loop;

	foreach v_name in array v_private_fns loop
		if to_regprocedure('public.' || v_name) is null then
			raise exception '0225: function public.% is missing.', v_name;
		end if;
		if has_function_privilege('anon', 'public.' || v_name, 'execute')
			or has_function_privilege('authenticated', 'public.' || v_name, 'execute') then
			raise exception '0225: private helper public.% is executable by a client role.', v_name;
		end if;
	end loop;

	-- The board replace took: its live body projects the mark.
	if not exists (
		select 1 from pg_catalog.pg_proc p
		join pg_catalog.pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public'
		  and p.proname = 'classroom_team_board'
		  and p.prosrc like '%s.edited_at,%'
		  and p.prosrc like '%case when v_manages then s.edited_by end as edited_by%'
	) then
		raise exception '0225: classroom_team_board does not project the edited mark.';
	end if;

	raise notice '0225: % tables deny-all, % columns, % constraints, % granted functions, % private helpers -- all checked against the catalog.',
		array_length(v_tables, 1), array_length(v_columns, 1), array_length(v_constraints, 1),
		array_length(v_public_fns, 1), array_length(v_private_fns, 1);
end;
$check$;

-- ---------------------------------------------------------------------------
-- D. VERIFICATION QUERY -- read-only, commented out, run it by hand AFTER the
--    apply, as the LAST statement in the editor.
--
--    The Supabase SQL editor shows only the final statement's result and no
--    notices, so the self-check above is invisible there. This is the part a
--    person can READ: every object it examined, the ACTUAL state beside the
--    EXPECTED one, never a bare count.
--
--    THE LAST ROW IS A POSITIVE CONTROL, and it is the row to read first.
--    `gauntlet_macro_start` is one of this project's deliberate public surfaces,
--    so it MUST come back `anon=yes`. If it does not, the query is not reading
--    grants at all and every OK above it means nothing.
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
--   from unnest(array['classroom_theme_votes','classroom_theme_settings']) as t(tbl)
--   join pg_class c on c.relname = t.tbl
--   join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
--
--   union all
--   select 2, 'nullable column present', 'public.' || col,
--     (select coalesce(max('nullable=' || is_nullable), 'MISSING') from information_schema.columns
--       where table_schema = 'public' and table_name = split_part(col, '.', 1)
--         and column_name = split_part(col, '.', 2)),
--     'nullable=YES'
--   from unnest(array['classroom_team_sets.edited_at','classroom_team_sets.edited_by',
--                     'classroom_sections.theme_accent']) as col
--
--   union all
--   select 3, 'granted to authenticated only', 'public.' || f.sig,
--     'anon=' || (case when has_function_privilege('anon', 'public.' || f.sig, 'execute') then 'yes' else 'no' end)
--       || ' authenticated=' || (case when has_function_privilege('authenticated', 'public.' || f.sig, 'execute') then 'yes' else 'no' end),
--     'anon=no authenticated=yes'
--   from unnest(array[
--     'classroom_move_team_member(uuid, text, uuid)',
--     'classroom_team_board(uuid)',
--     'classroom_theme_vote(uuid, text, text)',
--     'classroom_theme_tally(uuid)',
--     'classroom_theme_set_voting(uuid, boolean)',
--     'classroom_theme_reset(uuid)',
--     'classroom_set_section_accent(uuid, text)',
--     'classroom_class_themes(uuid[])'
--   ]) as f(sig)
--
--   union all
--   select 4, 'private helper, no client role', 'public.' || f.sig,
--     'anon=' || (case when has_function_privilege('anon', 'public.' || f.sig, 'execute') then 'yes' else 'no' end)
--       || ' authenticated=' || (case when has_function_privilege('authenticated', 'public.' || f.sig, 'execute') then 'yes' else 'no' end),
--     'anon=no authenticated=no'
--   from unnest(array[
--     '_classroom_theme_voter(uuid, text)',
--     '_classroom_theme_manager(uuid)',
--     '_classroom_theme_counted_votes(uuid)',
--     '_classroom_theme_winners(uuid)'
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
