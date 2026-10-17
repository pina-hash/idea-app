import { json } from '@sveltejs/kit';
import { CLASSROOM_ATTACHMENTS_BUCKET, storageObjectKey } from '$lib/server/classroom-attachments';
import { classifyUploadError, tooLarge } from '$lib/classroom/upload-errors';
import { THUMBNAIL_RASTER_RE, THUMBNAIL_UPLOAD_MAX_BYTES } from '$lib/classroom/thumbnail';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * MINTS A SIGNED UPLOAD URL FOR ONE POST'S THUMBNAIL PICTURE (0268, ledger
 * 0396). IT NEVER SEES THE BYTES.
 *
 * The attachment sign route's shape, for the same reasons (read its header):
 * the URL is minted on the CALLER'S OWN session, so storage evaluates 0133's
 * insert policy (`_classroom_manages_item` on the key's first segment) before
 * it will mint anything, and the key is built here from the item id and a
 * fresh uuid, never chosen by the caller. The bucket is `classroom-attachments`
 * and the prefix is the item's, so the picture is readable by exactly who can
 * read the post, through the policy that already says so.
 *
 * WHAT IS DIFFERENT IS WHAT IT ACCEPTS: a thumbnail is a picture a browser can
 * draw, so the name has to end in one of `THUMBNAIL_RASTER_RE`'s extensions,
 * and the size is `THUMBNAIL_UPLOAD_MAX_BYTES`. Both refusals are sentences;
 * the record step (`POST /api/classroom/thumbnail`) asks the database the same
 * two questions again.
 *
 * Body (JSON): item_id (uuid), filename (extension only), size_bytes.
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
	if (!THUMBNAIL_RASTER_RE.test(filename)) {
		return json(
			{
				ok: false,
				gate: 'server',
				retryable: false,
				error: 'A thumbnail has to be a PNG, JPEG, GIF, WebP, AVIF or BMP picture.'
			},
			{ status: 200 }
		);
	}
	const size = Number(body.size_bytes ?? 0);
	if (Number.isFinite(size) && size > THUMBNAIL_UPLOAD_MAX_BYTES) {
		const refusal = tooLarge(size, THUMBNAIL_UPLOAD_MAX_BYTES);
		return json({ ok: false, ...refusal, error: refusal.message }, { status: 413 });
	}

	const key = storageObjectKey(itemId, filename);
	const { data, error } = await supabase.storage.from(CLASSROOM_ATTACHMENTS_BUCKET).createSignedUploadUrl(key);
	if (error || !data) {
		const status = Number((error as { statusCode?: string | number } | null)?.statusCode ?? 403);
		const refusal = classifyUploadError({
			status: Number.isFinite(status) ? status : 403,
			detail: error?.message,
			role: 'thumbnail',
			sizeBytes: Number.isFinite(size) && size > 0 ? size : undefined,
			maxBytes: THUMBNAIL_UPLOAD_MAX_BYTES
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
