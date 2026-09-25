import { IGNORE_FIXTURE_PHOTO } from './_quick-note.mjs';

/**
 * THE NOTE CONTROL CAN BE REACHED AT EVERY WIDTH (ledger 0298). From 560px up
 * it is in the classroom header row; below it the row cannot hold it without
 * losing the last class icon (ClassroomShell has the measurement), so it is the
 * Menu's first entry. This spec opens the Menu where there is one and measures
 * whichever Note control this width shows: visible, 44px, carrying its word,
 * and answering a tap at its own centre -- with the OTHER arrangement's control
 * not drawn, so the two are never on screen together.
 */
export default {
	path: '/dev/quick-note/s-1?state=menu',
	label: 'Quick note: the Note control is reachable at every width, in the row or as the Menu\'s first entry, never both',
	ignoreConsole: IGNORE_FIXTURE_PHOTO,
	prepare: [
		{
			/* The Menu entry exists only once the dock has hydrated and said it is here. */
			waitFor: '() => !!document.querySelector("[data-testid=\\"quicknote-menu-item\\"]") && !!document.querySelector(".pm-trigger")',
			timeoutMs: 20000
		},
		{
			evaluate: `async () => {
				const menu = document.querySelector('.cr-header .menu-trigger');
				if (!menu || menu.getClientRects().length === 0) return 'no Menu at this width';
				for (let i = 0; i < 12 && menu.getAttribute('aria-expanded') !== 'true'; i++) {
					menu.click();
					await new Promise((r) => setTimeout(r, 200));
				}
				return 'Menu open: ' + menu.getAttribute('aria-expanded');
			}`
		}
	],
	presence: [
		{
			selector: '.cr-header [data-testid="qn-trigger"], [data-testid="quicknote-menu-item"]',
			label: 'the two Note controls in the DOM, exactly one of them drawn at this width',
			expectPresent: 2,
			maxPresent: 2,
			expectVisible: 1
		}
	],
	textContains: [
		{ selector: '[data-testid="quicknote-menu-item"]', label: 'the Menu entry carries its word', must: ['Note'] }
	],
	tapTargets: [
		{ selector: '.cr-header [data-testid="qn-trigger"], [data-testid="quicknote-menu-item"]', label: 'the Note control this width shows', min: 44 }
	],
	contrast: [
		{ selector: '.cr-header [data-testid="qn-trigger"] .qn-word, [data-testid="quicknote-menu-item"] .shell-tool-word', label: 'the word Note', min: 4.5 }
	],
	orderResult: [
		{
			label: 'exactly one Note control drawn, and it answers a tap at its own centre',
			evaluate: `() => {
				const shown = (el) => !!el && el.getClientRects().length > 0;
				const all = [document.querySelector('.cr-header [data-testid="qn-trigger"]'), document.querySelector('[data-testid="quicknote-menu-item"]')].filter(shown);
				if (all.length !== 1) return ['DRAWN ' + all.length];
				const r = all[0].getBoundingClientRect();
				const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
				return ['one drawn', hit && all[0].contains(hit) ? 'answers at its centre' : 'COVERED'];
			}`,
			expected: ['one drawn', 'answers at its centre']
		}
	]
};
