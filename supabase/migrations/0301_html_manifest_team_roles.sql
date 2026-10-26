-- 0301_html_manifest_team_roles.sql
--
-- THE MANIFEST GATE ADMITS ROLE-OWNED MODULES (ledger 0436, IDEA209H Unit 4,
-- Mr. Pina's decisions of 2026-10-23 to 2026-10-26). THIS FILE ONLY WIDENS.
--
-- A team assignment declares its subsystem roles once, at the top of the
-- manifest, and a module owned by one role says so:
--
--     "team": { "roles": [ { "id": "drive", "title": "Drive" }, ... ] }
--     { "id": "drive-plan", "audience": "role", "role": "drive", ... }
--
-- 0195's gate admits `audience` of "team" or "individual" and refuses anything
-- else, so a Unit 4 document could not be stored at all. This replaces that one
-- function with 0195's body, copied, and three changes:
--
--   1. "role" joins the two audience values;
--   2. a module whose audience is "role" must name a role the manifest's own
--      `team.roles` declares;
--   3. `team`, when present, must be an object with a `roles` array of at most
--      eight roles, each an id in the block-id charset and a title, ids unique.
--
-- WHY THIS IS A WIDENING AND NOTHING ELSE. Every refusal above is reachable
-- only by a manifest that carries `team` or `audience: "role"`, and no deployed
-- gate ever stored one: "role" was refused outright, and `team` is a key no
-- stored manifest has (tests/db/html-manifest-team-roles.test.ts puts the whole
-- exported corpus under materials/ and every committed fixture through the
-- DEPLOYED gate first, applies this file over the same database, and compares
-- answer for answer, refusal text included). A stored manifest therefore
-- answers exactly as before, and the gate widens in its own push, before any
-- client can emit the wider shape (CLAUDE.md, DEPLOY ORDERING).
--
-- WHAT IS DELIBERATELY NOT CHECKED HERE: the plan keys a team manifest may also
-- carry (`team.checkpoints`, a block's `taskPoints` and `machine`). They decide
-- no write and corrupt no row, so like `thumbnail` they are read tolerantly by
-- their one reader and never refused by this gate.
--
-- DEPLOY ORDERING: none. No signature changes.
--
-- WHAT UNDOES IT, a person's paste: re-run 0195's
-- `_classroom_check_html_manifest` and its revoke line, then
--   drop function if exists public._classroom_html_team_roles(jsonb);
-- A manifest stored with a role module in between keeps its row; only its next
-- re-upload would be refused.

-- ---------------------------------------------------------------------------
-- 1. THE ROLE IDS A MANIFEST DECLARES. New, and first, so the apply probe can
--    see that this file landed. Tolerant: anything that is not a well-formed
--    role contributes nothing, and a manifest with no `team` has no roles.
-- ---------------------------------------------------------------------------

create or replace function public._classroom_html_team_roles(p_manifest jsonb)
returns text[]
language sql
immutable
security definer
set search_path = ''
as $roles$
	select coalesce(array_agg(r.role->>'id' order by r.ord), '{}')
	from jsonb_array_elements(
		case when jsonb_typeof(p_manifest->'team'->'roles') = 'array'
			then p_manifest->'team'->'roles' else '[]'::jsonb end
	) with ordinality as r(role, ord)
	where jsonb_typeof(r.role) = 'object'
		and coalesce(r.role->>'id', '') ~ '^[A-Za-z0-9_-]{1,40}$';
$roles$;

revoke all on function public._classroom_html_team_roles(jsonb)
	from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. THE GATE, 0195's body with the three changes marked 0301.
-- ---------------------------------------------------------------------------

create or replace function public._classroom_check_html_manifest(p_manifest jsonb)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
	v_modules jsonb;
	v_header jsonb;
	v_mod jsonb;
	v_blocks jsonb;
	v_block jsonb;
	v_criteria jsonb;
	v_crit jsonb;
	v_levels jsonb;
	v_level jsonb;
	v_id text;
	v_field text;
	v_type text;
	v_name text;
	v_short text;
	v_module_ids text[] := '{}';
	v_block_ids text[] := '{}';
	v_fields text[] := '{}';
	v_crit_ids text[];
	v_declared integer;
	v_module_points integer := 0;
	v_crit_sum integer;
	v_top integer;
	v_prev integer;
	v_n integer;
	v_i integer;
	v_block_count integer := 0;
	v_roles text[];
begin
	if p_manifest is null or jsonb_typeof(p_manifest) <> 'object' then
		raise exception 'The manifest must be a JSON object.';
	end if;
	if p_manifest->'schemaVersion' is distinct from to_jsonb(3) then
		raise exception 'The manifest needs schemaVersion 3.';
	end if;
	if p_manifest->>'kind' is distinct from 'html-assignment' then
		raise exception 'The manifest needs kind "html-assignment".';
	end if;
	if coalesce(btrim(p_manifest->>'title'), '') = '' then
		raise exception 'The manifest needs a title.';
	end if;
	if coalesce(btrim(p_manifest->>'course'), '') = '' then
		raise exception 'The manifest needs a course.';
	end if;
	if jsonb_typeof(p_manifest->'points') is distinct from 'number'
		or (p_manifest->>'points')::numeric <> floor((p_manifest->>'points')::numeric)
		or (p_manifest->>'points')::numeric < 0
		or (p_manifest->>'points')::numeric > 10000 then
		raise exception 'The manifest needs a whole points value between 0 and 10000.';
	end if;

	-- 0301: THE TEAM KEY, read only when present. No stored manifest carries
	-- it, so checking its shape refuses nothing that is already in the table.
	if p_manifest->'team' is not null and jsonb_typeof(p_manifest->'team') <> 'null' then
		if jsonb_typeof(p_manifest->'team') <> 'object'
			or jsonb_typeof(p_manifest->'team'->'roles') is distinct from 'array'
			or jsonb_array_length(p_manifest->'team'->'roles') > 8 then
			raise exception 'The manifest team must be an object with a roles array of at most 8 roles.';
		end if;
		if exists (
			select 1 from jsonb_array_elements(p_manifest->'team'->'roles') r(role)
			where jsonb_typeof(r.role) <> 'object'
				or coalesce(r.role->>'id', '') !~ '^[A-Za-z0-9_-]{1,40}$'
				or coalesce(btrim(r.role->>'title'), '') = ''
		) then
			raise exception 'Every team role needs an id of letters, digits, - and _ (up to 40 characters) and a title.';
		end if;
		if (select count(*) from jsonb_array_elements(p_manifest->'team'->'roles'))
			<> (select count(distinct r.role->>'id') from jsonb_array_elements(p_manifest->'team'->'roles') r(role)) then
			raise exception 'Two team roles share one id.';
		end if;
	end if;
	v_roles := public._classroom_html_team_roles(p_manifest);

	v_modules := p_manifest->'modules';
	if v_modules is null or jsonb_typeof(v_modules) <> 'array' or jsonb_array_length(v_modules) = 0 then
		raise exception 'The manifest needs a non-empty modules array.';
	end if;
	if jsonb_array_length(v_modules) > 40 then
		raise exception 'At most 40 modules per document.';
	end if;

	-- --- the header -------------------------------------------------------
	--
	-- IDENTITY FIELDS: student name, team, date. No points, never in the rubric.
	-- They exist because ledger 0128's real port had to invent a 0-POINT MODULE
	-- to hold them, and a 0-point module renders in the grading console as
	-- something to score.
	--
	-- A HEADER BLOCK IS A BLOCK IN EVERY OTHER RESPECT. Its id lands in
	-- classroom_responses.block_id exactly as a module block's does, so it takes
	-- the same pattern and joins the same manifest-wide uniqueness -- a student's
	-- name is an answer, and a renamed id loses it just as silently.
	--
	-- IT IS WALKED FIRST so its ids and fields are claimed before any module's,
	-- which makes a collision report the header's block rather than depending on
	-- which was reached first.
	v_header := p_manifest->'header';
	if v_header is not null and jsonb_typeof(v_header) <> 'null' then
		if jsonb_typeof(v_header) <> 'array' then
			raise exception 'The manifest header must be an array of blocks when present.';
		end if;
		v_block_count := v_block_count + jsonb_array_length(v_header);
		for v_block in select * from jsonb_array_elements(v_header) loop
			v_id := v_block->>'id';
			if v_id is null or v_id !~ '^[A-Za-z0-9_-]{1,40}$' then
				raise exception 'Every header block needs an id of letters, digits, - and _ (up to 40 characters).';
			end if;
			if v_id = any (v_block_ids) then
				raise exception 'Duplicate block id "%". Block ids key every stored answer, so two blocks sharing one would write to the same row.', v_id;
			end if;
			v_block_ids := v_block_ids || v_id;

			v_field := btrim(coalesce(v_block->>'field', ''));
			if v_field = '' then
				raise exception 'Header block "%" needs a field naming the document''s data-field attribute.', v_id;
			end if;
			if v_field = any (v_fields) then
				raise exception 'Two blocks both claim the field "%". One input cannot answer two blocks.', v_field;
			end if;
			v_fields := v_fields || v_field;

			v_type := v_block->>'type';
			if v_type is null or v_type not in ('text', 'longText', 'checkbox', 'radio', 'image', 'table') then
				raise exception 'Header block "%" has an unknown type "%".', v_id, coalesce(v_type, '(none)');
			end if;
			-- Points are a MODULE's business. An identity field declaring points
			-- would be scored by nothing and appear in no sum, which is the
			-- 0-point module problem in a smaller costume.
			if v_block->'points' is not null and jsonb_typeof(v_block->'points') <> 'null' then
				raise exception 'Header block "%" declares points. Identity fields carry none and never reach the rubric; move it into a module if it is worth marks.', v_id;
			end if;
		end loop;
	end if;

	for v_mod in select * from jsonb_array_elements(v_modules) loop
		v_id := v_mod->>'id';
		-- 0086's authored-id pattern, and it is not this format's to choose:
		-- a block id below lands in classroom_responses.block_id.
		if v_id is null or v_id !~ '^[A-Za-z0-9_-]{1,40}$' then
			raise exception 'Every module needs an id of letters, digits, - and _ (up to 40 characters).';
		end if;
		if v_id = any (v_module_ids) then
			raise exception 'Duplicate module id "%".', v_id;
		end if;
		v_module_ids := v_module_ids || v_id;
		v_name := v_id;

		if coalesce(btrim(v_mod->>'title'), '') = '' then
			raise exception 'Module "%" needs a title.', v_name;
		end if;
		if jsonb_typeof(v_mod->'points') is distinct from 'number'
			or (v_mod->>'points')::numeric <> floor((v_mod->>'points')::numeric)
			or (v_mod->>'points')::numeric < 0
			or (v_mod->>'points')::numeric > 10000 then
			raise exception 'Module "%" needs a whole points value between 0 and 10000.', v_name;
		end if;
		v_declared := (v_mod->>'points')::integer;
		v_module_points := v_module_points + v_declared;

		-- `is distinct from` and NOT `<>`: an ABSENT key makes the comparison
		-- NULL rather than true, so the guard falls straight through and the
		-- check never fires. Three times in this codebase, and once it accepted
		-- a write for four months.
		-- 0301: "role" JOINS "team" AND "individual". A role module names the
		-- subsystem role that owns it, and the role must be one the manifest's
		-- own `team.roles` declares. Every stored manifest carries "team",
		-- "individual" or nothing here, and none carries "role" (it was refused),
		-- so the two new refusals below can only reach a document no deployed
		-- gate ever stored.
		if v_mod->'audience' is not null
			and jsonb_typeof(v_mod->'audience') <> 'null'
			and v_mod->>'audience' not in ('team', 'individual', 'role') then
			raise exception 'Module "%" audience must be "team", "individual" or "role" when present.', v_name;
		end if;
		if v_mod->>'audience' = 'role' then
			if jsonb_typeof(v_mod->'role') is distinct from 'string'
				or not ((v_mod->>'role') = any (v_roles)) then
				raise exception 'Module "%" is owned by a role, so it needs a role that the manifest''s team.roles declares.', v_name;
			end if;
		end if;

		-- --- blocks -------------------------------------------------------
		--
		-- The header above and every module here go through the SAME walk, held
		-- in the two arrays this function carries: a block id is unique across
		-- the whole manifest because it is a response row's key, and a field is
		-- unique for the same reason one input cannot answer two blocks.
		v_blocks := v_mod->'blocks';
		if v_blocks is null or jsonb_typeof(v_blocks) <> 'array' then
			raise exception 'Module "%" needs a blocks array.', v_name;
		end if;
		v_block_count := v_block_count + jsonb_array_length(v_blocks);
		for v_block in select * from jsonb_array_elements(v_blocks) loop
			v_id := v_block->>'id';
			if v_id is null or v_id !~ '^[A-Za-z0-9_-]{1,40}$' then
				raise exception 'Module "%": every block needs an id of letters, digits, - and _ (up to 40 characters).', v_name;
			end if;
			if v_id = any (v_block_ids) then
				raise exception 'Duplicate block id "%". Block ids key every stored answer, so two blocks sharing one would write to the same row.', v_id;
			end if;
			v_block_ids := v_block_ids || v_id;

			v_field := btrim(coalesce(v_block->>'field', ''));
			if v_field = '' then
				raise exception 'Block "%" needs a field naming the document''s data-field attribute.', v_id;
			end if;
			if v_field = any (v_fields) then
				raise exception 'Two blocks both claim the field "%". One input cannot answer two blocks.', v_field;
			end if;
			v_fields := v_fields || v_field;

			v_type := v_block->>'type';
			if v_type is null or v_type not in ('text', 'longText', 'checkbox', 'radio', 'image', 'table') then
				raise exception 'Block "%" has an unknown type "%".', v_id, coalesce(v_type, '(none)');
			end if;
			if v_block->'minSentences' is not null
				and jsonb_typeof(v_block->'minSentences') <> 'null'
				and (jsonb_typeof(v_block->'minSentences') <> 'number'
					or (v_block->>'minSentences')::numeric < 0
					or (v_block->>'minSentences')::numeric > 100
					or (v_block->>'minSentences')::numeric <> floor((v_block->>'minSentences')::numeric)) then
				raise exception 'Block "%" minSentences must be a whole number between 0 and 100.', v_id;
			end if;
		end loop;

		-- --- criteria -----------------------------------------------------
		v_criteria := v_mod->'criteria';
		if v_criteria is null or jsonb_typeof(v_criteria) <> 'array' or jsonb_array_length(v_criteria) = 0 then
			raise exception 'Module "%" needs a non-empty criteria array.', v_name;
		end if;
		v_crit_ids := '{}';
		v_crit_sum := 0;

		for v_crit in select * from jsonb_array_elements(v_criteria) loop
			v_id := v_crit->>'id';
			if v_id is null or v_id !~ '^[A-Za-z0-9_-]{1,40}$' then
				raise exception 'Module "%": every criterion needs an id of letters, digits, - and _ (up to 40 characters).', v_name;
			end if;
			-- WITHIN the module only. rubricFromSpec namespaces a criterion as
			-- `<moduleId>-<criterionId>`, so a cross-module repeat collides with
			-- nothing and refusing it would be refusing a legal document.
			if v_id = any (v_crit_ids) then
				raise exception 'Module "%" repeats the criterion id "%".', v_name, v_id;
			end if;
			v_crit_ids := v_crit_ids || v_id;

			if coalesce(btrim(v_crit->>'text'), '') = '' then
				raise exception 'Module "%" criterion "%" needs text.', v_name, v_id;
			end if;

			v_levels := v_crit->'levels';
			if v_levels is null or jsonb_typeof(v_levels) <> 'array' then
				raise exception 'Module "%" criterion "%" needs a levels array.', v_name, v_id;
			end if;
			v_n := jsonb_array_length(v_levels);
			if v_n < 3 or v_n > 4 then
				raise exception 'Module "%" criterion "%" has % level(s); a criterion carries 3 or 4. Two is a pass/fail check and belongs in a checkbox block.', v_name, v_id, v_n;
			end if;

			-- THE TOP LEVEL'S POINTS ARE THE CRITERION MAXIMUM, so they are read
			-- and validated BEFORE the loop -- three checks below need the
			-- number, and one of them has to fire before the descent rule.
			if jsonb_typeof(v_levels->0->'points') is distinct from 'number'
				or (v_levels->0->>'points')::numeric <> floor((v_levels->0->>'points')::numeric)
				or (v_levels->0->>'points')::numeric < 0
				or (v_levels->0->>'points')::numeric > 1000 then
				raise exception 'Module "%" criterion "%" level 1 needs a whole point value between 0 and 1000.', v_name, v_id;
			end if;
			v_top := (v_levels->0->>'points')::integer;

			-- A criterion worth less than the number of levels above its bottom
			-- cannot carry that many DISTINCT whole values, so a 1-point
			-- criterion cannot have three levels.
			--
			-- THIS RUNS BEFORE THE DESCENT RULE AND THAT ORDER IS THE WHOLE
			-- VALUE OF THE CHECK. Levels are whole numbers and the bottom is 0,
			-- so [1, 1, 0] is the only three-level shape a 1-point criterion can
			-- take -- which means the descent rule ALWAYS fires on it first and
			-- this message would be unreachable behind it. An author reading
			-- "level 3 must be worth less than the level above it" goes and
			-- rewrites levels that were never the problem; the problem is that
			-- the criterion has no room, and that is what this says.
			if v_top < v_n - 1 then
				raise exception 'Module "%" criterion "%" is worth % but carries % levels, which need % distinct values above zero. Give it at least % points, or merge it into another criterion.', v_name, v_id, v_top, v_n, v_n - 1, v_n - 1;
			end if;

			v_prev := null;
			v_i := 0;
			for v_level in select * from jsonb_array_elements(v_levels) loop
				v_i := v_i + 1;
				if jsonb_typeof(v_level->'points') is distinct from 'number'
					or (v_level->>'points')::numeric <> floor((v_level->>'points')::numeric)
					or (v_level->>'points')::numeric < 0
					or (v_level->>'points')::numeric > 1000 then
					raise exception 'Module "%" criterion "%" level % needs a whole point value between 0 and 1000.', v_name, v_id, v_i;
				end if;
				if coalesce(btrim(v_level->>'label'), '') = '' then
					raise exception 'Module "%" criterion "%" level % needs a label.', v_name, v_id, v_i;
				end if;
				if coalesce(btrim(v_level->>'descriptor'), '') = '' then
					raise exception 'Module "%" criterion "%" level % needs a descriptor.', v_name, v_id, v_i;
				end if;
				-- `short` IS REQUIRED, and it is required BECAUSE of the
				-- 2026-09-08 report: levelShort renders `short` ahead of the
				-- descriptor, so an instructor who edits descriptors on a level
				-- with no short sees nothing change. A manifest carries both,
				-- every level, or it is not stored.
				v_short := btrim(coalesce(v_level->>'short', ''));
				if v_short = '' then
					raise exception 'Module "%" criterion "%" level % needs a short form. The grading console renders it on the level button, ahead of the descriptor.', v_name, v_id, v_i;
				end if;
				if array_length(regexp_split_to_array(v_short, '\s+'), 1) > 6 then
					raise exception 'Module "%" criterion "%" level % short "%" is over the six-word maximum.', v_name, v_id, v_i, v_short;
				end if;
				if right(v_short, 1) in ('.', '!', '?') then
					raise exception 'Module "%" criterion "%" level % short "%" ends in punctuation.', v_name, v_id, v_i, v_short;
				end if;

				if v_prev is not null and (v_level->>'points')::integer >= v_prev then
					raise exception 'Module "%" criterion "%" level % must be worth less than the level above it.', v_name, v_id, v_i;
				end if;
				v_prev := (v_level->>'points')::integer;
			end loop;

			if v_prev <> 0 then
				raise exception 'Module "%" criterion "%": the bottom level must be worth 0.', v_name, v_id;
			end if;
			-- POINTS, WAY ONE OF THREE.
			if v_crit->'points' is not null
				and jsonb_typeof(v_crit->'points') <> 'null'
				and (v_crit->>'points')::numeric <> v_top then
				raise exception 'Module "%" criterion "%" declares % points but its top level is worth %.', v_name, v_id, v_crit->>'points', v_top;
			end if;
			if v_crit->'points' is null or jsonb_typeof(v_crit->'points') = 'null' then
				raise exception 'Module "%" criterion "%" needs a points value (it is the top level''s, %).', v_name, v_id, v_top;
			end if;

			v_crit_sum := v_crit_sum + v_top;
		end loop;

		-- POINTS, WAY TWO OF THREE.
		if v_crit_sum <> v_declared then
			raise exception 'Module "%" criteria sum to % but the module is worth % points.', v_name, v_crit_sum, v_declared;
		end if;
	end loop;

	if v_block_count > 400 then
		raise exception 'At most 400 blocks per document (this one has %).', v_block_count;
	end if;

	-- POINTS, WAY THREE OF THREE.
	if v_module_points <> (p_manifest->>'points')::integer then
		raise exception 'Modules sum to % points but the manifest declares %.', v_module_points, (p_manifest->>'points')::integer;
	end if;
end;
$$;
revoke all on function public._classroom_check_html_manifest(jsonb)
	from public, anon, authenticated;

do $report$
begin
	raise notice '0301: % stored HTML assignment manifests; none is re-checked by this file.',
		(select count(*) from public.classroom_html_assignments);
end
$report$;
