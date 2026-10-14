// tests/db/progressive-feedback-0238.test.ts
//
// 0238, on the whole tree with the file applied. Every claim here would fail
// SILENTLY in use, which is why it is a database test:
//
// PART A, progressive feedback:
//   - a student reading another student's thread, or any thread on a class
//     they are not in (asserted as an ABSENCE, beside a positive control);
//   - somebody who does not manage the student posting, answering, resolving
//     or removing ("not found", identically, never a different refusal);
//   - a drawing that is not the closed shape, or a drawing on a file that is
//     not this student's hand-in on this item;
//   - a removed message or thread still reaching a reader;
//   - "seen" moving updated_at (which would make reading look like news);
//   - a client reaching either table directly.
// PART B: a finish is judged against the manifest the worksheet had then, and a
//   manager can stamp it; a stranger cannot read past manifests or stamp.
// PART C: the heartbeat answers when the caller's feedback last moved, and its
//   0200 behaviour is unchanged.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createClassroomSection, createUser, enrollStudent, startTestDb, type SeededUser, type TestDb } from './harness';
import { scanFile } from '../../tools/apply-migration.mjs';
import { WITH_0238, SQL_0238, part0238 } from './chain-0238';

type Json = Record<string, unknown>;
type Thread = Json & { id: string; messages: Array<Json & { body: string; role: string; mine: boolean }> };

let db: TestDb;
let admin: SeededUser;
let teacher: SeededUser;
let otherTeacher: SeededUser;
let ana: SeededUser;
let ben: SeededUser;
let outsider: SeededUser;
let section: string;
let otherSection: string;
let item: string;
let anaFile: string;
let benFile: string;

const rpc = async <T = Json>(user: SeededUser, call: string, params: unknown[] = []): Promise<T> =>
	db.asUser(user.id, async (q) => (await q<{ r: T }>(`select ${call} as r`, params)).rows[0].r);

const manifest = {
	schemaVersion: 3,
	kind: 'html-assignment',
	title: 'Bench setup',
	course: 'IDEA100',
	points: 2,
	header: [{ id: 'who', field: 'studentName', type: 'text' }],
	modules: [
		{
			id: 'p1',
			title: 'Bench',
			points: 2,
			blocks: [
				{ id: 'hx-text', field: 'f1', type: 'text' },
				{ id: 'hx-photo', field: 'photo', type: 'image' }
			],
			criteria: [
				{
					id: 'p1-c',
					text: 'Recorded',
					points: 2,
					levels: [
						{ points: 2, label: 'Complete', short: 'Recorded', descriptor: 'Recorded.' },
						{ points: 1, label: 'Developing', short: 'Partial', descriptor: 'Partial.' },
						{ points: 0, label: 'Absent', short: 'None', descriptor: 'Not attempted.' }
					]
				}
			]
		}
	]
};
const doc = (m: unknown) =>
	`<!doctype html><html><head><title>Bench</title></head><body><input data-field="studentName"><input data-field="f1"><script type="application/json" id="idea-manifest">${JSON.stringify(m)}</script></body></html>`;

const PEN = { v: 1, shapes: [{ t: 'pen', c: 'red', w: 2, p: [100, 100, 2000, 2400, 5000, 5000] }] };

async function fileFor(email: string): Promise<string> {
	const { rows } = await db.sql<{ id: string }>(
		`with s as (
			insert into public.classroom_submissions (item_id, student_email) values ($1::uuid, $2)
			on conflict (item_id, student_email) do update set updated_at = now() returning id
		)
		insert into public.classroom_submission_files (submission_id, block_id, drive_file_id, filename, mime_type)
		select s.id, 'hx-photo', 'drive-' || md5($2), 'bench.jpg', 'image/jpeg' from s returning id`,
		[item, email]
	);
	return rows[0].id;
}

beforeAll(async () => {
	db = await startTestDb(WITH_0238);
	admin = await createUser(db, 'apina@boscotech.edu', 'Mr Pina');
	teacher = await createUser(db, 'teacher@boscotech.edu', 'Tee Cher');
	otherTeacher = await createUser(db, 'other@boscotech.edu', 'Oth Er');
	ana = await createUser(db, 'ana@boscotech.net', 'Ana Reyes');
	ben = await createUser(db, 'ben@boscotech.net', 'Ben Ortiz');
	outsider = await createUser(db, 'out@boscotech.net', 'Out Sider');
	await db.sql(`insert into public.app_admins (email, granted_by) values ($1, $1) on conflict do nothing`, [teacher.email]);
	section = await createClassroomSection(db, { as: teacher, courseCode: 'IDEA100', courseTitle: 'Engineering I', label: 'Block 1', teacherEmail: teacher.email });
	otherSection = await createClassroomSection(db, { as: teacher, courseCode: 'IDEA209H', courseTitle: 'Engineering II', label: 'Block 4', teacherEmail: otherTeacher.email });
	await enrollStudent(db, { as: teacher, sectionId: section, email: ana.email, displayName: 'Ana Reyes' });
	await enrollStudent(db, { as: teacher, sectionId: section, email: ben.email, displayName: 'Ben Ortiz' });
	await enrollStudent(db, { as: teacher, sectionId: otherSection, email: outsider.email, displayName: 'Out Sider' });
	item = (
		await rpc<{ item_id: string }>(
			teacher,
			`public.classroom_create_item(p_kind => 'assignment', p_section_ids => $1::uuid[], p_title => 'Bench', p_body => 'b', p_points => 2, p_published => true)`,
			[[section]]
		)
	).item_id;
	await rpc(admin, 'public.classroom_set_html_assignment($1::uuid, $2, $3::jsonb, $4)', [item, doc(manifest), JSON.stringify(manifest), 'bench.html']);
	await rpc(ana, `public.classroom_save_response($1::uuid, 'hx-text', '{"text":"one"}'::jsonb)`, [item]);
	anaFile = await fileFor(ana.email);
	benFile = await fileFor(ben.email);
}, 300_000);

afterAll(async () => {
	await db?.stop();
});

describe('the file as an apply sees it', () => {
	test('three lettered parts and a self-check, no top-level DML', () => {
		for (const k of ['A', 'B', 'C', 'Z']) expect(part0238(k), `part ${k}`).not.toBeNull();
		expect(scanFile(SQL_0238).findings).toEqual([]);
		expect(scanFile(`${SQL_0238}\ninsert into public.classroom_feedback_threads (item_id) values (gen_random_uuid());\n`).findings.length).toBeGreaterThan(0);
	});

	test('re-applying the file over itself changes nothing and raises nothing', async () => {
		await db.sql(SQL_0238);
		const { rows } = await db.sql<{ n: number }>(`select count(*)::int as n from pg_proc where proname = 'classroom_feedback_post'`);
		expect(rows[0].n).toBe(1);
	});

	test('no client reaches either table, and anon executes nothing new', async () => {
		await expect(db.asUser(ana.id, (q) => q('select * from public.classroom_feedback_threads'))).rejects.toThrow(/permission denied/i);
		await expect(
			db.asUser(teacher.id, (q) => q(`insert into public.classroom_feedback_messages (thread_id, author_role, author_id, body) values (gen_random_uuid(), 'teacher', $1, 'x')`, [teacher.id]))
		).rejects.toThrow(/permission denied/i);
		const { rows } = await db.sql<{ sig: string }>(
			`select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and (p.proname like 'classroom_feedback%' or p.proname like '_classroom_feedback%'
			   or p.proname in ('classroom_worksheet_past_manifests', 'classroom_worksheet_latch_for', 'classroom_presence_ping'))
			   and has_function_privilege('anon', p.oid, 'execute')`
		);
		expect(rows).toEqual([]);
		// Positive control: the client functions ARE open to a signed-in caller.
		const { rows: open } = await db.sql<{ n: number }>(
			`select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname like 'classroom_feedback%' and has_function_privilege('authenticated', p.oid, 'execute')`
		);
		expect(open[0].n).toBe(7);
	});
});

describe('PART A: the drawing gate', () => {
	const ok = async (marks: unknown) =>
		(await db.sql<{ r: boolean | null }>(`select public._classroom_feedback_marks_ok($1::jsonb) as r`, [marks === undefined ? null : JSON.stringify(marks)])).rows[0].r;

	test('accepts every kind of mark in every colour and width', async () => {
		expect(
			await ok({
				v: 1,
				shapes: [
					{ t: 'pen', c: 'red', w: 1, p: [0, 0, 10, 10] },
					{ t: 'arrow', c: 'yellow', w: 2, p: [0, 0, 10000, 10000] },
					{ t: 'box', c: 'green', w: 3, p: [1, 2, 3, 4] },
					{ t: 'ellipse', c: 'blue', w: 1, p: [1, 2, 3, 4] },
					{ t: 'text', c: 'white', w: 2, p: [5000, 5000], s: 'Check this edge' },
					{ t: 'pen', c: 'black', w: 2, p: [9, 9, 10, 10] }
				]
			})
		).toBe(true);
		// SQL NULL is "no drawing"; a JSON null is not a drawing and is refused.
		expect(await ok(undefined)).toBe(true);
		expect(await ok(null)).toBe(false);
	});

	test('refuses with FALSE, never NULL, every shape that is not the closed one', async () => {
		const bad: unknown[] = [
			{},
			{ v: 2, shapes: [] },
			{ v: 1 },
			{ v: 1, shapes: {} },
			{ v: 1, shapes: [], extra: true },
			{ v: 1, shapes: [{ t: 'pen', c: 'red', w: 2, p: [0, 0, 1] }] },
			{ v: 1, shapes: [{ t: 'pen', c: 'red', w: 2, p: [0, 0] }] },
			{ v: 1, shapes: [{ t: 'arrow', c: 'red', w: 2, p: [0, 0, 1, 1, 2, 2] }] },
			{ v: 1, shapes: [{ t: 'pen', c: 'purple', w: 2, p: [0, 0, 1, 1] }] },
			{ v: 1, shapes: [{ t: 'pen', c: 'red', w: 4, p: [0, 0, 1, 1] }] },
			{ v: 1, shapes: [{ t: 'pen', c: 'red', p: [0, 0, 1, 1] }] },
			{ v: 1, shapes: [{ t: 'pen', c: 'red', w: 2, p: [0, 0, 1.5, 1] }] },
			{ v: 1, shapes: [{ t: 'pen', c: 'red', w: 2, p: [0, 0, 10001, 1] }] },
			{ v: 1, shapes: [{ t: 'pen', c: 'red', w: 2, p: [0, 0, -1, 1] }] },
			{ v: 1, shapes: [{ t: 'pen', c: 'red', w: 2, p: [0, 0, '1', 1] }] },
			{ v: 1, shapes: [{ t: 'pen', c: 'red', w: 2, p: [0, 0, 1, 1], s: 'x' }] },
			{ v: 1, shapes: [{ t: 'text', c: 'red', w: 2, p: [0, 0] }] },
			{ v: 1, shapes: [{ t: 'text', c: 'red', w: 2, p: [0, 0], s: '   ' }] },
			{ v: 1, shapes: [{ t: 'text', c: 'red', w: 2, p: [0, 0], s: 'x'.repeat(81) }] },
			{ v: 1, shapes: [{ c: 'red', w: 2, p: [0, 0, 1, 1] }] },
			{ v: 1, shapes: [{ t: 'pen', c: 'red', w: 2, p: [0, 0, 1, 1], url: 'https://x' }] },
			{ v: 1, shapes: Array.from({ length: 201 }, () => ({ t: 'box', c: 'red', w: 1, p: [0, 0, 1, 1] })) }
		];
		for (const marks of bad) expect(await ok(marks), JSON.stringify(marks).slice(0, 80)).toBe(false);
		expect(bad.length).toBe(22);
	});
});

describe('PART A: threads, both sides', () => {
	let note: Thread;
	let drawing: Thread;

	test('a teacher posts a note on a block and a drawing on the student\'s own picture', async () => {
		const a = await rpc<Json>(teacher, `public.classroom_feedback_post($1::uuid, $2, 'hx-text', null, $3, null)`, [item, ana.email, '  Say why the hook bent.  ']);
		expect(a.ok).toBe(true);
		note = a.thread as Thread;
		expect(note.messages.map((m) => m.body)).toEqual(['Say why the hook bent.']);
		expect(note.viewer).toBe('teacher');
		expect(note.author_name).toBe('Tee Cher');
		const b = await rpc<Json>(teacher, `public.classroom_feedback_post($1::uuid, $2, 'hx-photo', $3::uuid, '', $4::jsonb)`, [item, ana.email, anaFile, JSON.stringify(PEN)]);
		expect(b.ok).toBe(true);
		drawing = b.thread as Thread;
		expect(drawing.marks).toEqual(PEN);
		expect(drawing.messages).toEqual([]);
	});

	test('every refusal a teacher can meet is worded, and a stranger is "not found"', async () => {
		const post = (u: SeededUser, block: string | null, file: string | null, body: string, marks: unknown, who = ana.email) =>
			rpc<Json>(u, `public.classroom_feedback_post($1::uuid, $2, $3, $4::uuid, $5, $6::jsonb)`, [item, who, block, file, body, marks === null ? null : JSON.stringify(marks)]);
		expect((await post(teacher, 'not-a-block', null, 'x', null)).reason).toBe('block');
		expect((await post(teacher, 'bad id!', null, 'x', null)).reason).toBe('block');
		expect((await post(teacher, null, null, '   ', null)).reason).toBe('empty');
		expect((await post(teacher, null, null, 'x'.repeat(2001), null)).reason).toBe('too_long');
		expect((await post(teacher, 'hx-photo', null, '', PEN)).reason).toBe('file');
		// Ben's picture is not Ana's hand-in.
		expect((await post(teacher, 'hx-photo', benFile, '', PEN)).reason).toBe('file');
		expect((await post(teacher, 'hx-photo', anaFile, '', { v: 1, shapes: [{ t: 'pen' }] })).reason).toBe('marks');
		// Somebody who does not manage the class, and a student, read the same as nobody.
		for (const u of [otherTeacher, outsider, ben, ana]) expect((await post(u, null, null, 'x', null)).reason, u.email).toBe('not_found');
	});

	test('the student reads exactly their own threads; another student reads none of them', async () => {
		const mine = await rpc<Thread[]>(ana, 'public.classroom_feedback_list($1::uuid)', [item]);
		expect(mine.map((t) => t.id).sort()).toEqual([note.id, drawing.id].sort());
		expect(mine.every((t) => t.viewer === 'student')).toBe(true);
		expect(await rpc<Thread[]>(ben, 'public.classroom_feedback_list($1::uuid)', [item])).toEqual([]);
		expect(await rpc<Thread[]>(outsider, 'public.classroom_feedback_list()')).toEqual([]);
		// Asking for Ana by name does not widen Ben's read.
		expect(await rpc<Thread[]>(ben, 'public.classroom_feedback_list($1::uuid, $2)', [item, ana.email])).toEqual([]);
		// A teacher of another class reads nothing; the class's teacher reads both.
		expect(await rpc<Thread[]>(otherTeacher, 'public.classroom_feedback_list()')).toEqual([]);
		expect((await rpc<Thread[]>(teacher, 'public.classroom_feedback_list()')).length).toBe(2);
		expect((await rpc<Thread[]>(teacher, 'public.classroom_feedback_list(null, null, $1::uuid)', [section])).length).toBe(2);
		expect(await rpc<Thread[]>(teacher, 'public.classroom_feedback_list(null, null, $1::uuid)', [otherSection])).toEqual([]);
		const t = (await rpc<Thread[]>(teacher, 'public.classroom_feedback_list($1::uuid, $2)', [item, ana.email]))[0];
		expect(t.sections).toEqual([section]);
	});

	test('back and forth: the student answers, the teacher answers, and both see who wrote what', async () => {
		const r1 = await rpc<Json>(ana, 'public.classroom_feedback_reply($1::uuid, $2)', [note.id, 'It bent at the weld.']);
		expect(r1.ok).toBe(true);
		const r2 = await rpc<Json>(teacher, 'public.classroom_feedback_reply($1::uuid, $2)', [note.id, 'Good. Add a photo of it.']);
		expect(r2.ok).toBe(true);
		const [t] = (await rpc<Thread[]>(ana, 'public.classroom_feedback_list($1::uuid)', [item])).filter((x) => x.id === note.id);
		expect(t.messages.map((m) => `${m.role}:${m.body}`)).toEqual([
			'teacher:Say why the hook bent.',
			'student:It bent at the weld.',
			'teacher:Good. Add a photo of it.'
		]);
		expect(t.messages.map((m) => m.mine)).toEqual([false, true, false]);
		// Never an address in a message.
		expect(JSON.stringify(t.messages)).not.toContain('@');
		// Ben cannot answer Ana's thread; an outsider cannot either.
		expect((await rpc<Json>(ben, 'public.classroom_feedback_reply($1::uuid, $2)', [note.id, 'hi'])).reason).toBe('not_found');
		expect((await rpc<Json>(otherTeacher, 'public.classroom_feedback_reply($1::uuid, $2)', [note.id, 'hi'])).reason).toBe('not_found');
		expect((await rpc<Json>(ana, 'public.classroom_feedback_reply($1::uuid, $2)', [note.id, '  '])).reason).toBe('empty');
	});

	test('Fixed it is the student\'s, resolve and reopen are the teacher\'s, and reopen clears a stale Fixed it', async () => {
		const state = (u: SeededUser, s: string) => rpc<Json>(u, 'public.classroom_feedback_set_state($1::uuid, $2)', [note.id, s]);
		expect(((await state(ana, 'fixed')).thread as Json).fixed_at).not.toBeNull();
		expect((await state(ana, 'resolved')).reason).toBe('state');
		expect((await state(teacher, 'fixed')).reason).toBe('state');
		expect((await state(ben, 'fixed')).reason).toBe('not_found');
		expect(((await state(teacher, 'resolved')).thread as Json).resolved_at).not.toBeNull();
		const reopened = (await state(teacher, 'open')).thread as Json;
		expect(reopened.resolved_at).toBeNull();
		expect(reopened.fixed_at).toBeNull();
	});

	test('seen stamps the reader\'s side and never moves updated_at', async () => {
		const before = (await db.sql<{ u: string }>(`select updated_at::text as u from public.classroom_feedback_threads where id = $1`, [note.id])).rows[0].u;
		await rpc(teacher, 'public.classroom_feedback_reply($1::uuid, $2)', [note.id, 'One more thing.']);
		const after = (await db.sql<{ u: string; s: string | null }>(`select updated_at::text as u, student_seen_at::text as s from public.classroom_feedback_threads where id = $1`, [note.id])).rows[0];
		expect(after.u).not.toBe(before);
		expect(await rpc<number>(ana, 'public.classroom_feedback_seen($1::uuid)', [item])).toBeGreaterThan(0);
		const seen = (await db.sql<{ u: string; s: string | null }>(`select updated_at::text as u, student_seen_at::text as s from public.classroom_feedback_threads where id = $1`, [note.id])).rows[0];
		expect(seen.u).toBe(after.u);
		expect(seen.s).not.toBeNull();
		// Ben stamping his own side touches none of Ana's rows.
		expect(await rpc<number>(ben, 'public.classroom_feedback_seen($1::uuid)', [item])).toBe(0);
		// A stranger cannot stamp a teacher's side for Ana.
		expect(await rpc<number>(otherTeacher, 'public.classroom_feedback_seen($1::uuid, $2)', [item, ana.email])).toBe(0);
		expect(await rpc<number>(teacher, 'public.classroom_feedback_seen($1::uuid, $2)', [item, ana.email])).toBeGreaterThanOrEqual(0);
	});

	test('a teacher edits the note and the drawing; a student cannot', async () => {
		const marks = { v: 1, shapes: [{ t: 'arrow', c: 'yellow', w: 3, p: [100, 100, 900, 900] }] };
		const r = await rpc<Json>(teacher, 'public.classroom_feedback_update($1::uuid, $2, $3::jsonb)', [drawing.id, 'Look here.', JSON.stringify(marks)]);
		expect(r.ok).toBe(true);
		expect((r.thread as Thread).marks).toEqual(marks);
		expect((r.thread as Thread).messages.map((m) => m.body)).toEqual(['Look here.']);
		expect((r.thread as Thread).edited_at).not.toBeNull();
		expect((await rpc<Json>(ana, 'public.classroom_feedback_update($1::uuid, $2, null)', [drawing.id, 'mine now'])).reason).toBe('not_found');
	});

	test('a removed message and a removed thread reach no reader', async () => {
		const [t] = (await rpc<Thread[]>(ana, 'public.classroom_feedback_list($1::uuid)', [item])).filter((x) => x.id === note.id);
		const own = t.messages.find((m) => m.mine)!;
		const theirs = t.messages.find((m) => !m.mine)!;
		// A student removes their own message, never the teacher's.
		expect((await rpc<Json>(ana, 'public.classroom_feedback_remove($1::uuid, $2::uuid)', [note.id, theirs.id])).reason).toBe('not_found');
		expect((await rpc<Json>(ana, 'public.classroom_feedback_remove($1::uuid, $2::uuid)', [note.id, own.id])).ok).toBe(true);
		const [after] = (await rpc<Thread[]>(ana, 'public.classroom_feedback_list($1::uuid)', [item])).filter((x) => x.id === note.id);
		expect(after.messages.map((m) => m.body)).not.toContain(own.body);
		expect(after.messages.length).toBe(t.messages.length - 1);
		// A student cannot remove a thread; the teacher can, and then nobody reads it.
		expect((await rpc<Json>(ana, 'public.classroom_feedback_remove($1::uuid)', [drawing.id])).reason).toBe('not_found');
		expect((await rpc<Json>(teacher, 'public.classroom_feedback_remove($1::uuid)', [drawing.id])).ok).toBe(true);
		expect((await rpc<Thread[]>(ana, 'public.classroom_feedback_list($1::uuid)', [item])).map((x) => x.id)).toEqual([note.id]);
		expect((await rpc<Thread[]>(teacher, 'public.classroom_feedback_list($1::uuid)', [item])).map((x) => x.id)).toEqual([note.id]);
		// And nothing was deleted.
		const { rows } = await db.sql<{ n: number }>(`select count(*)::int as n from public.classroom_feedback_threads where removed_at is not null`);
		expect(rows[0].n).toBe(1);
	});

	test('a student who leaves the class stops reading their threads', async () => {
		await db.sql(`update public.classroom_enrollments set active = false where student_email = $1`, [ben.email]);
		const t = await rpc<Json>(teacher, `public.classroom_feedback_post($1::uuid, $2, null, null, 'Welcome back', null)`, [item, ben.email]);
		// The teacher still reviews Ben's work (0086 keys on the posting), and Ben no longer reads the item.
		expect(t.ok).toBe(true);
		expect(await rpc<Thread[]>(ben, 'public.classroom_feedback_list($1::uuid)', [item])).toEqual([]);
		await db.sql(`update public.classroom_enrollments set active = true where student_email = $1`, [ben.email]);
		expect((await rpc<Thread[]>(ben, 'public.classroom_feedback_list($1::uuid)', [item])).length).toBe(1);
	});
});

describe('PART B: a finish judged against the worksheet it was', () => {
	test('past manifests reach anybody who reads the item, newest first, and nobody else', async () => {
		const grown = JSON.parse(JSON.stringify(manifest));
		grown.modules[0].blocks.push({ id: 'hx-more', field: 'f2', type: 'text', minSentences: 2 });
		await rpc(admin, 'public.classroom_set_html_assignment($1::uuid, $2, $3::jsonb, $4)', [item, doc(grown), JSON.stringify(grown), 'bench.html']);
		const past = await rpc<Array<{ item_id: string; manifest: Json; until: string }>>(ana, 'public.classroom_worksheet_past_manifests($1::uuid[])', [[item]]);
		expect(past.length).toBeGreaterThanOrEqual(1);
		expect(past[0].item_id).toBe(item);
		expect(((past[0].manifest.modules as Json[])[0].blocks as Json[]).map((b) => b.id)).toEqual(['hx-text', 'hx-photo']);
		expect(Number.isNaN(Date.parse(past[0].until))).toBe(false);
		expect(await rpc(outsider, 'public.classroom_worksheet_past_manifests($1::uuid[])', [[item]])).toEqual([]);
		expect((await rpc<unknown[]>(teacher, 'public.classroom_worksheet_past_manifests($1::uuid[])', [[item]])).length).toBe(past.length);
	});

	test('a manager stamps a student\'s finish; a stranger and a student cannot stamp somebody else', async () => {
		const stamp = (u: SeededUser, who: string) => rpc<boolean>(u, 'public.classroom_worksheet_latch_for($1::uuid, $2, $3::timestamptz)', [item, who, '2026-10-02T15:00:00Z']);
		expect(await stamp(otherTeacher, ana.email)).toBe(false);
		expect(await stamp(ben, ana.email)).toBe(false);
		expect(await stamp(teacher, ana.email)).toBe(true);
		expect(await stamp(teacher, ana.email)).toBe(false);
		const rows = await rpc<Array<{ student_email: string; completed_at: string }>>(ana, 'public.classroom_worksheet_latched($1::uuid[], null)', [[item]]);
		expect(rows.map((r) => r.student_email)).toEqual([ana.email]);
		expect(new Date(rows[0].completed_at).toISOString()).toBe('2026-10-02T15:00:00.000Z');
		// Nobody who never touched the worksheet can be stamped (Ben has a hand-in file, the outsider nothing).
		expect(await stamp(teacher, outsider.email)).toBe(false);
	});
});

describe('PART C: the heartbeat says when the feedback moved', () => {
	test('it answers feedback_at for the caller\'s own live threads, and 0200\'s keys are all still there', async () => {
		const beat = await rpc<Json>(ana, 'public.classroom_presence_ping($1::uuid, true, true)', [item]);
		expect(beat.ok).toBe(true);
		expect(Object.keys(beat).sort()).toEqual(['active_seconds', 'credited_seconds', 'feedback_at', 'ok', 'purged', 'throttled']);
		const latest = (await db.sql<{ m: string }>(`select max(updated_at) as m from public.classroom_feedback_threads where item_id = $1 and student_email = $2 and removed_at is null`, [item, ana.email])).rows[0].m;
		expect(new Date(beat.feedback_at as string).getTime()).toBe(new Date(latest).getTime());
		// A throttled beat answers it too, so no beat is wasted.
		const again = await rpc<Json>(ana, 'public.classroom_presence_ping($1::uuid, true, true)', [item]);
		expect(again.throttled).toBe(true);
		expect(again.feedback_at).toBe(beat.feedback_at);
		// A student with no thread reads null, never somebody else's instant.
		const { rows } = await db.sql(`select 1`);
		expect(rows.length).toBe(1);
		await db.sql(`update public.classroom_feedback_threads set removed_at = now() where student_email = $1`, [ben.email]);
		await db.sql(`delete from public.classroom_presence where student_email = $1`, [ben.email]);
		const benBeat = await rpc<Json>(ben, 'public.classroom_presence_ping($1::uuid, false, true)', [item]);
		expect(benBeat.feedback_at).toBeNull();
	});
});
