// tests/db/connector-0416.test.ts
//
// THE CONNECTOR GAPS LEDGER 0416 CLOSED, end to end on the local backend over
// the real migration chain. Every judge is a row read back as the connection
// owner, never the tool's own answer.
//
//   C1  81be18d9  a confirm-level site_call whose arguments the server fills
//                 (armory_create_project's p_operation) completes on its own
//                 confirm_token, writes once, and the token is single use
//   C2a ae4a495d  list_posts names every class a shared post is in
//   C2b ae4a495d  file_site_feedback files a report in the site's list as him
//   C6  3157f5d8  the feedback list takes horizon and count, alone or together
//       (and the list facade filters by status)
//   C7            feedback_screenshot finds the report and says plainly there
//                 is no storage here (the local backend has none)

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { connectorWorld, type ConnectorWorld } from './connector-fixture';
import { runTool } from '../../src/lib/server/connector/tools';

let w: ConnectorWorld;

beforeAll(async () => {
	w = await connectorWorld();
}, 180_000);

afterAll(async () => {
	await w?.stop();
});

async function run(name: string, args: Record<string, unknown>) {
	return runTool(await w.ctx(w.admin), name, { said: 'test request', ...args });
}

describe('C1: a confirm whose arguments the server fills completes', () => {
	it('preview, then the same call with its confirm_token, writes the project exactly once', async () => {
		const name = `Robot ${Math.random().toString(36).slice(2, 8)}`;
		const count = async () =>
			Number((await w.db.sql<{ n: string }>(`select count(*) as n from public.armory_projects where name = $1`, [name])).rows[0].n);
		const args = { name: 'armory_create_project', args: { name, season: 2027 } };
		const preview = await run('site_call', args);
		expect(preview.status).toBe('preview');
		expect(typeof preview.confirm_token).toBe('string');
		expect(await count()).toBe(0);

		const done = await run('site_call', { ...args, confirm_token: preview.confirm_token });
		expect(done.status, JSON.stringify(done)).toBe('done');
		expect(await count()).toBe(1);

		// Single use: the same token again writes nothing.
		const again = await run('site_call', { ...args, confirm_token: preview.confirm_token });
		expect(again.status).toBe('needs_confirmation');
		expect(await count()).toBe(1);
	});

	it('a token from one preview does not confirm different arguments', async () => {
		const preview = await run('site_call', { name: 'armory_create_project', args: { name: 'Robot alpha', season: 2027 } });
		const other = await run('site_call', { name: 'armory_create_project', args: { name: 'Robot beta', season: 2027 }, confirm_token: preview.confirm_token });
		expect(other.status).toBe('needs_confirmation');
		const n = await w.db.sql<{ n: string }>(`select count(*) as n from public.armory_projects where name in ('Robot alpha', 'Robot beta')`);
		expect(Number(n.rows[0].n)).toBe(0);
	});
});

describe('C2a: a shared post lists every class it is in', () => {
	it('asked about Block 4, a post shared to Block 2, Block 4 and a class he does not teach names all three', async () => {
		const made = await w.backend.rpc<{ item_id: string }>(await w.backend.mintSession({ id: w.admin.id, email: w.admin.email }), 'classroom_create_item', {
			p_kind: 'assignment',
			p_section_ids: [w.block2, w.block4, w.teacherSection],
			p_title: 'Shop Fix: Shared Log',
			p_body: '',
			p_points: 10
		});
		expect(made.error).toBeNull();
		const out = await run('list_posts', { class: 'Block 4' });
		const post = (out.posts as Array<{ post: string; classes: string[]; shared?: string }>).find((p) => p.post === 'Shop Fix: Shared Log');
		expect(post, JSON.stringify(out)).toBeDefined();
		expect(post!.classes).toHaveLength(3);
		expect(post!.classes.some((c) => /Block 2/.test(c))).toBe(true);
		expect(post!.classes.some((c) => /Block 4/.test(c))).toBe(true);
		expect(post!.classes.some((c) => /IDEA100/.test(c))).toBe(true);
		expect(post!.shared).toMatch(/every one of them/);
		// And a post in Block 4 alone says nothing about sharing.
		await w.backend.rpc(await w.backend.mintSession({ id: w.admin.id, email: w.admin.email }), 'classroom_create_item', {
			p_kind: 'assignment', p_section_ids: [w.block4], p_title: 'Block 4 Only', p_body: '', p_points: 5
		});
		const again = await run('list_posts', { class: 'Block 4' });
		const solo = (again.posts as Array<{ post: string; classes: string[]; shared?: string }>).find((p) => p.post === 'Block 4 Only');
		expect(solo!.classes).toHaveLength(1);
		expect(solo!.shared).toBeUndefined();
	});
});

describe('C2b and C6: the site feedback list', () => {
	it('file_site_feedback asks first, then files one report as him in the one list', async () => {
		const args = { kind: 'bug', message: 'The matrix theme background does not move.', page: '/', said: 'file a bug that the matrix theme is not moving' };
		const preview = await run('file_site_feedback', args);
		expect(preview.status).toBe('preview');
		const before = await w.db.sql(`select id from public.app_feedback where message = $1`, [args.message]);
		expect(before.rows).toHaveLength(0);
		const done = await run('file_site_feedback', { ...args, confirm_token: preview.confirm_token });
		expect(done.status, JSON.stringify(done)).toBe('done');
		const rows = await w.db.sql<{ user_id: string; kind: string; horizon: string; context: string; status: string }>(
			`select user_id, kind, horizon, context, status from public.app_feedback where message = $1`,
			[args.message]
		);
		expect(rows.rows).toEqual([{ user_id: w.admin.id, kind: 'bug', horizon: 'now', context: '/', status: 'new' }]);
	});

	it('a student cannot file one through the connector, and nothing lands', async () => {
		const out = await runTool(await w.ctx(w.student), 'file_site_feedback', { kind: 'idea', message: 'A student idea.', said: 'x', confirm_token: 'nope' });
		expect(['refused', 'needs_confirmation']).toContain(out.status);
		const rows = await w.db.sql(`select id from public.app_feedback where message = 'A student idea.'`);
		expect(rows.rows).toHaveLength(0);
	});

	it('the list takes horizon alone, count alone, and both together (each answered the function could not be found)', async () => {
		await w.db.sql(
			`insert into public.app_feedback (user_id, app, kind, message, meta, horizon, status) values
			 ($1, 'portal', 'idea', 'A long term idea.', '{}'::jsonb, 'long_term', 'new'),
			 ($1, 'classroom', 'bug', 'A resolved bug.', '{}'::jsonb, 'now', 'resolved')`,
			[w.admin.id]
		);
		for (const args of [{ horizon: 'now' }, { count: 5 }, { horizon: 'long_term', count: 5 }, {}]) {
			const out = await run('site_call', { name: 'app_feedback_admin_list', args });
			expect(out.status, `${JSON.stringify(args)}: ${JSON.stringify(out).slice(0, 300)}`).toBe('ok');
		}
		const longTerm = await run('site_call', { name: 'app_feedback_admin_list', args: { horizon: 'long_term' } });
		const msgs = (longTerm.result as Array<{ message: string }>).map((r) => r.message);
		expect(msgs).toContain('A long term idea.');
		expect(msgs).not.toContain('The matrix theme background does not move.');
	});

	it('list_site_feedback filters by status and horizon and keeps each report short', async () => {
		const open = await run('list_site_feedback', {});
		const openMsgs = (open.reports as Array<{ message: string }>).map((r) => r.message);
		expect(openMsgs).toContain('The matrix theme background does not move.');
		expect(openMsgs).not.toContain('A resolved bug.');
		expect(openMsgs).not.toContain('A long term idea.');
		const resolved = await run('list_site_feedback', { status: 'resolved', horizon: 'both' });
		expect((resolved.reports as Array<{ message: string }>).map((r) => r.message)).toEqual(['A resolved bug.']);
		const ideas = await run('list_site_feedback', { horizon: 'long term' });
		expect((ideas.reports as Array<{ message: string }>).map((r) => r.message)).toEqual(['A long term idea.']);
		const first = (open.reports as Array<Record<string, unknown>>)[0];
		expect(Object.keys(first).sort()).toEqual(['app', 'filed', 'from', 'horizon', 'kind', 'message', 'page', 'report', 'screenshot', 'short', 'status', 'tried'].sort());
	});
});

describe('C7: a feedback screenshot', () => {
	it('finds the report by its first eight characters and says when there is no screenshot, or no storage', async () => {
		const [row] = (await w.db.sql<{ id: string }>(`select id from public.app_feedback where message = 'A long term idea.'`)).rows;
		const none = await run('feedback_screenshot', { report: row.id.slice(0, 8) });
		expect(none).toMatchObject({ status: 'none', report: row.id });
		await w.db.sql(`update public.app_feedback set screenshot_path = $2 where id = $1`, [row.id, `${w.admin.id}/${randomUUID()}.png`]);
		const local = await run('feedback_screenshot', { report: row.id.slice(0, 8) });
		expect(local.status).toBe('refused');
		expect(String(local.message)).toMatch(/no file storage/);
		const missing = await run('feedback_screenshot', { report: 'ffffffff' });
		expect(missing.status).toBe('not_found');
	});
});
