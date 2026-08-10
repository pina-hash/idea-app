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
import { normalizeNoteDoc } from '../src/lib/server/notebook-notes';
import { NOTE_MAX_CHARS, docText } from '../src/lib/notebook-notes';

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

	it('flattens a nested list into more items of its parent', () => {
		expect(
			ok(
				doc({
					type: 'bulletList',
					content: [
						{ type: 'listItem', content: [para(text('outer'))] },
						{
							type: 'bulletList',
							content: [{ type: 'listItem', content: [para(text('inner'))] }]
						}
					]
				})
			)
		).toEqual([{ type: 'ul', items: [[{ text: 'outer' }], [{ text: 'inner' }]] }]);
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
