import { json } from '@sveltejs/kit';
import { deleteDriveFile, driveConfigured, uploadDriveFile } from '$lib/server/notebook-drive';
import {
	attachmentDriveFilename,
	instructorMaterialsFolderId,
	readAttachmentForm
} from '$lib/server/classroom-attachments';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * Attaches one INSTRUCTOR-ONLY file to one canonical classroom item -- an
 * answer key, a facilitation guide, a setup note. Mirrors
 * /api/classroom/attachment exactly in shape (upload to Drive, then the RPC;
 * a refused RPC sweeps the just-uploaded blob), with two differences: the
 * bytes land in the instructor-only Drive subfolder, and the RPC
 * (classroom_add_instructor_attachment, 0090) re-checks
 * _classroom_manages_item -- the SAME bar as the student-facing attach, since
 * this too follows the canonical item across every class it is posted to.
 *
 * AUTHORIZATION IS THE RPC'S, not this route's; the 401 below is only so an
 * anonymous caller never reaches Drive at all.
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

	// Best-effort context for the Drive filename only -- a failure here
	// degrades the NAME and nothing else.
	let sectionSlug: string | null = null;
	try {
		const { data: posting } = await supabase
			.from('classroom_postings')
			.select('classroom_sections(label, classroom_courses(code))')
			.eq('item_id', itemId)
			.limit(1)
			.maybeSingle();
		const section = (posting as Record<string, unknown> | null)?.classroom_sections as
			| { label?: string; classroom_courses?: { code?: string } | { code?: string }[] }
			| null
			| undefined;
		const course = Array.isArray(section?.classroom_courses)
			? section?.classroom_courses[0]
			: section?.classroom_courses;
		sectionSlug = [course?.code, section?.label].filter(Boolean).join('-') || null;
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
				ownerKind: 'instructor',
				originalFilename: read.filename,
				shortId: itemId.slice(0, 8),
				ext: read.ext
			}),
			parentId: await instructorMaterialsFolderId()
		});
	} catch (e) {
		return json({ error: (e as Error).message || 'Drive upload failed.' }, { status: 502 });
	}

	const { data, error } = await supabase.rpc('classroom_add_instructor_attachment', {
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
