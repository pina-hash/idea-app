-- 0109_classroom_scheduled_posting.sql
-- An item can be written now and become visible to students LATER.
--
-- Apply manually in the Supabase SQL editor, after 0108.
--
-- ===========================================================================
-- THREE STATES, TWO COLUMNS
-- ===========================================================================
--
--   published = false                          -> DRAFT     (nobody but staff)
--   published = true,  publish_at > now()      -> SCHEDULED (staff only, yet)
--   published = true,  publish_at null or past -> LIVE
--
-- `publish_at` is deliberately NOT a third state column and NOT a status enum.
-- A draft is "not finished"; a scheduled item is "finished, not yet due to be
-- seen" -- and the thing that separates the second from the third is the
-- CLOCK, which no column can hold. So liveness is COMPUTED at every read, the
-- way the notebook's role expirations are, and there is no cron, no job and no
-- row that has to be flipped by anything at a particular minute. An item goes
-- live because the condition starts being true, not because something ran.
--
-- `_classroom_item_live(published, publish_at)` is that condition, written
-- once. Null publish_at is live-when-published, which is what EVERY item
-- authored before this migration is and stays -- so the backfill is that there
-- is no backfill.
--
-- ===========================================================================
-- WHERE IT IS ENFORCED
-- ===========================================================================
--
-- Everywhere `published` was already the student gate, and nowhere else. That
-- set was found by reading, not assumed:
--
--   * classroom_can_read_item                 (0085) -- THE central question;
--     the items policy plus resources, attachments, decks, reference specs and
--     rubrics all delegate to it, so widening it widens all of them at once.
--   * "classroom postings readable" policy    (0085)
--   * classroom_view_as_section / _item       (0085)
--   * classroom_view_as_can_read_attachment   (0085)
--   * _classroom_engine_student               (0086) -- the student WRITE gate:
--     nobody submits to an assignment they cannot yet see.
--   * classroom_public_reference / _attachment (0092) -- the anon path.
--
-- Every one of those is recreated below with the same body and one term
-- changed. Nothing in application code repeats the rule; the app reads
-- `publish_at` only to draw a chip and to word a button.
--
-- ===========================================================================
-- EDIT TRACKING: THE HARD CONSTRAINT
-- ===========================================================================
--
-- An edit to a scheduled item, before it goes live, must NOT raise the student
-- "Updated" badge -- there is nothing for a student to have missed, and a
-- badge that fires for revisions nobody could see is a badge worth ignoring.
-- And the behaviour of an immediately-posted item must not change AT ALL.
--
-- The badge is `edited_at > viewed_at`, and 0104/0108 stamp `edited_at` only
-- when a real content change lands on an item with a non-null
-- `first_published_at`. The change here is ONE added term: the item must also
-- have been LIVE when the edit arrived.
--
--   was live  = v_old.published and (v_old.publish_at is null or <= now())
--
-- Which resolves the three cases exactly:
--
--   * posted immediately -- publish_at is null, so `was live` is just
--     `published`, and `first_published_at is not null` already implied that.
--     Byte-identical behaviour, which is the constraint.
--   * scheduled, edited before go-live -- not live, so edited_at is untouched
--     however many times it is revised.
--   * scheduled, edited after go-live -- publish_at is past, so it stamps
--     exactly as an ordinary published item does.
--
-- `first_published_at` is deliberately LEFT ALONE. It is stamped when
-- `published` first flips true, scheduled or not, and nothing student-facing
-- reads it (checked: only the edit rule above and the item payload). Making it
-- mean "first became visible" instead would need something to stamp it at
-- go-live -- exactly the scheduled job this design does not have -- and would
-- leave a scheduled item's edits permanently unbadged after it went live.
--
-- ===========================================================================
-- DEPLOY ORDERING
-- ===========================================================================
--
-- Both write RPCs gain a parameter, so their old arities are DROPPED first:
-- `create or replace` would leave them callable as second overloads, and two
-- overloads differing only by a defaulted trailing parameter make PostgREST
-- unable to resolve the call AT ALL (the 0058 / 0068 / 0096 / 0108 trap).
-- APPLY THIS BEFORE DEPLOYING a client that names `p_publish_at`. The route
-- degrades on its own if you do it the other way round -- it retries without
-- the parameter, so the save lands and only the schedule is dropped -- but the
-- ordering above is the one that never loses a schedule.
--
-- NOT CHANGED, deliberately: `classroom_duplicate_item` names its insert
-- columns explicitly and does not include `publish_at`, so a copy is a plain
-- draft carrying no inherited go-live time. That is the right answer and it
-- needed no edit to get it.
--
-- Idempotent throughout: `add column if not exists`, catalog-guarded index,
-- `drop ... if exists` before each re-signed function, `create or replace`
-- everywhere else. Re-applying this file is a no-op (0088's lesson: a
-- migration that only works once fails exactly when someone re-pastes it).

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------

alter table public.classroom_items
	add column if not exists publish_at timestamptz;

comment on column public.classroom_items.publish_at is
	'When a published item becomes visible to students. Null = immediately. '
	'Liveness is computed at read time by _classroom_item_live; nothing flips '
	'a row at go-live.';

-- Only scheduled rows are ever asked about by time, and they are a handful
-- against a term of content, so the index is partial.
create index if not exists classroom_items_publish_at_idx
	on public.classroom_items (publish_at)
	where publish_at is not null;

-- ---------------------------------------------------------------------------
-- 2. The condition, written once
-- ---------------------------------------------------------------------------

create or replace function public._classroom_item_live(
	p_published boolean,
	p_publish_at timestamptz
)
returns boolean
language sql
stable
set search_path = ''
as $$
	select coalesce(p_published, false)
		and (p_publish_at is null or p_publish_at <= now());
$$;

revoke all on function public._classroom_item_live(boolean, timestamptz) from public;
-- Granted, unlike most `_`-prefixed helpers: it is called from INSIDE the
-- "classroom postings readable" policy expression, which is evaluated as the
-- querying role rather than by a definer function (the 0070 lesson --
-- current_user_email() was revoked and a student's own balance read broke).
grant execute on function public._classroom_item_live(boolean, timestamptz) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3. The central read question (0085), widened
-- ---------------------------------------------------------------------------

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
				or (
					public._classroom_item_live(i.published, i.publish_at)
					and public.classroom_is_enrolled(pg.section_id)
				)
			)
	);
$$;

revoke all on function public.classroom_can_read_item(uuid) from public;
grant execute on function public.classroom_can_read_item(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The postings policy (0085), widened
-- ---------------------------------------------------------------------------

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
				where i.id = item_id
					and public._classroom_item_live(i.published, i.publish_at)
			)
		)
	);

-- ---------------------------------------------------------------------------
-- 5. The student write gate (0086), widened
--
-- Recreated with the same body and one term changed, so a student cannot save
-- a response to, or submit, an assignment that has not gone live yet.
-- ---------------------------------------------------------------------------

create or replace function public._classroom_engine_student(p_item_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
begin
	if (select auth.uid()) is null or coalesce(v_email, '') = '' then
		raise exception 'You must be signed in.';
	end if;
	-- The ONE changed term. A scheduled assignment answers exactly as an
	-- unpublished one always has, message included: to a student it does not
	-- exist yet, which is the truth and gives away nothing about what is coming.
	if not exists (
		select 1 from public.classroom_items i
		where i.id = p_item_id
			and i.kind = 'assignment'
			and public._classroom_item_live(i.published, i.publish_at)
	) then
		raise exception 'That assignment does not exist.';
	end if;
	if not exists (
		select 1
		from public.classroom_postings pg
		join public.classroom_enrollments e on e.section_id = pg.section_id
		where pg.item_id = p_item_id
			and e.student_email = v_email
			and e.active
	) then
		raise exception 'Only a student enrolled in this class can work on this assignment.';
	end if;
	return v_email;
end;
$$;

revoke all on function public._classroom_engine_student(uuid) from public;

-- ---------------------------------------------------------------------------
-- 6. View as student (0085), widened
--
-- An admin previewing a student's classroom must see what that student sees,
-- which now excludes a scheduled item. Same three functions, same bodies.
-- ---------------------------------------------------------------------------

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
			where pg.section_id = p_section_id
				and public._classroom_item_live(i.published, i.publish_at)
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
	where i.id = p_item_id
		and pg.section_id = p_section_id
		and public._classroom_item_live(i.published, i.publish_at);

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
			and public._classroom_item_live(i.published, i.publish_at)
	);
end;
$$;

revoke all on function public.classroom_view_as_can_read_attachment(text, uuid) from public;
grant execute on function public.classroom_view_as_can_read_attachment(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. The public reference path (0092), widened
--
-- A scheduled public material is not public yet. Both functions still answer
-- NULL for every refusal -- an unknown id, a private material, an unpublished
-- one, a scheduled one -- so a stranger still cannot tell the difference.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_public_reference(p_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select jsonb_build_object(
		'item_id', i.id,
		'title', i.title,
		'spec', r.spec,
		'updated_at', r.updated_at,
		'attachments', coalesce(
			(
				select jsonb_agg(jsonb_build_object(
					'id', a.id, 'filename', a.filename, 'mime_type', a.mime_type,
					'size_bytes', a.size_bytes, 'sort_order', a.sort_order
				) order by a.sort_order, a.created_at)
				from public.classroom_attachments a
				where a.item_id = i.id
			),
			'[]'::jsonb
		)
	)
	from public.classroom_items i
	join public.classroom_reference_specs r on r.item_id = i.id
	where i.id = p_item_id
		and i.kind = 'material'
		and i.is_public
		and public._classroom_item_live(i.published, i.publish_at);
$$;

revoke all on function public.classroom_public_reference(uuid) from public;
grant execute on function public.classroom_public_reference(uuid) to anon, authenticated;

create or replace function public.classroom_public_attachment(p_attachment_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select jsonb_build_object(
		'drive_file_id', a.drive_file_id,
		'filename', a.filename,
		'mime_type', a.mime_type
	)
	from public.classroom_attachments a
	join public.classroom_items i on i.id = a.item_id
	where a.id = p_attachment_id
		and i.kind = 'material'
		and i.is_public
		and public._classroom_item_live(i.published, i.publish_at);
$$;

revoke all on function public.classroom_public_attachment(uuid) from public;
grant execute on function public.classroom_public_attachment(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. classroom_create_item, re-signed
-- ---------------------------------------------------------------------------

drop function if exists public.classroom_create_item(
	text, uuid[], text, text, integer, timestamptz, text, boolean, jsonb, boolean, jsonb);

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
	p_pinned boolean default false,
	p_body_doc jsonb default null,
	p_publish_at timestamptz default null
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
	v_category text := nullif(btrim(coalesce(p_category, '')), '');
	v_published boolean := coalesce(p_published, true);
	v_doc jsonb;
	v_body text;
	v_id uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	if not public._classroom_doc_ok(p_body_doc) then
		raise exception 'That body could not be read.';
	end if;

	if p_body_doc is null or p_body_doc = 'null'::jsonb then
		v_body := coalesce(p_body, '');
		v_doc := public._classroom_doc_from_text(v_body);
	else
		v_doc := p_body_doc;
		v_body := public._classroom_doc_text(v_doc);
	end if;

	perform public._classroom_check_item_fields(
		v_kind, v_title, v_body, p_points, p_due_at, v_category);

	v_sections := public._classroom_check_publish_targets(p_section_ids);

	insert into public.classroom_items
		(kind, title, body, body_doc, points, due_at, category, author_email, author_name,
			published, pinned, publish_at, first_published_at)
	values (v_kind, v_title, v_body, v_doc, p_points, p_due_at, v_category,
		public.current_user_email(), public._classroom_author_name(),
		v_published, coalesce(p_pinned, false), p_publish_at,
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
		'published', v_published,
		'live', public._classroom_item_live(v_published, p_publish_at)
	);
end;
$$;

revoke all on function public.classroom_create_item(
	text, uuid[], text, text, integer, timestamptz, text, boolean, jsonb, boolean, jsonb,
	timestamptz) from public;
grant execute on function public.classroom_create_item(
	text, uuid[], text, text, integer, timestamptz, text, boolean, jsonb, boolean, jsonb,
	timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. classroom_update_item, re-signed -- and the edit-tracking rule
-- ---------------------------------------------------------------------------

drop function if exists public.classroom_update_item(
	uuid, text, text, integer, timestamptz, text, boolean, jsonb, jsonb);

create or replace function public.classroom_update_item(
	p_id uuid,
	p_title text default null,
	p_body text default '',
	p_points integer default null,
	p_due_at timestamptz default null,
	p_category text default null,
	p_published boolean default null,
	p_resources jsonb default null,
	p_body_doc jsonb default null,
	p_publish_at timestamptz default null
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
	v_category text := nullif(btrim(coalesce(p_category, '')), '');
	v_published boolean;
	v_links_changed boolean;
	v_changed boolean;
	v_touched boolean;
	v_edited timestamptz;
	v_was_live boolean;
	v_doc jsonb;
	v_body text;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	if not public._classroom_doc_ok(p_body_doc) then
		raise exception 'That body could not be read.';
	end if;

	select i.* into v_old from public.classroom_items i where i.id = p_id for update;
	if not found then
		raise exception 'That item does not exist.';
	end if;
	if not public._classroom_manages_item(p_id) then
		raise exception 'Only the teacher of record for every class this is posted to can edit it.';
	end if;

	if p_body_doc is null or p_body_doc = 'null'::jsonb then
		v_body := coalesce(p_body, '');
		v_doc := public._classroom_doc_from_text(v_body);
	else
		v_doc := p_body_doc;
		v_body := public._classroom_doc_text(v_doc);
	end if;

	perform public._classroom_check_item_fields(
		v_old.kind, v_title, v_body, p_points, p_due_at, v_category);

	v_published := coalesce(p_published, v_old.published);

	v_links_changed := public._classroom_resources_changed(p_id, p_resources);

	-- 0104's rule with 0108's document term, unchanged. Note that the go-live
	-- time is NOT one of these: rescheduling is not a content edit, and it
	-- cannot be -- for a not-yet-live item there is nothing a student could
	-- have missed, and for a live one the schedule is already spent.
	v_changed :=
		coalesce(v_title, '') is distinct from coalesce(v_old.title, '')
		or v_body is distinct from v_old.body
		or v_doc is distinct from coalesce(v_old.body_doc, public._classroom_doc_from_text(v_old.body))
		or p_points is distinct from v_old.points
		or p_due_at is distinct from v_old.due_at
		or coalesce(v_category, '') is distinct from coalesce(v_old.category, '')
		or v_links_changed;

	v_touched :=
		v_changed
		or v_published is distinct from v_old.published
		or p_publish_at is distinct from v_old.publish_at;

	-- THE ONE ADDED TERM. Was this item actually VISIBLE to a student at the
	-- moment the edit arrived? An immediately-posted item has a null
	-- publish_at, so this is exactly `published` and the whole expression
	-- reduces to what 0104 shipped -- see the header for the three cases.
	v_was_live := public._classroom_item_live(v_old.published, v_old.publish_at);

	v_edited := case
		when v_changed and v_old.first_published_at is not null and v_was_live then now()
		else v_old.edited_at
	end;

	update public.classroom_items
	set title = v_title,
		body = v_body,
		body_doc = v_doc,
		points = p_points,
		due_at = p_due_at,
		category = v_category,
		published = v_published,
		publish_at = p_publish_at,
		first_published_at = coalesce(v_old.first_published_at, case when v_published then now() end),
		edited_at = v_edited,
		updated_at = case when v_touched then now() else v_old.updated_at end
	where id = p_id;

	if v_links_changed then
		perform public._classroom_write_resources(p_id, p_resources);
	end if;

	return jsonb_build_object(
		'item_id', p_id,
		'published', v_published,
		'edited', v_changed,
		'live', public._classroom_item_live(v_published, p_publish_at)
	);
end;
$$;

revoke all on function public.classroom_update_item(
	uuid, text, text, integer, timestamptz, text, boolean, jsonb, jsonb, timestamptz) from public;
grant execute on function public.classroom_update_item(
	uuid, text, text, integer, timestamptz, text, boolean, jsonb, jsonb, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Publish / unpublish, WITHOUT resending the item
--
-- WHY THIS EXISTS. `togglePublished` in the manage console called
-- classroom_update_item with the item's whole content re-sent -- title, body,
-- document, points, due date, category and every link -- purely to flip one
-- boolean. That is a wide write for a narrow intent, and it makes the flip
-- only as safe as the client's copy of the row: anything the console read
-- stale, or dropped on the way through, got written back as the new content.
-- The links in particular were re-sent every time and compared to decide
-- whether to rewrite them.
--
-- This touches `published` and nothing else. It cannot change content, so it
-- cannot stamp `edited_at`, which is exactly the 0104 rule ("publishing a
-- draft is not an edit") made structural rather than remembered.
--
-- `first_published_at` follows the same coalesce as everywhere else, so the
-- first publish still stamps it and a later re-publish leaves it alone.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_set_published(
	p_item_id uuid,
	p_published boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_old public.classroom_items%rowtype;
	v_published boolean := coalesce(p_published, false);
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;

	select i.* into v_old from public.classroom_items i where i.id = p_item_id for update;
	if not found then
		raise exception 'That item does not exist.';
	end if;
	if not public._classroom_manages_item(p_item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can change it.';
	end if;

	if v_published is distinct from v_old.published then
		update public.classroom_items
		set published = v_published,
			first_published_at =
				coalesce(v_old.first_published_at, case when v_published then now() end),
			updated_at = now()
		where id = p_item_id;
	end if;

	return jsonb_build_object(
		'item_id', p_item_id,
		'published', v_published,
		'live', public._classroom_item_live(v_published, v_old.publish_at)
	);
end;
$$;

revoke all on function public.classroom_set_published(uuid, boolean) from public;
grant execute on function public.classroom_set_published(uuid, boolean) to authenticated;
