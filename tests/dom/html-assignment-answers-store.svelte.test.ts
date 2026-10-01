// tests/dom/html-assignment-answers-store.svelte.test.ts
//
// IS THE ANSWER MIRROR ACTUALLY REACTIVE? `HxAnswersStore` is the one thing
// ledger 0139 added between `HxAnswers` -- which owns "no DOM, no reactivity
// and no client" by its own header -- and `ItemDetail`, which reads
// `htmlAnswers.values` in a `$derived` and posts it into the frame as
// `idea:state`.
//
// THE FAILURE THIS EXISTS FOR IS SILENT. A plain object with the same shape
// passes every read: `store.values` answers correctly at any moment you ask it,
// so a node-project test comparing values after a change is green on a mirror
// that never notifies anything. What would be broken is the frame -- the
// document would show the student's own typing (it holds that itself) and would
// never receive the parent's acknowledged state, so nothing would look wrong
// until a save failed and the refusal never arrived, or a picture landed and
// never appeared.
//
// SO IT IS ASSERTED AS A RE-RUN COUNT INSIDE A REAL EFFECT ROOT, which is only
// possible in this directory: everywhere else in the suite svelte resolves to
// its SERVER build and a bare `$effect.root` invokes its callback ZERO times
// (measured, and written down in `tests/dom/README.md`). A control written
// outside here would be green and vacuous.
//
// THE TRANSPORT IS A RECORDER, NOT A DATABASE. Whether `classroom_save_response`
// accepts what it is handed is `tests/db/html-assignment-wiring.test.ts`'s
// question, against real Postgres. What is measured here is that the store
// forwards to the controller and that the controller's callbacks reach `$state`.

import { describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { HxAnswersStore } from '$lib/classroom/html-assignment/answers-store.svelte';
import type { HxAnswerTransports } from '$lib/classroom/html-assignment/answers';
import type { HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';

const MANIFEST = {
	schemaVersion: 3,
	kind: 'html-assignment',
	title: 'Bench setup',
	course: 'IDEA100',
	points: 2,
	modules: [
		{
			id: 'm1',
			title: 'Module 1',
			points: 2,
			blocks: [{ id: 'm1-setup', field: 'setup', type: 'text' }],
			criteria: []
		}
	]
} as unknown as HtmlAssignmentManifest;

/** Every write recorded; every write accepted. */
function recorder() {
	const saves: { blockId: string; value: unknown }[] = [];
	const transports = {
		saveResponse: async (_item: string, blockId: string, value: unknown) => {
			saves.push({ blockId, value });
			return { ok: true as const, data: { ok: true } };
		},
		uploadSubmissionFile: async () => ({ ok: true as const, data: {} }),
		deleteSubmissionFile: async () => ({ ok: true as const, data: undefined }),
		setFileCaption: async () => ({ ok: true as const, data: { ok: true } })
	} as unknown as HxAnswerTransports;
	return { saves, transports };
}

function store(transports: HxAnswerTransports | null, values?: Record<string, string | boolean>) {
	return new HxAnswersStore({
		itemId: 'item-1',
		manifest: MANIFEST,
		transports,
		values,
		// The debounce is collapsed by `flush()`, exactly as the navigation guard
		// and Submit collapse it. A shorter number here would be a second one.
		wait: async () => {}
	});
}

describe('HxAnswersStore', () => {
	it('seeds from what the database already held, on the first read', () => {
		const s = store(recorder().transports, { setup: '2.50 mm' });
		expect(s.values).toEqual({ setup: '2.50 mm' });
		s.destroy();
	});

	it('a change re-runs an effect reading `values`, and the new value is what it reads', async () => {
		const { saves, transports } = recorder();
		const seen: (string | boolean | undefined)[] = [];
		let s: HxAnswersStore | null = null;
		const stop = $effect.root(() => {
			s = store(transports, {});
			$effect(() => {
				seen.push(s!.values.setup);
			});
		});
		flushSync();
		// THE CONTROL: one run, and it read nothing, so a later run reading the
		// typed value cannot be the first run in disguise.
		expect(seen).toEqual([undefined]);

		s!.change({ blockId: 'm1-setup', field: 'setup', value: '2.50 mm' });
		flushSync();
		expect(seen).toEqual([undefined, '2.50 mm']);

		await s!.flush();
		flushSync();
		// THE STORED SHAPE, WRITTEN OUT RATHER THAN DERIVED. `{ text: ... }` is
		// what `classroom_responses.value` holds for a typed answer, which
		// `tests/db/html-assignment-wiring.test.ts` reads back out of real
		// Postgres; asking `hxStoredValue` for the expectation here would be the
		// implementation grading its own homework.
		expect(saves).toEqual([{ blockId: 'm1-setup', value: { text: '2.50 mm' } }]);
		s!.destroy();
		stop();
	});

	it('an acknowledgement re-runs an effect reading `saved`', async () => {
		const { transports } = recorder();
		const acks: (boolean | undefined)[] = [];
		let s: HxAnswersStore | null = null;
		const stop = $effect.root(() => {
			s = store(transports, {});
			$effect(() => {
				acks.push(s!.saved?.ok);
			});
		});
		flushSync();
		expect(acks).toEqual([undefined]);

		s!.change({ blockId: 'm1-setup', field: 'setup', value: 'measured' });
		await s!.flush();
		flushSync();
		// The controller settles on every attempt, so the effect has seen a true.
		expect(acks.at(-1)).toBe(true);
		s!.destroy();
		stop();
	});

	it('with NO transports every write is refused in words and nothing is dispatched', async () => {
		const { saves, transports } = recorder();
		void transports;
		const s = store(null, {});
		s.change({ blockId: 'm1-setup', field: 'setup', value: 'typed anyway' });
		await s.flush();
		expect(saves).toEqual([]);
		expect(s.saved?.ok).toBe(false);
		expect(s.saved?.reason).toContain('not open for editing');
		// AND NOTHING WAS KEPT. A surface that recorded the value would be the
		// writable-but-unsaving worksheet this whole design refuses.
		expect(s.values).toEqual({});
		s.destroy();
	});

	it('the four writes survive being torn off the object', async () => {
		const { saves, transports } = recorder();
		const s = store(transports, {});
		// A destructured method on a plain class loses `this` and throws on the
		// first private-field read. These are bound properties for exactly that.
		const { change } = s;
		change({ blockId: 'm1-setup', field: 'setup', value: 'torn off' });
		await s.flush();
		expect(saves).toHaveLength(1);
		s.destroy();
	});
});
