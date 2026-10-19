// tests/db/coin-transfer-pin.test.ts
//
// STUDENT-TO-STUDENT TRANSFERS (ledger 0402, migration 0277). Silent
// regressions guarded here: a PIN that stops locking, a lock that a caller can
// skip, a daily cap that quietly lets more through, a private fee computed
// wrong, and above all a PRIVATE transfer that quietly appears in a public
// feed. Each exclusion is asserted beside its positive control.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startCoinWorld, type CoinWorld, type Json } from './coin-market-world';

let w: CoinWorld;

async function send(u: typeof w.ana, to: string, amount: number, pin: string, priv = false, message: string | null = null) {
	return w.rpc<Json>(u, `public.coin_transfer_send($1, $2::numeric, $3, $4, $5)`, [to, amount, message, priv, pin]);
}

beforeAll(async () => {
	w = await startCoinWorld();
	for (const s of [w.ana, w.ben, w.cal]) await w.give(s.email, 60);
}, 600_000);

afterAll(async () => w?.db.stop());

describe('the PIN', () => {
	test('is four to six digits, is stored hashed, and is needed to change it', async () => {
		expect((await w.rpc<Json>(w.ana, `public.coin_transfer_pin_set('12a4')`)).reason).toBe('pin_shape');
		expect((await w.rpc<Json>(w.ana, `public.coin_transfer_pin_set('1234567')`)).reason).toBe('pin_shape');
		expect((await w.rpc<Json>(w.ana, `public.coin_transfer_pin_set('4321')`)).ok).toBe(true);
		const stored = await w.scalar(`select pin_hash v from public.coin_transfer_pins where student_email = $1`, [w.ana.email]);
		expect(stored).not.toContain('4321');
		expect((await w.rpc<Json>(w.ana, `public.coin_transfer_pin_set('9999', '1111')`)).reason).toBe('wrong_pin');
		expect((await w.rpc<Json>(w.ana, `public.coin_transfer_pin_set('5678', '4321')`)).ok).toBe(true);
		expect((await w.rpc<Json>(w.ben, `public.coin_transfer_pin_set('2468')`)).ok).toBe(true);
		expect((await w.rpc<Json>(w.cal, `public.coin_transfer_pin_set('1357')`)).ok).toBe(true);
	});

	test('five wrong tries lock sending for the set minutes, even with the right PIN after', async () => {
		const to = await w.pid(w.ben.email);
		for (let i = 1; i <= 4; i++) {
			const r = await send(w.ana, to, 1, '0000');
			expect(r).toMatchObject({ ok: false, reason: 'wrong_pin', tries_left: 5 - i });
		}
		const fifth = await send(w.ana, to, 1, '0000');
		expect(fifth.reason).toBe('locked');
		const right = await send(w.ana, to, 1, '5678');
		expect(right.reason).toBe('locked');
		// Nothing moved while locked.
		expect(Number(await w.scalar(`select count(*)::text v from public.coin_transfers where from_email = $1`, [w.ana.email]))).toBe(0);
		// The lock ends; the right PIN then sends (control).
		await w.db.sql(`update public.coin_transfer_pins set locked_until = now() - interval '1 second' where student_email = $1`, [w.ana.email]);
		expect((await send(w.ana, to, 1, '5678')).ok).toBe(true);
	});
});

describe('sending', () => {
	test('moves exactly the amount, refuses self, unknown and out-of-economy recipients', async () => {
		const to = await w.pid(w.ben.email);
		const a = await w.balance(w.ana.email);
		const b = await w.balance(w.ben.email);
		const r = await send(w.ana, to, 2.5, '5678', false, 'For the pizza');
		expect(r.ok).toBe(true);
		expect(await w.balance(w.ana.email)).toBeCloseTo(a - 2.5, 2);
		expect(await w.balance(w.ben.email)).toBeCloseTo(b + 2.5, 2);
		expect((await send(w.ana, await w.pid(w.ana.email), 1, '5678')).reason).toBe('self');
		expect((await send(w.ana, 'deadbeef', 1, '5678')).reason).toBe('recipient');
		// The owner is not a student in the economy.
		expect((await send(w.ana, await w.pid(w.owner.email), 1, '5678')).reason).toBe('recipient');
	});

	test('the daily cap counts what was already sent today', async () => {
		await w.setting('transfer_daily_cap', 10);
		const to = await w.pid(w.cal.email);
		const sent = Number(await w.scalar(`select public._coin_transfer_sent_today($1)::text v`, [w.ana.email]));
		const over = await send(w.ana, to, 10 - sent + 0.01, '5678');
		expect(over).toMatchObject({ ok: false, reason: 'cap' });
		// Control: exactly to the cap is allowed.
		expect((await send(w.ana, to, Number((10 - sent).toFixed(2)), '5678')).ok).toBe(true);
		expect((await send(w.ana, to, 0.1, '5678')).reason).toBe('cap');
		await w.setting('transfer_daily_cap', 20);
	});

	test('a student in debt cannot send, and can still receive', async () => {
		await w.give(w.cal.email, -200);
		expect(await w.balance(w.cal.email)).toBeLessThan(0);
		expect((await send(w.cal, await w.pid(w.ben.email), 1, '1357')).reason).toBe('in_debt');
		const before = await w.balance(w.cal.email);
		expect((await send(w.ben, await w.pid(w.cal.email), 1, '2468')).ok).toBe(true);
		expect(await w.balance(w.cal.email)).toBeCloseTo(before + 1, 2);
	});

	test('private: 10% with a 0.1 minimum, a logged sink, and absent from every public feed', async () => {
		const to = await w.pid(w.ana.email);
		const before = await w.balance(w.ben.email);
		const small = await send(w.ben, to, 0.5, '2468', true, 'secret one');
		expect(Number(small.fee)).toBeCloseTo(0.1, 2);
		const big = await send(w.ben, to, 3, '2468', true, 'secret two');
		expect(Number(big.fee)).toBeCloseTo(0.3, 2);
		expect(await w.balance(w.ben.email)).toBeCloseTo(before - 3.5 - 0.4, 2);
		const pub = await send(w.ben, to, 1, '2468', false, 'out in the open');
		expect(Number(pub.fee)).toBe(0);
		expect(Number(await w.scalar(`select count(*)::text v from public.coin_transactions where student_email = $1 and category_id = 'coin_transfer_private_fee'`, [w.ben.email]))).toBe(2);

		const feed = await w.db.asAnon(async (q) => (await q<{ r: Json[] }>(`select public.coin_public_transfers(200) r`)).rows[0].r);
		const words = JSON.stringify(feed);
		expect(words).not.toContain('secret one');
		expect(words).not.toContain('secret two');
		// Control: the public one is there, from the same sender, to the same student.
		expect(words).toContain('out in the open');
		expect(words).not.toMatch(/@boscotech/);

		const ledger = await w.db.asAnon(async (q) =>
			(await q<{ category_id: string; amount: string; name: string }>(`select category_id, amount::text, name from public.coin_public_transactions(5000)`)).rows
		);
		const transferRows = ledger.filter((r) => r.category_id.startsWith('coin_transfer'));
		// The public transfer's two rows are there; the private ones' six (out, in, fee x2) are not.
		expect(transferRows.some((r) => Number(r.amount) === -1)).toBe(true);
		expect(transferRows.some((r) => Number(r.amount) === -3)).toBe(false);
		expect(transferRows.some((r) => r.category_id === 'coin_transfer_private_fee')).toBe(false);
		const studentPage = await w.db.asAnon(async (q) =>
			(await q<{ r: Json }>(`select public.coin_public_student($1) r`, [await w.pid(w.ben.email)])).rows[0].r
		);
		const hist = studentPage.history as Json[];
		expect(hist.some((h) => h.category_id === 'coin_transfer_private_fee')).toBe(false);
		expect(hist.some((h) => h.category_id === 'coin_transfer_out')).toBe(true);

		// Both parties and staff still see it.
		const mine = await w.rpc<Json>(w.ana, `public.coin_transfer_status()`);
		expect(JSON.stringify(mine.mine)).toContain('secret two');
		const staff = await w.rpc<Json[]>(w.teacher, `public.coin_transfer_moderation()`);
		expect(JSON.stringify(staff)).toContain('secret two');
	});

	test('staff remove a message from the feed and the amount stays', async () => {
		const id = await w.scalar(`select id::text v from public.coin_transfers where message = 'out in the open'`);
		expect((await w.rpc<Json>(w.cosso, `public.coin_transfer_remove_message($1::uuid, 'Not for the feed.')`, [id])).reason).toBe('not_found');
		expect((await w.rpc<Json>(w.teacher, `public.coin_transfer_remove_message($1::uuid, 'Not for the feed.')`, [id])).ok).toBe(true);
		const feed = await w.db.asAnon(async (q) => (await q<{ r: Json[] }>(`select public.coin_public_transfers(200) r`)).rows[0].r);
		const row = feed.find((f) => f.id === id)!;
		expect(row.message).toBeNull();
		expect(Number(row.amount)).toBe(1);
	});

	test('no transfer door takes an address, and only the public feed is anon', async () => {
		const { rows } = await w.db.sql<{ proname: string; args: string; anon: boolean }>(
			`select p.proname, pg_get_function_identity_arguments(p.oid) args, has_function_privilege('anon', p.oid, 'execute') anon
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and (p.proname like 'coin\\_transfer%' or p.proname = 'coin_public_transfers')`
		);
		expect(rows.length).toBeGreaterThanOrEqual(6);
		for (const r of rows) {
			expect(r.args, r.proname).not.toMatch(/email/i);
			expect(r.anon, r.proname).toBe(r.proname === 'coin_public_transfers');
		}
	});
});
