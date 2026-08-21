// tests/notebook-note-content.test.ts
//
// normalizeNoteDoc: the server-side sanitizer every written note passes
// through before it is stored.
//
// WHY THIS EARNS A TEST, against this repo's default of verifying by dev
// harness: a sanitizer's failure mode is invisible. Content that should have
// been stripped and was not looks completely normal to whoever wrote it, and
// only becomes a problem in someone else's browser -- an instructor's -- some
// time later. There is nothing to eyeball in a harness, and the whole
// function is pure, so no fixture is needed either.
//
// It is one of three gates and the test says so where it matters: the point
// of most cases below is not "this attack is blocked" but "this input cannot
// produce a node type the renderer does not know", because the renderer walks
// the result into real elements and never interprets it as markup.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeNoteDoc } from '../src/lib/server/notebook-notes';
import { NOTE_MAX_CHARS, docText, docToTiptap } from '../src/lib/notebook-notes';
import {
	canHold,
	editorDoc,
	noteSchema,
	pmBold,
	pmBullets,
	pmDoc,
	pmHeading,
	pmItalic,
	pmItem,
	pmLink,
	pmNumbers,
	pmPara,
	pmText
} from './rich-text-fixtures';

/** The editor's own output shape. */
const doc = (...content: unknown[]) => ({ type: 'doc', content });
const para = (...content: unknown[]) => ({ type: 'paragraph', content });
const text = (t: string, marks?: unknown[]) => ({ type: 'text', text: t, ...(marks ? { marks } : {}) });

function ok(input: unknown) {
	const result = normalizeNoteDoc(input);
	if (!result.ok) throw new Error(`expected a document, got: ${result.error}`);
	return result.doc;
}

describe('what the editor can actually produce', () => {
	it('keeps paragraphs, bold, italic and safe links', () => {
		expect(
			ok(
				doc(
					para(
						text('Plain '),
						text('bold', [{ type: 'bold' }]),
						text(' '),
						text('italic', [{ type: 'italic' }]),
						text(' '),
						text('link', [{ type: 'link', attrs: { href: 'https://example.com/a?b=c' } }])
					)
				)
			)
		).toEqual([
			{
				type: 'p',
				runs: [
					{ text: 'Plain ' },
					{ text: 'bold', bold: true },
					{ text: ' ' },
					{ text: 'italic', italic: true },
					{ text: ' ' },
					{ text: 'link', href: 'https://example.com/a?b=c' }
				]
			}
		]);
	});

	it('keeps both list kinds, one run list per item', () => {
		expect(
			ok(
				doc(
					{
						type: 'bulletList',
						content: [
							{ type: 'listItem', content: [para(text('first'))] },
							{ type: 'listItem', content: [para(text('second', [{ type: 'bold' }]))] }
						]
					},
					{ type: 'orderedList', content: [{ type: 'listItem', content: [para(text('step'))] }] }
				)
			)
		).toEqual([
			{ type: 'ul', items: [[{ text: 'first' }], [{ text: 'second', bold: true }]] },
			{ type: 'ol', items: [[{ text: 'step' }]] }
		]);
	});

	it('merges runs that would render identically', () => {
		const result = ok(doc(para(text('one '), text('two'), text(' three'))));
		expect(result).toEqual([{ type: 'p', runs: [{ text: 'one two three' }] }]);
	});

	it('drops the empty paragraphs an editor always carries', () => {
		expect(ok(doc(para(), para(text('real')), para()))).toEqual([
			{ type: 'p', runs: [{ text: 'real' }] }
		]);
	});

	it('accepts a bare array of nodes as well as a doc node', () => {
		expect(ok([para(text('bare'))])).toEqual([{ type: 'p', runs: [{ text: 'bare' }] }]);
	});
});

describe('links', () => {
	it.each([
		'javascript:alert(1)',
		'JaVaScRiPt:alert(1)',
		'data:text/html,<script>alert(1)</script>',
		'vbscript:msgbox(1)',
		'java\nscript:alert(1)',
		'  javascript:alert(1)',
		'#anchor',
		'/relative/path',
		'//example.com',
		''
	])('keeps the words but drops the link for %j', (href) => {
		const result = ok(doc(para(text('click me', [{ type: 'link', attrs: { href } }]))));
		// The student's text is theirs either way; only the target is refused.
		expect(result).toEqual([{ type: 'p', runs: [{ text: 'click me' }] }]);
	});

	it.each(['https://example.com', 'http://example.com/x', 'mailto:someone@boscotech.edu'])(
		'keeps %j',
		(href) => {
			const result = ok(doc(para(text('here', [{ type: 'link', attrs: { href } }]))));
			expect(result[0]).toEqual({ type: 'p', runs: [{ text: 'here', href }] });
		}
	);

	it('ignores a non-string href', () => {
		expect(ok(doc(para(text('x', [{ type: 'link', attrs: { href: { toString: 1 } } }]))))).toEqual([
			{ type: 'p', runs: [{ text: 'x' }] }
		]);
	});
});

describe('anything the editor cannot produce', () => {
	// THE CENTRAL PROPERTY: the result is BUILT from node types this file
	// names, so an unknown one cannot survive into it -- only its words can.
	it('flattens an out-of-scope block to a paragraph rather than keeping it', () => {
		expect(
			ok(
				doc(
					{ type: 'heading', attrs: { level: 1 }, content: [text('A heading')] },
					{ type: 'blockquote', content: [para(text('A quote'))] },
					{ type: 'codeBlock', content: [text('rm -rf /')] },
					{ type: 'table', content: [{ type: 'tableRow', content: [para(text('cell'))] }] }
				)
			)
		).toEqual([
			{ type: 'p', runs: [{ text: 'A heading' }] },
			{ type: 'p', runs: [{ text: 'A quote' }] },
			{ type: 'p', runs: [{ text: 'rm -rf /' }] },
			{ type: 'p', runs: [{ text: 'cell' }] }
		]);
	});

	it('drops a node with no text at all', () => {
		expect(
			ok(doc(para(text('kept')), { type: 'image', attrs: { src: 'x', onerror: 'alert(1)' } }))
		).toEqual([{ type: 'p', runs: [{ text: 'kept' }] }]);
	});

	it('drops unknown marks and keeps the ones it knows', () => {
		expect(
			ok(
				doc(
					para(
						text('x', [
							{ type: 'bold' },
							{ type: 'highlight', attrs: { color: 'red' } },
							{ type: 'textStyle', attrs: { style: 'position:fixed' } }
						])
					)
				)
			)
		).toEqual([{ type: 'p', runs: [{ text: 'x', bold: true }] }]);
	});

	// Markup arriving as TEXT stays text. It is never re-parsed, and the
	// renderer emits it through Svelte's own escaping.
	it('treats markup in a text node as literal text', () => {
		const result = ok(doc(para(text('<script>alert(1)</script> & <b>hi</b>'))));
		expect(result).toEqual([
			{ type: 'p', runs: [{ text: '<script>alert(1)</script> & <b>hi</b>' }] }
		]);
	});

	// THE FIXTURE IS BUILT FROM THE EDITOR'S OWN SCHEMA, not typed by hand.
	// The version this replaces put the sublist beside its list items rather
	// than inside one, which ProseMirror cannot produce -- so it exercised a
	// branch no real note reaches, and stayed green for as long as it existed
	// while every genuine nested list was being concatenated into one item.
	//
	// THE EXPECTED SHAPE HAS CHANGED ONCE SINCE, and generalizing rather than
	// deleting it is why it still bites: b57b61d fixed the concatenation by
	// SPLICING a sublist's items into the parent list, and this asserted that
	// flat list of seven items. 0122 widened both gates to hold a sublist, so
	// the level now survives -- but the property underneath is the same one,
	// and the assertion below still fails for either older walk.
	it('keeps every bullet of a nested list, nested where it was written', () => {
		const written = editorDoc(
			noteSchema,
			pmDoc(
				pmBullets(
					pmItem(
						pmPara(pmText('Materials')),
						pmBullets(
							pmItem(pmPara(pmText('250 mL beaker'))),
							pmItem(pmPara(pmText('Digital scale'))),
							pmItem(pmPara(pmText('Graduated cylinder')))
						)
					),
					pmItem(
						pmPara(pmText('Method')),
						pmNumbers(pmItem(pmPara(pmText('Weigh it'))), pmItem(pmPara(pmText('Record it'))))
					)
				)
			)
		);

		expect(ok(written)).toEqual([
			{
				type: 'ul',
				items: [
					[
						{ text: 'Materials' },
						{
							type: 'ul',
							items: [
								[{ text: '250 mL beaker' }],
								[{ text: 'Digital scale' }],
								[{ text: 'Graduated cylinder' }]
							]
						}
					],
					[
						{ text: 'Method' },
						{ type: 'ol', items: [[{ text: 'Weigh it' }], [{ text: 'Record it' }]] }
					]
				]
			}
		]);
		// The outer list has TWO items. Seven was the interim splice; one was
		// the concatenation before it.
		const list = ok(written)[0] as { items: unknown[] };
		expect(list.items).toHaveLength(2);
		// And every bullet is still readable, in document order, in the text
		// projection -- the part neither older walk got right.
		expect(docText(ok(written)).split('\n')).toEqual([
			'Materials',
			'250 mL beaker',
			'Digital scale',
			'Graduated cylinder',
			'Method',
			'Weigh it',
			'Record it'
		]);
	});

	// The measured output of the version this replaces, named so the defect
	// cannot come back quietly: two items, each one unreadable word.
	it('never joins a sublist onto the item above it', () => {
		const written = editorDoc(
			noteSchema,
			pmDoc(
				pmBullets(
					pmItem(
						pmPara(pmText('Materials')),
						pmBullets(
							pmItem(pmPara(pmText('250 mL beaker'))),
							pmItem(pmPara(pmText('Digital scale'))),
							pmItem(pmPara(pmText('Graduated cylinder')))
						)
					)
				)
			)
		);
		const SOURCE = ['Materials', '250 mL beaker', 'Digital scale', 'Graduated cylinder'];
		const lines = docText(ok(written)).split('\n');
		expect(lines).toEqual(SOURCE);
		// Each line carries exactly ONE of the things that was written, which is
		// the property the old walk broke. Positive control on the sweep: four
		// lines are checked, not zero.
		expect(lines).toHaveLength(4);
		for (const line of lines) expect(SOURCE.filter((s) => line.includes(s))).toHaveLength(1);
		expect(lines).not.toContain(SOURCE.join(''));
	});

	// A list item's content is `paragraph block*`, so a paste can legitimately
	// put two paragraphs in one bullet. Joining them would be the same defect
	// one level further down.
	it('gives each paragraph of a single list item its own item', () => {
		const written = editorDoc(
			noteSchema,
			pmDoc(pmBullets(pmItem(pmPara(pmText('First half')), pmPara(pmText('Second half')))))
		);
		expect(ok(written)).toEqual([
			{ type: 'ul', items: [[{ text: 'First half' }], [{ text: 'Second half' }]] }
		]);
	});

	// The guard on the fixture itself: the shape the old test used is not
	// something this schema can hold, so nothing can quietly go back to
	// asserting against it.
	it('cannot construct the sibling-list shape the old fixture used', () => {
		const siblingList = pmDoc(
			pmBullets(pmItem(pmPara(pmText('outer'))), pmBullets(pmItem(pmPara(pmText('inner')))))
		);
		const realNesting = pmDoc(
			pmBullets(pmItem(pmPara(pmText('outer')), pmBullets(pmItem(pmPara(pmText('inner'))))))
		);
		expect(canHold(noteSchema, siblingList)).toBe(false);
		// Positive control: the same content, nested where it really lives.
		expect(canHold(noteSchema, realNesting)).toBe(true);
		// And a note has no headings at all, so that fixture is unbuildable too.
		expect(canHold(noteSchema, pmDoc(pmHeading(3, pmText('x'))))).toBe(false);
	});

	it('turns a hard break into a space rather than losing the words', () => {
		expect(ok(doc(para(text('before'), { type: 'hardBreak' }, text('after'))))).toEqual([
			{ type: 'p', runs: [{ text: 'before after' }] }
		]);
	});
});

describe('refusals', () => {
	it.each([
		['null', null],
		['undefined', undefined],
		['a string', 'just text'],
		['a number', 7],
		['a doc with no content array', { type: 'doc' }],
		['an empty doc', doc()],
		['only empty paragraphs', doc(para(), para())],
		['whitespace only', doc(para(text('   \n  ')))]
	])('refuses %s', (_name, input) => {
		expect(normalizeNoteDoc(input).ok).toBe(false);
	});

	it('refuses a note past the character cap, and accepts one exactly at it', () => {
		expect(normalizeNoteDoc(doc(para(text('x'.repeat(NOTE_MAX_CHARS))))).ok).toBe(true);
		const over = normalizeNoteDoc(doc(para(text('x'.repeat(NOTE_MAX_CHARS + 1)))));
		expect(over.ok).toBe(false);
		if (!over.ok) expect(over.error).toMatch(/capped/i);
	});

	// Hostile nesting is a stack overflow, which in a serverless function is a
	// 500 rather than a refusal. Both guards below exist for that.
	it('survives a deeply nested document instead of overflowing', () => {
		let node: unknown = text('deep');
		for (let i = 0; i < 5000; i++) node = { type: 'paragraph', content: [node] };
		const result = normalizeNoteDoc(doc(node));
		// Past MAX_DEPTH the text is simply not reached; either answer is fine,
		// what matters is that it returned at all.
		expect(typeof result.ok).toBe('boolean');
	});

	it('refuses a document with an absurd number of blocks', () => {
		const many = Array.from({ length: 2001 }, () => para(text('x')));
		expect(normalizeNoteDoc(doc(...many)).ok).toBe(false);
	});
});

describe('docText', () => {
	it('reads one line per block and per list item', () => {
		const result = ok(
			doc(
				para(text('first line')),
				{
					type: 'bulletList',
					content: [
						{ type: 'listItem', content: [para(text('a'))] },
						{ type: 'listItem', content: [para(text('b'))] }
					]
				}
			)
		);
		expect(docText(result)).toBe('first line\na\nb');
	});
});


// ---------------------------------------------------------------------------
// THE ROUND TRIP
//
// One document holding one instance of every construct the note editor can
// produce, at every nesting arrangement its schema permits, run all the way
// through: written -> normalized -> stored -> seeded back into the editor ->
// normalized again. Nothing may be dropped, reordered or joined to its
// neighbour anywhere along it.
//
// The fixture is built through the real schema, so it cannot encode a document
// the editor could not have held. The EXPECTED lines are written out by hand
// beside it rather than derived from the walk, so the expectation cannot agree
// with the implementation by construction.
// ---------------------------------------------------------------------------
describe('a whole note survives the round trip', () => {
	/** Every construct: marks, both list kinds, three levels, a two-paragraph item. */
	const written = () =>
		editorDoc(
			noteSchema,
			pmDoc(
				pmPara(
					pmText('Plain '),
					pmText('bold', [pmBold]),
					pmText(' '),
					pmText('italic', [pmItalic]),
					pmText(' '),
					pmText('both', [pmBold, pmItalic]),
					pmText(' '),
					pmText('link', [pmLink('https://example.com/a')]),
					pmText(' '),
					pmText('bold link', [pmBold, pmLink('https://example.com/b')])
				),
				pmBullets(
					pmItem(
						pmPara(pmText('Level one bullet')),
						pmNumbers(
							pmItem(
								pmPara(pmText('Level two number')),
								pmBullets(pmItem(pmPara(pmText('Level three bullet'))))
							),
							pmItem(pmPara(pmText('Level two, second number')))
						)
					),
					pmItem(
						pmPara(pmText('Second bullet, first paragraph')),
						pmPara(pmText('Second bullet, second paragraph'))
					)
				),
				pmNumbers(pmItem(pmPara(pmText('Numbered '), pmText('with emphasis', [pmItalic])))),
				pmPara(pmText('Closing paragraph'))
			)
		);

	/** Written by hand from the fixture above, in the order it was written. */
	const LINES = [
		'Plain bold italic both link bold link',
		'Level one bullet',
		'Level two number',
		'Level three bullet',
		'Level two, second number',
		'Second bullet, first paragraph',
		'Second bullet, second paragraph',
		'Numbered with emphasis',
		'Closing paragraph'
	];

	it('keeps every line, in order, with nothing joined to its neighbour', () => {
		const stored = ok(written());
		expect(stored.map((b) => b.type)).toEqual(['p', 'ul', 'ol', 'p']);
		expect(docText(stored).split('\n')).toEqual(LINES);
		// Positive control on the sweep itself: nine lines, not zero.
		expect(LINES).toHaveLength(9);
	});

	it('keeps every mark on the run it was written on', () => {
		const stored = ok(written());
		expect(stored[0]).toEqual({
			type: 'p',
			runs: [
				{ text: 'Plain ' },
				{ text: 'bold', bold: true },
				{ text: ' ' },
				{ text: 'italic', italic: true },
				{ text: ' ' },
				{ text: 'both', bold: true, italic: true },
				{ text: ' ' },
				{ text: 'link', href: 'https://example.com/a' },
				{ text: ' ' },
				{ text: 'bold link', bold: true, href: 'https://example.com/b' }
			]
		});
		expect(stored[2]).toEqual({
			type: 'ol',
			items: [[{ text: 'Numbered ' }, { text: 'with emphasis', italic: true }]]
		});
	});

	it('seeds an editor the schema can hold, and normalizes back to the same doc', () => {
		const stored = ok(written());
		const reopened = docToTiptap(stored);
		// The stored doc goes back into a REAL editor, so what it seeds has to be
		// something that editor's schema accepts.
		expect(canHold(noteSchema, reopened)).toBe(true);
		expect(ok(editorDoc(noteSchema, reopened))).toEqual(stored);
		expect(docText(ok(editorDoc(noteSchema, reopened))).split('\n')).toEqual(LINES);
	});
});

// ---------------------------------------------------------------------------
// THE OBSERVED DOCUMENT
//
// Everything above argues from the SCHEMA about what the editor can produce.
// This is the same claim OBSERVED: `editor.getJSON()` read straight off the
// shipping component at /dev/notebook in a real browser after pasting HTML
// with a nested list into it (tests/fixtures/pasted-nested-list.json).
//
// It is what keeps the schema builder honest. If `getSchema` and the mounted
// editor ever disagreed, every fixture in this file would be arguing from a
// schema nothing is configured with, and the first assertion below is the one
// that would say so.
// ---------------------------------------------------------------------------
describe('what the editor was actually observed to produce', () => {
	const CAPTURED = JSON.parse(
		readFileSync(new URL('./fixtures/pasted-nested-list.json', import.meta.url), 'utf8')
	).note;

	it('is byte-identical to what the schema builder produces for the same content', () => {
		expect(
			editorDoc(
				noteSchema,
				pmDoc(
					pmBullets(
						pmItem(
							pmPara(pmText('Materials')),
							pmBullets(
								pmItem(pmPara(pmText('250 mL beaker'))),
								pmItem(pmPara(pmText('Digital scale'))),
								pmItem(pmPara(pmText('Graduated cylinder')))
							)
						),
						pmItem(pmPara(pmText('Method')))
					),
					pmPara()
				)
			)
		).toEqual(CAPTURED);
	});

	it('puts the sublist INSIDE the list item, never beside it', () => {
		const list = CAPTURED.content[0];
		expect(list.type).toBe('bulletList');
		// Positive control: the list has two children and BOTH are list items.
		expect(list.content).toHaveLength(2);
		expect(list.content.map((n: { type: string }) => n.type)).toEqual(['listItem', 'listItem']);
		// The sublist is a child of the first item.
		expect(list.content[0].content[1].type).toBe('bulletList');
	});

	it('normalizes to five readable items, not one run-on word', () => {
		expect(docText(ok(CAPTURED)).split('\n')).toEqual([
			'Materials',
			'250 mL beaker',
			'Digital scale',
			'Graduated cylinder',
			'Method'
		]);
	});
});