// tests/db/connector-repeat.test.ts
//
// REPEATING A REQUEST NEVER DOUBLES AN ACTION (docs/connector/DESIGN.md
// section 3). The same request twice writes once, whether Claude sent a
// request id or the server derived the key; `again: true` writes twice; and an
// explicit key reused for different arguments is refused by the database.
// The judge is the coin rows read back as the connection owner.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectorWorld, type ConnectorWorld } from './connector-fixture';
import { write } from '../../src/lib/server/connector/engine';

let w: ConnectorWorld;

beforeAll(async () => {
	w = await connectorWorld();
}, 180_000);

afterAll(async () => {
	await w?.stop();
});

const award = (email: string, note: string) => ({
	tool: 'award_coins',
	fn: 'coin_log_transaction',
	// Competition Winnings: an amount and a note, and no daily cap that could
	// turn a second write into a structured refusal and hide a double write.
	args: { p_email: email, p_category_id: 'competition_winnings', p_amount: 3, p_quantity: null, p_note: note }
});
const count = async (email: string, note: string) =>
	(await w.db.sql(`select count(*)::int as n from public.coin_transactions where student_email = $1 and note = $2`, [email, note])).rows[0].n;

describe('the same request twice writes once', () => {
	it('with Claude\'s request id', async () => {
		const ctx = await w.ctx(w.admin);
		const a = await write(ctx, award(w.students.mateo, 'with id'), { requestId: 'req-1' });
		const b = await write(ctx, award(w.students.mateo, 'with id'), { requestId: 'req-1' });
		expect([a.status, b.status]).toEqual(['done', 'repeated']);
		expect(await count(w.students.mateo, 'with id')).toBe(1);
	});

	it('with no request id, inside the 120-second window', async () => {
		const ctx = await w.ctx(w.admin);
		const a = await write(ctx, award(w.students.leo, 'derived'), {});
		const b = await write(ctx, award(w.students.leo, 'derived'), {});
		expect([a.status, b.status]).toEqual(['done', 'repeated']);
		expect(await count(w.students.leo, 'derived')).toBe(1);
	});

	it('with no request id, outside the window, it writes again', async () => {
		const ctx = await w.ctx(w.admin);
		await write(ctx, award(w.students.danielR, 'window'), {});
		await w.db.sql(`update public.connector_audit set started_at = now() - interval '121 seconds' where args ->> 'p_note' = 'window'`);
		const b = await write(ctx, award(w.students.danielR, 'window'), {});
		expect(b.status).toBe('done');
		expect(await count(w.students.danielR, 'window')).toBe(2);
	});

	it('again: true writes a second time on purpose, with an id or without', async () => {
		const ctx = await w.ctx(w.admin);
		await write(ctx, award(w.students.danielV, 'again'), { requestId: 'req-2' });
		const b = await write(ctx, award(w.students.danielV, 'again'), { requestId: 'req-2', again: true });
		const c = await write(ctx, award(w.students.danielV, 'again'), { again: true });
		expect([b.status, c.status]).toEqual(['done', 'done']);
		expect(await count(w.students.danielV, 'again')).toBe(3);
	});

	it('an explicit key reused for different arguments is refused by the database, and nothing is written', async () => {
		const r = await w.db.asUser(w.admin.id, async (q) => {
			await q(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: w.admin.id, role: 'authenticated', email: w.admin.email })]);
			await q(`select public.connector_call('t', 'coin_log_transaction', $1::jsonb, 'id:fixed', 'commit')`, [
				JSON.stringify({ p_email: w.students.mateo, p_category_id: 'correct_answer_in_class', p_note: 'first' })
			]);
			try {
				await q(`select public.connector_call('t', 'coin_log_transaction', $1::jsonb, 'id:fixed', 'commit')`, [
					JSON.stringify({ p_email: w.students.mateo, p_category_id: 'correct_answer_in_class', p_note: 'second' })
				]);
				return 'no error';
			} catch (e) {
				return (e as Error).message;
			}
		});
		expect(r).toBe('That request id was already used for a different request.');
		expect(await count(w.students.mateo, 'second')).toBe(0);
	});

	it('two identical requests at the same moment still write once', async () => {
		const [c1, c2] = await Promise.all([w.ctx(w.admin), w.ctx(w.admin)]);
		const [a, b] = await Promise.all([write(c1, award(w.students.mateo, 'race'), {}), write(c2, award(w.students.mateo, 'race'), {})]);
		expect([a.status, b.status].sort()).toEqual(['done', 'repeated']);
		expect(await count(w.students.mateo, 'race')).toBe(1);
	});
});
