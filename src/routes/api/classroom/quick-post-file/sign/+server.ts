import { json } from '@sveltejs/kit';
import { QUICK_POST_FILES_BUCKET, storageObjectKey } from '$lib/server/classroom-attachments';
import { classifyUploadError, tooLarge } from '$lib/classroom/upload-errors';
import { QUICK_POST_FILE_MAX_BYTES } from '$lib/classroom/quick-posts';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * MINTS A SIGNED UPLOAD URL FOR ONE FILE ON A CLASS NOTICE (0233, ledger 0368).
 * IT NEVER SEES THE BYTES. The attachment sign route's shape, for the fourth
 * upload role.
 *
 * AUTHORIZATION IS STORAGE'S OWN RLS, ASKED HERE RATHER THAN RESTATED.
 * `createSignedUploadUrl` runs on the CALLER'S OWN session, so storage-api
 * evaluates 0233's insert policy against this key before it mints anything,
 * and that policy asks whether the caller wrote the notice the first path
 * segment names and whether it is still up. There is no service-role client
 * here and there must not be.
 *
 * THE KEY IS BUILT HERE AND IS NOT A PARAMETER: `<notice id>/<uuid>.<ext>`,
 * with the id LOWERCASED, because 0233's record function and the table's
 * check read the key case-sensitively and a client that sent the id in
 * capitals would otherwise upload bytes nothing could ever record.
 *
 * THE SIZE IS REFUSED HERE, BEFORE A BYTE MOVES, against the bucket's own
 * 45 MiB: the shared uploader's browser guard is the other buckets' 200 MB.
 *
 * Body (JSON): item_id (the notice's uuid), filename (extension only),
 * size_bytes.
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

	const postId = String(body.item_id ?? '').trim().toLowerCase();
	if (!UUID_RE.test(postId)) {
		return json({ ok: false, error: 'item_id must be a uuid.' }, { status: 400 });
	}
	const filename = String(body.filename ?? '').trim();
	if (!filename) {
		return json({ ok: false, error: 'filename is required.' }, { status: 400 });
	}

	const size = Number(body.size_bytes ?? 0);
	if (Number.isFinite(size) && size > QUICK_POST_FILE_MAX_BYTES) {
		const refusal = tooLarge(size, QUICK_POST_FILE_MAX_BYTES);
		return json({ ok: false, ...refusal, error: refusal.message }, { status: 413 });
	}

	const key = storageObjectKey(postId, filename).toLowerCase();
	const { data, error } = await supabase.storage.from(QUICK_POST_FILES_BUCKET).createSignedUploadUrl(key);

	if (error || !data) {
		const status = Number((error as { statusCode?: string | number } | null)?.statusCode ?? 403);
		const refusal = classifyUploadError({
			status: Number.isFinite(status) ? Number(status) : 403,
			detail: error?.message,
			role: 'quick-post',
			sizeBytes: Number.isFinite(size) && size > 0 ? size : undefined,
			maxBytes: QUICK_POST_FILE_MAX_BYTES
		});
		return json({ ok: false, ...refusal, error: refusal.message }, { status: 200 });
	}

	return json({
		ok: true,
		bucket: QUICK_POST_FILES_BUCKET,
		key: data.path,
		token: data.token,
		signed_url: data.signedUrl
	});
};
