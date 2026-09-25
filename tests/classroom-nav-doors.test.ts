import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import {
	activeTab,
	classDuplicatesHref,
	classroomCrumbs,
	locateClassroom,
	sectionTabs,
	visibleSectionTabs,
	type SectionTab
} from '../src/lib/classroom/nav';
import { commandById } from '../src/lib/shell/commands';
import { duplicateDoorLabel, loadDuplicateDraftCount } from '../src/lib/classroom/duplicate-count';
import { EMPTY_ANSWER as EMPTY_DUPLICATES } from '../src/lib/classroom/DuplicateDrafts.svelte';
import { loadGreenlinePending, pendingBreakdown, pendingLabel } from '../src/lib/greenline/moderation';
import GreenlineDashboardCard from '../src/lib/greenline/GreenlineDashboardCard.svelte';

/**
 * THE DOORS: three surfaces that worked and could not be reached, and the
 * three ways the doors this lane added could silently stop working.
 *
 * Each of the three blocks below is written so a MUTATION of the shipping code
 * reddens it, and the mutation each one answers is named in its own header --
 * because an assertion nobody has ever seen fail is an assertion about a
 * fixture. What is deliberately NOT here is anything geometric: whether the
 * tab bar wraps at 375px rather than pushing the document wider is a layout
 * claim, happy-dom has no layout engine and this project has no DOM at all, so
 * that claim belongs to `npm run verify:browser` and is measured there.
 */

function read(path: string): string {
	return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

/**
 * A section tab whose href points inside /classroom names a route that exists.
 * Derived from the href rather than from a list, so a tab added with a typo in
 * its path is caught by the same assertion that catches a tab added with no
 * page behind it at all.
 */
function routeFileFor(href: string): string {
	const path = href.split('?')[0].replace(/\/+$/, '');
	const parts = path.split('/').filter(Boolean);
	// /classroom/<sectionId>[/<leaf>] -> src/routes/classroom/[sectionId][/<leaf>]
	const rest = parts.slice(2);
	const dir = ['src/routes/classroom', '[sectionId]', ...rest].join('/');
	return `${dir}/+page.svelte`;
}

describe('control 1: a caller who manages no section is offered no manage-only tab', () => {
	/**
	 * THE PREDICATE, NOT THE FIXTURE. `visibleSectionTabs` is the one
	 * implementation of "is this tab offered", and the whole point of asserting
	 * it here rather than counting tabs in a component is that it can be OPENED:
	 * change its body to `tabs` (or its clause to `true`) and every absence
	 * assertion below flips, which is the control this describe block's second
	 * `it` states in the positive direction on the same fixture.
	 */
	const tabs = sectionTabs('s-1');

	/*
	 * GENERALIZED (ledger 0297): a student used to see exactly one tab, the
	 * class stream. The notebook moved INTO the class as a tab every member
	 * sees, so a student sees two -- the class and its notebook -- and still
	 * nothing a manager alone is offered.
	 */
	it('a student sees the class stream and its notebook, and nothing manage-only', () => {
		const visible = visibleSectionTabs(tabs, false);
		expect(visible.map((t) => t.id)).toEqual(['class', 'notebook']);
		expect(visible.every((t) => !t.manageOnly)).toBe(true);
		// Named absences, not just a count: a tab renamed rather than removed
		// would keep the count and lose the meaning.
		expect(visible.some((t) => t.id === 'live')).toBe(false);
		expect(visible.some((t) => t.id === 'people')).toBe(false);
		expect(visible.some((t) => t.id === 'grades')).toBe(false);
	});

	/*
	 * GENERALIZED (ledger 0298, report 28): six became five. Duplicates is a
	 * page with doors now, not a tab; the last block below holds the page and
	 * its doors together.
	 */
	it('POSITIVE CONTROL: a manager sees all five, so the absences above are the predicate', () => {
		const visible = visibleSectionTabs(tabs, true);
		expect(visible.map((t) => t.id)).toEqual(['class', 'live', 'notebook', 'people', 'grades']);
		expect(visible.length).toBe(5);
	});

	it('the shell filters through that one function and does not spell it again', () => {
		const shell = read('src/lib/classroom/ClassroomShell.svelte');
		expect(shell).toMatch(/visibleSectionTabs\(tabs, canManage\)/);
		// The clause itself must not have been left behind beside the call.
		expect(shell).not.toMatch(/!t\.manageOnly \|\| canManage/);
	});

	/**
	 * ONE SURVIVING TAB WOULD RENDER NO BAR, which is a second, independent
	 * rule: the bar renders only when more than one tab survives the filter.
	 * GENERALIZED (ledger 0297): a student used to be that case and is not any
	 * more -- their class's Notebook tab is the second tab, so the bar is how a
	 * student reaches their notebook for this class. What stays true is the
	 * rule, and that the bar a student gets carries only the two tabs above.
	 */
	it('the bar renders only for more than one tab, and a student now has two', () => {
		const shell = read('src/lib/classroom/ClassroomShell.svelte');
		expect(shell).toMatch(/visibleTabs\.length > 1 && tab/);
		expect(visibleSectionTabs(sectionTabs('s-1'), false).length).toBe(2);
	});
});

describe('control 2: the GREENLINE card prints the real count', () => {
	/**
	 * THE COUNT COMES THROUGH `loadGreenlinePending` AND OUT OF THE REAL CARD.
	 * The stub answers the two head-counts PostgREST would; everything between
	 * that and the rendered string -- the total, the label, the breakdown, the
	 * markup -- is shipping code. Break `loadGreenlinePending` (return EMPTY,
	 * drop a `.eq('status','pending')`, stop summing) and this reddens rather
	 * than the card quietly reading zero, which is the failure mode the old
	 * countless card had permanently.
	 */
	function stubClient(counts: Record<string, number>, fail?: string) {
		return {
			from(table: string) {
				return {
					select() {
						return {
							eq(_col: string, _val: unknown) {
								const self: Record<string, unknown> = {
									eq: () => self,
									then: undefined
								};
								const result =
									table === fail
										? { count: null, error: { message: 'no such column' } }
										: { count: counts[table] ?? 0, error: null };
								// The real select chain is awaited; give every rung the
								// same thenable so a filter added or removed upstream
								// changes nothing about how the answer arrives.
								Object.assign(self, {
									then: (res: (v: unknown) => void) => res(result)
								});
								return self;
							}
						};
					}
				};
			}
		} as never;
	}

	it('two tracks and one decal render as three, named by queue', async () => {
		const pending = await loadGreenlinePending(
			stubClient({ greenline_tracks: 2, greenline_decals: 1 })
		);
		expect(pending).toEqual({ ready: true, tracks: 2, decals: 1, total: 3 });

		const { body } = render(GreenlineDashboardCard, { props: { pending } });
		expect(body).toContain('3 AWAITING REVIEW');
		expect(body).toContain('2 tracks');
		expect(body).toContain('1 decal');
		// The link is still the link.
		expect(body).toContain('/greenline/moderation');
	});

	it('POSITIVE CONTROL: zero is a sentence, and it is not the same sentence', async () => {
		const pending = await loadGreenlinePending(
			stubClient({ greenline_tracks: 0, greenline_decals: 0 })
		);
		expect(pending.total).toBe(0);
		const { body } = render(GreenlineDashboardCard, { props: { pending } });
		expect(body).toContain('NOTHING AWAITING REVIEW');
		// Never a bare zero: "0 AWAITING REVIEW" reads as a queue, and a badge
		// that simply vanished would read as a badge that broke.
		expect(body).not.toContain('0 AWAITING REVIEW');
		// And the two states are genuinely different strings, so a card stuck on
		// one of them cannot pass both assertions.
		expect(pendingLabel(pending)).not.toBe(
			pendingLabel({ ready: true, tracks: 2, decals: 1, total: 3 })
		);
	});

	it('a failed read is not zero: it says the count is unavailable', async () => {
		const pending = await loadGreenlinePending(
			stubClient({ greenline_tracks: 2, greenline_decals: 1 }, 'greenline_tracks')
		);
		expect(pending.ready).toBe(false);
		const { body } = render(GreenlineDashboardCard, { props: { pending } });
		expect(body).toContain('REVIEW QUEUE');
		expect(body).not.toContain('AWAITING REVIEW');
		expect(pendingBreakdown(pending)).toBe('');
	});

	it('the dashboard reads the count from that one loader and hands it to that one card', () => {
		const server = read('src/routes/dashboard/+page.server.ts');
		expect(server).toMatch(/loadGreenlinePending\(supabase\)/);
		expect(server).toMatch(/\bgreenlinePending,/);
		const page = read('src/routes/dashboard/+page.svelte');
		expect(page).toMatch(/<GreenlineDashboardCard pending=\{data\.greenlinePending\}/);
		// The superseded copy is gone. It described 0057's publish-then-moderate
		// model -- every noun about a track that is ALREADY live -- on the one
		// card that leads to a queue of things that are not.
		expect(page).not.toContain('Published GREENLINE community tracks');
		expect(page).not.toContain('Community Track Moderation');
	});
});

describe('control 3: every section tab still resolves', () => {
	const tabs = sectionTabs('s-1');

	/**
	 * A TAB'S HREF IS CHECKED AGAINST THE TREE, not against a list written
	 * here. Remove `people` from `sectionTabs` and the `expect(ids)` below
	 * names it; point a tab at a path with no page behind it and the existence
	 * check names the file it looked for. Duplicates is not a tab since ledger
	 * 0298 -- see the last block, which holds its page and its doors together.
	 */
	it('the shipped set is exactly these five, in reading order', () => {
		expect(tabs.map((t) => t.id)).toEqual(['class', 'live', 'notebook', 'people', 'grades']);
	});

	it('every in-classroom tab points at a page that exists on disk', () => {
		const internal = tabs.filter((t) => !t.external);
		// Five: the notebook came inside the class and the Live tab joined it
		// (ledger 0297), and Duplicates left the bar (ledger 0298); no tab is a
		// departure.
		expect(internal.length).toBe(5);
		for (const t of internal) {
			const file = routeFileFor(t.href);
			expect(existsSync(new URL(`../${file}`, import.meta.url)), `${t.id} -> ${file}`).toBe(true);
		}
	});

	it('every in-classroom tab is the tab its own href activates', () => {
		for (const t of tabs.filter((t) => !t.external)) {
			expect(activeTab(locateClassroom(t.href)), `${t.id} does not activate itself`).toBe(t.id);
		}
	});

	/*
	 * GENERALIZED (ledger 0297) FROM "the check-ins tab is a departure". That
	 * tab left the class for /notebook/review?section=<id>; the class's review,
	 * check-in manager included, is now the Notebook tab INSIDE the class, so
	 * no tab departs at all. The old address is still a real route -- it
	 * redirects, and tests/notebook-legacy-routes.test.ts drives it -- and the
	 * notebook tab reads `?mode=checkins`, which is what the duplicate-date
	 * refusal links to.
	 */
	it('the notebook tab is inside the class, and no tab is a departure any more', () => {
		expect(tabs.filter((t) => t.external)).toEqual([]);
		const notebook = tabs.find((t) => t.id === 'notebook') as SectionTab;
		expect(notebook.manageOnly).toBe(false);
		expect(notebook.href).toBe('/classroom/s-1/notebook');
		expect(activeTab(locateClassroom(notebook.href))).toBe('notebook');
		const load = read('src/routes/classroom/[sectionId]/notebook/+page.server.ts');
		expect(load).toMatch(/url\.searchParams\.get\('mode'\)/);
		expect(load).toMatch(/asked === 'checkins'/);
		// The address the old tab named still answers.
		expect(existsSync(new URL('../src/routes/notebook/review/+page.server.ts', import.meta.url))).toBe(
			true
		);
	});

	it('a departure is never the active tab, and the shell says so twice', () => {
		// There is no ClassroomLocation for the legacy /notebook/review, so
		// `activeTab` cannot name it however the URL is spelled.
		expect(activeTab(locateClassroom('/notebook/review?section=s-1'))).toBeNull();
		const shell = read('src/lib/classroom/ClassroomShell.svelte');
		expect(shell).toMatch(/class:active=\{!t\.external && t\.id === tab\}/);
		expect(shell).toMatch(/aria-current=\{!t\.external && t\.id === tab \? 'page' : undefined\}/);
	});
});

describe('the duplicates page and its doors stand or fall together', () => {
	/**
	 * GENERALIZED (ledger 0298, report 28) FROM "the duplicates tab and its
	 * page stand or fall together". The biconditional is the same one: 0081
	 * withheld the tab because 0074's page was on an unmerged branch behind an
	 * unapplied migration, and a tab for it would have been a 404 offered to
	 * every manager; 0086 landed the tab once the page landed. Mr. Pina then
	 * asked for the TAB to go ("I don't think I'm going to ever use it very
	 * often ... put somewhere out of the way"), so what must stand with the
	 * page is its DOORS: the `class.duplicates` palette command and the class
	 * page's door beside the Drafts filter, both reading `classDuplicatesHref`.
	 * It still points BOTH ways: delete the page and it reddens naming the
	 * orphaned doors, delete the doors and it reddens naming the orphaned page.
	 */
	const pageExists = existsSync(
		new URL('../src/routes/classroom/[sectionId]/duplicates/+page.svelte', import.meta.url)
	);
	const view = read('src/lib/classroom/ClassView.svelte');
	const commandHref = commandById('class.duplicates')?.href?.({
		role: 'manager',
		surface: 'classroom',
		sectionId: 's-1',
		itemId: null,
		basePath: '/classroom',
		handlers: new Set()
	});
	const doors = {
		palette: commandHref === classDuplicatesHref('s-1'),
		classPage:
			view.includes('classDuplicatesHref(section.id, basePath)') &&
			view.includes('data-testid="stream-duplicates-door"')
	};

	it('the page has doors exactly while it answers, and no tab', () => {
		expect(
			doors.palette && doors.classPage,
			pageExists
				? 'the duplicates page is here: it needs its palette command and its class-page door'
				: 'the duplicates page is not on this base, so a door to it would 404'
		).toBe(pageExists);
		// POSITIVE CONTROL for the door being a DOOR and not a tab: the bar has
		// five tabs and none of them names the page.
		expect(sectionTabs('s-1').length).toBe(5);
		expect(sectionTabs('s-1').some((t) => t.href.endsWith('/duplicates'))).toBe(false);
		expect(classDuplicatesHref('s-1')).toBe('/classroom/s-1/duplicates');
		expect(classDuplicatesHref('a b/c')).toBe('/classroom/a%20b%2Fc/duplicates');
	});

	it('the deferred patch note does not stand while the page has its doors', () => {
		// GENERALIZED FROM "the note stands exactly while the tab does not". A
		// note telling a reader how to add a way in that is already there is
		// worse than no note -- it reads as work outstanding.
		const nav = read('src/lib/classroom/nav.ts');
		expect(nav.includes('duplicate-drafts-count-wzworl')).toBe(!(doors.palette && doors.classPage));
	});

	it('the page is a place in the class with a trail back, not a tab the bar lights', () => {
		const loc = locateClassroom('/classroom/s-1/duplicates');
		expect(loc.place).toBe('duplicates');
		// No tab claims it, so no tab bar renders there (the shell's
		// `visibleTabs.length > 1 && tab` guard), exactly as on an item page...
		expect(activeTab(loc)).toBeNull();
		// ...and the trail is the way back to the class page it was opened from.
		expect(classroomCrumbs(loc, { section: 'IDEA209H Block 3' })).toEqual([
			{ label: 'My Classes', href: '/classroom' },
			{ label: 'IDEA209H Block 3', href: '/classroom/s-1' },
			{ label: 'Duplicates' }
		]);
	});

	it('the class-page door is a manager\'s, counted by 0187 itself, and only when there are duplicates', () => {
		// The door renders only for a manager with a count above zero...
		expect(view).toMatch(/\{#if canManage && duplicateCount > 0\}/);
		// ...the count is asked only of a manager's injected loader, untracked...
		expect(view).toMatch(/const load = canManage \? loadDuplicateCount : null;/);
		expect(view).toMatch(/untrack\(\(\) => load\(\)\)/);
		// ...and the class page hands a loader only to a manager, calling the SAME
		// function the page calls, so the door and the page cannot disagree.
		const layout = read('src/routes/classroom/[sectionId]/+layout.svelte');
		expect(layout).toMatch(
			/loadDuplicateCount=\{data\.canManage \? \(\) => loadDuplicateDraftCount\(data\.supabase, data\.section\.id\) : null\}/
		);
		expect(read('src/lib/classroom/duplicate-count.ts')).toContain("rpc('classroom_duplicate_drafts'");
		expect(read('src/routes/classroom/[sectionId]/duplicates/+page.server.ts')).toContain(
			"rpc('classroom_duplicate_drafts'"
		);
	});

	it('the count is the page\'s own surplus, and "could not tell" is never a number', async () => {
		const client = (answer: unknown) =>
			({ rpc: async () => answer }) as unknown as Parameters<typeof loadDuplicateDraftCount>[0];
		expect(
			await loadDuplicateDraftCount(client({ data: { groups: [], totals: { surplus: 3 } }, error: null }), 's-1')
		).toBe(3);
		expect(await loadDuplicateDraftCount(client({ data: EMPTY_DUPLICATES, error: null }), 's-1')).toBe(0);
		expect(await loadDuplicateDraftCount(client({ data: null, error: { code: 'PGRST202' } }), 's-1')).toBeNull();
		expect(await loadDuplicateDraftCount(client({ data: null, error: { code: '42501' } }), 's-1')).toBeNull();
		const throwing = { rpc: async () => { throw new Error('offline'); } } as unknown as Parameters<
			typeof loadDuplicateDraftCount
		>[0];
		expect(await loadDuplicateDraftCount(throwing, 's-1')).toBeNull();
		expect(duplicateDoorLabel(1)).toBe('1 duplicate draft');
		expect(duplicateDoorLabel(3)).toBe('3 duplicate drafts');
	});
});
