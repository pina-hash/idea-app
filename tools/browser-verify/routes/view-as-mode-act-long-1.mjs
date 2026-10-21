/** VIEW AS, act mode (ledger 0422): crimson, says changes are real and logged, still one Exit key. */
import { SETTLE_ENTRANCE } from './_shared.mjs';

export default {
	path: '/dev/view-as?mode=act&long=1',
	label: 'Act as: the panel says changes are real and logged; a long name truncates',
	prepare: [{ evaluate: SETTLE_ENTRANCE, waitMs: 150 }],
	presence: [
		{ selector: '[data-testid="view-as-panel"][data-mode="act"]', label: 'the panel in act mode', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="view-as-exit"]', label: 'one Exit key', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [{ selector: '[data-testid="view-as-panel"]', label: 'acting, logged', must: ['Acting as', 'real and logged'] }],
	orderResult: [
		{
			label: 'the panel is inside the window even with a long name',
			evaluate: `() => { const r = document.querySelector('[data-testid="view-as-panel"]').getBoundingClientRect(); return [r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight ? 'inside' : 'outside ' + Math.round(r.right) + '/' + innerWidth]; }`,
			expected: ['inside']
		}
	],
	contrast: [
		{ selector: '.va-tag', label: 'the mode tag', min: 4.5 },
		{ selector: '.va-sub', label: 'the line under it', min: 4.5 }
	]
};
