// tests/html-assignment-save-retry.test.ts
//
// A WORKSHEET ANSWER THAT DID NOT GET THROUGH IS SENT AGAIN; ONE THE SERVER
// REFUSED IS NOT (ledger 0360, reports d983e776 and 2d83c063).
//
// Through the 2026-09-29 database stall every save on every ported worksheet
// timed out (57014) and was dropped after ONE attempt, because the answer
// transport built its failure through `fail()`, which keeps the message and
// throws the SQLSTATE and the status away. Nothing on screen distinguished
// that from a refusal, and the rail read 100% over answers the server never
// got. The failure is invisible in normal use (the database is fast), which is
// why the transport half is MUTATION-PROVEN: put `fail(error)` back and the
// 57014 and status-0 assertions redden.
//
// THE REAL TRANSPORT, OVER A FAKE CLIENT. `createHtmlAnswerTransports` is
// imported from its own file and handed an object with an `rpc` that answers
// whatever a case says, in postgrest-js's own shape (`{ data, error, status }`,
// status 0 for a fetch that never left). Then the REAL `HxAnswers` is driven
// over that transport with an injected sleep, and the attempt count is read
// off the fake, never off the controller.

import { describe, expect, it } from 'vitest';
import { createHtmlAnswerTransports } from '$lib/classroom/transports';
import {
	HX_REFUSALS,
	HxAnswers,
	hxFailureKind,
	hxRpcFailure
} from '$lib/classroom/html-assignment/answers';
import type { HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';

type Answer = { data: unknown; error: { code?: string; message?: string } | null; status: number };

const OK: Answer = { data: { ok: true }, error: null, status: 200 };
const TIMEOUT: Answer = {
	data: null,
	error: { code: '57014', message: 'canceling statement due to statement timeout' },
	status: 500
};
const UNREACHABLE: Answer = { data: null, error: { code: '', message: 'TypeError: fetch failed' }, status: 0 };
const REFUSED: Answer = {
	data: null,
	error: { code: 'P0001', message: 'Only a student enrolled in this class can answer it.' },
	status: 400
};
const SIGNED_OUT: Answer = {
	data: null,
	error: { code: '42501', message: 'permission denied for function classroom_save_response' },
	status: 403
};
const RACE: Answer = { data: null, error: { code: '23505', message: 'duplicate key' }, status: 409 };

/** A client whose `rpc` answers from a script, recording every call. */
function fakeClient(script: Answer[]) {
	const calls: { fn: string; args: Record<string, unknown> }[] = [];
	const client = {
		rpc(fn: string, args: Record<string, unknown>) {
			calls.push({ fn, args });
			const next = script.length > 1 ? script.shift()! : script[0];
			return Promise.resolve(next);
		}
	};
	return { client: client as never, calls };
}

describe('the transport carries whether a failure is worth sending again', () => {
	const cases: [string, Answer, boolean][] = [
		['a statement timeout (57014, status 500)', TIMEOUT, true],
		['a fetch that never reached the server (status 0)', UNREACHABLE, true],
		['a unique-violation race (23505, status 409): the transient code wins', RACE, true],
		['a considered refusal (P0001, status 400)', REFUSED, false],
		['a lost session (42501, status 403)', SIGNED_OUT, false]
	];
	for (const [name, answer, retryable] of cases) {
		it(name, async () => {
			const { client, calls } = fakeClient([answer]);
			const res = await createHtmlAnswerTransports(client).saveResponse('item-1', 'b-1', { text: 'x' });
			expect(res.ok).toBe(false);
			expect(!res.ok && res.retryable === true).toBe(retryable);
			// THE SAME RPC, THE SAME THREE ARGUMENTS: not a second write path.
			expect(calls).toEqual([
				{ fn: 'classroom_save_response', args: { p_item_id: 'item-1', p_block_id: 'b-1', p_value: { text: 'x' } } }
			]);
		});
	}

	it('a success is the opResult it always was', async () => {
		const { client } = fakeClient([OK]);
		expect(await createHtmlAnswerTransports(client).saveResponse('item-1', 'b-1', { text: 'x' })).toEqual({
			ok: true,
			data: { ok: true }
		});
	});

	it('the words: a refusal keeps its own sentence, a busy server and a lost session get the student’s terms', () => {
		expect(hxRpcFailure(REFUSED.error, 400).message).toBe(REFUSED.error!.message);
		expect(hxRpcFailure(TIMEOUT.error, 500).message).toBe(HX_REFUSALS.busy);
		expect(hxRpcFailure(SIGNED_OUT.error, 403).message).toBe(HX_REFUSALS.signedOut);
		// No raw database sentence reaches a student on the busy path.
		expect(HX_REFUSALS.busy).not.toMatch(/statement|timeout|postgres|rpc/i);
		// No em dash in either new sentence.
		expect(`${HX_REFUSALS.busy}${HX_REFUSALS.signedOut}`).not.toContain('—');
	});

	it('an absent status with no transient code is NOT retried (pg-errors’ own rule)', () => {
		expect(hxRpcFailure({ message: 'boom' }, undefined).retryable).toBe(false);
		expect(hxRpcFailure({ code: '40P01', message: 'deadlock' }, undefined).retryable).toBe(true);
	});

	it('the kinds: a lost session is its own kind, so a landed write can re-send it', () => {
		const signed = hxRpcFailure(SIGNED_OUT.error, 403);
		expect(hxFailureKind(signed, { ok: false, retryable: false, message: signed.message })).toBe('signed-out');
		const busy = hxRpcFailure(TIMEOUT.error, 500);
		expect(hxFailureKind(busy, { ok: false, retryable: true, message: busy.message })).toBe('transient');
		const refused = hxRpcFailure(REFUSED.error, 400);
		expect(hxFailureKind(refused, { ok: false, retryable: false, message: refused.message })).toBe('refusal');
	});
});

// ---------------------------------------------------------------------------
// The controller over the real transport.
// ---------------------------------------------------------------------------

function manifest(): HtmlAssignmentManifest {
	return {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Concept sketches',
		course: 'IDEA100',
		points: 4,
		header: [],
		modules: [
			{
				id: 'm1',
				title: 'Concepts',
				points: 4,
				blocks: [
					{ id: 'b-one', field: 'conceptOne', type: 'longText' },
					{ id: 'b-two', field: 'conceptTwo', type: 'longText' }
				],
				criteria: []
			}
		]
	};
}

function controller(script: Answer[]) {
	const { client, calls } = fakeClient(script);
	const waits: number[] = [];
	const answers = new HxAnswers({
		itemId: 'item-1',
		manifest: manifest(),
		transports: createHtmlAnswerTransports(client),
		debounceMs: 1,
		wait: async (ms) => {
			waits.push(ms);
		}
	});
	return { answers, calls, waits };
}

const settle = () => new Promise((r) => setTimeout(r, 20));

describe('HxAnswers over the real transport', () => {
	it('a statement timeout then success: two attempts, saved, nothing unsaved', async () => {
		const { answers, calls } = controller([TIMEOUT, OK]);
		answers.change({ blockId: 'b-one', field: 'conceptOne', value: 'A cam follower.' });
		expect(answers.unsavedFields()).toEqual(['conceptOne']);
		await answers.flush();
		expect(calls).toHaveLength(2);
		expect(answers.unsavedFields()).toEqual([]);
		expect(answers.worstMachine()?.phase).toBe('saved');
		expect(answers.acknowledged()).toEqual({ 'b-one': { text: 'A cam follower.' } });
	});

	it('a timeout that never clears: FOUR attempts, then failed, with the busy sentence and the work still unsaved', async () => {
		const { answers, calls, waits } = controller([TIMEOUT]);
		answers.change({ blockId: 'b-one', field: 'conceptOne', value: 'A cam follower.' });
		await answers.flush();
		expect(calls).toHaveLength(4);
		expect(waits).toHaveLength(3);
		const worst = answers.worstMachine();
		expect(worst?.phase).toBe('failed');
		expect(worst?.message).toBe(HX_REFUSALS.busy);
		expect(answers.unsavedFields()).toEqual(['conceptOne']);
		expect(answers.saved?.ok).toBe(false);
	});

	it('a lost session: EXACTLY one attempt, failed, never retried, and the signed-out sentence', async () => {
		const { answers, calls } = controller([SIGNED_OUT]);
		answers.change({ blockId: 'b-one', field: 'conceptOne', value: 'A cam follower.' });
		await answers.flush();
		expect(calls).toHaveLength(1);
		expect(answers.worstMachine()?.message).toBe(HX_REFUSALS.signedOut);
	});

	it('a considered refusal: exactly one attempt, its own words', async () => {
		const { answers, calls } = controller([REFUSED]);
		answers.change({ blockId: 'b-one', field: 'conceptOne', value: 'x' });
		await answers.flush();
		expect(calls).toHaveLength(1);
		expect(answers.worstMachine()?.message).toBe(REFUSED.error!.message);
	});

	it('typing in ANOTHER answer re-sends a block that spent its retries on a busy server', async () => {
		const { answers, calls } = controller([TIMEOUT, TIMEOUT, TIMEOUT, TIMEOUT, OK]);
		answers.change({ blockId: 'b-one', field: 'conceptOne', value: 'first' });
		await answers.flush();
		expect(calls).toHaveLength(4);
		answers.change({ blockId: 'b-two', field: 'conceptTwo', value: 'second' });
		await settle();
		await answers.flush();
		const sentFor = calls.slice(4).map((c) => c.args.p_block_id).sort();
		expect(sentFor).toEqual(['b-one', 'b-two']);
		expect(answers.unsavedFields()).toEqual([]);
	});

	it('THE CONTROL: typing elsewhere does NOT re-send a REFUSED block', async () => {
		const { answers, calls } = controller([REFUSED, OK]);
		answers.change({ blockId: 'b-one', field: 'conceptOne', value: 'first' });
		await answers.flush();
		expect(calls).toHaveLength(1);
		// NO `flush()` here: a flush is "write everything owed" and re-sends a
		// failed block by design (the navigation guard's call). What is under
		// test is that TYPING, and the write it causes landing, do not.
		answers.change({ blockId: 'b-two', field: 'conceptTwo', value: 'second' });
		await settle();
		await settle();
		expect(calls.slice(1).map((c) => c.args.p_block_id)).toEqual(['b-two']);
		expect(answers.unsavedFields()).toEqual(['conceptOne']);
	});

	it('a write that LANDS re-sends a block that stopped on a lost session (one Retry sends everything owed)', async () => {
		const { answers, calls } = controller([SIGNED_OUT, OK]);
		answers.change({ blockId: 'b-one', field: 'conceptOne', value: 'first' });
		await answers.flush();
		expect(calls).toHaveLength(1);
		// Typing elsewhere is the second write; it lands, and b-one follows.
		answers.change({ blockId: 'b-two', field: 'conceptTwo', value: 'second' });
		await settle();
		await answers.flush();
		await settle();
		await answers.flush();
		expect(calls.slice(1).map((c) => c.args.p_block_id).sort()).toEqual(['b-one', 'b-two']);
		expect(answers.unsavedFields()).toEqual([]);
	});
});
