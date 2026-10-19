-- 0275_short_link_reserve_market.sql
--
-- Ledger 0402 (decision 70): the IDEA Coin marketplace and stock market live
-- at /market and /market/stocks, so `market` is a top-level directory of the
-- route tree.
--
-- WHAT THIS DOES: adds exactly one name, `market`, to
-- `_app_short_link_reserved`. The rule this predicate keeps (0156, 0166,
-- 0215, 0231, 0260, 0269, 0271) is that every top-level name the site claims
-- is refused as a short link, and `tests/short-link-reserved-names.test.ts`
-- walks the route tree and reddens on an unreserved one. The set below is
-- 0271's forty names, taken from that file's body, plus `market` in
-- alphabetical order between `maps` and `mcp`: forty-one.
--
-- ADDITIVE. Same signature, so no `drop function` and no second overload. No
-- row of any table is written, moved or deleted. The grant block states the
-- end state every redefinition since 0137 has left (service_role only),
-- naming the roles (the 0166 shape).
--
-- THE EXISTING-ROW QUESTION. Unlike /feedback (0269), /market IS a page, so a
-- short link named `market` would be shadowed by it and could never be
-- reached again. If one exists this file refuses and names it, rather than
-- moving a possibly printed link on its own: renaming it is a person's call.
--
-- VERIFICATION, rows not notices (paste after applying):
--   select s.slug, public._app_short_link_reserved(s.slug) as reserved
--   from (values ('market'), ('maps'), ('open-lab')) as s(slug);
--   -- expect market true, maps true, open-lab false
--
-- REVERSAL: re-paste 0271's definition of `_app_short_link_reserved` (its
-- forty names) with its grant block. This file wrote no data.

do $$
declare
	v_n integer;
	v_target text;
begin
	select count(*), max(target) into v_n, v_target from public.app_short_links where slug = 'market';
	if v_n > 0 then
		raise exception '0275: a short link named "market" exists (target %) and /market is now a page that shadows it. Re-issue that link under another name, then apply.', v_target;
	end if;
	raise notice '0275: no short link is named "market"; nothing to move.';
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
		'a', 'admin', 'api', 'archive', 'armory', 'assignments', 'auth', 'b',
		'certifications', 'classroom',
		'coin-balance', 'coin-desk', 'coin-entry', 'coins', 'connector', 'contracts',
		'dashboard', 'dev', 'downloads', 'feedback', 'foundry', 'frc', 'fsp', 'fsp-pulse',
		'fsp-tech-selection', 'gauntlet', 'greenline', 'hx', 'ideacad',
		'manifest.webmanifest', 'maps', 'market', 'mcp', 'notebook', 'push-sw.js', 'reference',
		'robots.txt', 'sitemap.xml', 'tools', 'tournaments', 'vanguard'
	);
$$;

revoke all on function public._app_short_link_reserved(text) from public, anon, authenticated;
grant execute on function public._app_short_link_reserved(text) to service_role;

do $$
declare
	v_bad text[] := '{}';
	v_count integer;
begin
	if not public._app_short_link_reserved('market') or not public._app_short_link_reserved('mcp') then
		v_bad := array_append(v_bad, 'market or mcp is not reserved');
	end if;
	if public._app_short_link_reserved('open-lab') then
		v_bad := array_append(v_bad, 'the negative control open-lab is reserved');
	end if;
	select count(*) into v_count
	from pg_proc p,
		lateral regexp_matches(p.prosrc, '''([^'']*)''', 'g') as m
	where p.proname = '_app_short_link_reserved' and p.pronamespace = 'public'::regnamespace;
	if v_count <> 41 then
		v_bad := array_append(v_bad, ('the predicate has ' || v_count || ' literals instead of 41'));
	end if;
	if (select count(*) from pg_proc where proname = '_app_short_link_reserved' and pronamespace = 'public'::regnamespace) <> 1 then
		v_bad := array_append(v_bad, 'more than one overload of the predicate exists');
	end if;
	if has_function_privilege('anon', 'public._app_short_link_reserved(text)', 'execute')
		or has_function_privilege('authenticated', 'public._app_short_link_reserved(text)', 'execute') then
		v_bad := array_append(v_bad, 'a client role can execute the private predicate');
	end if;
	if array_length(v_bad, 1) is not null then
		raise exception '0275 self-check refused: %', array_to_string(v_bad, '; ');
	end if;
	raise notice '0275: the reserved-slug predicate has 41 names; market is reserved; open-lab is not; one overload; no client role can execute it.';
end
$$;
