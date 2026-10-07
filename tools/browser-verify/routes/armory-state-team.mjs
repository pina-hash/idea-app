/**
 * THE TEAM VIEW, FOR A MENTOR (Mr. Pina's report of 2026-10-07: "select
 * students with accounts on the IDEA website ... linked to the IDEA website as
 * users"; and Armory v0.3 item 5, who has Armory open). Eighteen members with
 * a picture each and their chosen name; every presence the page can say, and
 * never "offline"; the people search opening a list after two letters, each
 * option 44px or more, an existing member marked as one, and the list painted
 * over the rows beneath it (a hit test at an option answers the option).
 */
import { ARMORY_HYDRATED, hitsSelf } from './_armory.mjs';

const TYPE = (value) => `() => { const i = document.querySelector('[data-testid="armory-people-search"]'); if (!i) return 'NO SEARCH BOX'; i.focus(); i.value = ${JSON.stringify(value)}; i.dispatchEvent(new Event('input', { bubbles: true })); return 'typed ' + i.value; }`;

export default {
	path: '/dev/armory?state=team',
	label: 'IDEA Armory: the Team view for a mentor, with the people search open',
	prepare: [
		...ARMORY_HYDRATED,
		{ evaluate: TYPE('a'), until: `() => !document.querySelector('[data-testid="armory-people-results"]')` },
		{ evaluate: TYPE('an'), until: `() => document.querySelectorAll('[data-testid="armory-people-option"]').length > 0` }
	],
	orderResult: [
		{ label: 'every option answers a tap at its centre, over the rows beneath', evaluate: hitsSelf('[data-testid="armory-people-option"]'), expected: ['every one answers itself'] },
		{
			label: 'the list is the combobox\'s, by id',
			evaluate: `() => { const i = document.querySelector('[data-testid="armory-people-search"]'); const l = document.querySelector('[data-testid="armory-people-results"]'); return [i?.getAttribute('aria-expanded'), !!l && i?.getAttribute('aria-controls') === l.id]; }`,
			expected: ['true', true]
		}
	],
	presence: [
		{ selector: '[data-testid="armory-member"]', label: 'eighteen members', expectPresent: 18, maxPresent: 18, expectVisible: 18 },
		{ selector: '[data-testid="armory-member"] .avatar', label: 'a picture for each', expectPresent: 18, maxPresent: 18, expectVisible: 18 },
		{ selector: '[data-testid="armory-member"] .person-name', label: 'a name for each', expectPresent: 18, maxPresent: 18, expectVisible: 18 },
		{ selector: '[data-testid="armory-member"] .pathway-chip', label: 'pathway chips where there is a pathway', expectPresent: 16, maxPresent: 16, expectVisible: 16 },
		{ selector: '[data-testid="armory-presence"] [data-tone="open"]', label: 'computers with Armory open', expectPresent: 6, maxPresent: 6, expectVisible: 6 },
		{ selector: '[data-testid="armory-people-option"]', label: 'the search answers "an" (names and the first part of addresses)', expectPresent: 10, maxPresent: 10, expectVisible: 10 },
		{ selector: '[data-testid="armory-people-member"]', label: 'the five already in the project are marked', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="armory-add-by-email-toggle"][aria-expanded="false"]', label: 'Add by email, closed', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="armory-member-checkouts"]', label: '"n checked out" links for those holding files', expectPresent: 6, maxPresent: 6, expectVisible: 6 }
	],
	textContains: [
		{ selector: '[data-testid="armory-members"]', label: 'presence, never offline', must: ['Armory open', 'Armory open, syncing', 'Last heard from', 'No status from this computer yet', 'No computer connected yet', 'No recent status from any of their computers', 'Not signed in to ideabosco.com yet'], mustNot: ['offline', 'Offline'] },
		{ selector: '[data-testid="armory-people-results"]', label: 'an existing member, in words', must: ['Already a Student'] }
	],
	tapTargets: [
		{ selector: '[data-testid="armory-people-option"]', label: 'search options', min: 44 },
		{ selector: '[data-testid="armory-people-search"]', label: 'the search box', min: 44 },
		{ selector: '[data-testid="armory-member-checkouts"]', label: '"n checked out" links', min: 44 },
		{ selector: '[data-testid="armory-remove-member"]', label: 'Remove', min: 44 },
		{ selector: '[data-testid="armory-role-select"]', label: 'role pickers', min: 44 }
	],
	contrast: [
		{ selector: '.ar-combo-name', label: 'option names', min: 4.5 },
		{ selector: '.ar-combo-email', label: 'option addresses', min: 4.5 },
		{ selector: '[data-testid="armory-people-member"]', label: 'Already a member', min: 4.5 },
		{ selector: '.ar-presence-line', label: 'presence lines', min: 4.5 },
		{ selector: '.ar-person-name', label: 'member names', min: 4.5 }
	]
};
