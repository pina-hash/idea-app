/**
 * ONE small XHR helper for reporting real upload progress on an ordinary
 * multipart POST -- the deck uploader's own reasoning (deck-upload.ts)
 * applied to every OTHER file upload in the classroom module: `fetch` cannot
 * report upload progress in a browser, and a multi-megabyte POST on school
 * wifi with nothing on screen reads as a hang.
 *
 * This is deliberately not the deck uploader itself (that module owns its
 * own retry/cancel/staged-ingest machinery for a much larger, chunked
 * transfer); it is the plain one-request case every attachment and
 * submission-file upload actually is.
 */

export interface UploadProgressResult {
	status: number;
	body: Record<string, unknown> | null;
}

/**
 * POSTs `form` to `url` and calls `onProgress` with a 0..1 fraction as the
 * browser reports bytes sent. Resolves with the parsed JSON body (or null if
 * the response was not JSON) regardless of status -- callers already read
 * `res.ok`-shaped bodies for their own error messages, so this never throws
 * on a non-2xx response, only on a genuine network failure.
 */
export function postFormWithProgress(
	url: string,
	form: FormData,
	onProgress?: (fraction: number) => void
): Promise<UploadProgressResult> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open('POST', url, true);
		xhr.upload.onprogress = (e) => {
			if (e.lengthComputable && e.total > 0) onProgress?.(e.loaded / e.total);
		};
		xhr.onerror = () => reject(new Error('The connection dropped while uploading.'));
		xhr.onload = () => {
			let body: Record<string, unknown> | null = null;
			try {
				body = xhr.responseText ? (JSON.parse(xhr.responseText) as Record<string, unknown>) : null;
			} catch {
				body = null;
			}
			onProgress?.(1);
			resolve({ status: xhr.status, body });
		};
		xhr.send(form);
	});
}
