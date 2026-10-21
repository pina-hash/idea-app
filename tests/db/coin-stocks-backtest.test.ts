// tests/db/coin-stocks-backtest.test.ts
//
// THE V2 PRICE RULE REPLAYED OVER EIGHT WEEKS (the relaunch, migration 0283).
// A seeded, deterministic eight weeks of school: two classes getting work back
// two or three times a week (one hard test in week five), a Foundry with a
// new game spiking in week six, and GAUNTLET submissions that dry up for a
// week. The market launches at 10 at the start of the window, and the REAL
// tick (`_coin_stocks_tick_at`) prices every stock hourly through each class
// day, as the minute job would, only less often. Nothing is backfilled: a
// tick sees only data recorded before its own moment.
//
// What it guards, silently otherwise: a launch-week cap a price slips past, a
// circuit breaker missing for a move that should have tripped it (or recorded
// for one that should not), and a class day with no price.
//
// `tools/coin-stock-backtest.mjs` runs this file with COIN_BACKTEST_OUT set,
// and the days are written there as CSV for docs/coin-economy/backtests/.

import { writeFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createUser, enrollStudent, type SeededUser } from './harness';
import { startCoinWorld, type CoinWorld, type Json } from './coin-market-world';

let w: CoinWorld;
let days: string[] = [];
/** The hours a class day is ticked at, Los Angeles time. */
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15];

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

	// The window replayed: eight weeks before today. The seeded school starts
	// ten days earlier, so the launch sees a full seven-day window, as
	// production's did (its data predates the market).
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
	// The launch: every stock at 10 at 7 a.m. on the window's first class day,
	// no history and no anchor (each anchors at its first real reading).
	await w.scalar(`select public._coin_stock_sync() v`);
	await w.db.sql(`delete from public.coin_stock_closes`);
	await w.db.sql(`delete from public.coin_stock_ticks`);
	await w.db.sql(`delete from public.coin_stock_halts`);
	await w.db.sql(
		`update public.coin_stocks set launched_at = ($1::date + time '07:00') at time zone 'America/Los_Angeles',
		 launch_price = 10, anchor_price = 10, anchor_signal = null`,
		[days[0]]
	);
	for (const day of days) {
		for (const h of HOURS) {
			await w.scalar(`select public._coin_stocks_tick_at(($1::date + make_time($2::integer, 0, 0)) at time zone 'America/Los_Angeles') v`, [day, h]);
		}
	}
}, 900_000);

afterAll(async () => w?.db.stop());

test('every stock has a price every class day; the ramp caps hold; every breaker matches a move that earned it', async () => {
	const rows = (
		await w.db.sql<Json>(
			`select c.stock_id, s.ticker, c.day::text, c.open::text, c.high::text, c.low::text, c.close::text, c.prev_close::text ref,
				public._coin_stock_phase(s.launched_at, c.computed_at) ->> 'phase' phase,
				(select count(*) from public.coin_stock_halts h where h.stock_id = c.stock_id and h.day = c.day)::int halts
			 from public.coin_stock_closes c join public.coin_stocks s on s.id = c.stock_id order by s.sort_order, s.ticker, c.day`
		)
	).rows;
	const stocks = [...new Set(rows.map((r) => String(r.ticker)))];
	expect(stocks.length).toBe(5); // the index, two classes, Foundry, GAUNTLET
	expect(days.length).toBeGreaterThanOrEqual(35);
	for (const t of stocks) expect(rows.filter((r) => r.ticker === t).length).toBe(days.length);

	// The ramp, tick by tick: never more than the week's cap from the day's reference.
	const ticks = (
		await w.db.sql<{ stock_id: string; price: string; ref: string; phase: string; cap: string | null; day: string }>(
			`select stock_id, price::text, ref_price::text ref, phase, cap_percent::text cap, day::text from public.coin_stock_ticks`
		)
	).rows;
	const moved = (t: { price: string; ref: string }) => (Math.abs(Number(t.price) - Number(t.ref)) / Number(t.ref)) * 100;
	const ramp = ticks.filter((t) => t.phase === 'ramp');
	const open = ticks.filter((t) => t.phase === 'open');
	expect(ramp.length).toBeGreaterThan(20);
	expect(open.length).toBeGreaterThan(20);
	expect([...new Set(ramp.map((t) => Number(t.cap)))].sort((a, b) => a - b)).toEqual([5, 10, 15, 25]);
	for (const t of ramp) expect(moved(t), `${t.stock_id} ${t.day}`).toBeLessThanOrEqual(Number(t.cap) + 0.01);
	// Positive control: some price pressed against its cap, or the check above
	// passed over prices that never tried to move that far.
	expect(ramp.some((t) => Math.abs(moved(t) - Number(t.cap)) < 0.01)).toBe(true);

	// The breakers: after the ramp, a move of 10% from the reference means a
	// level-1 halt that day, and every halt was earned by its move.
	const halts = (
		await w.db.sql<{ stock_id: string; day: string; level: number; move: string }>(
			`select stock_id, day::text, level, move_percent::text move from public.coin_stock_halts`
		)
	).rows;
	for (const t of open) {
		if (moved(t) >= 10) expect(halts.some((h) => h.stock_id === t.stock_id && h.day === t.day && h.level === 1), `${t.stock_id} ${t.day}`).toBe(true);
	}
	for (const h of halts) expect(Math.abs(Number(h.move))).toBeGreaterThanOrEqual([10, 20, 30][h.level - 1]);
	expect(ramp.every((t) => !halts.some((h) => h.stock_id === t.stock_id && h.day === t.day))).toBe(true);

	// Positive control: the run is not flat.
	for (const t of stocks) {
		const closes = rows.filter((r) => r.ticker === t).map((r) => Number(r.close));
		expect(Math.max(...closes) - Math.min(...closes), t).toBeGreaterThan(0.05);
	}

	const out = process.env.COIN_BACKTEST_OUT;
	if (out) {
		const csv = ['stock,ticker,day,close,open,high,low,ref,phase,halts'];
		for (const r of rows) csv.push([r.stock_id, r.ticker, r.day, r.close, r.open, r.high, r.low, r.ref, r.phase, r.halts].join(','));
		writeFileSync(out, csv.join('\n') + '\n');
	}
});
