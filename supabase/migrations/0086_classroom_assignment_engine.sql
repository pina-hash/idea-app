-- 0086_classroom_assignment_engine.sql
-- Classroom bundle 4: the assignment engine -- file submissions, spec-driven
-- interactive assignments, response persistence, rubrics, and grading.
--
-- WHAT THIS ADDS, on top of 0085's canonical items. An assignment item can now
-- carry:
--
--   * A SPEC (classroom_assignment_specs): one JSON document per assignment in
--     the docs/IDEA_MATERIAL_SPEC_v1.md format -- modules, blocks (instructions,
--     textField, table, imageZone, checklist), per-module rubrics, an academic
--     integrity declaration, and an optional approval gate. The spec is
--     validated IN THIS FILE (_classroom_check_spec) before a row can exist:
--     the RPC is callable straight through PostgREST, so a TypeScript validator
--     alone would be advice, not enforcement. calc blocks are refused by name
--     for now -- rendering them is a later phase, and the print fallback covers
--     those materials until then.
--
--   * A RUBRIC (classroom_rubrics): ordered criteria, each with points and
--     optional leveled descriptors, stored as ONE jsonb document per item and
--     replaced whole (the tournament_set_reward_rules convention). Readable by
--     students through classroom_can_read_item -- a rubric is a promise about
--     grading, not a secret.
--
--   * SUBMISSIONS (classroom_submissions): one row per (item, student), states
--     draft -> submitted -> returned. "Not submitted" is the absence of a row
--     OR a draft row; the row is created lazily by the first file attach, the
--     first grade, or the submit itself. Grading fields (per-criterion scores,
--     total, private comment) live on this row; `returned` is what releases
--     them to the student.
--
--   * RESPONSES (classroom_responses): the student's typed answers, one row per
--     (item, student, block), autosaved through classroom_save_response.
--     DELIBERATELY independent of the submissions table so autosave never has
--     to create a submission row first.
--
--   * FILES (classroom_submission_files): student-attached evidence. A row with
--     a null block_id is a plain "hand this in" attachment; a row naming an
--     imageZone block is that zone's photo, with a caption. Bytes live in the
--     school shared drive (a submissions subfolder, uploaded by the route);
--     this table stores only the file id, and the ONLY way to the bytes is the
--     RLS-enforcing proxy route.
--
--   * MODULE APPROVALS (classroom_module_approvals): the approval gate's state.
--     A teacher approving module m2 is what unlocks the modules after it, and
--     the gate is enforced HERE -- classroom_save_response and
--     classroom_add_submission_file refuse gated blocks, and the submit
--     preflight lists an unapproved gate as unmet -- never only in the client.
--
-- WHO MAY DO WHAT. Students touch ONLY their own rows, and every student RPC
-- resolves the caller from current_user_email() with NO email parameter (the
-- classroom_mark_item_viewed doctrine: "own rows only" is a property of the
-- signature). Reviewing is classroom_can_review_submission: the caller manages
-- a section the item is posted to AND that the student is enrolled in -- so a
-- teacher sees exactly their own sections' students, and a co-posted section's
-- teacher never sees a student who is not in their class. Admins pass through
-- classroom_manages_section as everywhere else.
--
-- THE PREFLIGHT IS SERVER-AUTHORITATIVE. Completion criteria derive from block
-- constraints (minSentences, minRows, minImages, checklist items, the
-- declaration, the approval gate) exactly as the spec doc defines, computed by
-- _classroom_spec_unmet at submit time. The client shows the same list live,
-- but a submit that reaches the database incomplete is refused with the full
-- structured list regardless of what any client claimed.
--
-- ZERO CLIENT WRITE GRANTS on every new table, as everywhere in this module.
--
-- Apply manually in the Supabase SQL editor, after 0085.

-- ---------------------------------------------------------------------------
-- 1. Tables.
-- ---------------------------------------------------------------------------

create table if not exists public.classroom_assignment_specs (
	item_id uuid primary key references public.classroom_items (id) on delete cascade,
	spec jsonb not null,
	imported_by text not null,
	updated_at timestamptz not null default now()
);

create table if not exists public.classroom_rubrics (
	item_id uuid primary key references public.classroom_items (id) on delete cascade,
	-- [{id, criterion, points, levels?: [{label, points?, description?}]}, ...]
	criteria jsonb not null,
	updated_by text not null,
	updated_at timestamptz not null default now()
);

create table if not exists public.classroom_submissions (
	id uuid primary key default gen_random_uuid(),
	item_id uuid not null references public.classroom_items (id) on delete cascade,
	student_email text not null
		check (student_email = lower(btrim(student_email)) and student_email like '%@%'),
	-- draft = working (reads as "not submitted"), submitted = locked for
	-- grading, returned = graded and released (editable again for resubmission).
	state text not null default 'draft' check (state in ('draft', 'submitted', 'returned')),
	submitted_at timestamptz,
	returned_at timestamptz,
	-- Grading. rubric_scores is {criterionId: points}; score is the sum, stamped
	-- server-side at grade time so the CSV never re-derives it. The student sees
	-- these only in state 'returned' (the UI rule; the ROW is their own either
	-- way -- hiding a draft grade from its own subject is presentation, and the
	-- teacher's private comment field below is the one deliberate exception).
	rubric_scores jsonb,
	score numeric,
	teacher_comment text check (teacher_comment is null or char_length(teacher_comment) <= 4000),
	graded_by text,
	graded_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (item_id, student_email)
);

create index if not exists classroom_submissions_item_idx
	on public.classroom_submissions (item_id, student_email);

create table if not exists public.classroom_responses (
	item_id uuid not null references public.classroom_items (id) on delete cascade,
	student_email text not null
		check (student_email = lower(btrim(student_email)) and student_email like '%@%'),
	-- A spec block id, or the reserved '@declaration' (block ids are validated
	-- to [A-Za-z0-9_-], so the reserved id can never collide with an authored
	-- one).
	block_id text not null check (char_length(block_id) between 1 and 64),
	value jsonb not null,
	updated_at timestamptz not null default now(),
	primary key (item_id, student_email, block_id)
);

create index if not exists classroom_responses_item_idx
	on public.classroom_responses (item_id, student_email);

create table if not exists public.classroom_submission_files (
	id uuid primary key default gen_random_uuid(),
	submission_id uuid not null references public.classroom_submissions (id) on delete cascade,
	-- Null = a plain hand-in attachment; set = the imageZone block it belongs to.
	block_id text check (block_id is null or char_length(block_id) between 1 and 64),
	caption text check (caption is null or char_length(caption) <= 500),
	drive_file_id text not null,
	filename text not null,
	mime_type text not null,
	size_bytes bigint,
	sort_order integer not null default 1 check (sort_order >= 1),
	created_at timestamptz not null default now()
);

create index if not exists classroom_submission_files_submission_idx
	on public.classroom_submission_files (submission_id, sort_order);

create table if not exists public.classroom_module_approvals (
	item_id uuid not null references public.classroom_items (id) on delete cascade,
	student_email text not null
		check (student_email = lower(btrim(student_email)) and student_email like '%@%'),
	module_id text not null check (char_length(module_id) between 1 and 64),
	approved_by text not null,
	approved_at timestamptz not null default now(),
	primary key (item_id, student_email, module_id)
);

-- ---------------------------------------------------------------------------
-- 2. Visibility helpers.
-- ---------------------------------------------------------------------------

-- May the caller review THIS student's work on THIS item? True when the caller
-- manages a section the item is posted to AND the student is enrolled in --
-- which scopes a teacher to exactly their own sections' students. Enrollment
-- here is NOT filtered to active: a student deactivated mid-term still has
-- work their teacher must be able to read and grade.
create or replace function public.classroom_can_review_submission(
	p_item_id uuid,
	p_student_email text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1
		from public.classroom_postings pg
		join public.classroom_enrollments e on e.section_id = pg.section_id
		where pg.item_id = p_item_id
			and e.student_email = p_student_email
			and public.classroom_manages_section(pg.section_id)
	);
$$;

revoke all on function public.classroom_can_review_submission(uuid, text) from public;
grant execute on function public.classroom_can_review_submission(uuid, text) to authenticated;

-- The student-side eligibility question every engine write asks: is the caller
-- ACTIVELY enrolled in a section this PUBLISHED assignment is posted to?
-- (Enrollment + published implies classroom_can_read_item for a student; asking
-- it directly keeps a teacher -- who reads the item but is not enrolled -- out
-- of the student write paths, which is what "responses are strictly
-- own-student" means.)
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
	if not exists (
		select 1 from public.classroom_items i
		where i.id = p_item_id and i.kind = 'assignment' and i.published
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
-- 3. Privileges + RLS. SELECT only, as everywhere else in this module.
-- ---------------------------------------------------------------------------

revoke all on public.classroom_assignment_specs from anon, authenticated;
grant select on public.classroom_assignment_specs to authenticated;
alter table public.classroom_assignment_specs enable row level security;

-- The spec is the worksheet itself -- structure, prompts and rubric framing,
-- no answer key -- so it is as readable as the assignment it describes.
drop policy if exists "classroom specs follow their item" on public.classroom_assignment_specs;
create policy "classroom specs follow their item"
	on public.classroom_assignment_specs
	for select
	to authenticated
	using (public.classroom_can_read_item(item_id));

revoke all on public.classroom_rubrics from anon, authenticated;
grant select on public.classroom_rubrics to authenticated;
alter table public.classroom_rubrics enable row level security;

drop policy if exists "classroom rubrics follow their item" on public.classroom_rubrics;
create policy "classroom rubrics follow their item"
	on public.classroom_rubrics
	for select
	to authenticated
	using (public.classroom_can_read_item(item_id));

revoke all on public.classroom_submissions from anon, authenticated;
grant select on public.classroom_submissions to authenticated;
alter table public.classroom_submissions enable row level security;

drop policy if exists "classroom submissions own or reviewer" on public.classroom_submissions;
create policy "classroom submissions own or reviewer"
	on public.classroom_submissions
	for select
	to authenticated
	using (
		student_email = public.current_user_email()
		or public.classroom_can_review_submission(item_id, student_email)
	);

revoke all on public.classroom_responses from anon, authenticated;
grant select on public.classroom_responses to authenticated;
alter table public.classroom_responses enable row level security;

drop policy if exists "classroom responses own or reviewer" on public.classroom_responses;
create policy "classroom responses own or reviewer"
	on public.classroom_responses
	for select
	to authenticated
	using (
		student_email = public.current_user_email()
		or public.classroom_can_review_submission(item_id, student_email)
	);

revoke all on public.classroom_submission_files from anon, authenticated;
grant select on public.classroom_submission_files to authenticated;
alter table public.classroom_submission_files enable row level security;

-- Files delegate through their submission row, so file visibility can never
-- diverge from submission visibility.
drop policy if exists "classroom submission files follow their submission" on public.classroom_submission_files;
create policy "classroom submission files follow their submission"
	on public.classroom_submission_files
	for select
	to authenticated
	using (
		exists (
			select 1 from public.classroom_submissions s
			where s.id = submission_id
				and (
					s.student_email = public.current_user_email()
					or public.classroom_can_review_submission(s.item_id, s.student_email)
				)
		)
	);

revoke all on public.classroom_module_approvals from anon, authenticated;
grant select on public.classroom_module_approvals to authenticated;
alter table public.classroom_module_approvals enable row level security;

drop policy if exists "classroom approvals own or reviewer" on public.classroom_module_approvals;
create policy "classroom approvals own or reviewer"
	on public.classroom_module_approvals
	for select
	to authenticated
	using (
		student_email = public.current_user_email()
		or public.classroom_can_review_submission(item_id, student_email)
	);

-- ---------------------------------------------------------------------------
-- 4. Spec validation. The server-side boundary: a spec that fails any of these
-- checks never becomes a row, whatever client sent it.
-- ---------------------------------------------------------------------------

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

		-- Per-module rubric: required whenever the module carries points, and its
		-- criteria must sum to exactly the module's points -- the spec doc's own
		-- "verified before delivery" rule, enforced at the door.
		v_rubric := v_module->'rubric';
		if v_rubric is not null and jsonb_typeof(v_rubric) = 'array' and jsonb_array_length(v_rubric) > 0 then
			v_rubric_sum := 0;
			for v_m in 0 .. jsonb_array_length(v_rubric) - 1 loop
				v_crit := v_rubric->v_m;
				if jsonb_typeof(v_crit) <> 'object'
					or coalesce(btrim(v_crit->>'criterion'), '') = ''
					or jsonb_typeof(v_crit->'points') is distinct from 'number'
					or (v_crit->>'points')::numeric < 0 then
					raise exception 'Module "%" rubric row % needs a criterion and points >= 0.',
						v_module->>'id', v_m + 1;
				end if;
				v_rubric_sum := v_rubric_sum + (v_crit->>'points')::numeric;
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
-- 5. Spec + rubric writes (teacher side).
-- ---------------------------------------------------------------------------

-- Attach (or replace, or with null REMOVE) the spec on an assignment. The bar
-- is _classroom_manages_item, the same one editing the item carries: the spec
-- changes what every posted class's students are asked to do.
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

create or replace function public._classroom_check_rubric(p_criteria jsonb)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
	v_crit jsonb;
	v_levels jsonb;
	v_level jsonb;
	v_ids text[] := '{}';
	v_id text;
	v_n integer;
	v_k integer;
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
		if jsonb_typeof(v_crit->'points') is distinct from 'number'
			or (v_crit->>'points')::numeric < 0 or (v_crit->>'points')::numeric > 1000 then
			raise exception 'Rubric row % needs points between 0 and 1000.', v_n + 1;
		end if;
		v_levels := v_crit->'levels';
		if v_levels is not null and jsonb_typeof(v_levels) <> 'null' then
			if jsonb_typeof(v_levels) <> 'array' or jsonb_array_length(v_levels) > 6 then
				raise exception 'Rubric row % levels must be a list of at most 6.', v_n + 1;
			end if;
			for v_k in 0 .. jsonb_array_length(v_levels) - 1 loop
				v_level := v_levels->v_k;
				if jsonb_typeof(v_level) <> 'object'
					or coalesce(btrim(v_level->>'label'), '') = '' then
					raise exception 'Rubric row % level % needs a label.', v_n + 1, v_k + 1;
				end if;
				if v_level->'points' is not null and jsonb_typeof(v_level->'points') <> 'null'
					and (jsonb_typeof(v_level->'points') <> 'number'
						or (v_level->>'points')::numeric < 0) then
					raise exception 'Rubric row % level % points must be a number >= 0.', v_n + 1, v_k + 1;
				end if;
			end loop;
		end if;
	end loop;
end;
$$;

revoke all on function public._classroom_check_rubric(jsonb) from public;

-- Full-set replacement (the tournament_set_reward_rules convention); null
-- removes the rubric outright.
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

	perform public._classroom_check_rubric(p_criteria);

	insert into public.classroom_rubrics (item_id, criteria, updated_by, updated_at)
	values (p_item_id, p_criteria, public.current_user_email(), now())
	on conflict (item_id) do update
		set criteria = excluded.criteria, updated_by = excluded.updated_by, updated_at = now();

	return jsonb_build_object('ok', true, 'item_id', p_item_id);
end;
$$;

revoke all on function public.classroom_set_rubric(uuid, jsonb) from public;
grant execute on function public.classroom_set_rubric(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Preflight machinery.
-- ---------------------------------------------------------------------------

-- The ONE sentence-count rule, mirrored exactly by countSentences in
-- src/lib/classroom/assignment-spec.ts: split on runs of . ! ? and count the
-- pieces that contain a letter or digit. Change both together or the client's
-- live counter will disagree with the submit preflight.
create or replace function public._classroom_sentence_count(p_text text)
returns integer
language sql
immutable
security definer
set search_path = ''
as $$
	select count(*)::integer
	from regexp_split_to_table(coalesce(p_text, ''), '[.!?]+') s
	where s ~ '[A-Za-z0-9]';
$$;

revoke all on function public._classroom_sentence_count(text) from public;

-- Module ids AFTER the approval gate, in module order -- the set the gate
-- locks. Empty when the spec has no gate.
create or replace function public._classroom_gated_modules(p_spec jsonb)
returns text[]
language sql
immutable
security definer
set search_path = ''
as $$
	select case
		when p_spec->'approvalGate' is null or jsonb_typeof(p_spec->'approvalGate') = 'null'
			then '{}'::text[]
		else coalesce((
			select array_agg(m->>'id' order by ord)
			from jsonb_array_elements(p_spec->'modules') with ordinality as t(m, ord)
			where ord > (
				select g.ord
				from jsonb_array_elements(p_spec->'modules') with ordinality as g(m, ord)
				where g.m->>'id' = p_spec->'approvalGate'->>'afterModule'
			)
		), '{}'::text[])
	end;
$$;

revoke all on function public._classroom_gated_modules(jsonb) from public;

-- Everything still standing between this student and a valid submission, as a
-- jsonb array of {module_id, block_id, kind, need, have}. Derived ONLY from
-- block constraints + the declaration + the gate, exactly per the spec doc's
-- "derived behavior" contract. Empty array = ready to submit.
create or replace function public._classroom_spec_unmet(
	p_item_id uuid,
	p_student_email text,
	p_spec jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_unmet jsonb := '[]'::jsonb;
	v_module jsonb;
	v_block jsonb;
	v_value jsonb;
	v_type text;
	v_module_id text;
	v_block_id text;
	v_need numeric;
	v_have numeric;
	v_gate jsonb;
	v_gate_open boolean := true;
	v_gated text[] := '{}';
	v_n integer;
	v_m integer;
begin
	v_gate := p_spec->'approvalGate';
	if v_gate is not null and jsonb_typeof(v_gate) = 'object' then
		v_gate_open := exists (
			select 1 from public.classroom_module_approvals a
			where a.item_id = p_item_id
				and a.student_email = p_student_email
				and a.module_id = v_gate->>'afterModule'
		);
		if not v_gate_open then
			v_gated := public._classroom_gated_modules(p_spec);
			v_unmet := v_unmet || jsonb_build_object(
				'module_id', v_gate->>'afterModule',
				'block_id', null,
				'kind', 'approval',
				'need', 1,
				'have', 0
			);
		end if;
	end if;

	for v_n in 0 .. jsonb_array_length(p_spec->'modules') - 1 loop
		v_module := p_spec->'modules'->v_n;
		v_module_id := v_module->>'id';
		-- A closed gate's own entry stands in for everything behind it: the
		-- student cannot act on a locked module, so its constraints would only
		-- be noise in the list. They join the preflight the moment the gate
		-- opens (mirrored by specUnmet in assignment-spec.ts).
		if v_module_id = any (v_gated) then
			continue;
		end if;
		for v_m in 0 .. jsonb_array_length(v_module->'blocks') - 1 loop
			v_block := v_module->'blocks'->v_m;
			v_type := v_block->>'type';
			v_block_id := v_block->>'id';
			v_need := null;
			v_have := null;

			if v_type = 'textField' then
				v_need := coalesce((v_block->>'minSentences')::numeric, 0);
				if v_need > 0 then
					select public._classroom_sentence_count(r.value->>'text') into v_have
					from public.classroom_responses r
					where r.item_id = p_item_id and r.student_email = p_student_email
						and r.block_id = v_block_id;
					v_have := coalesce(v_have, 0);
				end if;
			elsif v_type = 'table' then
				v_need := coalesce((v_block->>'minRows')::numeric, 0);
				if v_need > 0 then
					select count(*) into v_have
					from public.classroom_responses r,
						jsonb_array_elements(coalesce(r.value->'rows', '[]'::jsonb)) as tr(r_row)
					where r.item_id = p_item_id and r.student_email = p_student_email
						and r.block_id = v_block_id
						and jsonb_typeof(tr.r_row) = 'object'
						and exists (
							select 1 from jsonb_each_text(tr.r_row) kv
							where btrim(coalesce(kv.value, '')) <> ''
						);
					v_have := coalesce(v_have, 0);
				end if;
			elsif v_type = 'imageZone' then
				-- An image zone exists to receive photos: absent minImages reads as
				-- "at least one", the same default the client shows.
				v_need := coalesce((v_block->>'minImages')::numeric, 1);
				if v_need > 0 then
					select count(*) into v_have
					from public.classroom_submission_files f
					join public.classroom_submissions s on s.id = f.submission_id
					where s.item_id = p_item_id and s.student_email = p_student_email
						and f.block_id = v_block_id;
					v_have := coalesce(v_have, 0);
				end if;
			elsif v_type = 'checklist' then
				v_need := jsonb_array_length(v_block->'items');
				select count(*) into v_have
				from public.classroom_responses r,
					jsonb_array_elements(coalesce(r.value->'checked', '[]'::jsonb)) c
				where r.item_id = p_item_id and r.student_email = p_student_email
					and r.block_id = v_block_id
					and c.value = 'true'::jsonb;
				v_have := coalesce(v_have, 0);
			end if;

			if v_need is not null and v_need > 0 and coalesce(v_have, 0) < v_need then
				v_unmet := v_unmet || jsonb_build_object(
					'module_id', v_module_id,
					'block_id', v_block_id,
					'kind', v_type,
					'need', v_need,
					'have', coalesce(v_have, 0)
				);
			end if;
		end loop;
	end loop;

	if (p_spec->'declarations'->>'academicIntegrity')::boolean is true then
		-- The declaration rides the checklist value shape ({checked: [true]},
		-- what the client's checkbox saves); a bare {checked: true} is accepted
		-- too so a hand-rolled caller cannot get stuck.
		if not exists (
			select 1 from public.classroom_responses r
			where r.item_id = p_item_id and r.student_email = p_student_email
				and r.block_id = '@declaration'
				and (
					r.value->'checked' = 'true'::jsonb
					or (jsonb_typeof(r.value->'checked') = 'array'
						and r.value->'checked'->0 = 'true'::jsonb)
				)
		) then
			v_unmet := v_unmet || jsonb_build_object(
				'module_id', null,
				'block_id', '@declaration',
				'kind', 'declaration',
				'need', 1,
				'have', 0
			);
		end if;
	end if;

	return v_unmet;
end;
$$;

revoke all on function public._classroom_spec_unmet(uuid, text, jsonb) from public;

-- ---------------------------------------------------------------------------
-- 7. Student writes: responses, files, submit, unsubmit.
-- ---------------------------------------------------------------------------

-- Autosave one block's response. NO email parameter -- the caller is the only
-- student it can write for. Structured refusals for the states the UI renders
-- (locked, gate pending); exceptions for genuine misuse (unknown block, not
-- enrolled).
create or replace function public.classroom_save_response(
	p_item_id uuid,
	p_block_id text,
	p_value jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_engine_student(p_item_id);
	v_spec jsonb;
	v_block jsonb;
	v_module_id text;
	v_type text;
	v_state text;
	v_gated text[];
begin
	select a.spec into v_spec
	from public.classroom_assignment_specs a where a.item_id = p_item_id;
	if v_spec is null then
		raise exception 'This assignment has no interactive spec.';
	end if;
	if p_value is null or pg_column_size(p_value) > 100000 then
		raise exception 'That response is too large.';
	end if;

	if p_block_id = '@declaration' then
		if (v_spec->'declarations'->>'academicIntegrity')::boolean is not true then
			raise exception 'This assignment has no declaration.';
		end if;
	else
		select b.blk, m.mod->>'id' into v_block, v_module_id
		from jsonb_array_elements(v_spec->'modules') as m(mod),
			jsonb_array_elements(m.mod->'blocks') as b(blk)
		where b.blk->>'id' = p_block_id
		limit 1;
		if v_block is null then
			raise exception 'Unknown block "%".', p_block_id;
		end if;
		v_type := v_block->>'type';
		if v_type not in ('textField', 'table', 'checklist') then
			raise exception 'Block "%" does not take a typed response.', p_block_id;
		end if;

		v_gated := public._classroom_gated_modules(v_spec);
		if v_module_id = any (v_gated) and not exists (
			select 1 from public.classroom_module_approvals a
			where a.item_id = p_item_id and a.student_email = v_email
				and a.module_id = v_spec->'approvalGate'->>'afterModule'
		) then
			return jsonb_build_object('ok', false, 'reason', 'approval_pending', 'module_id', v_module_id);
		end if;
	end if;

	select s.state into v_state
	from public.classroom_submissions s
	where s.item_id = p_item_id and s.student_email = v_email;
	if v_state = 'submitted' then
		return jsonb_build_object('ok', false, 'reason', 'locked');
	end if;

	insert into public.classroom_responses (item_id, student_email, block_id, value, updated_at)
	values (p_item_id, v_email, p_block_id, p_value, now())
	on conflict (item_id, student_email, block_id) do update
		set value = excluded.value, updated_at = now();

	return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.classroom_save_response(uuid, text, jsonb) from public;
grant execute on function public.classroom_save_response(uuid, text, jsonb) to authenticated;

-- Attach one uploaded file to the caller's own submission (creating the draft
-- row if this is their first interaction). A null p_block_id is a plain
-- hand-in attachment; naming a block requires it to be an imageZone.
create or replace function public.classroom_add_submission_file(
	p_item_id uuid,
	p_drive_file_id text,
	p_filename text,
	p_mime_type text,
	p_size_bytes bigint default null,
	p_block_id text default null,
	p_caption text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_engine_student(p_item_id);
	v_spec jsonb;
	v_block jsonb;
	v_module_id text;
	v_submission_id uuid;
	v_state text;
	v_next integer;
	v_id uuid;
	v_file text := btrim(coalesce(p_drive_file_id, ''));
begin
	if v_file = '' then
		raise exception 'A Drive file id is required.';
	end if;

	if p_block_id is not null then
		select a.spec into v_spec
		from public.classroom_assignment_specs a where a.item_id = p_item_id;
		if v_spec is null then
			raise exception 'This assignment has no interactive spec.';
		end if;
		select b.blk, m.mod->>'id' into v_block, v_module_id
		from jsonb_array_elements(v_spec->'modules') as m(mod),
			jsonb_array_elements(m.mod->'blocks') as b(blk)
		where b.blk->>'id' = p_block_id
		limit 1;
		if v_block is null or v_block->>'type' <> 'imageZone' then
			raise exception 'Block "%" is not an image zone.', coalesce(p_block_id, '(none)');
		end if;
		if v_module_id = any (public._classroom_gated_modules(v_spec)) and not exists (
			select 1 from public.classroom_module_approvals a
			where a.item_id = p_item_id and a.student_email = v_email
				and a.module_id = v_spec->'approvalGate'->>'afterModule'
		) then
			return jsonb_build_object('ok', false, 'reason', 'approval_pending', 'module_id', v_module_id);
		end if;
	end if;

	select s.id, s.state into v_submission_id, v_state
	from public.classroom_submissions s
	where s.item_id = p_item_id and s.student_email = v_email;
	if v_state = 'submitted' then
		return jsonb_build_object('ok', false, 'reason', 'locked');
	end if;
	if v_submission_id is null then
		insert into public.classroom_submissions (item_id, student_email)
		values (p_item_id, v_email)
		returning id into v_submission_id;
	end if;

	select coalesce(max(sort_order), 0) + 1 into v_next
	from public.classroom_submission_files where submission_id = v_submission_id;

	insert into public.classroom_submission_files
		(submission_id, block_id, caption, drive_file_id, filename, mime_type, size_bytes, sort_order)
	values (v_submission_id, p_block_id, nullif(left(btrim(coalesce(p_caption, '')), 500), ''),
		v_file, left(btrim(coalesce(p_filename, 'file')), 300),
		left(btrim(coalesce(p_mime_type, 'application/octet-stream')), 200),
		p_size_bytes, v_next)
	returning id into v_id;

	return jsonb_build_object('ok', true, 'file_id', v_id, 'submission_id', v_submission_id);
end;
$$;

revoke all on function public.classroom_add_submission_file(uuid, text, text, text, bigint, text, text) from public;
grant execute on function public.classroom_add_submission_file(uuid, text, text, text, bigint, text, text) to authenticated;

create or replace function public.classroom_set_submission_file_caption(
	p_id uuid,
	p_caption text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_state text;
begin
	if (select auth.uid()) is null or coalesce(v_email, '') = '' then
		raise exception 'You must be signed in.';
	end if;
	select s.state into v_state
	from public.classroom_submission_files f
	join public.classroom_submissions s on s.id = f.submission_id
	where f.id = p_id and s.student_email = v_email;
	if v_state is null then
		raise exception 'That file does not exist.';
	end if;
	if v_state = 'submitted' then
		return jsonb_build_object('ok', false, 'reason', 'locked');
	end if;

	update public.classroom_submission_files
	set caption = nullif(left(btrim(coalesce(p_caption, '')), 500), '')
	where id = p_id;
	return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.classroom_set_submission_file_caption(uuid, text) from public;
grant execute on function public.classroom_set_submission_file_caption(uuid, text) to authenticated;

-- Remove one of the caller's OWN files (a teacher never deletes student
-- evidence). Reports whether the Drive blob is now unreferenced so the route
-- can sweep it -- submission files are uploaded once per row, but the check
-- keeps the delete path shaped like every other attachment delete here.
create or replace function public.classroom_delete_submission_file(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_row public.classroom_submission_files%rowtype;
	v_state text;
	v_remaining integer;
begin
	if (select auth.uid()) is null or coalesce(v_email, '') = '' then
		raise exception 'You must be signed in.';
	end if;
	select f.* into v_row
	from public.classroom_submission_files f
	join public.classroom_submissions s on s.id = f.submission_id
	where f.id = p_id and s.student_email = v_email
	for update of f;
	if not found then
		raise exception 'That file does not exist.';
	end if;
	select s.state into v_state from public.classroom_submissions s where s.id = v_row.submission_id;
	if v_state = 'submitted' then
		return jsonb_build_object('ok', false, 'reason', 'locked');
	end if;

	delete from public.classroom_submission_files where id = p_id;

	select count(*) into v_remaining
	from public.classroom_submission_files where drive_file_id = v_row.drive_file_id;

	return jsonb_build_object(
		'ok', true,
		'drive_file_id', v_row.drive_file_id,
		'orphaned', v_remaining = 0
	);
end;
$$;

revoke all on function public.classroom_delete_submission_file(uuid) from public;
grant execute on function public.classroom_delete_submission_file(uuid) to authenticated;

-- Submit. THE PREFLIGHT RUNS HERE, against the stored responses and files --
-- an incomplete submission is refused with the full structured list whatever
-- the client showed. A no-spec assignment requires at least one attached file
-- (there is nothing else it could mean to submit one).
create or replace function public.classroom_submit_assignment(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_engine_student(p_item_id);
	v_spec jsonb;
	v_unmet jsonb;
	v_state text;
	v_files integer;
	v_now timestamptz := now();
begin
	select s.state into v_state
	from public.classroom_submissions s
	where s.item_id = p_item_id and s.student_email = v_email;
	if v_state = 'submitted' then
		return jsonb_build_object('ok', false, 'reason', 'already_submitted');
	end if;

	select a.spec into v_spec
	from public.classroom_assignment_specs a where a.item_id = p_item_id;

	if v_spec is not null then
		v_unmet := public._classroom_spec_unmet(p_item_id, v_email, v_spec);
		if jsonb_array_length(v_unmet) > 0 then
			return jsonb_build_object('ok', false, 'reason', 'incomplete', 'unmet', v_unmet);
		end if;
	else
		select count(*) into v_files
		from public.classroom_submission_files f
		join public.classroom_submissions s on s.id = f.submission_id
		where s.item_id = p_item_id and s.student_email = v_email;
		if coalesce(v_files, 0) = 0 then
			return jsonb_build_object('ok', false, 'reason', 'nothing_attached');
		end if;
	end if;

	insert into public.classroom_submissions (item_id, student_email, state, submitted_at, updated_at)
	values (p_item_id, v_email, 'submitted', v_now, v_now)
	on conflict (item_id, student_email) do update
		set state = 'submitted', submitted_at = v_now, updated_at = v_now;

	return jsonb_build_object('ok', true, 'state', 'submitted', 'submitted_at', v_now);
end;
$$;

revoke all on function public.classroom_submit_assignment(uuid) from public;
grant execute on function public.classroom_submit_assignment(uuid) to authenticated;

-- Unsubmit: back to draft, allowed only while submitted AND no grade has been
-- saved -- once a teacher has started grading, pulling the work out from under
-- them is not the student's call any more.
create or replace function public.classroom_unsubmit_assignment(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_engine_student(p_item_id);
	v_row public.classroom_submissions%rowtype;
begin
	select s.* into v_row
	from public.classroom_submissions s
	where s.item_id = p_item_id and s.student_email = v_email;
	if not found or v_row.state <> 'submitted' then
		return jsonb_build_object('ok', false, 'reason', 'not_submitted');
	end if;
	if v_row.graded_at is not null then
		return jsonb_build_object('ok', false, 'reason', 'graded');
	end if;

	update public.classroom_submissions
	set state = 'draft', updated_at = now()
	where id = v_row.id;

	return jsonb_build_object('ok', true, 'state', 'draft');
end;
$$;

revoke all on function public.classroom_unsubmit_assignment(uuid) from public;
grant execute on function public.classroom_unsubmit_assignment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Teacher writes: grading + the approval gate.
-- ---------------------------------------------------------------------------

-- Score a student's work against the item's rubric. Keyed by (item, student)
-- rather than submission id so paper-in-hand work with no submission row can
-- still be graded (the row is created as a draft). p_return releases the grade:
-- state 'returned', which is what lets the student see score, breakdown and
-- comment -- and requires EVERY criterion scored, so nobody is returned half a
-- rubric.
create or replace function public.classroom_grade_submission(
	p_item_id uuid,
	p_student_email text,
	p_scores jsonb,
	p_comment text default null,
	p_return boolean default false
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
	v_key text;
	v_known text[] := '{}';
	v_n integer;
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

	for v_n in 0 .. jsonb_array_length(v_criteria) - 1 loop
		v_crit := v_criteria->v_n;
		v_known := v_known || (v_crit->>'id');
		v_value := p_scores->(v_crit->>'id');
		if v_value is null or jsonb_typeof(v_value) = 'null' then
			v_missing := v_missing || (v_crit->>'id');
		else
			if jsonb_typeof(v_value) <> 'number' then
				raise exception 'The score for "%" must be a number.', v_crit->>'criterion';
			end if;
			if (p_scores->>(v_crit->>'id'))::numeric < 0
				or (p_scores->>(v_crit->>'id'))::numeric > (v_crit->>'points')::numeric then
				raise exception 'The score for "%" must be between 0 and %.',
					v_crit->>'criterion', v_crit->>'points';
			end if;
			v_score := v_score + (p_scores->>(v_crit->>'id'))::numeric;
		end if;
	end loop;

	for v_key in select jsonb_object_keys(p_scores) loop
		if v_key <> all (v_known) then
			raise exception 'Score key "%" is not a rubric criterion.', v_key;
		end if;
	end loop;

	if p_return and array_length(v_missing, 1) is not null then
		return jsonb_build_object(
			'ok', false,
			'reason', 'incomplete_scores',
			'missing', to_jsonb(v_missing)
		);
	end if;

	insert into public.classroom_submissions
		(item_id, student_email, rubric_scores, score, teacher_comment, graded_by, graded_at, updated_at)
	values (p_item_id, v_email, p_scores, v_score,
		nullif(btrim(coalesce(p_comment, '')), ''), public.current_user_email(), v_now, v_now)
	on conflict (item_id, student_email) do update
		set rubric_scores = excluded.rubric_scores,
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

revoke all on function public.classroom_grade_submission(uuid, text, jsonb, text, boolean) from public;
grant execute on function public.classroom_grade_submission(uuid, text, jsonb, text, boolean) to authenticated;

-- The approval gate's teacher half: approving the gate module is what unlocks
-- everything after it (see _classroom_gated_modules). p_approved false
-- withdraws an approval -- the revoke-not-delete convention does not apply to a
-- gate, which is a live state, not a record.
create or replace function public.classroom_approve_module(
	p_item_id uuid,
	p_student_email text,
	p_module_id text,
	p_approved boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_student_email, '')));
	v_spec jsonb;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'A student email is required.';
	end if;
	if not public.classroom_can_review_submission(p_item_id, v_email) then
		raise exception 'Only a teacher of record for this student''s class can approve modules.';
	end if;
	select a.spec into v_spec
	from public.classroom_assignment_specs a where a.item_id = p_item_id;
	if v_spec is null then
		raise exception 'This assignment has no interactive spec.';
	end if;
	if not exists (
		select 1 from jsonb_array_elements(v_spec->'modules') m
		where m->>'id' = p_module_id
	) then
		raise exception 'Unknown module "%".', coalesce(p_module_id, '(none)');
	end if;

	if coalesce(p_approved, false) then
		insert into public.classroom_module_approvals
			(item_id, student_email, module_id, approved_by, approved_at)
		values (p_item_id, v_email, p_module_id, public.current_user_email(), now())
		on conflict (item_id, student_email, module_id) do update
			set approved_by = excluded.approved_by, approved_at = now();
	else
		delete from public.classroom_module_approvals
		where item_id = p_item_id and student_email = v_email and module_id = p_module_id;
	end if;

	return jsonb_build_object('ok', true, 'approved', coalesce(p_approved, false));
end;
$$;

revoke all on function public.classroom_approve_module(uuid, text, text, boolean) from public;
grant execute on function public.classroom_approve_module(uuid, text, text, boolean) to authenticated;
