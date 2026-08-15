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
 * along": a node type this file does not name cannot appear in the result,
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
 */

import {
	ITEM_BODY_MAX_CHARS,
	docLength,
	docText,
	docToTiptap,
	safeHref,
	type ItemBlock,
	type ItemDoc,
	type ItemInline,
	type TiptapNode
} from '$lib/classroom/classroom-doc';

export type NormalizeItemDocResult = { ok: true; doc: ItemDoc } | { ok: false; error: string };

/**
 * Hostile input can nest thousands deep; a recursive walk over it is a stack
 * overflow, which in a serverless function is a 500 rather than a refusal.
 * Real instructions are two or three levels (list -> item -> emphasis).
 */
const MAX_DEPTH = 16;

/** Marks we understand. Anything else on a run is simply not carried over. */
function markState(node: TiptapNode): { bold: boolean; italic: boolean; href: string | null } {
	let bold = false;
	let italic = false;
	let href: string | null = null;
	for (const mark of node.marks ?? []) {
		if (!mark || typeof mark.type !== 'string') continue;
		switch (mark.type) {
			case 'bold':
			case 'strong':
				bold = true;
				break;
			case 'italic':
			case 'em':
				italic = true;
				break;
			case 'link': {
				const raw = mark.attrs?.href;
				// A link whose target is not http/https/mailto keeps its TEXT and
				// loses its link -- dropping the run would silently delete what
				// the teacher wrote.
				href = safeHref(typeof raw === 'string' ? raw : null);
				break;
			}
			default:
				break;
		}
	}
	return { bold, italic, href };
}

/** Adjacent runs that would render identically are one run. */
function pushRun(runs: ItemInline[], run: ItemInline): void {
	const last = runs[runs.length - 1];
	if (
		last &&
		!!last.bold === !!run.bold &&
		!!last.italic === !!run.italic &&
		last.href === run.href
	) {
		last.text += run.text;
		return;
	}
	runs.push(run);
}

/**
 * Every text node reachable from `node`, flattened into runs.
 *
 * Flattening rather than rejecting is the point: a paste that arrives wrapped
 * in something out of scope (a table cell, a span, a div with inline styles)
 * still gives the teacher their words back instead of losing them.
 */
function collectRuns(node: TiptapNode, runs: ItemInline[], depth: number): void {
	if (depth > MAX_DEPTH || !node || typeof node !== 'object') return;

	if (node.type === 'text' && typeof node.text === 'string' && node.text !== '') {
		const { bold, italic, href } = markState(node);
		const run: ItemInline = { text: node.text };
		if (bold) run.bold = true;
		if (italic) run.italic = true;
		if (href) run.href = href;
		pushRun(runs, run);
		return;
	}

	// The shape has no hard break; a space keeps the words apart.
	if (node.type === 'hardBreak') {
		pushRun(runs, { text: ' ' });
		return;
	}

	for (const child of Array.isArray(node.content) ? node.content : []) {
		collectRuns(child, runs, depth + 1);
	}
}

function trimRuns(runs: ItemInline[]): ItemInline[] {
	const kept = runs.filter((r) => r.text !== '');
	if (kept.length) {
		kept[0] = { ...kept[0], text: kept[0].text.replace(/^\s+/, '') };
		const last = kept.length - 1;
		kept[last] = { ...kept[last], text: kept[last].text.replace(/\s+$/, '') };
	}
	return kept.filter((r) => r.text !== '');
}

/** A list's items: one run list each, with nested lists flattened in place. */
function listItems(node: TiptapNode, depth: number): ItemInline[][] {
	const items: ItemInline[][] = [];
	for (const child of Array.isArray(node.content) ? node.content : []) {
		if (!child || typeof child !== 'object') continue;
		if (child.type === 'bulletList' || child.type === 'orderedList') {
			// A nested list becomes more items of the SAME list. Indentation is
			// out of scope, and losing a level reads better than losing the text.
			if (depth < MAX_DEPTH) items.push(...listItems(child, depth + 1));
			continue;
		}
		const runs: ItemInline[] = [];
		collectRuns(child, runs, depth + 1);
		const trimmed = trimRuns(runs);
		if (trimmed.length) items.push(trimmed);
	}
	return items;
}

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

function blocksFrom(nodes: TiptapNode[], depth: number): ItemBlock[] {
	const blocks: ItemBlock[] = [];
	for (const node of nodes) {
		if (!node || typeof node !== 'object' || typeof node.type !== 'string') continue;

		if (node.type === 'bulletList' || node.type === 'orderedList') {
			const items = listItems(node, depth + 1);
			if (items.length) blocks.push({ type: node.type === 'bulletList' ? 'ul' : 'ol', items });
			continue;
		}

		if (node.type === 'heading') {
			const runs: ItemInline[] = [];
			collectRuns(node, runs, depth + 1);
			const trimmed = trimRuns(runs);
			if (trimmed.length) blocks.push({ type: headingType(node), runs: trimmed });
			continue;
		}

		// Everything else -- paragraph, and any out-of-scope block a paste
		// dragged in -- contributes its text as a paragraph.
		const runs: ItemInline[] = [];
		collectRuns(node, runs, depth + 1);
		const trimmed = trimRuns(runs);
		if (trimmed.length) blocks.push({ type: 'p', runs: trimmed });
	}
	return blocks;
}

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

	const doc = blocksFrom(nodes, 0);
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
