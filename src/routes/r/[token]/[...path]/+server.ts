import { dev } from '$app/environment';
import { env as publicEnv } from '$env/dynamic/public';
// TEMPORARY: read only for the secret PRESENCE probe below, never for its value.
import { env as privateEnv } from '$env/dynamic/private';
import { resolveBundleFile } from '$lib/server/foundry-bundle';
import {
	foundryNotFound,
	foundryResponseHeaders,
	injectStorageShim,
	isHtmlContentType,
	servableContentType
} from '$lib/server/foundry-serve';
import { verifyFoundryToken } from '$lib/server/foundry-token';
import { isFoundryAppsHost } from '$lib/foundry/host';
// TEMPORARY: bundle-proxy diagnostic. Remove with `$lib/server/foundry-probe`.
import { foundryProbe, presence, redactProxyPath } from '$lib/server/foundry-probe';
import type { RequestHandler } from './$types';

/**
 * THE BUNDLE PROXY. Apps host only.
 *
 *   /r/{token}/{path}
 *
 * The token is in the PATH so that every relative request a bundle makes
 * resolves under the same prefix without the bundle knowing a token exists --
 * see `$lib/server/foundry-token` for that argument in full.
 *
 * THE HOST CHECK IS REPEATED HERE, and it is not redundant. `hooks.server.ts`
 * already 404s this path on the main host, so under normal routing this branch
 * never fires. It stays because the consequence of the hook being edited, or
 * being bypassed by a future `+server.ts` reached another way, is bundles
 * served from the origin that holds the viewer's session -- the exact thing
 * this whole lane exists to prevent. A check whose failure is catastrophic and
 * whose cost is one string comparison is a check worth having twice.
 *
 * EVERY REFUSAL IS THE SAME BODYLESS 404 (`foundryNotFound`). A bad signature,
 * an expired token, a token for another app's file, a path with no row, a
 * withdrawn version and a hidden app are indistinguishable from outside, so
 * nothing here can be used to probe for what exists.
 *
 * GET AND HEAD ONLY. There is no write path on this host and no route that
 * takes a body; anything else falls to SvelteKit's own 405, which is correct
 * and says nothing.
 */

/**
 * `'ignore'`, AND IT IS LOAD-BEARING RATHER THAN A PREFERENCE.
 *
 * SvelteKit's default normalizes `/r/<token>/` to `/r/<token>` with a 308,
 * BEFORE any hook runs -- measured: every bundle-root URL answered 308 rather
 * than serving, and on the main host the 308 fired ahead of the 404 the host
 * branch owes it. Worse than the extra hop is where the hop lands: a document
 * at `/r/<token>` has `/r/` as its base, so the bundle's own `data.json`
 * resolves to `/r/data.json` and every relative asset in every app 404s. The
 * trailing slash is not cosmetic here, it is what makes the whole
 * relative-resolution argument work.
 *
 * `'always'` is the wrong fix in the other direction: it would append a slash
 * to `/r/<token>/data.json` too, which names a different thing entirely.
 */
export const trailingSlash = 'ignore';

const handler: RequestHandler = async ({ params, url, request }) => {
	/**
	 * TEMPORARY INSTRUMENTATION. Every refusal below is the same bodyless 404,
	 * which is correct and is why production cannot be diagnosed by request.
	 * These lines change no response; they name which branch answered. Remove
	 * with `$lib/server/foundry-probe`.
	 */
	foundryProbe('proxy.enter', {
		path: redactProxyPath(url.pathname),
		requestHost: url.host,
		configuredAppsHost: publicEnv.PUBLIC_FOUNDRY_APPS_HOST ?? null,
		method: request.method,
		tokenLen: (params.token ?? '').length,
		pathParam: params.path ?? '',
		endsWithSlash: url.pathname.endsWith('/')
	});

	if (!isFoundryAppsHost(url.host, publicEnv.PUBLIC_FOUNDRY_APPS_HOST)) {
		foundryProbe('proxy.refused.host', {
			requestHost: url.host,
			configuredAppsHost: publicEnv.PUBLIC_FOUNDRY_APPS_HOST ?? null
		});
		return foundryNotFound();
	}

	/**
	 * The path exactly as the browser asked for it, percent-decoding undone
	 * ONCE. `params.path` arrives decoded from SvelteKit; a stored path is a
	 * plain relative string, so a decode is what makes `my%20file.png` match the
	 * row `my file.png`. Nothing is decoded twice -- a second pass is how `%252e%252e`
	 * becomes `..` -- and it would not matter if it were, because the row lookup
	 * is the allowlist and a traversing string simply has no row.
	 */
	const path = params.path ?? '';

	/**
	 * THE BUNDLE ROOT KEEPS ITS TRAILING SLASH, and this redirect runs BEFORE
	 * THE TOKEN IS VERIFIED, which is the half that used to be wrong.
	 *
	 * `/r/<token>` and `/r/<token>/` name the same file -- the entry -- but they
	 * are DIFFERENT BASE URLS to the browser, and only the second one makes a
	 * bundle's `<img src="logo.png">` resolve inside the bundle. Serving the
	 * entry at the slashless form would produce an app that renders and then
	 * loses every asset, which reads as a broken upload rather than a broken
	 * proxy. So the slashless form is redirected, never served.
	 *
	 * IT IS SEQUENCED AHEAD OF `verifyFoundryToken` SO THE REDIRECT DISCLOSES
	 * NOTHING. Verifying first meant a good token answered 307 where a garbage
	 * one answered 404 -- the one place on this host where two outcomes did not
	 * look alike, and the reason the hook used to refuse this shape outright.
	 * Refusing it there is what blanked every published app the moment anything
	 * upstream normalized the trailing slash away. Redirecting first closes the
	 * oracle at the place it was actually open: the answer is now 307 for every
	 * slashless root, and the token is judged on the request that follows.
	 *
	 * 307, not 308: this is routing, not a permanent address, and the mint hands
	 * out the slash form anyway. Only the root is redirected -- a real file path
	 * is served exactly as asked for.
	 */
	if (path === '' && !url.pathname.endsWith('/')) {
		foundryProbe('proxy.redirect.slashless-root', { path: redactProxyPath(url.pathname) });
		return new Response(null, {
			status: 307,
			headers: {
				location: `${url.pathname}/${url.search}`,
				'cache-control': 'private, no-store'
			}
		});
	}

	const verdict = verifyFoundryToken(params.token ?? '', dev);
	if (!verdict.ok) {
		/**
		 * The REASON only -- `malformed`, `bad_version`, `bad_signature`,
		 * `expired` or `not_configured`. No byte of the token, the payload or
		 * the signature is written down; `secretPresence` is the length of
		 * `FOUNDRY_TOKEN_SECRET` and nothing else, which is what separates "this
		 * environment has no secret" from "the signature did not match".
		 */
		foundryProbe('proxy.refused.token', {
			reason: verdict.reason,
			tokenLen: (params.token ?? '').length,
			secretPresence: presence(privateEnv.FOUNDRY_TOKEN_SECRET)
		});
		return foundryNotFound();
	}

	const { appId, versionId, kind } = verdict.claims;

	/**
	 * THE KIND COMES FROM THE SIGNED BYTES, never from the request. A review
	 * token lifts the publication re-check and nothing else; a `published` one
	 * -- which is every token a student can hold -- keeps it.
	 */
	const found = await resolveBundleFile(appId, versionId, path, kind);
	if (!found.ok) {
		foundryProbe('proxy.refused.resolve', {
			reason: found.reason,
			appId,
			versionId,
			kind,
			requestedPath: path
		});
		return foundryNotFound();
	}

	foundryProbe('proxy.serving', {
		appId,
		versionId,
		requestedPath: path,
		contentType: found.file.contentType,
		byteLength: found.file.byteLength
	});

	const contentType = servableContentType(found.file.contentType);
	const headers = foundryResponseHeaders(
		contentType,
		publicEnv.PUBLIC_FOUNDRY_APP_ORIGIN ?? '',
		url.origin
	);

	/**
	 * HTML IS BUFFERED, EVERYTHING ELSE STREAMS.
	 *
	 * The shim has to be inserted into the head, which means the head has to be
	 * in hand -- so an HTML response is read into memory, injected and
	 * re-encoded. The 25 MB bundle cap is the whole bundle; a single HTML file
	 * inside it is orders smaller than that, and the alternative (a streaming
	 * transform that watches for `<head>` across chunk boundaries) is a parser
	 * with a state machine standing in for a `String.indexOf`.
	 *
	 * `content-length` is recomputed from the injected bytes rather than
	 * carried over from the row, because the row's byte count is now wrong by
	 * exactly the length of the shim.
	 */
	if (isHtmlContentType(contentType)) {
		const raw =
			found.file.body instanceof Uint8Array
				? new TextDecoder().decode(found.file.body)
				: await new Response(found.file.body).text();
		const bytes = new TextEncoder().encode(injectStorageShim(raw));
		headers.set('content-length', String(bytes.byteLength));
		return new Response(request.method === 'HEAD' ? null : bytes, { headers });
	}

	if (found.file.byteLength !== null) {
		headers.set('content-length', String(found.file.byteLength));
	}
	if (request.method === 'HEAD') return new Response(null, { headers });

	return new Response(
		found.file.body instanceof Uint8Array
			? (found.file.body as unknown as BodyInit)
			: found.file.body,
		{ headers }
	);
};

export const GET = handler;
export const HEAD = handler;
