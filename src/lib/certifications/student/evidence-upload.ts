/**
 * ONE EVIDENCE FILE, BROWSER TO BUCKET (ledger 0391), the classroom's three
 * steps in `$lib/classroom/file-upload.ts` with the middle one spelled the
 * storage client's way:
 *
 *   1. SIGN    `POST /api/certifications/evidence/sign` (surface b) decides
 *              WHETHER (the caller owns an open attempt) and WHERE (the key,
 *              `<attempt_id>/<uuid>.<ext>`; nothing a person typed is in it).
 *   2. PUT     `storage.from('cert-evidence').uploadToSignedUrl(path, token,
 *              file)`: the bytes go straight to Supabase and our server is
 *              not in the request, which is what makes a 50 MiB photo set
 *              possible on school wifi at all.
 *   3. RECORD  there is no third request: the path rides in the submission's
 *              evidence jsonb and `cert_submit` checks every path starts with
 *              the attempt's own id.
 *
 * A failure at any step is a VALUE naming its gate, never a throw, so one
 * refused file cannot discard the others' results (the classroom's rule), and
 * the size is refused BEFORE the sign request in a sentence that states the
 * size and the limit. The cap is the bucket's own (`CERT_EVIDENCE_MAX_BYTES`
 * in `$lib/server/certifications/evidence.ts`), restated here because a
 * server module cannot reach a browser.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { CERT_API } from '$lib/certifications/nav';
import type { CertEvidenceFile } from '$lib/certifications/types';
import { classifyUploadError, tooLarge } from '$lib/classroom/upload-errors';
import { trackInFlight } from '$lib/shell/deploy-safety';

export const CERT_EVIDENCE_BUCKET = 'cert-evidence';
export const CERT_EVIDENCE_MAX_BYTES = 50 * 1024 * 1024;
/** Stored as the classroom stores every upload: never `File.type`. */
export const CERT_EVIDENCE_CONTENT_TYPE = 'application/octet-stream';

export type EvidenceUploadOutcome =
	| { ok: true; file: CertEvidenceFile }
	| { ok: false; message: string; retryable: boolean };

export type EvidenceUploader = (file: File) => Promise<EvidenceUploadOutcome>;

interface SignAnswer {
	ok?: boolean;
	path?: string;
	token?: string;
	signedUrl?: string;
	message?: string;
	error?: string;
	retryable?: boolean;
}

const DENIED =
	'Storage refused this file because of who is asking. A file can only go on your own open attempt; if it was withdrawn or awarded while this was uploading, that is what changed.';

export function createEvidenceUploader(supabase: SupabaseClient, attemptId: string): EvidenceUploader {
	return (file) => trackInFlight(send(supabase, attemptId, file), `uploading "${file.name}"`);
}

async function send(supabase: SupabaseClient, attemptId: string, file: File): Promise<EvidenceUploadOutcome> {
	if (file.size > CERT_EVIDENCE_MAX_BYTES) {
		const t = tooLarge(file.size, CERT_EVIDENCE_MAX_BYTES);
		return { ok: false, message: t.message, retryable: false };
	}
	if (file.size === 0) {
		return { ok: false, message: `"${file.name}" is empty (0 bytes), so there is nothing to upload.`, retryable: false };
	}

	// 1. SIGN
	let signed: SignAnswer | null = null;
	let status = 0;
	try {
		const res = await fetch(CERT_API.evidenceSign, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ attempt_id: attemptId, filename: file.name, size: file.size })
		});
		status = res.status;
		signed = (await res.json().catch(() => null)) as SignAnswer | null;
	} catch (e) {
		return {
			ok: false,
			message: `${(e as Error)?.message || 'The connection dropped'} before "${file.name}" started uploading. It is still here.`,
			retryable: true
		};
	}
	if (status < 200 || status >= 300 || signed?.ok !== true || !signed.path || !signed.token) {
		const message = signed?.message || signed?.error;
		if (message) return { ok: false, message, retryable: signed?.retryable ?? status >= 500 };
		const c = classifyUploadError({ status, detail: null, role: 'submission', maxBytes: CERT_EVIDENCE_MAX_BYTES });
		return { ok: false, message: c.gate === 'denied' ? DENIED : c.message, retryable: c.retryable };
	}

	// 2. PUT, straight to the bucket.
	try {
		const { error } = await supabase.storage
			.from(CERT_EVIDENCE_BUCKET)
			.uploadToSignedUrl(signed.path, signed.token, file, { contentType: CERT_EVIDENCE_CONTENT_TYPE, upsert: false });
		if (error) {
			const code = Number((error as { statusCode?: string | number }).statusCode ?? 0);
			const c = classifyUploadError({
				status: Number.isFinite(code) ? code : 0,
				detail: error.message,
				role: 'submission',
				sizeBytes: file.size,
				maxBytes: CERT_EVIDENCE_MAX_BYTES
			});
			return { ok: false, message: c.gate === 'denied' ? DENIED : c.message, retryable: c.retryable };
		}
	} catch (e) {
		return {
			ok: false,
			message: `${(e as Error)?.message || 'The connection dropped'} while "${file.name}" was uploading. It is still here.`,
			retryable: true
		};
	}

	return { ok: true, file: { path: signed.path, name: file.name, size: file.size } };
}
