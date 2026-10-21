// 0285: a class notice can be marked important (report 7ec59920). Driven against
// the real chain through the real RPCs.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createClassroomSection, createUser, enrollStudent, startTestDb, type SeededUser, type TestDb } from './harness';

let db: TestDb;
let admin: SeededUser;
let teacher: SeededUser;
let other: SeededUser;
let student: SeededUser;
let section: string;
let preexisting: string;

const DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const FILE = readdirSync(DIR).find((f) => f.startsWith('0285_quick_post_important'))!;
// The whole tree short of this file, behind the fixture completion the full chain needs.
const PRE = ['../../tests/db/full-chain-fixture-completion.sql', ...readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f) && f < '0285').sort()];

const read = (u: SeededUser) =>
	db.asUser(u.id, async (q) => (await q<{ r: { posts: { id: string; important: boolean }[] } }>('select public.classroom_quick_posts($1::uuid) as r', [section])).rows[0].r.posts);

beforeAll(async () => {
	db = await startTestDb(PRE);
	admin = await createUser(db, 'apina@boscotech.edu', 'Owner Admin');
	teacher = await createUser(db, 'tee.one@boscotech.edu', 'Tee One');
	other = await createUser(db, 'tee.two@boscotech.edu', 'Tee Two');
	student = await createUser(db, 'sam@boscotech.net', 'Sam Student');
	section = await createClassroomSection(db, { as: admin, courseCode: 'IDEA100', courseTitle: 'Engineering I', label: 'Block 1', teacherEmail: teacher.email });
	await enrollStudent(db, { as: teacher, sectionId: section, email: student.email, displayName: 'Sam Student' });
	// A notice made by the deployed, pre-migration RPC, then the file applied over it.
	preexisting = await db.asUser(teacher.id, async (q) => (await q<{ r: { id: string } }>('select public.classroom_quick_post_create($1::uuid[], $2, null::timestamptz) as r', [[section], 'posted before the migration'])).rows[0].r.id);
	await db.sql(readFileSync(join(DIR, FILE), 'utf8'));
}, 120_000);
afterAll(async () => { await db?.stop(); });

describe('quick post important', () => {
	test('the author marks one important, it sorts first, and others cannot', async () => {
		const mk = (body: string) =>
			db.asUser(teacher.id, async (q) => (await q<{ r: { id: string } }>('select public.classroom_quick_post_create($1::uuid[], $2, null::timestamptz) as r', [[section], body])).rows[0].r.id);
		const older = await mk('older notice');
		const newer = await mk('newer notice');
		expect((await read(student)).map((p) => p.id)).toEqual([newer, older, preexisting]);
		expect((await read(student)).every((p) => p.important === false)).toBe(true);

		const set = (u: SeededUser, id: string, v: boolean) =>
			db.asUser(u.id, async (q) => q('select public.classroom_quick_post_set_important($1::uuid, $2) as r', [id, v]));
		await set(teacher, older, true);
		const posts = await read(student);
		expect(posts.map((p) => p.id)).toEqual([older, newer, preexisting]);
		expect(posts[0].important).toBe(true);

		await expect(set(other, newer, true)).rejects.toThrow(/Only the teacher who posted it/);
		await expect(set(student, newer, true)).rejects.toThrow();
		expect((await read(student)).find((p) => p.id === newer)!.important).toBe(false);
		await set(teacher, older, false);
		expect((await read(student)).map((p) => p.id)).toEqual([newer, older, preexisting]);
	});

	test('the file applies a second time without harm', async () => {
		await db.sql(readFileSync(join(DIR, FILE), 'utf8'));
		expect((await read(student)).length).toBe(3);
	});
});
