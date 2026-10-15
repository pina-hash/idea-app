import type { SupabaseClient } from '@supabase/supabase-js';
import { coinNumber } from '$lib/coin-format';
import type { CoinBackgroundRules } from '$lib/coin-balance';

/**
 * PHOTOS A STUDENT HANDS IN FOR IDEA COINS (V2 session two, 0245): a desktop
 * background, a donation photo, a role's start and end photo. One upload path
 * for all of them, so the size ceiling, the extension rule and the path shape
 * are written once.
 *
 * THE BUCKET IS `coin-uploads`, PRIVATE, and every object goes in the
 * uploader's own `<uid>/` folder (the storage rule every user-upload bucket
 * keeps). The path is `<uid>/<uuid>.<ext>`, which is exactly the shape
 * `_coin_own_upload_ok` accepts; nothing a person typed appears in it.
 *
 * REFUSED BEFORE THE TRANSFER. A file over the ceiling, or of a type the
 * bucket refuses, is stopped here with the size AND the limit in words, never
 * after a minute of school wifi.
 */

/** The bucket's own ceiling (0245: file_size_limit 20971520). */
export const COIN_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

export const COIN_UPLOAD_BUCKET = 'coin-uploads';

/** The raster types the bucket accepts, by extension, with their media type. */
export const COIN_UPLOAD_TYPES: Record<string, string> = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	heic: 'image/heic',
	heif: 'image/heif'
};

const TYPE_TO_EXT: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/jpg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/heic': 'heic',
	'image/heif': 'heif'
};

/**
 * A file's extension for the stored key: from its media type when the
 * browser gives one, otherwise from its name (`File.type` is legitimately
 * empty for HEIC off an iPhone). Lowercased. Null when it is not a picture
 * the bucket takes, and null for a file whose own type names something else
 * (an SVG renamed `.png` stays an SVG).
 */
export function coinUploadExt(file: { name?: string; type?: string }): string | null {
	const t = (file.type ?? '').toLowerCase().trim();
	if (t) return TYPE_TO_EXT[t] ?? null;
	const m = /\.([a-z0-9]+)$/i.exec(file.name ?? '');
	const e = m ? m[1].toLowerCase() : '';
	return COIN_UPLOAD_TYPES[e] ? e : null;
}

/** The media type sent with the upload: the file's own, else the extension's. Never empty. */
export function coinUploadMime(file: { type?: string }, ext: string): string {
	const t = (file.type ?? '').toLowerCase().trim();
	if (t && TYPE_TO_EXT[t]) return t === 'image/jpg' ? 'image/jpeg' : t;
	return COIN_UPLOAD_TYPES[ext] ?? 'image/jpeg';
}

/** `<uid>/<uuid>.<ext>`. */
export function coinUploadPath(userId: string, ext: string, id: string = crypto.randomUUID()): string {
	return `${userId}/${id}.${ext}`;
}

/** A byte count as a person reads it: "3.4 MB", "820 KB". */
export function coinFileSize(bytes: number): string {
	if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Why a file cannot be sent at all, in words; null when it can. */
export function coinUploadRefusal(file: { name?: string; type?: string; size: number }): string | null {
	if (!coinUploadExt(file)) {
		return 'That file is not a picture this page takes. Use a JPG, PNG, WEBP or HEIC photo.';
	}
	if (file.size > COIN_UPLOAD_MAX_BYTES) {
		return `That picture is ${coinFileSize(file.size)}, and the limit is ${coinFileSize(COIN_UPLOAD_MAX_BYTES)}. Pick a smaller one.`;
	}
	if (file.size <= 0) return 'That file is empty. Pick the picture again.';
	return null;
}

export type CoinUploadResult = { ok: true; path: string } | { ok: false; words: string };

/**
 * Upload one picture into the caller's own folder. The caller's own browser
 * client, so the bucket's own-folder policy is the boundary.
 */
export async function uploadCoinPhoto(
	supabase: SupabaseClient,
	userId: string,
	file: Blob & { name?: string }
): Promise<CoinUploadResult> {
	const refusal = coinUploadRefusal(file);
	if (refusal) return { ok: false, words: refusal };
	if (!userId) return { ok: false, words: 'You are signed out. Sign in again, then try once more.' };
	const ext = coinUploadExt(file)!;
	const path = coinUploadPath(userId, ext);
	try {
		const { error } = await supabase.storage
			.from(COIN_UPLOAD_BUCKET)
			.upload(path, file, { contentType: coinUploadMime(file, ext), upsert: false });
		if (error) {
			return { ok: false, words: 'The picture did not upload. Check your connection and try again.' };
		}
		return { ok: true, path };
	} catch {
		return { ok: false, words: 'The picture did not upload. Check your connection and try again.' };
	}
}

/**
 * THE BACKGROUND CHECKS, before anything is sent: 16:9 within 1%, at least
 * the minimum size, and at least the minimum KB per megapixel. The mirror of
 * `coin_submit_background` (0245), which applies the same three in the same
 * order; the database's answer is the one that counts.
 */
export function coinBackgroundProblem(
	width: number,
	height: number,
	bytes: number,
	rules: Pick<CoinBackgroundRules, 'min_width' | 'min_height' | 'min_kb_per_megapixel'>
): string | null {
	if (!(width > 0 && height > 0)) {
		return 'This picture could not be measured. Save it as a JPG or PNG and pick it again.';
	}
	if (Math.abs(width * 9 - height * 16) > width * 9 * 0.01) {
		return `This picture is ${width} by ${height}, which is not 16:9. Crop it to 16:9 (for example ${rules.min_width} by ${rules.min_height}).`;
	}
	if (width < rules.min_width || height < rules.min_height) {
		return `This picture is ${width} by ${height}. It must be at least ${rules.min_width} by ${rules.min_height}.`;
	}
	const kb = bytes / 1024;
	const need = rules.min_kb_per_megapixel * ((width * height) / 1e6);
	if (kb < need) {
		return `This picture is too compressed to look sharp: ${coinNumber(Math.round(kb))} KB where a picture this size needs at least ${coinNumber(Math.ceil(need))} KB. Save it at a higher quality.`;
	}
	return null;
}

/** A picture's natural size, measured in the browser. Null when it will not decode. */
export function measureImage(file: Blob): Promise<{ width: number; height: number } | null> {
	if (typeof window === 'undefined' || typeof Image === 'undefined') return Promise.resolve(null);
	return new Promise((resolve) => {
		const url = URL.createObjectURL(file);
		const img = new Image();
		const done = (v: { width: number; height: number } | null) => {
			URL.revokeObjectURL(url);
			resolve(v);
		};
		img.onload = () => done(img.naturalWidth > 0 ? { width: img.naturalWidth, height: img.naturalHeight } : null);
		img.onerror = () => done(null);
		img.src = url;
	});
}
