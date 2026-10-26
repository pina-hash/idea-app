/** The other direction of item-header-manage-1-switch-1.mjs: the title shown. */
export default {
	path: '/dev/item-header?manage=1&switch=1&shown=1',
	label: 'Item header with the post title shown: one visible heading, the switch still in the inspector',
	prepare: [
		{ waitFor: `() => !!document.querySelector('[data-testid="item-hero"] h1')` },
		{ click: '[data-testid="inspector-toggle"]', until: `() => !!document.querySelector('[data-testid="item-title-switch"]')`, waitMs: 150 }
	],
	presence: [
		{ selector: '[data-testid="item-hero"].hero-compact', label: 'the compact header with a title on', expectPresent: 0 },
		{ selector: '[data-testid="item-hero"] h1', label: 'the visible title', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		{ selector: 'h1.sr-title', label: 'a second, hidden title', expectPresent: 0 },
		{ selector: '[data-testid="item-inspector"] [data-testid="item-title-switch"]', label: 'the title switch in the edit options', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 }
	],
	tapTargets: []
};
