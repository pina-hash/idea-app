/* NO `order` EXPORT -- see routes.mjs. */

/**
 * PRESENTATION MODE (ledger 0360, Mr. Pina 2026-09-30): the class presents one
 * by one, and the teacher opens each student's link from the room's screen.
 *
 * The header key is pressed. The LINKS fixture puts three students in the
 * class: Alice's declared link opens, Cara pasted hers without its scheme (it
 * still opens; the host is what the screen reads), and Bruno typed words into
 * the link field, so he is not in the list and the sentence under it says one
 * student has no link that opens and that he typed something that is not one.
 *
 * WHAT IS MEASURED, AND AGAINST THE PROJECTOR: the dialog covers the viewport;
 * the presenter's name is wall-sized (40px and up); Open, Previous and Next
 * clear 44px; every word on it clears its floor under `PROJECTOR_MODEL`'s wash,
 * because this is the one surface in the console that is projected; no address
 * appears anywhere on it; and the queue under it is closed until asked for.
 * Next is then pressed and the second presenter is read back.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/html-assignment-grading?state=present',
	label: 'Grading console: presentation mode, one link at a time, projector-legible',
	widths: WIDTHS,
	prepare: [
		{ waitFor: `() => document.querySelectorAll('.roster-row').length === 3`, label: 'the roster has loaded (3 rows)' },
		{
			click: '[data-testid="present-open-key"]',
			until: `() => document.querySelector('[data-testid="present-dialog"]')?.open === true && !!document.querySelector('[data-testid="present-name"]')`,
			label: 'press Present links: the dialog is open on the first presenter'
		}
	],
	presence: [
		{ selector: '[data-testid="present-dialog"][open]', label: 'the dialog, open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="present-open"]', label: 'the Open key', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="present-prev"], [data-testid="present-next"]', label: 'Previous and Next', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="present-missing"]', label: 'the sentence about who is not listed', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.pl-list .pl-jump', label: 'the queue, closed until asked for', expectPresent: 2, maxPresent: 2, expectVisible: 0 }
	],
	textContains: [
		{ selector: '[data-testid="present-open-key"]', label: 'the header key says how many will present', must: ['Present links', '2'] },
		{ selector: '[data-testid="present-missing-count"]', label: 'and how many have no link', must: ['1 without a link'] },
		{ selector: '[data-testid="present-name"]', label: 'the first presenter', must: ['Alice Alvarez'] },
		{ selector: '[data-testid="present-host"]', label: 'where her link goes, by the name of the service', must: ['Google Slides'] },
		{ selector: '[data-testid="present-position"]', label: 'where in the list', must: ['1 of 2'] },
		{
			selector: '[data-testid="present-dialog"]',
			label: 'no student address anywhere on the projected screen',
			must: ['Presentations'],
			mustNot: ['@boscotech', '@']
		}
	],
	tapTargets: [
		{ selector: '[data-testid="present-open"], [data-testid="present-prev"], [data-testid="present-next"], [data-testid="present-close"]', label: 'Open, Previous, Next and Close', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="present-name"]', label: 'the presenter’s name, washed', min: 4.5, projector: true },
		{ selector: '[data-testid="present-host"]', label: 'the link’s host, washed', min: 3, projector: true },
		{ selector: '[data-testid="present-position"]', label: 'the position, washed', min: 3, projector: true },
		{ selector: '[data-testid="present-open"]', label: 'the Open key’s word, washed', min: 4.5, projector: true },
		{ selector: '[data-testid="present-next"]', label: 'Next, washed', min: 4.5, projector: true },
		{ selector: '[data-testid="present-missing"]', label: 'the not-listed sentence, washed', min: 3, projector: true }
	],
	orderResult: [
		{
			label: 'the dialog covers the viewport and the name is wall-sized',
			evaluate: `() => {
				const d = document.querySelector('[data-testid="present-dialog"]');
				const n = document.querySelector('[data-testid="present-name"]');
				if (!d || !n) return ['dialog=false'];
				const b = d.getBoundingClientRect();
				const covers = b.left <= 0.5 && b.top <= 0.5 && b.right >= window.innerWidth - 0.5 && b.bottom >= window.innerHeight - 0.5;
				return ['coversViewport=' + covers, 'name40pxOrMore=' + (parseFloat(getComputedStyle(n).fontSize) >= 40)];
			}`,
			expected: ['coversViewport=true', 'name40pxOrMore=true']
		},
		{
			label: 'Open goes to her link in a new tab, with no opener',
			evaluate: `() => { const a = document.querySelector('[data-testid="present-open"]'); return [a?.getAttribute('href') ?? 'none', a?.getAttribute('target') ?? 'none', a?.getAttribute('rel') ?? 'none']; }`,
			expected: ['https://docs.google.com/presentation/d/alice-deck/edit?usp=sharing', '_blank', 'noopener noreferrer']
		},
		{
			/* NEXT, PRESSED: the second presenter, whose link had no scheme and
			   still opens. Read last, so every reading above is of the first. */
			label: 'Next moves to Cara, whose link opens though she pasted it without https',
			evaluate: `async () => {
				document.querySelector('[data-testid="present-next"]')?.click();
				for (let i = 0; i < 20 && !/Cara/.test(document.querySelector('[data-testid="present-name"]')?.textContent || ''); i++) await new Promise((r) => setTimeout(r, 100));
				return [
					document.querySelector('[data-testid="present-name"]')?.textContent.trim() ?? 'none',
					document.querySelector('[data-testid="present-position"]')?.textContent.trim() ?? 'none',
					document.querySelector('[data-testid="present-open"]')?.getAttribute('href') ?? 'none',
					'nextAtEnd=' + document.querySelector('[data-testid="present-next"]')?.getAttribute('aria-disabled')
				];
			}`,
			expected: ['Cara Chen', '2 of 2', 'https://canva.com/design/cara-deck/view', 'nextAtEnd=true']
		}
	]
};
