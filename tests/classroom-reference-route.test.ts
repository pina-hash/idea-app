// tests/classroom-reference-route.test.ts
//
// The two SIGNED-OUT routes a printed QR code leads to, driven as the REAL
// shipped handlers against a REAL Postgres with the REAL 0092 functions:
//
//   * the public reference viewer's load (src/routes/reference/[itemId]), and
//   * the attachment proxy's `?public=1` branch.
//
// WHY THE HANDLERS AND NOT JUST THE SQL. classroom-reference.test.ts already
// proves what the database will answer. What it cannot prove is that the ROUTES
// ask it the right question -- that the viewer calls the narrow public function
// rather than the ordinary read, and that `?public=1` genuinely swaps in a
// STRICTER resolution rather than skipping the session check. Those are route
// decisions, and getting either wrong is invisible on screen.
//
// THE SHIM IS PINNED TO THE CALL (the notebook-photo-route convention): it
// asserts the function NAME and forwards the route's own parameter object into
// a real SQL call as `anon`. A route that started calling something else fails
// here loudly instead of quietly proving something different.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import { DRIVE_ENDPOINTS } from '../src/lib/server/notebook-drive';
import { GET as ATTACHMENT_GET } from '../src/routes/api/classroom/attachment/[attachment_id]/+server';
import { load as REFERENCE_LOAD } from '../src/routes/reference/[itemId]/+page.server';

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
	'0092_classroom_reference_specs.sql'
] as const;

const FILE_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3, 4]);

let db: TestDb;
let drive: Server;

let teacher: SeededUser;
let student: SeededUser;

let publicMaterial: string;
let privateMaterial: string;
let assignmentId: string;
let publicAttachment: string;
let privateAttachment: string;
let instructorAttachment: string;

const REFERENCE_SPEC = {
	schemaVersion: 2,
	kind: 'reference',
	meta: { referenceId: 'ref-1', title: 'Course Reference' },
	sections: [
		{ slug: 'overview', title: 'Overview', blocks: [{ type: 'instructions', content: 'Read.' }] }
	]
};

async function rpc<T = Record<string, unknown>>(
	userId: string,
	call: string,
	params: unknown[] = []
): Promise<T> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
		return rows[0].result;
	});
}

beforeAll(async () => {
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

	db = await startTestDb([...MIGRATIONS]);

	teacher = await createUser(db, 'teacher@boscotech.edu', 'T');
	student = await createUser(db, 'student@boscotech.net', 'S');

	const course = await rpc<{ course_id: string }>(
		teacher.id,
		'public.classroom_upsert_course($1, $2)',
		['idea000', 'Sample']
	);
	const section = (
		await rpc<{ section_id: string }>(teacher.id, 'public.classroom_upsert_section($1::uuid, $2)', [
			course.course_id,
			'Period 1'
		])
	).section_id;
	await rpc(teacher.id, 'public.classroom_set_enrollment($1::uuid, $2, $3)', [
		section,
		student.email,
		'S'
	]);

	const createItem = async (kind: string, title: string) =>
		(
			await rpc<{ item_id: string }>(
				teacher.id,
				'public.classroom_create_item($1, $2::uuid[], $3, $4, $5, $6::timestamptz, $7, $8, $9::jsonb, $10)',
				[kind, [section], title, '', null, null, null, true, JSON.stringify([]), false]
			)
		).item_id;

	publicMaterial = await createItem('material', 'Syllabus');
	privateMaterial = await createItem('material', 'Private notes');
	assignmentId = await createItem('assignment', 'Bracket');

	for (const id of [publicMaterial, privateMaterial]) {
		await rpc(teacher.id, 'public.classroom_set_reference_spec($1::uuid, $2::jsonb)', [
			id,
			JSON.stringify(REFERENCE_SPEC)
		]);
	}
	await rpc(teacher.id, 'public.classroom_set_item_public($1::uuid, true)', [publicMaterial]);

	const attach = async (itemId: string, driveId: string) =>
		(
			await rpc<{ attachment_id: string }>(
				teacher.id,
				'public.classroom_add_attachment($1::uuid, $2, $3, $4, $5::bigint)',
				[itemId, driveId, 'handout.pdf', 'application/pdf', 8]
			)
		).attachment_id;
	publicAttachment = await attach(publicMaterial, 'drive-public');
	privateAttachment = await attach(privateMaterial, 'drive-private');
	instructorAttachment = (
		await rpc<{ attachment_id: string }>(
			teacher.id,
			'public.classroom_add_instructor_attachment($1::uuid, $2, $3, $4, $5::bigint)',
			[publicMaterial, 'drive-key', 'answers.pdf', 'application/pdf', 8]
		)
	).attachment_id;
}, 120_000);

afterAll(async () => {
	await db?.stop();
	await new Promise<void>((resolve) => drive?.close(() => resolve()));
});

/**
 * A Supabase-client stand-in that implements ONLY `.rpc(name, params)`, running
 * as `anon` against the real database. It asserts the function name, so a route
 * that switched to a different (looser) call fails here.
 */
function anonClient(expected: string[]) {
	return {
		async rpc(name: string, params: Record<string, unknown>) {
			expect(expected).toContain(name);
			const keys = Object.keys(params);
			const args = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
			return db.asAnon(async (q) => {
				const { rows } = await q<{ result: unknown }>(
					`select public.${name}(${args}) as result`,
					keys.map((k) => params[k])
				);
				return { data: rows[0].result ?? null, error: null };
			});
		}
	};
}

function loadReference(itemId: string) {
	return (REFERENCE_LOAD as unknown as (event: unknown) => Promise<unknown>)({
		params: { itemId },
		locals: { supabase: anonClient(['classroom_public_reference']) }
	});
}

function callAttachment(id: string, query: string, signedIn: boolean): Promise<Response> {
	return (ATTACHMENT_GET as unknown as (event: unknown) => Promise<Response>)({
		params: { attachment_id: id },
		url: new URL(`http://localhost/api/classroom/attachment/${id}${query}`),
		locals: {
			supabase: anonClient(['classroom_public_attachment']),
			claims: signedIn ? { sub: student.id, email: student.email } : null
		}
	});
}

/** SvelteKit's error()/redirect() throw; this turns that into a status. */
async function statusOf(run: () => Promise<unknown>): Promise<number | 'ok'> {
	try {
		await run();
		return 'ok';
	} catch (e) {
		return (e as { status?: number }).status ?? -1;
	}
}

describe('the public reference viewer load', () => {
	it('serves a published public material with a document', async () => {
		const data = (await loadReference(publicMaterial)) as {
			title: string;
			spec: { kind: string; sections: unknown[] };
			attachments: { id: string }[];
		};
		expect(data.title).toBe('Syllabus');
		expect(data.spec.kind).toBe('reference');
		expect(data.spec.sections).toHaveLength(1);
	});

	it('lists only that material’s own attachments, never the instructor-only one', async () => {
		const data = (await loadReference(publicMaterial)) as { attachments: { id: string }[] };
		expect(data.attachments.map((a) => a.id)).toEqual([publicAttachment]);
		expect(data.attachments.map((a) => a.id)).not.toContain(instructorAttachment);
	});

	it('404s for a private material, exactly as for an id that does not exist', async () => {
		expect(await statusOf(() => loadReference(privateMaterial))).toBe(404);
		expect(await statusOf(() => loadReference('00000000-0000-0000-0000-000000000000'))).toBe(404);
	});

	it('404s for an assignment, whose spec lives in another table entirely', async () => {
		expect(await statusOf(() => loadReference(assignmentId))).toBe(404);
	});
});

describe('the attachment proxy’s public branch', () => {
	it('serves a public material’s attachment with no session at all', async () => {
		const res = await callAttachment(publicAttachment, '?public=1', false);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toContain('application/pdf');
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(FILE_BYTES);
	});

	it.each([
		['a private material’s attachment', () => privateAttachment],
		['an instructor-only attachment', () => instructorAttachment],
		['an id that does not exist', () => '00000000-0000-0000-0000-000000000000']
	])('404s for %s', async (_label, id) => {
		const res = await callAttachment(id(), '?public=1', false);
		expect(res.status).toBe(404);
	});

	it('is not a way past the session check: no ?public=1 and no session is still 401', async () => {
		const res = await callAttachment(publicAttachment, '', false);
		expect(res.status).toBe(401);
	});

	it('narrows rather than widens: ?public=1 still 404s a private file for a SIGNED-IN student who could read it normally', async () => {
		// The student is enrolled and could fetch this through the ordinary
		// branch. Asking for the public one takes the stricter path anyway.
		const res = await callAttachment(privateAttachment, '?public=1', true);
		expect(res.status).toBe(404);
	});

	it('rejects a malformed id without touching the database', async () => {
		const res = await (ATTACHMENT_GET as unknown as (e: unknown) => Promise<Response>)({
			params: { attachment_id: 'not-a-uuid' },
			url: new URL('http://localhost/api/classroom/attachment/not-a-uuid?public=1'),
			locals: {
				supabase: {
					rpc() {
						throw new Error('the route must not query for a malformed id');
					}
				},
				claims: null
			}
		});
		expect(res.status).toBe(404);
	});
});
