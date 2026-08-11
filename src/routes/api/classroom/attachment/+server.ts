import { json } from '@sveltejs/kit';
import { deleteDriveFile, driveConfigured, uploadDriveFile } from '$lib/server/notebook-drive';
import {
	attachmentDriveFilename,
	classroomFolderId,
	readAttachmentForm
} from '$lib/server/classroom-attachments';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * Attaches one file to one canonical classroom item.
 *
 * THE ORDER IS: upload to Drive, then call the RPC -- the same shape
 * /api/notebook/upload uses, and for the same reason: the row stores the file
 * id, so the file has to exist first. A refused RPC sweeps the just-uploaded
 * blob back off Drive so a rejected attach leaves nothing behind.
 *
 * ONE ITEM, ONE ROW. 0083 took a LIST of owners because a multi-section publish
 * made one content row per section; since 0085 there is a single canonical
 * record, so a handout posted to three classes is one upload and one row. The
 * orphan check on the delete path stays, because DUPLICATING an item copies its
 * attachment rows by reference -- one blob can still back several rows.
 *
 * AUTHORIZATION IS THE RPC'S, not this route's: it runs under the caller's own
 * cookie session and classroom_add_attachment re-checks that the caller manages
 * every class the item is posted to. The 401 below is only so an anonymous
 * caller never reaches Drive at all.
 *
 * multipart/form-data fields:
 *   file     the attachment (required)
 *   item_id  uuid of the canonical item (required)
 */

export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ error: 'You must be signed in.' }, { status: 401 });
	}
	if (!driveConfigured()) {
		return json({ error: 'File attachments are not configured on this deployment.' }, { status: 503 });
	}

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return json({ error: 'Expected multipart/form-data.' }, { status: 400 });
	}

	const read = readAttachmentForm(form);
	if ('error' in read) {
		return json({ error: read.error }, { status: read.status });
	}

	const itemId = String(form.get('item_id') ?? '').trim();
	if (!UUID_RE.test(itemId)) {
		return json({ error: 'item_id must be a uuid.' }, { status: 400 });
	}

	// Best-effort context for the Drive filename only. A failure here degrades
	// the NAME and nothing else, so it is never allowed to fail the upload.
	let sectionSlug: string | null = null;
	let itemKind = 'item';
	try {
		const [{ data: posting }, { data: item }] = await Promise.all([
			supabase
				.from('classroom_postings')
				.select('classroom_sections(label, classroom_courses(code))')
				.eq('item_id', itemId)
				.limit(1)
				.maybeSingle(),
			supabase.from('classroom_items').select('kind').eq('id', itemId).maybeSingle()
		]);
		const section = (posting as Record<string, unknown> | null)?.classroom_sections as
			| { label?: string; classroom_courses?: { code?: string } | { code?: string }[] }
			| null
			| undefined;
		const course = Array.isArray(section?.classroom_courses)
			? section?.classroom_courses[0]
			: section?.classroom_courses;
		sectionSlug = [course?.code, section?.label].filter(Boolean).join('-') || null;
		itemKind = (item as { kind?: string } | null)?.kind ?? 'item';
	} catch {
		sectionSlug = null;
	}

	const bytes = new Uint8Array(await read.file.arrayBuffer());
	let fileId: string;
	try {
		fileId = await uploadDriveFile({
			bytes,
			mimeType: read.mimeType,
			filename: attachmentDriveFilename({
				sectionSlug,
				ownerKind: itemKind,
				originalFilename: read.filename,
				shortId: itemId.slice(0, 8),
				ext: read.ext
			}),
			parentId: await classroomFolderId()
		});
	} catch (e) {
		return json({ error: (e as Error).message || 'Drive upload failed.' }, { status: 502 });
	}

	const { data, error } = await supabase.rpc('classroom_add_attachment', {
		p_item_id: itemId,
		p_drive_file_id: fileId,
		p_filename: read.filename,
		p_mime_type: read.mimeType,
		p_size_bytes: read.file.size
	});
	if (error) {
		await deleteDriveFile(fileId);
		return json({ error: error.message }, { status: 400 });
	}

	return json({ ok: true, drive_file_id: fileId, result: data });
};
