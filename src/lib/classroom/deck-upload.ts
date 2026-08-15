/**
 * The browser half of a direct-to-Drive deck upload (0102).
 *
 * WHY THE BYTES GO STRAIGHT TO GOOGLE. A serverless request body is capped at
 * ~4.5 MB on Vercel and a real Claude Design export is tens of megabytes, so
 * posting the zip through our own server failed at the platform before any of
 * our code ran. The server opens a Google RESUMABLE UPLOAD SESSION and hands
 * back its URI; this module fills it; the server is then told only the file id
 * that came out.
 *
 * WHAT THIS MODULE IS TRUSTED WITH is therefore nothing: the session URI can
 * only write bytes into the one file the server already decided to create, in
 * the folder the server chose, under the name the server set. It is not an
 * access token and it authorizes no other Drive call. (See
 * $lib/server/notebook-drive.ts for the full statement, including the one thing
 * we cannot control -- Google sets the URI's lifetime, not us.)
 *
 * CHUNKED, because the two things this has to survive are a school wifi drop
 * and a student closing the lid. Chunks give a progress bar something honest to
 * report, bound how much is re-sent after a failure, and are the only form in
 * which Google's resume protocol is usable at all.
 *
 * XHR RATHER THAN FETCH, for exactly one reason: `fetch` in a browser cannot
 * report UPLOAD progress. Everything that does not need progress (the status
 * query, the cancel) uses fetch.
 *
 * ------------------------------------------------------------------------
 * THE FINAL CHUNK IS NOT LIKE THE OTHERS, and a live 43 MB upload that reached
 * 100% and then failed `chunk_network` is why this file says so twice.
 *
 * Every earlier chunk is answered 308 and changes nothing about the file. The
 * last one FINALIZES it: Drive reconciles the bytes against the session's
 * declared length and content type, commits the object, and answers 200 with
 * metadata. So it is the only request where a header that merely disagreed with
 * the session has anything to disagree ABOUT, and the only one whose failure
 * can mean "the file may in fact exist and the browser could not see the
 * answer". Three consequences run through the code below:
 *
 *   1. A CHUNK PUT SENDS EXACTLY TWO HEADERS: `Content-Range`, and a
 *      `Content-Type` THAT IS THE SESSION'S OWN -- threaded down from the same
 *      server call that set `X-Upload-Content-Type`, never taken from the
 *      File. That distinction is the fix. The browser's guess for a .zip on
 *      Windows Chrome is routinely `application/x-zip-compressed`, so the old
 *      `file.type || 'application/zip'` could contradict the session at exactly
 *      the moment Drive commits the file -- while omitting the header
 *      altogether, which Google's chunked example does, turns out to be its own
 *      hazard: SvelteKit's own node adapter DROPS a request body when there is
 *      no Content-Type (`get_raw_body`, verified against the installed copy),
 *      and a school network's filtering proxy is exactly the sort of
 *      intermediary that may do the same to a body it cannot type. Sending the
 *      session's own value cannot disagree with the session and leaves the
 *      request self-describing to everything in between. There is deliberately
 *      NO `Authorization`: the session URI IS the credential, and an unexpected
 *      bearer token on a pre-authorized PUT is a rejection candidate rather
 *      than a belt-and-braces. chunkRequestHeaders is the one place headers are
 *      built, and it is asserted by test.
 *   2. EVERY FAILURE ASKS DRIVE WHERE IT GOT TO, before deciding anything. On
 *      the last chunk that single question separates "it never landed" from
 *      "it landed, finalized, and CORS hid the 200" -- which are the same
 *      symptom from a browser and opposite outcomes.
 *   3. SUCCESS IS CONFIRMED, NOT INFERRED. The session is opened with
 *      `fields=id,size`, so Drive's own finalize response states the stored
 *      length; a file whose stored size is not the length we set out to upload
 *      is a failure with numbers in it, never a deck that ingests into
 *      nonsense. The server re-checks the same figure against Drive metadata at
 *      ingest, where the credentials are real and CORS does not apply.
 *
 * ------------------------------------------------------------------------
 * EVERY FAILURE IS NAMED. A cross-origin upload has several failure modes that
 * all LOOK like "the connection dropped" from the outside -- an unexpected
 * status on the last chunk, a response whose headers CORS will not let us read,
 * a request that never answered, one that timed out -- and telling them apart
 * from a browser, with no server logs, is the difference between diagnosing a
 * real deployment and guessing at it. So each throws a DeckUploadError carrying
 * a `code`, the chunk's own numbers, and Drive's last known received offset,
 * and each is logged to the console under one prefix.
 */

/** A multiple of 256 KiB, as Google's resumable protocol requires. */
export const CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_CHUNK_ATTEMPTS = 5;

/**
 * How long one chunk may take before it is called hung.
 *
 * Generous rather than tight: 8 MiB on a bad school connection is genuinely
 * minutes, and cutting a slow-but-working upload short would be worse than the
 * hang. What this bounds is the case with no bound at all -- a request that
 * never settles either way, which without it leaves the progress bar frozen
 * forever with nothing to report. Retrying is cheap, since the protocol resumes.
 */
const CHUNK_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * The failure taxonomy, as it reaches the uploader.
 *
 *   cancelled          the uploader stopped it; not a failure to explain
 *   bad_chunk          the chunk arithmetic produced something the protocol
 *                      does not allow (a zero-length or out-of-range slice).
 *                      A bug in here, caught before it reaches Google
 *   size_mismatch      the file, the length the session was opened for, and
 *                      the length Drive says it stored do not all agree
 *   chunk_status       a chunk PUT answered with a status the protocol does not
 *                      use -- 4xx/5xx from Google, or an unexpected 2xx
 *   chunk_network      the request never completed: connection dropped, or the
 *                      CORS preflight was refused. Indistinguishable from the
 *                      browser (status is 0 either way), and SAID to be, rather
 *                      than reported as one of the two
 *   chunk_timeout      the request itself timed out
 *   headers_blocked    Google answered, but the response's headers are not
 *                      readable cross-origin -- the resume protocol's `Range`
 *                      is how progress is confirmed, so this degrades the
 *                      upload even when it does not fail it
 *   no_file_id         the upload completed and Drive returned no id
 *   not_confirmed      every byte was sent and Drive never confirmed the file
 *   session_refused    the server would not authorize the upload at all
 */
export type DeckUploadCode =
	| 'cancelled'
	| 'bad_chunk'
	| 'size_mismatch'
	| 'chunk_status'
	| 'chunk_network'
	| 'chunk_timeout'
	| 'headers_blocked'
	| 'no_file_id'
	| 'not_confirmed'
	| 'session_refused';

export class DeckUploadError extends Error {
	readonly code: DeckUploadCode;
	readonly detail: Record<string, unknown>;

	constructor(code: DeckUploadCode, message: string, detail: Record<string, unknown> = {}) {
		super(message);
		this.name = 'DeckUploadError';
		this.code = code;
		this.detail = detail;
	}
}

export class DeckUploadCancelled extends DeckUploadError {
	constructor() {
		super('cancelled', 'Upload cancelled.');
		this.name = 'DeckUploadCancelled';
	}
}

/**
 * One line per failure, in the console, with the numbers. Kept here rather than
 * left to the caller so nothing that throws from this module can be swallowed
 * silently on the way up.
 */
export function logDeckUpload(where: string, detail: Record<string, unknown>): void {
	// eslint-disable-next-line no-console
	console.error(`[deck upload] ${where}`, detail);
}

export interface DeckUploadProgress {
	loaded: number;
	total: number;
}

// ---------------------------------------------------------------------------
// Chunk arithmetic and header construction -- pure, exported, and tested.
//
// Split out of the transfer loop deliberately: the last chunk's Content-Range
// is the one line of this module a live failure pointed at, and an off-by-one
// in it is not something a browser test can find after the fact. Everything
// below is a pure function of (total, offset), so the boundary cases -- an
// exact multiple of the chunk size, one byte over it, a file smaller than one
// chunk -- are arithmetic that can simply be asserted.
// ---------------------------------------------------------------------------

export interface DeckChunk {
	/** 0-based position in the sequence of PUTs this run has made. */
	index: number;
	/** First byte, inclusive. */
	start: number;
	/** One past the last byte -- what Blob.slice takes. */
	endExclusive: number;
	/** Last byte, INCLUSIVE -- what Content-Range takes. The off-by-one lives here. */
	endInclusive: number;
	length: number;
	/** True only when this chunk carries the file's final byte. */
	isLast: boolean;
}

/**
 * The chunk that starts at `sent`, or null when there is nothing left.
 *
 * Offset-driven rather than index-driven because a resumed upload continues
 * from whatever offset DRIVE reports, which need not be a multiple of the chunk
 * size. `index` is therefore how many PUTs this run has made, not a position in
 * a fixed plan -- which is the number worth reporting in a failure.
 */
export function nextChunk(
	sent: number,
	total: number,
	index = 0,
	chunkBytes: number = CHUNK_BYTES
): DeckChunk | null {
	if (!Number.isInteger(total) || total <= 0) {
		throw new DeckUploadError('bad_chunk', 'The upload has no length to send.', { total });
	}
	if (!Number.isInteger(sent) || sent < 0 || sent > total) {
		throw new DeckUploadError('bad_chunk', 'The upload offset is outside the file.', {
			sent,
			total
		});
	}
	if (sent >= total) return null;
	const endExclusive = Math.min(sent + chunkBytes, total);
	return {
		index,
		start: sent,
		endExclusive,
		endInclusive: endExclusive - 1,
		length: endExclusive - sent,
		isLast: endExclusive === total
	};
}

/** Every chunk of an unimpeded upload, for tests and for reporting a plan size. */
export function planChunks(total: number, chunkBytes: number = CHUNK_BYTES): DeckChunk[] {
	const out: DeckChunk[] = [];
	let sent = 0;
	while (sent < total) {
		const chunk = nextChunk(sent, total, out.length, chunkBytes);
		if (!chunk) break;
		out.push(chunk);
		sent = chunk.endExclusive;
	}
	return out;
}

/**
 * `Content-Range: bytes START-END/TOTAL`, with END inclusive and TOTAL the whole
 * file -- which is what the final chunk carries and what makes Drive finalize.
 *
 * It VALIDATES rather than formats, because every way this can be wrong is
 * silent: a zero-length slice yields `bytes 5-4/10`, an end past the total
 * claims bytes that do not exist, and either is rejected by Drive with a status
 * the browser may not even get to read.
 */
export function chunkContentRange(chunk: DeckChunk, total: number): string {
	if (chunk.length <= 0) {
		throw new DeckUploadError('bad_chunk', 'A zero-length chunk cannot be uploaded.', {
			start: chunk.start,
			endExclusive: chunk.endExclusive,
			total
		});
	}
	if (chunk.start < 0 || chunk.endExclusive > total || chunk.endInclusive < chunk.start) {
		throw new DeckUploadError('bad_chunk', 'The chunk range is outside the file.', {
			start: chunk.start,
			endInclusive: chunk.endInclusive,
			total
		});
	}
	if (chunk.isLast !== (chunk.endExclusive === total)) {
		throw new DeckUploadError('bad_chunk', 'The chunk disagrees about being the last one.', {
			isLast: chunk.isLast,
			endExclusive: chunk.endExclusive,
			total
		});
	}
	return `bytes ${chunk.start}-${chunk.endInclusive}/${total}`;
}

/** `bytes STAR/TOTAL`: the body-less "how much do you have?" query. */
export function statusContentRange(total: number): string {
	if (!Number.isInteger(total) || total <= 0) {
		throw new DeckUploadError('bad_chunk', 'The upload has no length to query.', { total });
	}
	return `bytes */${total}`;
}

/**
 * THE COMPLETE HEADER SET OF A CHUNK PUT. Two headers, deliberately.
 *
 * Kept as a function with nothing else in it so "what does this request send"
 * has one answer, testable without a browser -- the live failure was a
 * final-chunk rejection with an unreadable status, and a header that disagreed
 * with the session is one of the few things that can produce that while every
 * earlier chunk succeeds.
 *
 * `contentType` MUST be the type the upload session was opened with (see the
 * module header). It is a parameter rather than a constant precisely so it can
 * be threaded from that one server-side decision instead of guessed at here;
 * a caller that has nothing to thread has not opened a session.
 *
 * `Content-Length` is set by the browser from the body and cannot be set here
 * (it is a forbidden header name); that is the only other header on the wire.
 */
export function chunkRequestHeaders(
	chunk: DeckChunk,
	total: number,
	contentType: string
): Record<string, string> {
	if (!contentType) {
		throw new DeckUploadError('bad_chunk', 'The upload session declared no content type.', {
			total
		});
	}
	return { 'content-range': chunkContentRange(chunk, total), 'content-type': contentType };
}

/** The status query's headers. Also exactly one, and no body. */
export function statusRequestHeaders(total: number): Record<string, string> {
	return { 'content-range': statusContentRange(total) };
}

/**
 * How many bytes Drive says it holds, from a 308's `Range: bytes=0-N`.
 *
 * Returns null when there is nothing to read -- which is BOTH "Drive received
 * nothing" (it omits the header in that case) and "CORS did not expose it".
 * Those are not distinguishable here, so this reports neither and the caller
 * decides; see the `rangeUnreadable` handling.
 */
export function parseReceived(rangeHeader: string | null | undefined): number | null {
	if (!rangeHeader) return null;
	const m = /bytes\s*=\s*0-(\d+)/i.exec(rangeHeader);
	if (!m) return null;
	const end = Number(m[1]);
	return Number.isFinite(end) ? end + 1 : null;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

interface ChunkResult {
	/** Set once Google reports the whole file received. */
	fileId?: string;
	/** The stored length Drive reports on finalize (`fields=id,size`), if given. */
	storedSize?: number | null;
	/** How many bytes Google says it now holds. */
	received: number;
	/** True when a 308 arrived with no readable `Range` (see headers_blocked). */
	rangeUnreadable?: boolean;
}

/**
 * The two calls this module makes to Google, behind an interface.
 *
 * A TEST SEAM, and only that: the default implementation is the XHR/fetch pair
 * below and is what every caller uses. It exists because the behaviour worth
 * pinning -- resuming from Drive's own received count after a chunk fails -- is
 * a conversation, not a calculation, and node has no XMLHttpRequest to have it
 * with. (The `allowPrivateHosts` seam in $lib/server/link-preview.ts is the
 * same idea.)
 */
export interface DeckUploadTransport {
	putChunk(opts: {
		uploadUrl: string;
		blob: Blob;
		chunk: DeckChunk;
		total: number;
		/** The session's own content type; see chunkRequestHeaders. */
		contentType: string;
		signal?: AbortSignal;
		onProgress?: (loaded: number) => void;
	}): Promise<ChunkResult>;
	queryStatus(opts: { uploadUrl: string; total: number; signal?: AbortSignal }): Promise<ChunkResult>;
	/** Best-effort: tell Google to throw an abandoned session away. */
	discard(uploadUrl: string): void;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			signal?.removeEventListener('abort', onAbort);
			resolve();
		}, ms);
		function onAbort() {
			clearTimeout(timer);
			reject(new DeckUploadCancelled());
		}
		if (signal?.aborted) return onAbort();
		signal?.addEventListener('abort', onAbort, { once: true });
	});
}

/**
 * Google answers a completed resumable upload with the file's metadata. The id
 * and the STORED SIZE are what we want -- the size because the session is
 * opened with `fields=id,size` precisely so the browser can confirm the upload
 * finalized at the length it set out to send, rather than infer success from
 * having reached the end of its own loop. A body we cannot parse is a real
 * failure: silently reporting success with no id would leave the server unable
 * to ingest anything.
 */
function finalizedFrom(
	text: string,
	status: number
): { fileId: string; storedSize: number | null } {
	try {
		const body = JSON.parse(text) as { id?: string; size?: string | number };
		if (body.id) {
			const raw = body.size;
			const size = raw === undefined || raw === null ? NaN : Number(raw);
			return { fileId: body.id, storedSize: Number.isFinite(size) ? size : null };
		}
	} catch {
		/* fall through */
	}
	throw new DeckUploadError(
		'no_file_id',
		'The upload finished but Drive did not return a file id.',
		{ status, bodyLength: text.length, bodySample: text.slice(0, 120) }
	);
}

const xhrTransport: DeckUploadTransport = {
	/**
	 * How much of the file Google actually holds.
	 *
	 * A `Content-Range: bytes STAR/total` with no body asks Google where it got
	 * to; the answer's `Range` header is the resume point, and a 200/201 instead
	 * means the file already finalized -- which is the reading that matters after
	 * a failed FINAL chunk, where "it never landed" and "it landed and CORS hid
	 * the answer" look identical from here.
	 *
	 * THE HEADER MAY NOT BE READABLE, and the fallback is the point of this
	 * function's shape: a cross-origin response only exposes headers the server
	 * allows, so if `Range` does not come through we report it as unreadable and
	 * the caller falls back to its own bookkeeping. Re-sending a chunk Google
	 * already has is harmless -- the protocol is idempotent per range -- so an
	 * unreadable header costs bandwidth, never correctness. It is REPORTED,
	 * though: it is the difference between "the network failed" and "we cannot
	 * see the answer", which no other symptom distinguishes.
	 */
	async queryStatus({ uploadUrl, total, signal }): Promise<ChunkResult> {
		const res = await fetch(uploadUrl, {
			method: 'PUT',
			headers: statusRequestHeaders(total),
			signal
		});
		if (res.status === 200 || res.status === 201) {
			const { fileId, storedSize } = finalizedFrom(await res.text(), res.status);
			return { fileId, storedSize, received: total };
		}
		if (res.status !== 308) {
			throw new DeckUploadError('chunk_status', `Drive rejected the upload (${res.status}).`, {
				status: res.status,
				phase: 'resume-probe'
			});
		}
		const received = parseReceived(res.headers.get('range'));
		if (received === null) return { received: 0, rangeUnreadable: true };
		return { received };
	},

	/** One chunk, with upload progress. Resolves on 200/201/308, rejects otherwise. */
	putChunk({ uploadUrl, blob, chunk, total, contentType, signal, onProgress }): Promise<ChunkResult> {
		// Built (and validated) BEFORE the request exists, so a degenerate range
		// throws bad_chunk here instead of becoming an unreadable rejection there.
		const headers = chunkRequestHeaders(chunk, total, contentType);
		if (blob.size !== chunk.length) {
			return Promise.reject(
				new DeckUploadError('bad_chunk', 'The chunk body does not match its declared range.', {
					blobBytes: blob.size,
					chunkBytes: chunk.length,
					range: headers['content-range']
				})
			);
		}
		const range = headers['content-range'];
		const isLast = chunk.isLast;

		return new Promise<ChunkResult>((resolve, reject) => {
			const xhr = new XMLHttpRequest();

			function onAbort() {
				xhr.abort();
				reject(new DeckUploadCancelled());
			}
			if (signal?.aborted) return onAbort();
			signal?.addEventListener('abort', onAbort, { once: true });

			function done() {
				signal?.removeEventListener('abort', onAbort);
			}

			xhr.open('PUT', uploadUrl, true);
			xhr.timeout = CHUNK_TIMEOUT_MS;
			// TWO headers, and no Authorization. See chunkRequestHeaders. Setting
			// Content-Type explicitly also overrides what XHR would otherwise take
			// from the Blob -- which for a slice is empty, and for the whole File
			// would be the browser's own guess.
			for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
			xhr.upload.onprogress = (e) => {
				if (e.lengthComputable) onProgress?.(e.loaded);
			};
			xhr.onerror = () => {
				done();
				// status 0 with no response is what BOTH a dropped connection and a
				// refused CORS preflight look like from here; saying so beats
				// picking one and being wrong half the time.
				reject(
					new DeckUploadError(
						'chunk_network',
						isLast
							? 'The last chunk was sent but Drive never answered (connection dropped, or the response was blocked by CORS).'
							: 'The connection dropped during the upload.',
						{ range, isLast, status: xhr.status, readyState: xhr.readyState }
					)
				);
			};
			xhr.ontimeout = () => {
				done();
				reject(new DeckUploadError('chunk_timeout', 'The upload timed out.', { range, isLast }));
			};
			xhr.onload = () => {
				done();
				if (xhr.status === 200 || xhr.status === 201) {
					try {
						const { fileId, storedSize } = finalizedFrom(xhr.responseText, xhr.status);
						resolve({ fileId, storedSize, received: total });
					} catch (e) {
						reject(e as Error);
					}
					return;
				}
				if (xhr.status === 308) {
					// The Range header is the authority when it is readable; when it
					// is not (see queryStatus), our own bookkeeping stands in.
					const received = parseReceived(xhr.getResponseHeader('range'));
					if (received !== null) {
						resolve({ received });
						return;
					}
					// Nothing readable at all is the strong CORS signal: a same-origin
					// or properly-exposed response always yields at least one header.
					const anyHeaders = (xhr.getAllResponseHeaders() ?? '').trim().length > 0;
					logDeckUpload('308 with no readable Range header', {
						range,
						isLast,
						anyHeadersReadable: anyHeaders
					});
					resolve({ received: chunk.endExclusive, rangeUnreadable: true });
					return;
				}
				reject(
					new DeckUploadError('chunk_status', `Drive rejected the upload (${xhr.status}).`, {
						status: xhr.status,
						range,
						isLast,
						bodySample: (xhr.responseText ?? '').slice(0, 200)
					})
				);
			};
			xhr.send(blob);
		});
	},

	discard(uploadUrl) {
		void fetch(uploadUrl, { method: 'DELETE' }).catch(() => {});
	}
};

/**
 * What a post-failure status query found. Reported in the failure itself,
 * because "Drive holds 41,943,040 of 43,102,948 bytes" is the one number that
 * turns a dropped final chunk into a diagnosis.
 */
interface StatusProbe {
	state: 'not-run' | 'holds' | 'finalized' | 'unreadable' | 'failed';
	received: number | null;
	message?: string;
}

/**
 * Uploads one file into an already-opened resumable session and returns the
 * Drive file id.
 *
 * ON ANY CHUNK FAILURE IT ASKS DRIVE WHERE IT GOT TO FIRST, then resumes from
 * that answer rather than from what this side believed. For an ordinary chunk
 * that turns a wifi blip into a re-send of at most one chunk; for the FINAL
 * chunk it is the difference between reporting a failure and noticing that the
 * file finalized and the 200 was simply not readable.
 *
 * Cancelling (via `signal`) stops the transfer and asks Google to discard the
 * session, so an abandoned upload leaves no file behind at all.
 */
export async function uploadZipToDrive(opts: {
	uploadUrl: string;
	file: File;
	/**
	 * The length the upload SESSION was opened for. Required, not derived: the
	 * session's `X-Upload-Content-Length` and every chunk's Content-Range total
	 * have to be the same number, and the only way they can disagree is if the
	 * file was measured twice. Checked before a byte is sent.
	 */
	declaredSize: number;
	/**
	 * The content type the SESSION was opened with, handed back by the server
	 * that opened it. Not the File's own type: the browser's guess for a .zip
	 * differs by platform, and a chunk that disagrees with its session is
	 * exactly what a finalize can refuse. See chunkRequestHeaders.
	 */
	contentType: string;
	onProgress?: (p: DeckUploadProgress) => void;
	signal?: AbortSignal;
	/** Test seam; see DeckUploadTransport. */
	transport?: DeckUploadTransport;
	chunkBytes?: number;
	/**
	 * Test seam: flattens the exponential backoff, which is otherwise seven and
	 * a half real seconds every time an exhausted retry is asserted. Unset in
	 * every shipping caller.
	 */
	retryDelayMs?: number;
}): Promise<string> {
	const transport = opts.transport ?? xhrTransport;
	const chunkBytes = opts.chunkBytes ?? CHUNK_BYTES;
	const total = opts.file.size;

	if (opts.declaredSize !== total) {
		throw new DeckUploadError(
			'size_mismatch',
			'The file changed size after the upload was authorized. Pick it again.',
			{ declaredSize: opts.declaredSize, fileBytes: total }
		);
	}
	if (!Number.isInteger(total) || total <= 0) {
		throw new DeckUploadError('bad_chunk', 'That file is empty.', { total });
	}

	/** Named once so the confirm step and the finalize step cannot drift. */
	function confirm(res: ChunkResult): string {
		if (!res.fileId) {
			throw new DeckUploadError('no_file_id', 'Drive did not return a file id.', { total });
		}
		if (res.storedSize != null && res.storedSize !== total) {
			throw new DeckUploadError(
				'size_mismatch',
				`Drive stored ${res.storedSize} bytes of ${total}. The upload did not finish.`,
				{ storedSize: res.storedSize, total, fileId: res.fileId }
			);
		}
		opts.onProgress?.({ loaded: total, total });
		return res.fileId;
	}

	/** Never throws: a probe that fails is context, not an outcome. */
	async function probe(): Promise<StatusProbe & { result?: ChunkResult }> {
		try {
			const res = await transport.queryStatus({
				uploadUrl: opts.uploadUrl,
				total,
				signal: opts.signal
			});
			if (res.fileId) return { state: 'finalized', received: total, result: res };
			if (res.rangeUnreadable) return { state: 'unreadable', received: null };
			return { state: 'holds', received: res.received };
		} catch (e) {
			if (e instanceof DeckUploadCancelled) throw e;
			return { state: 'failed', received: null, message: (e as Error).message };
		}
	}

	let sent = 0;
	let index = 0;
	let attempt = 0;
	let puts = 0;
	let lastError: DeckUploadError | null = null;
	let lastProbe: StatusProbe = { state: 'not-run', received: null };
	/** Sticky: once seen, it is context for anything that fails afterwards. */
	let rangeUnreadable = false;
	// A bound rather than a while(true): one PUT per planned chunk plus the
	// retries, so a Drive that kept rewinding could not spin here forever.
	const maxPuts = planChunks(total, chunkBytes).length + MAX_CHUNK_ATTEMPTS * 4 + 8;

	opts.onProgress?.({ loaded: 0, total });

	try {
		while (sent < total) {
			if (puts >= maxPuts) {
				throw new DeckUploadError('not_confirmed', 'The upload stopped making progress.', {
					sent,
					total,
					puts
				});
			}
			const chunk = nextChunk(sent, total, index, chunkBytes);
			if (!chunk) break;

			try {
				puts += 1;
				const res = await transport.putChunk({
					uploadUrl: opts.uploadUrl,
					blob: opts.file.slice(chunk.start, chunk.endExclusive),
					chunk,
					total,
					contentType: opts.contentType,
					signal: opts.signal,
					onProgress: (loaded) => opts.onProgress?.({ loaded: chunk.start + loaded, total })
				});
				if (res.rangeUnreadable) rangeUnreadable = true;
				if (res.fileId) return confirm(res);
				// Trust Google's count over our own: a chunk it only partly received
				// rewinds us rather than leaving a hole. Standing still, though, is a
				// failed attempt -- not something to loop on.
				if (res.received === sent) {
					throw new DeckUploadError('chunk_status', 'Drive received none of that chunk.', {
						range: chunkContentRange(chunk, total),
						received: res.received
					});
				}
				sent = res.received;
				index += 1;
				attempt = 0;
				lastError = null;
				continue;
			} catch (e) {
				if (e instanceof DeckUploadCancelled) throw e;
				attempt += 1;
				lastError =
					e instanceof DeckUploadError
						? e
						: new DeckUploadError('chunk_network', (e as Error).message || 'The upload failed.');
				// A bug in our own arithmetic, or a file that changed under us, is
				// deterministic: retrying it four more times against Drive would
				// only bury the message it is trying to give.
				if (lastError.code === 'bad_chunk' || lastError.code === 'size_mismatch') {
					throw diagnose(lastError, chunk, total, lastProbe);
				}
				logDeckUpload('chunk failed', {
					attempt,
					of: MAX_CHUNK_ATTEMPTS,
					chunkIndex: chunk.index,
					range: `bytes ${chunk.start}-${chunk.endInclusive}/${total}`,
					isLast: chunk.isLast,
					code: lastError.code,
					detail: lastError.detail,
					message: lastError.message
				});

				// ASK DRIVE FIRST, before backing off or deciding this failed. On the
				// last chunk this is the whole question: the file may have finalized
				// and the answer simply not been readable.
				const found = await probe();
				lastProbe = { state: found.state, received: found.received, message: found.message };
				if (found.state === 'unreadable') rangeUnreadable = true;
				if (found.state === 'finalized' && found.result) return confirm(found.result);
				if (found.received !== null && found.received !== sent) {
					// Real movement in either direction: resume from Drive's answer.
					sent = found.received;
					index += 1;
					attempt = 0;
					opts.onProgress?.({ loaded: sent, total });
					continue;
				}

				if (attempt >= MAX_CHUNK_ATTEMPTS) {
					throw decorate(diagnose(lastError, chunk, total, lastProbe), rangeUnreadable);
				}
				await sleep(opts.retryDelayMs ?? Math.min(8000, 500 * 2 ** (attempt - 1)), opts.signal);
				opts.onProgress?.({ loaded: sent, total });
			}
		}

		// Every byte is accounted for but Google never returned metadata: ask
		// once, rather than reporting a success with no file id.
		const final = await probe();
		if (final.state === 'finalized' && final.result) return confirm(final.result);
		if (final.state === 'unreadable') rangeUnreadable = true;
		throw decorate(
			new DeckUploadError('not_confirmed', 'The upload finished but Drive did not confirm it.', {
				total,
				driveReceived: final.received,
				statusQuery: final.state,
				lastChunkError: lastError?.code ?? null
			}),
			rangeUnreadable
		);
	} catch (e) {
		if (e instanceof DeckUploadCancelled) {
			// Ask Google to throw the partial transfer away. Best-effort: an
			// unfinished session produces no file either way, so a failed cancel
			// leaves nothing behind.
			transport.discard(opts.uploadUrl);
		}
		throw e;
	}
}

/**
 * Attaches the numbers a live report cannot otherwise carry.
 *
 * The user of a failed deck upload has a browser and no server log, so the
 * failure has to say WHICH chunk, over WHAT range, out of what declared total,
 * whether it was the final one, and what Drive itself said it was holding when
 * asked. Before this, all of that arrived as "something dropped".
 */
function diagnose(
	error: DeckUploadError,
	chunk: DeckChunk,
	total: number,
	probeResult: StatusProbe
): DeckUploadError {
	const detail = {
		...error.detail,
		chunkIndex: chunk.index,
		chunkStart: chunk.start,
		chunkEnd: chunk.endInclusive,
		chunkBytes: chunk.length,
		declaredTotal: total,
		isLastChunk: chunk.isLast,
		statusQuery: probeResult.state,
		driveReceived: probeResult.received,
		statusMessage: probeResult.message ?? null
	};
	const held =
		probeResult.state === 'holds' && probeResult.received !== null
			? ` Drive was holding ${probeResult.received} of ${total} bytes.`
			: probeResult.state === 'unreadable'
				? " Drive's progress header was not readable, so how much it holds is unknown."
				: probeResult.state === 'failed'
					? ' Drive could not be asked how much it holds.'
					: '';
	const which = chunk.isLast
		? `The final chunk (bytes ${chunk.start}-${chunk.endInclusive} of ${total}) failed.`
		: `Chunk ${chunk.index + 1} (bytes ${chunk.start}-${chunk.endInclusive} of ${total}) failed.`;
	const out = new DeckUploadError(error.code, `${which} ${error.message}${held}`, detail);
	logDeckUpload('upload failed', { code: out.code, detail });
	return out;
}

/**
 * Re-labels a failure that happened while the resume protocol's own header was
 * unreadable. That is a genuinely different diagnosis -- the request may have
 * succeeded and we cannot see it -- and it is invisible in the failure itself.
 */
function decorate(error: Error, rangeUnreadable: boolean): Error {
	if (!rangeUnreadable || !(error instanceof DeckUploadError)) return error;
	return new DeckUploadError(
		'headers_blocked',
		`${error.message} Drive's progress header was not readable from this browser, so the upload could not be resumed accurately (a CORS exposure problem, not a network one).`,
		{ ...error.detail, originalCode: error.code }
	);
}
