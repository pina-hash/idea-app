-- 0316_classroom_team_photos_and_names.sql
--
-- A TEAM'S PICTURES SHOW TO THE WHOLE TEAM, AND TEAMMATES ARE NAMED BY FIRST
-- NAME (ledger 0456; feedback 06061518, gap 36d0596c, student reports
-- 3116e4cf, aac90533 and 947a571c, filed in class on 2026-10-28; gap 7843b71e).
--
-- WHAT WAS WRONG. A picture is a classroom_submission_files row hanging off the
-- uploader's OWN submission, and every reader of it (the row policy of 0086, the
-- storage policy of 0133 through classroom_can_read_submission_object, the
-- engine read on the item page) answers only the uploader and the teacher. So in
-- Launcher: Design the Frame owner's sketch showed for the Frame owner alone,
-- the team box "where the four parts meet" asked students to compare sketches
-- none of them could see, and a teammate's progress bar read the role boxes as
-- empty, so the team's percent differed from student to student (aac90533).
--
-- WHAT THIS DOES.
--   1. `_classroom_team_file_visible(file, email)`: ONE rule for "a teammate may
--      see this picture". The file is a picture in a TEAM or ROLE block of a team
--      assignment (never an individual block, never a plain hand-in), and the
--      reader is on the SAME team as the uploader in that item's current posted
--      draw for that section. Both read paths ask it:
--        - the classroom_submission_files row policy gains one permissive
--          policy beside 0086's (the old policy is not touched);
--        - classroom_can_read_submission_object, the storage policy's
--          predicate, gains one OR branch, so the signed URL the file route
--          mints on the student's own session is allowed for that same file.
--      A picture in an individual block stays its uploader's (spec 16.3 as
--      amended here): it is the student's own answer, graded as their own.
--   2. `classroom_team_files(item)`: the team's pictures for a team or role
--      block, the newest per block, for the student's own team only, with the
--      uploader's first name. The page lays them into the document read only,
--      exactly as a teammate's text already is.
--   3. A ROLE picture is written only by the role's owner: the file record
--      (classroom_add_submission_file, 0197's body) asks 0302's
--      `_classroom_team_block_refusal` for a team or role image block, the one
--      statement of who may write a shared box, so a non-owner's upload is
--      refused before a row exists and the route removes the bytes.
--   4. classroom_team_progress counts the team's shared and role answers and
--      pictures for every member, so every teammate reads one percent for the
--      team's part.
--   5. NAMES (gap 7843b71e): `_classroom_first_name` read the first word of
--      "Last, First", so a teammate showed as "Chavarria," and two students on
--      one team as "Morales,". It now reads the given name ("Last, First" or
--      "First Last"), and `_classroom_team_display_name(team, email)` gives
--      "First L." where two members of one team share a first name. Every team
--      payload names members through the second.
--
-- PRIVACY, BOTH DIRECTIONS (tests/db/classroom-team-photos.test.ts, mutation-
-- proven in the permissive direction): a teammate sees a team or role picture;
-- a student on another team, a student in another section and a student with no
-- team see nothing; nobody but the uploader and the teacher sees an individual
-- block's picture.
--
-- DEPLOY ORDERING: none. Every function keeps its signature or is new; the new
-- read is called only by a client that degrades to today's behaviour when it
-- answers "could not find the function".
--
-- WHAT UNDOES IT, a person's paste:
--   drop policy if exists "classroom submission files teammates see team pictures" on public.classroom_submission_files;
--   re-run 0133's classroom_can_read_submission_object, 0197's
--   classroom_add_submission_file (eight arguments), 0290's
--   classroom_team_progress and 0302's _classroom_first_name, each with its
--   grant lines; then
--   drop function if exists public.classroom_team_files(uuid);
--   drop function if exists public._classroom_team_display_name(uuid, text);
--   drop function if exists public._classroom_team_file_visible_to_me(uuid);
--   drop function if exists public._classroom_team_file_visible(uuid, text);
--   drop function if exists public._classroom_given_name(text);
-- No row is written by this file.

do $pre$
begin
	if to_regprocedure('public._classroom_team_block_refusal(uuid, text, uuid, jsonb)') is null
		or to_regprocedure('public._classroom_team_ctx(uuid, text)') is null then
		raise exception '0316 cannot apply: the team documents of 0302 are missing. Apply 0302 first.';
	end if;
	if to_regprocedure('public.classroom_team_progress(uuid)') is null then
		raise exception '0316 cannot apply: classroom_team_progress does not exist. Apply 0290 first.';
	end if;
	if to_regprocedure('public.classroom_add_submission_file(uuid, text, text, text, bigint, text, text, text)') is null then
		raise exception '0316 cannot apply: the eight-argument classroom_add_submission_file does not exist.';
	end if;
end
$pre$;

-- ---------------------------------------------------------------------------
-- 1. Names. The first object is new, so the apply probe can see this landed.
-- ---------------------------------------------------------------------------

-- THE GIVEN NAME IN A ROSTER NAME: "Chavarria, Ana Maria" is Ana, "Ana
-- Chavarria" is Ana, a single word is itself. Null for a blank.
create or replace function public._classroom_given_name(p_display text)
returns text
language sql
immutable
set search_path = ''
as $f$
	select case
		when v.clean = '' then null
		when position(',' in v.clean) > 0 then coalesce(
			nullif(split_part(btrim(substr(v.clean, position(',' in v.clean) + 1)), ' ', 1), ''),
			nullif(btrim(split_part(v.clean, ',', 1)), ''))
		else split_part(v.clean, ' ', 1)
	end
	from (select btrim(regexp_replace(coalesce(p_display, ''), '\s+', ' ', 'g')) as clean) v;
$f$;

-- The family name's first letter, for "First L.", or null.
create or replace function public._classroom_family_initial(p_display text)
returns text
language sql
immutable
set search_path = ''
as $f$
	select nullif(upper(left(regexp_replace(
		case
			when position(',' in v.clean) > 0 then btrim(split_part(v.clean, ',', 1))
			when position(' ' in v.clean) > 0 then regexp_replace(v.clean, '^.* ', '')
			else ''
		end, '^[^[:alpha:]]+', ''), 1)), '')
	from (select btrim(regexp_replace(coalesce(p_display, ''), '\s+', ' ', 'g')) as clean) v;
$f$;

-- 0302's function, same signature: the given name now, never the first word of
-- "Last, First". Every caller (the lock's "is editing", role owners, the plan,
-- the queue, the grading screen) reads it unchanged.
create or replace function public._classroom_first_name(p_section_id uuid, p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $f$
	select coalesce(
		(select public._classroom_given_name(e.display_name)
		 from public.classroom_enrollments e
		 where e.section_id = p_section_id and e.student_email = p_email),
		split_part(coalesce(p_email, ''), '@', 1)
	);
$f$;

-- A MEMBER'S NAME ON THEIR TEAM: the given name, or "First L." where another
-- member of the same team shares it.
create or replace function public._classroom_team_display_name(p_team_id uuid, p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $f$
	with sec as (select public._classroom_team_section(p_team_id) as section_id),
	me as (
		select public._classroom_first_name(sec.section_id, p_email) as first,
			(select public._classroom_family_initial(e.display_name) from public.classroom_enrollments e
			 where e.section_id = sec.section_id and e.student_email = p_email) as initial
		from sec
	)
	select case
		when me.initial is not null and exists (
			select 1 from public.classroom_team_members m, sec
			where m.team_id = p_team_id and m.student_email <> p_email
				and lower(public._classroom_first_name(sec.section_id, m.student_email)) = lower(me.first))
		then me.first || ' ' || me.initial || '.'
		else me.first
	end
	from me;
$f$;

revoke all on function public._classroom_given_name(text) from public, anon, authenticated;
revoke all on function public._classroom_family_initial(text) from public, anon, authenticated;
revoke all on function public._classroom_first_name(uuid, text) from public, anon, authenticated;
revoke all on function public._classroom_team_display_name(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The one rule: may this reader see this file as a teammate.
-- ---------------------------------------------------------------------------

-- The file is a picture in a TEAM or ROLE block of a team assignment, and the
-- reader is on the uploader's team in that item's current draw for a section
-- they share. Null-safe: anything unknown is false.
create or replace function public._classroom_team_file_visible(p_file_id uuid, p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $f$
	select coalesce((
		select public._classroom_html_team_block(public._classroom_html_team_manifest(s.item_id), f.block_id) is not null
			and exists (
				select 1
				from public.classroom_postings pg
				join public.classroom_team_members mine
					on mine.team_set_id = public._classroom_section_team_set(pg.section_id)
					and mine.student_email = lower(btrim(p_email))
				join public.classroom_team_members theirs
					on theirs.team_id = mine.team_id and theirs.student_email = s.student_email
				join public.classroom_enrollments e
					on e.section_id = pg.section_id and e.student_email = mine.student_email and e.active
				where pg.item_id = s.item_id)
		from public.classroom_submission_files f
		join public.classroom_submissions s on s.id = f.submission_id
		where f.id = p_file_id and f.block_id is not null and coalesce(p_email, '') <> ''
	), false);
$f$;

revoke all on function public._classroom_team_file_visible(uuid, text) from public, anon, authenticated;

-- THE CALLER'S FORM, for the row policy (a policy runs as the caller, so it
-- needs a function the caller may execute). It takes no address, so nobody can
-- ask about anyone but themselves: the 0138 wrapper shape.
create or replace function public._classroom_team_file_visible_to_me(p_file_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $f$
	select public._classroom_team_file_visible(p_file_id, public.current_user_email());
$f$;

revoke all on function public._classroom_team_file_visible_to_me(uuid) from public, anon, authenticated;
grant execute on function public._classroom_team_file_visible_to_me(uuid) to authenticated;

-- THE ROW: one permissive policy beside 0086's, which is not touched. A plain
-- hand-in (no block) never reaches the helper.
drop policy if exists "classroom submission files teammates see team pictures" on public.classroom_submission_files;
create policy "classroom submission files teammates see team pictures"
	on public.classroom_submission_files
	for select
	to authenticated
	using (block_id is not null and public._classroom_team_file_visible_to_me(id));

-- THE BYTES: 0133's predicate with one branch added (marked 0316), so the
-- signed URL the file route mints on the teammate's own session is allowed.
create or replace function public.classroom_can_read_submission_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1
		from public.classroom_submissions s
		where s.id = public._classroom_storage_prefix_uuid(p_name)
			and (
				s.student_email = public.current_user_email()
				or public.classroom_can_review_submission(s.item_id, s.student_email)
				-- 0316: a teammate, for a team or role picture of this object.
				or exists (
					select 1 from public.classroom_submission_files f
					where f.submission_id = s.id and f.storage_key = p_name
						and public._classroom_team_file_visible(f.id, public.current_user_email()))
			)
	);
$$;

revoke all on function public.classroom_can_read_submission_object(text) from public;
grant execute on function public.classroom_can_read_submission_object(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The team's pictures, for the student's own team.
-- ---------------------------------------------------------------------------

-- {ok, files: [{id, block_id, filename, caption, by, mine, at}]}: the newest
-- picture per team or role block among the team's current members. Empty for a
-- student with no team, and for an item that is not a team assignment.
create or replace function public.classroom_team_files(p_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_email text := public._classroom_engine_student(p_item_id);
	v_manifest jsonb := public._classroom_html_team_manifest(p_item_id);
	v_ctx record;
begin
	if v_manifest is null then
		return jsonb_build_object('ok', true, 'files', '[]'::jsonb);
	end if;
	select * into v_ctx from public._classroom_team_ctx(p_item_id, v_email);
	if v_ctx.team_id is null then
		return jsonb_build_object('ok', true, 'files', '[]'::jsonb);
	end if;
	return jsonb_build_object('ok', true, 'files', coalesce((
		select jsonb_agg(jsonb_build_object(
			'id', x.id, 'block_id', x.block_id, 'filename', x.filename, 'caption', x.caption,
			'by', public._classroom_team_display_name(v_ctx.team_id, x.student_email),
			'mine', x.student_email = v_email, 'at', x.created_at
		) order by x.block_id)
		from (
			select distinct on (f.block_id) f.id, f.block_id, f.filename, f.caption, f.created_at, s.student_email
			from public.classroom_submission_files f
			join public.classroom_submissions s on s.id = f.submission_id
			join public.classroom_team_members m on m.team_id = v_ctx.team_id and m.student_email = s.student_email
			where s.item_id = p_item_id and f.block_id is not null
				and public._classroom_html_team_block(v_manifest, f.block_id) is not null
			order by f.block_id, f.created_at desc, f.sort_order desc, f.id
		) x
	), '[]'::jsonb));
end;
$f$;

revoke all on function public.classroom_team_files(uuid) from public, anon, authenticated;
grant execute on function public.classroom_team_files(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. A role picture is written only by its owner: 0197's file record with one
--    branch added (marked 0316). Everything else is 0197's text.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_add_submission_file(
	p_item_id uuid,
	p_drive_file_id text,
	p_filename text,
	p_mime_type text,
	p_size_bytes bigint,
	p_block_id text,
	p_caption text,
	p_storage_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_engine_student(p_item_id);
	v_manifest jsonb;
	v_spec jsonb;
	v_block jsonb;
	v_module_id text;
	v_submission_id uuid;
	v_state text;
	v_next integer;
	v_id uuid;
	v_file text := nullif(btrim(coalesce(p_drive_file_id, '')), '');
	v_key text := nullif(btrim(coalesce(p_storage_key, '')), '');
	v_team_owner jsonb;
	v_ctx record;
	v_team uuid;
	v_refusal jsonb;
begin
	if (v_file is null) = (v_key is null) then
		raise exception 'Attach exactly one of a Drive file id or a storage key.';
	end if;

	if p_block_id is not null then
		v_manifest := public._classroom_html_manifest(p_item_id);
		if v_manifest is not null then
			v_block := public._classroom_html_block(v_manifest, p_block_id);
			if v_block is null or v_block->>'type' <> 'image' then
				raise exception 'Block "%" is not an image zone.', coalesce(p_block_id, '(none)');
			end if;
			-- 0316: A TEAM OR ROLE PICTURE is written by whoever may write that
			-- shared box (0302's one rule): the role's owner for a role block.
			v_team_owner := public._classroom_html_team_block(v_manifest, p_block_id);
			if v_team_owner is not null then
				select * into v_ctx from public._classroom_team_ctx(p_item_id, v_email);
				if v_ctx.team_id is null then
					return jsonb_build_object('ok', false,
						'reason', case when v_ctx.team_set_id is null then 'not_posted' else 'no_team' end);
				end if;
				v_team := v_ctx.team_id;
				v_refusal := public._classroom_team_block_refusal(p_item_id, v_email, v_team, v_team_owner);
				if v_refusal is not null then
					return v_refusal;
				end if;
			end if;
		else
			select a.spec into v_spec
			from public.classroom_assignment_specs a where a.item_id = p_item_id;
			if v_spec is null then
				raise exception 'This assignment has no interactive spec.';
			end if;
			select b.blk, m.mod->>'id' into v_block, v_module_id
			from jsonb_array_elements(v_spec->'modules') as m(mod),
				jsonb_array_elements(m.mod->'blocks') as b(blk)
			where b.blk->>'id' = p_block_id
			limit 1;
			if v_block is null or v_block->>'type' <> 'imageZone' then
				raise exception 'Block "%" is not an image zone.', coalesce(p_block_id, '(none)');
			end if;
			if v_module_id = any (public._classroom_gated_modules(v_spec)) and not exists (
				select 1 from public.classroom_module_approvals a
				where a.item_id = p_item_id and a.student_email = v_email
					and a.module_id = v_spec->'approvalGate'->>'afterModule'
			) then
				return jsonb_build_object('ok', false, 'reason', 'approval_pending', 'module_id', v_module_id);
			end if;
		end if;
	end if;

	select s.id, s.state into v_submission_id, v_state
	from public.classroom_submissions s
	where s.item_id = p_item_id and s.student_email = v_email;
	if v_state = 'submitted' then
		return jsonb_build_object('ok', false, 'reason', 'locked');
	end if;
	if v_submission_id is null then
		insert into public.classroom_submissions (item_id, student_email)
		values (p_item_id, v_email)
		on conflict (item_id, student_email) do nothing
		returning id into v_submission_id;

		if v_submission_id is null then
			select s.id, s.state into v_submission_id, v_state
			from public.classroom_submissions s
			where s.item_id = p_item_id and s.student_email = v_email;

			if v_state = 'submitted' then
				return jsonb_build_object('ok', false, 'reason', 'locked');
			end if;
			if v_submission_id is null then
				raise exception 'Could not open a submission for this assignment.';
			end if;
		end if;
	end if;

	if v_key is not null and public._classroom_storage_prefix_uuid(v_key) is distinct from v_submission_id then
		raise exception 'That storage key does not belong to this submission.';
	end if;

	select coalesce(max(sort_order), 0) + 1 into v_next
	from public.classroom_submission_files where submission_id = v_submission_id;

	insert into public.classroom_submission_files
		(submission_id, block_id, caption, drive_file_id, storage_key, filename, mime_type, size_bytes, sort_order)
	values (v_submission_id, p_block_id, nullif(left(btrim(coalesce(p_caption, '')), 500), ''),
		v_file, v_key, left(btrim(coalesce(p_filename, 'file')), 300),
		left(btrim(coalesce(p_mime_type, 'application/octet-stream')), 200),
		p_size_bytes, v_next)
	returning id into v_id;

	-- 0316: a team picture tells the teammates' open pages to read again.
	if v_team is not null then
		perform public._classroom_live_notice('team-' || v_team::text, 'team-doc');
	end if;

	return jsonb_build_object(
		'ok', true,
		'file_id', v_id,
		'submission_id', v_submission_id,
		'storage_key', v_key
	);
end;
$$;

revoke all on function public.classroom_add_submission_file(uuid, text, text, text, bigint, text, text, text)
	from public, anon, authenticated;
grant execute on function public.classroom_add_submission_file(uuid, text, text, text, bigint, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. One percent for the team: 0290's progress with the team's shared and role
--    answers and pictures counted for every member (marked 0316), and members
--    named as the team names them.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_team_progress(p_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_engine_student(p_item_id);
	v_manifest jsonb := public._classroom_html_team_manifest(p_item_id);
begin
	return jsonb_build_object('ok', true, 'teams', coalesce((
		select jsonb_agg(t_row order by t_row.posted_at desc nulls last, t_row.team_number)
		from (
			select s.label as set_label, s.posted_at, t.team_number,
				coalesce(nullif(btrim(t.name), ''), 'Team ' || t.team_number) as team_name,
				(
					select coalesce(jsonb_agg(jsonb_build_object(
						'name', public._classroom_team_display_name(t.id, m.student_email),
						'me', m.student_email = v_email,
						'state', coalesce(sub.state, 'draft'),
						'answered', coalesce((
							select jsonb_agg(distinct x.block_id)
							from (
								select r.block_id
								from public.classroom_responses r
								where r.item_id = p_item_id and r.student_email = m.student_email
									and (jsonb_typeof(r.value) = 'boolean'
										or (jsonb_typeof(r.value) = 'string' and (r.value #>> '{}') ~ '[^][[:space:]",]'))
								union all
								-- 0316: the team's own answer to a shared or role box.
								select a.block_id
								from public.classroom_team_answers a
								where v_manifest is not null and a.team_id = t.id and a.item_id = p_item_id
									and public._classroom_answer_present(a.value)
							) x
						), '[]'::jsonb),
						'images', coalesce((
							select jsonb_agg(distinct y.block_id)
							from (
								select f.block_id
								from public.classroom_submission_files f
								where f.submission_id = sub.id and f.block_id is not null
								union all
								-- 0316: a teammate's picture in a shared or role box.
								select f2.block_id
								from public.classroom_submission_files f2
								join public.classroom_submissions s2 on s2.id = f2.submission_id
								join public.classroom_team_members m2 on m2.team_id = t.id and m2.student_email = s2.student_email
								where v_manifest is not null and s2.item_id = p_item_id and f2.block_id is not null
									and public._classroom_html_team_block(v_manifest, f2.block_id) is not null
							) y
						), '[]'::jsonb)
					) order by (m.student_email = v_email) desc, e.display_name, m.student_email), '[]'::jsonb)
					from public.classroom_team_members m
					left join public.classroom_enrollments e on e.section_id = s.section_id and e.student_email = m.student_email
					left join public.classroom_submissions sub on sub.item_id = p_item_id and sub.student_email = m.student_email
					where m.team_id = t.id
						and (m.student_email = v_email or m.student_email not in (select public._idea_test_emails()))
				) as members
			from public.classroom_team_sets s
			join public.classroom_teams t on t.team_set_id = s.id
			where s.archived_at is null
				and public._classroom_team_set_visible(s.id)
				and public._classroom_team_member(t.id, v_email)
				and exists (select 1 from public.classroom_postings pg where pg.item_id = p_item_id and pg.section_id = s.section_id)
				and exists (select 1 from public.classroom_enrollments me where me.section_id = s.section_id and me.student_email = v_email and me.active)
		) t_row
	), '[]'::jsonb));
end;
$$;
revoke all on function public.classroom_team_progress(uuid) from public, anon, authenticated;
grant execute on function public.classroom_team_progress(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The team document names members as the team names them: 0302's payload,
--    the four name calls pointed at the team-aware name (marked 0316).
-- ---------------------------------------------------------------------------

create or replace function public._classroom_team_document(
	p_item_id uuid,
	p_team_id uuid,
	p_me text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $f$
	with team as (
		select t.id, t.team_number, s.section_id,
			coalesce(nullif(btrim(t.name), ''), 'Team ' || t.team_number) as name
		from public.classroom_teams t join public.classroom_team_sets s on s.id = t.team_set_id
		where t.id = p_team_id
	)
	select jsonb_build_object(
		'ok', true,
		'team', (select jsonb_build_object('id', team.id, 'name', team.name, 'number', team.team_number,
			'section_id', team.section_id) from team),
		'members', coalesce((
			select jsonb_agg(jsonb_build_object(
				'name', public._classroom_team_display_name(team.id, m.student_email),
				'me', m.student_email = p_me,
				'active', coalesce(e.active, false)
			) order by (m.student_email = p_me) desc, e.display_name, m.student_email)
			from team
			join public.classroom_team_members m on m.team_id = team.id
			left join public.classroom_enrollments e
				on e.section_id = team.section_id and e.student_email = m.student_email
			where m.student_email = p_me or m.student_email not in (select public._idea_test_emails())
		), '[]'::jsonb),
		'roles', coalesce((
			select jsonb_agg(jsonb_build_object(
				'id', r.role->>'id',
				'title', r.role->>'title',
				'owner', case when o.owner_email is null then null
					else public._classroom_team_display_name(team.id, o.owner_email) end,
				'mine', o.owner_email is not null and o.owner_email = p_me
			) order by r.ord)
			from team,
				jsonb_array_elements(public._classroom_team_roles(p_team_id)) with ordinality as r(role, ord)
			left join lateral (
				select public._classroom_team_role_owner(p_team_id, r.role->>'id') as owner_email
			) o on true
		), '[]'::jsonb),
		'values', coalesce((
			select jsonb_object_agg(a.block_id, jsonb_build_object(
				'value', a.value,
				'by', public._classroom_team_display_name(team.id, a.updated_by),
				'at', a.updated_at
			))
			from team
			join public.classroom_team_answers a on a.team_id = team.id and a.item_id = p_item_id
		), '{}'::jsonb),
		'locks', coalesce((
			select jsonb_object_agg(l.block_id, jsonb_build_object(
				'by', public._classroom_team_display_name(team.id, l.holder_email),
				'mine', l.holder_email = p_me,
				'until', l.touched_at + public._classroom_team_lock_ttl()
			))
			from team
			join public.classroom_team_box_locks l on l.team_id = team.id and l.item_id = p_item_id
			where l.touched_at >= now() - public._classroom_team_lock_ttl()
		), '{}'::jsonb),
		'past_due', coalesce((select i.due_at is not null and now() > i.due_at
			from public.classroom_items i where i.id = p_item_id), false),
		'now', now()
	);
$f$;

revoke all on function public._classroom_team_document(uuid, uuid, text) from public, anon, authenticated;

do $report$
declare
	v_pictures integer;
begin
	select count(*) into v_pictures
	from public.classroom_submission_files f
	join public.classroom_submissions s on s.id = f.submission_id
	where f.block_id is not null
		and public._classroom_html_team_block(public._classroom_html_team_manifest(s.item_id), f.block_id) is not null;
	raise notice '0316: % pictures in team or role boxes now show to their teammates.', v_pictures;
	if has_function_privilege('anon', 'public.classroom_team_files(uuid)', 'execute') then
		raise exception '0316: classroom_team_files is executable by anon.';
	end if;
end
$report$;
