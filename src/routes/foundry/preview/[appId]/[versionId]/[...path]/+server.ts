import { FOUNDRY_ENTRY_FILE } from '$lib/foundry/preflight';
import { isAdmin } from '$lib/server/admin';
import {
	foundryNotFound,
	foundryOnAppsOrigin,
	foundryPreviewResponse,
	foundryRootRedirect,
} from '$lib/server/foundry-bundle-response';
import type { RequestHandler } from './$types';

/**
 * THE AUTHOR'S OWN RUN: one version of one app, at ANY status, in front of the
 * person who wrote it.
 *
 *   GET /foundry/preview/<app id>/<version id>/         -> index.html
 *   GET /foundry/preview/<app id>/<version id>/<path>   -> that file
 *
 * THE PROBLEM IT EXISTS FOR. `serveBundleFile` -- the gate on both published
 * mounts -- serves a version when it is the app's `published_version_id` or its
 * status is `submitted`, and nothing else. A DRAFT is therefore unreachable by
 * anybody, including the student who just uploaded it, so the first time anyone
 * on earth finds out whether the app actually runs is after a reviewer opens
 * it. That spends a review cycle on a build the author could have fixed in a
 * minute, and it teaches a student that the platform is something you post work
 * into rather than something you work in.
 *
 * WHY IT IS ON THE PORTAL ORIGIN, WHICH IS THE PART THAT LOOKS WRONG AND IS
 * NOT. `/b/` and `/a/` answer on the APPS ORIGIN, which deliberately holds no
 * session -- the portal's cookies are host-only on the main host, so they are
 * not sent there at all, and that absence is the entire point of the split.
 * Which means the apps origin has no way to tell whether the person asking is
 * the author: the only question available to it is the VERSION'S OWN STATUS,
 * which is exactly why both of those gates are written that way. A preview
 * cannot be a widening of either, because on that host the only audience a
 * widening can express is EVERYONE -- admitting a draft there would admit every
 * draft in the table to the open internet. The question "is this viewer the
 * author" can only be asked where the session cookie is, so this route answers
 * there.
 *
 * SO THE CONTAINMENT IS EXPLICIT RATHER THAN INHERITED. Student HTML executing
 * on the cookie-carrying host is the exact thing the apps origin exists to
 * prevent, and this route does it deliberately -- so it does not lean on any
 * environment variable for its isolation. `foundryPreviewResponse` hands the
 * header builder ONE ORIGIN TWICE, which makes `foundrySandboxFlags`'s
 * "non-empty and different" condition impossible to satisfy: the CSP `sandbox`
 * directive carries the strict set with NO `allow-same-origin`, in every
 * configuration, so the document lands in an OPAQUE ORIGIN and
 * `document.cookie`, `localStorage` and every reach at a parent throw. The
 * portal's session tokens are `httpOnly: false` -- readable by
 * `document.cookie` -- which is what makes that the load-bearing property here
 * rather than a nicety.
 *
 * WHAT THE EXCEPTION IS ACTUALLY BOUNDED BY, stated plainly because it is a
 * real one: the gate means the only session a student's bundle ever runs in
 * front of on this host is THEIR OWN, or an admin's who deliberately opened it.
 * It never runs in front of a third student, which is the case the origin split
 * is about. A student running their own code in their own browser is not a
 * privilege escalation; it is what a browser is.
 *
 * WHAT IT PERMITS AND WHAT IT REFUSES is `previewBundleFile`'s header, in one
 * predicate: any status including `draft`, the app must exist (a deleted one has
 * no row), the version must belong to the app named in the URL, and the viewer
 * must be the author or an admin. EVERYTHING ELSE IS THE SAME BODYLESS 404 the
 * other two mounts use, so a draft somebody may not see and a version that does
 * not exist are indistinguishable and the URL cannot be used to ask whether a
 * given student has work in progress.
 *
 * A SIGNED-OUT VISITOR NEVER REACHES THIS HANDLER AT ALL. `/foundry` is in
 * `hooks.server.ts`'s `authedPrefixes`, so an anonymous request is redirected to
 * `/` before routing -- identically for every preview URL, so it is not an
 * oracle either. The `viewer` resolution below still refuses a null session
 * rather than trusting that: this route's 404 must not depend on a list in
 * another file.
 */

/**
 * BOTH URL FORMS REACH THE HANDLER, FOR THE REASON `/b/` DOCUMENTS AT LENGTH.
 * `'never'` would 308 `/foundry/preview/<app>/<version>/` to the slashless
 * form, whose base URL is one level too high, so every relative asset in the
 * bundle would 404 and the app would render unstyled and scriptless -- which
 * reads as a bad upload rather than a bad URL, on the one surface whose whole
 * job is telling a student whether their upload is good. `'always'` would send
 * `.../style.css` to `.../style.css/`. Only `'ignore'` hands both forms here.
 */
export const trailingSlash = 'ignore';

const handle: RequestHandler = async ({ params, url, request, locals }) => {
	// NOT ON THE APPS ORIGIN. There is no session there, so this would refuse
	// anyway -- but the implicit refusal rests on the session cookies being
	// host-only, which is a property of `@supabase/ssr`'s defaults rather than of
	// this feature. Naming the host it will not answer on is what stops a
	// `Domain` added to those cookies one day turning a silent guarantee into a
	// silent hole.
	if (foundryOnAppsOrigin(url.origin)) return foundryNotFound();

	const appId = params.appId ?? '';
	const versionId = params.versionId ?? '';
	const rest = params.path ?? '';

	// An empty tail is the bundle ROOT, which means the entry file. `bare` says
	// the entry was DERIVED rather than asked for, which is the only case the
	// trailing-slash redirect may fire on -- keyed on the filename instead, an
	// explicit request for `.../index.html` bounces to `.../index.html/`.
	const bare = rest === '';
	const path = bare ? FOUNDRY_ENTRY_FILE : rest;

	// BEFORE THE VIEWER IS RESOLVED, DELIBERATELY. The redirect says nothing
	// about whether the app, the version or the viewer exists -- it is a fact
	// about the URL's shape -- so issuing it first costs an unauthorised caller
	// one extra request and tells them nothing, while asking `is_admin()` first
	// would spend a round trip on every relative asset request that is about to
	// be redirected anyway.
	if (bare && !url.pathname.endsWith('/'))
		return foundryRootRedirect(versionId, url.search);

	// WHO IS ASKING, FROM THE SESSION AND NOTHING ELSE. `locals.claims` is what
	// `hooks.server.ts` validated with `getClaims()`, and `isAdmin` runs
	// `is_admin()` as the CALLER through their own client -- so both halves are
	// the database's answer about this request, never a value off the URL.
	//
	// NO SESSION IS A NULL VIEWER, WHICH THE GATE REFUSES. It is not an early
	// return of its own: one refusal, in one predicate, is what keeps "who may
	// preview" a single sentence.
	const uid = locals.claims?.sub ?? null;
	const viewer = uid ? { id: uid, isAdmin: await isAdmin(locals.supabase, uid) } : null;

	return foundryPreviewResponse(appId, versionId, path, url.origin, request.method, viewer);
};

export const GET = handle;
export const HEAD = handle;

// Nothing a bundle is may be written to, and a method that is not GET or HEAD
// is answered the same way an unknown app is.
export const fallback: RequestHandler = async () => foundryNotFound();
