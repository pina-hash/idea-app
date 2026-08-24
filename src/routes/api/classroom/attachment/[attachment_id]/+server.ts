import { json, redirect } from '@sveltejs/kit';
import { deleteDriveFile, downloadDriveFile, driveConfigured } from '$lib/server/notebook-drive';
import {
	CLASSROOM_ATTACHMENTS_BUCKET,
	DOWNLOAD_URL_TTL_SECONDS,
	INLINE_TYPES,
	downloadFilename
} from '$lib/server/classroom-attachments';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * Serves (GET) and removes (DELETE) one classroom attachment.
 *
 * ONE URL, TWO PLACES THE BYTES CAN BE, AND THE CLIENT KNOWS ABOUT NEITHER.
 * `attachmentSrc(id)` is unchanged and every link already rendered on every
 * class page still points here. What changed underneath is that a row now
 * carries either a `storage_key` (0133, the private bucket) or a
 * `drive_file_id` (everything posted before it), and this route is the ONE
 * place that branches:
 *
 *   storage_key  -> mint a short-lived signed URL and 302 to it. The bytes go
 *                   browser <- Supabase, never through this function.
 *   drive_file_id -> stream it exactly as before, byte for byte.
 *
 * NOTHING WAS BACKFILLED, AND THAT IS WHY THIS BRANCH EXISTS RATHER THAN A
 * MIGRATION SCRIPT. Every handout already on a class page keeps resolving,
 * keeps its content type, and keeps rendering inline if it is an image -- which
 * is safe for exactly those rows, because they were filtered by the old
 * twelve-type allowlist on the way in.
 *
 * A STORAGE-BACKED OBJECT IS ALWAYS A DOWNLOAD. The signed URL carries
 * `download=<filename>`, so Supabase answers it `Content-Disposition:
 * attachment`, and it is served from the Supabase origin rather than ours.
 * Those two facts together are what pay for there being no type allowlist any
 * more: a `.html`, a `.svg` or anything else a person uploads cannot be
 * navigated into as a document on our origin. Do not add an inline branch here.
 *
 * AUTHORIZATION IS A REAL QUERY, NOT A CHECK WRITTEN HERE, on both halves. The
 * ROW is read under the CALLER'S OWN cookie session, so
 * `classroom_can_read_item` (0085) decides -- and the signed URL is minted on
 * that same session, so 0133's storage select policy decides a second time,
 * independently, using the same predicate. An empty result is 404, never 403.
 */

/** Immutable bytes, but WHO may see them is not (a post can be unpublished). */
const CACHE_CONTROL = 'private, max-age=60';

/**
 * The row, widest-first. `storage_key` arrived in 0133, and a deployment
 * sitting on the migration before it is a real state -- so the narrow rung is
 * what keeps every Drive-backed attachment resolving there rather than the
 * whole select failing on an unknown column.
 */
async function readAttachmentRow(
	supabase: App.Locals['supabase'],
	id: string
): Promise<{ drive_file_id?: string | null; storage_key?: string | null; filename?: string; mime_type?: string } | null> {
	const wide = await supabase
		.from('classroom_attachments')
		.select('drive_file_id, storage_key, filename, mime_type')
		.eq('id', id)
		.maybeSingle();
	if (!wide.error) return (wide.data ?? null) as never;

	const narrow = await supabase
		.from('classroom_attachments')
		.select('drive_file_id, filename, mime_type')
		.eq('id', id)
		.maybeSingle();
	if (narrow.error) return null;
	return (narrow.data ?? null) as never;
}

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
	 * So `?public=1` can only ever NARROW what this route will hand over.
	 *
	 * IT IS DRIVE-ONLY, AND THAT IS A STATED GAP RATHER THAN AN OVERSIGHT.
	 * `classroom_public_attachment` projects `drive_file_id` and nothing else,
	 * and 0133's storage policies are `to authenticated` -- so a signed URL
	 * cannot be minted with no session even if the row were readable. A
	 * storage-backed attachment on a public material therefore 404s here until
	 * a later migration widens that RPC and adds an anon-readable policy keyed
	 * on the same "published public material" predicate. Every attachment
	 * already on a public material is Drive-backed and unaffected.
	 */
	const wantsPublic = url.searchParams.get('public') === '1';

	if (!claims && !wantsPublic) {
		return json({ error: 'You must be signed in.' }, { status: 401 });
	}

	const id = params.attachment_id;
	if (!id || !UUID_RE.test(id)) {
		return new Response('Not found', { status: 404 });
	}

	if (wantsPublic) {
		if (!driveConfigured()) {
			return json({ error: 'File attachments are not configured on this deployment.' }, { status: 503 });
		}
		const { data, error } = await supabase.rpc('classroom_public_attachment', {
			p_attachment_id: id
		});
		const row = (data ?? null) as { drive_file_id?: string; filename?: string; mime_type?: string } | null;
		if (error || !row?.drive_file_id) {
			return new Response('Not found', { status: 404 });
		}
		return serveDriveFile(row.drive_file_id, row.filename ?? 'attachment', row.mime_type ?? '');
	}

	const row = await readAttachmentRow(supabase, id);
	if (!row) {
		return new Response('Not found', { status: 404 });
	}

	// ---- The 0133 path: hand back a signed URL and get out of the way. ----
	if (row.storage_key) {
		const name = row.filename ?? 'attachment';
		const { data: signed, error: signError } = await supabase.storage
			.from(CLASSROOM_ATTACHMENTS_BUCKET)
			.createSignedUrl(row.storage_key, DOWNLOAD_URL_TTL_SECONDS, {
				// THIS is what forces Content-Disposition: attachment. It is not
				// decoration -- see the header.
				download: downloadFilename(name)
			});
		// The ROW was readable, so the caller may see this file; storage refusing
		// to sign means the object is gone or the policy disagrees. 404, because
		// "not there" and "not yours" must answer identically.
		if (signError || !signed?.signedUrl) {
			return new Response('Not found', { status: 404 });
		}
		redirect(302, signed.signedUrl);
	}

	// ---- Everything posted before 0133. Unchanged. ----
	if (!driveConfigured()) {
		return json({ error: 'File attachments are not configured on this deployment.' }, { status: 503 });
	}
	if (!row.drive_file_id) {
		return new Response('Not found', { status: 404 });
	}
	return serveDriveFile(row.drive_file_id, row.filename ?? 'attachment', row.mime_type ?? '');
};

/**
 * Stream the bytes of a DRIVE-backed attachment. Reached ONLY after a caller
 * has proved they may see this file -- through their own RLS-scoped read or the
 * public RPC. Factored out so the authenticated and public branches cannot
 * drift on the content-type allowlist or the headers.
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
 * reports which handle the row carried and whether that handle is now
 * unreferenced -- ONE upload can back several rows (a multi-section publish, or
 * duplicating an item, which copies attachment rows by reference), so the bytes
 * go only when the last row referencing them does.
 *
 * TWO SWEEPERS, EACH TOLD ONLY ABOUT ITS OWN. The storage delete runs under the
 * caller's own session against 0133's delete policy, which admits exactly the
 * people who could have written the object in the first place.
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

	const result = data as
		| { drive_file_id?: string | null; storage_key?: string | null; orphaned?: boolean }
		| null;
	if (result?.orphaned) {
		if (result.storage_key) {
			await supabase.storage.from(CLASSROOM_ATTACHMENTS_BUCKET).remove([result.storage_key]);
		} else if (result.drive_file_id) {
			await deleteDriveFile(result.drive_file_id);
		}
	}
	return json({ ok: true });
};
