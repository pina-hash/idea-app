/**
 * A ZIP OF PICTURES BECOMES A GALLERY, WITH NO MIGRATION (ledger 0297, package
 * ITEM; report 23).
 *
 * Mr. Pina, verbatim: "uploading a zip for related images makes a nice
 * gallery... that same upload button should support galleries... maybe when I
 * upload something I should specify if it's a presentation or an image
 * gallery... and I should be able to upload multiple of those zip files."
 *
 * What stood in the way was two facts about the DECK, not about pictures: the
 * deck planner refuses a zip with no web page at its top level, and an item
 * holds one deck (`classroom_decks.item_id` is unique, 0101). A gallery does not
 * need to be a deck at all. It is read HERE, in the browser, with Foundry's
 * dependency-free reader (`$lib/foundry/zip`), and every picture in it is
 * uploaded through `uploadClassroomFile({ role: 'attachment' })` as an ORDINARY
 * attachment -- the same row, the same bucket, the same 200 MB cap and the same
 * proxy as a picture attached one at a time. So a second zip simply adds more
 * pictures, and the item page's `AttachmentList` shows the pictures as a grid
 * that opens the lightbox.
 *
 * WHAT IT CANNOT DO WITHOUT SCHEMA: name two separate galleries on one item.
 * Every picture is an attachment on the item, so two zips make ONE set of
 * tiles. Named galleries need a grouping column on `classroom_attachments`;
 * that is written up for `0227_PROPOSED.sql` rather than encoded in filenames,
 * which would be a second, silent data model inside a string.
 *
 * NO RULE IS COPIED IN. What a picture is: `isImageFilename`. What a zipper
 * adds unasked: Foundry's `isOsNoise`. The reader and its budget: `zip.ts`.
 * This file only decides what counts as a gallery's contents and names the
 * files it hands on.
 */

import { ByteBudget, ZipBudgetError, ZipReadError, inflateEntry, readCentralDirectory } from '$lib/foundry/zip';
import { isOsNoise } from '$lib/foundry/preflight';
import { isImageFilename } from '$lib/classroom/classroom';
import { CLASSROOM_UPLOAD_MAX_BYTES } from '$lib/classroom/file-upload';

/**
 * THE LARGEST ZIP READ IN THE BROWSER, AND IT IS A MEMORY CEILING, NOT AN
 * UPLOAD ONE. The zip itself is never sent anywhere: the whole archive is held
 * in memory to read it (the reader walks the central directory from the end),
 * and the school's desktops are six to eight years old. It borrows the
 * client-side figure `uploadClassroomFile` already refuses above, so no new
 * number enters the classroom.
 *
 * EACH PICTURE INSIDE THEN MEETS THE ORDINARY PER-FILE CEILING, WHICH IS
 * LOWER: `0185` set the classroom buckets to 45 MiB under the project's global
 * limit (`PORTAL_UPLOAD_MAX_BYTES` in $lib/upload-limits), and that refusal is
 * the upload path's own, per file, with its own sentence. This module does not
 * restate it.
 */
export const GALLERY_ZIP_MAX_BYTES = CLASSROOM_UPLOAD_MAX_BYTES;

/** The unpacked total a gallery may reach, counted as it inflates (a zip
 *  declares its own sizes and a hostile one lies). */
export const GALLERY_UNPACKED_MAX_BYTES = 400 * 1024 * 1024;

/** Pictures taken from one zip. A class set of photographs is thirty; this is
 *  a guard against a whole camera roll, not a limit a lesson meets. */
export const GALLERY_MAX_PICTURES = 120;

/** What a zip holds, read from its directory alone (nothing is inflated). */
export interface ZipSurvey {
	/** Picture paths, in the order they will be uploaded. */
	pictures: string[];
	/** Whether any web page is inside, which a presentation needs. */
	hasPage: boolean;
	/** Files that are neither pictures nor a zipper's own noise. */
	otherFiles: number;
}

/** Natural order, so `photo2` comes before `photo10`. */
function naturalOrder(a: string, b: string): number {
	return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

const PAGE_RE = /\.html?$/i;

/**
 * READ A ZIP'S DIRECTORY. Null when the bytes are not a zip this reader can
 * open (a renamed file, a truncated download, zip64). A directory, an
 * irregular entry, an encrypted one and OS noise are never counted.
 */
export function surveyZip(bytes: Uint8Array): ZipSurvey | null {
	const records = readCentralDirectory(bytes);
	if (!records) return null;
	const pictures: string[] = [];
	let hasPage = false;
	let otherFiles = 0;
	for (const r of records) {
		if (r.directory || r.irregular || isOsNoise(r.name)) continue;
		if (PAGE_RE.test(r.name)) hasPage = true;
		if (!r.encrypted && isImageFilename(r.name)) pictures.push(r.name);
		else otherFiles += 1;
	}
	pictures.sort(naturalOrder);
	return { pictures, hasPage, otherFiles };
}

/** The last path segment. */
function baseName(path: string): string {
	return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * THE FILENAMES THE PICTURES ARE ATTACHED UNDER. The picture's own name, so
 * what a teacher sees on the item is what they saw in the folder -- and where
 * two folders in the zip each hold an `img1.jpg`, the folder's name goes in
 * front of the second, because two attachments under one name make an
 * `attachment:img1.jpg` figure reference ambiguous.
 */
export function galleryFileNames(paths: readonly string[]): string[] {
	const seen = new Set<string>();
	return paths.map((path) => {
		const base = baseName(path) || 'picture';
		let name = base;
		if (seen.has(name.toLowerCase())) {
			const parts = path.split('/').filter(Boolean);
			const folder = parts.length > 1 ? parts[parts.length - 2] : '';
			name = folder ? `${folder}-${base}` : base;
			let n = 2;
			while (seen.has(name.toLowerCase())) {
				const dot = base.lastIndexOf('.');
				name = dot > 0 ? `${base.slice(0, dot)}-${n}${base.slice(dot)}` : `${base}-${n}`;
				n += 1;
			}
		}
		seen.add(name.toLowerCase());
		return name;
	});
}

export interface GalleryExtraction {
	files: File[];
	/** Pictures left out, with the reason, so none of them vanishes silently. */
	skipped: string[];
	/** Why nothing could be read at all, or null. */
	error: string | null;
}

/** The size in MB a sentence can carry. */
const mb = (n: number) => (n / 1024 / 1024).toFixed(1);

/**
 * The refusal for a zip that is not going to be read, or null. SIZE BEFORE
 * ANYTHING IS READ, stating the size AND the limit (CLAUDE.md: "too large"
 * with no number is a guessing game).
 */
export function galleryZipIssue(file: File): string | null {
	if (file.size > GALLERY_ZIP_MAX_BYTES) {
		return `${file.name} is ${mb(file.size)} MB, over the ${mb(GALLERY_ZIP_MAX_BYTES)} MB limit for a zip read as a gallery. Split it into smaller zips; each one adds its pictures to the same item.`;
	}
	return null;
}

/**
 * UNPACK THE PICTURES, in order, as `File`s ready for the ordinary upload path.
 *
 * ONE PICTURE THAT WILL NOT UNPACK DOES NOT STOP THE REST, and says so: it is
 * in `skipped` with its reason, the same "a failed file never aborts the post"
 * rule the classroom's uploads follow. Only a zip that cannot be read AT ALL,
 * or an unpacked total past the budget, is an `error`.
 */
export async function extractGalleryPictures(
	bytes: Uint8Array,
	survey?: ZipSurvey | null
): Promise<GalleryExtraction> {
	const found = survey ?? surveyZip(bytes);
	if (!found) {
		return { files: [], skipped: [], error: 'This zip could not be opened. Zip the pictures again and try once more.' };
	}
	const records = readCentralDirectory(bytes) ?? [];
	const byName = new Map(records.map((r) => [r.name, r]));
	const wanted = found.pictures.slice(0, GALLERY_MAX_PICTURES);
	const skipped: string[] = found.pictures
		.slice(GALLERY_MAX_PICTURES)
		.map((p) => `${baseName(p)}: past the ${GALLERY_MAX_PICTURES}-picture limit for one zip.`);
	const names = galleryFileNames(wanted);
	const budget = new ByteBudget(GALLERY_UNPACKED_MAX_BYTES);
	const files: File[] = [];
	for (let i = 0; i < wanted.length; i++) {
		const record = byName.get(wanted[i]);
		if (!record) continue;
		try {
			const data = await inflateEntry(bytes, record, wanted[i], budget);
			if (data.byteLength === 0) {
				skipped.push(`${names[i]}: empty.`);
				continue;
			}
			files.push(new File([data as BlobPart], names[i]));
		} catch (err) {
			if (err instanceof ZipBudgetError) {
				return {
					files,
					skipped,
					error: `This zip unpacks to more than ${mb(GALLERY_UNPACKED_MAX_BYTES)} MB of pictures. Split it into smaller zips.`
				};
			}
			// The reader's own sentence already names the file.
			skipped.push(err instanceof ZipReadError ? err.message : `${names[i]} could not be unpacked.`);
		}
	}
	return { files, skipped, error: null };
}

/** "12 pictures" / "1 picture". */
export function pictureCount(n: number): string {
	return `${n} picture${n === 1 ? '' : 's'}`;
}
