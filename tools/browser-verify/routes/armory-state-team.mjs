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

/** A student whose name and address carry no "an", so the search below is unchanged by the role step. */
const HUGO = 'hugo.lind@boscotech.net';
const STEP_ROLES = `() => { const sel = document.querySelector('[data-email="${HUGO}"] [data-testid="armory-role-select"]'); if (!sel) return 'NO ROLE SELECT'; for (const v of ['instructor', 'cad_lead', 'mentor', 'instructor']) { sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); } return 'stepped to ' + sel.value; }`;

const ENTER = `() => { const i = document.querySelector('[data-testid="armory-people-search"]'); if (!i) return 'NO SEARCH BOX'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); return 'pressed Enter'; }`;

const TYPE = (value) => `() => { const i = document.querySelector('[data-testid="armory-people-search"]'); if (!i) return 'NO SEARCH BOX'; i.focus(); i.value = ${JSON.stringify(value)}; i.dispatchEvent(new Event('input', { bubbles: true })); return 'typed ' + i.value; }`;

export default {
	path: '/dev/armory?state=team',
	label: 'IDEA Armory: the Team view for a mentor, with the people search open',
	prepare: [
		...ARMORY_HYDRATED,
		// A ROLE MOVES ONLY ON ITS WORDED KEY. Chrome fires `change` on every
		// arrow step through a closed select, so four steps are dispatched as an
		// arrowing keyboard would: no write may land (no message), and one
		// "Change to" key must stand. Then the key is pressed and the write lands.
		{
			evaluate: STEP_ROLES,
			until: `() => document.querySelectorAll('[data-testid="armory-role-apply"]').length === 1 && !document.querySelector('[data-testid="armory-people-message"]')`
		},
		{
			click: `[data-email="${HUGO}"] [data-testid="armory-role-apply"]`,
			until: `() => (document.querySelector('[data-testid="armory-people-message"]')?.textContent ?? '').includes('Hugo Lind is now Instructor.') && document.querySelectorAll('[data-testid="armory-role-apply"]').length === 0`
		},
		{ evaluate: TYPE('a'), until: `() => !document.querySelector('[data-testid="armory-people-results"]')` },
		// AN ADD IS NEVER A ROLE CHANGE. The fresh list highlights a person who
		// is NOT a member, so Enter trays them; a press on a row marked
		// "Already a ..." trays nobody and says where a role is changed. A real
		// pick clears the sentence, so it comes second; then the list is
		// reopened for the measurements below.
		{
			evaluate: TYPE('an'),
			until: `() => document.querySelectorAll('[data-testid="armory-people-option"][aria-disabled="true"]').length > 0 && !!document.querySelector('[data-testid="armory-people-option"][aria-selected="true"]:not([aria-disabled="true"])')`
		},
		{
			evaluate: ENTER,
			until: `() => document.querySelectorAll('[data-testid="armory-people-tray"] .person-name').length === 1`
		},
		{ evaluate: TYPE('an'), until: `() => document.querySelectorAll('[data-testid="armory-people-option"]').length > 0` },
		{
			evaluate: `() => { const o = document.querySelector('[data-testid="armory-people-option"][aria-disabled="true"]'); if (!o) return 'NO MEMBER ROW'; o.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); return 'pressed a member row'; }`,
			until: `() => (document.querySelector('[data-testid="armory-picker-message"]')?.textContent ?? '').includes('is already in this project as') && document.querySelectorAll('[data-testid="armory-people-tray"] .person-name').length === 1`
		},
		{ evaluate: TYPE('an'), until: `() => document.querySelectorAll('[data-testid="armory-people-option"]').length > 0` }
	],
	orderResult: [
		{ label: 'every option answers a tap at its centre, over the rows beneath', evaluate: hitsSelf('[data-testid="armory-people-option"]'), expected: ['every one answers itself'] },
		{
			label: 'the one person in the tray is not a member of the project',
			evaluate: `() => { const tray = [...document.querySelectorAll('[data-testid="armory-people-tray"] .person-name')].map((n) => n.textContent.trim()); const members = [...document.querySelectorAll('[data-testid="armory-member"] .person-name')].map((n) => n.textContent.trim()); return [tray.length, tray.filter((t) => members.includes(t)).length, members.length]; }`,
			expected: [1, 0, 18]
		},
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
		{ selector: '[data-testid="armory-needs-update"][href="/armory/download"]', label: '"Needs the new Armory" on the computer with no version and the one on 0.2.9, and nowhere else', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="armory-people-option"]', label: 'the search answers "an" (names and the first part of addresses)', expectPresent: 10, maxPresent: 10, expectVisible: 10 },
		{ selector: '[data-testid="armory-people-member"]', label: 'the five already in the project are marked', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="armory-add-by-email-toggle"][aria-expanded="false"]', label: 'Add by email, closed', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="armory-member-checkouts"]', label: '"n checked out" links for those holding files', expectPresent: 6, maxPresent: 6, expectVisible: 6 },
		{ selector: '[data-testid="armory-role-apply"]', label: 'no role waiting once its key was pressed', expectPresent: 0, maxPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="armory-members"]', label: 'presence, never offline', must: ['Armory open', 'Armory open, syncing', 'Last heard from', 'Needs the new Armory', 'Armory 0.3.0', 'Armory 0.2.9', 'No status from this computer yet', 'No computer connected yet', 'No recent status from any of their computers', 'Not signed in to ideabosco.com yet'], mustNot: ['offline', 'Offline', 'closing'] },
		{ selector: '[data-email="sam.whitfield@boscotech.net"] [data-testid="armory-presence"]', label: 'a computer saying offline-soon reads Last heard from at once', must: ['Last heard from', 'M · Armory 0.3.0'], mustNot: ['Armory open'] },
		{ selector: '[data-testid="armory-people-results"]', label: 'an existing member, in words', must: ['Already a Student'] },
		{ selector: '[data-testid="armory-people-message"]', label: 'the one role change, written only by its key', must: ['Hugo Lind is now Instructor.'], mustNot: ['CAD lead', 'Mentor'] },
		{ selector: '[data-testid="armory-picker-message"]', label: 'a member row picks nobody, and says where a role is changed', must: ['is already in this project as', "A role changes only on that person's row in the team list."], mustNot: ['Added'] }
	],
	tapTargets: [
		{ selector: '[data-testid="armory-people-option"]', label: 'search options', min: 44 },
		{ selector: '[data-testid="armory-people-search"]', label: 'the search box', min: 44 },
		{ selector: '[data-testid="armory-member-checkouts"]', label: '"n checked out" links', min: 44 },
		{ selector: '[data-testid="armory-needs-update"]', label: '"Needs the new Armory" links', min: 44 },
		{ selector: '[data-testid="armory-remove-member"]', label: 'Remove', min: 44 },
		{ selector: '[data-testid="armory-role-select"]', label: 'role pickers', min: 44 }
	],
	contrast: [
		{ selector: '.ar-combo-name', label: 'option names', min: 4.5 },
		{ selector: '.ar-combo-email', label: 'option addresses', min: 4.5 },
		{ selector: '[data-testid="armory-people-member"]', label: 'Already a member', min: 4.5 },
		{ selector: '.ar-presence-line', label: 'presence lines', min: 4.5 },
		{ selector: '.ar-presence-version', label: 'app versions', min: 4.5 },
		{ selector: '.ar-presence-update', label: '"Needs the new Armory"', min: 4.5 },
		{ selector: '.ar-person-name', label: 'member names', min: 4.5 }
	]
};
