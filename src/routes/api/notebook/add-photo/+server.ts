import { json } from '@sveltejs/kit';
import {
	deleteNotebookFile,
	driveConfigured,
	notebookDriveFilename,
	uploadNotebookPhoto
} from '$lib/server/notebook-drive';
import { driveIdentifierFor, formText, readPhotoForm, UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * Adds a photo to an existing notebook entry: pushes the image to the shared
 * drive, then calls the notebook_add_photo RPC under the caller's own cookie
 * session (entry-owner enforcement, the flagged -> pending_review reset, and
 * sequence_order all live in the RPC). Used both for multi-page entries and
 * for attaching a client-corrected 'enhanced' variant next to the 'original'.
 *
 * multipart/form-data fields:
 *   photo     the image file (required)
 *   entry_id  uuid of the entry to extend (required)
 *   variant   'original' (default) or 'enhanced'
 */

export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ error: 'You must be signed in.' }, { status: 401 });
	}
	if (!driveConfigured()) {
		return json({ error: 'The notebook Drive integration is not configured.' }, { status: 503 });
	}

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return json({ error: 'Expected multipart/form-data.' }, { status: 400 });
	}

	const read = readPhotoForm(form);
	if ('error' in read) {
		return json({ error: read.error }, { status: read.status });
	}

	const entryId = formText(form, 'entry_id');
	if (!entryId || !UUID_RE.test(entryId)) {
		return json({ error: 'entry_id must be a uuid.' }, { status: 400 });
	}
	const variant = formText(form, 'variant') ?? 'original';
	if (variant !== 'original' && variant !== 'enhanced') {
		return json({ error: "variant must be 'original' or 'enhanced'." }, { status: 400 });
	}

	// Human-readable Drive name; the entry exists here, so its label (session
	// label when linked, else the custom label) and short-id are read up front.
	// Best-effort reads: a failure only degrades the NAME, never the upload.
	const identifier = await driveIdentifierFor(supabase, claims);
	const { data: entryRow } = await supabase
		.from('notebook_entries')
		.select('custom_label, notebook_sessions(label)')
		.eq('id', entryId)
		.maybeSingle();
	const sessionLabel = (entryRow?.notebook_sessions as { label?: string } | null)?.label ?? null;
	const label = sessionLabel ?? (entryRow?.custom_label as string | null) ?? null;

	const bytes = new Uint8Array(await read.photo.arrayBuffer());
	let fileId: string;
	try {
		fileId = await uploadNotebookPhoto({
			bytes,
			mimeType: read.photo.type,
			filename: notebookDriveFilename({
				identifier,
				label,
				variant,
				entryShortId: entryId.slice(0, 8),
				ext: read.ext
			})
		});
	} catch (e) {
		return json({ error: (e as Error).message || 'Drive upload failed.' }, { status: 502 });
	}

	const { data, error } = await supabase.rpc('notebook_add_photo', {
		p_entry_id: entryId,
		p_drive_file_id: fileId,
		p_variant: variant
	});
	if (error) {
		await deleteNotebookFile(fileId);
		return json({ error: error.message }, { status: 400 });
	}

	return json({ ok: true, drive_file_id: fileId, photo: data });
};
