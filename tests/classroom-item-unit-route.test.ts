// tests/classroom-item-unit-route.test.ts
//
// /api/classroom/item: the UNIT's journey from the composer to the RPC (0218),
// driven against the REAL route handler imported from its own file.
//
// WHY THIS EARNS A TEST, against this repo's default of verifying by dev
// harness. Three of the four guarantees below are silent, and the third is the
// one that would cost a teacher their filing without anybody noticing:
//
//   * THE PARAMETER IS NAMED ONLY WHEN A UNIT WAS PICKED. Naming `p_unit_id`
//     on every call would make a deployment that has not applied 0218 yet
//     answer PGRST202 to EVERY item creation -- every teacher's Post button,
//     not just the ones using the new control. A change that started sending
//     it unconditionally would look completely fine on a project that HAS the
//     migration, which is every project a session can test against.
//   * A GENUINE REFUSAL IS NEVER RETRIED INTO A WEAKER CALL. The degrade rung
//     is gated on PGRST202 ALONE. If it were gated on "the call errored", a
//     wrong-course refusal would be retried WITHOUT the unit, that retry would
//     SUCCEED, and the teacher would be told their post landed -- unfiled,
//     with the refusal they were supposed to read swallowed. That is the exact
//     shape of the defect this whole bundle is about.
//   * A DROPPED UNIT IS REPORTED. A backend without 0218 loses the filing. The
//     item is up and every word is there, so nothing on screen looks wrong;
//     `unit_dropped` is the only thing that says so.
//
// And one that is not silent but is the point of the file: a unit that WAS
// picked reaches the RPC as `p_unit_id`.
//
// NOTHING HERE ASSERTS WHAT THE DATABASE DOES WITH IT. Whether a unit is legal
// for these sections is `classroom_create_item`'s question and is measured
// against real Postgres in `tests/db/classroom-create-item-unit.test.ts`. This
// file is only about the wire between them, which that one cannot see.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { POST } from '../src/routes/api/classroom/item/+server';

interface RpcCall {
	fn: string;
	args: Record<string, unknown>;
}

/**
 * A `locals.supabase` that RECORDS what it was asked and answers from a
 * script, one entry per call in order. A missing entry is a success, which is
 * the ordinary single-call case.
 */
function stubSupabase(answers: ({ error: { code?: string; message?: string } } | null)[] = []) {
	const calls: RpcCall[] = [];
	let i = 0;
	return {
		calls,
		client: {
			async rpc(fn: string, args: Record<string, unknown>) {
				calls.push({ fn, args: { ...args } });
				const answer = answers[i++] ?? null;
				if (answer) return { data: null, error: answer.error };
				return { data: { item_id: 'item-1' }, error: null };
			}
		}
	};
}

function post(body: Record<string, unknown>, supabase: { rpc: unknown }) {
	return POST({
		request: new Request('http://localhost/api/classroom/item', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}),
		locals: { supabase, claims: { sub: 'u-1' } }
		// The handler reads exactly these two off `locals` and nothing else off
		// the event, so the cast is over an event this route never touches.
	} as unknown as Parameters<typeof POST>[0]) as Promise<Response>;
}

const BASE = {
	mode: 'create',
	kind: 'assignment',
	sectionIds: ['sec-1'],
	published: true,
	title: 'Bearing teardown',
	bodyDoc: null,
	points: 10,
	dueAt: null,
	publishAt: null,
	category: null,
	links: []
};

const PGRST202 = {
	error: { code: 'PGRST202', message: 'Could not find the function public.classroom_create_item' }
};
/** A `raise` from inside the function: a considered refusal, not a version gap. */
const WRONG_COURSE = {
	error: {
		code: 'P0001',
		message:
			'That unit belongs to a different course from the classes you are posting to. Pick a ' +
			'unit from one of those classes, or post it without a unit.'
	}
};

describe('/api/classroom/item: the unit (0218)', () => {
	it('names NO p_unit_id when no unit was picked', async () => {
		const sb = stubSupabase();
		const res = await post(BASE, sb.client);
		expect(res.status).toBe(200);
		expect(sb.calls).toHaveLength(1);
		expect(sb.calls[0].fn).toBe('classroom_create_item');
		// THE WHOLE POINT: the argument set is byte-identical to the pre-0218
		// one, so a project between two hand-applied migrations answers every
		// ordinary save exactly as it did.
		expect('p_unit_id' in sb.calls[0].args).toBe(false);
		await expect(res.json()).resolves.toMatchObject({ ok: true, unit_dropped: false });
	});

	it('treats an empty-string unit as no unit', async () => {
		// The select's "No unit" is `null`, but a hand-rolled caller or a form
		// serialization can produce `''`, and `''` is not a uuid.
		const sb = stubSupabase();
		await post({ ...BASE, unitId: '' }, sb.client);
		expect('p_unit_id' in sb.calls[0].args).toBe(false);
	});

	it('names p_unit_id when a unit WAS picked -- the POSITIVE CONTROL', async () => {
		const sb = stubSupabase();
		const res = await post({ ...BASE, unitId: 'unit-3' }, sb.client);
		expect(res.status).toBe(200);
		expect(sb.calls).toHaveLength(1);
		expect(sb.calls[0].args.p_unit_id).toBe('unit-3');
		await expect(res.json()).resolves.toMatchObject({ unit_dropped: false });
	});

	it('an update NEVER carries a unit, whatever the body says', async () => {
		// Filing an existing item is `classroom_set_item_unit`'s job, and
		// `classroom_update_item` has no parameter for it. A second write path
		// to one column is the pair that stops agreeing.
		const sb = stubSupabase();
		await post({ ...BASE, mode: 'update', id: 'item-1', unitId: 'unit-3' }, sb.client);
		expect(sb.calls[0].fn).toBe('classroom_update_item');
		expect('p_unit_id' in sb.calls[0].args).toBe(false);
	});

	describe('a backend that has not applied 0218', () => {
		it('drops the unit, saves, and SAYS SO', async () => {
			const sb = stubSupabase([PGRST202]);
			const res = await post({ ...BASE, unitId: 'unit-3' }, sb.client);
			expect(res.status).toBe(200);
			expect(sb.calls).toHaveLength(2);
			expect(sb.calls[0].args.p_unit_id).toBe('unit-3');
			expect('p_unit_id' in sb.calls[1].args).toBe(false);
			// The retry kept everything else, so the rung gave up the unit and
			// nothing more.
			expect(sb.calls[1].args.p_body_doc).toBe(sb.calls[0].args.p_body_doc);
			expect('p_publish_at' in sb.calls[1].args).toBe(true);
			await expect(res.json()).resolves.toMatchObject({
				ok: true,
				item_id: 'item-1',
				unit_dropped: true
			});
		});

		it('does not narrow twice: the unit rung leaves the chain below it intact', async () => {
			// Unit gone, still PGRST202 -> publish_at gone, still PGRST202 ->
			// body_doc gone, succeeds. Both losses are reported, separately.
			const sb = stubSupabase([PGRST202, PGRST202, PGRST202]);
			const res = await post({ ...BASE, unitId: 'unit-3' }, sb.client);
			expect(sb.calls).toHaveLength(4);
			expect('p_unit_id' in sb.calls[3].args).toBe(false);
			expect('p_publish_at' in sb.calls[3].args).toBe(false);
			expect('p_body_doc' in sb.calls[3].args).toBe(false);
			await expect(res.json()).resolves.toMatchObject({
				unit_dropped: true,
				formatting_dropped: true
			});
		});
	});

	describe('a considered refusal', () => {
		it('is NEVER retried without the unit, and is returned verbatim', async () => {
			// THE SILENT ONE. Retried, the second call would succeed and the
			// teacher would read "posted" over an item that is unfiled and a
			// refusal they never saw.
			const sb = stubSupabase([WRONG_COURSE]);
			const res = await post({ ...BASE, unitId: 'unit-3' }, sb.client);
			expect(sb.calls).toHaveLength(1);
			expect(res.status).toBe(400);
			const body = (await res.json()) as { error: string; unit_dropped?: boolean };
			expect(body.error).toBe(WRONG_COURSE.error.message);
			// Not reported as a partial success of any kind.
			expect(body.unit_dropped).toBeUndefined();
		});

		it('POSITIVE CONTROL: the same stub DOES retry a PGRST202', async () => {
			// So the "one call" above is an answer about the gate and not about
			// a stub that cannot retry at all.
			const sb = stubSupabase([PGRST202]);
			await post({ ...BASE, unitId: 'unit-3' }, sb.client);
			expect(sb.calls).toHaveLength(2);
		});
	});
});

/**
 * AND THE COMPOSER ACTUALLY PUTS THE CHOSEN UNIT IN THE PAYLOAD.
 *
 * WRITTEN BECAUSE A MUTATION SURVIVED. Replacing `itemInput()`'s unit line with
 * a bare `undefined` -- a composer that renders the picker, records the
 * selection, and silently never sends it -- passed every other assertion in
 * this bundle: the route tests build their own body, the database tests call
 * the RPC directly, and the picker still looked and behaved correctly on
 * screen. That is the exact failure this bundle was written to remove, so it
 * is the one that most needs pinning.
 *
 * A SOURCE SWEEP RATHER THAN A MOUNT, because `itemInput()` is a private
 * function of the component: nothing exports it, and a mount can only observe
 * it by driving a save through a stub transport, which asserts the transport
 * rather than the payload. The tradeoff is stated rather than hidden -- this
 * checks that the wiring is written, not that it runs.
 */
describe('ContentComposer puts the chosen unit in the payload', () => {
	const src = readFileSync('src/lib/classroom/ContentComposer.svelte', 'utf8');
	/** `itemInput()`'s body, which is what `createItem` is handed. */
	const itemInput = (() => {
		const at = src.indexOf('function itemInput()');
		expect(at, 'itemInput() moved or was renamed').toBeGreaterThan(-1);
		const end = src.indexOf('\n\t}', at);
		return src.slice(at, end);
	})();

	it('sends the unit on create', () => {
		expect(itemInput).toMatch(/unitId:\s*mode === 'create' \? unitId : undefined/);
	});

	it('sends NOTHING on edit, so there is one write path to unit_id', () => {
		// Filing an existing item is `classroom_set_item_unit`'s job.
		// `classroom_update_item` has no parameter for it and must not gain one.
		expect(itemInput).toContain("mode === 'create' ? unitId : undefined");
		expect(itemInput).not.toMatch(/unitId:\s*unitId\b/);
	});

	it('POSITIVE CONTROL: the sweep really is reading itemInput()', () => {
		// So "the unit line is there" is an answer about the function and not
		// about a slice that happened to be empty or to span the whole file.
		expect(itemInput).toContain('publishAt: scheduleToSend()');
		expect(itemInput).toContain('category: category.trim() || null');
		expect(itemInput.length).toBeLessThan(2500);
	});

	it('the picker is bound to the same `unitId` the payload reads', () => {
		// Two names would be a control that records a choice nowhere the
		// payload looks -- which is what the surviving mutant did by hand.
		expect(src).toContain('bind:value={unitId}');
		expect(src).toContain('data-testid="composer-unit-select"');
	});
});
