/**
 * THE NOTEBOOK'S THREE LIGHT TEMPLATES (ledger 0298, R32) STAY INSIDE THE NOTE
 * VOCABULARY. A regression here is silent in the worst way: Tiptap does not
 * refuse a document naming a node its schema lacks, it throws the WHOLE
 * document away (the defect `$lib/notebook/draft-mirror` records), so a
 * template edited to use a real heading would arrive as an empty box -- and a
 * draft written from one would be HELD by every deployed build's mirror
 * instead of restored. So every template is built through the REAL editor
 * schema, the mirror's vocabulary check and the REAL server normalizer.
 *
 * The wording is Mr. Pina's to edit (`NOTE_TEMPLATES`), so nothing here pins a
 * string; it pins what any wording must stay inside.
 */
import { describe, expect, it } from 'vitest';
import { Node as PMNode } from '@tiptap/pm/model';
import {
	NOTE_TEMPLATES,
	noteHoldsOnlyTemplate,
	noteIsBlank,
	templateBlocks,
	templateCursor,
	withTemplate
} from '../src/lib/notebook/note-templates';
import {
	NOTE_MIRROR_VOCABULARY,
	V1_MIRROR_VOCABULARY,
	mirrorVersionFor,
	unknownTypes
} from '../src/lib/notebook/draft-mirror';
import { normalizeNoteDoc } from '../src/lib/server/notebook-notes';
import { docText } from '../src/lib/notebook-notes';
import { canHold, editorDoc, noteSchema, pmDoc, pmHeading, pmPara, pmText } from './rich-text-fixtures';

describe('the note templates', () => {
	it('is a non-empty list with unique ids, a word each and at least one heading', () => {
		expect(NOTE_TEMPLATES.length).toBeGreaterThanOrEqual(3);
		expect(new Set(NOTE_TEMPLATES.map((t) => t.id)).size).toBe(NOTE_TEMPLATES.length);
		for (const t of NOTE_TEMPLATES) {
			expect(t.label.trim().length, t.id).toBeGreaterThan(0);
			expect(t.headings.length, t.id).toBeGreaterThan(0);
			for (const h of t.headings) expect(h.trim().length, t.id).toBeGreaterThan(0);
		}
	});

	it('the schema check bites: a real heading is a document the note editor cannot hold', () => {
		// The negative control for the loop below, so "holds" cannot pass because
		// `canHold` answers yes to everything.
		expect(canHold(noteSchema, pmDoc(pmHeading(3, pmText('The problem')), pmPara()))).toBe(false);
		expect(canHold(noteSchema, pmDoc(pmPara(pmText('The problem'))))).toBe(true);
	});

	for (const t of NOTE_TEMPLATES) {
		describe(t.label, () => {
			const doc = withTemplate(null, t);

			it('is a document the real note editor can hold, exactly as written', () => {
				// `editorDoc` returns ProseMirror's own serialization of the node it
				// built, so equality also says the template carries no key the
				// editor would never emit.
				expect(editorDoc(noteSchema, doc)).toEqual(doc);
			});

			it('uses only what the draft mirror can restore on every deployed build', () => {
				expect(unknownTypes(doc, NOTE_MIRROR_VOCABULARY)).toEqual([]);
				expect(unknownTypes(doc, V1_MIRROR_VOCABULARY)).toEqual([]);
				expect(mirrorVersionFor(doc)).toBe(1);
			});

			it('passes the real server normalizer with every heading still in it', () => {
				const result = normalizeNoteDoc(doc);
				expect(result.ok).toBe(true);
				if (!result.ok) return;
				const text = docText(result.doc);
				for (const h of t.headings) expect(text).toContain(h);
			});

			it('puts the cursor in the empty paragraph under the first heading', () => {
				const node = PMNode.fromJSON(noteSchema, doc);
				const at = node.resolve(templateCursor(t));
				expect(at.parent.type.name).toBe('paragraph');
				expect(at.parent.content.size).toBe(0);
				// The second top-level block: the heading is the first.
				expect(at.index(0)).toBe(1);
			});
		});
	}

	it('keeps every word already in the box and adds the headings after them', () => {
		const t = NOTE_TEMPLATES[0];
		const mine = editorDoc(noteSchema, pmDoc(pmPara(pmText('Measured the bracket twice.'))));
		const next = withTemplate(mine as never, t);
		expect(next.content?.[0]).toEqual((mine as { content: unknown[] }).content[0]);
		expect(next.content?.slice(1)).toEqual(templateBlocks(t));
		// An EMPTY box (Tiptap seeds one empty paragraph) is replaced, not appended to.
		const empty = withTemplate({ type: 'doc', content: [{ type: 'paragraph' }] }, t);
		expect(empty.content).toEqual(templateBlocks(t));
	});

	/*
	 * A BOX WITH NO TEXT IS NOT A BLANK BOX. A grid is an atom whose cells live
	 * in its attributes, so a note holding a filled grid and nothing else has no
	 * text node anywhere -- and a template that asked "is there text" replaced
	 * it, taking the student's numbers on one press (ledger 0298 review). The
	 * control beside it is the blank box, which IS replaced, so this cannot
	 * pass by `withTemplate` simply always appending.
	 */
	it('keeps a grid that has no text beside it, and still replaces a truly blank box', () => {
		const t = NOTE_TEMPLATES[1];
		const grid = { type: 'notebookGrid', attrs: { rows: [['12', '3.5'], ['=A1*B1', '']] } };
		const gridOnly = { type: 'doc', content: [{ type: 'paragraph' }, grid, { type: 'paragraph' }] };
		const next = withTemplate(gridOnly, t);
		expect(next.content?.filter((b) => b.type === 'notebookGrid')).toEqual([grid]);
		expect(next.content?.slice(0, 3)).toEqual(gridOnly.content);
		expect(next.content?.slice(3)).toEqual(templateBlocks(t));
		expect(noteIsBlank(gridOnly)).toBe(false);
		// The control: blank in every spelling the editor produces is replaced.
		for (const blank of [null, { type: 'doc' }, { type: 'doc', content: [{ type: 'paragraph' }] }]) {
			expect(noteIsBlank(blank)).toBe(true);
			expect(withTemplate(blank, t).content).toEqual(templateBlocks(t));
		}
		// A paragraph holding only a line break is not blank either.
		expect(
			noteIsBlank({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'hardBreak' }] }] })
		).toBe(false);
	});

	/*
	 * BARE HEADINGS DO NOT CREATE A DRAFT, AND WRITING ALWAYS DOES. The composer
	 * gates its autosave CREATE on this, so it fails silently in both
	 * directions: answering yes to real writing means the first draft never
	 * autosaves at all, and answering no to bare headings locks the filing
	 * before a word is written (ledger 0298 review). Both are asserted.
	 */
	it('tells a template nobody wrote under from a note with writing in it', () => {
		for (const t of NOTE_TEMPLATES) {
			expect(noteHoldsOnlyTemplate(withTemplate(null, t)), t.id).toBe(true);
			// Two templates pressed one after the other is still only headings.
			expect(noteHoldsOnlyTemplate(withTemplate(withTemplate(null, t), NOTE_TEMPLATES[0])), t.id).toBe(true);
			// One typed word under the first heading is writing.
			const typed = withTemplate(null, t);
			typed.content![1] = { type: 'paragraph', content: [{ type: 'text', text: 'Loaded it to 5 kg' }] };
			expect(noteHoldsOnlyTemplate(typed), t.id).toBe(false);
		}
		const first = NOTE_TEMPLATES[0].headings[0];
		// The heading's words, typed without bold, are the student's own writing.
		expect(
			noteHoldsOnlyTemplate({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: first }] }] })
		).toBe(false);
		// Bold text that is not a heading is writing too.
		expect(
			noteHoldsOnlyTemplate({
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Gearbox', marks: [{ type: 'bold' }] }] }]
			})
		).toBe(false);
		// A blank box is not a template, and a grid under the headings is work.
		expect(noteHoldsOnlyTemplate(null)).toBe(false);
		expect(noteHoldsOnlyTemplate({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(false);
		const withGrid = withTemplate(null, NOTE_TEMPLATES[1]);
		withGrid.content!.push({ type: 'notebookGrid', attrs: { rows: [['1']] } });
		expect(noteHoldsOnlyTemplate(withGrid)).toBe(false);
	});
});
