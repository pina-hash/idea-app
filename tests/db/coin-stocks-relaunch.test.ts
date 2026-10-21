// tests/db/coin-stocks-relaunch.test.ts
//
// THE RELAUNCH OVER REAL PRE-MIGRATION DATA (migration 0283). The chain is
// booted short of 0283; the market is seeded through the REAL 0279 functions
// (the v1 nightly backfill writes weeks of closes, students buy at the v1
// price); then 0283 is applied over the top, and applied again.
//
// What would be silent otherwise: a relaunch that moves a student's holdings
// or their value, that leaves a fabricated close behind (a chart that does not
// start at the launch), that throws away the trade record, that launches at a
// price other than the one the stock had, that jumps on its first tick, or a
// second paste that deletes the history the market has made since.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { createUser } from './harness';
import { WITH_V2, v2Sql } from './chain-coin-v2';
import { openTodayForTrading, startCoinWorld, type CoinWorld, type Json } from './coin-market-world';

const FILE = '0283_coin_stocks_relaunch.sql';
const PRE = WITH_V2.filter((f) => !(/^\d{4}_/.test(f) && f >= FILE.slice(0, 4)));

let w: CoinWorld;
type Snapshot = {
	prices: Record<string, number>;
	closes: Record<string, number>;
	positions: { email: string; stock: string; shares: string; basis: string }[];
	portfolios: Record<string, string>;
	trades: number;
};
let before: Snapshot;

async function snapshot(): Promise<Snapshot> {
	const prices: Record<string, number> = {};
	const closes: Record<string, number> = {};
	for (const r of (
		await w.db.sql<{ id: string; close: string | null; n: number }>(
			`select s.id, (select c.close::text from public.coin_stock_closes c where c.stock_id = s.id order by c.day desc limit 1) close,
				(select count(*) from public.coin_stock_closes c where c.stock_id = s.id)::int n
			 from public.coin_stocks s order by s.id`
		)
	).rows) {
		prices[r.id] = Number(r.close);
		closes[r.id] = r.n;
	}
	const positions = (
		await w.db.sql<{ email: string; stock: string; shares: string; basis: string }>(
			`select student_email email, stock_id stock, shares::text, cost_basis::text basis from public.coin_stock_positions order by 1, 2`
		)
	).rows;
	const portfolios: Record<string, string> = {};
	for (const s of [w.ana, w.ben, w.dee, w.eve]) {
		portfolios[s.email] = await w.scalar<string>(`select (public._coin_portfolio($1) ->> 'value') v`, [s.email]);
	}
	const trades = Number(await w.scalar(`select count(*)::text v from public.coin_stock_trades`));
	return { prices, closes, positions, portfolios, trades };
}

beforeAll(async () => {
	w = await startCoinWorld(PRE);
	await openTodayForTrading(w);
	for (const s of [w.ana, w.ben, w.dee, w.eve]) await w.give(s.email, 100);

	// Three weeks of GAUNTLET and Foundry activity, uneven, so the v1 backfill
	// makes prices that move.
	const ch = await w.scalar<string>(`insert into public.challenges (mode, title) values ('speedrun', 'Seed') returning id::text v`);
	const app = await w.scalar<string>(
		`insert into public.student_apps (owner, slug, title, build_notes) values ($1, 'seed-game', 'Seed Game', 'x') returning id::text v`,
		[w.ana.id]
	);
	const people = [];
	for (let i = 0; i < 12; i++) people.push(await createUser(w.db, `r${i}@boscotech.net`, `R ${i}`));
	for (let d = 1; d <= 21; d++) {
		const g = 2 + ((d * 7) % 9);
		const f = 1 + ((d * 5) % 7);
		for (const u of people.slice(0, g)) {
			await w.db.sql(
				`insert into public.submissions (user_id, challenge_id, mode, created_at)
				 values ($1, $2, 'speedrun', ((public._coin_la_today() - $3::integer) + time '10:00') at time zone 'America/Los_Angeles')`,
				[u.id, ch, d]
			);
		}
		for (const u of people.slice(0, f)) {
			await w.db.sql(
				`insert into public.student_app_plays (app_id, player, started_at, last_seen_at)
				 values ($1, $2, ((public._coin_la_today() - $3::integer) + time '12:00') at time zone 'America/Los_Angeles',
					((public._coin_la_today() - $3::integer) + time '12:10') at time zone 'America/Los_Angeles')`,
				[app, u.id, d]
			);
		}
	}
	// The v1 nightly backfill, exactly as production ran it.
	const n = await w.scalar<number>(`select public._coin_stocks_nightly(0) v`);
	expect(n).toBeGreaterThan(20);
	// Students buy at the v1 price.
	for (const [s, stock, c] of [
		[w.ana, 'gauntlet', 20],
		[w.ben, 'gauntlet', 7.5],
		[w.ben, 'foundry', 12],
		[w.dee, 'idea', 30],
		[w.eve, 'foundry', 3]
	] as const) {
		const r = await w.rpc<Json>(s, `public.coin_stock_buy($1, $2::numeric)`, [stock, c]);
		expect(r.ok, JSON.stringify(r)).toBe(true);
	}
	// A partial sale, so a trade of each side is on record.
	expect((await w.rpc<Json>(w.ben, `public.coin_stock_sell('gauntlet', 2, false)`)).ok).toBe(true);
	before = await snapshot();
	await w.db.sql(v2Sql(FILE));
}, 900_000);

afterAll(async () => w?.db.stop());

test('the seeded market really had weeks of history and moving prices before the relaunch', () => {
	expect(before.closes.gauntlet).toBeGreaterThan(10);
	expect(before.closes.foundry).toBeGreaterThan(10);
	expect(before.positions.length).toBe(5);
	expect(new Set(Object.values(before.prices).map((p) => p.toFixed(4))).size).toBeGreaterThan(1);
});

test('each stock launches at the price it had, with one launch row and one tick, and nothing older', async () => {
	const { rows } = await w.db.sql<{ id: string; lp: string; launched: boolean; closes: number; ticks: number; day_ok: boolean }>(
		`select s.id, s.launch_price::text lp, s.launched_at is not null launched,
			(select count(*) from public.coin_stock_closes c where c.stock_id = s.id)::int closes,
			(select count(*) from public.coin_stock_ticks t where t.stock_id = s.id)::int ticks,
			coalesce((select bool_and(c.day = public._coin_la_today()) from public.coin_stock_closes c where c.stock_id = s.id), false) day_ok
		 from public.coin_stocks s order by s.id`
	);
	expect(rows.length).toBe(5); // the index, Foundry, GAUNTLET and the two classes
	for (const r of rows) {
		expect(Number(r.lp), r.id).toBeCloseTo(before.prices[r.id], 4);
		expect(r.launched).toBe(true);
		expect(r.closes, `${r.id} closes`).toBe(1);
		expect(r.ticks, `${r.id} ticks`).toBe(1);
		expect(r.day_ok).toBe(true);
	}
});

test('holdings, cost basis and every portfolio value are unchanged; trades are kept', async () => {
	const after = await snapshot();
	expect(after.positions).toEqual(before.positions);
	expect(after.portfolios).toEqual(before.portfolios);
	expect(after.trades).toBe(before.trades);
	const rel = (await w.db.sql<{ vb: string; va: string; n: number }>(
		`select sum(value_before)::text vb, sum(value_after)::text va, count(*)::int n from public.coin_stock_relaunch`
	)).rows[0];
	expect(rel.n).toBe(5);
	expect(Number(rel.vb)).toBeGreaterThan(0);
	expect(rel.va).toBe(rel.vb);
});

test('the first tick after the launch does not jump, and the words students read are reworded', async () => {
	await w.db.sql(`update public.coin_stock_state set last_tick_at = now() - interval '1 hour'`);
	const r = await w.scalar<Json>(`select public._coin_stocks_tick('test') v`);
	expect(r.ran).toBe(true);
	const { rows } = await w.db.sql<{ id: string; close: string; lp: string }>(
		`select s.id, c.close::text, s.launch_price::text lp from public.coin_stocks s
		 join public.coin_stock_closes c on c.stock_id = s.id and c.day = public._coin_la_today()`
	);
	for (const x of rows) expect(Number(x.close), x.id).toBeCloseTo(Number(x.lp), 4);
	const words = await w.scalar<string>(`select explanation v from public.coin_categories where id = 'stock_fee'`);
	expect(words).toMatch(/about every minute/);
	expect(words).not.toMatch(/once a class day/);
});

test('a second paste deletes nothing and launches nothing again', async () => {
	// The market made a change since the launch: a price row for tomorrow's test.
	await w.db.sql(
		`insert into public.coin_stock_ticks (stock_id, at, day, price, phase, inputs, formula_version)
		 values ('gauntlet', now() + interval '1 minute', public._coin_la_today(), 12.34, 'ramp', '{}'::jsonb, 'v2')`
	);
	const launched = await w.scalar<string>(`select launched_at::text v from public.coin_stocks where id = 'gauntlet'`);
	const ticks = Number(await w.scalar(`select count(*)::text v from public.coin_stock_ticks`));
	await w.db.sql(v2Sql(FILE));
	expect(await w.scalar<string>(`select launched_at::text v from public.coin_stocks where id = 'gauntlet'`)).toBe(launched);
	expect(Number(await w.scalar(`select count(*)::text v from public.coin_stock_ticks`))).toBe(ticks);
	expect((await snapshot()).positions).toEqual(before.positions);
});
