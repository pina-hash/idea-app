-- 0291: AN ADMIN REPLACES ANY GAME'S COVER, WITH A PICTURE OR AN HTML COVER
-- (ledger 0422, feedback 1cc58a6e).
--
-- The cover lives in the gallery's own override layer (0237), beside the card's
-- title, description and thumbnail: it changes what the CARD shows and never
-- the student's app record, and clearing it puts the student's own cover back.
--
--   1. foundry_gallery_overrides gains cover_html (the document, at most 200,000
--      characters) and cover_html_rev (bumped on every save, so the card's
--      frame address changes and no cache shows the old one).
--   2. foundry_cover_set: admin only. 'image' sets the picture (a key in
--      foundry-covers the admin uploaded into their own folder, the bucket's
--      existing policy) and drops any HTML cover; 'html' sets the HTML cover and
--      keeps the picture as its still fallback; 'clear' removes both. It
--      returns what was there before, so the change can be put back.
--   3. foundry_gallery_override_set no longer deletes a row that still holds an
--      HTML cover when its other fields are cleared.
--   4. foundry_gallery_overrides_read projects cover_html_rev, never the
--      document.
--   5. foundry_cover_html: the document, for the ONE route that serves it on
--      the apps origin (src/routes/c/[appId]/+server.ts). That origin holds no
--      session, so it is granted to anon; it answers only for an app the
--      gallery shows, and nothing while the whole Foundry is switched off. The
--      route serves it under `sandbox allow-scripts` with no network at all.
--
-- UNDO: drop foundry_cover_set and foundry_cover_html; re-run
-- foundry_gallery_override_set and foundry_gallery_overrides_read from 0237;
-- drop the two columns.

alter table public.foundry_gallery_overrides
	add column if not exists cover_html text,
	add column if not exists cover_html_rev integer not null default 0;

do $d$
begin
	if not exists (
		select 1 from pg_constraint
		where conname = 'foundry_gallery_overrides_cover_html_size'
			and conrelid = 'public.foundry_gallery_overrides'::regclass
	) then
		alter table public.foundry_gallery_overrides
			add constraint foundry_gallery_overrides_cover_html_size
			check (cover_html is null or char_length(cover_html) between 1 and 200000);
	end if;
end;
$d$;

-- 4. The read: the revision, never the document.
create or replace function public.foundry_gallery_overrides_read()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $f$
	select case when (select auth.uid()) is null then '[]'::jsonb else coalesce((
		select jsonb_agg(jsonb_build_object(
			'subject', o.subject, 'title', o.title,
			'description', o.description, 'thumbnail_path', o.thumbnail_path,
			'cover_html_rev', case when o.cover_html is null then null else o.cover_html_rev end)
			order by o.subject)
		from public.foundry_gallery_overrides o), '[]'::jsonb) end;
$f$;

revoke all on function public.foundry_gallery_overrides_read() from public, anon, authenticated, service_role;
grant execute on function public.foundry_gallery_overrides_read() to authenticated;

-- 3. The card details editor, unchanged except that clearing its three fields
-- keeps a row that still holds an HTML cover.
create or replace function public.foundry_gallery_override_set(
	p_subject text,
	p_title text,
	p_description text,
	p_thumbnail_path text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_title text := nullif(public._foundry_norm(p_title), '');
	v_desc text := nullif(public._foundry_norm(p_description), '');
	v_thumb text := nullif(public._foundry_norm(p_thumbnail_path), '');
begin
	if not public.is_admin() then
		raise exception 'Only a site administrator can edit gallery details.';
	end if;
	if p_subject is null or p_subject !~ '^(house:(greenline|vanguard)|app:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$' then
		return jsonb_build_object('ok', false, 'reason', 'subject');
	end if;
	if p_subject like 'app:%' and not exists (
		select 1 from public.student_apps a where a.id = substr(p_subject, 5)::uuid
	) then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if v_title is not null and char_length(v_title) > 80 then
		return jsonb_build_object('ok', false, 'reason', 'title_length');
	end if;
	if v_desc is not null and char_length(v_desc) > 300 then
		return jsonb_build_object('ok', false, 'reason', 'description_length');
	end if;
	if v_thumb is not null and v_thumb !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]{1,120}$' then
		return jsonb_build_object('ok', false, 'reason', 'thumbnail');
	end if;

	if v_title is null and v_desc is null and v_thumb is null then
		delete from public.foundry_gallery_overrides where subject = p_subject and cover_html is null;
		update public.foundry_gallery_overrides
			set title = null, description = null, thumbnail_path = null,
				updated_by = public.current_user_email(), updated_at = now()
			where subject = p_subject;
		return jsonb_build_object('ok', true, 'subject', p_subject, 'cleared', true);
	end if;
	insert into public.foundry_gallery_overrides (subject, title, description, thumbnail_path, updated_by)
	values (p_subject, v_title, v_desc, v_thumb, public.current_user_email())
	on conflict (subject) do update
		set title = excluded.title, description = excluded.description,
			thumbnail_path = excluded.thumbnail_path,
			updated_by = excluded.updated_by, updated_at = now();
	return jsonb_build_object('ok', true, 'subject', p_subject, 'cleared', false);
end;
$f$;

revoke all on function public.foundry_gallery_override_set(text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.foundry_gallery_override_set(text, text, text, text) to authenticated;

-- 2. Replace a game's cover.
create or replace function public.foundry_cover_set(
	p_app uuid,
	p_kind text,
	p_image_path text default null,
	p_html text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_subject text := 'app:' || p_app::text;
	v_kind text := lower(coalesce(trim(p_kind), ''));
	v_image text := nullif(trim(coalesce(p_image_path, '')), '');
	v_html text := nullif(p_html, '');
	v_title text;
	v_before jsonb;
	v_row public.foundry_gallery_overrides%rowtype;
begin
	if not public.is_admin() then
		raise exception 'Only a site administrator can replace a game''s cover.';
	end if;
	select a.title into v_title from public.student_apps a where a.id = p_app;
	if v_title is null then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if v_kind not in ('image', 'html', 'clear') then
		return jsonb_build_object('ok', false, 'reason', 'kind',
			'message', 'Say image, html or clear.');
	end if;
	if v_kind = 'image' and (v_image is null or v_image !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]{1,120}$') then
		return jsonb_build_object('ok', false, 'reason', 'image',
			'message', 'That picture was not uploaded where covers are kept. Upload it again.');
	end if;
	if v_kind = 'html' and v_html is null then
		return jsonb_build_object('ok', false, 'reason', 'html_empty',
			'message', 'The HTML cover is empty.');
	end if;
	if v_kind = 'html' and char_length(v_html) > 200000 then
		return jsonb_build_object('ok', false, 'reason', 'html_length',
			'message', 'An HTML cover can be at most 200,000 characters.');
	end if;

	select * into v_row from public.foundry_gallery_overrides where subject = v_subject;
	v_before := jsonb_build_object(
		'image', v_row.thumbnail_path,
		'had_html', v_row.cover_html is not null);

	if v_kind = 'image' then
		insert into public.foundry_gallery_overrides (subject, thumbnail_path, updated_by)
		values (v_subject, v_image, public.current_user_email())
		on conflict (subject) do update
			set thumbnail_path = excluded.thumbnail_path, cover_html = null,
				updated_by = excluded.updated_by, updated_at = now();
	elsif v_kind = 'html' then
		insert into public.foundry_gallery_overrides (subject, cover_html, cover_html_rev, updated_by)
		values (v_subject, v_html, 1, public.current_user_email())
		on conflict (subject) do update
			set cover_html = excluded.cover_html,
				cover_html_rev = public.foundry_gallery_overrides.cover_html_rev + 1,
				updated_by = excluded.updated_by, updated_at = now();
	else
		update public.foundry_gallery_overrides
			set thumbnail_path = null, cover_html = null,
				updated_by = public.current_user_email(), updated_at = now()
			where subject = v_subject;
		delete from public.foundry_gallery_overrides
			where subject = v_subject and title is null and description is null;
	end if;

	select * into v_row from public.foundry_gallery_overrides where subject = v_subject;
	return jsonb_build_object(
		'ok', true,
		'app', p_app,
		'title', v_title,
		'kind', v_kind,
		'before', v_before,
		'cover_html_rev', case when v_row.cover_html is null then null else v_row.cover_html_rev end,
		'image', v_row.thumbnail_path);
end;
$f$;

revoke all on function public.foundry_cover_set(uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.foundry_cover_set(uuid, text, text, text) to authenticated;

-- 5. The document, for the apps-origin route alone.
create or replace function public.foundry_cover_html(p_app uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $f$
	select o.cover_html
	from public.foundry_gallery_overrides o
	join public.student_apps a on a.id = p_app
	where o.subject = 'app:' || p_app::text
		and o.cover_html is not null
		and public._foundry_app_in_population(a.owner, a.hidden_at, a.published_version_id, false, false)
		and not exists (select 1 from public.foundry_site_settings s where s.closed_at is not null);
$f$;

revoke all on function public.foundry_cover_html(uuid) from public, anon, authenticated, service_role;
grant execute on function public.foundry_cover_html(uuid) to anon, authenticated;

do $d$
begin
	raise notice '0291: % gallery override row(s); % with an HTML cover.',
		(select count(*) from public.foundry_gallery_overrides),
		(select count(*) from public.foundry_gallery_overrides where cover_html is not null);
end;
$d$;
