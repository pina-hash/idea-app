import { env } from '$env/dynamic/public';
import { hxDocumentEtag, hxIfNoneMatchHits } from '$lib/server/html-assignment-document';
import { hxDocumentHeaders, hxPortalOrigin } from '../../../hx/_headers';
import type { RequestHandler } from './$types';

/**
 * A LESSON'S BYTES, UNDER `/hx/`'S OWN HEADERS (ledger 0391, DECISIONS D3).
 *
 *   GET /certifications/lesson/<lesson id>
 *
 * `cert_lesson_document(p_id)` answers the document on the CALLER'S OWN client
 * (the certification must be published or retired, or the caller its
 * certifier), so no seventh reader of the service-role key is added for
 * lessons. The header set is `hxDocumentHeaders(hxPortalOrigin(...))`, the
 * identical pair of calls `/hx/[docId]` makes with the identical arguments:
 * the CSP's `sandbox` directive (built from `HX_SANDBOX_FLAGS`, never
 * retyped) puts a DIRECTLY NAVIGATED lesson in an opaque origin exactly as the
 * frame attribute puts a framed one there, and `allow-same-origin` never
 * joins the set. `hxOnServingHost` is deliberately NOT called: a lesson is
 * served from the portal's own origin whichever host `PUBLIC_HX_SANDBOX_ORIGIN`
 * names (D3 records the cost).
 *
 * ONE REFUSAL FOR EVERYTHING: no session, a handle that is not a uuid, a
 * lesson the function answers null for (unknown, or on a draft the caller
 * does not certify) and a method that is not GET or HEAD are the same
 * bodyless 404, `no-store`, so a lesson id cannot be probed for.
 *
 * The ETag folds the lesson id, its `updated_at` and the CSP, as `/hx/`'s
 * does, so a matching `If-None-Match` is a 304 and a changed flag set
 * revalidates every cached lesson once.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound(): Response {
	return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
}

interface LessonRow {
	id?: string;
	title?: string;
	document?: string;
	updated_at?: string | null;
	manifest?: unknown;
}

const handle: RequestHandler = async ({ params, url, request, locals }) => {
	if (!locals.claims) return notFound();
	const id = params.lessonId ?? '';
	if (!UUID_RE.test(id)) return notFound();

	const headers = hxDocumentHeaders(
		hxPortalOrigin(env.PUBLIC_HX_PORTAL_ORIGIN, env.PUBLIC_HX_SANDBOX_ORIGIN, url.origin)
	);
	const csp = headers.get('content-security-policy') ?? '';

	let row: LessonRow | null = null;
	try {
		const { data, error } = await locals.supabase.rpc('cert_lesson_document', { p_id: id });
		if (error || !data || typeof data !== 'object') return notFound();
		row = data as LessonRow;
	} catch {
		return notFound();
	}
	if (typeof row.document !== 'string') return notFound();

	const etag = hxDocumentEtag(id, row.updated_at ?? '', csp);
	headers.set('etag', etag);
	if (hxIfNoneMatchHits(request.headers.get('if-none-match'), etag)) {
		return new Response(null, { status: 304, headers });
	}
	if (request.method === 'HEAD') return new Response(null, { headers });

	const bytes = new TextEncoder().encode(row.document);
	headers.set('content-length', String(bytes.byteLength));
	return new Response(bytes as unknown as BodyInit, { headers });
};

export const GET = handle;
export const HEAD = handle;

/** Nothing a lesson is may be written to, which is `/hx/`'s own rule. */
export const fallback: RequestHandler = async () => notFound();
