import { json } from '@sveltejs/kit';
import {
	deleteNotebookFile,
	driveConfigured,
	notebookDriveFilename,
	uploadNotebookPhoto
} from '$lib/server/notebook-drive';
import { driveIdentifierFor, formText, readPhotoForm, UUID_RE } from '$lib/server/notebook-upload';
import { notebookPhotoRefusal } from '$lib/notebook/photo-prepare';
import { uploadFailureMessage } from '$lib/upload-limits';
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

	/**
	 * SIZE FIRST, AND IT IS THE ONE REFUSAL A STUDENT WAS BEING TOLD NOTHING
	 * USEFUL ABOUT. `readPhotoForm` answers `Photos are capped at 4 MB.` --
	 * the limit, with neither the size of the file in hand nor anything to do
	 * about it, which is what a report reading "failed upload" looks like from
	 * the other side. `notebookPhotoRefusal` reads the SAME cap out of the one
	 * registry and says all three. `readPhotoForm`'s own branch stays where it
	 * is as an unreachable backstop: two layers refusing one thing is defence
	 * in depth, and `tests/upload-limits.test.ts` pins the two numbers to each
	 * other so they cannot part company in silence.
	 */
	const picked = form.get('photo');
	if (picked instanceof File) {
		const refusal = notebookPhotoRefusal(picked);
		if (refusal) {
			return json({ error: refusal }, { status: picked.size > 0 ? 413 : 400 });
		}
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
	// TWO READS, NOT AN EMBED. Since 0098 there is no foreign key between
	// notebook_entries and notebook_sessions -- the entry's composite key points
	// at notebook_session_postings now -- so PostgREST cannot resolve a
	// `notebook_sessions ( ... )` embed here and would reject the whole select.
	// notebook_sessions is readable by any signed-in user (0069), so the
	// follow-up needs no filter of its own.
	const identifier = await driveIdentifierFor(supabase, claims);
	const { data: entryRow } = await supabase
		.from('notebook_entries')
		.select('custom_label, session_id')
		.eq('id', entryId)
		.maybeSingle();
	let sessionLabel: string | null = null;
	const sessionId = (entryRow?.session_id as string | null) ?? null;
	if (sessionId) {
		const { data: sessionRow } = await supabase
			.from('notebook_sessions')
			.select('session_label')
			.eq('id', sessionId)
			.maybeSingle();
		sessionLabel = (sessionRow?.session_label as string | null) ?? null;
	}
	const label = sessionLabel ?? (entryRow?.custom_label as string | null) ?? null;

	const originalFilename = read.photo.name?.trim() || null;
	const bytes = new Uint8Array(await read.photo.arrayBuffer());
	let fileId: string;
	try {
		fileId = await uploadNotebookPhoto({
			bytes,
			mimeType: read.mimeType,
			filename: notebookDriveFilename({
				identifier,
				label,
				originalFilename,
				variant,
				entryShortId: entryId.slice(0, 8),
				ext: read.ext
			})
		});
	} catch (e) {
		/* WHATEVER DRIVE SAID, TURNED INTO A SENTENCE RATHER THAN PASSED
		   THROUGH. `Drive upload failed.` was the fallback whenever the thrown
		   value had no message, which names our storage vendor and tells the
		   student nothing they can act on -- and a size refusal arriving from
		   the far end was rendered in Google's words, not ours. Same function
		   the feedback screenshot path uses, so one failure has one voice. */
		return json(
			{
				error: uploadFailureMessage({
					id: 'notebook-photo',
					status: 502,
					detail: (e as Error)?.message ?? null,
					sizeBytes: read.photo.size
				})
			},
			{ status: 502 }
		);
	}

	const { data, error } = await supabase.rpc('notebook_add_photo', {
		p_entry_id: entryId,
		p_drive_file_id: fileId,
		p_variant: variant,
		p_original_filename: originalFilename
	});
	if (error) {
		await deleteNotebookFile(fileId);
		return json({ error: error.message }, { status: 400 });
	}

	return json({ ok: true, drive_file_id: fileId, photo: data });
};
