import { json } from '@sveltejs/kit';
import {
	INSTRUCTOR_ATTACHMENTS_BUCKET,
	MAX_STORAGE_BYTES,
	storageObjectKey
} from '$lib/server/classroom-attachments';
import { classifyUploadError, tooLarge } from '$lib/classroom/upload-errors';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * MINTS A SIGNED UPLOAD URL FOR ONE INSTRUCTOR-ONLY ATTACHMENT. IT NEVER SEES
 * THE BYTES.
 *
 * The exact shape of ../../attachment/sign, against 0135's third bucket. It is
 * a separate route rather than a parameter on that one because the BUCKET is
 * the boundary here: `instructor-attachments` carries its own three policies,
 * all keyed on `_classroom_manages_item`, and a route that could be asked which
 * bucket to write into would be a route that can be asked for the wrong one.
 *
 * WHAT THIS REPLACES, AND WHY IT MATTERS FOR THIS TABLE IN PARTICULAR. The old
 * instructor route took a multipart POST, buffered the whole file into the
 * function, and pushed it to Drive -- so an answer key was capped at 4 MiB and
 * filtered through a twelve-type allowlist. That is a bad ceiling for a handout
 * and an absurd one for the things instructor-only material actually is: the
 * SLDASM the assignment is built from, the full-resolution scan of the marked
 * exemplar, the setup video. Those are the files that were refused, and they
 * were refused on the one surface a student never sees.
 *
 * AUTHORIZATION IS STORAGE'S OWN RLS, ASKED HERE RATHER THAN RESTATED HERE.
 * `createSignedUploadUrl` runs on the CALLER'S OWN cookie session, so
 * storage-api evaluates 0135's insert policy against this key first -- which
 * asks `_classroom_manages_item` about the first path segment. There is no
 * service-role client in this file and there must not be.
 *
 * THE KEY IS BUILT SERVER-SIDE AND IS NOT A PARAMETER, and the filename the
 * caller sends is used for its EXTENSION only and never becomes a path.
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

	const size = Number(body.size_bytes ?? 0);
	if (Number.isFinite(size) && size > MAX_STORAGE_BYTES) {
		const refusal = tooLarge(size, MAX_STORAGE_BYTES);
		return json({ ok: false, ...refusal, error: refusal.message }, { status: 413 });
	}

	const key = storageObjectKey(itemId, filename);
	const { data, error } = await supabase.storage
		.from(INSTRUCTOR_ATTACHMENTS_BUCKET)
		.createSignedUploadUrl(key);

	if (error || !data) {
		const status = Number((error as { statusCode?: string | number } | null)?.statusCode ?? 403);
		const refusal = classifyUploadError({
			status: Number.isFinite(status) ? Number(status) : 403,
			detail: error?.message,
			role: 'instructor',
			sizeBytes: Number.isFinite(size) && size > 0 ? size : undefined,
			maxBytes: MAX_STORAGE_BYTES
		});
		return json({ ok: false, ...refusal, error: refusal.message }, { status: 200 });
	}

	return json({
		ok: true,
		bucket: INSTRUCTOR_ATTACHMENTS_BUCKET,
		key: data.path,
		token: data.token,
		signed_url: data.signedUrl
	});
};
