// tests/classroom-quick-post-file-routes.test.ts
//
// THE ROUTE HALF OF 0233's QUICK-POST FILES (ledger 0368, report R04), driven
// as the REAL shipped handlers against a REAL Postgres with the REAL policies
// applied (the classroom-storage-routes.test.ts shape).
//
// tests/db/classroom-quick-post-files.test.ts proves the database decides
// correctly. What it cannot see is whether the ROUTES ask, and what they hand
// back: that the sign route mints on the caller's own session (so the insert
// policy is what refuses a teacher who did not write the notice), that it
// lowercases the notice id (the record function reads the key
// case-sensitively), that an oversize file is refused before anything is
// asked of storage, that the record route answers the row the shared uploader
// reads, and that the GET is a download on every path and the same 404 for
// "not there" and "not yours".
//
// THE STORAGE STAND-IN IS THE POLICY, NOT A STUB OF IT: `createSignedUploadUrl`
// inserts into storage.objects as the caller (what storage-api evaluates), and
// `createSignedUrl` counts the caller's own SELECT, and refuses on zero.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createClassroomSection, createUser, enrollStudent, startTestDb, type SeededUser, type TestDb } from './db/harness';
import { WITH_0233 } from './db/chain-0233';
import { POST as SIGN } from '../src/routes/api/classroom/quick-post-file/sign/+server';
import { POST as RECORD } from '../src/routes/api/classroom/quick-post-file/+server';
import { GET as FILE_GET } from '../src/routes/api/classroom/quick-post-file/[file_id]/+server';

const BUCKET = 'quick-post-files';
const FAKE = '00000000-0000-4000-8000-000000000000';

let db: TestDb;
let admin: SeededUser;
let t1: SeededUser;
let t2: SeededUser;
let sam: SeededUser;
let out: SeededUser;
let A: string;
let post: string;
let storageCalls: { op: string; bucket: string; key: string; role: string; download?: string }[] = [];

type TestQuery = Parameters<Parameters<TestDb['asAnon']>[0]>[0];

function supabaseFor(userId: string | null) {
	const asCaller = <T>(run: (q: TestQuery) => Promise<T>): Promise<T> => (userId ? db.asUser(userId, run) : db.asAnon(run));
	const role = userId ? 'authenticated' : 'anon';
	return {
		storage: {
			from(bucket: string) {
				return {
					async createSignedUploadUrl(key: string) {
						storageCalls.push({ op: 'sign-upload', bucket, key, role });
						try {
							await asCaller((q) => q(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [bucket, key]));
						} catch (e) {
							return { data: null, error: { message: (e as Error).message, statusCode: 403 } };
						}
						return { data: { path: key, token: 't', signedUrl: `https://storage.test/${bucket}/${key}?upload=1` }, error: null };
					},
					async createSignedUrl(key: string, ttl: number, opts?: { download?: string }) {
						storageCalls.push({ op: 'sign-download', bucket, key, role, download: opts?.download });
						expect(ttl).toBeGreaterThan(0);
						expect(ttl).toBeLessThanOrEqual(300);
						const seen = await asCaller(async (q) => {
							const { rows } = await q<{ n: number }>(`select count(*)::int as n from storage.objects where bucket_id = $1 and name = $2`, [bucket, key]);
							return rows[0].n;
						});
						if (seen === 0) return { data: null, error: { message: 'Object not found' } };
						return { data: { signedUrl: `https://storage.test/${bucket}/${key}?download=${opts?.download ?? ''}` }, error: null };
					},
					async remove(keys: string[]) {
						for (const key of keys) storageCalls.push({ op: 'remove', bucket, key, role });
						return { data: null, error: null };
					}
				};
			}
		},
		async rpc(fn: string, args: Record<string, unknown>) {
			const call = async (sql: string, params: unknown[]) => {
				try {
					const data = await asCaller(async (q) => (await q<{ r: unknown }>(sql, params)).rows[0].r);
					return { data, error: null };
				} catch (e) {
					return { data: null, error: { message: (e as Error).message, code: (e as { code?: string }).code } };
				}
			};
			if (fn === 'classroom_quick_post_add_file') {
				expect(Object.keys(args).sort()).toEqual(['p_filename', 'p_post_id', 'p_size_bytes', 'p_storage_key']);
				return call('select public.classroom_quick_post_add_file($1::uuid, $2, $3, $4::bigint) as r', [
					args.p_post_id,
					args.p_storage_key,
					args.p_filename,
					args.p_size_bytes
				]);
			}
			if (fn === 'classroom_quick_post_file') {
				expect(Object.keys(args)).toEqual(['p_file_id']);
				return call('select public.classroom_quick_post_file($1::uuid) as r', [args.p_file_id]);
			}
			throw new Error(`unexpected rpc ${fn}`);
		}
	};
}

function eventFor(userId: string | null) {
	return { locals: { supabase: supabaseFor(userId), claims: userId ? { sub: userId, role: 'authenticated' } : null } };
}

async function postJson(handler: unknown, body: unknown, userId: string | null) {
	const res = await (handler as (event: unknown) => Promise<Response>)({
		request: new Request('http://localhost/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
		...eventFor(userId)
	});
	return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function getFile(id: string, userId: string | null): Promise<Response> {
	try {
		return await (FILE_GET as unknown as (event: unknown) => Promise<Response>)({ params: { file_id: id }, ...eventFor(userId) });
	} catch (e) {
		const r = e as { status?: number; location?: string };
		if (typeof r?.status === 'number' && typeof r?.location === 'string') {
			return new Response(null, { status: r.status, headers: { location: r.location } });
		}
		throw e;
	}
}

beforeAll(async () => {
	db = await startTestDb(WITH_0233);
	await db.sql(`grant select, insert, update, delete on storage.objects to authenticated, service_role`);
	await db.sql(`grant select on storage.objects to anon`);
	admin = await createUser(db, 'apina@boscotech.edu', 'Owner Admin');
	t1 = await createUser(db, 'tee.one@boscotech.edu', 'Tee One');
	t2 = await createUser(db, 'tee.two@boscotech.edu', 'Tee Two');
	sam = await createUser(db, 'sam@boscotech.net', 'Sam Student');
	out = await createUser(db, 'out@boscotech.net', 'Out Sider');
	A = await createClassroomSection(db, { as: admin, courseCode: 'IDEA100', courseTitle: 'Engineering I', label: 'Block 1', teacherEmail: t1.email });
	await createClassroomSection(db, { as: admin, courseCode: 'IDEA209H', courseTitle: 'Engineering II', label: 'Block 3', teacherEmail: t2.email });
	await enrollStudent(db, { as: t1, sectionId: A, email: sam.email, displayName: 'Sam Student' });
	post = await db.asUser(t1.id, async (q) => {
		const { rows } = await q<{ r: { id: string } }>('select public.classroom_quick_post_create($1::uuid[], $2, null) as r', [[A], 'Photos from the test.']);
		return rows[0].r.id;
	});
});

afterAll(async () => {
	await db?.stop();
});

describe('sign: the caller\'s own session, a lowercased key, and the size refused first', () => {
	test('no session is 401 and asks storage nothing', async () => {
		storageCalls = [];
		const res = await postJson(SIGN, { item_id: post, filename: 'rig.jpg', size_bytes: 10 }, null);
		expect(res.status).toBe(401);
		expect(storageCalls).toEqual([]);
	});

	test('the author gets a key under the notice, lowercased, on the quick-post bucket', async () => {
		storageCalls = [];
		const res = await postJson(SIGN, { item_id: post.toUpperCase(), filename: 'Rig.JPG', size_bytes: 2048 }, t1.id);
		expect(res.body.ok).toBe(true);
		expect(res.body.bucket).toBe(BUCKET);
		expect(String(res.body.key)).toMatch(new RegExp(`^${post}/[0-9a-f-]{36}\\.jpg$`));
		expect(storageCalls).toEqual([{ op: 'sign-upload', bucket: BUCKET, key: res.body.key, role: 'authenticated' }]);
	});

	test('a teacher who did not write the notice is refused by the insert policy, in the role sentence', async () => {
		storageCalls = [];
		const res = await postJson(SIGN, { item_id: post, filename: 'x.png', size_bytes: 10 }, t2.id);
		expect(res.body.ok).toBe(false);
		expect(String(res.body.error)).toContain('A file can only go on a notice you posted yourself');
		expect(storageCalls.map((c) => c.bucket)).toEqual([BUCKET]);
	});

	test('a file over 45 MB is refused with the size and the limit, before storage is asked', async () => {
		storageCalls = [];
		const res = await postJson(SIGN, { item_id: post, filename: 'big.zip', size_bytes: 47185921 }, t1.id);
		expect(res.status).toBe(413);
		expect(String(res.body.error)).toMatch(/the limit is 45 MB/);
		expect(storageCalls).toEqual([]);
		// POSITIVE CONTROL: exactly at the limit is signed.
		const at = await postJson(SIGN, { item_id: post, filename: 'big.zip', size_bytes: 47185920 }, t1.id);
		expect(at.body.ok).toBe(true);
	});
});

describe('record and open', () => {
	let key: string;
	let fileId: string;

	beforeAll(async () => {
		const signed = await postJson(SIGN, { item_id: post, filename: 'load-sheet.pdf', size_bytes: 4096 }, t1.id);
		key = String(signed.body.key);
	});

	test('the record answers the row the uploader reads, and the same key twice is the same row', async () => {
		const res = await postJson(RECORD, { item_id: post, storage_key: key, filename: 'Load sheet (final).pdf', size_bytes: 4096 }, t1.id);
		expect(res.body.ok).toBe(true);
		const file = res.body.file as { id: string; filename: string; size_bytes: number };
		expect(file.filename).toBe('Load sheet (final).pdf');
		expect(file.size_bytes).toBe(4096);
		fileId = file.id;
		const again = await postJson(RECORD, { item_id: post, storage_key: key, filename: 'other.pdf', size_bytes: 1 }, t1.id);
		expect((again.body.file as { id: string }).id).toBe(fileId);
	});

	test("a student's record is refused and a key under another notice is a 400; nothing is swept", async () => {
		storageCalls = [];
		const student = await postJson(RECORD, { item_id: post, storage_key: key, filename: 'x.pdf', size_bytes: 1 }, sam.id);
		expect(student.body.ok).toBe(false);
		expect(String(student.body.error)).toContain('Not found.');
		const wrong = await postJson(RECORD, { item_id: post, storage_key: `${FAKE}/x.pdf`, filename: 'x.pdf' }, t1.id);
		expect(wrong.status).toBe(400);
		expect(storageCalls.filter((c) => c.op === 'remove')).toEqual([]);
		expect(await postJson(RECORD, { item_id: post, storage_key: key }, null).then((r) => r.status)).toBe(401);
	});

	test('the class opens it as a DOWNLOAD (302 with download=), never inline', async () => {
		storageCalls = [];
		const res = await getFile(fileId, sam.id);
		expect(res.status).toBe(302);
		expect(res.headers.get('location')).toContain(`https://storage.test/${BUCKET}/${key}`);
		expect(storageCalls).toHaveLength(1);
		expect(storageCalls[0]).toMatchObject({ op: 'sign-download', bucket: BUCKET, role: 'authenticated' });
		// downloadFilename folds to ASCII; the name is there and is not empty.
		expect(storageCalls[0].download).toBe("Load_sheet_final_.pdf");
	});

	test('"not yours" and "not there" are the same bodyless 404; no session is 401', async () => {
		const notYours = await getFile(fileId, out.id);
		const notThere = await getFile(FAKE, sam.id);
		const malformed = await getFile('not-a-uuid', sam.id);
		expect([notYours.status, notThere.status, malformed.status]).toEqual([404, 404, 404]);
		expect([await notYours.text(), await notThere.text(), await malformed.text()]).toEqual(['Not found', 'Not found', 'Not found']);
		expect((await getFile(fileId, null)).status).toBe(401);
		// POSITIVE CONTROL: its author opens it.
		expect((await getFile(fileId, t1.id)).status).toBe(302);
	});
});
