import { json } from '@sveltejs/kit';
import { deleteDriveFile, downloadDriveFile, driveConfigured } from '$lib/server/notebook-drive';
import { INLINE_TYPES } from '$lib/server/classroom-attachments';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * Serves (GET) and removes (DELETE) one INSTRUCTOR-ONLY classroom attachment.
 * Modelled on /api/classroom/attachment/[attachment_id], with one deliberate
 * omission: THERE IS NO ?as= (answer-as-somebody-else) SUPPORT HERE, AND THERE
 * MUST NEVER BE. Instructor-only material is never part of what a student sees,
 * so this route does not even read the query string for it. (The student-facing
 * proxy beside it once did, for the classroom view-as preview; that preview and
 * that branch are both gone, so neither route resolves an identity now -- but
 * the rule here is the stronger one and stands on its own.) The row is read
 * purely under the CALLER'S OWN session,
 * so an admin's own account can fetch it (as an admin legitimately can,
 * classroom_can_read_instructor_material, 0090) but a signed-in student's
 * session -- impersonated or not -- never resolves a row at all.
 *
 * AUTHORIZATION IS A REAL QUERY, NOT A CHECK WRITTEN HERE: classroom_instructor_
 * attachments delegates to classroom_can_read_instructor_material, which admits
 * the teacher of record of ANY section this item is posted to, or an admin --
 * and nothing else. An empty result is 404, never 403 (RLS returning nothing is
 * indistinguishable from the row not existing, and a 403 would confirm a real
 * id to a stranger).
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
		return json({ error: 'File attachments are not configured on this deployment.' }, { status: 503 });
	}

	const id = params.attachment_id;
	if (!id || !UUID_RE.test(id)) {
		return new Response('Not found', { status: 404 });
	}

	const { data, error } = await supabase
		.from('classroom_instructor_attachments')
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
		'content-disposition': dispositionFor(contentType, row.filename ?? 'attachment')
	});
	if (file.contentLength) headers.set('content-length', file.contentLength);

	return new Response(file.body, { headers });
};

/**
 * Removes one instructor-only attachment row. The RPC re-checks
 * _classroom_manages_item, and reports whether the Drive blob is now
 * unreferenced (a duplicated item carries the same file id onto a second row).
 */
export const DELETE: RequestHandler = async ({ params, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ error: 'You must be signed in.' }, { status: 401 });
	}
	const id = params.attachment_id;
	if (!id || !UUID_RE.test(id)) {
		return json({ error: 'attachment_id must be a uuid.' }, { status: 400 });
	}

	const { data, error } = await supabase.rpc('classroom_delete_instructor_attachment', { p_id: id });
	if (error) {
		return json({ error: error.message }, { status: 400 });
	}

	const result = data as { drive_file_id?: string; orphaned?: boolean } | null;
	if (result?.orphaned && result.drive_file_id) {
		await deleteDriveFile(result.drive_file_id);
	}
	return json({ ok: true });
};
