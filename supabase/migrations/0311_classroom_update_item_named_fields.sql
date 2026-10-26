-- 0311_classroom_update_item_named_fields.sql
--
-- AN EDIT CHANGES ONLY THE FIELDS IT NAMES (ledger 0438, Mr. Pina's item 6,
-- site gaps 4353a482 and c602486a). On 2026-10-26 a connector edit that set
-- only a category on a live post (with the title it requires) emptied the
-- post's text, points and due date: classroom_update_item takes every field
-- it is passed as the new value, so a field left out of the call arrives as
-- its default (an empty text, a null points, a null due date) and is written.
--
-- PostgREST cannot tell a field left out from a field sent as null, so the
-- function cannot guess. It gains p_fields: the fields the caller means to
-- change. Given, only those fields change and every other one keeps what is
-- stored (a named field sent as null still clears it, which is how a due date
-- is taken off). Left null, the call is a full edit exactly as before, so the
-- item editor, which sends every field, and the revision restore (0195),
-- which passes a whole stored copy, are unchanged.
--
-- THE CALLERS, from the tree on 2026-10-26: the item editor
-- (/api/classroom/item, every field, full edit); the revision restore inside
-- classroom_restore_revision (every field from the stored copy); the
-- connector's set_points and set_due (every field from the stored row, so
-- they never cleared anything); and the connector's site_call to this
-- function, which sends only what was said and is the path that cleared the
-- post. The connector names p_fields on every call once this is applied.
--
-- DEPLOY ORDERING: none. The old ten-argument form is dropped and the new one
-- takes the same ten with the same defaults plus p_fields defaulted to null,
-- so every deployed call resolves to it and means what it meant. The
-- connector's p_fields arrives in the push after this file is applied.
--
-- WHAT UNDOES IT, a person's paste: re-run the classroom_update_item block of
-- 0176 (with its revoke and grant), after
--   drop function if exists public.classroom_update_item(uuid, text, text, integer, timestamptz, text, boolean, jsonb, jsonb, timestamptz, text[]);

do $pre$
begin
	if to_regprocedure('public.classroom_update_item(uuid, text, text, integer, timestamptz, text, boolean, jsonb, jsonb, timestamptz)') is null
		and to_regprocedure('public.classroom_update_item(uuid, text, text, integer, timestamptz, text, boolean, jsonb, jsonb, timestamptz, text[])') is null then
		raise exception '0311 cannot apply: classroom_update_item does not exist. Apply 0176 first.';
	end if;
end
$pre$;

-- The ten-argument form goes first: two forms with the same leading ten would
-- leave every call that names none of p_fields ambiguous.
drop function if exists public.classroom_update_item(uuid, text, text, integer, timestamptz, text, boolean, jsonb, jsonb, timestamptz);

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
	p_publish_at timestamptz default null,
	p_fields text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_old public.classroom_items%rowtype;
	v_title text;
	v_category text;
	v_points integer;
	v_due timestamptz;
	v_publish_at timestamptz;
	v_resources jsonb;
	v_published boolean;
	v_links_changed boolean;
	v_changed boolean;
	v_touched boolean;
	v_edited timestamptz;
	v_was_live boolean;
	v_doc jsonb;
	v_body text;
	v_revision integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	-- 0176, the same one-term change the create path takes.
	if not public._classroom_doc_ok(p_body_doc, true) then
		raise exception 'That body could not be read.';
	end if;

	select i.* into v_old from public.classroom_items i where i.id = p_id for update;
	if not found then
		raise exception 'That item does not exist.';
	end if;
	if not public._classroom_manages_item(p_id) then
		raise exception 'Only the teacher of record for every class this is posted to can edit it.';
	end if;

	-- NAMED FIELDS (0311). With p_fields null every field takes the value
	-- passed, a full edit, exactly as before; with p_fields given only the
	-- fields it names change and every other one keeps what is stored.
	if p_fields is not null then
		if cardinality(p_fields) = 0 then
			raise exception 'Name at least one field to change.';
		end if;
		if exists (select 1 from unnest(p_fields) f where f is null or f not in (
			'p_title', 'p_body', 'p_body_doc', 'p_points', 'p_due_at', 'p_category',
			'p_published', 'p_resources', 'p_publish_at')) then
			raise exception 'A post has a title, text, points, due date, category, visibility, links and a showing time; name only those.';
		end if;
	end if;

	v_title := case when p_fields is null or 'p_title' = any (p_fields)
		then nullif(btrim(coalesce(p_title, '')), '') else v_old.title end;
	v_category := case when p_fields is null or 'p_category' = any (p_fields)
		then nullif(btrim(coalesce(p_category, '')), '') else v_old.category end;
	v_points := case when p_fields is null or 'p_points' = any (p_fields) then p_points else v_old.points end;
	v_due := case when p_fields is null or 'p_due_at' = any (p_fields) then p_due_at else v_old.due_at end;
	v_publish_at := case when p_fields is null or 'p_publish_at' = any (p_fields) then p_publish_at else v_old.publish_at end;
	v_resources := case when p_fields is null or 'p_resources' = any (p_fields) then p_resources else null end;

	if p_fields is not null and not ('p_body' = any (p_fields) or 'p_body_doc' = any (p_fields)) then
		v_body := v_old.body;
		v_doc := coalesce(v_old.body_doc, public._classroom_doc_from_text(v_old.body));
	elsif p_body_doc is null or p_body_doc = 'null'::jsonb then
		v_body := coalesce(p_body, '');
		v_doc := public._classroom_doc_from_text(v_body);
	else
		v_doc := p_body_doc;
		v_body := public._classroom_doc_text(v_doc);
	end if;

	perform public._classroom_check_item_fields(
		v_old.kind, v_title, v_body, v_points, v_due, v_category);

	v_published := case when p_fields is null or 'p_published' = any (p_fields)
		then coalesce(p_published, v_old.published) else v_old.published end;

	v_links_changed := public._classroom_resources_changed(p_id, v_resources);

	v_changed :=
		coalesce(v_title, '') is distinct from coalesce(v_old.title, '')
		or v_body is distinct from v_old.body
		or v_doc is distinct from coalesce(v_old.body_doc, public._classroom_doc_from_text(v_old.body))
		or v_points is distinct from v_old.points
		or v_due is distinct from v_old.due_at
		or coalesce(v_category, '') is distinct from coalesce(v_old.category, '')
		or v_links_changed;

	v_touched :=
		v_changed
		or v_published is distinct from v_old.published
		or v_publish_at is distinct from v_old.publish_at;

	v_was_live := public._classroom_item_live(v_old.published, v_old.publish_at);

	v_edited := case
		when v_changed and v_old.first_published_at is not null and v_was_live then now()
		else v_old.edited_at
	end;

	if v_changed then
		v_revision := public._classroom_snapshot_content(
			p_id, 'item', public._classroom_item_payload(v_old));
	end if;

	update public.classroom_items
	set title = v_title,
		body = v_body,
		body_doc = v_doc,
		points = v_points,
		due_at = v_due,
		category = v_category,
		published = v_published,
		publish_at = v_publish_at,
		first_published_at = coalesce(v_old.first_published_at, case when v_published then now() end),
		edited_at = v_edited,
		updated_at = case when v_touched then now() else v_old.updated_at end
	where id = p_id;

	if v_links_changed then
		perform public._classroom_write_resources(p_id, v_resources);
	end if;

	return jsonb_build_object(
		'item_id', p_id,
		'published', v_published,
		'edited', v_changed,
		'revision', v_revision,
		'live', public._classroom_item_live(v_published, v_publish_at)
	);
end;
$$;

revoke all on function public.classroom_update_item(
	uuid, text, text, integer, timestamptz, text, boolean, jsonb, jsonb, timestamptz, text[]) from public, anon, authenticated;
grant execute on function public.classroom_update_item(
	uuid, text, text, integer, timestamptz, text, boolean, jsonb, jsonb, timestamptz, text[]) to authenticated;

do $check$
declare
	v_n integer;
begin
	select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_update_item';
	if v_n <> 1 then
		raise exception '0311: expected exactly one classroom_update_item, found %.', v_n;
	end if;
	if has_function_privilege('anon', 'public.classroom_update_item(uuid, text, text, integer, timestamptz, text, boolean, jsonb, jsonb, timestamptz, text[])', 'execute') then
		raise exception '0311: classroom_update_item is executable by anon.';
	end if;
	raise notice '0311: classroom_update_item takes named fields; % posts in the table.', (select count(*) from public.classroom_items);
end
$check$;
