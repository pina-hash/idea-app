import { read } from '$app/server';
import { env as publicEnv } from '$env/dynamic/public';
import { foundryNotFound, foundryResponseHeaders } from '$lib/server/foundry-serve';
import { isFoundryAppsHost } from '$lib/foundry/host';
import { FOUNDRY_PLATFORM_LIBRARIES } from '$lib/foundry/vendor';
import type { RequestHandler } from './$types';

import vendorReact from '$lib/foundry/vendor/react.js?url';
import vendorReactDom from '$lib/foundry/vendor/react-dom.js?url';
import vendorBabel from '$lib/foundry/vendor/babel.js?url';
import vendorLucide from '$lib/foundry/vendor/lucide.js?url';
import vendorTailwind from '$lib/foundry/vendor/tailwind.js?url';

import orbitron400 from '@fontsource/orbitron/files/orbitron-latin-400-normal.woff2?url';
import orbitron700 from '@fontsource/orbitron/files/orbitron-latin-700-normal.woff2?url';
import rajdhani400 from '@fontsource/rajdhani/files/rajdhani-latin-400-normal.woff2?url';
import rajdhani600 from '@fontsource/rajdhani/files/rajdhani-latin-600-normal.woff2?url';
import rajdhani700 from '@fontsource/rajdhani/files/rajdhani-latin-700-normal.woff2?url';
import shareTechMono400 from '@fontsource/share-tech-mono/files/share-tech-mono-latin-400-normal.woff2?url';

/**
 * PLATFORM ASSETS: the one absolute path a bundle is allowed to reference.
 *
 *   /_platform/fonts.css
 *   /_platform/fonts/<file>.woff2
 *
 * It sits OUTSIDE the token prefix on purpose. A student writes
 * `<link rel="stylesheet" href="/_platform/fonts.css">` into a file they
 * authored before their app had an id, let alone a token, and that line has to
 * keep meaning the same thing in every version of every app forever. Under the
 * token prefix it could not: the URL would change every thirty minutes.
 *
 * SELF-HOSTED, BECAUSE `connect-src 'none'` MEANS IT HAS TO BE. Nothing in a
 * bundle can reach Google Fonts or any other host, which is exactly why the
 * preflight refuses a `fonts.googleapis.com` link by name and points the
 * student here instead. The three faces are the platform's own
 * (`Orbitron`, `Rajdhani`, `Share Tech Mono`) so a student's app looks like it
 * belongs to the site it is published on.
 *
 * THE BYTES COME OUT OF THE FUNCTION BUNDLE, not out of `static/`. That is not
 * a preference: a file in `static/` is served by Vercel's filesystem on EVERY
 * host, which would put `/_platform/fonts/...` on the main host too and take
 * it out of reach of the host branch entirely. Serving them from a route is
 * what makes "on the main host, `/_platform/*` returns 404" true. `read()`
 * from `$app/server` is the supported way to get an imported asset's bytes
 * server-side, and adapter-vercel wires it up (it hands `createReadableStream`
 * to `server.init`) and copies the assets into the function.
 *
 * SIX FILES, NOT THIRTY. One weight per role that the platform's own type
 * scale actually uses, latin subset only. The performance budget here is a
 * six-to-eight-year-old school desktop on a school network, and every weight
 * added is a download every bundle pays for under `no-store`.
 */

/**
 * THE RUNTIME LIBRARIES, keyed by the same filename `vendor.ts` publishes.
 *
 * THE REGISTRY SAYS WHAT WE HOST; THIS SAYS WHERE THE BYTES ARE. They are two
 * halves of one fact and they are checked against each other in
 * `tests/foundry-vendor.test.ts`, because the failure when they disagree is
 * silent in the worst way: the preflight cheerfully rewrites a student's script
 * tag to a path that answers 404, the upload passes, the note says we fixed it,
 * and the app is blank.
 *
 * IMPORTED `?url` AND READ WITH `read()`, exactly as the fonts are, and for the
 * same reason: a file in `static/` is served by Vercel's filesystem on EVERY
 * host, which would put these on the main host too and take them out of reach
 * of the host branch entirely. Serving them from a route is what makes "on the
 * main host, `/_platform/*` returns 404" true. It also keeps 3.8 MB of library
 * out of the JavaScript bundle -- a `?raw` import would inline every byte of
 * Babel into the server chunk as a string literal.
 */
const LIB_FILES: Record<string, string> = {
	'react.js': vendorReact,
	'react-dom.js': vendorReactDom,
	'babel.js': vendorBabel,
	'lucide.js': vendorLucide,
	'tailwind.js': vendorTailwind
};

/**
 * THE LIBRARIES CACHE AND THE REST OF THIS HOST DOES NOT, AND THE DIFFERENCE
 * IS WHOSE BYTES THEY ARE.
 *
 * Everything else the apps host serves is a student's own bundle, gated by a
 * thirty-minute token that can be withdrawn inside its own lifetime, so it is
 * `private, no-store` -- the bytes are immutable but WHO may read them is not.
 * These five files are pinned npm packages. They are identical for every
 * viewer, carry nothing about anybody, and are reachable by anyone who reaches
 * this host at all, so there is nothing for a shared cache to leak.
 *
 * IT MATTERS AT THIS SIZE. Babel alone is 3.0 MB, and `no-store` means every
 * load of every React app on a school network fetches it again. A day is long
 * enough to pay for itself over a class period and short enough that a version
 * bump reaches everyone the next morning -- and both versions work in the
 * meantime, which is what makes a stale copy harmless rather than a bug.
 *
 * NOT `immutable`: the path deliberately carries no version (a student's file
 * has to keep meaning the same thing forever), so a bump reuses the path and
 * `immutable` would be a promise we do not keep.
 */
const LIB_CACHE = 'public, max-age=86400';

const FONT_FILES: Record<string, string> = {
	'orbitron-400.woff2': orbitron400,
	'orbitron-700.woff2': orbitron700,
	'rajdhani-400.woff2': rajdhani400,
	'rajdhani-600.woff2': rajdhani600,
	'rajdhani-700.woff2': rajdhani700,
	'share-tech-mono-400.woff2': shareTechMono400
};

/**
 * `font-display: swap` rather than the default `auto`: under `no-store` these
 * are fetched on every load, and a student's app rendering nothing for three
 * seconds while a face arrives reads as a broken app, not as a slow font.
 *
 * The `src` paths are absolute rather than relative to the stylesheet. Both
 * resolve to the same place; the absolute form is the one a student can read
 * off the stylesheet and go and fetch by hand when they are debugging.
 */
/*
 * CSS COMMENTS DO NOT NEST, so the banner below is one flat block. An inner
 * `/*` inside it would end the comment at the first `*` + `/` and spill the
 * rest of the file into the stylesheet as declarations -- which parses, mostly,
 * and drops the faces silently.
 */
const FONTS_CSS = `/* IDEA Foundry platform fonts.
   Self-hosted: a published app has no network access, so these are the only
   fonts available to it. Use them by name:
     font-family: 'Rajdhani', sans-serif;         body and display
     font-family: 'Orbitron', sans-serif;         titles
     font-family: 'Share Tech Mono', monospace;   code and metadata
*/
@font-face {
	font-family: 'Orbitron';
	font-style: normal;
	font-weight: 400;
	font-display: swap;
	src: url('/_platform/fonts/orbitron-400.woff2') format('woff2');
}
@font-face {
	font-family: 'Orbitron';
	font-style: normal;
	font-weight: 700;
	font-display: swap;
	src: url('/_platform/fonts/orbitron-700.woff2') format('woff2');
}
@font-face {
	font-family: 'Rajdhani';
	font-style: normal;
	font-weight: 400;
	font-display: swap;
	src: url('/_platform/fonts/rajdhani-400.woff2') format('woff2');
}
@font-face {
	font-family: 'Rajdhani';
	font-style: normal;
	font-weight: 600;
	font-display: swap;
	src: url('/_platform/fonts/rajdhani-600.woff2') format('woff2');
}
@font-face {
	font-family: 'Rajdhani';
	font-style: normal;
	font-weight: 700;
	font-display: swap;
	src: url('/_platform/fonts/rajdhani-700.woff2') format('woff2');
}
@font-face {
	font-family: 'Share Tech Mono';
	font-style: normal;
	font-weight: 400;
	font-display: swap;
	src: url('/_platform/fonts/share-tech-mono-400.woff2') format('woff2');
}
`;

/**
 * A PLATFORM ASSET IS READABLE CROSS-ORIGIN, AND WITHOUT THIS HALF OF THEM DO
 * NOT LOAD AT ALL. This was measured, and it is not obvious.
 *
 * A bundle runs in an OPAQUE ORIGIN -- that is the whole point of the CSP
 * `sandbox` directive. An opaque origin is same-origin with nothing, so a
 * request the document makes to its OWN host is a cross-origin request, and any
 * fetch made in CORS mode needs an `Access-Control-Allow-Origin` header back or
 * the browser discards the response. Two very ordinary things are in CORS mode
 * whether or not anybody asked for it:
 *
 *   - a `<script src>` carrying `crossorigin`, which React's own published CDN
 *     snippet has, so essentially every generated React app carries it too;
 *   - EVERY `@font-face` fetch. Fonts are always fetched in CORS mode. There is
 *     no attribute to leave off.
 *
 * MEASURED, in a real Chrome, on the rewritten fixture, with Babel as the
 * control: `babel.js` and `lucide.js` -- same route, same origin, same headers,
 * no `crossorigin` attribute -- both loaded and Babel compiled the page's JSX.
 * `react.js` and `react-dom.js`, which the student's tags marked `crossorigin`,
 * were discarded, and the console read `ReferenceError: React is not defined`.
 * One attribute, one difference, and a blank app.
 *
 * `*` IS THE RIGHT VALUE AND IT DISCLOSES NOTHING. These are pinned npm builds
 * and six font files. They are identical for every viewer, carry nothing about
 * anybody, and are already served to anyone who reaches this host. `*` also
 * forbids credentialed requests by definition, and there are no credentials on
 * this host to send: it sets no cookie and the viewer's never arrive.
 *
 * IT MUST NOT SPREAD TO `/r/*`. Those are a student's own bundle bytes behind a
 * thirty-minute token, and the apps host answering no CORS headers there is
 * load-bearing -- the proxy harness reads "fetch blocked (CORS)" as its own
 * outcome, which is the origin split working. This header belongs to this
 * route and nowhere else.
 */
function allowCrossOrigin(headers: Headers): Headers {
	headers.set('access-control-allow-origin', '*');
	return headers;
}

const handler: RequestHandler = async ({ params, url, request }) => {
	if (!isFoundryAppsHost(url.host, publicEnv.PUBLIC_FOUNDRY_APPS_HOST)) {
		return foundryNotFound();
	}

	const appOrigin = publicEnv.PUBLIC_FOUNDRY_APP_ORIGIN ?? '';
	const asset = params.asset ?? '';

	if (asset === 'fonts.css') {
		const bytes = new TextEncoder().encode(FONTS_CSS);
		const headers = allowCrossOrigin(
			foundryResponseHeaders('text/css; charset=utf-8', appOrigin, url.origin)
		);
		headers.set('content-length', String(bytes.byteLength));
		return new Response(request.method === 'HEAD' ? null : bytes, { headers });
	}

	if (asset.startsWith('lib/')) {
		// An exact key in a fixed record, like the fonts below. No path joining,
		// nothing resolved against a filesystem, so `lib/../../x` is a key that
		// is simply not in the map.
		const file = LIB_FILES[asset.slice('lib/'.length)];
		if (!file) return foundryNotFound();
		const headers = allowCrossOrigin(
			foundryResponseHeaders('text/javascript; charset=utf-8', appOrigin, url.origin)
		);
		headers.set('cache-control', LIB_CACHE);
		if (request.method === 'HEAD') return new Response(null, { headers });
		return new Response(read(file).body, { headers });
	}

	if (asset.startsWith('fonts/')) {
		// An exact key in a fixed record. There is no path joining here and
		// nothing is resolved against a filesystem, so `fonts/../../x` is simply
		// a key that is not in the map.
		const file = FONT_FILES[asset.slice('fonts/'.length)];
		if (!file) return foundryNotFound();
		const headers = allowCrossOrigin(foundryResponseHeaders('font/woff2', appOrigin, url.origin));
		if (request.method === 'HEAD') return new Response(null, { headers });
		return new Response(read(file).body, { headers });
	}

	return foundryNotFound();
};

export const GET = handler;
export const HEAD = handler;
