/**
 * WHERE A PUBLISHED BUNDLE LIVES, as one pure expression.
 *
 *   <apps origin>/b/<app id>/<version id>/
 *
 * NOTHING SUPABASE-HOSTED CAN SERVE THIS, AND THAT IS MEASURED RATHER THAN
 * ASSUMED. Two independent Supabase subsystems refuse to emit HTML:
 *
 *   Storage         `text/html` -> `text/plain`, on the public, authenticated
 *                   and signed-URL paths alike, with no flag for it.
 *   Edge Functions  the hosted gateway rewrites `text/html` -> `text/plain`
 *                   AND replaces the function's own CSP with
 *                   `default-src 'none'; sandbox`, which blanks the page even
 *                   if the type were corrected.
 *
 * Different codebases, different languages, same refusal: it is a platform
 * posture against serving arbitrary HTML off `*.supabase.co`, not a bug in
 * either. So the bytes come off a host whose headers we set, which means the
 * Vercel app itself.
 *
 * THE APPS HOST IS A SECOND ORIGIN AND IT WAS NEVER WHAT FAILED. The proxy
 * that burned five lanes failed on a signed token, a `hooks.server.ts` host
 * branch and a build step that rewrote the generated route table. None of
 * those exists here: this is an ordinary SvelteKit route on the same Vercel
 * project, reached on a second domain that is already configured on it.
 *
 * WHAT THE SECOND ORIGIN BUYS, AND WHY IT IS A STRUCTURAL PROPERTY RATHER THAN
 * A BEHAVIOURAL ONE. The portal's session cookies are set by `@supabase/ssr`
 * with NO `Domain` attribute (its `DEFAULT_COOKIE_OPTIONS` sets only `path`,
 * `sameSite: 'lax'` and `httpOnly: false`, and `hooks.server.ts` adds nothing),
 * so they are HOST-ONLY on `ideabosco.com` and are not sent to
 * `apps.ideabosco.com` at all. A bundle containing `<img src="/api/whatever">`
 * therefore reaches a host that holds no session -- because there is no cookie
 * there to send, not because a browser declined to send one. Serving from the
 * main host under a sandbox would rest instead on the browser computing a null
 * site-for-cookies for an opaque-origin initiator, which is a subtler thing
 * and one that can regress. An absence cannot.
 *
 * SO THE FRAME SRC IS A PLAIN, STABLE URL. It does not expire, so re-launching
 * costs no round trip; it carries no secret, so it can be logged, screenshotted
 * and pasted into a bug report; and there is no mint to be unavailable. What it
 * is NOT is a licence: the route re-checks on every single request that the
 * version belongs to the app, that the app is not hidden, and that the version
 * is published or submitted. A withdrawal takes effect on the next request
 * rather than in thirty minutes.
 *
 * THE TRAILING SLASH IS LOAD-BEARING. `.../<version>` has `.../<app>/` as its
 * base URL, so every relative asset in every bundle would resolve one level too
 * high -- an app that renders unstyled and scriptless, which reads as a bad
 * upload rather than a bad URL. This only ever produces the slash form; the
 * route redirects the other one rather than trusting that nothing generates it.
 *
 * THIS MODULE IS PURE AND READS NO ENVIRONMENT, so the component, the harness
 * and the tests all build a URL with one copy of the rule. The caller supplies
 * the origin.
 */

/** The bucket `foundry-ingest` extracts into and the serving route reads. */
export const FOUNDRY_BUNDLE_BUCKET = 'foundry-bundles';

/**
 * The other two buckets Foundry owns, named here beside the first so the three
 * are stated once rather than as a literal at each of the seven call sites
 * that reach one. They are plain strings and this module is pure, so a route,
 * a component and the server-side delete sweep all name the same bucket.
 *
 *   uploads  the raw zip, under the OWNER's own prefix (`<uid>/<uuid>.zip`),
 *            which is the whole of what its storage policies permit.
 *   covers   the public card image, same own-prefix rule.
 */
export const FOUNDRY_UPLOAD_BUCKET = 'foundry-uploads';
export const FOUNDRY_COVER_BUCKET = 'foundry-covers';

/**
 * The path segment the serving route is mounted at.
 *
 * SHORT ON PURPOSE: it is in front of every relative asset request a bundle
 * makes, and it is the URL a student sees when they open their own app.
 */
export const FOUNDRY_BUNDLE_PREFIX = '/b/';

/** Trailing slashes off, so joining cannot produce a doubled one. */
function trimOrigin(origin: string | null | undefined): string {
	return (origin ?? '').trim().replace(/\/+$/, '');
}

/**
 * `<apps origin>/b/<app>/<version>/<path>`, or null when it has nothing to
 * point at.
 *
 * NULL IS A REAL ANSWER AND THE CALLER RENDERS THE ABSENCE. A frame whose src
 * is the empty string loads the CURRENT PAGE into itself, which on a gallery is
 * a recursive render rather than a missing app.
 */
export function foundryBundleUrl(
	appsOrigin: string | null | undefined,
	appId: string | null | undefined,
	versionId: string | null | undefined,
	path = '',
): string | null {
	const origin = trimOrigin(appsOrigin);
	const app = (appId ?? '').trim();
	const version = (versionId ?? '').trim();
	if (!origin || !app || !version) return null;

	// The ids are uuids and a path has already been judged by the preflight, so
	// there is nothing here that needs escaping -- but encoding each segment
	// costs nothing and means a future filename cannot break the URL.
	const tail = path
		.split('/')
		.filter((s) => s.length > 0)
		.map((s) => encodeURIComponent(s))
		.join('/');

	return `${origin}${FOUNDRY_BUNDLE_PREFIX}${encodeURIComponent(app)}/${encodeURIComponent(version)}/${tail}`;
}

/**
 * THE DIRECT PAGE'S PATH SEGMENT: one app, as the WHOLE DOCUMENT.
 *
 *   <apps origin>/a/<app id>/
 *
 * WHY A SECOND MOUNT AND NOT A QUERY ON THE FIRST. `/b/` names a VERSION and
 * `/a/` names an APP, and the difference is which of them a link outlives. A
 * `/b/` URL stops resolving the day the student publishes again, which is
 * correct for a frame the gallery builds from a row it just read and wrong for
 * a link somebody pasted into a message last term. `/a/` resolves the app's
 * `published_version_id` on every request, so the same link keeps opening
 * whatever is published now -- and stops opening anything the moment nothing
 * is.
 *
 * IT IS DELIBERATELY PUBLIC, and that is a property of the ORIGIN rather than
 * a decision this module makes. There is no session on the apps host -- the
 * portal's cookies are host-only on the main one, which is the whole reason
 * for the split -- so "require a signed-in caller" is not available here
 * without handing every bundle the credentials the split exists to withhold.
 * What becomes public is the WORK: the direct page carries the bundle and
 * nothing else. The author's name, their class and the build notes are on the
 * gallery, which is signed-in, and the direct route never reads them.
 *
 * THE TRAILING SLASH IS THE SAME LOAD-BEARING SLASH `/b/` HAS. `.../<app>` has
 * `/a/` as its base URL, so `style.css` in the entry document would resolve to
 * `/a/style.css` and the app would render unstyled and scriptless -- which
 * reads as a bad upload rather than a bad URL. This builder only ever produces
 * the slash form; the route 307s the other one rather than trusting that
 * nothing generates it.
 */
export const FOUNDRY_APP_PREFIX = '/a/';

/**
 * `<apps origin>/a/<app>/`, or null when there is nothing to point at.
 *
 * NULL IS A REAL ANSWER, exactly as it is for `foundryBundleUrl`: a deployment
 * with no apps origin has no direct page to offer, and a surface renders the
 * absence rather than a link to `/a/`.
 *
 * IT TAKES NO VERSION, ON PURPOSE. Handing one in would make this a second
 * spelling of `foundryBundleUrl` whose extra argument is ignored, and the
 * first thing a caller would do with it is wonder which of the two it pins.
 */
export function foundryAppUrl(
	appsOrigin: string | null | undefined,
	appId: string | null | undefined,
): string | null {
	const origin = trimOrigin(appsOrigin);
	const app = (appId ?? '').trim();
	if (!origin || !app) return null;
	return `${origin}${FOUNDRY_APP_PREFIX}${encodeURIComponent(app)}/`;
}
