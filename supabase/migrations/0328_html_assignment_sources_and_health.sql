-- 0328_html_assignment_sources_and_health.sql
--
-- AN HTML ASSIGNMENT KEEPS ITS SOURCE, AND STAFF SEE EVERY ONE'S KIT AT A
-- GLANCE (ledger 0458, reports 013c83d0 and 3bf69806).
--
--   1. classroom_html_sources: the `.src.html` a kit page was built from, one
--      per post, so a kit fix can reach a live post from the source the post
--      itself carries (013c83d0: Launcher: Design's source had to be rebuilt
--      from the built page). Read under a policy by whoever manages a class it
--      is posted to (instructor materials' rule, 0090), never by a student.
--   2. classroom_html_set_source: the one write, by a manager of the post,
--      admin-only this season exactly as the document's setter is.
--   3. classroom_html_health: every HTML post in every class for staff
--      (3bf69806): the kit and standard its built page names in its
--      `hx-kit` and `hx-standard` meta tags (standard 2.16), the older pages'
--      `hx-kit-css` comment, whether a source is stored, size and saved time.
--      Admin only; the meta tags are read in SQL so no document crosses the
--      wire.
--
-- WHY IT IS SAFE TO APPLY. Everything here is new: one table and two
-- functions. No existing function, policy or column changes, so nothing a
-- deployed client calls answers differently, and the deploy and this file may
-- land in either order (the client degrades on PGRST202 to "not available").
--
-- WHAT UNDOES IT, a person's paste:
--   drop function if exists public.classroom_html_health();
--   drop function if exists public.classroom_html_set_source(uuid, text, text);
--   drop table if exists public.classroom_html_sources;
-- (the table drop is a person's: the migrator refuses a dropped table).

create table if not exists public.classroom_html_sources (
	item_id uuid primary key references public.classroom_items (id) on delete cascade,
	source text not null check (octet_length(source) between 1 and 2097152),
	filename text not null check (char_length(btrim(filename)) between 1 and 300),
	stored_by text not null,
	updated_at timestamptz not null default now()
);

alter table public.classroom_html_sources enable row level security;
revoke all on table public.classroom_html_sources from public, anon, authenticated;
grant select on table public.classroom_html_sources to authenticated;

-- READ BY WHOEVER MANAGES A CLASS IT IS POSTED TO, as instructor materials are
-- (0090): a source is the author's file, never a student's.
drop policy if exists "classroom html sources follow their managers" on public.classroom_html_sources;
create policy "classroom html sources follow their managers"
	on public.classroom_html_sources
	for select
	to authenticated
	using (public.classroom_can_read_instructor_material(item_id));

-- ---------------------------------------------------------------------------
-- 2. The write and the read.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_html_set_source(p_item_id uuid, p_source text, p_filename text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_kind text;
	v_filename text := left(btrim(coalesce(p_filename, '')), 300);
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	select i.kind into v_kind from public.classroom_items i where i.id = p_item_id;
	if v_kind is null then
		raise exception 'That item does not exist.';
	end if;
	if v_kind <> 'assignment' then
		raise exception 'Only an assignment can carry an HTML source.';
	end if;
	if not public._classroom_manages_item(p_item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can set its source.';
	end if;
	-- THE SEASON GATE, as the document's own setter has it (0195).
	if not public.is_admin() then
		raise exception 'Uploading a ported HTML assignment is limited to site admins this season.';
	end if;

	if p_source is null then
		delete from public.classroom_html_sources where item_id = p_item_id;
		return jsonb_build_object('ok', true, 'item_id', p_item_id, 'removed', true);
	end if;
	if btrim(p_source) = '' then
		raise exception 'The source is empty.';
	end if;
	if octet_length(p_source) > 2097152 then
		raise exception 'The source is too large (2.0 MB cap).';
	end if;
	if position('<!-- hx:head -->' in p_source) = 0 or position('<!-- hx:script -->' in p_source) = 0 then
		raise exception 'That is not a kit source: it needs the hx:head and hx:script markers.';
	end if;
	if v_filename = '' then
		v_filename := 'assignment.src.html';
	end if;

	insert into public.classroom_html_sources (item_id, source, filename, stored_by, updated_at)
	values (p_item_id, p_source, v_filename, public.current_user_email(), now())
	on conflict (item_id) do update
		set source = excluded.source,
			filename = excluded.filename,
			stored_by = excluded.stored_by,
			updated_at = now();
	return jsonb_build_object('ok', true, 'item_id', p_item_id, 'filename', v_filename);
end;
$$;
revoke all on function public.classroom_html_set_source(uuid, text, text) from public, anon, authenticated;
grant execute on function public.classroom_html_set_source(uuid, text, text) to authenticated;


-- ---------------------------------------------------------------------------
-- 3. The health list. Admin only, every HTML post in every class.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_html_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if (select auth.uid()) is null or not public.is_admin() then
		raise exception 'Only a site admin can read this.';
	end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'item_id', i.id,
			'title', i.title,
			'published', i.published,
			'points', i.points,
			'due_at', i.due_at,
			'manifest_title', h.manifest->>'title',
			'manifest_course', h.manifest->>'course',
			'manifest_points', h.manifest->'points',
			'filename', h.filename,
			'bytes', octet_length(h.document),
			'updated_at', h.updated_at,
			'kit', substring(h.document from '<meta name="hx-kit" content="([^"]{1,80})"'),
			'standard', substring(h.document from '<meta name="hx-standard" content="([^"]{1,20})"'),
			'kit_css', substring(h.document from 'hx-kit: fonts, design-system tokens \(([^)]{1,120})\)'),
			'kit_page', position('id="hx-page"' in h.document) > 0,
			'source_filename', s.filename,
			'source_updated_at', s.updated_at,
			'classes', coalesce((
				select jsonb_agg(jsonb_build_object('section_id', sec.id, 'course', c.code, 'label', sec.label) order by c.code, sec.label)
				from public.classroom_postings pg
				join public.classroom_sections sec on sec.id = pg.section_id
				join public.classroom_courses c on c.id = sec.course_id
				where pg.item_id = i.id
			), '[]'::jsonb)
		) order by h.updated_at)
		from public.classroom_html_assignments h
		join public.classroom_items i on i.id = h.item_id
		left join public.classroom_html_sources s on s.item_id = h.item_id
	), '[]'::jsonb);
end;
$$;
revoke all on function public.classroom_html_health() from public, anon, authenticated;
grant execute on function public.classroom_html_health() to authenticated;


do $report$
begin
	raise notice '0328: % HTML assignments; % carry the hx-kit meta tag; no source stored yet.',
		(select count(*) from public.classroom_html_assignments),
		(select count(*) from public.classroom_html_assignments where position('<meta name="hx-kit"' in document) > 0);
end
$report$;
