/**
 * THE THUMBNAIL WRITES, pointed at 0268 (ledger 0396). A picture goes through
 * the one classroom upload path (`uploadClassroomFile`, role `thumbnail`): our
 * server mints a signed upload under the post's own prefix, the browser PUTs
 * the bytes, and the record step calls `classroom_set_item_thumbnail`. The
 * other writes are single RPC calls made from the browser, which is where a
 * call with a handful of plain values belongs.
 *
 * A DATABASE WITHOUT 0268 ANSWERS `PGRST202`, and that alone is read as "not
 * switched on yet" (`unavailable`); any other error is the database's own
 * sentence, shown as it is.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { uploadClassroomFile } from './file-upload';
import {
	THUMBNAILS_UNAVAILABLE,
	isThumbShape,
	readItemThumbnail,
	type SectionThumbShapeWriter,
	type ThumbShape,
	type ThumbnailResult,
	type ThumbnailTransports
} from './thumbnail';

type RpcError = { code?: string; message?: string } | null;

function failure(error: RpcError): { ok: false; message: string; unavailable?: boolean } {
	if (error?.code === 'PGRST202') return { ok: false, message: THUMBNAILS_UNAVAILABLE, unavailable: true };
	return { ok: false, message: error?.message || 'The thumbnail could not be saved. Try again.' };
}

function answered(data: unknown): ThumbnailResult {
	const body = (data ?? {}) as { ok?: boolean; thumbnail?: unknown };
	return { ok: true, thumbnail: readItemThumbnail(body.thumbnail ?? null) };
}

export function createThumbnailTransports(supabase: SupabaseClient): ThumbnailTransports {
	return {
		async sendPicture(itemId, file, meta, onProgress) {
			const res = await uploadClassroomFile({
				role: 'thumbnail',
				itemId,
				file,
				onProgress,
				record: { width: meta.width, height: meta.height, focal_x: meta.focalX, focal_y: meta.focalY }
			});
			if (!res.ok) return { ok: false, message: res.message };
			return answered(res.recorded);
		},
		async set(itemId, choice) {
			const image = choice.source === 'image' ? choice : null;
			const { data, error } = await supabase.rpc('classroom_set_item_thumbnail', {
				p_item_id: itemId,
				p_source: choice.source,
				p_image_key: null,
				p_attachment_id: image ? image.attachmentId : null,
				p_width: image ? image.width : null,
				p_height: image ? image.height : null,
				p_focal_x: image ? image.focalX : null,
				p_focal_y: image ? image.focalY : null
			});
			if (error) return failure(error);
			return answered(data);
		},
		async focus(itemId, x, y) {
			const { data, error } = await supabase.rpc('classroom_set_item_thumbnail_focus', {
				p_item_id: itemId,
				p_focal_x: x,
				p_focal_y: y
			});
			if (error) return failure(error);
			return answered(data);
		}
	};
}

export function createSectionThumbShapeWriter(supabase: SupabaseClient): SectionThumbShapeWriter {
	return async (sectionId, shape) => {
		const { data, error } = await supabase.rpc('classroom_set_section_thumbnail_shape', {
			p_section_id: sectionId,
			p_shape: shape
		});
		if (error) return failure(error);
		const got = (data as { shape?: unknown } | null)?.shape;
		return { ok: true, shape: isThumbShape(got) ? got : null };
	};
}

/**
 * A CLASS'S DEFAULT SHAPE, read with the narrowest probe the select-ladder rule
 * asks for: one scalar column, which a database without 0268 refuses outright.
 * `ready` is whether the column exists, and so whether any thumbnail write can
 * land; it is false for any failure, which removes every thumbnail control.
 */
export async function loadSectionThumbShape(
	supabase: SupabaseClient,
	sectionId: string
): Promise<{ ready: boolean; shape: ThumbShape | null }> {
	try {
		const { data, error } = await supabase
			.from('classroom_sections')
			.select('thumbnail_shape')
			.eq('id', sectionId)
			.maybeSingle();
		if (error) return { ready: false, shape: null };
		const v = (data as { thumbnail_shape?: unknown } | null)?.thumbnail_shape;
		return { ready: true, shape: isThumbShape(v) ? v : null };
	} catch {
		return { ready: false, shape: null };
	}
}
