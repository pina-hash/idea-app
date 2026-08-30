-- 0156_short_link_reserved_names.sql
--
-- Apply manually in the Supabase SQL editor, after 0154.
--
-- `_app_short_link_reserved` (0093) was a hand-typed list of 21 route names,
-- written the day the feature shipped and never revisited. The route tree has
-- moved on: eleven more top-level paths now answer before the `[shortlink]`
-- catch-all ever runs -- `a` and `b` (Foundry's bundle routes), `foundry`
-- itself, `fsp-pulse`, `fsp-tech-selection`, and six top-level entries under
-- `static/` (served ahead of routing entirely) -- `downloads`, `tools`,
-- `manifest.webmanifest`, `push-sw.js`, `robots.txt`, `sitemap.xml` (the last
-- of those a SvelteKit +server route rather than a static file, but it answers
-- the same way: before the catch-all is ever reached). A slug matching any of
-- them was accepted by app_short_link_upsert and is dead on arrival -- the real
-- route or asset wins and the short link never resolves.
--
-- Two names that WOULD collide are deliberately left OUT, because they cannot
-- actually be created: `_platform` starts with `_`, and `IDEA` (the static
-- folder) is uppercase -- both fail the slug shape check
-- (`^[a-z0-9][a-z0-9._-]{0,60}$`, enforced in this same function's caller
-- before the reserved check ever runs, and mirrored in the [shortlink] route
-- itself) before a reserved check could matter. Adding them here would be
-- dead code the shape guard already makes unreachable.
--
-- THE DRIFT ITSELF, FIXED: this file only redefines the predicate (same
-- signature, so no drop is needed -- see the signature trap in CLAUDE.md,
-- which does not apply here since no parameter changes). It does not touch
-- 0093's own text, which stays as the immutable applied record of what shipped
-- that day.
--
-- WHY THIS WILL DRIFT AGAIN OTHERWISE, AND WHAT STOPS IT: SQL cannot read the
-- filesystem, so this list can never be self-deriving. What makes the next
-- drift loud instead of silent is
-- tests/short-link-reserved-names.test.ts, which does two things no migration
-- can: (1) walks the real `src/routes` and `static` top-level entries at test
-- time and fails if any slug-shaped name among them is missing from
-- `RESERVED_SLUGS` in src/lib/short-links.ts -- so a route added six months
-- from now reddens the suite instead of waiting another year to be noticed;
-- and (2) reads this function's own `pg_proc.prosrc` back out of a real
-- database and asserts it names the exact same set as RESERVED_SLUGS -- so the
-- SQL list and the TypeScript mirror (which `ShortLinkManager.svelte`'s
-- client-side precheck reads) cannot quietly diverge from each other either.
--
-- WHAT ABOUT A SLUG ALREADY CREATED that collides with one of the eleven: the
-- do-block below reports any such row with RAISE NOTICE rather than touching
-- it. CLAUDE.md is explicit that an authored slug is a permanent contract and
-- a migration refuses rather than destroys -- a printed handout pointing at a
-- slug that vanished is worse than one pointing at a slug that has always been
-- dead. The row is left exactly as it is (it already 404s the same way it did
-- before this file, since the real route or asset was already winning); the
-- only behavioural change is that app_short_link_upsert will refuse to
-- re-point it going forward, which is correct -- an admin should not be able
-- to keep re-pointing a slug that can never resolve.

do $$
declare
	v_slug text;
	v_found boolean := false;
begin
	for v_slug in
		select slug
		from public.app_short_links
		where slug = any (array[
			'a', 'b', 'downloads', 'foundry', 'fsp-pulse', 'fsp-tech-selection',
			'manifest.webmanifest', 'push-sw.js', 'robots.txt', 'sitemap.xml', 'tools'
		])
		order by slug
	loop
		v_found := true;
		raise notice 'app_short_links: existing slug "%" newly collides with a real route or static asset. It is left in place unmodified -- it already could never resolve, since the real route/asset was already winning -- and app_short_link_upsert will refuse to re-point it from now on.', v_slug;
	end loop;

	if not v_found then
		raise notice 'app_short_links: no existing row collides with one of the eleven newly reserved names.';
	end if;
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
		'fsp-tech-selection', 'gauntlet', 'greenline', 'manifest.webmanifest',
		'notebook', 'push-sw.js', 'reference', 'robots.txt', 'sitemap.xml',
		'tools', 'tournaments', 'vanguard'
	);
$$;

revoke all on function public._app_short_link_reserved(text) from public;
