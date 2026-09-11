-- 0199_classroom_html_instructor_write_gate.sql
--
-- Apply manually in the Supabase SQL editor, after 0197.
--
-- ===========================================================================
-- DO NOT APPLY FROM THE SESSION CONTAINER THAT WROTE THIS
-- ===========================================================================
-- The agent proxy accepts a CONNECT to port 5432 and carries no bytes, so a
-- `psql` or `tools/apply-migration.mjs` run from a cloud session hangs and then
-- reports a connection that never existed. 0195 and 0197 say the same thing
-- about themselves for the same reason. Apply by hand, or from a machine that
-- reaches the database directly. The verification query at the foot of this
-- file is what to paste afterwards.
--
-- ===========================================================================
-- WHY THE NUMBER IS 0199 AND NOT 0200
-- ===========================================================================
--
-- 0200 is allocated to a standing, unapplied bundle. This file fills the hole
-- BELOW it deliberately, because `tools/apply-migration.mjs` takes only the
-- LOWEST unapplied file and a higher number here would sit behind a migration
-- that has not landed. Do not renumber it.
--
-- ===========================================================================
-- WHAT THIS FILE DOES, IN ONE SENTENCE
-- ===========================================================================
--
-- IT GIVES `classroom_save_instructor_response` THE ONE BRANCH 0197 GAVE THE
-- OTHER TWO WRITE FUNCTIONS, so an instructor can fill in a schema-3 ported
-- assignment against their own identity exactly as a student fills in theirs.
-- Nothing else moves: same function, same signature, same table, same row
-- shape, same read path, same answer-key machinery.
--
-- ===========================================================================
-- WHAT WAS MEASURED, AND WHY 0197 LEFT THIS ONE BEHIND
-- ===========================================================================
--
-- 0197 widened the two functions that write a STUDENT answer -- it names them
-- in its own header as "the only function in the schema that writes
-- classroom_responses" and its file-attachment twin -- and
-- `classroom_save_instructor_response` writes neither. It writes
-- `classroom_instructor_responses`, 0128's own table, so it was outside that
-- file's census and was not touched.
--
-- Measured through the REAL RPC against a real embedded Postgres with the real
-- chain applied, on a real schema-3 item, with a spec-backed item as the
-- POSITIVE CONTROL so the refusal could not be about the caller, the section or
-- the fixture:
--
--   1. It opens by selecting from `classroom_assignment_specs` and raising
--      'This assignment has no interactive spec.' when there is no row. A
--      ported item carries a MANIFEST in `classroom_html_assignments` and no
--      spec, so every instructor save raises before it has looked at anything.
--
--   2. It then resolves `p_block_id` INSIDE that spec's modules, so a
--      manifest's ids are unfindable even if a spec row existed.
--
--   3. It gates on `v_type not in ('textField', 'table', 'checklist')` against
--      a manifest's `text`, `longText`, `checkbox`, `radio`, `image` and
--      `table`. THE TWO VOCABULARIES OVERLAP ON ONE WORD, `table` -- which is
--      why "give the ported item a companion spec row" is not a repair here
--      either: five of the six types would still be refused.
--
-- THE COST OF LEAVING IT WAS THE WHOLE FEATURE. Nobody can open a ported
-- worksheet and confirm it saves before a class uses it, so the first person
-- to find a broken document is a student. A surface handing an instructor a
-- writable frame over this gate would have been a worksheet that takes typing
-- and saves nothing -- the one failure this feature's own rules name as worth
-- avoiding -- so the surface was correctly NOT built until this file exists.
--
-- ===========================================================================
-- THE SHAPES THIS FILE DELIBERATELY IS NOT
-- ===========================================================================
--
-- NOT A SECOND WRITE FUNCTION. `classroom_save_instructor_response` is the only
-- function in the schema that writes `classroom_instructor_responses`, exactly
-- as `classroom_save_response` is for the student table, and a private RPC for
-- "an instructor HTML answer" would be a second definition of what an
-- instructor answer IS. One write path, widened at the gate -- 0197's own
-- argument, and `IDEA_CLASSROOM_REBUILD_PLAN.md` decision 12 one step earlier.
--
-- NOT A COMPANION `classroom_assignment_specs` ROW GENERATED FROM THE MANIFEST.
-- 0197 refused it and the reasoning is unchanged: a converted item that keeps
-- an old spec row renders the SUPERSEDED one, so writing a shadow spec
-- manufactures that bug on purpose.
--
-- NOT AN INSTRUCTOR-SIDE FILE TABLE. There is still no counterpart to
-- `classroom_submission_files` for an instructor, which 0128 says of itself and
-- which this file does not change. What moves is only that a manifest `image`
-- block is now a block the gate KNOWS -- see the block-type note in section 3.
--
-- ===========================================================================
-- THE DISCRIMINATOR IS THE ITEM'S OWN COLUMN, AND IT IS 0197'S HELPER
-- ===========================================================================
--
-- `_classroom_html_manifest(uuid)` and `_classroom_html_block(jsonb, text)` are
-- 0197's, called here rather than reimplemented. That is the whole reason this
-- file is short: two spellings of "is this a ported document" is how a student
-- save and an instructor save end up disagreeing about which assignment they
-- are on, and 0197 already put that question in one place.
--
-- The precondition block below REFUSES if either is missing rather than
-- creating its own, so a database sitting short of 0197 cannot end up with an
-- instructor path that resolves manifests and a student path that does not.
--
-- AN ITEM CARRYING BOTH A MANIFEST AND A SPEC IS A LEGAL DATABASE STATE and is
-- the one case whose behaviour this file CHANGES rather than merely widens:
-- before, an instructor answer resolved against the spec; after, it resolves
-- against the manifest, which is the order every rendering surface already
-- takes and the order 0197 gave the student path. The report block counts
-- those items at apply time.
--
-- ===========================================================================
-- WHAT A SPEC-BACKED ASSIGNMENT SEES
-- ===========================================================================
--
-- NOTHING. Every statement on the spec path is 0128's own, in 0128's own order,
-- including the order of its refusals: an item with no spec raises 'This
-- assignment has no interactive spec.' BEFORE the oversized-value check and
-- before the declaration refusal, exactly as it does today, because
-- `_classroom_html_manifest` answers null for a non-schema-3 item without
-- reading anything else.
--
-- THE AUTHORIZATION STILL RUNS FIRST, AND IT RUNS IN THE DECLARE SECTION.
-- `_classroom_instructor_copy_author(p_item_id)` initialises `v_email` before
-- the body executes, so a caller who may not keep a working copy of this item
-- reads their own refusal ahead of every sentence below -- on both arms, and
-- unchanged from 0128. It is deliberately NOT moved into the body.
--
-- `tests/db/html-assignment-instructor-gate.test.ts` proves the spec path the
-- way CLAUDE.md's widening rule asks: it puts a corpus of calls to the DEPLOYED
-- function first, applies this file over the SAME database, and compares the
-- answers case for case, refusal text included, with ported calls as the
-- positive control that a no-op apply cannot pass.
--
-- ===========================================================================
-- WHAT IT LEAVES ALONE
-- ===========================================================================
--
--   * `classroom_instructor_responses` and `classroom_instructor_keys`, their
--     shape, their grants and their policies (0128).
--   * `classroom_designate_instructor_key` and
--     `classroom_undesignate_instructor_key`. They key on the presence of a
--     ROW, never on a block type, so a ported copy becomes designatable the
--     moment the save above lands one -- with no change of their own.
--   * `_classroom_instructor_copy_author` (0128) and
--     `classroom_instructor_key_email` (0128).
--   * `_classroom_html_manifest` and `_classroom_html_block` (0197), called and
--     not replaced.
--   * `classroom_save_response` and `classroom_add_submission_file` (0197).
--     THE SIX-TYPE VOCABULARY IS THEREFORE STATED IN TWO PLACES, this file and
--     0197, and that is a deliberate trade against replacing the live student
--     write function to share a predicate. The two are pinned EQUAL
--     behaviourally by `tests/db/html-assignment-instructor-gate.test.ts`,
--     which puts all six types plus a positive control to BOTH functions on one
--     database and fails if either admits a type the other refuses. A test that
--     runs on every suite run is a better pin than a comment, and a stronger
--     one than a predicate only one of the two callers would have used.
--   * Every reader of an instructor response row. There is no read-side change
--     in this file at all.
--
-- ===========================================================================
-- SIGNATURES, OVERLOADS AND DEPLOY ORDERING
-- ===========================================================================
--
-- `create or replace` at an UNCHANGED argument list. No parameter is added,
-- removed, retyped or re-defaulted, so the signature trap in CLAUDE.md does not
-- apply: a replace at an identical argument list cannot leave a second overload
-- behind, and `pg_proc` still holds exactly what it held. The self-check at the
-- foot reads that back rather than assuming it.
--
-- THERE IS THEREFORE NO DEPLOY ORDERING. No client names a new parameter and no
-- old arity stops existing, so this file and any deploy are independent events
-- and either may go first. Applied ahead of the client it is inert -- the
-- instructor surface is gated on an optional transport the page supplies only
-- when it has one to supply; applied behind it, the instructor answers that
-- were being refused start landing. Both directions are safe.

-- ---------------------------------------------------------------------------
-- 0. PRECONDITION. It refuses rather than half-applying: without 0197's two
--    helpers the replaced function below would reference a routine that does
--    not exist and fail at its first call rather than here, in front of the
--    instructor it exists for.
-- ---------------------------------------------------------------------------

do $pre$
begin
	if to_regclass('public.classroom_html_assignments') is null then
		raise exception '0199: classroom_html_assignments does not exist. Apply 0195 first.';
	end if;
	if to_regprocedure('public._classroom_html_manifest(uuid)') is null then
		raise exception '0199: _classroom_html_manifest(uuid) does not exist. Apply 0197 first -- this file calls it rather than writing a second copy of the engine discriminator.';
	end if;
	if to_regprocedure('public._classroom_html_block(jsonb, text)') is null then
		raise exception '0199: _classroom_html_block(jsonb, text) does not exist. Apply 0197 first.';
	end if;
	if to_regprocedure('public.classroom_save_instructor_response(uuid, text, jsonb)') is null then
		raise exception '0199: classroom_save_instructor_response(uuid, text, jsonb) does not exist. Apply 0128 first.';
	end if;
	if to_regprocedure('public._classroom_instructor_copy_author(uuid)') is null then
		raise exception '0199: _classroom_instructor_copy_author(uuid) does not exist. Apply 0128 first.';
	end if;
end
$pre$;

-- ---------------------------------------------------------------------------
-- 1. THE REPORT. Read-only: it selects and raises notices, and writes nothing.
--
--    Every figure here is something a working copy of this repository cannot
--    know. The second and third are the ones to actually read.
-- ---------------------------------------------------------------------------

do $report$
declare
	v_ported integer;
	v_both integer;
	v_instructor_answers integer;
	v_keys integer;
	v_spec_answers integer;
	v_row record;
begin
	select count(*) into v_ported
	from public.classroom_items where assignment_schema_version = 3;

	select count(*) into v_both
	from public.classroom_items i
	join public.classroom_html_assignments h on h.item_id = i.id
	join public.classroom_assignment_specs s on s.item_id = i.id
	where i.assignment_schema_version = 3;

	select count(*) into v_instructor_answers
	from public.classroom_instructor_responses r
	join public.classroom_items i on i.id = r.item_id
	where i.assignment_schema_version = 3;

	select count(*) into v_keys
	from public.classroom_instructor_keys k
	join public.classroom_items i on i.id = k.item_id
	where i.assignment_schema_version = 3;

	select count(*) into v_spec_answers
	from public.classroom_instructor_responses;

	raise notice '0199: % item(s) are stamped schema 3.', v_ported;

	raise notice '0199: % instructor response row(s) exist against schema-3 items, and % designated key(s). BOTH are expected to be 0 before this file: the gate refused every instructor write on a ported item, and a key cannot be designated without a row.',
		v_instructor_answers, v_keys;

	if v_instructor_answers > 0 then
		raise notice '0199: instructor rows against a ported item already exist, which the deployed gate could not have written. Something wrote classroom_instructor_responses other than classroom_save_instructor_response, or an item was converted to schema 3 AFTER its instructor copy was filled in. Those rows are keyed on the old block ids and will not render in the ported document.';
	end if;

	raise notice '0199: % schema-3 item(s) also carry an assignment spec row. Those are the only items whose instructor-write behaviour this file CHANGES rather than widens: an instructor answer resolved against the spec before and resolves against the manifest after, which is the order every rendering surface already takes and the order 0197 gave the student path. Expected 0 -- nothing in the app posts both.',
		v_both;

	for v_row in
		select i.id, i.title
		from public.classroom_items i
		join public.classroom_html_assignments h on h.item_id = i.id
		join public.classroom_assignment_specs s on s.item_id = i.id
		where i.assignment_schema_version = 3
		order by i.title
	loop
		raise notice '0199:   item % ("%") carries both a manifest and a spec.', v_row.id, v_row.title;
	end loop;

	raise notice '0199: % instructor response row(s) exist in total, across every assignment. That is the population the spec path below must keep answering for, unchanged.',
		v_spec_answers;
end
$report$;

-- ---------------------------------------------------------------------------
-- 2. THE INSTRUCTOR ANSWER WRITE.
--
--    0128's function, with one branch added, in 0197's shape. Everything a
--    spec-backed assignment touches is 0128's own text in 0128's own order.
--
--    THE MANIFEST ARM ACCEPTS ALL SIX BLOCK TYPES, which is 0197's decision and
--    its reasoning applies here word for word: the frame bridge accepts an
--    `idea:change` by FIELD -- it asks whether the manifest claims that
--    `[data-field]`, never what type the block is -- so every one of the six can
--    legitimately produce a change message, and a gate narrower than the
--    manifest's own vocabulary would refuse an answer the document is allowed to
--    send, with no surface anywhere able to say which types were safe to use.
--    An instructor working in the document sends exactly the messages a student
--    does; narrowing the gate here and not there would be the two paths
--    disagreeing about the same document.
--
--    THAT INCLUDES `image`, AND IT IS NOT A FILE PATH. There is still no
--    instructor counterpart to `classroom_submission_files`, so a PICTURE
--    cannot be attached to an instructor copy and nothing in this file makes
--    one possible. What an `image` block may now store is the ordinary typed
--    value the bridge sends for it, in the same column every other block uses.
--    The surface says in words that photographs are not captured in an
--    instructor copy, which is 0128's own sentence and is where that refusal
--    belongs -- a type gate cannot say it, it can only drop the answer.
--
--    THERE IS NO APPROVAL GATE ON EITHER ARM HERE and there never was: 0128
--    reads none, because a working copy has nobody to approve it. That is the
--    one respect in which this function was already simpler than
--    `classroom_save_response`, and this file does not change it.
--
--    `@declaration` IS REFUSED ON BOTH ARMS, IN 0128'S OWN WORDS AND IN 0128'S
--    OWN POSITION. 'An instructor copy carries no declaration.' is true whether
--    the assignment is a spec or a document -- a declaration is a student
--    attesting to their own conduct -- so the refusal is engine-independent and
--    stays exactly where it is rather than growing an arm it does not need.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_save_instructor_response(
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
	-- UNCHANGED, AND IT RUNS BEFORE THE BODY. The authorization refusal a
	-- caller who may not keep a working copy of this item reads is 0128's, in
	-- 0128's position, on both arms.
	v_email text := public._classroom_instructor_copy_author(p_item_id);
	v_manifest jsonb;
	v_spec jsonb;
	v_block jsonb;
	v_type text;
begin
	-- WHICH ENGINE, FIRST, AND IT READS NOTHING ELSE FOR A V1 ITEM. Null here
	-- means "not a ported document", so the three statements that follow are
	-- 0128's opening verbatim, in 0128's order -- including the fact that an
	-- item with no spec raises before the oversized-value check.
	v_manifest := public._classroom_html_manifest(p_item_id);

	if v_manifest is null then
		select a.spec into v_spec
		from public.classroom_assignment_specs a where a.item_id = p_item_id;
		if v_spec is null then
			raise exception 'This assignment has no interactive spec.';
		end if;
	end if;

	if p_value is null or pg_column_size(p_value) > 100000 then
		raise exception 'That response is too large.';
	end if;

	if p_block_id = '@declaration' then
		raise exception 'An instructor copy carries no declaration.';
	end if;

	if v_manifest is not null then
		v_block := public._classroom_html_block(v_manifest, p_block_id);
		if v_block is null then
			raise exception 'Unknown block "%".', p_block_id;
		end if;
		v_type := v_block->>'type';
		if v_type not in ('text', 'longText', 'checkbox', 'radio', 'image', 'table') then
			raise exception 'Block "%" does not take a typed response.', p_block_id;
		end if;
	else
		select b.blk into v_block
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
	end if;

	insert into public.classroom_instructor_responses
		(item_id, instructor_email, block_id, value, updated_at)
	values (p_item_id, v_email, p_block_id, p_value, now())
	on conflict (item_id, instructor_email, block_id) do update
		set value = excluded.value, updated_at = now();

	return jsonb_build_object('ok', true);
end;
$$;

-- THE ACL RESTATED RATHER THAN INHERITED, AND IT NAMES THE ROLES.
-- `create or replace` over an existing function preserves its ACL, so on a
-- database that already ran 0128 and 0137 this is the end state that is already
-- there. Naming the roles makes it independent of that, and covers the database
-- where this replace IS a create: a hosted Supabase project's default
-- privileges write a DIRECT `anon` grant into every new function's ACL at
-- creation time, which `revoke ... from public` alone does not remove -- 0128's
-- own line is the `from public` form, so this is the narrowing 0137 had to
-- sweep in, stated here where it cannot be missed. `service_role` is not named,
-- exactly as 0137 never touches it.
revoke all on function public.classroom_save_instructor_response(uuid, text, jsonb)
	from public, anon, authenticated;
grant execute on function public.classroom_save_instructor_response(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. THE SELF-CHECK. Read the catalog and the BEHAVIOUR back rather than trust
--    that the statements above ran. It raises, so a partial apply cannot look
--    like a clean one, and it writes nothing that survives: the fixture it
--    builds is rolled back explicitly.
-- ---------------------------------------------------------------------------

do $checks$
declare
	v_arities integer;
	v_anon boolean;
	v_authed boolean;
	v_src text;
	v_type text;
	v_manifest constant jsonb := jsonb_build_object(
		'schemaVersion', 3,
		'kind', 'html-assignment',
		'header', jsonb_build_array(
			jsonb_build_object('id', 'who', 'field', 'studentName', 'type', 'text')),
		'modules', jsonb_build_array(jsonb_build_object(
			'id', 'm1', 'title', 'One', 'points', 1,
			'blocks', jsonb_build_array(
				jsonb_build_object('id', 'b-long', 'field', 'f1', 'type', 'longText'),
				jsonb_build_object('id', 'b-check', 'field', 'f2', 'type', 'checkbox'),
				jsonb_build_object('id', 'b-radio', 'field', 'f3', 'type', 'radio'),
				jsonb_build_object('id', 'b-table', 'field', 'f4', 'type', 'table'),
				jsonb_build_object('id', 'b-image', 'field', 'f5', 'type', 'image')))));
begin
	-- ---- the catalog -----------------------------------------------------
	--
	-- EXACTLY ONE ROW, which is what says no overload was left behind by a
	-- replace that was supposed to be at an identical argument list.
	select count(*) into v_arities from pg_proc p
	where p.pronamespace = 'public'::regnamespace
		and p.proname = 'classroom_save_instructor_response';
	if v_arities <> 1 then
		raise exception '0199: pg_proc holds % row(s) for classroom_save_instructor_response, expected exactly 1.', v_arities;
	end if;

	-- IT ACTUALLY CALLS THE DISCRIMINATOR. A replace that silently did not take
	-- would leave a function that still reads the spec table and nothing else,
	-- and every check below it that uses a fixture would then be measuring the
	-- old body without saying so.
	select p.prosrc into v_src from pg_proc p
	where p.oid = to_regprocedure('public.classroom_save_instructor_response(uuid, text, jsonb)');
	if position('_classroom_html_manifest' in v_src) = 0 then
		raise exception '0199: classroom_save_instructor_response does not reference _classroom_html_manifest. The replace did not take.';
	end if;
	if position('_classroom_html_block' in v_src) = 0 then
		raise exception '0199: classroom_save_instructor_response does not reference _classroom_html_block. The replace did not take.';
	end if;

	-- 0197'S HELPERS ARE STILL 0197'S. This file calls them and must not have
	-- replaced either, which would be a second engine discriminator wearing the
	-- first one's name.
	if to_regprocedure('public._classroom_html_manifest(uuid)') is null
		or to_regprocedure('public._classroom_html_block(jsonb, text)') is null then
		raise exception '0199: one of 0197 helpers is missing after this apply.';
	end if;
	if has_function_privilege('anon', 'public._classroom_html_manifest(uuid)', 'execute')
		or has_function_privilege('authenticated', 'public._classroom_html_manifest(uuid)', 'execute')
		or has_function_privilege('anon', 'public._classroom_html_block(jsonb, text)', 'execute')
		or has_function_privilege('authenticated', 'public._classroom_html_block(jsonb, text)', 'execute') then
		raise exception '0199: a 0197 private helper became executable by anon or authenticated during this apply.';
	end if;

	-- ---- the vocabulary, against 0197's own copy -------------------------
	--
	-- THE SIX TYPES ARE STATED IN TWO FUNCTIONS AND THIS IS THE APPLY-TIME PIN
	-- BETWEEN THEM. Read off `prosrc` rather than argued: every type this file
	-- admits must appear in the deployed `classroom_save_response`, so a
	-- database where the student gate is narrower than this one refuses to take
	-- this file at all. The suite pins the same equality behaviourally, on every
	-- run, which is the durable half.
	select p.prosrc into v_src from pg_proc p
	where p.oid = to_regprocedure('public.classroom_save_response(uuid, text, jsonb)');
	if v_src is null then
		raise exception '0199: classroom_save_response(uuid, text, jsonb) is missing.';
	end if;
	foreach v_type in array array['text', 'longText', 'checkbox', 'radio', 'image', 'table']
	loop
		if position('''' || v_type || '''' in v_src) = 0 then
			raise exception '0199: the deployed classroom_save_response does not name the block type "%", which this file admits. The student gate and the instructor gate would accept different documents.', v_type;
		end if;
	end loop;

	-- ---- the behaviour, on a real row ------------------------------------
	--
	-- Built here, checked, and rolled back: the fixture writes to
	-- classroom_items and classroom_html_assignments, and a migration must not
	-- leave a test item in a live class list.
	--
	-- IT EXERCISES THE RESOLVER RATHER THAN THE WHOLE RPC, because the RPC's
	-- first statement is an authorization check against the SESSION, and a
	-- migration is applied by a role with no classroom session at all. What can
	-- be proved here is that the discriminator and the block lookup answer
	-- correctly for this item; what proves the RPC end to end is
	-- `tests/db/html-assignment-instructor-gate.test.ts`, which has real
	-- sessions to call it with.
	begin
		insert into public.classroom_items (id, kind, title, body, author_email)
		values ('00000000-0000-4000-8000-000000000199'::uuid, 'assignment',
			'0199 self-check', 'temporary', 'migration@0199.invalid');

		if public._classroom_html_manifest('00000000-0000-4000-8000-000000000199'::uuid) is not null then
			raise exception '0199: _classroom_html_manifest answered a manifest for an UNSTAMPED item. Every v1 instructor copy would take the manifest arm.';
		end if;

		update public.classroom_items set assignment_schema_version = 3
		where id = '00000000-0000-4000-8000-000000000199'::uuid;

		insert into public.classroom_html_assignments (item_id, document, manifest, filename, imported_by)
		values ('00000000-0000-4000-8000-000000000199'::uuid, '<!doctype html>', v_manifest,
			'selfcheck.html', 'migration@0199.invalid');

		if public._classroom_html_manifest('00000000-0000-4000-8000-000000000199'::uuid) is null then
			raise exception '0199: _classroom_html_manifest answered null for a stamped item carrying a document row.';
		end if;

		-- The header block resolves alongside the module blocks, which is what
		-- keeps an instructor from being refused on the identity field.
		if public._classroom_html_block(v_manifest, 'who') is null then
			raise exception '0199: the HEADER block "who" did not resolve.';
		end if;
		if public._classroom_html_block(v_manifest, 'b-image') is null then
			raise exception '0199: the module block "b-image" did not resolve.';
		end if;
		-- THE POSITIVE CONTROL: a name no block carries must answer null, or
		-- "it found something" is not evidence it found the right thing.
		if public._classroom_html_block(v_manifest, 'no-such-block') is not null then
			raise exception '0199: _classroom_html_block answered a block id no manifest carries.';
		end if;

		raise exception 'rollback the 0199 self-check fixture';
	exception
		when sqlstate 'P0001' then
			if position('rollback the 0199 self-check fixture' in sqlerrm) = 0 then
				raise;
			end if;
	end;

	if exists (select 1 from public.classroom_items
		where id = '00000000-0000-4000-8000-000000000199'::uuid) then
		raise exception '0199: the self-check fixture survived its rollback. Remove item 00000000-0000-4000-8000-000000000199 by hand.';
	end if;

	-- ---- the ACL ---------------------------------------------------------
	v_anon := has_function_privilege('anon',
		'public.classroom_save_instructor_response(uuid, text, jsonb)', 'execute');
	v_authed := has_function_privilege('authenticated',
		'public.classroom_save_instructor_response(uuid, text, jsonb)', 'execute');
	if v_anon then
		raise exception '0199: classroom_save_instructor_response is executable by anon.';
	end if;
	if not v_authed then
		raise exception '0199: classroom_save_instructor_response is NOT executable by authenticated. Every instructor save would fail.';
	end if;

	-- The two key functions are untouched by this file and must still be
	-- callable, or designating a copy breaks for a path this file never named.
	if not has_function_privilege('authenticated',
		'public.classroom_designate_instructor_key(uuid)', 'execute')
		or not has_function_privilege('authenticated',
		'public.classroom_undesignate_instructor_key(uuid)', 'execute') then
		raise exception '0199: an instructor answer-key function lost its grant to authenticated.';
	end if;

	raise notice '0199: the instructor write gate now resolves a schema-3 item against its stored manifest. classroom_save_instructor_response accepts text, longText, checkbox, radio, image and table on a ported item, and header blocks resolve alongside module blocks. A v1 spec assignment takes 0128 path unchanged, refusal for refusal.';
	raise notice '0199: the signature is unchanged, so there is no deploy ordering -- this file and any client deploy are independent events.';
	raise notice '0199: designating an answer key needed no change: classroom_designate_instructor_key keys on the presence of a row, never on a block type.';
end
$checks$;

-- ===========================================================================
-- VERIFICATION QUERY -- paste into the SQL editor after applying
-- ===========================================================================
--
-- select
--   (select count(*) from pg_proc
--      where pronamespace = 'public'::regnamespace
--        and proname = 'classroom_save_instructor_response')               as instructor_save_arities,
--   (select count(*) from pg_proc
--      where pronamespace = 'public'::regnamespace
--        and proname = 'classroom_save_instructor_response'
--        and prosrc like '%_classroom_html_manifest%')                     as save_reads_manifest,
--   (select count(*) from pg_proc
--      where pronamespace = 'public'::regnamespace
--        and proname = 'classroom_save_instructor_response'
--        and prosrc like '%_classroom_html_block%')                        as save_reads_block,
--   (select count(*) from pg_proc
--      where pronamespace = 'public'::regnamespace
--        and proname in ('_classroom_html_manifest', '_classroom_html_block'))
--                                                                          as helpers_present,
--   has_function_privilege('anon',
--     'public.classroom_save_instructor_response(uuid, text, jsonb)', 'execute')
--                                                                          as anon_can_save,
--   has_function_privilege('authenticated',
--     'public.classroom_save_instructor_response(uuid, text, jsonb)', 'execute')
--                                                                          as authed_can_save,
--   has_function_privilege('anon',
--     'public._classroom_html_manifest(uuid)', 'execute')                  as anon_can_resolve,
--   has_function_privilege('authenticated',
--     'public.classroom_designate_instructor_key(uuid)', 'execute')        as authed_can_designate,
--   (select count(*) from public.classroom_items i
--      join public.classroom_html_assignments h on h.item_id = i.id
--      join public.classroom_assignment_specs s on s.item_id = i.id
--      where i.assignment_schema_version = 3)                               as items_carrying_both,
--   (select count(*) from public.classroom_instructor_responses r
--      join public.classroom_items i on i.id = r.item_id
--      where i.assignment_schema_version = 3)                               as ported_instructor_answers,
--   (select count(*) from public.classroom_instructor_keys k
--      join public.classroom_items i on i.id = k.item_id
--      where i.assignment_schema_version = 3)                               as ported_instructor_keys,
--   (select count(*) from public.classroom_items
--      where id = '00000000-0000-4000-8000-000000000199')                   as selfcheck_leftover;
--
-- EXPECT, immediately after applying: instructor_save_arities 1,
-- save_reads_manifest 1, save_reads_block 1, helpers_present 2,
-- anon_can_save false, authed_can_save true, anon_can_resolve false,
-- authed_can_designate true, items_carrying_both 0,
-- ported_instructor_answers 0, ported_instructor_keys 0,
-- selfcheck_leftover 0.
--
-- `ported_instructor_answers` IS THE ONE WORTH RE-RUNNING LATER, and it is the
-- figure that says this file did its job: it can only be 0 before the apply,
-- because the gate refused every one, and it should climb the first time an
-- instructor types into a ported worksheet on the item page. A number that
-- stays at 0 after one has means the answers are still not landing and the
-- client half is where to look next. `ported_instructor_keys` follows it, one
-- designation later.
--
-- `items_carrying_both` is the one that could drift: an item acquiring a spec
-- beside its manifest is an item whose instructor answers now resolve against
-- the manifest rather than the spec.
