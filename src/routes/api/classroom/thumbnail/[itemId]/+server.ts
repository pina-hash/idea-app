import { CLASSROOM_ATTACHMENTS_BUCKET, DOWNLOAD_URL_TTL_SECONDS } from '$lib/server/classroom-attachments';
import { resolveFigureSrc, type ClassroomAttachment } from '$lib/classroom/classroom';
import { manifestThumbnail } from '$lib/classroom/html-assignment/thumbnail';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * A POST'S THUMBNAIL PICTURE, WHATEVER KIND OF PICTURE IT IS (0268, ledger
 * 0396). The one address every image thumbnail loads from
 * (`thumbnailImageSrc`), so the class page never has to know which of four
 * places the picture lives:
 *
 *   an uploaded picture    `image_key` in `classroom-attachments` under the
 *                          post's prefix: a short signed DOWNLOAD URL minted
 *                          on the caller's own session, the attachment route's
 *                          own answer (an `<img>` decodes it; a navigation
 *                          downloads it, never renders it as a document)
 *   one of the post's files `attachment_id`: handed to the attachment route,
 *                          which already serves storage and Drive rows alike
 *   the HTML document's    `attachment:<filename>`: resolved against the
 *   manifest names it      post's files by `resolveFigureSrc`, the one rule
 *                          for an authored figure (SVG refused by name and by
 *                          stored type); `data:image/...`: decoded and served
 *                          here, PNG, JPEG, GIF or WebP only, the type checked
 *                          against the bytes' own signature, `nosniff`
 *
 * EVERY READ RUNS AS THE CALLER. The thumbnail row, the manifest and the
 * attachments are each read under their own RLS (all three follow the item),
 * and the signed URL is minted by storage's own policy. There is no service
 * role here, so this route is never the authorization boundary.
 *
 * THE REDIRECTS ARE BUILT BY HAND rather than with `redirect()`, because each
 * carries a short private cache header: the signed URL lives two minutes, and
 * a list of thirty thumbnails re-asking on every scroll is the cost avoided.
 *
 * EVERY REFUSAL IS THE SAME BODYLESS 404: signed out, a malformed id, a post
 * the caller cannot read, a post with no picture, a picture that is gone.
 * `?v=` is the row's version and is only a cache key.
 */

const CACHE = 'private, max-age=60';

function notFound(): Response {
	return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
}

/** The four raster types a data picture may be, each with the bytes it must start with. */
const SIGNATURES: Record<string, (b: Uint8Array) => boolean> = {
	'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
	'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
	'image/gif': (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
	'image/webp': (b) =>
		b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
};

/** A `data:` picture to its bytes and type, or null if it is not one of the four or its bytes say otherwise. */
export function _decodeDataPicture(src: string): { type: string; bytes: Uint8Array } | null {
	const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(src);
	if (!m) return null;
	let bytes: Uint8Array;
	try {
		bytes = new Uint8Array(Buffer.from(m[2], 'base64'));
	} catch {
		return null;
	}
	const check = SIGNATURES[m[1]];
	if (!check || bytes.length < 12 || !check(bytes)) return null;
	return { type: m[1], bytes };
}

export const GET: RequestHandler = async ({ params, locals: { supabase, claims } }) => {
	if (!claims) return notFound();
	const itemId = params.itemId ?? '';
	if (!UUID_RE.test(itemId)) return notFound();

	const { data: row, error } = await supabase
		.from('classroom_item_thumbnails')
		.select('source, manual, image_key, attachment_id')
		.eq('item_id', itemId)
		.maybeSingle<{ source: string; manual: boolean; image_key: string | null; attachment_id: string | null }>();
	if (error || !row || row.source !== 'image') return notFound();

	if (row.image_key) {
		const ext = (row.image_key.match(/\.([a-z0-9]{1,8})$/i)?.[1] ?? 'png').toLowerCase();
		const { data: signed, error: signError } = await supabase.storage
			.from(CLASSROOM_ATTACHMENTS_BUCKET)
			.createSignedUrl(row.image_key, DOWNLOAD_URL_TTL_SECONDS, { download: `thumbnail.${ext}` });
		if (signError || !signed?.signedUrl) return notFound();
		return new Response(null, { status: 302, headers: { location: signed.signedUrl, 'cache-control': CACHE } });
	}
	if (row.attachment_id) {
		return new Response(null, {
			status: 302,
			headers: { location: `/api/classroom/attachment/${row.attachment_id}`, 'cache-control': CACHE }
		});
	}
	if (row.manual) return notFound();

	// The picture the HTML document's manifest names.
	const { data: doc } = await supabase
		.from('classroom_html_assignments')
		.select('manifest')
		.eq('item_id', itemId)
		.maybeSingle<{ manifest: unknown }>();
	const declared = manifestThumbnail(doc?.manifest ?? null);
	if (!declared || declared.source !== 'image') return notFound();

	if (declared.src.startsWith('attachment:')) {
		const { data: files } = await supabase
			.from('classroom_attachments')
			.select('id, filename, mime_type, size_bytes, sort_order')
			.eq('item_id', itemId);
		const res = resolveFigureSrc(declared.src, (files ?? []) as ClassroomAttachment[]);
		if (!res.ok) return notFound();
		return new Response(null, { status: 302, headers: { location: res.src, 'cache-control': CACHE } });
	}
	const picture = _decodeDataPicture(declared.src);
	if (!picture) return notFound();
	return new Response(picture.bytes as unknown as BodyInit, {
		headers: {
			'content-type': picture.type,
			'content-length': String(picture.bytes.byteLength),
			'x-content-type-options': 'nosniff',
			'content-security-policy': "default-src 'none'; sandbox",
			'cache-control': 'private, max-age=300'
		}
	});
};
