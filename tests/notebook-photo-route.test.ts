// tests/notebook-photo-route.test.ts
//
// The notebook photo proxy (/api/notebook/photo/[photo_id]), driven as the
// REAL shipped route handler against a REAL Postgres with the REAL 0069/0071
// policies applied.
//
// WHAT THIS IS ACTUALLY PROVING, and why it is not a mock. The route delegates
// its authorization entirely to row-level security: it reads the photo row
// under the caller's own session and treats "no row" as 404. A hand-written
// mock that returns a row for one user and nothing for another would only be
// me asserting the answer I already expected. So the fixture is the repo's
// existing embedded-Postgres harness -- real migrations, real policies, real
// `set role authenticated` + request.jwt.claims -- and the only thing shimmed
// is PostgREST's wire format, translated into the equivalent SQL. Postgres
// decides who sees what; the test just asks.
//
// THE SHIM IS PINNED TO THE ROUTE'S QUERY. supabaseFor() asserts the table,
// the selected columns and the filter column it was handed. If someone edits
// the route's query, this test fails loudly instead of quietly proving
// something else -- which matters, because a query that dropped the
// `notebook_entries!inner` embed would still pass a looser shim.
//
// Drive is mocked (a local HTTP server via the exported DRIVE_ENDPOINTS
// escape hatch): the real Google side needs a real consent grant, and what is
// under test here is the authorization decision, not Google.
//
// MUTATION-CHECKED, and the check found something worth writing down. Opening
// the notebook_entries policy to `using (true)` does NOT redden this file.
// Neither does opening notebook_entry_photos. Only opening BOTH does -- and
// then exactly the 5 denial assertions below fail while the 6 happy-path ones
// stay green. That is not a weak test; it is the route's two hurdles being
// genuinely independent: the photos policy (notebook_can_read_entry) and the
// `!inner` embed's entries policy each deny a stranger on their own. Worth
// knowing before anyone "simplifies" the query by dropping the embed -- doing
// so would silently leave a single point of failure, and this file would not
// notice, because the surviving policy still denies.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import {
	createClassroomSection,
	createUser,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';
import { DRIVE_ENDPOINTS } from '../src/lib/server/notebook-drive';
import { GET } from '../src/routes/api/notebook/photo/[photo_id]/+server';

let db: TestDb;
let drive: Server;

/** Bytes the mock Drive serves; asserted byte-for-byte on the way out. */
const PHOTO_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0xff, 0xd9]);
/** A file id the mock Drive deliberately fails, to exercise the 502 branch. */
const BROKEN_FILE_ID = 'drive-file-that-drive-cannot-serve';
/**
 * DIFFERENT bytes from PHOTO_BYTES, so a ?size=thumb response can be told
 * apart from the full-size one rather than merely counted.
 */
const THUMB_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 42, 42, 0xff, 0xd9]);
/** A file Drive has not rendered a thumbnail for yet -- the fallback case. */
const NO_THUMB_FILE_ID = 'drive-file-with-no-rendition-yet';
/** Every thumbnail path the route actually fetched, for the size assertion. */
const thumbRequests: string[] = [];

let alice: SeededUser; // owns the entry under test
let bob: SeededUser; // a different student, no relationship to it whatsoever
let instructorA: SeededUser; // instructor of alice's section
let instructorB: SeededUser; // instructor of some OTHER section
let admin: SeededUser; // the 0067 chair tier

let alicePhotoId: string; // the photo every case below asks for
let alicePhotoBrokenId: string; // same entry, but its file id 500s at Drive
let alicePhotoNoThumbId: string; // same entry, but Drive has no rendition for it
let bobPhotoId: string; // bob's own photo, for the mirror-image check

beforeAll(async () => {
	// --- mock Drive -------------------------------------------------------
	drive = createServer((req, res) => {
		const url = new URL(req.url ?? '/', 'http://127.0.0.1');
		if (url.pathname === '/token') {
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ access_token: 'test-access-token', expires_in: 3600 }));
			return;
		}
		// The rendition Drive generates for an image, fetched by the ?size=thumb
		// branch. Served from its own path so a test can tell which of the two
		// the route actually asked for. A PREFIX match, because the route
		// rewrites Drive's own `=s220` size suffix onto the path before
		// fetching -- thumbRequests records what it settled on.
		if (url.pathname.startsWith('/thumb')) {
			thumbRequests.push(url.pathname);
			res.writeHead(200, {
				'content-type': 'image/jpeg',
				'content-length': String(THUMB_BYTES.length)
			});
			res.end(Buffer.from(THUMB_BYTES));
			return;
		}
		if (url.pathname.startsWith('/files/')) {
			const fileId = decodeURIComponent(url.pathname.slice('/files/'.length));
			if (fileId === BROKEN_FILE_ID) {
				res.writeHead(500, { 'content-type': 'text/plain' });
				res.end('drive is having a moment');
				return;
			}
			// A metadata read (no alt=media) is the thumbnail lookup. Every file
			// reports a thumbnailLink EXCEPT NO_THUMB_FILE_ID, which stands for
			// the ordinary case of a photo Drive has not rendered yet.
			if (!url.searchParams.has('alt')) {
				const port = (drive.address() as AddressInfo).port;
				res.writeHead(200, { 'content-type': 'application/json' });
				res.end(
					JSON.stringify(
						fileId === NO_THUMB_FILE_ID
							? {}
							: { thumbnailLink: `http://127.0.0.1:${port}/thumb=s220` }
					)
				);
				return;
			}
			res.writeHead(200, {
				'content-type': 'image/jpeg',
				'content-length': String(PHOTO_BYTES.length)
			});
			res.end(Buffer.from(PHOTO_BYTES));
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
	db = await startTestDb();

	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	bob = await createUser(db, 'bob@boscotech.net', 'Bob Brooks');
	instructorA = await createUser(db, 'instructor.a@boscotech.edu', 'Ada Instructor');
	instructorB = await createUser(db, 'instructor.b@boscotech.edu', 'Ben Instructor');
	admin = await createUser(db, 'chair@boscotech.edu', 'Casey Chair');

	// 0067: admin is an explicit grant, never the 'teacher' role. Both
	// instructors stay non-admin on purpose -- that is what makes
	// instructorB's 404 mean "RLS scoped me to my own section".
	await db.sql(`insert into public.app_admins (email) values ($1) on conflict do nothing`, [
		admin.email
	]);

	// Since 0094 these are CLASSROOM sections and "the instructor" is the
	// teacher of record. Each creates their own, which 0082 allows any staff
	// account to do -- neither needs (or has) the admin tier.
	const sectionAId = await createClassroomSection(db, {
		as: instructorA,
		courseCode: 'ENG1H',
		courseTitle: 'Engineering I Honors',
		label: 'Period 2',
		teacherEmail: instructorA.email
	});
	const sectionBId = await createClassroomSection(db, {
		as: instructorB,
		courseCode: 'ENG1H',
		label: 'Period 5',
		teacherEmail: instructorB.email
	});
	const secA = [{ id: sectionAId }];
	const secB = [{ id: sectionBId }];

	// Alice's entry lives in section A, which is what gives instructorA (and
	// only instructorA) a route to it.
	const { rows: aliceEntry } = await db.sql<{ id: string }>(
		`insert into public.notebook_entries (student_id, section_id, custom_label)
		 values ($1, $2, 'Bearing teardown') returning id`,
		[alice.id, secA[0].id]
	);
	const { rows: aliceP } = await db.sql<{ id: string }>(
		`insert into public.notebook_entry_photos (entry_id, drive_file_id, variant, sequence_order)
		 values ($1, 'drive-alice-1', 'original', 1) returning id`,
		[aliceEntry[0].id]
	);
	alicePhotoId = aliceP[0].id;

	const { rows: aliceBroken } = await db.sql<{ id: string }>(
		`insert into public.notebook_entry_photos (entry_id, drive_file_id, variant, sequence_order)
		 values ($1, $2, 'original', 2) returning id`,
		[aliceEntry[0].id, BROKEN_FILE_ID]
	);
	alicePhotoBrokenId = aliceBroken[0].id;

	const { rows: aliceNoThumb } = await db.sql<{ id: string }>(
		`insert into public.notebook_entry_photos (entry_id, drive_file_id, variant, sequence_order)
		 values ($1, $2, 'original', 3) returning id`,
		[aliceEntry[0].id, NO_THUMB_FILE_ID]
	);
	alicePhotoNoThumbId = aliceNoThumb[0].id;

	const { rows: bobEntry } = await db.sql<{ id: string }>(
		`insert into public.notebook_entries (student_id, section_id, custom_label)
		 values ($1, $2, 'Bob notes') returning id`,
		[bob.id, secB[0].id]
	);
	const { rows: bobP } = await db.sql<{ id: string }>(
		`insert into public.notebook_entry_photos (entry_id, drive_file_id, variant, sequence_order)
		 values ($1, 'drive-bob-1', 'original', 1) returning id`,
		[bobEntry[0].id]
	);
	bobPhotoId = bobP[0].id;
});

afterAll(async () => {
	await db?.stop();
	await new Promise<void>((resolve) => drive?.close(() => resolve()));
});

/**
 * A Supabase-client stand-in over the real database, running as `userId` with
 * RLS on. It implements exactly the one query the route makes, and REFUSES
 * anything else so the test can never drift away from what ships.
 *
 * `notebook_entries!inner(id)` is translated to a real INNER JOIN, which is
 * what that embed means: PostgREST applies RLS to an embedded resource, so an
 * entry the caller cannot read collapses the join and drops the photo row.
 */
function supabaseFor(userId: string) {
	return {
		from(table: string) {
			expect(table).toBe('notebook_entry_photos');
			return {
				select(columns: string) {
					expect(columns).toContain('drive_file_id');
					expect(columns).toContain('notebook_entries!inner');
					return {
						eq(column: string, value: string) {
							expect(column).toBe('id');
							return {
								async maybeSingle() {
									return db.asUser(userId, async (q) => {
										const { rows } = await q<{ drive_file_id: string }>(
											`select p.drive_file_id
											   from public.notebook_entry_photos p
											   join public.notebook_entries e on e.id = p.entry_id
											  where p.id = $1`,
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
	};
}

/**
 * Calls the REAL route handler the way SvelteKit would -- `url` included,
 * because a real RequestEvent always carries one and the route reads its
 * query for the ?size=thumb branch.
 */
function callRoute(photoId: string, userId: string | null, query = ''): Promise<Response> {
	return (GET as unknown as (event: unknown) => Promise<Response>)({
		params: { photo_id: photoId },
		url: new URL(`http://localhost/api/notebook/photo/${photoId}${query}`),
		locals: {
			supabase: userId ? supabaseFor(userId) : null,
			claims: userId ? { sub: userId, role: 'authenticated' } : null
		}
	});
}

describe('GET /api/notebook/photo/[photo_id]', () => {
	it('serves the bytes to the student who owns the entry', async () => {
		const res = await callRoute(alicePhotoId, alice.id);

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('image/jpeg');
		expect(res.headers.get('x-content-type-options')).toBe('nosniff');
		// Per-user content must never land in a shared cache.
		expect(res.headers.get('cache-control')).toContain('private');
		expect(res.headers.get('cache-control')).not.toContain('public');

		const body = new Uint8Array(await res.arrayBuffer());
		expect(body.length).toBe(PHOTO_BYTES.length);
		expect(Array.from(body)).toEqual(Array.from(PHOTO_BYTES));
	});

	// THE CROSS-ACCOUNT DENIAL. Same route, same photo id, different student.
	it('404s for a different student with no relationship to the entry', async () => {
		const res = await callRoute(alicePhotoId, bob.id);

		expect(res.status).toBe(404);
		// Not 403: a 403 would confirm the id is real to someone who may not
		// see it. And no bytes escaped.
		expect(res.status).not.toBe(403);
		const body = new Uint8Array(await res.arrayBuffer());
		expect(Array.from(body)).not.toEqual(Array.from(PHOTO_BYTES));
		expect(res.headers.get('content-type')).not.toBe('image/jpeg');
	});

	it('answers a stranger identically whether or not the photo exists', async () => {
		const real = await callRoute(alicePhotoId, bob.id);
		const imaginary = await callRoute(randomUUID(), bob.id);

		expect(real.status).toBe(404);
		expect(imaginary.status).toBe(404);
		expect(await real.text()).toBe(await imaginary.text());
	});

	it('serves the photo to the instructor of that entry’s section', async () => {
		const res = await callRoute(alicePhotoId, instructorA.id);
		expect(res.status).toBe(200);
		expect(new Uint8Array(await res.arrayBuffer()).length).toBe(PHOTO_BYTES.length);
	});

	it('404s for an instructor of a different section', async () => {
		const res = await callRoute(alicePhotoId, instructorB.id);
		expect(res.status).toBe(404);
	});

	it('serves the photo to the chair tier (0067 admin)', async () => {
		const res = await callRoute(alicePhotoId, admin.id);
		expect(res.status).toBe(200);
		expect(new Uint8Array(await res.arrayBuffer()).length).toBe(PHOTO_BYTES.length);
	});

	it('denies in both directions: alice cannot read bob’s photo either', async () => {
		expect((await callRoute(bobPhotoId, bob.id)).status).toBe(200);
		expect((await callRoute(bobPhotoId, alice.id)).status).toBe(404);
	});

	it('401s with no session, before touching the database', async () => {
		const res = await callRoute(alicePhotoId, null);
		expect(res.status).toBe(401);
	});

	it('404s a malformed id without a database round trip', async () => {
		// locals.supabase is deliberately a client that throws if used: the
		// route must reject the shape first.
		const res = await (GET as unknown as (event: unknown) => Promise<Response>)({
			params: { photo_id: 'not-a-uuid' },
			url: new URL('http://localhost/api/notebook/photo/not-a-uuid'),
			locals: {
				supabase: {
					from() {
						throw new Error('the route queried the database for a malformed id');
					}
				},
				claims: { sub: alice.id, role: 'authenticated' }
			}
		});
		expect(res.status).toBe(404);
	});

	it('502s (not 404) when Drive fails for a caller who IS authorized', async () => {
		const res = await callRoute(alicePhotoBrokenId, alice.id);
		// The distinction matters: 404 means "you may not see this", 502 means
		// "you may, and we could not fetch it" -- which is what the UI's
		// per-photo fallback card is for.
		expect(res.status).toBe(502);
	});

	it('still 404s that same broken photo for a stranger, before reaching Drive', async () => {
		const res = await callRoute(alicePhotoBrokenId, bob.id);
		expect(res.status).toBe(404);
	});
});

/**
 * ?size=thumb (0088) serves Drive's own small rendition, for the collapsed
 * feed's tiles. The claim worth pinning is not that it is smaller -- it is
 * that it is applied strictly AFTER authorization and can only ever shrink a
 * response, never produce one that would otherwise have been refused.
 */
describe('GET /api/notebook/photo/[photo_id]?size=thumb', () => {
	it('serves the thumbnail rendition, not the full file', async () => {
		thumbRequests.length = 0;
		const res = await callRoute(alicePhotoId, alice.id, '?size=thumb');
		expect(res.status).toBe(200);
		const body = new Uint8Array(await res.arrayBuffer());
		expect([...body]).toEqual([...THUMB_BYTES]);
		// Drive's own link carries `=s220`; the route asks for the size the
		// feed renders at instead, which is the whole reason it rewrites it.
		expect(thumbRequests).toEqual(['/thumb=s400']);
		// And the full-size route is genuinely still the other one.
		const full = await callRoute(alicePhotoId, alice.id);
		expect([...new Uint8Array(await full.arrayBuffer())]).toEqual([...PHOTO_BYTES]);
	});

	it('falls back to the full image when Drive has no rendition yet', async () => {
		// The ordinary state for a photo uploaded seconds ago. A missing
		// thumbnail must never mean a missing photo.
		const res = await callRoute(alicePhotoNoThumbId, alice.id, '?size=thumb');
		expect(res.status).toBe(200);
		expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([...PHOTO_BYTES]);
	});

	it('grants nothing: a stranger is refused with size=thumb exactly as without', async () => {
		// The decisive one. If the parameter were read before the RLS query --
		// or opened any path around it -- this is where it would show.
		expect((await callRoute(alicePhotoId, bob.id, '?size=thumb')).status).toBe(404);
		expect((await callRoute(alicePhotoId, null, '?size=thumb')).status).toBe(401);
		expect((await callRoute(randomUUID(), alice.id, '?size=thumb')).status).toBe(404);
	});

	it('still 502s a genuinely broken file rather than silently serving nothing', async () => {
		const res = await callRoute(alicePhotoBrokenId, alice.id, '?size=thumb');
		expect(res.status).toBe(502);
	});
});
