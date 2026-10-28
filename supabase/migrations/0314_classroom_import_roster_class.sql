-- 0314_classroom_import_roster_class.sql
--
-- A ROSTER ROW MAY NAME ITS CLASS BY ID OR BY NAME (ledger 0463; Mr. Pina,
-- 2026-10-28: the IDEA 100 Section 3 roster import refused all 21 rows with
-- course_not_found when each row named the class by id. "Make it accept the
-- class id or name, like add_student does.").
--
-- WHAT WENT WRONG. 0082's classroom_import_roster placed a row only by
-- (course_code, section_label). A row carrying the class's id and no course
-- code read an empty code, matched no course, and was refused per row, so the
-- whole file was refused while every row was a good one.
--
-- WHAT THIS DOES. The function keeps its name, its one jsonb argument, its
-- summary shape and every answer it gave before, and places a row by the
-- FIRST of these it carries:
--   1. `section_id`, `class_id`, `class` or `section`: the class's id, or its
--      name as it is said ("IDEA100 Section 3", "IDEA 100 Section 3",
--      "209H Block 2"), read by _classroom_roster_section below;
--   2. `course_code` or `section_label` holding a class's id (the id put in
--      one of 0082's two columns);
--   3. (course_code, section_label), exactly as 0082 did, refusals included.
-- A name that fits no active class is `class_not_found`, one that fits more
-- than one is `class_ambiguous` with the candidates' names, and a class the
-- caller does not manage is still `not_your_section`.
--
-- A NAME IS MATCHED, NEVER GUESSED. Letters and digits only, case folded, so
-- "IDEA 100 · Section 3" and "idea100 section 3" are one name; a class is
-- known by its course code (with or without a leading IDEA) followed by its
-- label, by "Section <label>" for a bare label, and by either with its block.
-- Two classes answering the same name prefer the one the caller teaches; two
-- still left is a question, never a pick.
--
-- DEPLOY ORDERING: none. Same signature, same grants; every row the deployed
-- site sends is placed exactly as before.
--
-- WHAT UNDOES IT, a person's paste: re-paste 0082's classroom_import_roster
-- body (supabase/migrations/0082_classroom.sql, "Bulk roster import"), then
--   drop function if exists public._classroom_roster_section(text);
-- Enrollments it wrote stay, as an import's always have.

do $pre$
begin
	if to_regprocedure('public.classroom_import_roster(jsonb)') is null
		or to_regprocedure('public.classroom_manages_section(uuid)') is null then
		raise exception '0314 cannot apply: the classroom roster import of 0082 is missing.';
	end if;
end
$pre$;

-- The first object is new, so the apply probe can see this landed.
create or replace function public._classroom_roster_section(p_said text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_raw text := btrim(coalesce(p_said, ''));
	v_key text;
	v_ids uuid[];
	v_mine uuid[];
	v_names jsonb;
begin
	if v_raw = '' then
		return jsonb_build_object('reason', 'class_not_found');
	end if;
	if v_raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
		select array_agg(s.id) into v_ids from public.classroom_sections s where s.id = lower(v_raw)::uuid;
		if v_ids is null then
			return jsonb_build_object('reason', 'class_not_found');
		end if;
		return jsonb_build_object('section_id', v_ids[1]);
	end if;
	v_key := regexp_replace(lower(v_raw), '[^a-z0-9]', '', 'g');
	if v_key = '' then
		return jsonb_build_object('reason', 'class_not_found');
	end if;
	with names as (
		select s.id, s.teacher_email
		from public.classroom_sections s
		join public.classroom_courses c on c.id = s.course_id
		cross join lateral (select
			regexp_replace(lower(c.code), '[^a-z0-9]', '', 'g') as code,
			regexp_replace(lower(s.label), '[^a-z0-9]', '', 'g') as label,
			regexp_replace(lower(coalesce(s.block, '')), '[^a-z0-9]', '', 'g') as block,
			btrim(s.label) !~ '\s' as bare_label,
			btrim(coalesce(s.block, '')) !~ '\s' as bare_block) k0
		where s.active
			and v_key in (
				-- code + label, with the word for a bare label
				k0.code || k0.label,
				k0.code || case when k0.bare_label then 'section' else '' end || k0.label,
				regexp_replace(k0.code, '^idea', '') || k0.label,
				regexp_replace(k0.code, '^idea', '') || case when k0.bare_label then 'section' else '' end || k0.label,
				-- the same with the block
				k0.code || k0.label || k0.block,
				k0.code || case when k0.bare_label then 'section' else '' end || k0.label
					|| case when k0.block <> '' and k0.bare_block then 'block' else '' end || k0.block,
				regexp_replace(k0.code, '^idea', '') || k0.label || k0.block,
				regexp_replace(k0.code, '^idea', '') || case when k0.bare_label then 'section' else '' end || k0.label
					|| case when k0.block <> '' and k0.bare_block then 'block' else '' end || k0.block
			)
	)
	select array_agg(n.id order by n.id),
		array_agg(n.id order by n.id) filter (where n.teacher_email = public.current_user_email())
	into v_ids, v_mine
	from names n;
	if v_ids is null then
		return jsonb_build_object('reason', 'class_not_found');
	end if;
	if array_length(v_ids, 1) = 1 then
		return jsonb_build_object('section_id', v_ids[1]);
	end if;
	if v_mine is not null and array_length(v_mine, 1) = 1 then
		return jsonb_build_object('section_id', v_mine[1]);
	end if;
	select jsonb_agg(c.code || ' ' || s.label || coalesce(' ' || s.block, '') order by c.code, s.label)
	into v_names
	from public.classroom_sections s join public.classroom_courses c on c.id = s.course_id
	where s.id = any(v_ids);
	return jsonb_build_object('reason', 'class_ambiguous', 'candidates', v_names);
end;
$$;

revoke all on function public._classroom_roster_section(text) from public, anon, authenticated;

create or replace function public.classroom_import_roster(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_row jsonb;
	v_idx integer := 0;
	v_ok integer := 0;
	v_bad integer := 0;
	v_results jsonb := '[]'::jsonb;
	v_email text;
	v_name text;
	v_code text;
	v_label text;
	v_class text;
	v_found jsonb;
	v_candidates jsonb;
	v_course uuid;
	v_section uuid;
	v_reason text;
	v_existing boolean;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.classroom_is_staff() then
		raise exception 'Only staff can import a classroom roster.';
	end if;
	if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
		raise exception 'Rows must be a JSON array.';
	end if;
	if jsonb_array_length(p_rows) = 0 then
		raise exception 'No rows to import.';
	end if;
	if jsonb_array_length(p_rows) > 2000 then
		raise exception 'At most 2000 rows per import.';
	end if;

	for v_row in select * from jsonb_array_elements(p_rows) loop
		v_idx := v_idx + 1;
		begin
			v_email := lower(btrim(coalesce(v_row->>'email', '')));
			v_name := nullif(btrim(coalesce(v_row->>'name', '')), '');
			v_code := upper(btrim(coalesce(v_row->>'course_code', '')));
			v_label := btrim(coalesce(v_row->>'section_label', ''));
			v_class := nullif(btrim(coalesce(v_row->>'section_id', v_row->>'class_id', v_row->>'class', v_row->>'section', '')), '');
			v_reason := null;
			v_course := null;
			v_section := null;
			v_candidates := null;

			-- A class id in either of 0082's two columns is the class.
			if v_class is null and v_code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
				and exists (select 1 from public.classroom_sections s where s.id = lower(v_code)::uuid) then
				v_class := lower(v_code);
			elsif v_class is null and v_label ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
				and exists (select 1 from public.classroom_sections s where s.id = lower(v_label)::uuid) then
				v_class := lower(v_label);
			end if;

			if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' then
				v_reason := 'bad_email';
			elsif v_class is not null then
				v_found := public._classroom_roster_section(v_class);
				v_section := (v_found->>'section_id')::uuid;
				if v_section is null then
					v_reason := coalesce(v_found->>'reason', 'class_not_found');
					v_candidates := v_found->'candidates';
				elsif not public.classroom_manages_section(v_section) then
					v_reason := 'not_your_section';
				end if;
			else
				select c.id into v_course from public.classroom_courses c where c.code = v_code;
				if v_course is null then
					v_reason := 'course_not_found';
				else
					select s.id into v_section
					from public.classroom_sections s
					where s.course_id = v_course and lower(s.label) = lower(v_label);
					if v_section is null then
						v_reason := 'section_not_found';
					elsif not public.classroom_manages_section(v_section) then
						v_reason := 'not_your_section';
					end if;
				end if;
			end if;

			if v_reason is not null then
				v_bad := v_bad + 1;
				v_results := v_results || jsonb_build_array(jsonb_build_object(
					'row', v_idx, 'email', v_email, 'ok', false, 'reason', v_reason)
					|| case when v_candidates is null then '{}'::jsonb else jsonb_build_object('candidates', v_candidates) end);
			else
				v_existing := exists (
					select 1 from public.classroom_enrollments e
					where e.section_id = v_section and e.student_email = v_email
				);
				insert into public.classroom_enrollments as ce
					(section_id, student_email, display_name, active, added_by)
				values (
					v_section,
					v_email,
					coalesce(v_name, left(split_part(v_email, '@', 1), 200)),
					true,
					public.current_user_email()
				)
				on conflict (section_id, student_email) do update
					set display_name = coalesce(v_name, ce.display_name),
						active = true,
						added_by = excluded.added_by,
						updated_at = now();
				v_ok := v_ok + 1;
				v_results := v_results || jsonb_build_array(jsonb_build_object(
					'row', v_idx, 'email', v_email, 'ok', true,
					'action', case when v_existing then 'updated' else 'created' end,
					'section_id', v_section));
			end if;
		exception when others then
			v_bad := v_bad + 1;
			v_results := v_results || jsonb_build_array(jsonb_build_object(
				'row', v_idx, 'email', coalesce(v_email, ''), 'ok', false,
				'reason', 'error', 'message', sqlerrm));
		end;
	end loop;

	return jsonb_build_object(
		'total', v_idx,
		'succeeded', v_ok,
		'refused', v_bad,
		'results', v_results
	);
end;
$$;

revoke all on function public.classroom_import_roster(jsonb) from public, anon, authenticated;
grant execute on function public.classroom_import_roster(jsonb) to authenticated;

do $post$
begin
	if has_function_privilege('anon', 'public.classroom_import_roster(jsonb)', 'execute')
		or has_function_privilege('authenticated', 'public._classroom_roster_section(text)', 'execute') then
		raise exception '0314 self-check: a grant is wrong after the apply.';
	end if;
	raise notice '0314: classroom_import_roster places a row by class id or name; % active classes can be named.',
		(select count(*) from public.classroom_sections where active);
end
$post$;
