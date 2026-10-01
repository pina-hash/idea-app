// tests/class-header.test.ts
//
// THE CLASS HEADER (ledger 0360, report R19): its arithmetic and its markup,
// on the REAL module and the REAL component's server render.
//
// What would regress SILENTLY:
//
//   1. The Next due key offering a student work they already finished, or work
//      that is already Missing, or a teacher a draft nobody can see. A key that
//      points at the wrong item looks exactly like a key that works. Asserted
//      against `assignmentStanding`'s own answers (the one implementation), at
//      a pinned instant.
//   2. Two `h1`s on the class page, or none: the header owns the page's one
//      title while the list is the page, and an `h2` while an item is open.
//   3. A class nobody has voted on growing a banner wrapper, a style attribute
//      or a pattern layer. That is every class on the day this ships.
//   4. A student being offered a teacher's keys. Both directions, counted.

import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { createRawSnippet } from 'svelte';
import ClassHeader from '../src/lib/classroom/ClassHeader.svelte';
import { classHeaderMeta, classHeaderTeams, nextDueFor } from '../src/lib/classroom/class-header';
import { resolveClassTheme } from '../src/lib/classroom/class-theme';
import type { ClassroomItem, ClassroomSection, StudentWork } from '../src/lib/classroom/classroom';

const NOW = '2026-09-24T17:00:00.000Z'; // Thu 10:00 AM Pacific
const at = (iso: string) => iso;

const course = { id: 'c-1', code: 'IDEA100', title: 'Intro to IDEA', active: true };
const SECTION: ClassroomSection = {
	id: 's-2',
	course_id: 'c-1',
	label: '2',
	block: '1',
	teacher_email: 'apina@boscotech.edu',
	active: true,
	course
};

const item = (id: string, due: string | null, over: Partial<ClassroomItem> = {}): ClassroomItem => ({
	id,
	kind: 'assignment',
	title: `Item ${id}`,
	body: '',
	body_doc: null,
	points: 10,
	due_at: due,
	category: null,
	author_email: 'apina@boscotech.edu',
	author_name: 'Mr. Pina',
	published: true,
	pinned: false,
	unit_id: null,
	sort_order: 0,
	first_published_at: '2026-09-20T15:00:00.000Z',
	edited_at: null,
	created_at: '2026-09-20T15:00:00.000Z',
	updated_at: '2026-09-20T15:00:00.000Z',
	links: [],
	attachments: [],
	postings: [{ section_id: 's-2' }],
	...over
});

const ITEMS: ClassroomItem[] = [
	item('missing', at('2026-09-23T06:59:00.000Z')), // due yesterday, nothing turned in
	item('done', at('2026-09-24T20:00:00.000Z')), // due today at 1 PM, already turned in
	item('worksheet', at('2026-09-25T06:59:00.000Z')), // a finished ported worksheet
	item('next', at('2026-09-26T06:59:00.000Z')), // the answer for a student
	item('undated', null),
	item('later', at('2026-10-01T06:59:00.000Z')),
	item('material', at('2026-09-24T18:00:00.000Z'), { kind: 'material' }),
	item('draft', at('2026-09-24T19:00:00.000Z'), { published: false }),
	item('scheduled', at('2026-09-24T21:00:00.000Z'), { publish_at: '2026-09-24T20:00:00.000Z' })
];
const WORK: Record<string, StudentWork> = {
	done: { state: 'submitted', score: null },
	worksheet: { state: 'in-progress', score: null, completedAt: '2026-09-24T16:00:00.000Z' }
};
const href = (id: string) => `/classroom/s-2/item/${id}`;

describe('the Next due key', () => {
	it('a student is offered the earliest work still to do, never done, finished or missing work', () => {
		const next = nextDueFor({ items: ITEMS, work: WORK, now: NOW, today: '2026-09-24', canManage: false, href });
		expect(next?.id).toBe('next');
		expect(next?.href).toBe('/classroom/s-2/item/next');
		expect(next?.when).toBe('Sep 25, 11:59 PM');
		// Positive controls: with no work recorded, the turned-in item due today
		// IS the next one, so the work map is what moved the answer.
		expect(nextDueFor({ items: ITEMS, work: {}, now: NOW, canManage: false, href })?.id).toBe('done');
	});

	it('a teacher is offered the earliest published, live assignment, never a draft or a scheduled one', () => {
		const next = nextDueFor({ items: ITEMS, work: {}, now: NOW, canManage: true, href });
		expect(next?.id).toBe('done');
		const withoutPublished = ITEMS.filter((i) => !['done', 'worksheet', 'next', 'later'].includes(i.id));
		// Only the draft and the scheduled one are left ahead of now: neither counts.
		expect(nextDueFor({ items: withoutPublished, work: {}, now: NOW, canManage: true, href })).toBeNull();
		// Positive control: published and live, the same draft would be next.
		expect(
			nextDueFor({ items: [item('draft', '2026-09-24T19:00:00.000Z')], work: {}, now: NOW, canManage: true, href })?.id
		).toBe('draft');
	});

	it('no clock, no key; nothing ahead, no key', () => {
		expect(nextDueFor({ items: ITEMS, work: {}, now: null, canManage: false, href })).toBeNull();
		expect(nextDueFor({ items: [item('old', '2026-01-01T00:00:00Z')], work: {}, now: NOW, canManage: false, href })).toBeNull();
	});
});

describe('the identity chip and the teams key', () => {
	it('code, section, block and teacher, in the existing words', () => {
		expect(classHeaderMeta(SECTION)).toBe('IDEA100 · Section 2 · Block 1 · apina');
		expect(classHeaderMeta({ ...SECTION, course: null, block: null })).toBe('Section 2 · apina');
	});
	it('the teams key needs both the sentence and the link', () => {
		expect(classHeaderTeams('Teams posted until you take them down', { href: '/p', label: 'People' })).toEqual({
			text: 'Teams posted until you take them down',
			href: '/p',
			label: 'People'
		});
		expect(classHeaderTeams(null, { href: '/p', label: 'People' })).toBeNull();
		expect(classHeaderTeams('x', null)).toBeNull();
	});
});

const snippet = (html: string) => createRawSnippet(() => ({ render: () => html }));
const THEME = resolveClassTheme({ winners: { palette: 'steel', pattern: 'ripples', badge: 'flame' }, accent: 'gold' })!;
const header = (props: Record<string, unknown>) =>
	render(ClassHeader, { props: { section: SECTION, ...props } as never }).body;
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe('the header markup', () => {
	it('owns exactly one h1 while the list is the page, and an h2 while an item is open', () => {
		const page = header({});
		expect(count(page, '<h1')).toBe(1);
		expect(count(page, '<h2')).toBe(0);
		expect(page).toContain('class="pane-title');
		const pane = header({ asPane: true });
		expect(count(pane, '<h1')).toBe(0);
		expect(count(pane, '<h2')).toBe(1);
	});

	it('a class with no theme has no banner, no style and no pattern layer, beside a themed render', () => {
		const plain = header({ theme: null });
		for (const needle of ['ct-banner', 'ct-pattern', 'style=', 'Class theme:', 'class-banner']) {
			expect(plain, needle).not.toContain(needle);
		}
		const themed = header({ theme: THEME });
		expect(count(themed, 'data-testid="class-banner"')).toBe(1);
		expect(count(themed, 'data-testid="class-banner-pattern"')).toBe(1);
		expect(count(themed, '<h1')).toBe(1);
		// ONE badge, beside the title: the banner draws no column of its own.
		expect(count(themed, 'data-testid="class-banner-badge"')).toBe(1);
		expect(themed.indexOf('data-testid="class-banner-badge"')).toBeLessThan(themed.indexOf('<h1'));
		expect(themed.indexOf('data-testid="class-banner-badge"')).toBeGreaterThan(themed.indexOf('data-testid="class-header"'));
		expect(count(plain, 'class-banner-badge')).toBe(0);
	});

	it('a student gets no teacher key; a teacher gets Quick post, the teams key and the actions', () => {
		const student = header({
			nextDue: { id: 'next', title: 'Truss sketch', href: '/x', dueAt: NOW, when: 'Sep 25, 11:59 PM' }
		});
		expect(count(student, 'data-testid="quick-post-open"')).toBe(0);
		expect(count(student, 'data-testid="class-header-teams"')).toBe(0);
		expect(count(student, 'data-testid="harness-action"')).toBe(0);
		expect(count(student, 'data-testid="class-next-due"')).toBe(1);

		const teacher = header({
			quickPost: { open: false, toggle: () => undefined },
			teams: { text: 'Teams posted until you take them down', href: '/people', label: 'People' },
			actions: snippet('<button type="button" class="btn secondary tiny" data-testid="harness-action">New post</button>')
		});
		expect(count(teacher, 'data-testid="quick-post-open"')).toBe(1);
		expect(count(teacher, 'data-testid="class-header-teams"')).toBe(1);
		expect(count(teacher, 'data-testid="harness-action"')).toBe(1);
		expect(teacher).toContain('Manage in People');
	});

	it('renders the key row (tools, theme), the notices and what follows, in that order', () => {
		const html = header({
			tools: snippet('<div data-testid="t-tools"></div>'),
			themePanel: snippet('<div data-testid="t-theme"></div>'),
			bulletin: snippet('<section data-testid="t-notices"></section>'),
			below: snippet('<section data-testid="t-teams"></section>')
		});
		const order = ['class-header-row', 't-tools', 't-theme', 't-notices', 't-teams'].map((id) =>
			html.indexOf(`data-testid="${id}"`)
		);
		expect(order.every((i) => i >= 0)).toBe(true);
		expect([...order].sort((a, b) => a - b)).toEqual(order);
		// The notices sit OUTSIDE the header, after it, where a student cannot miss them.
		expect(html.indexOf('</header>')).toBeLessThan(html.indexOf('data-testid="t-notices"'));
	});
});
