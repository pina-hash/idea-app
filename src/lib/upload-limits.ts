/**
 * EVERY UPLOAD CEILING IN THE PORTAL, IN ONE PLACE, AND THE GLOBAL THEY ALL
 * SIT UNDER.
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
 * out which ceiling stopped them, and -- this is the half that took a second
 * bundle to reach -- that most of the ceilings this application stated were
 * FICTION. The project is on the Supabase FREE plan, whose global upload file
 * size limit is 50 MB and is FIXED. Twelve of the fifteen buckets said
 * something else: three claimed 200 MiB, which the platform would never have
 * honoured, and nine said nothing at all and inherited a number no sentence
 * here could name.
 *
 * `0185_bucket_limits_under_the_global.sql` ended that: every bucket now states
 * a limit at or below `PORTAL_UPLOAD_MAX_BYTES`, and this module is where that
 * number and the global above it are written down. A Pro upgrade is the two
 * constants below plus the migration that follows them, not a hunt.
 *
 * NULL IS STILL A REAL ANSWER AND THE MACHINERY FOR IT STAYS. No row carries it
 * today, and `tests/upload-limits.test.ts` pins that; but a bucket added
 * tomorrow with no `file_size_limit` is a bucket back in the old state, and
 * `PROJECT_CEILING_SENTENCE` is what it should say rather than a number nobody
 * here can read. The branch is a tripwire, not dead code.
 *
 * WHAT THIS MODULE DOES NOT DO: it does not choose a ceiling on its own. Every
 * number here is either the number the enforcing module already used, or that
 * number capped at the portal ceiling the migration writes into the bucket.
 * Raising the global is a plan decision with a bill attached and is not made in
 * code.
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

/**
 * THE SUPABASE PROJECT-WIDE UPLOAD LIMIT. THE ONE PLACE IT IS STATED.
 *
 * Read off the Supabase dashboard on 2026-09-05: "Global file size limit
 * 50 MB", FIXED, because the project is on the Free plan -- the dashboard's own
 * words are "Free Plan has a fixed upload file size limit of 50 MB". It is not
 * a project setting that can be raised; it moves when the plan does.
 *
 * IT IS WRITTEN AS 50,000,000 AND NOT AS 50 MiB, AND THE CHOICE IS THE
 * CONSERVATIVE ONE. "50 MB" is ambiguous: read as MiB it is 52,428,800, read as
 * decimal MB it is 50,000,000. Nothing in this repository can settle which --
 * the only channel to that database is `tools/apply-migration.mjs`, which
 * applies files and does not answer questions. Every consumer of this constant
 * is a CEILING, and a ceiling read too high is the exact defect this module
 * exists to end: a file that passes every check here and is refused at the far
 * end after the whole transfer. So the smaller reading is the binding one, and
 * the ~2.4 MB of possible headroom is left on the table deliberately.
 *
 * NOTHING SHOULD BE SET TO THIS NUMBER. It is what the platform refuses at, not
 * what this application should promise; `PORTAL_UPLOAD_MAX_BYTES` is the number
 * a bucket and a preflight actually carry, and it sits below this one with the
 * margin explained there.
 */
export const SUPABASE_PROJECT_FILE_SIZE_LIMIT_BYTES = 50_000_000;

/**
 * THE LARGEST CEILING ANY BUCKET IN THIS PROJECT STATES: 45 MiB.
 *
 * THE ARITHMETIC, in the shape prompt 0014 used for `FOUNDRY_LIMITS`:
 *
 *   1. The binding global is 50,000,000 (see above -- the pessimistic reading,
 *      chosen because a ceiling is the wrong thing to be optimistic about).
 *   2. 45 MiB is 47,185,920, which is 94.4% of that, leaving 2,814,080 bytes.
 *   3. The margin has to absorb the REQUEST ENVELOPE, not just the file:
 *      supabase-js wraps a Blob in a `FormData` in the browser, so what crosses
 *      the wire is the file plus a multipart boundary, two part headers and a
 *      `cacheControl` field. That is under a kilobyte -- three orders of
 *      magnitude inside the margin. (The tree already leaves headroom for this:
 *      the notebook photo path refuses at 3.6 MiB in the browser against a
 *      4 MiB route cap, "because a multipart body is the file plus its part
 *      headers".)
 *   4. It renders as "45 MB" through `formatCap`, which divides by 1024 twice
 *      -- the same MiB convention every other limit in the chain uses (200, 20,
 *      8 and 1 MB), so a student reads a round number and not 47.2.
 *
 * WHY NOT CLOSER TO THE GLOBAL. A couple more megabytes of app costs the whole
 * of the margin that makes this number true under BOTH readings of "50 MB". The
 * refusal a student meets here is one they meet before a byte moves and with a
 * number in it; the one they would meet at 49 MiB is an upstream sentence after
 * a full transfer over school wifi. That trade is not close.
 */
export const PORTAL_UPLOAD_MAX_BYTES = 45 * 1024 * 1024;

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
 * THE THREE CLASSROOM BUCKETS SHARE ONE NUMBER, AND IT IS NO LONGER 200 MiB.
 *
 * 0133 and 0135 set `file_size_limit = 209715200` and CLAUDE.md still
 * celebrates it: "that is what moved the cap from 4 MiB to 200 MB and made a
 * 60 MB SLDASM an ordinary hand-in". The bucket row said so; the platform never
 * agreed. On the Free plan the global refused everything over 50 MB, so a 60 MB
 * assembly was refused at the far end after the whole transfer, every time,
 * with an upstream sentence nobody wrote. 0185 writes the true number.
 *
 * THE BROWSER GUARD ON THIS PATH IS STILL 200 MiB AND THIS BUNDLE CANNOT MOVE
 * IT. `CLASSROOM_UPLOAD_MAX_BYTES` lives in `$lib/classroom/file-upload`, which
 * is outside what this bundle owns, so a classroom pick between 45 MiB and
 * 200 MiB still passes the browser and is refused by the bucket. That is the
 * Foundry defect, one directory over, and it is the follow-up this bundle
 * reports rather than makes: the fix is one constant, and
 * `tests/upload-limits.test.ts` is what will notice when it lands.
 */
const CLASSROOM_BYTES = PORTAL_UPLOAD_MAX_BYTES;

const CEILINGS = [
	{
		id: 'classroom-attachment',
		label: 'a file attached to a class item',
		bucket: 'classroom-attachments',
		maxBytes: CLASSROOM_BYTES,
		guards: ['browser', 'route', 'bucket'],
		statedBy:
			'0185 file_size_limit (0133 said 209715200, which the 50 MB global never honoured); ' +
			'CLASSROOM_UPLOAD_MAX_BYTES in $lib/classroom/file-upload is still 200 MB and is now the looser of the two',
		advice: 'Split it, zip it, or link to it instead.'
	},
	{
		id: 'classroom-submission',
		label: 'a file handed in on an assignment',
		bucket: 'submission-files',
		maxBytes: CLASSROOM_BYTES,
		guards: ['browser', 'route', 'bucket'],
		statedBy:
			'0185 file_size_limit (0133 said 209715200); CLASSROOM_UPLOAD_MAX_BYTES in ' +
			'$lib/classroom/file-upload is still 200 MB and is now the looser of the two',
		advice: 'Split it, zip it, or link to it instead.'
	},
	{
		id: 'classroom-instructor',
		label: 'an instructor-only file on a class item',
		bucket: 'instructor-attachments',
		maxBytes: CLASSROOM_BYTES,
		guards: ['browser', 'route', 'bucket'],
		statedBy:
			'0185 file_size_limit (0135 said 209715200); CLASSROOM_UPLOAD_MAX_BYTES in ' +
			'$lib/classroom/file-upload is still 200 MB and is now the looser of the two',
		advice: 'Split it, zip it, or link to it instead.'
	},
	{
		id: 'classroom-deck',
		label: 'a slide deck zip',
		/**
		 * NO BUCKET. This is the one classroom path that still POSTs bytes to a
		 * function of ours, which is what holds its cap four orders of
		 * magnitude below the other three. It is far under the global and 0185
		 * does not touch it.
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
		 * THIS WAS THE WORST GAP IN THE TABLE AND IT IS THE ONE THIS BUNDLE
		 * CLOSED. It read null: the browser refused at 75 MiB
		 * (`FOUNDRY_LIMITS.maxZipBytes`) and the bucket carried NO
		 * `file_size_limit` at all, so anything between the 50 MB global and
		 * 75 MiB passed the preflight, transferred whole over school wifi, and
		 * was refused at the far end by a ceiling nobody in this repository
		 * could name. That is the best explanation in the tree for the "failed
		 * upload" report. 0185 gives the bucket the number and the browser now
		 * refuses at the same one, before a byte moves.
		 */
		maxBytes: PORTAL_UPLOAD_MAX_BYTES,
		guards: ['browser', 'bucket'],
		statedBy: '0185 file_size_limit; FOUNDRY_LIMITS.maxZipBytes in $lib/foundry/preflight',
		advice: 'Remove the largest files from the folder and upload it again.'
	},
	{
		id: 'foundry-cover',
		label: 'a cover image for a Foundry app',
		bucket: 'foundry-covers',
		maxBytes: PORTAL_UPLOAD_MAX_BYTES,
		guards: ['bucket'],
		statedBy: '0185 file_size_limit (0130 set none); nothing checks a size before sending',
		advice: 'Pick a smaller image, or export it again at a lower resolution.'
	},
	{
		id: 'avatar',
		label: 'a profile picture',
		bucket: 'avatars',
		/**
		 * THE BROWSER IS THE BINDING GUARD HERE, NOT THE BUCKET, and that is
		 * why this row keeps 2 MB rather than taking the portal ceiling: a
		 * profile picture is refused at 2 MB in `ProfileMenu.svelte` long
		 * before Storage is asked. 0185 gave the bucket a number too, which is
		 * defence in depth and not the ceiling a student meets.
		 */
		maxBytes: 2 * 1024 * 1024,
		guards: ['browser', 'bucket'],
		statedBy: 'the browser refuses at 2 MB in ProfileMenu.svelte; 0185 sets the bucket to 45 MB behind it',
		advice: 'Pick a smaller picture, or crop it first.'
	},
	{
		id: 'tournament-thumb',
		label: 'a tournament entry thumbnail or banner',
		bucket: 'tournament-thumbs',
		maxBytes: PORTAL_UPLOAD_MAX_BYTES,
		guards: ['bucket'],
		statedBy: '0185 file_size_limit (0062 set none); nothing checks a size before sending',
		advice: 'Pick a smaller image, or export it again at a lower resolution.'
	},
	{
		id: 'gauntlet-asset',
		label: 'a GAUNTLET challenge asset',
		bucket: 'gauntlet',
		maxBytes: PORTAL_UPLOAD_MAX_BYTES,
		guards: ['bucket'],
		statedBy: '0185 file_size_limit (0009/0015/0031 set none on any gauntlet bucket)',
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
