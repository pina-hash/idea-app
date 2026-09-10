/**
 * WHICH PICTURES AN ITEM BODY MAY BE OFFERED, and what the item will call each
 * one once it is saved (0041).
 *
 * Prompt 0030 shipped the image block and said plainly what it could not
 * finish: the editor's Image control asked for a FILENAME, typed by hand. A key
 * typed wrong produces a body naming a picture that will never load, and
 * nothing on screen says so until a student opens the page. This module is the
 * list the picker offers instead.
 *
 * PURE AND CLIENT-SAFE: plain data in, plain data out, no DOM, no Svelte, no
 * transport. That is what lets the whole rule be asserted in the `node` project
 * without a mount -- a mount costs roughly an order of magnitude more per test
 * and would prove nothing extra about which names are offerable.
 *
 * IT INVENTS NO PREDICATE. Whether a reference resolves is `resolveFigureSrc`'s
 * question and is asked THROUGH it, on the same attachment list the renderer
 * will be given; whether a name reads as a picture is `isImageFilename`'s. A
 * second copy of either is the thing that quietly stops agreeing -- and here it
 * would stop agreeing in the worst direction, by offering a choice the page
 * then declines to draw.
 */
import {
	isImageFilename,
	resolveFigureSrc,
	sanitizeAttachmentFilename,
	type ClassroomAttachment,
	type TxResult
} from '$lib/classroom/classroom';

/** The `attachment:` scheme, spelled once. `resolveFigureSrc` owns the reading
 *  half of this string; this is the writing half, and they are the same six
 *  characters or the picker offers something the resolver has never heard of. */
export const ATTACHMENT_REF_PREFIX = 'attachment:';

/** The reference an item body carries for one attachment. `figureReference` is
 *  the MARKDOWN form of the same alias (`![caption](attachment:name)`), which a
 *  spec's prose field uses; a body document carries the bare src, so this is
 *  that one field and nothing around it. */
export function attachmentRef(filename: string): string {
	return `${ATTACHMENT_REF_PREFIX}${filename}`;
}

/**
 * A file already on the item, or one staged in the composer and not uploaded
 * yet. The distinction is the whole reason this type has a `state`: a staged
 * file's reference does not resolve until the save lands its upload, and a
 * picker that did not say so would be handing somebody a dangling reference
 * while looking exactly like one that was not.
 */
export type ImageChoiceState = 'attached' | 'staged';

export interface ImageChoice {
	/** The exact string the document's `src` will carry. */
	ref: string;
	/** The name the item knows, or will know, this file by. */
	filename: string;
	/** The name to show. Differs from `filename` only where the recorded name
	 *  was sanitized, which is worth seeing before it is chosen. */
	label: string;
	state: ImageChoiceState;
	/** A thumbnail for a file already on the item, resolved through the same
	 *  proxy helper the page uses; null for a staged file, whose bytes exist
	 *  nowhere but this browser's memory and which the Files panel a few
	 *  centimetres below is already previewing. */
	previewSrc: string | null;
}

/**
 * WHAT THE ITEM WILL CALL A STAGED FILE, computed the way the record route
 * computes it.
 *
 * `/api/classroom/attachment` derives `p_filename` from the uploaded file's
 * name -- sanitized (so `figureReference` always produces a renderable line),
 * capped, and defaulted -- so a staged file's eventual alias is a PURE FUNCTION
 * of `file.name` and is knowable before a single byte moves. That is what makes
 * offering a staged file a prediction rather than a guess.
 *
 * THE ROUTE IS NOT MINE TO POINT AT THIS HELPER (0041 owns neither
 * `src/routes/api/classroom/attachment/+server.ts` nor a migration), so the two
 * statements of the rule are pinned together by a tripwire in
 * `tests/classroom-item-image-picker.test.ts` that reads the route's source and
 * reddens if its expression moves. Folding the route onto this function is the
 * follow-up, and it is one import.
 */
export function recordedAttachmentFilename(rawName: string): string {
	return sanitizeAttachmentFilename(String(rawName ?? '').trim().slice(0, 300)) || 'attachment';
}

/** The staged half of the input: a `File` handle, or anything carrying a name.
 *  Typed on the property rather than on `File` so the pure module never has to
 *  reach for a DOM lib and a test can hand it a plain object. */
export interface StagedFileLike {
	name: string;
}

export interface ImageChoiceInput {
	/** Attachments the item already carries, exactly as the renderer will be
	 *  given them -- this list is what `resolveFigureSrc` is asked about. */
	attached?: ClassroomAttachment[];
	/** Student-facing files staged in the composer and not yet uploaded. */
	staged?: StagedFileLike[];
}

/**
 * The pictures a body may be offered, attached first, then staged, each in the
 * order its own list gives.
 *
 * OFFERED: an attachment whose name reads as a picture AND whose alias
 * `resolveFigureSrc` actually resolves against this same list; a staged file
 * whose PREDICTED recorded name reads as a picture and is not an SVG.
 *
 * REFUSED, and each for its own reason:
 *   - anything `resolveFigureSrc` would refuse (an SVG by name or by stored
 *     mime, above all), because offering it means offering a picture the page
 *     then declines to draw -- which is the defect this whole bundle exists to
 *     remove, wearing a picker's clothes;
 *   - anything whose name does not read as a picture. `resolveFigureSrc` is
 *     happy to resolve `notes.pdf` to a proxy URL -- it decides ACCESS, not
 *     whether bytes decode -- and an `img` pointed at a PDF is a broken picture
 *     with a perfectly valid reference behind it;
 *   - a name a candidate earlier in the list already claims. The alias matches
 *     case-insensitively and FIRST MATCH WINS, so two rows offering one string
 *     are two rows that cannot be told apart by the document they produce.
 *
 * INSTRUCTOR-ONLY FILES ARE NOT AN INPUT AT ALL, which is stronger than
 * refusing them: they live in their own bucket and their own table, an item
 * body's alias is resolved against the STUDENT-FACING attachments and could
 * never reach one, and a body is read by the whole class. There is no parameter
 * here through which one could be passed.
 */
export function imageChoices(input: ImageChoiceInput): ImageChoice[] {
	const attached = input.attached ?? [];
	const staged = input.staged ?? [];
	const out: ImageChoice[] = [];
	const claimed = new Set<string>();

	for (const a of attached) {
		const filename = (a.filename ?? '').trim();
		if (!filename || !isImageFilename(filename)) continue;
		const key = filename.toLowerCase();
		if (claimed.has(key)) continue;
		// THE REAL PREDICATE, on the real list. An SVG is refused here by both of
		// its spellings without this module knowing either of them.
		const resolved = resolveFigureSrc(attachmentRef(filename), attached);
		if (!resolved.ok) continue;
		claimed.add(key);
		out.push({
			ref: attachmentRef(filename),
			filename,
			label: filename,
			state: 'attached',
			previewSrc: resolved.src
		});
	}

	for (const file of staged) {
		const raw = (file?.name ?? '').trim();
		if (!raw) continue;
		const filename = recordedAttachmentFilename(raw);
		if (!isImageFilename(filename)) continue;
		const key = filename.toLowerCase();
		if (claimed.has(key)) continue;
		// The row does not exist yet, so there is no stored mime to ask about and
		// no attachment list to match against. Put the alias to the resolver
		// against a HYPOTHETICAL row instead -- the one the record route will
		// write, `application/octet-stream` exactly as 0133 stores every object --
		// so the same predicate decides this half too rather than a name check
		// standing in for it.
		const resolved = resolveFigureSrc(attachmentRef(filename), [
			{ id: 'staged', filename, mime_type: 'application/octet-stream', sort_order: 0 }
		]);
		if (!resolved.ok) continue;
		claimed.add(key);
		out.push({
			ref: attachmentRef(filename),
			filename,
			label: filename === raw ? filename : `${raw} (saved as ${filename})`,
			state: 'staged',
			previewSrc: null
		});
	}

	return out;
}

/** Is this exact reference one the picker offered. The insert handler asks it
 *  before writing anything, so "the document can only ever name a picture that
 *  was on the list" is a property of the code rather than of the markup. */
export function isOfferedRef(choices: ImageChoice[], ref: string): boolean {
	const wanted = (ref ?? '').trim();
	return wanted !== '' && choices.some((c) => c.ref === wanted);
}

// ---------------------------------------------------------------------------
// WHERE AN ITEM'S FILES AND LINKS SIT, AND IN WHAT ORDER (0193).
//
// Two decisions an author makes about resources, and neither is content: the
// PLACEMENT (files above the writing or below it, links likewise) and the
// ORDER of the files. Links were already ordered -- `classroom_item_resources`
// is a full-set replacement whose array order is the stored sort -- and had no
// control to change it; files carried a `sort_order` set on insert and nothing
// that could move one. Placement had nowhere to live at all.
//
// THE COLUMNS CANNOT RIDE ON `ClassroomItem` THROUGH THE NORMALIZER.
// `normalizeItemRow` builds its object field by field, so a column it does not
// name is dropped -- and it is not this module's to widen. The layout is
// therefore ATTACHED beside the item by the readers this module's callers own
// (`withItemLayout`), and read back through `itemLayoutOf`, which accepts the
// attached shape and the raw row alike. Absent means "this read could not
// tell" (a project without 0193, or a read that did not ask), exactly as an
// absent `body_doc` does, and every surface treats absent as the default.
// ---------------------------------------------------------------------------

export type ResourcePlacement = 'top' | 'bottom';

export const RESOURCE_PLACEMENTS: readonly ResourcePlacement[] = ['top', 'bottom'];

export interface ItemLayout {
	files: ResourcePlacement;
	links: ResourcePlacement;
}

export const DEFAULT_ITEM_LAYOUT: Readonly<ItemLayout> = Object.freeze({
	files: 'bottom',
	links: 'bottom'
});

/** The column names 0193 adds to `classroom_items`, spelled once. */
export const ITEM_LAYOUT_COLUMNS = ['files_placement', 'links_placement'] as const;

/** A value read back from anywhere: unrecognised is DROPPED to the default,
 *  the preferences rule -- a stored value can never put a surface in a state
 *  no branch renders. */
export function placementOf(value: unknown): ResourcePlacement {
	return value === 'top' ? 'top' : 'bottom';
}

export type WithItemLayout<T> = T & { layout?: ItemLayout };

/** Did this row's select include the placement columns at all? */
export function layoutColumnsPresent(row: Record<string, unknown> | null | undefined): boolean {
	return !!row && ITEM_LAYOUT_COLUMNS.every((c) => c in row);
}

/**
 * Attach the layout a raw row carries onto the normalized item, or nothing
 * when the row did not carry the columns. Absent stays absent: a reader that
 * could not tell must not claim the default as a fact.
 */
export function withItemLayout<T extends object>(
	item: T,
	row: Record<string, unknown> | null | undefined
): WithItemLayout<T> {
	if (!layoutColumnsPresent(row)) return item;
	return Object.assign(item, {
		layout: {
			files: placementOf(row!.files_placement),
			links: placementOf(row!.links_placement)
		}
	});
}

/**
 * The layout of anything that might carry one: an item with `layout` attached,
 * a raw row with the columns, or nothing recognisable (the default). Never
 * throws and never answers a value outside the union.
 */
export function itemLayoutOf(source: unknown): ItemLayout {
	if (!source || typeof source !== 'object') return { ...DEFAULT_ITEM_LAYOUT };
	const rec = source as Record<string, unknown>;
	const attached = rec.layout;
	if (attached && typeof attached === 'object') {
		const l = attached as Record<string, unknown>;
		return { files: placementOf(l.files), links: placementOf(l.links) };
	}
	if (layoutColumnsPresent(rec)) {
		return { files: placementOf(rec.files_placement), links: placementOf(rec.links_placement) };
	}
	return { ...DEFAULT_ITEM_LAYOUT };
}

/** Could this read tell? False for a pre-0193 row, where the default is a
 *  guess rather than an answer. */
export function itemLayoutKnown(source: unknown): boolean {
	if (!source || typeof source !== 'object') return false;
	const rec = source as Record<string, unknown>;
	return (!!rec.layout && typeof rec.layout === 'object') || layoutColumnsPresent(rec);
}

export function sameLayout(a: ItemLayout, b: ItemLayout): boolean {
	return a.files === b.files && a.links === b.links;
}

/** Move one id from one index to another; pure, and a no-op on a bad index. */
export function reorderIds(ids: readonly string[], from: number, to: number): string[] {
	const next = [...ids];
	if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next;
	const [moved] = next.splice(from, 1);
	next.splice(to, 0, moved);
	return next;
}

/** Are two id lists the same list in the same order. */
export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((id, i) => id === b[i]);
}

/**
 * THE WRITES 0193 ADDS, as their own transport object rather than five more
 * methods on `ClassroomComposerTransports` -- that interface lives in
 * `classroom.ts`, and more to the point ABSENCE IS THE MECHANISM: a caller
 * that hands a surface `null` here removes every ordering, placement and
 * rename control at once, which is both the read-only case and the honest
 * state of a deployment where 0193 has not been applied by hand yet.
 *
 * Every method is a thin caller of a SECURITY DEFINER RPC that re-checks the
 * caller inside its own body; nothing here is a boundary.
 */
export interface ClassroomLayoutTransports {
	setItemLayout(itemId: string, layout: ItemLayout): Promise<TxResult<undefined>>;
	/** The FULL list, in its new order: the RPC refuses a partial one. */
	setAttachmentOrder(itemId: string, attachmentIds: string[]): Promise<TxResult<undefined>>;
	/** Answers the name the row now carries, which is the sanitized form. */
	renameAttachment(attachmentId: string, filename: string): Promise<TxResult<{ filename: string }>>;
	setInstructorAttachmentOrder(itemId: string, attachmentIds: string[]): Promise<TxResult<undefined>>;
	renameInstructorAttachment(
		attachmentId: string,
		filename: string
	): Promise<TxResult<{ filename: string }>>;
}

/**
 * The refusals the two rename RPCs answer with, as sentences. ONE vocabulary:
 * the transport maps the structured `{ok:false, reason}` onto these, and the
 * composer's own pre-check (`renameBlockedReason`) uses the same words, so a
 * teacher reads the identical sentence whether the client or the database was
 * the one that said no.
 */
export const RENAME_REFUSALS = {
	referenced:
		'This file is used as a picture in the text or as a figure in the document. Remove that first, then rename the file.',
	taken: 'Another file on this item already has that name.',
	empty: 'Give the file a name.'
} as const;

export type RenameRefusal = keyof typeof RENAME_REFUSALS;

/**
 * The name the row WILL carry for a name somebody typed -- the same rule the
 * record route applies to an uploaded file's name, so a renamed file and an
 * uploaded one cannot disagree about what a name becomes.
 */
export function renamedAttachmentFilename(raw: string): string | null {
	if (!raw.trim()) return null;
	return recordedAttachmentFilename(raw);
}

const REF_MENTION_CHARS = /[.*+?^${}()|[\]\\]/g;

/**
 * Does any string anywhere in this value mention `attachment:<filename>` as a
 * whole reference -- a spec's markdown figure, a body document's image src,
 * anything else that stores the alias as text. Case-insensitive, because the
 * resolver matches the filename case-insensitively (`resolveFigureSrc`), so a
 * mention that differs only by case is a mention that resolves.
 */
export function attachmentRefMentionedIn(value: unknown, filename: string): boolean {
	const name = filename.trim();
	if (!name) return false;
	const re = new RegExp(
		`${ATTACHMENT_REF_PREFIX}\\s*${name.replace(REF_MENTION_CHARS, '\\$&')}(?![^\\s)\\]"'<>,;])`,
		'i'
	);
	const seen = new Set<object>();
	const walk = (v: unknown): boolean => {
		if (typeof v === 'string') return re.test(v);
		if (!v || typeof v !== 'object') return false;
		if (seen.has(v)) return false;
		seen.add(v);
		if (Array.isArray(v)) return v.some(walk);
		return Object.values(v as Record<string, unknown>).some(walk);
	};
	return walk(value);
}

/**
 * Why a rename would leave something broken, or null when it would not.
 * Asked by the composer BEFORE the RPC, on what it holds in memory (the body
 * document the editor is showing, which the database cannot see until it is
 * saved), and asked again by the database on what IT holds. Two askers, one
 * vocabulary.
 */
export function renameBlockedReason(
	filename: string,
	context: { referencedIn?: unknown[]; siblings?: readonly string[] }
): RenameRefusal | null {
	for (const doc of context.referencedIn ?? []) {
		if (attachmentRefMentionedIn(doc, filename)) return 'referenced';
	}
	return null;
}

/** Would the NEW name collide with a sibling on the same item (first match
 *  wins on the alias, so two rows with one name cannot be told apart). */
export function renameCollides(next: string, siblings: readonly string[], self?: string): boolean {
	const wanted = next.trim().toLowerCase();
	return siblings.some((s) => s !== self && s.trim().toLowerCase() === wanted);
}
