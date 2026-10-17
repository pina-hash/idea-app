/**
 * READYING A PICTURE TO BE A POST'S THUMBNAIL, in the browser (ledger 0396).
 *
 * A thumbnail is drawn thirty times on one class page, on a school laptop and
 * on a phone, so what is stored is sized for that: a picture larger than
 * `THUMBNAIL_MAX_EDGE` on its long side, or heavier than `KEEP_AS_IS_BYTES`, or
 * in a format a browser cannot always draw (HEIC), is redrawn on a canvas and
 * stored as a JPEG (a PNG when it came in with transparency). Anything already
 * small and drawable is uploaded exactly as picked, which is what keeps an
 * animated GIF animated and a transparent PNG transparent.
 *
 * Its natural size is read either way and stored with it, so every shape can
 * crop it well. A picture this browser cannot decode at all is refused in words
 * before anything is sent.
 */
import { THUMBNAIL_MAX_EDGE, THUMBNAIL_RASTER_RE, THUMBNAIL_UPLOAD_MAX_BYTES } from './thumbnail';

/** Already small enough to send as it is. */
export const KEEP_AS_IS_BYTES = 1.5 * 1024 * 1024;

export type PreparedThumbnail = { ok: true; file: File; width: number; height: number } | { ok: false; message: string };

const UNREADABLE =
	'This picture could not be opened here. Save it as a JPEG or PNG (a screenshot of it works too) and pick it again.';

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void } | null> {
	if (typeof createImageBitmap === 'function') {
		try {
			const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
			return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
		} catch {
			/* fall through to an <img>, which some browsers decode where this does not */
		}
	}
	const url = URL.createObjectURL(file);
	try {
		const img = new Image();
		img.decoding = 'async';
		img.src = url;
		await img.decode();
		if (!img.naturalWidth || !img.naturalHeight) return null;
		return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
	} catch {
		URL.revokeObjectURL(url);
		return null;
	}
}

/** Whether a decoded picture has any transparent pixel, sampled on a small copy. */
function hasAlpha(source: CanvasImageSource, width: number, height: number): boolean {
	const w = Math.max(1, Math.min(64, width));
	const h = Math.max(1, Math.min(64, height));
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	const ctx = c.getContext('2d');
	if (!ctx) return false;
	ctx.drawImage(source, 0, 0, w, h);
	const data = ctx.getImageData(0, 0, w, h).data;
	for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
	return false;
}

function baseName(name: string): string {
	return (name.replace(/\.[^.]+$/, '') || 'thumbnail').slice(0, 80);
}

export async function prepareThumbnailFile(file: File): Promise<PreparedThumbnail> {
	const decoded = await decode(file);
	if (!decoded) return { ok: false, message: UNREADABLE };
	try {
		const { width, height, source } = decoded;
		const long = Math.max(width, height);
		const drawable = THUMBNAIL_RASTER_RE.test(file.name);
		if (drawable && long <= THUMBNAIL_MAX_EDGE && file.size <= KEEP_AS_IS_BYTES) {
			return { ok: true, file, width, height };
		}
		const scale = long > THUMBNAIL_MAX_EDGE ? THUMBNAIL_MAX_EDGE / long : 1;
		const w = Math.max(1, Math.round(width * scale));
		const h = Math.max(1, Math.round(height * scale));
		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext('2d');
		if (!ctx) return { ok: false, message: UNREADABLE };
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(source, 0, 0, w, h);
		const png = /\.(png|gif|webp)$/i.test(file.name) && hasAlpha(source, width, height);
		const type = png ? 'image/png' : 'image/jpeg';
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, png ? undefined : 0.86));
		if (!blob) return { ok: false, message: UNREADABLE };
		if (blob.size > THUMBNAIL_UPLOAD_MAX_BYTES) {
			return { ok: false, message: 'This picture is still too large after it was resized. Pick a smaller one.' };
		}
		const out = new File([blob], `${baseName(file.name)}.${png ? 'png' : 'jpg'}`, { type });
		return { ok: true, file: out, width: w, height: h };
	} finally {
		decoded.close();
	}
}

/** The natural size of a picture at an address, or null when it does not load. */
export function measureImage(src: string): Promise<{ width: number; height: number } | null> {
	return new Promise((resolve) => {
		const img = new Image();
		img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? { width: img.naturalWidth, height: img.naturalHeight } : null);
		img.onerror = () => resolve(null);
		img.src = src;
	});
}
