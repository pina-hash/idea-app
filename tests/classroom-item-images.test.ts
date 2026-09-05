// tests/classroom-item-images.test.ts
//
// 0176: an item body can hold a picture, and EVERY consumer of `ItemBlock`
// gained a branch for it.
//
// WHY A CONSUMER SWEEP IS THE TEST, rather than a feature test. Adding a member
// to a closed union is safe exactly once every walk over it has been taught the
// new arm, and a walk that has NOT been taught does not fail loudly -- it falls
// through a `default`, an `else`, or an "is this already stored" predicate and
// DROPS the block. That is invisible in normal use and catastrophic in one
// case: `normalizeItemDoc` routes an ALREADY-STORED document back through the
// editor walk on every publish toggle, so a missed branch there would delete a
// teacher's photograph from an item nobody was editing, on a click that says
// "publish".
//
// So the shape of this file is: one document with a picture in it, put to each
// consumer in turn, with the picture required to survive. Where a consumer
// genuinely cannot render one it must REFUSE loudly rather than drop, and the
// case says which of the two it is.
//
// NO DOM. `environment: 'node'` with `svelte/server`'s `render()`, the
// convention classroom-figures.test.ts established: the assertion is on the
// REAL SSR markup a browser would receive, from the REAL shipped components.
//
// THE GATE ITSELF IS NOT HERE. `tests/db/classroom-item-image-gate.test.ts`
// puts 0176 to real Postgres; this file is about the code around it.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import ItemBody from '$lib/classroom/ItemBody.svelte';
import ClassroomFeed from '$lib/classroom/ClassroomFeed.svelte';
import {
	ITEM_IMAGE_NODE,
	docText,
	docToTiptap,
	itemCoverImage,
	type ItemDoc
} from '$lib/classroom/classroom-doc';
import {
	IMAGE_ALT_REQUIRED,
	IMAGE_SRC_REFUSED,
	itemBodyColumns,
	normalizeItemDoc
} from '$lib/server/classroom-doc';
import {
	editorToMarkdown,
	itemDocToMarkdown,
	markdownEditable,
	markdownToItemDoc,
	markdownUneditableReasons
} from '$lib/classroom/spec-markdown';
import { feedCover, buildFeed, type FeedSubmission } from '$lib/classroom/feed';
import type { ClassroomAttachment, ClassroomItem } from '$lib/classroom/classroom';
import { hasGuidance } from '$lib/check-in-guidance';

const ATTACHMENTS: ClassroomAttachment[] = [
	{ id: 'att-1', filename: 'teardown-03.jpg', mime_type: 'image/jpeg', sort_order: 0 },
	{ id: 'att-2', filename: 'diagram.svg', mime_type: 'image/svg+xml', sort_order: 1 }
];

const ALT = 'The bearing, exploded, with the race beside it';
const STORED: ItemDoc = [
	{ type: 'p', runs: [{ text: 'Measure the race before you press it out.' }] },
	{ type: 'img', src: 'attachment:teardown-03.jpg', alt: ALT },
	{ type: 'ul', items: [[{ text: 'calipers' }]] }
];

/** What the editor emits for that document: an ATOM carrying two attributes. */
const EDITOR_OUTPUT = {
	type: 'doc',
	content: [
		{ type: 'paragraph', content: [{ type: 'text', text: 'Measure the race before you press it out.' }] },
		{ type: ITEM_IMAGE_NODE.name, attrs: { src: 'attachment:teardown-03.jpg', alt: ALT } },
		{
			type: 'bulletList',
			content: [
				{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'calipers' }] }] }
			]
		}
	]
};

function countImgs(html: string): number {
	return (html.match(/<\s*img\b/gi) ?? []).length;
}

function item(doc: ItemDoc, over: Partial<ClassroomItem> = {}): ClassroomItem {
	return {
		id: 'item-1',
		kind: 'assignment',
		title: 'Bearing teardown',
		body: docText(doc),
		body_doc: doc,
		points: 10,
		due_at: null,
		category: null,
		author_email: 'vargas@boscotech.edu',
		author_name: 'T. Vargas',
		published: true,
		pinned: false,
		sort_order: 0,
		first_published_at: '2026-09-01T00:00:00Z',
		edited_at: null,
		created_at: '2026-09-01T00:00:00Z',
		updated_at: '2026-09-01T00:00:00Z',
		links: [],
		attachments: ATTACHMENTS,
		postings: [],
		viewed_at: null,
		...over
	} as ClassroomItem;
}

// ---------------------------------------------------------------------------
// Part 0. PROVE THE INSTRUMENT. Nothing below is worth reading if this fails.
// ---------------------------------------------------------------------------
describe('the harness itself', () => {
	it('countImgs finds an img when one is genuinely present, and not otherwise', () => {
		expect(countImgs('<p>the word image</p>')).toBe(0);
		expect(countImgs('<img src="/x.png">')).toBe(1);
		expect(countImgs('< img src="/x.png"><IMG src="/y.png">')).toBe(2);
	});

	it('the fixture really does carry a picture', () => {
		expect(STORED.filter((b) => b.type === 'img')).toHaveLength(1);
		expect(EDITOR_OUTPUT.content.filter((n) => n.type === ITEM_IMAGE_NODE.name)).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// Part 1. THE EDITOR'S NODE. One declaration, three readers.
// ---------------------------------------------------------------------------
describe('the editor node is declared once and read by everything else', () => {
	const src = readFileSync(
		new URL('../src/lib/classroom/RichTextEditor.svelte', import.meta.url),
		'utf8'
	);

	it('RichTextEditor builds its node from ITEM_IMAGE_NODE, never from a literal name', () => {
		// A SECOND SPELLING OF THE NAME is a document the editor emits and the
		// normalizer silently drops -- the exact defect this file exists to
		// prevent, one layer down. Asserted on the SOURCE because this project
		// has no DOM and the editor's runtime is browser-only; the alternative
		// is a mount that cannot run here, which would be a green test proving
		// nothing.
		expect(src).toContain('name: ITEM_IMAGE_NODE.name');
		expect(src).toContain('ITEM_IMAGE_NODE');
		// The literal would be `name: 'itemImage'`.
		expect(src).not.toContain("name: 'itemImage'");
	});

	it('it declares exactly the attributes the stored shape carries, and no more', () => {
		expect(src).toContain("addAttributes: () => ({ src: { default: '' }, alt: { default: '' } })");
		expect([...ITEM_IMAGE_NODE.attrs]).toEqual(['src', 'alt']);
	});

	it('it does NOT pull in @tiptap/extension-image', () => {
		// That extension's whole job is an arbitrary `src` URL, which is the one
		// thing this feature must not have. It is also not a dependency of this
		// repo, so importing it would rewrite a 4,649-line lockfile.
		// The IMPORT, not the string: the file's own comment says why the package
		// is not used, so a bare substring test would fail on the explanation.
		expect(/from ['"]@tiptap\/extension-image/.test(src)).toBe(false);
		expect(/import\(['"]@tiptap\/extension-image/.test(src)).toBe(false);
		const pkg = JSON.parse(
			readFileSync(new URL('../package.json', import.meta.url), 'utf8')
		) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
		expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })).not.toContain(
			'@tiptap/extension-image'
		);
	});

	it('the insert control requires a description before it will add anything', () => {
		expect(src).toContain("imageRef.trim() !== '' && imageAlt.trim() !== ''");
		// `aria-disabled`, never `disabled`: a genuinely disabled control
		// swallows pointer events and can never explain why it is refusing.
		expect(src).toContain('aria-disabled={!imageReady}');
		// The bare attribute, not merely the substring: `aria-disabled={...}`
		// CONTAINS `disabled={...}`, so a naive `not.toContain` here would fail
		// on the correct code and pass on nothing.
		expect(/[^-]disabled=\{!imageReady\}/.test(src)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Part 2. THE NORMALIZER. Editor output in, stored document out -- and back.
// ---------------------------------------------------------------------------
describe('the server normalizer', () => {
	it('carries an image through from editor output', () => {
		const res = normalizeItemDoc(EDITOR_OUTPUT);
		expect(res.ok).toBe(true);
		if (!res.ok) throw new Error('unreachable');
		expect(res.doc).toEqual(STORED);
	});

	it('is IDEMPOTENT over a stored document containing an image', () => {
		// THE PUBLISH-TOGGLE CASE, and the reason `looksStored` needed its own
		// arm. An image carries neither `runs` nor `items`, so before that arm
		// existed a stored body with a picture failed the predicate, was treated
		// as editor output, was walked for `content` it does not have, and came
		// back EMPTY -- silently, on a click that says publish, for an item
		// nobody was editing.
		const once = normalizeItemDoc(STORED);
		expect(once.ok).toBe(true);
		if (!once.ok) throw new Error('unreachable');
		expect(once.doc).toEqual(STORED);
		const twice = normalizeItemDoc(once.doc);
		expect(twice.ok).toBe(true);
		if (!twice.ok) throw new Error('unreachable');
		expect(twice.doc).toEqual(STORED);
	});

	it('REFUSES rather than drops when a description is missing', () => {
		// Dropping was the alternative and it is the wrong one: the author would
		// press Save, read "Saved", and find the picture gone -- in exactly the
		// case a student using a screen reader depends on.
		for (const alt of ['', '   ', '\n\t']) {
			const res = normalizeItemDoc({
				type: 'doc',
				content: [{ type: ITEM_IMAGE_NODE.name, attrs: { src: 'attachment:x.jpg', alt } }]
			});
			expect(res.ok, `alt=${JSON.stringify(alt)}`).toBe(false);
			if (res.ok) throw new Error('unreachable');
			expect(res.error).toBe(IMAGE_ALT_REQUIRED);
		}
		// An absent attribute is the same refusal, not a different one.
		const missing = normalizeItemDoc({
			type: 'doc',
			content: [{ type: ITEM_IMAGE_NODE.name, attrs: { src: 'attachment:x.jpg' } }]
		});
		expect(missing.ok).toBe(false);
		if (missing.ok) throw new Error('unreachable');
		expect(missing.error).toBe(IMAGE_ALT_REQUIRED);
	});

	it('REFUSES a source no img may ever be given, by the same one predicate the renderer uses', () => {
		const hostile = [
			'https://evil.example/beacon.png',
			'//evil.example/beacon.png',
			'javascript:alert(1)',
			'data:image/png;base64,AAAA',
			'/api/classroom/attachment/att-1',
			'/IDEA/../../etc/passwd',
			'attachment:diagram.svg',
			'/IDEA/logo.svg',
			'gear.png',
			''
		];
		let refused = 0;
		for (const src of hostile) {
			const res = normalizeItemDoc({
				type: 'doc',
				content: [{ type: ITEM_IMAGE_NODE.name, attrs: { src, alt: 'A' } }]
			});
			expect(res.ok, src).toBe(false);
			if (!res.ok) expect(res.error, src).toBe(IMAGE_SRC_REFUSED);
			refused += 1;
		}
		// THE POSITIVE CONTROL, in the same run. A normalizer that refused
		// everything would satisfy every line above.
		const ok = normalizeItemDoc({
			type: 'doc',
			content: [
				{ type: ITEM_IMAGE_NODE.name, attrs: { src: 'attachment:missing.jpg', alt: 'A' } },
				{ type: ITEM_IMAGE_NODE.name, attrs: { src: '/IDEA/idea-gear.png', alt: 'B' } }
			]
		});
		expect(ok.ok).toBe(true);
		if (!ok.ok) throw new Error('unreachable');
		expect(ok.doc).toHaveLength(2);
		console.log(`[0176 normalize] hostile=${refused} refused, control=2 accepted`);
		expect(refused).toBe(hostile.length);
	});

	it('an unresolvable alias is STORABLE, because the attachment list is a render-time question', () => {
		const res = normalizeItemDoc({
			type: 'doc',
			content: [{ type: ITEM_IMAGE_NODE.name, attrs: { src: 'attachment:not-yet.jpg', alt: 'A' } }]
		});
		expect(res.ok).toBe(true);
	});

	it('itemBodyColumns derives the two columns together, with the image in the doc half', () => {
		const cols = itemBodyColumns(EDITOR_OUTPUT);
		expect(cols.ok).toBe(true);
		if (!cols.ok) throw new Error('unreachable');
		expect(cols.doc).toEqual(STORED);
		expect(cols.body).toBe(docText(STORED));
	});
});

// ---------------------------------------------------------------------------
// Part 3. THE PROJECTION. Measured, not assumed; SQL parity is in the db file.
// ---------------------------------------------------------------------------
describe('the plain-text projection', () => {
	it('an image contributes an EMPTY LINE, which is what the SQL column does too', () => {
		expect(docText([{ type: 'img', src: 'attachment:x.jpg', alt: 'A bearing' }])).toBe('');
		expect(docText(STORED)).toBe('Measure the race before you press it out.\n\ncalipers');
	});
});

// ---------------------------------------------------------------------------
// Part 4. THE TIPTAP ROUND TRIP.
// ---------------------------------------------------------------------------
describe('docToTiptap', () => {
	it('seeds the editor with the image node, attributes intact', () => {
		expect(docToTiptap(STORED)).toEqual(EDITOR_OUTPUT);
	});
});

// ---------------------------------------------------------------------------
// Part 5. THE RENDERER.
// ---------------------------------------------------------------------------
describe('ItemBody', () => {
	it('renders one img, resolved through the proxy, never a raw alias', () => {
		const html = render(ItemBody, { props: { item: item(STORED) } }).body;
		expect(countImgs(html)).toBe(1);
		expect(html).toContain('/api/classroom/attachment/att-1');
		expect(html).not.toContain('attachment:teardown-03.jpg');
		expect(html).toContain(`alt="${ALT}"`);
		// Svelte stamps a scope class on the element, so the assertion is on the
		// tag and its text rather than on an exact string.
		expect(html).toMatch(new RegExp(`<figcaption[^>]*>${ALT}</figcaption>`));
		expect(html).toContain('loading="lazy"');
	});

	it('resolves through ?public=1 when the signed-out viewer asks', () => {
		const html = render(ItemBody, {
			props: { item: item(STORED), publicAttachments: true }
		}).body;
		expect(html).toContain('/api/classroom/attachment/att-1?public=1');
	});

	it('renders the description plus a visible marker when the reference cannot be resolved, never silence', () => {
		const missing: ItemDoc = [{ type: 'img', src: 'attachment:not-here.jpg', alt: ALT }];
		const html = render(ItemBody, { props: { item: item(missing) } }).body;
		expect(countImgs(html)).toBe(0);
		expect(html).toContain('Image unavailable');
		expect(html).toContain(ALT);
	});

	it('renders 0 img and leaks NO refused reference into any attribute, for every hostile source', () => {
		// The renderer is the LAST of the three gates and is written not to trust
		// the two above it: a document that reached the table by some other door
		// must still be safe to display.
		const hostile = [
			'https://evil.example/beacon.png',
			'//evil.example/beacon.png',
			'javascript:alert(1)',
			'data:image/png;base64,AAAA',
			'attachment:diagram.svg',
			'/IDEA/logo.svg',
			'/IDEA/../../etc/passwd'
		];
		for (const src of hostile) {
			const html = render(ItemBody, {
				props: { item: item([{ type: 'img', src, alt: 'Beacon' }]) }
			}).body;
			expect(countImgs(html), src).toBe(0);
			expect(html, src).not.toContain('evil.example');
			expect(html, src).not.toContain('javascript:');
			expect(html, src).not.toContain('data:image');
			expect(html, src).not.toContain('/etc/passwd');
			expect(html, src).toContain('Image unavailable');
		}
		// THE CONTROL, same run, same counter: the pipeline can produce an img.
		expect(countImgs(render(ItemBody, { props: { item: item(STORED) } }).body)).toBe(1);
	});

	it('an SVG attachment is refused on its stored MIME as well as on its name', () => {
		// Both spellings, because either can be the only one present.
		const byMime: ClassroomAttachment[] = [
			{ id: 'att-3', filename: 'diagram.png', mime_type: 'image/svg+xml', sort_order: 0 }
		];
		const html = render(ItemBody, {
			props: {
				item: item([{ type: 'img', src: 'attachment:diagram.png', alt: 'D' }], {
					attachments: byMime
				})
			}
		}).body;
		expect(countImgs(html)).toBe(0);
		expect(html).toContain('Image unavailable');
	});

	it('a body with no attachments loaded degrades to the marker rather than throwing', () => {
		const html = render(ItemBody, {
			props: { item: { body: docText(STORED), body_doc: STORED } }
		}).body;
		expect(countImgs(html)).toBe(0);
		expect(html).toContain('Image unavailable');
	});
});

// ---------------------------------------------------------------------------
// Part 6. THE MARKDOWN BRIDGE, both directions.
// ---------------------------------------------------------------------------
describe('spec-markdown', () => {
	const line = `![${ALT}](attachment:teardown-03.jpg)`;

	it('a markdown figure becomes an image block', () => {
		const doc = markdownToItemDoc(line);
		expect(doc).toEqual([{ type: 'img', src: 'attachment:teardown-03.jpg', alt: ALT }]);
	});

	it('and writes back out as the identical line', () => {
		expect(itemDocToMarkdown([{ type: 'img', src: 'attachment:teardown-03.jpg', alt: ALT }])).toBe(
			line
		);
	});

	it('editorToMarkdown serializes the editor node rather than DROPPING it', () => {
		// The `default` arm used to ignore everything it did not name, which was
		// safe while every such node was one the schema could not produce. An
		// image is one it now can, so a silent drop here would take a teacher's
		// photograph out of a spec field on the first save after inserting it.
		expect(editorToMarkdown(EDITOR_OUTPUT)).toContain(line);
	});

	it('a field carrying a figure now OPENS in the editor instead of falling back to source', () => {
		expect(markdownEditable(line)).toBe(true);
		expect(markdownUneditableReasons(line)).toEqual([]);
		// The control: a construct the document still cannot hold.
		expect(markdownEditable('| a | b |\n| --- | --- |\n| 1 | 2 |')).toBe(false);
	});

	it('a whole prose field round-trips with the figure in place', () => {
		const prose = ['### Setup', '', 'Measure first.', '', line, '', '- calipers'].join('\n');
		expect(markdownEditable(prose)).toBe(true);
		const doc = markdownToItemDoc(prose);
		expect(doc?.filter((b) => b.type === 'img')).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// Part 7. THE FEED COVER AND THE CARD.
// ---------------------------------------------------------------------------
describe('the feed thumbnail', () => {
	it('itemCoverImage takes the FIRST image in document order', () => {
		const two: ItemDoc = [
			{ type: 'p', runs: [{ text: 'x' }] },
			{ type: 'img', src: 'attachment:teardown-03.jpg', alt: 'first' },
			{ type: 'img', src: '/IDEA/idea-gear.png', alt: 'second' }
		];
		expect(itemCoverImage(two)?.alt).toBe('first');
		expect(itemCoverImage([{ type: 'p', runs: [{ text: 'x' }] }])).toBeNull();
		expect(itemCoverImage(null)).toBeNull();
	});

	it('feedCover resolves through the proxy with no second round trip', () => {
		const cover = feedCover(item(STORED));
		expect(cover).toEqual({ src: '/api/classroom/attachment/att-1', alt: ALT });
	});

	it('feedCover is null for a body with no picture, for an unresolvable one, and for a hostile one', () => {
		expect(feedCover(item([{ type: 'p', runs: [{ text: 'x' }] }]))).toBeNull();
		expect(feedCover(item([{ type: 'img', src: 'attachment:gone.jpg', alt: 'A' }]))).toBeNull();
		expect(
			feedCover(item([{ type: 'img', src: 'https://evil.example/x.png', alt: 'A' }]))
		).toBeNull();
	});

	it('feedCover is null on a read whose rung did not carry body_doc', () => {
		// `itemBodyDoc` then converts the PLAIN TEXT, which has no images in it
		// by construction, so a pre-0108 deployment gets exactly the glyph it has
		// always had rather than an error.
		const noDoc = item(STORED);
		delete (noDoc as Partial<ClassroomItem>).body_doc;
		expect(feedCover(noDoc)).toBeNull();
	});

	it('the card renders the thumbnail, and a card with no cover keeps its glyph', () => {
		const section = {
			id: 'sec-1',
			course_id: 'c-1',
			label: 'Period 2',
			block: 'B',
			teacher_email: 'vargas@boscotech.edu',
			active: true,
			course: { id: 'c-1', code: 'IDEA209H', title: 'Engineering', active: true }
		} as unknown as Parameters<typeof buildFeed>[0]['sections'][number];

		const withCover = item(STORED, { id: 'with-cover', pinned: true });
		const withoutCover = item([{ type: 'p', runs: [{ text: 'No picture here.' }] }], {
			id: 'no-cover',
			pinned: true
		});
		for (const it2 of [withCover, withoutCover]) {
			it2.postings = [{ id: `p-${it2.id}`, section_id: 'sec-1' }] as ClassroomItem['postings'];
		}

		const feeds = buildFeed({
			sections: [section],
			items: [withCover, withoutCover],
			submissions: [] as FeedSubmission[],
			myEmail: 'alice@boscotech.net',
			now: new Date('2026-09-04T12:00:00Z')
		} as Parameters<typeof buildFeed>[0]);

		const html = render(ClassroomFeed, {
			props: { feeds, now: new Date('2026-09-04T12:00:00Z') }
		}).body;

		// ONE img, for the ONE item with a cover, and the glyph still there for
		// the other -- both counted in the same run, so a renderer that stopped
		// drawing either would be visible here.
		expect(countImgs(html)).toBe(1);
		expect(html).toContain('/api/classroom/attachment/att-1');
		expect(html).toContain('has-cover');
		const svgs = (html.match(/<svg\b/gi) ?? []).length;
		expect(svgs).toBeGreaterThanOrEqual(1);
		console.log(`[0176 feed] cards=2 img=${countImgs(html)} glyphs=${svgs}`);
	});

	it("the thumbnail's alt is EMPTY, because the row's accessible name is the title", () => {
		// Not a missing description: announcing the body's own sentence here
		// would read the same item out twice, once by name and once by
		// photograph. The description is rendered by ItemBody on the item page,
		// as both the alt and the caption, which Part 5 asserts.
		const src = readFileSync(
			new URL('../src/lib/classroom/ClassroomFeed.svelte', import.meta.url),
			'utf8'
		);
		expect(src).toContain('alt=""');
		expect(src).not.toContain('alt={cover.alt}');
	});
});

// ---------------------------------------------------------------------------
// Part 8. THE NOTEBOOK'S CONTRACT DID NOT MOVE.
// ---------------------------------------------------------------------------
describe('the notebook side', () => {
	it('the shared walk emits no image unless a caller asks for one', () => {
		// The notebook's normalizer supplies no `imageBlock` hook, so the editor
		// node falls through to the text walk, has no text, and is dropped --
		// which is the CORRECT outcome there, and is why the hook is opt-in.
		const src = readFileSync(
			new URL('../src/lib/server/notebook-notes.ts', import.meta.url),
			'utf8'
		);
		expect(src).not.toContain('imageBlock');
	});

	it('hasGuidance still answers for every block a guidance document can hold', () => {
		expect(hasGuidance([{ type: 'p', runs: [{ text: 'Write about the fit.' }] }])).toBe(true);
		expect(hasGuidance([{ type: 'ul', items: [[{ text: 'x' }]] }])).toBe(true);
		expect(hasGuidance([{ type: 'p', runs: [{ text: '  ' }] }])).toBe(false);
		expect(hasGuidance(null)).toBe(false);
		// An image cannot reach a guidance document -- 0176's NARROW gate still
		// refuses one -- but the walk must not throw if the type system says it
		// could, which is what the `'items' in block` narrowing is for.
		expect(hasGuidance([{ type: 'img', src: 'attachment:x.jpg', alt: 'A' }])).toBe(false);
	});
});
