-- ---------------------------------------------------------------------------
-- 0230  CLASS QUICK POSTS, THREE FOUNDRY CONTROLS, AND THE FEEDBACK HORIZON.
--
-- THREE FEATURES IN ONE FILE, AND THAT IS FORCED RATHER THAN CHOSEN.
-- .github/workflows/migrate.yml applies the LOWEST unapplied migration, one
-- file per push, and ledger 0360 ships every schema change of its round in one
-- push to main. Two files would leave the second unapplied while the deployed
-- client already calls it. Nothing in one part reads another part's objects;
-- the parts share only the self-check at the end (PART D).
--
--   PART A. CLASSROOM QUICK POSTS (report c994ce32, Mr. Pina 2026-09-30).
--           A short notice to one class, several, or all of a teacher's
--           classes in one action, live until a chosen instant or until it is
--           taken down.
--   PART B. FOUNDRY.
--           B1  the whole-Foundry switch (report c26026b0);
--           B2  trusted publisher applications (report 6d076258), whose
--               approval writes the EXISTING 0173 allowlist and adds no flag;
--           B3  the game request board (report b2ba6d74): a board only, a
--               free-text offer, and NO coin table or coin function touched.
--   PART C. THE FEEDBACK HORIZON (Mr. Pina 2026-09-30): a report is marked
--           "now" or "long_term" in a column of its own.
--   PART D. THE SELF-CHECK, by NAME over the objects this file writes and
--           nothing else (a prefix sweep would hold ground for migrations that
--           are not this file's).
--
-- ADDITIVE ONLY. New tables, one new column, new functions. Nothing is
-- dropped, renamed or rewritten, no stored row is changed except the guarded
-- once-only horizon backfill in PART C (which only reads meta and writes the
-- NEW column), and no coin write path is touched. Four existing functions are
-- re-created AT THEIR EXISTING SIGNATURES, diffed against their current
-- definitions rather than written from memory:
--
--   foundry_section_access()          0173 section 1, verbatim, every answer
--                                     gaining four site keys;
--   foundry_play_start(uuid, uuid)    0139 section 3, verbatim, plus ONE guard;
--   app_feedback_submit(9 args)       0170 section 5, verbatim, plus the
--                                     horizon lift (the 0170 tried bridge);
--   app_feedback_admin_list(text, integer)
--                                     0170 section 6 becomes a thin wrapper over
--                                     a new wide form, re-raising its own
--                                     refusals first.
--
-- Every one of them answers every call the deployed one answered, with the
-- same keys and values, plus only the keys named above.
-- tests/db/foundry-site-switch.test.ts and tests/db/feedback-horizon.test.ts
-- put a corpus of calls to the DEPLOYED functions first, apply this file over
-- the same database, and compare case for case.
--
-- GRANTS. Every function and every table is closed with the 0166 shape:
-- revoke from public, anon and authenticated BY NAME (and service_role where
-- the contract says so), then grant back exactly what is meant. A hosted
-- project's default privileges hand every new object a direct anon grant, so
-- revoking from public alone closes nothing. No new object is reachable by
-- anon.
--
-- DEPLOY ORDERING. None. The four re-created functions keep their signatures;
-- every new RPC is called by a client that degrades on PGRST202 alone, and a
-- table select degrades on its own missing-relation code.
--
-- RE-APPLIABLE. Every statement is create-if-not-exists, create-or-replace, a
-- drop-if-exists ahead of a create, or guarded on the catalog; both seeds and
-- the backfill run once, inside catalog or emptiness guards. Re-pasting this
-- file changes nothing (asserted in every one of its five test files).
--
-- PASTE TRAP. No dollar sign of any kind appears inside a comment in this
-- file, and every dollar-quote tag on a code line is balanced. The Supabase
-- editor splits statements on the client, and a tag inside a comment breaks
-- that splitter (it cost 0194 a whole apply cycle).
--
-- WHAT UNDOES THIS FILE, stated before it is applied. There is no down
-- migration. Paste these BY HAND in the SQL editor, in this order (the scoped
-- migrator role refuses a dropped table or column, by design). It discards
-- every quick post, publisher application, edited question, game request and
-- long-term mark, and nothing else:
--
--   -- PART C. Re-paste 0170 section 6 (app_feedback_admin_list(text, integer),
--   -- including its revoke and grant lines) FIRST, because the wrapper below
--   -- calls the wide form; then re-paste 0170 section 5 (app_feedback_submit,
--   -- including its revoke and grant lines); then:
--   drop function if exists public.app_feedback_set_horizon(uuid, text);
--   drop function if exists public.app_feedback_admin_list(text, integer, text);
--   alter table public.app_feedback drop constraint if exists app_feedback_horizon_check;
--   alter table public.app_feedback drop column if exists horizon;
--
--   -- PART B. Re-paste 0173 section 1's foundry_section_access and 0139
--   -- section 3's foundry_play_start (each with its revoke and grant lines)
--   -- FIRST, because the re-created bodies read foundry_site_settings; then:
--   drop function if exists public.foundry_game_request_set_hidden(uuid, boolean);
--   drop function if exists public.foundry_game_request_close(uuid, text);
--   drop function if exists public.foundry_game_request_post(text, text, text);
--   drop function if exists public.foundry_game_requests(boolean);
--   drop table if exists public.foundry_game_requests;
--   drop function if exists public.foundry_publisher_set_questions(jsonb);
--   drop function if exists public.foundry_publisher_questions_admin();
--   drop function if exists public.foundry_publisher_decide(uuid, text, text);
--   drop function if exists public.foundry_publisher_pending_count();
--   drop function if exists public.foundry_publisher_applications(text);
--   drop function if exists public.foundry_publisher_apply(jsonb);
--   drop function if exists public.foundry_publisher_status();
--   drop table if exists public.foundry_publisher_applications;
--   drop table if exists public.foundry_publisher_questions;
--   drop function if exists public.foundry_set_site_open(boolean, text);
--   drop function if exists public._foundry_site_closed();
--   drop table if exists public.foundry_site_settings;
--
--   -- PART A.
--   drop function if exists public.classroom_quick_post_take_down(uuid);
--   drop function if exists public.classroom_quick_post_create(uuid[], text, timestamptz);
--   drop function if exists public.classroom_quick_posts(uuid);
--   drop function if exists public._classroom_quick_post_can_take_down(uuid, text);
--   drop table if exists public.classroom_quick_post_sections;
--   drop table if exists public.classroom_quick_posts;
--
--   -- and the history row:
--   delete from supabase_migrations.schema_migrations where version = '0230';
--
-- A trusted publisher an approval added stays on foundry_trusted_publishers
-- after the undo; that table is 0173's, and foundry_trusted_revoke is the way
-- to take one off.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- PART A. CLASSROOM QUICK POSTS.
--
-- ONE CANONICAL POST AND A POSTINGS JOIN, the classroom_items and
-- classroom_postings shape: one authored thing appears in N classes, and the
-- posting carries no state of its own, so the copies cannot drift.
--
-- WHY NOT AN ANNOUNCEMENT ITEM WITH AN END DATE. Every reader of
-- classroom_items (the stream, the home feed, the to-do, the palette, the
-- export to materials, the FACTS CSV) would need an expiry filter, which is
-- the soft-delete-is-not-a-boundary trap, and every notice would be pushed
-- into the materials export. A table of its own is read by one function.
--
-- RLS ON, NO POLICY, NO CLIENT GRANT on either table, so either refusal alone
-- denies a read. Every read and write is a SECURITY DEFINER function that
-- re-checks the caller. ARCHIVE, NEVER DELETE: taking a post down stamps
-- taken_down_at; there is no delete function and no delete grant.
--
-- AUDIENCE. The section's ACTIVE enrollees and its managers, never anon, and
-- no address ever leaves the database: the read projects ids, the body and
-- the times, never author_email or taken_down_by.
--
-- THE DATABASE STORES ONLY expires_at. The presets (end of the school day,
-- end of the week and so on) resolve to an instant in the client, in a pure
-- function with the clock injected; null means until it is taken down.
-- ===========================================================================

create table if not exists public.classroom_quick_posts (
	id uuid primary key default gen_random_uuid(),
	-- Lowercased, from current_user_email(). Never projected.
	author_email text not null,
	body text not null,
	created_at timestamptz not null default now(),
	-- Null: until taken down.
	expires_at timestamptz,
	taken_down_at timestamptz,
	taken_down_by text,
	constraint classroom_quick_posts_author_shape
		check (author_email <> '' and author_email = lower(btrim(author_email))),
	constraint classroom_quick_posts_body_shape
		check (char_length(body) between 1 and 1000 and body ~ '[^[:space:]]'),
	constraint classroom_quick_posts_window
		check (expires_at is null or expires_at > created_at),
	constraint classroom_quick_posts_takedown_pair
		check ((taken_down_at is null) = (taken_down_by is null))
);

-- A section is HARD-deleted (0085), so a posting must cascade with it.
create table if not exists public.classroom_quick_post_sections (
	post_id uuid not null references public.classroom_quick_posts (id) on delete cascade,
	section_id uuid not null references public.classroom_sections (id) on delete cascade,
	primary key (post_id, section_id)
);

create index if not exists classroom_quick_post_sections_section_idx
	on public.classroom_quick_post_sections (section_id, post_id);
create index if not exists classroom_quick_posts_live_idx
	on public.classroom_quick_posts (created_at desc) where taken_down_at is null;

alter table public.classroom_quick_posts enable row level security;
alter table public.classroom_quick_post_sections enable row level security;
revoke all on table public.classroom_quick_posts from public, anon, authenticated;
revoke all on table public.classroom_quick_post_sections from public, anon, authenticated;

-- PRIVATE: may this address take the post down? Its author, or a manager of
-- EVERY section it went to (an admin manages every section, so an admin is
-- included through the manage rule rather than by a second statement of it).
-- The empty address is refused, which is the no-session refusal in this
-- family's shape. A post with no target left at all (every class it went to
-- was deleted) has no "every" to satisfy, so only its author can take it down.
create or replace function public._classroom_quick_post_can_take_down(p_post_id uuid, p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $qp$
	select case
		when coalesce(btrim(p_email), '') = '' then false
		else exists (
			select 1 from public.classroom_quick_posts p
			where p.id = p_post_id
				and (
					p.author_email = lower(btrim(p_email))
					or (
						exists (
							select 1 from public.classroom_quick_post_sections t0
							where t0.post_id = p.id
						)
						and not exists (
							select 1 from public.classroom_quick_post_sections t
							where t.post_id = p.id
								and not public._classroom_manages_section_email(t.section_id, p_email)
						)
					)
				)
		)
	end;
$qp$;

revoke all on function public._classroom_quick_post_can_take_down(uuid, text)
	from public, anon, authenticated;

-- READ: the live notices for one section. The caller must manage it or hold
-- an ACTIVE enrollment in it, else 'Not found.', identical for a section that
-- does not exist and one that is not theirs. Live means not taken down and
-- either no expiry or an expiry still ahead of now().
--
-- Returns {ok:true, manages, now, posts:[{id, body, created_at, expires_at,
-- section_ids, can_take_down}]}, newest first, at most 20. section_ids is the
-- caller's MANAGED targets for a manager and null for a student, so a student
-- never learns which other classes a notice went to; can_take_down is false
-- for a student. now is the server's clock, so the client can correct its own
-- skew before it hides an expired notice.
create or replace function public.classroom_quick_posts(p_section_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $qp$
declare
	v_email text := public.current_user_email();
	v_manages boolean;
	v_posts jsonb;
begin
	if v_email = '' then
		raise exception 'You must be signed in to read class notices.';
	end if;

	v_manages := public.classroom_manages_section(p_section_id) is true;
	if not v_manages and not public.classroom_is_enrolled(p_section_id) then
		raise exception 'Not found.';
	end if;

	select coalesce(jsonb_agg(jsonb_build_object(
			'id', x.id,
			'body', x.body,
			'created_at', x.created_at,
			'expires_at', x.expires_at,
			'section_ids', case when v_manages then (
				select coalesce(jsonb_agg(t2.section_id order by t2.section_id), '[]'::jsonb)
				from public.classroom_quick_post_sections t2
				where t2.post_id = x.id
					and public.classroom_manages_section(t2.section_id)
			) end,
			'can_take_down', case
				when v_manages then public._classroom_quick_post_can_take_down(x.id, v_email)
				else false
			end
		) order by x.created_at desc, x.id), '[]'::jsonb)
	into v_posts
	from (
		select p.id, p.body, p.created_at, p.expires_at
		from public.classroom_quick_posts p
		join public.classroom_quick_post_sections t on t.post_id = p.id
		where t.section_id = p_section_id
			and p.taken_down_at is null
			and (p.expires_at is null or p.expires_at > now())
		order by p.created_at desc, p.id
		limit 20
	) x;

	return jsonb_build_object('ok', true, 'manages', v_manages, 'now', now(), 'posts', v_posts);
end;
$qp$;

revoke all on function public.classroom_quick_posts(uuid) from public, anon, authenticated;
grant execute on function public.classroom_quick_posts(uuid) to authenticated;

-- CREATE: one post to one, several or all chosen classes, in ONE call and ONE
-- transaction. No identity parameter (the author is current_user_email()),
-- and no defaults, so there is exactly one arity to call.
--
-- Section ids are deduped, nulls dropped and sorted. MISUSE RAISES and
-- inserts nothing: not signed in; more than 50 classes; any id that is not a
-- class the caller manages ('Only a teacher of every chosen class can post to
-- it.', the same sentence for a class that does not exist, so an id cannot be
-- probed). What a teacher can produce by typing returns {ok:false, reason}:
-- 'no_classes', 'empty', 'too_long' (with the limit), 'expiry_passed' and
-- 'expiry_too_far' (more than 366 days ahead).
--
-- THE BODY IS TRIMMED THE WAY A PERSON MEANS IT, with the regular expression,
-- never btrim: btrim strips spaces only, so a body of newlines would pass an
-- emptiness gate it was written to fail (CLAUDE.md, the SQL traps).
create or replace function public.classroom_quick_post_create(
	p_section_ids uuid[],
	p_body text,
	p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $qp$
declare
	v_email text := public.current_user_email();
	v_now timestamptz := now();
	v_ids uuid[];
	v_id uuid;
	v_body text;
	v_post uuid;
begin
	if v_email = '' then
		raise exception 'You must be signed in to post a class notice.';
	end if;

	select coalesce(array_agg(distinct x order by x), '{}'::uuid[])
	into v_ids
	from unnest(coalesce(p_section_ids, '{}'::uuid[])) as x
	where x is not null;

	if cardinality(v_ids) = 0 then
		return jsonb_build_object('ok', false, 'reason', 'no_classes');
	end if;
	if cardinality(v_ids) > 50 then
		raise exception 'Post to at most 50 classes at a time.';
	end if;

	foreach v_id in array v_ids loop
		-- The existence check is not a second authorization rule: an admin
		-- manages every id, real or not, and the foreign key would otherwise
		-- answer an invented id with a constraint error naming the table.
		if not exists (select 1 from public.classroom_sections s where s.id = v_id)
			or public.classroom_manages_section(v_id) is not true then
			raise exception 'Only a teacher of every chosen class can post to it.';
		end if;
	end loop;

	v_body := regexp_replace(coalesce(p_body, ''), '^\s+|\s+$', '', 'g');
	if v_body = '' then
		return jsonb_build_object('ok', false, 'reason', 'empty');
	end if;
	if char_length(v_body) > 1000 then
		return jsonb_build_object('ok', false, 'reason', 'too_long', 'limit', 1000);
	end if;
	if p_expires_at is not null and p_expires_at <= v_now then
		return jsonb_build_object('ok', false, 'reason', 'expiry_passed');
	end if;
	if p_expires_at is not null and p_expires_at > v_now + interval '366 days' then
		return jsonb_build_object('ok', false, 'reason', 'expiry_too_far');
	end if;

	insert into public.classroom_quick_posts (author_email, body, created_at, expires_at)
	values (v_email, v_body, v_now, p_expires_at)
	returning id into v_post;

	insert into public.classroom_quick_post_sections (post_id, section_id)
	select v_post, x from unnest(v_ids) as x;

	return jsonb_build_object(
		'ok', true,
		'id', v_post,
		'section_ids', to_jsonb(v_ids),
		'created_at', v_now,
		'expires_at', p_expires_at
	);
end;
$qp$;

revoke all on function public.classroom_quick_post_create(uuid[], text, timestamptz)
	from public, anon, authenticated;
grant execute on function public.classroom_quick_post_create(uuid[], text, timestamptz) to authenticated;

-- TAKE DOWN: stamps, never deletes, and is idempotent.
--
-- 'Not found.' when the post does not exist, OR when the caller is neither
-- its author nor a manager of ANY class it went to, so the two answer
-- identically. A post the caller can see as a manager but is not theirs to
-- take down (they manage some of its classes and not all, and did not write
-- it) raises the sentence that says who can. OK answers {ok:true, already,
-- section_ids}, the caller's managed targets, which the client announces to.
create or replace function public.classroom_quick_post_take_down(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $qp$
declare
	v_email text := public.current_user_email();
	v_row public.classroom_quick_posts%rowtype;
	v_sections jsonb;
begin
	if v_email = '' then
		raise exception 'You must be signed in to take down a class notice.';
	end if;

	select * into v_row from public.classroom_quick_posts p where p.id = p_post_id for update;
	if not found then
		raise exception 'Not found.';
	end if;

	select coalesce(jsonb_agg(t.section_id order by t.section_id), '[]'::jsonb)
	into v_sections
	from public.classroom_quick_post_sections t
	where t.post_id = p_post_id
		and public.classroom_manages_section(t.section_id);

	if v_row.author_email <> v_email and jsonb_array_length(v_sections) = 0 then
		raise exception 'Not found.';
	end if;
	if not public._classroom_quick_post_can_take_down(p_post_id, v_email) then
		raise exception 'Only the teacher who posted this, or a teacher of every class it went to, can take it down.';
	end if;

	if v_row.taken_down_at is not null then
		return jsonb_build_object('ok', true, 'already', true, 'section_ids', v_sections);
	end if;

	update public.classroom_quick_posts p
	set taken_down_at = now(), taken_down_by = v_email
	where p.id = p_post_id;

	return jsonb_build_object('ok', true, 'already', false, 'section_ids', v_sections);
end;
$qp$;

revoke all on function public.classroom_quick_post_take_down(uuid) from public, anon, authenticated;
grant execute on function public.classroom_quick_post_take_down(uuid) to authenticated;


-- ===========================================================================
-- PART B1. THE WHOLE-FOUNDRY SWITCH (report c26026b0).
--
-- 0173's per-section gate closes the gallery for the students of one class.
-- This is the one control that can cover the bundle routes, which hold no
-- session and so cannot be reached by any per-viewer gate: a singleton row
-- the serving route reads with the service role (through
-- src/lib/server/foundry-bundle.ts, the one service-role reader), and a
-- predicate the definer bodies read.
--
-- A STAMP AND NOT A BOOLEAN, the 0173 shape: closed_at says when and
-- closed_by says who. Null closed_at is open, so the seeded row is open.
-- closed_by is NEVER projected by any function: the students read a note,
-- never who turned it off.
-- ===========================================================================

create table if not exists public.foundry_site_settings (
	id boolean primary key default true check (id),
	closed_at timestamptz,
	closed_by text,
	note text check (note is null or char_length(note) <= 300),
	updated_at timestamptz not null default now(),
	constraint foundry_site_settings_open_is_clean
		check (closed_at is not null or (closed_by is null and note is null))
);

alter table public.foundry_site_settings enable row level security;
-- NO POLICY. service_role keeps SELECT and nothing else: the bundle gate reads
-- the row, and the only writer is foundry_set_site_open below.
revoke all on table public.foundry_site_settings from public, anon, authenticated, service_role;
grant select on table public.foundry_site_settings to service_role;

-- The one row, OPEN. Inside a block rather than at the top level, because
-- tools/apply-migration.mjs refuses top-level DML and migrate.yml does not pass
-- it the flag that releases it. On conflict it does nothing, so a re-paste
-- never reopens a Foundry an admin turned off.
do $fd$
begin
	insert into public.foundry_site_settings (id) values (true) on conflict (id) do nothing;
end;
$fd$;

-- PRIVATE. Only definer bodies call it, as the owner, so no role holds it.
create or replace function public._foundry_site_closed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $fd$
	select coalesce(
		(select s.closed_at is not null from public.foundry_site_settings s where s.id),
		false
	);
$fd$;

revoke all on function public._foundry_site_closed() from public, anon, authenticated, service_role;

-- THE WRITE. ADMIN ONLY, unlike 0173's per-section close: turning the whole
-- Foundry off for every class is not the room's teacher's call. Turning it off
-- twice keeps the FIRST closed_at; turning it on clears all three fields.
create or replace function public.foundry_set_site_open(p_open boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fd$
declare
	v_note text := nullif(public._foundry_norm(p_note), '');
	v_closed_at timestamptz;
	v_note_out text;
begin
	if not public.is_admin() then
		raise exception 'Only a site administrator can turn the whole Foundry on or off.';
	end if;
	if p_open is null then
		raise exception 'On or off? That has to be one or the other.';
	end if;
	if v_note is not null and char_length(v_note) > 300 then
		raise exception 'Keep the note to 300 characters.';
	end if;

	insert into public.foundry_site_settings (id) values (true) on conflict (id) do nothing;

	update public.foundry_site_settings s
	set closed_at = case when p_open then null else coalesce(s.closed_at, now()) end,
		closed_by = case when p_open then null else public.current_user_email() end,
		note = case when p_open then null else v_note end,
		updated_at = now()
	where s.id
	returning s.closed_at, s.note into v_closed_at, v_note_out;

	return jsonb_build_object('ok', true, 'open', p_open, 'closed_at', v_closed_at, 'note', v_note_out);
end;
$fd$;

revoke all on function public.foundry_set_site_open(boolean, text) from public, anon, authenticated, service_role;
grant execute on function public.foundry_set_site_open(boolean, text) to authenticated;

-- THE READ, RE-CREATED AT ITS EXISTING SIGNATURE. 0173 section 1's body
-- verbatim, with ONE statement added first and all three of its answers
-- (no session, admin, student) gaining the same four keys:
--
--   site_open       closed_at is null
--   site_closed_at  closed_at
--   site_note       the note while it is off, null while it is on
--   site_exempt     is_admin(): the surfaces stay open to an admin
--
-- Every 0173 key keeps its value. closed_by is never read here, so the "no
-- address in this payload" property 0173 has holds unchanged.
create or replace function public.foundry_section_access()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fd$
declare
	v_email text := public.current_user_email();
	v_rows jsonb;
	v_site_closed_at timestamptz;
	v_site_note text;
	v_site jsonb;
begin
	-- 0230: the whole-Foundry switch, read first so every answer carries it.
	select s.closed_at, s.note into v_site_closed_at, v_site_note
	from public.foundry_site_settings s
	where s.id;
	v_site := jsonb_build_object(
		'site_open', v_site_closed_at is null,
		'site_closed_at', v_site_closed_at,
		'site_note', case when v_site_closed_at is null then null else v_site_note end,
		'site_exempt', public.is_admin()
	);

	if v_email = '' then
		-- No session. The route guard is what actually answers this case; a
		-- signed-out caller reaching the function gets the open answer rather
		-- than an error, because "closed" here would mean "closed by a class"
		-- and no class has said anything about them.
		return jsonb_build_object('ok', true, 'open', true, 'closed', '[]'::jsonb) || v_site;
	end if;

	if public.is_admin() then
		return jsonb_build_object('ok', true, 'open', true, 'closed', '[]'::jsonb) || v_site;
	end if;

	select coalesce(
		jsonb_agg(
			jsonb_build_object(
				'section_id', s.id,
				'label', s.label,
				'course_title', c.title,
				'note', s.foundry_closed_note,
				'closed_at', s.foundry_closed_at
			)
			order by c.title, s.label
		),
		'[]'::jsonb
	)
	into v_rows
	from public.classroom_enrollments e
	join public.classroom_sections s on s.id = e.section_id
	join public.classroom_courses c on c.id = s.course_id
	where e.student_email = v_email
		and e.active
		and s.foundry_closed_at is not null;

	return jsonb_build_object(
		'ok', true,
		'open', jsonb_array_length(v_rows) = 0,
		'closed', v_rows
	) || v_site;
end;
$fd$;

revoke all on function public.foundry_section_access() from public, anon, authenticated, service_role;
grant execute on function public.foundry_section_access() to authenticated;

-- PLAY START, RE-CREATED AT ITS EXISTING SIGNATURE. 0139 section 3's body
-- verbatim plus ONE guard after the session check: while the whole Foundry is
-- off, no play is recorded, for anybody, in the same refusal shape every other
-- refusal here takes, so a caller cannot tell the switch from a missing app.
create or replace function public.foundry_play_start(
	p_app_id uuid,
	p_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fd$
declare
	v_uid uuid := (select auth.uid());
	v_app public.student_apps%rowtype;
	v_play uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	-- 0230: the whole-Foundry switch.
	if public._foundry_site_closed() then
		return jsonb_build_object('ok', false, 'reason', 'not_playable');
	end if;

	select a.* into v_app from public.student_apps a where a.id = p_app_id;
	-- EVERY REFUSAL BELOW IS THE SAME SHAPE, so a caller cannot tell a missing
	-- app from a hidden one from a version that is not the live build.
	if not found then
		return jsonb_build_object('ok', false, 'reason', 'not_playable');
	end if;
	if v_app.hidden_at is not null then
		return jsonb_build_object('ok', false, 'reason', 'not_playable');
	end if;
	-- THE PUBLISHED BUILD AND NOTHING ELSE. A draft the owner is testing and a
	-- submitted build a reviewer is running are both real things that happen in
	-- a frame, and neither is a play of a published app. This is the second of
	-- the two layers that keep review runs out of the numbers; the first is the
	-- review route handing down no recording transport at all.
	if v_app.published_version_id is null or v_app.published_version_id <> p_version_id then
		return jsonb_build_object('ok', false, 'reason', 'not_playable');
	end if;

	-- SERIALIZE THIS CALLER ON THIS APP. Two tabs opened together would
	-- otherwise both look, both find nothing, and both insert -- and there is
	-- no unique index for them to collide on, because the window is a volatile
	-- expression. Transaction-scoped, so it is released with the statement.
	perform pg_advisory_xact_lock(
		hashtextextended(v_uid::text || ':' || p_app_id::text, 0)
	);

	select pl.id into v_play
	from public.student_app_plays pl
	where pl.player = v_uid
		and pl.app_id = p_app_id
		and pl.last_seen_at > now() - public._foundry_play_window()
	order by pl.last_seen_at desc
	limit 1;

	if found then
		update public.student_app_plays pl
			set last_seen_at = now()
			where pl.id = v_play;
		return jsonb_build_object('ok', true, 'play_id', v_play, 'resumed', true);
	end if;

	insert into public.student_app_plays (app_id, version_id, player)
	values (p_app_id, p_version_id, v_uid)
	returning id into v_play;

	return jsonb_build_object('ok', true, 'play_id', v_play, 'resumed', false);
end;
$fd$;

revoke all on function public.foundry_play_start(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.foundry_play_start(uuid, uuid) to authenticated;


-- ===========================================================================
-- PART B2. TRUSTED PUBLISHER APPLICATIONS (report 6d076258).
--
-- THE FLAG ALREADY EXISTS AND NO SECOND ONE IS ADDED. 0173's
-- foundry_trusted_publishers allowlist, written only by foundry_trusted_grant,
-- is what makes foundry_submit_version publish instead of queueing. Approving
-- an application CALLS that function (a nested definer: is_admin() reads the
-- JWT, so it answers about the same admin), so there is one write path into
-- the allowlist whichever way a student arrives on it.
--
-- QUESTIONS ARE DATA, EDITED FROM THE REVIEW PAGE, AND RETIRED, NEVER DELETED.
-- Mr. Pina asked for Claude to draft them and for him to edit them later. A
-- question has a TRICK flag, a list of the choices that are a red flag, and a
-- reviewer note, and NONE of those three ever reaches a student: the student
-- read projects prompts, kinds and choices only.
--
-- AN APPLICATION KEEPS A SNAPSHOT of every prompt it answered, its trick flag
-- and whether the answer was a red flag, so editing a question later never
-- rewrites what somebody answered.
--
-- RLS ON, NO POLICY, NO GRANT TO ANY ROLE, service_role included: every read
-- and write is one of the seven functions below.
-- ===========================================================================

create table if not exists public.foundry_publisher_questions (
	id uuid primary key default gen_random_uuid(),
	position integer not null check (position between 1 and 20),
	prompt text not null check (char_length(public._foundry_norm(prompt)) between 1 and 500),
	kind text not null check (kind in ('text', 'choice')),
	choices jsonb not null default '[]'::jsonb check (jsonb_typeof(choices) = 'array'),
	flag_choices jsonb not null default '[]'::jsonb check (jsonb_typeof(flag_choices) = 'array'),
	is_trick boolean not null default false,
	reviewer_note text check (reviewer_note is null or char_length(reviewer_note) <= 500),
	active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	updated_by text
);

create table if not exists public.foundry_publisher_applications (
	id uuid primary key default gen_random_uuid(),
	applicant uuid not null references auth.users (id) on delete cascade,
	applicant_email text not null
		check (applicant_email = lower(btrim(applicant_email)) and applicant_email like '%@%'),
	-- The snapshot: [{question_id, position, prompt, kind, answer, is_trick,
	-- flagged, reviewer_note}], in question order.
	answers jsonb not null check (jsonb_typeof(answers) = 'array'),
	status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
	submitted_at timestamptz not null default now(),
	decided_at timestamptz,
	decided_by text,
	decision_note text check (decision_note is null or char_length(decision_note) <= 300),
	constraint foundry_publisher_applications_decided_pair
		check ((status = 'pending') = (decided_at is null))
);

-- ONE PENDING APPLICATION PER PERSON is a key, not only a check: the apply
-- function serializes on an advisory lock first, and this index is the
-- backstop that makes a second pending row unrepresentable.
create unique index if not exists foundry_publisher_applications_one_pending
	on public.foundry_publisher_applications (applicant_email) where status = 'pending';
create index if not exists foundry_publisher_applications_by_email
	on public.foundry_publisher_applications (applicant_email, submitted_at desc);

alter table public.foundry_publisher_questions enable row level security;
alter table public.foundry_publisher_applications enable row level security;
revoke all on table public.foundry_publisher_questions from public, anon, authenticated, service_role;
revoke all on table public.foundry_publisher_applications from public, anon, authenticated, service_role;

-- THE DRAFTED QUESTIONS, seeded once. The emptiness guard is what makes a
-- re-paste harmless: an edited set is never duplicated or overwritten, and a
-- retired question still counts as "not empty". Two are trick questions,
-- choice-typed, whose red-flag answers reveal bad intent; the reviewer note on
-- each says what to look for. Inside a block for the top-level DML reason
-- PART B1 gives.
do $fd$
begin
	if not exists (select 1 from public.foundry_publisher_questions) then
		insert into public.foundry_publisher_questions
			(position, prompt, kind, choices, flag_choices, is_trick, reviewer_note, updated_by)
		values
			(1,
			 'What do you want to publish, and who is it for?',
			 'text', '[]'::jsonb, '[]'::jsonb, false,
			 'Look for a real audience and a plan, such as a game for a class or a tool for a club. "Stuff" with no audience is a reason to wait.',
			 null),
			(2,
			 'Why should your apps go live without waiting in the review queue?',
			 'text', '[]'::jsonb, '[]'::jsonb, false,
			 'A good answer mentions apps already approved, care about what classmates will see, or a reason speed matters. Wanting to skip the rules is a red flag.',
			 null),
			(3,
			 'Who wrote the code in your apps? Say what you wrote yourself, what an AI tool wrote, and what came from somewhere else.',
			 'text', '[]'::jsonb, '[]'::jsonb, false,
			 'Any honest mix is fine. Vague or evasive answers about where the code came from are worth a conversation before approving.',
			 null),
			(4,
			 'A friend''s game was sent back by a reviewer. They ask you to publish it under your name so it skips the queue. What do you do?',
			 'choice',
			 '["Publish it under my name", "Say no, and help them fix what the reviewer found", "Publish it with a new title so nobody notices"]'::jsonb,
			 '["Publish it under my name", "Publish it with a new title so nobody notices"]'::jsonb,
			 true,
			 'Trick question. Either publish answer means they would use the trusted path to get around a review.',
			 null),
			(5,
			 'Which of these would you put in an app that goes live without review?',
			 'choice',
			 '["A joke that names a classmate", "A button that sends people to another site without saying where", "A pop-up that asks for a school password", "None of these"]'::jsonb,
			 '["A joke that names a classmate", "A button that sends people to another site without saying where", "A pop-up that asks for a school password"]'::jsonb,
			 true,
			 'Trick question. Only "None of these" is acceptable. Each of the other three harms a classmate or the school.',
			 null),
			(6,
			 'Someone reports a problem with one of your apps. What do you do?',
			 'text', '[]'::jsonb, '[]'::jsonb, false,
			 'Look for taking it seriously: fixing it, taking the app down if it is harmful, and telling a teacher.',
			 null);
	end if;
end;
$fd$;

-- THE STUDENT READ. No identity parameter. NEVER is_trick, flag_choices or
-- reviewer_note, at any depth. cooldown_until is the last decline plus seven
-- days while that is still ahead, else null.
create or replace function public.foundry_publisher_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fd$
declare
	v_email text := public.current_user_email();
	v_questions jsonb;
	v_application jsonb;
	v_last_decline timestamptz;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;

	select coalesce(jsonb_agg(jsonb_build_object(
			'id', q.id,
			'position', q.position,
			'prompt', q.prompt,
			'kind', q.kind,
			'choices', q.choices
		) order by q.position, q.created_at, q.id), '[]'::jsonb)
	into v_questions
	from public.foundry_publisher_questions q
	where q.active;

	select jsonb_build_object(
			'id', a.id,
			'status', a.status,
			'submitted_at', a.submitted_at,
			'decided_at', a.decided_at,
			'decision_note', a.decision_note
		)
	into v_application
	from public.foundry_publisher_applications a
	where a.applicant_email = v_email
	order by a.submitted_at desc, a.id
	limit 1;

	select max(a.decided_at) into v_last_decline
	from public.foundry_publisher_applications a
	where a.applicant_email = v_email and a.status = 'declined';

	return jsonb_build_object(
		'ok', true,
		'eligible', (v_email like '%@boscotech.net' or v_email like '%@boscotech.edu'),
		'trusted', public._foundry_is_trusted_email(v_email),
		'questions', v_questions,
		'application', v_application,
		'cooldown_until', case
			when v_last_decline is not null and v_last_decline + interval '7 days' > now()
				then v_last_decline + interval '7 days'
		end
	);
end;
$fd$;

revoke all on function public.foundry_publisher_status() from public, anon, authenticated, service_role;
grant execute on function public.foundry_publisher_status() to authenticated;

-- APPLY. p_answers is an object keyed by question id: {"<uuid>": "answer"}.
-- No identity parameter. Every refusal a student can produce is structured,
-- in this order: 'foundry_off', 'not_eligible', 'already_trusted',
-- 'incomplete' {question_id} (not an object, or a blank answer to an active
-- question), 'no_questions', 'too_long' {question_id, limit}, 'bad_choice'
-- {question_id}, then, under a per-address advisory lock, 'pending' and
-- 'cooldown' {until}. The unique index is the backstop behind the lock.
create or replace function public.foundry_publisher_apply(p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fd$
declare
	v_uid uuid := (select auth.uid());
	v_email text := public.current_user_email();
	v_q record;
	v_answer text;
	v_snapshot jsonb := '[]'::jsonb;
	v_count integer;
	v_last_decline timestamptz;
	v_id uuid;
	v_at timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	if public._foundry_site_closed() then
		return jsonb_build_object('ok', false, 'reason', 'foundry_off');
	end if;
	if v_email not like '%@boscotech.net' and v_email not like '%@boscotech.edu' then
		return jsonb_build_object('ok', false, 'reason', 'not_eligible');
	end if;
	if public._foundry_is_trusted_email(v_email) then
		return jsonb_build_object('ok', false, 'reason', 'already_trusted');
	end if;
	if jsonb_typeof(p_answers) is distinct from 'object' then
		return jsonb_build_object('ok', false, 'reason', 'incomplete', 'question_id', null);
	end if;

	select count(*) into v_count from public.foundry_publisher_questions q where q.active;
	if v_count = 0 then
		return jsonb_build_object('ok', false, 'reason', 'no_questions');
	end if;

	-- THREE PASSES, so the refusal a student reads is the first problem of the
	-- first kind, in question order, rather than whichever check happened to
	-- run first on whichever question.
	for v_q in
		select q.id from public.foundry_publisher_questions q
		where q.active order by q.position, q.created_at, q.id
	loop
		if public._foundry_norm(p_answers ->> v_q.id::text) = '' then
			return jsonb_build_object('ok', false, 'reason', 'incomplete', 'question_id', v_q.id);
		end if;
	end loop;
	for v_q in
		select q.id from public.foundry_publisher_questions q
		where q.active order by q.position, q.created_at, q.id
	loop
		if char_length(public._foundry_norm(p_answers ->> v_q.id::text)) > 2000 then
			return jsonb_build_object('ok', false, 'reason', 'too_long', 'question_id', v_q.id, 'limit', 2000);
		end if;
	end loop;
	for v_q in
		select q.id, q.choices from public.foundry_publisher_questions q
		where q.active and q.kind = 'choice' order by q.position, q.created_at, q.id
	loop
		if not (v_q.choices ? public._foundry_norm(p_answers ->> v_q.id::text)) then
			return jsonb_build_object('ok', false, 'reason', 'bad_choice', 'question_id', v_q.id);
		end if;
	end loop;

	perform pg_advisory_xact_lock(hashtextextended('foundry_publisher_apply:' || v_email, 0));

	if exists (
		select 1 from public.foundry_publisher_applications a
		where a.applicant_email = v_email and a.status = 'pending'
	) then
		return jsonb_build_object('ok', false, 'reason', 'pending');
	end if;

	select max(a.decided_at) into v_last_decline
	from public.foundry_publisher_applications a
	where a.applicant_email = v_email and a.status = 'declined';
	if v_last_decline is not null and v_last_decline + interval '7 days' > now() then
		return jsonb_build_object('ok', false, 'reason', 'cooldown', 'until', v_last_decline + interval '7 days');
	end if;

	for v_q in
		select q.id, q.position, q.prompt, q.kind, q.flag_choices, q.is_trick, q.reviewer_note
		from public.foundry_publisher_questions q
		where q.active order by q.position, q.created_at, q.id
	loop
		v_answer := public._foundry_norm(p_answers ->> v_q.id::text);
		v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
			'question_id', v_q.id,
			'position', v_q.position,
			'prompt', v_q.prompt,
			'kind', v_q.kind,
			'answer', v_answer,
			'is_trick', v_q.is_trick,
			'flagged', v_q.kind = 'choice' and v_q.flag_choices ? v_answer,
			'reviewer_note', v_q.reviewer_note
		));
	end loop;

	begin
		insert into public.foundry_publisher_applications (applicant, applicant_email, answers)
		values (v_uid, v_email, v_snapshot)
		returning id, submitted_at into v_id, v_at;
	exception when unique_violation then
		-- The lock makes this unreachable from two calls of this function; the
		-- index answers anything else that got there first, in the same words.
		return jsonb_build_object('ok', false, 'reason', 'pending');
	end;

	return jsonb_build_object('ok', true, 'application_id', v_id, 'submitted_at', v_at);
end;
$fd$;

revoke all on function public.foundry_publisher_apply(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.foundry_publisher_apply(jsonb) to authenticated;

-- THE ADMIN LIST. p_status is 'pending' (oldest first), 'decided' (newest
-- decision first) or 'all' (pending first, then decided). At most 200. The
-- name is the profile's own two columns; the address is shown because the
-- review page is admin-only and approving names an account.
create or replace function public.foundry_publisher_applications(p_status text default 'pending')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fd$
declare
	v_status text := lower(btrim(coalesce(p_status, '')));
begin
	if not public.is_admin() then
		raise exception 'Only a site administrator can read publisher applications.';
	end if;
	if v_status not in ('pending', 'decided', 'all') then
		raise exception 'Status must be pending, decided or all.';
	end if;

	return coalesce((
		select jsonb_agg(t.j order by t.sort_group, t.sort_key, t.id)
		from (
			select a.id,
				case when a.status = 'pending' then 0 else 1 end as sort_group,
				case
					when a.status = 'pending' then extract(epoch from a.submitted_at)
					else -extract(epoch from a.decided_at)
				end as sort_key,
				jsonb_build_object(
					'id', a.id,
					'applicant', a.applicant,
					'applicant_email', a.applicant_email,
					'applicant_display_name', pr.display_name,
					'applicant_full_name', pr.full_name,
					'status', a.status,
					'submitted_at', a.submitted_at,
					'decided_at', a.decided_at,
					'decided_by', a.decided_by,
					'decision_note', a.decision_note,
					'trusted_now', public._foundry_is_trusted_email(a.applicant_email),
					'flagged_count', (
						select count(*)::int from jsonb_array_elements(a.answers) e
						where (e ->> 'flagged') = 'true'
					),
					'answers', a.answers
				) as j
			from public.foundry_publisher_applications a
			left join public.profiles pr on pr.id = a.applicant
			where (v_status = 'all')
				or (v_status = 'pending' and a.status = 'pending')
				or (v_status = 'decided' and a.status <> 'pending')
			order by case when a.status = 'pending' then 0 else 1 end,
				case
					when a.status = 'pending' then extract(epoch from a.submitted_at)
					else -extract(epoch from a.decided_at)
				end,
				a.id
			limit 200
		) t
	), '[]'::jsonb);
end;
$fd$;

revoke all on function public.foundry_publisher_applications(text) from public, anon, authenticated, service_role;
grant execute on function public.foundry_publisher_applications(text) to authenticated;

-- The count the review sub-nav shows. Null, never zero, for anybody who is
-- not an admin, so a student's surface cannot tell an empty queue from one it
-- may not see.
create or replace function public.foundry_publisher_pending_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $fd$
	select case
		when public.is_admin() then (
			select count(*)::int from public.foundry_publisher_applications a
			where a.status = 'pending'
		)
		else null
	end;
$fd$;

revoke all on function public.foundry_publisher_pending_count() from public, anon, authenticated, service_role;
grant execute on function public.foundry_publisher_pending_count() to authenticated;

-- DECIDE, one click each way. An approval calls 0173's foundry_trusted_grant
-- and adds no flag of its own. A decision on an application that is no longer
-- pending is a structured refusal, not a second decision.
create or replace function public.foundry_publisher_decide(
	p_application_id uuid,
	p_decision text,
	p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fd$
declare
	v_decision text := lower(btrim(coalesce(p_decision, '')));
	v_note text := nullif(public._foundry_norm(p_note), '');
	v_row public.foundry_publisher_applications%rowtype;
	v_status text;
begin
	if not public.is_admin() then
		raise exception 'Only a site administrator can decide a publisher application.';
	end if;
	if v_decision not in ('approve', 'decline') then
		raise exception 'Approve or decline?';
	end if;
	if v_note is not null and char_length(v_note) > 300 then
		raise exception 'Keep the note to 300 characters.';
	end if;

	select * into v_row
	from public.foundry_publisher_applications a
	where a.id = p_application_id
	for update;
	if not found then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if v_row.status <> 'pending' then
		return jsonb_build_object('ok', false, 'reason', 'already_decided', 'status', v_row.status);
	end if;

	v_status := case when v_decision = 'approve' then 'approved' else 'declined' end;

	if v_decision = 'approve' then
		perform public.foundry_trusted_grant(
			v_row.applicant_email,
			left(coalesce(v_note, 'Approved from a publisher application'), 200)
		);
	end if;

	update public.foundry_publisher_applications a
	set status = v_status,
		decided_at = now(),
		decided_by = public.current_user_email(),
		decision_note = v_note
	where a.id = p_application_id;

	return jsonb_build_object('ok', true, 'status', v_status, 'email', v_row.applicant_email);
end;
$fd$;

revoke all on function public.foundry_publisher_decide(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.foundry_publisher_decide(uuid, text, text) to authenticated;

-- THE EDITOR'S READ: every question, retired ones included, with the three
-- admin-only fields. Active first, then position.
create or replace function public.foundry_publisher_questions_admin()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fd$
begin
	if not public.is_admin() then
		raise exception 'Only a site administrator can edit the publisher questions.';
	end if;

	return coalesce((
		select jsonb_agg(jsonb_build_object(
				'id', q.id,
				'position', q.position,
				'prompt', q.prompt,
				'kind', q.kind,
				'choices', q.choices,
				'flag_choices', q.flag_choices,
				'is_trick', q.is_trick,
				'reviewer_note', q.reviewer_note,
				'active', q.active,
				'updated_at', q.updated_at,
				'updated_by', q.updated_by
			) order by q.active desc, q.position, q.created_at, q.id)
		from public.foundry_publisher_questions q
	), '[]'::jsonb);
end;
$fd$;

revoke all on function public.foundry_publisher_questions_admin() from public, anon, authenticated, service_role;
grant execute on function public.foundry_publisher_questions_admin() to authenticated;

-- THE EDITOR SAVES THE WHOLE SET IN ONE TRANSACTION. An array of 1 to 10
-- entries {id?, prompt, kind, choices?, flag_choices?, is_trick?,
-- reviewer_note?}, in the order they should be asked. EVERY entry is
-- validated before ANYTHING is written, and a failure answers {ok:false,
-- reason:'invalid', index, message} (index is null for the array itself), or
-- {ok:false, reason:'unknown_question', index} for an id that names nothing.
-- Then: each entry with an id is updated in place (position = its index plus
-- one, active), each entry without one is inserted, and every active question
-- the set leaves out is RETIRED (active = false). NOTHING IS EVER DELETED: an
-- application's snapshot already carries the prompt it answered, and a
-- question's id is the key that snapshot names.
create or replace function public.foundry_publisher_set_questions(p_questions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fd$
declare
	v_email text := public.current_user_email();
	v_n integer;
	v_i integer;
	v_e jsonb;
	v_id uuid;
	v_ids uuid[] := '{}'::uuid[];
	v_prompt text;
	v_kind text;
	v_choices jsonb;
	v_flags jsonb;
	v_note text;
	v_trick boolean;
	v_c jsonb;
	v_norm jsonb;
	v_retired integer;
	v_active integer;
begin
	if not public.is_admin() then
		raise exception 'Only a site administrator can edit the publisher questions.';
	end if;

	if jsonb_typeof(p_questions) is distinct from 'array' then
		return jsonb_build_object('ok', false, 'reason', 'invalid', 'index', null,
			'message', 'Send the questions as a list.');
	end if;
	v_n := jsonb_array_length(p_questions);
	if v_n < 1 or v_n > 10 then
		return jsonb_build_object('ok', false, 'reason', 'invalid', 'index', null,
			'message', 'Keep between 1 and 10 questions.');
	end if;

	-- PASS 1: validate everything, write nothing.
	for v_i in 0 .. v_n - 1 loop
		v_e := p_questions -> v_i;
		if jsonb_typeof(v_e) is distinct from 'object' then
			return jsonb_build_object('ok', false, 'reason', 'invalid', 'index', v_i,
				'message', 'Each question has to be a set of fields.');
		end if;

		if v_e ? 'id' and jsonb_typeof(v_e -> 'id') <> 'null' then
			if jsonb_typeof(v_e -> 'id') is distinct from 'string'
				or (v_e ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
				return jsonb_build_object('ok', false, 'reason', 'unknown_question', 'index', v_i);
			end if;
			v_id := (v_e ->> 'id')::uuid;
			if not exists (select 1 from public.foundry_publisher_questions q where q.id = v_id) then
				return jsonb_build_object('ok', false, 'reason', 'unknown_question', 'index', v_i);
			end if;
			if v_id = any (v_ids) then
				return jsonb_build_object('ok', false, 'reason', 'invalid', 'index', v_i,
					'message', 'That question appears twice.');
			end if;
			v_ids := v_ids || v_id;
		end if;

		v_prompt := public._foundry_norm(case when jsonb_typeof(v_e -> 'prompt') = 'string' then v_e ->> 'prompt' end);
		if char_length(v_prompt) < 1 or char_length(v_prompt) > 500 then
			return jsonb_build_object('ok', false, 'reason', 'invalid', 'index', v_i,
				'message', 'A question needs a prompt of 1 to 500 characters.');
		end if;

		v_kind := case when jsonb_typeof(v_e -> 'kind') = 'string' then v_e ->> 'kind' end;
		if v_kind is null or v_kind not in ('text', 'choice') then
			return jsonb_build_object('ok', false, 'reason', 'invalid', 'index', v_i,
				'message', 'A question is either a written answer or a choice.');
		end if;

		v_choices := coalesce(nullif(v_e -> 'choices', 'null'::jsonb), '[]'::jsonb);
		v_flags := coalesce(nullif(v_e -> 'flag_choices', 'null'::jsonb), '[]'::jsonb);
		if jsonb_typeof(v_choices) <> 'array' or jsonb_typeof(v_flags) <> 'array' then
			return jsonb_build_object('ok', false, 'reason', 'invalid', 'index', v_i,
				'message', 'Choices have to be a list.');
		end if;

		if v_kind = 'text' then
			if jsonb_array_length(v_choices) <> 0 or jsonb_array_length(v_flags) <> 0 then
				return jsonb_build_object('ok', false, 'reason', 'invalid', 'index', v_i,
					'message', 'A written-answer question has no choices.');
			end if;
		else
			v_norm := '[]'::jsonb;
			for v_c in select value from jsonb_array_elements(v_choices) loop
				if jsonb_typeof(v_c) <> 'string'
					or char_length(public._foundry_norm(v_c #>> '{}')) < 1
					or char_length(public._foundry_norm(v_c #>> '{}')) > 120 then
					return jsonb_build_object('ok', false, 'reason', 'invalid', 'index', v_i,
						'message', 'Each choice needs 1 to 120 characters.');
				end if;
				if v_norm ? public._foundry_norm(v_c #>> '{}') then
					return jsonb_build_object('ok', false, 'reason', 'invalid', 'index', v_i,
						'message', 'Two choices say the same thing.');
				end if;
				v_norm := v_norm || jsonb_build_array(public._foundry_norm(v_c #>> '{}'));
			end loop;
			if jsonb_array_length(v_norm) < 2 or jsonb_array_length(v_norm) > 6 then
				return jsonb_build_object('ok', false, 'reason', 'invalid', 'index', v_i,
					'message', 'A choice question needs 2 to 6 choices.');
			end if;
			for v_c in select value from jsonb_array_elements(v_flags) loop
				if jsonb_typeof(v_c) <> 'string' or not (v_norm ? public._foundry_norm(v_c #>> '{}')) then
					return jsonb_build_object('ok', false, 'reason', 'invalid', 'index', v_i,
						'message', 'A red-flag answer has to be one of the choices.');
				end if;
			end loop;
		end if;

		if v_e ? 'reviewer_note' and jsonb_typeof(v_e -> 'reviewer_note') not in ('string', 'null') then
			return jsonb_build_object('ok', false, 'reason', 'invalid', 'index', v_i,
				'message', 'The reviewer note has to be text.');
		end if;
		v_note := nullif(public._foundry_norm(v_e ->> 'reviewer_note'), '');
		if v_note is not null and char_length(v_note) > 500 then
			return jsonb_build_object('ok', false, 'reason', 'invalid', 'index', v_i,
				'message', 'Keep the reviewer note to 500 characters.');
		end if;

		if v_e ? 'is_trick' and jsonb_typeof(v_e -> 'is_trick') not in ('boolean', 'null') then
			return jsonb_build_object('ok', false, 'reason', 'invalid', 'index', v_i,
				'message', 'Trick has to be yes or no.');
		end if;
	end loop;

	-- PASS 2: write. Retire first, so a question the set leaves out is never
	-- counted as kept.
	update public.foundry_publisher_questions q
	set active = false, updated_at = now(), updated_by = v_email
	where q.active and not (q.id = any (v_ids));
	get diagnostics v_retired = row_count;

	for v_i in 0 .. v_n - 1 loop
		v_e := p_questions -> v_i;
		v_prompt := public._foundry_norm(v_e ->> 'prompt');
		v_kind := v_e ->> 'kind';
		v_note := nullif(public._foundry_norm(v_e ->> 'reviewer_note'), '');
		v_trick := coalesce((case when jsonb_typeof(v_e -> 'is_trick') = 'boolean' then (v_e ->> 'is_trick')::boolean end), false);
		v_norm := '[]'::jsonb;
		v_flags := '[]'::jsonb;
		if v_kind = 'choice' then
			select coalesce(jsonb_agg(to_jsonb(public._foundry_norm(c #>> '{}')) order by o), '[]'::jsonb)
			into v_norm
			from jsonb_array_elements(v_e -> 'choices') with ordinality as e(c, o);
			select coalesce(jsonb_agg(f order by o), '[]'::jsonb)
			into v_flags
			from (
				select distinct on (public._foundry_norm(c #>> '{}'))
					to_jsonb(public._foundry_norm(c #>> '{}')) as f, o
				from jsonb_array_elements(coalesce(nullif(v_e -> 'flag_choices', 'null'::jsonb), '[]'::jsonb))
					with ordinality as e(c, o)
				order by public._foundry_norm(c #>> '{}'), o
			) d;
		end if;

		if v_e ? 'id' and jsonb_typeof(v_e -> 'id') = 'string' then
			update public.foundry_publisher_questions q
			set position = v_i + 1,
				prompt = v_prompt,
				kind = v_kind,
				choices = v_norm,
				flag_choices = v_flags,
				is_trick = v_trick,
				reviewer_note = v_note,
				active = true,
				updated_at = now(),
				updated_by = v_email
			where q.id = (v_e ->> 'id')::uuid;
		else
			insert into public.foundry_publisher_questions
				(position, prompt, kind, choices, flag_choices, is_trick, reviewer_note, active, updated_by)
			values (v_i + 1, v_prompt, v_kind, v_norm, v_flags, v_trick, v_note, true, v_email);
		end if;
	end loop;

	select count(*) into v_active from public.foundry_publisher_questions q where q.active;

	return jsonb_build_object('ok', true, 'active', v_active, 'retired', v_retired);
end;
$fd$;

revoke all on function public.foundry_publisher_set_questions(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.foundry_publisher_set_questions(jsonb) to authenticated;


-- ===========================================================================
-- PART B3. THE GAME REQUEST BOARD (report b2ba6d74).
--
-- Mr. Pina, 2026-09-30: "this will be done between students for now.
-- transactions off the site." So this is a board and nothing else. A request
-- may state an OFFER in free text, and nothing here reads, writes or names a
-- coin table or a coin function (tests/db/foundry-game-requests.test.ts sweeps
-- these four bodies for the word).
--
-- WHO IS SHOWN. The requester's chosen name, through the two profile columns
-- foundryAuthorName already reads, and their uuid as the author-page key.
-- NEVER an address. An admin can hide a request (shelved, reversible); a
-- hidden request stays visible to its own author and to admins, marked.
-- ===========================================================================

create table if not exists public.foundry_game_requests (
	id uuid primary key default gen_random_uuid(),
	requester uuid not null references auth.users (id) on delete cascade,
	title text not null check (char_length(public._foundry_norm(title)) between 1 and 80),
	body text not null check (char_length(public._foundry_norm(body)) between 1 and 1000),
	offer text check (offer is null or char_length(public._foundry_norm(offer)) between 1 and 120),
	status text not null default 'open' check (status in ('open', 'closed')),
	fulfilled_app_id uuid references public.student_apps (id) on delete set null,
	created_at timestamptz not null default now(),
	closed_at timestamptz,
	hidden_at timestamptz,
	hidden_by text,
	constraint foundry_game_requests_closed_pair check ((status = 'open') = (closed_at is null))
);

create index if not exists foundry_game_requests_board
	on public.foundry_game_requests (status, created_at desc);
create index if not exists foundry_game_requests_by_requester
	on public.foundry_game_requests (requester, created_at desc);

alter table public.foundry_game_requests enable row level security;
revoke all on table public.foundry_game_requests from public, anon, authenticated, service_role;

-- THE BOARD. Visible: not hidden, or the caller is an admin, or it is the
-- caller's own; and open, unless p_include_closed. Open first, newest first,
-- at most 200. `hidden` is projected only to an admin and to the author, so
-- nobody else learns that a request was shelved. `fulfilled` names an app only
-- when the gallery's own population predicate admits it for this caller.
create or replace function public.foundry_game_requests(p_include_closed boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fd$
declare
	v_uid uuid := (select auth.uid());
	v_admin boolean;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	v_admin := public.is_admin();

	return coalesce((
		select jsonb_agg(x.j order by x.open_first, x.created_at desc, x.id)
		from (
			select r.id,
				r.created_at,
				case when r.status = 'open' then 0 else 1 end as open_first,
				jsonb_build_object(
					'id', r.id,
					'title', r.title,
					'body', r.body,
					'offer', r.offer,
					'status', r.status,
					'created_at', r.created_at,
					'closed_at', r.closed_at,
					'owner', r.requester,
					'owner_display_name', pr.display_name,
					'owner_full_name', pr.full_name,
					'mine', r.requester = v_uid,
					'fulfilled', (
						select jsonb_build_object('slug', a.slug, 'title', a.title)
						from public.student_apps a
						where a.id = r.fulfilled_app_id
							and public._foundry_app_in_population(a.owner, a.hidden_at, a.published_version_id)
					)
				) || case
					when v_admin or r.requester = v_uid
						then jsonb_build_object('hidden', r.hidden_at is not null)
					else '{}'::jsonb
				end as j
			from public.foundry_game_requests r
			left join public.profiles pr on pr.id = r.requester
			where (r.hidden_at is null or v_admin or r.requester = v_uid)
				and (r.status = 'open' or coalesce(p_include_closed, false))
			order by case when r.status = 'open' then 0 else 1 end, r.created_at desc, r.id
			limit 200
		) x
	), '[]'::jsonb);
end;
$fd$;

revoke all on function public.foundry_game_requests(boolean) from public, anon, authenticated, service_role;
grant execute on function public.foundry_game_requests(boolean) to authenticated;

-- POST. No identity parameter. Structured refusals, in this order:
-- 'foundry_off', 'not_eligible', 'blank' {field}, 'too_long' {field, limit},
-- then under a per-person advisory lock 'too_many_open' {limit: 3} (open and
-- not hidden) and 'too_soon' {retry_after_seconds} (two minutes between
-- posts). The stored values are the trimmed ones; an empty offer is null.
create or replace function public.foundry_game_request_post(
	p_title text,
	p_body text,
	p_offer text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fd$
declare
	v_uid uuid := (select auth.uid());
	v_email text := public.current_user_email();
	v_title text := public._foundry_norm(p_title);
	v_body text := public._foundry_norm(p_body);
	v_offer text := nullif(public._foundry_norm(p_offer), '');
	v_open integer;
	v_last timestamptz;
	v_id uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	if public._foundry_site_closed() then
		return jsonb_build_object('ok', false, 'reason', 'foundry_off');
	end if;
	if v_email not like '%@boscotech.net' and v_email not like '%@boscotech.edu' then
		return jsonb_build_object('ok', false, 'reason', 'not_eligible');
	end if;
	if v_title = '' then
		return jsonb_build_object('ok', false, 'reason', 'blank', 'field', 'title');
	end if;
	if v_body = '' then
		return jsonb_build_object('ok', false, 'reason', 'blank', 'field', 'body');
	end if;
	if char_length(v_title) > 80 then
		return jsonb_build_object('ok', false, 'reason', 'too_long', 'field', 'title', 'limit', 80);
	end if;
	if char_length(v_body) > 1000 then
		return jsonb_build_object('ok', false, 'reason', 'too_long', 'field', 'body', 'limit', 1000);
	end if;
	if v_offer is not null and char_length(v_offer) > 120 then
		return jsonb_build_object('ok', false, 'reason', 'too_long', 'field', 'offer', 'limit', 120);
	end if;

	perform pg_advisory_xact_lock(hashtextextended('foundry_request:' || v_uid::text, 0));

	select count(*) into v_open
	from public.foundry_game_requests r
	where r.requester = v_uid and r.status = 'open' and r.hidden_at is null;
	if v_open >= 3 then
		return jsonb_build_object('ok', false, 'reason', 'too_many_open', 'limit', 3);
	end if;

	select max(r.created_at) into v_last
	from public.foundry_game_requests r
	where r.requester = v_uid;
	if v_last is not null and v_last > now() - interval '120 seconds' then
		return jsonb_build_object('ok', false, 'reason', 'too_soon',
			'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_last + interval '120 seconds' - now())))::int));
	end if;

	insert into public.foundry_game_requests (requester, title, body, offer)
	values (v_uid, v_title, v_body, v_offer)
	returning id into v_id;

	return jsonb_build_object('ok', true, 'id', v_id);
end;
$fd$;

revoke all on function public.foundry_game_request_post(text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.foundry_game_request_post(text, text, text) to authenticated;

-- CLOSE. Nothing reopens a request, so the client confirms in two steps.
-- 'not_found' answers identically for a request that does not exist and one
-- the caller may not close (neither its author nor an admin). A slug, when
-- given, must name a PUBLISHED app that is not hidden.
create or replace function public.foundry_game_request_close(
	p_request_id uuid,
	p_fulfilled_slug text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fd$
declare
	v_uid uuid := (select auth.uid());
	v_row public.foundry_game_requests%rowtype;
	v_slug text := nullif(lower(btrim(coalesce(p_fulfilled_slug, ''))), '');
	v_app uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select * into v_row from public.foundry_game_requests r where r.id = p_request_id for update;
	if not found or (v_row.requester <> v_uid and not public.is_admin()) then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if v_row.status = 'closed' then
		return jsonb_build_object('ok', true, 'already', true);
	end if;

	if v_slug is not null then
		select a.id into v_app
		from public.student_apps a
		where a.slug = v_slug
			and a.published_version_id is not null
			and a.hidden_at is null;
		if v_app is null then
			return jsonb_build_object('ok', false, 'reason', 'no_such_app');
		end if;
	end if;

	update public.foundry_game_requests r
	set status = 'closed', closed_at = now(), fulfilled_app_id = v_app
	where r.id = p_request_id;

	return jsonb_build_object('ok', true, 'already', false);
end;
$fd$;

revoke all on function public.foundry_game_request_close(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.foundry_game_request_close(uuid, text) to authenticated;

-- HIDE, admin only, and reversible by the same call with false. Hiding twice
-- keeps the first stamp and the first admin.
create or replace function public.foundry_game_request_set_hidden(p_request_id uuid, p_hidden boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fd$
begin
	if not public.is_admin() then
		raise exception 'Only a site administrator can hide a game request.';
	end if;
	if p_hidden is null then
		raise exception 'Hidden or shown? That has to be one or the other.';
	end if;

	update public.foundry_game_requests r
	set hidden_at = case when p_hidden then coalesce(r.hidden_at, now()) else null end,
		hidden_by = case when p_hidden then coalesce(r.hidden_by, public.current_user_email()) else null end
	where r.id = p_request_id;
	if not found then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;

	return jsonb_build_object('ok', true, 'hidden', p_hidden);
end;
$fd$;

revoke all on function public.foundry_game_request_set_hidden(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.foundry_game_request_set_hidden(uuid, boolean) to authenticated;


-- ===========================================================================
-- PART C. THE FEEDBACK HORIZON.
--
-- A report is either feedback to fold in soon ("now") or a big idea for later
-- ("long_term"). It is its OWN column rather than a new kind, because a long-
-- term idea can still be a bug, an idea or praise.
--
-- RLS STANCE: NO NEW POLICY AND NO NEW GRANT. 0053's table-level grant of
-- select and insert to authenticated covers the new column, and the "insert
-- own feedback" policy (0126) still pins the author with its WITH CHECK. There
-- is still no update grant and no update policy, so app_feedback_set_horizon
-- below is the only way the column changes after insert.
--
-- THE TWO WRITE PATHS STAY TWO (CLAUDE.md). The signed-in direct insert names
-- the column when the reporter picks long-term; the anonymous route forwards
-- meta verbatim and names no new parameter, so app_feedback_submit LIFTS
-- meta.horizon into the column and strips the key, exactly as 0170 lifts
-- meta.tried. No new arity, so no signature trap.
-- ===========================================================================

-- The column, its CHECK, and a ONCE-ONLY backfill inside a catalog guard on
-- the column's own existence. The backfill lifts rows written by the new
-- client between the Vercel deploy and this apply, which carry the choice in
-- meta. meta itself is NOT rewritten. On a second run the column exists, the
-- guard skips the update, and a row an admin has since moved is left alone.
do $fb$
declare
	v_had boolean;
	v_lifted integer := 0;
begin
	select exists (
		select 1 from pg_catalog.pg_attribute
		where attrelid = 'public.app_feedback'::regclass
			and attname = 'horizon'
			and not attisdropped
	) into v_had;

	if not v_had then
		alter table public.app_feedback add column horizon text not null default 'now';
		update public.app_feedback set horizon = 'long_term' where meta ->> 'horizon' = 'long_term';
		get diagnostics v_lifted = row_count;
	end if;

	if not exists (
		select 1 from pg_catalog.pg_constraint
		where conrelid = 'public.app_feedback'::regclass
			and conname = 'app_feedback_horizon_check'
	) then
		alter table public.app_feedback add constraint app_feedback_horizon_check
			check (horizon in ('now', 'long_term'));
	end if;

	raise notice '0230 feedback: horizon %; % row(s) lifted from meta; now %, long_term %',
		case when v_had then 'already present' else 'added' end,
		v_lifted,
		(select count(*) from public.app_feedback where horizon = 'now'),
		(select count(*) from public.app_feedback where horizon = 'long_term');
end;
$fb$;

comment on column public.app_feedback.horizon is
'now (fold in soon) or long_term (a big idea for later). Set by the reporter on insert (the direct insert under the 0053 and 0126 policy, or meta.horizon lifted by app_feedback_submit); changed afterwards only by app_feedback_set_horizon (admin). Added by 0230.';

-- THE WRITE FUNCTION, RE-CREATED AT ITS EXISTING NINE-ARGUMENT SIGNATURE.
-- 0170 section 5's body verbatim, plus v_horizon, plus horizon stripped from
-- meta beside tried, plus the column in the insert. An unknown meta.horizon
-- value reads as now. It returns exactly what it returned before.
create or replace function public.app_feedback_submit(
	p_app text,
	p_kind text,
	p_message text,
	p_context text default null,
	p_meta jsonb default '{}'::jsonb,
	p_contact text default null,
	p_address_hash text default null,
	p_tried text default null,
	p_screenshot_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fb$
declare
	v_uid uuid := (select auth.uid());
	v_app text := nullif(public._app_feedback_trim(p_app), '');
	v_kind text := lower(public._app_feedback_trim(p_kind));
	v_message text := public._app_feedback_trim(p_message);
	v_context text := nullif(public._app_feedback_trim(p_context), '');
	v_contact text := nullif(public._app_feedback_trim(p_contact), '');
	v_supplied text := nullif(public._app_feedback_trim(p_address_hash), '');
	-- THE PARAMETER FIRST, THEN THE BRIDGE. See the header: the anonymous
	-- route forwards meta verbatim and does not name p_tried yet, so the
	-- signed-out form carries the answer inside meta.tried. Either way the
	-- stored row has ONE spelling: the column.
	v_tried text := coalesce(
		nullif(public._app_feedback_trim(p_tried), ''),
		nullif(public._app_feedback_trim(coalesce(p_meta, '{}'::jsonb) ->> 'tried'), '')
	);
	-- 0230: the same bridge for the horizon, which has no parameter at all.
	v_horizon text := case
		when lower(btrim(coalesce(p_meta, '{}'::jsonb) ->> 'horizon')) = 'long_term' then 'long_term'
		else 'now'
	end;
	v_meta jsonb := coalesce(p_meta, '{}'::jsonb) - 'tried' - 'horizon';
	v_shot text := nullif(public._app_feedback_trim(p_screenshot_path), '');
	v_hash text;
	v_recent integer;
	v_id uuid;
begin
	-- Our own caller's job to get right.
	if v_app is null then
		raise exception 'A feedback app id is required.';
	end if;
	if v_kind not in ('bug', 'idea', 'praise', 'other') then
		raise exception 'Unknown feedback kind.';
	end if;

	if v_uid is null then
		-- The anonymous path. An unattributable write is not on offer.
		if v_supplied is null then
			raise exception 'An anonymous report needs a reporter address hash.';
		end if;
		-- Salted here, which is what makes the column unable to hold an address:
		-- whatever arrived, what is stored is a digest of it.
		v_hash := md5(
			(select s.salt from public.app_feedback_reporter_secret s where s.id limit 1)
			|| v_supplied
		);
	end if;
	-- A signed-in call ignores p_address_hash entirely. See 0126's XOR
	-- constraint for why an account is never stored beside an address hash.

	-- What a person could have caused.
	if v_message = '' then
		return jsonb_build_object('ok', false, 'reason', 'message_empty');
	end if;
	if char_length(v_message) > public._app_feedback_message_max() then
		return jsonb_build_object('ok', false, 'reason', 'message_too_long');
	end if;
	if v_contact is not null and char_length(v_contact) > public._app_feedback_contact_max() then
		return jsonb_build_object('ok', false, 'reason', 'contact_too_long');
	end if;
	if v_tried is not null and char_length(v_tried) > public._app_feedback_tried_max() then
		return jsonb_build_object('ok', false, 'reason', 'tried_too_long');
	end if;
	-- A screenshot path of the wrong shape is NOT refused gracefully: no person
	-- types one, so a bad value is a bug in our own caller, and the CHECK on the
	-- column raises 23514 exactly as it would for a direct insert.

	if v_hash is not null then
		-- Age out first. A row older than the window can never affect a decision
		-- again, and the window is therefore also the retention.
		delete from public.app_feedback_rate r
		where r.created_at < now() - public._app_feedback_rate_window();

		select count(*) into v_recent
		from public.app_feedback_rate r
		where r.reporter_hash = v_hash
			and r.created_at > now() - public._app_feedback_rate_window();

		if v_recent >= public._app_feedback_rate_cap() then
			return jsonb_build_object('ok', false, 'reason', 'rate_limited');
		end if;
	end if;

	insert into public.app_feedback
		(user_id, app, context, kind, message, meta, contact, reporter_hash, tried, screenshot_path, horizon)
	values (
		v_uid, v_app, v_context, v_kind, v_message,
		v_meta, v_contact, v_hash, v_tried, v_shot, v_horizon
	)
	returning id into v_id;

	if v_hash is not null then
		insert into public.app_feedback_rate (reporter_hash) values (v_hash);
	end if;

	return jsonb_build_object('ok', true, 'id', v_id);
end;
$fb$;

revoke all on function public.app_feedback_submit(text, text, text, text, jsonb, text, text, text, text)
	from public, anon, authenticated;
grant execute on function public.app_feedback_submit(text, text, text, text, jsonb, text, text, text, text)
	to service_role;

-- THE CONSOLE READ: KEEP BOTH ARITIES. The deployed console calls the two-
-- argument form, so dropping it would break the queue until the client ships,
-- and shipping first would break the client until this applied; with both
-- standing there is no ordering at all (CLAUDE.md, the signature trap's
-- exception). What makes the pair safe is that no payload can bind to both:
-- the WIDE form declares NO defaults, so the old key set cannot reach it, and
-- the NARROW form has no parameter for the new key.
--
-- The wide form is dropped at its own exact signature first, so this file
-- re-applies over a machine that took a draft of it with defaults (removing a
-- default through create or replace is refused).
drop function if exists public.app_feedback_admin_list(text, integer, text);

create function public.app_feedback_admin_list(p_app text, p_limit integer, p_horizon text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fb$
declare
	v_app text := nullif(btrim(coalesce(p_app, '')), '');
	v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
	v_h text := nullif(lower(btrim(coalesce(p_horizon, ''))), '');
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.is_admin() then
		raise exception 'Only a site admin can read the feedback queue.';
	end if;
	if v_h is not null and v_h not in ('now', 'long_term') then
		raise exception 'Horizon must be now or long_term.';
	end if;

	return coalesce((
		select jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc)
		from (
			select f.id, f.app, f.context, f.kind, f.message, f.meta,
				f.status, f.created_at, f.reviewed_at, f.reviewed_by,
				-- Stated, not inferred (0127).
				(f.user_id is null) as anonymous,
				-- What somebody typed, never a verified identity (0127).
				f.contact,
				-- 0170: what they tried, and the key of the one screenshot.
				f.tried,
				f.screenshot_path,
				-- 0230: fold in soon, or a big idea for later.
				f.horizon,
				case when f.user_id is null then null else
					coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.full_name), ''),
						split_part(coalesce(p.email, ''), '@', 1))
				end as submitter_name,
				case when f.user_id is null then null else p.email end as submitter_email
			from public.app_feedback f
			left join public.profiles p on p.id = f.user_id
			where (v_app is null or f.app = v_app)
				and (v_h is null or f.horizon = v_h)
			order by f.created_at desc
			limit v_limit
		) t
	), '[]'::jsonb);
end;
$fb$;

-- The NARROW form keeps its signature and its defaults verbatim and becomes a
-- thin wrapper, so there is one copy of the projection. It re-raises its OWN
-- original refusals, in its original order, before delegating, so a console
-- that has not been redeployed sees the errors it has always seen. Its answer
-- gains the horizon key on every row and nothing else.
create or replace function public.app_feedback_admin_list(
	p_app text default null,
	p_limit integer default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fb$
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.is_admin() then
		raise exception 'Only a site admin can read the feedback queue.';
	end if;

	return public.app_feedback_admin_list(p_app, p_limit, null::text);
end;
$fb$;

revoke all on function public.app_feedback_admin_list(text, integer)
	from public, anon, authenticated;
grant execute on function public.app_feedback_admin_list(text, integer) to authenticated;
revoke all on function public.app_feedback_admin_list(text, integer, text)
	from public, anon, authenticated, service_role;
grant execute on function public.app_feedback_admin_list(text, integer, text) to authenticated;

-- THE ONE WRITE PATH FOR THE COLUMN, in 0188's app_feedback_set_status shape.
-- Admin only. Filing is not reviewing: status, reviewed_at and reviewed_by are
-- untouched, so the console's status undo and its review trail mean what they
-- meant before.
create or replace function public.app_feedback_set_horizon(p_id uuid, p_horizon text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fb$
declare
	v_h text := lower(btrim(coalesce(p_horizon, '')));
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.is_admin() then
		raise exception 'Only a site admin can triage feedback.';
	end if;
	if v_h not in ('now', 'long_term') then
		raise exception 'Horizon must be now or long_term.';
	end if;

	update public.app_feedback f set horizon = v_h where f.id = p_id;
	if not found then
		raise exception 'That feedback does not exist.';
	end if;

	return jsonb_build_object('ok', true, 'id', p_id, 'horizon', v_h);
end;
$fb$;

revoke all on function public.app_feedback_set_horizon(uuid, text)
	from public, anon, authenticated, service_role;
grant execute on function public.app_feedback_set_horizon(uuid, text) to authenticated;


-- ===========================================================================
-- PART D. THE SELF-CHECK. Every claim above read back out of the catalog, by
-- NAME over the objects this file writes and nothing else. It raises, which
-- rolls the whole file back, and it reports its counts.
-- ===========================================================================

do $chk$
declare
	v_tables text[] := array[
		'classroom_quick_posts',
		'classroom_quick_post_sections',
		'foundry_site_settings',
		'foundry_publisher_questions',
		'foundry_publisher_applications',
		'foundry_game_requests'
	];
	v_constraints text[] := array[
		'classroom_quick_posts_author_shape',
		'classroom_quick_posts_body_shape',
		'classroom_quick_posts_window',
		'classroom_quick_posts_takedown_pair',
		'foundry_site_settings_open_is_clean',
		'foundry_publisher_applications_decided_pair',
		'foundry_game_requests_closed_pair',
		'app_feedback_horizon_check'
	];
	-- Client-callable: exactly one overload, authenticated yes, anon no.
	v_public_fns text[] := array[
		'classroom_quick_posts(uuid)',
		'classroom_quick_post_create(uuid[], text, timestamptz)',
		'classroom_quick_post_take_down(uuid)',
		'foundry_set_site_open(boolean, text)',
		'foundry_section_access()',
		'foundry_play_start(uuid, uuid)',
		'foundry_publisher_status()',
		'foundry_publisher_apply(jsonb)',
		'foundry_publisher_applications(text)',
		'foundry_publisher_pending_count()',
		'foundry_publisher_decide(uuid, text, text)',
		'foundry_publisher_questions_admin()',
		'foundry_publisher_set_questions(jsonb)',
		'foundry_game_requests(boolean)',
		'foundry_game_request_post(text, text, text)',
		'foundry_game_request_close(uuid, text)',
		'foundry_game_request_set_hidden(uuid, boolean)',
		'app_feedback_set_horizon(uuid, text)'
	];
	-- Definer-only: no client role holds them.
	v_private_fns text[] := array[
		'_classroom_quick_post_can_take_down(uuid, text)',
		'_foundry_site_closed()'
	];
	v_name text;
	v_priv text;
	v_rls boolean;
	v_policies integer;
	v_overloads integer;
	v_questions integer;
	v_tricks integer;
	v_settings integer;
	v_default text;
	v_nullable text;
begin
	foreach v_name in array v_tables loop
		select c.relrowsecurity into v_rls
		from pg_catalog.pg_class c
		join pg_catalog.pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'public' and c.relname = v_name and c.relkind = 'r';

		if v_rls is null then
			raise exception '0230: table public.% is missing.', v_name;
		end if;
		if not v_rls then
			raise exception '0230: table public.% does not have row level security enabled.', v_name;
		end if;

		select count(*) into v_policies
		from pg_catalog.pg_policies p
		where p.schemaname = 'public' and p.tablename = v_name;
		if v_policies <> 0 then
			raise exception '0230: table public.% carries % policy/policies; it must have none.', v_name, v_policies;
		end if;

		foreach v_priv in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
			if has_table_privilege('anon', 'public.' || v_name, v_priv)
				or has_table_privilege('authenticated', 'public.' || v_name, v_priv) then
				raise exception '0230: a client role still holds % on public.%; the revoke must name the roles.', v_priv, v_name;
			end if;
		end loop;
	end loop;

	-- The bundle gate's one read, and nothing more for the service role on the
	-- four Foundry tables.
	if not has_table_privilege('service_role', 'public.foundry_site_settings', 'select') then
		raise exception '0230: service_role cannot read public.foundry_site_settings; the bundle gate needs it.';
	end if;
	foreach v_name in array array['foundry_site_settings', 'foundry_publisher_questions',
		'foundry_publisher_applications', 'foundry_game_requests'] loop
		foreach v_priv in array array['insert', 'update', 'delete', 'truncate'] loop
			if has_table_privilege('service_role', 'public.' || v_name, v_priv) then
				raise exception '0230: service_role still holds % on public.%.', v_priv, v_name;
			end if;
		end loop;
	end loop;
	foreach v_name in array array['foundry_publisher_questions', 'foundry_publisher_applications',
		'foundry_game_requests'] loop
		if has_table_privilege('service_role', 'public.' || v_name, 'select') then
			raise exception '0230: service_role can read public.%; every read is a function.', v_name;
		end if;
	end loop;

	foreach v_name in array v_constraints loop
		if (select count(*) from pg_catalog.pg_constraint c
			join pg_catalog.pg_namespace n on n.oid = c.connamespace
			where n.nspname = 'public' and c.conname = v_name) <> 1 then
			raise exception '0230: constraint % is missing or duplicated.', v_name;
		end if;
	end loop;

	foreach v_name in array v_public_fns loop
		if to_regprocedure('public.' || v_name) is null then
			raise exception '0230: function public.% is missing.', v_name;
		end if;
		select count(*) into v_overloads
		from pg_catalog.pg_proc p
		join pg_catalog.pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = split_part(v_name, '(', 1);
		if v_overloads <> 1 then
			raise exception '0230: public.% has % overloads; it must have exactly one.', split_part(v_name, '(', 1), v_overloads;
		end if;
		if has_function_privilege('anon', 'public.' || v_name, 'execute') then
			raise exception '0230: anon can execute public.%; revoke from anon BY NAME, per 0166.', v_name;
		end if;
		if not has_function_privilege('authenticated', 'public.' || v_name, 'execute') then
			raise exception '0230: authenticated cannot execute public.%; the grant is missing.', v_name;
		end if;
	end loop;

	foreach v_name in array v_private_fns loop
		if to_regprocedure('public.' || v_name) is null then
			raise exception '0230: function public.% is missing.', v_name;
		end if;
		select count(*) into v_overloads
		from pg_catalog.pg_proc p
		join pg_catalog.pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = split_part(v_name, '(', 1);
		if v_overloads <> 1 then
			raise exception '0230: public.% has % overloads; it must have exactly one.', split_part(v_name, '(', 1), v_overloads;
		end if;
		if has_function_privilege('anon', 'public.' || v_name, 'execute')
			or has_function_privilege('authenticated', 'public.' || v_name, 'execute') then
			raise exception '0230: a client role can execute public.%; only definer bodies call it.', v_name;
		end if;
	end loop;
	if has_function_privilege('service_role', 'public._foundry_site_closed()', 'execute') then
		raise exception '0230: service_role can execute public._foundry_site_closed(); nothing outside a definer body calls it.';
	end if;

	-- PART C's two pre-existing functions, which carry their own shapes.
	select count(*) into v_overloads
	from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'app_feedback_submit';
	if v_overloads <> 1 then
		raise exception '0230: app_feedback_submit has % overloads; it must have exactly one.', v_overloads;
	end if;
	if position('horizon' in (select p.prosrc from pg_catalog.pg_proc p
		where p.oid = 'public.app_feedback_submit(text, text, text, text, jsonb, text, text, text, text)'::regprocedure)) = 0 then
		raise exception '0230: app_feedback_submit does not lift the horizon.';
	end if;
	if has_function_privilege('anon', 'public.app_feedback_submit(text, text, text, text, jsonb, text, text, text, text)', 'execute')
		or has_function_privilege('authenticated', 'public.app_feedback_submit(text, text, text, text, jsonb, text, text, text, text)', 'execute') then
		raise exception '0230: app_feedback_submit is executable by a client role; it is the service role''s alone.';
	end if;
	if not has_function_privilege('service_role', 'public.app_feedback_submit(text, text, text, text, jsonb, text, text, text, text)', 'execute') then
		raise exception '0230: service_role cannot execute app_feedback_submit; the anonymous route needs it.';
	end if;

	select count(*) into v_overloads
	from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'app_feedback_admin_list';
	if v_overloads <> 2 then
		raise exception '0230: app_feedback_admin_list has % overloads; it must have exactly two.', v_overloads;
	end if;
	if (select p.pronargdefaults from pg_catalog.pg_proc p
		where p.oid = 'public.app_feedback_admin_list(text, integer, text)'::regprocedure) <> 0 then
		raise exception '0230: the wide app_feedback_admin_list declares a default; no payload may bind to both forms.';
	end if;
	if (select p.pronargdefaults from pg_catalog.pg_proc p
		where p.oid = 'public.app_feedback_admin_list(text, integer)'::regprocedure) <> 2 then
		raise exception '0230: the narrow app_feedback_admin_list lost its defaults; the deployed console calls it with none.';
	end if;
	foreach v_name in array array['app_feedback_admin_list(text, integer)', 'app_feedback_admin_list(text, integer, text)'] loop
		if has_function_privilege('anon', 'public.' || v_name, 'execute') then
			raise exception '0230: anon can execute public.%.', v_name;
		end if;
		if not has_function_privilege('authenticated', 'public.' || v_name, 'execute') then
			raise exception '0230: authenticated cannot execute public.%.', v_name;
		end if;
	end loop;

	select c.column_default, c.is_nullable into v_default, v_nullable
	from information_schema.columns c
	where c.table_schema = 'public' and c.table_name = 'app_feedback' and c.column_name = 'horizon';
	if v_nullable is null then
		raise exception '0230: app_feedback.horizon is missing.';
	end if;
	if v_nullable <> 'NO' or coalesce(v_default, '') not like '''now''%' then
		raise exception '0230: app_feedback.horizon must be NOT NULL with default now (found nullable %, default %).', v_nullable, v_default;
	end if;
	if has_table_privilege('authenticated', 'public.app_feedback', 'update')
		or has_table_privilege('anon', 'public.app_feedback', 'update') then
		raise exception '0230: a client role can update app_feedback; set_horizon must be the only switch.';
	end if;

	select count(*) into v_settings from public.foundry_site_settings;
	if v_settings <> 1 then
		raise exception '0230: foundry_site_settings holds % row(s); it must hold exactly one.', v_settings;
	end if;

	select count(*), count(*) filter (where q.is_trick) into v_questions, v_tricks
	from public.foundry_publisher_questions q;
	if v_questions < 6 or v_tricks < 2 then
		raise exception '0230: the publisher questions hold % row(s) with % trick(s); the seed needs 6 and 2.', v_questions, v_tricks;
	end if;

	raise notice '0230: quick posts %, quick post targets %',
		(select count(*) from public.classroom_quick_posts),
		(select count(*) from public.classroom_quick_post_sections);
	raise notice '0230: Foundry is %; publisher questions % (% trick, % active); applications % (% pending); game requests %',
		case when public._foundry_site_closed() then 'OFF' else 'on' end,
		v_questions, v_tricks,
		(select count(*) from public.foundry_publisher_questions q where q.active),
		(select count(*) from public.foundry_publisher_applications),
		(select count(*) from public.foundry_publisher_applications a where a.status = 'pending'),
		(select count(*) from public.foundry_game_requests);
	raise notice '0230: % client function(s), % definer-only, % table(s) checked; anon executes none of them.',
		cardinality(v_public_fns), cardinality(v_private_fns), cardinality(v_tables);
end;
$chk$;
