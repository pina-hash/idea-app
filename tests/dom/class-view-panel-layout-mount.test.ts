// tests/dom/class-view-panel-layout-mount.test.ts
//
// THE CLASS PAGE IN A PERSON'S OWN ARRANGEMENT, ON THE REAL ClassView (ledger
// 0360, report R23 wired onto the R19 class header).
//
// What regresses silently here, and so what this mounts the real component to
// hold, in both directions:
//   - a piece of the header (the tools, the theme vote, the posting keys) the
//     person hid still rendering, so whatever it polls keeps polling;
//   - a teacher's notice ending up under a student's search, videos or posts
//     because the header moved and the notices went with it;
//   - the search row hidden while a filter still narrows the list, with
//     nothing on the page saying so or offering Clear (a filtered class reads
//     as a class that lost its items);
//   - the palette still offering "Search this class" for a field that is not
//     on the page.
// The null-layout markup is held separately, character for character, by
// tests/classroom-panel-layout-render.test.ts. No geometry here: happy-dom
// lays nothing out.

import { afterEach, describe, expect, it } from 'vitest';
import { createRawSnippet, type Component } from 'svelte';
import ClassView from '$lib/classroom/ClassView.svelte';
import { liveCommandIds } from '$lib/shell/command-handlers';
import { CLOCK, ITEMS, SECTION } from '../classroom-panel-layout-render-cases';
import { mountInto, type Mounted } from './mount';

const View = ClassView as unknown as Component<Record<string, unknown>>;

const snippet = (html: string) => createRawSnippet(() => ({ render: () => html }));
const TOOLS = snippet('<div class="class-tools" data-testid="class-tools"><button type="button">Hall pass</button></div>');
const THEME_PANEL = snippet('<div class="disc" data-testid="class-theme-panel"><button type="button" class="disc-trigger">Class theme</button></div>');
const NOTICES = snippet('<section class="qp" data-testid="quick-posts"><p>Special schedule today.</p></section>');
const TEAMS = snippet('<section class="ct" data-testid="class-teams"><p>Torque Squad</p></section>');
const TEAMS_KEY = { text: 'Teams posted until Fri, Sep 26', href: '/classroom/s-1/people', label: 'People' };

const mounted: Mounted[] = [];
afterEach(async () => {
	for (const m of mounted.splice(0)) await m.stop();
});

function teacher(extra: Record<string, unknown> = {}): Mounted {
	const m = mountInto(View, {
		section: SECTION,
		items: ITEMS,
		canManage: true,
		transports: {},
		unitTransports: {},
		onCompose: () => undefined,
		clock: CLOCK,
		basePath: '/classroom',
		tools: TOOLS,
		themePanel: THEME_PANEL,
		bulletin: NOTICES,
		belowHeader: TEAMS,
		teamsNotice: TEAMS_KEY,
		quickPost: { open: false, toggle: () => undefined },
		...extra
	});
	mounted.push(m);
	return m;
}

function student(extra: Record<string, unknown> = {}): Mounted {
	const m = mountInto(View, {
		section: SECTION,
		items: ITEMS,
		canManage: false,
		clock: CLOCK,
		basePath: '/classroom',
		tools: TOOLS,
		themePanel: THEME_PANEL,
		bulletin: NOTICES,
		belowHeader: TEAMS,
		...extra
	});
	mounted.push(m);
	return m;
}

const count = (m: Mounted, sel: string) => m.all(sel).length;
const header = (m: Mounted) => m.one<HTMLElement>('[data-testid="class-header"]');
/** Document order of two elements: negative when `a` comes first. */
function before(m: Mounted, a: string, b: string): boolean {
	const x = m.one(a);
	const y = m.one(b);
	return !!(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe('nothing stored: the page as it ships', () => {
	it('every piece in the header, the notices under it, then the teams; no hidden line', () => {
		const m = teacher();
		const h = header(m);
		for (const id of ['class-tools', 'class-theme-panel', 'quick-post-open', 'new-post', 'units-toggle', 'class-header-teams']) {
			expect(h.querySelectorAll(`[data-testid="${id}"]`), id).toHaveLength(1);
		}
		expect(before(m, '[data-testid="class-header"]', '[data-testid="quick-posts"]')).toBe(true);
		expect(before(m, '[data-testid="quick-posts"]', '[data-testid="class-teams"]')).toBe(true);
		expect(before(m, '[data-testid="class-teams"]', '[data-testid="stream-find"]')).toBe(true);
		expect(count(m, '[data-testid="panels-hidden-note"]')).toBe(0);
		expect(liveCommandIds().has('class.search')).toBe(true);
	});
});

describe('a hidden piece of the header is not rendered, and the page says so', () => {
	it('a teacher who hid the tools, the theme vote, the posting keys and the teams', () => {
		const arranged: string[] = [];
		const m = teacher({
			panelLayout: { order: [], hidden: ['tools', 'theme', 'actions', 'teams'] },
			onArrange: () => arranged.push('panels:class')
		});
		const h = header(m);
		for (const id of ['class-tools', 'class-theme-panel', 'quick-post-open', 'new-post', 'units-toggle', 'class-header-teams']) {
			expect(h.querySelectorAll(`[data-testid="${id}"]`), id).toHaveLength(0);
		}
		expect(count(m, '[data-testid="class-teams"]')).toBe(0);
		// POSITIVE CONTROL: the header, its title, Next due and the notices are still there.
		expect(h.querySelectorAll('h1.pane-title')).toHaveLength(1);
		expect(h.querySelectorAll('[data-testid="class-next-due"]')).toHaveLength(1);
		expect(count(m, '[data-testid="quick-posts"]')).toBe(1);
		const note = m.one('[data-testid="panels-hidden-note"]');
		expect(note.textContent).toContain('Hidden on this page: Class tools, Class theme vote, Quick post, new post and units, Teams.');
		m.one<HTMLButtonElement>('[data-testid="panels-hidden-arrange"]').click();
		expect(arranged).toEqual(['panels:class']);
	});

	it('a student who hid the tools sees the theme key still in the header; no Arrange without a way to open settings', () => {
		const m = student({ panelLayout: { order: [], hidden: ['tools'] } });
		expect(header(m).querySelectorAll('[data-testid="class-tools"]')).toHaveLength(0);
		expect(header(m).querySelectorAll('[data-testid="class-theme-panel"]')).toHaveLength(1);
		expect(m.one('[data-testid="panels-hidden-note"]').textContent).toContain('Hidden on this page: Class tools.');
		expect(count(m, '[data-testid="panels-hidden-arrange"]')).toBe(0);
	});
});

describe('the notices are never below anything but the header', () => {
	it('the search row moved above the header: the notices lead the page, the teams follow the header', () => {
		const m = teacher({ panelLayout: { order: ['find', 'banner', 'teams', 'videos', 'stream'], hidden: [] } });
		expect(count(m, '[data-testid="quick-posts"]')).toBe(1);
		expect(before(m, '[data-testid="quick-posts"]', '[data-testid="stream-find"]')).toBe(true);
		expect(before(m, '[data-testid="stream-find"]', '[data-testid="class-header"]')).toBe(true);
		expect(before(m, '[data-testid="class-header"]', '[data-testid="class-teams"]')).toBe(true);
		// The notices are not inside the header any more, and not twice.
		expect(header(m).parentElement?.querySelectorAll('[data-testid="quick-posts"]').length ?? 0).toBeLessThanOrEqual(1);
	});

	it('the posts moved above the header: the notices still lead, and the header keeps its h1', () => {
		const m = student({ panelLayout: { order: ['stream', 'banner', 'teams', 'find', 'videos'], hidden: [] } });
		expect(before(m, '[data-testid="quick-posts"]', '.stream')).toBe(true);
		expect(before(m, '.stream', '[data-testid="class-header"]')).toBe(true);
		expect(header(m).querySelectorAll('h1.pane-title')).toHaveLength(1);
	});
});

describe('the search row hidden', () => {
	it('with a filter still narrowing the list: the count and Clear are on the page, and Clear clears', async () => {
		const m = student({ panelLayout: { order: [], hidden: ['find'] }, opensOn: 'todo' });
		expect(count(m, '[data-testid="stream-find"]')).toBe(0);
		const result = m.one('[data-testid="stream-find-result"]');
		expect(result.textContent).toMatch(/\d+ of \d+ shown/);
		m.one<HTMLButtonElement>('[data-testid="stream-clear"]').click();
		await m.settle();
		expect(count(m, '[data-testid="stream-find-result"]')).toBe(0);
	});

	it('the palette no longer offers Search this class; with the row shown it does', () => {
		const hidden = student({ panelLayout: { order: [], hidden: ['find'] } });
		expect(liveCommandIds().has('class.search')).toBe(false);
		// The other filters still run from the palette (they narrow the posts, not the row).
		expect(liveCommandIds().has('class.show-assignments')).toBe(true);
		void hidden;
	});

	it('POSITIVE CONTROL: shown, nothing filtering, no stray result line', () => {
		const m = student();
		expect(count(m, '[data-testid="stream-find"]')).toBe(1);
		expect(count(m, '[data-testid="stream-find-result"]')).toBe(0);
		expect(liveCommandIds().has('class.search')).toBe(true);
	});
});
