/**
 * A PROJECT'S SOLIDWORKS VERSION, MOVED UP IN TWO PRESSES (ledger 0404,
 * decision 41 item 7). The first press arms the key and says what changes
 * ("will not open in SolidWorks 2025") before anything is sent; picking
 * another version disarms it; the second press moves the project, and the
 * page then offers only what is above the new version. There is never a way
 * down, and the panel says why.
 */
import { ARMORY_HYDRATED, hitsSelf } from './_armory.mjs';

const NOW_TEXT = `(document.querySelector('[data-testid="armory-release-now"]')?.textContent ?? '').trim()`;
const KEY_TEXT = `(document.querySelector('[data-testid="armory-release-raise"]')?.textContent ?? '').trim()`;

export default {
	path: '/dev/armory?state=settings',
	label: 'IDEA Armory: a mentor moves a project from SolidWorks 2025 to 2026',
	prepare: [
		...ARMORY_HYDRATED,
		{ waitFor: `() => ${NOW_TEXT} === 'SolidWorks 2025'`, timeoutMs: 10000 },
		// Arm on 2027, then pick 2026: the pick disarms, so what is confirmed is what is named.
		{ click: '[data-testid="armory-release-choices"] [data-release="2027"]', until: `() => document.querySelector('[data-release="2027"]')?.getAttribute('aria-pressed') === 'true'` },
		{ click: '[data-testid="armory-release-raise"]', until: `() => ${KEY_TEXT}.includes('Press again')` },
		{ click: '[data-testid="armory-release-choices"] [data-release="2026"]', until: `() => ${KEY_TEXT} === 'Move up to SolidWorks 2026'` },
		{ click: '[data-testid="armory-release-raise"]', until: `() => ${KEY_TEXT} === 'Move to SolidWorks 2026? Press again'` },
		{ click: '[data-testid="armory-release-raise"]', until: `() => ${NOW_TEXT} === 'SolidWorks 2026'` }
	],
	orderResult: [
		{ label: 'every key in the panel answers a tap at its centre', evaluate: hitsSelf('[data-testid="armory-release"] .btn'), expected: ['every one answers itself'] },
		{ label: 'the move key is never disabled, only aria-disabled', evaluate: `() => [document.querySelector('[data-testid="armory-release-raise"]')?.disabled]`, expected: [false] }
	],
	presence: [
		{ selector: '[data-testid="armory-release"]', label: 'the SolidWorks version panel', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="armory-release-raise"]', label: 'one Move up key, now to 2027', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="armory-release"] [data-release]', label: 'one release above 2026, so no choice keys', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="armory-release-cancel"]', label: 'nothing armed after the move', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="armory-release-message"]', label: 'the move is acknowledged', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="armory-release-now"]', label: 'the project is on 2026', must: ['SolidWorks 2026'], mustNot: ['2025'] },
		{ selector: '[data-testid="armory-release-chip"]', label: 'the header says so too', must: ['SolidWorks 2026'] },
		{ selector: '[data-testid="armory-release-message"]', label: 'what changed', must: ['Moved up to SolidWorks 2026'] },
		{ selector: '[data-testid="armory-release-raise"]', label: 'only up from here', must: ['Move up to SolidWorks 2027'] },
		{ selector: '[data-testid="armory-release-cost"]', label: 'the cost of the next move, named', must: ['will not open in SolidWorks 2026'] },
		{ selector: '[data-testid="armory-release-no-down"]', label: 'why there is no way down', must: ['no way back down', 'strand'] }
	],
	tapTargets: [{ selector: '[data-testid="armory-release"] .btn', label: 'the version keys', min: 44 }],
	contrast: [
		{ selector: '[data-testid="armory-release"] :is(.ar-big, .ar-message)', label: 'the version and its sentences', min: 4.5 },
		{ selector: '[data-testid="armory-release"] .btn', label: 'the version keys', min: 4.5 }
	]
};
