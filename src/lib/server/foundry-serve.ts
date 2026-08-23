import { FOUNDRY_STORAGE_SHIM_TAG } from '$lib/foundry/storage-shim';

/**
 * WHAT EVERY BYTE LEAVING THE APPS HOST CARRIES, in one place.
 *
 * The proxy route and the platform-asset route both build their responses
 * here, so "every response from this host" is a property of one function
 * rather than a rule two routes have to remember. A third surface on that host
 * would be a caller of this, not a second copy of the header list.
 */

/**
 * THE CSP, AND THE ONE PLACE IT DEPARTS FROM WHAT WAS SPECIFIED.
 *
 * The specified header was:
 *
 *   sandbox allow-scripts allow-modals allow-pointer-lock;
 *   default-src 'self' data: blob:; connect-src 'none';
 *   frame-ancestors <app origin>
 *
 * `script-src` and `style-src` FALL BACK TO `default-src` when they are
 * absent, and `default-src 'self'` does not permit an inline `<script>` or an
 * inline `<style>`. Under that header the storage shim -- which is an inline
 * script, and has to be, because it must run before the next byte is parsed --
 * is refused by the browser, and so is essentially every generated app, since
 * a single-file app with its script inline is the normal shape and the
 * preflight (`$lib/foundry/preflight`) deliberately permits it.
 *
 * MEASURED, by serving the literal header and loading a bundle: the page
 * rendered its own "script did not run" placeholder and the console carried
 *
 *   Executing inline script violates the following Content Security Policy
 *   directive 'default-src 'self' data: blob:'. ... Note also that
 *   'script-src' was not explicitly set, so 'default-src' is used as a
 *   fallback. The action has been blocked.
 *
 * -- for the shim AND for the bundle's own script. Not a degraded bundle: a
 * blank one.
 *
 * So the two directives are stated EXPLICITLY, with `'unsafe-inline'` and
 * `'unsafe-eval'`. The reasoning is that the isolation here is NOT a
 * script-execution restriction and never was: it is the opaque origin (the
 * `sandbox` directive with no `allow-same-origin`), `connect-src 'none'`, and
 * `frame-ancestors`. Restricting how a document may execute the student's own
 * script -- which is the entire content of the document, deliberately -- buys
 * nothing against a document that can already reach nothing.
 *
 * What `script-src` DOES still buy, and the reason it is not simply
 * `'unsafe-inline'` on `default-src`: the source list still names ONLY the
 * bundle's own origin, so a `<script src="https://cdn.example/x.js">` is
 * refused. That is a real check and it is verified -- the hostile fixture
 * loads a script from jsdelivr and reports its global as undefined.
 *
 * Everything else is unchanged. `connect-src 'none'` is the line that stops
 * fetch, XHR, WebSocket, EventSource and beacons outright. `frame-ancestors`
 * is pinned to the app origin, so only the portal may frame a bundle.
 *
 * THE `sandbox` DIRECTIVE IS DOING SEPARATE WORK FROM THE IFRAME ATTRIBUTE.
 * The attribute governs a document the portal frames; the directive governs
 * the document however it was reached, so a student who navigates straight to
 * a bundle URL lands in the same opaque origin as one who views it framed.
 * Neither is redundant and neither replaces the other.
 */
export function foundryCsp(appOrigin: string, bundleOrigin: string): string {
	// A missing app origin means nothing may frame a bundle at all. That is the
	// fail-closed direction: `frame-ancestors 'none'` costs the gallery its
	// embed on a misconfigured deployment, where the alternative -- omitting
	// the directive -- would let any site on the internet frame one.
	const ancestors = appOrigin ? appOrigin : "'none'";

	/**
	 * THE SOURCE LIST NAMES THE BUNDLE ORIGIN LITERALLY RATHER THAN SAYING
	 * `'self'`, AND THIS IS THE SECOND DEPARTURE FROM THE SPECIFIED HEADER.
	 *
	 * `sandbox` without `allow-same-origin` puts the document on an OPAQUE
	 * origin. CSP's `'self'` is the only origin-RELATIVE source expression: it
	 * matches a URL whose origin is the same as the origin the policy is
	 * enforced for, and an opaque origin is same-origin with nothing -- not even
	 * the host the document was served from. By the letter of the spec, then,
	 * `default-src 'self'` on a sandboxed document permits the document to load
	 * none of its own files, and browsers have historically disagreed about
	 * whether to follow that letter (they can compute `self` from the RESPONSE
	 * URL instead, which is the forgiving reading).
	 *
	 * A host source expression has no such ambiguity: it is matched against the
	 * URL, never against the document's origin, so it means the same thing in
	 * every engine whether or not the document is sandboxed. The origin comes
	 * from the REQUEST'S OWN URL rather than a second environment variable,
	 * because the host that served the response is by definition the origin its
	 * relative URLs resolve against.
	 *
	 * WHAT WAS AND WAS NOT MEASURED, because the difference matters and a first
	 * pass here got it wrong. In the sandboxed document, a `<link>` to a
	 * `data:` stylesheet and a `blob:` one both applied while a `<link>` to the
	 * bundle's own `style.css` fired `onerror` -- which reads exactly like the
	 * `'self'` mismatch above and IS NOT. It was the verification pane blocking
	 * every subresource request made from an opaque origin
	 * (`net::ERR_BLOCKED_BY_CLIENT`, with no `securitypolicyviolation` event at
	 * all), proven by fetching the identical URLs from an ordinary page in the
	 * same browser and getting 200. So: the literal origin is chosen for
	 * PORTABILITY against a real spec ambiguity, not because `'self'` was
	 * observed to fail. Whether `'self'` would have worked here is untested.
	 *
	 * DO NOT REPLACE IT WITH `'self'`. Adding `'self'` alongside changes
	 * nothing; swapping it in trades a source expression that certainly works
	 * for one that might not, and the failure would be a bundle rendering as
	 * unstyled text with its stylesheet sitting in `document.styleSheets`
	 * looking loaded.
	 */
	const own = bundleOrigin || "'none'";

	return [
		'sandbox allow-scripts allow-modals allow-pointer-lock',
		`default-src ${own} data: blob:`,
		`script-src ${own} data: blob: 'unsafe-inline' 'unsafe-eval'`,
		`style-src ${own} data: blob: 'unsafe-inline'`,
		"connect-src 'none'",
		`frame-ancestors ${ancestors}`
	].join('; ');
}

/**
 * The MIME allowlist, which is a SECOND gate over a value that is already
 * closed.
 *
 * `student_app_files.content_type` is written only by the ingest function, from
 * `foundryMime()`'s fixed table keyed on an allowlisted extension, so it can
 * only already be one of these. This is the same defence-in-depth the deck
 * proxy carries and it costs one set lookup: same-origin `text/html` runs as
 * script, and the row this route trusts is a row a future writer could widen.
 * Anything outside the list is served `application/octet-stream`, never the
 * stored value and never an echo of anything upstream reported.
 */
const SERVABLE = new Set([
	'text/html',
	'text/css',
	'text/javascript',
	'application/json',
	'text/plain',
	'image/png',
	'image/jpeg',
	'image/webp',
	'image/gif',
	'image/svg+xml',
	'audio/mpeg',
	'audio/wav',
	'audio/ogg',
	'font/woff2',
	'font/ttf'
]);

/** The stored type if the allowlist knows it, `application/octet-stream` if not. */
export function servableContentType(stored: string | null | undefined): string {
	const raw = (stored ?? '').trim();
	// The stored values carry `; charset=utf-8` on the text types; the allowlist
	// is keyed on the type itself.
	const base = raw.split(';')[0].trim().toLowerCase();
	if (!base || !SERVABLE.has(base)) return 'application/octet-stream';
	return raw;
}

export function isHtmlContentType(contentType: string): boolean {
	return contentType.split(';')[0].trim().toLowerCase() === 'text/html';
}

/**
 * INJECTS THE SHIM AS THE FIRST ELEMENT IN THE HEAD, and does nothing else to
 * the document.
 *
 * This is an INSERTION, not a rewrite. Every other byte of the student's file
 * comes out exactly as it went in -- no parse, no reserialize, no attribute
 * normalization, no entity rewriting. A parse-and-emit pass would silently
 * change bundles in ways nobody asked for (a self-closing tag reopened, an
 * unquoted attribute quoted, a stray `<` escaped), and the failures would land
 * on the student.
 *
 * THREE PLACEMENTS, in order, because a generated app does not always have a
 * head:
 *
 *   1. after the first `<head ...>` open tag -- the normal case;
 *   2. after the first `<html ...>` open tag when there is no head, because a
 *      browser hoists a leading script into the head it synthesizes anyway;
 *   3. at the very start when there is neither, after a leading doctype if one
 *      is present, so the doctype stays first and the document does not fall
 *      into quirks mode.
 *
 * The `<head>` match is a regex over the raw text, so a `<head>` written
 * inside a comment or a string BEFORE the real one would win. That is accepted
 * rather than solved: the cost is a shim that runs slightly later in a
 * document nobody writes, and the alternative is the full parse this function
 * exists to avoid.
 */
export function injectStorageShim(html: string): string {
	const head = /<head\b[^>]*>/i.exec(html);
	if (head) {
		const at = head.index + head[0].length;
		return html.slice(0, at) + FOUNDRY_STORAGE_SHIM_TAG + html.slice(at);
	}

	const htmlTag = /<html\b[^>]*>/i.exec(html);
	if (htmlTag) {
		const at = htmlTag.index + htmlTag[0].length;
		return html.slice(0, at) + FOUNDRY_STORAGE_SHIM_TAG + html.slice(at);
	}

	const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
	if (doctype) {
		const at = doctype[0].length;
		return html.slice(0, at) + FOUNDRY_STORAGE_SHIM_TAG + html.slice(at);
	}

	return FOUNDRY_STORAGE_SHIM_TAG + html;
}

/**
 * The headers every apps-host response carries.
 *
 * `Cache-Control: private, no-store` is stronger than the bytes need -- a
 * bundle file is immutable, and the platform fonts are the same for everybody
 * -- and it is deliberate. The bytes are reachable only through a token that
 * expires in thirty minutes, and a shared or disk cache holding them past that
 * is a copy the token can no longer withdraw. The cost is that a bundle
 * re-fetches its own assets on a reload, which for a 25 MB cap on a school
 * network is a cost worth paying for a cache that cannot outlive its
 * authorization.
 *
 * NO COOKIE IS EVER SET ON THIS HOST. There is nothing here that sets one, and
 * the viewer's own cookies never arrive: the host is a different site, so the
 * browser does not send them, and nothing in this path forwards them.
 */
export function foundryResponseHeaders(
	contentType: string,
	appOrigin: string,
	bundleOrigin: string
): Headers {
	return new Headers({
		'content-type': contentType,
		'content-security-policy': foundryCsp(appOrigin, bundleOrigin),
		'x-content-type-options': 'nosniff',
		'cache-control': 'private, no-store'
	});
}

/**
 * ONE 404, USED FOR EVERYTHING THE APPS HOST REFUSES.
 *
 * No body, no reason, no header that differs between causes. A bad signature,
 * an expired token, a token for another app's file, a path with no row, a
 * hidden app and an ordinary app route on the wrong host all answer with
 * exactly this, so nothing about the response distinguishes "wrong" from "not
 * there" and a token cannot be used to probe for what exists.
 */
export function foundryNotFound(): Response {
	return new Response(null, {
		status: 404,
		headers: { 'cache-control': 'private, no-store' }
	});
}
