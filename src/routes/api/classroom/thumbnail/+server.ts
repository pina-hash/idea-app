import { json } from '@sveltejs/kit';
import { CLASSROOM_ATTACHMENTS_BUCKET } from '$lib/server/classroom-attachments';
import { classifyRpcError } from '$lib/classroom/upload-errors';
import { THUMBNAILS_UNAVAILABLE, readItemThumbnail } from '$lib/classroom/thumbnail';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * RECORDS AN UPLOADED PICTURE AS A POST'S THUMBNAIL (0268, ledger 0396): the
 * third step of the one classroom upload path for role `thumbnail`.
 *
 * AUTHORIZATION IS THE RPC'S. `classroom_set_item_thumbnail` runs on the
 * caller's own session, asks `_classroom_manages_item`, and checks that the
 * key's prefix IS this item and that it names a picture, so a key minted for
 * one post cannot become another's thumbnail. The 401 only keeps an anonymous
 * caller out of the RPC. A refusal answers 200 with `ok: false` and the upload
 * vocabulary's sentence (`classifyRpcError`), as the attachment record route
 * does, and sweeps the object the refused row would have named.
 *
 * Body (JSON): item_id, storage_key, and the natural size (width, height) and
 * focal point (focal_x, focal_y) the editor measured.
 */
export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ ok: false, error: 'You must be signed in.' }, { status: 401 });
	}
	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return json({ ok: false, error: 'Expected a JSON body.' }, { status: 400 });
	}
	const itemId = String(body.item_id ?? '').trim();
	if (!UUID_RE.test(itemId)) {
		return json({ ok: false, error: 'item_id must be a uuid.' }, { status: 400 });
	}
	const key = String(body.storage_key ?? '').trim();
	if (!key.startsWith(`${itemId}/`) || key.length > 400) {
		return json({ ok: false, error: 'storage_key must name this post.' }, { status: 400 });
	}
	const whole = (v: unknown): number | null => {
		const n = Number(v);
		return v != null && Number.isFinite(n) && n >= 1 ? Math.round(n) : null;
	};
	const fraction = (v: unknown): number => {
		const n = Number(v);
		return v != null && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5;
	};

	const { data, error } = await supabase.rpc('classroom_set_item_thumbnail', {
		p_item_id: itemId,
		p_source: 'image',
		p_image_key: key,
		p_attachment_id: null,
		p_width: whole(body.width),
		p_height: whole(body.height),
		p_focal_x: fraction(body.focal_x),
		p_focal_y: fraction(body.focal_y)
	});
	if (error) {
		// The row was refused, so the picture it points at is now unreferenced.
		// Swept under the caller's OWN session, the attachment record route's
		// rule: 0133's delete policy admits exactly who could have written it.
		await supabase.storage.from(CLASSROOM_ATTACHMENTS_BUCKET).remove([key]);
		const code = (error as { code?: string }).code;
		if (code === 'PGRST202') {
			return json({ ok: false, gate: 'server', retryable: false, error: THUMBNAILS_UNAVAILABLE }, { status: 200 });
		}
		// A transient conflict is retryable and a considered refusal is said in
		// its own words, through the one classroom upload vocabulary.
		const refusal = classifyRpcError({ code, message: error.message, role: 'thumbnail' });
		return json({ ok: false, ...refusal, error: refusal.message }, { status: 200 });
	}
	const thumbnail = readItemThumbnail((data as { thumbnail?: unknown } | null)?.thumbnail ?? null);
	return json({ ok: true, thumbnail });
};
