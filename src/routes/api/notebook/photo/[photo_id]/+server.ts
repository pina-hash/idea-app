import { json } from '@sveltejs/kit';
import { downloadNotebookFile, driveConfigured } from '$lib/server/notebook-drive';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * Serves one notebook photo's bytes.
 *
 * WHY IT EXISTS. 0069 stores only the Drive file id, and the photos live in
 * a restricted school shared drive, so pointing an <img> at
 * drive.google.com only ever rendered for a viewer who personally had
 * access to that folder -- in practice, staff. This route reads the file on
 * the school account's behalf (downloadNotebookFile) and hands it to a
 * caller who has proved they may see it.
 *
 * AUTHORIZATION IS A REAL QUERY, NOT A CHECK WRITTEN HERE. The row is read
 * under the CALLER'S OWN cookie session (locals.supabase), so 0069's
 * policies decide: notebook_entry_photos is gated on
 * notebook_can_read_entry(entry_id), which admits the owning student, the
 * entry's section instructor, and an admin. The `!inner` embed makes the
 * parent entry a second, independent hurdle -- PostgREST applies RLS to an
 * embedded resource too, so an entry the caller cannot read collapses the
 * join and drops the row. Nothing here re-implements any of that; if the
 * policies change, this route changes with them for free.
 *
 * AN EMPTY RESULT IS 404, NEVER 403. RLS returning no row is
 * indistinguishable from the row not existing, and that is the point: a 403
 * would confirm to a stranger that a given photo id is real. Both the
 * "someone else's photo" and "no such photo" cases answer identically.
 */

/** A photo is immutable once written, but who may see it is not: an entry
 *  can be re-pointed at another section by an admin override. A short
 *  PRIVATE cache survives a scroll or re-render without letting a stale
 *  authorization linger, and `private` keeps it out of any shared proxy. */
const CACHE_CONTROL = 'private, max-age=60';

export const GET: RequestHandler = async ({ params, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ error: 'You must be signed in.' }, { status: 401 });
	}
	if (!driveConfigured()) {
		return json({ error: 'The notebook Drive integration is not configured.' }, { status: 503 });
	}

	// A malformed id can never match a row; answering 404 without a round
	// trip keeps it indistinguishable from a well-formed id the caller may
	// not see.
	const photoId = params.photo_id;
	if (!photoId || !UUID_RE.test(photoId)) {
		return new Response('Not found', { status: 404 });
	}

	const { data, error } = await supabase
		.from('notebook_entry_photos')
		.select('drive_file_id, notebook_entries!inner(id)')
		.eq('id', photoId)
		.maybeSingle();

	// error: 0069 unapplied, or the read was refused outright.
	// no data: RLS said no, or there is genuinely no such photo. Same answer.
	if (error || !data) {
		return new Response('Not found', { status: 404 });
	}

	const fileId = (data as { drive_file_id?: string }).drive_file_id;
	if (!fileId) {
		return new Response('Not found', { status: 404 });
	}

	let file;
	try {
		file = await downloadNotebookFile(fileId);
	} catch (e) {
		// The caller IS allowed to see this photo; Drive just did not give it
		// to us (hiccup, revoked token, file removed out from under the row).
		// 502 rather than 404 so the two cases stay distinguishable in logs --
		// and the UI's per-photo fallback card covers it either way.
		return json({ error: (e as Error).message || 'Drive download failed.' }, { status: 502 });
	}

	const headers = new Headers({
		'content-type': file.contentType,
		'cache-control': CACHE_CONTROL,
		// The bytes come from the app's own origin, so pin the declared type
		// and keep the browser from ever treating a photo as a document.
		'x-content-type-options': 'nosniff',
		'content-disposition': 'inline'
	});
	if (file.contentLength) headers.set('content-length', file.contentLength);

	return new Response(file.body, { headers });
};
