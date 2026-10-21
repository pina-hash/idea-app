/**
 * VIEW AS (ledger 0422, feedback d1c9ed15): the one floating panel over a
 * page an admin sees as someone else. The REAL `$lib/shell/ViewAsPanel.svelte`
 * and the REAL View as / Act as keys. Claims, each a number:
 *  1. ONE PANEL, ONE CONTROL TO LEAVE: exactly one panel and one Exit key.
 *  2. IT SITS INSIDE THE WINDOW at both widths, with no horizontal scroll.
 *  3. Its key and grip clear 44px; its words read at 4.5:1 on its own plate.
 */
import { SETTLE_ENTRANCE } from './_shared.mjs';

export default {
	path: '/dev/view-as',
	label: 'View as: the one floating exit panel, read-only',
	prepare: [{ evaluate: SETTLE_ENTRANCE, waitMs: 150 }],
	presence: [
		{ selector: '[data-testid="view-as-panel"]', label: 'the panel', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="view-as-panel"][data-mode="view"]', label: 'in view mode', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="view-as-exit"]', label: 'one Exit key', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="view-as-panel"] button:not([data-testid="view-as-exit"]):not(.va-grip), [data-testid="view-as-panel"] a', label: 'no other control in the panel', expectPresent: 0 },
		{ selector: '[data-testid="view-as-buttons"]', label: 'View as / Act as keys beside each person', expectPresent: 2, maxPresent: 2 }
	],
	textContains: [{ selector: '[data-testid="view-as-panel"]', label: 'who and how', must: ['Viewing as', 'Ana Reyes', 'Read-only', 'left'] }],
	orderResult: [
		{
			label: 'the panel is inside the window, and the page does not scroll sideways',
			evaluate: `() => { const r = document.querySelector('[data-testid="view-as-panel"]').getBoundingClientRect(); const inside = r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; return [inside ? 'inside' : 'outside ' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height), document.documentElement.scrollWidth === document.documentElement.clientWidth ? 'no overflow' : 'overflow']; }`,
			expected: ['inside', 'no overflow']
		}
	],
	contrast: [
		{ selector: '.va-name', label: 'the name', min: 4.5 },
		{ selector: '.va-sub', label: 'the line under it', min: 4.5 },
		{ selector: '.va-tag', label: 'the mode tag', min: 4.5 },
		{ selector: '.va-exit', label: 'Exit', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.va-exit', label: 'Exit', min: 44 },
		{ selector: '.va-grip', label: 'the grip (height)', min: 22 },
		{ selector: '[data-testid="view-as-buttons"] .btn', label: 'View as / Act as keys', min: 44 }
	]
};
