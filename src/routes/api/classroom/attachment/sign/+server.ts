import { json } from '@sveltejs/kit';
import {
	CLASSROOM_ATTACHMENTS_BUCKET,
	MAX_STORAGE_BYTES,
	storageObjectKey
} from '$lib/server/classroom-attachments';
import { classifyUploadError, tooLarge } from '$lib/classroom/upload-errors';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * MINTS A SIGNED UPLOAD URL FOR ONE CLASSROOM ATTACHMENT. IT NEVER SEES THE
 * BYTES.
 *
 * This is the whole point of the 0133 bundle. The old route took a
 * multipart/form-data POST, buffered the entire file into the serverless
 * function's memory, and pushed it out again to Drive -- which is why
 * attachments were capped at 4 MiB and why a 60 MB assembly was not a thing a
 * student could hand in. The browser now writes straight into a private bucket
 * and this route only decides WHETHER it may and WHERE it goes.
 *
 * AUTHORIZATION IS STORAGE'S OWN RLS, ASKED HERE RATHER THAN RESTATED HERE.
 * `createSignedUploadUrl` is called on the CALLER'S OWN cookie session, so
 * storage-api evaluates 0133's insert policy against this key before it will
 * mint anything -- which asks `_classroom_manages_item` about the first path
 * segment. There is no service-role client in this file and there must not be:
 * the moment one appears, this route becomes the authorization boundary
 * instead of the database, and it will get it wrong on some later Tuesday.
 *
 * THE KEY IS BUILT SERVER-SIDE AND IS NOT A PARAMETER. A caller who could
 * choose their own key could choose another item's prefix; the RLS policy
 * would catch that, but so would not offering it in the first place. The
 * filename the caller sends is used ONLY for its extension and is never a path.
 *
 * The signed URL is not the last word on anything either. It authorizes ONE
 * PUT to ONE key; the ROW that makes the object an attachment is written by
 * POST /api/classroom/attachment afterwards, and that RPC re-checks the item,
 * the caller's rights, and that the key names this item.
 *
 * Body (JSON):
 *   item_id     uuid of the canonical item (required)
 *   filename    the browser's name for the file (required; extension only)
 *   size_bytes  so an oversize pick is refused before anybody waits (optional)
 */

export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ ok: false, error: 'You must be signed in.' }, { status: 401 });
	}

	let body: { item_id?: unknown; filename?: unknown; size_bytes?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return json({ ok: false, error: 'Expected a JSON body.' }, { status: 400 });
	}

	const itemId = String(body.item_id ?? '').trim();
	if (!UUID_RE.test(itemId)) {
		return json({ ok: false, error: 'item_id must be a uuid.' }, { status: 400 });
	}
	const filename = String(body.filename ?? '').trim();
	if (!filename) {
		return json({ ok: false, error: 'filename is required.' }, { status: 400 });
	}

	// Refused here as well as by the bucket, so a person who picked a 300 MB
	// file is told in the first round trip instead of after the upload.
	const size = Number(body.size_bytes ?? 0);
	if (Number.isFinite(size) && size > MAX_STORAGE_BYTES) {
		const refusal = tooLarge(size, MAX_STORAGE_BYTES);
		return json({ ok: false, ...refusal, error: refusal.message }, { status: 413 });
	}

	const key = storageObjectKey(itemId, filename);
	const { data, error } = await supabase.storage
		.from(CLASSROOM_ATTACHMENTS_BUCKET)
		.createSignedUploadUrl(key);

	if (error || !data) {
		const status = Number((error as { statusCode?: string | number } | null)?.statusCode ?? 403);
		const refusal = classifyUploadError({
			status: Number.isFinite(status) ? Number(status) : 403,
			detail: error?.message,
			role: 'attachment',
			sizeBytes: Number.isFinite(size) && size > 0 ? size : undefined,
			maxBytes: MAX_STORAGE_BYTES
		});
		return json({ ok: false, ...refusal, error: refusal.message }, { status: 200 });
	}

	return json({
		ok: true,
		bucket: CLASSROOM_ATTACHMENTS_BUCKET,
		key: data.path,
		token: data.token,
		signed_url: data.signedUrl
	});
};
