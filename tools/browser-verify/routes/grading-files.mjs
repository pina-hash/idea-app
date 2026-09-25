/* NO `order` EXPORT -- see routes.mjs. */

/**
 * LEDGER 0298, A6: "DOWNLOAD ALL FILES", PRESSED, AND THE ZIP READ BACK.
 *
 * Mr. Pina asked for every student file on an assignment as one download,
 * renamed by student. `tests/classroom-bulk-download.test.ts` pins the plan and
 * the zip in node; what only a browser can say is that the CONTROL the teacher
 * presses produces that zip through the console's own download helper, that
 * the count is on screen before the press, and that the button clears the tap
 * floor where it actually sits (inside the collapsed export panel, in a roster
 * column 260px wide at the narrow end).
 *
 * THE HARNESS INTERCEPTS THE DOWNLOAD and reads the produced zip back with
 * Foundry's reader, so every path below came out of the bytes, never off the
 * plan that produced them.
 */
import { WIDTHS } from './_shared.mjs';
import { OPEN_FILES_PANEL } from './_grading-files.mjs';


const T = 'Blade_CAD_01_Root_Hub';

export default {
	path: '/dev/grading-files',
	label: 'Grading console: Download all files, one zip named by student, read back',
	widths: WIDTHS,
	prepare: [
		...OPEN_FILES_PANEL,
		{
			/* A LONG GAP, because a second press while the first zip is being read
			   back would build a second one. The handler refuses a press while busy,
			   so an early retry is harmless; a late one is what the gap prevents. */
			click: '[data-testid="bulk-files-download"]',
			until: `() => document.querySelectorAll('[data-testid="zip-capture"]').length >= 1`,
			label: 'the zip was built, saved, and read back',
			attempts: 8,
			gapMs: 1500
		}
	],
	presence: [
		{ selector: '[data-testid="bulk-files"]', label: 'the file download group', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="bulk-files-download"]', label: 'one Download all files control', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="zip-capture"]', label: 'exactly one zip produced', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="bulk-files-done"]', label: 'the sentence after the save', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="bulk-files-error"]', label: 'no build failure', expectPresent: 0, maxPresent: 0 }
	],
	textContains: [
		{
			selector: '[data-testid="bulk-files-count"]',
			label: 'the count before the press, for this class',
			must: ['10 files from 4 students', 'Period 1'],
			mustNot: ['Period 3']
		},
		{
			selector: '[data-testid="bulk-files-done"]',
			label: 'the failed file is said in words, not dropped',
			must: ['Downloaded 9 of 10 files', 'index.csv lists it with the reason']
		},
		{
			selector: '[data-testid="zip-index"]',
			label: 'index.csv names the failure, the late file and the Drive row, and no address',
			must: [
				'No: The file is no longer in storage.',
				'old.pdf',
				'2026-09-20 01:30',
				'Blade Assembly.SLDASM',
				'Not on this class roster (student-1)',
				'left the class'
			],
			/* No address, and nobody from the OTHER class. A stranger's own
			   FILENAME is theirs to keep ('ghost.png' is in the index on purpose):
			   what is refused is the address it would take to name them. */
			mustNot: ['@boscotech', 'Ana Alvarez', 'Ben Okafor']
		}
	],
	orderResult: [
		{
			evaluate: `() => [...document.querySelectorAll('[data-testid="zip-path"]')].map((li) => li.textContent)`,
			expected: [
				'index.csv',
				`Kim, Dana/Kim_Dana - ${T} - hand-in - 1.txt`,
				`Perez, Jose/Perez_Jose - ${T} - bladePhoto - 1.jpg`,
				`Perez, Jose (2)/Perez_Jose - ${T} - bladePhoto - 1.heic`,
				`Reyes, Eva/Reyes_Eva - ${T} - bladePhoto - 1.JPG`,
				`Reyes, Eva/Reyes_Eva - ${T} - bladePhoto - 2.jpg`,
				`Reyes, Eva/Reyes_Eva - ${T} - hubPhoto - 1.png`,
				`Reyes, Eva/Reyes_Eva - ${T} - hand-in - 1.SLDASM`,
				`_not-on-roster/student-1/student-1 - ${T} - bladePhoto - 1.png`,
				`_not-on-roster/student-2/student-2 - ${T} - hand-in - 1.bin`
			],
			label: 'every path in the produced zip, one folder per student, the failed file absent'
		},
		{
			evaluate: `() => [...document.querySelectorAll('[data-testid="zip-capture"]')].map((c) => c.dataset.name)`,
			expected: ['blade-cad-01-root-hub-idea100-period-1-block-1-files.zip'],
			label: 'the zip is named for the assignment and the class'
		},
		{
			/* ONE ROW PER FILE THE ZIP NAMED, INCLUDED OR NOT: nine files, one
			   failure, one header. */
			evaluate: `() => [(document.querySelector('[data-testid="zip-index"]')?.textContent ?? '').trim().split(/\\r?\\n/).length]`,
			expected: [11],
			label: 'index.csv has a header and a row for each of the ten files'
		}
	],
	contrast: [
		{ selector: '[data-testid="bulk-files-count"]', label: 'the count line', min: 4.5 },
		{ selector: '[data-testid="bulk-files-note"]', label: 'a note beside it', min: 4.5 },
		{ selector: '[data-testid="bulk-files-done"]', label: 'the done sentence', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="bulk-files-download"]', label: 'Download all files', min: 44 }
	]
};
