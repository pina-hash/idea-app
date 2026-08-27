// tests/foundry-serve-route.test.ts
//
// THE SERVING ROUTE, DRIVEN AS THE ROUTE and not as a copy of it.
//
// WHY THIS FILE EXISTS AT ALL, given the repo adds tests sparingly. Every
// failure this pins is SILENT or reads as a different bug:
//
// 1. THE CONTENT TYPE. A stylesheet served as `text/plain` is ignored with no
//    console line, and a script served as `text/plain` does not execute. The
//    app renders unstyled and inert, which reads as a bad upload. This is not
//    hypothetical: it is exactly what shipped. Supabase Storage rewrites
//    `text/html` to `text/plain` in its renderer, and the hosted Edge Function
//    gateway does the same AND replaces the response's CSP with
//    `default-src 'none'; sandbox`. Both were measured on the real project.
//    Nothing in the repo could have caught either, because both happened after
//    the code was right -- but the route is ours now, and the day one of these
//    headers stops going out it will be a change in this file.
//
// 2. THE TRAILING SLASH. `.../<version>` has `.../<app>/` as its base URL, so
//    every relative asset resolves one level too high. The app loads and looks
//    broken.
//
// 3. THE REFUSALS. A cross-app file, an unpublished version and a hidden app
//    must all be the same bodyless 404 as an unknown id, or the URL becomes an
//    oracle.
//
// 4. THE HOST GATE. Serving these bytes on the MAIN host would hand every
//    student bundle the session cookies the second origin exists to withhold,
//    and it would do it silently.
//
// It drives the REAL handler, imported from its own file, against the REAL
// in-memory fixture the dev server uses.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GET, fallback } from '../src/routes/b/[appId]/[versionId]/[...path]/+server.ts';
import { setDev } from './stubs/app-environment.ts';
import {
	FIXTURE_APP_A,
	FIXTURE_APP_TYPES,
	FIXTURE_VERSION_A_LIVE,
	FIXTURE_VERSION_A_STALE,
	FIXTURE_VERSION_TYPES
} from '../src/lib/server/foundry-dev-fixture.ts';
import { FOUNDRY_STORAGE_SHIM_TAG } from '../src/lib/foundry/storage-shim.ts';

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

/** The real handler, called the way SvelteKit calls it. */
function call(
	appId: string,
	versionId: string,
	path: string,
	opts: { origin?: string; slash?: boolean; method?: string } = {}
): Promise<Response> {
	const origin = opts.origin ?? APPS;
	const tail = path === '' && opts.slash !== false ? '/' : path === '' ? '' : `/${path}`;
	const href = `${origin}/b/${appId}/${versionId}${tail}`;
	const handler = opts.method && opts.method !== 'GET' ? fallback : GET;
	return handler({
		params: { appId, versionId, path },
		url: new URL(href),
		request: new Request(href, { method: opts.method ?? 'GET' })
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any) as Promise<Response>;
}

describe('the entry document is served as HTML with our own policy', () => {
	it('answers text/html; charset=utf-8 and nothing else', async () => {
		const res = await call(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, '');
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
	});

	/**
	 * THE POLICY HAS TO SURVIVE INTACT, which is the half the Supabase gateway
	 * was replacing. `sandbox` puts a DIRECT navigation in the same opaque
	 * origin the iframe attribute gives a framed one, and the source lists name
	 * the bundle origin literally because `'self'` is same-origin with nothing
	 * once the document is opaque.
	 */
	it('sends the sandbox directive and names the bundle origin literally', async () => {
		const csp = (await call(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, '')).headers.get(
			'content-security-policy'
		)!;
		expect(csp).toContain('sandbox allow-scripts allow-modals allow-pointer-lock');
		expect(csp).not.toContain("'self'");
		expect(csp).toContain(`default-src ${APPS}`);
		expect(csp).toMatch(/script-src [^;]*'unsafe-inline'/);
	});

	/**
	 * THE ROUTE HAS TO WIRE THE REAL PORTAL ORIGIN THROUGH, and that is a
	 * separate claim from the flags being right.
	 *
	 * `foundrySandboxFlags` grants `allow-same-origin` only when the bundle
	 * origin and the portal origin differ, and its unit coverage lives in
	 * `tests/foundry-bundle-url.test.ts`. What THIS file is for is the wiring:
	 * a route that passed a constant, or the wrong variable, or nothing at all,
	 * would answer the strict set forever and look exactly like a correct one --
	 * the whole `<base>`/localStorage fix would be silently absent in
	 * production.
	 *
	 * BOTH DIRECTIONS, DRIVEN THROUGH THE REAL HANDLER. The rest of this file
	 * deliberately runs with no portal origin configured, so the default case
	 * already covers the absence; this sets one and asserts the response
	 * changes.
	 */
	it('grants allow-same-origin only once a portal origin is configured', async () => {
		// NEGATIVE: as the rest of the file runs -- nothing configured, so the
		// route cannot prove the two origins differ.
		const bare = (await call(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, '')).headers.get(
			'content-security-policy'
		)!;
		expect(bare).not.toContain('allow-same-origin');
		expect(bare).not.toContain('frame-ancestors');

		process.env.PUBLIC_FOUNDRY_PORTAL_ORIGIN = 'https://ideabosco.com';
		try {
			// POSITIVE: a different portal origin, which is production.
			const cross = (await call(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, '')).headers.get(
				'content-security-policy'
			)!;
			expect(cross).toContain('allow-same-origin');
			expect(cross).toContain('frame-ancestors https://ideabosco.com');

			// NEGATIVE AGAIN: pointed at the SAME host the bundles come off,
			// which is the misconfiguration the escape is actually reachable in.
			process.env.PUBLIC_FOUNDRY_PORTAL_ORIGIN = APPS;
			const same = (await call(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, '')).headers.get(
				'content-security-policy'
			)!;
			expect(same).not.toContain('allow-same-origin');
			expect(same).toContain(`frame-ancestors ${APPS}`);
		} finally {
			delete process.env.PUBLIC_FOUNDRY_PORTAL_ORIGIN;
		}
	});

	it('marks the response nosniff, no-referrer, private and noindex', async () => {
		const h = (await call(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, '')).headers;
		expect(h.get('x-content-type-options')).toBe('nosniff');
		expect(h.get('referrer-policy')).toBe('no-referrer');
		expect(h.get('cache-control')).toBe('private, max-age=60');
		expect(h.get('x-robots-tag')).toBe('noindex, nofollow');
	});

	/**
	 * AN OPAQUE ORIGIN HAS NO STORAGE AREA AND THE `localStorage` GETTER THROWS,
	 * so the first line of a generated app that reads saved state takes the page
	 * down before anything renders. The shim has to be the FIRST thing inside
	 * <head>, ahead of any student script.
	 */
	it('injects the storage shim first inside <head>', async () => {
		const body = await (await call(FIXTURE_APP_A, FIXTURE_VERSION_A_LIVE, '')).text();
		expect(body).toContain(FOUNDRY_STORAGE_SHIM_TAG);
		expect(body.indexOf(FOUNDRY_STORAGE_SHIM_TAG)).toBe(body.indexOf('<head>') + '<head>'.length);
	});

	/** Only HTML is rewritten. Anything else is passed through byte for byte. */
	it('does not inject anything into a non-HTML file', async () => {
		const body = await (await call(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, 'style.css')).text();
		expect(body).not.toContain(FOUNDRY_STORAGE_SHIM_TAG);
		expect(body).toBe('body { color: #0f0; }');
	});
});

describe('every servable extension gets its own type', () => {
	const CASES: [string, string][] = [
		['style.css', 'text/css; charset=utf-8'],
		['app.js', 'text/javascript; charset=utf-8'],
		['data.json', 'application/json; charset=utf-8'],
		['notes.txt', 'text/plain; charset=utf-8'],
		['pixel.png', 'image/png'],
		['mark.svg', 'image/svg+xml'],
		['face.woff2', 'font/woff2'],
		['icon.ico', 'image/vnd.microsoft.icon']
	];

	it.each(CASES)('%s is served as %s', async (path, type) => {
		const res = await call(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, path);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe(type);
	});

	// The sweep generated cases at all. A parameterized block that produced
	// nothing passes silently.
	it('covered every case in the table', () => {
		expect(CASES.length).toBe(8);
	});
});

describe('the trailing slash', () => {
	/**
	 * WITHOUT THE SLASH every relative asset resolves one level too high and the
	 * app renders unstyled and scriptless -- which reads as a bad upload rather
	 * than a bad URL. The `Location` is RELATIVE so it stays correct behind any
	 * proxy and on any host.
	 */
	it('307s the bare root to the slash form, relatively', async () => {
		const res = await call(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, '', { slash: false });
		expect(res.status).toBe(307);
		expect(res.headers.get('location')).toBe(`${FIXTURE_VERSION_TYPES}/`);
	});

	/**
	 * AND AN EXPLICIT REQUEST FOR THE ENTRY MUST NOT BOUNCE. Keying the redirect
	 * on `path === 'index.html'` instead of on whether the entry was DERIVED
	 * sent `.../index.html` to `.../index.html/`, so every bundle linking its own
	 * entry by name 404'd.
	 */
	it('leaves an explicit index.html alone', async () => {
		const res = await call(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, 'index.html');
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
	});
});

describe('every refusal is the same bodyless 404', () => {
	const NOT_MINE = '00000000-0000-4000-8000-000000000000';

	it.each([
		['an unknown app', NOT_MINE, FIXTURE_VERSION_TYPES, ''],
		['an unknown version', FIXTURE_APP_TYPES, NOT_MINE, ''],
		["another app's version", FIXTURE_APP_A, FIXTURE_VERSION_TYPES, ''],
		['a version that is not published', FIXTURE_APP_A, FIXTURE_VERSION_A_STALE, ''],
		['a file with no row', FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, 'nope.css'],
		['a traversal', FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, '../../package.json'],
		['an absolute path', FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, '/etc/passwd']
	])('refuses %s', async (_label, app, version, path) => {
		const res = await call(app, version, path);
		expect(res.status).toBe(404);
		expect(await res.text()).toBe('');
	});

	/**
	 * POSITIVE CONTROL for the whole block. Without it, a fixture that failed to
	 * load would make all seven refusals pass while the route served nothing at
	 * all -- which is the exact failure mode this feature has already had twice.
	 */
	it('serves the same ids that the refusals vary', async () => {
		expect((await call(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, '')).status).toBe(200);
		expect((await call(FIXTURE_APP_A, FIXTURE_VERSION_A_LIVE, '')).status).toBe(200);
	});

	it('refuses a method that is not GET or HEAD', async () => {
		const res = await call(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, '', { method: 'POST' });
		expect(res.status).toBe(404);
	});
});

describe('the host gate keeps bundles off the cookie-carrying host', () => {
	/**
	 * THE PORTAL'S SESSION COOKIES ARE HOST-ONLY ON THE MAIN HOST -- `@supabase/ssr`
	 * sets no `Domain` and `hooks.server.ts` adds none -- so they are not sent to
	 * the apps origin at all. That ABSENCE is the isolation. Serving the same
	 * bytes on the main host would put a student's document back on the origin
	 * that holds them, and nothing on screen would say so.
	 *
	 * THIS IS NOT THE DELETED HOST BRANCH. That one sat in `hooks.server.ts` and
	 * decided what an entire host could serve, ahead of routing. This is one
	 * route declining to answer, inside its own handler.
	 */
	it('404s a bundle path arriving on any other origin', async () => {
		const res = await call(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, '', {
			origin: 'https://ideabosco.com'
		});
		expect(res.status).toBe(404);
		// POSITIVE CONTROL: the identical request on the apps origin is served,
		// so the 404 above is the host and not the ids.
		expect((await call(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, '')).status).toBe(200);
	});

	/**
	 * UNSET MEANS ANY HOST, which is what makes local development and a preview
	 * deployment work with no configuration. Production pins it.
	 */
	it('serves on any origin when no apps origin is configured', async () => {
		delete process.env.PUBLIC_FOUNDRY_APPS_ORIGIN;
		try {
			const res = await call(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, '', {
				origin: 'http://localhost:5173'
			});
			expect(res.status).toBe(200);
		} finally {
			process.env.PUBLIC_FOUNDRY_APPS_ORIGIN = APPS;
		}
	});

	/** `frame-ancestors` is unset-means-unrestricted, deliberately. */
	it('adds frame-ancestors only when a portal origin is configured', async () => {
		const bare = (await call(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, '')).headers.get(
			'content-security-policy'
		)!;
		expect(bare).not.toContain('frame-ancestors');

		process.env.PUBLIC_FOUNDRY_PORTAL_ORIGIN = 'https://ideabosco.com';
		try {
			const pinned = (await call(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, '')).headers.get(
				'content-security-policy'
			)!;
			expect(pinned).toContain('frame-ancestors https://ideabosco.com');
		} finally {
			delete process.env.PUBLIC_FOUNDRY_PORTAL_ORIGIN;
		}
	});
});
