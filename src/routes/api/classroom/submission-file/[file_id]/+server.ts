import { json } from '@sveltejs/kit';
import { deleteDriveFile, downloadDriveFile, driveConfigured } from '$lib/server/notebook-drive';
import { INLINE_TYPES } from '$lib/server/classroom-attachments';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * Serves (GET) and removes (DELETE) one student submission file. Modelled on
 * /api/classroom/attachment/[attachment_id], with the ownership rules the
 * submission tables carry:
 *
 * AUTHORIZATION IS A REAL QUERY. The row is read under the CALLER'S OWN cookie
 * session, so 0086's policy decides: a student reaches only files hanging off
 * their OWN submission, and a teacher only files of students in THEIR sections
 * (classroom_can_review_submission). An empty result is 404, never 403 -- RLS
 * returning nothing is indistinguishable from the row not existing.
 *
 * DELETE is the student's own action only (classroom_delete_submission_file
 * refuses everyone else and a locked submission); the orphaned Drive blob is
 * swept here, since the database cannot talk to Drive.
 */

const CACHE_CONTROL = 'private, max-age=60';

function dispositionFor(mime: string, filename: string): string {
	const inline = INLINE_TYPES.has(mime.toLowerCase());
	const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
	return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export const GET: RequestHandler = async ({ params, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ error: 'You must be signed in.' }, { status: 401 });
	}
	if (!driveConfigured()) {
		return json({ error: 'File storage is not configured on this deployment.' }, { status: 503 });
	}

	const id = params.file_id;
	if (!id || !UUID_RE.test(id)) {
		return new Response('Not found', { status: 404 });
	}

	const { data, error } = await supabase
		.from('classroom_submission_files')
		.select('drive_file_id, filename, mime_type')
		.eq('id', id)
		.maybeSingle();

	if (error || !data) {
		return new Response('Not found', { status: 404 });
	}
	const row = data as { drive_file_id?: string; filename?: string; mime_type?: string };
	if (!row.drive_file_id) {
		return new Response('Not found', { status: 404 });
	}

	let file;
	try {
		file = await downloadDriveFile(row.drive_file_id, INLINE_TYPES);
	} catch (e) {
		// The caller IS allowed to see this file; Drive just did not give it to
		// us. 502 rather than 404 so the two stay distinguishable in logs.
		return json({ error: (e as Error).message || 'Drive download failed.' }, { status: 502 });
	}

	const stored = (row.mime_type ?? '').toLowerCase();
	const contentType =
		file.contentType === 'application/octet-stream' && INLINE_TYPES.has(stored)
			? stored
			: file.contentType;

	const headers = new Headers({
		'content-type': contentType,
		'cache-control': CACHE_CONTROL,
		'x-content-type-options': 'nosniff',
		'content-disposition': dispositionFor(contentType, row.filename ?? 'file')
	});
	if (file.contentLength) headers.set('content-length', file.contentLength);

	return new Response(file.body, { headers });
};

export const DELETE: RequestHandler = async ({ params, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ error: 'You must be signed in.' }, { status: 401 });
	}
	const id = params.file_id;
	if (!id || !UUID_RE.test(id)) {
		return json({ error: 'file_id must be a uuid.' }, { status: 400 });
	}

	const { data, error } = await supabase.rpc('classroom_delete_submission_file', { p_id: id });
	if (error) {
		return json({ error: error.message }, { status: 400 });
	}

	const result = data as { ok?: boolean; reason?: string; drive_file_id?: string; orphaned?: boolean } | null;
	if (result?.ok === false) {
		return json({ ok: false, reason: result.reason ?? 'refused' });
	}
	if (result?.orphaned && result.drive_file_id) {
		await deleteDriveFile(result.drive_file_id);
	}
	return json({ ok: true });
};
