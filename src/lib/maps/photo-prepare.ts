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
 * THE ONE GATE, run at the picker, before a byte moves.
 *
 * Order is load-bearing. `mapsPhotoRefusal` FIRST, because it is the instant
 * one -- size and type off the `File` alone -- and refusing a 25 MB photo
 * before spending ten seconds decoding it is the same argument that put the
 * size check ahead of the transfer. The decode second, because it is the
 * expensive one and it is only worth doing for the formats that need it.
 *
 * A universal type is returned as THE SAME `File` OBJECT: byte-identical,
 * original metadata, nothing re-encoded. Re-encoding a JPEG somebody already
 * has would cost a generation of quality for nothing.
 */
export async function prepareMapsPhoto(file: File): Promise<MapsPreparedPhoto> {
	const refusal = mapsPhotoRefusal(file);
	if (refusal) return { ok: false, problem: refusal };

	const resolved = mapsImageMime(file);
	// Unreachable: `mapsPhotoRefusal` runs the same check and returns its
	// problem. Kept because the two would otherwise have to be read together
	// to know this is total, and a narrowing of either must not fall through.
	if (!resolved.ok) return { ok: false, problem: resolved.problem };

	if (!mapsNeedsTranscode(resolved.mimeType)) {
		return {
			ok: true,
			file,
			mimeType: resolved.mimeType,
			ext: resolved.ext,
			transcoded: false,
			sourceMimeType: resolved.mimeType
		};
	}

	let decoded: DecodedImage | null = null;
	try {
		decoded = await decodeImageFile(file);
		if (!decoded) return { ok: false, problem: undecodableProblem(resolved.mimeType) };
		const { width, height } = imageSize(decoded);
		if (!width || !height) return { ok: false, problem: undecodableProblem(resolved.mimeType) };
		// `drawToCanvas` applies no orientation of its own and needs none: both
		// decode paths have already baked EXIF orientation into the pixels
		// (`createImageBitmap` was asked for `from-image`, and an `<img>` does
		// it by default), so drawing them flattens the rotation into the JPEG
		// rather than dropping it with the EXIF block.
		const drawn = drawToCanvas(decoded, MAPS_TRANSCODE_MAX_DIM);
		if (!drawn) return { ok: false, problem: undecodableProblem(resolved.mimeType) };
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
					sourceMimeType: resolved.mimeType
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
				resolved.mimeType
			)} photo could not be made small enough to save -- the ${describeBytes(
				MAPS_MEDIA_MAX_BYTES
			)} limit is what it has to fit. Take it again at a smaller size.`
		};
	} catch {
		return { ok: false, problem: undecodableProblem(resolved.mimeType) };
	} finally {
		releaseImage(decoded);
	}
}
