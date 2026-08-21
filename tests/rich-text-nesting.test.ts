// tests/rich-text-nesting.test.ts
//
// A NESTED LIST, END TO END: the real editor schema -> the real normalizer ->
// the real SQL gate on real embedded Postgres -> the real RPC -> a real read
// back -> the real renderer. Both features, one file, because the two sides
// share the walk and a construct covered on one and forgotten on the other is
// exactly how they drift.
//
// WHY THIS EARNS A TEST, against this repo's default of verifying by dev
// harness. Every failure mode in this chain is SILENT, and the last one to
// ship here proves it: b57b61d's walk spliced a sublist's items into its
// parent as siblings, and before that they were concatenated into one
// unreadable word. Neither was visible until somebody read a note back, and
// the suite stayed green through both because every assertion stopped one
// layer short -- the normalizer's return value, or the gate's answer, never
// the whole path.
//
//   * A LEVEL LOST ON WRITE cannot be recovered. `notebook_entry_notes` is
//     append-only with no UPDATE grant; a flattened revision is what the
//     student wrote, permanently.
//   * A LEVEL LOST ON REOPEN is worse, because nothing was pasted: opening a
//     stored note in the editor goes through `docToTiptap`, and an item whose
//     sublist did not come back out arrives one level flatter the next time it
//     is saved. The classroom does not even need an edit -- a publish toggle
//     re-sends the stored document through `normalizeItemDoc`, which round
//     trips it through `docToTiptap` on the way.
//   * A CLIENT PROJECTION THAT DISAGREES WITH THE COLUMN is invisible on the
//     page and wrong everywhere the text is read. `classroom_items.body` is
//     derived by `_classroom_doc_text` INSIDE the write RPCs (a caller's
//     `p_body` is ignored when a document is supplied), so `docText` in
//     TypeScript is a claim about what the database will store, not a
//     convenience. It is put to the SQL function here, case for case.
//
// WHERE THE FIXTURES COME FROM. Every editor document is built through
// `@tiptap/core`'s own `getSchema` over the SAME options object the shipping
// editors are configured with (tests/rich-text-fixtures.ts), so nothing here
// is a document ProseMirror could not hold -- the failure mode that let the
// original nested-list defect stay green for two releases. The EXPECTED stored
// shapes are hand-written: they are the claim, and deriving them from the walk
// would be asking the walk whether it agrees with itself.
//
// MUTATION-CHECKED: see the record at the end of this file.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ItemBody from '$lib/classroom/ItemBody.svelte';
import NoteContent from '$lib/notebook/NoteContent.svelte';
import {
	ITEM_LIST_MAX_DEPTH,
	docText as itemDocText,
	docToTiptap as itemDocToTiptap,
	type ItemDoc
} from '$lib/classroom/classroom-doc';
import {
	NOTE_LIST_MAX_DEPTH,
	docText as noteDocText,
	docToTiptap as noteDocToTiptap,
	type NoteDoc
} from '$lib/notebook-notes';
import { itemBodyColumns, normalizeItemDoc } from '$lib/server/classroom-doc';
import { normalizeNoteDoc } from '$lib/server/notebook-notes';
import {
	MIGRATIONS as NOTE_CHAIN,
	createClassroomSection,
	createUser,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';
import {
	editorDoc,
	itemSchema,
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

/** 0122 widens both gates, so every chain here carries it. */
const NESTING = '0122_rich_text_nested_lists.sql';

/** The classroom chain through 0110, so the RPCs driven below are the shipping ones. */
const ITEM_CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0086_classroom_assignment_engine.sql',
	'0090_classroom_instructor_materials.sql',
	'0092_classroom_reference_specs.sql',
	'0095_classroom_leveled_rubrics.sql',
	'0101_classroom_decks.sql',
	'0102_classroom_deck_uploads.sql',
	'0104_classroom_edit_visibility.sql',
	'0108_classroom_rich_body.sql',
	'0109_classroom_scheduled_posting.sql',
	'0110_classroom_content_revisions.sql',
	NESTING
] as const;

// ===========================================================================
// The arrangements
//
// One instance of every construct each side permits, at every nesting
// arrangement it permits it in. The `stored` shape is what BOTH normalizers
// must produce, since a note and a body differ only by the block types they
// allow and none of these use one.
// ===========================================================================

interface Arrangement {
	label: string;
	json: unknown;
	/**
	 * Typed as the WIDER of the two closed shapes. Everything in ARRANGEMENTS
	 * is also a legal note -- none of them uses a heading -- and `asNote` is
	 * the check that keeps that true rather than assumed.
	 */
	stored: ItemDoc;
	/** The plain text the projection must read, one line per block and item. */
	text: string;
}

/** Is this an arrangement a NOTE can hold? A note has no headings. */
function noteCanHold(a: Arrangement): boolean {
	return !a.stored.some((b) => b.type === 'h3' || b.type === 'h4');
}

/** The same document as a NOTE, refusing loudly if it is not one. */
function asNote(a: Arrangement): NoteDoc {
	if (!noteCanHold(a)) throw new Error(`"${a.label}" is not a shape a note can hold`);
	return a.stored as NoteDoc;
}

const ARRANGEMENTS: Arrangement[] = [
	{
		label: 'a bulleted sublist under a bullet',
		json: pmDoc(
			pmBullets(
				pmItem(
					pmPara(pmText('Materials')),
					pmBullets(
						pmItem(pmPara(pmText('250 mL beaker'))),
						pmItem(pmPara(pmText('Digital scale')))
					)
				),
				pmItem(pmPara(pmText('Method')))
			)
		),
		stored: [
			{
				type: 'ul',
				items: [
					[
						{ text: 'Materials' },
						{ type: 'ul', items: [[{ text: '250 mL beaker' }], [{ text: 'Digital scale' }]] }
					],
					[{ text: 'Method' }]
				]
			}
		],
		text: 'Materials\n250 mL beaker\nDigital scale\nMethod'
	},
	{
		label: 'a numbered sublist under a bullet',
		json: pmDoc(
			pmBullets(
				pmItem(
					pmPara(pmText('Method')),
					pmNumbers(pmItem(pmPara(pmText('Weigh it'))), pmItem(pmPara(pmText('Record it'))))
				)
			)
		),
		stored: [
			{
				type: 'ul',
				items: [
					[
						{ text: 'Method' },
						{ type: 'ol', items: [[{ text: 'Weigh it' }], [{ text: 'Record it' }]] }
					]
				]
			}
		],
		text: 'Method\nWeigh it\nRecord it'
	},
	{
		label: 'a bulleted sublist under a numbered item',
		json: pmDoc(
			pmNumbers(
				pmItem(
					pmPara(pmText('Set up')),
					pmBullets(pmItem(pmPara(pmText('Goggles'))), pmItem(pmPara(pmText('Apron'))))
				),
				pmItem(pmPara(pmText('Measure')))
			)
		),
		stored: [
			{
				type: 'ol',
				items: [
					[
						{ text: 'Set up' },
						{ type: 'ul', items: [[{ text: 'Goggles' }], [{ text: 'Apron' }]] }
					],
					[{ text: 'Measure' }]
				]
			}
		],
		text: 'Set up\nGoggles\nApron\nMeasure'
	},
	{
		label: 'a numbered sublist under a numbered item',
		json: pmDoc(
			pmNumbers(pmItem(pmPara(pmText('Calibrate')), pmNumbers(pmItem(pmPara(pmText('Zero it'))))))
		),
		stored: [
			{
				type: 'ol',
				items: [[{ text: 'Calibrate' }, { type: 'ol', items: [[{ text: 'Zero it' }]] }]]
			}
		],
		text: 'Calibrate\nZero it'
	},
	{
		label: 'three levels, each a level of its own',
		json: pmDoc(
			pmBullets(
				pmItem(
					pmPara(pmText('Bench')),
					pmBullets(
						pmItem(
							pmPara(pmText('Glassware')),
							pmBullets(pmItem(pmPara(pmText('Beaker'))), pmItem(pmPara(pmText('Cylinder'))))
						)
					)
				)
			)
		),
		stored: [
			{
				type: 'ul',
				items: [
					[
						{ text: 'Bench' },
						{
							type: 'ul',
							items: [
								[
									{ text: 'Glassware' },
									{ type: 'ul', items: [[{ text: 'Beaker' }], [{ text: 'Cylinder' }]] }
								]
							]
						}
					]
				]
			}
		],
		text: 'Bench\nGlassware\nBeaker\nCylinder'
	},
	{
		label: 'two sublists under one item, in the order they were written',
		json: pmDoc(
			pmBullets(
				pmItem(
					pmPara(pmText('Bring')),
					pmBullets(pmItem(pmPara(pmText('Ruler')))),
					pmNumbers(pmItem(pmPara(pmText('Pencil'))))
				)
			)
		),
		stored: [
			{
				type: 'ul',
				items: [
					[
						{ text: 'Bring' },
						{ type: 'ul', items: [[{ text: 'Ruler' }]] },
						{ type: 'ol', items: [[{ text: 'Pencil' }]] }
					]
				]
			}
		],
		text: 'Bring\nRuler\nPencil'
	},
	{
		// `listItem` is `paragraph block*`, so both paragraphs and the sublist
		// are one item in the EDITOR. The stored shape gives each paragraph its
		// own item and hangs the sublist off the last one, which is document
		// order. See the note on `listItems`: an item holding two paragraphs is
		// the limit 0122 accepted deliberately.
		label: 'a sublist under the second paragraph of one item',
		json: pmDoc(
			pmBullets(
				pmItem(
					pmPara(pmText('First half')),
					pmPara(pmText('Second half')),
					pmBullets(pmItem(pmPara(pmText('Under the second'))))
				)
			)
		),
		stored: [
			{
				type: 'ul',
				items: [
					[{ text: 'First half' }],
					[{ text: 'Second half' }, { type: 'ul', items: [[{ text: 'Under the second' }]] }]
				]
			}
		],
		text: 'First half\nSecond half\nUnder the second'
	},
	{
		// A bullet with no text of its own, holding an indented list. A paste
		// can carry it, so the walk has to answer for it: the level survives as
		// an item holding only the sublist, rather than being hoisted into its
		// parent. Its projected line therefore OPENS WITH A NEWLINE, which is
		// what `_classroom_doc_text`'s `btrim` (spaces only) keeps and
		// JavaScript's `trim` would have eaten.
		label: 'an empty bullet holding a sublist',
		json: pmDoc(pmBullets(pmItem(pmPara(), pmBullets(pmItem(pmPara(pmText('Indented'))))))),
		stored: [{ type: 'ul', items: [[{ type: 'ul', items: [[{ text: 'Indented' }]] }]] }],
		text: '\nIndented'
	},
	{
		label: 'marks and a safe link inside a nested item',
		json: pmDoc(
			pmBullets(
				pmItem(
					pmPara(pmText('Read')),
					pmBullets(
						pmItem(
							pmPara(
								pmText('the '),
								pmText('whole', [pmBold]),
								pmText(' brief, '),
								pmText('carefully', [pmItalic]),
								pmText(', from '),
								pmText('the table', [pmLink('https://example.com/tolerances')])
							)
						)
					)
				)
			)
		),
		stored: [
			{
				type: 'ul',
				items: [
					[
						{ text: 'Read' },
						{
							type: 'ul',
							items: [
								[
									{ text: 'the ' },
									{ text: 'whole', bold: true },
									{ text: ' brief, ' },
									{ text: 'carefully', italic: true },
									{ text: ', from ' },
									{ text: 'the table', href: 'https://example.com/tolerances' }
								]
							]
						}
					]
				]
			}
		],
		text: 'Read\nthe whole brief, carefully, from the table'
	},
	{
		label: 'paragraphs around a list that has a sublist',
		json: pmDoc(
			pmPara(pmText('Before.')),
			pmBullets(
				pmItem(pmPara(pmText('Middle')), pmBullets(pmItem(pmPara(pmText('Deeper'))))),
				pmItem(pmPara(pmText('After the sublist')))
			),
			pmPara(pmText('After.'))
		),
		stored: [
			{ type: 'p', runs: [{ text: 'Before.' }] },
			{
				type: 'ul',
				items: [
					[{ text: 'Middle' }, { type: 'ul', items: [[{ text: 'Deeper' }]] }],
					[{ text: 'After the sublist' }]
				]
			},
			{ type: 'p', runs: [{ text: 'After.' }] }
		],
		text: 'Before.\nMiddle\nDeeper\nAfter the sublist\nAfter.'
	}
];

/** The same, for constructs only an item body can hold. */
const ITEM_ONLY_ARRANGEMENTS: Arrangement[] = [
	{
		label: 'a heading above a list with a sublist',
		json: pmDoc(
			pmHeading(3, pmText('Bring')),
			pmBullets(
				pmItem(pmPara(pmText('Graph paper')), pmBullets(pmItem(pmPara(pmText('Sharp pencil')))))
			)
		),
		stored: [
			{ type: 'h3', runs: [{ text: 'Bring' }] },
			{
				type: 'ul',
				items: [[{ text: 'Graph paper' }, { type: 'ul', items: [[{ text: 'Sharp pencil' }]] }]]
			}
		],
		text: 'Bring\nGraph paper\nSharp pencil'
	}
];

// ===========================================================================
// Depth
// ===========================================================================

/** An editor document nested `levels` lists deep, one item per level. */
function deepEditorDoc(levels: number): unknown {
	let node = pmBullets(pmItem(pmPara(pmText(`level ${levels}`))));
	for (let l = levels - 1; l >= 1; l--) {
		node = pmBullets(pmItem(pmPara(pmText(`level ${l}`)), node));
	}
	return pmDoc(node);
}

/** A STORED document whose deepest list sits at nesting depth `depth`. */
function storedNest(depth: number): NoteDoc & ItemDoc {
	let node: Record<string, unknown> = {
		type: 'ul',
		items: [[{ text: `level ${depth}` }]]
	};
	for (let d = depth - 1; d >= 1; d--) {
		node = { type: 'ul', items: [[{ text: `level ${d}` }, node]] };
	}
	return [node] as unknown as NoteDoc & ItemDoc;
}

/** How deep does this document's list nesting actually go? Counted, not assumed. */
function measuredDepth(doc: unknown): number {
	const walkList = (items: unknown, depth: number): number => {
		if (!Array.isArray(items)) return depth;
		let deepest = depth;
		for (const item of items) {
			if (!Array.isArray(item)) continue;
			for (const node of item) {
				if (node && typeof node === 'object' && 'type' in node) {
					deepest = Math.max(deepest, walkList((node as { items: unknown }).items, depth + 1));
				}
			}
		}
		return deepest;
	};
	if (!Array.isArray(doc)) return 0;
	let deepest = 0;
	for (const block of doc) {
		if (block && typeof block === 'object' && 'items' in block) {
			deepest = Math.max(deepest, walkList((block as { items: unknown }).items, 1));
		}
	}
	return deepest;
}

// ===========================================================================
// Rendering
// ===========================================================================

/**
 * The shipping component, server-rendered, with Svelte's own hydration markers
 * stripped -- they are an implementation detail of the renderer and nothing in
 * a note or a body can produce an HTML comment of its own, since every run is
 * escaped text. Same treatment classroom-body-render.test.ts gives it.
 */
function renderNote(doc: NoteDoc): string {
	return render(NoteContent, { props: { doc } }).body.replace(/<!--[\s\S]*?-->/g, '');
}

function renderItem(doc: ItemDoc): string {
	return render(ItemBody, { props: { item: { body: '', body_doc: doc } } }).body.replace(
		/<!--[\s\S]*?-->/g,
		''
	);
}

type Outline = (string | Outline)[];

/**
 * The rendered list structure, as nesting rather than as a substring.
 *
 * A `<ul>` becomes an array, an `<li>` becomes its text followed by whatever
 * lists it CONTAINS. That is the whole point: the interim walk's output and
 * this bundle's output contain exactly the same words, and differ only in
 * which element encloses which -- so an assertion that reads the text out of
 * the markup cannot tell them apart, and this one can.
 */
function outline(html: string): Outline {
	const stack: Outline[] = [[]];
	for (const t of html.matchAll(/<(\/?)([a-z0-9]+)\b[^>]*>|([^<]+)/g)) {
		const [, closing, tag, text] = t;
		if (text !== undefined) {
			const trimmed = text.replace(/\s+/g, ' ').trim();
			if (trimmed) stack[stack.length - 1].push(trimmed);
			continue;
		}
		// Only the list structure is the subject here. An <li>'s own text lands
		// in the list it belongs to, in order, and a nested list opens its own
		// array right after it; everything else (the wrapper div, <strong>, an
		// <a>) is chrome this outline deliberately does not carry.
		if (tag !== 'ul' && tag !== 'ol') continue;
		if (closing) {
			if (stack.length > 1) stack.pop();
		} else {
			const child: Outline = [];
			stack[stack.length - 1].push(child);
			stack.push(child);
		}
	}
	return stack[0];
}

// ===========================================================================
// 1. THE WALK AND THE ROUND TRIP -- no database needed
// ===========================================================================

describe('the normalizer emits a nested list, on both sides', () => {
	function normalizedNote(json: unknown): NoteDoc {
		const result = normalizeNoteDoc(editorDoc(noteSchema, json));
		if (!result.ok) throw new Error(`refused: ${result.error}`);
		return result.doc;
	}

	function normalizedItem(json: unknown): ItemDoc {
		const result = normalizeItemDoc(editorDoc(itemSchema, json));
		if (!result.ok) throw new Error(`refused: ${result.error}`);
		return result.doc;
	}

	it.each(ARRANGEMENTS.map((a) => [a.label, a] as const))(
		'stores %s, both as a note and as an item body',
		(_label, a) => {
			expect(normalizedNote(a.json)).toEqual(a.stored);
			expect(normalizedItem(a.json)).toEqual(a.stored);
		}
	);

	it.each(ITEM_ONLY_ARRANGEMENTS.map((a) => [a.label, a] as const))(
		'stores %s as an item body',
		(_label, a) => {
			expect(normalizedItem(a.json)).toEqual(a.stored);
		}
	);

	// The sweep's own positive control: an arrangement list that generated
	// nothing would pass every `it.each` above silently.
	it('covers every arrangement it claims to', () => {
		expect(ARRANGEMENTS).toHaveLength(10);
		expect(ITEM_ONLY_ARRANGEMENTS).toHaveLength(1);
		// And every one of them really nests, so none of these cases is a flat
		// document dressed up as coverage.
		const flat = [...ARRANGEMENTS, ...ITEM_ONLY_ARRANGEMENTS].filter(
			(a) => measuredDepth(a.stored) < 2
		);
		expect(flat.map((a) => a.label)).toEqual([]);
	});

	// THE PROPERTY THE INTERIM WALK BROKE, stated so it cannot come back
	// quietly: a sublist's items are the parent ITEM's children, never more
	// items of the parent LIST.
	it('never emits a sublist item as a sibling of the item it hangs off', () => {
		const doc = normalizedNote(ARRANGEMENTS[0].json);
		expect(doc[0].type).toBe('ul');
		const list = doc[0] as { items: unknown[] };
		// Two items, not four: 'Materials' and 'Method'. The interim walk
		// produced four.
		expect(list.items).toHaveLength(2);
		expect(measuredDepth(doc)).toBe(2);
	});

	it.each([...ARRANGEMENTS, ...ITEM_ONLY_ARRANGEMENTS].map((a) => [a.label, a] as const))(
		'reads %s back into the editor and stores the identical document again',
		(_label, a) => {
			// The reopen path: stored -> editor JSON -> normalizer. A level lost
			// here costs the author their indentation on the next save, with
			// nothing pasted and nothing edited.
			const stored = normalizedItem(a.json);
			const reopened = normalizeItemDoc(itemDocToTiptap(stored));
			expect(reopened.ok).toBe(true);
			if (reopened.ok) expect(reopened.doc).toEqual(stored);

			if (noteCanHold(a)) {
				const note = normalizedNote(a.json);
				const back = normalizeNoteDoc(noteDocToTiptap(note));
				expect(back.ok).toBe(true);
				if (back.ok) expect(back.doc).toEqual(note);
			}
		}
	);

	it('round trips a reopened document through the REAL editor schema', () => {
		// `docToTiptap` claims to produce editor JSON; `editorDoc` is what makes
		// that claim testable, since ProseMirror refuses an arrangement its
		// schema cannot hold. A sublist emitted as a sibling of its list items
		// would be refused here rather than merely looking wrong.
		for (const a of ARRANGEMENTS) {
			const stored = normalizedNote(a.json);
			expect(() => editorDoc(noteSchema, noteDocToTiptap(stored)), a.label).not.toThrow();
		}
		for (const a of [...ARRANGEMENTS, ...ITEM_ONLY_ARRANGEMENTS]) {
			const stored = normalizedItem(a.json);
			expect(() => editorDoc(itemSchema, itemDocToTiptap(stored)), a.label).not.toThrow();
		}
	});

	it.each([...ARRANGEMENTS, ...ITEM_ONLY_ARRANGEMENTS].map((a) => [a.label, a] as const))(
		'projects %s to one line per item, at every level',
		(_label, a) => {
			expect(itemDocText(a.stored)).toBe(a.text);
			if (noteCanHold(a)) {
				// The two mirrors are one walk with two caps; a document inside
				// both caps must read identically through either.
				expect(noteDocText(asNote(a))).toBe(a.text);
			}
		}
	);
});

describe('the depth the walk can emit', () => {
	/**
	 * MEASURED, not derived. `maxDepth` counts ProseMirror TREE levels and one
	 * list level costs two of them, so the reach is a consequence of the
	 * arithmetic rather than a number anybody chose -- which is exactly why it
	 * is pinned here. What MATTERS is the assertion beside it: whatever the
	 * walk emits, the gate accepts (proved against Postgres below). This number
	 * only catches the reach changing silently.
	 */
	const NOTE_EMITS = 5;
	const ITEM_EMITS = 7;

	it('emits deeper lists for a body than for a note, and stops at its ceiling', () => {
		const noteDepths: number[] = [];
		const itemDepths: number[] = [];
		for (let levels = 1; levels <= 20; levels++) {
			const json = deepEditorDoc(levels);
			const note = normalizeNoteDoc(editorDoc(noteSchema, json));
			const item = normalizeItemDoc(editorDoc(itemSchema, json));
			expect(note.ok, `a ${levels}-level note must still normalize`).toBe(true);
			expect(item.ok, `a ${levels}-level body must still normalize`).toBe(true);
			if (note.ok) noteDepths.push(measuredDepth(note.doc));
			if (item.ok) itemDepths.push(measuredDepth(item.doc));
		}

		expect(noteDepths).toHaveLength(20);
		// It follows the author exactly up to its ceiling and then stops there.
		expect(noteDepths.slice(0, NOTE_EMITS)).toEqual([1, 2, 3, 4, 5].slice(0, NOTE_EMITS));
		expect(new Set(noteDepths.slice(NOTE_EMITS))).toEqual(new Set([NOTE_EMITS]));
		expect(itemDepths.slice(0, ITEM_EMITS)).toEqual([1, 2, 3, 4, 5, 6, 7].slice(0, ITEM_EMITS));
		expect(new Set(itemDepths.slice(ITEM_EMITS))).toEqual(new Set([ITEM_EMITS]));

		// AND THE ASYMMETRY THAT MATTERS: what the walk emits sits well inside
		// what the gate accepts, which is the direction that must never
		// reverse. A gate tighter than the walk refuses a legitimate save.
		expect(NOTE_EMITS).toBeLessThanOrEqual(NOTE_LIST_MAX_DEPTH);
		expect(ITEM_EMITS).toBeLessThanOrEqual(ITEM_LIST_MAX_DEPTH);
	});

	it('drops the text past its ceiling rather than emitting a level it cannot fill', () => {
		const item = normalizeItemDoc(editorDoc(itemSchema, deepEditorDoc(ITEM_EMITS + 2)));
		expect(item.ok).toBe(true);
		if (!item.ok) return;
		const text = itemDocText(item.doc);
		// Every level it kept is readable, in order...
		expect(text.split('\n')).toEqual(
			Array.from({ length: ITEM_EMITS }, (_, i) => `level ${i + 1}`)
		);
		// ...and nothing below the ceiling arrives half-formed: there is no
		// empty list and no empty item anywhere in the result.
		expect(JSON.stringify(item.doc)).not.toContain('"items":[]');
		expect(JSON.stringify(item.doc)).not.toContain('[[]]');
	});

	it('renders to the stored cap and no further', () => {
		// At the cap: every level is a real <ul>.
		const atCap = storedNest(ITEM_LIST_MAX_DEPTH);
		expect(measuredDepth(atCap)).toBe(ITEM_LIST_MAX_DEPTH);
		const html = renderItem(atCap);
		expect([...html.matchAll(/<ul/g)]).toHaveLength(ITEM_LIST_MAX_DEPTH);
		expect(html).toContain(`level ${ITEM_LIST_MAX_DEPTH}`);

		// One past it -- a document no gate would have stored, which is exactly
		// the case a renderer must not trust the gate about. The deepest list
		// is not rendered; everything above it still is.
		const overCap = storedNest(ITEM_LIST_MAX_DEPTH + 1);
		const over = renderItem(overCap);
		expect([...over.matchAll(/<ul/g)]).toHaveLength(ITEM_LIST_MAX_DEPTH);
		expect(over).toContain(`level ${ITEM_LIST_MAX_DEPTH}`);
		expect(over).not.toContain(`level ${ITEM_LIST_MAX_DEPTH + 1}`);

		// The note's cap is its own, and lower.
		const noteOver = renderNote(storedNest(NOTE_LIST_MAX_DEPTH + 1) as NoteDoc);
		expect([...noteOver.matchAll(/<ul/g)]).toHaveLength(NOTE_LIST_MAX_DEPTH);
		expect(noteOver).not.toContain(`level ${NOTE_LIST_MAX_DEPTH + 1}`);
	});
});

// ===========================================================================
// 2. THE RENDERERS -- what a browser actually receives
// ===========================================================================

describe('the renderers put a sublist inside the item it hangs off', () => {
	const NESTED = ARRANGEMENTS[0];

	it('renders the notebook note as a <ul> whose item CONTAINS a <ul>', () => {
		const html = renderNote(asNote(NESTED));
		expect(outline(html)).toEqual([
			['Materials', ['250 mL beaker', 'Digital scale'], 'Method']
		]);
		// The interim shape would have been one flat list of four items; the
		// count is what says which one this is.
		expect([...html.matchAll(/<ul/g)]).toHaveLength(2);
		expect([...html.matchAll(/<li/g)]).toHaveLength(4);
	});

	it('renders the classroom body the same way, through its own component', () => {
		const html = renderItem(NESTED.stored);
		expect(outline(html)).toEqual([
			['Materials', ['250 mL beaker', 'Digital scale'], 'Method']
		]);
		expect([...html.matchAll(/<ul/g)]).toHaveLength(2);
	});

	it('keeps a numbered sublist a real <ol> inside a bulleted <li>', () => {
		const html = renderItem(ARRANGEMENTS[1].stored);
		expect(html).toMatch(/<ul[^>]*>[\s\S]*<ol[^>]*>[\s\S]*<\/ol>[\s\S]*<\/ul>/);
		expect(outline(html)).toEqual([['Method', ['Weigh it', 'Record it']]]);
	});

	it('renders marks and a safe link inside a nested item', () => {
		const html = renderItem(ARRANGEMENTS[8].stored);
		const inner = html.match(/<ul[^>]*>[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/);
		expect(inner).not.toBeNull();
		expect(inner![1]).toMatch(/<strong[^>]*>whole<\/strong>/);
		expect(inner![1]).toMatch(/<em[^>]*>carefully<\/em>/);
		expect(inner![1]).toMatch(/href="https:\/\/example\.com\/tolerances"/);
		expect(inner![1]).toMatch(/rel="noopener noreferrer"/);
	});

	it('renders an unsafe href inside a nested item as plain text, never as a link', () => {
		// The renderer is the LAST of the three gates and must hold on its own:
		// this document reached it without passing either of the other two.
		const hostile: ItemDoc = [
			{
				type: 'ul',
				items: [
					[
						{ text: 'Outer' },
						{
							type: 'ul',
							items: [[{ text: 'Click me', href: 'javascript:alert(1)' }]]
						}
					]
				]
			}
		];
		const html = renderItem(hostile);
		expect(html).toContain('Click me');
		expect(html).not.toContain('javascript:');
		expect(html).not.toContain('<a ');
		expect(renderNote(hostile as unknown as NoteDoc)).not.toContain('javascript:');
	});

	it('escapes markup written inside a nested item', () => {
		const doc: ItemDoc = [
			{
				type: 'ul',
				items: [[{ text: 'A' }, { type: 'ul', items: [[{ text: '<script>alert(1)</script>' }]] }]]
			}
		];
		const html = renderItem(doc);
		expect(html).not.toContain('<script');
		expect(html).toContain('&lt;script');
	});
});

// ===========================================================================
// 3. THE CLASSROOM PATH -- gate, RPC, read back, render
// ===========================================================================

describe('a nested body survives the whole classroom path', () => {
	let db: TestDb;
	let teacher: SeededUser;
	let section: string;

	async function sqlDocText(doc: unknown): Promise<string> {
		const { rows } = await db.sql<{ t: string }>(
			'select public._classroom_doc_text($1::jsonb) as t',
			[doc === undefined ? null : JSON.stringify(doc)]
		);
		return rows[0].t;
	}

	async function gate(doc: unknown): Promise<boolean> {
		const { rows } = await db.sql<{ ok: boolean }>(
			'select public._classroom_doc_ok($1::jsonb) as ok',
			[doc === undefined ? null : JSON.stringify(doc)]
		);
		return rows[0].ok;
	}

	beforeAll(async () => {
		db = await startTestDb(ITEM_CHAIN);
		teacher = await createUser(db, 'vargas@boscotech.edu', 'T. Vargas');
		const course = await db.asUser(teacher.id, async (q) => {
			const { rows } = await q<{ result: { course_id: string } }>(
				"select public.classroom_upsert_course('IDEA209H', 'Engineering') as result"
			);
			return rows[0].result.course_id;
		});
		section = await db.asUser(teacher.id, async (q) => {
			const { rows } = await q<{ result: { section_id: string } }>(
				"select public.classroom_upsert_section($1::uuid, 'Period 2', 'B') as result",
				[course]
			);
			return rows[0].result.section_id;
		});
	}, 180_000);

	afterAll(async () => {
		await db?.stop();
	});

	it('accepts every document the walk can emit, at every depth the walk reaches', async () => {
		// The asymmetry, proved against the database rather than argued from
		// the arithmetic: a gate narrower than the walk breaks every save.
		for (let levels = 1; levels <= 20; levels++) {
			const shaped = normalizeItemDoc(editorDoc(itemSchema, deepEditorDoc(levels)));
			expect(shaped.ok).toBe(true);
			if (!shaped.ok) continue;
			expect(await gate(shaped.doc), `a ${levels}-level paste must be storable`).toBe(true);
		}
		for (const a of [...ARRANGEMENTS, ...ITEM_ONLY_ARRANGEMENTS]) {
			expect(await gate(a.stored), a.label).toBe(true);
		}
	});

	it('derives the SAME plain text as the TypeScript mirror, case for case', async () => {
		// `classroom_items.body` is what the stream, the announcement fallback,
		// the feed and the export read, and the RPC derives it with the SQL
		// function -- so the mirror is a claim about the column. The corners
		// are included on purpose: the corners are where a rewritten walk
		// drifts, and one of them (an item whose line opens with a newline) is
		// the reason the trim here is `btrim` rather than `trim`.
		const corpus: { label: string; doc: unknown }[] = [
			...[...ARRANGEMENTS, ...ITEM_ONLY_ARRANGEMENTS].map((a) => ({
				label: a.label,
				doc: a.stored
			})),
			{ label: 'at the stored cap', doc: storedNest(ITEM_LIST_MAX_DEPTH) },
			{ label: 'one past the stored cap', doc: storedNest(ITEM_LIST_MAX_DEPTH + 1) },
			{ label: 'far past the stored cap', doc: storedNest(ITEM_LIST_MAX_DEPTH + 6) },
			{ label: 'an empty document', doc: [] },
			{ label: 'a list with no items', doc: [{ type: 'p', runs: [{ text: 'x' }] }, { type: 'ul', items: [] }] },
			{ label: 'a list with one empty item', doc: [{ type: 'ul', items: [[]] }] },
			{
				label: 'an empty item above a real one',
				doc: [{ type: 'ul', items: [[], [{ text: 'second' }]] }]
			},
			{
				label: 'an item holding an EMPTY sublist',
				doc: [{ type: 'ul', items: [[{ text: 'own' }, { type: 'ul', items: [] }]] }]
			},
			{
				label: 'an item holding a sublist of one empty item',
				doc: [{ type: 'ul', items: [[{ text: 'own' }, { type: 'ul', items: [[]] }]] }]
			},
			{
				label: 'a run AFTER a sublist, which the walk never emits',
				doc: [
					{
						type: 'ul',
						items: [[{ text: 'before' }, { type: 'ul', items: [[{ text: 'in' }]] }, { text: 'after' }]]
					}
				]
			},
			{
				label: 'a block with no runs key at all',
				doc: [{ type: 'p' }, { type: 'p', runs: [{ text: 'after' }] }]
			},
			{ label: 'a heading and a paragraph', doc: [{ type: 'h3', runs: [{ text: 'H' }] }, { type: 'p', runs: [{ text: 'p' }] }] }
		];

		const disagreed: { label: string; sql: string; ts: string }[] = [];
		for (const c of corpus) {
			const sql = await sqlDocText(c.doc);
			const ts = itemDocText(c.doc as ItemDoc);
			if (sql !== ts) disagreed.push({ label: c.label, sql, ts });
		}
		expect(disagreed).toEqual([]);

		// POSITIVE CONTROL on the sweep: it must have compared something, and
		// the comparisons must not all be the empty string -- which is what a
		// mirror that returned '' for everything would agree with.
		expect(corpus).toHaveLength(23);
		const nonEmpty = await Promise.all(corpus.map((c) => sqlDocText(c.doc)));
		expect(nonEmpty.filter((t) => t !== '' && t !== null).length).toBeGreaterThan(15);
		// And the one corner the trim is about really does open with a newline
		// on BOTH sides, rather than agreeing because both stripped it.
		const orphan = ARRANGEMENTS.find((a) => a.label === 'an empty bullet holding a sublist')!;
		expect(await sqlDocText(orphan.stored)).toBe('\nIndented');
		expect(itemDocText(orphan.stored)).toBe('\nIndented');
	});

	it('writes a nested body through the real RPC and renders what came back', async () => {
		const shaped = itemBodyColumns(editorDoc(itemSchema, ARRANGEMENTS[0].json));
		expect(shaped.ok).toBe(true);
		if (!shaped.ok) return;

		const row = await db.asUser(teacher.id, async (q) => {
			const created = await q<{ r: { item_id: string } }>(
				`select public.classroom_create_item(
					'assignment', $1::uuid[], 'Bridge sketch', $2, null, null, null,
					true, '[]'::jsonb, false, $3::jsonb) as r`,
				[[section], shaped.body, JSON.stringify(shaped.doc)]
			);
			const read = await q<{ body: string; body_doc: ItemDoc }>(
				'select body, body_doc from public.classroom_items where id = $1',
				[created.rows[0].r.item_id]
			);
			return read.rows[0];
		});

		// The gate did not change it, and the RPC stored the nesting.
		expect(row.body_doc).toEqual(ARRANGEMENTS[0].stored);
		expect(measuredDepth(row.body_doc)).toBe(2);
		// The column the stream reads agrees with the mirror the client uses.
		expect(row.body).toBe(ARRANGEMENTS[0].text);
		expect(row.body).toBe(shaped.body);
		// And the shipping renderer, over the row that came back.
		expect(outline(renderItem(row.body_doc))).toEqual([
			['Materials', ['250 mL beaker', 'Digital scale'], 'Method']
		]);
	});

	it('keeps the nesting through an edit that changes nothing else', async () => {
		// The reopen path against the real RPC: `normalizeItemDoc` routes an
		// already-stored document back through `docToTiptap`, so this is what a
		// publish toggle does to a body nobody edited.
		const shaped = itemBodyColumns(editorDoc(itemSchema, ARRANGEMENTS[4].json));
		expect(shaped.ok).toBe(true);
		if (!shaped.ok) return;

		const itemId = await db.asUser(teacher.id, async (q) => {
			const created = await q<{ r: { item_id: string } }>(
				`select public.classroom_create_item(
					'post', $1::uuid[], null, $2, null, null, null,
					true, '[]'::jsonb, false, $3::jsonb) as r`,
				[[section], shaped.body, JSON.stringify(shaped.doc)]
			);
			return created.rows[0].r.item_id;
		});

		const resaved = itemBodyColumns(shaped.doc);
		expect(resaved.ok).toBe(true);
		if (!resaved.ok) return;
		expect(resaved.doc).toEqual(shaped.doc);

		const row = await db.asUser(teacher.id, async (q) => {
			await q(
				`select public.classroom_update_item(
					p_id => $1::uuid, p_body => $2, p_published => true,
					p_resources => '[]'::jsonb, p_body_doc => $3::jsonb) as r`,
				[itemId, resaved.body, JSON.stringify(resaved.doc)]
			);
			const read = await q<{ body: string; body_doc: ItemDoc }>(
				'select body, body_doc from public.classroom_items where id = $1',
				[itemId]
			);
			return read.rows[0];
		});
		expect(row.body_doc).toEqual(ARRANGEMENTS[4].stored);
		expect(measuredDepth(row.body_doc)).toBe(3);
	});
});

// ===========================================================================
// 4. THE NOTEBOOK PATH -- gate, RPC, read back, render
// ===========================================================================

describe('a nested note survives the whole notebook path', () => {
	let db: TestDb;
	let student: SeededUser;
	let teacher: SeededUser;
	let sectionId: string;

	async function gate(doc: unknown): Promise<boolean | null> {
		const { rows } = await db.sql<{ ok: boolean | null }>(
			'select public._notebook_note_content_ok($1::jsonb) as ok',
			[doc === undefined ? null : JSON.stringify(doc)]
		);
		return rows[0].ok;
	}

	beforeAll(async () => {
		db = await startTestDb([...NOTE_CHAIN, NESTING]);
		student = await createUser(db, 'ramona.pike@boscotech.net', 'Ramona Pike');
		teacher = await createUser(db, 'chair@boscotech.edu', 'Dana Chair');
		sectionId = await createClassroomSection(db, {
			as: teacher,
			courseCode: 'ENG1H',
			courseTitle: 'Engineering I Honors',
			label: 'Period 2',
			teacherEmail: teacher.email
		});
	}, 180_000);

	afterAll(async () => {
		await db?.stop();
	});

	it('accepts every document the walk can emit, at every depth the walk reaches', async () => {
		for (let levels = 1; levels <= 20; levels++) {
			const shaped = normalizeNoteDoc(editorDoc(noteSchema, deepEditorDoc(levels)));
			expect(shaped.ok).toBe(true);
			if (!shaped.ok) continue;
			expect(await gate(shaped.doc), `a ${levels}-level paste must be storable`).toBe(true);
		}
		for (const a of ARRANGEMENTS) {
			expect(await gate(a.stored), a.label).toBe(true);
		}
	});

	it('writes a nested note through the real RPC and renders what came back', async () => {
		const shaped = normalizeNoteDoc(editorDoc(noteSchema, ARRANGEMENTS[0].json));
		expect(shaped.ok).toBe(true);
		if (!shaped.ok) return;

		const stored = await db.asUser(student.id, async (q) => {
			const { rows } = await q<{ result: { entry_id: string } }>(
				'select public.notebook_create_note_entry(p_content => $1::jsonb, p_section_id => $2::uuid) as result',
				[JSON.stringify(shaped.doc), sectionId]
			);
			const read = await q<{ content: NoteDoc }>(
				'select content from public.notebook_entry_notes where entry_id = $1',
				[rows[0].result.entry_id]
			);
			return read.rows[0].content;
		});

		expect(stored).toEqual(ARRANGEMENTS[0].stored);
		expect(measuredDepth(stored)).toBe(2);
		expect(outline(renderNote(stored))).toEqual([
			['Materials', ['250 mL beaker', 'Digital scale'], 'Method']
		]);
	});

	it('keeps the nesting through an edit, which is a new revision', async () => {
		const first = normalizeNoteDoc(editorDoc(noteSchema, ARRANGEMENTS[2].json));
		expect(first.ok).toBe(true);
		if (!first.ok) return;

		const result = await db.asUser(student.id, async (q) => {
			const created = await q<{ result: { entry_id: string } }>(
				'select public.notebook_create_note_entry(p_content => $1::jsonb, p_section_id => $2::uuid) as result',
				[JSON.stringify(first.doc), sectionId]
			);
			const note = await q<{ id: string }>(
				'select id from public.notebook_entry_notes where entry_id = $1',
				[created.rows[0].result.entry_id]
			);
			// The reopen path, exactly as EntryNotes drives it: the stored note
			// is seeded into the editor and normalized back out.
			const reopened = normalizeNoteDoc(noteDocToTiptap(first.doc));
			if (!reopened.ok) throw new Error(reopened.error);
			await q(
				'select public.notebook_edit_note(p_note_id => $1::uuid, p_content => $2::jsonb) as result',
				[note.rows[0].id, JSON.stringify(reopened.doc)]
			);
			const read = await q<{ content: NoteDoc; revision: number }>(
				`select content, revision from public.notebook_entry_notes
				  where entry_id = $1 order by revision desc limit 1`,
				[created.rows[0].result.entry_id]
			);
			return read.rows[0];
		});

		expect(result.revision).toBe(2);
		expect(result.content).toEqual(ARRANGEMENTS[2].stored);
		expect(measuredDepth(result.content)).toBe(2);
	});
});

// ===========================================================================
// MUTATION RECORD
//
// Manually, during this session (the classroom-rich-body.test.ts convention,
// not left as runnable code). Every mutation was confirmed to have reached the
// file before any result was read from it -- by grepping the mutated line out
// of the module and comparing the file's md5 against the original -- and every
// module was restored byte-identically afterwards, with this file re-run fully
// green. See docs/HISTORY.md for the measured counts.
// ===========================================================================
