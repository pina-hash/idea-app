/**
 * THE BRIDGE BETWEEN A SPEC'S PROSE AND THE RICH-TEXT EDITOR THIS CODEBASE
 * ALREADY HAS, and the honest statement of where the two do not meet.
 *
 * A spec's prose fields are MARKDOWN STRINGS, parsed by `parseMarkdown`
 * (reference-spec.ts) and walked into elements by MarkdownText. The editor is
 * `RichTextEditor`, which is seeded with an `ItemDoc` and hands back Tiptap
 * JSON. So this module is markdown <-> `ItemDoc` in one direction and Tiptap
 * JSON -> markdown in the other, and it introduces NO third document shape:
 * `docToTiptap` (classroom-doc.ts) is the one seeder, exactly as it is for an
 * item body.
 *
 * THE TWO VOCABULARIES OVERLAP AND NEITHER CONTAINS THE OTHER:
 *
 *   markdown has, and `ItemDoc` does not:  tables, blockquotes, code (fenced,
 *                                          indented and inline), figures.
 *   `ItemDoc` has, and markdown does not:  nothing -- headings clamp to 3 and 4
 *                                          on both sides, and markdown nests
 *                                          lists one level deep against the
 *                                          document's sixteen.
 *
 * SO THE EDITOR IS OFFERED ONLY WHERE IT CAN HOLD THE WHOLE FIELD, and the test
 * for that is a real round trip rather than a feature sniff. A field it cannot
 * hold falls back to editing the markdown SOURCE in a plain textarea. That is
 * not a degraded mode so much as the honest one: a field the editor cannot hold
 * would otherwise be silently flattened the first time somebody opened it to
 * fix a typo.
 *
 * MEASURED ON THE REAL CORPUS rather than guessed. Over the 209 prose fields in
 * `materials/` (10 assignments, 8 reference documents), 197 open in the editor
 * and 12 fall back: 8 carrying a code block, 7 a table, 3 an image, 1 inline
 * code. Those counts overlap -- one field can carry two of them.
 */

import {
	ITEM_IMAGE_NODE,
	docToTiptap,
	type ItemBlock,
	type ItemDoc,
	type ItemInline,
	type ItemItem,
	type ItemList
} from '$lib/classroom/classroom-doc';
import {
	parseMarkdown,
	type InlineRun,
	type MarkdownList,
	type MarkdownNode
} from '$lib/classroom/reference-spec';
import type { TiptapNode } from '$lib/rich-text';

// ---------------------------------------------------------------------------
// markdown -> the document the editor is seeded with
// ---------------------------------------------------------------------------

function runsToInline(runs: InlineRun[]): ItemInline[] | null {
	const out: ItemInline[] = [];
	for (const run of runs) {
		// `ITEM_SCHEMA_OPTIONS` sets `code: false`, so a backticked span has no
		// mark to carry it: it would arrive as plain text, losing the backticks
		// and changing what the page says.
		if (run.code) return null;
		if (!run.text) continue;
		const inline: ItemInline = { text: run.text };
		if (run.bold) inline.bold = true;
		if (run.italic) inline.italic = true;
		if (run.href) inline.href = run.href;
		out.push(inline);
	}
	return out;
}

function listToDoc(list: MarkdownList): ItemList | null {
	const items: ItemItem[] = [];
	for (const item of list.items) {
		const runs = runsToInline(item.runs);
		if (!runs) return null;
		const parts: ItemItem = [...runs];
		if (item.child) {
			const child = listToDoc(item.child);
			if (!child) return null;
			parts.push(child);
		}
		items.push(parts);
	}
	return { type: list.ordered ? 'ol' : 'ul', items };
}

/**
 * The editor document for this markdown, or NULL when the markdown contains
 * something `ItemDoc` has no block for. Null is the ordinary answer for a field
 * carrying a table or an image, not an error.
 */
export function markdownToItemDoc(markdown: string): ItemDoc | null {
	const doc: ItemDoc = [];
	for (const node of parseMarkdown(markdown ?? '')) {
		switch (node.type) {
			case 'heading': {
				const runs = runsToInline(node.runs);
				if (!runs) return null;
				doc.push({ type: node.level === 4 ? 'h4' : 'h3', runs } as ItemBlock);
				break;
			}
			case 'paragraph': {
				const runs = runsToInline(node.runs);
				if (!runs) return null;
				doc.push({ type: 'p', runs });
				break;
			}
			case 'list': {
				const list = listToDoc(node);
				if (!list) return null;
				doc.push(list);
				break;
			}
			case 'figure': {
				// A FIGURE IS AN `ItemBlock` NOW (0176), so this field no longer
				// falls back to the source textarea for carrying a picture. The
				// caption a figure line writes is BOTH the `alt` and the
				// `figcaption` in every renderer, which is exactly what the image
				// block stores, so the two vocabularies map one to one with
				// nothing invented on the way across.
				//
				// A BLANK CAPTION CANNOT REACH HERE: `FIGURE_RE` refuses one, so a
				// `![](x.png)` line parses as a paragraph and never becomes a
				// figure node at all. The guard is kept anyway, because this
				// function's input is a stored markdown string rather than
				// something a parser just built, and an image with no description
				// must not be constructible by any path.
				const alt = (node.alt ?? '').trim();
				const src = (node.src ?? '').trim();
				if (!alt || !src) return null;
				doc.push({ type: 'img', src, alt });
				break;
			}
			// quote, code and table still have no `ItemBlock`.
			default:
				return null;
		}
	}
	return doc;
}

// ---------------------------------------------------------------------------
// the editor's own output -> markdown
// ---------------------------------------------------------------------------

function markOf(node: TiptapNode, type: string): { attrs?: Record<string, unknown> } | undefined {
	return node.marks?.find((m) => m.type === type);
}

function inlineToMarkdown(nodes: TiptapNode[] | undefined): string {
	let out = '';
	for (const node of nodes ?? []) {
		if (node.type !== 'text' || !node.text) continue;
		let text = node.text;
		if (markOf(node, 'bold')) text = `**${text}**`;
		if (markOf(node, 'italic')) text = `*${text}*`;
		const link = markOf(node, 'link');
		const href = typeof link?.attrs?.href === 'string' ? link.attrs.href : '';
		if (href) text = `[${text}](${href})`;
		out += text;
	}
	// A newline inside a run would split the block. The editor's schema sets
	// `hardBreak: false`, so this is a paste artefact rather than something a
	// person typed, and a space is what `parseMarkdown` produces for two lines
	// of one paragraph anyway (its `flushParagraph` joins with ' ').
	return out.replace(/[\r\n]+/g, ' ');
}

function listToMarkdown(node: TiptapNode, depth: number): string[] {
	const ordered = node.type === 'orderedList';
	const lines: string[] = [];
	let n = 0;
	for (const item of node.content ?? []) {
		if (item.type !== 'listItem') continue;
		n += 1;
		const marker = ordered ? `${n}.` : '-';
		const [head, ...rest] = item.content ?? [];
		lines.push(`${'  '.repeat(depth)}${marker} ${head ? inlineToMarkdown(head.content) : ''}`);
		for (const child of rest) {
			if (child.type === 'bulletList' || child.type === 'orderedList') {
				lines.push(...listToMarkdown(child, depth + 1));
			}
		}
	}
	return lines;
}

/** The markdown for an editor document. Structure only -- whether the markdown
 *  says the same thing is `markdownFromEditor`'s question. */
export function editorToMarkdown(doc: TiptapNode | null | undefined): string {
	const blocks: string[] = [];
	for (const node of doc?.content ?? []) {
		switch (node.type) {
			case 'heading': {
				blocks.push(`${Number(node.attrs?.level) === 4 ? '####' : '###'} ${inlineToMarkdown(node.content)}`);
				break;
			}
			case 'paragraph': {
				const text = inlineToMarkdown(node.content);
				// An empty paragraph is the editor's idea of a blank line and has
				// no markdown of its own: the blank line between blocks is what
				// the join below already writes.
				if (text.trim()) blocks.push(text);
				break;
			}
			case 'bulletList':
			case 'orderedList':
				blocks.push(listToMarkdown(node, 0).join('\n'));
				break;
			default:
				// THE IMAGE NODE, WRITTEN BACK AS THE FIGURE LINE IT CAME FROM.
				// Not a `case` label because the name is `ITEM_IMAGE_NODE.name`,
				// the one declaration the editor builds its node from -- a literal
				// here would be a second spelling, and a second spelling is a
				// picture the editor holds and this serializer silently drops.
				//
				// SILENTLY IS THE WORD THAT MATTERS. Everything else this default
				// arm ignores is a node the schema cannot produce; an image is one
				// it now can, and dropping it would take a teacher's photograph
				// out of a spec field on the first save after they inserted it,
				// with `markdownFromEditor`'s round-trip check being the only
				// thing anywhere that noticed.
				if (node.type === ITEM_IMAGE_NODE.name) {
					const alt = String(node.attrs?.alt ?? '').trim();
					const src = String(node.attrs?.src ?? '').trim();
					if (alt && src) blocks.push(`![${alt}](${src})`);
				}
				break;
		}
	}
	return blocks.join('\n\n');
}

// ---------------------------------------------------------------------------
// The two round-trip questions
// ---------------------------------------------------------------------------

function sameNodes(a: MarkdownNode[], b: MarkdownNode[]): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

/** The markdown this document would be written back out as. One expression, so
 *  the eligibility test below and the save path cannot serialize differently. */
export function itemDocToMarkdown(doc: ItemDoc): string {
	return editorToMarkdown(docToTiptap(doc));
}

/**
 * May this field be edited as formatted text?
 *
 * THE TEST IS SEMANTIC, NOT BYTE IDENTITY, and the difference is measured
 * rather than assumed. `parseMarkdown` joins a hard-wrapped paragraph's lines
 * with a space and clamps `##` to `###`, so a byte comparison refuses prose
 * that renders identically -- 16 of the 209 prose fields in `materials/`, every
 * one of them a wrapped paragraph or a heading written at a level the parser
 * already clamps. What a student reads is the PARSED node list, so that is what
 * has to match.
 *
 * An UNEDITED field is still byte-identical, and for a stronger reason than
 * this function: `applySpecTextEdits` never writes a surface nobody touched, so
 * an untouched field is never re-serialized at all.
 */
export function markdownEditable(markdown: string): boolean {
	const doc = markdownToItemDoc(markdown ?? '');
	if (!doc) return false;
	return sameNodes(parseMarkdown(itemDocToMarkdown(doc)), parseMarkdown(markdown ?? ''));
}

export interface MarkdownFromEditor {
	markdown: string;
	/**
	 * Does this markdown parse back to the document it was written from.
	 *
	 * FALSE IS A REAL CASE, not a defensive branch: `parseInline` has no escape
	 * syntax, so a literal asterisk typed into the editor comes back as
	 * emphasis, and a list nested deeper than one level folds. The caller says
	 * so rather than saving prose that does not mean what was typed.
	 */
	faithful: boolean;
}

/**
 * THE WORDS, with every mark and every block boundary thrown away. Two cheap
 * projections of the same thing -- one of the editor's document, one of a
 * parsed markdown string -- and their whole job is to be compared with each
 * other. Neither is a renderer and neither decides anything about markup.
 */
function editorText(doc: TiptapNode | null | undefined): string {
	let out = '';
	const walk = (nodes: TiptapNode[] | undefined) => {
		for (const node of nodes ?? []) {
			if (node.type === 'text' && node.text) out += node.text;
			walk(node.content);
		}
	};
	walk(doc?.content);
	return out.replace(/\s+/g, ' ').trim();
}

function markdownText(markdown: string): string {
	let out = '';
	const runs = (rs: InlineRun[]) => {
		for (const r of rs) out += r.text;
	};
	const list = (l: MarkdownList) => {
		for (const item of l.items) {
			runs(item.runs);
			if (item.child) list(item.child);
		}
	};
	for (const node of parseMarkdown(markdown ?? '')) {
		if (node.type === 'list') list(node);
		else if (node.type === 'heading' || node.type === 'paragraph') runs(node.runs);
	}
	return out.replace(/\s+/g, ' ').trim();
}

export function markdownFromEditor(doc: TiptapNode | null | undefined): MarkdownFromEditor {
	const markdown = editorToMarkdown(doc);
	// TWO QUESTIONS, AND THE SECOND IS THE ONE THAT CATCHES A LITERAL ASTERISK.
	//
	// The first is the same round trip `markdownEditable` asks, applied to the
	// output: does this string parse to something that serializes back to it.
	// That alone is NOT enough, and the case that proves it is `Multiply 3 *by*
	// 4.` typed as plain text -- the string is a fixed point of the round trip,
	// so the structural check passes while the page gains an italic nobody
	// typed.
	//
	// The second compares the WORDS. `parseInline` has no escape syntax, so
	// every character it treats as markup is a character it also DELETES from
	// the text -- the asterisks vanish into an italic run, `[a](url)` loses its
	// brackets and its url. So a plain-text comparison catches exactly the class
	// of divergence this parser can produce, without a second copy of "which
	// characters are special" that would drift from `parseInline` itself.
	const faithful = markdownEditable(markdown) && editorText(doc) === markdownText(markdown);
	return { markdown, faithful };
}

/**
 * What in this field the editor cannot hold, in the author's words. The
 * fallback notice names it, so a person is told WHY they are looking at source
 * rather than being left to conclude the editor is broken.
 */
export function markdownUneditableReasons(markdown: string): string[] {
	const found = new Set<string>();
	const hasCode = (runs: InlineRun[]) => runs.some((r) => r.code);
	for (const node of parseMarkdown(markdown ?? '')) {
		if (node.type === 'table') found.add('a table');
		else if (node.type === 'code') found.add('a code block');
		else if (node.type === 'quote') found.add('a quotation');
		// A FIGURE IS NO LONGER A REASON BY ITSELF (0176) -- the document holds
		// one now. What is still a reason is a figure the round trip cannot
		// reproduce, and `markdownEditable` below is what asks that: a caption
		// carrying a `]`, or a filename with a space in it, writes a line
		// `FIGURE_RE` reads back as a paragraph. That case falls through to the
		// generic sentence at the bottom rather than being named here, because
		// naming "an image" for a field whose image is fine would send an
		// author looking for a problem that is somewhere else.
		else if (node.type === 'figure') {
			// Nothing to add and nothing to walk: a figure carries no runs, so it
			// is handled here rather than falling through to the inline-code test
			// below, which would be asking a question about a property this node
			// does not have.
			if (!(node.alt ?? '').trim()) found.add('an image');
		} else if (node.type === 'list') {
			for (const item of node.items) if (hasCode(item.runs)) found.add('inline code');
		} else if (hasCode(node.runs)) found.add('inline code');
	}
	if (!found.size && !markdownEditable(markdown)) {
		found.add('formatting the editor would not reproduce exactly');
	}
	return [...found];
}

/**
 * Append a figure line to a prose field, which is what an image drop produces.
 *
 * A FIGURE IS A WHOLE LINE AND NOTHING ELSE (`FIGURE_RE` in reference-spec), so
 * it can only ever be appended as its own block -- there is no inline image run
 * to insert at a cursor, deliberately, and adding one is a decision that
 * module's own comment exists to stop being made by accident. The reference
 * string itself comes from `figureReference` in classroom.ts, the one spelling
 * shared with the copy affordance in AttachmentList.
 */
export function appendFigure(markdown: string, figure: string): string {
	const body = (markdown ?? '').replace(/\s+$/, '');
	return body ? `${body}\n\n${figure}` : figure;
}

/**
 * WILL THIS REFERENCE ACTUALLY RENDER AS A FIGURE -- asked of the produced line
 * by putting it through the REAL parser, never by a second copy of `FIGURE_RE`.
 *
 * IT IS NOT A FORMALITY, AND THE CASE IS A SPACE IN A FILENAME. `FIGURE_RE`
 * matches a src of `[^)\s]+`, so `![x](attachment:bench setup.png)` is not a
 * figure at all: it falls through to the paragraph path and a student reads the
 * markup. `figureReference` builds the string from whatever the file was called,
 * and nothing between the two checks. Measured in a browser with a dropped file
 * named "truss detail.png".
 *
 * The upload has already landed by the time this can be asked, which is the
 * right order: the file is on the item either way, listed under Files, and what
 * is refused is only putting an inert line into somebody's prose.
 */
export function figureLineRenders(figure: string): boolean {
	const nodes = parseMarkdown(figure);
	return nodes.length === 1 && nodes[0].type === 'figure';
}
