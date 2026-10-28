-- 0318_classroom_copy_forward.sql
--
-- A CLASS'S POSTS COPY FORWARD TO A NEW CLASS IN ONE STEP, DATES SHIFTED BY
-- SCHOOL DAYS, AND A DUPLICATE CARRIES ITS PACING AND SIGN-OFF CHECKPOINTS
-- (ledger 0455, docs/feedback/2026-10-28/QUEUE-0455.md item 2; reports
-- 3a549386, 64441b57 and the site half of f8c1b1d8).
--
-- WHAT WAS THERE. `classroom_duplicate_item` (0298) copies one post at a time
-- into chosen classes as a draft, with its files, deck, spec, rubric, reference
-- document and HTML document or IdeaCAD editor. It predates two per-post
-- records and copied neither:
--   * `classroom_item_pacing` (0308): an admin's moved or added pacing days;
--   * `classroom_signoff_checkpoints` (0304): a post's sign-off checklists as
--     an admin edited them.
-- So a duplicate went back to the manifest's pacing and checklists, and every
-- edit stayed on the source. No whole-class copy existed in any form.
--
-- WHAT THIS DOES.
--   1. `_classroom_shift_school_day(day, from_start, to_start)`: the one rule
--      for moving a date from one class's calendar to another's. A date that is
--      the Nth school day of the old class (day 1 = its first class day,
--      weekends and the site's no-school days skipped) becomes the Nth school
--      day of the new one; a date that falls on a weekend keeps its distance
--      from the school day before it; a date before the old start keeps its
--      calendar distance from the start.
--   2. `_classroom_copy_post_extras(from, to, from_start, to_start)`: copies
--      the pacing rows and the checkpoint rows, shifted when both starts are
--      given and as they are when not. `_classroom_duplicate_work_surface`
--      (0298) calls it, so `classroom_duplicate_item` and the connector's
--      duplicate_post carry both, under their own unchanged signatures.
--   3. `classroom_copy_forward_preview` (a read) and `classroom_copy_forward`
--      (the write) over ONE plan, `_classroom_copy_forward_plan`: every post of
--      the old class with its old and new due date. A post that lives only in
--      the old class is COPIED through `classroom_duplicate_item` (so a copy
--      carries exactly what a duplicate carries, stated once), then given the
--      source's title, unit, order and pin, its due date and scheduled time
--      shifted, and its pacing days and checkpoint dates shifted. A post that
--      is already shared by several classes (a syllabus, a link shelf) is
--      SHARED to the new class instead, one more posting of the same post,
--      because a shared post is one record and has one set of dates.
--      Copies arrive as DRAFTS. With `p_publish` a published source's copy is
--      published to open on its shifted day (a scheduled post, the 0109 rule),
--      and a draft stays a draft whatever is asked.
--      NOTHING A STUDENT MADE IS COPIED: answers, hand-ins, grades, feedback,
--      team documents and team draws all belong to a class's students, and the
--      duplicate copies none of them. Running it twice copies nothing twice:
--      `classroom_copy_forward_log` remembers each copy (its row goes when the
--      copy is deleted, so a deleted copy can be made again).
--
-- WHO. The caller must manage BOTH classes (`classroom_manages_section`), and
-- each copy is made by `classroom_duplicate_item`, which re-checks the caller
-- manages every class the source is posted to.
--
-- ADDITIVE AND IDEMPOTENT: one new table, new functions, and 0298's private
-- helper replaced under its own signature. No deployed client calls anything
-- new, so the deploy and this file land in either order.
--
-- WHAT UNDOES IT, a person's paste:
--   re-run 0298's `_classroom_duplicate_work_surface` (section A1) and its revoke;
--   drop function if exists public.classroom_copy_forward(uuid, uuid, date, date, uuid[], boolean),
--     public.classroom_copy_forward_preview(uuid, uuid, date, date, uuid[]),
--     public._classroom_copy_forward_plan(uuid, uuid, date, date, uuid[]),
--     public._classroom_copy_post_extras(uuid, uuid, date, date),
--     public._classroom_shift_school_day(date, date, date),
--     public._classroom_shift_instant(timestamptz, date, date);
--   drop table if exists public.classroom_copy_forward_log;
-- Copies already made stay as ordinary drafts.

do $pre$
begin
	if to_regprocedure('public._classroom_duplicate_work_surface(uuid, uuid)') is null then
		raise exception '0318 cannot apply: _classroom_duplicate_work_surface does not exist. Apply 0298 first.';
	end if;
	if to_regclass('public.classroom_item_pacing') is null then
		raise exception '0318 cannot apply: classroom_item_pacing does not exist. Apply 0308 first.';
	end if;
	if to_regclass('public.classroom_signoff_checkpoints') is null then
		raise exception '0318 cannot apply: classroom_signoff_checkpoints does not exist. Apply 0304 first.';
	end if;
end
$pre$;

-- ---------------------------------------------------------------------------
-- 1. The record of what was copied where. The first object is new, so the
--    apply probe can see this file landed. No client grant, no policy: only
--    the functions below read or write it.
-- ---------------------------------------------------------------------------

create table if not exists public.classroom_copy_forward_log (
	source_item_id uuid not null references public.classroom_items (id) on delete cascade,
	target_section_id uuid not null references public.classroom_sections (id) on delete cascade,
	new_item_id uuid not null references public.classroom_items (id) on delete cascade,
	copied_by text not null,
	copied_at timestamptz not null default now(),
	primary key (source_item_id, target_section_id)
);
alter table public.classroom_copy_forward_log enable row level security;
revoke all on table public.classroom_copy_forward_log from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The date rule, stated once.
-- ---------------------------------------------------------------------------

create or replace function public._classroom_shift_school_day(p_day date, p_from_start date, p_to_start date)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_n integer;
	v_base date;
begin
	if p_day is null or p_from_start is null or p_to_start is null then
		return p_day;
	end if;
	if p_day < p_from_start then
		return p_to_start + (p_day - p_from_start);
	end if;
	select count(*)::integer into v_n
	from generate_series(p_from_start, p_day, interval '1 day') d
	where extract(isodow from d) < 6
		and not exists (select 1 from public.classroom_no_school_days n where n.day = d::date);
	if v_n = 0 then
		return p_to_start + (p_day - p_from_start);
	end if;
	v_base := public._calendar_school_day_n(p_from_start, v_n);
	return public._calendar_school_day_n(p_to_start, v_n) + (p_day - v_base);
end;
$f$;
revoke all on function public._classroom_shift_school_day(date, date, date) from public, anon, authenticated, service_role;

-- An instant (a due time) moved by the same rule, keeping its time of day in
-- school time.
create or replace function public._classroom_shift_instant(p_at timestamptz, p_from_start date, p_to_start date)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $f$
	select case when p_at is null then null else
		((public._classroom_shift_school_day((p_at at time zone 'America/Los_Angeles')::date, p_from_start, p_to_start)
			+ (p_at at time zone 'America/Los_Angeles')::time) at time zone 'America/Los_Angeles')
	end;
$f$;
revoke all on function public._classroom_shift_instant(timestamptz, date, date) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. A post's pacing and checkpoints, copied (shifted when both starts are
--    given). Private: its callers have already checked the caller.
-- ---------------------------------------------------------------------------

create or replace function public._classroom_copy_post_extras(
	p_from uuid,
	p_to uuid,
	p_from_start date default null,
	p_to_start date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $f$
declare
	v_pacing integer := 0;
	v_extra integer := 0;
	v_checks integer := 0;
	v_shift boolean := p_from_start is not null and p_to_start is not null;
begin
	-- The admin's own pacing rows, as they are (a moved day, an added step, a
	-- removed step).
	insert into public.classroom_item_pacing (item_id, step_id, title, day, modules, removed, set_by)
	select p_to, o.step_id, o.title,
		case when v_shift then public._classroom_shift_school_day(o.day, p_from_start, p_to_start) else o.day end,
		o.modules, o.removed, public.current_user_email()
	from public.classroom_item_pacing o
	where o.item_id = p_from
	on conflict (item_id, step_id) do nothing;
	get diagnostics v_pacing = row_count;

	-- COPYING FORWARD, every other step the source resolves to is pinned to its
	-- shifted day too: a step written with a fixed date in the document would
	-- otherwise keep the old class's date.
	if v_shift then
		insert into public.classroom_item_pacing (item_id, step_id, title, day, modules, removed, set_by)
		select p_to, s ->> 'id', null,
			public._classroom_shift_school_day((s ->> 'day')::date, p_from_start, p_to_start),
			null, false, public.current_user_email()
		from jsonb_array_elements(public._classroom_item_pacing(p_from)) s
		where s ->> 'source' = 'manifest' and (s ->> 'day') is not null
		on conflict (item_id, step_id) do nothing;
		get diagnostics v_extra = row_count;
	end if;

	insert into public.classroom_signoff_checkpoints (item_id, checkpoint_key, title, due_on, gate, items, edited_by, edited_at)
	select p_to, c.checkpoint_key, c.title,
		case when v_shift then public._classroom_shift_school_day(c.due_on, p_from_start, p_to_start) else c.due_on end,
		c.gate, c.items,
		case when c.edited_at is not null or v_shift then public.current_user_email() end,
		case when c.edited_at is not null or v_shift then now() end
	from public.classroom_signoff_checkpoints c
	where c.item_id = p_from
	on conflict (item_id, checkpoint_key) do nothing;
	get diagnostics v_checks = row_count;

	return jsonb_build_object('pacing', v_pacing + v_extra, 'checkpoints', v_checks);
end;
$f$;
revoke all on function public._classroom_copy_post_extras(uuid, uuid, date, date) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. 0298's work-surface copy, its body verbatim plus the one marked call, so
--    a duplicate carries pacing and checkpoints (64441b57).
-- ---------------------------------------------------------------------------

create or replace function public._classroom_duplicate_work_surface(
	p_from uuid,
	p_to uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_version integer;
	v_n integer := 0;
begin
	select i.assignment_schema_version into v_version
	from public.classroom_items i where i.id = p_from;

	if v_version = 3 then
		insert into public.classroom_html_assignments
			(item_id, document, manifest, filename, imported_by, updated_at, show_title)
		select p_to, h.document, h.manifest, h.filename, public.current_user_email(), now(), h.show_title
		from public.classroom_html_assignments h
		where h.item_id = p_from;
		get diagnostics v_n = row_count;
	elsif v_version = 4 then
		insert into public.ideacad_editors (item_id, editor, config)
		select p_to, e.editor, e.config
		from public.ideacad_editors e
		where e.item_id = p_from;
		get diagnostics v_n = row_count;
	end if;

	if v_n > 0 then
		update public.classroom_items set assignment_schema_version = v_version where id = p_to;
	end if;

	-- ledger 0455: the post's pacing days and sign-off checklists, as they are.
	perform public._classroom_copy_post_extras(p_from, p_to, null, null);

	return v_n;
end;
$fn$;

revoke all on function public._classroom_duplicate_work_surface(uuid, uuid)
	from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. THE PLAN: every post of the old class, what happens to it, and its old
--    and new dates. The preview and the copy both read it, so what was shown
--    is what is done.
-- ---------------------------------------------------------------------------

create or replace function public._classroom_copy_forward_plan(
	p_from_section uuid,
	p_to_section uuid,
	p_first_day date,
	p_from_first_day date default null,
	p_item_ids uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_from_start date := p_from_first_day;
	v_to_start date;
	v_posts jsonb;
	v_from public.classroom_sections;
	v_to public.classroom_sections;
begin
	select * into v_from from public.classroom_sections where id = p_from_section;
	select * into v_to from public.classroom_sections where id = p_to_section;
	if v_from.id is null or v_to.id is null then
		return jsonb_build_object('ok', false, 'reason', 'not_found', 'message', 'One of those classes does not exist.');
	end if;
	if p_from_section = p_to_section then
		return jsonb_build_object('ok', false, 'reason', 'same_class', 'message', 'Pick a different class to copy into.');
	end if;
	if p_first_day is null then
		return jsonb_build_object('ok', false, 'reason', 'first_day', 'message', 'Say the new class''s first class day.');
	end if;
	-- The old class's first day, when not given: the first school day on or
	-- after the earliest day one of ITS OWN posts opened (a post shared with
	-- other classes opened for them, so it does not count).
	if v_from_start is null then
		select min((coalesce(i.publish_at, i.first_published_at, i.created_at) at time zone 'America/Los_Angeles')::date)
		into v_from_start
		from public.classroom_items i
		join public.classroom_postings p on p.item_id = i.id and p.section_id = p_from_section
		where not exists (select 1 from public.classroom_postings o where o.item_id = i.id and o.section_id <> p_from_section);
		v_from_start := public._calendar_school_day_n(coalesce(v_from_start, current_date), 1);
	end if;
	v_to_start := public._calendar_school_day_n(p_first_day, 1);

	select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.sort_key, x.title), '[]'::jsonb) into v_posts
	from (
		select i.id, coalesce(i.title, left(regexp_replace(i.body, '\s+', ' ', 'g'), 80)) as title, i.kind,
			i.published and not (i.publish_at is not null and i.publish_at > now()) as live,
			not i.published as draft,
			case
				when exists (select 1 from public.classroom_postings t where t.item_id = i.id and t.section_id = p_to_section) then 'already_there'
				when exists (select 1 from public.classroom_copy_forward_log l where l.source_item_id = i.id and l.target_section_id = p_to_section) then 'already_copied'
				when exists (select 1 from public.classroom_postings o where o.item_id = i.id and o.section_id <> p_from_section) then 'share'
				else 'copy'
			end as action,
			(select array_agg(s.label order by s.label) from public.classroom_postings o
				join public.classroom_sections s on s.id = o.section_id where o.item_id = i.id) as classes,
			i.due_at as old_due,
			public._classroom_shift_instant(i.due_at, v_from_start, v_to_start) as new_due,
			(coalesce(i.publish_at, i.first_published_at, i.created_at) at time zone 'America/Los_Angeles')::date as old_opens,
			public._classroom_shift_school_day((coalesce(i.publish_at, i.first_published_at, i.created_at) at time zone 'America/Los_Angeles')::date,
				v_from_start, v_to_start) as new_opens,
			(select count(*) from jsonb_array_elements(public._classroom_item_pacing(i.id))) as pacing_steps,
			(select count(*) from public.classroom_signoff_checkpoints c where c.item_id = i.id) as checkpoints,
			coalesce(i.due_at, i.publish_at, i.first_published_at, i.created_at) as sort_key
		from public.classroom_items i
		join public.classroom_postings p on p.item_id = i.id and p.section_id = p_from_section
		where p_item_ids is null or i.id = any (p_item_ids)
	) x;

	return jsonb_build_object(
		'ok', true,
		'from', jsonb_build_object('id', v_from.id, 'label', v_from.label, 'first_day', v_from_start),
		'to', jsonb_build_object('id', v_to.id, 'label', v_to.label, 'first_day', v_to_start),
		'posts', v_posts,
		'counts', jsonb_build_object(
			'copy', (select count(*) from jsonb_array_elements(v_posts) e where e ->> 'action' = 'copy'),
			'share', (select count(*) from jsonb_array_elements(v_posts) e where e ->> 'action' = 'share'),
			'skip', (select count(*) from jsonb_array_elements(v_posts) e where e ->> 'action' in ('already_there', 'already_copied')))
	);
end;
$f$;
revoke all on function public._classroom_copy_forward_plan(uuid, uuid, date, date, uuid[]) from public, anon, authenticated, service_role;

-- The read: what a copy would do, nothing written.
create or replace function public.classroom_copy_forward_preview(
	p_from_section uuid,
	p_to_section uuid,
	p_first_day date,
	p_from_first_day date default null,
	p_item_ids uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
begin
	if not public.classroom_manages_section(p_from_section) or not public.classroom_manages_section(p_to_section) then
		raise exception 'Only the teacher of record for both classes can copy posts between them.';
	end if;
	return public._classroom_copy_forward_plan(p_from_section, p_to_section, p_first_day, p_from_first_day, p_item_ids);
end;
$f$;
revoke all on function public.classroom_copy_forward_preview(uuid, uuid, date, date, uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.classroom_copy_forward_preview(uuid, uuid, date, date, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. THE COPY. One transaction: every post in the plan, or nothing.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_copy_forward(
	p_from_section uuid,
	p_to_section uuid,
	p_first_day date,
	p_from_first_day date default null,
	p_item_ids uuid[] default null,
	p_publish boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $f$
declare
	v_plan jsonb;
	v_post jsonb;
	v_from_start date;
	v_to_start date;
	v_src public.classroom_items;
	v_new uuid;
	v_unit uuid;
	v_to_course uuid;
	v_extras jsonb;
	v_done jsonb := '[]'::jsonb;
	v_new_opens date;
	v_publish_at timestamptz;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.classroom_manages_section(p_from_section) or not public.classroom_manages_section(p_to_section) then
		raise exception 'Only the teacher of record for both classes can copy posts between them.';
	end if;
	v_plan := public._classroom_copy_forward_plan(p_from_section, p_to_section, p_first_day, p_from_first_day, p_item_ids);
	if not (v_plan ->> 'ok')::boolean then
		return v_plan;
	end if;
	v_from_start := (v_plan #>> '{from,first_day}')::date;
	v_to_start := (v_plan #>> '{to,first_day}')::date;
	select course_id into v_to_course from public.classroom_sections where id = p_to_section;

	for v_post in select e from jsonb_array_elements(v_plan -> 'posts') e loop
		continue when v_post ->> 'action' not in ('copy', 'share');
		select * into v_src from public.classroom_items where id = (v_post ->> 'id')::uuid for update;

		if v_post ->> 'action' = 'share' then
			-- One more posting of the same post, under its own gate.
			perform public.classroom_add_postings(v_src.id, array[p_to_section]);
			v_done := v_done || jsonb_build_array(jsonb_build_object('source_id', v_src.id, 'title', v_post ->> 'title',
				'action', 'share', 'item_id', v_src.id));
			continue;
		end if;

		-- A COPY IS A DUPLICATE: everything a post carries, stated once (0298).
		v_new := (public.classroom_duplicate_item(v_src.id, array[p_to_section]) ->> 'item_id')::uuid;

		-- The unit: the same one in the same course, the same name in another.
		v_unit := null;
		if v_src.unit_id is not null then
			select u.id into v_unit from public.classroom_units u
			where u.course_id = v_to_course
				and (u.id = v_src.unit_id or lower(btrim(u.name)) = (select lower(btrim(s.name)) from public.classroom_units s where s.id = v_src.unit_id))
			order by (u.id = v_src.unit_id) desc limit 1;
		end if;

		v_new_opens := (v_post ->> 'new_opens')::date;
		v_publish_at := case when coalesce(p_publish, false) and v_src.published then
			((v_new_opens + (coalesce(v_src.publish_at, v_src.first_published_at, v_src.created_at) at time zone 'America/Los_Angeles')::time)
				at time zone 'America/Los_Angeles') end;

		update public.classroom_items
		set title = v_src.title,
			due_at = public._classroom_shift_instant(v_src.due_at, v_from_start, v_to_start),
			unit_id = v_unit,
			sort_order = v_src.sort_order,
			pinned = v_src.pinned,
			published = coalesce(p_publish, false) and v_src.published,
			publish_at = case when coalesce(p_publish, false) and v_src.published then
					case when v_publish_at > now() then v_publish_at end
				else public._classroom_shift_instant(v_src.publish_at, v_from_start, v_to_start) end,
			-- The stamp classroom_create_item gives a published post (0109).
			first_published_at = case when coalesce(p_publish, false) and v_src.published then now() end,
			updated_at = now()
		where id = v_new;

		-- The duplicate copied pacing and checkpoints as they were; dates move.
		delete from public.classroom_item_pacing where item_id = v_new;
		delete from public.classroom_signoff_checkpoints where item_id = v_new;
		v_extras := public._classroom_copy_post_extras(v_src.id, v_new, v_from_start, v_to_start);

		insert into public.classroom_copy_forward_log (source_item_id, target_section_id, new_item_id, copied_by)
		values (v_src.id, p_to_section, v_new, public.current_user_email())
		on conflict (source_item_id, target_section_id) do update set new_item_id = excluded.new_item_id,
			copied_by = excluded.copied_by, copied_at = now();

		v_done := v_done || jsonb_build_array(jsonb_build_object('source_id', v_src.id, 'title', v_post ->> 'title',
			'action', 'copy', 'item_id', v_new, 'old_due', v_post -> 'old_due', 'new_due', v_post -> 'new_due',
			'published', coalesce(p_publish, false) and v_src.published,
			'pacing', v_extras -> 'pacing', 'checkpoints', v_extras -> 'checkpoints'));
	end loop;

	return jsonb_build_object('ok', true, 'from', v_plan -> 'from', 'to', v_plan -> 'to',
		'copied', (select count(*) from jsonb_array_elements(v_done) e where e ->> 'action' = 'copy'),
		'shared', (select count(*) from jsonb_array_elements(v_done) e where e ->> 'action' = 'share'),
		'skipped', v_plan #> '{counts,skip}',
		'posts', v_done);
end;
$f$;
revoke all on function public.classroom_copy_forward(uuid, uuid, date, date, uuid[], boolean) from public, anon, authenticated, service_role;
grant execute on function public.classroom_copy_forward(uuid, uuid, date, date, uuid[], boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. SELF-CHECK.
-- ---------------------------------------------------------------------------

do $chk$
declare
	v_fn text;
begin
	foreach v_fn in array array[
		'public._classroom_shift_school_day(date, date, date)', 'public._classroom_shift_instant(timestamptz, date, date)',
		'public._classroom_copy_post_extras(uuid, uuid, date, date)', 'public._classroom_duplicate_work_surface(uuid, uuid)',
		'public._classroom_copy_forward_plan(uuid, uuid, date, date, uuid[])',
		'public.classroom_copy_forward_preview(uuid, uuid, date, date, uuid[])',
		'public.classroom_copy_forward(uuid, uuid, date, date, uuid[], boolean)'] loop
		if has_function_privilege('anon', v_fn, 'execute') then
			raise exception '0318: % is executable by anon.', v_fn;
		end if;
	end loop;
	if has_table_privilege('authenticated', 'public.classroom_copy_forward_log', 'select,insert,update,delete') then
		raise exception '0318: classroom_copy_forward_log is reachable by a client.';
	end if;
	raise notice '0318: copy forward and the duplicate''s pacing and checkpoints are in place.';
end
$chk$;
