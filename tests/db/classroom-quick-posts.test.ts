// tests/db/classroom-quick-posts.test.ts
//
// 0230 PART A: CLASS QUICK POSTS (report c994ce32). What would fail SILENTLY,
// and so is asserted here rather than in a harness:
//
//   1. THE AUDIENCE. A read that admits one person too many produces no error
//      and nothing on screen looks wrong: a notice simply reaches somebody it
//      was not for. So every arm is asserted in both directions: an ACTIVE
//      enrollee of A reads A's notices and NOT a notice sent only to B (with
//      B's enrollee reading it as the positive control); an inactive enrollee,
//      an unenrolled user and an invented section all answer the identical
//      'Not found.'.
//   2. LIVE MEANS LIVE. An expired notice and a taken-down one are absent, each
//      beside a live notice as the positive control.
//   3. NO ADDRESS LEAVES THE DATABASE, and a student never learns which other
//      classes a notice went to, with a manager's read as the positive control.
//   4. WHO MAY WRITE. Creating with one unmanaged class raises and inserts
//      nothing; an admin may post anywhere; taking down is the author's, or a
//      manager of EVERY class it went to, and a manager of one class of two is
//      refused with the sentence that says who can.
//   5. THE GRANTS OFF THE CATALOG, ONE OVERLOAD PER FUNCTION, AND A SECOND
//      PASTE THAT CHANGES NOTHING.
//
// The chain is the whole tree SHORT of 0230 (tests/db/chain-0230.ts says why);
// the sections and the roster are written through the real 0082 RPCs, and 0230
// is then applied over the top. The mutation proofs in the permissive direction
// were run against THIS file by mutating the migration on disk and restoring it
// from an in-memory copy; the history entry carries the runs.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './harness';
import {
	PRE_0230,
	PRE_0230_COUNT,
	SQL_0230,
	canExecute,
	catalogFingerprint,
	keysDeep,
	overloads,
	refusal,
	tablePrivileges
} from './chain-0230';

const READ = 'select public.classroom_quick_posts($1::uuid) as r';
const CREATE = 'select public.classroom_quick_post_create($1::uuid[], $2, $3::timestamptz) as r';
const TAKE = 'select public.classroom_quick_post_take_down($1::uuid) as r';

const PUBLIC_FNS = [
	'classroom_quick_posts(uuid)',
	'classroom_quick_post_create(uuid[], text, timestamptz)',
	'classroom_quick_post_take_down(uuid)'
] as const;
const PRIVATE_FN = '_classroom_quick_post_can_take_down(uuid, text)';
const TABLES = ['classroom_quick_posts', 'classroom_quick_post_sections'] as const;
const NOT_A_TEACHER = 'Only a teacher of every chosen class can post to it.';
const NOT_YOURS_TO_TAKE =
	'Only the teacher who posted this, or a teacher of every class it went to, can take it down.';
const FAKE = '00000000-0000-4000-8000-000000000000';

interface Post {
	id: string;
	body: string;
	created_at: string;
	expires_at: string | null;
	section_ids: string[] | null;
	can_take_down: boolean;
}
interface Board {
	ok: boolean;
	manages: boolean;
	now: string;
	posts: Post[];
}
interface Created {
	ok: boolean;
	id?: string;
	reason?: string;
	limit?: number;
	section_ids?: string[];
	expires_at?: string | null;
}

let db: TestDb;
let admin: SeededUser;
let t1: SeededUser;
let t2: SeededUser;
let sam: SeededUser;
let val: SeededUser;
let ina: SeededUser;
let out: SeededUser;
/** A and B are t1's; C is t2's; D is t1's and holds the 20-row limit probe. */
let A: string;
let B: string;
let C: string;
let D: string;
let enrollmentsBefore: number;

async function read(u: SeededUser, section: string): Promise<Board> {
	return db.asUser(u.id, async (q) => (await q<{ r: Board }>(READ, [section])).rows[0].r);
}
async function create(u: SeededUser, ids: (string | null)[], body: string, expires: string | null = null): Promise<Created> {
	return db.asUser(u.id, async (q) => (await q<{ r: Created }>(CREATE, [ids, body, expires])).rows[0].r);
}
async function takeDown(u: SeededUser, post: string) {
	return db.asUser(u.id, async (q) => (await q<{ r: { ok: boolean; already: boolean; section_ids: string[] } }>(TAKE, [post])).rows[0].r);
}
async function count(table: string): Promise<number> {
	const { rows } = await db.sql<{ n: number }>(`select count(*)::int as n from public.${table}`);
	return rows[0].n;
}
const ids = (b: Board) => b.posts.map((p) => p.id);

beforeAll(async () => {
	db = await startTestDb(PRE_0230);

	admin = await createUser(db, 'apina@boscotech.edu', 'Owner Admin');
	t1 = await createUser(db, 'tee.one@boscotech.edu', 'Tee One');
	t2 = await createUser(db, 'tee.two@boscotech.edu', 'Tee Two');
	sam = await createUser(db, 'sam@boscotech.net', 'Sam Student');
	val = await createUser(db, 'val@boscotech.net', 'Val Student');
	ina = await createUser(db, 'ina@boscotech.net', 'Ina Inactive');
	out = await createUser(db, 'out@boscotech.net', 'Out Sider');

	// THROUGH THE REAL PRE-0230 RPCS, so the roster 0230 lands on is one the
	// deployed write path made.
	A = await createClassroomSection(db, { as: admin, courseCode: 'IDEA100', courseTitle: 'Engineering I', label: 'Block 1', teacherEmail: t1.email });
	B = await createClassroomSection(db, { as: admin, courseCode: 'IDEA100', courseTitle: 'Engineering I', label: 'Block 2', teacherEmail: t1.email });
	C = await createClassroomSection(db, { as: admin, courseCode: 'IDEA209H', courseTitle: 'Engineering II Honors', label: 'Block 3', teacherEmail: t2.email });
	D = await createClassroomSection(db, { as: admin, courseCode: 'IDEA100', courseTitle: 'Engineering I', label: 'Block 4', teacherEmail: t1.email });
	await enrollStudent(db, { as: t1, sectionId: A, email: sam.email, displayName: 'Sam Student' });
	await enrollStudent(db, { as: t1, sectionId: B, email: val.email, displayName: 'Val Student' });
	await enrollStudent(db, { as: t1, sectionId: D, email: val.email, displayName: 'Val Student' });
	await enrollStudent(db, { as: t1, sectionId: A, email: ina.email, displayName: 'Ina Inactive' });
	await enrollStudent(db, { as: t1, sectionId: A, email: ina.email, displayName: 'Ina Inactive', active: false });

	enrollmentsBefore = await count('classroom_enrollments');

	await db.sql(SQL_0230);
});

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
describe('the apply over a seeded roster', () => {
	test(`it lands on the whole pre-0230 chain (${PRE_0230_COUNT} files) and leaves the roster alone`, async () => {
		expect(PRE_0230_COUNT).toBeGreaterThan(200);
		expect(await count('classroom_enrollments')).toBe(enrollmentsBefore);
		expect(await count('classroom_quick_posts')).toBe(0);
		const board = await read(sam, A);
		expect(board).toMatchObject({ ok: true, manages: false, posts: [] });
	});

	test('both tables: RLS on, no policy, and no privilege of any kind for anon or authenticated', async () => {
		for (const table of TABLES) {
			const { rows } = await db.sql<{ rls: boolean; policies: number }>(
				`select c.relrowsecurity as rls,
				        (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
				 from pg_class c join pg_namespace n on n.oid = c.relnamespace
				 where n.nspname = 'public' and c.relname = $1`,
				[table]
			);
			expect(rows[0], table).toEqual({ rls: true, policies: 0 });
			expect(await tablePrivileges(db, 'anon', table), table).toEqual([]);
			expect(await tablePrivileges(db, 'authenticated', table), table).toEqual([]);
		}
		// POSITIVE CONTROL for the privilege reader: 0053's table grant is visible.
		expect(await tablePrivileges(db, 'authenticated', 'app_feedback')).toEqual(['select', 'insert']);
	});

	test('a signed-in student reading the table directly is refused outright', async () => {
		for (const table of TABLES) {
			const message = await refusal(() => db.asUser(sam.id, (q) => q(`select * from public.${table}`)));
			expect(message, table).toMatch(/permission denied/);
		}
	});

	test('exactly one overload each; anon executes none; authenticated executes the three public ones only', async () => {
		for (const fn of [...PUBLIC_FNS, PRIVATE_FN]) {
			expect(await overloads(db, fn.split('(')[0]), fn).toBe(1);
			expect(await canExecute(db, 'anon', fn), `anon ${fn}`).toBe(false);
		}
		for (const fn of PUBLIC_FNS) expect(await canExecute(db, 'authenticated', fn), fn).toBe(true);
		expect(await canExecute(db, 'authenticated', PRIVATE_FN)).toBe(false);
	});

	test('anon cannot call the read, the create or the take down', async () => {
		const calls: [string, unknown[]][] = [
			[READ, [A]],
			[CREATE, [[A], 'hello', null]],
			[TAKE, [FAKE]]
		];
		for (const [sql, args] of calls) {
			const message = await refusal(() => db.asAnon((q) => q(sql, args)));
			expect(message).toMatch(/permission denied for function/);
		}
	});

	test('the four constraints, exactly one of each', async () => {
		const { rows } = await db.sql<{ conname: string }>(
			`select conname from pg_constraint
			 where conname like 'classroom_quick_posts_%' and contype = 'c' order by conname`
		);
		expect(rows.map((r) => r.conname)).toEqual([
			'classroom_quick_posts_author_shape',
			'classroom_quick_posts_body_shape',
			'classroom_quick_posts_takedown_pair',
			'classroom_quick_posts_window'
		]);
	});
});

// ===========================================================================
describe('create', () => {
	test('a teacher posts to one class, until it is taken down', async () => {
		const r = await create(t1, [A], 'Bring your notebook tomorrow.');
		expect(r).toMatchObject({ ok: true, section_ids: [A], expires_at: null });
		const { rows } = await db.sql(`select author_email, body from public.classroom_quick_posts where id = $1`, [r.id]);
		expect(rows[0]).toEqual({ author_email: t1.email, body: 'Bring your notebook tomorrow.' });
	});

	test('ids are deduped, nulls dropped and sorted, and each target is one row', async () => {
		const r = await create(t1, [B, A, null, A], 'Both blocks: lab is in room 12.');
		expect(r.ok).toBe(true);
		expect(r.section_ids).toEqual([A, B].sort());
		const { rows } = await db.sql<{ n: number }>(
			`select count(*)::int as n from public.classroom_quick_post_sections where post_id = $1`,
			[r.id]
		);
		expect(rows[0].n).toBe(2);
	});

	test('ONE class the caller does not manage refuses the whole post and inserts nothing', async () => {
		const posts = await count('classroom_quick_posts');
		const targets = await count('classroom_quick_post_sections');
		expect(await refusal(() => create(t1, [A, C], 'Half mine.'))).toBe(NOT_A_TEACHER);
		expect(await refusal(() => create(t1, [FAKE], 'Nowhere.'))).toBe(NOT_A_TEACHER);
		expect(await refusal(() => create(sam, [A], 'I am a student.'))).toBe(NOT_A_TEACHER);
		expect(await count('classroom_quick_posts')).toBe(posts);
		expect(await count('classroom_quick_post_sections')).toBe(targets);
	});

	test('an admin may post to any class, and an invented id is refused for an admin too', async () => {
		const r = await create(admin, [A, C], 'Assembly at 10.');
		expect(r).toMatchObject({ ok: true, section_ids: [A, C].sort() });
		expect(await refusal(() => create(admin, [A, FAKE], 'Half real.'))).toBe(NOT_A_TEACHER);
	});

	test('what a teacher can type is refused with a reason, never an exception', async () => {
		const soon = new Date(Date.now() - 60_000).toISOString();
		const far = new Date(Date.now() + 400 * 86_400_000).toISOString();
		expect(await create(t1, [], 'x')).toEqual({ ok: false, reason: 'no_classes' });
		expect(await create(t1, [null], 'x')).toEqual({ ok: false, reason: 'no_classes' });
		expect(await create(t1, [A], ' \n\t \r\n ')).toEqual({ ok: false, reason: 'empty' });
		expect(await create(t1, [A], 'x'.repeat(1001))).toEqual({ ok: false, reason: 'too_long', limit: 1000 });
		expect(await create(t1, [A], 'late', soon)).toEqual({ ok: false, reason: 'expiry_passed' });
		expect(await create(t1, [A], 'never', far)).toEqual({ ok: false, reason: 'expiry_too_far' });
		// POSITIVE CONTROL: exactly 1000 characters and a near expiry are accepted.
		const ok = await create(t1, [A], 'y'.repeat(1000), new Date(Date.now() + 3_600_000).toISOString());
		expect(ok.ok).toBe(true);
		await takeDown(t1, ok.id!);
	});

	test('more than 50 classes raises, before any of them is checked', async () => {
		const many = Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
		expect(await refusal(() => create(t1, many, 'Everyone.'))).toBe('Post to at most 50 classes at a time.');
	});

	test('the body is stored trimmed the way a person means it, line breaks inside kept', async () => {
		const r = await create(t1, [A], '\n  Line one\nLine two  \n\t');
		const { rows } = await db.sql(`select body from public.classroom_quick_posts where id = $1`, [r.id]);
		expect(rows[0].body).toBe('Line one\nLine two');
		await takeDown(t1, r.id!);
	});
});

// ===========================================================================
describe('read: who sees what', () => {
	let toA: string;
	let toB: string;
	let toAB: string;
	let toAC: string;
	let expired: string;
	let future: string;

	beforeAll(async () => {
		toA = (await create(t1, [A], 'Only for Block 1.')).id!;
		toB = (await create(t1, [B], 'Only for Block 2.')).id!;
		toAB = (await create(t1, [A, B], 'For both of my blocks.')).id!;
		toAC = (await create(admin, [A, C], 'From the office, to Block 1 and Block 3.')).id!;
		expired = (await create(t1, [A], 'This one ran out.', new Date(Date.now() + 3_600_000).toISOString())).id!;
		future = (await create(t1, [A], 'Still running.', new Date(Date.now() + 3_600_000).toISOString())).id!;
		// The RPC refuses an expiry in the past, rightly, so the expired notice
		// is moved back in time as the owner, keeping the window CHECK true.
		await db.sql(
			`update public.classroom_quick_posts
			 set created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour'
			 where id = $1`,
			[expired]
		);
	});

	test('an active enrollee of A reads A, and NOT a notice sent only to B', async () => {
		const board = await read(sam, A);
		expect(ids(board)).toEqual(expect.arrayContaining([toA, toAB, toAC, future]));
		expect(ids(board)).not.toContain(toB);
		// POSITIVE CONTROL: B's own enrollee does read it.
		expect(ids(await read(val, B))).toEqual(expect.arrayContaining([toB, toAB]));
		expect(ids(await read(val, B))).not.toContain(toA);
	});

	test('an inactive enrollee, an unenrolled user, another class and an invented id all answer the same', async () => {
		expect(await refusal(() => read(ina, A))).toBe('Not found.');
		expect(await refusal(() => read(out, A))).toBe('Not found.');
		expect(await refusal(() => read(sam, C))).toBe('Not found.');
		expect(await refusal(() => read(sam, FAKE))).toBe('Not found.');
		// POSITIVE CONTROL: the same calls succeed for somebody who belongs.
		expect((await read(sam, A)).ok).toBe(true);
	});

	test('an expired notice is gone, beside one whose expiry is still ahead', async () => {
		const board = await read(sam, A);
		expect(ids(board)).not.toContain(expired);
		expect(ids(board)).toContain(future);
		expect(board.posts.find((p) => p.id === future)!.expires_at).not.toBeNull();
	});

	test('a student sees no address, no other class and no take-down, against a manager read of the same board', async () => {
		const student = await read(sam, A);
		expect(student.manages).toBe(false);
		expect(JSON.stringify(student)).not.toContain('@');
		for (const p of student.posts) {
			expect(Object.keys(p).sort()).toEqual(['body', 'can_take_down', 'created_at', 'expires_at', 'id', 'section_ids']);
			expect(p.section_ids).toBeNull();
			expect(p.can_take_down).toBe(false);
		}
		expect([...keysDeep(student)]).not.toContain('author_email');

		// POSITIVE CONTROL: the manager's read of the same class carries targets.
		const manager = await read(t1, A);
		expect(manager.manages).toBe(true);
		expect(JSON.stringify(manager)).not.toContain('@');
		const ab = manager.posts.find((p) => p.id === toAB)!;
		expect(ab.section_ids).toEqual([A, B].sort());
		expect(ab.can_take_down).toBe(true);
		// The office's notice to A and C: t1 sees only the target they manage,
		// and cannot take it down (they did not write it and do not manage C).
		const ac = manager.posts.find((p) => p.id === toAC)!;
		expect(ac.section_ids).toEqual([A]);
		expect(ac.can_take_down).toBe(false);
		// An admin manages both, so sees both and may take it down.
		const office = (await read(admin, A)).posts.find((p) => p.id === toAC)!;
		expect(office.section_ids).toEqual([A, C].sort());
		expect(office.can_take_down).toBe(true);
	});

	test('newest first, at most 20', async () => {
		const made: string[] = [];
		for (let i = 0; i < 22; i += 1) made.push((await create(t1, [D], `Notice ${i}`)).id!);
		const board = await read(val, D);
		expect(board.posts).toHaveLength(20);
		expect(ids(board)[0]).toBe(made[21]);
		expect(ids(board)).not.toContain(made[0]);
		expect(ids(board)).not.toContain(made[1]);
		const times = board.posts.map((p) => Date.parse(p.created_at));
		expect([...times].sort((a, b) => b - a)).toEqual(times);
	});

	test('the read carries the server clock', async () => {
		const board = await read(sam, A);
		expect(Math.abs(Date.parse(board.now) - Date.now())).toBeLessThan(60_000);
	});
});

// ===========================================================================
describe('take down', () => {
	test("nobody can probe a post that is not theirs: a stranger, a student and an invented id answer alike", async () => {
		const p = (await create(t1, [A], 'Stranger probe.')).id!;
		expect(await refusal(() => takeDown(t2, p))).toBe('Not found.');
		expect(await refusal(() => takeDown(sam, p))).toBe('Not found.');
		expect(await refusal(() => takeDown(t2, FAKE))).toBe('Not found.');
		// And the post is still live.
		expect(ids(await read(sam, A))).toContain(p);
		await takeDown(t1, p);
	});

	test('the author takes it down, it is stamped not deleted, it leaves the board, and a repeat is idempotent', async () => {
		const p = (await create(t1, [A], 'Take me down.')).id!;
		const live = (await create(t1, [A], 'Stay up.')).id!;
		expect(await takeDown(t1, p)).toEqual({ ok: true, already: false, section_ids: [A] });
		expect(await takeDown(t1, p)).toEqual({ ok: true, already: true, section_ids: [A] });
		const { rows } = await db.sql(
			`select taken_down_by, taken_down_at is not null as stamped from public.classroom_quick_posts where id = $1`,
			[p]
		);
		expect(rows[0]).toEqual({ taken_down_by: t1.email, stamped: true });
		const board = await read(sam, A);
		expect(ids(board)).not.toContain(p);
		expect(ids(board)).toContain(live);
	});

	test('a manager of EVERY class it went to may take down somebody else\'s post', async () => {
		const p = (await create(admin, [A, B], 'Office to Block 1 and 2.')).id!;
		expect(await takeDown(t1, p)).toEqual({ ok: true, already: false, section_ids: [A, B].sort() });
	});

	test('a manager of ONE class of two is refused with the sentence that says who can, and the post stays up', async () => {
		const p = (await create(admin, [A, C], 'Office to Block 1 and 3.')).id!;
		expect(await refusal(() => takeDown(t2, p))).toBe(NOT_YOURS_TO_TAKE);
		expect(await refusal(() => takeDown(t1, p))).toBe(NOT_YOURS_TO_TAKE);
		expect(ids(await read(sam, A))).toContain(p);
		// POSITIVE CONTROL: its author can.
		expect((await takeDown(admin, p)).ok).toBe(true);
		expect(ids(await read(sam, A))).not.toContain(p);
	});

	test('the private predicate answers false for an empty address', async () => {
		const p = (await create(t1, [A], 'Predicate probe.')).id!;
		const { rows } = await db.sql<{ empty: boolean; author: boolean; stranger: boolean }>(
			`select public._classroom_quick_post_can_take_down($1, '') as empty,
			        public._classroom_quick_post_can_take_down($1, $2) as author,
			        public._classroom_quick_post_can_take_down($1, $3) as stranger`,
			[p, t1.email, t2.email]
		);
		expect(rows[0]).toEqual({ empty: false, author: true, stranger: false });
		await takeDown(t1, p);
	});
});

// ===========================================================================
describe('a second paste', () => {
	test('re-applying 0230 changes no catalog object and no row, and the boards read the same', async () => {
		const before = await catalogFingerprint(db);
		const posts = await count('classroom_quick_posts');
		const targets = await count('classroom_quick_post_sections');
		const samBefore = await read(sam, A);

		await db.sql(SQL_0230);

		expect(await catalogFingerprint(db)).toBe(before);
		expect(await count('classroom_quick_posts')).toBe(posts);
		expect(await count('classroom_quick_post_sections')).toBe(targets);
		expect(ids(await read(sam, A))).toEqual(ids(samBefore));
	});
});
