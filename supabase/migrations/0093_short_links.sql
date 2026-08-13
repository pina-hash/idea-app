-- 0093_short_links.sql
--
-- SITE-WIDE SHORT LINKS: /209h -> the IDEA209H digital syllabus.
--
-- Apply manually in the Supabase SQL editor, after 0092.
--
-- WHY A TABLE AND NOT A HARDCODED ROUTE. Printed material accumulates these --
-- a syllabus QR code, a handout, a poster -- and the TARGETS MOVE while the
-- printed sheet does not. A row that an admin can re-point is the whole point;
-- a route constant would mean a deploy every time a document is re-created, and
-- a dead QR code in the meantime.
--
-- FRAGMENTS SURVIVE, and that is a property of the redirect rather than of this
-- table: a fragment is never sent to the server, and a browser carries the
-- original URL's fragment onto a redirect target that has none of its own
-- (RFC 7231 section 7.1.2). So /209h#ai-policy lands on #ai-policy, and a
-- target here must NOT carry its own fragment or it would win.
--
-- WHO. Reading a slug's target is PUBLIC (anon-granted): the whole point is a
-- parent scanning a QR code with no account. Writing is ADMIN-ONLY (0067's
-- is_admin(), enforced INSIDE the function, never merely by a page gate), and
-- there is no client write grant on the table at all.
--
-- Targets are restricted to SAME-SITE PATHS (a leading single slash). An
-- open redirector -- ideabosco.com/x sending a visitor to an arbitrary host --
-- is a phishing primitive, and nothing this feature needs is outside our own
-- origin.

create table if not exists public.app_short_links (
	-- The printed path segment, lowercased. `209h` is the first.
	slug text primary key
		check (slug = lower(btrim(slug)) and slug ~ '^[a-z0-9][a-z0-9._-]{0,60}$'),
	-- A same-site path, always starting with a single slash and never carrying
	-- its own fragment (see the header).
	target text not null
		check (target ~ '^/[^/\\]' and target !~ '#' and char_length(target) <= 500),
	label text check (label is null or char_length(btrim(label)) between 1 and 120),
	-- Soft state, the archive-not-delete convention: a retired slug on a printed
	-- sheet should stop resolving without the row (and its history) vanishing.
	active boolean not null default true,
	created_by text not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

-- Reserved: a slug that shadows a real single-segment route would never be
-- reached anyway (SvelteKit resolves a static route ahead of a dynamic one), so
-- accepting one would only ever mislead whoever created it.
create or replace function public._app_short_link_reserved(p_slug text)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
	select p_slug in (
		'admin', 'api', 'archive', 'assignments', 'auth', 'classroom', 'coins',
		'coin-balance', 'coin-desk', 'coin-entry', 'contracts', 'dashboard',
		'dev', 'frc', 'fsp', 'gauntlet', 'greenline', 'notebook', 'reference',
		'tournaments', 'vanguard'
	);
$$;

revoke all on function public._app_short_link_reserved(text) from public;

-- ---------------------------------------------------------------------------
-- Reads.
-- ---------------------------------------------------------------------------

-- Public: resolve one slug. Returns only the target, and only while active --
-- no label, no author, no timestamps, and no way to enumerate the table.
create or replace function public.app_short_link_target(p_slug text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
	select l.target
	from public.app_short_links l
	where l.slug = lower(btrim(p_slug)) and l.active;
$$;

revoke all on function public.app_short_link_target(text) from public;
grant execute on function public.app_short_link_target(text) to anon, authenticated;

-- Admin: the whole table, for the management screen.
create or replace function public.app_short_link_list()
returns setof public.app_short_links
language sql
stable
security definer
set search_path = ''
as $$
	select * from public.app_short_links
	where public.is_admin()
	order by slug;
$$;

revoke all on function public.app_short_link_list() from public;
grant execute on function public.app_short_link_list() to authenticated;

-- ---------------------------------------------------------------------------
-- Writes. Admin-only, checked inside the function (the admin_grant doctrine);
-- the page's 404 is convenience.
-- ---------------------------------------------------------------------------

-- Create or re-point. One function for both, the notebook_admin_upsert_session
-- convention: re-pointing an existing slug is the operation this exists for.
create or replace function public.app_short_link_upsert(
	p_slug text,
	p_target text,
	p_label text default null,
	p_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_slug text := lower(btrim(coalesce(p_slug, '')));
	v_target text := btrim(coalesce(p_target, ''));
begin
	if not public.is_admin() then
		raise exception 'Only an admin can manage short links.';
	end if;
	if v_slug !~ '^[a-z0-9][a-z0-9._-]{0,60}$' then
		raise exception 'A slug is lowercase letters, digits, dots, dashes and underscores (up to 61 characters).';
	end if;
	if public._app_short_link_reserved(v_slug) then
		raise exception 'The slug "%" is a real page on this site and would never be reached.', v_slug;
	end if;
	if v_target !~ '^/[^/\\]' then
		raise exception 'A target must be a path on this site, starting with a single "/".';
	end if;
	if v_target ~ '#' then
		raise exception 'A target may not carry its own fragment -- the fragment a visitor scanned is what has to survive.';
	end if;

	insert into public.app_short_links (slug, target, label, active, created_by)
	values (v_slug, v_target, nullif(btrim(coalesce(p_label, '')), ''), coalesce(p_active, true),
		public.current_user_email())
	on conflict (slug) do update
		set target = excluded.target,
			label = excluded.label,
			active = excluded.active,
			updated_at = now();

	return jsonb_build_object('ok', true, 'slug', v_slug, 'target', v_target);
end;
$$;

revoke all on function public.app_short_link_upsert(text, text, text, boolean) from public;
grant execute on function public.app_short_link_upsert(text, text, text, boolean) to authenticated;

create or replace function public.app_short_link_delete(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_slug text := lower(btrim(coalesce(p_slug, '')));
begin
	if not public.is_admin() then
		raise exception 'Only an admin can manage short links.';
	end if;
	delete from public.app_short_links where slug = v_slug;
	return jsonb_build_object('ok', true, 'slug', v_slug);
end;
$$;

revoke all on function public.app_short_link_delete(text) from public;
grant execute on function public.app_short_link_delete(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges. No client write path; reads go through the two functions above.
-- ---------------------------------------------------------------------------

revoke all on public.app_short_links from anon, authenticated;
alter table public.app_short_links enable row level security;
-- No policy at all: nobody selects this table directly. app_short_link_target
-- and app_short_link_list are the only doors, and both are SECURITY DEFINER.
