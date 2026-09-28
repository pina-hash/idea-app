/**
 * CLASS THEMES UNDER THE MATRIX THEME (decision 45), at 375 and 1440. The same
 * student fixture as `classroom-theme.mjs`; what moves is the ground, so what is
 * re-measured is every word on the washed banner and every edge at 3:1 on its
 * own composited ground. matrix is forced on <html> (the harness holds no session).
 */
import { GRAPHIC_PASS, GRAPHIC_REPORT, IGNORE, OPEN_PANEL, READY } from './_classroom-theme.mjs';

export default {
	path: '/dev/classroom-theme?theme=matrix',
	label: 'Class theme under matrix: the banner and the panel on that ground',
	ignoreConsole: IGNORE,
	prepare: [
		{ waitFor: READY, label: 'the class page and the three class cards have painted' },
		{ waitFor: `() => document.documentElement.getAttribute('data-theme') === 'matrix' && !!document.querySelector('[data-testid="class-theme-toggle"]')`, label: 'the theme is on and the panel is offered' },
		{ evaluate: GRAPHIC_REPORT },
		OPEN_PANEL
	],
	presence: [
		{ selector: '[data-testid="class-banner"]', label: 'the class banner', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-theme-vote"]', label: 'a vote key per option', expectPresent: 18, maxPresent: 18, expectVisible: 18 }
	],
	contrast: [
		{ selector: '[data-testid="harness-class"] .pane-title', label: 'the class name on the washed banner', min: 4.5 },
		{ selector: '[data-testid="harness-class"] .ct-banner .pane-meta', label: 'the code, period and teacher on the banner', min: 4.5 },
		{ selector: '[data-testid="class-theme-words"]', label: 'the theme in words', min: 4.5 },
		{ selector: '.ctp-hint', label: 'what a feature changes', min: 4.5 },
		{ selector: '[data-testid="class-theme-count"]', label: 'a count on its key', min: 4.5 },
		{ selector: '.class-card.themed .class-code', label: 'a themed card code', min: 4.5 }
	],
	orderResult: [
		{
			label: 'the accent stripe, the strip bars and the card edges each clear 3:1 on their own ground',
			evaluate: GRAPHIC_PASS,
			expected: ['examined=5', 'allClear3=true']
		}
	]
};
