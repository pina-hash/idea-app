import { json } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import {
	deleteNotebookFile,
	driveConfigured,
	notebookDriveFilename,
	renameNotebookFile,
	uploadNotebookPhoto
} from '$lib/server/notebook-drive';
import { driveIdentifierFor, formText, readPhotoForm, UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * Notebook entry upload: accepts a photo, pushes it to the shared drive, then
 * creates the entry (plus its first 'original' photo row) via the
 * notebook_create_entry RPC UNDER THE CALLER'S OWN COOKIE SESSION
 * (locals.supabase), so the RPC's internal auth.uid() check is the
 * authorization -- the tournament-push idiom. No session, no upload.
 *
 * multipart/form-data fields:
 *   photo         the image file (required)
 *   session_id    uuid of a notebook_sessions row (optional)
 *   section_id    uuid of a notebook_sections row (optional)
 *   custom_label  free-entry label (required when there is no session)
 *
 * If the RPC refuses after the file already landed in Drive, the orphaned
 * file is deleted best-effort so refused submissions do not pile up there.
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

	const sessionId = formText(form, 'session_id');
	const sectionId = formText(form, 'section_id');
	const customLabel = formText(form, 'custom_label');
	const folderId = formText(form, 'folder_id');
	if (sessionId && !UUID_RE.test(sessionId)) {
		return json({ error: 'session_id must be a uuid.' }, { status: 400 });
	}
	if (sectionId && !UUID_RE.test(sectionId)) {
		return json({ error: 'section_id must be a uuid.' }, { status: 400 });
	}
	if (folderId && !UUID_RE.test(folderId)) {
		return json({ error: 'folder_id must be a uuid.' }, { status: 400 });
	}
	// 0071: no label required; a fully unlabeled free entry is valid.

	// Human-readable Drive name (the admin browses the folder by eye): the
	// label is the session's label when session-linked, else the custom label.
	// Both lookups are best-effort -- a failed read only degrades the NAME.
	const identifier = await driveIdentifierFor(supabase, claims);
	let label = customLabel;
	if (sessionId) {
		const { data: session } = await supabase
			.from('notebook_sessions')
			.select('label')
			.eq('id', sessionId)
			.maybeSingle();
		label = (session?.label as string | null) ?? customLabel;
	}

	const originalFilename = read.photo.name?.trim() || null;
	const bytes = new Uint8Array(await read.photo.arrayBuffer());
	let fileId: string;
	const nameFor = (entryShortId: string) =>
		notebookDriveFilename({
			identifier,
			label,
			originalFilename,
			variant: 'original',
			entryShortId,
			ext: read.ext
		});
	try {
		fileId = await uploadNotebookPhoto({
			bytes,
			mimeType: read.mimeType,
			// The entry does not exist yet (the RPC below needs the file id
			// first), so upload under a provisional random short-id and rename
			// to the entry's real short-id once the RPC returns it.
			filename: nameFor(randomUUID().slice(0, 8))
		});
	} catch (e) {
		return json({ error: (e as Error).message || 'Drive upload failed.' }, { status: 502 });
	}

	/**
	 * p_folder_id is named ONLY when a folder was actually asked for. On a
	 * project where 0088 has not been applied by hand yet -- a real state, not
	 * a hypothetical -- notebook_create_entry still has its six-argument
	 * signature, and naming a seventh unconditionally would leave PostgREST
	 * unable to resolve the function and break photo uploads entirely. The UI
	 * can only offer a folder once 0088 is applied, so the branch that needs
	 * the new signature is exactly the branch that has it.
	 *
	 * Passed THROUGH, never checked here: the RPC refuses a folder that is not
	 * the caller's own, and the composite FK makes filing into somebody else's
	 * unrepresentable either way. A refusal deletes the just-uploaded file
	 * exactly like every other refusal below.
	 */
	const args: Record<string, unknown> = {
		p_student_id: claims.sub,
		p_drive_file_id: fileId,
		p_session_id: sessionId,
		p_section_id: sectionId,
		p_custom_label: customLabel,
		p_original_filename: originalFilename
	};
	if (folderId) args.p_folder_id = folderId;

	const { data, error } = await supabase.rpc('notebook_create_entry', args);
	if (error) {
		await deleteNotebookFile(fileId);
		return json({ error: error.message }, { status: 400 });
	}

	const entryId = (data as { entry_id?: string } | null)?.entry_id;
	if (entryId) {
		// Best-effort: a failed rename leaves the provisional name, which is
		// already readable; it must never fail a succeeded upload.
		await renameNotebookFile(fileId, nameFor(entryId.slice(0, 8)));
	}

	return json({ ok: true, drive_file_id: fileId, entry: data });
};
