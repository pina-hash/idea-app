/**
 * THE HOME TOUR FOR A SIGNED-OUT VISITOR (ledger 0298; the arrival changed in
 * ledger 0468). On arrival nothing dims the page: the inline offer row shows
 * under the header ("Show me around", "Not now"), the classroom's own offer,
 * and no spotlight starts. Show me around runs the whole visitor tour,
 * opening on Sign in with Google -- minus everything a visitor has no control
 * for: no profile menu and no to-do door, so neither step is shown.
 */
import { CALLOUT_OPEN, FIRST_AND_LAST, HIDE_HARNESS_PANEL, WALK_TOUR, titlesInclude, walkVerdict } from './_home-tour.mjs';

export default {
	path: '/dev/tour?mode=anon',
	label: 'Home tour signed out: the inline offer on arrival and no dim, then the whole visitor tour from Show me around',
	settleMs: 1500,
	prepare: [
		HIDE_HARNESS_PANEL,
		{
			waitFor: `() => !!document.querySelector('[data-testid="tour-offer"]')`,
			timeoutMs: 15000,
			label: 'the offer row has come'
		},
		{
			evaluate: `() => {
				window.__anonArrival = [
					document.querySelector('[data-testid="tour-offer"]') ? 'offer' : 'NO OFFER',
					document.querySelector('[data-testid="tour-callout"]') ? 'SPOTLIGHT' : 'no spotlight'
				];
				return 'on arrival: ' + window.__anonArrival.join(', ');
			}`
		},
		{ click: '[data-testid="tour-offer-start"]', until: CALLOUT_OPEN, waitMs: 900 },
		WALK_TOUR
	],
	presence: [
		{ selector: '[data-tour="signin"]', label: 'the sign-in control the first step points at', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-tour="profile"]', label: 'no profile menu signed out', expectPresent: 0 },
		{ selector: '[data-testid="todo-strip"]', label: 'no to-do door signed out', expectPresent: 0 },
		{ selector: '[data-testid="tour-offer"]', label: 'the offer is gone once the tour runs', expectPresent: 0 }
	],
	orderResult: [
		{ label: 'on arrival: the offer row and no spotlight', evaluate: `() => window.__anonArrival ?? ['NOT READ']`, expected: ['offer', 'no spotlight'] },
		{ label: 'the tour: every step on screen, at least 16', evaluate: walkVerdict(16), expected: ['none', 'true'] },
		{ label: 'the tour opens on sign-in and ends on Take the tour', evaluate: FIRST_AND_LAST, expected: ['Sign in with Google', 'Take the tour'] },
		{ label: 'no step for a control a visitor does not have', evaluate: titlesInclude(['Your profile', 'Your to-do', 'Coin Desk']), expected: ['false', 'false', 'false'] },
		{ label: 'and the rest of the page is there', evaluate: titlesInclude(['Welcome to IDEA', 'Apps', 'Your classes', 'IDEA Maps', 'Send feedback']), expected: ['true', 'true', 'true', 'true', 'true'] }
	]
};
