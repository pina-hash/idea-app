// tests/classroom-panel-layout.test.ts
//
// EACH PERSON ARRANGES THE CLASS PAGE AND THE ITEM PAGE (ledger 0360, report
// R23, phase 1): hide, show and reorder the panels, saved to the account.
//
// WHY A TEST. `readPanelLayout` is a VISIBILITY FILTER over a value anybody's
// browser can write into their own profile row: an unknown id must never be
// coerced into a known one, and the anchor (the posts, the work) and the
// panels that may not be hidden (the class banner holding the h1, the notebook
// check-in a student owes) must never be hidden by a stored value, whatever
// wrote it. A permissive reader is invisible in normal use -- nobody's row
// carries a forged id -- so it is pinned here, with a mutation run in the
// permissive direction (accept an unknown id; accept a hidden anchor).
//
// The defaults are fixtures typed from the pages as they render today, not
// read back from the module: the class page's five moving panels in DOM order
// (the header, the teams, the search row, the videos, the posts -- the R19
// header holds the tools, the theme vote and the posting keys as pieces), and
// the item page for all four 0193 placements of links and files, with the
// rubric moved below the work (report R20).

import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import PanelsHiddenNote from '../src/lib/classroom/PanelsHiddenNote.svelte';
import {
	CLASS_PANELS,
	ITEM_PANELS,
	PANEL_ID,
	anchorOf,
	classNoticesFirst,
	classPanelDefaults,
	editorOrder,
	itemPanelDefaults,
	mergePanelOrder,
	movePanel,
	normalizePanelLayout,
	panelLabels,
	panelSummary,
	panelsForRole,
	piecesOf,
	readPanelLayout,
	resolvePanels,
	togglePanelHidden,
	withPanelOrder
} from '../src/lib/classroom/panel-layout';

describe('the registries', () => {
	it('every id is a stored-vocabulary id, unique, with one anchor per page that can neither hide nor be offered a toggle', () => {
		for (const [page, defs] of [['class', CLASS_PANELS], ['item', ITEM_PANELS]] as const) {
			const ids = defs.map((d) => d.id);
			expect(new Set(ids).size, page).toBe(ids.length);
			for (const id of ids) expect(PANEL_ID.test(id), id).toBe(true);
			const anchors = defs.filter((d) => d.anchor);
			expect(anchors, page).toHaveLength(1);
			expect(anchors[0].hideable).toBe(false);
			// Every panel that may not hide says why, in a sentence.
			for (const d of defs.filter((x) => !x.hideable)) expect(d.keep, d.id).toMatch(/\.$/);
			for (const d of defs) expect(d.label.length, d.id).toBeGreaterThan(2);
		}
		expect(anchorOf('class')).toBe('stream');
		expect(anchorOf('item')).toBe('work');
	});

	it('the panels that may not be hidden are the h1, the obligation, the content and the two anchors', () => {
		expect(CLASS_PANELS.filter((d) => !d.hideable).map((d) => d.id)).toEqual(['banner', 'stream']);
		expect(ITEM_PANELS.filter((d) => !d.hideable).map((d) => d.id)).toEqual(['notebook', 'reference', 'work']);
	});

	it('the manager-only panel is offered to a manager and not a student', () => {
		expect(panelsForRole('class', 'manager').map((d) => d.id)).toContain('actions');
		expect(panelsForRole('class', 'student').map((d) => d.id)).not.toContain('actions');
		expect(panelsForRole('class', 'student')).toHaveLength(CLASS_PANELS.length - 1);
	});

	it('the class header holds three pieces that hide in place; a piece names a real host and the item page has none', () => {
		expect(piecesOf('class', 'banner').map((d) => d.id)).toEqual(['tools', 'theme', 'actions']);
		const pieces = CLASS_PANELS.filter((d) => d.within);
		expect(pieces).toHaveLength(3);
		for (const d of pieces) {
			const host = CLASS_PANELS.find((h) => h.id === d.within);
			expect(host, d.id).toBeTruthy();
			expect(host?.within, d.id).toBeUndefined();
			expect(host?.anchor, d.id).toBeUndefined();
			expect(d.hideable, d.id).toBe(true);
		}
		for (const d of ITEM_PANELS) {
			expect(d.within, d.id).toBeUndefined();
			expect(piecesOf('item', d.id)).toEqual([]);
		}
		// The ids R19 folded into the header are still in the vocabulary: they are stored.
		expect(CLASS_PANELS.map((d) => d.id).sort()).toEqual(
			['actions', 'banner', 'find', 'stream', 'teams', 'theme', 'tools', 'videos']
		);
	});
});

describe('with nothing stored, both pages render exactly as they ship', () => {
	it("the class page: the order it renders today, the header's pieces riding inside it", () => {
		expect(classPanelDefaults()).toEqual(['banner', 'teams', 'find', 'videos', 'stream']);
	});

	it('every class panel present and nothing stored: the header first, no piece placed or hidden', () => {
		const present = CLASS_PANELS.map((d) => d.id);
		const r = resolvePanels('class', classPanelDefaults(), null, present);
		expect(r).toEqual({ above: ['banner', 'teams', 'find', 'videos'], anchor: 'stream', below: [], hidden: [] });
		// With the header leading, the notices sit under it, where they always were.
		expect(classNoticesFirst(r)).toBe(false);
	});

	it('the item page, for every placement of links and files the author can choose (0193), with the rubric last (R20)', () => {
		expect(itemPanelDefaults({ links: 'bottom', files: 'bottom' })).toEqual(
			['deck', 'notebook', 'body', 'reference', 'links', 'files', 'work', 'rubric']
		);
		expect(itemPanelDefaults({ links: 'top', files: 'bottom' })).toEqual(
			['deck', 'notebook', 'links', 'body', 'reference', 'files', 'work', 'rubric']
		);
		expect(itemPanelDefaults({ links: 'bottom', files: 'top' })).toEqual(
			['deck', 'notebook', 'files', 'body', 'reference', 'links', 'work', 'rubric']
		);
		expect(itemPanelDefaults({ links: 'top', files: 'top' })).toEqual(
			['deck', 'notebook', 'links', 'files', 'body', 'reference', 'work', 'rubric']
		);
	});

	it('resolvePanels with no layout splits the defaults around the anchor and hides nothing', () => {
		const all = classPanelDefaults();
		const r = resolvePanels('class', all, null, all);
		expect(r).toEqual({ above: all.slice(0, -1), anchor: 'stream', below: [], hidden: [] });
		const item = itemPanelDefaults();
		const ri = resolvePanels('item', item, null, item);
		expect(ri.above).toEqual(['deck', 'notebook', 'body', 'reference', 'links', 'files']);
		expect(ri.anchor).toBe('work');
		expect(ri.below).toEqual(['rubric']);
	});
});

describe('readPanelLayout is a visibility filter that fails toward showing', () => {
	it('drops unknown ids, duplicates, non-strings and shapes it does not recognise', () => {
		expect(readPanelLayout(null, 'class')).toBeNull();
		expect(readPanelLayout('junk', 'class')).toBeNull();
		expect(readPanelLayout([], 'class')).toBeNull();
		expect(readPanelLayout({}, 'class')).toBeNull();
		expect(readPanelLayout({ order: [], hidden: [] }, 'class')).toBeNull();
		const r = readPanelLayout(
			{
				order: ['stream', 'tools', 'tools', 'nope', 7, 'Banner', 'work', '__proto__', 'teams'],
				hidden: ['videos', 'videos', 'rubric', null, 'secret-panel']
			},
			'class'
		);
		// `work` is an ITEM panel, so it means nothing on the class page.
		// `tools` is a piece of the header: a known id, kept, and placed nowhere.
		expect(r).toEqual({ order: ['stream', 'tools', 'teams'], hidden: ['videos'] });
	});

	it('never hides the anchor or a panel that may not be hidden, whatever the row says', () => {
		expect(readPanelLayout({ order: [], hidden: ['stream', 'banner'] }, 'class')).toBeNull();
		expect(readPanelLayout({ order: [], hidden: ['work', 'notebook', 'reference', 'rubric'] }, 'item')).toEqual({
			order: [],
			hidden: ['rubric']
		});
		// And resolvePanels refuses them a second time, for a layout handed in directly.
		const r = resolvePanels('class', classPanelDefaults(), { order: [], hidden: ['stream', 'banner', 'videos'] }, classPanelDefaults());
		expect(r.anchor).toBe('stream');
		expect(r.above).toContain('banner');
		expect(r.hidden).toEqual(['videos']);
	});

	it('caps a list at the registry length', () => {
		const long = Array.from({ length: 50 }, () => 'tools');
		expect(readPanelLayout({ order: long, hidden: [] }, 'class')).toEqual({ order: ['tools'], hidden: [] });
	});

	it('an order saved before the header held the pieces is placed without them; a hidden piece stays hidden', () => {
		const r = readPanelLayout({ order: ['actions', 'stream', 'tools', 'banner', 'theme'], hidden: ['tools', 'theme'] }, 'class');
		expect(r).toEqual({ order: ['actions', 'stream', 'tools', 'banner', 'theme'], hidden: ['tools', 'theme'] });
		const placed = resolvePanels('class', classPanelDefaults(), r, CLASS_PANELS.map((d) => d.id));
		expect(placed.above).toEqual([]);
		expect(placed.below).toEqual(['banner', 'teams', 'find', 'videos']);
		expect(placed.hidden).toEqual(['tools', 'theme']);
	});
});

describe('a stored order over the defaults', () => {
	it('an empty stored order is the defaults; a partial one keeps its order and slots the rest in by default position', () => {
		const d = classPanelDefaults();
		expect(mergePanelOrder([], d)).toEqual(d);
		// A layout stored before `videos` existed: `videos` lands after `find`,
		// where its default puts it, not at the end. The pieces in it are dropped.
		expect(mergePanelOrder(['stream', 'tools', 'teams', 'banner', 'theme', 'actions', 'find'], d)).toEqual(
			['stream', 'teams', 'banner', 'find', 'videos']
		);
		// A missing FIRST default goes first.
		expect(mergePanelOrder(['teams', 'stream'], ['tools', 'teams', 'stream'])).toEqual(['tools', 'teams', 'stream']);
		// Ids the page does not render are dropped.
		expect(mergePanelOrder(['work', 'tools'], ['tools', 'stream'])).toEqual(['tools', 'stream']);
	});

	it('the anchor is never in above, below or hidden, and every present panel lands in exactly one list', () => {
		const d = classPanelDefaults();
		const layouts = [
			null,
			{ order: ['stream', ...d.filter((x) => x !== 'stream')], hidden: [] },
			{ order: ['tools', 'stream', 'teams'], hidden: ['videos', 'theme'] },
			{ order: [...d].reverse(), hidden: ['tools', 'teams', 'theme', 'actions', 'find', 'videos'] }
		];
		let cases = 0;
		for (const layout of layouts) {
			const r = resolvePanels('class', d, layout, d);
			expect([...r.above, ...r.below, ...r.hidden]).not.toContain('stream');
			expect(r.anchor).toBe('stream');
			const placed = [...r.above, ...r.below, ...r.hidden].sort();
			expect(placed).toEqual(d.filter((x) => x !== 'stream').sort());
			cases += 1;
		}
		expect(cases).toBe(4);
	});

	it('a hidden piece is named right after its host and placed nowhere; a shown piece is in no list', () => {
		const present = CLASS_PANELS.map((d) => d.id);
		const r = resolvePanels('class', classPanelDefaults(), { order: [], hidden: ['teams', 'actions', 'tools'] }, present);
		expect(r.above).toEqual(['banner', 'find', 'videos']);
		expect(r.hidden).toEqual(['tools', 'actions', 'teams']);
		for (const piece of ['tools', 'theme', 'actions']) {
			expect([...r.above, ...r.below], piece).not.toContain(piece);
		}
		// `theme` is shown: it is in none of the lists, because the header draws it.
		expect(r.hidden).not.toContain('theme');
		// A hidden piece that would not have rendered is not reported.
		const noTools = resolvePanels('class', classPanelDefaults(), { order: [], hidden: ['tools'] }, present.filter((x) => x !== 'tools'));
		expect(noTools.hidden).toEqual([]);
	});

	it('the notices lead the page exactly when something renders above the header', () => {
		const present = CLASS_PANELS.map((d) => d.id);
		const at = (order: string[], hidden: string[] = []) =>
			classNoticesFirst(resolvePanels('class', classPanelDefaults(), { order, hidden }, present));
		// Whole orders, as the editor stores them.
		expect(at(['banner', 'teams', 'find', 'videos', 'stream'])).toBe(false);
		expect(at(['banner', 'stream', 'teams', 'find', 'videos'])).toBe(false);
		expect(at(['find', 'banner', 'teams', 'videos', 'stream'])).toBe(true);
		expect(at(['stream', 'banner', 'teams', 'find', 'videos'])).toBe(true);
		expect(at(['teams', 'banner', 'find', 'videos', 'stream'])).toBe(true);
		// Something above the header that is hidden is not above it.
		expect(at(['find', 'banner', 'teams', 'videos', 'stream'], ['find'])).toBe(false);
	});

	it('a panel that is not present is neither rendered nor reported hidden', () => {
		const d = classPanelDefaults();
		const r = resolvePanels('class', d, { order: [], hidden: ['videos'] }, d.filter((x) => x !== 'videos'));
		expect(r.hidden).toEqual([]);
		expect([...r.above, ...r.below]).not.toContain('videos');
		// An item with no work slot (a material) has no anchor, and its panels still render.
		const item = itemPanelDefaults();
		const m = resolvePanels('item', item, null, item.filter((x) => x !== 'work'));
		expect(m.anchor).toBeNull();
		expect(m.above.length + m.below.length).toBe(item.length - 1);
	});

	it('the reordered preset puts the posts above the teams', () => {
		const d = classPanelDefaults();
		const r = resolvePanels('class', d, { order: ['banner', 'stream', 'teams'], hidden: [] }, d);
		expect(r.above).toEqual(['banner']);
		expect(r.below).toEqual(['teams', 'find', 'videos']);
	});
});

describe('editing', () => {
	it('movePanel moves a panel, refuses to move the anchor, and clamps the index', () => {
		const order = classPanelDefaults();
		expect(movePanel('class', order, 'teams', 0).slice(0, 2)).toEqual(['teams', 'banner']);
		expect(movePanel('class', order, 'stream', 0)).toEqual(order);
		// A piece of the header never moves on its own, even handed an order naming it.
		expect(movePanel('class', [...order, 'tools'], 'tools', 0)).toEqual([...order, 'tools']);
		expect(movePanel('class', order, 'videos', 99).at(-1)).toBe('videos');
		expect(movePanel('class', order, 'nope', 0)).toEqual(order);
	});

	it('togglePanelHidden hides and shows, and refuses the anchor and the unhideable', () => {
		const once = togglePanelHidden('class', 'student', null, 'videos');
		expect(once).toEqual({ order: [], hidden: ['videos'] });
		// A piece hides in place.
		expect(togglePanelHidden('class', 'student', null, 'tools')).toEqual({ order: [], hidden: ['tools'] });
		expect(togglePanelHidden('class', 'student', once, 'videos')).toBeNull();
		expect(togglePanelHidden('class', 'student', null, 'stream')).toBeNull();
		expect(togglePanelHidden('class', 'student', null, 'banner')).toBeNull();
		expect(togglePanelHidden('item', 'student', null, 'notebook')).toBeNull();
	});

	it('an order moved back to the default is stored EMPTY, so the item page keeps its author placement', () => {
		const start = editorOrder('item', 'student', null);
		const down = movePanel('item', start, 'body', 4);
		const moved = withPanelOrder('item', 'student', null, down);
		expect(moved?.order.length).toBeGreaterThan(0);
		const back = withPanelOrder('item', 'student', moved, movePanel('item', down, 'body', start.indexOf('body')));
		expect(back).toBeNull();
		// Hiding alone keeps the order empty, and so keeps an item's links on top.
		const hid = togglePanelHidden('item', 'student', null, 'rubric');
		expect(hid?.order).toEqual([]);
		const top = itemPanelDefaults({ links: 'top', files: 'bottom' });
		expect(resolvePanels('item', top, hid, top).above[2]).toBe('links');
	});

	it("the editor's rows are the panels that move; the manager-only piece is offered to a manager only", () => {
		expect(editorOrder('class', 'student', null)).toEqual(['banner', 'teams', 'find', 'videos', 'stream']);
		expect(editorOrder('class', 'manager', null)).toEqual(['banner', 'teams', 'find', 'videos', 'stream']);
		const offered = (role: 'student' | 'manager') => panelsForRole('class', role).map((d) => d.id);
		expect(offered('student')).not.toContain('actions');
		expect(offered('manager')).toContain('actions');
	});

	it('the summary says what an arrangement amounts to, in words', () => {
		expect(panelSummary('class', 'student', null)).toBe('Standard order, nothing hidden');
		expect(panelSummary('class', 'student', { order: [], hidden: ['videos', 'theme'] })).toBe('Standard order, 2 hidden');
		// Moving the anchor is refused (no change, so still the standard order) ...
		const refused = withPanelOrder('class', 'student', null, movePanel('class', editorOrder('class', 'student', null), 'stream', 0));
		expect(panelSummary('class', 'student', refused)).toBe('Standard order, nothing hidden');
		// ... and moving a panel past it is an order of one's own.
		const moved = withPanelOrder('class', 'student', null, movePanel('class', editorOrder('class', 'student', null), 'teams', 99));
		expect(panelSummary('class', 'student', moved)).toBe('Your order, nothing hidden');
		// A hidden piece counts as hidden.
		expect(panelSummary('class', 'student', { order: [], hidden: ['tools'] })).toBe('Standard order, 1 hidden');
		expect(normalizePanelLayout('class', 'student', { order: [], hidden: [] })).toBeNull();
	});
});

describe('the hidden-panels note', () => {
	const html = (props: Record<string, unknown>) => render(PanelsHiddenNote as never, { props: props as never }).body;
	it('names each hidden panel and offers Arrange where the page can open settings; renders nothing when nothing is hidden', () => {
		const labels = panelLabels('class', ['videos', 'theme']);
		expect(labels).toEqual(['Videos', 'Class theme vote']);
		const withArrange = html({ labels, onArrange: () => {} });
		expect(withArrange).toContain('Hidden on this page: Videos, Class theme vote.');
		expect((withArrange.match(/data-testid="panels-hidden-arrange"/g) ?? []).length).toBe(1);
		const noArrange = html({ labels, onArrange: null });
		expect((noArrange.match(/data-testid="panels-hidden-note"/g) ?? []).length).toBe(1);
		expect(noArrange).not.toContain('panels-hidden-arrange');
		const none = html({ labels: [], onArrange: () => {} });
		expect(none).not.toContain('panels-hidden-note');
		expect(none).not.toMatch(/—/);
	});
});
