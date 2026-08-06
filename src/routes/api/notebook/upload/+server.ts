import { json } from '@sveltejs/kit';
import { deleteNotebookFile, driveConfigured, uploadNotebookPhoto } from '$lib/server/notebook-drive';
import { formText, readPhotoForm, UUID_RE } from '$lib/server/notebook-upload';
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
	if (sessionId && !UUID_RE.test(sessionId)) {
		return json({ error: 'session_id must be a uuid.' }, { status: 400 });
	}
	if (sectionId && !UUID_RE.test(sectionId)) {
		return json({ error: 'section_id must be a uuid.' }, { status: 400 });
	}
	if (!sessionId && !customLabel) {
		return json({ error: 'Provide a session_id or a custom_label.' }, { status: 400 });
	}

	const bytes = new Uint8Array(await read.photo.arrayBuffer());
	let fileId: string;
	try {
		fileId = await uploadNotebookPhoto({
			bytes,
			mimeType: read.photo.type,
			filename: `notebook_${claims.sub}_${Date.now()}_original.${read.ext}`
		});
	} catch (e) {
		return json({ error: (e as Error).message || 'Drive upload failed.' }, { status: 502 });
	}

	const { data, error } = await supabase.rpc('notebook_create_entry', {
		p_student_id: claims.sub,
		p_drive_file_id: fileId,
		p_session_id: sessionId,
		p_section_id: sectionId,
		p_custom_label: customLabel
	});
	if (error) {
		await deleteNotebookFile(fileId);
		return json({ error: error.message }, { status: 400 });
	}

	return json({ ok: true, drive_file_id: fileId, entry: data });
};
