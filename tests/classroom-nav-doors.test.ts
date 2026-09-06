import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import {
	activeTab,
	locateClassroom,
	sectionTabs,
	visibleSectionTabs,
	type SectionTab
} from '../src/lib/classroom/nav';
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

	it('a student sees exactly one tab, and it is the class stream', () => {
		const visible = visibleSectionTabs(tabs, false);
		expect(visible.map((t) => t.id)).toEqual(['class']);
		// Named absences, not just a count: a tab renamed rather than removed
		// would keep the count and lose the meaning.
		expect(visible.some((t) => t.id === 'people')).toBe(false);
		expect(visible.some((t) => t.id === 'grades')).toBe(false);
		expect(visible.some((t) => t.id === 'duplicates')).toBe(false);
		expect(visible.some((t) => t.id === 'check-ins')).toBe(false);
	});

	it('POSITIVE CONTROL: a manager sees all five, so the absences above are the predicate', () => {
		const visible = visibleSectionTabs(tabs, true);
		expect(visible.map((t) => t.id)).toEqual([
			'class',
			'people',
			'grades',
			'duplicates',
			'check-ins'
		]);
		expect(visible.length).toBe(5);
	});

	it('the shell filters through that one function and does not spell it again', () => {
		const shell = read('src/lib/classroom/ClassroomShell.svelte');
		expect(shell).toMatch(/visibleSectionTabs\(tabs, canManage\)/);
		// The clause itself must not have been left behind beside the call.
		expect(shell).not.toMatch(/!t\.manageOnly \|\| canManage/);
	});

	/**
	 * A STUDENT GETS NO BAR AT ALL, which is a second, independent refusal: the
	 * bar renders only when more than one tab survives the filter. So opening
	 * `visibleSectionTabs` alone still leaves this closed, and opening this
	 * alone still leaves a student one tab.
	 */
	it('one surviving tab renders no bar, in the shell as shipped', () => {
		const shell = read('src/lib/classroom/ClassroomShell.svelte');
		expect(shell).toMatch(/visibleTabs\.length > 1 && tab/);
		expect(visibleSectionTabs(sectionTabs('s-1'), false).length).toBe(1);
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
	 * check names the file it looked for. The duplicates tab is absent from
	 * both directions on purpose -- see the last block.
	 */
	it('the shipped set is exactly these five, in reading order', () => {
		expect(tabs.map((t) => t.id)).toEqual(['class', 'people', 'grades', 'duplicates', 'check-ins']);
	});

	it('every in-classroom tab points at a page that exists on disk', () => {
		const internal = tabs.filter((t) => !t.external);
		expect(internal.length).toBe(4);
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

	it('the check-ins tab is a departure, and its destination is a real route', () => {
		const checkIns = tabs.find((t) => t.id === 'check-ins') as SectionTab;
		expect(checkIns.external).toBe(true);
		expect(checkIns.href).toBe('/notebook/review?section=s-1');
		expect(existsSync(new URL('../src/routes/notebook/review/+page.server.ts', import.meta.url))).toBe(
			true
		);
		// The console really does read that parameter, and validates it rather
		// than passing it through -- which is what makes the tab land on THIS
		// class's grid instead of a hub.
		const review = read('src/routes/notebook/review/+page.server.ts');
		expect(review).toMatch(/url\.searchParams\.get\('section'\)/);
		expect(review).toMatch(/sections\.some\(\(s\) => s\.id === asked\)/);
	});

	it('a departure is never the active tab, and the shell says so twice', () => {
		// There is no ClassroomLocation for /notebook/review, so `activeTab`
		// cannot name it however the URL is spelled.
		expect(activeTab(locateClassroom('/notebook/review?section=s-1'))).toBeNull();
		const shell = read('src/lib/classroom/ClassroomShell.svelte');
		expect(shell).toMatch(/class:active=\{!t\.external && t\.id === tab\}/);
		expect(shell).toMatch(/aria-current=\{!t\.external && t\.id === tab \? 'page' : undefined\}/);
	});
});

describe('the duplicates tab and its page stand or fall together', () => {
	/**
	 * BOTH HALVES HAVE LANDED, AND THE BICONDITIONAL IS WHAT KEPT THEM
	 * HONEST WHILE ONLY ONE HAD. 0081 withheld the tab because 0074's page was
	 * on an unmerged branch behind an unapplied migration, and a tab for it
	 * would have been a 404 offered to every manager -- worse than the typed
	 * URL it replaces. The page landed on `main` with `0187`; this test went
	 * red with both parents green, which is exactly what it was written to do,
	 * and 0086 answered it with the tab. It is left pointing BOTH ways: delete
	 * the page and it reddens naming the orphaned tab, delete the tab and it
	 * reddens naming the orphaned page.
	 */
	it('no tab names it while no page answers it', () => {
		const pageExists = existsSync(
			new URL('../src/routes/classroom/[sectionId]/duplicates/+page.svelte', import.meta.url)
		);
		const tabExists = sectionTabs('s-1').some((t) => t.href.endsWith('/duplicates'));
		expect(
			tabExists,
			pageExists
				? 'the duplicates page has landed: add its tab, per the patch in nav.ts'
				: 'the duplicates page is not on this base, so a tab for it would 404'
		).toBe(pageExists);
	});

	it('the deferred patch note stands exactly while the tab does not', () => {
		// GENERALIZED FROM "nav.ts carries the patch", which landing the tab
		// legitimately broke. A note telling a reader how to add a tab that is
		// already there is worse than no note -- it reads as work outstanding.
		// So the note and the tab are mutually exclusive, and this bites in both
		// directions: re-withdraw the tab without restoring the note and it is
		// red, leave the note standing over a shipped tab and it is red.
		const nav = read('src/lib/classroom/nav.ts');
		const noteStands = nav.includes('duplicate-drafts-count-wzworl');
		const tabStands = sectionTabs('s-1').some((t) => t.href.endsWith('/duplicates'));
		expect(
			noteStands,
			tabStands
				? 'the tab has landed, so the patch note in nav.ts is stale: remove it'
				: 'the tab is withheld, so nav.ts must carry the patch that lands it'
		).toBe(!tabStands);
	});

	it('the tab activates on its own page, and is an in-classroom view not a departure', () => {
		const dupes = sectionTabs('s-1').find((t) => t.id === 'duplicates') as SectionTab;
		expect(dupes.manageOnly).toBe(true);
		expect(dupes.external).toBeUndefined();
		expect(dupes.href).toBe('/classroom/s-1/duplicates');
		expect(activeTab(locateClassroom(dupes.href))).toBe('duplicates');
		// It sits above the departure: an in-classroom view before a door out.
		const ids = sectionTabs('s-1').map((t) => t.id);
		expect(ids.indexOf('duplicates')).toBeLessThan(ids.indexOf('check-ins'));
	});
});
