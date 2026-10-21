-- 0292_short_link_reserve_coin_cover_view_as.sql
--
-- Ledger 0422: three new top-level directories of the route tree, so three
-- new reserved short-link names.
--   `coin`    the coin home (/coin).
--   `c`       an admin's HTML cover for a Foundry game, served on the apps
--             origin (/c/<app id>, 0291).
--   `view-as` the end of a view as / act as session (/view-as/exit, 0288).
--
-- WHAT THIS DOES: adds exactly those three names to `_app_short_link_reserved`.
-- The rule this predicate keeps (0156, 0166, 0215, 0231, 0260, 0269, 0271,
-- 0275) is that every top-level name the site claims is refused as a short
-- link, and `tests/short-link-reserved-names.test.ts` walks the route tree
-- and reddens on an unreserved one. The set below is 0275's forty-one names,
-- taken from that file's body, plus the three in alphabetical order:
-- forty-four.
--
-- ADDITIVE. Same signature, so no `drop function` and no second overload. No
-- row of any table is written, moved or deleted. The grant block states the
-- end state every redefinition since 0137 has left (service_role only).
--
-- THE EXISTING-ROW QUESTION, answered as 0275 answered it. Each of the three
-- is now a page that would shadow a short link of the same name, so the link
-- could never be reached again. If one exists this file refuses and names it
-- rather than moving a possibly printed link on its own: renaming it is a
-- person's call.
--
-- VERIFICATION, rows not notices (paste after applying):
--   select s.slug, public._app_short_link_reserved(s.slug) as reserved
--   from (values ('coin'), ('c'), ('view-as'), ('open-lab')) as s(slug);
--   -- expect coin, c and view-as true, open-lab false
--
-- REVERSAL: re-paste 0275's definition of `_app_short_link_reserved` (its
-- forty-one names) with its grant block. This file wrote no data.

do $$
declare
	v_taken text;
begin
	select string_agg(slug || ' (to ' || target || ')', ', ' order by slug) into v_taken
	from public.app_short_links where slug in ('c', 'coin', 'view-as');
	if v_taken is not null then
		raise exception '0292: these short links are now shadowed by pages and could never be reached: %. Re-issue each under another name, then apply.', v_taken;
	end if;
	raise notice '0292: no short link is named c, coin or view-as; nothing to move.';
end
$$;

create or replace function public._app_short_link_reserved(p_slug text)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
	select p_slug in (
		'a', 'admin', 'api', 'archive', 'armory', 'assignments', 'auth', 'b', 'c',
		'certifications', 'classroom',
		'coin', 'coin-balance', 'coin-desk', 'coin-entry', 'coins', 'connector', 'contracts',
		'dashboard', 'dev', 'downloads', 'feedback', 'foundry', 'frc', 'fsp', 'fsp-pulse',
		'fsp-tech-selection', 'gauntlet', 'greenline', 'hx', 'ideacad',
		'manifest.webmanifest', 'maps', 'market', 'mcp', 'notebook', 'push-sw.js', 'reference',
		'robots.txt', 'sitemap.xml', 'tools', 'tournaments', 'vanguard', 'view-as'
	);
$$;

revoke all on function public._app_short_link_reserved(text) from public, anon, authenticated;
grant execute on function public._app_short_link_reserved(text) to service_role;

do $$
declare
	v_bad text[] := '{}';
	v_count integer;
begin
	if not public._app_short_link_reserved('coin') or not public._app_short_link_reserved('c')
		or not public._app_short_link_reserved('view-as') or not public._app_short_link_reserved('market') then
		v_bad := array_append(v_bad, 'coin, c, view-as or market is not reserved');
	end if;
	if public._app_short_link_reserved('open-lab') then
		v_bad := array_append(v_bad, 'the negative control open-lab is reserved');
	end if;
	select count(*) into v_count
	from pg_proc p,
		lateral regexp_matches(p.prosrc, '''([^'']*)''', 'g') as m
	where p.proname = '_app_short_link_reserved' and p.pronamespace = 'public'::regnamespace;
	if v_count <> 44 then
		v_bad := array_append(v_bad, ('the predicate has ' || v_count || ' literals instead of 44'));
	end if;
	if (select count(*) from pg_proc where proname = '_app_short_link_reserved' and pronamespace = 'public'::regnamespace) <> 1 then
		v_bad := array_append(v_bad, 'more than one overload of the predicate exists');
	end if;
	if has_function_privilege('anon', 'public._app_short_link_reserved(text)', 'execute')
		or has_function_privilege('authenticated', 'public._app_short_link_reserved(text)', 'execute') then
		v_bad := array_append(v_bad, 'a client role can execute the private predicate');
	end if;
	if array_length(v_bad, 1) is not null then
		raise exception '0292 self-check refused: %', array_to_string(v_bad, '; ');
	end if;
	raise notice '0292: the reserved-slug predicate has 44 names; coin, c and view-as are reserved; open-lab is not; one overload; no client role can execute it.';
end
$$;
