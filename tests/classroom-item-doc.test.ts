// tests/classroom-item-doc.test.ts
//
// normalizeItemDoc: the server-side sanitizer every classroom item body passes
// through before it is stored, plus the pure doc layer around it.
//
// WHY THIS EARNS A TEST, against this repo's default of verifying by dev
// harness: a sanitizer's failure mode is invisible. Content that should have
// been stripped and was not looks completely normal to whoever wrote it, and
// only becomes a problem in someone else's browser -- here, every student in
// the class -- some time later. There is nothing to eyeball in a harness, and
// the whole thing is pure, so no fixture is needed either.
//
// It is one of three gates and the cases say so where it matters: the point of
// most of them is not "this attack is blocked" but "this input cannot produce
// a node type the renderer does not know", because the renderer walks the
// result into real elements and never interprets it as markup. The other two
// gates are 0108's `_classroom_doc_ok` (tested against real Postgres in
// classroom-rich-body.test.ts) and the renderer's own re-check of every href.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { itemBodyColumns, normalizeItemDoc } from '../src/lib/server/classroom-doc';
import { selectItemsWithDoc } from '../src/lib/classroom/transports';
import { normalizeItemRow } from '../src/lib/classroom/classroom';
import {
	ITEM_BODY_MAX_CHARS,
	docFromPlainText,
	docText,
	itemBodyDoc,
	safeHref,
	type ItemDoc
} from '../src/lib/classroom/classroom-doc';

/** The editor's own output shape. */
const doc = (...content: unknown[]) => ({ type: 'doc', content });
const para = (...content: unknown[]) => ({ type: 'paragraph', content });
const heading = (level: number, ...content: unknown[]) => ({
	type: 'heading',
	attrs: { level },
	content
});
const text = (t: string, marks?: unknown[]) => ({ type: 'text', text: t, ...(marks ? { marks } : {}) });
const listItem = (...content: unknown[]) => ({ type: 'listItem', content });

function ok(input: unknown): ItemDoc {
	const result = normalizeItemDoc(input);
	if (!result.ok) throw new Error(`expected a document, got: ${result.error}`);
	return result.doc;
}

/** Every block type the result contains, in order. */
const types = (d: ItemDoc) => d.map((b) => b.type);

describe('the closed shape is BUILT, so hostile input has nowhere to land', () => {
	it('drops a script node entirely and keeps the words around it', () => {
		const d = ok(
			doc(
				para(text('Read this.')),
				{ type: 'script', content: [text('alert(1)')] },
				para(text('Then this.'))
			)
		);
		// The script node contributes its TEXT as a paragraph at worst -- it can
		// never contribute a node type, because the result is assembled from the
		// types this sanitizer names and `script` is not one of them.
		expect(types(d).every((t) => ['p', 'h3', 'h4', 'ul', 'ol'].includes(t))).toBe(true);
		expect(JSON.stringify(d)).not.toContain('script');
	});

	it('carries no attribute of any kind through from the input', () => {
		const d = ok(
			doc({
				type: 'paragraph',
				attrs: { onclick: 'steal()', style: 'position:fixed', onerror: 'x()' },
				content: [text('Hello', [{ type: 'bold' }])]
			})
		);
		// A run may hold text, bold, italic and href, and nothing else exists to
		// hold an event handler in the first place.
		expect(d).toEqual([{ type: 'p', runs: [{ text: 'Hello', bold: true }] }]);
		const serialized = JSON.stringify(d);
		for (const bad of ['onclick', 'onerror', 'style', 'steal']) {
			expect(serialized).not.toContain(bad);
		}
	});

	it('keeps the text of a javascript: link and drops the link', () => {
		const d = ok(
			doc(para(text('click me', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])))
		);
		expect(d).toEqual([{ type: 'p', runs: [{ text: 'click me' }] }]);
	});

	it.each([
		['javascript:alert(1)', 'plain javascript'],
		['JavaScript:alert(1)', 'mixed case'],
		['  javascript:alert(1)', 'leading space'],
		['java\nscript:alert(1)', 'newline inside the scheme'],
		['java\tscript:alert(1)', 'tab inside the scheme'],
		['data:text/html;base64,PHNjcmlwdD4=', 'data url'],
		['vbscript:msgbox(1)', 'vbscript'],
		['file:///etc/passwd', 'file url']
	])('refuses the href %s (%s)', (href) => {
		expect(safeHref(href)).toBeNull();
		const d = ok(doc(para(text('x', [{ type: 'link', attrs: { href } }]))));
		expect(d[0]).toEqual({ type: 'p', runs: [{ text: 'x' }] });
	});

	it.each(['https://example.com/a?b=1', 'http://example.com', 'mailto:t@boscotech.edu'])(
		'keeps the safe href %s',
		(href) => {
			const d = ok(doc(para(text('x', [{ type: 'link', attrs: { href } }]))));
			expect(d[0]).toEqual({ type: 'p', runs: [{ text: 'x', href }] });
		}
	);

	it('drops a mark type it does not know rather than carrying it', () => {
		const d = ok(
			doc(para(text('x', [{ type: 'bold' }, { type: 'highlight', attrs: { color: 'red' } }])))
		);
		expect(d).toEqual([{ type: 'p', runs: [{ text: 'x', bold: true }] }]);
	});

	it('survives absurd nesting without recursing forever', () => {
		let node: unknown = text('deep');
		for (let i = 0; i < 500; i++) node = { type: 'paragraph', content: [node] };
		// Past the depth limit the text is simply not reached; what matters is
		// that this RETURNS rather than blowing the stack, which in a serverless
		// function would be a 500 instead of a refusal.
		expect(() => normalizeItemDoc(doc(node))).not.toThrow();
	});

	it('refuses input that is not a document at all', () => {
		expect(normalizeItemDoc('<p>hi</p>').ok).toBe(false);
		expect(normalizeItemDoc(42).ok).toBe(false);
		expect(normalizeItemDoc({ type: 'doc' }).ok).toBe(false);
	});

	it('treats an absent body as an empty document, not an error', () => {
		// Unlike a note, an item body is optional -- only an announcement needs
		// one, and 0085's own field check is what enforces that.
		expect(normalizeItemDoc(null)).toEqual({ ok: true, doc: [] });
		expect(normalizeItemDoc(undefined)).toEqual({ ok: true, doc: [] });
	});
});

describe('a paste keeps its structure instead of flattening', () => {
	it('keeps a bulleted list as a list', () => {
		const d = ok(
			doc(
				para(text('Bring:')),
				{
					type: 'bulletList',
					content: [
						listItem(para(text('A ruler'))),
						listItem(para(text('Graph paper')))
					]
				}
			)
		);
		expect(d).toEqual([
			{ type: 'p', runs: [{ text: 'Bring:' }] },
			{ type: 'ul', items: [[{ text: 'A ruler' }], [{ text: 'Graph paper' }]] }
		]);
	});

	it('keeps a numbered list numbered, and its emphasis', () => {
		const d = ok(
			doc({
				type: 'orderedList',
				content: [
					listItem(para(text('Measure ', []), text('twice', [{ type: 'bold' }]))),
					listItem(para(text('Cut once')))
				]
			})
		);
		expect(d).toEqual([
			{
				type: 'ol',
				items: [[{ text: 'Measure ' }, { text: 'twice', bold: true }], [{ text: 'Cut once' }]]
			}
		]);
	});

	it('flattens a nested list into its parent rather than losing the items', () => {
		const d = ok(
			doc({
				type: 'bulletList',
				content: [
					listItem(para(text('Top'))),
					{ type: 'bulletList', content: [listItem(para(text('Nested')))] }
				]
			})
		);
		expect(d).toEqual([{ type: 'ul', items: [[{ text: 'Top' }], [{ text: 'Nested' }]] }]);
	});

	it('keeps the words from a table or any other out-of-scope wrapper', () => {
		const d = ok(
			doc({
				type: 'table',
				content: [
					{
						type: 'tableRow',
						content: [
							{ type: 'tableCell', content: [para(text('Left'))] },
							{ type: 'tableCell', content: [para(text('Right'))] }
						]
					}
				]
			})
		);
		// One paragraph rather than a table -- but nothing the teacher wrote is
		// gone, which is the whole reason this flattens rather than refuses.
		expect(docText(d)).toContain('Left');
		expect(docText(d)).toContain('Right');
	});

	it('clamps every heading level into the two a body may use', () => {
		const d = ok(
			doc(
				heading(1, text('Was h1')),
				heading(2, text('Was h2')),
				heading(3, text('Was h3')),
				heading(4, text('Was h4')),
				heading(6, text('Was h6'))
			)
		);
		// h1 and h2 belong to the page around the body (the item's title and the
		// section label), so a pasted h1 becomes the most prominent thing a BODY
		// can be, not something competing with the title above it.
		expect(types(d)).toEqual(['h3', 'h3', 'h3', 'h4', 'h4']);
		expect(docText(d).split('\n')).toEqual(['Was h1', 'Was h2', 'Was h3', 'Was h4', 'Was h6']);
	});

	it('merges adjacent runs that would render identically', () => {
		const d = ok(doc(para(text('one '), text('two'))));
		expect(d).toEqual([{ type: 'p', runs: [{ text: 'one two' }] }]);
	});

	it('is idempotent: its own output normalizes back to itself', () => {
		const first = ok(
			doc(
				heading(3, text('Steps')),
				{ type: 'bulletList', content: [listItem(para(text('One', [{ type: 'italic' }])))] },
				para(text('See ', []), text('this', [{ type: 'link', attrs: { href: 'https://x.test' } }]))
			)
		);
		// A publish toggle re-sends the item's STORED document rather than editor
		// output; running that back through must return the same thing, not an
		// empty body (the two shapes differ, and the stored one has no `content`
		// for an editor walk to find).
		expect(ok(first)).toEqual(first);
	});
});

describe('the plain-text projection', () => {
	it('is derived from the sanitized document, never from the caller', () => {
		const shaped = itemBodyColumns(
			doc(para(text('Line one')), { type: 'bulletList', content: [listItem(para(text('Item')))] })
		);
		expect(shaped.ok).toBe(true);
		if (!shaped.ok) return;
		expect(shaped.body).toBe('Line one\nItem');
		expect(shaped.body).toBe(docText(shaped.doc));
	});

	it('refuses a body past the cap the database also enforces', () => {
		const long = 'x'.repeat(ITEM_BODY_MAX_CHARS + 1);
		const res = itemBodyColumns(doc(para(text(long))));
		expect(res.ok).toBe(false);
		if (res.ok) return;
		expect(res.error).toContain('20,000');
	});
});

describe('content authored before rich text existed', () => {
	it('keeps its paragraphs rather than collapsing into one block', () => {
		const d = docFromPlainText('First paragraph.\n\nSecond paragraph.\n\n\nThird.');
		expect(d).toEqual([
			{ type: 'p', runs: [{ text: 'First paragraph.' }] },
			{ type: 'p', runs: [{ text: 'Second paragraph.' }] },
			{ type: 'p', runs: [{ text: 'Third.' }] }
		]);
	});

	it('loses not one character of the original', () => {
		const original =
			'Bring a ruler.\n\nMeasure the span, then\nrecord it in your notebook.\n\nDue Friday.';
		const d = docFromPlainText(original);
		for (const word of original.split(/\s+/).filter(Boolean)) {
			expect(docText(d)).toContain(word);
		}
	});

	it('turns a soft wrap into a space, not a lost line', () => {
		// The shape has no hard break; inventing one to preserve a soft wrap
		// would be a formatting change nobody asked for.
		expect(docFromPlainText('one\ntwo')).toEqual([
			{ type: 'p', runs: [{ text: 'one two' }] }
		]);
	});

	it.each(['', '   ', '\n\n'])('reads %o as an empty body rather than a blank paragraph', (t) => {
		expect(docFromPlainText(t)).toEqual([]);
	});

	it('renders from the plain text when the document is missing entirely', () => {
		// The state on a deployment sitting between 0107 and 0108: the select
		// degraded, so `body_doc` never arrived. The body must still render.
		expect(itemBodyDoc({ body: 'Old body.\n\nSecond.' })).toEqual([
			{ type: 'p', runs: [{ text: 'Old body.' }] },
			{ type: 'p', runs: [{ text: 'Second.' }] }
		]);
		expect(itemBodyDoc({ body: 'Old body.', body_doc: null })).toEqual([
			{ type: 'p', runs: [{ text: 'Old body.' }] }
		]);
	});

	it('prefers the document once there is one', () => {
		const rich: ItemDoc = [{ type: 'h3', runs: [{ text: 'Steps' }] }];
		expect(itemBodyDoc({ body: 'Steps', body_doc: rich })).toBe(rich);
	});
});

describe('the read degrades instead of blanking', () => {
	it('asks for the document, and falls back to the plain select when it is not there', async () => {
		// PostgREST refuses the WHOLE select for one unknown column, so naming
		// `body_doc` unconditionally would blank EVERY classroom read on a
		// deployment sitting between 0107 and 0108. A degrade that threw, or one
		// that never retried, would do the same thing -- silently, and only on
		// the deployment where the migration had not been pasted in yet.
		const asked: string[] = [];
		const pre0108 = async (select: string) => {
			asked.push(select);
			return select.includes('body_doc')
				? { data: null, error: { message: 'column classroom_items.body_doc does not exist' } }
				: { data: [{ id: 'i-1', body: 'Old body.' }], error: null };
		};
		const res = await selectItemsWithDoc(pre0108);
		expect(res.error).toBeNull();
		expect(asked).toHaveLength(2);
		expect(asked[0]).toContain('body_doc');
		expect(asked[1]).not.toContain('body_doc');
		// And the row still renders, from the plain text.
		const item = normalizeItemRow((res.data as Record<string, unknown>[])[0]);
		expect(item.body_doc).toBeUndefined();
		expect(itemBodyDoc(item)).toEqual([{ type: 'p', runs: [{ text: 'Old body.' }] }]);
	});

	it('asks once when the column is there', async () => {
		const asked: string[] = [];
		const res = await selectItemsWithDoc(async (select) => {
			asked.push(select);
			return { data: [{ id: 'i-1', body: 'x', body_doc: [] }], error: null };
		});
		expect(asked).toHaveLength(1);
		expect(res.error).toBeNull();
	});
});

describe('the renderer is the third gate', () => {
	it('uses no {@html ...} directive anywhere in the item-body path', () => {
		// The claim the whole design rests on, asserted rather than remembered:
		// a body is walked into real Svelte elements, which escape their own
		// text, so even a document that reached the database by some other door
		// can only ever be text.
		//
		// Matches the DIRECTIVE (which always carries an expression), not the
		// string -- several of these files discuss `{@html}` in a comment
		// explaining why they do not use it, and a substring check would read
		// those as violations.
		const directive = /\{@html\s+[^}\s]/;
		for (const file of [
			'src/lib/classroom/ItemBody.svelte',
			'src/lib/classroom/RichTextEditor.svelte',
			'src/lib/classroom/DeckStager.svelte',
			'src/lib/classroom/ContentComposer.svelte',
			'src/lib/classroom/classroom-doc.ts',
			'src/lib/server/classroom-doc.ts'
		]) {
			expect(readFileSync(file, 'utf8')).not.toMatch(directive);
		}
	});

	it('re-checks every href at render time, not only at write time', () => {
		const source = readFileSync('src/lib/classroom/ItemBody.svelte', 'utf8');
		expect(source).toContain('safeHref');
	});
});
