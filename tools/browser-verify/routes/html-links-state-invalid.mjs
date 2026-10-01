/* NO `order` EXPORT -- see routes.mjs. */

/**
 * THE STUDENT'S CHECK ON A LINK FIELD HOLDING WORDS (ledger 0360). The sentence
 * says what is wrong and what to paste, in words and in the warning tier's edge,
 * never colour alone and never crimson; there is no Test it key, because a key
 * whose only outcome is a dead tab must not be offered. `html-links.mjs` is the
 * positive control on the same harness.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/html-links?state=invalid',
	label: 'Link hand-ins: words in the link field are said to be not a link yet',
	widths: WIDTHS,
	prepare: [{ waitFor: `() => !!document.querySelector('[data-testid="html-links-harness"]')`, label: 'the harness has rendered' }],
	presence: [
		{ selector: '[data-testid="html-link-bad"]', label: 'the not-a-link sentence', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="html-link-ok"]', label: 'no host line', expectPresent: 0 },
		{ selector: '[data-testid="html-link-test"]', label: 'no Test it key', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="html-link-bad"]', label: 'what is wrong and what to paste', must: ['does not look like a link', 'https://'] }
	],
	contrast: [{ selector: '[data-testid="html-link-bad"]', label: 'the sentence', min: 4.5 }],
	orderResult: [
		{
			label: 'the sentence is a polite status, edged in the warning tier and not crimson',
			evaluate: `() => {
				const p = document.querySelector('[data-testid="html-link-bad"]');
				if (!p) return ['line=false'];
				const cs = getComputedStyle(p);
				const probe = document.createElement('span');
				probe.style.color = 'var(--amber)';
				p.appendChild(probe);
				const amber = getComputedStyle(probe).color;
				probe.remove();
				return ['role=' + p.getAttribute('role'), 'edgeIsAmber=' + (cs.borderLeftColor === amber), 'edgeWidth=' + cs.borderLeftWidth];
			}`,
			expected: ['role=status', 'edgeIsAmber=true', 'edgeWidth=3px']
		}
	]
};
