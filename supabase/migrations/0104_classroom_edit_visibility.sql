-- 0104_classroom_edit_visibility.sql
-- An "Updated" badge must mean a student missed something. It stopped meaning
-- that, and the way it stopped is the whole reason this file exists.
--
-- THE BUG. 0085 decided a published item had been EDITED with
--
--     v_changed := ... or p_resources is not null;
--
-- i.e. "the caller sent a links array" rather than "the links changed". The
-- composer ALWAYS sends one (itemInput() builds `links` unconditionally), so
-- every save through it stamped edited_at whether or not a single character of
-- student-facing content moved.
--
-- WHICH LEAKED INSTRUCTOR-ONLY WORK. 0090's answer keys, facilitation guides
-- and instructor links are attached AFTER the item save, by their own RPCs,
-- which touch nothing on classroom_items -- so on their own they were already
-- silent. But the composer saves them by calling classroom_update_item first
-- and the instructor RPCs second, so adding an answer key stamped edited_at,
-- and every student in every class the item is posted to was shown an
-- "Updated" badge (ClassPage, ItemDetail, and the home feed's `updated` rank)
-- pointing at content they cannot see, are not meant to know exists, and will
-- find unchanged when they open it.
--
-- THE FIX IS TO MAKE `edited_at` MEAN WHAT IT SAYS, at the layer that owns it.
-- Not "the composer should send less": a caller can reach this RPC through
-- PostgREST with any payload it likes, and a rule about what a badge means
-- belongs where the badge's timestamp is written. So:
--
--   * resources are COMPARED, not merely counted as present, through
--     _classroom_resources_changed, which normalizes an incoming array exactly
--     the way _classroom_write_resources stores one so the two can never
--     disagree about what "the same links" are;
--   * unchanged resources are not REWRITTEN either. _classroom_write_resources
--     is delete-then-insert, so rewriting them mints new classroom_item_resources
--     ids -- which a student's own read (ITEM_SELECT embeds those rows by id)
--     would carry. "Changes nothing student-visible" has to include the ids;
--   * a save that changes nothing at all leaves `updated_at` alone too, so the
--     row a student reads is byte-identical, not merely visually identical.
--
-- WHAT STILL STAMPS IT, unchanged from 0085: a real change to title, body,
-- points, due date, category or the student-facing links, on an item that has
-- been published at least once. Publishing a draft is still not an edit, and
-- neither is a pin or a reorder.
--
-- Signature is 0085's exactly, so `create or replace` is all this needs.
--
-- Apply manually in the Supabase SQL editor, after 0103.

-- ---------------------------------------------------------------------------
-- 1. Did the student-facing links actually change?
-- ---------------------------------------------------------------------------

-- Normalizes p_resources the SAME way _classroom_write_resources (0085) does --
-- url trimmed, label defaulted to the url and capped at 200, position from the
-- array's own order -- and compares the result with what the item already has.
--
-- Deliberately NOT a validating function: a malformed array (a missing url, a
-- non-https scheme, twenty-one links) must still reach _classroom_write_resources
-- and be refused there with its own message, so this answers "different?" and
-- lets the writer answer "legal?". A payload that would be refused simply reads
-- as different, which is the safe direction: it goes on to the writer and raises.
--
-- null means "the caller sent no links at all", which 0085 defines as "leave
-- them alone" -- so it cannot be a change.
create or replace function public._classroom_resources_changed(
	p_item_id uuid,
	p_resources jsonb
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select case
		when p_resources is null or p_resources = 'null'::jsonb then false
		when jsonb_typeof(p_resources) <> 'array' then true
		else exists (
			select 1
			from (
				select
					left(coalesce(
						nullif(btrim(coalesce(e.value->>'label', '')), ''),
						btrim(coalesce(e.value->>'url', ''))
					), 200) as label,
					btrim(coalesce(e.value->>'url', '')) as url,
					e.ordinality::integer as sort_order
				from jsonb_array_elements(p_resources) with ordinality as e(value, ordinality)
			) incoming
			full outer join (
				select r.label, r.url, r.sort_order
				from public.classroom_item_resources r
				where r.item_id = p_item_id
			) current
				on current.sort_order = incoming.sort_order
			where incoming.sort_order is null
				or current.sort_order is null
				or incoming.label is distinct from current.label
				or incoming.url is distinct from current.url
		)
	end;
$$;

revoke all on function public._classroom_resources_changed(uuid, jsonb) from public;

-- ---------------------------------------------------------------------------
-- 2. classroom_update_item, recreated. 0085's body with the two changes above.
-- ---------------------------------------------------------------------------

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
	v_links_changed boolean;
	v_changed boolean;
	v_touched boolean;
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

	v_links_changed := public._classroom_resources_changed(p_id, p_resources);

	v_changed :=
		coalesce(v_title, '') is distinct from coalesce(v_old.title, '')
		or v_body is distinct from v_old.body
		or p_points is distinct from v_old.points
		or p_due_at is distinct from v_old.due_at
		or coalesce(v_category, '') is distinct from coalesce(v_old.category, '')
		or v_links_changed;

	-- Publishing is not an EDIT, but it is a change to the row, so it still
	-- moves updated_at. Only a save that alters literally nothing leaves the
	-- record untouched.
	v_touched := v_changed or v_published is distinct from v_old.published;

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
		updated_at = case when v_touched then now() else v_old.updated_at end
	where id = p_id;

	-- Only when they differ: rewriting identical links would mint new resource
	-- row ids, which a student's own read carries (see the header).
	if v_links_changed then
		perform public._classroom_write_resources(p_id, p_resources);
	end if;

	return jsonb_build_object('item_id', p_id, 'published', v_published, 'edited', v_changed);
end;
$$;

revoke all on function public.classroom_update_item(uuid, text, text, integer, timestamptz, text, boolean, jsonb) from public;
grant execute on function public.classroom_update_item(uuid, text, text, integer, timestamptz, text, boolean, jsonb) to authenticated;
