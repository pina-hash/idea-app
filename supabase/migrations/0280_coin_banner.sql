-- 0279_coin_banner.sql
--
-- IDEA COIN LATER FEATURES, PART FIVE (ledger 0402, decision 70): THE IDEA
-- CLASSROOM HEADER BANNER.
--
-- Coin staff pin items to an animated banner under the IDEA Classroom header:
-- a featured listing, an official card (the tissue-box want-ad, Extra Credit),
-- a contract, or any page on this site. Each pin has an optional start and
-- end date and an optional class; the banner rotates through the pins that
-- apply, a click opens the item, and a student can put it away for the rest
-- of the day (in their own browser). Three looks are built; banner_style
-- picks one (a setting, default spotlight) until Mr. Pina chooses.
--
-- A pin naming a listing shows only while that listing is open.
--
-- UNDO: drop the functions this file creates and coin_banner_pins.

create table if not exists public.coin_banner_pins (
	id uuid primary key default gen_random_uuid(),
	kind text not null check (kind in ('listing', 'official', 'contract', 'shop', 'link')),
	listing_id uuid references public.coin_market_listings (id) on delete cascade,
	title text not null check (char_length(btrim(title)) between 2 and 80),
	subtitle text check (subtitle is null or char_length(subtitle) <= 140),
	href text not null check (href ~ '^/[^/\\]' and char_length(href) <= 300 and position('#' in href) = 0),
	starts_on date,
	ends_on date,
	section_id uuid references public.classroom_sections (id) on delete cascade,
	sort_order integer not null default 0,
	created_by text not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	removed_at timestamptz,
	check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index if not exists coin_banner_pins_live on public.coin_banner_pins (sort_order) where removed_at is null;
alter table public.coin_banner_pins enable row level security;
revoke all on table public.coin_banner_pins from public, anon, authenticated, service_role;

do $seed$
begin
	insert into public.coin_settings (key, value, updated_by) values ('banner_style', '"spotlight"'::jsonb, 'system')
	on conflict (key) do nothing;
end
$seed$;

create or replace function public._coin_banner_json(b public.coin_banner_pins)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select jsonb_build_object('id', b.id, 'kind', b.kind, 'listing_id', b.listing_id, 'title', b.title,
		'subtitle', b.subtitle, 'href', b.href, 'starts_on', b.starts_on, 'ends_on', b.ends_on,
		'section_id', b.section_id,
		'section', case when b.section_id is null then null else public._coin_classroom_section_label(b.section_id) end,
		'sort_order', b.sort_order,
		'price', (select l.price from public.coin_market_listings l where l.id = b.listing_id));
$$;
revoke all on function public._coin_banner_json(public.coin_banner_pins) from public, anon, authenticated, service_role;

-- What the banner shows in one class (or, with no class, the pins for every
-- class), for anyone signed in.
create or replace function public.coin_banner(p_section_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_today date := public._coin_la_today();
begin
	if (select auth.uid()) is null then
		return jsonb_build_object('style', null, 'pins', '[]'::jsonb);
	end if;
	return jsonb_build_object(
		'style', coalesce(public._coin_setting('banner_style') #>> '{}', 'spotlight'),
		'pins', coalesce((select jsonb_agg(public._coin_banner_json(b) order by b.sort_order, b.created_at)
			from public.coin_banner_pins b
			where b.removed_at is null
				and (b.starts_on is null or b.starts_on <= v_today)
				and (b.ends_on is null or b.ends_on >= v_today)
				and (b.section_id is null or b.section_id = p_section_id)
				and (b.listing_id is null or public._coin_market_listing_open(b.listing_id)
					or exists (select 1 from public.coin_market_listings l where l.id = b.listing_id and l.zone = 'official'
						and l.closed_at is null and l.hidden_at is null and l.expires_at > now()))), '[]'::jsonb));
end;
$$;
revoke all on function public.coin_banner(uuid) from public, anon, authenticated, service_role;
grant execute on function public.coin_banner(uuid) to authenticated;

create or replace function public.coin_banner_admin()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can manage the banner.';
	end if;
	return jsonb_build_object(
		'style', coalesce(public._coin_setting('banner_style') #>> '{}', 'spotlight'),
		'pins', coalesce((select jsonb_agg(public._coin_banner_json(b) order by b.sort_order, b.created_at)
			from public.coin_banner_pins b
			where b.removed_at is null
				and (public._coin_full_staff() or public._coin_section_in_scope(b.section_id))), '[]'::jsonb));
end;
$$;
revoke all on function public.coin_banner_admin() from public, anon, authenticated, service_role;
grant execute on function public.coin_banner_admin() to authenticated;

-- Pin (p_id null) or change a pin. A pin for every class needs a full coin
-- admin; section staff pin to their own classes.
create or replace function public.coin_banner_save(
	p_id uuid,
	p_kind text,
	p_listing_id uuid,
	p_title text,
	p_subtitle text,
	p_href text,
	p_starts_on date,
	p_ends_on date,
	p_section_id uuid,
	p_sort_order integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_title text := btrim(coalesce(p_title, ''));
	v_href text := btrim(coalesce(p_href, ''));
	v_b public.coin_banner_pins;
	v_id uuid;
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can manage the banner.';
	end if;
	if p_section_id is null and not public._coin_full_staff() then
		return jsonb_build_object('ok', false, 'reason', 'full_admin_only');
	end if;
	if p_section_id is not null and not public._coin_section_in_scope(p_section_id) then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if p_kind is null or p_kind not in ('listing', 'official', 'contract', 'shop', 'link') then
		return jsonb_build_object('ok', false, 'reason', 'kind');
	end if;
	if char_length(v_title) not between 2 and 80 or char_length(coalesce(p_subtitle, '')) > 140 then
		return jsonb_build_object('ok', false, 'reason', 'title');
	end if;
	if v_href !~ '^/[^/\\]' or char_length(v_href) > 300 or position('#' in v_href) > 0 then
		return jsonb_build_object('ok', false, 'reason', 'href');
	end if;
	if p_ends_on is not null and p_starts_on is not null and p_ends_on < p_starts_on then
		return jsonb_build_object('ok', false, 'reason', 'dates');
	end if;
	if p_listing_id is not null and not exists (select 1 from public.coin_market_listings l where l.id = p_listing_id) then
		return jsonb_build_object('ok', false, 'reason', 'listing');
	end if;
	if p_id is null then
		insert into public.coin_banner_pins (kind, listing_id, title, subtitle, href, starts_on, ends_on, section_id,
			sort_order, created_by)
		values (p_kind, p_listing_id, v_title, nullif(btrim(coalesce(p_subtitle, '')), ''), v_href, p_starts_on, p_ends_on,
			p_section_id, coalesce(p_sort_order, 0), public.current_user_email())
		returning id into v_id;
		return jsonb_build_object('ok', true, 'pin_id', v_id, 'created', true);
	end if;
	select * into v_b from public.coin_banner_pins b where b.id = p_id and b.removed_at is null for update;
	if v_b.id is null or not (public._coin_full_staff() or public._coin_section_in_scope(v_b.section_id)) then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	update public.coin_banner_pins set kind = p_kind, listing_id = p_listing_id, title = v_title,
		subtitle = nullif(btrim(coalesce(p_subtitle, '')), ''), href = v_href, starts_on = p_starts_on, ends_on = p_ends_on,
		section_id = p_section_id, sort_order = coalesce(p_sort_order, 0), updated_at = now()
	where id = v_b.id;
	return jsonb_build_object('ok', true, 'pin_id', v_b.id, 'created', false);
end;
$$;
revoke all on function public.coin_banner_save(uuid, text, uuid, text, text, text, date, date, uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.coin_banner_save(uuid, text, uuid, text, text, text, date, date, uuid, integer) to authenticated;

create or replace function public.coin_banner_remove(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_b public.coin_banner_pins;
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can manage the banner.';
	end if;
	select * into v_b from public.coin_banner_pins b where b.id = p_id and b.removed_at is null for update;
	if v_b.id is null or not (public._coin_full_staff() or public._coin_section_in_scope(v_b.section_id)) then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	update public.coin_banner_pins set removed_at = now(), updated_at = now() where id = v_b.id;
	return jsonb_build_object('ok', true, 'pin_id', v_b.id);
end;
$$;
revoke all on function public.coin_banner_remove(uuid) from public, anon, authenticated, service_role;
grant execute on function public.coin_banner_remove(uuid) to authenticated;

do $chk$
declare
	r record;
	v_bad text[] := '{}';
begin
	for r in
		select p.oid::regprocedure::text as sig, p.proname
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and (p.proname like 'coin\_banner%' or p.proname like '\_coin\_banner%')
	loop
		if has_function_privilege('anon', r.sig, 'execute') then
			v_bad := array_append(v_bad, 'anon executes ' || r.sig);
		end if;
		if r.proname like '\_%' and has_function_privilege('authenticated', r.sig, 'execute') then
			v_bad := array_append(v_bad, 'a client role executes the private ' || r.sig);
		end if;
	end loop;
	if not public._coin_setting_ok('banner_style', '"ticker"'::jsonb) or public._coin_setting_ok('banner_style', '"neon"'::jsonb) then
		v_bad := array_append(v_bad, 'the banner style setting is not checked');
	end if;
	if array_length(v_bad, 1) is not null then
		raise exception '0280 self-check refused: %', array_to_string(v_bad, '; ');
	end if;
	raise notice '0280: the classroom header banner is in place.';
end
$chk$;
