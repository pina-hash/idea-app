/**
 * The rich-text WALK both server-side normalizers are built on.
 *
 * WHY THIS FILE EXISTS. `notebook-notes.ts` and `classroom-doc.ts` are two
 * separate contracts on purpose -- two closed shapes, two SQL gates, two
 * renderers -- and that separation is right and is not what this changes. What
 * they were ALSO carrying was a line-for-line copy of the same five functions:
 * `markState`, `pushRun`, `collectRuns`, `trimRuns` and `listItems`. That is
 * the duplication this repo's own rule warns about, and it cost exactly what
 * the rule says it costs: a silent data-loss defect in `listItems` -- a nested
 * list's text concatenated into its parent item with no separator -- existed
 * IDENTICALLY in both files, and fixing one would have left the other.
 *
 * The genuine differences between the two are expressed as OPTIONS below: the
 * depth ceiling, and which non-list nodes get a block type of their own (the
 * classroom's clamped headings). Everything each normalizer does that is about
 * its own public contract -- the node cap, whether empty input is a refusal or
 * an empty document, the classroom's already-stored round trip, the character
 * cap -- stays in that normalizer, because that is where those decisions
 * belong.
 *
 * IT IS STILL A WHITELIST TRANSLATOR. The result is BUILT from the node types
 * named here; a type this file does not name cannot appear in the output, it
 * can only contribute its text. Nothing about that changed.
 *
 * NOT the security boundary on its own, in either feature: see the header of
 * each normalizer for the other two gates.
 */

import { safeHref, type TiptapNode } from '$lib/rich-text';

/**
 * One run of inline text. Structurally the SAME thing `NoteInline` and
 * `ItemInline` each declare for their own contract; this is the walk's own
 * name for it, so neither closed shape has to import the other's.
 */
export interface RichInline {
	text: string;
	bold?: true;
	italic?: true;
	/** Already scheme-checked by `safeHref`, here and again at render. */
	href?: string;
}

/** A block, loose enough for both closed shapes. Cast to one at the door. */
export type RichBlock =
	| { type: string; runs: RichInline[] }
	| { type: string; items: RichInline[][] };

export interface RichWalkOptions {
	/**
	 * Hostile input can nest thousands deep; a recursive walk over it is a
	 * stack overflow, which in a serverless function is a 500 rather than a
	 * refusal. Real content is two or three levels.
	 */
	maxDepth: number;
	/**
	 * A block type for a node that is neither a list nor a paragraph, or null
	 * to let it contribute its text as a paragraph. This is where the
	 * classroom's heading clamp lives; the notebook passes nothing, because a
	 * note has no headings.
	 */
	blockType?: (node: TiptapNode) => string | null;
}

/** Marks we understand. Anything else on a run is simply not carried over. */
export function markState(node: TiptapNode): {
	bold: boolean;
	italic: boolean;
	href: string | null;
} {
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
				// the author wrote.
				href = safeHref(typeof raw === 'string' ? raw : null);
				break;
			}
			default:
				break;
		}
	}
	return { bold, italic, href };
}

/**
 * Adjacent runs that would render identically are one run.
 *
 * WITHIN ONE BLOCK ONLY. Every caller starts a fresh `runs` array per
 * paragraph, per heading and per list item, so this can never join text across
 * two things the author wrote separately -- which is precisely what made a
 * nested list read as one unbroken word.
 */
export function pushRun(runs: RichInline[], run: RichInline): void {
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
 * still gives the author their words back as plain text instead of losing
 * them.
 */
export function collectRuns(
	node: TiptapNode,
	runs: RichInline[],
	depth: number,
	opts: RichWalkOptions
): void {
	if (depth > opts.maxDepth || !node || typeof node !== 'object') return;

	if (node.type === 'text' && typeof node.text === 'string' && node.text !== '') {
		const { bold, italic, href } = markState(node);
		const run: RichInline = { text: node.text };
		if (bold) run.bold = true;
		if (italic) run.italic = true;
		if (href) run.href = href;
		pushRun(runs, run);
		return;
	}

	// Neither shape has a hard break (both editors have them switched off), but
	// a paste can carry one; a space keeps the words apart.
	if (node.type === 'hardBreak') {
		pushRun(runs, { text: ' ' });
		return;
	}

	for (const child of Array.isArray(node.content) ? node.content : []) {
		collectRuns(child, runs, depth + 1, opts);
	}
}

export function trimRuns(runs: RichInline[]): RichInline[] {
	const kept = runs.filter((r) => r.text !== '');
	if (kept.length) {
		kept[0] = { ...kept[0], text: kept[0].text.replace(/^\s+/, '') };
		const last = kept.length - 1;
		kept[last] = { ...kept[last], text: kept[last].text.replace(/\s+$/, '') };
	}
	return kept.filter((r) => r.text !== '');
}

function isList(node: TiptapNode): boolean {
	return node.type === 'bulletList' || node.type === 'orderedList';
}

/** One node's whole text as an item, appended only if there is any. */
function pushItem(
	items: RichInline[][],
	node: TiptapNode,
	depth: number,
	opts: RichWalkOptions
): void {
	const runs: RichInline[] = [];
	collectRuns(node, runs, depth, opts);
	const trimmed = trimRuns(runs);
	if (trimmed.length) items.push(trimmed);
}

/**
 * A list's items: one run list each, with nested lists flattened in place.
 *
 * WHERE A NESTED LIST ACTUALLY LIVES. Under the ProseMirror schema both
 * editors are configured with, a list's content is `listItem+` and a list
 * item's is `paragraph block*` -- so a sublist is a child of the LIST ITEM
 * above it, never a sibling of it. The version this replaces tested the list's
 * direct children for `bulletList`/`orderedList`, which no editor output can
 * satisfy, so every real nested list fell through to a single `collectRuns`
 * over the whole list item. That walk reaches the sublist's text too and
 * `pushRun` joins same-mark runs, so two items each holding a three-item
 * sublist came out as two items reading
 * "Materials250 mL beakerDigital scaleGraduated cylinder". Silently, on save,
 * with nothing to see until somebody read it back.
 *
 * So the walk descends INTO the list item and emits, in document order: the
 * item's own blocks, each as its own item, and each nested list's items
 * spliced in after them. Text is never joined across a list-item boundary, and
 * a bullet can no longer disappear into the one above it.
 *
 * INDENTATION IS STILL LOST IN THIS PASS -- a sublist's items become more
 * items of the same flat list, because the stored shape (`ul`/`ol` with one
 * run list per item) has no way to express a level. That is a deliberate
 * INTERIM: real nesting needs a wider stored shape, a wider SQL gate on both
 * sides and a renderer that can nest, which is its own bundle. What this fixes
 * is the DATA LOSS -- every bullet the author wrote survives as its own
 * readable item.
 *
 * The sibling-list branch below is kept as pure defensiveness: it is not
 * something either editor can produce, but this function's input is arbitrary
 * untrusted JSON and a hand-written document can carry one.
 */
export function listItems(
	node: TiptapNode,
	depth: number,
	opts: RichWalkOptions
): RichInline[][] {
	const items: RichInline[][] = [];
	if (depth > opts.maxDepth) return items;

	for (const child of Array.isArray(node.content) ? node.content : []) {
		if (!child || typeof child !== 'object') continue;

		// A list directly inside a list: not editor output, but possible in
		// hand-written JSON. Its items join this list's.
		if (isList(child)) {
			items.push(...listItems(child, depth + 1, opts));
			continue;
		}

		if (child.type === 'listItem') {
			for (const grandchild of Array.isArray(child.content) ? child.content : []) {
				if (!grandchild || typeof grandchild !== 'object') continue;
				if (isList(grandchild)) {
					items.push(...listItems(grandchild, depth + 2, opts));
					continue;
				}
				// Each of the item's OWN blocks is its own item. A list item can
				// legitimately hold more than one paragraph (`paragraph block*`),
				// and joining those would be the same defect one level down.
				pushItem(items, grandchild, depth + 2, opts);
			}
			continue;
		}

		// Anything else sitting directly in a list contributes its text as one
		// item, the same way an out-of-scope block does anywhere else.
		pushItem(items, child, depth + 1, opts);
	}

	return items;
}

/**
 * Editor nodes -> blocks of one of the two closed shapes.
 *
 * The cast is the one place the loose `RichBlock` meets a closed union, and it
 * is safe by construction: the only types this emits are `ul`, `ol`, `p` and
 * whatever `blockType` returns, and each caller's `blockType` returns only
 * members of its own union.
 */
export function richBlocksFrom<Block extends RichBlock>(
	nodes: TiptapNode[],
	depth: number,
	opts: RichWalkOptions
): Block[] {
	const blocks: RichBlock[] = [];
	for (const node of nodes) {
		if (!node || typeof node !== 'object' || typeof node.type !== 'string') continue;

		if (isList(node)) {
			const items = listItems(node, depth + 1, opts);
			if (items.length) blocks.push({ type: node.type === 'bulletList' ? 'ul' : 'ol', items });
			continue;
		}

		const runs: RichInline[] = [];
		collectRuns(node, runs, depth + 1, opts);
		const trimmed = trimRuns(runs);
		if (!trimmed.length) continue;

		// Everything else -- paragraph, and any out-of-scope block a paste
		// dragged in -- contributes its text as a paragraph, unless the caller
		// claims the node as a block type of its own.
		blocks.push({ type: opts.blockType?.(node) ?? 'p', runs: trimmed });
	}
	return blocks as Block[];
}
