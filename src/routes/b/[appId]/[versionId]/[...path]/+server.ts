import { env } from '$env/dynamic/public';
import { foundryBundleHeaders } from '$lib/foundry/bundle-headers';
import { FOUNDRY_ENTRY_FILE } from '$lib/foundry/preflight';
import { injectStorageShim } from '$lib/foundry/storage-shim';
import { serveBundleFile } from '$lib/server/foundry-bundle';
import type { RequestHandler } from './$types';

/**
 * THE ONE PLACE A PUBLISHED STUDENT BUNDLE'S BYTES REACH A BROWSER.
 *
 *   GET /b/<app id>/<version id>/         -> index.html
 *   GET /b/<app id>/<version id>/<path>   -> that file
 *
 * WHY IT IS HERE AND NOT ON SUPABASE. Nothing Supabase-hosted will serve HTML.
 * Storage rewrites `text/html` to `text/plain` in its renderer, on every path,
 * with no flag; the hosted Edge Function gateway does the SAME rewrite and
 * additionally replaces the function's own CSP with `default-src 'none';
 * sandbox`, which blanks the page even once the type is corrected. Both were
 * measured against the real thing rather than read about. Two independent
 * subsystems refusing identically is a platform posture, not a bug, so the
 * bytes have to come off a host whose headers we set.
 *
 * WHY THERE IS NO TOKEN, NO HOST BRANCH AND NO BUILD STEP. The proxy that
 * burned five lanes had all three, and they are what failed -- not the second
 * origin. This is an ordinary SvelteKit route. Nothing rewrites a route table,
 * nothing signs anything, and `hooks.server.ts` does not know this route
 * exists.
 *
 * THE HOST CHECK BELOW IS NOT THAT HOST BRANCH, and the difference is what it
 * decides. The deleted one sat in `hooks.server.ts` and decided what an entire
 * host was allowed to serve, ahead of routing, for every request on the site.
 * This is one route declining to answer on a host it is not for, inside its own
 * handler, affecting nothing else. It is also the reason the main host does not
 * quietly become a second, cookie-carrying way to reach the same bytes.
 */

/**
 * BOTH URL FORMS REACH THE HANDLER, WHICH NEITHER DEFAULT ALLOWS.
 *
 * SvelteKit's default (`'never'`) would 308 `/b/<app>/<version>/` to the
 * slashless form -- and the slashless form is precisely the broken one, because
 * `.../<version>` has `.../<app>/` as its base URL and every relative asset in
 * every bundle then resolves one level too high. `'always'` is worse in the
 * other direction: it would send `.../style.css` to `.../style.css/`, which is
 * the same defect the Edge Function hit by keying its redirect on the filename
 * instead of on whether the entry was derived.
 *
 * `'ignore'` hands both forms to this file, which then issues the ONE redirect
 * that is correct: bare root, no slash, 307 to the slash form.
 */
export const trailingSlash = 'ignore';

/** ONE REFUSAL, USED EVERYWHERE. A malformed URL, an unknown app, an
 * unpublished version, another app's file, a missing row and a hidden app are
 * indistinguishable from outside. `no-store` so a 404 for a build that is about
 * to be approved is not cached into the next reviewer's browser. */
function notFound(): Response {
	return new Response(null, {
		status: 404,
		headers: { 'cache-control': 'no-store' },
	});
}

/**
 * WHETHER THIS REQUEST ARRIVED ON THE HOST BUNDLES ARE SERVED FROM.
 *
 * Unset means "any host", which is what makes local development and a Vercel
 * preview deployment work with no configuration at all. In production it is
 * pinned to the apps origin, and a bundle path on the MAIN host then 404s --
 * which matters, because the main host is where the session cookies are and
 * serving the same bytes there would hand every bundle the credentials the
 * second origin exists to withhold.
 */
function onServingHost(requestOrigin: string): boolean {
	const configured = (env.PUBLIC_FOUNDRY_APPS_ORIGIN ?? '')
		.trim()
		.replace(/\/+$/, '');
	if (!configured) return true;
	return requestOrigin === configured;
}

/**
 * THE RELATIVE `Location` IS DELIBERATE. The browser resolves it against the
 * URL it actually asked for, so the answer stays correct behind any proxy,
 * on any host, and in dev, without this route knowing where it is mounted.
 */
function trailingSlashRedirect(versionId: string, search: string): Response {
	return new Response(null, {
		status: 307,
		headers: {
			location: `${versionId}/${search}`,
			'cache-control': 'no-store',
		},
	});
}

const handle: RequestHandler = async ({ params, url, request }) => {
	if (!onServingHost(url.origin)) return notFound();

	const appId = params.appId ?? '';
	const versionId = params.versionId ?? '';
	const rest = params.path ?? '';

	// An empty tail is the bundle ROOT, which means the entry file. `bare` says
	// the entry was DERIVED rather than asked for, which is the only case the
	// trailing-slash redirect may fire on -- keyed on the filename instead, an
	// explicit request for `.../index.html` bounces to `.../index.html/`.
	const bare = rest === '';
	const path = bare ? FOUNDRY_ENTRY_FILE : rest;

	if (bare && !url.pathname.endsWith('/'))
		return trailingSlashRedirect(versionId, url.search);

	const found = await serveBundleFile(appId, versionId, path);
	if (!found.ok) return notFound();

	const portalOrigin = (env.PUBLIC_FOUNDRY_PORTAL_ORIGIN ?? '')
		.trim()
		.replace(/\/+$/, '');
	const headers = foundryBundleHeaders(
		found.contentType,
		url.origin,
		portalOrigin,
	);

	if (request.method === 'HEAD') return new Response(null, { headers });

	/*
	 * THE STORAGE SHIM IS INJECTED INTO HTML, AND IT IS ALSO IN THE CONTRACT.
	 *
	 * A document on an opaque origin has no storage area and the `localStorage`
	 * GETTER THROWS, so the first line of a generated app that reads saved state
	 * takes the whole page down before anything renders -- and "read saved state
	 * at the top of the script" is the single most common thing an AI tool
	 * writes. This copy rescues every app whose author never read the contract
	 * and every app already published; the contract's copy makes the app behave
	 * identically opened off the student's own filesystem. One string, two
	 * deliveries, and running it twice is harmless.
	 *
	 * IT IS INSERTED, NOT REWRITTEN IN. The tag goes in as the first element
	 * inside `<head>` and nothing else in the document is touched.
	 * Parse-and-reserialize would mangle bundles in ways nobody asked for.
	 */
	if (found.contentType.startsWith('text/html')) {
		const injected = injectStorageShim(new TextDecoder().decode(found.bytes));
		const bytes = new TextEncoder().encode(injected);
		headers.set('content-length', String(bytes.byteLength));
		return new Response(bytes, { headers });
	}

	headers.set('content-length', String(found.bytes.byteLength));
	// The cast is the one `foundry-ingest` already uses: a `Uint8Array` IS a
	// valid body, but the DOM lib types `BodyInit` against a non-generic
	// `ArrayBuffer` and the two do not line up on their own.
	return new Response(found.bytes as unknown as BodyInit, { headers });
};

export const GET = handle;
export const HEAD = handle;

// Nothing a bundle is may be written to, and a method that is not GET or HEAD
// is answered the same way an unknown app is.
export const fallback: RequestHandler = async () => notFound();
