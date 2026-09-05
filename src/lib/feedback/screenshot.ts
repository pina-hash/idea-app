/**
 * ONE SCREENSHOT ON A REPORT: what is accepted, how it is named, and where the
 * bytes go.
 *
 * WHY BYTES AND NOT A FILENAME OR `File.type`. Everything on this path is
 * chosen by the person uploading: the name, the extension, and the media type
 * the browser reports. `File.type` is a GUESS -- legitimately EMPTY for a HEIC
 * off an iPhone, and freely settable by anything that is not a file picker --
 * and it is the value the storage client would otherwise declare to Supabase,
 * which is what the bucket's own type list is checked against. So the type is
 * DERIVED FROM THE FIRST BYTES here and the derived value is what gets
 * declared. A file whose bytes are not a PNG, a JPEG or a WebP never reaches
 * the network.
 *
 * THAT IS THE HALF `allowed_mime_types` CANNOT DO. Storage enforces its list at
 * upload against the request's DECLARED type and does not inspect bytes (0168
 * says so in its own header). The two together are the gate: the client will
 * not declare a type the bytes do not support, and the bucket will not accept a
 * type outside its list. Neither alone is enough, and this file is the first
 * half.
 *
 * WHAT IS DELIBERATELY NOT HERE: an `accept` attribute on the picker. The
 * classroom rule is "no `accept` on a plain picker", and the reasoning carries:
 * an `accept` list hides files rather than refusing them, and a person whose
 * screenshot is filtered out of their own file dialog is given no sentence at
 * all. This refuses, in words, with the reason.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** The private bucket 0170 creates. Never public, never navigated to. */
export const FEEDBACK_MEDIA_BUCKET = 'feedback-media';

/**
 * 8 MiB. The CLIENT copy of `storage.buckets.file_size_limit`, so a hopeless
 * pick is refused before anybody waits on a school connection; the boundary is
 * the bucket's own limit, which is enforced by Storage and cannot be talked
 * past from here.
 *
 * Sized against what this path carries: a full-screen PNG at 2560x1440 is
 * comfortably under 4 MB, and a phone photograph of a screen is under 8. It is
 * not the classroom's 200 MiB, because nothing here is a CAD assembly.
 */
export const FEEDBACK_SCREENSHOT_MAX_BYTES = 8 * 1024 * 1024;

/**
 * The three types, and the extension each one takes in the object key. The
 * SAME three the bucket admits, and the same three the row's CHECK admits as
 * an extension -- three statements of one list, in three languages, which is
 * why the test asserts them against each other rather than each on its own.
 *
 * SVG IS ABSENT AND IS THE WHOLE POINT: it is a document, not a picture, and it
 * carries script, external references and event handlers. HEIC is absent for a
 * different reason -- Chrome and Firefox do not decode it, so a HEIC would be a
 * broken thumbnail on the one screen that needed to see it.
 */
export const FEEDBACK_SCREENSHOT_TYPES = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp'
} as const;

export type FeedbackScreenshotType = keyof typeof FEEDBACK_SCREENSHOT_TYPES;

/** The words the refusals use, so the form and the tests read one list. */
export const FEEDBACK_SCREENSHOT_TYPE_WORDS = 'PNG, JPEG or WebP';

/**
 * WHICH OF THE THREE TYPES THESE BYTES ACTUALLY ARE, or null.
 *
 * A pure function over the first bytes of the file, so it is assertable with no
 * browser and no network. Each signature is the file format's own magic number:
 *
 *   PNG   the 8-byte signature, which includes the CRLF/LF pair that exists to
 *         detect a corrupted text-mode transfer.
 *   JPEG  the SOI marker `FF D8 FF`. The fourth byte varies by encoder
 *         (`E0` JFIF, `E1` Exif, `DB`, `EE`), so it is deliberately not tested.
 *   WebP  a RIFF container whose form type is `WEBP`, which is bytes 8..11 --
 *         so `RIFF` alone is NOT enough (a .wav is also RIFF).
 *
 * A LONGER FILE IS NOT READ. Sniffing more would not make the answer better:
 * what the browser and Storage both key on is the leading signature, and a file
 * that lies past byte 12 is a file that fails to decode rather than one that
 * executes -- these three formats have no script surface at all, which is the
 * property that makes an allowlist of three enough.
 */
export function sniffImageType(bytes: Uint8Array): FeedbackScreenshotType | null {
	const at = (i: number) => bytes[i];
	if (
		bytes.length >= 8 &&
		at(0) === 0x89 &&
		at(1) === 0x50 &&
		at(2) === 0x4e &&
		at(3) === 0x47 &&
		at(4) === 0x0d &&
		at(5) === 0x0a &&
		at(6) === 0x1a &&
		at(7) === 0x0a
	) {
		return 'image/png';
	}
	if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) {
		return 'image/jpeg';
	}
	if (
		bytes.length >= 12 &&
		at(0) === 0x52 &&
		at(1) === 0x49 &&
		at(2) === 0x46 &&
		at(3) === 0x46 &&
		at(8) === 0x57 &&
		at(9) === 0x45 &&
		at(10) === 0x42 &&
		at(11) === 0x50
	) {
		return 'image/webp';
	}
	return null;
}

/** How many bytes `sniffImageType` needs. Read once, off the front of the file. */
export const FEEDBACK_SNIFF_BYTES = 12;

/**
 * Bytes to a short human string, for a refusal that STATES THE SIZE AND THE
 * LIMIT. "Too large" with no number is a guessing game.
 */
export function formatScreenshotBytes(bytes: number): string {
	if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${bytes} bytes`;
}

/**
 * Why this file cannot be attached, or null.
 *
 * THE SIZE IS CHECKED FROM `File.size` BEFORE THE TRANSFER, which is 0163's own
 * instruction one subsystem over: a refusal after a minute of school wifi is
 * the same refusal at the worst possible moment. The TYPE is checked from the
 * sniffed value, which the caller has already read off the front of the file.
 */
export function feedbackScreenshotIssue(
	file: { size: number; name?: string },
	sniffed: FeedbackScreenshotType | null
): string | null {
	if (file.size === 0) return 'That file is empty. Try taking the screenshot again.';
	if (file.size > FEEDBACK_SCREENSHOT_MAX_BYTES) {
		return (
			`That image is ${formatScreenshotBytes(file.size)}, and the limit is ` +
			`${formatScreenshotBytes(FEEDBACK_SCREENSHOT_MAX_BYTES)}. Nothing about retrying will ` +
			'change that: crop it, or shrink it, and try again.'
		);
	}
	if (!sniffed) {
		return (
			`That is not a ${FEEDBACK_SCREENSHOT_TYPE_WORDS} image. Those three are what this ` +
			'accepts, whatever the file is called: an SVG is a document rather than a picture, ' +
			'and a HEIC from an iPhone will not open in most browsers.'
		);
	}
	return null;
}

/**
 * WHERE THE OBJECT GOES: `<user id>/<uuid>.<ext>`.
 *
 * THE KEY LAYOUT IS THE AUTHORIZATION, and it is the avatars shape (0020) that
 * every own-folder bucket in this repo uses: the storage policies compare the
 * first path segment against `auth.uid()`, and 0170's CHECK on the row compares
 * the same segment against the row's own author. So a key that names the wrong
 * folder is refused twice, by two different mechanisms, before anybody has to
 * remember anything.
 *
 * NOTHING A PERSON TYPED APPEARS IN IT, which takes filename sanitization off
 * the security surface entirely rather than making it careful. The name they
 * picked is not stored at all -- a screenshot has no name worth keeping, and the
 * report beside it is what says what the picture is of.
 */
export function feedbackScreenshotKey(
	userId: string,
	uuid: string,
	type: FeedbackScreenshotType
): string {
	return `${userId}/${uuid}.${FEEDBACK_SCREENSHOT_TYPES[type]}`;
}

/** The shape 0170's CHECK admits, mirrored so a test can assert one against the other. */
export const FEEDBACK_SCREENSHOT_KEY_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/;

export interface ScreenshotUpload {
	/** The stored key, on success. */
	path: string | null;
	/** The sentence to show, on refusal or failure. */
	error: string | null;
	/** Whether re-sending the identical bytes could succeed. */
	retryable: boolean;
	/** The sniffed type, for the preview. Null when nothing was uploaded. */
	type: FeedbackScreenshotType | null;
}

/** Just enough of `crypto.randomUUID`, injectable so a test can pin the key. */
type UuidFn = () => string;

/**
 * Read, sniff, refuse or upload. ONE call, from the moment a file is picked,
 * pasted or dropped.
 *
 * THE UPLOAD HAPPENS AT STAGE, NOT AT SEND, and that is the whole ordering
 * decision. The row's CHECK requires a key that already names a real object, so
 * something has to go first; doing it here means a refusal (too big, not an
 * image, storage said no) is reported BESIDE THE CONTROL that caused it, at the
 * moment it happened, and the report itself never depends on it. A failed
 * attachment never takes the post with it, which is exactly what the classroom
 * file rule asks for.
 *
 * WHAT THAT COSTS, NAMED RATHER THAN HIDDEN: a person who attaches an image and
 * then closes the box leaves an ORPHANED OBJECT -- bytes in a private bucket
 * that no row names. That is the acceptable failure of the two, the same way
 * round as the Foundry delete: the object is readable only by its own uploader
 * and an admin, it is listed by nothing, and it costs storage. The alternative
 * (upload on send) would mean a person watching their whole report fail because
 * a picture would not go, which is the failure that loses work.
 *
 * IT NEVER THROWS. Every outcome is a value, because the box is showing a form
 * somebody is part-way through.
 */
export async function uploadFeedbackScreenshot(
	supabase: SupabaseClient,
	userId: string,
	file: File,
	uuid: UuidFn = () => crypto.randomUUID()
): Promise<ScreenshotUpload> {
	let sniffed: FeedbackScreenshotType | null = null;
	try {
		const head = new Uint8Array(await file.slice(0, FEEDBACK_SNIFF_BYTES).arrayBuffer());
		sniffed = sniffImageType(head);
	} catch {
		return {
			path: null,
			error: 'That file could not be read. Try picking it again.',
			retryable: true,
			type: null
		};
	}

	const issue = feedbackScreenshotIssue(file, sniffed);
	// A refusal is a decision about these bytes; re-sending them cannot change
	// it, and a control that retried would ask the same question five times.
	if (issue || !sniffed) return { path: null, error: issue, retryable: false, type: null };

	const path = feedbackScreenshotKey(userId, uuid(), sniffed);
	const { error } = await supabase.storage.from(FEEDBACK_MEDIA_BUCKET).upload(path, file, {
		// THE SNIFFED TYPE, NEVER `file.type`. This is the value the bucket's own
		// list is checked against, so it must be the one the bytes support.
		contentType: sniffed,
		upsert: false
	});
	if (error) {
		return {
			path: null,
			error: `That screenshot did not upload. ${error.message}`,
			// A storage failure with no considered refusal behind it is worth one
			// more attempt; the person presses the control again.
			retryable: true,
			type: null
		};
	}
	return { path, error: null, retryable: false, type: sniffed };
}
