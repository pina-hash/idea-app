import { read } from '$app/server';
import type { RequestHandler } from './$types';


import orbitron400 from '@fontsource/orbitron/files/orbitron-latin-400-normal.woff2?url';
import orbitron700 from '@fontsource/orbitron/files/orbitron-latin-700-normal.woff2?url';
import rajdhani400 from '@fontsource/rajdhani/files/rajdhani-latin-400-normal.woff2?url';
import rajdhani600 from '@fontsource/rajdhani/files/rajdhani-latin-600-normal.woff2?url';
import rajdhani700 from '@fontsource/rajdhani/files/rajdhani-latin-700-normal.woff2?url';
import shareTechMono400 from '@fontsource/share-tech-mono/files/share-tech-mono-latin-400-normal.woff2?url';

/**
 * PLATFORM ASSETS: the platform's own three type families, served to student
 * bundles.
 *
 *   /_platform/fonts.css
 *   /_platform/fonts/<file>.woff2
 *
 * IT IS ON THE MAIN HOST, AND IT IS REFERENCED BY ABSOLUTE URL. This pair used
 * to answer on whatever host a bundle was served from, so a student could write
 * the root-relative `/_platform/fonts.css` and have it resolve.
 *
 * THE REASON THAT STOPPED IS THE ORIGIN SPLIT, NOT SUPABASE, and this paragraph
 * used to say Supabase. Bundles are served by the `/b/` and `/a/` SvelteKit
 * routes answering on `apps.ideabosco.com`; this route answers on
 * `ideabosco.com`. So a leading slash written inside a bundle resolves against
 * the apps origin, where there is no `/_platform` -- which is why the
 * root-relative form CANNOT work whatever we serve, and why the build contract
 * names the whole URL instead. See `FOUNDRY_PLATFORM_ORIGIN` in
 * `$lib/foundry/preflight`. The rule is the same one it always was; the host it
 * fails against is the part that was written down wrong.
 *
 * `Access-Control-Allow-Origin: *` IS LOAD-BEARING AND IS NOT DECORATION. The
 * bundle document sits in an OPAQUE origin, so its `Origin` header is the
 * string `null` and every request it makes is cross-origin -- including a
 * request back to the origin the bytes came from. A cross-origin
 * `<link rel="stylesheet">` loads without CORS, but a `@font-face` `src:` does
 * NOT: a font fetch is CORS-mode by specification and fails outright without
 * this header. That is measured behaviour rather than a reading of the spec:
 * an opaque-origin `FontFace` load of a same-host woff2 with no CORS header
 * fails `NetworkError`, on production and locally alike.
 *
 * SELF-HOSTED STILL, EVEN THOUGH THE NETWORK IS OPEN AGAIN. A bundle may reach
 * Google Fonts now and the contract says so. These stay because a school
 * network is the performance budget here, and because an app that uses the
 * platform's own faces looks like it belongs to the site it is published on.
 *
 * THE BYTES COME OUT OF THE FUNCTION BUNDLE rather than out of `static/`.
 * `read()` from `$app/server` is the supported way to get an imported asset's
 * bytes server-side, and adapter-vercel wires it up and copies the assets into
 * the function. Keeping them out of `static/` also keeps the six files off
 * every other surface's asset manifest.
 *
 * SIX FILES, NOT THIRTY. One weight per role that the platform's own type
 * scale actually uses, latin subset only.
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
 * `font-display: swap` rather than the default `auto`: a student's app
 * rendering nothing for three seconds while a face arrives reads as a broken
 * app, not as a slow font.
 *
 * THE `src` PATHS STAY ROOT-RELATIVE AND THAT IS CORRECT EVEN CROSS-ORIGIN. A
 * URL inside a stylesheet resolves against the STYLESHEET'S OWN URL, never
 * against the document's, so `/_platform/fonts/x.woff2` in a sheet served from
 * `https://ideabosco.com/_platform/fonts.css` resolves back to this host
 * whatever origin framed it. Only the `<link href>` a student writes has to
 * carry the whole URL, which is why the contract names one absolute URL and
 * this file names none.
 */
/*
 * CSS COMMENTS DO NOT NEST, so the banner below is one flat block. An inner
 * `/*` inside it would end the comment at the first `*` + `/` and spill the
 * rest of the file into the stylesheet as declarations -- which parses, mostly,
 * and drops the faces silently.
 */
const FONTS_CSS = `/* IDEA Foundry platform fonts.
   Self-hosted by the IDEA portal. Use them by name:
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
 * ONE SET OF RESPONSE HEADERS FOR BOTH ASSETS.
 *
 * `access-control-allow-origin: *` for the reason in the banner: the reader is
 * an opaque origin, so even a same-host font fetch is cross-origin and a font
 * fetch without CORS simply fails.
 *
 * `cache-control` is PUBLIC now. Under the proxy these rode `no-store`,
 * because who may read a bundle was a per-request decision; these six files
 * are the platform's own type and are the same bytes for everybody. A day
 * rather than a year because the URLs carry no content hash, so a swapped face
 * has to be able to reach a machine that already cached one.
 *
 * `x-content-type-options: nosniff` so a font can never be sniffed into
 * anything else, and `cross-origin-resource-policy: cross-origin` because the
 * default `same-origin` would have a bundle's request refused by the browser
 * before the CORS header was ever consulted.
 */
function platformHeaders(contentType: string): Headers {
	return new Headers({
		'content-type': contentType,
		'access-control-allow-origin': '*',
		'cross-origin-resource-policy': 'cross-origin',
		'cache-control': 'public, max-age=86400',
		'x-content-type-options': 'nosniff'
	});
}

/** A bodyless 404, so an unknown asset name reveals nothing about the map. */
function notFound(): Response {
	return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
}

const handler: RequestHandler = async ({ params, request }) => {
	const asset = params.asset ?? '';

	if (asset === 'fonts.css') {
		const bytes = new TextEncoder().encode(FONTS_CSS);
		const headers = platformHeaders('text/css; charset=utf-8');
		headers.set('content-length', String(bytes.byteLength));
		return new Response(request.method === 'HEAD' ? null : bytes, { headers });
	}

	if (asset.startsWith('fonts/')) {
		// An exact key in a fixed record. There is no path joining here and
		// nothing is resolved against a filesystem, so `fonts/../../x` is simply
		// a key that is not in the map.
		const file = FONT_FILES[asset.slice('fonts/'.length)];
		if (!file) return notFound();
		const headers = platformHeaders('font/woff2');
		if (request.method === 'HEAD') return new Response(null, { headers });
		return new Response(read(file).body, { headers });
	}

	return notFound();
};

export const GET = handler;
export const HEAD = handler;
