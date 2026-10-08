/**
 * DELETE FOREVER (Armory v0.3 item 3), for a site admin on an archived
 * project. The cost is said in real counts before the box, and the key is
 * `aria-disabled` (never `disabled`, so it can explain itself) until the name
 * is typed exactly: both directions, empty, wrong, then right.
 */
import { ARMORY_HYDRATED } from './_armory.mjs';

const TYPE = (value) => `() => { const i = document.querySelector('[data-testid="armory-purge-name"]'); if (!i) return 'NO BOX'; i.focus(); i.value = ${JSON.stringify(value)}; i.dispatchEvent(new Event('input', { bubbles: true })); return 'typed ' + JSON.stringify(i.value); }`;
const KEY = `document.querySelector('[data-testid="armory-purge-key"]')?.getAttribute('aria-disabled')`;

export default {
	path: '/dev/armory?state=purge',
	label: 'IDEA Armory: Delete forever on an archived project, for a site admin',
	prepare: [
		...ARMORY_HYDRATED,
		{ waitFor: `() => /212 files/.test(document.querySelector('[data-testid="armory-purge-cost"]')?.textContent ?? '')`, timeoutMs: 10000 },
		{ evaluate: `() => 'empty box: aria-disabled=' + ${KEY}`, until: `() => ${KEY} === 'true'` },
		{ evaluate: TYPE('Robot 2024'), until: `() => ${KEY} === 'true'` },
		{ evaluate: TYPE('robot 2025'), until: `() => ${KEY} === 'true'` },
		{ evaluate: TYPE('  Robot 2025 '), until: `() => ${KEY} === 'false'` }
	],
	orderResult: [
		{
			label: 'the key is never disabled, only aria-disabled',
			evaluate: `() => [document.querySelector('[data-testid="armory-purge-key"]')?.disabled]`,
			expected: [false]
		}
	],
	presence: [
		{ selector: '[data-testid="armory-purge"]', label: 'Delete forever is offered', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="armory-purge-key"][aria-disabled="false"]', label: 'the exact name arms it', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="armory-tab-project"][aria-current="page"]', label: 'on the Project view', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="armory-archived-notice"]', label: 'the archived notice', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="armory-purge-cost"]', label: 'the cost in real counts, before the box', must: ['212 files (14 already removed)', '1,604 versions', '37 side versions', '2 checkouts are released', '3.00 GB', 'cannot be undone'] },
		{ selector: '[data-testid="armory-purge-key"]', label: 'the key names the project', must: ['Delete Robot 2025 forever'] },
		{ selector: '[data-testid="armory-purge-computers"]', label: 'what happens on the computers: moved as each connects, never erased', must: ['Nothing is erased', 'next time that computer connects', 'hidden recovery folder', 'once it is closed'], mustNot: ['instant', 'immediately'] }
	],
	tapTargets: [
		{ selector: '[data-testid="armory-purge"] :is(input, button)', label: 'the box and the key', min: 44 },
		{ selector: '[data-testid="armory-project-settings"] .btn', label: 'every Project key', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="armory-purge-cost"]', label: 'the cost sentence', min: 4.5 },
		{ selector: '[data-testid="armory-purge-computers"]', label: 'the computers sentence', min: 4.5 },
		{ selector: '[data-testid="armory-purge"] .ar-field > span', label: 'the box label', min: 4.5 }
	]
};
