import { randomUUID } from 'node:crypto';
import { classifyUploadError, tooLarge, type UploadRefusal } from '$lib/classroom/upload-errors';
import { downloadFilename } from '$lib/download-name';
import { PORTAL_UPLOAD_MAX_BYTES } from '$lib/upload-limits';

/**
 * PROJECT EVIDENCE FILES (ledger 0391): the `cert-evidence` bucket, private,
 * 45 MiB a file (PORTAL_UPLOAD_MAX_BYTES, the registry's portal ceiling: the
 * project holds every bucket under the 50,000,000-byte global), keyed `<attempt_id>/<uuid>.<ext>` (0261). The classroom's
 * file rules apply unchanged: the bytes go browser to bucket against a signed
 * upload URL this server mints, come back through a short signed download URL
 * carrying `download=<ascii name>` (never inline), nothing a person typed is in
 * a key, and the storage policy, reading the attempt id off the first path
 * segment, is the real gate. This module is the pure half the two evidence
 * routes share.
 */

export const CERT_EVIDENCE_BUCKET = 'cert-evidence';
export const CERT_EVIDENCE_MAX_BYTES = PORTAL_UPLOAD_MAX_BYTES;
/** Seconds a download link lives. */
export const CERT_EVIDENCE_DOWNLOAD_TTL = 300;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/** `<attempt uuid>/<file uuid>[.<ext>]`, the only key shape the bucket holds. */
export const EVIDENCE_PATH_RE = new RegExp(`^${UUID}/${UUID}(\\.[a-z0-9]{1,12})?$`, 'i');

/** The lowercased extension without its dot, bounded, or '' (the classroom rule). */
export function evidenceExtension(filename: string | null | undefined): string {
	const m = (filename ?? '').toLowerCase().match(/\.([a-z0-9]{1,12})$/);
	return m ? m[1] : '';
}

export function evidencePath(attemptId: string, filename: string, uuid: string = randomUUID()): string {
	const ext = evidenceExtension(filename);
	return `${attemptId}/${uuid}${ext ? `.${ext}` : ''}`;
}

/** The size refusal, stating the size and the limit, before any transfer. */
export function evidenceTooLarge(size: number): UploadRefusal | null {
	return Number.isFinite(size) && size > CERT_EVIDENCE_MAX_BYTES ? tooLarge(size, CERT_EVIDENCE_MAX_BYTES) : null;
}

const DENIED =
	'Storage refused this file because of who is asking. Evidence can only go on your own open attempt; if it was withdrawn or completed while this was uploading, that is what changed.';

/** Storage's refusal in the classroom vocabulary, with the denial worded for an attempt. */
export function evidenceUploadRefusal(status: number, detail: string | null | undefined, size?: number): UploadRefusal {
	const refusal = classifyUploadError({
		status,
		detail,
		role: 'submission',
		sizeBytes: Number.isFinite(size) && (size as number) > 0 ? size : undefined,
		maxBytes: CERT_EVIDENCE_MAX_BYTES
	});
	return refusal.gate === 'denied' ? { ...refusal, message: DENIED } : refusal;
}

/** The `download=` value: the shown name folded to ASCII, else the key's own file name. */
export function evidenceDownloadName(path: string, shownName: string | null | undefined): string {
	const fallback = path.split('/').pop() ?? 'evidence';
	return downloadFilename(shownName?.trim() || fallback);
}
