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
import { isScheduled, normalizeItemRow } from '../src/lib/classroom/classroom';
import {
	ITEM_BODY_MAX_CHARS,
	docFromPlainText,
	docText,
	docToTiptap,
	itemBodyDoc,
	safeHref,
	type ItemDoc
} from '../src/lib/classroom/classroom-doc';
import {
	canHold,
	editorDoc,
	itemSchema,
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

	// THE FIXTURE IS BUILT FROM THE EDITOR'S OWN SCHEMA, not typed by hand.
	// The version this replaces put the sublist beside its list items rather
	// than inside one, which ProseMirror cannot produce -- so it exercised a
	// branch no real paste reaches, and stayed green for as long as it existed
	// while every genuine nested list was being concatenated into one item.
	it('keeps every bullet of a nested list, as its own item, in document order', () => {
		const written = editorDoc(
			itemSchema,
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
					[{ text: 'Materials' }],
					[{ text: '250 mL beaker' }],
					[{ text: 'Digital scale' }],
					[{ text: 'Graduated cylinder' }],
					[{ text: 'Method' }],
					[{ text: 'Weigh it' }],
					[{ text: 'Record it' }]
				]
			}
		]);
	});

	// The measured output of the version this replaces, named so the defect
	// cannot come back quietly: two items, each one unreadable word.
	it('never joins a sublist onto the item above it', () => {
		const written = editorDoc(
			itemSchema,
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

	// A list item's content is `paragraph block*`, so a pasted bullet can
	// legitimately hold two paragraphs, or a paragraph and a heading. Each is
	// its own item -- joining them would be the same defect one level down, and
	// a list item has no room for a heading BLOCK in the stored shape.
	it('gives each block inside a single list item its own item', () => {
		expect(
			ok(
				editorDoc(
					itemSchema,
					pmDoc(pmBullets(pmItem(pmPara(pmText('First half')), pmPara(pmText('Second half')))))
				)
			)
		).toEqual([{ type: 'ul', items: [[{ text: 'First half' }], [{ text: 'Second half' }]] }]);

		expect(
			ok(
				editorDoc(
					itemSchema,
					pmDoc(pmBullets(pmItem(pmPara(pmText('Lead')), pmHeading(4, pmText('Inner heading')))))
				)
			)
		).toEqual([{ type: 'ul', items: [[{ text: 'Lead' }], [{ text: 'Inner heading' }]] }]);
	});

	// The guard on the fixture itself: the shape the old test used is not
	// something this schema can hold, so nothing can quietly go back to
	// asserting against it.
	it('cannot construct the sibling-list shape the old fixture used', () => {
		const siblingList = pmDoc(
			pmBullets(pmItem(pmPara(pmText('Top'))), pmBullets(pmItem(pmPara(pmText('Nested')))))
		);
		const realNesting = pmDoc(
			pmBullets(pmItem(pmPara(pmText('Top')), pmBullets(pmItem(pmPara(pmText('Nested'))))))
		);
		expect(canHold(itemSchema, siblingList)).toBe(false);
		// Positive control: the same content, nested where it really lives.
		expect(canHold(itemSchema, realNesting)).toBe(true);
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

	// THE HEADING CLAMP, ON THE PATH IT ACTUALLY GUARDS -- deliberately fed
	// input the editor cannot emit, the notebook route test's convention
	// (tests/notebook-note-route.test.ts, 'stores only the closed shape,
	// whatever the body carried').
	//
	// A PASTE CANNOT REACH THIS. `RichTextEditor.svelte`'s `transformPastedHTML`
	// rewrites h1/h2 to h3 and h5/h6 to h4 before ProseMirror parses, and the
	// item schema is configured `heading: { levels: [3, 4] }` on top of that, so
	// nothing coming out of the composer carries a level this has to clamp. The
	// observed capture at the bottom of this file is where that is pinned, and
	// it is what makes this test's input editor-impossible rather than merely
	// unusual.
	//
	// WHAT DOES REACH IT is a hand-rolled POST to /api/classroom/item, which
	// hands `normalizeItemDoc` arbitrary JSON with no editor anywhere in front
	// of it -- and the RPC behind that route is granted to `authenticated` and
	// reachable straight through PostgREST as well. So the clamp is a live gate
	// on untrusted input, not a second copy of a rule the editor already
	// applied. Levels 1, 2 and 6 below are shapes only that caller can produce;
	// 3 and 4 are the positive control that this clamps rather than flattening
	// every heading to one level.
	it('clamps any heading level a caller sends into the two a body may use', () => {
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
		// section label), so an h1 arriving from anywhere becomes the most
		// prominent thing a BODY can be, not something competing with the title
		// above it. Nothing is refused and nothing is demoted to a paragraph:
		// every heading stays a heading, and every word survives.
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
	it('walks down to the plain select on a backend with neither column', async () => {
		// PostgREST refuses the WHOLE select for one unknown column, so naming
		// `body_doc` unconditionally would blank EVERY classroom read on a
		// deployment sitting between 0107 and 0108. A degrade that threw, or one
		// that never retried, would do the same thing -- silently, and only on
		// the deployment where the migration had not been pasted in yet.
		const asked: string[] = [];
		const pre0108 = async (select: string) => {
			asked.push(select);
			return select.includes('body_doc') || select.includes('publish_at')
				? { data: null, error: { message: 'column classroom_items.body_doc does not exist' } }
				: { data: [{ id: 'i-1', body: 'Old body.' }], error: null };
		};
		const res = await selectItemsWithDoc(pre0108);
		expect(res.error).toBeNull();
		// The walk goes WIDEST FIRST and gives up exactly one column at a time,
		// ending on the plain select. Asserted as a shape rather than a count, so
		// adding a rung for the next migration's column (0111's `unit_id` was the
		// first to prove the point) cannot break a test about degrading.
		const withPublish = asked.filter((s) => s.includes('publish_at'));
		const withDoc = asked.filter((s) => s.includes('body_doc'));
		expect(asked[0]).toContain('publish_at');
		expect(withPublish).toEqual(asked.slice(0, withPublish.length));
		expect(withDoc.length).toBeGreaterThan(withPublish.length);
		expect(withDoc).toEqual(asked.slice(0, withDoc.length));
		expect(asked[asked.length - 1]).not.toContain('body_doc');
		expect(asked[asked.length - 1]).not.toContain('publish_at');
		// And the row still renders, from the plain text.
		const item = normalizeItemRow((res.data as Record<string, unknown>[])[0]);
		expect(item.body_doc).toBeUndefined();
		expect(itemBodyDoc(item)).toEqual([{ type: 'p', runs: [{ text: 'Old body.' }] }]);
	});

	/**
	 * THE RUNGS ARE SEPARATE FOR THIS CASE. 0108 and 0109 are applied by hand and
	 * separately, so a project carrying one and not the other is a real state --
	 * and a chain that dropped both columns on the first refusal would cost such
	 * a project its RICH BODY to work around a column it does not have.
	 */
	it('keeps the rich body on a backend that has 0108 but not 0109', async () => {
		const asked: string[] = [];
		const res = await selectItemsWithDoc(async (select) => {
			asked.push(select);
			return select.includes('publish_at')
				? { data: null, error: { message: 'column classroom_items.publish_at does not exist' } }
				: { data: [{ id: 'i-1', body: 'x', body_doc: [] }], error: null };
		});
		expect(res.error).toBeNull();
		// Every rung naming publish_at was refused; the one that answered still
		// carried body_doc. That is the guarantee, whatever the chain's length.
		expect(asked.filter((s) => s.includes('publish_at')).length).toBeGreaterThan(0);
		expect(asked[asked.length - 1]).toContain('body_doc');
		expect(asked[asked.length - 1]).not.toContain('publish_at');
		const item = normalizeItemRow((res.data as Record<string, unknown>[])[0]);
		expect(item.body_doc).toEqual([]);
		// Absent, not null: a read that could not tell must not read as "scheduled
		// for never" -- `isScheduled` treats it as live, which is what it is.
		expect(item.publish_at).toBeUndefined();
	});

	it('asks once when both columns are there', async () => {
		const asked: string[] = [];
		const res = await selectItemsWithDoc(async (select) => {
			asked.push(select);
			return { data: [{ id: 'i-1', body: 'x', body_doc: [], publish_at: null }], error: null };
		});
		expect(asked).toHaveLength(1);
		expect(res.error).toBeNull();
	});
});

/**
 * The three states, and the one that is a function of the clock.
 *
 * These are DISPLAY predicates -- what a student can actually read is decided
 * by `_classroom_item_live` in the database at the moment of the read (0109).
 * They are pinned here because getting them wrong shows a teacher the wrong
 * chip, and because the absent-column case has to read as LIVE rather than as
 * anything else.
 */
describe('scheduled state', () => {
	const at = (iso: string) => new Date(iso);
	const NOW = at('2026-08-15T12:00:00Z');

	it('is scheduled only while published with a future stamp', () => {
		expect(isScheduled({ published: true, publish_at: '2026-08-16T12:00:00Z' }, NOW)).toBe(true);
		expect(isScheduled({ published: true, publish_at: '2026-08-14T12:00:00Z' }, NOW)).toBe(false);
		expect(isScheduled({ published: true, publish_at: null }, NOW)).toBe(false);
	});

	it('a draft is never scheduled, whatever stamp it carries', () => {
		// published=false wins outright: a draft with a future go-live is still a
		// draft, and calling it "Scheduled" would promise something nothing will
		// deliver -- no job flips `published`.
		expect(isScheduled({ published: false, publish_at: '2026-08-16T12:00:00Z' }, NOW)).toBe(false);
	});

	it('reads a column the backend never sent as live', () => {
		expect(isScheduled({ published: true }, NOW)).toBe(false);
	});

	it('does not trip on a stamp that is exactly now', () => {
		expect(isScheduled({ published: true, publish_at: NOW.toISOString() }, NOW)).toBe(false);
	});

	it('ignores an unparseable stamp rather than hiding the item', () => {
		expect(isScheduled({ published: true, publish_at: 'not a date' }, NOW)).toBe(false);
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
			// DeckStager.svelte was here and is DELETED -- the composer's staged
			// deck panel duplicated the item page's own. Removed from this list
			// rather than left to fail, which is the list doing its job: an
			// explicit enumeration notices a file leaving, where a glob would
			// quietly cover one fewer thing.
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


// ---------------------------------------------------------------------------
// THE ROUND TRIP
//
// One document holding one instance of every construct the body editor can
// produce, at every nesting arrangement its schema permits, run all the way
// through: written -> normalized -> stored -> re-saved as stored (the publish
// toggle's path) -> seeded back into the editor -> normalized again. Nothing
// may be dropped, reordered or joined to its neighbour anywhere along it.
//
// The fixture is built through the real schema, so it cannot encode a document
// the editor could not have held. The EXPECTED lines are written out by hand
// beside it rather than derived from the walk, so the expectation cannot agree
// with the implementation by construction.
// ---------------------------------------------------------------------------
describe('a whole item body survives the round trip', () => {
	/** Every construct: both heading levels, marks, both list kinds, three
	 *  levels of nesting, a two-paragraph bullet and a heading inside a bullet. */
	const written = () =>
		editorDoc(
			itemSchema,
			pmDoc(
				pmHeading(3, pmText('Section heading')),
				pmHeading(4, pmText('Subsection heading')),
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
					),
					pmItem(pmPara(pmText('Third bullet')), pmHeading(4, pmText('Heading inside a bullet')))
				),
				pmNumbers(pmItem(pmPara(pmText('Numbered '), pmText('with emphasis', [pmItalic])))),
				pmPara(pmText('Closing paragraph'))
			)
		);

	/** Written by hand from the fixture above, in the order it was written. */
	const LINES = [
		'Section heading',
		'Subsection heading',
		'Plain bold italic both link bold link',
		'Level one bullet',
		'Level two number',
		'Level three bullet',
		'Level two, second number',
		'Second bullet, first paragraph',
		'Second bullet, second paragraph',
		'Third bullet',
		'Heading inside a bullet',
		'Numbered with emphasis',
		'Closing paragraph'
	];

	it('keeps every line, in order, with nothing joined to its neighbour', () => {
		const stored = ok(written());
		expect(types(stored)).toEqual(['h3', 'h4', 'p', 'ul', 'ol', 'p']);
		expect(docText(stored).split('\n')).toEqual(LINES);
		// Positive control on the sweep itself: thirteen lines, not zero.
		expect(LINES).toHaveLength(13);
	});

	it('keeps every mark on the run it was written on', () => {
		const stored = ok(written());
		expect(stored[2]).toEqual({
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
		expect(stored[4]).toEqual({
			type: 'ol',
			items: [[{ text: 'Numbered ' }, { text: 'with emphasis', italic: true }]]
		});
	});

	it('re-saving the STORED document changes nothing', () => {
		const stored = ok(written());
		// The publish toggle's path: the item's existing document handed straight
		// back in. `looksStored` has to recognise it, or the body is silently
		// emptied for an item nobody was editing.
		expect(ok(stored)).toEqual(stored);
		expect(docText(ok(stored)).split('\n')).toEqual(LINES);
	});

	it('seeds an editor the schema can hold, and normalizes back to the same doc', () => {
		const stored = ok(written());
		const reopened = docToTiptap(stored);
		// The stored doc goes back into a REAL editor, so what it seeds has to be
		// something that editor's schema accepts.
		expect(canHold(itemSchema, reopened)).toBe(true);
		expect(ok(editorDoc(itemSchema, reopened))).toEqual(stored);
		expect(docText(ok(editorDoc(itemSchema, reopened))).split('\n')).toEqual(LINES);
	});
});

// ---------------------------------------------------------------------------
// THE OBSERVED DOCUMENT
//
// Everything above argues from the SCHEMA about what the editor can produce.
// This is the same claim OBSERVED: `editor.getJSON()` read straight off the
// shipping component at /dev/classroom-phase1 in a real browser after pasting
// HTML with an h1 and a nested list into it
// (tests/fixtures/pasted-nested-list.json).
//
// It is what keeps the schema builder honest, and it also pins the ONE thing
// the schema cannot check: the pasted `<h1>` arrived as an h3, because
// `transformPastedHTML` rewrites the tag before ProseMirror parses and the
// schema only knows levels 3 and 4. The schema does NOT range-check a heading's
// `level` attr, so no fixture guard can catch a level-1 heading; only this can.
// ---------------------------------------------------------------------------
describe('what the editor was actually observed to produce', () => {
	const CAPTURED = JSON.parse(
		readFileSync(new URL('./fixtures/pasted-nested-list.json', import.meta.url), 'utf8')
	).item;

	it('is byte-identical to what the schema builder produces for the same content', () => {
		expect(
			editorDoc(
				itemSchema,
				pmDoc(
					pmHeading(3, pmText('Was h1')),
					pmBullets(
						pmItem(
							pmPara(pmText('Materials')),
							pmNumbers(
								pmItem(pmPara(pmText('250 mL beaker'))),
								pmItem(pmPara(pmText('Digital scale')))
							)
						),
						pmItem(pmPara(pmText('Method')))
					),
					pmPara()
				)
			)
		).toEqual(CAPTURED);
	});

	it('clamped the pasted h1 to an h3 before the server ever saw it', () => {
		expect(CAPTURED.content[0]).toEqual({
			type: 'heading',
			attrs: { level: 3 },
			content: [{ type: 'text', text: 'Was h1' }]
		});
	});

	it('puts the sublist INSIDE the list item, never beside it', () => {
		const list = CAPTURED.content[1];
		expect(list.type).toBe('bulletList');
		// Positive control: the list has two children and BOTH are list items.
		expect(list.content).toHaveLength(2);
		expect(list.content.map((n: { type: string }) => n.type)).toEqual(['listItem', 'listItem']);
		expect(list.content[0].content[1].type).toBe('orderedList');
	});

	it('normalizes to a heading and four readable items, not one run-on word', () => {
		expect(docText(ok(CAPTURED)).split('\n')).toEqual([
			'Was h1',
			'Materials',
			'250 mL beaker',
			'Digital scale',
			'Method'
		]);
	});
});