/**
 * THE FIXTURES, AND AN HONEST ACCOUNT OF WHAT EACH ONE IS.
 *
 * CLAUDE.md: "A FIXTURE MUST BE SOMETHING ITS REAL PRODUCER CAN EMIT". A file
 * picker emits a `File` with a name, a size, and a `type` the platform chose
 * -- legitimately EMPTY when it could not choose one, which is the iPhone HEIC
 * case exactly. Every fixture here is that shape. Where one is not the bytes a
 * camera would have written, it says so in its own `caveat`, because
 * describing a substitute as equivalent is worse than naming it.
 */

export interface MediaFixture {
	key: string;
	/** What the picker would hand over. */
	file: () => Promise<File>;
	/** One line on what this case is. */
	about: string;
	/** Stated where the bytes are not what a camera writes. Null when they are. */
	caveat: string | null;
}

/**
 * A REAL RASTER IMAGE, produced by `canvas.toBlob` -- the same call the
 * transcode itself uses to write its output, so these are genuinely bytes this
 * browser both writes and reads. Deliberately NOT a square: an orientation or
 * an axis swap anywhere in the decode-draw-encode chain shows up as the two
 * numbers trading places, which a square could never report.
 */
export async function rasterPng(width = 40, height = 25): Promise<Blob> {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('no 2d context in this browser');
	// Opaque, and not one flat colour: `drawToCanvas` probes a handful of
	// pixels for a non-zero alpha before trusting a draw, and a fully
	// transparent fixture would be discarded as a blank canvas.
	ctx.fillStyle = '#123456';
	ctx.fillRect(0, 0, width, height);
	ctx.fillStyle = '#e0c060';
	ctx.fillRect(0, 0, Math.max(1, Math.round(width / 3)), height);
	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob((b) => resolve(b), 'image/png')
	);
	if (!blob) throw new Error('canvas.toBlob produced nothing');
	return blob;
}

/**
 * AN ISOBMFF FILE WHOSE `ftyp` BOX DECLARES THE `heic` BRAND, which is the
 * first twelve bytes of every real HEIC and the thing a decoder reads first.
 *
 * WHAT THIS IS NOT: a photograph. There is no HEVC-encoded tile in it, and
 * this container has no HEIC encoder of any kind (no ImageMagick, no libheif,
 * no ffmpeg -- checked). WHAT THAT WEAKENS, exactly: it cannot prove the
 * SAFARI half of the rule, where a genuine HEIC decodes and is re-encoded to a
 * JPEG. Nothing available here can, and this file does not pretend otherwise.
 * WHAT IT STILL PROVES: Chromium refuses to decode a real HEIC and refuses to
 * decode this one, by the same path and with the same observable result -- so
 * the branch under test, "this browser cannot open it, so refuse at the picker
 * rather than storing bytes nobody can render", is driven for real.
 */
export function heicBytes(): Uint8Array {
	const header = [
		0x00, 0x00, 0x00, 0x18, // box size: 24
		0x66, 0x74, 0x79, 0x70, // 'ftyp'
		0x68, 0x65, 0x69, 0x63, // major brand 'heic'
		0x00, 0x00, 0x00, 0x00, // minor version
		0x6d, 0x69, 0x66, 0x31, // compatible brand 'mif1'
		0x68, 0x65, 0x69, 0x63 // compatible brand 'heic'
	];
	// Padded past `unusableReason`-style smallness checks and past anything
	// that might treat a handful of bytes as a truncated read rather than an
	// undecodable format.
	return new Uint8Array([...header, ...new Uint8Array(2048)]);
}

export const MEDIA_FIXTURES: MediaFixture[] = [
	{
		key: 'jpeg-passthrough',
		about: 'An ordinary JPEG. Nothing needs to happen to it, and nothing should.',
		caveat: null,
		file: async () => {
			const png = await rasterPng();
			// Re-encoded to JPEG through the browser, so these really are JPEG
			// bytes with a JPEG type, not a PNG wearing a name.
			const bitmap = await createImageBitmap(png);
			const canvas = document.createElement('canvas');
			canvas.width = bitmap.width;
			canvas.height = bitmap.height;
			canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
			bitmap.close();
			const blob = await new Promise<Blob | null>((resolve) =>
				canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9)
			);
			if (!blob) throw new Error('no jpeg');
			return new File([blob], 'IMG_0001.jpg', { type: 'image/jpeg' });
		}
	},
	{
		key: 'heic-decodable',
		about:
			'THE SAFARI CASE: the picker says HEIC by extension with an empty type, and this browser CAN decode the bytes. Must come out a JPEG.',
		caveat:
			'The bytes are a real PNG, not real HEIC. A browser decodes by content and never by filename, so this is exactly the state Safari is in with a genuine HEIC -- the name resolves to image/heic and the decode succeeds. It is the only way to reach the success branch where no HEIC encoder exists.',
		file: async () =>
			// EMPTY type and a .HEIC name: the File API requires an empty type
			// where the platform cannot determine one, and that is what an
			// iPhone picker hands over. `mapsImageMime` resolves it from the
			// extension, which is 0163's own stated obligation.
			new File([await rasterPng()], 'IMG_0042.HEIC', { type: '' })
	},
	{
		key: 'heic-undecodable',
		about:
			'THE CHROME CASE: a HEIC this browser cannot open. Must be refused at the picker, never uploaded.',
		caveat:
			'ISOBMFF with a real heic ftyp box and no HEVC payload. Chromium refuses a genuine HEIC and refuses this one identically; it cannot stand in for the Safari branch and is not used for it.',
		file: async () =>
			new File([heicBytes() as unknown as BlobPart], 'IMG_0043.heic', { type: 'image/heic' })
	},
	{
		key: 'svg-refused',
		about: 'An SVG is a document, not a photograph. Refused before any decode is attempted.',
		caveat: null,
		file: async () =>
			new File(['<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'], 'plan.svg', {
				type: 'image/svg+xml'
			})
	},
	{
		key: 'oversize-refused',
		about: 'Over the bucket ceiling. Refused from File.size, before a byte moves and before a decode.',
		caveat: null,
		file: async () =>
			new File([new Uint8Array(21 * 1024 * 1024) as unknown as BlobPart], 'huge.jpg', {
				type: 'image/jpeg'
			})
	}
];
