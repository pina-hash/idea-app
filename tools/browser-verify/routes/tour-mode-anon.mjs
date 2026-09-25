/**
 * THE HOME TOUR FOR A SIGNED-OUT VISITOR (ledger 0298). On arrival the one
 * pre-auth step starts on its own (Sign in with Google, the only step that
 * lets a click through). Closed, and replayed from Take the tour, the whole
 * student tour runs after it -- minus everything a visitor has no control
 * for: no profile menu and no to-do door, so neither step is shown.
 */
import { CALLOUT_OPEN, FIRST_AND_LAST, HIDE_HARNESS_PANEL, TOUR_AUTO_LAUNCHED, WALK_TOUR, titlesInclude, walkVerdict } from './_home-tour.mjs';

export default {
	path: '/dev/tour?mode=anon',
	label: 'Home tour signed out: the sign-in step on arrival, then the whole visitor tour from Take the tour',
	settleMs: 1500,
	prepare: [
		HIDE_HARNESS_PANEL,
		TOUR_AUTO_LAUNCHED,
		{
			evaluate: `() => {
				const title = (document.querySelector('[data-testid="tour-callout"] h3')?.textContent ?? '').trim();
				const count = (document.querySelector('[data-testid="tour-count"]')?.textContent ?? '').trim();
				window.__anonFirst = [title, count];
				window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
				return 'on arrival: ' + title + ' (' + count + '); Escape pressed';
			}`,
			until: `() => !document.querySelector('[data-testid="tour-callout"]')`,
			waitMs: 200
		},
		{ click: '[data-tour="tour-trigger"]', until: CALLOUT_OPEN, waitMs: 900 },
		WALK_TOUR
	],
	presence: [
		{ selector: '[data-tour="signin"]', label: 'the sign-in control the first step points at', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-tour="profile"]', label: 'no profile menu signed out', expectPresent: 0 },
		{ selector: '[data-testid="todo-strip"]', label: 'no to-do door signed out', expectPresent: 0 },
		{ selector: '[data-testid="tour-offer"]', label: 'no offer signed out', expectPresent: 0 }
	],
	orderResult: [
		{ label: 'on arrival: the one sign-in step, alone', evaluate: `() => window.__anonFirst ?? ['NOT READ']`, expected: ['Sign in with Google', '1 of 1'] },
		{ label: 'the replay: every step on screen, at least 16', evaluate: walkVerdict(16), expected: ['none', 'true'] },
		{ label: 'the replay opens on sign-in and ends on Take the tour', evaluate: FIRST_AND_LAST, expected: ['Sign in with Google', 'Take the tour'] },
		{ label: 'no step for a control a visitor does not have', evaluate: titlesInclude(['Your profile', 'Your to-do', 'Coin Desk']), expected: ['false', 'false', 'false'] },
		{ label: 'and the rest of the page is there', evaluate: titlesInclude(['Welcome to IDEA', 'Apps', 'Your classes', 'IDEA Maps', 'Report a problem']), expected: ['true', 'true', 'true', 'true', 'true'] }
	]
};
