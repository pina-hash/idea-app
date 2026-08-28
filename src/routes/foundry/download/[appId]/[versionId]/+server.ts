import { isAdmin } from '$lib/server/admin';
import { downloadBundleZip } from '$lib/server/foundry-bundle';
import { foundryNotFound, foundryOnAppsOrigin } from '$lib/server/foundry-bundle-response';
import type { RequestHandler } from './$types';

/**
 * THE AUTHOR'S OWN COPY: one whole version of one app, as a zip they keep.
 *
 *   GET /foundry/download/<app id>/<version id>   -> <slug>-v<n>.zip
 *
 * WHAT IT HANDS OVER IS WHAT RUNS, rebuilt from `student_app_files` and the
 * bytes in `foundry-bundles`, never the raw upload -- which exists for every
 * version and is still the wrong thing to send, because it contains files
 * nothing serves and does not round-trip back through ingest. The full argument
 * is in `bundle-url.ts` beside `FOUNDRY_DOWNLOAD_PREFIX`, and the buffering
 * measurement is on `downloadBundleZip`.
 *
 * WHY IT IS ON THE PORTAL ORIGIN, which is the same answer the PREVIEW mount
 * gives at length. `/b/` and `/a/` answer on the apps origin, which deliberately
 * holds no session -- the portal's cookies are host-only on the main host, and
 * that absence is the entire point of the split -- so the only question
 * available there is the VERSION'S OWN STATUS. "Is this viewer the author" can
 * only be asked where the session cookie is, so this route answers here, and
 * refuses on the apps origin explicitly rather than leaning on the cookies
 * being host-only: that is a property of `@supabase/ssr`'s defaults rather than
 * of this feature, and a `Domain` added to them one day would turn a silent
 * guarantee into a silent hole.
 *
 * IT RUNS NOTHING, WHICH IS WHY IT NEEDS NO SANDBOX. Preview has to state a CSP
 * with the strict `sandbox` set because it EXECUTES a student's document on the
 * cookie-carrying host. This response is an `application/zip` attachment: the
 * browser saves it, no document is created, no script is parsed and there is no
 * origin for one to run in. `nosniff` and the attachment disposition are what
 * keep it that way, and they are stated here rather than inherited.
 *
 * WHAT IT PERMITS AND WHAT IT REFUSES is `previewViewerMayRun`, the SAME
 * predicate the preview mount uses and not a second copy of it: the app must
 * exist, the version must belong to the app named in the URL, and the viewer
 * must be the author or an admin. A student takes any version of an app they
 * own -- draft, rejected, superseded, live -- because "does my work still
 * exist" does not depend on where a build is in review. An admin takes any
 * version of any app. A shelved app is refused to its OWNER and served to an
 * ADMIN, matching 0130 refusing the owner's edit of one and 0136 their delete.
 *
 * ANOTHER STUDENT GETS NOTHING, AND THAT IS DELIBERATE RATHER THAN UNFINISHED.
 * Peer download is a different question about student work -- whether a
 * classmate may take a copy of a published app home -- and nobody has asked it.
 * Until somebody does, the gate answers the question it was written for.
 *
 * EVERY REFUSAL IS THE SAME BODYLESS 404, so an unknown app, another student's
 * app, a version belonging to a different app and a bundle that never unpacked
 * are indistinguishable from outside and the URL cannot be used to ask whether
 * a given student has work in progress.
 *
 * A SIGNED-OUT VISITOR NEVER REACHES THIS HANDLER AT ALL: `/foundry` is in
 * `hooks.server.ts`'s `authedPrefixes`, so an anonymous request is redirected
 * before routing. The viewer resolution below still refuses a null session
 * rather than trusting that -- this route's 404 must not depend on a list in
 * another file.
 */
const handle: RequestHandler = async ({ params, url, request, locals }) => {
	if (foundryOnAppsOrigin(url.origin)) return foundryNotFound();

	const appId = params.appId ?? '';
	const versionId = params.versionId ?? '';

	// WHO IS ASKING, FROM THE SESSION AND NOTHING ELSE. `locals.claims` is what
	// `hooks.server.ts` validated with `getClaims()`, and `isAdmin` runs
	// `is_admin()` as the CALLER through their own client -- so both halves are
	// the database's answer about this request, never a value off the URL.
	const uid = locals.claims?.sub ?? null;
	const viewer = uid ? { id: uid, isAdmin: await isAdmin(locals.supabase, uid) } : null;

	const result = await downloadBundleZip(appId, versionId, viewer);
	if (!result.ok) return foundryNotFound();

	// A HEAD ANSWERS THE SAME HEADERS WITH NO BODY. The archive is built either
	// way, which is the honest cost of a content length that is true: there is
	// nothing stored whose size could be read without building it.
	const body = request.method === 'HEAD' ? null : (result.bytes as unknown as BodyInit);

	return new Response(body, {
		headers: {
			'content-type': 'application/zip',
			'content-length': String(result.bytes.byteLength),
			// `attachment` rather than relying on a `download` attribute, which is
			// a request the browser may ignore: this is what makes a save happen
			// wherever the link is followed from, including a right-click and a
			// paste of the URL. The filename is ASCII by construction (the slug
			// charset), so no `filename*` parameter is needed.
			'content-disposition': `attachment; filename="${result.filename}"`,
			'x-content-type-options': 'nosniff',
			// The bytes for one version never change, but WHO may read them does
			// -- an app can be shelved between two requests -- so this is the same
			// `private` posture every other bundle byte is served under.
			'cache-control': 'private, max-age=0, no-store',
			'referrer-policy': 'no-referrer',
			'x-robots-tag': 'noindex, nofollow'
		}
	});
};

export const GET = handle;
export const HEAD = handle;

// Nothing here may be written to, and a method that is not GET or HEAD is
// answered the same way an unknown app is.
export const fallback: RequestHandler = async () => foundryNotFound();
