-- 0310_armory_computer_key.sql
--
-- IDEA ARMORY: ONE LAB COMPUTER, ONE LINE ON THE WEBSITE (ledger 0441,
-- docs/feedback/2026-10-26/QUEUE-0441.md; Mr. Pina, 2026-10-26: "go for the
-- server change"). Every sign-in registers a device of its own, by design, so
-- a lab computer five students signed in to is five device rows with one name,
-- and two lab computers imaged alike are two rows that share a name too. The
-- server could not tell those two cases apart. This file stores a per-computer
-- key so the website can.
--
--   1. armory_devices.computer_key, nullable. The Windows app already computes
--      a per-computer hash, its incident machineId (16 hex characters from
--      MachineGuid and the computer's own network address, because a lab image
--      copied without Sysprep shares MachineGuid). It is kept only when it is
--      1 to 64 letters, digits, dashes or underscores, exactly the rule
--      armory_app_incidents.machine_id (0236) applies; anything else is stored
--      as null, never refused. _armory_computer_key is the one statement of
--      that rule for this column; the column CHECK is its backstop.
--
--   2. ADDITIVE WIDENING, NO DEPLOY ORDERING. armory_register_device and
--      armory_heartbeat each gain a wide form with a trailing p_computer_key
--      and NO defaults; the narrow forms keep their signatures and become thin
--      wrappers passing null. So an Armory 0.5.0 computer keeps calling the
--      narrow forms and keeps working, a 0.5.1 app talking to a database
--      without this file gets 404 PGRST202 and falls back, and no payload can
--      bind to both forms. The heartbeat stores a key when one is sent and
--      keeps the stored one when null or invalid arrives, so a bare beat never
--      erases it; a changed key is written even inside the 20-second quiet
--      window.
--
--   3. armory_team_status gains one key per listed device, "computer": an
--      opaque 12-character token made from the project id and the stored key,
--      null where no key is stored. The same computer reads the same token in
--      one project and a different one in another, so nothing here links a
--      computer across projects, and the raw key is never returned. The set
--      of devices listed and who may read them are unchanged (armory_can_view,
--      0233): a member sees computers only for their own projects, exactly the
--      devices they could already see. The armory_devices policy stays
--      own-row.
--
-- UNDO, before any client depends on it (a person's paste): drop
-- armory_register_device(text, uuid, text) and armory_heartbeat(uuid, text,
-- text, text), re-run the 0231 body of armory_register_device(text, uuid) and
-- the 0233 bodies of armory_heartbeat(uuid, text, text) and
-- armory_team_status(uuid), drop _armory_computer_key(text), and drop the
-- computer_key column (that last statement is destructive DDL, so it is
-- pasted by hand, never applied by the tool).

-- ---------------------------------------------------------------------------
-- 0. The one rule for a computer key, first, so the object the deploy probe
-- checks is new here. Private: only the definer functions below call it.
-- ---------------------------------------------------------------------------

create or replace function public._armory_computer_key(p_key text) returns text
language sql immutable set search_path = '' as $ck$
	select case when p_key ~ '^[0-9A-Za-z_-]{1,64}$' then p_key end
$ck$;

-- ---------------------------------------------------------------------------
-- 1. The column.
-- ---------------------------------------------------------------------------

alter table public.armory_devices add column if not exists computer_key text
	check (computer_key is null or computer_key ~ '^[0-9A-Za-z_-]{1,64}$');

-- ---------------------------------------------------------------------------
-- 2. Registering a device: the wide form holds the body, the 0231 form calls it.
-- ---------------------------------------------------------------------------

drop function if exists public.armory_register_device(text, uuid, text);
create function public.armory_register_device(p_name text, p_operation uuid, p_computer_key text) returns uuid
language plpgsql security definer set search_path = '' as $rd$
declare r jsonb; d uuid;
begin
	r := public.armory_replay(p_operation, 'armory_register_device');
	if r is not null then return (r->>'device_id')::uuid; end if;
	if btrim(coalesce(p_name, '')) = '' then raise exception 'device name is required'; end if;
	insert into public.armory_devices(owner_email, name, computer_key)
	values (public.armory_current_email(), p_name, public._armory_computer_key(p_computer_key)) returning id into d;
	perform public.armory_remember(p_operation, 'armory_register_device', jsonb_build_object('device_id', d));
	return d;
end $rd$;

create or replace function public.armory_register_device(p_name text, p_operation uuid) returns uuid
language plpgsql security definer set search_path = '' as $rd$
begin
	-- The wide form replays first and raises 0231's own refusal text, as this form always did.
	return public.armory_register_device(p_name, p_operation, null::text);
end $rd$;

-- ---------------------------------------------------------------------------
-- 3. The heartbeat: the wide form holds the body, the 0233 form calls it.
-- ---------------------------------------------------------------------------

drop function if exists public.armory_heartbeat(uuid, text, text, text);
create function public.armory_heartbeat(p_device uuid, p_app_version text, p_state text, p_computer_key text) returns void
language plpgsql security definer set search_path = '' as $hb$
declare
	v_version text := nullif(regexp_replace(coalesce(p_app_version, ''), '^\s+|\s+$', '', 'g'), '');
	v_state text := nullif(regexp_replace(coalesce(p_state, ''), '^\s+|\s+$', '', 'g'), '');
	v_key text := public._armory_computer_key(p_computer_key);
begin
	perform public.armory_require_device(p_device);
	if v_version is not null and char_length(v_version) > 40 then
		raise exception 'The app version is at most 40 characters.' using errcode = '22023',
			detail = jsonb_build_object('reason', 'too_long', 'field', 'app_version', 'limit', 40)::text;
	end if;
	if v_state is not null and v_state !~ '^[A-Za-z][A-Za-z0-9_-]{0,31}$' then
		raise exception 'The state is one word.' using errcode = '22023',
			detail = jsonb_build_object('reason', 'state', 'field', 'state')::text;
	end if;
	update public.armory_devices
	set last_seen = now(), app_version = coalesce(v_version, app_version), state = coalesce(v_state, state),
		computer_key = coalesce(v_key, computer_key)
	where id = p_device
		and (last_seen is null or last_seen < now() - interval '20 seconds'
			or (v_version is not null and app_version is distinct from v_version)
			or (v_state is not null and state is distinct from v_state)
			or (v_key is not null and computer_key is distinct from v_key));
end $hb$;

create or replace function public.armory_heartbeat(p_device uuid, p_app_version text, p_state text) returns void
language plpgsql security definer set search_path = '' as $hb$
begin
	-- The wide form raises 0233's refusals with the same text, SQLSTATE and detail, in the same order.
	perform public.armory_heartbeat(p_device, p_app_version, p_state, null::text);
end $hb$;

-- ---------------------------------------------------------------------------
-- 4. The team read: 0233's body, plus "computer" on each listed device.
-- ---------------------------------------------------------------------------

create or replace function public.armory_team_status(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $ac$
begin
	if not public.armory_can_view(p_project) then raise exception 'not a project member' using errcode = '42501'; end if;
	return coalesce((
		select jsonb_agg(
			jsonb_build_object('email', m.email, 'role', m.role)
			|| coalesce(public._armory_person(m.email), jsonb_build_object('has_account', false))
			|| jsonb_build_object(
				'devices_total', (select count(*) from public.armory_devices d where d.owner_email = m.email),
				'devices', coalesce((
					select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'registered_at', d.registered_at,
						'last_seen', d.last_seen, 'app_version', d.app_version, 'state', d.state,
						'computer', case when d.computer_key is null then null
							else left(md5(p_project::text || ':' || d.computer_key), 12) end)
						order by d.last_seen desc nulls last, d.registered_at desc, d.id)
					from public.armory_devices d
					where d.owner_email = m.email
						and (d.last_seen >= now() - interval '30 days'
							or d.registered_at >= now() - interval '30 days'
							or exists (select 1 from public.armory_locks l join public.armory_files f on f.id = l.file_id
								where l.holder_device_id = d.id and l.broken_at is null
									and f.project_id = p_project and f.deleted_at is null))
				), '[]'::jsonb),
				'checkouts', coalesce((
					select jsonb_agg(jsonb_build_object('file_id', f.id, 'folder', f.folder, 'name', f.name,
						'path', case when f.folder = '' then f.name else f.folder || '/' || f.name end,
						'since', l.acquired_at, 'device_id', l.holder_device_id)
						order by l.acquired_at, f.folder, lower(f.name), f.id)
					from public.armory_locks l join public.armory_files f on f.id = l.file_id
					where f.project_id = p_project and f.deleted_at is null and l.broken_at is null and l.holder_email = m.email
				), '[]'::jsonb))
			order by m.email)
		from public.armory_members m where m.project_id = p_project
	), '[]'::jsonb);
end $ac$;

-- ---------------------------------------------------------------------------
-- 5. Grants. The 0166 shape: revoke from every client role BY NAME, then grant
-- back the one role that calls it. The helper is granted to nobody.
-- ---------------------------------------------------------------------------

revoke all on function public._armory_computer_key(text) from public, anon, authenticated;
revoke all on function public.armory_register_device(text, uuid, text) from public, anon, authenticated;
grant execute on function public.armory_register_device(text, uuid, text) to authenticated;
revoke all on function public.armory_register_device(text, uuid) from public, anon, authenticated;
grant execute on function public.armory_register_device(text, uuid) to authenticated;
revoke all on function public.armory_heartbeat(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.armory_heartbeat(uuid, text, text, text) to authenticated;
revoke all on function public.armory_heartbeat(uuid, text, text) from public, anon, authenticated;
grant execute on function public.armory_heartbeat(uuid, text, text) to authenticated;
revoke all on function public.armory_team_status(uuid) from public, anon, authenticated;
grant execute on function public.armory_team_status(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Self-check, BY NAME over this file's own objects and nothing else.
-- ---------------------------------------------------------------------------

do $sc$
declare
	v_f text;
	v_total integer;
	v_keyed integer;
begin
	foreach v_f in array array[
		'armory_register_device(text, uuid, text)',
		'armory_register_device(text, uuid)',
		'armory_heartbeat(uuid, text, text, text)',
		'armory_heartbeat(uuid, text, text)',
		'armory_team_status(uuid)'] loop
		if not (select p.prosecdef and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%'
			from pg_catalog.pg_proc p where p.oid = ('public.' || v_f)::regprocedure) then
			raise exception '0310: public.% must be security definer with search_path pinned', v_f;
		end if;
		if (select p.pronargdefaults from pg_catalog.pg_proc p where p.oid = ('public.' || v_f)::regprocedure) <> 0 then
			raise exception '0310: public.% must declare no defaults, or the pair is ambiguous', v_f;
		end if;
		if pg_catalog.has_function_privilege('anon', 'public.' || v_f, 'execute') then
			raise exception '0310: anon can execute public.%', v_f;
		end if;
		if not pg_catalog.has_function_privilege('authenticated', 'public.' || v_f, 'execute') then
			raise exception '0310: authenticated cannot execute public.%', v_f;
		end if;
	end loop;
	if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname in ('armory_register_device', 'armory_heartbeat')) <> 4 then
		raise exception '0310: expected exactly two forms each of armory_register_device and armory_heartbeat';
	end if;
	if pg_catalog.has_function_privilege('anon', 'public._armory_computer_key(text)', 'execute')
		or pg_catalog.has_function_privilege('authenticated', 'public._armory_computer_key(text)', 'execute') then
		raise exception '0310: a client role can execute public._armory_computer_key';
	end if;
	if not exists (select 1 from pg_catalog.pg_attribute
		where attrelid = 'public.armory_devices'::regclass and attname = 'computer_key' and not attisdropped) then
		raise exception '0310: expected the column armory_devices.computer_key';
	end if;
	select count(*), count(computer_key) into v_total, v_keyed from public.armory_devices;
	raise notice '0310 armory-computer-key: computer_key added (% devices, % with a key); register and heartbeat have their wide forms, 0 executable by anon', v_total, v_keyed;
end $sc$;
