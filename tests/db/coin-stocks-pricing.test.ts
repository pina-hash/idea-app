// tests/db/coin-stocks-pricing.test.ts
//
// THE STOCK MARKET (ledger 0402, migration 0279). Silent regressions guarded
// here: a close that quietly stops storing what made it, a missing day that
// quietly invents a price, a clamp that quietly lets a stock jump, an index
// that is not the mean, a fee computed wrong, a cap quietly exceeded, and a
// short sale. Each beside a control that would pass the wrong way.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser } from './harness';
import { openTodayForTrading, startCoinWorld, type CoinWorld, type Json } from './coin-market-world';

let w: CoinWorld;
let day: string; // a class day before today
let dayBefore: string; // the class day before that

async function close(stock: string, d: string): Promise<Json> {
	return w.scalar<Json>(`select public._coin_stock_close($1, $2::date) v`, [stock, d]);
}
async function closeRow(stock: string, d: string): Promise<Json> {
	const { rows } = await w.db.sql<Json>(`select * from public.coin_stock_closes where stock_id = $1 and day = $2::date`, [stock, d]);
	return rows[0];
}

beforeAll(async () => {
	w = await startCoinWorld();
	await openTodayForTrading(w);
	day = await w.scalar<string>(
		`select max(g)::date::text v from generate_series(public._coin_la_today() - 10, public._coin_la_today() - 1, interval '1 day') g
		 where public._coin_is_class_day(g::date)`
	);
	dayBefore = await w.scalar<string>(
		`select max(g)::date::text v from generate_series($1::date - 10, $1::date - 1, interval '1 day') g
		 where public._coin_is_class_day(g::date)`,
		[day]
	);
	await w.scalar(`select public._coin_stock_sync() v`);
	for (const s of [w.ana, w.ben, w.cal, w.dee]) await w.give(s.email, 100);
}, 600_000);

afterAll(async () => w?.db.stop());

describe('a close is made from recorded data and keeps its inputs', () => {
	test('one class stock per economy-on class', async () => {
		const ids = (await w.db.sql<{ id: string; ticker: string }>(`select id, ticker from public.coin_stocks where kind = 'class' order by ticker`)).rows;
		expect(ids.map((r) => r.id).sort()).toEqual([`class:${w.s1}`, `class:${w.s2}`].sort());
		expect(ids.map((r) => r.ticker)).toEqual(['IDEA1001', 'IDEA209H4']);
	});

	test('a class close stores earned, out-of, students and the formula version', async () => {
		const created = await w.rpc<Json>(
			w.teacher,
			`public.classroom_create_item('assignment', $1::uuid[], 'Bridge', 'Do it.', 50, null, null, true, '[]'::jsonb, false)`,
			[[w.s1]]
		);
		const item = created.item_id as string;
		const scores: [string, number][] = [
			[w.ana.email, 40],
			[w.ben.email, 30],
			[w.dee.email, 50]
		];
		for (const [email, score] of scores) {
			await w.db.sql(
				`insert into public.classroom_submissions (item_id, student_email, state, score, returned_at)
				 values ($1, $2, 'returned', $3, ($4::date + time '12:00') at time zone 'America/Los_Angeles')`,
				[item, email, score, day]
			);
		}
		const r = await close(`class:${w.s1}`, day);
		expect(r.carried).toBe(false);
		const row = await closeRow(`class:${w.s1}`, day);
		const inputs = row.inputs as Json;
		expect(Number(inputs.earned)).toBe(120);
		expect(Number(inputs.out_of)).toBe(150);
		expect(Number(inputs.students)).toBe(3);
		expect(Number(row.signal)).toBeCloseTo(0.8, 6);
		expect(row.formula_version).toBe('v1');
		// First close: the median is its own signal, so the price is the base.
		expect(Number(row.close)).toBe(10);
	});

	test('a day with no data carries the previous close and says why (fewer than three students)', async () => {
		// Block 4 has one student: never a price for one student's grades.
		const created = await w.rpc<Json>(
			w.cosso,
			`public.classroom_create_item('assignment', $1::uuid[], 'Gear', 'Do it.', 20, null, null, true, '[]'::jsonb, false)`,
			[[w.s2]]
		);
		await w.db.sql(
			`insert into public.classroom_submissions (item_id, student_email, state, score, returned_at)
			 values ($1, $2, 'returned', 18, ($3::date + time '12:00') at time zone 'America/Los_Angeles')`,
			[created.item_id, w.cal.email, day]
		);
		await w.db.sql(
			`insert into public.coin_stock_closes (stock_id, day, close, carried, inputs, formula_version) values ($1, $2::date, 12.5, false, '{}'::jsonb, 'v1')`,
			[`class:${w.s2}`, dayBefore]
		);
		const r = await close(`class:${w.s2}`, day);
		expect(r.carried).toBe(true);
		const row = await closeRow(`class:${w.s2}`, day);
		expect(Number(row.close)).toBe(12.5);
		expect(String(row.note)).toMatch(/Fewer than 3 students/);
		expect(row.signal).toBeNull();
	});

	test('the daily move is clamped to ten percent, and the ceiling holds', async () => {
		// History: a steady signal of one person a day.
		for (let k = 2; k <= 20; k++) {
			await w.db.sql(
				`insert into public.coin_stock_closes (stock_id, day, close, signal, carried, inputs, formula_version)
				 values ('gauntlet', $1::date - $2::integer, 10, 1, false, '{}'::jsonb, 'v1') on conflict do nothing`,
				[dayBefore, k]
			);
		}
		await w.db.sql(
			`insert into public.coin_stock_closes (stock_id, day, close, signal, carried, inputs, formula_version)
			 values ('gauntlet', $1::date, 10, 1, false, '{}'::jsonb, 'v1')`,
			[dayBefore]
		);
		// Then fourteen students submit on the day: the 7-day average is 2, twice the median.
		const ch = await w.scalar<string>(`insert into public.challenges (mode, title) values ('speedrun', 'Part A') returning id::text v`);
		for (let i = 0; i < 14; i++) {
			const u = await createUser(w.db, `g${i}@boscotech.net`, `G ${i}`);
			await w.db.sql(
				`insert into public.submissions (user_id, challenge_id, mode, created_at) values ($1, $2, 'speedrun', ($3::date + time '10:00') at time zone 'America/Los_Angeles')`,
				[u.id, ch, day]
			);
		}
		await close('gauntlet', day);
		const row = await closeRow('gauntlet', day);
		expect(Number(row.signal)).toBeCloseTo(2, 6);
		expect(Number(row.target)).toBeCloseTo(20, 2); // what it would have been
		expect(Number(row.close)).toBeCloseTo(11, 4); // what the clamp allowed
		expect(((row.inputs as Json).daily as Json[]).length).toBe(7);
		// The ceiling: with a ceiling of 10.5, the same day closes at 10.5.
		await w.db.sql(`delete from public.coin_stock_closes where stock_id = 'gauntlet' and day = $1::date`, [day]);
		await w.setting('stock_ceiling', 10.5);
		await close('gauntlet', day);
		expect(Number((await closeRow('gauntlet', day)).close)).toBe(10.5);
		await w.setting('stock_ceiling', 100);
	});

	test('the index is the equal-weighted mean of the day\'s member closes', async () => {
		await close('foundry', day);
		await w.scalar(`select public._coin_stock_close('idea', $1::date) v`, [day]);
		const members = (await w.db.sql<{ close: string }>(
			`select c.close::text from public.coin_stock_closes c join public.coin_stocks s on s.id = c.stock_id
			 where c.day = $1::date and s.kind <> 'index' and s.active`,
			[day]
		)).rows.map((r) => Number(r.close));
		expect(members.length).toBe(4);
		const mean = members.reduce((a, b) => a + b, 0) / members.length;
		const idx = await closeRow('idea', day);
		expect(Number(idx.close)).toBeCloseTo(mean, 3);
		expect(((idx.inputs as Json).members as Json[]).length).toBe(4);
	});
});

describe('trading with the house', () => {
	test('a buy: 2% fee, the rest in shares at the last close', async () => {
		const before = await w.balance(w.ana.email);
		const r = await w.rpc<Json>(w.ana, `public.coin_stock_buy('gauntlet', 10)`);
		expect(r.ok, JSON.stringify(r)).toBe(true);
		expect(Number(r.fee)).toBeCloseTo(0.2, 2);
		expect(Number(r.invested)).toBeCloseTo(9.8, 2);
		expect(Number(r.shares)).toBeCloseTo(9.8 / 10.5, 5);
		expect(await w.balance(w.ana.email)).toBeCloseTo(before - 10, 2);
	});

	test('no shorting: a sale for more than is held is refused; selling all closes the position', async () => {
		const short = await w.rpc<Json>(w.ana, `public.coin_stock_sell('gauntlet', 50, false)`);
		expect(short.reason).toBe('no_short');
		const none = await w.rpc<Json>(w.ben, `public.coin_stock_sell('gauntlet', 1, false)`);
		expect(none.reason).toBe('no_position');
		// The price rises to 11.55 before the sale: a logged gain for the house to pay.
		await w.db.sql(
			`insert into public.coin_stock_closes (stock_id, day, close, carried, inputs, formula_version) values ('gauntlet', public._coin_la_today(), 11.55, false, '{}'::jsonb, 'v1')
			 on conflict (stock_id, day) do update set close = excluded.close`
		);
		const before = await w.balance(w.ana.email);
		const sold = await w.rpc<Json>(w.ana, `public.coin_stock_sell('gauntlet', null, true)`);
		expect(sold.ok, JSON.stringify(sold)).toBe(true);
		const gross = Number(sold.gross);
		expect(Number(sold.fee)).toBeCloseTo(Math.round(gross * 2) / 100, 2);
		expect(Number(sold.pnl)).toBeCloseTo(gross - 9.8, 2);
		expect(await w.balance(w.ana.email)).toBeCloseTo(before + gross - Number(sold.fee), 2);
		const pos = await w.db.sql<{ shares: string; cost_basis: string }>(`select shares::text, cost_basis::text from public.coin_stock_positions where student_email = $1`, [w.ana.email]);
		expect(Number(pos.rows[0].shares)).toBe(0);
		expect(Number(pos.rows[0].cost_basis)).toBe(0);
	});

	test('at most 50 coins of cost basis in one stock', async () => {
		expect((await w.rpc<Json>(w.ben, `public.coin_stock_buy('foundry', 40)`)).ok).toBe(true);
		const over = await w.rpc<Json>(w.ben, `public.coin_stock_buy('foundry', 20)`);
		expect(over.reason).toBe('cap');
		// Control: up to the room left is allowed.
		const room = Number(over.room);
		expect(room).toBeGreaterThan(0);
		expect((await w.rpc<Json>(w.ben, `public.coin_stock_buy('foundry', $1::numeric)`, [Math.floor(room * 100) / 100])).ok).toBe(true);
	});

	test('a student in debt cannot buy but can always sell', async () => {
		await w.give(w.ben.email, -200);
		expect(await w.balance(w.ben.email)).toBeLessThan(0);
		expect((await w.rpc<Json>(w.ben, `public.coin_stock_buy('foundry', 1)`)).reason).toBe('in_debt');
		expect((await w.rpc<Json>(w.ben, `public.coin_stock_sell('foundry', 5, false)`)).ok).toBe(true);
	});

	test('the board and the public tile carry no address; the portfolio is not in the balance', async () => {
		const board = await w.rpc<Json>(w.dee, `public.coin_stocks_board()`);
		expect(JSON.stringify(board)).not.toMatch(/@boscotech/);
		expect((board.leaderboard as Json[]).length).toBeGreaterThan(0);
		const tile = await w.db.asAnon(async (q) => (await q<{ r: Json }>(`select public.coin_public_stocks() r`)).rows[0].r);
		expect(JSON.stringify(tile)).not.toMatch(/@boscotech/);
		expect((tile.stocks as Json[]).length).toBeGreaterThan(0);
		// Control: anon cannot read the board.
		expect(await w.refusal(w.db.asAnon((q) => q(`select public.coin_stocks_board()`)))).toMatch(/permission denied/);
	});

	test('the nightly run closes every class day once, oldest first, and a re-run writes nothing', async () => {
		await w.db.sql(`delete from public.coin_stock_closes where stock_id = 'foundry'`);
		const n1 = await w.scalar<number>(`select public._coin_stocks_nightly(0) v`);
		expect(n1).toBeGreaterThan(0);
		const n2 = await w.scalar<number>(`select public._coin_stocks_nightly(0) v`);
		expect(n2).toBe(0);
		const days = (await w.db.sql<{ day: string; ok: boolean }>(
			`select day::text, public._coin_is_class_day(day) ok from public.coin_stock_closes where stock_id = 'foundry' order by day`
		)).rows;
		expect(days.length).toBeGreaterThan(5);
		expect(days.every((d) => d.ok)).toBe(true);
	});
});
