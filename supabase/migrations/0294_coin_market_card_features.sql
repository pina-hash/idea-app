-- 0294_coin_market_card_features.sql
--
-- EVERY IDEA MARKET CARD CAN BE FEATURED OR UNFEATURED (ledger 0425, connector
-- gap 8020d662, Mr. Pina 2026-10-19: "Can you feature the tissue box stuff and
-- unfeature everything else? I mean on the market.").
--
-- 0290 gave staff the list of market LISTINGS with feature and unfeature. The
-- tissue box cards are not listings: they are want-ads (coin_donation_items,
-- 0245), drawn by the market page beside the shop's own tiles, the open
-- contracts and the desktop background card. None of those had a featured
-- state in the database; the page hard-coded it (contracts always featured,
-- everything else never). So:
--
--   * coin_market_card_features -- one row per card staff have switched,
--     keyed by the market page's own tile key (shop:eating_pass,
--     shop:extra_credit, shop:pay_raise, shop:print, background,
--     donation:<id>, contract:<id>). No row means the page's old default,
--     so nothing on the live page moves until somebody switches it.
--   * coin_market_card_features() -- the switched states, for any signed-in
--     reader (the market page draws from it). It names cards only, never a
--     person.
--   * coin_market_cards_admin() -- coin staff: EVERY card on the market
--     (official cards, want-ads, contracts, shop tiles, the background card,
--     students' listings) with its card id and whether it is featured.
--   * coin_market_card_set_featured(card, featured) -- coin staff: feature or
--     unfeature one card. A listing or official card goes through
--     coin_market_listing_staff (0290), its own scope rule unchanged; every
--     other card is a full coin admin's, because it shows in every class.
--   * coin_market_cards_feature_only(cards) -- a full coin admin: feature
--     exactly these and unfeature every other card, in one call. An unknown
--     card refuses the whole call and writes nothing.
--
-- ADDITIVE, NO ORDERING (CLAUDE.md, DEPLOY ORDERING): new names only. The
-- page reads the switches best effort, so a deploy before this file draws
-- the old defaults.
--
-- UNDO, a person's paste: drop the five functions this file creates and the
-- table coin_market_card_features. Listings switched through it keep their
-- featured_at, exactly as a switch on the Coin Desk leaves it.

-- THE FIRST OBJECT IS NEW (the apply probe reads the first created object).
create table if not exists public.coin_market_card_features (
	card text primary key check (
		card in ('shop:eating_pass', 'shop:extra_credit', 'shop:pay_raise', 'shop:print', 'background')
		or card ~ '^(donation|contract):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
	),
	featured boolean not null,
	set_by text not null,
	set_at timestamptz not null default now()
);
alter table public.coin_market_card_features enable row level security;
revoke all on table public.coin_market_card_features from public, anon, authenticated, service_role;

-- Whether a card that is not a listing names something on the market today:
-- one of the fixed shop tiles, the background card, an active want-ad or an
-- open contract. Private.
create or replace function public._coin_market_card_exists(p_card text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select case
		when p_card in ('shop:eating_pass', 'shop:extra_credit', 'shop:pay_raise', 'shop:print', 'background') then true
		when p_card ~ '^donation:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then exists (
			select 1 from public.coin_donation_items d where d.id = substr(p_card, 10)::uuid and d.active)
		when p_card ~ '^contract:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then exists (
			select 1 from public.coin_contracts c where c.id = substr(p_card, 10)::uuid
				and c.completed_at is null and c.cancelled_at is null)
		else false
	end;
$$;
revoke all on function public._coin_market_card_exists(text) from public, anon, authenticated, service_role;

-- The default a card shows with no switch: contracts featured, the rest not
-- (the market page's own rule before this file, src/lib/coin-market/official.ts).
create or replace function public._coin_market_card_default(p_card text)
returns boolean
language sql
immutable
set search_path = ''
as $$
	select p_card like 'contract:%';
$$;
revoke all on function public._coin_market_card_default(text) from public, anon, authenticated, service_role;

-- The switched cards, { card: featured }, for the market page.
create or replace function public.coin_market_card_features()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if (select auth.uid()) is null then
		return '{}'::jsonb;
	end if;
	return coalesce((select jsonb_object_agg(f.card, f.featured) from public.coin_market_card_features f), '{}'::jsonb);
end;
$$;
revoke all on function public.coin_market_card_features() from public, anon, authenticated, service_role;
grant execute on function public.coin_market_card_features() to authenticated;

-- Every card on the IDEA Market, for coin staff, with its card id and whether
-- it is featured. A section coin staff member sees the listings of their own
-- students and classes (0290's scope) and the shared cards marked can_set
-- false, since those are a full coin admin's to switch.
create or replace function public.coin_market_cards_admin()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_full boolean;
	v_out jsonb := '[]'::jsonb;
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can list every IDEA Market card.';
	end if;
	v_full := public._coin_full_staff();

	-- Official cards and students' listings, open only (0290's scope rule).
	v_out := v_out || coalesce((
		select jsonb_agg(jsonb_build_object(
			'card', (case when l.zone = 'official' then 'official:' else 'listing:' end) || l.id::text,
			'kind', case when l.zone = 'official' then 'official' else 'listing' end,
			'title', l.title,
			'detail', case when l.zone = 'official' then coalesce(public._coin_classroom_section_label(l.section_id), 'Every class')
				else (case when l.kind = 'request' then 'Request by ' else 'Offer by ' end) || coalesce(public._coin_student_name(l.owner_email), l.owner_email) end,
			'featured', l.featured_at is not null,
			'hidden', l.hidden_at is not null,
			'can_set', true
		) order by (l.zone = 'official') desc, l.created_at desc)
		from public.coin_market_listings l
		where l.closed_at is null
			and (l.zone = 'official' and (v_full or public._coin_section_in_scope(l.section_id))
				or l.zone = 'student' and public._coin_student_in_scope(l.owner_email))
	), '[]'::jsonb);

	-- Want-ads: the active items on the want list.
	v_out := v_out || coalesce((
		select jsonb_agg(jsonb_build_object(
			'card', 'donation:' || d.id::text, 'kind', 'donation', 'title', 'Wanted: ' || d.name,
			'detail', case when d.rate is null then 'Priced at approval' else 'Earn ' || rtrim(rtrim(d.rate::text, '0'), '.') || ' i¢' end,
			'featured', coalesce(f.featured, public._coin_market_card_default('donation:' || d.id::text)),
			'hidden', false, 'can_set', v_full
		) order by d.sort_order, d.name)
		from public.coin_donation_items d
		left join public.coin_market_card_features f on f.card = 'donation:' || d.id::text
		where d.active
	), '[]'::jsonb);

	-- Open contracts.
	v_out := v_out || coalesce((
		select jsonb_agg(jsonb_build_object(
			'card', 'contract:' || c.id::text, 'kind', 'contract', 'title', c.title,
			'detail', case when c.debt_only then 'Restitution job' else coalesce(public._coin_classroom_section_label(c.class_section_id), 'Every class') end,
			'featured', coalesce(f.featured, public._coin_market_card_default('contract:' || c.id::text)),
			'hidden', false, 'can_set', v_full
		) order by c.created_at desc)
		from public.coin_contracts c
		left join public.coin_market_card_features f on f.card = 'contract:' || c.id::text
		where c.completed_at is null and c.cancelled_at is null
	), '[]'::jsonb);

	-- The shop's own tiles and the background card.
	v_out := v_out || coalesce((
		select jsonb_agg(jsonb_build_object(
			'card', s.card, 'kind', case when s.card = 'background' then 'background' else 'shop' end,
			'title', s.title, 'detail', s.detail,
			'featured', coalesce(f.featured, public._coin_market_card_default(s.card)),
			'hidden', false, 'can_set', v_full
		) order by s.n)
		from (values
			(1, 'shop:eating_pass', 'Eating Pass', 'Coin shop'),
			(2, 'shop:extra_credit', 'Extra Credit', 'Coin shop'),
			(3, 'shop:pay_raise', 'Pay Raise', 'Coin shop'),
			(4, 'shop:print', '3D print', 'Coin shop, shown while printing is on'),
			(5, 'background', 'Desktop background', 'Make one for the class computers')
		) as s(n, card, title, detail)
		left join public.coin_market_card_features f on f.card = s.card
	), '[]'::jsonb);

	return v_out;
end;
$$;
revoke all on function public.coin_market_cards_admin() from public, anon, authenticated, service_role;
grant execute on function public.coin_market_cards_admin() to authenticated;

-- Feature or unfeature one card.
create or replace function public.coin_market_card_set_featured(p_card text, p_featured boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_card text := lower(btrim(coalesce(p_card, '')));
	v_was boolean;
	v_r jsonb;
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can feature IDEA Market cards.';
	end if;
	if p_featured is null then
		return jsonb_build_object('ok', false, 'reason', 'featured');
	end if;
	if v_card ~ '^(official|listing):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
		select l.featured_at is not null into v_was from public.coin_market_listings l
		where l.id = split_part(v_card, ':', 2)::uuid
			and l.zone = case when v_card like 'official:%' then 'official' else 'student' end;
		if v_was is null then
			return jsonb_build_object('ok', false, 'reason', 'not_found');
		end if;
		v_r := public.coin_market_listing_staff(split_part(v_card, ':', 2)::uuid,
			case when p_featured then 'feature' else 'unfeature' end, null);
		if (v_r ->> 'ok')::boolean is not true then
			return v_r;
		end if;
		return jsonb_build_object('ok', true, 'card', v_card, 'featured', p_featured, 'was', v_was);
	end if;
	if not public._coin_market_card_exists(v_card) then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if not public._coin_full_staff() then
		return jsonb_build_object('ok', false, 'reason', 'full_admin_only');
	end if;
	select coalesce((select f.featured from public.coin_market_card_features f where f.card = v_card),
		public._coin_market_card_default(v_card)) into v_was;
	insert into public.coin_market_card_features (card, featured, set_by, set_at)
	values (v_card, p_featured, public.current_user_email(), now())
	on conflict (card) do update set featured = excluded.featured, set_by = excluded.set_by, set_at = excluded.set_at;
	perform public._coin_audit('market_card:' || v_card, to_jsonb(v_was), to_jsonb(p_featured));
	return jsonb_build_object('ok', true, 'card', v_card, 'featured', p_featured, 'was', v_was);
end;
$$;
revoke all on function public.coin_market_card_set_featured(text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.coin_market_card_set_featured(text, boolean) to authenticated;

-- Feature exactly these cards and unfeature every other one. A full coin
-- admin's, since it touches cards shown in every class. Every card named is
-- checked before anything is written; one unknown card refuses the call.
create or replace function public.coin_market_cards_feature_only(p_cards text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_cards text[];
	v_card text;
	v_all jsonb;
	v_row jsonb;
	v_featured integer := 0;
	v_unfeatured integer := 0;
	v_r jsonb;
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can feature and unfeature every IDEA Market card at once.';
	end if;
	select coalesce(array_agg(distinct lower(btrim(c))), '{}') into v_cards
	from unnest(coalesce(p_cards, '{}'::text[])) c where btrim(coalesce(c, '')) <> '';

	v_all := public.coin_market_cards_admin();
	foreach v_card in array v_cards loop
		if not exists (select 1 from jsonb_array_elements(v_all) e where e ->> 'card' = v_card) then
			return jsonb_build_object('ok', false, 'reason', 'not_found', 'card', v_card);
		end if;
	end loop;

	for v_row in select e from jsonb_array_elements(v_all) e loop
		v_card := v_row ->> 'card';
		if (v_card = any (v_cards)) <> ((v_row ->> 'featured')::boolean) then
			v_r := public.coin_market_card_set_featured(v_card, v_card = any (v_cards));
			if (v_r ->> 'ok')::boolean is not true then
				raise exception 'IDEA Market card % could not be switched: %', v_card, coalesce(v_r ->> 'reason', 'refused');
			end if;
			if v_card = any (v_cards) then v_featured := v_featured + 1; else v_unfeatured := v_unfeatured + 1; end if;
		end if;
	end loop;
	return jsonb_build_object('ok', true, 'featured', v_featured, 'unfeatured', v_unfeatured,
		'cards', to_jsonb(v_cards));
end;
$$;
revoke all on function public.coin_market_cards_feature_only(text[]) from public, anon, authenticated, service_role;
grant execute on function public.coin_market_cards_feature_only(text[]) to authenticated;

-- The view-as guard (0288) goes on the new table now, not only at the next
-- view-as session.
do $$
declare
	v_n integer;
begin
	v_n := public._view_as_attach_guards();
	raise notice '0294: the view-as guard was put on % tables', v_n;
	raise notice '0294: % cards switched', (select count(*) from public.coin_market_card_features);
end;
$$;
