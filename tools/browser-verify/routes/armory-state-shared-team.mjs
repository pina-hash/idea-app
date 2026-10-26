/**
 * ONE LAB COMPUTER, ONE LINE (ledger 0441): the Team view of a lab where four
 * people sign in on one IDEA-06, Ben works on a second computer imaged alike
 * and also named IDEA-06, and two computers are still on Armory 0.5.0. Below
 * the people, the Computers list: five lines, the shared computer's naming
 * its four people most recent first, the two IDEA-06 lines told apart by the
 * server's per-computer token. Measured at both widths: the lines, the names
 * on each, and that no line names a person twice.
 */
import { ARMORY_HYDRATED, DOC_HEIGHT } from './_armory.mjs';

const LINES = `() => [...document.querySelectorAll('[data-testid="armory-computer"]')].map((li) => li.querySelector('[data-testid="armory-computer-name"]').textContent.trim() + ' = ' + li.dataset.people)`;

export default {
	path: '/dev/armory?state=shared-team',
	label: 'IDEA Armory: the Team view of a shared lab computer, one line per computer',
	prepare: [
		...ARMORY_HYDRATED,
		{ evaluate: DOC_HEIGHT },
		{ evaluate: LINES },
		{ evaluate: `() => { const l = document.querySelector('[data-testid="armory-computer"]'); const b = l.getBoundingClientRect(); const p = l.querySelector('[data-testid="armory-computer-people"]').getBoundingClientRect(); return 'first line ' + Math.round(b.width) + 'x' + Math.round(b.height) + ', people at x ' + Math.round(p.left - b.left) + ' y ' + Math.round(p.top - b.top); }` }
	],
	orderResult: [
		{
			label: 'five computers: the shared IDEA-06 used by four, its clone by one, three more by one each',
			evaluate: LINES,
			expected: ['IDEA-06 (3fa1) = 4', 'IDEA-06 (b2c4) = 1', 'Room 214 desk = 1', 'Lab PC 7 = 1', 'Ana laptop = 1']
		},
		{
			label: 'the shared computer names its people, the one heard from last first',
			evaluate: `() => [document.querySelector('[data-testid="armory-computer"] [data-testid="armory-computer-people"]').textContent.trim()]`,
			expected: ['Used by 4 people: Ana Reyes, Diego Marin, Priya Natarajan, Sam Whitfield']
		},
		{
			label: 'no computer line names a person twice',
			evaluate: `() => { const bad = [...document.querySelectorAll('[data-testid="armory-computer-people"]')].filter((p) => { const names = p.textContent.replace(/^Used by( \\d+ people:)? /, '').split(', '); return new Set(names).size !== names.length; }); return [bad.length]; }`,
			expected: [0]
		},
		{
			label: "each member's own list folds the shared computer too: Ana reads one IDEA-06, not two",
			evaluate: `() => [[...document.querySelectorAll('[data-email="ana.reyes@boscotech.net"] [data-testid="armory-device-name"]')].map((n) => n.textContent.trim()).join(' | ')]`,
			expected: ['IDEA-06 (3fa1) | Ana laptop']
		}
	],
	presence: [
		{ selector: '[data-testid="armory-computers"]', label: 'the Computers list', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="armory-computer"]', label: 'one line per computer', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="armory-computer"][data-tone="open"]', label: 'two with Armory open (the shared one and the clone; the desk was heard 4 minutes ago)', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="armory-member"]', label: 'seven people above it', expectPresent: 7, maxPresent: 7, expectVisible: 7 }
	],
	textContains: [
		{ selector: '[data-testid="armory-computers"]', label: 'presence words, never offline', must: ['Armory open', 'Armory open, syncing', 'Last heard from', 'Armory 0.5.1', 'Armory 0.5.0'], mustNot: ['offline', 'Offline'] }
	],
	contrast: [
		{ selector: '.ar-computer .ar-presence-line', label: 'computer lines', min: 4.5 },
		{ selector: '.ar-computer-people', label: 'who used each computer', min: 4.5 }
	]
};
