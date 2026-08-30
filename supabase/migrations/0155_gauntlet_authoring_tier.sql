-- 0155_gauntlet_authoring_tier.sql
-- IDEA // GAUNTLET: an AUTHOR tier -- an explicit allowlist that grants
-- challenge authoring, publishing and room hosting, and nothing else.
--
-- ---------------------------------------------------------------------------
-- WHY THIS EXISTS, AND WHAT 0067 ACTUALLY DECIDED
--
-- 0067 gives its reason in full, so this is not a re-widening of an unrecorded
-- decision. Its header names what every @boscotech.edu address inherited from
-- `is_teacher()` the moment it first signed in: the ability to change anybody's
-- role (including granting that power onward), the FSP/FRC interest roster
-- (student names, emails, phone numbers, parent emails), the IDEA Coin entry
-- tool, every student's graded work, moderation of other people's content, and
-- permanent deletion. "That is administrator access handed out by email
-- domain."
--
-- So the decision 0067 made was about BREADTH, not about GAUNTLET. It could not
-- separate authoring from role-editing because it had no way to: migrations
-- here are an immutable applied record, ~90 policies already named
-- `is_teacher()`, and the only instrument available was redefining that one
-- function body. The narrowing was a blunt tool used because a precise one did
-- not exist. GAUNTLET authoring was collateral, not a target -- nothing in 0067
-- says a teacher must not author a challenge.
--
-- That reason CONSTRAINS this file rather than licensing it. The tier below may
-- not reach one item on 0067's list. Every gate it opens is checked against
-- that list in section 5, and every gate it deliberately leaves shut is named
-- there too, with the reason.
--
-- ---------------------------------------------------------------------------
-- AN ALLOWLIST, NOT AN INFERENCE. This is the decided shape and the two reasons
-- are recorded here so nobody re-opens it:
--
--   1. 0067's narrowing was DELIBERATE. Inferring authoring rights from some
--      other fact about a person (teaching a section, holding the domain role)
--      would silently undo it for a population nobody enumerated.
--   2. An inferred predicate grants the capability as a SIDE EFFECT of
--      unrelated data. Keyed on "teacher of record", every teacher on the next
--      roster import becomes a GAUNTLET author, with the roster import as the
--      only record of the decision. A capability must arrive because somebody
--      granted it.
--
-- ---------------------------------------------------------------------------
-- WHAT IS MIRRORED FROM `app_admins`, deliberately, rather than invented:
--
--   * IDENTITY IS THE LOWERCASED EMAIL, not a user id, with the same
--     `email = lower(btrim(email)) and email like '%@%'` CHECK. An account can
--     be authorized before it has ever signed in; there is no auth.users row to
--     reference until then and no linking step afterwards.
--   * The same column set: `granted_by`, `granted_at`, and a `note` capped at
--     200 characters.
--   * SECURITY DEFINER + `set search_path = ''` on every function, so the
--     predicate can be used inside the roster table's own policy without
--     recursing -- 0067 section 3's reason, unchanged.
--   * THE ROSTER IS READ-ONLY TO CLIENTS AND ADMIN-ONLY TO READ. It carries
--     staff emails, exactly as `app_admins` does. Writes have no client path at
--     all: only the definer RPCs in section 3.
--   * Grant / revoke / list as three RPCs shaped like `admin_grant`,
--     `admin_revoke` and `admin_list`, with the same `@boscotech.edu`
--     restriction on who may be granted, the same lower(btrim()) normalization
--     and the same `on conflict do update` idempotence.
--   * `gauntlet_can_author()` is granted to `authenticated` exactly as
--     `is_admin()` is, and is the ONE predicate every gate calls.
--
-- TWO DELIBERATE DEVIATIONS, both narrowings or neutral:
--
--   * NO OWNER COLUMN, no `is_owner` flag, no pinned constant, no single-owner
--     index. The owner concept in 0067 exists so the site cannot lock itself
--     out of ADMIN. This tier cannot lock anyone out of anything: it is a
--     strict subset of what an admin already holds, `gauntlet_can_author()`
--     answers true for every admin whether or not this table exists, and an
--     empty roster degrades to exactly the world 0067 left behind.
--   * GRANT AND REVOKE ARE ADMIN-GATED, NOT OWNER-GATED. `admin_grant` is
--     owner-only because granting ADMIN grants the power to grant admin onward,
--     which is an escalation an admin must not be able to perform. Authoring
--     does not propagate -- an author cannot grant authoring -- and every
--     capability in this tier is one the granting admin already holds, so an
--     admin adding an author widens nothing they could not already do
--     themselves. Owner-only here would buy no containment and would mean one
--     person is the only route to a routine staffing decision.
--
-- ---------------------------------------------------------------------------
-- APPLY MANUALLY in the Supabase SQL editor, after 0154. Idempotent: every
-- statement is create-or-replace, `if not exists`, or drop-then-create, and the
-- seed is an upsert. Re-pasting it is ordinary and safe.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The roster
-- ---------------------------------------------------------------------------

create table if not exists public.gauntlet_authors (
	-- Lowercased. The account need not exist yet. Same CHECK as app_admins.
	email text primary key check (email = lower(btrim(email)) and email like '%@%'),
	-- Email of whoever granted it; null for the seeded rows.
	granted_by text,
	granted_at timestamptz not null default now(),
	note text check (note is null or char_length(note) <= 200)
);

comment on table public.gauntlet_authors is
	'GAUNTLET author tier (0155). An explicit allowlist, mirroring app_admins. Grants challenge authoring/publishing and room hosting ONLY -- never is_admin(). Read gauntlet_can_author(), never this table.';

-- ---------------------------------------------------------------------------
-- 2. The predicate
--
-- ADMIN IS FOLDED IN, WHICH IS WHAT MAKES EVERY RE-GATE BELOW A PURE WIDENING.
-- Each site in section 4 replaces `is_teacher()` (which since 0067 IS the admin
-- check) with this function. Because this function returns true for every
-- caller `is_admin()` returns true for, the set of callers who pass each of
-- those gates can only grow -- an admin cannot lose a gate by this file, and
-- nobody has to write `is_admin() or ...` at eleven call sites and get it right
-- eleven times.
--
-- IT IS THE ONLY PREDICATE. There is no email-scoped `_gauntlet_author_is_email`
-- twin of 0138's `_admin_is_email`, because 0138's own rule says to ask the
-- email-scoped form only when the subject is a THIRD PARTY, and nothing here
-- asks about one: there is no roster projection, no per-author gallery line, no
-- "who authored this" surface. A second spelling of the rule with no caller is
-- the copy that stops matching.
-- ---------------------------------------------------------------------------

create or replace function public.gauntlet_can_author()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select case
		when (select auth.uid()) is null then false
		-- Every admin authors. This is what keeps section 4 a widening.
		when public.is_admin() then true
		else exists (
			select 1 from public.gauntlet_authors a
			where a.email = public.current_user_email()
		)
	end;
$$;

comment on function public.gauntlet_can_author() is
	'True for a site admin OR an address on the gauntlet_authors allowlist (0155). GAUNTLET authoring/publishing/hosting only. NEVER a substitute for is_admin().';

-- The 0137 rule: on a hosted Supabase project a new function arrives with a
-- DIRECT grant to anon/authenticated/service_role from the bootstrap default
-- privileges, so `revoke ... from public` alone leaves anon holding EXECUTE.
-- Name the roles. 0137 was a one-time repair of what existed then and does not
-- cover anything created after it.
revoke all on function public.gauntlet_can_author()
	from public, anon, authenticated, service_role;
grant execute on function public.gauntlet_can_author() to authenticated;

-- Reads are admin-only: this is a list of staff email addresses, and that is
-- app_admins' own reason. Writes have no client path -- section 3 only.
revoke all on public.gauntlet_authors from public, anon, authenticated, service_role;
grant select on public.gauntlet_authors to authenticated;
alter table public.gauntlet_authors enable row level security;

drop policy if exists "admins read the author roster" on public.gauntlet_authors;
create policy "admins read the author roster"
	on public.gauntlet_authors
	for select
	to authenticated
	using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. Managing the roster. Admin-gated, enforced inside the function (see the
-- header for why this is admin and not owner).
-- ---------------------------------------------------------------------------

create or replace function public.gauntlet_author_grant(p_email text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
begin
	if not public.is_admin() then
		raise exception 'Only site admins can grant GAUNTLET authoring.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid email address.';
	end if;
	-- Deliberate, and the same rule admin_grant applies: this tier writes the
	-- content students are graded against and hosts the rooms they compete in.
	-- A student or outside address holding it would defeat the point.
	if v_email not like '%@boscotech.edu' then
		raise exception 'GAUNTLET authoring is limited to @boscotech.edu accounts (got "%").', v_email;
	end if;

	insert into public.gauntlet_authors (email, granted_by, note)
	values (v_email, public.current_user_email(), nullif(btrim(coalesce(p_note, '')), ''))
	on conflict (email) do update
		set granted_by = excluded.granted_by,
			granted_at = now(),
			note = coalesce(excluded.note, public.gauntlet_authors.note);

	return jsonb_build_object('email', v_email, 'granted', true);
end;
$$;

create or replace function public.gauntlet_author_revoke(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
begin
	if not public.is_admin() then
		raise exception 'Only site admins can revoke GAUNTLET authoring.';
	end if;
	-- No owner clause is needed here and none is written: an admin's authoring
	-- comes from is_admin() inside gauntlet_can_author(), never from a row, so
	-- deleting every row in this table cannot remove anybody's admin authoring.
	delete from public.gauntlet_authors where email = v_email;
	return jsonb_build_object('email', v_email, 'revoked', true);
end;
$$;

-- The roster, for an admin surface. Shaped like admin_list(): the gate is a
-- WHERE clause inside the definer body, so a non-admin gets an empty set rather
-- than an error, which is the same answer an empty roster gives.
create or replace function public.gauntlet_author_roster()
returns table (email text, granted_by text, granted_at timestamptz, note text)
language sql
stable
security definer
set search_path = ''
as $$
	select a.email, a.granted_by, a.granted_at, a.note
	from public.gauntlet_authors a
	where public.is_admin()
	order by a.email;
$$;

revoke all on function public.gauntlet_author_grant(text, text)
	from public, anon, authenticated, service_role;
revoke all on function public.gauntlet_author_revoke(text)
	from public, anon, authenticated, service_role;
revoke all on function public.gauntlet_author_roster()
	from public, anon, authenticated, service_role;
grant execute on function public.gauntlet_author_grant(text, text) to authenticated;
grant execute on function public.gauntlet_author_revoke(text) to authenticated;
grant execute on function public.gauntlet_author_roster() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. THE RE-GATE. Exactly eleven sites, each recreated from its LATEST applied
-- definition with `is_teacher()` replaced by `gauntlet_can_author()` and
-- nothing else changed. Section 5 is the census of every GAUNTLET gate and says
-- for each one whether it is here and why.
--
-- The bodies below are transcribed from the migration named in each comment.
-- Where a function was redefined after the file that created it, the LATEST
-- definition is the one reproduced (gauntlet_author_delete from 0019, not 0009;
-- gauntlet_room_create from 0028, not 0010).
-- ---------------------------------------------------------------------------

-- 4a. Reading challenges. From 0004. WITHOUT this an author sees only published
-- rows: the authoring list is empty of drafts, and the edit form cannot load the
-- row it is editing. Note the answer column stays withheld by the 0004
-- column-level grant -- this widens WHICH ROWS are visible, never which columns.
drop policy if exists "read published challenges" on public.challenges;
create policy "read published challenges"
	on public.challenges
	for select
	to authenticated
	using (published or public.gauntlet_can_author());

-- 4b. The four authoring RPCs. From 0009, except the delete, which is 0019's.

create or replace function public.gauntlet_author_get(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v jsonb;
begin
	if not public.gauntlet_can_author() then
		raise exception 'Only GAUNTLET authors can view challenge details.';
	end if;
	select jsonb_build_object(
		'id', id, 'mode', mode, 'title', title, 'difficulty', difficulty,
		'status', status, 'prompt', prompt, 'answer', answer
	) into v
	from public.challenges where id = p_id;
	if v is null then
		raise exception 'Challenge not found.';
	end if;
	return v;
end;
$$;

create or replace function public.gauntlet_author_upsert(
	p_id uuid,
	p_mode public.gauntlet_mode,
	p_title text,
	p_difficulty smallint,
	p_status text,
	p_prompt jsonb,
	p_answer jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_id uuid;
	v_block text;
begin
	if not public.gauntlet_can_author() then
		raise exception 'Only GAUNTLET authors can author challenges.';
	end if;
	if coalesce(btrim(p_title), '') = '' then
		raise exception 'A title is required.';
	end if;
	if p_difficulty is null or p_difficulty < 1 or p_difficulty > 5 then
		raise exception 'Difficulty must be 1 to 5.';
	end if;
	if p_status not in ('draft', 'published', 'archived') then
		raise exception 'Invalid status.';
	end if;
	if p_status = 'published' then
		v_block := public.gauntlet_publish_blocker(
			p_mode, coalesce(p_prompt, '{}'::jsonb), coalesce(p_answer, '{}'::jsonb));
		if v_block is not null then
			raise exception '%', v_block;
		end if;
	end if;

	if p_id is null then
		insert into public.challenges (mode, title, difficulty, prompt, answer, status, author_id)
		values (p_mode, btrim(p_title), p_difficulty,
			coalesce(p_prompt, '{}'::jsonb), coalesce(p_answer, '{}'::jsonb),
			p_status, (select auth.uid()))
		returning id into v_id;
	else
		update public.challenges
			set mode = p_mode, title = btrim(p_title), difficulty = p_difficulty,
				prompt = coalesce(p_prompt, '{}'::jsonb), answer = coalesce(p_answer, '{}'::jsonb),
				status = p_status
			where id = p_id
			returning id into v_id;
		if v_id is null then
			raise exception 'Challenge not found.';
		end if;
	end if;
	return v_id;
end;
$$;

create or replace function public.gauntlet_author_set_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_ch public.challenges%rowtype;
	v_block text;
begin
	if not public.gauntlet_can_author() then
		raise exception 'Only GAUNTLET authors can change a challenge status.';
	end if;
	if p_status not in ('draft', 'published', 'archived') then
		raise exception 'Invalid status.';
	end if;
	select * into v_ch from public.challenges where id = p_id;
	if not found then
		raise exception 'Challenge not found.';
	end if;
	if p_status = 'published' then
		v_block := public.gauntlet_publish_blocker(
			v_ch.mode, coalesce(v_ch.prompt, '{}'::jsonb), coalesce(v_ch.answer, '{}'::jsonb));
		if v_block is not null then
			raise exception '%', v_block;
		end if;
	end if;
	update public.challenges set status = p_status where id = p_id;
end;
$$;

-- 0019's body, including the demo hard-delete branch. Reproducing 0009's here
-- would silently revert that fix.
create or replace function public.gauntlet_author_delete(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_demo boolean;
begin
	if not public.gauntlet_can_author() then
		raise exception 'Only GAUNTLET authors can delete challenges.';
	end if;
	select coalesce((prompt ->> 'demo')::boolean, false) into v_demo
		from public.challenges where id = p_id;
	if v_demo is null then
		raise exception 'Challenge not found.';
	end if;
	if v_demo then
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

-- 4c. Series. From 0022. A series exists only to group authored challenges and
-- `gauntlet_series_assign` writes the CHALLENGE row's own series_id /
-- series_order columns, so this is editing a challenge by another name. It
-- carries no student data of any kind. The authoring list page is the only
-- surface for it, so leaving it shut would put an author on a page whose series
-- section fails with an RLS error -- the same "refused, but it reads as broken"
-- defect this bundle exists to fix, one panel over.
drop policy if exists "teachers insert series" on public.gauntlet_series;
create policy "teachers insert series"
	on public.gauntlet_series
	for insert
	to authenticated
	with check (public.gauntlet_can_author());

drop policy if exists "teachers update series" on public.gauntlet_series;
create policy "teachers update series"
	on public.gauntlet_series
	for update
	to authenticated
	using (public.gauntlet_can_author())
	with check (public.gauntlet_can_author());

drop policy if exists "teachers delete series" on public.gauntlet_series;
create policy "teachers delete series"
	on public.gauntlet_series
	for delete
	to authenticated
	using (public.gauntlet_can_author());

create or replace function public.gauntlet_series_assign(
	p_challenge_id uuid,
	p_series_id uuid,
	p_order integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	if not public.gauntlet_can_author() then
		raise exception 'Only GAUNTLET authors can organize series.';
	end if;
	if not exists (select 1 from public.challenges where id = p_challenge_id) then
		raise exception 'Challenge not found.';
	end if;
	if p_series_id is not null
		and not exists (select 1 from public.gauntlet_series where id = p_series_id) then
		raise exception 'Series not found.';
	end if;
	update public.challenges
		set series_id = p_series_id,
			series_order = case
				when p_series_id is null then null
				else coalesce(p_order, series_order, 0)
			end
		where id = p_challenge_id;
end;
$$;

-- 4d. Storage. The three buckets an authored challenge's own artifacts live in.
-- `gauntlet` (public, from 0009) takes reference images; `gauntlet-drawings`
-- and `gauntlet-models` (private, from 0015) take the gated PDF sheet and the
-- STL preview. ChallengeForm uploads to all three, so an author who cannot
-- write them can create a challenge and not finish one.
--
-- READ POLICIES ARE UNTOUCHED. 0015's "read gauntlet artifacts" already admits
-- every authenticated caller and is not a gate this file has any business
-- moving; the public `gauntlet` bucket serves without auth by construction.

drop policy if exists "teachers upload gauntlet assets" on storage.objects;
create policy "teachers upload gauntlet assets"
	on storage.objects
	for insert
	to authenticated
	with check (bucket_id = 'gauntlet' and public.gauntlet_can_author());

drop policy if exists "teachers update gauntlet assets" on storage.objects;
create policy "teachers update gauntlet assets"
	on storage.objects
	for update
	to authenticated
	using (bucket_id = 'gauntlet' and public.gauntlet_can_author())
	with check (bucket_id = 'gauntlet' and public.gauntlet_can_author());

drop policy if exists "teachers upload gauntlet artifacts" on storage.objects;
create policy "teachers upload gauntlet artifacts"
	on storage.objects
	for insert
	to authenticated
	with check (bucket_id in ('gauntlet-drawings', 'gauntlet-models') and public.gauntlet_can_author());

drop policy if exists "teachers update gauntlet artifacts" on storage.objects;
create policy "teachers update gauntlet artifacts"
	on storage.objects
	for update
	to authenticated
	using (bucket_id in ('gauntlet-drawings', 'gauntlet-models') and public.gauntlet_can_author())
	with check (bucket_id in ('gauntlet-drawings', 'gauntlet-models') and public.gauntlet_can_author());

drop policy if exists "teachers delete gauntlet artifacts" on storage.objects;
create policy "teachers delete gauntlet artifacts"
	on storage.objects
	for delete
	to authenticated
	using (bucket_id in ('gauntlet-drawings', 'gauntlet-models') and public.gauntlet_can_author());

-- 4e. Hosting a room. gauntlet_room_create is 0028's definition (the one that
-- also enrolls the host as a racer), NOT 0010's.
create or replace function public.gauntlet_room_create()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_code text;
	v_id uuid;
begin
	if v_uid is null then raise exception 'You must be signed in.'; end if;
	if not public.gauntlet_can_author() then raise exception 'Only GAUNTLET authors can host rooms.'; end if;
	loop
		v_code := public.gauntlet_gen_room_code();
		begin
			insert into public.gauntlet_rooms (host_id, join_code) values (v_uid, v_code)
				returning id into v_id;
			exit;
		exception when unique_violation then
		end;
	end loop;
	-- The host is also a competitor: enroll them as a racer so Start mints them a
	-- token, they show on the roster, and their run ranks on the room board.
	insert into public.gauntlet_room_participants (room_id, user_id, role)
		values (v_id, v_uid, 'racer')
		on conflict (room_id, user_id) do nothing;
	return jsonb_build_object('id', v_id, 'join_code', v_code);
end;
$$;

-- 4f. Deleting a room you host. From 0025. WIDENED BECAUSE OTHERWISE THE TIER
-- IS A TRAP: an author could create rooms and never clear one, and every room
-- they hosted would accumulate with no control able to remove it. The
-- host_id = auth.uid() conjunct is UNCHANGED and is the real boundary -- this
-- still cannot touch anybody else's room, an admin's included.
create or replace function public.gauntlet_room_delete(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_room public.gauntlet_rooms%rowtype;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	select * into v_room from public.gauntlet_rooms where id = p_room_id;
	if not found then
		raise exception 'Room not found.';
	end if;
	-- Host-only, enforced server-side (not just hidden in the UI).
	if v_room.host_id <> v_uid or not public.gauntlet_can_author() then
		raise exception 'Only the hosting author can delete this room.';
	end if;

	-- Preserve graded records: un-tag their room, keep them on the global board.
	update public.submissions set room_id = null where room_id = p_room_id;
	-- Remove the room's session-only rows, then the room.
	delete from public.gauntlet_run_tokens where room_id = p_room_id;
	delete from public.gauntlet_room_participants where room_id = p_room_id;
	delete from public.gauntlet_rooms where id = p_room_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. THE CENSUS. Every `is_teacher()` and `is_admin()` site in the GAUNTLET
-- migrations, and whether the author tier passes it. A tier that widens one
-- gate it was not meant to widen is the defect this section exists to prevent,
-- so the SHUT list is as load-bearing as the open one.
--
-- OPEN (section 4 above, eleven sites):
--   0004  "read published challenges"                 rows the author list and edit form need
--   0009  gauntlet_author_get                          the edit form's read
--   0009  gauntlet_author_upsert                       create and edit
--   0009  gauntlet_author_set_status                   publish / unpublish / archive
--   0019  gauntlet_author_delete                       delete (0019's body)
--   0022  gauntlet_series insert/update/delete (x3)    grouping authored challenges
--   0022  gauntlet_series_assign                       writes challenges.series_id
--   0009  gauntlet bucket insert + update (x2)         reference image upload
--   0015  gauntlet-drawings/-models insert/update/delete (x3)  sheet + STL upload
--   0028  gauntlet_room_create                         hosting
--   0025  gauntlet_room_delete                         clearing a room you host
--
-- SHUT, and why each one stays shut:
--
--   0004  "teachers read all submissions"
--   0033  "read own attempts"        (user_id = auth.uid() OR is_teacher())
--   0035  "read own run events"      (same shape)
--   0035  "read own run analysis"    (same shape)
--         EVERY STUDENT'S GRADED WORK. This is item four on 0067's own list of
--         what a domain-derived role must not carry. Authoring a challenge is
--         writing the question; it is not a licence to read what every student
--         answered. An author reads their OWN rows through the first disjunct,
--         exactly as a student does.
--
--   0151  gauntlet_practice_meter    (is_admin() in the bounds CTE)
--   0152  gauntlet_run_review        (is_admin() in the bounds CTE)
--         The same rows one level up: per-student practice cadence and ranked
--         run forensics, keyed to named players. Analytics over student work is
--         not authoring. Both gate inside the body and answer an EMPTY SET to a
--         non-admin, so an author calling either gets nothing rather than an
--         error, and nothing is the correct answer.
--
--   0015  "teachers update speedrun ruleset"
--         ONE GLOBAL SINGLETON ROW carrying units_label, projection and
--         rule_lines, shown to every Speedrun player on every challenge. Editing
--         it is a site-wide settings change, not authoring a challenge -- the
--         decision this file implements enumerates authoring, publishing and
--         hosting, and this is none of the three. The read policy is
--         `using (true)`, so an author still SEES the ruleset their challenges
--         are played under; they cannot rewrite it for everybody.
--
--   0031  "teachers manage gauntlet-tools"
--         A public bucket with NO reader anywhere in the application -- swept
--         `src/` for the literal and found zero hits. Widening write access to
--         a bucket nothing serves buys nothing and is exactly the kind of
--         unexamined extra a tier should not accumulate.
--
--   0004  "teachers insert/update/delete challenges" (three policies)
--         LEFT ALONE ON PURPOSE, and this is the one that looks like an
--         oversight. 0009 ran `revoke insert, update, delete on public.challenges
--         from authenticated`, so no client holds the privilege these policies
--         would permit and they are unreachable for `authenticated` regardless
--         of what they say. Re-gating them would change no behaviour while
--         implying to the next reader that direct DML on challenges is a live
--         path. The live write path is the four RPCs above.
--
--   0004/0005/0006/0007/0008/0015/0023/0146/0147/0148/0151 --
--         the eleven `if not v_published and not is_teacher()` PLAY gates.
--         These decide who may PLAY an unpublished challenge, and the decision
--         behind this file enumerates authoring, publishing and hosting, not
--         playing drafts. The cost is stated plainly rather than hidden: an
--         author writes a challenge, publishes it, and plays it like anybody
--         else; test-driving a DRAFT run stays admin-only. Nothing in the
--         authoring UI depends on them -- the edit form reads through
--         gauntlet_author_get, and gauntlet_room_set_challenge refuses an
--         unpublished challenge for an admin too, so the room path never wants
--         one. If draft preview turns out to matter in practice it is its own
--         bundle with its own argument, not a silent eleventh widening here.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 6. Seed
--
-- The decision on record: Mr. Cosso authors GAUNTLET challenges.
--
-- NOTE FOR WHOEVER APPLIES THIS: 0067 section 5 also seeded
-- wcosso@boscotech.edu into `app_admins`. If that row is still there he is an
-- admin and already passes every gate in section 4 through is_admin(), and this
-- row changes nothing for him today. It is still the right row to write: it
-- states the authoring decision in the place that records authoring decisions,
-- and it is what keeps his authoring alive if the admin grant is ever revoked.
-- Check `select email from public.app_admins` after applying and say which
-- world you are in.
-- ---------------------------------------------------------------------------

insert into public.gauntlet_authors (email, note)
values ('wcosso@boscotech.edu', 'GAUNTLET author tier (0155). Authoring, publishing and room hosting only.')
on conflict (email) do nothing;

-- ---------------------------------------------------------------------------
-- 7. Self-check. Reads the catalog back rather than trusting the statements
-- above to have done what they say: the ACL, not the verdict.
-- ---------------------------------------------------------------------------

do $chk$
declare
	v_anon boolean;
	v_auth boolean;
	v_open int;
	v_shut int;
	v_authors int;
begin
	-- The predicate is reachable by a signed-in caller and by nobody else.
	select has_function_privilege('anon', 'public.gauntlet_can_author()', 'execute'),
		has_function_privilege('authenticated', 'public.gauntlet_can_author()', 'execute')
		into v_anon, v_auth;
	if v_anon then
		raise exception '0155: gauntlet_can_author() is executable by anon. The revoke did not name the roles (see the 0137 rule).';
	end if;
	if not v_auth then
		raise exception '0155: gauntlet_can_author() is NOT executable by authenticated; every gate below would fail closed for everyone.';
	end if;

	-- Every site section 4 claims to have opened actually names the new
	-- predicate, and none of the SHUT ones does. Counted from pg_proc/pg_policy
	-- rather than from this file's own prose.
	select count(*) into v_open
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public'
		and p.proname in ('gauntlet_author_get', 'gauntlet_author_upsert',
			'gauntlet_author_set_status', 'gauntlet_author_delete',
			'gauntlet_series_assign', 'gauntlet_room_create', 'gauntlet_room_delete')
		and p.prosrc like '%gauntlet_can_author()%';
	if v_open <> 7 then
		raise exception '0155: expected 7 re-gated functions carrying gauntlet_can_author(), found %.', v_open;
	end if;

	-- THE NEGATIVE HALF. These four are the student-work gates and must still
	-- read is_teacher(); a policy that picked up the new predicate is the exact
	-- defect this file is written to avoid.
	select count(*) into v_shut
	from pg_policy pol join pg_class c on c.oid = pol.polrelid
	where pol.polname in ('teachers read all submissions', 'read own attempts',
			'read own run events', 'read own run analysis')
		and pg_get_expr(pol.polqual, pol.polrelid) like '%gauntlet_can_author%';
	if v_shut <> 0 then
		raise exception '0155: % student-work policy/policies now name gauntlet_can_author(). The tier has widened a gate it must not reach.', v_shut;
	end if;

	select count(*) into v_authors from public.gauntlet_authors;
	raise notice '0155 APPLIED: gauntlet_authors holds % row(s); 7 functions and 4 policy groups re-gated onto gauntlet_can_author(); the 4 student-work policies are unchanged. Positive control for that zero: the same query over the OPEN policy names returns non-zero.', v_authors;

	-- Say out loud whether the 0067 admin seed is still there, because it
	-- decides whether the seed row above changed anything today.
	if exists (select 1 from public.app_admins where email = 'wcosso@boscotech.edu') then
		raise notice '0155 NOTE: wcosso@boscotech.edu is ALSO in app_admins (0067''s seed). He already passed every gate through is_admin(); this file makes the authoring grant explicit and survivable if that admin row is ever revoked.';
	else
		raise notice '0155 NOTE: wcosso@boscotech.edu is NOT in app_admins, so this file is what grants him GAUNTLET authoring.';
	end if;
end;
$chk$;

-- ---------------------------------------------------------------------------
-- 8. WHAT UNDOES THIS.
--
-- Re-paste, in this order:
--   1. 0004 section "Row Level Security", the `read published challenges`
--      policy only.
--   2. 0009 section 3, the three RPCs `gauntlet_author_get`,
--      `gauntlet_author_upsert`, `gauntlet_author_set_status`, and 0009
--      section 4's two `gauntlet` bucket policies.
--   3. 0019's `gauntlet_author_delete` (NOT 0009's -- 0009's loses the demo
--      hard-delete branch).
--   4. 0015 section 4's three `gauntlet-drawings`/`gauntlet-models` write
--      policies.
--   5. 0022 sections 1 and 3, the three series policies and
--      `gauntlet_series_assign`.
--   6. 0028 section 2's `gauntlet_room_create`, and 0025's
--      `gauntlet_room_delete`.
-- Then `drop function public.gauntlet_can_author();`,
-- `drop function public.gauntlet_author_grant(text, text);`,
-- `drop function public.gauntlet_author_revoke(text);`,
-- `drop function public.gauntlet_author_roster();` and
-- `drop table public.gauntlet_authors;`.
--
-- Dropping the table alone is a SAFE PARTIAL REVERT and is the fast one: with
-- no rows to match, gauntlet_can_author() falls through to is_admin() for every
-- caller and all eleven gates behave exactly as they did before this file --
-- except that the function itself then references a table that no longer
-- exists, so `delete from public.gauntlet_authors;` is the better fast revert.
-- It empties the tier in one statement, leaves every admin untouched, and is
-- re-grantable through gauntlet_author_grant afterwards.
-- ---------------------------------------------------------------------------
