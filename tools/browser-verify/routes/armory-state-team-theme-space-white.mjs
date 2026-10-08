/**
 * THE TEAM VIEW UNDER SPACE WHITE. The presence lines carry tone inks (open,
 * last heard from, no status) and the people search's list is drawn over the
 * rows beneath it; both were measured on the dark grounds first, so they are
 * re-measured here on Space White's well, with the list open.
 */
import { ARMORY_HYDRATED, hitsSelf } from './_armory.mjs';

const TYPE = (value) => `() => { const i = document.querySelector('[data-testid="armory-people-search"]'); if (!i) return 'NO SEARCH BOX'; i.focus(); i.value = ${JSON.stringify(value)}; i.dispatchEvent(new Event('input', { bubbles: true })); return 'typed ' + i.value; }`;

export default {
	path: '/dev/armory?state=team&theme=space-white',
	label: 'IDEA Armory: the Team view under Space White, with the people search open',
	prepare: [
		...ARMORY_HYDRATED,
		{ waitFor: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`, timeoutMs: 10000 },
		{ evaluate: TYPE('an'), until: `() => document.querySelectorAll('[data-testid="armory-people-option"]').length > 0` }
	],
	orderResult: [
		{ label: 'every option answers a tap at its centre, over the rows beneath', evaluate: hitsSelf('[data-testid="armory-people-option"]'), expected: ['every one answers itself'] }
	],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="armory-member"]', label: 'eighteen members', expectPresent: 18, maxPresent: 18, expectVisible: 18 },
		{ selector: '[data-testid="armory-presence"] [data-tone="open"]', label: 'computers with Armory open', expectPresent: 6, maxPresent: 6, expectVisible: 6 },
		{ selector: '[data-testid="armory-people-option"]', label: 'the search list is open', expectPresent: 10, maxPresent: 10, expectVisible: 10 }
	],
	textContains: [{ selector: '[data-testid="armory-members"]', label: 'presence, never offline', must: ['Armory open', 'Last heard from'], mustNot: ['offline', 'Offline'] }],
	contrast: [
		{ selector: '.ar-presence-line[data-tone="open"]', label: 'Armory open lines', min: 4.5 },
		{ selector: '.ar-presence-line[data-tone="heard"]', label: 'last heard from lines', min: 4.5 },
		{ selector: '.ar-presence-line[data-tone="none"], .ar-presence-unknown', label: 'no status lines', min: 4.5 },
		{ selector: '.ar-person-name', label: 'member names', min: 4.5 },
		{ selector: '.ar-member-email', label: 'member addresses', min: 4.5 },
		{ selector: '[data-testid="armory-member"] .ar-readout', label: 'role and account chips', min: 4.5 },
		{ selector: ':is(.ar-combo-name, .ar-combo-email)', label: 'search options', min: 4.5 },
		{ selector: '[data-testid="armory-people-member"]', label: 'Already a member', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="armory-people-option"]', label: 'search options', min: 44 },
		{ selector: '[data-testid="armory-member-checkouts"]', label: '"n checked out" links', min: 44 },
		{ selector: '[data-testid="armory-remove-member"]', label: 'Remove', min: 44 }
	]
};
