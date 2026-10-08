// tests/db/classroom-quick-post-files.test.ts
//
// 0233 PART quick-posts (ledger 0368, report R04): longer notices, and files
// on a notice. What would fail SILENTLY, and so is asserted here:
//
//   1. THE AUDIENCE OF A FILE. A read that admits one person too many raises
//      nothing and shows nothing wrong: a file simply reaches somebody it was
//      not for. Every arm of `classroom_quick_post_file` and of the storage
//      select policy is asserted both ways (an active enrollee of A reads A's
//      file, an enrollee of B only does not, with B's own file as the
//      positive control; an inactive enrollee, an outsider, an invented id
//      and an ended notice all answer the identical 'Not found.'), and a
//      manager keeps access after the notice ends.
//   2. WHO MAY ATTACH. Only the notice's author, while it is up: an admin who
//      manages the class, a student and an invented id all answer the
//      identical 'Not found.'; a key under another notice's prefix and an
//      upper-case key are refused; the same key twice answers the row it made.
//   3. THE CEILINGS. 4000 characters through the RPC and the CHECK both,
//      4001 refused by both, and a 1000-character notice written by the
//      DEPLOYED 0230 function before the apply still reads after it; the
//      eleventh file is refused under the parent row lock.
//   4. NO ADDRESS AND NO KEY LEAVE THE READ, with the files and the two
//      capability keys asserted present beside that.
//   5. THE STORAGE HALF, its guard and its capability: the bucket is private,
//      the two policies admit exactly the author and the audience, files_ready
//      follows the insert policy, and the guarded block run by a role that
//      cannot write storage raises nothing and leaves nothing behind.
//   6. THE GRANTS OFF THE CATALOG, ONE OVERLOAD EACH, THE APPLY TOOL'S SCAN
//      AND THE PASTE TRAP OVER THIS PART, AND A SECOND APPLY THAT CHANGES
//      NOTHING.
//
// The chain is the whole tree short of 0233 (tests/db/chain-0233.ts); the
// classes and the roster are written through the real 0082 RPCs and the
// notices through the REAL 0230 classroom_quick_post_create, then 0233 is
// applied over the top. The mutation proofs (permissive direction, on this
// file only) are recorded in the round's history notes.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { scanFile } from '../../tools/apply-migration.mjs';
import { createClassroomSection, createUser, enrollStudent, startTestDb, type SeededUser, type TestDb } from './harness';
import {
	PRE_0233,
	PRE_0233_COUNT,
	SQL_0233,
	canExecute,
	catalogFingerprint,
	keysDeep,
	overloads,
	pasteTrap,
	part0233,
	refusal,
	tablePrivileges
} from './chain-0233';

const READ = 'select public.classroom_quick_posts($1::uuid) as r';
const CREATE = 'select public.classroom_quick_post_create($1::uuid[], $2, $3::timestamptz) as r';
const TAKE = 'select public.classroom_quick_post_take_down($1::uuid) as r';
const ADD = 'select public.classroom_quick_post_add_file($1::uuid, $2, $3, $4::bigint) as r';
const FILE = 'select public.classroom_quick_post_file($1::uuid) as r';
const BUCKET = 'quick-post-files';

/** Written out here rather than read from the file: a test whose expected value comes from the file cannot fail. */
const PUBLIC_FNS = [
	'classroom_quick_posts(uuid)',
	'classroom_quick_post_create(uuid[], text, timestamptz)',
	'classroom_quick_post_add_file(uuid, text, text, bigint)',
	'classroom_quick_post_file(uuid)',
	'classroom_can_read_quick_post_object(text)',
	'classroom_can_write_quick_post_object(text)'
] as const;
const PRIVATE_FNS = ['_classroom_quick_post_readable(uuid)', '_classroom_quick_post_writable(uuid)'] as const;
const FAKE = '00000000-0000-4000-8000-000000000000';
const KEY_REFUSAL = 'That storage key does not belong to this notice.';

interface FileRow {
	id: string;
	filename: string;
	size_bytes: number | null;
}
interface Post {
	id: string;
	body: string;
	files?: FileRow[];
	section_ids: string[] | null;
}
interface Board {
	ok: boolean;
	manages: boolean;
	posts: Post[];
	files_ready?: boolean;
	limits?: { max_chars: number; max_files: number; max_bytes: number };
}
interface Added {
	ok: boolean;
	already?: boolean;
	reason?: string;
	limit?: number;
	file?: FileRow;
}

let db: TestDb;
let admin: SeededUser;
let t1: SeededUser;
let t2: SeededUser;
let sam: SeededUser;
let val: SeededUser;
let ina: SeededUser;
let out: SeededUser;
/** A and B are t1's; C is t2's. */
let A: string;
let B: string;
let C: string;
/** Written by the DEPLOYED 0230 create, before 0233. */
let longPost: string;
let postA: string;
let postB: string;
let postAB: string;
let postC: string;
let postsBefore: number;

let keySeq = 0;
/** A fresh key under a post's own prefix, in the sign route's spelling. */
function keyFor(post: string, ext: string | null = 'png'): string {
	keySeq += 1;
	const tail = `${String(keySeq).padStart(8, '0')}-0000-4000-8000-00000000abcd`;
	return `${post}/${tail}${ext ? `.${ext}` : ''}`;
}

async function read(u: SeededUser, section: string): Promise<Board> {
	return db.asUser(u.id, async (q) => (await q<{ r: Board }>(READ, [section])).rows[0].r);
}
async function create(u: SeededUser, ids: string[], body: string, expires: string | null = null) {
	return db.asUser(u.id, async (q) => (await q<{ r: { ok: boolean; id?: string; reason?: string; limit?: number } }>(CREATE, [ids, body, expires])).rows[0].r);
}
async function add(u: SeededUser, post: string, key: string, name = 'diagram.png', size: number | null = 2048): Promise<Added> {
	return db.asUser(u.id, async (q) => (await q<{ r: Added }>(ADD, [post, key, name, size])).rows[0].r);
}
async function fileOf(u: SeededUser, id: string) {
	return db.asUser(u.id, async (q) => (await q<{ r: { ok: boolean; storage_key: string; filename: string } }>(FILE, [id])).rows[0].r);
}
async function putObject(u: SeededUser, key: string) {
	return db.asUser(u.id, (q) => q(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [BUCKET, key]));
}
async function seeObject(u: SeededUser, key: string): Promise<number> {
	return db.asUser(u.id, async (q) => {
		const { rows } = await q<{ n: number }>(`select count(*)::int as n from storage.objects where bucket_id = $1 and name = $2`, [BUCKET, key]);
		return rows[0].n;
	});
}
async function count(table: string): Promise<number> {
	const { rows } = await db.sql<{ n: number }>(`select count(*)::int as n from public.${table}`);
	return rows[0].n;
}
async function storagePolicies(): Promise<string> {
	const { rows } = await db.sql<{ line: string }>(
		`select policyname || ' ' || cmd || ' ' || array_to_string(roles, ',') || ' ' || coalesce(qual, '') || ' ' || coalesce(with_check, '') as line
		 from pg_catalog.pg_policies where schemaname = 'storage' and tablename = 'objects' order by 1`
	);
	return rows.map((r) => r.line).join('\n');
}

beforeAll(async () => {
	db = await startTestDb(PRE_0233);
	// The table grants a real project hands the client roles and the stub
	// does not (the classroom-submission-file-boundary shape): without them a
	// storage refusal is a missing privilege and proves nothing about a policy.
	await db.sql(`grant select, insert, update, delete on storage.objects to authenticated, service_role`);
	await db.sql(`grant select on storage.objects to anon`);

	admin = await createUser(db, 'apina@boscotech.edu', 'Owner Admin');
	t1 = await createUser(db, 'tee.one@boscotech.edu', 'Tee One');
	t2 = await createUser(db, 'tee.two@boscotech.edu', 'Tee Two');
	sam = await createUser(db, 'sam@boscotech.net', 'Sam Student');
	val = await createUser(db, 'val@boscotech.net', 'Val Student');
	ina = await createUser(db, 'ina@boscotech.net', 'Ina Inactive');
	out = await createUser(db, 'out@boscotech.net', 'Out Sider');

	A = await createClassroomSection(db, { as: admin, courseCode: 'IDEA100', courseTitle: 'Engineering I', label: 'Block 1', teacherEmail: t1.email });
	B = await createClassroomSection(db, { as: admin, courseCode: 'IDEA100', courseTitle: 'Engineering I', label: 'Block 2', teacherEmail: t1.email });
	C = await createClassroomSection(db, { as: admin, courseCode: 'IDEA209H', courseTitle: 'Engineering II Honors', label: 'Block 3', teacherEmail: t2.email });
	await enrollStudent(db, { as: t1, sectionId: A, email: sam.email, displayName: 'Sam Student' });
	await enrollStudent(db, { as: t1, sectionId: B, email: val.email, displayName: 'Val Student' });
	await enrollStudent(db, { as: t1, sectionId: A, email: ina.email, displayName: 'Ina Inactive' });
	await enrollStudent(db, { as: t1, sectionId: A, email: ina.email, displayName: 'Ina Inactive', active: false });

	// THROUGH THE DEPLOYED 0230 CREATE, including a notice at its old ceiling.
	const long = await create(t1, [A], 'x'.repeat(999) + '.');
	expect(long).toMatchObject({ ok: true });
	longPost = long.id!;
	expect(await create(t1, [A], 'y'.repeat(1001))).toEqual({ ok: false, reason: 'too_long', limit: 1000 });
	postA = (await create(t1, [A], 'Bring your calipers.')).id!;
	postB = (await create(t1, [B], 'Block 2 only.')).id!;
	postAB = (await create(t1, [A, B], 'Both blocks.')).id!;
	postC = (await create(t2, [C], 'Block 3.')).id!;
	postsBefore = await count('classroom_quick_posts');

	await db.sql(SQL_0233);
});

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
describe('the apply over notices the deployed 0230 wrote', () => {
	test(`it lands on the whole pre-0233 chain (${PRE_0233_COUNT} files) and leaves every notice alone`, async () => {
		expect(PRE_0233_COUNT).toBeGreaterThan(200);
		expect(await count('classroom_quick_posts')).toBe(postsBefore);
		expect(await count('classroom_quick_post_files')).toBe(0);
		const board = await read(sam, A);
		const long = board.posts.find((p) => p.id === longPost);
		expect(long?.body.length).toBe(1000);
		expect(long?.files).toEqual([]);
	});

	test('the body ceiling is 4000 through the RPC and through the CHECK, both ways', async () => {
		const ok = await create(t1, [A], 'z'.repeat(4000));
		expect(ok.ok).toBe(true);
		expect(await create(t1, [A], 'z'.repeat(4001))).toEqual({ ok: false, reason: 'too_long', limit: 4000 });
		// The CHECK alone, as the connection owner (no RPC, no RLS in the way).
		const insert = (n: number) =>
			db.sql(`insert into public.classroom_quick_posts (author_email, body) values ('tee.one@boscotech.edu', $1)`, [
				'w'.repeat(n)
			]);
		expect(await refusal(() => insert(4001))).toMatch(/classroom_quick_posts_body_shape/);
		expect(await refusal(() => insert(4000))).toBeNull();
		await db.sql(`delete from public.classroom_quick_posts where body = $1`, ['w'.repeat(4000)]);
		// Take the 4000 notice down again so later counts read only the fixtures.
		await db.asUser(t1.id, (q) => q(TAKE, [ok.id]));
	});
});

// ===========================================================================
describe('who may attach a file', () => {
	test('the author, while the notice is up; the same key twice answers the same row', async () => {
		const key = keyFor(postA);
		const first = await add(t1, postA, key, '  diagram.png  ');
		expect(first).toMatchObject({ ok: true, already: false, file: { filename: 'diagram.png', size_bytes: 2048 } });
		const again = await add(t1, postA, key, 'other.png');
		expect(again).toMatchObject({ ok: true, already: true, file: { id: first.file!.id, filename: 'diagram.png' } });
		expect(await count('classroom_quick_post_files')).toBe(1);
	});

	test('anybody else is the identical "Not found.", an admin who manages the class included', async () => {
		const key = keyFor(postA);
		const answers = await Promise.all([
			refusal(() => add(admin, postA, key)),
			refusal(() => add(t2, postA, key)),
			refusal(() => add(sam, postA, key)),
			refusal(() => add(t1, FAKE, `${FAKE}/00000001-0000-4000-8000-00000000abcd.png`))
		]);
		expect(answers).toEqual(['Not found.', 'Not found.', 'Not found.', 'Not found.']);
		// POSITIVE CONTROL: the same key from the author lands.
		expect((await add(t1, postA, key)).ok).toBe(true);
	});

	test("a key that is not this notice's is refused: another prefix, upper case, a path, no uuid", async () => {
		const otherPrefix = keyFor(postB);
		const upper = keyFor(postA).toUpperCase().replace(postA.toUpperCase(), postA);
		const cases = [otherPrefix, upper, `${postA}/nested/${FAKE}.png`, `${postA}/diagram.png`, `${postA}.png`];
		for (const key of cases) expect(await refusal(() => add(t1, postA, key)), key).toBe(KEY_REFUSAL);
		// A key with no extension at all is fine (a file named "Makefile").
		expect((await add(t1, postA, keyFor(postA, null), 'Makefile')).ok).toBe(true);
	});

	test('a blank name becomes "file", a long one is cut at 255, and a negative size raises', async () => {
		const blank = await add(t1, postA, keyFor(postA), ' \n\t ');
		expect(blank.file?.filename).toBe('file');
		const long = await add(t1, postA, keyFor(postA), 'n'.repeat(300));
		expect(long.file?.filename).toHaveLength(255);
		expect(await refusal(() => add(t1, postA, keyFor(postA), 'x.png', -1))).toBe('A file size cannot be negative.');
	});

	test('ten files, then the eleventh is refused with the limit', async () => {
		const post = (await create(t1, [B], 'Ten pictures.')).id!;
		for (let i = 0; i < 10; i++) expect((await add(t1, post, keyFor(post))).ok, `file ${i + 1}`).toBe(true);
		expect(await add(t1, post, keyFor(post))).toEqual({ ok: false, reason: 'too_many_files', limit: 10 });
		const { rows } = await db.sql<{ n: number; max: number }>(
			`select count(*)::int as n, max(sort_order) as max from public.classroom_quick_post_files where post_id = $1`,
			[post]
		);
		expect(rows[0]).toEqual({ n: 10, max: 10 });
		await db.asUser(t1.id, (q) => q(TAKE, [post]));
	});

	test('an ended or taken-down notice takes no new file, and says so', async () => {
		const ended = (await create(t1, [A], 'Ends.')).id!;
		await db.sql(
			`update public.classroom_quick_posts set created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' where id = $1`,
			[ended]
		);
		expect(await add(t1, ended, keyFor(ended))).toEqual({ ok: false, reason: 'ended' });
		const down = (await create(t1, [A], 'Down.')).id!;
		await db.asUser(t1.id, (q) => q(TAKE, [down]));
		expect(await add(t1, down, keyFor(down))).toEqual({ ok: false, reason: 'ended' });
	});
});

// ===========================================================================
describe('who may open a file', () => {
	let onA: string;
	let onB: string;
	let onAB: string;

	beforeAll(async () => {
		onA = (await add(t1, postA, keyFor(postA), 'a.pdf')).file!.id;
		onB = (await add(t1, postB, keyFor(postB), 'b.pdf')).file!.id;
		onAB = (await add(t1, postAB, keyFor(postAB), 'ab.pdf')).file!.id;
	});

	test("an active enrollee reads their class's files and not another class's", async () => {
		expect((await fileOf(sam, onA)).filename).toBe('a.pdf');
		expect((await fileOf(sam, onAB)).filename).toBe('ab.pdf');
		expect(await refusal(() => fileOf(sam, onB))).toBe('Not found.');
		// POSITIVE CONTROL: B's own enrollee reads B's file.
		expect((await fileOf(val, onB)).filename).toBe('b.pdf');
		expect(await refusal(() => fileOf(val, onA))).toBe('Not found.');
	});

	test('an inactive enrollee, an outsider, another teacher and an invented id are all the same "Not found."', async () => {
		const answers = [
			await refusal(() => fileOf(ina, onA)),
			await refusal(() => fileOf(out, onA)),
			await refusal(() => fileOf(t2, onA)),
			await refusal(() => fileOf(sam, FAKE))
		];
		expect(answers).toEqual(['Not found.', 'Not found.', 'Not found.', 'Not found.']);
	});

	test('once a notice is taken down a student loses it and its managers keep it', async () => {
		const post = (await create(t1, [A], 'Temporary.')).id!;
		const file = (await add(t1, post, keyFor(post), 't.pdf')).file!.id;
		expect((await fileOf(sam, file)).ok).toBe(true);
		await db.asUser(t1.id, (q) => q(TAKE, [post]));
		expect(await refusal(() => fileOf(sam, file))).toBe('Not found.');
		expect((await fileOf(t1, file)).ok).toBe(true);
		expect((await fileOf(admin, file)).ok).toBe(true);
	});

	test('the storage key comes back only to the route that signs it, never in the board', async () => {
		const opened = await fileOf(sam, onA);
		expect(opened.storage_key.startsWith(`${postA}/`)).toBe(true);
		for (const reader of [sam, t1]) {
			const board = await read(reader, A);
			const keys = keysDeep(board);
			expect(keys.has('storage_key'), reader.email).toBe(false);
			expect(keys.has('author_email'), reader.email).toBe(false);
			expect(keys.has('uploaded_by'), reader.email).toBe(false);
			// POSITIVE CONTROL: the files ARE there, with what a card needs.
			const files = board.posts.find((p) => p.id === postA)?.files ?? [];
			expect(files.length).toBeGreaterThan(0);
			expect(Object.keys(files[0]).sort()).toEqual(['filename', 'id', 'size_bytes']);
		}
		expect(JSON.stringify(await read(t1, A))).not.toContain('boscotech');
	});

	test('the board carries files_ready and the limits', async () => {
		const board = await read(sam, A);
		expect(board.files_ready).toBe(true);
		expect(board.limits).toEqual({ max_chars: 4000, max_files: 10, max_bytes: 47185920 });
	});
});

// ===========================================================================
describe('the bucket and its two policies', () => {
	test('the bucket is private, unlisted, at the portal ceiling', async () => {
		const { rows } = await db.sql(`select public, file_size_limit::bigint as limit, allowed_mime_types from storage.buckets where id = $1`, [BUCKET]);
		expect(rows).toEqual([{ public: false, limit: '47185920', allowed_mime_types: null }]);
	});

	test('the author may put an object under their notice; nobody else may', async () => {
		const mine = keyFor(postA);
		expect(await refusal(() => putObject(t1, mine))).toBeNull();
		for (const u of [t2, sam, admin]) {
			expect(await refusal(() => putObject(u, keyFor(postA))), u.email).toMatch(/row-level security/);
		}
		// Under another teacher's notice the author of THIS one is refused too.
		expect(await refusal(() => putObject(t1, keyFor(postC)))).toMatch(/row-level security/);
		// POSITIVE CONTROL: that teacher puts it under their own.
		expect(await refusal(() => putObject(t2, keyFor(postC)))).toBeNull();
		// A key with no uuid prefix fails closed.
		expect(await refusal(() => putObject(t1, 'loose.png'))).toMatch(/row-level security/);
	});

	test("the class reads the object; another class, an inactive enrollee and anon do not", async () => {
		const key = keyFor(postA);
		await putObject(t1, key);
		expect(await seeObject(sam, key)).toBe(1);
		expect(await seeObject(t1, key)).toBe(1);
		expect(await seeObject(val, key)).toBe(0);
		expect(await seeObject(ina, key)).toBe(0);
		expect(await seeObject(out, key)).toBe(0);
		const anon = await db.asAnon(async (q) => (await q<{ n: number }>(`select count(*)::int as n from storage.objects where bucket_id = $1`, [BUCKET])).rows[0].n);
		expect(anon).toBe(0);
		// POSITIVE CONTROL for the B reader: B's own object.
		const keyB = keyFor(postB);
		await putObject(t1, keyB);
		expect(await seeObject(val, keyB)).toBe(1);
	});

	test('no policy on this bucket names anon or public, and there is no update or delete policy', async () => {
		const { rows } = await db.sql<{ policyname: string; cmd: string; roles: string[] }>(
			`select policyname, cmd, roles::text[] as roles from pg_catalog.pg_policies
			 where schemaname = 'storage' and tablename = 'objects' and (coalesce(qual, '') || coalesce(with_check, '')) like '%quick-post-files%'
			 order by policyname`
		);
		expect(rows).toEqual([
			{ policyname: 'quick post files insert by author', cmd: 'INSERT', roles: ['authenticated'] },
			{ policyname: 'quick post files readable by the class', cmd: 'SELECT', roles: ['authenticated'] }
		]);
	});
});

// ===========================================================================
describe('the catalog', () => {
	test('the file table: RLS on, no policy, no privilege for anon or authenticated', async () => {
		const { rows } = await db.sql<{ rls: boolean; policies: number }>(
			`select c.relrowsecurity as rls,
			        (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
			 from pg_class c join pg_namespace n on n.oid = c.relnamespace
			 where n.nspname = 'public' and c.relname = 'classroom_quick_post_files'`
		);
		expect(rows[0]).toEqual({ rls: true, policies: 0 });
		expect(await tablePrivileges(db, 'anon', 'classroom_quick_post_files')).toEqual([]);
		expect(await tablePrivileges(db, 'authenticated', 'classroom_quick_post_files')).toEqual([]);
		expect(await refusal(() => db.asUser(t1.id, (q) => q(`select * from public.classroom_quick_post_files`)))).toMatch(/permission denied/);
		// POSITIVE CONTROL for the privilege reader: 0053's table grant is visible.
		expect(await tablePrivileges(db, 'authenticated', 'app_feedback')).toEqual(['select', 'insert']);
	});

	test('one overload each; anon executes none; authenticated the public six and not the private two', async () => {
		for (const fn of [...PUBLIC_FNS, ...PRIVATE_FNS]) {
			expect(await overloads(db, fn.split('(')[0]), fn).toBe(1);
			expect(await canExecute(db, 'anon', fn), `anon ${fn}`).toBe(false);
		}
		for (const fn of PUBLIC_FNS) expect(await canExecute(db, 'authenticated', fn), fn).toBe(true);
		for (const fn of PRIVATE_FNS) expect(await canExecute(db, 'authenticated', fn), fn).toBe(false);
	});

	test('anon cannot call the attach or the open', async () => {
		for (const [sql, params] of [
			[ADD, [postA, keyFor(postA), 'x.png', 1]],
			[FILE, [FAKE]]
		] as [string, unknown[]][]) {
			expect(await refusal(() => db.asAnon((q) => q(sql, params)))).toMatch(/permission denied/);
		}
	});

	test("the apply tool's scan finds nothing to refuse or warn about in this part, against a planted control", () => {
		const part = part0233('quick-posts');
		expect(part).not.toBeNull();
		const findings = scanFile(part!).findings;
		expect(findings).toEqual([]);
		const planted = scanFile(part! + `\ninsert into storage.buckets (id, name) values ('x', 'x');\n`).findings;
		expect(planted.map((f: { what: string }) => f.what)).toEqual(['top-level DML']);
	});

	test('no dollar sign in a comment, every dollar tag balanced, against a planted control', () => {
		const part = part0233('quick-posts')!;
		expect(pasteTrap(part)).toEqual([]);
		expect(pasteTrap(part + '\n-- costs $5\n').length).toBeGreaterThan(0);
		// The probe-marker rules from the round contract.
		expect(part).not.toMatch(/information_schema/);
		expect(part.split('\n').filter((l) => l.trim().startsWith('--')).join('\n')).not.toMatch(/create or replace function/i);
	});
});

// ===========================================================================
describe('the capability and the guard', () => {
	test('files_ready follows the insert policy, and a second apply restores it and changes nothing else', async () => {
		const before = await catalogFingerprint(db);
		const policiesBefore = await storagePolicies();
		await db.sql(`drop policy "quick post files insert by author" on storage.objects`);
		expect((await read(sam, A)).files_ready).toBe(false);
		await db.sql(SQL_0233);
		expect((await read(sam, A)).files_ready).toBe(true);
		expect(await catalogFingerprint(db)).toBe(before);
		expect(await storagePolicies()).toBe(policiesBefore);
	});

	test('the storage block run by a role that cannot write storage raises nothing and leaves nothing behind', async () => {
		const part = part0233('quick-posts')!;
		const start = part.indexOf('do $qp$\nbegin\n\tbegin\n\t\tinsert into storage.buckets');
		const end = part.indexOf('$qp$;', start) + '$qp$;'.length;
		expect(start).toBeGreaterThan(-1);
		const block = part.slice(start, end);
		// Clear the storage half as the owner, then run the block as a role with
		// no privilege on storage.buckets and no ownership of storage.objects.
		await db.sql(`drop policy "quick post files insert by author" on storage.objects`);
		await db.sql(`drop policy "quick post files readable by the class" on storage.objects`);
		await db.sql(`delete from storage.objects where bucket_id = $1`, [BUCKET]);
		await db.sql(`delete from storage.buckets where id = $1`, [BUCKET]);
		expect(await db.asAnon((q) => q(block))).toBeTruthy();
		const { rows } = await db.sql<{ n: number }>(`select count(*)::int as n from storage.buckets where id = $1`, [BUCKET]);
		expect(rows[0].n).toBe(0);
		expect(await storagePolicies()).not.toMatch(/quick post files/);
		expect((await read(sam, A)).files_ready).toBe(false);
		// POSITIVE CONTROL: the same block as the owner lands all of it.
		await db.sql(block);
		expect(await storagePolicies()).toMatch(/quick post files insert by author/);
		expect((await read(sam, A)).files_ready).toBe(true);
	});
});
