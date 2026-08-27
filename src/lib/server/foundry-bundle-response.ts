import { env } from '$env/dynamic/public';
import { foundryBundleHeaders, foundryPortalOrigin } from '$lib/foundry/bundle-headers';
import { injectStorageShim } from '$lib/foundry/storage-shim';
import { serveBundleFile } from '$lib/server/foundry-bundle';

/**
 * EVERYTHING TWO SERVING ROUTES DO IDENTICALLY, WRITTEN DOWN ONCE.
 *
 * There are two mounts now and they answer with the same bytes, the same
 * headers, the same shim and the same refusal:
 *
 *   /b/<app>/<version>/<path>   the FRAME src. Names a version, so the gallery
 *                               and the review queue can each run the exact
 *                               build they are looking at.
 *   /a/<app>/<path>             the DIRECT PAGE. Names an app, resolves its
 *                               published version per request, and is the whole
 *                               document rather than something inside a frame.
 *
 * THE ONLY THING THAT DIFFERS BETWEEN THEM IS WHERE THE VERSION ID COMES FROM.
 * Everything downstream of that -- the host gate, the publication re-check, the
 * header set, the storage shim, the trailing-slash repair and the one bodyless
 * 404 -- is this module, called by both. A second copy of any of it is a page
 * that serves student bytes with a header set nobody compared: the CSP sandbox
 * directive, `nosniff` and the content type are each the difference between an
 * isolated app and an executing one, and each fails silently.
 *
 * THIS IS THE EXTRACTION, NOT A NEW POLICY. Every rule below was already in
 * `/b/`'s handler and is unchanged; what moved is where it is written.
 *
 * THE OBVIOUS NAME FOR THIS FILE IS TAKEN, AND THAT IS NOT A PREFERENCE.
 * `foundry-serve.ts` under this directory is a DELETED module of the token
 * proxy, and `tests/foundry-bundle-url.test.ts` sweeps the whole tree for that
 * path -- it reddens on any file or import that brings it back, because the
 * failure mode of a retired path returning is silence and the next reader would
 * have no way to know the name used to mean something else. Do not rename this
 * to it.
 */

/**
 * ONE REFUSAL, USED EVERYWHERE. A malformed URL, an unknown app, an app with
 * nothing published, an unpublished version, another app's file, a missing row
 * and a hidden app are indistinguishable from outside. `no-store` so a 404 for
 * a build that is about to be approved is not cached into the next viewer's
 * browser -- and, on the direct page, so an app that was hidden and then
 * restored is not still 404ing from a cache an hour later.
 */
export function foundryNotFound(): Response {
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
 *
 * THIS IS NOT THE DELETED `hooks.server.ts` HOST BRANCH. That one sat ahead of
 * routing and decided what an entire host could serve, for every request on the
 * site. This is two routes declining to answer on an origin they are not for,
 * inside their own handlers, affecting nothing else.
 */
export function foundryOnServingHost(requestOrigin: string): boolean {
	const configured = (env.PUBLIC_FOUNDRY_APPS_ORIGIN ?? '')
		.trim()
		.replace(/\/+$/, '');
	if (!configured) return true;
	return requestOrigin === configured;
}

/**
 * THE ONE REDIRECT EITHER ROUTE ISSUES: the bare bundle root to the slash form.
 *
 * THE RELATIVE `Location` IS DELIBERATE. The browser resolves it against the
 * URL it actually asked for, so the answer stays correct behind any proxy, on
 * any host, and in dev, without either route knowing where it is mounted. The
 * caller passes its own LAST SEGMENT -- the version id for `/b/`, the app id
 * for `/a/` -- which is the only part of the two shapes that differs.
 */
export function foundryRootRedirect(lastSegment: string, search: string): Response {
	return new Response(null, {
		status: 307,
		headers: {
			location: `${lastSegment}/${search}`,
			'cache-control': 'no-store',
		},
	});
}

/**
 * One file of one version, as a response, or the bodyless 404.
 *
 * `versionId` MAY BE NULL and that is not an error case to report: on `/a/` it
 * is what an app with nothing published looks like, and an app with nothing
 * published has no direct page, which is the same 404 as an app that does not
 * exist.
 *
 * THE PUBLICATION GATE IS `serveBundleFile`'s, NOT THIS FUNCTION'S. It bypasses
 * RLS by construction and re-checks, on every request, that the version belongs
 * to the app, that the app is not hidden, and that the version is published or
 * submitted. Nothing here second-guesses it.
 *
 * THE STORAGE SHIM IS INJECTED INTO HTML, AND IT IS ALSO IN THE CONTRACT. A
 * document on an opaque origin has no storage area and the `localStorage`
 * GETTER THROWS, so the first line of a generated app that reads saved state
 * takes the whole page down before anything renders -- and "read saved state at
 * the top of the script" is the single most common thing an AI tool writes.
 * This copy rescues every app whose author never read the contract and every
 * app already published; the contract's copy makes the app behave identically
 * opened off the student's own filesystem. One string, two deliveries, and
 * running it twice is harmless.
 *
 * IT IS INSERTED, NOT REWRITTEN IN. The tag goes in as the first element inside
 * `<head>` and nothing else in the document is touched. Parse-and-reserialize
 * would mangle bundles in ways nobody asked for.
 */
export async function foundryFileResponse(
	appId: string,
	versionId: string | null,
	path: string,
	requestOrigin: string,
	method: string,
): Promise<Response> {
	if (!versionId) return foundryNotFound();

	const found = await serveBundleFile(appId, versionId, path);
	if (!found.ok) return foundryNotFound();

	// THE PORTAL ORIGIN IS RESOLVED, NOT READ. `PUBLIC_FOUNDRY_PORTAL_ORIGIN`
	// when it is set, the canonical portal host when it is not AND this is a
	// split-origin deployment, and empty otherwise. The rule and the reason it is
	// gated on the apps origin live in `foundryPortalOrigin`; what matters here
	// is that this is the SAME call `AppFrame.svelte` makes, so the CSP `sandbox`
	// directive and the iframe `sandbox` attribute cannot disagree about whether
	// `allow-same-origin` is granted.
	const portalOrigin = foundryPortalOrigin(
		env.PUBLIC_FOUNDRY_APPS_ORIGIN,
		env.PUBLIC_FOUNDRY_PORTAL_ORIGIN,
	);
	const headers = foundryBundleHeaders(
		found.contentType,
		requestOrigin,
		portalOrigin,
	);

	if (method === 'HEAD') return new Response(null, { headers });

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
}
