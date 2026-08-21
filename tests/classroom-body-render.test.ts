// tests/classroom-body-render.test.ts
//
// The item body, from the editor's own JSON all the way to the HTML a student's
// browser receives -- through the REAL normalizer, the REAL SQL gate, the REAL
// `classroom_create_item`, a REAL read back, and the REAL ItemBody component.
//
// WHY THIS FILE EXISTS, and it is a coverage gap rather than a new feature. A
// bulleted list authored in the composer reached a real class rendered as one
// run-on paragraph -- no line breaks, no markers -- while the whole suite
// stayed green. It stayed green because every existing assertion stops one
// layer short of the answer:
//
//   * classroom-item-doc.test.ts checks what the normalizer RETURNS;
//   * classroom-rich-body.test.ts checks what the gate ACCEPTS and what the
//     RPC STORES.
//
// Both were, and are, correct. Nothing asserted what the renderer DOES with
// what was stored, so the one link in the chain that could have been checked
// against the reported symptom never was. `render()` from `svelte/server`
// mounts the shipping component and hands back the markup, so `<ul><li>` is
// asserted as markup rather than inferred from a `{ type: 'ul' }` in a fixture.
//
// THE SECOND HALF IS THE ONE THAT ACTUALLY REPRODUCES THE BUG. `body_doc` is an
// OPTIONAL column: `selectItemsWithDoc` degrades past it on a backend without
// 0108, and `/api/classroom/item` degrades past `p_body_doc` on the way in for
// the same reason. When it is absent, `itemBodyDoc` falls back to converting
// the plain-text column -- and `docText` writes ONE LINE PER LIST ITEM while
// `docFromPlainText` joins single newlines with spaces. That is exactly, and
// only, where "joined inline with no breaks and no markers" comes from. It is
// pinned below so the symptom can never again be mistaken for a normalizer or
// gate defect, and so anyone changing either fallback sees what it costs.
//
// MUTATION-CHECKED (manually, during this session -- the
// classroom-rich-body.test.ts convention, not left as runnable code):
//   * making `blocksFrom` treat bulletList and orderedList as ordinary blocks
//     -- i.e. the bug as it was first assumed to be, structure stripped on
//     write -- reddened 6, including the stored-shape assertion;
//   * dropping the `ul`/`ol` branches from ItemBody so list items render as
//     bare runs reddened 3 and left the stored-shape assertion GREEN, which is
//     exactly the write-vs-render split this file exists to make visible;
//   * making `docFromPlainText` emit one paragraph per line reddened exactly
//     the one degrade assertion that pins the run-on paragraph, and nothing
//     else -- so that assertion is genuinely about the fallback's rule rather
//     than about the text happening to come out right.
// Every module was restored byte-identical after each (git-verified).

import { beforeAll, afterAll, describe, expect, it } from 'vitest';



import { render } from 'svelte/server';
import ItemBody from '$lib/classroom/ItemBody.svelte';
import { itemBodyDoc, type ItemDoc } from '$lib/classroom/classroom-doc';
import { normalizeItemDoc, itemBodyColumns } from '$lib/server/classroom-doc';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
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

const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0090_classroom_instructor_materials.sql',
	'0104_classroom_edit_visibility.sql',
	'0108_classroom_rich_body.sql',
	// The gate that accepts a nested list. Without it the RPC below refuses the
	// document the normalizer now produces, which is the deploy-ordering rule
	// this repo states in reverse: the gate goes first, always.
	'0122_rich_text_nested_lists.sql'
];

// ---------------------------------------------------------------------------
// The document a teacher authors, as the EDITOR emits it.
//
// Every construct the feature supports, in one body: a heading, a nested
// heading, bold, italic, a link, a bulleted list, a numbered list, and a list
// nested inside a list.
//
// BUILT THROUGH THE REAL SCHEMA, never typed out. `editorDoc` runs the JSON
// through `@tiptap/core`'s own `getSchema` over the SAME options object
// `RichTextEditor.svelte` configures StarterKit with, `check()`s the result and
// hands back ProseMirror's OWN serialization of it. So what goes in here is a
// document the composer could genuinely have held, not a shape that happens to
// suit the assertions below. The version this replaces wrote the nested list as
// a SIBLING of its list items -- a document ProseMirror cannot hold at all --
// and every assertion in this file was made against it.
// ---------------------------------------------------------------------------
const EDITOR_DOC = editorDoc(
	itemSchema,
	pmDoc(
		pmHeading(3, pmText('Before you start')),
		pmPara(
			pmText('Read the '),
			pmText('whole', [pmBold]),
			pmText(' brief, '),
			pmText('carefully', [pmItalic]),
			pmText(', and check '),
			pmText('the tolerance table', [pmLink('https://example.com/tolerances')]),
			pmText('.')
		),
		pmHeading(4, pmText('Bring')),
		pmBullets(
			pmItem(pmPara(pmText('A ruler'))),
			// WHERE A NESTED LIST REALLY LIVES: inside the list item above it, as
			// a second block of that item (`listItem` is `paragraph block*`). Since
			// 0122 the stored shape can hold it there too, so the level survives
			// the whole way down to the markup below.
			pmItem(pmPara(pmText('Graph paper')), pmBullets(pmItem(pmPara(pmText('Sharp pencil')))))
		),
		pmNumbers(
			pmItem(pmPara(pmText('Measure '), pmText('twice', [pmBold]))),
			pmItem(pmPara(pmText('Cut once')))
		)
	)
);

// The guard on the fixture itself. The shape this file used to feed the whole
// chain is not something the item-body schema can hold, so nothing can quietly
// go back to asserting against it, and the round trip below cannot again be a
// round trip over a document no editor emits.
describe('the fixture is a document the composer could have produced', () => {
	it('cannot hold a list as a SIBLING of the list items above it', () => {
		const siblingList = pmDoc(
			pmBullets(pmItem(pmPara(pmText('Graph paper'))), pmBullets(pmItem(pmPara(pmText('Sharp pencil')))))
		);
		expect(canHold(itemSchema, siblingList)).toBe(false);
		// POSITIVE CONTROL: the same two bullets, nested where they really live,
		// which is what EDITOR_DOC above is built from.
		const realNesting = pmDoc(
			pmBullets(
				pmItem(pmPara(pmText('Graph paper')), pmBullets(pmItem(pmPara(pmText('Sharp pencil')))))
			)
		);
		expect(canHold(itemSchema, realNesting)).toBe(true);
	});
});

/** What the whole chain should agree the stored document is. */
const EXPECTED_DOC: ItemDoc = [
	{ type: 'h3', runs: [{ text: 'Before you start' }] },
	{
		type: 'p',
		runs: [
			{ text: 'Read the ' },
			{ text: 'whole', bold: true },
			{ text: ' brief, ' },
			{ text: 'carefully', italic: true },
			{ text: ', and check ' },
			{ text: 'the tolerance table', href: 'https://example.com/tolerances' },
			{ text: '.' }
		]
	},
	{ type: 'h4', runs: [{ text: 'Bring' }] },
	{
		type: 'ul',
		items: [
			[{ text: 'A ruler' }],
			// The sublist is stored INSIDE the item it hangs off, not as a third
			// item of this list -- which is what it was until 0122 widened the
			// gate and the walk was taught to fill the wider shape.
			[{ text: 'Graph paper' }, { type: 'ul', items: [[{ text: 'Sharp pencil' }]] }]
		]
	},
	{
		type: 'ol',
		items: [[{ text: 'Measure ' }, { text: 'twice', bold: true }], [{ text: 'Cut once' }]]
	}
];

/**
 * The shipping component, server-rendered.
 *
 * Svelte's SSR output is littered with its own hydration markers
 * (`<!--[-->`, `<!--]-->`, `<!--[0-->`), which are an implementation detail of
 * the renderer and would make every assertion below a test of Svelte's
 * internals. They are stripped; nothing in an item body can produce an HTML
 * comment of its own, since every run is escaped text.
 */
function renderBody(item: { body: string; body_doc?: ItemDoc | null }): string {
	return render(ItemBody, { props: { item } }).body.replace(/<!--[\s\S]*?-->/g, '');
}

/** Tag names in document order -- structure without the class-hash noise. */
function tags(html: string): string[] {
	return [...html.matchAll(/<([a-z0-9]+)[\s>]/g)].map((m) => m[1]);
}

describe('the item body, editor JSON to rendered markup', () => {
	let db: TestDb;
	let teacher: SeededUser;
	let sectionId: string;

	beforeAll(async () => {
		db = await startTestDb(CHAIN);
		teacher = await createUser(db, 'vargas@boscotech.edu', 'T. Vargas');
		await db.asUser(teacher.id, async (q) => {
			const course = await q<{ r: { course_id: string } }>(
				`select public.classroom_upsert_course('IDEA209H', 'Engineering') as r`
			);
			const section = await q<{ r: { section_id: string } }>(
				`select public.classroom_upsert_section($1::uuid, 'Period 2', 'B') as r`,
				[course.rows[0].r.course_id]
			);
			sectionId = section.rows[0].r.section_id;
		});
	}, 180_000);

	afterAll(async () => {
		await db?.stop();
	});

	// -----------------------------------------------------------------------
	// The round trip. One item, created through the real RPC with the real
	// normalizer's output, read back, and rendered.
	// -----------------------------------------------------------------------
	describe('a real round trip through the normalizer, the gate and the RPC', () => {
		let storedDoc: ItemDoc;
		let storedBody: string;
		let html: string;

		beforeAll(async () => {
			// 1. The normalizer, exactly as /api/classroom/item calls it.
			const shaped = itemBodyColumns(EDITOR_DOC);
			expect(shaped.ok).toBe(true);
			if (!shaped.ok) return;

			// 2. The real RPC, which runs `_classroom_doc_ok` on the way in and
			//    would raise rather than store anything the gate refuses.
			await db.asUser(teacher.id, async (q) => {
				const created = await q<{ r: { item_id: string } }>(
					`select public.classroom_create_item(
						'assignment', $1::uuid[], 'Bridge sketch', $2, null, null, null,
						true, '[]'::jsonb, false, $3::jsonb) as r`,
					[[sectionId], shaped.body, JSON.stringify(shaped.doc)]
				);
				const itemId = created.rows[0].r.item_id;

				// 3. Read it back the way a page load does.
				const row = await q<{ body: string; body_doc: ItemDoc }>(
					`select body, body_doc from public.classroom_items where id = $1`,
					[itemId]
				);
				storedBody = row.rows[0].body;
				storedDoc = row.rows[0].body_doc;
			});

			// 4. The shipping renderer, over the row that came back.
			html = renderBody({ body: storedBody, body_doc: storedDoc });
		}, 60_000);

		it('stores the document the normalizer produced, unchanged by the gate or the RPC', () => {
			expect(storedDoc).toEqual(EXPECTED_DOC);
		});

		it('renders the bulleted list as a real <ul> with one <li> per item', () => {
			expect(html).toContain('<li');
			// The OUTER list has two items, and the second one CONTAINS the
			// sublist rather than being followed by it. Matched non-greedily
			// from the outer <ul> to the LAST </ul> so the nested list is inside
			// the span being read, which is the whole difference this asserts.
			const ul = html.match(/<ul[^>]*>([\s\S]*)<\/ul>/);
			expect(ul).not.toBeNull();
			expect(ul![1]).toMatch(/Graph paper[\s\S]*<ul[^>]*>[\s\S]*Sharp pencil/);
			// Two <ul>, one nested inside the other; five <li> in the document,
			// three in the bulleted pair and two in the numbered list below it.
			expect([...html.matchAll(/<ul/g)]).toHaveLength(2);
			expect([...html.matchAll(/<li/g)]).toHaveLength(5);
			// And the sublist's own item is not a sibling of 'A ruler': the
			// outer list closes only after the inner one has.
			expect(html.indexOf('Sharp pencil')).toBeGreaterThan(html.indexOf('Graph paper'));
			expect(html.lastIndexOf('</ul>')).toBeGreaterThan(html.indexOf('Sharp pencil'));
		});

		it('renders the numbered list as a real <ol>, keeping the mark inside an item', () => {
			const ol = html.match(/<ol[^>]*>([\s\S]*?)<\/ol>/);
			expect(ol).not.toBeNull();
			const items = [...ol![1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1].trim());
			expect(items).toHaveLength(2);
			expect(items[0]).toContain('Measure');
			expect(items[0]).toMatch(/<strong[^>]*>twice<\/strong>/);
			expect(items[1]).toContain('Cut once');
		});

		it('renders headings clamped to h3 and h4, never h1 or h2', () => {
			expect(html).toMatch(/<h3[^>]*>Before you start<\/h3>/);
			expect(html).toMatch(/<h4[^>]*>Bring<\/h4>/);
			expect(html).not.toMatch(/<h1|<h2/);
		});

		it('renders bold, italic and a safe link as real elements', () => {
			expect(html).toMatch(/<strong[^>]*>whole<\/strong>/);
			expect(html).toMatch(/<em[^>]*>carefully<\/em>/);
			expect(html).toMatch(/href="https:\/\/example\.com\/tolerances"/);
			expect(html).toMatch(/rel="noopener noreferrer"/);
		});

		it('renders the blocks in the order they were authored', () => {
			// The whole shape in one assertion, marks included and in place: the
			// second ordered item's <strong> sits INSIDE its <li>, which is the
			// thing a flattening bug destroys first.
			expect(tags(html)).toEqual([
				'div',
				'h3',
				'p',
				'strong',
				'em',
				'a',
				'h4',
				'ul',
				'li',
				'li',
				// The sublist OPENS INSIDE the second <li>, which is what says
				// this is nesting rather than three flat bullets.
				'ul',
				'li',
				'ol',
				'li',
				'strong',
				'li'
			]);
		});

		it('never emits raw markup for a body that contains none', () => {
			// There is no {@html} in this path; the only tags present are the ones
			// the renderer built. Asserted against the STORED text so a body that
			// somehow carried markup would show up here rather than in a browser.
			expect(storedBody).not.toContain('<');
		});
	});

	// -----------------------------------------------------------------------
	// THE DEGRADE. What the same content looks like when `body_doc` never made
	// it -- the production symptom, pinned.
	// -----------------------------------------------------------------------
	describe('the same body with no stored document (a backend without 0108)', () => {
		const flat = normalizeItemDoc(EDITOR_DOC);

		it('keeps every word in the plain-text column, one line per block and item', () => {
			expect(flat.ok).toBe(true);
			if (!flat.ok) return;
			const shaped = itemBodyColumns(EDITOR_DOC);
			expect(shaped.ok).toBe(true);
			if (!shaped.ok) return;
			expect(shaped.body.split('\n')).toEqual([
				'Before you start',
				'Read the whole brief, carefully, and check the tolerance table.',
				'Bring',
				'A ruler',
				'Graph paper',
				'Sharp pencil',
				'Measure twice',
				'Cut once'
			]);
		});

		it('renders that text as ONE run-on paragraph -- no breaks, no markers -- which IS the reported bug', () => {
			const shaped = itemBodyColumns(EDITOR_DOC);
			expect(shaped.ok).toBe(true);
			if (!shaped.ok) return;

			// `body_doc: undefined` is what a pre-0108 read returns, and what
			// `normalizeItemRow` deliberately keeps distinct from null.
			const html = renderBody({ body: shaped.body });
			expect(html).not.toContain('<ul');
			expect(html).not.toContain('<ol');
			expect(html).not.toContain('<li');
			expect(html).not.toContain('<h3');
			expect(html).not.toContain('<strong');

			// And it is worse than the lists: `docFromPlainText` splits on BLANK
			// lines, of which there are none, so the heading, the paragraph and
			// every list item collapse into a single <p>. Written out in full
			// because the exact string is the symptom that was reported.
			expect(tags(html)).toEqual(['div', 'p']);
			expect(html).toMatch(
				/<p[^>]*>Before you start Read the whole brief, carefully, and check the tolerance table\. Bring A ruler Graph paper Sharp pencil Measure twice Cut once<\/p>/
			);
		});

		it('recovers nothing on its own -- the formatting is genuinely gone', () => {
			const shaped = itemBodyColumns(EDITOR_DOC);
			expect(shaped.ok).toBe(true);
			if (!shaped.ok) return;
			// Re-running the text through the fallback cannot rebuild the lists,
			// which is why an affected item has to be re-authored rather than
			// migrated. Stated as a test so nobody writes a "repair" pass that
			// silently invents structure the text never carried.
			const recovered = itemBodyDoc({ body: shaped.body });
			expect(recovered.some((b) => b.type === 'ul' || b.type === 'ol')).toBe(false);
			expect(recovered.every((b) => b.type === 'p')).toBe(true);
		});
	});
});
