/**
 * TWO EDITORS, ONE LOG -- and a part that has been deleted keeping its history.
 *
 * Two of prompt 0189's four. Both are claims about the database and neither is
 * answerable from the arithmetic alone.
 *
 * WHAT "ONE COHERENT ORDERED LOG" HAS TO MEAN, precisely, or the test is
 * decoration: over a document 0205 shared with a second editor, every action
 * either party takes lands in ONE sequence with no gap, no duplicate and no
 * tie; every row says which of them did it; and replaying that single sequence
 * still equals the stored tree. The serialisation point is the `for update` on
 * the concept row that `ideacad_apply_actions` already takes -- the same lock
 * `ideacad_save_concept` has held since 0201 -- so the seq allocation inside it
 * cannot interleave.
 *
 * The undo race is separate and is closed by an index rather than by a lock,
 * because two editors can legitimately be inside two different batches and
 * still both aim at the same row to invert. `ideacad_history_undoes_once_idx`
 * is what makes the loser lose.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSharingFixture, type SharingFixture } from './ideacad-sharing-fixture';
import {
	diffTrees,
	foldHistory,
	inverseOf,
	stateAt,
	unwindTo,
	type IdeacadAction,
	type IdeacadHistoryRow
} from '../../src/lib/ideacad/history';

let f: SharingFixture;

interface ApplyResult {
	ok: boolean;
	reason?: string;
	concept: { features: Record<string, unknown>; revision: number };
	appended: number;
}
interface HistoryPayload {
	rows: IdeacadHistoryRow[];
	total: number;
	newestSeq: number | null;
}

const apply = (
	user: SharingFixture['owner'],
	conceptId: string,
	actions: readonly (IdeacadAction & { undoesSeq?: number })[],
	features: unknown,
	revision: number
) =>
	f.call<ApplyResult>(
		user,
		'public.ideacad_apply_actions($1::uuid, $2::jsonb, $3::jsonb, $4)',
		[conceptId, JSON.stringify(actions), JSON.stringify(features), revision]
	);

const history = (user: SharingFixture['owner'], conceptId: string) =>
	f.call<HistoryPayload>(user, 'public.ideacad_concept_history($1::uuid, -1, 5000)', [conceptId]);

const conceptRow = async (conceptId: string) => {
	const { rows } = await f.db.sql<{ features: Record<string, unknown>; revision: number }>(
		'select features, revision from public.ideacad_concepts where id = $1::uuid',
		[conceptId]
	);
	return rows[0];
};

beforeAll(async () => {
	f = await buildSharingFixture('ideacadhist');
	await f.call(f.owner, "public.ideacad_share_document($1::uuid, $2, 'editor')", [
		f.documentId,
		f.editor.email
	]);
	await f.call(f.owner, "public.ideacad_share_document($1::uuid, $2, 'viewer')", [
		f.documentId,
		f.viewer.email
	]);
}, 600_000);

afterAll(async () => f?.db.stop());

describe('two editors of one shared document', () => {
	let expected: Record<string, unknown> = {};

	it('interleave their edits into ONE ordered sequence, each row naming its author', async () => {
		// The fixture's seeded tree, which the corpus of this file is built on
		// top of. It is not a blade tree and does not need to be: what is under
		// test is the ORDER, not the geometry.
		let tree: Record<string, unknown> = { blade: 'seed' };
		let revision = 1;
		const authors: string[] = [];

		for (let turn = 0; turn < 24; turn += 1) {
			const who = turn % 2 === 0 ? f.owner : f.editor;
			const next = { ...tree, [`k${turn}`]: turn, touched: who.email };
			const actions = diffTrees(tree, next);
			expect(actions.length).toBeGreaterThan(0);
			revision += 1;
			const result = await apply(who, f.conceptId, actions, next, revision);
			expect(result.ok).toBe(true);
			for (let i = 0; i < result.appended; i += 1) authors.push(who.email);
			tree = next;
		}
		expected = tree;

		const payload = await history(f.owner, f.conceptId);
		// No gap, no duplicate, no tie: seq 0..n exactly once each.
		expect(payload.rows.map((r) => r.seq)).toEqual(
			Array.from({ length: payload.total }, (_, i) => i)
		);
		// Every action row says who, and BOTH editors are genuinely in it --
		// a log with one author in it would pass an ordering check on its own.
		const actionRows = payload.rows.filter((r) => r.kind !== 'origin');
		expect(actionRows.map((r) => r.actor)).toEqual(authors);
		expect(new Set(actionRows.map((r) => r.actor))).toEqual(
			new Set([f.owner.email, f.editor.email])
		);
		expect(actionRows.filter((r) => r.actor === f.editor.email).length).toBeGreaterThan(10);
	});

	it('replays that one sequence to the tree the two of them actually left', async () => {
		const payload = await history(f.owner, f.conceptId);
		const stored = await conceptRow(f.conceptId);
		expect(stateAt(payload.rows)).toEqual(stored.features);
		expect(stored.features).toEqual(expected);
	});

	it('serialises two SIMULTANEOUS batches: one lands whole, the other is refused whole', async () => {
		const before = await history(f.owner, f.conceptId);
		const stored = await conceptRow(f.conceptId);
		const revision = stored.revision + 1;
		// Both aim at the same revision, which is what two editors who read at
		// the same moment do. The `for update` on the concept makes one wait.
		const [a, b] = await Promise.all([
			apply(f.owner, f.conceptId, diffTrees(stored.features, { ...stored.features, race: 'owner' }), { ...stored.features, race: 'owner' }, revision),
			apply(f.editor, f.conceptId, diffTrees(stored.features, { ...stored.features, race: 'editor' }), { ...stored.features, race: 'editor' }, revision)
		]);
		const winners = [a, b].filter((r) => r.ok);
		const losers = [a, b].filter((r) => !r.ok);
		expect(winners).toHaveLength(1);
		expect(losers[0].reason).toBe('stale');

		const after = await history(f.owner, f.conceptId);
		// EXACTLY ONE batch's rows landed. A partial interleave would show up
		// here as two, and a lost update as none.
		expect(after.total).toBe(before.total + 1);
		expect(after.rows.map((r) => r.seq)).toEqual(
			Array.from({ length: after.total }, (_, i) => i)
		);
		expect(stateAt(after.rows)).toEqual((await conceptRow(f.conceptId)).features);
	});

	it('lets only ONE of two simultaneous undos of the same action through', async () => {
		const payload = await history(f.owner, f.conceptId);
		const fold = foldHistory(payload.rows);
		const target = fold.undoTarget!;
		const stored = await conceptRow(f.conceptId);
		const undone = unwindTo(stored.features, payload.rows, target.seq - 1);
		const attempt = (who: SharingFixture['owner']) =>
			apply(who, f.conceptId, [inverseOf(target)], undone, stored.revision + 1).then(
				(r) => ({ ok: r.ok as boolean, message: '' }),
				(e: Error) => ({ ok: false, message: e.message })
			);
		const results = await Promise.all([attempt(f.owner), attempt(f.editor)]);
		expect(results.filter((r) => r.ok)).toHaveLength(1);
		const refused = results.find((r) => !r.ok)!;
		// Either gate is a correct refusal and both are the same event: the
		// stale revision if the loser read first, the undo index if it did not.
		expect(refused.message === '' || /already undid that action|stale/.test(refused.message)).toBe(
			true
		);

		const after = await history(f.owner, f.conceptId);
		expect(after.rows.filter((r) => r.undoesSeq === target.seq)).toHaveLength(1);
		expect(stateAt(after.rows)).toEqual((await conceptRow(f.conceptId)).features);
	});
});

describe('who may read a history and who may write one', () => {
	it('lets a VIEWER read the whole log but append nothing to it', async () => {
		const payload = await history(f.viewer, f.conceptId);
		expect(payload.total).toBeGreaterThan(20);
		const stored = await conceptRow(f.conceptId);
		const message = await f.refusal(
			f.viewer,
			'public.ideacad_apply_actions($1::uuid, $2::jsonb, $3::jsonb, $4)',
			[f.conceptId, JSON.stringify([{ kind: 'set', path: '/blade', after: 'viewer' }]), '{}', stored.revision + 1]
		);
		expect(message).toMatch(/view-only access/);
		// The refusal wrote nothing at all, which is the half a message cannot
		// establish on its own.
		const after = await history(f.owner, f.conceptId);
		expect(after.total).toBe(payload.total);
		expect(await f.db.sql(`select 1 from public.ideacad_history where actor = $1`, [f.viewer.email]).then((r) => r.rows)).toHaveLength(0);
	});

	it('lets the TEACHER OF RECORD read it, because a graded assignment is exactly that', async () => {
		const payload = await history(f.teacher, f.conceptId);
		expect(payload.total).toBeGreaterThan(20);
		expect(stateAt(payload.rows)).toEqual((await conceptRow(f.conceptId)).features);
	});

	it('answers a CLASSMATE, a STRANGER and a teacher of another section identically to a part that does not exist', async () => {
		const unseen = '00000000-0000-4000-8000-0000000000ff';
		const outsiders = [f.classmate, f.stranger, f.otherTeacher];
		for (const who of outsiders) {
			const real = await f.refusal(who, 'public.ideacad_concept_history($1::uuid, -1, 5000)', [
				f.conceptId
			]);
			const absent = await f.refusal(who, 'public.ideacad_concept_history($1::uuid, -1, 5000)', [
				unseen
			]);
			// "Not found" and "not yours" answer identically, so a concept id
			// cannot be probed for existence from outside.
			expect(real).toMatch(/not one you can open/);
			expect(real).toBe(absent);
		}
		// The positive control: the same call, as somebody who may, answers.
		expect((await history(f.owner, f.conceptId)).total).toBeGreaterThan(20);
	});

	it('hands an outsider NO ROW through the table either, which is the policy rather than the RPC', async () => {
		for (const who of [f.classmate, f.stranger, f.otherTeacher]) {
			const rows = await f.db.asUser(who.id, async (q) => {
				const { rows } = await q(
					'select seq from public.ideacad_history where concept_id = $1::uuid',
					[f.conceptId]
				);
				return rows;
			});
			expect(rows).toHaveLength(0);
		}
		// Positive control on the same statement, same role switch: the owner
		// sees them, so the sweep above is not reading an empty table.
		const mine = await f.db.asUser(f.owner.id, async (q) => {
			const { rows } = await q(
				'select seq from public.ideacad_history where concept_id = $1::uuid',
				[f.conceptId]
			);
			return rows;
		});
		expect(mine.length).toBeGreaterThan(20);
	});

	it('gives NO client a way to write a row directly -- every write is the definer RPC', async () => {
		for (const who of [f.owner, f.editor, f.teacher]) {
			const message = await f.refusal(
				who,
				`(insert into public.ideacad_history(concept_id, seq, kind, path, actor)
				  values ($1::uuid, 900001, 'set', '/probe', 'forged') returning 1)`,
				[f.conceptId]
			).catch((e: Error) => e.message);
			expect(message).not.toBe('');
		}
		const { rows } = await f.db.sql(
			`select 1 from public.ideacad_history where actor = 'forged'`
		);
		expect(rows).toHaveLength(0);
	});
});

describe('A DELETED PART KEEPS ITS HISTORY', () => {
	it('keeps every row after `ideacad_delete_concept` soft-deletes it, and still replays', async () => {
		// A second concept, edited, then deleted. Deleting needs a sibling to
		// fall back to, which the fixture's own concept provides.
		const doomed = await f.call<{ id: string; revision: number }>(
			f.owner,
			'public.ideacad_new_concept($1::uuid, $2, $3::jsonb)',
			[f.documentId, 'Doomed', JSON.stringify({ blade: 'doomed' })]
		);
		let tree: Record<string, unknown> = { blade: 'doomed' };
		let revision = doomed.revision;
		for (let i = 0; i < 6; i += 1) {
			const next = { ...tree, [`step${i}`]: i };
			revision += 1;
			expect((await apply(f.owner, doomed.id, diffTrees(tree, next), next, revision)).ok).toBe(true);
			tree = next;
		}
		const before = await history(f.owner, doomed.id);
		expect(before.total).toBe(7);

		const result = await f.call<{ ok: boolean }>(f.owner, 'public.ideacad_delete_concept($1::uuid)', [
			doomed.id
		]);
		expect(result.ok).toBe(true);
		const { rows: deleted } = await f.db.sql<{ deleted_at: string | null }>(
			'select deleted_at from public.ideacad_concepts where id = $1::uuid',
			[doomed.id]
		);
		expect(deleted[0].deleted_at).not.toBeNull();

		// THE CLAIM: every row is still there, still readable, and still
		// replays to the tree the part was left in.
		const after = await history(f.owner, doomed.id);
		expect(after.total).toBe(before.total);
		expect(after.rows).toEqual(before.rows);
		expect(stateAt(after.rows)).toEqual(tree);
		expect(stateAt(after.rows, 0)).toEqual({ blade: 'doomed' });
	});

	it('keeps it for the TEACHER too, so deleting a part does not hide the work that went into it', async () => {
		const { rows } = await f.db.sql<{ id: string }>(
			'select id from public.ideacad_concepts where deleted_at is not null limit 1'
		);
		const payload = await history(f.teacher, rows[0].id);
		expect(payload.total).toBe(7);
	});

	it('has NO hard delete of a concept anywhere in the schema, which is what the cascade would take', async () => {
		// The FK is `on delete cascade`, so a row that vanished WOULD take its
		// history with it. That is the correct behaviour for a row nothing
		// should ever remove -- and the reason it is safe is that nothing does.
		// Asserted from `prosrc` rather than assumed, because a plpgsql body's
		// dependency on another object is not recorded in the catalog.
		const { rows } = await f.db.sql<{ proname: string }>(`
			select p.proname from pg_proc p
			join pg_namespace n on n.oid = p.pronamespace
			where n.nspname = 'public' and p.prokind = 'f'
			  and p.prosrc ~* 'delete\\s+from\\s+public\\.ideacad_concepts'
			order by 1
		`);
		expect(rows.map((r) => r.proname)).toEqual([]);
		// The positive control for that sweep: the same query DOES find the one
		// function that deletes a sharing grant, so it can see a delete.
		const { rows: control } = await f.db.sql<{ proname: string }>(`
			select p.proname from pg_proc p
			join pg_namespace n on n.oid = p.pronamespace
			where n.nspname = 'public' and p.prokind = 'f'
			  and p.prosrc ~* 'delete\\s+from\\s+public\\.ideacad_grants'
			order by 1
		`);
		expect(control.map((r) => r.proname)).toContain('ideacad_unshare_document');
	});
});
