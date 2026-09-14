-- 0215_short_link_reserve_ideacad.sql
--
-- Reserve the shipped top-level IdeaCAD route in the database guard. The
-- browser-side mirror alone is not an authorization boundary: the admin RPC
-- must refuse the same name.
--
-- An older short link named ideacad is already shadowed by the real route. If
-- one exists, this migration moves the intact row to the first available
-- ideacad-link spelling and records the old and new names before reserving the
-- route name. The move preserves target, label, author, active state and both
-- timestamps. Reapplying the file finds neither an old row nor another move to
-- make, while the audit row remains.

create table if not exists public.app_short_link_reserved_moves (
	original_slug text primary key,
	moved_slug text not null unique,
	target text not null,
	label text,
	active boolean not null,
	created_by text not null,
	created_at timestamptz not null,
	updated_at timestamptz not null,
	moved_at timestamptz not null default now(),
	migration text not null
);

revoke all on public.app_short_link_reserved_moves from public, anon, authenticated;
grant select on public.app_short_link_reserved_moves to service_role;
alter table public.app_short_link_reserved_moves enable row level security;

do $$
declare
	r public.app_short_links%rowtype;
	v_candidate text := 'ideacad-link';
	v_suffix integer := 2;
	v_moved integer := 0;
begin
	select * into r
	from public.app_short_links
	where slug = 'ideacad'
	for update;

	if found then
		while exists (select 1 from public.app_short_links where slug = v_candidate) loop
			v_candidate := 'ideacad-link-' || v_suffix::text;
			v_suffix := v_suffix + 1;
		end loop;

		update public.app_short_links
		set slug = v_candidate
		where slug = r.slug;

		insert into public.app_short_link_reserved_moves (
			original_slug, moved_slug, target, label, active, created_by,
			created_at, updated_at, migration
		) values (
			r.slug, v_candidate, r.target, r.label, r.active, r.created_by,
			r.created_at, r.updated_at, '0215'
		)
		on conflict (original_slug) do nothing;

		v_moved := 1;
		raise notice '0215: moved existing short link from "%" to "%"; target=% active=% label=% created_by=%. The complete before-state is recorded in app_short_link_reserved_moves.',
			r.slug, v_candidate, r.target, r.active, coalesce(r.label, '(none)'), r.created_by;
	end if;

	raise notice '0215: moved % existing short link(s) away from newly reserved slug ideacad.', v_moved;
end;
$$;

create or replace function public._app_short_link_reserved(p_slug text)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
	select p_slug in (
		'a', 'admin', 'api', 'archive', 'assignments', 'auth', 'b', 'classroom',
		'coin-balance', 'coin-desk', 'coin-entry', 'coins', 'contracts',
		'dashboard', 'dev', 'downloads', 'foundry', 'frc', 'fsp', 'fsp-pulse',
		'fsp-tech-selection', 'gauntlet', 'greenline', 'hx', 'ideacad',
		'manifest.webmanifest', 'maps', 'notebook', 'push-sw.js', 'reference',
		'robots.txt', 'sitemap.xml', 'tools', 'tournaments', 'vanguard'
	);
$$;

revoke all on function public._app_short_link_reserved(text)
	from public, anon, authenticated;
grant execute on function public._app_short_link_reserved(text) to service_role;

do $$
declare
	v_count integer;
	v_anon boolean;
	v_authenticated boolean;
begin
	if not public._app_short_link_reserved('ideacad') then
		raise exception '0215: ideacad was not reserved.';
	end if;
	if public._app_short_link_reserved('open-lab') then
		raise exception '0215: the negative control open-lab was reserved.';
	end if;
	if exists (select 1 from public.app_short_links where slug = 'ideacad') then
		raise exception '0215: an app_short_links row still occupies ideacad.';
	end if;

	select count(*) into v_count
	from pg_proc p,
		lateral regexp_matches(p.prosrc, '''([^'']*)''', 'g') as m
	where p.proname = '_app_short_link_reserved'
		and p.pronamespace = 'public'::regnamespace;
	if v_count <> 35 then
		raise exception '0215: the predicate has % literals instead of 35.', v_count;
	end if;

	v_anon := has_function_privilege('anon', 'public._app_short_link_reserved(text)', 'execute');
	v_authenticated := has_function_privilege('authenticated', 'public._app_short_link_reserved(text)', 'execute');
	if v_anon or v_authenticated then
		raise exception '0215: private predicate grants remain for anon=% authenticated=%.',
			v_anon, v_authenticated;
	end if;

	raise notice '0215: reserved slug predicate has 35 names; ideacad is reserved; open-lab is not; no ideacad row remains; client roles cannot execute the private predicate.';
end;
$$;

-- THE REVERSAL: restore 0196's predicate body and grants, move any row recorded
-- by 0215 back only if ideacad is still free, then drop the audit table only
-- after its record has been exported; otherwise this data-preserving move is
-- deliberately not reversible without choosing which printed spelling wins.
