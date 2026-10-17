import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	bulkInToolbar,
	classToolbars,
	compareToolbarCost,
	greedyToolbarLines,
	toolbarAt,
	toolbarCost,
	toolbarFit,
	toolbarLines,
	toolbarPinnedLines,
	toolbarShape,
	heldStarts,
	type ToolbarItem
} from '../src/lib/classroom/class-toolbar';
import { classPanelDefaults, resolvePanels, type PanelLayout } from '../src/lib/classroom/panel-layout';
import { renderCase, renderCases } from './classroom-panel-layout-render-cases';

/**
 * THE CLASS PAGE'S TOOLBAR UNDER THE BANNER (ledger 0396, part 7).
 *
 * Mr. Pina reported the space between the class banner and the class: the
 * search row, then a full-width row for the closed Videos section, then a row
 * holding only Select all. They are ONE row now, and what has to stay right is
 * invisible in a screenshot of the default page:
 *
 *   - `find` and `videos` are still two panels a person moves and hides
 *     (report R23), so the row must follow the arrangement: join only what sits
 *     side by side, in the person's order, and carry Select all only when it is
 *     directly above the posts it acts on;
 *   - the search field must never change slot, or a remount drops the caret
 *     mid-word whenever the Videos key comes and goes (the videos are the ones
 *     the search leaves showing);
 *   - a student gets no Select all, and a teacher gets exactly one.
 *
 * The first half is the pure decision, swept over every arrangement the editor
 * can produce; the second is the server render of the REAL ClassView over the
 * null-layout cases' own fixture, read as a document. No geometry here: the
 * row's measured height, the gap from the banner to the first unit and the
 * band the open Videos list makes are `npm run verify:browser`'s
 * (`tools/browser-verify/routes/class-header-view-class-items-class*.mjs`).
 */

const ALL_PRESENT = ['banner', 'tools', 'theme', 'actions', 'teams', 'find', 'videos', 'stream'];
const bars = (layout: PanelLayout | null, present: string[] = ALL_PRESENT) =>
	classToolbars(resolvePanels('class', classPanelDefaults(), layout, present));

describe('classToolbars: which panels share the row', () => {
	it('NOTHING STORED: one row, the search then the Videos key, carrying Select all', () => {
		const t = bars(null);
		expect(t).toEqual([{ host: 'find', members: ['find', 'videos'], bulk: true }]);
		expect(bulkInToolbar(t)).toBe(true);
		expect(toolbarAt(t, 'find')).toBe(t[0]);
		// The Videos slot renders nothing of its own: it is drawn in the search's row.
		expect(toolbarAt(t, 'videos')).toBeNull();
	});

	it('a class with no video: the search row alone, still carrying Select all', () => {
		expect(bars(null, ALL_PRESENT.filter((p) => p !== 'videos'))).toEqual([{ host: 'find', members: ['find'], bulk: true }]);
	});

	it('an empty class (no search row, no videos): no toolbar, so the posts keep the bulk controls', () => {
		const t = bars(null, ['banner', 'stream']);
		expect(t).toEqual([]);
		expect(bulkInToolbar(t)).toBe(false);
	});

	it('the Videos key hidden: the search row alone; the search hidden: the Videos key alone, each with Select all', () => {
		expect(bars({ order: [], hidden: ['videos'] })).toEqual([{ host: 'find', members: ['find'], bulk: true }]);
		const videosOnly = bars({ order: [], hidden: ['find'] });
		expect(videosOnly).toEqual([{ host: 'videos', members: ['videos'], bulk: true }]);
		expect(toolbarAt(videosOnly, 'videos')).toBe(videosOnly[0]);
	});

	it('both hidden: no toolbar, and the bulk controls stay with the posts', () => {
		const t = bars({ order: [], hidden: ['find', 'videos'] });
		expect(t).toEqual([]);
		expect(bulkInToolbar(t)).toBe(false);
	});

	it('THE VIDEOS KEY FIRST: one row in the person’s order, but rendered in the SEARCH’S slot', () => {
		const t = bars({ order: ['banner', 'teams', 'videos', 'find', 'stream'], hidden: [] });
		expect(t).toEqual([{ host: 'find', members: ['videos', 'find'], bulk: true }]);
		// And the same slot when this search leaves no video showing: the field
		// is never rebuilt in another slot mid-word.
		const noVideos = bars({ order: ['banner', 'teams', 'videos', 'find', 'stream'], hidden: [] }, ALL_PRESENT.filter((p) => p !== 'videos'));
		expect(noVideos).toEqual([{ host: 'find', members: ['find'], bulk: true }]);
	});

	it('split apart by the teams: two rows, and only the one above the posts carries Select all', () => {
		expect(bars({ order: ['banner', 'find', 'teams', 'videos', 'stream'], hidden: [] })).toEqual([
			{ host: 'find', members: ['find'], bulk: false },
			{ host: 'videos', members: ['videos'], bulk: true }
		]);
		// The search moved above the header: the same split, by the header.
		expect(bars({ order: ['find', 'banner', 'teams', 'videos', 'stream'], hidden: [] })).toEqual([
			{ host: 'find', members: ['find'], bulk: false },
			{ host: 'videos', members: ['videos'], bulk: true }
		]);
	});

	it('below the posts: one row, and Select all stays at the top of the posts it acts on', () => {
		const t = bars({ order: ['stream', 'banner', 'teams', 'find', 'videos'], hidden: [] });
		expect(t).toEqual([{ host: 'find', members: ['find', 'videos'], bulk: false }]);
		expect(bulkInToolbar(t)).toBe(false);
		// Directly under the posts is still not above them.
		expect(bars({ order: ['banner', 'teams', 'stream', 'videos', 'find'], hidden: [] })).toEqual([
			{ host: 'find', members: ['videos', 'find'], bulk: false }
		]);
	});

	it('THE SWEEP: every order of the five moving panels, every hidden set, with and without videos', () => {
		const moving = ['banner', 'teams', 'find', 'videos', 'stream'];
		const perms = (xs: string[]): string[][] =>
			xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
		const hiddenSets = [[], ['teams'], ['find'], ['videos'], ['teams', 'find'], ['teams', 'videos'], ['find', 'videos'], ['teams', 'find', 'videos']];
		let cases = 0;
		for (const order of perms(moving)) {
			for (const hidden of hiddenSets) {
				for (const withVideos of [true, false]) {
					const present = ALL_PRESENT.filter((p) => withVideos || p !== 'videos');
					const resolved = resolvePanels('class', classPanelDefaults(), { order, hidden }, present);
					const t = classToolbars(resolved);
					cases += 1;
					// Every shown toolbar panel is in exactly one row, and nothing else is.
					const shown = [...resolved.above, ...resolved.below].filter((p) => p === 'find' || p === 'videos');
					expect(t.flatMap((b) => b.members).sort()).toEqual([...shown].sort());
					for (const b of t) {
						// A row holding the search renders in the search's slot, always.
						if (b.members.includes('find')) expect(b.host).toBe('find');
						else expect(b.host).toBe(b.members[0]);
						// Its members sit side by side, in the person's order, on one side of the posts.
						const list = resolved.above.includes(b.members[0]) ? resolved.above : resolved.below;
						const at = list.indexOf(b.members[0]);
						expect(list.slice(at, at + b.members.length)).toEqual(b.members);
						// Select all only where the row is the last thing before the posts.
						const last = list === resolved.above && at + b.members.length === list.length;
						expect(b.bulk).toBe(last);
					}
					expect(t.filter((b) => b.bulk).length).toBeLessThanOrEqual(1);
				}
			}
		}
		// 120 orders x 8 hidden sets x 2: a sweep that generated nothing cannot pass.
		expect(cases).toBe(1920);
	});
});

/* ------------------------------------------------------------------------ *
 * THE REAL ClassView, server-rendered over the null-layout cases' fixture.
 * ------------------------------------------------------------------------ */

const [TEACHER, STUDENT, PANE, BARE] = renderCases().map((c) => c.props);

function doc(props: Record<string, unknown>): Document {
	const window = new Window();
	window.document.body.innerHTML = renderCase(props);
	return window.document as unknown as Document;
}
const q = (d: Document | Element, sel: string) => [...d.querySelectorAll(sel)];
const follows = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & 4);

describe('the toolbar on the real class page', () => {
	it('A TEACHER, NOTHING STORED: one row holding the search, the kind filter, the Videos key and Select all, in that order', () => {
		const d = doc(TEACHER);
		const rows = q(d, '.class-toolbar');
		expect(rows).toHaveLength(1);
		const row = rows[0];
		expect(row.getAttribute('data-testid')).toBe('stream-find');
		expect(row.getAttribute('data-toolbar')).toBe('find videos');
		const search = row.querySelector('[data-testid="stream-search"]')!;
		const kind = row.querySelector('[data-testid="stream-kind"]')!;
		const videos = row.querySelector('[data-testid="class-videos-toggle"]')!;
		const all = row.querySelector('[data-testid="bulk-select-all"]')!;
		for (const el of [search, kind, videos, all]) expect(el).not.toBeNull();
		expect(follows(search, kind) && follows(kind, videos) && follows(videos, all)).toBe(true);
		// ONE Select all on the page, in the row, and no bulk row at the top of the posts.
		expect(q(d, '[data-testid="bulk-select-all"]')).toHaveLength(1);
		expect(q(d, '[data-testid="bulk-row"]')).toHaveLength(0);
		// Select all is the row's last control, so it keeps the right edge.
		const keys = [...row.querySelectorAll('button, select, input, a')];
		expect(keys.at(-1)).toBe(all);
		// AT REST IT IS THE ONLY BULK CONTROL (review round 2): no tray, no
		// action of any kind, live or held in reserve, and nothing inert. The
		// tray only exists once something is ticked (`dom/class-view-toolbar-mount`).
		// POSITIVE CONTROL for the absences: Select all itself is found above.
		expect(q(d, '[data-testid="bulk-bar"]')).toHaveLength(0);
		expect(row.querySelectorAll('[inert]')).toHaveLength(0);
		expect(row.classList.contains('selecting')).toBe(false);
		expect(row.textContent).not.toMatch(/Publish|Clear selection|Delete \(/);
		// Its label holds the room of "Deselect all", sized by the class's own count.
		expect(all.querySelector('.bulk-label')?.getAttribute('data-reserve')).toBe('Deselect all (00)');
		// The search field draws its own words, both forms, for a container query to choose.
		expect(row.querySelector('.find-ph-long')?.textContent).toBe('Search this class');
		expect(row.querySelector('.find-ph-short')?.textContent).toBe('Search');
		expect(row.querySelector('.find-ph')?.getAttribute('aria-hidden')).toBe('true');
		// The Videos section is a key in the row with the bare count beside its word.
		expect(row.querySelector('[data-testid="class-videos"]')?.classList.contains('cvid-inline')).toBe(true);
		expect(row.querySelector('[data-testid="class-videos-count"]')?.textContent?.trim()).toBe('1');
		expect(videos.textContent?.replace(/\s+/g, ' ').trim()).toBe('▸ Videos 1 Show');
		// And the row comes before the posts.
		expect(follows(row, d.querySelector('.stream')!)).toBe(true);
	});

	it('A STUDENT, NOTHING STORED: the same row with no Select all (and no bulk bar anywhere)', () => {
		const d = doc(STUDENT);
		const rows = q(d, '.class-toolbar');
		expect(rows).toHaveLength(1);
		expect(rows[0].querySelector('[data-testid="stream-search"]')).not.toBeNull();
		expect(rows[0].querySelector('[data-testid="class-videos-toggle"]')).not.toBeNull();
		// The student's status chips are items of the same row.
		expect(rows[0].querySelector('[data-testid="stream-status"]')).not.toBeNull();
		expect(q(d, '[data-testid="bulk-select-all"]')).toHaveLength(0);
		expect(q(d, '[data-testid="bulk-bar"]')).toHaveLength(0);
	});

	it('beside an open item: the search and Select all, and no Videos key (the list is the navigation column)', () => {
		const d = doc(PANE);
		const rows = q(d, '.class-toolbar');
		expect(rows).toHaveLength(1);
		expect(rows[0].getAttribute('data-toolbar')).toBe('find');
		expect(rows[0].querySelector('[data-testid="bulk-select-all"]')).not.toBeNull();
		expect(q(d, '[data-testid="class-videos"]')).toHaveLength(0);
	});

	it('a bare mount: the search and the Videos key, nothing a teacher has', () => {
		const d = doc(BARE);
		expect(q(d, '.class-toolbar')).toHaveLength(1);
		expect(q(d, '.class-toolbar [data-testid="class-videos-toggle"]')).toHaveLength(1);
		expect(q(d, '[data-testid="bulk-select-all"]')).toHaveLength(0);
	});

	it('the Videos key hidden: the row is the search and Select all; the Videos section is not rendered', () => {
		const d = doc({ ...TEACHER, panelLayout: { order: [], hidden: ['videos'] } });
		const rows = q(d, '.class-toolbar');
		expect(rows).toHaveLength(1);
		expect(rows[0].getAttribute('data-toolbar')).toBe('find');
		expect(rows[0].querySelector('[data-testid="bulk-select-all"]')).not.toBeNull();
		expect(q(d, '[data-testid="class-videos"]')).toHaveLength(0);
	});

	it('the search hidden: the row is the Videos key and Select all, under its own hook, and no search row', () => {
		const d = doc({ ...TEACHER, panelLayout: { order: [], hidden: ['find'] } });
		const rows = q(d, '.class-toolbar');
		expect(rows).toHaveLength(1);
		expect(rows[0].getAttribute('data-testid')).toBe('class-toolbar');
		expect(rows[0].querySelector('[data-testid="class-videos-toggle"]')).not.toBeNull();
		expect(rows[0].querySelector('[data-testid="bulk-select-all"]')).not.toBeNull();
		expect(q(d, '[data-testid="stream-find"]')).toHaveLength(0);
		expect(q(d, '[data-testid="stream-search"]')).toHaveLength(0);
	});

	it('the Videos key moved first: one row, the key ahead of the search', () => {
		const d = doc({ ...TEACHER, panelLayout: { order: ['banner', 'teams', 'videos', 'find', 'stream'], hidden: [] } });
		const rows = q(d, '.class-toolbar');
		expect(rows).toHaveLength(1);
		expect(rows[0].getAttribute('data-toolbar')).toBe('videos find');
		expect(follows(rows[0].querySelector('[data-testid="class-videos-toggle"]')!, rows[0].querySelector('[data-testid="stream-search"]')!)).toBe(true);
		expect(rows[0].querySelector('[data-testid="bulk-select-all"]')).not.toBeNull();
	});

	it('split by the teams: two rows, Select all in the one above the posts only', () => {
		const d = doc({ ...TEACHER, panelLayout: { order: ['banner', 'find', 'teams', 'videos', 'stream'], hidden: [] } });
		const rows = q(d, '.class-toolbar');
		expect(rows.map((r) => r.getAttribute('data-toolbar'))).toEqual(['find', 'videos']);
		expect(rows[0].querySelector('[data-testid="bulk-select-all"]')).toBeNull();
		expect(rows[1].querySelector('[data-testid="bulk-select-all"]')).not.toBeNull();
		expect(q(d, '[data-testid="bulk-select-all"]')).toHaveLength(1);
		const teams = d.querySelector('[data-testid="class-teams"]')!;
		expect(follows(rows[0], teams) && follows(teams, rows[1])).toBe(true);
	});

	it('the posts moved above the header: the row follows the person below the posts, and Select all stays on top of the posts', () => {
		const d = doc({ ...TEACHER, panelLayout: { order: ['stream', 'banner', 'teams', 'find', 'videos'], hidden: [] } });
		const rows = q(d, '.class-toolbar');
		expect(rows).toHaveLength(1);
		expect(rows[0].querySelector('[data-testid="bulk-select-all"]')).toBeNull();
		const bulk = q(d, '[data-testid="bulk-row"]');
		expect(bulk).toHaveLength(1);
		expect(bulk[0].closest('.class-toolbar')).toBeNull();
		expect(bulk[0].querySelectorAll('[data-testid="bulk-select-all"]')).toHaveLength(1);
		expect(follows(bulk[0], d.querySelector('.stream')!)).toBe(true);
		expect(follows(d.querySelector('.stream')!, rows[0])).toBe(true);
	});

	it('THE SERVER RENDER CARRIES THE ROW’S SHAPE AND ITS LINE BREAKS (review round 4): empty, hidden from assistive tech, one per place a line may break', () => {
		const t = doc(TEACHER).querySelector('.class-toolbar')!;
		const st = doc(STUDENT).querySelector('.class-toolbar')!;
		// The shape names every key the row draws, in order, word by word.
		const words = (row: Element) => row.getAttribute('data-shape')!.split(' ');
		expect(words(t)[0]).toBe('search');
		expect(words(t).at(-1)).toBe('all');
		expect(words(t)).toContain('videos');
		expect(words(st)).toEqual(expect.arrayContaining(['search', 'todo', 'missing', 'done', 'videos']));
		expect(words(st)).not.toContain('all');
		// The breaks: after the search, before the chips, before Done (a student's), before the Videos key.
		const breaks = (row: Element) => [...row.querySelectorAll('.tb-br')].map((b) => b.getAttribute('data-br'));
		expect(breaks(st)).toEqual(['search', 'chips', 'done', 'videos']);
		expect(breaks(t)).toEqual(expect.arrayContaining(['search', 'videos']));
		expect(breaks(t)).not.toContain('done');
		for (const b of [...t.querySelectorAll('.tb-br'), ...st.querySelectorAll('.tb-br')]) {
			expect(b.getAttribute('aria-hidden')).toBe('true');
			expect(b.childNodes).toHaveLength(0);
		}
		// Done's break sits inside the status group, right before Done.
		const done = st.querySelector('[data-testid="stream-status-done"]')!;
		expect(done.previousElementSibling?.getAttribute('data-br')).toBe('done');
		// The planner has not run on a server render: nothing is marked planned.
		expect(t.hasAttribute('data-planned') || st.hasAttribute('data-planned')).toBe(false);
	});

	it('A NARROWED LIST (a student whose class opens on To do): the count and Clear are the row’s last line, after every key; the control unfiltered has none', () => {
		const d = doc({ ...STUDENT, opensOn: 'todo' });
		const row = d.querySelector('.class-toolbar')!;
		const count = row.querySelector('[data-testid="stream-find-result"]')!;
		expect(count).not.toBeNull();
		expect(count.textContent).toMatch(/\d+ of \d+ shown/);
		// After the Videos key and every other key in reading order, and not a word of the shape.
		for (const key of row.querySelectorAll('.find-field, .find-chip, [data-testid="class-videos-toggle"]')) expect(follows(key, count)).toBe(true);
		expect(row.getAttribute('data-shape')).not.toMatch(/count|result/);
		expect(doc(STUDENT).querySelector('[data-testid="stream-find-result"]')).toBeNull();
		// (A teacher's count after Select all is `dom/class-view-toolbar-mount`'s, which types a word.)
	});

	it('both hidden: no row, and Select all is where it always was, at the top of the posts', () => {
		const d = doc({ ...TEACHER, panelLayout: { order: [], hidden: ['find', 'videos'] } });
		expect(q(d, '.class-toolbar')).toHaveLength(0);
		const bulk = q(d, '[data-testid="bulk-row"]');
		expect(bulk).toHaveLength(1);
		expect(bulk[0].classList.contains('selecting')).toBe(false);
		// At rest it holds Select all and no tray (the tray is a tick's).
		expect([...bulk[0].querySelectorAll('button, select')].map((e) => e.getAttribute('data-testid'))).toEqual(['bulk-select-all']);
		expect(follows(bulk[0], d.querySelector('.stream')!)).toBe(true);
	});
});

/**
 * NO KEY ALONE ON A LINE (review round 3), AND THE STATUS CHIPS TOGETHER
 * WHERE THAT COSTS NOTHING (round 4). The widths are the keys' own, measured
 * in Chromium on `/dev/class-header?view=class&items=class` (the class Mr.
 * Pina screenshotted, whose kind filter holds its widest option,
 * "Announcements", the width every class's picker holds since round 4), and
 * each row width is the viewport less the page's 32px gutters either side.
 * The EXPECTED lines are the arrangements the reviewers named as the fix (and
 * that a flex row already draws a few pixels narrower), never the planner's
 * own output; the GREEDY lines beside them are what the plain flex wrap drew,
 * the defect, so each case is also the control that the planner changed
 * something.
 */
const GAP = 8;
const W = {
	search: { width: 148, growsTo: 480, aloneOk: true },
	kinds: { width: 136.19, aloneOk: false },
	drafts: { width: 102.58, aloneOk: false, group: 'status' },
	todo: { width: 98.05, aloneOk: false, group: 'status' },
	missing: { width: 111.61, aloneOk: false, group: 'status' },
	done: { width: 95.84, aloneOk: false, group: 'status' },
	duplicates: { width: 120, aloneOk: false },
	videos: { width: 138.03, aloneOk: false },
	all: { width: 130.72, aloneOk: false },
	tray: { width: 529.5, aloneOk: true }
} satisfies Record<string, ToolbarItem>;
const shapeItems = (shape: string): ToolbarItem[] => shape.split(' ').map((w) => W[w as keyof typeof W]);
const row = (viewport: number) => (viewport >= 1024 ? viewport - 178 : viewport - 64);

describe('toolbarLines: no small key stranded on a line of its own', () => {
	const { search, kinds, videos, all: selectAll } = W;
	const teacher = shapeItems('search kinds drafts videos all');
	const noDraft = shapeItems('search kinds videos all');
	const student = shapeItems('search kinds todo missing done videos');

	const cases: { name: string; items: ToolbarItem[]; viewport: number; greedy: number[]; planned: number[] }[] = [
		// [search kinds] [Drafts Videos] [Select all]  ->  [search] [kinds Drafts] [Videos Select all]
		{ name: 'a teacher with a draft on a 390 phone', items: teacher, viewport: 390, greedy: [0, 2, 4], planned: [0, 1, 3] },
		// [search kinds Drafts Videos] [Select all]  ->  [search kinds Drafts] [Videos Select all]
		{ name: 'a teacher with a draft on a 744 iPad mini', items: teacher, viewport: 744, greedy: [0, 4], planned: [0, 3] },
		// [search kinds Videos] [Select all]  ->  [search kinds] [Videos Select all]
		{ name: 'a teacher with no draft at 600', items: noDraft, viewport: 600, greedy: [0, 3], planned: [0, 2] },
		// [search kinds] [To do Missing Done] [Videos]  ->  [search kinds] [To do Missing] [Done Videos]
		{ name: 'a student on a 393 iPhone', items: student, viewport: 393, greedy: [0, 2, 5], planned: [0, 2, 4] },
		// [search kinds To do Missing Done] [Videos]  ->  [search kinds] [To do Missing Done Videos]
		{ name: 'a student on a 780 iPad', items: student, viewport: 780, greedy: [0, 5], planned: [0, 2] },
		// The reviewer's own case (round 4): the chips stay one group at 820.
		{ name: 'a student on an 820 iPad Air', items: student, viewport: 820, greedy: [0, 5], planned: [0, 2] },
		// Everything on one line: nothing to plan.
		{ name: 'a teacher at 1440', items: teacher, viewport: 1440, greedy: [0], planned: [0] }
	];

	it.each(cases)('$name: the same lines, and nobody alone', ({ items, viewport, greedy, planned }) => {
		expect(greedyToolbarLines(items, row(viewport), GAP)).toEqual(greedy);
		expect(toolbarLines(items, row(viewport), GAP)).toEqual(planned);
		expect(planned).toHaveLength(greedy.length);
	});

	it('where a lone key cannot be avoided, it is never the last one (the report was Select all alone under everything)', () => {
		// The old 10rem field at 360 with no draft: three lines either way, one of
		// them a single key. [search] [kinds Videos] [Select all] is the plain
		// wrap; the plan strands the kind filter under the search instead.
		const items = [{ ...search, width: 160 }, kinds, videos, selectAll];
		expect(greedyToolbarLines(items, 296, GAP)).toEqual([0, 1, 3]);
		expect(toolbarLines(items, 296, GAP)).toEqual([0, 1, 2]);
	});

	it('THE GROUP: whole wherever an arrangement as short and with as few lone keys keeps it whole, and only then', () => {
		const at = (viewport: number) => toolbarLines(student, row(viewport), GAP);
		const splits = (viewport: number) => toolbarCost(student, at(viewport)).splits;
		// The iPad portrait widths the reviewer named: To do, Missing and Done on one line.
		for (const viewport of [768, 810, 820]) {
			expect(at(viewport), `${viewport}`).toEqual([0, 2]);
			expect(splits(viewport)).toBe(0);
		}
		// A phone: whole, the chips would leave Videos alone on the last line, the
		// reported row, so the group gives way and Done goes with Videos.
		expect(at(390)).toEqual([0, 2, 4]);
		expect(splits(390)).toBe(1);
		expect(toolbarCost(student, [0, 2, 5]).lone).toBe(1);
		// The control: the same rows with no group at all plan as round 3 did.
		const ungrouped = student.map(({ group: _g, ...rest }) => rest);
		expect(toolbarLines(ungrouped, row(820), GAP)).toEqual([0, 4]);
	});

	it('toolbarCost scores lines, lone keys, split groups and a lone last key, in that order', () => {
		expect(toolbarCost(teacher, [0, 2, 4])).toEqual({ lines: 3, lone: 1, splits: 0, lastLone: 1 });
		expect(toolbarCost(teacher, [0, 1, 3])).toEqual({ lines: 3, lone: 0, splits: 0, lastLone: 0 });
		expect(toolbarCost(student, [0, 2, 4])).toEqual({ lines: 3, lone: 0, splits: 1, lastLone: 0 });
		// The field alone is no stray key; Videos alone on the last line is.
		expect(toolbarCost(student, [0, 1, 3, 5])).toEqual({ lines: 4, lone: 1, splits: 1, lastLone: 1 });
		const a = { lines: 2, lone: 0, splits: 1, lastLone: 0 };
		expect(compareToolbarCost(a, { ...a, splits: 0 })).toBeGreaterThan(0);
		expect(compareToolbarCost(a, { ...a, lone: 1, splits: 0 })).toBeLessThan(0);
		expect(compareToolbarCost(a, { ...a })).toBe(0);
	});

	it('the search field and the selection tray may sit alone; an item wider than the row is a line of its own', () => {
		const { tray } = W;
		// A 375 phone, ticked: the tray (wider than the row) alone, then Videos and Select all together.
		expect(toolbarLines([tray, videos, selectAll], row(375), GAP)).toEqual([0, 1]);
		// 800: the plain wrap gives [tray Videos] [Select all]; the plan keeps the last two together.
		expect(greedyToolbarLines([tray, videos, selectAll], row(800), GAP)).toEqual([0, 2]);
		expect(toolbarLines([tray, videos, selectAll], row(800), GAP)).toEqual([0, 1]);
	});

	/**
	 * THE ADJUSTMENTS, put to the flex row's own rule: a line takes the next
	 * item while the items' outer widths (margins included) and the gaps fit.
	 * That rule is the browser's, written out here independently of the
	 * planner, and the adjusted row must break exactly where the plan says.
	 */
	const flexWrap = (widths: number[], width: number) => {
		const starts: number[] = [];
		let used = 0;
		widths.forEach((w, i) => {
			if (i === 0 || used + GAP + w > width) {
				starts.push(i);
				used = w;
			} else used += GAP + w;
		});
		return starts;
	};
	const outer = (items: ToolbarItem[], fit: ReturnType<typeof toolbarFit>) =>
		items.map((item, i) => (fit.basis[i] ?? item.width) + fit.endMargin[i]);

	it.each(cases)('$name: the margins and the basis make the flex row break where the plan says', ({ items, viewport, planned }) => {
		const fit = toolbarFit(items, row(viewport), GAP);
		expect(fit.lines).toEqual(planned);
		expect(flexWrap(outer(items, fit), row(viewport))).toEqual(planned);
	});

	it('the search field alone on its line fills it, with nothing blank beside it', () => {
		const fit = toolbarFit(teacher, row(390), GAP);
		// 326 less half a pixel, which the field's own grow takes back.
		expect(fit.basis[0]).toBeCloseTo(325.5, 5);
		expect(fit.endMargin[0]).toBe(0);
		// On a line with keys after it (744), the field takes the room the next key would have had.
		const wide = toolbarFit(teacher, row(744), GAP);
		expect(wide.basis[0]).toBeCloseTo(row(744) - (136.19 + 102.58 + 2 * GAP) - 0.5, 5);
		expect(wide.endMargin.every((m) => m === 0)).toBe(true);
	});

	it('a line with no field ends in a margin just wide enough that the next key cannot fit', () => {
		// The student at 393: [To do Missing] has 111.34px over and Done needs 103.84 of it.
		const fit = toolbarFit(student, row(393), GAP);
		expect(fit.endMargin[3]).toBeCloseTo(row(393) - (98.05 + GAP + 111.61) - (GAP + 95.84) + 1, 5);
		expect(fit.basis.every((b) => b === null)).toBe(true);
	});

	it('a field capped below its line keeps its cap, and the rest is the margin', () => {
		const capped: ToolbarItem = { width: 148, growsTo: 200, aloneOk: true };
		const items = [capped, videos, selectAll];
		// 420: [field Videos] [Select all] by the plain wrap; the plan puts the field alone.
		expect(toolbarLines(items, 420, GAP)).toEqual([0, 1]);
		const fit = toolbarFit(items, 420, GAP);
		expect(fit.basis[0]).toBe(200);
		expect(fit.endMargin[0]).toBeGreaterThan(0);
		expect(flexWrap(outer(items, fit), 420)).toEqual([0, 1]);
	});

	it('never more lines than the plain wrap, every line fits, no more stranded keys and no more split groups than it had: 4000 random rows', () => {
		let seed = 42;
		const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
		let changed = 0;
		for (let n = 0; n < 4000; n++) {
			const count = 2 + Math.floor(rand() * 9);
			const groupAt = Math.floor(rand() * count);
			const items: ToolbarItem[] = Array.from({ length: count }, (_, i) =>
				i === 0 && rand() < 0.7
					? { width: 120 + rand() * 60, growsTo: 480, aloneOk: true }
					: { width: 40 + rand() * 160, aloneOk: rand() < 0.1, group: i >= groupAt && i < groupAt + 3 ? 'g' : undefined }
			);
			const width = 250 + rand() * 900;
			const greedy = greedyToolbarLines(items, width, GAP);
			const fit = toolbarFit(items, width, GAP);
			expect(fit.lines).toHaveLength(greedy.length);
			// Never worse than the plain wrap on any term, in order.
			expect(compareToolbarCost(toolbarCost(items, fit.lines), toolbarCost(items, greedy))).toBeLessThanOrEqual(0);
			fit.lines.forEach((s, l) => {
				const end = fit.lines[l + 1] ?? items.length;
				const sum = items.slice(s, end).reduce((a, it) => a + it.width, 0) + GAP * (end - s - 1);
				expect(end - s === 1 || sum <= width + 0.01).toBe(true);
			});
			expect(flexWrap(outer(items, fit), width)).toEqual(fit.lines);
			if (fit.lines.join() !== greedy.join()) changed++;
		}
		// The sweep exercised the planner, not just rows that fit as they were.
		expect(changed).toBeGreaterThan(200);
	});
});

/**
 * WHILE THE SEARCH IS TYPED INTO, THE FIELD STAYS WHERE IT WAS (review round
 * 4, polish round 1). Round 4's case: a teacher on a 390 phone, the field alone
 * on its line at rest; typing a word that leaves no video showing takes the
 * Videos key out of the row, and planned afresh the field would share its line
 * with the kind filter and halve (277 to 133px measured). Polish round 1's
 * cases, each an arrangement the reviewer named: a Videos key that comes back
 * takes its own line back (it had been put on a line of its own under a
 * student's one-line row, and left there after Escape); in a videos-first
 * layout the field keeps the Videos key's room rather than sliding 146px left
 * under the caret; and a teacher with no draft on a phone gets `[search]
 * [kinds Select all]` while the word is in the box, not Select all alone.
 */
describe('toolbarPinnedLines: the field held still while typing', () => {
	const teacher = shapeItems('search kinds drafts videos all');
	const noVideos = shapeItems('search kinds drafts all');
	const fieldAt = (w: number): ToolbarItem => ({ width: w - 0.5, aloneOk: true });
	const withField = (items: ToolbarItem[], at: number, w: number) => items.map((it, i) => (i === at ? fieldAt(w) : it));
	/** Where the field's left edge lands on its planned line (the keys before it, and the room kept for the ones that went). */
	const fieldOffset = (items: ToolbarItem[], lines: number[], f: number, reserve: number) => {
		const start = lines.filter((s) => s <= f).at(-1)!;
		let x = reserve;
		for (let i = start; i < f; i++) x += items[i].width + GAP;
		return x;
	};

	it('A TEACHER ON A 390 PHONE: the Videos key goes and nothing else moves; it comes back into its own place', () => {
		const width = row(390);
		expect(toolbarLines(teacher, width, GAP)).toEqual([0, 1, 3]);
		const gone = toolbarPinnedLines(withField(noVideos, 0, width), width, GAP, { lineOf: [0, 1, 1, 2], field: 0, fieldLeft: 0 });
		// [search] [kinds Drafts] [Select all]: the gap stays where the key stood (polish round 2).
		expect(gone.lines).toEqual([0, 1, 3]);
		expect(gone.reserve).toBe(0);
		// The control: planned afresh, the same keys would put Drafts down a line beside Select all.
		expect(toolbarLines(gone.items, width, GAP)).toEqual([0, 1, 2]);
		// And back: the Videos key takes its own line back, the row as at rest.
		const back = toolbarPinnedLines(withField(teacher, 0, width), width, GAP, { lineOf: [0, 1, 1, 2, 2], field: 0, fieldLeft: 0 });
		expect(back.lines).toEqual([0, 1, 3]);
	});

	it('A STUDENT AT 375 AND 390: a word that hides every video leaves the kind filter beside the field and every status chip where it was', () => {
		const student = shapeItems('search kinds todo missing done videos');
		for (const viewport of [375, 390]) {
			const width = row(viewport);
			// At rest: [search kinds] [To do Missing] [Done Videos], the field filling its line.
			expect(toolbarLines(student, width, GAP)).toEqual([0, 2, 4]);
			const field = width - GAP - W.kinds.width;
			const typed = toolbarPinnedLines(withField(student.slice(0, 5), 0, field), width, GAP, { lineOf: [0, 0, 1, 1, 2], field: 0, fieldLeft: 0 });
			expect(typed.lines, `${viewport}`).toEqual([0, 2, 4]);
			expect(typed.reserve).toBe(0);
			// The control: planned afresh, the same keys move. At 375 the kind filter
			// leaves the field's line; at 390 Done climbs onto the chips' line.
			expect(toolbarLines(typed.items, width, GAP), `${viewport}`).toEqual(viewport === 375 ? [0, 1, 3] : [0, 2]);
		}
	});

	it('A STUDENT ON ONE LINE (1440): the Videos key leaves and comes back onto the field’s line, never a line of its own', () => {
		const width = row(1440);
		const student = shapeItems('search kinds todo missing done videos');
		expect(toolbarLines(student, width, GAP)).toEqual([0]);
		const without = student.slice(0, 5);
		expect(toolbarPinnedLines(withField(without, 0, 480), width, GAP, { lineOf: [0, 0, 0, 0, 0], field: 0, fieldLeft: 0 }).lines).toEqual([0]);
		// Known by its identity, it is back on line 0 ...
		expect(toolbarPinnedLines(withField(student, 0, 480), width, GAP, { lineOf: [0, 0, 0, 0, 0, 0], field: 0, fieldLeft: 0 }).lines).toEqual([0]);
		// ... and a key the hold never saw, after every held key, joins the last held line where it fits.
		expect(toolbarPinnedLines(withField(student, 0, 480), width, GAP, { lineOf: [0, 0, 0, 0, 0, null], field: 0, fieldLeft: 0 }).lines).toEqual([0]);
	});

	it('A TEACHER WITH NO DRAFT AT 375 AND 390: a word that hides every video keeps [search kinds] and leaves Select all on its own line', () => {
		const noDraft = shapeItems('search kinds videos all');
		for (const viewport of [375, 390]) {
			const width = row(viewport);
			expect(toolbarLines(noDraft, width, GAP)).toEqual([0, 2]);
			// At rest the field grows to fill its line beside the kind filter.
			const field = width - GAP - W.kinds.width;
			const typed = toolbarPinnedLines(withField(shapeItems('search kinds all'), 0, field), width, GAP, { lineOf: [0, 0, 1], field: 0, fieldLeft: 0 });
			// The kind filter stays on the field's line (polish round 2); Select all
			// alone on the last line is the accepted cost while a word is in the box.
			expect(typed.lines, `${viewport}`).toEqual([0, 2]);
			expect(typed.reserve).toBe(0);
			expect(toolbarCost(typed.items, typed.lines).lone).toBe(1);
			// The control: planned afresh, the kind filter would leave the field's line.
			expect(toolbarLines(typed.items, width, GAP), `${viewport}`).toEqual([0, 1]);
			// The word deleted: the row as it was at rest.
			expect(toolbarPinnedLines(withField(noDraft, 0, field), width, GAP, { lineOf: [0, 0, 1, 1], field: 0, fieldLeft: 0 }).lines).toEqual([0, 2]);
		}
	});

	it('THE VIDEOS KEY FIRST (1440): the field keeps the key’s room while it is gone, and the key comes back into it', () => {
		const width = row(1440);
		const items = [W.videos, fieldAt(480), W.kinds, W.drafts, W.all];
		const fieldLeft = W.videos.width + GAP;
		const gone = toolbarPinnedLines(items.slice(1), width, GAP, { lineOf: [0, 0, 0, 0], field: 0, fieldLeft });
		expect(gone.lines).toEqual([0]);
		expect(gone.reserve).toBeCloseTo(146.03, 2);
		expect(fieldOffset(gone.items, gone.lines, 0, gone.reserve)).toBeCloseTo(fieldLeft, 6);
		const back = toolbarPinnedLines(items, width, GAP, { lineOf: [0, 0, 0, 0, 0], field: 1, fieldLeft });
		expect(back.lines).toEqual([0]);
		expect(back.reserve).toBe(0);
		expect(fieldOffset(back.items, back.lines, 1, back.reserve)).toBeCloseTo(fieldLeft, 6);
	});

	it('the Videos key first and alone on the first line (a narrow phone): the field starts the first line it has left, with no room reserved', () => {
		const items = [fieldAt(256), W.kinds, W.all];
		const gone = toolbarPinnedLines(items, 256, GAP, { lineOf: [1, 2, 3], field: 0, fieldLeft: 0 });
		expect(gone.lines[0]).toBe(0);
		expect(gone.reserve).toBe(0);
	});

	it('a key the hold never saw, before every held key, joins the first held line rather than a line of its own above the field', () => {
		expect(heldStarts([null, 0, 0, 1])).toEqual([0, 3]);
		expect(heldStarts([null, 1, 1, 2])).toEqual([0, 3]);
		expect(heldStarts([0, null, 1, null])).toEqual([0, 2]);
	});

	it('960, one line: the field keeps its width and its line however the keys after it come and go', () => {
		const width = row(960);
		const lines = toolbarPinnedLines([fieldAt(356), ...noVideos.slice(1)], width, GAP, { lineOf: [0, 0, 0, 0], field: 0, fieldLeft: 0 }).lines;
		expect(lines).toEqual([0]);
		// A key arriving on the held line that no longer fits is planned after the field, which stays first.
		const tight = toolbarPinnedLines([fieldAt(356), ...teacher.slice(1)], 700, GAP, { lineOf: [0, 0, 0, null, 0], field: 0, fieldLeft: 0 }).lines;
		expect(tight[0]).toBe(0);
		expect(tight.length).toBeGreaterThan(1);
	});

	it('a held line before the field that no longer fits gives the row up to the wrap from there', () => {
		const wide: ToolbarItem = { width: 300, aloneOk: false };
		const out = toolbarPinnedLines([wide, fieldAt(480), W.kinds], 700, GAP, { lineOf: [0, 0, 0], field: 1, fieldLeft: W.videos.width + GAP });
		expect(out.reserve).toBe(0);
		expect(out.lines).toEqual(greedyToolbarLines([wide, fieldAt(480), W.kinds], 700, GAP));
	});

	it('THE SWEEP: 3000 random rows held at rest, keys taken away and given back; the field never moves, no key leaves its line while the held lines fit, every line fits, and with every key back the row is exactly as at rest', () => {
		let seed = 0x5eed;
		const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
		const pool = Object.entries(W).filter(([k]) => k !== 'search' && k !== 'tray');
		let checked = 0;
		let moved = 0;
		let reserved = 0;
		let still = 0;
		for (let c = 0; c < 3000; c++) {
			const width = 240 + Math.floor(rand() * 1400);
			const keys = Array.from({ length: 1 + Math.floor(rand() * 6) }, () => pool[Math.floor(rand() * pool.length)][1]);
			const f = rand() < 0.3 ? Math.min(1, keys.length) : 0;
			const rest = [...keys.slice(0, f), W.search, ...keys.slice(f)];
			const restLines = toolbarLines(rest, width, GAP);
			// The field's width at rest: its basis, grown into the room its line had, up to its cap.
			const lineEnd = restLines.find((s) => s > f) ?? rest.length;
			const lineStart = restLines.filter((s) => s <= f).at(-1)!;
			let used = 0;
			for (let i = lineStart; i < lineEnd; i++) used += rest[i].width + (i > lineStart ? GAP : 0);
			const fieldW = Math.min(480, W.search.width + Math.max(0, width - used));
			const lineOfRest = rest.map((_, i) => restLines.filter((s) => s <= i).length - 1);
			let fieldLeft = 0;
			for (let i = lineStart; i < f; i++) fieldLeft += rest[i].width + GAP;
			const held = withField(rest, f, fieldW);
			// Every key back: exactly the lines at rest, nothing reserved.
			const same = toolbarPinnedLines(held, width, GAP, { lineOf: lineOfRest, field: f, fieldLeft });
			expect(same.lines, `case ${c}`).toEqual(restLines);
			expect(same.reserve).toBe(0);
			// Some keys taken away (never the field).
			const keep = held.map((_, i) => i === f || rand() < 0.6);
			const items = held.filter((_, i) => keep[i]);
			const lineOf = lineOfRest.filter((_, i) => keep[i]);
			const fi = keep.slice(0, f).filter(Boolean).length;
			const out = toolbarPinnedLines(items, width, GAP, { lineOf, field: fi, fieldLeft });
			// Every held line still fits: nothing moves, every key on the line it had (polish round 2).
			const heldLines = heldStarts(lineOf);
			const heldFit = heldLines.every((from, l) => {
				const to = heldLines[l + 1] ?? out.items.length;
				return to - from === 1 || out.items.slice(from, to).reduce((a, it) => a + it.width, 0) + GAP * (to - from - 1) <= width + 0.01;
			});
			if (heldFit) {
				expect(out.lines, `case ${c}`).toEqual(heldLines);
				still++;
			}
			// Every line fits (a key wider than the row aside).
			out.lines.forEach((from, l) => {
				const to = out.lines[l + 1] ?? out.items.length;
				const sum = out.items.slice(from, to).reduce((a, it) => a + it.width, 0) + GAP * (to - from - 1);
				if (to - from > 1) expect(sum, `case ${c} line ${l}`).toBeLessThanOrEqual(width + 0.01);
			});
			// The field's left edge is where it was, and it is on the line it was on, less any line that emptied above it.
			const offset = fieldOffset(out.items, out.lines, fi, out.reserve);
			if (Math.abs(offset - fieldLeft) > 1e-6) moved++;
			const linesAbove = new Set(lineOf.slice(0, fi).filter((l) => l! < lineOfRest[f])).size;
			expect(out.lines.filter((s) => s <= fi).length - 1, `case ${c}`).toBe(linesAbove);
			if (out.reserve > 0) reserved++;
			checked++;
		}
		expect(checked).toBe(3000);
		expect(moved).toBe(0);
		// Most rows keep every held line once keys go (nothing grows here), and each was held exactly.
		expect(still).toBeGreaterThan(2500);
		// The sweep reached the case it exists for: keys before the field taken away, their room kept.
		expect(reserved).toBeGreaterThan(50);
	});
});

describe('toolbarShape: the row’s keys, word by word', () => {
	const base = { members: ['find', 'videos'] as const, selecting: false, carries: true, kinds: true, statuses: ['drafts'], duplicates: false };
	it('a teacher, a student, the Videos key first, the tray', () => {
		expect(toolbarShape(base)).toBe('search kinds drafts videos all');
		expect(toolbarShape({ ...base, carries: false, statuses: ['todo', 'missing', 'done'] })).toBe('search kinds todo missing done videos');
		expect(toolbarShape({ ...base, members: ['videos', 'find'], statuses: [], kinds: false })).toBe('videos search all');
		expect(toolbarShape({ ...base, duplicates: true, members: ['find'] })).toBe('search kinds drafts duplicates all');
		// Ticked: the filters make way, the tray leads.
		expect(toolbarShape({ ...base, selecting: true })).toBe('tray videos all');
	});
});

/**
 * THE STYLESHEET DRAWS THE PLAN FROM THE FIRST PAINT (review round 4). The
 * class page's container queries show a zero-height break before a key at
 * the widths where the plain wrap would strand one, so the server render
 * already has the planned lines and hydration moves nothing. Here the rules
 * are read back out of ClassView's own stylesheet and put through
 * `greedyToolbarLines`' forced breaks (the flex row with those breaks shown)
 * at every width from 256 (a 320px phone's row) to 1900px in steps of 0.05px
 * (offset by half a step, so no width lands on a boundary the rules and the
 * planner state to the hundredth), against the
 * planner's own judgement: what the stylesheet draws must be as good as the
 * best arrangement everywhere, which is what lets the planner leave it alone.
 * And the rules must not be an empty set that passes because nothing was
 * checked: the count of rules and of shapes is asserted.
 */
describe('the toolbar’s line-break rules, read out of ClassView', () => {
	const css = readFileSync(fileURLToPath(new URL('../src/lib/classroom/ClassView.svelte', import.meta.url)), 'utf8');
	const RULE =
		/@container class-toolbar ([^{]+)\{\s*\.class-toolbar\[data-shape='([^']+)'\]:not\(\[data-planned\]\)\s*>?\s*\.tb-br\[data-br='(\w+)'\]\s*\{\s*display:\s*block;\s*\}\s*\}/g;
	type Rule = { shape: string; at: string; ranges: [number, number][] };
	const rules: Rule[] = [...css.matchAll(RULE)].map((m) => ({
		shape: m[2],
		at: m[3],
		ranges: m[1]
			.trim()
			.split(/\s+or\s+/)
			.map((cond) => {
				const below = /^\(width < ([\d.]+)px\)$/.exec(cond);
				if (below) return [0, Number(below[1])] as [number, number];
				const band = /^\(([\d.]+)px <= width < ([\d.]+)px\)$/.exec(cond);
				if (!band) throw new Error(`unread condition: ${cond}`);
				return [Number(band[1]), Number(band[2])] as [number, number];
			})
	}));
	const shapes = [...new Set(rules.map((r) => r.shape))];
	const breakIndex = (words: string[], at: string) =>
		at === 'search' ? words.indexOf('search') + 1 : at === 'chips' ? words.findIndex((w) => w in { drafts: 1, todo: 1 }) : words.indexOf(at);
	const drawn = (shape: string, width: number) => {
		const words = shape.split(' ');
		const breaks = rules
			.filter((r) => r.shape === shape && r.ranges.some(([lo, hi]) => width >= lo && width < hi))
			.map((r) => breakIndex(words, r.at));
		return greedyToolbarLines(shapeItems(shape), width, GAP, breaks);
	};

	it('there are rules for the six rows a class page usually holds, each naming a break the row has', () => {
		expect(shapes.sort()).toEqual(
			[
				'search kinds all',
				'search kinds drafts all',
				'search kinds drafts videos all',
				'search kinds todo missing done',
				'search kinds todo missing done videos',
				'search kinds videos all'
			].sort()
		);
		expect(rules).toHaveLength(9);
		for (const r of rules) expect(breakIndex(r.shape.split(' '), r.at), `${r.shape} / ${r.at}`).toBeGreaterThan(0);
	});

	it('at every width from a 320 phone to 1900px, what the stylesheet draws is as good as the best arrangement', () => {
		let checked = 0;
		const worse: string[] = [];
		for (const shape of shapes) {
			const items = shapeItems(shape);
			for (let i = 0; i <= (1900 - 256) * 20; i++) {
				const w = 256.025 + i * 0.05;
				const css = toolbarCost(items, drawn(shape, w));
				const best = toolbarCost(items, toolbarLines(items, w, GAP));
				if (compareToolbarCost(css, best) > 0) worse.push(`${shape} @ ${w}`);
				checked++;
			}
		}
		expect(worse.slice(0, 10)).toEqual([]);
		expect(checked).toBe(shapes.length * ((1900 - 256) * 20 + 1));
	});

	it('at a phone’s 375 and 390, an iPad’s 768, 810 and 820, 960 and 1440: exactly the planner’s lines', () => {
		for (const shape of shapes) {
			const items = shapeItems(shape);
			for (const viewport of [375, 390, 768, 810, 820, 960, 1440]) {
				expect(drawn(shape, row(viewport)), `${shape} @ ${viewport}`).toEqual(toolbarLines(items, row(viewport), GAP));
			}
		}
	});

	it('the control: with the rules taken away, the plain wrap strands a key at those widths', () => {
		const plain = (shape: string, viewport: number) => greedyToolbarLines(shapeItems(shape), row(viewport), GAP);
		expect(toolbarCost(shapeItems('search kinds drafts videos all'), plain('search kinds drafts videos all', 390)).lone).toBe(1);
		expect(toolbarCost(shapeItems('search kinds todo missing done videos'), plain('search kinds todo missing done videos', 820)).lone).toBe(1);
		expect(toolbarCost(shapeItems('search kinds todo missing done videos'), plain('search kinds todo missing done videos', 390)).lone).toBe(1);
	});
});
