// tests/dom/classroom-feed-needs-mount.test.ts
//
// WHAT A CLASS NEEDS FROM ITS TEACHER, SAID PLAINLY AND ONE PRESS FROM THE FIX
// (reports c2446a58 and e4bc53e5, ledger 0416).
//
//   - A class card counts only ITS OWN active students' hand-ins. An
//     assignment shared to two classes showed one count on both cards, and a
//     student who had left the class kept a hand-in "to grade" that no grading
//     page listed.
//   - "Due soon" is the class's deadline, not the teacher's task, so it no
//     longer counts; the header says what is owed ("3 to grade · 1 draft").
//   - One owed thing: the header key is a link straight to its fix. Several:
//     the key opens a short list, each line saying what is owed and linking to
//     where it is done. A row with hand-ins to grade opens grading.
//
// The real component, mounted (tests/dom/mount.ts); both directions asserted.
// NO GEOMETRY IS ASSERTED HERE.

import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, type Component } from 'svelte';
import ClassroomFeed from '$lib/classroom/ClassroomFeed.svelte';
import { actionSummary, attentionWords, buildFeed, entryHref, type FeedSubmission } from '$lib/classroom/feed';
import type { ClassroomItem, ClassroomSection } from '$lib/classroom/classroom';
import { mountInto, type Mounted } from './mount';

const Feed = ClassroomFeed as unknown as Component<Record<string, unknown>>;
const NOW = new Date('2026-10-15T12:00:00Z');
const TEACHER = 'apina@boscotech.edu';
const course = { id: 'c1', code: 'IDEA209H', title: 'Engineering I Honors', active: true };
const section = (id: string, label: string): ClassroomSection =>
	({ id, course_id: 'c1', label, block: 'Block 2', teacher_email: TEACHER, active: true, course }) as ClassroomSection;
const S1 = section('sec-1', 'Section 1');
const S2 = section('sec-2', 'Section 2');

function item(id: string, title: string, over: Partial<ClassroomItem> = {}): ClassroomItem {
	return {
		id,
		kind: 'assignment',
		title,
		body: '',
		points: 10,
		due_at: '2026-10-10T07:00:00Z',
		category: null,
		author_email: TEACHER,
		author_name: 'A. Pina',
		published: true,
		pinned: false,
		sort_order: 0,
		first_published_at: '2026-10-01T08:00:00Z',
		edited_at: null,
		created_at: '2026-10-01T08:00:00Z',
		updated_at: '2026-10-01T08:00:00Z',
		links: [],
		attachments: [],
		viewed_at: null,
		postings: [{ section_id: 'sec-1' }, { section_id: 'sec-2' }],
		...over
	} as unknown as ClassroomItem;
}
const handedIn = (itemId: string, email: string): FeedSubmission =>
	({ item_id: itemId, student_email: email, state: 'submitted', submitted_at: '2026-10-09T20:00:00Z', graded_at: null, returned_at: null }) as unknown as FeedSubmission;

const FINAL = item('final', 'Unit 1 Final');
const LAB = item('lab', 'Unit 1 Lab');
const DUE_SOON = item('soon', 'Shop Fix: Presentation', { due_at: '2026-10-17T07:00:00Z' });
const DRAFT = item('draft', 'Unit 2 Kickoff', { published: false });

const ROSTERS = {
	'sec-1': ['ana@boscotech.net', 'ben@boscotech.net'],
	'sec-2': ['cal@boscotech.net']
};
const SUBS = [
	handedIn('final', 'ana@boscotech.net'),
	handedIn('final', 'cal@boscotech.net'),
	// Left Section 1: still on the submission table, on no roster.
	handedIn('final', 'gone@boscotech.net'),
	handedIn('lab', 'ben@boscotech.net')
];

const build = (rosterEmails?: Record<string, string[]>) =>
	buildFeed({ sections: [S1, S2], items: [FINAL, LAB, DUE_SOON, DRAFT], submissions: SUBS, myEmail: TEACHER, isAdmin: true, rosterEmails, now: NOW });

describe('the counts are each class\'s own', () => {
	it('with the roster, Section 1 counts its two hand-ins and Section 2 its one; nobody who left is counted', () => {
		const [one, two] = build(ROSTERS);
		const count = (f: typeof one, id: string) => f.urgent.find((e) => e.item.id === id)?.count ?? 0;
		expect(count(one, 'final')).toBe(1);
		expect(count(one, 'lab')).toBe(1);
		expect(count(two, 'final')).toBe(1);
		expect(two.urgent.find((e) => e.item.id === 'lab')?.reason).not.toBe('ungraded');
	});

	it('CONTROL: without a roster, the item-wide count is what it always was (three on Final, both cards)', () => {
		const [one, two] = build();
		expect(one.urgent.find((e) => e.item.id === 'final')?.count).toBe(3);
		expect(two.urgent.find((e) => e.item.id === 'final')?.count).toBe(3);
	});

	it('due soon is not a teacher\'s task; hand-ins and drafts are, and the header says which', () => {
		const [one, two] = build(ROSTERS);
		expect(one.attention.map((e) => e.item.id).sort()).toEqual(['draft', 'final', 'lab']);
		expect(one.attention.some((e) => e.reason === 'due-soon')).toBe(false);
		expect(one.urgent.some((e) => e.reason === 'due-soon')).toBe(true);
		expect(actionSummary(one)).toBe('2 to grade · 1 draft');
		expect(actionSummary(two)).toBe('1 to grade · 1 draft');
		expect(actionSummary(one)).not.toMatch(/attention/);
	});

	it('every owed thing says what is owed and where it is fixed', () => {
		const [one] = build(ROSTERS);
		const final = one.attention.find((e) => e.item.id === 'final')!;
		expect(attentionWords(final)).toBe('Grade 1 hand-in');
		expect(entryHref('/classroom', 'sec-1', final, true)).toBe('/classroom/sec-1/item/final/grade');
		const draft = one.attention.find((e) => e.item.id === 'draft')!;
		expect(attentionWords(draft)).toBe('Finish and post this draft');
		expect(entryHref('/classroom', 'sec-1', draft, true)).toBe('/classroom/sec-1/item/draft');
		// A student's own row never opens grading.
		expect(entryHref('/classroom', 'sec-1', final, false)).toBe('/classroom/sec-1/item/final');
	});
});

let mounted: Mounted[] = [];
afterEach(async () => {
	for (const m of mounted) await m.stop();
	mounted = [];
});

describe('the header key goes to the fix', () => {
	it('several owed things: a key that opens the short list, each line a link to its fix', async () => {
		const m = await mountInto(Feed, { feeds: build(ROSTERS).slice(0, 1), now: NOW, basePath: '/classroom' });
		mounted.push(m);
		const root = m.target;
		const key = root.querySelector<HTMLButtonElement>('button[data-testid="feed-attention"]');
		expect(key, 'a button, because there is more than one thing').not.toBeNull();
		expect(key!.textContent).toContain('2 to grade · 1 draft');
		// Not inside the class's own link any more.
		expect(key!.closest('a')).toBeNull();
		expect(root.querySelectorAll('[data-testid="feed-needs"]')).toHaveLength(0);
		key!.click();
		flushSync();
		const list = root.querySelector('[data-testid="feed-needs"]');
		expect(list).not.toBeNull();
		const links = [...list!.querySelectorAll('a')].map((a) => [a.textContent?.replace(/\s+/g, ' ').trim(), a.getAttribute('href')]);
		expect(links).toEqual([
			['Grade 1 hand-in Unit 1 Final ›', '/classroom/sec-1/item/final/grade'],
			['Grade 1 hand-in Unit 1 Lab ›', '/classroom/sec-1/item/lab/grade'],
			['Finish and post this draft Unit 2 Kickoff ›', '/classroom/sec-1/item/draft']
		]);
		expect(key!.getAttribute('aria-expanded')).toBe('true');
		key!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		flushSync();
		expect(root.querySelectorAll('[data-testid="feed-needs"]')).toHaveLength(0);
	});

	it('one owed thing: the key is a link straight to it, and the row with hand-ins opens grading', async () => {
		const feeds = buildFeed({ sections: [S2], items: [FINAL, DUE_SOON], submissions: SUBS, myEmail: TEACHER, isAdmin: true, rosterEmails: ROSTERS, now: NOW });
		const m = await mountInto(Feed, { feeds, now: NOW, basePath: '/classroom' });
		mounted.push(m);
		const root = m.target;
		const key = root.querySelector<HTMLAnchorElement>('a[data-testid="feed-attention"]');
		expect(key).not.toBeNull();
		expect(key!.getAttribute('href')).toBe('/classroom/sec-2/item/final/grade');
		expect(key!.textContent).toContain('1 to grade');
		expect(root.querySelectorAll('button[data-testid="feed-attention"]')).toHaveLength(0);
		const rows = [...root.querySelectorAll<HTMLAnchorElement>('a.feed-row')].map((a) => a.getAttribute('href'));
		expect(rows).toContain('/classroom/sec-2/item/final/grade');
		expect(rows).toContain('/classroom/sec-2/item/soon');
	});

	it('a student\'s card keeps its count as words inside the class link, with no key', async () => {
		const feeds = buildFeed({ sections: [S1], items: [DUE_SOON], submissions: [], myEmail: 'ana@boscotech.net', now: NOW });
		const m = await mountInto(Feed, { feeds, now: NOW, basePath: '/classroom' });
		mounted.push(m);
		const chip = m.target.querySelector('[data-testid="feed-attention"]');
		expect(chip?.tagName).toBe('SPAN');
		expect(chip?.closest('a.feed-open')).not.toBeNull();
		expect(m.target.querySelectorAll('.feed-attn-key')).toHaveLength(0);
	});
});
