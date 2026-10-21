// tests/db/coin-stocks-pricing.test.ts
//
// THE STOCK MARKET, FORMULA V2 (the relaunch, migration 0283). Silent
// regressions guarded here: a price that stops following its signal, a launch
// ramp that lets a stock move past the week's cap (or caps it after the ramp),
// a circuit breaker that does not trip or trips on a small move, a halt that
// lets a trade through, a tick that writes a row when nothing changed, an
// index that is not the mean of its members' moves, and the trading rules
// (fee, cap, no shorting, debt). Every expected price is worked out by hand
// from the seeded data and the owner's schedule (5, 10, 15, 25; halts at 10,
// 20, 30), never read back from the function under test.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser } from './harness';
import { openTodayForTrading, startCoinWorld, type CoinWorld, type Json } from './coin-market-world';

let w: CoinWorld;

const tickAt = (at = 'now()') => w.scalar<Json>(`select public._coin_stocks_tick_at(${at}) v`);
async function today(stock: string): Promise<Json> {
	const { rows } = await w.db.sql<Json>(`select * from public.coin_stock_closes where stock_id = $1 and day = public._coin_la_today()`, [stock]);
	return rows[0];
}
async function halts(stock: string): Promise<Json[]> {
	return (await w.db.sql<Json>(`select * from public.coin_stock_halts where stock_id = $1 order by level`, [stock])).rows;
}
/** Put a stock back to a clean launch at 10, launched `days` ago, with a given anchor signal. */
async function relaunch(stock: string, days: number, anchorSignal: number | null) {
	await w.db.sql(`delete from public.coin_stock_closes where stock_id = $1`, [stock]);
	await w.db.sql(`delete from public.coin_stock_ticks where stock_id = $1`, [stock]);
	await w.db.sql(`delete from public.coin_stock_halts where stock_id = $1`, [stock]);
	await w.db.sql(
		`update public.coin_stocks set launched_at = now() - make_interval(days => $2::integer), launch_price = 10, anchor_price = 10,
		 anchor_signal = $3::numeric where id = $1`,
		[stock, days, anchorSignal]
	);
}

beforeAll(async () => {
	w = await startCoinWorld();
	await openTodayForTrading(w);
	await w.scalar(`select public._coin_stock_sync() v`);
	for (const s of [w.ana, w.ben, w.cal, w.dee]) await w.give(s.email, 100);
	// GAUNTLET: fourteen people submitted an hour ago, so its signal is
	// fourteen person-days over seven days, 2.
	const ch = await w.scalar<string>(`insert into public.challenges (mode, title) values ('speedrun', 'Part A') returning id::text v`);
	for (let i = 0; i < 14; i++) {
		const u = await createUser(w.db, `g${i}@boscotech.net`, `G ${i}`);
		await w.db.sql(`insert into public.submissions (user_id, challenge_id, mode, created_at) values ($1, $2, 'speedrun', now() - interval '1 hour')`, [u.id, ch]);
	}
}, 600_000);

afterAll(async () => w?.db.stop());

describe('the launch the chain applied', () => {
	test('every stock has a launch, one launch row and one launch tick; nothing older', async () => {
		const { rows } = await w.db.sql<Json>(
			`select s.id, s.launched_at, s.launch_price::text lp,
				(select count(*) from public.coin_stock_closes c where c.stock_id = s.id)::int closes
			 from public.coin_stocks s where s.kind <> 'class' order by s.id`
		);
		expect(rows.map((r) => r.id)).toEqual(['foundry', 'gauntlet', 'idea']);
		for (const r of rows) {
			expect(r.launched_at).not.toBeNull();
			expect(Number(r.lp)).toBe(10); // no stock had a price, so the base
			expect(r.closes).toBe(1);
		}
	});

	test('one class stock per economy-on class, launched when it was made', async () => {
		const ids = (await w.db.sql<{ id: string; ticker: string; launched: boolean }>(
			`select id, ticker, launched_at is not null launched from public.coin_stocks where kind = 'class' order by ticker`
		)).rows;
		expect(ids.map((r) => r.id).sort()).toEqual([`class:${w.s1}`, `class:${w.s2}`].sort());
		expect(ids.map((r) => r.ticker)).toEqual(['IDEA1001', 'IDEA209H4']);
		expect(ids.every((r) => r.launched)).toBe(true);
	});
});

describe('a price follows its signal from the anchor', () => {
	test('a class: the first real reading anchors, then the price moves with the grade ratio, capped in week one', async () => {
		const stock = `class:${w.s1}`;
		await relaunch(stock, 1, null);
		const created = await w.rpc<Json>(
			w.teacher,
			`public.classroom_create_item('assignment', $1::uuid[], 'Bridge', 'Do it.', 50, null, null, true, '[]'::jsonb, false)`,
			[[w.s1]]
		);
		for (const [email, score] of [[w.ana.email, 40], [w.ben.email, 30], [w.dee.email, 50]] as const) {
			await w.db.sql(
				`insert into public.classroom_submissions (item_id, student_email, state, score, returned_at)
				 values ($1, $2, 'returned', $3, now() - interval '30 minutes')`,
				[created.item_id, email, score]
			);
		}
		await tickAt();
		const first = await today(stock);
		// 120 of 150: a ratio of 0.8, which becomes the anchor; the price stays 10.
		expect(Number(first.signal)).toBeCloseTo(0.8, 6);
		expect(Number(first.close)).toBe(10);
		expect(String(first.note)).toMatch(/First real reading/);
		expect(Number(await w.scalar(`select anchor_signal::text v from public.coin_stocks where id = $1`, [stock]))).toBeCloseTo(0.8, 6);
		const inputs = first.inputs as Json;
		expect(Number(inputs.earned)).toBe(120);
		expect(Number(inputs.out_of)).toBe(150);
		expect(Number(inputs.students)).toBe(3);

		// A second assignment, all three at 50 of 50: 270 of 300 is 0.9. The data
		// says 10 x 0.9 / 0.8 = 11.25; week one allows 5% from 10, so 10.50.
		const second = await w.rpc<Json>(
			w.teacher,
			`public.classroom_create_item('assignment', $1::uuid[], 'Truss', 'Do it.', 50, null, null, true, '[]'::jsonb, false)`,
			[[w.s1]]
		);
		for (const email of [w.ana.email, w.ben.email, w.dee.email]) {
			await w.db.sql(
				`insert into public.classroom_submissions (item_id, student_email, state, score, returned_at)
				 values ($1, $2, 'returned', 50, now() - interval '10 minutes')`,
				[second.item_id, email]
			);
		}
		await tickAt();
		const row = await today(stock);
		expect(Number(row.signal)).toBeCloseTo(0.9, 6);
		expect(Number(row.target)).toBeCloseTo(11.25, 4);
		expect(Number(row.close)).toBeCloseTo(10.5, 4);
		expect(String(row.note)).toMatch(/launch week 1/);
		expect(row.formula_version).toBe('v2');
		expect(Number(row.high)).toBeCloseTo(10.5, 4);
		expect(Number(row.low)).toBe(10);
		expect(Number(row.open)).toBe(10);
	});

	test('fewer than three students: the price holds and says why', async () => {
		const stock = `class:${w.s2}`;
		await relaunch(stock, 1, null);
		const created = await w.rpc<Json>(
			w.cosso,
			`public.classroom_create_item('assignment', $1::uuid[], 'Gear', 'Do it.', 20, null, null, true, '[]'::jsonb, false)`,
			[[w.s2]]
		);
		await w.db.sql(
			`insert into public.classroom_submissions (item_id, student_email, state, score, returned_at)
			 values ($1, $2, 'returned', 18, now() - interval '5 minutes')`,
			[created.item_id, w.cal.email]
		);
		await tickAt();
		const row = await today(stock);
		expect(row.carried).toBe(true);
		expect(Number(row.close)).toBe(10);
		expect(String(row.note)).toMatch(/Fewer than 3 students/);
		expect(row.signal).toBeNull();
	});

	test('a zero signal with no reading to compare holds the price', async () => {
		await relaunch('foundry', 1, null);
		await tickAt();
		const row = await today('foundry');
		expect(Number(row.signal)).toBe(0);
		expect(Number(row.close)).toBe(10);
		expect(row.carried).toBe(true);
		expect(String(row.note)).toMatch(/no earlier reading/);
	});
});

describe('the launch ramp, then the circuit breakers', () => {
	test('weeks one to four cap the day move at 5, 10, 15 and 25 percent; week five does not', async () => {
		// GAUNTLET's signal is 2 against an anchor of 1: the data says 20.
		const expected = [10.5, 11, 11.5, 12.5];
		for (let week = 1; week <= 4; week++) {
			await relaunch('gauntlet', (week - 1) * 7 + 1, 1);
			await tickAt();
			const row = await today('gauntlet');
			expect(Number(row.target), `week ${week}`).toBeCloseTo(20, 4);
			expect(Number(row.close), `week ${week}`).toBeCloseTo(expected[week - 1], 4);
			expect(await halts('gauntlet'), `no halt in the ramp, week ${week}`).toEqual([]);
		}
		await relaunch('gauntlet', 29, 1);
		await tickAt();
		const open = await today('gauntlet');
		expect(Number(open.close)).toBeCloseTo(20, 4);
		// A 100% move trips every level once: 15 minutes, 15 minutes, the rest of the day.
		const h = await halts('gauntlet');
		expect(h.map((x) => x.level)).toEqual([1, 2, 3]);
		const mins = (x: Json) => (new Date(String(x.ends_at)).getTime() - new Date(String(x.started_at)).getTime()) / 60000;
		expect(mins(h[0])).toBe(15);
		expect(mins(h[1])).toBe(15);
		const restOfDay = await w.scalar<boolean>(
			`select ends_at = ((public._coin_la_today() + 1)::timestamp at time zone 'America/Los_Angeles') v from public.coin_stock_halts where stock_id = 'gauntlet' and level = 3`
		);
		expect(restOfDay).toBe(true);
		// A second tick at the same price trips nothing again.
		await tickAt(`now() + interval '1 minute'`);
		expect((await halts('gauntlet')).length).toBe(3);
	});

	test('after the ramp a 5% move trips nothing, and a 12% move halts trading for 15 minutes', async () => {
		// Control: 10 x 2 / (2 / 1.05) = 10.50, a 5% move.
		await relaunch('gauntlet', 40, null);
		await w.db.sql(`update public.coin_stocks set anchor_signal = 2 / 1.05 where id = 'gauntlet'`);
		await tickAt();
		expect(Number((await today('gauntlet')).close)).toBeCloseTo(10.5, 4);
		expect(await halts('gauntlet')).toEqual([]);
		// A holding to try to sell during the halt, bought while trading is open.
		const bought = await w.rpc<Json>(w.dee, `public.coin_stock_buy('gauntlet', 5)`);
		expect(bought.ok, JSON.stringify(bought)).toBe(true);

		await relaunch('gauntlet', 40, null);
		await w.db.sql(`update public.coin_stocks set anchor_signal = 2 / 1.12 where id = 'gauntlet'`);
		await tickAt();
		expect(Number((await today('gauntlet')).close)).toBeCloseTo(11.2, 4);
		const h = await halts('gauntlet');
		expect(h.map((x) => x.level)).toEqual([1]);
		expect(Number(h[0].move_percent)).toBeCloseTo(12, 2);

		const buy = await w.rpc<Json>(w.ana, `public.coin_stock_buy('gauntlet', 5)`);
		expect(buy.ok).toBe(false);
		expect(buy.reason).toBe('halted');
		expect(buy.level).toBe(1);
		expect(buy.until).toBeTruthy();
		const sell = await w.rpc<Json>(w.dee, `public.coin_stock_sell('gauntlet', null, true)`);
		expect(sell.reason).toBe('halted');
		const board = await w.rpc<Json>(w.ana, `public.coin_stocks_board()`);
		const g = (board.stocks as Json[]).find((s) => s.id === 'gauntlet')!;
		expect((g.halt as Json).level).toBe(1);
		expect((g.phase as Json).phase).toBe('open');

		// The halt ends: trading opens again at the same price.
		await w.db.sql(`update public.coin_stock_halts set ends_at = now() - interval '1 second' where stock_id = 'gauntlet'`);
		const after = await w.rpc<Json>(w.ana, `public.coin_stock_buy('gauntlet', 5)`);
		expect(after.ok, JSON.stringify(after)).toBe(true);
		expect(Number(after.price)).toBeCloseTo(11.2, 4);
	});
});

describe('the tick', () => {
	test('a tick that changes nothing writes no price row', async () => {
		await relaunch('gauntlet', 2, 1);
		await tickAt();
		const n = async () => Number(await w.scalar(`select count(*)::text v from public.coin_stock_ticks where stock_id = 'gauntlet'`));
		const before = await n();
		expect(before).toBe(1);
		await tickAt(`now() + interval '1 minute'`);
		await tickAt(`now() + interval '2 minutes'`);
		expect(await n()).toBe(before);
	});

	test('the index is its launch price times the mean of its members\' moves', async () => {
		await tickAt();
		const members = (await w.db.sql<{ close: string; lp: string }>(
			`select c.close::text, s.launch_price::text lp from public.coin_stocks s
			 join lateral (select close from public.coin_stock_closes c where c.stock_id = s.id order by day desc limit 1) c on true
			 where s.active and s.kind <> 'index'`
		)).rows;
		expect(members.length).toBe(4);
		const mean = members.reduce((a, m) => a + Number(m.close) / Number(m.lp), 0) / members.length;
		const idx = await today('idea');
		const launch = Number(await w.scalar(`select anchor_price::text v from public.coin_stocks where id = 'idea'`));
		// The index is in its own ramp too, so the expected price is capped the same way.
		const phase = await w.scalar<Json>(`select public._coin_stock_phase(launched_at, now()) v from public.coin_stocks where id = 'idea'`);
		const cap = Number(phase.cap_percent) / 100;
		const ref = Number(idx.prev_close);
		const want = Math.min(Math.max(launch * mean, ref * (1 - cap)), ref * (1 + cap));
		expect(Number(idx.target)).toBeCloseTo(launch * mean, 3);
		expect(Number(idx.close)).toBeCloseTo(want, 3);
		expect(((idx.inputs as Json).members as Json[]).length).toBe(4);
	});

	test('the throttled tick runs once in thirty seconds, and never on a day with no class', async () => {
		await w.db.sql(`update public.coin_stock_state set last_tick_at = now() - interval '1 hour'`);
		const first = await w.scalar<Json>(`select public._coin_stocks_tick('test') v`);
		expect(first.ran).toBe(true);
		const second = await w.scalar<Json>(`select public._coin_stocks_tick('test') v`);
		expect(second).toMatchObject({ ran: false, reason: 'recent' });
		await w.setting('no_class_days', [await w.scalar<string>(`select public._coin_la_today()::text v`)]);
		const closed = await w.scalar<Json>(`select public._coin_stocks_tick('test') v`);
		expect(closed).toMatchObject({ ran: false, reason: 'closed' });
		await w.setting('no_class_days', []);
		// The page's call answers counts only, and anon cannot make it.
		const page = await w.rpc<Json>(w.ana, `public.coin_stocks_tick()`);
		expect(Object.keys(page).sort()).toEqual(['changed', 'halts', 'ran', 'reason']);
		expect(await w.refusal(w.db.asAnon((q) => q(`select public.coin_stocks_tick()`)))).toMatch(/permission denied/);
	});
});

describe('trading with the house', () => {
	test('a buy: 2% fee, the rest in shares at the current price', async () => {
		await relaunch('foundry', 3, null);
		await tickAt();
		const before = await w.balance(w.ana.email);
		const r = await w.rpc<Json>(w.ana, `public.coin_stock_buy('foundry', 10)`);
		expect(r.ok, JSON.stringify(r)).toBe(true);
		expect(Number(r.fee)).toBeCloseTo(0.2, 2);
		expect(Number(r.invested)).toBeCloseTo(9.8, 2);
		expect(Number(r.shares)).toBeCloseTo(0.98, 5);
		expect(await w.balance(w.ana.email)).toBeCloseTo(before - 10, 2);
	});

	test('no shorting: a sale for more than is held is refused; selling all closes the position', async () => {
		const short = await w.rpc<Json>(w.ana, `public.coin_stock_sell('foundry', 50, false)`);
		expect(short.reason).toBe('no_short');
		const none = await w.rpc<Json>(w.cal, `public.coin_stock_sell('foundry', 1, false)`);
		expect(none.reason).toBe('no_position');
		// The price is 11 when she sells: a logged gain for the house to pay.
		await w.db.sql(`update public.coin_stock_closes set close = 11 where stock_id = 'foundry' and day = public._coin_la_today()`);
		const before = await w.balance(w.ana.email);
		const sold = await w.rpc<Json>(w.ana, `public.coin_stock_sell('foundry', null, true)`);
		expect(sold.ok, JSON.stringify(sold)).toBe(true);
		expect(Number(sold.gross)).toBeCloseTo(10.78, 2);
		expect(Number(sold.fee)).toBeCloseTo(0.22, 2);
		expect(Number(sold.pnl)).toBeCloseTo(0.98, 2);
		expect(await w.balance(w.ana.email)).toBeCloseTo(before + 10.78 - 0.22, 2);
		const pos = await w.db.sql<{ shares: string; cost_basis: string }>(
			`select shares::text, cost_basis::text from public.coin_stock_positions where student_email = $1 and stock_id = 'foundry'`,
			[w.ana.email]
		);
		expect(Number(pos.rows[0].shares)).toBe(0);
		expect(Number(pos.rows[0].cost_basis)).toBe(0);
	});

	test('at most 50 coins of cost basis in one stock', async () => {
		expect((await w.rpc<Json>(w.ben, `public.coin_stock_buy('foundry', 40)`)).ok).toBe(true);
		const over = await w.rpc<Json>(w.ben, `public.coin_stock_buy('foundry', 20)`);
		expect(over.reason).toBe('cap');
		const room = Number(over.room);
		expect(room).toBeGreaterThan(0);
		expect((await w.rpc<Json>(w.ben, `public.coin_stock_buy('foundry', $1::numeric)`, [Math.floor(room * 100) / 100])).ok).toBe(true);
	});

	test('a student in debt cannot buy but can sell', async () => {
		await w.give(w.ben.email, -200);
		expect(await w.balance(w.ben.email)).toBeLessThan(0);
		expect((await w.rpc<Json>(w.ben, `public.coin_stock_buy('foundry', 1)`)).reason).toBe('in_debt');
		expect((await w.rpc<Json>(w.ben, `public.coin_stock_sell('foundry', 5, false)`)).ok).toBe(true);
	});

	test('the board carries the rule and no address; the public tile is prices only', async () => {
		const board = await w.rpc<Json>(w.dee, `public.coin_stocks_board()`);
		expect(JSON.stringify(board)).not.toMatch(/@boscotech/);
		const rules = board.rules as Json;
		expect((rules.ramp as Json[]).map((r) => r.cap_percent)).toEqual([5, 10, 15, 25]);
		expect((rules.halts as Json[]).map((r) => [r.move_percent, r.minutes])).toEqual([[10, 15], [20, 15], [30, null]]);
		expect(rules.fee_percent).toBe(2);
		expect(board.launched_at).toBeTruthy();
		const stock = (board.stocks as Json[])[0];
		expect(stock.kind).toBe('index');
		expect(Array.isArray(stock.series)).toBe(true);
		const tile = await w.db.asAnon(async (q) => (await q<{ r: Json }>(`select public.coin_public_stocks() r`)).rows[0].r);
		expect(JSON.stringify(tile)).not.toMatch(/@boscotech/);
		expect((tile.stocks as Json[]).length).toBeGreaterThan(0);
		expect(await w.refusal(w.db.asAnon((q) => q(`select public.coin_stocks_board()`)))).toMatch(/permission denied/);
	});

	test('one stock\'s page shows its days and every price change with its inputs', async () => {
		const d = await w.rpc<Json>(w.ana, `public.coin_stock_detail('gauntlet')`);
		expect(d.ok).toBe(true);
		expect((d.days as Json[]).length).toBeGreaterThan(0);
		const ticks = d.ticks as Json[];
		expect(ticks.length).toBeGreaterThan(0);
		expect(Number((ticks[0].inputs as Json).person_days)).toBe(14);
		expect((d.launch as Json).price).toBeTruthy();
	});
});
