// tests/db/coin-market-conservation.test.ts
//
// COINS ARE CONSERVED (ledger 0402, decision 70). A seeded random walk of
// every new student action -- listings, claims, delivery, confirmation,
// cancellation, disputes and every staff outcome, public and private
// transfers, hall pass time, stock buys and sales -- after which
//
//   sum of every balance + coins in escrow + stock positions at cost
//
// has changed by EXACTLY the logged sinks and faucets: the three fees, the
// hall pass time bought, the staff seeding, and the gains and losses the
// house paid on stock sales. A mint or a leak anywhere fails it. The planted
// control is a rogue escrow release with no order behind it, which the same
// arithmetic must catch, and then must stop catching once it is gone.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { openTodayForTrading, startCoinWorld, type CoinWorld, type Json } from './coin-market-world';
import type { SeededUser } from './harness';

let w: CoinWorld;
let students: SeededUser[];

const LOGGED = ['market_fee', 'coin_transfer_private_fee', 'stock_fee', 'hall_pass_minutes', 'balance_correction'];

async function total(): Promise<number> {
	return Number(
		await w.scalar(`select (
			(select coalesce(sum(amount), 0) from public.coin_transactions where medium = 'digital')
			+ (select coalesce(sum(amount), 0) from public.coin_market_orders where status in ('held', 'delivered', 'disputed'))
			+ (select coalesce(sum(cost_basis), 0) from public.coin_stock_positions))::text v`)
	);
}
async function logged(): Promise<number> {
	return Number(
		await w.scalar(
			`select (
				(select coalesce(sum(amount), 0) from public.coin_transactions where medium = 'digital' and category_id = any($1::text[]))
				+ (select coalesce(sum(pnl), 0) from public.coin_stock_trades where side = 'sell'))::text v`,
			[LOGGED]
		)
	);
}

// A small seeded generator, so a failure replays exactly.
function rng(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

beforeAll(async () => {
	w = await startCoinWorld();
	await openTodayForTrading(w);
	students = [w.ana, w.ben, w.cal, w.dee, w.eve];
	for (const s of students) {
		await w.give(s.email, 30);
		const r = await w.rpc<Json>(s, `public.coin_transfer_pin_set('2468')`);
		expect(r.ok).toBe(true);
	}
	await w.setting('market_sale_fee_percent', 5);
	await w.setting('transfer_daily_cap', 1000);
	await w.db.sql(
		`insert into public.coin_stock_closes (stock_id, day, close, carried, inputs, formula_version) values
		 ('foundry', public._coin_la_today() - 1, 9.37, false, '{}'::jsonb, 'v1'),
		 ('gauntlet', public._coin_la_today() - 1, 12.11, false, '{}'::jsonb, 'v1')`
	);
}, 600_000);

afterAll(async () => w?.db.stop());

describe('the economy changes only by logged sinks and faucets', () => {
	test('a seeded random walk of every action', async () => {
		const t0 = await total();
		const l0 = await logged();
		const r = rng(402);
		const pick = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length)];
		const counts: Record<string, number> = {};
		const ok = (name: string, res: Json) => {
			if (res && res.ok) counts[name] = (counts[name] ?? 0) + 1;
		};
		for (let i = 0; i < 260; i++) {
			const u = pick(students);
			const roll = r();
			if (roll < 0.14) {
				const kind = r() < 0.6 ? 'offer' : 'request';
				ok(kind, await w.rpc<Json>(u, `public.coin_market_post($1, $2, '', $3::numeric, 'service', $4::integer)`, [
					kind,
					`Item ${i}`,
					Math.round((0.5 + r() * 6) * 100) / 100,
					r() < 0.5 ? null : 2
				]));
			} else if (roll < 0.3) {
				const { rows } = await w.db.sql<{ id: string }>(
					`select id from public.coin_market_listings where zone = 'student' and closed_at is null and expires_at > now() order by random() limit 1`
				);
				if (rows[0]) ok('claim', await w.rpc<Json>(u, `public.coin_market_claim($1::uuid)`, [rows[0].id]));
			} else if (roll < 0.55) {
				const { rows } = await w.db.sql<{ id: string; payer_email: string; payee_email: string; status: string }>(
					`select id, payer_email, payee_email, status from public.coin_market_orders where status in ('held', 'delivered') order by random() limit 1`
				);
				if (rows[0]) {
					const o = rows[0];
					const payer = students.find((s) => s.email === o.payer_email)!;
					const payee = students.find((s) => s.email === o.payee_email)!;
					const a = r();
					const [who, action] =
						a < 0.35 ? [payee, 'deliver'] : a < 0.65 ? [payer, 'confirm'] : a < 0.8 ? [payee, 'cancel'] : [pick([payer, payee]), 'dispute'];
					ok(action, await w.rpc<Json>(who, `public.coin_market_order_act($1::uuid, $2, $3)`, [o.id, action, 'Something went wrong.']));
				}
			} else if (roll < 0.62) {
				const { rows } = await w.db.sql<{ id: string; amount: string }>(
					`select id, amount::text from public.coin_market_orders where status = 'disputed' order by random() limit 1`
				);
				if (rows[0]) {
					const outcome = pick(['release', 'refund', 'split']);
					const amt = Number(rows[0].amount);
					const to = outcome === 'split' && amt >= 0.02 ? Math.max(0.01, Math.round(amt * 0.4 * 100) / 100) : null;
					ok(`resolve_${outcome}`, await w.rpc<Json>(w.owner, `public.coin_market_resolve($1::uuid, $2, $3::numeric, null)`, [
						rows[0].id,
						outcome === 'split' && to === null ? 'refund' : outcome,
						to
					]));
				}
			} else if (roll < 0.74) {
				const to = pick(students.filter((s) => s !== u));
				ok(r() < 0.4 ? 'transfer_private' : 'transfer', await w.rpc<Json>(u, `public.coin_transfer_send($1, $2::numeric, 'hi', $3, '2468')`, [
					await w.pid(to.email),
					Math.round((0.1 + r() * 3) * 100) / 100,
					r() < 0.4
				]));
			} else if (roll < 0.8) {
				const section = u === w.cal ? w.s2 : w.s1;
				ok('minutes', await w.rpc<Json>(u, `public.coin_buy_hall_pass_minutes($1::uuid, 1)`, [section]));
			} else if (roll < 0.9) {
				ok('stock_buy', await w.rpc<Json>(u, `public.coin_stock_buy($1, $2::numeric)`, [
					pick(['foundry', 'gauntlet']),
					Math.round((0.5 + r() * 8) * 100) / 100
				]));
			} else {
				if (r() < 0.3) {
					// The price moves between trades (the current one, the latest row:
					// 0283 trades there), so sales realize gains and losses.
					await w.db.sql(
						`update public.coin_stock_closes set close = round((close * (0.85 + random() * 0.3))::numeric, 4)
						 where (stock_id, day) in (select stock_id, max(day) from public.coin_stock_closes group by stock_id)`
					);
				}
				ok('stock_sell', await w.rpc<Json>(u, `public.coin_stock_sell($1, $2::numeric, $3)`, [
					pick(['foundry', 'gauntlet']),
					Math.round((0.2 + r() * 5) * 100) / 100,
					r() < 0.3
				]));
			}
		}
		// Every kind of action actually happened, or the walk proves little.
		for (const k of ['offer', 'request', 'claim', 'deliver', 'confirm', 'cancel', 'dispute', 'transfer', 'transfer_private', 'minutes', 'stock_buy', 'stock_sell']) {
			expect(counts[k] ?? 0, `${k} happened (${JSON.stringify(counts)})`).toBeGreaterThan(0);
		}
		expect((counts.resolve_release ?? 0) + (counts.resolve_refund ?? 0) + (counts.resolve_split ?? 0)).toBeGreaterThan(0);
		// The fees were nonzero, so the identity is not trivially 0 = 0.
		expect(Number(await w.scalar(`select count(*)::text v from public.coin_transactions where category_id = any($1::text[])`, [LOGGED.slice(0, 4)]))).toBeGreaterThan(5);

		const t1 = await total();
		const l1 = await logged();
		expect(t1 - t0).toBeCloseTo(l1 - l0, 2);
	}, 300_000);

	test('planted control: a rogue release with no order behind it breaks the identity', async () => {
		const t0 = await total();
		const l0 = await logged();
		const { rows } = await w.db.sql<{ id: string }>(
			`select (public._coin_insert($1, 'market_escrow_release', 2.5, null, 'rogue', '{}'::jsonb, 'digital', null, 'system')).id`,
			[w.ana.email]
		);
		expect((await total()) - t0).not.toBeCloseTo((await logged()) - l0, 2);
		await w.db.sql(`delete from public.coin_transactions where id = $1`, [rows[0].id]);
		expect((await total()) - t0).toBeCloseTo((await logged()) - l0, 2);
	});
});
