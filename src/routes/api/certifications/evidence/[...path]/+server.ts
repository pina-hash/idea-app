import {
	CERT_EVIDENCE_BUCKET,
	CERT_EVIDENCE_DOWNLOAD_TTL,
	EVIDENCE_PATH_RE,
	evidenceDownloadName
} from '$lib/server/certifications/evidence';
import type { RequestHandler } from './$types';

/**
 * ONE EVIDENCE FILE, AS A DOWNLOAD (ledger 0391). `GET /api/certifications/
 * evidence/<attempt>/<uuid>.<ext>?name=<shown name>` mints a signed download
 * URL on the CALLER'S OWN client, so the storage SELECT policy (the owner, or a
 * certifier of the attempt's certification, through `_cert_can_read_evidence`)
 * decides, and answers 302 to it. The link carries `download=<ascii name>`, so
 * the response is `Content-Disposition: attachment` on the Supabase origin and
 * a student's `.html` can never be navigated into as a page of ours. Every
 * refusal is the same bodyless 404.
 */
const NOT_FOUND = () => new Response(null, { status: 404, headers: { 'cache-control': 'private, no-store' } });

export const GET: RequestHandler = async ({ params, url, locals: { supabase, claims } }) => {
	if (!claims) return NOT_FOUND();
	const path = params.path ?? '';
	if (!EVIDENCE_PATH_RE.test(path)) return NOT_FOUND();

	const { data, error } = await supabase.storage
		.from(CERT_EVIDENCE_BUCKET)
		.createSignedUrl(path, CERT_EVIDENCE_DOWNLOAD_TTL, {
			download: evidenceDownloadName(path, url.searchParams.get('name'))
		});
	if (error || !data?.signedUrl) return NOT_FOUND();
	return new Response(null, {
		status: 302,
		headers: { location: data.signedUrl, 'cache-control': 'private, no-store' }
	});
};
