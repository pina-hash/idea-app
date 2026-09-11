import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';
import fixture from '../../../html-assignment/fixtures/idea100-blade-01.ported.html?raw';
import { hxDocumentHeaders, hxPortalOrigin } from '../../../../hx/_headers';
import type { RequestHandler } from './$types';

/**
 * THE DOCUMENT THE INSTRUCTOR-COPY HARNESS FRAMES. Dev only: a bodyless 404 in
 * production, exactly as `/hx/` answers everything it refuses.
 *
 * ===========================================================================
 * WHY THIS EXISTS AND `/hx/worksheet` DOES NOT SERVE
 * ===========================================================================
 *
 * `/hx/` already serves two dev fixtures and the first instinct was to frame
 * one. MEASURED, `worksheet` CANNOT BE USED HERE: its block ids are
 * `mod-1.a.team`, `mod-1.b.reflection`, `mod-1.c.done` -- DOTTED, which
 * `^[A-Za-z0-9_-]{1,40}$` refuses, so `validateHtmlManifest` rejects that
 * document outright ("Module mod-1 block 1 needs an id"). The fixture predates
 * the charset rule and is written for the BRIDGE harness, which never
 * validates. A working-copy harness built on it would show a teacher a
 * worksheet recording answers under block ids
 * `classroom_save_instructor_response` would refuse -- a harness that lies in
 * the exact direction this surface exists to catch.
 *
 * SO THE FIXTURE IS THE REAL PORTED DOCUMENT: IDEA100 Blade CAD 01, the actual
 * export, 44 blocks, every id legal, its own bridge client, and `image` blocks
 * among the `text` and `longText` ones. It is imported with `?raw` and served
 * byte for byte -- the repository's own rule for carried-over HTML, and the
 * same promise ingest makes: a stored byte is served back unchanged.
 *
 * ===========================================================================
 * THE HEADERS ARE `/hx/`'s OWN, CALLED AND NOT COPIED
 * ===========================================================================
 *
 * `hxDocumentHeaders(hxPortalOrigin(...))` is the identical pair of calls the
 * real route makes, with the identical arguments, so the CSP -- including the
 * `sandbox` directive that is what puts a DIRECTLY NAVIGATED document in an
 * opaque origin -- is the shipping one rather than a second literal that could
 * drift. A harness missing a mechanism the real page has makes a passing drive
 * prove nothing, and the mechanism that matters most here is that the document
 * is genuinely sandboxed: an answer really does have to travel the bridge.
 *
 * WHAT IS HONESTLY WEAKER THAN PRODUCTION, said rather than hidden: this is not
 * the `/hx/` handler, so it does not exercise the host gate, the uuid refusal,
 * the publication check or the service-role read. Those are that route's and
 * are measured against it; what is measured HERE is the surface around the
 * frame.
 */

function notFound(): Response {
	return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
}

const handle: RequestHandler = async ({ url, request }) => {
	if (!dev) return notFound();

	const headers = hxDocumentHeaders(
		hxPortalOrigin(env.PUBLIC_HX_PORTAL_ORIGIN, env.PUBLIC_HX_SANDBOX_ORIGIN, url.origin)
	);
	if (request.method === 'HEAD') return new Response(null, { headers });

	const bytes = new TextEncoder().encode(fixture);
	headers.set('content-length', String(bytes.byteLength));
	return new Response(bytes as unknown as BodyInit, { headers });
};

export const GET = handle;
export const HEAD = handle;

/** Nothing a document is may be written to, which is `/hx/`'s own rule. */
export const fallback: RequestHandler = async () => notFound();
