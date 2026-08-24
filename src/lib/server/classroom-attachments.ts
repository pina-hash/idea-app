/**
 * Classroom attachments: WHERE the bytes go, WHAT a key looks like, and the
 * one content type anything uploaded is ever stored or served as.
 *
 * Server-only ($lib/server, so none of this can be bundled into the client).
 *
 * ---------------------------------------------------------------------------
 * THERE IS NO TYPE ALLOWLIST HERE ANY MORE, AND THAT IS THE POINT.
 *
 * This module used to hold two twelve-entry maps -- one keyed on `File.type`,
 * one on the filename extension -- and refuse anything outside them. It was
 * written for a world where the bytes were served back FROM THE APP'S OWN
 * ORIGIN, where a `text/html` response runs as same-origin script and an SVG
 * is that same problem wearing an image extension. In that world the list was
 * the whole of the defence, so it had to be narrow.
 *
 * It also refused `.SLDPRT`, `.SLDASM`, `.STEP`, `.DXF`, `.f3d`, `.dwg`,
 * `.ino` and every archive -- which is to say, essentially everything an
 * engineering class actually produces. A student handing in a CAD part was
 * told their file "must be an image, PDF, text, CSV, or an Office document".
 *
 * The world changed with 0133. Bytes now live in a PRIVATE Supabase bucket,
 * they are read back through a short-lived signed URL on a DIFFERENT ORIGIN,
 * that URL carries `Content-Disposition: attachment`, and every object is
 * stored as `application/octet-stream`. Nothing a person uploaded is rendered
 * inline by us, anywhere. THAT is what makes the type list unnecessary rather
 * than merely inconvenient, and it is why removing the list is safe here and
 * would not have been before. If any of those three properties is ever
 * weakened, the list does not come back -- the property does.
 *
 * ---------------------------------------------------------------------------
 * ONE CONTENT TYPE, ALWAYS, AND IT IS NOT THE BROWSER'S GUESS.
 *
 * `File.type` is a guess: it comes from the OS's extension mapping, it is
 * REQUIRED to be empty when the platform has no mapping (the HEIC-off-an-
 * iPhone lesson), and it is chosen by whoever is uploading. Storing it would
 * mean a person picks the content type a browser later sees. So nothing here
 * reads it. Every object is stored and served as octet-stream, and the
 * original filename -- which IS worth keeping, verbatim -- rides in its own
 * column and is what a person sees in a list.
 */

import { ensureDriveSubfolder } from './notebook-drive';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// The storage path (0133)
// ---------------------------------------------------------------------------

export const CLASSROOM_ATTACHMENTS_BUCKET = 'classroom-attachments';
export const SUBMISSION_FILES_BUCKET = 'submission-files';

/**
 * 200 MiB, matching `file_size_limit` on both buckets in 0133.
 *
 * Duplicated in the sense that Storage enforces it too -- deliberately. The
 * bucket limit is the BOUNDARY and cannot be talked past; this constant exists
 * so a 300 MB pick can be refused in the browser, before a person waits out an
 * upload that was never going to land. The two are asserted equal in
 * tests/classroom-attachment-mime.test.ts.
 */
export const MAX_STORAGE_BYTES = 209715200;

/**
 * THE ONE CONTENT TYPE. See the header. Never `file.type`, never a lookup, and
 * never a per-file decision.
 */
export const STORAGE_CONTENT_TYPE = 'application/octet-stream';

/** How long a download URL lives. Long enough to click, short enough that a
 *  copied link is not a permanent grant -- WHO may read an object changes
 *  (an item is unpublished, a student transfers) and a signed URL cannot be
 *  withdrawn inside its own lifetime. */
export const DOWNLOAD_URL_TTL_SECONDS = 120;

/** How long the browser has to start the upload after the URL is minted. */
export const UPLOAD_URL_TTL_SECONDS = 2 * 60 * 60;

/**
 * The lowercased extension of a filename, WITHOUT the dot, or '' when there is
 * none. Deliberately tolerant: a file with no extension at all is a perfectly
 * ordinary thing to hand in (a Makefile, a `.gitignore`, a dumped log), and it
 * is not this function's business to have an opinion about it.
 *
 * Bounded at 12 characters because it becomes part of a storage key and an
 * unbounded tail is somebody's idea of a path.
 */
export function fileExtension(filename: string | null | undefined): string {
	const m = (filename ?? '').toLowerCase().match(/\.([a-z0-9]{1,12})$/);
	return m ? m[1] : '';
}

/**
 * THE STORAGE KEY, and it is OPAQUE ON PURPOSE.
 *
 *   <owner_id>/<uuid>.<ext>
 *
 * The owner id is the classroom item (attachments) or the submission
 * (hand-ins), and 0133's policies read exactly that first segment to decide
 * who may write and who may read. Everything after it is a fresh uuid.
 *
 * NOTHING A PERSON TYPED APPEARS IN A KEY. That is what takes filename
 * sanitization off the security surface entirely rather than making it
 * careful: there is no traversal to escape, no encoding to get wrong, no
 * accent to normalize, no collision between two people's `report.pdf`. The
 * name they typed is stored beside the key and is what they see.
 *
 * The extension is kept because it is the only part of a name that a tool
 * downstream reads, and losing it means a downloaded `.SLDPRT` opens in
 * nothing. It is lowercased; the DISPLAY name keeps its original case.
 */
export function storageObjectKey(ownerId: string, filename: string): string {
	const ext = fileExtension(filename);
	return `${ownerId}/${randomUUID()}${ext ? `.${ext}` : ''}`;
}

/**
 * The `download` value handed to `createSignedUrl`, which is what turns the
 * response into `Content-Disposition: attachment`.
 *
 * IT IS ASCII-ONLY, AND THAT IS A MEASUREMENT RATHER THAN A PREFERENCE.
 * The first version passed the name through almost untouched -- spaces,
 * parentheses and accents included -- on the reasoning that the name somebody
 * typed is the name they should get back. Measured against a real Supabase
 * project, `Estudio (final) café.SLDPRT` came back as
 *
 *   content-disposition: attachment; filename=Estudio%20%2528final%2529%20caf%25C3%25A9.SLDPRT
 *
 * `%2528` is a percent-encoded `%28`: the value is encoded on its way into the
 * signed URL's query string and encoded AGAIN on its way into the header, so a
 * browser saves the file with literal percent escapes in its name. Every
 * fixture whose name was `[A-Za-z0-9.-]` came back clean; every one that was
 * not came back mangled. The two encoding layers are not ours to fix, so what
 * is ours is to hand over a value that survives both.
 *
 * WHAT IS LOST IS ONLY THE SAVED FILENAME, and only its punctuation. The name
 * the person typed is stored verbatim in `filename` and is what every surface
 * in the app shows them -- which is the half that matters and the half the
 * opaque storage key exists to protect. Diacritics are folded to their base
 * letters rather than dropped (`café` -> `cafe`, not `caf_`), because a
 * transliteration is still readable and a hole is not.
 */
export function downloadFilename(filename: string | null | undefined): string {
	const cleaned = (filename ?? '')
		// Fold diacritics: decompose, then drop the combining marks.
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		// Everything a browser or a header would have to escape becomes one
		// underscore. Spaces, parentheses, quotes, both path separators and every
		// control character are all in here by construction rather than by name.
		.replace(/[^A-Za-z0-9._-]+/g, '_')
		.replace(/_{2,}/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 200);
	return cleaned || 'download';
}

// ---------------------------------------------------------------------------
// The Drive path, which is now LEGACY READS plus one live writer
// ---------------------------------------------------------------------------

/**
 * The cap on anything still travelling THROUGH the function to Drive.
 *
 * This is a platform number, not a policy one: those bytes are buffered whole
 * in a serverless request. It applies to exactly one live upload path now --
 * instructor-only material (`/api/classroom/instructor-attachment`), which
 * 0133 did not give a bucket because its read rule is manager-only and it
 * therefore cannot share the `classroom-attachments` prefix. Student-facing
 * attachments and hand-ins no longer touch it.
 */
export const MAX_DRIVE_ATTACHMENT_BYTES = 4 * 1024 * 1024;

/** The subfolder created (once) inside the notebook folder. */
export const CLASSROOM_FOLDER_NAME = 'IDEA Classroom attachments';

/**
 * What the DRIVE proxy will echo back under its own declared type and render
 * inline. This set is now about ONE thing only: attachments posted before
 * 0133, which were filtered by the old twelve-type allowlist on the way in and
 * are therefore known to be images and PDFs. It is what keeps every handout
 * already on a class page rendering exactly as it does today.
 *
 * IT DOES NOT APPLY TO ANYTHING NEW. A storage-backed object is served by
 * Supabase, on another origin, as octet-stream with an attachment
 * disposition, and never passes through here. Do not add to this set to make
 * a new type render inline -- that is the property the missing allowlist is
 * paid for by.
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
	/** ALWAYS octet-stream. See the header. */
	mimeType: string;
	filename: string;
}

/**
 * Validates the "file" form field on the one remaining multipart upload:
 * present, non-empty, and inside the Drive-path size cap.
 *
 * THE TYPE CHECK IS GONE. What used to live here refused a file for what it
 * was; nothing does now, on either side. A `.SLDPRT`, a `.zip`, a file with no
 * extension at all and a file the browser could not type all pass, and are all
 * stored and served as octet-stream.
 */
export function readAttachmentForm(form: FormData): AttachmentField | { error: string; status: number } {
	const file = form.get('file');
	if (!(file instanceof File) || file.size === 0) {
		return { error: 'Attach a file as the "file" form field.', status: 400 };
	}
	if (file.size > MAX_DRIVE_ATTACHMENT_BYTES) {
		return {
			error:
				`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. Instructor-only files are ` +
				`capped at ${Math.floor(MAX_DRIVE_ATTACHMENT_BYTES / 1024 / 1024)} MB because they ` +
				'still upload through the site. Student-facing files on this item are not.',
			status: 413
		};
	}
	const ext = fileExtension(file.name);
	// A pasted screenshot arrives as a blob with a generic name ("image.png" or
	// nothing at all); give it something a teacher can recognise in a list.
	const raw = (file.name ?? '').trim();
	const filename = raw && raw !== 'blob' ? raw.slice(0, 300) : `pasted-image.${ext || 'png'}`;
	return { file, ext, mimeType: STORAGE_CONTENT_TYPE, filename };
}

/** The classroom subfolder id, created on first use. */
export function classroomFolderId(): Promise<string> {
	return ensureDriveSubfolder(CLASSROOM_FOLDER_NAME);
}

/**
 * Student submission files got their OWN subfolder beside the handouts one.
 * Nothing writes here since 0133 -- hand-ins go to the `submission-files`
 * bucket -- but the folder and this helper stay for the rows that are already
 * in it.
 */
export const SUBMISSIONS_FOLDER_NAME = 'IDEA Classroom submissions';

export function submissionsFolderId(): Promise<string> {
	return ensureDriveSubfolder(SUBMISSIONS_FOLDER_NAME);
}

/**
 * Instructor-only material (answer keys, facilitation guides, setup notes)
 * gets its own subfolder NESTED INSIDE the classroom attachments folder --
 * "under the existing classroom parent" -- rather than a sibling of it under
 * the notebook root. It is the one classroom Drive folder no student-facing
 * link ever points at; keeping it visually and structurally apart from the
 * handouts folder (rather than merely a different upload flow writing into
 * the same place) is what makes an admin browsing by eye unable to confuse
 * the two.
 *
 * THIS IS THE ONE PATH STILL WRITING TO DRIVE. See MAX_DRIVE_ATTACHMENT_BYTES.
 */
export const INSTRUCTOR_MATERIALS_FOLDER_NAME = 'Instructor only';

export async function instructorMaterialsFolderId(): Promise<string> {
	return ensureDriveSubfolder(INSTRUCTOR_MATERIALS_FOLDER_NAME, await classroomFolderId());
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
	].join('_') + (opts.ext ? `.${opts.ext}` : '');
}
