// tests/db/connector-edit-post.test.ts
//
// EDITING A POST THROUGH THE CONNECTOR (ledger 0438 item 6, site gaps 4353a482
// and c602486a), end to end on the local backend over the whole chain. The
// call that damaged a live post on 2026-10-26 (a title and a category through
// site_call) is made again, and every other column is read back unchanged;
// set_points and set_due, the other two connector callers, are held to the
// same. Judged by the rows, never by the tool's answer.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectorWorld, type ConnectorWorld } from './connector-fixture';
import { runTool } from '../../src/lib/server/connector/tools';
import { findTools } from '../../src/lib/server/connector/registry';

let w: ConnectorWorld;
let item: string;
const run = async (name: string, args: Record<string, unknown>) => runTool(await w.ctx(w.admin), name, args);
const COLS = 'title, body, body_doc, points, due_at, category, published, publish_at';
const row = async () => (await w.db.sql(`select ${COLS} from public.classroom_items where id = $1`, [item])).rows[0];

beforeAll(async () => {
	w = await connectorWorld();
	const made = await run('create_post', {
		classes: ['209H Block 2'],
		kind: 'assignment',
		title: 'Launcher: Design',
		body: 'Sketch the launcher and size the spring.',
		points: 20,
		due: 'Oct 30 11:59pm',
		category: 'Design'
	});
	expect(made.status, JSON.stringify(made)).toBe('done');
	item = (await w.db.sql<{ id: string }>(`select id from public.classroom_items where title = 'Launcher: Design'`)).rows[0].id;
}, 240_000);
afterAll(async () => w?.stop());

describe('an edit through the connector changes only what was said', () => {
	it('create_post takes a category', async () => {
		const r = await row();
		expect(r.category).toBe('Design');
		expect(r.points).toBe(20);
		expect(r.body).toContain('size the spring');
	});

	it('the 2026-10-26 call (a title and a category) keeps the text, points and due date', async () => {
		const before = await row();
		const out = await run('site_call', { name: 'classroom_update_item', args: { post: 'Launcher: Design', title: 'Launcher: Design', category: 'Prototype' } });
		expect(out.status, JSON.stringify(out)).toBe('done');
		const after = await row();
		expect(after.category).toBe('Prototype');
		expect({ ...after, category: before.category }).toEqual(before);
	});

	it('set_points changes the points and nothing else', async () => {
		const before = await row();
		expect((await run('set_points', { post: 'Launcher: Design', points: 25 })).status).toBe('done');
		const after = await row();
		expect(after.points).toBe(25);
		expect({ ...after, points: before.points }).toEqual(before);
	});

	it('set_due with none takes the due date off and nothing else', async () => {
		const before = await row();
		expect((await run('set_due', { post: 'Launcher: Design', due: 'none' })).status).toBe('done');
		const after = await row();
		expect(after.due_at).toBeNull();
		expect({ ...after, due_at: before.due_at }).toEqual(before);
	});

	it('a search for setting a grading category finds the edit', () => {
		const names = findTools("set a post's grading category").map((m) => (m as { name?: string; call?: { name?: string } }).name ?? JSON.stringify(m));
		expect(names.join(' ')).toContain('classroom_update_item');
	});
});
