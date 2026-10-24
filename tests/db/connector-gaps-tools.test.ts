// tests/db/connector-gaps-tools.test.ts
//
// THE CONNECTOR GAPS LEDGER 0422 CLOSES, END TO END through the real tools on
// the local backend over the whole chain. Every judge is a row read back as
// the connection owner, never the tool's own answer.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { connectorWorld, type ConnectorWorld } from './connector-fixture';
import { runTool } from '../../src/lib/server/connector/tools';

let w: ConnectorWorld;
const HTML = readFileSync(fileURLToPath(new URL('../fixtures/hx-smoke-test.html', import.meta.url)), 'utf8');

beforeAll(async () => {
	w = await connectorWorld();
	// Contracts are a full coin admin's (the owner, or one listed).
	await w.db.sql(`insert into public.coin_full_admins (email, added_by) values ($1, 'test') on conflict do nothing`, [w.admin.email]);
}, 180_000);
afterAll(async () => w?.stop());

const run = async (name: string, args: Record<string, unknown>) => runTool(await w.ctx(w.admin), name, args);

describe('an id is always takeable by its name (the new item)', () => {
	it('site_call takes a tournament by its name, and an unknown name writes nothing', async () => {
		const made = await run('create_tournament', { name: 'Blade Night', description: 'Spinning tops.' });
		expect(['done', 'preview', 'ok']).toContain(made.status);
		const found = await run('site_call', { name: 'connector_lookup', args: { kind: 'tournament', name: 'blade night' } });
		expect(found.status, JSON.stringify(found)).toBe('ok');
		const none = await run('site_call', { name: 'connector_lookup', args: { kind: 'tournament', name: 'fly to the moon' } });
		expect(JSON.stringify(none.result ?? none)).not.toContain('Blade Night');
	});
	it('a retired contract tool is not offered and writes nothing (ledger 0432)', async () => {
		const before = Number((await w.db.sql<{ n: string }>(`select count(*) as n from public.coin_contracts`)).rows[0].n);
		const posted = await run('site_call', { name: 'coin_contract_post', args: { title: 'Sweep IDEA Shop', text: 'Sweep it.', pay: 'flat', coins: 2, students: 1 } });
		expect(posted.status).toBe('not_available');
		expect(Number((await w.db.sql<{ n: string }>(`select count(*) as n from public.coin_contracts`)).rows[0].n)).toBe(before);
	});
});

describe('every student\'s answers in one call, and names found by the account name too (gap e40c6d2d)', () => {
	it('read_answers with no student gives every student; a misspelled first name still finds the one student', async () => {
		await run('create_post', { classes: ['209H Block 2'], kind: 'assignment', title: 'Blade Check', points: 10 });
		const item = (await w.db.sql<{ id: string }>(`select id from public.classroom_items where title = 'Blade Check'`)).rows[0].id;
		await w.db.sql(`insert into public.classroom_responses (item_id, student_email, block_id, value) values
			($1, $2, 'q1', '"mateo answer"'::jsonb), ($1, $3, 'q1', '"daniel answer"'::jsonb)`, [item, w.students.mateo, w.students.danielR]);
		const all = await run('read_answers', { post: 'Blade Check' });
		expect(all.status).toBe('ok');
		const students = all.students as Array<{ email: string; answers: Array<{ answer: unknown }> }>;
		expect(students.map((s) => s.email).sort()).toEqual([w.students.danielR, w.students.mateo].sort());
		// One edit away ("Mateu" for "Mateo") still finds Mateo, and only him.
		const one = await run('read_answers', { post: 'Blade Check', student: 'Mateu Reyes' });
		expect(one).toMatchObject({ status: 'ok', student: 'Mateo Reyes' });
	});
});

describe('an important notice with a named link (gap f386c075)', () => {
	it('the notice is stored with [name](address) and marked important', async () => {
		const out = await run('create_post', {
			classes: ['209H Block 2'],
			kind: 'notice',
			body: 'Brackets are up.',
			link: 'https://ideabosco.com/tournaments/abc',
			linkName: 'Tournament bracket',
			important: true,
			request_id: 'notice-1'
		});
		expect(out.status).toBe('done');
		const row = (await w.db.sql<{ body: string; important: boolean }>(`select body, important from public.classroom_quick_posts order by created_at desc limit 1`)).rows[0];
		expect(row.body).toBe('Brackets are up.\n[Tournament bracket](https://ideabosco.com/tournaments/abc)');
		expect(row.important).toBe(true);
	});
});

describe('retire instead of orphan (gap 03246300)', () => {
	it('with retire set, the dropped answered question is retired (undoable), the document replaced, and the answer still stored', async () => {
		await run('create_post', { classes: ['209H Block 2'], kind: 'assignment', title: 'Retire Me', points: 10 });
		expect((await run('replace_html_assignment', { post: 'Retire Me', html: HTML, filename: 'r.html' })).status).toBe('done');
		const item = (await w.db.sql<{ id: string }>(`select id from public.classroom_items where title = 'Retire Me'`)).rows[0].id;
		await w.db.sql(`insert into public.classroom_responses (item_id, student_email, block_id, value) values ($1, $2, 'smoke-writing-line', '"kept"'::jsonb)`, [item, w.students.mateo]);
		const dropped = HTML.replace('"smoke-writing-line"', '"smoke-writing-line-2"');
		const refused = await run('replace_html_assignment', { post: 'Retire Me', html: dropped });
		expect(refused.status).toBe('refused');
		// Retiring is undoable (its reverse is un-retire), so it runs at once, logged.
		const yes = await run('replace_html_assignment', { post: 'Retire Me', html: dropped, retire: true });
		expect(yes.status).toBe('done');
		expect(yes.retired).toBeTruthy();
		expect((await w.db.sql(`select block_id from public.classroom_html_retired_blocks where item_id = $1`, [item])).rows.map((r) => r.block_id)).toEqual(['smoke-writing-line']);
		expect((await w.db.sql(`select count(*)::int n from public.classroom_responses where item_id = $1 and block_id = 'smoke-writing-line'`, [item])).rows[0].n).toBe(1);
	});
});
