/**
 * THE ITEM HEADER ABOVE A PORTED WORKSHEET, TITLE HIDDEN (ledger 0438, reports
 * 3ac88030 and 36198988). Before: the hidden title still drew the plate's
 * title bar, 292 by 18px with both hazard decals, and the header took three
 * rows (116px at 1440, 134px at 375) with the Show title switch on the page.
 * After: no visible heading, no decals, the kind, chips and due line on one
 * line, and the switch inside the inspector. The `shown=1` alias is the other
 * direction: one visible heading and the switch still in the inspector.
 */
export default {
	path: '/dev/item-header?manage=1&switch=1',
	label: 'Item header with the post title hidden: one line, no decals, the switch in the inspector',
	prepare: [
		{ waitFor: `() => !!document.querySelector('[data-testid="item-hero"]')` },
		{ click: '[data-testid="inspector-toggle"]', until: `() => !!document.querySelector('[data-testid="item-title-switch"]')`, waitMs: 150 }
	],
	presence: [
		{ selector: '[data-testid="item-hero"].hero-compact', label: 'the compact header', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		{ selector: '[data-testid="item-hero"] h1', label: 'a heading inside the header (it drew the empty decal bar)', expectPresent: 0 },
		{ selector: 'h1.sr-title', label: 'the title kept for screen readers, outside the header', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="item-hero"] [data-testid="item-title-switch"]', label: 'the title switch on the page', expectPresent: 0 },
		{ selector: '[data-testid="item-inspector"] [data-testid="item-title-switch"]', label: 'the title switch in the edit options', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 }
	],
	tapTargets: []
};
