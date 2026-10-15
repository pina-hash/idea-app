import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';
import { hxDocumentHeaders, hxPortalOrigin } from '../../../../hx/_headers';
import type { RequestHandler } from './$types';

/**
 * THE HARNESS'S LESSON DOCUMENT (ledger 0391). The real `LessonFrame` points at
 * `/certifications/lesson/<id>`, which reads `cert_lesson_document` as the
 * caller and 404s with no session, so on `/dev/cert-certification` every
 * stacked kit's lesson frame drew an empty box and logged a 404 (28 console
 * errors across the seven states). This dev-only route serves one small
 * lesson under the SAME headers the real route sends (`hxDocumentHeaders`,
 * the classroom's sandbox and CSP), so what the harness measures is the frame
 * the student gets, pointed at bytes it can load. 404 in production.
 */
const LESSON = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Reading the mill</title>
<style>
	body { margin: 0; padding: 1.25rem; font: 16px/1.5 system-ui, sans-serif; color: #0d1311; background: #fdfdfb; }
	h1 { font-size: 1.35rem; margin: 0 0 0.75rem; }
	ol { padding-left: 1.25rem; }
	.callout { border-left: 4px solid #3b6c36; padding: 0.5rem 0.75rem; background: #eef3ee; margin: 1rem 0; }
</style>
</head>
<body>
<h1>Reading the mill before you touch it</h1>
<p>Before any cut, walk the machine once with the spindle off. Every lesson in this kit is read, not typed: there is nothing to save on this page.</p>
<ol>
	<li>Find the emergency stop and the spindle brake.</li>
	<li>Check the vise is square to the table and the parallels are seated.</li>
	<li>Read the speeds and feeds card for the material in the vise.</li>
	<li>Confirm the tool in the spindle is the tool on the setup sheet.</li>
</ol>
<div class="callout">A certifier will ask you to point at each of these during the checkout. Know where they are without looking.</div>
<p>When you have read this page, press Mark lesson complete under it.</p>
</body>
</html>`;

const handle: RequestHandler = async ({ url, request }) => {
	if (!dev) return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
	const headers = hxDocumentHeaders(
		hxPortalOrigin(env.PUBLIC_HX_PORTAL_ORIGIN, env.PUBLIC_HX_SANDBOX_ORIGIN, url.origin)
	);
	headers.set('cache-control', 'no-store');
	if (request.method === 'HEAD') return new Response(null, { headers });
	const bytes = new TextEncoder().encode(LESSON);
	headers.set('content-length', String(bytes.byteLength));
	return new Response(bytes as unknown as BodyInit, { headers });
};

export const GET = handle;
export const HEAD = handle;
