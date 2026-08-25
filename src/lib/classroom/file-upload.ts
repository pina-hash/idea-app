/**
 * THE ONE UPLOAD PATH, FOR BOTH SIDES OF THE CLASSROOM.
 *
 * An instructor attaching a handout to an item and a student handing in a CAD
 * assembly are the same three steps against different rows, so they are the
 * same function with a `role`. They used to be two: a multipart POST in
 * `transports.uploadAttachment` and another in `transports.uploadSubmissionFile`,
 * which is how the student side ended up with a `for` loop that abandoned every
 * remaining file on the first failure while the instructor side collected them
 * all. Two implementations of "upload a file" is two sets of failure semantics.
 *
 * THE THREE STEPS, AND WHY THE ORDER IS THIS ORDER:
 *
 *   1. SIGN. Ask our own server for a signed upload URL. The server decides
 *      WHETHER (storage RLS, on the caller's own session) and WHERE (the key,
 *      built from the owning row's id and a fresh uuid). The filename is sent
 *      for its EXTENSION only and never becomes a path.
 *   2. PUT. The browser writes the bytes straight to Supabase. Our server is
 *      not in this request. This is the step that makes a 60 MB file possible
 *      at all, and the step whose progress is worth showing.
 *   3. RECORD. Tell our server the object landed, so the row exists. The RPC
 *      re-checks the caller AND that the key names the row it is being hung
 *      off, so step 2 succeeding does not by itself attach anything.
 *
 * A FAILURE AT ANY STEP LEAVES THE FILE STAGED AND NAMES ITS OWN GATE. Nothing
 * here throws for an ordinary refusal -- a refusal is a value, because the
 * caller is uploading several files and one of them being refused must not
 * discard the others' results.
 */

import { putFileWithProgress } from '$lib/classroom/upload-progress';
import {
	classifyUploadError,
	tooLarge,
	type UploadGate,
	type UploadRefusal,
	type UploadRole
} from '$lib/classroom/upload-errors';

/**
 * 200 MiB. The CLIENT copy of the bucket limit, so a hopeless pick is refused
 * before anybody waits; the boundary is `file_size_limit` on the bucket itself
 * (0133) and cannot be talked past from here.
 */
export const CLASSROOM_UPLOAD_MAX_BYTES = 209715200;

/** ALWAYS this. Never `file.type` -- see $lib/server/classroom-attachments. */
export const CLASSROOM_UPLOAD_CONTENT_TYPE = 'application/octet-stream';

export interface UploadedFileRow {
	id?: string;
	submission_id?: string;
	block_id?: string | null;
	caption?: string | null;
	filename?: string;
	mime_type?: string;
	size_bytes?: number | null;
}

export type UploadOutcome =
	| { ok: true; storageKey: string; row?: UploadedFileRow }
	| ({ ok: false } & UploadRefusal);

export interface UploadRequest {
	role: UploadRole;
	/** The canonical item id, on BOTH sides. The submission id is resolved
	 *  server-side for a hand-in, never sent from here. */
	itemId: string;
	file: File;
	/** imageZone block, submissions only. */
	blockId?: string | null;
	caption?: string | null;
	onProgress?: (fraction: number) => void;
}

/**
 * The endpoints, keyed by role. A pair rather than a string built from the
 * role, so a typo is a type error and grepping for the route finds the caller.
 */
const ENDPOINTS: Record<UploadRole, { sign: string; record: string }> = {
	attachment: {
		sign: '/api/classroom/attachment/sign',
		record: '/api/classroom/attachment'
	},
	submission: {
		sign: '/api/classroom/submission-file/sign',
		record: '/api/classroom/submission-file'
	},
	/**
	 * The answer-key path (0135). A THIRD pair of routes rather than a flag on
	 * `attachment`, because they write a different TABLE into a different BUCKET
	 * under a different read rule -- `classroom_can_read_instructor_material`,
	 * which is manager-only and is exactly why instructor-only material could not
	 * share the `classroom-attachments` prefix in 0133. Everything above this
	 * constant is identical for all three: same three steps, same refusals, same
	 * words, same 200 MiB.
	 */
	instructor: {
		sign: '/api/classroom/instructor-attachment/sign',
		record: '/api/classroom/instructor-attachment'
	}
};

interface SignResponse {
	ok?: boolean;
	bucket?: string;
	key?: string;
	token?: string;
	signed_url?: string;
	submission_id?: string;
	error?: string;
	gate?: UploadGate;
	retryable?: boolean;
	reason?: string;
}

async function postJson(url: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> | null }> {
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	let parsed: Record<string, unknown> | null = null;
	try {
		parsed = (await res.json()) as Record<string, unknown>;
	} catch {
		parsed = null;
	}
	return { status: res.status, body: parsed };
}

/**
 * A refusal our own route already worded. Passed through VERBATIM rather than
 * re-classified: the sign endpoint has the storage error and the role in front
 * of it and has already named the gate, and a second opinion formed from an
 * HTTP status is strictly worse information.
 */
function refusalFrom(payload: SignResponse | null, status: number, role: UploadRole): UploadRefusal {
	if (payload?.error) {
		return {
			gate: payload.gate ?? 'server',
			message: payload.error,
			retryable: payload.retryable ?? status >= 500
		};
	}
	return classifyUploadError({
		status,
		detail: null,
		role,
		maxBytes: CLASSROOM_UPLOAD_MAX_BYTES
	});
}

export async function uploadClassroomFile(req: UploadRequest): Promise<UploadOutcome> {
	const { role, itemId, file } = req;
	const endpoints = ENDPOINTS[role];

	// Step 0, which is not a step so much as arithmetic: a file over the bucket
	// limit is never going to land, so say so now rather than after a round trip.
	if (file.size > CLASSROOM_UPLOAD_MAX_BYTES) {
		return { ok: false, ...tooLarge(file.size, CLASSROOM_UPLOAD_MAX_BYTES) };
	}
	if (file.size === 0) {
		return {
			ok: false,
			gate: 'server',
			message: `"${file.name}" is empty (0 bytes), so there is nothing to upload.`,
			retryable: false
		};
	}

	// ---- 1. SIGN ----
	let sign: { status: number; body: Record<string, unknown> | null };
	try {
		sign = await postJson(endpoints.sign, {
			item_id: itemId,
			filename: file.name,
			size_bytes: file.size
		});
	} catch (e) {
		return {
			ok: false,
			gate: 'network',
			message: `${(e as Error).message || 'The connection dropped'} before "${file.name}" started uploading. It is still here.`,
			retryable: true
		};
	}
	const signed = sign.body as SignResponse | null;
	if (sign.status < 200 || sign.status >= 300 || signed?.ok !== true || !signed.signed_url || !signed.key) {
		return { ok: false, ...refusalFrom(signed, sign.status, role) };
	}

	// ---- 2. PUT. Our server is not in this request. ----
	let put: { status: number; body: Record<string, unknown> | null };
	try {
		put = await putFileWithProgress(
			signed.signed_url,
			file,
			CLASSROOM_UPLOAD_CONTENT_TYPE,
			req.onProgress
		);
	} catch (e) {
		return {
			ok: false,
			gate: 'network',
			message: `${(e as Error).message || 'The connection dropped'} while "${file.name}" was uploading. It is still here -- save again to send it.`,
			retryable: true
		};
	}
	if (put.status < 200 || put.status >= 300) {
		// THE ONE PLACE AN EXPIRED SIGNED URL SURFACES, and the reason
		// classifyUploadError exists: storage answers a stale token with a 400
		// and a jwt complaint, which reads as "your file is broken" unless
		// somebody translates it.
		const detail =
			(put.body?.message as string | undefined) ??
			(put.body?.error as string | undefined) ??
			null;
		return {
			ok: false,
			...classifyUploadError({
				status: put.status,
				detail,
				role,
				sizeBytes: file.size,
				maxBytes: CLASSROOM_UPLOAD_MAX_BYTES
			})
		};
	}

	// ---- 3. RECORD ----
	let record: { status: number; body: Record<string, unknown> | null };
	try {
		record = await postJson(endpoints.record, {
			item_id: itemId,
			storage_key: signed.key,
			filename: file.name,
			size_bytes: file.size,
			...(role === 'submission' ? { block_id: req.blockId ?? null, caption: req.caption ?? null } : {})
		});
	} catch (e) {
		return {
			ok: false,
			gate: 'network',
			message:
				`"${file.name}" uploaded, but the connection dropped before it could be recorded ` +
				`(${(e as Error).message || 'no detail'}). Save again to finish it.`,
			retryable: true
		};
	}
	const recorded = record.body as
		| { ok?: boolean; error?: string; reason?: string; file?: UploadedFileRow }
		| null;
	if (record.status < 200 || record.status >= 300 || recorded?.ok !== true) {
		if (recorded?.reason === 'locked') {
			return {
				ok: false,
				gate: 'denied',
				message: 'This is turned in, so files are locked. Unsubmit it to keep working.',
				retryable: false
			};
		}
		if (recorded?.reason === 'approval_pending') {
			return {
				ok: false,
				gate: 'denied',
				message: 'That part of the assignment needs instructor approval before files can go on it.',
				retryable: false
			};
		}
		return {
			ok: false,
			gate: 'denied',
			message:
				recorded?.error ??
				`"${file.name}" uploaded but was refused when it was recorded (HTTP ${record.status}).`,
			retryable: false
		};
	}

	return { ok: true, storageKey: signed.key, row: recorded.file };
}
