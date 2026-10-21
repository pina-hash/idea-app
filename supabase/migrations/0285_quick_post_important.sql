-- 0285_quick_post_important.sql
--
-- Feedback 7ec59920. A class notice can be marked IMPORTANT, so it stands out
-- and sits first on the class page.
--
-- WHAT IT ADDS
--   1. classroom_quick_posts.important, boolean, default false. Every notice
--      already posted stays as it was.
--   2. classroom_quick_post_set_important(p_post_id, p_important), the one write.
--      It re-checks the caller with the rule take-down already uses (the author,
--      or a teacher of every class the notice went to) and takes no identity
--      parameter.
--   3. classroom_quick_posts(uuid) is replaced by 0233's body plus an
--      `important` key on each post. Same name, same signature, same grants, so
--      a deployed client keeps working: it ignores the key it does not know.
--
-- DEPLOY ORDER: either order. The page treats a post with no `important` key as
-- not important and shows no switch until the read carries the key.
--
-- WHAT UNDOES IT
--   drop function if exists public.classroom_quick_post_set_important(uuid, boolean);
--   alter table public.classroom_quick_posts drop column if exists important;
--   then re-paste 0233's section 7 to restore the read without the key.

do $pre$
begin
	if to_regclass('public.classroom_quick_posts') is null then
		raise exception '0285 cannot apply: classroom_quick_posts does not exist. Apply 0230 first.';
	end if;
	if to_regprocedure('public._classroom_quick_post_can_take_down(uuid, text)') is null then
		raise exception '0285 cannot apply: _classroom_quick_post_can_take_down(uuid, text) does not exist. Apply 0230 first.';
	end if;
	if to_regprocedure('public.classroom_quick_posts(uuid)') is null then
		raise exception '0285 cannot apply: classroom_quick_posts(uuid) does not exist. Apply 0233 first.';
	end if;
end
$pre$;

alter table public.classroom_quick_posts
	add column if not exists important boolean not null default false;

create or replace function public.classroom_quick_post_set_important(
	p_post_id uuid,
	p_important boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $qp$
declare
	v_email text := public.current_user_email();
begin
	if v_email = '' then
		raise exception 'You must be signed in.';
	end if;
	if p_important is null then
		raise exception 'Say whether the notice is important.';
	end if;
	if not exists (select 1 from public.classroom_quick_posts where id = p_post_id and taken_down_at is null) then
		raise exception 'Not found.';
	end if;
	if not public._classroom_quick_post_can_take_down(p_post_id, v_email) then
		raise exception 'Only the teacher who posted it, or a teacher of every class it went to, can change it.';
	end if;

	update public.classroom_quick_posts set important = p_important where id = p_post_id;
	return jsonb_build_object('ok', true, 'important', p_important);
end;
$qp$;

revoke all on function public.classroom_quick_post_set_important(uuid, boolean)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_quick_post_set_important(uuid, boolean) to authenticated;

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
	v_ready boolean;
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
			'important', x.important,
			'section_ids', case when v_manages then (
				select coalesce(jsonb_agg(t2.section_id order by t2.section_id), '[]'::jsonb)
				from public.classroom_quick_post_sections t2
				where t2.post_id = x.id
					and public.classroom_manages_section(t2.section_id)
			) end,
			'can_take_down', case
				when v_manages then public._classroom_quick_post_can_take_down(x.id, v_email)
				else false
			end,
			'files', (
				select coalesce(jsonb_agg(jsonb_build_object(
						'id', f.id,
						'filename', f.filename,
						'size_bytes', f.size_bytes
					) order by f.sort_order, f.created_at, f.id), '[]'::jsonb)
				from public.classroom_quick_post_files f
				where f.post_id = x.id
			)
		) order by x.important desc, x.created_at desc, x.id), '[]'::jsonb)
	into v_posts
	from (
		select p.id, p.body, p.created_at, p.expires_at, p.important
		from public.classroom_quick_posts p
		join public.classroom_quick_post_sections t on t.post_id = p.id
		where t.section_id = p_section_id
			and p.taken_down_at is null
			and (p.expires_at is null or p.expires_at > now())
		order by p.important desc, p.created_at desc, p.id
		limit 20
	) x;

	v_ready := exists (
		select 1 from pg_catalog.pg_policies pol
		where pol.schemaname = 'storage'
			and pol.tablename = 'objects'
			and pol.policyname = 'quick post files insert by author'
	);

	return jsonb_build_object(
		'ok', true,
		'manages', v_manages,
		'now', now(),
		'posts', v_posts,
		'files_ready', v_ready,
		'limits', jsonb_build_object(
			'max_chars', 4000,
			'max_files', 10,
			'max_bytes', public.portal_upload_max_bytes()
		)
	);
end;
$qp$;

revoke all on function public.classroom_quick_posts(uuid) from public, anon, authenticated;
grant execute on function public.classroom_quick_posts(uuid) to authenticated;

do $post$
begin
	if not exists (select 1 from information_schema.columns
		where table_schema = 'public' and table_name = 'classroom_quick_posts' and column_name = 'important') then
		raise exception '0285 self-check failed: important column is missing.';
	end if;
	if has_function_privilege('anon', 'public.classroom_quick_post_set_important(uuid, boolean)', 'execute')
		or has_function_privilege('anon', 'public.classroom_quick_posts(uuid)', 'execute') then
		raise exception '0285 self-check failed: anon can execute a quick post function.';
	end if;
	raise notice '0285: % notices, none marked important', (select count(*) from public.classroom_quick_posts);
end
$post$;
