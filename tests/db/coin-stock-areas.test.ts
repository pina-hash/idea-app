// tests/db/coin-stock-areas.test.ts
//
// ONE STOCK PER ACTIVE AREA OF THE SITE (migration 0287, reports 616b93c3 and
// f2aa1311). Every expected number is worked out by hand from the rows seeded
// here: an area's signal is each count this week over its own average week of
// the four before, each softened by 2, averaged.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser } from './harness';
import { startCoinWorld, type CoinWorld, type Json } from './coin-market-world';

let w: CoinWorld;
const signal = (area: string) => w.scalar<Json>(`select public._coin_stock_area_signal('${area}', now()) v`);

beforeAll(async () => {
	w = await startCoinWorld();
	const u = await createUser(w.db, 'reporter@boscotech.net', 'Rep Orter');
	// This week: five reports, none reviewed, none with a screenshot.
	for (let i = 0; i < 5; i++) {
		await w.db.sql(`insert into public.app_feedback (user_id, app, kind, message, created_at) values ($1, 'portal', 'idea', 'this week', now() - interval '1 day')`, [u.id]);
	}
	// The four weeks before: eight reports, two a week on average.
	for (let i = 0; i < 8; i++) {
		await w.db.sql(`insert into public.app_feedback (user_id, app, kind, message, created_at) values ($1, 'portal', 'bug', 'earlier', now() - interval '${10 + i * 3} days')`, [u.id]);
	}
}, 600_000);
afterAll(async () => w?.db.stop());

describe('the area stocks', () => {
	test('ten area stocks exist, each launched at the base price with no close yet', async () => {
		const { rows } = await w.db.sql<Json>(`select id, launch_price::text lp, launched_at from public.coin_stocks where kind = 'area' order by sort_order`);
		expect(rows.map((r) => r.id)).toEqual([
			'area:classroom', 'area:coin_desk', 'area:market', 'area:tournaments', 'area:armory',
			'area:certifications', 'area:maps', 'area:ideacad', 'area:notebook', 'area:feedback'
		]);
		for (const r of rows) {
			expect(Number(r.lp)).toBe(10);
			expect(r.launched_at).not.toBeNull();
		}
	});

	test('the feedback signal is the hand-worked 1.25 (positive control), from three recorded measures', async () => {
		const s = await signal('feedback');
		// sent (5+2)/(8/4+2)=1.75, reviewed (0+2)/(0+2)=1, screenshots 1; mean 1.25
		expect(s.has_data).toBe(true);
		expect(Number(s.signal)).toBeCloseTo(1.25, 5);
		const inputs = s.inputs as { metrics: { key: string; this_week: number; average_week: number }[] };
		expect(inputs.metrics.map((m) => m.key)).toEqual(['sent', 'reviewed', 'shots']);
		expect(inputs.metrics[0]).toMatchObject({ this_week: 5, average_week: 2 });
	});

	test('an area with almost no events has no reading and says why (negative control)', async () => {
		const s = await signal('maps');
		expect(s.has_data).toBe(false);
		expect(String(s.why_not)).toContain('Fewer than 8 events');
		expect((await signal('nonsense')).has_data).toBe(false);
	});

	test('every area answers without an error, and a tick prices the one with data and holds the rest', async () => {
		for (const a of ['classroom', 'coin_desk', 'market', 'tournaments', 'armory', 'certifications', 'maps', 'ideacad', 'notebook', 'feedback']) {
			expect(typeof (await signal(a)).has_data, a).toBe('boolean');
		}
		await w.scalar(`select public._coin_stocks_tick_at(now()) v`);
		const f = (await w.db.sql<Json>(`select anchor_signal::text a, anchor_price::text p from public.coin_stocks where id = 'area:feedback'`)).rows[0];
		// The first real reading becomes the anchor; the price is where it launched.
		expect(Number(f.a)).toBeCloseTo(1.25, 5);
		expect(Number(f.p)).toBe(10);
		const m = (await w.db.sql<Json>(`select anchor_signal a from public.coin_stocks where id = 'area:maps'`)).rows[0];
		expect(m.a).toBeNull();
	});

	test('the detail carries a volume and a trade count on each day', async () => {
		const u = await createUser(w.db, 'detail@boscotech.net', 'Det Ail');
		const d = await w.db.asUser(u.id, async (q) => (await q<{ r: { days: Json[] } }>(`select public.coin_stock_detail('area:feedback') as r`)).rows[0].r);
		expect(d.days.length).toBeGreaterThan(0);
		expect(d.days[0]).toHaveProperty('volume');
		expect(d.days[0]).toHaveProperty('trades');
	});
});
