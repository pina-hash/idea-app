/**
 * EVERY UPLOAD CEILING IN THE PORTAL, IN ONE PLACE, INCLUDING THE ONES THAT DO
 * NOT LIVE IN THIS REPOSITORY.
 *
 * WHY THIS EXISTS. Two students filed a report on the same day. One said "file
 * size limit at 25 mb". The other said "failed upload" and nothing else. No 25
 * MB limit exists anywhere in this tree -- swept, and every "25 MB" in `src/`
 * is prose in a comment -- so the number a student read came from a sentence
 * this application passed through from somewhere else without understanding
 * it, and the second report is what the same failure looks like when the
 * sentence carried no number at all.
 *
 * THE DEFECT IS NOT A CEILING BEING TOO LOW. It is that a student cannot find
 * out which ceiling stopped them. Nine of the thirteen upload paths below
 * render an upstream error verbatim -- `Upload failed: <whatever storage
 * said>` -- and a raw storage sentence names neither the file, nor the limit,
 * nor anything to do about it.
 *
 * A CEILING THAT IS NOT IN THIS REPOSITORY IS STILL A CEILING, AND SAYING SO
 * IS HALF THE POINT OF THIS MODULE. A Storage bucket created with no
 * `file_size_limit` does not thereby have no limit: the PROJECT-WIDE upload
 * limit applies to it, that number is a Supabase dashboard setting, and
 * nothing in this codebase can read it. Five buckets here are in that state
 * (`foundry-uploads`, `foundry-covers`, `avatars`, `tournament-thumbs`, the
 * four `gauntlet*` buckets). For those, `maxBytes` is NULL -- deliberately,
 * rather than being filled in with a guess -- and a refusal names the
 * situation instead of a number it does not have.
 *
 * WHAT THIS MODULE DOES NOT DO: it does not change a single ceiling. Every
 * number here is the number that was already being enforced, transcribed from
 * the migration or the module that enforces it. Raising one is a separate
 * decision with a cost, and this bundle makes them legible rather than larger.
 *
 * WHY A REGISTRY AND NOT A CONSTANT PER PATH. There already is a constant per
 * path, in nine different modules, several of them server-only and therefore
 * unreachable from a browser that wants to refuse before sending. This is the
 * one place the whole set can be read, compared, and rendered; it does not
 * replace those constants (three of them are in directories this bundle may
 * not touch), so `tests/upload-limits.test.ts` asserts every row here against
 * the migration and against the module that enforces it. A number restated in
 * two places is only safe when something fails when they disagree.
 *
 * THE BYTE VOCABULARY IS IMPORTED, NOT REWRITTEN. `$lib/classroom/upload-errors`
 * already owns `formatBytesShort` and `formatCap`, and they are already the
 * words three sign routes use. A second spelling of "how big is this file" is
 * exactly the duplication CLAUDE.md names. (There are two OTHER byte
 * formatters in the tree -- `describeBytes` in `$lib/maps/media` and
 * `formatScreenshotBytes` in `$lib/feedback/screenshot` -- and folding them
 * into this one is a rename across a directory this bundle does not own, so it
 * is reported rather than done.)
 */

import { formatBytesShort, formatCap } from '$lib/classroom/upload-errors';

export { formatBytesShort, formatCap };

/** Where a ceiling is actually applied, in the order a byte meets them. */
export type UploadGuard =
	/** A `File.size` read in the browser, before a single byte is sent. */
	| 'browser'
	/** One of our own routes, from a declared size or from the buffered body. */
	| 'route'
	/** `storage.buckets.file_size_limit`, enforced by Storage at upload. */
	| 'bucket'
	/** The Supabase PROJECT-WIDE upload limit. Not in this repository. */
	| 'project';

export interface UploadCeiling {
	/** Stable id. Used as the key everywhere, including in test assertions. */
	readonly id: string;
	/** What a student would call this upload, in a sentence. */
	readonly label: string;
	/** The Storage bucket, or null when the bytes go to one of our functions. */
	readonly bucket: string | null;
	/**
	 * The ceiling, in bytes, or NULL when this repository does not state one.
	 * Null is a real answer and not a missing value: it means the bucket
	 * carries no `file_size_limit`, so the project-wide limit is what applies.
	 */
	readonly maxBytes: number | null;
	/** Every place the ceiling is checked, in the order the bytes meet them. */
	readonly guards: readonly UploadGuard[];
	/**
	 * Where the number is written down, verbatim enough to grep for. This is
	 * what `tests/upload-limits.test.ts` re-derives rather than trusts.
	 */
	readonly statedBy: string;
	/**
	 * What the person can actually do about a size refusal on THIS path. It is
	 * per path because the answers genuinely differ: a 60 MB assembly gets
	 * zipped or linked, a phone photo gets retaken smaller, and a decal gets
	 * exported at a smaller canvas.
	 */
	readonly advice: string;
}

/**
 * 200 MiB, three times. The classroom trio share one number and one migration
 * pair, and they are listed separately anyway because the SENTENCE differs --
 * a student handing in work and a teacher posting a handout are refused by
 * different policies and need different next steps.
 */
const CLASSROOM_BYTES = 209715200;

const CEILINGS = [
	{
		id: 'classroom-attachment',
		label: 'a file attached to a class item',
		bucket: 'classroom-attachments',
		maxBytes: CLASSROOM_BYTES,
		guards: ['browser', 'route', 'bucket'],
		statedBy: '0133 file_size_limit; CLASSROOM_UPLOAD_MAX_BYTES in $lib/classroom/file-upload',
		advice: 'Split it, zip it, or link to it instead.'
	},
	{
		id: 'classroom-submission',
		label: 'a file handed in on an assignment',
		bucket: 'submission-files',
		maxBytes: CLASSROOM_BYTES,
		guards: ['browser', 'route', 'bucket'],
		statedBy: '0133 file_size_limit; CLASSROOM_UPLOAD_MAX_BYTES in $lib/classroom/file-upload',
		advice: 'Split it, zip it, or link to it instead.'
	},
	{
		id: 'classroom-instructor',
		label: 'an instructor-only file on a class item',
		bucket: 'instructor-attachments',
		maxBytes: CLASSROOM_BYTES,
		guards: ['browser', 'route', 'bucket'],
		statedBy: '0135 file_size_limit; CLASSROOM_UPLOAD_MAX_BYTES in $lib/classroom/file-upload',
		advice: 'Split it, zip it, or link to it instead.'
	},
	{
		id: 'classroom-deck',
		label: 'a slide deck zip',
		/**
		 * NO BUCKET. This is the one classroom path that still POSTs bytes to a
		 * function of ours, which is what holds its cap four orders of
		 * magnitude below the other three.
		 */
		bucket: null,
		maxBytes: 4 * 1024 * 1024,
		guards: ['browser', 'route'],
		statedBy: 'DECK_UPLOAD_MAX_ZIP_BYTES in $lib/classroom/deck',
		advice: 'Export the deck without its video and audio, and attach those as separate files.'
	},
	{
		id: 'notebook-photo',
		label: 'a notebook page photo',
		/**
		 * NO BUCKET EITHER: these bytes are buffered in the function and pushed
		 * to Google Drive, which is what holds this cap where it is. The
		 * browser's own number (MAX_UPLOAD_BYTES, 3.6 MiB) is deliberately
		 * LOWER, because a multipart body is the file plus its part headers --
		 * a file sized exactly at the route's cap posts a body over it.
		 */
		bucket: null,
		maxBytes: 4 * 1024 * 1024,
		guards: ['browser', 'route'],
		statedBy: 'MAX_PHOTO_BYTES in $lib/server/notebook-upload',
		advice: 'Retake it with the camera button here, which shrinks the photo before it sends.'
	},
	{
		id: 'maps-photo',
		label: 'a photo of a drawer or a shelf',
		bucket: 'maps-media',
		maxBytes: 20971520,
		guards: ['browser', 'bucket'],
		statedBy: '0163/0168 file_size_limit; MAPS_MEDIA_MAX_BYTES in $lib/maps/media',
		advice: 'Take it again at a smaller size, or pick a different one.'
	},
	{
		id: 'feedback-screenshot',
		label: 'a screenshot on a report',
		bucket: 'feedback-media',
		maxBytes: 8388608,
		guards: ['browser', 'bucket'],
		statedBy: '0170 file_size_limit; FEEDBACK_SCREENSHOT_MAX_BYTES in $lib/feedback/screenshot',
		advice: 'Crop it, or shrink it, and try again.'
	},
	{
		id: 'greenline-decal',
		label: 'a GREENLINE decal',
		bucket: 'greenline-decals',
		maxBytes: 1048576,
		guards: ['browser', 'bucket'],
		statedBy: '0051 file_size_limit; DECAL_MAX_BYTES in $lib/greenline/decals',
		advice: 'Export it again at a smaller canvas size, or save it as a PNG with fewer colours.'
	},
	{
		id: 'foundry-bundle',
		label: 'an app upload for the Foundry',
		bucket: 'foundry-uploads',
		/**
		 * NULL, AND THIS IS THE WORST GAP IN THE TABLE. The browser refuses at
		 * 75 MB (FOUNDRY_LIMITS.maxZipBytes, set deliberately by prompt 0014
		 * with measured arithmetic) and the bucket carries NO `file_size_limit`
		 * at all -- so anything between the project-wide limit and 75 MB passes
		 * the preflight, transfers over school wifi, and is refused at the far
		 * end by a ceiling nobody in this repository can name.
		 */
		maxBytes: null,
		guards: ['browser', 'project'],
		statedBy: 'FOUNDRY_LIMITS.maxZipBytes in $lib/foundry/preflight refuses at 75 MB; 0130 sets no file_size_limit',
		advice: 'Remove the largest files from the folder and upload it again.'
	},
	{
		id: 'foundry-cover',
		label: 'a cover image for a Foundry app',
		bucket: 'foundry-covers',
		maxBytes: null,
		guards: ['project'],
		statedBy: '0130 sets no file_size_limit, and nothing checks a size before sending',
		advice: 'Pick a smaller image, or export it again at a lower resolution.'
	},
	{
		id: 'avatar',
		label: 'a profile picture',
		bucket: 'avatars',
		maxBytes: null,
		guards: ['browser', 'project'],
		statedBy: '0020/0181 set no file_size_limit; the browser refuses at 2 MB in ProfileMenu.svelte',
		advice: 'Pick a smaller picture, or crop it first.'
	},
	{
		id: 'tournament-thumb',
		label: 'a tournament entry thumbnail or banner',
		bucket: 'tournament-thumbs',
		maxBytes: null,
		guards: ['project'],
		statedBy: '0062 sets no file_size_limit, and nothing checks a size before sending',
		advice: 'Pick a smaller image, or export it again at a lower resolution.'
	},
	{
		id: 'gauntlet-asset',
		label: 'a GAUNTLET challenge asset',
		bucket: 'gauntlet',
		maxBytes: null,
		guards: ['project'],
		statedBy: '0009/0015/0031 set no file_size_limit on any gauntlet bucket',
		advice: 'Save the drawing or model at a smaller size and attach it again.'
	}
] as const satisfies readonly UploadCeiling[];

export type UploadPathId = (typeof CEILINGS)[number]['id'];

export const UPLOAD_CEILINGS: Readonly<Record<UploadPathId, UploadCeiling>> = Object.freeze(
	CEILINGS.reduce(
		(acc, c) => {
			acc[c.id] = c;
			return acc;
		},
		{} as Record<UploadPathId, UploadCeiling>
	)
);

/**
 * The table in its declared order, for a surface that renders all of it. Typed
 * off `CEILINGS` itself rather than widened to `UploadCeiling[]`, so `row.id`
 * stays an `UploadPathId` and a caller iterating the list can pass it straight
 * back into `uploadTooLargeMessage` with no cast.
 */
export const UPLOAD_CEILING_LIST: typeof CEILINGS = CEILINGS;

export function uploadCeiling(id: UploadPathId): UploadCeiling {
	return UPLOAD_CEILINGS[id];
}

/**
 * THE SENTENCE FOR A CEILING NOBODY HERE CAN READ.
 *
 * It says the true thing rather than a comfortable one: the upload was refused
 * for size, this application does not set the limit that refused it, and the
 * person who can change it is a site admin. Naming a number we do not have
 * would be worse than naming none -- it is what produced "file size limit at
 * 25 mb" as a bug report in the first place.
 */
export const PROJECT_CEILING_SENTENCE =
	'This upload has no size limit of its own, so the one that stopped it is the ' +
	'site-wide upload limit, which a site admin sets outside this app. Tell an admin ' +
	'what you were uploading and how big it was.';

/**
 * WHAT WAS WRONG, WHAT THE LIMIT IS, AND WHAT TO DO -- the three things
 * CLAUDE.md requires of a refusal, from the one table.
 *
 * The size is stated because "too large" with no number is a guessing game,
 * and the advice is the path's own because "split it or zip it" is right for a
 * CAD assembly and useless for a phone photograph.
 */
export function uploadTooLargeMessage(id: UploadPathId, sizeBytes: number): string {
	const ceiling = uploadCeiling(id);
	const size = formatBytesShort(sizeBytes);
	if (ceiling.maxBytes == null) {
		return `That file is ${size}, and it was refused for size. ${PROJECT_CEILING_SENTENCE}`;
	}
	return (
		`That file is ${size}, and the limit for ${ceiling.label} is ` +
		`${formatCap(ceiling.maxBytes)}. Nothing about retrying will change that. ${ceiling.advice}`
	);
}

/**
 * Is this pick hopeless before a byte moves? Null when it is fine, or when
 * this path has no ceiling this repository knows -- the honest answer there is
 * "cannot tell from here", and a guess would refuse files that would have
 * worked.
 */
export function uploadSizeRefusal(id: UploadPathId, sizeBytes: number): string | null {
	const max = uploadCeiling(id).maxBytes;
	if (max == null || sizeBytes <= max) return null;
	return uploadTooLargeMessage(id, sizeBytes);
}

/**
 * TURNING WHATEVER STORAGE (OR DRIVE, OR ONE OF OUR ROUTES) SAID INTO A
 * SENTENCE, WITHOUT INVENTING A REASON.
 *
 * KEYED ON THE STATUS FIRST AND THE TEXT SECOND, which is the rule
 * `classifyUploadError` already established one directory over: storage's
 * messages are not a contract and have changed shape before, the status codes
 * have not, and the text match is a second chance rather than the signal.
 *
 * THE SIZE BRANCH IS THE WHOLE REASON THIS FUNCTION EXISTS. A 413 arriving
 * from a bucket with no `file_size_limit` is exactly the case the students
 * hit, and every path in the tree today renders it as whatever string came
 * back. Here it becomes a sentence that says which upload it was, how big the
 * file was, and -- when the limit is not ours -- who can change it.
 *
 * ANYTHING UNRECOGNISED KEEPS ITS OWN WORDS, with the status appended. A
 * message nobody anticipated is more useful verbatim than paraphrased, and it
 * is still pasteable into a report.
 */
export function uploadFailureMessage(args: {
	id: UploadPathId;
	status?: number | string | null;
	detail?: string | null;
	sizeBytes?: number | null;
}): string {
	const detail = (args.detail ?? '').trim();
	const lower = detail.toLowerCase();
	const status = Number(args.status ?? 0);
	const tooBig =
		status === 413 ||
		lower.includes('maximum allowed size') ||
		lower.includes('payload too large') ||
		lower.includes('entity too large');

	if (tooBig) {
		if (args.sizeBytes != null && Number.isFinite(args.sizeBytes)) {
			return uploadTooLargeMessage(args.id, args.sizeBytes);
		}
		const ceiling = uploadCeiling(args.id);
		return ceiling.maxBytes == null
			? `That file was refused for size. ${PROJECT_CEILING_SENTENCE}`
			: `That file was refused for size. The limit for ${ceiling.label} is ` +
					`${formatCap(ceiling.maxBytes)}. ${ceiling.advice}`;
	}

	if (status === 0 && (lower.includes('failed to fetch') || lower.includes('network'))) {
		return 'The connection dropped part way through. The file is still here -- try sending it again.';
	}

	if (!detail) {
		return status
			? `That upload did not work, and the server answered ${status} without saying why. Try again.`
			: 'That upload did not work, and nothing said why. Try again.';
	}
	return status ? `${detail} (HTTP ${status})` : detail;
}
