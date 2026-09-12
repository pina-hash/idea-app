// tests/dom/ideacad-mount.test.ts
//
// THE WIRE, AND IT IS THE WHOLE REASON THIS FILE EXISTS.
//
// `+page.svelte` called `createIdeacadTransports(data.supabase)` from the day
// IdeaCAD existed and handed the result NOWHERE. The only route to
// `BladeEditor` is `ItemDetail.svelte`, which ledger 0171 did not own, so on a
// real classroom page a student could model a blade for an hour, watch a
// "Saved" indicator the whole time, and lose every byte of it on reload.
// Nothing type-checked wrongly, nothing warned, and no test in the tree could
// see it: every existing IdeaCAD test mounts the component with props of its
// own, which is exactly the surface that was never in question.
//
// So the assertions here are about the JOIN rather than about either side:
// the projection between the store's rows and the editor's props, the editor
// actually invoking the writes it is handed, the editor invoking NOTHING when
// it is handed none, and one end-to-end round trip through the REAL store --
// edit, the real 750ms debounce, the RPC, and the value read back.
//
// WHAT THIS FILE DELIBERATELY DOES NOT ASSERT: any width, any ratio, any tap
// target. happy-dom has no layout engine, so every one of those reads zero and
// passes vacuously (`tests/dom/README.md`). Those are measured against a real
// Chromium in `npm run verify:browser`.

import { describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import BladeEditor from '$lib/ideacad/BladeEditor.svelte';
import { DEFAULT_BLADE_CONFIG, DEFAULT_BLADE_TREE } from '$lib/ideacad/blade/materials';
import { ideacadEditorSeed, ideacadSaveLabel, type IdeacadEditorWrites } from '$lib/ideacad/mount';
import { createIdeacadStore } from '$lib/ideacad/store';
import type {
	IdeacadConceptRow,
	IdeacadSaveConceptResult,
	IdeacadTransports
} from '$lib/ideacad/transports';
import { mountInto } from './mount';

const Editor = BladeEditor as unknown as Component<Record<string, unknown>>;

const row = (over: Partial<IdeacadConceptRow> = {}): IdeacadConceptRow => ({
	id: 'row-1',
	document_id: 'doc-1',
	name: 'Concept 1',
	position: 1,
	features: structuredClone(DEFAULT_BLADE_TREE),
	revision: 1,
	committed_at: null,
	deleted_at: null,
	created_at: '2026-09-12T00:00:00Z',
	updated_at: '2026-09-12T00:00:00Z',
	...over
});

/* ------------------------------------------------------------------ */
/* The projection                                                      */
/* ------------------------------------------------------------------ */

describe('ideacadEditorSeed: the store snapshot in the editor’s vocabulary', () => {
	const snapshot = (over: Record<string, unknown> = {}) =>
		({
			itemId: 'item-1',
			document: { id: 'doc-1', item_id: 'item-1', student_email: 'a@b.net', active_concept_id: 'row-2', created_at: '', updated_at: '' },
			concepts: [row({ id: 'row-1' }), row({ id: 'row-2', name: 'Wide four', position: 2, committed_at: '2026-09-12T01:00:00Z' })],
			activeConceptId: 'row-2',
			prediction: null,
			config: DEFAULT_BLADE_CONFIG,
			phase: 'saved',
			error: null,
			conflictedServerConcept: null,
			...over
		}) as never;

	it('renames every field the two sides spell differently', () => {
		const seed = ideacadEditorSeed(snapshot())!;
		expect(seed.concepts.map((c) => c.id)).toEqual(['row-1', 'row-2']);
		// `committed_at` is a TIMESTAMP and the editor wants a boolean; a row that
		// kept the timestamp would be truthy on every row that ever committed and
		// falsy on none.
		expect(seed.concepts.map((c) => c.committed)).toEqual([false, true]);
		// The active concept is NOT first, which is the case that forced
		// `activeConceptId` to become a prop: seeding index 0 would open the
		// editor showing one concept's geometry under another's name.
		expect(seed.activeConceptId).toBe('row-2');
		expect(seed.concepts[0].id).not.toBe(seed.activeConceptId);
	});

	it('renames the prediction row, which is the field pair most easily got wrong', () => {
		const seed = ideacadEditorSeed(
			snapshot({
				prediction: {
					document_id: 'doc-1',
					predicted_concept_id: 'row-2',
					rationale: 'the rim carries the mass',
					made_at: '2026-09-12T02:00:00Z'
				}
			})
		)!;
		expect(seed.prediction).toEqual({
			conceptId: 'row-2',
			rationale: 'the rim carries the mass',
			at: '2026-09-12T02:00:00Z'
		});
	});

	it('answers null before the document opens, so no editor is mounted on an empty snapshot', () => {
		expect(ideacadEditorSeed(null)).toBeNull();
		expect(ideacadEditorSeed(snapshot({ document: null }))).toBeNull();
		// A document with no concepts cannot happen through `ideacad_open_document`
		// -- it creates Concept 1 -- but an editor mounted on one would crash on
		// `concepts[0]`, so it fails closed here rather than there.
		expect(ideacadEditorSeed(snapshot({ concepts: [] }))).toBeNull();
	});

	it('gives every save phase its own word, and never reads a failure as Saved', () => {
		expect(['idle', 'saving', 'saved', 'error', 'conflict'].map(ideacadSaveLabel)).toEqual([
			'Unsaved',
			'Saving',
			'Saved',
			'Not saved',
			'Changed elsewhere'
		]);
		expect(ideacadSaveLabel(undefined)).toBe('Unsaved');
	});
});

/* ------------------------------------------------------------------ */
/* The editor against its write boundary                               */
/* ------------------------------------------------------------------ */

type Call = [string, ...unknown[]];

function recorder() {
	const calls: Call[] = [];
	const writes: IdeacadEditorWrites = {
		edit: (features) => void calls.push(['edit', features]),
		create: async (name) => {
			calls.push(['create', name]);
			return { id: `server-${calls.length}`, name };
		},
		rename: async (id, name) => void calls.push(['rename', id, name]),
		reposition: async (id, position) => void calls.push(['reposition', id, position]),
		remove: async (id) => {
			calls.push(['remove', id]);
			return { activeConceptId: 'c3' };
		},
		activate: async (id) => void calls.push(['activate', id]),
		setPrediction: async (id, why) => void calls.push(['setPrediction', id, why]),
		commit: async (id) => void calls.push(['commit', id])
	};
	return { calls, writes, named: () => calls.map((c) => c[0]) };
}

const THREE = [
	{ id: 'c1', name: 'Concept 1', features: structuredClone(DEFAULT_BLADE_TREE), committed: false },
	{ id: 'c2', name: 'Wide four', features: structuredClone(DEFAULT_BLADE_TREE), committed: false },
	{ id: 'c3', name: 'Concept 3', features: structuredClone(DEFAULT_BLADE_TREE), committed: false }
];

function open(props: Record<string, unknown> = {}) {
	return mountInto(Editor, {
		tree: DEFAULT_BLADE_TREE,
		config: DEFAULT_BLADE_CONFIG,
		concepts: structuredClone(THREE),
		...props
	});
}
const button = (m: ReturnType<typeof open>, label: string) =>
	m.all<HTMLButtonElement>('button').find((b) => b.textContent?.trim() === label);
const cards = (m: ReturnType<typeof open>) => m.all('.concepts .card').length;

describe('BladeEditor reaches its write boundary, and reaches nothing without one', () => {
	it('sends an Accept into the autosave', async () => {
		const r = recorder();
		const m = open({ writes: r.writes });
		// Accept is the one edit path: the PropertyManager writes the draft and
		// Accept is what commits it to the concept.
		m.one<HTMLInputElement>('.tree [role="treeitem"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		m.flush();
		const field = m.all<HTMLInputElement>('input[type="number"]')[0];
		field.value = String(Number(field.value) + 0.2);
		field.dispatchEvent(new Event('input', { bubbles: true }));
		m.flush();
		// The PropertyManager carries the confirm pair while it is open, which is
		// where SolidWorks puts it and what 0171 measured; the footer pair is
		// hidden in that state, so there is exactly one Accept on screen.
		expect(m.all('.accept')).toHaveLength(1);
		expect(m.one('.accept').getAttribute('aria-disabled')).toBe('false'); // the edit took
		// SUBMITTED RATHER THAN CLICKED. The control is `type="submit"` inside the
		// panel's own form and happy-dom does not run form submission from a
		// button click; the real browser does, and `verify:browser` drives it.
		m.one<HTMLFormElement>('.tree form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await m.settle();
		expect(r.named()).toEqual(['edit']);
		await m.stop();
	});

	it('creates a concept at the DATABASE and adopts the id it returns', async () => {
		const r = recorder();
		const m = open({ writes: r.writes });
		button(m, 'New')!.click();
		await m.settle();
		expect(r.named()).toEqual(['edit', 'create']);
		expect(cards(m)).toBe(4);
		// The id is the SERVER's. A locally minted `c4` would address a row that
		// does not exist on every write after this one.
		expect(m.all('.concepts .card')[3].textContent).toContain('Concept 4');
		await m.stop();
	});

	it('does not add a card when the create is refused', async () => {
		const m = open({
			writes: { ...recorder().writes, create: async () => Promise.reject(new Error('offline')) }
		});
		button(m, 'New')!.click();
		await m.settle();
		expect(cards(m)).toBe(3);
		expect(m.one('.refusal.write').textContent).toContain('did not save');
		await m.stop();
	});

	it('persists a rename, a delete and a reorder, and adopts the concept the delete names', async () => {
		const r = recorder();
		const m = open({ writes: r.writes });
		button(m, 'Rename')!.click();
		m.flush();
		const name = m.one<HTMLInputElement>('.concepts .rename');
		name.value = 'Narrow three';
		name.dispatchEvent(new Event('input', { bubbles: true }));
		m.flush();
		button(m, 'Save name')!.click();
		await m.settle();
		expect(r.calls.find((c) => c[0] === 'rename')).toEqual(['rename', 'c1', 'Narrow three']);

		button(m, 'Move right')!.click();
		await m.settle();
		// 1-BASED, which is what `0201` stores and what `ideacad_open_document`
		// orders by. Two writes, because a swap moves two rows.
		expect(r.calls.filter((c) => c[0] === 'reposition')).toEqual([
			['reposition', 'c1', 2],
			['reposition', 'c2', 1]
		]);

		button(m, 'Delete')!.click();
		m.flush();
		button(m, 'Delete Narrow three')!.click();
		await m.settle();
		expect(r.calls.find((c) => c[0] === 'remove')).toEqual(['remove', 'c1']);
		expect(cards(m)).toBe(2);
		// The database chose `c3`; the local guess would have been the first
		// remaining card, which after the reorder above is not the same row.
		expect(m.one('.concepts .card.active').textContent).toContain('Concept 3');
		await m.stop();
	});

	it('keeps the concept when the delete is refused', async () => {
		const m = open({
			writes: { ...recorder().writes, remove: async () => Promise.reject(new Error('offline')) }
		});
		button(m, 'Delete')!.click();
		m.flush();
		button(m, 'Delete Concept 1')!.click();
		await m.settle();
		expect(cards(m)).toBe(3);
		await m.stop();
	});

	it('THE NEGATIVE CONTROL: an editor handed no writes reaches nothing at all', async () => {
		// Absence is the mechanism, so this is the assertion that would redden if
		// a future mount grew a default write path. The controls are all still
		// here -- the dev harness needs them -- they simply persist nothing.
		const r = recorder();
		const m = open();
		button(m, 'New')!.click();
		await m.settle();
		button(m, 'Rename')!.click();
		m.flush();
		button(m, 'Save name')!.click();
		await m.settle();
		expect(r.named()).toEqual([]);
		expect(cards(m)).toBe(4); // positive control: the local list DID move
		await m.stop();
	});

	it('shows the store’s phase rather than its own word when a store is there to have one', async () => {
		const m = open({ writes: recorder().writes, saveLabel: 'Saving' });
		expect(m.one('.save').textContent?.trim()).toBe('Saving');
		await m.stop();
	});
});

/* ------------------------------------------------------------------ */
/* The round trip, through the REAL store                              */
/* ------------------------------------------------------------------ */

describe('the round trip: an edit survives the debounce, the RPC and a reopen', () => {
	/** An in-memory `ideacad_*` backend. It enforces the ONE rule the round trip
	 *  depends on -- a save whose revision is not newer than the stored one is
	 *  `stale` -- so a client that sent the wrong revision fails here the way it
	 *  would against `0201`. */
	function backend() {
		const rpcs: string[] = [];
		let stored = row({ id: 'row-1', revision: 1 });
		const transports: IdeacadTransports = {
			live: { destroy: () => {} } as never,
			setEditor: async () => ({}),
			openDocument: async (itemId) => {
				rpcs.push('openDocument');
				return {
					document: { id: 'doc-1', item_id: itemId, student_email: 'a@b.net', active_concept_id: 'row-1', created_at: '', updated_at: '' },
					concepts: [structuredClone(stored)],
					prediction: null,
					config: DEFAULT_BLADE_CONFIG
				};
			},
			newConcept: async () => stored,
			saveConcept: async (conceptId, features, revision): Promise<IdeacadSaveConceptResult> => {
				rpcs.push(`saveConcept@${revision}`);
				if (conceptId !== stored.id || revision <= stored.revision) {
					return { ok: false, reason: 'stale', concept: structuredClone(stored) };
				}
				stored = { ...stored, features: structuredClone(features) as never, revision };
				return { ok: true, concept: structuredClone(stored) };
			},
			updateConceptMeta: async () => stored,
			deleteConcept: async () => ({ ok: true, activeConceptId: 'row-1' }),
			setActive: async () => ({ ok: true }),
			setPrediction: async (documentId, conceptId, rationale) => ({
				document_id: documentId,
				predicted_concept_id: conceptId,
				rationale,
				made_at: '2026-09-12T02:00:00Z'
			}),
			commitConcept: async () => stored,
			roster: async () => []
		};
		return { transports, rpcs, current: () => stored };
	}

	it('writes the edit after the real 750ms pause and reads it back on a reopen', async () => {
		const api = backend();
		const store = createIdeacadStore(api.transports);
		await store.open('item-1');

		const edited = structuredClone(DEFAULT_BLADE_TREE);
		const body = edited.features.find((f) => f.type === 'revolve');
		if (body && body.type === 'revolve') body.stations = body.stations.map((s) => ({ ...s, r: s.r * 1.4 }));
		store.edit(edited);

		// NOTHING IS WRITTEN YET, which is the debounce doing its job rather than
		// the test being slow: a store that wrote on the keystroke would already
		// have an RPC here.
		expect(api.rpcs).toEqual(['openDocument']);
		expect(store.state.phase).toBe('idle');

		await new Promise((resolve) => setTimeout(resolve, 950));
		expect(api.rpcs).toEqual(['openDocument', 'saveConcept@2']);
		expect(store.state.phase).toBe('saved');

		// THE READ BACK. A second store over the same backend is the reload: it
		// shares no memory with the first and can only see what the RPC stored.
		const reopened = createIdeacadStore(api.transports);
		await reopened.open('item-1');
		const seed = ideacadEditorSeed(reopened.state)!;
		expect(seed.concepts[0].features).toEqual(edited);
		expect(api.current().revision).toBe(2);
		await store.destroy();
		await reopened.destroy();
	}, 10_000);

	it('flushes what the debounce still holds when the page goes away', async () => {
		const api = backend();
		const store = createIdeacadStore(api.transports);
		await store.open('item-1');
		const edited = structuredClone(DEFAULT_BLADE_TREE);
		edited.rotation = edited.rotation === 'cw' ? 'ccw' : 'cw';
		store.edit(edited);
		// `onDestroy` on the item page calls this, and it is the one moment a tab
		// closing mid-edit is recoverable at all.
		await store.destroy();
		expect(api.rpcs).toEqual(['openDocument', 'saveConcept@2']);
		expect((api.current().features as typeof edited).rotation).toBe(edited.rotation);
	});
});
