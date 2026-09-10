import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';
import { hxDocument } from '../_documents';
import { hxDocumentHeaders, hxOnServingHost, hxPortalOrigin } from '../_headers';
import type { RequestHandler } from './$types';

/**
 * THE SERVING ROUTE FOR A PORTED HTML ASSIGNMENT.
 *
 *   GET /hx/<doc id>   the whole document, on the SANDBOX ORIGIN, under the
 *                      contract's CSP.
 *
 * IT IS AN ORDINARY SVELTEKIT ROUTE, WHICH IS THE POINT. The lesson this
 * codebase already paid for -- five lanes, in Foundry -- is that a second host,
 * a signed token, a `hooks.server.ts` host branch and a build step that
 * rewrites the generated route table are what fail, not the second origin.
 * There is none of that here: nothing signs anything, nothing rewrites a route
 * table, and `hooks.server.ts` does not know this route exists.
 *
 * WHY A SECOND ORIGIN AT ALL, RATHER THAN A HEADER ON THE MAIN HOST. A header
 * governs scripting and document origin; it does not govern whether a
 * SUBRESOURCE request carries credentials. A document containing
 * `<img src="/api/whatever">` served from `ideabosco.com` reaches the real
 * backend with the viewer's cookies attached. Served from a different site it
 * reaches a host that holds no session -- an ABSENCE, not a browser declining
 * to send one. `@supabase/ssr` sets the session cookies with no `Domain` and
 * with `httpOnly: false`, so they are host-only on `ideabosco.com` and readable
 * by `document.cookie`: the host a student's uploaded document runs on is
 * exactly the question.
 *
 * THE SANDBOX IS THE OTHER HALF AND NEITHER IS SUFFICIENT ALONE. The frame
 * attribute is `sandbox="allow-scripts"` with no `allow-same-origin`, which is
 * what puts a FRAMED document in an opaque origin. Note what that does NOT
 * cover: the contract's CSP carries no `sandbox` directive, so a student who
 * navigates STRAIGHT to a `/hx/` URL gets the real sandbox origin rather than an
 * opaque one. That gap is discussed where the policy is built
 * (`../_headers.ts`) and reported rather than closed here -- the CSP is
 * normative and four lanes are building against it.
 *
 * WHAT THIS FILE ACTUALLY DECIDES IS THREE THINGS: whether the request arrived
 * on the origin this route answers on, whether the document exists, and what
 * headers the bytes carry. The bytes themselves come from `../_documents`,
 * which is two hardcoded strings for this lane and is the seam the import path
 * replaces.
 */

/**
 * ONE REFUSAL FOR EVERYTHING. An unknown document id, the probe document in
 * production, a `/hx/` path on the wrong host and a method that is not GET or
 * HEAD are indistinguishable from outside. `no-store` so a 404 for a document
 * that is about to be imported is not cached into the next viewer's browser.
 */
function notFound(): Response {
	return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
}

const handle: RequestHandler = async ({ params, url, request }) => {
	if (!hxOnServingHost(url.origin, env.PUBLIC_HX_SANDBOX_ORIGIN)) return notFound();

	const doc = hxDocument(params.docId ?? '', dev);
	if (!doc) return notFound();

	const headers = hxDocumentHeaders(
		hxPortalOrigin(env.PUBLIC_HX_PORTAL_ORIGIN, env.PUBLIC_HX_SANDBOX_ORIGIN, url.origin)
	);

	if (request.method === 'HEAD') return new Response(null, { headers });

	const bytes = new TextEncoder().encode(doc.html);
	headers.set('content-length', String(bytes.byteLength));
	return new Response(bytes as unknown as BodyInit, { headers });
};

export const GET = handle;
export const HEAD = handle;

/**
 * NOTHING A DOCUMENT IS MAY BE WRITTEN TO. The parent owns every database write
 * and the document never writes; a POST here is answered the same way an
 * unknown document is. `form-action 'none'` in the CSP already refuses a form
 * submission from inside the frame, so this is the second, independent refusal.
 */
export const fallback: RequestHandler = async () => notFound();
