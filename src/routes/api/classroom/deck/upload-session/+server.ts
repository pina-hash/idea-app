import { json } from '@sveltejs/kit';
import { driveConfigured, startResumableUpload } from '$lib/server/notebook-drive';
import {
	DECK_LIMITS,
	DECK_ZIP_MIME,
	deckUploadName,
	deckUploadsFolderId
} from '$lib/server/classroom-decks';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * Opens (POST) or abandons (DELETE) one direct-to-Drive deck upload.
 *
 * WHY THE BYTES DO NOT COME THROUGH HERE. A serverless request body is capped
 * at ~4.5 MB on Vercel and a real Claude Design export is 23.5 MB of kept
 * files, so the old multipart route failed at the platform before any of our
 * code ran. The browser uploads to Drive directly instead and hands
 * /api/classroom/deck only the resulting file id.
 *
 * WHAT THIS HANDS BACK is a Google resumable upload session URI: a credential
 * good for exactly one thing, writing bytes into the ONE file whose name, type
 * and parent were fixed HERE. It is not the refresh token, not an access token,
 * and cannot read, overwrite or delete anything else in the shared drive. The
 * one honest caveat is its lifetime: the Drive API has no way to set a session
 * URI's TTL, and Google keeps them for about a week -- so the app-side window
 * that actually bounds this flow is the upload SLOT in 0102, which expires in
 * two hours and can be spent exactly once.
 *
 * AUTHORIZATION IS THE RPC'S. classroom_deck_upload_start runs under the
 * caller's own cookie session and re-checks _classroom_manages_item -- teacher
 * of record for EVERY class the item is posted to, the same bar attaching a
 * file takes. The 401 below is only so an anonymous caller never reaches Drive.
 * It is asked AGAIN at ingest, because a large upload takes long enough for a
 * teacher to lose a section while it runs.
 *
 * JSON body (POST):
 *   item_id     uuid of the canonical item (required)
 *   size_bytes  the zip's size, so an over-cap upload is refused before it
 *               starts rather than after 150 MB of school wifi (required)
 */

export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ error: 'You must be signed in.' }, { status: 401 });
	}
	if (!driveConfigured()) {
		return json({ error: 'Deck upload is not configured on this deployment.' }, { status: 503 });
	}

	const body = (await request.json().catch(() => null)) as
		| { item_id?: unknown; size_bytes?: unknown }
		| null;
	const itemId = String(body?.item_id ?? '').trim();
	if (!UUID_RE.test(itemId)) {
		return json({ error: 'item_id must be a uuid.' }, { status: 400 });
	}
	const size = Number(body?.size_bytes ?? 0);
	if (!Number.isFinite(size) || size <= 0) {
		return json({ error: 'size_bytes must be the zip size in bytes.' }, { status: 400 });
	}
	if (size > DECK_LIMITS.maxZipBytes) {
		return json(
			{
				error: `Deck uploads are capped at ${Math.floor(DECK_LIMITS.maxZipBytes / 1024 / 1024)} MB.`
			},
			{ status: 413 }
		);
	}

	const { data, error } = await supabase.rpc('classroom_deck_upload_start', { p_item_id: itemId });
	if (error) {
		return json({ error: error.message }, { status: 400 });
	}
	const slot = (data ?? {}) as { upload_id?: string; expires_at?: string };
	if (!slot.upload_id) {
		return json({ error: 'Could not authorize that upload.' }, { status: 400 });
	}

	// Only NOW does anything reach Google, and only for a caller the database
	// has already said may replace this item's deck.
	let uploadUrl: string;
	try {
		uploadUrl = await startResumableUpload({
			filename: deckUploadName(slot.upload_id),
			mimeType: DECK_ZIP_MIME,
			parentId: await deckUploadsFolderId(),
			sizeBytes: size
		});
	} catch (e) {
		// The slot is left to expire on its own: it authorizes nothing by
		// itself, and cancelling it here would only hide the real failure.
		return json({ error: (e as Error).message || 'Drive upload session failed.' }, { status: 502 });
	}

	return json({
		ok: true,
		upload_id: slot.upload_id,
		upload_url: uploadUrl,
		// Handed BACK rather than assumed by the browser: every chunk PUT carries
		// this exact value, so it can never contradict the X-Upload-Content-Type
		// the session above was opened with. See DECK_ZIP_MIME.
		content_type: DECK_ZIP_MIME,
		expires_at: slot.expires_at ?? null
	});
};

/**
 * Closes an unspent slot after the browser gives up.
 *
 * There is nothing on Drive to clean: a resumable session that never finished
 * has produced no file at all, and the browser DELETEs the session URI itself
 * to make Google discard the partial transfer. This only stops a slot sitting
 * open for its two hours. Quiet by design -- someone who has already navigated
 * away cannot act on a failure here.
 */
export const DELETE: RequestHandler = async ({ url, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ error: 'You must be signed in.' }, { status: 401 });
	}
	const uploadId = (url.searchParams.get('upload_id') ?? '').trim();
	if (!UUID_RE.test(uploadId)) {
		return json({ error: 'upload_id must be a uuid.' }, { status: 400 });
	}
	const { error } = await supabase.rpc('classroom_deck_upload_cancel', { p_upload_id: uploadId });
	if (error) {
		return json({ error: error.message }, { status: 400 });
	}
	return json({ ok: true });
};
