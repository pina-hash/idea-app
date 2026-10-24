// tests/db/connector-coin-voice.test.ts
//
// VOICE TO ACTION FOR IDEA COINS (ledger 0432), end to end: the real coin
// tool on the local backend over the whole chain, judged on the rows read
// back as the connection owner, never on the tool's own answer.
//
// The silent guarantees, each with its control:
//   - no number and nothing listed asks and writes NOTHING (no coin record,
//     no phrase), with the same words plus a number as the control;
//   - a record lands on the one student named, never a classmate;
//   - an ambiguous name writes nothing for anybody.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectorWorld, type ConnectorWorld } from './connector-fixture';
import { runTool } from '../../src/lib/server/connector/tools';

let w: ConnectorWorld;
beforeAll(async () => {
	w = await connectorWorld();
	await w.db.sql(`insert into public.coin_full_admins (email, added_by) values ($1, 'test') on conflict do nothing`, [w.admin.email]);
}, 180_000);
afterAll(async () => w?.stop());

const run = async (args: Record<string, unknown>) => runTool(await w.ctx(w.admin), 'coin_transact', { request_id: crypto.randomUUID(), ...args });
const rows = async (email: string) =>
	(await w.db.sql<{ category_id: string; amount: string; note: string | null }>(
		`select category_id, amount::text, note from public.coin_transactions where student_email = $1 and not public._coin_is_reversed(id) and category_id <> 'reversal' and amount <> 0 order by created_at`,
		[email]
	)).rows;
const all = async () => Number((await w.db.sql<{ n: string }>(`select count(*) as n from public.coin_transactions`)).rows[0].n);
const phrase = async (p: string) =>
	(await w.db.sql<{ category_id: string; amount: string | null; uses: number }>(`select category_id, amount::text, uses from public.coin_phrase_aliases where phrase = $1`, [p])).rows[0] ?? null;

describe('coin_transact, one call from his words', () => {
	it('a listed fine by its everyday word: "fine Daniel R, phone out"', async () => {
		const out = await run({ said: 'fine Daniel R, phone out', student: ['Daniel R'] });
		expect(out.status, JSON.stringify(out)).toBe('done');
		expect(await rows(w.students.danielR)).toEqual([{ category_id: 'off_task_device_use', amount: '-2.00', note: 'phone out' }]);
		// Control: the other Daniel was not touched.
		expect(await rows(w.students.danielV)).toEqual([]);
	});

	it('no number and nothing listed asks for the number and writes nothing', async () => {
		const before = await all();
		const out = await run({ said: 'give Mateo coins for fixing the bandsaw guard', student: ['Mateo'] });
		expect(out).toMatchObject({ status: 'needs_amount', question: 'How many coins for this award?' });
		expect(await all()).toBe(before);
		expect(await phrase('fixing the bandsaw guard')).toBeNull();
	});

	it('a new phrase with a number is a Custom Award with his words, and the number becomes its default', async () => {
		const out = await run({ said: 'give Mateo 4 coins for fixing the bandsaw guard', student: ['Mateo'] });
		expect(out.status, JSON.stringify(out)).toBe('done');
		expect((await rows(w.students.mateo)).at(-1)).toEqual({ category_id: 'custom_award', amount: '4.00', note: 'fixing the bandsaw guard' });
		expect(await phrase('fixing the bandsaw guard')).toMatchObject({ category_id: 'custom_award', amount: '4.00', uses: 1 });
	});

	it('the next time, no number uses the saved default; a new number replaces it', async () => {
		expect((await run({ said: 'give Leo coins for fixing the bandsaw guard', student: ['Leo'] })).status).toBe('done');
		expect((await rows(w.students.leo)).at(-1)).toMatchObject({ category_id: 'custom_award', amount: '4.00' });
		expect((await run({ said: 'give Leo 6 coins for fixing the bandsaw guard', student: ['Leo'] })).status).toBe('done');
		expect((await rows(w.students.leo)).at(-1)).toMatchObject({ amount: '6.00' });
		expect(await phrase('fixing the bandsaw guard')).toMatchObject({ amount: '6.00', uses: 3 });
	});

	it('an ambiguous name writes nothing for anybody', async () => {
		const before = await all();
		const out = await run({ said: 'fine Daniel for eating in class', student: ['Daniel'] });
		expect(out.status).toBe('ambiguous');
		expect(await all()).toBe(before);
	});

	it('a listed amount with a different number asks which, and writes nothing', async () => {
		const before = await all();
		const out = await run({ said: 'fine Leo 4 coins, playing games', student: ['Leo'] });
		expect(out.status).toBe('needs_choice');
		expect(await all()).toBe(before);
	});

	it('undo takes the last record back', async () => {
		await run({ said: 'give Mateo 3 coins for sweeping the shop', student: ['Mateo'] });
		expect((await rows(w.students.mateo)).at(-1)).toMatchObject({ amount: '3.00' });
		const undone = await runTool(await w.ctx(w.admin), 'undo_last', { said: 'undo that' });
		expect(undone.status, JSON.stringify(undone)).toBe('done');
		expect((await rows(w.students.mateo)).at(-1)).toMatchObject({ amount: '4.00' });
	});

	it('the old award tool still answers by name, but is not offered', async () => {
		const { toolList } = await import('../../src/lib/server/connector/registry');
		expect(toolList().some((t) => t.name === 'award_coins')).toBe(false);
		expect(toolList().some((t) => t.name === 'coin_transact')).toBe(true);
		const out = await runTool(await w.ctx(w.admin), 'award_coins', { said: 'give Leo a correct answer award', students: ['Leo'], reason: 'right answer', kind: 'Correct Answer in Class' });
		expect(out.status, JSON.stringify(out)).toBe('done');
	});
});
