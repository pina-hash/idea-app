// tests/foundry-download-route.test.ts
//
// THE DOWNLOAD MOUNT (`/foundry/download/<app>/<version>`), DRIVEN AS THE ROUTE
// and not as a copy of it.
//
// WHY THIS FILE EXISTS, given the repo adds tests sparingly. Every failure it
// pins is SILENT, is a disclosure, or is both:
//
// 1. THE AUTHOR CHECK. This route hands over a student's ENTIRE bundle -- every
//    file of every build, draft and rejected ones included -- to whoever asks.
//    It is the widest single response in the subsystem, and the only thing
//    between one student's work and every other signed-in account is
//    `previewViewerMayRun`. A gate that stopped biting would look perfect from
//    the author's own browser (their download would still work) and would be
//    discovered by somebody guessing two uuids.
//
// 2. THE ROUND TRIP. The whole reason the archive is rebuilt from
//    `student_app_files` rather than handed back from `foundry-uploads` is that
//    what a student gets back has to be re-uploadable and produce the same app.
//    That is a property of the writer and the reader agreeing, and it is
//    asserted here by reading the response back through `./zip.ts` -- the SAME
//    reader the preflight and `foundry-ingest` use -- rather than by trusting
//    that `buildZip` is correct because it is also used elsewhere.
//
// 3. THE RESPONSE IS NOT A DOCUMENT. It is an attachment on the PORTAL origin,
//    which is the host holding the session cookies. A content type or a
//    disposition that drifted would make a student's own `index.html` a
//    navigable document on that host, which is the exact thing the origin split
//    exists to prevent -- and it would render perfectly.
//
// It drives the REAL handler, imported from its own file, against the REAL
// in-memory fixture the dev server uses.
//
// WHAT THE FIXTURE CAN AND CANNOT STAND IN FOR, said once. Fixture apps carry
// no `owner` column, so `downloadBundleZip`'s dev branch states one -- every
// fixture app is owned by `FIXTURE_VIEWER` -- which is what lets the author /
// not-author / admin split be driven through the real handler. Fixture versions
// carry no `ordinal`, so the filename's version segment is exercised against
// `foundryDownloadFilename` directly rather than through the route.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
	GET as DOWNLOAD_GET,
	HEAD as DOWNLOAD_HEAD,
	fallback as DOWNLOAD_FALLBACK
} from '../src/routes/foundry/download/[appId]/[versionId]/+server.ts';
import { setDev } from './stubs/app-environment.ts';
import {
	FOUNDRY_DOWNLOAD_PREFIX,
	foundryDownloadFilename,
	foundryDownloadUrl,
	foundryDownloadable,
	foundryPreviewable
} from '../src/lib/foundry/bundle-url.ts';
import { readCentralDirectory, inflateEntry } from '../src/lib/foundry/zip.ts';
import {
	FIXTURE_APP_A,
	FIXTURE_APP_B,
	FIXTURE_APP_HIDDEN,
	FIXTURE_APP_TYPES,
	FIXTURE_VERSION_A_LIVE,
	FIXTURE_VERSION_A_STALE,
	FIXTURE_VERSION_B_LIVE,
	FIXTURE_VERSION_HIDDEN,
	FIXTURE_VERSION_TYPES,
	FIXTURE_VIEWER,
	fixtureVersion
} from '../src/lib/server/foundry-dev-fixture.ts';

const PORTAL = 'https://ideabosco.com';
const APPS = 'https://apps.ideabosco.com';

/** A second signed-in student. Not the author of anything in the fixture. */
const OTHER_STUDENT = '88888888-8888-4888-8888-888888888888';

beforeAll(() => {
	// The fixture path is the dev path; without this the handler reaches for a
	// Supabase project that does not exist here and answers 404 for everything,
	// which would make every refusal below pass vacuously.
	setDev(true);
	process.env.PUBLIC_FOUNDRY_APPS_ORIGIN = APPS;
});

afterAll(() => {
	setDev(false);
	delete process.env.PUBLIC_FOUNDRY_APPS_ORIGIN;
});

/**
 * A stand-in for the caller's own Supabase client, answering only the one RPC
 * the route asks it. The REAL `isAdmin` helper runs against this, so admin-ness
 * goes through the same code path production does rather than being injected
 * past it.
 */
function client(admin: boolean) {
	return {
		rpc: async (fn: string) => {
			if (fn === 'is_admin') return { data: admin, error: null };
			return { data: null, error: { code: 'PGRST202', message: 'unexpected rpc' } };
		}
	};
}

type Who = { uid: string | null; admin?: boolean };

/** The AUTHOR of every fixture app, per `downloadBundleZip`'s dev branch. */
const AUTHOR: Who = { uid: FIXTURE_VIEWER };
const STRANGER: Who = { uid: OTHER_STUDENT };
const ADMIN: Who = { uid: OTHER_STUDENT, admin: true };
const ANONYMOUS: Who = { uid: null };

/** The real download handler, called the way SvelteKit calls it. */
function download(
	appId: string,
	versionId: string,
	who: Who,
	opts: { origin?: string; method?: string } = {}
): Promise<Response> {
	const origin = opts.origin ?? PORTAL;
	const href = `${origin}${FOUNDRY_DOWNLOAD_PREFIX}${appId}/${versionId}`;
	const method = opts.method ?? 'GET';
	const handler =
		method === 'GET' ? DOWNLOAD_GET : method === 'HEAD' ? DOWNLOAD_HEAD : DOWNLOAD_FALLBACK;
	return handler({
		params: { appId, versionId },
		url: new URL(href),
		request: new Request(href, { method }),
		locals: {
			claims: who.uid ? { sub: who.uid } : null,
			supabase: client(who.admin === true)
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any) as Promise<Response>;
}

/** Read a response's archive back with the reader ingest itself uses. */
async function unzip(res: Response): Promise<Map<string, Uint8Array>> {
	const bytes = new Uint8Array(await res.arrayBuffer());
	const records = readCentralDirectory(bytes);
	expect(records).not.toBeNull();
	const out = new Map<string, Uint8Array>();
	for (const record of records!) {
		if (record.directory) continue;
		out.set(record.name, await inflateEntry(bytes, record, record.name));
	}
	return out;
}

/* ========================================================================
 * 1. THE THING THE FEATURE IS FOR: the author gets their whole build back.
 * ===================================================================== */

describe('the author gets the stored bundle back, whole', () => {
	it('answers 200 with a zip named for the app', async () => {
		const res = await download(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, AUTHOR);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('application/zip');
		expect(res.headers.get('content-disposition')).toBe(
			'attachment; filename="served-types.zip"'
		);
	});

	/**
	 * THE ROUND TRIP, AND IT IS THE CENTRAL CLAIM OF THE WHOLE DESIGN. The
	 * decision to rebuild from `student_app_files` rather than hand back the raw
	 * upload rests on the result being re-uploadable, so this reads the response
	 * back with `./zip.ts` -- the reader the preflight and the ingest function
	 * both use -- and compares every path and every byte against the rows the
	 * serving route would answer from.
	 *
	 * The fixture is `FIXTURE_APP_TYPES` deliberately: nine files, one per
	 * allowed extension, INCLUDING binary ones (a PNG, a woff2, an ico). A
	 * text-only fixture would pass on a writer that mangled bytes.
	 */
	it('round-trips every stored path and every byte, through the real zip reader', async () => {
		const res = await download(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, AUTHOR);
		const got = await unzip(res);

		const stored = fixtureVersion(FIXTURE_VERSION_TYPES)!.files;
		expect(got.size).toBe(stored.size);
		expect(got.size).toBeGreaterThan(1);

		for (const [path, f] of stored) {
			expect(got.has(path), `${path} is missing from the archive`).toBe(true);
			expect(Array.from(got.get(path)!), path).toEqual(Array.from(f.bytes));
		}
	});

	/**
	 * A BUILD THE PUBLISHED MOUNTS REFUSE IS STILL THE AUTHOR'S TO TAKE, which
	 * is what "any version of an app they own" means. `FIXTURE_VERSION_A_STALE`
	 * is not its app's published version, which is the shape a draft has.
	 */
	it('serves a version the published gate would refuse', async () => {
		const res = await download(FIXTURE_APP_A, FIXTURE_VERSION_A_STALE, AUTHOR);
		expect(res.status).toBe(200);
		expect((await unzip(res)).size).toBeGreaterThan(0);
	});

	it('serves the live version too, so the control is not status-shaped', async () => {
		const res = await download(FIXTURE_APP_A, FIXTURE_VERSION_A_LIVE, AUTHOR);
		expect(res.status).toBe(200);
	});

	it('answers HEAD with the same headers and no body', async () => {
		const get = await download(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, AUTHOR);
		const head = await download(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, AUTHOR, {
			method: 'HEAD'
		});
		expect(head.status).toBe(200);
		expect(head.headers.get('content-length')).toBe(get.headers.get('content-length'));
		expect(head.headers.get('content-disposition')).toBe(
			get.headers.get('content-disposition')
		);
		expect((await head.arrayBuffer()).byteLength).toBe(0);
	});

	it('states a content-length that is the archive it actually sent', async () => {
		const res = await download(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, AUTHOR);
		const declared = Number(res.headers.get('content-length'));
		expect(declared).toBeGreaterThan(0);
		expect((await res.arrayBuffer()).byteLength).toBe(declared);
	});
});

/* ========================================================================
 * 2. THE BOUNDARY. Nobody but the author and an admin.
 * ===================================================================== */

describe('everyone who is not the author or an admin gets the same bodyless 404', () => {
	async function refused(res: Response) {
		expect(res.status).toBe(404);
		expect((await res.arrayBuffer()).byteLength).toBe(0);
		expect(res.headers.get('content-disposition')).toBeNull();
	}

	/**
	 * THE ONE THAT MATTERS MOST, and it carries its own positive control: the
	 * SAME app and the SAME version answered 200 to its author two describes up,
	 * so a 404 here is the gate rather than a broken fixture. The control is
	 * re-taken in this test rather than assumed from that one.
	 */
	it('refuses a second student the author`s bundle', async () => {
		const mine = await download(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, AUTHOR);
		expect(mine.status).toBe(200);
		await refused(await download(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, STRANGER));
	});

	it('refuses a second student an unpublished build, which is the disclosure', async () => {
		await refused(await download(FIXTURE_APP_A, FIXTURE_VERSION_A_STALE, STRANGER));
	});

	it('refuses a caller with no session', async () => {
		await refused(await download(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, ANONYMOUS));
	});

	it('is indistinguishable from an app that does not exist', async () => {
		const missing = await download(
			'00000000-0000-4000-8000-000000000000',
			FIXTURE_VERSION_TYPES,
			AUTHOR
		);
		const forbidden = await download(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, STRANGER);
		expect(missing.status).toBe(forbidden.status);
		expect([...missing.headers].map(([k]) => k).sort()).toEqual(
			[...forbidden.headers].map(([k]) => k).sort()
		);
	});

	/**
	 * THE PAIRING IS CHECKED, not left to the caller. Both ids come off the URL,
	 * so a version belonging to another app has to be refused by the same
	 * predicate that decides ownership -- otherwise the ownership check is
	 * running against the wrong row, and the author of app A could name app A
	 * and a version of app B.
	 */
	it('refuses a version that belongs to a different app, even to its author', async () => {
		await refused(await download(FIXTURE_APP_A, FIXTURE_VERSION_B_LIVE, AUTHOR));
		await refused(await download(FIXTURE_APP_B, FIXTURE_VERSION_A_LIVE, AUTHOR));
	});

	it('refuses anything that is not GET or HEAD', async () => {
		for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
			await refused(await download(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, AUTHOR, { method }));
		}
	});

	/**
	 * NOT ON THE APPS ORIGIN. There is no session there, so it would refuse
	 * anyway -- but that implicit refusal rests on the session cookies being
	 * host-only, which is a property of `@supabase/ssr`'s defaults rather than of
	 * this feature. The positive control is the identical request on the portal.
	 */
	it('refuses a download arriving on the apps origin, to the author', async () => {
		const portal = await download(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, AUTHOR);
		expect(portal.status).toBe(200);
		await refused(
			await download(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, AUTHOR, { origin: APPS })
		);
	});
});

describe('an admin takes what a student cannot', () => {
	it('takes another student`s build', async () => {
		const theirs = await download(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, STRANGER);
		expect(theirs.status).toBe(404);
		const staff = await download(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, ADMIN);
		expect(staff.status).toBe(200);
		expect((await unzip(staff)).size).toBeGreaterThan(0);
	});

	/**
	 * THE HIDDEN RULE, IN BOTH DIRECTIONS IN ONE TEST. A shelved app is refused
	 * to its OWNER (0130 refuses their edit of one, 0136 their delete) and served
	 * to an ADMIN, who is the person who shelved it.
	 */
	it('takes a shelved app, which its owner does not', async () => {
		const owner = await download(FIXTURE_APP_HIDDEN, FIXTURE_VERSION_HIDDEN, AUTHOR);
		expect(owner.status).toBe(404);
		const staff = await download(FIXTURE_APP_HIDDEN, FIXTURE_VERSION_HIDDEN, ADMIN);
		expect(staff.status).toBe(200);
	});
});

/* ========================================================================
 * 3. THE RESPONSE IS AN ATTACHMENT, NOT A DOCUMENT.
 * ===================================================================== */

describe('the response cannot become a document on the portal origin', () => {
	it('is an attachment, nosniff, unstored, unindexed and referrer-free', async () => {
		const res = await download(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, AUTHOR);
		expect(res.headers.get('content-type')).toBe('application/zip');
		expect(res.headers.get('content-disposition')).toMatch(/^attachment; /);
		expect(res.headers.get('x-content-type-options')).toBe('nosniff');
		expect(res.headers.get('cache-control')).toContain('private');
		expect(res.headers.get('cache-control')).toContain('no-store');
		expect(res.headers.get('referrer-policy')).toBe('no-referrer');
		expect(res.headers.get('x-robots-tag')).toContain('noindex');
	});

	/**
	 * NO `text/html` REACHES A CALLER FROM THIS ROUTE, whatever is in the bundle.
	 * `FIXTURE_APP_TYPES` contains an `index.html`, an `.svg` and a `.json` --
	 * every stored content type the serving route knows how to emit -- and all of
	 * them leave here inside one `application/zip` body.
	 */
	it('never emits the bundle`s own content types', async () => {
		const res = await download(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, AUTHOR);
		const type = res.headers.get('content-type') ?? '';
		expect(type).not.toContain('html');
		expect(type).not.toContain('svg');
	});
});

/* ========================================================================
 * 4. THE PURE HELPERS.
 * ===================================================================== */

describe('foundryDownloadUrl', () => {
	it('names the app and the version, on the portal, with no origin and no slash', () => {
		expect(foundryDownloadUrl('app-1', 'ver-2')).toBe('/foundry/download/app-1/ver-2');
	});

	it('is null when it has nothing to point at, so no control is offered', () => {
		expect(foundryDownloadUrl(null, 'v')).toBeNull();
		expect(foundryDownloadUrl('a', null)).toBeNull();
		expect(foundryDownloadUrl('  ', 'v')).toBeNull();
		expect(foundryDownloadUrl('a', '  ')).toBeNull();
	});

	it('encodes each segment', () => {
		expect(foundryDownloadUrl('a/b', 'c d')).toBe('/foundry/download/a%2Fb/c%20d');
	});
});

describe('foundryDownloadFilename', () => {
	it('is the address and the build number', () => {
		expect(foundryDownloadFilename('space-shooter', 3)).toBe('space-shooter-v3.zip');
	});

	it('drops the version segment when there is no ordinal', () => {
		expect(foundryDownloadFilename('space-shooter', null)).toBe('space-shooter.zip');
		expect(foundryDownloadFilename('space-shooter', 0)).toBe('space-shooter.zip');
	});

	/**
	 * THE HEADER CANNOT BE SHAPED BY THE COLUMN. The slug charset already forbids
	 * all of this, but the route reads it through a service-role client that
	 * bypasses every check RLS would have made, and the value is interpolated
	 * into a response header -- which is the one place a stray quote or newline
	 * stops being cosmetic.
	 */
	it('refuses to put anything but the slug charset in a header', () => {
		expect(foundryDownloadFilename('a"b', 1)).toBe('a-b-v1.zip');
		expect(foundryDownloadFilename('a\r\nb', 1)).toBe('a-b-v1.zip');
		expect(foundryDownloadFilename('../../etc/passwd', 1)).toBe('etc-passwd-v1.zip');
		expect(foundryDownloadFilename('CafÉ', 1)).toBe('caf-v1.zip');
		expect(foundryDownloadFilename('', 1)).toBe('app-v1.zip');
		expect(foundryDownloadFilename(null, 1)).toBe('app-v1.zip');
		expect(foundryDownloadFilename('!!!', 1)).toBe('app-v1.zip');
	});

	it('bounds the length, so a header cannot be grown by a column', () => {
		expect(foundryDownloadFilename('a'.repeat(500), 1)).toBe(`${'a'.repeat(64)}-v1.zip`);
	});
});

/**
 * ONE GATE, ONE MIRROR. `foundryDownloadable` is `foundryPreviewable` by
 * ASSIGNMENT and not by resemblance -- the server decides both controls with
 * `previewViewerMayRun`, so a second surface predicate would be a second copy
 * of "an upload that never unpacked, and a shelved app". Asserting the identity
 * is what makes "they cannot drift" mechanical rather than a comment.
 */
describe('foundryDownloadable is the preview mirror, not a second copy of it', () => {
	it('is the same function object', () => {
		expect(foundryDownloadable).toBe(foundryPreviewable);
	});

	it('refuses a bundle that never unpacked and a shelved app, and admits the rest', () => {
		const live = { hidden_at: null };
		const shelved = { hidden_at: '2026-01-01T00:00:00Z' };
		expect(foundryDownloadable(live, { file_count: 3 })).toBe(true);
		expect(foundryDownloadable(live, { file_count: 0 })).toBe(false);
		expect(foundryDownloadable(shelved, { file_count: 3 })).toBe(false);
		expect(foundryDownloadable(null, { file_count: 3 })).toBe(false);
		expect(foundryDownloadable(live, null)).toBe(false);
	});
});
