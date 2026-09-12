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
