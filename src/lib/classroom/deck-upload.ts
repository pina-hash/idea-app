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
 * EVERY FAILURE IS NAMED. A cross-origin upload has several failure modes that
 * all LOOK like "the connection dropped" from the outside -- an unexpected
 * status on the last chunk, a response whose headers CORS will not let us read,
 * a request that never answered, one that timed out -- and telling them apart
 * from a browser, with no server logs, is the difference between diagnosing a
 * real deployment and guessing at it. So each throws a DeckUploadError carrying
 * a `code` and the numbers behind it, and each is logged to the console under
 * one prefix.
 */

/** A multiple of 256 KiB, as Google's resumable protocol requires. */
const CHUNK_BYTES = 8 * 1024 * 1024;
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

interface ChunkResult {
	/** Set once Google reports the whole file received. */
	fileId?: string;
	/** How many bytes Google says it now holds. */
	received: number;
	/** True when a 308 arrived with no readable `Range` (see headers_blocked). */
	rangeUnreadable?: boolean;
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
 * is the only field we want, and a body we cannot parse is a real failure --
 * silently reporting success with no id would leave the server unable to
 * ingest anything.
 */
function fileIdFrom(text: string, status: number): string {
	try {
		const id = (JSON.parse(text) as { id?: string }).id;
		if (id) return id;
	} catch {
		/* fall through */
	}
	throw new DeckUploadError(
		'no_file_id',
		'The upload finished but Drive did not return a file id.',
		{ status, bodyLength: text.length, bodySample: text.slice(0, 120) }
	);
}

/**
 * How much of the file Google actually holds.
 *
 * Used only on RECOVERY. A `Content-Range: bytes STAR/total` with no body asks
 * Google where it got to; the answer's `Range` header is the resume point.
 *
 * THE HEADER MAY NOT BE READABLE, and the fallback is the point of this
 * function's shape: a cross-origin response only exposes headers the server
 * allows, so if `Range` does not come through we report 0 and the chunk is
 * simply re-sent from where we believed we were. Re-sending a chunk Google
 * already has is harmless -- the protocol is idempotent per range -- so an
 * unreadable header costs bandwidth, never correctness. It is REPORTED, though:
 * it is the difference between "the network failed" and "we cannot see the
 * answer", which no other symptom distinguishes.
 */
async function queryReceived(
	uploadUrl: string,
	total: number,
	signal?: AbortSignal
): Promise<ChunkResult> {
	const res = await fetch(uploadUrl, {
		method: 'PUT',
		headers: { 'content-range': `bytes */${total}` },
		signal
	});
	if (res.status === 200 || res.status === 201) {
		return { fileId: fileIdFrom(await res.text(), res.status), received: total };
	}
	if (res.status !== 308) {
		throw new DeckUploadError('chunk_status', `Drive rejected the upload (${res.status}).`, {
			status: res.status,
			phase: 'resume-probe'
		});
	}
	const range = res.headers.get('range');
	const end = range ? Number(/bytes=0-(\d+)/.exec(range)?.[1] ?? NaN) : NaN;
	if (!Number.isFinite(end)) {
		return { received: 0, rangeUnreadable: true };
	}
	return { received: end + 1 };
}

/** One chunk, with upload progress. Resolves on 200/201/308, rejects otherwise. */
function putChunk(opts: {
	uploadUrl: string;
	blob: Blob;
	start: number;
	total: number;
	contentType: string;
	signal?: AbortSignal;
	onProgress?: (loaded: number) => void;
}): Promise<ChunkResult> {
	return new Promise<ChunkResult>((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		const end = opts.start + opts.blob.size - 1;
		const isLast = end + 1 >= opts.total;
		const range = `bytes ${opts.start}-${end}/${opts.total}`;

		function onAbort() {
			xhr.abort();
			reject(new DeckUploadCancelled());
		}
		if (opts.signal?.aborted) return onAbort();
		opts.signal?.addEventListener('abort', onAbort, { once: true });

		function done() {
			opts.signal?.removeEventListener('abort', onAbort);
		}

		xhr.open('PUT', opts.uploadUrl, true);
		xhr.timeout = CHUNK_TIMEOUT_MS;
		xhr.setRequestHeader('content-type', opts.contentType);
		xhr.setRequestHeader('content-range', range);
		xhr.upload.onprogress = (e) => {
			if (e.lengthComputable) opts.onProgress?.(e.loaded);
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
			reject(
				new DeckUploadError('chunk_timeout', 'The upload timed out.', { range, isLast })
			);
		};
		xhr.onload = () => {
			done();
			if (xhr.status === 200 || xhr.status === 201) {
				try {
					resolve({ fileId: fileIdFrom(xhr.responseText, xhr.status), received: opts.total });
				} catch (e) {
					reject(e as Error);
				}
				return;
			}
			if (xhr.status === 308) {
				// The Range header is the authority when it is readable; when it
				// is not (see queryReceived), our own bookkeeping stands in.
				const got = Number(/bytes=0-(\d+)/.exec(xhr.getResponseHeader('range') ?? '')?.[1] ?? NaN);
				if (Number.isFinite(got)) {
					resolve({ received: got + 1 });
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
				resolve({ received: end + 1, rangeUnreadable: true });
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
		xhr.send(opts.blob);
	});
}

/**
 * Uploads one file into an already-opened resumable session and returns the
 * Drive file id.
 *
 * Retries a failed chunk a few times, asking Google where it got to first, so a
 * blip on school wifi resumes rather than restarting a large upload. Cancelling
 * (via `signal`) stops the transfer and asks Google to discard the session, so
 * an abandoned upload leaves no file behind at all.
 */
export async function uploadZipToDrive(opts: {
	uploadUrl: string;
	file: File;
	onProgress?: (p: DeckUploadProgress) => void;
	signal?: AbortSignal;
}): Promise<string> {
	const total = opts.file.size;
	const contentType = opts.file.type || 'application/zip';
	let sent = 0;
	let lastError: Error | null = null;
	/** Sticky: once seen, it is context for anything that fails afterwards. */
	let rangeUnreadable = false;

	opts.onProgress?.({ loaded: 0, total });

	try {
		while (sent < total) {
			const end = Math.min(sent + CHUNK_BYTES, total);
			let attempt = 0;
			let advanced = false;

			while (attempt < MAX_CHUNK_ATTEMPTS && !advanced) {
				attempt += 1;
				try {
					const res = await putChunk({
						uploadUrl: opts.uploadUrl,
						blob: opts.file.slice(sent, end),
						start: sent,
						total,
						contentType,
						signal: opts.signal,
						onProgress: (loaded) => opts.onProgress?.({ loaded: sent + loaded, total })
					});
					if (res.rangeUnreadable) rangeUnreadable = true;
					if (res.fileId) {
						opts.onProgress?.({ loaded: total, total });
						return res.fileId;
					}
					// Trust Google's count over our own: a chunk it only partly
					// received rewinds us rather than leaving a hole.
					sent = res.received;
					advanced = true;
				} catch (e) {
					if (e instanceof DeckUploadCancelled) throw e;
					lastError = e as Error;
					logDeckUpload('chunk failed', {
						attempt,
						of: MAX_CHUNK_ATTEMPTS,
						sent,
						total,
						code: (e as DeckUploadError).code,
						detail: (e as DeckUploadError).detail,
						message: (e as Error).message
					});
					if (attempt >= MAX_CHUNK_ATTEMPTS) break;
					await sleep(Math.min(8000, 500 * 2 ** (attempt - 1)), opts.signal);
					// Re-synchronise before re-sending: the failure may have
					// landed anyway, and resuming from Google's own count is
					// what keeps a dropped connection cheap.
					try {
						const status = await queryReceived(opts.uploadUrl, total, opts.signal);
						if (status.rangeUnreadable) rangeUnreadable = true;
						if (status.fileId) {
							opts.onProgress?.({ loaded: total, total });
							return status.fileId;
						}
						if (status.received > 0) sent = status.received;
					} catch (probe) {
						if (probe instanceof DeckUploadCancelled) throw probe;
						// A failed probe is not itself fatal; the retry stands.
						logDeckUpload('resume probe failed', {
							message: (probe as Error).message,
							code: (probe as DeckUploadError).code
						});
					}
					opts.onProgress?.({ loaded: sent, total });
				}
			}

			if (!advanced) {
				throw decorate(
					lastError ?? new DeckUploadError('chunk_network', 'The upload failed.'),
					rangeUnreadable
				);
			}
		}

		// Every byte is accounted for but Google never returned metadata: ask
		// once, rather than reporting a success with no file id.
		const final = await queryReceived(opts.uploadUrl, total, opts.signal);
		if (final.fileId) return final.fileId;
		throw decorate(
			new DeckUploadError('not_confirmed', 'The upload finished but Drive did not confirm it.', {
				total
			}),
			final.rangeUnreadable || rangeUnreadable
		);
	} catch (e) {
		if (e instanceof DeckUploadCancelled) {
			// Ask Google to throw the partial transfer away. Best-effort: an
			// unfinished session produces no file either way, so a failed
			// cancel leaves nothing behind.
			void fetch(opts.uploadUrl, { method: 'DELETE' }).catch(() => {});
		}
		throw e;
	}
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
