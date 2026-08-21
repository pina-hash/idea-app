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
	/**
	 * THE PUBLIC BRANCH (`?public=1`). The printed syllabus goes home for a
	 * parent signature, so the attachments on a PUBLIC MATERIAL have to serve
	 * with no session. It is a genuinely separate path, not the check below
	 * skipped: the row is resolved by classroom_public_attachment (0092), which
	 * answers only for an attachment whose item is a published, public material.
	 * So `?public=1` can only ever NARROW what this route will hand over -- an
	 * ordinary class handout, another section's file, an instructor-only file
	 * (a different table entirely) and a private material's attachment all read
	 * as 404 here whether or not anyone is signed in.
	 */
	const wantsPublic = url.searchParams.get('public') === '1';

	if (!claims && !wantsPublic) {
		return json({ error: 'You must be signed in.' }, { status: 401 });
	}
	if (!driveConfigured()) {
		return json({ error: 'File attachments are not configured on this deployment.' }, { status: 503 });
	}

	const id = params.attachment_id;
	if (!id || !UUID_RE.test(id)) {
		return new Response('Not found', { status: 404 });
	}

	if (wantsPublic) {
		const { data, error } = await supabase.rpc('classroom_public_attachment', {
			p_attachment_id: id
		});
		const row = (data ?? null) as { drive_file_id?: string; filename?: string; mime_type?: string } | null;
		if (error || !row?.drive_file_id) {
			return new Response('Not found', { status: 404 });
		}
		return serveDriveFile(row.drive_file_id, row.filename ?? 'attachment', row.mime_type ?? '');
	}

	/**
	 * THERE IS NO `?as=` BRANCH ANY MORE, and `as` is now an ordinary unknown
	 * query parameter this route ignores -- exactly as the instructor-material
	 * proxy beside it always has.
	 *
	 * It existed for the classroom view-as-student preview: it asked
	 * classroom_view_as_can_read_attachment whether the impersonated student
	 * could fetch this file, so a previewed page 404'd on an attachment they
	 * were not entitled to. Both pages that could produce such a URL (the class
	 * preview and the item preview) are gone, so nothing generates one.
	 *
	 * REMOVING IT CANNOT WIDEN ANYTHING. The branch only ever NARROWED an
	 * already-authorized read: every response below is the CALLER'S own,
	 * scoped by classroom_attachments' policy, and that is unchanged. What the
	 * parameter can no longer do is make this route answer as somebody else.
	 * The SQL function stays applied and unreferenced (see the orphan list in
	 * docs/HISTORY.md); dropping it is a later migration, because a dropped
	 * function under a still-deployed route is a 500.
	 */
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

	return serveDriveFile(row.drive_file_id, row.filename ?? 'attachment', row.mime_type ?? '');
};

/**
 * Stream the bytes. Reached ONLY after a caller has proved they may see this
 * file -- through their own RLS-scoped read, the view-as RPC, or the public
 * one. Factored out so the authenticated and public branches cannot drift on
 * the content-type allowlist or the headers.
 */
async function serveDriveFile(
	driveFileId: string,
	filename: string,
	storedMime: string
): Promise<Response> {
	let file;
	try {
		file = await downloadDriveFile(driveFileId, INLINE_TYPES);
	} catch (e) {
		// The caller IS allowed to see this file; Drive just did not give it to
		// us. 502 rather than 404 so the two stay distinguishable in logs.
		return json({ error: (e as Error).message || 'Drive download failed.' }, { status: 502 });
	}

	// Drive reports the stored type; the ROW's type is what was validated at
	// upload. Prefer the row when Drive's answer was rejected by the allowlist,
	// so an ordinary Office document still downloads under its real name.
	const stored = storedMime.toLowerCase();
	const contentType =
		file.contentType === 'application/octet-stream' && INLINE_TYPES.has(stored)
			? stored
			: file.contentType;

	const headers = new Headers({
		'content-type': contentType,
		'cache-control': CACHE_CONTROL,
		'x-content-type-options': 'nosniff',
		'content-disposition': dispositionFor(contentType, filename)
	});
	if (file.contentLength) headers.set('content-length', file.contentLength);

	return new Response(file.body, { headers });
}

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
