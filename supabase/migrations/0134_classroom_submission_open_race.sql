-- ---------------------------------------------------------------------------
-- 0134 -- TWO OF A STUDENT'S FILES ARRIVING AT ONCE MUST NOT LOSE ONE.
--
-- FOUND IN A BROWSER, NOT BY READING, AND IT IS 0133'S DOING. Before 0133 the
-- student side uploaded one file at a time -- a `for` loop that awaited each
-- multipart POST -- so the lazy "create the submission row if it is missing"
-- step in `classroom_add_submission_file` could never race itself. 0133 made
-- the uploads CONCURRENT, which is the whole point of it, and the race that had
-- been latent since 0086 fired on the first real attempt:
--
--   nine files picked at once -> nine concurrent calls -> several read the
--   caller's submission row as missing -> several insert it -> the losers get
--   SQLSTATE 23505 on classroom_submissions_item_id_student_email_key.
--
-- Measured on a real Supabase project with the real UI: 7 of 9 files landed,
-- and 2 came back with a raw `duplicate key value violates unique constraint`
-- on screen. The unique constraint did its job perfectly; what was wrong was
-- asking it to arbitrate at all.
--
-- THE FIX IS `ON CONFLICT DO NOTHING` PLUS A RE-READ, in both functions that
-- create a submission lazily. `do nothing` means the loser's INSERT returns no
-- row, which leaves the plpgsql target NULL -- so the re-read is not optional
-- tidiness, it is the branch that actually finds the winner's row. And the
-- LOCK STATE IS RE-CHECKED AFTER the re-read: between the first select and the
-- insert the winner may have been a `classroom_submit_assignment`, in which
-- case the correct answer is the ordinary `locked` refusal rather than writing
-- a file onto a submitted assignment.
--
-- A COUNT-THEN-INSERT WAS NOT THE ALTERNATIVE HERE. There is no parent row to
-- `select ... for update` before the first caller holds one, which is exactly
-- the situation the capacity-check rule in CLAUDE.md describes -- so the unique
-- index IS the serialization point and the only question is who apologises for
-- it. `on conflict do nothing` makes that the database rather than the student.
--
-- NOTHING ELSE MOVES. Both functions keep their signatures, their parameter
-- lists, their grants and every other check in them; only the four lines that
-- create the row change. `classroom_open_submission` is 0133's, and
-- `classroom_add_submission_file` is re-signed at 0133's arity -- diffed
-- against that file rather than reconstructed, so the imageZone gate, the
-- approval gate, the storage-key ownership check and the caption handling are
-- byte-for-byte what 0133 applied.
--
-- WHAT UNDOES THIS MIGRATION: re-apply 0133's definitions of the two functions
-- verbatim. It reverts to losing a file under concurrency, so there is no
-- reason to.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_open_submission(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_engine_student(p_item_id);
	v_submission_id uuid;
	v_state text;
begin
	select s.id, s.state into v_submission_id, v_state
	from public.classroom_submissions s
	where s.item_id = p_item_id and s.student_email = v_email;

	if v_state = 'submitted' then
		return jsonb_build_object('ok', false, 'reason', 'locked');
	end if;

	if v_submission_id is null then
		-- THE RACE. Several concurrent uploads can all reach here having read
		-- nothing; the unique index lets exactly one insert win and the rest are
		-- told to do nothing, which leaves v_submission_id NULL rather than
		-- raising.
		insert into public.classroom_submissions (item_id, student_email)
		values (p_item_id, v_email)
		on conflict (item_id, student_email) do nothing
		returning id into v_submission_id;

		if v_submission_id is null then
			-- We lost. Read the winner's row, and re-ask the question that could
			-- have changed while we were not looking.
			select s.id, s.state into v_submission_id, v_state
			from public.classroom_submissions s
			where s.item_id = p_item_id and s.student_email = v_email;

			if v_state = 'submitted' then
				return jsonb_build_object('ok', false, 'reason', 'locked');
			end if;
			if v_submission_id is null then
				-- Neither inserted nor found: something outside this function
				-- removed the row between the two statements. Raise rather than
				-- return a null id a caller would build a storage key out of.
				raise exception 'Could not open a submission for this assignment.';
			end if;
		end if;
	end if;

	return jsonb_build_object('ok', true, 'submission_id', v_submission_id);
end;
$$;

revoke all on function public.classroom_open_submission(uuid) from public;
grant execute on function public.classroom_open_submission(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The same four lines inside the write RPC. Re-signed at 0133's arity, with
-- every other check diffed against that file rather than remembered.
--
-- NO DEFAULTS, FOR 0133'S REASON, NOT AS A STYLE CHOICE. 0133 leaves both the
-- deployed 7-argument form and this widened 8-argument one in place, and what
-- keeps that pair resolvable is that the wide one requires every argument. A
-- `default null` restored on any parameter here would re-create exactly the
-- ambiguous pair 0133 went to trouble to avoid, from a file that reads like it
-- only touches a race. The 7-argument wrapper 0133 created is NOT re-created
-- here and does not need to be: it delegates, so it picks up this body.
--
-- The drop names the 8-argument form only, so this file re-pastes over a
-- machine that took 0133's earlier draft (Postgres refuses to remove a
-- parameter default through `create or replace`).
-- ---------------------------------------------------------------------------

drop function if exists public.classroom_add_submission_file(uuid, text, text, text, bigint, text, text, text);

create or replace function public.classroom_add_submission_file(
	p_item_id uuid,
	p_drive_file_id text,
	p_filename text,
	p_mime_type text,
	p_size_bytes bigint,
	p_block_id text,
	p_caption text,
	p_storage_key text
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
	v_file text := nullif(btrim(coalesce(p_drive_file_id, '')), '');
	v_key text := nullif(btrim(coalesce(p_storage_key, '')), '');
begin
	if (v_file is null) = (v_key is null) then
		raise exception 'Attach exactly one of a Drive file id or a storage key.';
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
		-- See classroom_open_submission above for why this is a conflict-tolerant
		-- insert with a re-read rather than a plain one.
		insert into public.classroom_submissions (item_id, student_email)
		values (p_item_id, v_email)
		on conflict (item_id, student_email) do nothing
		returning id into v_submission_id;

		if v_submission_id is null then
			select s.id, s.state into v_submission_id, v_state
			from public.classroom_submissions s
			where s.item_id = p_item_id and s.student_email = v_email;

			if v_state = 'submitted' then
				return jsonb_build_object('ok', false, 'reason', 'locked');
			end if;
			if v_submission_id is null then
				raise exception 'Could not open a submission for this assignment.';
			end if;
		end if;
	end if;

	-- THE KEY MUST NAME THIS SUBMISSION, for the same reason the attachment key
	-- must name its item: the storage policy answered a question about the
	-- OBJECT, and this is the ROW. A student holding a key minted against their
	-- own earlier submission must not be able to hang it off a different one.
	if v_key is not null and public._classroom_storage_prefix_uuid(v_key) is distinct from v_submission_id then
		raise exception 'That storage key does not belong to this submission.';
	end if;

	select coalesce(max(sort_order), 0) + 1 into v_next
	from public.classroom_submission_files where submission_id = v_submission_id;

	insert into public.classroom_submission_files
		(submission_id, block_id, caption, drive_file_id, storage_key, filename, mime_type, size_bytes, sort_order)
	values (v_submission_id, p_block_id, nullif(left(btrim(coalesce(p_caption, '')), 500), ''),
		v_file, v_key, left(btrim(coalesce(p_filename, 'file')), 300),
		left(btrim(coalesce(p_mime_type, 'application/octet-stream')), 200),
		p_size_bytes, v_next)
	returning id into v_id;

	return jsonb_build_object(
		'ok', true,
		'file_id', v_id,
		'submission_id', v_submission_id,
		'storage_key', v_key
	);
end;
$$;

revoke all on function public.classroom_add_submission_file(uuid, text, text, text, bigint, text, text, text) from public;
grant execute on function public.classroom_add_submission_file(uuid, text, text, text, bigint, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Report, and refuse if the arity this depends on is not the one that is here.
-- ---------------------------------------------------------------------------

do $$
declare
	v_overloads integer;
	v_defaulted integer;
	v_dupes integer;
begin
	-- 0133 leaves TWO arities: the deployed 7-argument form and the widened
	-- 8-argument one. Both must still be here, and the widened one must still
	-- carry no defaults -- this file re-created it, so this file is where that
	-- could have been undone.
	select count(*) into v_overloads from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_add_submission_file';
	if v_overloads <> 2 then
		raise exception '0134: classroom_add_submission_file has % overload(s), expected 2. Apply 0133 first.', v_overloads;
	end if;

	select count(*) into v_defaulted from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_add_submission_file'
		and p.pronargs = 8 and p.pronargdefaults > 0;
	if v_defaulted <> 0 then
		raise exception '0134: the 8-argument classroom_add_submission_file declares defaults; that is the ambiguous pair 0133 avoids.';
	end if;
	raise notice '0134: classroom_add_submission_file has 2 arities; the widened one declares no defaults.';

	-- The constraint this race collided with must still be there: it is what
	-- makes `on conflict (item_id, student_email)` legal at all.
	if not exists (
		select 1 from pg_constraint
		where conname = 'classroom_submissions_item_id_student_email_key'
			and conrelid = 'public.classroom_submissions'::regclass
	) then
		raise exception '0134: classroom_submissions_item_id_student_email_key is missing; the ON CONFLICT target does not exist.';
	end if;

	select count(*) into v_dupes from (
		select item_id, student_email from public.classroom_submissions
		group by item_id, student_email having count(*) > 1
	) d;
	raise notice '0134: submission open is now conflict-tolerant. % duplicate (item, student) pair(s) exist (expected 0).', v_dupes;
end;
$$;
