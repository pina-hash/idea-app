import { describe, expect, it, vi } from 'vitest';
import { createIdeacadStore } from '../src/lib/ideacad/store';
import type {
	IdeacadConceptRow,
	IdeacadOpenDocumentResult,
	IdeacadTransports
} from '../src/lib/ideacad/transports';

const row = (features: unknown, revision = 1): IdeacadConceptRow => ({
	id: 'concept-1',
	document_id: 'document-1',
	name: 'Concept 1',
	position: 1,
	features,
	revision,
	committed_at: null,
	deleted_at: null,
	created_at: '2026-01-01',
	updated_at: '2026-01-01'
});

const opened = (): IdeacadOpenDocumentResult => ({
	document: {
		id: 'document-1', item_id: 'item-1', student_email: 'student@boscotech.net',
		active_concept_id: 'concept-1', created_at: '2026-01-01', updated_at: '2026-01-01'
	},
	concepts: [row({ value: 0 })],
	prediction: null,
	config: {}
});

function transport(saveConcept: IdeacadTransports['saveConcept']): IdeacadTransports {
	return {
		live: { sendPing() {}, subscribePings: () => () => {}, sendFrame() {}, subscribeFrames: () => () => {}, destroy() {} },
		setEditor: vi.fn(), openDocument: vi.fn(async () => opened()), newConcept: vi.fn(),
		saveConcept, updateConceptMeta: vi.fn(), deleteConcept: vi.fn(), setActive: vi.fn(),
		setPrediction: vi.fn(), commitConcept: vi.fn(), roster: vi.fn()
	};
}

describe('IdeaCAD document store autosave', () => {
	it('coalesces rapid edits into one write containing only the newest work', async () => {
		vi.useFakeTimers();
		const save = vi.fn(async (_id: string, features: unknown, revision: number) => ({
			ok: true as const, concept: row(features, revision)
		}));
		const store = createIdeacadStore(transport(save), { debounceMs: 50 });
		await store.open('item-1');
		store.edit({ value: 1 });
		store.edit({ value: 2 });
		store.edit({ value: 3 });
		await vi.advanceTimersByTimeAsync(50);
		expect(save).toHaveBeenCalledOnce();
		expect(save).toHaveBeenCalledWith('concept-1', { value: 3 }, 4);
		expect(store.state.phase).toBe('saved');
		vi.useRealTimers();
	});

	it('writes the newest edit after an older write already in flight', async () => {
		let release!: () => void;
		const first = new Promise<void>((resolve) => { release = resolve; });
		const save = vi.fn(async (_id: string, features: unknown, revision: number) => {
			if (revision === 2) await first;
			return { ok: true as const, concept: row(features, revision) };
		});
		const store = createIdeacadStore(transport(save), { debounceMs: 0 });
		await store.open('item-1');
		store.edit({ value: 1 });
		const flushing = store.save();
		await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
		store.edit({ value: 2 });
		release();
		await flushing;
		await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
		expect(save.mock.calls[1]).toEqual(['concept-1', { value: 2 }, 3]);
		expect(store.state.concepts[0].features).toEqual({ value: 2 });
	});

	it('surfaces stale and failed saves while retaining the local features, without retrying', async () => {
		const stale = vi.fn(async () => ({ ok: false as const, reason: 'stale' as const, concept: row({ server: true }, 8) }));
		const store = createIdeacadStore(transport(stale), { debounceMs: 0 });
		await store.open('item-1');
		store.edit({ student: true });
		await store.save();
		expect(store.state.phase).toBe('conflict');
		expect(store.state.concepts[0].features).toEqual({ student: true });
		expect(store.state.conflictedServerConcept?.features).toEqual({ server: true });
		expect(stale).toHaveBeenCalledOnce();

		const failed = createIdeacadStore(transport(vi.fn(async () => { throw new Error('offline'); })), { debounceMs: 0 });
		await failed.open('item-1');
		failed.edit({ still: 'mine' });
		await failed.save();
		expect(failed.state).toMatchObject({ phase: 'error', error: 'offline' });
		expect(failed.state.concepts[0].features).toEqual({ still: 'mine' });
	});
});

/**
 * ==========================================================================
 * THE HISTORY LADDER (0196), WHICH IS THE RUNG THAT KEEPS A PRE-0209
 * DEPLOYMENT'S EDITOR ON SCREEN
 * ==========================================================================
 *
 * 0209 is applied by hand, so a tree sitting between 0208 and it is a real
 * state -- and `loadHistory` is the FIRST thing that runs after a document
 * opens, so without this rung `open()` would reject outright and the whole
 * editor would be replaced by a refusal sentence. That failure is loud, but the
 * OTHER direction is silent and is what these assert in both: a rung that
 * swallowed every error would read a genuine refusal ("That part is not one you
 * can open") as "the migration is not applied" and remove the feature with
 * nothing anywhere saying so.
 *
 * `PGRST202` ALONE, which is this repo's rule everywhere a client degrades past
 * a missing RPC.
 */
const historyRows = [
	{ seq: 0, kind: 'origin' as const, path: '', before: null, after: { value: 0 } },
	{ seq: 1, kind: 'set' as const, path: '/value', before: 0, after: 7 }
];

const notDeployedError = () => Object.assign(new Error('Could not find the function'), { code: 'PGRST202' });

describe('the history ladder', () => {
	it('turns history OFF on PGRST202 and keeps the document openable', async () => {
		const save = vi.fn(async (_id: string, features: unknown, revision: number) => ({
			ok: true as const, concept: row(features, revision)
		}));
		const store = createIdeacadStore(transport(save), {
			debounceMs: 0,
			history: {
				applyActions: vi.fn(),
				conceptHistory: vi.fn(async () => {
					throw notDeployedError();
				})
			}
		});
		// The whole point: this RESOLVES rather than rejecting.
		await store.open('item-1');
		expect(store.state.historyReady).toBe(false);
		expect(store.state.history).toEqual([]);
		expect(store.state.canUndo).toBe(false);
		// And every write goes through `ideacad_save_concept` exactly as 0208 did.
		store.edit({ value: 1 });
		await store.save();
		expect(save).toHaveBeenCalledTimes(1);
	});

	it('lets a REAL refusal through rather than reading it as a missing migration', async () => {
		const store = createIdeacadStore(transport(vi.fn()), {
			debounceMs: 0,
			history: {
				applyActions: vi.fn(),
				conceptHistory: vi.fn(async () => {
					// A function that EXISTS and said no. Reading this as "not
					// deployed" would turn a refusal into a silently absent feature.
					throw Object.assign(new Error('That part is not one you can open.'), { code: '42501' });
				})
			}
		});
		await expect(store.open('item-1')).rejects.toThrow('That part is not one you can open.');
	});

	it('keeps history ON, and writes through applyActions, when the RPCs are there', async () => {
		const save = vi.fn();
		const applyActions = vi.fn(async (_id: string, _actions: unknown, features: unknown, revision: number) => ({
			ok: true as const, concept: row(features, revision), appended: 1, firstSeq: 2, lastSeq: 2
		}));
		const store = createIdeacadStore(transport(save), {
			debounceMs: 0,
			history: {
				applyActions,
				conceptHistory: vi.fn(async () => ({
					conceptId: 'concept-1', rows: historyRows, total: 2, newestSeq: 1
				}))
			}
		});
		await store.open('item-1');
		expect(store.state.historyReady).toBe(true);
		expect(store.state.history).toHaveLength(2);
		expect(store.state.canUndo).toBe(true);
		store.edit({ value: 1 });
		await store.save();
		// THE POSITIVE CONTROL FOR THE TEST ABOVE: with the RPCs present the
		// write goes through `applyActions` and `saveConcept` is never called, so
		// the ladder's off-state is genuinely a different path.
		expect(applyActions).toHaveBeenCalledTimes(1);
		expect(save).not.toHaveBeenCalled();
	});
});
