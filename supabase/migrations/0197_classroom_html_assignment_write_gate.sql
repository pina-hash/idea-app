-- 0197_classroom_html_assignment_write_gate.sql
--
-- Apply manually in the Supabase SQL editor, after 0195.
--
-- ===========================================================================
-- DO NOT APPLY FROM THE SESSION CONTAINER THAT WROTE THIS
-- ===========================================================================
-- The agent proxy accepts a CONNECT to port 5432 and carries no bytes, so a
-- `psql` or `tools/apply-migration.mjs` run from a cloud session hangs and then
-- reports a connection that never existed. 0195 says the same thing about
-- itself for the same reason. Apply by hand, or from a machine that reaches the
-- database directly. The verification query at the foot of this file is what to
-- paste afterwards.
--
-- ===========================================================================
-- WHAT THIS FILE DOES, IN ONE SENTENCE
-- ===========================================================================
--
-- IT WIDENS THE ONE WRITE GATE SO A SCHEMA-3 PORTED ASSIGNMENT CAN RESOLVE A
-- BLOCK AGAINST ITS STORED MANIFEST, exactly as a v1 assignment resolves one
-- against its stored spec. Nothing else moves: same two functions, same
-- signatures, same table, same row shape, same read path, same grading.
--
-- ===========================================================================
-- WHAT WAS MEASURED, AND THE PREMISE IT CORRECTS
-- ===========================================================================
--
-- 0195's own header says an answer to a ported document is an ordinary
-- `classroom_responses` row and that nothing about one moves. That is TRUE of
-- the table, of the read path, of grading, of extra credit, of the Grades tab
-- and of the FACTS export -- every one of them keys on
-- `(item_id, student_email, block_id)` and cannot tell the two engines apart.
--
-- IT IS NOT TRUE OF THE WRITE FUNCTION, and nothing widened that. Measured
-- against a real embedded Postgres with the real chain applied, and read back
-- off `pg_proc` rather than off anybody's memory of 0086:
--
--   1. `classroom_save_response` opens by selecting from
--      `classroom_assignment_specs` and raising 'This assignment has no
--      interactive spec.' when there is no row. A ported item carries a
--      MANIFEST in `classroom_html_assignments` and no spec, so every save
--      raises before it has looked at anything.
--
--   2. It then resolves `p_block_id` INSIDE that spec's modules, so a
--      manifest's ids are unfindable even if a spec row existed.
--
--   3. It gates on `v_type not in ('textField', 'table', 'checklist')`.
--      A manifest's block types are `text`, `longText`, `checkbox`, `radio`,
--      `image` and `table`. THE TWO VOCABULARIES OVERLAP ON ONE WORD, `table`
--      -- which is why "give the ported item a companion spec row as well" is
--      not a repair either: five of the six types would still be refused.
--
--   4. `classroom_add_submission_file` carries the IDENTICAL spec lookup and
--      the identical raise on its `p_block_id` path, and then requires
--      `imageZone`, which is not a manifest type at all. So a block-bound
--      photograph cannot land either.
--
--   5. It is the only function in the schema that writes `classroom_responses`.
--      There is no second path and this file does not add one.
--
-- ===========================================================================
-- THE TWO SHAPES THIS FILE DELIBERATELY IS NOT
-- ===========================================================================
--
-- NOT A SECOND WRITE FUNCTION. `IDEA_CLASSROOM_REBUILD_PLAN.md` decision 12
-- refused a second SCORING path beside `classroom_grade_submission` and the
-- FACTS export that reads it, on the grounds that one authored thing must not
-- acquire two ways of being recorded. The same reasoning holds one step
-- earlier: a private RPC for "an HTML answer" would be a second definition of
-- what an answer IS, and every reader downstream -- grading, the Grades tab,
-- the CSV, the export -- would then be reading rows two functions disagree
-- about. One write path, widened at the gate.
--
-- NOT A COMPANION `classroom_assignment_specs` ROW GENERATED FROM THE MANIFEST.
-- It looks like the cheap fix and it is worse. A converted item that keeps an
-- old spec row renders the SUPERSEDED one -- which is exactly why
-- `htmlAssignmentMount` puts the frame arm ahead of every spec arm -- so
-- deliberately writing a shadow spec manufactures that bug on purpose, in a
-- table two other RPCs already write, for an item that has no spec.
--
-- ===========================================================================
-- THE DISCRIMINATOR IS THE ITEM'S OWN COLUMN, NOT THE PRESENCE OF A ROW
-- ===========================================================================
--
-- `classroom_items.assignment_schema_version = 3` is what decides which arm a
-- write takes, because it is what decides which SURFACE a reader gets:
-- `htmlAssignmentMount` in `src/lib/classroom/html-assignment/mount.ts` reads
-- that column and nothing else. Two spellings of "is this a ported document"
-- is how a student gets a worksheet and the write path disagrees with it.
--
-- 0195 writes that column ONLY inside `classroom_set_html_assignment`, in the
-- same statement as the document row, which is why its verification query
-- pins `version_row_disagreements` at 0.
--
-- AN ITEM CARRYING BOTH A MANIFEST AND A SPEC IS A LEGAL DATABASE STATE and is
-- the one case whose behaviour this file CHANGES rather than merely widens:
-- before, its answers resolved against the spec; after, they resolve against
-- the manifest, which is the same order every rendering surface already takes.
-- The report block below COUNTS those items at apply time so whoever runs this
-- can see whether production holds any. It is expected to be zero: nothing in
-- the app posts both.
--
-- ===========================================================================
-- WHAT A SPEC-BACKED ASSIGNMENT SEES
-- ===========================================================================
--
-- NOTHING. That is the property this file is most careful about, because the
-- table behind it is a live gradebook with real student work in it. Every
-- statement on the spec path is 0086's own, in 0086's own order, including the
-- order of its two earliest refusals: an item with no spec raises 'This
-- assignment has no interactive spec.' BEFORE the oversized-value check, exactly
-- as it does today, because `_classroom_html_manifest` answers null for a
-- non-schema-3 item without reading anything else.
--
-- `tests/db/html-assignment-spec-path-unchanged.test.ts` proves it the way
-- CLAUDE.md's own widening rule asks: it puts a corpus of calls to the DEPLOYED
-- function first, applies this file over the SAME database, and compares the
-- answers case for case -- refusal text included.
--
-- ===========================================================================
-- WHAT IT LEAVES ALONE
-- ===========================================================================
--
--   * `classroom_responses`, its shape, its grants and its policies.
--   * `classroom_html_assignments` and `_classroom_check_html_manifest` (0195).
--   * `classroom_assignment_specs` and `classroom_set_assignment_spec` (0086).
--   * `_classroom_engine_student` (0109) and `_classroom_gated_modules` (0086).
--   * The SEVEN-ARGUMENT `classroom_add_submission_file`, which 0133 keeps
--     alive as a thin wrapper over the eight-argument form. It delegates, so
--     replacing the wide form repairs both, and touching the narrow one would
--     only risk moving the position of its own Drive-id refusal.
--   * Every reader of a response row. There is no read-side change in this file
--     at all.
--
-- ===========================================================================
-- SIGNATURES, OVERLOADS AND DEPLOY ORDERING
-- ===========================================================================
--
-- `create or replace` at UNCHANGED argument lists, for both functions. No
-- parameter is added, removed, retyped or re-defaulted, so the signature trap
-- in CLAUDE.md does not apply: a replace at an identical argument list cannot
-- leave a second overload behind, and `pg_proc` still holds exactly what it
-- held (the self-check at the foot reads that back rather than assuming it).
--
-- THERE IS THEREFORE NO DEPLOY ORDERING. No client names a new parameter and no
-- old arity stops existing, so this file and any deploy are independent events
-- and either may go first. Applied ahead of the client it is inert -- nothing
-- posts a schema-3 item's answer yet; applied behind it, the answers that were
-- being refused start landing. Both directions are safe, which is the shape
-- CLAUDE.md asks for whenever it is available.

-- ---------------------------------------------------------------------------
-- 0. PRECONDITION. This file resolves a manifest, so 0195's table and the
--    version column have to be there. It refuses rather than half-applying:
--    without them, the replaced functions below would reference a relation
--    that does not exist and fail at their first call rather than here.
-- ---------------------------------------------------------------------------

do $pre$
begin
	if to_regclass('public.classroom_html_assignments') is null then
		raise exception '0197: classroom_html_assignments does not exist. Apply 0195 first.';
	end if;
	if not exists (
		select 1 from information_schema.columns
		where table_schema = 'public' and table_name = 'classroom_items'
			and column_name = 'assignment_schema_version'
	) then
		raise exception '0197: classroom_items.assignment_schema_version does not exist. Apply 0195 first.';
	end if;
	if to_regprocedure('public.classroom_save_response(uuid, text, jsonb)') is null then
		raise exception '0197: classroom_save_response(uuid, text, jsonb) does not exist. Apply 0086 first.';
	end if;
	if to_regprocedure('public.classroom_add_submission_file(uuid, text, text, text, bigint, text, text, text)') is null then
		raise exception '0197: the eight-argument classroom_add_submission_file does not exist. Apply 0133 and 0134 first.';
	end if;
end
$pre$;

-- ---------------------------------------------------------------------------
-- 1. THE REPORT. Read-only: it selects and raises notices, and writes nothing.
--
--    Four figures, and each of them is something a working copy cannot know.
--    The third is the one to actually read: an item carrying BOTH a manifest
--    and a spec is the single case whose write behaviour changes below, and
--    whether production holds any is not answerable from this repository.
-- ---------------------------------------------------------------------------

do $report$
declare
	v_ported integer;
	v_documents integer;
	v_disagree integer;
	v_both integer;
	v_answers integer;
	v_row record;
begin
	select count(*) into v_ported
	from public.classroom_items where assignment_schema_version = 3;

	select count(*) into v_documents from public.classroom_html_assignments;

	select count(*) into v_disagree
	from public.classroom_items i
	left join public.classroom_html_assignments h on h.item_id = i.id
	where (i.assignment_schema_version = 3) <> (h.item_id is not null);

	select count(*) into v_both
	from public.classroom_items i
	join public.classroom_html_assignments h on h.item_id = i.id
	join public.classroom_assignment_specs s on s.item_id = i.id
	where i.assignment_schema_version = 3;

	select count(*) into v_answers
	from public.classroom_responses r
	join public.classroom_items i on i.id = r.item_id
	where i.assignment_schema_version = 3;

	raise notice '0197: % item(s) are stamped schema 3; % document row(s) exist; % disagreement(s) between the two.',
		v_ported, v_documents, v_disagree;

	if v_disagree > 0 then
		raise notice '0197: a disagreement means something other than classroom_set_html_assignment wrote assignment_schema_version, or a document row was removed under a live item. This file does NOT repair one: a stamped item with no manifest raises its own refusal at save time rather than silently taking the spec path. Investigate it with 0195''s verification query.';
	end if;

	raise notice '0197: % schema-3 item(s) also carry an assignment spec row. Those are the only items whose write behaviour this file CHANGES rather than widens: their answers resolved against the spec before and resolve against the manifest after, which is the order every rendering surface already takes. Expected 0 -- nothing in the app posts both.',
		v_both;

	for v_row in
		select i.id, i.title
		from public.classroom_items i
		join public.classroom_html_assignments h on h.item_id = i.id
		join public.classroom_assignment_specs s on s.item_id = i.id
		where i.assignment_schema_version = 3
		order by i.title
	loop
		raise notice '0197:   item % ("%") carries both a manifest and a spec.', v_row.id, v_row.title;
	end loop;

	raise notice '0197: % response row(s) already exist against schema-3 items (expected 0 before this file: the gate refused every one).',
		v_answers;

	-- Which block types production's stored manifests actually declare. The
	-- widened gate accepts all six; this says which of them are in the table.
	for v_row in
		select b.blk->>'type' as block_type, count(*) as n
		from public.classroom_html_assignments h,
			lateral (
				select jsonb_array_elements(
					case when jsonb_typeof(h.manifest->'header') = 'array'
						then h.manifest->'header' else '[]'::jsonb end) as blk
				union all
				select b2.blk
				from jsonb_array_elements(
						case when jsonb_typeof(h.manifest->'modules') = 'array'
							then h.manifest->'modules' else '[]'::jsonb end) as m(mod),
					jsonb_array_elements(
						case when jsonb_typeof(m.mod->'blocks') = 'array'
							then m.mod->'blocks' else '[]'::jsonb end) as b2(blk)
			) b
		group by 1 order by 1
	loop
		raise notice '0197:   stored manifests declare % block(s) of type "%".', v_row.n, v_row.block_type;
	end loop;
end
$report$;

-- ---------------------------------------------------------------------------
-- 2. WHICH ENGINE, ASKED ONCE.
--
--    Both functions below need the same two facts -- is this item a ported
--    document, and what is its manifest -- and a second spelling of that is
--    precisely how a save and a photograph come to disagree about which
--    assignment they are on. So it is one function, and the callers read
--    `is not null` as "take the manifest arm".
--
--    IT RAISES FOR A STAMPED ITEM WITH NO DOCUMENT ROW rather than returning
--    null, and that is the whole reason it can be a single-value function.
--    Null has to mean exactly one thing -- "this is a v1 assignment, take the
--    spec arm" -- and folding the broken case into it would send a ported
--    item's answer down the spec path, where it earns 'This assignment has no
--    interactive spec.': a sentence about a spec, shown to a student working
--    inside a document, describing a state neither they nor their teacher can
--    act on. `mount.ts` calls that state `unavailable` and refuses to fold it
--    into either engine for the same reason.
--
--    THE SENTENCE IS ITS OWN AND IS NOT `HTML_ASSIGNMENT_UNAVAILABLE`. That
--    constant is what a reader sees when the worksheet cannot be MOUNTED;
--    this is what a student sees when a worksheet they are already typing in
--    cannot take an answer. Different moment, different sentence, and neither
--    file has to be kept in step with the other. It names no table, no column
--    and no migration, because a student reads it.
-- ---------------------------------------------------------------------------

create or replace function public._classroom_html_manifest(p_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_version integer;
	v_manifest jsonb;
begin
	select i.assignment_schema_version into v_version
	from public.classroom_items i where i.id = p_item_id;

	-- NULL and 1 are the v1 spec engine of 0086, which is every assignment that
	-- existed before 0195 and every one authored with a spec since. The
	-- column's own CHECK admits nothing but null, 1 and 3.
	if v_version is distinct from 3 then
		return null;
	end if;

	select h.manifest into v_manifest
	from public.classroom_html_assignments h where h.item_id = p_item_id;

	if v_manifest is null then
		raise exception 'This assignment could not be opened for answers. Tell your teacher, and they can check the upload.';
	end if;

	return v_manifest;
end;
$$;

-- 0195's form, and for 0195's stated reason: a private helper called only from
-- SECURITY DEFINER functions, which run it as the owner, so neither `anon` nor
-- `authenticated` needs to hold it -- and naming the roles is what makes that
-- end state independent of the direct grants a hosted project's default
-- privileges write into every new function's ACL at creation time.
-- `service_role` is deliberately not named, exactly as 0137 never touches it.
revoke all on function public._classroom_html_manifest(uuid)
	from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. RESOLVING A BLOCK INSIDE A MANIFEST.
--
--    Pure jsonb in, pure jsonb out, in the shape `_classroom_gated_modules`
--    already uses for the spec side: it names no table, so it can be reasoned
--    about and tested on a value.
--
--    THE HEADER IS WALKED WITH THE MODULES, not instead of them. 0195's own
--    validator holds header ids and module block ids in ONE array and rejects a
--    collision across the two, precisely because a header block's id lands in
--    `classroom_responses.block_id` exactly as a module block's does -- a
--    student's name is an answer. A lookup that read only `modules` would
--    refuse every identity field with 'Unknown block', which is the shape of
--    bug that looks like a document problem for a week.
--
--    EVERY CONTAINER IS TYPE-GUARDED before it is walked. The manifest in the
--    table went through `_classroom_check_html_manifest`, so `modules` IS an
--    array and `header` is an array or absent -- but `jsonb_array_elements`
--    over a scalar RAISES, and a function that turns a malformed row into an
--    exception a student reads is worse than one that turns it into 'Unknown
--    block'. Same argument `htmlFieldToBlockId` makes about its own guard: a
--    precondition, not a second validator.
-- ---------------------------------------------------------------------------

create or replace function public._classroom_html_block(p_manifest jsonb, p_block_id text)
returns jsonb
language sql
immutable
security definer
set search_path = ''
as $$
	select b.blk
	from (
		select jsonb_array_elements(
			case when jsonb_typeof(p_manifest->'header') = 'array'
				then p_manifest->'header' else '[]'::jsonb end) as blk
		union all
		select b2.blk
		from jsonb_array_elements(
				case when jsonb_typeof(p_manifest->'modules') = 'array'
					then p_manifest->'modules' else '[]'::jsonb end) as m(mod),
			jsonb_array_elements(
				case when jsonb_typeof(m.mod->'blocks') = 'array'
					then m.mod->'blocks' else '[]'::jsonb end) as b2(blk)
	) b
	where b.blk->>'id' = p_block_id
	limit 1;
$$;

revoke all on function public._classroom_html_block(jsonb, text)
	from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. THE ANSWER WRITE.
--
--    0086's function, with one branch added. Everything a spec-backed
--    assignment touches is that file's own text in that file's own order.
--
--    THE MANIFEST ARM ACCEPTS ALL SIX BLOCK TYPES, and that is not generosity.
--    The frame bridge accepts an `idea:change` by FIELD -- it asks whether the
--    manifest claims that `[data-field]`, never what type the block is -- so
--    every one of the six can legitimately produce a change message, and a
--    gate narrower than the manifest's own vocabulary would refuse an answer
--    the document is allowed to send, with no surface anywhere able to say
--    which types were safe to use. The vocabulary is 0195's, verbatim, and it
--    is the ONE place the write path states it.
--
--    THERE IS NO APPROVAL GATE ON THIS ARM, and its absence is deliberate
--    rather than forgotten. The v1 spec format carries `approvalGate`, and
--    `_classroom_gated_modules` reads it. The manifest format has no such key:
--    `_classroom_check_html_manifest` validates none, so a manifest carrying
--    one arrived unchecked, and honouring an unvalidated field would let
--    whatever a document happened to contain decide whether a student may
--    write. When ported assignments need staged approval it is a manifest
--    change, a validator change and a migration -- not a field read on trust.
--
--    `@declaration` IS REFUSED ON THIS ARM, in the spec path's own words. A
--    manifest declares no academic-integrity declaration, so there is nothing
--    for a document to tick, and 'This assignment has no declaration.' is
--    already the exact sentence a spec with no declaration gives.
-- ---------------------------------------------------------------------------

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
	v_manifest jsonb;
	v_spec jsonb;
	v_block jsonb;
	v_module_id text;
	v_type text;
	v_state text;
	v_gated text[];
begin
	-- WHICH ENGINE, FIRST, AND IT READS NOTHING ELSE FOR A V1 ITEM. Null here
	-- means "not a ported document", so the three statements that follow are
	-- 0086's opening verbatim, in 0086's order -- including the fact that an
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
		if v_manifest is not null then
			raise exception 'This assignment has no declaration.';
		end if;
		if (v_spec->'declarations'->>'academicIntegrity')::boolean is not true then
			raise exception 'This assignment has no declaration.';
		end if;
	elsif v_manifest is not null then
		v_block := public._classroom_html_block(v_manifest, p_block_id);
		if v_block is null then
			raise exception 'Unknown block "%".', p_block_id;
		end if;
		v_type := v_block->>'type';
		if v_type not in ('text', 'longText', 'checkbox', 'radio', 'image', 'table') then
			raise exception 'Block "%" does not take a typed response.', p_block_id;
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

-- The ACL restated rather than inherited. `create or replace` over an existing
-- function preserves its ACL, so on production this is the end state 0086 and
-- 0137 already left; naming the roles makes it independent of that, and covers
-- the database where this replace IS a create and the hosted defaults would
-- hand it a fresh `anon` grant. `service_role` is not named, here or below,
-- because it is never part of that narrowing anywhere in this schema.
revoke all on function public.classroom_save_response(uuid, text, jsonb)
	from public, anon, authenticated;
grant execute on function public.classroom_save_response(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. THE BLOCK-BOUND PHOTOGRAPH.
--
--    0134's function -- the EIGHT-argument form, which is the one that holds
--    the body -- with the same one branch. Its seven-argument sibling from
--    0086 is a thin wrapper that delegates here (0133), so it is repaired by
--    this replace and is deliberately not touched: re-writing it could only
--    move the position of its own 'A Drive file id is required.' refusal,
--    which 0133 placed exactly where 0086 raised it.
--
--    THE MANIFEST ARM REQUIRES TYPE `image`, which is this format's spelling of
--    the spec format's `imageZone`. A hand-in with NO block id is unchanged on
--    both arms: it is an ordinary attachment to the submission and was never
--    the spec's business.
--
--    The refusal keeps 0086's sentence, 'Block "%" is not an image zone.',
--    because it is the sentence a student has always read for this and it says
--    the true thing on either arm. A second wording for the same refusal is a
--    thing to keep in step for no gain.
-- ---------------------------------------------------------------------------

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
	v_manifest jsonb;
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
		v_manifest := public._classroom_html_manifest(p_item_id);
		if v_manifest is not null then
			v_block := public._classroom_html_block(v_manifest, p_block_id);
			if v_block is null or v_block->>'type' <> 'image' then
				raise exception 'Block "%" is not an image zone.', coalesce(p_block_id, '(none)');
			end if;
			-- No approval gate on this arm; see classroom_save_response above for
			-- why honouring one would mean reading an unvalidated field.
		else
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
	end if;

	select s.id, s.state into v_submission_id, v_state
	from public.classroom_submissions s
	where s.item_id = p_item_id and s.student_email = v_email;
	if v_state = 'submitted' then
		return jsonb_build_object('ok', false, 'reason', 'locked');
	end if;
	if v_submission_id is null then
		-- See classroom_open_submission (0134) for why this is a
		-- conflict-tolerant insert with a re-read rather than a plain one.
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

revoke all on function public.classroom_add_submission_file(uuid, text, text, text, bigint, text, text, text)
	from public, anon, authenticated;
grant execute on function public.classroom_add_submission_file(uuid, text, text, text, bigint, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. THE SELF-CHECK. Read the catalog and the BEHAVIOUR back rather than trust
--    that the statements above ran. It raises, so a partial apply cannot look
--    like a clean one, and it writes nothing that survives: the two fixtures it
--    builds are rolled back explicitly at the end of the block.
-- ---------------------------------------------------------------------------

do $checks$
declare
	v_arities integer;
	v_anon boolean;
	v_authed boolean;
	v_block jsonb;
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
	-- EXACTLY ONE ROW PER SIGNATURE, which is what says no overload was left
	-- behind. The eight-argument form and 0086's seven-argument wrapper are
	-- counted apart, because two rows for `classroom_add_submission_file` is
	-- the CORRECT answer here and a count of the name alone could not tell
	-- that from the failure.
	select count(*) into v_arities from pg_proc p
	where p.pronamespace = 'public'::regnamespace
		and p.proname = 'classroom_save_response';
	if v_arities <> 1 then
		raise exception '0197: pg_proc holds % row(s) for classroom_save_response, expected exactly 1.', v_arities;
	end if;

	select count(*) into v_arities from pg_proc p
	where p.pronamespace = 'public'::regnamespace
		and p.proname = 'classroom_add_submission_file';
	if v_arities <> 2 then
		raise exception '0197: pg_proc holds % row(s) for classroom_add_submission_file, expected exactly 2 (0134''s eight-argument form and 0086''s seven-argument wrapper).', v_arities;
	end if;

	if to_regprocedure('public._classroom_html_manifest(uuid)') is null then
		raise exception '0197: _classroom_html_manifest(uuid) was not created.';
	end if;
	if to_regprocedure('public._classroom_html_block(jsonb, text)') is null then
		raise exception '0197: _classroom_html_block(jsonb, text) was not created.';
	end if;

	-- The WIDE form must still carry NO defaults, or the pair 0133 built stops
	-- being unambiguous under PostgREST's resolution and every call breaks.
	select p.pronargdefaults into v_arities from pg_proc p
	where p.oid = to_regprocedure('public.classroom_add_submission_file(uuid, text, text, text, bigint, text, text, text)');
	if v_arities <> 0 then
		raise exception '0197: the eight-argument classroom_add_submission_file now declares % default(s). It must declare none, or it and the seven-argument wrapper can both bind one payload.', v_arities;
	end if;

	-- ---- the block resolver, on a value ----------------------------------
	--
	-- Every one of the six types the manifest format admits, plus the header
	-- block, plus a POSITIVE CONTROL: a name no block carries must answer null,
	-- or "it found something" is not evidence it found the right thing.
	v_block := public._classroom_html_block(v_manifest, 'who');
	if v_block is null or v_block->>'type' <> 'text' then
		raise exception '0197: _classroom_html_block did not resolve the HEADER block "who".';
	end if;
	v_block := public._classroom_html_block(v_manifest, 'b-image');
	if v_block is null or v_block->>'type' <> 'image' then
		raise exception '0197: _classroom_html_block did not resolve the module block "b-image".';
	end if;
	v_block := public._classroom_html_block(v_manifest, 'b-table');
	if v_block is null or v_block->>'type' <> 'table' then
		raise exception '0197: _classroom_html_block did not resolve the module block "b-table".';
	end if;
	if public._classroom_html_block(v_manifest, 'no-such-block') is not null then
		raise exception '0197: _classroom_html_block answered a block id no manifest carries. It is matching something other than the id.';
	end if;
	-- A manifest with no header at all, which is legal, must not raise.
	if public._classroom_html_block(v_manifest - 'header', 'b-long') is null then
		raise exception '0197: _classroom_html_block could not walk a manifest carrying no header.';
	end if;
	-- And a manifest whose containers are the wrong shape must answer null
	-- rather than raising in front of a student.
	if public._classroom_html_block(jsonb_build_object('modules', 'not-an-array'), 'b-long') is not null then
		raise exception '0197: _classroom_html_block answered something for a malformed manifest.';
	end if;

	-- ---- the engine discriminator, on a real row -------------------------
	--
	-- Built here, checked, and rolled back: the fixture below writes to
	-- classroom_items and classroom_html_assignments, and a migration must not
	-- leave a test item in a live class list.
	begin
		insert into public.classroom_items (id, kind, title, body, author_email)
		values ('00000000-0000-4000-8000-000000000197'::uuid, 'assignment',
			'0197 self-check', 'temporary', 'migration@0197.invalid');

		if public._classroom_html_manifest('00000000-0000-4000-8000-000000000197'::uuid) is not null then
			raise exception '0197: _classroom_html_manifest answered a manifest for an UNSTAMPED item. Every v1 assignment would take the manifest arm.';
		end if;

		update public.classroom_items set assignment_schema_version = 3
		where id = '00000000-0000-4000-8000-000000000197'::uuid;

		begin
			perform public._classroom_html_manifest('00000000-0000-4000-8000-000000000197'::uuid);
			raise exception '0197: a stamped item with NO document row did not raise. That state would fall through to the spec arm and tell a student their document has no interactive spec.';
		exception
			when sqlstate 'P0001' then
				if position('could not be opened for answers' in sqlerrm) = 0 then
					raise;
				end if;
		end;

		insert into public.classroom_html_assignments (item_id, document, manifest, filename, imported_by)
		values ('00000000-0000-4000-8000-000000000197'::uuid, '<!doctype html>', v_manifest,
			'selfcheck.html', 'migration@0197.invalid');

		if public._classroom_html_manifest('00000000-0000-4000-8000-000000000197'::uuid) is null then
			raise exception '0197: _classroom_html_manifest answered null for a stamped item carrying a document row.';
		end if;

		raise exception 'rollback the 0197 self-check fixture';
	exception
		when sqlstate 'P0001' then
			if position('rollback the 0197 self-check fixture' in sqlerrm) = 0 then
				raise;
			end if;
	end;

	if exists (select 1 from public.classroom_items
		where id = '00000000-0000-4000-8000-000000000197'::uuid) then
		raise exception '0197: the self-check fixture survived its rollback. Remove item 00000000-0000-4000-8000-000000000197 by hand.';
	end if;

	-- ---- the ACL ---------------------------------------------------------
	v_anon := has_function_privilege('anon', 'public.classroom_save_response(uuid, text, jsonb)', 'execute');
	v_authed := has_function_privilege('authenticated', 'public.classroom_save_response(uuid, text, jsonb)', 'execute');
	if v_anon then
		raise exception '0197: classroom_save_response is executable by anon.';
	end if;
	if not v_authed then
		raise exception '0197: classroom_save_response is NOT executable by authenticated. Every student save would fail.';
	end if;

	v_anon := has_function_privilege('anon',
		'public.classroom_add_submission_file(uuid, text, text, text, bigint, text, text, text)', 'execute');
	v_authed := has_function_privilege('authenticated',
		'public.classroom_add_submission_file(uuid, text, text, text, bigint, text, text, text)', 'execute');
	if v_anon then
		raise exception '0197: the eight-argument classroom_add_submission_file is executable by anon.';
	end if;
	if not v_authed then
		raise exception '0197: the eight-argument classroom_add_submission_file is NOT executable by authenticated.';
	end if;

	-- The seven-argument wrapper is untouched by this file and must still be
	-- callable, or 0086's arity breaks for a caller this file never named.
	if not has_function_privilege('authenticated',
		'public.classroom_add_submission_file(uuid, text, text, text, bigint, text, text)', 'execute') then
		raise exception '0197: the seven-argument classroom_add_submission_file wrapper lost its grant to authenticated.';
	end if;

	if has_function_privilege('anon', 'public._classroom_html_manifest(uuid)', 'execute')
		or has_function_privilege('authenticated', 'public._classroom_html_manifest(uuid)', 'execute')
		or has_function_privilege('anon', 'public._classroom_html_block(jsonb, text)', 'execute')
		or has_function_privilege('authenticated', 'public._classroom_html_block(jsonb, text)', 'execute') then
		raise exception '0197: a private helper is still executable by anon or authenticated.';
	end if;

	raise notice '0197: the write gate now resolves a schema-3 item against its stored manifest. classroom_save_response accepts text, longText, checkbox, radio, image and table; classroom_add_submission_file accepts a manifest block of type image. Header blocks resolve alongside module blocks. A v1 spec assignment takes 0086''s path unchanged, refusal for refusal.';
	raise notice '0197: signatures unchanged, so there is no deploy ordering -- this file and any client deploy are independent events.';
end
$checks$;

-- ===========================================================================
-- VERIFICATION QUERY -- paste into the SQL editor after applying
-- ===========================================================================
--
-- select
--   (select count(*) from pg_proc
--      where pronamespace = 'public'::regnamespace
--        and proname = 'classroom_save_response')                          as save_arities,
--   (select count(*) from pg_proc
--      where pronamespace = 'public'::regnamespace
--        and proname = 'classroom_add_submission_file')                    as file_arities,
--   (select pronargdefaults from pg_proc
--      where oid = to_regprocedure(
--        'public.classroom_add_submission_file(uuid, text, text, text, bigint, text, text, text)'))
--                                                                          as wide_defaults,
--   (select count(*) from pg_proc
--      where pronamespace = 'public'::regnamespace
--        and proname in ('_classroom_html_manifest', '_classroom_html_block'))
--                                                                          as helpers_present,
--   (select count(*) from pg_proc
--      where pronamespace = 'public'::regnamespace
--        and proname = 'classroom_save_response'
--        and prosrc like '%_classroom_html_manifest%')                     as save_reads_manifest,
--   (select count(*) from pg_proc
--      where pronamespace = 'public'::regnamespace
--        and proname = 'classroom_add_submission_file'
--        and prosrc like '%_classroom_html_manifest%')                     as file_reads_manifest,
--   has_function_privilege('anon',
--     'public.classroom_save_response(uuid, text, jsonb)', 'execute')      as anon_can_save,
--   has_function_privilege('authenticated',
--     'public.classroom_save_response(uuid, text, jsonb)', 'execute')      as authed_can_save,
--   has_function_privilege('authenticated',
--     'public.classroom_add_submission_file(uuid, text, text, text, bigint, text, text, text)', 'execute')
--                                                                          as authed_can_attach,
--   has_function_privilege('anon',
--     'public._classroom_html_manifest(uuid)', 'execute')                  as anon_can_resolve,
--   (select count(*) from public.classroom_items i
--      left join public.classroom_html_assignments h on h.item_id = i.id
--      where (i.assignment_schema_version = 3) <> (h.item_id is not null))  as version_row_disagreements,
--   (select count(*) from public.classroom_items i
--      join public.classroom_html_assignments h on h.item_id = i.id
--      join public.classroom_assignment_specs s on s.item_id = i.id
--      where i.assignment_schema_version = 3)                               as items_carrying_both,
--   (select count(*) from public.classroom_responses r
--      join public.classroom_items i on i.id = r.item_id
--      where i.assignment_schema_version = 3)                               as ported_answers_stored,
--   (select count(*) from public.classroom_items
--      where id = '00000000-0000-4000-8000-000000000197')                   as selfcheck_leftover;
--
-- EXPECT, immediately after applying: save_arities 1, file_arities 2,
-- wide_defaults 0, helpers_present 2, save_reads_manifest 1,
-- file_reads_manifest 1, anon_can_save false, authed_can_save true,
-- authed_can_attach true, anon_can_resolve false, version_row_disagreements 0,
-- items_carrying_both 0, ported_answers_stored 0, selfcheck_leftover 0.
--
-- `ported_answers_stored` IS THE ONE WORTH RE-RUNNING LATER, and it is the
-- figure that says this file did its job: it can only be 0 before the apply,
-- because the gate refused every write, and it should start climbing the first
-- time a student types into a ported worksheet. A number that stays at 0 after
-- one has means the answers are still not landing and the client half is where
-- to look next.
--
-- `version_row_disagreements` and `items_carrying_both` are the two that could
-- drift. The first means something other than classroom_set_html_assignment
-- wrote the version column; the second means an item acquired a spec beside its
-- manifest, whose answers now resolve against the manifest.
