-- 0269_short_link_reserve_feedback.sql
--
-- Ledger 0396, part 5: one feedback window, everywhere (reports 0fe82a80 and
-- 80bb4d23).
--
-- WHAT THIS DOES: adds exactly one name, `feedback`, to
-- `_app_short_link_reserved`. The feedback window's own page now lives at
-- `src/routes/feedback/embed/`, the page the IDEA Coin Ledger and the
-- assignment handouts open in a frame, so `feedback` is a top-level directory
-- of the route tree. The rule this predicate keeps (0156, 0166, 0215, 0231,
-- 0260) is that every top-level name the site claims is refused as a short
-- link, and `tests/short-link-reserved-names.test.ts` walks the route tree and
-- reddens on an unreserved one. The set below is 0260's own thirty-seven names,
-- taken from that file's body (its PART F), plus `feedback` in alphabetical
-- order between `downloads` and `foundry`: thirty-eight.
--
-- ADDITIVE. Same signature, so no `drop function` and no second overload (a
-- `create or replace` at an unchanged argument list cannot leave one behind).
-- No row of any table is written, moved or deleted, and no grant is narrowed:
-- the grant block below states the end state 0137 and every redefinition since
-- have left (service_role only), naming the roles so it holds even where this
-- function did not exist yet (the 0166 shape).
--
-- THE EXISTING-ROW QUESTION, ANSWERED DIFFERENTLY FROM 0215 AND 0260, AND WHY.
-- Those two MOVED a colliding short link to a new spelling, because the real
-- route shadowed it: `/ideacad` and `/certifications` are pages, so a link of
-- that name could never be reached again. `/feedback` is NOT a page -- only
-- `/feedback/embed` is -- so a short link named `feedback`, if production has
-- one, still resolves through the `[shortlink]` catch-all exactly as it did
-- (`app_short_link_target` never consults this predicate). Moving it would
-- break a working, possibly printed, link for nothing. So the row is LEFT
-- ALONE and only reported: what changes for it is that `app_short_link_upsert`
-- refuses to re-point it from now on, which an admin would see in the editor.
-- Whether to keep it or re-issue it is a person's call with the notice below
-- in front of them, never this file's.
--
-- VERIFICATION, rows not notices (paste after applying):
--   select s.slug, public._app_short_link_reserved(s.slug) as reserved
--   from (values ('feedback'), ('foundry'), ('open-lab')) as s(slug);
--   -- expect feedback true, foundry true, open-lab false
--   select slug, target, active from public.app_short_links where slug = 'feedback';
--   -- zero rows, or the one link this file reported and left in place
--
-- REVERSAL: re-paste 0260's PART F definition of `_app_short_link_reserved`
-- (its thirty-seven names) with its grant block. Nothing else to undo: this
-- file wrote no data.

do $$
declare
	v_existing integer;
	v_target text;
begin
	select count(*), max(target) into v_existing, v_target
	from public.app_short_links
	where slug = 'feedback';
	if v_existing > 0 then
		raise notice '0269: a short link named "feedback" exists (target %). It is left in place and still resolves, because /feedback itself is not a page; app_short_link_upsert will refuse to re-point it from now on.', v_target;
	else
		raise notice '0269: no short link is named "feedback"; nothing to report.';
	end if;
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
		'coin-balance', 'coin-desk', 'coin-entry', 'coins', 'contracts',
		'dashboard', 'dev', 'downloads', 'feedback', 'foundry', 'frc', 'fsp', 'fsp-pulse',
		'fsp-tech-selection', 'gauntlet', 'greenline', 'hx', 'ideacad',
		'manifest.webmanifest', 'maps', 'notebook', 'push-sw.js', 'reference',
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
	if not public._app_short_link_reserved('feedback') then
		v_bad := array_append(v_bad, 'feedback is not reserved');
	end if;
	if not public._app_short_link_reserved('foundry') or not public._app_short_link_reserved('certifications') then
		v_bad := array_append(v_bad, 'a name the predicate held before is no longer reserved');
	end if;
	if public._app_short_link_reserved('open-lab') then
		v_bad := array_append(v_bad, 'the negative control open-lab is reserved');
	end if;
	select count(*) into v_count
	from pg_proc p,
		lateral regexp_matches(p.prosrc, '''([^'']*)''', 'g') as m
	where p.proname = '_app_short_link_reserved' and p.pronamespace = 'public'::regnamespace;
	if v_count <> 38 then
		v_bad := array_append(v_bad, ('the predicate has ' || v_count || ' literals instead of 38'));
	end if;
	if (select count(*) from pg_proc where proname = '_app_short_link_reserved' and pronamespace = 'public'::regnamespace) <> 1 then
		v_bad := array_append(v_bad, 'more than one overload of the predicate exists');
	end if;
	if has_function_privilege('anon', 'public._app_short_link_reserved(text)', 'execute')
		or has_function_privilege('authenticated', 'public._app_short_link_reserved(text)', 'execute') then
		v_bad := array_append(v_bad, 'a client role can execute the private predicate');
	end if;
	if array_length(v_bad, 1) is not null then
		raise exception '0269 self-check refused: %', array_to_string(v_bad, '; ');
	end if;
	raise notice '0269: the reserved-slug predicate has 38 names; feedback is reserved; open-lab is not; one overload; no client role can execute it; no short link row was written.';
end
$$;
