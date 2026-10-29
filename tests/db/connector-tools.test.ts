// tests/db/connector-tools.test.ts
//
// THE FIRST-SLICE TOOLS, END TO END, on the local backend over the real
// migration chain: every call acts as a seeded user through `request.jwt.claims`
// and `SET ROLE authenticated`, and every judge is a row read back as the
// connection owner, never the tool's own answer.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { connectorWorld, type ConnectorWorld } from './connector-fixture';
import { runTool } from '../../src/lib/server/connector/tools';

let w: ConnectorWorld;
const HTML = readFileSync(fileURLToPath(new URL('../fixtures/hx-smoke-test.html', import.meta.url)), 'utf8');

beforeAll(async () => {
	w = await connectorWorld();
}, 180_000);

afterAll(async () => {
	await w?.stop();
});

async function run(name: string, args: Record<string, unknown>, as = () => w.admin) {
	return runTool(await w.ctx(as()), name, args);
}

async function coinRows(email: string) {
	return (await w.db.sql<{ amount: string; category_id: string; note: string | null; actor_email: string; id: string }>(
		`select id, amount, category_id, note, actor_email from public.coin_transactions where student_email = $1 order by created_at`,
		[email]
	)).rows;
}

describe('names to records', () => {
	it('lists only the classes the admin teaches', async () => {
		const out = await run('list_classes', {});
		const names = (out.classes as Array<{ class: string }>).map((c) => c.class).sort();
		expect(names).toEqual(['IDEA209H · Block 2', 'IDEA209H · Block 4']);
	});

	it('an ambiguous first name returns both candidates with their class, and a last initial picks one', async () => {
		const both = await run('find_student', { name: 'Daniel' });
		expect(both.status).toBe('ambiguous');
		expect((both.candidates as Array<{ email: string }>).map((c) => c.email).sort()).toEqual([w.students.danielR, w.students.danielV].sort());
		const one = await run('find_student', { name: 'Daniel R' });
		expect(one).toMatchObject({ status: 'found', email: w.students.danielR });
		const scoped = await run('find_student', { name: 'Daniel', class: 'Block 4' });
		expect(scoped).toMatchObject({ status: 'found', email: w.students.danielV });
	});

	it('a student in a class the admin does not teach is not found', async () => {
		const out = await run('find_student', { name: 'Ana Reyes' });
		expect(out.status).toBe('not_found');
	});
});

describe('coins', () => {
	it('an award with no category writes nothing and offers the categories', async () => {
		const out = await run('award_coins', { students: ['Mateo'], amount: 5, reason: 'helping clean the shop' });
		expect(out.status).toBe('needs_category');
		expect(await coinRows(w.students.mateo)).toHaveLength(0);
	});

	it('an ambiguous name writes nothing for anybody', async () => {
		const out = await run('fine_coins', { students: ['Daniel', 'Mateo'], kind: 'Disruptive', reason: 'phone out' });
		expect(out.status).toBe('ambiguous');
		expect(await coinRows(w.students.mateo)).toHaveLength(0);
	});

	it('a flat fine at the wrong amount is refused in words; at the set amount it lands as the admin, with the reason', async () => {
		const wrong = await run('fine_coins', { students: ['Daniel R'], kind: 'Off-Task', amount: 3, reason: 'phone out' });
		expect(wrong.status).toBe('invalid');
		expect(await coinRows(w.students.danielR)).toHaveLength(0);
		const out = await run('fine_coins', { students: ['Daniel R'], kind: 'Off-Task', reason: 'phone out', request_id: 'fine-1' });
		expect(out.status).toBe('done');
		const rows = await coinRows(w.students.danielR);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ category_id: 'off_task_device_use', note: 'phone out', actor_email: w.admin.email });
		expect(Number(rows[0].amount)).toBe(-2);
		const audit = await w.db.sql(`select tool, function_name, via, status from public.connector_audit where tool = 'fine_coins'`);
		expect(audit.rows).toEqual([{ tool: 'fine_coins', function_name: 'coin_log_transaction', via: 'claude', status: 'done' }]);
	});

	it('undo_last reverses that fine with the Coin Desk reversal, and the balance is back to zero', async () => {
		const out = await run('undo_last', {});
		expect(out.status).toBe('done');
		const rows = await coinRows(w.students.danielR);
		expect(rows.map((r) => r.category_id)).toEqual(['off_task_device_use', 'reversal']);
		const bal = await run('coin_balance', { student: 'Daniel R' });
		expect(bal.balance).toBe(0);
		const again = await run('undo_last', {});
		expect(again.status).toBe('none');
	});

	it('a whole-class award writes one row per enrolled student and none for anyone else', async () => {
		const out = await run('award_coins', { class: '209H Block 2', kind: 'Correct Answer in Class', reason: 'clean benches' });
		expect(out.status).toBe('done');
		const mateo = await coinRows(w.students.mateo);
		expect(mateo.map((r) => r.category_id)).toEqual(['correct_answer_in_class']);
		expect((await coinRows(w.students.leo)).length).toBe(0);
		expect((await coinRows('ana.reyes@boscotech.net')).length).toBe(0);
	});
});

describe('posts', () => {
	// Wednesday 2026-10-14, 10:00 in Los Angeles.
	const wednesday = () => Date.parse('2026-10-14T17:00:00Z');

	it('creates an assignment due Friday at 11:59 PM school time, then changes its points and visibility', async () => {
		const out = await runTool(await w.ctx(w.admin, wednesday), 'create_post', {
			classes: ['209H Block 2'],
			kind: 'assignment',
			title: 'Tolerance Check',
			points: 20,
			due: 'Friday at 11:59'
		});
		expect(out.status).toBe('done');
		const item = (await w.db.sql<{ id: string; points: number; due_at: Date; published: boolean }>(
			`select id, points, due_at, published from public.classroom_items where title = 'Tolerance Check'`
		)).rows;
		expect(item).toHaveLength(1);
		expect(item[0].points).toBe(20);
		expect(item[0].due_at.toISOString()).toBe('2026-10-17T06:59:00.000Z');

		await run('set_points', { post: 'Tolerance Check', points: 25 });
		await run('set_published', { post: 'Tolerance Check', published: false });
		const after = (await w.db.sql<{ points: number; published: boolean }>(`select points, published from public.classroom_items where id = $1`, [item[0].id])).rows[0];
		expect(after).toEqual({ points: 25, published: false });
		const revisions = await w.db.sql(`select 1 from public.classroom_content_revisions where item_id = $1`, [item[0].id]);
		expect(revisions.rows.length).toBe(1);

		// Undo is newest first: the unpublish is reversed, the points stay.
		await run('undo_last', {});
		const undone = (await w.db.sql<{ points: number; published: boolean }>(`select points, published from public.classroom_items where id = $1`, [item[0].id])).rows[0];
		expect(undone).toEqual({ points: 25, published: true });
	});

	it('a rubric lands as criteria with their points', async () => {
		const out = await run('set_rubric', { post: 'Tolerance Check', criteria: [{ name: 'Accuracy', points: 10 }, { name: 'Drawing', points: 10 }, { name: 'Reflection', points: 5 }] });
		if (out.status !== 'done') throw new Error(JSON.stringify(out));
		expect(out.status).toBe('done');
		const r = (await w.db.sql<{ criteria: Array<{ criterion: string; points: number }> }>(
			`select criteria from public.classroom_rubrics r join public.classroom_items i on i.id = r.item_id where i.title = 'Tolerance Check'`
		)).rows[0];
		expect(r.criteria.map((c) => [c.criterion, c.points])).toEqual([['Accuracy', 10], ['Drawing', 10], ['Reflection', 5]]);
	});

	it('posts a notice to every 209H section until the end of the school day', async () => {
		const out = await run('create_post', { classes: ['all 209H'], kind: 'notice', body: 'Bring safety glasses tomorrow.' });
		expect(out.status).toBe('done');
		const rows = await w.db.sql(`select s.section_id from public.classroom_quick_post_sections s join public.classroom_quick_posts p on p.id = s.post_id where p.body = 'Bring safety glasses tomorrow.'`);
		expect(rows.rows.map((r) => r.section_id).sort()).toEqual([w.block2, w.block4].sort());
	});

	it('grades a student, and read_grades names who has not turned it in', async () => {
		const out = await run('grade', { post: 'Tolerance Check', student: 'Mateo', score: 18, comment: 'fix the fillet callout' });
		expect(out.status).toBe('done');
		const sub = (await w.db.sql<{ direct_score: string; teacher_comment: string; returned_at: Date | null }>(
			`select s.direct_score, s.teacher_comment, s.returned_at from public.classroom_submissions s join public.classroom_items i on i.id = s.item_id where i.title = 'Tolerance Check' and s.student_email = $1`,
			[w.students.mateo]
		)).rows[0];
		expect(Number(sub.direct_score)).toBe(18);
		expect(sub.teacher_comment).toBe('fix the fillet callout');
		expect(sub.returned_at).not.toBeNull();
		const grades = await run('read_grades', { post: 'Tolerance Check' });
		expect((grades.not_turned_in as string[]).sort()).toEqual(['Daniel Ruiz', 'Mateo Reyes']);
	});
});

describe('replace_html_assignment', () => {
	it('stores a first document, refuses one that drops an answered block naming it, and accepts one that keeps it', async () => {
		await run('create_post', { classes: ['209H Block 2', '209H Block 4'], kind: 'assignment', title: 'Shop Fix', points: 10 });
		const first = await run('replace_html_assignment', { post: 'Shop Fix', html: HTML, filename: 'shop-fix.html' });
		expect(first.status).toBe('done');
		const itemId = (await w.db.sql<{ id: string }>(`select id from public.classroom_items where title = 'Shop Fix'`)).rows[0].id;
		await w.db.sql(
			`insert into public.classroom_responses (item_id, student_email, block_id, value) values ($1, $2, 'smoke-writing-line', '"a fillet"'::jsonb)`,
			[itemId, w.students.leo]
		);
		const renamed = HTML.replace('"smoke-writing-line"', '"smoke-writing-line-2"');
		const before = (await w.db.sql(`select count(*)::int as n from public.classroom_content_revisions where item_id = $1`, [itemId])).rows[0].n;
		// LEDGER 0458: a replace names the live copy it was made from.
		const read = await run('get_post', { post: 'Shop Fix' });
		const live = read.document as { sha256: string; saved: string; version: number; bytes: number; html?: string };
		expect(live.version).toBe(1);
		expect(live.html).toBeUndefined();
		const basis = live.sha256;
		const unsaid = await run('replace_html_assignment', { post: 'Shop Fix', html: renamed });
		expect(unsaid).toMatchObject({ status: 'invalid', reason: 'needs_basis' });
		const stale = await run('replace_html_assignment', { post: 'Shop Fix', html: renamed, basis: '0'.repeat(64) });
		expect(stale).toMatchObject({ status: 'refused', reason: 'changed_since' });
		expect((await w.db.sql(`select count(*)::int as n from public.classroom_content_revisions where item_id = $1`, [itemId])).rows[0].n).toBe(before);
		const refused = await run('replace_html_assignment', { post: 'Shop Fix', html: renamed, basis });
		expect(refused.status).toBe('refused');
		expect(refused.missing_blocks).toEqual([{ block: 'smoke-writing-line', students_with_answers: 1 }]);
		expect((await w.db.sql(`select count(*)::int as n from public.classroom_content_revisions where item_id = $1`, [itemId])).rows[0].n).toBe(before);

		const kept = HTML.replace('"smoke-writing-reflection", "field"', '"smoke-writing-reflection", "prompt": "Two sentences.", "field"');
		const preview = await run('replace_html_assignment', { post: 'Shop Fix', html: kept, dry_run: true, basis });
		expect(preview.status).toBe('preview');
		expect((preview.diff as { removed: string[] }).removed).toEqual([]);
		const ok = await run('replace_html_assignment', { post: 'Shop Fix', html: kept, basis });
		expect(ok.status).toBe('done');
		// WHAT WAS STORED, AND WHERE THE EARLIER COPY WENT (0a569932, 84cf8690).
		const stored = ok.stored as { sha256: string; matches_what_was_sent: boolean; version: number; earlier_kept_as_version: number };
		expect(stored.matches_what_was_sent).toBe(true);
		expect(stored.version).toBe(2);
		expect(stored.earlier_kept_as_version).toBe(1);
		// The old copy now fails, the new one is live, and version 1 reads back the first document.
		expect((await run('replace_html_assignment', { post: 'Shop Fix', html: kept, basis })).reason).toBe('changed_since');
		const again = await run('get_post', { post: 'Shop Fix', version: 1 });
		const doc = again.document as { sha256: string; version: number; html: string; earlier_versions: Array<{ version: number; sha256: string }> };
		expect(doc.sha256).toBe(stored.sha256);
		expect(doc.version).toBe(2);
		expect(doc.html).toBe(HTML);
		expect(doc.earlier_versions.map((v) => v.version)).toEqual([1]);
		expect(doc.earlier_versions[0].sha256).toBe(basis);
		const whole = await run('get_post', { post: 'Shop Fix', document: true });
		expect((whole.document as { html: string }).html).toBe(kept);
		// A draft reads back too.
		await w.db.sql(`update public.classroom_items set published = false where id = $1`, [itemId]);
		expect(((await run('get_post', { post: 'Shop Fix', document: true })).document as { html: string }).html).toBe(kept);
		await w.db.sql(`update public.classroom_items set published = true where id = $1`, [itemId]);
	});
});

describe('the confirm level and the connection', () => {
	it('connector_disconnect previews first, and only the confirm token disconnects', async () => {
		const ctx = await w.ctx(w.admin);
		const tokenId = (await w.db.sql<{ id: string }>(
			`insert into public.connector_tokens (user_id, email, client_id, access_hash, refresh_hash, access_expires_at, refresh_expires_at)
			 values ($1, $2, 'test', repeat('a', 64), repeat('b', 64), now() + interval '1 hour', now() + interval '30 days') returning id`,
			[w.admin.id, w.admin.email]
		)).rows[0].id;
		ctx.token = { id: tokenId, userId: w.admin.id, email: w.admin.email, clientId: 'test', label: 'Claude', scope: 'site', accessExpiresAt: 0, refreshExpiresAt: 0, revokedAt: null, lastUsedAt: null };
		const first = await runTool(ctx, 'connector_disconnect', {});
		expect(first.status).toBe('preview');
		const revokedNow = async () => (await w.db.sql(`select revoked_at from public.connector_tokens where id = $1`, [tokenId])).rows[0].revoked_at;
		expect(await revokedNow()).toBeNull();
		const wrong = await runTool(ctx, 'connector_disconnect', { confirm_token: 'not-the-token' });
		expect(wrong.status).toBe('needs_confirmation');
		expect(await revokedNow()).toBeNull();
		const yes = await runTool(ctx, 'connector_disconnect', { confirm_token: first.confirm_token });
		expect(yes.status).toBe('done');
		expect(await revokedNow()).not.toBeNull();
		const reused = await runTool(ctx, 'connector_disconnect', { confirm_token: first.confirm_token });
		expect(reused.status).toBe('needs_confirmation');
	});

	it('a non-admin teacher reaches nothing through the connector', async () => {
		const out = await run('fine_coins', { students: ['Ana'], kind: 'Disruptive' }, () => w.teacher);
		// The teacher teaches no class through the admin's eyes: the roster read
		// as them finds their own student, and the write is refused by the
		// connector for not being a site admin.
		expect(['refused', 'not_found', 'partial']).toContain(out.status);
		expect((await coinRows('ana.reyes@boscotech.net')).length).toBe(0);
	});
});
