/**
 * FULL PAGE, LEFT WITH ESCAPE (ledger 0431): the page goes back to the
 * ordinary view, the page behind scrolls again and focus returns to the Full
 * page key. Escape is a convenience (a keydown inside the sandboxed document
 * never reaches this window); the Exit key is the guarantee, measured in the
 * full-page spec.
 */
export default {
	path: '/dev/html-assignment-live?state=full-page-escape',
	aliasOf: '/dev/html-assignment-live',
	label: 'HTML assignment: full page, left with Escape',
	prepare: [
		{ waitFor: '() => window.__hxLive?.ready === true', attempts: 40, gapMs: 250 },
		{ click: '[data-testid="hx-fullpage"]', until: '() => document.querySelector(".hx-frame-wrap")?.dataset.hxExpanded === "yes"' },
		{
			evaluate: `() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 'escape sent'; }`
		},
		{ waitFor: '() => document.querySelector(".hx-frame-wrap")?.dataset.hxExpanded === "no"', attempts: 20, gapMs: 100 }
	],
	presence: [
		{ selector: '[data-testid="hx-fullpage"]', label: 'the Full page key is back', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.hx-frame-wrap.is-expanded', label: 'no full-page stage', expectPresent: 0, maxPresent: 0 }
	],
	orderResult: [
		{
			label: 'the page behind scrolls again and focus is back on Full page',
			evaluate: `() => [document.body.style.overflow === 'hidden' ? 'page still locked' : 'page scrolls', document.activeElement?.getAttribute?.('data-testid') ?? 'focus on ' + (document.activeElement?.tagName ?? 'nothing')]`,
			expected: ['page scrolls', 'hx-fullpage']
		}
	],
	tapTargets: [{ selector: '[data-testid="hx-fullpage"]', label: 'Full page', min: 44 }],
	contrast: [{ selector: '[data-testid="hx-fullpage"]', label: 'Full page', min: 4.5 }]
};
