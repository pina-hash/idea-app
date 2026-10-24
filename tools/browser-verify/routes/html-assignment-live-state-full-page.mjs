/**
 * FULL PAGE (ledger 0431, report 989cfcb6): the worksheet takes the whole
 * window, not the browser's fullscreen, with the way back always on screen.
 * The same element goes `position: fixed`, so the running document is never
 * moved or reloaded; Foundry's AppStage overlay is the pattern, and these rows
 * are its rows.
 */
export default {
	path: '/dev/html-assignment-live?state=full-page',
	aliasOf: '/dev/html-assignment-live',
	label: 'HTML assignment: full page, filling the window',
	prepare: [
		{ waitFor: '() => window.__hxLive?.ready === true', attempts: 40, gapMs: 250 },
		{ click: '[data-testid="hx-fullpage"]', until: '() => document.querySelector(".hx-frame-wrap")?.dataset.hxExpanded === "yes"' }
	],
	presence: [
		{ selector: '.hx-frame-wrap.is-expanded [data-testid="hx-fullpage-exit"]', label: 'Exit full page, on screen', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.hx-frame-wrap.is-expanded [data-testid="hx-answers-left"]', label: 'Answers left, in the full-page bar', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.hx-frame-wrap.is-expanded iframe[data-hx-frame]', label: 'the same frame, inside the full-page stage', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="hx-fullpage"]', label: 'no second way in while full page is open', expectPresent: 0, maxPresent: 0 }
	],
	orderResult: [
		{
			label: 'the full-page stage is exactly the window',
			evaluate: `() => { const s = document.querySelector('.hx-frame-wrap.is-expanded'); if (!s) return ['NOT EXPANDED']; const b = s.getBoundingClientRect(); const near = (a, c) => Math.abs(a - c) < 1; return [getComputedStyle(s).position, near(b.width, innerWidth) ? 'width = viewport' : 'width ' + b.width.toFixed(1) + ' vs ' + innerWidth, near(b.height, innerHeight) ? 'height = viewport' : 'height ' + b.height.toFixed(1) + ' vs ' + innerHeight, near(b.top, 0) ? 'top = 0' : 'top ' + b.top.toFixed(1)]; }`,
			expected: ['fixed', 'width = viewport', 'height = viewport', 'top = 0']
		},
		{
			/* A SHORT DOCUMENT FILLS THE STAGE rather than sitting in a 240px box
			   at the top of an empty window. */
			label: 'the worksheet gets at least 75% of the window height',
			evaluate: `() => { const f = document.querySelector('.hx-frame-wrap.is-expanded iframe[data-hx-frame]'); if (!f) return ['NO FRAME']; const share = f.getBoundingClientRect().height / innerHeight; return [share >= 0.75 ? 'frame >= 75% of window height' : 'frame ' + (share * 100).toFixed(1) + '% of window height']; }`,
			expected: ['frame >= 75% of window height']
		},
		{
			/* THE WAY BACK IS ON TOP: a hit test at its centre lands on it, and the
			   page behind is locked so a wheel does not scroll it underneath. */
			label: 'Exit full page is the topmost thing at its own centre, and the page behind does not scroll',
			evaluate: `() => { const b = document.querySelector('[data-testid="hx-fullpage-exit"]'); if (!b) return ['NO EXIT']; const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return [b.contains(hit) ? 'exit hit-tests to itself' : 'covered by ' + (hit?.className || hit?.tagName), document.body.style.overflow === 'hidden' ? 'page behind locked' : 'page behind scrolls', document.activeElement === b ? 'focus on Exit' : 'focus elsewhere']; }`,
			expected: ['exit hit-tests to itself', 'page behind locked', 'focus on Exit']
		},
		{
			label: 'the bar fits the screen',
			evaluate: `() => [document.documentElement.scrollWidth <= innerWidth ? 'no horizontal scroll' : 'page is ' + document.documentElement.scrollWidth + ' wide']`,
			expected: ['no horizontal scroll']
		}
	],
	tapTargets: [
		{ selector: '[data-testid="hx-fullpage-exit"]', label: 'Exit full page', min: 44 },
		{ selector: '.hx-frame-wrap.is-expanded [data-testid="hx-answers-left"]', label: 'Answers left in the bar', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="hx-fullpage-exit"]', label: 'Exit full page', min: 4.5 },
		{ selector: '.hx-bar-title', label: 'the worksheet title in the bar', min: 4.5 }
	]
};
