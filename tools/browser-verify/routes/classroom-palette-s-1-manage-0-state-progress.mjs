/**
 * THE CLASS PAGE'S OWN WORD FOR MISSING, AND EACH UNIT'S PROGRESS, as a
 * student (ledger 0297).
 *
 * F3+F5 reported the defect this state pins: the assignment past its due time
 * with nothing turned in was listed by the Missing filter while its row chip
 * read "Not started". The chip now asks the filter's own predicate, so the
 * same row reads "Missing", in its own tone, with a mark beside the word --
 * and it is the ONLY row that does: the deadline later tonight still reads
 * "In progress" (the positive control that the chip did not simply turn every
 * open row amber).
 *
 * Each unit heading carries "N of M done" over its assignments, counted by
 * the same predicate over the whole unit: Unit 1 has one returned of two,
 * Unit 2 one turned in of three, Unit 3 none of one.
 * `classroom-palette-s-1-manage-1-state-progress` is the teacher's side,
 * where neither appears.
 */
import { READY, STUDENT } from './_classroom-palette.mjs';

export default {
	path: `${STUDENT}&state=progress`,
	aliasOf: STUDENT,
	label: 'Class page (student): the Missing chip and unit progress',
	prepare: [READY],
	orderResult: [
		{
			label: "each assignment's chip, in the teacher's order",
			evaluate: `() => [...document.querySelectorAll('[data-item-id]')]
				.filter((row) => row.querySelector('[data-testid="work-status"]'))
				.map((row) => row.getAttribute('data-item-id') + ' ' + row.querySelector('[data-testid="work-status"]').textContent.replace(/\\s+/g, ' ').trim())`,
			expected: [
				'i-returned Returned · 9/10',
				'i-undated Not started',
				'i-missing Missing',
				'i-tonight In progress',
				'i-turned-in Submitted',
				'i-beam Not started'
			]
		},
		{
			label: 'each unit says how much of it is done',
			evaluate: `() => [...document.querySelectorAll('[data-testid="unit-progress"]')].map((p) => p.closest('[data-testid="unit-group"]').getAttribute('data-group-id') + ' ' + p.textContent.replace(/\\s+/g, ' ').trim())`,
			expected: ['u-1 1 of 2 done', 'u-2 1 of 3 done', 'u-3 0 of 1 done']
		}
	],
	presence: [
		{ selector: '[data-testid="work-status"][data-missing="true"]', label: 'one row reads Missing', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="work-status"][data-missing="true"] .chip-mark', label: 'with a mark beside the word', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="work-status"] .chip-mark', label: 'marks: the missing row and the two finished ones', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="unit-progress"]', label: 'progress on the three units with assignments', expectPresent: 3, maxPresent: 3, expectVisible: 3 }
	],
	contrast: [
		{ selector: '[data-testid="work-status"][data-missing="true"]', label: 'Missing chip', min: 4.5 },
		{ selector: '[data-testid="unit-progress"]', label: 'unit progress', min: 4.5 }
	]
};
