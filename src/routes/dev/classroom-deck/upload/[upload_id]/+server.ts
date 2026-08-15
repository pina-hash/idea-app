import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import {
	devUploadCancel,
	devUploadChunk,
	devUploadFinalized,
	devUploadSession,
	devUploadTakeFinalFailure
} from '$lib/server/dev-deck-fixture';
import type { RequestHandler } from './$types';

/**
 * Dev harness only (404 in production): Google's resumable upload protocol, as
 * much of it as the client uploader actually speaks.
 *
 *   PUT  Content-Range: bytes START-END/TOTAL   -> 308 + Range, or 200 + {id,size}
 *   PUT  Content-Range: bytes STAR/TOTAL, empty -> the status query
 *   DELETE                                      -> discard the session
 *
 * It exists so the harness exercises the SHIPPING uploader -- its chunking, its
 * progress arithmetic, its resume-after-failure and its cancel -- rather than a
 * mock that would agree with whatever the uploader happened to do. Two things
 * it holds itself to, because the uploader is judged against them:
 *
 *   * THE STATUS QUERY ANSWERS HONESTLY. It reports the contiguous bytes the
 *     session actually holds, so "resume from Drive's own count" is a real
 *     recovery here and not a formality. (It used to answer a fixed
 *     `bytes=0-0`, which no resume could have been measured against.)
 *   * FINALIZE REPORTS THE STORED SIZE, as `fields=id,size` makes Drive do, so
 *     the uploader's confirm step has the same number to check against.
 *
 * THREE FAULT INJECTORS, for the failures a well-behaved same-origin stand-in
 * can never produce and which are exactly the ones a real upload dies of:
 *
 *   ?status=NNN    answer a chunk with a status the protocol does not use
 *   ?noRange=1     answer 308 with NO `Range` header -- what a cross-origin
 *                  Google response looks like when CORS does not expose it
 * and the session itself carries a third, set when it is opened: refuse the
 * FINAL chunk N times before accepting it, either with a readable 503 or by
 * abandoning the send. That pair is this session's reason for existing -- it
 * reproduces the live report (progress reaches 100%, the finalizing PUT fails)
 * and is the only way to drive the recovery path, ask Drive where it got to and
 * resume from that answer, without a real Drive.
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

export const PUT: RequestHandler = async ({ params, request, url }) => {
	if (!dev) error(404, 'Not found');

	const id = params.upload_id;
	const session = devUploadSession(id);
	if (!session) return new Response('Not found', { status: 404 });

	const forcedStatus = Number(url.searchParams.get('status') ?? 0);
	if (forcedStatus >= 400) {
		// The body is DRAINED first, deliberately. A server that answers before
		// reading the request body makes the browser abandon the send, and the
		// status never becomes readable at all -- which surfaces as
		// `chunk_network` rather than `chunk_status`. That is a real and
		// separate failure (and the shape of the live report), so this injector
		// produces the one it says it does and ?failLast produces the other.
		await request.arrayBuffer();
		return new Response('Injected upload failure.', { status: forcedStatus });
	}
	const hideRange = url.searchParams.get('noRange') === '1';

	const rangeHeader = request.headers.get('content-range');

	// The status query: how much do you have?
	if (isStatusQuery(rangeHeader)) {
		const finalized = devUploadFinalized(id);
		if (finalized) {
			return new Response(JSON.stringify(finalized), {
				headers: { 'content-type': 'application/json' }
			});
		}
		// Google omits Range entirely when it holds nothing, which is also what
		// a blocked CORS exposure looks like -- the uploader treats both the
		// same way on purpose.
		const headers: Record<string, string> =
			hideRange || session.held === 0 ? {} : { range: `bytes=0-${session.held - 1}` };
		return new Response(null, { status: 308, headers });
	}

	const range = parseRange(rangeHeader);
	if (!range) return new Response('Bad Content-Range', { status: 400 });

	// The final chunk, refused. Draining the body first decides what the browser
	// can see -- see `failLastDrain` in the fixture: a reset that Chrome can
	// transparently retry is invisible to the page, so the recoverable flavour
	// answers with a readable status and the unrecoverable one does not.
	if (range.end + 1 >= range.total) {
		const injected = devUploadTakeFinalFailure(id);
		if (injected) {
			if (injected.drain) await request.arrayBuffer();
			return new Response(injected.drain ? 'Injected final-chunk failure.' : null, { status: 503 });
		}
	}

	// A NOTE THIS HARNESS HAD TO LEARN: SvelteKit's own node adapter drops a
	// request body outright when the request carries no Content-Type
	// (`get_raw_body` returns null before it looks at anything else). So a
	// header-less chunk PUT arrives here with `request.body === null` and every
	// byte silently missing -- which is both why this stand-in needs the
	// uploader to send a Content-Type, and a reminder that "no Content-Type"
	// is not automatically the safer choice on a real network path.
	const bytes = new Uint8Array(await request.arrayBuffer());
	const received = devUploadChunk(id, range.start, bytes);
	if (received === null) return new Response('Not found', { status: 404 });

	const finalized = devUploadFinalized(id);
	if (finalized) {
		return new Response(JSON.stringify(finalized), {
			headers: { 'content-type': 'application/json' }
		});
	}
	return new Response(null, {
		status: 308,
		headers: hideRange || received === 0 ? {} : { range: `bytes=0-${received - 1}` }
	});
};

/** Cancel: Google discards the session, and so does this. */
export const DELETE: RequestHandler = async ({ params }) => {
	if (!dev) error(404, 'Not found');
	devUploadCancel(params.upload_id);
	return new Response(null, { status: 204 });
};
