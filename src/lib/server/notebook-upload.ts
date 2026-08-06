/**
 * Shared request-parsing helpers for the two notebook upload routes
 * (/api/notebook/upload and /api/notebook/add-photo). Server-only: the size
 * cap and mime allowlist are enforcement, not advice.
 */

/** Vercel serverless rejects request bodies past ~4.5 MB; stay safely under. */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

const IMAGE_EXT: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/heic': 'heic',
	'image/heif': 'heif'
};

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PhotoField {
	photo: File;
	ext: string;
}

/** Validates the "photo" form field: present, non-empty, capped, an image. */
export function readPhotoForm(form: FormData): PhotoField | { error: string; status: number } {
	const photo = form.get('photo');
	if (!(photo instanceof File) || photo.size === 0) {
		return { error: 'Attach a photo as the "photo" form field.', status: 400 };
	}
	if (photo.size > MAX_PHOTO_BYTES) {
		return {
			error: `Photos are capped at ${Math.floor(MAX_PHOTO_BYTES / 1024 / 1024)} MB.`,
			status: 413
		};
	}
	const ext = IMAGE_EXT[photo.type];
	if (!ext) {
		return { error: 'Photos must be JPEG, PNG, WebP, or HEIC.', status: 400 };
	}
	return { photo, ext };
}

/** A trimmed text form field, with '' collapsed to null. */
export function formText(form: FormData, key: string): string | null {
	const v = form.get(key);
	const s = typeof v === 'string' ? v.trim() : '';
	return s === '' ? null : s;
}
