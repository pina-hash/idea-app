// tests/maps-photo-prepare.test.ts
//
// THE PART OF THE HEIC DECISION THAT CAN BE ASSERTED WITHOUT A BROWSER, and a
// clear statement of which part cannot.
//
// `prepareMapsPhoto` itself is NOT exercised here and must not be: it decodes
// through `createImageBitmap` and re-encodes through `canvas.toBlob`, and
// `tests/dom/` is happy-dom, which has no layout engine and no raster
// pipeline. A test that called it there would either throw or -- worse --
// return a plausible answer computed by nothing, which is the vacuous-pass
// shape CLAUDE.md names ("a test that measures a box, a ratio or a 44px target
// in that project reads zero and passes vacuously"). The decode, the
// transcode, the orientation and the refusal are driven in a REAL Chromium
// through `/dev/maps-media` and `tools/browser-verify/routes/maps-media.mjs`.
//
// WHAT IS ASSERTED HERE is the pure half, which is the half whose regression
// would be silent: WHICH types get re-encoded. Getting that set wrong does not
// throw, does not fail a type check and looks like nothing on screen -- it
// just stores a photo only its author can see, or spends a generation of JPEG
// quality re-encoding a file that was already fine.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mapsNeedsTranscode } from '../src/lib/maps/photo-prepare';
import { mapsImageMime } from '../src/lib/maps/media';

const SOURCE = readFileSync('src/lib/maps/photo-prepare.ts', 'utf8');
/* The sweep below asks about CODE, and this module's comments name the
   primitives on purpose (they say which ones it borrows and why). Stripping
   block and line comments first is what stops the prose from answering a
   question about the implementation -- and a sweep that reads a comment is a
   sweep that would have gone green over a real second decoder sitting beside
   an explanatory paragraph. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('which maps photos have to be re-encoded before they are stored', () => {
	it('re-encodes exactly the formats no browser but the one that made them can draw', () => {
		// HEIC and HEIF are Safari-only; TIFF is Safari-only. Every one of these
		// stored as-is is a photo that renders for its author and for nobody
		// else, which is the defect this module exists for.
		for (const type of ['image/heic', 'image/heif', 'image/tiff']) {
			expect(mapsNeedsTranscode(type)).toBe(true);
		}
	});

	it('leaves every universally decodable format completely alone', () => {
		// The negative half, and it matters as much: re-encoding a JPEG somebody
		// already has costs a generation of quality for nothing at all.
		for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp']) {
			expect(mapsNeedsTranscode(type)).toBe(false);
		}
	});

	it('leaves AVIF alone deliberately, which is the one judgement call in the set', () => {
		// Chrome, Firefox and Safari 16+. An AVIF is written by a tool and never
		// by the camera button this flow exists for, so transcoding one would
		// throw away a smaller file for a Safari nobody is holding at a toolbox.
		expect(mapsNeedsTranscode('image/avif')).toBe(false);
	});

	it('is not case- or whitespace-sensitive, because a declared type is a string', () => {
		expect(mapsNeedsTranscode(' IMAGE/HEIC ')).toBe(true);
		expect(mapsNeedsTranscode('IMAGE/JPEG')).toBe(false);
	});

	it('THE IPHONE CASE END TO END: an empty File.type plus a .HEIC name lands in the transcode set', () => {
		// The File API REQUIRES an empty type where the platform cannot
		// determine one, and that is the conforming path for an iPhone HEIC --
		// so this is the ordinary case, not an edge one. The two functions have
		// to agree about it or the transcode never fires for the only file it
		// was written for.
		const resolved = mapsImageMime({ name: 'IMG_0042.HEIC', type: '' });
		expect(resolved.ok).toBe(true);
		if (!resolved.ok) return;
		expect(resolved.mimeType).toBe('image/heic');
		expect(mapsNeedsTranscode(resolved.mimeType)).toBe(true);
	});

	it('every type media.ts admits is decided one way or the other -- no third answer', () => {
		// A sweep with its own case count asserted, so a sweep that generated
		// nothing cannot pass. Reads the extension map out of the module rather
		// than restating it: a type added there must land in a bucket here.
		const media = readFileSync('src/lib/maps/media.ts', 'utf8');
		const block = media.match(/const MIME_EXT: Record<string, string> = \{([\s\S]*?)\};/);
		expect(block).not.toBeNull();
		const types = [...(block?.[1] ?? '').matchAll(/'(image\/[a-z+]+)'/g)].map((m) => m[1]);
		expect(types.length).toBeGreaterThanOrEqual(8);
		for (const type of types) {
			expect(typeof mapsNeedsTranscode(type)).toBe('boolean');
		}
		// And the two answers are both actually used, or this sweep is asserting
		// that a constant function is a function.
		expect(types.some((t) => mapsNeedsTranscode(t))).toBe(true);
		expect(types.some((t) => !mapsNeedsTranscode(t))).toBe(true);
	});
});

describe('the decode primitives are the notebook path"s, not a second copy', () => {
	it('imports them rather than reimplementing them', () => {
		// CLAUDE.md: "A second implementation of a check, a formatter, a ladder,
		// or a piece of arithmetic is the thing that quietly stops matching."
		// `$lib/notebook/camera` already owns "decode an arbitrary picked file
		// without ever hanging, honouring EXIF orientation".
		expect(CODE).toContain("from '$lib/notebook/camera'");
		for (const fn of ['decodeImageFile', 'drawToCanvas', 'imageSize', 'releaseImage']) {
			expect(CODE).toContain(fn);
		}
	});

	it('and does not grow its own decoder, which is how the copy would arrive', () => {
		// The tell would be this module reaching for the raw primitives itself.
		// The one raster call it legitimately makes is the ENCODE (`toBlob`),
		// which the notebook keeps private and hardcoded to its own quality
		// curve, so there is nothing there to call.
		expect(CODE).not.toContain('createImageBitmap');
		expect(CODE).not.toContain('new Image(');
		expect(CODE).not.toContain('drawImage');
		// The positive control for that stripping: the comments really do
		// mention one of them, so a sweep over SOURCE would have passed for the
		// wrong reason and a sweep over CODE that found nothing is meaningful.
		expect(SOURCE).toContain('createImageBitmap');
		expect(CODE).toContain('decodeImageFile(file)');
	});
});
