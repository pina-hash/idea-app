-- 0052_greenline_economy.sql
-- GREENLINE Phase 7: Ignition Credits (IC), the GREENLINE-only currency, plus
-- the unlock ledger and purchase path. NOT the schoolwide IDEA Coin (which
-- still lives entirely in Google Sheets / Apps Script, per the scope
-- guardrails); IC is named in its spirit but is a separate, game-local wallet.
--
-- Integrity doctrine (the whole point of this migration):
--
--   1. EARNING IS SERVER-SIDE ONLY, in the same transaction as the race
--      result. greenline_submit_race_result (0049) is dropped and recreated
--      below: it now computes the award from the submitted result (placement +
--      a personal-best lap bonus) and credits the wallet inline. There is NO
--      "credit my wallet" RPC a client could call on its own; the only way IC
--      appears is a result insert. The result METRICS are still client-
--      reported (client-side game, no server sim — the 0049 trust model), but
--      the award MATH and the wallet write are never in client hands.
--
--   2. CREATIVE RUNS EARN NOTHING AND RANK NOWHERE. The new p_creative flag
--      (client-reported, same trust model) zeroes the award AND stores the row
--      with mode = 'creative', so the leaderboard RPC (which filters
--      mode = 'race') never ranks an unlocked-everything run. One flag, both
--      consequences, decided in one server-side place.
--
--   3. PURCHASES ARE ATOMIC. greenline_purchase_item locks the caller's
--      wallet row (SELECT ... FOR UPDATE), so two concurrent purchases (a
--      double-click firing two requests) serialize: the second sees the first
--      unlock and returns already_unlocked without charging. The unlocks
--      primary key is the structural backstop, and the balance CHECK
--      constraint makes a negative wallet impossible at the schema level.
--
--   4. PRICES ARE SERVER-AUTHORITATIVE. greenline_item_price is the ONE price
--      list the purchase RPC consults; the client never sends a price. The
--      client-side mirror (src/lib/greenline/economy.ts) exists for DISPLAY
--      only — if the two ever drift, the UI shows a stale label but the RPC
--      still charges the real price (a mislabel, never an exploit). Keep them
--      in sync in the same change (the tolerance-constant convention).
--
-- No client write grant on either table: wallets and unlocks are written only
-- by the two SECURITY DEFINER functions. Clients read their OWN rows (owner
-- RLS, the greenline_race_results pattern).
--
-- Apply manually in the Supabase SQL editor, after 0051.

-- ===========================================================================
-- 1. Wallets (one row per user, definer-write only)
-- ===========================================================================
create table if not exists public.greenline_wallets (
	user_id uuid primary key references auth.users (id) on delete cascade,
	-- Spendable Ignition Credits. The CHECK is the hard floor: no code path,
	-- present or future, can drive a wallet negative.
	balance integer not null default 0 check (balance >= 0),
	-- Total IC ever earned (never decremented by spending). Not surfaced yet;
	-- cheap to keep and useful for any future progression/stats display.
	lifetime_earned integer not null default 0,
	updated_at timestamptz not null default now()
);

revoke all on public.greenline_wallets from anon, authenticated;
grant select on public.greenline_wallets to authenticated;

alter table public.greenline_wallets enable row level security;

drop policy if exists "select own greenline wallet" on public.greenline_wallets;
create policy "select own greenline wallet"
	on public.greenline_wallets
	for select
	to authenticated
	using (user_id = (select auth.uid()));

-- No INSERT/UPDATE/DELETE policies: only the definer functions write.

-- ===========================================================================
-- 2. Unlocks (append-only ledger of purchased items, definer-write only)
-- ===========================================================================
create table if not exists public.greenline_unlocks (
	user_id uuid not null references auth.users (id) on delete cascade,
	-- Item id, free-form text (the track_id / archetype doctrine): part ids,
	-- weapon ids, and ability ids straight from the code catalogs; cosmetics
	-- namespaced as 'color:<id>' / 'pattern:<id>'. The catalog lives in code
	-- (economy.ts), so it can grow without a schema migration.
	item_id text not null,
	-- What was actually charged at purchase time (audit trail; prices may be
	-- rebalanced later without rewriting history).
	price_paid integer not null,
	created_at timestamptz not null default now(),
	primary key (user_id, item_id)
);

revoke all on public.greenline_unlocks from anon, authenticated;
grant select on public.greenline_unlocks to authenticated;

alter table public.greenline_unlocks enable row level security;

drop policy if exists "select own greenline unlocks" on public.greenline_unlocks;
create policy "select own greenline unlocks"
	on public.greenline_unlocks
	for select
	to authenticated
	using (user_id = (select auth.uid()));

-- No INSERT/UPDATE/DELETE policies: only the purchase RPC writes.

-- ===========================================================================
-- 3. The price list (server-authoritative; mirrored for display in
--    src/lib/greenline/economy.ts — keep the two in sync in the same change)
-- ===========================================================================
-- Tiering rationale:
--   - Starter kit is FREE and simply absent from this list (stock parts,
--     Autocannon, Nitro Boost, empty slots, every archetype, default livery,
--     the car number): a day-one player has a complete usable build.
--   - Bodywork parts: flat 250. Every part is a deliberate sidegrade (the
--     loadout.ts "NO strict upgrades" doctrine), so power-pricing within the
--     class would be false precision.
--   - Weapons price off mountCost, the game's own power proxy:
--     cost 1 -> 300, cost 2 -> 600, cost 3 -> 1000.
--   - Abilities price off slotCost the same way: cost 1 -> 300, cost 2 -> 600.
--   - Cosmetics are the cheap early goals: colors 100, patterns 150.
-- A typical race pays 50-160 IC (see the award constants below), so the first
-- color lands within a couple of races, the first part in three or four, and a
-- heavy weapon is a real save-up goal.
create or replace function public.greenline_item_price(p_item_id text)
returns integer
language sql
immutable
as $$
select case p_item_id
	-- Bodywork parts (flat 250; stock parts are free and absent)
	when 'plating-composite' then 250
	when 'plating-reactive' then 250
	when 'plating-stripped' then 250
	when 'drive-overbored' then 250
	when 'drive-slipstream' then 250
	when 'drive-hotintake' then 250
	when 'tires-slick' then 250
	when 'tires-terrain' then 250
	when 'tires-hardwall' then 250
	when 'sys-capacitor' then 250
	when 'sys-faraday' then 250
	when 'sys-targeting' then 250
	-- Weapons by mountCost (autocannon is the free starter and absent)
	when 'shotgun-burst' then 300
	when 'caltrops' then 300
	when 'radar-jammer' then 300
	when 'homing-rocket' then 600
	when 'auto-turret' then 600
	when 'deployable-blades' then 600
	when 'railgun' then 1000
	when 'cluster-missile' then 1000
	when 'energy-shield' then 1000
	-- Abilities by slotCost (nitro-boost is the free starter and absent)
	when 'jump-hop' then 300
	when 'emergency-flip' then 300
	when 'grip-surge' then 300
	when 'overcharge-repair' then 600
	-- Livery colors (the archetype-default "color" is free by absence)
	when 'color:steel' then 100
	when 'color:gunmetal' then 100
	when 'color:crimson' then 100
	when 'color:ember' then 100
	when 'color:sulfur' then 100
	when 'color:viper' then 100
	when 'color:azure' then 100
	when 'color:violet' then 100
	when 'color:bone' then 100
	when 'color:copper' then 100
	-- Livery patterns ('none' is free by absence)
	when 'pattern:stripe' then 150
	when 'pattern:twin' then 150
	when 'pattern:wedge' then 150
	when 'pattern:checker' then 150
	else null
end;
$$;

-- Server-internal: the purchase RPC (running as owner) resolves prices; the
-- client UI reads its own mirror. No client grant needed.
revoke all on function public.greenline_item_price(text) from public, anon, authenticated;

-- ===========================================================================
-- 4. Purchase path: atomic check-deduct-record
-- ===========================================================================
create or replace function public.greenline_purchase_item(p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_item text := trim(coalesce(p_item_id, ''));
	v_price integer;
	v_balance integer;
begin
	if v_uid is null then
		raise exception 'Not authenticated';
	end if;

	v_price := public.greenline_item_price(v_item);
	if v_price is null then
		-- Unknown OR free (starter) item: nothing to buy. Structured, not an
		-- exception, so the client can show a calm reason.
		return jsonb_build_object('ok', false, 'reason', 'unknown_item');
	end if;

	-- Make sure the wallet row exists, then LOCK it. The row lock is the whole
	-- concurrency story: a rapid double-click fires two requests, the second
	-- blocks here until the first commits, then sees the unlock below and
	-- returns without charging. No read-then-write window exists.
	insert into public.greenline_wallets (user_id)
	values (v_uid)
	on conflict (user_id) do nothing;

	select balance into v_balance
	from public.greenline_wallets
	where user_id = v_uid
	for update;

	if exists (
		select 1 from public.greenline_unlocks
		where user_id = v_uid and item_id = v_item
	) then
		return jsonb_build_object('ok', false, 'reason', 'already_unlocked', 'balance', v_balance);
	end if;

	if v_balance < v_price then
		return jsonb_build_object(
			'ok', false, 'reason', 'insufficient_funds',
			'balance', v_balance, 'price', v_price
		);
	end if;

	update public.greenline_wallets
	set balance = balance - v_price, updated_at = now()
	where user_id = v_uid;

	insert into public.greenline_unlocks (user_id, item_id, price_paid)
	values (v_uid, v_item, v_price);

	return jsonb_build_object(
		'ok', true, 'item_id', v_item, 'price', v_price, 'balance', v_balance - v_price
	);
end;
$$;

revoke all on function public.greenline_purchase_item(text) from public;
grant execute on function public.greenline_purchase_item(text) to authenticated;

-- ===========================================================================
-- 5. Result submission, reworked: award computed + credited in-transaction
-- ===========================================================================
-- The return type changes (uuid -> jsonb carrying the award breakdown), so the
-- 0049 function must be dropped, not replaced. p_creative gets a default, so a
-- pre-Phase-7 client calling the old seven-arg shape keeps working (award runs
-- as a normal ranked submit, exactly as before this migration).
drop function if exists public.greenline_submit_race_result(text, text, integer, integer, integer, integer, text);

create or replace function public.greenline_submit_race_result(
	p_track_id text,
	p_mode text default 'race',
	p_finish_position integer default null,
	p_total_time_ms integer default null,
	p_best_lap_ms integer default null,
	p_laps integer default null,
	p_archetype text default null,
	p_creative boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_track text;
	v_mode text := coalesce(nullif(trim(p_mode), ''), 'race');
	v_creative boolean := coalesce(p_creative, false);
	v_id uuid;
	v_prior_best integer;
	v_recent boolean := false;
	-- Award constants (SERVER copy governs; mirrored in economy.ts for the
	-- results-screen display). Placement pays finishing at all, more for the
	-- podium; the PB bonus pays beating your own prior best ranked lap on this
	-- track (a first-ever recorded lap IS a new personal best).
	c_award_p1 constant integer := 120;
	c_award_p2 constant integer := 90;
	c_award_p3 constant integer := 70;
	c_award_finish constant integer := 50;
	c_award_pb constant integer := 40;
	-- A real race takes minutes; two results from one player inside this window
	-- are a replayed/spammed submit, not two races. The run still logs, it just
	-- pays nothing (award throttle, not a rejection).
	c_award_min_gap constant interval := interval '30 seconds';
	v_placement integer := 0;
	v_pb integer := 0;
	v_award integer := 0;
	v_balance integer := null;
begin
	if v_uid is null then
		raise exception 'Not authenticated';
	end if;
	if p_track_id is null or length(trim(p_track_id)) = 0 then
		raise exception 'A track id is required';
	end if;
	v_track := trim(p_track_id);

	-- Creative runs are stored under mode 'creative': the append-only log keeps
	-- them, the leaderboard RPC (mode = 'race') never ranks them, and the
	-- prior-best baseline below never reads them.
	if v_creative then
		v_mode := 'creative';
	end if;

	if not v_creative then
		select min(r.best_lap_ms) into v_prior_best
		from public.greenline_race_results r
		where r.user_id = v_uid
			and r.track_id = v_track
			and r.mode = v_mode
			and r.best_lap_ms is not null;

		select exists (
			select 1 from public.greenline_race_results r
			where r.user_id = v_uid
				and r.created_at > now() - c_award_min_gap
		) into v_recent;
	end if;

	insert into public.greenline_race_results (
		user_id, track_id, mode, finish_position,
		total_time_ms, best_lap_ms, laps, archetype
	)
	values (
		v_uid, v_track, v_mode, p_finish_position,
		p_total_time_ms, p_best_lap_ms, p_laps, p_archetype
	)
	returning id into v_id;

	if not v_creative and not v_recent then
		if p_finish_position is not null and p_finish_position >= 1 then
			v_placement := case p_finish_position
				when 1 then c_award_p1
				when 2 then c_award_p2
				when 3 then c_award_p3
				else c_award_finish
			end;
		end if;
		if p_best_lap_ms is not null and p_best_lap_ms > 0
			and (v_prior_best is null or p_best_lap_ms < v_prior_best) then
			v_pb := c_award_pb;
		end if;
		v_award := v_placement + v_pb;

		if v_award > 0 then
			insert into public.greenline_wallets (user_id, balance, lifetime_earned, updated_at)
			values (v_uid, v_award, v_award, now())
			on conflict (user_id) do update
				set balance = public.greenline_wallets.balance + excluded.balance,
					lifetime_earned = public.greenline_wallets.lifetime_earned + excluded.lifetime_earned,
					updated_at = now();
		end if;
	end if;

	select w.balance into v_balance
	from public.greenline_wallets w
	where w.user_id = v_uid;

	return jsonb_build_object(
		'id', v_id,
		'awarded', v_award,
		'placement', v_placement,
		'pb_bonus', v_pb,
		'balance', v_balance,
		'creative', v_creative
	);
end;
$$;

revoke all on function public.greenline_submit_race_result(text, text, integer, integer, integer, integer, text, boolean) from public;
grant execute on function public.greenline_submit_race_result(text, text, integer, integer, integer, integer, text, boolean) to authenticated;
