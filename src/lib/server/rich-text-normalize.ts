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
import type { RichItem, RichList } from '$lib/rich-text-doc';

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

/**
 * A list item, and a list, in the shape both closed contracts store (0122).
 *
 * IMPORTED RATHER THAN RESTATED. `RichItem`/`RichList` are the same grammar
 * $lib/rich-text-doc walks on the way back out, and a third declaration of
 * "what may sit in a list item" is a third thing to widen next time.
 */
export type { RichItem, RichList };

/** A block, loose enough for both closed shapes. Cast to one at the door. */
export type RichBlock =
	| { type: string; runs: RichInline[] }
	| { type: string; items: RichItem[] }
	| { type: string; src: string; alt: string };

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
	/**
	 * Claim a node as a block that carries no runs at all -- the classroom's
	 * image (0176) -- or return null to let it fall through to the text walk.
	 *
	 * OPT-IN, EXACTLY AS `blockType` IS, AND FOR THE SAME REASON. This walk is
	 * shared with the notebook's written notes, whose stored contract has no
	 * image in it and whose SQL gate refuses one. A branch written here
	 * unconditionally would widen what a NOTE can be asked to hold because the
	 * classroom's body grew, which is precisely the coupling the two contracts
	 * are kept apart to avoid. The notebook passes nothing and cannot emit one.
	 *
	 * IT IS CONSULTED BEFORE THE TEXT WALK, and that ordering is the whole of
	 * why an image survives at all: an atom node has no text, so `trimRuns`
	 * comes back empty and the block is DROPPED by the guard below. A claim
	 * made afterwards would never be reached.
	 *
	 * A claimant that wants to REFUSE rather than emit returns null and records
	 * the problem itself; this walk has no refusal channel and must not grow
	 * one, because its other caller's signature is not this bundle's to change.
	 */
	imageBlock?: (node: TiptapNode) => RichBlock | null;
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

/** One node's whole text, trimmed, as a list item's own runs. */
function ownRuns(node: TiptapNode, depth: number, opts: RichWalkOptions): RichInline[] {
	const runs: RichInline[] = [];
	collectRuns(node, runs, depth, opts);
	return trimRuns(runs);
}

/**
 * A list node -> the stored list, or null when nothing survived the walk.
 *
 * A list that normalizes to no items at all is not stored as an empty list:
 * an empty `ul` renders as nothing, projects to nothing, and is only ever the
 * residue of content that was dropped somewhere below.
 */
function listFrom(node: TiptapNode, depth: number, opts: RichWalkOptions): RichList | null {
	const items = listItems(node, depth, opts);
	if (!items.length) return null;
	return { type: node.type === 'bulletList' ? 'ul' : 'ol', items };
}

/**
 * A list's items: each item's own runs, with any sublist NESTED INSIDE the
 * item it hangs off.
 *
 * WHERE A NESTED LIST ACTUALLY LIVES. Under the ProseMirror schema both
 * editors are configured with, a list's content is `listItem+` and a list
 * item's is `paragraph block*` -- so a sublist is a child of the LIST ITEM
 * above it, never a sibling of it. An earlier version tested the list's direct
 * children for `bulletList`/`orderedList`, which no editor output can satisfy,
 * so every real nested list fell through to a single `collectRuns` over the
 * whole list item. That walk reaches the sublist's text too and `pushRun`
 * joins same-mark runs, so two items each holding a three-item sublist came
 * out as two items reading
 * "Materials250 mL beakerDigital scaleGraduated cylinder". Silently, on save,
 * with nothing to see until somebody read it back.
 *
 * So the walk descends INTO the list item and emits, in document order: the
 * item's own blocks, each as its own item, and each nested list attached to
 * the item it followed. b57b61d fixed the data loss by SPLICING a sublist's
 * items into the parent as siblings, which cost the indentation the author
 * wrote; 0122 widened both storage gates to hold a sublist, and this is the
 * walk that fills that shape.
 *
 * THE ITEM A SUBLIST BELONGS TO IS THE LAST ONE EMITTED BEFORE IT, which is
 * document order and nothing cleverer: the nesting hangs off the text
 * immediately above it. A `listItem` whose sublist has no text before it at
 * all -- an empty bullet holding an indented list, which a paste can carry --
 * becomes an item of its own holding only that list, so the level survives
 * rather than being hoisted into its parent.
 *
 * A LIST ITEM STILL CANNOT HOLD TWO PARAGRAPHS. `paragraph block*` says an
 * editor can produce one, and each paragraph becomes ITS OWN ITEM here rather
 * than being joined -- joining them is the same defect one level down. 0122
 * rejected the block-item vocabulary that would have expressed it (an item
 * holding blocks, with the item's own text wrapped in a `p`) DELIBERATELY:
 * `notebook_entry_notes` is append-only with no UPDATE grant, so every item
 * stored to date would have become a second, legacy vocabulary that no
 * migration respecting that table could ever retire, and both the gate and
 * the renderer would carry "run list or block list?" forever. This limit is
 * the price of there being one spelling. Do not "fix" it back.
 *
 * The sibling-list branch below is kept as pure defensiveness: it is not
 * something either editor can produce, but this function's input is arbitrary
 * untrusted JSON and a hand-written document can carry one.
 */
export function listItems(node: TiptapNode, depth: number, opts: RichWalkOptions): RichItem[] {
	const items: RichItem[] = [];
	if (depth > opts.maxDepth) return items;

	for (const child of Array.isArray(node.content) ? node.content : []) {
		if (!child || typeof child !== 'object') continue;

		// A list directly inside a list: not editor output, but possible in
		// hand-written JSON. It is a level of its own, so it becomes an item
		// holding that level rather than being merged into this one.
		if (isList(child)) {
			const sub = listFrom(child, depth + 1, opts);
			if (sub) items.push([sub]);
			continue;
		}

		if (child.type === 'listItem') {
			/** The item a sublist attaches to: the last one this listItem emitted. */
			let current: RichItem | null = null;
			for (const grandchild of Array.isArray(child.content) ? child.content : []) {
				if (!grandchild || typeof grandchild !== 'object') continue;

				if (isList(grandchild)) {
					// `depth + 2`: one ProseMirror level for the listItem, one for
					// the list itself, which is why a normalizer capped at 12 tree
					// levels emits about six list levels and the gate that accepts
					// twelve is comfortably wider than anything this can produce.
					const sub = listFrom(grandchild, depth + 2, opts);
					if (!sub) continue;
					if (current) current.push(sub);
					else items.push([sub]);
					continue;
				}

				const runs = ownRuns(grandchild, depth + 2, opts);
				if (runs.length) {
					current = [...runs];
					items.push(current);
				}
			}
			continue;
		}

		// Anything else sitting directly in a list contributes its text as one
		// item, the same way an out-of-scope block does anywhere else.
		const runs = ownRuns(child, depth + 1, opts);
		if (runs.length) items.push(runs);
	}

	return items;
}

/**
 * Editor nodes -> blocks of one of the two closed shapes.
 *
 * The cast is the one place the loose `RichBlock` meets a closed union, and it
 * is safe by construction: the only types this emits are `ul`, `ol`, `p`,
 * whatever `blockType` returns and whatever `imageBlock` returns, and each
 * caller supplies only members of its own union (the notebook supplies
 * neither hook a block type it does not have).
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
			const list = listFrom(node, depth + 1, opts);
			if (list) blocks.push(list);
			continue;
		}

		// BEFORE the text walk. See `imageBlock` above: an atom has no text, so
		// asking afterwards is asking about a node the empty-runs guard has
		// already thrown away.
		const claimed = opts.imageBlock?.(node);
		if (claimed) {
			blocks.push(claimed);
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
