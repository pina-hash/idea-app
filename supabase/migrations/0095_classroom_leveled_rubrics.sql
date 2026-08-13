-- 0095_classroom_leveled_rubrics.sql
-- Apply manually in the Supabase SQL editor, after 0094.
--
-- LEVELED RUBRIC CRITERIA. A criterion was a name, a point value, and one
-- descriptor, and the grader typed a number -- which cannot produce consistent
-- grading across three sections taught by two instructors. A criterion is now a
-- name plus an ORDERED LIST OF LEVELS, each with points, a short label and a
-- descriptor, and the grader picks a level.
--
-- THE CONSTRAINTS, enforced here and mirrored (friendly half) by validateSpec /
-- rubricIssues in src/lib/classroom/assignment-spec.ts:
--   * three or four levels per criterion
--   * the TOP level's points equal the criterion maximum
--   * the BOTTOM level is 0
--   * points strictly descending
--   * every level carries a label and a descriptor
--
-- INCOMPLETE CRITERIA, and why they exist. The migration below cannot invent
-- grading policy: a flat criterion has exactly one descriptor, so it becomes its
-- own TOP level and the lower levels are left for the author to write. Such a
-- criterion cannot satisfy the constraints above, so it is stored with
-- `incomplete: true` -- visible in the builder, the grading console and the
-- student's rubric, rather than silently half-migrated. Two rules keep that from
-- being an escape hatch:
--   1. `incomplete` is DERIVED SERVER-SIDE (_classroom_normalize_rubric stamps
--      it and strips whatever the client sent), so a caller cannot flag a
--      criterion as unfinished to dodge the constraints.
--   2. Even an incomplete criterion must satisfy everything that is still
--      meaningful: at most four levels, top level equals the maximum, strictly
--      descending, every level in range.
-- SPEC IMPORT IS STRICT with no such allowance: a spec is authored content, so
-- _classroom_check_spec below refuses a flat criterion BY NAME and requires the
-- full constraint set. Schema v1.1, docs/IDEA_MATERIAL_SPEC_v1.md.
--
-- OVERRIDES. A grader may still score any in-between value inside the
-- criterion's range, but a score matching NO level's points REQUIRES a comment
-- on that criterion. Override-ness is DERIVED from the number (points are
-- strictly descending, so at most one level can match) rather than taken from a
-- client flag -- there is nothing to forge. Comments live in the new
-- classroom_submissions.criterion_comments; the LEVEL is never stored, it is
-- read back from the score, so editing a rubric later can never leave a stored
-- level index pointing at a level that no longer exists.
--
-- NOT TOUCHED: rubric_scores keeps its exact {criterionId: points} shape and no
-- existing row is rewritten, so the migration cannot lose a score. RLS on every
-- table is unchanged -- this migration adds no table and no policy.
--
-- Signature note: classroom_grade_submission GAINS a parameter, so its old
-- 5-argument form is DROPPED first. `create or replace` keys on the exact
-- parameter list, and a defaulted 6th argument would otherwise leave the old
-- signature callable as a second, comment-blind overload (the 0058/0068 trap).

-- ---------------------------------------------------------------------------
-- 1. Per-criterion comments (the override's justification).
-- ---------------------------------------------------------------------------

-- {criterionId: text}. Only ever written by classroom_grade_submission, which
-- requires one for every overridden criterion. Same row, same RLS, and the same
-- disclosure as rubric_scores and teacher_comment beside it.
alter table public.classroom_submissions
	add column if not exists criterion_comments jsonb;

-- ---------------------------------------------------------------------------
-- 2. The level constraints, in ONE place.
-- ---------------------------------------------------------------------------

-- Validates one criterion's levels against p_max (the criterion maximum) and
-- returns TRUE when the criterion is COMPLETE -- i.e. satisfies the full
-- constraint set. Anything it returns false for is a legitimate but unfinished
-- criterion; anything it raises on is malformed and never becomes a row.
-- p_strict = true (spec import) turns "unfinished" into a refusal.
create or replace function public._classroom_check_levels(
	p_levels jsonb,
	p_max numeric,
	p_label text,
	p_strict boolean
)
returns boolean
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
	v_level jsonb;
	v_points numeric;
	v_prev numeric;
	v_count integer;
	v_k integer;
	v_complete boolean := true;
begin
	if p_levels is null or jsonb_typeof(p_levels) <> 'array'
		or jsonb_array_length(p_levels) = 0 then
		if p_strict then
			raise exception '% has no levels. A rubric criterion needs three or four levels (top level = the criterion maximum, bottom level = 0).', p_label;
		end if;
		raise exception '% needs at least one level.', p_label;
	end if;
	v_count := jsonb_array_length(p_levels);
	if v_count > 4 then
		raise exception '% has % levels; a criterion may have at most four.', p_label, v_count;
	end if;
	if v_count < 3 then
		if p_strict then
			raise exception '% has % level(s); a criterion needs three or four.', p_label, v_count;
		end if;
		v_complete := false;
	end if;

	for v_k in 0 .. v_count - 1 loop
		v_level := p_levels->v_k;
		if jsonb_typeof(v_level) <> 'object' then
			raise exception '% level % is not an object.', p_label, v_k + 1;
		end if;
		-- `is distinct from`: an ABSENT key makes jsonb_typeof NULL, and a NULL
		-- comparison would silently skip the raise.
		if jsonb_typeof(v_level->'points') is distinct from 'number' then
			raise exception '% level % needs a numeric points value.', p_label, v_k + 1;
		end if;
		v_points := (v_level->>'points')::numeric;
		if v_points < 0 or v_points > p_max then
			raise exception '% level % points must be between 0 and % (the criterion maximum).',
				p_label, v_k + 1, p_max;
		end if;
		if coalesce(btrim(v_level->>'label'), '') = ''
			or char_length(v_level->>'label') > 80 then
			raise exception '% level % needs a label (up to 80 characters).', p_label, v_k + 1;
		end if;
		if char_length(coalesce(v_level->>'descriptor', '')) > 1000 then
			raise exception '% level % descriptor is too long (1000 characters max).', p_label, v_k + 1;
		end if;
		if coalesce(btrim(v_level->>'descriptor'), '') = '' then
			if p_strict then
				raise exception '% level % needs a descriptor.', p_label, v_k + 1;
			end if;
			v_complete := false;
		end if;

		if v_k = 0 then
			if v_points <> p_max then
				raise exception '% top level is % but the criterion maximum is %; the top level must equal the maximum.',
					p_label, v_points, p_max;
			end if;
		elsif v_points >= v_prev then
			raise exception '% level % (%) must be worth strictly less than the level above it (%).',
				p_label, v_k + 1, v_points, v_prev;
		end if;
		v_prev := v_points;
	end loop;

	if v_prev <> 0 then
		if p_strict then
			raise exception '% bottom level is % but must be 0.', p_label, v_prev;
		end if;
		v_complete := false;
	end if;

	return v_complete;
end;
$$;

revoke all on function public._classroom_check_levels(jsonb, numeric, text, boolean) from public;

-- ---------------------------------------------------------------------------
-- 3. Spec validation, recreated for schema v1.1 rubrics.
-- ---------------------------------------------------------------------------
--
-- Identical to 0086's function except for the rubric block: a criterion's
-- MAXIMUM is now its top level's points (v1.1 dropped the flat `points` field,
-- though a matching one is still accepted), the maxima must still sum to the
-- module's points, and a flat criterion is refused by name.
create or replace function public._classroom_check_spec(p_spec jsonb)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
	v_meta jsonb;
	v_modules jsonb;
	v_module jsonb;
	v_blocks jsonb;
	v_block jsonb;
	v_rubric jsonb;
	v_crit jsonb;
	v_columns jsonb;
	v_col jsonb;
	v_items jsonb;
	v_gate jsonb;
	v_total numeric;
	v_module_points numeric;
	v_points_sum numeric := 0;
	v_rubric_sum numeric;
	v_crit_max numeric;
	v_crit_name text;
	v_module_ids text[] := '{}';
	v_block_ids text[] := '{}';
	v_col_keys text[];
	v_calc_ids text[] := '{}';
	v_id text;
	v_type text;
	v_min numeric;
	v_max numeric;
	v_n integer;
	v_m integer;
	v_k integer;
begin
	if p_spec is null or jsonb_typeof(p_spec) <> 'object' then
		raise exception 'The spec must be a JSON object.';
	end if;
	if p_spec->'schemaVersion' is distinct from to_jsonb(1) then
		raise exception 'Unsupported schemaVersion (this engine reads schema v1).';
	end if;

	v_meta := p_spec->'meta';
	if v_meta is null or jsonb_typeof(v_meta) <> 'object' then
		raise exception 'The spec needs a meta object.';
	end if;
	if coalesce(btrim(v_meta->>'assignmentId'), '') = '' then
		raise exception 'meta.assignmentId is required.';
	end if;
	if coalesce(btrim(v_meta->>'title'), '') = '' then
		raise exception 'meta.title is required.';
	end if;
	-- `is distinct from`, never `<>`: an ABSENT key makes jsonb_typeof NULL and
	-- a NULL comparison silently skips the raise.
	if jsonb_typeof(v_meta->'totalPoints') is distinct from 'number' then
		raise exception 'meta.totalPoints must be a number.';
	end if;
	v_total := (v_meta->>'totalPoints')::numeric;
	if v_total < 0 or v_total > 10000 then
		raise exception 'meta.totalPoints must be between 0 and 10000.';
	end if;

	v_modules := p_spec->'modules';
	if v_modules is null or jsonb_typeof(v_modules) <> 'array'
		or jsonb_array_length(v_modules) = 0 then
		raise exception 'The spec needs a non-empty modules array.';
	end if;
	if jsonb_array_length(v_modules) > 40 then
		raise exception 'At most 40 modules per spec.';
	end if;

	for v_n in 0 .. jsonb_array_length(v_modules) - 1 loop
		v_module := v_modules->v_n;
		if jsonb_typeof(v_module) <> 'object' then
			raise exception 'Module % is not an object.', v_n + 1;
		end if;
		v_id := v_module->>'id';
		if v_id is null or v_id !~ '^[A-Za-z0-9_-]{1,40}$' then
			raise exception 'Module % needs an id (letters, digits, - and _ only).', v_n + 1;
		end if;
		if v_id = any (v_module_ids) then
			raise exception 'Duplicate module id "%".', v_id;
		end if;
		v_module_ids := v_module_ids || v_id;
		if coalesce(btrim(v_module->>'title'), '') = '' then
			raise exception 'Module "%" needs a title.', v_id;
		end if;
		if jsonb_typeof(v_module->'points') is distinct from 'number' then
			raise exception 'Module "%" needs a numeric points value.', v_id;
		end if;
		v_module_points := (v_module->>'points')::numeric;
		if v_module_points < 0 or v_module_points > 10000 then
			raise exception 'Module "%" points must be between 0 and 10000.', v_id;
		end if;
		v_points_sum := v_points_sum + v_module_points;
		if v_module->'aiLevel' is not null and jsonb_typeof(v_module->'aiLevel') <> 'null' then
			if jsonb_typeof(v_module->'aiLevel') <> 'number'
				or (v_module->>'aiLevel')::numeric not in (0, 1, 2, 3) then
				raise exception 'Module "%" aiLevel must be 0-3 or null.', v_id;
			end if;
		end if;

		v_blocks := v_module->'blocks';
		if v_blocks is null or jsonb_typeof(v_blocks) <> 'array' then
			raise exception 'Module "%" needs a blocks array.', v_id;
		end if;
		if jsonb_array_length(v_blocks) > 60 then
			raise exception 'Module "%" has more than 60 blocks.', v_id;
		end if;

		for v_m in 0 .. jsonb_array_length(v_blocks) - 1 loop
			v_block := v_blocks->v_m;
			if jsonb_typeof(v_block) <> 'object' then
				raise exception 'Module "%" block % is not an object.', v_id, v_m + 1;
			end if;
			v_type := v_block->>'type';
			if v_type is null or v_type not in
				('instructions', 'textField', 'table', 'imageZone', 'checklist', 'calc') then
				raise exception 'Module "%" block % has unknown type "%".', v_id, v_m + 1, coalesce(v_type, '(none)');
			end if;

			if v_type = 'calc' then
				v_calc_ids := v_calc_ids || coalesce(v_block->>'id', '(unnamed)');
				continue;
			end if;
			if v_type = 'instructions' then
				if coalesce(v_block->>'content', '') = '' then
					raise exception 'Module "%" has an instructions block with no content.', v_id;
				end if;
				continue;
			end if;

			-- Every interactive block carries a globally-unique id: it is the key
			-- the student's responses and files are stored under.
			v_id := v_block->>'id';
			if v_id is null or v_id !~ '^[A-Za-z0-9_-]{1,40}$' then
				raise exception 'Module "%" block % needs an id (letters, digits, - and _ only).',
					v_module->>'id', v_m + 1;
			end if;
			if v_id = any (v_block_ids) then
				raise exception 'Duplicate block id "%".', v_id;
			end if;
			v_block_ids := v_block_ids || v_id;

			if v_type = 'textField' then
				if coalesce(btrim(v_block->>'prompt'), '') = '' then
					raise exception 'textField "%" needs a prompt.', v_id;
				end if;
				v_min := null;
				v_max := null;
				if v_block->'minSentences' is not null and jsonb_typeof(v_block->'minSentences') <> 'null' then
					if jsonb_typeof(v_block->'minSentences') <> 'number'
						or (v_block->>'minSentences')::numeric < 0 then
						raise exception 'textField "%" minSentences must be a number >= 0.', v_id;
					end if;
					v_min := (v_block->>'minSentences')::numeric;
				end if;
				if v_block->'maxSentences' is not null and jsonb_typeof(v_block->'maxSentences') <> 'null' then
					if jsonb_typeof(v_block->'maxSentences') <> 'number'
						or (v_block->>'maxSentences')::numeric < coalesce(v_min, 0) then
						raise exception 'textField "%" maxSentences must be a number >= minSentences.', v_id;
					end if;
				end if;
			elsif v_type = 'table' then
				v_columns := v_block->'columns';
				if v_columns is null or jsonb_typeof(v_columns) <> 'array'
					or jsonb_array_length(v_columns) = 0 or jsonb_array_length(v_columns) > 12 then
					raise exception 'table "%" needs 1-12 columns.', v_id;
				end if;
				v_col_keys := '{}';
				for v_k in 0 .. jsonb_array_length(v_columns) - 1 loop
					v_col := v_columns->v_k;
					if jsonb_typeof(v_col) <> 'object'
						or coalesce(v_col->>'key', '') !~ '^[A-Za-z0-9_-]{1,40}$'
						or coalesce(btrim(v_col->>'label'), '') = '' then
						raise exception 'table "%" column % needs a key and a label.', v_id, v_k + 1;
					end if;
					if (v_col->>'key') = any (v_col_keys) then
						raise exception 'table "%" has a duplicate column key "%".', v_id, v_col->>'key';
					end if;
					v_col_keys := v_col_keys || (v_col->>'key');
				end loop;
				if v_block->'minRows' is not null and jsonb_typeof(v_block->'minRows') <> 'null' then
					if jsonb_typeof(v_block->'minRows') <> 'number'
						or (v_block->>'minRows')::numeric < 0 or (v_block->>'minRows')::numeric > 100 then
						raise exception 'table "%" minRows must be 0-100.', v_id;
					end if;
				end if;
			elsif v_type = 'imageZone' then
				if v_block->'minImages' is not null and jsonb_typeof(v_block->'minImages') <> 'null' then
					if jsonb_typeof(v_block->'minImages') <> 'number'
						or (v_block->>'minImages')::numeric < 0 or (v_block->>'minImages')::numeric > 20 then
						raise exception 'imageZone "%" minImages must be 0-20.', v_id;
					end if;
				end if;
			elsif v_type = 'checklist' then
				v_items := v_block->'items';
				if v_items is null or jsonb_typeof(v_items) <> 'array'
					or jsonb_array_length(v_items) = 0 or jsonb_array_length(v_items) > 30 then
					raise exception 'checklist "%" needs 1-30 items.', v_id;
				end if;
				for v_k in 0 .. jsonb_array_length(v_items) - 1 loop
					if jsonb_typeof(v_items->v_k) <> 'string'
						or coalesce(btrim(v_items->>v_k), '') = '' then
						raise exception 'checklist "%" item % must be non-empty text.', v_id, v_k + 1;
					end if;
				end loop;
			end if;
		end loop;

		-- Per-module rubric: required whenever the module carries points. Each
		-- criterion is LEVELED (schema v1.1) and its MAXIMUM is its top level's
		-- points; the maxima must sum to exactly the module's points.
		v_rubric := v_module->'rubric';
		if v_rubric is not null and jsonb_typeof(v_rubric) = 'array' and jsonb_array_length(v_rubric) > 0 then
			v_rubric_sum := 0;
			for v_m in 0 .. jsonb_array_length(v_rubric) - 1 loop
				v_crit := v_rubric->v_m;
				if jsonb_typeof(v_crit) <> 'object'
					or coalesce(btrim(v_crit->>'criterion'), '') = '' then
					raise exception 'Module "%" rubric row % needs a criterion.',
						v_module->>'id', v_m + 1;
				end if;
				v_crit_name := format('Module "%s" rubric criterion "%s"',
					v_module->>'id', v_crit->>'criterion');
				if v_crit->'levels' is null or jsonb_typeof(v_crit->'levels') <> 'array'
					or jsonb_array_length(v_crit->'levels') = 0 then
					raise exception '% has no levels. Schema v1.1 requires leveled criteria: three or four levels, the top level worth the criterion maximum and the bottom level 0. Flat criteria are no longer valid.',
						v_crit_name;
				end if;
				if jsonb_typeof(v_crit->'levels'->0->'points') is distinct from 'number' then
					raise exception '% level 1 needs a numeric points value.', v_crit_name;
				end if;
				v_crit_max := (v_crit->'levels'->0->>'points')::numeric;
				if v_crit_max < 0 or v_crit_max > 1000 then
					raise exception '% maximum must be between 0 and 1000.', v_crit_name;
				end if;
				-- v1.1 dropped the flat `points`; a leftover one is accepted only
				-- when it agrees with the top level, so the two can never disagree.
				if v_crit->'points' is not null and jsonb_typeof(v_crit->'points') <> 'null' then
					if jsonb_typeof(v_crit->'points') <> 'number'
						or (v_crit->>'points')::numeric <> v_crit_max then
						raise exception '% has points % but its top level is worth %.',
							v_crit_name, v_crit->>'points', v_crit_max;
					end if;
				end if;
				perform public._classroom_check_levels(v_crit->'levels', v_crit_max, v_crit_name, true);
				v_rubric_sum := v_rubric_sum + v_crit_max;
			end loop;
			if v_rubric_sum <> v_module_points then
				raise exception 'Module "%" rubric sums to % but the module is worth % points.',
					v_module->>'id', v_rubric_sum, v_module_points;
			end if;
		elsif v_module_points > 0 then
			raise exception 'Module "%" carries % points but has no rubric.',
				v_module->>'id', v_module_points;
		end if;
	end loop;

	if array_length(v_calc_ids, 1) is not null then
		raise exception 'calc blocks are not supported yet (%). The print rendering covers those materials until the calc engine lands.',
			array_to_string(v_calc_ids, ', ');
	end if;

	if v_points_sum <> v_total then
		raise exception 'Module points sum to % but meta.totalPoints is %.', v_points_sum, v_total;
	end if;

	if p_spec->'declarations' is not null and jsonb_typeof(p_spec->'declarations') not in ('object', 'null') then
		raise exception 'declarations must be an object.';
	end if;

	v_gate := p_spec->'approvalGate';
	if v_gate is not null and jsonb_typeof(v_gate) <> 'null' then
		if jsonb_typeof(v_gate) <> 'object' then
			raise exception 'approvalGate must be null or an object.';
		end if;
		if coalesce(v_gate->>'afterModule', '') <> all (v_module_ids)
			or coalesce(v_gate->>'afterModule', '') = '' then
			raise exception 'approvalGate.afterModule ("%") is not a module id.',
				coalesce(v_gate->>'afterModule', '');
		end if;
	end if;
end;
$$;

revoke all on function public._classroom_check_spec(jsonb) from public;

-- ---------------------------------------------------------------------------
-- 4. The rubric table's own validation: normalize, don't just check.
-- ---------------------------------------------------------------------------

-- 0086's checker only raised; this one RETURNS the criteria it validated, with
-- `incomplete` stamped from the level constraints and `points` re-derived from
-- the top level. Whatever the client sent for either field is discarded, so the
-- stored row can never disagree with its own levels.
drop function if exists public._classroom_check_rubric(jsonb);

create or replace function public._classroom_normalize_rubric(p_criteria jsonb)
returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
	v_crit jsonb;
	v_out jsonb := '[]'::jsonb;
	v_ids text[] := '{}';
	v_id text;
	v_max numeric;
	v_complete boolean;
	v_label text;
	v_n integer;
begin
	if p_criteria is null or jsonb_typeof(p_criteria) <> 'array'
		or jsonb_array_length(p_criteria) = 0 then
		raise exception 'A rubric needs at least one criterion.';
	end if;
	if jsonb_array_length(p_criteria) > 50 then
		raise exception 'At most 50 rubric criteria.';
	end if;
	for v_n in 0 .. jsonb_array_length(p_criteria) - 1 loop
		v_crit := p_criteria->v_n;
		if jsonb_typeof(v_crit) <> 'object' then
			raise exception 'Rubric row % is not an object.', v_n + 1;
		end if;
		v_id := v_crit->>'id';
		if v_id is null or v_id !~ '^[A-Za-z0-9_-]{1,64}$' then
			raise exception 'Rubric row % needs an id (letters, digits, - and _ only).', v_n + 1;
		end if;
		if v_id = any (v_ids) then
			raise exception 'Duplicate rubric criterion id "%".', v_id;
		end if;
		v_ids := v_ids || v_id;
		if coalesce(btrim(v_crit->>'criterion'), '') = ''
			or char_length(v_crit->>'criterion') > 300 then
			raise exception 'Rubric row % needs criterion text (up to 300 characters).', v_n + 1;
		end if;
		v_label := format('Rubric criterion "%s"', v_crit->>'criterion');

		if v_crit->'levels' is null or jsonb_typeof(v_crit->'levels') <> 'array'
			or jsonb_array_length(v_crit->'levels') = 0 then
			raise exception '% needs levels: three or four, the top level worth the criterion maximum and the bottom level 0.',
				v_label;
		end if;
		if jsonb_typeof(v_crit->'levels'->0->'points') is distinct from 'number' then
			raise exception '% level 1 needs a numeric points value.', v_label;
		end if;
		-- The MAXIMUM is the top level, always. A `points` field on the criterion
		-- is output, never input.
		v_max := (v_crit->'levels'->0->>'points')::numeric;
		if v_max < 0 or v_max > 1000 then
			raise exception '% maximum must be between 0 and 1000.', v_label;
		end if;
		v_complete := public._classroom_check_levels(v_crit->'levels', v_max, v_label, false);

		v_out := v_out || jsonb_build_array(
			jsonb_build_object(
				'id', v_id,
				'criterion', btrim(v_crit->>'criterion'),
				'points', v_max,
				'levels', v_crit->'levels',
				'incomplete', not v_complete
			)
		);
	end loop;
	return v_out;
end;
$$;

revoke all on function public._classroom_normalize_rubric(jsonb) from public;

-- Full-set replacement (the tournament_set_reward_rules convention); null
-- removes the rubric outright. Same signature as 0086.
create or replace function public.classroom_set_rubric(
	p_item_id uuid,
	p_criteria jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_kind text;
	v_criteria jsonb;
	v_unfinished integer;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	select i.kind into v_kind from public.classroom_items i where i.id = p_item_id;
	if v_kind is null then
		raise exception 'That item does not exist.';
	end if;
	if v_kind <> 'assignment' then
		raise exception 'Only an assignment can carry a rubric.';
	end if;
	if not public._classroom_manages_item(p_item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can edit its rubric.';
	end if;

	if p_criteria is null or jsonb_typeof(p_criteria) = 'null' then
		delete from public.classroom_rubrics where item_id = p_item_id;
		return jsonb_build_object('ok', true, 'item_id', p_item_id, 'removed', true);
	end if;

	v_criteria := public._classroom_normalize_rubric(p_criteria);
	select count(*) into v_unfinished
	from jsonb_array_elements(v_criteria) c
	where (c->>'incomplete')::boolean;

	insert into public.classroom_rubrics (item_id, criteria, updated_by, updated_at)
	values (p_item_id, v_criteria, public.current_user_email(), now())
	on conflict (item_id) do update
		set criteria = excluded.criteria, updated_by = excluded.updated_by, updated_at = now();

	return jsonb_build_object('ok', true, 'item_id', p_item_id, 'unfinished', v_unfinished);
end;
$$;

revoke all on function public.classroom_set_rubric(uuid, jsonb) from public;
grant execute on function public.classroom_set_rubric(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Grading by level, with the override comment enforced.
-- ---------------------------------------------------------------------------

-- The old 5-argument form is dropped, not replaced: adding a defaulted
-- parameter would leave it callable as a second overload that silently accepts
-- an unexplained override (and PostgREST cannot resolve the ambiguity either).
drop function if exists public.classroom_grade_submission(uuid, text, jsonb, text, boolean);

create or replace function public.classroom_grade_submission(
	p_item_id uuid,
	p_student_email text,
	p_scores jsonb,
	p_comment text default null,
	p_return boolean default false,
	p_criterion_comments jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_student_email, '')));
	v_criteria jsonb;
	v_crit jsonb;
	v_score numeric := 0;
	v_value jsonb;
	v_missing text[] := '{}';
	v_uncommented text[] := '{}';
	v_key text;
	v_known text[] := '{}';
	v_given numeric;
	v_on_level boolean;
	v_note text;
	v_comments jsonb := '{}'::jsonb;
	v_n integer;
	v_k integer;
	v_now timestamptz := now();
	v_state text;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'A student email is required.';
	end if;
	if not exists (
		select 1 from public.classroom_items i
		where i.id = p_item_id and i.kind = 'assignment'
	) then
		raise exception 'That assignment does not exist.';
	end if;
	if not public.classroom_can_review_submission(p_item_id, v_email) then
		raise exception 'Only a teacher of record for this student''s class can grade this.';
	end if;

	select r.criteria into v_criteria from public.classroom_rubrics r where r.item_id = p_item_id;
	if v_criteria is null then
		raise exception 'Create a rubric for this assignment before grading.';
	end if;
	if p_scores is null or jsonb_typeof(p_scores) <> 'object' then
		raise exception 'Scores must be an object keyed by rubric criterion id.';
	end if;
	if p_criterion_comments is not null and jsonb_typeof(p_criterion_comments) not in ('object', 'null') then
		raise exception 'Criterion comments must be an object keyed by rubric criterion id.';
	end if;

	for v_n in 0 .. jsonb_array_length(v_criteria) - 1 loop
		v_crit := v_criteria->v_n;
		v_key := v_crit->>'id';
		v_known := v_known || v_key;
		v_value := p_scores->v_key;
		v_note := nullif(btrim(coalesce(p_criterion_comments->>v_key, '')), '');
		if char_length(coalesce(v_note, '')) > 1000 then
			raise exception 'The comment on "%" is too long (1000 characters max).', v_crit->>'criterion';
		end if;

		if v_value is null or jsonb_typeof(v_value) = 'null' then
			v_missing := v_missing || v_key;
			-- A comment with no score is kept: the grader may be explaining why
			-- they have not settled on one yet.
			if v_note is not null then
				v_comments := v_comments || jsonb_build_object(v_key, v_note);
			end if;
			continue;
		end if;

		if jsonb_typeof(v_value) <> 'number' then
			raise exception 'The score for "%" must be a number.', v_crit->>'criterion';
		end if;
		v_given := (p_scores->>v_key)::numeric;
		if v_given < 0 or v_given > (v_crit->>'points')::numeric then
			raise exception 'The score for "%" must be between 0 and %.',
				v_crit->>'criterion', v_crit->>'points';
		end if;
		v_score := v_score + v_given;

		-- OVERRIDE = a score matching no level. Derived from the number itself
		-- (level points are strictly descending, so at most one can match), never
		-- taken from a client flag: there is nothing here to forge.
		v_on_level := false;
		if jsonb_typeof(v_crit->'levels') = 'array' then
			for v_k in 0 .. jsonb_array_length(v_crit->'levels') - 1 loop
				if jsonb_typeof(v_crit->'levels'->v_k->'points') = 'number'
					and (v_crit->'levels'->v_k->>'points')::numeric = v_given then
					v_on_level := true;
					exit;
				end if;
			end loop;
		end if;
		if not v_on_level and v_note is null then
			v_uncommented := v_uncommented || v_key;
		end if;
		if v_note is not null then
			v_comments := v_comments || jsonb_build_object(v_key, v_note);
		end if;
	end loop;

	for v_key in select jsonb_object_keys(p_scores) loop
		if v_key <> all (v_known) then
			raise exception 'Score key "%" is not a rubric criterion.', v_key;
		end if;
	end loop;
	if p_criterion_comments is not null and jsonb_typeof(p_criterion_comments) = 'object' then
		for v_key in select jsonb_object_keys(p_criterion_comments) loop
			if v_key <> all (v_known) then
				raise exception 'Comment key "%" is not a rubric criterion.', v_key;
			end if;
		end loop;
	end if;

	-- Structured refusals (the greenline_purchase_item convention), so the
	-- console renders them next to the criterion instead of as an error banner.
	-- The override check runs on EVERY write, not only on release: an
	-- unexplained off-level score must never be storable, even as a draft.
	if array_length(v_uncommented, 1) is not null then
		return jsonb_build_object(
			'ok', false,
			'reason', 'override_needs_comment',
			'missing', to_jsonb(v_uncommented)
		);
	end if;
	if p_return and array_length(v_missing, 1) is not null then
		return jsonb_build_object(
			'ok', false,
			'reason', 'incomplete_scores',
			'missing', to_jsonb(v_missing)
		);
	end if;

	insert into public.classroom_submissions
		(item_id, student_email, rubric_scores, criterion_comments, score, teacher_comment,
		 graded_by, graded_at, updated_at)
	values (p_item_id, v_email, p_scores, v_comments, v_score,
		nullif(btrim(coalesce(p_comment, '')), ''), public.current_user_email(), v_now, v_now)
	on conflict (item_id, student_email) do update
		set rubric_scores = excluded.rubric_scores,
			criterion_comments = excluded.criterion_comments,
			score = excluded.score,
			teacher_comment = excluded.teacher_comment,
			graded_by = excluded.graded_by,
			graded_at = v_now,
			updated_at = v_now;

	if p_return then
		update public.classroom_submissions
		set state = 'returned', returned_at = v_now, updated_at = v_now
		where item_id = p_item_id and student_email = v_email;
	end if;

	select s.state into v_state
	from public.classroom_submissions s
	where s.item_id = p_item_id and s.student_email = v_email;

	return jsonb_build_object('ok', true, 'score', v_score, 'state', v_state);
end;
$$;

revoke all on function public.classroom_grade_submission(uuid, text, jsonb, text, boolean, jsonb) from public;
grant execute on function public.classroom_grade_submission(uuid, text, jsonb, text, boolean, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Migrate existing rubrics: flat criterion -> its own top level.
-- ---------------------------------------------------------------------------
--
-- NO SCORE IS TOUCHED. rubric_scores keeps its {criterionId: points} shape and
-- every criterion keeps its id and its maximum, so a stored score still lands on
-- the same criterion and still means the same thing. Only the criterion's shape
-- changes: its single descriptor becomes the TOP level, any old optional levels
-- that carried real points are carried down beneath it, and the result is
-- stamped `incomplete` unless it happens to satisfy the full constraint set.
--
-- Idempotent: a criterion whose levels already lead with its maximum is passed
-- through the normalizer unchanged, so re-running this file re-stamps the same
-- flags and rewrites nothing else.
do $$
declare
	v_row record;
	v_crit jsonb;
	v_level jsonb;
	v_levels jsonb;
	v_out jsonb;
	v_max numeric;
	v_prev numeric;
	v_points numeric;
	v_top_label text;
	v_top_desc text;
	v_n integer;
	v_k integer;
begin
	if to_regclass('public.classroom_rubrics') is null then
		return;
	end if;
	for v_row in select item_id, criteria from public.classroom_rubrics loop
		v_out := '[]'::jsonb;
		for v_n in 0 .. jsonb_array_length(v_row.criteria) - 1 loop
			v_crit := v_row.criteria->v_n;
			v_max := coalesce((v_crit->>'points')::numeric, 0);
			v_levels := v_crit->'levels';

			-- Already leveled (top level carries the maximum): leave the levels
			-- exactly as they are.
			if v_levels is not null and jsonb_typeof(v_levels) = 'array'
				and jsonb_array_length(v_levels) > 0
				and jsonb_typeof(v_levels->0->'points') is not distinct from 'number'
				and (v_levels->0->>'points')::numeric = v_max then
				v_out := v_out || jsonb_build_array(v_crit);
				continue;
			end if;

			-- The flat criterion's own descriptor becomes the top level. 0086's
			-- optional levels stored their text under `description`; v1.1 calls it
			-- `descriptor`, so both are read.
			v_top_label := 'Full credit';
			v_top_desc := coalesce(v_crit->>'descriptor', '');
			if v_levels is not null and jsonb_typeof(v_levels) = 'array'
				and jsonb_array_length(v_levels) > 0 then
				v_level := v_levels->0;
				if coalesce(btrim(v_level->>'label'), '') <> '' then
					v_top_label := v_level->>'label';
				end if;
				if coalesce(v_top_desc, '') = '' then
					v_top_desc := coalesce(v_level->>'descriptor', v_level->>'description', '');
				end if;
			end if;
			v_out := v_out || jsonb_build_array(jsonb_build_object(
				'id', v_crit->>'id',
				'criterion', v_crit->>'criterion',
				'points', v_max,
				'levels', jsonb_build_array(jsonb_build_object(
					'points', v_max, 'label', v_top_label, 'descriptor', v_top_desc
				))
			));

			-- Carry down any old level that named a real, strictly lower value:
			-- that IS grading policy somebody wrote, and dropping it would lose it.
			if v_levels is not null and jsonb_typeof(v_levels) = 'array' then
				v_prev := v_max;
				for v_k in 0 .. jsonb_array_length(v_levels) - 1 loop
					v_level := v_levels->v_k;
					-- `is distinct from`: an ABSENT points key makes jsonb_typeof NULL,
					-- and a NULL comparison would fall THROUGH this guard and append
					-- a level with no points at all.
					if jsonb_typeof(v_level->'points') is distinct from 'number' then
						continue;
					end if;
					v_points := (v_level->>'points')::numeric;
					if v_points >= v_prev or v_points < 0 then
						continue;
					end if;
					v_out := jsonb_set(
						v_out,
						array[(jsonb_array_length(v_out) - 1)::text, 'levels'],
						(v_out->(jsonb_array_length(v_out) - 1)->'levels') || jsonb_build_array(
							jsonb_build_object(
								'points', v_points,
								'label', coalesce(nullif(btrim(coalesce(v_level->>'label', '')), ''),
									format('Level %s', v_k + 1)),
								'descriptor', coalesce(v_level->>'descriptor', v_level->>'description', '')
							)
						)
					);
					v_prev := v_points;
				end loop;
			end if;
		end loop;
		-- The normalizer re-derives `points` and stamps `incomplete`, so the flags
		-- on migrated rows come from the same code every later save uses.
		update public.classroom_rubrics
		set criteria = public._classroom_normalize_rubric(v_out)
		where item_id = v_row.item_id;
	end loop;
end;
$$;
