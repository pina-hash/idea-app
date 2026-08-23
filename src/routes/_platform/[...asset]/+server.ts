import { read } from '$app/server';
import { env as publicEnv } from '$env/dynamic/public';
import { foundryNotFound, foundryResponseHeaders } from '$lib/server/foundry-serve';
import { isFoundryAppsHost } from '$lib/foundry/host';
import type { RequestHandler } from './$types';

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

const handler: RequestHandler = async ({ params, url, request }) => {
	if (!isFoundryAppsHost(url.host, publicEnv.PUBLIC_FOUNDRY_APPS_HOST)) {
		return foundryNotFound();
	}

	const appOrigin = publicEnv.PUBLIC_FOUNDRY_APP_ORIGIN ?? '';
	const asset = params.asset ?? '';

	if (asset === 'fonts.css') {
		const bytes = new TextEncoder().encode(FONTS_CSS);
		const headers = foundryResponseHeaders('text/css; charset=utf-8', appOrigin, url.origin);
		headers.set('content-length', String(bytes.byteLength));
		return new Response(request.method === 'HEAD' ? null : bytes, { headers });
	}

	if (asset.startsWith('fonts/')) {
		// An exact key in a fixed record. There is no path joining here and
		// nothing is resolved against a filesystem, so `fonts/../../x` is simply
		// a key that is not in the map.
		const file = FONT_FILES[asset.slice('fonts/'.length)];
		if (!file) return foundryNotFound();
		const headers = foundryResponseHeaders('font/woff2', appOrigin, url.origin);
		if (request.method === 'HEAD') return new Response(null, { headers });
		return new Response(read(file).body, { headers });
	}

	return foundryNotFound();
};

export const GET = handler;
export const HEAD = handler;
