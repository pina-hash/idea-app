// tests/db/coin-hallpass-minutes.test.ts
//
// BUYING HALL PASS TIME (ledger 0402, migration 0278). Silent regressions
// guarded here: the daily cap quietly exceeded, bought minutes quietly moving
// the line for a pass opened BEFORE the purchase, the fine line quietly
// pushed past the auto check-in (a pass left open would never be fined), and
// a purchase quietly undoing a fine already posted. Each beside its control.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startCoinWorld, type CoinWorld, type Json } from './coin-market-world';

let w: CoinWorld;

async function fines(email: string): Promise<number> {
	return Number(
		await w.scalar(
			`select count(*)::text v from public.coin_transactions where student_email = $1 and category_id = 'long_bathroom_break' and not public._coin_is_reversed(id)`,
			[email]
		)
	);
}
async function warnings(email: string): Promise<number> {
	return Number(
		await w.scalar(
			`select count(*)::text v from public.classroom_hall_pass_events e join public.classroom_hall_passes h on h.id = e.pass_id
			 where h.student_email = $1 and e.kind = 'warning'`,
			[email]
		)
	);
}
/** A pass opened by the student, back-dated to have lasted `minutes`, closed by them. */
async function pass(u: typeof w.ana, minutes: number) {
	const open = await w.rpc<Json>(u, `public.classroom_hall_pass_open($1::uuid)`, [w.s1]);
	expect(open.ok, JSON.stringify(open)).toBe(true);
	await w.db.sql(
		`update public.classroom_hall_passes set opened_at = now() - make_interval(secs => $2::double precision)
		 where section_id = $1 and closed_at is null`,
		[w.s1, minutes * 60]
	);
	const close = await w.rpc<Json>(u, `public.classroom_hall_pass_close_mine($1::uuid)`, [w.s1]);
	expect(close.ok, JSON.stringify(close)).toBe(true);
}
async function buy(u: typeof w.ana, blocks: number): Promise<Json> {
	return w.rpc<Json>(u, `public.coin_buy_hall_pass_minutes($1::uuid, $2)`, [w.s1, blocks]);
}

beforeAll(async () => {
	w = await startCoinWorld();
	await w.setting('v2_hall_pass_from', new Date(Date.now() - 86400000).toISOString());
	await w.db.sql(`update public.classroom_hall_pass_budget_start set effective_at = now() - interval '1 day'`);
	// A day budget big enough that the passes below are never blocked.
	await w.db.sql(`update public.classroom_sections set hall_pass_daily_minutes = 120 where id = $1`, [w.s1]);
	for (const s of [w.ana, w.ben, w.dee, w.eve]) await w.give(s.email, 20);
}, 600_000);

afterAll(async () => w?.db.stop());

describe('buying time', () => {
	test('blocks of five at one coin, capped at fifteen extra minutes a day', async () => {
		const before = await w.balance(w.ana.email);
		const r = await buy(w.ana, 2);
		expect(r).toMatchObject({ ok: true, minutes: 10 });
		expect(await w.balance(w.ana.email)).toBeCloseTo(before - 2, 2);
		expect((await buy(w.ana, 2)).reason).toBe('cap');
		// Control: exactly to the cap is allowed.
		expect((await buy(w.ana, 1)).ok).toBe(true);
		expect((await buy(w.ana, 1)).reason).toBe('cap');
		// It adds to today's budget in that class.
		const state = await w.rpc<Json>(w.ana, `public.classroom_hall_pass_state($1::uuid)`, [w.s1]);
		const b = state.budget as Json;
		expect(Number(b.bought_seconds)).toBe(900);
		expect(Number(b.allowance_seconds)).toBe(120 * 60 + 900);
	});

	test('refused in debt, and refused in a class that is not yours', async () => {
		await w.give(w.eve.email, -100);
		expect((await buy(w.eve, 1)).reason).toBe('insufficient');
		const other = await w.rpc<Json>(w.ben, `public.coin_buy_hall_pass_minutes($1::uuid, 1)`, [w.s2]);
		expect(other.reason).toBe('not_your_class');
		await w.give(w.eve.email, 100);
	});
});

describe('the warning and fine lines move only for passes opened after the purchase', () => {
	test('a pass opened before the purchase is judged on the old lines (fined at 25 minutes)', async () => {
		const open = await w.rpc<Json>(w.ben, `public.classroom_hall_pass_open($1::uuid)`, [w.s1]);
		expect(open.ok).toBe(true);
		await w.db.sql(`update public.classroom_hall_passes set opened_at = now() - interval '25 minutes' where section_id = $1 and closed_at is null`, [w.s1]);
		expect((await buy(w.ben, 3)).ok).toBe(true);
		await w.rpc(w.ben, `public.classroom_hall_pass_close_mine($1::uuid)`, [w.s1]);
		expect(await fines(w.ben.email)).toBe(1);
	});

	test('a pass opened after buying 15 minutes is not fined at 25 minutes (lines at 25 and 30)', async () => {
		expect((await buy(w.dee, 3)).ok).toBe(true);
		await w.db.sql(`update public.coin_hall_pass_minutes set created_at = now() - interval '40 minutes' where student_email = $1`, [w.dee.email]);
		await pass(w.dee, 25);
		expect(await fines(w.dee.email)).toBe(0);
		// The warning moved from 10 to 25: at 25 it warns.
		expect(await warnings(w.dee.email)).toBe(1);
	});

	test('the fine line never passes the auto check-in: a pass run to it is fined', async () => {
		// Dee bought 15 (lines 25 and min(35, 30) = 30). A pass to the 30-minute auto check-in is fined.
		await w.rpc(w.dee, `public.classroom_hall_pass_open($1::uuid)`, [w.s1]);
		await w.db.sql(`update public.classroom_hall_passes set opened_at = now() - interval '35 minutes' where section_id = $1 and closed_at is null`, [w.s1]);
		// The bought minutes still predate this pass.
		await w.rpc(w.dee, `public.classroom_hall_pass_state($1::uuid)`, [w.s1]);
		expect(await fines(w.dee.email)).toBe(1);
		const minutes = Number(await w.scalar(`select (meta ->> 'bought_minutes') v from public.coin_transactions where student_email = $1 and category_id = 'long_bathroom_break'`, [w.dee.email]));
		expect(minutes).toBe(15);
	});

	test('paying after a fine never removes it', async () => {
		await pass(w.eve, 22);
		expect(await fines(w.eve.email)).toBe(1);
		expect((await buy(w.eve, 2)).ok).toBe(true);
		await w.rpc(w.eve, `public.classroom_hall_pass_state($1::uuid)`, [w.s1]);
		expect(await fines(w.eve.email)).toBe(1);
	});

	test('a reversed purchase stops counting', async () => {
		const { rows } = await w.db.sql<{ transaction_id: string }>(`select transaction_id from public.coin_hall_pass_minutes where student_email = $1`, [w.ana.email]);
		for (const r of rows) await w.rpc(w.owner, `public.coin_reverse_transaction($1::uuid)`, [r.transaction_id]);
		const bought = Number(await w.scalar(`select public._coin_hall_pass_bought($1::uuid, $2, public._coin_la_today())::text v`, [w.s1, w.ana.email]));
		expect(bought).toBe(0);
		// The cap room is back.
		expect((await buy(w.ana, 1)).ok).toBe(true);
	});
});
