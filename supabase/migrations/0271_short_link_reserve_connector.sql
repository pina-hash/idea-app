-- 0271_short_link_reserve_connector.sql
--
-- Ledger 0400, the IDEA Website Connector (docs/connector/DESIGN.md).
--
-- WHAT THIS DOES: adds exactly two names, `connector` and `mcp`, to
-- `_app_short_link_reserved`. The connector's MCP endpoint is
-- `src/routes/mcp/` and its sign-in pages are `src/routes/connector/`, so both
-- are top-level directories of the route tree, and the rule this predicate
-- keeps (0156, 0166, 0215, 0231, 0260, 0269) is that every top-level name the
-- site claims is refused as a short link. `tests/short-link-reserved-names
-- .test.ts` walks the route tree and reddens on an unreserved one. The set
-- below is 0269's own thirty-eight names, taken from that file's body, plus
-- `connector` (between `coins` and `contracts`) and `mcp` (between `maps` and
-- `notebook`): forty.
--
-- `.well-known` needs no reservation: a leading dot fails the slug shape before
-- a reserved check could ever matter, the same reason `_platform` is absent.
--
-- ADDITIVE. Same signature, so no `drop function` and no second overload. No
-- row of any table is written, moved or deleted. The grant block states the
-- end state 0269 left (service_role only), naming the roles.
--
-- THE EXISTING-ROW QUESTION. `/mcp` answers only a POST with a bearer token
-- (any other request is a 401 or a 405), and `/connector` itself is not a page
-- (only `/connector/authorize` is), so a short link named either, if
-- production has one, is reported and LEFT ALONE, exactly as 0269 did for
-- `feedback`: a short link named `mcp` would now be shadowed by the route, and
-- whether to re-issue it is a person's call with the notice in front of them.
--
-- VERIFICATION, rows not notices (paste after applying):
--   select s.slug, public._app_short_link_reserved(s.slug) as reserved
--   from (values ('connector'), ('mcp'), ('feedback'), ('open-lab')) as s(slug);
--   -- expect connector true, mcp true, feedback true, open-lab false
--
-- REVERSAL: re-paste 0269's definition of `_app_short_link_reserved` (its
-- thirty-eight names) with its grant block. This file wrote no data.

do $$
declare
	v_slug text;
	v_target text;
begin
	foreach v_slug in array array['connector', 'mcp'] loop
		select max(target) into v_target from public.app_short_links where slug = v_slug;
		if v_target is not null then
			raise notice '0271: a short link named "%" exists (target %). It is left in place; app_short_link_upsert will refuse to re-point it from now on.', v_slug, v_target;
		else
			raise notice '0271: no short link is named "%"; nothing to report.', v_slug;
		end if;
	end loop;
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
		'manifest.webmanifest', 'maps', 'mcp', 'notebook', 'push-sw.js', 'reference',
		'robots.txt', 'sitemap.xml', 'tools', 'tournaments', 'vanguard'
	);
$$;

revoke all on function public._app_short_link_reserved(text) from public, anon, authenticated;
grant execute on function public._app_short_link_reserved(text) to service_role;

do $$
declare
	v_count integer;
	v_bad text[] := array[]::text[];
begin
	if not public._app_short_link_reserved('connector') or not public._app_short_link_reserved('mcp') then
		v_bad := array_append(v_bad, 'connector or mcp is not reserved');
	end if;
	if not public._app_short_link_reserved('feedback') or not public._app_short_link_reserved('certifications') then
		v_bad := array_append(v_bad, 'a name the predicate held before is no longer reserved');
	end if;
	if public._app_short_link_reserved('open-lab') then
		v_bad := array_append(v_bad, 'the negative control open-lab is reserved');
	end if;
	select count(*) into v_count
	from pg_proc p,
		lateral regexp_matches(p.prosrc, '''([^'']*)''', 'g') as m
	where p.proname = '_app_short_link_reserved' and p.pronamespace = 'public'::regnamespace;
	if v_count <> 40 then
		v_bad := array_append(v_bad, ('the predicate has ' || v_count || ' literals instead of 40'));
	end if;
	if (select count(*) from pg_proc where proname = '_app_short_link_reserved' and pronamespace = 'public'::regnamespace) <> 1 then
		v_bad := array_append(v_bad, 'more than one overload of the predicate exists');
	end if;
	if has_function_privilege('anon', 'public._app_short_link_reserved(text)', 'execute')
		or has_function_privilege('authenticated', 'public._app_short_link_reserved(text)', 'execute') then
		v_bad := array_append(v_bad, 'a client role can execute the private predicate');
	end if;
	if array_length(v_bad, 1) is not null then
		raise exception '0271 self-check refused: %', array_to_string(v_bad, '; ');
	end if;
	raise notice '0271: the reserved-slug predicate has 40 names; connector and mcp are reserved; open-lab is not; one overload; no client role can execute it; no short link row was written.';
end
$$;
