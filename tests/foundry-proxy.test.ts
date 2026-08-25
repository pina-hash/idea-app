import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it, beforeEach } from 'vitest';
import { render } from 'svelte/server';

import {
	appsHostAllows,
	isFoundryAppsHost,
	isFoundryHostNamespace,
	isFoundryPlatformPath,
	isFoundryProxyPath,
	normalizeHost,
	redactProxyPath
} from '../src/lib/foundry/host';
import { mintFoundryToken, verifyFoundryToken } from '../src/lib/server/foundry-token';
import {
	foundryCsp,
	injectStorageShim,
	servableContentType
} from '../src/lib/server/foundry-serve';
import { FOUNDRY_STORAGE_SHIM_TAG } from '../src/lib/foundry/storage-shim';
import AppFrame from '../src/lib/foundry/AppFrame.svelte';
import {
	FIXTURE_APP_A,
	FIXTURE_APP_B,
	FIXTURE_VERSION_A_LIVE,
	FIXTURE_VERSION_A_STALE,
	FIXTURE_VERSION_B_LIVE,
	FIXTURE_VIEWER
} from '../src/lib/server/foundry-dev-fixture';
import { setDev } from './stubs/app-environment';
import { GET as proxyGet } from '../src/routes/r/[token]/[...path]/+server';
import { with_request_store } from '@sveltejs/kit/internal/server';
import { handle, handleError } from '../src/hooks.server';

/**
 * THE FOUNDRY ORIGIN SPLIT, and specifically the parts of it whose regression
 * would be SILENT.
 *
 * That is the whole selection rule here, per this repo's testing convention:
 * feature correctness that fails visibly belongs in the dev harness at
 * /dev/foundry-proxy, which is where the browser drive lives. What is asserted
 * below is the set of things that would keep WORKING while no longer being
 * safe -- a bundle reachable from the session-bearing origin, a token that
 * verifies after being edited, a CSP that quietly lost `connect-src 'none'`, a
 * sandbox attribute that quietly gained `allow-same-origin`. Every one of those
 * looks exactly like success from the outside.
 *
 * No database is involved. These are pure modules plus the real route handler
 * driven against the dev fixture.
 */

const APPS_HOST = 'apps.ideabosco.com';
const APP_ORIGIN = 'https://ideabosco.com';

beforeEach(() => {
	process.env.PUBLIC_FOUNDRY_APPS_HOST = APPS_HOST;
	process.env.PUBLIC_FOUNDRY_APP_ORIGIN = APP_ORIGIN;
	process.env.FOUNDRY_TOKEN_SECRET = 'test-secret-not-a-real-one';
	setDev(false);
});

describe('host branch', () => {
	it('matches the configured apps host, case- and trailing-dot-insensitively', () => {
		expect(isFoundryAppsHost(APPS_HOST, APPS_HOST)).toBe(true);
		expect(isFoundryAppsHost('APPS.IDEABOSCO.COM', APPS_HOST)).toBe(true);
		expect(isFoundryAppsHost('apps.ideabosco.com.', APPS_HOST)).toBe(true);
		// The positive control above is what makes these negatives mean something.
		expect(isFoundryAppsHost('ideabosco.com', APPS_HOST)).toBe(false);
		expect(isFoundryAppsHost('evil-apps.ideabosco.com', APPS_HOST)).toBe(false);
		expect(isFoundryAppsHost('apps.ideabosco.com.evil.test', APPS_HOST)).toBe(false);
	});

	it('treats the port as part of the host, because locally it is the only difference', () => {
		expect(isFoundryAppsHost('127.0.0.1:5173', '127.0.0.1:5173')).toBe(true);
		expect(isFoundryAppsHost('127.0.0.1:4173', '127.0.0.1:5173')).toBe(false);
		expect(isFoundryAppsHost('localhost:5173', '127.0.0.1:5173')).toBe(false);
	});

	it('FAILS CLOSED when no apps host is configured: nothing is the bundle host', () => {
		expect(isFoundryAppsHost(APPS_HOST, '')).toBe(false);
		expect(isFoundryAppsHost(APPS_HOST, undefined)).toBe(false);
		expect(normalizeHost(undefined)).toBe('');
	});

	/**
	 * THE PREVIOUS VERSION OF THIS TEST ASSERTED `appsHostAllows('/r')` IS
	 * TRUE, AND THAT ASSERTION CERTIFIED A HOLE. A bare `/r` passed the
	 * allowlist, the hook handed it to the SvelteKit router, no route exists
	 * there, and the root `+error.svelte` answered -- the entire portal booting
	 * on the bundle origin with a root-layout session read behind it. The test
	 * was green throughout, because it was asserting the behaviour rather than
	 * the property.
	 */
	it('allows only paths the proxy actually serves: /r/{token}/{path}', () => {
		for (const p of [
			'/r/tok/',
			'/r/tok/index.html',
			'/r/tok/nested/asset.png',
			// The bundle root spelled WITHOUT its slash. It is allowed through so
			// the route can redirect it to the slash form; refusing it here is
			// what blanked every published app, because that is the shape the
			// frame's own request becomes if anything upstream normalizes the
			// trailing slash away. The route never SERVES this spelling -- see
			// 'the bundle root, through the whole handle sequence' below,
			// which asserts the 307 and follows it to the entry file.
			'/r/tok',
			'/_platform',
			'/_platform/fonts.css'
		]) {
			expect(appsHostAllows(p)).toBe(true);
		}

		// THE RULE, rather than a list: a `/r` path is allowed only when it names
		// a NON-EMPTY token segment. These name no token at all, so none of them
		// may reach the router -- `/r` and `/r/` are the shapes that used to be
		// answered by the portal's own error page on the bundle origin.
		for (const p of ['/r', '/r/', '/rx', '/r-other', '/r//', '/r//index.html']) {
			expect(appsHostAllows(p)).toBe(false);
		}

		// The app, its API, its auth endpoints, its static paths.
		for (const p of [
			'/',
			'/classroom',
			'/api/feedback',
			'/auth/callback',
			'/dashboard',
			'/admin',
			'/robots.txt',
			'/coins/index.html',
			'/_app/immutable/entry/app.js',
			'/dev/foundry-proxy'
		]) {
			expect(appsHostAllows(p)).toBe(false);
		}
	});

	/**
	 * THE PROPERTY, NOT THE URL LIST: nothing the apps host allows is a PAGE,
	 * so nothing on it can run the root `+layout.server.ts` load.
	 *
	 * Both allowed prefixes resolve to `+server.ts` endpoints, and SvelteKit
	 * does not run layout loads for endpoints -- that is what makes "no session
	 * is read on the bundle origin" structural rather than a property of which
	 * paths happen to exist today. This reads the route directory off disk, so
	 * adding a `+page.svelte` under either prefix reddens it.
	 */
	it('no path the apps host allows resolves to a page', () => {
		const routes = fs
			.readdirSync('src/routes', { recursive: true, encoding: 'utf8' })
			.map((f) => f.split(path.sep).join('/'));

		const allowedRouteFiles = routes.filter(
			(f) => f.startsWith('r/') || f.startsWith('_platform/')
		);

		// Positive control: the sweep found the two route trees at all.
		expect(allowedRouteFiles.some((f) => f.startsWith('r/'))).toBe(true);
		expect(allowedRouteFiles.some((f) => f.startsWith('_platform/'))).toBe(true);

		const pages = allowedRouteFiles.filter((f) => /\+(page|layout)[.@]/.test(f));
		expect(pages).toEqual([]);

		const endpoints = allowedRouteFiles.filter((f) => f.endsWith('+server.ts'));
		expect(endpoints.length).toBe(2);
	});

	/**
	 * THE MAIN HOST REFUSES THE WHOLE NAMESPACE, not just the served shape.
	 *
	 * Narrowing `isFoundryProxyPath` to `/r/{token}/` and letting the main-host
	 * branch read it opened exactly one path: a bare `/r` matches no route on
	 * either host, so on the main host it stopped being intercepted and fell to
	 * the router. Measured in dev before this predicate existed: 404 with
	 * 171,045 bytes, against `/nope`'s 171,048. This is what keeps a route
	 * added at `/r/<anything>` from shipping reachable on the session-bearing
	 * origin.
	 */
	it('refuses the whole bundle namespace on the main host, shape or not', () => {
		for (const p of [
			'/r',
			'/r/',
			'/r/tok',
			'/r/tok/',
			'/r/tok/index.html',
			'/r/anything',
			'/_platform',
			'/_platform/fonts.css'
		]) {
			expect(isFoundryHostNamespace(p)).toBe(true);
		}

		// It is a namespace, not a substring: the main host's own routes stay
		// reachable. `/reference/...` is a real public route.
		for (const p of ['/', '/reference/abc', '/rx', '/r-other', '/_platformer', '/robots.txt']) {
			expect(isFoundryHostNamespace(p)).toBe(false);
		}

		// The asymmetry is the point, so assert it rather than implying it:
		// the namespace is strictly WIDER than what the apps host allows.
		expect(isFoundryHostNamespace('/r')).toBe(true);
		expect(appsHostAllows('/r')).toBe(false);
	});

	it('does not let a lookalike prefix through the allowlist', () => {
		// `/reference/...` is a real public route and starts with the two
		// characters the proxy prefix does.
		expect(isFoundryProxyPath('/reference/abc')).toBe(false);
		expect(isFoundryProxyPath('/rr/abc')).toBe(false);
		expect(isFoundryPlatformPath('/_platformer')).toBe(false);
		// A lookalike with the right first segment but no token segment.
		expect(isFoundryProxyPath('/r')).toBe(false);
		expect(isFoundryProxyPath('/r/')).toBe(false);
		// Positive control, so the four negatives above cannot pass vacuously.
		expect(isFoundryProxyPath('/r/tok/')).toBe(true);
	});
});

describe('token', () => {
	const mint = (over: Partial<Parameters<typeof mintFoundryToken>[0]> = {}) =>
		mintFoundryToken(
			{
				appId: FIXTURE_APP_A,
				versionId: FIXTURE_VERSION_A_LIVE,
				viewerId: FIXTURE_VIEWER,
				...over
			},
			false
		) as string;

	it('round-trips its claims', () => {
		const v = verifyFoundryToken(mint(), false);
		expect(v.ok).toBe(true);
		if (!v.ok) return;
		expect(v.claims.appId).toBe(FIXTURE_APP_A);
		expect(v.claims.versionId).toBe(FIXTURE_VERSION_A_LIVE);
		expect(v.claims.viewerId).toBe(FIXTURE_VIEWER);
	});

	it('is URL-path-safe: no slash, dot or percent to confuse the route match', () => {
		expect(mint()).toMatch(/^[A-Za-z0-9_-]+$/);
	});

	it('REJECTS a token with any single byte of the signature changed', () => {
		const raw = Buffer.from(mint(), 'base64url');
		// Every byte of the 32-byte signature, not just a convenient one.
		for (let i = 53; i < raw.length; i++) {
			const edited = Buffer.from(raw);
			edited[i] ^= 0x01;
			const v = verifyFoundryToken(edited.toString('base64url'), false);
			expect(v.ok).toBe(false);
			if (!v.ok) expect(v.reason).toBe('bad_signature');
		}
	});

	it('REJECTS a token whose PAYLOAD was edited to point at another app', () => {
		// The interesting forgery: keep a valid signature, swap the app id.
		const raw = Buffer.from(mint(), 'base64url');
		const other = Buffer.from(FIXTURE_APP_B.replace(/-/g, ''), 'hex');
		other.copy(raw, 1);
		const v = verifyFoundryToken(raw.toString('base64url'), false);
		expect(v.ok).toBe(false);
		if (!v.ok) expect(v.reason).toBe('bad_signature');
	});

	it('REJECTS an expired token, and accepts one a second before expiry', () => {
		const now = 1_800_000_000;
		const token = mint({ nowSeconds: now, ttlSeconds: 60 });
		expect(verifyFoundryToken(token, false, now + 59).ok).toBe(true);
		const late = verifyFoundryToken(token, false, now + 61);
		expect(late.ok).toBe(false);
		if (!late.ok) expect(late.reason).toBe('expired');
	});

	it('REFUSES to mint or verify with no secret outside dev', () => {
		delete process.env.FOUNDRY_TOKEN_SECRET;
		expect(
			mintFoundryToken(
				{
					appId: FIXTURE_APP_A,
					versionId: FIXTURE_VERSION_A_LIVE,
					viewerId: FIXTURE_VIEWER
				},
				false
			)
		).toBeNull();
		const v = verifyFoundryToken('anything', false);
		expect(v.ok).toBe(false);
		if (!v.ok) expect(v.reason).toBe('not_configured');
	});

	it('does not verify a token minted under a different secret', () => {
		const token = mint();
		process.env.FOUNDRY_TOKEN_SECRET = 'a-different-secret';
		expect(verifyFoundryToken(token, false).ok).toBe(false);
	});

	it('refuses a malformed token rather than throwing', () => {
		for (const bad of ['', 'not base64url!!', 'AAAA', 'a'.repeat(200)]) {
			expect(() => verifyFoundryToken(bad, false)).not.toThrow();
			expect(verifyFoundryToken(bad, false).ok).toBe(false);
		}
	});
});

describe('response headers', () => {
	const csp = () => foundryCsp(APP_ORIGIN, `https://${APPS_HOST}`);

	it('sandboxes without allow-same-origin', () => {
		expect(csp()).toContain('sandbox allow-scripts allow-modals allow-pointer-lock');
		expect(csp()).not.toContain('allow-same-origin');
	});

	it("carries connect-src 'none', which is the line that stops all egress", () => {
		expect(csp()).toContain("connect-src 'none'");
	});

	it('pins frame-ancestors to the app origin, and to nothing at all when unset', () => {
		expect(csp()).toContain(`frame-ancestors ${APP_ORIGIN}`);
		expect(foundryCsp('', `https://${APPS_HOST}`)).toContain("frame-ancestors 'none'");
	});

	it('names the bundle origin literally rather than relying on origin-relative self', () => {
		// `'self'` is meaningless in an opaque origin; see foundryCsp's own note.
		expect(csp()).toContain(`default-src https://${APPS_HOST}`);
		expect(csp()).toContain(`script-src https://${APPS_HOST}`);
		expect(csp()).not.toContain("'self'");
	});

	it('permits inline script (the shim needs it) but no off-origin script source', () => {
		const directive = csp()
			.split('; ')
			.find((d) => d.startsWith('script-src '))!;
		expect(directive).toContain("'unsafe-inline'");
		// The only sources are the bundle's own origin plus the two schemes.
		expect(directive.replace(/'[^']*'/g, '').trim().split(/\s+/)).toEqual([
			'script-src',
			`https://${APPS_HOST}`,
			'data:',
			'blob:'
		]);
	});
});

describe('MIME allowlist', () => {
	it('passes a stored type the ingest table can actually produce', () => {
		expect(servableContentType('text/html; charset=utf-8')).toBe('text/html; charset=utf-8');
		expect(servableContentType('image/png')).toBe('image/png');
	});

	it('refuses anything outside the list rather than echoing it', () => {
		for (const bad of ['text/html-evil', 'application/x-msdownload', 'text/xml', '', null]) {
			expect(servableContentType(bad)).toBe('application/octet-stream');
		}
	});
});

describe('storage shim injection', () => {
	it('is the FIRST thing inside an existing head', () => {
		const out = injectStorageShim('<!doctype html><html><head><title>x</title></head></html>');
		expect(out).toContain('<head>' + FOUNDRY_STORAGE_SHIM_TAG);
		expect(out.indexOf(FOUNDRY_STORAGE_SHIM_TAG)).toBeLessThan(out.indexOf('<title>'));
	});

	it('handles a head with attributes, and only injects once', () => {
		const out = injectStorageShim('<html><head data-x="1"><script>a()</script></head></html>');
		expect(out).toContain('<head data-x="1">' + FOUNDRY_STORAGE_SHIM_TAG);
		// The two install CALLS, not the declaration beside them.
		expect(out.split("install('").length - 1).toBe(2);
	});

	it('falls back to the html tag, then to the front, keeping a doctype first', () => {
		expect(injectStorageShim('<html><body>hi</body></html>')).toContain(
			'<html>' + FOUNDRY_STORAGE_SHIM_TAG
		);
		expect(injectStorageShim('<!doctype html><p>hi').indexOf('<!doctype html>')).toBe(0);
		expect(injectStorageShim('<p>hi')).toBe(FOUNDRY_STORAGE_SHIM_TAG + '<p>hi');
	});

	it('changes nothing else about the document', () => {
		const doc = '<!doctype html><html><head></head><body><p class=x>a &amp; b<br></body></html>';
		const out = injectStorageShim(doc);
		expect(out.replace(FOUNDRY_STORAGE_SHIM_TAG, '')).toBe(doc);
	});
});

describe('AppFrame, the one place the sandbox attribute is written down', () => {
	const html = () =>
		render(AppFrame, { props: { src: 'https://apps.example/r/tok/', title: 'An app' } }).body;

	it('never grants allow-same-origin, which would cancel the sandbox', () => {
		expect(html()).not.toContain('allow-same-origin');
	});

	it('grants exactly the three flags the build contract needs', () => {
		expect(html()).toContain('sandbox="allow-scripts allow-modals allow-pointer-lock"');
	});

	it('grants none of the escape flags', () => {
		const out = html();
		for (const flag of [
			'allow-popups',
			'allow-top-navigation',
			'allow-forms',
			'allow-downloads',
			'allow-presentation'
		]) {
			expect(out).not.toContain(flag);
		}
	});
});

describe('the real proxy route handler, against the dev fixture', () => {
	const call = async (host: string, token: string, path: string) => {
		const url = new URL(`https://${host}/r/${token}/${path}`);
		return (await proxyGet({
			params: { token, path },
			url,
			request: new Request(url, { method: 'GET' })
		} as never)) as Response;
	};

	const tokenFor = (appId: string, versionId: string) => {
		setDev(true);
		return mintFoundryToken({ appId, versionId, viewerId: FIXTURE_VIEWER }, true) as string;
	};

	beforeEach(() => {
		process.env.PUBLIC_FOUNDRY_APPS_HOST = APPS_HOST;
		setDev(true);
	});

	it('serves the entry file, injected, from the bundle root', async () => {
		const res = await call(APPS_HOST, tokenFor(FIXTURE_APP_A, FIXTURE_VERSION_A_LIVE), '');
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
		expect(res.headers.get('x-content-type-options')).toBe('nosniff');
		expect(res.headers.get('cache-control')).toBe('private, no-store');
		expect(res.headers.get('set-cookie')).toBeNull();
		expect(await res.text()).toContain("install('localStorage')");
	});

	it('404s the SAME valid URL on the main host', async () => {
		const token = tokenFor(FIXTURE_APP_A, FIXTURE_VERSION_A_LIVE);
		// The positive control is the assertion above: this token and path serve
		// 200 on the apps host, so a 404 here is about the host and nothing else.
		const res = await call('ideabosco.com', token, '');
		expect(res.status).toBe(404);
		expect(await res.text()).toBe('');
	});

	it("404s app A's token asking for a file that belongs to app B", async () => {
		const a = await call(APPS_HOST, tokenFor(FIXTURE_APP_A, FIXTURE_VERSION_A_LIVE), 'b-only.json');
		expect(a.status).toBe(404);
		// Positive control: B's own token reaches B's own file.
		const b = await call(APPS_HOST, tokenFor(FIXTURE_APP_B, FIXTURE_VERSION_B_LIVE), 'b-only.json');
		expect(b.status).toBe(200);
	});

	it("404s a version that is no longer the app's published one", async () => {
		const res = await call(APPS_HOST, tokenFor(FIXTURE_APP_A, FIXTURE_VERSION_A_STALE), '');
		expect(res.status).toBe(404);
	});

	it('404s a traversing path, and every spelling of one', async () => {
		const token = tokenFor(FIXTURE_APP_A, FIXTURE_VERSION_A_LIVE);
		for (const p of ['../data.json', '../../etc/passwd', 'a/../../b', './style.css', '/etc/passwd']) {
			const res = await call(APPS_HOST, token, p);
			expect(res.status, `path ${p}`).toBe(404);
		}
		// Positive control: the legal spelling of a real file does serve.
		expect((await call(APPS_HOST, token, 'style.css')).status).toBe(200);
	});

	it('404s a tampered token with no body and no distinguishing header', async () => {
		const raw = Buffer.from(tokenFor(FIXTURE_APP_A, FIXTURE_VERSION_A_LIVE), 'base64url');
		raw[raw.length - 1] ^= 0x01;
		const res = await call(APPS_HOST, raw.toString('base64url'), '');
		expect(res.status).toBe(404);
		expect(await res.text()).toBe('');
		expect(res.headers.get('content-security-policy')).toBeNull();
	});
});


/**
 * THE BUNDLE ROOT, WHICH IS THE ONLY URL THE FRAME EVER REQUESTS -- DRIVEN
 * THROUGH THE WHOLE HANDLE SEQUENCE, WHICH IS THE GAP THAT HID TWO BUGS.
 *
 * The first was the shape: every other test in this file, and every
 * verification drive, asked for an explicit filename or handed `params`
 * straight to the route, and both skip the hook entirely.
 *
 * The second was the CONTINUATION, and the shape of the test is what hid it.
 * This block used to compose `foundryHostBranch` with the route handler as its
 * `resolve` -- which reads as "the hook, then the route, exactly as
 * `sequence()` runs them" and is not that at all. In a `sequence` member,
 * `resolve` means THE NEXT MEMBER, so supplying our own silently stood in for
 * `legacyRedirects`, `supabase` and `authGuard` and asserted them out of
 * existence. In production those three ran on every bundle request the host
 * branch ALLOWED: a Supabase client created against the bundle origin's
 * cookies, and a live session read against the Auth server -- on the one
 * origin whose entire purpose is that neither can happen.
 *
 * So what is driven here is the REAL EXPORTED `handle`, and `resolve` stands
 * in for SvelteKit's router and nothing else. The instrumented event below is
 * the other half: it counts every observation a downstream member would have
 * to make (a `locals` assignment, a cookie read, a cookie write, a response
 * header), so "nothing after the hook ran" is a MEASUREMENT rather than a
 * reading of the composition. The positive controls prove those counters can
 * move at all.
 */
describe('the bundle root, through the whole handle sequence', () => {
	/** `/r/[token]/[...path]`, split the way the route pattern splits it. */
	const paramsFor = (pathname: string) => {
		const rest = pathname.slice('/r/'.length);
		const cut = rest.indexOf('/');
		return cut === -1
			? { token: rest, path: '' }
			: { token: rest.slice(0, cut), path: rest.slice(cut + 1) };
	};

	/**
	 * SvelteKit's own no-op span, spelled out rather than imported: with no
	 * OpenTelemetry exporter configured, `record_span` calls `fn` with one of
	 * these and returns its result, which is exactly what production does.
	 */
	const noopSpan = {
		setAttributes: () => noopSpan,
		setAttribute: () => noopSpan,
		recordException: () => {},
		setStatus: () => noopSpan,
		end: () => {},
		addEvent: () => noopSpan,
		updateName: () => noopSpan,
		isRecording: () => false,
		spanContext: () => ({ traceId: '', spanId: '', traceFlags: 0 }),
		addLink: () => noopSpan,
		addLinks: () => noopSpan
	};
	const recordSpan = async ({ fn }: { fn: (span: unknown) => unknown }) => fn(noopSpan);

	/** Every way a sequence member downstream of the host branch would show up. */
	type Observed = {
		cookieReads: number;
		cookieWrites: number;
		headerSets: number;
		routerCalls: number;
	};

	/**
	 * The real `handle`, with the ROUTER stood in for and nothing else.
	 *
	 * `resolve` dispatches to the real proxy handler for a proxy path and
	 * answers a plain page for anything else, which is what SvelteKit does once
	 * the hook hands the request over. A thrown `redirect()` is returned as its
	 * own response, the way `respond.js` catches it.
	 */
	const drive = async (host: string, pathname: string) => {
		const url = new URL(`https://${host}${pathname}`);
		const seen: Observed = { cookieReads: 0, cookieWrites: 0, headerSets: 0, routerCalls: 0 };
		const locals: Record<string, unknown> = {};
		const event = {
			url,
			params: paramsFor(pathname),
			request: new Request(url, { method: 'GET' }),
			route: { id: null },
			locals,
			cookies: {
				getAll: () => {
					seen.cookieReads++;
					return [];
				},
				get: () => {
					seen.cookieReads++;
					return undefined;
				},
				set: () => {
					seen.cookieWrites++;
				},
				delete: () => {
					seen.cookieWrites++;
				}
			},
			setHeaders: () => {
				seen.headerSets++;
			}
		};

		const resolve = async (e: typeof event) => {
			seen.routerCalls++;
			return isFoundryProxyPath(e.url.pathname)
				? await proxyGet(e as never)
				: new Response('the portal', { status: 200 });
		};

		let response: Response;
		try {
			/**
			 * `sequence()` reads SvelteKit's per-request store, which `respond.js`
			 * installs around `hooks.handle` -- so driving the real top-level
			 * handle means installing it here too. The tracing stub is the whole
			 * of it: `record_span` with OpenTelemetry absent is a passthrough,
			 * which is what it already is in production.
			 */
			response = (await with_request_store(
				{
					event: event as never,
					state: { tracing: { record_span: recordSpan } } as never
				},
				() => handle({ event: event as never, resolve: resolve as never })
			)) as Response;
		} catch (thrown) {
			const r = thrown as { status?: number; location?: string };
			if (typeof r?.status === 'number' && typeof r?.location === 'string') {
				response = new Response(null, { status: r.status, headers: { location: r.location } });
			} else {
				throw thrown;
			}
		}
		return { response, seen, locals };
	};

	/** The bundle-root request, with only the response kept. */
	const request = async (host: string, pathname: string): Promise<Response> =>
		(await drive(host, pathname)).response;

	const live = () => {
		setDev(true);
		return mintFoundryToken(
			{ appId: FIXTURE_APP_A, versionId: FIXTURE_VERSION_A_LIVE, viewerId: FIXTURE_VIEWER },
			true
		) as string;
	};

	beforeEach(() => {
		process.env.PUBLIC_FOUNDRY_APPS_HOST = APPS_HOST;
		setDev(true);
	});

	it('serves the entry file for the bare prefix WITH its slash', async () => {
		const res = await request(APPS_HOST, `/r/${live()}/`);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
		expect(await res.text()).toContain("install('localStorage')");
	});

	it('serves the entry file for the explicit entry filename', async () => {
		const res = await request(APPS_HOST, `/r/${live()}/index.html`);
		expect(res.status).toBe(200);
		expect(await res.text()).toContain("install('localStorage')");
	});

	it('redirects the bare prefix WITHOUT its slash, and the redirect serves the entry', async () => {
		const token = live();
		const res = await request(APPS_HOST, `/r/${token}`);

		// It must not 404. That refusal is the whole bug: it is what the frame
		// got whenever the trailing slash was normalized away upstream.
		expect(res.status).toBe(307);
		expect(res.headers.get('location')).toBe(`/r/${token}/`);

		// And following it lands on the entry file, so the shape resolves end to
		// end rather than merely being redirected somewhere.
		const followed = await request(
			APPS_HOST,
			new URL(res.headers.get('location') as string, `https://${APPS_HOST}`).pathname
		);
		expect(followed.status).toBe(200);
		expect(await followed.text()).toContain("install('localStorage')");
	});

	it('answers the slashless root IDENTICALLY for a garbage token, so the redirect is no oracle', async () => {
		const good = await request(APPS_HOST, `/r/${live()}`);
		const junk = await request(APPS_HOST, '/r/not-a-real-token');
		expect(junk.status).toBe(good.status);
		expect(junk.status).toBe(307);
		expect(await junk.text()).toBe('');
		// The token is judged on the request that follows, not on this one.
		expect((await request(APPS_HOST, '/r/not-a-real-token/')).status).toBe(404);
	});

	it('still refuses every shape that names no token at all', async () => {
		for (const pathname of ['/r', '/r/', '/r//', '/r//index.html']) {
			const res = await request(APPS_HOST, pathname);
			expect(res.status, `pathname ${pathname}`).toBe(404);
			expect(await res.text(), `pathname ${pathname}`).toBe('');
		}
	});

	it('404s all three shapes on the MAIN host, where no bundle is ever served', async () => {
		const token = live();
		for (const pathname of [`/r/${token}/`, `/r/${token}`, `/r/${token}/index.html`]) {
			const res = await request('ideabosco.com', pathname);
			expect(res.status, `pathname ${pathname}`).toBe(404);
			expect(await res.text(), `pathname ${pathname}`).toBe('');
		}
	});

	/**
	 * THE ONE THAT WOULD HAVE CAUGHT IT.
	 *
	 * A signed-out GET to the bundle root has to reach the proxy handler AND be
	 * seen by nothing else. The second half is the half whose regression is
	 * silent: bundles keep serving perfectly while a session read runs on the
	 * bundle origin behind them, which is what production was doing.
	 *
	 * `locals` is the definitive instrument, because both members that could
	 * touch a session write to it unconditionally and before anything else they
	 * do: `supabase` assigns `locals.supabase`, `authGuard` assigns
	 * `locals.claims`. A key present means that member ran, whatever it went on
	 * to answer.
	 */
	it('reaches the proxy handler, and NO other sequence member observes the request', async () => {
		const { response, seen, locals } = await drive(APPS_HOST, `/r/${live()}/`);

		// It reached the router, and the router's answer is the entry file.
		expect(seen.routerCalls).toBe(1);
		expect(response.status).toBe(200);
		expect(await response.text()).toContain("install('localStorage')");

		// And nothing else in the sequence touched it.
		expect(Object.keys(locals)).toEqual([]);
		expect(seen.cookieReads).toBe(0);
		expect(seen.cookieWrites).toBe(0);
		expect(seen.headerSets).toBe(0);
	});

	it('observes nothing on a REFUSED apps-host path either, and never reaches the router', async () => {
		const { response, seen, locals } = await drive(APPS_HOST, '/classroom');
		expect(response.status).toBe(404);
		expect(await response.text()).toBe('');
		expect(seen.routerCalls).toBe(0);
		expect(Object.keys(locals)).toEqual([]);
		expect(seen.cookieReads).toBe(0);
	});

	/**
	 * THE POSITIVE CONTROLS. Without these the four zeros above pass on an
	 * event nobody could observe in the first place, which is the shape of a
	 * green test that certifies nothing.
	 */
	it('POSITIVE CONTROL: the same event on the MAIN host IS observed by the rest of the sequence', async () => {
		const { response, seen, locals } = await drive('ideabosco.com', '/');

		expect(response.status).toBe(200);
		expect(seen.routerCalls).toBe(1);
		// `supabase` created the client; `authGuard` resolved the claims. Both
		// wrote to `locals`, which is the counter the apps-host case reads as
		// empty.
		expect(Object.keys(locals).sort()).toEqual(['claims', 'supabase']);
		// Signed out, so there is no session -- but the cookies were read to
		// find that out, which is the read that must never happen on the
		// bundle origin.
		expect(locals.claims).toBeNull();
		expect(seen.cookieReads).toBeGreaterThan(0);
	});

	it('POSITIVE CONTROL: `legacyRedirects` still runs on the main host, and never on the apps host', async () => {
		const onMain = await drive('ideabosco.com', '/IDEA');
		expect(onMain.response.status).toBe(308);
		expect(onMain.response.headers.get('location')).toBe('/');

		// The same path on the bundle host is refused by the allowlist before
		// any of that: no redirect, no router, nothing observed.
		const onApps = await drive(APPS_HOST, '/IDEA');
		expect(onApps.response.status).toBe(404);
		expect(await onApps.response.text()).toBe('');
		expect(onApps.seen.routerCalls).toBe(0);
		expect(Object.keys(onApps.locals)).toEqual([]);
	});
});

/**
 * THE TOKEN MUST NOT REACH A LOG LINE, AND `handleError` IS THE ONE PLACE THAT
 * WRITES A PATHNAME DOWN.
 *
 * On the bundle host the pathname IS the credential: `/r/{token}/{path}`, and
 * that token is thirty minutes of read access to a student's app. A 500 on the
 * proxy would otherwise have put a live one in the Vercel function log, where
 * it is greppable by anyone with access to the log and outlives the request by
 * however long the log is kept.
 *
 * This drives the real `handleError` and reads what it actually printed, rather
 * than asserting the helper in isolation: the helper being correct while the
 * call site interpolates `event.url.pathname` beside it is exactly the shape of
 * this leak.
 */
describe('handleError never writes a bundle token down', () => {
	it('redacts the token from the logged pathname, and leaves every other path alone', () => {
		const token = 'a'.repeat(114);
		const lines: string[] = [];
		const realError = console.error;
		console.error = (...args: unknown[]) => {
			lines.push(args.map(String).join(' '));
		};
		try {
			handleError({
				error: new Error('boom'),
				event: {
					url: new URL(`https://${APPS_HOST}/r/${token}/assets/app.js`),
					request: { method: 'GET' },
					route: { id: '/r/[token]/[...path]' }
				},
				status: 500,
				message: 'Internal Error'
			} as never);

			handleError({
				error: new Error('boom'),
				event: {
					url: new URL('https://ideabosco.com/classroom/abc'),
					request: { method: 'GET' },
					route: { id: '/classroom/[sectionId]' }
				},
				status: 500,
				message: 'Internal Error'
			} as never);
		} finally {
			console.error = realError;
		}

		expect(lines.length).toBe(2);
		// Positive control: the line was written and still says where it happened.
		expect(lines[0]).toContain('/r/<token:114>/assets/app.js');
		expect(lines[0]).toContain('route=/r/[token]/[...path]');
		// And the credential is not in it, anywhere.
		expect(lines[0]).not.toContain(token);
		// An ordinary path is untouched, so the correlation line stays readable.
		expect(lines[1]).toContain('/classroom/abc');
	});

	it('redacts by SHAPE, so a token of any length and any path under it is covered', () => {
		expect(redactProxyPath('/r/abc/')).toBe('/r/<token:3>/');
		expect(redactProxyPath('/r/abc')).toBe('/r/<token:3>');
		expect(redactProxyPath('/r/abc/nested/thing.png')).toBe('/r/<token:3>/nested/thing.png');
		// Not a proxy path: returned verbatim, because a correlation line that
		// mangles ordinary routes is a correlation line nobody can read.
		for (const p of ['/', '/classroom', '/reference/abc', '/_platform/lib/react.js']) {
			expect(redactProxyPath(p)).toBe(p);
		}
	});
});
