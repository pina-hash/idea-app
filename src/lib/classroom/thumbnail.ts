/**
 * A POST'S THUMBNAIL ON THE CLASS PAGE (ledger 0396, report a6a037f3): the
 * shapes a slot is drawn in, the row the database keeps, and the one decision
 * of what a post's slot shows.
 *
 * A SLOT, NOT A PICTURE. The SHAPE is a display setting of the person looking
 * (their Display settings choice, else the class's default, else Tile), never a
 * property of the post; a post stores only its SOURCE:
 *
 *   image  a picture (uploaded, pasted, one of the post's own, or the one its
 *          HTML document names), cropped with `object-fit: cover` around a
 *          focal point the teacher nudges, so one picture serves every shape
 *   html   a live HTML thumbnail the post's HTML document declares
 *   none   the generated identity: the post's type glyph on a tile tinted by
 *          its unit, which is also what a post with no row at all shows
 *
 * EVERY RENDERER READS THE SLOT'S SIZE FROM CSS CUSTOM PROPERTIES
 * (`--thumb-w`, `--thumb-h`, `--thumb-shape`), set per shape in one stylesheet
 * (`PostThumbnail.svelte`), so adding a shape is a stylesheet change and an
 * entry in `THUMB_SHAPES`, never a data change.
 */

import { htmlAssignmentSrc } from '$lib/classroom/html-assignment/mount';
import {
	htmlThumbnailSrc,
	servedThumbnailTemplate,
	type ManifestThumbnail
} from '$lib/classroom/html-assignment/thumbnail';
import { isScheduled, type ClassroomItem } from '$lib/classroom/classroom';

// The shapes live in `./thumbnail-shape`, which imports nothing, so the
// preference schema can name them without pulling the HTML-assignment modules
// into every page that reads a setting.
export {
	THUMB_SHAPES,
	THUMB_SHAPE_CHOICES,
	THUMB_SHAPE_DEFAULT,
	THUMB_SHAPE_HINTS,
	THUMB_SHAPE_LABELS,
	isThumbShape,
	isThumbShapeChoice,
	resolveThumbShape,
	type ThumbShape,
	type ThumbShapeChoice
} from './thumbnail-shape';
import { isThumbShape as isShape, type ThumbShape } from './thumbnail-shape';

// ---------------------------------------------------------------------------
// The stored row.
// ---------------------------------------------------------------------------

export type ThumbSource = 'image' | 'html' | 'none';

/** 0268's `classroom_item_thumbnails` row, as the client reads it. */
export interface ItemThumbnail {
	source: ThumbSource;
	manual: boolean;
	image_key: string | null;
	attachment_id: string | null;
	image_width: number | null;
	image_height: number | null;
	focal_x: number;
	focal_y: number;
	html_document_id: string | null;
	interactive: boolean;
	updated_at: string | null;
}

/** The embed key the item select's widest rung carries (`ITEM_SELECT_THUMBS`). */
export const THUMBNAIL_EMBED_KEY = 'classroom_item_thumbnails';

const num = (v: unknown): number | null => {
	const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
	return Number.isFinite(n) ? n : null;
};
const frac = (v: unknown): number => {
	const n = num(v);
	return n === null ? 0.5 : Math.min(1, Math.max(0, n));
};
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/**
 * One row to the client's shape, or null. PostgREST answers a one-to-one embed
 * as an object and an older one as an array, so both are read; a value that is
 * not a row (a source this build does not know) is no thumbnail.
 */
export function readItemThumbnail(raw: unknown): ItemThumbnail | null {
	const row = Array.isArray(raw) ? raw[0] : raw;
	if (!row || typeof row !== 'object') return null;
	const r = row as Record<string, unknown>;
	const source = r.source;
	if (source !== 'image' && source !== 'html' && source !== 'none') return null;
	const w = num(r.image_width);
	const h = num(r.image_height);
	return {
		source,
		manual: r.manual === true,
		image_key: str(r.image_key),
		attachment_id: str(r.attachment_id),
		image_width: w !== null && w > 0 ? w : null,
		image_height: h !== null && h > 0 ? h : null,
		focal_x: frac(r.focal_x),
		focal_y: frac(r.focal_y),
		html_document_id: str(r.html_document_id),
		interactive: r.interactive === true,
		updated_at: str(r.updated_at)
	};
}

export type WithThumbnail<T> = T & { thumbnail?: ItemThumbnail | null };

/**
 * THE THUMBNAIL RIDES BESIDE THE ITEM, the way 0193's layout does
 * (`withItemLayout`): attached only when the rung that answered carried the
 * embed, so an older read stays `undefined` ("could not tell") rather than
 * claiming the post has none. Both read the same on screen (the generated
 * identity); the difference is what the editor may offer.
 */
export function withItemThumbnail<T extends object>(
	item: T,
	row: Record<string, unknown> | null | undefined
): WithThumbnail<T> {
	if (!row || !Object.prototype.hasOwnProperty.call(row, THUMBNAIL_EMBED_KEY)) return item;
	return Object.assign(item, { thumbnail: readItemThumbnail(row[THUMBNAIL_EMBED_KEY]) });
}

/**
 * A CLASS'S DEFAULT SHAPE, beside the section the way a thumbnail rides beside
 * its item: attached only when the read carried the column
 * (`SECTION_SELECT_THUMBS`), so an older read leaves it `undefined`. A value
 * this build does not know is no default.
 */
export function withSectionThumbShape<T extends object>(
	section: T,
	row: Record<string, unknown> | null | undefined
): T & { thumbnail_shape?: ThumbShape | null } {
	if (!row || !Object.prototype.hasOwnProperty.call(row, 'thumbnail_shape')) return section;
	const v = row.thumbnail_shape;
	return Object.assign(section, { thumbnail_shape: isShape(v) ? v : null });
}

// ---------------------------------------------------------------------------
// What a slot shows.
// ---------------------------------------------------------------------------

export type ThumbPlan =
	| {
			kind: 'image';
			src: string;
			focalX: number;
			focalY: number;
			width: number | null;
			height: number | null;
	  }
	| { kind: 'html'; src: string; interactive: boolean }
	| { kind: 'generated' };

/**
 * THE ONE ADDRESS AN IMAGE THUMBNAIL LOADS FROM, whatever kind of picture it
 * is: `/api/classroom/thumbnail/<item>` resolves an uploaded key, one of the
 * post's own files and a picture the HTML document names, on the caller's own
 * session, and answers the way a classroom attachment does (a short signed
 * download an `<img>` decodes). The version is the row's own stamp, so a new
 * picture is fetched fresh and an unchanged one is cached.
 */
export function thumbnailImageSrc(itemId: string, version?: string | null): string {
	const base = `/api/classroom/thumbnail/${itemId}`;
	return version ? `${base}?v=${encodeURIComponent(version)}` : base;
}

export interface ThumbPlanOptions {
	/** `PUBLIC_HX_SANDBOX_ORIGIN`, where live thumbnails are served; unset is this host. */
	sandboxOrigin?: string | null;
	/** A harness's own picture for an item, standing in for the image route. */
	imageSrc?: ((item: { id: string }, thumb: ItemThumbnail) => string | null) | null;
	/**
	 * The loader's clock (ISO), so a post scheduled ahead is known not to be
	 * live yet. Never read here from the device: a surface with no clock to
	 * hand over leaves a scheduled post to the route's own refusal.
	 */
	now?: string | null;
}

/**
 * WHAT A POST'S SLOT SHOWS. A manual image with no picture left (its file was
 * deleted) and anything this build cannot draw is the generated identity, so a
 * slot is never empty and never a broken image.
 */
export function thumbnailPlan(
	item: { id: string; thumbnail?: ItemThumbnail | null; published?: boolean; publish_at?: string | null },
	opts: ThumbPlanOptions = {}
): ThumbPlan {
	const t = item.thumbnail;
	if (!t) return { kind: 'generated' };
	if (t.source === 'image') {
		if (t.manual && !t.image_key && !t.attachment_id) return { kind: 'generated' };
		const src = opts.imageSrc ? opts.imageSrc(item, t) : thumbnailImageSrc(item.id, t.updated_at);
		if (!src) return { kind: 'generated' };
		return { kind: 'image', src, focalX: t.focal_x, focalY: t.focal_y, width: t.image_width, height: t.image_height };
	}
	if (t.source === 'html' && t.html_document_id) {
		/* The route serves a live thumbnail only for a live post (the worksheet
		   route's own rule), so a draft, and a post scheduled ahead, are not
		   asked for one: the request could only be the bodyless 404, a console
		   error on every teacher's page, and two and a half seconds of a frame
		   waiting to be taken away. They show the generated look. */
		if (item.published === false) return { kind: 'generated' };
		if (opts.now && item.published && isScheduled({ published: true, publish_at: item.publish_at }, new Date(opts.now))) {
			return { kind: 'generated' };
		}
		return {
			kind: 'html',
			src: htmlThumbnailSrc(htmlAssignmentSrc(opts.sandboxOrigin ?? '', t.html_document_id), t.updated_at),
			interactive: t.interactive
		};
	}
	return { kind: 'generated' };
}

/**
 * Whether a post has a picture or a live thumbnail to show, rather than the
 * generated identity. A list that keeps its own mark for a post with nothing
 * set (the home feed's kind glyph and body cover) asks this, so it can never
 * disagree with `thumbnailPlan` about which posts have one.
 */
export function hasThumbnailMedia(item: { id: string; thumbnail?: ItemThumbnail | null }): boolean {
	return thumbnailPlan(item).kind !== 'generated';
}

/**
 * WHETHER A POST'S HTML DOCUMENT IS MISSING THE TEMPLATE ITS MANIFEST NAMES,
 * as far as the post's own form can tell (review of ledger 0396). A form that
 * promised "the HTML document's live thumbnail" for a document that carries no
 * such template promised something no list would ever draw.
 *
 *   a staged document  its own bytes answer (`servedThumbnailTemplate`, the
 *                      serving route's own test), before anything is saved;
 *   the stored one     the row the database wrote answers: under a manifest
 *                      naming a live thumbnail, an automatic live row means the
 *                      document carries the template, and NO automatic row
 *                      means 0268's sync found it does not
 *                      (`_classroom_html_may_carry_template`);
 *   null               this form cannot tell: no live thumbnail is declared, a
 *                      thumbnail set by hand hides the database's answer, or
 *                      the read could not say (`undefined`, no 0268).
 */
export function liveTemplateMissing(
	declared: ManifestThumbnail | null | undefined,
	stagedHtml: string | null | undefined,
	stored: ItemThumbnail | null | undefined
): boolean | null {
	if (declared?.source !== 'html') return null;
	if (typeof stagedHtml === 'string') return servedThumbnailTemplate(stagedHtml, declared.template) === null;
	if (stored === undefined || stored?.manual) return null;
	return !(stored && stored.source === 'html' && stored.html_document_id);
}

/** `object-position` for a focal point: the subject stays in view in every shape. */
export function focalPosition(x: number, y: number): string {
	const pct = (n: number) => `${Math.round(Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0.5)) * 1000) / 10}%`;
	return `${pct(x)} ${pct(y)}`;
}

/**
 * WHERE A PICTURE SITS IN ITS SLOT SO ITS FOCAL POINT IS IN THE MIDDLE, as an
 * `object-position`, and this is why the natural size is stored.
 *
 * `object-position: 72% 60%` alone does not centre a point at (0.72, 0.6): a
 * percentage aligns that fraction of the picture with the same fraction of the
 * box, which only centres the point at 0%, 50% and 100%, so a subject off
 * centre drifts towards the edge in a banner or a tile. With the picture's
 * aspect ratio known, the exact answer is plain arithmetic over the slot's own
 * size, which `PostThumbnail` is a size container for (`cqw`, `cqh`):
 *
 *   covered width  sw = max(w, h * r)     covered height  sh = max(h, w / r)
 *   x = clamp(w - sw, w / 2 - fx * sw, 0) y = clamp(h - sh, h / 2 - fy * sh, 0)
 *
 * so the point is centred where the picture allows and the picture never
 * pulls away from an edge. With no stored size it falls back to the
 * percentage, which is still right at the centre and the edges.
 */
export function focalObjectPosition(
	fx: number,
	fy: number,
	width: number | null | undefined,
	height: number | null | undefined
): string {
	if (!width || !height || !Number.isFinite(width / height) || width <= 0 || height <= 0) return focalPosition(fx, fy);
	const c = (n: number) => Math.round(Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0.5)) * 1000) / 1000;
	const r = Math.round((width / height) * 10000) / 10000;
	const sw = `max(100cqw, 100cqh * ${r})`;
	const sh = `max(100cqh, 100cqw / ${r})`;
	const x = `clamp(100cqw - ${sw}, 50cqw - ${c(fx)} * ${sw}, 0px)`;
	const y = `clamp(100cqh - ${sh}, 50cqh - ${c(fy)} * ${sh}, 0px)`;
	return `${x} ${y}`;
}

/** The focal point one keyboard step away, kept inside the picture. */
export function nudgeFocal(x: number, y: number, dx: number, dy: number): { x: number; y: number } {
	const c = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
	return { x: c(x + dx), y: c(y + dy) };
}

// ---------------------------------------------------------------------------
// The generated identity's tint.
// ---------------------------------------------------------------------------

/**
 * HOW MANY UNIT TINTS THERE ARE. A unit's tint is its position in the class's
 * own unit order, wrapped, so the first unit of every class reads the same
 * color and a fifth unit repeats the first rather than inventing a hue. FOUR,
 * not eight (ledger 0467): a class page also draws its palette, its section
 * color and the status chips, and the site's rule is at most five to seven
 * hues a reader must tell apart on one screen; a fifth warm tint could not be
 * told from marigold as a word on Space White. The colors are the kit
 * library's entries `PostThumbnail.svelte` names, solved per theme.
 */
export const THUMB_TINT_COUNT = 4;

/**
 * A post's tint: its unit's place among the class's units (0 to 3), or null for
 * a post in no unit, which draws in the room's own neutral ink.
 */
export function unitTint(unitId: string | null | undefined, orderedUnitIds: readonly string[]): number | null {
	if (!unitId) return null;
	const i = orderedUnitIds.indexOf(unitId);
	return i < 0 ? null : i % THUMB_TINT_COUNT;
}

/** What a post is, for the glyph: the item kinds, and a notebook check-in row. */
export type ThumbGlyph = ClassroomItem['kind'] | 'checkin';

// ---------------------------------------------------------------------------
// Writes.
// ---------------------------------------------------------------------------

/** What a teacher can choose by hand. `auto` gives the post back to its manifest or the generated identity. */
export type ThumbnailChoice =
	| { source: 'auto' }
	| { source: 'none' }
	| {
			source: 'image';
			attachmentId: string;
			width: number | null;
			height: number | null;
			focalX: number;
			focalY: number;
	  };

export type ThumbnailResult = { ok: true; thumbnail: ItemThumbnail | null } | { ok: false; message: string; unavailable?: boolean };

/**
 * THE WRITES, injected (the ReviewConsole convention): the route points them at
 * 0268's functions, a harness answers in memory, and an ABSENT transport
 * removes the thumbnail editor rather than showing one that cannot save.
 */
export interface ThumbnailTransports {
	/**
	 * Send a picture (already sized by the editor) through the one classroom
	 * upload path and make it the post's thumbnail. Its failure sentence is
	 * that path's own vocabulary (`$lib/classroom/upload-errors`), never the
	 * storage service's.
	 */
	sendPicture(
		itemId: string,
		file: File,
		meta: { width: number | null; height: number | null; focalX: number; focalY: number },
		onProgress?: (fraction: number) => void
	): Promise<ThumbnailResult>;
	set(itemId: string, choice: ThumbnailChoice): Promise<ThumbnailResult>;
	focus(itemId: string, x: number, y: number): Promise<ThumbnailResult>;
}

/** A class's default shape, written by whoever manages the class. */
export type SectionThumbShapeWriter = (
	sectionId: string,
	shape: ThumbShape | null
) => Promise<{ ok: true; shape: ThumbShape | null } | { ok: false; message: string; unavailable?: boolean }>;

/**
 * THE SENTENCE FOR A DATABASE WITHOUT 0268, said where the control would be.
 * It names no table and no migration, because a teacher reads it.
 */
export const THUMBNAILS_UNAVAILABLE = 'Post thumbnails are not switched on for this classroom yet.';

// ---------------------------------------------------------------------------
// Uploading a picture.
// ---------------------------------------------------------------------------

/**
 * 10 MiB, refused in the browser and again by the sign route before anything
 * is sent. The editor redraws every picture at most `THUMBNAIL_MAX_EDGE` px on
 * its long side first, so a real thumbnail is a few hundred KB and this is a
 * backstop for a browser that could not redraw it.
 */
export const THUMBNAIL_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/**
 * THE LONGEST SIDE A THUMBNAIL PICTURE IS STORED AT, in px. Big enough for a
 * banner across a 1920px window at twice the pixel density's half, and small
 * enough that thirty of them on one class page are a few megabytes rather than
 * thirty phone photos.
 */
export const THUMBNAIL_MAX_EDGE = 1600;

/**
 * THE PICTURES A THUMBNAIL MAY BE, by name: what every browser decodes in an
 * `<img>`. 0268 refuses the same list by the key's and the file's extension.
 * HEIC is not on it because Chrome cannot draw one; the editor redraws a HEIC
 * the browser CAN decode (Safari) as a JPEG before it gets here.
 */
export const THUMBNAIL_RASTER_RE = /\.(png|jpe?g|gif|webp|avif|bmp)$/i;

// ---------------------------------------------------------------------------
// The glyphs.
// ---------------------------------------------------------------------------

/**
 * EACH KIND'S GLYPH, AS PATH DATA, ONCE. The class row's small kind mark and
 * the generated identity draw the same strokes from here (24-unit box, round
 * caps and joins, `currentColor`), so a kind cannot look one way in the row
 * and another on its tile.
 */
export const KIND_GLYPHS: Readonly<Record<ThumbGlyph, readonly string[]>> = {
	assignment: ['M7 3.5h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z', 'M14 3.5v5h5', 'M9 14.5l2 2 4-4.5'],
	material: ['M4 5.5A1.5 1.5 0 0 1 5.5 4H10l2 2.5h6.5A1.5 1.5 0 0 1 20 8v10.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z'],
	post: ['M4 9.5h3.5L14 5v14l-6.5-4.5H4z', 'M17.5 9.5a4 4 0 0 1 0 5'],
	checkin: ['M6 3.5h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z', 'M9 9h6M9 13h6M9 17h3']
};
