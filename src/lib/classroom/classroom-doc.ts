/**
 * Classroom item bodies: the canonical rich-text document shape and the pure
 * helpers around it.
 *
 * Plain data + pure functions only (the classroom.ts / curriculum.ts
 * convention): no Svelte, no Supabase, no `$lib/server` import, nothing that
 * cannot run in a dev harness with no backend.
 *
 * WHY A TYPED DOCUMENT RATHER THAN A BLOB OF HTML. An item body is written by
 * a teacher and rendered into every student's browser in the class. Storing
 * sanitized HTML and rendering it with `{@html}` would make the sanitizer the
 * only thing standing between the two -- and this platform's rule is that a
 * boundary must not depend on one layer remembering to run. So the editor's
 * output is NORMALIZED SERVER-SIDE (src/lib/server/classroom-doc.ts) into the
 * small closed shape below, stored as jsonb, refused at the door by a SQL gate
 * if it does not conform (0108's `_classroom_doc_ok`, which is what makes a
 * direct PostgREST call on the RPC unable to store anything else), and
 * rendered by walking it into real Svelte elements. There is no `{@html}`
 * anywhere in the item-body path, so even a bug in the normalizer can at worst
 * store text that renders as text.
 *
 * THE SHAPE IS THE WHOLE FEATURE SCOPE AND NOTHING MORE: bold, italic, links,
 * bulleted and numbered lists, and headings. A node type it does not name
 * simply does not survive normalization.
 *
 * DELIBERATELY SEPARATE FROM THE NOTEBOOK'S NoteDoc, which is the same shape
 * language plus or minus a block type. They are two contracts with two SQL
 * gates and two renderers; sharing one type would mean widening the notebook's
 * stored contract every time the classroom's grew. The one genuinely shared
 * piece -- the link-scheme check -- lives in $lib/rich-text and is imported by
 * both.
 */

import { safeHref, type TiptapNode } from '$lib/rich-text';
import { itemParts, richDocText } from '$lib/rich-text-doc';

export { safeHref, tiptapHasText, type TiptapNode } from '$lib/rich-text';

/** One run of inline text. The absent-means-off flags keep stored docs small. */
export interface ItemInline {
	text: string;
	bold?: true;
	italic?: true;
	/** Already scheme-checked by `safeHref` at normalization AND at render. */
	href?: string;
}

/**
 * HEADINGS ARE h3 AND h4 ONLY, and that is a rendering fact rather than a
 * preference. Every surface that shows a body already owns the levels above
 * it: the item page's h1 is the item's title and its h2 is the section label
 * ("Instructions", "Details"). A body that could emit an h1 would be competing
 * with the title of the thing it is inside. The normalizer CLAMPS rather than
 * refuses (1-3 -> h3, 4-6 -> h4), which is also what guarantees a pasted
 * document's headings arrive as headings instead of leaking through as
 * paragraphs or, worse, as literal markup.
 *
 * This is the same rule, for the same reason, that the reference-document
 * renderer applies to authored headings.
 */
export type ItemBlock =
	| { type: 'p'; runs: ItemInline[] }
	| { type: 'h3'; runs: ItemInline[] }
	| { type: 'h4'; runs: ItemInline[] }
	| ItemImage
	| ItemList;

/**
 * A PICTURE IN A BODY (0176), and the one member of this union that carries no
 * runs.
 *
 * WHY IT EARNED A PLACE, against the argument every other candidate loses to.
 * The union is small because each member is a thing the SHAPE has to hold
 * rather than a thing an author might like: a nested list earned its place
 * because flattening one destroyed what a teacher wrote, and a paragraph
 * inside a list item did NOT, because the item's own runs already spell it.
 * An image is the first case since where there is no other spelling at all --
 * the body of an assignment on a surface whose whole subject is making and
 * measuring physical things could not hold a photograph of the part, and no
 * arrangement of `p`, `h3`, `h4`, `ul` and `ol` can.
 *
 * `src` IS AN AUTHORED REFERENCE, NEVER A URL AND NEVER AN ID, and it is
 * exactly the string `resolveFigureSrc` already reads in a spec's prose:
 * `attachment:<filename>` against the item's OWN attachments, or an absolute
 * path under `FIGURE_STATIC_PREFIXES`. A signed URL expires and a stored body
 * must not; a file ID does not survive a re-upload and means nothing in the
 * exported copy under `materials/`. There is deliberately NO second image
 * vocabulary here: the same one predicate decides what an `img` may load in a
 * spec, in a reference document and now in a body, so widening one widens all
 * of them consistently and none of them can drift into being the loose one.
 *
 * `alt` IS REQUIRED AND HAS NO EMPTY FORM. This is a school; a student using a
 * screen reader is not a hypothetical, and an image with no text alternative
 * is a picture that simply is not there for them. So the requirement is in the
 * TYPE (`string`, not `string | undefined`), in the normalizer (which REFUSES
 * the save rather than dropping the image, so the person who left it blank
 * finds out), and in 0176's gate (so a direct PostgREST call cannot store one
 * either). A body cannot reach the table with a blank description by any door.
 *
 * WHAT IT DELIBERATELY DOES NOT CARRY: intrinsic dimensions. They are not
 * knowable at authoring time from the reference alone -- the alias is resolved
 * against a row that may be re-uploaded under the same name -- so a stored
 * width and height would be a claim that goes quietly wrong, and the layout
 * that would use them is a CSS aspect box the renderer can set without them.
 * A caption is likewise absent: `alt` is the one authored sentence, exactly as
 * it is for a markdown figure, where the same string is both the `alt` and the
 * `figcaption`.
 */
export interface ItemImage {
	type: 'img';
	/** `attachment:<filename>` or a path under FIGURE_STATIC_PREFIXES. */
	src: string;
	/** Required, non-empty. The text alternative AND the caption. */
	alt: string;
}

/**
 * The editor's own node name and attribute list for an image, as PLAIN DATA.
 *
 * ONE DECLARATION, three readers: `RichTextEditor` builds the real Tiptap node
 * from it, the server normalizer matches an incoming node against the name,
 * and the tests build a fixture the editor could genuinely have produced
 * rather than typing one out. A second spelling of the node name is a document
 * the editor emits and the normalizer silently drops -- the exact failure this
 * bundle exists to prevent one layer down.
 *
 * IT IS NOT IN `$lib/rich-text-schema` because that module is the STARTER KIT
 * options both features share, and this node belongs to the classroom's
 * contract alone: a note has no images and giving the shared module one would
 * be the notebook's stored shape widening because the classroom's did.
 */
export const ITEM_IMAGE_NODE = {
	name: 'itemImage',
	attrs: ['src', 'alt'] as const
} as const;

/**
 * A bulleted or numbered list, at the top of a body or inside a list item.
 *
 * ONE SHAPE FOR BOTH POSITIONS (0122). A nested list is the same object a
 * top-level one is, which is what lets the gate, the projection and the
 * renderer each gain nesting as one recursive branch rather than a second
 * vocabulary. ONLY `ul` and `ol` may nest: a `p` inside an item would give an
 * item's own text two spellings, and two spellings drift.
 */
export interface ItemList {
	type: 'ul' | 'ol';
	items: ItemItem[];
}

/**
 * One list item: its own runs, then any sublists under it.
 *
 *     item := ( run | list )*
 *
 * `type` is a TOTAL discriminator per element -- a run cannot carry one, and
 * has not been able to since 0108 -- so every body stored before 0122 is
 * exactly this shape with no list in it. There is no legacy branch.
 *
 * A LIST ITEM STILL CANNOT HOLD TWO PARAGRAPHS, and that is deliberate rather
 * than unfinished. See the note on `listItems` in
 * $lib/server/rich-text-normalize.
 */
export type ItemItem = (ItemInline | ItemList)[];

/** A whole item body: an ordered list of blocks. */
export type ItemDoc = ItemBlock[];

/**
 * How deep a body's list nesting may go: 0122's `_classroom_list_ok` cap, and
 * therefore the deepest a stored body can be. Carried down by everything that
 * walks a body -- the projection, the editor round trip, the renderer -- so
 * none of them can be the one that trusts the gate and recurses forever on a
 * document that reached the table another way.
 */
export const ITEM_LIST_MAX_DEPTH = 16;

/**
 * The cap on an item body's PLAIN TEXT.
 *
 * Not a new number: 0085's `_classroom_check_item_fields` has capped
 * `classroom_items.body` at exactly this since the canonical record existed,
 * and the plain-text projection of a doc is what lands in that column. Naming
 * a different figure here would mean the editor accepting something the
 * database then refuses.
 */
export const ITEM_BODY_MAX_CHARS = 20_000;

/**
 * The document as PLAIN TEXT: one line per block or list item, at every level.
 *
 * THIS IS A MIRROR OF `_classroom_doc_text`, NOT AN INDEPENDENT PROJECTION,
 * and the walk itself lives in $lib/rich-text-doc with the reasoning. What
 * lands in `classroom_items.body` is what the SQL function makes of the stored
 * document, inside the write RPCs -- a caller's `p_body` is ignored when a
 * document is supplied -- so every disagreement between this and that is a
 * client contradicting the column the stream, the announcement fallback, the
 * feed and the export all read.
 */
export function docText(doc: ItemDoc): string {
	return richDocText(doc, ITEM_LIST_MAX_DEPTH);
}

export function docIsEmpty(doc: ItemDoc | null | undefined): boolean {
	return !doc || doc.length === 0 || docText(doc) === '';
}

/** Total plain-text length, the quantity ITEM_BODY_MAX_CHARS caps. */
export function docLength(doc: ItemDoc): number {
	return docText(doc).length;
}

/**
 * Plain text -> the document shape, for content authored before rich text
 * existed.
 *
 * Blank lines separate paragraphs, which is exactly how the old textarea
 * rendered (`white-space: pre-wrap` in the stream, a single `<p>` on the item
 * page) -- so a body written in 2026 comes out reading the way it always did
 * rather than collapsing into one wall of text. Single newlines inside a
 * paragraph become spaces, since the shape has no hard break and inventing one
 * to preserve a soft wrap would be a formatting change nobody asked for.
 *
 * Used in two places that must agree: 0108's backfill (in SQL, mirrored) and
 * the render-time fallback for any item whose `body_doc` is missing because
 * the migration has not been applied yet.
 */
export function docFromPlainText(text: string): ItemDoc {
	const trimmed = (text ?? '').replace(/\r\n?/g, '\n').trim();
	if (trimmed === '') return [];
	return trimmed
		.split(/\n\s*\n+/)
		.map((para) => para.split('\n').map((l) => l.trim()).filter(Boolean).join(' '))
		.filter((para) => para !== '')
		.map((para) => ({ type: 'p', runs: [{ text: para }] }) as ItemBlock);
}

/**
 * The document to RENDER for an item, whatever the backend gave us.
 *
 * `body_doc` when it is there, the plain-text body converted when it is not.
 * The fallback is what makes this change safe to deploy in either order: a
 * client that has 0108's column in its select and a database that does not
 * yet, or an item whose doc has genuinely never been written, both render
 * their real content instead of nothing.
 */
export function itemBodyDoc(item: { body: string; body_doc?: ItemDoc | null }): ItemDoc {
	const doc = item.body_doc;
	if (doc && doc.length > 0) return doc;
	return docFromPlainText(item.body ?? '');
}

/**
 * The FIRST image in a body, or null -- which is the whole of what a cover is.
 *
 * A COVER IS NEVER A SEPARATELY UPLOADED FILE, and that is a lifecycle
 * decision rather than a shortcut. A second asset would need its own upload,
 * its own row, its own deletion story and its own answer to "the instructor
 * changed the picture in the body but the card still shows the old one". The
 * first image an author put in the body is the picture they chose to lead
 * with, it is already attached, and it cannot fall out of step with itself.
 *
 * Document order, first match, no scoring: an author who wants a different
 * cover moves the image up, which is a thing they can already see how to do.
 * A body with no image answers null and the surface keeps exactly what it
 * renders today.
 */
export function itemCoverImage(doc: ItemDoc | null | undefined): ItemImage | null {
	if (!Array.isArray(doc)) return null;
	for (const block of doc) {
		if (block && typeof block === 'object' && block.type === 'img') return block;
	}
	return null;
}

// ---------------------------------------------------------------------------
// Tiptap interop
//
// The editor speaks ProseMirror JSON; storage speaks the shape above. The
// INBOUND direction (editor -> stored doc) is the sanitizer and lives on the
// server. This is the outbound half -- seeding the editor from a stored doc --
// which is pure display and safe to ship to the client.
// ---------------------------------------------------------------------------

function runToTiptap(run: ItemInline): TiptapNode | null {
	if (!run.text) return null;
	const marks: TiptapNode['marks'] = [];
	if (run.bold) marks.push({ type: 'bold' });
	if (run.italic) marks.push({ type: 'italic' });
	const href = safeHref(run.href);
	if (href) marks.push({ type: 'link', attrs: { href } });
	return { type: 'text', text: run.text, ...(marks.length ? { marks } : {}) };
}

function paragraphNode(runs: ItemInline[], type = 'paragraph', attrs?: Record<string, unknown>) {
	const content = runs.map(runToTiptap).filter((n): n is TiptapNode => n !== null);
	const node: TiptapNode = { type, ...(attrs ? { attrs } : {}) };
	if (content.length) node.content = content;
	return node;
}

/**
 * One stored list -> the editor's own list, sublists included.
 *
 * A LIST ITEM IS `paragraph block*` IN THE EDITOR'S SCHEMA, so the item's own
 * runs are its paragraph and each sublist follows as a further block of the
 * same item -- which is exactly where the editor put the sublist that was
 * normalized into this shape. An item that holds only a sublist round-trips as
 * an EMPTY paragraph plus that list, which is the arrangement it came from.
 * Getting this wrong is invisible until someone reopens an item to edit it and
 * saves it back one level flatter than they wrote it -- and `normalizeItemDoc`
 * routes an ALREADY-STORED document through here on every publish toggle, so
 * it would not even take an edit.
 */
function listToTiptap(list: ItemList, depth: number): TiptapNode {
	return {
		type: list.type === 'ul' ? 'bulletList' : 'orderedList',
		content: list.items.map((item) => {
			const { runs, lists } = itemParts(item);
			return {
				type: 'listItem',
				content: [
					paragraphNode(runs),
					...(depth < ITEM_LIST_MAX_DEPTH ? lists.map((sub) => listToTiptap(sub, depth + 1)) : [])
				]
			};
		})
	};
}

/** Stored doc -> the editor's own document, for opening an existing item. */
export function docToTiptap(doc: ItemDoc): TiptapNode {
	const content: TiptapNode[] = doc.map((block) => {
		if (block.type === 'p') return paragraphNode(block.runs);
		if (block.type === 'h3') return paragraphNode(block.runs, 'heading', { level: 3 });
		if (block.type === 'h4') return paragraphNode(block.runs, 'heading', { level: 4 });
		// An ATOM: no content, everything it holds is in its attributes, which is
		// what the editor's own node declares. It round-trips through here on
		// every publish toggle (`normalizeItemDoc` routes an already-stored
		// document back through the editor walk), so a missing branch here would
		// not merely fail to seed an editor -- it would DELETE the picture from
		// a body nobody was editing.
		if (block.type === 'img') {
			return { type: ITEM_IMAGE_NODE.name, attrs: { src: block.src, alt: block.alt } };
		}
		return listToTiptap(block, 1);
	});
	return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}
