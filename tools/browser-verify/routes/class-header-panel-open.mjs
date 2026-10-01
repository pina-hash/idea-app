/**
 * THE CLASS THEME VOTE, OPENED FROM THE HEADER'S ROW (ledger 0360, reports R19
 * and R21), at 375 and 1440, as a student.
 *
 * The vote's trigger is a key in the class header's row, and the vote itself
 * drops to a full-width band under the row, INSIDE the banner. The banner is a
 * translucent wash on which the vote's hints (`--text-2`) measured 3.13:1, so
 * the band sits on an opaque card ground; this run opens it and measures every
 * word on it, with the vote keys at 44px.
 */
import { IGNORE, READY, THEME_READY } from './_class-header.mjs';

export default {
	path: '/dev/class-header?panel=open',
	label: 'Class header: the theme vote opened from the key row, on an opaque band',
	ignoreConsole: IGNORE,
	prepare: [
		{ waitFor: READY, label: 'the header has painted' },
		THEME_READY,
		{
			click: '[data-testid="class-header-row"] [data-testid="class-theme-toggle"]',
			until: `() => document.querySelector('[data-testid="class-theme-toggle"]')?.getAttribute('aria-expanded') === 'true' && document.querySelectorAll('[data-testid="class-theme-vote"]').length > 0`,
			label: 'the vote is open, its keys read'
		}
	],
	presence: [
		{ selector: '[data-testid="class-header-row"] [data-testid="class-theme-feature"]', label: 'the three features, inside the header row', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="class-theme-toggle"][aria-expanded="true"].on', label: 'the trigger, lit while open', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '.ctp-hint', label: 'what a feature changes, on the band', min: 4.5 },
		{ selector: '.ctp-lead', label: 'the vote’s lead sentence', min: 4.5 },
		{ selector: '[data-testid="class-theme-vote"] .ctp-word', label: 'an option word on its key', min: 4.5 },
		{ selector: '[data-testid="class-theme-count"]', label: 'a count on its key', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="class-theme-vote"]', label: 'a vote key', min: 44 },
		{ selector: '[data-testid="class-theme-toggle"]', label: 'Class theme', min: 44 }
	]
};
