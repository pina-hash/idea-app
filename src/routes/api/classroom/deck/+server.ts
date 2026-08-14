import { json } from '@sveltejs/kit';
import {
	createDriveFolder,
	deleteDriveFile,
	driveConfigured,
	getDriveFileMeta,
	uploadDriveFile
} from '$lib/server/notebook-drive';
import {
	DECK_LIMITS,
	deckDriveFilename,
	deckFolderName,
	decksFolderId,
	deckUploadName,
	deckUploadsFolderId,
	driveZipSource,
	planDeck,
	readDeckFile,
	type DeckFilePlan
} from '$lib/server/classroom-decks';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * Ingests (POST) or removes (DELETE) the presentation deck on one canonical
 * classroom item.
 *
 * THE ZIP NEVER PASSES THROUGH HERE. The browser uploads it straight to Drive
 * against a session this server opened (/api/classroom/deck/upload-session,
 * 0102) and POSTs only the resulting file id -- which is what lifted deck
 * uploads off Vercel's ~4.5 MB request-body cap, a limit every real 23.5 MB
 * export died at. What this route does is unpack that staged zip and store the
 * deck, which is 0101's work unchanged: skip the standalone/template
 * renderings, keep the hidden .image-slots.state.json, refuse a traversing
 * path, upload every file to the deck's own Drive folder, record the manifest.
 *
 * A CLIENT-SUPPLIED FILE ID IS NOT TRUSTED, and two independent things have to
 * agree before a byte is read:
 *
 *   1. THE SLOT. classroom_deck_upload_claim spends the caller's own
 *      authorization row -- once, before it expires -- and hands back the item
 *      it was opened for. The ingest TARGET comes from that row, never from the
 *      request, so a claim cannot be redirected at a second item.
 *   2. THE FILE. Its Drive name and parent must be the ones this server set
 *      when it opened the session (deckUploadName, in the deck uploads folder).
 *      A resumable PUT carries bytes and a Content-Range only, so neither is
 *      something a client can produce -- which is what makes "this file id came
 *      from that upload session" checkable at all.
 *
 * A file that fails check 2 is left completely alone. Deleting it would turn a
 * forged id into a way to destroy an arbitrary file in the shared drive.
 *
 * AUTHORIZATION IS THE RPCs'. The claim re-checks _classroom_manages_item, and
 * classroom_replace_deck asks a third time when the deck actually lands --
 * deliberately, because a 150 MB upload takes long enough for a teacher to lose
 * a section while it runs. The 401 below is only so an anonymous caller never
 * reaches Drive.
 *
 * JSON body (POST):
 *   upload_id      the slot from /upload-session (required)
 *   drive_file_id  the file that session produced (required)
 *   title          display name for the deck (optional)
 *   entry_path     which root HTML to open, when the zip offers several
 *                  (optional; the answer to a previous ambiguous-entry refusal)
 */

/**
 * Uploads run a few at a time, bounded by COUNT and by BYTES.
 *
 * The byte bound is the one that matters now that a deck may carry video: four
 * concurrent 96 MB files would hold every one of them in memory at once, plus a
 * multipart copy of each. Capping the batch's total keeps peak memory near this
 * figure however the deck is shaped -- a big file simply goes up alone.
 */
const UPLOAD_CONCURRENCY = 4;
const UPLOAD_BATCH_BYTES = 24 * 1024 * 1024;

/** Groups the plan into batches that satisfy both bounds. */
function uploadBatches(files: DeckFilePlan[]): DeckFilePlan[][] {
	const batches: DeckFilePlan[][] = [];
	let batch: DeckFilePlan[] = [];
	let bytes = 0;
	for (const file of files) {
		if (batch.length && (batch.length >= UPLOAD_CONCURRENCY || bytes + file.size > UPLOAD_BATCH_BYTES)) {
			batches.push(batch);
			batch = [];
			bytes = 0;
		}
		batch.push(file);
		bytes += file.size;
	}
	if (batch.length) batches.push(batch);
	return batches;
}

/** Best-effort cleanup. Deleting a Drive FOLDER takes its contents with it. */
async function sweep(fileIds: string[], folderId: string | null): Promise<void> {
	await Promise.all(fileIds.map((id) => deleteDriveFile(id)));
	if (folderId) await deleteDriveFile(folderId);
}

/** Drive ids are opaque but well-formed; a wild string never reaches Google. */
const DRIVE_ID_RE = /^[A-Za-z0-9_-]{6,200}$/;

const CLAIM_REFUSALS: Record<string, string> = {
	not_found: 'That upload could not be found. Start the upload again.',
	already_used: 'That upload has already been used. Start the upload again.',
	cancelled: 'That upload was cancelled. Start the upload again.',
	expired: 'That upload took too long and expired. Start the upload again.',
	not_allowed:
		'Only the teacher of record for every class this is posted to can attach a deck here.'
};

export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ error: 'You must be signed in.' }, { status: 401 });
	}
	if (!driveConfigured()) {
		return json({ error: 'Deck upload is not configured on this deployment.' }, { status: 503 });
	}

	const body = (await request.json().catch(() => null)) as
		| { upload_id?: unknown; drive_file_id?: unknown; title?: unknown; entry_path?: unknown }
		| null;
	const uploadId = String(body?.upload_id ?? '').trim();
	if (!UUID_RE.test(uploadId)) {
		return json({ error: 'upload_id must be a uuid.' }, { status: 400 });
	}
	const driveFileId = String(body?.drive_file_id ?? '').trim();
	if (!DRIVE_ID_RE.test(driveFileId)) {
		return json({ error: 'drive_file_id is not a Drive file id.' }, { status: 400 });
	}

	// --- 1. Spend the slot -------------------------------------------------
	const claim = await supabase.rpc('classroom_deck_upload_claim', {
		p_upload_id: uploadId,
		p_drive_file_id: driveFileId
	});
	if (claim.error) {
		return json({ error: claim.error.message }, { status: 400 });
	}
	const claimed = (claim.data ?? {}) as { ok?: boolean; reason?: string; item_id?: string };
	if (!claimed.ok || !claimed.item_id) {
		const reason = claimed.reason ?? 'not_found';
		return json(
			{ error: CLAIM_REFUSALS[reason] ?? 'That upload could not be used.', reason },
			{ status: reason === 'not_allowed' ? 403 : 400 }
		);
	}
	const itemId = claimed.item_id;

	// --- 2. Prove the file is the one that slot created --------------------
	let meta;
	try {
		meta = await getDriveFileMeta(driveFileId);
	} catch (e) {
		return json({ error: (e as Error).message || 'Drive read failed.' }, { status: 502 });
	}
	const stagingFolder = await deckUploadsFolderId();
	if (meta.name !== deckUploadName(uploadId) || !meta.parents.includes(stagingFolder)) {
		// NOT deleted: this file is not ours to remove (see the header).
		return json(
			{ error: 'That file was not produced by this upload. Start the upload again.' },
			{ status: 400 }
		);
	}
	if (meta.size > DECK_LIMITS.maxZipBytes) {
		await deleteDriveFile(driveFileId);
		return json(
			{
				error: `Deck uploads are capped at ${Math.floor(DECK_LIMITS.maxZipBytes / 1024 / 1024)} MB.`
			},
			{ status: 413 }
		);
	}

	// From here on the staged zip is ours and is deleted on EVERY path out.
	try {
		// --- 3. Unpack (0101, unchanged) -----------------------------------
		const preferredEntry = String(body?.entry_path ?? '').trim() || null;
		const source = await driveZipSource(driveFileId, meta.size);
		const planned = await planDeck(source, preferredEntry);
		if (!planned.ok) {
			// A zip with several plausible entry pages is not an error the
			// uploader can act on without knowing which pages they were: hand
			// the candidates back so the surface can ask rather than guess.
			return json(
				{ error: planned.error, candidates: planned.candidates ?? [] },
				{ status: 400 }
			);
		}
		const plan = planned.plan;
		const title = String(body?.title ?? '').trim().slice(0, 200) || 'Presentation';

		// --- 4. Store: a fresh folder per upload ---------------------------
		// Fresh, never reused: a replace has to be able to sweep the OLD tree
		// wholesale, and the two decks briefly coexist while the RPC runs.
		let folderId: string;
		try {
			folderId = await createDriveFolder(deckFolderName(itemId), await decksFolderId());
		} catch (e) {
			return json({ error: (e as Error).message || 'Drive folder create failed.' }, { status: 502 });
		}

		const uploaded: { path: string; drive_file_id: string; mime_type: string; size_bytes: number }[] =
			[];
		try {
			for (const batch of uploadBatches(plan.files)) {
				const read = await Promise.all(batch.map((f) => readDeckFile(source, f)));
				const ids = await Promise.all(
					read.map((f, n) =>
						uploadDriveFile({
							bytes: f.bytes,
							mimeType: f.mimeType,
							filename: deckDriveFilename(batch[n].path),
							parentId: folderId
						})
					)
				);
				batch.forEach((f, n) =>
					uploaded.push({
						path: f.path,
						drive_file_id: ids[n],
						mime_type: read[n].mimeType,
						size_bytes: read[n].bytes.length
					})
				);
				// The batch's bytes go out of scope here, which is the whole
				// point of reading the archive a batch at a time.
			}
		} catch (e) {
			await sweep(uploaded.map((f) => f.drive_file_id), folderId);
			return json({ error: (e as Error).message || 'Drive upload failed.' }, { status: 502 });
		}

		const { data, error } = await supabase.rpc('classroom_replace_deck', {
			p_item_id: itemId,
			p_title: title,
			p_entry_path: plan.entryPath,
			p_drive_folder_id: folderId,
			p_files: uploaded,
			p_thumbnail_path: plan.thumbnailPath,
			p_has_state_file: plan.hasStateFile,
			p_slides: plan.slides
		});
		if (error) {
			await sweep(uploaded.map((f) => f.drive_file_id), folderId);
			return json({ error: error.message }, { status: 400 });
		}

		// The deck this one replaced, if any. Its files are unreferenced now.
		const result = (data ?? {}) as {
			deck_id?: string;
			replaced?: boolean;
			orphaned_drive_file_ids?: string[];
			orphaned_folder_id?: string | null;
		};
		await sweep(result.orphaned_drive_file_ids ?? [], result.orphaned_folder_id ?? null);

		return json({
			ok: true,
			deck_id: result.deck_id ?? null,
			item_id: itemId,
			replaced: result.replaced === true,
			file_count: uploaded.length,
			entry_path: plan.entryPath,
			has_state_file: plan.hasStateFile,
			slides: plan.slides.length,
			warnings: plan.warnings
		});
	} finally {
		// The staged archive has served its purpose either way. A failed ingest
		// therefore costs a re-upload -- the slot is spent regardless, so
		// keeping the zip around would only leave rubbish nothing can reuse.
		await deleteDriveFile(driveFileId);
	}
};

/** Removes the deck on `?item_id=`, then sweeps whatever Drive still holds. */
export const DELETE: RequestHandler = async ({ url, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ error: 'You must be signed in.' }, { status: 401 });
	}
	const itemId = (url.searchParams.get('item_id') ?? '').trim();
	if (!UUID_RE.test(itemId)) {
		return json({ error: 'item_id must be a uuid.' }, { status: 400 });
	}

	const { data, error } = await supabase.rpc('classroom_delete_deck', { p_item_id: itemId });
	if (error) {
		return json({ error: error.message }, { status: 400 });
	}
	const result = (data ?? {}) as {
		orphaned_drive_file_ids?: string[];
		orphaned_folder_id?: string | null;
	};
	await sweep(result.orphaned_drive_file_ids ?? [], result.orphaned_folder_id ?? null);
	return json({ ok: true });
};
