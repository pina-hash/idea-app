// tests/classroom-class-videos.test.ts
//
// THE CLASS PAGE'S VIDEOS INDEX (ledger 0298, R08). Every regression here is
// SILENT on screen: a card for an instructor-only link, or for a draft the
// class cannot open, looks exactly like every other card to the teacher who
// is shown it, and nobody else sees the page it is wrong about; a card for a
// link on another host sends every reader's browser at a URL nobody chose to
// load. So each exclusion carries a positive control built from the same
// fixture, and the sweep's case count is asserted.
//
// WHERE THE EXPECTED VALUES COME FROM: made-up video ids placed in known
// positions, and body documents BUILT through the real editor schema and the
// real server normalizer (`editorDoc` then `normalizeItemDoc`), so every stored
// shape here is one a teacher's editor can produce. The one exception is the
// unsafe-scheme case, which the normalizer and 0108's gate both refuse to
// store; it is hand-written ON PURPOSE, as a document that reached the table
// another way, which is the case the render-time `safeHref` exists for.

import { describe, expect, it } from 'vitest';
import { normalizeItemDoc } from '../src/lib/server/classroom-doc';
import type { ItemDoc } from '../src/lib/classroom/classroom-doc';
import type { ClassroomItem } from '../src/lib/classroom/classroom';
import {
	classVideos,
	docVideoLinks,
	heldVideosNote,
	itemVideoLinks,
	videoCountLabel,
	type ClassVideoItem
} from '../src/lib/classroom/class-videos';
import {
	editorDoc,
	itemSchema,
	pmBold,
	pmBullets,
	pmDoc,
	pmHeading,
	pmItem,
	pmLink,
	pmPara,
	pmText
} from './rich-text-fixtures';

const NOW = new Date('2026-09-25T17:00:00.000Z');

/** Editor JSON -> a document the editor can hold -> what the server stores. */
function stored(json: unknown): ItemDoc {
	const result = normalizeItemDoc(editorDoc(itemSchema, json));
	if (!result.ok) throw new Error(`fixture did not normalize: ${result.error}`);
	return result.doc;
}

function item(id: string, over: Partial<ClassroomItem> = {}): ClassVideoItem & Partial<ClassroomItem> {
	return {
		id,
		title: id,
		body: '',
		body_doc: [],
		links: [],
		published: true,
		publish_at: null,
		...over
	};
}

const yt = (id: string) => `https://www.youtube.com/watch?v=${id}`;

describe('every place a teacher writes a video link is found', () => {
	it('a sentence ending on one, one in the middle, a heading, a nested list item, and the Links list', () => {
		const doc = stored(
			pmDoc(
				pmPara(pmText('Watch before class: '), pmText('Dial caliper', [pmLink(yt('AAAAAAAAAAA'))])),
				pmPara(
					pmText('If stuck, '),
					pmText('this ', [pmLink(`https://youtu.be/BBBBBBBBBBB?t=42`)]),
					pmText('gear video', [pmLink(`https://youtu.be/BBBBBBBBBBB?t=42`), pmBold]),
					pmText(' covers it.')
				),
				pmHeading(3, pmText('Part 2 '), pmText('walkthrough', [pmLink(yt('CCCCCCCCCCC'))])),
				pmBullets(
					pmItem(
						pmPara(pmText('Outer')),
						pmBullets(pmItem(pmPara(pmText('https://youtu.be/DDDDDDDDDDD', [pmLink('https://youtu.be/DDDDDDDDDDD')]))))
					)
				)
			)
		);
		const links = itemVideoLinks(
			item('m', { body_doc: doc, links: [{ label: 'Also here', url: 'https://m.youtube.com/shorts/EEEEEEEEEEE' }] })
		);
		expect(links.map((l) => [l.id, l.label])).toEqual([
			['AAAAAAAAAAA', 'Dial caliper'],
			// A bold word inside a link splits its run; the two runs are ONE link.
			['BBBBBBBBBBB', 'this gear video'],
			['CCCCCCCCCCC', 'walkthrough'],
			// A pasted address is its own text, which is no title.
			['DDDDDDDDDDD', ''],
			['EEEEEEEEEEE', 'Also here']
		]);
	});
});

describe('only YouTube, only a video, only a link that survives safeHref', () => {
	const cases: { label: string; href: string; carded: boolean }[] = [
		{ label: 'a watch page', href: yt('AAAAAAAAAAA'), carded: true },
		{ label: 'youtu.be', href: 'https://youtu.be/AAAAAAAAAAA', carded: true },
		{ label: 'an embed', href: 'https://www.youtube-nocookie.com/embed/AAAAAAAAAAA', carded: true },
		{ label: 'another host carrying ?v=', href: 'https://example.com/watch?v=AAAAAAAAAAA', carded: false },
		{ label: 'a lookalike host', href: 'https://youtube.com.evil.example/watch?v=AAAAAAAAAAA', carded: false },
		{ label: 'Vimeo', href: 'https://vimeo.com/76979871', carded: false },
		{ label: 'a channel page (no video)', href: 'https://www.youtube.com/@ideabosco', carded: false },
		{ label: 'a playlist with no video', href: 'https://www.youtube.com/playlist?list=PL123', carded: false },
		{ label: 'an unsafe scheme', href: 'javascript:alert(1)//youtube.com/watch?v=AAAAAAAAAAA', carded: false }
	];

	it(`sorts ${cases.length} links, in the body and in the Links list alike`, () => {
		expect(cases.length).toBe(9);
		expect(cases.filter((c) => c.carded).length).toBe(3);
		for (const c of cases) {
			// Hand-written stored shape: see the header for why the unsafe case must be.
			const body: ItemDoc = [{ type: 'p', runs: [{ text: c.label, href: c.href }] }];
			const fromBody = docVideoLinks(body).length;
			const fromList = itemVideoLinks(item('x', { links: [{ label: c.label, url: c.href }] })).length;
			expect([c.label, fromBody, fromList]).toEqual([c.label, c.carded ? 1 : 0, c.carded ? 1 : 0]);
		}
	});
});

describe('what a student can see, and nothing else, for every role', () => {
	it('never reads instructorLinks, while the same video in links is listed', () => {
		const answerKey = yt('KKKKKKKKKKK');
		const withKey = item('quiz', {
			instructorLinks: [{ label: 'Answer key walkthrough', url: answerKey }]
		});
		expect(classVideos([withKey], NOW).videos).toEqual([]);
		// Positive control: the identical URL on the student-facing list IS a card,
		// so the absence above is the field, not a predicate that answers no.
		const shown = classVideos([item('quiz', { links: [{ label: 'Walkthrough', url: answerKey }] })], NOW);
		expect(shown.videos.map((v) => v.id)).toEqual(['KKKKKKKKKKK']);
	});

	it('holds back a draft and a scheduled item, counts them, and lists a live one', () => {
		const body = (id: string): ItemDoc => [{ type: 'p', runs: [{ text: 'v', href: yt(id) }] }];
		const index = classVideos(
			[
				item('live', { body_doc: body('LLLLLLLLLLL') }),
				item('draft', { published: false, body_doc: body('DDDDDDDDDDD') }),
				item('later', { publish_at: '2026-09-26T15:00:00.000Z', body_doc: body('SSSSSSSSSSS') }),
				item('went-live', { publish_at: '2026-09-25T15:00:00.000Z', body_doc: body('WWWWWWWWWWW') }),
				// A draft posting a video a live item also posts: listed once, from the
				// live item, and NOT counted as held (it is not missing from the list).
				item('draft-dup', { published: false, body_doc: body('LLLLLLLLLLL') })
			],
			NOW
		);
		expect(index.videos.map((v) => [v.id, v.item.itemId, v.also.map((a) => a.itemId)])).toEqual([
			['LLLLLLLLLLL', 'live', []],
			['WWWWWWWWWWW', 'went-live', []]
		]);
		expect(index.held).toBe(2);
	});
});

describe('one card per video', () => {
	it('keeps the first item in the order handed, lists the others once, and folds a second link in one item', () => {
		const body = (...ids: string[]): ItemDoc => [
			{ type: 'p', runs: ids.flatMap((id, i) => [{ text: ` ${i} ` }, { text: `v${i}`, href: `https://youtu.be/${id}` }]) }
		];
		const index = classVideos(
			[
				item('material', { title: 'Day 3: calipers', body_doc: body('AAAAAAAAAAA', 'AAAAAAAAAAA') }),
				item('reminder', { title: 'Reminder', links: [{ label: '', url: yt('AAAAAAAAAAA') }] }),
				item('worksheet', { title: 'Worksheet', body_doc: body('AAAAAAAAAAA', 'BBBBBBBBBBB') })
			],
			NOW
		);
		expect(
			index.videos.map((v) => ({ id: v.id, from: v.item.title, also: v.also.map((a) => a.title) }))
		).toEqual([
			{ id: 'AAAAAAAAAAA', from: 'Day 3: calipers', also: ['Reminder', 'Worksheet'] },
			{ id: 'BBBBBBBBBBB', from: 'Worksheet', also: [] }
		]);
	});

	it('a class with links and no video has nothing to list', () => {
		const index = classVideos(
			[item('tour', { links: [{ label: 'Tour', url: 'https://vimeo.com/1' }] }), item('safety')],
			NOW
		);
		expect(index).toEqual({ videos: [], held: 0 });
	});
});

describe('the words', () => {
	it('counts and the held note', () => {
		expect([videoCountLabel(1), videoCountLabel(3)]).toEqual(['1 video', '3 videos']);
		expect(heldVideosNote(0)).toBeNull();
		expect(heldVideosNote(1)).toMatch(/^1 more video is in a draft or scheduled post/);
		expect(heldVideosNote(2)).toMatch(/^2 more videos are in drafts or scheduled posts/);
	});
});
