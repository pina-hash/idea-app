/**
 * ONE CLICK ON A CLASS CARD'S HEADER GOES INTO THE CLASS, WITH THE CARD FOLDED,
 * AND DOES NOT FOLD OR OPEN IT ON THE WAY (ledger 0396, part 3).
 *
 * `?base=dev` points the feed's class link at the harness's own landing page
 * (src/routes/dev/home-feed/class/[sectionId]) instead of `/classroom/<id>`,
 * which a signed-out harness cannot open: the prefix guard would send the
 * click to `/`, which looks the same as a link that went nowhere. The landing
 * prints the section it was opened for and how many folds the harness recorded
 * (`toggle-log.ts`, a module, so it survives the client-side navigation).
 *
 * The run folds the first card through its key (which also proves the page is
 * hydrated, so the link click is the app's own navigation and not a cold
 * document load), notes the fold count the harness shows, and clicks the
 * card's link once. A link click that also reached the fold would leave one
 * more fold recorded than the harness showed before it.
 */
import { SETTLE_ENTRANCE } from './_shared.mjs';

const FIRST_TOGGLE = '.legacy-index .feed-card [data-testid="feed-toggle"]';
const FIRST_LINK = '.legacy-index .feed-card [data-testid="feed-open"]';

export default {
	path: '/dev/home-feed?base=dev&state=class-link',
	/* The runner visits `aliasOf`, so the parameter that points the link at
	   the landing has to be on it, not only on `path`. */
	aliasOf: '/dev/home-feed?base=dev',
	label: 'Home class card: one click on the header link goes into the class, card folded, no fold on the way',
	prepare: [
		{ evaluate: SETTLE_ENTRANCE, waitMs: 150 },
		{
			click: FIRST_TOGGLE,
			until: `() => document.querySelector('${FIRST_TOGGLE}')?.getAttribute('aria-expanded') === 'false'`,
			waitMs: 600
		},
		{
			label: 'note the card state and the fold count before the link is clicked',
			evaluate: `() => {
				window.__classLink = {
					href: document.querySelector('${FIRST_LINK}').getAttribute('href'),
					expanded: document.querySelector('${FIRST_TOGGLE}').getAttribute('aria-expanded'),
					folds: document.querySelectorAll('.hf-log > div').length
				};
				return JSON.stringify(window.__classLink);
			}`
		},
		{
			click: FIRST_LINK,
			until: `() => !!document.querySelector('[data-testid="feed-landing"]')`,
			waitMs: 400
		}
	],
	presence: [
		{ selector: '[data-testid="feed-landing"][data-section="sec-p1"]', label: 'the landing for the first class', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="home-feed-harness"]', label: 'the feed harness is gone (the click navigated)', expectPresent: 0 }
	],
	orderResult: [
		{
			label: 'went into the class it named, from a folded card, with no fold on the way',
			evaluate: `() => {
				const before = window.__classLink ?? {};
				const recorded = Number(document.querySelector('[data-testid="feed-landing-folds"]')?.dataset.count ?? -1);
				return [
					'link ' + before.href,
					'now at ' + location.pathname,
					'card folded at the click: ' + (before.expanded === 'false'),
					'folds recorded after the click equal folds before it: ' + (recorded === before.folds && recorded > 0)
				];
			}`,
			expected: [
				'link /dev/home-feed/class/sec-p1',
				'now at /dev/home-feed/class/sec-p1',
				'card folded at the click: true',
				'folds recorded after the click equal folds before it: true'
			]
		}
	],
	tapTargets: []
};
