/**
 * Classroom item bodies: the server-side normalizer.
 *
 * This is the sanitizer. Everything a teacher's editor produces passes through
 * it before a single byte is stored, and it is deliberately under `$lib/server`
 * -- SvelteKit refuses to bundle that into client code -- so there is no build
 * in which the browser's copy of these rules is the one being enforced.
 *
 * IT IS A WHITELIST TRANSLATOR, NOT A STRIPPER. The input is the editor's own
 * ProseMirror JSON, arbitrary and untrusted; the output is the closed ItemDoc
 * shape from $lib/classroom/classroom-doc. Nothing is "cleaned up and passed
 * along": a node type the walk does not name cannot appear in the result,
 * because the result is BUILT, node by node, from the ones it does. That is
 * what makes the failure mode of a novel attack "the content disappears"
 * rather than "the content survives in a form nobody checked".
 *
 * AND IT IS THE FIRST OF THREE GATES, NOT THE ONLY ONE. `classroom_create_item`
 * and `classroom_update_item` are granted to `authenticated` and reachable
 * straight through PostgREST, so a caller can skip this file entirely -- which
 * is why 0108 adds `_classroom_doc_ok`, a SQL gate that REFUSES a body_doc
 * outside the closed shape (unknown block types, unknown keys, non-text runs,
 * an unsafe href), and why the renderer walks the stored doc into real Svelte
 * elements with no `{@html}` anywhere and re-checks every href as it goes. A
 * document that reached the database by some other door still cannot execute
 * anything; it can only be text.
 *
 * PASTE FIDELITY IS THE OTHER HALF OF THE JOB. A teacher pasting instructions
 * out of a document brings headings, nested lists, tables, spans and inline
 * styles. Flattening rather than refusing is deliberate: an out-of-scope
 * wrapper contributes its TEXT rather than losing it, a nested list becomes
 * more items of its parent, and a heading is clamped into the two levels a
 * body is allowed to use. What arrives is what was written, minus formatting
 * this feature does not have.
 *
 * THE WALK ITSELF LIVES IN `./rich-text-normalize` and is shared with the
 * notebook's written notes, which used to hold a line-for-line copy of it. The
 * two CONTRACTS stay separate -- separate closed shapes, separate SQL gates,
 * separate renderers -- and everything below is what makes this one an item
 * body rather than a note.
 */

import {
	ITEM_BODY_MAX_CHARS,
	docLength,
	docText,
	docToTiptap,
	type ItemBlock,
	type ItemDoc,
	type TiptapNode
} from '$lib/classroom/classroom-doc';
import { richBlocksFrom, type RichWalkOptions } from './rich-text-normalize';

export type NormalizeItemDocResult = { ok: true; doc: ItemDoc } | { ok: false; error: string };

/**
 * A heading's stored level.
 *
 * CLAMPED, never refused: the surfaces that render a body own h1 (the item's
 * title) and h2 (the section label), so a body's headings start at h3. A paste
 * carrying an h1 becomes an h3 -- still the most prominent thing in the body,
 * still subordinate to the title of the thing it is inside. Clamping is also
 * what guarantees no heading can leak through as a paragraph and lose its
 * emphasis, or arrive as literal markup.
 */
function headingType(node: TiptapNode): 'h3' | 'h4' {
	const raw = node.attrs?.level;
	const level = typeof raw === 'number' && Number.isFinite(raw) ? raw : 3;
	return level <= 3 ? 'h3' : 'h4';
}

/**
 * Real instructions are two or three levels (list -> item -> emphasis), or one
 * more once a sublist is in play; the ceiling is a guard against hostile
 * nesting, not a feature limit. `blockType` is the one place a body differs
 * from a note structurally: it has headings.
 */
const WALK: RichWalkOptions = {
	maxDepth: 16,
	blockType: (node) => (node.type === 'heading' ? headingType(node) : null)
};

/**
 * Is this an ALREADY-STORED document rather than editor output?
 *
 * Both arrive as arrays, and they are not the same shape: a stored block holds
 * `runs` or `items`, an editor node holds `content`. Telling them apart matters
 * because callers legitimately hold both -- the composer sends what the editor
 * produced, while a publish toggle re-sends the item's existing document
 * untouched -- and running a stored document through the editor walk would find
 * no `content` anywhere and quietly store an EMPTY body. Silently, on a publish
 * click, for an item nobody was editing.
 *
 * Recognised here and round-tripped through `docToTiptap` so there is still one
 * normalization path, which also makes the whole function idempotent: passing
 * its own output back in returns the same document.
 */
function looksStored(nodes: unknown[]): boolean {
	const stored = new Set(['p', 'h3', 'h4', 'ul', 'ol']);
	return (
		nodes.length > 0 &&
		nodes.every((n) => {
			if (!n || typeof n !== 'object') return false;
			const node = n as Record<string, unknown>;
			return (
				typeof node.type === 'string' &&
				stored.has(node.type) &&
				(Array.isArray(node.runs) || Array.isArray(node.items))
			);
		})
	);
}

/**
 * Editor output (or anything at all) -> a storable item body.
 *
 * Accepts the ProseMirror document the editor emits: `{ type: 'doc', content:
 * [...] }`, a bare array of nodes, or an already-stored ItemDoc being
 * re-saved. Unlike the notebook's note normalizer this returns an EMPTY
 * document rather than a refusal for input with nothing in it: an item body is
 * genuinely optional on an assignment or a material (only an announcement
 * needs one, and 0085's `_classroom_check_item_fields` is what enforces that,
 * from the plain-text projection, exactly as it always has).
 */
export function normalizeItemDoc(input: unknown): NormalizeItemDocResult {
	if (input === null || input === undefined) return { ok: true, doc: [] };

	let nodes: TiptapNode[];
	if (Array.isArray(input)) {
		nodes = looksStored(input)
			? ((docToTiptap(input as ItemDoc).content ?? []) as TiptapNode[])
			: (input as TiptapNode[]);
	} else if (typeof input === 'object') {
		const content = (input as TiptapNode).content;
		if (!Array.isArray(content)) {
			return { ok: false, error: 'That body could not be read.' };
		}
		nodes = content;
	} else {
		return { ok: false, error: 'That body could not be read.' };
	}

	// A cheap ceiling on the WORK, separate from the ceiling on the result:
	// normalization of a pathological document should be refused, not performed
	// and then thrown away.
	if (nodes.length > 4000) {
		return { ok: false, error: 'That body is too long to save.' };
	}

	const doc = richBlocksFrom<ItemBlock>(nodes, 0, WALK);
	if (docLength(doc) > ITEM_BODY_MAX_CHARS) {
		return {
			ok: false,
			error: `The body is limited to ${ITEM_BODY_MAX_CHARS.toLocaleString()} characters.`
		};
	}

	return { ok: true, doc };
}

/**
 * The two columns an item body is stored as, derived TOGETHER from one
 * sanitized document.
 *
 * `body` is the plain-text projection and stays the column every existing
 * reader uses (an announcement's fallback title, the home feed, the 20,000
 * character cap, an older client's render). Deriving it here rather than
 * accepting one from the caller is what makes the two impossible to
 * disagree -- there is no payload in which the rich version says one thing and
 * the text version another.
 */
export function itemBodyColumns(input: unknown): { ok: true; body: string; doc: ItemDoc } | { ok: false; error: string } {
	const res = normalizeItemDoc(input);
	if (!res.ok) return res;
	return { ok: true, body: docText(res.doc), doc: res.doc };
}
