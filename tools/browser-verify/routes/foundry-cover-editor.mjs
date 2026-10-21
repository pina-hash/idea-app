/**
 * /dev/foundry-cover-editor (ledger 0422, feedback 1cc58a6e): the REAL cover
 * editor beside three REAL gallery cards, one wearing an HTML cover served
 * under the REAL cover policy. The card's frame is sandboxed to scripts and out
 * of the tab order; the editor offers a picture, an HTML file, pasted HTML and
 * the way back; every key clears 44px.
 */
import { SETTLE_ENTRANCE } from './_shared.mjs';

export default {
	path: '/dev/foundry-cover-editor',
	label: 'Foundry covers: an HTML cover on its card, and the editor',
	prepare: [{ evaluate: SETTLE_ENTRANCE, waitMs: 600 }],
	presence: [
		{ selector: '[data-testid="fdy-card"]', label: 'three cards', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="fdy-card-html"]', label: 'one HTML cover frame', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="fdy-card-html"][sandbox="allow-scripts"][tabindex="-1"]', label: 'sandboxed, out of the tab order', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="foundry-cover-editor"]', label: 'the editor', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="fce-frame"]', label: 'the live preview', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: 'label.fce-key:has(input[type="file"])', label: 'picture and HTML file keys', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="fce-clear"]', label: 'the way back', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	orderResult: [
		{
			label: 'no horizontal scroll',
			evaluate: `() => [document.documentElement.scrollWidth === document.documentElement.clientWidth ? 'no overflow' : 'overflow ' + document.documentElement.scrollWidth]`,
			expected: ['no overflow']
		},
		{
			label: 'the cover document cannot reach this page (opaque origin)',
			evaluate: `() => { const f = document.querySelector('[data-testid="fdy-card-html"]'); try { return [f.contentDocument === null ? 'sealed' : 'reachable']; } catch (e) { return ['sealed']; } }`,
			expected: ['sealed']
		},
		{
			label: 'the cover is served under the cover policy',
			evaluate: `async () => { const r = await fetch('/dev/foundry-cover-editor/sample'); const c = r.headers.get('content-security-policy') || ''; return [c.includes('sandbox allow-scripts') && c.includes("connect-src 'none'") && !c.includes('allow-same-origin') ? 'policy' : 'missing: ' + c]; }`,
			expected: ['policy']
		}
	],
	contrast: [
		{ selector: '.fce-sub, .fce-note', label: 'editor notes', min: 4.5 },
		{ selector: '.fce-tag', label: 'preview tag', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.fce-key', label: 'every editor key', min: 44 },
		{ selector: '.fce-summary', label: 'the paste disclosure', min: 44 }
	]
};
