// tests/classroom-storage-routes.test.ts
//
// THE ROUTE HALF of 0133/0135, driven as the REAL shipped handlers against a
// REAL Postgres with the REAL policies applied.
//
// WHY THIS FILE EXISTS SEPARATELY FROM tests/classroom-instructor-storage.test.ts.
// That file proves the DATABASE decides correctly: which role may select which
// object, what the public payload projects, which buckets no `anon` policy
// names. It cannot see whether the ROUTES ask. And that is exactly where the
// two live failures of this bundle were:
//
//   - `/api/classroom/attachment/[id]?public=1` resolved the row through
//     `classroom_public_attachment` and then read `drive_file_id` only, so a
//     storage-backed attachment on a published public material answered 404 to
//     the entire audience it was published for -- while answering perfectly for
//     any signed-in teacher testing it, because they never take that branch.
//   - `/api/classroom/instructor-attachment` was still a multipart POST through
//     the function, so an answer key was capped at 4 MiB and filtered by a
//     twelve-type allowlist, on the one surface no student ever sees.
//
// Both are invisible from the inside. Both are what this file asks about.
//
// THE STORAGE SHIM IS THE POLICY, NOT A STUB OF IT. `createSignedUrl` here does
// what storage-api does: it evaluates the caller's own SELECT on
// `storage.objects` and refuses when the caller cannot see the object. So a
// route that mints a URL it should not have minted fails here on the real
// policy, under the real role -- `anon` for a signed-out request, exactly as a
// signed-out browser arrives. Every bucket the routes touch is recorded, so
// "nothing else became readable" is a counted assertion rather than a hope.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import { DRIVE_ENDPOINTS } from '../src/lib/server/notebook-drive';
import { GET as ATTACHMENT_GET } from '../src/routes/api/classroom/attachment/[attachment_id]/+server';
import { GET as INSTRUCTOR_GET } from '../src/routes/api/classroom/instructor-attachment/[attachment_id]/+server';
import { POST as INSTRUCTOR_RECORD } from '../src/routes/api/classroom/instructor-attachment/+server';
import { POST as INSTRUCTOR_SIGN } from '../src/routes/api/classroom/instructor-attachment/sign/+server';

const MIGRATIONS = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0086_classroom_assignment_engine.sql',
	'0090_classroom_instructor_materials.sql',
	'0092_classroom_reference_specs.sql',
	'0101_classroom_decks.sql',
	'0108_classroom_rich_body.sql',
	'0109_classroom_scheduled_posting.sql',
	'0133_classroom_storage_attachments.sql',
	'0134_classroom_submission_open_race.sql',
	'0135_classroom_instructor_storage_and_public_attachments.sql'
] as const;

const ATTACHMENT_BUCKET = 'classroom-attachments';
const INSTRUCTOR_BUCKET = 'instructor-attachments';
const SUBMISSION_BUCKET = 'submission-files';

let db: TestDb;
let drive: Server;

let teacherA: SeededUser;
let teacherB: SeededUser;
let alice: SeededUser; // enrolled in P1
let visitor: SeededUser; // signed in, enrolled in nothing

let p1: string;
let publicDoc: string; // published, is_public
let privateDoc: string; // published, NOT public
let draftPublicDoc: string; // is_public but NOT published
let posted: string; // published assignment, not public

/** Attachment ids, by what they are backing on and what they hang off. */
let publicStorageAttachment: string;
let publicDriveAttachment: string;
let privateStorageAttachment: string;
let draftStorageAttachment: string;

const DRIVE_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3, 4]);

/**
 * EVERY BUCKET THE ROUTES REACHED FOR, in order, with the operation. The
 * "nothing else became readable" assertions read this: a route that so much as
 * ASKED storage about `submission-files` on a public request would show up here
 * even if the policy then refused it.
 */
let storageCalls: { op: string; bucket: string; key: string; role: string }[] = [];

async function rpc<T = Record<string, unknown>>(
	userId: string,
	call: string,
	params: unknown[]
): Promise<T> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
		return rows[0].result;
	});
}

async function seedObject(bucket: string, key: string): Promise<void> {
	await db.sql(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [bucket, key]);
}

/**
 * A Supabase-client stand-in over the real database. `userId` null means NO
 * SESSION, and every read then runs as `anon` -- the role a signed-out browser
 * actually arrives as, which is the whole question on the public branch.
 */
function supabaseFor(userId: string | null) {
	const asCaller = <T>(run: (q: TestQuery) => Promise<T>): Promise<T> =>
		userId ? db.asUser(userId, run) : db.asAnon(run);
	const role = userId ? 'authenticated' : 'anon';

	return {
		from(table: string) {
			return {
				select(columns: string) {
					// PINNED TO WHAT THE ROUTE ASKS FOR, so editing the route's read
					// fails here loudly instead of quietly proving something else.
					expect(
						['classroom_attachments', 'classroom_instructor_attachments'],
						`unexpected table ${table}`
					).toContain(table);
					const wide = columns.includes('storage_key');
					return {
						eq(column: string, value: string) {
							expect(column).toBe('id');
							return {
								async maybeSingle() {
									return asCaller(async (q) => {
										const cols = wide
											? 'drive_file_id, storage_key, filename, mime_type'
											: 'drive_file_id, filename, mime_type';
										const { rows } = await q<Record<string, unknown>>(
											`select ${cols} from public.${table} where id = $1`,
											[value]
										);
										return { data: rows[0] ?? null, error: null };
									});
								}
							};
						}
					};
				}
			};
		},

		storage: {
			from(bucket: string) {
				return {
					/**
					 * What storage-api does: evaluate the caller's own SELECT policy
					 * on the object, and refuse if they cannot see it. That is what
					 * makes a mint here a real authorization result rather than a
					 * string we made up.
					 */
					async createSignedUrl(key: string, ttl: number, opts?: { download?: string }) {
						storageCalls.push({ op: 'sign-download', bucket, key, role });
						expect(ttl, 'download URLs must be short-lived').toBeGreaterThan(0);
						expect(ttl, 'download URLs must be short-lived').toBeLessThanOrEqual(300);
						// EVERY read on every bucket is a download, on every branch.
						expect(opts?.download, `no download= on ${bucket}/${key}`).toBeTruthy();
						const seen = await asCaller(async (q) => {
							const { rows } = await q<{ n: string }>(
								`select count(*)::text as n from storage.objects
								 where bucket_id = $1 and name = $2`,
								[bucket, key]
							);
							return Number(rows[0].n);
						});
						if (seen === 0) {
							return { data: null, error: { message: 'Object not found' } };
						}
						return {
							data: { signedUrl: `https://storage.test/${bucket}/${key}?token=signed` },
							error: null
						};
					},
					async createSignedUploadUrl(key: string) {
						storageCalls.push({ op: 'sign-upload', bucket, key, role });
						// storage-api evaluates the INSERT policy before minting.
						try {
							await asCaller(async (q) => {
								await q(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [
									bucket,
									key
								]);
							});
						} catch (e) {
							return { data: null, error: { message: (e as Error).message, statusCode: 403 } };
						}
						return {
							data: {
								path: key,
								token: 'upload-token',
								signedUrl: `https://storage.test/${bucket}/${key}?upload=1`
							},
							error: null
						};
					},
					async remove(keys: string[]) {
						for (const key of keys) storageCalls.push({ op: 'remove', bucket, key, role });
						return { data: null, error: null };
					}
				};
			}
		},

		async rpc(fn: string, args: Record<string, unknown>) {
			if (fn === 'classroom_public_attachment') {
				const data = await asCaller(async (q) => {
					const { rows } = await q<{ result: unknown }>(
						'select public.classroom_public_attachment($1::uuid) as result',
						[args.p_attachment_id]
					);
					return rows[0].result;
				});
				return { data, error: null };
			}
			if (fn === 'classroom_add_instructor_attachment') {
				try {
					const data = await rpc(
						userId as string,
						`public.classroom_add_instructor_attachment($1::uuid, $2, $3, $4, $5::bigint, $6)`,
						[
							args.p_item_id,
							args.p_drive_file_id,
							args.p_filename,
							args.p_mime_type,
							args.p_size_bytes,
							args.p_storage_key
						]
					);
					return { data, error: null };
				} catch (e) {
					return { data: null, error: { message: (e as Error).message } };
				}
			}
			throw new Error(`unexpected rpc ${fn}`);
		}
	};
}

type TestQuery = Parameters<Parameters<TestDb['asAnon']>[0]>[0];

function eventFor(userId: string | null) {
	return {
		locals: {
			supabase: supabaseFor(userId),
			claims: userId ? { sub: userId, role: 'authenticated' } : null
		}
	};
}

/** The REAL attachment GET, called the way SvelteKit would. */
async function getAttachment(
	attachmentId: string,
	userId: string | null,
	isPublic = false
): Promise<Response> {
	const url = new URL(`http://localhost/api/classroom/attachment/${attachmentId}`);
	if (isPublic) url.searchParams.set('public', '1');
	try {
		return await (ATTACHMENT_GET as unknown as (event: unknown) => Promise<Response>)({
			params: { attachment_id: attachmentId },
			url,
			...eventFor(userId)
		});
	} catch (e) {
		// SvelteKit's `redirect()` throws; the harness has to unwrap it the way
		// the framework does, or a 302 would read as a crash.
		return asRedirect(e);
	}
}

async function getInstructorAttachment(id: string, userId: string | null): Promise<Response> {
	try {
		return await (INSTRUCTOR_GET as unknown as (event: unknown) => Promise<Response>)({
			params: { attachment_id: id },
			...eventFor(userId)
		});
	} catch (e) {
		return asRedirect(e);
	}
}

function asRedirect(e: unknown): Response {
	const r = e as { status?: number; location?: string };
	if (typeof r?.status === 'number' && typeof r?.location === 'string') {
		return new Response(null, { status: r.status, headers: { location: r.location } });
	}
	throw e;
}

async function postJson(
	handler: unknown,
	body: unknown,
	userId: string | null
): Promise<{ status: number; body: Record<string, unknown> }> {
	const res = await (handler as (event: unknown) => Promise<Response>)({
		request: new Request('http://localhost/x', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}),
		...eventFor(userId)
	});
	return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeAll(async () => {
	// --- mock Drive, so the LEGACY branch is exercised for real ------------
	drive = createServer((req, res) => {
		const url = new URL(req.url ?? '/', 'http://127.0.0.1');
		if (url.pathname === '/token') {
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ access_token: 'test-access-token', expires_in: 3600 }));
			return;
		}
		if (url.pathname.startsWith('/files/')) {
			res.writeHead(200, {
				'content-type': 'application/pdf',
				'content-length': String(DRIVE_BYTES.length)
			});
			res.end(Buffer.from(DRIVE_BYTES));
			return;
		}
		res.writeHead(404);
		res.end();
	});
	await new Promise<void>((resolve) => drive.listen(0, '127.0.0.1', resolve));
	const { port } = drive.address() as AddressInfo;
	DRIVE_ENDPOINTS.token = `http://127.0.0.1:${port}/token`;
	DRIVE_ENDPOINTS.files = `http://127.0.0.1:${port}/files`;
	process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id';
	process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
	process.env.GOOGLE_DRIVE_REFRESH_TOKEN = 'test-refresh-token';

	db = await startTestDb(MIGRATIONS);

	await db.sql(
		`grant select, insert, update, delete on storage.objects to authenticated, service_role`
	);
	// `anon` gets SELECT and nothing else, so every absence below is a POLICY
	// decision rather than a missing grant.
	await db.sql(`grant select on storage.objects to anon`);
	await db.sql(`grant select on storage.buckets to authenticated, anon, service_role`);

	teacherA = await createUser(db, 'tvargas@boscotech.edu', 'T. Vargas');
	teacherB = await createUser(db, 'mreed@boscotech.edu', 'M. Reed');
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	visitor = await createUser(db, 'someone@gmail.com', 'A Visitor');

	const courseId = (
		await rpc<{ course_id: string }>(teacherA.id, 'public.classroom_upsert_course($1, $2)', [
			'IDEA100',
			'Intro to Engineering Design'
		])
	).course_id;
	p1 = (
		await rpc<{ section_id: string }>(
			teacherA.id,
			'public.classroom_upsert_section($1::uuid, $2, $3)',
			[courseId, 'Period 1', 'Block A']
		)
	).section_id;

	await rpc(teacherA.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
		p1,
		alice.email,
		'Alice Alvarez',
		true
	]);

	const material = async (title: string, isPublic: boolean, published = true) => {
		const id = (
			await rpc<{ item_id: string }>(
				teacherA.id,
				`public.classroom_create_item('material', array[$1::uuid], $2, 'Reference.', null, null, null, $3, null, false)`,
				[p1, title, published]
			)
		).item_id;
		if (isPublic) {
			await db.sql('update public.classroom_items set is_public = true where id = $1', [id]);
		}
		return id;
	};
	publicDoc = await material('Unit 1 Reference', true);
	privateDoc = await material('Internal Notes', false);
	draftPublicDoc = await material('Not ready', true, false);

	posted = (
		await rpc<{ item_id: string }>(
			teacherA.id,
			`public.classroom_create_item('assignment', array[$1::uuid], 'Bracket hand-in', 'Do the work.', 30, null, null, true, '[]'::jsonb, false)`,
			[p1]
		)
	).item_id;

	/** Attaches a STORAGE-backed file and seeds the object behind it. */
	const attachStorage = async (itemId: string, name: string, key: string) => {
		const made = await rpc<{ attachment_id: string }>(
			teacherA.id,
			`public.classroom_add_attachment($1::uuid, null, $2, 'application/octet-stream', 2048, $3)`,
			[itemId, name, key]
		);
		await seedObject(ATTACHMENT_BUCKET, key);
		return made.attachment_id;
	};

	publicStorageAttachment = await attachStorage(
		publicDoc,
		'Unit 1 handout.pdf',
		`${publicDoc}/aaaa1111.pdf`
	);
	privateStorageAttachment = await attachStorage(
		privateDoc,
		'internal.pdf',
		`${privateDoc}/bbbb2222.pdf`
	);
	draftStorageAttachment = await attachStorage(
		draftPublicDoc,
		'later.pdf',
		`${draftPublicDoc}/cccc3333.pdf`
	);

	// The legacy shape, untouched by either migration: a Drive id and no key.
	publicDriveAttachment = (
		await rpc<{ attachment_id: string }>(
			teacherA.id,
			`public.classroom_add_attachment($1::uuid, 'drive-legacy-public', 'syllabus.pdf', 'application/pdf', 4096)`,
			[publicDoc]
		)
	).attachment_id;
}, 180_000);

afterAll(async () => {
	await db?.stop();
	await new Promise<void>((resolve) => drive?.close(() => resolve()));
});

// ---------------------------------------------------------------------------
// ITEM 2: the public serve route
// ---------------------------------------------------------------------------

describe('a public material serves its storage-backed attachment with no session', () => {
	test('signed out, ?public=1: 302 to a short-lived signed URL', async () => {
		storageCalls = [];
		const res = await getAttachment(publicStorageAttachment, null, true);

		expect(res.status, 'signed-out public read').toBe(302);
		expect(res.headers.get('location')).toContain(
			`${ATTACHMENT_BUCKET}/${publicDoc}/aaaa1111.pdf`
		);

		// The mint happened as `anon`, on the classroom bucket, and nowhere else.
		expect(storageCalls).toHaveLength(1);
		expect(storageCalls[0]).toMatchObject({
			op: 'sign-download',
			bucket: ATTACHMENT_BUCKET,
			role: 'anon'
		});
	});

	test('POSITIVE CONTROL: the same route still 302s for the signed-in manager', async () => {
		storageCalls = [];
		const res = await getAttachment(publicStorageAttachment, teacherA.id);
		expect(res.status).toBe(302);
		expect(storageCalls.map((c) => c.role)).toEqual(['authenticated']);
	});

	test('a signed-in visitor enrolled in nothing reads it too', async () => {
		// The case the enrolled-reader policy alone refuses. Being signed in is
		// not being enrolled, and a public document is public.
		const viaPublic = await getAttachment(publicStorageAttachment, visitor.id, true);
		expect(viaPublic.status, 'visitor, ?public=1').toBe(302);

		// And WITHOUT the flag they are correctly refused, which is what proves
		// the flag is narrowing to the public rule rather than skipping a check.
		const viaNormal = await getAttachment(publicStorageAttachment, visitor.id);
		expect(viaNormal.status, 'visitor, no flag').toBe(404);
	});

	test('the legacy Drive-backed public attachment still serves, byte for byte', async () => {
		storageCalls = [];
		const res = await getAttachment(publicDriveAttachment, null, true);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('application/pdf');
		expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual(Array.from(DRIVE_BYTES));
		// It never asked storage anything.
		expect(storageCalls, 'Drive row must not touch storage').toHaveLength(0);
	});

	test('signed out with NO ?public=1 is still 401', async () => {
		storageCalls = [];
		const res = await getAttachment(publicStorageAttachment, null);
		expect(res.status).toBe(401);
		expect(storageCalls).toHaveLength(0);
	});
});

describe('PROVING THE NEGATIVES, each beside a live positive control', () => {
	test('a PRIVATE item’s attachment refuses a signed-out ?public=1 read', async () => {
		// CONTROL: the manager gets it through the ordinary branch, so a 404
		// below is a policy decision and not a missing row or a typo'd key.
		expect((await getAttachment(privateStorageAttachment, teacherA.id)).status).toBe(302);

		storageCalls = [];
		const res = await getAttachment(privateStorageAttachment, null, true);
		expect(res.status, 'signed out, private item').toBe(404);
		// The payload refused, so the route never even reached for storage.
		expect(storageCalls, 'no mint attempted').toHaveLength(0);
	});

	test('an UNPUBLISHED public material refuses a signed-out ?public=1 read', async () => {
		expect((await getAttachment(draftStorageAttachment, teacherA.id)).status).toBe(302);

		storageCalls = [];
		const res = await getAttachment(draftStorageAttachment, null, true);
		expect(res.status, 'signed out, unpublished public material').toBe(404);
		expect(storageCalls).toHaveLength(0);
	});

	test('the enrolled student reads the class handout and NOT the private one', async () => {
		// Alice is enrolled in P1. Both materials are posted to P1, so this is
		// the sharpest form of the question: publishing, not enrolment, is what
		// the public flag governs -- and the private one is still hers to read
		// because she IS enrolled. That is the control that makes the signed-out
		// 404 above mean what it says.
		expect((await getAttachment(publicStorageAttachment, alice.id)).status).toBe(302);
		expect((await getAttachment(privateStorageAttachment, alice.id)).status).toBe(302);
	});

	test('?public=1 never names the submission or instructor buckets', async () => {
		storageCalls = [];
		for (const id of [
			publicStorageAttachment,
			privateStorageAttachment,
			draftStorageAttachment,
			publicDriveAttachment
		]) {
			await getAttachment(id, null, true);
		}
		// SWEPT, with the count asserted so an empty log cannot pass.
		expect(storageCalls.length, 'storage calls made on the public branch').toBeGreaterThan(0);
		for (const call of storageCalls) {
			expect(call.bucket, `public branch touched ${call.bucket}`).toBe(ATTACHMENT_BUCKET);
			expect([SUBMISSION_BUCKET, INSTRUCTOR_BUCKET]).not.toContain(call.bucket);
		}
	});
});

// ---------------------------------------------------------------------------
// ITEM 3: instructor-only uploads on the shared path
// ---------------------------------------------------------------------------

describe('instructor-only material uploads straight to its own bucket', () => {
	test('the sign route mints into instructor-attachments, keyed to the item', async () => {
		const res = await postJson(
			INSTRUCTOR_SIGN,
			{ item_id: posted, filename: 'Bracket answer key.SLDPRT', size_bytes: 5 * 1024 * 1024 },
			teacherA.id
		);
		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);
		expect(res.body.bucket).toBe(INSTRUCTOR_BUCKET);
		// The key is built server-side: the item id, then a uuid, then the
		// lowercased extension. Nothing the caller typed is in it.
		expect(String(res.body.key)).toMatch(
			new RegExp(`^${posted}/[0-9a-f-]{36}\\.sldprt$`)
		);
	});

	test('5 MB and 60 MB both mint -- the 4 MiB Drive ceiling is gone', async () => {
		// 4 MiB was the old cap and is the number this bundle exists to remove,
		// so both sides of it are asserted rather than just the big one.
		for (const size of [5 * 1024 * 1024, 60 * 1024 * 1024]) {
			const res = await postJson(
				INSTRUCTOR_SIGN,
				{ item_id: posted, filename: 'Full assembly.SLDASM', size_bytes: size },
				teacherA.id
			);
			expect(res.body.ok, `${size} bytes`).toBe(true);
		}
	});

	test('the bucket limit still refuses something genuinely hopeless', async () => {
		const res = await postJson(
			INSTRUCTOR_SIGN,
			{ item_id: posted, filename: 'huge.zip', size_bytes: 300 * 1024 * 1024 },
			teacherA.id
		);
		expect(res.status).toBe(413);
		expect(res.body.gate).toBe('too_large');
		// The message names the size AND the cap; "too large" alone is a
		// guessing game.
		expect(String(res.body.error)).toContain('200 MB');
	});

	test('an enrolled student cannot mint an upload URL into it', async () => {
		const res = await postJson(
			INSTRUCTOR_SIGN,
			{ item_id: posted, filename: 'sneaky.pdf', size_bytes: 100 },
			alice.id
		);
		expect(res.body.ok).not.toBe(true);
		expect(res.body.gate).toBe('denied');
	});

	test('a signed-out caller cannot reach it at all', async () => {
		const res = await postJson(
			INSTRUCTOR_SIGN,
			{ item_id: posted, filename: 'sneaky.pdf', size_bytes: 100 },
			null
		);
		expect(res.status).toBe(401);
	});

	test('the record route stores octet-stream and the key, never a browser type', async () => {
		const key = `${posted}/dddd4444.sldasm`;
		await seedObject(INSTRUCTOR_BUCKET, key);
		const res = await postJson(
			INSTRUCTOR_RECORD,
			{
				item_id: posted,
				storage_key: key,
				filename: 'Full assembly.SLDASM',
				size_bytes: 60 * 1024 * 1024
			},
			teacherA.id
		);
		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);

		const { rows } = await db.sql<{
			mime_type: string;
			storage_key: string;
			drive_file_id: string | null;
			size_bytes: string;
			filename: string;
		}>(
			`select mime_type, storage_key, drive_file_id, size_bytes::text as size_bytes, filename
			 from public.classroom_instructor_attachments where storage_key = $1`,
			[key]
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].mime_type, 'never the uploader’s guess').toBe('application/octet-stream');
		expect(rows[0].drive_file_id, 'exactly one backing per row').toBeNull();
		expect(rows[0].size_bytes).toBe(String(60 * 1024 * 1024));
		// The name the person typed survives verbatim, case included.
		expect(rows[0].filename).toBe('Full assembly.SLDASM');
	});

	test('a key naming ANOTHER item is refused before the database sees it', async () => {
		const res = await postJson(
			INSTRUCTOR_RECORD,
			{ item_id: posted, storage_key: `${publicDoc}/eeee5555.pdf`, filename: 'x.pdf' },
			teacherA.id
		);
		expect(res.status).toBe(400);
		expect(String(res.body.error)).toContain('must name this item');
	});

	test('THE COUNT: a manager reads every instructor row, a student reads zero', async () => {
		// A SET rather than one row, so this counts rather than spot-checks.
		for (const [i, name] of ['key.SLDPRT', 'guide.pdf', 'setup.mp4'].entries()) {
			const key = `${posted}/ffff666${i}.bin`;
			await seedObject(INSTRUCTOR_BUCKET, key);
			await postJson(
				INSTRUCTOR_RECORD,
				{ item_id: posted, storage_key: key, filename: name, size_bytes: 1024 },
				teacherA.id
			);
		}

		const run = async (q: TestQuery) => {
			const { rows } = await q<{ n: string }>(
				`select count(*)::text as n from public.classroom_instructor_attachments
				 where item_id = $1`,
				[posted]
			);
			return Number(rows[0].n);
		};
		/**
		 * A signed-out caller is refused ONE LAYER EARLIER than everyone else
		 * here: `anon` holds no SELECT GRANT on this table at all, so the
		 * statement is rejected rather than returning an empty set. Both are
		 * "reads zero", and collapsing them to a number is what lets the sweep
		 * below count -- but the distinction is real and is why this is caught by
		 * name rather than by a bare try/catch.
		 */
		const countFor = async (userId: string | null): Promise<number> => {
			try {
				return userId ? await db.asUser(userId, run) : await db.asAnon(run);
			} catch (e) {
				expect(String((e as Error).message), 'unexpected failure').toContain(
					'permission denied'
				);
				return 0;
			}
		};

		const managerSees = await countFor(teacherA.id);
		// POSITIVE CONTROL: there is something to fail to see.
		expect(managerSees, 'manager').toBeGreaterThanOrEqual(4);
		expect(await countFor(alice.id), 'enrolled student').toBe(0);
		expect(await countFor(teacherB.id), 'teacher of another section').toBe(0);
		expect(await countFor(visitor.id), 'signed-in visitor').toBe(0);
		expect(await countFor(null), 'signed out').toBe(0);
	});

	test('the serve route 302s a manager and 404s the student, on the same row', async () => {
		const key = `${posted}/9999aaaa.sldprt`;
		await seedObject(INSTRUCTOR_BUCKET, key);
		await postJson(
			INSTRUCTOR_RECORD,
			{ item_id: posted, storage_key: key, filename: 'answers.SLDPRT', size_bytes: 2048 },
			teacherA.id
		);
		const { rows } = await db.sql<{ id: string }>(
			'select id from public.classroom_instructor_attachments where storage_key = $1',
			[key]
		);
		const id = rows[0].id;

		storageCalls = [];
		const manager = await getInstructorAttachment(id, teacherA.id);
		expect(manager.status, 'manager').toBe(302);
		expect(manager.headers.get('location')).toContain(INSTRUCTOR_BUCKET);
		expect(storageCalls.every((c) => c.bucket === INSTRUCTOR_BUCKET)).toBe(true);

		storageCalls = [];
		expect((await getInstructorAttachment(id, alice.id)).status, 'enrolled student').toBe(404);
		expect((await getInstructorAttachment(id, teacherB.id)).status, 'other teacher').toBe(404);
		expect((await getInstructorAttachment(id, null)).status, 'signed out').toBe(401);
		// Nothing was minted for any of them.
		expect(storageCalls, 'refused callers never reach storage').toHaveLength(0);
	});
});
