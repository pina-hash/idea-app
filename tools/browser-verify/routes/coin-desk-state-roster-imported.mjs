import { CHOOSE_CLASS, OPEN_MANAGE, WAIT_FOR_CLASSES } from './_coin-roster-import.mjs';

/**
 * "Import from class roster" AFTER THE PRESS (ledger 0298, feedback R12).
 *
 * The same state `coin-desk-state-roster-import` measures, then the add button
 * pressed. The write goes through the fake ledger's copy of 0073's
 * `coin_admin_assign_section_students`, which (like the real one) MOVES a
 * student it is handed, so the placement probe below is a real check that the
 * import sent nobody who already had a coin section.
 *
 * WHAT IS MEASURED:
 *  - the outcome says how many were added, and names who was already here and
 *    who was left in their own coin section;
 *  - THE WRITE LANDED: the coin roster grew from 2 rows to 29, and the section
 *    list's own counts moved with it;
 *  - NOBODY MOVED: "period-3-makeup" still holds its one student (Sam Diaz,
 *    who is also on the class roster), and the other two sections are
 *    untouched.
 */
export default {
	path: '/dev/coin-desk?state=roster-imported',
	aliasOf: '/dev/coin-desk',
	label: 'Coin desk: import from class roster, the outcome after the press',
	prepare: [
		...OPEN_MANAGE(),
		WAIT_FOR_CLASSES,
		CHOOSE_CLASS(
			'class-idea100-b3',
			'() => !!document.querySelector(".cd-root [data-testid=\\"cd-roster-import-go\\"]")'
		),
		{
			click: '.cd-root [data-testid="cd-roster-import-go"]',
			until: '() => !!document.querySelector(".cd-root [data-testid=\\"cd-roster-import-outcome\\"]")',
			attempts: 1,
			waitMs: 400
		}
	],
	presence: [
		{ selector: '.cd-root [data-testid="cd-roster-import-outcome"]', label: 'the outcome', expectPresent: 1, maxPresent: 1 },
		{ selector: '.cd-root [data-testid="cd-roster-import-go"]', label: 'no second add button after the write', expectPresent: 0 },
		{ selector: '.cd-root .roster-rows .row', label: 'the coin roster, 2 seeded + 27 imported', expectPresent: 29, maxPresent: 29 }
	],
	textContains: [
		{
			selector: '.cd-root [data-testid="cd-roster-import-outcome"]',
			label: 'the outcome, including who was already here',
			must: [
				'Added 27 students from IDEA 100',
				'1 student was already in this coin section',
				'Left in their own coin section: Diaz, Sam',
				'Not counted: 1 person who teaches the class, 1 inactive enrollment'
			]
		}
	],
	contrast: [
		{ selector: '.cd-root [data-testid="cd-roster-import-outcome"] .feedback.ok', label: 'the added line', min: 4.5 },
		{ selector: '.cd-root [data-testid="cd-roster-import-outcome"] .note', label: 'the outcome notes', min: 4.5 }
	],
	orderResult: [
		{
			label: 'every coin section count after the import: only this one moved',
			/* Seeded: eng1h-sophomore 2, full-class-demo 44, period-3-makeup 1,
			   role-ratio-demo 10. An import that moved Sam Diaz would read
			   30 / 44 / 0 / 10. */
			evaluate:
				'() => [...document.querySelectorAll(".cd-root .section-manager .section-row .since")].map((e) => e.textContent.trim().split(" ").slice(0, 2).join(" "))',
			expected: ['29 students', '44 students', '1 student', '10 students']
		}
	]
};
