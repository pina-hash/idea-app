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
 * Attaches one file to one or more classroom posts (or assignments).
 *
 * THE ORDER IS: upload to Drive, then call the RPC -- the same shape
 * /api/notebook/upload uses, and for the same reason: the row stores the file
 * id, so the file has to exist first. A refused RPC sweeps the just-uploaded
 * blob back off Drive so a rejected attach leaves nothing behind.
 *
 * PLURAL OWNERS, ONE UPLOAD. A multi-section publish produced N independent
 * rows and the same handout belongs on all of them; uploading N copies would
 * put N identical files in the shared drive. So the bytes go up ONCE and
 * classroom_add_attachment writes one row per owner against that single file
 * id. (Which is why the delete path checks for orphans before removing a blob.)
 *
 * AUTHORIZATION IS THE RPC'S, not this route's: it runs under the caller's own
 * cookie session and classroom_add_attachment re-checks
 * classroom_manages_section for EVERY named owner, all-or-nothing. The 401
 * below is only so an anonymous caller never reaches Drive at all.
 *
 * multipart/form-data fields:
 *   file        the attachment (required)
 *   owner_kind  'post' | 'assignment' (required)
 *   owner_ids   comma-separated uuids of the rows to attach to (required)
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

	const ownerKind = String(form.get('owner_kind') ?? '').trim().toLowerCase();
	if (ownerKind !== 'post' && ownerKind !== 'assignment') {
		return json({ error: "owner_kind must be 'post' or 'assignment'." }, { status: 400 });
	}
	const ownerIds = String(form.get('owner_ids') ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	if (ownerIds.length === 0 || ownerIds.length > 50 || !ownerIds.every((id) => UUID_RE.test(id))) {
		return json({ error: 'owner_ids must be 1-50 uuids.' }, { status: 400 });
	}

	// Best-effort context for the Drive filename only. A failure here degrades
	// the NAME and nothing else, so it is never allowed to fail the upload.
	let sectionSlug: string | null = null;
	try {
		const { data } = await supabase
			.from(ownerKind === 'post' ? 'classroom_posts' : 'classroom_assignments')
			.select('classroom_sections(label, classroom_courses(code))')
			.eq('id', ownerIds[0])
			.maybeSingle();
		const section = (data as Record<string, unknown> | null)?.classroom_sections as
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
				ownerKind,
				originalFilename: read.filename,
				shortId: ownerIds[0].slice(0, 8),
				ext: read.ext
			}),
			parentId: await classroomFolderId()
		});
	} catch (e) {
		return json({ error: (e as Error).message || 'Drive upload failed.' }, { status: 502 });
	}

	const { data, error } = await supabase.rpc('classroom_add_attachment', {
		p_owner_kind: ownerKind,
		p_owner_ids: ownerIds,
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
