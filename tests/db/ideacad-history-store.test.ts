/**
 * THE STORE, DRIVEN AGAINST THE REAL RPCs.
 *
 * WHY THIS IS A DATABASE TEST AND NOT AN IN-MEMORY ONE. The store's history
 * region is mostly a set of decisions about what the server just told it: which
 * seqs it allocated, whether somebody else appended in between, whether a stale
 * revision means the queued actions were written or not. A hand-written fake
 * answering those is a fake the store can agree with while the database
 * disagrees -- "a shim more permissive than the real thing does not fail loudly,
 * it certifies a bug". So the transports below are thin wrappers over
 * `db.asUser`, which is exactly what PostgREST does, and every answer the store
 * reads is Postgres's own.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { startTestDb, createUser, type SeededUser, type TestDb } from './harness';
import { createIdeacadStore } from '../../src/lib/ideacad/store';
import type { IdeacadConceptRow, IdeacadTransports } from '../../src/lib/ideacad/transports';
import { stateAt, type IdeacadHistoryTransports } from '../../src/lib/ideacad/history';
import { CORPUS_ORIGIN } from '../ideacad-history-corpus';
import type { BladeTree } from '../../src/lib/ideacad/blade/tree';

const ALL_MIGRATIONS = readdirSync(new URL('../../supabase/migrations', import.meta.url))
	.filter((file) => file.endsWith('.sql'))
	.sort();
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

let db: TestDb;
let teacher: SeededUser;
let alice: SeededUser;
let itemId: string;
/** The blade concept `ideacad_open_document` seeds. Later tests add others. */
let baseConceptId: string;

const call = async <T>(user: SeededUser, expression: string, params: unknown[] = []): Promise<T> =>
	db.asUser(user.id, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${expression} as result`, params);
		return rows[0].result;
	});

/** The live transport the editor injects. Nothing here uses realtime. */
const noLive: IdeacadTransports['live'] = {
	sendPing() {},
	subscribePings: () => () => {},
	sendFrame() {},
	subscribeFrames: () => () => {},
	destroy() {}
};

const transportsFor = (user: SeededUser): IdeacadTransports =>
	({
		live: noLive,
		openDocument: (id: string) => call(user, 'public.ideacad_open_document($1::uuid)', [id]),
		newConcept: (documentId: string, name: string, features: unknown) =>
			call(user, 'public.ideacad_new_concept($1::uuid, $2, $3::jsonb)', [
				documentId,
				name,
				JSON.stringify(features)
			]),
		saveConcept: (conceptId: string, features: unknown, revision: number) =>
			call(user, 'public.ideacad_save_concept($1::uuid, $2::jsonb, $3)', [
				conceptId,
				JSON.stringify(features),
				revision
			]),
		setActive: (documentId: string, conceptId: string) =>
			call(user, 'public.ideacad_set_active($1::uuid, $2::uuid)', [documentId, conceptId]),
		deleteConcept: (conceptId: string) =>
			call(user, 'public.ideacad_delete_concept($1::uuid)', [conceptId]),
		setEditor: async () => ({}),
		updateConceptMeta: async () => {
			throw new Error('not used');
		},
		setPrediction: async () => {
			throw new Error('not used');
		},
		commitConcept: async () => {
			throw new Error('not used');
		},
		roster: async () => ({})
	}) as unknown as IdeacadTransports;

const historyFor = (user: SeededUser): IdeacadHistoryTransports<IdeacadConceptRow> => ({
	applyActions: (conceptId, actions, features, revision) =>
		call(user, 'public.ideacad_apply_actions($1::uuid, $2::jsonb, $3::jsonb, $4)', [
			conceptId,
			JSON.stringify(actions),
			JSON.stringify(features),
			revision
		]),
	conceptHistory: (conceptId, afterSeq, limit) =>
		call(user, 'public.ideacad_concept_history($1::uuid, $2::bigint, $3)', [
			conceptId,
			afterSeq,
			limit
		])
});

const storedTree = async (conceptId: string): Promise<BladeTree> => {
	const { rows } = await db.sql<{ features: BladeTree }>(
		'select features from public.ideacad_concepts where id = $1::uuid',
		[conceptId]
	);
	return rows[0].features;
};

const nudge = (tree: BladeTree, value: number): BladeTree => {
	const next = JSON.parse(JSON.stringify(tree)) as BladeTree;
	const sketch = next.features.find((f) => f.type === 'bladeSketch');
	if (sketch?.type !== 'bladeSketch') throw new Error('fixture');
	sketch.rootWidth = value;
	return next;
};

beforeAll(async () => {
	db = await startTestDb([FIXTURE_COMPLETION, ...ALL_MIGRATIONS]);
	teacher = await createUser(db, 'ideacad.store.teacher@boscotech.edu', 'Store Teacher');
	alice = await createUser(db, 'ideacad.store.alice@boscotech.net', 'Alice');
	const course = await call<{ course_id: string }>(
		teacher,
		"public.classroom_upsert_course('IDEASTORE', 'IdeaCAD Store')"
	);
	const section = await call<{ section_id: string }>(
		teacher,
		'public.classroom_upsert_section($1::uuid, $2, null, $3)',
		[course.course_id, 'Period 1', teacher.email]
	);
	await call(teacher, 'public.classroom_set_enrollment($1::uuid, $2, $3, true)', [
		section.section_id,
		alice.email,
		alice.email
	]);
	const item = await call<{ item_id: string }>(
		teacher,
		"public.classroom_create_item('assignment', $1::uuid[], 'Blade', 'Build it.', 20, null, null, true, '[]'::jsonb, false)",
		[[section.section_id]]
	);
	itemId = item.item_id;
	await call(teacher, "public.ideacad_set_editor($1::uuid, 'blade', $2::jsonb)", [
		itemId,
		JSON.stringify({ defaultFeatures: CORPUS_ORIGIN })
	]);
	const opened = await call<{ concepts: Array<{ id: string }> }>(
		alice,
		'public.ideacad_open_document($1::uuid)',
		[itemId]
	);
	baseConceptId = opened.concepts[0].id;
}, 600_000);

afterAll(async () => db?.stop());

describe('the store with 0209 wired in', () => {
	it('reports the log as ready and loads the origin on open', async () => {
		const store = createIdeacadStore(transportsFor(alice), {
			debounceMs: 0,
			history: historyFor(alice)
		});
		await store.open(itemId);
		expect(store.state.historyReady).toBe(true);
		expect(store.state.history).toHaveLength(1);
		expect(store.state.history[0]).toMatchObject({ seq: 0, kind: 'origin' });
		// Nothing has been edited, so neither control is offered.
		expect([store.state.canUndo, store.state.canRedo]).toEqual([false, false]);
		await store.destroy();
	});

	it('turns coalesced edits into one write carrying EVERY action, not just the newest tree', async () => {
		const store = createIdeacadStore(transportsFor(alice), {
			debounceMs: 0,
			history: historyFor(alice)
		});
		await store.open(itemId);
		const conceptId = store.state.activeConceptId!;
		const base = store.state.concepts[0].features as BladeTree;

		// Three accepted edits behind one write. The autosave sends the newest
		// TREE -- that has not changed -- and now also the three ACTIONS, which
		// is what makes the middle two undoable rather than lost.
		store.edit(nudge(base, 0.5));
		store.edit(nudge(base, 0.6));
		store.edit(nudge(base, 0.7));
		await store.save();
		expect(store.state.phase).toBe('saved');

		expect(store.state.history.map((r) => r.seq)).toEqual([0, 1, 2, 3]);
		expect(store.state.history.slice(1).map((r) => r.after)).toEqual([0.5, 0.6, 0.7]);
		expect(store.state.canUndo).toBe(true);
		expect(stateAt(store.state.history)).toEqual(await storedTree(conceptId));
		await store.destroy();
	});

	it('UNDOES ACROSS A RELOAD -- a second store, no shared memory, walks the same log', async () => {
		// A brand new store instance is what a reloaded tab is: nothing is
		// carried over, and everything below comes from the database.
		const store = createIdeacadStore(transportsFor(alice), {
			debounceMs: 0,
			history: historyFor(alice)
		});
		await store.open(itemId);
		const conceptId = store.state.activeConceptId!;
		expect(store.state.canUndo).toBe(true);
		const before = await storedTree(conceptId);

		await store.undo();
		expect(store.state.phase).toBe('saved');
		const afterUndo = await storedTree(conceptId);
		expect(afterUndo).not.toEqual(before);
		const sketch = afterUndo.features.find((f) => f.type === 'bladeSketch');
		expect(sketch?.type === 'bladeSketch' && sketch.rootWidth).toBe(0.6);

		expect(store.state.canRedo).toBe(true);
		await store.redo();
		const afterRedo = await storedTree(conceptId);
		expect(afterRedo).toEqual(before);
		expect(stateAt(store.state.history)).toEqual(afterRedo);

		// AND NOTHING WAS DELETED by either press.
		expect(store.state.history.filter((r) => r.undoesSeq != null)).toHaveLength(2);
		expect(store.state.history.map((r) => r.seq)).toEqual([0, 1, 2, 3, 4, 5]);
		await store.destroy();
	});

	it('scrubs to a past point as a READ, changing nothing on the server', async () => {
		const store = createIdeacadStore(transportsFor(alice), {
			debounceMs: 0,
			history: historyFor(alice)
		});
		await store.open(itemId);
		const conceptId = store.state.activeConceptId!;
		const before = await storedTree(conceptId);
		const atOne = store.stateAtSeq(1) as BladeTree;
		const sketch = atOne.features.find((f) => f.type === 'bladeSketch');
		expect(sketch?.type === 'bladeSketch' && sketch.rootWidth).toBe(0.5);
		expect(store.stateAtSeq(0)).toEqual(CORPUS_ORIGIN);
		// The read wrote nothing: the stored tree and the log are where they were.
		expect(await storedTree(conceptId)).toEqual(before);
		const { rows } = await db.sql<{ n: string }>(
			'select count(*)::text as n from public.ideacad_history where concept_id = $1::uuid',
			[conceptId]
		);
		expect(Number(rows[0].n)).toBe(store.state.history.length);
		await store.destroy();
	});

	it('flushes unsent work BEFORE undoing, so an undo never steps over it', async () => {
		const store = createIdeacadStore(transportsFor(alice), {
			debounceMs: 10_000,
			history: historyFor(alice)
		});
		await store.open(itemId);
		const conceptId = store.state.activeConceptId!;
		const base = store.state.concepts.find((c) => c.id === conceptId)!.features as BladeTree;
		const before = store.state.history.length;

		// Typed, debounce not yet fired, so this is only in memory.
		store.edit(nudge(base, 0.9));
		expect(store.state.history).toHaveLength(before);

		await store.undo();
		// The pending edit landed FIRST, then the undo inverted it -- so the
		// log grew by two and the tree came back to where it started.
		expect(store.state.history).toHaveLength(before + 2);
		expect(await storedTree(conceptId)).toEqual(base);
		expect(stateAt(store.state.history)).toEqual(base);
		await store.destroy();
	});

	it('keeps each concept on its own log, so an undo cannot reach into another part', async () => {
		const store = createIdeacadStore(transportsFor(alice), {
			debounceMs: 0,
			history: historyFor(alice)
		});
		await store.open(itemId);
		const firstId = store.state.activeConceptId!;
		const firstLog = store.state.history.length;

		const made = await store.create('Concept 2', { schema: 1, marker: 'second' });
		// A NEW CONCEPT STARTS A NEW LOG. Its own origin, and nothing else.
		expect(store.state.history).toHaveLength(1);
		expect(store.state.history[0]).toMatchObject({ seq: 0, kind: 'origin' });
		expect(store.state.canUndo).toBe(false);

		store.edit({ schema: 1, marker: 'second', tweak: 1 });
		await store.save();
		expect(store.state.history).toHaveLength(2);

		// Switching back brings the FIRST concept's log, untouched by any of that.
		await store.setActive(firstId);
		expect(store.state.history).toHaveLength(firstLog);
		expect(store.state.history.every((r) => r.seq < firstLog)).toBe(true);
		expect(stateAt(store.state.history)).toEqual(await storedTree(firstId));
		expect(stateAt(await historyFor(alice).conceptHistory(made.id, -1, 5000).then((p) => p.rows))).toEqual(
			await storedTree(made.id)
		);
		await store.destroy();
	});

	it('says there is nothing to undo rather than throwing, at the floor', async () => {
		const store = createIdeacadStore(transportsFor(alice), {
			debounceMs: 0,
			history: historyFor(alice)
		});
		await store.open(itemId);
		await store.create('Concept 3', { schema: 1, marker: 'third' });
		await store.undo();
		expect(store.state.error).toMatch(/nothing to undo/);
		await store.redo();
		expect(store.state.error).toMatch(/nothing to redo/);
		await store.destroy();
	});
});

describe('the same store on a deployment WITHOUT 0209', () => {
	// Absence is the mechanism: a tree between 0208 and 0209 is a real state.
	const withoutHistory = () => createIdeacadStore(transportsFor(alice), { debounceMs: 0 });

	it('reports history as not ready and offers neither control', async () => {
		const store = withoutHistory();
		await store.open(itemId);
		expect(store.state.historyReady).toBe(false);
		expect(store.state.history).toEqual([]);
		expect([store.state.canUndo, store.state.canRedo]).toEqual([false, false]);
		expect(store.stateAtSeq(0)).toBeNull();
		await store.destroy();
	});

	it('still saves, through `ideacad_save_concept`, appending no action row', async () => {
		const store = withoutHistory();
		await store.open(itemId);
		// The tests above left a later concept active. This one is about the
		// blade document, so select it explicitly rather than depending on
		// whichever concept happened to be current.
		await store.setActive(baseConceptId);
		const conceptId = store.state.activeConceptId!;
		expect(conceptId).toBe(baseConceptId);
		const base = store.state.concepts.find((c) => c.id === conceptId)!.features as BladeTree;
		const { rows: before } = await db.sql<{ n: string }>(
			'select count(*)::text as n from public.ideacad_history where concept_id = $1::uuid',
			[conceptId]
		);
		store.edit(nudge(base, 0.33));
		await store.save();
		expect(store.state.phase).toBe('saved');
		expect((await storedTree(conceptId)).features.find((f) => f.type === 'bladeSketch')).toMatchObject({
			rootWidth: 0.33
		});
		const { rows: after } = await db.sql<{ n: string }>(
			'select count(*)::text as n from public.ideacad_history where concept_id = $1::uuid',
			[conceptId]
		);
		expect(after[0].n).toBe(before[0].n);
		await store.destroy();
	});

	it('refuses undo with a sentence rather than doing nothing silently', async () => {
		const store = withoutHistory();
		await store.open(itemId);
		await expect(store.undo()).rejects.toThrow(/no IdeaCAD history/);
		await store.destroy();
	});
});
