import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';
import {
	hxDocumentEtag,
	hxIfNoneMatchHits,
	hxStoredDocumentHead
} from '$lib/server/html-assignment-document';
import { extractManifestScript } from '$lib/classroom/html-assignment/manifest';
import {
	HX_THUMB_SHELL_VERSION,
	manifestThumbnail,
	servedThumbnailTemplate,
	thumbnailDocument
} from '$lib/classroom/html-assignment/thumbnail';
import { hxDocument } from '../../_documents';
import { hxDocumentHeaders, hxOnServingHost, hxPortalOrigin } from '../../_headers';
import type { RequestHandler } from './$types';

/**
 * AN HTML ASSIGNMENT'S LIVE THUMBNAIL (ledger 0396, report a6a037f3).
 *
 *   GET /hx/<doc id>/thumbnail   the document's `<template>` named by its
 *                                manifest's `thumbnail`, inside a fixed shell
 *
 * IT IS THE WORKSHEET ROUTE'S TWIN AND DECIDES NOTHING ON ITS OWN. The host
 * gate (`hxOnServingHost`), the access decision (`hxStoredDocumentHead`: the
 * row exists, the item is a published, live assignment, re-checked on every
 * request because this host holds no session), the version cache and its ETag,
 * and THE WHOLE HEADER SET (`hxDocumentHeaders`, so the CSP's `sandbox`
 * directive and every other line are byte-identical to the worksheet's) are
 * the worksheet route's own, called rather than copied. A draft or a scheduled
 * assignment is the same bodyless 404 the worksheet answers, so the class page
 * shows the generated identity for it until it goes live.
 *
 * WHAT IS SERVED. The author's template contents, extracted byte for byte
 * (`servedThumbnailTemplate`), placed in `thumbnailDocument`'s fixed shell:
 * our charset, our shim (the bridge's thumbnail half) and nothing else of ours.
 * The template's bytes are never rewritten, and `allow-same-origin` is never
 * granted: the frame attribute and the CSP directive both read
 * `HX_SANDBOX_FLAGS`. The manifest that names the template is read from the
 * same bytes (the document's own `idea-manifest` script), which is what
 * executes, rather than from a second copy of it.
 *
 * Every refusal is the worksheet route's: one bodyless 404, `no-store`.
 */

function notFound(): Response {
	return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
}

/** The whole thumbnail document for a worksheet's own bytes, or null when it declares none it carries. */
export function _thumbnailFor(html: string): string | null {
	const found = extractManifestScript(html);
	if (found.count !== 1 || found.json === null) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(found.json);
	} catch {
		return null;
	}
	const declared = manifestThumbnail(parsed);
	if (!declared || declared.source !== 'html') return null;
	const template = servedThumbnailTemplate(html, declared.template);
	if (template === null) return null;
	return thumbnailDocument(template, { interactive: declared.interactive });
}

const handle: RequestHandler = async ({ params, url, request }) => {
	if (!hxOnServingHost(url.origin, env.PUBLIC_HX_SANDBOX_ORIGIN)) return notFound();

	const headers = hxDocumentHeaders(
		hxPortalOrigin(env.PUBLIC_HX_PORTAL_ORIGIN, env.PUBLIC_HX_SANDBOX_ORIGIN, url.origin)
	);
	// The tag folds the shell's version as well as the policy, so a change to
	// the shim reaches every browser holding an old copy once.
	const etagSalt = `${headers.get('content-security-policy') ?? ''}\nthumbnail ${HX_THUMB_SHELL_VERSION}`;

	const docId = params.docId ?? '';
	const fixture = dev ? hxDocument(docId, dev) : null;
	let source: string;
	if (fixture) {
		source = fixture.html;
	} else {
		const ifNoneMatch = request.headers.get('if-none-match');
		const head = await hxStoredDocumentHead(docId, {
			prefetch: request.method === 'GET' && !ifNoneMatch
		});
		if (!head.ok) return notFound();
		const etag = hxDocumentEtag(docId, head.version, etagSalt);
		if (hxIfNoneMatchHits(ifNoneMatch, etag)) {
			headers.set('etag', etag);
			return new Response(null, { status: 304, headers });
		}
		const got = await head.bytes();
		if (!got) return notFound();
		source = got.html;
		headers.set('etag', hxDocumentEtag(docId, got.version, etagSalt));
	}

	const html = _thumbnailFor(source);
	if (html === null) return notFound();
	if (request.method === 'HEAD') return new Response(null, { headers });

	const bytes = new TextEncoder().encode(html);
	headers.set('content-length', String(bytes.byteLength));
	return new Response(bytes as unknown as BodyInit, { headers });
};

export const GET = handle;
export const HEAD = handle;

/** Nothing a thumbnail is may be written to, the worksheet route's rule. */
export const fallback: RequestHandler = async () => notFound();
