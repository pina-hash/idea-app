/**
 * MAKING A PHONE CAPTURE VIEWABLE BY SOMEBODY ELSE, which is the obligation
 * 0168 handed forward and the one thing `mapsImageMime` deliberately does not
 * do.
 *
 * `media.ts` answers "what concrete `image/*` type will Storage accept for
 * these bytes", and for an iPhone HEIC the honest answer is `image/heic` --
 * the bucket takes it and the upload succeeds. It is then a photo NOBODY BUT
 * SAFARI CAN SEE. The person standing at the toolbox watched it upload and
 * saw their own preview; every Chrome and Firefox that opens the map
 * afterwards gets a broken image, and nothing anywhere reports it. A stored
 * byte that only its author can render is the worst shape a refusal can take,
 * because it is not a refusal.
 *
 * SO THE TRANSCODE HAPPENS IN THE BROWSER THAT PRODUCED THE FILE, and that is
 * forced rather than chosen: the browser that can decode a HEIC is the one
 * running on the device whose camera wrote it, and there is no server-side
 * image pipeline on this path at all -- the bytes go browser-to-bucket against
 * the caller's own client (0163), with no route of ours in between to convert
 * anything.
 *
 * THE DECODE PRIMITIVES ARE THE NOTEBOOK'S, IMPORTED RATHER THAN COPIED.
 * `$lib/notebook/camera` already solved "decode an arbitrary picked file
 * without ever hanging, honouring EXIF orientation" -- two strategies behind
 * one shared deadline, a canvas draw that probes for a blank result, every
 * failure degrading rather than throwing. Writing a second one here is exactly
 * the duplication CLAUDE.md names, so this module calls it. The name is
 * notebook-shaped and the code is not: nothing in `decodeImageFile`,
 * `drawToCanvas`, `imageSize` or `releaseImage` knows a notebook exists.
 * Moving it to a neutral module would be the tidier answer and is a rename
 * across two subsystems, so it is reported rather than done here.
 *
 * WHAT THIS MODULE DOES NOT DO: it does not widen or narrow what the bucket
 * accepts. `maps-media`'s `allowed_mime_types` is still 0163's `image/*`
 * wildcard and changing it is a migration. What changes is only which bytes
 * the one shipped upload path produces.
 */

import {
	decodeImageFile,
	drawToCanvas,
	imageSize,
	releaseImage,
	type DecodedImage
} from '$lib/notebook/camera';
import { MAPS_MEDIA_MAX_BYTES, describeBytes, mapsImageMime, mapsPhotoRefusal } from './media';

/**
 * WHAT MAY BE STORED AS IT ARRIVED, AND THE SET IS AN INTERSECTION OF TWO
 * LISTS RATHER THAN A JUDGEMENT ABOUT FORMATS.
 *
 * A picked file may be passed through only when BOTH are true:
 *
 *   1. THE BUCKET WILL TAKE IT. 0168 replaced 0163's `image/*` wildcard with a
 *      concrete raster list -- `image/jpeg`, `image/png`, `image/webp`,
 *      `image/heic`, `image/heif`, `image/avif` -- enforced at UPLOAD against
 *      the request's declared content type. A type outside it is refused at
 *      the far end, after the transfer, which is the refusal this whole path
 *      exists to take before a byte moves.
 *   2. EVERY BROWSER CAN DRAW IT. Otherwise the upload succeeds and the photo
 *      is broken for everyone but its author, which is worse than a refusal
 *      because nothing reports it.
 *
 * The intersection is four types. Read as decisions:
 *   jpeg / png -- universal, and on the bucket list.
 *   webp       -- every current engine, including Safari since 14.
 *   avif       -- Chrome, Firefox and Safari 16+, and on the bucket list.
 *                 Left in DELIBERATELY: an AVIF is produced by a tool, never
 *                 by the camera button this flow exists for, and transcoding
 *                 one would throw away the smaller file for an older Safari
 *                 nobody at this school is holding at a toolbox.
 *
 * THIS WIDENS NOTHING AT THE BUCKET AND NARROWS NOTHING, which the migration
 * ban makes a requirement rather than a preference: `allowed_mime_types` is
 * untouched and unreadable from here. What changes is only which bytes the one
 * shipped upload path produces.
 */
const MAPS_PASS_THROUGH_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/avif'
]);

/**
 * The transcode set is the complement over what `mapsImageMime` admits, and
 * every member is there for a reason from one of the two lists above:
 *   heic / heif -- ON the bucket list, decoded by Safari on recent macOS and
 *                  iOS and by NOTHING else. This is the whole reason the
 *                  module exists: it is what an iPhone writes by default, and
 *                  `File.type` for one is legitimately EMPTY, so it arrives
 *                  resolved by extension (0163's own stated obligation).
 *                  0168 admitted it at the bucket ON PURPOSE, so that a
 *                  capture can never fail at the far end, and named
 *                  transcoding on capture as this bundle's obligation.
 *   tiff        -- decoded by Safari, refused by Chrome and Firefox, AND off
 *                  the bucket list. Fails both tests.
 *   gif / bmp   -- universally drawable but OFF the bucket list, so passing
 *                  one through is a refusal after the transfer. Re-encoding
 *                  makes it storable. An animated GIF loses its animation,
 *                  which is the correct trade for a path whose subject is a
 *                  photograph of a drawer -- and the alternative today is not
 *                  an animation, it is a failed upload.
 * Anything `mapsImageMime` refuses never reaches here at all.
 */
export function mapsNeedsTranscode(mimeType: string): boolean {
	return !MAPS_PASS_THROUGH_TYPES.has((mimeType ?? '').trim().toLowerCase());
}

/**
 * The re-encode target. JPEG rather than WebP, for one reason that outranks
 * WebP being smaller: a map photo is a photograph of a drawer, it is going in
 * a PUBLIC bucket addressed by a plain URL, and JPEG is the format every tool
 * anybody might open that URL with can read -- including the ones that are not
 * browsers.
 */
const TRANSCODE_TYPE = 'image/jpeg';
const TRANSCODE_EXT = 'jpg';

/**
 * The longest edge kept. 4096 is ABOVE a 12 MP phone capture's long edge
 * (4032), so the ordinary case is not resized at all and the transcode costs
 * only the format -- which is the point. It is a ceiling for the unusual file,
 * not a shrink policy; the notebook's own 2400 would quietly halve the
 * resolution of a photo somebody may need to read a part number off.
 */
export const MAPS_TRANSCODE_MAX_DIM = 4096;

/**
 * Quality steps, tried in order until the result is under the bucket's
 * ceiling. The first is the one that essentially always wins: a 12 MP frame at
 * 0.9 measures a few MB against a 20 MiB limit. The rest exist so an unusually
 * large source degrades rather than being refused for a reason the person
 * cannot act on.
 */
const QUALITY_STEPS = [0.9, 0.8, 0.7];

/**
 * THE DECISION THAT NEEDS NO DECODE, split out and SYNCHRONOUS because most
 * picks are settled by it and a person should not wait for a decode that is
 * not going to happen.
 *
 * An oversize photo, an SVG and an ordinary JPEG are all answered from the
 * `File` alone -- name, type, size -- so the refusal renders in the same frame
 * as the press and an already-storable file is staged with no pending state
 * flashing past. Only `transcode` costs anything, and it costs it only for the
 * formats that need it.
 *
 * It is ONE rule with two readers rather than two rules: `prepareMapsPhoto`
 * below is this plus the transcode, and `ShelfEntry` calls the two halves in
 * that same order for the sole reason that it needs the first one's answer
 * synchronously.
 */
export type MapsPhotoPlan =
	| { kind: 'refused'; problem: string }
	| { kind: 'pass-through'; mimeType: string; ext: string }
	| { kind: 'transcode'; sourceMimeType: string };

export function planMapsPhoto(file: { name?: string; type?: string; size: number }): MapsPhotoPlan {
	/* Size and type FIRST, because they are the instant ones -- refusing a
	   25 MB photo before spending seconds decoding it is the same argument that
	   put the size check ahead of the transfer. */
	const refusal = mapsPhotoRefusal(file);
	if (refusal) return { kind: 'refused', problem: refusal };
	const resolved = mapsImageMime(file);
	// Unreachable: `mapsPhotoRefusal` runs the same check and returns its
	// problem. Kept because the two would otherwise have to be read together
	// to know this is total, and a narrowing of either must not fall through.
	if (!resolved.ok) return { kind: 'refused', problem: resolved.problem };
	return mapsNeedsTranscode(resolved.mimeType)
		? { kind: 'transcode', sourceMimeType: resolved.mimeType }
		: { kind: 'pass-through', mimeType: resolved.mimeType, ext: resolved.ext };
}

export type MapsPreparedPhoto =
	| {
			ok: true;
			/** What to upload. The SAME object when nothing had to change. */
			file: File;
			mimeType: string;
			ext: string;
			/** True when these are not the bytes the picker handed over. */
			transcoded: boolean;
			/** The type it arrived as, for a surface that wants to say so. */
			sourceMimeType: string;
	  }
	| { ok: false; problem: string };

function toJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
	return new Promise((resolve) => {
		try {
			canvas.toBlob((b) => resolve(b), TRANSCODE_TYPE, quality);
		} catch {
			resolve(null);
		}
	});
}

/** `IMG_0042.HEIC` -> `IMG_0042.jpg`. Nothing a person typed reaches a key. */
function jpegName(original: string | null | undefined): string {
	const trimmed = (original ?? '').trim();
	if (!trimmed) return 'photo.jpg';
	return /\.jpe?g$/i.test(trimmed) ? trimmed : `${trimmed.replace(/\.[^./\\]+$/, '')}.${TRANSCODE_EXT}`;
}

/** The short word a person recognises, for a refusal that has to name the format. */
function formatWord(mimeType: string): string {
	const bare = (mimeType || '').replace(/^image\//, '').toUpperCase();
	return bare === 'HEIF' ? 'HEIC' : bare || 'that format';
}

/**
 * THE REFUSAL WHEN THIS BROWSER CANNOT DECODE THE FILE EITHER.
 *
 * The alternative is to upload the original bytes and hope, which is what
 * happens today and is the defect. A photo nobody can render is not a photo
 * that got saved; it is a broken image every future reader sees, discovered
 * long after the person who could have retaken it walked away from the drawer.
 * So this refuses AT THE PICKER, in the same place and the same voice as every
 * other maps photo refusal (`mapsPhotoRefusal`), and tells them the one thing
 * they can actually do about it.
 */
function undecodableProblem(mimeType: string): string {
	return `This browser cannot open a ${formatWord(
		mimeType
	)} photo, so it cannot be saved as one everybody can see. Take the photo with the camera button here, or set the phone's camera to Most Compatible (Settings, Camera, Formats) and take it again.`;
}

/**
 * THE TRANSCODE, for a file `planMapsPhoto` said needs one.
 *
 * Separate from the plan because it is the expensive half and because a caller
 * that has to answer synchronously (the picker, which must render a refusal in
 * the same frame as the press) needs the cheap half on its own. Takes the plan
 * rather than re-deriving it, so there is no second opinion about which
 * formats need this.
 */
export async function transcodeMapsPhoto(
	file: File,
	plan: { kind: 'transcode'; sourceMimeType: string }
): Promise<MapsPreparedPhoto> {
	let decoded: DecodedImage | null = null;
	try {
		decoded = await decodeImageFile(file);
		if (!decoded) return { ok: false, problem: undecodableProblem(plan.sourceMimeType) };
		const { width, height } = imageSize(decoded);
		if (!width || !height) return { ok: false, problem: undecodableProblem(plan.sourceMimeType) };
		// `drawToCanvas` applies no orientation of its own and needs none: both
		// decode paths have already baked EXIF orientation into the pixels
		// (`createImageBitmap` was asked for `from-image`, and an `<img>` does
		// it by default), so drawing them flattens the rotation into the JPEG
		// rather than dropping it with the EXIF block.
		const drawn = drawToCanvas(decoded, MAPS_TRANSCODE_MAX_DIM);
		if (!drawn) return { ok: false, problem: undecodableProblem(plan.sourceMimeType) };
		for (const quality of QUALITY_STEPS) {
			const blob = await toJpegBlob(drawn.canvas, quality);
			if (!blob || blob.size === 0) break;
			if (blob.size <= MAPS_MEDIA_MAX_BYTES) {
				return {
					ok: true,
					file: new File([blob], jpegName(file.name), {
						type: TRANSCODE_TYPE,
						lastModified: file.lastModified
					}),
					mimeType: TRANSCODE_TYPE,
					ext: TRANSCODE_EXT,
					transcoded: true,
					sourceMimeType: plan.sourceMimeType
				};
			}
		}
		/* Every quality step came out over the ceiling, or the encoder gave
		   nothing back. Refusing is right and uploading the original is not:
		   the original is the format nobody can render, so "it saved" would
		   again mean "it is broken for everyone else". */
		return {
			ok: false,
			problem: `That ${formatWord(
				plan.sourceMimeType
			)} photo could not be made small enough to save -- the ${describeBytes(
				MAPS_MEDIA_MAX_BYTES
			)} limit is what it has to fit. Take it again at a smaller size.`
		};
	} catch {
		return { ok: false, problem: undecodableProblem(plan.sourceMimeType) };
	} finally {
		releaseImage(decoded);
	}
}

/**
 * THE WHOLE GATE, plan then transcode, for a caller with nothing to render in
 * between. `ShelfEntry` does have something to render in between -- an instant
 * refusal, and a pending state for the one branch that is not instant -- so it
 * calls the two halves itself, in this same order.
 */
export async function prepareMapsPhoto(file: File): Promise<MapsPreparedPhoto> {
	const plan = planMapsPhoto(file);
	if (plan.kind === 'refused') return { ok: false, problem: plan.problem };
	if (plan.kind === 'pass-through') {
		// The SAME `File` object: byte-identical, original metadata, nothing
		// re-encoded. Re-encoding a JPEG somebody already has would cost a
		// generation of quality for nothing.
		return {
			ok: true,
			file,
			mimeType: plan.mimeType,
			ext: plan.ext,
			transcoded: false,
			sourceMimeType: plan.mimeType
		};
	}
	return transcodeMapsPhoto(file, plan);
}
