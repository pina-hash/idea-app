/**
 * THE THREE LIGHT TEMPLATES A STUDENT CAN START A NOTE FROM (ledger 0298, R32).
 *
 * THE WORDING LIVES IN `NOTE_TEMPLATES` AND NOWHERE ELSE. Mr. Pina edits the
 * names and the headings here, in one place; the composer renders whatever
 * this list holds, in this order. Adding a fourth template is one more object
 * in the array and nothing else.
 *
 * A TEMPLATE IS PARAGRAPHS, NEVER A NEW BLOCK. Each heading is an ordinary
 * paragraph holding one BOLD run, followed by an empty paragraph to write in.
 * The note schema has no heading node on purpose ($lib/rich-text-schema), so a
 * real `heading` here would be a node the editor cannot build -- and Tiptap
 * does not refuse such a document, it silently throws the WHOLE document away
 * (the defect `$lib/notebook/draft-mirror` records). Bold paragraphs are in
 * `NOTE_MIRROR_VOCABULARY` and past both note gates already, so the draft
 * mirror, the normalizer and `_notebook_note_content_ok` answer a templated
 * note exactly as they answer any other one.
 * `tests/notebook-note-templates.test.ts` builds every template through the
 * real editor schema and the real normalizer to hold that.
 *
 * NOTHING HERE IS REQUIRED. The headings are prompts in the student's own
 * document: they can type under them, delete them, or ignore the templates
 * entirely. A heading nobody wrote under is simply a bold line in the note.
 *
 * Pure and client-safe: no Svelte, no DOM.
 */

import { tiptapHasText, type TiptapNode } from '$lib/rich-text';

export interface NoteTemplate {
	/** Stable id, for test hooks and keys. Never shown. */
	id: string;
	/** The button's word, and the entry's title when the entry has none yet. */
	label: string;
	/** The optional headings, in the order they appear in the note. */
	headings: readonly string[];
}

/**
 * THE ONE PLACE THE WORDING IS WRITTEN. An engineering notebook entry is a
 * design decision, a test, or a record of a build, so those are the three.
 */
export const NOTE_TEMPLATES: readonly NoteTemplate[] = [
	{
		id: 'design-decision',
		label: 'Design decision',
		headings: ['The problem', 'Options I considered', 'What I chose and why', 'How I will check it']
	},
	{
		id: 'test-result',
		label: 'Test result',
		headings: ['What I tested', 'How I tested it', 'What happened', 'What I will change']
	},
	{
		id: 'build-log',
		label: 'Build log',
		headings: ['What I built', 'Problems and how I fixed them', 'Next step']
	}
];

/** One heading: a paragraph holding a single bold run. */
function headingParagraph(text: string): TiptapNode {
	return { type: 'paragraph', content: [{ type: 'text', text, marks: [{ type: 'bold' }] }] };
}

/** The template's blocks: each heading, then an empty paragraph to write in. */
export function templateBlocks(template: NoteTemplate): TiptapNode[] {
	return template.headings.flatMap((h) => [headingParagraph(h), { type: 'paragraph' }]);
}

/**
 * IS THE BOX BLANK: nothing in it but paragraphs of plain, empty text -- what
 * the editor seeds, and what a cleared box leaves behind.
 *
 * ASKED OF THE BLOCKS, NEVER OF THE TEXT ALONE. A grid is an ATOM whose cells
 * live in its attributes ($lib/notebook/grid), so a box holding a filled grid
 * and nothing else has no text node at all; `tiptapHasText` answers false for
 * it, and a template trusting that answer REPLACED the grid -- the student's
 * numbers gone on one press, and the mirror then backing up the template in
 * their place (found in the ledger 0298 review). Anything that is not an
 * empty paragraph is kept.
 */
export function noteIsBlank(doc: TiptapNode | null | undefined): boolean {
	if (!doc) return true;
	return (doc.content ?? []).every(
		(block) =>
			block.type === 'paragraph' &&
			!tiptapHasText(block) &&
			(block.content ?? []).every((inline) => inline.type === 'text')
	);
}

/**
 * DOES THE BOX HOLD A TEMPLATE AND NOTHING ELSE: at least one of the headings
 * `NOTE_TEMPLATES` writes (a paragraph that is one bold run of exactly that
 * text), and otherwise only blank paragraphs. Nothing the student wrote.
 *
 * WHY IT MATTERS (ledger 0298 review): the composer autosaves a draft the
 * moment the box holds text, and a draft FIXES where the entry is filed --
 * every later save only adds to it. Pressing a template and then "Change" is
 * the natural order on the log, and without this the headings alone made the
 * draft and locked the filing before the student had written a word. So the
 * composer does not CREATE a draft out of bare headings; the first thing the
 * student types does. Headings are still mirrored, and Save draft and Turn in
 * still save them when pressed.
 */
export function noteHoldsOnlyTemplate(doc: TiptapNode | null | undefined): boolean {
	if (!doc) return false;
	const headings = new Set(NOTE_TEMPLATES.flatMap((t) => t.headings));
	let sawHeading = false;
	for (const block of doc.content ?? []) {
		if (block.type !== 'paragraph') return false;
		const inline = block.content ?? [];
		if (!tiptapHasText(block) && inline.every((n) => n.type === 'text')) continue;
		const only = inline.length === 1 ? inline[0] : null;
		const bold = !!only?.marks?.some((m) => m.type === 'bold');
		if (only?.type === 'text' && bold && headings.has(only.text ?? '')) {
			sawHeading = true;
			continue;
		}
		return false;
	}
	return sawHeading;
}

/**
 * THE NOTE WITH A TEMPLATE ADDED. A blank box becomes the template; a box with
 * anything in it -- writing, a list, a grid -- keeps all of it and gets the
 * headings after it, so pressing a template can never cost the student
 * anything they put there.
 */
export function withTemplate(doc: TiptapNode | null | undefined, template: NoteTemplate): TiptapNode {
	const blocks = templateBlocks(template);
	if (noteIsBlank(doc)) return { type: 'doc', content: blocks };
	return { type: 'doc', content: [...(doc?.content ?? []), ...blocks] };
}

/**
 * WHERE THE CURSOR GOES when a template fills a BLANK box: inside the empty
 * paragraph under the first heading, so the first thing typed is an answer
 * rather than more of the heading. A ProseMirror position -- the first
 * paragraph opens at 0 and holds the heading from 1 to L+1, the next opens at
 * L+2 and its content starts at L+3. Only meaningful for `withTemplate` over a
 * box `noteIsBlank` answers yes for; a template added under anything else puts
 * the cursor at the end.
 */
export function templateCursor(template: NoteTemplate): number {
	return (template.headings[0]?.length ?? 0) + 3;
}
