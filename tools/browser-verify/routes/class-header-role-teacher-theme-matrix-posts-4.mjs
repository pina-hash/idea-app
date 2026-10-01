/**
 * THE CLASS HEADER UNDER MATRIX (ledger 0360, reports R19 and R22), as the
 * teacher sees it, at 375 and 1440: every word on the Matrix wash, on the
 * identity chip, on the keys and on the notice cards, against the floors.
 */
import { IGNORE, MEASURE, READY, THEME_READY } from './_class-header.mjs';

export default {
	path: '/dev/class-header?role=teacher&theme=matrix&posts=4',
	label: 'Class header, Matrix: the words on the Matrix wash and the notice cards',
	ignoreConsole: IGNORE,
	prepare: [
		{ waitFor: READY, label: 'the header and its notices have painted' },
		{ waitFor: `() => document.documentElement.getAttribute('data-theme') === 'matrix'`, label: 'Matrix is on' },
		THEME_READY,
		{ evaluate: MEASURE }
	],
	presence: [
		{ selector: '[data-testid="quick-posts"] > [data-testid="quick-post"]', label: 'three notices shown', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="quick-posts-more"]', label: 'the fourth, folded under "1 more notice"', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '[data-testid="harness-class"] .pane-title', label: 'the class name on the washed banner', min: 4.5 },
		{ selector: '[data-testid="class-header-meta"]', label: 'the class identity on its chip', min: 4.5 },
		{ selector: '[data-testid="class-next-due"] .ch-text', label: 'the next due title', min: 4.5 },
		{ selector: '[data-testid="class-header-teams"] .ch-text', label: 'the teams key', min: 4.5 },
		{ selector: '[data-testid="quick-post"] .qp-word', label: 'the word Notice', min: 4.5 },
		{ selector: '[data-testid="quick-post-until"]', label: 'when the notice ends', min: 4.5 },
		{ selector: '[data-testid="quick-post-body"]', label: 'the notice itself', min: 4.5 },
		{ selector: '[data-testid="quick-post-body"] .qp-link', label: 'a link in a notice', min: 4.5 },
		{ selector: '[data-testid="quick-post-manage"] .qp-reach', label: 'the classes it went to', min: 4.5 }
	]
};
