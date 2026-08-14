/**
 * The browser half of a direct-to-Drive deck upload (0102).
 *
 * WHY THE BYTES GO STRAIGHT TO GOOGLE. A serverless request body is capped at
 * ~4.5 MB on Vercel and a real Claude Design export is 23.5 MB of kept files,
 * so posting the zip through our own server failed at the platform before any
 * of our code ran. The server opens a Google RESUMABLE UPLOAD SESSION and hands
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
 */

/** A multiple of 256 KiB, as Google's resumable protocol requires. */
const CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_CHUNK_ATTEMPTS = 5;

export class DeckUploadCancelled extends Error {
	constructor() {
		super('Upload cancelled.');
		this.name = 'DeckUploadCancelled';
	}
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
function fileIdFrom(text: string): string {
	try {
		const id = (JSON.parse(text) as { id?: string }).id;
		if (id) return id;
	} catch {
		/* fall through */
	}
	throw new Error('The upload finished but Drive did not return a file id.');
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
 * unreadable header costs bandwidth, never correctness.
 */
async function queryReceived(uploadUrl: string, total: number, signal?: AbortSignal): Promise<ChunkResult> {
	const res = await fetch(uploadUrl, {
		method: 'PUT',
		headers: { 'content-range': `bytes */${total}` },
		signal
	});
	if (res.status === 200 || res.status === 201) {
		return { fileId: fileIdFrom(await res.text()), received: total };
	}
	if (res.status !== 308) {
		throw new Error(`Drive rejected the upload (${res.status}).`);
	}
	const range = res.headers.get('range');
	const end = range ? Number(/bytes=0-(\d+)/.exec(range)?.[1] ?? NaN) : NaN;
	return { received: Number.isFinite(end) ? end + 1 : 0 };
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
		xhr.setRequestHeader('content-type', opts.contentType);
		xhr.setRequestHeader('content-range', `bytes ${opts.start}-${end}/${opts.total}`);
		xhr.upload.onprogress = (e) => {
			if (e.lengthComputable) opts.onProgress?.(e.loaded);
		};
		xhr.onerror = () => {
			done();
			reject(new Error('The connection dropped during the upload.'));
		};
		xhr.ontimeout = () => {
			done();
			reject(new Error('The upload timed out.'));
		};
		xhr.onload = () => {
			done();
			if (xhr.status === 200 || xhr.status === 201) {
				try {
					resolve({ fileId: fileIdFrom(xhr.responseText), received: opts.total });
				} catch (e) {
					reject(e as Error);
				}
				return;
			}
			if (xhr.status === 308) {
				// The Range header is the authority when it is readable; when it
				// is not (see queryReceived), our own bookkeeping stands in.
				const range = xhr.getResponseHeader('range');
				const got = range ? Number(/bytes=0-(\d+)/.exec(range)?.[1] ?? NaN) : NaN;
				resolve({ received: Number.isFinite(got) ? got + 1 : end + 1 });
				return;
			}
			reject(new Error(`Drive rejected the upload (${xhr.status}).`));
		};
		xhr.send(opts.blob);
	});
}

/**
 * Uploads one file into an already-opened resumable session and returns the
 * Drive file id.
 *
 * Retries a failed chunk a few times, asking Google where it got to first, so a
 * blip on school wifi resumes rather than restarting a 100 MB upload. Cancelling
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
					if (attempt >= MAX_CHUNK_ATTEMPTS) break;
					await sleep(Math.min(8000, 500 * 2 ** (attempt - 1)), opts.signal);
					// Re-synchronise before re-sending: the failure may have
					// landed anyway, and resuming from Google's own count is
					// what keeps a dropped connection cheap.
					try {
						const status = await queryReceived(opts.uploadUrl, total, opts.signal);
						if (status.fileId) {
							opts.onProgress?.({ loaded: total, total });
							return status.fileId;
						}
						if (status.received > 0) sent = status.received;
					} catch (probe) {
						if (probe instanceof DeckUploadCancelled) throw probe;
						// A failed probe is not itself fatal; the retry stands.
					}
					opts.onProgress?.({ loaded: sent, total });
				}
			}

			if (!advanced) {
				throw lastError ?? new Error('The upload failed.');
			}
		}

		// Every byte is accounted for but Google never returned metadata: ask
		// once, rather than reporting a success with no file id.
		const final = await queryReceived(opts.uploadUrl, total, opts.signal);
		if (final.fileId) return final.fileId;
		throw new Error('The upload finished but Drive did not confirm it.');
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
