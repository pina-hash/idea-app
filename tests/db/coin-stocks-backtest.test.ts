// tests/db/coin-stocks-backtest.test.ts
//
// THE STOCK FORMULA REPLAYED OVER EIGHT WEEKS (ledger 0402, migration 0279).
// A seeded, deterministic eight weeks of school: two classes getting work back
// two or three times a week (one hard test in week five), a Foundry with a
// new game spiking in week six, and GAUNTLET submissions that dry up for a
// week. The REAL nightly run (`_coin_stocks_nightly`) then makes every close,
// exactly as production would on its first night with eight weeks of history.
//
// What it guards, silently otherwise: a formula or a default that pins a stock
// to its floor or its ceiling under ordinary school data (a price stuck at 1
// or at 100 tells nobody anything), and a class day with no close.
//
// `tools/coin-stock-backtest.mjs` runs this file with COIN_BACKTEST_OUT set,
// and the closes are written there as CSV for docs/coin-economy/backtests/.

import { writeFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createUser, enrollStudent, type SeededUser } from './harness';
import { startCoinWorld, type CoinWorld, type Json } from './coin-market-world';

let w: CoinWorld;
let days: string[] = [];

/** A small deterministic generator, so the run is the same every time. */
function rng(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

beforeAll(async () => {
	w = await startCoinWorld();
	const rand = rng(5669);
	const longAgo = new Date(Date.now() - 90 * 86400000).toISOString();
	const block1: SeededUser[] = [w.ana, w.ben, w.dee, w.eve];
	const block4: SeededUser[] = [w.cal];
	for (let i = 0; i < 14; i++) {
		const u = await createUser(w.db, `b1s${i}@boscotech.net`, `B1 Student ${i}`);
		await enrollStudent(w.db, { as: w.owner, sectionId: w.s1, email: u.email, displayName: `B1 ${i}`, createdAt: longAgo });
		block1.push(u);
	}
	for (let i = 0; i < 11; i++) {
		const u = await createUser(w.db, `b4s${i}@boscotech.net`, `B4 Student ${i}`);
		await enrollStudent(w.db, { as: w.owner, sectionId: w.s2, email: u.email, displayName: `B4 ${i}`, createdAt: longAgo });
		block4.push(u);
	}
	const everyone = [...block1, ...block4];

	// The window the nightly run backfills: eight weeks before today. The
	// seeded school starts ten days earlier, so the first closes see a full
	// seven-day window, as production will (its data predates the market).
	const classDays = async (from: number) =>
		(
			await w.db.sql<{ d: string }>(
				`select g::date::text d from generate_series(public._coin_la_today() - $1::integer, public._coin_la_today() - 1, interval '1 day') g
				 where public._coin_is_class_day(g::date) order by 1`,
				[from]
			)
		).rows.map((r) => r.d);
	days = await classDays(56);
	const seeded = await classDays(66);
	const lead = seeded.length - days.length;

	const app = await w.scalar<string>(
		`insert into public.student_apps (owner, slug, title, build_notes) values ($1, 'backtest-game', 'Backtest Game', 'x') returning id::text v`,
		[w.ana.id]
	);
	const challenge = await w.scalar<string>(`insert into public.challenges (mode, title) values ('speedrun', 'Backtest part') returning id::text v`);

	for (let j = 0; j < seeded.length; j++) {
		const day = seeded[j];
		const i = j - lead; // the class-day index inside the window, negative before it
		const week = i < 0 ? -1 : Math.floor(i / 5);
		// Work comes back two or three days a week in each class.
		for (const [section, roster, teacher, mean] of [
			[w.s1, block1, w.teacher, 0.82],
			[w.s2, block4, w.cosso, 0.76]
		] as const) {
			if (rand() > 0.55) continue;
			const hard = section === w.s1 && week === 4; // a hard test in week five
			const created = await w.rpc<Json>(
				teacher,
				`public.classroom_create_item('assignment', $1::uuid[], $2, 'Do it.', 20, null, null, true, '[]'::jsonb, false)`,
				[[section], `Work ${j}`]
			);
			for (const s of roster) {
				const ratio = Math.max(0, Math.min(1, (hard ? 0.58 : mean) + (rand() - 0.5) * 0.3));
				await w.db.sql(
					`insert into public.classroom_submissions (item_id, student_email, state, score, returned_at)
					 values ($1, $2, 'returned', $3, ($4::date + time '14:00') at time zone 'America/Los_Angeles')`,
					[created.item_id, s.email, Math.round(ratio * 20), day]
				);
			}
		}
		// Foundry: four to ten people a day, eighteen the week a new game lands.
		const foundryPeople = week === 5 ? 18 : 4 + Math.floor(rand() * 7);
		for (const u of everyone.slice(0, foundryPeople)) {
			await w.db.sql(
				`insert into public.student_app_plays (app_id, player, started_at, last_seen_at)
				 values ($1, $2, ($3::date + time '12:30') at time zone 'America/Los_Angeles', ($3::date + time '12:40') at time zone 'America/Los_Angeles')`,
				[app, u.id, day]
			);
		}
		// GAUNTLET: three to twelve people a day, nobody in week four.
		const gauntletPeople = week === 3 ? 0 : 3 + Math.floor(rand() * 10);
		for (const u of everyone.slice(0, gauntletPeople)) {
			await w.db.sql(
				`insert into public.submissions (user_id, challenge_id, mode, created_at) values ($1, $2, 'speedrun', ($3::date + time '10:00') at time zone 'America/Los_Angeles')`,
				[u.id, challenge, day]
			);
		}
	}
	await w.scalar(`select public._coin_stocks_nightly(0) v`);
}, 900_000);

afterAll(async () => w?.db.stop());

test('every stock closes on every class day of the eight weeks, and none sits at its floor or ceiling', async () => {
	const rows = (
		await w.db.sql<{ stock_id: string; ticker: string; day: string; close: string; signal: string | null; median: string | null; target: string | null; carried: boolean; note: string | null }>(
			`select c.stock_id, s.ticker, c.day::text, c.close::text, c.signal::text, c.median::text, c.target::text, c.carried, c.note
			 from public.coin_stock_closes c join public.coin_stocks s on s.id = c.stock_id order by s.sort_order, s.ticker, c.day`
		)
	).rows;
	const stocks = [...new Set(rows.map((r) => r.ticker))];
	expect(stocks.length).toBe(5); // the index, two classes, Foundry, GAUNTLET
	expect(days.length).toBeGreaterThanOrEqual(35);
	for (const t of stocks) expect(rows.filter((r) => r.ticker === t).length).toBe(days.length);

	const floor = Number(await w.scalar(`select (public._coin_setting('stock_floor') #>> '{}') v`));
	const ceiling = Number(await w.scalar(`select (public._coin_setting('stock_ceiling') #>> '{}') v`));
	const hits = rows.filter((r) => Number(r.close) <= floor || Number(r.close) >= ceiling);
	expect(hits).toEqual([]);

	// Positive control: the run is not flat. Each stock moved on some day, and
	// the dry GAUNTLET week carried the price rather than inventing one.
	for (const t of stocks) {
		const closes = rows.filter((r) => r.ticker === t).map((r) => Number(r.close));
		expect(Math.max(...closes) - Math.min(...closes)).toBeGreaterThan(0.05);
	}
	const gauntlet = rows.filter((r) => r.stock_id === 'gauntlet');
	expect(gauntlet.some((r) => Number(r.signal) === 0 || r.carried)).toBe(true);

	const out = process.env.COIN_BACKTEST_OUT;
	if (out) {
		const csv = ['stock,ticker,day,close,signal,median,target,carried,note'];
		for (const r of rows) {
			csv.push(
				[r.stock_id, r.ticker, r.day, r.close, r.signal ?? '', r.median ?? '', r.target ?? '', r.carried, JSON.stringify(r.note ?? '')].join(',')
			);
		}
		writeFileSync(out, csv.join('\n') + '\n');
	}
});
