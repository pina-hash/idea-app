// tests/classroom-instructor-materials.test.ts
//
// Instructor-only classroom materials (0090): answer keys, facilitation
// guides, setup notes, source files attached to a canonical item and readable
// ONLY by that item's section teachers of record and admins. DELIBERATELY
// NARROW, the classroom-security.test.ts / notebook-security.test.ts
// convention -- this is not a feature suite, it is a suite for the guarantee
// that would regress SILENTLY: nothing visibly breaks if a student can quietly
// read an answer key, until a real student is looking at one.
//
// Three layers, all against a REAL Postgres with the REAL 0082/0083/0085/0090
// migrations applied (see tests/db/harness.ts):
//
//   1. RLS on classroom_instructor_attachments / classroom_instructor_resources:
//      student refused, a foreign teacher refused, the teacher of record
//      allowed, an admin allowed -- by list AND by direct row read.
//   2. The write RPCs (classroom_add_instructor_attachment,
//      classroom_delete_instructor_attachment, classroom_set_instructor_
//      resources) re-check the SAME boundary server-side, plus the stricter
//      "manages EVERY posted section" bar an EDIT needs (vs. "manages ANY
//      posted section" a READ needs) -- the same read/write split
//      classroom_can_read_item / _classroom_manages_item already draw for the
//      student-facing content.
//   3. The serving proxy (/api/classroom/instructor-attachment/[attachment_id]),
//      driven as the REAL shipped route handler -- student refused (404,
//      never 403), foreign teacher refused, teacher of record served, admin
//      served, no session 401, and a `?as=` query param (view-as-student on
//      the OTHER proxy) is proven to have NO effect here at all, because this
//      route never reads it.
//
// MUTATION-CHECKED BOTH WAYS (manually, during this session -- not left as
// runnable code, the classroom-attachment-route.test.ts convention). Against
// this exact file: widening "classroom instructor attachments follow their
// item" to `using (true)` reddened every denial assertion in describe blocks
// 1 and 3 (student, foreign teacher and anon-via-asAnon all started reading
// rows/bytes they must not) while every allowed-path assertion stayed green;
// narrowing it to `using (false)` reddened every allowed-path assertion
// (teacher of record and admin both lost their own reads) while the denials
// stayed green trivially. The migration file was restored byte-identical
// afterwards and this file was re-run fully green.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import { DRIVE_ENDPOINTS } from '../src/lib/server/notebook-drive';
import { GET } from '../src/routes/api/classroom/instructor-attachment/[attachment_id]/+server';

const MIGRATIONS = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0053_app_feedback.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0090_classroom_instructor_materials.sql'
] as const;

let db: TestDb;
let drive: Server;

const FILE_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 9, 8, 7, 6, 5]);

let owner: SeededUser; // pinned admin apina@boscotech.edu
let teacherA: SeededUser; // teacher of record for sectionA (and sectionC)
let teacherB: SeededUser; // foreign -- no relation to any of this item's sections
let teacherC: SeededUser; // teacher of record for sectionC only
let studentA: SeededUser; // enrolled in sectionA

let sectionA: string;
let sectionC: string;

/** Posted to sectionA only. teacherA is its sole, full teacher of record. */
let soleItem: string;
/** Posted to BOTH sectionA and sectionC -- teacherA manages only one of them. */
let sharedItem: string;

let soleAttachment: string;
let sharedAttachment: string;

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

/** Fails loudly if the statement SUCCEEDS; otherwise hands back the error. */
async function captureError(run: () => Promise<unknown>): Promise<{ message: string }> {
	try {
		await run();
	} catch (error) {
		return { message: (error as Error).message ?? String(error) };
	}
	throw new Error('Expected this statement to be rejected, but it succeeded.');
}

function createItem(
	userId: string,
	sectionIds: string[],
	title: string
): Promise<{ item_id: string }> {
	return rpc(
		userId,
		"public.classroom_create_item('assignment', $1::uuid[], $2, '', null, null, null, true, '[]'::jsonb, false)",
		[sectionIds, title]
	);
}

function addInstructorAttachment(
	userId: string,
	itemId: string,
	driveFileId: string
): Promise<{ attachment_id: string; drive_file_id: string }> {
	return rpc(
		userId,
		'public.classroom_add_instructor_attachment($1::uuid, $2, $3, $4, $5::bigint)',
		[itemId, driveFileId, 'answer-key.pdf', 'application/pdf', 4321]
	);
}

beforeAll(async () => {
	// --- mock Drive ---------------------------------------------------------
	drive = createServer((req, res) => {
		const url = new URL(req.url ?? '/', 'http://127.0.0.1');
		if (url.pathname === '/token') {
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ access_token: 'test-access-token', expires_in: 3600 }));
			return;
		}
		if (url.pathname.startsWith('/files/')) {
			if (req.method === 'DELETE') {
				res.writeHead(204);
				res.end();
				return;
			}
			res.writeHead(200, {
				'content-type': 'application/pdf',
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

	// --- real database -------------------------------------------------------
	db = await startTestDb(MIGRATIONS);

	owner = await createUser(db, 'apina@boscotech.edu', 'Site Owner');
	teacherA = await createUser(db, 'tvargas@boscotech.edu', 'T. Vargas');
	teacherB = await createUser(db, 'mreed@boscotech.edu', 'M. Reed');
	teacherC = await createUser(db, 'jkim@boscotech.edu', 'J. Kim');
	studentA = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');

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
	sectionC = (
		await rpc<{ section_id: string }>(teacherC.id, 'public.classroom_upsert_section($1::uuid, $2)', [
			course.course_id,
			'Period 3'
		])
	).section_id;

	await rpc(teacherA.id, 'public.classroom_set_enrollment($1::uuid, $2, $3)', [
		sectionA,
		studentA.email,
		'Alice Alvarez'
	]);

	soleItem = (await createItem(teacherA.id, [sectionA], 'Bridge sketch')).item_id;

	// sharedItem needs to land on TWO sections with DIFFERENT teachers of
	// record, which classroom_create_item cannot do directly (every target
	// must already be managed by the caller) -- so it is created on
	// teacherA's own section first, then the admin (who manages every
	// section via is_admin()) adds the second posting.
	sharedItem = (await createItem(teacherA.id, [sectionA], 'Shared unit test')).item_id;
	await rpc(owner.id, 'public.classroom_add_postings($1::uuid, $2::uuid[])', [sharedItem, [sectionC]]);

	soleAttachment = (await addInstructorAttachment(teacherA.id, soleItem, 'drive-sole-key')).attachment_id;
	// teacherA manages only ONE of sharedItem's two sections, so they cannot
	// edit it (see the "EDITING needs every posted section" test below) --
	// the admin, who manages both, seeds it instead.
	sharedAttachment = (
		await addInstructorAttachment(owner.id, sharedItem, 'drive-shared-key')
	).attachment_id;

	await rpc(teacherA.id, 'public.classroom_set_instructor_resources($1::uuid, $2::jsonb)', [
		soleItem,
		JSON.stringify([{ label: 'Grading notes', url: 'https://example.com/grading-notes' }])
	]);
}, 180_000);

afterAll(async () => {
	await db?.stop();
	await new Promise<void>((resolve) => drive?.close(() => resolve()));
});

describe('RLS: classroom_instructor_attachments / classroom_instructor_resources', () => {
	it('the teacher of record reads the row', async () => {
		const { rows } = await db.asUser(teacherA.id, (q) =>
			q<{ id: string }>('select id from public.classroom_instructor_attachments where id = $1', [
				soleAttachment
			])
		);
		expect(rows).toHaveLength(1);

		const links = await db.asUser(teacherA.id, (q) =>
			q<{ label: string }>(
				'select label from public.classroom_instructor_resources where item_id = $1',
				[soleItem]
			)
		);
		expect(links.rows.map((r) => r.label)).toEqual(['Grading notes']);
	});

	it('an admin reads the row too', async () => {
		const { rows } = await db.asUser(owner.id, (q) =>
			q<{ id: string }>('select id from public.classroom_instructor_attachments where id = $1', [
				soleAttachment
			])
		);
		expect(rows).toHaveLength(1);
	});

	it("a STUDENT reads zero rows -- by list AND by id, published assignment or not", async () => {
		const byId = await db.asUser(studentA.id, (q) =>
			q<{ id: string }>('select id from public.classroom_instructor_attachments where id = $1', [
				soleAttachment
			])
		);
		expect(byId.rows).toHaveLength(0);

		const byList = await db.asUser(studentA.id, (q) =>
			q<{ id: string }>('select id from public.classroom_instructor_attachments')
		);
		expect(byList.rows).toHaveLength(0);

		const links = await db.asUser(studentA.id, (q) =>
			q<{ id: string }>('select id from public.classroom_instructor_resources where item_id = $1', [
				soleItem
			])
		);
		expect(links.rows).toHaveLength(0);
	});

	it('a FOREIGN teacher (no relation to this item) reads zero rows', async () => {
		const { rows } = await db.asUser(teacherB.id, (q) =>
			q<{ id: string }>('select id from public.classroom_instructor_attachments where id = $1', [
				soleAttachment
			])
		);
		expect(rows).toHaveLength(0);
	});

	it('a teacher who manages only ONE of a multi-section item\'s classes still READS it', async () => {
		// sharedItem is posted to sectionA (teacherA) and sectionC (teacherC).
		// Reading is "any posting managed", not "every posting managed".
		for (const user of [teacherA, teacherC]) {
			const { rows } = await db.asUser(user.id, (q) =>
				q<{ id: string }>('select id from public.classroom_instructor_attachments where id = $1', [
					sharedAttachment
				])
			);
			expect(rows, user.email).toHaveLength(1);
		}
	});

	it('no direct INSERT/UPDATE/DELETE for a student, a teacher, OR an admin', async () => {
		for (const user of [studentA, teacherA, owner]) {
			const insertErr = await captureError(() =>
				db.asUser(user.id, (q) =>
					q(
						`insert into public.classroom_instructor_attachments
							(item_id, drive_file_id, filename, mime_type, uploaded_by)
						 values ($1, 'x', 'x.pdf', 'application/pdf', 'x@x.com')`,
						[soleItem]
					)
				)
			);
			expect(insertErr.message, user.email).toMatch(/permission denied/i);

			const updateErr = await captureError(() =>
				db.asUser(user.id, (q) =>
					q('update public.classroom_instructor_attachments set filename = $1 where id = $2', [
						'renamed.pdf',
						soleAttachment
					])
				)
			);
			expect(updateErr.message, user.email).toMatch(/permission denied/i);

			const deleteErr = await captureError(() =>
				db.asUser(user.id, (q) =>
					q('delete from public.classroom_instructor_attachments where id = $1', [soleAttachment])
				)
			);
			expect(deleteErr.message, user.email).toMatch(/permission denied/i);
		}
	});
});

describe('write RPCs: classroom_add_instructor_attachment / _delete_instructor_attachment / _set_instructor_resources', () => {
	it('refuses a student and a foreign teacher on every write', async () => {
		for (const user of [studentA, teacherB]) {
			const addErr = await captureError(() => addInstructorAttachment(user.id, soleItem, 'x'));
			expect(addErr.message, user.email).toMatch(/teacher of record|signed in/i);

			const linksErr = await captureError(() =>
				rpc(user.id, 'public.classroom_set_instructor_resources($1::uuid, $2::jsonb)', [
					soleItem,
					'[]'
				])
			);
			expect(linksErr.message, user.email).toMatch(/teacher of record|signed in/i);

			const deleteErr = await captureError(() =>
				rpc(user.id, 'public.classroom_delete_instructor_attachment($1::uuid)', [soleAttachment])
			);
			expect(deleteErr.message, user.email).toMatch(/teacher of record|signed in/i);
		}
	});

	it('the teacher of record can add, edit and remove', async () => {
		const added = await addInstructorAttachment(teacherA.id, soleItem, 'drive-second-key');
		expect(added.attachment_id).toBeTruthy();

		const linksRes = await rpc<{ ok: boolean }>(
			teacherA.id,
			'public.classroom_set_instructor_resources($1::uuid, $2::jsonb)',
			[soleItem, JSON.stringify([{ label: 'Updated notes', url: 'https://example.com/updated' }])]
		);
		expect(linksRes.ok).toBe(true);
		const { rows: links } = await db.sql<{ label: string }>(
			'select label from public.classroom_instructor_resources where item_id = $1',
			[soleItem]
		);
		expect(links.map((r) => r.label)).toEqual(['Updated notes']);

		const removed = await rpc<{ ok: boolean; orphaned: boolean }>(
			teacherA.id,
			'public.classroom_delete_instructor_attachment($1::uuid)',
			[added.attachment_id]
		);
		expect(removed).toEqual({ ok: true, deleted: true, drive_file_id: 'drive-second-key', orphaned: true });
	});

	it('an admin can add, edit and remove too', async () => {
		const added = await addInstructorAttachment(owner.id, soleItem, 'drive-admin-key');
		const removed = await rpc<{ ok: boolean }>(
			owner.id,
			'public.classroom_delete_instructor_attachment($1::uuid)',
			[added.attachment_id]
		);
		expect(removed.ok).toBe(true);
	});

	it('EDITING needs the teacher to manage EVERY posted section -- a stricter bar than reading', async () => {
		// sharedItem is posted to sectionA (teacherA) and sectionC (teacherC).
		// Both teachers could READ its instructor attachment (see the RLS
		// describe block above, "manages only ONE ... still READS it"), but
		// EDITING it is refused for both, mirroring _classroom_manages_item for
		// the student-facing side: neither manages every section it is posted
		// to.
		for (const user of [teacherA, teacherC]) {
			const err = await captureError(() => addInstructorAttachment(user.id, sharedItem, 'x'));
			expect(err.message, user.email).toMatch(/teacher of record for every class/i);
		}

		// The admin manages every section (is_admin() short-circuits
		// classroom_manages_section), so the identical call succeeds for them.
		const ok = await addInstructorAttachment(owner.id, sharedItem, 'drive-shared-second');
		expect(ok.attachment_id).toBeTruthy();
		await rpc(owner.id, 'public.classroom_delete_instructor_attachment($1::uuid)', [
			ok.attachment_id
		]);
	});

	it('classroom_delete_item sweeps an orphaned instructor-only Drive blob and reports it', async () => {
		const scratch = (await createItem(teacherA.id, [sectionA], 'Scratch item')).item_id;
		await addInstructorAttachment(teacherA.id, scratch, 'drive-scratch-key');

		const res = await rpc<{ deleted: boolean; orphaned_drive_file_ids: string[] }>(
			teacherA.id,
			'public.classroom_delete_item($1::uuid)',
			[scratch]
		);
		expect(res.deleted).toBe(true);
		expect(res.orphaned_drive_file_ids).toEqual(['drive-scratch-key']);
	});

	it('classroom_duplicate_item carries instructor-only material onto the new draft', async () => {
		const dup = await rpc<{ item_id: string }>(
			teacherA.id,
			'public.classroom_duplicate_item($1::uuid)',
			[soleItem]
		);
		const { rows: copiedAttachments } = await db.sql<{ drive_file_id: string }>(
			'select drive_file_id from public.classroom_instructor_attachments where item_id = $1',
			[dup.item_id]
		);
		expect(copiedAttachments.map((r) => r.drive_file_id)).toContain('drive-sole-key');
		const { rows: copiedLinks } = await db.sql<{ label: string }>(
			'select label from public.classroom_instructor_resources where item_id = $1',
			[dup.item_id]
		);
		expect(copiedLinks.map((r) => r.label)).toEqual(['Updated notes']);
	});
});

describe('anon boundary', () => {
	it('anon has no EXECUTE on any of the three write RPCs and no privilege on either table', async () => {
		const fns = [
			'classroom_add_instructor_attachment(uuid, text, text, text, bigint)',
			'classroom_delete_instructor_attachment(uuid)',
			'classroom_set_instructor_resources(uuid, jsonb)'
		];
		for (const fn of fns) {
			const { rows } = await db.sql<{ ok: boolean }>(
				`select has_function_privilege('anon', $1, 'execute') as ok`,
				[`public.${fn}`]
			);
			expect([fn, rows[0].ok]).toEqual([fn, false]);
		}

		for (const table of ['classroom_instructor_attachments', 'classroom_instructor_resources']) {
			for (const priv of ['select', 'insert', 'update', 'delete']) {
				const { rows } = await db.sql<{ ok: boolean }>(
					`select has_table_privilege('anon', $1, $2) as ok`,
					[`public.${table}`, priv]
				);
				expect([table, priv, rows[0].ok]).toEqual([table, priv, false]);
			}
		}
	});

	it('a genuinely signed-out (anon role, no claims) session cannot read the table or call the RPC', async () => {
		// anon holds no SELECT grant on the table at all (unlike `authenticated`,
		// which has the grant but is filtered to nothing by RLS) -- so the read
		// itself is rejected, not merely empty.
		const readErr = await captureError(() =>
			db.asAnon((q) => q<{ id: string }>('select id from public.classroom_instructor_attachments'))
		);
		expect(readErr.message).toMatch(/permission denied/i);

		const err = await captureError(() =>
			db.asAnon((q) =>
				q('select public.classroom_add_instructor_attachment($1::uuid, $2, $3, $4)', [
					soleItem,
					'x',
					'x.pdf',
					'application/pdf'
				])
			)
		);
		expect(err.message).toMatch(/permission denied/i);
	});
});

/** Calls the REAL route handler the way SvelteKit would. */
function callGet(attachmentId: string, userId: string | null, viewAs?: string): Promise<Response> {
	const url = new URL(`http://localhost/api/classroom/instructor-attachment/${attachmentId}`);
	// Passed through even though the route never reads it -- see the
	// "?as= has no effect" assertion below.
	if (viewAs) url.searchParams.set('as', viewAs);
	return (GET as unknown as (event: unknown) => Promise<Response>)({
		params: { attachment_id: attachmentId },
		url,
		locals: {
			supabase: userId
				? {
						from(table: string) {
							expect(table).toBe('classroom_instructor_attachments');
							return {
								select(columns: string) {
									expect(columns).toContain('drive_file_id');
									return {
										eq(column: string, value: string) {
											expect(column).toBe('id');
											return {
												async maybeSingle() {
													return db.asUser(userId, async (q) => {
														const { rows } = await q<{ drive_file_id: string }>(
															`select drive_file_id, filename, mime_type
															   from public.classroom_instructor_attachments where id = $1`,
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
						}
					}
				: null,
			claims: userId ? { sub: userId, role: 'authenticated' } : null
		}
	});
}

describe('GET /api/classroom/instructor-attachment/[attachment_id]', () => {
	it('serves the bytes to the teacher of record and to an admin', async () => {
		for (const user of [teacherA, owner]) {
			const res = await callGet(soleAttachment, user.id);
			expect(res.status, user.email).toBe(200);
			expect(res.headers.get('content-type')).toBe('application/pdf');
			expect(res.headers.get('cache-control')).toContain('private');
			const body = new Uint8Array(await res.arrayBuffer());
			expect(Array.from(body)).toEqual(Array.from(FILE_BYTES));
		}
	});

	it("404s a STUDENT -- never 403 -- even though they are enrolled in the item's own section", async () => {
		const res = await callGet(soleAttachment, studentA.id);
		expect(res.status).toBe(404);
		expect(res.status).not.toBe(403);
		const body = new Uint8Array(await res.arrayBuffer());
		expect(Array.from(body)).not.toEqual(Array.from(FILE_BYTES));
	});

	it('404s a FOREIGN teacher with no relation to this item', async () => {
		const res = await callGet(soleAttachment, teacherB.id);
		expect(res.status).toBe(404);
	});

	it('answers a stranger identically whether or not the attachment exists', async () => {
		const real = await callGet(soleAttachment, studentA.id);
		const imaginary = await callGet(randomUUID(), studentA.id);
		expect(real.status).toBe(imaginary.status);
		expect(await real.text()).toBe(await imaginary.text());
	});

	it('401s with no session', async () => {
		const res = await callGet(soleAttachment, null);
		expect(res.status).toBe(401);
	});

	it('404s a malformed id without a round trip', async () => {
		const explode = {
			from() {
				throw new Error('the route must not query on a malformed id');
			}
		};
		const res = await (GET as unknown as (event: unknown) => Promise<Response>)({
			params: { attachment_id: 'not-a-uuid' },
			locals: { supabase: explode, claims: { sub: owner.id, role: 'authenticated' } }
		});
		expect(res.status).toBe(404);
	});

	it('a ?as= query param has NO EFFECT: this route has no view-as-student support at all', async () => {
		// A student passing ?as= naming themselves (or anyone) is still 404 --
		// unlike /api/classroom/attachment, which has real ?as= handling, this
		// route never reads the query string, so the parameter changes nothing
		// in either direction.
		const studentWithAs = await callGet(soleAttachment, studentA.id, studentA.email);
		expect(studentWithAs.status).toBe(404);

		// And the admin's own read is identical with or without the param,
		// because both are answered from the admin's OWN session either way.
		const adminNoAs = await callGet(soleAttachment, owner.id);
		const adminWithAs = await callGet(soleAttachment, owner.id, studentA.email);
		expect(adminWithAs.status).toBe(adminNoAs.status);
		expect(adminWithAs.status).toBe(200);
	});
});
