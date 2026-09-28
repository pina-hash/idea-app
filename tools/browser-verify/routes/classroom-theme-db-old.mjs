/**
 * A DEPLOYMENT WITHOUT 0225 (decision 45), at 375 and 1440: every theme call
 * answers `unavailable` (PGRST202), and every theme surface is simply ABSENT --
 * no banner, no panel, no strip bar, no card edge -- with no error on screen.
 * The class page itself renders as always (the positive control).
 */
import { IGNORE, READY } from './_classroom-theme.mjs';

export default {
	path: '/dev/classroom-theme?db=old',
	label: 'Class theme on a database without the vote: nothing, silently',
	ignoreConsole: IGNORE,
	prepare: [
		{ waitFor: READY, label: 'the class page and the three class cards have painted' },
		{ waitFor: `() => (document.querySelector('[data-testid="class-theme-harness"]')?.dataset.log || '').includes('tally')`, label: 'the panel asked for its tally and was told there is none' }
	],
	presence: [
		{ selector: '[data-testid="harness-class"] .pane-title', label: 'the class title (positive control)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-banner"]', label: 'a banner', expectPresent: 0 },
		{ selector: '[data-testid="class-theme-panel"]', label: 'the vote panel', expectPresent: 0 },
		{ selector: '[data-testid="class-theme-error"]', label: 'an error', expectPresent: 0 },
		{ selector: '[data-testid="class-icon-theme"]', label: 'a strip bar', expectPresent: 0 },
		{ selector: '.class-card.themed', label: 'a themed card', expectPresent: 0 },
		{ selector: '.class-card', label: 'the three plain cards (positive control)', expectPresent: 3, maxPresent: 3, expectVisible: 3 }
	]
};
