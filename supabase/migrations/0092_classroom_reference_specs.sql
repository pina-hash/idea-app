-- 0092_classroom_reference_specs.sql
--
-- REFERENCE DOCUMENTS: structured, interactive reference material on a
-- MATERIAL item, plus the narrow public read path a printed QR code needs.
--
-- Apply manually in the Supabase SQL editor, after 0091.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS ADDS, AND THE THREE DECISIONS IT RESTS ON
-- ---------------------------------------------------------------------------
--
-- 1. SCHEMA v2 ADDS A `kind` DISCRIMINATOR, AND IT IS BACKWARD COMPATIBLE BY
--    CONSTRUCTION. A spec document is either an assignment (modules, points,
--    rubrics, AI levels, declarations, preflight, submission -- everything
--    0086 already does) or a reference (sections, no points, no rubric, no AI
--    level, no declaration, no submission, no student state). AN ABSENT `kind`
--    IS AN ASSIGNMENT: every schema v1 file has no such field, so the default
--    is what keeps them valid and unchanged. _classroom_check_spec is
--    DELIBERATELY NOT TOUCHED by this migration -- assignment validation is
--    byte-for-byte the function 0086 shipped. The kind guard is a separate
--    one-line assertion called BEFORE it from a recreated
--    classroom_set_assignment_spec, so there is no way for this change to
--    alter what an existing assignment spec validates to.
--
-- 2. A REFERENCE SPEC LIVES IN ITS OWN TABLE, NOT ALONGSIDE ASSIGNMENT SPECS.
--    classroom_reference_specs is separate from classroom_assignment_specs
--    for one load-bearing reason: the PUBLIC read path below must be unable to
--    return an assignment spec even if it were asked to. A shared table would
--    make that a matter of a WHERE clause staying correct; separate tables make
--    it a property of which table the function names.
--
-- 3. PUBLIC ACCESS IS AN RPC, NEVER A LOOSENED POLICY. The printed IDEA209H
--    syllabus carries a QR code to ideabosco.com/209h, and it goes home for a
--    parent signature -- a parent has no boscotech.net account and must not hit
--    a login wall. So a material may be flagged public, and when it is:
--
--      * `anon` gains EXECUTE on exactly two functions
--        (classroom_public_reference, classroom_public_attachment) and NOTHING
--        else. No table grant, no policy change, no view. Every existing
--        classroom policy is untouched, so nothing that was invisible to a
--        signed-out visitor before this migration becomes visible now except
--        through those two functions.
--      * Each function PROJECTS AWAY everything that is not the document: no
--        roster, no enrollment, no student names, no submissions, no other
--        content, no section membership, no author email, no last-viewed data,
--        no body, no postings. There is no parameter through which any of that
--        could be requested, and the return shape is built key by key.
--      * The attachment function answers ONLY for an attachment belonging to
--        that specific public material.
--
--    The flag is settable only by the teacher of record for every class the
--    item is posted to, or an admin (_classroom_manages_item, the same bar
--    editing the item already carries), and only on a MATERIAL -- a CHECK makes
--    a public assignment or announcement unrepresentable rather than merely
--    refused.
--
-- ZERO CLIENT WRITE GRANTS on the new table, as everywhere in this module.

-- ---------------------------------------------------------------------------
-- 1. The public flag.
-- ---------------------------------------------------------------------------

alter table public.classroom_items
	add column if not exists is_public boolean not null default false;

-- Public is material vocabulary. An assignment collects work and an
-- announcement is class-scoped chatter; neither has a reader outside the
-- roster, and a data model that could say otherwise would quietly disagree with
-- the UI about what those kinds are (0085's own grading-fields reasoning).
alter table public.classroom_items
	drop constraint if exists classroom_items_public_is_material;
alter table public.classroom_items
	add constraint classroom_items_public_is_material check (
		kind = 'material' or is_public = false
	);

create index if not exists classroom_items_public_idx
	on public.classroom_items (is_public) where is_public;

-- ---------------------------------------------------------------------------
-- 2. The reference spec table.
-- ---------------------------------------------------------------------------

create table if not exists public.classroom_reference_specs (
	item_id uuid primary key references public.classroom_items (id) on delete cascade,
	spec jsonb not null,
	imported_by text not null,
	updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Reference spec validation. The BOUNDARY: the write RPC is callable
--    straight through PostgREST, so the TypeScript validator in
--    src/lib/classroom/reference-spec.ts is advice and this is enforcement.
--    The two must agree.
-- ---------------------------------------------------------------------------

-- The kind guard, as its own function so _classroom_check_spec stays exactly as
-- 0086 wrote it (see decision 1 in the header).
create or replace function public._classroom_assert_assignment_kind(p_spec jsonb)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
	v_kind text;
begin
	if p_spec is null or jsonb_typeof(p_spec) <> 'object' then
		return; -- _classroom_check_spec raises its own message for this.
	end if;
	-- An ABSENT kind is an assignment: that default is the whole backward
	-- compatibility rule. `is distinct from` guards the absent case, since a
	-- NULL comparison would silently skip the raise.
	v_kind := p_spec->>'kind';
	if v_kind is null or v_kind = '' or v_kind = 'assignment' then
		return;
	end if;
	if v_kind = 'reference' then
		raise exception 'That is a reference document (kind: "reference"). Attach it to a Material, not an assignment.';
	end if;
	raise exception 'kind must be "assignment" or "reference" when present.';
end;
$$;

revoke all on function public._classroom_assert_assignment_kind(jsonb) from public;

-- Every key present anywhere in the document. The reject-don't-ignore rule
-- below needs the WHOLE tree, not the top level: a silently dropped `points`
-- buried three levels down in a document a parent reads is worse than a failed
-- import.
create or replace function public._classroom_jsonb_keys(p_value jsonb, p_depth integer default 0)
returns text[]
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
	v_keys text[] := '{}';
	v_key text;
	v_child jsonb;
	v_n integer;
begin
	if p_value is null or p_depth > 12 then
		return v_keys;
	end if;
	if jsonb_typeof(p_value) = 'object' then
		for v_key, v_child in select * from jsonb_each(p_value) loop
			v_keys := v_keys || v_key;
			v_keys := v_keys || public._classroom_jsonb_keys(v_child, p_depth + 1);
		end loop;
	elsif jsonb_typeof(p_value) = 'array' then
		for v_n in 0 .. jsonb_array_length(p_value) - 1 loop
			v_keys := v_keys || public._classroom_jsonb_keys(p_value->v_n, p_depth + 1);
		end loop;
	end if;
	return v_keys;
end;
$$;

revoke all on function public._classroom_jsonb_keys(jsonb, integer) from public;

create or replace function public._classroom_check_reference_spec(p_spec jsonb)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
	v_meta jsonb;
	v_sections jsonb;
	v_section jsonb;
	v_blocks jsonb;
	v_block jsonb;
	v_items jsonb;
	v_columns jsonb;
	v_rows jsonb;
	v_cards jsonb;
	v_links jsonb;
	v_config jsonb;
	v_entries jsonb;
	v_keys text[];
	v_banned text;
	v_slugs text[] := '{}';
	v_col_keys text[];
	v_slug text;
	v_name text;
	v_type text;
	v_tool text;
	v_nav text;
	v_n integer;
	v_m integer;
	v_k integer;
begin
	if p_spec is null or jsonb_typeof(p_spec) <> 'object' then
		raise exception 'The spec must be a JSON object.';
	end if;
	if p_spec->>'kind' is distinct from 'reference' then
		raise exception 'A reference spec must set kind to "reference".';
	end if;
	if p_spec->'schemaVersion' is distinct from to_jsonb(2) then
		raise exception 'A reference spec needs schemaVersion 2.';
	end if;

	-- Reject, never ignore: a reference document has no points, rubric, AI
	-- level, declaration, approval gate or modules ANYWHERE in it.
	v_keys := public._classroom_jsonb_keys(p_spec);
	foreach v_banned in array array[
		'points', 'totalPoints', 'rubric', 'aiLevel', 'declarations', 'approvalGate', 'modules'
	] loop
		if v_banned = any (v_keys) then
			raise exception 'A reference document may not carry "%" anywhere -- references have no points, rubric, AI level, or declarations.', v_banned;
		end if;
	end loop;

	v_meta := p_spec->'meta';
	if v_meta is null or jsonb_typeof(v_meta) <> 'object' then
		raise exception 'The spec needs a meta object.';
	end if;
	if coalesce(btrim(v_meta->>'referenceId'), '') = '' then
		raise exception 'meta.referenceId is required.';
	end if;
	if coalesce(btrim(v_meta->>'title'), '') = '' then
		raise exception 'meta.title is required.';
	end if;

	v_nav := p_spec->>'navigation';
	if v_nav is not null and v_nav not in ('tabs', 'stacked') then
		raise exception 'navigation must be "tabs" or "stacked" (default "tabs").';
	end if;

	v_sections := p_spec->'sections';
	if v_sections is null or jsonb_typeof(v_sections) <> 'array'
		or jsonb_array_length(v_sections) = 0 then
		raise exception 'The spec needs a non-empty sections array.';
	end if;
	if jsonb_array_length(v_sections) > 40 then
		raise exception 'At most 40 sections per reference document.';
	end if;

	for v_n in 0 .. jsonb_array_length(v_sections) - 1 loop
		v_section := v_sections->v_n;
		if jsonb_typeof(v_section) <> 'object' then
			raise exception 'Section % is not an object.', v_n + 1;
		end if;
		-- The slug is a PERMANENT CONTRACT (printed sheets and assignment deep
		-- links point at it), so a malformed or duplicated one is a hard error.
		v_slug := v_section->>'slug';
		if v_slug is null or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) > 60 then
			raise exception 'Section % needs a URL-safe slug (lowercase letters, digits and single hyphens).', v_n + 1;
		end if;
		if v_slug = any (v_slugs) then
			raise exception 'Duplicate section slug "%".', v_slug;
		end if;
		v_slugs := v_slugs || v_slug;
		if coalesce(btrim(v_section->>'title'), '') = '' then
			raise exception 'Section "%" needs a title.', v_slug;
		end if;

		v_blocks := v_section->'blocks';
		if v_blocks is null or jsonb_typeof(v_blocks) <> 'array'
			or jsonb_array_length(v_blocks) = 0 then
			raise exception 'Section "%" needs a non-empty blocks array.', v_slug;
		end if;
		if jsonb_array_length(v_blocks) > 60 then
			raise exception 'Section "%" has more than 60 blocks.', v_slug;
		end if;

		for v_m in 0 .. jsonb_array_length(v_blocks) - 1 loop
			v_block := v_blocks->v_m;
			v_name := format('Section "%s" block %s', v_slug, v_m + 1);
			if jsonb_typeof(v_block) <> 'object' then
				raise exception '% is not an object.', v_name;
			end if;
			v_type := v_block->>'type';
			if v_type is null or v_type not in
				('instructions', 'keyValue', 'dataTable', 'callout', 'cardGrid', 'linkCard', 'calc') then
				raise exception '% has unknown type "%". A reference document reads; it never collects work.',
					v_name, coalesce(v_type, '(none)');
			end if;

			if v_type = 'instructions' then
				if coalesce(btrim(v_block->>'content'), '') = '' then
					raise exception '% (instructions) has no content.', v_name;
				end if;

			elsif v_type = 'keyValue' then
				v_items := v_block->'items';
				if v_items is null or jsonb_typeof(v_items) <> 'array'
					or jsonb_array_length(v_items) = 0 or jsonb_array_length(v_items) > 40 then
					raise exception '% (keyValue) needs 1-40 items.', v_name;
				end if;
				for v_k in 0 .. jsonb_array_length(v_items) - 1 loop
					if jsonb_typeof(v_items->v_k) <> 'object'
						or coalesce(btrim(v_items->v_k->>'label'), '') = ''
						or jsonb_typeof(v_items->v_k->'value') is distinct from 'string' then
						raise exception '% (keyValue) row % needs a label and a text value.', v_name, v_k + 1;
					end if;
				end loop;

			elsif v_type = 'dataTable' then
				v_columns := v_block->'columns';
				if v_columns is null or jsonb_typeof(v_columns) <> 'array'
					or jsonb_array_length(v_columns) = 0 or jsonb_array_length(v_columns) > 10 then
					raise exception '% (dataTable) needs 1-10 columns.', v_name;
				end if;
				v_col_keys := '{}';
				for v_k in 0 .. jsonb_array_length(v_columns) - 1 loop
					if jsonb_typeof(v_columns->v_k) <> 'object'
						or coalesce(v_columns->v_k->>'key', '') !~ '^[A-Za-z0-9_-]{1,40}$'
						or coalesce(btrim(v_columns->v_k->>'label'), '') = '' then
						raise exception '% (dataTable) column % needs a key and a label.', v_name, v_k + 1;
					end if;
					if (v_columns->v_k->>'key') = any (v_col_keys) then
						raise exception '% (dataTable) has a duplicate column key "%".', v_name, v_columns->v_k->>'key';
					end if;
					v_col_keys := v_col_keys || (v_columns->v_k->>'key');
				end loop;
				v_rows := v_block->'rows';
				if v_rows is null or jsonb_typeof(v_rows) <> 'array'
					or jsonb_array_length(v_rows) = 0 or jsonb_array_length(v_rows) > 200 then
					raise exception '% (dataTable) needs 1-200 rows.', v_name;
				end if;
				for v_k in 0 .. jsonb_array_length(v_rows) - 1 loop
					if jsonb_typeof(v_rows->v_k) <> 'object' then
						raise exception '% (dataTable) row % must be an object keyed by column.', v_name, v_k + 1;
					end if;
				end loop;

			elsif v_type = 'callout' then
				if coalesce(v_block->>'variant', '') not in ('info', 'warn', 'required') then
					raise exception '% (callout) variant must be info, warn or required.', v_name;
				end if;
				if coalesce(btrim(v_block->>'content'), '') = '' then
					raise exception '% (callout) has no content.', v_name;
				end if;

			elsif v_type = 'cardGrid' then
				v_cards := v_block->'cards';
				if v_cards is null or jsonb_typeof(v_cards) <> 'array'
					or jsonb_array_length(v_cards) < 2 or jsonb_array_length(v_cards) > 4 then
					raise exception '% (cardGrid) needs 2-4 cards.', v_name;
				end if;
				for v_k in 0 .. jsonb_array_length(v_cards) - 1 loop
					if jsonb_typeof(v_cards->v_k) <> 'object'
						or coalesce(btrim(v_cards->v_k->>'title'), '') = '' then
						raise exception '% (cardGrid) card % needs a title.', v_name, v_k + 1;
					end if;
					if coalesce(v_cards->v_k->>'url', '') <> ''
						and v_cards->v_k->>'url' !~* '^https?://' then
						raise exception '% (cardGrid) card % url must start with http:// or https://.', v_name, v_k + 1;
					end if;
				end loop;

			elsif v_type = 'linkCard' then
				v_links := v_block->'links';
				if v_links is null or jsonb_typeof(v_links) <> 'array'
					or jsonb_array_length(v_links) = 0 or jsonb_array_length(v_links) > 30 then
					raise exception '% (linkCard) needs 1-30 links.', v_name;
				end if;
				for v_k in 0 .. jsonb_array_length(v_links) - 1 loop
					if jsonb_typeof(v_links->v_k) <> 'object'
						or coalesce(v_links->v_k->>'url', '') !~* '^https?://' then
						raise exception '% (linkCard) link % needs a http(s) url.', v_name, v_k + 1;
					end if;
					-- The whole point of the field: when a retailer listing dies,
					-- the part number must still be readable on the page.
					if coalesce(btrim(v_links->v_k->>'fallbackLabel'), '') = '' then
						raise exception '% (linkCard) link % needs a fallbackLabel -- it stays on the page when the target dies.', v_name, v_k + 1;
					end if;
				end loop;

			else -- calc
				v_tool := v_block->>'tool';
				if v_tool is null or v_tool not in ('gradeCalculator', 'aiLevelLookup') then
					raise exception '% (calc) has unknown tool "%". Known tools: gradeCalculator, aiLevelLookup.',
						v_name, coalesce(v_tool, '(none)');
				end if;
				v_config := v_block->'config';
				if v_config is null or jsonb_typeof(v_config) <> 'object' then
					raise exception '% (calc) needs a config object.', v_name;
				end if;
				if v_tool = 'gradeCalculator' then
					v_entries := v_config->'categories';
					if v_entries is null or jsonb_typeof(v_entries) <> 'array'
						or jsonb_array_length(v_entries) = 0 or jsonb_array_length(v_entries) > 20 then
						raise exception '% (gradeCalculator) needs 1-20 categories.', v_name;
					end if;
					for v_k in 0 .. jsonb_array_length(v_entries) - 1 loop
						if jsonb_typeof(v_entries->v_k) <> 'object'
							or coalesce(btrim(v_entries->v_k->>'name'), '') = '' then
							raise exception '% (gradeCalculator) category % needs a name.', v_name, v_k + 1;
						end if;
						if jsonb_typeof(v_entries->v_k->'pointsPossible') is distinct from 'number'
							or (v_entries->v_k->>'pointsPossible')::numeric <= 0 then
							raise exception '% (gradeCalculator) category % needs pointsPossible > 0.', v_name, v_k + 1;
						end if;
						if jsonb_typeof(v_entries->v_k->'weight') is distinct from 'number'
							or (v_entries->v_k->>'weight')::numeric <= 0 then
							raise exception '% (gradeCalculator) category % needs weight > 0.', v_name, v_k + 1;
						end if;
					end loop;
					if coalesce(btrim(v_config->>'disclaimer'), '') = '' then
						raise exception '% (gradeCalculator) needs a disclaimer.', v_name;
					end if;
				else
					v_entries := v_config->'entries';
					if v_entries is null or jsonb_typeof(v_entries) <> 'array'
						or jsonb_array_length(v_entries) = 0 or jsonb_array_length(v_entries) > 40 then
						raise exception '% (aiLevelLookup) needs 1-40 entries.', v_name;
					end if;
					for v_k in 0 .. jsonb_array_length(v_entries) - 1 loop
						if jsonb_typeof(v_entries->v_k) <> 'object'
							or coalesce(btrim(v_entries->v_k->>'workType'), '') = '' then
							raise exception '% (aiLevelLookup) entry % needs a workType.', v_name, v_k + 1;
						end if;
						if jsonb_typeof(v_entries->v_k->'level') is distinct from 'number'
							or (v_entries->v_k->>'level')::numeric not in (0, 1, 2, 3) then
							raise exception '% (aiLevelLookup) entry % needs level 0-3.', v_name, v_k + 1;
						end if;
						if coalesce(btrim(v_entries->v_k->>'permitted'), '') = ''
							or coalesce(btrim(v_entries->v_k->>'notPermitted'), '') = '' then
							raise exception '% (aiLevelLookup) entry % needs both permitted and notPermitted text.', v_name, v_k + 1;
						end if;
					end loop;
				end if;
			end if;
		end loop;
	end loop;
end;
$$;

revoke all on function public._classroom_check_reference_spec(jsonb) from public;

-- ---------------------------------------------------------------------------
-- 4. Writes (teacher side). Same signature as 0086's, so this is a genuine
--    replacement and no second overload can exist.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_set_assignment_spec(
	p_item_id uuid,
	p_spec jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_kind text;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	select i.kind into v_kind from public.classroom_items i where i.id = p_item_id;
	if v_kind is null then
		raise exception 'That item does not exist.';
	end if;
	if v_kind <> 'assignment' then
		raise exception 'Only an assignment can carry an interactive spec.';
	end if;
	if not public._classroom_manages_item(p_item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can set its spec.';
	end if;

	if p_spec is null or jsonb_typeof(p_spec) = 'null' then
		delete from public.classroom_assignment_specs where item_id = p_item_id;
		return jsonb_build_object('ok', true, 'item_id', p_item_id, 'removed', true);
	end if;

	if pg_column_size(p_spec) > 400000 then
		raise exception 'The spec is too large (400 KB cap).';
	end if;
	-- NEW in 0092, and the ONLY change to this function: a reference document
	-- pasted here says what it actually is instead of failing with "needs a
	-- modules array". _classroom_check_spec itself is untouched.
	perform public._classroom_assert_assignment_kind(p_spec);
	perform public._classroom_check_spec(p_spec);

	insert into public.classroom_assignment_specs (item_id, spec, imported_by, updated_at)
	values (p_item_id, p_spec, public.current_user_email(), now())
	on conflict (item_id) do update
		set spec = excluded.spec, imported_by = excluded.imported_by, updated_at = now();

	return jsonb_build_object('ok', true, 'item_id', p_item_id);
end;
$$;

revoke all on function public.classroom_set_assignment_spec(uuid, jsonb) from public;
grant execute on function public.classroom_set_assignment_spec(uuid, jsonb) to authenticated;

-- Attach (or replace, or with null REMOVE) a reference document on a material.
create or replace function public.classroom_set_reference_spec(
	p_item_id uuid,
	p_spec jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_kind text;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	select i.kind into v_kind from public.classroom_items i where i.id = p_item_id;
	if v_kind is null then
		raise exception 'That item does not exist.';
	end if;
	if v_kind <> 'material' then
		raise exception 'Only a material can carry a reference document.';
	end if;
	if not public._classroom_manages_item(p_item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can set its reference document.';
	end if;

	if p_spec is null or jsonb_typeof(p_spec) = 'null' then
		delete from public.classroom_reference_specs where item_id = p_item_id;
		return jsonb_build_object('ok', true, 'item_id', p_item_id, 'removed', true);
	end if;

	if pg_column_size(p_spec) > 400000 then
		raise exception 'The reference document is too large (400 KB cap).';
	end if;
	perform public._classroom_check_reference_spec(p_spec);

	insert into public.classroom_reference_specs (item_id, spec, imported_by, updated_at)
	values (p_item_id, p_spec, public.current_user_email(), now())
	on conflict (item_id) do update
		set spec = excluded.spec, imported_by = excluded.imported_by, updated_at = now();

	return jsonb_build_object('ok', true, 'item_id', p_item_id);
end;
$$;

revoke all on function public.classroom_set_reference_spec(uuid, jsonb) from public;
grant execute on function public.classroom_set_reference_spec(uuid, jsonb) to authenticated;

-- Flip the public flag. Returns what a caller needs to state plainly what
-- becomes visible, so the confirm step is not guessing.
create or replace function public.classroom_set_item_public(
	p_item_id uuid,
	p_public boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_kind text;
	v_has_spec boolean;
	v_attachments integer;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	select i.kind into v_kind from public.classroom_items i where i.id = p_item_id;
	if v_kind is null then
		raise exception 'That item does not exist.';
	end if;
	if v_kind <> 'material' and coalesce(p_public, false) then
		raise exception 'Only a material can be made public.';
	end if;
	if not public._classroom_manages_item(p_item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can publish it outside the roster.';
	end if;

	update public.classroom_items set is_public = coalesce(p_public, false), updated_at = now()
	where id = p_item_id;

	select exists (select 1 from public.classroom_reference_specs where item_id = p_item_id)
		into v_has_spec;
	select count(*) into v_attachments
		from public.classroom_attachments where item_id = p_item_id;

	return jsonb_build_object(
		'ok', true,
		'item_id', p_item_id,
		'is_public', coalesce(p_public, false),
		'has_reference', v_has_spec,
		'attachments', v_attachments
	);
end;
$$;

revoke all on function public.classroom_set_item_public(uuid, boolean) from public;
grant execute on function public.classroom_set_item_public(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Reads.
-- ---------------------------------------------------------------------------

-- Authenticated: a reference document is as readable as the item that carries
-- it (classroom_can_read_item), exactly like the rubric in 0086. Delegating
-- rather than restating the rule is what keeps the two from drifting.
revoke all on public.classroom_reference_specs from anon, authenticated;
grant select on public.classroom_reference_specs to authenticated;
alter table public.classroom_reference_specs enable row level security;

drop policy if exists "classroom reference specs follow their item"
	on public.classroom_reference_specs;
create policy "classroom reference specs follow their item"
	on public.classroom_reference_specs
	for select
	to authenticated
	using (public.classroom_can_read_item(item_id));

-- THE PUBLIC READ PATH. Deliberately a SEPARATE, NARROW function rather than
-- the authenticated one with a check bypassed: everything it can return is
-- listed right here, key by key, and there is no parameter through which
-- anything else could be asked for.
--
-- Answers null for: an unknown id, a private material, an unpublished one, a
-- material with no reference document, and anything that is not a material.
-- All five are the SAME answer on purpose -- a distinguishable refusal would
-- confirm a real id to a stranger.
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
				select jsonb_agg(
					jsonb_build_object(
						'id', a.id,
						'filename', a.filename,
						'mime_type', a.mime_type,
						'size_bytes', a.size_bytes,
						'sort_order', a.sort_order
					)
					order by a.sort_order, a.created_at
				)
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
		and i.published;
$$;

revoke all on function public.classroom_public_reference(uuid) from public;
grant execute on function public.classroom_public_reference(uuid) to anon, authenticated;

-- The bytes half. Returns the Drive handle for an attachment belonging to THAT
-- specific public material and nothing else -- which is exactly as much as
-- serving the file itself already grants, and is why this needs no
-- service-role client anywhere in the public path.
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
		and i.published;
$$;

revoke all on function public.classroom_public_attachment(uuid) from public;
grant execute on function public.classroom_public_attachment(uuid) to anon, authenticated;
