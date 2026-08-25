import { json, redirect } from '@sveltejs/kit';
import { deleteDriveFile, downloadDriveFile, driveConfigured } from '$lib/server/notebook-drive';
import {
	DOWNLOAD_URL_TTL_SECONDS,
	INLINE_TYPES,
	INSTRUCTOR_ATTACHMENTS_BUCKET,
	downloadFilename
} from '$lib/server/classroom-attachments';
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

/**
 * The row, widest-first. `storage_key` arrived in 0135, and a deployment
 * sitting on the migration before it is a real state -- so the narrow rung is
 * what keeps every Drive-backed answer key resolving there rather than the
 * whole select failing on an unknown column.
 */
async function readInstructorRow(
	supabase: App.Locals['supabase'],
	id: string
): Promise<{
	drive_file_id?: string | null;
	storage_key?: string | null;
	filename?: string;
	mime_type?: string;
} | null> {
	const wide = await supabase
		.from('classroom_instructor_attachments')
		.select('drive_file_id, storage_key, filename, mime_type')
		.eq('id', id)
		.maybeSingle();
	if (!wide.error) return (wide.data ?? null) as never;

	const narrow = await supabase
		.from('classroom_instructor_attachments')
		.select('drive_file_id, filename, mime_type')
		.eq('id', id)
		.maybeSingle();
	if (narrow.error) return null;
	return (narrow.data ?? null) as never;
}

export const GET: RequestHandler = async ({ params, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ error: 'You must be signed in.' }, { status: 401 });
	}

	const id = params.attachment_id;
	if (!id || !UUID_RE.test(id)) {
		return new Response('Not found', { status: 404 });
	}

	const row = await readInstructorRow(supabase, id);
	if (!row) {
		return new Response('Not found', { status: 404 });
	}

	// ---- The 0135 path: hand back a signed URL and get out of the way. ----
	//
	// AUTHORIZATION IS ASKED TWICE, INDEPENDENTLY. The ROW came back under the
	// caller's own session, so `classroom_can_read_instructor_material` (0090)
	// already said yes; the mint then runs on that same session, so 0135's
	// manager-only select policy on `instructor-attachments` asks again about
	// the object itself. A student reaching this route resolves no row and
	// could not sign one if they did.
	//
	// ALWAYS A DOWNLOAD, exactly as the other two storage routes are. Do not add
	// an inline branch: there is no type allowlist on this path any more, so an
	// answer key that happens to be a `.html` must not be navigable as a
	// document on any origin.
	if (row.storage_key) {
		const { data: signed, error: signError } = await supabase.storage
			.from(INSTRUCTOR_ATTACHMENTS_BUCKET)
			.createSignedUrl(row.storage_key, DOWNLOAD_URL_TTL_SECONDS, {
				download: downloadFilename(row.filename ?? 'attachment')
			});
		if (signError || !signed?.signedUrl) {
			return new Response('Not found', { status: 404 });
		}
		redirect(302, signed.signedUrl);
	}

	// ---- Everything posted before 0135. Unchanged. ----
	if (!driveConfigured()) {
		return json({ error: 'File attachments are not configured on this deployment.' }, { status: 503 });
	}
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

	// TWO SWEEPERS, EACH TOLD ONLY ABOUT ITS OWN. 0135's RPC reports which
	// handle the row carried; the storage delete runs under the caller's OWN
	// session against the manager-only delete policy, so it can never remove
	// somebody else's object.
	const result = data as
		| { drive_file_id?: string | null; storage_key?: string | null; orphaned?: boolean }
		| null;
	if (result?.orphaned) {
		if (result.storage_key) {
			await supabase.storage.from(INSTRUCTOR_ATTACHMENTS_BUCKET).remove([result.storage_key]);
		} else if (result.drive_file_id) {
			await deleteDriveFile(result.drive_file_id);
		}
	}
	return json({ ok: true });
};
