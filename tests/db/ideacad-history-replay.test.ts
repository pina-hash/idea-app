/**
 * THE CORRECTNESS CLAIM OF THE ACTION LOG, against real Postgres:
 *
 *   REPLAYING THE STORED LOG FROM THE CREATION OF THE PART EQUALS THE STORED
 *   TREE.
 *
 * Everything else this feature does is downstream of that. A test that does not
 * make the comparison, on a part with real depth, has not tested this -- so the
 * corpus below is 220 accepted edits producing well over 200 action rows, and
 * the two sides are produced by genuinely different code: the stored tree comes
 * from `ideacad_apply_actions` writing `ideacad_concepts.features`, and the
 * replayed one from `stateAt` folding the rows `ideacad_concept_history` hands
 * back. Neither is derived from the other and the corpus is a plain mutator
 * that imports nothing from `history.ts` at all.
 *
 * IT ALSO ANSWERS TWO OF PROMPT 0189's FOUR HERE, because both are claims about
 * the database rather than about the arithmetic: undo works after a page
 * reload, and a scrub to an arbitrary point agrees with undoing back to it over
 * the REAL rows rather than over a hand-built log.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestDb, createUser, type SeededUser, type TestDb } from './harness';
import {
	diffTrees,
	foldHistory,
	inverseOf,
	stateAt,
	unwindTo,
	type IdeacadAction,
	type IdeacadHistoryRow
} from '../../src/lib/ideacad/history';
import { bladeCorpus, CORPUS_ORIGIN } from '../ideacad-history-corpus';
import type { BladeTree } from '../../src/lib/ideacad/blade/tree';

const MIGRATION_DIR = new URL('../../supabase/migrations', import.meta.url);
const ALL_MIGRATIONS = readdirSync(MIGRATION_DIR)
	.filter((file) => file.endsWith('.sql'))
	.sort();
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

let db: TestDb;
let teacher: SeededUser;
let alice: SeededUser;
let itemId: string;
let documentId: string;
let conceptId: string;

const call = async <T>(user: SeededUser, expression: string, params: unknown[] = []): Promise<T> =>
	db.asUser(user.id, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${expression} as result`, params);
		return rows[0].result;
	});

const refusal = async (user: SeededUser, expression: string, params: unknown[] = []) => {
	try {
		await call(user, expression, params);
		return '';
	} catch (error) {
		return (error as Error).message;
	}
};

interface ApplyResult {
	ok: boolean;
	reason?: string;
	concept: { id: string; features: BladeTree; revision: number };
	appended: number;
	firstSeq: number | null;
	lastSeq: number | null;
}

const apply = (
	user: SeededUser,
	actions: readonly (IdeacadAction & { undoesSeq?: number })[],
	features: unknown,
	revision: number
): Promise<ApplyResult> =>
	call<ApplyResult>(user, 'public.ideacad_apply_actions($1::uuid, $2::jsonb, $3::jsonb, $4)', [
		conceptId,
		JSON.stringify(actions),
		JSON.stringify(features),
		revision
	]);

interface HistoryPayload {
	conceptId: string;
	rows: IdeacadHistoryRow[];
	total: number;
	newestSeq: number | null;
}

const history = (user: SeededUser, afterSeq = -1, limit = 5000): Promise<HistoryPayload> =>
	call<HistoryPayload>(user, 'public.ideacad_concept_history($1::uuid, $2::bigint, $3)', [
		conceptId,
		afterSeq,
		limit
	]);

/** The tree the database currently holds, read the way the editor reads it. */
const storedTree = async (user: SeededUser): Promise<BladeTree> => {
	const opened = await call<{ concepts: Array<{ id: string; features: BladeTree }> }>(
		user,
		'public.ideacad_open_document($1::uuid)',
		[itemId]
	);
	const row = opened.concepts.find((c) => c.id === conceptId);
	if (!row) throw new Error('the concept under test is not in the payload');
	return row.features;
};

beforeAll(async () => {
	db = await startTestDb([FIXTURE_COMPLETION, ...ALL_MIGRATIONS]);
	teacher = await createUser(db, 'ideacad.hist.teacher@boscotech.edu', 'History Teacher');
	alice = await createUser(db, 'ideacad.hist.alice@boscotech.net', 'Alice');
	const course = await call<{ course_id: string }>(
		teacher,
		"public.classroom_upsert_course('IDEAHIST', 'IdeaCAD History')"
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
	// THE REAL DEFAULT TREE, not a stub. The replay claim is only worth making
	// over a document shaped like the one students actually edit.
	await call(teacher, "public.ideacad_set_editor($1::uuid, 'blade', $2::jsonb)", [
		itemId,
		JSON.stringify({ defaultFeatures: CORPUS_ORIGIN })
	]);
	const opened = await call<{
		document: { id: string };
		concepts: Array<{ id: string }>;
	}>(alice, 'public.ideacad_open_document($1::uuid)', [itemId]);
	documentId = opened.document.id;
	conceptId = opened.concepts[0].id;
}, 600_000);

afterAll(async () => db?.stop());

describe('the origin row, written by the trigger on every creation path', () => {
	it('is there for the concept `ideacad_open_document` seeded, at seq 0, carrying the seeded tree', async () => {
		const payload = await history(alice);
		expect(payload.rows[0]).toMatchObject({ seq: 0, kind: 'origin', path: '' });
		expect(payload.rows[0].after).toEqual(CORPUS_ORIGIN);
		expect(payload.rows[0].actor).toBe(alice.email);
	});

	it('is there for EVERY other path that creates a concept, which is why it is a trigger', async () => {
		// The census the migration header names: four functions across three
		// migrations create a concept, and a line in each is four places to
		// forget it.
		const fresh = await call<{ id: string; features: unknown }>(
			alice,
			'public.ideacad_new_concept($1::uuid, $2, $3::jsonb)',
			[documentId, 'Concept 2', JSON.stringify({ schema: 1, marker: 'new_concept' })]
		);
		const part = await call<{ partId: string; activeConceptId: string }>(
			alice,
			'public.ideacad_add_part($1::uuid, $2, $3::jsonb)',
			[documentId, 'Second part', JSON.stringify({ schema: 1, marker: 'add_part' })]
		);
		const partConcept = await call<{ id: string }>(
			alice,
			'public.ideacad_new_part_concept($1::uuid, $2, $3::jsonb)',
			[part.partId, 'Part concept 2', JSON.stringify({ schema: 1, marker: 'part_concept' })]
		);

		const made = [fresh.id, part.activeConceptId, partConcept.id];
		const { rows } = await db.sql<{ concept_id: string; kind: string; after_value: unknown }>(
			`select concept_id, kind, after_value from public.ideacad_history
			 where concept_id = any($1::uuid[]) and seq = 0 order by concept_id`,
			[made]
		);
		expect(rows).toHaveLength(3);
		expect(rows.every((r) => r.kind === 'origin')).toBe(true);
		expect(rows.map((r) => (r.after_value as { marker: string }).marker).sort()).toEqual([
			'add_part',
			'new_concept',
			'part_concept'
		]);

		// The positive control for that sweep: every concept in the database has
		// exactly one origin row and no concept has two.
		const { rows: counts } = await db.sql<{ concepts: string; origins: string; extra: string }>(
			`select (select count(*) from public.ideacad_concepts) as concepts,
			        (select count(*) from public.ideacad_history where kind = 'origin') as origins,
			        (select count(*) from public.ideacad_history where kind = 'origin' and seq <> 0) as extra`
		);
		expect(counts[0].concepts).toBe(counts[0].origins);
		expect(Number(counts[0].extra)).toBe(0);
	});

	it('refuses a second origin at a later seq, so no log can be silently reset mid-stream', async () => {
		await expect(
			db.sql(
				`insert into public.ideacad_history(concept_id, seq, kind, path, after_value, actor)
				 values ($1::uuid, 9999, 'origin', '', '{}'::jsonb, 'probe')`,
				[conceptId]
			)
		).rejects.toThrow(/ideacad_history_origin_is_seq_zero/);
	});

	it('refuses a plain action AT seq 0, which is the same constraint the other way', async () => {
		await expect(
			db.sql(
				`insert into public.ideacad_history(concept_id, seq, kind, path, after_value, actor)
				 values (gen_random_uuid(), 0, 'set', '/a', '1'::jsonb, 'probe')`
			)
		).rejects.toThrow();
	});
});

describe('THE CLAIM: replay from creation equals the stored tree', () => {
	let steps: ReturnType<typeof bladeCorpus>;
	let appended = 0;

	it('applies a 220-edit corpus through the real RPC, in the batches the store sends', async () => {
		steps = bladeCorpus(220, 20260912);
		let revision = 1;
		// The store coalesces: several accepted edits queue up and one write
		// sends them all with the final tree. Batching here rather than one
		// action per call is what exercises the seq allocation inside a batch.
		for (let i = 0; i < steps.length; i += 7) {
			const batch = steps.slice(i, i + 7);
			const actions: IdeacadAction[] = [];
			for (const step of batch) actions.push(...diffTrees(step.before, step.after));
			revision += 1;
			const result = await apply(alice, actions, batch[batch.length - 1].after, revision);
			expect(result.ok).toBe(true);
			appended += result.appended;
			expect(result.appended).toBe(actions.length);
		}
		expect(appended).toBeGreaterThanOrEqual(200);
	}, 600_000);

	it('replays the stored log to exactly the stored tree', async () => {
		const payload = await history(alice);
		expect(payload.total).toBe(appended + 1);
		expect(payload.newestSeq).toBe(appended);
		const replayed = stateAt<BladeTree>(payload.rows);
		const stored = await storedTree(alice);
		expect(replayed).toEqual(stored);
		// ...and the claim is not vacuous: the document really did move off the
		// tree it was created with.
		expect(stored).not.toEqual(CORPUS_ORIGIN);
	});

	it('has an ordered log with no gaps and no duplicates, which is what makes a pointer exact', async () => {
		const payload = await history(alice);
		expect(payload.rows.map((r) => r.seq)).toEqual(
			Array.from({ length: appended + 1 }, (_, i) => i)
		);
	});

	it('kept the log an ACTION LOG: no row carries a whole tree except the origin', async () => {
		// The budget in the migration header holds only while this is true, so
		// it is asserted rather than assumed. A `features`-shaped payload is one
		// with the tree's own top-level keys in it.
		const { rows } = await db.sql<{ n: string }>(
			`select count(*) as n from public.ideacad_history
			 where concept_id = $1::uuid and seq > 0
			   and (before_value ? 'features' or after_value ? 'features'
			     or before_value ? 'schema' or after_value ? 'schema')`,
			[conceptId]
		);
		expect(Number(rows[0].n)).toBe(0);
	});

	it('pages forward from a cursor and ALWAYS includes the floor', async () => {
		const page = await history(alice, appended - 10);
		// Ten rows past the cursor, plus seq 0, which a replay cannot do without.
		expect(page.rows.map((r) => r.seq)).toEqual([
			0,
			...Array.from({ length: 10 }, (_, i) => appended - 9 + i)
		]);
		expect(page.total).toBe(appended + 1);
	});

	it('REFUSES TO REPLAY A PARTIAL PAGE RATHER THAN SILENTLY SKIPPING THE MIDDLE', async () => {
		// Worth asserting because the failure it prevents is the quiet one: a
		// caller that paged and replayed anyway would get a tree built from the
		// floor plus the newest ten rows, which is a perfectly plausible-looking
		// document that never existed. `applyAction` refuses to walk onto a
		// parent that is not there, which is what turns it loud.
		const page = await history(alice, appended - 10);
		expect(() => stateAt<BladeTree>(page.rows)).toThrow(/Cannot walk/);
	});

	it('reassembles into the whole log across pages, which is how a replay gets everything', async () => {
		const rows: IdeacadHistoryRow[] = [];
		let cursor = -1;
		for (let guard = 0; guard < 50; guard += 1) {
			const page = await history(alice, cursor, 40);
			const fresh = page.rows.filter((r) => r.seq > cursor || rows.length === 0);
			if (fresh.length === 0) break;
			for (const row of fresh) if (!rows.some((r) => r.seq === row.seq)) rows.push(row);
			const newest = Math.max(...fresh.map((r) => r.seq));
			if (newest <= cursor) break;
			cursor = newest;
			if (cursor >= (page.newestSeq ?? 0)) break;
		}
		expect(rows.map((r) => r.seq).sort((a, b) => a - b)).toEqual(
			Array.from({ length: appended + 1 }, (_, i) => i)
		);
		expect(stateAt<BladeTree>(rows)).toEqual(await storedTree(alice));
	});

	it('AGREES SCRUBBING FORWARD WITH UNDOING BACK, over the real rows, at many points', async () => {
		const payload = await history(alice);
		const stored = await storedTree(alice);
		let compared = 0;
		for (let k = 0; k <= appended; k += 7) {
			expect(unwindTo(stored, payload.rows, k)).toEqual(stateAt(payload.rows, k));
			compared += 1;
		}
		expect(compared).toBeGreaterThan(25);
		// The floor, explicitly, from both directions.
		expect(stateAt(payload.rows, 0)).toEqual(CORPUS_ORIGIN);
		expect(unwindTo(stored, payload.rows, 0)).toEqual(CORPUS_ORIGIN);
	});
});

describe('UNDO AFTER A PAGE RELOAD -- the whole reason this is in the database', () => {
	it('undoes with NO memory of the session that made the edit, and the tree moves back', async () => {
		// A reload is modelled the only honest way: nothing is carried over.
		// Every input comes from `ideacad_concept_history`, which is exactly
		// what a fresh tab has. `ui/undo.ts`'s in-memory stack is gone by
		// definition at this point and is never consulted.
		const before = await storedTree(alice);
		const payload = await history(alice);
		const fold = foldHistory(payload.rows);
		expect(fold.canUndo).toBe(true);

		const target = fold.undoTarget;
		if (!target) throw new Error('nothing to undo');
		const undone = unwindTo<BladeTree>(before, payload.rows, target.seq - 1);
		const revision = (
			await call<{ concepts: Array<{ id: string; revision: number }> }>(
				alice,
				'public.ideacad_open_document($1::uuid)',
				[itemId]
			)
		).concepts.find((c) => c.id === conceptId)!.revision;

		const result = await apply(alice, [inverseOf(target)], undone, revision + 1);
		expect(result.ok).toBe(true);
		expect(result.appended).toBe(1);
		expect(result.concept.features).toEqual(undone);
		expect(result.concept.features).not.toEqual(before);

		// And the log still replays to the tree, with the undo in it.
		const after = await history(alice);
		expect(stateAt<BladeTree>(after.rows)).toEqual(await storedTree(alice));
		expect(after.rows[after.rows.length - 1].undoesSeq).toBe(target.seq);
	});

	it('then REDOES, from a second reload, and lands back on the tree it started from', async () => {
		const beforeRedo = await storedTree(alice);
		const payload = await history(alice);
		const fold = foldHistory(payload.rows);
		expect(fold.canRedo).toBe(true);
		const target = fold.redoTarget!;
		const redone = stateAt<BladeTree>([
			...payload.rows,
			{ ...inverseOf(target), seq: (payload.newestSeq ?? 0) + 1 }
		]);
		const revision = (
			await call<{ concepts: Array<{ id: string; revision: number }> }>(
				alice,
				'public.ideacad_open_document($1::uuid)',
				[itemId]
			)
		).concepts.find((c) => c.id === conceptId)!.revision;
		const result = await apply(alice, [inverseOf(target)], redone, revision + 1);
		expect(result.ok).toBe(true);
		expect(result.concept.features).not.toEqual(beforeRedo);
		const after = await history(alice);
		expect(stateAt<BladeTree>(after.rows)).toEqual(await storedTree(alice));
	});

	it('NOTHING WAS DELETED BY EITHER PRESS, which is what "as far back as possible" means', async () => {
		const payload = await history(alice);
		// Two presses added two rows and removed none.
		expect(payload.rows.filter((r) => r.undoesSeq != null)).toHaveLength(2);
		expect(payload.rows.map((r) => r.seq)).toEqual(
			Array.from({ length: payload.total }, (_, i) => i)
		);
		expect(stateAt(payload.rows, 0)).toEqual(CORPUS_ORIGIN);
	});
});

describe('0209 PASTED A SECOND TIME over the database it already built', () => {
	// RE-PASTING IS ORDINARY -- somebody re-pastes, or a first attempt failed
	// partway and gets retried -- so a migration that only works once fails
	// exactly then, with the schema half-built. This is the one shape that
	// question can be asked in: the file, unmodified, over a database that has
	// had it AND has real rows in the table it created.
	const SECOND_APPLY = readFileSync(
		join(fileURLToPath(MIGRATION_DIR), '0209_ideacad_history.sql'),
		'utf8'
	);

	let before: { rows: string; origins: string; acl: string };

	const snapshot = async () => {
		const { rows } = await db.sql<{ rows: string; origins: string; acl: string }>(`
			select (select count(*)::text from public.ideacad_history) as rows,
			       (select count(*)::text from public.ideacad_history where kind = 'origin') as origins,
			       (select coalesce(string_agg(line, E'\n' order by line), '') from (
			           select p.oid::regprocedure::text || ' => ' ||
			                  coalesce(array_to_string(p.proacl::text[], '|'), '(null)') as line
			           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			           where n.nspname = 'public' and p.proname ~ '^_?ideacad'
			           union all
			           select 'table ' || c.relname || ' => ' ||
			                  coalesce(array_to_string(c.relacl::text[], '|'), '(null)')
			           from pg_class c join pg_namespace n on n.oid = c.relnamespace
			           where n.nspname = 'public' and c.relname ~ '^ideacad_'
			       ) q) as acl
		`);
		return rows[0];
	};

	it('applies again without raising, which is half the assertion on its own', async () => {
		before = await snapshot();
		expect(Number(before.rows)).toBeGreaterThan(200);
		// Its own self-checks raise on anything they refuse -- the positive
		// control, the grant sweep, the origin count -- so reaching the next
		// line at all is the file passing every one of them a second time.
		await db.sql(SECOND_APPLY);
	});

	it('wrote nothing and rewrote nothing: the same rows, the same origins, the same acl', async () => {
		const after = await snapshot();
		expect(after.rows).toBe(before.rows);
		expect(after.origins).toBe(before.origins);
		// Not just "the same answers fall out" -- the ACL ENTRIES themselves.
		expect(after.acl).toBe(before.acl);
		expect(after.acl).toContain('ideacad_apply_actions');
	});

	it('did not leave the planted paste-trap control function behind', async () => {
		// It is on the `_ideacad` prefix, so one left standing would sit in
		// 0206's sweep as an unclassified function forever.
		const { rows } = await db.sql<{ n: string }>(`
			select count(*)::text as n from pg_proc p
			join pg_namespace n on n.oid = p.pronamespace
			where n.nspname = 'public' and p.proname = '_ideacad_history_paste_trap_control'
		`);
		expect(Number(rows[0].n)).toBe(0);
	});

	it('still replays to the stored tree afterwards', async () => {
		const payload = await history(alice);
		expect(stateAt<BladeTree>(payload.rows)).toEqual(await storedTree(alice));
	});
});

describe('what the write RPC refuses', () => {
	it("refuses to append an origin from a client, so seq 0 stays the trigger's", async () => {
		const message = await refusal(
			alice,
			'public.ideacad_apply_actions($1::uuid, $2::jsonb, $3::jsonb, 99999)',
			[conceptId, JSON.stringify([{ kind: 'origin', path: '', after: {} }]), '{}']
		);
		expect(message).toMatch(/may not append an origin/);
	});

	it('refuses an unknown kind rather than storing a row nothing can replay', async () => {
		const message = await refusal(
			alice,
			'public.ideacad_apply_actions($1::uuid, $2::jsonb, $3::jsonb, 99999)',
			[conceptId, JSON.stringify([{ kind: 'frobnicate', path: '/a' }]), '{}']
		);
		expect(message).toMatch(/Unknown IdeaCAD action kind: frobnicate/);
	});

	it('refuses a batch that is not an array, and the guard uses `is distinct from`', async () => {
		// jsonb_typeof of an absent value is NULL and `NULL <> 'array'` is NULL,
		// which in a boolean gate propagates out and ACCEPTS the write. 0078's
		// four-month bug. Both spellings of "not an array" are put to it.
		for (const bad of ['null', '{"kind":"set"}', '"set"', '7']) {
			const message = await refusal(
				alice,
				'public.ideacad_apply_actions($1::uuid, $2::jsonb, $3::jsonb, 99999)',
				[conceptId, bad, '{}']
			);
			expect(message).toMatch(/action batch is a JSON array/);
		}
	});

	it("refuses an undo of a row that is not in this part's history", async () => {
		const message = await refusal(
			alice,
			'public.ideacad_apply_actions($1::uuid, $2::jsonb, $3::jsonb, 99999)',
			[conceptId, JSON.stringify([{ kind: 'set', path: '/a', undoesSeq: 999999 }]), '{}']
		);
		expect(message).toMatch(/not in this part's history/);
	});

	it('refuses a SECOND undo of the same row, which is two editors pressing at once', async () => {
		const payload = await history(alice);
		const taken = payload.rows.find((r) => r.undoesSeq != null)!;
		const message = await refusal(
			alice,
			'public.ideacad_apply_actions($1::uuid, $2::jsonb, $3::jsonb, 99999)',
			[
				conceptId,
				JSON.stringify([{ kind: 'set', path: '/rotation', undoesSeq: taken.undoesSeq }]),
				'{}'
			]
		);
		expect(message).toMatch(/already undid that action/);
	});

	it('has a UNIQUE INDEX behind that sentence, so the refusal is not the only thing holding it', async () => {
		const payload = await history(alice);
		const taken = payload.rows.find((r) => r.undoesSeq != null)!;
		await expect(
			db.sql(
				`insert into public.ideacad_history(concept_id, seq, kind, path, undoes_seq, actor)
				 values ($1::uuid, 500000, 'set', '/rotation', $2::bigint, 'probe')`,
				[conceptId, taken.undoesSeq]
			)
		).rejects.toThrow(/ideacad_history_undoes_once_idx/);
	});

	it('returns the SAME stale union `ideacad_save_concept` does, rather than a second shape', async () => {
		const result = await apply(alice, [], CORPUS_ORIGIN, 1);
		expect(result).toEqual(expect.objectContaining({ ok: false, reason: 'stale' }));
		expect(result.concept.features).toEqual(await storedTree(alice));
	});

	it('WRITES NOTHING ON A STALE REVISION -- the log must not advance past the tree', async () => {
		const before = await history(alice);
		await apply(alice, [{ kind: 'set', path: '/rotation', before: 'cw', after: 'ccw' }], {}, 1);
		const after = await history(alice);
		expect(after.total).toBe(before.total);
		expect(after.newestSeq).toBe(before.newestSeq);
	});

	it('leaves the tree and the log agreeing after every refusal above', async () => {
		const payload = await history(alice);
		expect(stateAt<BladeTree>(payload.rows)).toEqual(await storedTree(alice));
	});
});
