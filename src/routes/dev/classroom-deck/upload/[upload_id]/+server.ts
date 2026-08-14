import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { devUploadCancel, devUploadChunk, devUploadSession } from '$lib/server/dev-deck-fixture';
import type { RequestHandler } from './$types';

/**
 * Dev harness only (404 in production): Google's resumable upload protocol, as
 * much of it as the client uploader actually speaks.
 *
 *   PUT  Content-Range: bytes START-END/TOTAL   -> 308 + Range, or 200 + {id}
 *   PUT  Content-Range: bytes STAR/TOTAL, empty -> the status query
 *   DELETE                                      -> discard the session
 *
 * It exists so the harness exercises the SHIPPING uploader -- its chunking, its
 * progress arithmetic, its resume-after-failure and its cancel -- rather than a
 * mock that would agree with whatever the uploader happened to do.
 */

function parseRange(header: string | null): { start: number; end: number; total: number } | null {
	if (!header) return null;
	const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(header.trim());
	if (!m) return null;
	return { start: Number(m[1]), end: Number(m[2]), total: Number(m[3]) };
}

function isStatusQuery(header: string | null): boolean {
	return !!header && /^bytes \*\/\d+$/.test(header.trim());
}

export const PUT: RequestHandler = async ({ params, request }) => {
	if (!dev) error(404, 'Not found');

	const id = params.upload_id;
	const session = devUploadSession(id);
	if (!session) return new Response('Not found', { status: 404 });

	const rangeHeader = request.headers.get('content-range');

	// The status query: how much do you have?
	if (isStatusQuery(rangeHeader)) {
		if (session.fileId) {
			return new Response(JSON.stringify({ id: session.fileId }), {
				headers: { 'content-type': 'application/json' }
			});
		}
		return new Response(null, { status: 308, headers: { range: 'bytes=0-0' } });
	}

	const range = parseRange(rangeHeader);
	if (!range) return new Response('Bad Content-Range', { status: 400 });

	const bytes = new Uint8Array(await request.arrayBuffer());
	const received = devUploadChunk(id, range.start, bytes);
	if (received === null) return new Response('Not found', { status: 404 });

	if (received >= range.total) {
		return new Response(JSON.stringify({ id: devUploadSession(id)?.fileId ?? null }), {
			headers: { 'content-type': 'application/json' }
		});
	}
	return new Response(null, {
		status: 308,
		headers: { range: `bytes=0-${received - 1}` }
	});
};

/** Cancel: Google discards the session, and so does this. */
export const DELETE: RequestHandler = async ({ params }) => {
	if (!dev) error(404, 'Not found');
	devUploadCancel(params.upload_id);
	return new Response(null, { status: 204 });
};
