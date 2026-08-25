/**
 * ONE small XHR helper for reporting real upload progress, because `fetch`
 * cannot report it in any browser and a multi-megabyte transfer on school wifi
 * with nothing on screen reads as a hang -- and the thing a person does when a
 * page looks hung is press the button again.
 *
 * This is deliberately not the deck uploader itself (that module owns its own
 * retry/cancel/staged-ingest machinery for a much larger, chunked transfer); it
 * is the plain one-request case every attachment, answer key and submission
 * file actually is.
 *
 * THERE USED TO BE A `postFormWithProgress` HERE, AND IT IS GONE RATHER THAN
 * KEPT. It POSTed a multipart form to one of our own routes, which was how
 * every classroom file travelled before 0133 -- through the serverless function
 * and out again to Drive. Its last caller was the instructor-only upload, and
 * once that moved onto the signed-URL path there was nothing left that should
 * ever want it: a dormant helper for the shape a bundle just removed is an
 * invitation to write the 4 MiB path again.
 */

export interface UploadProgressResult {
	status: number;
	body: Record<string, unknown> | null;
}

/**
 * PUTs a raw file body to `url` with the same progress reporting.
 *
 * WHY XHR AND NOT `uploadToSignedUrl`. storage-js's helper does exactly this
 * PUT, with `fetch` -- and `fetch` cannot report upload progress in any
 * browser, which for a 60 MB assembly on school wifi means several minutes with
 * nothing on screen. That reads as a hang, and the thing a person does when a
 * page looks hung is press the button again. So the one call whose progress
 * actually matters is made by hand.
 *
 * The signed URL carries its own token in the query string, so there is no
 * session header here and nothing to leak: this request is authorized by the
 * URL alone and reaches Supabase, not us.
 *
 * Resolves with the status and the parsed body whatever the status, exactly as
 * every other caller here expects -- a refusal is a result to be classified, not an
 * exception. Rejects only on a genuine network failure or an abort.
 */
export function putFileWithProgress(
	url: string,
	file: Blob,
	contentType: string,
	onProgress?: (fraction: number) => void
): Promise<UploadProgressResult> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open('PUT', url, true);
		xhr.setRequestHeader('content-type', contentType);
		// Storage's own default. Stated rather than left implicit, because a
		// signed upload URL minted without upsert refuses a second PUT to the
		// same key -- which is what we want (keys are fresh uuids, so a repeat
		// means something went wrong upstream, not that a file was replaced).
		xhr.setRequestHeader('x-upsert', 'false');
		xhr.upload.onprogress = (e) => {
			if (e.lengthComputable && e.total > 0) onProgress?.(e.loaded / e.total);
		};
		xhr.onerror = () => reject(new Error('The connection dropped while uploading.'));
		xhr.onabort = () => reject(new Error('The upload was cancelled.'));
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
		xhr.send(file);
	});
}
