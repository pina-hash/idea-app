// tests/db/connector-grading-queue.test.ts
//
// GRADING CATCH-UP FROM A CHAT (ledger 0457, items 11 to 14), end to end
// through the real tools on the local backend over the whole chain. Judged by
// rows read back, never by a tool's own words.
//
//   - item 12: a post title plus a class picks that class's copy of a title
//     shared by separate posts, and a block number picks that block;
//   - item 13: read grades with no post is ONE call over every class, and a
//     class left out is absent (its student, its post) while the other is
//     present;
//   - item 14: an HTML worksheet reads "answered X of Y" and "saved after
//     due", never "not turned in";
//   - item 11: a bulk grade through the connector keeps a grade someone else
//     gave in a protected class and fills an empty one.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { connectorWorld, type ConnectorWorld } from './connector-fixture';
import { createUser } from './harness';
import { runTool } from '../../src/lib/server/connector/tools';
import { stageHtmlDocument } from '../../src/lib/classroom/html-assignment/store';
import { manifestBlocks } from '../../src/lib/classroom/html-assignment/manifest';

let w: ConnectorWorld;
const HTML = readFileSync(fileURLToPath(new URL('../fixtures/hx-smoke-test.html', import.meta.url)), 'utf8');
const run = async (name: string, args: Record<string, unknown>) => runTool(await w.ctx(w.admin), name, args);
const idOf = async (title: string, section: string) =>
	(
		await w.db.sql<{ id: string }>(
			`select i.id from public.classroom_items i join public.classroom_postings p on p.item_id = i.id where i.title = $1 and p.section_id = $2`,
			[title, section]
		)
	).rows[0].id;
let worksheet: string;
let blocks: string[];

beforeAll(async () => {
	w = await connectorWorld();
	const past = new Date(Date.now() - 2 * 86400000).toISOString();
	// TWO SEPARATE POSTS WITH ONE TITLE, one per class (the Shop Fix: Design case).
	for (const cls of ['209H Block 2', '209H Block 4']) {
		expect((await run('create_post', { classes: [cls], kind: 'assignment', title: 'Shop Fix: Design', points: 10 })).status).toBe('done');
	}
	for (const section of [w.block2, w.block4]) {
		await w.db.sql(`update public.classroom_items set due_at = $1 where id = $2`, [past, await idOf('Shop Fix: Design', section)]);
	}
	// AN HTML WORKSHEET in both classes, past due.
	expect((await run('create_post', { classes: ['209H Block 2', '209H Block 4'], kind: 'assignment', title: 'Hook 03', points: 20 })).status).toBe('done');
	worksheet = await idOf('Hook 03', w.block2);
	expect((await run('replace_html_assignment', { post: 'Hook 03', html: HTML, filename: 'hook-03.html' })).status).toBe('done');
	await w.db.sql(`update public.classroom_items set due_at = $1 where id = $2`, [past, worksheet]);
	const staged = stageHtmlDocument('hook-03.html', HTML).staged!;
	// The questions the worksheet counts: its modules' blocks, not the header's
	// name field, which the progress rail does not count either.
	const header = new Set((staged.manifest.header ?? []).map((b) => b.id));
	blocks = manifestBlocks(staged.manifest).filter((b) => !header.has(b.id) && !b.optional).map((b) => b.id);
	// Mateo answered one question on time and one after the due date; Leo
	// (Block 4) answered one. Daniel R answered nothing. Stored in the shape a
	// worksheet saves ({text}), the shape `classroom_save_response` writes.
	await w.db.sql(
		`insert into public.classroom_responses (item_id, student_email, block_id, value, updated_at) values
		 ($1, $2, $4, '{"text":"on time"}'::jsonb, now() - interval '3 days'),
		 ($1, $2, $5, '{"text":"late"}'::jsonb, now()),
		 ($1, $3, $4, '{"text":"leo"}'::jsonb, now() - interval '3 days')`,
		[worksheet, w.students.mateo, w.students.leo, blocks[0], blocks[1]]
	);
}, 240_000);
afterAll(async () => w?.stop());

describe('item 12: the class he names picks the class and its post', () => {
	it('a shared title resolves to the copy in the class named', async () => {
		const b4 = await idOf('Shop Fix: Design', w.block4);
		const b2 = await idOf('Shop Fix: Design', w.block2);
		const out = await run('get_post', { post: 'Shop Fix: Design', class: '209H Block 4' });
		expect(out.id).toBe(b4);
		const two = await run('get_post', { post: 'Shop Fix: Design', class: 'IDEA209H Block 2' });
		expect(two.id).toBe(b2);
		// Control: with no class, both copies are offered and nothing is guessed.
		const both = await run('get_post', { post: 'Shop Fix: Design' });
		expect(both.status).toBe('ambiguous');
	});
});

type Queue = { status: string; classes: Array<{ class: string; assignments: Array<{ post: string; students: Array<{ student: string; answers_saved?: number; saved_after_due?: boolean }> }> }>; left_out: string[] };

describe('item 13: one needs-grading call', () => {
	it('every class at once; the class left out is absent and the other present', async () => {
		const all = (await run('read_grades', {})) as unknown as Queue;
		expect(all.status).toBe('ok');
		const flat = (q: Queue) => q.classes.flatMap((c) => c.assignments.flatMap((a) => a.students.map((s) => `${c.class}|${a.post}|${s.student}`))).sort();
		expect(flat(all)).toEqual(['IDEA209H · Block 2|Hook 03|Mateo Reyes', 'IDEA209H · Block 4|Hook 03|Leo Lee']);
		const mateo = all.classes[0].assignments[0].students[0];
		expect(mateo).toMatchObject({ answers_saved: 2, saved_after_due: true });

		const without = (await run('read_grades', { except: ['209H Block 4'] })) as unknown as Queue;
		expect(flat(without)).toEqual(['IDEA209H · Block 2|Hook 03|Mateo Reyes']);
		expect(JSON.stringify(without.classes)).not.toContain('Leo');
		expect(without.left_out).toEqual(['IDEA209H · Block 4']);
	});
});

describe('item 14: an HTML worksheet reads answered X of Y, never not turned in', () => {
	it('read grades and the grading packet say answered and saved after due', async () => {
		const g = (await run('read_grades', { post: 'Hook 03', class: '209H Block 2' })) as Record<string, unknown>;
		expect(g).not.toHaveProperty('not_turned_in');
		const students = g.students as Array<Record<string, unknown>>;
		const m = students.find((s) => s.student === 'Mateo Reyes')!;
		expect(m).toMatchObject({ answered: 2, saved_after_due: 1 });
		expect(m.questions).toBe(blocks.length);
		expect(m).not.toHaveProperty('turned_in');
		expect(String(m.standing)).toBe(`Answered 2 of ${blocks.length}, saved after due`);
		expect(g.nothing_answered).toEqual(['Daniel Ruiz']);
		const packet = (await run('grading_packet', { post: 'Hook 03', class: '209H Block 2' })) as Record<string, unknown>;
		const pm = (packet.students as Array<Record<string, unknown>>).find((s) => s.student === 'Mateo Reyes')!;
		expect(pm).toMatchObject({ answered: 2, saved_after_due: 1 });
		expect(pm).not.toHaveProperty('turned_in');
	});
});

describe('item 11: a protected class keeps a grade someone else gave', () => {
	it('a connector bulk grade fills the empty grade and keeps the other one', async () => {
		const other = await createUser(w.db, 'colleague2@boscotech.edu', 'Other Teacher');
		const b4 = await idOf('Shop Fix: Design', w.block4);
		// Somebody else's grade for Leo, written as the owner of the class row would.
		await w.db.sql(
			`insert into public.classroom_submissions (item_id, student_email, score, direct_score, graded_by, graded_at, state, returned_at)
			 values ($1, $2, 6, 6, $3, now(), 'returned', now())`,
			[b4, w.students.leo, other.email]
		);
		await w.db.sql(`update public.classroom_sections set grades_fill_empty_only = true where id = $1`, [w.block4]);
		const out = await run('grade', { post: 'Shop Fix: Design', class: '209H Block 4', grades: [{ student: 'Leo', score: 10 }, { student: 'Daniel V', score: 8 }], request_id: 'protect-1' });
		const rows = (
			await w.db.sql<{ student_email: string; score: string }>(`select student_email, score::text from public.classroom_submissions where item_id = $1 order by 1`, [b4])
		).rows;
		expect(rows).toEqual([
			{ student_email: w.students.danielV, score: '8' },
			{ student_email: w.students.leo, score: '6' }
		]);
		expect(JSON.stringify(out)).toContain('only fills empty grades');
	});
});

describe('item 15: some students\' own due dates and the absent mark, in bulk, from his words', () => {
	it('moves one student by school days, marks another absent, and undo puts both back', async () => {
		const own = async () =>
			(
				await w.db.sql<{ student_email: string; absent: boolean; days_out: number | null }>(
					`select student_email, absent, days_out from public.classroom_student_due where item_id = $1 order by 1`,
					[worksheet]
				)
			).rows;
		const out = await run('set_due', {
			post: 'Hook 03',
			class: '209H Block 2',
			students: [{ student: 'Mateo', daysOut: 2 }, { student: 'Daniel R', absent: true }],
			request_id: 'due-1'
		});
		expect(out.status, JSON.stringify(out)).toBe('done');
		expect(await own()).toEqual([
			{ student_email: w.students.danielR, absent: true, days_out: null },
			{ student_email: w.students.mateo, absent: false, days_out: 2 }
		]);
		// The post's own due date did not move.
		const post = (await w.db.sql<{ due_at: string }>(`select due_at::text from public.classroom_items where id = $1`, [worksheet])).rows[0];
		expect(post.due_at).not.toBeNull();
		expect((await run('undo_last', {})).status).toBe('done');
		expect(await own()).toEqual([]);
	});

	it('a student in a class he does not teach is not found and nothing is written', async () => {
		const out = await run('set_due', { post: 'Hook 03', students: [{ student: 'Ana Reyes', absent: true }] });
		expect(out.status).toBe('not_found');
		expect((await w.db.sql(`select 1 from public.classroom_student_due where item_id = $1`, [worksheet])).rows).toHaveLength(0);
	});
});

describe('item 16: the grading packet carries the on-time version of a late answer', () => {
	it('an answer edited after the due date shows what was saved on time', async () => {
		await w.db.sql(
			`update public.classroom_responses set value = '{"text":"late rewrite"}'::jsonb, updated_at = now()
			 where item_id = $1 and student_email = $2 and block_id = $3`,
			[worksheet, w.students.leo, blocks[0]]
		);
		const packet = (await run('grading_packet', { post: 'Hook 03', class: '209H Block 4' })) as Record<string, unknown>;
		const leo = (packet.students as Array<Record<string, unknown>>).find((s) => s.student === 'Leo Lee')!;
		expect((leo.on_time_versions as Array<{ on_time_answer: unknown }>).map((v) => v.on_time_answer)).toEqual([{ text: 'leo' }]);
		expect((packet.grading as Record<string, unknown>).late_rate).toBe(0.5);
	});
});

