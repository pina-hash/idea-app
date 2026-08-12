import { json } from '@sveltejs/kit';
import { deleteDriveFile, driveConfigured, uploadDriveFile } from '$lib/server/notebook-drive';
import {
	attachmentDriveFilename,
	readAttachmentForm,
	submissionsFolderId
} from '$lib/server/classroom-attachments';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * Attaches one file to the CALLER'S OWN submission on one assignment -- the
 * student half of /api/classroom/attachment, and the same shape throughout:
 * upload to Drive first (the row stores the file id, so the file must exist),
 * then the SECURITY DEFINER RPC, and a refused RPC sweeps the just-uploaded
 * blob back off Drive so nothing orphaned is left behind.
 *
 * AUTHORIZATION IS THE RPC'S: classroom_add_submission_file resolves the
 * caller from their own session (no email parameter exists), requires active
 * enrollment in a class the published assignment is posted to, refuses a
 * locked (submitted) submission, and validates the imageZone block id against
 * the spec. The 401 below only keeps anonymous callers away from Drive.
 *
 * multipart/form-data fields:
 *   file      the file (required; same allowlist as classroom attachments)
 *   item_id   uuid of the assignment item (required)
 *   block_id  imageZone block this photo belongs to (optional)
 *   caption   caption for an imageZone photo (optional)
 */

export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ error: 'You must be signed in.' }, { status: 401 });
	}
	if (!driveConfigured()) {
		return json({ error: 'File uploads are not configured on this deployment.' }, { status: 503 });
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
	const blockId = String(form.get('block_id') ?? '').trim() || null;
	const caption = String(form.get('caption') ?? '').trim() || null;

	const email = (claims.email as string | undefined) ?? '';
	const bytes = new Uint8Array(await read.file.arrayBuffer());
	let fileId: string;
	try {
		fileId = await uploadDriveFile({
			bytes,
			mimeType: read.mimeType,
			filename: attachmentDriveFilename({
				sectionSlug: email.split('@')[0] || 'student',
				ownerKind: 'submission',
				originalFilename: read.filename,
				shortId: itemId.slice(0, 8),
				ext: read.ext
			}),
			parentId: await submissionsFolderId()
		});
	} catch (e) {
		return json({ error: (e as Error).message || 'Drive upload failed.' }, { status: 502 });
	}

	const { data, error } = await supabase.rpc('classroom_add_submission_file', {
		p_item_id: itemId,
		p_drive_file_id: fileId,
		p_filename: read.filename,
		p_mime_type: read.mimeType,
		p_size_bytes: read.file.size,
		p_block_id: blockId,
		p_caption: caption
	});
	if (error) {
		await deleteDriveFile(fileId);
		return json({ error: error.message }, { status: 400 });
	}

	const result = data as { ok?: boolean; reason?: string; file_id?: string; submission_id?: string };
	if (result?.ok === false) {
		// A structured refusal (locked / approval_pending): nothing was written,
		// so the uploaded blob has no row and goes back off Drive too.
		await deleteDriveFile(fileId);
		return json({ ok: false, reason: result.reason ?? 'refused' });
	}

	return json({
		ok: true,
		file: {
			id: result.file_id,
			submission_id: result.submission_id,
			block_id: blockId,
			caption,
			filename: read.filename,
			mime_type: read.mimeType,
			size_bytes: read.file.size
		}
	});
};
