import { env } from '$env/dynamic/public';
import { foundryBundleHeaders, foundryPortalOrigin } from '$lib/foundry/bundle-headers';
import { injectStorageShim } from '$lib/foundry/storage-shim';
import {
	previewBundleFile,
	serveBundleFile,
	type FoundryPreviewViewer,
	type FoundryServeResult,
} from '$lib/server/foundry-bundle';

/**
 * EVERYTHING THE SERVING ROUTES DO IDENTICALLY, WRITTEN DOWN ONCE.
 *
 * There are three mounts now and they answer with the same bytes, the same
 * shim and the same refusal:
 *
 *   /b/<app>/<version>/<path>   the FRAME src. Names a version, so the gallery
 *                               and the review queue can each run the exact
 *                               build they are looking at. APPS ORIGIN.
 *   /a/<app>/<path>             the DIRECT PAGE. Names an app, resolves its
 *                               published version per request, and is the whole
 *                               document rather than something inside a frame.
 *                               APPS ORIGIN.
 *   /foundry/preview/<app>/<version>/<path>
 *                               the AUTHOR'S OWN RUN, at any status including
 *                               `draft`. PORTAL ORIGIN, because the gate is who
 *                               is asking and only the portal has a session to
 *                               ask it of.
 *
 * THE FIRST TWO DIFFER ONLY IN WHERE THE VERSION ID COMES FROM. Everything
 * downstream of that -- the host gate, the publication re-check, the header set,
 * the storage shim, the trailing-slash repair and the one bodyless 404 -- is
 * this module, called by both. A second copy of any of it is a page that serves
 * student bytes with a header set nobody compared: the CSP sandbox directive,
 * `nosniff` and the content type are each the difference between an isolated app
 * and an executing one, and each fails silently.
 *
 * THE THIRD DIFFERS IN TWO PLACES AND ONLY TWO, AND BOTH ARE DELIBERATE: it
 * reads through `previewBundleFile` (a gate on the VIEWER, not on the version's
 * status) and it forces the STRICT sandbox by handing the header builder one
 * origin twice. Everything else -- the bytes, the shim, the content length, the
 * refusal, the trailing-slash repair -- is the same code, which is what makes
 * "preview is the published response minus `allow-same-origin`" a fact rather
 * than a claim. See `foundryPreviewResponse`.
 *
 * THE `/b/` AND `/a/` RULES BELOW ARE THE EXTRACTION, NOT A NEW POLICY. Every
 * one of them was already in `/b/`'s handler and is unchanged; what moved is
 * where it is written.
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
 * WHETHER THIS REQUEST ARRIVED ON THE APPS ORIGIN -- the inverse question, for
 * the one route that must refuse there.
 *
 * PREVIEW ANSWERS ON THE PORTAL AND NOWHERE ELSE. It resolves the viewer from
 * the session cookie, and the apps host has none, so a preview request arriving
 * there would refuse anyway -- with `viewer` null and the same bodyless 404.
 * This is the explicit form of that, and it is worth stating rather than
 * inheriting: the implicit refusal rests on the cookies being host-only, which
 * is a property of `@supabase/ssr`'s defaults rather than of this feature, and
 * a `Domain` added to them one day would turn a silent guarantee into a silent
 * hole. A route that names the host it will not answer on cannot regress that
 * way.
 *
 * UNSET MEANS NO APPS ORIGIN EXISTS, so nothing is on it and this is false --
 * which is dev and preview deployments, where the two origins are the same host
 * and refusing it would remove the feature entirely.
 */
export function foundryOnAppsOrigin(requestOrigin: string): boolean {
	const configured = (env.PUBLIC_FOUNDRY_APPS_ORIGIN ?? '')
		.trim()
		.replace(/\/+$/, '');
	return configured !== '' && requestOrigin === configured;
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
 * THE HEADERS, THE SHIM AND THE CONTENT LENGTH ARE `bundleBytesResponse`'s,
 * which the PREVIEW mount also calls. What this function owns is the two things
 * that are its own: reading through `serveBundleFile`, and resolving the portal
 * origin from the environment so the CSP `sandbox` directive and
 * `AppFrame.svelte`'s iframe `sandbox` attribute cannot disagree.
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

	return bundleBytesResponse(found, requestOrigin, portalOrigin, method);
}

/**
 * THE PREVIEW RESPONSE: the same bytes, the same shim, the same 404 -- and a
 * DELIBERATELY STRICTER SANDBOX than the two published mounts get.
 *
 * WHY THE SANDBOX HAS TO BE FORCED HERE RATHER THAN RESOLVED. Preview answers
 * on the PORTAL origin, which is where the session cookies are, so a student's
 * HTML is executing on the one host the whole origin split exists to keep it
 * off. That is a narrow, deliberate exception -- the only session it ever runs
 * in front of is the author's own or an admin's, never a third student's -- but
 * it is only tolerable if the containment is EXPLICIT and cannot be undone by a
 * setting. `allow-same-origin` on this host would let a preview reach
 * `document.cookie` on `ideabosco.com`, where `@supabase/ssr` sets the session
 * tokens with `httpOnly: false`. So it must never be granted here, in any
 * configuration.
 *
 * AND IT IS NOT, BECAUSE THE TWO ORIGINS HANDED TO THE HEADER BUILDER ARE THE
 * SAME VARIABLE. `foundrySandboxFlags(bundle, portal)` appends
 * `allow-same-origin` only when both are non-empty AND they DIFFER; passing
 * `requestOrigin` twice makes them the same string by construction, so the
 * comparison cannot come out any way but equal, whatever
 * `PUBLIC_FOUNDRY_APPS_ORIGIN` and `PUBLIC_FOUNDRY_PORTAL_ORIGIN` are set to.
 * The strict set is therefore a property of this call site rather than of a
 * deployment's environment, which is the whole reason it is written this way
 * instead of resolving the portal origin the way `foundryFileResponse` does.
 * `tests/foundry-preview-route.test.ts` asserts it across every configuration
 * including the one that grants the flag on `/b/` and `/a/`, and mutation-proves
 * it by making the two arguments differ.
 *
 * PASSING THE REQUEST ORIGIN RATHER THAN THE EMPTY STRING BUYS ONE THING AND
 * COSTS NOTHING. Two empty origins would also produce the strict set, but they
 * would emit no `frame-ancestors` at all -- so any site anywhere could embed a
 * preview. Passing the portal origin twice pins `frame-ancestors` to the portal.
 * It costs nothing on the source lists because `default-src` already admits
 * `https:`, which covers the portal origin whether or not it is named.
 *
 * WHAT PREVIEW STILL CANNOT PROVE, and the reason the surface says so in words:
 * an opaque origin has no storage area, so the injected shim is the only
 * `localStorage` a preview has and it does not survive a reload. A PUBLISHED app
 * is on a real origin (the apps host grants `allow-same-origin`) and its saves
 * do persist. The difference only ever runs in the safe direction -- anything
 * that works in preview works published -- which is why it is a sentence beside
 * the control rather than a reason not to have one.
 */
export async function foundryPreviewResponse(
	appId: string,
	versionId: string,
	path: string,
	requestOrigin: string,
	method: string,
	viewer: FoundryPreviewViewer | null,
): Promise<Response> {
	const found = await previewBundleFile(appId, versionId, path, viewer);
	if (!found.ok) return foundryNotFound();

	return bundleBytesResponse(found, requestOrigin, requestOrigin, method);
}

/**
 * BYTES TO A RESPONSE: the header set, the shim injection and the content
 * length, in the one copy all three mounts read.
 *
 * A SECOND COPY OF THIS IS A PAGE THAT ISOLATES NOTHING WHILE LOOKING
 * IDENTICAL. The CSP `sandbox` directive, `nosniff` and the content type are
 * each the difference between an isolated app and an executing one, and each
 * fails silently -- the app renders perfectly either way. The two ORIGIN
 * arguments are the only thing the callers decide, which is exactly the
 * difference that is real: the published mounts resolve a portal origin and may
 * be granted `allow-same-origin`; preview passes one origin twice and by
 * construction is not.
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
function bundleBytesResponse(
	found: Extract<FoundryServeResult, { ok: true }>,
	bundleOrigin: string,
	portalOrigin: string,
	method: string,
): Response {
	const headers = foundryBundleHeaders(found.contentType, bundleOrigin, portalOrigin);

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
