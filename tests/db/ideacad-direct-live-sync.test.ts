// tests/db/ideacad-direct-live-sync.test.ts
//
// THE LIVE LAYER'S TWO DATABASE READS, AGAINST THE REAL MIGRATIONS (feedback
// R34). The poll and the pull are best effort by design -- a failed read is
// swallowed and retried at the next tick -- so a read that production refuses,
// or that returns a shape the client cannot replay, fails SILENTLY: the
// modeler simply never updates. This drives the real transport's `live()`
// through a client whose `rpc` and `from` both go through `asUser`, so RLS,
// the definer gates and the history function's real rows are what answer.
//
// Claimed, both directions:
//   - an editor's saves reach the owner through `head` and `pull`, and the
//     replayed tree and revision EQUAL what a full open returns;
//   - a viewer reads both; a stranger reads neither, and the refusal is the
//     same "does not exist" an open gives (positive control: the owner);
//   - the rows name who made them, through the timeline's rule.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { startTestDb, createUser, type TestDb, type SeededUser } from './harness';
import { createSolidTransports } from '../../src/lib/ideacad/solid/transport';
import { appendPulled, changedBy, committedSeq } from '../../src/lib/ideacad/solid/live-sync';
import { canonical } from '../../src/lib/ideacad/solid/history';
import { diffTrees } from '../../src/lib/ideacad/history';
import type { SolidDocument, SolidSave } from '../../src/lib/ideacad/solid/types';

const ROOT = process.cwd();
const migrations = readdirSync(`${ROOT}/supabase/migrations`).filter((f) => /^\d{4}_.*\.sql$/.test(f) && Number(f.slice(0, 4)) <= 217).sort();
let db: TestDb;
let owner: SeededUser, editor: SeededUser, viewer: SeededUser, stranger: SeededUser;

async function call(user: SeededUser, expression: string, params: unknown[] = []): Promise<any> {
	return db.asUser(user.id, async (q) => (await q(`select ${expression} as result`, params)).rows[0].result);
}
/** A Supabase client just wide enough for the transport: `rpc` and the one `from().select().eq().maybeSingle()` read, both as `user`. */
function clientFor(user: SeededUser) {
	return {
		rpc: async (name: string, args: Record<string, unknown> = {}) => {
			try {
				const keys = Object.keys(args), values = keys.map((k) => (['p_actions', 'p_model', 'p_artifacts'].includes(k) ? JSON.stringify(args[k]) : args[k]));
				return { data: await call(user, `public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(',')})`, values), error: null };
			} catch (error) { return { data: null, error: { message: (error as Error).message } }; }
		},
		from: (table: string) => ({
			select: (columns: string) => ({
				eq: (column: string, value: unknown) => ({
					maybeSingle: async () => {
						if (!/^[a-z_]+$/.test(table) || !/^[a-z_,]+$/.test(columns) || !/^[a-z_]+$/.test(column)) throw Error('unexpected read');
						try {
							const rows = await db.asUser(user.id, async (q) => (await q(`select ${columns} from public.${table} where ${column} = $1`, [value])).rows);
							return { data: rows[0] ?? null, error: null };
						} catch (error) { return { data: null, error: { message: (error as Error).message } }; }
					}
				})
			})
		})
	} as never;
}
function titleInput(document: SolidDocument, ...titles: string[]): SolidSave {
	let before = document.snapshot.manifest;
	const actions = titles.map((title) => { const after = { ...before, title }, action = { id: randomUUID(), label: 'Rename', before, after, createdAt: new Date().toISOString() }; before = after; return action; });
	return { documentId: document.id, conceptId: document.conceptId, expectedRevision: document.revision, requestId: actions[0].id, title: before.title, snapshot: { manifest: before, artifacts: document.snapshot.artifacts }, actions };
}

beforeAll(async () => {
	db = await startTestDb(['../../tests/db/full-chain-fixture-completion.sql', ...migrations]);
	[owner, editor, viewer, stranger] = await Promise.all([
		createUser(db, 'live.owner@boscotech.net', 'Owner'),
		createUser(db, 'ana.reyes@boscotech.net', 'Ana Reyes'),
		createUser(db, 'live.viewer@boscotech.net', 'Viewer'),
		createUser(db, 'live.stranger@boscotech.net', 'Stranger')
	]);
});
afterAll(async () => { await db?.stop(); });

describe('an editor\'s saves reach another open copy through the live reads alone', () => {
	it('head and pull replay to exactly the tree and revision a full open returns, bytes included', async () => {
		const own = createSolidTransports(clientFor(owner));
		const opened = await own.transport.create('Shared bracket');
		await call(owner, 'public.ideacad_share_direct_document($1::uuid,$2,$3)', [opened.id, editor.email, 'editor']);
		await call(owner, 'public.ideacad_share_direct_document($1::uuid,$2,$3)', [opened.id, viewer.email, 'viewer']);
		const live = own.live(owner.email);
		expect(await live.head(opened.conceptId)).toBe(1);

		// Ana renames twice through the real transport, then adds a body with real bytes through the save RPC.
		const theirs = createSolidTransports(clientFor(editor));
		const theirOpen = await theirs.transport.open(opened.id);
		expect((await theirs.transport.save(titleInput(theirOpen, 'Ana one', 'Ana two'))).revision).toBe(3);
		const bytes = new Uint8Array(randomUUID().split('').map((c) => c.charCodeAt(0)));
		const hash = createHash('sha256').update(bytes).digest('hex');
		const current = await call(editor, 'public.ideacad_open_direct_document($1::uuid)', [opened.id]);
		const withBody = { ...current.concept.features, bodies: [{ id: randomUUID(), name: 'Box', artifact: hash, materialId: null, role: 'part' }] };
		const saved = await call(editor, 'public.ideacad_save_direct_document($1::uuid,$2::integer,$3::uuid,$4,$5::jsonb,$6::jsonb,$7::jsonb)', [
			opened.id, 3, randomUUID(), 'Box', JSON.stringify(diffTrees(current.concept.features, withBody)), JSON.stringify(withBody), JSON.stringify([{ hash, data: Buffer.from(bytes).toString('base64') }])
		]);
		expect(saved.ok).toBe(true);

		// The owner's copy: the poll sees revision 4, and the pull after its own last row replays to what an open says.
		expect(await live.head(opened.conceptId)).toBe(4);
		const from = committedSeq(opened.history!, opened.revision);
		expect(from).toBe(0);
		const pulled = await live.pull({ documentId: opened.id, conceptId: opened.conceptId, afterSeq: from, have: new Set(), artifacts: true });
		expect(pulled.rows.map((r) => r.seq)).toEqual([1, 2, 3]);
		expect(pulled.artifacts.map((a) => a.hash)).toEqual([hash]);
		const next = appendPulled<SolidDocument['snapshot']['manifest']>(opened.history!, pulled.rows);
		const fresh = await own.transport.open(opened.id);
		expect(next?.revision).toBe(fresh.revision);
		expect(canonical(next?.manifest)).toBe(canonical(fresh.snapshot.manifest));
		expect(canonical(next?.history)).toBe(canonical(fresh.history));
		expect(changedBy(pulled.rows, owner.email)).toEqual(['Ana Reyes']);

		// A pull from where the owner now is reads nothing more.
		expect((await live.pull({ documentId: opened.id, conceptId: opened.conceptId, afterSeq: next!.lastSeq, have: new Set([hash]), artifacts: true })).rows).toEqual([]);

		// A viewer reads both; a stranger reads neither, with the refusal an open gives.
		const viewing = createSolidTransports(clientFor(viewer)).live(viewer.email);
		expect(await viewing.head(opened.conceptId)).toBe(4);
		expect((await viewing.pull({ documentId: opened.id, conceptId: opened.conceptId, afterSeq: 0, have: new Set(), artifacts: false })).rows).toHaveLength(3);
		const outside = createSolidTransports(clientFor(stranger)).live(stranger.email);
		await expect(outside.head(opened.conceptId)).rejects.toThrow('That document does not exist.');
		await expect(outside.pull({ documentId: opened.id, conceptId: opened.conceptId, afterSeq: 0, have: new Set(), artifacts: false })).rejects.toThrow('does not exist');
		await expect(createSolidTransports(clientFor(stranger)).transport.open(opened.id)).rejects.toThrow('does not exist');
	});
});
