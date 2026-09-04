/**
 * The STORED rich-text document walk both closed shapes share.
 *
 * Plain data + pure functions only (the curriculum.ts / pathways.ts
 * convention): no Svelte, no Supabase, no `$lib/server`, nothing that cannot
 * run in a node test with no DOM.
 *
 * WHY THIS FILE EXISTS, and it is the same argument `$lib/server/rich-text-
 * normalize.ts` makes one direction earlier. That file is the EDITOR -> STORED
 * walk, shared because both features had a line-for-line copy of it and the
 * copies grew one identical silent defect. This is the STORED -> READ walk, and
 * it had exactly the same problem in miniature: `docText` was written out twice,
 * once in $lib/notebook-notes and once in $lib/classroom/classroom-doc, and 0122
 * made that walk recursive. Two hand-written recursive walks over the same
 * grammar is two chances to descend differently.
 *
 * THE TWO CONTRACTS STAY SEPARATE. NoteDoc and ItemDoc are still two closed
 * shapes with two SQL gates and two renderers; what is shared here is the walk
 * over the part of the grammar they have in common, parameterized by the one
 * thing that genuinely differs -- the depth cap. Nothing here names a block type
 * either contract owns alone.
 *
 * IT MIRRORS SQL, IT DOES NOT INVENT. `richDocText` is the TypeScript twin of
 * `_classroom_doc_text` / `_classroom_list_text` / `_classroom_item_text`
 * (0108, widened by 0122), which is what actually derives `classroom_items.body`
 * inside the write RPCs -- a caller's `p_body` is ignored when a document is
 * supplied. So this is not "a plain-text projection", it is a claim about what
 * the DATABASE will store, and every difference between the two is a client
 * disagreeing with the column the stream and the export read. Where the SQL is
 * odd, this is odd in the same way, and the oddities are commented where they
 * are reproduced. tests/rich-text-nesting.test.ts puts both to the same corpus.
 */

/** One run of inline text, loose enough for either contract's own name for it. */
export interface RichRun {
	text: string;
	bold?: true;
	italic?: true;
	href?: string;
}

/**
 * A bulleted or numbered list: the SAME shape at the top of a document and
 * nested inside a list item, which is what 0122 chose and why a nested list
 * needs no vocabulary of its own.
 */
export interface RichList {
	type: 'ul' | 'ol';
	items: RichItem[];
}

/**
 * One list item: its own runs, and any sublists under it (0122).
 *
 *     item := ( run | list )*
 *
 * `type` is a TOTAL discriminator per element -- it is not in the run whitelist
 * on either side and has not been since 0078 -- so telling a run from a sublist
 * needs no flag and no legacy branch, and every document stored before 0122 is
 * simply the case with no list in it.
 */
export type RichItem = (RichRun | RichList)[];

/** A block, loose enough for both closed shapes. */
export interface RichDocBlock {
	type: string;
	runs?: RichRun[];
	items?: RichItem[];
	/**
	 * An image block's DESCRIPTION -- `{ type: 'img', src, alt }`, the shape
	 * 0176 widened the classroom item-body gate to accept. Typed `unknown`
	 * rather than `string` because this walk is a mirror of SQL over a `jsonb`
	 * column, and what `->>` does with a value that is not a string is a
	 * question the mirror has to answer the same way rather than assume away.
	 *
	 * IT IS ON THE SHARED BLOCK AND THAT COSTS THE NOTEBOOK NOTHING. A note's
	 * guidance document cannot hold an image -- 0176 left that gate exactly
	 * where it was, deliberately, because `CheckInGuidance` cannot render one --
	 * so this arm is unreachable from the note contract and the notebook's
	 * projection is byte-identical. What the shared walk buys is that there is
	 * still exactly ONE reading of a stored document, which is the whole reason
	 * this module exists.
	 */
	alt?: unknown;
}

/**
 * SQL's `->>` ON ONE KEY, mirrored rather than approximated.
 *
 * `b.value->>'alt'` is NULL for an absent key and for a JSON null, the raw
 * characters for a JSON string, and the value's JSON TEXT for anything else --
 * so a number comes out `'5'` and an object comes out `'{"a": 1}'`. The gate
 * makes every stored `alt` a non-blank string, so only the first case is
 * reachable in practice; it is written out in full anyway, because the point of
 * a mirror is that the corpus test can put both sides the same odd value and
 * get the same answer rather than a plausible one.
 */
function jsonText(value: unknown): string | null {
	if (value === undefined || value === null) return null;
	if (typeof value === 'string') return value;
	return JSON.stringify(value) ?? null;
}

/** Is this element a nested list rather than a run? The gates' own question. */
function isList(node: RichRun | RichList): node is RichList {
	return 'type' in node && (node.type === 'ul' || node.type === 'ol');
}

/**
 * One item split into its own runs and its sublists.
 *
 * OWN TEXT FIRST, and this is the one place that decision is made. An item
 * holding a run AFTER a sublist has no honest single line to put that run on,
 * and the normalizer emits no such item; rather than invent an ordering,
 * `_classroom_item_text` resolves it as all of the item's own runs, then every
 * sublist. The RENDERERS read this same split, so what a reader sees and what
 * the plain-text column says can never disagree about the order -- which they
 * would the first time one of them walked the item in document order and the
 * other did not.
 */
export function itemParts(item: RichItem): { runs: RichRun[]; lists: RichList[] } {
	const runs: RichRun[] = [];
	const lists: RichList[] = [];
	for (const node of Array.isArray(item) ? item : []) {
		if (!node || typeof node !== 'object') continue;
		if (isList(node)) lists.push(node);
		else runs.push(node);
	}
	return { runs, lists };
}

/**
 * One list's lines: one per item, in order.
 *
 * NULL WHERE SQL'S `string_agg` WOULD BE NULL -- a list with no items at all --
 * because that null is load-bearing at both call sites. A list block with no
 * items contributes NO line to the document rather than a blank one, and a
 * nested list with nothing in it adds no line to the item above it. Reproduced
 * rather than tidied: it is what 0108 did and what is in the column today.
 */
function listText(items: RichItem[] | undefined, depth: number, maxDepth: number): string | null {
	if (!Array.isArray(items) || items.length === 0) return null;
	return items.map((item) => itemText(item, depth, maxDepth)).join('\n');
}

/** One list item's line: its own runs, then a line for each item of each sublist. */
function itemText(item: RichItem, depth: number, maxDepth: number): string {
	// The cap is checked BEFORE any recursion, so a document nested past it is
	// answered rather than descended into. It sits at the ITEM, exactly where
	// `_classroom_item_text` puts it, because that is what decides whether a
	// too-deep list contributes empty lines or none.
	if (depth > maxDepth || !Array.isArray(item)) return '';
	const { runs, lists } = itemParts(item);
	let line = runs.map((r) => r.text).join('');
	for (const list of lists) {
		const nested = listText(list.items, depth + 1, maxDepth);
		// `coalesce(v_line, '') <> ''`: a sublist that projects to nothing adds
		// no line, so an empty one cannot open a blank line under its parent.
		if (nested) line += `\n${nested}`;
	}
	return line;
}

/**
 * The document as PLAIN TEXT: one line per block and per list item, at every
 * level.
 *
 * `maxDepth` is the caller's own list-nesting cap -- 12 for a note, 16 for an
 * item body, the numbers 0122's two gates carry.
 *
 * THE TRIM IS SQL'S `btrim`, WHICH IS SPACES ONLY, not JavaScript's `trim`.
 * The difference is reachable now that an item can hold a sublist with no text
 * of its own: such an item's line begins with a newline, and `trim()` would
 * eat it while the database keeps it. A client that quietly disagrees with
 * `classroom_items.body` about its first character is the whole defect this
 * mirror exists to avoid, so the mirror follows the column.
 */
export function richDocText(doc: readonly RichDocBlock[], maxDepth: number): string {
	if (!Array.isArray(doc)) return '';
	const lines: string[] = [];
	for (const block of doc) {
		if (!block || typeof block !== 'object') continue;
		if (block.type === 'ul' || block.type === 'ol') {
			const line = listText(block.items, 1, maxDepth);
			// A NULL line is SKIPPED by `string_agg`, never joined as blank.
			if (line !== null) lines.push(line);
		} else if (block.type === 'img') {
			// AN IMAGE'S LINE IS ITS DESCRIPTION, and before 0178 it was the
			// empty string -- an image block has no `runs`, so it fell into the
			// arm below and contributed a blank line. That was not a cosmetic
			// gap: `classroom_items.body` is derived from this projection, and
			// the surfaces reading that column decide real things with it. An
			// image-only body left it blank, so `ClassView` and `ItemDetail`
			// each render the body only `{#if item.body.trim()}` and drew
			// nothing at all; `itemTitle` takes an announcement's headline from
			// the first non-blank line and answered `Untitled` in the feed, the
			// stream, the page title, the breadcrumb, the grading console and
			// the graded-export filename; and `_classroom_check_item_fields`
			// REFUSES a `post` whose derived body is blank, so an announcement
			// whose content was a picture could not be saved at all.
			//
			// `coalesce(..., '')` on the SQL side, so an absent or null `alt`
			// is a blank line exactly as a runless block already was, never a
			// skipped one -- the skip belongs to `string_agg` over a list with
			// no items and to nothing else.
			lines.push(jsonText(block.alt) ?? '');
		} else {
			const runs: RichRun[] = Array.isArray(block.runs) ? block.runs : [];
			lines.push(runs.map((r) => r.text).join(''));
		}
	}
	return lines.join('\n').replace(/^ +| +$/g, '');
}
