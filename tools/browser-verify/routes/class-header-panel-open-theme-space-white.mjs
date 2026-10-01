/**
 * THE CLASS THEME VOTE OPENED FROM THE HEADER, UNDER SPACE WHITE (ledger
 * 0360, reports R19 and R21), at 375 and 1440: the band's opaque ground in the
 * light theme, and every word on it against the floors.
 */
import { IGNORE, READY, THEME_READY } from './_class-header.mjs';

export default {
	path: '/dev/class-header?panel=open&theme=space-white',
	label: 'Class header, Space White: the theme vote band and its words',
	ignoreConsole: IGNORE,
	prepare: [
		{ waitFor: READY, label: 'the header has painted' },
		{ waitFor: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`, label: 'Space White is on' },
		THEME_READY,
		{
			click: '[data-testid="class-header-row"] [data-testid="class-theme-toggle"]',
			until: `() => document.querySelector('[data-testid="class-theme-toggle"]')?.getAttribute('aria-expanded') === 'true' && document.querySelectorAll('[data-testid="class-theme-vote"]').length > 0`,
			label: 'the vote is open, its keys read'
		}
	],
	presence: [
		{ selector: '[data-testid="class-header-row"] [data-testid="class-theme-feature"]', label: 'the three features, inside the header row', expectPresent: 3, maxPresent: 3, expectVisible: 3 }
	],
	contrast: [
		{ selector: '.ctp-hint', label: 'what a feature changes, on the band', min: 4.5 },
		{ selector: '.ctp-lead', label: 'the vote’s lead sentence', min: 4.5 },
		{ selector: '[data-testid="class-theme-vote"] .ctp-word', label: 'an option word on its key', min: 4.5 },
		{ selector: '[data-testid="class-theme-count"]', label: 'a count on its key', min: 4.5 },
		{ selector: '[data-testid="class-header-meta"]', label: 'the class identity on its chip', min: 4.5 }
	]
};
