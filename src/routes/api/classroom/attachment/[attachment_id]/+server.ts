import { json } from '@sveltejs/kit';
import { deleteDriveFile, downloadDriveFile, driveConfigured } from '$lib/server/notebook-drive';
import { INLINE_TYPES } from '$lib/server/classroom-attachments';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * Serves (GET) and removes (DELETE) one classroom attachment.
 *
 * DRIVE-SIDE SHARING IS NEVER RELIED ON. The files sit in a restricted school
 * shared drive, so an <img src="drive.google.com/..."> would render only for
 * someone who personally has access to that folder -- i.e. staff, not the
 * students the handout is for. This route reads the bytes on the school
 * account's behalf and hands them to a caller who has proved they may see them.
 * Modelled on /api/notebook/photo/[photo_id]; the differences are noted below.
 *
 * AUTHORIZATION IS A REAL QUERY, NOT A CHECK WRITTEN HERE. The row is read
 * under the CALLER'S OWN cookie session, so the policy decides:
 * classroom_attachments delegates to classroom_can_read_item (0085), which
 * admits the manager of any class the item is posted to and an ACTIVELY
 * ENROLLED student looking at PUBLISHED content. A draft's attachments are
 * therefore unreachable for a student by construction, and so are another
 * section's.
 *
 * Unlike the notebook photo route there is deliberately no `!inner` embed as a
 * second hurdle: an attachment has exactly one owner (its item), so the embed
 * would add no check at all. The delegation IS the hurdle, and it is the
 * item's own policy being asked.
 *
 * AN EMPTY RESULT IS 404, NEVER 403: RLS returning nothing is indistinguishable
 * from the row not existing, and a 403 would confirm a real id to a stranger.
 */

/** Immutable bytes, but WHO may see them is not (a post can be unpublished). */
const CACHE_CONTROL = 'private, max-age=60';

/** RFC 5987-safe filename for the Content-Disposition header. */
function dispositionFor(mime: string, filename: string): string {
	const inline = INLINE_TYPES.has(mime.toLowerCase());
	const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
	return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export const GET: RequestHandler = async ({ params, url, locals: { supabase, claims } }) => {
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

	/**
	 * VIEW-AS-STUDENT. `?as=<email>` asks the database whether THAT student
	 * could fetch this attachment, through the admin-gated
	 * classroom_view_as_can_read_attachment (0083) -- so an impersonated page
	 * behaves like the student it is imitating rather than like the admin
	 * driving it, and a non-admin passing `as` is refused by the RPC itself,
	 * not by anything written here. It can only ever NARROW: an admin already
	 * reads every attachment through their own policy.
	 */
	const viewAs = url.searchParams.get('as')?.trim().toLowerCase() ?? '';
	if (viewAs) {
		const { data: allowed, error } = await supabase.rpc(
			'classroom_view_as_can_read_attachment',
			{ p_email: viewAs, p_attachment_id: id }
		);
		if (error || allowed !== true) {
			return new Response('Not found', { status: 404 });
		}
	}

	const { data, error } = await supabase
		.from('classroom_attachments')
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

	// Drive reports the stored type; the ROW's type is what was validated at
	// upload. Prefer the row when Drive's answer was rejected by the allowlist,
	// so an ordinary Office document still downloads under its real name.
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
 * Removes one attachment row. The RPC re-checks classroom_manages_section, and
 * reports whether the Drive blob is now unreferenced -- ONE upload can back
 * several rows (a multi-section publish), so the blob goes only when the last
 * row referencing it does.
 */
export const DELETE: RequestHandler = async ({ params, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ error: 'You must be signed in.' }, { status: 401 });
	}
	const id = params.attachment_id;
	if (!id || !UUID_RE.test(id)) {
		return json({ error: 'attachment_id must be a uuid.' }, { status: 400 });
	}

	const { data, error } = await supabase.rpc('classroom_delete_attachment', { p_id: id });
	if (error) {
		return json({ error: error.message }, { status: 400 });
	}

	const result = data as { drive_file_id?: string; orphaned?: boolean } | null;
	if (result?.orphaned && result.drive_file_id) {
		await deleteDriveFile(result.drive_file_id);
	}
	return json({ ok: true });
};
