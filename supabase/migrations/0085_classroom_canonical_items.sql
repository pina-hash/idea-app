-- 0085_classroom_canonical_items.sql
-- Classroom bundle 3: canonical content + postings, materials, pinning and
-- manual order, per-student view tracking, duplication, and linkage management.
--
-- THE STRUCTURAL CHANGE, and why it had to be structural. 0082 modelled a
-- multi-section publish as N INDEPENDENT ROWS sharing a `group_id`: one
-- classroom_posts row per section, one classroom_assignments row per section,
-- and (0083) one attachment row per section pointing at one Drive file. That
-- made "author once, publish to three classes" true only at the moment of
-- publishing -- editing afterwards touched ONE section's row, so the three
-- copies drifted apart silently and nothing in the schema could tell you they
-- were ever meant to be the same thing. group_id correlated them; it did not
-- keep them equal.
--
-- This migration inverts that. There is now ONE canonical record per piece of
-- content (public.classroom_items) carrying every authored field -- title,
-- body, points, due date, category, published state, pin, order -- and a
-- POSTING (public.classroom_postings) is nothing but "this item appears in this
-- section". Editing edits the item, so every linked class sees the change in
-- the same statement. Publishing a draft publishes it everywhere it is posted,
-- because `published` is a property of the item and postings carry no state of
-- their own. Linking a class later is one posting row; unlinking is one posting
-- row removed, and the content survives for the classes that still hold it.
--
-- WHAT THE DATA MIGRATION DOES, and the one thing it deliberately refuses to
-- do. Sibling rows are reunified into a single item BY group_id -- but ONLY
-- when they still agree on every authored field. Since 0082 rows were
-- independently editable, two siblings of one group can legitimately differ by
-- now, and collapsing them would silently discard one teacher's edit. Divergent
-- siblings therefore become separate canonical items, each with its own single
-- posting. Nothing is lost and nothing is duplicated: attachments and resources
-- are unioned and de-duplicated across the rows that reunify (they were
-- duplicated per section by construction), and every distinct piece of content
-- survives as exactly one item.
--
--   * MATERIALS. A third kind alongside post and assignment: title, body,
--     attachments and links, with no points, no due date and no submission.
--     `kind` is one column on the canonical record rather than a third table --
--     the sync, duplicate, pin, order and edit rules are identical for all
--     three, and a third table would be three copies of every one of them.
--
--   * PINNING + MANUAL ORDER live on the ITEM, not the posting, so a pinned or
--     reordered item reads the same way in every class it is posted to. Order
--     is set by handing the RPC the full visible list (classroom_set_item_order)
--     rather than by nudging one row, so the stored order is always exactly the
--     order somebody actually saw.
--
--   * VIEW TRACKING is the FIRST student write path in this module, and it is
--     shaped so that it cannot be anything else: classroom_mark_item_viewed
--     takes NO email parameter at all and resolves the caller from
--     current_user_email(), so "a student can only ever touch their own row" is
--     a property of the signature rather than a check that could be got wrong.
--     There is still no client write grant on any classroom table.
--
--   * EDIT VISIBILITY. `edited_at` is stamped only when a published item's
--     content actually changes, so "Updated" means an edit a student may have
--     missed -- not a draft being polished, and not a pin or a reorder.
--
-- Also here, and deliberately shared rather than classroom-specific: 0053's
-- app_feedback gains a moderation STATUS (new / seen / resolved) plus an
-- admin-only RPC to move it. See section 12 for why that does not break 0053's
-- append-only stance.
--
-- Apply manually in the Supabase SQL editor, after 0084.

-- ---------------------------------------------------------------------------
-- 1. The canonical content record.
-- ---------------------------------------------------------------------------

create table if not exists public.classroom_items (
	id uuid primary key default gen_random_uuid(),
	-- post = announcement, assignment = graded work, material = a standing
	-- reference (syllabus, rubric, link shelf) with nothing to hand in.
	kind text not null check (kind in ('post', 'assignment', 'material')),
	title text check (title is null or char_length(btrim(title)) between 1 and 300),
	-- The post body / assignment instructions / material description. One
	-- column, because it is one field on every kind.
	body text not null default '' check (char_length(body) <= 20000),
	points integer check (points is null or (points >= 0 and points <= 10000)),
	due_at timestamptz,
	category text check (category is null or char_length(btrim(category)) between 1 and 100),
	author_email text not null,
	author_name text,
	published boolean not null default true,
	-- Pinned items rise to the top of Stream and Classwork in EVERY class the
	-- item is posted to (see the header).
	pinned boolean not null default false,
	-- Manual order within Classwork. 0 = never placed by hand, which orders by
	-- the natural rule; a set order is 1..n over the list the teacher saw.
	sort_order integer not null default 0 check (sort_order >= 0),
	-- When this item first became visible to students. Null while it has only
	-- ever been a draft; it is what makes "edited AFTER publish" answerable.
	first_published_at timestamptz,
	-- Stamped only by a content change to an already-published item.
	edited_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	-- Points and a due date are assignment vocabulary; a material or an
	-- announcement carrying them would be a data model quietly disagreeing with
	-- the UI about what those kinds are.
	constraint classroom_items_grading_fields check (
		kind = 'assignment' or (points is null and due_at is null)
	),
	-- An assignment or a material is identified by its title; an announcement
	-- is identified by what it says.
	constraint classroom_items_titled check (
		kind = 'post' or (title is not null and btrim(title) <> '')
	),
	constraint classroom_items_post_body check (
		kind <> 'post' or btrim(body) <> ''
	)
);

create index if not exists classroom_items_kind_idx on public.classroom_items (kind);
create index if not exists classroom_items_created_idx on public.classroom_items (created_at desc);

-- One row per (item, section). Carries no state of its own ON PURPOSE: the
-- moment a posting could be independently published, pinned or ordered, the
-- copies could drift again and this whole migration would be undone.
create table if not exists public.classroom_postings (
	id uuid primary key default gen_random_uuid(),
	item_id uuid not null references public.classroom_items (id) on delete cascade,
	section_id uuid not null references public.classroom_sections (id) on delete cascade,
	created_at timestamptz not null default now(),
	unique (item_id, section_id)
);

create index if not exists classroom_postings_section_idx
	on public.classroom_postings (section_id);
create index if not exists classroom_postings_item_idx
	on public.classroom_postings (item_id);

-- Linked materials (URLs), canonical like everything else.
create table if not exists public.classroom_item_resources (
	id uuid primary key default gen_random_uuid(),
	item_id uuid not null references public.classroom_items (id) on delete cascade,
	label text not null check (char_length(btrim(label)) between 1 and 200),
	url text not null check (url ~* '^https?://' and char_length(url) <= 2000),
	sort_order integer not null default 1 check (sort_order >= 1),
	created_at timestamptz not null default now()
);

create index if not exists classroom_item_resources_item_idx
	on public.classroom_item_resources (item_id, sort_order);

-- Per-student last-viewed. Email-keyed like every other roster-adjacent table
-- in this module (0082's keying convention), so it works for a student whose
-- account exists before they have ever signed in.
create table if not exists public.classroom_item_views (
	student_email text not null
		check (student_email = lower(btrim(student_email)) and student_email like '%@%'),
	item_id uuid not null references public.classroom_items (id) on delete cascade,
	viewed_at timestamptz not null default now(),
	primary key (student_email, item_id)
);

create index if not exists classroom_item_views_item_idx
	on public.classroom_item_views (item_id);

-- ---------------------------------------------------------------------------
-- 2. Attachments move onto the canonical record.
--
-- 0083 stored one attachment ROW per section (all pointing at one Drive file)
-- because there was one content row per section. With a canonical item there is
-- one row per file, full stop -- which is also why the data migration below
-- de-duplicates by drive_file_id rather than carrying N identical rows across.
-- ---------------------------------------------------------------------------

alter table public.classroom_attachments
	add column if not exists item_id uuid references public.classroom_items (id) on delete cascade;

-- Dropped BEFORE the data migration below, not after: 0083's CHECK demands
-- exactly one of post_id / assignment_id, so the item-owned rows the migration
-- is about to write would be rejected by it on the way in.
alter table public.classroom_attachments
	drop constraint if exists classroom_attachments_one_owner;

-- ---------------------------------------------------------------------------
-- 3. The data migration.
--
-- Reunify by group_id, but only across rows that still AGREE (see the header).
-- The grouping key is therefore the group identity plus every authored field:
-- two siblings that were edited apart keep both versions, as two items.
-- ---------------------------------------------------------------------------

do $$
declare
	v_has_posts boolean;
	v_has_assignments boolean;
begin
	select to_regclass('public.classroom_posts') is not null into v_has_posts;
	select to_regclass('public.classroom_assignments') is not null into v_has_assignments;

	if v_has_posts then
		-- Posts -> items(kind='post').
		create temporary table _cl_post_map on commit drop as
		select
			coalesce(p.group_id, p.id) as group_key,
			coalesce(btrim(p.title), '') as k_title,
			p.body as k_body,
			p.published as k_published,
			p.id as post_id,
			p.section_id,
			p.title,
			p.author_email,
			p.author_name,
			p.created_at,
			p.updated_at
		from public.classroom_posts p;

		create temporary table _cl_post_items on commit drop as
		select
			gen_random_uuid() as item_id,
			m.group_key,
			m.k_title,
			m.k_body,
			m.k_published,
			min(m.title) as title,
			min(m.author_email) as author_email,
			min(m.author_name) as author_name,
			min(m.created_at) as created_at,
			max(m.updated_at) as updated_at
		from _cl_post_map m
		group by m.group_key, m.k_title, m.k_body, m.k_published;

		insert into public.classroom_items
			(id, kind, title, body, points, due_at, category, author_email, author_name,
				published, pinned, sort_order, first_published_at, edited_at, created_at, updated_at)
		select
			i.item_id, 'post', nullif(btrim(coalesce(i.title, '')), ''), i.k_body,
			null, null, null, i.author_email, i.author_name,
			i.k_published, false, 0,
			-- Anything already published has been visible since it was created;
			-- an updated_at that moved past created_at is a real post-publish edit.
			case when i.k_published then i.created_at end,
			case when i.k_published and i.updated_at > i.created_at + interval '1 second'
				then i.updated_at end,
			i.created_at, i.updated_at
		from _cl_post_items i;

		insert into public.classroom_postings (item_id, section_id, created_at)
		select distinct i.item_id, m.section_id, min(m.created_at) over (partition by i.item_id, m.section_id)
		from _cl_post_map m
		join _cl_post_items i
			on i.group_key = m.group_key
			and i.k_title = m.k_title
			and i.k_body = m.k_body
			and i.k_published = m.k_published
		on conflict (item_id, section_id) do nothing;

		-- Attachments: one row per DISTINCT Drive file per item (they were one
		-- row per section pointing at the same upload).
		insert into public.classroom_attachments
			(item_id, drive_file_id, filename, mime_type, size_bytes, uploaded_by, sort_order, created_at)
		select
			d.item_id, d.drive_file_id, d.filename, d.mime_type, d.size_bytes, d.uploaded_by,
			row_number() over (partition by d.item_id order by d.sort_order, d.created_at)::int,
			d.created_at
		from (
			select distinct on (i.item_id, t.drive_file_id)
				i.item_id, t.drive_file_id, t.filename, t.mime_type, t.size_bytes,
				t.uploaded_by, t.sort_order, t.created_at
			from public.classroom_attachments t
			join _cl_post_map m on m.post_id = t.post_id
			join _cl_post_items i
				on i.group_key = m.group_key
				and i.k_title = m.k_title
				and i.k_body = m.k_body
				and i.k_published = m.k_published
			where t.post_id is not null
			order by i.item_id, t.drive_file_id, t.sort_order, t.created_at
		) d;
	end if;

	if v_has_assignments then
		create temporary table _cl_asg_map on commit drop as
		select
			coalesce(a.group_id, a.id) as group_key,
			a.title as k_title,
			a.description as k_description,
			coalesce(a.points, -1) as k_points,
			coalesce(a.due_at, 'epoch'::timestamptz) as k_due,
			coalesce(a.category, '') as k_category,
			a.published as k_published,
			a.id as assignment_id,
			a.section_id,
			a.points,
			a.due_at,
			a.category,
			a.author_email,
			a.author_name,
			a.created_at,
			a.updated_at
		from public.classroom_assignments a;

		create temporary table _cl_asg_items on commit drop as
		select
			gen_random_uuid() as item_id,
			m.group_key, m.k_title, m.k_description, m.k_points, m.k_due, m.k_category, m.k_published,
			min(m.points) as points,
			min(m.due_at) as due_at,
			min(m.category) as category,
			min(m.author_email) as author_email,
			min(m.author_name) as author_name,
			min(m.created_at) as created_at,
			max(m.updated_at) as updated_at
		from _cl_asg_map m
		group by m.group_key, m.k_title, m.k_description, m.k_points, m.k_due, m.k_category, m.k_published;

		insert into public.classroom_items
			(id, kind, title, body, points, due_at, category, author_email, author_name,
				published, pinned, sort_order, first_published_at, edited_at, created_at, updated_at)
		select
			i.item_id, 'assignment', i.k_title, i.k_description, i.points, i.due_at, i.category,
			i.author_email, i.author_name, i.k_published, false, 0,
			case when i.k_published then i.created_at end,
			case when i.k_published and i.updated_at > i.created_at + interval '1 second'
				then i.updated_at end,
			i.created_at, i.updated_at
		from _cl_asg_items i;

		insert into public.classroom_postings (item_id, section_id, created_at)
		select distinct i.item_id, m.section_id, min(m.created_at) over (partition by i.item_id, m.section_id)
		from _cl_asg_map m
		join _cl_asg_items i
			on i.group_key = m.group_key
			and i.k_title = m.k_title
			and i.k_description = m.k_description
			and i.k_points = m.k_points
			and i.k_due = m.k_due
			and i.k_category = m.k_category
			and i.k_published = m.k_published
		on conflict (item_id, section_id) do nothing;

		-- Resources: unioned and de-duplicated by (label, url) across the rows
		-- that reunify, so no link is lost and none appears twice.
		insert into public.classroom_item_resources (item_id, label, url, sort_order)
		select d.item_id, d.label, d.url,
			row_number() over (partition by d.item_id order by d.sort_order, d.label)::int
		from (
			select distinct on (i.item_id, r.label, r.url)
				i.item_id, r.label, r.url, r.sort_order
			from public.classroom_assignment_resources r
			join _cl_asg_map m on m.assignment_id = r.assignment_id
			join _cl_asg_items i
				on i.group_key = m.group_key
				and i.k_title = m.k_title
				and i.k_description = m.k_description
				and i.k_points = m.k_points
				and i.k_due = m.k_due
				and i.k_category = m.k_category
				and i.k_published = m.k_published
			order by i.item_id, r.label, r.url, r.sort_order
		) d;

		insert into public.classroom_attachments
			(item_id, drive_file_id, filename, mime_type, size_bytes, uploaded_by, sort_order, created_at)
		select
			d.item_id, d.drive_file_id, d.filename, d.mime_type, d.size_bytes, d.uploaded_by,
			row_number() over (partition by d.item_id order by d.sort_order, d.created_at)::int,
			d.created_at
		from (
			select distinct on (i.item_id, t.drive_file_id)
				i.item_id, t.drive_file_id, t.filename, t.mime_type, t.size_bytes,
				t.uploaded_by, t.sort_order, t.created_at
			from public.classroom_attachments t
			join _cl_asg_map m on m.assignment_id = t.assignment_id
			join _cl_asg_items i
				on i.group_key = m.group_key
				and i.k_title = m.k_title
				and i.k_description = m.k_description
				and i.k_points = m.k_points
				and i.k_due = m.k_due
				and i.k_category = m.k_category
				and i.k_published = m.k_published
			where t.assignment_id is not null
			order by i.item_id, t.drive_file_id, t.sort_order, t.created_at
		) d;
	end if;
end;
$$;

-- Everything that survived the migration is now item-owned; the old rows go
-- with their tables below.
delete from public.classroom_attachments where item_id is null;

-- 0083's attachment policy names classroom_can_read_post / _assignment and
-- reads post_id / assignment_id, and a policy is a REAL dependency on both the
-- columns and the functions -- so it has to go before either can be dropped.
drop policy if exists "classroom attachments follow their owner" on public.classroom_attachments;

alter table public.classroom_attachments drop column if exists post_id;
alter table public.classroom_attachments drop column if exists assignment_id;
alter table public.classroom_attachments alter column item_id set not null;

create index if not exists classroom_attachments_item_idx
	on public.classroom_attachments (item_id, sort_order);

-- ---------------------------------------------------------------------------
-- 4. Retire the per-section content tables and every function that reads them.
--
-- Dropped rather than left in place: two sources of truth for "what did the
-- teacher write" is exactly the drift this migration exists to end, and a
-- lingering classroom_posts would be the one nobody remembers to update.
--
-- ORDER MATTERS HERE. An RLS policy records a real dependency on every function
-- its expression calls, so dropping classroom_can_read_post while the
-- attachments policy still names it fails outright. The policy goes first; the
-- content tables take their OWN policies with them; the functions go last.
-- ---------------------------------------------------------------------------

drop policy if exists "classroom attachments follow their owner" on public.classroom_attachments;

drop table if exists public.classroom_assignment_resources;
drop table if exists public.classroom_assignments;
drop table if exists public.classroom_posts;

drop function if exists public.classroom_create_post(uuid[], text, text, boolean);
drop function if exists public.classroom_update_post(uuid, text, text, boolean);
drop function if exists public.classroom_delete_post(uuid);
drop function if exists public.classroom_create_assignment(uuid[], text, text, integer, timestamptz, text, boolean, jsonb);
drop function if exists public.classroom_update_assignment(uuid, text, text, integer, timestamptz, text, boolean, jsonb);
drop function if exists public.classroom_delete_assignment(uuid);
drop function if exists public.classroom_add_attachment(text, uuid[], text, text, text, bigint);
drop function if exists public.classroom_can_read_post(uuid);
drop function if exists public.classroom_can_read_assignment(uuid);
drop function if exists public._classroom_attachments_json(uuid, uuid);
drop function if exists public.classroom_view_as_section(text, uuid);
drop function if exists public.classroom_view_as_assignment(text, uuid, uuid);
drop function if exists public.classroom_view_as_can_read_attachment(text, uuid);
drop function if exists public._classroom_validate_resources(jsonb);

-- ---------------------------------------------------------------------------
-- 5. Visibility helpers.
-- ---------------------------------------------------------------------------

-- The single question every content policy in this module now asks. An item is
-- readable when ANY of its postings lands in a section the caller manages, or
-- (published only) in one they are actively enrolled in.
create or replace function public.classroom_can_read_item(p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1
		from public.classroom_postings pg
		join public.classroom_items i on i.id = pg.item_id
		where pg.item_id = p_item_id
			and (
				public.classroom_manages_section(pg.section_id)
				or (i.published and public.classroom_is_enrolled(pg.section_id))
			)
	);
$$;

revoke all on function public.classroom_can_read_item(uuid) from public;
grant execute on function public.classroom_can_read_item(uuid) to authenticated;

-- Does the caller manage EVERY section this item is posted to? That is the bar
-- for editing it, because an edit changes what every one of those classes sees
-- (see the header): a teacher who manages only some of them would otherwise be
-- rewriting another teacher's class content. Unlinking a single section is the
-- deliberately weaker action -- see classroom_remove_posting.
create or replace function public._classroom_manages_item(p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (select 1 from public.classroom_postings where item_id = p_item_id)
		and not exists (
			select 1 from public.classroom_postings pg
			where pg.item_id = p_item_id
				and not public.classroom_manages_section(pg.section_id)
		);
$$;

revoke all on function public._classroom_manages_item(uuid) from public;

-- ---------------------------------------------------------------------------
-- 6. Privileges + RLS. SELECT only, as everywhere else in this module.
-- ---------------------------------------------------------------------------

revoke all on public.classroom_items from anon, authenticated;
grant select on public.classroom_items to authenticated;
alter table public.classroom_items enable row level security;

drop policy if exists "classroom items readable" on public.classroom_items;
create policy "classroom items readable"
	on public.classroom_items
	for select
	to authenticated
	using (public.classroom_can_read_item(id));

revoke all on public.classroom_postings from anon, authenticated;
grant select on public.classroom_postings to authenticated;
alter table public.classroom_postings enable row level security;

-- THE draft rule, stated once: a manager sees every posting of their sections,
-- an enrolled student only the postings of PUBLISHED items. Nothing in
-- application code repeats it.
drop policy if exists "classroom postings readable" on public.classroom_postings;
create policy "classroom postings readable"
	on public.classroom_postings
	for select
	to authenticated
	using (
		public.classroom_manages_section(section_id)
		or (
			public.classroom_is_enrolled(section_id)
			and exists (
				select 1 from public.classroom_items i
				where i.id = item_id and i.published
			)
		)
	);

revoke all on public.classroom_item_resources from anon, authenticated;
grant select on public.classroom_item_resources to authenticated;
alter table public.classroom_item_resources enable row level security;

drop policy if exists "classroom item resources follow their item" on public.classroom_item_resources;
create policy "classroom item resources follow their item"
	on public.classroom_item_resources
	for select
	to authenticated
	using (public.classroom_can_read_item(item_id));

-- The attachments policy is re-pointed at the item; 0083's post/assignment
-- delegation went with the tables it named.
drop policy if exists "classroom attachments follow their owner" on public.classroom_attachments;
drop policy if exists "classroom attachments follow their item" on public.classroom_attachments;
create policy "classroom attachments follow their item"
	on public.classroom_attachments
	for select
	to authenticated
	using (public.classroom_can_read_item(item_id));

revoke all on public.classroom_item_views from anon, authenticated;
grant select on public.classroom_item_views to authenticated;
alter table public.classroom_item_views enable row level security;

-- Own rows only. There is no manager clause: which items a student has opened
-- is about the student, not about the class, and no surface in this module
-- shows it to anyone else.
drop policy if exists "classroom item views own rows" on public.classroom_item_views;
create policy "classroom item views own rows"
	on public.classroom_item_views
	for select
	to authenticated
	using (student_email = public.current_user_email());

-- ---------------------------------------------------------------------------
-- 7. Internal helpers.
-- ---------------------------------------------------------------------------

create or replace function public._classroom_item_attachments_json(p_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(jsonb_agg(jsonb_build_object(
		'id', t.id,
		'filename', t.filename,
		'mime_type', t.mime_type,
		'size_bytes', t.size_bytes,
		'sort_order', t.sort_order
	) order by t.sort_order, t.created_at), '[]'::jsonb)
	from public.classroom_attachments t
	where t.item_id = p_item_id;
$$;

revoke all on function public._classroom_item_attachments_json(uuid) from public;

create or replace function public._classroom_item_resources_json(p_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(jsonb_agg(jsonb_build_object(
		'id', r.id, 'label', r.label, 'url', r.url, 'sort_order', r.sort_order
	) order by r.sort_order), '[]'::jsonb)
	from public.classroom_item_resources r
	where r.item_id = p_item_id;
$$;

revoke all on function public._classroom_item_resources_json(uuid) from public;

-- Replaces 0082's _classroom_validate_resources for the item tables. Same
-- shape and same rules; renamed so the old one can go with the table it fed.
create or replace function public._classroom_write_resources(p_item_id uuid, p_resources jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_item jsonb;
	v_label text;
	v_url text;
	v_i integer := 0;
begin
	if p_resources is null or p_resources = 'null'::jsonb then
		return;
	end if;
	if jsonb_typeof(p_resources) <> 'array' then
		raise exception 'Links must be a list of {label, url} pairs.';
	end if;

	delete from public.classroom_item_resources where item_id = p_item_id;

	for v_item in select * from jsonb_array_elements(p_resources) loop
		v_i := v_i + 1;
		if v_i > 20 then
			raise exception 'At most 20 links per item.';
		end if;
		v_url := btrim(coalesce(v_item->>'url', ''));
		if v_url = '' then
			raise exception 'Link % is missing its URL.', v_i;
		end if;
		if v_url !~* '^https?://' then
			raise exception 'Link URLs must start with http:// or https:// (link %).', v_i;
		end if;
		if char_length(v_url) > 2000 then
			raise exception 'Link % has a URL longer than 2000 characters.', v_i;
		end if;
		v_label := left(coalesce(nullif(btrim(coalesce(v_item->>'label', '')), ''), v_url), 200);
		insert into public.classroom_item_resources (item_id, label, url, sort_order)
		values (p_item_id, v_label, v_url, v_i);
	end loop;
end;
$$;

revoke all on function public._classroom_write_resources(uuid, jsonb) from public;

-- Shared field validation for create + update, so the two can never disagree
-- about what a valid item is.
create or replace function public._classroom_check_item_fields(
	p_kind text,
	p_title text,
	p_body text,
	p_points integer,
	p_due_at timestamptz,
	p_category text
)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
	if p_kind not in ('post', 'assignment', 'material') then
		raise exception 'Unknown content type "%".', p_kind;
	end if;
	if p_kind = 'post' then
		if coalesce(btrim(p_body), '') = '' then
			raise exception 'The announcement needs a body.';
		end if;
	else
		if coalesce(btrim(p_title), '') = '' then
			raise exception 'A title is required.';
		end if;
	end if;
	if char_length(coalesce(p_title, '')) > 300 then
		raise exception 'The title is limited to 300 characters.';
	end if;
	if char_length(coalesce(p_body, '')) > 20000 then
		raise exception 'The body is limited to 20000 characters.';
	end if;
	if p_kind <> 'assignment' and (p_points is not null or p_due_at is not null) then
		raise exception 'Only an assignment can carry points or a due date.';
	end if;
	if p_points is not null and (p_points < 0 or p_points > 10000) then
		raise exception 'Points must be between 0 and 10000.';
	end if;
	if p_category is not null and char_length(btrim(p_category)) > 100 then
		raise exception 'The grading category is limited to 100 characters.';
	end if;
end;
$$;

revoke all on function public._classroom_check_item_fields(text, text, text, integer, timestamptz, text) from public;

-- ---------------------------------------------------------------------------
-- 8. Item writes.
-- ---------------------------------------------------------------------------

-- Author once, post to N sections: ONE canonical item, one posting per section.
-- The target list is authorized all-or-nothing by 0082's
-- _classroom_check_publish_targets, unchanged.
create or replace function public.classroom_create_item(
	p_kind text,
	p_section_ids uuid[],
	p_title text default null,
	p_body text default '',
	p_points integer default null,
	p_due_at timestamptz default null,
	p_category text default null,
	p_published boolean default true,
	p_resources jsonb default '[]'::jsonb,
	p_pinned boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_kind text := lower(btrim(coalesce(p_kind, '')));
	v_sections uuid[];
	v_section uuid;
	v_title text := nullif(btrim(coalesce(p_title, '')), '');
	v_body text := coalesce(p_body, '');
	v_category text := nullif(btrim(coalesce(p_category, '')), '');
	v_published boolean := coalesce(p_published, true);
	v_id uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	perform public._classroom_check_item_fields(
		v_kind, v_title, v_body, p_points, p_due_at, v_category);

	v_sections := public._classroom_check_publish_targets(p_section_ids);

	insert into public.classroom_items
		(kind, title, body, points, due_at, category, author_email, author_name,
			published, pinned, first_published_at)
	values (v_kind, v_title, v_body, p_points, p_due_at, v_category,
		public.current_user_email(), public._classroom_author_name(),
		v_published, coalesce(p_pinned, false),
		case when v_published then now() end)
	returning id into v_id;

	foreach v_section in array v_sections loop
		insert into public.classroom_postings (item_id, section_id)
		values (v_id, v_section);
	end loop;

	perform public._classroom_write_resources(v_id, p_resources);

	return jsonb_build_object(
		'item_id', v_id,
		'section_ids', to_jsonb(v_sections),
		'published', v_published
	);
end;
$$;

revoke all on function public.classroom_create_item(text, uuid[], text, text, integer, timestamptz, text, boolean, jsonb, boolean) from public;
grant execute on function public.classroom_create_item(text, uuid[], text, text, integer, timestamptz, text, boolean, jsonb, boolean) to authenticated;

-- Full-state edit of the CANONICAL record, so every linked class sees it at
-- once. p_published null leaves the current state; p_resources null leaves the
-- links untouched, anything else is a full replacement (the 0082 convention).
--
-- `edited_at` is stamped only when a genuinely published item's CONTENT
-- changed: publishing a draft is not an edit, and neither is a pin or a
-- reorder, so an "Updated" badge always means something a student may have
-- missed.
create or replace function public.classroom_update_item(
	p_id uuid,
	p_title text default null,
	p_body text default '',
	p_points integer default null,
	p_due_at timestamptz default null,
	p_category text default null,
	p_published boolean default null,
	p_resources jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_old public.classroom_items%rowtype;
	v_title text := nullif(btrim(coalesce(p_title, '')), '');
	v_body text := coalesce(p_body, '');
	v_category text := nullif(btrim(coalesce(p_category, '')), '');
	v_published boolean;
	v_changed boolean;
	v_edited timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select i.* into v_old from public.classroom_items i where i.id = p_id for update;
	if not found then
		raise exception 'That item does not exist.';
	end if;
	if not public._classroom_manages_item(p_id) then
		raise exception 'Only the teacher of record for every class this is posted to can edit it.';
	end if;

	perform public._classroom_check_item_fields(
		v_old.kind, v_title, v_body, p_points, p_due_at, v_category);

	v_published := coalesce(p_published, v_old.published);

	v_changed :=
		coalesce(v_title, '') is distinct from coalesce(v_old.title, '')
		or v_body is distinct from v_old.body
		or p_points is distinct from v_old.points
		or p_due_at is distinct from v_old.due_at
		or coalesce(v_category, '') is distinct from coalesce(v_old.category, '')
		or p_resources is not null;

	v_edited := case
		when v_changed and v_old.first_published_at is not null then now()
		else v_old.edited_at
	end;

	update public.classroom_items
	set title = v_title,
		body = v_body,
		points = p_points,
		due_at = p_due_at,
		category = v_category,
		published = v_published,
		first_published_at = coalesce(v_old.first_published_at, case when v_published then now() end),
		edited_at = v_edited,
		updated_at = now()
	where id = p_id;

	if p_resources is not null then
		perform public._classroom_write_resources(p_id, p_resources);
	end if;

	return jsonb_build_object('item_id', p_id, 'published', v_published, 'edited', v_changed);
end;
$$;

revoke all on function public.classroom_update_item(uuid, text, text, integer, timestamptz, text, boolean, jsonb) from public;
grant execute on function public.classroom_update_item(uuid, text, text, integer, timestamptz, text, boolean, jsonb) to authenticated;

-- Deleting the canonical record takes every posting, resource, attachment row
-- and view with it. The orphaned Drive file ids come back for the route to
-- sweep, exactly as 0083's delete RPCs reported them.
create or replace function public.classroom_delete_item(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_files text[];
	v_orphans text[];
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not exists (select 1 from public.classroom_items where id = p_id) then
		raise exception 'That item does not exist.';
	end if;
	if not public._classroom_manages_item(p_id) then
		raise exception 'Only the teacher of record for every class this is posted to can delete it.';
	end if;

	select coalesce(array_agg(distinct drive_file_id), '{}'::text[]) into v_files
	from public.classroom_attachments where item_id = p_id;

	delete from public.classroom_items where id = p_id;

	select coalesce(array_agg(f), '{}'::text[]) into v_orphans
	from unnest(v_files) as f
	where not exists (
		select 1 from public.classroom_attachments t where t.drive_file_id = f
	);

	return jsonb_build_object('deleted', true, 'orphaned_drive_file_ids', to_jsonb(v_orphans));
end;
$$;

revoke all on function public.classroom_delete_item(uuid) from public;
grant execute on function public.classroom_delete_item(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Linkage management, duplication, pinning, ordering.
-- ---------------------------------------------------------------------------

-- Post an existing item to more sections. Authorizes the NEW targets the usual
-- all-or-nothing way AND requires the caller to already manage the item, since
-- widening its audience is a change to the item.
create or replace function public.classroom_add_postings(
	p_item_id uuid,
	p_section_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_sections uuid[];
	v_section uuid;
	v_added integer := 0;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not exists (select 1 from public.classroom_items where id = p_item_id) then
		raise exception 'That item does not exist.';
	end if;
	if not public._classroom_manages_item(p_item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can post it elsewhere.';
	end if;

	v_sections := public._classroom_check_publish_targets(p_section_ids);

	foreach v_section in array v_sections loop
		insert into public.classroom_postings (item_id, section_id)
		values (p_item_id, v_section)
		on conflict (item_id, section_id) do nothing;
		if found then
			v_added := v_added + 1;
		end if;
	end loop;

	return jsonb_build_object('ok', true, 'item_id', p_item_id, 'added', v_added);
end;
$$;

revoke all on function public.classroom_add_postings(uuid, uuid[]) from public;
grant execute on function public.classroom_add_postings(uuid, uuid[]) to authenticated;

-- Unlink ONE class. Deliberately the weaker permission (manage THAT section,
-- not the whole item): taking your own class off somebody's shared handout is
-- a decision about your class, and it changes nothing for anyone else.
--
-- The last posting is refused -- a structured refusal, not an exception,
-- because "this is the only class it is in, delete it instead" is information
-- the UI renders. An item with no postings would be unreadable by anyone,
-- including its author.
create or replace function public.classroom_remove_posting(
	p_item_id uuid,
	p_section_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_total integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not exists (
		select 1 from public.classroom_postings
		where item_id = p_item_id and section_id = p_section_id
	) then
		raise exception 'That item is not posted to that class.';
	end if;
	if not public.classroom_manages_section(p_section_id) then
		raise exception 'Only the section''s teacher of record or a site admin can unlink it.';
	end if;

	select count(*) into v_total from public.classroom_postings where item_id = p_item_id;
	if v_total <= 1 then
		return jsonb_build_object('ok', false, 'reason', 'last_posting');
	end if;

	delete from public.classroom_postings
	where item_id = p_item_id and section_id = p_section_id;

	return jsonb_build_object('ok', true, 'item_id', p_item_id, 'remaining', v_total - 1);
end;
$$;

revoke all on function public.classroom_remove_posting(uuid, uuid) from public;
grant execute on function public.classroom_remove_posting(uuid, uuid) to authenticated;

-- Copy an item into a NEW, INDEPENDENT draft. Attachments are carried over by
-- referencing the same Drive file with new rows -- no re-upload, and no shared
-- row that deleting one copy would take from the other (0083's orphan rule
-- already handles one blob backing several rows).
create or replace function public.classroom_duplicate_item(
	p_item_id uuid,
	p_section_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_old public.classroom_items%rowtype;
	v_sections uuid[];
	v_section uuid;
	v_id uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select i.* into v_old from public.classroom_items i where i.id = p_item_id;
	if not found then
		raise exception 'That item does not exist.';
	end if;
	if not public.classroom_can_read_item(p_item_id) or not public._classroom_manages_item(p_item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can duplicate it.';
	end if;

	if p_section_ids is null or array_length(p_section_ids, 1) is null then
		select array_agg(section_id) into v_sections
		from public.classroom_postings where item_id = p_item_id;
	else
		v_sections := p_section_ids;
	end if;
	v_sections := public._classroom_check_publish_targets(v_sections);

	-- Always a DRAFT: a duplicate is a starting point someone is about to edit,
	-- and publishing it the moment it is made would put an unfinished copy in
	-- front of a class.
	insert into public.classroom_items
		(kind, title, body, points, due_at, category, author_email, author_name,
			published, pinned, sort_order)
	values (v_old.kind,
		case when v_old.kind = 'post' then v_old.title
			else left(coalesce(v_old.title, '') || ' (copy)', 300) end,
		v_old.body, v_old.points, v_old.due_at, v_old.category,
		public.current_user_email(), public._classroom_author_name(),
		false, false, 0)
	returning id into v_id;

	foreach v_section in array v_sections loop
		insert into public.classroom_postings (item_id, section_id) values (v_id, v_section);
	end loop;

	insert into public.classroom_item_resources (item_id, label, url, sort_order)
	select v_id, r.label, r.url, r.sort_order
	from public.classroom_item_resources r where r.item_id = p_item_id;

	insert into public.classroom_attachments
		(item_id, drive_file_id, filename, mime_type, size_bytes, uploaded_by, sort_order)
	select v_id, t.drive_file_id, t.filename, t.mime_type, t.size_bytes,
		public.current_user_email(), t.sort_order
	from public.classroom_attachments t where t.item_id = p_item_id;

	return jsonb_build_object('ok', true, 'item_id', v_id, 'source_item_id', p_item_id);
end;
$$;

revoke all on function public.classroom_duplicate_item(uuid, uuid[]) from public;
grant execute on function public.classroom_duplicate_item(uuid, uuid[]) to authenticated;

create or replace function public.classroom_set_item_pinned(p_item_id uuid, p_pinned boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not exists (select 1 from public.classroom_items where id = p_item_id) then
		raise exception 'That item does not exist.';
	end if;
	if not public._classroom_manages_item(p_item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can pin it.';
	end if;

	-- Deliberately NOT an edit: a pin changes where the item sits, not what it
	-- says, so it never stamps edited_at or raises an "Updated" badge.
	update public.classroom_items
	set pinned = coalesce(p_pinned, false), updated_at = now()
	where id = p_item_id;

	return jsonb_build_object('ok', true, 'item_id', p_item_id, 'pinned', coalesce(p_pinned, false));
end;
$$;

revoke all on function public.classroom_set_item_pinned(uuid, boolean) from public;
grant execute on function public.classroom_set_item_pinned(uuid, boolean) to authenticated;

-- Manual order, set by handing over the FULL visible list in its new order.
-- Nudging a single row would need the server to reconstruct the exact list the
-- teacher was looking at (which depends on due dates, pins and "now"); taking
-- the list itself means the stored order is always precisely what somebody saw.
create or replace function public.classroom_set_item_order(p_item_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_id uuid;
	v_i integer := 0;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_item_ids is null or array_length(p_item_ids, 1) is null then
		raise exception 'Nothing to order.';
	end if;
	if array_length(p_item_ids, 1) > 500 then
		raise exception 'At most 500 items per reorder.';
	end if;

	foreach v_id in array p_item_ids loop
		if not exists (select 1 from public.classroom_items where id = v_id) then
			raise exception 'One of those items does not exist.';
		end if;
		if not public._classroom_manages_item(v_id) then
			raise exception 'Only the teacher of record for every class an item is posted to can reorder it.';
		end if;
	end loop;

	foreach v_id in array p_item_ids loop
		v_i := v_i + 1;
		update public.classroom_items set sort_order = v_i where id = v_id;
	end loop;

	return jsonb_build_object('ok', true, 'ordered', v_i);
end;
$$;

revoke all on function public.classroom_set_item_order(uuid[]) from public;
grant execute on function public.classroom_set_item_order(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Student view tracking -- the first student write path in this module.
--
-- NO EMAIL PARAMETER, on purpose: the caller is resolved from
-- current_user_email(), the same function every own-row policy in this schema
-- keys on, so touching somebody else's row is not something this function can
-- be asked to do. It also refuses an item the caller cannot read, so it can
-- never be used to probe for the existence of a foreign item.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_mark_item_viewed(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_email text := public.current_user_email();
begin
	if v_uid is null or coalesce(v_email, '') = '' then
		raise exception 'You must be signed in.';
	end if;
	if not public.classroom_can_read_item(p_item_id) then
		raise exception 'That item does not exist.';
	end if;

	insert into public.classroom_item_views (student_email, item_id, viewed_at)
	values (v_email, p_item_id, now())
	on conflict (student_email, item_id) do update set viewed_at = now();

	return jsonb_build_object('ok', true, 'item_id', p_item_id);
end;
$$;

revoke all on function public.classroom_mark_item_viewed(uuid) from public;
grant execute on function public.classroom_mark_item_viewed(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Section delete + attachment writes, re-pointed at items.
-- ---------------------------------------------------------------------------

-- Recreated from 0083: it counted classroom_posts / classroom_assignments,
-- which are gone. It now counts the POSTINGS in the section -- which is the
-- honest number anyway, since an item posted elsewhere too is not lost by
-- deleting this section, only unlinked from it.
create or replace function public.classroom_delete_section(
	p_id uuid,
	p_confirm_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_label text;
	v_items integer;
	v_enrollments integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select s.label into v_label from public.classroom_sections s where s.id = p_id for update;
	if v_label is null then
		raise exception 'That section does not exist.';
	end if;
	if not public.classroom_manages_section(p_id) then
		raise exception 'Only the section''s teacher of record or a site admin can delete it.';
	end if;

	select count(*) into v_items from public.classroom_postings where section_id = p_id;
	select count(*) into v_enrollments from public.classroom_enrollments where section_id = p_id;

	if v_items > 0 or v_enrollments > 0 then
		return jsonb_build_object(
			'ok', false,
			'reason', 'not_empty',
			'items', v_items,
			'enrollments', v_enrollments
		);
	end if;

	if lower(btrim(coalesce(p_confirm_label, ''))) <> lower(btrim(v_label)) then
		raise exception 'Type the section label ("%") to confirm deletion.', v_label;
	end if;

	delete from public.classroom_sections where id = p_id;
	return jsonb_build_object('ok', true, 'deleted', true, 'label', v_label);
end;
$$;

revoke all on function public.classroom_delete_section(uuid, text) from public;
grant execute on function public.classroom_delete_section(uuid, text) to authenticated;

-- Attach ONE uploaded Drive file to ONE canonical item. 0083's plural-owner
-- signature existed because a multi-section publish made N content rows; with a
-- canonical record there is exactly one place a file belongs.
create or replace function public.classroom_add_attachment(
	p_item_id uuid,
	p_drive_file_id text,
	p_filename text,
	p_mime_type text,
	p_size_bytes bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_file text := btrim(coalesce(p_drive_file_id, ''));
	v_name text := left(btrim(coalesce(p_filename, '')), 300);
	v_mime text := left(btrim(coalesce(p_mime_type, '')), 200);
	v_next integer;
	v_id uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if v_file = '' then
		raise exception 'A Drive file id is required.';
	end if;
	if v_name = '' then
		v_name := 'attachment';
	end if;
	if v_mime = '' then
		v_mime := 'application/octet-stream';
	end if;
	if not exists (select 1 from public.classroom_items where id = p_item_id) then
		raise exception 'That item does not exist.';
	end if;
	if not public._classroom_manages_item(p_item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can attach files here.';
	end if;

	select coalesce(max(sort_order), 0) + 1 into v_next
	from public.classroom_attachments where item_id = p_item_id;

	insert into public.classroom_attachments
		(item_id, drive_file_id, filename, mime_type, size_bytes, uploaded_by, sort_order)
	values (p_item_id, v_file, v_name, v_mime, p_size_bytes, public.current_user_email(), v_next)
	returning id into v_id;

	return jsonb_build_object('ok', true, 'attachment_id', v_id, 'drive_file_id', v_file);
end;
$$;

revoke all on function public.classroom_add_attachment(uuid, text, text, text, bigint) from public;
grant execute on function public.classroom_add_attachment(uuid, text, text, text, bigint) to authenticated;

-- Recreated for the item owner. Unchanged in shape: it still reports whether
-- the Drive blob is now unreferenced, because a duplicate carries the same
-- file id onto a second row.
create or replace function public.classroom_delete_attachment(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_row public.classroom_attachments%rowtype;
	v_remaining integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select * into v_row from public.classroom_attachments where id = p_id for update;
	if not found then
		raise exception 'That attachment does not exist.';
	end if;
	if not public._classroom_manages_item(v_row.item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can remove this attachment.';
	end if;

	delete from public.classroom_attachments where id = p_id;

	select count(*) into v_remaining
	from public.classroom_attachments
	where drive_file_id = v_row.drive_file_id;

	return jsonb_build_object(
		'ok', true,
		'deleted', true,
		'drive_file_id', v_row.drive_file_id,
		'orphaned', v_remaining = 0
	);
end;
$$;

revoke all on function public.classroom_delete_attachment(uuid) from public;
grant execute on function public.classroom_delete_attachment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 12. View as student (admin only), rebuilt on items. READS ONLY, exactly as
-- 0083 established: there is still no view_as write RPC of any kind.
-- ---------------------------------------------------------------------------

create or replace function public._classroom_item_json(p_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select jsonb_build_object(
		'id', i.id, 'kind', i.kind, 'title', i.title, 'body', i.body,
		'points', i.points, 'due_at', i.due_at, 'category', i.category,
		'author_email', i.author_email, 'author_name', i.author_name,
		'published', i.published, 'pinned', i.pinned, 'sort_order', i.sort_order,
		'first_published_at', i.first_published_at, 'edited_at', i.edited_at,
		'created_at', i.created_at, 'updated_at', i.updated_at,
		'resources', public._classroom_item_resources_json(i.id),
		'attachments', public._classroom_item_attachments_json(i.id)
	)
	from public.classroom_items i where i.id = p_item_id;
$$;

revoke all on function public._classroom_item_json(uuid) from public;

create or replace function public.classroom_view_as_section(p_email text, p_section_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_view_as_guard(p_email);
	v_section jsonb;
begin
	select jsonb_build_object(
		'id', s.id, 'course_id', s.course_id, 'label', s.label, 'block', s.block,
		'teacher_email', s.teacher_email, 'active', s.active,
		'course', jsonb_build_object('id', c.id, 'code', c.code, 'title', c.title, 'active', c.active)
	) into v_section
	from public.classroom_enrollments e
	join public.classroom_sections s on s.id = e.section_id
	join public.classroom_courses c on c.id = s.course_id
	where e.student_email = v_email and e.active and s.id = p_section_id;

	if v_section is null then
		return null;
	end if;

	return jsonb_build_object(
		'section', v_section,
		'items', coalesce((
			select jsonb_agg(public._classroom_item_json(i.id) || jsonb_build_object(
				'viewed_at', (
					select v.viewed_at from public.classroom_item_views v
					where v.item_id = i.id and v.student_email = v_email
				)
			) order by i.created_at desc)
			from public.classroom_items i
			join public.classroom_postings pg on pg.item_id = i.id
			where pg.section_id = p_section_id and i.published
		), '[]'::jsonb)
	);
end;
$$;

revoke all on function public.classroom_view_as_section(text, uuid) from public;
grant execute on function public.classroom_view_as_section(text, uuid) to authenticated;

create or replace function public.classroom_view_as_item(
	p_email text,
	p_section_id uuid,
	p_item_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_view_as_guard(p_email);
	v_section jsonb;
	v_item jsonb;
begin
	select jsonb_build_object(
		'id', s.id, 'course_id', s.course_id, 'label', s.label, 'block', s.block,
		'teacher_email', s.teacher_email, 'active', s.active,
		'course', jsonb_build_object('id', c.id, 'code', c.code, 'title', c.title, 'active', c.active)
	) into v_section
	from public.classroom_enrollments e
	join public.classroom_sections s on s.id = e.section_id
	join public.classroom_courses c on c.id = s.course_id
	where e.student_email = v_email and e.active and s.id = p_section_id;

	if v_section is null then
		return null;
	end if;

	select public._classroom_item_json(i.id) into v_item
	from public.classroom_items i
	join public.classroom_postings pg on pg.item_id = i.id
	where i.id = p_item_id and pg.section_id = p_section_id and i.published;

	if v_item is null then
		return null;
	end if;

	return jsonb_build_object('section', v_section, 'item', v_item);
end;
$$;

revoke all on function public.classroom_view_as_item(text, uuid, uuid) from public;
grant execute on function public.classroom_view_as_item(text, uuid, uuid) to authenticated;

create or replace function public.classroom_view_as_can_read_attachment(
	p_email text,
	p_attachment_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_view_as_guard(p_email);
begin
	return exists (
		select 1
		from public.classroom_attachments t
		join public.classroom_items i on i.id = t.item_id
		join public.classroom_postings pg on pg.item_id = i.id
		join public.classroom_enrollments e on e.section_id = pg.section_id
		where t.id = p_attachment_id
			and e.student_email = v_email
			and e.active
			and i.published
	);
end;
$$;

revoke all on function public.classroom_view_as_can_read_attachment(text, uuid) from public;
grant execute on function public.classroom_view_as_can_read_attachment(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 13. Shared feedback: a moderation status on 0053's app_feedback.
--
-- WHY HERE AND NOT A NEW TABLE. The classroom feedback box needs exactly what
-- 0053 already is -- an app-discriminated queue whose insert is a direct
-- RLS-scoped self-write -- plus a way for an admin to work through it. A second
-- table would be a second copy of every one of those rules, and the queue would
-- stop being one query.
--
-- WHY THIS DOES NOT BREAK 0053's APPEND-ONLY STANCE. That stance is about the
-- AUTHOR: nobody edits what a student wrote, and there is still no update grant
-- for anyone (the status moves through a SECURITY DEFINER RPC gated on
-- is_admin(), never a client UPDATE). Triaging a note is not rewriting it.
-- ---------------------------------------------------------------------------

alter table public.app_feedback
	add column if not exists status text not null default 'new'
		check (status in ('new', 'seen', 'resolved'));
alter table public.app_feedback add column if not exists reviewed_at timestamptz;
alter table public.app_feedback add column if not exists reviewed_by text;

create index if not exists app_feedback_status_idx
	on public.app_feedback (app, status, created_at desc);

create or replace function public.app_feedback_set_status(p_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_status text := lower(btrim(coalesce(p_status, '')));
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.is_admin() then
		raise exception 'Only a site admin can triage feedback.';
	end if;
	if v_status not in ('new', 'seen', 'resolved') then
		raise exception 'Status must be new, seen or resolved.';
	end if;

	update public.app_feedback
	set status = v_status,
		reviewed_at = now(),
		reviewed_by = public.current_user_email()
	where id = p_id;
	if not found then
		raise exception 'That feedback does not exist.';
	end if;

	return jsonb_build_object('ok', true, 'id', p_id, 'status', v_status);
end;
$$;

revoke all on function public.app_feedback_set_status(uuid, text) from public;
grant execute on function public.app_feedback_set_status(uuid, text) to authenticated;

-- The console read. An RPC rather than a select so the submitter's display name
-- comes back in one round trip without the console depending on the exact shape
-- of the profiles policies. Admin only -- 0053's own read policy is
-- is_teacher(), which since 0067 IS is_admin(), so this narrows nothing and
-- states the gate where it can be seen.
create or replace function public.app_feedback_admin_list(
	p_app text default null,
	p_limit integer default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_app text := nullif(btrim(coalesce(p_app, '')), '');
	v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.is_admin() then
		raise exception 'Only a site admin can read the feedback queue.';
	end if;

	return coalesce((
		select jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc)
		from (
			select f.id, f.app, f.context, f.kind, f.message, f.meta,
				f.status, f.created_at, f.reviewed_at, f.reviewed_by,
				coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.full_name), ''),
					split_part(coalesce(p.email, ''), '@', 1)) as submitter_name,
				p.email as submitter_email
			from public.app_feedback f
			left join public.profiles p on p.id = f.user_id
			where v_app is null or f.app = v_app
			order by f.created_at desc
			limit v_limit
		) t
	), '[]'::jsonb);
end;
$$;

revoke all on function public.app_feedback_admin_list(text, integer) from public;
grant execute on function public.app_feedback_admin_list(text, integer) to authenticated;
