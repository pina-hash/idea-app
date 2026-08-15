/**
 * The browser half of a deck upload: ONE multipart POST to our own server,
 * with real upload progress.
 *
 * WHY THE BYTES GO THROUGH OUR SERVER, AGAIN. This used to go straight to
 * Google (0102): the browser filled a Google resumable upload session
 * directly, because Vercel caps a serverless request body at roughly 4.5 MB
 * and a real Claude Design export is tens of megabytes. That transport did
 * not survive contact with reality -- live testing found the browser could
 * not reach Google's chunked-upload endpoint at all in this environment, not
 * for a 43 MB deck across seven chunks and not for a 3.9 MB deck in one. That
 * failure is environmental, not a bug in the chunking, the headers or the
 * arithmetic, and every OTHER file upload in this app already goes through
 * our own server (attachments, submission files, notebook photos) because
 * that is where the Drive credentials live. So decks go back to that same
 * shape: the browser posts the zip HERE, our server writes it to Drive on
 * the caller's behalf, and hands off into the SAME staged ingestion (0105)
 * as before, unchanged.
 *
 * WHICH MEANS THE ZIP HAS TO FIT IN ONE REQUEST BODY AGAIN. See
 * DECK_UPLOAD_MAX_ZIP_BYTES / deckUploadSizeIssue in ./deck -- a deck over
 * that cap is refused here, before anything is sent, with a message naming
 * the actual size and telling the uploader to pull large media (gifs, video)
 * out of the deck and attach it to the item separately instead. The server
 * refuses the same oversize zip again if that check is ever bypassed; see
 * $lib/server/classroom-decks.ts.
 *
 * XHR RATHER THAN FETCH, for exactly one reason: `fetch` in a browser cannot
 * report UPLOAD progress, and a multi-megabyte POST on school wifi is long
 * enough that a bar with nothing to report reads as a hang.
 *
 * EVERY FAILURE IS NAMED. A cross-origin upload used to have several
 * indistinguishable failure modes; a same-origin one has fewer, but "the
 * connection dropped" and "the request timed out" still read identically
 * from the outside unless they say so. Each throws a DeckUploadError carrying
 * a `code`, and each is logged to the console under one prefix.
 */

export type DeckUploadCode = 'cancelled' | 'network' | 'timeout';

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
 * One line per failure, in the console, with the numbers. Kept here rather
 * than left to the caller so nothing that throws from this module -- or from
 * the staged `files`/`finish` stages in $lib/classroom/transports.ts, which
 * import this too -- can be swallowed silently on the way up.
 */
export function logDeckUpload(where: string, detail: Record<string, unknown>): void {
	// eslint-disable-next-line no-console
	console.error(`[deck upload] ${where}`, detail);
}

/** How long the upload POST may take before it is called hung. */
const DECK_UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * What the server answers once the upload finishes: the ingest job it
 * opened, and the same "begin" facts the old direct-to-Drive path handed
 * back (entry path, whether the hidden state file survived, slide/warning
 * counts) -- unpacking itself still happens in stages after this, unchanged.
 */
export interface DeckUploadStarted {
	ok: true;
	jobId: string;
	itemId: string;
	totalFiles: number;
	entryPath: string;
	hasStateFile: boolean;
	slidesCount: number;
	warnings: string[];
}

export interface DeckUploadRefused {
	ok: false;
	code: string;
	message: string;
	/** When the zip offered several plausible entry pages, they land here. */
	candidates?: string[];
}

/**
 * The one call this module makes, behind an interface -- a test seam, and
 * only that: the default implementation is the XHR transport below, and every
 * shipping caller uses it. It exists because node has no XMLHttpRequest, and
 * because a caller with its own endpoint to point at (the dev harness has no
 * session or Drive) needs to supply its own `url`.
 */
export interface DeckPostTransport {
	post(opts: {
		url: string;
		form: FormData;
		signal?: AbortSignal;
		timeoutMs: number;
		onProgress?: (loaded: number) => void;
	}): Promise<{ status: number; body: Record<string, unknown> | null }>;
}

const DEFAULT_UPLOAD_URL = '/api/classroom/deck';

const xhrPostTransport: DeckPostTransport = {
	post({ url, form, signal, timeoutMs, onProgress }) {
		return new Promise((resolve, reject) => {
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

			xhr.open('POST', url, true);
			xhr.timeout = timeoutMs;
			xhr.upload.onprogress = (e) => {
				if (e.lengthComputable) onProgress?.(e.loaded);
			};
			xhr.onerror = () => {
				done();
				reject(new DeckUploadError('network', 'The connection dropped while uploading the deck.'));
			};
			xhr.ontimeout = () => {
				done();
				reject(
					new DeckUploadError(
						'timeout',
						`The upload did not finish within ${Math.round(timeoutMs / 1000)}s.`
					)
				);
			};
			xhr.onload = () => {
				done();
				let body: Record<string, unknown> | null = null;
				try {
					body = xhr.responseText ? (JSON.parse(xhr.responseText) as Record<string, unknown>) : null;
				} catch {
					body = null;
				}
				resolve({ status: xhr.status, body });
			};
			xhr.send(form);
		});
	}
};

/**
 * Posts the deck zip (already validated by the caller against
 * deckUploadSizeIssue) and returns either the opened ingest job or a
 * structured refusal -- never throws for an ordinary refusal, only for a
 * genuine transport failure (network drop, timeout, cancel), which the
 * caller is expected to catch.
 */
export async function postDeckZip(opts: {
	form: FormData;
	total: number;
	signal?: AbortSignal;
	onProgress?: (loaded: number) => void;
	transport?: DeckPostTransport;
	timeoutMs?: number;
	/** Overridden by the dev harness, which has no session or Drive. */
	url?: string;
}): Promise<DeckUploadStarted | DeckUploadRefused> {
	const transport = opts.transport ?? xhrPostTransport;
	opts.onProgress?.(0);
	const res = await transport.post({
		url: opts.url ?? DEFAULT_UPLOAD_URL,
		form: opts.form,
		signal: opts.signal,
		timeoutMs: opts.timeoutMs ?? DECK_UPLOAD_TIMEOUT_MS,
		onProgress: opts.onProgress
	});
	const body = res.body ?? {};
	if (res.status >= 200 && res.status < 300 && body.ok === true && body.job_id) {
		opts.onProgress?.(opts.total);
		return {
			ok: true,
			jobId: String(body.job_id),
			itemId: String(body.item_id ?? ''),
			totalFiles: Number(body.total_files ?? 0),
			entryPath: String(body.entry_path ?? ''),
			hasStateFile: body.has_state_file === true,
			slidesCount: Number(body.slides ?? 0),
			warnings: Array.isArray(body.warnings) ? body.warnings.map(String) : []
		};
	}
	const refusal: DeckUploadRefused = {
		ok: false,
		code: String(body.code ?? `http_${res.status}`),
		message: String(body.error ?? `The server refused this upload (${res.status}).`),
		candidates: Array.isArray(body.candidates) ? body.candidates.map(String) : undefined
	};
	logDeckUpload('upload refused', { status: res.status, code: refusal.code, message: refusal.message });
	return refusal;
}
