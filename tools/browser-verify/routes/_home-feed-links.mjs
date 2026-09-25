/**
 * THE HOME FEED'S TWO LINKS, AT REST AND ON HOVER (ledger 0298, decision 40
 * item 1). "See all in To-do" above the class cards and "Open class" at the
 * foot of each one painted --gold at rest, which Space White turns into the
 * brown #715d22 every lightness-only yellow lands on. They take the page's own
 * link register there -- cyan at rest, green under the pointer, the pair the
 * banner's Sign in / Tour links and every text button on this page already
 * use -- and IDEA keeps the brass it had, so the dark theme renders exactly as
 * before.
 *
 * The theme is reached through the SHIPPING control (the profile menu row) on
 * the harness that fakes a session, the way ./_home-theme.mjs reaches it; the
 * probe is ./_hover-ink.mjs's, which reads the rest state first and then forces
 * the hover onto one node.
 */
import { SETTLE_ENTRANCE } from './_shared.mjs';
import { HOME, reach } from './_home-theme.mjs';
import { HOVER_FLOORS, HOVER_PROBE, HOVER_VERDICTS, floorVerdicts } from './_hover-ink.mjs';

const TODO = '[data-testid="feed-todo-all"]';
const OPEN = '.legacy-index .feed-card .feed-more';

/* Rest before hover: the probe marks a hovered host, and a rest read after it
   would read the hover. */
export const FEED_LINK_TARGETS = [
	{ name: 'to-do link at rest', host: TODO, prop: 'color', state: 'rest' },
	{ name: 'open class link at rest', host: OPEN, prop: 'color', state: 'rest' },
	{ name: 'to-do link on hover', host: TODO, prop: 'color', state: 'hover' },
	{ name: 'open class link on hover', host: OPEN, prop: 'color', state: 'hover' }
];

export const homeFeedLinksSpec = (theme) => {
	const rest = theme === 'space-white' ? 'cyan' : 'gold';
	const wall = theme === 'space-white';
	return {
		path: `${HOME}&state=feed-links-${theme}`,
		aliasOf: HOME,
		label: `Home feed links under the ${theme} theme: See all in To-do and Open class, at rest and on hover`,
		prepare: [
			{ evaluate: SETTLE_ENTRANCE, waitMs: 150, label: 'settle the entrance' },
			...reach(theme),
			{ waitFor: `() => !!document.querySelector('${TODO}') && !!document.querySelector('${OPEN}')`, timeoutMs: 20000, label: 'both links are on the page' },
			{ evaluate: HOVER_PROBE(FEED_LINK_TARGETS), label: 'read each link at rest, then force its hover', waitMs: 100 }
		],
		presence: [
			theme === 'idea'
				? { selector: 'html[data-theme]', label: 'no theme attribute on <html>', expectPresent: 0, maxPresent: 0 }
				: { selector: `html[data-theme="${theme}"]`, label: `the ${theme} attribute is on <html>`, expectPresent: 1, maxPresent: 1 },
			{ selector: TODO, label: 'See all in To-do', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
			{ selector: OPEN, label: 'Open class (one class)', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
		],
		orderResult: [
			{
				label: `at rest ${rest}, on hover green`,
				evaluate: HOVER_VERDICTS,
				expected: FEED_LINK_TARGETS.map((t) => `${t.name}: ${t.state} ink ${t.state === 'rest' ? rest : 'green'}`)
			},
			{
				label: wall ? 'text on its real ground: 4.5, and 3.0 washed on the wall' : 'text on its real ground: 4.5 (the wall is recorded, not gated)',
				evaluate: HOVER_FLOORS(FEED_LINK_TARGETS, { washed: wall }),
				expected: floorVerdicts(FEED_LINK_TARGETS, { washed: wall })
			}
		]
	};
};
