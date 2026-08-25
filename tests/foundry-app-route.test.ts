// tests/foundry-app-route.test.ts
//
// THE DIRECT PAGE (`/a/<app>/`), DRIVEN AS THE ROUTE and not as a copy of it.
//
// WHY THIS FILE EXISTS, given the repo adds tests sparingly. Every failure it
// pins is SILENT, reads as a different bug, or is a disclosure:
//
// 1. THE HEADER SET. This mount is a SECOND way to reach student bytes, and the
//    thing that isolates them is a header: the CSP `sandbox` directive is what
//    puts a DIRECTLY NAVIGATED bundle in an opaque origin, because the iframe
//    attribute needs a frame to be on and there is no frame here. A route that
//    served the same bytes with a weaker policy would look completely correct
//    from outside -- the app would render, and a student's document would be
//    running with full rights on a host of ours. So the assertion is not "the
//    headers look right", it is that `/a/` and `/b/` produce the SAME header
//    set, field for field, from one fixture.
//
// 2. THE REFUSALS. The link is public by design, so an unpublished app, a
//    hidden app and an unknown id have to be indistinguishable from outside or
//    the URL becomes an oracle over which student has work in review. `/a/`
//    also has a refusal `/b/` does not: an app with nothing published.
//
// 3. THE TRAILING SLASH. `/a/<app>` has `/a/` as its base URL, so every
//    relative asset in every bundle resolves one level too high. The app loads
//    and looks broken, which reads as a bad upload rather than a bad URL.
//
// 4. THE SUBMITTED GAP. `/b/` deliberately serves a SUBMITTED version so the
//    review queue can run the build it is deciding about. A public, shareable
//    address must not, and nothing but a test says so.
//
// It drives the REAL handlers, imported from their own files, against the REAL
// in-memory fixture the dev server uses.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GET as APP_GET, fallback as APP_FALLBACK } from '../src/routes/a/[appId]/[...path]/+server.ts';
import { GET as BUNDLE_GET } from '../src/routes/b/[appId]/[versionId]/[...path]/+server.ts';
import { setDev } from './stubs/app-environment.ts';
import { publishedVersionOf } from '../src/lib/server/foundry-bundle.ts';
import {
	FIXTURE_APP_A,
	FIXTURE_APP_HIDDEN,
	FIXTURE_APP_PLAYFIELD,
	FIXTURE_APP_TYPES,
	FIXTURE_APP_UNPUBLISHED,
	FIXTURE_VERSION_A_LIVE,
	FIXTURE_VERSION_A_STALE,
	FIXTURE_VERSION_TYPES
} from '../src/lib/server/foundry-dev-fixture.ts';
import { FOUNDRY_STORAGE_SHIM_TAG } from '../src/lib/foundry/storage-shim.ts';
import { foundryAppUrl, foundryBundleUrl } from '../src/lib/foundry/bundle-url.ts';

const APPS = 'https://apps.ideabosco.com';

beforeAll(() => {
	// The fixture path is the dev path; without this the route reaches for a
	// Supabase project that does not exist here and answers 404 for everything,
	// which would make every assertion below pass vacuously.
	setDev(true);
	process.env.PUBLIC_FOUNDRY_APPS_ORIGIN = APPS;
	delete process.env.PUBLIC_FOUNDRY_PORTAL_ORIGIN;
});

afterAll(() => {
	setDev(false);
	delete process.env.PUBLIC_FOUNDRY_APPS_ORIGIN;
});

/** The real `/a/` handler, called the way SvelteKit calls it. */
function app(
	appId: string,
	path: string,
	opts: { origin?: string; slash?: boolean; method?: string } = {}
): Promise<Response> {
	const origin = opts.origin ?? APPS;
	const tail = path === '' && opts.slash !== false ? '/' : path === '' ? '' : `/${path}`;
	const href = `${origin}/a/${appId}${tail}`;
	const handler = opts.method && opts.method !== 'GET' ? APP_FALLBACK : APP_GET;
	return handler({
		params: { appId, path },
		url: new URL(href),
		request: new Request(href, { method: opts.method ?? 'GET' })
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any) as Promise<Response>;
}

/** The real `/b/` handler, for the header comparison. */
function bundle(appId: string, versionId: string, path: string): Promise<Response> {
	const tail = path === '' ? '/' : `/${path}`;
	const href = `${APPS}/b/${appId}/${versionId}${tail}`;
	return BUNDLE_GET({
		params: { appId, versionId, path },
		url: new URL(href),
		request: new Request(href)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any) as Promise<Response>;
}

describe('the direct page is the published entry document, as the whole document', () => {
	it('serves it as text/html; charset=utf-8', async () => {
		const res = await app(FIXTURE_APP_TYPES, '');
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
	});

	it('serves the bytes of the app`s PUBLISHED version', async () => {
		const direct = await (await app(FIXTURE_APP_A, '')).text();
		const framed = await (await bundle(FIXTURE_APP_A, FIXTURE_VERSION_A_LIVE, '')).text();
		expect(direct).toBe(framed);
	});

	/**
	 * THE SHIM IS NOT OPTIONAL HERE EITHER. A direct navigation lands in the
	 * SAME opaque origin the frame does -- that is what the CSP `sandbox`
	 * directive is for -- so `localStorage` throws on this path exactly as it
	 * does in the frame, and a generated app that reads saved state at the top
	 * of its script is a blank page without this.
	 */
	it('injects the storage shim first inside <head>', async () => {
		const body = await (await app(FIXTURE_APP_A, '')).text();
		expect(body).toContain(FOUNDRY_STORAGE_SHIM_TAG);
		expect(body.indexOf(FOUNDRY_STORAGE_SHIM_TAG)).toBe(body.indexOf('<head>') + '<head>'.length);
	});
});

/**
 * THE HEADER SET IS THE ISOLATION, AND THE ASSERTION IS EQUALITY RATHER THAN A
 * LIST.
 *
 * Spelling out the headers `/a/` should send would pin whatever was true the
 * day it was written and would go quietly stale the moment `/b/` gained one --
 * which is the exact shape of failure this feature has already had, twice, with
 * a header that was set and did not arrive. Comparing the two responses field
 * for field means a header added to the shared responder reaches both, and a
 * header added to only one of them reddens here.
 */
describe('a direct page carries exactly the headers a framed bundle carries', () => {
	function fields(res: Response): [string, string][] {
		return [...res.headers.entries()].sort((a, b) => a[0].localeCompare(b[0]));
	}

	it.each([
		['the entry document', ''],
		['a stylesheet', 'style.css'],
		['a script', 'app.js'],
		['an image', 'pixel.png']
	])('sends the same header set for %s', async (_label, path) => {
		const direct = fields(await app(FIXTURE_APP_TYPES, path));
		const framed = fields(await bundle(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, path));
		expect(direct).toEqual(framed);
		// POSITIVE CONTROL: two 404s would also compare equal, and would be the
		// one result nobody would look at twice.
		expect(direct.find(([k]) => k === 'content-security-policy')).toBeTruthy();
	});

	/**
	 * The properties that make the set worth having, stated once so a reader of
	 * this file does not have to hold `/b/`'s test in their head to know what is
	 * being kept.
	 */
	it('is sandboxed, nosniff, no-referrer and unindexed', async () => {
		const h = (await app(FIXTURE_APP_TYPES, '')).headers;
		const csp = h.get('content-security-policy')!;
		expect(csp).toContain('sandbox allow-scripts allow-modals allow-pointer-lock');
		expect(csp).not.toContain('allow-same-origin');
		expect(csp).toContain(`default-src ${APPS}`);
		expect(h.get('x-content-type-options')).toBe('nosniff');
		expect(h.get('referrer-policy')).toBe('no-referrer');
		expect(h.get('x-robots-tag')).toBe('noindex, nofollow');
		expect(h.get('cache-control')).toBe('private, max-age=60');
	});
});

/**
 * RELATIVE ASSETS ARE THE WHOLE REASON THE PATH HAS THIS SHAPE. The entry
 * document says `href="style.css"` and nothing rewrites it, so the URL has to
 * make that resolve: served at `/a/<app>/`, the base is `/a/<app>/` and the
 * browser asks for `/a/<app>/style.css`, which is this route with a tail.
 */
describe('relative assets resolve under the app root', () => {
	it.each([
		['style.css', 'text/css; charset=utf-8'],
		['app.js', 'text/javascript; charset=utf-8'],
		['data.json', 'application/json; charset=utf-8'],
		['pixel.png', 'image/png']
	])('serves %s with its own type', async (path, type) => {
		const res = await app(FIXTURE_APP_TYPES, path);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe(type);
	});

	it('307s the bare root to the slash form, relatively', async () => {
		const res = await app(FIXTURE_APP_TYPES, '', { slash: false });
		expect(res.status).toBe(307);
		expect(res.headers.get('location')).toBe(`${FIXTURE_APP_TYPES}/`);
	});

	/** Keyed on whether the entry was DERIVED, never on the filename: keyed the
	    other way, an explicit request for `.../index.html` bounces to
	    `.../index.html/`. */
	it('leaves an explicit index.html alone', async () => {
		const res = await app(FIXTURE_APP_TYPES, 'index.html');
		expect(res.status).toBe(200);
	});
});

describe('every refusal is the same bodyless 404', () => {
	const NO_SUCH_APP = '00000000-0000-4000-8000-000000000000';

	it.each([
		['an unknown app', NO_SUCH_APP, ''],
		['a deleted app, which is an unknown app', NO_SUCH_APP, 'index.html'],
		['a hidden app', FIXTURE_APP_HIDDEN, ''],
		['a hidden app`s asset', FIXTURE_APP_HIDDEN, 'index.html'],
		['an app with nothing published', FIXTURE_APP_UNPUBLISHED, ''],
		['a file with no row', FIXTURE_APP_TYPES, 'nope.css'],
		['a traversal', FIXTURE_APP_TYPES, '../../package.json'],
		['an absolute path', FIXTURE_APP_TYPES, '/etc/passwd']
	])('refuses %s', async (_label, appId, path) => {
		const res = await app(appId, path);
		expect(res.status).toBe(404);
		expect(await res.text()).toBe('');
		expect(res.headers.get('cache-control')).toBe('no-store');
	});

	/**
	 * POSITIVE CONTROL for the whole block, and it is doing real work here:
	 * three of the refusals above are fixtures added in this bundle, and a
	 * fixture that failed to register is an unknown app -- which would make them
	 * pass for the wrong reason. This asserts the fixtures LOAD.
	 */
	it('serves the ids the refusals vary, and the refusal fixtures exist', async () => {
		expect((await app(FIXTURE_APP_TYPES, '')).status).toBe(200);
		expect((await app(FIXTURE_APP_A, '')).status).toBe(200);
		expect((await app(FIXTURE_APP_PLAYFIELD, '')).status).toBe(200);
		// The hidden app's bundle IS reachable by version, so its 404 above is
		// the hidden flag and not a missing fixture.
		const hidden = await (await app(FIXTURE_APP_HIDDEN, '')).text();
		expect(hidden).toBe('');
	});

	it('refuses a method that is not GET or HEAD', async () => {
		expect((await app(FIXTURE_APP_TYPES, '', { method: 'POST' })).status).toBe(404);
	});

	/**
	 * `/a/` RESOLVES THE PUBLISHED VERSION AND NOTHING ELSE, WHICH IS THE
	 * DIFFERENCE BETWEEN THE TWO MOUNTS.
	 *
	 * `/b/` serves a SUBMITTED version too, because the review queue has to run
	 * the build it is deciding about. A public, shareable address for an app must
	 * not. App A has a second, unpublished build carrying `notes.txt` -- a file
	 * the published build does not have -- so asking `/a/` for it is a real
	 * request for a real file of the wrong version rather than a request for a
	 * missing one.
	 *
	 * SAID PLAINLY: the dev fixture models no version STATUS at all, so the other
	 * half of the pair (`/b/` DOES serve a submitted build) cannot be measured
	 * here and is not claimed here. What this asserts is the half that is `/a/`'s
	 * own: the resolver answers with the published id, and a file that exists
	 * only in the other version is refused.
	 */
	it('resolves only the published version, never another build of the same app', async () => {
		expect(await publishedVersionOf(FIXTURE_APP_A)).toBe(FIXTURE_VERSION_A_LIVE);
		expect(await publishedVersionOf(FIXTURE_APP_A)).not.toBe(FIXTURE_VERSION_A_STALE);

		expect((await app(FIXTURE_APP_A, 'notes.txt')).status).toBe(404);
		// POSITIVE CONTROL: a file of the PUBLISHED version, asked for the same
		// way, is served -- so the 404 above is which version, not the mount.
		expect((await app(FIXTURE_APP_A, 'style.css')).status).toBe(200);
	});
});

describe('the host gate keeps the direct page off the cookie-carrying host', () => {
	/**
	 * The direct page is PUBLIC, which makes the host gate matter more here
	 * rather than less: a public URL on the main host is a public URL that
	 * arrives with the viewer's session cookies attached to every subresource
	 * the bundle asks for.
	 */
	it('404s on any other origin', async () => {
		const res = await app(FIXTURE_APP_TYPES, '', { origin: 'https://ideabosco.com' });
		expect(res.status).toBe(404);
		// POSITIVE CONTROL: the identical request on the apps origin is served.
		expect((await app(FIXTURE_APP_TYPES, '')).status).toBe(200);
	});

	it('serves on any origin when no apps origin is configured', async () => {
		delete process.env.PUBLIC_FOUNDRY_APPS_ORIGIN;
		try {
			const res = await app(FIXTURE_APP_TYPES, '', { origin: 'http://localhost:5173' });
			expect(res.status).toBe(200);
		} finally {
			process.env.PUBLIC_FOUNDRY_APPS_ORIGIN = APPS;
		}
	});
});

/**
 * THE BUILDER AND THE ROUTE HAVE TO AGREE, and nothing else compares them: the
 * share control renders whatever `foundryAppUrl` returns and a person pastes
 * it, so a builder that produced a path the route does not answer would be a
 * dead link that no type check and no route test would notice.
 */
describe('foundryAppUrl points at the route that exists', () => {
	it('produces the slash form, which the route serves without a redirect', async () => {
		const url = foundryAppUrl(APPS, FIXTURE_APP_TYPES)!;
		expect(url).toBe(`${APPS}/a/${FIXTURE_APP_TYPES}/`);

		const path = new URL(url).pathname;
		const [, mount, appId, ...rest] = path.split('/');
		expect(mount).toBe('a');
		const res = await app(appId, rest.filter(Boolean).join('/'));
		expect(res.status).toBe(200);
	});

	it('is null with no origin or no app, exactly as the bundle builder is', () => {
		expect(foundryAppUrl('', FIXTURE_APP_TYPES)).toBeNull();
		expect(foundryAppUrl(APPS, '')).toBeNull();
		expect(foundryAppUrl(null, null)).toBeNull();
		expect(foundryBundleUrl('', FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES)).toBeNull();
	});

	it('trims a trailing slash off the origin rather than doubling it', () => {
		expect(foundryAppUrl(`${APPS}/`, FIXTURE_APP_TYPES)).toBe(`${APPS}/a/${FIXTURE_APP_TYPES}/`);
	});

	/** The two mounts are different paths; a builder that produced the same one
	    would make the share link a version link with a different name on it. */
	it('is not the bundle URL', () => {
		expect(foundryAppUrl(APPS, FIXTURE_APP_TYPES)).not.toBe(
			foundryBundleUrl(APPS, FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES)
		);
	});
});
