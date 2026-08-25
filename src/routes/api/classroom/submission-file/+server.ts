import { json } from '@sveltejs/kit';
import { MAX_STORAGE_BYTES, SUBMISSION_FILES_BUCKET } from '$lib/server/classroom-attachments';
import { classifyRpcError } from '$lib/classroom/upload-errors';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * RECORDS ONE ALREADY-UPLOADED FILE AGAINST THE CALLER'S OWN SUBMISSION.
 *
 * The student half of /api/classroom/attachment, the same shape throughout,
 * and -- since 0133 -- with the bytes nowhere near it. ./sign opened the
 * submission and minted a signed URL under `<submission_id>/`; the browser PUT
 * the file; this writes the row.
 *
 * AUTHORIZATION IS THE RPC'S. `classroom_add_submission_file` resolves the
 * caller from their own session (there is no email parameter to forge),
 * requires active enrollment in a class the PUBLISHED assignment is posted to,
 * refuses a locked submission, validates an imageZone block id against the
 * spec, and re-checks that the storage key's prefix is the caller's OWN
 * submission id -- so a key minted for one submission cannot be recorded
 * against another.
 *
 * Body (JSON):
 *   item_id      uuid of the assignment (required)
 *   storage_key  the key ./sign handed out (required)
 *   filename     the ORIGINAL name, verbatim (required)
 *   size_bytes   optional
 *   block_id     imageZone block this belongs to (optional)
 *   caption      caption for an imageZone file (optional)
 */

export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ ok: false, error: 'You must be signed in.' }, { status: 401 });
	}

	let body: {
		item_id?: unknown;
		storage_key?: unknown;
		filename?: unknown;
		size_bytes?: unknown;
		block_id?: unknown;
		caption?: unknown;
	};
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return json({ ok: false, error: 'Expected a JSON body.' }, { status: 400 });
	}

	const itemId = String(body.item_id ?? '').trim();
	if (!UUID_RE.test(itemId)) {
		return json({ ok: false, error: 'item_id must be a uuid.' }, { status: 400 });
	}
	const storageKey = String(body.storage_key ?? '').trim();
	// The submission id is not known to this route (./sign resolved it), so the
	// shape check here is only that the key IS a `<uuid>/...` under this bucket.
	// The authoritative check -- that it is the caller's own submission -- is
	// the RPC's, against the submission it resolves for itself.
	if (!/^[0-9a-f-]{36}\//i.test(storageKey) || storageKey.length > 400) {
		return json({ ok: false, error: 'storage_key is not a submission key.' }, { status: 400 });
	}

	const filename = String(body.filename ?? '').trim().slice(0, 300) || 'file';
	const rawSize = Number(body.size_bytes ?? 0);
	const sizeBytes = Number.isFinite(rawSize) && rawSize > 0 ? Math.min(rawSize, MAX_STORAGE_BYTES) : null;
	const blockId = String(body.block_id ?? '').trim() || null;
	const caption = String(body.caption ?? '').trim() || null;

	const { data, error } = await supabase.rpc('classroom_add_submission_file', {
		p_item_id: itemId,
		p_drive_file_id: null,
		p_filename: filename,
		p_mime_type: 'application/octet-stream',
		p_size_bytes: sizeBytes,
		p_block_id: blockId,
		p_caption: caption,
		p_storage_key: storageKey
	});

	if (error) {
		await supabase.storage.from(SUBMISSION_FILES_BUCKET).remove([storageKey]);
		const refusal = classifyRpcError({
			code: (error as { code?: string }).code,
			message: error.message,
			role: 'submission'
		});
		return json({ ok: false, ...refusal, error: refusal.message }, { status: 200 });
	}

	const result = data as { ok?: boolean; reason?: string; file_id?: string; submission_id?: string };
	if (result?.ok === false) {
		// A structured refusal (locked / approval_pending): nothing was written,
		// so the object it would have pointed at goes too.
		await supabase.storage.from(SUBMISSION_FILES_BUCKET).remove([storageKey]);
		return json({ ok: false, reason: result.reason ?? 'refused' });
	}

	return json({
		ok: true,
		file: {
			id: result.file_id,
			submission_id: result.submission_id,
			block_id: blockId,
			caption,
			filename,
			mime_type: 'application/octet-stream',
			size_bytes: sizeBytes
		}
	});
};
