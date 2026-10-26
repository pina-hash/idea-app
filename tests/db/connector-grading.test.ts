// tests/db/connector-grading.test.ts
//
// FULL GRADING FROM A CHAT (ledger 0438, feedback 6db4fbe5, gap 8fd1c0bb), end
// to end through the real tools on the local backend over the whole chain.
//
// The silent half is WHO A PACKET CARRIES. An assignment posted to two classes
// hands an admin every row of both, so a packet asked for one class must hold
// that class's students and nobody else: asserted both ways, with the other
// class's student planted with answers, a file and a grade of their own. The
// grades themselves are judged by the rows read back, never the tool's answer.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectorWorld, type ConnectorWorld } from './connector-fixture';
import { runTool } from '../../src/lib/server/connector/tools';

let w: ConnectorWorld;
let item: string;
const run = async (name: string, args: Record<string, unknown>) => runTool(await w.ctx(w.admin), name, args);

type Packet = {
	status: string;
	students: Array<{
		email: string;
		answers: Array<{ question: number | null; answer: unknown }>;
		files: Array<{ filename: string; picture: boolean; link?: string; note?: string }>;
		notes: Array<{ messages: Array<{ text: string }> }>;
		graded: boolean;
	}>;
	assignment: { rubric: Array<{ id: string; criterion: string }> | null };
};

beforeAll(async () => {
	w = await connectorWorld();
	await run('create_post', { classes: ['209H Block 2', '209H Block 4'], kind: 'assignment', title: 'Packet Check', points: 20 });
	item = (await w.db.sql<{ id: string }>(`select id from public.classroom_items where title = 'Packet Check'`)).rows[0].id;
	expect((await run('set_rubric', { post: 'Packet Check', criteria: [{ name: 'Accuracy', points: 10 }, { name: 'Drawing', points: 10 }] })).status).toBe('done');
	await w.db.sql(
		`insert into public.classroom_responses (item_id, student_email, block_id, value) values
		 ($1, $2, 'q1', '"mateo answer"'::jsonb), ($1, $3, 'q1', '"leo answer"'::jsonb)`,
		[item, w.students.mateo, w.students.leo]
	);
	for (const [email, name] of [[w.students.mateo, 'sketch.png'], [w.students.leo, 'leo-part.sldprt']]) {
		const sub = (
			await w.db.sql<{ id: string }>(
				`insert into public.classroom_submissions (item_id, student_email, state, submitted_at) values ($1, $2, 'submitted', now()) returning id`,
				[item, email]
			)
		).rows[0].id;
		await w.db.sql(
			`insert into public.classroom_submission_files (submission_id, block_id, filename, mime_type, storage_key, size_bytes)
			 values ($1::uuid, 'q1', $2, 'application/octet-stream', $1::text || '/' || gen_random_uuid()::text || '.png', 10)`,
			[sub, name]
		);
	}
	expect((await run('send_feedback', { post: 'Packet Check', student: 'Mateo', message: 'Label the datum.' })).status).toBe('done');
}, 240_000);
afterAll(async () => w?.stop());

describe('the grading packet', () => {
	it('one class: its own students only; the other class\'s student, answers and file appear nowhere', async () => {
		const p = (await run('grading_packet', { post: 'Packet Check', class: '209H Block 2' })) as unknown as Packet;
		expect(p.status).toBe('ok');
		expect(p.students.map((s) => s.email).sort()).toEqual([w.students.danielR, w.students.mateo].sort());
		const text = JSON.stringify(p);
		expect(text).not.toContain(w.students.leo);
		expect(text).not.toContain('leo answer');
		expect(text).not.toContain('leo-part');
		// The present half: Mateo's answer, his file, his note and the rubric.
		const mateo = p.students.find((s) => s.email === w.students.mateo)!;
		expect(mateo.answers.map((a) => a.answer)).toEqual(['mateo answer']);
		expect(mateo.files.map((f) => [f.filename, f.picture])).toEqual([['sketch.png', true]]);
		// The local backend has no storage, so the link says why rather than lying.
		expect(mateo.files[0].link ?? mateo.files[0].note).toBeTruthy();
		expect(mateo.notes.flatMap((n) => n.messages.map((m) => m.text))).toEqual(['Label the datum.']);
		expect(p.assignment.rubric?.map((c) => c.criterion)).toEqual(['Accuracy', 'Drawing']);
	});

	it('every class: all four students, Leo with his own file', async () => {
		const p = (await run('grading_packet', { post: 'Packet Check' })) as unknown as Packet;
		expect(p.students).toHaveLength(4);
		expect(p.students.find((s) => s.email === w.students.leo)?.files.map((f) => f.filename)).toEqual(['leo-part.sldprt']);
	});

	it('read_answers carries file answers beside the text (gap 8fd1c0bb)', async () => {
		const one = (await run('read_answers', { post: 'Packet Check', student: 'Mateo' })) as unknown as { files: Array<{ filename: string }> };
		expect(one.files.map((f) => f.filename)).toEqual(['sketch.png']);
	});
});

describe('grading a class in one call, held, then returned', () => {
	const state = async () =>
		(
			await w.db.sql<{ student_email: string; score: string | null; graded: boolean; returned: boolean }>(
				`select student_email, score::text, graded_at is not null as graded, returned_at is not null as returned
				 from public.classroom_submissions where item_id = $1 order by student_email`,
				[item]
			)
		).rows;

	it('grades two students held and returns them in one call', async () => {
		const out = await run('grade', {
			post: 'Packet Check',
			grades: [
				{ student: 'Mateo', scores: { Accuracy: 8, Drawing: 9 }, notes: { Accuracy: 'One dimension off.', Drawing: 'Missing a centerline.' }, comment: 'Clean drawing.' },
				{ student: 'Daniel R', score: 15 }
			],
			request_id: 'batch-1'
		});
		expect(out.status, JSON.stringify(out)).toBe('done');
		let rows = await state();
		const by = (e: string) => rows.find((r) => r.student_email === e);
		expect(by(w.students.mateo)).toMatchObject({ graded: true, returned: false });
		expect(Number(by(w.students.mateo)?.score)).toBe(17);
		expect(by(w.students.danielR)).toMatchObject({ graded: true, returned: false });
		// Leo was not named, so his row is untouched.
		expect(by(w.students.leo)).toMatchObject({ graded: false });

		const back = await run('grade', { post: 'Packet Check', returnHeld: true, request_id: 'return-1' });
		expect(back.status, JSON.stringify(back)).toBe('done');
		rows = await state();
		expect(by(w.students.mateo)?.returned ?? rows.find((r) => r.student_email === w.students.mateo)?.returned).toBe(true);
		expect(rows.find((r) => r.student_email === w.students.danielR)?.returned).toBe(true);
		expect(Number(rows.find((r) => r.student_email === w.students.mateo)?.score)).toBe(17);
		expect(rows.find((r) => r.student_email === w.students.leo)?.returned).toBe(false);
	});

	it('undo_last takes a whole batch back', async () => {
		const out = await run('grade', { post: 'Packet Check', grades: [{ student: 'Daniel R', score: 12 }, { student: 'Mateo', scores: { Accuracy: 10, Drawing: 10 } }], request_id: 'batch-2' });
		expect(out.status, JSON.stringify(out)).toBe('done');
		expect((await run('undo_last', {})).status).toBe('done');
		const rows = await state();
		expect(Number(rows.find((r) => r.student_email === w.students.danielR)?.score)).toBe(15);
		expect(Number(rows.find((r) => r.student_email === w.students.mateo)?.score)).toBe(17);
	});

	it('a criterion that is not on the rubric is refused and writes nothing', async () => {
		const before = JSON.stringify(await state());
		const out = await run('grade', { post: 'Packet Check', grades: [{ student: 'Daniel R', scores: { Neatness: 5 } }] });
		expect(JSON.stringify(out)).toContain('not a criterion');
		expect(JSON.stringify(await state())).toBe(before);
	});
});
