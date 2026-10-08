/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * OPENING AN ITEM DOES NOT REBUILD THE CLASS PAGE BESIDE IT (ledger 0368,
 * report R02), on the REAL class page inside the REAL classroom shell and
 * split, as its teacher, by REAL navigations: a click on a row's link (a
 * client-side navigation to the item) and the browser's own Back.
 *
 * The defect: ClassView's root was `<svelte:element this={asPane ? 'section'
 * : 'main'}>`, and Svelte keys that block on the tag, so every item open and
 * every return built a NEW root and re-ran every child under it (the banner's
 * arrival, the header's pollers, a half-typed quick post). A remount renders
 * identical markup, so no presence or text read can see it; the instrument is
 * NODE IDENTITY. The first step tags the class page's root and its header with
 * a property no render writes, and each later read asks whether the node on
 * screen is still the tagged one. `tests/dom/class-view-pane-keeps-children`
 * holds the component alone; this holds the route around it (the split, the
 * layout, the item route), which is where a `{#key}` or a layout remount
 * would come back.
 *
 * Both directions on the landmark: `role="main"` with no label while the list
 * IS the page, no role and the label "Class content" while it is the column
 * beside an item. Below 1024px the item takes the screen and the list pane is
 * hidden, never unmounted, so the identity holds at 375 too.
 *
 * `aliasOf` because this is a STATE of the manage-1 route, not a route.
 */

const TAG = `() => {
	const page = document.querySelector('.classroom-page');
	const header = document.querySelector('[data-testid="class-header"]');
	if (!page || !header) return 'not painted';
	page.__paneKeeps = 'tagged';
	header.__paneKeeps = 'tagged';
	window.__paneKeeps = { page, header, log: [] };
	return 'tagged the class page root and its header';
}`;

/** One reading of the state on screen, appended to the log the verdict reads. */
const READ = (when) => `() => {
	const k = window.__paneKeeps;
	if (!k) return 'no tag';
	const page = document.querySelector('.classroom-page');
	const header = document.querySelector('[data-testid="class-header"]');
	const entry = {
		when: ${JSON.stringify(when)},
		path: location.pathname,
		samePage: page === k.page && page.__paneKeeps === 'tagged',
		sameHeader: header === k.header && header.__paneKeeps === 'tagged',
		role: page ? page.getAttribute('role') : null,
		label: page ? page.getAttribute('aria-label') : null,
		tag: page ? page.tagName.toLowerCase() : null,
		paneClass: page ? page.classList.contains('as-pane') : null
	};
	k.log.push(entry);
	return JSON.stringify(entry);
}`;

const ITEM_OPEN = `() => /\\/item\\//.test(location.pathname) && !!document.querySelector('[data-testid="item-row"][data-selected="true"]')`;
const LIST_BACK = `() => !/\\/item\\//.test(location.pathname) && !document.querySelector('[data-testid="item-row"][data-selected="true"]')`;

const VERDICT = `() => {
	const k = window.__paneKeeps;
	if (!k) return ['no tag'];
	const at = (w) => k.log.find((e) => e.when === w) || null;
	const open = at('item open');
	const back = at('back on the list');
	if (!open || !back) return ['readings missing: ' + k.log.map((e) => e.when).join(',')];
	return [
		'same root with the item open:' + open.samePage,
		'same header with the item open:' + open.sameHeader,
		'beside the item, no role and labelled:' + (open.role === null && open.label === 'Class content' && open.paneClass === true),
		'same root back on the list:' + back.samePage,
		'same header back on the list:' + back.sameHeader,
		'on the list, role main and no label:' + (back.role === 'main' && back.label === null && back.paneClass === false)
	];
}`;

export default {
	path: '/dev/classroom-split/s-1?manage=1&state=pane-keeps',
	aliasOf: '/dev/classroom-split/s-1?manage=1',
	label: 'R02: opening an item and coming back keeps the SAME class page root and header (node identity)',
	prepare: [
		/* PAINT IS NOT INTERACTIVITY (CLAUDE.md): the row link is server-rendered,
		   and a click before hydration is a FULL page load, which loses the tag
		   and reads exactly like the defect (measured: the first, cold width did
		   that on all forty attempts). The harness layout's own `$effect` sets
		   `window.__splitProbe`, which no server render can, so its presence is
		   the hydration marker; it is read twice across 2s because a cold dev
		   server reloads the page once while it optimizes a dependency. */
		{ waitFor: `() => typeof window.__splitProbe === 'function' && !!document.querySelector('[data-testid="item-row"] a[href*="/item/"]')`, timeoutMs: 20000 },
		{ evaluate: `() => new Promise((r) => setTimeout(() => r('settled 2s'), 2000))` },
		{ waitFor: `() => typeof window.__splitProbe === 'function' && !!document.querySelector('[data-testid="class-header"]')`, timeoutMs: 20000 },
		{ evaluate: TAG, until: `() => !!window.__paneKeeps` },
		/* `until` holds only once the CLIENT router has the item open AND the
		   tag survived, so a full load can never pass this step. */
		{
			click: '[data-testid="item-row"] a[href*="/item/"]',
			until: `() => (${ITEM_OPEN})() && !!window.__paneKeeps`,
			attempts: 20,
			gapMs: 500
		},
		{ evaluate: READ('item open') },
		/* ONE Back, however many times the step re-runs while the router
		   settles: a second one would leave the harness altogether. */
		{
			evaluate: `() => { if (!window.__paneKeepsBack) { window.__paneKeepsBack = true; history.back(); } return 'back'; }`,
			until: LIST_BACK,
			attempts: 20
		},
		{ evaluate: READ('back on the list') }
	],
	orderResult: [
		{
			label: 'the class page root and its header are the same nodes with an item open and after Back; the landmark moves by role',
			evaluate: VERDICT,
			expected: [
				'same root with the item open:true',
				'same header with the item open:true',
				'beside the item, no role and labelled:true',
				'same root back on the list:true',
				'same header back on the list:true',
				'on the list, role main and no label:true'
			]
		}
	],
	presence: [{ selector: '.classroom-page[role="main"]', label: 'the class page is the main landmark again', expectPresent: 1, maxPresent: 1 }],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED', '\\[401 http://127\\.0\\.0\\.1:\\d+/api/classroom/attachment/']
};
