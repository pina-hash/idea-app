import { json } from '@sveltejs/kit';
import {
	createDriveFolder,
	deleteDriveFile,
	driveConfigured,
	uploadDriveFile
} from '$lib/server/notebook-drive';
import {
	deckDriveFilename,
	deckFolderName,
	decksFolderId,
	planDeckFromZip,
	readDeckZipForm
} from '$lib/server/classroom-decks';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * Uploads (POST) or removes (DELETE) the presentation deck on one canonical
 * classroom item.
 *
 * THE ORDER IS: unpack, upload every file to Drive, then call the RPC -- the
 * /api/classroom/attachment shape, for the same reason (the rows store Drive
 * ids, so the files must exist first), scaled up to a whole tree. Every failure
 * path sweeps what it already put on Drive, so a refused upload leaves nothing
 * behind; a SUCCESSFUL upload sweeps the deck it REPLACED, using the
 * now-unreferenced ids the RPC hands back. Postgres cannot talk to Drive, which
 * is why "replaces cleanly without orphaning" is a two-part contract and this
 * route is its second part.
 *
 * AUTHORIZATION IS THE RPC'S, not this route's: classroom_replace_deck /
 * classroom_delete_deck (0101) run under the caller's own cookie session and
 * re-check _classroom_manages_item -- the caller must be teacher of record for
 * EVERY class the item is posted to, the same bar attaching a file already
 * takes. The 401 below is only so an anonymous caller never reaches Drive.
 *
 * multipart/form-data fields (POST):
 *   file        the exported project .zip (required)
 *   item_id     uuid of the canonical item (required)
 *   title       display name for the deck (optional)
 *   entry_path  which root HTML to open, when the zip offers several (optional)
 */

/** Uploads run a few at a time: a deck is ~30 small files, not one big one. */
const UPLOAD_CONCURRENCY = 4;

/** Best-effort cleanup. Deleting a Drive FOLDER takes its contents with it. */
async function sweep(fileIds: string[], folderId: string | null): Promise<void> {
	await Promise.all(fileIds.map((id) => deleteDriveFile(id)));
	if (folderId) await deleteDriveFile(folderId);
}

export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ error: 'You must be signed in.' }, { status: 401 });
	}
	if (!driveConfigured()) {
		return json({ error: 'Deck upload is not configured on this deployment.' }, { status: 503 });
	}

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return json({ error: 'Expected multipart/form-data.' }, { status: 400 });
	}

	const itemId = String(form.get('item_id') ?? '').trim();
	if (!UUID_RE.test(itemId)) {
		return json({ error: 'item_id must be a uuid.' }, { status: 400 });
	}

	const read = await readDeckZipForm(form);
	if ('error' in read) {
		return json({ error: read.error }, { status: read.status });
	}

	const preferredEntry = String(form.get('entry_path') ?? '').trim() || null;
	const planned = planDeckFromZip(read.bytes, preferredEntry);
	if (!planned.ok) {
		// A zip with several plausible entry pages is not an error the uploader
		// can act on without knowing which pages they were: hand the candidates
		// back so the surface can ask rather than guess.
		return json({ error: planned.error, candidates: planned.candidates ?? [] }, { status: 400 });
	}
	const plan = planned.plan;

	const title =
		String(form.get('title') ?? '').trim().slice(0, 200) ||
		read.filename.replace(/\.zip$/i, '').trim().slice(0, 200) ||
		'Presentation';

	// --- Drive: a fresh folder per upload -----------------------------------
	// Fresh, never reused: a replace has to be able to sweep the OLD tree
	// wholesale, and the two decks briefly coexist while the RPC runs.
	let folderId: string;
	try {
		folderId = await createDriveFolder(deckFolderName(itemId), await decksFolderId());
	} catch (e) {
		return json({ error: (e as Error).message || 'Drive folder create failed.' }, { status: 502 });
	}

	const uploaded: { path: string; drive_file_id: string; mime_type: string; size_bytes: number }[] = [];
	try {
		for (let i = 0; i < plan.files.length; i += UPLOAD_CONCURRENCY) {
			const batch = plan.files.slice(i, i + UPLOAD_CONCURRENCY);
			const ids = await Promise.all(
				batch.map((f) =>
					uploadDriveFile({
						bytes: f.bytes,
						mimeType: f.mimeType,
						filename: deckDriveFilename(f.path),
						parentId: folderId
					})
				)
			);
			batch.forEach((f, n) =>
				uploaded.push({
					path: f.path,
					drive_file_id: ids[n],
					mime_type: f.mimeType,
					size_bytes: f.bytes.length
				})
			);
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
		replaced: result.replaced === true,
		file_count: uploaded.length,
		entry_path: plan.entryPath,
		has_state_file: plan.hasStateFile,
		slides: plan.slides.length,
		warnings: plan.warnings
	});
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
