-- 0234_armory_break_locks.sql
--
-- IDEA ARMORY: FORCE CHECK IN, MANY FILES AT ONCE (Armory 0.3.1, ledger 0374,
-- pina-hash/idea-armory docs/agent/website-requests-v0.3.1.md, item 1).
--
-- Armory 0.3.1 forces a check in of many files by calling armory_break_lock
-- once per file, sixteen at a time. Check out all and Check in all already go
-- in one call each (0233's armory_lock_files and armory_release_locks); Force
-- check in was the one bulk action with no batch, so it cost one HTTP request
-- and one transaction per file. This adds the batch, in exactly their shape.
--
-- armory_break_locks(p_files uuid[], p_device uuid, p_operation uuid) returns jsonb
--
--   * 1 to 500 distinct files (nulls and repeats dropped), else 22023 with
--     DETAIL {reason: count, total, limit: 500}.
--   * Files in id order, each through armory_break_lock ITSELF, under an
--     operation id derived from p_operation and the file (armory_derived_operation),
--     so every rule is that function's and none is restated here: who may
--     (a mentor, a CAD lead, or a site admin), the lock_broken change row
--     (by, former_holder, former_device_id), the refusal text and SQLSTATE,
--     and taking the project row (FOR KEY SHARE) before the lock row. One
--     file's refusal is caught and recorded; it never stops the rest.
--   * p_device may be null (the website has no computer). A named device must
--     be the caller's, checked once for the whole call, as armory_release_locks
--     does: P0001 'device is not registered to caller'.
--   * Answers {total, succeeded, refused, results: [{file_id, ok, broken}] or
--     [{file_id, ok: false, code, message}]}. broken false: nobody held it.
--   * A replayed p_operation answers what the first call answered and writes
--     nothing (armory_replay, armory_remember).
--
-- LOCK ORDER. Each file's call takes its project row before its lock row, and
-- the files go in id order, which is the order armory_lock_files and
-- armory_release_locks take them in. So two batches over the same files, or a
-- batch and a folder rename or purge (which hold the project row FOR UPDATE),
-- queue rather than deadlock. Locks taken by a refused file's call are
-- released with its savepoint.
--
-- Additive: one new function, no table, no change to any existing function, so
-- a deployed client and a 0.3.1 app are unaffected until they call it, and the
-- app falls back to one armory_break_lock per file on PGRST202.
--
-- UNDO: drop the one function, at its exact argument types (uuid array, uuid,
-- uuid). Nothing else depends on it.

create or replace function public.armory_break_locks(p_files uuid[], p_device uuid, p_operation uuid) returns jsonb
language plpgsql security definer set search_path = '' as $ac$
declare r jsonb; ids uuid[]; f uuid; got boolean; results jsonb := '[]'::jsonb; n_ok int := 0; n_bad int := 0;
begin
	r := public.armory_replay(p_operation, 'armory_break_locks');
	if r is not null then return r; end if;
	if p_device is not null then perform public.armory_require_device(p_device); end if;
	select array_agg(distinct x order by x) into ids from unnest(coalesce(p_files, '{}'::uuid[])) x where x is not null;
	if ids is null or cardinality(ids) > 500 then
		raise exception 'A batch is 1 to 500 files.' using errcode = '22023',
			detail = jsonb_build_object('reason', 'count', 'total', coalesce(cardinality(ids), 0), 'limit', 500)::text;
	end if;
	foreach f in array ids loop
		begin
			got := public.armory_break_lock(f, p_device, public.armory_derived_operation(p_operation, 'break:' || f::text));
			results := results || jsonb_build_array(jsonb_build_object('file_id', f, 'ok', true, 'broken', got));
			n_ok := n_ok + 1;
		exception when others then
			results := results || jsonb_build_array(jsonb_build_object('file_id', f, 'ok', false, 'code', sqlstate, 'message', sqlerrm));
			n_bad := n_bad + 1;
		end;
	end loop;
	return public.armory_remember(p_operation, 'armory_break_locks',
		jsonb_build_object('total', cardinality(ids), 'succeeded', n_ok, 'refused', n_bad, 'results', results));
end $ac$;

-- The 0166 shape: revoke from every client role BY NAME (a hosted project's
-- default privileges hand anon a direct grant that a revoke from public alone
-- leaves standing), then grant back the one role that calls it.
revoke all on function public.armory_break_locks(uuid[], uuid, uuid) from public, anon, authenticated;
grant execute on function public.armory_break_locks(uuid[], uuid, uuid) to authenticated;

-- Self-check, BY NAME over this file's one object and nothing else.
do $ac$
declare
	v_n integer;
	v_defaults integer;
	v_definer boolean;
	v_config text;
begin
	select count(*) into v_n from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'armory_break_locks';
	if v_n <> 1 then
		raise exception '0234: expected exactly one public.armory_break_locks, found %', v_n;
	end if;
	select p.pronargdefaults, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '') into v_defaults, v_definer, v_config
	from pg_catalog.pg_proc p where p.oid = 'public.armory_break_locks(uuid[], uuid, uuid)'::regprocedure;
	if v_defaults <> 0 or not v_definer or v_config not like '%search_path=%' then
		raise exception '0234: armory_break_locks must be security definer, with search_path pinned and no defaults';
	end if;
	if pg_catalog.has_function_privilege('anon', 'public.armory_break_locks(uuid[], uuid, uuid)', 'execute') then
		raise exception '0234: anon can execute public.armory_break_locks';
	end if;
	if not pg_catalog.has_function_privilege('authenticated', 'public.armory_break_locks(uuid[], uuid, uuid)', 'execute') then
		raise exception '0234: authenticated cannot execute public.armory_break_locks';
	end if;
	raise notice '0234 armory-break-locks: 1 function, security definer t, search_path pinned t, anon execute f, authenticated execute t';
end $ac$;
