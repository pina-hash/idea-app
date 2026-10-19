// tests/dom/student-overview-sections-mount.test.ts
//
// ONE STUDENT'S PAGE ON THE REAL StudentOverview, with the classroom store in
// context the way the classroom layout provides it (ledger 0396).
//
// What regresses silently, and so what this holds in both directions:
//   - report bd38fa25: a section the teacher hid still rendering (or its tile,
//     or for the notebook its Needs attention rows and its full-notebook key),
//     and the Sections key appearing where there is no store to save to;
//   - report 08bafda7: a Needs attention row without the Grade and Full screen
//     keys its assignments row has, or with keys going somewhere else, and the
//     keys staying when the page was handed no way to open either.
//   - round 1 of review: a hidden notebook leaving its photos in Their work,
//     a page with every section hidden saying nothing, and the menu staying
//     open after keyboard focus has left it.
//   - round 2: hiding the grade or Coming up leaving the top card in its
//     split arrangement (the empty block beside the pictures).
// No geometry here: happy-dom lays nothing out. The strip's scrolling, the
// page's own scroll position and the menu staying on its key after a tick are
// measured in the browser pass (classroom-student-state-strip, -sections).

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import Host from './student-overview-host.svelte';
import { mountInto, type Mounted } from './mount';
import { createClassroomPreferences } from '$lib/preferences/classroom';
import { STUDENT_PAGE_SECTIONS, type StudentPageSectionId } from '$lib/classroom/student-sections';
import { EMAIL, SECTION, TODAY, fixturePage } from '../../src/routes/dev/classroom-student/fixture';

const H = Host as unknown as Component<Record<string, unknown>>;
const mounted: Mounted[] = [];
afterEach(async () => {
	for (const m of mounted.splice(0)) await m.stop();
});

const PAGE = fixturePage('full');
/**
 * The same page with only its oldest late or missing assignment and its oldest
 * flagged or missing notebook check-in: short enough to sit beside Scores (a
 * check-in row is as tall as an assignment row since polish round C, its date
 * on a line under its words; the harness's `&attention=1&checkins=1`).
 */
const owed = (r: (typeof PAGE.assignments)[number]) => r.chip.missing || r.late;
const firstOwed = PAGE.assignments
	.filter(owed)
	.sort((a, b) => Date.parse(a.dueAt ?? '') - Date.parse(b.dueAt ?? ''))[0].itemId;
const asking = (c: NonNullable<typeof PAGE.notebook>['checkIns'][number]) => c.display === 'flagged' || c.display === 'missing';
const firstAsking = PAGE.notebook!.checkIns.filter(asking).sort((a, b) => a.date.localeCompare(b.date))[0].sessionId;
const balanced = {
	...PAGE,
	assignments: PAGE.assignments.filter((r) => !owed(r) || r.itemId === firstOwed),
	notebook: { ...PAGE.notebook!, checkIns: PAGE.notebook!.checkIns.filter((c) => !asking(c) || c.sessionId === firstAsking) }
};
const BASE = {
	section: SECTION,
	data: PAGE,
	today: TODAY,
	peopleHref: '/people',
	itemHref: (id: string) => `/item/${id}`,
	gradeHref: (id: string) => `/grade/${id}`,
	workHref: (id: string) => `/work/${id}`,
	notebookHref: `/notebook/${EMAIL}`
};

/** Every section's own element on the page, by section id. */
const SECTION_TESTIDS: Record<StudentPageSectionId, string> = {
	grade: 'so-grade',
	upcoming: 'so-upcoming',
	gallery: 'so-slideshow',
	glance: 'so-glance',
	attention: 'so-attention',
	scores: 'so-scores',
	assignments: 'so-assignments',
	notebook: 'so-notebook',
	activity: 'so-activity',
	'hall-passes': 'so-hall-passes',
	teams: 'so-teams',
	coins: 'so-coins',
	models: 'so-models'
};

function store(hidden: StudentPageSectionId[] = []) {
	const s = createClassroomPreferences({ viewer: 'dom-test', account: null, storage: null });
	if (hidden.length) s.set('studentPage', { hidden, scope: 'everywhere', byClass: {} });
	return s;
}

function open(props: Record<string, unknown> = {}, s: ReturnType<typeof store> | null = store()): Mounted {
	const m = mountInto(H, { store: s, props: { ...BASE, ...props } });
	mounted.push(m);
	return m;
}

const present = (m: Mounted) =>
	(Object.keys(SECTION_TESTIDS) as StudentPageSectionId[]).filter((id) => m.all(`[data-testid="${SECTION_TESTIDS[id]}"]`).length > 0);

describe('report bd38fa25: the Sections key shows and hides whole sections', () => {
	it('every section is on the page by default, and the key is there with a store to save to', () => {
		const m = open();
		expect(present(m)).toEqual(STUDENT_PAGE_SECTIONS.map((s) => s.id));
		expect(m.all('[data-testid="so-sections"]')).toHaveLength(1);
		expect(m.all('[data-testid="so-sections-count"]')).toHaveLength(0);
		expect(m.all('.so-tile')).toHaveLength(7);
	});

	it('with no store in context there is no key, and nothing is hidden', () => {
		const m = open({}, null);
		expect(m.all('[data-testid="so-sections"]')).toHaveLength(0);
		expect(present(m)).toEqual(STUDENT_PAGE_SECTIONS.map((s) => s.id));
	});

	it('unticking the notebook takes the card, its tile, its Needs attention rows and its key away, and saves it', () => {
		const s = store();
		const m = open({}, s);
		// Positive control first: the fixture has two notebook rows under Needs attention.
		expect(m.all('[data-testid="so-attention-checkin"]')).toHaveLength(2);
		expect(m.all('[data-tile="notebook"]')).toHaveLength(1);
		expect(m.all('[data-testid="so-notebook-link"]')).toHaveLength(1);

		const key = m.one<HTMLButtonElement>('[data-testid="so-sections"]');
		key.click();
		m.flush();
		expect(key.getAttribute('aria-expanded')).toBe('true');
		expect(key.classList.contains('on')).toBe(true);
		const box = m.one<HTMLInputElement>('[data-testid="so-sections-panel"] input[data-section="notebook"]');
		expect(box.checked).toBe(true);
		box.click();
		m.flush();

		expect(s.current.studentPage.hidden).toEqual(['notebook']);
		expect(m.all('[data-testid="so-notebook"]')).toHaveLength(0);
		expect(m.all('[data-tile="notebook"]')).toHaveLength(0);
		expect(m.all('[data-testid="so-attention-checkin"]')).toHaveLength(0);
		expect(m.all('[data-testid="so-notebook-link"]')).toHaveLength(0);
		// The rest stays, the assignment rows under Needs attention included.
		expect(m.all('[data-testid="so-attention-row"]')).toHaveLength(4);
		expect(m.all('.so-tile')).toHaveLength(6);
		expect(m.one('[data-testid="so-sections-count"]').textContent?.trim()).toBe('1 hidden');

		// Ticking it again brings every piece back.
		m.one<HTMLInputElement>('[data-testid="so-sections-panel"] input[data-section="notebook"]').click();
		m.flush();
		expect(s.current.studentPage.hidden).toEqual([]);
		expect(m.all('[data-testid="so-attention-checkin"]')).toHaveLength(2);
		expect(m.all('[data-testid="so-notebook"]')).toHaveLength(1);
	});

	it('round 2: hiding a figure beside the pictures re-arranges the top card, and ticking it back restores the split', () => {
		const s = store();
		const m = open({}, s);
		const hero = () => m.one<HTMLElement>('.so-hero');
		// Positive control: the page as it shipped, the pictures beside both figures.
		expect(hero().dataset.hero).toBe('split');
		expect(m.all('.so-hero-duo, .so-hero-stack')).toHaveLength(0);

		m.one<HTMLButtonElement>('[data-testid="so-sections"]').click();
		m.flush();
		m.one<HTMLInputElement>('[data-testid="so-sections-panel"] input[data-section="upcoming"]').click();
		m.flush();
		// The pictures stack under the identity; the grade sits beside it in the duo.
		expect(hero().dataset.hero).toBe('stack');
		expect(m.all('.so-hero.so-hero-stack')).toHaveLength(1);
		expect(m.all('.so-hero-duo > [data-testid="so-hero-figures"] [data-testid="so-grade"]')).toHaveLength(1);

		m.one<HTMLInputElement>('[data-testid="so-sections-panel"] input[data-section="grade"]').click();
		m.flush();
		// Both figures gone: still stacked, and no empty figure column to hold a gap.
		expect(hero().dataset.hero).toBe('stack');
		expect(m.all('.so-hero-duo, [data-testid="so-hero-figures"]')).toHaveLength(0);
		expect(m.all('.so-hero-gallery [data-testid="so-slideshow"]')).toHaveLength(1);

		m.one<HTMLInputElement>('[data-testid="so-sections-panel"] input[data-section="gallery"]').click();
		m.flush();
		expect(hero().dataset.hero).toBe('solo');
		expect(m.all('.so-hero-stack, .so-hero-gallery')).toHaveLength(0);

		m.one<HTMLButtonElement>('[data-testid="so-sections-all"]').click();
		m.flush();
		expect(hero().dataset.hero).toBe('split');
		expect(m.all('.so-hero-duo, .so-hero-stack')).toHaveLength(0);
	});

	it('a teacher who hid everything sees the name and the keys, and Show all brings every section back', () => {
		const all = STUDENT_PAGE_SECTIONS.map((x) => x.id);
		const s = store(all);
		const m = open({}, s);
		expect(present(m)).toEqual([]);
		// No empty containers are left to hold a gap.
		expect(m.all('.so-duo, .so-panels, .so-glance, .so-hero-figures, .so-hero-gallery')).toHaveLength(0);
		expect(m.all('[data-testid="so-identity"] .so-name')).toHaveLength(1);
		expect(m.one('[data-testid="so-sections-count"]').textContent?.trim()).toBe(`${all.length} hidden`);
		m.one<HTMLButtonElement>('[data-testid="so-sections"]').click();
		m.flush();
		m.one<HTMLButtonElement>('[data-testid="so-sections-all"]').click();
		m.flush();
		expect(s.current.studentPage.hidden).toEqual([]);
		expect(present(m)).toEqual(all);
	});

	it('a hidden notebook takes its photos out of Their work, on screen and on the printed row', () => {
		const captions = (m: Mounted) => m.all('.sws-thumb').map((b) => b.getAttribute('aria-label') ?? '');
		const printed = (m: Mounted) => m.all('.sws-print figcaption').map((f) => f.textContent?.trim() ?? '');
		// Positive control: the fixture's set holds three notebook pages among seven.
		const shown = open();
		expect(captions(shown)).toHaveLength(7);
		expect(captions(shown).filter((c) => c.includes('Notebook')).length).toBe(3);
		expect(printed(shown).filter((c) => c.startsWith('Notebook')).length).toBeGreaterThan(0);

		const off = open({}, store(['notebook']));
		expect(captions(off)).toHaveLength(4);
		expect(captions(off).filter((c) => c.includes('Notebook'))).toEqual([]);
		expect(printed(off).filter((c) => c.startsWith('Notebook'))).toEqual([]);
	});

	it('with no picture left once the notebook is hidden, the empty sentence names only assignments', () => {
		const notebookOnly = { ...PAGE, gallery: PAGE.gallery.filter((g) => g.source === 'notebook') };
		const off = open({ data: notebookOnly }, store(['notebook']));
		expect(off.one('[data-testid="so-slideshow-empty"]').textContent).toContain('Photos they hand in on an assignment appear here.');
		expect(off.one('[data-testid="so-slideshow-empty"]').textContent).not.toContain('notebook');
		// The other direction: an empty set with the notebook shown names both.
		const empty = open({ data: { ...PAGE, gallery: [] } });
		expect(empty.one('[data-testid="so-slideshow-empty"]').textContent).toContain('notebook entries');
	});

	it('the page says so in words when every section is hidden, and only then', () => {
		const all = STUDENT_PAGE_SECTIONS.map((x) => x.id);
		const none = open({}, store(all));
		expect(none.all('[data-testid="so-all-hidden"]')).toHaveLength(1);
		expect(none.one('[data-testid="so-all-hidden"]').textContent).toContain('Press Sections');
		expect(open({}, store(all.slice(1))).all('[data-testid="so-all-hidden"]')).toHaveLength(0);
		expect(open().all('[data-testid="so-all-hidden"]')).toHaveLength(0);
	});

	it('a group left with one card takes one column, and a full group two', () => {
		const m = open({}, store(['scores', 'activity', 'hall-passes', 'teams', 'coins', 'models']));
		expect(m.one<HTMLElement>('.so-duo').style.getPropertyValue('--so-cols')).toBe('1');
		expect(m.one<HTMLElement>('.so-duo').dataset.arrangement).toBe('single');
		expect(m.one<HTMLElement>('.so-panels').style.getPropertyValue('--so-cols')).toBe('1');
		const full = open({ data: balanced });
		expect(full.one<HTMLElement>('.so-duo').style.getPropertyValue('--so-cols')).toBe('2');
		expect(full.one<HTMLElement>('.so-duo').dataset.arrangement).toBe('side');
		expect(full.one<HTMLElement>('.so-panels').style.getPropertyValue('--so-cols')).toBe('2');
	});

	it('polish round: Needs attention far taller than Scores stacks the pair on screen and keeps two columns on paper', () => {
		// The fixture: four late or missing, two notebook rows, two scores.
		const m = open();
		expect(m.all('[data-testid="so-attention-row"]').length).toBe(4);
		expect(m.all('[data-testid="so-score-bar"]').length).toBe(2);
		const duo = m.one<HTMLElement>('.so-duo');
		expect(duo.dataset.arrangement).toBe('stacked');
		expect(duo.classList.contains('so-duo-stacked')).toBe(true);
		expect(duo.style.getPropertyValue('--so-cols')).toBe('1');
		expect(duo.style.getPropertyValue('--so-cols-print')).toBe('2');
		// Positive control: the same page with one late piece of work and one
		// notebook row is side by side.
		const short = open({ data: balanced });
		expect(short.all('[data-testid="so-attention-row"]').length).toBe(1);
		expect(short.all('[data-testid="so-attention-checkin"]').length).toBe(1);
		expect(short.one<HTMLElement>('.so-duo').classList.contains('so-duo-stacked')).toBe(false);
		// And the bars take up to three columns, never more than there are bars.
		expect(m.one<HTMLElement>('.so-bars').style.getPropertyValue('--so-bar-cols')).toBe('2');
	});

	it('Escape and a press outside close the menu; Escape puts focus back on the key', () => {
		const m = open();
		const key = m.one<HTMLButtonElement>('[data-testid="so-sections"]');
		key.click();
		m.flush();
		m.one<HTMLInputElement>('[data-testid="so-sections-panel"] input').focus();
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		m.flush();
		expect(key.getAttribute('aria-expanded')).toBe('false');
		expect(m.one<HTMLElement>('[data-testid="so-sections-panel"]').hidden).toBe(true);
		expect(document.activeElement).toBe(key);

		key.click();
		m.flush();
		expect(key.getAttribute('aria-expanded')).toBe('true');
		// A press inside the panel keeps it open; a press on the page closes it.
		m.one('[data-testid="so-sections-panel"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		m.flush();
		expect(key.getAttribute('aria-expanded')).toBe('true');
		m.one('[data-testid="so-assignments"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		m.flush();
		expect(key.getAttribute('aria-expanded')).toBe('false');
	});

	it('focus leaving the menu closes it without moving focus; focus moving inside it keeps it open', () => {
		const m = open();
		const key = m.one<HTMLButtonElement>('[data-testid="so-sections"]');
		key.click();
		m.flush();
		const first = m.one<HTMLInputElement>('[data-testid="so-sections-panel"] input');
		const done = m.one<HTMLButtonElement>('[data-testid="so-sections-done"]');
		const outside = m.one<HTMLAnchorElement>('[data-testid="so-notebook-link"]');
		// Inside to inside (a Tab from a box to Done): still open.
		first.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: done }));
		m.flush();
		expect(key.getAttribute('aria-expanded')).toBe('true');
		// A null target (a click on the panel's own blank space, the window losing focus): still open.
		done.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
		m.flush();
		expect(key.getAttribute('aria-expanded')).toBe('true');
		// Done to the next key on the page (a Tab past the panel): closed, and focus is not moved.
		outside.focus();
		done.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }));
		m.flush();
		expect(key.getAttribute('aria-expanded')).toBe('false');
		expect(m.one<HTMLElement>('[data-testid="so-sections-panel"]').hidden).toBe(true);
		expect(document.activeElement).toBe(outside);
	});
});

describe('report 08bafda7: Needs attention carries the assignment row\'s own keys', () => {
	const keysOf = (row: Element) =>
		[...row.querySelectorAll('.so-row-key')].map((a) => `${a.textContent?.trim()} ${a.getAttribute('href')}`);

	it('each attention row has Grade then Full screen, going where its assignments row goes', () => {
		const m = open();
		const rows = m.all('[data-testid="so-attention-row"]');
		expect(rows).toHaveLength(4);
		for (const row of rows) {
			const href = row.querySelector('.so-link')?.getAttribute('href') ?? '';
			const itemId = href.replace('/item/', '');
			const tableRow = m.one(`[data-testid="so-assignment-row"][data-item="${itemId}"]`);
			expect(keysOf(row)).toEqual([`Grade /grade/${itemId}`, `Full screen /work/${itemId}`]);
			expect(keysOf(row)).toEqual(keysOf(tableRow));
		}
		expect(m.all('[data-testid="so-attention"] [data-testid="so-grade-link"]')).toHaveLength(4);
		expect(m.all('[data-testid="so-attention"] [data-testid="so-work-link"]')).toHaveLength(4);
	});

	it('with no way to open either, neither list has the keys', () => {
		const m = open({ gradeHref: null, workHref: null });
		expect(m.all('[data-testid="so-attention-row"]')).toHaveLength(4);
		expect(m.all('[data-testid="so-assignment-row"]')).toHaveLength(7);
		expect(m.all('.so-row-key')).toHaveLength(0);
	});

	it('an item the grading console cannot name loses Grade on both lists and keeps Full screen', () => {
		const m = open({ gradeHref: (id: string) => (id === 'a-safety' ? null : `/grade/${id}`) });
		const attention = m.all('[data-testid="so-attention-row"]').find((r) => r.querySelector('.so-link')?.getAttribute('href') === '/item/a-safety')!;
		const table = m.one('[data-testid="so-assignment-row"][data-item="a-safety"]');
		expect(keysOf(attention)).toEqual(['Full screen /work/a-safety']);
		expect(keysOf(table)).toEqual(['Full screen /work/a-safety']);
	});
});
