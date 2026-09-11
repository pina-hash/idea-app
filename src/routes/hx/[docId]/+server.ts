import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';
import { hxStoredDocument } from '$lib/server/html-assignment-document';
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
 * THE SANDBOX IS THE OTHER HALF AND IT IS SENT TWO WAYS, WHICH IS NOT
 * REDUNDANCY. The frame attribute is `HX_SANDBOX_FLAGS` -- scripts and popups,
 * with no `allow-same-origin` -- which is what puts a FRAMED document in an
 * opaque origin; the CSP carries the SAME flags as a `sandbox` DIRECTIVE, which is
 * what puts a DIRECTLY NAVIGATED one there too. 0126 shipped without the
 * directive and measured the gap: a student who types or pastes a `/hx/` URL
 * reached the real origin rather than an opaque one, and with
 * `PUBLIC_HX_SANDBOX_ORIGIN` unset -- production's configuration -- that real
 * origin is `ideabosco.com`, where the session cookies live and are readable
 * by `document.cookie`. The directive is built in `../_headers.ts` from
 * `HX_SANDBOX_FLAGS`, the same constant the attribute reads.
 *
 * WHAT THIS FILE ACTUALLY DECIDES IS THREE THINGS: whether the request arrived
 * on the origin this route answers on, whether a document may be served, and
 * what headers the bytes carry. The bytes themselves come from
 * `$lib/server/html-assignment-document`, which reads the row a teacher's
 * import wrote and re-checks every rule RLS would have enforced -- this host
 * holds no session, so nothing here can satisfy a policy and the check has to
 * be explicit. Read that module's header before changing what is served.
 *
 * THE DEV FIXTURES ARE CONSULTED FIRST, AND ONLY IN DEVELOPMENT, AND THE TWO
 * NAMESPACES PROVABLY CANNOT COLLIDE. `../_documents` holds `worksheet` and
 * `probe` -- the documents the browser-verify harness drives and the hostile
 * containment probe -- and their ids are deliberately NOT uuids, while
 * `document_id` is a uuid column that `hxStoredDocument` refuses anything else
 * for. So a fixture can never shadow a real document, and a real document can
 * never be reached by a fixture name.
 *
 * ORDER: FIXTURE, THEN DATABASE. The other order would work too and is
 * strictly slower for the case that matters locally -- the local `.env` names a
 * PLACEHOLDER Supabase project which cannot answer for anything, so putting the
 * database first means every harness page load waits for a lookup that is
 * guaranteed to miss. `dev` gates the whole branch rather than the `devOnly`
 * flag alone: a fixture served from a production host is exactly the "a
 * production surface that serves an attack document has to explain itself"
 * argument `../_documents` already makes about the probe, and it applies to the
 * benign fixture too.
 */

/**
 * ONE REFUSAL FOR EVERYTHING. An unparseable handle, an unknown document, an
 * UNPUBLISHED or scheduled-ahead one, a dev fixture asked for in production, a
 * deployment with no service key, a `/hx/` path on the wrong host and a method
 * that is not GET or HEAD are all indistinguishable from outside -- which is
 * what stops a document handle being probed for. `no-store` so a 404 for a
 * document that is about to be published is not cached into the next viewer's
 * browser.
 */
function notFound(): Response {
	return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
}

const handle: RequestHandler = async ({ params, url, request }) => {
	if (!hxOnServingHost(url.origin, env.PUBLIC_HX_SANDBOX_ORIGIN)) return notFound();

	const docId = params.docId ?? '';
	const fixture = dev ? hxDocument(docId, dev) : null;
	let html: string;
	if (fixture) {
		html = fixture.html;
	} else {
		const stored = await hxStoredDocument(docId);
		if (!stored.ok) return notFound();
		html = stored.html;
	}

	const headers = hxDocumentHeaders(
		hxPortalOrigin(env.PUBLIC_HX_PORTAL_ORIGIN, env.PUBLIC_HX_SANDBOX_ORIGIN, url.origin)
	);

	if (request.method === 'HEAD') return new Response(null, { headers });

	const bytes = new TextEncoder().encode(html);
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
