import { FOUNDRY_ENTRY_FILE } from '$lib/foundry/preflight';
import {
	foundryFileResponse,
	foundryNotFound,
	foundryOnServingHost,
	foundryRootRedirect,
} from '$lib/server/foundry-bundle-response';
import type { RequestHandler } from './$types';

/**
 * THE FRAME SRC: one VERSION of a published student bundle, by its own id.
 *
 *   GET /b/<app id>/<version id>/         -> index.html
 *   GET /b/<app id>/<version id>/<path>   -> that file
 *
 * IT NAMES A VERSION BECAUSE ITS CALLERS ARE DECIDING ABOUT ONE. The gallery
 * frames the published build; the review queue frames the SUBMITTED build,
 * which by definition is not published yet. A URL naming only the app could not
 * express the second, which is why `/a/` -- the direct, shareable page -- is a
 * second mount rather than a rename of this one.
 *
 * WHY IT IS HERE AND NOT ON SUPABASE. Nothing Supabase-hosted will serve HTML.
 * Storage rewrites `text/html` to `text/plain` in its renderer, on every path,
 * with no flag; the hosted Edge Function gateway does the SAME rewrite and
 * additionally replaces the function's own CSP with `default-src 'none';
 * sandbox`, which blanks the page even once the type is corrected. Both were
 * measured against the real thing rather than read about. Two independent
 * subsystems refusing identically is a platform posture, not a bug, so the
 * bytes have to come off a host whose headers we set.
 *
 * WHY THERE IS NO TOKEN, NO HOST BRANCH AND NO BUILD STEP. The proxy that
 * burned five lanes had all three, and they are what failed -- not the second
 * origin. This is an ordinary SvelteKit route. Nothing rewrites a route table,
 * nothing signs anything, and `hooks.server.ts` does not know this route
 * exists.
 *
 * WHAT THIS FILE ACTUALLY DOES IS RESOLVE A VERSION AND A PATH. The host gate,
 * the publication re-check, the header set, the shim injection and the one
 * bodyless 404 all live in `$lib/server/foundry-bundle-response`, because `/a/` answers
 * with exactly the same ones and a second copy of a CSP sandbox directive is a
 * page that isolates nothing while looking identical.
 */

/**
 * BOTH URL FORMS REACH THE HANDLER, WHICH NEITHER DEFAULT ALLOWS.
 *
 * SvelteKit's default (`'never'`) would 308 `/b/<app>/<version>/` to the
 * slashless form -- and the slashless form is precisely the broken one, because
 * `.../<version>` has `.../<app>/` as its base URL and every relative asset in
 * every bundle then resolves one level too high. `'always'` is worse in the
 * other direction: it would send `.../style.css` to `.../style.css/`, which is
 * the same defect the Edge Function hit by keying its redirect on the filename
 * instead of on whether the entry was derived.
 *
 * `'ignore'` hands both forms to this file, which then issues the ONE redirect
 * that is correct: bare root, no slash, 307 to the slash form.
 */
export const trailingSlash = 'ignore';

const handle: RequestHandler = async ({ params, url, request }) => {
	if (!foundryOnServingHost(url.origin)) return foundryNotFound();

	const appId = params.appId ?? '';
	const versionId = params.versionId ?? '';
	const rest = params.path ?? '';

	// An empty tail is the bundle ROOT, which means the entry file. `bare` says
	// the entry was DERIVED rather than asked for, which is the only case the
	// trailing-slash redirect may fire on -- keyed on the filename instead, an
	// explicit request for `.../index.html` bounces to `.../index.html/`.
	const bare = rest === '';
	const path = bare ? FOUNDRY_ENTRY_FILE : rest;

	if (bare && !url.pathname.endsWith('/'))
		return foundryRootRedirect(versionId, url.search);

	return foundryFileResponse(appId, versionId, path, url.origin, request.method);
};

export const GET = handle;
export const HEAD = handle;

// Nothing a bundle is may be written to, and a method that is not GET or HEAD
// is answered the same way an unknown app is.
export const fallback: RequestHandler = async () => foundryNotFound();
