import { FOUNDRY_ENTRY_FILE } from '$lib/foundry/preflight';
import { publishedVersionOf } from '$lib/server/foundry-bundle';
import {
	foundryFileResponse,
	foundryNotFound,
	foundryOnServingHost,
	foundryRootRedirect,
} from '$lib/server/foundry-bundle-response';
import type { RequestHandler } from './$types';

/**
 * THE DIRECT PAGE: one published app, as the WHOLE DOCUMENT.
 *
 *   GET /a/<app id>/         -> the published version's index.html
 *   GET /a/<app id>/<path>   -> that file of the published version
 *
 * WHY IT EXISTS. In the gallery an app runs in an iframe, inside a detail pane,
 * inside a two-pane split, inside the portal shell -- so it gets whatever is
 * left after three layers of chrome, and a bundle with a fixed playfield has to
 * be zoomed out before it is usable. VANGUARD gets a whole page because it is
 * our code on our origin; a student's app can never be that, because the split
 * exists precisely so it never runs where the session cookies live. But it CAN
 * be a whole page one origin over, which is this.
 *
 * IT NAMES THE APP, NOT A VERSION, AND THAT IS THE POINT OF A SECOND MOUNT. A
 * `/b/` URL pins a build and stops resolving the day the student publishes
 * again -- correct for a frame built from a row the gallery just read, wrong for
 * a link somebody pasted into a message last term. This resolves
 * `published_version_id` on every request, so one link keeps opening whatever is
 * published now, and stops opening anything the moment nothing is.
 *
 * IT IS PUBLIC, DELIBERATELY, AND THERE IS NO SESSION CHECK TO ADD. There is no
 * session on this origin -- the portal's cookies are host-only on the main host,
 * which is the whole reason for the split -- so requiring a signed-in caller
 * here would mean either `Domain`-scoping those cookies onto the apps host,
 * which hands every student bundle the credentials the split exists to withhold,
 * or putting a signed token back on every request, which is the machinery five
 * lanes were spent removing. Anyone proposing one has to answer that first.
 *
 * WHAT BECOMES PUBLIC IS THE WORK, NOT THE STUDENT. This route reads the app
 * row for ONE column -- `published_version_id` -- and the version's files. It
 * never reads, projects or renders the author's name, their class, the build
 * notes, the description or the version history; those are gallery surfaces and
 * the gallery is signed in. A person handed this link gets the app and learns
 * nothing about who wrote it that the app itself does not tell them.
 *
 * ISOLATION HOLDS WITH NO FRAME AROUND IT. The response carries the same CSP
 * `sandbox` directive every bundle byte does, and that directive -- unlike the
 * iframe attribute, which needs a frame to be on -- applies to the document
 * however it was reached. Measured against a real served bundle: on a DIRECT
 * navigation `window.origin` is `"null"`, and `document.cookie`, `indexedDB`
 * and every reach at a parent throw `SecurityError`, exactly as they do framed.
 *
 * IT IS STRICTLY NARROWER THAN `/b/`. `publishedVersionOf` never returns a
 * SUBMITTED version, so a build waiting for review has no direct page even
 * though `/b/` will run it for the reviewer. The queue has to execute the thing
 * it is deciding about; an app's own public address does not.
 */

/**
 * BOTH URL FORMS REACH THE HANDLER, FOR THE REASON `/b/` DOCUMENTS AT LENGTH.
 * `'never'` would 308 `/a/<app>/` to the slashless form, whose base URL is
 * `/a/` -- so `style.css` would resolve to `/a/style.css` and the app would
 * render unstyled and scriptless. `'always'` would send `.../style.css` to
 * `.../style.css/`. Only `'ignore'` hands both forms here.
 */
export const trailingSlash = 'ignore';

/**
 * HOW A RELATIVE ASSET RESOLVES, WHICH IS THE WHOLE SHAPE OF THIS ROUTE.
 *
 * The entry document says `<link href="style.css">`, and nothing rewrites it --
 * the source viewer, the ingest function and this route all agree that a stored
 * byte is served back unchanged. So the URL has to do the work: the document is
 * served at `/a/<app>/`, which makes `/a/<app>/` its base, so `style.css`
 * resolves to `/a/<app>/style.css` and arrives here as `params.path`. Every
 * relative reference a bundle can hold -- a stylesheet, a script, an image, a
 * `fetch('data.json')` -- lands on this same handler with the tail it asked for.
 *
 * THE REJECTED ALTERNATIVE WAS `<base href>`, AND THE REASON IS THE STUDENT'S
 * BYTES, NOT THE POLICY. This paragraph used to say a `<base>` CANNOT work,
 * because the bundle CSP carried `base-uri 'none'` and the browser would ignore
 * the element outright. That claim is now FALSE: `base-uri` names the bundle
 * origin and `https:`, so a `<base href>` a student ships is honoured -- which
 * is the point of the change, since a game ported from elsewhere routinely
 * arrives as one HTML file pointing at the CDN its assets live on.
 *
 * The argument that survives is the one that never depended on the CSP. Making
 * `/a/` work by INJECTING a `<base>` would mean this route rewriting the entry
 * document, and the ingest function, the source viewer and both serving routes
 * all agree that a stored byte is served back unchanged -- so a reviewer reads
 * what executes. A path shape costs nothing, rewrites nothing, and is the only
 * one of the two that leaves that true.
 *
 * THE OTHER REJECTED ALTERNATIVE WAS A REDIRECT TO `/b/<app>/<version>/`. It
 * would serve the app, but the address bar would then hold the version URL --
 * so a screenshot, a bookmark or a re-paste of what is on screen carries a link
 * that dies at the next publish, which is exactly what this mount exists to
 * avoid.
 */
const handle: RequestHandler = async ({ params, url, request }) => {
	if (!foundryOnServingHost(url.origin)) return foundryNotFound();

	const appId = params.appId ?? '';
	const rest = params.path ?? '';

	// An empty tail is the app ROOT, which means the entry file. `bare` says the
	// entry was DERIVED rather than asked for, which is the only case the
	// trailing-slash redirect may fire on -- keyed on the filename instead, an
	// explicit request for `.../index.html` bounces to `.../index.html/`.
	const bare = rest === '';
	const path = bare ? FOUNDRY_ENTRY_FILE : rest;

	if (bare && !url.pathname.endsWith('/'))
		return foundryRootRedirect(appId, url.search);

	// A LOOKUP, THEN THE GATE. This resolves which version the app is currently
	// showing and hands it straight to the shared responder, which re-checks --
	// on every request, bypassing nothing -- that the version belongs to the app,
	// that the app is not hidden, and that the version is live. So an app hidden
	// or deleted after a link was shared stops serving in the same statement that
	// hid or deleted it, and a null here (nothing published, or no such app) is
	// the same bodyless 404 as everything else.
	const versionId = await publishedVersionOf(appId);

	return foundryFileResponse(appId, versionId, path, url.origin, request.method);
};

export const GET = handle;
export const HEAD = handle;

// Nothing a bundle is may be written to, and a method that is not GET or HEAD
// is answered the same way an unknown app is.
export const fallback: RequestHandler = async () => foundryNotFound();
