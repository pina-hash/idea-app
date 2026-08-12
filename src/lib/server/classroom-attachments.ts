/**
 * Classroom attachments: the media-type policy and the Drive naming, shared by
 * the upload route and the serving proxy. Server-only ($lib/server, so none of
 * this can be bundled into the client) -- the caps and allowlists here are
 * enforcement, not advice.
 *
 * The BYTES live in the school's Google shared drive through the existing
 * notebook Drive module (one OAuth egress point, one token cache,
 * supportsAllDrives on every call), in a CLASSROOM SUBFOLDER of the notebook
 * folder so the admin browsing that folder by eye is not looking at student
 * notebook pages and lesson handouts interleaved.
 */

import { ensureDriveSubfolder } from './notebook-drive';

/** Vercel serverless rejects request bodies past ~4.5 MB; stay safely under. */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

/** The subfolder created (once) inside the notebook folder. */
export const CLASSROOM_FOLDER_NAME = 'IDEA Classroom attachments';

/**
 * What a teacher may upload. Deliberately broader than the notebook's
 * image-only set (a handout is a PDF far more often than a photo) and
 * deliberately narrower than "anything": no SVG (it is a script container that
 * a browser will happily execute when served inline), no HTML, no archives, no
 * executables.
 */
const UPLOAD_TYPES: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/heic': 'heic',
	'image/heif': 'heif',
	'application/pdf': 'pdf',
	'text/plain': 'txt',
	'text/csv': 'csv',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx'
};

/**
 * The same allowlist keyed by extension, for a file the platform could not
 * type. `File.type` is REQUIRED to be empty when the OS has no mapping (the
 * notebook's readPhotoForm lesson, learned on real iPhone HEICs), so keying on
 * it alone rejects perfectly good uploads.
 */
const EXT_TYPES: Record<string, string> = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	gif: 'image/gif',
	heic: 'image/heic',
	heif: 'image/heif',
	pdf: 'application/pdf',
	txt: 'text/plain',
	csv: 'text/csv',
	docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
};

/**
 * What the proxy will echo back under its own declared type AND render inline.
 * Everything else is served as application/octet-stream with a download
 * disposition, because these bytes come from the app's own origin: a response
 * typed text/html there would run as same-origin script, and an inline SVG is
 * the same problem wearing an image extension.
 */
export const INLINE_TYPES: ReadonlySet<string> = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif',
	'image/heic',
	'image/heif',
	'application/pdf'
]);

/** True for the types the UI previews inline (the client mirrors this list). */
export function isPreviewableImage(mime: string): boolean {
	return mime.startsWith('image/') && INLINE_TYPES.has(mime.toLowerCase());
}

export interface AttachmentField {
	file: File;
	ext: string;
	/** Store the bytes under THIS, never `file.type` (see EXT_TYPES above). */
	mimeType: string;
	filename: string;
}

function resolveMime(file: File): { ext: string; mimeType: string } | null {
	const declared = file.type.trim().toLowerCase();
	const byType = UPLOAD_TYPES[declared];
	if (byType) return { ext: byType, mimeType: declared };
	const ext = file.name?.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
	const mimeType = ext ? EXT_TYPES[ext] : undefined;
	if (mimeType) return { ext: UPLOAD_TYPES[mimeType], mimeType };
	return null;
}

/** Validates the "file" form field: present, non-empty, capped, allowed type. */
export function readAttachmentForm(form: FormData): AttachmentField | { error: string; status: number } {
	const file = form.get('file');
	if (!(file instanceof File) || file.size === 0) {
		return { error: 'Attach a file as the "file" form field.', status: 400 };
	}
	if (file.size > MAX_ATTACHMENT_BYTES) {
		return {
			error: `Attachments are capped at ${Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB.`,
			status: 413
		};
	}
	const resolved = resolveMime(file);
	if (!resolved) {
		return {
			error: 'Attachments must be an image, PDF, text, CSV, or an Office document.',
			status: 400
		};
	}
	// A pasted screenshot arrives as a blob with a generic name ("image.png" or
	// nothing at all); give it something a teacher can recognise in a list.
	const raw = (file.name ?? '').trim();
	const filename = raw && raw !== 'blob' ? raw.slice(0, 300) : `pasted-image.${resolved.ext}`;
	return { file, ext: resolved.ext, mimeType: resolved.mimeType, filename };
}

/** The classroom subfolder id, created on first use. */
export function classroomFolderId(): Promise<string> {
	return ensureDriveSubfolder(CLASSROOM_FOLDER_NAME);
}

/**
 * Student submission files get their OWN subfolder beside the handouts one --
 * the same "not interleaved when browsed by eye" doctrine that split classroom
 * attachments off the notebook pages in the first place.
 */
export const SUBMISSIONS_FOLDER_NAME = 'IDEA Classroom submissions';

export function submissionsFolderId(): Promise<string> {
	return ensureDriveSubfolder(SUBMISSIONS_FOLDER_NAME);
}

/**
 * The human-readable Drive filename, the notebookDriveFilename convention:
 * {date}_{course-section}_{owner-kind}_{original-stem}_{short-id}.{ext}. The
 * database only ever stores the file id, so this is presentation for whoever
 * browses the folder -- nothing reads it back.
 */
export function attachmentDriveFilename(opts: {
	sectionSlug: string | null | undefined;
	ownerKind: string;
	originalFilename: string;
	shortId: string;
	ext: string;
}): string {
	const date = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'America/Los_Angeles',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date());
	const slug = (raw: string, cap: number, fallback: string) => {
		const s = (raw ?? '')
			.toLowerCase()
			.replace(/\s+/g, '-')
			.replace(/[^a-z0-9-]/g, '')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, cap)
			.replace(/-$/, '');
		return s || fallback;
	};
	const stem = opts.originalFilename.replace(/\.[^.]+$/, '');
	return [
		date,
		slug(opts.sectionSlug ?? '', 40, 'class'),
		slug(opts.ownerKind, 12, 'item'),
		slug(stem, 40, 'file'),
		opts.shortId
	].join('_') + `.${opts.ext}`;
}
