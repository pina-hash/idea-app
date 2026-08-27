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

/**
 * THE PREVIEW MOUNT: a version of an app the AUTHOR may run before anybody has
 * approved it.
 *
 *   /foundry/preview/<app id>/<version id>/
 *
 * WHY IT IS A THIRD SHAPE AND NOT A FLAG ON ONE OF THE FIRST TWO. `/b/` and
 * `/a/` both answer on the APPS ORIGIN, which deliberately holds no session --
 * that absence is the whole of what the split buys, and it is the reason both
 * of them gate on the VERSION'S OWN STATUS rather than on who is asking. A
 * draft has no status that licenses serving, and there is nothing on that host
 * that could tell whether the person asking wrote it. So preview cannot be a
 * widening of either gate; it has to answer where the session cookie is.
 *
 * WHICH IS WHY THIS BUILDER TAKES NO ORIGIN, AND MUST NOT GAIN ONE. It is a
 * SAME-ORIGIN path on the portal, deliberately: the route resolves the viewer
 * from `locals.claims` and refuses anyone who is neither the version's author
 * nor an admin, and a caller that could point this at another host would be
 * pointing it at one where that resolution answers nobody. `foundryBundleUrl`
 * and `foundryAppUrl` take an origin because their answer lives elsewhere;
 * this one's answer is here.
 *
 * WHAT IT COSTS, STATED WHERE THE URL IS BUILT: student HTML executing on the
 * cookie-carrying host is the exact thing the apps origin exists to prevent, so
 * the preview response carries the CSP `sandbox` directive with NO
 * `allow-same-origin` -- an opaque origin, from the header, regardless of what
 * any environment variable is set to. See `previewBundleFile` for the gate and
 * `foundryPreviewResponse` for the containment.
 *
 * THE TRAILING SLASH IS THE SAME LOAD-BEARING SLASH THE OTHER TWO HAVE.
 * `.../<version>` has `.../<app>/` as its base URL, so every relative asset in
 * the bundle would resolve one level too high and the app would render
 * unstyled and scriptless -- which reads as a bad upload rather than a bad URL.
 * This only ever produces the slash form; the route 307s the other one.
 */
export const FOUNDRY_PREVIEW_PREFIX = '/foundry/preview/';

/**
 * `/foundry/preview/<app>/<version>/`, or null when it has nothing to point at.
 *
 * NULL IS A REAL ANSWER and the caller renders the absence, exactly as it does
 * for the other two builders: a control whose only possible outcome is a
 * refusal must not be offered.
 */
export function foundryPreviewUrl(
	appId: string | null | undefined,
	versionId: string | null | undefined,
): string | null {
	const app = (appId ?? '').trim();
	const version = (versionId ?? '').trim();
	if (!app || !version) return null;
	return `${FOUNDRY_PREVIEW_PREFIX}${encodeURIComponent(app)}/${encodeURIComponent(version)}/`;
}

/**
 * WHETHER A SURFACE SHOULD OFFER A PREVIEW OF THIS VERSION TO ITS OWNER.
 *
 * IT MIRRORS THE GATE RATHER THAN RESTATING IT, which is the same arrangement
 * `versionIsDeletable` has with `foundry_delete_version`: the BOUNDARY is
 * `previewViewerMayRun` on the server and nothing here can widen it, and this
 * exists so that no control is offered whose only possible answer is a refusal.
 * A button that 404s reads as a broken feature rather than as a rule.
 *
 * IT IS THE OWNER'S VIEW OF THE GATE, and only the clauses a surface can see:
 *
 *   THE FILE COUNT. An upload whose ingest never finished has no entry
 *     document, so the route answers the same bodyless 404 an unknown app does.
 *     This reads the same fact `draftIsSubmittable` reads, for a different
 *     question -- it is not a second copy of that predicate, which additionally
 *     requires the status to be `draft`.
 *
 *   THE HIDDEN FLAG. `previewViewerMayRun` refuses a shelved app to its OWNER,
 *     matching 0130 refusing their edit of one and 0136 their delete of one. An
 *     ADMIN still previews it, which is why this is named for the owner's
 *     surface rather than called a general rule: a staff surface offering the
 *     same control would not read this.
 *
 * WHAT IT DELIBERATELY DOES NOT ASK IS THE STATUS. Every other control on a
 * version row is status-gated, so the natural shape of a regression is somebody
 * adding a status clause to the one control that must not have one -- and the
 * surface would look correct to anybody testing with a submitted or approved
 * build, which is every build a reviewer has. Running a DRAFT is the entire
 * point of the feature.
 */
export function foundryPreviewable(
	app: { hidden_at: string | null } | null | undefined,
	version: { file_count: number } | null | undefined,
): boolean {
	if (!app || !version) return false;
	if (app.hidden_at !== null) return false;
	return version.file_count > 0;
}
