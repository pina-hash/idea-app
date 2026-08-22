// tests/classroom-attachment-route.test.ts
//
// The classroom attachment proxy (/api/classroom/attachment/[attachment_id]),
// driven as the REAL shipped route handlers against a REAL Postgres with the
// REAL 0082/0083 policies applied.
//
// WHY THIS ONE EARNS ITS PLACE. The route hands its authorization entirely to
// row-level security: it reads the row under the caller's own session and
// treats "no row" as 404. Everything that could go wrong here goes wrong
// SILENTLY -- a student fetching a draft handout, or another section's, looks
// exactly like a working page to whoever is testing it. So the fixture is the
// repo's embedded-Postgres harness (real migrations, real policies, real
// `set role authenticated` + request.jwt.claims) and the only thing shimmed is
// PostgREST's wire format, translated into the equivalent SQL. Postgres decides
// who sees what; the test asks.
//
// THE SHIM IS PINNED TO THE ROUTE'S QUERY -- table, columns and filter column
// are all asserted -- so editing the route's read fails this file loudly
// instead of quietly proving something else.
//
// Drive is mocked (a local HTTP server via the exported DRIVE_ENDPOINTS escape
// hatch): the real Google side needs a real consent grant, and what is under
// test is the authorization decision, not Google.
//
// MUTATION-CHECKED IN BOTH DIRECTIONS. Opening the attachments policy to
// `using (true)` reddens exactly the denial assertions (the student-vs-draft,
// the cross-section and the view-as ones) while every happy path stays green;
// tightening it to `using (false)` reddens exactly the happy paths. So the file
// is genuinely reading that one policy in both directions, not passing by
// accident. The migration was restored byte-identical afterwards.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import { DRIVE_ENDPOINTS } from '../src/lib/server/notebook-drive';
import {
	DELETE,
	GET
} from '../src/routes/api/classroom/attachment/[attachment_id]/+server';

const MIGRATIONS = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0053_app_feedback.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql'
] as const;

let db: TestDb;
let drive: Server;

/** Bytes the mock Drive serves; asserted byte-for-byte on the way out. */
const FILE_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7, 6, 5, 0xff, 0xd9]);
const BROKEN_FILE_ID = 'drive-file-that-drive-cannot-serve';
/** Every DELETE the mock Drive was asked to perform. */
let driveDeletes: string[] = [];

let owner: SeededUser; // pinned admin apina@boscotech.edu
let teacherA: SeededUser;
let teacherB: SeededUser;
let studentA: SeededUser; // enrolled in section A
let studentB: SeededUser; // enrolled in section B

let sectionA: string;
let sectionB: string;
let pubPostAttachment: string; // on a PUBLISHED post in section A
let draftPostAttachment: string; // on a DRAFT post in section A
let pubAsgAttachment: string; // on a PUBLISHED assignment in section A
let foreignAttachment: string; // on a published post in section B
let brokenAttachment: string; // section A, published, but Drive 500s

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

/** Attaches a file and returns the new attachment row's id. */
async function attach(userId: string, itemId: string, driveFileId: string): Promise<string> {
	const res = await rpc<{ attachment_id: string }>(
		userId,
		'public.classroom_add_attachment($1::uuid, $2, $3, $4, $5::bigint)',
		[itemId, driveFileId, 'handout.jpg', 'image/jpeg', 1234]
	);
	return res.attachment_id;
}

/** Creates one canonical item and returns its id. */
async function createItem(
	userId: string,
	kind: 'post' | 'assignment' | 'material',
	sectionIds: string[],
	title: string | null,
	body: string,
	published = true
): Promise<string> {
	const res = await rpc<{ item_id: string }>(
		userId,
		"public.classroom_create_item($1, $2::uuid[], $3, $4, null, null, null, $5, '[]'::jsonb, false)",
		[kind, sectionIds, title, body, published]
	);
	return res.item_id;
}

beforeAll(async () => {
	// --- mock Drive -------------------------------------------------------
	drive = createServer((req, res) => {
		const url = new URL(req.url ?? '/', 'http://127.0.0.1');
		if (url.pathname === '/token') {
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ access_token: 'test-access-token', expires_in: 3600 }));
			return;
		}
		if (url.pathname.startsWith('/files/')) {
			const fileId = decodeURIComponent(url.pathname.slice('/files/'.length));
			if (req.method === 'DELETE') {
				driveDeletes.push(fileId);
				res.writeHead(204);
				res.end();
				return;
			}
			if (fileId === BROKEN_FILE_ID) {
				res.writeHead(500, { 'content-type': 'text/plain' });
				res.end('drive is having a moment');
				return;
			}
			res.writeHead(200, {
				'content-type': 'image/jpeg',
				'content-length': String(FILE_BYTES.length)
			});
			res.end(Buffer.from(FILE_BYTES));
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

	// --- real database ----------------------------------------------------
	db = await startTestDb(MIGRATIONS);

	owner = await createUser(db, 'apina@boscotech.edu', 'Site Owner');
	teacherA = await createUser(db, 'tvargas@boscotech.edu', 'T. Vargas');
	teacherB = await createUser(db, 'mreed@boscotech.edu', 'M. Reed');
	studentA = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	studentB = await createUser(db, 'bruno@boscotech.net', 'Bruno Baptiste');

	const course = await rpc<{ course_id: string }>(
		teacherA.id,
		'public.classroom_upsert_course($1, $2)',
		['IDEA100', 'Intro to Engineering Design']
	);
	sectionA = (
		await rpc<{ section_id: string }>(teacherA.id, 'public.classroom_upsert_section($1::uuid, $2)', [
			course.course_id,
			'Period 1'
		])
	).section_id;
	sectionB = (
		await rpc<{ section_id: string }>(teacherB.id, 'public.classroom_upsert_section($1::uuid, $2)', [
			course.course_id,
			'Period 2'
		])
	).section_id;

	await rpc(teacherA.id, 'public.classroom_set_enrollment($1::uuid, $2, $3)', [
		sectionA,
		studentA.email,
		'Alice Alvarez'
	]);
	await rpc(teacherB.id, 'public.classroom_set_enrollment($1::uuid, $2, $3)', [
		sectionB,
		studentB.email,
		'Bruno Baptiste'
	]);

	const pubPost = await createItem(teacherA.id, 'post', [sectionA], 'Lab day', 'Bring goggles.');
	const draftPost = await createItem(
		teacherA.id,
		'post',
		[sectionA],
		'Draft plan',
		'Not ready yet.',
		false
	);
	const pubAsg = await createItem(teacherA.id, 'assignment', [sectionA], 'Bridge sketch', '');
	const foreignPost = await createItem(
		teacherB.id,
		'post',
		[sectionB],
		'Notice',
		'Period 2 only.'
	);

	pubPostAttachment = await attach(teacherA.id, pubPost, 'drive-pub-post');
	draftPostAttachment = await attach(teacherA.id, draftPost, 'drive-draft-post');
	pubAsgAttachment = await attach(teacherA.id, pubAsg, 'drive-pub-asg');
	foreignAttachment = await attach(teacherB.id, foreignPost, 'drive-foreign');
	brokenAttachment = await attach(teacherA.id, pubPost, BROKEN_FILE_ID);
}, 180_000);

afterAll(async () => {
	await db?.stop();
	await new Promise<void>((resolve) => drive?.close(() => resolve()));
});

/**
 * A Supabase-client stand-in over the real database, running as `userId` with
 * RLS on. It implements exactly the calls the route makes and REFUSES anything
 * else, so the test can never drift away from what ships.
 */
function supabaseFor(userId: string) {
	return {
		from(table: string) {
			expect(table).toBe('classroom_attachments');
			return {
				select(columns: string) {
					expect(columns).toContain('drive_file_id');
					expect(columns).toContain('filename');
					expect(columns).toContain('mime_type');
					return {
						eq(column: string, value: string) {
							expect(column).toBe('id');
							return {
								async maybeSingle() {
									return db.asUser(userId, async (q) => {
										const { rows } = await q<{ drive_file_id: string }>(
											`select drive_file_id, filename, mime_type
											   from public.classroom_attachments where id = $1`,
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
		async rpc(fn: string, args: Record<string, unknown>) {
			// ONE, now. `classroom_view_as_can_read_attachment` was the other,
			// reached only from the `?as=` branch this route no longer has;
			// 0124 dropped the function itself. The allow-list is what makes
			// that a REFUSAL rather than a silent pass -- a route that grew an
			// identity RPC back would fail here by name, which is the same
			// direction the `?as=` block below guards.
			expect([fn]).toEqual(['classroom_delete_attachment']);
			try {
				const data = await rpc(userId, 'public.classroom_delete_attachment($1::uuid)', [args.p_id]);
				return { data, error: null };
			} catch (e) {
				return { data: null, error: { message: (e as Error).message } };
			}
		}
	};
}

/** Calls the REAL route handler the way SvelteKit would. */
function callGet(
	attachmentId: string,
	userId: string | null,
	viewAs?: string
): Promise<Response> {
	const url = new URL(`http://localhost/api/classroom/attachment/${attachmentId}`);
	if (viewAs) url.searchParams.set('as', viewAs);
	return (GET as unknown as (event: unknown) => Promise<Response>)({
		params: { attachment_id: attachmentId },
		url,
		locals: {
			supabase: userId ? supabaseFor(userId) : null,
			claims: userId ? { sub: userId, role: 'authenticated' } : null
		}
	});
}

function callDelete(attachmentId: string, userId: string | null): Promise<Response> {
	return (DELETE as unknown as (event: unknown) => Promise<Response>)({
		params: { attachment_id: attachmentId },
		locals: {
			supabase: userId ? supabaseFor(userId) : null,
			claims: userId ? { sub: userId, role: 'authenticated' } : null
		}
	});
}

describe('GET /api/classroom/attachment/[attachment_id]', () => {
	it('serves the bytes to an enrolled student for PUBLISHED content', async () => {
		const res = await callGet(pubPostAttachment, studentA.id);

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('image/jpeg');
		expect(res.headers.get('x-content-type-options')).toBe('nosniff');
		// Per-user content must never land in a shared cache.
		expect(res.headers.get('cache-control')).toContain('private');
		expect(res.headers.get('cache-control')).not.toContain('public');

		const body = new Uint8Array(await res.arrayBuffer());
		expect(Array.from(body)).toEqual(Array.from(FILE_BYTES));
	});

	it('serves an assignment attachment to the same student', async () => {
		const res = await callGet(pubAsgAttachment, studentA.id);
		expect(res.status).toBe(200);
	});

	it('serves it to the section teacher and to an admin', async () => {
		for (const user of [teacherA, owner]) {
			const res = await callGet(pubPostAttachment, user.id);
			expect(res.status, user.email).toBe(200);
		}
	});

	// THE DRAFT DENIAL. Same route, same section, same student -- but the parent
	// post is unpublished, so the delegation refuses.
	it('404s an enrolled student on a DRAFT post attachment', async () => {
		const res = await callGet(draftPostAttachment, studentA.id);

		expect(res.status).toBe(404);
		expect(res.status).not.toBe(403);
		const body = new Uint8Array(await res.arrayBuffer());
		expect(Array.from(body)).not.toEqual(Array.from(FILE_BYTES));
		expect(res.headers.get('content-type')).not.toBe('image/jpeg');
	});

	it("404s a student from ANOTHER section on published content", async () => {
		const res = await callGet(pubPostAttachment, studentB.id);
		expect(res.status).toBe(404);

		// And the mirror image, so the test is not just asserting one direction.
		const mirror = await callGet(foreignAttachment, studentA.id);
		expect(mirror.status).toBe(404);
	});

	it("404s a teacher on another teacher's section", async () => {
		const res = await callGet(pubPostAttachment, teacherB.id);
		expect(res.status).toBe(404);
	});

	it('answers a stranger identically whether or not the attachment exists', async () => {
		const real = await callGet(pubPostAttachment, studentB.id);
		const imaginary = await callGet(randomUUID(), studentB.id);
		expect(real.status).toBe(imaginary.status);
		expect(await real.text()).toBe(await imaginary.text());
	});

	it('401s with no session, and never touches the database', async () => {
		const res = await callGet(pubPostAttachment, null);
		expect(res.status).toBe(401);
	});

	it('404s a malformed id without a round trip', async () => {
		// A client that throws if used: proves the id is rejected before any query.
		const explode = {
			from() {
				throw new Error('the route must not query on a malformed id');
			}
		};
		const res = await (GET as unknown as (event: unknown) => Promise<Response>)({
			params: { attachment_id: 'not-a-uuid' },
			url: new URL('http://localhost/api/classroom/attachment/not-a-uuid'),
			locals: { supabase: explode, claims: { sub: owner.id, role: 'authenticated' } }
		});
		expect(res.status).toBe(404);
	});

	it('502s (not 404) when the caller IS allowed but Drive fails', async () => {
		const res = await callGet(brokenAttachment, studentA.id);
		expect(res.status).toBe(502);
	});
});

/**
 * `?as=` IS INERT NOW, and this block is what pins that rather than a deletion.
 *
 * The parameter used to route the read through
 * classroom_view_as_can_read_attachment, so the classroom view-as preview was
 * answered as the impersonated student. Both previews that produced such a URL
 * are deleted, and the branch went with them.
 *
 * WHAT MATTERS IS THE DIRECTION IT COULD MOVE. The branch only ever NARROWED an
 * already-authorized read, so removing it cannot leak: every case below is the
 * CALLER'S own answer, identical with the parameter and without it. The
 * assertions are written as that equivalence, so a future re-introduction of an
 * identity parameter on this route fails here by name. It is the same shape as
 * the instructor proxy's own "a ?as= query param has NO EFFECT" test.
 */
describe('?as= on the proxy is an ordinary unknown query param', () => {
	it('changes nothing for an admin: the same answer with it and without it', async () => {
		for (const [label, attachment] of [
			['published + enrolled', pubPostAttachment],
			['a draft', draftPostAttachment],
			['a foreign section', foreignAttachment]
		] as const) {
			const plain = await callGet(attachment, owner.id);
			const withAs = await callGet(attachment, owner.id, studentA.email);
			expect(withAs.status, label).toBe(plain.status);
		}
	});

	it('cannot narrow an admin onto a student, which is what it used to do', async () => {
		// The admin reads a DRAFT's attachment through their own policy. Under the
		// old branch, `?as=<a student who cannot see the draft>` turned this into a
		// 404. It must now be the admin's own 200: the parameter carries no
		// identity and this route resolves nobody but its caller.
		const res = await callGet(draftPostAttachment, owner.id, studentA.email);
		expect(res.status).toBe(200);
	});

	it('cannot widen a student either: they still get their own answer', async () => {
		// A student passing another identity is not elevated by it -- their own
		// policy is still the whole boundary.
		const own = await callGet(pubPostAttachment, studentA.id, 'someone-else@boscotech.net');
		expect(own.status).toBe(200);
		const foreign = await callGet(foreignAttachment, studentA.id, 'someone-else@boscotech.net');
		expect(foreign.status).toBe(404);
	});
});

describe('DELETE /api/classroom/attachment/[attachment_id]', () => {
	it('refuses a student and an unrelated teacher, and removes nothing', async () => {
		for (const user of [studentA, teacherB]) {
			const res = await callDelete(pubAsgAttachment, user.id);
			expect(res.status, user.email).toBe(400);
		}
		const { rows } = await db.sql('select 1 from public.classroom_attachments where id = $1', [
			pubAsgAttachment
		]);
		expect(rows).toHaveLength(1);
	});

	it('401s with no session', async () => {
		const res = await callDelete(pubAsgAttachment, null);
		expect(res.status).toBe(401);
	});

	it('lets the section teacher remove it, and sweeps the orphaned Drive blob', async () => {
		driveDeletes = [];
		const res = await callDelete(pubAsgAttachment, teacherA.id);
		expect(res.status).toBe(200);

		const { rows } = await db.sql('select 1 from public.classroom_attachments where id = $1', [
			pubAsgAttachment
		]);
		expect(rows).toHaveLength(0);
		// Last row referencing that file -> the blob goes too.
		expect(driveDeletes).toEqual(['drive-pub-asg']);
	});

	it('does NOT sweep a blob that other rows still reference', async () => {
		// One upload, two rows -- since 0085 that is the DUPLICATE shape: a copy
		// carries its attachments by reference rather than re-uploading them.
		const original = await createItem(
			teacherA.id,
			'post',
			[sectionA],
			'Shared handout',
			'Read this.'
		);
		const originalAttachment = await attach(teacherA.id, original, 'drive-shared');
		const copy = await rpc<{ item_id: string }>(
			teacherA.id,
			'public.classroom_duplicate_item($1::uuid)',
			[original]
		);
		const { rows } = await db.sql<{ id: string }>(
			'select id from public.classroom_attachments where item_id = $1',
			[copy.item_id]
		);
		expect(rows).toHaveLength(1);

		driveDeletes = [];
		const first = await callDelete(originalAttachment, teacherA.id);
		expect(first.status).toBe(200);
		expect(driveDeletes).toEqual([]); // the copy still points at it

		const second = await callDelete(rows[0].id, teacherA.id);
		expect(second.status).toBe(200);
		expect(driveDeletes).toEqual(['drive-shared']); // now it is orphaned
	});
});
