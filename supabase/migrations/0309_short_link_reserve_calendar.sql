-- 0309_short_link_reserve_calendar.sql
--
-- Ledger 0439: one new top-level directory of the route tree, `calendar` (the
-- IDEA calendar at /calendar), so one new reserved short-link name.
--
-- WHAT THIS DOES: adds exactly that name to `_app_short_link_reserved`. The set
-- below is 0292's forty-four names, taken from that file's body, plus
-- `calendar` in alphabetical order: forty-five. The rule this predicate keeps
-- (0156 onward) is that every top-level name the site claims is refused as a
-- short link; `tests/short-link-reserved-names.test.ts` walks the route tree.
--
-- ADDITIVE. Same signature, so no `drop function` and no second overload. No
-- row of any table is written, moved or deleted.
--
-- THE EXISTING-ROW QUESTION, answered as 0292 answered it: a short link named
-- calendar would now be shadowed by the page and could never be reached, so if
-- one exists this file refuses and names it; renaming it is a person's call.
--
-- VERIFICATION, rows not notices (paste after applying):
--   select s.slug, public._app_short_link_reserved(s.slug) as reserved
--   from (values ('calendar'), ('open-lab')) as s(slug);
--   -- expect calendar true, open-lab false
--
-- REVERSAL: re-paste 0292's definition of `_app_short_link_reserved` (its
-- forty-four names) with its grant block. This file wrote no data.

do $$
declare
	v_taken text;
begin
	select string_agg(slug || ' (to ' || target || ')', ', ' order by slug) into v_taken
	from public.app_short_links where slug = 'calendar';
	if v_taken is not null then
		raise exception '0309: this short link is now shadowed by a page and could never be reached: %. Re-issue it under another name, then apply.', v_taken;
	end if;
	raise notice '0309: no short link is named calendar; nothing to move.';
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
		'calendar', 'certifications', 'classroom',
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
	if not public._app_short_link_reserved('calendar') or not public._app_short_link_reserved('coin') then
		v_bad := array_append(v_bad, 'calendar or coin is not reserved');
	end if;
	if public._app_short_link_reserved('open-lab') then
		v_bad := array_append(v_bad, 'the negative control open-lab is reserved');
	end if;
	select count(*) into v_count
	from pg_proc p,
		lateral regexp_matches(p.prosrc, '''([^'']*)''', 'g') as m
	where p.proname = '_app_short_link_reserved' and p.pronamespace = 'public'::regnamespace;
	if v_count <> 45 then
		v_bad := array_append(v_bad, ('the predicate has ' || v_count || ' literals instead of 45'));
	end if;
	if (select count(*) from pg_proc where proname = '_app_short_link_reserved' and pronamespace = 'public'::regnamespace) <> 1 then
		v_bad := array_append(v_bad, 'more than one overload of the predicate exists');
	end if;
	if has_function_privilege('anon', 'public._app_short_link_reserved(text)', 'execute')
		or has_function_privilege('authenticated', 'public._app_short_link_reserved(text)', 'execute') then
		v_bad := array_append(v_bad, 'a client role can execute the private predicate');
	end if;
	if array_length(v_bad, 1) is not null then
		raise exception '0309 self-check refused: %', array_to_string(v_bad, '; ');
	end if;
	raise notice '0309: the reserved-slug predicate has 45 names; calendar is reserved; open-lab is not; one overload; no client role can execute it.';
end
$$;
