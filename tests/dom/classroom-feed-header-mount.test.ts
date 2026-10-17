// tests/dom/classroom-feed-header-mount.test.ts
//
// ONE CLICK INTO A CLASS FROM THE HOME PAGE (ledger 0396, part 3).
//
// The home page's class card header used to be ONE <button> that folded the
// card, so the only way into a class was the "Open class" link at the foot of
// the open list. It is now TWO SIBLING CONTROLS: the class's identity is one
// real <a> to `{basePath}/{section.id}`, and the fold is its own <button> at
// the header's right edge.
//
// WHY THIS IS A TEST AND NOT ONLY A HARNESS PASS: the two defects it pins are
// silent in use. A click on the link that ALSO reached the fold would fold the
// card and then navigate away, so nobody would ever see the fold happen; and a
// button nested inside the anchor renders identically while being invalid
// markup whose click reaches both. The browser half (a real click navigating,
// Tab order with real key presses, geometry) is
// tools/browser-verify/routes/home-feed-state-fold-key.mjs and
// home-feed-base-dev-state-class-link.mjs, plus the script recorded in the
// bundle's history entry.
//
// NO GEOMETRY IS ASSERTED HERE. See `tests/dom/mount.ts` for why.

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import ClassroomFeed from '$lib/classroom/ClassroomFeed.svelte';
import { buildFeed, type FeedSubmission } from '$lib/classroom/feed';
import type { ClassroomItem, ClassroomSection } from '$lib/classroom/classroom';
import { mountInto, type Mounted } from './mount';

const Feed = ClassroomFeed as unknown as Component<Record<string, unknown>>;
const NOW = new Date('2026-10-15T12:00:00Z');

const course = { id: 'c1', code: 'IDEA209H', title: 'Engineering Design', active: true };
const section = (id: string, label: string): ClassroomSection =>
	({
		id,
		course_id: 'c1',
		label,
		block: 'Block 2',
		teacher_email: 'apina@boscotech.edu',
		active: true,
		course
	}) as ClassroomSection;

const SECTIONS = [section('sec-a', 'Section 1'), section('sec-b', 'Section 2')];

const ITEM = {
	id: 'item-1',
	kind: 'assignment',
	title: 'Blade sketch',
	body: '',
	points: 10,
	due_at: '2026-10-17T07:00:00Z',
	category: null,
	author_email: 'apina@boscotech.edu',
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
	postings: [{ section_id: 'sec-a' }]
} as unknown as ClassroomItem;

const feeds = buildFeed({
	sections: SECTIONS,
	items: [ITEM],
	submissions: [] as FeedSubmission[],
	myEmail: 'alice@boscotech.net',
	now: NOW
});

let mounted: Mounted[] = [];
afterEach(async () => {
	for (const m of mounted) await m.stop();
	mounted = [];
});

function open(props: Record<string, unknown> = {}) {
	const calls: string[] = [];
	const m = mountInto(Feed, {
		feeds,
		collapsed: [],
		onToggle: (id: string) => calls.push(id),
		now: NOW,
		...props
	});
	/* A link click in happy-dom would try to navigate the test's window. The
	   capture listener on the mount target runs before the component's own
	   (delegated) handlers, cancels only the default action, and lets the
	   event propagate, so a handler on the anchor would still run and be
	   counted. */
	m.target.addEventListener(
		'click',
		(e) => {
			if ((e.target as Element).closest('a')) e.preventDefault();
		},
		true
	);
	mounted.push(m);
	return { m, calls };
}

const cards = (m: Mounted) => m.all<HTMLElement>('.feed-card');
const linkOf = (card: Element) => card.querySelector<HTMLAnchorElement>('[data-testid="feed-open"]')!;
const foldOf = (card: Element) => card.querySelector<HTMLButtonElement>('[data-testid="feed-toggle"]')!;
const click = (el: Element) =>
	el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

describe('the class card header is a link and a fold, side by side', () => {
	it('gives every card one link to its class and one fold key that owns its list', () => {
		const { m } = open();
		expect(cards(m)).toHaveLength(2);
		for (const [i, card] of cards(m).entries()) {
			const id = SECTIONS[i].id;
			expect(card.querySelectorAll('[data-testid="feed-open"]')).toHaveLength(1);
			expect(card.querySelectorAll('[data-testid="feed-toggle"]')).toHaveLength(1);
			expect(linkOf(card).tagName).toBe('A');
			expect(linkOf(card).getAttribute('href')).toBe(`/classroom/${id}`);
			const fold = foldOf(card);
			expect(fold.tagName).toBe('BUTTON');
			expect(fold.getAttribute('type')).toBe('button');
			expect(fold.getAttribute('aria-expanded')).toBe('true');
			const list = card.querySelector(`#${fold.getAttribute('aria-controls')}`);
			expect(list?.classList.contains('assignment-list')).toBe(true);
			// The identity lives inside the link: code, section, title and teacher.
			const words = linkOf(card).textContent!.replace(/\s+/g, ' ');
			expect(words).toContain('IDEA209H');
			expect(words).toContain(SECTIONS[i].label);
			expect(words).toContain('Engineering Design');
			expect(words).toContain('apina');
			// The bottom door is still there while the card is open.
			expect(card.querySelector('.assignment-list .feed-more')?.getAttribute('href')).toBe(
				`/classroom/${id}`
			);
		}
	});

	it('nests neither control inside the other, and puts the link first in tab order', () => {
		const { m } = open();
		// Positive control: both controls exist, so the absence below is real.
		expect(m.all('[data-testid="feed-open"]')).toHaveLength(2);
		expect(m.all('[data-testid="feed-toggle"]')).toHaveLength(2);
		expect(m.all('a button, a a, button a, button button, a [tabindex], button [tabindex]')).toHaveLength(0);
		expect(m.all('button.course-header')).toHaveLength(0);
		for (const card of cards(m)) {
			const link = linkOf(card);
			const fold = foldOf(card);
			expect(link.contains(fold)).toBe(false);
			expect(fold.contains(link)).toBe(false);
			expect(link.parentElement).toBe(fold.parentElement);
			// DOCUMENT_POSITION_FOLLOWING: the fold comes after the link.
			expect(link.compareDocumentPosition(fold) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
			expect(fold.hasAttribute('tabindex')).toBe(false);
			expect(link.hasAttribute('tabindex')).toBe(false);
		}
	});

	it('a click on the fold reports that card to the parent once, and the link is untouched', () => {
		const { m, calls } = open();
		click(foldOf(cards(m)[1]));
		expect(calls).toEqual(['sec-b']);
		click(foldOf(cards(m)[0]));
		expect(calls).toEqual(['sec-b', 'sec-a']);
		// The fold has no anchor above it, so a fold click has nothing to follow.
		expect(foldOf(cards(m)[0]).closest('a')).toBeNull();
	});

	it('a click on the link, or on any word inside it, never reaches the fold', () => {
		const { m, calls } = open();
		const card = cards(m)[0];
		click(linkOf(card));
		click(card.querySelector('.course-id')!);
		click(card.querySelector('.course-updated')!);
		click(card.querySelector('.section-meta')!);
		expect(calls).toEqual([]);
		// Positive control in the same mount: the fold still reports.
		click(foldOf(card));
		expect(calls).toEqual(['sec-a']);
	});

	it('leaves the fold state to the parent: a press with nobody persisting it changes nothing', () => {
		// `onToggle` is the persistence path (the home page writes
		// profiles.preferences.classroomFeed). The component holds no fold
		// state of its own, so a press only ever ASKS.
		const { m } = open({ onToggle: () => {} });
		const fold = foldOf(cards(m)[0]);
		click(fold);
		m.flush();
		expect(fold.getAttribute('aria-expanded')).toBe('true');
	});

	it('draws the folded state from `collapsed`: the word, the state and an inert list', () => {
		const { m } = open({ collapsed: ['sec-a'] });
		const [folded, openCard] = cards(m);
		expect(folded.classList.contains('collapsed')).toBe(true);
		expect(foldOf(folded).getAttribute('aria-expanded')).toBe('false');
		expect(foldOf(folded).querySelector('.feed-toggle-word')!.textContent).toBe('Show');
		expect(folded.querySelector('.assignment-list')!.hasAttribute('inert')).toBe(true);
		// Folded or not, the class link is one click away.
		expect(linkOf(folded).getAttribute('href')).toBe('/classroom/sec-a');

		expect(openCard.classList.contains('collapsed')).toBe(false);
		expect(foldOf(openCard).getAttribute('aria-expanded')).toBe('true');
		expect(foldOf(openCard).querySelector('.feed-toggle-word')!.textContent).toBe('Hide');
		expect(openCard.querySelector('.assignment-list')!.hasAttribute('inert')).toBe(false);
	});

	it('names each fold by its word and its class, and hides the arrow from assistive tech', () => {
		const { m } = open();
		for (const [i, card] of cards(m).entries()) {
			const fold = foldOf(card);
			const name = Array.from(fold.childNodes)
				.filter((n) => !(n instanceof Element && n.getAttribute('aria-hidden') === 'true'))
				.map((n) => n.textContent)
				.join('')
				.replace(/\s+/g, ' ')
				.trim();
			expect(name).toBe(`Hide IDEA209H ${SECTIONS[i].label}`);
			expect(fold.querySelector('svg.course-collapse-arrow')?.getAttribute('aria-hidden')).toBe('true');
		}
	});

	it('follows basePath, so a harness can point the link somewhere it can open', () => {
		const { m } = open({ basePath: '/dev/home-feed/class' });
		expect(cards(m).map((c) => linkOf(c).getAttribute('href'))).toEqual([
			'/dev/home-feed/class/sec-a',
			'/dev/home-feed/class/sec-b'
		]);
	});
});
