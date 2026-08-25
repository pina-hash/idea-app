import { json } from '@sveltejs/kit';
import { CLASSROOM_ATTACHMENTS_BUCKET, MAX_STORAGE_BYTES } from '$lib/server/classroom-attachments';
import { classifyRpcError } from '$lib/classroom/upload-errors';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * RECORDS ONE ALREADY-UPLOADED ATTACHMENT AGAINST ONE CANONICAL ITEM.
 *
 * THE BYTES ARE NOT HERE AND WILL NEVER BE HERE AGAIN. This route used to
 * accept a multipart POST, buffer the file whole, and forward it to Google
 * Drive -- so the ceiling on a classroom handout was Vercel's request-body
 * limit rather than anything to do with teaching. Since 0133 the browser PUTs
 * the bytes straight into the private `classroom-attachments` bucket against a
 * signed URL minted by ./sign, and all that is left here is the ROW.
 *
 * THE ORDER IS REVERSED FROM THE OLD ONE, and it has to be: the key names the
 * item, so the object goes up first and the row follows. A signed upload that
 * lands and is never recorded leaves an object nothing points at -- which is a
 * bounded, sweepable cost, and much the better failure than a row pointing at
 * bytes that are not there.
 *
 * AUTHORIZATION IS THE RPC'S, not this route's. `classroom_add_attachment`
 * runs under the caller's own cookie session, re-checks that they manage every
 * class the item is posted to, and re-checks that the storage key's own prefix
 * IS this item -- so a caller holding a key minted for one item cannot hang it
 * off another. The 401 below only keeps an anonymous caller out of the RPC.
 *
 * Body (JSON):
 *   item_id      uuid of the canonical item (required)
 *   storage_key  the key ./sign handed out and the browser wrote to (required)
 *   filename     the ORIGINAL name, verbatim, kept for display (required)
 *   size_bytes   what the browser reported (optional)
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
	// The shape check here is cheap and stops an obviously wrong key before it
	// reaches the database; the AUTHORITATIVE check is the RPC's, which compares
	// the prefix against the item it is being attached to.
	if (!storageKey.startsWith(`${itemId}/`) || storageKey.length > 400) {
		return json(
			{ ok: false, error: 'storage_key must name this item.' },
			{ status: 400 }
		);
	}

	const filename = String(body.filename ?? '').trim().slice(0, 300) || 'attachment';
	const rawSize = Number(body.size_bytes ?? 0);
	const sizeBytes = Number.isFinite(rawSize) && rawSize > 0 ? Math.min(rawSize, MAX_STORAGE_BYTES) : null;

	const { data, error } = await supabase.rpc('classroom_add_attachment', {
		p_item_id: itemId,
		p_drive_file_id: null,
		p_filename: filename,
		// ALWAYS octet-stream. Never `file.type`: it is a guess the uploader
		// chose, and this column is read when a badge is drawn.
		p_mime_type: 'application/octet-stream',
		p_size_bytes: sizeBytes,
		p_storage_key: storageKey
	});

	if (error) {
		// The row was refused, so the object it points at is now unreferenced.
		// Sweep it under the caller's OWN session -- 0133's delete policy admits
		// exactly the people who could have written it, so this can never remove
		// somebody else's object.
		await supabase.storage.from(CLASSROOM_ATTACHMENTS_BUCKET).remove([storageKey]);
		const refusal = classifyRpcError({
			code: (error as { code?: string }).code,
			message: error.message,
			role: 'attachment'
		});
		return json({ ok: false, ...refusal, error: refusal.message }, { status: 200 });
	}

	return json({ ok: true, storage_key: storageKey, result: data });
};
