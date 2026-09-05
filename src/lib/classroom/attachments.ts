/**
 * WHICH PICTURES AN ITEM BODY MAY BE OFFERED, and what the item will call each
 * one once it is saved (0041).
 *
 * Prompt 0030 shipped the image block and said plainly what it could not
 * finish: the editor's Image control asked for a FILENAME, typed by hand. A key
 * typed wrong produces a body naming a picture that will never load, and
 * nothing on screen says so until a student opens the page. This module is the
 * list the picker offers instead.
 *
 * PURE AND CLIENT-SAFE: plain data in, plain data out, no DOM, no Svelte, no
 * transport. That is what lets the whole rule be asserted in the `node` project
 * without a mount -- a mount costs roughly an order of magnitude more per test
 * and would prove nothing extra about which names are offerable.
 *
 * IT INVENTS NO PREDICATE. Whether a reference resolves is `resolveFigureSrc`'s
 * question and is asked THROUGH it, on the same attachment list the renderer
 * will be given; whether a name reads as a picture is `isImageFilename`'s. A
 * second copy of either is the thing that quietly stops agreeing -- and here it
 * would stop agreeing in the worst direction, by offering a choice the page
 * then declines to draw.
 */
import {
	isImageFilename,
	resolveFigureSrc,
	sanitizeAttachmentFilename,
	type ClassroomAttachment
} from '$lib/classroom/classroom';

/** The `attachment:` scheme, spelled once. `resolveFigureSrc` owns the reading
 *  half of this string; this is the writing half, and they are the same six
 *  characters or the picker offers something the resolver has never heard of. */
export const ATTACHMENT_REF_PREFIX = 'attachment:';

/** The reference an item body carries for one attachment. `figureReference` is
 *  the MARKDOWN form of the same alias (`![caption](attachment:name)`), which a
 *  spec's prose field uses; a body document carries the bare src, so this is
 *  that one field and nothing around it. */
export function attachmentRef(filename: string): string {
	return `${ATTACHMENT_REF_PREFIX}${filename}`;
}

/**
 * A file already on the item, or one staged in the composer and not uploaded
 * yet. The distinction is the whole reason this type has a `state`: a staged
 * file's reference does not resolve until the save lands its upload, and a
 * picker that did not say so would be handing somebody a dangling reference
 * while looking exactly like one that was not.
 */
export type ImageChoiceState = 'attached' | 'staged';

export interface ImageChoice {
	/** The exact string the document's `src` will carry. */
	ref: string;
	/** The name the item knows, or will know, this file by. */
	filename: string;
	/** The name to show. Differs from `filename` only where the recorded name
	 *  was sanitized, which is worth seeing before it is chosen. */
	label: string;
	state: ImageChoiceState;
	/** A thumbnail for a file already on the item, resolved through the same
	 *  proxy helper the page uses; null for a staged file, whose bytes exist
	 *  nowhere but this browser's memory and which the Files panel a few
	 *  centimetres below is already previewing. */
	previewSrc: string | null;
}

/**
 * WHAT THE ITEM WILL CALL A STAGED FILE, computed the way the record route
 * computes it.
 *
 * `/api/classroom/attachment` derives `p_filename` from the uploaded file's
 * name -- sanitized (so `figureReference` always produces a renderable line),
 * capped, and defaulted -- so a staged file's eventual alias is a PURE FUNCTION
 * of `file.name` and is knowable before a single byte moves. That is what makes
 * offering a staged file a prediction rather than a guess.
 *
 * THE ROUTE IS NOT MINE TO POINT AT THIS HELPER (0041 owns neither
 * `src/routes/api/classroom/attachment/+server.ts` nor a migration), so the two
 * statements of the rule are pinned together by a tripwire in
 * `tests/classroom-item-image-picker.test.ts` that reads the route's source and
 * reddens if its expression moves. Folding the route onto this function is the
 * follow-up, and it is one import.
 */
export function recordedAttachmentFilename(rawName: string): string {
	return sanitizeAttachmentFilename(String(rawName ?? '').trim().slice(0, 300)) || 'attachment';
}

/** The staged half of the input: a `File` handle, or anything carrying a name.
 *  Typed on the property rather than on `File` so the pure module never has to
 *  reach for a DOM lib and a test can hand it a plain object. */
export interface StagedFileLike {
	name: string;
}

export interface ImageChoiceInput {
	/** Attachments the item already carries, exactly as the renderer will be
	 *  given them -- this list is what `resolveFigureSrc` is asked about. */
	attached?: ClassroomAttachment[];
	/** Student-facing files staged in the composer and not yet uploaded. */
	staged?: StagedFileLike[];
}

/**
 * The pictures a body may be offered, attached first, then staged, each in the
 * order its own list gives.
 *
 * OFFERED: an attachment whose name reads as a picture AND whose alias
 * `resolveFigureSrc` actually resolves against this same list; a staged file
 * whose PREDICTED recorded name reads as a picture and is not an SVG.
 *
 * REFUSED, and each for its own reason:
 *   - anything `resolveFigureSrc` would refuse (an SVG by name or by stored
 *     mime, above all), because offering it means offering a picture the page
 *     then declines to draw -- which is the defect this whole bundle exists to
 *     remove, wearing a picker's clothes;
 *   - anything whose name does not read as a picture. `resolveFigureSrc` is
 *     happy to resolve `notes.pdf` to a proxy URL -- it decides ACCESS, not
 *     whether bytes decode -- and an `img` pointed at a PDF is a broken picture
 *     with a perfectly valid reference behind it;
 *   - a name a candidate earlier in the list already claims. The alias matches
 *     case-insensitively and FIRST MATCH WINS, so two rows offering one string
 *     are two rows that cannot be told apart by the document they produce.
 *
 * INSTRUCTOR-ONLY FILES ARE NOT AN INPUT AT ALL, which is stronger than
 * refusing them: they live in their own bucket and their own table, an item
 * body's alias is resolved against the STUDENT-FACING attachments and could
 * never reach one, and a body is read by the whole class. There is no parameter
 * here through which one could be passed.
 */
export function imageChoices(input: ImageChoiceInput): ImageChoice[] {
	const attached = input.attached ?? [];
	const staged = input.staged ?? [];
	const out: ImageChoice[] = [];
	const claimed = new Set<string>();

	for (const a of attached) {
		const filename = (a.filename ?? '').trim();
		if (!filename || !isImageFilename(filename)) continue;
		const key = filename.toLowerCase();
		if (claimed.has(key)) continue;
		// THE REAL PREDICATE, on the real list. An SVG is refused here by both of
		// its spellings without this module knowing either of them.
		const resolved = resolveFigureSrc(attachmentRef(filename), attached);
		if (!resolved.ok) continue;
		claimed.add(key);
		out.push({
			ref: attachmentRef(filename),
			filename,
			label: filename,
			state: 'attached',
			previewSrc: resolved.src
		});
	}

	for (const file of staged) {
		const raw = (file?.name ?? '').trim();
		if (!raw) continue;
		const filename = recordedAttachmentFilename(raw);
		if (!isImageFilename(filename)) continue;
		const key = filename.toLowerCase();
		if (claimed.has(key)) continue;
		// The row does not exist yet, so there is no stored mime to ask about and
		// no attachment list to match against. Put the alias to the resolver
		// against a HYPOTHETICAL row instead -- the one the record route will
		// write, `application/octet-stream` exactly as 0133 stores every object --
		// so the same predicate decides this half too rather than a name check
		// standing in for it.
		const resolved = resolveFigureSrc(attachmentRef(filename), [
			{ id: 'staged', filename, mime_type: 'application/octet-stream', sort_order: 0 }
		]);
		if (!resolved.ok) continue;
		claimed.add(key);
		out.push({
			ref: attachmentRef(filename),
			filename,
			label: filename === raw ? filename : `${raw} (saved as ${filename})`,
			state: 'staged',
			previewSrc: null
		});
	}

	return out;
}

/** Is this exact reference one the picker offered. The insert handler asks it
 *  before writing anything, so "the document can only ever name a picture that
 *  was on the list" is a property of the code rather than of the markup. */
export function isOfferedRef(choices: ImageChoice[], ref: string): boolean {
	const wanted = (ref ?? '').trim();
	return wanted !== '' && choices.some((c) => c.ref === wanted);
}
