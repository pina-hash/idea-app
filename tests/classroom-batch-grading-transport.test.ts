// tests/classroom-batch-grading-transport.test.ts
//
// THE SHAPE OF THE TRANSPORT THE PER-SECTION GRADING ROUTE IS HANDED (0288),
// asserted in BOTH directions, because both directions fail silently.
//
// `GradingConsole` decides what page it is from this object:
//   * the OBJECT present  -> tick boxes, presets, batch bar
//   * `loadAcross` present -> the cross-class READ, the section grouping, the
//     section labels, a widened presence scope, and the link ACROSS removed
//
// So `createBatchGradingTransports` losing `gradeMany` silently removes batch
// grading from `/classroom/<section>/item/<item>/grade` -- the console renders
// perfectly, just without the thing Mr. Pina asked for. And it GAINING
// `loadAcross` silently turns that page into the cross-class console: the
// roster fills with students from every class the caller teaches the
// assignment in, and the only link to the page that is supposed to do that
// disappears. Neither throws, neither fails a type check, and both look like a
// working grading console.
//
// IT IS A REST-SPREAD OF THE FULL FACTORY, which is what makes the two
// functions one implementation of the batch write -- and is also the thing
// worth pinning, because a spread only carries OWN ENUMERABLE properties and
// only keeps working while `gradeMany` does not depend on `this`. A future
// edit that made it a prototype method, or that reached for `this.loadAcross`,
// would produce exactly the silent losses above.

import { describe, expect, test } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	createBatchGradingTransports,
	createBulkGradingTransports
} from '$lib/classroom/transports';

/** Records the RPC it was asked for. Nothing here reaches a network. */
function stubClient() {
	const calls: { fn: string; args: Record<string, unknown> }[] = [];
	const client = {
		rpc: async (fn: string, args: Record<string, unknown>) => {
			calls.push({ fn, args });
			return { data: { ok: true, total: 1, succeeded: 1, refused: 0, results: [] }, error: null };
		}
	};
	return { client: client as unknown as SupabaseClient, calls };
}

describe('the cross-class factory carries both capabilities', () => {
	test('loadAcross and gradeMany are both there', () => {
		const t = createBulkGradingTransports(stubClient().client);
		expect(typeof t.loadAcross).toBe('function');
		expect(typeof t.gradeMany).toBe('function');
	});
});

describe('the batch-only factory is the same write with the read removed', () => {
	test('gradeMany survives the spread', () => {
		const t = createBatchGradingTransports(stubClient().client);
		expect(typeof t.gradeMany).toBe('function');
	});

	/**
	 * THE BOUNDARY. `in` rather than a truthiness check, because the console
	 * reads `bulk?.loadAcross` -- an own key holding `undefined` would answer
	 * the same as no key today and is one optional-chaining change away from
	 * not doing, which is the kind of difference nobody re-checks.
	 */
	test('loadAcross is ABSENT, not merely falsy', () => {
		const t = createBatchGradingTransports(stubClient().client);
		expect('loadAcross' in t).toBe(false);
		expect(t.loadAcross).toBeUndefined();
	});

	/**
	 * THE SPREAD ONLY WORKS WHILE `gradeMany` IS SELF-CONTAINED. Called off the
	 * spread object -- which is how the console calls it -- it must still reach
	 * the RPC. A `this`-dependent implementation throws here and nowhere else.
	 */
	test('gradeMany still reaches its RPC when called off the spread object', async () => {
		const { client, calls } = stubClient();
		const t = createBatchGradingTransports(client);
		const res = await t.gradeMany('item-1', [{ student_email: 'a@x', scores: { c1: 0 } }], true);
		expect(res.ok).toBe(true);
		expect(calls).toHaveLength(1);
		expect(calls[0]!.fn).toBe('classroom_grade_submissions');
		expect(calls[0]!.args.p_item_id).toBe('item-1');
		expect(calls[0]!.args.p_return).toBe(true);
	});

	/**
	 * AND IT IS THE SAME WRITE, not a second one. Both factories must name the
	 * same RPC with the same argument keys -- a second implementation here is
	 * two sets of refusal semantics for one statement, which on this path is
	 * the difference between "no grade was written" and thirty students
	 * silently half-graded.
	 */
	test('both factories issue the identical call', async () => {
		const a = stubClient();
		const b = stubClient();
		const grades = [{ student_email: 'a@x', scores: { c1: 0 } }];
		await createBulkGradingTransports(a.client).gradeMany('item-1', grades, false);
		await createBatchGradingTransports(b.client).gradeMany('item-1', grades, false);
		expect(b.calls).toEqual(a.calls);
	});
});
