import { CHOOSE_CLASS, OPEN_MANAGE, REPORT_GEOMETRY, WAIT_FOR_CLASSES } from './_coin-roster-import.mjs';

/**
 * "Import from class roster" BEFORE THE PRESS (ledger 0298, feedback R12).
 *
 * The coin desk's Students area, `manage` on the first coin section
 * ("eng1h-sophomore", seeded with two students), and the class
 * "IDEA 100 · Section 1 · Block 3" chosen from the picker. That class
 * (`/dev/coin-desk`'s fake-classes.ts) holds 27 students in no coin section,
 * one already in this one, one in another, a teacher enrolled in her own class
 * and one inactive enrollment -- so every line of the preview is on screen at
 * once.
 *
 * WHAT IS MEASURED:
 *  - THE COUNT IS ON SCREEN BEFORE THE PRESS, on the button itself;
 *  - NOTHING HAS BEEN WRITTEN: the coin roster still holds exactly its two
 *    seeded rows and there is no outcome;
 *  - THE ARCHIVED CLASS IS NOT OFFERED: the picker holds the placeholder and
 *    two classes, never three;
 *  - the picker and the button clear 44px, and the preview's words clear 4.5:1
 *    on the panel they sit on, at 375 and at 1440.
 */
export default {
	path: '/dev/coin-desk?state=roster-import',
	aliasOf: '/dev/coin-desk',
	label: 'Coin desk: import from class roster, count before the press',
	prepare: [
		...OPEN_MANAGE(),
		WAIT_FOR_CLASSES,
		CHOOSE_CLASS(
			'class-idea100-b3',
			'() => !!document.querySelector(".cd-root [data-testid=\\"cd-roster-import-go\\"]")'
		),
		REPORT_GEOMETRY
	],
	presence: [
		{ selector: '.cd-root [data-testid="cd-roster-import"]', label: 'the import block', expectPresent: 1, maxPresent: 1 },
		{ selector: '.cd-root [data-testid="cd-roster-import-go"]', label: 'the add button, carrying the count', expectPresent: 1, maxPresent: 1 },
		{
			selector: '.cd-root [data-testid="cd-roster-import-class"] option',
			label: 'placeholder + two active classes (the archived one is not offered)',
			expectPresent: 3,
			maxPresent: 3,
			/* An <option> in a CLOSED select has no box of its own, so a
			   visibility floor here would measure the browser, not the page.
			   The count is the claim. */
			expectVisible: 0
		},
		/* THE POSITIVE CONTROL for "nothing written yet": the coin roster is on
		   screen with its two seeded rows, so the absence below is not an
		   empty panel. */
		{ selector: '.cd-root .roster-rows .row', label: 'the coin roster, still its two seeded rows', expectPresent: 2, maxPresent: 2 },
		{ selector: '.cd-root [data-testid="cd-roster-import-outcome"]', label: 'no outcome before the press', expectPresent: 0 }
	],
	textContains: [
		{
			selector: '.cd-root [data-testid="cd-roster-import-go"]',
			label: 'the button says how many and from which class',
			must: ['Add 27 students from', 'Block 3']
		},
		{
			selector: '.cd-root [data-testid="cd-roster-import-plan"]',
			label: 'the preview names who is not being added, and why',
			must: [
				'1 student from this class is already in this coin section',
				'in another coin section and will stay there',
				'Diaz, Sam',
				'Not counted: 1 person who teaches the class, 1 inactive enrollment'
			],
			mustNot: ['Teacher, Mr.', 'Left, Student']
		}
	],
	contrast: [
		{ selector: '.cd-root [data-testid="cd-roster-import"] > label', label: 'the import label', min: 4.5 },
		{ selector: '.cd-root [data-testid="cd-roster-import-plan"] .note', label: 'the preview lines', min: 4.5 },
		{ selector: '.cd-root [data-testid="cd-roster-import-go"]', label: 'the add button', min: 4.5 },
		{ selector: '.cd-root [data-testid="cd-roster-import-class"]', label: 'the chosen class', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.cd-root [data-testid="cd-roster-import-class"]', label: 'the class picker', min: 44 },
		{ selector: '.cd-root [data-testid="cd-roster-import-go"]', label: 'the add button', min: 44 }
	]
};
