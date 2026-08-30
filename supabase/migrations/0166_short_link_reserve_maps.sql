-- 0166_short_link_reserve_maps.sql
--
-- Apply manually in the Supabase SQL editor, after 0165.
--
-- WHAT THIS DOES: adds exactly one name, `maps`, to
-- `_app_short_link_reserved`. IDEA Maps (0161-0165) is gaining a top-level
-- route at `src/routes/maps/`, which SvelteKit resolves ahead of the
-- `[shortlink]` catch-all -- so from the moment that route ships, a short link
-- with the slug `maps` can never be reached. 0156 wrote down why that matters:
-- accepting such a slug does not create a working link, it only misleads
-- whoever created it. The set below is 0156's own thirty-two names, taken from
-- that file's body rather than retyped from memory, plus `maps` in the same
-- alphabetical order (between `manifest.webmanifest` and `notebook`).
--
-- WHAT IT IS BASED ON: 0156_short_link_reserved_names.sql, whose shape this
-- file follows deliberately -- report first, then redefine the predicate in
-- place. Same signature, so no `drop function` is needed and the signature
-- trap in CLAUDE.md does not apply here (no parameter changes; a
-- `create or replace` at an unchanged argument list cannot leave a second
-- overload behind).
--
-- WHAT IT LEAVES ALONE: 0093's and 0156's own text, both immutable applied
-- records -- neither is edited to match this one. It does not touch
-- `app_short_links` data (see the report block below), `app_short_link_upsert`,
-- `app_short_link_target`, the table's grants or its policies, and it defines
-- nothing that the maps migrations 0161-0165 also define -- `maps` here is a
-- string inside one predicate's body and shares nothing with those files.
--
-- THE GRANT, AND WHY IT NAMES ROLES: 0156 (and 0093 before it) ended on a bare
-- `revoke all on function ... from public`, which on a hosted Supabase project
-- removes only the PUBLIC entry and leaves the direct `anon` and
-- `authenticated` grants the project's default privileges write into every new
-- function's ACL. `create or replace` over an EXISTING function preserves that
-- function's ACL, so on production this file inherits whatever 0137's sweep
-- left (anon and authenticated both revoked, service_role kept) and the bare
-- form would be a no-op either way. Stating the roles makes the end state
-- independent of how the function got here -- which is the whole point of the
-- rule in CLAUDE.md -- and covers the one case that would otherwise reopen it:
-- a database where this function does not yet exist, where `create or replace`
-- IS a create and the defaults do hand it a fresh `anon` grant.
-- `service_role` is granted back explicitly for the same reason: it is the one
-- role 0137 never touches, and after a blanket revoke it should still hold
-- what it held.
--
-- THE EXISTING-ROW QUESTION, WHICH IS WHY THE BLOCK BELOW REPORTS INSTEAD OF
-- DELETING: a short link with the slug `maps` may already exist in production,
-- created before `/maps/` was a route, and reserving the name does not remove
-- it. It cannot be checked from a working copy -- there is no way to query the
-- live project from the repo -- so the answer is printed at apply time, in the
-- SQL editor, for whoever runs this. It is left in place unmodified: an
-- authored slug is a permanent contract (CLAUDE.md), a migration refuses
-- rather than destroys, and deleting somebody's link silently is worse than
-- leaving a dead one. What changes for that row is only that
-- app_short_link_upsert will refuse to re-point it from now on, which is
-- correct -- an admin should not be able to keep re-pointing a slug that can
-- never resolve. Whether to retire it (`active = false`) or re-issue the
-- handout under a different slug is a decision for a person holding the notice
-- below, not for this file.

-- ---------------------------------------------------------------------------
-- The report. Read-only: it selects and raises, and writes nothing.
--
-- The array is the ONE name this file newly reserves, exactly as 0156 listed
-- only its own eleven -- restating all thirty-three here would be a second
-- copy of the set, in the same file as the first, which is the thing that
-- drifts. `slug` is the table's primary key, so at most one row can match;
-- the loop is shaped for a count anyway so the notice reads the same whether
-- the answer is none or one.
-- ---------------------------------------------------------------------------

do $$
declare
	k_newly_reserved constant text[] := array['maps'];
	r record;
	v_count integer := 0;
begin
	for r in
		select slug, target, active, label
		from public.app_short_links
		where slug = any (k_newly_reserved)
		order by slug
	loop
		v_count := v_count + 1;
		raise notice '0166: app_short_links row "%" now names a reserved slug. target=% active=% label=%. It is LEFT IN PLACE UNMODIFIED -- nothing here deletes or deactivates it -- but it can no longer resolve once /maps/ ships, and app_short_link_upsert will refuse to re-point it from now on. Retire it (active = false) or re-issue the printed handout under a different slug, deliberately, as a separate decision.',
			r.slug, r.target, r.active, coalesce(r.label, '(none)');
	end loop;

	raise notice '0166: % existing short link(s) hold a slug newly reserved by this file (of % name(s) added: %).',
		v_count, array_length(k_newly_reserved, 1), array_to_string(k_newly_reserved, ', ');
end;
$$;

-- ---------------------------------------------------------------------------
-- The predicate. 0156's thirty-two names, plus `maps`.
-- ---------------------------------------------------------------------------

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
		'maps', 'notebook', 'push-sw.js', 'reference', 'robots.txt',
		'sitemap.xml', 'tools', 'tournaments', 'vanguard'
	);
$$;

-- Named roles, per the header: the bare `from public` form does nothing about
-- the direct grants a hosted project's default privileges write.
-- `_app_short_link_reserved` is a private helper -- its only caller is
-- app_short_link_upsert, which is SECURITY DEFINER and so runs it as the
-- owner -- so neither anon nor authenticated needs to hold it. This is the
-- end state 0137 already put it in; restating it here keeps that true after a
-- replace.
revoke all on function public._app_short_link_reserved(text)
	from public, anon, authenticated;
grant execute on function public._app_short_link_reserved(text) to service_role;

-- ---------------------------------------------------------------------------
-- The self-check. 0131's convention, which 0156 predates: read the catalog
-- back rather than trust that the statements above ran. Raises, so a partial
-- apply cannot look like a clean one.
-- ---------------------------------------------------------------------------

do $$
declare
	v_reserved boolean;
	v_control boolean;
	v_anon boolean;
	v_authenticated boolean;
begin
	select public._app_short_link_reserved('maps') into v_reserved;
	select public._app_short_link_reserved('open-lab') into v_control;

	if not v_reserved then
		raise exception '0166: _app_short_link_reserved(''maps'') did not answer true after the redefinition.';
	end if;
	-- The positive control, so "everything is reserved" cannot pass as success.
	if v_control then
		raise exception '0166: _app_short_link_reserved(''open-lab'') answered true -- the predicate is refusing names it should accept.';
	end if;

	v_anon := has_function_privilege('anon', 'public._app_short_link_reserved(text)', 'execute');
	v_authenticated := has_function_privilege('authenticated', 'public._app_short_link_reserved(text)', 'execute');
	if v_anon or v_authenticated then
		raise exception '0166: _app_short_link_reserved is still executable by anon=% authenticated=% -- the revoke did not name the roles it needed to.',
			v_anon, v_authenticated;
	end if;

	raise notice '0166: reserved slug list is now 33 names (32 from 0156, plus "maps"); anon and authenticated hold no EXECUTE on the predicate; service_role does.';
end;
$$;
