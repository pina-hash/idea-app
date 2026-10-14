-- 0238_progressive_feedback.sql
--
-- PROGRESSIVE FEEDBACK, AND THE REPAIR OF A FINISHED WORKSHEET (ledger 0381).
-- Three parts, each marked BEGIN and END; every one is additive and
-- idempotent, and the file applies whole or not at all.
--
--   A. Progressive feedback (report 6b814ca1, Mr. Pina 2026-10-08, built on
--      his answers of 2026-10-14, decision 60): an instructor writes a note on
--      a student's ported worksheet while the student is still working, on one
--      block or on the whole worksheet, and may draw on a picture the student
--      handed in. The student sees it within seconds, may answer back and
--      press Fixed it; the instructor sees when it was read, answers, resolves
--      or reopens, and manages every thread from one place.
--   B. A finished worksheet that read Missing after its manifest changed
--      (report e32659e9, the half 0237 left open): the manifests a worksheet
--      used to have, so a student is judged against the worksheet they
--      actually finished, and a manager's stamp of that completion.
--   C. The presence heartbeat answers when the caller's feedback last moved,
--      so the item page learns of a new note without one more poll.
--
-- BACKWARD COMPATIBLE. No existing function changes its argument list, so the
-- SIGNATURE TRAP does not arise. The one function re-created in place is
-- classroom_presence_ping (0200), copied byte for byte with two marked lines
-- added to its two returns; every other object is new. Every new table has row
-- level security on and no client grant; every new function revokes from
-- public, anon, authenticated and service_role by name and grants back only to
-- authenticated (0166's shape). No row of an existing table is written.
--
-- DEPLOY ORDER: none. The client degrades past every object here (a missing
-- function or relation reads as "not available yet"), so the deploy and this
-- apply are independent events and either may go first.
--
-- UNDO, by part, for a person's paste: A: drop the classroom_feedback_*
-- functions, the _classroom_feedback_* helpers, then the two tables
-- (messages first). B: drop classroom_worksheet_past_manifests and
-- classroom_worksheet_latch_for. C: re-run 0200's classroom_presence_ping.
-- Nothing is deleted from a table that existed before this file.

-- ===== PART A BEGIN =====
-- ===== PART A: PROGRESSIVE FEEDBACK =====
--
-- A THREAD is one note on one student's work on one assignment: optionally on
-- one block (block_id, the manifest's own permanent id) and optionally on one
-- handed-in file (file_id) with a drawing over it (marks). Its MESSAGES are the
-- conversation: the instructor's note first, then answers from either side.
--
-- WHO MAY DO WHAT, and every gate is an existing predicate:
--   * an instructor is anybody classroom_can_review_submission (0086) admits
--     for that item and that student: they post, answer, edit the note and
--     its drawing, resolve, reopen and remove;
--   * the student is the thread's own student_email, while they can still
--     read the item (classroom_can_read_item): they read, answer and press
--     Fixed it, and nobody else's thread is ever theirs to see.
-- "Not found" and "not yours" answer identically, so an id cannot be probed.
--
-- THE TABLES CARRY NO CLIENT GRANT AND NO POLICY. Every read and write is a
-- SECURITY DEFINER function below, so a student's payload is shaped inside the
-- database: it never carries another student's thread, and a removed message
-- never leaves it.
--
-- A DRAWING IS VECTOR DATA, NEVER PIXELS. marks is a closed shape
-- (_classroom_feedback_marks_ok): shapes of five kinds, six colours and three
-- widths, every coordinate a whole number from 0 to 10000 across the picture's
-- own width and height, so the drawing lands on the same spot of the picture at
-- any size it is shown. No image is stored and no URL is accepted.
--
-- NOTHING IS DELETED. Removing a thread or a message stamps removed_at, and
-- every read leaves it out; a note is part of how a piece of work was graded.

create table if not exists public.classroom_feedback_threads (
	id uuid primary key default gen_random_uuid(),
	item_id uuid not null references public.classroom_items (id) on delete cascade,
	student_email text not null
		check (student_email = lower(btrim(student_email)) and student_email like '%@%'),
	block_id text check (block_id is null or block_id ~ '^[A-Za-z0-9_-]{1,40}$'),
	file_id uuid references public.classroom_submission_files (id) on delete set null,
	marks jsonb,
	author_id uuid not null,
	created_at timestamptz not null default now(),
	-- Moves on every change a reader should notice: a message, an edit, a state.
	-- Never on a "seen" stamp, so reading a thread cannot look like news.
	updated_at timestamptz not null default now(),
	edited_at timestamptz,
	fixed_at timestamptz,
	resolved_at timestamptz,
	student_seen_at timestamptz,
	teacher_seen_at timestamptz,
	removed_at timestamptz
);

create index if not exists classroom_feedback_threads_item_student_idx
	on public.classroom_feedback_threads (item_id, student_email);
create index if not exists classroom_feedback_threads_updated_idx
	on public.classroom_feedback_threads (updated_at desc);

create table if not exists public.classroom_feedback_messages (
	id uuid primary key default gen_random_uuid(),
	thread_id uuid not null references public.classroom_feedback_threads (id) on delete cascade,
	author_role text not null check (author_role in ('teacher', 'student')),
	author_id uuid not null,
	body text not null check (char_length(body) between 1 and 2000),
	created_at timestamptz not null default now(),
	edited_at timestamptz,
	removed_at timestamptz
);

create index if not exists classroom_feedback_messages_thread_idx
	on public.classroom_feedback_messages (thread_id, created_at);
create index if not exists classroom_feedback_messages_author_idx
	on public.classroom_feedback_messages (author_id, created_at desc);

alter table public.classroom_feedback_threads enable row level security;
alter table public.classroom_feedback_messages enable row level security;
revoke all on public.classroom_feedback_threads from public, anon, authenticated;
revoke all on public.classroom_feedback_messages from public, anon, authenticated;

-- What a person typed, with whitespace trimmed at both ends the way a person
-- means "empty" (CLAUDE.md: btrim strips spaces only, so it is not used).
create or replace function public._classroom_feedback_norm(p text)
returns text
language sql
immutable
set search_path = ''
as $f$
	select regexp_replace(coalesce(p, ''), '^\s+|\s+$', '', 'g');
$f$;

-- THE CLOSED SHAPE OF A DRAWING. Every refusal is a plain false; a NULL is
-- never returned for a non-null input, because a gate that can answer NULL
-- accepts the write (CLAUDE.md, SQL traps).
create or replace function public._classroom_feedback_marks_ok(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $f$
declare
	v_shape jsonb;
	v_kind text;
	v_n integer;
	v_total integer := 0;
begin
	if p is null then
		return true;
	end if;
	if jsonb_typeof(p) is distinct from 'object' then
		return false;
	end if;
	if exists (select 1 from jsonb_object_keys(p) k where k not in ('v', 'shapes')) then
		return false;
	end if;
	if (p -> 'v') is distinct from '1'::jsonb then
		return false;
	end if;
	if jsonb_typeof(p -> 'shapes') is distinct from 'array' then
		return false;
	end if;
	if jsonb_array_length(p -> 'shapes') > 200 then
		return false;
	end if;
	for v_shape in select e from jsonb_array_elements(p -> 'shapes') e loop
		if jsonb_typeof(v_shape) is distinct from 'object' then
			return false;
		end if;
		if exists (select 1 from jsonb_object_keys(v_shape) k where k not in ('t', 'c', 'w', 'p', 's')) then
			return false;
		end if;
		if jsonb_typeof(v_shape -> 't') is distinct from 'string' then
			return false;
		end if;
		v_kind := v_shape ->> 't';
		if v_kind not in ('pen', 'arrow', 'box', 'ellipse', 'text') then
			return false;
		end if;
		if jsonb_typeof(v_shape -> 'c') is distinct from 'string'
			or (v_shape ->> 'c') not in ('red', 'yellow', 'green', 'blue', 'white', 'black') then
			return false;
		end if;
		if (v_shape -> 'w') is distinct from '1'::jsonb
			and (v_shape -> 'w') is distinct from '2'::jsonb
			and (v_shape -> 'w') is distinct from '3'::jsonb then
			return false;
		end if;
		if jsonb_typeof(v_shape -> 'p') is distinct from 'array' then
			return false;
		end if;
		v_n := jsonb_array_length(v_shape -> 'p');
		if v_n % 2 <> 0 then
			return false;
		end if;
		if v_kind = 'pen' and (v_n < 4 or v_n > 4000) then
			return false;
		end if;
		if v_kind in ('arrow', 'box', 'ellipse') and v_n <> 4 then
			return false;
		end if;
		if v_kind = 'text' then
			if v_n <> 2 or jsonb_typeof(v_shape -> 's') is distinct from 'string' then
				return false;
			end if;
			if not coalesce(char_length(public._classroom_feedback_norm(v_shape ->> 's')) between 1 and 80, false) then
				return false;
			end if;
		elsif v_shape ? 's' then
			return false;
		end if;
		if exists (
			select 1
			from jsonb_array_elements(v_shape -> 'p') e
			where jsonb_typeof(e) is distinct from 'number'
				or (e #>> '{}')::numeric <> trunc((e #>> '{}')::numeric)
				or (e #>> '{}')::numeric < 0
				or (e #>> '{}')::numeric > 10000
		) then
			return false;
		end if;
		v_total := v_total + v_n;
	end loop;
	return v_total <= 20000;
end;
$f$;

do $c$
begin
	if not exists (
		select 1 from pg_constraint
		where conname = 'classroom_feedback_threads_marks_ok'
			and conrelid = 'public.classroom_feedback_threads'::regclass
	) then
		alter table public.classroom_feedback_threads
			add constraint classroom_feedback_threads_marks_ok
			check (public._classroom_feedback_marks_ok(marks));
	end if;
end $c$;

-- The name a reader sees for a person: their chosen display name, else their
-- full name, never their address (the foundryAuthorName rule).
create or replace function public._classroom_feedback_person(p_user uuid, p_fallback text)
returns text
language sql
stable
security definer
set search_path = ''
as $f$
	select coalesce(
		(select coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.full_name), ''))
		 from public.profiles p where p.id = p_user),
		p_fallback
	);
$f$;

-- Which side of a thread the caller is on, or null for neither.
create or replace function public._classroom_feedback_role(p_item_id uuid, p_student_email text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_email text := public.current_user_email();
begin
	if (select auth.uid()) is null or coalesce(v_email, '') = '' then
		return null;
	end if;
	if v_email = p_student_email then
		return case when public.classroom_can_read_item(p_item_id) then 'student' end;
	end if;
	if public.classroom_can_review_submission(p_item_id, p_student_email) then
		return 'teacher';
	end if;
	return null;
end;
$f$;

-- One thread as a reader receives it. The student's address is the student's
-- own on their side and the roster key on an instructor's; a message author is
-- a name, never an address; a removed message is not in the list.
create or replace function public._classroom_feedback_thread_json(p_thread public.classroom_feedback_threads, p_role text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $f$
	select jsonb_build_object(
		'id', p_thread.id,
		'item_id', p_thread.item_id,
		'item_title', (select i.title from public.classroom_items i where i.id = p_thread.item_id),
		'student_email', p_thread.student_email,
		'student_name', coalesce(
			(select e.display_name from public.classroom_enrollments e
			 where e.student_email = p_thread.student_email
			 order by e.active desc, e.created_at limit 1),
			split_part(p_thread.student_email, '@', 1)
		),
		'block_id', p_thread.block_id,
		'file_id', p_thread.file_id,
		'marks', p_thread.marks,
		'author_name', public._classroom_feedback_person(p_thread.author_id, 'Your teacher'),
		'created_at', p_thread.created_at,
		'updated_at', p_thread.updated_at,
		'edited_at', p_thread.edited_at,
		'fixed_at', p_thread.fixed_at,
		'resolved_at', p_thread.resolved_at,
		'student_seen_at', p_thread.student_seen_at,
		'teacher_seen_at', p_thread.teacher_seen_at,
		'viewer', p_role,
		-- The classes this instructor could open the work in, for a link; an
		-- empty list on the student's side.
		'sections', case when p_role = 'teacher' then coalesce((
			select jsonb_agg(distinct pg.section_id)
			from public.classroom_postings pg
			join public.classroom_enrollments e
				on e.section_id = pg.section_id and e.student_email = p_thread.student_email
			where pg.item_id = p_thread.item_id
				and public.classroom_manages_section(pg.section_id)
		), '[]'::jsonb) else '[]'::jsonb end,
		'messages', coalesce((
			select jsonb_agg(jsonb_build_object(
				'id', m.id,
				'role', m.author_role,
				'name', case
					when m.author_role = 'teacher' then public._classroom_feedback_person(m.author_id, 'Your teacher')
					else coalesce(
						(select e.display_name from public.classroom_enrollments e
						 where e.student_email = p_thread.student_email
						 order by e.active desc, e.created_at limit 1),
						public._classroom_feedback_person(m.author_id, 'Student')
					)
				end,
				'body', m.body,
				'created_at', m.created_at,
				'edited_at', m.edited_at,
				'mine', m.author_id = (select auth.uid())
			) order by m.created_at, m.id)
			from public.classroom_feedback_messages m
			where m.thread_id = p_thread.id and m.removed_at is null
		), '[]'::jsonb)
	);
$f$;

-- AN INSTRUCTOR STARTS A THREAD. A refusal is structured, because the console
-- shows it where the instructor was typing.
create or replace function public.classroom_feedback_post(
	p_item_id uuid,
	p_student_email text,
	p_block_id text,
	p_file_id uuid,
	p_body text,
	p_marks jsonb
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_uid uuid := (select auth.uid());
	v_email text := lower(btrim(coalesce(p_student_email, '')));
	v_body text := public._classroom_feedback_norm(p_body);
	v_manifest jsonb;
	v_thread public.classroom_feedback_threads;
begin
	if v_uid is null then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if public._classroom_feedback_role(p_item_id, v_email) is distinct from 'teacher' then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if p_block_id is not null then
		if p_block_id !~ '^[A-Za-z0-9_-]{1,40}$' then
			return jsonb_build_object('ok', false, 'reason', 'block');
		end if;
		v_manifest := public._classroom_html_manifest(p_item_id);
		if v_manifest is not null and public._classroom_html_block(v_manifest, p_block_id) is null then
			return jsonb_build_object('ok', false, 'reason', 'block');
		end if;
	end if;
	if char_length(v_body) > 2000 then
		return jsonb_build_object('ok', false, 'reason', 'too_long', 'limit', 2000);
	end if;
	if not public._classroom_feedback_marks_ok(p_marks) then
		return jsonb_build_object('ok', false, 'reason', 'marks');
	end if;
	if p_marks is not null and p_file_id is null then
		return jsonb_build_object('ok', false, 'reason', 'file');
	end if;
	if p_file_id is not null and not exists (
		select 1
		from public.classroom_submission_files f
		join public.classroom_submissions s on s.id = f.submission_id
		where f.id = p_file_id and s.item_id = p_item_id and s.student_email = v_email
	) then
		return jsonb_build_object('ok', false, 'reason', 'file');
	end if;
	if v_body = '' and coalesce(jsonb_array_length(p_marks -> 'shapes'), 0) = 0 then
		return jsonb_build_object('ok', false, 'reason', 'empty');
	end if;

	insert into public.classroom_feedback_threads as t (
		item_id, student_email, block_id, file_id, marks, author_id, teacher_seen_at
	)
	values (
		p_item_id, v_email, p_block_id, p_file_id,
		case when coalesce(jsonb_array_length(p_marks -> 'shapes'), 0) = 0 then null else p_marks end,
		v_uid, now()
	)
	returning * into v_thread;

	if v_body <> '' then
		insert into public.classroom_feedback_messages (thread_id, author_role, author_id, body)
		values (v_thread.id, 'teacher', v_uid, v_body);
	end if;

	return jsonb_build_object('ok', true, 'thread', public._classroom_feedback_thread_json(v_thread, 'teacher'));
end;
$f$;

-- EITHER SIDE ANSWERS. A student is held to sixty messages an hour, which no
-- conversation about one worksheet reaches and a stuck key would.
create or replace function public.classroom_feedback_reply(p_thread_id uuid, p_body text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_uid uuid := (select auth.uid());
	v_body text := public._classroom_feedback_norm(p_body);
	v_thread public.classroom_feedback_threads;
	v_role text;
begin
	select * into v_thread
	from public.classroom_feedback_threads t
	where t.id = p_thread_id and t.removed_at is null
	for update;
	if not found or v_uid is null then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	v_role := public._classroom_feedback_role(v_thread.item_id, v_thread.student_email);
	if v_role is null then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if v_body = '' then
		return jsonb_build_object('ok', false, 'reason', 'empty');
	end if;
	if char_length(v_body) > 2000 then
		return jsonb_build_object('ok', false, 'reason', 'too_long', 'limit', 2000);
	end if;
	if v_role = 'student' and (
		select count(*) from public.classroom_feedback_messages m
		where m.author_id = v_uid and m.created_at > now() - interval '1 hour'
	) >= 60 then
		return jsonb_build_object('ok', false, 'reason', 'rate');
	end if;

	insert into public.classroom_feedback_messages (thread_id, author_role, author_id, body)
	values (v_thread.id, v_role, v_uid, v_body);

	update public.classroom_feedback_threads t
	set updated_at = now(),
		student_seen_at = case when v_role = 'student' then now() else t.student_seen_at end,
		teacher_seen_at = case when v_role = 'teacher' then now() else t.teacher_seen_at end
	where t.id = v_thread.id
	returning * into v_thread;

	return jsonb_build_object('ok', true, 'thread', public._classroom_feedback_thread_json(v_thread, v_role));
end;
$f$;

-- AN INSTRUCTOR CHANGES THE NOTE OR ITS DRAWING. The note is the thread's
-- first instructor message; a thread that was a drawing alone gains one. Both
-- arguments null leaves that half as it is; an empty drawing clears it.
create or replace function public.classroom_feedback_update(p_thread_id uuid, p_body text, p_marks jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_uid uuid := (select auth.uid());
	v_thread public.classroom_feedback_threads;
	v_body text := case when p_body is null then null else public._classroom_feedback_norm(p_body) end;
	v_first uuid;
	v_marks jsonb;
begin
	select * into v_thread
	from public.classroom_feedback_threads t
	where t.id = p_thread_id and t.removed_at is null
	for update;
	if not found or public._classroom_feedback_role(v_thread.item_id, v_thread.student_email) is distinct from 'teacher' then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if v_body is not null and char_length(v_body) > 2000 then
		return jsonb_build_object('ok', false, 'reason', 'too_long', 'limit', 2000);
	end if;
	if not public._classroom_feedback_marks_ok(p_marks) then
		return jsonb_build_object('ok', false, 'reason', 'marks');
	end if;
	if p_marks is not null and v_thread.file_id is null then
		return jsonb_build_object('ok', false, 'reason', 'file');
	end if;
	v_marks := case
		when p_marks is null then v_thread.marks
		when coalesce(jsonb_array_length(p_marks -> 'shapes'), 0) = 0 then null
		else p_marks
	end;

	select m.id into v_first
	from public.classroom_feedback_messages m
	where m.thread_id = v_thread.id and m.author_role = 'teacher' and m.removed_at is null
	order by m.created_at, m.id
	limit 1;

	if v_body is not null then
		if v_body = '' and v_marks is null then
			return jsonb_build_object('ok', false, 'reason', 'empty');
		end if;
		if v_first is not null then
			if v_body = '' then
				update public.classroom_feedback_messages set removed_at = now() where id = v_first;
			else
				update public.classroom_feedback_messages
				set body = v_body, edited_at = now()
				where id = v_first and body is distinct from v_body;
			end if;
		elsif v_body <> '' then
			insert into public.classroom_feedback_messages (thread_id, author_role, author_id, body)
			values (v_thread.id, 'teacher', v_uid, v_body);
		end if;
	end if;

	update public.classroom_feedback_threads t
	set marks = v_marks, updated_at = now(), edited_at = now(), teacher_seen_at = now()
	where t.id = v_thread.id
	returning * into v_thread;

	return jsonb_build_object('ok', true, 'thread', public._classroom_feedback_thread_json(v_thread, 'teacher'));
end;
$f$;

-- FIXED IT, RESOLVED AND REOPENED. The student says fixed (or takes it back);
-- the instructor resolves, or reopens, which also clears a stale Fixed it.
create or replace function public.classroom_feedback_set_state(p_thread_id uuid, p_state text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_thread public.classroom_feedback_threads;
	v_role text;
begin
	select * into v_thread
	from public.classroom_feedback_threads t
	where t.id = p_thread_id and t.removed_at is null
	for update;
	if not found then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	v_role := public._classroom_feedback_role(v_thread.item_id, v_thread.student_email);
	if v_role is null then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if v_role = 'student' and p_state = 'fixed' then
		update public.classroom_feedback_threads t
		set fixed_at = coalesce(t.fixed_at, now()), updated_at = now(), student_seen_at = now()
		where t.id = v_thread.id returning * into v_thread;
	elsif v_role = 'student' and p_state = 'open' then
		update public.classroom_feedback_threads t
		set fixed_at = null, updated_at = now(), student_seen_at = now()
		where t.id = v_thread.id returning * into v_thread;
	elsif v_role = 'teacher' and p_state = 'resolved' then
		update public.classroom_feedback_threads t
		set resolved_at = coalesce(t.resolved_at, now()), updated_at = now(), teacher_seen_at = now()
		where t.id = v_thread.id returning * into v_thread;
	elsif v_role = 'teacher' and p_state = 'open' then
		update public.classroom_feedback_threads t
		set resolved_at = null, fixed_at = null, updated_at = now(), teacher_seen_at = now()
		where t.id = v_thread.id returning * into v_thread;
	else
		return jsonb_build_object('ok', false, 'reason', 'state');
	end if;
	return jsonb_build_object('ok', true, 'thread', public._classroom_feedback_thread_json(v_thread, v_role));
end;
$f$;

-- REMOVING. A message by its own author or by an instructor; a whole thread by
-- an instructor. Stamped, never deleted.
create or replace function public.classroom_feedback_remove(p_thread_id uuid, p_message_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_uid uuid := (select auth.uid());
	v_thread public.classroom_feedback_threads;
	v_role text;
	v_n integer;
begin
	select * into v_thread
	from public.classroom_feedback_threads t
	where t.id = p_thread_id and t.removed_at is null
	for update;
	if not found or v_uid is null then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	v_role := public._classroom_feedback_role(v_thread.item_id, v_thread.student_email);
	if v_role is null then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if p_message_id is null then
		if v_role <> 'teacher' then
			return jsonb_build_object('ok', false, 'reason', 'not_found');
		end if;
		update public.classroom_feedback_threads t
		set removed_at = now(), updated_at = now()
		where t.id = v_thread.id;
		return jsonb_build_object('ok', true, 'removed', 'thread');
	end if;
	update public.classroom_feedback_messages m
	set removed_at = now()
	where m.id = p_message_id
		and m.thread_id = v_thread.id
		and m.removed_at is null
		and (v_role = 'teacher' or m.author_id = v_uid);
	get diagnostics v_n = row_count;
	if v_n = 0 then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	update public.classroom_feedback_threads t set updated_at = now() where t.id = v_thread.id
	returning * into v_thread;
	return jsonb_build_object('ok', true, 'thread', public._classroom_feedback_thread_json(v_thread, v_role));
end;
$f$;

-- SEEN. The student's side stamps their own threads on one item; an
-- instructor's stamps one student's (or, with no student, every thread on the
-- item they review). Never moves updated_at.
create or replace function public.classroom_feedback_seen(p_item_id uuid, p_student_email text default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_email text := public.current_user_email();
	v_target text := lower(btrim(coalesce(p_student_email, '')));
	v_n integer := 0;
begin
	if (select auth.uid()) is null or coalesce(v_email, '') = '' then
		return 0;
	end if;
	if v_target = '' or v_target = v_email then
		update public.classroom_feedback_threads t
		set student_seen_at = now()
		where t.item_id = p_item_id
			and t.student_email = v_email
			and t.removed_at is null
			and (t.student_seen_at is null or t.student_seen_at < t.updated_at)
			and public.classroom_can_read_item(p_item_id);
		get diagnostics v_n = row_count;
		return v_n;
	end if;
	update public.classroom_feedback_threads t
	set teacher_seen_at = now()
	where t.item_id = p_item_id
		and t.student_email = v_target
		and t.removed_at is null
		and (t.teacher_seen_at is null or t.teacher_seen_at < t.updated_at)
		and public.classroom_can_review_submission(p_item_id, v_target);
	get diagnostics v_n = row_count;
	return v_n;
end;
$f$;

-- THE ONE READ, for both sides and for the instructor's single place to manage
-- everything from. A student receives their own threads (on one item, or on
-- every item when none is named); an instructor receives the threads of every
-- student they review, narrowed by item, student or class. Newest activity
-- first, at most 500.
create or replace function public.classroom_feedback_list(
	p_item_id uuid default null,
	p_student_email text default null,
	p_section_id uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_email text := public.current_user_email();
	v_target text := nullif(lower(btrim(coalesce(p_student_email, ''))), '');
begin
	if (select auth.uid()) is null or coalesce(v_email, '') = '' then
		return '[]'::jsonb;
	end if;
	return coalesce((
		select jsonb_agg(x.j order by x.updated_at desc, x.id)
		from (
			select t.id, t.updated_at, public._classroom_feedback_thread_json(t, r.role) as j
			from public.classroom_feedback_threads t
			cross join lateral (
				select public._classroom_feedback_role(t.item_id, t.student_email) as role
			) r
			where t.removed_at is null
				and (p_item_id is null or t.item_id = p_item_id)
				and (v_target is null or t.student_email = v_target)
				and r.role is not null
				and (
					p_section_id is null
					or exists (
						select 1
						from public.classroom_postings pg
						join public.classroom_enrollments e
							on e.section_id = pg.section_id and e.student_email = t.student_email
						where pg.item_id = t.item_id and pg.section_id = p_section_id
					)
				)
			order by t.updated_at desc, t.id
			limit 500
		) x
	), '[]'::jsonb);
end;
$f$;

revoke all on function public._classroom_feedback_norm(text) from public, anon, authenticated, service_role;
revoke all on function public._classroom_feedback_marks_ok(jsonb) from public, anon, authenticated, service_role;
revoke all on function public._classroom_feedback_person(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public._classroom_feedback_role(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public._classroom_feedback_thread_json(public.classroom_feedback_threads, text) from public, anon, authenticated, service_role;

revoke all on function public.classroom_feedback_post(uuid, text, text, uuid, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.classroom_feedback_post(uuid, text, text, uuid, text, jsonb) to authenticated;
revoke all on function public.classroom_feedback_reply(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.classroom_feedback_reply(uuid, text) to authenticated;
revoke all on function public.classroom_feedback_update(uuid, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.classroom_feedback_update(uuid, text, jsonb) to authenticated;
revoke all on function public.classroom_feedback_set_state(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.classroom_feedback_set_state(uuid, text) to authenticated;
revoke all on function public.classroom_feedback_remove(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.classroom_feedback_remove(uuid, uuid) to authenticated;
revoke all on function public.classroom_feedback_seen(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.classroom_feedback_seen(uuid, text) to authenticated;
revoke all on function public.classroom_feedback_list(uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.classroom_feedback_list(uuid, text, uuid) to authenticated;
-- ===== PART A END =====

-- ===== PART B BEGIN =====
-- ===== PART B: A FINISHED WORKSHEET IS JUDGED AGAINST THE WORKSHEET IT WAS =====
--
-- 0237's latch keeps a completion from the moment a student's own load finds
-- it, so it protects every finish FROM THEN ON. It could not repair a student
-- who had finished before the manifest grew: today's derivation calls them
-- incomplete, so nothing ever stamps them (report e32659e9, the case Mr. Pina
-- filed). The worksheet's earlier manifests are already kept, as
-- classroom_content_revisions rows of target html_assignment, each stamped with
-- the moment a later upload DISPLACED it (0110's header), which is exactly the
-- "until" a completion has to fall before. This hands them to anybody who can
-- read the item -- a manifest is not secret, the student's own frame carries it
-- -- so the student's load and a manager's can judge a finish against the
-- worksheet it was.

create or replace function public.classroom_worksheet_past_manifests(p_item_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $f$
	select coalesce(jsonb_agg(jsonb_build_object(
		'item_id', r.item_id, 'manifest', r.manifest, 'until', r.created_at
	) order by r.item_id, r.revision desc), '[]'::jsonb)
	from (
		select r.item_id, r.revision, r.created_at, r.payload -> 'manifest' as manifest,
			row_number() over (partition by r.item_id order by r.revision desc) as n
		from public.classroom_content_revisions r
		where r.target = 'html_assignment'
			and r.item_id = any (coalesce(p_item_ids, '{}'::uuid[]))
			and jsonb_typeof(r.payload -> 'manifest') = 'object'
			and public.classroom_can_read_item(r.item_id)
	) r
	where r.n <= 20;
$f$;

-- A MANAGER STAMPS A STUDENT'S FINISH, which the grading console and the live
-- class judge from the answers they already hold, so a finish found on a
-- teacher's screen reaches the student's own surfaces and the Grades tab too.
-- The same refusals as the student's own stamp, and "not yours" reads as false.
create or replace function public.classroom_worksheet_latch_for(
	p_item_id uuid,
	p_student_email text,
	p_completed_at timestamptz default null
) returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_email text := lower(btrim(coalesce(p_student_email, '')));
	v_at timestamptz := least(coalesce(p_completed_at, now()), now());
	v_n integer;
begin
	if (select auth.uid()) is null or not public.classroom_can_review_submission(p_item_id, v_email) then
		return false;
	end if;
	if public._classroom_html_manifest(p_item_id) is null then
		return false;
	end if;
	if not exists (
		select 1 from public.classroom_responses r
		where r.item_id = p_item_id and r.student_email = v_email
	) and not exists (
		select 1 from public.classroom_submissions s
		where s.item_id = p_item_id and s.student_email = v_email
	) then
		return false;
	end if;
	insert into public.classroom_worksheet_latches (item_id, student_email, completed_at)
	values (p_item_id, v_email, v_at)
	on conflict (item_id, student_email) do nothing;
	get diagnostics v_n = row_count;
	return v_n > 0;
end;
$f$;

revoke all on function public.classroom_worksheet_past_manifests(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.classroom_worksheet_past_manifests(uuid[]) to authenticated;
revoke all on function public.classroom_worksheet_latch_for(uuid, text, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.classroom_worksheet_latch_for(uuid, text, timestamptz) to authenticated;
-- ===== PART B END =====

-- ===== PART C BEGIN =====
-- ===== PART C: THE HEARTBEAT SAYS WHEN THE CALLER'S FEEDBACK LAST MOVED =====
--
-- The item page's call budget is spent (tests/classroom-poll.test.ts holds a
-- student's steady state at exactly half of what it was), so a note must not
-- arrive by one more poll. The page already beats; the beat now answers the
-- latest updated_at among the caller's live threads on that item, and the page
-- re-reads the threads when that moves. 0200's body, copied, with the two
-- returns each gaining the one marked key.

create or replace function public.classroom_presence_ping(
	p_item_id uuid,
	p_typed boolean default false,
	p_page_visible boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
	v_email text := public._classroom_engine_student(p_item_id);
	v_now timestamptz := now();
	v_typed boolean := coalesce(p_typed, false);
	v_visible boolean := coalesce(p_page_visible, true);
	v_last_seen timestamptz;
	v_credit integer := 0;
	v_active integer;
	v_purged integer := 0;
	-- 0238: when this student's feedback on this item last moved.
	v_feedback timestamptz := (
		select max(t.updated_at) from public.classroom_feedback_threads t
		where t.item_id = p_item_id and t.student_email = v_email and t.removed_at is null
	);
begin
	select p.last_seen_at into v_last_seen
	from public.classroom_presence p
	where p.item_id = p_item_id and p.student_email = v_email;

	-- THE RATE LIMIT IS HERE AND NOT IN THE BROWSER. Nothing is written and
	-- nothing is credited; the caller is told it was heard and ignored.
	if v_last_seen is not null
		and v_now - v_last_seen < public._classroom_presence_min_gap() then
		return jsonb_build_object('ok', true, 'throttled', true,
			'feedback_at', v_feedback); -- 0238
	end if;

	if v_last_seen is not null and v_typed and v_visible then
		v_credit := greatest(
			0,
			floor(extract(epoch from least(
				v_now - v_last_seen,
				public._classroom_presence_credit_cap()
			)))::integer
		);
	end if;

	-- ON CONFLICT PLUS THE RETURNING, NOT SELECT-THEN-INSERT. Two tabs of one
	-- student beating in the same second are serialized by the primary key
	-- rather than racing a read (the 0134 lesson): the loser's insert becomes
	-- the update arm and credits against whatever the winner just wrote.
	insert into public.classroom_presence as p (
		item_id, student_email, first_seen_at, last_seen_at, last_input_at,
		page_visible, active_seconds
	)
	values (
		p_item_id, v_email, v_now, v_now,
		case when v_typed then v_now end,
		v_visible, 0
	)
	on conflict (item_id, student_email) do update set
		last_seen_at = v_now,
		last_input_at = case when v_typed then v_now else p.last_input_at end,
		page_visible = v_visible,
		active_seconds = p.active_seconds + v_credit
	returning p.active_seconds into v_active;

	-- THE OPPORTUNISTIC SWEEP, BOUNDED, ON THE PATH THAT ALREADY WROTE. A
	-- throttled beat returns above and never reaches this, so the sweep runs at
	-- most once per student per 20 seconds per assignment and deletes at most 50
	-- rows when it does.
	v_purged := public._classroom_presence_purge_before(
		v_now - public._classroom_presence_retention(),
		public._classroom_presence_purge_batch()
	);

	return jsonb_build_object(
		'ok', true,
		'throttled', false,
		'credited_seconds', v_credit,
		'active_seconds', v_active,
		'purged', v_purged,
		'feedback_at', v_feedback -- 0238
	);
end;
$fn$;

revoke all on function public.classroom_presence_ping(uuid, boolean, boolean)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_presence_ping(uuid, boolean, boolean) to authenticated;
-- ===== PART C END =====

-- ===== PART Z BEGIN =====
-- ===== SELF-CHECK (kept last) =====
-- Asserts the end state of this file's OWN objects and nothing about anyone
-- else's: every function it creates or replaces that a client calls is closed
-- to anon and open to authenticated; every private helper is closed to both;
-- both tables have row level security on and no client grant; the drawing
-- gate refuses a NULL-shaped trick and accepts a real drawing. A failure
-- raises, and the file rolls back whole.
do $z$
declare
	v_fn text;
	v_tbl text;
	v_bad text[] := '{}';
	v_oid oid;
begin
	foreach v_fn in array array[
		'classroom_feedback_post(uuid, text, text, uuid, text, jsonb)',
		'classroom_feedback_reply(uuid, text)',
		'classroom_feedback_update(uuid, text, jsonb)',
		'classroom_feedback_set_state(uuid, text)',
		'classroom_feedback_remove(uuid, uuid)',
		'classroom_feedback_seen(uuid, text)',
		'classroom_feedback_list(uuid, text, uuid)',
		'classroom_worksheet_past_manifests(uuid[])',
		'classroom_worksheet_latch_for(uuid, text, timestamptz)',
		'classroom_presence_ping(uuid, boolean, boolean)'
	] loop
		v_oid := to_regprocedure('public.' || v_fn);
		if v_oid is null then
			v_bad := v_bad || (v_fn || ' is missing');
		else
			if has_function_privilege('anon', v_oid, 'execute') then
				v_bad := v_bad || (v_fn || ' is executable by anon');
			end if;
			if not has_function_privilege('authenticated', v_oid, 'execute') then
				v_bad := v_bad || (v_fn || ' is not executable by authenticated');
			end if;
		end if;
	end loop;

	foreach v_fn in array array[
		'_classroom_feedback_norm(text)',
		'_classroom_feedback_marks_ok(jsonb)',
		'_classroom_feedback_person(uuid, text)',
		'_classroom_feedback_role(uuid, text)',
		'_classroom_feedback_thread_json(public.classroom_feedback_threads, text)'
	] loop
		v_oid := to_regprocedure('public.' || v_fn);
		if v_oid is null then
			v_bad := v_bad || (v_fn || ' is missing');
		elsif has_function_privilege('anon', v_oid, 'execute')
			or has_function_privilege('authenticated', v_oid, 'execute') then
			v_bad := v_bad || (v_fn || ' is executable by a client');
		end if;
	end loop;

	foreach v_tbl in array array['classroom_feedback_threads', 'classroom_feedback_messages'] loop
		if not exists (
			select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
			where n.nspname = 'public' and c.relname = v_tbl and c.relrowsecurity
		) then
			v_bad := v_bad || (v_tbl || ' has no row level security');
		end if;
		if has_table_privilege('anon', 'public.' || v_tbl, 'select,insert,update,delete')
			or has_table_privilege('authenticated', 'public.' || v_tbl, 'select,insert,update,delete') then
			v_bad := v_bad || (v_tbl || ' carries a client grant');
		end if;
	end loop;

	if public._classroom_feedback_marks_ok('{"v":1,"shapes":[{"t":"text","c":"red","w":2,"p":[10,10]}]}'::jsonb) is distinct from false then
		v_bad := v_bad || 'a text mark with no words was not refused';
	end if;
	if public._classroom_feedback_marks_ok('{"v":1,"shapes":[{"t":"pen","c":"red","w":2,"p":[0,0,10000,10000]}]}'::jsonb) is distinct from true then
		v_bad := v_bad || 'a plain pen stroke was refused';
	end if;

	if array_length(v_bad, 1) is not null then
		raise exception '0238 self-check refused: %', array_to_string(v_bad, '; ');
	end if;
	raise notice '0238 progressive-feedback: all parts applied and checked';
end $z$;
-- ===== PART Z END =====
