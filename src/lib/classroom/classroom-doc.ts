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
	/** Each item is its own run list; nested lists flatten into their parent. */
	| { type: 'ul'; items: ItemInline[][] }
	| { type: 'ol'; items: ItemInline[][] };

/** A whole item body: an ordered list of blocks. */
export type ItemDoc = ItemBlock[];

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

/** Every run in a block, whatever kind it is. */
function blockRuns(block: ItemBlock): ItemInline[][] {
	return block.type === 'ul' || block.type === 'ol' ? block.items : [block.runs];
}

/**
 * The document as PLAIN TEXT: one line per block or list item.
 *
 * This is what gets stored in `classroom_items.body`, and it is derived from
 * the SANITIZED doc in the same server call that sanitizes it -- so the two
 * columns can never disagree about what an item says. Everything that reads
 * the body as text (an announcement's fallback title, the home feed, search)
 * keeps working untouched, and a client that has not been taught about
 * `body_doc` yet still renders a faithful plain-text version.
 */
export function docText(doc: ItemDoc): string {
	const lines: string[] = [];
	for (const block of doc) {
		for (const runs of blockRuns(block)) {
			lines.push(runs.map((r) => r.text).join(''));
		}
	}
	return lines.join('\n').trim();
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

/** Stored doc -> the editor's own document, for opening an existing item. */
export function docToTiptap(doc: ItemDoc): TiptapNode {
	const content: TiptapNode[] = doc.map((block) => {
		if (block.type === 'p') return paragraphNode(block.runs);
		if (block.type === 'h3') return paragraphNode(block.runs, 'heading', { level: 3 });
		if (block.type === 'h4') return paragraphNode(block.runs, 'heading', { level: 4 });
		return {
			type: block.type === 'ul' ? 'bulletList' : 'orderedList',
			content: block.items.map((item) => ({
				type: 'listItem',
				content: [paragraphNode(item)]
			}))
		};
	});
	return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}
