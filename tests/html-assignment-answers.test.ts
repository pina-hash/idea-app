// tests/html-assignment-answers.test.ts
//
// THE PARENT'S ANSWER CONTROLLER, ASSERTED WHERE IT FAILS SILENTLY.
//
// Every guarantee here looks completely normal when it is broken. A value codec
// that stores one shape and reads back another produces a worksheet that saves
// perfectly and opens EMPTY the next morning. A debounce shared across blocks
// looks like a working autosave right up to the moment a student fills in six
// modules quickly and five of them are never sent. A considered refusal treated
// as a transient asks the database the same question five times over twelve
// seconds and shows the student the same sentence at the end of it. None of it
// type-checks wrong, none of it errors, and none of it is visible in a
// screenshot.
//
// WHERE THE EXPECTED VALUES COME FROM. The transports are stand-ins that write
// into a plain Map the test reads DIRECTLY, so "did this land" is answered by
// the Map and never by asking the controller what it believes. The manifest is
// written out by hand from the contract. The sentence counts are counted by
// hand -- not recomputed from `countSentences`, which is the thing they are
// checking is being used.
//
// NO DOM AND NO DATABASE. This file is about the rules; the round trip through
// real Postgres is `tests/db/html-assignment-round-trip.test.ts`, and the two
// answer different questions.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	HX_REFUSALS,
	HxAnswers,
	hxBlockFieldMap,
	hxBridgeValue,
	hxFileIdsByField,
	hxImagesFromFiles,
	hxIncompleteBlocks,
	hxSaveOutcome,
	hxStoredValue,
	hxSubmitRefusal,
	hxValuesFromResponses,
	type HxAnswerTransports
} from '../src/lib/classroom/html-assignment/answers';
import { HX_SCHEMA_VERSION } from '../src/lib/classroom/html-assignment/bridge';
import type { HtmlAssignmentManifest } from '../src/lib/classroom/html-assignment/manifest';
import type { SubmissionFileRow } from '../src/lib/classroom/assignment-spec';

// ---------------------------------------------------------------------------
// The fixture. Two modules, an identity header, one image block, one block
// carrying a sentence floor. Written out by hand from the contract.
//
// THE FIELDS AND THE BLOCK IDS ARE DELIBERATELY DIFFERENT STRINGS, for the
// reason `_documents.ts` gives about its own fixture: if they were spelled the
// same, every assertion about the mapping would pass whether or not the mapping
// ran, because the identity function cannot be observed.
// ---------------------------------------------------------------------------

function manifest(): HtmlAssignmentManifest {
	return {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Bench setup',
		course: 'IDEA100',
		points: 10,
		header: [{ id: 'who', field: 'studentName', type: 'text' }],
		modules: [
			{
				id: 'm1',
				title: 'Measure it',
				points: 6,
				blocks: [
					{ id: 'm1-reading', field: 'reading', type: 'text' },
					{ id: 'm1-why', field: 'why', type: 'longText', minSentences: 2 },
					{ id: 'm1-shot', field: 'benchPhoto', type: 'image' }
				],
				criteria: []
			},
			{
				id: 'm2',
				title: 'Check it',
				points: 4,
				blocks: [
					{ id: 'm2-done', field: 'checkedOff', type: 'checkbox' },
					{ id: 'm2-note', field: 'note', type: 'longText', minSentences: 3 }
				],
				criteria: []
			}
		]
	};
}

// ---------------------------------------------------------------------------
// A stand-in for the server. The Map is what the assertions read.
// ---------------------------------------------------------------------------

type Row = { blockId: string; value: unknown };

interface Store {
	rows: Map<string, Row>;
	saveCalls: string[];
	uploads: { blockId: string | null; name: string; bytes: number; caption: string | null }[];
	deletes: string[];
	captions: { fileId: string; caption: string }[];
	/** How the next N saves should answer. */
	failNext: number;
	failMode: 'transient' | 'locked';
}

function makeStore(): Store {
	return {
		rows: new Map(),
		saveCalls: [],
		uploads: [],
		deletes: [],
		captions: [],
		failNext: 0,
		failMode: 'transient'
	};
}

function transportsFor(store: Store): HxAnswerTransports {
	return {
		async saveResponse(_itemId, blockId, value) {
			store.saveCalls.push(blockId);
			if (store.failNext > 0) {
				store.failNext -= 1;
				if (store.failMode === 'locked') {
					// THE SHAPE A CONSIDERED REFUSAL ACTUALLY ARRIVES IN: the call
					// succeeded and the RPC answered `{ok:false, reason}`. The route
					// and the function are both working; a submitted assignment is
					// not an error.
					return { ok: true, data: { ok: false, reason: 'locked' } };
				}
				return { ok: false, message: 'deadlock detected', retryable: true };
			}
			store.rows.set(blockId, { blockId, value });
			return { ok: true, data: { ok: true } };
		},
		async uploadSubmissionFile(_itemId, file, blockId = null, caption = null) {
			store.uploads.push({
				blockId,
				name: file.name,
				bytes: file.size,
				caption
			});
			return {
				ok: true,
				data: {
					file: {
						id: `file-${store.uploads.length}`,
						submission_id: 'sub-1',
						block_id: blockId,
						caption,
						filename: file.name,
						mime_type: 'application/octet-stream',
						sort_order: store.uploads.length
					} as SubmissionFileRow
				}
			};
		},
		async deleteSubmissionFile(fileId) {
			store.deletes.push(fileId);
			return { ok: true, data: { ok: true } };
		},
		async setFileCaption(fileId, caption) {
			store.captions.push({ fileId, caption });
			return { ok: true, data: { ok: true } };
		}
	};
}

/** Let queued microtasks settle, the tests/save-state.test.ts convention. */
const settle = async () => {
	for (let i = 0; i < 12; i++) await Promise.resolve();
};

const AT = 1_700_000_000_000;

function controller(store: Store | null, overrides: Record<string, unknown> = {}) {
	return new HxAnswers({
		itemId: 'item-1',
		manifest: manifest(),
		transports: store ? transportsFor(store) : null,
		now: () => AT,
		...overrides
	});
}

// ---------------------------------------------------------------------------
// The codec. Both directions, because only both directions is a round trip.
// ---------------------------------------------------------------------------

describe('the value codec', () => {
	it('stores a string as text and a boolean as a one-element checked array', () => {
		expect(hxStoredValue('two point five')).toEqual({ text: 'two point five' });
		expect(hxStoredValue('')).toEqual({ text: '' });
		expect(hxStoredValue(true)).toEqual({ checked: [true] });
		expect(hxStoredValue(false)).toEqual({ checked: [false] });
	});

	it('reads every stored shape back to exactly what went in', () => {
		for (const value of ['a sentence.', '', true, false] as const) {
			expect(hxBridgeValue(hxStoredValue(value))).toBe(value);
		}
	});

	it('answers null for a row nobody has answered, which is not the same as false', () => {
		// The distinction is what keeps an unanswered field out of `idea:state`
		// entirely. A codec answering `false` here tells a document a checkbox is
		// unticked when nobody has been asked.
		expect(hxBridgeValue(null)).toBeNull();
		expect(hxBridgeValue(undefined)).toBeNull();
		expect(hxBridgeValue({})).toBeNull();
		expect(hxBridgeValue({ rows: [{ a: 'b' }] })).toBeNull();
		expect(hxBridgeValue({ checked: [] })).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Restore.
// ---------------------------------------------------------------------------

describe('restore, from stored rows to what the document opens on', () => {
	it('maps block ids back to FIELDS, the header included', () => {
		const values = hxValuesFromResponses(manifest(), [
			{ block_id: 'who', value: { text: 'Ana Reyes' } },
			{ block_id: 'm1-reading', value: { text: '2.50' } },
			{ block_id: 'm2-done', value: { checked: [true] } }
		]);
		expect(values).toEqual({ studentName: 'Ana Reyes', reading: '2.50', checkedOff: true });
		// The keys are the DOCUMENT's names, never the database's. A restore
		// keyed by block id seeds nothing and looks like an empty worksheet.
		expect(Object.keys(values)).not.toContain('m1-reading');
	});

	it('drops a row whose block the manifest no longer declares, and says nothing about it', () => {
		// A re-uploaded document whose author removed a module leaves exactly
		// these rows behind. They stay in the table for the grading console; they
		// simply have no field to be seeded into.
		const values = hxValuesFromResponses(manifest(), [
			{ block_id: 'm1-reading', value: { text: '2.50' } },
			{ block_id: 'gone-module-block', value: { text: 'orphaned' } }
		]);
		expect(values).toEqual({ reading: '2.50' });
	});

	it('inverts the manifest map, and the inverse agrees with the forward one', () => {
		const m = manifest();
		const back = hxBlockFieldMap(m);
		expect(back.get('m1-why')).toBe('why');
		expect(back.get('who')).toBe('who' === 'who' ? 'studentName' : '');
		expect(back.size).toBe(6);
	});
});

describe('restore, pictures', () => {
	const file = (over: Partial<SubmissionFileRow>): SubmissionFileRow =>
		({
			id: 'f1',
			submission_id: 'sub-1',
			block_id: 'm1-shot',
			caption: null,
			filename: 'bench.jpg',
			mime_type: 'application/octet-stream',
			sort_order: 1,
			...over
		}) as SubmissionFileRow;

	it('returns a URL and never bytes, keyed by field', () => {
		const images = hxImagesFromFiles(manifest(), [file({ caption: 'The vise' })]);
		expect(images).toEqual({
			benchPhoto: { url: '/api/classroom/submission-file/f1', name: 'bench.jpg', caption: 'The vise' }
		});
		expect(images.benchPhoto.url.startsWith('data:')).toBe(false);
	});

	it('keeps the NEWEST picture when a field carries two, whatever order they arrive in', () => {
		// Replacing a photograph without removing the old one leaves two rows,
		// and the document shows one. The newest is the one the student just
		// took; picking the other shows them the picture they replaced.
		const rows = [
			file({ id: 'old', sort_order: 1, filename: 'first.jpg' }),
			file({ id: 'new', sort_order: 4, filename: 'second.jpg' })
		];
		expect(hxImagesFromFiles(manifest(), rows).benchPhoto.name).toBe('second.jpg');
		expect(hxImagesFromFiles(manifest(), [...rows].reverse()).benchPhoto.name).toBe('second.jpg');
		expect(hxFileIdsByField(manifest(), rows).get('benchPhoto')).toBe('new');
	});

	it('skips a hand-in with no block, and one naming a block the manifest dropped', () => {
		const images = hxImagesFromFiles(manifest(), [
			file({ id: 'loose', block_id: null }),
			file({ id: 'stale', block_id: 'gone-block' })
		]);
		// A plain hand-in belongs in parent chrome, not in a field the document
		// owns. Positive control that the sweep is capable of finding one:
		expect(images).toEqual({});
		expect(Object.keys(hxImagesFromFiles(manifest(), [file({})]))).toEqual(['benchPhoto']);
	});
});

// ---------------------------------------------------------------------------
// Completeness -- the parent's own gate on Submit.
// ---------------------------------------------------------------------------

describe('the completeness check', () => {
	it('counts sentences against each block minSentences, and names the shortfall', () => {
		// Counted by hand: one sentence in `why` against a floor of 2; two in
		// `note` against a floor of 3.
		const short = hxIncompleteBlocks(manifest(), {
			why: 'I measured it twice.',
			note: 'The jaw was loose. I tightened it.'
		});
		expect(short.map((b) => [b.blockId, b.need, b.have])).toEqual([
			['m1-why', 2, 1],
			['m2-note', 3, 2]
		]);
		expect(short[0].moduleTitle).toBe('Measure it');
	});

	it('uses the ONE sentence counter, decimals and abbreviations included', () => {
		// `countSentences` protects a decimal point and an abbreviation; a second
		// counter written here would score this 4 and let the student submit.
		const short = hxIncompleteBlocks(manifest(), { why: 'It read 2.50 mm approx. once.' });
		expect(short.find((b) => b.blockId === 'm1-why')).toEqual({
			blockId: 'm1-why',
			field: 'why',
			moduleId: 'm1',
			moduleTitle: 'Measure it',
			need: 2,
			have: 1
		});
	});

	it('asks nothing of a block that declares no floor', () => {
		// `reading`, `checkedOff`, `benchPhoto` and the header field carry no
		// minSentences, so there is nothing to be short of. Absence is the
		// mechanism: an `HtmlBlock` has no minImages and no required flag, and
		// inventing one here would be this file deciding what a document needs.
		const short = hxIncompleteBlocks(manifest(), {
			why: 'One. Two.',
			note: 'One. Two. Three.'
		});
		expect(short).toEqual([]);
		expect(hxSubmitRefusal(short)).toBeNull();
	});

	it('refuses with a count and the first module, and never with a list', () => {
		const short = hxIncompleteBlocks(manifest(), {});
		expect(short).toHaveLength(2);
		const said = hxSubmitRefusal(short)!;
		expect(said).toContain('2 answers');
		expect(said).toContain('Measure it');
		expect(said).not.toContain('Check it');
	});

	it('reads a boolean as zero sentences rather than throwing', () => {
		const m = manifest();
		m.modules[1].blocks[0].minSentences = 1;
		const short = hxIncompleteBlocks(m, { checkedOff: true });
		expect(short.map((b) => b.blockId)).toContain('m2-done');
	});
});

// ---------------------------------------------------------------------------
// The retry decision.
// ---------------------------------------------------------------------------

describe('a considered refusal and a transient are different outcomes', () => {
	it('treats a landed {ok:false, reason:locked} as a refusal, with the shared sentence', () => {
		expect(hxSaveOutcome({ ok: true, data: { ok: false, reason: 'locked' } })).toEqual({
			ok: false,
			retryable: false,
			message: HX_REFUSALS.locked
		});
	});

	it('believes a transport that named itself retryable', () => {
		expect(hxSaveOutcome({ ok: false, message: 'deadlock detected', retryable: true })).toEqual({
			ok: false,
			retryable: true,
			message: 'deadlock detected'
		});
	});

	it('reads a NAMED transient SQLSTATE as retryable and everything else as a refusal', () => {
		// 40P01 is on `$lib/pg-errors`' whitelist; P0001 is a `raise` and is a
		// decision about the payload. An ABSENT code is not a transient, which is
		// that module's own stated rule and is the case this transport is in.
		const retryable = (code?: string) => {
			const out = hxSaveOutcome({ ok: false, message: 'x', ...(code ? { code } : {}) });
			return out.ok ? null : out.retryable;
		};
		expect(retryable('40P01')).toBe(true);
		expect(retryable('P0001')).toBe(false);
		expect(retryable()).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// THE CONTROLLER. The debounce is per block, which is the whole reason this
// class exists rather than one machine over the surface.
// ---------------------------------------------------------------------------

describe('HxAnswers: writing', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('debounces PER BLOCK, so a later module never cancels an earlier one', async () => {
		const store = makeStore();
		const hx = controller(store);

		// A block's own window is its own: nothing is dispatched inside it.
		hx.change({ blockId: 'who', field: 'studentName', value: 'Ana Reyes' });
		await vi.advanceTimersByTimeAsync(200);
		expect(store.saveCalls).toEqual([]);

		// Five modules' worth of typing, each inside the previous block's window.
		// WITH ONE MACHINE OVER THE SURFACE every one of these re-arms the same
		// timer, so exactly ONE call is ever made and it is for the LAST block --
		// the other four answers are simply never sent, which is the silent
		// failure this whole shape exists to prevent. Per block, all five settle
		// on their own clocks and the count below is 5 rather than 1.
		hx.change({ blockId: 'm1-reading', field: 'reading', value: '2.50' });
		await vi.advanceTimersByTimeAsync(200);
		hx.change({ blockId: 'm1-why', field: 'why', value: 'Because the jaw slipped.' });
		await vi.advanceTimersByTimeAsync(200);
		hx.change({ blockId: 'm2-done', field: 'checkedOff', value: true });
		await vi.advanceTimersByTimeAsync(200);
		hx.change({ blockId: 'm2-note', field: 'note', value: 'It is square now.' });

		await vi.advanceTimersByTimeAsync(1000);
		await settle();

		// In TYPING order, which a shared machine could not produce at all.
		expect(store.saveCalls).toEqual([
			'who',
			'm1-reading',
			'm1-why',
			'm2-done',
			'm2-note'
		]);
		expect([...store.rows.keys()].sort()).toEqual([
			'm1-reading',
			'm1-why',
			'm2-done',
			'm2-note',
			'who'
		]);
		expect(store.rows.get('m2-done')!.value).toEqual({ checked: [true] });
		expect(store.rows.get('who')!.value).toEqual({ text: 'Ana Reyes' });
		hx.destroy();
	});

	it('sends the NEWEST value for a block, not the one that armed the debounce', async () => {
		const store = makeStore();
		const hx = controller(store);
		hx.change({ blockId: 'm1-reading', field: 'reading', value: '2.4' });
		await vi.advanceTimersByTimeAsync(300);
		hx.change({ blockId: 'm1-reading', field: 'reading', value: '2.50' });
		await vi.advanceTimersByTimeAsync(1000);
		await settle();
		expect(store.saveCalls).toEqual(['m1-reading']);
		expect(store.rows.get('m1-reading')!.value).toEqual({ text: '2.50' });
		hx.destroy();
	});

	it('answers a considered refusal ONCE and hands the document the reason', async () => {
		const store = makeStore();
		store.failNext = 5;
		store.failMode = 'locked';
		const acks: { ok: boolean; reason?: string | null }[] = [];
		const hx = controller(store, { onsaved: (a: never) => acks.push(a) });

		hx.change({ blockId: 'm1-reading', field: 'reading', value: '2.50' });
		await vi.advanceTimersByTimeAsync(20_000);
		await settle();

		// ONE call, not five. Retrying a decision about the payload is how a UI
		// asks the same question five times over twelve seconds.
		expect(store.saveCalls).toEqual(['m1-reading']);
		expect(acks.at(-1)!.ok).toBe(false);
		expect(acks.at(-1)!.reason).toBe(HX_REFUSALS.locked);
		hx.destroy();
	});

	it('retries a named transient and lands the value, which is the positive control', async () => {
		const store = makeStore();
		store.failNext = 2;
		store.failMode = 'transient';
		const hx = controller(store);
		hx.change({ blockId: 'm1-reading', field: 'reading', value: '2.50' });
		await vi.advanceTimersByTimeAsync(20_000);
		await settle();
		expect(store.saveCalls.length).toBe(3);
		expect(store.rows.get('m1-reading')!.value).toEqual({ text: '2.50' });
		hx.destroy();
	});

	it('refuses an answer over the database cap before the request is made, naming the limit', async () => {
		const store = makeStore();
		const acks: { ok: boolean; reason?: string | null }[] = [];
		const hx = controller(store, { onsaved: (a: never) => acks.push(a) });
		hx.change({ blockId: 'm1-why', field: 'why', value: 'x'.repeat(100_001) });
		await vi.advanceTimersByTimeAsync(2000);
		await settle();
		expect(store.saveCalls).toEqual([]);
		expect(acks.at(-1)!.reason).toContain('100,000');
		hx.destroy();
	});
});

describe('HxAnswers: what goes back down', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('builds idea:saved through the bridge, with the schema version on every one', async () => {
		const store = makeStore();
		const hx = controller(store);
		hx.change({ blockId: 'm1-reading', field: 'reading', value: '2.50' });
		await vi.advanceTimersByTimeAsync(1000);
		await settle();
		const message = hx.savedMessage()!;
		expect(message).toEqual({
			type: 'idea:saved',
			at: new Date(AT).toISOString(),
			ok: true,
			schemaVersion: HX_SCHEMA_VERSION
		});
		// A reason beside ok:true would be a document rendering an explanation
		// for something that worked.
		expect('reason' in message).toBe(false);
		hx.destroy();
	});

	it('carries a reason whenever ok is false, and never an empty one', async () => {
		const store = makeStore();
		store.failNext = 1;
		store.failMode = 'locked';
		const hx = controller(store);
		hx.change({ blockId: 'm1-reading', field: 'reading', value: '2.50' });
		await vi.advanceTimersByTimeAsync(1000);
		await settle();
		const message = hx.savedMessage() as { ok: boolean; reason?: string };
		expect(message.ok).toBe(false);
		expect(message.reason).toBe(HX_REFUSALS.locked);
		hx.destroy();
	});

	it('opens the document on the values and images it was seeded with', () => {
		const hx = controller(makeStore(), {
			values: { reading: '2.50', checkedOff: true },
			images: { benchPhoto: { url: '/api/classroom/submission-file/f1', name: 'b.jpg', caption: '' } }
		});
		expect(hx.stateMessage()).toEqual({
			type: 'idea:state',
			values: { reading: '2.50', checkedOff: true },
			images: {
				benchPhoto: { url: '/api/classroom/submission-file/f1', name: 'b.jpg', caption: '' }
			},
			readOnly: false
		});
	});
});

describe('HxAnswers: pictures', () => {
	it('decodes base64 into the ordinary submission upload, keyed to the block', async () => {
		const store = makeStore();
		const hx = controller(store);
		// "hello" as base64, in the data-URL form a ported document's own
		// FileReader produces.
		await hx.image({
			blockId: 'm1-shot',
			field: 'benchPhoto',
			name: 'bench.jpg',
			bytes: 'data:image/jpeg;base64,aGVsbG8='
		});
		expect(store.uploads).toEqual([
			{ blockId: 'm1-shot', name: 'bench.jpg', bytes: 5, caption: null }
		]);
		expect(hx.images.benchPhoto.url).toBe('/api/classroom/submission-file/file-1');
		expect(hx.saved!.ok).toBe(true);
	});

	it('removes the row standing for the field, and treats a second remove as done', async () => {
		const store = makeStore();
		const hx = controller(store);
		await hx.image({ blockId: 'm1-shot', field: 'benchPhoto', name: 'b.jpg', bytes: 'aGVsbG8=' });
		await hx.imageRemove({ blockId: 'm1-shot', field: 'benchPhoto' });
		expect(store.deletes).toEqual(['file-1']);
		expect(hx.images.benchPhoto).toBeUndefined();
		// Asking twice has got the document what it wanted. Reporting a failure
		// here would put a sentence in front of a student about nothing.
		await hx.imageRemove({ blockId: 'm1-shot', field: 'benchPhoto' });
		expect(store.deletes).toEqual(['file-1']);
		expect(hx.saved!.ok).toBe(true);
	});

	it('captions the file rather than the filename', async () => {
		const store = makeStore();
		const hx = controller(store);
		await hx.image({ blockId: 'm1-shot', field: 'benchPhoto', name: 'b.jpg', bytes: 'aGVsbG8=' });
		await hx.imageCaption({ blockId: 'm1-shot', field: 'benchPhoto', caption: 'The vise jaw' });
		expect(store.captions).toEqual([{ fileId: 'file-1', caption: 'The vise jaw' }]);
		expect(hx.images.benchPhoto.caption).toBe('The vise jaw');
		expect(hx.images.benchPhoto.name).toBe('b.jpg');
	});
});

// ---------------------------------------------------------------------------
// Read-only. Both directions with counts, per the verification standard.
// ---------------------------------------------------------------------------

describe('no transports is read-only, structurally', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('has no write to execute, and says why rather than going quiet', async () => {
		const store = makeStore();
		const hx = controller(null);

		hx.change({ blockId: 'm1-reading', field: 'reading', value: '2.50' });
		await hx.image({ blockId: 'm1-shot', field: 'benchPhoto', name: 'b.jpg', bytes: 'aGVsbG8=' });
		await hx.imageRemove({ blockId: 'm1-shot', field: 'benchPhoto' });
		await hx.imageCaption({ blockId: 'm1-shot', field: 'benchPhoto', caption: 'x' });
		await vi.advanceTimersByTimeAsync(5000);
		await settle();

		// ABSENT: 0 saves, 0 uploads, 0 deletes, 0 captions, and no value kept.
		expect(store.saveCalls).toEqual([]);
		expect(store.uploads).toEqual([]);
		expect(store.deletes).toEqual([]);
		expect(store.captions).toEqual([]);
		expect(hx.values).toEqual({});
		// PRESENT: the document is told, and told why.
		expect(hx.saved!.ok).toBe(false);
		expect(hx.saved!.reason).toBe(HX_REFUSALS.readOnly);
		expect(hx.stateMessage()).toMatchObject({ readOnly: true });

		// THE POSITIVE CONTROL, on the same fixture with transports handed in:
		// 5 saves, 1 upload, 1 delete, 1 caption.
		const live = controller(store);
		live.change({ blockId: 'who', field: 'studentName', value: 'Ana' });
		live.change({ blockId: 'm1-reading', field: 'reading', value: '2.50' });
		live.change({ blockId: 'm1-why', field: 'why', value: 'One. Two.' });
		live.change({ blockId: 'm2-done', field: 'checkedOff', value: true });
		live.change({ blockId: 'm2-note', field: 'note', value: 'One. Two. Three.' });
		await vi.advanceTimersByTimeAsync(2000);
		await settle();
		await live.image({ blockId: 'm1-shot', field: 'benchPhoto', name: 'b.jpg', bytes: 'aGVsbG8=' });
		await live.imageCaption({ blockId: 'm1-shot', field: 'benchPhoto', caption: 'x' });
		await live.imageRemove({ blockId: 'm1-shot', field: 'benchPhoto' });
		expect(store.saveCalls).toHaveLength(5);
		expect(store.uploads).toHaveLength(1);
		expect(store.captions).toHaveLength(1);
		expect(store.deletes).toHaveLength(1);
		expect(live.stateMessage()).toMatchObject({ readOnly: false });
		live.destroy();
		hx.destroy();
	});
});
