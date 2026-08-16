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
	'0108_classroom_rich_body.sql'
];

// ---------------------------------------------------------------------------
// The document a teacher authors, as the EDITOR emits it.
//
// Every construct the feature supports, in one body: a heading, a nested
// heading, bold, italic, a link, a bulleted list, a numbered list, and a list
// nested inside a list. Written out as ProseMirror JSON by hand rather than
// captured from a fixture file, so what goes in is visibly the shape Tiptap's
// `getJSON()` produces and not a shape that happens to suit the assertions.
// ---------------------------------------------------------------------------
const text = (t: string, marks?: unknown[]) => ({ type: 'text', text: t, ...(marks ? { marks } : {}) });
const para = (...content: unknown[]) => ({ type: 'paragraph', content });
const listItem = (...content: unknown[]) => ({ type: 'listItem', content });

const EDITOR_DOC = {
	type: 'doc',
	content: [
		{ type: 'heading', attrs: { level: 3 }, content: [text('Before you start')] },
		para(
			text('Read the '),
			text('whole', [{ type: 'bold' }]),
			text(' brief, '),
			text('carefully', [{ type: 'italic' }]),
			text(', and check '),
			text('the tolerance table', [
				{ type: 'link', attrs: { href: 'https://example.com/tolerances' } }
			]),
			text('.')
		),
		{ type: 'heading', attrs: { level: 4 }, content: [text('Bring')] },
		{
			type: 'bulletList',
			content: [
				listItem(para(text('A ruler'))),
				listItem(para(text('Graph paper'))),
				// A list nested inside a list. The documented rule is that it
				// flattens into MORE ITEMS OF ITS PARENT -- indentation is out of
				// scope, and losing a level reads better than losing the text.
				{ type: 'bulletList', content: [listItem(para(text('Sharp pencil')))] }
			]
		},
		{
			type: 'orderedList',
			content: [
				listItem(para(text('Measure '), text('twice', [{ type: 'bold' }]))),
				listItem(para(text('Cut once')))
			]
		}
	]
};

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
		items: [[{ text: 'A ruler' }], [{ text: 'Graph paper' }], [{ text: 'Sharp pencil' }]]
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
			const ul = html.match(/<ul[^>]*>([\s\S]*?)<\/ul>/);
			expect(ul).not.toBeNull();
			expect([...ul![1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1].trim())).toEqual([
				'A ruler',
				'Graph paper',
				// The nested list, flattened into its parent as documented.
				'Sharp pencil'
			]);
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
